/**
 * Sync admin — inscriptions + combats (Supabase).
 * Auth : cookie session admin (meme login que BOXPLUS /admin).
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../../lib/admin-session');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireAdmin(req))) {
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
  const edition = /^t\d{1,3}$/.test(String((req.query && req.query.edition) || '')) ? req.query.edition : 't20';

  try {
    let [regsRes, matchesRes, metaRes] = await Promise.all([
      supabase.from('registrations').select('*').eq('edition', edition),
      supabase.from('matches').select('*').eq('edition', edition).order('sort_order', { ascending: true }),
      supabase
        .from('match_metadata')
        .select('value')
        .eq('key', 'matches_timestamp')
        .maybeSingle()
    ]);

    // Colonne edition absente tant que le SQL n'est pas passe : tout est renvoye
    if (regsRes.error && /edition/i.test(regsRes.error.message || '')) {
      [regsRes, matchesRes] = await Promise.all([
        supabase.from('registrations').select('*'),
        supabase.from('matches').select('*').order('sort_order', { ascending: true })
      ]);
    }
    if (regsRes.error) throw regsRes.error;
    if (matchesRes.error) throw matchesRes.error;

    return res.status(200).json({
      registrations: regsRes.data || [],
      matches: matchesRes.data || [],
      matchesTimestamp: metaRes.data ? metaRes.data.value : null,
      edition: edition,
      syncedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({
      error: e.message || 'Erreur Supabase'
    });
  }
};
