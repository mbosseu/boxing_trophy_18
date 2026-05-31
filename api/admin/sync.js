/**
 * Sync admin — inscriptions + combats (Supabase).
 * Auth : header x-admin-password (même mot de passe que l’admin).
 */
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPass = (req.headers['x-admin-password'] || '').trim();
  const expected =
    (process.env.ADMIN_PASSWORD || '').trim() || 'boxingtrophy18admin';
  if (!adminPass || adminPass !== expected) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  if (!url || !key) {
    return res.status(500).json({
      error: 'Supabase non configuré sur Vercel (SUPABASE_URL + clé)'
    });
  }

  const supabase = createClient(url, key);

  try {
    const [regsRes, matchesRes, metaRes] = await Promise.all([
      supabase.from('registrations').select('*'),
      supabase.from('matches').select('*').order('sort_order', { ascending: true }),
      supabase
        .from('match_metadata')
        .select('value')
        .eq('key', 'matches_timestamp')
        .maybeSingle()
    ]);

    if (regsRes.error) throw regsRes.error;
    if (matchesRes.error) throw matchesRes.error;

    return res.status(200).json({
      registrations: regsRes.data || [],
      matches: matchesRes.data || [],
      matchesTimestamp: metaRes.data ? metaRes.data.value : null,
      syncedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({
      error: e.message || 'Erreur Supabase'
    });
  }
};
