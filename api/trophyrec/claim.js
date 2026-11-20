const { adminClient, json, cors } = require('../../lib/supabase-admin');

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let raw = '';
    req.on('data', function (c) { raw += c; });
    req.on('end', function () {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

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
    const body = await readBody(req);
    const userRes = await supabase.auth.getUser(token);
    const user = userRes.data && userRes.data.user;
    if (userRes.error || !user) return json(res, 401, { error: 'Session invalide' });

    const email = String(user.email || '').toLowerCase();
    const { data: fighter } = await supabase
      .from('trophyrec_fighters')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (fighter) {
      if (fighter.user_id && fighter.user_id !== user.id) {
        return json(res, 409, { error: 'Cette fiche est deja liee a un autre compte' });
      }
      if (!fighter.user_id) {
        const up = await supabase
          .from('trophyrec_fighters')
          .update({ user_id: user.id, updated_at: new Date().toISOString() })
          .eq('id', fighter.id);
        if (up.error) throw up.error;
      }
      return json(res, 200, { ok: true, fighter_id: fighter.id, status: 'linked' });
    }

    const TR = require('../../trophyrec.js');
    const prenom = String(body.prenom || '').trim();
    const nom = String(body.nom || '').trim();
    if (!prenom || !nom) {
      return json(res, 202, { ok: false, status: 'pending_profile', message: 'Indiquez nom et prenom pour creer la fiche (validation club si besoin).' });
    }
    let slug = TR.slugify(prenom + '-' + nom) || 'combattant';
    const { data: clash } = await supabase.from('trophyrec_fighters').select('slug').eq('slug', slug).maybeSingle();
    if (clash) slug = slug + '-' + user.id.slice(0, 6);
    const id = 'f_' + user.id.replace(/-/g, '').slice(0, 16);
    const ins = await supabase.from('trophyrec_fighters').insert([{
      id: id,
      slug: slug,
      prenom: prenom,
      nom: nom,
      email: email,
      user_id: user.id
    }]);
    if (ins.error) throw ins.error;
    return json(res, 200, { ok: true, fighter_id: id, status: 'created' });
  } catch (e) {
    return json(res, 500, { error: e.message || 'liaison impossible' });
  }
};
