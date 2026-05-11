// routes/friends.js — Friend requests and connections
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('./db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/friends — List all friends (accepted)
router.get('/', async (req, res) => {
  try {
    const friends = await all(
      `SELECT 
        f.id as friendship_id,
        f.status,
        f.created_at,
        CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END as friend_id,
        CASE WHEN f.requester_id = ? THEN ru.name ELSE su.name END as friend_name,
        CASE WHEN f.requester_id = ? THEN ru.college ELSE su.college END as friend_college,
        CASE WHEN f.requester_id = ? THEN ru.avatar_initials ELSE su.avatar_initials END as friend_initials
       FROM friends f
       JOIN users su ON su.id = f.requester_id
       JOIN users ru ON ru.id = f.receiver_id
       WHERE (f.requester_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
       ORDER BY f.created_at DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    res.json({ friends });
  } catch (err) {
    console.error('List friends error:', err);
    res.status(500).json({ error: 'Could not fetch friends.' });
  }
});

// GET /api/friends/requests — Incoming friend requests
router.get('/requests', async (req, res) => {
  try {
    const requests = await all(
      `SELECT f.id, f.created_at, u.id as from_id, u.name as from_name, u.college as from_college, u.avatar_initials
       FROM friends f JOIN users u ON u.id = f.requester_id
       WHERE f.receiver_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    res.json({ requests });
  } catch (err) {
    console.error('Friend requests error:', err);
    res.status(500).json({ error: 'Could not fetch requests.' });
  }
});

// POST /api/friends/request — Send a friend request by email
router.post('/request', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const target = await get('SELECT id, name FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!target) return res.status(404).json({ error: 'No user found with that email.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot add yourself.' });

    // Check if already friends or pending
    const existing = await get(
      `SELECT * FROM friends 
       WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`,
      [req.user.id, target.id, target.id, req.user.id]
    );

    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ error: 'You are already friends.' });
      if (existing.status === 'pending')  return res.status(409).json({ error: 'Friend request already sent.' });
    }

    const friendId = uuidv4();
    await run(
      'INSERT INTO friends (id, requester_id, receiver_id, status) VALUES (?, ?, ?, ?)',
      [friendId, req.user.id, target.id, 'pending']
    );

    // Notify receiver
    const notifId = uuidv4();
    await run(
      'INSERT INTO notifications (id, user_id, from_user_id, type, message) VALUES (?, ?, ?, ?, ?)',
      [notifId, target.id, req.user.id, 'friend_request',
       `${req.user.name} sent you a friend request`]
    );

    res.status(201).json({ message: `Friend request sent to ${target.name}!` });
  } catch (err) {
    console.error('Send friend request error:', err);
    res.status(500).json({ error: 'Could not send request.' });
  }
});

// PATCH /api/friends/:id/accept — Accept a friend request
router.patch('/:id/accept', async (req, res) => {
  try {
    const request = await get(
      'SELECT * FROM friends WHERE id = ? AND receiver_id = ? AND status = ?',
      [req.params.id, req.user.id, 'pending']
    );

    if (!request) return res.status(404).json({ error: 'Friend request not found.' });

    await run('UPDATE friends SET status = ? WHERE id = ?', ['accepted', req.params.id]);

    // Notify requester
    const notifId = uuidv4();
    await run(
      'INSERT INTO notifications (id, user_id, from_user_id, type, message) VALUES (?, ?, ?, ?, ?)',
      [notifId, request.requester_id, req.user.id, 'friend_accept',
       `${req.user.name} accepted your friend request`]
    );

    res.json({ message: 'Friend request accepted!' });
  } catch (err) {
    console.error('Accept friend error:', err);
    res.status(500).json({ error: 'Could not accept request.' });
  }
});

// DELETE /api/friends/:id — Remove friend or decline request
router.delete('/:id', async (req, res) => {
  try {
    const friendship = await get(
      'SELECT * FROM friends WHERE id = ? AND (requester_id = ? OR receiver_id = ?)',
      [req.params.id, req.user.id, req.user.id]
    );

    if (!friendship) return res.status(404).json({ error: 'Not found.' });

    await run('DELETE FROM friends WHERE id = ?', [req.params.id]);
    res.json({ message: 'Removed.' });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Could not remove.' });
  }
});

// GET /api/friends/search?q= — Search for users by name or college
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Search query must be at least 2 characters.' });

    const users = await all(
      `SELECT id, name, college, avatar_initials FROM users
       WHERE (name LIKE ? OR college LIKE ?) AND id != ?
       LIMIT 20`,
      [`%${q}%`, `%${q}%`, req.user.id]
    );

    res.json({ users });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

module.exports = router;
