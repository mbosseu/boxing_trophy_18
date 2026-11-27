const crypto = require('crypto');

const COOKIE = 'bc_admin_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

function secretsEqual(provided, expected) {
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (!b.length) return false;
  const a = Buffer.from(String(provided || ''), 'utf8');
  const ha = crypto.createHmac('sha256', b).update(a).digest();
  const hb = crypto.createHmac('sha256', b).update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function hmacEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sessionSecret() {
  const value = String(
    process.env.SESSION_SECRET || process.env.SITE_API_SECRET || process.env.ADMIN_SECRET || ''
  ).trim();
  return value && value !== 'change-me' ? value : '';
}

function base64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signJwt(payload) {
  const secret = sessionSecret();
  if (!secret) throw new Error('session_secret_missing');
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64urlJson(payload);
  const data = header + '.' + body;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return data + '.' + sig;
}

function verifyJwt(token) {
  const secret = sessionSecret();
  if (!secret) throw new Error('session_secret_missing');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid token');
  const data = parts[0] + '.' + parts[1];
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (!hmacEqual(parts[2], expected)) throw new Error('invalid signature');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('expired');
  }
  return payload;
}

function parseCookie(req, name) {
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieSecure() {
  return process.env.NODE_ENV === 'production' || String(process.env.VERCEL || '') === '1';
}

function setAdminSessionCookie(res, user) {
  const token = signJwt({
    email: user.email,
    role: user.role,
    name: user.name || '',
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
  });
  const parts = [
    COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + MAX_AGE_SEC,
  ];
  if (cookieSecure()) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getAdminSession(req) {
  const token = parseCookie(req, COOKIE);
  if (!token) return null;
  try {
    const payload = verifyJwt(token);
    return { email: payload.email, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

function clearAdminSessionCookie(res) {
  const parts = [COOKIE + '=', 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (cookieSecure()) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function requireAdmin(req) {
  return Boolean(getAdminSession(req));
}

module.exports = {
  secretsEqual,
  sessionSecret,
  setAdminSessionCookie,
  getAdminSession,
  clearAdminSessionCookie,
  requireAdmin,
};
