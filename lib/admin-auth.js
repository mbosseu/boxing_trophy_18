const { adminClient } = require('./supabase-admin');
const { secretsEqual } = require('./admin-session');

function dbRole(role) {
  return role === 'super_admin' ? 'admin' : role || 'admin';
}

async function verifyAppUsers(email, password) {
  const sb = adminClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('app_users').select('*').eq('email', email).maybeSingle();
    if (error || !data) return null;
    let bcrypt;
    try {
      bcrypt = require('bcryptjs');
    } catch {
      return null;
    }
    if (!bcrypt.compareSync(password, data.password_hash)) return null;
    if (data.deleted_at) return null;
    return {
      email: data.email,
      role: dbRole(data.role),
      name: data.name || data.email,
    };
  } catch {
    return null;
  }
}

async function verifyAdminLogin(email, password) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !password) return null;

  const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const superPass = process.env.SUPER_ADMIN_PASSWORD || '';
  if (superEmail && secretsEqual(normalized, superEmail)) {
    if (superPass && secretsEqual(password, superPass)) {
      return { email: normalized, role: 'super_admin', name: 'Super administrateur' };
    }
    return null;
  }

  return verifyAppUsers(normalized, password);
}

module.exports = { verifyAdminLogin };
