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

    if (action === 'ensure_fighter') {
      // Combattant non inscrit (ajoute a la main sur la carte d'un gala archive)
      const id = String(body.id || '');
      const prenom = String(body.prenom || '').trim();
      const nom = String(body.nom || '').trim();
      if (!/^ext_[a-z0-9_-]{3,80}$/.test(id) || !prenom || !nom) return json(res, 400, { error: 'Prénom et nom obligatoires' });
      const { data: existing } = await supabase.from('trophyrec_fighters').select('id').eq('id', id).maybeSingle();
      if (existing) return json(res, 200, { ok: true, id: id });
      const TR = require('../../trophyrec.js');
      let slug = TR.slugify(prenom + '-' + nom) || 'combattant';
      const { data: clash } = await supabase.from('trophyrec_fighters').select('id').eq('slug', slug).maybeSingle();
      if (clash) slug = slug + '-' + id.slice(-4);
      const ins = await supabase.from('trophyrec_fighters').insert([{
        id: id, slug: slug, prenom: prenom, nom: nom,
        gym_id: 'autre', gym_other: body.club ? String(body.club).trim() : null
      }]);
      if (ins.error) throw ins.error;
      return json(res, 200, { ok: true, id: id, created: true });
    }

    if (action === 'delete') {
      if (!body.id) return json(res, 400, { error: 'Combat introuvable' });
      const del = await supabase.from('trophyrec_bouts').delete().eq('id', String(body.id));
      if (del.error) throw del.error;
      if (body.affiche_match_id != null) {
        await supabase.from('matches').update({ winner: null }).eq('id', body.affiche_match_id);
      }
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
    // Decision des juges : unanime (ud), majoritaire (md) ou partagee (sd). Pas de methode pour un nul.
    const isWin = result === 'a_win' || result === 'b_win';
    const method = isWin ? String(body.method || 'ud').trim() : null;
    if (isWin && ['ud', 'md', 'sd'].indexOf(method) === -1) {
      return json(res, 400, { error: 'Décision invalide : unanime (UD), majoritaire (MD) ou partagée (SD)' });
    }
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

    // Gala absent de trophyrec_editions (Trophy 19, 18...) : on le declare avant d'enregistrer le combat
    const EDITIONS = {
      t20: ['Boxing Trophy 20', '2026-12-12', 'Garage Moteka, Fenouillet'],
      t19: ['Boxing Trophy 19', '2026-11-13', null],
      t18: ['Boxing Trophy 18', null, null]
    };
    if (!/^t\d{1,3}$/.test(String(row.edition_id))) return json(res, 400, { error: 'Gala invalide' });
    const ed = EDITIONS[row.edition_id] || ['Boxing Trophy ' + row.edition_id.slice(1), null, null];
    const edUp = await supabase.from('trophyrec_editions').upsert(
      { id: row.edition_id, label: ed[0], event_date: ed[1], venue: ed[2] },
      { onConflict: 'id', ignoreDuplicates: true }
    );
    if (edUp.error) throw edUp.error;

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

    // Carte des combats : vainqueur reporte sur le combat de l'affiche (id distinct possible pour les archives)
    const afficheId = body.affiche_match_id != null ? body.affiche_match_id : body.source_match_id;
    // Affiche erronee : les vrais adversaires remplacent ceux de la carte (fiches reprises des inscriptions)
    const af = body.affiche_fighters;
    if (af && body.affiche_match_id != null && af.fighter1 && af.fighter2) {
      const { data: regs, error: regErr } = await supabase
        .from('registrations')
        .select('*')
        .in('id', [String(af.fighter1), String(af.fighter2)]);
      if (regErr) throw regErr;
      const extraList = Array.isArray(af.extra) ? af.extra : [];
      const pick = (id) => (regs || []).find((r) => String(r.id) === String(id)) ||
        extraList.find((x) => String(x.id) === String(id) && /^ext_/.test(String(x.id)));
      const r1 = pick(af.fighter1);
      const r2 = pick(af.fighter2);
      if (!r1 || !r2) return json(res, 400, { error: 'Combattant introuvable dans les inscriptions' });
      const upF = await supabase.from('matches').update({ fighter1: r1, fighter2: r2 }).eq('id', body.affiche_match_id);
      if (upF.error) throw upF.error;
    }
    if (body.sync_affiche && afficheId != null) {
      const winner = result === 'a_win' ? 'fighter1' : result === 'b_win' ? 'fighter2' : null;
      if (winner || body.affiche_match_id != null) {
        await supabase.from('matches').update({ winner: winner }).eq('id', afficheId);
      }
    }

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e.message || 'enregistrement impossible' });
  }
};
