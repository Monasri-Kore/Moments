// routes/media.js — Upload, delete, like, comment on photos/videos
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { run, get, all } = require('../db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// --- MULTER SETUP ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only images (JPG, PNG, GIF, WebP) and videos (MP4, MOV, WebM) are allowed.'), false);
};

const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '100');

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 }
});

// POST /api/media/upload — Upload one or more files to an album
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    const { album_id, caption } = req.body;

    if (!album_id) {
      return res.status(400).json({ error: 'album_id is required.' });
    }

    // Check user has access to the album
    const member = await get(
      'SELECT 1 FROM album_members WHERE album_id = ? AND user_id = ?',
      [album_id, req.user.id]
    );
    if (!member) {
      return res.status(403).json({ error: 'You are not a member of this album.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const uploaded = [];
    let totalSize = 0;

    for (const file of req.files) {
      const mediaId = uuidv4();
      await run(
        'INSERT INTO media (id, album_id, uploader_id, filename, original_name, mimetype, size, caption) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [mediaId, album_id, req.user.id, file.filename, file.originalname, file.mimetype, file.size, caption || null]
      );
      uploaded.push({ id: mediaId, filename: file.filename, original_name: file.originalname, size: file.size });
      totalSize += file.size;
    }

    // Update user storage usage
    await run('UPDATE users SET storage_used = storage_used + ? WHERE id = ?', [totalSize, req.user.id]);

    // Notify album members
    const album = await get('SELECT * FROM albums WHERE id = ?', [album_id]);
    const members = await all(
      'SELECT user_id FROM album_members WHERE album_id = ? AND user_id != ?',
      [album_id, req.user.id]
    );

    for (const m of members) {
      const notifId = uuidv4();
      await run(
        'INSERT INTO notifications (id, user_id, from_user_id, type, message, link) VALUES (?, ?, ?, ?, ?, ?)',
        [notifId, m.user_id, req.user.id, 'new_upload',
         `${req.user.name} uploaded ${req.files.length} photo(s) to "${album.name}"`,
         `/albums/${album_id}`]
      );
    }

    res.status(201).json({
      message: `${uploaded.length} file(s) uploaded successfully!`,
      media: uploaded
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File too large. Max size is ${maxSizeMB} MB.` });
    }
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

// GET /api/media/:id — Get single media item with likes and comments
router.get('/:id', async (req, res) => {
  try {
    const media = await get(
      `SELECT m.*, u.name as uploader_name, u.avatar_initials,
              (SELECT COUNT(*) FROM likes l WHERE l.media_id = m.id) as like_count,
              EXISTS(SELECT 1 FROM likes WHERE media_id = m.id AND user_id = ?) as liked_by_me
       FROM media m JOIN users u ON u.id = m.uploader_id
       WHERE m.id = ?`,
      [req.user.id, req.params.id]
    );

    if (!media) return res.status(404).json({ error: 'Media not found.' });

    // Check album access
    const member = await get(
      'SELECT 1 FROM album_members WHERE album_id = ? AND user_id = ?',
      [media.album_id, req.user.id]
    );
    if (!member) return res.status(403).json({ error: 'Access denied.' });

    // Get comments
    const comments = await all(
      `SELECT c.*, u.name as user_name, u.avatar_initials
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.media_id = ?
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );

    res.json({ media, comments });
  } catch (err) {
    console.error('Get media error:', err);
    res.status(500).json({ error: 'Could not fetch media.' });
  }
});

// DELETE /api/media/:id — Delete a media item
router.delete('/:id', async (req, res) => {
  try {
    const media = await get('SELECT * FROM media WHERE id = ?', [req.params.id]);
    if (!media) return res.status(404).json({ error: 'Media not found.' });

    // Only uploader or album owner can delete
    const album = await get('SELECT owner_id FROM albums WHERE id = ?', [media.album_id]);
    if (media.uploader_id !== req.user.id && album.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'You cannot delete this file.' });
    }

    // Delete file from disk
    const filePath = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', media.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // Free up storage
    await run('UPDATE users SET storage_used = MAX(0, storage_used - ?) WHERE id = ?', [media.size, media.uploader_id]);
    await run('DELETE FROM media WHERE id = ?', [req.params.id]);

    res.json({ message: 'File deleted.' });
  } catch (err) {
    console.error('Delete media error:', err);
    res.status(500).json({ error: 'Could not delete file.' });
  }
});

// POST /api/media/:id/like — Like or unlike
router.post('/:id/like', async (req, res) => {
  try {
    const media = await get('SELECT * FROM media WHERE id = ?', [req.params.id]);
    if (!media) return res.status(404).json({ error: 'Media not found.' });

    const existing = await get('SELECT 1 FROM likes WHERE media_id = ? AND user_id = ?', [req.params.id, req.user.id]);

    if (existing) {
      await run('DELETE FROM likes WHERE media_id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ liked: false, message: 'Unliked.' });
    } else {
      await run('INSERT INTO likes (media_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id]);

      // Notify uploader (not if liking own photo)
      if (media.uploader_id !== req.user.id) {
        const notifId = uuidv4();
        await run(
          'INSERT INTO notifications (id, user_id, from_user_id, type, message, link) VALUES (?, ?, ?, ?, ?, ?)',
          [notifId, media.uploader_id, req.user.id, 'like',
           `${req.user.name} liked your photo`,
           `/media/${req.params.id}`]
        );
      }

      res.json({ liked: true, message: 'Liked!' });
    }
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: 'Could not update like.' });
  }
});

// POST /api/media/:id/comments — Add a comment
router.post('/:id/comments', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text is required.' });

    const media = await get('SELECT * FROM media WHERE id = ?', [req.params.id]);
    if (!media) return res.status(404).json({ error: 'Media not found.' });

    const commentId = uuidv4();
    await run(
      'INSERT INTO comments (id, media_id, user_id, text) VALUES (?, ?, ?, ?)',
      [commentId, req.params.id, req.user.id, text.trim()]
    );

    // Notify uploader
    if (media.uploader_id !== req.user.id) {
      const notifId = uuidv4();
      await run(
        'INSERT INTO notifications (id, user_id, from_user_id, type, message) VALUES (?, ?, ?, ?, ?)',
        [notifId, media.uploader_id, req.user.id, 'comment',
         `${req.user.name} commented: "${text.trim().slice(0, 50)}"`]
      );
    }

    res.status(201).json({ message: 'Comment added!', comment: { id: commentId, text: text.trim(), user_name: req.user.name } });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ error: 'Could not add comment.' });
  }
});

module.exports = router;
