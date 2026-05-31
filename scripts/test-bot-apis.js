/**
 * Teste les API utilisées par le bot WhatsApp (site Vercel + handlers locaux).
 * Usage : node scripts/test-bot-apis.js [SITE_URL]
 */
const SECRET = process.env.SITE_API_SECRET || 'bt18-api-secret-2026';
const SITE = (process.argv[2] || process.env.SITE_URL || 'https://boxing-center-trophy.vercel.app').replace(/\/$/, '');
const BOT = (process.env.WHATSAPP_BOT_URL || 'http://51.75.118.169:20305').replace(/\/$/, '');

function mockRes() {
  let statusCode = 200;
  let body = null;
  const res = {
    status(c) {
      statusCode = c;
      return res;
    },
    json(d) {
      body = d;
      return res;
    },
    end() {},
    get result() {
      return { statusCode, body };
    },
  };
  return res;
}

async function testLocalHandler() {
  const handler = require('../api/bot/registrations');
  const actions = ['participants', 'missing', 'list'];
  const out = [];
  for (const action of actions) {
    const req = {
      method: 'GET',
      url: `/api/bot/registrations?action=${action}`,
      query: { action },
      headers: { authorization: `Bearer ${SECRET}` },
    };
    const res = mockRes();
    await handler(req, res);
    const { statusCode, body } = res.result;
    const ok = statusCode === 200;
    out.push({
      scope: 'local',
      action,
      ok,
      status: statusCode,
      hint: ok
        ? (action === 'participants'
            ? `total=${body.total}`
            : action === 'list'
              ? `rows=${(body.registrations || []).length}`
              : `incomplete=${body.total}`)
        : body?.error || body,
    });
  }
  return out;
}

async function fetchCheck(label, url, options = {}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* html */
    }
    const ok = res.ok;
    return {
      scope: label,
      url,
      ok,
      status: res.status,
      hint: ok
        ? JSON.stringify(json).slice(0, 120)
        : (json?.error || text.trim().slice(0, 80)),
    };
  } catch (e) {
    return { scope: label, url, ok: false, status: 0, hint: e.message };
  }
}

async function main() {
  console.log('=== Handler local (api/bot/registrations.js) ===');
  (await testLocalHandler()).forEach((r) => {
    console.log(r.ok ? '✅' : '❌', r.action, r.status, r.hint);
  });

  console.log('\n=== Site Vercel:', SITE, '===');
  const siteTests = [
    ['participants', `${SITE}/api/bot/registrations?action=participants`, true],
    ['missing', `${SITE}/api/bot/registrations?action=missing`, true],
    ['list', `${SITE}/api/bot/registrations?action=list`, true],
    ['no-auth', `${SITE}/api/bot/registrations?action=participants`, false],
    [
      'admin-sync',
      `${SITE}/api/admin/sync`,
      true,
      { 'x-admin-password': 'boxingtrophy18admin' },
    ],
    ['wa-proxy', `${SITE}/api/admin/whatsapp?action=status`, false],
  ];
  for (const [name, url, withSecret, extraHeaders] of siteTests) {
    const headers = { ...(extraHeaders || {}) };
    if (withSecret) headers.Authorization = `Bearer ${SECRET}`;
    const r = await fetchCheck(`vercel:${name}`, url, { headers });
    console.log(r.ok ? '✅' : '❌', name, r.status, r.hint);
  }

  console.log('\n=== Bot KataBump:', BOT, '===');
  const botTests = [
    ['status', `${BOT}/api/status`, { method: 'GET' }],
    ['root', `${BOT}/`, { method: 'GET' }],
    [
      'set-phone-no-secret',
      `${BOT}/api/set-authorized-phone`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"phone":"33600000002"}',
      },
    ],
    [
      'set-phone',
      `${BOT}/api/set-authorized-phone`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({ phone: '33600000000' }),
      },
    ],
  ];
  for (const [name, url, opts] of botTests) {
    const r = await fetchCheck(`bot:${name}`, url, opts);
    const expectFail = name === 'set-phone-no-secret';
    const pass = expectFail ? r.status === 401 : r.ok;
    console.log(pass ? '✅' : '❌', name, r.status, r.hint);
  }

  console.log('\n→ Si Vercel /api/bot/* = 404 : redéployez après correction .vercelignore (/bot/)');
  console.log('→ Si bot POST = erreur iconv : redéployez bot/ avec parseJsonBody');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
