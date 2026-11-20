const { adminClient, json, cors } = require('../../lib/supabase-admin');
const { sendEmailViaBrevo, isConfigured } = require('../../lib/brevo-send');

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let raw = '';
    req.on('data', function (c) {
      raw += c;
    });
    req.on('end', function () {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function welcomeHtml(email) {
  const site = String(process.env.SITE_URL || 'https://boxing-trophy-18.vercel.app').replace(/\/$/, '');
  return (
    '<p>Bonjour,</p>' +
    '<p>Votre acces TrophyRec est pret pour <strong>' +
    String(email).replace(/</g, '') +
    '</strong>.</p>' +
    '<p>Connectez-vous pour renseigner alias, photo, taille, garde, salle et coach. Le palmares officiel ne se modifie pas depuis le compte.</p>' +
    '<p><a href="' +
    site +
    '/connexion">Ouvrir mon espace combattant</a></p>' +
    '<p>Boxing Trophy 20 — Boxing Center</p>'
  );
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const supabase = adminClient();
  if (!supabase) return json(res, 500, { error: 'Supabase non configure' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { error: 'SUPABASE_SERVICE_ROLE_KEY manquante (inscription via Brevo)' });
  }
  if (!isConfigured()) {
    return json(res, 500, { error: 'BREVO_API_KEY manquante' });
  }

  try {
    const body = await readBody(req);
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');
    if (!email || !email.includes('@')) return json(res, 400, { error: 'E-mail invalide' });
    if (password.length < 6) return json(res, 400, { error: 'Mot de passe : 6 caracteres minimum' });

    const created = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true
    });
    if (created.error) return json(res, 400, { error: created.error.message });

    try {
      await sendEmailViaBrevo({
        to: email,
        subject: 'Votre acces TrophyRec — Boxing Trophy 20',
        html: welcomeHtml(email),
        text:
          'Votre acces TrophyRec est pret. Connectez-vous : https://boxing-trophy-18.vercel.app/connexion'
      });
    } catch (mailErr) {
      return json(res, 500, {
        error: 'Compte cree mais e-mail Brevo non envoye : ' + (mailErr.message || 'erreur')
      });
    }

    return json(res, 200, { ok: true, mail: 'brevo' });
  } catch (e) {
    return json(res, 500, { error: e.message || 'inscription impossible' });
  }
};
