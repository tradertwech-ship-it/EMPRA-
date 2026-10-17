'use strict';
const L = require('./_lib');
// GET /api/otp-status -> tells the page whether real code sending is configured on this deployment.
module.exports = async (req, res) => {
  const c = L.cfg(); res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, sms: L.smsReady(c), email: L.emailReady(c) });
};
