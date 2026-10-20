'use strict';
// Runs the SAME app logic as the browser (js/app.js) on the server, against the one database document in Supabase.
// Requests are handled one at a time per instance; two instances racing are resolved by a version check + retry.
const L = require('./_lib');
const mem = new Map();
globalThis.USL_SERVER = true;
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
const C = () => L.cfg();
globalThis.USL_DEV_EMAIL = C().devEmail;
let fetchImpl = (...a) => fetch(...a);
globalThis.USL_HOOKS = {
  deliverOtp: (contact, purpose, code) => L.deliverOtp(C(), contact, purpose, code, fetchImpl),
  chargeReady: () => L.payReady(C()),
  charge: a => L.flwCharge(C(), a, fetchImpl),
  verify: ref => L.flwVerify(C(), ref, fetchImpl),
  status: () => { const c = C(); return { sms: L.smsReady(c), email: L.emailReady(c), pay: L.payReady(c), whatsapp: L.waProvider(c), store: L.storeReady(c) }; }
};
let USL;
try { require('./_core/data.js'); USL = require('./_core/app.js'); } catch (e) { require('../js/data.js'); USL = require('../js/app.js'); }
const KEY = 'usl_db_v1', TOK = 'usl_token', DEV = 'usl_device';

let chain = Promise.resolve();
const exclusive = fn => { const p = chain.then(fn, fn); chain = p.catch(() => { }); return p; };

async function transact(job, opts) {
  const c = C(); opts = opts || {};
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await L.storeGet(c, fetchImpl);
    mem.clear(); if (row.data) mem.set(KEY, JSON.stringify(row.data));
    if (opts.token) mem.set(TOK, opts.token); mem.set(DEV, opts.device || 'unknown');
    const before = mem.get(KEY) || null;
    await USL.Server.init(); const initial = before === null ? null : before;
    const out = await job(USL.Server);
    const after = mem.get(KEY) || null;
    if (after !== initial) { const ok = await L.storePut(c, JSON.parse(after), row.version, fetchImpl); if (!ok) continue; }
    return { out, version: row.version };
  }
  throw new Error('busy');
}

/* send queued WhatsApp notices, then record what happened */
async function flushOutbox() {
  const c = C(); if (!L.waProvider(c)) return;
  let queued; try { const row = await L.storeGet(c, fetchImpl); queued = row.data && (row.data.outbox || []).filter(m => m.channel === 'whatsapp' && m.status === 'queued' && (m.tries || 0) < 3).slice(0, 6); } catch (e) { return; }
  if (!queued || !queued.length) return;
  const res = {}; for (const m of queued) res[m.id] = await L.sendWhatsApp(c, m.to, m.text, fetchImpl);
  for (let k = 0; k < 4; k++) {
    const row = await L.storeGet(c, fetchImpl); if (!row.data) return; let changed = false;
    (row.data.outbox || []).forEach(m => { const r = res[m.id]; if (!r || m.status !== 'queued') return; changed = true; if (r.ok) { m.status = 'sent'; m.sentAt = Date.now(); m.via = r.via; } else { m.tries = (m.tries || 0) + 1; m.error = String(r.error || '').slice(0, 160); if (m.tries >= 3) m.status = 'failed'; } });
    if (!changed || await L.storePut(c, row.data, row.version, fetchImpl)) return;
  }
}

async function handle(b) {
  const c = C(); if (!L.storeReady(c)) return { status: 503, json: { error: 'The server database is not set up yet. The site owner must finish the setup (README → step 2).' } };
  const m = String(b.m || ''), args = Array.isArray(b.a) ? b.a : [];
  if (m !== 'sync' && !USL.REMOTE.includes(m)) return { status: 400, json: { error: 'Unknown action.' } };
  let res;
  try {
    res = await exclusive(() => transact(async S => {
      const startTok = mem.get(TOK) || '';
      const result = m === 'sync' ? { ok: true } : await S[m](...args);
      const token = mem.get(TOK) || ''; const o = { result };
      if (token !== startTok) o.token = token;
      if (!b.nv) { o.view = S._view(); }
      const uid = S._pass(); o.pass = uid ? L.makePass(c.secret, uid) : '';
      o.queued = (JSON.parse(mem.get(KEY) || '{}').outbox || []).some(x => x.status === 'queued');
      return o;
    }, { token: String(b.t || ''), device: String(b.d || '').slice(0, 60) }));
  } catch (e) { return { status: 503, json: { error: 'The server is busy or the database could not be reached. Please try again.' } }; }
  const o = res.out; if (o.queued) await flushOutbox().catch(() => { });
  delete o.queued; return { status: 200, json: o };
}

/* payment webhook: ask the provider about the reference, then let the app decide */
async function gatewayEvent(ref) {
  const c = C(); if (!L.storeReady(c)) return false;
  await exclusive(() => transact(async S => S._gatewayEvent(String(ref))));
  await flushOutbox().catch(() => { }); return true;
}
module.exports = { handle, gatewayEvent, setFetch: f => { fetchImpl = f; }, flushOutbox, _mem: mem };
