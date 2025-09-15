require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Cloudinary config with fallback
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dlfhykisk',
    api_key: process.env.CLOUDINARY_API_KEY || '239914458915717',
    api_secret: process.env.CLOUDINARY_API_SECRET || '7ZoO1BbNZm2oLK64uEHBzEU0VIs'
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(__dirname));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/fontawesome', express.static(path.join(__dirname, 'fontawesome')));

// Multer setup for Cloudinary
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// MongoDB Schema
const bookingSchema = new mongoose.Schema({
    bookingId: String,
    fullname: String,
    mobile: String,
    adults: Number,
    roomType: String,
    occupancy: String,
    totalAmount: Number,
    paymentReceipt: String,
    bookingStatus: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model('Booking', bookingSchema);

// Pre-booking schema for admin to customer flow
const preBookingSchema = new mongoose.Schema({
    preBookingId: String,
    fullname: String,
    mobile: String,
    adults: Number,
    roomType: String,
    occupancy: String,
    totalAmount: Number,
    bookingLink: String,
    status: { type: String, default: 'pending' }, // pending, completed, expired
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24*60*60*1000) }, // 24 hours
    createdAt: { type: Date, default: Date.now }
});

const PreBooking = mongoose.model('PreBooking', preBookingSchema);

// MongoDB connection with better error handling
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sk8113347_db_user:sDOTrPq6tzLJnbrA@cluster0.qjf61mx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

console.log('🔄 Connecting to MongoDB Atlas...');

// Global connection state
let isMongoConnected = false;

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    bufferMaxEntries: 0,
    maxPoolSize: 10,
    minPoolSize: 5,
    maxIdleTimeMS: 30000,
    bufferCommands: true, // Enable buffering to prevent errors
})
    .then(() => {
        console.log('✅ MongoDB Atlas Connected Successfully');
        console.log('📊 Database ready for operations');
        isMongoConnected = true;
    })
    .catch(err => {
        console.log('❌ MongoDB connection error:', err.message);
        console.log('⚠️  Server will continue but database operations may fail');
        isMongoConnected = false;
    });

// Routes
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true, token: 'admin-token-123' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

app.post('/api/bookings', upload.single('payment_receipt'), async (req, res) => {
    try {
        console.log('📝 Booking request received:', req.body);
        const { fullname, mobile, adult, room, occupancy, total_amount } = req.body;
        
        // Validate required fields
        if (!fullname || !mobile || !adult || !room || !total_amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }
        
        let receiptUrl = null;
        
        // Upload to Cloudinary if file exists
        if (req.file) {
            try {
                console.log('📤 Uploading to Cloudinary...');
                const result = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { 
                            resource_type: 'image',
                            folder: 'ashoka-receipts',
                            public_id: `receipt-${Date.now()}`
                        },
                        (error, result) => {
                            if (error) {
                                console.error('Cloudinary error:', error);
                                reject(error);
                            } else {
                                console.log('✅ Cloudinary upload success');
                                resolve(result);
                            }
                        }
                    ).end(req.file.buffer);
                });
                receiptUrl = result.secure_url;
            } catch (cloudError) {
                console.error('❌ Cloudinary upload failed:', cloudError);
                // Continue without receipt URL
            }
        }
        
        const bookingData = {
            bookingId: 'ASH' + Date.now(),
            fullname,
            mobile,
            adults: parseInt(adult),
            roomType: room,
            occupancy: occupancy || null,
            totalAmount: parseInt(total_amount),
            paymentReceipt: receiptUrl
        };

        console.log('💾 Saving booking to database...');
        const booking = new Booking(bookingData);
        await booking.save();
        console.log('✅ Booking saved successfully');

        res.json({
            success: true,
            bookingId: booking.bookingId,
            message: 'Booking submitted successfully'
        });
    } catch (error) {
        console.error('❌ Booking error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.get('/api/admin/bookings', async (req, res) => {
    try {
        console.log('📋 Loading admin bookings...');
        
        // Check if MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
            console.log('⚠️  MongoDB not connected, returning empty bookings');
            return res.json({ success: true, bookings: [] });
        }
        
        const bookings = await Booking.find().sort({ createdAt: -1 });
        const formattedBookings = bookings.map(booking => ({
            id: booking.bookingId,
            fullname: booking.fullname,
            mobile: booking.mobile,
            adult: booking.adults,
            room: booking.roomType,
            occupancy: booking.occupancy,
            total_amount: booking.totalAmount,
            payment_receipt: booking.paymentReceipt,
            status: booking.bookingStatus,
            created_at: booking.createdAt
        }));
        
        console.log(`✅ Loaded ${formattedBookings.length} bookings`);
        res.json({ success: true, bookings: formattedBookings });
    } catch (error) {
        console.error('❌ Bookings error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        console.log('📊 Loading admin stats...');
        
        // Check if MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
            console.log('⚠️  MongoDB not connected, returning default stats');
            return res.json({
                success: true,
                stats: { 
                    total_bookings: 0, 
                    today_bookings: 0,
                    pending_bookings: 0 
                }
            });
        }
        
        const total = await Booking.countDocuments();
        const pending = await Booking.countDocuments({ bookingStatus: 'pending' });
        
        // Get current date in YYYY-MM-DD format
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Find bookings created today
        const allBookings = await Booking.find({});
        const todayBookings = allBookings.filter(booking => {
            const bookingDate = booking.createdAt.toISOString().split('T')[0];
            return bookingDate === todayStr;
        });
        
        console.log('✅ Stats loaded successfully');
        res.json({
            success: true,
            stats: { 
                total_bookings: total, 
                today_bookings: todayBookings.length,
                pending_bookings: pending 
            }
        });
    } catch (error) {
        console.error('❌ Stats error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/bookings/:id', async (req, res) => {
    try {
        const { status } = req.body;
        await Booking.findOneAndUpdate(
            { bookingId: req.params.id },
            { bookingStatus: status }
        );
        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/create-booking-link', async (req, res) => {
    try {
        const { fullname, mobile, adult, room, occupancy, total_amount } = req.body;
        
        const preBookingId = 'PRE' + Date.now();
        
        // Map room types to their respective HTML pages
        const roomPageMap = {
            'Standard Room': 'standard.html',
            'Executive Room': 'executive.html',
            'Super Executive Room': 'super executive.html',
            'Suite Room': 'Suite.html'
        };
        
        const roomPage = roomPageMap[room] || 'standard.html';
        const bookingLink = `${req.protocol}://${req.get('host')}/${roomPage}?prebooking=${preBookingId}`;
        
        const preBookingData = {
            preBookingId,
            fullname,
            mobile,
            adults: parseInt(adult),
            roomType: room,
            occupancy: occupancy || null,
            totalAmount: parseInt(total_amount),
            bookingLink
        };

        const preBooking = new PreBooking(preBookingData);
        await preBooking.save();

        res.json({
            success: true,
            preBookingId,
            bookingLink,
            message: 'Booking link created successfully'
        });
    } catch (error) {
        console.error('❌ Pre-booking error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/book-room', upload.single('payment_receipt'), async (req, res) => {
    try {
        const { fullname, mobile, adult, room, occupancy, total_amount } = req.body;
        
        let receiptUrl = null;
        
        // Upload to Cloudinary if file exists
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { 
                        resource_type: 'image',
                        folder: 'ashoka-receipts',
                        public_id: `admin-receipt-${Date.now()}`
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.file.buffer);
            });
            receiptUrl = result.secure_url;
        }
        
        const bookingData = {
            bookingId: 'ASH' + Date.now(),
            fullname,
            mobile,
            adults: parseInt(adult),
            roomType: room,
            occupancy: occupancy || null,
            totalAmount: parseInt(total_amount),
            paymentReceipt: receiptUrl,
            bookingStatus: 'confirmed' // Admin bookings are auto-confirmed
        };

        const booking = new Booking(bookingData);
        await booking.save();

        res.json({
            success: true,
            bookingId: booking.bookingId,
            message: 'Room booked successfully by admin'
        });
    } catch (error) {
        console.error('❌ Admin booking error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Files now served from Cloudinary CDN

app.get('/api/pre-booking/:id', async (req, res) => {
    try {
        const preBooking = await PreBooking.findOne({ 
            preBookingId: req.params.id,
            status: 'pending',
            expiresAt: { $gt: new Date() }
        });
        
        if (!preBooking) {
            return res.status(404).json({ success: false, error: 'Booking link expired or not found' });
        }
        
        res.json({ 
            success: true, 
            preBooking: {
                fullname: preBooking.fullname,
                mobile: preBooking.mobile,
                adults: preBooking.adults,
                roomType: preBooking.roomType,
                occupancy: preBooking.occupancy,
                totalAmount: preBooking.totalAmount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/complete-booking/:id', upload.single('payment_receipt'), async (req, res) => {
    try {
        const preBooking = await PreBooking.findOne({ 
            preBookingId: req.params.id,
            status: 'pending',
            expiresAt: { $gt: new Date() }
        });
        
        if (!preBooking) {
            return res.status(404).json({ success: false, error: 'Booking link expired or not found' });
        }
        
        let receiptUrl = null;
        
        // Upload receipt to Cloudinary
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { 
                        resource_type: 'image',
                        folder: 'ashoka-receipts',
                        public_id: `customer-receipt-${Date.now()}`
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.file.buffer);
            });
            receiptUrl = result.secure_url;
        }
        
        // Create actual booking
        const bookingData = {
            bookingId: 'ASH' + Date.now(),
            fullname: preBooking.fullname,
            mobile: preBooking.mobile,
            adults: preBooking.adults,
            roomType: preBooking.roomType,
            occupancy: preBooking.occupancy,
            totalAmount: preBooking.totalAmount,
            paymentReceipt: receiptUrl,
            bookingStatus: 'pending'
        };

        const booking = new Booking(bookingData);
        await booking.save();
        
        // Mark pre-booking as completed
        await PreBooking.findOneAndUpdate(
            { preBookingId: req.params.id },
            { status: 'completed' }
        );

        res.json({
            success: true,
            bookingId: booking.bookingId,
            message: 'Booking completed successfully'
        });
    } catch (error) {
        console.error('❌ Complete booking error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.get('/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/standard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'standard.html'));
});

app.get('/executive.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'executive.html'));
});

app.get('/super\ executive.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'super executive.html'));
});

app.get('/Suite.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'Suite.html'));
});

// Add missing HTML routes
app.get('/about.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'about.html'));
});

app.get('/contact.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'contact.html'));
});

app.get('/gallery.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'gallery.html'));
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});

// Error handlers with detailed logging
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    console.error('Stack:', err.stack);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err.message);
    console.error('Stack:', err.stack);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('📊 Environment check:');
    console.log('- MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Missing');
    console.log('- Cloudinary Name:', process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing');
    console.log('- Cloudinary Key:', process.env.CLOUDINARY_API_KEY ? 'Set' : 'Missing');
    console.log('- Cloudinary Secret:', process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Missing');
});