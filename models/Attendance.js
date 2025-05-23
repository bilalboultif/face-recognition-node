const mongoose = require('mongoose');

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    time: { type: String, required: true },
    date: { type: Date, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
