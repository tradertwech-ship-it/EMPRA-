'use strict';
const crypto = require('crypto');
const L = require('./_lib');
// POST /api/send-otp {contact, purpose} -> sends a 6-digit code by SMS (phone) or email.
// The code is NEVER returned. A signed token is returned so /api/verify-otp can check the code without a database.
module.exports = async (req, res, deps) => {
  const fetchImpl = (deps && deps.fetch) || fetch;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  const c = L.cfg(), b = await L.body(req), contact = L.normContact(b.contact), purpose = b.purpose === 'transfer' ? 'transfer' : 'verify';
  if (!contact) return res.status(400).json({ ok: false, error: 'Enter a valid phone number or email.' });
  const isEmail = contact.includes('@');
  if (isEmail ? !L.emailReady(c) : !L.smsReady(c)) return res.status(501).json({ ok: false, error: 'not_configured' });
  if (L.limited('c:' + contact, 3, 10 * 60000) || L.limited('i:' + (req.headers && (req.headers['x-forwarded-for'] || '')), 20, 10 * 60000)) return res.status(429).json({ ok: false, error: 'Too many codes requested. Wait a few minutes and try again.' });
  const code = String(crypto.randomInt(100000, 1000000)), exp = Date.now() + 10 * 60000;
  const text = code + ' is your ' + c.appName + ' code. It expires in 10 minutes. Never share it.';
  try { if (isEmail) await L.sendEmail(c, contact, c.appName + ' code: ' + code, text, fetchImpl); else await L.sendSms(c, contact, text, fetchImpl); }
  catch (e) { return res.status(502).json({ ok: false, error: 'We could not send the code right now. Please try again.' }); }
  const payload = L.b64(JSON.stringify({ c: contact, p: purpose, e: exp }));
  res.status(200).json({ ok: true, via: isEmail ? 'email' : 'sms', token: payload + '.' + L.sign(c.secret, contact, purpose, exp, code), exp });
};
