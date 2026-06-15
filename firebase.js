/* ════════════════════════════════════════════
   ExportSpace — firebase.js v2
   Realtime: Presence + Direct Message + Feed signal
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

let db     = null;
let fbUser = null;
let _presenceRef = null;
let _dmUnsubMsg  = null;
let _dmUnsubTyp  = null;
let _activeDMUser = null;
let _typingTimer  = null;
let _dmBadgeCount = 0;

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function initFirebase(user) {
  if (db) { _setPresence(user); return; }
  try {
    await loadScript(`${FB_SDK}/firebase-app-compat.js`);
    await loadScript(`${FB_SDK}/firebase-database-compat.js`);
    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    db = firebase.database();
    fbUser = { ...user, uid: _emailKey(user.email) };
    _setPresence(fbUser);
    _listenFeedSignal();
    _listenIncomingDM();
    _injectDMStyles();
    _buildDMBox();
    console.log('[Firebase] ✓ connected as', fbUser.email);
  } catch(e) {
    console.warn('[Firebase] init failed:', e.message);
  }
}

/* ════════════════════════════════════════════
   PRESENCE
════════════════════════════════════════════ */
function _setPresence(user) {
  if (!db || !user) return;
  const uid  = _emailKey(user.email);
  const pRef = db.ref('presence/' + uid);
  _presenceRef = pRef;

  db.ref('.info/connected').on('value', snap => {
    if (!snap.val()) return;
    pRef.onDisconnect().remove();
    pRef.set({
      name: user.name, email: user.email,
      dept: user.dept || '', online: true,
      ts: firebase.database.ServerValue.TIMESTAMP,
    });
  });
}

function listenOnlineUsers(callback) {
  if (!db) return () => {};
  const ref = db.ref('presence');
  const fn  = snap => {
    const list = [];
    snap.forEach(c => { const v = c.val(); if (v?.online) list.push(v); });
    callback(list);
  };
  ref.on('value', fn);
  return () => ref.off('value', fn);
}

/* ════════════════════════════════════════════
   FEED SIGNAL
════════════════════════════════════════════ */
function _listenFeedSignal() {
  if (!db) return;
  const since = Date.now();
  db.ref('feed_signal').on('child_added', snap => {
    const sig = snap.val();
    if (!sig || sig.ts < since || sig.author === fbUser?.name) return;
    if (typeof invalidateCache === 'function') invalidateCache('Posts');
    if (typeof loadPosts === 'function') loadPosts();
    _toast('🔔 ' + sig.author + ' โพสต์ใหม่');
  });
}

function signalNewPost(author) {
  if (!db) return;
  db.ref('feed_signal').push({ author, ts: firebase.database.ServerValue.TIMESTAMP });
}

/* ════════════════════════════════════════════
   DIRECT MESSAGE — core
════════════════════════════════════════════ */
function _roomKey(emailA, emailB) {
  const a = _emailKey(emailA), b = _emailKey(emailB);
  return a < b ? a + '__' + b : b + '__' + a;
}

async function sendDM(toUser, text) {
  if (!db || !fbUser || !text.trim()) return false;
  const room = _roomKey(fbUser.email, toUser.email);
  await db.ref('dm/' + room).push({
    from: fbUser.name, fromEmail: fbUser.email,
    to: toUser.name,   toEmail:   toUser.email,
    text: text.trim(),
    ts:   firebase.database.ServerValue.TIMESTAMP,
    read: false,
  });
  return true;
}

function _listenDM(toUser, callback) {
  if (!db || !fbUser) return () => {};
  const room = _roomKey(fbUser.email, toUser.email);
  const ref  = db.ref('dm/' + room).orderByChild('ts').limitToLast(60);
  const fn   = snap => {
    const msgs = [];
    snap.forEach(c => msgs.push({ id: c.key, ...c.val() }));
    callback(msgs);
  };
  ref.on('value', fn);
  return () => ref.off('value', fn);
}

function _listenTyping(toUser, callback) {
  if (!db || !fbUser) return () => {};
  const room = _roomKey(fbUser.email, toUser.email);
  const ref  = db.ref('typing/' + room);
  const fn   = snap => {
    const typers = [];
    snap.forEach(c => { if (c.key !== fbUser.uid && c.val()) typers.push(c.val()); });
    callback(typers);
  };
  ref.on('value', fn);
  return () => ref.off('value', fn);
}

function _setTyping(isTyping) {
  if (!db || !fbUser || !_activeDMUser) return;
  const room = _roomKey(fbUser.email, _activeDMUser.email);
  db.ref('typing/' + room + '/' + fbUser.uid).set(isTyping ? fbUser.name : null);
}

function _markRead(toUser) {
  if (!db || !fbUser) return;
  const room = _roomKey(fbUser.email, toUser.email);
  db.ref('dm/' + room).once('value', snap => {
    const updates = {};
    snap.forEach(c => {
      if (c.val()?.fromEmail !== fbUser.email && !c.val()?.read) updates[c.key + '/read'] = true;
    });
    if (Object.keys(updates).length) db.ref('dm/' + room).update(updates);
  });
}

function _listenIncomingDM() {
  if (!db || !fbUser) return;
  const myKey = _emailKey(fbUser.email);
  const since = Date.now();
  db.ref('dm').on('child_added', roomSnap => {
    if (!roomSnap.key.includes(myKey)) return;
    roomSnap.ref.orderByChild('ts').limitToLast(1).on('child_added', msgSnap => {
      const msg = msgSnap.val();
      if (!msg || msg.ts < since || msg.fromEmail === fbUser.email) return;
      if (!msg.read) {
        _showDMToast(msg.from, msg.text, { name: msg.from, email: msg.fromEmail });
        _dmBadgeCount++;
        _updateMsgBadge(_dmBadgeCount);
      }
    });
  });
}

/* ════════════════════════════════════════════
   DM UI BOX
════════════════════════════════════════════ */
function openDM(toUserOrJson) {
  // รองรับทั้ง object และ JSON string จาก onclick attribute
  let toUser = toUserOrJson;
  if (typeof toUser === 'string') {
    try { toUser = JSON.parse(toUser); } catch(e) { return; }
  }
  if (!toUser?.email) return;

  // ถ้าเปิดห้องเดิมอยู่ → ปิดก่อน
  if (_dmUnsubMsg) { _dmUnsubMsg(); _dmUnsubMsg = null; }
  if (_dmUnsubTyp) { _dmUnsubTyp(); _dmUnsubTyp = null; }
  if (_activeDMUser) _setTyping(false);

  _activeDMUser = toUser;
  _markRead(toUser);

  const box = document.getElementById('dm-box');
  if (!box) { _buildDMBox(); }

  document.getElementById('dm-box').style.display    = 'flex';
  document.getElementById('dm-title').textContent    = '💬 ' + toUser.name;
  document.getElementById('dm-messages').innerHTML   =
    '<div style="text-align:center;padding:20px;font-size:13px;color:#94A3B8">กำลังโหลด…</div>';
  document.getElementById('dm-typing-bar').textContent = '';

  // reset unread badge สำหรับคนนี้
  _dmBadgeCount = Math.max(0, _dmBadgeCount - 1);
  _updateMsgBadge(_dmBadgeCount);

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
  _setTyping(false);
  _activeDMUser = null;
  const box = document.getElementById('dm-box');
  if (box) box.style.display = 'none';
}

async function submitDM() {
  const input = document.getElementById('dm-input');
  const text  = (input?.value || '').trim();
  if (!text || !_activeDMUser || !fbUser) return;
  input.value = '';
  _setTyping(false);

  // แสดงข้อความตัวเองทันที (optimistic)
  _appendMsg({ from: fbUser.name, fromEmail: fbUser.email, text, ts: Date.now(), read: false });

  await sendDM(_activeDMUser, text);
}

function _appendMsg(m) {
  const el = document.getElementById('dm-messages');
  if (!el) return;
  // ลบ placeholder ถ้ามี
  const placeholder = el.querySelector('[data-placeholder]');
  if (placeholder) placeholder.remove();

  const mine  = m.fromEmail === fbUser?.email;
  const time  = new Date(m.ts || Date.now()).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
  const div   = document.createElement('div');
  div.className = 'dm-msg ' + (mine ? 'mine' : 'theirs');
  div.innerHTML = _esc(m.text) + '<div class="dm-meta">' + time + (mine && m.read ? ' · อ่านแล้ว' : '') + '</div>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function _renderMsgs(msgs) {
  const el = document.getElementById('dm-messages');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<div data-placeholder style="text-align:center;padding:24px;font-size:13px;color:#94A3B8">เริ่มการสนทนา — พิมพ์ข้อความด้านล่าง</div>';
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

function _onDMKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDM(); }
  else {
    _setTyping(true);
    clearTimeout(_typingTimer);
    _typingTimer = setTimeout(() => _setTyping(false), 2500);
  }
}

function _buildDMBox() {
  if (document.getElementById('dm-box')) return;
  const box = document.createElement('div');
  box.id = 'dm-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Direct Message');
  box.style.display = 'none';
  box.innerHTML =
    '<div id="dm-header">'
    +  '<span id="dm-title"></span>'
    +  '<button id="dm-close" onclick="closeDM()" aria-label="ปิด">✕</button>'
    + '</div>'
    + '<div id="dm-messages" role="log" aria-live="polite"></div>'
    + '<div id="dm-typing-bar"></div>'
    + '<div id="dm-input-row">'
    +   '<input id="dm-input" type="text" placeholder="พิมพ์ข้อความ… (Enter ส่ง)" maxlength="500" aria-label="ข้อความ">'
    +   '<button id="dm-send" aria-label="ส่ง"><i class="ti ti-send" aria-hidden="true"></i></button>'
    + '</div>';
  document.body.appendChild(box);

  document.getElementById('dm-input').addEventListener('keydown', _onDMKeydown);
  document.getElementById('dm-send').addEventListener('click', submitDM);
}

function _injectDMStyles() {
  if (document.getElementById('dm-css')) return;
  const s = document.createElement('style');
  s.id = 'dm-css';
  s.textContent = [
    '#dm-box{position:fixed;bottom:20px;right:20px;width:320px;height:420px;',
    'background:#fff;border:1px solid #E4E6EB;border-radius:16px;',
    'box-shadow:0 8px 32px rgba(0,0,0,.18);display:flex;flex-direction:column;z-index:9999;overflow:hidden}',
    '[data-theme=dark] #dm-box{background:#1C2029;border-color:#2E3340}',
    '#dm-header{display:flex;align-items:center;justify-content:space-between;',
    'padding:12px 14px;background:#1D4E8F;border-radius:16px 16px 0 0;flex-shrink:0}',
    '[data-accent=green] #dm-header{background:#2D6A4F}',
    '[data-accent=purple] #dm-header{background:#7C3AED}',
    '[data-accent=amber] #dm-header{background:#B45309}',
    '[data-accent=red] #dm-header{background:#B91C1C}',
    '[data-accent=teal] #dm-header{background:#0F766E}',
    '#dm-title{font-size:14px;font-weight:600;color:#fff}',
    '#dm-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;',
    'padding:2px 8px;border-radius:6px;line-height:1;opacity:.85}',
    '#dm-close:hover{opacity:1;background:rgba(255,255,255,.2)}',
    '#dm-messages{flex:1;overflow-y:auto;padding:10px 12px;',
    'display:flex;flex-direction:column;gap:6px;scrollbar-width:thin}',
    '#dm-typing-bar{font-size:11px;color:#94A3B8;padding:0 14px 3px;min-height:18px;flex-shrink:0}',
    '#dm-input-row{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #E4E6EB;flex-shrink:0}',
    '[data-theme=dark] #dm-input-row{border-color:#2E3340}',
    '#dm-input{flex:1;padding:8px 12px;border:1px solid #E4E6EB;border-radius:20px;',
    'font-size:13px;background:#F0F2F5;color:#050505;outline:none;font-family:inherit}',
    '[data-theme=dark] #dm-input{background:#252A36;border-color:#2E3340;color:#E8EAED}',
    '#dm-input:focus{border-color:#1D4E8F;box-shadow:0 0 0 2px rgba(29,78,143,.15)}',
    '#dm-send{width:36px;height:36px;border-radius:50%;background:#1D4E8F;',
    'color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}',
    '#dm-send:hover{opacity:.88}',
    '.dm-msg{max-width:80%;padding:8px 12px;border-radius:14px;font-size:13px;line-height:1.5;word-break:break-word}',
    '.dm-msg.mine{align-self:flex-end;background:#1D4E8F;color:#fff;border-bottom-right-radius:4px}',
    '.dm-msg.theirs{align-self:flex-start;background:#F0F2F5;color:#050505;border-bottom-left-radius:4px}',
    '[data-theme=dark] .dm-msg.theirs{background:#2E3340;color:#E8EAED}',
    '.dm-meta{font-size:10px;margin-top:3px;opacity:.65}',
    '.dm-msg.mine .dm-meta{text-align:right}',
    '.dm-btn{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;',
    'border-radius:6px;font-size:11px;background:#DBEAFE;color:#1D4E8F;border:none;cursor:pointer;font-family:inherit;white-space:nowrap}',
    '.dm-btn:hover{background:#1D4E8F;color:#fff}',
    '.dm-toast{position:fixed;bottom:460px;right:20px;background:#1C1C1E;color:#fff;',
    'padding:10px 14px;border-radius:12px;font-size:13px;z-index:10000;',
    'box-shadow:0 4px 20px rgba(0,0,0,.25);max-width:260px;cursor:pointer;line-height:1.4;',
    'animation:_dmSlide .25s ease}',
    '@keyframes _dmSlide{from{transform:translateY(8px);opacity:0}to{opacity:1;transform:none}}',
    '.dm-toast strong{display:block;margin-bottom:2px;font-size:12px}',
    '.ol-dot-live{width:8px;height:8px;border-radius:50%;background:#22C55E;',
    'display:inline-block;margin-right:4px;animation:_pulse 2s infinite}',
    '@keyframes _pulse{0%,100%{opacity:1}50%{opacity:.35}}',
  ].join('');
  document.head.appendChild(s);
}

/* ════════════════════════════════════════════
   ONLINE USER LIST — render พร้อมปุ่ม DM
════════════════════════════════════════════ */
function startRealtimeOnlineUsers() {
  return listenOnlineUsers(users => {
    const list  = document.getElementById('online-list');
    const count = document.getElementById('online-count');
    if (!list) return;
    if (count) count.textContent = users.length;
    if (!users.length) {
      list.innerHTML = '<li style="font-size:13px;color:var(--text-tertiary,#94A3B8);padding:8px 16px">ยังไม่มีใครออนไลน์</li>';
      return;
    }
    list.innerHTML = users.map(u => {
      const ini    = (u.name||'?').trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
      const col    = _nameColor(u.name||'');
      const isMe   = u.email === fbUser?.email;
      const dmAttr = JSON.stringify({ name: u.name, email: u.email }).replace(/"/g, '&quot;');
      return '<li class="online-item">'
        + '<div class="ol-wrap">'
        +   '<div class="avatar sm" style="background:' + col + '">' + _esc(ini) + '</div>'
        +   '<span class="ol-dot" style="background:#22C55E"></span>'
        + '</div>'
        + '<div class="ol-info">'
        +   '<div class="ol-name">' + _esc(u.name||u.email) + (isMe ? ' (คุณ)' : '') + '</div>'
        +   '<div class="ol-status" style="display:flex;align-items:center;gap:6px">'
        +     '<span class="ol-dot-live"></span>ออนไลน์'
        +     (!isMe ? ' <button class="dm-btn" onclick="openDM(\'' + dmAttr.replace(/'/g, "\\'") + '\')">'
        +       + '<i class="ti ti-message" aria-hidden="true"></i> DM</button>' : '')
        +   '</div>'
        + '</div>'
        + '</li>';
    }).join('');
  });
}

/* ════════════════════════════════════════════
   TOAST / BADGE / UTILS
════════════════════════════════════════════ */
function _showDMToast(fromName, text, fromUser) {
  const prev = document.querySelector('.dm-toast');
  if (prev) prev.remove();
  const t = document.createElement('div');
  t.className = 'dm-toast';
  t.innerHTML = '<strong>💬 ' + _esc(fromName) + '</strong>' + _esc(text.slice(0,60)) + (text.length>60?'…':'');
  t.onclick   = () => { t.remove(); if(fromUser) openDM(fromUser); };
  document.body.appendChild(t);
  setTimeout(() => t?.remove(), 6000);
}

function _toast(msg) {
  if (typeof showToast === 'function') showToast(msg);
}

function _updateMsgBadge(n) {
  const btn = document.querySelector('.nav-action-btn[aria-label="ข้อความ"]');
  if (!btn) return;
  let b = btn.querySelector('.notif-badge');
  if (!b) { b = document.createElement('span'); b.className = 'notif-badge'; btn.appendChild(b); }
  b.textContent    = n > 0 ? n : '';
  b.style.display  = n > 0 ? '' : 'none';
}

function _emailKey(email) { return (email||'').replace(/[.@+]/g,'_').toLowerCase(); }

function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _nameColor(n) {
  const c=['#1D4E8F','#2D6A4F','#7C3AED','#B45309','#B91C1C','#0F766E','#4C1D95','#065F46'];
  let h=0; for(const ch of n) h=(h*31+ch.charCodeAt(0))%c.length;
  return c[Math.abs(h)];
}
