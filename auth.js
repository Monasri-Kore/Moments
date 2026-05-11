// routes/auth.js — Register, Login, Get current user
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { run, get } = require('../db');
const authMiddleware = require('../middleware/auth');

// Helper: generate initials avatar
function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Helper: generate JWT
function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, college } = req.body;

    // Validate
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if email already exists
    const existing = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const initials = getInitials(name);

    await run(
      'INSERT INTO users (id, name, email, password, college, avatar_initials) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, name, email.toLowerCase(), hashedPassword, college || null, initials]
    );

    const token = generateToken(userId);

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: { id: userId, name, email: email.toLowerCase(), college, avatar_initials: initials }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user.id);

    res.json({
      message: 'Logged in successfully!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        college: user.college,
        avatar_initials: user.avatar_initials,
        storage_used: user.storage_used
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/auth/me — Get current logged-in user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // Get stats
    const albumCount = await get('SELECT COUNT(*) as count FROM albums WHERE owner_id = ?', [req.user.id]);
    const mediaCount = await get('SELECT COUNT(*) as count FROM media WHERE uploader_id = ?', [req.user.id]);
    const friendCount = await get(
      `SELECT COUNT(*) as count FROM friends 
       WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'`,
      [req.user.id, req.user.id]
    );

    res.json({
      ...req.user,
      stats: {
        albums: albumCount.count,
        photos: mediaCount.count,
        friends: friendCount.count
      }
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Could not fetch user data.' });
  }
});

// PATCH /api/auth/me — Update profile
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const { name, college } = req.body;
    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (college) { updates.push('college = ?'); params.push(college); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    params.push(req.user.id);
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: 'Profile updated successfully!' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Could not update profile.' });
  }
});

module.exports = router;
