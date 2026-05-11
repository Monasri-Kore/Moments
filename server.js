require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const sqlite3  = require('sqlite3').verbose();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const multer   = require('multer');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE ──────────────────────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, 'moments.db'), err => {
  if (err) { console.error('DB error:', err); process.exit(1); }
  console.log('✅ Database connected');
});
db.run('PRAGMA foreign_keys = ON');

function run(sql, p = []) {
  return new Promise((res, rej) => db.run(sql, p, function(e) { e ? rej(e) : res({ id: this.lastID }); }));
}
function get(sql, p = []) {
  return new Promise((res, rej) => db.get(sql, p, (e, row) => e ? rej(e) : res(row)));
}
function all(sql, p = []) {
  return new Promise((res, rej) => db.all(sql, p, (e, rows) => e ? rej(e) : res(rows)));
}

async function initDB() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, college TEXT, avatar_initials TEXT,
    storage_used INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT DEFAULT '📸',
    description TEXT, owner_id TEXT NOT NULL, visibility TEXT DEFAULT 'friends',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS album_members (
    album_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (album_id, user_id),
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY, album_id TEXT NOT NULL, uploader_id TEXT NOT NULL,
    filename TEXT NOT NULL, original_name TEXT, mimetype TEXT, size INTEGER DEFAULT 0,
    caption TEXT, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (album_id)    REFERENCES albums(id) ON DELETE CASCADE,
    FOREIGN KEY (uploader_id) REFERENCES users(id)  ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS likes (
    media_id TEXT NOT NULL, user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (media_id, user_id),
    FOREIGN KEY (media_id) REFERENCES media(id)  ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY, media_id TEXT NOT NULL, user_id TEXT NOT NULL,
    text TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY, requester_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id)  REFERENCES users(id) ON DELETE CASCADE)`);
  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, from_user_id TEXT,
    type TEXT NOT NULL, message TEXT NOT NULL, link TEXT,
    is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  console.log('✅ All tables ready');
}

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PATCH','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));
app.use(express.static(__dirname));

// ── AUTH MIDDLEWARE ───────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Please log in.' });
  try {
    const d = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET || 'moments_secret');
    get('SELECT id,name,email,college,avatar_initials,storage_used FROM users WHERE id=?', [d.userId])
      .then(u => { if (!u) return res.status(401).json({ error: 'User not found.' }); req.user = u; next(); })
      .catch(() => res.status(500).json({ error: 'Auth error.' }));
  } catch(e) { res.status(401).json({ error: 'Invalid token.' }); }
}

function initials(name) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2); }
function token(id) { return jwt.sign({ userId: id }, process.env.JWT_SECRET || 'moments_secret', { expiresIn: '7d' }); }

// ── MULTER ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm'];
    ok.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only images/videos allowed.'));
  },
  limits: { fileSize: 100 * 1024 * 1024 }
});

// ── HEALTH ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'Moments is running 🎉' }));

// ── AUTH ROUTES ───────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, college } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (await get('SELECT id FROM users WHERE email=?', [email.toLowerCase()]))
      return res.status(409).json({ error: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 12);
    const id = uuidv4(), ini = initials(name);
    await run('INSERT INTO users (id,name,email,password,college,avatar_initials) VALUES (?,?,?,?,?,?)',
      [id, name, email.toLowerCase(), hashed, college||null, ini]);
    res.status(201).json({ message: 'Account created!', token: token(id),
      user: { id, name, email: email.toLowerCase(), college, avatar_initials: ini } });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Registration failed.' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    const u = await get('SELECT * FROM users WHERE email=?', [email.toLowerCase()]);
    if (!u || !(await bcrypt.compare(password, u.password)))
      return res.status(401).json({ error: 'Invalid email or password.' });
    res.json({ message: 'Logged in!', token: token(u.id),
      user: { id:u.id, name:u.name, email:u.email, college:u.college, avatar_initials:u.avatar_initials, storage_used:u.storage_used } });
  } catch(e) { res.status(500).json({ error: 'Login failed.' }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const albums  = await get('SELECT COUNT(*) as c FROM albums WHERE owner_id=?', [req.user.id]);
    const photos  = await get('SELECT COUNT(*) as c FROM media WHERE uploader_id=?', [req.user.id]);
    const friends = await get("SELECT COUNT(*) as c FROM friends WHERE (requester_id=? OR receiver_id=?) AND status='accepted'", [req.user.id, req.user.id]);
    res.json({ ...req.user, stats: { albums: albums.c, photos: photos.c, friends: friends.c } });
  } catch(e) { res.status(500).json({ error: 'Could not fetch user.' }); }
});

app.patch('/api/auth/me', auth, async (req, res) => {
  try {
    const { name, college } = req.body;
    if (name)    await run('UPDATE users SET name=? WHERE id=?', [name, req.user.id]);
    if (college) await run('UPDATE users SET college=? WHERE id=?', [college, req.user.id]);
    res.json({ message: 'Profile updated!' });
  } catch(e) { res.status(500).json({ error: 'Update failed.' }); }
});

// ── ALBUM ROUTES ──────────────────────────────────────────────
app.get('/api/albums', auth, async (req, res) => {
  try {
    const albums = await all(
      `SELECT a.*, u.name as owner_name,
        (SELECT COUNT(*) FROM media m WHERE m.album_id=a.id) as photo_count,
        (SELECT COUNT(*) FROM album_members am WHERE am.album_id=a.id) as member_count
       FROM albums a JOIN users u ON u.id=a.owner_id
       WHERE a.owner_id=? OR a.id IN (SELECT album_id FROM album_members WHERE user_id=?)
       ORDER BY a.created_at DESC`, [req.user.id, req.user.id]);
    res.json({ albums });
  } catch(e) { res.status(500).json({ error: 'Could not fetch albums.' }); }
});

app.post('/api/albums', auth, async (req, res) => {
  try {
    const { name, description, emoji, visibility } = req.body;
    if (!name) return res.status(400).json({ error: 'Album name required.' });
    const id = uuidv4();
    await run('INSERT INTO albums (id,name,description,emoji,owner_id,visibility) VALUES (?,?,?,?,?,?)',
      [id, name, description||null, emoji||'📸', req.user.id, visibility||'friends']);
    await run('INSERT INTO album_members (album_id,user_id,role) VALUES (?,?,?)', [id, req.user.id, 'owner']);
    const album = await get('SELECT * FROM albums WHERE id=?', [id]);
    res.status(201).json({ message: 'Album created!', album });
  } catch(e) { res.status(500).json({ error: 'Could not create album.' }); }
});

app.get('/api/albums/:id', auth, async (req, res) => {
  try {
    const album = await get('SELECT a.*,u.name as owner_name FROM albums a JOIN users u ON u.id=a.owner_id WHERE a.id=?', [req.params.id]);
    if (!album) return res.status(404).json({ error: 'Album not found.' });
    const isMember = await get('SELECT 1 FROM album_members WHERE album_id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!isMember && album.owner_id !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
    const media   = await all(`SELECT m.*,u.name as uploader_name,u.avatar_initials,
      (SELECT COUNT(*) FROM likes l WHERE l.media_id=m.id) as like_count,
      EXISTS(SELECT 1 FROM likes WHERE media_id=m.id AND user_id=?) as liked_by_me
      FROM media m JOIN users u ON u.id=m.uploader_id WHERE m.album_id=? ORDER BY m.created_at DESC`, [req.user.id, req.params.id]);
    const members = await all('SELECT u.id,u.name,u.college,u.avatar_initials,am.role FROM album_members am JOIN users u ON u.id=am.user_id WHERE am.album_id=?', [req.params.id]);
    res.json({ album, media, members });
  } catch(e) { res.status(500).json({ error: 'Could not fetch album.' }); }
});

app.delete('/api/albums/:id', auth, async (req, res) => {
  try {
    const album = await get('SELECT * FROM albums WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
    if (!album) return res.status(404).json({ error: 'Album not found.' });
    await run('DELETE FROM albums WHERE id=?', [req.params.id]);
    res.json({ message: 'Album deleted.' });
  } catch(e) { res.status(500).json({ error: 'Could not delete album.' }); }
});

app.post('/api/albums/:id/members', auth, async (req, res) => {
  try {
    const album = await get('SELECT * FROM albums WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
    if (!album) return res.status(403).json({ error: 'Only album owner can add members.' });
    const { user_id } = req.body;
    const already = await get('SELECT 1 FROM album_members WHERE album_id=? AND user_id=?', [req.params.id, user_id]);
    if (already) return res.status(409).json({ error: 'Already a member.' });
    await run('INSERT INTO album_members (album_id,user_id) VALUES (?,?)', [req.params.id, user_id]);
    await run('INSERT INTO notifications (id,user_id,from_user_id,type,message) VALUES (?,?,?,?,?)',
      [uuidv4(), user_id, req.user.id, 'album_invite', `${req.user.name} added you to "${album.name}"`]);
    res.json({ message: 'Member added.' });
  } catch(e) { res.status(500).json({ error: 'Could not add member.' }); }
});

// ── MEDIA ROUTES ──────────────────────────────────────────────
app.post('/api/media/upload', auth, upload.array('files', 20), async (req, res) => {
  try {
    const { album_id, caption } = req.body;
    if (!album_id) return res.status(400).json({ error: 'album_id required.' });
    const member = await get('SELECT 1 FROM album_members WHERE album_id=? AND user_id=?', [album_id, req.user.id]);
    if (!member) return res.status(403).json({ error: 'Not a member of this album.' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded.' });
    let totalSize = 0;
    const uploaded = [];
    for (const file of req.files) {
      const id = uuidv4();
      await run('INSERT INTO media (id,album_id,uploader_id,filename,original_name,mimetype,size,caption) VALUES (?,?,?,?,?,?,?,?)',
        [id, album_id, req.user.id, file.filename, file.originalname, file.mimetype, file.size, caption||null]);
      uploaded.push({ id, filename: file.filename });
      totalSize += file.size;
    }
    await run('UPDATE users SET storage_used=storage_used+? WHERE id=?', [totalSize, req.user.id]);
    const album   = await get('SELECT name FROM albums WHERE id=?', [album_id]);
    const members = await all('SELECT user_id FROM album_members WHERE album_id=? AND user_id!=?', [album_id, req.user.id]);
    for (const m of members)
      await run('INSERT INTO notifications (id,user_id,from_user_id,type,message) VALUES (?,?,?,?,?)',
        [uuidv4(), m.user_id, req.user.id, 'new_upload', `${req.user.name} uploaded ${req.files.length} photo(s) to "${album.name}"`]);
    res.status(201).json({ message: `${uploaded.length} file(s) uploaded!`, media: uploaded });
  } catch(e) {
    if (e.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 100MB.' });
    res.status(500).json({ error: e.message || 'Upload failed.' });
  }
});

app.get('/api/media/:id', auth, async (req, res) => {
  try {
    const media = await get(`SELECT m.*,u.name as uploader_name,u.avatar_initials,
      (SELECT COUNT(*) FROM likes l WHERE l.media_id=m.id) as like_count,
      EXISTS(SELECT 1 FROM likes WHERE media_id=m.id AND user_id=?) as liked_by_me
      FROM media m JOIN users u ON u.id=m.uploader_id WHERE m.id=?`, [req.user.id, req.params.id]);
    if (!media) return res.status(404).json({ error: 'Not found.' });
    const comments = await all('SELECT c.*,u.name as user_name,u.avatar_initials FROM comments c JOIN users u ON u.id=c.user_id WHERE c.media_id=? ORDER BY c.created_at ASC', [req.params.id]);
    res.json({ media, comments });
  } catch(e) { res.status(500).json({ error: 'Could not fetch media.' }); }
});

app.delete('/api/media/:id', auth, async (req, res) => {
  try {
    const media = await get('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (!media) return res.status(404).json({ error: 'Not found.' });
    const album = await get('SELECT owner_id FROM albums WHERE id=?', [media.album_id]);
    if (media.uploader_id !== req.user.id && album.owner_id !== req.user.id)
      return res.status(403).json({ error: 'Cannot delete this file.' });
    const fp = path.join(uploadDir, media.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await run('UPDATE users SET storage_used=MAX(0,storage_used-?) WHERE id=?', [media.size, media.uploader_id]);
    await run('DELETE FROM media WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted.' });
  } catch(e) { res.status(500).json({ error: 'Could not delete.' }); }
});

app.post('/api/media/:id/like', auth, async (req, res) => {
  try {
    const media = await get('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (!media) return res.status(404).json({ error: 'Not found.' });
    const existing = await get('SELECT 1 FROM likes WHERE media_id=? AND user_id=?', [req.params.id, req.user.id]);
    if (existing) {
      await run('DELETE FROM likes WHERE media_id=? AND user_id=?', [req.params.id, req.user.id]);
      res.json({ liked: false });
    } else {
      await run('INSERT INTO likes (media_id,user_id) VALUES (?,?)', [req.params.id, req.user.id]);
      if (media.uploader_id !== req.user.id)
        await run('INSERT INTO notifications (id,user_id,from_user_id,type,message) VALUES (?,?,?,?,?)',
          [uuidv4(), media.uploader_id, req.user.id, 'like', `${req.user.name} liked your photo`]);
      res.json({ liked: true });
    }
  } catch(e) { res.status(500).json({ error: 'Like failed.' }); }
});

app.post('/api/media/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text required.' });
    const media = await get('SELECT * FROM media WHERE id=?', [req.params.id]);
    if (!media) return res.status(404).json({ error: 'Not found.' });
    const id = uuidv4();
    await run('INSERT INTO comments (id,media_id,user_id,text) VALUES (?,?,?,?)', [id, req.params.id, req.user.id, text.trim()]);
    if (media.uploader_id !== req.user.id)
      await run('INSERT INTO notifications (id,user_id,from_user_id,type,message) VALUES (?,?,?,?,?)',
        [uuidv4(), media.uploader_id, req.user.id, 'comment', `${req.user.name} commented on your photo`]);
    res.status(201).json({ message: 'Comment added!', comment: { id, text: text.trim(), user_name: req.user.name } });
  } catch(e) { res.status(500).json({ error: 'Comment failed.' }); }
});

// ── FRIEND ROUTES ─────────────────────────────────────────────
app.get('/api/friends', auth, async (req, res) => {
  try {
    const friends = await all(
      `SELECT f.id as friendship_id, f.status, f.created_at,
        CASE WHEN f.requester_id=? THEN f.receiver_id  ELSE f.requester_id  END as friend_id,
        CASE WHEN f.requester_id=? THEN ru.name        ELSE su.name         END as friend_name,
        CASE WHEN f.requester_id=? THEN ru.college     ELSE su.college      END as friend_college,
        CASE WHEN f.requester_id=? THEN ru.avatar_initials ELSE su.avatar_initials END as friend_initials
       FROM friends f
       JOIN users su ON su.id=f.requester_id
       JOIN users ru ON ru.id=f.receiver_id
       WHERE (f.requester_id=? OR f.receiver_id=?) AND f.status='accepted'
       ORDER BY f.created_at DESC`,
      [req.user.id,req.user.id,req.user.id,req.user.id,req.user.id,req.user.id]);
    res.json({ friends });
  } catch(e) { res.status(500).json({ error: 'Could not fetch friends.' }); }
});

app.get('/api/friends/requests', auth, async (req, res) => {
  try {
    const requests = await all(
      'SELECT f.id,f.created_at,u.id as from_id,u.name as from_name,u.college as from_college,u.avatar_initials FROM friends f JOIN users u ON u.id=f.requester_id WHERE f.receiver_id=? AND f.status=?',
      [req.user.id, 'pending']);
    res.json({ requests });
  } catch(e) { res.status(500).json({ error: 'Could not fetch requests.' }); }
});

app.get('/api/friends/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short.' });
    const users = await all('SELECT id,name,college,avatar_initials FROM users WHERE (name LIKE ? OR college LIKE ?) AND id!=? LIMIT 20',
      [`%${q}%`, `%${q}%`, req.user.id]);
    res.json({ users });
  } catch(e) { res.status(500).json({ error: 'Search failed.' }); }
});

app.post('/api/friends/request', auth, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required.' });
    const target = await get('SELECT id,name FROM users WHERE email=?', [email.toLowerCase()]);
    if (!target) return res.status(404).json({ error: 'No user found with that email.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot add yourself.' });
    const existing = await get('SELECT * FROM friends WHERE (requester_id=? AND receiver_id=?) OR (requester_id=? AND receiver_id=?)',
      [req.user.id,target.id,target.id,req.user.id]);
    if (existing) {
      if (existing.status==='accepted') return res.status(409).json({ error: 'Already friends.' });
      if (existing.status==='pending')  return res.status(409).json({ error: 'Request already sent.' });
    }
    await run('INSERT INTO friends (id,requester_id,receiver_id,status) VALUES (?,?,?,?)', [uuidv4(),req.user.id,target.id,'pending']);
    await run('INSERT INTO notifications (id,user_id,from_user_id,type,message) VALUES (?,?,?,?,?)',
      [uuidv4(),target.id,req.user.id,'friend_request',`${req.user.name} sent you a friend request`]);
    res.status(201).json({ message: `Friend request sent to ${target.name}!` });
  } catch(e) { res.status(500).json({ error: 'Could not send request.' }); }
});

app.patch('/api/friends/:id/accept', auth, async (req, res) => {
  try {
    const freq = await get("SELECT * FROM friends WHERE id=? AND receiver_id=? AND status='pending'", [req.params.id, req.user.id]);
    if (!freq) return res.status(404).json({ error: 'Request not found.' });
    await run('UPDATE friends SET status=? WHERE id=?', ['accepted', req.params.id]);
    await run('INSERT INTO notifications (id,user_id,from_user_id,type,message) VALUES (?,?,?,?,?)',
      [uuidv4(),freq.requester_id,req.user.id,'friend_accept',`${req.user.name} accepted your friend request`]);
    res.json({ message: 'Friend added!' });
  } catch(e) { res.status(500).json({ error: 'Could not accept.' }); }
});

app.delete('/api/friends/:id', auth, async (req, res) => {
  try {
    await run('DELETE FROM friends WHERE id=? AND (requester_id=? OR receiver_id=?)', [req.params.id,req.user.id,req.user.id]);
    res.json({ message: 'Removed.' });
  } catch(e) { res.status(500).json({ error: 'Could not remove.' }); }
});

// ── NOTIFICATION ROUTES ───────────────────────────────────────
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const notifications = await all(
      'SELECT n.*,u.name as from_name,u.avatar_initials as from_initials FROM notifications n LEFT JOIN users u ON u.id=n.from_user_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 50',
      [req.user.id]);
    const unread = await get('SELECT COUNT(*) as count FROM notifications WHERE user_id=? AND is_read=0', [req.user.id]);
    res.json({ notifications, unread_count: unread.count });
  } catch(e) { res.status(500).json({ error: 'Could not fetch notifications.' }); }
});

app.patch('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);
    res.json({ message: 'All read.' });
  } catch(e) { res.status(500).json({ error: 'Failed.' }); }
});

// ── CATCH ALL ─────────────────────────────────────────────────
app.get('*', (req, res) => {
  const f = path.join(__dirname, 'index.html');
  fs.existsSync(f) ? res.sendFile(f) : res.status(404).json({ error: 'Not found.' });
});

// ── START ─────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Moments running on port ${PORT}`));
}).catch(e => { console.error('Startup failed:', e); process.exit(1); });
