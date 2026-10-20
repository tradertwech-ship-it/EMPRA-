'use strict';
// GET /api/config -> public settings the browser needs for the shared class rooms.
// SUPABASE_ANON_KEY is a public key by design (it is meant to be used in browsers).
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_ANON_KEY || '';
  const ice = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) ice.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' });
  const features = { search: true, webGoogle: !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID), tts: !!process.env.GOOGLE_API_KEY, ai: !!process.env.ANTHROPIC_API_KEY };
  res.status(200).json({ ok: !!(url && key), url, key, ice, features });
};
