/**
 * Comptes TrophyRec (une seule fonction Vercel pour rester sous la limite).
 *
 * Actions publiques :
 *  - provision : appelee apres l'inscription combat. Si l'e-mail correspond a une inscription
 *                avec licence (numero 6-7 chiffres) ou cotisation 50 EUR, cree l'acces avec un
 *                mot de passe provisoire et envoie identifiant + mot de passe par Brevo.
 *  - forgot    : envoie par Brevo un lien pour choisir un nouveau mot de passe.
 *
 * Actions admin (en-tete x-admin-password) :
 *  - list, create, verify_licence, refuse_licence, close, activate, resend, delete, update_profile
 *
 * Le numero de licence n'est verifie que sur le format ici : le controle reel se fait
 * dans le back office (licence validee ou refusee, compte ferme si fausse licence).
 */
const crypto = require('crypto');
const { adminClient, checkAdminPassword, json, cors } = require('../../lib/supabase-admin');
const { sendEmailViaBrevo, isConfigured } = require('../../lib/brevo-send');
const TR = require('../../trophyrec.js');

const BAN_FOREVER = '876000h';
const LICENCE_RE = /^\d{6,7}$/;

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let raw = '';
    req.on('data', function (c) { raw += c; });
    req.on('end', function () {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function site() {
  return String(process.env.SITE_URL || 'https://boxing-trophy-20.vercel.app').replace(/\/$/, '');
}

function cleanEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function tempPassword() {
  // Lisible au telephone : pas de 0/O ni 1/l
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += abc[bytes[i] % abc.length];
  return out;
}

/* Inscription Trophy valide pour ouvrir un acces : licence au bon format ou cotisation 50 EUR. */
function licenceOf(reg) {
  if (!reg) return null;
  const gate = String(reg.licenceGate || '');
  const num = String(reg.numeroLicence || '').replace(/\D/g, '');
  if (gate === 'paid_50' || reg.engagementLicence === true) return { gate: 'paid_50', numero: null };
  if (LICENCE_RE.test(num) && (gate === 'existing' || reg.licencie === 'Oui' || !gate)) return { gate: 'existing', numero: num };
  return null;
}

async function findRegistration(supabase, email) {
  const { data, error } = await supabase.from('registrations').select('*').ilike('email', email);
  if (error) throw error;
  const list = (data || []).filter(function (r) { return cleanEmail(r.email) === email; });
  list.sort(function (a, b) { return String(b.dateInscription || '').localeCompare(String(a.dateInscription || '')); });
  return list.find(licenceOf) || list[0] || null;
}

async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 20; page++) {
    const r = await supabase.auth.admin.listUsers({ page: page, perPage: 200 });
    if (r.error) throw r.error;
    const users = (r.data && r.data.users) || [];
    const hit = users.find(function (u) { return cleanEmail(u.email) === email; });
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function uniqueSlug(supabase, base) {
  let slug = TR.slugify(base) || 'combattant';
  const root = slug;
  for (let n = 2; n < 200; n++) {
    const { data } = await supabase.from('trophyrec_fighters').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    slug = root + '-' + n;
  }
  return root + '-' + Date.now().toString(36);
}

/* Fiche combattant liee a l'e-mail (creee depuis l'inscription si besoin). */
async function ensureFighter(supabase, email, reg, extra) {
  const { data: existing } = await supabase.from('trophyrec_fighters').select('*').eq('email', email).maybeSingle();
  const lic = licenceOf(reg);
  const patch = Object.assign({ updated_at: new Date().toISOString() }, extra || {});
  if (lic) {
    patch.licence_gate = lic.gate;
    patch.numero_licence = lic.numero;
  }
  if (existing) {
    const up = await supabase.from('trophyrec_fighters').update(patch).eq('id', existing.id).select('*').single();
    if (up.error) throw up.error;
    return up.data;
  }
  const prenom = (reg && reg.prenom) || (extra && extra.prenom) || '';
  const nom = (reg && reg.nom) || (extra && extra.nom) || '';
  const row = Object.assign({
    id: String((reg && reg.id) || 'f_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex')),
    slug: await uniqueSlug(supabase, prenom + '-' + nom),
    prenom: prenom,
    nom: nom,
    email: email,
    photo_url: (reg && reg.photoUrl) || null,
    gym_id: TR.gymIdFromText(reg && reg.club) || 'autre',
    gym_other: (reg && reg.club) || null,
    sexe: (reg && reg.sexe) || null,
    registration_id: (reg && reg.id) || null,
    account_status: 'actif',
    licence_status: 'a_verifier'
  }, patch);
  const ins = await supabase.from('trophyrec_fighters').insert([row]).select('*').single();
  if (ins.error) throw ins.error;
  return ins.data;
}

function mailShell(title, inner) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#0a0807;padding:28px 16px;color:#f6faf9">' +
    '<div style="max-width:520px;margin:0 auto;background:#17100e;border:1px solid #3a2a20;border-radius:18px;padding:28px">' +
    '<p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#ffc570">Boxing Trophy 20 · TrophyRec</p>' +
    '<h1 style="margin:0 0 18px;font-size:22px;color:#fff">' + title + '</h1>' + inner +
    '<p style="margin:26px 0 0;font-size:12px;color:#9a8f88">Boxing Center · Samedi 12 décembre 2026 · Garage Moteka, Fenouillet</p>' +
    '</div></div>';
}

function button(href, label) {
  return '<p style="margin:22px 0"><a href="' + esc(href) + '" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#e8ab36;color:#1a0f08;text-decoration:none;font-weight:bold">' + esc(label) + '</a></p>';
}

async function sendCredentials(email, password, prenom) {
  if (!isConfigured()) return { sent: false, reason: 'BREVO_API_KEY manquante' };
  const link = site() + '/connexion';
  const hello = prenom ? 'Salut ' + esc(prenom) + ',' : 'Salut,';
  const html = mailShell('Tes accès à ton espace combattant',
    '<p style="line-height:1.6;color:#e7dfd9">' + hello + '</p>' +
    '<p style="line-height:1.6;color:#e7dfd9">Ton inscription au Trophy 20 est enregistrée. Voici de quoi te connecter à ton espace : tu pourras y mettre ta photo, ton nom de ring, ta salle et ton coach.</p>' +
    '<table style="width:100%;margin:18px 0;border-collapse:collapse;font-size:15px">' +
    '<tr><td style="padding:10px 12px;border:1px solid #3a2a20;color:#9a8f88">Identifiant</td><td style="padding:10px 12px;border:1px solid #3a2a20;color:#fff"><b>' + esc(email) + '</b></td></tr>' +
    '<tr><td style="padding:10px 12px;border:1px solid #3a2a20;color:#9a8f88">Mot de passe</td><td style="padding:10px 12px;border:1px solid #3a2a20;color:#fff;font-family:monospace;font-size:17px"><b>' + esc(password) + '</b></td></tr></table>' +
    button(link, 'Ouvrir mon espace') +
    '<p style="line-height:1.6;color:#e7dfd9">Change ce mot de passe dès ta première connexion (rubrique « Mot de passe » de ton espace).</p>' +
    '<p style="line-height:1.6;color:#9a8f88;font-size:13px">Ton numéro de licence est vérifié par l\'organisation. Une licence fausse entraîne la fermeture du compte et la sortie du Trophy.</p>');
  const text = 'Tes accès TrophyRec\nIdentifiant : ' + email + '\nMot de passe : ' + password + '\nConnexion : ' + link + '\nChange ce mot de passe dès ta première connexion.';
  await sendEmailViaBrevo({ to: email, subject: 'Tes accès TrophyRec — Boxing Trophy 20', html: html, text: text });
  return { sent: true };
}

async function sendWelcome(email, prenom) {
  if (!isConfigured()) return { sent: false, reason: 'BREVO_API_KEY manquante' };
  const link = site() + '/connexion';
  const hello = prenom ? 'Salut ' + esc(prenom) + ',' : 'Salut,';
  await sendEmailViaBrevo({
    to: email,
    subject: 'Ton accès TrophyRec est prêt — Boxing Trophy 20',
    html: mailShell('Ton accès est prêt',
      '<p style="line-height:1.6;color:#e7dfd9">' + hello + '</p>' +
      '<p style="line-height:1.6;color:#e7dfd9">Ton accès TrophyRec est créé pour <b style="color:#fff">' + esc(email) + '</b>, avec le mot de passe que tu as choisi.</p>' +
      button(link, 'Ouvrir mon espace')),
    text: 'Ton accès TrophyRec est prêt : ' + link
  });
  return { sent: true };
}

async function sendClosed(email, prenom, reason) {
  if (!isConfigured()) return { sent: false };
  const hello = prenom ? 'Bonjour ' + esc(prenom) + ',' : 'Bonjour,';
  await sendEmailViaBrevo({
    to: email,
    subject: 'Ton compte TrophyRec est fermé — Boxing Trophy 20',
    html: mailShell('Compte fermé',
      '<p style="line-height:1.6;color:#e7dfd9">' + hello + '</p>' +
      '<p style="line-height:1.6;color:#e7dfd9">L\'organisation a fermé ton accès TrophyRec' + (reason ? ' : ' + esc(reason) : '.') + '</p>' +
      '<p style="line-height:1.6;color:#e7dfd9">Si c\'est une erreur, réponds simplement à ce mail.</p>'),
    text: 'Ton accès TrophyRec a été fermé' + (reason ? ' : ' + reason : '.')
  });
  return { sent: true };
}

/* Cree l'utilisateur Supabase et le relie a la fiche. */
async function createAccess(supabase, email, password, fighter) {
  const created = await supabase.auth.admin.createUser({ email: email, password: password, email_confirm: true });
  if (created.error) throw created.error;
  const user = created.data.user;
  const up = await supabase.from('trophyrec_fighters')
    .update({ user_id: user.id, account_status: 'actif', updated_at: new Date().toISOString() })
    .eq('id', fighter.id);
  if (up.error) throw up.error;
  return user;
}

/* ───────── Actions publiques ───────── */

async function actProvision(supabase, body) {
  const email = cleanEmail(body.email);
  if (!email.includes('@')) return [400, { error: 'E-mail invalide' }];
  const reg = await findRegistration(supabase, email);
  if (!reg || !licenceOf(reg)) return [403, { error: 'Aucune inscription avec licence ou cotisation pour cet e-mail.' }];
  const fighter = await ensureFighter(supabase, email, reg);
  if (fighter.account_status === 'ferme') return [403, { error: 'Compte fermé par l\'organisation.' }];
  if (fighter.user_id) return [200, { ok: true, status: 'exists' }];
  const existingUser = await findUserByEmail(supabase, email);
  if (existingUser) {
    await supabase.from('trophyrec_fighters').update({ user_id: existingUser.id }).eq('id', fighter.id);
    return [200, { ok: true, status: 'linked' }];
  }
  const password = tempPassword();
  await createAccess(supabase, email, password, fighter);
  let mail = { sent: false };
  try { mail = await sendCredentials(email, password, fighter.prenom); } catch (e) { mail = { sent: false, reason: e.message }; }
  return [200, { ok: true, status: 'created', mail: mail.sent }];
}

async function actForgot(supabase, body) {
  const email = cleanEmail(body.email);
  const done = [200, { ok: true }]; // meme reponse que le compte existe ou non
  if (!email.includes('@') || !isConfigured()) return done;
  const { data: f } = await supabase.from('trophyrec_fighters').select('prenom,account_status,user_id').eq('email', email).maybeSingle();
  if (!f || !f.user_id || f.account_status === 'ferme') return done;
  const link = await supabase.auth.admin.generateLink({ type: 'recovery', email: email, options: { redirectTo: site() + '/compte?motdepasse=1' } });
  if (link.error || !link.data || !link.data.properties) return done;
  const url = link.data.properties.action_link;
  await sendEmailViaBrevo({
    to: email,
    subject: 'Nouveau mot de passe TrophyRec',
    html: mailShell('Choisis un nouveau mot de passe',
      '<p style="line-height:1.6;color:#e7dfd9">' + (f.prenom ? 'Salut ' + esc(f.prenom) + ',' : 'Salut,') + '</p>' +
      '<p style="line-height:1.6;color:#e7dfd9">Clique sur le bouton : tu arrives connecté dans ton espace, rubrique « Mot de passe ». Le lien ne marche qu\'une fois.</p>' +
      button(url, 'Choisir mon mot de passe') +
      '<p style="line-height:1.6;color:#9a8f88;font-size:13px">Tu n\'as rien demandé ? Ignore ce mail, rien ne change.</p>'),
    text: 'Nouveau mot de passe TrophyRec : ' + url
  });
  return done;
}

/* ───────── Actions admin ───────── */

/* Invitation TrophyRec : accès (créé si besoin) + photo de profil + résultats après chaque combat */
async function sendWelcome(f, email, password) {
  const link = site() + '/connexion';
  const fiche = site() + '/boxeur/' + encodeURIComponent(f.slug || '');
  const classement = site() + '/classement';
  const hello = f.prenom ? 'Salut ' + esc(f.prenom) + ',' : 'Salut,';
  const p = function (t) { return '<p style="line-height:1.6;color:#e7dfd9">' + t + '</p>'; };
  const access = password
    ? '<table style="width:100%;margin:14px 0;border-collapse:collapse;font-size:15px">' +
      '<tr><td style="padding:10px 12px;border:1px solid #3a2a20;color:#9a8f88">Identifiant</td><td style="padding:10px 12px;border:1px solid #3a2a20;color:#fff"><b>' + esc(email) + '</b></td></tr>' +
      '<tr><td style="padding:10px 12px;border:1px solid #3a2a20;color:#9a8f88">Mot de passe provisoire</td><td style="padding:10px 12px;border:1px solid #3a2a20;color:#fff;font-family:monospace;font-size:17px"><b>' + esc(password) + '</b></td></tr></table>' +
      p('Change ce mot de passe dès ta première connexion, rubrique « Mot de passe » de ton espace.')
    : p('Ton identifiant, c\'est ton adresse e-mail : <b style="color:#fff">' + esc(email) + '</b>. Tu as oublié ton mot de passe ? Clique sur « Mot de passe oublié » sur la page de connexion, tu en recevras un nouveau.');
  const html = mailShell('Ta fiche TrophyRec est en ligne',
    p(hello) +
    p('Le Boxing Center a lancé <b style="color:#fff">TrophyRec</b>, le classement officiel du Boxing Trophy. Ta fiche combattant est en ligne, avec ton palmarès.') +
    p('<b style="color:#ffc570">Ajoute ta photo de profil</b> (de face, en tenue si possible) depuis ton espace combattant. Tu peux aussi y mettre ton nom de ring, ta salle et ton coach.') +
    access +
    button(link, 'Mettre ma photo') +
    p('Désormais, <b style="color:#fff">après chaque combat, tu retrouveras ton résultat dans TrophyRec</b> : ton bilan, ta place dans ta catégorie et le classement de ton club.') +
    p('Le classement : <a href="' + esc(classement) + '" style="color:#ffc570">' + esc(classement.replace('https://', '')) + '</a><br>Ta fiche : <a href="' + esc(fiche) + '" style="color:#ffc570">' + esc(fiche.replace('https://', '')) + '</a>'));
  const text = 'Ta fiche TrophyRec est en ligne.\nAjoute ta photo de profil depuis ton espace : ' + link +
    (password ? '\nIdentifiant : ' + email + '\nMot de passe provisoire : ' + password : '\nIdentifiant : ' + email + ' (mot de passe oublié ? lien sur la page de connexion)') +
    '\nAprès chaque combat, ton résultat sera dans TrophyRec : ' + classement + '\nTa fiche : ' + fiche;
  await sendEmailViaBrevo({ to: email, subject: 'Ta fiche TrophyRec est en ligne : ajoute ta photo', html: html, text: text });
}

async function actWelcome(supabase, body) {
  const f = await fighterById(supabase, body.id);
  if (!f) return [404, { error: 'Fiche introuvable' }];
  if (!f.email) return [200, { ok: true, status: 'skipped', reason: 'pas d\'e-mail' }];
  if (f.account_status === 'ferme') return [200, { ok: true, status: 'skipped', reason: 'compte fermé' }];
  if (!isConfigured()) return [500, { error: 'BREVO_API_KEY manquante sur Vercel : aucun mail ne peut partir' }];
  const email = cleanEmail(f.email);

  let user = null;
  if (f.user_id) {
    const r = await supabase.auth.admin.getUserById(f.user_id);
    user = r && r.data ? r.data.user : null;
  }
  if (!user) {
    user = await findUserByEmail(supabase, email);
    if (user) await supabase.from('trophyrec_fighters').update({ user_id: user.id }).eq('id', f.id);
  }
  const meta = (user && user.user_metadata) || {};
  if (meta.trophyrec_welcome_at && !body.force) return [200, { ok: true, status: 'already' }];

  let password = null;
  let created = false;
  if (!user) {
    password = tempPassword();
    user = await createAccess(supabase, email, password, f);
    created = true;
  } else if (!user.last_sign_in_at) {
    // Jamais connecte : il n'a peut-etre jamais recu (ou a perdu) son mot de passe provisoire
    password = tempPassword();
    const up = await supabase.auth.admin.updateUserById(user.id, { password: password });
    if (up.error) throw up.error;
  }
  try {
    await sendWelcome(f, email, password);
  } catch (e) {
    // Mail refuse : on renvoie le mot de passe pour le transmettre a la main, sans marquer l'invitation
    return [200, { ok: false, status: 'mail_failed', reason: e.message, password: password || undefined }];
  }
  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: Object.assign({}, meta, { trophyrec_welcome_at: new Date().toISOString() })
  });
  return [200, { ok: true, status: created ? 'created' : (password ? 'sent_new_password' : 'sent') }];
}

async function fighterById(supabase, id) {
  const { data, error } = await supabase.from('trophyrec_fighters').select('*').eq('id', String(id || '')).maybeSingle();
  if (error) throw error;
  return data;
}

async function actList(supabase) {
  const [f, b] = await Promise.all([
    supabase.from('trophyrec_fighters').select('*').order('created_at', { ascending: false }),
    supabase.from('trophyrec_bouts').select('fighter_a,fighter_b')
  ]);
  if (f.error) throw f.error;
  const users = {};
  for (let page = 1; page <= 20; page++) {
    const r = await supabase.auth.admin.listUsers({ page: page, perPage: 200 });
    if (r.error) break;
    const list = (r.data && r.data.users) || [];
    list.forEach(function (u) { users[u.id] = u; });
    if (list.length < 200) break;
  }
  const bouts = {};
  (b.data || []).forEach(function (x) {
    bouts[x.fighter_a] = (bouts[x.fighter_a] || 0) + 1;
    bouts[x.fighter_b] = (bouts[x.fighter_b] || 0) + 1;
  });
  const rows = (f.data || []).map(function (x) {
    const u = x.user_id ? users[x.user_id] : null;
    return Object.assign({}, x, {
      bouts: bouts[x.id] || 0,
      has_access: Boolean(u),
      last_sign_in_at: u ? u.last_sign_in_at : null,
      welcome_sent_at: u && u.user_metadata ? u.user_metadata.trophyrec_welcome_at || null : null,
      banned_until: u ? u.banned_until : null
    });
  });
  return [200, { ok: true, accounts: rows, brevo: isConfigured() }];
}

async function actCreate(supabase, body) {
  const email = cleanEmail(body.email);
  const prenom = String(body.prenom || '').trim();
  const nom = String(body.nom || '').trim();
  if (!email.includes('@')) return [400, { error: 'E-mail invalide' }];
  if (!prenom || !nom) return [400, { error: 'Prénom et nom obligatoires' }];
  if (await findUserByEmail(supabase, email)) return [409, { error: 'Un accès existe déjà avec cet e-mail' }];
  const reg = await findRegistration(supabase, email);
  const num = String(body.numero_licence || '').replace(/\D/g, '');
  const extra = { prenom: prenom, nom: nom, account_status: 'actif', licence_status: body.licence_status || 'verifiee' };
  if (num) { extra.licence_gate = 'existing'; extra.numero_licence = num; }
  const fighter = await ensureFighter(supabase, email, reg, extra);
  const password = String(body.password || '') || tempPassword();
  if (password.length < 6) return [400, { error: 'Mot de passe : 6 caractères minimum' }];
  await createAccess(supabase, email, password, fighter);
  let mail = { sent: false };
  if (body.send !== false) {
    try { mail = await sendCredentials(email, password, prenom); } catch (e) { mail = { sent: false, reason: e.message }; }
  }
  return [200, { ok: true, mail: mail.sent, password: mail.sent ? undefined : password }];
}

async function setBan(supabase, userId, banned) {
  if (!userId) return;
  const r = await supabase.auth.admin.updateUserById(userId, { ban_duration: banned ? BAN_FOREVER : 'none' });
  if (r.error) throw r.error;
}

async function actClose(supabase, body, reasonDefault) {
  const f = await fighterById(supabase, body.id);
  if (!f) return [404, { error: 'Fiche introuvable' }];
  const reason = String(body.reason || reasonDefault || '').trim() || null;
  await setBan(supabase, f.user_id, true);
  const patch = { account_status: 'ferme', closed_reason: reason, updated_at: new Date().toISOString() };
  if (body.refuse) patch.licence_status = 'refusee';
  const up = await supabase.from('trophyrec_fighters').update(patch).eq('id', f.id);
  if (up.error) throw up.error;
  if (body.notify && f.email) { try { await sendClosed(f.email, f.prenom, reason); } catch (e) { /* non bloquant */ } }
  return [200, { ok: true }];
}

async function actActivate(supabase, body) {
  const f = await fighterById(supabase, body.id);
  if (!f) return [404, { error: 'Fiche introuvable' }];
  await setBan(supabase, f.user_id, false);
  const patch = { account_status: 'actif', closed_reason: null, updated_at: new Date().toISOString() };
  if (f.licence_status === 'refusee') patch.licence_status = 'a_verifier';
  const up = await supabase.from('trophyrec_fighters').update(patch).eq('id', f.id);
  if (up.error) throw up.error;
  return [200, { ok: true }];
}

async function actVerify(supabase, body) {
  const f = await fighterById(supabase, body.id);
  if (!f) return [404, { error: 'Fiche introuvable' }];
  const up = await supabase.from('trophyrec_fighters').update({ licence_status: 'verifiee', updated_at: new Date().toISOString() }).eq('id', f.id);
  if (up.error) throw up.error;
  return [200, { ok: true }];
}

async function actResend(supabase, body) {
  const f = await fighterById(supabase, body.id);
  if (!f) return [404, { error: 'Fiche introuvable' }];
  if (!f.email) return [400, { error: 'Pas d\'e-mail sur cette fiche' }];
  if (f.account_status === 'ferme') return [400, { error: 'Compte fermé : réactive-le d\'abord' }];
  const password = tempPassword();
  if (f.user_id) {
    const r = await supabase.auth.admin.updateUserById(f.user_id, { password: password });
    if (r.error) throw r.error;
  } else {
    const existing = await findUserByEmail(supabase, cleanEmail(f.email));
    if (existing) {
      const r = await supabase.auth.admin.updateUserById(existing.id, { password: password });
      if (r.error) throw r.error;
      await supabase.from('trophyrec_fighters').update({ user_id: existing.id }).eq('id', f.id);
    } else {
      await createAccess(supabase, cleanEmail(f.email), password, f);
    }
  }
  let mail = { sent: false };
  try { mail = await sendCredentials(cleanEmail(f.email), password, f.prenom); } catch (e) { mail = { sent: false, reason: e.message }; }
  return [200, { ok: true, mail: mail.sent, password: mail.sent ? undefined : password }];
}

const GYM_IDS = ['minimes', 'etats-unis', 'st-cyprien', 'ramonville', 'portet', 'moteka', 'autre'];

/* Fiche publique modifiee par l'organisation (club, photo, surnom, tableau...). */
async function actUpdateProfile(supabase, body) {
  const f = await fighterById(supabase, body.id);
  if (!f) return [404, { error: 'Fiche introuvable' }];
  const str = function (v) { const t = String(v == null ? '' : v).trim(); return t || null; };
  const patch = { updated_at: new Date().toISOString() };
  if ('prenom' in body) patch.prenom = str(body.prenom) || f.prenom;
  if ('nom' in body) patch.nom = str(body.nom) || f.nom;
  if ('alias' in body) patch.alias = str(body.alias);
  if ('sexe' in body) patch.sexe = ['Homme', 'Femme'].indexOf(body.sexe) >= 0 ? body.sexe : null;
  if ('gym_id' in body) patch.gym_id = GYM_IDS.indexOf(body.gym_id) >= 0 ? body.gym_id : 'autre';
  if ('gym_other' in body) patch.gym_other = str(body.gym_other);
  if ('coach_id' in body) patch.coach_id = str(body.coach_id);
  if ('photo_url' in body) {
    const url = str(body.photo_url);
    if (url && !/^https:\/\//.test(url)) return [400, { error: 'La photo doit être un lien https://' }];
    patch.photo_url = url;
  }
  if ('stance' in body) patch.stance = ['orthodoxe', 'southpaw'].indexOf(body.stance) >= 0 ? body.stance : null;
  if ('height_cm' in body) {
    const h = body.height_cm ? Number(body.height_cm) : null;
    if (h !== null && (!(h >= 120) || !(h <= 230))) return [400, { error: 'Taille entre 120 et 230 cm' }];
    patch.height_cm = h;
  }
  if ('numero_licence' in body) {
    const n = String(body.numero_licence || '').replace(/\D/g, '');
    if (n && !LICENCE_RE.test(n)) return [400, { error: 'Numéro de licence : 6 ou 7 chiffres' }];
    patch.numero_licence = n || null;
    if (n) patch.licence_gate = 'existing';
  }
  const up = await supabase.from('trophyrec_fighters').update(patch).eq('id', f.id);
  if (up.error) throw up.error;
  return [200, { ok: true }];
}

async function actDelete(supabase, body) {
  const f = await fighterById(supabase, body.id);
  if (!f) return [404, { error: 'Fiche introuvable' }];
  if (f.user_id) {
    const r = await supabase.auth.admin.deleteUser(f.user_id);
    if (r.error && !/not found/i.test(r.error.message || '')) throw r.error;
  }
  const { count } = await supabase.from('trophyrec_bouts').select('id', { count: 'exact', head: true })
    .or('fighter_a.eq.' + f.id + ',fighter_b.eq.' + f.id);
  if (count) {
    // Des combats officiels existent : on garde le palmares, on retire l'acces et les donnees perso.
    const up = await supabase.from('trophyrec_fighters').update({
      user_id: null, email: null, numero_licence: null, account_status: 'ferme',
      closed_reason: 'Compte supprimé', updated_at: new Date().toISOString()
    }).eq('id', f.id);
    if (up.error) throw up.error;
    return [200, { ok: true, kept: true }];
  }
  const del = await supabase.from('trophyrec_fighters').delete().eq('id', f.id);
  if (del.error) throw del.error;
  return [200, { ok: true, kept: false }];
}

const PUBLIC = { provision: actProvision, forgot: actForgot };
const ADMIN = {
  admin_login: async function () { return [200, { ok: true }]; },
  list: actList,
  create: actCreate,
  verify_licence: actVerify,
  refuse_licence: function (sb, body) { return actClose(sb, Object.assign({}, body, { refuse: true }), 'Licence non valide'); },
  close: function (sb, body) { return actClose(sb, body); },
  activate: actActivate,
  resend: actResend,
  delete: actDelete,
  update_profile: actUpdateProfile,
  welcome: actWelcome
};

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const supabase = adminClient();
  if (!supabase || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { error: 'Supabase non configuré (SUPABASE_SERVICE_ROLE_KEY manquante)' });
  }

  try {
    const body = await readBody(req);
    const action = String(body.action || '');
    let fn = PUBLIC[action];
    if (!fn && ADMIN[action]) {
      if (!checkAdminPassword(req)) return json(res, 401, { error: 'Non autorisé' });
      fn = ADMIN[action];
    }
    if (!fn) return json(res, 400, { error: 'Action inconnue' });
    const out = await fn(supabase, body);
    return json(res, out[0], out[1]);
  } catch (e) {
    return json(res, 500, { error: e.message || 'Erreur compte' });
  }
};

module.exports.licenceOf = licenceOf;
module.exports.tempPassword = tempPassword;
