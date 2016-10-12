var winston = require('winston');
var moment = require('moment');
var Batch = require('batch');
//
var importedDataPreparation = require('../../../datasources/utils/imported_data_preparation');
var import_datatypes = require('../../../datasources/utils/import_datatypes');
var raw_source_documents = require('../../../models/raw_source_documents');
var processed_row_objects = require('../../../models/processed_row_objects');
var config = require('../config');
var func = require('../func');
//
module.exports.BindData = function (req, urlQuery, callback) {
    var self = this;
    // urlQuery keys:
    // source_key
    // groupBy
    // searchQ
    // searchCol
    // embed
    // Other filters
    var source_pKey = urlQuery.source_key;
    var dataSourceDescription = importedDataPreparation.DataSourceDescriptionWithPKey(source_pKey);
    if (dataSourceDescription == null || typeof dataSourceDescription === 'undefined') {
        callback(new Error("No data source with that source pkey " + source_pKey), null);

        return;
    }

    var team = importedDataPreparation.TeamDescription(dataSourceDescription.team_id);

    if (typeof dataSourceDescription.fe_views !== 'undefined' && dataSourceDescription.fe_views.timeline != true) {
        callback(new Error('View doesn\'t exist for dataset. UID? urlQuery: ' + JSON.stringify(urlQuery, null, '\t')), null);

        return;
    }
    var fe_visible = dataSourceDescription.fe_visible;
    if (typeof fe_visible !== 'undefined' && fe_visible != null && fe_visible === false) {
        callback(new Error("That data source was set to be not visible: " + source_pKey), null);

        return;
    }
    var processedRowObjects_mongooseContext = processed_row_objects.Lazy_Shared_ProcessedRowObject_MongooseContext(source_pKey);
    var processedRowObjects_mongooseModel = processedRowObjects_mongooseContext.Model;
    //
    var page = urlQuery.page;
    var pageNumber = page ? page : 1;
    var skipNResults = config.timelineGroups * (Math.max(pageNumber, 1) - 1);
    var limitToNResults = config.timelineGroups;
    //
    var groupBy = urlQuery.groupBy; // the human readable col name - real col name derived below
    var defaultGroupByColumnName_humanReadable = dataSourceDescription.fe_timeline_defaultGroupByColumnName_humanReadable;
    var groupBy_realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(groupBy ? groupBy : defaultGroupByColumnName_humanReadable, dataSourceDescription);
    var groupedResultsLimit = config.timelineGroupSize;
    var groupsLimit = config.timelineGroups;
    var groupByDateFormat;
    //
    var sortBy = urlQuery.sortBy; // the human readable col name - real col name derived below
    var sortDir = urlQuery.sortDir;
    var sortDirection = sortDir ? sortDir == 'Ascending' ? 1 : -1 : 1;
    var defaultSortByColumnName_humanReadable = dataSourceDescription.fe_timeline_defaultSortByColumnName_humanReadable;
    var sortBy_realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(sortBy ? sortBy : defaultSortByColumnName_humanReadable, dataSourceDescription);
    //
    var hasThumbs = dataSourceDescription.fe_designatedFields.medThumbImageURL ? true : false;
    var routePath_base = "/array/" + source_pKey + "/timeline";
    var sourceDocURL = dataSourceDescription.urls && dataSourceDescription.urls.length > 0 ? dataSourceDescription.urls[0] : null;
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
    //
    //
    var wholeFilteredSet_aggregationOperators = [];
    if (isSearchActive) {
        var _orErrDesc = func.activeSearch_matchOp_orErrDescription(dataSourceDescription, searchCol, searchQ);
        if (typeof _orErrDesc.err !== 'undefined') {
            callback(_orErrDesc.err, null);

            return;
        }
        wholeFilteredSet_aggregationOperators = wholeFilteredSet_aggregationOperators.concat(_orErrDesc.matchOps);
    }
    if (isFilterActive) {
        var _orErrDesc = func.activeFilter_matchOp_orErrDescription_fromMultiFilter(dataSourceDescription, filterObj);
        if (typeof _orErrDesc.err !== 'undefined') {
            callback(_orErrDesc.err, null);

            return;
        }
        wholeFilteredSet_aggregationOperators = wholeFilteredSet_aggregationOperators.concat(_orErrDesc.matchOps);
    }

    var groupBySortFieldPath = "results.rowParams." + sortBy_realColumnName
    var groupByColumnName = groupBy ? groupBy : defaultGroupByColumnName_humanReadable;
    var groupByDuration;

    switch (groupByColumnName) {
        case 'Decade':
            groupByDuration = moment.duration(10, 'years').asMilliseconds();
            groupByDateFormat = "YYYY";
            break;

        case 'Year':
            groupByDuration = moment.duration(1, 'years').asMilliseconds();
            groupByDateFormat = "YYYY";
            break;

        case 'Month':
            groupByDuration = moment.duration(1, 'months').asMilliseconds();
            groupByDateFormat = "MMMM YYYY";
            break;

        case 'Day':
            groupByDuration = moment.duration(1, 'days').asMilliseconds();
            groupByDateFormat = "MMMM Do YYYY";
            break;

        default:
            groupByDuration = moment.duration(1, 'years').asMilliseconds();
            groupByDateFormat = "YYYY";
    }

    var sourceDoc, sampleDoc, uniqueFieldValuesByFieldName, nonpagedCount = 0, groupedResults = [];

    var batch = new Batch();
    batch.concurrency(1);

    // Obtain source document
    batch.push(function (done) {
        raw_source_documents.Model.findOne({primaryKey: source_pKey}, function (err, _sourceDoc) {
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
        func.topUniqueFieldValuesForFiltering(source_pKey, dataSourceDescription, function (err, _uniqueFieldValuesByFieldName) {
            if (err) return done(err);

            uniqueFieldValuesByFieldName = {};
            for (var columnName in _uniqueFieldValuesByFieldName) {
                if (_uniqueFieldValuesByFieldName.hasOwnProperty(columnName)) {
                    var raw_rowObjects_coercionSchema = dataSourceDescription.raw_rowObjects_coercionScheme;
                    if (raw_rowObjects_coercionSchema && raw_rowObjects_coercionSchema[columnName]) {
                        var row = [];
                        _uniqueFieldValuesByFieldName[columnName].forEach(function (rowValue) {
                            row.push(import_datatypes.OriginalValue(raw_rowObjects_coercionSchema[columnName], rowValue));
                        });
                        row.sort();
                        uniqueFieldValuesByFieldName[columnName] = row;
                    } else {
                        uniqueFieldValuesByFieldName[columnName] = _uniqueFieldValuesByFieldName[columnName];
                    }

                    if (dataSourceDescription.fe_filters_fieldsSortableByInteger && dataSourceDescription.fe_filters_fieldsSortableByInteger.indexOf(columnName) != -1) { // Sort by integer

                        uniqueFieldValuesByFieldName[columnName].sort(function (a, b) {
                            a = a.replace(/\D/g, '');
                            a = a == '' ? 0 : parseInt(a);
                            b = b.replace(/\D/g, '');
                            b = b == '' ? 0 : parseInt(b);
                            return a - b;
                        });

                    } else // Sort alphabetically by default
                        uniqueFieldValuesByFieldName[columnName].sort(function (a, b) {
                            return a - b;
                        });
                }
            }
            done();
        });
    });

    // Count whole set
    batch.push(function (done) {
        var countWholeFilteredSet_aggregationOperators = wholeFilteredSet_aggregationOperators.concat([
            { // Count
                $group: {
                    // _id: 1,
                    _id: {
                        "$subtract": [
                            {"$subtract": ["$" + "rowParams." + sortBy_realColumnName, new Date("1970-01-01")]},
                            {
                                "$mod": [
                                    {"$subtract": ["$" + "rowParams." + sortBy_realColumnName, new Date("1970-01-01")]},
                                    groupByDuration
                                ]
                            }
                        ]
                    }
                }
            }
        ]);

        var doneFn = function (err, results) {
            if (err) return done(err);
            if (results == undefined || results == null) { // 0
            } else {
                nonpagedCount = results.length;
            }
            done();
        };
        processedRowObjects_mongooseModel.aggregate(countWholeFilteredSet_aggregationOperators).allowDiskUse(true)/* or we will hit mem limit on some pages*/.exec(doneFn);
    });

    // Obtain Grouped results
    batch.push(function (done) {
        var aggregationOperators = [];
        if (isSearchActive) {
            var _orErrDesc = func.activeSearch_matchOp_orErrDescription(dataSourceDescription, searchCol, searchQ);
            if (_orErrDesc.err) return done(_orErrDesc.err);

            aggregationOperators = aggregationOperators.concat(_orErrDesc.matchOps);
        }
        if (isFilterActive) { // rules out undefined filterCol
            var _orErrDesc = func.activeFilter_matchOp_orErrDescription_fromMultiFilter(dataSourceDescription, filterObj);
            if (_orErrDesc.err) return done(_orErrDesc.err, null);

            aggregationOperators = aggregationOperators.concat(_orErrDesc.matchOps);
        }

        var sort = {};
        sort[groupBySortFieldPath] = -1;

        var projects = {
            $project: {
                _id: 1,
                pKey: 1,
                srcDocPKey: 1,
                rowIdxInDoc: 1
            }
        };

        // Exclude the nested pages fields to reduce the amount of data returned
        var rowParamsfields = Object.keys(sampleDoc.rowParams);
        rowParamsfields.forEach(function (rowParamsField) {
            if (rowParamsField == sortBy_realColumnName || rowParamsField.indexOf(dataSourceDescription.fe_nestedObject_prefix) === -1) {
                projects['$project']['rowParams.' + rowParamsField] = 1;
            }
        });

        aggregationOperators = aggregationOperators.concat(
            [
                projects,
                {$unwind: "$" + "rowParams." + sortBy_realColumnName}, // requires MongoDB 3.2, otherwise throws an error if non-array
                { // unique/grouping and summing stage
                    $group: {
                        _id: {
                            "$subtract": [
                                {"$subtract": ["$" + "rowParams." + sortBy_realColumnName, new Date("1970-01-01")]},
                                {
                                    "$mod": [
                                        {"$subtract": ["$" + "rowParams." + sortBy_realColumnName, new Date("1970-01-01")]},
                                        groupByDuration
                                    ]
                                }
                            ]
                        },
                        startDate: {$min: "$" + "rowParams." + sortBy_realColumnName},
                        endDate: {$max: "$" + "rowParams." + sortBy_realColumnName},
                        total: {$sum: 1}, // the count
                        results: {$push: "$$ROOT"}
                    }
                },
                { // reformat
                    $project: {
                        _id: 0,
                        startDate: 1,
                        endDate: 1,
                        total: 1,
                        results: {$slice: ["$results", groupedResultsLimit]}
                    }
                },
                {
                    $sort: sort
                },
                // Pagination
                {$skip: skipNResults},
                {$limit: groupsLimit}
            ]);
        //
        var doneFn = function (err, _groupedResults) {
            if (err) return done(err);

            if (_groupedResults == undefined || _groupedResults == null) _groupedResults = [];

            var finalizedButNotCoalesced_groupedResults = [];
            _groupedResults.forEach(function (el, i, arr) {
                var results = [];
                el.results.forEach(function(el2, i2) {
                    var originalVal = el2.rowParams[sortBy_realColumnName];
                    var displayableVal = originalVal;
                    if (originalVal == null) {
                        displayableVal = "(null)"; // null breaks chart but we don't want to lose its data
                    } else if (originalVal === "") {
                        displayableVal = "(not specified)"; // we want to show a label for it rather than it appearing broken by lacking a label
                    } else {
                        displayableVal = func.reverseDataToBeDisplayableVal(originalVal, sortBy_realColumnName, dataSourceDescription);
                    }
                    el2.rowParams[sortBy_realColumnName] = displayableVal;
                    results.push(el2);
                });
                el.results = results;
                groupedResults.push(el);
            });

            done();
        };
        processedRowObjects_mongooseModel.aggregate(aggregationOperators).allowDiskUse(true)/* or we will hit mem limit on some pages*/.exec(doneFn);
    });

    batch.end(function (err) {
        if (err) return callback(err);

        //
        var data =
        {
            env: process.env,
            
            user: req.user,

            arrayTitle: dataSourceDescription.title,
            array_source_key: source_pKey,
            team: team,
            brandColor: dataSourceDescription.brandColor,
            sourceDoc: sourceDoc,
            sourceDocURL: sourceDocURL,
            view_visibility: dataSourceDescription.fe_views ? dataSourceDescription.fe_views : {},
            //
            pageSize: config.timelineGroups < nonpagedCount ? config.pageSize : nonpagedCount,
            onPageNum: pageNumber,
            numPages: Math.ceil(nonpagedCount / config.timelineGroups),
            nonpagedCount: nonpagedCount,
            //
            fieldKey_objectTitle: dataSourceDescription.fe_designatedFields.objectTitle,
            humanReadableColumnName_objectTitle: importedDataPreparation.HumanReadableColumnName_objectTitle,
            //
            hasThumbs: hasThumbs,
            fieldKey_medThumbImageURL: hasThumbs ? dataSourceDescription.fe_designatedFields.medThumbImageURL : undefined,
            //
            groupedResults: groupedResults,
            groupBy: groupBy,
            groupBy_realColumnName: groupBy_realColumnName,
            groupedResultsLimit: groupedResultsLimit,
            groupByDateFormat: groupByDateFormat,
            //
            sortBy: sortBy,
            sortDir: sortDir,
            defaultSortByColumnName_humanReadable: defaultSortByColumnName_humanReadable,
            sortBy_realColumnName: sortBy_realColumnName,
            colNames_orderedForTimelineSortByDropdown: importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject_orderedForTimelineSortByDropdown(sampleDoc, dataSourceDescription),
            colNames_orderedForSortByDropdown: importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject_orderedForSortByDropdown(sampleDoc, dataSourceDescription),
            //
            filterObj: filterObj,
            isFilterActive: isFilterActive,
            uniqueFieldValuesByFieldName: uniqueFieldValuesByFieldName,
            truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill: truesByFilterValueByFilterColumnName_forWhichNotToOutputColumnNameInPill,
            //
            fe_galleryItem_htmlForIconFromRowObjWhenMissingImage: dataSourceDescription.fe_galleryItem_htmlForIconFromRowObjWhenMissingImage,
            //
            searchQ: searchQ,
            searchCol: searchCol,
            isSearchActive: isSearchActive,
            //
            defaultGroupByColumnName_humanReadable: defaultGroupByColumnName_humanReadable,
            colNames_orderedForGroupByDropdown: dataSourceDescription.fe_timeline_durationsAvailableForGroupBy ? dataSourceDescription.fe_timeline_durationsAvailableForGroupBy : {},
            //
            routePath_base: routePath_base,
            // multiselectable filter fields
            multiselectableFilterFields: dataSourceDescription.fe_filters_fieldsMultiSelectable
        };
        callback(err, data);
    });
};