const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    age: { type: Number, required: true },
    role: { type: String, enum: ['admin', 'client'], required: true },
    password: { type: String, required: true },
    securityCode: { type: String, required: false },  // Optional for both admins and clients
    socketId: { type: String, default: null }, // Ensure this field is present
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
     // New fields
     firstName: { type: String, required: true },
     lastName: { type: String, required: true },
     gender: { type: String, required: true },
    // Admin will have a list of client IDs
    clients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],  // List of client IDs (client references)
    image: { type: String, required: false } // ← New image field
    
});

// Check if the model is already defined (to avoid overwriting)
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

module.exports = Admin;
 