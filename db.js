// db.js — SQLite database setup
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'moments.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Could not connect to database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database');
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Helper: run a query that modifies data (INSERT, UPDATE, DELETE)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

// Helper: get one row
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Helper: get multiple rows
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Create all tables
async function initDB() {
  // Users table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      college     TEXT,
      avatar_initials TEXT,
      storage_used INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  // Albums table
  await run(`
    CREATE TABLE IF NOT EXISTS albums (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      emoji       TEXT DEFAULT '📸',
      description TEXT,
      owner_id    TEXT NOT NULL,
      visibility  TEXT DEFAULT 'friends',
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Album members (who can view/contribute to an album)
  await run(`
    CREATE TABLE IF NOT EXISTS album_members (
      album_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      role        TEXT DEFAULT 'member',
      joined_at   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (album_id, user_id),
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
    )
  `);

  // Media (photos and videos)
  await run(`
    CREATE TABLE IF NOT EXISTS media (
      id          TEXT PRIMARY KEY,
      album_id    TEXT NOT NULL,
      uploader_id TEXT NOT NULL,
      filename    TEXT NOT NULL,
      original_name TEXT,
      mimetype    TEXT,
      size        INTEGER DEFAULT 0,
      caption     TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (album_id)    REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY (uploader_id) REFERENCES users(id)  ON DELETE CASCADE
    )
  `);

  // Likes
  await run(`
    CREATE TABLE IF NOT EXISTS likes (
      media_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (media_id, user_id),
      FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Comments
  await run(`
    CREATE TABLE IF NOT EXISTS comments (
      id          TEXT PRIMARY KEY,
      media_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      text        TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Friends
  await run(`
    CREATE TABLE IF NOT EXISTS friends (
      id          TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      receiver_id  TEXT NOT NULL,
      status       TEXT DEFAULT 'pending',
      created_at   TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id)  REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Notifications (activity feed)
  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      from_user_id TEXT,
      type        TEXT NOT NULL,
      message     TEXT NOT NULL,
      link        TEXT,
      is_read     INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database tables ready');
}

module.exports = { db, run, get, all, initDB };
