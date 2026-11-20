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
    const action = String(body.action || 'save');

    if (action === 'delete') {
      if (!body.id) return json(res, 400, { error: 'Combat introuvable' });
      const del = await supabase.from('trophyrec_bouts').delete().eq('id', String(body.id));
      if (del.error) throw del.error;
      return json(res, 200, { ok: true });
    }

    const fighterA = String(body.fighter_a || '').trim();
    const fighterB = String(body.fighter_b || '').trim();
    const result = String(body.result || '').trim();
    if (!fighterA || !fighterB || fighterA === fighterB) {
      return json(res, 400, { error: 'Deux combattants distincts requis' });
    }
    if (['a_win', 'b_win', 'draw', 'nc'].indexOf(result) === -1) {
      return json(res, 400, { error: 'Resultat invalide' });
    }
    const method = String(body.method || 'decision').trim();
    const row = {
      edition_id: body.edition_id || 't20',
      source_match_id: body.source_match_id ? String(body.source_match_id) : null,
      fighter_a: fighterA,
      fighter_b: fighterB,
      discipline: body.discipline || null,
      sexe: body.sexe || null,
      categorie_poids: body.categorie_poids || null,
      result: result,
      method: method,
      round: body.round ? Number(body.round) : null,
      bout_date: body.bout_date || new Date().toISOString().slice(0, 10)
    };

    const round = row.round;
    if (round !== null && (!Number.isInteger(round) || round < 1 || round > 12)) {
      return json(res, 400, { error: 'Round entre 1 et 12' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.bout_date))) {
      return json(res, 400, { error: 'Date invalide' });
    }

    let q;
    if (body.id) {
      // Correction d'un resultat deja saisi
      q = await supabase.from('trophyrec_bouts').update(row).eq('id', String(body.id));
    } else if (row.source_match_id) {
      q = await supabase
        .from('trophyrec_bouts')
        .upsert(row, { onConflict: 'edition_id,source_match_id' });
    } else {
      q = await supabase.from('trophyrec_bouts').insert([row]);
    }
    if (q.error) throw q.error;

    if (body.sync_affiche && body.source_match_id && (result === 'a_win' || result === 'b_win')) {
      const winner = result === 'a_win' ? 'fighter1' : 'fighter2';
      await supabase.from('matches').update({ winner: winner }).eq('id', body.source_match_id);
    }

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e.message || 'enregistrement impossible' });
  }
};
