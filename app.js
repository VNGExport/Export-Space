/* ════════════════════════════════════════════
   ExportSpace — app.js  v2.0
   Full working version: Google Login + Sheets DB
   ════════════════════════════════════════════ */
'use strict';

/* ── CONFIG ── */
const API_URL   = (typeof CONFIG !== 'undefined') ? CONFIG.SHEETS_API : '';
const CLIENT_ID = (typeof CONFIG !== 'undefined') ? CONFIG.CLIENT_ID  : '';
const DOMAIN    = (typeof CONFIG !== 'undefined') ? CONFIG.DOMAIN     : 'vanachai.com';

/* ── STATE ── */
const state = {
  user:      null,   // { email, name, dept, role }
  theme:     localStorage.getItem('ex-theme')    || 'light',
  accent:    localStorage.getItem('ex-accent')   || 'blue',
  font:      localStorage.getItem('ex-font')     || 'ibm',
  fontSize:  parseInt(localStorage.getItem('ex-fontsize') || '15'),
  currentPage: 'home',
  links: JSON.parse(localStorage.getItem('ex-links') || 'null') || [
    { name: 'Origin Desk',      url: '#', type: 'green'  },
    { name: 'e-Form ศุลกากร',  url: '#', type: 'blue'   },
    { name: 'KBank L/C Portal', url: '#', type: 'gold'   },
    { name: 'Freight Tracker',  url: '#', type: 'purple' },
  ],
};

const LINK_META = {
  green:  { icon: 'ti-file-certificate', bg:'#EAF3DE', color:'#2D6A4F' },
  blue:   { icon: 'ti-forms',            bg:'#DBEAFE', color:'#1D4ED8' },
  gold:   { icon: 'ti-building-bank',    bg:'#FDF3DC', color:'#C8972B' },
  purple: { icon: 'ti-ship',             bg:'#FAF5FF', color:'#7C3AED' },
  slate:  { icon: 'ti-link',             bg:'#F1F5F9', color:'#475569' },
};

/* ════════════════════════════════════════════
   API HELPERS — ใช้ GET เพื่อหลีกเลี่ยง CORS
════════════════════════════════════════════ */
async function api(params = {}) {
  if (!API_URL) return null;
  try {
    const url = API_URL + '?' + new URLSearchParams(params).toString();
    const res = await fetch(url);
    const json = await res.json();
    return json.status === 'ok' ? json.data : null;
  } catch (e) {
    console.warn('API error:', e.message);
    return null;
  }
}

/* ════════════════════════════════════════════
   GOOGLE LOGIN
════════════════════════════════════════════ */
function initGoogleAuth() {
  if (!CLIENT_ID) { startApp(null); return; }

  // โหลด Google Identity Services
  const script = document.createElement('script');
  script.src   = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = setupGoogleLogin;
  script.onerror = () => startApp(null); // fallback ถ้าโหลดไม่ได้
  document.head.appendChild(script);
}

function setupGoogleLogin() {
  if (!window.google) { startApp(null); return; }

  google.accounts.id.initialize({
    client_id:        CLIENT_ID,
    callback:         handleGoogleCallback,
    auto_select:      true,
    cancel_on_tap_outside: false,
    hosted_domain:    DOMAIN,  // จำกัดเฉพาะ domain บริษัท
  });

  // ตรวจสอบว่า login อยู่แล้วหรือเปล่า
  const savedUser = localStorage.getItem('ex-user');
  if (savedUser) {
    try {
      startApp(JSON.parse(savedUser));
      return;
    } catch(e) {}
  }

  // แสดง One Tap prompt
  google.accounts.id.prompt(notification => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      showLoginScreen();
    }
  });
}

function handleGoogleCallback(response) {
  // Decode JWT token จาก Google
  try {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));

    // ตรวจ domain
    if (!payload.email.endsWith('@' + DOMAIN)) {
      showLoginError(`อนุญาตเฉพาะ @${DOMAIN} เท่านั้น`);
      return;
    }

    const user = {
      email: payload.email,
      name:  payload.name  || payload.email.split('@')[0],
      photo: payload.picture || '',
      dept:  'Export & Logistics',
    };

    localStorage.setItem('ex-user', JSON.stringify(user));
    hideLoginScreen();
    startApp(user);
  } catch(e) {
    showLoginError('Login ไม่สำเร็จ กรุณาลองใหม่');
  }
}

function showLoginScreen() {
  let screen = document.getElementById('login-screen');
  if (!screen) {
    screen = document.createElement('div');
    screen.id = 'login-screen';
    screen.innerHTML = `
      <div class="login-box">
        <div class="login-logo">EX</div>
        <h1 class="login-title">ExportSpace</h1>
        <p class="login-sub">แพลตฟอร์มสำหรับแผนก Export & Logistics</p>
        <p class="login-domain">เข้าใช้งานด้วย @${DOMAIN} เท่านั้น</p>
        <div id="g_id_signin" class="login-btn-wrap"></div>
        <p class="login-error" id="login-error" style="display:none"></p>
      </div>`;
    document.body.appendChild(screen);

    // Render Google Sign-In button
    setTimeout(() => {
      if (window.google) {
        google.accounts.id.renderButton(
          document.getElementById('g_id_signin'),
          { theme: 'outline', size: 'large', text: 'signin_with', locale: 'th', width: 280 }
        );
      }
    }, 100);
  }
  screen.style.display = 'flex';
  document.getElementById('topnav')?.style.setProperty('display','none');
  document.querySelector('.app-shell')?.style.setProperty('display','none');
}

function hideLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (screen) screen.style.display = 'none';
  document.getElementById('topnav')?.style.removeProperty('display');
  document.querySelector('.app-shell')?.style.removeProperty('display');
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function logout() {
  localStorage.removeItem('ex-user');
  if (window.google) google.accounts.id.disableAutoSelect();
  location.reload();
}

/* ════════════════════════════════════════════
   START APP (หลัง login แล้ว)
════════════════════════════════════════════ */
function startApp(user) {
  state.user = user;

  // อัปเดต UI ด้วยข้อมูลผู้ใช้จริง
  if (user) {
    updateUserUI(user);
    // sync กับ Google Sheet (บันทึก last_seen)
    api({ action: 'whoami' }).catch(() => {});
  }

  applyTheme(state.theme);
  applyAccent(state.accent);
  applyFont(state.font);
  applyFontSize(state.fontSize);
  renderQuickLinks();
  renderLinksManager();
  bindNav();
  bindCreatePost();
  bindLikeButtons();
  bindFeedTabs();
  bindThemeToggle();
  bindSettingsTabs();
  bindDisplaySettings();
  bindLinksModal();
  bindProfileTabs();
  bindCalNav();
  bindLogout();
  syncSettingsUI();
  loadPostsFromSheet();
  loadBoardFromSheet();
  loadEventsFromSheet();
}

function updateUserUI(user) {
  const initials = getInitials(user.name);
  const color    = nameToColor(user.name);

  // topnav avatar
  document.querySelectorAll('.avatar-btn .avatar, #user-avatar-btn .avatar').forEach(el => {
    el.textContent   = initials;
    el.style.background = color;
  });

  // sidebar user card
  const sbName = document.querySelector('.sb-user-name');
  const sbRole = document.querySelector('.sb-user-role');
  const sbAv   = document.querySelector('.sb-avatar');
  if (sbName) sbName.textContent = user.name;
  if (sbRole) sbRole.textContent = (user.dept || '') + ' · ' + (user.role || 'member');
  if (sbAv)   { sbAv.textContent = initials; sbAv.style.background = color; }

  // sidebar create post avatar
  document.querySelectorAll('.cp-top .avatar, #post-av').forEach(el => {
    el.textContent = initials; el.style.background = color;
  });

  // profile page
  const pName = document.querySelector('.profile-name');
  const pRole = document.querySelector('.profile-role');
  const pAv   = document.querySelector('.profile-avatar');
  if (pName) pName.textContent = user.name;
  if (pRole) pRole.textContent = (user.dept || '') + ' · ' + user.email;
  if (pAv)   { pAv.textContent = initials; pAv.style.background = color; }

  // settings profile
  const pfName  = document.getElementById('pf-name');
  const pfDept  = document.getElementById('pf-dept');
  const pfEmail = document.getElementById('pf-email');
  if (pfName)  pfName.value  = user.name;
  if (pfDept)  pfDept.value  = user.dept || '';
  if (pfEmail) pfEmail.value = user.email;
}

/* ════════════════════════════════════════════
   LOAD DATA FROM SHEETS
════════════════════════════════════════════ */
async function loadPostsFromSheet() {
  const feed = document.getElementById('posts-feed');
  if (!feed) return;

  feed.innerHTML = `<div class="loading-state">
    <i class="ti ti-loader-2" style="font-size:28px;animation:spin 1s linear infinite"></i>
    <p>กำลังโหลดโพสต์…</p>
  </div>`;

  const posts = await api({ action: 'get', sheet: 'Posts' });

  if (!posts || posts.length === 0) {
    feed.innerHTML = `<div class="empty-state">
      <i class="ti ti-mood-empty" style="font-size:36px"></i>
      <p>ยังไม่มีโพสต์ — เป็นคนแรกที่โพสต์เลย!</p>
    </div>`;
    return;
  }

  const sorted = [...posts].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  feed.innerHTML = sorted.map(p => renderPostHTML(p)).join('');
  feed.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', handleLike));
  feed.querySelectorAll('.post-more-btn').forEach(b => b.addEventListener('click', handlePostMenu));
}

async function loadBoardFromSheet() {
  const list = document.querySelector('.board-list');
  if (!list) return;

  const items = await api({ action: 'get', sheet: 'Board' });
  if (!items || items.length === 0) return;

  const sorted = [...items].sort((a,b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  list.innerHTML = sorted.map(item => {
    const isUrgent = item.priority === 'urgent';
    const tagClass = isUrgent ? 'tag-urgent' : (item.tag === 'SOP อัปเดต' ? 'tag-sop' : 'tag-info');
    const priColor = isUrgent ? 'var(--c-red)' : 'var(--c-navy-400)';
    const ini = getInitials(item.author || '?');
    const col = nameToColor(item.author || '');
    return `<article class="board-item ${isUrgent ? 'board-urgent' : ''}" data-id="${escapeHTML(item.id)}">
      <div class="board-left"><div class="board-pri-bar" style="background:${priColor}"></div></div>
      <div class="board-content">
        <div class="board-top">
          <span class="post-tag ${tagClass}">${escapeHTML(item.tag || 'ทั่วไป')}</span>
          <span class="board-time">${formatTime(item.created_at)}</span>
        </div>
        <div class="board-title">${escapeHTML(item.title)}</div>
        <div class="board-author">
          <div class="avatar xs" style="background:${col}">${escapeHTML(ini)}</div>
          ${escapeHTML(item.author || '')}
        </div>
      </div>
      <div class="board-right">
        <button class="board-pin-btn" aria-label="ปักหมุด"><i class="ti ti-pin" aria-hidden="true"></i></button>
      </div>
    </article>`;
  }).join('');
}

async function loadEventsFromSheet() {
  const list = document.querySelector('.event-list');
  if (!list) return;

  const events = await api({ action: 'get', sheet: 'Events' });
  if (!events || events.length === 0) return;

  const upcoming = events
    .filter(e => new Date(e.date) >= new Date())
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4);

  if (upcoming.length === 0) return;

  const colors = { urgent:'#FEE2E2;color:#B91C1C', warn:'#FEF3CD;color:#92400E', normal:'#EAF3DE;color:#2D6A4F' };
  list.innerHTML = upcoming.map(ev => {
    const d   = new Date(ev.date);
    const day = d.getDate();
    const mon = d.toLocaleDateString('th-TH', { month: 'short' });
    const style = ev.priority === 'urgent' ? colors.urgent : (ev.priority === 'warn' ? colors.warn : colors.normal);
    return `<li class="event-item">
      <div class="event-date-box" style="background:${style.split(';')[0].replace('background:','')}">
        <span class="event-day" style="${style.split(';')[1] || ''}">${day}</span>
        <span class="event-mon" style="${style.split(';')[1] || ''}">${mon}</span>
      </div>
      <div class="event-body">
        <div class="event-title">${escapeHTML(ev.title)}</div>
        <div class="event-sub">${escapeHTML(ev.description || '')}</div>
      </div>
    </li>`;
  }).join('');
}

/* ════════════════════════════════════════════
   RENDER POST HTML
════════════════════════════════════════════ */
function renderPostHTML(p) {
  const ini   = getInitials(p.author || '?');
  const color = nameToColor(p.author || '');
  const time  = formatTime(p.created_at);
  const likes = parseInt(p.likes) || 0;
  const tagClass = p.tag === 'ด่วน' ? 'tag-urgent' : (p.tag === 'SOP อัปเดต' ? 'tag-sop' : (p.tag === 'ไอเดีย' ? 'tag-idea' : 'tag-info'));

  return `<article class="post-card" data-post-id="${escapeHTML(p.id)}" aria-label="โพสต์จาก ${escapeHTML(p.author||'')}">
    <div class="post-header">
      <div class="avatar" style="background:${color}" aria-hidden="true">${escapeHTML(ini)}</div>
      <div class="post-meta-info">
        <div class="post-author">${escapeHTML(p.author||'')} <span class="post-dept">${escapeHTML(p.dept||'')}</span></div>
        <div class="post-time"><i class="ti ti-clock" aria-hidden="true"></i> ${time} · <i class="ti ti-world" aria-hidden="true"></i> ทีม</div>
      </div>
      <button class="post-more-btn" aria-label="ตัวเลือกเพิ่มเติม"><i class="ti ti-dots" aria-hidden="true"></i></button>
    </div>
    <div class="post-body">
      ${p.tag && p.tag !== 'ทั่วไป' ? `<span class="post-tag ${tagClass}">${escapeHTML(p.tag)}</span><br>` : ''}
      <p>${escapeHTML(p.content||'').replace(/\n/g,'<br>')}</p>
    </div>
    <div class="post-stats">
      <div class="post-react-summary">
        ${likes > 0
          ? `<div class="react-icons"><span class="react-icon" style="background:#2563EB" aria-hidden="true">👍</span></div><span>${likes} คน</span>`
          : `<span style="color:var(--text-tertiary);font-size:13px">ยังไม่มีปฏิกิริยา</span>`}
      </div>
      <span>0 ความคิดเห็น</span>
    </div>
    <div class="post-actions">
      <button class="post-action-btn like-btn" aria-label="ถูกใจ" data-post-id="${escapeHTML(p.id)}">
        <i class="ti ti-thumb-up" aria-hidden="true"></i> ถูกใจ
      </button>
      <button class="post-action-btn" aria-label="ความคิดเห็น">
        <i class="ti ti-message" aria-hidden="true"></i> ความคิดเห็น
      </button>
      <button class="post-action-btn" aria-label="แชร์">
        <i class="ti ti-share" aria-hidden="true"></i> แชร์
      </button>
    </div>
  </article>`;
}

/* ════════════════════════════════════════════
   CREATE POST
════════════════════════════════════════════ */
function bindCreatePost() {
  const input = document.getElementById('post-input');
  const btn   = document.getElementById('post-btn');
  if (!input || !btn) return;

  // clear placeholder on focus
  input.addEventListener('focus', () => {
    if (input.innerText === input.dataset.placeholder) input.innerText = '';
  });
  input.addEventListener('blur', () => {
    if (!input.innerText.trim()) input.innerText = input.dataset.placeholder || '';
  });

  btn.addEventListener('click', submitPost);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitPost();
  });
}

async function submitPost() {
  const input = document.getElementById('post-input');
  const text  = (input?.innerText || '').trim();
  const placeholder = input?.dataset.placeholder || '';
  if (!text || text === placeholder) { showToast('กรุณาพิมพ์ข้อความก่อนโพสต์'); return; }

  const user    = state.user || { name: 'ผู้ใช้งาน', dept: '' };
  const tagEl   = document.getElementById('post-tag-select');
  const tag     = tagEl ? tagEl.value : 'ทั่วไป';
  const postBtn = document.getElementById('post-btn');
  if (postBtn) { postBtn.disabled = true; postBtn.textContent = 'กำลังโพสต์…'; }

  const saved = await api({ action:'create', sheet:'Posts',
    author: user.name, dept: user.dept || '', content: text, tag, likes: 0 });

  // แสดง post ทันทีใน feed
  const feed    = document.getElementById('posts-feed');
  const emptyEl = feed?.querySelector('.empty-state, .loading-state');
  if (emptyEl) emptyEl.remove();

  const tmpId = saved?.id || ('tmp-' + Date.now());
  const postData = { id: tmpId, author: user.name, dept: user.dept||'', content: text, tag, created_at: new Date().toISOString(), likes: 0 };
  const article = document.createElement('div');
  article.innerHTML = renderPostHTML(postData);
  const el = article.firstElementChild;
  el.querySelector('.like-btn')?.addEventListener('click', handleLike);
  el.querySelector('.post-more-btn')?.addEventListener('click', handlePostMenu);
  feed?.insertBefore(el, feed.firstChild);

  input.innerText = placeholder;
  if (postBtn) { postBtn.disabled = false; postBtn.textContent = 'โพสต์'; }
  showToast(saved ? 'โพสต์เรียบร้อย ✓' : 'โพสต์แล้ว (ออฟไลน์)');
}

/* ════════════════════════════════════════════
   LIKE
════════════════════════════════════════════ */
function bindLikeButtons() {
  document.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', handleLike));
}

async function handleLike(e) {
  const btn    = e.currentTarget;
  const postId = btn.dataset.postId;
  const isLiked = btn.classList.toggle('liked');

  if (postId && !postId.startsWith('tmp-') && isLiked) {
    await api({ action:'like', id: postId });
  }
  showToast(isLiked ? '👍 ถูกใจแล้ว' : 'เอาถูกใจออก');
}

/* ════════════════════════════════════════════
   POST MENU (ลบโพสต์ของตัวเอง)
════════════════════════════════════════════ */
function handlePostMenu(e) {
  const btn  = e.currentTarget;
  const card = btn.closest('.post-card');
  const id   = card?.dataset.postId;

  // ลบ menu เก่า
  document.querySelectorAll('.post-ctx-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'post-ctx-menu';
  menu.innerHTML = `
    <button class="ctx-item" id="ctx-delete"><i class="ti ti-trash" aria-hidden="true"></i> ลบโพสต์</button>
    <button class="ctx-item" id="ctx-copy"><i class="ti ti-copy" aria-hidden="true"></i> คัดลอกข้อความ</button>`;

  const rect = btn.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.bottom+4}px;right:${window.innerWidth-rect.right}px;
    background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);
    box-shadow:var(--shadow-md);z-index:200;min-width:160px;padding:4px;`;

  document.body.appendChild(menu);

  menu.querySelector('#ctx-delete')?.addEventListener('click', async () => {
    if (id && !id.startsWith('tmp-')) await api({ action:'delete', sheet:'Posts', id });
    card?.remove();
    menu.remove();
    showToast('ลบโพสต์แล้ว');
  });

  menu.querySelector('#ctx-copy')?.addEventListener('click', () => {
    const txt = card?.querySelector('.post-body p')?.innerText || '';
    navigator.clipboard.writeText(txt);
    menu.remove();
    showToast('คัดลอกแล้ว ✓');
  });

  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 10);
}

/* ════════════════════════════════════════════
   BOARD — โพสต์ประกาศ
════════════════════════════════════════════ */
function bindBoardPost() {
  const btn = document.querySelector('#page-board .btn-primary');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const title = prompt('หัวข้อประกาศ:');
    if (!title?.trim()) return;
    const tag = prompt('ประเภท (ด่วน / SOP อัปเดต / ทั่วไป / ประชุม):', 'ทั่วไป') || 'ทั่วไป';
    const priority = tag === 'ด่วน' ? 'urgent' : 'normal';
    const user = state.user || { name: 'ผู้ใช้งาน' };

    api({ action:'create', sheet:'Board', author: user.name, title: title.trim(), tag, priority })
      .then(() => { showToast('โพสต์ประกาศแล้ว ✓'); loadBoardFromSheet(); });
  });
}

/* ════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════ */
function bindNav() {
  document.querySelectorAll('.nctab').forEach(btn =>
    btn.addEventListener('click', () => switchPage(btn.dataset.page)));
  document.querySelectorAll('.sb-item').forEach(btn =>
    btn.addEventListener('click', () => switchPage(btn.dataset.page)));
  document.querySelector('.sb-user-card')?.addEventListener('click', () => switchPage('myspace'));
}

function switchPage(pageId) {
  if (!pageId) return;
  state.currentPage = pageId;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageId}`)?.classList.add('active');
  document.querySelectorAll('.nctab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === pageId);
    t.setAttribute('aria-selected', String(t.dataset.page === pageId));
  });
  document.querySelectorAll('.sb-item').forEach(t =>
    t.classList.toggle('active', t.dataset.page === pageId));
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // โหลดข้อมูลใหม่ตาม page
  if (pageId === 'home')    { loadPostsFromSheet(); loadEventsFromSheet(); }
  if (pageId === 'board')   loadBoardFromSheet();
}

/* ════════════════════════════════════════════
   THEME / ACCENT / FONT
════════════════════════════════════════════ */
function applyTheme(t) {
  document.body.dataset.theme = t; state.theme = t; localStorage.setItem('ex-theme', t);
  const icon = document.querySelector('#theme-toggle i');
  if (icon) icon.className = (t === 'light') ? 'ti ti-moon' : 'ti ti-sun';
}
function applyAccent(a) {
  document.body.dataset.accent = a; state.accent = a; localStorage.setItem('ex-accent', a);
}
function applyFont(f) {
  document.body.dataset.font = f; state.font = f; localStorage.setItem('ex-font', f);
}
function applyFontSize(s) {
  document.documentElement.style.setProperty('--fs-base', s+'px');
  state.fontSize = s; localStorage.setItem('ex-fontsize', s);
  const lbl = document.getElementById('fs-value-label');
  if (lbl) lbl.textContent = s+'px';
}

function bindThemeToggle() {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const themes = ['light','dark','navy'];
    const next   = themes[(themes.indexOf(state.theme)+1) % themes.length];
    applyTheme(next); syncThemeRadio(next);
    showToast(next==='light'?'Light ☀️': next==='dark'?'Dark 🌙':'Navy 🌊');
  });
}
function syncThemeRadio(theme) {
  document.querySelectorAll('input[name="theme"]').forEach(r => r.checked = (r.value === theme));
}

/* ════════════════════════════════════════════
   SETTINGS TABS
════════════════════════════════════════════ */
function bindSettingsTabs() {
  document.querySelectorAll('.sn-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sn-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`stab-${btn.dataset.stab}`)?.classList.add('active');
    });
  });
}

function bindDisplaySettings() {
  document.querySelectorAll('input[name="theme"]').forEach(r =>
    r.addEventListener('change', () => applyTheme(r.value)));

  document.querySelectorAll('.accent-swatch').forEach(s =>
    s.addEventListener('click', () => {
      document.querySelectorAll('.accent-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active'); applyAccent(s.dataset.accent);
    }));

  const slider = document.getElementById('font-size-slider');
  slider?.addEventListener('input', () => applyFontSize(parseInt(slider.value)));

  document.querySelectorAll('input[name="font"]').forEach(r =>
    r.addEventListener('change', () => applyFont(r.value)));

  document.getElementById('save-display-btn')?.addEventListener('click', () =>
    showToast('บันทึกการตั้งค่าแล้ว ✓'));

  // Save profile
  document.querySelector('#stab-profile .save-btn')?.addEventListener('click', async () => {
    if (!state.user) return;
    const name = document.getElementById('pf-name')?.value || state.user.name;
    const dept = document.getElementById('pf-dept')?.value || state.user.dept;
    state.user.name = name; state.user.dept = dept;
    localStorage.setItem('ex-user', JSON.stringify(state.user));
    updateUserUI(state.user);
    showToast('บันทึกโปรไฟล์แล้ว ✓');
  });
}

function syncSettingsUI() {
  syncThemeRadio(state.theme);
  document.querySelectorAll('.accent-swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.accent === state.accent));
  const slider = document.getElementById('font-size-slider');
  if (slider) slider.value = state.fontSize;
  const lbl = document.getElementById('fs-value-label');
  if (lbl) lbl.textContent = state.fontSize+'px';
  document.querySelectorAll('input[name="font"]').forEach(r => r.checked = (r.value === state.font));
}

/* ════════════════════════════════════════════
   QUICK LINKS
════════════════════════════════════════════ */
function renderQuickLinks() {
  const list = document.getElementById('quick-links-list');
  if (!list) return;
  list.innerHTML = state.links.map(lk => {
    const m = LINK_META[lk.type] || LINK_META.slate;
    return `<a class="sb-link-item" href="${escapeHTML(lk.url)}" target="_blank" rel="noopener">
      <span class="sb-link-icon" style="background:${m.bg}">
        <i class="ti ${m.icon}" style="color:${m.color}" aria-hidden="true"></i>
      </span>
      <span class="sb-link-name">${escapeHTML(lk.name)}</span>
    </a>`;
  }).join('');
}

function renderLinksManager() {
  const mgr = document.getElementById('links-manager');
  if (!mgr) return;
  mgr.innerHTML = state.links.map((lk,i) => {
    const m = LINK_META[lk.type] || LINK_META.slate;
    return `<div class="lm-item">
      <div class="sb-link-icon" style="background:${m.bg}">
        <i class="ti ${m.icon}" style="color:${m.color}" aria-hidden="true"></i>
      </div>
      <div class="lm-info">
        <div class="lm-name">${escapeHTML(lk.name)}</div>
        <div class="lm-url">${escapeHTML(lk.url)}</div>
      </div>
      <button class="lm-del" aria-label="ลบ" data-idx="${i}"><i class="ti ti-trash" aria-hidden="true"></i></button>
    </div>`;
  }).join('');

  mgr.querySelectorAll('.lm-del').forEach(btn =>
    btn.addEventListener('click', () => {
      state.links.splice(parseInt(btn.dataset.idx), 1);
      saveLinks(); renderQuickLinks(); renderLinksManager();
      showToast('ลบลิงก์แล้ว');
    }));
}

function saveLinks() { localStorage.setItem('ex-links', JSON.stringify(state.links)); }

function addLink(name, url, type) {
  if (!name.trim()) { showToast('กรุณาใส่ชื่อลิงก์'); return false; }
  state.links.push({ name: name.trim(), url: url.trim()||'#', type });
  saveLinks(); renderQuickLinks(); renderLinksManager();
  return true;
}

function bindLinksModal() {
  const modal     = document.getElementById('link-modal');
  const openBtn   = document.getElementById('add-link-btn');
  const closeBtn  = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const confirmBtn= document.getElementById('modal-confirm');

  const open  = () => modal?.classList.add('open');
  const close = () => modal?.classList.remove('open');

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  modal?.addEventListener('click', e => { if (e.target===modal) close(); });

  confirmBtn?.addEventListener('click', () => {
    const name = document.getElementById('ml-name')?.value||'';
    const url  = document.getElementById('ml-url')?.value||'';
    const type = document.getElementById('ml-type')?.value||'slate';
    if (addLink(name,url,type)) {
      close();
      document.getElementById('ml-name').value='';
      document.getElementById('ml-url').value='';
      showToast(`เพิ่มลิงก์ "${name}" แล้ว ✓`);
    }
  });

  // settings page
  document.getElementById('confirm-add-link')?.addEventListener('click', () => {
    const name = document.getElementById('lf-name')?.value||'';
    const url  = document.getElementById('lf-url')?.value||'';
    const type = document.getElementById('lf-icon')?.value||'slate';
    if (addLink(name,url,type)) {
      if(document.getElementById('lf-name')) document.getElementById('lf-name').value='';
      if(document.getElementById('lf-url'))  document.getElementById('lf-url').value='';
      showToast(`เพิ่มลิงก์ "${name}" แล้ว ✓`);
    }
  });
}

/* ════════════════════════════════════════════
   MISC BINDINGS
════════════════════════════════════════════ */
function bindFeedTabs() {
  document.querySelectorAll('.feed-filter .ff-tab, .board-filters .ff-tab').forEach(tab =>
    tab.addEventListener('click', () => {
      tab.closest('.feed-filter,.board-filters')
         ?.querySelectorAll('.ff-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    }));
}

function bindProfileTabs() {
  document.querySelectorAll('.profile-tab').forEach(tab =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    }));
}

function bindCalNav() {
  const months=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  let cur = { y:2026, m:5 };
  document.querySelectorAll('.cal-nav').forEach((btn,i) =>
    btn.addEventListener('click', () => {
      cur.m += i===0 ? -1 : 1;
      if (cur.m<0)  { cur.m=11; cur.y--; }
      if (cur.m>11) { cur.m=0;  cur.y++; }
      const lbl = document.getElementById('cal-month-label');
      if (lbl) lbl.textContent = `${months[cur.m]} ${cur.y+543}`;
    }));
}

function bindLogout() {
  // logout button ใน settings
  document.querySelectorAll('[data-action="logout"]').forEach(btn =>
    btn.addEventListener('click', logout));
  // avatar click → แสดง dropdown
  document.getElementById('user-avatar-btn')?.addEventListener('click', () => {
    showToast('กด "ออกจากระบบ" ในหน้า ตั้งค่า');
  });
}

/* ════════════════════════════════════════════
   UTILITY
════════════════════════════════════════════ */
function formatTime(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return 'เมื่อกี้';
  if (diff < 3600)  return `${Math.floor(diff/60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diff/86400)} วันที่แล้ว`;
}

function getInitials(name='') {
  return name.trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase() || '?';
}

function nameToColor(name='') {
  const colors=['#1D4E8F','#2D6A4F','#7C3AED','#B45309','#B91C1C','#0F766E','#4C1D95','#065F46'];
  let h=0; for(const c of name) h=(h*31+c.charCodeAt(0))%colors.length;
  return colors[Math.abs(h)];
}

function escapeHTML(str='') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ════════════════════════════════════════════
   BOOT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // เพิ่ม CSS สำหรับ login screen และ states
  const style = document.createElement('style');
  style.textContent = `
    #login-screen{position:fixed;inset:0;background:var(--bg-page,#F0F2F5);display:flex;align-items:center;justify-content:center;z-index:1000}
    .login-box{background:#fff;border-radius:20px;padding:40px;text-align:center;max-width:360px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.12)}
    .login-logo{width:64px;height:64px;background:#0B2545;border-radius:16px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#C8972B}
    .login-title{font-size:24px;font-weight:700;color:#0B2545;margin-bottom:6px}
    .login-sub{color:#64748B;font-size:14px;margin-bottom:6px}
    .login-domain{font-size:12px;color:#94A3B8;background:#F1F5F9;padding:4px 12px;border-radius:20px;display:inline-block;margin-bottom:20px}
    .login-btn-wrap{display:flex;justify-content:center;margin-bottom:12px}
    .login-error{color:#B91C1C;font-size:13px;margin-top:8px}
    .loading-state,.empty-state{text-align:center;padding:48px 20px;color:var(--text-tertiary,#94A3B8);display:flex;flex-direction:column;align-items:center;gap:10px;font-size:14px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .ti-loader-2{display:inline-block;animation:spin 1s linear infinite}
    .post-ctx-menu{border-radius:10px;overflow:hidden}
    .ctx-item{display:flex;align-items:center;gap:8px;padding:9px 14px;width:100%;font-size:13px;cursor:pointer;background:none;border:none;color:var(--text-primary,#050505);font-family:inherit}
    .ctx-item:hover{background:var(--bg-hover,#F5F7FA)}
    .ctx-item i{font-size:16px}
  `;
  document.head.appendChild(style);

  // เริ่ม Auth flow
  initGoogleAuth();

  // bind board post button
  bindBoardPost();
});
