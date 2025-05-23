const mongoose = require('mongoose');

// User Image Schema
const userImageSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    image_type: { type: String, required: true },
    image_data: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const UserImage = mongoose.model('User_image', userImageSchema);

module.exports = UserImage;
