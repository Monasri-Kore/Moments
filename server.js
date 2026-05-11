require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const { initDB } = require('./db');
const { router: authRouter } = require('./auth');
const albumsRouter        = require('./albums');
const mediaRouter         = require('./media');
const friendsRouter       = require('./friends');
const notificationsRouter = require('./notifications');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin:'*', methods:['GET','POST','PATCH','DELETE'], allowedHeaders:['Content-Type','Authorization'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));
app.use(express.static(__dirname));

app.use('/api/auth',          authRouter);
app.use('/api/albums',        albumsRouter);
app.use('/api/media',         mediaRouter);
app.use('/api/friends',       friendsRouter);
app.use('/api/notifications', notificationsRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('*', (req, res) => {
  const f = path.join(__dirname, 'index.html');
  fs.existsSync(f) ? res.sendFile(f) : res.status(404).json({ error: 'Not found.' });
});

async function start() {
  await initDB();
  app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
}
start().catch(e => { console.error(e); process.exit(1); });
