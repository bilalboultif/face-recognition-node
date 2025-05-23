const mongoose = require('mongoose');



// Face Features Schema
const faceFeatureSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    descriptor: { type: [Number], required: true },
    createdAt: { type: Date, default: Date.now }
});

const FaceFeature = mongoose.model('Face_feature', faceFeatureSchema);

module.exports = FaceFeature;
