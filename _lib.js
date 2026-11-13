'use strict';
// Shared helpers for the server functions. Files starting with "_" are not exposed as routes by Vercel.
const crypto = require('crypto');

const env = n => (process.env[n] || '').trim();
const cfg = () => ({
  secret: env('APP_SECRET') || env('OTP_SECRET'),
  devEmail: (env('DEV_EMAIL') || 'tradertwech@gmail.com').toLowerCase(),
  appName: env('APP_NAME') || 'Uganda Smart Learning',
  atUser: env('AT_USERNAME'), atKey: env('AT_API_KEY'), atSender: env('AT_SENDER_ID'),
  resendKey: env('RESEND_API_KEY'), resendFrom: env('RESEND_FROM'),
  sbUrl: env('SUPABASE_URL').replace(/\/$/, ''), sbService: env('SUPABASE_SERVICE_KEY'),
  flwKey: env('FLW_SECRET_KEY'), flwHash: env('FLW_SECRET_HASH'),
  waToken: env('WA_TOKEN'), waPhoneId: env('WA_PHONE_ID'), waTemplate: env('WA_TEMPLATE'), waLang: env('WA_TEMPLATE_LANG') || 'en',
  twSid: env('TWILIO_SID'), twToken: env('TWILIO_TOKEN'), twFrom: env('TWILIO_WA_FROM'),
  cmbKey: env('CALLMEBOT_KEY')
});
const smsReady = c => !!(c.atUser && c.atKey);
const emailReady = c => !!(c.resendKey && c.resendFrom);
const storeReady = c => !!(c.sbUrl && c.sbService && c.secret);
const payReady = c => !!c.flwKey;
const waProvider = c => (c.waToken && c.waPhoneId ? 'meta' : c.twSid && c.twToken && c.twFrom ? 'twilio' : c.cmbKey ? 'callmebot' : '');

function normContact(v) {
  v = String(v || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return v;
  const d = v.replace(/[\s\-()]/g, ''); const m = d.match(/^(?:\+?256|0)(7\d{8})$/);
  return m ? '+256' + m[1] : null;
}
const digits = v => String(v || '').replace(/\D/g, '');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
// A short-lived "pass" the server hands to signed-in, paying users so the tutor/voice functions can check access without a database.
function makePass(secret, userId, ttlMs) { const exp = Date.now() + (ttlMs || 15 * 60000), body = userId + '.' + exp; return body + '.' + hmac(secret, 'pass|' + body); }
function checkPass(secret, pass) {
  const p = String(pass || '').split('.'); if (p.length !== 3 || !secret) return false;
  return Number(p[1]) > Date.now() && safeEq(p[2], hmac(secret, 'pass|' + p[0] + '.' + p[1]));
}

// best-effort in-memory limiter (resets when the function instance recycles)
const hits = new Map();
function limited(key, max, windowMs) {
  const t = Date.now(), arr = (hits.get(key) || []).filter(x => t - x < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(t); hits.set(key, arr); return false;
}
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { return {}; }
}

/* ---------- one-time codes ---------- */
async function sendSms(c, to, text, f) {
  f = f || fetch; const host = c.atUser === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const form = new URLSearchParams({ username: c.atUser, to, message: text }); if (c.atSender) form.set('from', c.atSender);
  const r = await f('https://' + host + '/version1/messaging', { method: 'POST', headers: { apiKey: c.atKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  if (!r.ok) throw new Error('sms provider ' + r.status);
  const j = await r.json().catch(() => ({})); const rec = j && j.SMSMessageData && j.SMSMessageData.Recipients && j.SMSMessageData.Recipients[0];
  if (rec && !/success/i.test(rec.status || '')) throw new Error('sms not accepted: ' + rec.status);
}
async function sendEmail(c, to, subject, text, f) {
  f = f || fetch; const r = await f('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + c.resendKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: c.resendFrom, to: [to], subject, text }) });
  if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) { /* */ } throw new Error('email provider ' + r.status + ' ' + m); }
}
async function deliverOtp(c, contact, purpose, code, f) {
  const why = { verify: 'verify your account', transfer: 'move your account to this device', reset: 'reset your password' }[purpose] || 'confirm it is you';
  const text = code + ' is your ' + c.appName + ' code to ' + why + '. It expires in 10 minutes. Never share it.';
  try {
    if (contact.includes('@')) { if (!emailReady(c)) return { ok: false, error: 'Email sending is not set up yet. The site owner must add RESEND_API_KEY and RESEND_FROM.' }; await sendEmail(c, contact, c.appName + ' code: ' + code, text, f); return { ok: true, via: 'email' }; }
    if (!smsReady(c)) return { ok: false, error: 'SMS sending is not set up yet. The site owner must add AT_USERNAME and AT_API_KEY (Africa\'s Talking).' };
    await sendSms(c, contact, text, f); return { ok: true, via: 'sms' };
  } catch (e) { return { ok: false, error: 'We could not send the code right now. Please try again in a minute.', detail: String(e.message || e) }; }
}

/* ---------- WhatsApp (to the owner) ---------- */
async function sendWhatsApp(c, to, text, f) {
  f = f || fetch; const prov = waProvider(c), num = digits(to);
  if (!prov) return { ok: false, error: 'no_provider' };
  try {
    if (prov === 'meta') {
      const msg = c.waTemplate
        ? { messaging_product: 'whatsapp', to: num, type: 'template', template: { name: c.waTemplate, language: { code: c.waLang }, components: [{ type: 'body', parameters: [{ type: 'text', text: String(text).replace(/\s*\n\s*/g, ' | ').slice(0, 900) }] }] } }
        : { messaging_product: 'whatsapp', to: num, type: 'text', text: { body: String(text).slice(0, 3500) } };
      const r = await f('https://graph.facebook.com/v20.0/' + encodeURIComponent(c.waPhoneId) + '/messages', { method: 'POST', headers: { Authorization: 'Bearer ' + c.waToken, 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
      if (!r.ok) { let m = ''; try { m = (await r.json()).error.message; } catch (e) { /* */ } return { ok: false, error: 'meta ' + r.status + ' ' + m }; }
    } else if (prov === 'twilio') {
      const form = new URLSearchParams({ From: 'whatsapp:' + (c.twFrom.startsWith('+') ? c.twFrom : '+' + digits(c.twFrom)), To: 'whatsapp:+' + num, Body: String(text).slice(0, 1500) });
      const r = await f('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(c.twSid) + '/Messages.json', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(c.twSid + ':' + c.twToken).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
      if (!r.ok) return { ok: false, error: 'twilio ' + r.status };
    } else {
      const r = await f('https://api.callmebot.com/whatsapp.php?phone=' + num + '&text=' + encodeURIComponent(String(text).slice(0, 1500)) + '&apikey=' + encodeURIComponent(c.cmbKey));
      if (!r.ok) return { ok: false, error: 'callmebot ' + r.status };
    }
    return { ok: true, via: prov };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

/* ---------- Flutterwave mobile money (MTN / Airtel Uganda) ---------- */
async function flwCharge(c, a, f) {
  f = f || fetch;
  const email = a.email || ('u' + String(a.userId || a.ref).replace(/[^a-z0-9]/gi, '').toLowerCase() + '@pay.usl.app');
  const r = await f('https://api.flutterwave.com/v3/charges?type=mobile_money_uganda', { method: 'POST', headers: { Authorization: 'Bearer ' + c.flwKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ tx_ref: a.ref, amount: a.amount, currency: a.currency || 'UGX', email, phone_number: digits(a.phone), fullname: a.name || 'Student', network: /airtel/i.test(a.provider) ? 'AIRTEL' : 'MTN' }) });
  let j = null; try { j = await r.json(); } catch (e) { /* */ }
  if (!r.ok || !j || j.status !== 'success') return { ok: false, error: (j && j.message) ? 'The payment provider said: ' + j.message : 'We could not start the mobile money payment. Please try again.' };
  return { ok: true, message: 'Approve the payment on your phone by entering your mobile money PIN.' };
}
async function flwVerify(c, ref, f) {
  f = f || fetch;
  try {
    const r = await f('https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(ref), { headers: { Authorization: 'Bearer ' + c.flwKey } });
    const j = await r.json().catch(() => null); const d = j && j.data; if (!d) return { status: 'pending' };
    const st = String(d.status || '').toLowerCase();
    if (st === 'successful' || st === 'success') return { status: 'success', amount: d.amount, currency: d.currency, txId: String(d.flw_ref || d.id || '') };
    if (st === 'failed' || st === 'cancelled') return { status: 'failed' };
    return { status: 'pending' };
  } catch (e) { return { status: 'pending' }; }
}

/* ---------- database: one JSON document in Supabase (service key, never exposed to browsers) ---------- */
async function storeGet(c, f) {
  f = f || fetch; const r = await f(c.sbUrl + '/rest/v1/usl_state?id=eq.main&select=version,data', { headers: { apikey: c.sbService, Authorization: 'Bearer ' + c.sbService } });
  if (!r.ok) throw new Error('database ' + r.status); const rows = await r.json(); return rows && rows[0] ? { version: Number(rows[0].version), data: rows[0].data } : { version: 0, data: null };
}
async function storePut(c, data, version, f) {
  f = f || fetch; const h = { apikey: c.sbService, Authorization: 'Bearer ' + c.sbService, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (!version) { const r = await f(c.sbUrl + '/rest/v1/usl_state', { method: 'POST', headers: h, body: JSON.stringify({ id: 'main', version: 1, data }) }); if (r.status === 409) return false; if (!r.ok) throw new Error('database ' + r.status); return true; }
  const r = await f(c.sbUrl + '/rest/v1/usl_state?id=eq.main&version=eq.' + version, { method: 'PATCH', headers: h, body: JSON.stringify({ version: version + 1, data }) });
  if (!r.ok) throw new Error('database ' + r.status); const rows = await r.json(); return Array.isArray(rows) && rows.length === 1;
}
module.exports = { cfg, smsReady, emailReady, storeReady, payReady, waProvider, normContact, digits, safeEq, hmac, makePass, checkPass, limited, body, sendSms, sendEmail, deliverOtp, sendWhatsApp, flwCharge, flwVerify, storeGet, storePut };
