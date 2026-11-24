const { adminClient, checkAdminPassword, json, cors } = require('../../lib/supabase-admin');
const TR = require('../../trophyrec.js');
const { licenceOf } = require('./accounts.js');

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
    await readBody(req);
    const { data: regs, error } = await supabase.from('registrations').select('*');
    if (error) throw error;

    const { data: existing } = await supabase.from('trophyrec_fighters').select('id, slug, email, gym_id, gym_other');
    // Fiches deja creees avec un club ecrit a la main : rattachees a la bonne salle Boxing Center
    for (const f of existing || []) {
      if (f.gym_id && f.gym_id !== 'autre') continue;
      const gym = TR.gymIdFromText(f.gym_other);
      if (gym) await supabase.from('trophyrec_fighters').update({ gym_id: gym }).eq('id', f.id);
    }
    const slugs = new Set((existing || []).map(function (f) { return f.slug; }));
    const byEmail = {};
    (existing || []).forEach(function (f) {
      if (f.email) byEmail[String(f.email).toLowerCase()] = f;
    });

    let created = 0;
    let skipped = 0;
    for (const r of regs || []) {
      const email = String(r.email || '').trim().toLowerCase();
      if (email && byEmail[email]) {
        skipped += 1;
        continue;
      }
      let slug = TR.slugify((r.prenom || '') + '-' + (r.nom || '')) || 'combattant';
      let n = 2;
      const base = slug;
      while (slugs.has(slug)) {
        slug = base + '-' + n;
        n += 1;
      }
      slugs.add(slug);
      const id = r.id || 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const row = {
        id: String(id),
        slug: slug,
        prenom: r.prenom || '',
        nom: r.nom || '',
        email: email || null,
        photo_url: r.photoUrl || null,
        gym_other: r.club || null,
        gym_id: TR.gymIdFromText(r.club) || 'autre',
        sexe: r.sexe || null,
        registration_id: r.id || null
      };
      const lic = licenceOf(r);
      const withLicence = Object.assign({}, row, {
        licence_gate: lic ? lic.gate : null,
        numero_licence: lic ? lic.numero : null,
        licence_status: 'a_verifier',
        account_status: 'actif'
      });
      let ins = await supabase.from('trophyrec_fighters').insert([withLicence]);
      // Colonnes licence absentes tant que le SQL n'est pas passe
      if (ins.error && /licence|account_status/i.test(ins.error.message || '')) {
        ins = await supabase.from('trophyrec_fighters').insert([row]);
      }
      if (ins.error) throw ins.error;
      created += 1;
      if (email) byEmail[email] = row;
    }

    return json(res, 200, { ok: true, created: created, skipped: skipped, total: (regs || []).length });
  } catch (e) {
    return json(res, 500, { error: e.message || 'sync impossible' });
  }
};
