//
//
////////////////////////////////////////////////////////////////////////////////
// Imports
//
var winston = require('winston');
var async = require('async');
var dataSourceDescriptions = require('../data_ingestion/MVP_datasource_descriptions').Descriptions;
var importedDataPreparation = require('../data_ingestion/imported_data_preparation');
var cached_values_model = require('../cached_values/cached_values_model');
//
//
////////////////////////////////////////////////////////////////////////////////
// Constants
//
var pageSize = 250;
//
//
////////////////////////////////////////////////////////////////////////////////
// Controller - Initialization
//
var constructor = function(options, context)
{
    var self = this;
    self.options = options;
    self.context = context;
    //
    self._init();
    //
    return self;
};
module.exports = constructor;
constructor.prototype._init = function()
{
    var self = this;
};
//
//
////////////////////////////////////////////////////////////////////////////////
// Controller - Accessors - Public
//
constructor.prototype.BindDataFor_datasetsListing = function(callback)
{
    var self = this;
    var iterateeFn = async.ensureAsync(function(dataSourceDescription, cb) // prevent stack overflows from this sync iteratee
    {
        var err = null;
        var source = 
        {
            key: importedDataPreparation.DataSourcePKeyFromDataSourceDescription(dataSourceDescription, self.context.raw_source_documents_controller),
            title: dataSourceDescription.title,
            description: dataSourceDescription.description,
            urls: dataSourceDescription.urls
        }
        cb(err, source);
    });
    var completionFn = function(err, results)
    {
        var data = 
        {
            sources: results
        };
        callback(err, data);
    };
    async.map(dataSourceDescriptions, iterateeFn, completionFn);
    //    ^ parallel execution, but ordered results
};
//
constructor.prototype.PageSize = function() { return pageSize; };
//
//
constructor.prototype.BindDataFor_array_gallery = function(urlQuery, callback)
{
    var self = this;
    // urlQuery keys:
        // source_key
        // page
        // sortBy
        // sortDir
        // filterCol
        // filterVal
        // searchQ
        // searchCol
    var source_pKey = urlQuery.source_key;
    var dataSourceDescription = importedDataPreparation.DataSourceDescriptionWithPKey(source_pKey, self.context.raw_source_documents_controller);
    if (dataSourceDescription == null || typeof dataSourceDescription === 'undefined') {
        callback(new Error("No data source with that source pkey " + source_pKey), null);
        
        return;
    }
    var processedRowObjects_mongooseContext = self.context.processed_row_objects_controller.Lazy_Shared_ProcessedRowObject_MongooseContext(source_pKey);
    var processedRowObjects_mongooseModel = processedRowObjects_mongooseContext.Model;
    //
    var page = urlQuery.page;
    var pageNumber = page ? page : 1;
    var skipNResults = pageSize * (Math.max(pageNumber, 1) - 1);
    var limitToNResults = pageSize;
    //
    var sortBy = urlQuery.sortBy; // the human readable col name - real col name derived below
    var sortDir = urlQuery.sortDir;
    var sortDirection = sortDir ? sortDir == 'Ascending' ? 1 : -1 : 1;
    //
    var filterCol = urlQuery.filterCol;
    var filterVal = urlQuery.filterVal;
    var isFilterActive = typeof filterCol !== 'undefined' && filterCol != null && filterCol != "";
    //
    var searchCol = urlQuery.searchCol;
    var searchQ = urlQuery.searchQ;
    var isSearchActive = typeof searchCol !== 'undefined' && searchCol != null && searchCol != "" // Not only a column
                      && typeof searchQ !== 'undefined' && searchQ != null && searchQ != "";  // but a search query
    //
    var wholeFilteredSet_aggregationOperators = [];
    if (isSearchActive) { 
        var _orErrDesc = _activeSearch_matchOp_orErrDescription(dataSourceDescription, searchCol, searchQ);
        if (typeof _orErrDesc.err !== 'undefined') {
            callback(_orErrDesc.err, null);
            
            return;
        }
        wholeFilteredSet_aggregationOperators.push(_orErrDesc.matchOp);
    }
    if (isFilterActive) { // rules out undefined filterCol
        var _orErrDesc = _activeFilter_matchOp_orErrDescription(dataSourceDescription, filterCol, filterVal);
        if (typeof _orErrDesc.err !== 'undefined') {
            callback(_orErrDesc.err, null);
            
            return;
        }
        wholeFilteredSet_aggregationOperators.push(_orErrDesc.matchOp);
    }
    //
    // Now kick off the query work
    _proceedTo_obtainSampleDocument();
    function _proceedTo_obtainSampleDocument()
    {
        processedRowObjects_mongooseModel.findOne({}, function(err, sampleDoc)
        {
            if (err) {
                callback(err, null);
            
                return;
            }
            if (sampleDoc == null) {
                callback(new Error('Unexpectedly missing sample document - wrong data source UID? urlQuery: ' + JSON.stringify(urlQuery, null, '\t')), null);
                
                return;
            }
            //
            _proceedTo_obtainTopUniqueFieldValuesForFiltering(sampleDoc);
        });
    }
    function _proceedTo_obtainTopUniqueFieldValuesForFiltering(sampleDoc)
    {
        _topUniqueFieldValuesForFiltering(source_pKey, dataSourceDescription, sampleDoc, function(err, uniqueFieldValuesByFieldName)
        {
            if (err) {
                callback(err, null);

                return;
            }
            //
            _proceedTo_countWholeSet(sampleDoc, uniqueFieldValuesByFieldName);
        });
    }
    function _proceedTo_countWholeSet(sampleDoc, uniqueFieldValuesByFieldName)
    {
        var countWholeFilteredSet_aggregationOperators = wholeFilteredSet_aggregationOperators.concat([
            { // Count
                $group: {
                    _id: 1,
                    count: { $sum: 1 }
                }
            }
        ]);
        var doneFn = function(err, results)
        {
            if (err) {
                callback(err, null);
            
                return;
            }
            var nonpagedCount = 0;
            if (results == undefined || results == null || results.length == 0) { // 0
            } else {
                nonpagedCount = results[0].count;
            }
            //
            _proceedTo_obtainPagedDocs(sampleDoc, uniqueFieldValuesByFieldName, nonpagedCount);
        };
        processedRowObjects_mongooseModel.aggregate(countWholeFilteredSet_aggregationOperators).exec(doneFn);
    }
    function _proceedTo_obtainPagedDocs(sampleDoc, uniqueFieldValuesByFieldName, nonpagedCount)
    {        
        var sortBy_realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(sortBy ? sortBy : importedDataPreparation.HumanReadableColumnName_objectTitle, 
                                                                                                      dataSourceDescription);
        var sortBy_realColumnName_path = "rowParams." + sortBy_realColumnName;
        var sortOpParams = {};
        sortOpParams[sortBy_realColumnName_path] = sortDirection;
        //
        var pagedDocs_aggregationOperators = wholeFilteredSet_aggregationOperators.concat([
            // Sort (before pagination):
            { $sort: sortOpParams },
            // Pagination
            { $skip: skipNResults },
            { $limit: limitToNResults }
        ]);
        var doneFn = function(err, docs)
        {
            if (err) {
                callback(err, null);
            
                return;
            }
            if (docs == undefined || docs == null || docs.length == 0) {
                docs = [];
            }
            //        
            _prepareDataAndCallBack(sampleDoc, uniqueFieldValuesByFieldName, nonpagedCount, docs);
        };
        processedRowObjects_mongooseModel.aggregate(pagedDocs_aggregationOperators).allowDiskUse(true)/* or we will hit mem limit on some pages*/.exec(doneFn);
    }
    function _prepareDataAndCallBack(sampleDoc, uniqueFieldValuesByFieldName, nonpagedCount, docs)
    {
        var err = null;
        var hasThumbs = dataSourceDescription.fe_designatedFields.medThumbImageURL ? true : false;
        var routePath_base              = "/array/" + source_pKey + "/gallery";
        var routePath_withoutFilter     = routePath_base;
        var routePath_withoutPage       = routePath_base;
        var routePath_withoutSortBy     = routePath_base;
        var routePath_withoutSortDir    = routePath_base;
        if (sortBy !== undefined && sortBy != null && sortBy !== "") {
            var appendQuery = "sortBy=" + sortBy;
            routePath_withoutFilter     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutFilter,    appendQuery, routePath_base);
            routePath_withoutPage       = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutPage,      appendQuery, routePath_base);
            routePath_withoutSortDir    = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortDir,   appendQuery, routePath_base);
        }
        if (sortDir !== undefined && sortDir != null && sortDir !== "") {
            var appendQuery = "sortDir=" + sortDir;
            routePath_withoutFilter     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutFilter,        appendQuery, routePath_base);
            routePath_withoutPage       = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutPage,          appendQuery, routePath_base);
            routePath_withoutSortBy     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortBy,        appendQuery, routePath_base);
        }
        if (page !== undefined && page != null && page !== "") {
            var appendQuery = "page=" + page;
            routePath_withoutSortBy     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortBy,    appendQuery, routePath_base);
            routePath_withoutSortDir    = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortDir,   appendQuery, routePath_base);
        }
        if (isFilterActive) {
            var appendQuery = "filterCol=" + filterCol + "&" + "filterVal=" + filterVal;
            routePath_withoutPage       = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutPage,      appendQuery, routePath_base);
            routePath_withoutSortBy     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortBy,    appendQuery, routePath_base);
            routePath_withoutSortDir    = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortDir,   appendQuery, routePath_base);
        }
        if (isSearchActive) {
            var appendQuery = "searchCol=" + searchCol + "&" + "searchQ=" + searchQ;
            routePath_withoutFilter     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutFilter,    appendQuery, routePath_base);
            routePath_withoutPage       = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutPage,      appendQuery, routePath_base);
            routePath_withoutSortBy     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortBy,    appendQuery, routePath_base);
            routePath_withoutSortDir    = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutSortDir,   appendQuery, routePath_base);
        }
        var data =
        {
            arrayTitle: dataSourceDescription.title,
            array_source_key: source_pKey,
            //
            pageSize: pageSize < nonpagedCount ? pageSize : nonpagedCount,
            onPageNum: pageNumber,
            numPages: Math.ceil(nonpagedCount / pageSize),
            nonpagedCount: nonpagedCount,
            //
            docs: docs,
            //
            fieldKey_objectTitle: dataSourceDescription.fe_designatedFields.objectTitle,
            humanReadableColumnName_objectTitle: importedDataPreparation.HumanReadableColumnName_objectTitle,
            //
            hasThumbs: hasThumbs,
            fieldKey_medThumbImageURL: hasThumbs ? dataSourceDescription.fe_designatedFields.medThumbImageURL : undefined,
            //
            sortBy: sortBy,
            sortDir: sortDir,
            colNames_orderedForSortByDropdown: importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject_orderedForSortByDropdown(sampleDoc, dataSourceDescription),
            //
            filterCol: filterCol,
            filterVal: filterVal,
            isFilterActive: isFilterActive,
            uniqueFieldValuesByFieldName: uniqueFieldValuesByFieldName,
            //
            searchQ: searchQ,
            searchCol: searchCol,
            isSearchActive: isSearchActive,
            //
            routePath_base: routePath_base,
            routePath_withoutFilter: routePath_withoutFilter,
            routePath_withoutPage: routePath_withoutPage,
            routePath_withoutSortBy: routePath_withoutSortBy,
            routePath_withoutSortDir: routePath_withoutSortDir
        };
        callback(err, data);
    }
};
//
constructor.prototype.BindDataFor_array_chart = function(urlQuery, callback)
{
    var self = this;
    // urlQuery keys:
        // source_key
        // groupBy
        // filterCol
        // filterVal
        // searchQ
        // searchCol
    var source_pKey = urlQuery.source_key;
    var dataSourceDescription = importedDataPreparation.DataSourceDescriptionWithPKey(source_pKey, self.context.raw_source_documents_controller);
    if (dataSourceDescription == null || typeof dataSourceDescription === 'undefined') {
        callback(new Error("No data source with that source pkey " + source_pKey), null);
        
        return;
    }
    var processedRowObjects_mongooseContext = self.context.processed_row_objects_controller.Lazy_Shared_ProcessedRowObject_MongooseContext(source_pKey);
    var processedRowObjects_mongooseModel = processedRowObjects_mongooseContext.Model;
    //
    var groupBy = urlQuery.groupBy; // the human readable col name - real col name derived below
    var defaultGroupByColumnName_humanReadable = dataSourceDescription.fe_chart_defaultGroupByColumnName_humanReadable;
    //
    var filterCol = urlQuery.filterCol;
    var filterVal = urlQuery.filterVal;
    var isFilterActive = typeof filterCol !== 'undefined' && filterCol != null && filterCol != "";
    //
    var searchCol = urlQuery.searchCol;
    var searchQ = urlQuery.searchQ;
    var isSearchActive = typeof searchCol !== 'undefined' && searchCol != null && searchCol != "" // Not only a column
                      && typeof searchQ !== 'undefined' && searchQ != null && searchQ != "";  // but a search query
    //
    // Now kick off the query work
    _proceedTo_obtainSampleDocument();
    function _proceedTo_obtainSampleDocument()
    {
        processedRowObjects_mongooseModel.findOne({}, function(err, sampleDoc)
        {
            if (err) {
                callback(err, null);
            
                return;
            }
            if (sampleDoc == null) {
                callback(new Error('Unexpectedly missing sample document - wrong data source UID? urlQuery: ' + JSON.stringify(urlQuery, null, '\t')), null);
                
                return;
            }        
            _proceedTo_obtainTopUniqueFieldValuesForFiltering(sampleDoc);
        });
    }
    function _proceedTo_obtainTopUniqueFieldValuesForFiltering(sampleDoc)
    {
        _topUniqueFieldValuesForFiltering(source_pKey, dataSourceDescription, sampleDoc, function(err, uniqueFieldValuesByFieldName)
        {
            if (err) {
                callback(err, null);

                return;
            }
            //
            _proceedTo_obtainGroupedResultSet(sampleDoc, uniqueFieldValuesByFieldName);
        });
    }
    function _proceedTo_obtainGroupedResultSet(sampleDoc, uniqueFieldValuesByFieldName)
    {
        var groupBy_realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(groupBy ? groupBy : defaultGroupByColumnName_humanReadable, 
                                                                                                       dataSourceDescription);
        //
        var aggregationOperators = [];
        if (isSearchActive) { 
            var _orErrDesc = _activeSearch_matchOp_orErrDescription(dataSourceDescription, searchCol, searchQ);
            if (typeof _orErrDesc.err !== 'undefined') {
                callback(_orErrDesc.err, null);
            
                return;
            }
            aggregationOperators.push(_orErrDesc.matchOp);
        }
        if (isFilterActive) { // rules out undefined filterCol
            var _orErrDesc = _activeFilter_matchOp_orErrDescription(dataSourceDescription, filterCol, filterVal);
            if (typeof _orErrDesc.err !== 'undefined') {
                callback(_orErrDesc.err, null);
            
                return;
            }
            aggregationOperators.push(_orErrDesc.matchOp);
        }        
        aggregationOperators = aggregationOperators.concat(
        [
            { // unique/grouping and summing stage
                $group: {
                    _id: "$" + "rowParams." + groupBy_realColumnName,
                    value: { $sum: 1 } // the count
                }
            },
            { // reformat
                $project: {
                    _id: 0,
                    label: "$_id",
                    value: 1
                }
            },
            { // priotize by incidence, since we're $limit-ing below 
                $sort : { value : -1 } 
            },
            { 
                $limit : 100 // so the chart can actually handle the number
            }
        ]);
        //
        var doneFn = function(err, groupedResults)
        {
            if (err) {
                callback(err, null);
            
                return;
            }
            if (groupedResults == undefined || groupedResults == null) {
                groupedResults = [];
            }
            groupedResults.forEach(function(el, i, arr) 
            {
                if (el.label == null) {
                    el.label = "(null)"; // null breaks chart but we don't want to lose its data
                } else if (el.label === "") {
                    el.label = "(not specified)"; // we want to show a label for it rather than it appearing broken by lacking a label
                }
            });
            _prepareDataAndCallBack(sampleDoc, uniqueFieldValuesByFieldName, groupedResults);
        };
        processedRowObjects_mongooseModel.aggregate(aggregationOperators).allowDiskUse(true)/* or we will hit mem limit on some pages*/.exec(doneFn);
    }
    function _prepareDataAndCallBack(sampleDoc, uniqueFieldValuesByFieldName, groupedResults)
    {
        var err = null;
        var routePath_base              = "/array/" + source_pKey + "/chart";
        var routePath_withoutFilter     = routePath_base;
        var routePath_withoutGroupBy    = routePath_base;
        if (groupBy !== undefined && groupBy != null && groupBy !== "") {
            var appendQuery = "groupBy=" + groupBy;
            routePath_withoutFilter     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutFilter,    appendQuery, routePath_base);
        }
        if (isFilterActive) {
            var appendQuery = "filterCol=" + filterCol + "&" + "filterVal=" + filterVal;
            routePath_withoutGroupBy    = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutGroupBy,   appendQuery, routePath_base);
        }
        if (isSearchActive) {
            var appendQuery = "searchCol=" + searchCol + "&" + "searchQ=" + searchQ;
            routePath_withoutFilter     = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutFilter,    appendQuery, routePath_base);
            routePath_withoutGroupBy    = _routePathByAppendingQueryStringToVariationOfBase(routePath_withoutGroupBy,   appendQuery, routePath_base);
        }
        var data =
        {
            arrayTitle: dataSourceDescription.title,
            array_source_key: source_pKey,
            //
            groupedResults: groupedResults,
            groupBy: groupBy,
            //
            filterCol: filterCol,
            filterVal: filterVal,
            isFilterActive: isFilterActive,
            uniqueFieldValuesByFieldName: uniqueFieldValuesByFieldName,
            //
            searchQ: searchQ,
            searchCol: searchCol,
            isSearchActive: isSearchActive,
            //
            defaultGroupByColumnName_humanReadable: defaultGroupByColumnName_humanReadable,
            colNames_orderedForGroupByDropdown: importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject_orderedForChartGroupByDropdown(sampleDoc, dataSourceDescription),
            //
            routePath_base: routePath_base,
            routePath_withoutFilter: routePath_withoutFilter,
            routePath_withoutGroupBy: routePath_withoutGroupBy
        };
        callback(err, data);
    }
}
//
constructor.prototype.BindDataFor_array_objectDetails = function(source_pKey, rowObject_id, callback)
{
    var self = this;
    var dataSourceDescription = importedDataPreparation.DataSourceDescriptionWithPKey(source_pKey, self.context.raw_source_documents_controller);
    var processedRowObjects_mongooseContext = self.context.processed_row_objects_controller.Lazy_Shared_ProcessedRowObject_MongooseContext(source_pKey);
    var processedRowObjects_mongooseModel = processedRowObjects_mongooseContext.Model;
    var query =
    {
        _id: rowObject_id,
        srcDocPKey: source_pKey
    };
    processedRowObjects_mongooseModel.findOne(query, function(err, rowObject)
    {
        if (err) {
            callback(err, null);
        
            return;
        }
        if (rowObject == null) {
            callback(null, null);
            
            return;
        }
        var colNames_sansObjectTitle = importedDataPreparation.HumanReadableFEVisibleColumnNamesWithSampleRowObject(rowObject, dataSourceDescription);
        // ^ to finalize:
        var idxOf_objTitle = colNames_sansObjectTitle.indexOf(importedDataPreparation.HumanReadableColumnName_objectTitle);
        colNames_sansObjectTitle.splice(idxOf_objTitle, 1);
        //
        var alphaSorted_colNames_sansObjectTitle = colNames_sansObjectTitle.sort();
        //
        var designatedOriginalImageField = dataSourceDescription.fe_designatedFields.originalImageURL;
        var hasDesignatedOriginalImageField = designatedOriginalImageField ? true : false;
        var rowObjectHasOriginalImage = false;
        if (hasDesignatedOriginalImageField) {
            var valueAtOriginalImageField = rowObject.rowParams[designatedOriginalImageField];
            if (typeof valueAtOriginalImageField !== 'undefined' && valueAtOriginalImageField != null && valueAtOriginalImageField != "") {
                rowObjectHasOriginalImage = true;
            }
        }
        // Move the data to the human-readable keys so they are accessible by the template
        var fe_displayTitleOverrides = dataSourceDescription.fe_displayTitleOverrides || {};
        var originalKeys = Object.keys(fe_displayTitleOverrides);
        var originalKeys_length = originalKeys.length;
        for (var i = 0 ; i < originalKeys_length ; i++) {
            var originalKey = originalKeys[i];
            var overrideTitle = fe_displayTitleOverrides[originalKey];
            var valueAtOriginalKey = rowObject.rowParams[originalKey];
            rowObject.rowParams[overrideTitle] = valueAtOriginalKey;
        }
        //
        var data =
        {
            arrayTitle: dataSourceDescription.title,
            array_source_key: source_pKey,
            //
            rowObject: rowObject,
            //
            fieldKey_objectTitle: dataSourceDescription.fe_designatedFields.objectTitle,
            //
            fieldKey_originalImageURL: hasDesignatedOriginalImageField ? designatedOriginalImageField : undefined,
            hasOriginalImage: rowObjectHasOriginalImage,
            //
            ordered_colNames_sansObjectTitleAndImages: alphaSorted_colNames_sansObjectTitle
        };
        callback(null, data);
    });
}
//
//
function _routePathByAppendingQueryStringToVariationOfBase(routePath_variation, queryString, routePath_base)
{
    if (routePath_variation === routePath_base) {
        routePath_variation += "?";
    } else {
        routePath_variation += "&";
    }
    routePath_variation += queryString;
    
    return routePath_variation;
}
//
//
function _activeFilter_matchOp_orErrDescription(dataSourceDescription, filterCol, filterVal)
{ // returns dictionary with err or matchOp
    var matchOp = undefined;
    var isAFabricatedFilter = false; // finalize
    if (dataSourceDescription.fe_filters_fabricatedFilters) {
        var fabricatedFilters_length = dataSourceDescription.fe_filters_fabricatedFilters.length;
        for (var i = 0 ; i < fabricatedFilters_length ; i++) {
            var fabricatedFilter = dataSourceDescription.fe_filters_fabricatedFilters[i];
            if (fabricatedFilter.title === filterCol) {
                isAFabricatedFilter = true;
                // Now find the applicable filter choice
                var choices = fabricatedFilter.choices;
                var choices_length = choices.length;
                var foundChoice = false;
                for (var j = 0 ; j < choices_length ; j++) {
                    var choice = choices[j];
                    if (choice.title === filterVal) {
                        foundChoice = true;
                        matchOp = { $match: choice["$match"] };
                        
                        break; // found the applicable filter choice
                    }
                }
                if (foundChoice == false) { // still not found despite the filter col being recognized as fabricated
                    return { err: new Error("No such choice \"" + filterVal + "\" for filter " + filterCol) };
                }
                
                break; // found the applicable fabricated filter
            }
        }
    }
    if (isAFabricatedFilter == true) { // already obtained matchOp just above
        if (typeof matchOp === 'undefined') {
            return { err: new Error("Unexpectedly missing matchOp given fabricated filter…" + JSON.stringify(urlQuery)) };
        }
    } else {
        var realColumnName = importedDataPreparation.RealColumnNameFromHumanReadableColumnName(filterCol, dataSourceDescription);
        var realColumnName_path = "rowParams." + realColumnName;
        var realFilterValue = filterVal; // To finalize in case of override…
        var oneToOneOverrideWithValuesByTitleByFieldName = dataSourceDescription.fe_filters_oneToOneOverrideWithValuesByTitleByFieldName || {};
        var oneToOneOverrideWithValuesByTitle_forThisColumn = oneToOneOverrideWithValuesByTitleByFieldName[realColumnName];
        if (oneToOneOverrideWithValuesByTitle_forThisColumn) {
            var overrideValue = oneToOneOverrideWithValuesByTitle_forThisColumn[filterVal];
            if (typeof overrideValue === 'undefined') {
                var errString = "Missing override value for overridden column " + realColumnName + " and incoming filterVal " + filterVal;
                winston.error("❌  " + errString); // we'll just use the value they entered - maybe a user is manually editing the URL
             } else {
                 realFilterValue = overrideValue;
             }
        }
        matchOp = { $match: {} };
        matchOp["$match"][realColumnName_path] = { $regex: realFilterValue, $options: "i" };
    }
    if (typeof matchOp === 'undefined') {
        throw new Error("Undefined match operation");
    }
    
    return { matchOp: matchOp };
}
//
function _activeSearch_matchOp_orErrDescription(dataSourceDescription, searchCol, searchQ)
{ // returns dictionary with err or matchOp
    var realColumnName_path = "rowParams." + importedDataPreparation.RealColumnNameFromHumanReadableColumnName(searchCol, dataSourceDescription);
    var matchOp = { $match: {} };
    matchOp["$match"][realColumnName_path] = { $regex: searchQ, $options: "i" };

    return { matchOp: matchOp };
}
//
function _topUniqueFieldValuesForFiltering(source_pKey, dataSourceDescription, sampleDoc, callback)
{
    cached_values_model.MongooseModel.findOne({ srcDocPKey: source_pKey }, function(err, doc) 
    {
        if (err) {
            callback(err, null);

            return;
        }
        if (doc == null) {
            callback(new Error('Missing cached values document for srcDocPKey: ' + source_pKey), null);

            return;
        }
        var uniqueFieldValuesByFieldName = doc.limitedUniqValsByHumanReadableColName;
        if (uniqueFieldValuesByFieldName == null || typeof uniqueFieldValuesByFieldName === 'undefined') {
            callback(new Error('Unexpectedly missing uniqueFieldValuesByFieldName for srcDocPKey: ' + source_pKey), null);

            return;
        }
        //
        // Now insert fabricated filters
        if (dataSourceDescription.fe_filters_fabricatedFilters) {
            var fabricatedFilters_length = dataSourceDescription.fe_filters_fabricatedFilters.length;
            for (var i = 0 ; i < fabricatedFilters_length ; i++) {
                var fabricatedFilter = dataSourceDescription.fe_filters_fabricatedFilters[i];
                var choices = fabricatedFilter.choices;
                var choices_length = choices.length;
                var values = [];
                for (var j = 0 ; j < choices_length ; j++) {
                    var choice = choices[j];
                    values.push(choice.title);
                }
                if (typeof uniqueFieldValuesByFieldName[fabricatedFilter.title] !== 'undefined') {
                    var errStr = 'Unexpectedly already-existent filter for the fabricated filter title ' + fabricatedFilter.title;
                    winston.error("❌  " + errStr);
                    callback(new Error(errStr), null);

                    return;
                }
                uniqueFieldValuesByFieldName[fabricatedFilter.title] = values;
            }
        }
        //
        callback(null, uniqueFieldValuesByFieldName);            
    });
}