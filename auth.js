const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { run, get } = require('./db');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token. Please log in.' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    get('SELECT id,name,email,college,avatar_initials,storage_used FROM users WHERE id=?', [decoded.userId])
      .then(user => {
        if (!user) return res.status(401).json({ error: 'User not found.' });
        req.user = user; next();
      }).catch(() => res.status(500).json({ error: 'Auth error.' }));
  } catch(e) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function getInitials(name) { return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function makeToken(id) { return jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: '7d' }); }

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, college } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const existing = await get('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const initials = getInitials(name);
    await run('INSERT INTO users (id,name,email,password,college,avatar_initials) VALUES (?,?,?,?,?,?)',
      [id, name, email.toLowerCase(), hashed, college||null, initials]);
    res.status(201).json({ message: 'Account created!', token: makeToken(id),
      user: { id, name, email: email.toLowerCase(), college, avatar_initials: initials } });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Registration failed.' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    const user = await get('SELECT * FROM users WHERE email=?', [email.toLowerCase()]);
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid email or password.' });
    res.json({ message: 'Logged in!', token: makeToken(user.id),
      user: { id:user.id, name:user.name, email:user.email, college:user.college, avatar_initials:user.avatar_initials, storage_used:user.storage_used } });
  } catch(e) { res.status(500).json({ error: 'Login failed.' }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const albums  = await get('SELECT COUNT(*) as c FROM albums WHERE owner_id=?', [req.user.id]);
    const photos  = await get('SELECT COUNT(*) as c FROM media WHERE uploader_id=?', [req.user.id]);
    const friends = await get(`SELECT COUNT(*) as c FROM friends WHERE (requester_id=? OR receiver_id=?) AND status='accepted'`, [req.user.id, req.user.id]);
    res
