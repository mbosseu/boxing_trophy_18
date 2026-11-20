const { adminClient, checkAdminPassword, json, cors } = require('../../lib/supabase-admin');

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
  if (!checkAdminPassword(req)) return json(res, 401, { error: 'Non autorise' });

  const supabase = adminClient();
  if (!supabase) return json(res, 500, { error: 'Supabase non configure' });

  try {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const gym_id = String(body.gym_id || 'autre').trim();
    if (!name) return json(res, 400, { error: 'Nom du coach requis' });
    const ins = await supabase.from('trophyrec_coaches').insert([{ name: name, gym_id: gym_id, active: true }]);
    if (ins.error) throw ins.error;
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e.message || 'coach impossible' });
  }
};
