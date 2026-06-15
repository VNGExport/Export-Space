/* ════════════════════════════════════════════
   ExportSpace — app.js
   Handles: navigation, theme, posts, links, settings
   ════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════
   GOOGLE APPS SCRIPT API
   วาง Web App URL ที่ได้จาก Deploy ตรงนี้
══════════════════════════════════════════ */
const API_URL = (typeof CONFIG !== 'undefined') ? CONFIG.SHEETS_API
  : "https://script.google.com/macros/s/AKfycbyOVLP70eaS7iMJHM0i62QFsOcEXwDX5JYpmCGjvzEg77UqFECNEb2Bm12CFAlvxIhdyw/exec";

/* ── API HELPERS (GET only — หลีกเลี่ยง CORS) ── */
async function apiGet(sheet) {
  try {
    const url = `${API_URL}?action=get&sheet=${encodeURIComponent(sheet)}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.status === 'ok' ? json.data : [];
  } catch (e) {
    console.error('API GET error:', e);
    return [];
  }
}

async function apiPost(action, sheet, data = {}, id = null) {
  try {
    // ใช้ GET แทน POST เพื่อหลีกเลี่ยง CORS preflight
    const params = new URLSearchParams({ action, sheet });
    if (id) params.set('id', id);
    Object.entries(data).forEach(([k, v]) => params.set(k, v));
    const res = await fetch(`${API_URL}?${params.toString()}`);
    const json = await res.json();
    return json.status === 'ok' ? json.data : null;
  } catch (e) {
    console.error('API error:', e);
    return null;
  }
}

/* ── STATE ── */
const state = {
  theme: localStorage.getItem('ex-theme') || 'light',
  accent: localStorage.getItem('ex-accent') || 'blue',
  font: localStorage.getItem('ex-font') || 'ibm',
  fontSize: parseInt(localStorage.getItem('ex-fontsize') || '15'),
  currentPage: 'home',
  links: JSON.parse(localStorage.getItem('ex-links') || 'null') || [
    { name: 'Origin Desk',     url: '#', type: 'green',  icon: 'ti-file-certificate' },
    { name: 'e-Form ศุลกากร', url: '#', type: 'blue',   icon: 'ti-forms' },
    { name: 'KBank L/C Portal',url: '#', type: 'gold',   icon: 'ti-building-bank' },
    { name: 'Freight Tracker', url: '#', type: 'purple', icon: 'ti-ship' },
  ],
};

/* ── ICON / COLOR MAP ── */
const LINK_ICONS = {
  green:  { icon: 'ti-file-certificate', bg: '#EAF3DE', color: '#2D6A4F' },
  blue:   { icon: 'ti-forms',            bg: '#DBEAFE', color: '#1D4ED8' },
  gold:   { icon: 'ti-building-bank',    bg: '#FDF3DC', color: '#C8972B' },
  purple: { icon: 'ti-ship',             bg: '#FAF5FF', color: '#7C3AED' },
  slate:  { icon: 'ti-link',             bg: '#F1F5F9', color: '#475569' },
};

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
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
  syncSettingsUI();
  await loadPostsFromSheet();
});

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
function bindNav() {
  /* Top nav tabs */
  document.querySelectorAll('.nctab').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  /* Left sidebar items */
  document.querySelectorAll('.sb-item').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  /* User card → My Space */
  document.querySelector('.sb-user-card')?.addEventListener('click', () => switchPage('myspace'));
}

function switchPage(pageId) {
  if (!pageId) return;
  state.currentPage = pageId;

  /* Hide all pages */
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  /* Show target */
  const target = document.getElementById(`page-${pageId}`);
  if (target) target.classList.add('active');

  /* Sync top tabs */
  document.querySelectorAll('.nctab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === pageId);
    t.setAttribute('aria-selected', t.dataset.page === pageId ? 'true' : 'false');
  });

  /* Sync sidebar */
  document.querySelectorAll('.sb-item').forEach(t => {
    t.classList.toggle('active', t.dataset.page === pageId);
  });

  /* Scroll top */
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════════════════════════════════
   THEME
══════════════════════════════════════════ */
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  state.theme = theme;
  localStorage.setItem('ex-theme', theme);
  const icon = document.querySelector('#theme-toggle i');
  if (icon) {
    icon.className = theme === 'dark' ? 'ti ti-sun' : (theme === 'navy' ? 'ti ti-sun' : 'ti ti-moon');
  }
}

function applyAccent(accent) {
  document.body.dataset.accent = accent;
  state.accent = accent;
  localStorage.setItem('ex-accent', accent);
}

function applyFont(font) {
  document.body.dataset.font = font;
  state.font = font;
  localStorage.setItem('ex-font', font);
}

function applyFontSize(size) {
  document.documentElement.style.setProperty('--fs-base', size + 'px');
  state.fontSize = size;
  localStorage.setItem('ex-fontsize', size);
  const lbl = document.getElementById('fs-value-label');
  if (lbl) lbl.textContent = size + 'px';
}

function bindThemeToggle() {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const themes = ['light', 'dark', 'navy'];
    const next = themes[(themes.indexOf(state.theme) + 1) % themes.length];
    applyTheme(next);
    syncThemeRadio(next);
    showToast(`ธีม: ${next === 'light' ? 'Light ☀️' : next === 'dark' ? 'Dark 🌙' : 'Navy 🌊'}`);
  });
}

/* ══════════════════════════════════════════
   LOAD POSTS FROM SHEET
══════════════════════════════════════════ */
async function loadPostsFromSheet() {
  const feed = document.getElementById('posts-feed');
  if (!feed) return;

  // แสดง loading
  feed.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-tertiary)">
    <i class="ti ti-loader" style="font-size:24px"></i><br>กำลังโหลดโพสต์…
  </div>`;

  const posts = await apiGet('Posts');

  if (!posts || posts.length === 0) {
    feed.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-tertiary)">
      ยังไม่มีโพสต์ — เป็นคนแรกที่โพสต์!
    </div>`;
    return;
  }

  // เรียงจากใหม่ไปเก่า
  const sorted = posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  feed.innerHTML = sorted.map(p => {
    const initials = (p.author || '?').split(' ').map(w => w[0]).join('').slice(0, 2);
    const timeAgo  = formatTime(p.created_at);
    return `
    <article class="post-card" data-post-id="${escapeHTML(p.id)}">
      <div class="post-header">
        <div class="avatar av-navy" aria-hidden="true">${escapeHTML(initials)}</div>
        <div class="post-meta-info">
          <div class="post-author">${escapeHTML(p.author)} <span class="post-dept">${escapeHTML(p.dept || '')}</span></div>
          <div class="post-time"><i class="ti ti-clock" aria-hidden="true"></i> ${timeAgo} · <i class="ti ti-world" aria-hidden="true"></i> ทีม</div>
        </div>
        <button class="post-more-btn" aria-label="ตัวเลือกเพิ่มเติม"><i class="ti ti-dots" aria-hidden="true"></i></button>
      </div>
      <div class="post-body"><p>${escapeHTML(p.content || '')}</p></div>
      <div class="post-stats">
        <div class="post-react-summary">${p.likes > 0
          ? `<span style="font-size:13px">👍 ${p.likes} คน</span>`
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
  }).join('');

  // bind like buttons ใหม่
  feed.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', handleLike);
  });
}

function formatTime(isoString) {
  if (!isoString) return 'ไม่ทราบเวลา';
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60)   return 'เมื่อกี้';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diff / 86400)} วันที่แล้ว`;
}

/* ══════════════════════════════════════════
   CREATE POST
══════════════════════════════════════════ */
function bindCreatePost() {
  const input = document.getElementById('post-input');
  const btn = document.getElementById('post-btn');
  if (!input || !btn) return;

  btn.addEventListener('click', submitPost);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitPost();
  });
}

async function submitPost() {
  const input = document.getElementById('post-input');
  const text = input?.innerText?.trim();
  if (!text) { showToast('กรุณาพิมพ์ข้อความก่อนโพสต์'); return; }

  // บันทึกลง Google Sheets
  const saved = await apiPost('create', 'Posts', {
    author: 'Ravee Digital Space',
    dept: 'Export & Logistics',
    content: text,
    tag: 'ทั่วไป',
    likes: 0
  });

  const postId = saved?.id || ('local-' + Date.now());

  const feed = document.getElementById('posts-feed');
  const article = document.createElement('article');
  article.className = 'post-card';
  article.dataset.postId = postId;
  article.setAttribute('aria-label', 'โพสต์ใหม่ของคุณ');
  article.innerHTML = `
    <div class="post-header">
      <div class="avatar av-navy" aria-hidden="true">รว</div>
      <div class="post-meta-info">
        <div class="post-author">Ravee Digital Space <span class="post-dept">แผนก Export</span></div>
        <div class="post-time"><i class="ti ti-clock" aria-hidden="true"></i> เมื่อกี้ · <i class="ti ti-world" aria-hidden="true"></i> ทีม</div>
      </div>
      <button class="post-more-btn" aria-label="ตัวเลือกเพิ่มเติม"><i class="ti ti-dots" aria-hidden="true"></i></button>
    </div>
    <div class="post-body"><p>${escapeHTML(text)}</p></div>
    <div class="post-stats">
      <div class="post-react-summary"><span style="color:var(--text-tertiary);font-size:13px">ยังไม่มีปฏิกิริยา</span></div>
      <span>0 ความคิดเห็น</span>
    </div>
    <div class="post-actions">
      <button class="post-action-btn like-btn" aria-label="ถูกใจ" data-post-id="${postId}"><i class="ti ti-thumb-up" aria-hidden="true"></i> ถูกใจ</button>
      <button class="post-action-btn" aria-label="แสดงความคิดเห็น"><i class="ti ti-message" aria-hidden="true"></i> ความคิดเห็น</button>
      <button class="post-action-btn" aria-label="แชร์"><i class="ti ti-share" aria-hidden="true"></i> แชร์</button>
    </div>`;

  feed.insertBefore(article, feed.firstChild);
  article.querySelector('.like-btn')?.addEventListener('click', handleLike);
  input.innerText = '';
  showToast(saved ? 'โพสต์เรียบร้อย ✓ (บันทึกแล้ว)' : 'โพสต์แล้ว (offline)');
  article.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ══════════════════════════════════════════
   LIKE BUTTONS
══════════════════════════════════════════ */
function bindLikeButtons() {
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', handleLike);
  });
}

async function handleLike(e) {
  const btn = e.currentTarget;
  btn.classList.toggle('liked');
  const isLiked = btn.classList.contains('liked');
  const postId = btn.dataset.postId;

  if (isLiked && postId && !postId.startsWith('local-')) {
    await apiPost('like', 'Posts', {}, postId);
  }

  showToast(isLiked ? 'ถูกใจแล้ว 👍' : 'เอาถูกใจออก');
}

/* ══════════════════════════════════════════
   FEED FILTER TABS
══════════════════════════════════════════ */
function bindFeedTabs() {
  document.querySelectorAll('.feed-filter .ff-tab, .board-filters .ff-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.feed-filter, .board-filters');
      parent?.querySelectorAll('.ff-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

/* ══════════════════════════════════════════
   SETTINGS TABS
══════════════════════════════════════════ */
function bindSettingsTabs() {
  document.querySelectorAll('.sn-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sn-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tabId = `stab-${btn.dataset.stab}`;
      document.getElementById(tabId)?.classList.add('active');
    });
  });
}

/* ══════════════════════════════════════════
   DISPLAY SETTINGS
══════════════════════════════════════════ */
function bindDisplaySettings() {
  /* Theme radios */
  document.querySelectorAll('input[name="theme"]').forEach(r => {
    r.addEventListener('change', () => applyTheme(r.value));
  });

  /* Accent swatches */
  document.querySelectorAll('.accent-swatch').forEach(s => {
    s.addEventListener('click', () => {
      document.querySelectorAll('.accent-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      applyAccent(s.dataset.accent);
    });
  });

  /* Font size slider */
  const slider = document.getElementById('font-size-slider');
  slider?.addEventListener('input', () => applyFontSize(parseInt(slider.value)));

  /* Font radios */
  document.querySelectorAll('input[name="font"]').forEach(r => {
    r.addEventListener('change', () => applyFont(r.value));
  });

  /* Save button */
  document.getElementById('save-display-btn')?.addEventListener('click', () => {
    showToast('บันทึกการตั้งค่าแล้ว ✓');
  });
}

function syncSettingsUI() {
  /* Sync theme radio */
  syncThemeRadio(state.theme);

  /* Sync accent */
  document.querySelectorAll('.accent-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === state.accent);
  });

  /* Sync font size */
  const slider = document.getElementById('font-size-slider');
  if (slider) slider.value = state.fontSize;
  const lbl = document.getElementById('fs-value-label');
  if (lbl) lbl.textContent = state.fontSize + 'px';

  /* Sync font radio */
  document.querySelectorAll('input[name="font"]').forEach(r => {
    r.checked = r.value === state.font;
  });
}

function syncThemeRadio(theme) {
  document.querySelectorAll('input[name="theme"]').forEach(r => {
    r.checked = r.value === theme;
  });
}

/* ══════════════════════════════════════════
   QUICK LINKS
══════════════════════════════════════════ */
function renderQuickLinks() {
  const list = document.getElementById('quick-links-list');
  if (!list) return;
  list.innerHTML = state.links.map(link => {
    const meta = LINK_ICONS[link.type] || LINK_ICONS.slate;
    return `<a class="sb-link-item" href="${escapeHTML(link.url)}" data-tooltip="${escapeHTML(link.name)}">
      <span class="sb-link-icon" style="background:${meta.bg}">
        <i class="ti ${meta.icon}" style="color:${meta.color}" aria-hidden="true"></i>
      </span>
      <span class="sb-link-name">${escapeHTML(link.name)}</span>
    </a>`;
  }).join('');
}

function renderLinksManager() {
  const mgr = document.getElementById('links-manager');
  if (!mgr) return;
  mgr.innerHTML = state.links.map((link, i) => {
    const meta = LINK_ICONS[link.type] || LINK_ICONS.slate;
    return `<div class="lm-item">
      <div class="sb-link-icon" style="background:${meta.bg}">
        <i class="ti ${meta.icon}" style="color:${meta.color}" aria-hidden="true"></i>
      </div>
      <div class="lm-info">
        <div class="lm-name">${escapeHTML(link.name)}</div>
        <div class="lm-url">${escapeHTML(link.url)}</div>
      </div>
      <button class="lm-del" aria-label="ลบ ${escapeHTML(link.name)}" data-idx="${i}">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    </div>`;
  }).join('');

  mgr.querySelectorAll('.lm-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      state.links.splice(idx, 1);
      saveLinks();
      renderQuickLinks();
      renderLinksManager();
      showToast('ลบลิงก์แล้ว');
    });
  });
}

function saveLinks() {
  localStorage.setItem('ex-links', JSON.stringify(state.links));
}

function addLink(name, url, type) {
  if (!name.trim()) { showToast('กรุณาใส่ชื่อลิงก์'); return false; }
  state.links.push({ name: name.trim(), url: url.trim() || '#', type });
  saveLinks();
  renderQuickLinks();
  renderLinksManager();
  return true;
}

/* ══════════════════════════════════════════
   LINKS MODAL (sidebar + button)
══════════════════════════════════════════ */
function bindLinksModal() {
  const modal = document.getElementById('link-modal');
  const openBtn = document.getElementById('add-link-btn');
  const closeBtn = document.getElementById('modal-close');
  const cancelBtn = document.getElementById('modal-cancel');
  const confirmBtn = document.getElementById('modal-confirm');

  openBtn?.addEventListener('click', () => modal?.classList.add('open'));
  closeBtn?.addEventListener('click', () => modal?.classList.remove('open'));
  cancelBtn?.addEventListener('click', () => modal?.classList.remove('open'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

  confirmBtn?.addEventListener('click', () => {
    const name = document.getElementById('ml-name')?.value || '';
    const url  = document.getElementById('ml-url')?.value  || '';
    const type = document.getElementById('ml-type')?.value || 'slate';
    if (addLink(name, url, type)) {
      modal?.classList.remove('open');
      document.getElementById('ml-name').value = '';
      document.getElementById('ml-url').value  = '';
      showToast(`เพิ่มลิงก์ "${name}" แล้ว ✓`);
    }
  });

  /* Settings page add link */
  document.getElementById('confirm-add-link')?.addEventListener('click', () => {
    const name = document.getElementById('lf-name')?.value || '';
    const url  = document.getElementById('lf-url')?.value  || '';
    const type = document.getElementById('lf-icon')?.value || 'slate';
    if (addLink(name, url, type)) {
      if (document.getElementById('lf-name')) document.getElementById('lf-name').value = '';
      if (document.getElementById('lf-url'))  document.getElementById('lf-url').value  = '';
      showToast(`เพิ่มลิงก์ "${name}" แล้ว ✓`);
    }
  });
}

/* ══════════════════════════════════════════
   PROFILE TABS
══════════════════════════════════════════ */
function bindProfileTabs() {
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

/* ══════════════════════════════════════════
   CALENDAR NAV
══════════════════════════════════════════ */
function bindCalNav() {
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  let current = { y: 2026, m: 5 }; // June 2026 (0-indexed)

  document.querySelectorAll('.cal-nav').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      current.m += i === 0 ? -1 : 1;
      if (current.m < 0)  { current.m = 11; current.y--; }
      if (current.m > 11) { current.m = 0;  current.y++; }
      const lbl = document.getElementById('cal-month-label');
      if (lbl) lbl.textContent = `${months[current.m]} ${current.y + 543}`;
    });
  });
}

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

/* ══════════════════════════════════════════
   UTILITY
══════════════════════════════════════════ */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
