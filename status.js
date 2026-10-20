'use strict';
// GET /api/status -> which services are configured (booleans only, no secrets).
const L = require('./_lib');
module.exports = async (req, res) => { const c = L.cfg(); res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ ok: true, database: L.storeReady(c), sms: L.smsReady(c), email: L.emailReady(c), payments: L.payReady(c), whatsapp: L.waProvider(c) || false }); };
