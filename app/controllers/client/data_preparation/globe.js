var winston = require('winston');
var fs = require('fs');
var Batch = require('batch');
var _ = require('lodash');
//
var importedDataPreparation = require('../../../libs/datasources/imported_data_preparation');
var datatypes = require('../../../libs/datasources/datatypes');
var raw_source_documents = require('../../../models/raw_source_documents');
var processed_row_objects = require('../../../models/processed_row_objects');
var config = require('../config');
var func = require('../func');
var User = require('../../../models/users');

// Prepare country geo data cache
var __countries_geo_json_str = fs.readFileSync(__dirname + '/../../../../public/data/world.geo.json/countries.geo.json', 'utf8');
var __countries_geo_json = JSON.parse(__countries_geo_json_str);
var cache_countryGeometryByLowerCasedCountryName = {};
var numCountries = __countries_geo_json.features.length;
for (var i = 0; i < numCountries; i++) {
    var countryFeature = __countries_geo_json.features[i];
    var countryName = countryFeature.properties.name;
    var geometry = countryFeature.geometry;
    cache_countryGeometryByLowerCasedCountryName[countryName.toLowerCase()] = geometry;
}
// winston.info("💬  Cached " + Object.keys(cache_countryGeometryByLowerCasedCountryName).length + " geometries by country name.");

__countries_geo_json_str = undefined; // free
__countries_geo_json = undefined; // free

module.exports.BindData = function (req, urlQuery, callback) {
    var self = this;
    // urlQuery keys:
    // source_key
    // mapBy
    // aggregateby
    // searchQ
    // searchCol
    // embed
    // Other filters
    var source_pKey = urlQuery.source_key;
    var collectionPKey = req.subdomains[0] + '-' + source_pKey;

    importedDataPreparation.DataSourceDescriptionWithPKey(collectionPKey)
        .then(function (dataSourceDescription) {
            if (dataSourceDescription == null || typeof dataSourceDescription === 'undefined') {
                callback(new Error("No data source with that source pkey " + source_pKey), null);

                return;
            }
            if (typeof dataSourceDescription.fe_views !== 'undefined' && dataSourceDescription.fe_views.views != null && typeof dataSourceDescription.fe_views.views.map === 'undefined') {
                callback(new Error('View doesn\'t exist for dataset. UID? urlQuery: ' + JSON.stringify(urlQuery, null, '\t')), null);

                return;
            }


            var processedRowObjects_mongooseContext = processed_row_objects.Lazy_Shared_ProcessedRowObject_MongooseContext(dataSourceDescription._id);
            var processedRowObjects_mongooseModel = processedRowObjects_mongooseContext.Model;
            //
            var mapBy = urlQuery.mapBy; // the human readable col name - real col name derived below
            var defaultMapByColumnName_humanReadable = dataSourceDescription.fe_displayTitleOverrides[dataSourceDescription.fe_views.views.map.defaultMapByColumnName] ||
            dataSourceDescription.fe_views.views.map.defaultMapByColumnName;
            //
            var routePath_base = "/" + source_pKey + "/map";
            var sourceDocURL = dataSourceDescription.urls ? dataSourceDescription.urls.length > 0 ? dataSourceDescription.urls[0] : null : null;
            if (urlQuery.embed == 'true') routePath_base += '?embed=true';
            //
            var truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill = func.new_truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill(dataSourceDescription);
            //

            var filterObj = func.filterObjFromQueryParams(urlQuery);
            var isFilterActive = Object.keys(filterObj).length != 0;
            //
            var searchCol = urlQuery.searchCol;
            var searchQ = urlQuery.searchQ;
            var isSearchActive = typeof searchCol !== 'undefined' && searchCol != null && searchCol != "" // Not only a column
                && typeof searchQ !== 'undefined' && searchQ != null && searchQ != "";  // but a search query


           
            var aggregateBy = urlQuery.aggregateBy;
            var defaultAggregateByColumnName_humanReadable = dataSourceDescription.fe_displayTitleOverrides[dataSourceDescription.fe_views.views.map.defaultAggregateByColumnName] ||
            dataSourceDescription.fe_views.views.map.defaultAggregateByColumnName ;


         

            // Aggregate By Available
            var aggregateBy_humanReadable_available = undefined;

            var raw_rowObjects_coercionSchema = dataSourceDescription.raw_rowObjects_coercionScheme;


            for (var colName in raw_rowObjects_coercionSchema) {
                var colValue = raw_rowObjects_coercionSchema[colName];
                if (colValue.operation == "ToInteger") {


                    var isExcluded = dataSourceDescription.fe_excludeFields && dataSourceDescription.fe_excludeFields[colName];
                    if (!isExcluded) {
                        var humanReadableColumnName = colName;
                        if (dataSourceDescription.fe_displayTitleOverrides && dataSourceDescription.fe_displayTitleOverrides[colName])
                            humanReadableColumnName = dataSourceDescription.fe_displayTitleOverrides[colName];

                        if (!aggregateBy_humanReadable_available) {
                            aggregateBy_humanReadable_available = [];
                            aggregateBy_humanReadable_available.push(config.aggregateByDefaultColumnName); // Add the default - aggregate by number of records.
                        }



                        aggregateBy_humanReadable_available.push(humanReadableColumnName);
                    }
                }
            }

            


            if (aggregateBy_humanReadable_available) {
                if (aggregateBy_humanReadable_available.length == 1)
                    aggregateBy_humanReadable_available = undefined;
            }

            var aggregateBy_realColumnName = aggregateBy? importedDataPreparation.RealColumnNameFromHumanReadableColumnName(aggregateBy,dataSourceDescription) :
            (typeof dataSourceDescription.fe_views.views.map.defaultAggregateByColumnName  == 'undefined') ?importedDataPreparation.RealColumnNameFromHumanReadableColumnName(defaultAggregateByColumnName_humanReadable,dataSourceDescription) :
            dataSourceDescription.fe_views.views.map.defaultAggregateByColumnName;



           

            var sourceDoc, sampleDoc, uniqueFieldValuesByFieldName;

            var batch = new Batch();
            batch.concurrency(1);

            // Obtain source document
            batch.push(function (done) {
                raw_source_documents.Model.findOne({primaryKey: dataSourceDescription._id}, function (err, _sourceDoc) {
                    if (err) return done(err);

                    sourceDoc = _sourceDoc;
                    done();
                });
            });


            // Obtain sample document
            batch.push(function (done) {
                processedRowObjects_mongooseModel.findOne({}, function (err, _sampleDoc) {
                    if (err) return done(err);

                    sampleDoc = _sampleDoc;
                    done();
                });
            });

            // Obtain Top Unique Field Values For Filtering
            batch.push(function (done) {
                func.topUniqueFieldValuesForFiltering(dataSourceDescription, function (err, _uniqueFieldValuesByFieldName) {
                    if (err) return done(err);

                    uniqueFieldValuesByFieldName = _uniqueFieldValuesByFieldName;
                    done();
                });
            });

            batch.push(function(done) {
                var aggregationOperators = [];

                if (isSearchActive) {
                    var _orErrDesc = func.activeSearch_matchOp_orErrDescription(dataSourceDescription, searchCol, searchQ);
                    if (_orErrDesc.err) return done(_orErrDesc.err);

                    aggregationOperators = aggregationOperators.concat(_orErrDesc.matchOps);
                }
                if (isFilterActive) { // rules out undefined filterCol
                    var _orErrDesc = func.activeFilter_matchOp_orErrDescription_fromMultiFilter(dataSourceDescription, filterObj);
                    if (_orErrDesc.err) return done(_orErrDesc.err);

                    aggregationOperators = aggregationOperators.concat(_orErrDesc.matchOps);
                }

                var doneFn = function(err, _coordDocs) {
                    if (err) return done(err);

                    // format retrieved globe data needed in view here
                    done();
                }
                // Update query to reflect what is needed in globe view
                processedRowObjects_mongooseModel.find({}).exec(doneFn);
            });
            

            var user = null;
            batch.push(function(done) {
                if (req.user) {
                    User.findById(req.user, function(err, doc) {
                        if (err) return done(err);
                        user = doc;
                        done();
                    })
                } else {
                    done();
                }
            });

            batch.end(function (err) {
                if (err) return callback(err);

                //


                var data =
                {
                    env: process.env,

                    user: user,
          

                    arrayTitle: dataSourceDescription.title,
                    array_source_key: source_pKey,
                    team: dataSourceDescription._team ? dataSourceDescription._team : null,
                    brandColor: dataSourceDescription.brandColor,
                    brandContentColor: func.calcContentColor(dataSourceDescription.brandColor),
                    sourceDoc: sourceDoc,
                    sourceDocURL: sourceDocURL,
                    view_visibility: dataSourceDescription.fe_views.views ? dataSourceDescription.fe_views.views : {},
                    view_description: dataSourceDescription.fe_views.views.map.description ? dataSourceDescription.fe_views.views.map.description : "",
                    //
                    displayTitleOverrides: dataSourceDescription.fe_displayTitleOverrides,
                    //
                    filterObj: filterObj,
                    isFilterActive: isFilterActive,
                    uniqueFieldValuesByFieldName: uniqueFieldValuesByFieldName,
                    truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill: truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill,
                    //
                    searchQ: searchQ,
                    searchCol: searchCol,
                    isSearchActive: isSearchActive,
                    //
                    defaultMapByColumnName_humanReadable: defaultMapByColumnName_humanReadable,
                    colNames_orderedForMapByDropdown: importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject_orderedForDropdown(sampleDoc, dataSourceDescription, 'map', 'MapBy'),
                    colNames_orderedForSortByDropdown: importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject_orderedForSortByDropdown(sampleDoc, dataSourceDescription),
                    //
                    routePath_base: routePath_base,
                    // multiselectable filter fields
                    multiselectableFilterFields: dataSourceDescription.fe_filters.fieldsMultiSelectable,

                    aggregateBy_humanReadable_available: aggregateBy_humanReadable_available,
                    defaultAggregateByColumnName_humanReadable: defaultAggregateByColumnName_humanReadable,
                    aggregateBy: aggregateBy

                };
                callback(err, data);
            });


        })


};