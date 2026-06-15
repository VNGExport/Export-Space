/* ════════════════════════════════════════════
   ExportSpace — firebase.js
   Realtime: Online Presence + Direct Message + Feed listener
   Firebase Realtime Database (Spark — free)
   ════════════════════════════════════════════ */

/* ── โหลด Firebase SDK จาก CDN (compat version — ใช้ใน HTML ธรรมดาได้) ── */
const FB_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

/* ── Firebase config ── */
const FB_CONFIG = {
  apiKey:            "AIzaSyBxOFMM4dC_50jWoG6JHnpfmD2I0AWu3fc",
  authDomain:        "exportspace-c8777.firebaseapp.com",
  databaseURL:       "https://exportspace-c8777-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "exportspace-c8777",
  storageBucket:     "exportspace-c8777.firebasestorage.app",
  messagingSenderId: "420770714233",
  appId:             "1:420770714233:web:490daa0db34323382cbaa8",
};

/* ── References ── */
let db      = null;   // Firebase Database instance
let fbUser  = null;   // { email, name, uid (= email safe key) }
let dmUnsubscribers = {}; // cleanup listeners

/* ═══ INIT ═══ */
async function initFirebase(user) {
  if (db) { setPresence(user); return; }
  try {
    await loadScript(`${FB_SDK}/firebase-app-compat.js`);
    await loadScript(`${FB_SDK}/firebase-database-compat.js`);

    if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
    db     = firebase.database();
    fbUser = { ...user, uid: emailToKey(user.email) };

    setPresence(fbUser);
    listenFeedRealtime();
    listenIncomingDM();
    console.log('[Firebase] connected ✓');
  } catch(e) {
    console.warn('[Firebase] init failed:', e.message);
  }
}

/* ═══════════════════════════════════════════
   PRESENCE — ใครออนไลน์บ้าง (realtime)
═══════════════════════════════════════════ */
function setPresence(user) {
  if (!db || !user) return;
  const uid     = emailToKey(user.email);
  const presRef = db.ref(`presence/${uid}`);
  const connRef = db.ref('.info/connected');

  connRef.on('value', snap => {
    if (!snap.val()) return;
    // เมื่อ disconnect → ลบ presence อัตโนมัติ
    presRef.onDisconnect().remove();
    presRef.set({
      name:     user.name,
      email:    user.email,
      dept:     user.dept || '',
      online:   true,
      last_seen: firebase.database.ServerValue.TIMESTAMP,
    });
  });
}

function listenOnlineUsers(callback) {
  if (!db) return () => {};
  const ref = db.ref('presence');
  const handler = snap => {
    const users = [];
    snap.forEach(child => {
      const u = child.val();
      if (u && u.online) users.push(u);
    });
    callback(users);
  };
  ref.on('value', handler);
  return () => ref.off('value', handler); // unsubscribe
}

/* ═══════════════════════════════════════════
   FEED — โพสต์ใหม่ขึ้น feed ทันที (realtime)
═══════════════════════════════════════════ */
function listenFeedRealtime() {
  if (!db) return;
  // ฟัง child_added เฉพาะหลัง session เริ่ม
  const since = Date.now();
  db.ref('feed_signal').on('child_added', snap => {
    const sig = snap.val();
    if (!sig || sig.ts < since) return;
    if (sig.author === fbUser?.name) return; // ไม่แจ้งตัวเอง

    // invalidate cache แล้วโหลด posts ใหม่
    if (typeof invalidateCache === 'function') invalidateCache('Posts');
    if (typeof loadPosts      === 'function') loadPosts();

    showFeedToast(`${sig.author} โพสต์ใหม่`);
  });
}

/* เรียกหลังโพสต์สำเร็จ — ส่ง signal ให้คนอื่น */
function signalNewPost(author) {
  if (!db) return;
  db.ref('feed_signal').push({ author, ts: firebase.database.ServerValue.TIMESTAMP });
}

/* ═══════════════════════════════════════════
   DIRECT MESSAGE
═══════════════════════════════════════════ */
/* สร้าง room key จาก 2 email เรียงตามตัวอักษร → consistent key */
function dmRoomKey(emailA, emailB) {
  const a = emailToKey(emailA), b = emailToKey(emailB);
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

/* ส่งข้อความ */
async function sendDM(toUser, text) {
  if (!db || !fbUser || !text.trim()) return false;
  const room = dmRoomKey(fbUser.email, toUser.email);
  await db.ref(`dm/${room}`).push({
    from:      fbUser.name,
    fromEmail: fbUser.email,
    to:        toUser.name,
    toEmail:   toUser.email,
    text:      text.trim(),
    ts:        firebase.database.ServerValue.TIMESTAMP,
    read:      false,
  });
  return true;
}

/* ฟัง DM ในห้องนี้ */
function listenDM(toUser, callback) {
  if (!db || !fbUser) return () => {};
  const room    = dmRoomKey(fbUser.email, toUser.email);
  const ref     = db.ref(`dm/${room}`).orderByChild('ts').limitToLast(50);
  const handler = snap => {
    const msgs = [];
    snap.forEach(c => msgs.push({ id: c.key, ...c.val() }));
    callback(msgs);
  };
  ref.on('value', handler);
  dmUnsubscribers[room] = () => ref.off('value', handler);
  return dmUnsubscribers[room];
}

/* ฟัง DM ขาเข้าทุกห้อง */
function listenIncomingDM() {
  if (!db || !fbUser) return;
  const myKey = emailToKey(fbUser.email);

  db.ref('dm').on('child_added', roomSnap => {
    const roomKey = roomSnap.key;
    if (!roomKey.includes(myKey)) return; // ไม่ใช่ห้องของเรา

    roomSnap.ref.orderByChild('ts').limitToLast(1).on('child_added', msgSnap => {
      const msg = msgSnap.val();
      if (!msg || msg.fromEmail === fbUser.email) return;
      if (!msg.read) {
        showDMToast(msg.from, msg.text);
        updateDMBadge(msg.from, msg.fromEmail);
      }
    });
  });
}

/* Mark messages as read */
function markDMRead(toUser) {
  if (!db || !fbUser) return;
  const room = dmRoomKey(fbUser.email, toUser.email);
  db.ref(`dm/${room}`).once('value', snap => {
    const updates = {};
    snap.forEach(c => {
      if (c.val().fromEmail !== fbUser.email && !c.val().read) {
        updates[`${c.key}/read`] = true;
      }
    });
    if (Object.keys(updates).length) db.ref(`dm/${room}`).update(updates);
  });
}

/* ── Typing indicator ── */
function setTyping(toUser, isTyping) {
  if (!db || !fbUser) return;
  const room = dmRoomKey(fbUser.email, toUser.email);
  db.ref(`typing/${room}/${fbUser.uid}`).set(isTyping ? fbUser.name : null);
}

function listenTyping(toUser, callback) {
  if (!db || !fbUser) return () => {};
  const room = dmRoomKey(fbUser.email, toUser.email);
  const ref  = db.ref(`typing/${room}`);
  const handler = snap => {
    const typers = [];
    snap.forEach(c => { if (c.key !== fbUser.uid && c.val()) typers.push(c.val()); });
    callback(typers);
  };
  ref.on('value', handler);
  return () => ref.off('value', handler);
}

/* ═══════════════════════════════════════════
   DM UI — กล่อง Chat
═══════════════════════════════════════════ */
let activeDMUser   = null;
let dmUnsubMessage = null;
let dmUnsubTyping  = null;

function openDM(toUser) {
  closeDM();
  activeDMUser = toUser;
  markDMRead(toUser);

  const box = document.getElementById('dm-box');
  if (!box) { createDMBox(); }
  const b = document.getElementById('dm-box');
  b.style.display = 'flex';
  document.getElementById('dm-title').textContent = `💬 ${toUser.name}`;
  document.getElementById('dm-messages').innerHTML =
    '<div style="text-align:center;padding:20px;font-size:13px;color:var(--text-tertiary)">กำลังโหลด…</div>';

  dmUnsubMessage = listenDM(toUser, msgs => renderDMMessages(msgs, toUser));
  dmUnsubTyping  = listenTyping(toUser, typers => {
    const el = document.getElementById('dm-typing');
    if (el) el.textContent = typers.length ? `${typers.join(', ')} กำลังพิมพ์…` : '';
  });
}

function closeDM() {
  if (dmUnsubMessage) { dmUnsubMessage(); dmUnsubMessage = null; }
  if (dmUnsubTyping)  { dmUnsubTyping();  dmUnsubTyping  = null; }
  if (activeDMUser) { setTyping(activeDMUser, false); activeDMUser = null; }
  const b = document.getElementById('dm-box');
  if (b) b.style.display = 'none';
}

function createDMBox() {
  const box = document.createElement('div');
  box.id = 'dm-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Direct Message');
  box.innerHTML = `
    <div id="dm-header">
      <span id="dm-title" style="font-size:14px;font-weight:600"></span>
      <button id="dm-close" aria-label="ปิด" onclick="closeDM()">✕</button>
    </div>
    <div id="dm-messages" role="log" aria-live="polite"></div>
    <div id="dm-typing" style="font-size:11px;color:var(--text-tertiary);padding:0 12px 2px;min-height:16px"></div>
    <div id="dm-input-row">
      <input id="dm-input" type="text" placeholder="พิมพ์ข้อความ…" aria-label="ข้อความ"
        maxlength="500"
        oninput="handleDMTyping()"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitDM();}">
      <button id="dm-send" onclick="submitDM()" aria-label="ส่ง">
        <i class="ti ti-send" aria-hidden="true"></i>
      </button>
    </div>`;
  document.body.appendChild(box);

  /* inject DM styles */
  if (!document.getElementById('dm-styles')) {
    const st = document.createElement('style');
    st.id = 'dm-styles';
    st.textContent = `
      #dm-box{position:fixed;bottom:20px;right:20px;width:320px;height:420px;
        background:var(--bg-surface,#fff);border:1px solid var(--border,#E4E6EB);
        border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.14);
        display:flex;flex-direction:column;z-index:500;overflow:hidden}
      #dm-header{display:flex;align-items:center;justify-content:space-between;
        padding:12px 14px;border-bottom:1px solid var(--border,#E4E6EB);
        background:var(--accent,#1D4E8F);color:#fff;border-radius:16px 16px 0 0}
      #dm-header #dm-title{color:#fff}
      #dm-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;
        padding:2px 6px;border-radius:6px;line-height:1}
      #dm-close:hover{background:rgba(255,255,255,.2)}
      #dm-messages{flex:1;overflow-y:auto;padding:10px 12px;
        display:flex;flex-direction:column;gap:8px;scrollbar-width:thin}
      .dm-msg{max-width:78%;padding:8px 12px;border-radius:14px;
        font-size:13px;line-height:1.5;word-break:break-word}
      .dm-msg.mine{align-self:flex-end;background:var(--accent,#1D4E8F);color:#fff;
        border-bottom-right-radius:4px}
      .dm-msg.theirs{align-self:flex-start;background:var(--bg-hover,#F2F2F2);
        color:var(--text-primary,#050505);border-bottom-left-radius:4px}
      .dm-msg .dm-meta{font-size:10px;opacity:.65;margin-top:3px}
      .dm-msg.mine .dm-meta{text-align:right}
      #dm-input-row{display:flex;gap:6px;padding:8px 10px;
        border-top:1px solid var(--border,#E4E6EB)}
      #dm-input{flex:1;padding:8px 12px;border:1px solid var(--border,#E4E6EB);
        border-radius:20px;font-size:13px;background:var(--bg-subtle,#F0F2F5);
        color:var(--text-primary,#050505);outline:none;font-family:inherit}
      #dm-input:focus{border-color:var(--accent,#1D4E8F)}
      #dm-send{width:36px;height:36px;border-radius:50%;background:var(--accent,#1D4E8F);
        color:#fff;border:none;cursor:pointer;display:flex;align-items:center;
        justify-content:center;font-size:16px;flex-shrink:0}
      #dm-send:hover{opacity:.9}
      .dm-toast{position:fixed;bottom:450px;right:20px;background:#1C1C1E;color:#fff;
        padding:10px 14px;border-radius:12px;font-size:13px;z-index:600;
        animation:slideUp .3s ease;max-width:240px;cursor:pointer;line-height:1.4}
      .dm-toast strong{display:block;margin-bottom:2px}
      @keyframes slideUp{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}
      .online-dot-live{width:8px;height:8px;border-radius:50%;background:#22C55E;
        display:inline-block;margin-right:5px;animation:pulse2 2s infinite}
      @keyframes pulse2{0%,100%{opacity:1}50%{opacity:.4}}
      .dm-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
        border-radius:6px;font-size:11px;background:var(--accent-light,#DBEAFE);
        color:var(--accent,#1D4E8F);border:none;cursor:pointer;font-family:inherit}
      .dm-btn:hover{background:var(--accent,#1D4E8F);color:#fff}
    `;
    document.head.appendChild(st);
  }
}

function renderDMMessages(msgs, toUser) {
  const el = document.getElementById('dm-messages');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = `<div style="text-align:center;padding:24px;font-size:13px;
      color:var(--text-tertiary)">เริ่มการสนทนากับ ${toUser.name}</div>`;
    return;
  }
  el.innerHTML = msgs.map(m => {
    const mine   = m.fromEmail === fbUser?.email;
    const time   = m.ts ? new Date(m.ts).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' }) : '';
    const read   = mine && m.read ? ' · อ่านแล้ว' : '';
    return `<div class="dm-msg ${mine ? 'mine' : 'theirs'}">
      ${escFB(m.text)}
      <div class="dm-meta">${time}${read}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function submitDM() {
  const input = document.getElementById('dm-input');
  const text  = input?.value?.trim();
  if (!text || !activeDMUser) return;
  input.value = '';
  setTyping(activeDMUser, false);
  await sendDM(activeDMUser, text);
}

let typingTimer;
function handleDMTyping() {
  if (!activeDMUser) return;
  setTyping(activeDMUser, true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => setTyping(activeDMUser, false), 2500);
}

/* ═══════════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════════ */
let dmBadges = {}; // { email: count }

function showDMToast(fromName, text) {
  const prev = document.querySelector('.dm-toast');
  if (prev) prev.remove();
  const t = document.createElement('div');
  t.className = 'dm-toast';
  t.innerHTML = `<strong>💬 ${escFB(fromName)}</strong>${escFB(text.slice(0,60))}${text.length>60?'…':''}`;
  t.onclick   = () => { t.remove(); };
  document.body.appendChild(t);
  setTimeout(() => t?.remove(), 5000);
}

function showFeedToast(msg) {
  if (typeof showToast === 'function') showToast('🔔 ' + msg);
}

function updateDMBadge(fromName, fromEmail) {
  dmBadges[fromEmail] = (dmBadges[fromEmail] || 0) + 1;
  const msgBtn = document.querySelector('#topnav .nav-action-btn[aria-label="ข้อความ"]');
  if (msgBtn) {
    let badge = msgBtn.querySelector('.notif-badge');
    if (!badge) { badge = document.createElement('span'); badge.className = 'notif-badge'; msgBtn.appendChild(badge); }
    const total = Object.values(dmBadges).reduce((a,b)=>a+b,0);
    badge.textContent = total;
    badge.style.display = total ? '' : 'none';
  }
}

/* ═══════════════════════════════════════════
   ONLINE USERS PANEL (ใช้แทน render เดิม)
═══════════════════════════════════════════ */
function startRealtimeOnlineUsers() {
  return listenOnlineUsers(users => {
    const list  = document.getElementById('online-list');
    const count = document.getElementById('online-count');
    if (!list) return;
    if (count) count.textContent = users.length;
    if (!users.length) {
      list.innerHTML = '<li style="font-size:13px;color:var(--text-tertiary);padding:8px 16px">ยังไม่มีใครออนไลน์</li>';
      return;
    }
    list.innerHTML = users.map(u => {
      const ini = (u.name||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const col = nameColorFB(u.name||'');
      return `<li class="online-item">
        <div class="ol-wrap">
          <div class="avatar sm" style="background:${col}">${escFB(ini)}</div>
          <span class="ol-dot" style="background:#22C55E"></span>
        </div>
        <div class="ol-info">
          <div class="ol-name">${escFB(u.name||u.email)}</div>
          <div class="ol-status">
            <span class="online-dot-live"></span>ออนไลน์
            ${u.email !== fbUser?.email
              ? `<button class="dm-btn" onclick="openDM(${JSON.stringify({name:u.name,email:u.email}).replace(/"/g,'&quot;')})">
                  <i class="ti ti-message" aria-hidden="true"></i> ส่ง DM
                </button>` : '(คุณ)'}
          </div>
        </div>
      </li>`;
    }).join('');
  });
}

/* ═══════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════ */
function emailToKey(email) {
  return (email||'').replace(/[.@]/g, '_').toLowerCase();
}

function escFB(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function nameColorFB(name) {
  const c=['#1D4E8F','#2D6A4F','#7C3AED','#B45309','#B91C1C','#0F766E','#4C1D95','#065F46'];
  let h=0; for(const ch of name) h=(h*31+ch.charCodeAt(0))%c.length;
  return c[Math.abs(h)];
}
