const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');
const User = require('./models/Client');
const FaceFeature = require('./models/FaceFeature');
const UserImage = require('./models/UserImage');
const Attendance = require('./models/Attendance');
require('dotenv').config();
const PDFDocument = require('pdfkit');

const app = express();
const port = process.env.PORT_SERVER || 5555;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Request entity too large',
            details: 'The image data is too large. Please try with a smaller image.'
        });
    }
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Serve static files
app.use(express.static('public', {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
        if (filePath.endsWith('.shard1') || filePath.endsWith('.shard2')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', fs.statSync(filePath).size);
        }
    }
}));

// MongoDB Connection
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) throw new Error('MONGO_URI is not defined in environment variables');

        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
                        dbName: 'myDatabase'
        });

        console.log('Connected to MongoDB successfully');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};



// API Routes

app.post('/register-client', async (req, res) => {
    const {
        adminId, username, email, phoneNumber, password, confirmPassword,
        age, gender, firstName, lastName, image, faceDescriptor // <- new image field
    } = req.body;

    if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    const securityCodeGenerated = Math.random().toString(36).substr(2, 8);

    try {
        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(400).json({ success: false, message: "Admin not found" });
        }

        const existingClient = await User.findOne({ email });
        if (existingClient) {
            return res.status(400).json({ success: false, message: "Email already registered" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newClient = new User({
            username,
            email,
            phoneNumber,
            age,
            password: hashedPassword,
            role: 'client',
            securityCode: securityCodeGenerated,
            admin: adminId,
            adminEmail: admin.email,
            adminPhoneNumber: admin.phoneNumber,
            adminSocketId: admin.adminSocketId,
            gender: gender || null,
            firstName: firstName || null,
            lastName: lastName || null,
            adminGender: admin.gender || null,
            adminFirstName: admin.firstName || null,
            adminLastName: admin.lastName || null,
            image: image || null,
            faceDescriptor: faceDescriptor || null
        });

        await newClient.save();
        // Save face descriptor
        if (faceDescriptor) {
            try {
                const parsedDescriptor = Array.isArray(faceDescriptor)
                    ? faceDescriptor
                    : typeof faceDescriptor === 'string'
                        ? JSON.parse(faceDescriptor)
                        : Object.values(faceDescriptor); // fallback for numeric-keyed objects
                const faceFeature = new FaceFeature({
                    user_id: newClient._id,
                    descriptor: parsedDescriptor
                });
                await faceFeature.save();
            } catch (error) {
                console.error('Error saving face descriptor:', error);
            }
        }

        // Save user image
        if (image) {
            try {
                const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
                const userImage = new UserImage({
                    user_id: newClient._id,
                    image_type: 'face_registration',
                    image_data: base64Data
                });
                await userImage.save();
            } catch (error) {
                console.error('Error saving user image:', error);
            }
        }
        admin.clients.push(newClient._id);
        await admin.save();

        res.status(201).json({
            success: true,
            message: "Client registered and linked to the admin successfully",
            client: newClient
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});


// Register Route
app.post('/api/register', async (req, res) => {
    try {
        const {
            username,
            email,
            phoneNumber,
            age,
            role,
            password,
            securityCode,
            latitude,
            longitude,
            gender,
            firstName,
            lastName,
            adminEmail,
            adminPhoneNumber,
            group,
            alertType,
            faceDescriptor,
            image
        } = req.body;

        if (!username || !email || !phoneNumber || !age || !role || !password || !adminEmail || !adminPhoneNumber) {
            return res.status(400).json({ error: 'Required fields are missing' });
        }

        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            username,
            email,
            phoneNumber,
            age,
            role,
            password: hashedPassword,
            securityCode,
            latitude,
            longitude,
            gender,
            firstName,
            lastName,
            adminEmail,
            adminPhoneNumber,
            group,
            alertType,
            faceDescriptor: faceDescriptor || null
        });

        await user.save();

        // Save face descriptor
        if (faceDescriptor) {
            try {
                const parsedDescriptor = JSON.parse(faceDescriptor);
                const faceFeature = new FaceFeature({
                    user_id: user._id,
                    descriptor: parsedDescriptor
                });
                await faceFeature.save();
            } catch (error) {
                console.error('Error saving face descriptor:', error);
            }
        }

        // Save user image
        if (image) {
            try {
                const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
                const userImage = new UserImage({
                    user_id: user._id,
                    image_type: 'face_registration',
                    image_data: base64Data
                });
                await userImage.save();
            } catch (error) {
                console.error('Error saving user image:', error);
            }
        }

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Error registering user', details: error.message });
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching users' });
    }
});

// Get user by ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id, '-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching user' });
    }
});

// Face verification endpoint
app.post('/api/verify-face', async (req, res) => {
    try {
        const { faceDescriptor } = req.body;
        
        if (!faceDescriptor || !Array.isArray(faceDescriptor)) {
            return res.status(400).json({ error: 'Invalid face descriptor' });
        }

        // Get all face features from the database
        const faceFeatures = await FaceFeature.find({}).populate('user_id');
        
        let bestMatch = null;
        let bestDistance = 0.6; // Threshold for face matching

        // Compare with each face feature
        for (const feature of faceFeatures) {
            if (!feature.descriptor) continue;

            const storedDescriptor = feature.descriptor;
            // Calculate Euclidean distance between descriptors
            const distance = calculateDistance(faceDescriptor, storedDescriptor);

            if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = feature.user_id; // This is the user document
            }
        }

        if (bestMatch) {
            // Update verification count and timestamp
            bestMatch.faceVerificationCount += 1;
            bestMatch.lastFaceVerification = new Date();
            await bestMatch.save();

            // Get user image
            const userImage = await UserImage.findOne({ 
                user_id: bestMatch._id,
                image_type: 'face_registration'
            });

            // Return complete user info without sensitive data
            res.json({
                success: true,
                user: {
                    _id: bestMatch._id,
                    username: bestMatch.username,
                    email: bestMatch.email,
                    phoneNumber: bestMatch.phoneNumber,
                    age: bestMatch.age,
                    role: bestMatch.role,
                    securityCode: bestMatch.securityCode,
                    status: bestMatch.status,
                    gender: bestMatch.gender,
                    firstName: bestMatch.firstName,
                    lastName: bestMatch.lastName,
                    admin: bestMatch.admin,
                    adminEmail: bestMatch.adminEmail,
                    adminPhoneNumber: bestMatch.adminPhoneNumber,
                    image: userImage ? `data:image/jpeg;base64,${userImage.image_data}` : null,
                    createdAt: bestMatch.createdAt,
                    updatedAt: bestMatch.updatedAt,
                    lastSeen: bestMatch.lastSeen,
                    latitude: bestMatch.latitude,
                    longitude: bestMatch.longitude
                }
            });
        } else {
            res.status(401).json({ success: false, error: 'Face not recognized' });
        }
    } catch (error) {
        console.error('Face verification error:', error);
        res.status(500).json({ error: 'Error verifying face' });
    }
});

// Helper function to calculate Euclidean distance between two face descriptors
function calculateDistance(desc1, desc2) {
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
        sum += Math.pow(desc1[i] - desc2[i], 2);
    }
    return Math.sqrt(sum);
}

// Mark attendance
app.post('/api/mark-attendance', async (req, res) => {
    try {
        const { userId, timestamp } = req.body;
        
        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Check if attendance already marked today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const existingAttendance = await Attendance.findOne({
            userId,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (existingAttendance) {
            return res.json({
                success: true,
                message: 'Attendance already marked for today',
                existingAttendance: {
                    timestamp: existingAttendance.timestamp,
                    date: existingAttendance.date,
                    time: existingAttendance.time
                },
                user: user
            });
        }

        // Create new attendance record
        const attendance = new Attendance({
            userId,
            name: `${user.firstName} ${user.lastName}`,
            timestamp: timestamp || new Date(),
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString()
        });

        await attendance.save();
        res.json({ success: true, message: 'Attendance marked successfully' });
    } catch (error) {
        console.error('Error marking attendance:', error);
        res.status(500).json({ success: false, error: 'Error marking attendance' });
    }
});

// Get attendance records
app.get('/api/attendance', async (req, res) => {
    try {
        const { from, to, userId } = req.query;
        
        if (!from || !to) {
            return res.status(400).json({ success: false, error: 'Missing date range' });
        }

        // Parse dates and set time to start/end of day in UTC
        const fromDate = new Date(from);
        fromDate.setUTCHours(0, 0, 0, 0);
        
        const toDate = new Date(to);
        toDate.setUTCHours(23, 59, 59, 999);

        // Build query
        const query = {
            date: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        // Add userId filter if provided
        if (userId) {
            query.userId = userId;
        }

        // Get all attendance records
        const records = await Attendance.find(query).sort({ date: -1 });

        // Get all unique user IDs from the records
        const userIds = records.map(record => record.userId);
        
        // Get user details
        const users = await User.find({ _id: { $in: userIds } });
        const userMap = users.reduce((acc, user) => {
            acc[user._id.toString()] = user;
            return acc;
        }, {});

        // Get user images
        const userImages = await UserImage.find({
            user_id: { $in: userIds },
            image_type: 'face_registration'
        });
        const userImageMap = userImages.reduce((acc, img) => {
            acc[img.user_id.toString()] = img.image_data;
            return acc;
        }, {});

        // Transform records
        const transformedRecords = records.map(record => {
            const user = userMap[record.userId.toString()];
            const date = new Date(record.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            return {
                _id: record._id,
                name: record.name,
                time: record.time,
                date: formattedDate,
                user: user ? {
                    _id: user._id,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    age: user.age,
                    role: user.role,
                    gender: user.gender,
                    admin: user.admin,
                    adminEmail: user.adminEmail,
                    adminPhoneNumber: user.adminPhoneNumber,
                    image: userImageMap[user._id.toString()] ? 
                        `data:image/jpeg;base64,${userImageMap[user._id.toString()]}` : 
                        user.image
                } : null
            };
        });

        res.json({ 
            success: true, 
            records: transformedRecords,
            dateRange: {
                from: fromDate.toISOString(),
                to: toDate.toISOString()
            }
        });
    } catch (error) {
        console.error('Error fetching attendance:', error);
        res.status(500).json({ success: false, error: 'Error fetching attendance records' });
    }
});

// Export attendance records
app.get('/api/export-attendance', async (req, res) => {
    try {
        const { from, to, userId } = req.query;
        
        if (!from || !to) {
            return res.status(400).json({ success: false, error: 'Missing date range' });
        }

        if (!userId) {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

        // Parse dates and set time to start/end of day in UTC
        const fromDate = new Date(from);
        fromDate.setUTCHours(0, 0, 0, 0);
        
        const toDate = new Date(to);
        toDate.setUTCHours(23, 59, 59, 999);

        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Get user image
        const userImage = await UserImage.findOne({
            user_id: userId,
            image_type: 'face_registration'
        });

        // Get attendance records for this user
        const records = await Attendance.find({
            userId,
            date: {
                $gte: fromDate,
                $lte: toDate
            }
        }).sort({ date: -1 });

        // Create PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50
        });
        const filename = `attendance_report_${from}_to_${to}_user.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        
        doc.pipe(res);

        // Add gradient header
        const headerHeight = 100;
        doc.rect(0, 0, doc.page.width, headerHeight)
           .fill('#4A90E2', '#2C3E50');
        
        // Add title with modern font
        doc.font('Helvetica-Bold')
           .fontSize(32)
           .fillColor('#FFFFFF')
           .text('Attendance Report', {
               align: 'center',
               valign: 'center',
               height: headerHeight
           });

        // Add user info section with image
        doc.moveDown(2)
           .font('Helvetica-Bold')
           .fontSize(16)
           .fillColor('#2C3E50')
           .text('User Information', {
               underline: true
           });

        // Add user image if available
        if (userImage) {
            try {
                const imageBuffer = Buffer.from(userImage.image_data, 'base64');
                const imageWidth = 150;
                const imageHeight = 150;
                const x = (doc.page.width - imageWidth) / 2;
                
                // Add circular image with shadow
                doc.save();
                doc.circle(x + imageWidth/2, doc.y + imageHeight/2, imageWidth/2)
                   .fill('#FFFFFF');
                doc.restore();
                
                doc.image(imageBuffer, x, doc.y, {
                    width: imageWidth,
                    height: imageHeight,
                    fit: [imageWidth, imageHeight]
                });
                
                doc.moveDown(8);
            } catch (error) {
                console.error('Error adding image to PDF:', error);
            }
        }

        // Add user details in a table format
        const userInfo = [
            ['Name', `${user.firstName} ${user.lastName}`],
            ['Username', user.username],
            ['Email', user.email],
            ['Phone', user.phoneNumber],
            ['Role', user.role],
            ['Gender', user.gender],
            ['Age', user.age],
            ['Status', user.status],
            ['Admin Email', user.adminEmail],
            ['Admin Phone', user.adminPhoneNumber],
            ['Security Code', user.securityCode],
            ['Created At', new Date(user.createdAt).toLocaleString()],
            ['Updated At', new Date(user.updatedAt).toLocaleString()],
            ['Location', user.latitude && user.longitude ? 
                `${user.latitude}, ${user.longitude}` : 'Not available']
        ];

        // Calculate table position for center alignment
        const tableWidth = 400;
        const tableX = (doc.page.width - tableWidth) / 2;

        // Draw user info table
        userInfo.forEach(([label, value], index) => {
            const y = doc.y;
            
            // Draw label
            doc.font('Helvetica-Bold')
               .fontSize(12)
               .fillColor('#666666')
               .text(label + ':', tableX, y, {
                   width: 150,
                   align: 'right'
               });
            
            // Draw value
            doc.font('Helvetica')
               .fontSize(12)
               .fillColor('#333333')
               .text(value || 'N/A', tableX + 170, y, {
                   width: 230
               });
        });

        // Add period
        doc.moveDown(2)
           .font('Helvetica-Bold')
           .fontSize(14)
           .fillColor('#666666')
           .text(`Report Period: ${from} to ${to}`, {
               align: 'center'
           });

        // Add summary section
        doc.moveDown(2)
           .font('Helvetica-Bold')
           .fontSize(16)
           .fillColor('#2C3E50')
           .text('Summary', {
               underline: true
           });

        // Add summary statistics
        doc.moveDown(1)
           .font('Helvetica')
           .fontSize(12)
           .fillColor('#666666')
           .text(`Total Attendance Records: ${records.length}`);

        // Add attendance records table
        doc.moveDown(2)
           .font('Helvetica-Bold')
           .fontSize(16)
           .fillColor('#2C3E50')
           .text('Attendance History', {
               underline: true
           });

        // Table headers for attendance records
        const attendanceTableTop = doc.y + 20;
        const attendanceTableLeft = 50;
        const attendanceTableWidth = 500;
        const attendanceColumnWidth = attendanceTableWidth / 2;
        
        // Draw attendance table headers
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .fillColor('#FFFFFF')
           .rect(attendanceTableLeft, attendanceTableTop, attendanceTableWidth, 30)
           .fill('#4A90E2');
        
        doc.text('Date', attendanceTableLeft + 10, attendanceTableTop + 10)
           .text('Time', attendanceTableLeft + attendanceColumnWidth + 10, attendanceTableTop + 10);

        // Draw attendance table rows
        let y = attendanceTableTop + 30;
        records.forEach((record, index) => {
            // Alternate row colors
            if (index % 2 === 0) {
                doc.fillColor('#F8F9FA')
                   .rect(attendanceTableLeft, y, attendanceTableWidth, 30)
                   .fill();
            }

            // Draw row content
            doc.font('Helvetica')
               .fontSize(10)
               .fillColor('#333333')
               .text(new Date(record.date).toLocaleDateString(), attendanceTableLeft + 10, y + 10)
               .text(record.time, attendanceTableLeft + attendanceColumnWidth + 10, y + 10);

            y += 30;

            // Add new page if needed
            if (y > doc.page.height - 100) {
                doc.addPage();
                y = 50;
            }
        });

        // Add footer with gradient
        const footerHeight = 50;
        const footerY = doc.page.height - footerHeight;
        
        doc.rect(0, footerY, doc.page.width, footerHeight)
           .fill('#4A90E2', '#2C3E50');
        
        doc.font('Helvetica')
           .fontSize(12)
           .fillColor('#FFFFFF')
           .text(`© ${new Date().getFullYear()} Attendance System. All rights reserved.`, {
               align: 'center',
               valign: 'center',
               height: footerHeight,
               y: footerY
           });

        doc.end();
    } catch (error) {
        console.error('Error exporting attendance:', error);
        res.status(500).json({ success: false, error: 'Error exporting attendance records' });
    }
});

// Get user attendance history
app.get('/api/user/:userId/attendance-history', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Get last 7 days date range
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // Get attendance records
        const [todayRecords, last7DaysRecords, allRecords] = await Promise.all([
            // Today's records
            Attendance.find({
                userId,
                date: {
                    $gte: today,
                    $lt: tomorrow
                }
            }),
            // Last 7 days records
            Attendance.find({
                userId,
                date: {
                    $gte: sevenDaysAgo,
                    $lt: tomorrow
                }
            }),
            // All records
            Attendance.find({ userId }).sort({ date: -1 })
        ]);
        
        // Get first detection
        const firstDetection = allRecords[allRecords.length - 1]?.date || new Date();
        
        // Prepare history data
        const history = {
            todayCount: todayRecords.length,
            last7DaysCount: last7DaysRecords.length,
            totalCount: allRecords.length,
            firstDetection,
            records: allRecords.map(record => ({
                date: record.date,
                time: record.time
            }))
        };
        
        res.json({
            success: true,
            user: {
                ...user.toObject(),
                lastSeen: user.lastSeen || new Date(),
                lastDetected: user.lastDetected || new Date()
            },
            history
        });
    } catch (error) {
        console.error('Error fetching user attendance history:', error);
        res.status(500).json({ success: false, error: 'Error fetching user attendance history' });
    }
});

// Start the server
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`🚀 Server running on http://localhost:${port}`);
    });
});