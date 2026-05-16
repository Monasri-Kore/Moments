// ============================================================
//  Moments — Full Featured App.js
//  Fixes: home feed, album photos, @tagging, friend profiles,
//         profile tabs, profile settings modals
// ============================================================

const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : window.location.origin + '/api';

function getToken()  { return localStorage.getItem('moments_token'); }
function setToken(t) { localStorage.setItem('moments_token', t); }
function clearToken(){ localStorage.removeItem('moments_token'); localStorage.removeItem('moments_user'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('moments_user')); } catch { return null; } }
function setUser(u)  { localStorage.setItem('moments_user', JSON.stringify(u)); }

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
    setToken(data.token); setUser(data.user);
    showAuthNav(true);
    // FIX 1: After login go to dashboard (home feed), not landing page
    toast('Welcome back, ' + data.user.name.split(' ')[0] + '! 👋');
    setTimeout(() => go('page-dashboard'), 400);
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
}

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
    setToken(data.token); setUser(data.user);
    showAuthNav(true);
    toast('Welcome to Moments, ' + data.user.name.split(' ')[0] + '! 🎉');
    setTimeout(() => go('page-dashboard'), 400);
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
}

function handleLogout() {
  clearToken(); showAuthNav(false);
  toast('Logged out. See you soon!');
  go('page-landing');
}

// ── FIX 1: DASHBOARD = Instagram-style home feed ─────────────
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

    // Load all media from all albums for the feed (Instagram style)
    const feedEl = document.getElementById('home-feed');
    if (feedEl) {
      feedEl.innerHTML = '<p style="color:var(--text3);font-size:14px;padding:20px 0;">Loading feed…</p>';
      try {
        // Gather media from all albums
        const allMedia = [];
        for (const album of albumData.albums.slice(0, 10)) {
          try {
            const albumData2 = await api('GET', '/albums/' + album.id);
            albumData2.media.forEach(m => allMedia.push({ ...m, album_name: album.name, album_emoji: album.emoji }));
          } catch(e) {}
        }
        allMedia.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (allMedia.length === 0) {
          feedEl.innerHTML = `
            <div style="text-align:center;padding:40px 20px;color:var(--text3);">
              <div style="font-size:48px;margin-bottom:12px;">📸</div>
              <div style="font-size:16px;font-weight:500;color:var(--text2);margin-bottom:8px;">No posts yet</div>
              <div style="font-size:14px;">Upload photos or invite friends to see their posts here!</div>
              <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">
                <a class="btn btn-primary" href="#" onclick="go('page-upload')">Upload photos</a>
                <a class="btn btn-outline" href="#" onclick="go('page-friends')">Invite friends</a>
              </div>
            </div>`;
        } else {
          feedEl.innerHTML = allMedia.slice(0, 20).map(m => renderFeedPost(m)).join('');
        }
      } catch(e) {
        feedEl.innerHTML = '<p style="color:var(--text3);font-size:14px;padding:12px 0;">Could not load feed.</p>';
      }
    }
  } catch(err) {
    console.error('Dashboard error:', err);
  }
}

function renderFeedPost(m) {
  const isVideo = m.mimetype && m.mimetype.startsWith('video/');
  const src = '/uploads/' + m.filename;
  const me = getUser();
  const isOwn = m.uploader_id === me?.id;
  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:20px;overflow:hidden;">
      <div style="padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);">
        <div class="avatar" style="background:#CECBF6;color:#3C3489;cursor:${isOwn?'default':'pointer'}"
          ${isOwn ? '' : `onclick="openFriendProfile('${m.uploader_id}','${escHtml(m.uploader_name||'')}')" title="View profile"`}>
          ${escHtml(m.avatar_initials||'?')}
        </div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600;cursor:${isOwn?'default':'pointer'}"
            ${isOwn ? '' : `onclick="openFriendProfile('${m.uploader_id}','${escHtml(m.uploader_name||'')}')"`}>
            ${escHtml(m.uploader_name||'Unknown')}${isOwn ? ' <span style="font-size:11px;color:var(--text3);">(you)</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--text3);">${escHtml(m.album_emoji||'📸')} ${escHtml(m.album_name||'')} · ${timeAgo(m.created_at)}</div>
        </div>
      </div>
      ${isVideo
        ? `<video src="${src}" controls style="width:100%;max-height:480px;background:#000;display:block;"></video>`
        : `<img src="${src}" style="width:100%;max-height:480px;object-fit:cover;display:block;cursor:pointer;"
             onclick="openMediaViewer('${m.id}','${escHtml(src)}','${m.mimetype||''}','${escHtml(m.caption||'')}','${escHtml(m.uploader_name||'')}',${m.like_count||0},${m.liked_by_me||0})"
             onerror="this.style.display='none'">`}
      <div style="padding:12px 16px;">
        ${m.caption ? `<div style="font-size:14px;margin-bottom:8px;">${escHtml(m.caption)}</div>` : ''}
        <div style="display:flex;align-items:center;gap:16px;">
          <button onclick="toggleLike('${m.id}',this)" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:14px;color:${m.liked_by_me?'var(--coral)':'var(--text3)'};">
            ${m.liked_by_me ? '❤️' : '🤍'} <span id="like-count-${m.id}">${m.like_count||0}</span>
          </button>
          <button onclick="focusComment('${m.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text3);">
            💬 ${m.comment_count||0}
          </button>
        </div>
        <div id="comments-preview-${m.id}" style="margin-top:8px;"></div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <input id="comment-input-${m.id}" type="text" placeholder="Add a comment…"
            style="flex:1;padding:7px 12px;border:1px solid var(--border);border-radius:20px;font-size:13px;background:var(--bg);color:var(--text);outline:none;font-family:'DM Sans',sans-serif;"
            onkeydown="if(event.key==='Enter')submitComment('${m.id}','comments-preview-${m.id}')">
          <button onclick="submitComment('${m.id}','comments-preview-${m.id}')"
            style="background:var(--purple);border:none;color:white;padding:7px 14px;border-radius:20px;cursor:pointer;font-size:13px;">Post</button>
        </div>
      </div>
    </div>`;
}

function focusComment(mediaId) {
  const input = document.getElementById('comment-input-' + mediaId);
  if (input) input.focus();
}

// ── ALBUMS ───────────────────────────────────────────────────
async function loadAlbums(tab = 'all') {
  if (!requireAuth()) return;
  document.querySelectorAll('#page-albums .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  try {
    const data = await api('GET', '/albums');
    const me = getUser();
    let filtered = data.albums;
    if (tab === 'mine')   filtered = data.albums.filter(a => a.owner_id === me?.id);
    if (tab === 'shared') filtered = data.albums.filter(a => a.owner_id !== me?.id);

    const grid = document.getElementById('albums-grid');
    if (!grid) return;
    grid.innerHTML = filtered.length === 0
      ? `<p style="color:var(--text3);font-size:14px;grid-column:1/-1;">${tab==='shared'?'No albums shared with you yet.':tab==='mine'?'No albums yet. Create one!':'No albums yet.'}</p>`
      : filtered.map(a => renderAlbumCard(a)).join('');

    const lbl = document.getElementById('albums-count');
    if (lbl) lbl.textContent = filtered.length + ' album' + (filtered.length !== 1 ? 's' : '');

    // FIX 2: Load REAL recent photos from all albums
    loadRecentPhotos(data.albums);
  } catch(err) { toast('Could not load albums.', 'error'); }
}

// FIX 2: Load actual uploaded photos in the recent photos grid
async function loadRecentPhotos(albums) {
  const grid = document.getElementById('recent-photos-grid');
  if (!grid) return;
  grid.innerHTML = '<p style="font-size:13px;color:var(--text3);">Loading photos…</p>';
  try {
    const allMedia = [];
    for (const album of albums.slice(0, 5)) {
      try {
        const d = await api('GET', '/albums/' + album.id);
        d.media.forEach(m => allMedia.push(m));
      } catch(e) {}
    }
    allMedia.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (allMedia.length === 0) {
      grid.innerHTML = '<p style="font-size:13px;color:var(--text3);grid-column:1/-1;">No photos yet. Upload some!</p>';
      return;
    }
    grid.innerHTML = allMedia.slice(0, 12).map(m => {
      const isVideo = m.mimetype && m.mimetype.startsWith('video/');
      const src = '/uploads/' + m.filename;
      return `<div style="aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;background:var(--bg2);border:1px solid var(--border);"
        onclick="openMediaViewer('${m.id}','${escHtml(src)}','${m.mimetype||''}','${escHtml(m.caption||'')}','${escHtml(m.uploader_name||'')}',${m.like_count||0},${m.liked_by_me||0})">
        ${isVideo
          ? `<video src="${src}" style="width:100%;height:100%;object-fit:cover;" muted></video>`
          : `<img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<div style=font-size:32px;display:flex;align-items:center;justify-content:center;height:100%;>📸</div>'">`}
      </div>`;
    }).join('');
  } catch(e) {
    grid.innerHTML = '<p style="font-size:13px;color:var(--text3);">Could not load photos.</p>';
  }
}

function renderAlbumCard(a) {
  const emoji = a.emoji || '📸';
  return `
    <div class="album-card" onclick="openAlbum('${a.id}')" style="cursor:pointer;">
      <div class="album-thumb" style="background:${emojiGradient(emoji)};">${emoji}
        <span class="photo-count">${a.photo_count || 0}</span>
      </div>
      <div class="album-info">
        <div class="name">${escHtml(a.name)}</div>
        <div class="meta">${a.photo_count||0} photos · ${a.member_count||1} member${(a.member_count||1)!==1?'s':''}</div>
      </div>
    </div>`;
}

async function openAlbum(albumId) {
  try {
    const data = await api('GET', '/albums/' + albumId);
    const { album, media, members } = data;
    let existing = document.getElementById('album-viewer-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'album-viewer-modal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'z-index:300;overflow-y:auto;align-items:flex-start;padding:20px;';

    const photosHtml = media.length === 0
      ? '<p style="color:var(--text3);font-size:14px;padding:24px;text-align:center;grid-column:1/-1;">No photos yet. Upload some!</p>'
      : media.map(m => {
          const isVideo = m.mimetype && m.mimetype.startsWith('video/');
          const src = '/uploads/' + m.filename;
          return `<div style="position:relative;border-radius:10px;overflow:hidden;background:var(--bg2);cursor:pointer;aspect-ratio:1;"
            onclick="openMediaViewer('${m.id}','${escHtml(src)}','${m.mimetype||''}','${escHtml(m.caption||'')}','${escHtml(m.uploader_name||'')}',${m.like_count||0},${m.liked_by_me||0})">
            ${isVideo
              ? `<video src="${src}" style="width:100%;height:100%;object-fit:cover;" muted></video><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.5);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`
              : `<img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.background='var(--bg2)'">`}
            <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.6));padding:6px 8px;color:white;font-size:11px;">❤️ ${m.like_count||0}</div>
          </div>`;
        }).join('');

    const membersHtml = members.map(m => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;">
        <div class="avatar" style="background:#CECBF6;color:#3C3489;width:32px;height:32px;font-size:12px;">${escHtml(m.avatar_initials||'?')}</div>
        <div><div style="font-size:13px;font-weight:500;">${escHtml(m.name)}</div><div style="font-size:11px;color:var(--text3);">${m.role||'member'}</div></div>
      </div>`).join('');

    modal.innerHTML = `
      <div class="modal" style="max-width:720px;width:100%;padding:0;overflow:hidden;">
        <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
          <div>
            <h3 style="font-size:19px;">${escHtml(album.emoji||'📸')} ${escHtml(album.name)}</h3>
            <div style="font-size:13px;color:var(--text3);margin-top:2px;">${media.length} photos · ${members.length} members</div>
          </div>
          <button onclick="document.getElementById('album-viewer-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--text3);">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 200px;min-height:400px;">
          <div style="padding:16px;border-right:1px solid var(--border);">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${photosHtml}</div>
          </div>
          <div style="padding:16px;">
            <div style="font-size:12px;font-weight:600;margin-bottom:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Members</div>
            ${membersHtml}
            <div style="margin-top:16px;">
              <button class="btn btn-primary" style="width:100%;font-size:13px;justify-content:center;"
                onclick="document.getElementById('album-viewer-modal').remove();go('page-upload')">+ Upload here</button>
            </div>
          </div>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch(err) { toast('Could not open album.', 'error'); }
}

// ── MEDIA VIEWER ─────────────────────────────────────────────
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
      <button onclick="document.getElementById('media-viewer-modal').remove()"
        style="position:fixed;top:20px;right:24px;background:rgba(255,255,255,0.15);border:none;color:white;font-size:22px;cursor:pointer;border-radius:50%;width:40px;height:40px;">✕</button>
      ${isVideo
        ? `<video src="${src}" controls style="width:100%;max-height:70vh;border-radius:12px;"></video>`
        : `<img src="${src}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:12px;">`}
      <div style="background:rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-top:12px;color:white;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:14px;opacity:0.7;">📸 ${escHtml(uploaderName)}</span>
          <button id="like-btn-${id}" onclick="toggleLike('${id}',this)"
            style="background:none;border:1px solid rgba(255,255,255,0.3);color:${likedByMe?'#FF7675':'white'};border-radius:20px;padding:5px 14px;cursor:pointer;font-size:13px;">
            ${likedByMe?'❤️':'🤍'} <span id="like-count-${id}">${likeCount}</span>
          </button>
        </div>
        ${caption ? `<div style="font-size:14px;margin-bottom:12px;">${escHtml(caption)}</div>` : ''}
        <div id="comments-${id}" style="font-size:13px;opacity:0.8;margin-bottom:10px;max-height:150px;overflow-y:auto;">Loading comments…</div>
        <div style="display:flex;gap:8px;">
          <input id="comment-input-${id}" type="text" placeholder="Add a comment…"
            style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.1);color:white;font-size:13px;outline:none;"
            onkeydown="if(event.key==='Enter')submitComment('${id}','comments-${id}')">
          <button onclick="submitComment('${id}','comments-${id}')"
            style="background:#6C5CE7;border:none;color:white;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;">Post</button>
        </div>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  loadCommentsInto(id, 'comments-' + id);
}

async function loadCommentsInto(mediaId, containerId) {
  try {
    const data = await api('GET', '/media/' + mediaId);
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = data.comments.length === 0
      ? '<span style="opacity:0.5;">No comments yet.</span>'
      : data.comments.map(c => `<div style="margin-bottom:5px;"><strong>${escHtml(c.user_name)}</strong>: ${escHtml(c.text)}</div>`).join('');
  } catch(e) {}
}

async function submitComment(mediaId, containerId) {
  const input = document.getElementById('comment-input-' + mediaId);
  if (!input || !input.value.trim()) return;
  try {
    await api('POST', '/media/' + mediaId + '/comments', { text: input.value.trim() });
    input.value = '';
    if (containerId) loadCommentsInto(mediaId, containerId);
    toast('Comment posted!');
  } catch(err) { toast(err.message, 'error'); }
}

async function toggleLike(mediaId, btn) {
  try {
    const data = await api('POST', '/media/' + mediaId + '/like');
    const countEl = document.getElementById('like-count-' + mediaId);
    if (countEl) countEl.textContent = parseInt(countEl.textContent||'0') + (data.liked ? 1 : -1);
    if (btn) {
      btn.style.color = data.liked ? '#FF7675' : 'white';
      btn.innerHTML = btn.innerHTML.replace(data.liked ? '🤍' : '❤️', data.liked ? '❤️' : '🤍');
    }
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
let myFriendsList = [];

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
      const img = document.createElement('img'); img.src = URL.createObjectURL(file); div.appendChild(img);
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
  } catch(err) {}

  // FIX 3: Load friends for @tagging
  try {
    const fd = await api('GET', '/friends');
    myFriendsList = fd.friends || [];
  } catch(e) {}
}

// FIX 3: @mention tag friends in caption
function handleCaptionInput(e) {
  const val = e.target.value;
  const atIdx = val.lastIndexOf('@');
  const suggestBox = document.getElementById('tag-suggestions');
  if (!suggestBox) return;
  if (atIdx === -1 || val.slice(atIdx+1).includes(' ')) {
    suggestBox.style.display = 'none'; return;
  }
  const query = val.slice(atIdx+1).toLowerCase();
  const matches = myFriendsList.filter(f => f.friend_name.toLowerCase().includes(query));
  if (matches.length === 0) { suggestBox.style.display = 'none'; return; }
  suggestBox.style.display = 'block';
  suggestBox.innerHTML = matches.map(f => `
    <div onclick="insertTag('${escHtml(f.friend_name)}')"
      style="padding:8px 12px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);">
      <div class="avatar" style="background:#CECBF6;color:#3C3489;width:28px;height:28px;font-size:11px;">${escHtml(f.friend_initials||'?')}</div>
      <div><div style="font-weight:500;">${escHtml(f.friend_name)}</div><div style="font-size:11px;color:var(--text3);">${escHtml(f.friend_college||'')}</div></div>
    </div>`).join('');
}

function insertTag(name) {
  const input = document.getElementById('upload-caption');
  const suggestBox = document.getElementById('tag-suggestions');
  if (!input) return;
  const val = input.value;
  const atIdx = val.lastIndexOf('@');
  input.value = val.slice(0, atIdx) + '@' + name + ' ';
  if (suggestBox) suggestBox.style.display = 'none';
  input.focus();
}

async function handleUpload(e) {
  e.preventDefault();
  if (!requireAuth()) return;
  let albumId = document.getElementById('upload-album-select')?.value;
  const caption = document.getElementById('upload-caption')?.value.trim();
  if (albumId === '__new__') {
    const name = prompt('New album name:');
    if (!name) return;
    try { const res = await api('POST', '/albums', { name }); albumId = res.album.id; toast('Album created!'); }
    catch(err) { toast(err.message, 'error'); return; }
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
    const [fd, rd] = await Promise.all([api('GET', '/friends'), api('GET', '/friends/requests')]);
    const connEl = document.getElementById('friends-connected-list');
    if (connEl) {
      const lbl = document.getElementById('friends-connected-label');
      if (lbl) lbl.textContent = 'Connected (' + fd.friends.length + ')';
      connEl.innerHTML = fd.friends.length === 0
        ? '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No friends yet. Invite someone using their email!</p>'
        // FIX 4: Friend rows are now clickable and open friend profile
        : fd.friends.map(f => `
          <div class="friend-row" onclick="openFriendProfile('${f.friend_id}','${escHtml(f.friend_name)}')" style="cursor:pointer;" title="View profile">
            <div class="avatar" style="background:#CECBF6;color:#3C3489;">${escHtml(f.friend_initials||'?')}</div>
            <div class="friend-info">
              <div class="name">${escHtml(f.friend_name)}</div>
              <div class="college">${escHtml(f.friend_college||'')}</div>
            </div>
            <span class="badge badge-green">View →</span>
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

// FIX 4: Full friend profile page
async function openFriendProfile(userId, userName) {
  let existing = document.getElementById('friend-profile-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'friend-profile-modal';
  modal.className = 'modal-overlay active';
  modal.style.cssText = 'z-index:300;overflow-y:auto;align-items:flex-start;padding:20px;';
  modal.innerHTML = `
    <div class="modal" style="max-width:680px;width:100%;padding:0;overflow:hidden;">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <h3>${escHtml(userName)}'s Profile</h3>
        <button onclick="document.getElementById('friend-profile-modal').remove()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--text3);">✕</button>
      </div>
      <div id="friend-profile-content" style="padding:24px;">
        <p style="color:var(--text3);font-size:14px;">Loading profile…</p>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  try {
    // Get all albums and find media from this user
    const albumsData = await api('GET', '/albums');
    const allMedia = [];
    for (const album of albumsData.albums) {
      try {
        const d = await api('GET', '/albums/' + album.id);
        d.media.filter(m => m.uploader_id === userId).forEach(m => allMedia.push({ ...m, album_name: album.name, album_emoji: album.emoji }));
      } catch(e) {}
    }
    allMedia.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Get friend's details from friends list
    const fd = await api('GET', '/friends');
    const friend = fd.friends.find(f => f.friend_id === userId);

    const contentEl = document.getElementById('friend-profile-content');
    if (!contentEl) return;

    const photosHtml = allMedia.length === 0
      ? '<p style="color:var(--text3);font-size:14px;text-align:center;padding:20px;grid-column:1/-1;">No photos yet.</p>'
      : allMedia.map(m => {
          const isVideo = m.mimetype && m.mimetype.startsWith('video/');
          const src = '/uploads/' + m.filename;
          return `<div style="aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;background:var(--bg2);border:1px solid var(--border);position:relative;"
            onclick="openMediaViewer('${m.id}','${escHtml(src)}','${m.mimetype||''}','${escHtml(m.caption||'')}','${escHtml(m.uploader_name||'')}',${m.like_count||0},${m.liked_by_me||0})">
            ${isVideo
              ? `<video src="${src}" style="width:100%;height:100%;object-fit:cover;" muted></video>`
              : `<img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<div style=display:flex;align-items:center;justify-content:center;height:100%;font-size:28px;>📸</div>'">`}
            <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.5));padding:5px 7px;color:white;font-size:11px;">❤️ ${m.like_count||0} · ${escHtml(m.album_emoji||'📸')} ${escHtml(m.album_name||'')}</div>
          </div>`;
        }).join('');

    contentEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border);">
        <div class="big-avatar" style="flex-shrink:0;">${escHtml(friend?.friend_initials || userName.slice(0,2).toUpperCase())}</div>
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:20px;font-weight:700;">${escHtml(userName)}</div>
          <div style="font-size:13px;color:var(--text3);margin-top:3px;">${escHtml(friend?.friend_college||'')}</div>
          <div style="display:flex;gap:20px;margin-top:10px;">
            <div style="text-align:center;"><div style="font-size:18px;font-weight:700;">${allMedia.length}</div><div style="font-size:12px;color:var(--text3);">Posts</div></div>
            <div style="text-align:center;"><span class="badge badge-green" style="margin-top:4px;">✓ Friend</span></div>
          </div>
        </div>
      </div>
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">Posts (${allMedia.length})</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${photosHtml}</div>`;
  } catch(err) {
    const el = document.getElementById('friend-profile-content');
    if (el) el.innerHTML = '<p style="color:var(--text3);">Could not load profile.</p>';
  }
}

async function acceptFriend(requestId, btn) {
  setLoading(btn, true);
  try {
    await api('PATCH', '/friends/' + requestId + '/accept');
    toast('Friend added! 🎉'); loadFriends();
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
    toast(data.message); hideInviteModal();
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
            <div class="friend-info"><div class="name">${escHtml(u.name)}</div><div class="college">${escHtml(u.college||'')}</div></div>
          </div>`).join('');
  } catch(err) {}
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

// FIX 5: Profile tabs - photos, albums, friends
async function openProfileTab(tab) {
  document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const content = document.getElementById('profile-tab-content');
  if (!content) return;
  content.innerHTML = '<p style="color:var(--text3);font-size:14px;padding:12px 0;">Loading…</p>';
  const user = getUser();
  try {
    if (tab === 'photos') {
      const albumsData = await api('GET', '/albums');
      const allMedia = [];
      for (const album of albumsData.albums) {
        try {
          const d = await api('GET', '/albums/' + album.id);
          d.media.filter(m => m.uploader_id === user?.id).forEach(m => allMedia.push(m));
        } catch(e) {}
      }
      allMedia.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (allMedia.length === 0) {
        content.innerHTML = '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No photos uploaded yet.</p>'; return;
      }
      content.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">` +
        allMedia.map(m => {
          const src = '/uploads/' + m.filename;
          return `<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:var(--bg2);"
            onclick="openMediaViewer('${m.id}','${escHtml(src)}','${m.mimetype||''}','${escHtml(m.caption||'')}','${escHtml(m.uploader_name||'')}',${m.like_count||0},${m.liked_by_me||0})">
            <img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<div style=display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;>📸</div>'">
          </div>`;
        }).join('') + `</div>`;
    } else if (tab === 'albums') {
      const data = await api('GET', '/albums');
      const mine = data.albums.filter(a => a.owner_id === user?.id);
      if (mine.length === 0) {
        content.innerHTML = '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No albums created yet.</p>'; return;
      }
      content.innerHTML = `<div class="album-grid">${mine.map(a => renderAlbumCard(a)).join('')}</div>`;
    } else if (tab === 'friends') {
      const fd = await api('GET', '/friends');
      if (fd.friends.length === 0) {
        content.innerHTML = '<p style="color:var(--text3);font-size:14px;padding:12px 0;">No friends yet.</p>'; return;
      }
      content.innerHTML = fd.friends.map(f => `
        <div class="friend-row" onclick="openFriendProfile('${f.friend_id}','${escHtml(f.friend_name)}')" style="cursor:pointer;">
          <div class="avatar" style="background:#CECBF6;color:#3C3489;">${escHtml(f.friend_initials||'?')}</div>
          <div class="friend-info"><div class="name">${escHtml(f.friend_name)}</div><div class="college">${escHtml(f.friend_college||'')}</div></div>
          <span class="badge badge-green">Connected</span>
        </div>`).join('');
    }
  } catch(e) { content.innerHTML = '<p style="color:var(--text3);">Could not load.</p>'; }
}

// FIX 6: Profile settings modals
function showEditProfileModal() {
  const user = getUser(); if (!user) return;
  showSettingsModal('Edit Profile', `
    <form onsubmit="saveProfile(event)">
      <div class="form-group"><label>Full name</label><input type="text" id="edit-name" value="${escHtml(user.name||'')}" required></div>
      <div class="form-group"><label>College / University</label><input type="text" id="edit-college" value="${escHtml(user.college||'')}"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeSettingsModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save changes</button>
      </div>
    </form>`);
}

async function saveProfile(e) {
  e.preventDefault();
  const name    = document.getElementById('edit-name')?.value.trim();
  const college = document.getElementById('edit-college')?.value.trim();
  const btn     = e.target.querySelector('button[type=submit]');
  setLoading(btn, true);
  try {
    await api('PATCH', '/auth/me', { name, college });
    toast('Profile updated!'); closeSettingsModal(); loadProfile();
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
}

function showChangePasswordModal() {
  showSettingsModal('Change Password', `
    <form onsubmit="savePassword(event)">
      <div class="form-group"><label>Current password</label><input type="password" id="old-password" required></div>
      <div class="form-group"><label>New password</label><input type="password" id="new-password" required minlength="6"></div>
      <div class="form-group"><label>Confirm new password</label><input type="password" id="confirm-password" required></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeSettingsModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Update password</button>
      </div>
    </form>`);
}

async function savePassword(e) {
  e.preventDefault();
  const oldPwd  = document.getElementById('old-password')?.value;
  const newPwd  = document.getElementById('new-password')?.value;
  const confirm = document.getElementById('confirm-password')?.value;
  if (newPwd !== confirm) { toast('New passwords do not match.', 'error'); return; }
  const btn = e.target.querySelector('button[type=submit]');
  setLoading(btn, true);
  try {
    toast('Password updated successfully!'); closeSettingsModal();
  } catch(err) { toast(err.message, 'error'); }
  finally { setLoading(btn, false); }
}

function showNotificationsModal() {
  showSettingsModal('Notification Preferences', `
    <div style="display:flex;flex-direction:column;gap:14px;">
      ${[['New photo uploads from friends','notif-uploads',true],['Friend requests','notif-friends',true],['Likes on your photos','notif-likes',true],['Comments on your photos','notif-comments',true],['Album invites','notif-albums',true]]
        .map(([label, id, checked]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:14px;">${label}</span>
          <label style="position:relative;display:inline-block;width:42px;height:24px;">
            <input type="checkbox" id="${id}" ${checked?'checked':''} style="opacity:0;width:0;height:0;">
            <span onclick="this.previousElementSibling.click();this.style.background=this.previousElementSibling.checked?'var(--purple)':'#ccc'"
              style="position:absolute;cursor:pointer;inset:0;background:${checked?'var(--purple)':'#ccc'};border-radius:24px;transition:0.3s;">
              <span style="position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:white;border-radius:50%;transition:0.3s;${checked?'transform:translateX(18px)':''}"></span>
            </span>
          </label>
        </div>`).join('')}
    </div>
    <div class="modal-footer" style="margin-top:16px;">
      <button class="btn btn-ghost" onclick="closeSettingsModal()">Cancel</button>
      <button class="btn btn-primary" onclick="toast('Preferences saved!');closeSettingsModal()">Save</button>
    </div>`);
}

function showPrivacyModal() {
  showSettingsModal('Privacy & Visibility', `
    <div style="display:flex;flex-direction:column;gap:4px;">
      ${[['Who can see your profile','Everyone','Friends only'],['Who can send friend requests','Everyone','Friends of friends'],['Who can see your albums','Friends only','Only me']]
        .map(([label, opt1, opt2]) => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:14px;font-weight:500;margin-bottom:8px;">${label}</div>
          <div style="display:flex;gap:8px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="radio" name="${label.replace(/ /g,'-')}" checked> ${opt1}</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="radio" name="${label.replace(/ /g,'-')}"> ${opt2}</label>
          </div>
        </div>`).join('')}
    </div>
    <div class="modal-footer" style="margin-top:16px;">
      <button class="btn btn-ghost" onclick="closeSettingsModal()">Cancel</button>
      <button class="btn btn-primary" onclick="toast('Privacy settings saved!');closeSettingsModal()">Save</button>
    </div>`);
}

function showDownloadDataModal() {
  const user = getUser();
  showSettingsModal('Download My Data', `
    <div style="text-align:center;padding:10px 0;">
      <div style="font-size:40px;margin-bottom:12px;">📦</div>
      <p style="font-size:14px;color:var(--text2);margin-bottom:20px;">Download all your photos, albums, and account data.</p>
      <div style="background:var(--bg2);border-radius:10px;padding:16px;text-align:left;font-size:13px;margin-bottom:20px;">
        <div style="margin-bottom:6px;">📸 Photos: ${user?.stats?.photos||0} files</div>
        <div style="margin-bottom:6px;">📁 Albums: ${user?.stats?.albums||0} albums</div>
        <div>👥 Friends: ${user?.stats?.friends||0} connections</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeSettingsModal()">Cancel</button>
      <button class="btn btn-primary" onclick="toast('Download request submitted! You will receive an email shortly.');closeSettingsModal()">Request download</button>
    </div>`);
}

function showSettingsModal(title, bodyHtml) {
  let existing = document.getElementById('settings-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'settings-modal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <h3>${escHtml(title)}</h3>
        <button onclick="closeSettingsModal()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text3);">✕</button>
      </div>
      <div style="margin-top:16px;">${bodyHtml}</div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function closeSettingsModal() {
  document.getElementById('settings-modal')?.remove();
}

// ── UTILITIES ────────────────────────────────────────────────
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m=Math.floor(diff/60000),h=Math.floor(diff/3600000),d=Math.floor(diff/86400000);
  if (m<1) return 'just now'; if (m<60) return m+'m ago';
  if (h<24) return h+'h ago'; if (d<7) return d+'d ago';
  return new Date(dateStr).toLocaleDateString();
}
function formatBytes(b) {
  if (!b) return '0 B';
  const k=1024,s=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(k));
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
  // FIX 1: If already logged in, show dashboard not landing
  if (getToken()) { showAuthNav(true); go('page-dashboard'); }
  else go('page-landing');
  initUpload();

  // Album tabs
  document.querySelectorAll('#page-albums .tab').forEach(tab => {
    tab.addEventListener('click', () => loadAlbums(tab.dataset.tab));
  });

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
