/**
 * Proxy admin → serveur bot WhatsApp (KataBump, etc.)
 * Variables Vercel : WHATSAPP_BOT_URL, SITE_API_SECRET
 */
const FALLBACK = {
  WHATSAPP_BOT_URL: 'http://51.75.118.169:20305',
  SITE_API_SECRET: 'bt18-api-secret-2026',
};

function getBotUrl() {
  return (process.env.WHATSAPP_BOT_URL || FALLBACK.WHATSAPP_BOT_URL || '').replace(/\/$/, '');
}

function getSecret() {
  return process.env.SITE_API_SECRET || FALLBACK.SITE_API_SECRET || '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const botUrl = getBotUrl();
  const action = (req.query && req.query.action) || 'status';

  if (!botUrl) {
    res.status(503).json({
      error: 'WHATSAPP_BOT_URL non configuré',
      hint: 'Ajoutez l’URL KataBump dans Vercel ou dans l’admin (URL du bot).',
    });
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  const secret = getSecret();
  if (secret) headers.Authorization = `Bearer ${secret}`;

  try {
    if (action === 'status' && req.method === 'GET') {
      const r = await fetch(`${botUrl}/api/status`);
      const data = await r.json().catch(() => ({}));
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'POST' && action === 'start') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const r = await fetch(`${botUrl}/api/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          method: body.method || 'qr',
          phone: body.phone || '',
        }),
      });
      const data = await r.json().catch(() => ({}));
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'POST' && action === 'logout') {
      const r = await fetch(`${botUrl}/api/logout`, { method: 'POST', headers });
      const data = await r.json().catch(() => ({}));
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'POST' && action === 'authorize') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const r = await fetch(`${botUrl}/api/set-authorized-phone`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: body.phone || '' }),
      });
      const data = await r.json().catch(() => ({}));
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'POST' && action === 'deauthorize') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const r = await fetch(`${botUrl}/api/remove-authorized-phone`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: body.phone || '' }),
      });
      const data = await r.json().catch(() => ({}));
      res.status(r.status).json(data);
      return;
    }

    res.status(400).json({ error: 'action invalide (status | start | logout | authorize | deauthorize)' });
  } catch (e) {
    res.status(502).json({
      error: 'Bot injoignable',
      message: e.message || String(e),
      botUrl,
      hint: 'Vérifiez que le bot KataBump écoute sur 0.0.0.0:' + (botUrl.split(':').pop() || '20305'),
    });
  }
};
