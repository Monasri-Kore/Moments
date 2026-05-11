// routes/notifications.js — Activity feed / notifications
const express = require('express');
const router = express.Router();
const { run, all, get } = require('./db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/notifications — Get all notifications for current user
router.get('/', async (req, res) => {
  try {
    const notifications = await all(
      `SELECT n.*, u.name as from_name, u.avatar_initials as from_initials
       FROM notifications n
       LEFT JOIN users u ON u.id = n.from_user_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const unreadCount = await get(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    res.json({ notifications, unread_count: unreadCount.count });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ error: 'Could not fetch notifications.' });
  }
});

// PATCH /api/notifications/read-all — Mark all as read
router.patch('/read-all', async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update notifications.' });
  }
});

module.exports = router;
