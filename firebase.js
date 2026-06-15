/* ════════════════════════════════════════════
   ExportSpace — firebase.js v3
   Fixed: presence stable, DM working, no blink
   ════════════════════════════════════════════ */

const FB_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const FB_CONFIG = {
  apiKey:            "AIzaSyBxOFMM4dC_50jWoG6JHnpfmD2I0AWu3fc",
  authDomain:        "exportspace-c8777.firebaseapp.com",
  databaseURL:       "https://exportspace-c8777-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "exportspace-c8777",
  storageBucket:     "exportspace-c8777.firebasestorage.app",
  messagingSenderId: "420770714233",
  appId:             "1:420770714233:web:490daa0db34323382cbaa8",
};

let db           = null;
let fbUser       = null;
let _connBound   = false;  // ป้องกัน .info/connected bind ซ้ำ
let _dmUnsubMsg  = null;
let _dmUnsubTyp  = null;
let _activeDMUser = null;
let _typingTimer  = null;
let _dmBadge      = 0;
/* เก็บ user objects ทั้งหมดใน memory เพื่อ openDM โดยไม่ต้อง parse HTML */
const _onlineUsers = {};

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[src="' + src + '"]')) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function initFirebase(user) {
  if (db) { _setPresence(user); return; }
  try {
    await loadScript(FB_SDK + '/firebase-app-compat.js');
    await loadScript(FB_SDK + '/firebase-database-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    db = firebase.database();
    fbUser = { name: user.name, email: user.email, dept: user.dept || '', uid: _key(user.email) };

    _injectStyles();
    _buildDMBox();
    _setPresence(fbUser);
    _watchFeed();
    _watchIncomingDM();
    console.log('[FB] ready:', fbUser.email);
  } catch(e) {
    console.warn('[FB] init error:', e.message);
  }
}

/* ════════════════════════════════════════════
   PRESENCE  — stable, no blink
════════════════════════════════════════════ */
function _setPresence(user) {
  if (!db || !user || _connBound) return;
  _connBound = true;

  const uid  = _key(user.email);
  const pRef = db.ref('presence/' + uid);

  /* ตั้งค่า onDisconnect ทันที (ก่อน listen connected) */
  pRef.onDisconnect().remove();

  /* เขียน presence ทันที */
  pRef.set({
    name: user.name, email: user.email,
    dept: user.dept || '', online: true,
    ts: firebase.database.ServerValue.TIMESTAMP,
  });

  /* ถ้า reconnect → เขียนซ้ำ + reset onDisconnect */
  db.ref('.info/connected').on('value', snap => {
    if (!snap.val()) return;          // offline → ไม่ทำอะไร รอ reconnect
    pRef.onDisconnect().remove();     // reset onDisconnect
    pRef.set({
      name: user.name, email: user.email,
      dept: user.dept || '', online: true,
      ts: firebase.database.ServerValue.TIMESTAMP,
    });
  });
}

function listenOnlineUsers(cb) {
  if (!db) return () => {};
  const ref = db.ref('presence');
  const fn  = snap => {
    const list = [];
    _onlineUsers.clear && _onlineUsers.clear();
    Object.keys(_onlineUsers).forEach(k => delete _onlineUsers[k]);
    snap.forEach(c => {
      const v = c.val();
      if (v && v.online && v.email) {
        list.push(v);
        _onlineUsers[v.email] = v; // เก็บไว้ใช้ openDM
      }
    });
    cb(list);
  };
  ref.on('value', fn);
  return () => ref.off('value', fn);
}

/* ════════════════════════════════════════════
   ONLINE LIST UI
════════════════════════════════════════════ */
function startRealtimeOnlineUsers() {
  return listenOnlineUsers(users => {
    const list  = document.getElementById('online-list');
    const badge = document.getElementById('online-count');
    if (!list) return;
    if (badge) badge.textContent = users.length;

    if (!users.length) {
      list.innerHTML = '<li style="font-size:13px;color:#94A3B8;padding:8px 16px">ยังไม่มีใครออนไลน์</li>';
      return;
    }

    list.innerHTML = users.map(u => {
      const ini  = (u.name||'?').trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
      const col  = _nameColor(u.name||'');
      const isMe = u.email === fbUser?.email;
      /* ใช้ data-email แทน JSON ใน onclick เพื่อหลีกเลี่ยง escape ปัญหา */
      return '<li class="online-item">'
        + '<div class="ol-wrap">'
        +   '<div class="avatar sm" style="background:' + col + '" aria-hidden="true">' + _esc(ini) + '</div>'
        +   '<span class="ol-dot" style="background:#22C55E;position:absolute;bottom:0;right:0;'
        +   'width:10px;height:10px;border-radius:50%;border:2px solid #fff"></span>'
        + '</div>'
        + '<div class="ol-info">'
        +   '<div class="ol-name">' + _esc(u.name || u.email) + (isMe ? ' <span style="color:#94A3B8;font-size:11px">(คุณ)</span>' : '') + '</div>'
        +   '<div class="ol-status" style="display:flex;align-items:center;gap:6px;margin-top:2px">'
        +     '<span style="width:7px;height:7px;border-radius:50%;background:#22C55E;display:inline-block"></span>'
        +     '<span style="font-size:11px;color:#64748B">ออนไลน์</span>'
        +     (!isMe
                ? '<button class="dm-btn" data-email="' + _esc(u.email) + '" aria-label="ส่งข้อความถึง ' + _esc(u.name) + '">'
                +   '<i class="ti ti-message" aria-hidden="true" style="font-size:12px"></i> DM</button>'
                : '')
        +   '</div>'
        + '</div>'
        + '</li>';
    }).join('');

    /* bind DM buttons ด้วย event delegation — ไม่ใช้ inline onclick */
    list.querySelectorAll('.dm-btn[data-email]').forEach(btn => {
      btn.addEventListener('click', () => {
        const email = btn.dataset.email;
        const user  = _onlineUsers[email];
        if (user) openDM(user);
      });
    });
  });
}

/* ════════════════════════════════════════════
   FEED SIGNAL
════════════════════════════════════════════ */
function _watchFeed() {
  if (!db) return;
  const since = Date.now();
  db.ref('feed_signal').orderByChild('ts').startAt(since).on('child_added', snap => {
    const sig = snap.val();
    if (!sig || sig.author === fbUser?.name) return;
    if (typeof invalidateCache === 'function') invalidateCache('Posts');
    if (typeof loadPosts       === 'function') loadPosts();
    if (typeof showToast       === 'function') showToast('🔔 ' + sig.author + ' โพสต์ใหม่');
  });
}

function signalNewPost(author) {
  if (!db) return;
  db.ref('feed_signal').push({ author, ts: firebase.database.ServerValue.TIMESTAMP });
}

/* ════════════════════════════════════════════
   DIRECT MESSAGE — core
════════════════════════════════════════════ */
function _room(a, b) {
  const ka = _key(a), kb = _key(b);
  return ka < kb ? ka + '__' + kb : kb + '__' + ka;
}

async function sendDM(toUser, text) {
  if (!db || !fbUser || !text.trim()) return false;
  await db.ref('dm/' + _room(fbUser.email, toUser.email)).push({
    from: fbUser.name, fromEmail: fbUser.email,
    to:   toUser.name, toEmail:   toUser.email,
    text: text.trim(),
    ts:   firebase.database.ServerValue.TIMESTAMP,
    read: false,
  });
  return true;
}

function _listenDM(toUser, cb) {
  if (!db || !fbUser) return () => {};
  const ref = db.ref('dm/' + _room(fbUser.email, toUser.email))
                .orderByChild('ts').limitToLast(60);
  const fn  = snap => { const msgs = []; snap.forEach(c => msgs.push({ id:c.key, ...c.val() })); cb(msgs); };
  ref.on('value', fn);
  return () => ref.off('value', fn);
}

function _listenTyping(toUser, cb) {
  if (!db || !fbUser) return () => {};
  const ref = db.ref('typing/' + _room(fbUser.email, toUser.email));
  const fn  = snap => {
    const t = [];
    snap.forEach(c => { if (c.key !== fbUser.uid && c.val()) t.push(c.val()); });
    cb(t);
  };
  ref.on('value', fn);
  return () => ref.off('value', fn);
}

function _typing(on) {
  if (!db || !fbUser || !_activeDMUser) return;
  db.ref('typing/' + _room(fbUser.email, _activeDMUser.email) + '/' + fbUser.uid)
    .set(on ? fbUser.name : null);
}

function _markRead(toUser) {
  if (!db || !fbUser) return;
  const ref = db.ref('dm/' + _room(fbUser.email, toUser.email));
  ref.once('value', snap => {
    const upd = {};
    snap.forEach(c => { if (c.val()?.fromEmail !== fbUser.email && !c.val()?.read) upd[c.key + '/read'] = true; });
    if (Object.keys(upd).length) ref.update(upd);
  });
}

function _watchIncomingDM() {
  if (!db || !fbUser) return;
  const myKey = _key(fbUser.email);
  const since = Date.now();
  db.ref('dm').on('child_added', roomSnap => {
    if (!roomSnap.key.includes(myKey)) return;
    roomSnap.ref.orderByChild('ts').startAt(since).limitToLast(1).on('child_added', msgSnap => {
      const msg = msgSnap.val();
      if (!msg || msg.fromEmail === fbUser.email) return;
      if (!msg.read) {
        _dmBadge++;
        _setBadge(_dmBadge);
        _dmToast(msg.from, msg.text, { name: msg.from, email: msg.fromEmail });
      }
    });
  });
}

/* ════════════════════════════════════════════
   DM BOX — UI
════════════════════════════════════════════ */
function openDM(toUser) {
  if (!toUser?.email) return;

  /* ปิด listener เดิม */
  if (_dmUnsubMsg) { _dmUnsubMsg(); _dmUnsubMsg = null; }
  if (_dmUnsubTyp) { _dmUnsubTyp(); _dmUnsubTyp = null; }
  _typing(false);
  _activeDMUser = toUser;
  _markRead(toUser);

  /* reset badge */
  _dmBadge = Math.max(0, _dmBadge - 1);
  _setBadge(_dmBadge);

  /* แสดง box */
  const box = document.getElementById('dm-box');
  if (!box) { _buildDMBox(); }
  document.getElementById('dm-box').style.display   = 'flex';
  document.getElementById('dm-title').textContent   = '💬 ' + toUser.name;
  document.getElementById('dm-msgs').innerHTML      =
    '<div style="text-align:center;padding:24px;font-size:13px;color:#94A3B8">กำลังโหลด…</div>';
  document.getElementById('dm-typing-bar').textContent = '';

  /* start listeners */
  _dmUnsubMsg = _listenDM(toUser, msgs => _renderMsgs(msgs));
  _dmUnsubTyp = _listenTyping(toUser, typers => {
    const el = document.getElementById('dm-typing-bar');
    if (el) el.textContent = typers.length ? typers.join(', ') + ' กำลังพิมพ์…' : '';
  });

  document.getElementById('dm-input')?.focus();
}

function closeDM() {
  if (_dmUnsubMsg) { _dmUnsubMsg(); _dmUnsubMsg = null; }
  if (_dmUnsubTyp) { _dmUnsubTyp(); _dmUnsubTyp = null; }
  _typing(false);
  _activeDMUser = null;
  const b = document.getElementById('dm-box');
  if (b) b.style.display = 'none';
}

async function _submitDM() {
  const input = document.getElementById('dm-input');
  const text  = (input?.value || '').trim();
  if (!text || !_activeDMUser || !fbUser) return;
  input.value = '';
  _typing(false);
  clearTimeout(_typingTimer);

  /* optimistic — แสดงทันที */
  _appendMsg({ from: fbUser.name, fromEmail: fbUser.email, text, ts: Date.now() });

  await sendDM(_activeDMUser, text);
}

function _appendMsg(m) {
  const el = document.getElementById('dm-msgs');
  if (!el) return;
  const ph = el.querySelector('[data-ph]');
  if (ph) ph.remove();
  const mine = m.fromEmail === fbUser?.email;
  const time = new Date(m.ts || Date.now()).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
  const div  = document.createElement('div');
  div.className = 'dm-msg ' + (mine ? 'mine' : 'theirs');
  div.innerHTML = _esc(m.text) + '<div class="dm-meta">' + time + '</div>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function _renderMsgs(msgs) {
  const el = document.getElementById('dm-msgs');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<div data-ph style="text-align:center;padding:24px;font-size:13px;color:#94A3B8">เริ่มการสนทนาได้เลย</div>';
    return;
  }
  el.innerHTML = msgs.map(m => {
    const mine = m.fromEmail === fbUser?.email;
    const time = m.ts ? new Date(m.ts).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' }) : '';
    return '<div class="dm-msg ' + (mine ? 'mine' : 'theirs') + '">'
      + _esc(m.text)
      + '<div class="dm-meta">' + time + (mine && m.read ? ' · อ่านแล้ว' : '') + '</div>'
      + '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function _buildDMBox() {
  if (document.getElementById('dm-box')) return;
  const box = document.createElement('div');
  box.id = 'dm-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'กล่องข้อความโดยตรง');
  box.style.display = 'none';
  box.innerHTML =
    '<div id="dm-head">'
    +  '<span id="dm-title" style="font-size:13px;font-weight:600;color:#fff"></span>'
    +  '<button id="dm-close-btn" aria-label="ปิด" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:2px 8px;border-radius:6px;line-height:1;opacity:.85">✕</button>'
    + '</div>'
    + '<div id="dm-msgs" role="log" aria-live="polite"></div>'
    + '<div id="dm-typing-bar" style="font-size:11px;color:#94A3B8;padding:2px 12px;min-height:16px;flex-shrink:0"></div>'
    + '<div id="dm-foot">'
    +   '<input id="dm-input" type="text" placeholder="พิมพ์ข้อความ… (Enter ส่ง)" maxlength="500" aria-label="ข้อความ">'
    +   '<button id="dm-send-btn" aria-label="ส่ง"><i class="ti ti-send" aria-hidden="true" style="font-size:16px"></i></button>'
    + '</div>';
  document.body.appendChild(box);

  /* bind events — ไม่ใช้ inline onclick เลย */
  document.getElementById('dm-close-btn').addEventListener('click', closeDM);
  document.getElementById('dm-send-btn').addEventListener('click', _submitDM);
  document.getElementById('dm-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _submitDM(); return; }
    _typing(true);
    clearTimeout(_typingTimer);
    _typingTimer = setTimeout(() => _typing(false), 2500);
  });
}

function _injectStyles() {
  if (document.getElementById('fb-css')) return;
  const s = document.createElement('style');
  s.id = 'fb-css';
  s.textContent = `
    #dm-box{position:fixed;bottom:20px;right:20px;width:310px;height:420px;
      background:#fff;border:1px solid #E4E6EB;border-radius:16px;
      box-shadow:0 8px 32px rgba(0,0,0,.18);display:flex;flex-direction:column;
      z-index:9999;overflow:hidden;font-family:inherit}
    [data-theme=dark] #dm-box{background:#1C2029;border-color:#2E3340}
    #dm-head{display:flex;align-items:center;justify-content:space-between;
      padding:10px 14px;background:var(--accent,#1D4E8F);flex-shrink:0}
    #dm-close-btn:hover{background:rgba(255,255,255,.2)!important}
    #dm-msgs{flex:1;overflow-y:auto;padding:10px 12px;
      display:flex;flex-direction:column;gap:6px;scrollbar-width:thin}
    #dm-foot{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #E4E6EB;flex-shrink:0}
    [data-theme=dark] #dm-foot{border-color:#2E3340}
    #dm-input{flex:1;padding:8px 12px;border:1px solid #E4E6EB;border-radius:20px;
      font-size:13px;background:#F0F2F5;color:#050505;outline:none;font-family:inherit}
    [data-theme=dark] #dm-input{background:#252A36;border-color:#2E3340;color:#E8EAED}
    #dm-input:focus{border-color:var(--accent,#1D4E8F);box-shadow:0 0 0 2px rgba(29,78,143,.15)}
    #dm-send-btn{width:36px;height:36px;border-radius:50%;background:var(--accent,#1D4E8F);
      color:#fff;border:none;cursor:pointer;display:flex;align-items:center;
      justify-content:center;flex-shrink:0}
    #dm-send-btn:hover{opacity:.88}
    .dm-msg{max-width:80%;padding:8px 12px;border-radius:14px;font-size:13px;
      line-height:1.5;word-break:break-word}
    .dm-msg.mine{align-self:flex-end;background:var(--accent,#1D4E8F);color:#fff;
      border-bottom-right-radius:4px}
    .dm-msg.theirs{align-self:flex-start;background:#F0F2F5;color:#050505;
      border-bottom-left-radius:4px}
    [data-theme=dark] .dm-msg.theirs{background:#2E3340;color:#E8EAED}
    .dm-meta{font-size:10px;opacity:.6;margin-top:3px}
    .dm-msg.mine .dm-meta{text-align:right}
    .dm-btn{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;
      border-radius:6px;font-size:11px;font-weight:500;
      background:#DBEAFE;color:#1D4E8F;border:none;cursor:pointer;font-family:inherit}
    .dm-btn:hover{background:var(--accent,#1D4E8F);color:#fff}
    .dm-toast{position:fixed;bottom:460px;right:20px;background:#1C1C1E;color:#fff;
      padding:10px 14px;border-radius:12px;font-size:13px;z-index:10000;
      box-shadow:0 4px 20px rgba(0,0,0,.25);max-width:260px;cursor:pointer;line-height:1.4;
      animation:_fbIn .2s ease}
    @keyframes _fbIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    .dm-toast strong{display:block;font-size:11px;opacity:.8;margin-bottom:2px}
  `;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════════
   UTILS
════════════════════════════════════════════ */
function _dmToast(fromName, text, fromUser) {
  document.querySelector('.dm-toast')?.remove();
  const t = document.createElement('div');
  t.className = 'dm-toast';
  t.innerHTML = '<strong>💬 ' + _esc(fromName) + '</strong>' + _esc(text.slice(0, 55)) + (text.length > 55 ? '…' : '');
  t.onclick = () => { t.remove(); if (fromUser) openDM(fromUser); };
  document.body.appendChild(t);
  setTimeout(() => t?.remove(), 6000);
}

function _setBadge(n) {
  const btn = document.querySelector('.nav-action-btn[aria-label="ข้อความ"]');
  if (!btn) return;
  let b = btn.querySelector('.notif-badge');
  if (!b) { b = document.createElement('span'); b.className = 'notif-badge'; btn.appendChild(b); }
  b.textContent = n > 0 ? String(n) : '';
  b.style.display = n > 0 ? '' : 'none';
}

function _key(email) { return (email || '').replace(/[.@+]/g, '_').toLowerCase(); }
function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _nameColor(n) {
  const c = ['#1D4E8F','#2D6A4F','#7C3AED','#B45309','#B91C1C','#0F766E','#4C1D95','#065F46'];
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % c.length;
  return c[Math.abs(h)];
}
