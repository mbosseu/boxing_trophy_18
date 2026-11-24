const { adminClient, json, cors } = require('../../lib/supabase-admin');
const { archiveAndSoftDelete } = require('../../lib/soft-delete');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const supabase = adminClient();
  if (!supabase) return json(res, 500, { error: 'Supabase non configure' });

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json(res, 401, { error: 'Session requise' });

  try {
    const userRes = await supabase.auth.getUser(token);
    const user = userRes.data && userRes.data.user;
    if (userRes.error || !user) return json(res, 401, { error: 'Session invalide' });

    const { data: fighter } = await supabase
      .from('trophyrec_fighters')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (fighter) {
      await archiveAndSoftDelete(supabase, {
        table: 'trophyrec_fighters',
        idColumn: 'id',
        id: fighter.id,
        deletedBy: user.id,
        extraPatch: {
          user_id: null,
          alias: null,
          email: null,
          account_status: 'ferme',
          closed_reason: 'Compte supprime',
          slug: String(fighter.slug || fighter.id) + '-del-' + Date.now(),
          updated_at: new Date().toISOString(),
        },
      });
    }

    if (process.env.SUPABASE_SERVICE_ROLE_KEY && supabase.auth.admin) {
      await supabase.auth.admin.updateUserById(user.id, {
        email: 'deleted_' + user.id + '@deleted.invalid',
        ban_duration: '876000h',
      });
    }

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e.message || 'suppression impossible' });
  }
};
