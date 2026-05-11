// ============================================================
//  Moments — Frontend ↔ Backend connector
//  All API calls go through this file
// ============================================================

// Auto-detects: uses same host on Railway/production, localhost in development
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : window.location.origin + '/api';

// ── Token helpers ────────────────────────────────────────────
function getToken()  { return localStorage.getItem('moments_token'); }
function setToken(t) { localStorage.setItem('moments_token', t); }
function clearToken(){ localStorage.removeItem('moments_token'); localStorage.removeItem('moments_user'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('moments_user')); } catch { return null; } }
function setUser(u)  { localStorage.setItem('moments_user', JSON.stringify(u)); }

// ── API request helper ───────────────────────────────────────
async function api(method, path, body = null, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!isFormData && body) headers['Content-Type'] = 'application/json';

  const res = await fetch(API + path, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : null)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ── Navigation ───────────────────────────────────────────────
function go(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) { target.classList.add('active'); window.scrollTo(0, 0); }
  document.querySelectorAll('.nav-links a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageId);
  });
  if (pageId === 'page-dashboard') loadDashboard();
  if (pageId === 'page-albums')    loadAlbums();
  if (pageId === 'page-friends')   loadFriends();
  if (pageId === 'page-profile')   loadProfile();
  if (pageId === 'page-upload')    loadAlbumDropdown();
}

// ── Toast ────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}

// ── Loading spinner ──────────────────────────────────────────
function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) { btn.dataset.orig = btn.textContent; btn.textContent = 'Please wait…'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.orig || btn.textContent; btn.disabled = false; }
}

// ── Auth guard ───────────────────────────────────────────────
function requireAuth() {
  if (!getToken()) { go('page-login'); return false; }
  return true;
}

function showAuthNav(show) {
  document.querySelectorAll('[data-auth]').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
  const loginBtn = document.querySelector('.nav-links .btn-nav');
  if (loginBtn) loginBtn.style.display = show ? 'none' : '';
}

// ── LOGIN ────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn      = e.target.querySelector('button[type=submit]');
  const email    = e.target.querySelector('input[type=email]').value.trim();
  const password = e.target.querySelector('input[type=password]').value;
  if (!email || !password) { toast('Please fill in all fields.', 'error'); return; }

  setLoading(btn, true);
  try {
    const data = await api('POST', '/auth/login', { email, password });
    setToken(data.token);
    setUser(data.user);
    showAuthNav(true);
    toast('Welcome back, ' + data.user.name.split(' ')[0] + '! 👋');
    setTimeout(() => go('page-dashboard'), 400);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ── SIGNUP ───────────────────────────────────────────────────
async function handleSignup(e) {
  e.preventDefault();
  const btn      = e.target.querySelector('button[type=submit]');
  const inputs   = e.target.querySelectorAll('input');
  const name     = inputs[0].value.trim();
  const email    = inputs[1].value.trim();
  const college  = inputs[2].value.trim();
  const password = inputs[3].value;

  if (!name || !email || !password) { toast('Please fill in all fields.', 'error'); return; }
  if (password.length < 6) { toast('Password must be at least 6 characters.', 'error'); return; }

  setLoading(btn, true);
  try {
    const data = await api('POST', '/auth/register', { name, email, password, college });
    setToken(data.token);
    setUser(data.user);
    showAuthNav(true);
    toast('Welcome to Moments, ' + data.user.name.split(' ')[0] + '! 🎉');
    setTimeout(() => go('page-dashboard'), 400);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ── LOGOUT ───────────────────────────────────────────────────
function handleLogout() {
  clearToken();
  showAuthNav(false);
  toast('Logged out. See you soon!');
  go('page-landing');
}

// ── DASHBOARD ────────────────────────────────────────────────
async function loadDashboard() {
  if (!requireAuth()) return;
  try {
    const [userData, albumData, notifData] = await Promise.all([
      api('GET', '/auth/me'),
      api('GET', '/albums'),
      api('GET', '/notifications')
    ]);

    // Greeting
    const greetEl = document.querySelector('.greeting h2');
    if (greetEl) greetEl.textContent = 'Hi, ' + userData.name.split(' ')[0] + '! 👋';
    const greetSub = document.querySelector('.greeting p');
    const unread = notifData.unread_count || 0;
    if (greetSub) greetSub.textContent = unread > 0
      ? `You have ${unread} new update${unread > 1 ? 's' : ''} from friends.`
      : 'Everything is up to date.';

    // Stats
    const statNums = document.querySelectorAll('.stat-card .num');
    if (statNums[0]) statNums[0].textContent = userData.stats?.photos  || 0;
    if (statNums[1]) statNums[1].textContent = userData.stats?.albums  || 0;
    if (statNums[2]) statNums[2].textContent = userData.stats?.friends || 0;

    // Albums preview (first 3)
    const albumGrid = document.querySelector('#page-dashboard .album-grid');
    if (albumGrid) {
      const albums = albumData.albums.slice(0, 3);
      albumGrid.innerHTML = albums.length === 0
        ? '<p style="color:var(--text3);font-size:14px;grid-column:1/-1;">No albums yet. <a href="#" onclick="go(\'page-upload\')" style="color:var(--purple)">Create your first one →</a></p>'
        : albums.map(a => renderAlbumCard(a)).join('');
    }

    // Activity feed
    const feedContainer = document.getElementById('dashboard-feed');
    if (feedContainer) {
      const recent = notifData.notifications.slice(0, 5);
      feedContainer.innerHTML = recent.length === 0
        ? '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No recent activity yet.</p>'
        : recent.map(n => `
          <div class="feed-item">
            <div class="avatar" style="background:#CECBF6;color:#3C3489;">${escHtml(n.from_initials || '?')}</div>
            <div style="flex:1">
              <div class="feed-text">${escHtml(n.message)}</div>
              <div class="feed-time">${timeAgo(n.created_at)}</div>
            </div>
          </div>`).join('');
    }
  } catch (err) {
    console.error('Dashboard load error:', err);
    toast('Could not load dashboard.', 'error');
  }
}

// ── ALBUMS ───────────────────────────────────────────────────
async function loadAlbums() {
  if (!requireAuth()) return;
  try {
    const data = await api('GET', '/albums');
    const grid = document.getElementById('albums-grid');
    if (!grid) return;

    grid.innerHTML = data.albums.length === 0
      ? '<p style="color:var(--text3);font-size:14px;grid-column:1/-1;">No albums yet. Upload some moments to get started!</p>'
      : data.albums.map(a => renderAlbumCard(a)).join('');

    const lbl = document.getElementById('albums-count');
    if (lbl) lbl.textContent = data.albums.length + ' album' + (data.albums.length !== 1 ? 's' : '');
  } catch (err) {
    toast('Could not load albums.', 'error');
  }
}

function renderAlbumCard(a) {
  const emoji = a.emoji || '📸';
  return `
    <div class="album-card">
      <div class="album-thumb" style="background:${emojiGradient(emoji)};">${emoji}
        <span class="photo-count">${a.photo_count || 0}</span>
      </div>
      <div class="album-info">
        <div class="name">${escHtml(a.name)}</div>
        <div class="meta">${a.photo_count || 0} photos · ${a.member_count || 1} member${(a.member_count||1)!==1?'s':''}</div>
      </div>
    </div>`;
}

// ── NEW ALBUM MODAL ──────────────────────────────────────────
function showNewAlbumModal() { document.getElementById('new-album-modal')?.classList.add('active'); }
function hideNewAlbumModal() { document.getElementById('new-album-modal')?.classList.remove('active'); }

async function createAlbum(e) {
  e.preventDefault();
  const name  = document.getElementById('new-album-name')?.value.trim();
  const emoji = document.getElementById('new-album-emoji')?.value.trim() || '📸';
  if (!name) { toast('Please enter an album name.', 'error'); return; }

  const btn = e.target.querySelector('button[type=submit]');
  setLoading(btn, true);
  try {
    await api('POST', '/albums', { name, emoji });
    toast('Album "' + name + '" created!');
    hideNewAlbumModal();
    document.getElementById('new-album-name').value = '';
    document.getElementById('new-album-emoji').value = '';
    loadAlbums();
    loadAlbumDropdown();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ── UPLOAD ───────────────────────────────────────────────────
let selectedFiles = [];

function initUpload() {
  const zone = document.getElementById('upload-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragging');
    selectedFiles = Array.from(e.dataTransfer.files);
    renderFilePreviews(selectedFiles);
  });
  zone.addEventListener('click', () => document.getElementById('file-input')?.click());
  document.getElementById('file-input')?.addEventListener('change', e => {
    selectedFiles = Array.from(e.target.files);
    renderFilePreviews(selectedFiles);
  });
}

function renderFilePreviews(files) {
  const preview = document.getElementById('upload-preview');
  if (!preview) return;
  preview.innerHTML = '';
  files.forEach(file => {
    const div = document.createElement('div');
    div.className = 'preview-thumb';
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      div.appendChild(img);
    } else {
      div.innerHTML = `<div class="preview-video"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`;
    }
    const span = document.createElement('span');
    span.textContent = file.name.length > 14 ? file.name.slice(0,11)+'...' : file.name;
    div.appendChild(span);
    preview.appendChild(div);
  });
  document.getElementById('upload-actions').style.display = 'flex';
}

async function loadAlbumDropdown() {
  if (!getToken()) return;
  try {
    const data = await api('GET', '/albums');
    const sel = document.getElementById('upload-album-select');
    if (!sel) return;
    sel.innerHTML = data.albums.map(a =>
      `<option value="${a.id}">${escHtml(a.emoji||'📸')} ${escHtml(a.name)}</option>`
    ).join('') + '<option value="__new__">+ Create new album</option>';
  } catch (err) { /* ignore */ }
}

async function handleUpload(e) {
  e.preventDefault();
  if (!requireAuth()) return;

  let albumId = document.getElementById('upload-album-select')?.value;
  const caption = document.getElementById('upload-caption')?.value.trim();

  if (albumId === '__new__') {
    const name = prompt('New album name:');
    if (!name) return;
    try {
      const res = await api('POST', '/albums', { name });
      albumId = res.album.id;
      toast('Album "' + name + '" created!');
    } catch (err) { toast(err.message, 'error'); return; }
  }

  if (!albumId) { toast('Please select an album.', 'error'); return; }
  if (selectedFiles.length === 0) { toast('Please select at least one file.', 'error'); return; }

  const btn = e.target.querySelector('button[type=submit]');
  setLoading(btn, true);
  try {
    const formData = new FormData();
    formData.append('album_id', albumId);
    if (caption) formData.append('caption', caption);
    selectedFiles.forEach(f => formData.append('files', f));

    await api('POST', '/media/upload', formData, true);
    toast(selectedFiles.length + ' file(s) uploaded! 🎉');
    selectedFiles = [];
    document.getElementById('upload-preview').innerHTML = '';
    document.getElementById('upload-actions').style.display = 'none';
    if (document.getElementById('upload-caption')) document.getElementById('upload-caption').value = '';
    setTimeout(() => go('page-albums'), 600);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ── FRIENDS ──────────────────────────────────────────────────
async function loadFriends() {
  if (!requireAuth()) return;
  try {
    const [fd, rd] = await Promise.all([
      api('GET', '/friends'),
      api('GET', '/friends/requests')
    ]);

    const connEl = document.getElementById('friends-connected-list');
    if (connEl) {
      const lbl = document.getElementById('friends-connected-label');
      if (lbl) lbl.textContent = 'Connected (' + fd.friends.length + ')';
      connEl.innerHTML = fd.friends.length === 0
        ? '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No friends yet. Invite someone!</p>'
        : fd.friends.map(f => `
          <div class="friend-row">
            <div class="avatar" style="background:#CECBF6;color:#3C3489;">${escHtml(f.friend_initials||'?')}</div>
            <div class="friend-info">
              <div class="name">${escHtml(f.friend_name)}</div>
              <div class="college">${escHtml(f.friend_college||'')}</div>
            </div>
            <span class="badge badge-green">Connected</span>
          </div>`).join('');
    }

    const pendEl = document.getElementById('friends-pending-list');
    if (pendEl) {
      const lbl = document.getElementById('friends-pending-label');
      if (lbl) lbl.textContent = 'Pending (' + rd.requests.length + ')';
      pendEl.innerHTML = rd.requests.length === 0
        ? '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No pending requests.</p>'
        : rd.requests.map(r => `
          <div class="friend-row">
            <div class="avatar" style="background:#FAC775;color:#633806;">${escHtml(r.avatar_initials||'?')}</div>
            <div class="friend-info">
              <div class="name">${escHtml(r.from_name)}</div>
              <div class="college">${escHtml(r.from_college||'')}</div>
            </div>
            <button class="btn btn-primary" style="font-size:12px;padding:6px 12px;" onclick="acceptFriend('${r.id}',this)">Accept</button>
          </div>`).join('');
    }
  } catch (err) {
    toast('Could not load friends.', 'error');
  }
}

async function acceptFriend(requestId, btn) {
  setLoading(btn, true);
  try {
    await api('PATCH', '/friends/' + requestId + '/accept');
    toast('Friend added! 🎉');
    loadFriends();
  } catch (err) { toast(err.message, 'error'); setLoading(btn, false); }
}

function showInviteModal() { document.getElementById('invite-modal')?.classList.add('active'); }
function hideInviteModal() { document.getElementById('invite-modal')?.classList.remove('active'); }

async function sendInvite() {
  const email = document.getElementById('invite-email')?.value.trim();
  if (!email || !email.includes('@')) { toast('Please enter a valid email.', 'error'); return; }
  const btn = document.querySelector('#invite-modal .btn-primary');
  setLoading(btn, true);
  try {
    const data = await api('POST', '/friends/request', { email });
    toast(data.message);
    hideInviteModal();
    document.getElementById('invite-email').value = '';
    loadFriends();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

async function searchFriends(q) {
  if (q.length < 2) { document.getElementById('friend-search-results').innerHTML = ''; return; }
  try {
    const data = await api('GET', '/friends/search?q=' + encodeURIComponent(q));
    const el = document.getElementById('friend-search-results');
    if (!el) return;
    el.innerHTML = data.users.length === 0
      ? '<p style="color:var(--text3);font-size:13px;padding:8px 0;">No users found.</p>'
      : data.users.map(u => `
          <div class="friend-row">
            <div class="avatar" style="background:#CECBF6;color:#3C3489;">${escHtml(u.avatar_initials||'?')}</div>
            <div class="friend-info">
              <div class="name">${escHtml(u.name)}</div>
              <div class="college">${escHtml(u.college||'')}</div>
            </div>
          </div>`).join('');
  } catch (err) { /* ignore */ }
}

// ── PROFILE ──────────────────────────────────────────────────
async function loadProfile() {
  if (!requireAuth()) return;
  try {
    const user = await api('GET', '/auth/me');
    setUser(user);

    const av = document.querySelector('.profile-header .big-avatar');
    if (av) av.textContent = user.avatar_initials || '?';

    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const collegeEl = document.getElementById('profile-college');
    if (nameEl) nameEl.textContent = user.name;
    if (emailEl) emailEl.textContent = user.email;
    if (collegeEl) collegeEl.textContent = user.college || '';

    const badges = document.querySelectorAll('.profile-header .badge');
    if (badges[0]) badges[0].textContent = (user.stats?.photos||0) + ' photos';
    if (badges[1]) badges[1].textContent = (user.stats?.albums||0) + ' albums';
    if (badges[2]) badges[2].textContent = (user.stats?.friends||0) + ' friends';

    const used = user.storage_used || 0;
    const pct = Math.min(100, (used / (5*1024*1024*1024)) * 100).toFixed(1);
    const fill = document.querySelector('.storage-fill');
    if (fill) fill.style.width = pct + '%';
    const storLbl = document.getElementById('storage-label');
    if (storLbl) storLbl.textContent = formatBytes(used) + ' used of 5 GB free';
  } catch (err) {
    console.error('Load profile error:', err);
  }
}

// ── UTILITIES ────────────────────────────────────────────────
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  if (h < 24) return h + 'h ago';
  if (d < 7)  return d + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

function formatBytes(b) {
  if (!b) return '0 B';
  const k=1024, s=['B','KB','MB','GB'], i=Math.floor(Math.log(b)/Math.log(k));
  return (b/Math.pow(k,i)).toFixed(1)+' '+s[i];
}

function emojiGradient(e) {
  const m={'🎭':'linear-gradient(135deg,#EEEDFE,#D6D3FA)','🏕️':'linear-gradient(135deg,#E1F5EE,#B0EDD6)',
           '🎓':'linear-gradient(135deg,#FAECE7,#F5C4B3)','🎉':'linear-gradient(135deg,#FAEEDA,#FAC775)',
           '⚽':'linear-gradient(135deg,#E6F1FB,#B5D4F4)','🌅':'linear-gradient(135deg,#FBEAF0,#F4C0D1)',
           '📸':'linear-gradient(135deg,#EEEDFE,#A29BFE)'};
  return m[e]||'linear-gradient(135deg,#EEEDFE,#D6D3FA)';
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) { showAuthNav(true); go('page-dashboard'); }
  else go('page-landing');
  initUpload();

  const searchInput = document.getElementById('friend-search-input');
  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => searchFriends(searchInput.value.trim()), 400);
    });
  }
});
