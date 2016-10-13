var fs = require('fs');
var winston = require('winston');
var mongoose_client = require('../../../lib/mongoose_client/mongoose_client');
var datasource_description = require('../../models/datasource_descriptions');
var Promise = require('q').Promise;



module.exports =  {
    GetDescriptions : function(fn) {
        if (typeof fn == 'function') {
            mongoose_client.WhenMongoDBConnected(function () {
                datasource_description.find({fe_visible:true})
                    .lean()
                    .exec(function(err,descriptions) {
                        if (err) {
                            winston.error("❌ Error occurred when finding datasource description: ", err);
                        } else {
                            fn(descriptions);
                        }

                    })

            })

        } else {
            // winston.error("❌ not passing function to GetDescriptions for callback ");

        }


    },

    GetDescriptionsToSetup : function(files,fn) {
        if (!files || files.length == 0)
            files = require('./default.js').Datasources;
        
        mongoose_client.WhenMongoDBConnected(function () {
            function asyncFunction (file, cb) {

                datasource_description.findOne({uid:file})
                    .lean()
                    .exec(function(err,description) {
                        if (err) {
                            winston.error("❌ Error occurred when finding datasource description: ", err);
                        } else {
                            cb(description);
                        }
                    })
            }
            var requests = files.map((file) => {
                return new Promise((resolve) => {
                  asyncFunction(file, resolve);
                });
            });
            Promise.all(requests).then(function(data) {
                fn(data);
            });
        })
 

    }, 

    GetDescriptionsWith_uid_importRevision : function(uid,revision,fn) {


        datasource_description.findOne({uid: uid,importRevision: revision,fe_visible:true})
            .lean()
            .exec(function(err,descriptions) {
                if (err) {
                    winston.error("❌ Error occurred when finding datasource description with uid and importRevision ", err);
                } else {
                    fn(descriptions);
                }
            })

    }






}



