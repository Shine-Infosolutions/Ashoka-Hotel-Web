const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Multer setup for memory storage (Vercel doesn't support file system)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://sk8113347_db_user:sDOTrPq6tzLJnbrA@cluster0.qjf61mx.mongodb.net/ashoka-hotel?retryWrites=true&w=majority&appName=Cluster0';

if (mongoose.connection.readyState === 0) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('✅ MongoDB Atlas connected'))
        .catch(() => console.log('❌ MongoDB not connected, using memory storage'));
}

// Booking Schema
const bookingSchema = new mongoose.Schema({
    bookingId: String,
    fullname: String,
    mobile: String,
    adults: Number,
    roomType: String,
    totalAmount: Number,
    paymentReceipt: String,
    createdAt: { type: Date, default: Date.now },
    bookingStatus: { type: String, default: 'pending' }
});

const Booking = mongoose.model('Booking', bookingSchema);

// In-memory storage as backup
let bookings = [];

// Routes
app.post('/api/bookings', upload.single('payment_receipt'), async (req, res) => {
    try {
        const { fullname, mobile, adult, room, total_amount } = req.body;
        
        const bookingData = {
            bookingId: "B" + Date.now(),
            fullname,
            mobile,
            adults: parseInt(adult),
            roomType: room,
            totalAmount: parseInt(total_amount),
            paymentReceipt: req.file ? `receipt-${Date.now()}` : null,
            bookingStatus: 'pending'
        };

        // Try MongoDB first, fallback to memory
        try {
            const booking = new Booking(bookingData);
            await booking.save();
            console.log('✅ Saved to MongoDB');
        } catch (err) {
            bookings.push(bookingData);
            console.log('✅ Saved to memory');
        }

        res.json({
            success: true,
            bookingId: bookingData.bookingId,
            message: 'Booking submitted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/bookings', async (req, res) => {
    try {
        let allBookings = [];
        try {
            allBookings = await Booking.find().sort({ createdAt: -1 });
        } catch (err) {
            allBookings = bookings;
        }
        
        const formattedBookings = allBookings.map(booking => ({
            id: booking.bookingId,
            fullname: booking.fullname,
            mobile: booking.mobile,
            adult: booking.adults,
            room: booking.roomType,
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
        let total = 0, pending = 0;
        try {
            total = await Booking.countDocuments();
            pending = await Booking.countDocuments({ bookingStatus: 'pending' });
        } catch (err) {
            total = bookings.length;
            pending = bookings.filter(b => b.bookingStatus === 'pending').length;
        }
        
        res.json({
            success: true,
            stats: { total_bookings: total, today_bookings: 0, pending_bookings: pending }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true, token: 'admin-token-123' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

app.put('/api/admin/bookings/:id', async (req, res) => {
    try {
        const { status } = req.body;
        try {
            await Booking.findOneAndUpdate(
                { bookingId: req.params.id },
                { bookingStatus: status }
            );
        } catch (err) {
            const booking = bookings.find(b => b.bookingId === req.params.id);
            if (booking) booking.bookingStatus = status;
        }
        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Export for Vercel
module.exports = app;