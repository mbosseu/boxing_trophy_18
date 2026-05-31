/**
 * Signature Cloudinary pour uploads signés (preset ml_default, etc.)
 * Protégé par le mot de passe admin (header x-admin-password).
 */
const crypto = require('crypto');

function parseCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.trim().match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#\s]+)/i);
  if (!m) return null;
  return { api_key: m[1], api_secret: m[2], cloud_name: m[3] };
}

function getCredentials() {
  const fromUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);
  if (fromUrl) return fromUrl;
  const cloud_name = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const api_key = (process.env.CLOUDINARY_API_KEY || '').trim();
  const api_secret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  if (cloud_name && api_key && api_secret) {
    return { cloud_name, api_key, api_secret };
  }
  return null;
}

function signParams(params, apiSecret) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => k + '=' + params[k])
    .join('&');
  return crypto.createHash('sha1').update(sorted + apiSecret).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPass = (req.headers['x-admin-password'] || '').trim();
  const expected =
    (process.env.ADMIN_PASSWORD || '').trim() || 'fightevent18admin';
  if (!adminPass || adminPass !== expected) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  const creds = getCredentials();
  if (!creds) {
    return res.status(500).json({
      error:
        'Cloudinary non configuré sur le serveur (CLOUDINARY_URL ou API_KEY + API_SECRET sur Vercel)'
    });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch (_) {
    body = {};
  }

  const upload_preset =
    (body.upload_preset || process.env.CLOUDINARY_UPLOAD_PRESET || 'ml_default').trim();
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { timestamp, upload_preset };
  const signature = signParams(paramsToSign, creds.api_secret);

  return res.status(200).json({
    cloud_name: creds.cloud_name,
    api_key: creds.api_key,
    upload_preset,
    timestamp,
    signature
  });
};
