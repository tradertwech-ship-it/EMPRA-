/* Uganda Smart Learning — shared engine.
   IMPORTANT: this prototype has no real backend. `Server` below simulates one inside the browser
   (localStorage) so every rule can be seen working: trial, subscription, device lock, roles, review,
   payment verification. For production, replace each Server method with a call to a real API
   (FastAPI/NestJS + PostgreSQL) — the page code only talks to `Server`, never to storage directly. */
(function (root) {
  'use strict';
  const KEY = 'usl_db_v1', TOK = 'usl_token', DEV = 'usl_device', DAY = 864e5;
  /* Storage that never throws: some browsers/previews block localStorage. Fall back to memory (works for this page only). */
  const LS = (function () {
    try { const t = '__usl_t'; root.localStorage.setItem(t, '1'); root.localStorage.removeItem(t); return root.localStorage; } catch (e) { /* blocked */ }
    const m = {}; root.USL_STORAGE_BLOCKED = true;
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
  })();
  const isBrowser = typeof document !== 'undefined';
  const DEFAULT_CFG = { price: 20000, currency: 'UGX', days: 30, trialMinutes: 15, sandbox: true, aiDailyLimit: 30, aiCostPerCall: 30, payNumber: '0773014995', whatsappNumber: '0773014995', whatsappNotify: true };
  const CATEGORIES = ['Official UNEB past paper', 'NCDC sample assessment', 'School mock', 'Teacher-created assessment', 'Licensed publisher material', 'AI-generated practice'];
  const PERMS = ['Own content (author holds the rights)', 'Licensed / written permission held', 'Authorised by UNEB / NCDC', 'Permission pending'];
  const ROLE_PERMS = { admin: ['*'], reviewer: ['review', 'submit'], contributor: ['submit'], student: [] };

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
  const load = () => { try { db = JSON.parse(LS.getItem(KEY)); } catch (e) { db = null; } if (db) { db.cfg = Object.assign({}, DEFAULT_CFG, db.cfg); db.outbox = db.outbox || []; } return db; };
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

  async function seed() {
    const D = root.USL_DATA;
    const staff = [['admin@usl.demo', 'Admin User', 'admin', 'Admin@123'], ['reviewer@usl.demo', 'Reviewer Demo', 'reviewer', 'Review@123'], ['teacher@usl.demo', 'Teacher Demo', 'contributor', 'Teach@123']];
    const users = [];
    for (const [c, n, role, pw] of staff) {
      const salt = uid('s');
      users.push({ id: uid('u'), role, name: n, contact: c, classId: null, subjects: [], salt, pw: await hash(pw, salt), verified: true, status: 'active', createdAt: now(), deviceId: null, deviceSince: null, trialStartedAt: null, trialEndsAt: null, dailyGoal: 2, failed: 0, lockUntil: 0 });
    }
    const teacher = users.find(u => u.role === 'contributor');
    const papers = clone(D.papers).map(p => { p.createdAt = now(); p.level = (D.classes.find(c => c.id === p.cls) || {}).level || ''; if (p.submittedBy !== 'system') p.submittedBy = teacher.id; return p; });
    const lessons = clone(D.lessons);
    const syllabus = [];
    D.subjects.forEach(s => s.classes.forEach(c => syllabus.push({ classId: c, subjectId: s.id, ref: '', version: '', note: '' })));
    db = { v: 1, cfg: Object.assign({}, DEFAULT_CFG), classes: clone(D.classes), subjects: clone(D.subjects), orgs: clone(D.orgs), lessons, papers, syllabus, users, sessions: {}, otps: {}, subs: [], payments: [], progress: {}, attempts: [], aiUsage: {}, notifications: [], reviews: [], audit: [], secret: rnd(16) };
    audit('system.seeded', null, 'Sample content loaded');
  }
  const ready = (async () => { load(); if (!db || db.v !== 1) { await seed(); save(); } })();

  /* ---------- helpers ---------- */
  function normContact(c) {
    c = (c || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return c;
    const d = c.replace(/[\s\-()]/g, ''); const m = d.match(/^(?:\+?256|0)(7\d{8})$/);
    return m ? '+256' + m[1] : null;
  }
  const pwOk = p => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
  const can = (u, perm) => { const p = ROLE_PERMS[u.role] || []; return p.includes('*') || p.includes(perm); };
  const deviceId = () => { let d = LS.getItem(DEV); if (!d) { d = uid('dev'); LS.setItem(DEV, d); } return d; };
  function makeOtp(contact, purpose) {
    const a = new Uint32Array(1); root.crypto && root.crypto.getRandomValues ? root.crypto.getRandomValues(a) : (a[0] = Math.floor(Math.random() * 4e9));
    const code = String(100000 + (a[0] % 900000));
    db.otps[contact + '|' + purpose] = { code, exp: now() + 10 * 60000, tries: 0 };
    return code; // DEMO ONLY: in production this is sent by SMS/email and never returned to the browser
  }
  function checkOtp(contact, purpose, code) {
    const k = contact + '|' + purpose, o = db.otps[k];
    if (!o || o.exp < now()) return 'The code has expired. Request a new one.';
    if (o.tries >= 5) return 'Too many wrong codes. Request a new one.';
    if (String(code).trim() !== o.code) { o.tries++; return 'That code is not correct.'; }
    delete db.otps[k]; return null;
  }
  function startSession(u) {
    Object.keys(db.sessions).forEach(t => { if (db.sessions[t].userId === u.id) delete db.sessions[t]; }); // one active session per account
    const t = rnd(24); db.sessions[t] = { userId: u.id, deviceId: u.deviceId, at: now() };
    LS.setItem(TOK, t); audit('login.ok', u.id, 'device ' + u.deviceId.slice(-6)); save();
    return okr({ role: u.role });
  }
  function sessionUser() {
    load(); if (!db) return { reason: '' };
    const t = LS.getItem(TOK), s = t && db.sessions[t];
    if (!s) return { reason: t ? 'Your session ended. Please log in again.' : '' };
    const u = db.users.find(x => x.id === s.userId);
    if (!u || u.status !== 'active') return { reason: 'This account is not active.' };
    if (s.deviceId !== u.deviceId || s.deviceId !== deviceId()) return { reason: 'This account is now active on another device. Log in again to switch back.' };
    return { user: u, session: s };
  }
  function auth(perm) {
    const r = sessionUser(); if (!r.user) return { e: err('Please log in.') };
    if (perm && !can(r.user, perm)) { audit('permission.denied', r.user.id, perm); save(); return { e: err('You do not have permission to do that.') }; }
    return { u: r.user };
  }
  function accessOf(u) {
    if (!u) return { state: 'none' };
    if (u.role !== 'student') return { state: 'staff' };
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

  /* ---------- the simulated server ---------- */
  const Server = {
    async register(f) {
      const name = (f.name || '').trim(), contact = normContact(f.contact);
      if (name.length < 2) return err('Enter your full name.');
      if (!contact) return err('Enter a valid email address or Ugandan phone number (e.g. 0772 123456).');
      if (!pwOk(f.password)) return err('Password needs at least 8 characters with letters and numbers.');
      if (!f.consent) return err('Please confirm you are 18+, or that a parent/guardian consents to your use of this app.');
      const salt = uid('s'), pw = await hash(f.password, salt);
      await ready; load();
      if (!db.classes.find(c => c.id === f.classId)) return err('Choose your class.');
      if (db.users.find(u => u.contact === contact)) return err('An account with this contact already exists. Please log in.');
      const u = { id: uid('u'), role: 'student', name, contact, classId: f.classId, subjects: [], schoolCode: (f.schoolCode || '').trim(), salt, pw, verified: false, status: 'active', createdAt: now(), consentAt: now(), deviceId: null, deviceSince: null, trialStartedAt: null, trialEndsAt: null, dailyGoal: 2, failed: 0, lockUntil: 0 };
      db.users.push(u); const code = makeOtp(contact, 'verify'); audit('user.registered', u.id, contact); save();
      return okr({ contact, demoOtp: code });
    },
    async resendCode(contact, purpose) { contact = normContact(contact); load(); const u = db.users.find(x => x.contact === contact); if (!u) return err('Unknown account.'); const c = makeOtp(contact, purpose || 'verify'); save(); return okr({ demoOtp: c }); },
    async verifyRegistration(contact, code) {
      contact = normContact(contact); load(); const u = db.users.find(x => x.contact === contact); if (!u) return err('Unknown account.');
      const e = checkOtp(contact, 'verify', code); if (e) { save(); return err(e); }
      u.verified = true; u.deviceId = deviceId(); u.deviceSince = now(); audit('user.verified', u.id); notify(u.id, 'Welcome! Your account is verified. You can start your free 15-minute trial from the dashboard.');
      return startSession(u);
    },
    async login(contact, password) {
      const c = normContact(contact); if (!c) return err('Enter the email or phone number you registered with.');
      await ready; load(); let u = db.users.find(x => x.contact === c);
      if (u && u.lockUntil > now()) return err('Too many attempts. Try again in ' + Math.ceil((u.lockUntil - now()) / 1000) + ' seconds.');
      const good = u ? (await hash(password || '', u.salt)) === u.pw : false;
      load(); u = u && db.users.find(x => x.id === u.id);
      if (!u || !good) {
        if (u) { u.failed++; audit('login.failed', u.id); if (u.failed >= 5) { u.lockUntil = now() + 60000; u.failed = 0; audit('login.locked', u.id, '5 failed attempts'); notify(u.id, 'Several wrong password attempts were made on your account.'); } save(); }
        return err('Incorrect contact or password.');
      }
      if (u.status !== 'active') return err('This account is suspended. Please contact support.');
      if (!u.verified) { const code = makeOtp(c, 'verify'); save(); return okr({ needsVerify: true, contact: c, demoOtp: code }); }
      u.failed = 0; const dev = deviceId();
      if (!u.deviceId) { u.deviceId = dev; u.deviceSince = now(); audit('device.registered', u.id); }
      else if (u.deviceId !== dev) {
        const code = makeOtp(c, 'transfer'); audit('login.new_device', u.id, 'blocked pending verification'); notify(u.id, 'Someone tried to log in from a new device. If this was not you, change your password.'); save();
        return okr({ needsTransfer: true, contact: c, demoOtp: code });
      }
      return startSession(u);
    },
    async completeTransfer(contact, code) {
      contact = normContact(contact); load(); const u = db.users.find(x => x.contact === contact); if (!u) return err('Unknown account.');
      const e = checkOtp(contact, 'transfer', code); if (e) { save(); return err(e); }
      u.deviceId = deviceId(); u.deviceSince = now(); audit('device.transferred', u.id); notify(u.id, 'Your account was moved to a new device. The old device has been signed out.');
      return startSession(u);
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
      const l = db.lessons.find(x => x.id === id && x.status === 'published'); return l ? okr({ lesson: l }) : err('Lesson not found.');
    },
    getPaper(id, forReview) {
      const r = auth(); if (r.e) return r.e; const g = requireAccess(r.u); if (g) return g;
      const p = db.papers.find(x => x.id === id); if (!p) return err('Paper not found.');
      if (p.status !== 'published' && !(forReview && can(r.u, 'review'))) return err('This paper is not published.');
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

    /* payments */
    initiatePayment(provider, phone) {
      const r = auth(); if (r.e) return r.e; const u = r.u; if (u.role !== 'student') return err('Only students subscribe.');
      const ph = normContact(phone); if (!ph || ph.includes('@')) return err('Enter a valid Ugandan mobile money number, e.g. 0772 123456.');
      if (!['MTN Mobile Money', 'Airtel Money'].includes(provider)) return err('Choose a payment provider.');
      let p = db.payments.find(x => x.userId === u.id && x.status === 'pending' && now() - x.createdAt < 15 * 60000);
      if (p) return okr({ payment: p, reused: true });
      p = { id: uid('pay'), ref: 'USL-' + rnd(4).toUpperCase(), userId: u.id, provider, phone: ph, amount: db.cfg.price, currency: db.cfg.currency, days: db.cfg.days, payTo: normContact(db.cfg.payNumber), status: 'pending', createdAt: now(), updatedAt: now(), txId: null };
      db.payments.unshift(p); audit('payment.initiated', u.id, p.ref + ' ' + fmtUGX(p.amount)); save(); return okr({ payment: p });
    },
    myPayments() { const r = auth(); if (r.e) return []; return db.payments.filter(p => p.userId === r.u.id); },
    /* The ONLY path that can activate a subscription: an authenticated provider callback. */
    async handleCallback(payload, signature) {
      load(); const expect = await sha(db.secret + '|' + payload.ref + '|' + payload.status + '|' + payload.amount + '|' + (payload.txId || ''));
      if (signature !== expect) { audit('payment.bad_signature', null, String(payload.ref)); save(); return err('Invalid signature — callback rejected.'); }
      const p = db.payments.find(x => x.ref === payload.ref); if (!p) { audit('payment.unknown_ref', null, String(payload.ref)); save(); return err('Unknown transaction reference.'); }
      if (Number(payload.amount) !== p.amount) { audit('payment.amount_mismatch', p.userId, p.ref); save(); return err('Amount does not match the expected price.'); }
      if (payload.status === 'success') {
        if (p.status === 'success') { audit('payment.duplicate_ignored', p.userId, p.ref); save(); return okr({ duplicate: true, message: 'Duplicate confirmation ignored — no extra days added.' }); }
        if (p.status === 'reversed') { audit('payment.late_success_ignored', p.userId, p.ref); save(); return err('This transaction was already reversed.'); }
        const latest = db.subs.filter(s => s.userId === p.userId && s.status === 'active').reduce((m, s) => Math.max(m, s.expires), 0);
        const start = Math.max(now(), latest);
        db.subs.push({ id: uid('sub'), userId: p.userId, paymentId: p.id, start, expires: start + p.days * DAY, status: 'active' });
        p.status = 'success'; p.txId = payload.txId || null; p.updatedAt = now(); audit('payment.success', p.userId, p.ref); queueWhatsApp('subscription', payMessage(p, 'success'), p.id); notify(p.userId, 'Payment received. Your subscription is active for ' + p.days + ' days.'); save(); return okr({ message: 'Payment verified. Subscription activated.' });
      }
      if (payload.status === 'failed') { if (p.status === 'pending') { p.status = 'failed'; p.updatedAt = now(); audit('payment.failed', p.userId, p.ref); notify(p.userId, 'Your payment did not go through. No money was taken for the subscription.'); save(); } return okr({ message: 'Marked failed.' }); }
      if (payload.status === 'reversed') {
        if (p.status !== 'success') return okr({ message: 'Nothing to reverse.' });
        p.status = 'reversed'; p.updatedAt = now(); const s = db.subs.find(x => x.paymentId === p.id); if (s) { s.status = 'revoked'; }
        audit('payment.reversed', p.userId, p.ref); queueWhatsApp('reversal', payMessage(p, 'reversed'), p.id); notify(p.userId, 'A payment was reversed, so the matching subscription days were removed.'); save(); return okr({ message: 'Payment reversed; access removed.' });
      }
      return err('Unknown status.');
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
      if (!contact || !contact.includes('@')) return err('Staff accounts need an email address.'); if (!ROLE_PERMS[f.role] || f.role === 'student') return err('Choose a role.'); if (!pwOk(f.password)) return err('Password needs 8+ characters with letters and numbers.');
      if (!(f.name || '').trim()) return err('Enter a name.'); const salt = uid('s'), pw = await hash(f.password, salt); load();
      if (db.users.find(u => u.contact === contact)) return err('That email already has an account.');
      db.users.push({ id: uid('u'), role: f.role, name: f.name.trim(), contact, classId: null, subjects: [], salt, pw, verified: true, status: 'active', createdAt: now(), deviceId: null, deviceSince: null, dailyGoal: 2, failed: 0, lockUntil: 0 });
      audit('staff.added', r.u.id, contact + ' as ' + f.role); save(); return okr();
    },
    saveConfig(c) {
      const r = auth('*'); if (r.e) return r.e; const n = x => parseInt(x, 10);
      if (!(n(c.price) >= 1000) || !(n(c.days) >= 1) || !(n(c.trialMinutes) >= 1) || !(n(c.aiDailyLimit) >= 1)) return err('Check the values: price ≥ 1000, days ≥ 1, trial ≥ 1 minute, AI limit ≥ 1.');
      const pn = normContact(c.payNumber), wn = normContact(c.whatsappNumber);
      if (!pn || pn.includes('@')) return err('Enter a valid Ugandan phone number to receive payments.'); if (!wn || wn.includes('@')) return err('Enter a valid WhatsApp phone number.');
      Object.assign(db.cfg, { price: n(c.price), days: n(c.days), trialMinutes: n(c.trialMinutes), aiDailyLimit: n(c.aiDailyLimit), aiCostPerCall: n(c.aiCostPerCall) || 0, sandbox: !!c.sandbox, payNumber: String(c.payNumber).trim(), whatsappNumber: String(c.whatsappNumber).trim(), whatsappNotify: !!c.whatsappNotify });
      audit('config.saved', r.u.id, JSON.stringify(db.cfg)); save(); return okr();
    },
    upsertClass(c) { const r = auth('*'); if (r.e) return r.e; const id = (c.id || '').trim().toUpperCase(); if (!/^[A-Z0-9]{1,6}$/.test(id) || !(c.name || '').trim()) return err('Give a short class code (e.g. S1) and a name.'); const x = db.classes.find(k => k.id === id); const o = { id, name: c.name.trim(), level: (c.level || '').trim(), focus: (c.focus || '').trim() }; if (x) Object.assign(x, o); else db.classes.push(o); audit('class.saved', r.u.id, id); save(); return okr(); },
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
    addOrg(name) { const r = auth('*'); if (r.e) return r.e; name = (name || '').trim(); if (name.length < 2) return err('Enter the organisation name.'); if (db.orgs.find(o => o.name.toLowerCase() === name.toLowerCase())) return err('That organisation already exists.'); db.orgs.push({ id: uid('o'), name }); audit('org.added', r.u.id, name); save(); return okr(); },
    setRole(id, role) { const r = auth('*'); if (r.e) return r.e; const u = db.users.find(x => x.id === id); if (!u || u.id === r.u.id || u.role === 'student' || !ROLE_PERMS[role] || role === 'student') return err('Cannot change that role.'); u.role = role; Object.keys(db.sessions).forEach(t => { if (db.sessions[t].userId === id) delete db.sessions[t]; }); audit('role.changed', r.u.id, u.contact + ' → ' + role); save(); return okr(); },
    setSyllabus(classId, subjectId, ref, version, note) { const r = auth('*'); if (r.e) return r.e; const s = db.syllabus.find(x => x.classId === classId && x.subjectId === subjectId); if (!s) return err('Not found.'); Object.assign(s, { ref: (ref || '').trim(), version: (version || '').trim(), note: (note || '').trim() }); audit('syllabus.saved', r.u.id, classId + '/' + subjectId); save(); return okr(); },
    submitPaper(f) {
      const r = auth('submit'); if (r.e) return r.e;
      if (!(f.title || '').trim()) return err('Give the paper a title.');
      if (!db.classes.find(c => c.id === f.cls)) return err('Choose a class.'); if (!db.subjects.find(s => s.id === f.subject)) return err('Choose a subject.');
      const year = parseInt(f.year, 10); if (!(year >= 1990 && year <= 2100)) return err('Enter a valid year.');
      const pn = parseInt(f.paperNo, 10); if (!(pn >= 1 && pn <= 9)) return err('Paper number must be 1–9.'); const dur = parseInt(f.duration, 10); if (!(dur >= 1 && dur <= 300)) return err('Duration must be 1–300 minutes.');
      if (!CATEGORIES.includes(f.category)) return err('Choose a paper category.'); if (!PERMS.includes(f.permission)) return err('Choose the permission status.'); if (!db.orgs.find(o => o.id === f.org)) return err('Choose the source organisation.');
      const pq = parseQuestions(f.questionsText, !!f.hasGuide); if (pq.errors.length) return err(pq.errors[0]); if (!pq.questions.length) return err('Add at least one question.');
      const cl = db.classes.find(c => c.id === f.cls);
      const p = { id: uid('p'), title: f.title.trim(), cls: f.cls, level: cl.level, subject: f.subject, year, paperNo: pn, org: db.orgs.find(o => o.id === f.org).name, category: f.category, hasGuide: !!f.hasGuide, verified: false, permission: f.permission, reviewer: 'Pending review', status: 'pending', submittedBy: r.u.id, createdAt: now(), duration: dur, instructions: (f.instructions || '').trim() || 'Answer all questions.', questions: pq.questions };
      db.papers.push(p); audit('paper.submitted', r.u.id, p.title); save(); return okr({ id: p.id });
    },
    submitLesson(f) {
      const r = auth('submit'); if (r.e) return r.e;
      if (!db.classes.find(c => c.id === f.cls) || !db.subjects.find(s => s.id === f.subject)) return err('Choose a class and subject.');
      if (!(f.title || '').trim() || !(f.topic || '').trim() || !(f.notes || '').trim()) return err('Title, topic and notes are required.');
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
    async resetDemo() { LS.removeItem(KEY); LS.removeItem(TOK); db = null; await seed(); save(); return okr(); }
  };

  /* Stand-in for the Mobile Money provider. In production the provider calls YOUR server's webhook;
     the browser never signs or sends these. Used only while Admin → Settings → Sandbox is on. */
  const Gateway = {
    async simulate(ref, status) {
      load(); const p = db.payments.find(x => x.ref === ref); if (!p) return err('Unknown reference');
      const payload = { ref, status, amount: p.amount, txId: 'MM' + rnd(4).toUpperCase() };
      const sig = await sha(db.secret + '|' + payload.ref + '|' + payload.status + '|' + payload.amount + '|' + payload.txId);
      return Server.handleCallback(payload, sig);
    },
    async forged(ref) { return Server.handleCallback({ ref, status: 'success', amount: 20000, txId: 'FAKE' }, 'screenshot-pretending-to-be-proof'); }
  };

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

  /* ---------- speech ---------- */
  const Speech = {
    rate: parseFloat(LS && LS.getItem('usl_rate')) || 1, last: '',
    supported() { return isBrowser && 'speechSynthesis' in root; },
    speak(text) {
      if (!Speech.supported()) return false; Speech.stop(); Speech.last = text;
      const sents = String(text).replace(/\s+/g, ' ').match(/[^.!?;:]+[.!?;:]*/g) || [text], parts = []; let cur = '';
      sents.forEach(s => { if ((cur + s).length > 170) { if (cur) parts.push(cur); cur = s; } else cur += s; }); if (cur) parts.push(cur);
      parts.forEach(p => { const u = new SpeechSynthesisUtterance(p.trim()); u.rate = Speech.rate; u.lang = 'en-GB'; root.speechSynthesis.speak(u); }); return true;
    },
    pause() { Speech.supported() && root.speechSynthesis.pause(); }, resume() { Speech.supported() && root.speechSynthesis.resume(); },
    stop() { Speech.supported() && root.speechSynthesis.cancel(); }, replay() { if (Speech.last) Speech.speak(Speech.last); },
    setRate(r) { Speech.rate = r; LS.setItem('usl_rate', r); },
    listen(onResult, onEnd, onErr) {
      const SR = root.SpeechRecognition || root.webkitSpeechRecognition; if (!SR) return null;
      const r = new SR(); r.lang = 'en-GB'; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = e => onResult(e.results[0][0].transcript); r.onend = onEnd; r.onerror = e => onErr && onErr(e.error); r.start(); return r;
    },
    bar(el, getText) {
      if (!Speech.supported()) { el.innerHTML = '<p class="hint">Read-aloud is not supported by this browser. Try Chrome on Android or a recent desktop browser.</p>'; return; }
      el.innerHTML = '<div class="speechbar" role="group" aria-label="Read aloud controls"><button class="btn sm orange" data-a="play">🔊 Listen</button><button class="btn sm ghost" data-a="pause">⏸ Pause</button><button class="btn sm ghost" data-a="resume">▶ Resume</button><button class="btn sm ghost" data-a="replay">⟲ Replay</button><button class="btn sm ghost" data-a="stop">⏹ Stop</button><label class="small" style="margin:0">Speed <select data-a="rate" aria-label="Speaking speed">' + [0.75, 1, 1.25, 1.5].map(v => '<option value="' + v + '"' + (v === Speech.rate ? ' selected' : '') + '>' + v + '×</option>').join('') + '</select></label></div>';
      el.onclick = e => { const a = e.target.closest('button') && e.target.closest('button').dataset.a; if (a === 'play') Speech.speak(getText()); if (a === 'pause') Speech.pause(); if (a === 'resume') Speech.resume(); if (a === 'replay') Speech.replay(); if (a === 'stop') Speech.stop(); };
      el.querySelector('select').onchange = e => { Speech.setRate(parseFloat(e.target.value)); if (Speech.last && root.speechSynthesis.speaking) Speech.replay(); };
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
    if (a.state === 'staff') return ['paid', 'Staff'];
    return ['expired', 'Subscribe · ' + fmtUGX(cfg.price)];
  }
  function shell(user, page, a) {
    const staff = user.role !== 'student';
    const items = [['dashboard', 'dashboard.html', 'Home', '🏠'], ['library', 'library.html', 'Library', '📚'], ['papers', 'papers.html', 'Exam centre', '📝'], ['tutor', 'tutor.html', 'AI tutor', '🎙️'], ['profile', 'profile.html', 'Account', '👤']];
    if (staff) items.push(['admin', 'admin.html', 'Admin', '🛠️']);
    const cur = k => k === page ? ' aria-current="page"' : ''; const [pc, pt] = pill(a);
    const head = document.createElement('div');
    head.innerHTML = '<a class="skip" href="#main">Skip to content</a><header class="topbar"><div class="container"><a class="brand" href="dashboard.html"><span class="logo" aria-hidden="true">🎓</span><span>Uganda Smart Learning</span></a><nav class="nav" aria-label="Main">' + items.map(i => '<a href="' + i[1] + '"' + cur(i[0]) + '>' + i[2] + '</a>').join('') + '</nav><div class="top-right"><a id="pill" class="pill ' + pc + '" href="subscription.html">' + esc(pt) + '</a></div></div></header>';
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
    setInterval(() => {
      const cur = Server.currentUser(); if (!cur.user) { location.replace('index.html?msg=' + encodeURIComponent(cur.reason || 'Please log in again.')); return; }
      a = Server.access(cur.user); const p = $('#pill'); if (p) { const [c, t] = pill(a); p.className = 'pill ' + c; p.textContent = t; }
      root.dispatchEvent(new CustomEvent('usl:tick', { detail: a }));
      if (o.paid && !allowed(a)) lockedOverlay(a.hadSub ? 'sub' : 'trial');
    }, 1000);
    return { user, access: a };
  }

  const waLink = (to, text) => 'https://wa.me/' + String(to || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text || '');
  const USL = { LS, waLink, ready, Server, Gateway, AI, Speech, boot, toast, modal, confirmBox, esc, $, $$, fmtUGX, fmtDate, fmtMs, csv, download, textToHtml, parseQuestions, parseQuiz, plain, allowed, can, normContact, deviceId, newDevice: () => { LS.setItem(DEV, uid('dev')); }, CATEGORIES, PERMS, today };
  root.USL = USL; if (typeof module !== 'undefined' && module.exports) module.exports = USL;
})(typeof window !== 'undefined' ? window : globalThis);
