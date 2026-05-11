// routes/albums.js — Album CRUD + member management
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db');
const authMiddleware = require('../middleware/auth');

// All album routes require login
router.use(authMiddleware);

// GET /api/albums — List all albums the user owns or is a member of
router.get('/', async (req, res) => {
  try {
    const albums = await all(
      `SELECT a.*, 
              u.name as owner_name,
              (SELECT COUNT(*) FROM media m WHERE m.album_id = a.id) as photo_count,
              (SELECT COUNT(*) FROM album_members am WHERE am.album_id = a.id) as member_count
       FROM albums a
       JOIN users u ON u.id = a.owner_id
       WHERE a.owner_id = ?
          OR a.id IN (SELECT album_id FROM album_members WHERE user_id = ?)
       ORDER BY a.created_at DESC`,
      [req.user.id, req.user.id]
    );

    res.json({ albums });
  } catch (err) {
    console.error('List albums error:', err);
    res.status(500).json({ error: 'Could not fetch albums.' });
  }
});

// POST /api/albums — Create a new album
router.post('/', async (req, res) => {
  try {
    const { name, description, emoji, visibility } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Album name is required.' });
    }

    const albumId = uuidv4();

    await run(
      'INSERT INTO albums (id, name, description, emoji, owner_id, visibility) VALUES (?, ?, ?, ?, ?, ?)',
      [albumId, name, description || null, emoji || '📸', req.user.id, visibility || 'friends']
    );

    // Owner is also a member
    await run(
      'INSERT INTO album_members (album_id, user_id, role) VALUES (?, ?, ?)',
      [albumId, req.user.id, 'owner']
    );

    const album = await get('SELECT * FROM albums WHERE id = ?', [albumId]);
    res.status(201).json({ message: 'Album created!', album });
  } catch (err) {
    console.error('Create album error:', err);
    res.status(500).json({ error: 'Could not create album.' });
  }
});

// GET /api/albums/:id — Get a single album with its media
router.get('/:id', async (req, res) => {
  try {
    const album = await get(
      `SELECT a.*, u.name as owner_name
       FROM albums a JOIN users u ON u.id = a.owner_id
       WHERE a.id = ?`,
      [req.params.id]
    );

    if (!album) {
      return res.status(404).json({ error: 'Album not found.' });
    }

    // Check access
    const isMember = await get(
      'SELECT 1 FROM album_members WHERE album_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!isMember && album.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this album.' });
    }

    // Get media
    const media = await all(
      `SELECT m.*, u.name as uploader_name, u.avatar_initials,
              (SELECT COUNT(*) FROM likes l WHERE l.media_id = m.id) as like_count,
              (SELECT COUNT(*) FROM comments c WHERE c.media_id = m.id) as comment_count,
              EXISTS(SELECT 1 FROM likes l WHERE l.media_id = m.id AND l.user_id = ?) as liked_by_me
       FROM media m JOIN users u ON u.id = m.uploader_id
       WHERE m.album_id = ?
       ORDER BY m.created_at DESC`,
      [req.user.id, req.params.id]
    );

    // Get members
    const members = await all(
      `SELECT u.id, u.name, u.college, u.avatar_initials, am.role
       FROM album_members am JOIN users u ON u.id = am.user_id
       WHERE am.album_id = ?`,
      [req.params.id]
    );

    res.json({ album, media, members });
  } catch (err) {
    console.error('Get album error:', err);
    res.status(500).json({ error: 'Could not fetch album.' });
  }
});

// PATCH /api/albums/:id — Update album details
router.patch('/:id', async (req, res) => {
  try {
    const album = await get('SELECT * FROM albums WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
    if (!album) return res.status(404).json({ error: 'Album not found or you are not the owner.' });

    const { name, description, emoji, visibility } = req.body;
    const updates = [];
    const params = [];

    if (name)        { updates.push('name = ?');        params.push(name); }
    if (description) { updates.push('description = ?'); params.push(description); }
    if (emoji)       { updates.push('emoji = ?');       params.push(emoji); }
    if (visibility)  { updates.push('visibility = ?');  params.push(visibility); }

    if (updates.length > 0) {
      params.push(req.params.id);
      await run(`UPDATE albums SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    res.json({ message: 'Album updated!' });
  } catch (err) {
    console.error('Update album error:', err);
    res.status(500).json({ error: 'Could not update album.' });
  }
});

// DELETE /api/albums/:id — Delete album (owner only)
router.delete('/:id', async (req, res) => {
  try {
    const album = await get('SELECT * FROM albums WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
    if (!album) return res.status(404).json({ error: 'Album not found or you are not the owner.' });

    await run('DELETE FROM albums WHERE id = ?', [req.params.id]);
    res.json({ message: 'Album deleted.' });
  } catch (err) {
    console.error('Delete album error:', err);
    res.status(500).json({ error: 'Could not delete album.' });
  }
});

// POST /api/albums/:id/members — Add a friend to album
router.post('/:id/members', async (req, res) => {
  try {
    const album = await get('SELECT * FROM albums WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
    if (!album) return res.status(403).json({ error: 'Only the album owner can add members.' });

    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required.' });

    const user = await get('SELECT id FROM users WHERE id = ?', [user_id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const already = await get('SELECT 1 FROM album_members WHERE album_id = ? AND user_id = ?', [req.params.id, user_id]);
    if (already) return res.status(409).json({ error: 'User is already a member.' });

    await run('INSERT INTO album_members (album_id, user_id) VALUES (?, ?)', [req.params.id, user_id]);

    // Notify the added user
    const notifId = uuidv4();
    await run(
      'INSERT INTO notifications (id, user_id, from_user_id, type, message, link) VALUES (?, ?, ?, ?, ?, ?)',
      [notifId, user_id, req.user.id, 'album_invite',
       `${req.user.name} added you to the album "${album.name}"`,
       `/albums/${req.params.id}`]
    );

    res.json({ message: 'Member added to album.' });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Could not add member.' });
  }
});

// DELETE /api/albums/:id/members/:userId — Remove a member
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const album = await get('SELECT * FROM albums WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
    if (!album) return res.status(403).json({ error: 'Only the album owner can remove members.' });

    await run('DELETE FROM album_members WHERE album_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
    res.json({ message: 'Member removed.' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Could not remove member.' });
  }
});

module.exports = router;
