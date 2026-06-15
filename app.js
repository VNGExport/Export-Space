/* ════════════════════════════════════════════
   ExportSpace — app.js v3.0
   Clean: no mockup data. All data from Google Auth + Sheets.
   ════════════════════════════════════════════ */
'use strict';

const API_URL   = (typeof CONFIG !== 'undefined') ? CONFIG.SHEETS_API : '';
const CLIENT_ID = (typeof CONFIG !== 'undefined') ? CONFIG.CLIENT_ID  : '';
const DOMAIN    = (typeof CONFIG !== 'undefined') ? CONFIG.DOMAIN     : 'vanachai.com';

/* ── STATE ── */
const state = {
  user: null,
  theme:    localStorage.getItem('ex-theme')   || 'light',
  accent:   localStorage.getItem('ex-accent')  || 'blue',
  fontSize: parseInt(localStorage.getItem('ex-fontsize') || '15'),
  currentPage: 'home',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  allEvents: [],
  links: JSON.parse(localStorage.getItem('ex-links') || 'null') || [],
};

const LINK_META = {
  green:  { icon:'ti-file-certificate', bg:'#EAF3DE', color:'#2D6A4F' },
  blue:   { icon:'ti-forms',            bg:'#DBEAFE', color:'#1D4ED8' },
  gold:   { icon:'ti-building-bank',    bg:'#FDF3DC', color:'#C8972B' },
  purple: { icon:'ti-ship',             bg:'#FAF5FF', color:'#7C3AED' },
  slate:  { icon:'ti-link',             bg:'#F1F5F9', color:'#475569' },
};

/* ════════════════════════════════════════════
   API
════════════════════════════════════════════ */
async function api(params = {}) {
  if (!API_URL) return null;
  try {
    const res  = await fetch(API_URL + '?' + new URLSearchParams(params));
    const json = await res.json();
    return json.status === 'ok' ? json.data : null;
  } catch(e) { console.warn('API:', e.message); return null; }
}

/* ════════════════════════════════════════════
   PERFORMANCE: CACHE + KEEP-WARM
════════════════════════════════════════════ */
const CACHE = {};
const CACHE_TTL = { Posts:5*60e3, Board:5*60e3, Users:10*60e3, Events:30*60e3 };

async function apiCached(sheet) {
  const now = Date.now(), c = CACHE[sheet];
  if (c && (now - c.ts) < (CACHE_TTL[sheet]||5*60e3)) return c.data;
  const data = await api({ action:'get', sheet });
  if (data) CACHE[sheet] = { data, ts: now };
  return data || (c ? c.data : null);
}
function invalidateCache(sheet) { delete CACHE[sheet]; }

function keepScriptWarm() {
  if (!API_URL) return;
  setTimeout(() => {
    fetch(API_URL + '?action=ping').catch(()=>{});
    setInterval(() => fetch(API_URL + '?action=ping').catch(()=>{}), 4.5*60e3);
  }, 10e3);
}

/* ════════════════════════════════════════════
   GOOGLE LOGIN
════════════════════════════════════════════ */
function initAuth() {
  // ถ้าไม่มี CLIENT_ID ข้ามขั้นตอน login
  if (!CLIENT_ID) { startApp(null); return; }

  const saved = localStorage.getItem('ex-user');
  if (saved) {
    try { startApp(JSON.parse(saved)); return; } catch(e) {}
  }

  const s = document.createElement('script');
  s.src   = 'https://accounts.google.com/gsi/client';
  s.async = true; s.defer = true;
  s.onload  = setupGSI;
  s.onerror = () => startApp(null);
  document.head.appendChild(s);
}

function setupGSI() {
  if (!window.google) { startApp(null); return; }
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback:  onGoogleToken,
    auto_select: true,
    hosted_domain: DOMAIN,
  });
  google.accounts.id.prompt(n => {
    if (n.isNotDisplayed() || n.isSkippedMoment()) renderLoginScreen();
  });
}

function onGoogleToken(res) {
  try {
    const p = JSON.parse(atob(res.credential.split('.')[1]));
    if (!p.email.endsWith('@' + DOMAIN)) { loginError(`ใช้ได้เฉพาะ @${DOMAIN}`); return; }
    const user = { email: p.email, name: p.name || p.email.split('@')[0], photo: p.picture||'', dept:'Export & Logistics', jobTitle:'' };
    localStorage.setItem('ex-user', JSON.stringify(user));
    hideLogin(); startApp(user);
  } catch(e) { loginError('Login ไม่สำเร็จ'); }
}

function renderLoginScreen() {
  let el = document.getElementById('login-screen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'login-screen';
    el.innerHTML = `
      <div class="login-box">
        <div class="login-logo">EX</div>
        <h1 class="login-title">ExportSpace</h1>
        <p class="login-sub">Community สำหรับแผนก Export & Logistics</p>
        <p class="login-domain">ใช้งานด้วย <strong>@${DOMAIN}</strong> เท่านั้น</p>
        <div id="gsi-btn"></div>
        <p id="login-err" class="login-error" style="display:none"></p>
      </div>`;
    document.body.appendChild(el);
    if (window.google) {
      setTimeout(() => google.accounts.id.renderButton(
        document.getElementById('gsi-btn'),
        { theme:'outline', size:'large', locale:'th', width:280 }
      ), 80);
    }
  }
  el.style.display = 'flex';
  document.getElementById('topnav')?.style.setProperty('display','none');
  document.querySelector('.app-shell')?.style.setProperty('display','none');
}

function hideLogin() {
  const el = document.getElementById('login-screen');
  if (el) el.style.display = 'none';
  document.getElementById('topnav')?.style.removeProperty('display');
  document.querySelector('.app-shell')?.style.removeProperty('display');
}

function loginError(msg) {
  const el = document.getElementById('login-err');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function logout() {
  localStorage.removeItem('ex-user');
  if (window.google) google.accounts.id.disableAutoSelect();
  showToast('ออกจากระบบแล้ว'); setTimeout(() => location.reload(), 800);
}

/* ════════════════════════════════════════════
   START APP
════════════════════════════════════════════ */
function startApp(user) {
  state.user = user;
  keepScriptWarm();
  applyTheme(state.theme);
  applyAccent(state.accent);
  applyFontSize(state.fontSize);
  if (user) updateAllUserUI(user);
  renderQuickLinks();
  renderLinksManager();
  bindAll();
  syncSettingsUI();
  loadHome();
}

/* ── อัปเดต UI ทุกจุดด้วยข้อมูลผู้ใช้จริง ── */
function updateAllUserUI(u) {
  const ini = initials(u.name);
  const col = nameColor(u.name);

  // nav avatar
  const navAv = document.getElementById('nav-avatar');
  if (navAv) { navAv.textContent = ini; navAv.style.background = col; }

  // sidebar
  const sbAv   = document.getElementById('sb-avatar');
  const sbName = document.getElementById('sb-name');
  const sbRole = document.getElementById('sb-role');
  if (sbAv)   { sbAv.textContent = ini; sbAv.style.background = col; }
  if (sbName) sbName.textContent = u.name;
  if (sbRole) sbRole.textContent = (u.dept||'Export & Logistics') + (u.jobTitle ? ' · '+u.jobTitle : '');

  // create post avatar
  const cpAv = document.getElementById('cp-avatar');
  if (cpAv) { cpAv.textContent = ini; cpAv.style.background = col; }

  // profile page
  const pAv   = document.getElementById('profile-avatar');
  const pName = document.getElementById('profile-name');
  const pRole = document.getElementById('profile-role');
  if (pAv)   { pAv.textContent = ini; pAv.style.background = col; }
  if (pName) pName.textContent = u.name;
  if (pRole) pRole.textContent = (u.dept||'') + ' · ' + u.email;

  // about section
  const abDept  = document.getElementById('ab-dept');
  const abRole  = document.getElementById('ab-role');
  const abEmail = document.getElementById('ab-email');
  if (abDept)  abDept.textContent  = u.dept || '—';
  if (abRole)  abRole.textContent  = u.jobTitle || '—';
  if (abEmail) abEmail.textContent = u.email;

  // settings
  const pfName  = document.getElementById('pf-name');
  const pfDept  = document.getElementById('pf-dept');
  const pfEmail = document.getElementById('pf-email');
  const pfRoleS = document.getElementById('pf-role-s');
  const accEmail= document.getElementById('account-email');
  if (pfName)  pfName.value  = u.name;
  if (pfDept)  pfDept.value  = u.dept || '';
  if (pfEmail) pfEmail.value = u.email;
  if (pfRoleS) pfRoleS.value = u.jobTitle || '';
  if (accEmail) accEmail.textContent = u.email;

  // profile edit form
  const peName  = document.getElementById('pe-name');
  const peDept  = document.getElementById('pe-dept');
  const peRole  = document.getElementById('pe-role-input');
  const peEmail = document.getElementById('pe-email');
  if (peName)  peName.value  = u.name;
  if (peDept)  peDept.value  = u.dept || '';
  if (peRole)  peRole.value  = u.jobTitle || '';
  if (peEmail) peEmail.value = u.email;

  // post input placeholder
  const pi = document.getElementById('post-input');
  if (pi) pi.dataset.placeholder = `คุณคิดอะไรอยู่ ${u.name.split(' ')[0]}?`;
}


/* ── RENDER FROM PRE-FETCHED DATA (no extra fetch) ── */
function renderPosts(posts) {
  const feed = document.getElementById('posts-feed');
  if (!feed) return;
  if (!posts || posts.length === 0) {
    feed.innerHTML = '<div class="empty-state"><i class="ti ti-mood-empty" style="font-size:36px"></i><p>ยังไม่มีโพสต์ — เป็นคนแรกที่โพสต์เลย!</p></div>';
    return;
  }
  const sorted = [...posts].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  feed.innerHTML = sorted.map(postCard).join('');
  feed.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', onLike));
  feed.querySelectorAll('.post-more-btn').forEach(b => b.addEventListener('click', onPostMenu));
}

function renderOnlineUsers(users) {
  const list  = document.getElementById('online-list');
  const count = document.getElementById('online-count');
  if (!list) return;
  if (!users || users.length === 0) {
    list.innerHTML = '<li style="font-size:13px;color:var(--text-tertiary);padding:8px 16px">ยังไม่มีข้อมูล</li>';
    return;
  }
  const now = Date.now();
  const online = users.filter(u => u.last_seen && (now - new Date(u.last_seen)) < 30*60*1000);
  if (count) count.textContent = online.length || users.length;
  const show = online.length ? online : users.slice(0,4);
  list.innerHTML = show.map(u => {
    const ini = initials(u.name || u.email || '?');
    const col = nameColor(u.name || '');
    const isOnline = u.last_seen && (now - new Date(u.last_seen)) < 30*60*1000;
    return '<li class="online-item"><div class="ol-wrap"><div class="avatar sm" style="background:'+col+'">'+esc(ini)+'</div><span class="ol-dot" style="background:'+(isOnline?'#22C55E':'#FCD34D')+'"></span></div><div class="ol-info"><div class="ol-name">'+esc(u.name||u.email)+'</div><div class="ol-status">'+(isOnline?'กำลังใช้งาน':formatTime(u.last_seen))+'</div></div></li>';
  }).join('');
}

function renderUpcomingEvents(events) {
  const widget = document.getElementById('event-list');
  if (!widget) return;
  if (!events || events.length === 0) {
    widget.innerHTML = '<li style="font-size:13px;color:var(--text-tertiary);padding:8px 16px">ยังไม่มีกำหนดการ</li>';
    renderCalendar(); return;
  }
  const upcoming = [...events]
    .filter(e => new Date(e.date) >= new Date(new Date().toDateString()))
    .sort((a,b) => new Date(a.date) - new Date(b.date)).slice(0,4);
  widget.innerHTML = upcoming.length ? upcoming.map(ev => eventLI(ev)).join('') :
    '<li style="font-size:13px;color:var(--text-tertiary);padding:8px 16px">ไม่มีกำหนดการที่ใกล้จะมาถึง</li>';
  renderCalendar();
}

/* ════════════════════════════════════════════
   LOAD DATA
════════════════════════════════════════════ */
async function loadHome() {
  // โหลด 3 sheets พร้อมกัน (parallel) ลดเวลาจาก 3x → 1x
  const [posts, users, events] = await Promise.all([
    apiCached('Posts'), apiCached('Users'), apiCached('Events')
  ]);
  state.allEvents = events || [];
  renderPosts(posts);
  renderOnlineUsers(users);
  renderUpcomingEvents(events);
}

/* ── POSTS ── */
async function loadPosts(filter = null) {
  const feed = document.getElementById('posts-feed');
  if (!feed) return;
  feed.innerHTML = `<div class="loading-state"><i class="ti ti-loader-2" style="font-size:28px"></i><p>กำลังโหลด…</p></div>`;

  const posts = await apiCached('Posts');
  if (!posts || posts.length === 0) {
    feed.innerHTML = `<div class="empty-state"><i class="ti ti-mood-empty" style="font-size:36px"></i><p>ยังไม่มีโพสต์ — เป็นคนแรกที่โพสต์เลย!</p></div>`;
    return;
  }
  const filtered = filter ? posts.filter(p => p.tag === filter) : posts;
  const sorted   = [...filtered].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  feed.innerHTML  = sorted.map(postCard).join('');
  feed.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', onLike));
  feed.querySelectorAll('.post-more-btn').forEach(b => b.addEventListener('click', onPostMenu));
}

/* ── ONLINE USERS ── */
async function loadOnlineUsers() {
  const list  = document.getElementById('online-list');
  const count = document.getElementById('online-count');
  if (!list) return;

  const users = await api({ action:'get', sheet:'Users' });
  if (!users || users.length === 0) {
    list.innerHTML = `<li style="font-size:13px;color:var(--text-tertiary);padding:8px 16px">ยังไม่มีข้อมูล</li>`;
    return;
  }

  // ถือว่า online = last_seen ภายใน 30 นาที
  const now = Date.now();
  const online = users.filter(u => u.last_seen && (now - new Date(u.last_seen)) < 30*60*1000);
  if (count) count.textContent = online.length;

  list.innerHTML = (online.length ? online : users.slice(0,4)).map(u => {
    const ini = initials(u.name || u.email || '?');
    const col = nameColor(u.name || '');
    const isOnline = u.last_seen && (now - new Date(u.last_seen)) < 30*60*1000;
    const dotColor = isOnline ? '#22C55E' : '#FCD34D';
    return `<li class="online-item">
      <div class="ol-wrap">
        <div class="avatar sm" style="background:${col}">${esc(ini)}</div>
        <span class="ol-dot" style="background:${dotColor}"></span>
      </div>
      <div class="ol-info">
        <div class="ol-name">${esc(u.name || u.email)}</div>
        <div class="ol-status">${isOnline ? 'กำลังใช้งาน' : formatTime(u.last_seen)}</div>
      </div>
    </li>`;
  }).join('');
}

/* ── EVENTS (widget + calendar) ── */
async function loadUpcomingEvents() {
  const widget = document.getElementById('event-list');
  const events = await api({ action:'get', sheet:'Events' });
  state.allEvents = events || [];

  if (!widget) return;
  if (!events || events.length === 0) {
    widget.innerHTML = `<li style="font-size:13px;color:var(--text-tertiary);padding:8px 16px">ยังไม่มีกำหนดการ</li>`;
    renderCalendar();
    return;
  }

  const upcoming = [...events]
    .filter(e => new Date(e.date) >= new Date(new Date().toDateString()))
    .sort((a,b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4);

  widget.innerHTML = upcoming.length ? upcoming.map(ev => eventLI(ev)).join('') :
    `<li style="font-size:13px;color:var(--text-tertiary);padding:8px 16px">ไม่มีกำหนดการที่ใกล้จะมาถึง</li>`;

  renderCalendar();
}

function eventLI(ev) {
  const d = new Date(ev.date);
  const day = d.getDate();
  const mon = d.toLocaleDateString('th-TH', { month:'short' });
  const isUrgent = ev.priority === 'urgent';
  const bg    = isUrgent ? '#FEE2E2' : (ev.priority === 'warn' ? '#FEF3CD' : '#EAF3DE');
  const color = isUrgent ? '#B91C1C' : (ev.priority === 'warn' ? '#92400E' : '#2D6A4F');
  return `<li class="event-item">
    <div class="event-date-box" style="background:${bg}">
      <span class="event-day" style="color:${color}">${day}</span>
      <span class="event-mon" style="color:${color}">${mon}</span>
    </div>
    <div class="event-body">
      <div class="event-title">${esc(ev.title)}</div>
      <div class="event-sub">${esc(ev.description||'')}</div>
    </div>
  </li>`;
}

/* ── BOARD ── */
async function loadBoard() {
  const list = document.getElementById('board-list');
  if (!list) return;
  list.innerHTML = `<div class="loading-state"><i class="ti ti-loader-2" style="font-size:24px"></i></div>`;

  const items = await apiCached('Board');
  if (!items || items.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="ti ti-mood-empty" style="font-size:36px"></i><p>ยังไม่มีประกาศ</p></div>`;
    return;
  }
  const sorted = [...items].sort((a,b) => {
    if (a.priority==='urgent' && b.priority!=='urgent') return -1;
    if (b.priority==='urgent' && a.priority!=='urgent') return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  list.innerHTML = sorted.map(it => {
    const isUrgent = it.priority === 'urgent';
    const priColor = isUrgent ? 'var(--c-red)' : 'var(--c-navy-400)';
    const tagClass = isUrgent ? 'tag-urgent' : (it.tag==='SOP อัปเดต'?'tag-sop':'tag-info');
    const ini = initials(it.author||'?'); const col = nameColor(it.author||'');
    return `<article class="board-item${isUrgent?' board-urgent':''}" data-id="${esc(it.id)}">
      <div class="board-left"><div class="board-pri-bar" style="background:${priColor}"></div></div>
      <div class="board-content">
        <div class="board-top"><span class="post-tag ${tagClass}">${esc(it.tag||'ทั่วไป')}</span><span class="board-time">${formatTime(it.created_at)}</span></div>
        <div class="board-title">${esc(it.title)}</div>
        <div class="board-author"><div class="avatar xs" style="background:${col}">${esc(ini)}</div>${esc(it.author||'')}</div>
      </div>
      <div class="board-right">
        <button class="board-pin-btn board-del-btn" data-id="${esc(it.id)}" aria-label="ลบประกาศ">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>
    </article>`;
  }).join('');

  list.querySelectorAll('.board-del-btn').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('ลบประกาศนี้?')) return;
    await api({ action:'delete', sheet:'Board', id: b.dataset.id });
    showToast('ลบประกาศแล้ว'); loadBoard();
  }));

  // badge
  const badge = document.getElementById('board-badge');
  if (badge) { badge.textContent = items.length; badge.style.display = items.length ? '' : 'none'; }
}

/* ── MY POSTS ── */
async function loadMyPosts() {
  const col = document.getElementById('my-posts-col');
  if (!col || !state.user) return;
  col.innerHTML = `<div class="loading-state"><i class="ti ti-loader-2" style="font-size:24px"></i></div>`;

  const posts = await api({ action:'get', sheet:'Posts' });
  const mine  = (posts||[]).filter(p => p.author === state.user.name);

  if (mine.length === 0) {
    col.innerHTML = `<div class="empty-state"><i class="ti ti-pencil" style="font-size:32px"></i><p>คุณยังไม่มีโพสต์</p></div>`;
    return;
  }
  const sorted = [...mine].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  col.innerHTML = sorted.map(postCard).join('');
  col.querySelectorAll('.like-btn').forEach(b => b.addEventListener('click', onLike));
  col.querySelectorAll('.post-more-btn').forEach(b => b.addEventListener('click', onPostMenu));
}

/* ════════════════════════════════════════════
   RENDER POST CARD
════════════════════════════════════════════ */
function postCard(p) {
  const ini   = initials(p.author||'?');
  const col   = nameColor(p.author||'');
  const likes = parseInt(p.likes)||0;
  const tagMap = { 'ด่วน':'tag-urgent','SOP อัปเดต':'tag-sop','ไอเดีย':'tag-idea' };
  const tagCls = tagMap[p.tag] || 'tag-info';
  const showTag = p.tag && p.tag !== 'ทั่วไป';

  return `<article class="post-card" data-post-id="${esc(p.id)}">
    <div class="post-header">
      <div class="avatar" style="background:${col}" aria-hidden="true">${esc(ini)}</div>
      <div class="post-meta-info">
        <div class="post-author">${esc(p.author||'')} <span class="post-dept">${esc(p.dept||'')}</span></div>
        <div class="post-time"><i class="ti ti-clock" aria-hidden="true"></i> ${formatTime(p.created_at)}</div>
      </div>
      <button class="post-more-btn" aria-label="ตัวเลือก"><i class="ti ti-dots" aria-hidden="true"></i></button>
    </div>
    <div class="post-body">
      ${showTag ? `<span class="post-tag ${tagCls}">${esc(p.tag)}</span><br>` : ''}
      <p>${esc(p.content||'').replace(/\n/g,'<br>')}</p>
    </div>
    <div class="post-stats">
      <div class="post-react-summary">
        ${likes > 0
          ? `<div class="react-icons"><span class="react-icon" style="background:#2563EB">👍</span></div><span>${likes} คน</span>`
          : `<span style="color:var(--text-tertiary);font-size:13px">ยังไม่มีปฏิกิริยา</span>`}
      </div>
      <span>0 ความคิดเห็น</span>
    </div>
    <div class="post-actions">
      <button class="post-action-btn like-btn" data-post-id="${esc(p.id)}">
        <i class="ti ti-thumb-up" aria-hidden="true"></i> ถูกใจ
      </button>
      <button class="post-action-btn"><i class="ti ti-message" aria-hidden="true"></i> ความคิดเห็น</button>
      <button class="post-action-btn"><i class="ti ti-share" aria-hidden="true"></i> แชร์</button>
    </div>
  </article>`;
}

/* ════════════════════════════════════════════
   CALENDAR
════════════════════════════════════════════ */
function renderCalendar() {
  const grid  = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month-label');
  if (!grid) return;

  const y = state.calYear, m = state.calMonth;
  const thMonth = new Date(y, m, 1).toLocaleDateString('th-TH', { month:'long' });
  if (label) label.textContent = `${thMonth} ${y + 543}`;

  // clear old days (keep day-label headers = first 7 children)
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const today = new Date();

  // event dates this month
  const evDates = {};
  state.allEvents.forEach(ev => {
    const d = new Date(ev.date);
    if (d.getFullYear()===y && d.getMonth()===m) {
      const key = d.getDate();
      if (!evDates[key]) evDates[key] = [];
      evDates[key].push(ev);
    }
  });

  // blank cells
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div'); el.className = 'cal-day empty'; grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const el   = document.createElement('div');
    const isToday = today.getDate()===d && today.getMonth()===m && today.getFullYear()===y;
    el.className = 'cal-day' + (isToday ? ' today' : '');
    el.textContent = d;
    if (evDates[d]) {
      evDates[d].forEach(ev => {
        const span = document.createElement('span');
        span.className = 'cal-event' + (ev.priority==='urgent' ? ' urgent-ev' : '');
        span.textContent = ev.title.slice(0,8) + (ev.title.length > 8 ? '…' : '');
        span.title = ev.title;
        el.appendChild(span);
      });
    }
    grid.appendChild(el);
  }

  // event list below calendar
  renderCalEventList();
}

function renderCalEventList() {
  const el = document.getElementById('cal-event-list');
  if (!el) return;
  const y = state.calYear, m = state.calMonth;
  const month = state.allEvents.filter(ev => {
    const d = new Date(ev.date);
    return d.getFullYear()===y && d.getMonth()===m;
  }).sort((a,b) => new Date(a.date) - new Date(b.date));

  if (month.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px"><i class="ti ti-calendar-off" style="font-size:28px"></i><p>ไม่มีกำหนดการในเดือนนี้</p></div>`;
    return;
  }
  el.innerHTML = `<ul class="event-list">${month.map(ev => eventLI(ev)).join('')}</ul>`;
}

/* ════════════════════════════════════════════
   SUBMIT POST
════════════════════════════════════════════ */
async function submitPost() {
  const input = document.getElementById('post-input');
  const placeholder = input?.dataset.placeholder || '';
  const text  = (input?.innerText || '').trim();
  if (!text || text === placeholder) { showToast('กรุณาพิมพ์ข้อความก่อน'); return; }

  const user = state.user || { name:'ผู้ใช้งาน', dept:'' };
  const tag  = document.getElementById('post-tag-select')?.value || 'ทั่วไป';
  const btn  = document.getElementById('post-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังโพสต์…'; }

  const saved = await api({ action:'create', sheet:'Posts', author:user.name, dept:user.dept||'', content:text, tag, likes:0 });

  const feed  = document.getElementById('posts-feed');
  feed?.querySelector('.empty-state, .loading-state')?.remove();

  const tmp = { id: saved?.id || 'tmp-'+Date.now(), author:user.name, dept:user.dept||'', content:text, tag, created_at:new Date().toISOString(), likes:0 };
  const div = document.createElement('div');
  div.innerHTML = postCard(tmp);
  const card = div.firstElementChild;
  card.querySelector('.like-btn')?.addEventListener('click', onLike);
  card.querySelector('.post-more-btn')?.addEventListener('click', onPostMenu);
  feed?.insertBefore(card, feed.firstChild);

  input.innerText = '';
  if (btn) { btn.disabled = false; btn.textContent = 'โพสต์'; }
  invalidateCache('Posts'); showToast(saved ? 'โพสต์แล้ว ✓' : 'โพสต์แล้ว (offline)');
}

/* ════════════════════════════════════════════
   LIKE
════════════════════════════════════════════ */
async function onLike(e) {
  const btn    = e.currentTarget;
  const postId = btn.dataset.postId;
  const liked  = btn.classList.toggle('liked');
  if (liked && postId && !postId.startsWith('tmp-')) {
    await api({ action:'like', id:postId });
  }
  showToast(liked ? '👍 ถูกใจแล้ว' : 'เอาถูกใจออก');
}

/* ════════════════════════════════════════════
   POST MENU
════════════════════════════════════════════ */
function onPostMenu(e) {
  const btn  = e.currentTarget;
  const card = btn.closest('.post-card');
  const id   = card?.dataset.postId;
  const isOwner = state.user && card?.querySelector('.post-author')?.textContent.startsWith(state.user.name);

  document.querySelectorAll('.post-ctx-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'post-ctx-menu';
  menu.innerHTML = `
    ${isOwner ? `<button class="ctx-item ctx-delete" data-id="${esc(id||'')}"><i class="ti ti-trash"></i> ลบโพสต์</button>` : ''}
    <button class="ctx-item ctx-copy"><i class="ti ti-copy"></i> คัดลอกข้อความ</button>`;

  const r = btn.getBoundingClientRect();
  Object.assign(menu.style, {
    position:'fixed', top:(r.bottom+4)+'px', right:(window.innerWidth-r.right)+'px',
    background:'var(--bg-surface)', border:'1px solid var(--border)',
    borderRadius:'var(--r-md)', boxShadow:'var(--shadow-md)', zIndex:'200',
    minWidth:'160px', padding:'4px',
  });
  document.body.appendChild(menu);

  menu.querySelector('.ctx-delete')?.addEventListener('click', async () => {
    if (id && !id.startsWith('tmp-')) await api({ action:'delete', sheet:'Posts', id });
    card?.remove(); menu.remove(); showToast('ลบโพสต์แล้ว');
  });
  menu.querySelector('.ctx-copy')?.addEventListener('click', () => {
    navigator.clipboard.writeText(card?.querySelector('.post-body p')?.innerText||'');
    menu.remove(); showToast('คัดลอกแล้ว ✓');
  });
  setTimeout(() => document.addEventListener('click', ()=>menu.remove(), { once:true }), 10);
}

/* ════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════ */
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
  window.scrollTo({ top:0, behavior:'smooth' });

  if (pageId === 'home')    loadHome();
  if (pageId === 'board')   loadBoard();
  if (pageId === 'myspace') { updateAllUserUI(state.user||{}); loadMyPosts(); }
  if (pageId === 'calendar') { loadUpcomingEvents(); }
}

/* ════════════════════════════════════════════
   BIND ALL
════════════════════════════════════════════ */
function bindAll() {
  // nav
  document.querySelectorAll('.nctab').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));
  document.querySelectorAll('.sb-item').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page)));
  document.querySelector('.sb-user-card')?.addEventListener('click', () => switchPage('myspace'));

  // post
  document.getElementById('post-btn')?.addEventListener('click', submitPost);
  const pi = document.getElementById('post-input');
  if (pi) {
    pi.addEventListener('focus', () => { if (pi.innerText === pi.dataset.placeholder) pi.innerText=''; });
    pi.addEventListener('blur',  () => { if (!pi.innerText.trim()) pi.innerText = pi.dataset.placeholder||''; });
    pi.addEventListener('keydown', e => { if (e.key==='Enter' && (e.ctrlKey||e.metaKey)) submitPost(); });
  }

  // feed tabs
  document.querySelectorAll('.feed-filter .ff-tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.feed-filter .ff-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tagMap = { 'ประกาศ':'ประกาศ','C/O & Shipping':'C/O & Shipping','ไอเดีย':'ไอเดีย' };
    loadPosts(tagMap[t.textContent.trim()] || null);
  }));

  // board
  document.getElementById('board-post-btn')?.addEventListener('click', () => {
    const f = document.getElementById('board-post-form');
    if (f) f.style.display = f.style.display==='none' ? 'block' : 'none';
  });
  document.getElementById('board-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('board-post-form').style.display = 'none';
  });
  document.getElementById('board-confirm-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('board-title-input')?.value.trim();
    const tag   = document.getElementById('board-tag-select')?.value || 'ทั่วไป';
    if (!title) { showToast('กรุณาใส่หัวข้อ'); return; }
    const user = state.user || { name:'ผู้ใช้งาน' };
    await api({ action:'create', sheet:'Board', author:user.name, title, tag, priority: tag==='ด่วน'?'urgent':'normal' });
    document.getElementById('board-title-input').value = '';
    document.getElementById('board-post-form').style.display = 'none';
    invalidateCache('Board'); showToast('โพสต์ประกาศแล้ว ✓'); loadBoard();
  });
  document.querySelectorAll('.board-filters .ff-tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.board-filters .ff-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
  }));

  // profile edit
  document.getElementById('profile-edit-btn')?.addEventListener('click', () => {
    const f = document.getElementById('profile-edit-form');
    const b = document.getElementById('profile-body');
    if (f && b) { f.style.display='block'; b.style.display='none'; }
  });
  document.getElementById('pe-cancel')?.addEventListener('click', () => {
    document.getElementById('profile-edit-form').style.display='none';
    document.getElementById('profile-body').style.display='grid';
  });
  document.getElementById('pe-save')?.addEventListener('click', () => {
    if (!state.user) return;
    state.user.name     = document.getElementById('pe-name')?.value  || state.user.name;
    state.user.dept     = document.getElementById('pe-dept')?.value  || state.user.dept;
    state.user.jobTitle = document.getElementById('pe-role-input')?.value || '';
    localStorage.setItem('ex-user', JSON.stringify(state.user));
    updateAllUserUI(state.user);
    document.getElementById('profile-edit-form').style.display='none';
    document.getElementById('profile-body').style.display='grid';
    showToast('บันทึกโปรไฟล์แล้ว ✓');
  });
  document.querySelectorAll('.profile-tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.profile-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    if (t.dataset.ptab === 'posts') { document.getElementById('my-posts-col').style.display='block'; document.getElementById('about-card').style.display='none'; }
    else { document.getElementById('my-posts-col').style.display='none'; document.getElementById('about-card').style.display='block'; }
  }));

  // calendar
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    state.calMonth--; if (state.calMonth<0) { state.calMonth=11; state.calYear--; } renderCalendar();
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    state.calMonth++; if (state.calMonth>11) { state.calMonth=0; state.calYear++; } renderCalendar();
  });
  document.getElementById('cal-add-btn')?.addEventListener('click', () => {
    const f = document.getElementById('cal-add-form');
    if (f) f.style.display = f.style.display==='none' ? 'block' : 'none';
    // set today as default
    const dt = document.getElementById('ev-date');
    if (dt && !dt.value) dt.value = new Date().toISOString().split('T')[0];
  });
  document.getElementById('cal-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('cal-add-form').style.display='none';
  });
  document.getElementById('cal-confirm-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('ev-title')?.value.trim();
    const date  = document.getElementById('ev-date')?.value;
    const desc  = document.getElementById('ev-desc')?.value.trim();
    const pri   = document.getElementById('ev-pri')?.value || 'normal';
    if (!title||!date) { showToast('กรุณาใส่หัวข้อและวันที่'); return; }
    await api({ action:'create', sheet:'Events', title, date, description:desc, priority:pri });
    document.getElementById('ev-title').value='';
    document.getElementById('cal-add-form').style.display='none';
    showToast('เพิ่มกำหนดการแล้ว ✓');
    await loadUpcomingEvents();
  });

  // settings
  document.querySelectorAll('.sn-item').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.sn-item').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.stab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById(`stab-${b.dataset.stab}`)?.classList.add('active');
  }));
  document.querySelectorAll('input[name="theme"]').forEach(r => r.addEventListener('change', () => applyTheme(r.value)));
  document.querySelectorAll('.accent-swatch').forEach(s => s.addEventListener('click', () => {
    document.querySelectorAll('.accent-swatch').forEach(x => x.classList.remove('active'));
    s.classList.add('active'); applyAccent(s.dataset.accent);
  }));
  const slider = document.getElementById('font-size-slider');
  slider?.addEventListener('input', () => applyFontSize(parseInt(slider.value)));
  document.getElementById('save-display-btn')?.addEventListener('click', () => showToast('บันทึกแล้ว ✓'));
  document.getElementById('save-profile-btn')?.addEventListener('click', () => {
    if (!state.user) return;
    state.user.name     = document.getElementById('pf-name')?.value  || state.user.name;
    state.user.dept     = document.getElementById('pf-dept')?.value  || state.user.dept;
    state.user.jobTitle = document.getElementById('pf-role-s')?.value|| '';
    localStorage.setItem('ex-user', JSON.stringify(state.user));
    updateAllUserUI(state.user); showToast('บันทึกโปรไฟล์แล้ว ✓');
  });
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // quick links modal
  const modal = document.getElementById('link-modal');
  document.getElementById('add-link-btn')?.addEventListener('click',  () => modal?.classList.add('open'));
  document.getElementById('modal-close')?.addEventListener('click',   () => modal?.classList.remove('open'));
  document.getElementById('modal-cancel')?.addEventListener('click',  () => modal?.classList.remove('open'));
  modal?.addEventListener('click', e => { if (e.target===modal) modal.classList.remove('open'); });
  document.getElementById('modal-confirm')?.addEventListener('click', () => {
    const n = document.getElementById('ml-name')?.value||'';
    const u = document.getElementById('ml-url')?.value||'';
    const t = document.getElementById('ml-type')?.value||'slate';
    if (addLink(n,u,t)) {
      modal?.classList.remove('open');
      document.getElementById('ml-name').value=''; document.getElementById('ml-url').value='';
    }
  });
  document.getElementById('confirm-add-link')?.addEventListener('click', () => {
    const n = document.getElementById('lf-name')?.value||'';
    const u = document.getElementById('lf-url')?.value||'';
    const t = document.getElementById('lf-icon')?.value||'slate';
    if (addLink(n,u,t)) {
      document.getElementById('lf-name').value=''; document.getElementById('lf-url').value='';
    }
  });

  // theme toggle button (topnav)
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const arr = ['light','dark','navy'];
    applyTheme(arr[(arr.indexOf(state.theme)+1)%arr.length]);
    syncSettingsUI();
  });
}

/* ════════════════════════════════════════════
   THEME / ACCENT / FONT
════════════════════════════════════════════ */
function applyTheme(t)    { document.body.dataset.theme = t; state.theme = t; localStorage.setItem('ex-theme',t); const i=document.querySelector('#theme-toggle i'); if(i) i.className=t==='light'?'ti ti-moon':'ti ti-sun'; }
function applyAccent(a)   { document.body.dataset.accent = a; state.accent = a; localStorage.setItem('ex-accent',a); }
function applyFontSize(s) { document.documentElement.style.setProperty('--fs-base',s+'px'); state.fontSize=s; localStorage.setItem('ex-fontsize',s); const l=document.getElementById('fs-value-label'); if(l) l.textContent=s+'px'; }

function syncSettingsUI() {
  document.querySelectorAll('input[name="theme"]').forEach(r => r.checked = r.value === state.theme);
  document.querySelectorAll('.accent-swatch').forEach(s => s.classList.toggle('active', s.dataset.accent === state.accent));
  const sl=document.getElementById('font-size-slider'); if(sl) sl.value=state.fontSize;
  const lb=document.getElementById('fs-value-label'); if(lb) lb.textContent=state.fontSize+'px';
}

/* ════════════════════════════════════════════
   QUICK LINKS
════════════════════════════════════════════ */
function renderQuickLinks() {
  const el = document.getElementById('quick-links-list');
  if (!el) return;
  el.innerHTML = state.links.length
    ? state.links.map(lk => { const m=LINK_META[lk.type]||LINK_META.slate;
        return `<a class="sb-link-item" href="${esc(lk.url)}" target="_blank" rel="noopener">
          <span class="sb-link-icon" style="background:${m.bg}"><i class="ti ${m.icon}" style="color:${m.color}" aria-hidden="true"></i></span>
          <span class="sb-link-name">${esc(lk.name)}</span></a>`; }).join('')
    : `<p style="font-size:12px;color:var(--text-tertiary);padding:4px 10px">ยังไม่มีลิงก์ — กด + เพิ่มได้เลย</p>`;
}

function renderLinksManager() {
  const el = document.getElementById('links-manager'); if (!el) return;
  el.innerHTML = state.links.map((lk,i) => { const m=LINK_META[lk.type]||LINK_META.slate;
    return `<div class="lm-item">
      <div class="sb-link-icon" style="background:${m.bg}"><i class="ti ${m.icon}" style="color:${m.color}" aria-hidden="true"></i></div>
      <div class="lm-info"><div class="lm-name">${esc(lk.name)}</div><div class="lm-url">${esc(lk.url)}</div></div>
      <button class="lm-del" data-idx="${i}" aria-label="ลบ"><i class="ti ti-trash" aria-hidden="true"></i></button>
    </div>`; }).join('');
  el.querySelectorAll('.lm-del').forEach(b => b.addEventListener('click', () => {
    state.links.splice(parseInt(b.dataset.idx),1); saveLinks(); renderQuickLinks(); renderLinksManager(); showToast('ลบลิงก์แล้ว');
  }));
}

function addLink(name, url, type) {
  if (!name.trim()) { showToast('กรุณาใส่ชื่อลิงก์'); return false; }
  state.links.push({ name:name.trim(), url:url.trim()||'#', type });
  saveLinks(); renderQuickLinks(); renderLinksManager(); showToast(`เพิ่ม "${name}" แล้ว ✓`); return true;
}
function saveLinks() { localStorage.setItem('ex-links', JSON.stringify(state.links)); }

/* ════════════════════════════════════════════
   UTILITY
════════════════════════════════════════════ */
function formatTime(iso) {
  if (!iso) return ''; const d=Math.floor((Date.now()-new Date(iso))/1000);
  if (d<60) return 'เมื่อกี้'; if (d<3600) return `${Math.floor(d/60)} นาทีที่แล้ว`;
  if (d<86400) return `${Math.floor(d/3600)} ชั่วโมงที่แล้ว`; return `${Math.floor(d/86400)} วันที่แล้ว`;
}
function initials(n='') { return n.trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase()||'?'; }
function nameColor(n='') {
  const c=['#1D4E8F','#2D6A4F','#7C3AED','#B45309','#B91C1C','#0F766E','#4C1D95','#065F46'];
  let h=0; for(const ch of n) h=(h*31+ch.charCodeAt(0))%c.length; return c[Math.abs(h)];
}
function esc(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

let _toastT;
function showToast(msg) {
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show'); clearTimeout(_toastT);
  _toastT=setTimeout(()=>t.classList.remove('show'),2400);
}

/* ════════════════════════════════════════════
   BOOT
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // inject extra styles
  const s = document.createElement('style');
  s.textContent = `
    #login-screen{position:fixed;inset:0;background:var(--bg-page,#F0F2F5);display:flex;align-items:center;justify-content:center;z-index:1000}
    .login-box{background:#fff;border-radius:20px;padding:40px 36px;text-align:center;max-width:360px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.14)}
    .login-logo{width:64px;height:64px;background:#0B2545;border-radius:16px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#C8972B}
    .login-title{font-size:24px;font-weight:700;color:#0B2545;margin-bottom:6px}
    .login-sub{color:#64748B;font-size:14px;margin-bottom:8px}
    .login-domain{font-size:12px;color:#64748B;background:#F1F5F9;padding:4px 14px;border-radius:20px;display:inline-block;margin-bottom:22px}
    .login-error{color:#B91C1C;font-size:13px;margin-top:10px}
    .loading-state,.empty-state{display:flex;flex-direction:column;align-items:center;gap:10px;padding:48px 20px;color:var(--text-tertiary,#94A3B8);font-size:14px;text-align:center}
    @keyframes spin{to{transform:rotate(360deg)}}
    .ti-loader-2{animation:spin .8s linear infinite}
    .post-ctx-menu{border-radius:10px;overflow:hidden}
    .ctx-item{display:flex;align-items:center;gap:8px;padding:9px 14px;width:100%;font-size:13px;cursor:pointer;background:none;border:none;color:var(--text-primary,#050505);font-family:inherit}
    .ctx-item:hover{background:var(--bg-hover,#F5F7FA)}
    .ctx-item i{font-size:16px}
    .board-post-form{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px;margin-bottom:16px;max-width:600px}
    .bpf-title{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--text-primary)}
    .bpf-btns{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}
    .profile-edit-form{margin-bottom:16px}
    .cp-tag-select{font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg-subtle);color:var(--text-primary);font-family:inherit}
    #cal-event-list .event-list{padding:0}
    #cal-event-list .event-item{background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:8px}
  `;
  document.head.appendChild(s);
  initAuth();
});
