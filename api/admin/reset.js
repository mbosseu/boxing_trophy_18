/**
 * Reset BT19 — vide registrations + matches et remet les flags à false.
 * Auth : header x-admin-password
 * DELETE /api/admin/reset
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const adminPass = (req.headers['x-admin-password'] || '').trim();
  const expected = (process.env.ADMIN_PASSWORD || '').trim() || 'boxingtrophy19admin';
  if (!adminPass || adminPass !== expected) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const SUPA_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: 'Supabase non configuré (SUPABASE_URL + clé)' });
  }

  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

  const results = {};

  try {
    // Delete all registrations
    const r1 = await fetch(`${SUPA_URL}/rest/v1/registrations?id=neq.`, { method: 'DELETE', headers });
    results.registrations = { status: r1.status, ok: r1.ok };
  } catch (e) {
    results.registrations = { error: e.message };
  }

  try {
    // Delete all matches
    const r2 = await fetch(`${SUPA_URL}/rest/v1/matches?id=gte.0`, { method: 'DELETE', headers });
    results.matches = { status: r2.status, ok: r2.ok };
  } catch (e) {
    results.matches = { error: e.message };
  }

  try {
    // Reset metadata flags
    const r3 = await fetch(`${SUPA_URL}/rest/v1/match_metadata`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([
        { key: 'registrations_open', value: 'false' },
        { key: 'matches_published', value: 'false' }
      ])
    });
    results.metadata = { status: r3.status, ok: r3.ok };
  } catch (e) {
    results.metadata = { error: e.message };
  }

  const hasError = Object.values(results).some(r => r.error || !r.ok);
  return res.status(hasError ? 500 : 200).json({ ok: !hasError, results, url_used: SUPA_URL });
};
