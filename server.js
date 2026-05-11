// server.js — Moments Backend Entry Point
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { initDB } = require('./db');

const authRoutes          = require('./routes/auth');
const albumRoutes         = require('./routes/albums');
const mediaRoutes         = require('./routes/media');
const friendRoutes        = require('./routes/friends');
const notificationRoutes  = require('./routes/notifications');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────
app.use(cors({
  origin: '*',   // In production: set to your frontend URL
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend (if placed in a "public" folder next to server.js)
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ──────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/albums',        albumRoutes);
app.use('/api/media',         mediaRoutes);
app.use('/api/friends',       friendRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Moments backend is running 🎉', time: new Date().toISOString() });
});

// Catch-all: serve frontend for any unknown route (SPA support)
app.get('*', (req, res) => {
  const frontendPath = path.join(__dirname, 'public', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(frontendPath)) {
    res.sendFile(frontendPath);
  } else {
    res.status(404).json({ error: 'Route not found.' });
  }
});

// ── Error handler ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// ── Start ───────────────────────────────────────────────────────
async function start() {
  await initDB();   // Create DB tables if they don't exist
  app.listen(PORT, () => {
    console.log(`\n🚀 Moments backend running at http://localhost:${PORT}`);
    console.log(`📁 Uploads stored in: ./uploads`);
    console.log(`🔑 JWT secret loaded: ${process.env.JWT_SECRET ? 'yes' : 'NO — check your .env!'}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
