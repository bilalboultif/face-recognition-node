const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define the client schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    age: { type: Number, required: true },
    role: { type: String, enum: ['admin', 'client'], required: true },
    password: { type: String, required: true },
    securityCode: { type: String, required: false },  // Optional for both admins and clients
    socketId: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' }, // Add this reference field
        alertType: { 
        type: String, 
        enum: ['health', 'lost', 'none', 'low_battery'],  // Add 'low_battery' to enum
        required: false 
    },
    // Optional fields for client information
    gender: { type: String, enum: ['male', 'female'], required: false },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },

    // Adding fields for admin details
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },  // Reference to Admin model
    adminEmail: { type: String, required: true },  // Admin's email (saved in client document)
    adminPhoneNumber: { type: String, required: true },  // Admin's phone number (saved in client document)
    
    image: { type: String, required: false } // ← New image field

});

// Create the model
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
