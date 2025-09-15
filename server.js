require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Create uploads directory
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Multer setup
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, 'receipt-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

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
        
        const bookingData = {
            bookingId: 'ASH' + Date.now(),
            fullname,
            mobile,
            adults: parseInt(adult),
            roomType: room,
            occupancy: occupancy || null,
            totalAmount: parseInt(total_amount),
            paymentReceipt: req.file ? req.file.filename : null
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

app.use('/uploads', express.static('uploads'));

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