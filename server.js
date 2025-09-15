require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

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

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
    .then(() => console.log('✅ MongoDB Atlas Connected'))
    .catch(err => console.log('❌ MongoDB connection error:', err));

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
        const { fullname, mobile, adult, room, occupancy, total_amount } = req.body;
        
        let receiptUrl = null;
        
        // Upload to Cloudinary if file exists
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { 
                        resource_type: 'image',
                        folder: 'ashoka-receipts',
                        public_id: `receipt-${Date.now()}`
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
            paymentReceipt: receiptUrl
        };

        const booking = new Booking(bookingData);
        await booking.save();

        res.json({
            success: true,
            bookingId: booking.bookingId,
            message: 'Booking submitted successfully'
        });
    } catch (error) {
        console.error('❌ Booking error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/bookings', async (req, res) => {
    try {
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
        res.json({ success: true, bookings: formattedBookings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const total = await Booking.countDocuments();
        const pending = await Booking.countDocuments({ bookingStatus: 'pending' });
        
        // Get current date in YYYY-MM-DD format
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // Gets YYYY-MM-DD
        
        // Find bookings created today by comparing date strings
        const allBookings = await Booking.find({});
        const todayBookings = allBookings.filter(booking => {
            const bookingDate = booking.createdAt.toISOString().split('T')[0];
            return bookingDate === todayStr;
        });
        

        
        res.json({
            success: true,
            stats: { 
                total_bookings: total, 
                today_bookings: todayBookings.length,
                pending_bookings: pending 
            }
        });
    } catch (error) {
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
        const bookingLink = `${req.protocol}://${req.get('host')}/complete-booking.html?id=${preBookingId}`;
        
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
        
        res.json({ success: true, preBooking });
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

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});

// Error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('📋 Make sure MongoDB is running on port 27017');
});