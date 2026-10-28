/**
 * Reset BT19 — vide les tables registrations + matches et réinitialise les flags.
 * Auth : header x-admin-password (même mot de passe que l'admin).
 * DELETE /api/admin/reset
 */
const { createClient } = require('@supabase/supabase-js');

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

  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    return res.status(500).json({ error: 'Supabase non configuré' });
  }

  const supabase = createClient(url, key);
  const results = {};

  // 1. Delete all registrations
  const { error: e1, count: c1 } = await supabase
    .from('registrations')
    .delete({ count: 'exact' })
    .neq('id', '');
  results.registrations = e1 ? { error: e1.message } : { deleted: c1 };

  // 2. Delete all matches
  const { error: e2, count: c2 } = await supabase
    .from('matches')
    .delete({ count: 'exact' })
    .gte('id', 0);
  results.matches = e2 ? { error: e2.message } : { deleted: c2 };

  // 3. Reset metadata flags
  const { error: e3 } = await supabase
    .from('match_metadata')
    .upsert([
      { key: 'registrations_open', value: 'false' },
      { key: 'matches_published', value: 'false' }
    ]);
  results.metadata = e3 ? { error: e3.message } : { reset: true };

  const hasError = Object.values(results).some(r => r.error);
  return res.status(hasError ? 500 : 200).json({ ok: !hasError, results });
};
