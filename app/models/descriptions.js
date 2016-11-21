var integerValidator = require('mongoose-integer');
var fs = require('fs');
var team = require('./teams'); // Do not remove, it should be proceed at first.
var winston = require('winston');
var Promise = require('q').Promise;
var _ = require("lodash");
var async = require('async');

var mongoose_client = require('./mongoose_client');
var imported_data_preparation = require('../libs/datasources/imported_data_preparation');
var import_controller = require('../libs/import/data_ingest/controller');

var mongoose = mongoose_client.mongoose;
var Schema = mongoose.Schema;
//
var DatasourceDescription_scheme = Schema({
    uid: String, // It is not changeable once it's generated automaticlly when creating a descrpition
    importRevision: {type: Number,integer: true, default: 1},
    schema_id: {type: Schema.Types.ObjectId, ref:'DatasourceDescription'},
    logo: String,
    dataset_uid: String, // It is not changeable once it's generated automaticlly when creating a descrpition
    format: String,
    title: String,
    brandColor: String,
    urls: Array,
    description: String,
    fe_visible: {type: Boolean, default: true},
    fe_listed: {type: Boolean, default: true},

    fn_new_rowPrimaryKeyFromRowObject: String,
    raw_rowObjects_coercionScheme: Object,
    fe_excludeFields: Array,
    fe_displayTitleOverrides: Object,
    fe_designatedFields: Object,
    fe_fieldDisplayOrder: Object,

    fe_filters: {
        excludeFields: Array,
        valuesToExclude: Object,
        fabricated: Array,
        default: Object,
        fieldsSortableByInteger: Array,
        fieldsSortableInReverseOrder: Array,
        fieldsCommaSeparatedAsIndividual: Array,
        fieldsMultiSelectable: Array,
        fieldsNotAvailable: Array,
        keywords: Array,
    },

    _otherSources: [{type: Schema.Types.ObjectId, ref: 'DatasourceDescription'}],
    customFieldsToProcess: Array,
    relationshipFields: Object,

    fe_views: {
        default_view: String,
        views: Object
    },

    _team: {type: Schema.Types.ObjectId, ref: 'Team'},

    isPublic : {type: Boolean, default: false},

    fe_objectShow_customHTMLOverrideFnsByColumnNames: Object,

    imageScraping: Array,

    fe_nestedObject: Object,
    author: {type: Schema.Types.ObjectId,ref: 'User'},
    updatedBy: {type: Schema.Types.ObjectId,ref:'User'},
    viewers: [{type: Schema.Types.ObjectId, ref: 'User'}]
});

var deepPopulate = require('mongoose-deep-populate')(mongoose);
DatasourceDescription_scheme.plugin(integerValidator);

DatasourceDescription_scheme.plugin(deepPopulate,{whitelist:['_otherSources','_otherSources._team','schema_id','_team']})

var datasource_description = mongoose.model('DatasourceDescription', DatasourceDescription_scheme);

/* -----------   helper function ----------- */
var _mergeObject = function (obj1, obj2) {
    var obj3 = {};
    for (var attrname in obj1) {
        obj3[attrname] = obj1[attrname]
    }
    for (var attrname in obj2) {
        obj3[attrname] = obj2[attrname];
    }
    return obj3;
}

var _consolidate_descriptions_hasSchema = function(description) {
    var desc = _.omit(description,['schema_id'])
    var schemaDesc = description.schema_id
    for (var attrname in schemaDesc) {
        if (desc[attrname]) {
            if (Array.isArray(desc[attrname])) {
                desc[attrname] = schemaDesc[attrname].concat(desc[attrname]);

            } else if (typeof desc[attrname] == 'string') {

            } else if (typeof desc[attrname] == 'object') {
                desc[attrname] = _mergeObject(schemaDesc[attrname], desc[attrname]);

            }
        } else {
            desc[attrname] = schemaDesc[attrname]
        }
    }
    return desc;
};

datasource_description.Consolidate_descriptions_hasSchema = _consolidate_descriptions_hasSchema;

var _checkCollection = function(datasource_description,schemaKey,eachCb) {
    if (schemaKey != null) {
        mongoose_client.checkIfDatasetImportedInSchemaCollection('rawrowobjects-' + schemaKey, datasource_description.dataset_uid, function (err, existInRaw) {

            if (err) {
                winston.error("❌ err when checking mongo collection exists, from callback ");
                eachCb(err);
            } else {
                if (existInRaw == true) {
                    winston.info("✅ rawrowobjects collection exists for dataset_uid: ", datasource_description.dataset_uid);
                    mongoose_client.checkIfDatasetImportedInSchemaCollection('processedrowobjects-' + keyname, datasource_description.dataset_uid, function (err, existInProcessed) {
                        if (err) {
                            eachCb(err);
                        } else if (existInProcessed == true) {
                            winston.info("✅ processedrowobjects collection exists for dataset_uid: ", datasource_description.dataset_uid);
                            eachCb(null);
                        } else {
                            winston.info("❗ processedrowobjects collection does not exists for dataset_uid: ", datasource_description.dataset_uid);
                            winston.info("💬  will build it right now....");

                            var descriptions = [];

                            import_controller.PostProcessRawObjects([datasource_description], function () {
                                eachCb(null);
                            })
                        }
                    })
                } else {

                    winston.info("❗ rawrowobjects collection does not exists for dataset_uid: " + schemaKey);
                    winston.info("💬  will build it right now....");
                    import_controller.Import_dataSourceDescriptions([datasource_description], function () {
                        eachCb(null);
                    });

                }

            }

        })

    } else {
        keyname = imported_data_preparation.DataSourcePKeyFromDataSourceDescription(datasource_description).toLowerCase();
        mongoose_client.checkIfCollectionExists('rawrowobjects-' + keyname, function (err, exist) {
            if (err) {
                winston.error("❌ err when checking mongo collection exists, from callback ");
                eachCb(err);
            } else {
                if (exist == true) {
                    winston.info("✅  rawrowobjects collection exists for dataset : ", keyname);
                    mongoose_client.checkIfCollectionExists('processedrowobjects-' + keyname, function (err, exist) {
                        if (err) {
                            eachCb(err);
                        } else if (exist == true) {
                            winston.info("✅  processedrowobjects collection exists for dataset: ", keyname);
                            eachCb(null);

                        } else {
                            winston.info("❗ processedrowobjects collection does not exists for dataset: " + keyname);
                            winston.info("💬  will build it right now....");

                            var descriptions = [];

                            import_controller.PostProcessRawObjects([datasource_description], function () {
                                eachCb(null);
                            })
                        }
                    })
                } else {
                    winston.info("❗ rawrowobjects collection does not exists for dataset: " + keyname);
                    winston.info("💬  will build it right now....");
                    import_controller.Import_dataSourceDescriptions([datasource_description], function () {
                        eachCb(null);
                    });
                }
            }
        })

    }

}

/* -------   end helper function ------------  */

// Customize the model

var _GetDescriptions = function (fn) {

    var self = this;

    mongoose_client.WhenMongoDBConnected(function () {

        self.find({
                fe_visible: true,
                schema_id: {$exists: false},
                _team: {$exists: false}
            }) /*dont get the one in the team, as it is gonna get from team descriptions */
            .lean()
            .exec(function (err, descriptions) {

                if (err) {
                    winston.error("❌ Error occurred when finding datasource description: ", err);
                    fn(err, null);
                } else {
                    fn(null, descriptions);

                }

            })

    })

}

datasource_description.GetDescriptions = _GetDescriptions;


var _GetDescriptionsToSetupByFilenames = function (files, fn) {

    var descriptions = [];
    var self = this;

    mongoose_client.WhenMongoDBConnected(function () {

        function asyncFunction(file, cb) {

            self.findOne({$or: [{uid: file}, {dataset_uid: file}]})
                .lean()
                .deepPopulate('_otherSources schema_id _team _otherSources._team')
                .exec(function (err, description) {

                    if (err) {
                        winston.error("❌ Error occurred when finding datasource description: ", err);
                    } else {

                        if (description._otherSources) {
                            var omitted = _.omit(description, ["_otherSources"]);
                            descriptions.push(omitted);
                            _.map(description._otherSources, function (src) {
                                var excludeOtherSource = _.omit(src, ["_otherSources"])
                                descriptions.push(excludeOtherSource);
                            })
                            cb();

                        } else if (!description.schema_id) {
                            descriptions.push(description);
                            cb();

                        } else {
                            descriptions.push(_consolidate_descriptions_hasSchema(description));
                            cb();
                        }
                    }
                })
        }

        var requests = files.map(function (file) {
            return new Promise(function (resolve) {
                asyncFunction(file, resolve);
            });
        });

        Promise.all(requests).then(function () {
            fn(descriptions);
        });
    })
}

datasource_description.GetDescriptionsToSetup = _GetDescriptionsToSetupByFilenames;


var _findAllDescriptionAndSetup = function(fn) {

    this.find({imported:3})
        .lean()
        .deepPopulate('schema_id _team')
        .exec(function(err,descriptions) {

            /* avoid write operation lock for datasource depend on others */
            var dependentOnSchemaToBeLoaded = {};
            async.each(descriptions,function(desc,eachCb) {
                if (typeof desc.schema_id !== 'undefined' ) {

                    desc = _consolidate_descriptions_hasSchema(desc);
                    keyname = imported_data_preparation.DataSourcePKeyFromDataSourceDescription(desc).toLowerCase();
                    dependentOnSchemaToBeLoaded[keyname] = [];
                    dependentOnSchemaToBeLoaded[keyname].push(desc);

                    eachCb(null);
                } else {
                    _checkCollection(desc,null,eachCb);

                }

            },function(err) {


                if (Object.keys(dependentOnSchemaToBeLoaded).length !== 0) {

                    async.forEachOf(dependentOnSchemaToBeLoaded,function(value,key,eachCbForEachOf) {


                        async.eachSeries(value,function(single_desc,eachCb) {

                            _checkCollection(single_desc,key,eachCb);

                        },function(err) {

                            eachCbForEachOf(err);

                        })

                    },function(err) {
                        fn(err);
                    })

                } else {
                    fn(err);
                }

            })
        })
}

datasource_description.findAllDescriptionAndSetup = _findAllDescriptionAndSetup;


var _GetDescriptionsWith_uid_importRevision = function (uid, revision, fn) {
    this.findOne({uid: uid, importRevision: revision, fe_visible: true})
        .populate('_team')
        .lean()
        .exec(function (err, descriptions) {
            if (err) {
                winston.error("❌ Error occurred when finding datasource description with uid and importRevision ", err);
                fn(err, null);
            } else {
                fn(err, descriptions);
            }
        })
};

datasource_description.GetDescriptionsWith_uid_importRevision = _GetDescriptionsWith_uid_importRevision;

module.exports = datasource_description;