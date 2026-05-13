// ============================================================
//  Moments — Complete Frontend (all features working)
// ============================================================

const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : window.location.origin + '/api';

// ── Token / User helpers ─────────────────────────────────────
function getToken()  { return localStorage.getItem('moments_token'); }
function setToken(t) { localStorage.setItem('moments_token', t); }
function clearToken(){ localStorage.removeItem('moments_token'); localStorage.removeItem('moments_user'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('moments_user')); } catch { return null; } }
function setUser(u)  { localStorage.setItem('moments_user', JSON.stringify(u)); }

// ── API helper ───────────────────────────────────────────────
async function api(method, path, body = null, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!isFormData && body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method, headers,
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
  if (pageId === 'page-albums')    loadAlbums('all');
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

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) { btn.dataset.orig = btn.textContent; btn.textContent = 'Please wait…'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.orig || btn.textContent; btn.disabled = false; }
}

function requireAuth() {
  if (!getToken()) { go('page-login'); return false; }
  return true;
}

function showAuthNav(show) {
  document.querySelectorAll('[data-auth]').forEach(el => el.style.display = show ? '' : 'none');
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
    setToken(data.token); setUser(data.user); showAuthNav(true);
    toast('Welcome back, ' + data.user.name.split(' ')[0] + '! 👋');
    setTimeout(() => go('page-dashboard'), 400);
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
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
    setToken(data.token); setUser(data.user); showAuthNav(true);
    toast('Welcome to Moments, ' + data.user.name.split(' ')[0] + '! 🎉');
    setTimeout(() => go('page-dashboard'), 400);
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
}

// ── LOGOUT ───────────────────────────────────────────────────
function handleLogout() {
  clearToken(); showAuthNav(false);
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

    const greetEl = document.querySelector('.greeting h2');
    if (greetEl) greetEl.textContent = 'Hi, ' + userData.name.split(' ')[0] + '! 👋';
    const greetSub = document.querySelector('.greeting p');
    const unread = notifData.unread_count || 0;
    if (greetSub) greetSub.textContent = unread > 0
      ? `You have ${unread} new update${unread > 1 ? 's' : ''} from friends.`
      : 'Everything is up to date.';

    const sp = document.getElementById('stat-photos');
    const sa = document.getElementById('stat-albums');
    const sf = document.getElementById('stat-friends');
    if (sp) sp.textContent = userData.stats?.photos  || 0;
    if (sa) sa.textContent = userData.stats?.albums  || 0;
    if (sf) sf.textContent = userData.stats?.friends || 0;

    // Albums grid on dashboard
    const albumGrid = document.getElementById('dashboard-album-grid');
    if (albumGrid) {
      const albums = albumData.albums.slice(0, 3);
      albumGrid.innerHTML = albums.length === 0
        ? '<p style="color:var(--text3);font-size:14px;grid-column:1/-1;">No albums yet. <a href="#" onclick="go(\'page-upload\')" style="color:var(--purple)">Create your first one →</a></p>'
        : albums.map(a => renderAlbumCard(a, true)).join('');
    }

    // Activity feed
    const feedContainer = document.getElementById('dashboard-feed');
    if (feedContainer) {
      const recent = notifData.notifications.slice(0, 6);
      feedContainer.innerHTML = recent.length === 0
        ? '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No recent activity yet. Invite friends to get started!</p>'
        : recent.map(n => `
          <div class="feed-item">
            <div class="avatar" style="background:#CECBF6;color:#3C3489;">${escHtml(n.from_initials || '?')}</div>
            <div style="flex:1">
              <div class="feed-text">${escHtml(n.message)}</div>
              <div class="feed-time">${timeAgo(n.created_at)}</div>
            </div>
          </div>`).join('');
    }
  } catch(err) {
    console.error('Dashboard error:', err);
    toast('Could not load dashboard.', 'error');
  }
}

// ── ALBUMS ───────────────────────────────────────────────────
let allAlbumsCache = [];

async function loadAlbums(tab = 'all') {
  if (!requireAuth()) return;

  // Update tab UI
  document.querySelectorAll('#page-albums .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  try {
    const data = await api('GET', '/albums');
    allAlbumsCache = data.albums;
    const me = getUser();

    let filtered = data.albums;
    if (tab === 'mine')   filtered = data.albums.filter(a => a.owner_id === me?.id);
    if (tab === 'shared') filtered = data.albums.filter(a => a.owner_id !== me?.id);

    const grid = document.getElementById('albums-grid');
    if (!grid) return;

    grid.innerHTML = filtered.length === 0
      ? `<p style="color:var(--text3);font-size:14px;grid-column:1/-1;">${
          tab === 'shared' ? 'No albums shared with you yet.' :
          tab === 'mine'   ? 'You haven\'t created any albums yet.' :
          'No albums yet. Create one!'}</p>`
      : filtered.map(a => renderAlbumCard(a, true)).join('');

    const lbl = document.getElementById('albums-count');
    if (lbl) lbl.textContent = filtered.length + ' album' + (filtered.length !== 1 ? 's' : '');
  } catch(err) { toast('Could not load albums.', 'error'); }
}

function renderAlbumCard(a, clickable = false) {
  const emoji = a.emoji || '📸';
  const click = clickable ? `onclick="openAlbum('${a.id}')"` : '';
  return `
    <div class="album-card" ${click} style="${clickable ? 'cursor:pointer' : ''}">
      <div class="album-thumb" style="background:${emojiGradient(emoji)};">${emoji}
        <span class="photo-count">${a.photo_count || 0}</span>
      </div>
      <div class="album-info">
        <div class="name">${escHtml(a.name)}</div>
        <div class="meta">${a.photo_count || 0} photos · ${a.member_count || 1} member${(a.member_count||1)!==1?'s':''}</div>
      </div>
    </div>`;
}

// ── ALBUM VIEWER ─────────────────────────────────────────────
async function openAlbum(albumId) {
  try {
    const data = await api('GET', '/albums/' + albumId);
    const { album, media, members } = data;

    // Build album viewer modal
    let existing = document.getElementById('album-viewer-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'album-viewer-modal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:300;overflow-y:auto;align-items:flex-start;padding:20px;';

    const photosHtml = media.length === 0
      ? '<p style="color:var(--text3);font-size:14px;padding:24px;text-align:center;">No photos yet. Upload some!</p>'
      : media.map(m => {
          const isVideo = m.mimetype && m.mimetype.startsWith('video/');
          const src = '/uploads/' + m.filename;
          return `
            <div style="position:relative;border-radius:10px;overflow:hidden;background:var(--bg2);cursor:pointer;" onclick="openMediaViewer('${m.id}','${escHtml(src)}','${m.mimetype||''}','${escHtml(m.caption||'')}','${escHtml(m.uploader_name||'')}',${m.like_count||0},${m.liked_by_me||0})">
              ${isVideo
                ? `<video src="${src}" style="width:100%;aspect-ratio:1;object-fit:cover;" muted></video><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.5);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`
                : `<img src="${src}" style="width:100%;aspect-ratio:1;object-fit:cover;" loading="lazy" onerror="this.parentElement.innerHTML='<div style=padding:20px;text-align:center;font-size:24px;>📸</div>'">`}
              <div style="padding:6px 8px;font-size:11px;color:var(--text3);">${escHtml(m.uploader_name||'')} · ❤️ ${m.like_count||0}</div>
            </div>`;
        }).join('');

    const membersHtml = members.map(m => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;">
        <div class="avatar" style="background:#CECBF6;color:#3C3489;width:32px;height:32px;font-size:12px;">${escHtml(m.avatar_initials||'?')}</div>
        <div>
          <div style="font-size:13px;font-weight:500;">${escHtml(m.name)}</div>
          <div style="font-size:11px;color:var(--text3);">${escHtml(m.role||'member')}</div>
        </div>
      </div>`).join('');

    modal.innerHTML = `
      <div class="modal" style="max-width:700px;width:100%;padding:0;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
          <div>
            <h3 style="font-size:20px;">${escHtml(album.emoji||'📸')} ${escHtml(album.name)}</h3>
            <div style="font-size:13px;color:var(--text3);margin-top:2px;">${media.length} photos · ${members.length} members</div>
          </div>
          <button onclick="document.getElementById('album-viewer-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--text3);">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 200px;min-height:400px;">
          <div style="padding:16px;border-right:1px solid var(--border);">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${photosHtml}</div>
          </div>
          <div style="padding:16px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Members</div>
            ${membersHtml}
            <div style="margin-top:16px;">
              <button class="btn btn-primary" style="width:100%;font-size:13px;justify-content:center;" onclick="document.getElementById('album-viewer-modal').remove();go('page-upload')">+ Upload here</button>
            </div>
          </div>
        </div>
      </div>`;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(err) { toast('Could not open album.', 'error'); }
}

// ── MEDIA VIEWER (full screen) ────────────────────────────────
function openMediaViewer(id, src, mimetype, caption, uploaderName, likeCount, likedByMe) {
  let existing = document.getElementById('media-viewer-modal');
  if (existing) existing.remove();

  const isVideo = mimetype && mimetype.startsWith('video/');
  const modal = document.createElement('div');
  modal.id = 'media-viewer-modal';
  modal.className = 'modal-overlay active';
  modal.style.cssText = 'z-index:400;background:rgba(0,0,0,0.92);';

  modal.innerHTML = `
    <div style="max-width:800px;width:100%;position:relative;">
      <button onclick="document.getElementById('media-viewer-modal').remove()" style="position:fixed;top:20px;right:24px;background:rgba(255,255,255,0.15);border:none;color:white;font-size:24px;cursor:pointer;border-radius:50%;width:40px;height:40px;">✕</button>
      ${isVideo
        ? `<video src="${src}" controls style="width:100%;max-height:70vh;border-radius:12px;"></video>`
        : `<img src="${src}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:12px;">`}
      <div style="background:rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-top:12px;color:white;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:14px;opacity:0.7;">📸 ${escHtml(uploaderName)}</span>
          <button id="like-btn-${id}" onclick="toggleLike('${id}',this)" style="background:none;border:1px solid rgba(255,255,255,0.3);color:${likedByMe?'#FF7675':'white'};border-radius:20px;padding:5px 14px;cursor:pointer;font-size:13px;">
            ${likedByMe ? '❤️' : '🤍'} <span id="like-count-${id}">${likeCount}</span>
          </button>
        </div>
        ${caption ? `<div style="font-size:14px;margin-bottom:12px;">${escHtml(caption)}</div>` : ''}
        <div id="comments-${id}" style="font-size:13px;opacity:0.8;margin-bottom:10px;">Loading comments…</div>
        <div style="display:flex;gap:8px;">
          <input id="comment-input-${id}" type="text" placeholder="Add a comment…" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:white;font-size:13px;outline:none;">
          <button onclick="submitComment('${id}')" style="background:#6C5CE7;border:none;color:white;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;">Post</button>
        </div>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  loadComments(id);
}

async function loadComments(mediaId) {
  try {
    const data = await api('GET', '/media/' + mediaId);
    const el = document.getElementById('comments-' + mediaId);
    if (!el) return;
    if (data.comments.length === 0) {
      el.textContent = 'No comments yet. Be the first!';
    } else {
      el.innerHTML = data.comments.map(c =>
        `<div style="margin-bottom:6px;"><strong>${escHtml(c.user_name)}</strong>: ${escHtml(c.text)}</div>`
      ).join('');
    }
  } catch(e) { /* ignore */ }
}

async function submitComment(mediaId) {
  const input = document.getElementById('comment-input-' + mediaId);
  if (!input || !input.value.trim()) return;
  try {
    await api('POST', '/media/' + mediaId + '/comments', { text: input.value.trim() });
    input.value = '';
    loadComments(mediaId);
    toast('Comment posted!');
  } catch(err) { toast(err.message, 'error'); }
}

async function toggleLike(mediaId, btn) {
  try {
    const data = await api('POST', '/media/' + mediaId + '/like');
    const countEl = document.getElementById('like-count-' + mediaId);
    if (countEl) countEl.textContent = parseInt(countEl.textContent) + (data.liked ? 1 : -1);
    btn.style.color = data.liked ? '#FF7675' : 'white';
    btn.innerHTML = btn.innerHTML.replace(data.liked ? '🤍' : '❤️', data.liked ? '❤️' : '🤍');
  } catch(err) { toast(err.message, 'error'); }
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
    loadAlbums('all');
    loadAlbumDropdown();
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
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
  } catch(err) { /* ignore */ }
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
    } catch(err) { toast(err.message, 'error'); return; }
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
    const capEl = document.getElementById('upload-caption');
    if (capEl) capEl.value = '';
    setTimeout(() => go('page-albums'), 600);
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
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
        ? '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No friends yet. Invite someone using their email!</p>'
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
  } catch(err) { toast('Could not load friends.', 'error'); }
}

async function acceptFriend(requestId, btn) {
  setLoading(btn, true);
  try {
    await api('PATCH', '/friends/' + requestId + '/accept');
    toast('Friend added! 🎉');
    loadFriends();
  } catch(err) { toast(err.message, 'error'); setLoading(btn, false); }
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
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
}

async function searchFriends(q) {
  const el = document.getElementById('friend-search-results');
  if (!el) return;
  if (q.length < 2) { el.innerHTML = ''; return; }
  try {
    const data = await api('GET', '/friends/search?q=' + encodeURIComponent(q));
    el.innerHTML = data.users.length === 0
      ? '<p style="color:var(--text3);font-size:13px;padding:8px 0;">No users found.</p>'
      : data.users.map(u => `
          <div class="friend-row">
            <div class="avatar" style="background:#CECBF6;color:#3C3489;">${escHtml(u.avatar_initials||'?')}</div>
            <div class="friend-info">
              <div class="name">${escHtml(u.name)}</div>
              <div class="college">${escHtml(u.college||'')}</div>
            </div>
            <button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="quickAddFriend('${escHtml(u.name)}',this)">Add</button>
          </div>`).join('');
  } catch(err) { /* ignore */ }
}

function quickAddFriend(name, btn) {
  toast('To add ' + name + ', use the Invite button with their email address.', 'error');
}

// ── PROFILE ──────────────────────────────────────────────────
async function loadProfile() {
  if (!requireAuth()) return;
  try {
    const user = await api('GET', '/auth/me');
    setUser(user);

    const av = document.querySelector('.profile-header .big-avatar');
    if (av) av.textContent = user.avatar_initials || '?';

    const nameEl    = document.getElementById('profile-name');
    const emailEl   = document.getElementById('profile-email');
    const collegeEl = document.getElementById('profile-college');
    if (nameEl)    nameEl.textContent    = user.name;
    if (emailEl)   emailEl.textContent   = user.email;
    if (collegeEl) collegeEl.textContent = user.college || 'No college set';

    const bp = document.getElementById('badge-photos');
    const ba = document.getElementById('badge-albums');
    const bf = document.getElementById('badge-friends');
    if (bp) bp.textContent = (user.stats?.photos||0)  + ' photos';
    if (ba) ba.textContent = (user.stats?.albums||0)  + ' albums';
    if (bf) bf.textContent = (user.stats?.friends||0) + ' friends';

    const used = user.storage_used || 0;
    const pct  = Math.min(100, (used / (5*1024*1024*1024)) * 100).toFixed(1);
    const fill = document.querySelector('.storage-fill');
    if (fill) fill.style.width = pct + '%';
    const storLbl = document.getElementById('storage-label');
    if (storLbl) storLbl.textContent = formatBytes(used) + ' used of 5 GB free';
  } catch(err) { console.error('Profile error:', err); }
}

// ── EDIT PROFILE MODAL ────────────────────────────────────────
function showEditProfileModal() {
  const user = getUser();
  if (!user) return;

  let existing = document.getElementById('edit-profile-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'edit-profile-modal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal">
      <h3>Edit Profile</h3>
      <div class="sub">Update your name or college</div>
      <form onsubmit="saveProfile(event)">
        <div class="form-group">
          <label>Full name</label>
          <input type="text" id="edit-name" value="${escHtml(user.name||'')}" required>
        </div>
        <div class="form-group">
          <label>College / University</label>
          <input type="text" id="edit-college" value="${escHtml(user.college||'')}">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="document.getElementById('edit-profile-modal').remove()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function saveProfile(e) {
  e.preventDefault();
  const name    = document.getElementById('edit-name')?.value.trim();
  const college = document.getElementById('edit-college')?.value.trim();
  const btn     = e.target.querySelector('button[type=submit]');
  setLoading(btn, true);
  try {
    await api('PATCH', '/auth/me', { name, college });
    toast('Profile updated!');
    document.getElementById('edit-profile-modal')?.remove();
    loadProfile();
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
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
  const m={
    '🎭':'linear-gradient(135deg,#EEEDFE,#D6D3FA)',
    '🏕️':'linear-gradient(135deg,#E1F5EE,#B0EDD6)',
    '🎓':'linear-gradient(135deg,#FAECE7,#F5C4B3)',
    '🎉':'linear-gradient(135deg,#FAEEDA,#FAC775)',
    '⚽':'linear-gradient(135deg,#E6F1FB,#B5D4F4)',
    '🌅':'linear-gradient(135deg,#FBEAF0,#F4C0D1)',
    '📸':'linear-gradient(135deg,#EEEDFE,#A29BFE)'
  };
  return m[e]||'linear-gradient(135deg,#EEEDFE,#D6D3FA)';
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) { showAuthNav(true); go('page-dashboard'); }
  else go('page-landing');
  initUpload();

  // Tab switching on albums page
  document.querySelectorAll('#page-albums .tab').forEach(tab => {
    tab.addEventListener('click', () => loadAlbums(tab.dataset.tab));
  });

  // Edit profile button is wired via onclick in HTML

  // Friend search
  const searchInput = document.getElementById('friend-search-input');
  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => searchFriends(searchInput.value.trim()), 400);
    });
  }
});
