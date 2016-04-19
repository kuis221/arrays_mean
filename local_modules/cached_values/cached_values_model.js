var mongoose_client = require('../mongoose_client/mongoose_client');
var mongoose = mongoose_client.mongoose;
var Schema = mongoose.Schema;
var CachedUniqValsByKey_scheme = Schema({
    srcDocPKey: String,
    limitedUniqValsByHumanReadableColName: Schema.Types.Mixed
});
var modelName = 'CachedUniqValsByKey';
exports.ModelName = modelName;
var mongooseModel = mongoose.model(modelName, CachedUniqValsByKey_scheme);
//
exports.MongooseModel = mongooseModel;