/* Uganda Smart Learning app file - build 2026-11-13.1. To update the app, replace this ONE file (and usl.css if it changed). */
globalThis.USL_BUILD = '2026-11-13.1';
if (typeof window !== 'undefined') {
/* Shows a clear message instead of a page stuck on "Loading…". */
(function () {
  function show(detail) {
    var m = document.getElementById('main'); if (!m || !/^\s*Loading/.test(m.textContent || '')) return;
    m.innerHTML = '<div style="max-width:560px;margin:40px auto;font:16px/1.5 system-ui,sans-serif;color:#0b1f4d"><h2>The page could not start</h2><p>Please reload. If it keeps happening, try Chrome, Edge or Safari (not a private window), and check your internet connection.</p>' + (detail ? '<p style="color:#667;font-size:.85rem">Details: ' + String(detail).replace(/[<>&]/g, '') + '</p>' : '') + '</div>';
  }
  window.addEventListener('error', function (e) { setTimeout(function () { show(e.message); }, 300); });
  window.addEventListener('unhandledrejection', function (e) { setTimeout(function () { show(e.reason && e.reason.message || e.reason); }, 300); });
  setTimeout(function () { show(typeof window.USL === 'undefined' ? 'The script files did not load.' : ''); }, 4000);
})();

}
/* Uganda Smart Learning — shared engine.
   The SAME file runs in two places:
   - on the server (api/rpc.js loads it with root.USL_SERVER = true): the only authority for accounts, one-time
     codes, sessions, the device lock, subscriptions, payments, content, review and WhatsApp notices;
   - in the browser: a read-only replica of what the signed-in user is allowed to see. Every change goes to
     the server first (see REMOTE below); the browser never decides who has paid. */
(function (root) {
  'use strict';
  const KEY = 'usl_db_v1', TOK = 'usl_token', DEV = 'usl_device', PASS = 'usl_pass', DAY = 864e5;
  const SERVER = !!root.USL_SERVER, DEV_EMAIL = String(root.USL_DEV_EMAIL || 'tradertwech@gmail.com').trim().toLowerCase(), HOOKS = () => root.USL_HOOKS || {};
  /* Storage that never throws: some browsers/previews block localStorage. Fall back to memory (works for this page only). */
  const LS = (function () {
    try { const t = '__usl_t'; root.localStorage.setItem(t, '1'); root.localStorage.removeItem(t); return root.localStorage; } catch (e) { /* blocked */ }
    const m = {}; root.USL_STORAGE_BLOCKED = true;
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
  })();
  const isBrowser = typeof document !== 'undefined';
  const DEFAULT_CFG = { price: 20000, currency: 'UGX', days: 30, trialMinutes: 15, aiDailyLimit: 30, aiCostPerCall: 30, payNumber: '0773014995', whatsappNumber: '0773014995', whatsappNotify: true };
  const CLASS_COLORS = { S1: '#dc2626', S2: '#15803d', S3: '#c2410c', S4: '#7c3aed', S5: '#0e7490', S6: '#be185d' };
  const CATEGORIES = ['Official UNEB past paper', 'NCDC sample assessment', 'School mock', 'Teacher-created assessment', 'Licensed publisher material', 'AI-generated practice'];
  const PERMS = ['Own content (author holds the rights)', 'Licensed / written permission held', 'Authorised by UNEB / NCDC', 'Permission pending'];
  const ROLE_PERMS = { admin: ['*'], reviewer: ['review', 'submit', 'moderate'], teacher: ['submit', 'moderate', 'teach'], contributor: ['submit', 'moderate'], student: [] };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now();
  const clone = o => JSON.parse(JSON.stringify(o));
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const rnd = n => { const a = new Uint8Array(n); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.floor(Math.random() * 256)); return hex(a); };
  const uid = p => p + '_' + rnd(5);
  const err = m => ({ ok: false, error: m });
  const okr = (o) => Object.assign({ ok: true }, o || {});
  const fmtUGX = n => 'UGX ' + Number(n).toLocaleString('en-US');
  const fmtDate = t => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtMs = ms => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000), d = Math.floor(s / 86400); if (d >= 1) return d + 'd ' + Math.floor((s % 86400) / 3600) + 'h'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---------- crypto ---------- */
  async function hash(pw, salt) {
    try {
      if (root.crypto && root.crypto.subtle) {
        const k = await root.crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
        const b = await root.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, k, 256);
        return 'p1:' + hex(b);
      }
    } catch (e) { /* fall through */ }
    let h = 5381; const s = salt + pw; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'w0:' + (h >>> 0).toString(16); // weak fallback for insecure contexts; production uses Argon2/bcrypt server-side
  }
  async function sha(s) {
    if (root.crypto && root.crypto.subtle) return hex(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'w0:' + (h >>> 0).toString(16);
  }

  /* ---------- storage ---------- */
  let db = null;
  const load = () => { try { db = JSON.parse(LS.getItem(KEY)); } catch (e) { db = null; } if (db) { db.cfg = Object.assign({}, DEFAULT_CFG, db.cfg); db.outbox = db.outbox || []; db.messages = db.messages || []; db.mutes = db.mutes || {}; (db.classes || []).forEach(c => { if (!c.color) c.color = CLASS_COLORS[c.id] || '#2563eb'; }); } return db; };
  const save = () => LS.setItem(KEY, JSON.stringify(db));
  const audit = (action, userId, detail) => { db.audit.unshift({ id: uid('a'), at: now(), action, userId: userId || null, detail: detail || '' }); if (db.audit.length > 500) db.audit.length = 500; };
  /* WhatsApp: a browser cannot send WhatsApp messages by itself. The server queues each message here;
     in production a backend job sends it through the WhatsApp Business Cloud API (or a provider such as Twilio).
     In this prototype the Admin → Outbox tab shows the queue with a one-tap "Send on WhatsApp" button. */
  function queueWhatsApp(kind, text, paymentId) {
    if (!db.cfg.whatsappNotify) return; const to = normContact(db.cfg.whatsappNumber); if (!to || to.includes('@')) return;
    db.outbox.unshift({ id: uid('wa'), channel: 'whatsapp', to, kind, text, paymentId: paymentId || null, at: now(), status: 'queued' });
    if (db.outbox.length > 300) db.outbox.length = 300;
  }
  function payMessage(p, kind) {
    const u = db.users.find(x => x.id === p.userId) || {}, c = (db.classes.find(x => x.id === u.classId) || {}).id || '—', s = db.subs.find(x => x.paymentId === p.id);
    if (kind === 'reversed') return '⚠️ Payment reversed\nStudent: ' + u.name + ' (' + c + ')\nAmount: ' + fmtUGX(p.amount) + '\nRef: ' + p.ref + '\nAccess for this payment was removed.';
    return '✅ New subscription\nStudent: ' + u.name + ' (' + c + ')\nContact: ' + u.contact + '\nAmount: ' + fmtUGX(p.amount) + ' via ' + p.provider + '\nRef: ' + p.ref + (p.txId ? '\nProvider tx: ' + p.txId : '') + '\nActive until: ' + (s ? new Date(s.expires).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  }
  const notify = (userId, msg) => db.notifications.unshift({ id: uid('n'), userId, msg, at: now(), read: false });

  /* A fresh database holds the catalogue and sample lessons only. There are NO built-in accounts: the developer
     creates the administrator account by registering with the developer email and confirming the code sent to it. */
  async function seed() {
    const D = root.USL_DATA;
    const papers = clone(D.papers).filter(p => p.status !== 'pending').map(p => { p.createdAt = now(); p.level = (D.classes.find(c => c.id === p.cls) || {}).level || ''; p.submittedBy = 'system'; return p; });
    const lessons = clone(D.lessons).map(l => { l.submittedBy = 'system'; return l; });
    const syllabus = [];
    D.subjects.forEach(s => s.classes.forEach(c => syllabus.push({ classId: c, subjectId: s.id, ref: '', version: '', note: '' })));
    db = { v: 1, cfg: Object.assign({}, DEFAULT_CFG), classes: clone(D.classes), subjects: clone(D.subjects), orgs: clone(D.orgs), lessons, papers, syllabus, users: [], sessions: {}, otps: {}, subs: [], payments: [], progress: {}, attempts: [], aiUsage: {}, notifications: [], reviews: [], audit: [], secret: rnd(16), topics: [], tv2: true, outbox: [], messages: [], mutes: {} };
    audit('system.seeded', null, 'Catalogue loaded');
  }
  const EMPTY = () => ({ v: 1, cfg: Object.assign({}, DEFAULT_CFG), classes: [], subjects: [], orgs: [], lessons: [], papers: [], syllabus: [], users: [], sessions: {}, otps: {}, subs: [], payments: [], progress: {}, attempts: [], aiUsage: {}, notifications: [], reviews: [], audit: [], topics: [], outbox: [], messages: [], mutes: {} });

  /* ---------- helpers ---------- */
  function normContact(c) {
    c = (c || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return c;
    const d = c.replace(/[\s\-()]/g, ''); const m = d.match(/^(?:\+?256|0)(7\d{8})$/);
    return m ? '+256' + m[1] : null;
  }
  const pwOk = p => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
  const can = (u, perm) => { const p = ROLE_PERMS[u.role] || []; return p.includes('*') || p.includes(perm); };
  /* teachers are scoped to the class + subject pairs an administrator assigned to them */
  const teachingOf = u => (u && Array.isArray(u.teaching) ? u.teaching : []);
  const inScope = (u, cls, subject) => u.role !== 'teacher' || teachingOf(u).some(t => t.cls === cls && (!subject || t.subject === subject));
  const teachClasses = u => [...new Set(teachingOf(u).map(t => t.cls))];
  const deviceId = () => { let d = LS.getItem(DEV); if (!d) { d = uid('dev'); LS.setItem(DEV, d); } return d; };
  /* One-time codes: generated here, delivered by the server's SMS (Africa's Talking) or email (Resend) hook, stored only as a
     hash, valid 10 minutes, 5 tries, one new code per 45 seconds and 5 per hour. The code is NEVER returned to the browser. */
  async function issueOtp(contact, purpose) {
    load(); const k = contact + '|' + purpose, prev = db.otps[k], t = now();
    if (prev && prev.sentAt && t - prev.sentAt < 45000) return { error: 'Please wait ' + Math.ceil((45000 - (t - prev.sentAt)) / 1000) + ' seconds before asking for another code.' };
    const hist = ((prev && prev.hist) || []).filter(x => t - x < 3600000); if (hist.length >= 5) return { error: 'Too many codes were requested. Try again in an hour.' };
    const a = new Uint32Array(1); root.crypto.getRandomValues(a); const code = String(100000 + (a[0] % 900000));
    const h = HOOKS(); const d = h.deliverOtp ? await h.deliverOtp(contact, purpose, code) : { ok: false, error: 'Code sending is not set up on this site yet.' };
    if (!d.ok) return { error: d.error || 'We could not send the code. Please try again.' };
    load(); db.otps[k] = { h: await sha(db.secret + '|' + k + '|' + code), exp: t + 10 * 60000, tries: 0, sentAt: t, hist: hist.concat([t]) }; save();
    return { sent: true, via: d.via };
  }
  async function checkOtp(contact, purpose, code) {
    const k = contact + '|' + purpose; load(); const o = db.otps[k];
    if (!o || o.exp < now()) return 'The code has expired. Request a new one.';
    if (o.tries >= 5) return 'Too many wrong codes. Request a new one.';
    if ((await sha(db.secret + '|' + k + '|' + String(code).trim())) !== o.h) { o.tries++; save(); return 'That code is not correct.'; }
    delete db.otps[k]; save(); return null;
  }
  function startSession(u) {
    if (u.role === 'student') Object.keys(db.sessions).forEach(t => { if (db.sessions[t].userId === u.id) delete db.sessions[t]; }); // students: one active session / one device. Staff may use several devices.
    const t = rnd(24); db.sessions[t] = { userId: u.id, deviceId: u.role === 'student' ? u.deviceId : deviceId(), at: now() };
    LS.setItem(TOK, t); audit('login.ok', u.id, 'device ' + String(u.deviceId || deviceId()).slice(-6)); save();
    return okr({ role: u.role });
  }
  function sessionUser() {
    load(); if (!db) return { reason: '' };
    const t = LS.getItem(TOK), s = t && db.sessions[t];
    if (!s) return { reason: t ? 'Your session ended. Please log in again.' : '' };
    const u = db.users.find(x => x.id === s.userId);
    if (!u || u.status !== 'active') return { reason: 'This account is not active.' };
    if ((u.role === 'student' && s.deviceId !== u.deviceId) || s.deviceId !== deviceId()) return { reason: 'This account is now active on another device. Log in again to switch back.' };
    return { user: u, session: s };
  }
  function auth(perm) {
    const r = sessionUser(); if (!r.user) return { e: err('Please log in.') };
    if (perm && !can(r.user, perm)) { audit('permission.denied', r.user.id, perm); save(); return { e: err('You do not have permission to do that.') }; }
    return { u: r.user };
  }
  function accessOf(u) {
    if (!u) return { state: 'none' };
    if (u.role !== 'student') return { state: 'staff', role: u.role };
    const t = now();
    const sub = db.subs.filter(s => s.userId === u.id && s.status === 'active' && s.expires > t).sort((a, b) => b.expires - a.expires)[0];
    if (sub) return { state: 'paid', expires: sub.expires, msLeft: sub.expires - t };
    const hadSub = db.subs.some(s => s.userId === u.id);
    if (u.trialStartedAt) { const left = u.trialEndsAt - t; if (left > 0) return { state: 'trial', msLeft: left }; return { state: 'expired', hadSub }; }
    return hadSub ? { state: 'expired', hadSub } : { state: 'trial_ready' };
  }
  const allowed = a => ['paid', 'trial', 'staff'].includes(a.state);
  const requireAccess = u => { const a = accessOf(u); return allowed(a) ? null : err('A subscription or active trial is required.'); };

  function textToHtml(t) {
    const out = []; let list = false;
    String(t || '').split(/\n/).forEach(line => {
      const l = line.trim();
      if (/^[-*•]\s+/.test(l)) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + esc(l.replace(/^[-*•]\s+/, '')) + '</li>'); }
      else { if (list) { out.push('</ul>'); list = false; } if (l) out.push('<p>' + esc(l) + '</p>'); }
    });
    if (list) out.push('</ul>'); return out.join('');
  }
  function parseQuestions(text, needKeys) {
    const qs = [], errors = [];
    String(text || '').split(/\n/).map(s => s.trim()).filter(Boolean).forEach((line, i) => {
      const p = line.split('|').map(s => s.trim()); const n = 'Line ' + (i + 1) + ': ';
      const type = (p[0] || '').toUpperCase();
      if (type !== 'MCQ' && type !== 'STRUCT') return errors.push(n + 'start with MCQ or STRUCT.');
      const marks = parseInt(p[2], 10); if (!(marks > 0 && marks <= 50)) return errors.push(n + 'marks must be 1–50.');
      if (!p[1] || !p[3]) return errors.push(n + 'topic and question text are required.');
      const q = { id: 'q' + (qs.length + 1), type: type === 'MCQ' ? 'mcq' : 'struct', topic: p[1], marks, text: p[3] };
      if (type === 'MCQ') {
        q.o = (p[4] || '').split(';;').map(s => s.trim()).filter(Boolean);
        if (q.o.length < 2) return errors.push(n + 'give at least two options separated by ;;');
        if (p[5]) { const a = parseInt(p[5], 10) - 1; if (!(a >= 0 && a < q.o.length)) return errors.push(n + 'answer number is outside the options.'); q.a = a; }
        else if (needKeys) return errors.push(n + 'a marking guide was promised, so give the correct option number.');
      } else {
        if (p[4]) q.model = p.slice(4).join(' | ').replace(/\\n/g, '\n'); else if (needKeys) return errors.push(n + 'a marking guide was promised, so give a model answer.');
      }
      qs.push(q);
    });
    return { questions: qs, errors };
  }
  function parseQuiz(text) {
    const qs = [], errors = [];
    String(text || '').split(/\n/).map(s => s.trim()).filter(Boolean).forEach((line, i) => {
      const p = line.split('|').map(s => s.trim()), o = (p[1] || '').split(';;').map(s => s.trim()).filter(Boolean), a = parseInt(p[2], 10) - 1;
      if (!p[0] || o.length < 2 || !(a >= 0 && a < o.length)) return errors.push('Quiz line ' + (i + 1) + ': use  question | A ;; B ;; C | correct option number');
      qs.push({ q: p[0], o, a });
    });
    return { quiz: qs, errors };
  }

  /* Voice-note audio is kept in IndexedDB on the device (blobs are too big for localStorage). In production, upload to object storage. */
  const Media = (function () {
    const mem = new Map(); let dbp = null;
    const open = () => dbp || (dbp = new Promise(res => { try { const rq = root.indexedDB.open('usl_media', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('b'); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); } catch (e) { res(null); } }));
    const tx = async (mode, fn) => { const d = await open(); if (!d) return null; return new Promise(r => { try { const t = d.transaction('b', mode), q = fn(t.objectStore('b')); t.oncomplete = () => r(q && q.result !== undefined ? q.result : true); t.onerror = t.onabort = () => r(null); } catch (e) { r(null); } }); };
    return { put: async (id, blob) => { mem.set(id, blob); await tx('readwrite', s => s.put(blob, id)); }, get: async id => { if (mem.has(id)) return mem.get(id); const v = await tx('readonly', s => s.get(id)); return v && v !== true ? v : null; }, del: async id => { mem.delete(id); await tx('readwrite', s => s.delete(id)); } };
  })();

  /* Shared class-room service (Supabase REST via /api/config). Without it, rooms work only inside one browser. */
  const Remote = (function () {
    let cfg = null, p = null, okNow = true, feat = {};
    const init = () => p || (p = (async () => { try { const r = await fetch('api/config', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j) feat = j.features || {}; if (j && j.ok && j.url && j.key) cfg = j; } } catch (e) { /* not configured */ } return !!cfg; })());
    const rest = async (method, path, body, extra) => {
      if (!cfg) return null;
      try { const r = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/' + path, { method, headers: Object.assign({ apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' }, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) }); okNow = r.ok; if (!r.ok) return null; const t = await r.text(); return t ? JSON.parse(t) : []; }
      catch (e) { okNow = false; return null; }
    };
    return { init, rest, get on() { return !!cfg; }, get features() { return feat; }, get healthy() { return okNow; }, get ice() { return cfg && cfg.ice ? cfg.ice : [{ urls: 'stun:stun.l.google.com:19302' }]; } };
  })();

  /* ---------- the simulated server ---------- */
  const Server = {
    async register(f) {
      const name = (f.name || '').trim(), contact = normContact(f.contact);
      if (name.length < 2) return err('Enter your full name.');
      if (!contact) return err('Enter a valid email address or Ugandan phone number (e.g. 0772 123456).');
      if (!pwOk(f.password)) return err('Password needs at least 8 characters with letters and numbers.');
      if (!f.consent) return err('Please confirm you are 18+, or that a parent/guardian consents to your use of this app.');
      const salt = uid('s'), pw = await hash(f.password, salt);
      load(); const isDev = contact === DEV_EMAIL;
      if (!isDev && !db.classes.find(c => c.id === f.classId)) return err('Choose your class.');
      const old = db.users.find(u => u.contact === contact);
      if (old && old.verified) return err('An account with this contact already exists. Please log in.');
      if (old) db.users = db.users.filter(u => u !== old); // an unfinished sign-up can be started again
      const u = { id: uid('u'), role: isDev ? 'admin' : 'student', name, contact, classId: isDev ? null : f.classId, subjects: [], schoolCode: (f.schoolCode || '').trim(), salt, pw, verified: false, status: 'active', createdAt: now(), consentAt: now(), deviceId: null, deviceSince: null, trialStartedAt: null, trialEndsAt: null, dailyGoal: 2, failed: 0, lockUntil: 0 };
      db.users.push(u); audit('user.registered', u.id, contact); save();
      const o = await issueOtp(contact, 'verify'); if (o.error) { load(); db.users = db.users.filter(x => x.id !== u.id); save(); return err(o.error); }
      return okr(Object.assign({ contact }, o));
    },
    async resendCode(contact, purpose) { contact = normContact(contact); load(); const u = db.users.find(x => x.contact === contact); if (!u) return err('Unknown account.'); const o = await issueOtp(contact, purpose === 'transfer' ? 'transfer' : 'verify'); return o.error ? err(o.error) : okr(o); },
    async verifyRegistration(contact, code) {
      contact = normContact(contact); load(); const u = db.users.find(x => x.contact === contact); if (!u) return err('Unknown account.');
      const e = await checkOtp(contact, 'verify', code); if (e) return err(e);
      load(); const u2 = db.users.find(x => x.id === u.id); if (!u2) return err('Unknown account.');
      return Server._finishVerify(u2);
    },
    _finishVerify(u) {
      u.verified = true; u.deviceId = deviceId(); u.deviceSince = now(); audit('user.verified', u.id); notify(u.id, u.role === 'admin' ? 'Welcome, developer. This administrator account has full access.' : 'Welcome! Your account is verified. You can start your free ' + db.cfg.trialMinutes + '-minute trial from the dashboard.');
      return startSession(u);
    },
    async login(contact, password, portal) {
      const c = normContact(contact); if (!c) return err('Enter the email or phone number you registered with.');
      load(); let u = db.users.find(x => x.contact === c);
      if (u && u.lockUntil > now()) return err('Too many attempts. Try again in ' + Math.ceil((u.lockUntil - now()) / 1000) + ' seconds.');
      const good = u ? (await hash(password || '', u.salt)) === u.pw : false;
      load(); u = u && db.users.find(x => x.id === u.id);
      if (!u || !good) {
        if (u) { u.failed++; audit('login.failed', u.id); if (u.failed >= 5) { u.lockUntil = now() + 60000; u.failed = 0; audit('login.locked', u.id, '5 failed attempts'); notify(u.id, 'Several wrong password attempts were made on your account.'); } save(); }
        return err('Incorrect contact or password.');
      }
      if (u.status !== 'active') return err('This account is suspended. Please contact support.');
      if (portal === 'teacher' && u.role !== 'teacher') return err('This sign-in is for teachers only. Students and other staff use the main log in.');
      if (portal !== 'teacher' && u.role === 'teacher') return err('Teachers sign in on the Teacher portal (teacher.html).');
      if (u.role === 'admin' && u.contact !== DEV_EMAIL) return err('Incorrect contact or password.');
      if (!u.verified) { const o = await issueOtp(c, 'verify'); return o.error ? err(o.error) : okr(Object.assign({ needsVerify: true, contact: c }, o)); }
      u.failed = 0; const dev = deviceId();
      if (!u.deviceId) { u.deviceId = dev; u.deviceSince = now(); audit('device.registered', u.id); }
      else if (u.role !== 'student') { /* staff may use several devices */ }
      else if (u.deviceId !== dev) {
        audit('login.new_device', u.id, 'blocked pending verification'); notify(u.id, 'Someone tried to log in from a new device. If this was not you, change your password.'); save();
        const o = await issueOtp(c, 'transfer'); return o.error ? err(o.error) : okr(Object.assign({ needsTransfer: true, contact: c }, o));
      }
      return startSession(u);
    },
    async completeTransfer(contact, code) {
      contact = normContact(contact); load(); const u = db.users.find(x => x.contact === contact); if (!u) return err('Unknown account.');
      const e = await checkOtp(contact, 'transfer', code); if (e) return err(e);
      load(); const u2 = db.users.find(x => x.id === u.id); if (!u2) return err('Unknown account.');
      return Server._finishTransfer(u2);
    },
    _finishTransfer(u) {
      u.deviceId = deviceId(); u.deviceSince = now(); audit('device.transferred', u.id); notify(u.id, 'Your account was moved to a new device. The old device has been signed out.');
      return startSession(u);
    },
    async requestReset(contact) {
      const c = normContact(contact); if (!c) return err('Enter the email or phone number you registered with.'); load(); const u = db.users.find(x => x.contact === c);
      if (u && u.verified && u.status === 'active' && !(u.role === 'admin' && u.contact !== DEV_EMAIL)) { const o = await issueOtp(c, 'reset'); if (o.error) return err(o.error); }
      return okr({ contact: c }); // same answer whether or not the account exists
    },
    async resetPassword(contact, code, password) {
      const c = normContact(contact); if (!c) return err('Unknown account.'); if (!pwOk(password)) return err('Password needs at least 8 characters with letters and numbers.');
      const e = await checkOtp(c, 'reset', code); if (e) return err(e); const salt = uid('s'), pw = await hash(password, salt); load(); const u = db.users.find(x => x.contact === c); if (!u) return err('Unknown account.');
      u.salt = salt; u.pw = pw; u.failed = 0; u.lockUntil = 0; Object.keys(db.sessions).forEach(t => { if (db.sessions[t].userId === u.id) delete db.sessions[t]; });
      audit('password.reset', u.id); notify(u.id, 'Your password was changed. If this was not you, contact support.'); save(); return okr();
    },
    logout() { load(); const t = LS.getItem(TOK); if (t && db.sessions[t]) { audit('logout', db.sessions[t].userId); delete db.sessions[t]; save(); } LS.removeItem(TOK); return okr(); },
    currentUser() { const r = sessionUser(); return r.user ? { user: r.user } : { reason: r.reason }; },
    access(u) { load(); return accessOf(u); },
    cfg() { load(); return db.cfg; },
    data() { load(); return db; },
    startTrial() {
      const r = auth(); if (r.e) return r.e; const u = r.u;
      if (u.role !== 'student') return err('Staff accounts do not need a trial.');
      if (u.trialStartedAt) { return err('Your one free trial has already been used on this account.'); }
      if (db.subs.some(s => s.userId === u.id && s.status === 'active' && s.expires > now())) return err('You already have an active subscription.');
      u.trialStartedAt = now(); u.trialEndsAt = now() + db.cfg.trialMinutes * 60000; audit('trial.started', u.id); save(); return okr({ ends: u.trialEndsAt });
    },
    updateProfile(p) {
      const r = auth(); if (r.e) return r.e; const u = r.u;
      if (p.classId && db.classes.find(c => c.id === p.classId) && u.role === 'student') { if (u.classId !== p.classId) u.subjects = []; u.classId = p.classId; }
      if (Array.isArray(p.subjects)) u.subjects = p.subjects.filter(s => db.subjects.find(x => x.id === s));
      if (p.dailyGoal) u.dailyGoal = Math.min(10, Math.max(1, parseInt(p.dailyGoal, 10) || 2));
      if (p.name && p.name.trim().length > 1) u.name = p.name.trim();
      save(); return okr();
    },
    notifications() { const r = auth(); if (r.e) return []; return db.notifications.filter(n => n.userId === r.u.id).slice(0, 10); },
    markNotificationsRead() { const r = auth(); if (r.e) return; db.notifications.forEach(n => { if (n.userId === r.u.id) n.read = true; }); save(); },

    /* content (paid features are gated on the server side of the boundary) */
    getLesson(id) {
      const r = auth(); if (r.e) return r.e; const g = requireAccess(r.u); if (g) return g;
      const l = db.lessons.find(x => x.id === id && (x.status === 'published' || (r.u.role === 'teacher' && x.submittedBy === r.u.id))); if (!l) return err('Lesson not found.');
      if (!inScope(r.u, l.cls, l.subject)) { audit('permission.denied', r.u.id, 'lesson outside teaching scope'); save(); return err('This lesson is outside the classes and subjects assigned to you.'); }
      return okr({ lesson: l });
    },
    getPaper(id, forReview) {
      const r = auth(); if (r.e) return r.e; const g = requireAccess(r.u); if (g) return g;
      const p = db.papers.find(x => x.id === id); if (!p) return err('Paper not found.');
      if (p.status !== 'published' && !(forReview && can(r.u, 'review')) && !(r.u.role === 'teacher' && p.submittedBy === r.u.id)) return err('This paper is not published.');
      if (!inScope(r.u, p.cls, p.subject)) { audit('permission.denied', r.u.id, 'paper outside teaching scope'); save(); return err('This paper is outside the classes and subjects assigned to you.'); }
      return okr({ paper: p });
    },
    saveQuiz(lessonId, score, total) {
      const r = auth(); if (r.e) return r.e; const g = requireAccess(r.u); if (g) return g;
      const m = db.progress[r.u.id] = db.progress[r.u.id] || {}; const p = m[lessonId] = m[lessonId] || {};
      p.quiz = { score, total, at: now() }; p.completed = true; p.updatedAt = now(); save(); return okr();
    },
    markComplete(lessonId, done) {
      const r = auth(); if (r.e) return r.e; const g = requireAccess(r.u); if (g) return g;
      const m = db.progress[r.u.id] = db.progress[r.u.id] || {}; const p = m[lessonId] = m[lessonId] || {}; p.completed = !!done; p.updatedAt = now(); p.opened = p.opened || now(); save(); return okr();
    },
    touchLesson(lessonId) { const r = auth(); if (r.e) return; const m = db.progress[r.u.id] = db.progress[r.u.id] || {}; const p = m[lessonId] = m[lessonId] || {}; p.opened = now(); p.updatedAt = p.updatedAt || 0; p.lastOpen = now(); save(); },
    progress() { const r = auth(); if (r.e) return {}; return db.progress[r.u.id] || {}; },

    /* exam attempts */
    startAttempt(paperId) {
      const r = auth(); if (r.e) return r.e; const g = requireAccess(r.u); if (g) return g;
      const p = db.papers.find(x => x.id === paperId && x.status === 'published'); if (!p) return err('Paper not available.');
      let a = db.attempts.find(x => x.userId === r.u.id && x.paperId === paperId && x.status === 'in_progress');
      if (a && a.startedAt + a.durationMs <= now()) { Server._finish(a, p); a = null; }
      if (!a) { a = { id: uid('at'), userId: r.u.id, paperId, startedAt: now(), durationMs: p.duration * 60000, answers: {}, flags: {}, status: 'in_progress' }; db.attempts.push(a); audit('exam.started', r.u.id, paperId); save(); }
      return okr({ attempt: a, paper: p, resumed: false });
    },
    saveAnswers(attemptId, answers, flags) {
      const r = auth(); if (r.e) return r.e; const a = db.attempts.find(x => x.id === attemptId && x.userId === r.u.id); if (!a) return err('Attempt not found.');
      if (a.status !== 'in_progress') return err('This attempt is already submitted.');
      if (now() > a.startedAt + a.durationMs + 5000) return err('Time is up.');
      a.answers = answers || {}; a.flags = flags || {}; a.savedAt = now(); save(); return okr({ savedAt: a.savedAt });
    },
    _finish(a, p) {
      let got = 0, max = 0, scored = false; const ts = {};
      p.questions.forEach(q => {
        if (q.type === 'mcq' && typeof q.a === 'number') {
          scored = true; max += q.marks; const ok = a.answers[q.id] === q.a; if (ok) got += q.marks;
          const k = p.subject + '|' + q.topic; ts[k] = ts[k] || { got: 0, max: 0 }; ts[k].max += q.marks; ts[k].got += ok ? q.marks : 0;
        }
      });
      a.status = 'submitted'; a.submittedAt = now(); a.objective = { got, max, scored }; a.topicStats = ts; a.selfMarks = a.selfMarks || {};
    },
    submitAttempt(attemptId, answers, flags) {
      const r = auth(); if (r.e) return r.e; const a = db.attempts.find(x => x.id === attemptId && x.userId === r.u.id); if (!a) return err('Attempt not found.');
      if (a.status === 'in_progress') { if (answers) a.answers = answers; if (flags) a.flags = flags; Server._finish(a, db.papers.find(x => x.id === a.paperId)); audit('exam.submitted', r.u.id, a.paperId); save(); }
      return okr({ attempt: a });
    },
    getAttempt(id) { const r = auth(); if (r.e) return r.e; const a = db.attempts.find(x => x.id === id && x.userId === r.u.id); return a ? okr({ attempt: a }) : err('Attempt not found.'); },
    selfMark(attemptId, marks) {
      const r = auth(); if (r.e) return r.e; const g = requireAccess(r.u); if (g) return g;
      const a = db.attempts.find(x => x.id === attemptId && x.userId === r.u.id && x.status === 'submitted'); if (!a) return err('Attempt not found.');
      const p = db.papers.find(x => x.id === a.paperId); a.selfMarks = {};
      p.questions.forEach(q => { if (q.type === 'struct' && marks[q.id] != null && marks[q.id] !== '') { const v = Math.max(0, Math.min(q.marks, parseFloat(marks[q.id]) || 0)); a.selfMarks[q.id] = v; } });
      // rebuild topic stats: objective part + self-marked structured part
      const ts = {}; p.questions.forEach(q => {
        const k = p.subject + '|' + q.topic;
        if (q.type === 'mcq' && typeof q.a === 'number') { ts[k] = ts[k] || { got: 0, max: 0 }; ts[k].max += q.marks; ts[k].got += a.answers[q.id] === q.a ? q.marks : 0; }
        if (q.type === 'struct' && a.selfMarks[q.id] != null) { ts[k] = ts[k] || { got: 0, max: 0 }; ts[k].max += q.marks; ts[k].got += a.selfMarks[q.id]; }
      }); a.topicStats = ts; save(); return okr({ attempt: a });
    },
    myAttempts() { const r = auth(); if (r.e) return []; return db.attempts.filter(a => a.userId === r.u.id).sort((a, b) => b.startedAt - a.startedAt); },
    weakTopics() {
      const r = auth(); if (r.e) return []; const m = {};
      db.attempts.filter(a => a.userId === r.u.id && a.topicStats).forEach(a => Object.entries(a.topicStats).forEach(([k, v]) => { m[k] = m[k] || { got: 0, max: 0 }; m[k].got += v.got; m[k].max += v.max; }));
      const pr = db.progress[r.u.id] || {};
      Object.entries(pr).forEach(([lid, p]) => { const l = db.lessons.find(x => x.id === lid); if (l && p.quiz) { const k = l.subject + '|' + l.topic; m[k] = m[k] || { got: 0, max: 0 }; m[k].got += p.quiz.score; m[k].max += p.quiz.total; } });
      return Object.entries(m).filter(([, v]) => v.max > 0).map(([k, v]) => { const [subject, topic] = k.split('|'); return { subject, topic, got: v.got, max: v.max, pct: Math.round(v.got / v.max * 100) }; }).filter(x => x.pct < 60).sort((a, b) => a.pct - b.pct);
    },

    /* AI usage limits & monitoring */
    aiUse(chars) {
      const r = auth(); if (r.e) return r.e; const g = requireAccess(r.u); if (g) return g;
      const k = r.u.id + '|' + today(); const x = db.aiUsage[k] = db.aiUsage[k] || { calls: 0, chars: 0 };
      if (x.calls >= db.cfg.aiDailyLimit) return err('You have reached today\'s tutor limit (' + db.cfg.aiDailyLimit + ' questions). It resets tomorrow.');
      x.calls++; x.chars += chars || 0; save(); return okr({ left: db.cfg.aiDailyLimit - x.calls });
    },
    aiLeft() { const r = auth(); if (r.e) return 0; const x = db.aiUsage[r.u.id + '|' + today()]; return db.cfg.aiDailyLimit - (x ? x.calls : 0); },

    /* payments: automatic (Flutterwave mobile money) when the server has keys, otherwise manual (send money, give the transaction ID,
       administrator confirms). Either way ONLY the server can activate a subscription. */
    async initiatePayment(provider, phone) {
      const r = auth(); if (r.e) return r.e; const u = r.u; if (u.role !== 'student') return err('Only students subscribe.');
      const ph = normContact(phone); if (!ph || ph.includes('@')) return err('Enter a valid Ugandan mobile money number, e.g. 0772 123456.');
      if (!['MTN Mobile Money', 'Airtel Money'].includes(provider)) return err('Choose a payment provider.');
      const h = HOOKS(), auto = !!(h.chargeReady && h.chargeReady());
      let p = db.payments.find(x => x.userId === u.id && x.status === 'pending' && now() - x.createdAt < (auto ? 120000 : 3 * 3600000));
      if (p && p.mode === (auto ? 'auto' : 'manual') && (!auto || (p.phone === ph && p.provider === provider))) return okr({ payment: p, reused: true });
      if (p) { p.status = 'failed'; p.updatedAt = now(); }
      p = { id: uid('pay'), ref: 'USL-' + rnd(4).toUpperCase(), userId: u.id, provider, phone: ph, amount: db.cfg.price, currency: db.cfg.currency, days: db.cfg.days, payTo: normContact(db.cfg.payNumber), mode: auto ? 'auto' : 'manual', status: 'pending', createdAt: now(), updatedAt: now(), txId: null };
      db.payments.unshift(p); audit('payment.initiated', u.id, p.ref + ' ' + fmtUGX(p.amount) + ' ' + p.mode); save();
      if (auto) {
        const c = await h.charge({ ref: p.ref, amount: p.amount, currency: p.currency, phone: ph, provider, name: u.name, userId: u.id, email: u.contact.includes('@') ? u.contact : null });
        load(); const q = db.payments.find(x => x.id === p.id);
        if (!c.ok) { q.status = 'failed'; q.updatedAt = now(); q.note = c.error || ''; save(); return err(c.error || 'We could not start the mobile money payment. Please try again.'); }
        q.note = c.message || ''; save(); return okr({ payment: q });
      }
      return okr({ payment: p });
    },
    myPayments() { const r = auth(); if (r.e) return []; return db.payments.filter(p => p.userId === r.u.id); },
    async checkPayment(ref) {
      const r = auth(); if (r.e) return r.e; let p = db.payments.find(x => x.ref === ref && x.userId === r.u.id); if (!p) return err('Unknown payment.');
      if (p.status !== 'pending' || p.mode !== 'auto') return okr({ status: p.status });
      const h = HOOKS(); const v = h.verify ? await h.verify(p.ref) : { status: 'pending' }; load(); p = db.payments.find(x => x.ref === ref); return Server._apply(p, v);
    },
    async _gatewayEvent(ref) { // called by the payment webhook on the server, never by a browser
      load(); if (!db.payments.find(x => x.ref === ref)) return err('Unknown reference'); const h = HOOKS(); const v = h.verify ? await h.verify(ref) : { status: 'pending' }; load(); return Server._apply(db.payments.find(x => x.ref === ref), v);
    },
    _apply(p, v) {
      if (!p) return err('Unknown payment.');
      if (v.status === 'success') {
        if (!(Number(v.amount) >= p.amount) || (v.currency && v.currency !== p.currency)) { p.status = 'review'; p.note = 'Amount paid (' + v.amount + ' ' + (v.currency || '') + ') does not match the price.'; p.updatedAt = now(); audit('payment.amount_mismatch', p.userId, p.ref); queueWhatsApp('review', '⚠️ Payment needs checking\nRef: ' + p.ref + '\n' + p.note, p.id); save(); return okr({ status: 'review' }); }
        return Server._activate(p, v.txId);
      }
      if (v.status === 'failed' && p.status === 'pending') { p.status = 'failed'; p.updatedAt = now(); audit('payment.failed', p.userId, p.ref); notify(p.userId, 'Your payment did not go through. No money was taken for the subscription.'); save(); }
      return okr({ status: p.status });
    },
    _activate(p, txId) {
      if (p.status === 'success') { audit('payment.duplicate_ignored', p.userId, p.ref); save(); return okr({ status: 'success', duplicate: true }); }
      if (p.status === 'reversed') { audit('payment.late_success_ignored', p.userId, p.ref); save(); return err('This transaction was already reversed.'); }
      const latest = db.subs.filter(s => s.userId === p.userId && s.status === 'active').reduce((m, s) => Math.max(m, s.expires), 0), start = Math.max(now(), latest);
      db.subs.push({ id: uid('sub'), userId: p.userId, paymentId: p.id, start, expires: start + p.days * DAY, status: 'active' });
      p.status = 'success'; p.txId = txId || p.txId || null; p.updatedAt = now(); audit('payment.success', p.userId, p.ref); queueWhatsApp('subscription', payMessage(p, 'success'), p.id); notify(p.userId, 'Payment received. Your subscription is active for ' + p.days + ' days.'); save();
      return okr({ status: 'success' });
    },
    submitManualPayment(ref, txId) {
      const r = auth(); if (r.e) return r.e; const p = db.payments.find(x => x.ref === ref && x.userId === r.u.id); if (!p) return err('Unknown payment.');
      if (p.mode !== 'manual' || p.status !== 'pending') return err('This payment cannot be updated.');
      const id = String(txId || '').trim().toUpperCase().replace(/\s+/g, ''); if (!/^[A-Z0-9]{6,24}$/.test(id)) return err('Enter the transaction ID from the mobile money confirmation message (6–24 letters/numbers).');
      if (db.payments.some(x => x.txId === id && x.id !== p.id)) return err('That transaction ID has already been used.');
      p.txId = id; p.status = 'review'; p.updatedAt = now(); audit('payment.submitted', r.u.id, p.ref + ' ' + id);
      queueWhatsApp('manual', '🧾 Payment to confirm\nStudent: ' + r.u.name + ' (' + (r.u.classId || '—') + ')\nContact: ' + r.u.contact + '\nAmount: ' + fmtUGX(p.amount) + ' via ' + p.provider + '\nFrom: ' + p.phone + '\nRef: ' + p.ref + '\nTransaction ID: ' + id + '\nOpen Admin → Payments to confirm.', p.id);
      notify(r.u.id, 'We received your transaction ID. Your subscription starts as soon as the payment is confirmed.'); save(); return okr({ status: 'review' });
    },
    approvePayment(id) { const r = auth('*'); if (r.e) return r.e; const p = db.payments.find(x => x.id === id); if (!p || !['review', 'pending'].includes(p.status)) return err('This payment cannot be approved.'); audit('payment.approved', r.u.id, p.ref); return Server._activate(p, p.txId); },
    rejectPayment(id, note) { const r = auth('*'); if (r.e) return r.e; const p = db.payments.find(x => x.id === id); if (!p || !['review', 'pending'].includes(p.status)) return err('This payment cannot be rejected.'); p.status = 'failed'; p.updatedAt = now(); p.note = String(note || '').slice(0, 200); audit('payment.rejected', r.u.id, p.ref); notify(p.userId, 'Your payment could not be confirmed' + (p.note ? ': ' + p.note : '.') + ' Please check the details or contact support.'); save(); return okr(); },
    reversePayment(id) {
      const r = auth('*'); if (r.e) return r.e; const p = db.payments.find(x => x.id === id); if (!p || p.status !== 'success') return err('Only a confirmed payment can be reversed.');
      p.status = 'reversed'; p.updatedAt = now(); const s = db.subs.find(x => x.paymentId === p.id); if (s) s.status = 'revoked';
      audit('payment.reversed', r.u.id, p.ref); queueWhatsApp('reversal', payMessage(p, 'reversed'), p.id); notify(p.userId, 'A payment was reversed, so the matching subscription days were removed.'); save(); return okr();
    },

    /* admin / reviewer / contributor */
    adminStats() {
      const r = auth('*'); if (r.e) return r.e; const t = now(); const st = db.users.filter(u => u.role === 'student');
      const active = st.filter(u => accessOf(u).state === 'paid').length, trial = st.filter(u => accessOf(u).state === 'trial').length;
      const rev = db.payments.filter(p => p.status === 'success').reduce((s, p) => s + p.amount, 0);
      const ai = Object.entries(db.aiUsage).reduce((s, [, v]) => s + v.calls, 0);
      return okr({ students: st.length, active, trial, revenue: rev, published: db.papers.filter(p => p.status === 'published').length, pending: db.papers.filter(p => p.status === 'pending').length + db.lessons.filter(l => l.status === 'pending').length, aiCalls: ai, aiCost: ai * db.cfg.aiCostPerCall, attempts: db.attempts.length, lessons: db.lessons.filter(l => l.status === 'published').length });
    },
    listStudents() { const r = auth('*'); if (r.e) return r.e; return okr({ students: db.users.map(u => ({ id: u.id, name: u.name, contact: u.contact, role: u.role, classId: u.classId, status: u.status, verified: u.verified, device: u.deviceId, access: accessOf(u).state, createdAt: u.createdAt })) }); },
    setUserStatus(id, status) { const r = auth('*'); if (r.e) return r.e; const u = db.users.find(x => x.id === id); if (!u || u.id === r.u.id) return err('Cannot change that account.'); u.status = status === 'suspended' ? 'suspended' : 'active'; if (u.status !== 'active') Object.keys(db.sessions).forEach(t => { if (db.sessions[t].userId === id) delete db.sessions[t]; }); audit('user.' + u.status, r.u.id, u.contact); save(); return okr(); },
    resetDevice(id) { const r = auth('*'); if (r.e) return r.e; const u = db.users.find(x => x.id === id); if (!u) return err('Not found.'); u.deviceId = null; Object.keys(db.sessions).forEach(t => { if (db.sessions[t].userId === id) delete db.sessions[t]; }); audit('device.reset_by_admin', r.u.id, u.contact); save(); return okr(); },
    async addStaff(f) {
      const r = auth('*'); if (r.e) return r.e; const contact = normContact(f.contact);
      if (!contact || !contact.includes('@')) return err('Staff accounts need an email address.'); if (f.role === 'admin') return err('There is only one administrator account: the developer\'s.'); if (!ROLE_PERMS[f.role] || f.role === 'student') return err('Choose a role.'); if (!pwOk(f.password)) return err('Password needs 8+ characters with letters and numbers.');
      if (!(f.name || '').trim()) return err('Enter a name.'); const salt = uid('s'), pw = await hash(f.password, salt); load();
      if (db.users.find(u => u.contact === contact)) return err('That email already has an account.');
      let teaching = []; if (f.role === 'teacher' && f.teaching) { const c = Server._cleanTeaching(f.teaching); if (c.error) return err(c.error); teaching = c.out; }
      db.users.push({ id: uid('u'), role: f.role, name: f.name.trim(), contact, classId: null, subjects: [], teaching, salt, pw, verified: true, status: 'active', createdAt: now(), deviceId: null, deviceSince: null, dailyGoal: 2, failed: 0, lockUntil: 0 });
      audit('staff.added', r.u.id, contact + ' as ' + f.role); save(); return okr();
    },
    saveConfig(c) {
      const r = auth('*'); if (r.e) return r.e; const n = x => parseInt(x, 10);
      if (!(n(c.price) >= 1000) || !(n(c.days) >= 1) || !(n(c.trialMinutes) >= 1) || !(n(c.aiDailyLimit) >= 1)) return err('Check the values: price ≥ 1000, days ≥ 1, trial ≥ 1 minute, AI limit ≥ 1.');
      const pn = normContact(c.payNumber), wn = normContact(c.whatsappNumber);
      if (!pn || pn.includes('@')) return err('Enter a valid Ugandan phone number to receive payments.'); if (!wn || wn.includes('@')) return err('Enter a valid WhatsApp phone number.');
      Object.assign(db.cfg, { price: n(c.price), days: n(c.days), trialMinutes: n(c.trialMinutes), aiDailyLimit: n(c.aiDailyLimit), aiCostPerCall: n(c.aiCostPerCall) || 0, payNumber: String(c.payNumber).trim(), whatsappNumber: String(c.whatsappNumber).trim(), whatsappNotify: !!c.whatsappNotify });
      audit('config.saved', r.u.id, JSON.stringify(db.cfg)); save(); return okr();
    },
    upsertClass(c) { const r = auth('*'); if (r.e) return r.e; const id = (c.id || '').trim().toUpperCase(); if (!/^[A-Z0-9]{1,6}$/.test(id) || !(c.name || '').trim()) return err('Give a short class code (e.g. S1) and a name.'); const x = db.classes.find(k => k.id === id); if (c.color && !/^#[0-9a-fA-F]{6}$/.test(c.color)) return err('Pick a valid colour.'); const o = { id, name: c.name.trim(), level: (c.level || '').trim(), focus: (c.focus || '').trim(), color: (c.color || (x && x.color) || CLASS_COLORS[id] || '#2563eb').toLowerCase() }; if (x) Object.assign(x, o); else db.classes.push(o); audit('class.saved', r.u.id, id); save(); return okr(); },
    upsertSubject(s) {
      const r = auth('*'); if (r.e) return r.e; const name = (s.name || '').trim(); if (!name || !(s.classes || []).length) return err('Give a subject name and pick at least one class.');
      const id = s.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20); let x = db.subjects.find(k => k.id === id);
      if (x) { x.name = name; x.classes = s.classes; } else { x = { id, name, classes: s.classes }; db.subjects.push(x); }
      x.classes.forEach(c => { if (!db.syllabus.find(y => y.classId === c && y.subjectId === id)) db.syllabus.push({ classId: c, subjectId: id, ref: '', version: '', note: '' }); });
      audit('subject.saved', r.u.id, name); save(); return okr();
    },
    deleteSubject(id) { const r = auth('*'); if (r.e) return r.e; if (db.lessons.some(l => l.subject === id) || db.papers.some(p => p.subject === id)) return err('This subject has lessons or papers. Withdraw them first.'); db.subjects = db.subjects.filter(s => s.id !== id); db.syllabus = db.syllabus.filter(s => s.subjectId !== id); audit('subject.deleted', r.u.id, id); save(); return okr(); },
    outbox() { const r = auth('*'); if (r.e) return r.e; return okr({ items: db.outbox }); },
    markOutboxSent(id) { const r = auth('*'); if (r.e) return r.e; const m = db.outbox.find(x => x.id === id); if (!m) return err('Not found.'); m.status = 'sent'; m.sentAt = now(); audit('outbox.sent', r.u.id, m.kind); save(); return okr(); },
    /* ----- class discussion rooms: one room per class, class members only; no private messages ----- */
    _room(u, classId) {
      if (!db.classes.find(c => c.id === classId)) return err('Unknown class.');
      if (u.role === 'teacher') { audit('room.denied', u.id, classId); save(); return err('Teachers do not take part in the class discussion. Teach from the Live tab.'); }
      if (u.role === 'student') { if (u.classId !== classId) { audit('room.denied', u.id, classId); save(); return err('You can only join your own class room.'); } const g = requireAccess(u); if (g) return g; }
      return null;
    },
    /* ----- Live lessons: only the teacher of that class + subject can host; students of the class (with access) can watch ----- */
    liveAccess(classId, subjectId) {
      const r = auth(); if (r.e) return r.e; const u = r.u;
      const cl = db.classes.find(c => c.id === classId), sb = db.subjects.find(s => s.id === subjectId); if (!cl || !sb) return err('Unknown class or subject.');
      const base = { cls: classId, subject: subjectId, className: cl.name, subjectName: sb.name, me: { id: u.id, name: u.name, role: u.role } };
      if (u.role === 'teacher') { if (!teachingOf(u).some(t => t.cls === classId && t.subject === subjectId)) { audit('live.denied', u.id, classId + '/' + subjectId); save(); return err('You can only teach live for the classes and subjects assigned to you.'); } return okr(Object.assign(base, { host: true })); }
      if (u.role === 'student') { if (u.classId !== classId) { audit('live.denied', u.id, classId + '/' + subjectId); save(); return err('You can only watch lessons of your own class.'); } const g = requireAccess(u); if (g) return g; return okr(Object.assign(base, { host: false })); }
      return okr(Object.assign(base, { host: false }));
    },
    roomInfo(classId) {
      const r = auth(); if (r.e) return r.e; const e = Server._room(r.u, classId); if (e) return e; const m = db.mutes[r.u.id] || 0;
      return okr({ cls: db.classes.find(c => c.id === classId), members: db.users.filter(x => x.role === 'student' && x.classId === classId && x.status === 'active').length, mutedUntil: m > now() ? m : 0, me: { id: r.u.id, name: r.u.name, role: r.u.role } });
    },
    listMessages(classId) {
      const r = auth(); if (r.e) return r.e; const e = Server._room(r.u, classId); if (e) return e; const st = r.u.role !== 'student';
      return okr({ messages: db.messages.filter(m => m.cls === classId).slice(-300).map(m => ({ id: m.id, userId: m.userId, name: m.name, role: m.role, text: m.text, media: m.media, at: m.at, deleted: !!m.deleted, reply: m.reply || null, reactions: m.reactions || {}, editedAt: m.editedAt || 0, reportedByMe: m.reports.includes(r.u.id), reports: st ? m.reports.length : undefined })) });
    },
    mergeRemote(classId, rows, mutes) {
      const r = auth(); if (r.e) return r.e; const e = Server._room(r.u, classId); if (e) return e; let ch = false;
      (rows || []).forEach(w => {
        let m = db.messages.find(x => x.id === w.id);
        if (!m) { m = { id: String(w.id), cls: w.cls, userId: w.user_id, name: w.name, role: w.role, text: w.text || '', media: w.media_id ? { id: w.media_id, dur: w.dur || (w.media_kind === 'image' ? 0 : 1), mime: w.mime || 'audio/webm', kind: w.media_kind || 'voice', wave: Array.isArray(w.wave) ? w.wave : [] } : null, at: Number(w.at), reports: Array.isArray(w.reports) ? w.reports : [], deleted: !!w.deleted, reply: w.reply || null, reactions: w.reactions && typeof w.reactions === 'object' ? w.reactions : {}, editedAt: Number(w.edited_at) || 0 }; if (m.deleted) { m.text = ''; m.media = null; } db.messages.push(m); ch = true; }
        else { if (w.deleted && !m.deleted) { m.deleted = true; m.text = ''; m.media = null; ch = true; } const rp = Array.isArray(w.reports) ? w.reports : []; if (rp.length !== m.reports.length) { m.reports = rp; ch = true; }
          if (!m.deleted) { const rx = w.reactions && typeof w.reactions === 'object' ? w.reactions : {}; if (JSON.stringify(rx) !== JSON.stringify(m.reactions || {})) { m.reactions = rx; ch = true; } const ea = Number(w.edited_at) || 0; if (ea > (m.editedAt || 0) && w.text != null) { m.text = w.text; m.editedAt = ea; ch = true; } } }
      });
      (mutes || []).forEach(x => { if (Number(x.until) > now() && db.mutes[x.user_id] !== Number(x.until)) { db.mutes[x.user_id] = Number(x.until); ch = true; } });
      if (ch) { db.messages.sort((a, b) => a.at - b.at); save(); } return okr({ changed: ch });
    },
    messageRow(id) { const m = db.messages.find(x => x.id === id); return m ? { id: m.id, cls: m.cls, user_id: m.userId, name: m.name, role: m.role, text: m.text || '', media_id: m.media ? m.media.id : null, dur: m.media ? m.media.dur : null, mime: m.media ? m.media.mime : null, at: m.at, deleted: false, reports: m.reports, reply: m.reply || null, reactions: m.reactions || {}, edited_at: m.editedAt || 0, wave: m.media && m.media.wave ? m.media.wave : null, media_kind: m.media ? m.media.kind : null } : null; },
    postMessage(classId, f) {
      const r = auth(); if (r.e) return r.e; const e = Server._room(r.u, classId); if (e) return e; const u = r.u; f = f || {};
      if ((db.mutes[u.id] || 0) > now()) return err('You are muted in this room until ' + new Date(db.mutes[u.id]).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '.');
      if (db.messages.filter(m => m.userId === u.id && now() - m.at < 30000).length >= 8) return err('You are sending messages too fast. Wait a few seconds.');
      const text = String(f.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
      if (text.length > 1000) return err('Messages can be up to 1000 characters.');
      let media = null;
      if (f.media) {
        const id = String(f.media.id || ''), mime = String(f.media.mime || ''), kind = f.media.kind === 'image' ? 'image' : 'voice';
        if (kind === 'image') { if (u.role === 'student') return err('Photos can only be shared by teachers in class rooms.'); if (!/^m_[a-z0-9]{6,30}$/.test(id) || !/^image\/(jpeg|png|webp)$/.test(mime)) return err('That picture is not valid.'); media = { id, kind, mime, dur: 0 }; }
        else { const d = Number(f.media.dur); if (!/^m_[a-z0-9]{6,30}$/.test(id) || !(d >= 1 && d <= 120) || !/^audio\//.test(mime)) return err('That voice note is not valid (1–120 seconds).'); media = { id, dur: Math.round(d), mime: mime.slice(0, 40), kind: 'voice', wave: Array.isArray(f.media.wave) ? f.media.wave.slice(0, 48).map(x => Math.max(0, Math.min(100, Math.round(Number(x) || 0)))) : [] }; }
      }
      if (!text && !media) return err('Type a message or record a voice note.');
      let reply = null; if (f.reply) { const o = db.messages.find(x => x.id === f.reply && x.cls === classId && !x.deleted); if (o) reply = { id: o.id, name: o.name, userId: o.userId, text: String(o.text || '').slice(0, 90), kind: o.media ? o.media.kind : '' }; }
      const m = { id: uid('c'), cls: classId, userId: u.id, name: u.name, role: u.role, text, media, at: now(), reports: [], deleted: false, reply, reactions: {}, editedAt: 0 };
      db.messages.push(m); const mine = db.messages.filter(x => x.cls === classId), dropped = [];
      if (mine.length > 300) mine.slice(0, mine.length - 300).forEach(x => { if (x.media) dropped.push(x.media.id); db.messages.splice(db.messages.indexOf(x), 1); });
      save(); return okr({ id: m.id, dropped });
    },
    deleteMessage(id) {
      const r = auth(); if (r.e) return r.e; const m = db.messages.find(x => x.id === id); if (!m) return err('Message not found.');
      const staff = can(r.u, 'moderate'); if (m.userId !== r.u.id && !staff) { audit('permission.denied', r.u.id, 'delete message'); save(); return err('You can only delete your own messages.'); }
      const mediaId = m.media && m.media.id; m.deleted = true; m.text = ''; m.media = null; if (staff && m.userId !== r.u.id) audit('chat.deleted_by_staff', r.u.id, m.cls + ' ' + m.name); save(); return okr({ mediaId });
    },
    editMessage(id, text) {
      const r = auth(); if (r.e) return r.e; const m = db.messages.find(x => x.id === id && !x.deleted); if (!m || m.userId !== r.u.id) return err('You can only edit your own messages.');
      if (m.media) return err('Voice notes and pictures cannot be edited.'); if (now() - m.at > 15 * 60000) return err('Messages can only be edited for 15 minutes.');
      text = String(text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim(); if (!text) return err('A message cannot be empty.'); if (text.length > 1000) return err('Messages can be up to 1000 characters.');
      m.text = text; m.editedAt = now(); save(); return okr();
    },
    reactMessage(id, emoji) {
      const r = auth(); if (r.e) return r.e; const m = db.messages.find(x => x.id === id && !x.deleted); if (!m) return err('Message not found.'); const e = Server._room(r.u, m.cls); if (e) return e;
      const ok = ['👍','❤️','😂','😮','😢','🙏','🎉','👏','🔥','💯']; m.reactions = m.reactions || {}; if (!emoji || m.reactions[r.u.id] === emoji) delete m.reactions[r.u.id]; else if (ok.includes(emoji)) m.reactions[r.u.id] = emoji; else return err('That reaction is not available.');
      save(); return okr({ reactions: m.reactions });
    },
    reportMessage(id) {
      const r = auth(); if (r.e) return r.e; const m = db.messages.find(x => x.id === id && !x.deleted); if (!m) return err('Message not found.'); const e = Server._room(r.u, m.cls); if (e) return e;
      if (m.userId === r.u.id) return err('You cannot report your own message.'); if (!m.reports.includes(r.u.id)) { m.reports.push(r.u.id); m.dismissed = false; audit('chat.reported', r.u.id, m.cls + ' ' + m.name); save(); } return okr();
    },
    muteUser(userId, minutes) {
      const r = auth('moderate'); if (r.e) return r.e; const u = db.users.find(x => x.id === userId); if (!u || u.id === r.u.id || u.role !== 'student') return err('You can only mute students.');
      const mins = Math.max(1, Math.min(10080, parseInt(minutes, 10) || 60)); db.mutes[u.id] = now() + mins * 60000; audit('chat.muted', r.u.id, u.contact + ' ' + mins + ' min'); notify(u.id, 'A teacher muted you in the class room for ' + mins + ' minutes. Please follow the room rules.'); save(); return okr();
    },
    unmuteUser(userId) { const r = auth('moderate'); if (r.e) return r.e; delete db.mutes[userId]; audit('chat.unmuted', r.u.id, userId); save(); return okr(); },
    chatReports() {
      const r = auth('moderate'); if (r.e) return r.e;
      return okr({ reports: db.messages.filter(m => m.reports.length && !m.deleted && !m.dismissed).map(m => ({ id: m.id, cls: m.cls, userId: m.userId, name: m.name, text: m.text, media: !!m.media, at: m.at, count: m.reports.length, mutedUntil: db.mutes[m.userId] > now() ? db.mutes[m.userId] : 0 })),
        muted: Object.entries(db.mutes).filter(([, t]) => t > now()).map(([id, t]) => ({ id, name: (db.users.find(u => u.id === id) || {}).name || id, until: t })) });
    },
    dismissReports(id) { const r = auth('moderate'); if (r.e) return r.e; const m = db.messages.find(x => x.id === id); if (!m) return err('Not found.'); m.dismissed = true; audit('chat.report_dismissed', r.u.id, m.cls); save(); return okr(); },
    addOrg(name) { const r = auth('*'); if (r.e) return r.e; name = (name || '').trim(); if (name.length < 2) return err('Enter the organisation name.'); if (db.orgs.find(o => o.name.toLowerCase() === name.toLowerCase())) return err('That organisation already exists.'); db.orgs.push({ id: uid('o'), name }); audit('org.added', r.u.id, name); save(); return okr(); },
    setRole(id, role) { const r = auth('*'); if (r.e) return r.e; const u = db.users.find(x => x.id === id); if (!u || u.id === r.u.id || u.role === 'student' || !ROLE_PERMS[role] || role === 'student' || role === 'admin' || u.role === 'admin') return err('Cannot change that role.'); u.role = role; Object.keys(db.sessions).forEach(t => { if (db.sessions[t].userId === id) delete db.sessions[t]; }); audit('role.changed', r.u.id, u.contact + ' → ' + role); save(); return okr(); },
    setSyllabus(classId, subjectId, ref, version, note) { const r = auth('*'); if (r.e) return r.e; const s = db.syllabus.find(x => x.classId === classId && x.subjectId === subjectId); if (!s) return err('Not found.'); Object.assign(s, { ref: (ref || '').trim(), version: (version || '').trim(), note: (note || '').trim() }); audit('syllabus.saved', r.u.id, classId + '/' + subjectId); save(); return okr(); },
    submitPaper(f) {
      const r = auth('submit'); if (r.e) return r.e;
      if (!(f.title || '').trim()) return err('Give the paper a title.');
      if (!db.classes.find(c => c.id === f.cls)) return err('Choose a class.'); if (!db.subjects.find(s => s.id === f.subject)) return err('Choose a subject.');
      if (!inScope(r.u, f.cls, f.subject)) { audit('permission.denied', r.u.id, 'paper outside teaching scope'); save(); return err('You can only add or open material for the classes and subjects assigned to you.'); }
      const year = parseInt(f.year, 10); if (!(year >= 1990 && year <= 2100)) return err('Enter a valid year.');
      const pn = parseInt(f.paperNo, 10); if (!(pn >= 1 && pn <= 9)) return err('Paper number must be 1–9.'); const dur = parseInt(f.duration, 10); if (!(dur >= 1 && dur <= 300)) return err('Duration must be 1–300 minutes.');
      if (!CATEGORIES.includes(f.category)) return err('Choose a paper category.'); if (!PERMS.includes(f.permission)) return err('Choose the permission status.'); if (!db.orgs.find(o => o.id === f.org)) return err('Choose the source organisation.');
      const pq = parseQuestions(f.questionsText, !!f.hasGuide); if (pq.errors.length) return err(pq.errors[0]); if (!pq.questions.length) return err('Add at least one question.');
      if (r.u.role === 'teacher') { const known = Server.topicsFor(f.cls, f.subject).map(x => x.toLowerCase()); const bad = pq.questions.findIndex(q => !known.includes(String(q.topic || '').trim().toLowerCase())); if (bad >= 0) return err('Question ' + (bad + 1) + ' has the topic "' + pq.questions[bad].topic + '", which is not in the topic list for ' + f.cls + ' ' + db.subjects.find(s => s.id === f.subject).name + '. Pick a listed topic or add the topic first.'); }
      const cl = db.classes.find(c => c.id === f.cls);
      const p = { id: uid('p'), title: f.title.trim(), cls: f.cls, level: cl.level, subject: f.subject, year, paperNo: pn, org: db.orgs.find(o => o.id === f.org).name, category: f.category, hasGuide: !!f.hasGuide, verified: false, permission: f.permission, reviewer: 'Pending review', status: 'pending', submittedBy: r.u.id, createdAt: now(), duration: dur, instructions: (f.instructions || '').trim() || 'Answer all questions.', questions: pq.questions };
      db.papers.push(p); audit('paper.submitted', r.u.id, p.title); save(); return okr({ id: p.id });
    },
    /* ----- teacher scope, categorisation (class -> subject -> topic) ----- */
    scope() {
      const r = auth(); if (r.e) return { role: '', unrestricted: true, pairs: [], classes: [] }; const u = r.u;
      if (u.role !== 'teacher') return { role: u.role, unrestricted: true, pairs: [], classes: db.classes.map(c => c.id) };
      return { role: 'teacher', unrestricted: false, pairs: teachingOf(u).map(t => ({ cls: t.cls, subject: t.subject })), classes: teachClasses(u) };
    },
    topicsFor(cls, subject) {
      load(); const set = new Map(); const add = t => { const k = String(t || '').trim(); if (k && !set.has(k.toLowerCase())) set.set(k.toLowerCase(), k); };
      (db.topics || []).filter(t => t.cls === cls && t.subject === subject).forEach(t => add(t.topic));
      db.lessons.filter(l => l.cls === cls && l.subject === subject && l.status !== 'rejected' && l.status !== 'withdrawn').forEach(l => add(l.topic));
      db.papers.filter(p => p.cls === cls && p.subject === subject && p.status !== 'rejected' && p.status !== 'withdrawn').forEach(p => (p.questions || []).forEach(q => add(q.topic)));
      return [...set.values()].sort((a, b) => a.localeCompare(b));
    },
    _addTopic(cls, subject, name) {
      name = String(name || '').replace(/\s+/g, ' ').trim(); if (name.length < 2 || name.length > 80) return 'A topic name needs 2 to 80 characters.';
      if (!/^[\p{L}\p{N}][\p{L}\p{N} ,.'&()/:+-]*$/u.test(name)) return 'Topic names can use letters, numbers and simple punctuation only.';
      db.topics = db.topics || []; if (!Server.topicsFor(cls, subject).some(t => t.toLowerCase() === name.toLowerCase())) db.topics.push({ cls, subject, topic: name }); return null;
    },
    addTopic(cls, subject, name) {
      const r = auth('submit'); if (r.e) return r.e; if (!db.classes.find(c => c.id === cls) || !db.subjects.find(s => s.id === subject)) return err('Choose a class and subject.');
      if (!inScope(r.u, cls, subject)) return err('You can only add or open material for the classes and subjects assigned to you.');
      const e = Server._addTopic(cls, subject, name); if (e) return err(e); audit('topic.added', r.u.id, cls + ' ' + subject + ' ' + name); save(); return okr({ topics: Server.topicsFor(cls, subject) });
    },
    setTeaching(userId, list) {
      const r = auth('*'); if (r.e) return r.e; const u = db.users.find(x => x.id === userId); if (!u || u.role !== 'teacher') return err('That account is not a teacher.');
      const c = Server._cleanTeaching(list); if (c.error) return err(c.error); const out = c.out;
      u.teaching = out; audit('teacher.assigned', r.u.id, u.contact + ': ' + out.map(x => x.cls + '/' + x.subject).join(', ')); save(); return okr();
    },
    _cleanTeaching(list) {
      const seen = new Set(), out = []; for (const t of (Array.isArray(list) ? list : [])) { const sub = db.subjects.find(x => x.id === t.subject); if (!db.classes.find(c => c.id === t.cls) || !sub || !sub.classes.includes(t.cls)) return { error: 'Each assignment needs a class and a subject taught in that class.' }; const k = t.cls + '|' + t.subject; if (!seen.has(k)) { seen.add(k); out.push({ cls: t.cls, subject: t.subject }); } }
      return { out };
    },
    teachers() { const r = auth('*'); if (r.e) return r.e; return okr({ teachers: db.users.filter(u => u.role === 'teacher').map(u => ({ id: u.id, name: u.name, contact: u.contact, status: u.status, teaching: teachingOf(u) })) }); },
    submitLesson(f) {
      const r = auth('submit'); if (r.e) return r.e;
      if (!db.classes.find(c => c.id === f.cls) || !db.subjects.find(s => s.id === f.subject)) return err('Choose a class and subject.');
      if (!inScope(r.u, f.cls, f.subject)) { audit('permission.denied', r.u.id, 'lesson outside teaching scope'); save(); return err('You can only add or open material for the classes and subjects assigned to you.'); }
      if (!(f.title || '').trim() || !(f.topic || '').trim() || !(f.notes || '').trim()) return err('Title, topic and notes are required.');
      if (r.u.role === 'teacher') { const tp = f.topic.trim(), known = Server.topicsFor(f.cls, f.subject); const hit = known.find(x => x.toLowerCase() === tp.toLowerCase()); if (!hit) { if (!f.newTopic) return err('Choose a topic from the list, or add a new topic for this class and subject.'); const ad = Server._addTopic(f.cls, f.subject, tp); if (ad) return err(ad); } else f = Object.assign({}, f, { topic: hit }); }
      if (!PERMS.includes(f.permission)) return err('Choose the permission status.');
      const q = parseQuiz(f.quizText); if (q.errors.length) return err(q.errors[0]);
      const l = { id: uid('l'), cls: f.cls, subject: f.subject, topic: f.topic.trim(), subtopic: (f.subtopic || '').trim(), title: f.title.trim(), objectives: String(f.objectives || '').split('\n').map(s => s.trim()).filter(Boolean), notes: textToHtml(f.notes), example: (f.example || '').trim(), quiz: q.quiz, status: 'pending', review: 'pending', source: (f.source || '').trim() || 'Contributor', permission: f.permission, submittedBy: r.u.id, createdAt: now() };
      db.lessons.push(l); audit('lesson.submitted', r.u.id, l.title); save(); return okr({ id: l.id });
    },
    reviewItem(kind, id, decision, note) {
      const r = auth('review'); if (r.e) return r.e; const list = kind === 'lesson' ? db.lessons : db.papers; const it = list.find(x => x.id === id); if (!it || it.status !== 'pending') return err('Item is not waiting for review.');
      if (it.submittedBy === r.u.id) return err('You cannot review your own submission. Ask another reviewer.');
      if (decision === 'approve') {
        if (it.permission === 'Permission pending') return err('Cannot publish: permission to distribute this material is still pending.');
        if (kind === 'paper' && !it.questions.length) return err('The paper has no questions.');
        it.status = 'published'; if (kind === 'paper') { it.verified = false; it.reviewer = 'Reviewed by ' + r.u.name + ' (' + new Date().toISOString().slice(0, 10) + ')'; it.verified = it.category !== 'AI-generated practice'; } else it.review = 'reviewed';
      } else { it.status = 'rejected'; if (kind === 'paper') it.reviewer = 'Rejected by ' + r.u.name; }
      db.reviews.unshift({ id: uid('rv'), kind, itemId: id, title: it.title, decision, note: (note || '').trim(), by: r.u.name, at: now() }); audit('review.' + decision, r.u.id, kind + ' ' + it.title); save(); return okr();
    },
    withdraw(kind, id) { const r = auth('*'); if (r.e) return r.e; const it = (kind === 'lesson' ? db.lessons : db.papers).find(x => x.id === id); if (!it) return err('Not found.'); it.status = 'withdrawn'; audit('content.withdrawn', r.u.id, kind + ' ' + it.title); save(); return okr(); },
    mySubmissions() { const r = auth('submit'); if (r.e) return []; return { papers: db.papers.filter(p => p.submittedBy === r.u.id), lessons: db.lessons.filter(l => l.submittedBy === r.u.id) }; },
  };

  /* ---------- server-side start-up and what each browser may see ---------- */
  Server.init = async function () { load(); if (!db || db.v !== 1) { await seed(); save(); } return db; };
  Server._view = function () {
    load(); const r = sessionUser(), u = r.user, tok = LS.getItem(TOK), st = (HOOKS().status && HOOKS().status()) || {};
    const pubCfg = { price: db.cfg.price, currency: db.cfg.currency, days: db.cfg.days, trialMinutes: db.cfg.trialMinutes, payNumber: db.cfg.payNumber, aiDailyLimit: db.cfg.aiDailyLimit, payAuto: !!st.pay };
    const out = Object.assign(EMPTY(), { classes: db.classes, subjects: db.subjects, orgs: db.orgs, syllabus: db.syllabus, topics: db.topics || [], cfg: pubCfg });
    if (!u) { out.lessons = db.lessons.filter(l => l.status === 'published').map(l => ({ id: l.id, cls: l.cls, subject: l.subject, topic: l.topic, subtopic: l.subtopic, title: l.title, status: l.status, locked: true, objectives: [], notes: '', example: '', quiz: [] })); return out; }
    const admin = u.role === 'admin', review = can(u, 'review'), hasAcc = allowed(accessOf(u)), strip = x => { const c = Object.assign({}, x); delete c.pw; delete c.salt; delete c.failed; delete c.lockUntil; return c; };
    out.sessions[tok] = db.sessions[tok];
    out.users = admin ? db.users.map(strip) : [strip(u)].concat(u.role === 'student' ? [] : db.users.filter(x => x.id !== u.id).map(x => ({ id: x.id, name: x.name, role: x.role, classId: x.classId, status: x.status })));
    const seeLesson = l => admin || review || (u.role === 'student' ? l.status === 'published' && l.cls === u.classId : (l.status === 'published' && inScope(u, l.cls, l.subject)) || l.submittedBy === u.id);
    const full = x => hasAcc || admin || review || x.submittedBy === u.id || u.role === 'teacher' || u.role === 'contributor';
    out.lessons = db.lessons.filter(seeLesson).map(l => full(l) ? l : Object.assign({}, l, { objectives: Array.isArray(l.objectives) ? [] : '', notes: Array.isArray(l.notes) ? [] : '', example: Array.isArray(l.example) ? [] : '', quiz: [], locked: true }));
    const noKeys = pp => Object.assign({}, pp, { questions: (pp.questions || []).map(q => { const c = Object.assign({}, q); delete c.a; delete c.model; return c; }) }); // answer keys stay on the server for students
    out.papers = db.papers.filter(pp => seeLesson(pp)).map(pp => full(pp) ? (u.role === 'student' ? noKeys(pp) : pp) : Object.assign({}, pp, { questions: (pp.questions || []).map(q => ({ marks: q.marks, topic: q.topic })), locked: true }));
    out.progress = db.progress[u.id] ? { [u.id]: db.progress[u.id] } : {}; out.notifications = db.notifications.filter(n => n.userId === u.id).slice(0, 30);
    if (admin) { out.attempts = db.attempts; out.payments = db.payments; out.subs = db.subs; out.aiUsage = db.aiUsage; out.reviews = db.reviews; out.audit = db.audit; out.outbox = db.outbox; out.cfg = Object.assign({}, db.cfg, { payAuto: !!st.pay, services: st }); }
    else { const keysOf = id => { const pp = db.papers.find(x => x.id === id); return pp ? Object.fromEntries((pp.questions || []).map(q => [q.id, { a: q.a, model: q.model }])) : {}; }; out.attempts = db.attempts.filter(a => a.userId === u.id).map(a => a.status === 'in_progress' || u.role !== 'student' ? a : Object.assign({}, a, { keys: keysOf(a.paperId) })); out.payments = db.payments.filter(x => x.userId === u.id).map(x => { const c = Object.assign({}, x); return c; }); out.subs = db.subs.filter(x => x.userId === u.id); out.aiUsage = Object.fromEntries(Object.entries(db.aiUsage).filter(([k]) => k.startsWith(u.id + '|'))); if (review) out.reviews = db.reviews; }
    return out;
  };
  Server._pass = function () { const r = sessionUser(); return r.user && allowed(accessOf(r.user)) ? r.user.id : null; };

  /* ---------- browser side: everything that changes data is sent to the server ---------- */
  const REMOTE = ['register', 'resendCode', 'verifyRegistration', 'login', 'completeTransfer', 'requestReset', 'resetPassword', 'logout', 'startTrial', 'updateProfile', 'markNotificationsRead', 'saveQuiz', 'markComplete', 'touchLesson', 'startAttempt', 'saveAnswers', 'submitAttempt', 'selfMark', 'aiUse', 'initiatePayment', 'checkPayment', 'submitManualPayment', 'approvePayment', 'rejectPayment', 'reversePayment', 'setUserStatus', 'resetDevice', 'addStaff', 'saveConfig', 'upsertClass', 'upsertSubject', 'deleteSubject', 'markOutboxSent', 'addOrg', 'setRole', 'setSyllabus', 'submitPaper', 'addTopic', 'setTeaching', 'submitLesson', 'reviewItem', 'withdraw', 'sendOutbox'];
  const QUIET = ['touchLesson', 'saveAnswers'];
  if (!SERVER) {
    const mergeView = v => { const old = load() || {}; db = Object.assign(EMPTY(), v, { messages: old.messages || [], mutes: old.mutes || {} }); save(); };
    const rpc = async (method, args, noView) => {
      let res; const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ctl && setTimeout(() => ctl.abort(), 30000);
      try { const r = await fetch('api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ m: method, a: args, d: deviceId(), t: LS.getItem(TOK) || '', nv: !!noView }), signal: ctl && ctl.signal }); try { res = await r.json(); } catch (e) { res = null; } if (!res) res = { error: r.status === 404 ? 'The server functions were not found. Upload the api folder and deploy on Vercel.' : 'Server error (' + r.status + '). Please try again.' }; }
      catch (e) { return err('Could not reach the server. Check your internet connection and try again.'); } finally { if (to) clearTimeout(to); }
      if (res.error && !('result' in res)) return err(res.error);
      if ('token' in res) { if (res.token) LS.setItem(TOK, res.token); else LS.removeItem(TOK); }
      if ('pass' in res) { if (res.pass) LS.setItem(PASS, res.pass); else LS.removeItem(PASS); }
      if (res.view) mergeView(res.view);
      return res.result;
    };
    REMOTE.forEach(m => { Server[m] = (...a) => rpc(m, a, QUIET.includes(m)); });
    Server.sync = () => rpc('sync', [], false);
  } else Server.sendOutbox = function () { const r = auth('*'); return r.e || okr(); };
  const ready = SERVER ? Promise.resolve() : (async () => { load(); if (!db || db.v !== 1) { db = EMPTY(); save(); } await Server.sync(); })();

  /* ---------- grounded tutor (local retrieval). Swap `AI.provider` for an LLM behind your server. ---------- */
  const STOP = new Set('the a an of to in is are was what how why does do did can could would i me my you your please explain about tell give with and or for on it this that be as at by from show teach'.split(' '));
  const stem = w => w.length > 4 ? w.replace(/(ing|es|s)$/, '') : w;
  const tok = s => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && w.length > 1 && !STOP.has(w)).map(stem);
  const plain = h => String(h || '').replace(/<br\s*\/?>/g, '. ').replace(/<\/(p|li|h3|div)>/g, '. ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();
  const AI = {
    provider: 'local-retrieval',
    search(q, classId, subjectId) {
      load(); const qt = [...new Set(tok(q))]; if (!qt.length) return null;
      let best = null;
      db.lessons.filter(l => l.status === 'published' && l.cls === classId && (!subjectId || l.subject === subjectId)).forEach(l => {
        const head = tok(l.title + ' ' + l.topic + ' ' + l.subtopic), body = tok(plain(l.notes) + ' ' + (l.objectives || []).join(' ') + ' ' + l.example);
        let s = 0, m = 0; qt.forEach(w => { if (head.includes(w)) { s += 3; m++; } else if (body.includes(w)) { s += 1; m++; } });
        if (m >= Math.ceil(qt.length / 2) && (!best || s > best.s)) best = { l, s, qt };
      });
      return best;
    },
    answer(q, o) {
      const hit = AI.search(q, o.classId, o.subjectId);
      if (!hit) return { found: false, text: 'I could not find that in the approved notes for this class and subject, so I will not guess. Try different words, pick another subject, or ask your teacher. You can also browse the Library.' };
      const l = hit.l, notes = plain(l.notes), sents = notes.match(/[^.!?]+[.!?]+/g) || [notes];
      let text;
      if (o.mode === 'example') text = 'Worked example: ' + plain(l.example);
      else if (o.mode === 'simple') text = 'In simple terms: ' + sents.slice(0, 2).join(' ').trim() + (l.objectives && l.objectives.length ? ' The key things to remember: ' + l.objectives.join('; ') + '.' : '');
      else { const m = sents.filter(s => tok(s).some(w => hit.qt.includes(w))).slice(0, 3); text = (m.length ? m : sents.slice(0, 2)).join(' ').trim(); }
      return { found: true, text, lesson: l };
    },
    quizQuestion(classId, subjectId, weak) {
      load(); const pool = [];
      db.lessons.filter(l => l.status === 'published' && l.cls === classId && (!subjectId || l.subject === subjectId)).forEach(l => (l.quiz || []).forEach((q, i) => pool.push({ l, q, i, weak: weak.some(w => w.topic === l.topic && w.subject === l.subject) })));
      if (!pool.length) return null; const w = pool.filter(p => p.weak); const src = w.length ? w : pool; return src[Math.floor(Math.random() * src.length)];
    }
  };

  /* ---------- speech ----------
     Voice quality: the browser's default voice is often a robotic one. We (1) pick the most natural installed voice
     (neural/"Google"/"Natural" voices first, British/African English preferred), (2) clean the text before speaking
     (no symbols, "S4" -> "Senior 4"), and (3) use Google's neural voice through /api/tts when the site owner has set GOOGLE_API_KEY. */
  const Speech = {
    rate: parseFloat(LS && LS.getItem('usl_rate')) || 0.95, last: '', cloud: false, _audio: null, _q: [], _token: 0, _playing: false,
    voices() { return isBrowser && 'speechSynthesis' in root ? (root.speechSynthesis.getVoices() || []).filter(v => /^en/i.test(v.lang)) : []; },
    score(v) {
      const n = v.name || '', l = (v.lang || '').replace('_', '-'); let s = 0;
      if (/natural|neural|online|premium|enhanced|studio|wavenet/i.test(n)) s += 60; if (/^Google/i.test(n)) s += 35; if (/Samantha|Daniel|Serena|Karen|Moira|Libby|Sonia|Ryan|Aria|Jenny|Guy/i.test(n)) s += 30;
      if (/en-(GB|UG|KE|TZ|ZA|NG)/i.test(l)) s += 22; else if (/en-(US|AU|IN)/i.test(l)) s += 14; if (/female/i.test(n)) s += 3;
      if (/espeak|compact|festival|robot|pico/i.test(n)) s -= 80; if (v.localService === false) s += 6; return s;
    },
    best() { const saved = LS && LS.getItem('usl_voice'), vs = Speech.voices(); return vs.find(v => v.name === saved) || vs.slice().sort((a, b) => Speech.score(b) - Speech.score(a))[0] || null; },
    supported() { return isBrowser && ('speechSynthesis' in root || Speech.cloud); },
    clean(text) {
      return String(text || '').replace(/https?:\/\/\S+/g, ' ').replace(/\[(\d+)\]/g, ' ').replace(/[*_#`>|~^]+/g, ' ').replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/\betc\./gi, 'et cetera')
        .replace(/\bS([1-6])\b/g, 'Senior $1').replace(/\bUGX\s?([\d,]+)/g, '$1 Uganda shillings').replace(/(\d)\s?%/g, '$1 percent').replace(/\s=\s/g, ' equals ').replace(/\s\+\s/g, ' plus ').replace(/\s[−-]\s/g, ' minus ').replace(/\s×\s|\s\*\s/g, ' times ').replace(/\s÷\s|\s\/\s/g, ' divided by ')
        .replace(/CO2|CO₂/g, 'carbon dioxide').replace(/H2O|H₂O/g, 'water').replace(/\(([^)]{0,60})\)/g, ', $1,').replace(/\s+/g, ' ').trim();
    },
    chunks(text, max) { const sents = String(text).match(/[^.!?;:]+[.!?;:]*/g) || [text], parts = []; let cur = ''; sents.forEach(s => { if ((cur + s).length > max) { if (cur) parts.push(cur.trim()); cur = s; } else cur += s; }); if (cur.trim()) parts.push(cur.trim()); return parts; },
    speak(text) {
      Speech.stop(); const t = Speech.clean(text); if (!t) return false; Speech.last = text; const tok = ++Speech._token;
      if (Speech.cloud) { Speech._cloud(t, tok); return true; }
      if (!('speechSynthesis' in root)) return false; const v = Speech.best();
      Speech.chunks(t, 160).forEach(p => { const u = new SpeechSynthesisUtterance(p); u.rate = Speech.rate; u.pitch = 1; u.lang = v ? v.lang : 'en-GB'; if (v) u.voice = v; root.speechSynthesis.speak(u); }); return true;
    },
    async _cloud(t, tok) {
      const parts = Speech.chunks(t, 380); const fetchOne = async p => { try { const r = await fetch('api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: LS.getItem(PASS) || '', text: p, rate: Speech.rate }) }); const j = await r.json(); return r.ok && j.ok && j.audio ? 'data:audio/mp3;base64,' + j.audio : null; } catch (e) { return null; } };
      let next = fetchOne(parts[0]);
      for (let i = 0; i < parts.length; i++) {
        const url = await next; if (tok !== Speech._token) return; if (i + 1 < parts.length) next = fetchOne(parts[i + 1]);
        if (!url) { Speech.cloud = false; const rest = parts.slice(i).join(' '); if ('speechSynthesis' in root) { const v = Speech.best(); Speech.chunks(rest, 160).forEach(p => { const u = new SpeechSynthesisUtterance(p); u.rate = Speech.rate; if (v) { u.voice = v; u.lang = v.lang; } root.speechSynthesis.speak(u); }); } return; }
        await new Promise(res => { const a = new Audio(url); Speech._audio = a; a.onended = a.onerror = () => res(); a.play().catch(() => res()); });
        if (tok !== Speech._token) return;
      }
    },
    pause() { if (Speech._audio && !Speech._audio.paused) Speech._audio.pause(); else Speech.supported() && 'speechSynthesis' in root && root.speechSynthesis.pause(); },
    resume() { if (Speech._audio && Speech._audio.paused && !Speech._audio.ended) Speech._audio.play(); else Speech.supported() && 'speechSynthesis' in root && root.speechSynthesis.resume(); },
    stop() { Speech._token++; if (Speech._audio) { try { Speech._audio.pause(); } catch (e) { /* ignore */ } Speech._audio = null; } if (isBrowser && 'speechSynthesis' in root) root.speechSynthesis.cancel(); },
    replay() { if (Speech.last) Speech.speak(Speech.last); },
    setRate(r) { Speech.rate = r; LS.setItem('usl_rate', r); },
    listen(onResult, onEnd, onErr) {
      const SR = root.SpeechRecognition || root.webkitSpeechRecognition; if (!SR) return null;
      const r = new SR(); r.lang = 'en-GB'; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = e => onResult(e.results[0][0].transcript); r.onend = onEnd; r.onerror = e => onErr && onErr(e.error); r.start(); return r;
    },
    bar(el, getText) {
      if (!Speech.supported()) { el.innerHTML = '<p class="hint">Read-aloud is not supported by this browser. Try Chrome on Android or a recent desktop browser.</p>'; return; }
      const vopts = () => { const vs = Speech.voices().sort((a, b) => Speech.score(b) - Speech.score(a)), cur = Speech.best(); return vs.map(v => '<option value="' + v.name.replace(/"/g, '&quot;') + '"' + (cur && cur.name === v.name ? ' selected' : '') + '>' + v.name.replace(/</g, '') + ' (' + v.lang + ')</option>').join(''); };
      el.innerHTML = '<div class="speechbar" role="group" aria-label="Read aloud controls"><button class="btn sm orange" data-a="play">🔊 Listen</button><button class="btn sm ghost" data-a="pause">⏸ Pause</button><button class="btn sm ghost" data-a="resume">▶ Resume</button><button class="btn sm ghost" data-a="replay">⟲ Replay</button><button class="btn sm ghost" data-a="stop">⏹ Stop</button><label class="small" style="margin:0">Speed <select data-a="rate" aria-label="Speaking speed">' + [0.75, 0.9, 0.95, 1.1, 1.25, 1.5].map(v => '<option value="' + v + '"' + (v === Speech.rate ? ' selected' : '') + '>' + v + '×</option>').join('') + '</select></label>' + (Speech.cloud ? '<span class="badge ok">Natural voice</span>' : '<label class="small" style="margin:0">Voice <select id="voicesel" aria-label="Voice">' + vopts() + '</select></label>') + '</div>';
      el.onclick = e => { const a = e.target.closest('button') && e.target.closest('button').dataset.a; if (a === 'play') Speech.speak(getText()); if (a === 'pause') Speech.pause(); if (a === 'resume') Speech.resume(); if (a === 'replay') Speech.replay(); if (a === 'stop') Speech.stop(); };
      el.querySelector('select[data-a=rate]').onchange = e => { Speech.setRate(parseFloat(e.target.value)); if (Speech.last) Speech.replay(); };
      const vs = el.querySelector('#voicesel'); if (vs) { vs.onchange = () => { LS.setItem('usl_voice', vs.value); if (Speech.last) Speech.replay(); }; if (root.speechSynthesis) root.speechSynthesis.onvoiceschanged = () => { vs.innerHTML = vopts(); }; }
    }
  };

  /* ---------- UI helpers (browser only) ---------- */
  function toast(msg, type) {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg; box.appendChild(t); setTimeout(() => t.remove(), type === 'bad' ? 7000 : 5000);
  }
  function modal(html, o) {
    o = o || {}; const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>'; document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onk); };
    const onk = e => { if (e.key === 'Escape' && !o.locked) close(); }; document.addEventListener('keydown', onk);
    const f = ov.querySelector('button,input,select,textarea,a'); f && f.focus(); return { el: ov.firstChild, close };
  }
  function confirmBox(msg, o) {
    o = o || {}; return new Promise(res => {
      const m = modal('<h3>' + esc(o.title || 'Please confirm') + '</h3><p>' + msg + '</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-v="0">' + esc(o.cancel || 'Cancel') + '</button><button class="btn ' + (o.danger ? 'danger' : 'orange') + '" data-v="1">' + esc(o.ok || 'Confirm') + '</button></div>');
      m.el.onclick = e => { const b = e.target.closest('button'); if (b) { m.close(); res(b.dataset.v === '1'); } };
    });
  }
  function csv(rows) { return rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n'); }
  function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function pill(a) {
    const cfg = Server.cfg();
    if (a.state === 'paid') return ['paid', '✓ Subscribed · ' + fmtMs(a.msLeft) + ' left'];
    if (a.state === 'trial') return ['trial', '⏱ Free trial ' + fmtMs(a.msLeft)];
    if (a.state === 'trial_ready') return ['ready', 'Start free trial'];
    if (a.state === 'staff') return ['paid', a.role === 'teacher' ? 'Teacher · free' : 'Staff'];
    return ['expired', 'Subscribe · ' + fmtUGX(cfg.price)];
  }
  function shell(user, page, a) {
    const staff = user.role !== 'student';
    const isTeacher = user.role === 'teacher';
    const items = isTeacher ? [['teacher', 'teacher.html', 'Teach', '🧑‍🏫'], ['library', 'library.html', 'My notes', '📚'], ['papers', 'papers.html', 'My papers', '📝'], ['live', 'live.html', 'Go live', '🔴'], ['profile', 'profile.html', 'Account', '👤']] : [['dashboard', 'dashboard.html', 'Home', '🏠'], ['library', 'library.html', 'Library', '📚'], ['papers', 'papers.html', 'Exam centre', '📝'], ['tutor', 'tutor.html', 'AI tutor', '🎙️'], ['live', 'live.html', 'Live', '🔴'], ['discuss', 'discuss.html', 'Discuss', '💬'], ['profile', 'profile.html', 'Account', '👤']];
    if (staff && !isTeacher) items.push(['admin', 'admin.html', 'Admin', '🛠️']);
    const cur = k => k === page ? ' aria-current="page"' : ''; const [pc, pt] = pill(a);
    if (user.classId) { const cc = classColor(user.classId); document.documentElement.style.setProperty('--cls', cc); document.body.classList.add('has-cls'); }
    const head = document.createElement('div');
    head.innerHTML = '<a class="skip" href="#main">Skip to content</a><header class="topbar"><div class="container"><a class="brand" href="' + (isTeacher ? 'teacher.html' : 'dashboard.html') + '"><span class="logo" aria-hidden="true">🎓</span><span>Uganda Smart Learning</span></a><nav class="nav" aria-label="Main">' + items.map(i => '<a href="' + i[1] + '"' + cur(i[0]) + '>' + i[2] + '</a>').join('') + '</nav><div class="top-right"><a id="pill" class="pill ' + pc + '" href="subscription.html">' + esc(pt) + '</a></div></div></header>';
    document.body.prepend(head);
    const bn = document.createElement('nav'); bn.className = 'bottomnav'; bn.setAttribute('aria-label', 'Main'); bn.style.gridTemplateColumns = 'repeat(' + items.length + ',1fr)';
    bn.innerHTML = items.map(i => '<a href="' + i[1] + '"' + cur(i[0]) + '><span aria-hidden="true">' + i[3] + '</span>' + i[2].replace('Exam centre', 'Exams') + '</a>').join(''); document.body.appendChild(bn);
  }
  function lockedOverlay(reason) {
    if ($('#locked')) return; root.dispatchEvent(new Event('usl:locked'));
    const m = modal('<h3>' + esc(reason === 'trial' ? 'Your free trial has ended' : 'Your access has ended') + '</h3><p>Your progress is saved. Subscribe for ' + fmtUGX(Server.cfg().price) + ' per month to keep learning.</p><a class="btn orange block" href="subscription.html">See plans &amp; pay</a>', { locked: true }); m.el.id = 'locked';
  }
  async function boot(o) {
    o = o || {}; await ready; load();
    const cu = Server.currentUser();
    if (o.auth !== false && !cu.user) { location.replace('index.html' + (cu.reason ? '?msg=' + encodeURIComponent(cu.reason) : '')); return new Promise(() => { }); }
    if (!cu.user) return { user: null };
    const user = cu.user; let a = Server.access(user);
    if (o.staff && !can(user, o.staff)) { location.replace('dashboard.html'); return new Promise(() => { }); }
    if (o.paid && !allowed(a)) { location.replace('subscription.html?need=1&from=' + encodeURIComponent(o.page || '')); return new Promise(() => { }); }
    shell(user, o.page, a);
    setInterval(() => { Server.sync(); }, 30000);
    setInterval(() => {
      const cur = Server.currentUser(); if (!cur.user) { location.replace('index.html?msg=' + encodeURIComponent(cur.reason || 'Please log in again.')); return; }
      a = Server.access(cur.user); const p = $('#pill'); if (p) { const [c, t] = pill(a); p.className = 'pill ' + c; p.textContent = t; }
      root.dispatchEvent(new CustomEvent('usl:tick', { detail: a }));
      if (o.paid && !allowed(a)) lockedOverlay(a.hadSub ? 'sub' : 'trial');
    }, 1000);
    return { user, access: a };
  }

  const waLink = (to, text) => 'https://wa.me/' + String(to || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text || '');
  const classColor = id => { load(); const c = db && db.classes.find(x => x.id === id); return (c && c.color) || CLASS_COLORS[id] || '#2563eb'; };
  const USL = { Remote, Media, classColor, LS, waLink, ready, Server, REMOTE, AI, Speech, boot, toast, modal, confirmBox, esc, $, $$, fmtUGX, fmtDate, fmtMs, csv, download, textToHtml, parseQuestions, parseQuiz, plain, allowed, can, normContact, deviceId, CATEGORIES, PERMS, today, build: root.USL_BUILD || '' };
  root.USL = USL; if (typeof module !== 'undefined' && module.exports) module.exports = USL;
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- page: index ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'index') {
(async function () {
  const { Server, esc, toast } = USL;
  await USL.ready; const main = document.getElementById('main');
  document.body.classList.add('land'); main.className = '';
  const db = Server.data(), cu = Server.currentUser(), cfg = Server.cfg();
  const msg = new URLSearchParams(location.search).get('msg');
  const classOpts = db.classes.map(c => '<option value="' + c.id + '">' + esc(c.id + ' – ' + c.name) + '</option>').join('');
  const home = u => (u.role === 'student' ? 'dashboard.html' : 'admin.html');
  const lessons = db.lessons.filter(l => l.status === 'published');
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;
  const icons = { S1: '🌱', S2: '🔬', S3: '🧭', S4: '🎯', S5: '🚀', S6: '🏆' };

  main.innerHTML = `<div class="sheet">
  <nav class="l-nav" aria-label="Main"><a class="brand" href="index.html"><span class="logo" aria-hidden="true">🎓</span><span>Uganda Smart Learning</span></a>
    <div class="links"><a href="#classes">Classes</a><a href="#why">Features</a><a href="#how">How it works</a><a href="#join">Pricing</a></div>
    <div class="btns">${cu.user ? '<a class="btn orange sm pillbtn" href="' + home(cu.user) + '">Continue →</a>' : '<button class="btn ghost sm pillbtn" data-go="in">Log in</button><button class="btn orange sm pillbtn" data-go="up">Sign up free</button>'}</div></nav>
  <section class="l-hero">
    <div><p><span class="badge orange">S1 – S6 · UCE &amp; UACE</span></p>
      <h1>Develop your marks in a <span>smarter way</span></h1>
      <p class="lead">Notes for every class, past-paper style practice for candidates, timed exams, and a voice tutor that explains topics from approved notes. Light on data and made for phones.</p>
      <div class="row" style="margin-top:20px"><button class="btn orange pillbtn" data-go="up">Start free 15-minute trial</button><a class="btn ghost pillbtn" href="#why">See what's inside</a></div>
      <p class="small muted" style="margin-top:14px">No payment needed to try. Then UGX ${cfg.price.toLocaleString('en-US')} per month.</p></div>
    <div class="l-art" aria-hidden="true"><div class="blob">🎓</div><div class="fl a">🎙️ Voice tutor</div><div class="fl b">📝 Past-paper practice</div><div class="fl c">📚 S1 – S6 notes</div></div>
  </section>
  <div class="band" aria-label="Subjects">${db.subjects.slice(0, 8).map(s => '<span>' + esc(s.name) + '</span>').join('')}</div>

  <section class="l-sec"><h2>Search lessons</h2><p class="sub">See what's available. Create a free account to open a lesson.</p>
    <div class="searchbar" role="search"><input id="q" type="search" placeholder="Try “quadratic”, “cell”, “Ohm”…" aria-label="Search lessons"><button class="btn orange pillbtn" id="qb">Search</button></div>
    <div class="grid auto" id="results" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))"></div></section>

  <section class="l-sec" id="why"><div class="benefit"><div class="artgrid" aria-hidden="true"><div>📚</div><div>🎙️</div><div>📝</div><div>📈</div></div>
    <div><h2 style="text-align:left">Benefits from our learning platform</h2>
      <div class="feature"><div class="ico" aria-hidden="true">📚</div><div><h3>S1–S6 Learning Centre</h3><p>Topic notes, worked examples, quizzes and progress tracking for each class.</p></div></div>
      <div class="feature"><div class="ico" aria-hidden="true">📝</div><div><h3>Candidate Exam Centre</h3><p>Filter papers by level, subject, year, paper number and source. Timed simulator with topic reports.</p></div></div>
      <div class="feature"><div class="ico" aria-hidden="true">🎙️</div><div><h3>AI Voice Teacher</h3><p>Listen to lessons, ask by voice, and hear explanations with pause, replay and speed control.</p></div></div>
      <div class="feature"><div class="ico" aria-hidden="true">🔒</div><div><h3>Simple, secure access</h3><p>One registered device per account and payments confirmed by your Mobile Money provider.</p></div></div></div></div></section>

  <section class="l-sec" id="classes"><h2>Choose your class</h2><p class="sub">Every class has its own subjects, notes and revision.</p>
    <div class="grid auto" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${db.classes.map(c => '<div class="ccard"><div class="thumb" style="background:linear-gradient(135deg,' + esc(c.color) + ',color-mix(in srgb,' + esc(c.color) + ' 60%,#fff))" aria-hidden="true">' + (icons[c.id] || '📘') + ' ' + esc(c.id) + '</div><h3>' + esc(c.name) + '</h3><p class="small muted">' + esc(c.focus) + '</p><p class="mb0"><span class="badge info">' + esc(c.level) + '</span> <span class="badge">' + lessons.filter(l => l.cls === c.id).length + ' sample lessons</span></p></div>').join('')}</div></section>

  <section class="l-sec" id="how"><h2>How it works</h2><p class="sub">From sign-up to exam practice in a few minutes.</p>
    <div class="grid g4 steps" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))"><div class="step"><h3>Create your account</h3><p>Use your phone or email and pick your class.</p></div><div class="step"><h3>Try it free</h3><p>One ${cfg.trialMinutes}-minute trial of everything.</p></div><div class="step"><h3>Learn and practise</h3><p>Lessons, quizzes, timed papers and the voice tutor.</p></div><div class="step"><h3>Subscribe</h3><p>Pay with MTN Mobile Money or Airtel Money to keep going.</p></div></div></section>

  <section class="l-sec" id="join" style="padding-bottom:44px"><h2>Join today</h2><p class="sub">Create your account and start your free trial.</p>
    <div class="grid g2" style="align-items:start;max-width:920px;margin:0 auto">
      <div class="price"><span class="badge orange">Student plan</span><b class="big">UGX ${cfg.price.toLocaleString('en-US')}</b><span class="muted">per ${cfg.days} days</span><br>
        <ul><li>All S1–S6 lessons, notes and quizzes</li><li>Exam centre and timed simulator</li><li>AI voice tutor (${cfg.aiDailyLimit} questions a day)</li><li>One free ${cfg.trialMinutes}-minute trial first</li></ul><p class="small muted mb0">Pay by MTN Mobile Money or Airtel Money. Your plan switches on only after the payment is confirmed.</p></div>
      <div class="card" id="authcard">${msg ? '<div class="alert warn" role="alert" style="margin-bottom:12px">' + esc(msg) + '</div>' : ''}
        <div class="tabs" role="tablist" aria-label="Account"><button class="tab" role="tab" id="t-up" aria-selected="true">Sign up</button><button class="tab" role="tab" id="t-in" aria-selected="false">Log in</button></div><div id="panel"></div></div></div></section>

  <div class="cta"><div><h2>Are you a teacher?</h2><p>Teachers use the app free on their own Teacher portal: upload notes and papers for the classes and subjects assigned to you, join your class discussion rooms and host live subject calls. Everything you upload is checked by a reviewer before students see it.</p><a class="btn pillbtn" href="teacher.html" style="background:#fff;color:#1d4ed8">Teacher sign in</a> <button class="btn ghost pillbtn" data-go="in">Admin / reviewer log in</button></div>
    <ul><li>Share your own lessons and quizzes</li><li>Add papers you are authorised to distribute</li><li>Reviewed before publishing</li></ul></div>

  <footer class="l-foot">Learning content is reviewed before it is published. Not affiliated with UNEB or NCDC. © Uganda Smart Learning</footer></div>`;

  const panel = document.getElementById('panel');
  const tabs = { up: document.getElementById('t-up'), in: document.getElementById('t-in') };
  const sel = k => { Object.entries(tabs).forEach(([n, b]) => b.setAttribute('aria-selected', n === k)); k === 'up' ? signup() : login(); };
  tabs.up.onclick = () => sel('up'); tabs.in.onclick = () => sel('in');
  main.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { sel(b.dataset.go); document.getElementById('join').scrollIntoView({ behavior: 'smooth' }); });

  const results = document.getElementById('results');
  function search() {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const rows = (q ? lessons.filter(l => (l.title + ' ' + l.topic + ' ' + l.subtopic + ' ' + subName(l.subject)).toLowerCase().includes(q)) : lessons).slice(0, 6);
    results.innerHTML = rows.map(l => '<div class="ccard"><span class="badge info">' + esc(l.cls) + '</span> <span class="badge">' + esc(subName(l.subject)) + '</span><h3 style="margin-top:8px">' + esc(l.title) + '</h3><p class="small muted">' + esc(l.topic) + '</p><button class="btn sm orange pillbtn" data-open>Open lesson</button></div>').join('') || '<p class="muted center" style="grid-column:1/-1">No lesson matches yet.</p>';
    results.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { toast(cu.user ? 'Opening your dashboard…' : 'Create a free account to open lessons.', 'ok'); if (cu.user) location.href = 'library.html'; else { sel('up'); document.getElementById('join').scrollIntoView({ behavior: 'smooth' }); } });
  }
  document.getElementById('qb').onclick = search; document.getElementById('q').oninput = search; search();

  const errBox = m => '<div class="alert bad" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>';
  const val = id => document.getElementById(id).value;

  function signup(e) {
    panel.innerHTML = `${e ? errBox(e) : ''}<form id="f" novalidate>
      <div class="field"><label for="n">Full name</label><input id="n" autocomplete="name" required></div>
      <div class="field"><label for="c">Class</label><select id="c"><option value="">Choose your class</option>${classOpts}</select></div>
      <div class="field"><label for="k">Phone number or email</label><input id="k" autocomplete="username" inputmode="email" placeholder="0772 123456 or you@example.com" required></div>
      <div class="field"><label for="p">Password</label><input id="p" type="password" autocomplete="new-password" required><div class="hint">At least 8 characters, with letters and numbers.</div></div>
      <div class="field"><label for="s">School code <span class="muted">(optional)</span></label><input id="s" placeholder="If your school gave you one"><div class="hint">A phone number or email does not prove who you are; schools can verify students with this code.</div></div>
      <div class="field"><label class="check"><input type="checkbox" id="cs"><span>I am 18 or older, or my parent/guardian agrees that I may use this app and that my name, class and learning activity are stored to run it.</span></label></div>
      <button class="btn orange block" type="submit">Create account</button></form>`;
    document.getElementById('f').onsubmit = async ev => {
      ev.preventDefault(); ev.target.querySelector('button').disabled = true;
      const r = await Server.register({ name: val('n'), classId: val('c'), contact: val('k'), password: val('p'), schoolCode: val('s'), consent: document.getElementById('cs').checked });
      if (!r.ok) return signup(r.error); otp('verify', r.contact, null, r);
    };
  }
  function otp(kind, contact, e, info) {
    const t = { verify: ['Verify your account', 'Enter the 6-digit code sent to ' + contact + '.'], transfer: ['Verify this new device', 'This account is registered to another device. Enter the 6-digit code sent to ' + contact + ' to move it here. The old device will be signed out.'] }[kind];
    panel.innerHTML = `${e ? errBox(e) : ''}<h2 style="text-align:left">${t[0]}</h2><p class="muted">${esc(t[1])}</p>${info && info.sent ? '<div class="alert ok small" style="margin-bottom:12px">Code sent by ' + (info.via === 'email' ? 'email (check Spam too)' : 'SMS') + '. It can take up to a minute to arrive.</div>' : ''}
      <form id="o"><div class="field"><label for="code">6-digit code</label><input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div>
      <button class="btn orange block" type="submit">Continue</button></form><p class="center small"><a href="#" id="again">Send a new code</a> · <a href="#" id="back">Back</a></p>`;
    document.getElementById('o').onsubmit = async ev => {
      ev.preventDefault(); ev.target.querySelector('button').disabled = true; const c = val('code');
      const r = kind === 'verify' ? await Server.verifyRegistration(contact, c) : await Server.completeTransfer(contact, c);
      if (!r.ok) return otp(kind, contact, r.error); location.href = r.role === 'student' ? 'dashboard.html' : 'admin.html';
    };
    document.getElementById('again').onclick = async ev => { ev.preventDefault(); const r = await Server.resendCode(contact, kind); if (!r.ok) return otp(kind, contact, r.error); otp(kind, contact, null, r); };
    document.getElementById('back').onclick = ev => { ev.preventDefault(); sel('in'); };
  }
  function forgot(e, contact, sent) {
    if (!sent) {
      panel.innerHTML = `${e ? errBox(e) : ''}<h2 style="text-align:left">Reset your password</h2><p class="muted">Enter the phone number or email you registered with. We will send you a 6-digit code.</p><form id="f" novalidate><div class="field"><label for="k">Phone number or email</label><input id="k" autocomplete="username" inputmode="email" value="${esc(contact || '')}" required></div><button class="btn orange block" type="submit">Send code</button></form><p class="center small"><a href="#" id="back">Back to log in</a></p>`;
      document.getElementById('f').onsubmit = async ev => { ev.preventDefault(); ev.target.querySelector('button').disabled = true; const r = await Server.requestReset(val('k')); if (!r.ok) return forgot(r.error, val('k')); forgot(null, r.contact, true); };
    } else {
      panel.innerHTML = `${e ? errBox(e) : ''}<h2 style="text-align:left">Choose a new password</h2><p class="muted">If an account exists for ${esc(contact)}, a code was sent to it.</p><form id="f" novalidate><div class="field"><label for="code">6-digit code</label><input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div><div class="field"><label for="p">New password</label><input id="p" type="password" autocomplete="new-password" required><div class="hint">At least 8 characters, with letters and numbers.</div></div><button class="btn orange block" type="submit">Change password</button></form><p class="center small"><a href="#" id="back">Back to log in</a></p>`;
      document.getElementById('f').onsubmit = async ev => { ev.preventDefault(); ev.target.querySelector('button').disabled = true; const r = await Server.resetPassword(contact, val('code'), val('p')); if (!r.ok) return forgot(r.error, contact, true); login(null, 'Password changed. Log in with your new password.'); };
    }
    document.getElementById('back').onclick = ev => { ev.preventDefault(); login(); };
  }
  function login(e, note) {
    panel.innerHTML = `${e ? errBox(e) : ''}${note ? '<div class="alert ok small" style="margin-bottom:12px">' + esc(note) + '</div>' : ''}<form id="f" novalidate>
      <div class="field"><label for="k">Phone number or email</label><input id="k" autocomplete="username" inputmode="email" required></div>
      <div class="field"><label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required></div>
      <button class="btn orange block" type="submit">Log in</button></form><p class="center small"><a href="#" id="fg">Forgot your password?</a></p>`;
    document.getElementById('fg').onclick = ev => { ev.preventDefault(); forgot(); };
    document.getElementById('f').onsubmit = async ev => {
      ev.preventDefault(); ev.target.querySelector('button').disabled = true; const r = await Server.login(val('k'), val('p'));
      if (!r.ok) return login(r.error);
      if (r.needsVerify) return otp('verify', r.contact, null, r);
      if (r.needsTransfer) return otp('transfer', r.contact, null, r);
      location.href = r.role === 'student' ? 'dashboard.html' : 'admin.html';
    };
  }
  signup(); if (new URLSearchParams(location.search).get('forgot')) { sel('in'); forgot(); }
})();

}

/* ---- page: dashboard ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'dashboard') {
(async function () {
  const { Server, esc, fmtMs, fmtUGX, fmtDate, toast } = USL;
  const ctx = await USL.boot({ page: 'dashboard' }); const u = ctx.user, main = document.getElementById('main');
  const db = Server.data();
  if (u.role === 'teacher') { location.replace('teacher.html'); return; }
  if (u.role !== 'student') {
    main.innerHTML = '<h1>Hello, ' + esc(u.name) + '</h1><div class="card"><p>You are signed in as <b>' + esc(u.role) + '</b>.</p><a class="btn orange" href="admin.html">Open the admin area</a></div>'; return;
  }
  const cls = db.classes.find(c => c.id === u.classId) || db.classes[0];
  const subjects = db.subjects.filter(s => s.classes.includes(cls.id) && (!u.subjects.length || u.subjects.includes(s.id)));
  const progress = Server.progress(), attempts = Server.myAttempts(), weak = Server.weakTopics();
  const lessonsFor = db.lessons.filter(l => l.status === 'published' && l.cls === cls.id);
  const done = Object.entries(progress).filter(([, p]) => p.completed).length;
  const quizzes = Object.values(progress).filter(p => p.quiz); const avg = quizzes.length ? Math.round(quizzes.reduce((s, p) => s + p.quiz.score / p.quiz.total, 0) / quizzes.length * 100) : null;
  const sameDay = t => t && new Date(t).toDateString() === new Date().toDateString();
  const todayDone = Object.values(progress).filter(p => p.completed && sameDay(p.updatedAt)).length;
  const recent = Object.entries(progress).filter(([, p]) => p.lastOpen || p.updatedAt).sort((a, b) => (b[1].lastOpen || b[1].updatedAt) - (a[1].lastOpen || a[1].updatedAt)).map(([id]) => db.lessons.find(l => l.id === id)).filter(l => l && l.status === 'published').slice(0, 5);
  const next = recent[0] ? (lessonsFor.find(l => !(progress[l.id] || {}).completed) || recent[0]) : lessonsFor[0];
  const notes = Server.notifications().filter(n => !n.read);
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;

  function accessCard() {
    const a = Server.access(u), cfg = Server.cfg();
    if (a.state === 'paid') return '<div class="card"><span class="badge ok">Subscribed</span><h3 style="margin-top:8px">Your plan is active</h3><p class="muted mb0">Access until <b>' + fmtDate(a.expires) + '</b> (' + fmtMs(a.msLeft) + ' left).</p></div>';
    if (a.state === 'trial') return '<div class="card accent"><span class="badge warn">Free trial running</span><h3 style="margin-top:8px"><span id="cd">' + fmtMs(a.msLeft) + '</span> left</h3><p class="mb0 small">After the trial, subscribe for ' + fmtUGX(cfg.price) + ' per month to keep going.</p></div>';
    if (a.state === 'trial_ready') return '<div class="card accent"><span class="badge orange">Free trial available</span><h3 style="margin-top:8px">Try everything for ' + cfg.trialMinutes + ' minutes</h3><p class="small">The timer starts when you press the button and cannot be reset or restarted.</p><button class="btn orange" id="trial">Start my free trial</button></div>';
    return '<div class="card accent"><span class="badge bad">' + (a.hadSub ? 'Subscription ended' : 'Trial ended') + '</span><h3 style="margin-top:8px">Subscribe to continue</h3><p class="small">' + fmtUGX(cfg.price) + ' for ' + cfg.days + ' days. Your progress is saved.</p><a class="btn orange" href="subscription.html">Subscribe now</a></div>';
  }

  main.innerHTML = `
    <div class="row between"><div><p class="muted mb0">Welcome back</p><h1 class="mb0">${esc(u.name.split(' ')[0])}</h1></div><span class="clsbadge" style="--c:${cls.color}">${esc(cls.id)} · ${esc(cls.name)}</span></div>
    <p class="muted">${esc(cls.focus)}</p>
    ${notes.length ? '<div class="alert info" role="status" style="margin-bottom:14px">' + notes.slice(0, 3).map(n => '• ' + esc(n.msg)).join('<br>') + ' <a href="#" id="dismiss">Dismiss</a></div>' : ''}
    <div class="grid g2" style="margin-bottom:14px">
      <div id="access">${accessCard()}</div>
      <div class="card"><div class="row between"><h3 class="mb0">Daily goal</h3><span class="small muted">${Math.min(todayDone, u.dailyGoal)} / ${u.dailyGoal} lessons today</span></div>
        <div class="progress mt" role="progressbar" aria-valuemin="0" aria-valuemax="${u.dailyGoal}" aria-valuenow="${Math.min(todayDone, u.dailyGoal)}"><i style="width:${Math.min(100, todayDone / u.dailyGoal * 100)}%"></i></div>
        <p class="small muted mt mb0">${todayDone >= u.dailyGoal ? 'Goal reached — well done! 🎉' : 'Finish a lesson quiz to count it. Change your goal in Account.'}</p></div>
    </div>
    <div class="grid g4 g-keep2" style="margin-bottom:14px">
      <div class="stat"><b>${done}</b><span>Topics completed</span></div><div class="stat"><b>${avg == null ? '—' : avg + '%'}</b><span>Average quiz score</span></div>
      <div class="stat"><b>${attempts.filter(a => a.status === 'submitted').length}</b><span>Papers practised</span></div><div class="stat"><b>${Server.aiLeft()}</b><span>Tutor questions left today</span></div>
    </div>
    <div class="grid g2">
      <div class="card"><h3>Continue learning</h3>${next ? '<p class="mb0"><b>' + esc(next.title) + '</b><br><span class="muted small">' + esc(subName(next.subject)) + ' · ' + esc(next.topic) + '</span></p><a class="btn orange mt" href="lesson.html?id=' + encodeURIComponent(next.id) + '">' + (progress[next.id] ? 'Resume' : 'Start') + ' lesson</a>' : '<p class="muted mb0">No lessons have been published for your class yet.</p>'}</div>
      <div class="card"><h3>AI voice tutor</h3><p class="muted">Ask a question by voice or text and hear the explanation, using your class notes.</p><a class="btn" href="tutor.html">🎙️ Talk to the tutor</a></div>
    </div>
    <div class="card clscard mt" style="--c:${cls.color}"><div class="row between"><div><h3 class="mb0">💬 ${esc(cls.id)} discussion room</h3><p class="muted mb0">Chat with your classmates, send voice notes and follow lessons that go live.</p></div><a class="btn" href="discuss.html">Open room</a></div></div>
    <h2 class="mt2">Your subjects</h2>
    <div class="grid auto">${subjects.map(s => { const n = lessonsFor.filter(l => l.subject === s.id).length; return '<a class="subject-card" href="library.html?cls=' + cls.id + '&subject=' + s.id + '"><b>' + esc(s.name) + '</b><br><span class="muted small">' + n + ' lesson' + (n === 1 ? '' : 's') + ' available</span></a>'; }).join('') || '<p class="muted">No subjects set up for this class.</p>'}</div>
    <div class="grid g2 mt2">
      <div><h2>Recent lessons</h2><div class="card"><ul class="list">${recent.map(l => '<li class="item"><span><a href="lesson.html?id=' + encodeURIComponent(l.id) + '">' + esc(l.title) + '</a><br><span class="muted small">' + esc(subName(l.subject)) + '</span></span>' + (progress[l.id] && progress[l.id].completed ? '<span class="badge ok">Done</span>' : '<span class="badge">Open</span>') + '</li>').join('') || '<li class="muted">Nothing yet — open a lesson from the Library.</li>'}</ul></div></div>
      <div><h2>Weak topics</h2><div class="card">${weak.length ? '<ul class="list">' + weak.slice(0, 5).map(w => { const l = db.lessons.find(x => x.topic === w.topic && x.subject === w.subject && x.status === 'published'); return '<li><div class="item"><span><b>' + esc(w.topic) + '</b><br><span class="muted small">' + esc(subName(w.subject)) + ' · ' + w.pct + '% (' + w.got + '/' + w.max + ')</span></span>' + (l ? '<a class="btn sm ghost" href="lesson.html?id=' + encodeURIComponent(l.id) + '">Revise</a>' : '') + '</div></li>'; }).join('') + '</ul>' : '<p class="muted mb0">Take lesson quizzes or practise papers and your weakest topics will appear here.</p>'}</div></div>
    </div>
    <h2 class="mt2">Past-paper practice</h2>
    <div class="card"><ul class="list">${attempts.slice(0, 5).map(a => { const p = db.papers.find(x => x.id === a.paperId); if (!p) return ''; const o = a.objective; return '<li class="item"><span><b>' + esc(p.title) + '</b><br><span class="muted small">' + fmtDate(a.startedAt) + '</span></span>' + (a.status === 'in_progress' ? '<a class="btn sm orange" href="exam.html?paper=' + encodeURIComponent(p.id) + '">Resume</a>' : '<a class="btn sm ghost" href="exam.html?attempt=' + encodeURIComponent(a.id) + '">' + (o && o.scored ? o.got + '/' + o.max + ' · ' : '') + 'Results</a>') + '</li>'; }).join('') || '<li class="muted">You have not tried a paper yet. <a href="papers.html">Open the Exam centre</a>.</li>'}</ul></div>`;

  const t = document.getElementById('trial');
  if (t) t.onclick = async () => { t.disabled = true; const r = await Server.startTrial(); t.disabled = false; if (!r.ok) return toast(r.error, 'bad'); toast('Your free trial has started. Make the most of it!', 'ok'); setTimeout(() => location.reload(), 600); };
  const d = document.getElementById('dismiss'); if (d) d.onclick = e => { e.preventDefault(); Server.markNotificationsRead().then(() => location.reload()); };
  window.addEventListener('usl:tick', e => { const cd = document.getElementById('cd'); if (cd && e.detail.state === 'trial') cd.textContent = fmtMs(e.detail.msLeft); if (e.detail.state === 'expired' && cd) location.reload(); });
})();

}

/* ---- page: library ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'library') {
(async function () {
  const { Server, esc } = USL;
  const ctx = await USL.boot({ page: 'library' }); const u = ctx.user, main = document.getElementById('main');
  const db = Server.data(), q = new URLSearchParams(location.search);
  const sc = Server.scope(); const myClasses = db.classes.filter(k => sc.unrestricted || sc.classes.includes(k.id)); const okSub = (c, s) => sc.unrestricted || sc.pairs.some(x => x.cls === c && x.subject === s);
  let cls = q.get('cls') || u.classId || 'S1', subj = q.get('subject') || '';
  if (!myClasses.find(c => c.id === cls)) cls = (myClasses[0] || db.classes[0]).id;
  if (!myClasses.length) { main.innerHTML = '<h1>My notes</h1><div class="card"><p class="mb0">No classes have been assigned to you yet. Ask the administrator to assign your classes and subjects.</p></div>'; return; }
  const progress = Server.progress(); const a = Server.access(u); const open = USL.allowed(a);

  function render() {
    const c = db.classes.find(x => x.id === cls), subs = db.subjects.filter(s => s.classes.includes(cls) && okSub(cls, s.id));
    if (subj && !subs.find(s => s.id === subj)) subj = '';
    const lessons = db.lessons.filter(l => l.status === 'published' && l.cls === cls);
    const doneN = lessons.filter(l => (progress[l.id] || {}).completed).length;
    let html = `<h1>${sc.unrestricted ? 'Class library' : 'My notes'}</h1>
      <div class="tabs" role="tablist" aria-label="Class">${myClasses.map(k => '<button class="tab cls" style="--c:' + esc(k.color) + '" role="tab" data-c="' + esc(k.id) + '" aria-selected="' + (k.id === cls) + '">' + esc(k.id) + (k.id === u.classId ? ' ★' : '') + '</button>').join('')}</div>
      <div class="clsbanner" style="--c:${c.color}"><div class="row between"><div><h2>${esc(c.id)} · ${esc(c.name)}</h2><p>${esc(c.focus)}</p></div><div class="right"><b>${doneN}/${lessons.length}</b><br><span class="small">lessons completed</span></div></div></div>
      ${!open ? '<div class="alert warn mt" role="status">' + (a.state === 'trial_ready' ? 'You can browse the syllabus freely. To open lessons, <a href="subscription.html">start your free 15-minute trial</a>.' : 'Your access has ended. <a href="subscription.html">Subscribe</a> to open lessons.') + '</div>' : ''}
      <h2 class="mt2">Subjects</h2><div class="grid auto">${subs.map(s => { const n = lessons.filter(l => l.subject === s.id).length; return '<button class="subject-card" data-s="' + s.id + '" aria-pressed="' + (s.id === subj) + '"><b>' + esc(s.name) + '</b><br><span class="muted small">' + n + ' lesson' + (n === 1 ? '' : 's') + '</span></button>'; }).join('') || '<p class="muted">No subjects have been set up for this class.</p>'}</div>`;
    if (subj) {
      const s = subs.find(x => x.id === subj), sy = db.syllabus.find(x => x.classId === cls && x.subjectId === subj) || {};
      const ls = lessons.filter(l => l.subject === subj), topics = [...new Set(ls.map(l => l.topic))];
      html += `<h2 class="mt2">${esc(s.name)} · ${esc(cls)}</h2>
        <div class="card soft"><p class="small mb0"><b>Syllabus reference:</b> ${sy.ref ? esc(sy.ref) + (sy.version ? ' · version ' + esc(sy.version) : '') : '<span class="muted">Official NCDC reference not entered yet. An administrator adds it under Admin → Catalogue.</span>'}${sy.note ? '<br>' + esc(sy.note) : ''}</p></div>
        <div class="stack mt">${topics.map(t => '<div class="card"><h3>' + esc(t) + '</h3><ul class="list">' + ls.filter(l => l.topic === t).map(l => { const p = progress[l.id] || {}; return '<li class="item"><span><a href="lesson.html?id=' + encodeURIComponent(l.id) + '"><b>' + esc(l.title) + '</b></a><br><span class="muted small">' + esc(l.subtopic || '') + '</span> ' + (l.review === 'sample' ? '<span class="badge warn">Sample notes</span>' : l.review === 'reviewed' ? '<span class="badge ok">Reviewed</span>' : '') + '</span><span>' + (p.completed ? '<span class="badge ok">Done' + (p.quiz ? ' · ' + p.quiz.score + '/' + p.quiz.total : '') + '</span>' : open ? '<span class="badge">Not started</span>' : '<span class="badge">🔒</span>') + '</span></li>'; }).join('') + '</ul></div>').join('') || '<div class="card"><p class="muted mb0">No lessons have been published for this subject yet. Content is added by teachers and approved by a reviewer before students can see it.</p></div>'}</div>`;
    }
    main.innerHTML = html;
    main.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cls = b.dataset.c; subj = ''; history.replaceState(null, '', '?cls=' + cls); render(); });
    main.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { subj = b.dataset.s; history.replaceState(null, '', '?cls=' + cls + '&subject=' + subj); render() });
  }
  render();
})();

}

/* ---- page: lesson ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'lesson') {
(async function () {
  const { Server, esc, toast, Speech } = USL;
  const ctx = await USL.boot({ page: 'library', paid: true }); const main = document.getElementById('main');
  const id = new URLSearchParams(location.search).get('id'); const r = Server.getLesson(id);
  if (!r.ok) { main.innerHTML = '<div class="card"><h2>Lesson unavailable</h2><p>' + esc(r.error) + '</p><a class="btn" href="library.html">Back to library</a></div>'; return; }
  const l = r.lesson, db = Server.data(), c = db.classes.find(x => x.id === l.cls), s = db.subjects.find(x => x.id === l.subject);
  Server.touchLesson(l.id);
  const prog = Server.progress()[l.id] || {};
  const siblings = db.lessons.filter(x => x.status === 'published' && x.cls === l.cls && x.subject === l.subject); const idx = siblings.findIndex(x => x.id === l.id), nxt = siblings[idx + 1];
  const readText = () => [l.title + '.', 'Learning outcomes. ' + (l.objectives || []).join('. ') + '.', USL.plain(l.notes), 'Worked example. ' + USL.plain(l.example)].join(' ');
  const badge = l.review === 'sample' ? '<span class="badge warn">Sample notes – not official NCDC text</span>' : l.review === 'reviewed' ? '<span class="badge ok">Reviewed by a teacher/reviewer</span>' : '<span class="badge">Awaiting review</span>';

  main.innerHTML = `<p class="crumbs"><a href="library.html?cls=${esc(l.cls)}">${esc(l.cls)}</a> › <a href="library.html?cls=${esc(l.cls)}&subject=${esc(l.subject)}">${esc(s ? s.name : l.subject)}</a> › ${esc(l.topic)}${l.subtopic ? ' › ' + esc(l.subtopic) : ''}</p>
    <h1>${esc(l.title)}</h1><p>${badge} <span class="badge">Source: ${esc(l.source)}</span></p>
    <div class="card soft" id="speech" aria-label="Listen to this lesson"></div>
    <div class="card mt"><h3>Learning outcomes</h3><ul>${(l.objectives || []).map(o => '<li>' + esc(o) + '</li>').join('')}</ul></div>
    <article class="card mt notes"><h2>Notes</h2>${l.notes}<h3>Worked example</h3><div class="box">${esc(l.example)}</div></article>
    <div class="card mt" id="quizcard"><div class="row between"><h2 class="mb0">Quick quiz</h2><span class="muted small">${(l.quiz || []).length} questions</span></div><div id="quiz" class="mt"></div></div>
    <div class="row mt"><a class="btn orange" href="tutor.html?cls=${esc(l.cls)}&subject=${esc(l.subject)}&q=${encodeURIComponent(l.topic)}">🎙️ Ask the tutor about this</a>${nxt ? '<a class="btn ghost" href="lesson.html?id=' + encodeURIComponent(nxt.id) + '">Next lesson →</a>' : ''}<button class="btn ghost" id="mark">${prog.completed ? '✓ Completed' : 'Mark as complete'}</button></div>`;
  Speech.bar(document.getElementById('speech'), readText);

  const quizEl = document.getElementById('quiz'); const answers = {};
  function renderQuiz(done) {
    quizEl.innerHTML = (l.quiz || []).map((q, i) => '<fieldset style="border:0;padding:0;margin:0 0 16px"><legend><b>' + (i + 1) + '. ' + esc(q.q) + '</b></legend>' + q.o.map((o, k) => {
      let cl = 'opt'; if (done) { if (k === q.a) cl += ' right'; else if (answers[i] === k) cl += ' wrong'; } else if (answers[i] === k) cl += ' sel';
      return '<label class="' + cl + '"><input type="radio" name="q' + i + '" value="' + k + '"' + (answers[i] === k ? ' checked' : '') + (done ? ' disabled' : '') + '><span>' + esc(o) + '</span></label>';
    }).join('') + '</fieldset>').join('') + (done ? '' : '<button class="btn orange" id="sub">Check my answers</button>');
    if (!done) { quizEl.querySelectorAll('input').forEach(inp => inp.onchange = () => { answers[+inp.name.slice(1)] = +inp.value; renderQuiz(false); }); const sb = document.getElementById('sub'); sb.onclick = submit; }
  }
  async function submit() {
    const n = (l.quiz || []).length; if (Object.keys(answers).length < n) return toast('Answer all ' + n + ' questions first.', 'bad');
    const score = l.quiz.filter((q, i) => answers[i] === q.a).length; const r = await Server.saveQuiz(l.id, score, n); if (!r.ok) return toast(r.error, 'bad');
    renderQuiz(true); const pct = Math.round(score / n * 100);
    quizEl.insertAdjacentHTML('afterbegin', '<div class="alert ' + (pct >= 67 ? 'ok' : 'warn') + '" role="status" style="margin-bottom:14px"><b>You scored ' + score + ' out of ' + n + ' (' + pct + '%).</b> ' + (pct >= 67 ? 'Great work!' : 'Re-read the notes or ask the tutor to explain.') + '</div>');
    document.getElementById('mark').textContent = '✓ Completed';
  }
  if (!(l.quiz || []).length) quizEl.innerHTML = '<p class="muted">No quiz for this lesson yet.</p>'; else renderQuiz(false);
  document.getElementById('mark').onclick = e => { const now = !(Server.progress()[l.id] || {}).completed; Server.markComplete(l.id, now).then(r => { if (r && r.error) toast(r.error, 'bad'); }); e.target.textContent = now ? '✓ Completed' : 'Mark as complete'; toast(now ? 'Lesson marked complete.' : 'Marked as not complete.', 'ok'); };
  window.addEventListener('beforeunload', () => Speech.stop());
})();

}

/* ---- page: tutor ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'tutor') {
(async function () {
  const { Server, AI, Speech, Remote, esc, toast } = USL;
  await Remote.init(); Speech.cloud = !!(Remote.features && Remote.features.tts);
  const ctx = await USL.boot({ page: 'tutor', paid: true }); const u = ctx.user, main = document.getElementById('main');
  const db = Server.data(), qs = new URLSearchParams(location.search);
  let cls = qs.get('cls') || u.classId || 'S4', subj = qs.get('subject') || '';
  if (!db.classes.find(c => c.id === cls)) cls = db.classes[0].id;
  let lastLesson = null, lastBot = '', quiz = null, rec = null;
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;

  main.innerHTML = `<h1>AI voice tutor</h1>
    <p class="muted">The tutor answers from the approved notes for the class and subject you choose. If the notes don't cover your question, it searches the web (with safe search on) and shows you the sources, so you can check them.</p>
    <div class="grid g3" style="margin-bottom:12px">
      <div><label for="cls">Class</label><select id="cls">${db.classes.map(c => '<option value="' + c.id + '"' + (c.id === cls ? ' selected' : '') + '>' + esc(c.id + ' – ' + c.name) + '</option>').join('')}</select></div>
      <div><label for="sub">Subject</label><select id="sub"></select></div>
      <div><label class="check" style="margin-top:28px"><input type="checkbox" id="spk"><span>Speak the answers</span></label><label class="check"><input type="checkbox" id="web" checked><span>Also search the web</span></label></div>
    </div>
    <div id="chat" class="chat" role="log" aria-live="polite" aria-label="Conversation"></div>
    <div class="chips mt" aria-label="Quick actions"><button class="chip" data-a="simple">💡 Explain simply</button><button class="chip" data-a="example">🧮 Give an example</button><button class="chip" data-a="quiz">🎯 Quiz me (oral)</button><button class="chip" data-a="weak">🔁 Revise my weak topics</button></div>
    <form id="form" class="row mt" style="flex-wrap:nowrap"><button type="button" class="mic" id="mic" aria-label="Ask by voice" title="Ask by voice">🎤</button><input id="txt" placeholder="Type or speak your question…" aria-label="Your question" autocomplete="off"><button class="btn orange" type="submit">Send</button></form>
    <div class="card soft mt"><div id="speech"></div><p class="hint mb0" id="left"></p></div>
    <p class="hint">The tutor can make mistakes. Check important facts in your notes and with your teacher. Answers shown are taken from in-app lessons${'' /* production: LLM behind your server */}.</p>`;

  const chat = document.getElementById('chat'), txt = document.getElementById('txt'), spk = document.getElementById('spk');
  const webBox = document.getElementById('web'); webBox.checked = USL.LS.getItem('usl_web') !== '0'; webBox.onchange = () => USL.LS.setItem('usl_web', webBox.checked ? '1' : '0');
  spk.checked = Speech.supported() && USL.LS.getItem('usl_spk') !== '0'; spk.disabled = !Speech.supported();
  spk.onchange = () => USL.LS.setItem('usl_spk', spk.checked ? '1' : '0');
  Speech.bar(document.getElementById('speech'), () => lastBot);
  const left = () => { document.getElementById('left').textContent = 'Tutor questions left today: ' + Server.aiLeft() + ' (limits keep the service affordable for everyone).'; }; left();

  function fillSubjects() {
    const subs = db.subjects.filter(s => s.classes.includes(cls)); if (subj && !subs.find(s => s.id === subj)) subj = '';
    document.getElementById('sub').innerHTML = '<option value="">All subjects</option>' + subs.map(s => '<option value="' + s.id + '"' + (s.id === subj ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
  }
  fillSubjects();
  document.getElementById('cls').onchange = e => { cls = e.target.value; subj = ''; lastLesson = null; quiz = null; fillSubjects(); };
  document.getElementById('sub').onchange = e => { subj = e.target.value; lastLesson = null; quiz = null; };

  function say(who, html, plainText) {
    const b = document.createElement('div'); b.className = 'bubble ' + who; b.innerHTML = html; chat.appendChild(b); chat.scrollTop = chat.scrollHeight;
    if (who === 'bot' && plainText) { lastBot = plainText; if (spk.checked) Speech.speak(plainText); }
  }
  const src = l => '<span class="src">Source: <a href="lesson.html?id=' + encodeURIComponent(l.id) + '">' + esc(l.title) + '</a> (' + esc(l.cls) + ' · ' + esc(subName(l.subject)) + ') — ' + (l.review === 'sample' ? 'sample notes, not official' : 'reviewed notes') + '.</span>';
  const bot = (text, l) => say('bot', esc(text) + (l ? src(l) : ''), text);
  const use = async text => { const r = await Server.aiUse(text.length); if (!r.ok) { say('bot', esc(r.error)); return false; } left(); return true; };

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  async function askQuiz(weakOnly) {
    const weak = weakOnly ? Server.weakTopics() : []; if (weakOnly && !weak.length) say('bot', 'You have no weak topics yet, so here is a mixed question instead.');
    const pick = AI.quizQuestion(cls, subj, weak); if (!pick) return say('bot', 'There are no quiz questions for this class and subject yet.');
    if (!(await use('quiz'))) return; quiz = pick;
    const t = 'Question: ' + pick.q.q + ' ' + pick.q.o.map((o, i) => 'Option ' + letters[i] + ': ' + o + '.').join(' ');
    say('bot', '<b>Question</b> (' + esc(pick.l.topic) + ')<br>' + esc(pick.q.q) + '<br>' + pick.q.o.map((o, i) => '<br><b>' + letters[i] + '.</b> ' + esc(o)).join('') + '<br><br><i>Say or type the letter, or "stop" to end.</i>', t);
  }
  async function judge(text) {
    const t = text.trim().toLowerCase(); if (/^(stop|exit|quit|end)/.test(t)) { quiz = null; return bot('OK, quiz ended. Ask me anything or press "Quiz me" again.'); }
    if (/^(next|another|again)/.test(t)) return askQuiz(false);
    const { q, l } = quiz; let k = q.o.findIndex(o => t === o.toLowerCase() || t.includes(o.toLowerCase()));
    if (k < 0) { const say1 = { be: 'b', bee: 'b', see: 'c', sea: 'c', dee: 'd', ay: 'a' }; const m = t.replace(/[.,!?]/g, '').match(/^(?:it is |its |i think |option |answer |letter |number )*([a-f]|be|bee|see|sea|dee|ay|[1-6])$/); if (m) { const x = say1[m[1]] || m[1]; k = /\d/.test(x) ? +x - 1 : x.charCodeAt(0) - 97; } }
    if (k < 0 || k >= q.o.length) return bot('I did not catch an option. Say or type A, B, C or D — or "stop".');
    if (!(await use('judge'))) return; const ok = k === q.a;
    const why = USL.plain(l.notes).match(/[^.!?]+[.!?]+/g) || []; const reply = (ok ? 'Correct! ' : 'Not quite. The correct answer is ' + letters[q.a] + ': ' + q.o[q.a] + '. ') + 'From the notes: ' + why.slice(0, 2).join(' ').trim() + ' Say "next" for another question, or "stop".';
    quiz.answered = true; bot(reply, l);
  }
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  async function webAnswer(text, fallback) {
    const wait = document.createElement('div'); wait.className = 'bubble bot'; wait.textContent = 'Not in your notes. Searching the web…'; chat.appendChild(wait); chat.scrollTop = chat.scrollHeight;
    let j = null; try { const r = await fetch('api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: USL.LS.getItem('usl_pass') || '', q: text, cls, subject: subName(subj) }) }); j = await r.json(); if (!r.ok) j = { ok: false, error: j && j.error }; } catch (e) { j = null; }
    wait.remove();
    if (!j || !j.ok || !j.results || !j.results.length) return bot(!j ? fallback + ' (Web search needs the live site: it is not available when the page is opened as a file or on GitHub Pages.)' : (j.error || fallback));
    lastLesson = null; const eng = j.engine === 'google' ? 'Google' : 'Wikipedia';
    const body = j.answer || j.results.slice(0, 2).map(x => x.snippet).join(' ');
    const links = '<span class="src">From the web (' + eng + ', not checked by your teachers): ' + j.results.slice(0, 4).map((x, i) => '[' + (i + 1) + '] <a href="' + esc(x.link) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title) + '</a> (' + esc(host(x.link)) + ')').join(' · ') + '</span>';
    say('bot', esc(body) + links, body);
  }
  async function ask(text, mode) {
    text = text.trim(); if (!text) return; say('me', esc(text)); txt.value = '';
    if (/\b(suicide|kill myself|self.?harm|hurt myself|abuse|rape)\b/i.test(text)) return bot('I am sorry you are going through something hard. Please talk to a trusted adult, a teacher or a counsellor today. In Uganda you can call the Sauti Child Helpline on 116. I can only help with schoolwork here.');
    if (quiz && !mode) return judge(text);
    if (!mode && /\bquiz\b|test me/i.test(text)) return askQuiz(false);
    if (!mode && lastLesson && text.split(/\s+/).length <= 5) { if (/example/i.test(text)) mode = 'example'; else if (/simpl|easier|again/i.test(text)) mode = 'simple'; }
    if (!(await use(text))) return;
    const follow = mode && lastLesson && (mode === 'example' || mode === 'simple');
    const res = follow ? AI.answer(lastLesson.title + ' ' + lastLesson.topic, { classId: cls, subjectId: lastLesson.subject, mode }) : AI.answer(text, { classId: cls, subjectId: subj, mode });
    if (res.found) { lastLesson = res.lesson; bot(res.text, res.lesson); }
    else if (webBox.checked && !mode) await webAnswer(text, res.text); else bot(res.text);
  }
  document.getElementById('form').onsubmit = e => { e.preventDefault(); ask(txt.value); };
  document.querySelector('.chips').onclick = e => {
    const a = e.target.closest('button') && e.target.closest('button').dataset.a; if (!a) return;
    if (a === 'quiz') { say('me', 'Quiz me'); return askQuiz(false); } if (a === 'weak') { say('me', 'Revise my weak topics'); return askQuiz(true); }
    if (!lastLesson) return say('bot', 'Ask a question about a topic first, then I can explain it simply or give an example.');
    quiz = null; ask(a === 'simple' ? 'Explain simply' : 'Give an example', a);
  };
  const mic = document.getElementById('mic');
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) { mic.disabled = true; mic.title = 'Voice input is not supported in this browser — use the text box.'; }
  mic.onclick = () => {
    if (rec) { rec.stop(); return; } Speech.stop(); mic.classList.add('on'); mic.setAttribute('aria-label', 'Stop listening');
    rec = Speech.listen(t => { txt.value = t; ask(t); }, () => { rec = null; mic.classList.remove('on'); mic.setAttribute('aria-label', 'Ask by voice'); }, er => toast(er === 'not-allowed' ? 'Microphone permission was denied. You can type instead.' : 'Voice input stopped (' + er + ').', 'bad'));
    if (!rec) mic.classList.remove('on');
  };

  bot('Hello ' + u.name.split(' ')[0] + '! Ask me about a topic in your notes, or press "Quiz me" and I will ask you questions aloud.');
  const q0 = qs.get('q'); if (q0) ask('Explain ' + q0);
  window.addEventListener('beforeunload', () => Speech.stop());
})();

}

/* ---- page: papers ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'papers') {
(async function () {
  const { Server, esc, modal } = USL;
  const ctx = await USL.boot({ page: 'papers' }); const u = ctx.user, main = document.getElementById('main');
  const db = Server.data(); const open = USL.allowed(Server.access(u));
  const sc = Server.scope(); const pubs = db.papers.filter(p => p.status === 'published' && (sc.unrestricted || sc.pairs.some(x => x.cls === p.cls && x.subject === p.subject)));
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;
  const verLabel = p => p.verified ? ['ok', 'Verified'] : p.category === 'AI-generated practice' ? ['warn', 'AI-generated practice · unverified'] : ['warn', 'Unverified'];
  const guideLabel = p => p.category === 'Official UNEB past paper' && p.verified ? 'Official marking scheme' : p.category === 'AI-generated practice' ? 'AI-generated answers — NOT officially verified' : p.verified ? 'Guide supplied by the source and checked by a platform reviewer' : 'Unverified guide';
  const uniq = (f, sort) => { const v = [...new Set(pubs.map(f))]; return sort ? v.sort(sort) : v.sort(); };
  const F = { q: '', level: '', cls: '', subject: '', year: '', paperNo: '', org: '', category: '', guide: '', ver: '' };
  const sel = (id, label, opts) => '<div><label for="f-' + id + '">' + label + '</label><select id="f-' + id + '" data-k="' + id + '"><option value="">Any</option>' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (F[id] === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></div>';

  main.innerHTML = `<h1>' + (sc.unrestricted ? 'Candidate exam centre' : 'Papers for my classes and subjects') + '</h1>
    ' + (sc.unrestricted ? '' : '<div class="alert info" role="status" style="margin-bottom:12px">You only see papers for the classes and subjects assigned to you. Your own uploads are under Teach → My uploads.</div>') + '<p class="muted">Practise UCE (S4) and UACE (S6) style papers. Only papers that exist and are approved for publishing are listed. Always check the label: <b>AI-generated practice is not an official UNEB paper.</b></p>
    <div class="card"><div class="field"><label for="f-q">Search</label><input id="f-q" data-k="q" type="search" placeholder="Title or subject…"></div>
      <div class="grid g4" id="filters"></div><div class="row mt"><button class="btn sm ghost" id="clear">Clear filters</button><span class="muted small" id="count"></span></div></div>
    <div id="list" class="grid auto mt" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))"></div>`;

  function filters() {
    document.getElementById('filters').innerHTML =
      sel('level', 'Level', uniq(p => p.level).map(v => [v, v === 'UCE' || v === 'UACE' ? v : v])) +
      sel('cls', 'Class', uniq(p => p.cls).map(v => [v, v])) +
      sel('subject', 'Subject', uniq(p => p.subject).map(v => [v, subName(v)])) +
      sel('year', 'Year', uniq(p => p.year, (a, b) => b - a).map(v => [v, v])) +
      sel('paperNo', 'Paper number', uniq(p => p.paperNo, (a, b) => a - b).map(v => [v, 'Paper ' + v])) +
      sel('org', 'Source organisation', uniq(p => p.org).map(v => [v, v])) +
      sel('category', 'Category', uniq(p => p.category).map(v => [v, v])) +
      sel('guide', 'Marking guide', [['yes', 'Available'], ['no', 'Not available']]) +
      sel('ver', 'Verification', [['verified', 'Verified'], ['unverified', 'Unverified'], ['ai', 'AI-generated practice']]);
    document.querySelectorAll('#filters select').forEach(s => s.onchange = () => { F[s.dataset.k] = s.value; list(); });
  }
  function match(p) {
    const q = F.q.trim().toLowerCase(); if (q && !(p.title + ' ' + subName(p.subject)).toLowerCase().includes(q)) return false;
    if (F.level && p.level !== F.level) return false; if (F.cls && p.cls !== F.cls) return false; if (F.subject && p.subject !== F.subject) return false;
    if (F.year && String(p.year) !== F.year) return false; if (F.paperNo && String(p.paperNo) !== F.paperNo) return false; if (F.org && p.org !== F.org) return false; if (F.category && p.category !== F.category) return false;
    if (F.guide === 'yes' && !p.hasGuide) return false; if (F.guide === 'no' && p.hasGuide) return false;
    if (F.ver === 'verified' && !p.verified) return false; if (F.ver === 'unverified' && (p.verified || p.category === 'AI-generated practice')) return false; if (F.ver === 'ai' && p.category !== 'AI-generated practice') return false;
    return true;
  }
  function list() {
    const rows = pubs.filter(match).sort((a, b) => b.year - a.year || a.cls.localeCompare(b.cls) || a.paperNo - b.paperNo);
    document.getElementById('count').textContent = rows.length + ' of ' + pubs.length + ' papers';
    const inprog = new Set(Server.myAttempts().filter(a => a.status === 'in_progress').map(a => a.paperId));
    document.getElementById('list').innerHTML = rows.map(p => {
      const [vc, vt] = verLabel(p), marks = p.questions.reduce((s, q) => s + q.marks, 0);
      return `<article class="card"><div class="row" style="gap:6px;margin-bottom:8px"><span class="badge info">${esc(p.level || p.cls)}</span><span class="clsbadge" style="--c:${USL.classColor(p.cls)}">${esc(p.cls)}</span><span class="badge">Paper ${p.paperNo}</span><span class="badge">${p.year}</span></div>
        <h3>${esc(p.title)}</h3><p class="small muted mb0">${esc(subName(p.subject))} · ${p.questions.length} questions · ${marks} marks · ${p.duration} min</p>
        <p class="small muted">${esc(p.category)} · ${esc(p.org)}</p>
        <p><span class="badge ${vc}">${vt}</span> <span class="badge ${p.hasGuide ? 'ok' : ''}">${p.hasGuide ? 'Marking guide' : 'No marking guide'}</span></p>
        <div class="row"><a class="btn orange sm" href="exam.html?paper=${encodeURIComponent(p.id)}">${inprog.has(p.id) ? 'Resume exam' : '⏱ Start timed exam'}</a><button class="btn ghost sm" data-g="${esc(p.id)}" ${p.hasGuide ? '' : 'disabled'}>Marking guide</button></div></article>`;
    }).join('') || '<div class="card"><p class="muted mb0">No papers match these filters. Papers are only listed once an administrator has confirmed the platform may distribute them.</p></div>';
    document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => guide(b.dataset.g));
  }
  function guide(id) {
    const r = Server.getPaper(id); if (!r.ok) return modal('<h3>Marking guide</h3><p>' + (open ? esc(r.error) : 'Marking guides are paid content. <a href="subscription.html">Start your free trial or subscribe</a> to view them.') + '</p><button class="btn" onclick="this.closest(\'.overlay\').remove()">Close</button>');
    const p = r.paper; const L = 'ABCDEF';
    modal('<h3>' + esc(p.title) + ' — marking guide</h3><div class="alert ' + (p.verified ? 'ok' : 'warn') + '" style="margin-bottom:12px"><b>' + esc(guideLabel(p)) + '</b></div>' + p.questions.map((q, i) => '<div class="card flat" style="margin-bottom:10px"><b>' + (i + 1) + '. ' + esc(q.text) + '</b> <span class="muted small">[' + q.marks + ' mark' + (q.marks > 1 ? 's' : '') + ' · ' + esc(q.topic) + ']</span><div class="model small">' + (q.type === 'mcq' ? (typeof q.a === 'number' ? 'Answer: <b>' + L[q.a] + '. ' + esc(q.o[q.a]) + '</b>' : 'No key supplied.') : (q.model ? esc(q.model).replace(/\n/g, '<br>') : 'No model answer supplied.')) + '</div></div>').join('') + '<button class="btn" onclick="this.closest(\'.overlay\').remove()">Close</button>', { wide: true });
  }
  filters(); list();
  document.getElementById('f-q').oninput = e => { F.q = e.target.value; list(); };
  document.getElementById('clear').onclick = () => { Object.keys(F).forEach(k => F[k] = ''); document.getElementById('f-q').value = ''; filters(); list(); };
})();

}

/* ---- page: exam ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'exam') {
(async function () {
  const { Server, Speech, esc, toast, fmtMs, fmtDate, confirmBox } = USL;
  const ctx = await USL.boot({ page: 'papers', paid: true }); const main = document.getElementById('main');
  const qs = new URLSearchParams(location.search), db = Server.data(), L = 'ABCDEF';
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;
  const aiNote = p => p.category === 'AI-generated practice' ? '<div class="alert warn" style="margin-bottom:12px"><b>AI-generated practice paper.</b> Questions and answers were produced for practice and have not been officially verified. This is not a UNEB paper.</div>' : '';
  const fail = m => { main.innerHTML = '<div class="card"><h2>Not available</h2><p>' + esc(m) + '</p><a class="btn" href="papers.html">Back to the exam centre</a></div>'; };

  if (qs.get('attempt')) return results(qs.get('attempt'));
  const pid = qs.get('paper'); if (!pid) return fail('No paper selected.');
  const pr = Server.getPaper(pid); if (!pr.ok) return fail(pr.error); const paper = pr.paper;
  const existing = Server.myAttempts().find(a => a.paperId === pid && a.status === 'in_progress' && a.startedAt + a.durationMs > Date.now());
  const marks = paper.questions.reduce((s, q) => s + q.marks, 0);

  main.innerHTML = `<p class="crumbs"><a href="papers.html">Exam centre</a> › ${esc(subName(paper.subject))}</p><h1>${esc(paper.title)}</h1>${aiNote(paper)}
    <div class="card"><div class="grid g4 g-keep2"><div class="stat"><b>${paper.duration} min</b><span>Time allowed</span></div><div class="stat"><b>${paper.questions.length}</b><span>Questions</span></div><div class="stat"><b>${marks}</b><span>Total marks</span></div><div class="stat"><b>Paper ${paper.paperNo}</b><span>${paper.year} · ${esc(paper.cls)}</span></div></div>
      <h3 class="mt">Instructions</h3><ul><li>${esc(paper.instructions)}</li><li>The timer starts when you press Start and keeps running even if you close the page.</li><li>Your answers are saved automatically. When time ends, the paper is submitted for you.</li><li>${paper.hasGuide ? 'Objective questions are marked automatically. For written questions you compare with the model answer and give yourself marks.' : 'This paper has no marking guide, so it cannot be scored here.'}</li><li>Scores here are for practice only — they are not UNEB results.</li></ul>
      <button class="btn orange" id="start">${existing ? 'Resume exam' : 'I understand — start exam'}</button> <a class="btn ghost" href="papers.html">Cancel</a></div>`;
  document.getElementById('start').onclick = async e => { e.target.disabled = true; const r = await Server.startAttempt(pid); e.target.disabled = false; if (!r.ok) return toast(r.error, 'bad'); run(r.attempt); };

  function run(att) {
    const qsn = paper.questions; let cur = 0, dirty = false, submitted = false; const ans = Object.assign({}, att.answers), flags = Object.assign({}, att.flags);
    const end = att.startedAt + att.durationMs;
    main.innerHTML = `<div class="examtop"><div><b>${esc(paper.title)}</b><br><span class="small muted" id="saved">Not saved yet</span></div><div class="row"><span class="timer" id="timer" role="timer" aria-label="Time remaining">--:--</span><button class="btn orange sm" id="submit">Submit</button></div></div>
      <div class="exam-layout"><div class="card" id="q"></div><aside class="card flat"><h3>Questions</h3><div class="qgrid" id="nav"></div><p class="hint">Orange = answered · outlined = flagged for review</p></aside></div>`;
    const isDone = i => { const q = qsn[i], a = ans[q.id]; return q.type === 'mcq' ? typeof a === 'number' : !!(a && String(a).trim()); };
    function draw() {
      const q = qsn[cur];
      document.getElementById('q').innerHTML = `<div class="row between"><span class="badge info">Question ${cur + 1} of ${qsn.length}</span><span class="small muted">${q.marks} mark${q.marks > 1 ? 's' : ''} · ${esc(q.topic)}</span></div>
        <h2 style="margin-top:12px">${esc(q.text)}</h2>
        ${q.type === 'mcq' ? q.o.map((o, i) => '<label class="opt' + (ans[q.id] === i ? ' sel' : '') + '"><input type="radio" name="o" value="' + i + '"' + (ans[q.id] === i ? ' checked' : '') + '><span><b>' + L[i] + '.</b> ' + esc(o) + '</span></label>').join('') : '<label for="w" class="small muted">Write your answer. Show your working where needed.</label><textarea id="w" rows="8">' + esc(ans[q.id] || '') + '</textarea>'}
        <div class="row between mt"><label class="check" style="margin:0"><input type="checkbox" id="fl"${flags[q.id] ? ' checked' : ''}><span>Flag for review</span></label><button class="btn ghost sm" id="rd">🔊 Read question aloud</button></div>
        <div class="row mt"><button class="btn ghost" id="prev"${cur === 0 ? ' disabled' : ''}>← Previous</button><button class="btn" id="next"${cur === qsn.length - 1 ? ' disabled' : ''}>Next →</button></div>`;
      document.getElementById('nav').innerHTML = qsn.map((x, i) => '<button class="qn' + (isDone(i) ? ' done' : '') + (i === cur ? ' cur' : '') + (flags[x.id] ? ' flag' : '') + '" data-i="' + i + '" aria-label="Question ' + (i + 1) + (isDone(i) ? ', answered' : '') + '">' + (i + 1) + '</button>').join('');
      document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { cur = +b.dataset.i; draw(); });
      document.querySelectorAll('input[name=o]').forEach(r => r.onchange = () => { ans[q.id] = +r.value; mark(); draw(); });
      const w = document.getElementById('w'); if (w) w.oninput = () => { ans[q.id] = w.value; mark(true); };
      document.getElementById('fl').onchange = e => { flags[q.id] = e.target.checked; mark(); draw(); };
      document.getElementById('prev').onclick = () => { cur--; draw(); }; document.getElementById('next').onclick = () => { cur++; draw(); };
      document.getElementById('rd').onclick = () => Speech.supported() ? Speech.speak('Question ' + (cur + 1) + '. ' + q.text + ' ' + (q.o || []).map((o, i) => 'Option ' + L[i] + ': ' + o + '.').join(' ')) : toast('Read-aloud is not supported in this browser.', 'bad');
    }
    let t0; const mark = soft => { dirty = true; clearTimeout(t0); t0 = setTimeout(save, 600); if (soft) { const n = document.querySelectorAll('#nav button'); n.forEach((b, i) => b.classList.toggle('done', isDone(i))); } };
    async function save() { if (!dirty || submitted) return; dirty = false; const r = await Server.saveAnswers(att.id, ans, flags); if (!r.ok) dirty = true; if (r.ok) { document.getElementById('saved').textContent = 'Saved ' + new Date(r.savedAt).toLocaleTimeString(); } else if (!/Time is up/.test(r.error)) document.getElementById('saved').textContent = r.error; }
    setInterval(save, 15000); window.addEventListener('beforeunload', () => { dirty = true; save(); Speech.stop(); }); window.addEventListener('usl:locked', () => { dirty = true; save(); });
    async function finish(auto) { if (submitted) return; submitted = true; Speech.stop(); const r = await Server.submitAttempt(att.id, ans, flags); if (!r.ok) { submitted = false; return toast(r.error, 'bad'); } if (auto) toast('Time is up — your paper was submitted.', 'ok'); location.href = 'exam.html?attempt=' + encodeURIComponent(att.id); }
    const tm = document.getElementById('timer'); const tick = () => { const left = end - Date.now(); tm.textContent = fmtMs(left); tm.classList.toggle('low', left < 5 * 60000 || left < att.durationMs * .1); if (left <= 0) finish(true); }; tick(); setInterval(tick, 1000);
    document.getElementById('submit').onclick = async () => {
      const un = qsn.filter((_, i) => !isDone(i)).length, fl = Object.values(flags).filter(Boolean).length;
      if (await confirmBox((un ? '<b>' + un + ' unanswered</b> question' + (un > 1 ? 's' : '') + '. ' : 'All questions answered. ') + (fl ? fl + ' flagged. ' : '') + 'After submitting you cannot change your answers.', { title: 'Submit your paper?', ok: 'Submit now' })) { dirty = true; save(); finish(false); }
    };
    draw(); save();
  }

  function results(aid) {
    const ar = Server.getAttempt(aid); if (!ar.ok) return fail(ar.error); let a = ar.attempt;
    if (a.status === 'in_progress') { location.replace('exam.html?paper=' + encodeURIComponent(a.paperId)); return; }
    const pr = Server.getPaper(a.paperId); if (!pr.ok) return fail('This paper is no longer available. ' + pr.error); const p = pr.paper;
    function draw() {
      const pq = p.questions.map(q => Object.assign({}, q, (a.keys || {})[q.id]));
      const o = a.objective || {}, structs = pq.filter(q => q.type === 'struct'), sm = a.selfMarks || {};
      const structMax = p.hasGuide ? structs.reduce((s, q) => s + q.marks, 0) : 0, structGot = structs.reduce((s, q) => s + (sm[q.id] || 0), 0), markedAll = structs.every(q => sm[q.id] != null);
      const total = (o.got || 0) + structGot, max = (o.max || 0) + structMax;
      const topics = Object.entries(a.topicStats || {}).map(([k, v]) => ({ subject: k.split('|')[0], topic: k.split('|')[1], got: v.got, max: v.max, pct: v.max ? Math.round(v.got / v.max * 100) : 0 })).sort((x, y) => x.pct - y.pct);
      const weak = topics.filter(t => t.pct < 50);
      main.innerHTML = `<p class="crumbs"><a href="papers.html">Exam centre</a> › Results</p><h1>${esc(p.title)}</h1>${aiNote(p)}
        <div class="card ${o.scored || structMax ? 'accent' : ''}"><p class="mb0 muted small">Submitted ${fmtDate(a.submittedAt)}</p>
          ${p.hasGuide && (o.scored || structMax) ? '<h2 style="margin:6px 0">' + (markedAll || !structMax ? total + ' / ' + max + ' (' + Math.round(total / max * 100) + '%)' : 'Objective: ' + o.got + ' / ' + o.max) + '</h2><div class="progress ' + (total / max >= .5 ? 'ok' : 'bad') + '"><i style="width:' + Math.round(total / max * 100) + '%"></i></div>' + (!markedAll && structMax ? '<p class="small mt mb0">Written questions (' + structMax + ' marks) are not counted yet. Compare with the model answers below and enter your own marks.</p>' : '') : '<h2 style="margin:6px 0">Answers saved</h2><p class="mb0">This paper has no marking guide, so it cannot be scored here. Check your answers with your teacher.</p>'}
          <p class="hint mt mb0">Practice score only — not an official UNEB result.</p></div>
        ${topics.length ? '<h2 class="mt2">Performance by topic</h2><div class="card">' + topics.map(t => '<div class="bar"><span>' + esc(t.topic) + '</span><div class="progress ' + (t.pct < 50 ? 'bad' : t.pct >= 75 ? 'ok' : '') + '"><i style="width:' + t.pct + '%"></i></div><b>' + t.pct + '%</b></div>').join('') + '</div>' : ''}
        ${weak.length ? '<div class="card accent mt"><h3>Revise next</h3><ul class="list">' + weak.map(t => { const l = db.lessons.find(x => x.status === 'published' && x.subject === t.subject && x.topic.toLowerCase() === t.topic.toLowerCase()); return '<li class="item"><span><b>' + esc(t.topic) + '</b> <span class="muted small">(' + t.pct + '%)</span></span>' + (l ? '<a class="btn sm orange" href="lesson.html?id=' + encodeURIComponent(l.id) + '">Open lesson</a>' : '<a class="btn sm ghost" href="tutor.html?cls=' + esc(p.cls) + '&subject=' + esc(p.subject) + '&q=' + encodeURIComponent(t.topic) + '">Ask the tutor</a>') + '</li>'; }).join('') + '</ul></div>' : ''}
        <h2 class="mt2">Review your answers</h2><p class="small muted">${esc(p.hasGuide ? (p.verified ? 'Marking guide supplied by the source.' : p.category === 'AI-generated practice' ? 'Model answers are AI-generated and not officially verified.' : 'Marking guide not yet verified.') : '')}</p>
        <div class="stack" id="review">${pq.map((q, i) => {
          const ans = a.answers[q.id];
          if (q.type === 'mcq') return '<div class="card"><b>' + (i + 1) + '. ' + esc(q.text) + '</b> <span class="muted small">[' + q.marks + ']</span><div class="mt">' + q.o.map((x, k) => { let c = 'opt'; if (typeof q.a === 'number') { if (k === q.a) c += ' right'; else if (ans === k) c += ' wrong'; } else if (ans === k) c += ' sel'; return '<div class="' + c + '"><b>' + L[k] + '.</b> ' + esc(x) + (ans === k ? ' <span class="badge">your answer</span>' : '') + '</div>'; }).join('') + '</div>' + (ans == null ? '<p class="small muted mb0">You did not answer this question.</p>' : '') + '</div>';
          return '<div class="card"><b>' + (i + 1) + '. ' + esc(q.text) + '</b> <span class="muted small">[' + q.marks + ']</span><p class="small muted mt mb0">Your answer</p><div class="card soft" style="white-space:pre-wrap">' + (ans ? esc(ans) : '<i class="muted">No answer written.</i>') + '</div>' + (p.hasGuide && q.model ? '<div class="model small"><b>Model answer</b><br>' + esc(q.model).replace(/\n/g, '<br>') + '</div><div class="row mt"><label class="small" style="margin:0" for="m' + q.id + '">Your marks (0–' + q.marks + ')</label><input id="m' + q.id + '" data-q="' + q.id + '" type="number" min="0" max="' + q.marks + '" step="0.5" style="width:90px" value="' + (sm[q.id] != null ? sm[q.id] : '') + '"></div>' : '') + '</div>';
        }).join('')}</div>
        <div class="row mt">${structMax ? '<button class="btn orange" id="sm">Save my marks</button>' : ''}<a class="btn" href="exam.html?paper=${encodeURIComponent(p.id)}">Try again</a><a class="btn ghost" href="papers.html">More papers</a></div>`;
      const b = document.getElementById('sm'); if (b) b.onclick = async () => { const m = {}; document.querySelectorAll('[data-q]').forEach(i => { m[i.dataset.q] = i.value; }); const r = await Server.selfMark(a.id, m); if (!r.ok) return toast(r.error, 'bad'); a = r.attempt; toast('Marks saved.', 'ok'); draw(); window.scrollTo(0, 0); };
    }
    draw();
  }
})();

}

/* ---- page: subscription ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'subscription') {
(async function () {
  const { Server, esc, fmtMs, fmtUGX, fmtDate, toast } = USL;
  const ctx = await USL.boot({ page: 'subscription' }); const u = ctx.user, main = document.getElementById('main');
  const qs = new URLSearchParams(location.search); const from = qs.get('from');
  if (u.role !== 'student') { main.innerHTML = '<h1>Subscription</h1><div class="card"><p class="mb0">Staff accounts do not need a subscription.</p></div>'; return; }
  let lastSig = '';
  const sigOf = () => JSON.stringify([Server.access(u).state, Server.myPayments().map(p => p.status)]);
  const statusBadge = s => ({ success: '<span class="badge ok">Paid</span>', pending: '<span class="badge warn">Waiting for payment</span>', review: '<span class="badge warn">Being confirmed</span>', failed: '<span class="badge bad">Failed</span>', reversed: '<span class="badge bad">Reversed</span>' }[s] || esc(s));

  function render() {
    const cfg = Server.cfg(), a = Server.access(u), pays = Server.myPayments(), pending = pays.find(p => p.status === 'pending'), review = pays.find(p => p.status === 'review');
    const dest = from ? { dashboard: 'dashboard.html', library: 'library.html', papers: 'papers.html', tutor: 'tutor.html' }[from] || 'dashboard.html' : 'dashboard.html';
    let status;
    if (a.state === 'paid') status = '<div class="card"><span class="badge ok">Subscribed</span><h2 style="margin-top:8px">You are all set</h2><p>Access is active until <b>' + fmtDate(a.expires) + '</b> (' + fmtMs(a.msLeft) + ' left). You can renew early — extra days are added after your current period.</p><a class="btn orange" href="' + dest + '">Continue learning</a></div>';
    else if (a.state === 'trial') status = '<div class="card accent"><span class="badge warn">Free trial running</span><h2 style="margin-top:8px"><span id="cd">' + fmtMs(a.msLeft) + '</span> left</h2><p class="mb0">Subscribe now so you don\'t lose access when the timer ends.</p></div>';
    else if (a.state === 'trial_ready') status = '<div class="card accent"><span class="badge orange">One free trial</span><h2 style="margin-top:8px">Try it free for ' + cfg.trialMinutes + ' minutes</h2><p>Full access to lessons, papers, exams and the tutor. The timer starts when you press the button and cannot be reset.</p><button class="btn orange" id="trial">Start my free trial</button></div>';
    else status = '<div class="card accent"><span class="badge bad">' + (a.hadSub ? 'Subscription ended' : 'Free trial used') + '</span><h2 style="margin-top:8px">Subscribe to keep learning</h2><p class="mb0">Your progress and history are saved and will be here when you subscribe.</p></div>';

    main.innerHTML = `<h1>Subscription</h1>
      ${qs.get('need') && !USL.allowed(a) ? '<div class="alert warn" role="status" style="margin-bottom:14px">That page needs an active trial or subscription.</div>' : ''}
      <div class="grid g2">${status}
        <div class="card"><h3>Student plan</h3><p style="font-size:2rem;font-weight:800;margin:0">${fmtUGX(cfg.price)}<span class="muted" style="font-size:1rem;font-weight:600"> / ${cfg.days} days</span></p>
          <ul><li>All S1–S6 lessons, notes and quizzes</li><li>Exam centre and timed simulator</li><li>AI voice tutor (up to ${cfg.aiDailyLimit} questions a day)</li><li>One registered device per account</li></ul></div></div>
      <div class="card mt"><h2>Pay with Mobile Money</h2>
        ${a.state === 'paid' && !pending && !review ? '<p class="muted small">Your plan is active. You can pay again any time to add another ' + cfg.days + ' days.</p>' : ''}
        ${review ? `<div class="alert warn" role="status"><b>We are confirming your payment.</b> Reference <code>${esc(review.ref)}</code>, transaction ID <code>${esc(review.txId || '')}</code>. Your plan starts as soon as it is confirmed (usually within a few hours). You will get a notice here.</div>` : ''}
        ${pending && pending.mode === 'auto' ? `<div class="alert warn" role="status"><b>Approve the payment on your phone.</b><br>A ${esc(pending.provider)} prompt for ${fmtUGX(pending.amount)} was sent to <b>${esc(pending.phone)}</b>. Enter your mobile money PIN to approve. This page updates by itself once the payment is confirmed (reference <code>${esc(pending.ref)}</code>).<div class="row mt"><button class="btn sm" id="chk">I have paid — check now</button></div></div>` : ''}
        ${pending && pending.mode === 'manual' ? `<div class="alert warn" role="status"><b>Step 1 — send the money</b><br>Send <b>${fmtUGX(pending.amount)}</b> by ${esc(pending.provider)} to <b>${esc(cfg.payNumber)}</b>. Use <code>${esc(pending.ref)}</code> as the reason if your phone asks for one.</div>
          <form id="tx" class="mt" novalidate><div class="field"><label for="txid"><b>Step 2 — enter the transaction ID</b> from the confirmation message</label><input id="txid" autocomplete="off" placeholder="e.g. 12345678901" maxlength="30" required></div><button class="btn orange" type="submit">Submit for confirmation</button> <span class="hint">We match it with the payment received on ${esc(cfg.payNumber)} and switch your plan on.</span></form>` : ''}
        ${!pending && !review ? `<form id="pay" novalidate><div class="grid g2"><div class="field"><label for="prov">Provider</label><select id="prov"><option>MTN Mobile Money</option><option>Airtel Money</option></select></div>
          <div class="field"><label for="ph">${cfg.payAuto ? 'Your mobile money number' : 'The number you will pay from'}</label><input id="ph" inputmode="tel" placeholder="0772 123456" value="${u.contact.startsWith('+') ? esc(u.contact) : ''}"></div></div>
          <p class="small" style="background:#eaf1ff;border-radius:12px;padding:10px 12px">Payments are received on <b>${esc(cfg.payNumber)}</b> (${esc(cfg.currency)} ${cfg.price.toLocaleString('en-US')}).</p><button class="btn orange" type="submit">${cfg.payAuto ? 'Pay ' + fmtUGX(cfg.price) : 'Continue to pay ' + fmtUGX(cfg.price)}</button>
          <p class="hint">${cfg.payAuto ? 'You will get a prompt on your phone to approve the payment.' : 'You will send the money from your phone, then enter the transaction ID here.'} Your plan switches on only after the payment is confirmed by our server. A screenshot cannot activate it.</p></form>` : ''}
      </div>
      <h2 class="mt2">Payment history</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Provider</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead><tbody>${pays.map(p => '<tr><td>' + fmtDate(p.createdAt) + '</td><td><code>' + esc(p.ref) + '</code></td><td>' + esc(p.provider) + '</td><td>' + fmtUGX(p.amount) + '</td><td>' + statusBadge(p.status) + '</td><td>' + (p.status === 'success' ? '<a class="btn sm ghost" target="_blank" rel="noopener" href="' + esc(USL.waLink(USL.normContact(cfg.whatsappNumber), 'Hello, I have paid ' + fmtUGX(p.amount) + ' for Uganda Smart Learning. Name: ' + u.name + '. Reference: ' + p.ref + '.')) + '">Send on WhatsApp</a>' : '') + '</td></tr>').join('') || '<tr><td colspan="6" class="muted">No payments yet.</td></tr>'}</tbody></table></div>`;

    const t = document.getElementById('trial'); if (t) t.onclick = async () => { t.disabled = true; const r = await Server.startTrial(); if (!r.ok) { t.disabled = false; return toast(r.error, 'bad'); } toast('Trial started — enjoy!', 'ok'); setTimeout(() => { location.href = USL.allowed(Server.access(u)) ? dest : 'dashboard.html'; }, 500); };
    const f = document.getElementById('pay'); if (f) f.onsubmit = async e => { e.preventDefault(); const b = f.querySelector('button'); b.disabled = true; const r = await Server.initiatePayment(document.getElementById('prov').value, document.getElementById('ph').value); if (!r.ok) { b.disabled = false; return toast(r.error, 'bad'); } toast(r.payment.mode === 'auto' ? 'Payment request sent. Approve it on your phone.' : 'Now send the money and enter the transaction ID.', 'ok'); lastSig = ''; };
    const x = document.getElementById('tx'); if (x) x.onsubmit = async e => { e.preventDefault(); const b = x.querySelector('button'); b.disabled = true; const r = await Server.submitManualPayment(pending.ref, document.getElementById('txid').value); if (!r.ok) { b.disabled = false; return toast(r.error, 'bad'); } toast('Thank you. We are confirming your payment.', 'ok'); lastSig = ''; };
    const c = document.getElementById('chk'); if (c) c.onclick = async () => { c.disabled = true; const r = await Server.checkPayment(pending.ref); c.disabled = false; if (r.status === 'success') toast('Payment confirmed. You are subscribed!', 'ok'); else if (r.status === 'pending') toast('Not confirmed yet. Approve the prompt on your phone, then try again.'); else if (r.error) toast(r.error, 'bad'); lastSig = ''; };
  }
  render(); lastSig = sigOf();
  let polling = false; setInterval(async () => { const q = Server.myPayments().find(p => p.status === 'pending' && p.mode === 'auto'); if (q && !polling) { polling = true; try { await Server.checkPayment(q.ref); } finally { polling = false; } } }, 5000);
  setInterval(() => { const s = sigOf(); if (s !== lastSig) { lastSig = s; render(); } const cd = document.getElementById('cd'); if (cd) { const a = Server.access(u); if (a.state === 'trial') cd.textContent = fmtMs(a.msLeft); } }, 1000);
})();

}

/* ---- page: profile ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'profile') {
(async function () {
  const { Server, esc, fmtDate, fmtUGX, toast } = USL;
  const ctx = await USL.boot({ page: 'profile' }); let u = ctx.user; const main = document.getElementById('main'); const db = Server.data();
  const student = u.role === 'student';
  const a = Server.access(u), prog = Server.progress(), atts = Server.myAttempts().filter(x => x.status === 'submitted'), notes = Server.notifications();
  const subName = id => (db.subjects.find(s => s.id === id) || {}).name || id;
  const roleName = { student: 'Student', contributor: 'Teacher / contributor', reviewer: 'Content reviewer', admin: 'Administrator' }[u.role];
  const classSubs = () => db.subjects.filter(s => s.classes.includes(u.classId));
  const accessText = a.state === 'paid' ? 'Subscribed until ' + fmtDate(a.expires) : a.state === 'trial' ? 'Free trial running' : a.state === 'trial_ready' ? 'Free trial not started' : a.state === 'staff' ? 'Staff access' : 'No active plan';

  main.innerHTML = `<h1>My account</h1>
    <div class="grid g2">
      <div class="card"><h3>Details</h3><form id="f" class="stack">
        <div class="field"><label for="n">Name</label><input id="n" value="${esc(u.name)}"></div>
        <p class="small mb0"><b>${esc(u.contact)}</b> · ${esc(roleName)}</p>
        ${student ? `<div class="field"><label for="c">Class</label><select id="c">${db.classes.map(c => '<option value="' + c.id + '"' + (c.id === u.classId ? ' selected' : '') + '>' + esc(c.id + ' – ' + c.name) + '</option>').join('')}</select></div>
        <div class="field"><label for="g">Daily goal (lessons)</label><input id="g" type="number" min="1" max="10" value="${u.dailyGoal || 2}"></div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="small"><b>My subjects</b></legend><div id="subs"></div><p class="hint">Leave all unticked to see every subject for your class.</p></fieldset>` : ''}
        <button class="btn orange" type="submit">Save changes</button></form></div>
      <div class="stack">
        <div class="card"><h3>Registered device</h3><p class="mb0">This account is tied to <b>one device</b>: <code>${esc((u.deviceId || '').slice(-8))}</code>, registered ${fmtDate(u.deviceSince)}.</p>
          <p class="small muted">To use another phone or laptop you must log in there and verify with a one-time code. That signs this device out. If you did not request this, change your password.</p>
</div>
        <div class="card"><h3>Subscription</h3><p>${esc(accessText)}</p><a class="btn ghost" href="subscription.html">${student ? 'Manage subscription' : 'View plans'}</a></div>
        <div class="card"><h3>Privacy</h3><p class="small mb0">We store your name, contact, class, device and learning activity to run the app${u.consentAt ? ' (consent recorded ' + fmtDate(u.consentAt) + ')' : ''}. If you are under 18, a parent or guardian must agree to your use of this app.</p></div>
      </div></div>
    ${student ? `<h2 class="mt2">Learning history</h2><div class="grid g2"><div class="card"><h3>Lessons</h3><ul class="list">${Object.entries(prog).filter(([, p]) => p.completed || p.quiz).map(([id, p]) => { const l = db.lessons.find(x => x.id === id); return l ? '<li class="item"><span><a href="lesson.html?id=' + encodeURIComponent(id) + '">' + esc(l.title) + '</a><br><span class="muted small">' + esc(subName(l.subject)) + '</span></span><span>' + (p.quiz ? '<span class="badge ok">' + p.quiz.score + '/' + p.quiz.total + '</span>' : '<span class="badge">Done</span>') + '</span></li>' : ''; }).join('') || '<li class="muted">No lessons completed yet.</li>'}</ul></div>
      <div class="card"><h3>Exam attempts</h3><ul class="list">${atts.slice(0, 10).map(x => { const p = db.papers.find(y => y.id === x.paperId); const o = x.objective || {}; return p ? '<li class="item"><span>' + esc(p.title) + '<br><span class="muted small">' + fmtDate(x.submittedAt) + '</span></span><a class="btn sm ghost" href="exam.html?attempt=' + encodeURIComponent(x.id) + '">' + (o.scored ? o.got + '/' + o.max : 'View') + '</a></li>' : ''; }).join('') || '<li class="muted">No papers submitted yet.</li>'}</ul></div></div>` : ''}
    <h2 class="mt2">Notifications</h2><div class="card"><ul class="list">${notes.map(n => '<li><span class="small muted">' + fmtDate(n.at) + '</span><br>' + esc(n.msg) + '</li>').join('') || '<li class="muted">Nothing new.</li>'}</ul></div>
    <div class="row mt2"><button class="btn danger" id="out">Log out</button></div>`;

  if (student) {
    const draw = () => { document.getElementById('subs').innerHTML = classSubs().map(s => '<label class="check"><input type="checkbox" value="' + s.id + '"' + (u.subjects.includes(s.id) ? ' checked' : '') + '><span>' + esc(s.name) + '</span></label>').join(''); };
    draw(); document.getElementById('c').onchange = e => { u = Object.assign({}, u, { classId: e.target.value, subjects: [] }); draw(); };
  }
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault(); const p = { name: document.getElementById('n').value };
    if (student) { p.classId = document.getElementById('c').value; p.dailyGoal = document.getElementById('g').value; p.subjects = [...document.querySelectorAll('#subs input:checked')].map(i => i.value); }
    const r = await Server.updateProfile(p); toast(r.ok ? 'Saved.' : r.error, r.ok ? 'ok' : 'bad'); if (r.ok) setTimeout(() => location.reload(), 500);
  };
  document.getElementById('out').onclick = async () => { await Server.logout(); location.href = 'index.html'; };
})();

}

/* ---- page: admin ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'admin') {
(async function () {
  const { Server, esc, fmtDate, fmtUGX, toast, modal, confirmBox } = USL;
  const ctx = await USL.boot({ page: 'admin', staff: 'submit' }); const me = ctx.user, main = document.getElementById('main');
  if (me.role === 'teacher') { location.replace('teacher.html'); return new Promise(() => { }); }
  const isAdmin = me.role === 'admin', canReview = USL.can(me, 'review');
  const D = () => Server.data(); const subName = id => (D().subjects.find(s => s.id === id) || {}).name || id;
  const userName = id => id === 'system' ? 'System' : ((D().users.find(u => u.id === id) || {}).name || id || '—');
  const tabs = [];
  if (isAdmin) tabs.push(['overview', 'Overview'], ['students', 'Students']);
  if (canReview) tabs.push(['review', 'Review queue']);
  if (USL.can(me, 'moderate')) tabs.push(['moderation', 'Chat moderation']);
  tabs.push(['papers', 'Papers'], ['lessons', 'Lessons'], ['mine', 'My submissions']);
  if (isAdmin) tabs.push(['catalogue', 'Catalogue'], ['payments', 'Payments'], ['outbox', 'WhatsApp outbox'], ['people', 'Staff'], ['settings', 'Settings'], ['audit', 'Audit log']);
  let tab = (location.hash || '').slice(1); if (!tabs.find(t => t[0] === tab)) tab = tabs[0][0];
  const roleNote = { admin: 'Administrator', reviewer: 'Reviewer', contributor: 'Contributor', teacher: 'Teacher' }[me.role];
  const sel = (id, opts, v) => '<select id="' + id + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  const val = id => document.getElementById(id).value, chk = id => document.getElementById(id).checked;
  const stat = (k, v) => '<div class="stat"><b>' + v + '</b><span>' + k + '</span></div>';
  const statusBadge = s => ({ published: 'ok', pending: 'warn', rejected: 'bad', withdrawn: 'bad' }[s] ? '<span class="badge ' + { published: 'ok', pending: 'warn', rejected: 'bad', withdrawn: 'bad' }[s] + '">' + esc(s) + '</span>' : esc(s));
  const out = (r, okMsg) => { toast(r.ok ? okMsg : r.error, r.ok ? 'ok' : 'bad'); return r.ok; };

  function shellHtml() {
    main.innerHTML = '<div class="row between"><h1 class="mb0">Admin &amp; content</h1><span class="badge info" style="flex:none;width:auto;height:auto;align-self:center">' + esc(roleNote) + ' · ' + esc(me.name) + '</span></div><div class="tabs mt" role="tablist">' + tabs.map(t => '<button class="tab" role="tab" data-t="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + esc(t[1]) + '</button>').join('') + '</div><div id="panel"></div>';
    main.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; history.replaceState(null, '', '#' + tab); shellHtml(); });
    ({ overview, students, review, moderation, papers, lessons, mine, catalogue, payments, outbox, people, settings, audit }[tab])(document.getElementById('panel'));
  }

  function overview(p) {
    const s = Server.adminStats(), db = D(); const byDay = {};
    Object.entries(db.aiUsage).forEach(([k, v]) => { const d = k.split('|')[1]; byDay[d] = byDay[d] || { calls: 0, chars: 0 }; byDay[d].calls += v.calls; byDay[d].chars += v.chars; });
    p.innerHTML = '<div class="grid g4 g-keep2">' + stat('Students', s.students) + stat('Active subscribers', s.active) + stat('On free trial now', s.trial) + stat('Revenue (verified)', fmtUGX(s.revenue)) + stat('Published lessons', s.lessons) + stat('Published papers', s.published) + stat('Waiting for review', s.pending) + stat('Exam attempts', s.attempts) + '</div>' +
      '<h2 class="mt2">AI &amp; voice usage</h2><div class="card"><p class="small muted">Estimated cost uses ' + fmtUGX(db.cfg.aiCostPerCall) + ' per tutor call (change under Settings). Daily limit per student: ' + db.cfg.aiDailyLimit + '.</p><div class="tablewrap"><table><thead><tr><th>Date</th><th>Tutor calls</th><th>Characters</th><th>Est. cost</th></tr></thead><tbody>' + (Object.entries(byDay).sort().reverse().slice(0, 14).map(([d, v]) => '<tr><td>' + d + '</td><td>' + v.calls + '</td><td>' + v.chars + '</td><td>' + fmtUGX(v.calls * db.cfg.aiCostPerCall) + '</td></tr>').join('') || '<tr><td colspan="4" class="muted">No usage yet.</td></tr>') + '</tbody></table></div><p class="mb0 mt small"><b>Total:</b> ' + s.aiCalls + ' calls · ' + fmtUGX(s.aiCost) + '</p></div>';
  }

  function students(p) {
    const rs = Server.listStudents(); if (!rs.ok) return; const rows = rs.students;
    p.innerHTML = '<div class="row between"><p class="muted mb0">' + rows.length + ' accounts</p><button class="btn sm ghost" id="exp">Export report (CSV, no contact details)</button></div><div class="tablewrap mt"><table><thead><tr><th>Name</th><th>Contact</th><th>Role</th><th>Class</th><th>Access</th><th>Device</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(u => '<tr><td>' + esc(u.name) + '</td><td class="small">' + esc(u.contact) + '</td><td>' + esc(u.role) + '</td><td>' + esc(u.classId || '—') + '</td><td><span class="badge">' + esc(u.access) + '</span></td><td>' + (u.device ? '<span class="badge ok">registered</span>' : '<span class="badge">none</span>') + '</td><td>' + (u.status === 'active' ? '<span class="badge ok">active</span>' : '<span class="badge bad">suspended</span>') + '</td><td class="right">' + (u.id === me.id ? '' : '<button class="btn sm ghost" data-st="' + u.id + '|' + (u.status === 'active' ? 'suspended' : 'active') + '">' + (u.status === 'active' ? 'Suspend' : 'Reactivate') + '</button> <button class="btn sm ghost" data-dv="' + u.id + '">Reset device</button>') + '</td></tr>').join('') + '</tbody></table></div>';
    p.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.st.split('|'); if (out(await Server.setUserStatus(id, st), 'Updated.')) shellHtml(); });
    p.querySelectorAll('[data-dv]').forEach(b => b.onclick = async () => { if (await confirmBox('The student will be signed out and can register their next login device. Use this only after checking who is asking.', { title: 'Reset registered device?', ok: 'Reset device' }) && out(await Server.resetDevice(b.dataset.dv), 'Device reset.')) shellHtml(); });
    document.getElementById('exp').onclick = () => USL.download('students-report.csv', USL.csv([['Name', 'Role', 'Class', 'Access', 'Status', 'Created']].concat(rows.map(u => [u.name, u.role, u.classId || '', u.access, u.status, new Date(u.createdAt).toISOString().slice(0, 10)]))));
  }

  const QHELP = '<details class="small"><summary>Question format</summary><p>One question per line:</p><pre style="white-space:pre-wrap;background:#f5f7fb;padding:10px;border-radius:10px">MCQ | Topic | marks | Question | Option A ;; Option B ;; Option C | correct option number\nSTRUCT | Topic | marks | Question | Model answer (use \\n for a new line)</pre><p class="mb0">The correct option / model answer is required when you tick “has marking guide”. Leave them out if you do not have an authorised guide.</p></details>';
  function paperForm() {
    const db = D(), subs = db.subjects.map(s => [s.id, s.name]);
    return '<form id="pf" class="card stack"><h3>Submit a paper</h3><p class="small muted mb0">Submissions go to a reviewer first. Only add material the platform is allowed to distribute.</p><div class="grid g3"><div class="field"><label for="pt">Title</label><input id="pt" placeholder="e.g. Mock Examination – Paper 1"></div><div class="field"><label for="pc">Class</label>' + sel('pc', db.classes.map(c => [c.id, c.id + ' – ' + c.name]), 'S4') + '</div><div class="field"><label for="ps">Subject</label>' + sel('ps', subs) + '</div><div class="field"><label for="py">Year</label><input id="py" type="number" value="' + new Date().getFullYear() + '"></div><div class="field"><label for="pn">Paper number</label><input id="pn" type="number" min="1" max="9" value="1"></div><div class="field"><label for="pd">Duration (minutes)</label><input id="pd" type="number" value="60"></div><div class="field"><label for="pcat">Category</label>' + sel('pcat', USL.CATEGORIES.map(c => [c, c])) + '</div><div class="field"><label for="po">Source organisation</label>' + sel('po', db.orgs.map(o => [o.id, o.name])) + '</div><div class="field"><label for="pp">Permission status</label>' + sel('pp', USL.PERMS.map(c => [c, c]), USL.PERMS[0]) + '</div></div><div class="field"><label for="pi">Instructions to candidates</label><input id="pi" placeholder="Answer all questions."></div><label class="check"><input type="checkbox" id="pg" checked><span>This paper has an authorised marking guide / answer key</span></label><div class="field"><label for="pq">Questions</label><textarea id="pq" rows="8" placeholder="MCQ | Algebra | 2 | Simplify 2x + 3x | 5x ;; 6x ;; x² | 1"></textarea></div>' + QHELP + '<button class="btn orange" type="submit">Send for review</button></form>';
  }
  function papers(p) {
    p.innerHTML = paperForm() + (isAdmin ? '<h2 class="mt2">All papers</h2><div class="tablewrap"><table><thead><tr><th>Title</th><th>Class</th><th>Paper</th><th>Year</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>' + D().papers.map(x => '<tr><td>' + esc(x.title) + '<br><span class="small muted">' + esc(x.category) + ' · ' + esc(x.permission) + '</span></td><td>' + esc(x.cls) + '</td><td>' + x.paperNo + '</td><td>' + x.year + '</td><td class="small">' + esc(x.org) + '</td><td>' + statusBadge(x.status) + '</td><td class="right">' + (x.status === 'published' ? '<button class="btn sm ghost" data-w="' + x.id + '">Withdraw</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '');
    document.getElementById('pf').onsubmit = async e => { e.preventDefault(); const r = await Server.submitPaper({ title: val('pt'), cls: val('pc'), subject: val('ps'), year: val('py'), paperNo: val('pn'), duration: val('pd'), category: val('pcat'), org: val('po'), permission: val('pp'), instructions: val('pi'), hasGuide: chk('pg'), questionsText: val('pq') }); if (out(r, 'Submitted for review.')) { tab = 'mine'; shellHtml(); } };
    p.querySelectorAll('[data-w]').forEach(b => b.onclick = async () => { if (await confirmBox('Students will no longer see this paper. Past attempts stay in their history.', { danger: true, title: 'Withdraw paper?', ok: 'Withdraw' }) && out(await Server.withdraw('paper', b.dataset.w), 'Withdrawn.')) shellHtml(); });
  }

  function lessons(p) {
    const db = D();
    p.innerHTML = '<form id="lf" class="card stack"><h3>Submit a lesson</h3><p class="small muted mb0">Write original notes or use material you have permission to use. A reviewer approves it before students see it. Do not paste text from the official syllabus unless you are authorised to.</p><div class="grid g3"><div class="field"><label for="lc">Class</label>' + sel('lc', db.classes.map(c => [c.id, c.id + ' – ' + c.name])) + '</div><div class="field"><label for="ls">Subject</label>' + sel('ls', db.subjects.map(s => [s.id, s.name])) + '</div><div class="field"><label for="lt">Topic</label><input id="lt"></div><div class="field"><label for="lst">Subtopic</label><input id="lst"></div><div class="field"><label for="ltl">Lesson title</label><input id="ltl"></div><div class="field"><label for="lp">Permission status</label>' + sel('lp', USL.PERMS.map(c => [c, c]), USL.PERMS[0]) + '</div></div><div class="field"><label for="lo">Learning outcomes (one per line)</label><textarea id="lo" rows="3"></textarea></div><div class="field"><label for="ln">Notes</label><textarea id="ln" rows="8" placeholder="Write paragraphs separated by blank lines. Start a line with - for bullet points."></textarea></div><div class="field"><label for="le">Worked example</label><textarea id="le" rows="3"></textarea></div><div class="field"><label for="lq">Quiz (one per line)</label><textarea id="lq" rows="4" placeholder="What is 2 + 2? | 3 ;; 4 ;; 5 | 2"></textarea><div class="hint">Format: question | option A ;; option B ;; option C | correct option number</div></div><div class="field"><label for="lsrc">Source / author</label><input id="lsrc" placeholder="e.g. Written by Ms Nabirye"></div><button class="btn orange" type="submit">Send for review</button></form>' +
      (isAdmin ? '<h2 class="mt2">All lessons</h2><div class="tablewrap"><table><thead><tr><th>Title</th><th>Class</th><th>Subject</th><th>Status</th><th></th></tr></thead><tbody>' + db.lessons.map(l => '<tr><td>' + esc(l.title) + '<br><span class="small muted">' + esc(l.topic) + ' · ' + esc(l.source) + '</span></td><td>' + esc(l.cls) + '</td><td>' + esc(subName(l.subject)) + '</td><td>' + statusBadge(l.status) + '</td><td class="right">' + (l.status === 'published' ? '<button class="btn sm ghost" data-w="' + l.id + '">Withdraw</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '');
    document.getElementById('lf').onsubmit = async e => { e.preventDefault(); const r = await Server.submitLesson({ cls: val('lc'), subject: val('ls'), topic: val('lt'), subtopic: val('lst'), title: val('ltl'), permission: val('lp'), objectives: val('lo'), notes: val('ln'), example: val('le'), quizText: val('lq'), source: val('lsrc') }); if (out(r, 'Submitted for review.')) { tab = 'mine'; shellHtml(); } };
    p.querySelectorAll('[data-w]').forEach(b => b.onclick = async () => { if (await confirmBox('Students will no longer see this lesson.', { danger: true, title: 'Withdraw lesson?', ok: 'Withdraw' }) && out(await Server.withdraw('lesson', b.dataset.w), 'Withdrawn.')) shellHtml(); });
  }

  function mine(p) {
    const m = Server.mySubmissions(); const rows = [].concat(m.papers.map(x => ['Paper', x.title, x.status, x.reviewer]), m.lessons.map(x => ['Lesson', x.title, x.status, x.review]));
    p.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Type</th><th>Title</th><th>Status</th><th>Review</th></tr></thead><tbody>' + (rows.map(r => '<tr><td>' + r[0] + '</td><td>' + esc(r[1]) + '</td><td>' + statusBadge(r[2]) + '</td><td class="small">' + esc(r[3]) + '</td></tr>').join('') || '<tr><td colspan="4" class="muted">You have not submitted anything yet.</td></tr>') + '</tbody></table></div><p class="hint">Submitted content stays hidden from students until a reviewer approves it.</p>';
  }

  function review(p) {
    const db = D(), items = [].concat(db.papers.filter(x => x.status === 'pending').map(x => ['paper', x]), db.lessons.filter(x => x.status === 'pending').map(x => ['lesson', x]));
    p.innerHTML = '<h2>Waiting for review (' + items.length + ')</h2><div class="stack">' + (items.map(([k, x]) => '<div class="card"><div class="row between"><div><span class="badge">' + k + '</span> <b>' + esc(x.title) + '</b><br><span class="small muted">' + esc(x.cls) + ' · ' + esc(subName(x.subject)) + ' · by ' + esc(userName(x.submittedBy)) + (k === 'paper' ? ' · ' + esc(x.category) + ' · ' + x.questions.length + ' questions' : '') + '</span><br><span class="badge ' + (x.permission === 'Permission pending' ? 'bad' : 'ok') + '">' + esc(x.permission) + '</span> <span class="small muted">' + esc(x.source || x.org || '') + '</span></div><div class="row"><button class="btn sm ghost" data-v="' + k + '|' + x.id + '">Preview</button><button class="btn sm orange" data-a="' + k + '|' + x.id + '">Approve</button><button class="btn sm danger" data-r="' + k + '|' + x.id + '">Reject</button></div></div></div>').join('') || '<div class="card"><p class="muted mb0">Nothing is waiting. 🎉</p></div>') + '</div>' +
      '<h2 class="mt2">Recent decisions</h2><div class="tablewrap"><table><thead><tr><th>When</th><th>Item</th><th>Decision</th><th>By</th><th>Note</th></tr></thead><tbody>' + (db.reviews.slice(0, 15).map(r => '<tr><td class="small">' + fmtDate(r.at) + '</td><td>' + esc(r.title) + '</td><td>' + statusBadge(r.decision === 'approve' ? 'published' : 'rejected') + '</td><td>' + esc(r.by) + '</td><td class="small">' + esc(r.note) + '</td></tr>').join('') || '<tr><td colspan="5" class="muted">None yet.</td></tr>') + '</tbody></table></div>';
    const decide = (key, decision) => { const [k, id] = key.split('|'); const m = modal('<h3>' + (decision === 'approve' ? 'Approve' : 'Reject') + ' this ' + k + '?</h3>' + (decision === 'approve' ? '<p class="small">By approving you confirm the content is accurate enough for students and the platform may distribute it.</p>' : '') + '<div class="field"><label for="rn">Note (optional)</label><textarea id="rn" rows="3"></textarea></div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn ' + (decision === 'approve' ? 'orange' : 'danger') + '" data-ok>' + (decision === 'approve' ? 'Approve' : 'Reject') + '</button></div>'); m.el.onclick = async e => { if (e.target.closest('[data-x]')) m.close(); if (e.target.closest('[data-ok]')) { const r = await Server.reviewItem(k, id, decision, m.el.querySelector('#rn').value); m.close(); if (out(r, decision === 'approve' ? 'Published.' : 'Rejected.') || true) shellHtml(); } }; };
    p.querySelectorAll('[data-a]').forEach(b => b.onclick = () => decide(b.dataset.a, 'approve')); p.querySelectorAll('[data-r]').forEach(b => b.onclick = () => decide(b.dataset.r, 'reject'));
    p.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const [k, id] = b.dataset.v.split('|'); const x = (k === 'paper' ? db.papers : db.lessons).find(y => y.id === id); modal('<h3>' + esc(x.title) + '</h3>' + (k === 'paper' ? x.questions.map((q, i) => '<div class="card flat" style="margin-bottom:8px"><b>' + (i + 1) + '. ' + esc(q.text) + '</b> <span class="small muted">[' + q.marks + ' · ' + esc(q.topic) + ']</span>' + (q.type === 'mcq' ? '<ul class="small">' + q.o.map((o, n) => '<li' + (q.a === n ? ' style="font-weight:700"' : '') + '>' + esc(o) + '</li>').join('') + '</ul>' : '<div class="model small">' + esc(q.model || 'No model answer') + '</div>') + '</div>').join('') : '<div class="notes">' + x.notes + '</div><p class="small"><b>Example:</b> ' + esc(x.example) + '</p>') + '<button class="btn" onclick="this.closest(\'.overlay\').remove()">Close</button>', { wide: true }); });
  }

  function catalogue(p) {
    const db = D(); let fc = db.classes[0].id;
    const draw = () => {
      p.innerHTML = '<h2>Classes</h2><div class="tablewrap"><table><thead><tr><th>Colour</th><th>Code</th><th>Name</th><th>Level</th><th>Main focus</th><th></th></tr></thead><tbody>' + D().classes.map(c => '<tr><td><span class="clsdot" style="--c:' + esc(c.color) + '"></span></td><td><b>' + esc(c.id) + '</b></td><td>' + esc(c.name) + '</td><td>' + esc(c.level) + '</td><td class="small">' + esc(c.focus) + '</td><td class="right"><button class="btn sm ghost" data-ec="' + c.id + '">Edit</button></td></tr>').join('') + '</tbody></table></div>' +
        '<form id="cf" class="card mt"><h3 id="cft">Add or edit a class</h3><div class="grid g4"><div class="field"><label for="cc">Class colour</label><input id="cc" type="color" value="#2563eb" style="padding:2px;height:44px"></div><div class="field"><label for="ci">Code</label><input id="ci" maxlength="6" placeholder="S1"></div><div class="field"><label for="cn">Name</label><input id="cn"></div><div class="field"><label for="cl">Level</label><input id="cl" placeholder="UCE, UACE…"></div><div class="field"><label for="cf2">Main focus</label><input id="cf2"></div></div><button class="btn orange" type="submit">Save class</button></form>' +
        '<h2 class="mt2">Subjects</h2><div class="tablewrap"><table><thead><tr><th>Subject</th><th>Offered in</th><th></th></tr></thead><tbody>' + D().subjects.map(s => '<tr><td><b>' + esc(s.name) + '</b></td><td class="small">' + esc(s.classes.join(', ')) + '</td><td class="right"><button class="btn sm ghost" data-es="' + s.id + '">Edit</button> <button class="btn sm ghost" data-ds="' + s.id + '">Delete</button></td></tr>').join('') + '</tbody></table></div>' +
        '<form id="sf" class="card mt"><h3 id="sft">Add or edit a subject</h3><div class="field"><label for="sn">Subject name</label><input id="sn"></div><div class="row" id="scl">' + D().classes.map(c => '<label class="check" style="margin:0"><input type="checkbox" value="' + c.id + '"><span>' + esc(c.id) + '</span></label>').join('') + '</div><input type="hidden" id="sid"><button class="btn orange mt" type="submit">Save subject</button><p class="hint">Subject availability differs by class and school programme, so choose carefully and match the NCDC curriculum for each class.</p></form>' +
        '<h2 class="mt2">Syllabus versions</h2><p class="muted small">Enter the official NCDC syllabus reference and version for each class and subject. Nothing is pre-filled — do not invent references.</p><div class="field" style="max-width:240px"><label for="fc">Class</label>' + sel('fc', D().classes.map(c => [c.id, c.id]), fc) + '</div><div class="stack" id="syl"></div>' +
        '<h2 class="mt2">Paper-source organisations</h2><div class="card"><ul class="list">' + D().orgs.map(o => '<li>' + esc(o.name) + '</li>').join('') + '</ul><form id="of" class="row mt"><input id="on" placeholder="Organisation name" style="flex:1;min-width:200px"><button class="btn orange" type="submit">Add</button></form></div>';
      const syl = () => { document.getElementById('syl').innerHTML = D().syllabus.filter(s => s.classId === fc).map(s => '<div class="card flat" data-sy="' + s.subjectId + '"><b>' + esc(subName(s.subjectId)) + '</b><div class="grid g3 mt"><div><label>Official reference</label><input class="r" value="' + esc(s.ref) + '"></div><div><label>Version</label><input class="v" value="' + esc(s.version) + '"></div><div><label>Note</label><input class="n" value="' + esc(s.note) + '"></div></div><button class="btn sm ghost mt">Save</button></div>').join('') || '<p class="muted">No subjects for this class.</p>'; document.querySelectorAll('[data-sy]').forEach(c => c.querySelector('button').onclick = async () => out(await Server.setSyllabus(fc, c.dataset.sy, c.querySelector('.r').value, c.querySelector('.v').value, c.querySelector('.n').value), 'Saved.')); };
      syl(); document.getElementById('fc').onchange = e => { fc = e.target.value; syl(); };
      p.querySelectorAll('[data-ec]').forEach(b => b.onclick = () => { const c = D().classes.find(x => x.id === b.dataset.ec); document.getElementById('ci').value = c.id; document.getElementById('cc').value = c.color; document.getElementById('cn').value = c.name; document.getElementById('cl').value = c.level; document.getElementById('cf2').value = c.focus; document.getElementById('cf').scrollIntoView({ behavior: 'smooth' }); });
      document.getElementById('cf').onsubmit = async e => { e.preventDefault(); if (out(await Server.upsertClass({ id: val('ci'), color: val('cc'), name: val('cn'), level: val('cl'), focus: val('cf2') }), 'Class saved.')) draw(); };
      p.querySelectorAll('[data-es]').forEach(b => b.onclick = () => { const s = D().subjects.find(x => x.id === b.dataset.es); document.getElementById('sn').value = s.name; document.getElementById('sid').value = s.id; document.querySelectorAll('#scl input').forEach(i => { i.checked = s.classes.includes(i.value); }); document.getElementById('sf').scrollIntoView({ behavior: 'smooth' }); });
      p.querySelectorAll('[data-ds]').forEach(b => b.onclick = async () => { if (await confirmBox('Remove this subject from the catalogue?', { danger: true, ok: 'Delete' }) && out(await Server.deleteSubject(b.dataset.ds), 'Subject removed.')) draw(); });
      document.getElementById('sf').onsubmit = async e => { e.preventDefault(); if (out(await Server.upsertSubject({ id: val('sid') || undefined, name: val('sn'), classes: [...document.querySelectorAll('#scl input:checked')].map(i => i.value) }), 'Subject saved.')) draw(); };
      document.getElementById('of').onsubmit = async e => { e.preventDefault(); if (out(await Server.addOrg(val('on')), 'Organisation added.')) draw(); };
    };
    draw();
  }

  function payments(p) {
    const db = D(), rows = db.payments, tot = rows.filter(x => x.status === 'success').reduce((s, x) => s + x.amount, 0), todo = rows.filter(x => x.status === 'review' || (x.status === 'pending' && x.mode === 'manual' && x.txId));
    const badge = x => ({ success: 'ok', failed: 'bad', reversed: 'bad', review: 'warn', pending: 'warn' }[x] || '');
    p.innerHTML = '<div class="grid g4 g-keep2">' + stat('Verified revenue', fmtUGX(tot)) + stat('Successful', rows.filter(x => x.status === 'success').length) + stat('To confirm', todo.length) + stat('Failed / reversed', rows.filter(x => x.status === 'failed' || x.status === 'reversed').length) + '</div>'
      + (todo.length ? '<h3 class="mt2">Waiting for your confirmation</h3><p class="muted small">Check your mobile money messages on ' + esc(db.cfg.payNumber) + ' for the transaction ID and amount, then confirm. Confirming switches the student\'s plan on.</p><div class="stack">' + todo.map(x => '<div class="card accent"><div class="row between"><b>' + esc(userName(x.userId)) + '</b><span class="small muted">' + fmtDate(x.updatedAt) + '</span></div><p class="mb0">' + fmtUGX(x.amount) + ' via ' + esc(x.provider) + ' from ' + esc(x.phone) + '<br>Reference <code>' + esc(x.ref) + '</code> · Transaction ID <code>' + esc(x.txId || '—') + '</code>' + (x.note ? '<br><span class="small">' + esc(x.note) + '</span>' : '') + '</p><div class="row mt"><button class="btn sm orange" data-ap="' + x.id + '">Confirm payment</button><button class="btn sm danger" data-rj="' + x.id + '">Not received</button></div></div>').join('') + '</div>' : '')
      + '<div class="row between mt2"><p class="muted small mb0">A plan is switched on only by the server: after the mobile money provider confirms the payment, or after you confirm it here.</p><button class="btn sm ghost" id="exp">Export CSV</button></div><div class="tablewrap mt"><table><thead><tr><th>Date</th><th>Reference</th><th>Student</th><th>Provider</th><th>Amount</th><th>Status</th><th>Transaction</th><th></th></tr></thead><tbody>' + (rows.map(x => '<tr><td class="small">' + fmtDate(x.createdAt) + '</td><td><code>' + esc(x.ref) + '</code></td><td>' + esc(userName(x.userId)) + '</td><td>' + esc(x.provider) + '<br><span class="small muted">' + (x.mode === 'auto' ? 'automatic' : 'manual') + '</span></td><td>' + fmtUGX(x.amount) + '</td><td><span class="badge ' + badge(x.status) + '">' + esc(x.status) + '</span></td><td class="small">' + esc(x.txId || '—') + '</td><td>' + (x.status === 'success' ? '<button class="btn sm ghost" data-rv="' + x.id + '">Reverse</button>' : '') + '</td></tr>').join('') || '<tr><td colspan="8" class="muted">No payments yet.</td></tr>') + '</tbody></table></div>';
    p.querySelectorAll('[data-ap]').forEach(b => b.onclick = async () => { b.disabled = true; if (out(await Server.approvePayment(b.dataset.ap), 'Payment confirmed. The student\'s plan is active.')) shellHtml(); else b.disabled = false; });
    p.querySelectorAll('[data-rj]').forEach(b => b.onclick = async () => { const note = prompt('Reason shown to the student (optional):', 'We did not receive this payment.'); if (note === null) return; if (out(await Server.rejectPayment(b.dataset.rj, note), 'Payment rejected.')) shellHtml(); });
    p.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => { if (await confirmBox('The matching subscription days are removed and the student loses access.', { danger: true, title: 'Reverse this payment?', ok: 'Reverse' }) && out(await Server.reversePayment(b.dataset.rv), 'Payment reversed.')) shellHtml(); });
    document.getElementById('exp').onclick = () => USL.download('payments.csv', USL.csv([['Date', 'Reference', 'Student', 'Provider', 'Amount', 'Status', 'Transaction']].concat(rows.map(x => [new Date(x.createdAt).toISOString(), x.ref, userName(x.userId), x.provider, x.amount, x.status, x.txId || '']))));
  }

  function outbox(p) {
    const r = Server.outbox(); if (!r.ok) return; const c = D().cfg, items = r.items;
    p.innerHTML = '<div class="alert info" style="margin-bottom:14px"><b>How this works.</b> Each verified subscription queues a message for ' + esc(c.whatsappNumber) + (c.whatsappNotify ? '' : ' (notifications are switched off in Settings)') + '. ' + (c.services && c.services.whatsapp ? 'Messages are sent automatically by the server (' + esc(c.services.whatsapp) + '). Anything that failed can still be opened here.' : '<b>Automatic sending is not set up</b> (add the WhatsApp keys in Vercel, see README step 5), so tap <b>Send on WhatsApp</b> to open each message ready to send.') + '</div><div class="stack">' +
      (items.map(m => '<div class="card"><div class="row between"><span class="small muted">' + fmtDate(m.at) + ' · to ' + esc(m.to) + '</span>' + (m.status === 'sent' ? '<span class="badge ok">sent</span>' : m.status === 'failed' ? '<span class="badge bad">failed</span>' : '<span class="badge warn">queued</span>') + '</div><pre style="white-space:pre-wrap;font:inherit;margin:10px 0">' + esc(m.text) + '</pre><div class="row"><a class="btn sm orange" target="_blank" rel="noopener" href="' + esc(USL.waLink(m.to, m.text)) + '" data-wa="' + m.id + '">Send on WhatsApp</a>' + (m.status === 'sent' ? '' : '<button class="btn sm ghost" data-ms="' + m.id + '">Mark as sent</button>') + '</div></div>').join('') || '<div class="card"><p class="muted mb0">No messages yet. One is queued whenever a payment needs you or is confirmed.</p></div>') + '</div>';
    p.querySelectorAll('[data-ms]').forEach(b => b.onclick = async () => { if (out(await Server.markOutboxSent(b.dataset.ms), 'Marked as sent.')) shellHtml(); });
    p.querySelectorAll('[data-wa]').forEach(a => a.addEventListener('click', () => { setTimeout(async () => { await Server.markOutboxSent(a.dataset.wa); shellHtml(); }, 600); }));
  }

  function moderation(p) {
    const r = Server.chatReports(); if (!r.ok) return; const fm = t => fmtDate(t);
    p.innerHTML = '<div class="alert info" style="margin-bottom:14px">Class rooms are open to students of that class only. Students can report messages. You can delete a message, dismiss a report, or mute a student for a while. These actions are written to the audit log.</div><h2>Reported messages (' + r.reports.length + ')</h2><div class="stack">' + (r.reports.map(x => '<div class="card"><div class="row between"><span><span class="clsdot" style="--c:' + esc(USL.classColor(x.cls)) + '"></span><b>' + esc(x.cls) + '</b> · ' + esc(x.name) + ' · <span class="small muted">' + fm(x.at) + '</span></span><span class="badge bad">' + x.count + ' report' + (x.count > 1 ? 's' : '') + '</span></div><p style="margin:10px 0">' + (x.text ? esc(x.text) : '<i class="muted">🎤 voice note</i>') + '</p><div class="row"><button class="btn sm danger" data-del="' + x.id + '">Delete message</button><button class="btn sm ghost" data-dis="' + x.id + '">Dismiss report</button><button class="btn sm ghost" data-mute="' + x.userId + '">Mute 60 min</button></div></div>').join('') || '<div class="card"><p class="muted mb0">No reported messages.</p></div>') + '</div><h2 class="mt2">Muted students</h2><div class="card"><ul class="list">' + (r.muted.map(m => '<li class="item"><span><b>' + esc(m.name) + '</b> <span class="small muted">until ' + fm(m.until) + '</span></span><button class="btn sm ghost" data-un="' + m.id + '">Unmute</button></li>').join('') || '<li class="muted">Nobody is muted.</li>') + '</ul></div>';
    p.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('Delete this message for everyone?', { danger: true, ok: 'Delete' })) { const d = Server.deleteMessage(b.dataset.del); if (out(d, 'Deleted.')) { if (d.mediaId) USL.Media.del(d.mediaId); shellHtml(); } } });
    p.querySelectorAll('[data-dis]').forEach(b => b.onclick = () => { if (out(Server.dismissReports(b.dataset.dis), 'Report dismissed.')) shellHtml(); });
    p.querySelectorAll('[data-mute]').forEach(b => b.onclick = () => { if (out(Server.muteUser(b.dataset.mute, 60), 'Muted for 60 minutes.')) shellHtml(); });
    p.querySelectorAll('[data-un]').forEach(b => b.onclick = () => { if (out(Server.unmuteUser(b.dataset.un), 'Unmuted.')) shellHtml(); });
  }

  function teachSummary(u) { const t = u.teaching || []; if (!t.length) return '<span class="muted small">No classes assigned yet</span>'; const by = {}; t.forEach(x => { (by[x.cls] = by[x.cls] || []).push(subName(x.subject)); }); return Object.keys(by).sort().map(c => '<span class="badge info">' + esc(c) + '</span> <span class="small">' + esc(by[c].join(', ')) + '</span>').join('<br>'); }
  function assignModal(userId, after) {
    const db = D(), u = db.users.find(x => x.id === userId); if (!u) return; const have = new Set((u.teaching || []).map(t => t.cls + '|' + t.subject));
    const m = modal('<h3>Classes &amp; subjects for ' + esc(u.name) + '</h3><p class="small muted">The teacher can only open notes and papers, upload material and host calls for the pairs ticked here. Changes apply immediately.</p><div class="stack" style="max-height:55vh;overflow:auto">' + db.classes.map(c => '<div class="card flat" style="padding:10px"><b><span class="badge" style="background:' + esc(c.color) + ';color:#fff">' + esc(c.id) + '</span> ' + esc(c.name) + '</b><div class="row mt" style="flex-wrap:wrap;gap:8px 14px">' + db.subjects.filter(s => s.classes.includes(c.id)).map(s => '<label class="check" style="margin:0"><input type="checkbox" data-p="' + esc(c.id) + '|' + esc(s.id) + '"' + (have.has(c.id + '|' + s.id) ? ' checked' : '') + '><span>' + esc(s.name) + '</span></label>').join('') + '</div></div>').join('') + '</div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-x>Cancel</button><button class="btn orange" data-ok>Save assignments</button></div>', { wide: true });
    m.el.onclick = async e => { if (e.target.closest('[data-x]')) m.close(); if (e.target.closest('[data-ok]')) { const list = [...m.el.querySelectorAll('[data-p]:checked')].map(c => { const [cls, subject] = c.dataset.p.split('|'); return { cls, subject }; }); const r = await Server.setTeaching(userId, list); if (out(r, 'Assignments saved.')) { m.close(); (after || shellHtml)(); } } };
  }
  function people(p) {
    const staff = D().users.filter(u => u.role !== 'student');
    p.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Teaches</th><th>Status</th><th></th></tr></thead><tbody>' + staff.map(u => '<tr><td>' + esc(u.name) + '</td><td class="small">' + esc(u.contact) + '</td><td>' + (u.id === me.id ? esc(u.role) : sel('r-' + u.id, [['admin', 'Administrator'], ['reviewer', 'Reviewer'], ['teacher', 'Teacher'], ['contributor', 'Contributor']], u.role)) + '</td><td>' + (u.role === 'teacher' ? teachSummary(u) + '<br><button class="btn sm ghost" data-as="' + u.id + '">Classes &amp; subjects</button>' : '<span class="muted small">—</span>') + '</td><td>' + esc(u.status) + '</td><td class="right">' + (u.id === me.id ? '<span class="muted small">you</span>' : '<button class="btn sm ghost" data-rs="' + u.id + '">Save role</button> <button class="btn sm ghost" data-st="' + u.id + '|' + (u.status === 'active' ? 'suspended' : 'active') + '">' + (u.status === 'active' ? 'Suspend' : 'Reactivate') + '</button>') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<form id="af" class="card mt"><h3>Add a staff member</h3><p class="small muted">Teachers sign in on their own Teacher portal, use the app free, and can only reach the classes and subjects you assign. Reviewers approve content. Administrators manage everything. Contributors can submit content without class limits.</p><div class="grid g4"><div class="field"><label for="an">Name</label><input id="an"></div><div class="field"><label for="ae">Email</label><input id="ae" type="email"></div><div class="field"><label for="ar">Role</label>' + sel('ar', [['teacher', 'Teacher'], ['reviewer', 'Reviewer'], ['admin', 'Administrator'], ['contributor', 'Contributor (no class limits)']]) + '</div><div class="field"><label for="apw">Temporary password</label><input id="apw" type="password" autocomplete="new-password"></div></div><button class="btn orange" type="submit">Add staff member</button></form>';
    p.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => { if (out(await Server.setRole(b.dataset.rs, val('r-' + b.dataset.rs)), 'Role updated.')) shellHtml(); });
    p.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.st.split('|'); if (out(await Server.setUserStatus(id, st), 'Updated.')) shellHtml(); });
    p.querySelectorAll('[data-as]').forEach(b => b.onclick = () => assignModal(b.dataset.as));
    document.getElementById('af').onsubmit = async e => { e.preventDefault(); const role = val('ar'), email = USL.normContact(val('ae')); if (out(await Server.addStaff({ name: val('an'), contact: val('ae'), role, password: val('apw') }), 'Staff member added.')) { shellHtml(); if (role === 'teacher') { const u = D().users.find(x => x.contact === email); if (u) assignModal(u.id); } } };
  }

  function settings(p) {
    const c = D().cfg;
    p.innerHTML = '<form id="sf" class="card stack" style="max-width:640px"><h3>Plan &amp; limits</h3><div class="grid g2"><div class="field"><label for="c1">Monthly price (UGX)</label><input id="c1" type="number" value="' + c.price + '"></div><div class="field"><label for="c2">Days of access per payment</label><input id="c2" type="number" value="' + c.days + '"></div><div class="field"><label for="c3">Free trial (minutes)</label><input id="c3" type="number" value="' + c.trialMinutes + '"><div class="hint">Applies to trials that start after you save.</div></div><div class="field"><label for="c4">Tutor questions per student per day</label><input id="c4" type="number" value="' + c.aiDailyLimit + '"></div><div class="field"><label for="c5">Estimated cost per tutor call (UGX)</label><input id="c5" type="number" value="' + c.aiCostPerCall + '"></div></div><h3 class="mt">Payments &amp; WhatsApp</h3><div class="grid g2"><div class="field"><label for="c7">Number that receives payments</label><input id="c7" inputmode="tel" value="' + esc(c.payNumber) + '"><div class="hint">Shown to students on the payment page. Students are told to send money here when automatic payment is not set up. For automatic payments, set the same number as the payout account in Flutterwave.</div></div><div class="field"><label for="c8">WhatsApp number for notifications</label><input id="c8" inputmode="tel" value="' + esc(c.whatsappNumber) + '"></div></div><label class="check"><input type="checkbox" id="c9"' + (c.whatsappNotify ? ' checked' : '') + '><span>Send me a WhatsApp message for every payment</span></label><button class="btn orange" type="submit">Save settings</button></form>' + (function () { const sv = c.services || {}; return '<div class="card mt" style="max-width:640px"><h3>Services connected to this site</h3><p class=\"small mb0\">App version: <b>' + esc(globalThis.USL_BUILD || 'unknown') + '</b></p><ul class="list">' + [['Database (accounts, content)', true], ['SMS codes (Africa\'s Talking)', sv.sms], ['Email codes (Resend)', sv.email], ['Automatic mobile money (Flutterwave)', sv.pay], ['WhatsApp sending' + (sv.whatsapp ? ' (' + sv.whatsapp + ')' : ''), !!sv.whatsapp]].map(x => '<li class="item"><span>' + x[0] + '</span>' + (x[1] ? '<span class="badge ok">connected</span>' : '<span class="badge warn">not set up</span>') + '</li>').join('') + '</ul><p class="hint mb0">App version: ' + esc(USL.build || 'unknown') + '. Add the missing keys in Vercel → Settings → Environment Variables, then redeploy. Without SMS, students who sign up with a phone number cannot get a code. Without Flutterwave, payments are confirmed by you in the Payments tab.</p></div>'; })();
    document.getElementById('sf').onsubmit = async e => { e.preventDefault(); out(await Server.saveConfig({ price: val('c1'), days: val('c2'), trialMinutes: val('c3'), aiDailyLimit: val('c4'), aiCostPerCall: val('c5'), payNumber: val('c7'), whatsappNumber: val('c8'), whatsappNotify: chk('c9') }), 'Settings saved.'); };
  }

  function audit(p) {
    p.innerHTML = '<div class="tablewrap"><table><thead><tr><th>When</th><th>Action</th><th>User</th><th>Detail</th></tr></thead><tbody>' + D().audit.slice(0, 200).map(a => '<tr><td class="small">' + fmtDate(a.at) + '</td><td><code>' + esc(a.action) + '</code></td><td class="small">' + esc(userName(a.userId)) + '</td><td class="small">' + esc(a.detail) + '</td></tr>').join('') + '</tbody></table></div><p class="hint">Showing the latest 200 events.</p>';
  }
  shellHtml();
})();

}

/* ---- page: discuss ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'discuss') {
(async function () {
  const { Server, Media, Remote, esc, toast, modal, confirmBox } = USL;
  await Remote.init();
  const ctx = await USL.boot({ page: 'discuss', paid: true });
  const me = ctx.user; if (me.role === 'teacher') { location.replace('live.html'); return; }
  const main = document.getElementById('main'), staff = me.role !== 'student', qs = new URLSearchParams(location.search);
  main.classList.add('wa-main');
  const D0 = Server.data(), isTeacher = me.role === 'teacher', SC = Server.scope(), pairs = isTeacher ? SC.pairs : [];
  const classes = isTeacher ? D0.classes.filter(c => SC.classes.includes(c.id)) : staff ? D0.classes : D0.classes.filter(c => c.id === me.classId);
  if (!classes.length) { main.innerHTML = '<div class="card" style="margin:20px"><h2>No class rooms yet</h2><p>You have not been assigned a class. Ask the administrator to assign your classes and subjects.</p><a class="btn" href="teacher.html">Back</a></div>'; return; }
  let cls = staff ? (classes.find(c => c.id === qs.get('cls')) || classes[0]).id : me.classId;
  const SUBJ = id => (D0.subjects.find(x => x.id === id) || {}).name || id;
  const CNAME = id => (D0.classes.find(c => c.id === id) || {}).name || id, CCOLOR = id => (D0.classes.find(c => c.id === id) || {}).color || '#2563eb';
  const hue = s => { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360; return 'hsl(' + h + ',60%,36%)'; };
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const time = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dayKey = t => new Date(t).toDateString();
  const dayLabel = t => { const d = new Date(t), n = new Date(); if (d.toDateString() === n.toDateString()) return 'Today'; const y = new Date(n); y.setDate(n.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const lsk = (k, c) => 'usl_' + k + '_' + me.id + '_' + (c || cls);
  const getSet = k => { try { return new Set(JSON.parse(USL.LS.getItem(lsk(k)) || '[]')); } catch (e) { return new Set(); } };
  const putSet = (k, set) => USL.LS.setItem(lsk(k), JSON.stringify([...set]));
  const getNum = (k, c) => Number(USL.LS.getItem(lsk(k, c))) || 0;
  const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '👏', '🔥', '💯'];
  const EMO = { '😀': '😀😃😄😁😆😅😂🤣🙂😉😊😇🥰😍🤩😘😋😛😜🤪😎🤓🥳😏😒😞😔😟😕🙁😣😖😫😩🥺😢😭😤😠😡🤯😳😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷', '👍': '👍👎👌✌️🤞🤟🤘🤙👈👉👆👇☝️✋🤚🖐️🖖👋🤝🙏✍️💪👏🙌👐🤲🫶🙋', '❤️': '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝', '📚': '📚📖📝✏️🖊️📏📐🧮🔬🔭🧪🧬🌍🗺️💡🏆🥇🎓🏫🎒🕒⏰✅❌❓❗💯🔥⭐🌟✨🎉🎊', '🍎': '🍎🍌🍉🍇🍓🥭🍍🥕🌽🍞🍚🍲🥤⚽🏀🏐🎵🎶🚌🚲🌳🌧️☀️🌈' };
  const urlCache = new Map();
  const recentSeen = new Set();

  let msgs = [], pres = [], searchTerm = '', matchIdx = -1, replyTo = null, editing = null, recState = null, emoCat = '😀', lastSig = '', newBelow = 0;
  let myRead = 0, unreadFrom = 0, typingUntil = 0, lastTypingPush = 0, legacy = false, presOK = true, lastPing = Date.now(), info = null, hbTimer = null;
  const player = { a: null, id: null, rate: 1 };

  /* ---------- shared server sync (only when the shared server is configured) ---------- */
  const RICH = 'id,cls,user_id,name,role,text,media_id,dur,mime,at,deleted,reports,reply,reactions,edited_at,wave,media_kind', BASIC = 'id,cls,user_id,name,role,text,media_id,dur,mime,at,deleted,reports';
  const NEWCOLS = ['reply', 'reactions', 'edited_at', 'wave', 'media_kind'];
  const sync = {
    async pull() {
      if (!Remote.on) return;
      const q = c => 'usl_messages?cls=eq.' + encodeURIComponent(cls) + '&order=at.desc&limit=150&select=' + c;
      let rows = legacy ? null : await Remote.rest('GET', q(RICH));
      if (!rows) { rows = await Remote.rest('GET', q(BASIC)); if (rows && !legacy) legacy = true; }
      const mutes = await Remote.rest('GET', 'usl_mutes?until=gt.' + Date.now() + '&select=user_id,until');
      if (rows) { const r = Server.mergeRemote(cls, rows, mutes || []); if (r.ok && r.changed) refresh(false); }
      if (presOK) { const p = await Remote.rest('GET', 'usl_presence?cls=eq.' + encodeURIComponent(cls) + '&select=user_id,name,role,seen_at,read_at,typing_until'); if (p === null) { if (!legacy) presOK = false; } else { pres = p; refreshChrome(); refresh(false); } }
    },
    async heartbeat() {
      if (!Remote.on || !presOK) return; const now = Date.now();
      const r = await Remote.rest('POST', 'usl_presence', { user_id: me.id, cls, name: me.name, role: me.role, seen_at: now, read_at: myRead, typing_until: typingUntil > now ? typingUntil : 0 }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      if (r === null && Remote.healthy) presOK = false;
    },
    async push(id) {
      if (!Remote.on) return; const row = Server.messageRow(id); if (!row) return;
      if (row.media_id) { const b = await Media.get(row.media_id); if (b) row.audio = await new Promise(res => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1] || ''); f.readAsDataURL(b); }); }
      if (legacy) NEWCOLS.forEach(c => delete row[c]);
      let ok = await Remote.rest('POST', 'usl_messages', row, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      if (ok === null && !legacy) { legacy = true; NEWCOLS.forEach(c => delete row[c]); ok = await Remote.rest('POST', 'usl_messages', row, { Prefer: 'resolution=merge-duplicates,return=minimal' }); }
      if (ok === null) toast('Could not reach the class server. Your message is only on this device.', 'bad');
    },
    async del(id) { if (Remote.on) await Remote.rest('PATCH', 'usl_messages?id=eq.' + encodeURIComponent(id), { deleted: true, text: '', audio: null }, { Prefer: 'return=minimal' }); },
    async report(id) { if (!Remote.on) return; const row = Server.messageRow(id); if (row) await Remote.rest('PATCH', 'usl_messages?id=eq.' + encodeURIComponent(id), { reports: row.reports }, { Prefer: 'return=minimal' }); },
    async mute(userId, mins) { if (Remote.on) await Remote.rest('POST', 'usl_mutes', { user_id: userId, until: Date.now() + mins * 60000 }, { Prefer: 'resolution=merge-duplicates,return=minimal' }); },
    async edit(id) { if (!Remote.on || legacy) return; const row = Server.messageRow(id); if (row) await Remote.rest('PATCH', 'usl_messages?id=eq.' + encodeURIComponent(id), { text: row.text, edited_at: row.edited_at }, { Prefer: 'return=minimal' }); },
    async react(id, emoji) {
      if (!Remote.on || legacy) return; const cur = await Remote.rest('GET', 'usl_messages?id=eq.' + encodeURIComponent(id) + '&select=reactions'); const rx = (cur && cur[0] && cur[0].reactions) || {};
      if (emoji) rx[me.id] = emoji; else delete rx[me.id]; await Remote.rest('PATCH', 'usl_messages?id=eq.' + encodeURIComponent(id), { reactions: rx }, { Prefer: 'return=minimal' });
    },
    async audio(msgId, mediaId) { const r = await Remote.rest('GET', 'usl_messages?id=eq.' + encodeURIComponent(msgId) + '&select=audio,mime'); if (!r || !r[0] || !r[0].audio) return null; const bin = atob(r[0].audio), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); const b = new Blob([a], { type: r[0].mime || 'audio/webm' }); await Media.put(mediaId, b); return b; }
  };

  /* ---------- helpers ---------- */
  const TICK1 = '<svg viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.8l3.2 3.2L12 1.8"/></svg>';
  const TICK2 = '<svg viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5.8l3.2 3.2L10.5 1.8M6 8.6l.6.6L14 1.8"/></svg>';
  const others = () => pres.filter(p => p.user_id !== me.id);
  function statusOf(m) {
    if (m.userId !== me.id) return ''; const o = others(); if (!Remote.on || !presOK || !o.length) return 'sent';
    if (o.every(p => Number(p.read_at) >= m.at)) return 'read'; if (o.some(p => Number(p.seen_at) >= m.at)) return 'delivered'; return 'sent';
  }
  const tickHtml = st => !st ? '' : (st === 'sent' ? TICK1 : (st === 'read' ? '<span class="rd">' + TICK2 + '</span>' : TICK2));
  const isSys = m => !m.deleted && /^📞 .* started a .* call/.test(m.text || '');
  const nameOf = id => { if (id === me.id) return 'You'; const p = pres.find(x => x.user_id === id); if (p) return p.name; const m = msgs.find(x => x.userId === id); return m ? m.name : 'Someone'; };
  const snippet = m => m.media ? (m.media.kind === 'image' ? '📷 Photo' : '🎤 Voice message ' + mmss(m.media.dur)) : (m.text || '');
  function body(text) {
    let t = esc(text);
    if (searchTerm) { const re = new RegExp('(' + searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'); return t.replace(re, '<mark>$1</mark>'); }
    return t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function waveBars(m) {
    const n = 34, w = m.media.wave && m.media.wave.length ? m.media.wave : null; let seed = 0; for (const ch of m.id) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
    return Array.from({ length: n }, (_, i) => { const v = w ? w[Math.floor(i * w.length / n)] : 18 + ((seed * (i + 3) * 7919) % 70); return '<i style="height:' + Math.max(12, Math.min(100, v)) + '%"></i>'; }).join('');
  }
  function ping() {
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.type = 'sine'; o.frequency.setValueAtTime(880, ac.currentTime); o.frequency.setValueAtTime(1175, ac.currentTime + .09); g.gain.setValueAtTime(.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(.12, ac.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .3); o.start(); o.stop(ac.currentTime + .32); setTimeout(() => ac.close(), 600); } catch (e) { /* no audio */ }
  }
  const muted = () => USL.LS.getItem(lsk('mutenotif')) === '1';

  /* ---------- shell ---------- */
  main.innerHTML = '<div class="wa" id="wa"><aside class="wa-side"><div class="top"><span>Class chats</span></div><div class="find"><input id="cf" placeholder="Search" aria-label="Search chats"></div><div class="wa-list" id="clist"></div></aside><section class="wa-chat" id="chat"></section></div>';
  const wa = document.getElementById('wa');
  if (!staff) wa.classList.add('solo'); wa.classList.add('show-chat');

  function renderSide() {
    const q = (document.getElementById('cf').value || '').toLowerCase();
    document.getElementById('clist').innerHTML = classes.filter(c => (c.id + ' ' + c.name).toLowerCase().includes(q)).map(c => {
      const r = Server.listMessages(c.id); const list = r.ok ? r.messages.filter(m => !m.deleted) : []; const last = list[list.length - 1], rd = c.id === cls ? myRead : getNum('read', c.id);
      const unread = list.filter(m => m.at > rd && m.userId !== me.id && !isSys(m)).length;
      const pv = last ? (last.userId === me.id ? 'You: ' : last.name.split(' ')[0] + ': ') + snippet(last) : 'No messages yet';
      return '<button class="ci' + (c.id === cls ? ' on' : '') + '" data-c="' + esc(c.id) + '" style="--c:' + esc(c.color) + '"><div class="av">' + esc(c.id) + '</div><div class="mid"><div class="t1"><b>' + esc(c.id) + ' · ' + esc(c.name) + '</b><span>' + (last ? time(last.at) : '') + '</span></div><div class="t2"><span class="pv">' + esc(pv) + '</span>' + (unread ? '<span class="badge-n">' + unread + '</span>' : '') + '</div></div></button>';
    }).join('') || '<p class="muted center" style="padding:20px">No chats match.</p>';
  }
  document.getElementById('clist').onclick = e => { const b = e.target.closest('.ci'); if (b) openRoom(b.dataset.c); };
  document.getElementById('cf').oninput = renderSide;

  const chat = document.getElementById('chat');
  function buildChat() {
    const c = classes.find(x => x.id === cls) || { id: cls, name: cls, color: '#2563eb' }; wa.style.setProperty('--c', c.color);
    chat.innerHTML = '<div class="wa-head"><button class="ic back" id="bk" aria-label="Back to chats">←</button><div class="av sm" style="--c:rgba(255,255,255,.25)">' + esc(c.id) + '</div><button class="tt" id="htt" aria-label="Group info"><b>' + esc(c.id) + ' · ' + esc(c.name) + '</b><span id="sub"></span></button>' + '<a class="ic" href="live.html" title="Live lessons" aria-label="Live lessons" style="text-decoration:none">🔴</a>' + '<button class="ic" id="hs" title="Search" aria-label="Search in chat">🔍</button><button class="ic" id="hm" title="Menu" aria-label="Menu">⋮</button></div>'
      + '<div class="wa-search" id="srch"><input id="sq" placeholder="Search in this chat" aria-label="Search in this chat"><span class="small muted" id="sc"></span><button class="ic" id="sup" aria-label="Previous match">▲</button><button class="ic" id="sdn" aria-label="Next match">▼</button><button class="ic" id="sx" aria-label="Close search">✕</button></div>'
      + '<div class="netbar" id="net"></div><div id="callpill"></div><div class="wa-msgs" id="msgs" role="log" aria-live="polite" aria-label="Class messages"></div><button class="fab" id="fab" aria-label="Jump to latest">⌄</button><div id="rpwrap"></div><div class="wa-comp" id="comp"></div><aside class="info" id="info" aria-label="Group info"></aside>';
    document.getElementById('bk').onclick = () => { wa.classList.remove('show-chat'); renderSide(); };
    document.getElementById('htt').onclick = () => openInfo();
    document.getElementById('hs').onclick = () => toggleSearch(true); document.getElementById('sx').onclick = () => toggleSearch(false);
    document.getElementById('sq').oninput = e => { searchTerm = e.target.value.trim(); matchIdx = -1; lastSig = ''; refresh(true, true); stepMatch(1); };
    document.getElementById('sdn').onclick = () => stepMatch(1); document.getElementById('sup').onclick = () => stepMatch(-1);
    document.getElementById('hm').onclick = e => headMenu(e.currentTarget);
    const box = document.getElementById('msgs'); box.onscroll = () => { updFab(); if (nearBottom()) markRead(); };
    document.getElementById('fab').onclick = () => { box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }); };
    box.onclick = onMsgClick; bindGestures(box); buildComposer();
  }
  const nearBottom = () => { const b = document.getElementById('msgs'); return !b || b.scrollHeight - b.scrollTop - b.clientHeight < 60; };
  function updFab() { const f = document.getElementById('fab'); if (!f) return; const away = !nearBottom(); f.classList.toggle('on', away); f.innerHTML = '⌄' + (away && newBelow ? '<i>' + newBelow + '</i>' : ''); if (!away) newBelow = 0; }
  function toggleSearch(on) { const s = document.getElementById('srch'); s.classList.toggle('on', on); if (on) document.getElementById('sq').focus(); else { searchTerm = ''; document.getElementById('sq').value = ''; document.getElementById('sc').textContent = ''; lastSig = ''; refresh(true); } }
  function stepMatch(d) {
    const hits = [...document.querySelectorAll('#msgs .b mark')].map(m => m.closest('.b')).filter((b, i, a) => a.indexOf(b) === i); const sc = document.getElementById('sc');
    if (!searchTerm) { sc.textContent = ''; return; } if (!hits.length) { sc.textContent = 'No matches'; return; }
    matchIdx = ((matchIdx < 0 ? (d > 0 ? -1 : 0) : matchIdx) + d + hits.length) % hits.length; sc.textContent = (matchIdx + 1) + ' of ' + hits.length; hits[matchIdx].scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(hits[matchIdx]);
  }
  const flash = el => { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); };

  /* ---------- header / chrome ---------- */
  function refreshChrome() {
    const sub = document.getElementById('sub'); if (!sub) return; const now = Date.now();
    const typing = others().filter(p => Number(p.typing_until) > now).map(p => p.name.split(' ')[0]);
    const online = others().filter(p => now - Number(p.seen_at) < 12000).length + 1;
    const known = new Set(pres.map(p => p.user_id).concat(msgs.map(m => m.userId), [me.id])).size; const ri = Server.roomInfo(cls), members = Math.max(known, ri.ok ? ri.members : 0);
    sub.textContent = typing.length ? (typing.length === 1 ? typing[0] + ' is typing…' : typing.join(', ') + ' are typing…') : (Remote.on && presOK ? online + ' online · ' + members + ' members' : members + ' member' + (members === 1 ? '' : 's') + ' · tap for group info');
    const n = document.getElementById('net'); if (n) {
      let html = ''; if (!Remote.on) html = '⚠️ <b>Not connected to the class server.</b> Messages and calls stay on this device only. The site owner must finish the shared-server setup (README → Class rooms).';
      else if (!Remote.healthy) html = 'Connection to the class server was lost. Retrying…'; else if (legacy || !presOK) html = '⚙️ Run <b>supabase-upgrade.sql</b> in Supabase to turn on replies, reactions, read ticks and typing.';
      n.innerHTML = html; n.classList.toggle('ok', !html);
    }
    renderCall(); const unreadAll = classes.reduce((a, c) => a + (c.id === cls ? 0 : 0), 0); void unreadAll;
  }
  function applyMuteBox() {
    const m = Server.roomInfo(cls); const comp = document.getElementById('comp'); if (!comp || !m.ok) return; const isMuted = !!m.mutedUntil;
    if (isMuted && !comp.dataset.muted) { comp.dataset.muted = '1'; comp.innerHTML = '<div class="alert warn" style="margin:0;flex:1">You are muted in this room until ' + time(m.mutedUntil) + '.</div>'; }
    if (!isMuted && comp.dataset.muted) { delete comp.dataset.muted; buildComposer(); }
  }

  /* ---------- messages ---------- */
  function visibleMsgs() { const hide = getSet('hide'), cleared = getNum('clear'); return msgs.filter(m => !hide.has(m.id) && m.at > cleared); }
  function refresh(force, keepScroll) {
    const r = Server.listMessages(cls); if (!r.ok) return; msgs = r.messages; const list = visibleMsgs(), star = getSet('star');
    const sig = list.map(m => [m.id, m.deleted ? 'd' : '', m.editedAt, JSON.stringify(m.reactions), statusOf(m), star.has(m.id) ? 's' : '', m.reports || ''].join(':')).join(',') + '|' + searchTerm; const box = document.getElementById('msgs'); if (!box) return;
    // new incoming messages: sound, desktop notification, unread counter
    const incoming = list.filter(m => m.at > lastPing && m.userId !== me.id && !m.deleted && !isSys(m)); if (incoming.length) { lastPing = Math.max(...incoming.map(m => m.at)); if (!recentSeen.has(lastPing)) { recentSeen.add(lastPing); if (!muted() && (document.hidden || !nearBottom())) { ping(); if (!nearBottom()) newBelow += incoming.length; } if (document.hidden && 'Notification' in window && Notification.permission === 'granted' && !muted()) { try { new Notification(cls + ' room · ' + incoming[incoming.length - 1].name, { body: snippet(incoming[incoming.length - 1]).slice(0, 90) }); } catch (e) { /* ignore */ } } } }
    if (!force && sig === lastSig) { updTitle(); return; } lastSig = sig;
    const stick = force && !keepScroll ? true : nearBottom(), prevTop = box.scrollTop; let prev = null, prevDay = '', shownUnread = false;
    const html = list.map(m => {
      let out = ''; const dk = dayKey(m.at); if (dk !== prevDay) { out += '<div class="dchip">' + dayLabel(m.at) + '</div>'; prevDay = dk; prev = null; }
      if (!shownUnread && unreadFrom && m.at > unreadFrom && m.userId !== me.id && !isSys(m)) { out += '<div class="unread">Unread messages</div>'; shownUnread = true; prev = null; }
      if (isSys(m)) { prev = null; return out + '<div class="sys">' + esc(m.text) + ' · ' + time(m.at) + '</div>'; }
      const mine = m.userId === me.id, first = !prev || prev.userId !== m.userId || m.at - prev.at > 5 * 60000; prev = m;
      const st = statusOf(m), rx = Object.values(m.reactions || {}), meta = '<span class="meta">' + (star.has(m.id) ? '⭐' : '') + (m.editedAt && !m.deleted ? '<i style="font-style:normal">edited</i>' : '') + time(m.at) + (mine ? tickHtml(st) : '') + '</span>';
      if (m.deleted) return out + '<div class="b ' + (mine ? 'me ' : '') + (first ? 'first ' : '') + 'del" data-id="' + esc(m.id) + '"><span class="tx">🚫 ' + (mine ? 'You deleted this message' : 'This message was deleted') + '</span>' + meta + '</div>';
      let inner = '';
      if (!mine && first) inner += '<div class="who"><span style="color:' + hue(m.name) + '">' + esc(m.name) + '</span>' + (m.role !== 'student' ? '<span class="tag">' + (m.role === 'admin' ? 'Admin' : 'Teacher') + '</span>' : '') + '</div>';
      if (m.reply) inner += '<button class="quote" data-q="' + esc(m.reply.id) + '" style="--q:' + hue(m.reply.name) + '"><b>' + esc(m.reply.userId === me.id ? 'You' : m.reply.name) + '</b><span>' + esc(m.reply.kind === 'image' ? '📷 Photo' : m.reply.kind === 'voice' ? '🎤 Voice message' : m.reply.text) + '</span></button>';
      if (m.media && m.media.kind === 'image') inner += '<img class="ph" data-img="' + esc(m.media.id) + '" data-mid="' + esc(m.id) + '" alt="Picture shared by ' + esc(m.name) + '" width="260" height="180" style="background:#e6e9ec">';
      else if (m.media) inner += '<div class="vn" data-id="' + esc(m.id) + '" data-m="' + esc(m.media.id) + '" data-dur="' + m.media.dur + '"><button class="pl" aria-label="Play voice message">▶</button><div class="wv">' + waveBars(m) + '</div><span class="dur">' + mmss(m.media.dur) + '</span><button class="sp" aria-label="Playback speed">1×</button></div>';
      if (m.text) inner += '<span class="tx">' + body(m.text) + '</span>';
      const rxs = rx.length ? '<div class="rxs">' + Object.entries(rx.reduce((a, e) => (a[e] = (a[e] || 0) + 1, a), {})).map(([e, n]) => '<button data-rx="' + esc(m.id) + '" aria-label="Reaction ' + e + '">' + e + (n > 1 ? ' ' + n : '') + '</button>').join('') + '</div>' : '';
      return out + '<div class="b ' + (mine ? 'me ' : '') + (first ? 'first ' : '') + (rx.length ? 'hasrx' : '') + '" data-id="' + esc(m.id) + '">' + inner + meta + '<button class="chev" data-menu="' + esc(m.id) + '" aria-label="Message options">▾</button>' + rxs + '</div>';
    }).join('');
    box.innerHTML = html || '<div class="sys" style="margin:auto">No messages yet. Say hello! 👋</div>';
    if (stick) box.scrollTop = box.scrollHeight; else box.scrollTop = prevTop; hydrate(box); updPlayer(); updFab(); if (searchTerm) stepMatch(0);
    if (nearBottom()) markRead(); renderSide(); refreshChrome(); updTitle();
  }
  function hydrate(box) {
    box.querySelectorAll('img.ph[data-img]').forEach(async img => {
      const id = img.dataset.img; let u = urlCache.get(id); if (!u) { let b = await Media.get(id); if (!b && Remote.on) b = await sync.audio(img.dataset.mid, id); if (!b) { img.alt = '📷 Photo unavailable on this device'; return; } u = URL.createObjectURL(b); urlCache.set(id, u); } img.src = u; img.removeAttribute('width'); img.removeAttribute('height'); img.style.background = 'none';
    });
  }
  function updTitle() { const n = visibleMsgs().filter(m => m.at > myRead && m.userId !== me.id && !m.deleted && !isSys(m)).length; document.title = (n ? '(' + n + ') ' : '') + 'Class chat – Uganda Smart Learning'; }
  function markRead() {
    if (document.visibilityState !== 'visible' || !msgs.length) return; const latest = Math.max(...msgs.map(m => m.at)); if (latest > myRead) { myRead = latest; USL.LS.setItem(lsk('read'), String(myRead)); sync.heartbeat(); renderSide(); updTitle(); }
  }

  /* ---------- gestures: tap chevron / long-press for menu, swipe right to reply ---------- */
  function bindGestures(box) {
    let t0 = null, timer = null, sx = 0, sy = 0, el = null, dx = 0;
    box.addEventListener('pointerdown', e => { const b = e.target.closest('.b:not(.del)'); if (!b || e.target.closest('button,a,img')) return; el = b; sx = e.clientX; sy = e.clientY; dx = 0; t0 = Date.now(); if (e.pointerType === 'touch') timer = setTimeout(() => { timer = null; const m = msgs.find(x => x.id === b.dataset.id); if (m) openMenu(m, b); }, 480); });
    box.addEventListener('pointermove', e => { if (!el) return; dx = e.clientX - sx; if (Math.abs(e.clientY - sy) > 12 || Math.abs(dx) > 12) { clearTimeout(timer); timer = null; } if (e.pointerType === 'touch' && dx > 0 && Math.abs(e.clientY - sy) < 30) el.style.transform = 'translateX(' + Math.min(dx, 70) + 'px)'; });
    const end = () => { clearTimeout(timer); if (el) { if (dx > 60) { const m = msgs.find(x => x.id === el.dataset.id); if (m && !m.deleted) startReply(m); } el.style.transform = ''; } el = null; };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end); box.addEventListener('contextmenu', e => { const b = e.target.closest('.b:not(.del)'); if (b) { e.preventDefault(); const m = msgs.find(x => x.id === b.dataset.id); if (m) openMenu(m, b); } });
  }
  function onMsgClick(e) {
    const mn = e.target.closest('[data-menu]'); if (mn) { const m = msgs.find(x => x.id === mn.dataset.menu); if (m) openMenu(m, mn.closest('.b')); return; }
    const q = e.target.closest('[data-q]'); if (q) { const t = document.querySelector('.b[data-id="' + CSS.escape(q.dataset.q) + '"]'); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); flash(t); } else toast('That message is older than what is loaded.', ''); return; }
    const rx = e.target.closest('[data-rx]'); if (rx) { showReactors(rx.dataset.rx); return; }
    const img = e.target.closest('img.ph'); if (img && img.src) { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = '<img alt="Picture">'; lb.firstChild.src = img.src; lb.onclick = () => lb.remove(); document.body.appendChild(lb); return; }
    const vn = e.target.closest('.vn'); if (vn) { if (e.target.closest('.sp')) { player.rate = player.rate === 1 ? 1.5 : player.rate === 1.5 ? 2 : 1; if (player.a) player.a.playbackRate = player.rate; updPlayer(); } else if (e.target.closest('.pl')) playVoice(vn.dataset.id, vn.dataset.m); else if (e.target.closest('.wv')) { /* seek */ const wv = e.target.closest('.wv'), rc = wv.getBoundingClientRect(); if (player.id === vn.dataset.id && player.a) player.a.currentTime = ((e.clientX - rc.left) / rc.width) * Number(vn.dataset.dur); } }
  }

  /* ---------- voice playback ---------- */
  async function playVoice(msgId, mediaId) {
    if (player.id === msgId && player.a) { player.a.paused ? player.a.play() : player.a.pause(); return; }
    stopPlayer(); let url = urlCache.get(mediaId); if (!url) { let b = await Media.get(mediaId); if (!b && Remote.on) b = await sync.audio(msgId, mediaId); if (!b) return toast('This voice message is not available on your device.', 'bad'); url = URL.createObjectURL(b); urlCache.set(mediaId, url); }
    const a = new Audio(url); a.playbackRate = player.rate; player.a = a; player.id = msgId; a.ontimeupdate = updPlayer; a.onpause = updPlayer; a.onplay = updPlayer; a.onended = () => { stopPlayer(); }; a.play().catch(() => stopPlayer()); updPlayer();
  }
  function stopPlayer() { if (player.a) { try { player.a.pause(); } catch (e) { /* ignore */ } } player.a = null; player.id = null; updPlayer(); }
  function updPlayer() {
    document.querySelectorAll('.vn').forEach(el => {
      const on = el.dataset.id === player.id && player.a, dur = Number(el.dataset.dur) || 1, pr = on ? Math.min(1, player.a.currentTime / dur) : 0;
      el.querySelector('.pl').textContent = on && !player.a.paused ? '⏸' : '▶'; el.querySelectorAll('.wv i').forEach((b, i, all) => b.classList.toggle('on', i / all.length < pr));
      el.querySelector('.dur').textContent = on ? mmss(Math.floor(player.a.currentTime)) : mmss(dur); el.querySelector('.sp').textContent = (on ? player.rate : 1) + '×';
    });
  }

  /* ---------- message menu ---------- */
  let menuEl = null;
  const closeMenu = () => { if (menuEl) { menuEl.remove(); menuEl = null; } };
  document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-menu]')) closeMenu(); }, true);
  function openMenu(m, anchor) {
    closeMenu(); const mine = m.userId === me.id, star = getSet('star'), mem = m.at > Date.now() - 15 * 60000, items = [];
    if (!m.deleted) {
      items.push(['reply', '↩️', 'Reply']); if (m.text) items.push(['copy', '📋', 'Copy']); items.push(['star', '⭐', star.has(m.id) ? 'Unstar' : 'Star']);
      if (mine || staff) items.push(['info', 'ℹ️', 'Message info']); if (mine && !m.media && mem) items.push(['edit', '✏️', 'Edit']);
      if (!mine) items.push(['report', '🚩', 'Report']); if (staff && !mine && m.role === 'student') items.push(['mute', '🔇', 'Mute student 60 min']);
    }
    items.push(['del', '🗑️', 'Delete', 'bad']);
    const mm = document.createElement('div'); mm.className = 'mmenu'; mm.setAttribute('role', 'menu');
    mm.innerHTML = (m.deleted ? '' : '<div class="rxbar">' + QUICK.map(e => '<button data-e="' + e + '" class="' + (m.reactions && m.reactions[me.id] === e ? 'mine' : '') + '" aria-label="React ' + e + '">' + e + '</button>').join('') + '</div>') + items.map(i => '<button class="it ' + (i[3] || '') + '" data-a="' + i[0] + '" role="menuitem"><span>' + i[1] + '</span>' + i[2] + '</button>').join('');
    document.body.appendChild(mm); menuEl = mm; const r = anchor.getBoundingClientRect(), w = mm.offsetWidth, h = mm.offsetHeight;
    let left = mine ? r.right - w : r.left; left = Math.max(8, Math.min(left, window.innerWidth - w - 8)); let top = r.bottom + 4; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4); mm.style.left = left + 'px'; mm.style.top = top + 'px';
    mm.onclick = async e => {
      const eb = e.target.closest('[data-e]'), ab = e.target.closest('[data-a]'); if (eb) { closeMenu(); return react(m, eb.dataset.e); } if (!ab) return; closeMenu(); const a = ab.dataset.a;
      if (a === 'reply') startReply(m); if (a === 'copy') { try { await navigator.clipboard.writeText(m.text); toast('Copied.', 'ok'); } catch (er) { toast('Could not copy on this browser.', 'bad'); } }
      if (a === 'star') { const s = getSet('star'); s.has(m.id) ? s.delete(m.id) : s.add(m.id); putSet('star', s); refresh(true, true); }
      if (a === 'info') showInfo(m); if (a === 'edit') startEdit(m); if (a === 'del') askDelete(m);
      if (a === 'report') { if (await confirmBox('Report this message to the teachers? They will review it.', { title: 'Report message', ok: 'Report' })) { const r = Server.reportMessage(m.id); if (r.ok) sync.report(m.id); toast(r.ok ? 'Reported. Thank you.' : r.error, r.ok ? 'ok' : 'bad'); refresh(true, true); } }
      if (a === 'mute') { const r = Server.muteUser(m.userId, 60); if (r.ok) sync.mute(m.userId, 60); toast(r.ok ? 'Student muted for 60 minutes.' : r.error, r.ok ? 'ok' : 'bad'); }
    };
  }
  function react(m, emoji) { const r = Server.reactMessage(m.id, emoji); if (!r.ok) return toast(r.error, 'bad'); sync.react(m.id, r.reactions[me.id] || null); refresh(true, true); }
  function askDelete(m) {
    const mine = m.userId === me.id, canAll = (mine || staff) && !m.deleted;
    const dlg = modal('<h3>Delete message?</h3><div class="stack" style="gap:8px">' + (canAll ? '<button class="btn danger block" data-v="all">Delete for everyone</button>' : '') + '<button class="btn ghost block" data-v="me">Delete for me</button><button class="btn ghost block" data-v="no">Cancel</button></div>');
    dlg.el.onclick = e => { const b = e.target.closest('button'); if (!b) return; const v = b.dataset.v; dlg.close(); if (v === 'me') { const s = getSet('hide'); s.add(m.id); putSet('hide', s); refresh(true, true); }
      if (v === 'all') { const r = Server.deleteMessage(m.id); if (!r.ok) return toast(r.error, 'bad'); if (r.mediaId) Media.del(r.mediaId); sync.del(m.id); refresh(true, true); } };
  }
  function showInfo(m) {
    const o = others(), read = o.filter(p => Number(p.read_at) >= m.at), deliv = o.filter(p => Number(p.seen_at) >= m.at && Number(p.read_at) < m.at);
    const li = (a, t) => a.length ? '<h4 style="margin:12px 0 4px">' + t + '</h4>' + a.map(p => '<div class="mem"><div class="av sm" style="--c:' + hue(p.name) + '">' + esc(initials(p.name)) + '</div>' + esc(p.name) + '</div>').join('') : '';
    modal('<h3>Message info</h3><div class="b me first" style="max-width:100%;--c:' + esc(CCOLOR(cls)) + '"><span class="tx">' + esc(snippet(m)) + '</span><span class="meta">' + time(m.at) + '</span></div>' + (Remote.on && presOK ? (li(read, 'Read by') + li(deliv, 'Delivered to') || '<p class="muted">Nobody else has opened the room since this was sent.</p>') : '<p class="muted">Read receipts need the shared class server.</p>') + '<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-close>Close</button></div>').el.onclick = e => { if (e.target.closest('[data-close]')) e.currentTarget.closest('.overlay').remove(); };
  }
  function showReactors(id) {
    const m = msgs.find(x => x.id === id); if (!m) return; const rows = Object.entries(m.reactions || {}).map(([uid2, e]) => '<div class="mem"><div class="av sm" style="--c:' + hue(nameOf(uid2)) + '">' + esc(initials(nameOf(uid2))) + '</div><b>' + esc(nameOf(uid2)) + '</b><span style="margin-left:auto;font-size:1.3rem">' + e + '</span></div>').join('');
    const d = modal('<h3>Reactions</h3>' + (rows || '<p class="muted">No reactions.</p>') + '<div class="row" style="justify-content:space-between;margin-top:12px">' + (m.reactions && m.reactions[me.id] ? '<button class="btn ghost" data-rm>Remove my reaction</button>' : '<span></span>') + '<button class="btn ghost" data-close>Close</button></div>');
    d.el.onclick = e => { if (e.target.closest('[data-rm]')) { d.close(); react(m, m.reactions[me.id]); } else if (e.target.closest('[data-close]')) d.close(); };
  }
  function headMenu(anchor) {
    closeMenu(); const mm = document.createElement('div'); mm.className = 'mmenu'; const mu = muted();
    mm.innerHTML = [['info', 'ℹ️', 'Group info'], ['search', '🔍', 'Search'], ['starred', '⭐', 'Starred messages'], ['mute', mu ? '🔔' : '🔕', mu ? 'Unmute notifications' : 'Mute notifications'], ['clear', '🧹', 'Clear chat (for me)']].map(i => '<button class="it" data-a="' + i[0] + '"><span>' + i[1] + '</span>' + i[2] + '</button>').join('');
    document.body.appendChild(mm); menuEl = mm; const r = anchor.getBoundingClientRect(); mm.style.top = (r.bottom + 4) + 'px'; mm.style.left = Math.max(8, Math.min(r.right - mm.offsetWidth, window.innerWidth - mm.offsetWidth - 8)) + 'px';
    mm.onclick = async e => { const b = e.target.closest('[data-a]'); if (!b) return; closeMenu(); const a = b.dataset.a;
      if (a === 'info') openInfo(); if (a === 'search') toggleSearch(true); if (a === 'starred') showStarred(); if (a === 'mute') { USL.LS.setItem(lsk('mutenotif'), mu ? '0' : '1'); toast(mu ? 'Notifications on.' : 'Notifications muted for this chat.', 'ok'); }
      if (a === 'clear' && await confirmBox('Clear this chat on your device? Other people still keep their messages.', { title: 'Clear chat', ok: 'Clear' })) { USL.LS.setItem(lsk('clear'), String(Date.now())); refresh(true); } };
  }
  function showStarred() {
    const st = getSet('star'), list = msgs.filter(m => st.has(m.id) && !m.deleted); const d = modal('<h3>Starred messages</h3>' + (list.length ? list.map(m => '<div class="card flat" style="margin-bottom:8px;padding:10px"><b style="color:' + hue(m.name) + '">' + esc(m.name) + '</b> <span class="muted small">' + dayLabel(m.at) + ' ' + time(m.at) + '</span><br>' + esc(snippet(m)) + '</div>').join('') : '<p class="muted">Long-press or tap ▾ on a message and choose Star to keep it here.</p>') + '<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Close</button></div>');
    d.el.onclick = e => { if (e.target.closest('[data-close]')) d.close(); };
  }
  function openInfo() {
    const c = classes.find(x => x.id === cls) || { id: cls, name: cls, color: '#2563eb' }, el = document.getElementById('info'), now = Date.now(); const ri = Server.roomInfo(cls);
    const map = new Map(); msgs.forEach(m => map.set(m.userId, { name: m.name, role: m.role })); pres.forEach(p => map.set(p.user_id, { name: p.name, role: p.role })); map.set(me.id, { name: me.name, role: me.role });
    const mem = [...map.entries()].map(([id, v]) => ({ id, name: v.name, role: v.role, online: id === me.id || pres.some(p => p.user_id === id && now - Number(p.seen_at) < 12000) })).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    el.innerHTML = '<div class="hd"><button class="ic" id="ix" aria-label="Close">←</button>Group info</div><div class="sec ctr"><div class="av lg" style="margin:0 auto">' + esc(c.id) + '</div><h3>' + esc(c.id) + ' · ' + esc(c.name) + '</h3><span class="muted small">Class group · ' + Math.max(mem.length, ri.ok ? ri.members : 0) + ' members</span></div>'
      + '<div class="sec"><b>Room rules</b><p class="small muted mb0" style="margin-top:6px">Be kind and stay on schoolwork. Teachers and school staff can read this room. Never share phone numbers, addresses, passwords or photos of yourself. Report anything that worries you. There are no private messages.</p></div>'
      + '<div class="sec"><button class="row2" id="ist"><span>⭐ Starred messages</span><span class="muted">' + getSet('star').size + '</span></button><button class="row2" id="imu"><span>' + (muted() ? '🔕 Notifications muted' : '🔔 Notifications on') + '</span><span class="muted">tap to change</span></button></div>'
      + '<div class="sec"><b>' + mem.length + ' member' + (mem.length === 1 ? '' : 's') + ' seen here</b>' + mem.map(m => '<div class="mem"><div class="av sm" style="--c:' + hue(m.name) + '">' + esc(initials(m.name)) + '</div><div>' + esc(m.id === me.id ? m.name + ' (you)' : m.name) + (m.role !== 'student' ? ' <span class="badge info">' + (m.role === 'admin' ? 'Admin' : 'Teacher') + '</span>' : '') + '</div>' + (m.online && Remote.on ? '<span class="dot" title="Online"></span>' : '') + '</div>').join('') + '</div>' + (staff ? '<div class="sec"><a class="btn ghost block" href="admin.html">Open moderation tools</a></div>' : '');
    el.classList.add('on'); document.getElementById('ix').onclick = () => el.classList.remove('on'); document.getElementById('ist').onclick = showStarred;
    document.getElementById('imu').onclick = () => { USL.LS.setItem(lsk('mutenotif'), muted() ? '0' : '1'); openInfo(); };
  }

  /* ---------- composer ---------- */
  const newMediaId = () => 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  function buildComposer() {
    const comp = document.getElementById('comp'); if (!comp) return; delete comp.dataset.muted;
    comp.innerHTML = '<div class="emo" id="emo"></div><div class="pill"><button class="ic" id="emb" aria-label="Emoji" type="button">😊</button><textarea id="tx" rows="1" placeholder="Type a message" maxlength="1000" aria-label="Message"></textarea>' + (staff ? '<button class="ic" id="att" aria-label="Send a picture" type="button">📎</button><input type="file" id="file" accept="image/jpeg,image/png,image/webp" hidden>' : '') + '</div><button class="go" id="go" aria-label="Record voice message" type="button">🎤</button>';
    const tx = document.getElementById('tx'), go = document.getElementById('go');
    const sync2 = () => { tx.style.height = 'auto'; tx.style.height = Math.min(120, tx.scrollHeight) + 'px'; go.textContent = tx.value.trim() ? '➤' : '🎤'; go.setAttribute('aria-label', tx.value.trim() ? 'Send' : 'Record voice message'); };
    tx.oninput = () => { sync2(); const n = Date.now(); typingUntil = n + 4000; if (n - lastTypingPush > 2500) { lastTypingPush = n; sync.heartbeat(); } };
    tx.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); sendText(); } };
    go.onclick = () => { if (tx.value.trim()) sendText(); else startRec(); };
    document.getElementById('emb').onclick = () => toggleEmoji();
    const att = document.getElementById('att'); if (att) { att.onclick = () => document.getElementById('file').click(); document.getElementById('file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) sendPhoto(f); }; }
    renderReplyBar(); sync2();
  }
  function renderReplyBar() {
    const w = document.getElementById('rpwrap'); if (!w) return; const x = editing || replyTo;
    w.innerHTML = x ? '<div class="rpbar"><div class="quote" style="--q:' + hue(x.name) + '"><b>' + (editing ? 'Edit message' : 'Replying to ' + esc(x.userId === me.id ? 'yourself' : x.name)) + '</b><span>' + esc(snippet(x)) + '</span></div><button class="ic" id="rpx" aria-label="Cancel">✕</button></div>' : '';
    const b = document.getElementById('rpx'); if (b) b.onclick = () => { const wasEdit = !!editing; replyTo = null; editing = null; renderReplyBar(); if (wasEdit) { const tx = document.getElementById('tx'); if (tx) { tx.value = ''; tx.dispatchEvent(new Event('input')); } } };
  }
  function startReply(m) { editing = null; replyTo = m; renderReplyBar(); const tx = document.getElementById('tx'); if (tx) tx.focus(); }
  function startEdit(m) { replyTo = null; editing = m; renderReplyBar(); const tx = document.getElementById('tx'); if (tx) { tx.value = m.text; tx.dispatchEvent(new Event('input')); tx.focus(); } }
  function toggleEmoji() {
    const e = document.getElementById('emo'); if (!e) return; if (e.classList.toggle('on')) renderEmoji(); }
  function renderEmoji() {
    const e = document.getElementById('emo'); const list = [...EMO[emoCat]].filter(x => x.trim() && x !== '️');
    // split into whole emoji (handles variation selectors and ZWJ pairs well enough for this fixed set)
    const items = EMO[emoCat].match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*/gu) || list;
    e.innerHTML = '<div class="cats">' + Object.keys(EMO).map(k => '<button type="button" data-k="' + k + '" class="' + (k === emoCat ? 'on' : '') + '">' + k + '</button>').join('') + '</div><div class="grid8">' + items.map(x => '<button type="button" data-e="' + x + '">' + x + '</button>').join('') + '</div>';
    e.onclick = ev => { const k = ev.target.closest('[data-k]'), em = ev.target.closest('[data-e]'); if (k) { emoCat = k.dataset.k; renderEmoji(); } if (em) { const tx = document.getElementById('tx'), s = tx.selectionStart || tx.value.length; tx.value = tx.value.slice(0, s) + em.dataset.e + tx.value.slice(tx.selectionEnd || s); tx.focus(); tx.selectionStart = tx.selectionEnd = s + em.dataset.e.length; tx.dispatchEvent(new Event('input')); } };
  }
  function sendText() {
    const tx = document.getElementById('tx'), v = tx.value.trim(); if (!v) return; if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* ignore */ } }
    if (editing) { const m = editing, r = Server.editMessage(m.id, v); if (!r.ok) return toast(r.error, 'bad'); sync.edit(m.id); editing = null; tx.value = ''; renderReplyBar(); tx.dispatchEvent(new Event('input')); refresh(true, true); return; }
    const r = Server.postMessage(cls, { text: v, reply: replyTo && replyTo.id }); if (!r.ok) return toast(r.error, 'bad');
    tx.value = ''; replyTo = null; typingUntil = 0; renderReplyBar(); tx.dispatchEvent(new Event('input')); (r.dropped || []).forEach(id => Media.del(id)); refresh(true); sync.push(r.id); sync.heartbeat();
  }
  async function sendPhoto(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast('Choose a JPG, PNG or WebP picture.', 'bad');
    try {
      const bmp = await createImageBitmap(file), sc = Math.min(1, 1000 / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.75)); if (!blob) throw new Error('encode'); const id = newMediaId(); await Media.put(id, blob);
      const r = Server.postMessage(cls, { media: { id, kind: 'image', mime: 'image/jpeg' }, text: '', reply: replyTo && replyTo.id }); if (!r.ok) { Media.del(id); return toast(r.error, 'bad'); }
      replyTo = null; renderReplyBar(); refresh(true); sync.push(r.id);
    } catch (e) { toast('Could not use that picture.', 'bad'); }
  }

  /* ---------- voice messages ---------- */
  async function startRec() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Voice messages are not supported in this browser.', 'bad');
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return toast('Microphone permission was denied. Allow it in the browser to record.', 'bad'); }
    const rec = new MediaRecorder(stream), chunks = [], samples = []; recState = { rec, stream, chunks, samples, t0: Date.now(), cancel: false };
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize); recState.ac = ac; recState.an = an; recState.buf = buf; } catch (e) { /* no meter */ }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); }; rec.onstop = onRecStop; rec.start();
    const comp = document.getElementById('comp'); comp.innerHTML = '<div class="recrow"><span class="dot"></span><span id="rt">0:00</span><div class="lv" id="lv" aria-hidden="true"></div><button class="ic" id="rc" aria-label="Cancel recording" type="button">🗑️</button></div><button class="go" id="rs" aria-label="Send voice message" type="button">➤</button>';
    document.getElementById('rc').onclick = () => stopRec(true); document.getElementById('rs').onclick = () => stopRec(false);
    recState.timer = setInterval(() => {
      const s = Math.round((Date.now() - recState.t0) / 1000), el = document.getElementById('rt'); if (el) el.textContent = mmss(s);
      if (recState.an) { recState.an.getByteTimeDomainData(recState.buf); let pk = 0; recState.buf.forEach(v => { pk = Math.max(pk, Math.abs(v - 128)); }); recState.samples.push(pk); const lv = document.getElementById('lv'); if (lv) { lv.insertAdjacentHTML('beforeend', '<i style="height:' + Math.max(10, Math.min(100, pk * 2.2)) + '%"></i>'); while (lv.children.length > 60) lv.firstChild.remove(); } }
      if (s >= 120) stopRec(false);
    }, 100);
  }
  function stopRec(cancel) { if (!recState) return; recState.cancel = !!cancel; if (recState.rec.state !== 'inactive') recState.rec.stop(); }
  async function onRecStop() {
    const s = recState; recState = null; clearInterval(s.timer); s.stream.getTracks().forEach(t => t.stop()); if (s.ac) { try { s.ac.close(); } catch (e) { /* ignore */ } }
    const dur = Math.round((Date.now() - s.t0) / 1000); buildComposer(); if (s.cancel || dur < 1) return;
    const blob = new Blob(s.chunks, { type: s.rec.mimeType || 'audio/webm' }); if (blob.size > 3 * 1024 * 1024) return toast('That voice message is too large. Keep it under 2 minutes.', 'bad');
    const n = 40, sm = s.samples, peak = Math.max(1, ...sm), wave = sm.length ? Array.from({ length: n }, (_, i) => { const a = Math.floor(i * sm.length / n), b = Math.max(a + 1, Math.floor((i + 1) * sm.length / n)); return Math.max(14, Math.round(Math.max(...sm.slice(a, b)) / peak * 100)); }) : [];
    const id = newMediaId(); await Media.put(id, blob);
    const r = Server.postMessage(cls, { media: { id, dur: Math.max(1, dur), mime: blob.type || 'audio/webm', kind: 'voice', wave }, reply: replyTo && replyTo.id }); if (!r.ok) { Media.del(id); return toast(r.error, 'bad'); }
    replyTo = null; renderReplyBar(); refresh(true); sync.push(r.id);
  }

  /* ---------- "Live now" pill: lessons are taught on the Live tab, not in the chat ---------- */
  let live = [];
  async function pollCalls() {
    const c = cls, t = Date.now(); let l = null;
    if (Remote.on) l = await Remote.rest('GET', 'usl_calls?cls=eq.' + encodeURIComponent(c) + '&beat_at=gt.' + (t - 12000) + '&select=*');
    if (!l) { try { l = Object.values(JSON.parse(USL.LS.getItem('usl_calls_local') || '{}')).filter(x => x.cls === c && t - x.beat_at < 12000); } catch (e) { l = []; } }
    if (c !== cls) return; live = l; renderCall();
  }
  function renderCall() {
    const pill = document.getElementById('callpill'); if (!pill) return;
    pill.innerHTML = live.map(c => '<div class="callpill"><span>🔴 <b>' + esc(c.subject_name) + '</b> is LIVE' + (c.title ? ' · ' + esc(c.title) : '') + ' · ' + esc(c.host_name) + '</span><a class="btn sm" href="live.html?room=' + encodeURIComponent(c.room) + '">Watch</a></div>').join('');
  }

  /* ---------- open a room ---------- */
  function openRoom(cid) {
    cls = cid; live = []; msgs = []; pres = []; replyTo = null; editing = null; searchTerm = ''; matchIdx = -1; lastSig = ''; newBelow = 0; typingUntil = 0; legacy = legacy; recentSeen.clear(); stopPlayer();
    const r = Server.roomInfo(cls); if (!r.ok) { chat.innerHTML = '<div class="card" style="margin:20px"><h2>Room unavailable</h2><p>' + esc(r.error) + '</p><a class="btn" href="dashboard.html">Back</a></div>'; wa.classList.add('show-chat'); return; }
    myRead = getNum('read'); unreadFrom = myRead; lastPing = Date.now(); buildChat(); wa.classList.add('show-chat');
    refresh(true); applyMuteBox(); renderSide(); pollCalls(); sync.pull().then(() => { sync.heartbeat(); refresh(true); });
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); const i = document.getElementById('info'); if (i) i.classList.remove('on'); const em = document.getElementById('emo'); if (em) em.classList.remove('on'); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { markRead(); updTitle(); } });
  window.addEventListener('storage', () => refresh(false));
  openRoom(cls); renderSide();
  setInterval(() => { refresh(false); applyMuteBox(); }, 1500);
  setInterval(() => sync.pull(), 2000); setInterval(pollCalls, 3000);
  hbTimer = setInterval(() => sync.heartbeat(), 4000);
})();

}

/* ---- page: teacher ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'teacher') {
(async function () {
  const { Server, esc, toast } = USL;
  const ctx = await USL.boot({ page: 'teacher', auth: false }); const main = document.getElementById('main');
  const db0 = () => Server.data(), sname = id => (db0().subjects.find(s => s.id === id) || {}).name || id, cname = id => (db0().classes.find(c => c.id === id) || {}).name || id, ccolor = id => (db0().classes.find(c => c.id === id) || {}).color || '#2563eb';
  const val = id => document.getElementById(id).value, chk = id => document.getElementById(id).checked;
  const sel = (id, opts, v) => '<select id="' + id + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  const statusBadge = s => '<span class="badge ' + ({ published: 'ok', pending: 'warn', rejected: 'bad', withdrawn: 'bad' }[s] || '') + '">' + esc(s) + '</span>';

  /* ---------- sign in ---------- */
  if (!ctx.user) {
    document.title = 'Teacher sign in – Uganda Smart Learning';
    main.innerHTML = '<div class="tlogin"><div class="card"><span class="badge info">Teacher portal</span><h1 style="margin-top:8px">Teacher sign in</h1><p class="muted">Free for teachers. Your administrator creates your account and chooses the classes and subjects you teach. You can sign in on more than one device.</p>'
      + '<div id="terr"></div><form id="tf" novalidate><div class="field"><label for="te">Email</label><input id="te" type="email" autocomplete="username" required></div><div class="field"><label for="tp">Password</label><input id="tp" type="password" autocomplete="current-password" required></div><button class="btn orange block" type="submit">Sign in to the teacher portal</button></form>'
      + '<p class="center small" style="margin-top:14px"><a href="index.html">Student or administrator? Use the main log in</a> · <a href="index.html?forgot=1">Forgot password?</a></p>'
      + '</div></div>';
    document.getElementById('tf').onsubmit = async e => {
      e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; const r = await Server.login(val('te'), val('tp'), 'teacher');
      if (!r.ok) { document.getElementById('terr').innerHTML = '<div class="alert bad" role="alert" style="margin-bottom:12px">' + esc(r.error) + '</div>'; b.disabled = false; return; } location.reload();
    };
    return;
  }
  const me = ctx.user;
  if (me.role !== 'teacher') { location.replace(me.role === 'student' ? 'dashboard.html' : 'admin.html'); return new Promise(() => { }); }

  /* ---------- portal ---------- */
  const sc = Server.scope(), pairs = sc.pairs, classes = sc.classes.slice().sort();
  const subsFor = c => pairs.filter(p => p.cls === c).map(p => [p.subject, sname(p.subject)]);
  const tabs = [['overview', 'My classes'], ['lesson', 'Upload a lesson'], ['paper', 'Upload a paper'], ['topics', 'Topics'], ['mine', 'My uploads']];
  let tab = (location.hash || '').slice(1); if (!tabs.find(t => t[0] === tab)) tab = 'overview';
  function shellHtml() {
    main.innerHTML = '<div class="row between"><div><p class="muted mb0">Teacher portal · free</p><h1 class="mb0">' + esc(me.name) + '</h1></div><a class="btn orange" href="live.html">🔴 Go live</a></div>' + '<div class="tabs mt" role="tablist">' + tabs.map(t => '<button class="tab" role="tab" data-t="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</button>').join('') + '</div><div id="panel" class="mt"></div>';
    main.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; history.replaceState(null, '', '#' + tab); shellHtml(); });
    if (!pairs.length && tab !== 'overview') { document.getElementById('panel').innerHTML = noScope(); return; }
    ({ overview, lesson: lessonForm, paper: paperForm, topics, mine }[tab])(document.getElementById('panel'));
  }
  const noScope = () => '<div class="card"><h3>No classes assigned yet</h3><p class="mb0">An administrator must assign your classes and subjects before you can upload material or join class rooms.</p></div>';

  function overview(p) {
    if (!pairs.length) { p.innerHTML = noScope(); return; }
    const db = db0(), mine = Server.mySubmissions();
    p.innerHTML = '<div class="alert info" role="status" style="margin-bottom:14px">You can open notes and papers, upload material, teach live <b>only</b> for the classes and subjects below. Uploads are checked by a reviewer before students see them.</div><div class="grid g2">' + classes.map(c => {
      const subs = pairs.filter(x => x.cls === c); return '<div class="card clscard" style="--c:' + esc(ccolor(c)) + '"><div class="row between"><h3 class="mb0"><span class="clsbadge" style="--c:' + esc(ccolor(c)) + '">' + esc(c) + '</span> ' + esc(cname(c)) + '</h3></div><div class="stack mt" style="gap:8px">' + subs.map(x => {
        const pub = db.lessons.filter(l => l.status === 'published' && l.cls === c && l.subject === x.subject).length, pp = db.papers.filter(q => q.status === 'published' && q.cls === c && q.subject === x.subject).length, pend = mine.lessons.filter(l => l.cls === c && l.subject === x.subject && l.status === 'pending').length + mine.papers.filter(q => q.cls === c && q.subject === x.subject && q.status === 'pending').length;
        return '<div class="item"><span><b>' + esc(sname(x.subject)) + '</b><br><span class="small muted">' + pub + ' lesson' + (pub === 1 ? '' : 's') + ' · ' + pp + ' paper' + (pp === 1 ? '' : 's') + (pend ? ' · <b>' + pend + ' waiting for review</b>' : '') + '</span></span><span class="row" style="gap:6px"><a class="btn sm ghost" href="library.html?cls=' + esc(c) + '&subject=' + esc(x.subject) + '">Notes</a><a class="btn sm" href="live.html" title="Go live for this subject">🔴 Live</a></span></div>';
      }).join('') + '</div><a class="btn mt" href="live.html">🔴 Go live for ' + esc(c) + '</a></div>';
    }).join('') + '</div>';
  }

  /* class -> subject -> topic pickers shared by both upload forms */
  function crumbs() { const c = val('xc'), s = val('xs'), t = document.getElementById('xt') ? (val('xt') === '__new__' ? (val('xnt') || 'new topic') : val('xt')) : ''; return '<div class="crumb" aria-label="Where this will be filed"><span class="badge" style="background:' + esc(ccolor(c)) + ';color:#fff">' + esc(c) + '</span> › <b>' + esc(sname(s)) + '</b>' + (t ? ' › ' + esc(t) : '') + '</div>'; }
  function pickers(withTopic) {
    return '<div class="grid g3"><div class="field"><label for="xc">1 · Class</label>' + sel('xc', classes.map(c => [c, c + ' – ' + cname(c)]), classes[0]) + '</div><div class="field"><label for="xs">2 · Subject</label><select id="xs"></select></div>' + (withTopic ? '<div class="field"><label for="xt">3 · Topic</label><select id="xt"></select></div><div class="field" id="xnw" style="display:none"><label for="xnt">New topic name</label><input id="xnt" maxlength="80" placeholder="e.g. Quadratic equations"></div>' : '') + '</div><div id="crumb"></div>';
  }
  function bindPickers(withTopic, onChange) {
    const fill = () => {
      const c = val('xc'), cur = document.getElementById('xs').value; document.getElementById('xs').innerHTML = subsFor(c).map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('');
      if (withTopic) { const tp = Server.topicsFor(c, val('xs')); document.getElementById('xt').innerHTML = tp.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('') + '<option value="__new__">➕ New topic…</option>'; if (!tp.length) document.getElementById('xt').value = '__new__'; document.getElementById('xnw').style.display = val('xt') === '__new__' ? '' : 'none'; }
      document.getElementById('crumb').innerHTML = crumbs(); onChange && onChange();
    };
    document.getElementById('xc').onchange = () => { document.getElementById('xs').value = ''; fill(); }; document.getElementById('xs').onchange = fill;
    if (withTopic) { document.getElementById('xt').onchange = fill; document.getElementById('xnt').oninput = () => { document.getElementById('crumb').innerHTML = crumbs(); }; } fill();
  }

  function lessonForm(p) {
    p.innerHTML = '<form id="lf" class="card stack"><h3>Upload a lesson</h3><p class="small muted mb0">Choose where it belongs first: class, then subject, then topic. A reviewer approves it before students see it. Write original notes or use material you have permission to use.</p>' + pickers(true)
      + '<div class="grid g3"><div class="field"><label for="lst">Subtopic (optional)</label><input id="lst"></div><div class="field"><label for="ltl">Lesson title</label><input id="ltl"></div><div class="field"><label for="lp">Permission status</label>' + sel('lp', USL.PERMS.map(c => [c, c]), USL.PERMS[0]) + '</div></div>'
      + '<div class="field"><label for="lo">Learning outcomes (one per line)</label><textarea id="lo" rows="3"></textarea></div><div class="field"><label for="ln">Notes</label><textarea id="ln" rows="8" placeholder="Write paragraphs separated by blank lines. Start a line with - for bullet points."></textarea></div><div class="field"><label for="le">Worked example</label><textarea id="le" rows="3"></textarea></div><div class="field"><label for="lq">Quiz (one per line)</label><textarea id="lq" rows="4" placeholder="Question | Option A ;; Option B ;; Option C | correct option number"></textarea></div><div class="field"><label for="lsrc">Source / author</label><input id="lsrc" placeholder="e.g. Written by me"></div><button class="btn orange" type="submit">Send for review</button></form>';
    bindPickers(true);
    document.getElementById('lf').onsubmit = async e => {
      e.preventDefault(); const isNew = val('xt') === '__new__', topic = isNew ? val('xnt') : val('xt');
      const r = await Server.submitLesson({ cls: val('xc'), subject: val('xs'), topic, newTopic: isNew, subtopic: val('lst'), title: val('ltl'), permission: val('lp'), objectives: val('lo'), notes: val('ln'), example: val('le'), quizText: val('lq'), source: val('lsrc') });
      toast(r.ok ? 'Sent for review. It will appear under My uploads.' : r.error, r.ok ? 'ok' : 'bad'); if (r.ok) { tab = 'mine'; shellHtml(); }
    };
  }

  function paperForm(p) {
    const db = db0();
    p.innerHTML = '<form id="pf" class="card stack"><h3>Upload a paper</h3><p class="small muted mb0">File it under a class and subject. Every question must use one of the listed topics for that class and subject, so students can revise by topic. A reviewer approves it first.</p>' + pickers(false)
      + '<div class="card soft flat"><b class="small">Topics you can use here</b><div class="row mt" id="chips" style="flex-wrap:wrap;gap:6px"></div><p class="hint mb0">Tap a topic to add a question line for it. Missing a topic? Add it under the Topics tab.</p></div>'
      + '<div class="grid g3"><div class="field"><label for="pt">Title</label><input id="pt" placeholder="e.g. Mock Examination – Paper 1"></div><div class="field"><label for="py">Year</label><input id="py" type="number" value="' + new Date().getFullYear() + '"></div><div class="field"><label for="pn">Paper number</label><input id="pn" type="number" min="1" max="9" value="1"></div><div class="field"><label for="pd">Duration (minutes)</label><input id="pd" type="number" value="60"></div><div class="field"><label for="pcat">Category</label>' + sel('pcat', USL.CATEGORIES.map(c => [c, c]), 'Teacher-created assessment') + '</div><div class="field"><label for="po">Source organisation</label>' + sel('po', db.orgs.map(o => [o.id, o.name]), 'o_school') + '</div><div class="field"><label for="pp">Permission status</label>' + sel('pp', USL.PERMS.map(c => [c, c]), USL.PERMS[0]) + '</div></div>'
      + '<div class="field"><label for="pi">Instructions to candidates</label><input id="pi" placeholder="Answer all questions."></div><label class="check"><input type="checkbox" id="pg"><span>This paper has a marking guide (every question has a correct answer / model answer)</span></label><div class="field"><label for="pq">Questions</label><textarea id="pq" rows="8" placeholder="MCQ | Topic | 2 | Question | Option A ;; Option B | 1"></textarea></div>'
      + '<details class="small"><summary>Question format</summary><pre style="white-space:pre-wrap;background:#f5f7fb;padding:10px;border-radius:10px">MCQ | Topic | marks | Question | Option A ;; Option B ;; Option C | correct option number\nSTRUCT | Topic | marks | Question | Model answer (use \\n for a new line)</pre></details><button class="btn orange" type="submit">Send for review</button></form>';
    const chips = () => { const tp = Server.topicsFor(val('xc'), val('xs')); document.getElementById('chips').innerHTML = tp.map(t => '<button type="button" class="chip" data-t="' + esc(t) + '">' + esc(t) + '</button>').join('') || '<span class="muted small">No topics yet for this subject. Add one under Topics first.</span>'; };
    bindPickers(false, chips);
    document.getElementById('chips').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; const ta = document.getElementById('pq'); ta.value += (ta.value && !ta.value.endsWith('\n') ? '\n' : '') + 'MCQ | ' + b.dataset.t + ' | 1 | Question text | Option A ;; Option B ;; Option C | 1'; ta.focus(); };
    document.getElementById('pf').onsubmit = async e => {
      e.preventDefault(); const r = await Server.submitPaper({ title: val('pt'), cls: val('xc'), subject: val('xs'), year: val('py'), paperNo: val('pn'), duration: val('pd'), category: val('pcat'), org: val('po'), permission: val('pp'), instructions: val('pi'), hasGuide: chk('pg'), questionsText: val('pq') });
      toast(r.ok ? 'Sent for review. It will appear under My uploads.' : r.error, r.ok ? 'ok' : 'bad'); if (r.ok) { tab = 'mine'; shellHtml(); }
    };
  }

  function topics(p) {
    p.innerHTML = '<div class="card stack"><h3>Topics</h3><p class="small muted mb0">Topics are how lessons and paper questions are filed (class → subject → topic). Add a topic before you use it in a paper.</p>' + pickers(false) + '<div id="tl"></div><form id="tfm" class="row" style="flex-wrap:nowrap"><input id="tn" maxlength="80" placeholder="New topic name" aria-label="New topic name"><button class="btn orange" type="submit">Add topic</button></form></div>';
    const list = () => {
      const c = val('xc'), s = val('xs'), db = db0(), tp = Server.topicsFor(c, s);
      document.getElementById('tl').innerHTML = tp.length ? '<ul class="list">' + tp.map(t => { const ls = db.lessons.filter(l => l.cls === c && l.subject === s && l.status === 'published' && l.topic === t).length, qs = db.papers.filter(x => x.cls === c && x.subject === s && x.status === 'published').reduce((n, x) => n + x.questions.filter(q => q.topic === t).length, 0); return '<li class="item"><b>' + esc(t) + '</b><span class="small muted">' + ls + ' lesson' + (ls === 1 ? '' : 's') + ' · ' + qs + ' question' + (qs === 1 ? '' : 's') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">No topics yet for this class and subject.</p>';
    };
    bindPickers(false, list);
    document.getElementById('tfm').onsubmit = async e => { e.preventDefault(); const r = await Server.addTopic(val('xc'), val('xs'), val('tn')); toast(r.ok ? 'Topic added.' : r.error, r.ok ? 'ok' : 'bad'); if (r.ok) { document.getElementById('tn').value = ''; list(); } };
  }

  function mine(p) {
    const raw = Server.mySubmissions(), inMy = x => pairs.some(q => q.cls === x.cls && q.subject === x.subject), m = { lessons: raw.lessons.filter(inMy), papers: raw.papers.filter(inMy) }, tree = {};
    const put = (cls, subject, topic, row) => { ((tree[cls] = tree[cls] || {})[subject] = tree[cls][subject] || {}); (tree[cls][subject][topic] = tree[cls][subject][topic] || []).push(row); };
    m.lessons.forEach(l => put(l.cls, l.subject, l.topic, '<li class="item"><span>📘 <b>' + esc(l.title) + '</b><br><span class="small muted">Lesson · ' + esc(l.review) + '</span></span>' + statusBadge(l.status) + '</li>'));
    m.papers.forEach(x => { const ts = [...new Set((x.questions || []).map(q => q.topic))]; (ts.length ? ts : ['(no topic)']).forEach(t => put(x.cls, x.subject, t, '<li class="item"><span>📝 <b>' + esc(x.title) + '</b><br><span class="small muted">Paper ' + x.paperNo + ' · ' + x.year + ' · ' + (x.questions || []).filter(q => q.topic === t).length + ' question(s) on this topic</span></span>' + statusBadge(x.status) + '</li>')); });
    const cs = Object.keys(tree).sort();
    p.innerHTML = cs.length ? '<div class="stack">' + cs.map(c => '<div class="card clscard" style="--c:' + esc(ccolor(c)) + '"><h3><span class="clsbadge" style="--c:' + esc(ccolor(c)) + '">' + esc(c) + '</span> ' + esc(cname(c)) + '</h3>' + Object.keys(tree[c]).sort().map(s => '<h4 style="margin:10px 0 4px">' + esc(sname(s)) + '</h4>' + Object.keys(tree[c][s]).sort().map(t => '<div class="small muted" style="margin-top:6px">Topic: <b>' + esc(t) + '</b></div><ul class="list">' + tree[c][s][t].join('') + '</ul>').join('')).join('') + '</div>').join('') + '</div><p class="hint">Uploads stay hidden from students until a reviewer approves them.</p>' : '<div class="card"><p class="mb0">You have not uploaded anything yet. Use “Upload a lesson” or “Upload a paper”.</p></div>';
  }
  shellHtml();
})();

}

/* ---- page: live ---- */
if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-page') === 'live') {
(async function () {
  /* LIVE LESSONS (like a TikTok live): the teacher owns the big screen and is the only one who teaches.
     Learners watch, send comments and can raise a hand; the teacher chooses who (one person at a time) may speak.
     Many teachers can be live at once, each for their own class + subject. Video goes teacher -> each learner (WebRTC, star shape). */
  const { Server, Remote, esc, toast, modal, confirmBox } = USL;
  await Remote.init();
  const ctx = await USL.boot({ page: 'live', paid: true });
  const me = ctx.user, main = document.getElementById('main'), isTeacher = me.role === 'teacher', qs = new URLSearchParams(location.search);
  const D0 = Server.data(), SUBJ = id => (D0.subjects.find(x => x.id === id) || {}).name || id, CNAME = id => (D0.classes.find(c => c.id === id) || {}).name || id;
  const enc = encodeURIComponent, roomOf = (c, s) => 'usl-live-' + c + '-' + s, MAXI = window.USL_LIVE_MAX_INTERACT || 30 /* seats that can comment + speak */, KIDS = 4 /* listeners each viewer relays to */, LKEY = 'usl_calls_local';
  const hue = s => { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360; return 'hsl(' + h + ',60%,40%)'; };
  const mmss = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------- directory of lessons that are live right now (shared table, or this browser when there is no server) ---------- */
  const Dir = {
    local() { try { return JSON.parse(USL.LS.getItem(LKEY) || '{}'); } catch (e) { return {}; } },
    saveLocal(m) { try { USL.LS.setItem(LKEY, JSON.stringify(m)); } catch (e) { /* ignore */ } },
    async list() {
      const t = Date.now(); let rows = null;
      if (Remote.on) { const f = me.role === 'student' ? 'cls=eq.' + enc(me.classId) + '&' : ''; rows = await Remote.rest('GET', 'usl_calls?' + f + 'beat_at=gt.' + (t - 12000) + '&select=*'); }
      if (!rows) rows = Object.values(this.local()).filter(x => t - x.beat_at < 12000 && (me.role !== 'student' || x.cls === me.classId));
      return rows.filter(r => String(r.room).startsWith('usl-live-'));
    },
    async beat(row) { row.beat_at = Date.now(); if (Remote.on) { const r = await Remote.rest('POST', 'usl_calls', row, { Prefer: 'resolution=merge-duplicates,return=minimal' }); if (r !== null) return; } const m = this.local(); m[row.room] = row; this.saveLocal(m); },
    async end(room) { if (Remote.on) await Remote.rest('DELETE', 'usl_calls?room=eq.' + enc(room)); const m = this.local(); delete m[room]; this.saveLocal(m); }
  };

  /* ---------- signalling: BroadcastChannel on one device; polled rows on the shared server ---------- */
  const Transport = {
    open(name, onmsg, myId, every) {
      if (!Remote.on) { if (typeof BroadcastChannel === 'undefined') return null; const bc = new BroadcastChannel(name); bc.onmessage = e => onmsg(e.data); return { send: m => bc.postMessage(m), close: () => bc.close() }; }
      let cursor = 0, stop = false, busy = false; const q = [];
      const pump = async () => { if (busy) return; busy = true; while (q.length && !stop) { const m = q.shift(); await Remote.rest('POST', 'usl_signals', { room: name, from_id: m.from, to_id: m.to || null, payload: m, at: Date.now() }, { Prefer: 'return=minimal' }); } busy = false; };
      const poll = async () => {
        if (stop) return;
        const rows = await Remote.rest('GET', 'usl_signals?room=eq.' + enc(name) + '&id=gt.' + cursor + '&or=(to_id.is.null,to_id.eq.' + enc(myId || '-') + ')&order=id.asc&limit=300&select=id,payload');
        if (rows) rows.forEach(r => { cursor = Math.max(cursor, r.id); try { onmsg(r.payload); } catch (e) { /* ignore */ } });
        if (!stop) setTimeout(poll, every ? every() : 700);
      };
      (async () => {
        await Remote.rest('DELETE', 'usl_signals?room=eq.' + enc(name) + '&at=lt.' + (Date.now() - 120000));
        const last = await Remote.rest('GET', 'usl_signals?room=eq.' + enc(name) + '&order=id.desc&limit=1&select=id'); cursor = last && last[0] ? last[0].id : 0; poll();
      })();
      return { send: m => { q.push(m); pump(); }, close: () => { stop = true; } };
    }
  };
  const supported = !!window.RTCPeerConnection && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const desc = pc => ({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });

  /* ---------- shared look of a live screen ---------- */
  const screen = document.createElement('div'); screen.className = 'livev'; screen.id = 'livev'; document.body.appendChild(screen);
  let session = null; // { stop() }
  const feedHtml = list => list.slice(-40).map(c => '<div class="cm' + (c.role === 'teacher' ? ' t' : '') + '"><b style="color:' + (c.role === 'teacher' ? '#fbbf24' : hue(c.name)) + '">' + esc(c.name) + (c.role === 'teacher' ? ' ★' : '') + '</b> ' + esc(c.text) + '</div>').join('');
  function paintFeed(el, list) { if (!el) return; const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 30; el.innerHTML = feedHtml(list); if (stick) el.scrollTop = el.scrollHeight; }

  /* ================= TEACHER: host a lesson ================= */
  async function host(pair, title, source) {
    const acc = Server.liveAccess(pair.cls, pair.subject); if (!acc.ok || !acc.host) return toast(acc.error || 'You cannot teach this class.', 'bad');
    if (!supported) return toast('Live lessons need Chrome, Edge or Safari over https.', 'bad');
    const room = roomOf(pair.cls, pair.subject), myId = 'h_' + Math.random().toString(36).slice(2, 10);
    let mic, vid = null, vtrack = null, shareStream = null;
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { return toast(e && e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it to teach live.' : 'Could not use the microphone: ' + (e && e.message || e), 'bad'); }
    let facing0 = 'user'; const getCam = async () => navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing0 }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    const getScr = async () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try { if (source === 'camera') vid = await getCam(); else if (source === 'screen') vid = await getScr(); } catch (e) { mic.getTracks().forEach(t => t.stop()); return toast(e && e.name === 'NotAllowedError' ? 'Camera or screen permission was denied.' : 'Could not start the video: ' + (e && e.message || e), 'bad'); }
    vtrack = vid ? vid.getVideoTracks()[0] : null; let kind = source;
    const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), dest = ac.createMediaStreamDestination(), micTrack = mic.getAudioTracks()[0];
    ac.createMediaStreamSource(new MediaStream([micTrack])).connect(dest); const mixed = dest.stream.getAudioTracks()[0];
    const peers = new Map(), viewers = new Map(), listeners = new Map(), kids = new Map(), parentOf = new Map(), hands = new Map(), comments = [];  let speaker = null, speakerNode = null, ended = false, muted = false, startedAt = Date.now(), tick = null, beat = null, hb = null;
    const row = { room, cls: pair.cls, subject_id: pair.subject, subject_name: SUBJ(pair.subject), host_id: me.id, host_name: me.name, title: title || '', video: !!vtrack, started_at: startedAt, beat_at: Date.now(), count: 0 };
    const send = m => ch && ch.send(Object.assign({ from: myId, name: me.name, role: 'teacher' }, m));
    const forget = id => { const par = parentOf.get(id); if (par && kids.get(par)) kids.get(par).delete(id); parentOf.delete(id); kids.delete(id); };
    const dropPeer = id => { const p = peers.get(id); if (p) { try { p.pc.close(); } catch (e) { /* ignore */ } peers.delete(id); } if (speaker === id) setSpeaker(null); viewers.delete(id); listeners.delete(id); hands.delete(id); forget(id); paint(); };
    const below = (c, id) => { for (let x = parentOf.get(c), i = 0; x && i < 50; x = parentOf.get(x), i++) if (x === id) return true; return false; }; // would c sit under id?
    /* Listeners beyond the interactive seats are fed by other viewers (relay tree), so the teacher's phone only serves the seats. */
    function assign(id) {
      const old = parentOf.get(id); if (old && kids.get(old)) kids.get(old).delete(id); parentOf.delete(id); const c = [];
      peers.forEach((p, pid) => { const v = viewers.get(pid); if (v && v.ready && pid !== speaker && p.pc.connectionState === 'connected') c.push({ id: pid, d: 0 }); });
      listeners.forEach((l, lid) => { if (l.ready && Date.now() - l.seen < 30000) c.push({ id: lid, d: 1 }); });
      const n = x => (kids.get(x.id) || new Set()).size;
      const pick = c.filter(x => x.id !== id && n(x) < KIDS && !below(x.id, id)).sort((a, b) => a.d - b.d || n(a) - n(b))[0];
      if (!pick) { const l = listeners.get(id); if (l && viewers.size < MAXI) { listeners.delete(id); viewers.set(id, { name: l.name, seen: Date.now() }); newPeer(id, l.name); return; } return send({ t: 'wait', to: id }); } // a seat is free and nobody can relay: give the seat
      parentOf.set(id, pick.id); if (!kids.has(pick.id)) kids.set(pick.id, new Set()); kids.get(pick.id).add(id); send({ t: 'relay', to: id, parent: pick.id });
    }
    const setSpeaker = id => {
      if (speakerNode) { try { speakerNode.disconnect(); } catch (e) { /* ignore */ } speakerNode = null; }
      const prev = speaker; if (prev && peers.get(prev)) { peers.get(prev).asend.replaceTrack(mixed).catch(() => { }); send({ t: 'revoke', to: prev }); }
      speaker = id; if (!id) return paint();
      const p = peers.get(id); hands.delete(id); if (!p) { speaker = null; return paint(); }
      (kids.get(id) || new Set()).forEach(k => send({ t: 'rejoin', to: k })); kids.delete(id);
      p.asend.replaceTrack(micTrack).catch(() => { }); // the speaker hears only the teacher, never an echo of themselves
      const src = p.audioStream; if (src) { if (!p.sink) { p.sink = new Audio(); p.sink.muted = true; p.sink.srcObject = src; p.sink.play().catch(() => { }); } speakerNode = ac.createMediaStreamSource(src); speakerNode.connect(dest); speakerNode.connect(ac.destination); }
      send({ t: 'allow', to: id }); paint();
    };
    async function newPeer(id, name) {
      dropPeerQuiet(id); const pc = new RTCPeerConnection({ iceServers: Remote.ice }), p = { pc, name, pending: [], has: false, audioStream: null, asend: null, vsend: null };
      const vt = pc.addTransceiver('video', { direction: 'sendonly' }); p.vsend = vt.sender; if (vtrack) vt.sender.replaceTrack(vtrack).catch(() => { });
      const at = pc.addTransceiver(mixed, { direction: 'sendrecv', streams: [dest.stream] }); p.asend = at.sender;
      pc.ontrack = e => { if (e.track.kind === 'audio') p.audioStream = e.streams[0] || new MediaStream([e.track]); };
      pc.onicecandidate = e => { if (e.candidate) send({ t: 'ice', to: id, candidate: e.candidate.toJSON() }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') dropPeer(id); };
      peers.set(id, p); const o = await pc.createOffer(); await pc.setLocalDescription(o); send({ t: 'offer', to: id, sdp: desc(pc) });
    }
    function dropPeerQuiet(id) { const p = peers.get(id); if (p) { try { p.pc.close(); } catch (e) { /* ignore */ } peers.delete(id); } }
    async function onmsg(m) {
      if (!m || m.from === myId || ended) return; if (m.to && m.to !== myId) return;
      if (m.t === 'join') {
        const now = Date.now(), ex = peers.get(m.from);
        if (viewers.has(m.from)) { viewers.get(m.from).seen = now; if (!ex || ex.pc.connectionState === 'failed' || ex.pc.connectionState === 'closed' || (m.retry && ex.pc.connectionState !== 'connected')) newPeer(m.from, m.name); }
        else if (listeners.has(m.from)) { listeners.get(m.from).seen = now; assign(m.from); }
        else if (viewers.size < MAXI) { viewers.set(m.from, { name: m.name, role: m.role, seen: now }); newPeer(m.from, m.name); }
        else { listeners.set(m.from, { name: m.name, seen: now }); assign(m.from); }
        paint();
      } else if (m.t === 'answer') { const p = peers.get(m.from); if (p && p.pc.signalingState === 'have-local-offer') { await p.pc.setRemoteDescription(m.sdp); p.has = true; for (const c of p.pending.splice(0)) { try { await p.pc.addIceCandidate(c); } catch (e) { /* ignore */ } } } }
      else if (m.t === 'ice') { const p = peers.get(m.from); if (p) { if (p.has) { try { await p.pc.addIceCandidate(m.candidate); } catch (e) { /* ignore */ } } else p.pending.push(m.candidate); } }
      else if (m.t === 'hb') { const v = viewers.get(m.from) || listeners.get(m.from); if (v) v.seen = Date.now(); }
      else if (m.t === 'up') { const v = viewers.get(m.from) || listeners.get(m.from); if (v) { v.ready = true; v.seen = Date.now(); } }
      else if (m.t === 'leave') dropPeer(m.from);
      else if (m.t === 'hand') { if (!viewers.has(m.from)) return; if (m.on && speaker !== m.from) hands.set(m.from, { name: m.name, at: Date.now() }); else hands.delete(m.from); paint(); }
      else if (m.t === 'cmt') { const text = String(m.text || '').slice(0, 200).trim(); if (!text || !viewers.has(m.from)) return; comments.push({ name: m.name, role: 'student', text }); send({ t: 'cmt', name: m.name, r: 'student', text, id: m.from }); paint(); }
    }
    const ch = Transport.open(room, onmsg, myId); if (!ch) { mic.getTracks().forEach(t => t.stop()); return toast('This browser cannot start a live lesson.', 'bad'); }
    session = { stop: () => end(true) };
    screen.className = 'livev on host'; screen.innerHTML = '<video id="lv" autoplay playsinline muted></video><div class="lt"><span class="live">● LIVE</span><span class="vc" id="lvc">👁 0</span><span id="lvt" class="tm">0:00</span><b class="ttl" id="lvn"></b></div>'
      + '<div class="lfeed" id="lfeed" aria-live="polite"></div><div class="lside" id="lside"></div>'
      + '<div class="lctl"><button id="lm" aria-label="Mute microphone">🎤</button><button id="lcam" aria-label="Camera on">🎥</button><button id="lflip" aria-label="Flip camera">🔄</button>' + (navigator.mediaDevices.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent) ? '<button id="lscr" aria-label="Share screen">🖥️</button>' : '') + '<button id="lh" aria-label="Raised hands">✋<i id="lhn"></i></button><form id="lcf" class="lcf"><input id="lci" maxlength="200" placeholder="Say something to your class…" autocomplete="off"></form><button id="lend" class="end" aria-label="End lesson">⏹</button></div>';
    document.getElementById('lv').srcObject = vid; document.getElementById('lvn').textContent = SUBJ(pair.subject) + ' · ' + pair.cls + (title ? ' · ' + title : '');
    let showHands = false;
    function paint() {
      if (!screen.classList.contains('host')) return; const di = [...viewers.values()].filter(v => Date.now() - v.seen < 15000).length, li = [...listeners.values()].filter(v => Date.now() - v.seen < 40000).length, n = di + li; row.count = n;
      const vc = document.getElementById('lvc'); if (vc) vc.textContent = '👁 ' + n; paintFeed(document.getElementById('lfeed'), comments);
      const hn = document.getElementById('lhn'); if (hn) hn.textContent = hands.size ? hands.size : ''; const side = document.getElementById('lside'); if (!side) return;
      side.classList.toggle('on', showHands || !!speaker);
      const sp = speaker && viewers.get(speaker), cur = sp ? '<div class="sp"><b>🎤 ' + esc(sp.name) + '</b> is speaking<button class="btn sm danger" data-x="1">Stop</button></div>' : '';
      side.innerHTML = '<h4>Raised hands (' + hands.size + ')</h4>' + cur + ([...hands.entries()].map(([id, h]) => '<div class="hd"><span>✋ ' + esc(h.name) + '</span><span><button class="btn sm" data-a="' + esc(id) + '">Let speak</button><button class="btn sm ghost" data-r="' + esc(id) + '">✕</button></span></div>').join('') || '<p class="small muted">Nobody has raised a hand.</p>') + '<h4>Interactive seats (' + di + '/' + MAXI + ')</h4><div class="vw">' + [...viewers.entries()].filter(([, v]) => Date.now() - v.seen < 15000).map(([id, v]) => '<span>' + esc(v.name) + ' <a href="#" data-k="' + esc(id) + '" title="Remove from lesson">✕</a></span>').join('') + '</div><p class="small muted">+ ' + li + ' listening / watching only (everyone after the first ' + MAXI + ')</p>';
      side.querySelectorAll('[data-a]').forEach(b => b.onclick = () => setSpeaker(b.dataset.a)); side.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { hands.delete(b.dataset.r); send({ t: 'declined', to: b.dataset.r }); paint(); });
      side.querySelectorAll('[data-x]').forEach(b => b.onclick = () => setSpeaker(null)); side.querySelectorAll('[data-k]').forEach(b => b.onclick = e => { e.preventDefault(); send({ t: 'kick', to: b.dataset.k }); dropPeer(b.dataset.k); });
    }
    const swap = async k => {
      try { if (k === 'camera' && vid) vid.getTracks().forEach(x => x.stop()); const s = k === 'camera' ? await getCam() : await getScr(); const t = s.getVideoTracks()[0]; if (vid && vid !== s) vid.getTracks().forEach(x => x.stop()); vid = s; vtrack = t; kind = k; row.video = true;
        peers.forEach(p => p.vsend.replaceTrack(t).catch(() => { })); document.getElementById('lv').srcObject = s; t.addEventListener('ended', () => { if (kind === 'screen' && !ended) swap('camera').catch(() => { }); }); }
      catch (e) { toast(e && e.name === 'NotAllowedError' ? 'Permission was cancelled.' : 'Could not switch: ' + (e && e.message || e), 'bad'); }
    };
    if (vtrack && kind === 'screen') vtrack.addEventListener('ended', () => { if (!ended) swap('camera').catch(() => { }); });
    document.getElementById('lm').onclick = e => { muted = !muted; micTrack.enabled = !muted; e.currentTarget.textContent = muted ? '🔇' : '🎤'; e.currentTarget.classList.toggle('off', muted); };
    document.getElementById('lcam').onclick = () => swap('camera'); document.getElementById('lflip').onclick = () => { facing0 = facing0 === 'user' ? 'environment' : 'user'; swap('camera'); }; const sb = document.getElementById('lscr'); if (sb) sb.onclick = () => swap('screen');
    document.getElementById('lh').onclick = () => { showHands = !showHands; paint(); };
    document.getElementById('lcf').onsubmit = e => { e.preventDefault(); const i = document.getElementById('lci'), text = i.value.trim().slice(0, 200); if (!text) return; i.value = ''; comments.push({ name: me.name, role: 'teacher', text }); send({ t: 'cmt', name: me.name, r: 'teacher', text }); paint(); };
    document.getElementById('lend').onclick = async () => { if (await confirmBox('End this lesson for everyone watching?', { title: 'End lesson', ok: 'End lesson' })) end(true); };
    async function end(clean) {
      if (ended) return; ended = true; clearInterval(tick); clearInterval(beat); clearInterval(hb); send({ t: 'end' });
      [...peers.keys()].forEach(dropPeerQuiet); [mic, vid].forEach(s => s && s.getTracks().forEach(t => t.stop())); try { ac.close(); } catch (e) { /* ignore */ }
      await Dir.end(room); setTimeout(() => ch.close(), 800); session = null; screen.className = 'livev'; screen.innerHTML = ''; if (clean) { toast('Lesson ended.', 'ok'); lobby(); }
    }
    beat = setInterval(() => Dir.beat(row), 4000); Dir.beat(row); hb = setInterval(() => { send({ t: 'hb', n: row.count, speaker: speaker && viewers.get(speaker) ? { id: speaker, name: viewers.get(speaker).name } : null }); }, 3000); send({ t: 'hb', n: 0 });
    tick = setInterval(() => { const t = document.getElementById('lvt'); if (t) t.textContent = mmss((Date.now() - startedAt) / 1000); [...viewers.entries()].forEach(([id, v]) => { if (Date.now() - v.seen > 15000) dropPeer(id); }); [...listeners.entries()].forEach(([id, v]) => { if (Date.now() - v.seen > 40000) dropPeer(id); }); paint(); }, 1000);
    window.__liveHost = { end }; paint();
  }

  /* ================= LEARNER: watch ================= */
  async function watch(info) {
    const acc = Server.liveAccess(info.cls, info.subject_id); if (!acc.ok) return toast(acc.error, 'bad');
    if (!supported) return toast('Live lessons need Chrome, Edge or Safari over https.', 'bad');
    const myId = 'v_' + Math.random().toString(36).slice(2, 10), room = info.room; let pc = null, ended = false, hostId = null, hostSeen = Date.now(), speaking = false, micStream = null, handUp = false, lastCmt = 0, pending = [], has = false, joinTimer = null, connected = false, stats = { n: 0, speaker: null }, hbT = null, kicked = false, parentId = null, listener = false, lastJoin = 0, tickN = 0; const kids = new Map(), TOHOST = { hb: 1, cmt: 1, hand: 1, leave: 1, up: 1 };
    const comments = [], send = m => ch && ch.send(Object.assign({ from: myId, name: me.name, role: me.role }, TOHOST[m.t] && hostId ? { to: hostId } : {}, m));
    const onmsg = async m => {
      if (!m || m.from === myId || ended) return; if (m.to && m.to !== myId) return;
      if (m.t === 'join' && m.relay) return serveChild(m);
      const kid = kids.get(m.from); if (kid && (m.t === 'answer' || m.t === 'ice')) return kidMsg(kid, m);
      const fromHost = m.role === 'teacher', fromParent = !!parentId && m.from === parentId; if (!fromHost && !fromParent) return; // only the teacher's device (or my relay parent) may steer me
      if (fromHost) { hostId = hostId || m.from; hostSeen = Date.now(); }
      if (m.t === 'cmt' && fromHost) { if (m.id !== myId) { comments.push({ name: m.name, role: m.r || 'student', text: String(m.text || '').slice(0, 200) }); paint(); } }
      else if (m.t === 'hb' && fromHost) { stats = { n: m.n || 0, speaker: m.speaker || null }; paint(); }
      else if (m.t === 'relay' && fromHost) { listener = true; parentId = m.parent; lastJoin = Date.now(); connected = false; if (pc) { try { pc.close(); } catch (e) { /* ignore */ } pc = null; } send({ t: 'join', to: parentId, relay: 1 }); paint(); }
      else if (m.t === 'rejoin' && fromHost) { connected = false; lastJoin = 0; send({ t: 'join', retry: 1 }); }
      else if (m.t === 'offer') {
        const up = m.from; if (fromHost) { hostId = up; listener = false; parentId = null; } if (pc) { try { pc.close(); } catch (e) { /* ignore */ } } has = false; connected = false; const vv = document.getElementById('lv'); if (vv) vv.srcObject = null; pc = new RTCPeerConnection({ iceServers: Remote.ice }); let dTimer = null;
        pc.ontrack = e => { const v = document.getElementById('lv'); if (!v) return; if (!v.srcObject) v.srcObject = new MediaStream(); const ms = v.srcObject; if (!ms.getTracks().includes(e.track)) ms.addTrack(e.track); v.play().catch(() => { const b = document.getElementById('ltap'); if (b) b.style.display = 'flex'; }); paint(); };
        pc.onicecandidate = e => { if (e.candidate) send({ t: 'ice', to: up, candidate: e.candidate.toJSON() }); };
        const mine = pc; pc.onconnectionstatechange = () => {
          if (mine !== pc) return; const was = connected; connected = pc.connectionState === 'connected'; if (connected && !was) send({ t: 'up' }); clearTimeout(dTimer);
          const redo = () => { if (ended || mine !== pc) return; toast('Connection lost. Reconnecting…', 'bad'); connected = false; lastJoin = Date.now(); send({ t: 'join', retry: 1 }); };
          if (pc.connectionState === 'failed') redo(); else if (pc.connectionState === 'disconnected') dTimer = setTimeout(() => { if (pc && pc.connectionState !== 'connected') redo(); }, 4000); paint();
        };
        await pc.setRemoteDescription(m.sdp); if (!listener) pc.getTransceivers().forEach(t => { if (t.receiver.track && t.receiver.track.kind === 'audio') t.direction = 'sendrecv'; }); has = true; for (const c of pending.splice(0)) { try { await pc.addIceCandidate(c); } catch (e) { /* ignore */ } }
        const a = await pc.createAnswer(); await pc.setLocalDescription(a); send({ t: 'answer', to: up, sdp: desc(pc) });
      }
      else if (m.t === 'ice') { if (pc && has) { try { await pc.addIceCandidate(m.candidate); } catch (e) { /* ignore */ } } else pending.push(m.candidate); }
      else if (m.t === 'allow') { speak(true); }
      else if (m.t === 'revoke') { speak(false); }
      else if (m.t === 'declined') { handUp = false; toast('The teacher cannot take your question right now.', ''); paint(); }
      else if (m.t === 'kick') { kicked = true; toast('The teacher removed you from this lesson.', 'bad'); leave(); }
      else if (m.t === 'end') { toast('The lesson has ended.', 'ok'); leave(); }
    };
    /* relay: pass the stream I am receiving on to a listener the teacher assigned to me */
    async function serveChild(m) {
      const v = document.getElementById('lv'), ms = v && v.srcObject; if (!connected || !ms || !ms.getTracks().length || ended) return;
      if (kids.size >= KIDS + 2 && !kids.has(m.from)) return; const old = kids.get(m.from); if (old) { try { old.pc.close(); } catch (e) { /* ignore */ } }
      const kp = new RTCPeerConnection({ iceServers: Remote.ice }), k = { pc: kp, pending: [], has: false }; kids.set(m.from, k); ms.getTracks().forEach(t => kp.addTrack(t, ms));
      kp.onicecandidate = e => { if (e.candidate) send({ t: 'ice', to: m.from, candidate: e.candidate.toJSON() }); };
      kp.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(kp.connectionState)) { try { kp.close(); } catch (e) { /* ignore */ } if (kids.get(m.from) === k) kids.delete(m.from); } };
      const o = await kp.createOffer(); await kp.setLocalDescription(o); send({ t: 'offer', to: m.from, sdp: desc(kp) });
    }
    async function kidMsg(k, m) {
      if (m.t === 'answer') { if (k.pc.signalingState !== 'have-local-offer') return; await k.pc.setRemoteDescription(m.sdp); k.has = true; for (const c of k.pending.splice(0)) { try { await k.pc.addIceCandidate(c); } catch (e) { /* ignore */ } } }
      else if (k.has) { try { await k.pc.addIceCandidate(m.candidate); } catch (e) { /* ignore */ } } else k.pending.push(m.candidate);
    }
    const audioTr = () => pc && pc.getTransceivers().find(x => x.receiver.track && x.receiver.track.kind === 'audio');
    async function speak(on) {
      if (on === speaking) return;
      if (on) {
        try { micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { toast('Microphone permission denied, so you cannot speak.', 'bad'); send({ t: 'hand', on: false }); handUp = false; return paint(); }
        const tr = audioTr(); if (tr) await tr.sender.replaceTrack(micStream.getAudioTracks()[0]); speaking = true; handUp = false; toast('You can speak now. The teacher can hear you.', 'ok');
      } else {
        speaking = false; const tr = audioTr(); if (tr) await tr.sender.replaceTrack(null).catch(() => { }); if (micStream) micStream.getTracks().forEach(t => t.stop()); micStream = null; toast('Your turn to speak has ended.', '');
      }
      paint();
    }
    const ch = Transport.open(room, onmsg, myId, () => (listener ? 1500 : 800)); if (!ch) return toast('This browser cannot join a live lesson.', 'bad');
    screen.className = 'livev on'; screen.innerHTML = '<video id="lv" autoplay playsinline></video><div class="lwait" id="lwait">Connecting to the teacher…</div><button class="ltap" id="ltap" style="display:none">🔊 Tap to play</button>'
      + '<div class="lt"><button class="x" id="lx" aria-label="Leave lesson">←</button><span class="live">● LIVE</span><span class="vc" id="lvc">👁 0</span><b class="ttl">' + esc(info.subject_name) + ' · ' + esc(info.host_name) + (info.title ? ' · ' + esc(info.title) : '') + '</b></div>'
      + '<div class="lspk" id="lspk"></div><div class="lfeed" id="lfeed" aria-live="polite"></div>'
      + '<form class="lcf2" id="lcf"><input id="lci" maxlength="200" placeholder="Add a comment…" autocomplete="off" aria-label="Comment"><button class="hand" id="lhand" type="button" aria-label="Raise hand">✋</button><button class="snd" type="submit" aria-label="Send comment">➤</button></form>';
    document.getElementById('ltap').onclick = e => { const v = document.getElementById('lv'); v.play().then(() => { e.currentTarget.style.display = 'none'; }).catch(() => { }); };
    function paint() {
      if (!document.getElementById('lv') || ended) return; const w = document.getElementById('lwait'), v = document.getElementById('lv'), has = v.srcObject && v.srcObject.getVideoTracks().length;
      if (w) w.style.display = connected && has ? 'none' : 'flex'; if (w && connected && !has) w.textContent = 'Connected — the teacher is talking (no picture yet).';
      const vc = document.getElementById('lvc'); if (vc) vc.textContent = '👁 ' + (stats.n || 0); paintFeed(document.getElementById('lfeed'), comments);
      const sp = document.getElementById('lspk'); if (sp) sp.innerHTML = speaking ? '<span class="you">🎤 You are speaking <button id="lmu">Mute</button></span>' : (stats.speaker ? '<span>🎤 ' + esc(stats.speaker.name) + ' is speaking</span>' : '');
      const mu = document.getElementById('lmu'); if (mu) mu.onclick = () => { const t = micStream && micStream.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; mu.textContent = t.enabled ? 'Mute' : 'Unmute'; } };
      const h = document.getElementById('lhand'); if (h) { h.classList.toggle('on', handUp); h.style.display = speaking || listener ? 'none' : ''; }
      const inp = document.getElementById('lci'), sn = document.querySelector('#lcf .snd'); if (inp) { inp.disabled = listener; inp.placeholder = listener ? 'Watching only — the ' + MAXI + ' interactive seats are taken' : 'Add a comment…'; } if (sn) sn.disabled = listener;
    }
    document.getElementById('lhand').onclick = () => { handUp = !handUp; send({ t: 'hand', on: handUp }); toast(handUp ? 'Hand raised. Wait for the teacher to pick you.' : 'Hand lowered.', ''); paint(); };
    document.getElementById('lcf').onsubmit = e => { e.preventDefault(); const i = document.getElementById('lci'), text = i.value.trim().slice(0, 200); if (!text || listener) return; if (Date.now() - lastCmt < 1200) return toast('Slow down a little.', ''); lastCmt = Date.now(); i.value = ''; comments.push({ name: me.name, role: me.role, text }); send({ t: 'cmt', text }); paint(); };
    function leave() { if (ended) return; ended = true; clearInterval(joinTimer); clearInterval(hbT); try { send({ t: 'leave' }); } catch (e) { /* ignore */ } if (pc) { try { pc.close(); } catch (e) { /* ignore */ } } if (micStream) micStream.getTracks().forEach(t => t.stop()); kids.forEach(k => { try { k.pc.close(); } catch (e) { /* ignore */ } }); setTimeout(() => ch.close(), 600); session = null; screen.className = 'livev'; screen.innerHTML = ''; lobby(); }
    document.getElementById('lx').onclick = leave; session = { stop: leave };
    send({ t: 'join' }); joinTimer = setInterval(() => { if (!connected && !ended && !(listener && Date.now() - lastJoin < 9000)) { lastJoin = Date.now(); send({ t: 'join', retry: 1 }); } if (Date.now() - hostSeen > 25000 && hostId && !ended) { toast('The lesson seems to have ended.', ''); leave(); } }, 4000);
    hbT = setInterval(() => { tickN++; if (!listener || tickN % 3 === 0) send({ t: 'hb' }); }, 4000); window.addEventListener('beforeunload', () => { try { send({ t: 'leave' }); } catch (e) { /* ignore */ } });
    setTimeout(() => { if (!connected && !ended) { const w = document.getElementById('lwait'); if (w) w.textContent = 'Still connecting… if this stays here, the teacher may have just ended the lesson.'; } }, 12000);
  }

  /* ================= LOBBY ================= */
  let rows = [], pollT = null;
  async function lobby() {
    clearInterval(pollT); const pairs = isTeacher ? Server.scope().pairs : [];
    main.innerHTML = '<div class="row between"><div><p class="muted mb0">' + (isTeacher ? 'Teach live' : 'Live lessons') + '</p><h1 class="mb0">' + (isTeacher ? '🔴 Go live' : '🔴 Live now') + '</h1></div></div>'
      + (isTeacher ? '<div class="alert info mt" role="status">You are the only one on the big screen. The first <b>30</b> learners who join get interactive seats: they can <b>comment</b> and <b>raise a hand</b>, and you pick who speaks. Everyone else who joins can still watch and listen, with no limit. Other teachers can be live at the same time for their own subjects. Discussion chats are for learners only.</div><div id="mine"></div>' : '<p class="muted">Your teachers go live here. Tap a lesson to watch, send comments and raise your hand to ask a question.</p>')
      + '<h2 class="mt">' + (isTeacher ? 'Live in your classes' : 'Happening now') + '</h2><div id="now" class="stack"></div>';
    const paintNow = () => {
      const el = document.getElementById('now'); if (!el) return;
      const list = isTeacher ? rows.filter(r => pairs.some(p => p.cls === r.cls && p.subject === r.subject_id)) : rows;
      el.innerHTML = list.map(r => '<div class="card livecard"><div><span class="badge bad">● LIVE</span> <b>' + esc(r.subject_name) + '</b> · ' + esc(r.cls) + '<br><span class="small muted">' + esc(r.host_name) + (r.title ? ' · ' + esc(r.title) : '') + ' · ' + (r.count || 0) + ' watching</span></div>' + (r.host_id === me.id ? '<span class="small muted">You are live</span>' : (isTeacher ? '<span class="small muted">another teacher</span>' : '<button class="btn orange" data-w="' + esc(r.room) + '">Watch</button>')) + '</div>').join('') || '<div class="card"><p class="muted mb0">' + (isTeacher ? 'No lessons are live in your classes.' : 'No lesson is live right now. When a teacher goes live for your class it appears here.') + '</p></div>';
      el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const r = rows.find(x => x.room === b.dataset.w); if (r) watch(r); });
    };
    if (isTeacher) {
      const mine = document.getElementById('mine');
      if (!pairs.length) mine.innerHTML = '<div class="card"><p class="mb0">You have not been assigned a class and subject yet. Ask the administrator.</p></div>';
      else mine.innerHTML = pairs.map((p, i) => '<div class="card stack"><h3 class="mb0">' + esc(SUBJ(p.subject)) + ' · ' + esc(p.cls) + ' <span class="muted small">' + esc(CNAME(p.cls)) + '</span></h3><label>Topic / title (optional)<input id="t' + i + '" maxlength="60" placeholder="e.g. Revision: Transport in animals"></label><div class="row"><button class="btn orange" data-g="' + i + '" data-s="camera">🎥 Go live with camera</button>' + (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent) ? '<button class="btn" data-g="' + i + '" data-s="screen">🖥️ Share my screen</button>' : '') + '<button class="btn ghost" data-g="' + i + '" data-s="audio">🎤 Audio lesson (no video)</button></div></div>').join('');
      mine.querySelectorAll('[data-g]').forEach(b => b.onclick = async () => {
        const i = +b.dataset.g, p = pairs[i], ex = rows.find(r => r.room === roomOf(p.cls, p.subject) && r.host_id !== me.id && Date.now() - r.beat_at < 12000);
        if (ex) return toast('Another account is already live for this subject and class.', 'bad');
        host(p, document.getElementById('t' + i).value.trim(), b.dataset.s);
      });
    }
    const poll = async () => { rows = await Dir.list(); paintNow(); }; await poll(); pollT = setInterval(poll, 3000);
    const want = qs.get('room'); if (want && !isTeacher) { const r = rows.find(x => x.room === want); qs.delete('room'); history.replaceState(null, '', location.pathname); if (r) watch(r); else toast('That lesson is not live any more.', ''); }
  }
  window.addEventListener('beforeunload', () => { if (window.__liveHost) { try { const m = Dir.local(); Object.keys(m).forEach(k => { if (m[k].host_id === me.id) delete m[k]; }); Dir.saveLocal(m); if (Remote.on) Remote.rest('DELETE', 'usl_calls?host_id=eq.' + enc(me.id)); } catch (e) { /* ignore */ } } });
  lobby();
})();

}
