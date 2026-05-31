/**
 * API bot — inscriptions Supabase (manquants, filtres).
 * Auth : Authorization: Bearer SITE_API_SECRET
 */
const { createClient } = require('@supabase/supabase-js');

const SECRETS = {
  SITE_API_SECRET: 'bt18-api-secret-2026',
  SUPABASE_URL: 'https://cnlyzqcrlimwiojoffza.supabase.co',
  SUPABASE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNubHl6cWNybGltd2lvam9mZnphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODYyODcsImV4cCI6MjA5NTA2MjI4N30.JUO4zEfOJdEDmKBd8CmFSz2UmjKHqkqlhOhQNamSAgA',
  CONTACT_EMAIL: 'bc.combat31@gmail.com',
};

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || SECRETS.CONTACT_EMAIL;

function checkAuth(req) {
  const secret = process.env.SITE_API_SECRET || SECRETS.SITE_API_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || req.headers['x-api-secret'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim();
  return token === secret;
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

function getMissingFields(reg) {
  const missing = [];
  if (!str(reg.photoUrl)) missing.push({ key: 'photo', label: 'photo officielle' });
  if (!str(reg.email)) missing.push({ key: 'email', label: 'adresse e-mail' });
  if (!str(reg.telephone)) missing.push({ key: 'telephone', label: 'numéro de téléphone' });
  if (!str(reg.club)) missing.push({ key: 'club', label: 'club / salle' });
  if (!str(reg.dateNaissance)) missing.push({ key: 'dateNaissance', label: 'date de naissance' });
  if (String(reg.licencie || '').toLowerCase() === 'oui' && !str(reg.numeroLicence)) {
    missing.push({ key: 'numeroLicence', label: 'numéro de licence FFBB' });
  }
  if (!str(reg.categoriePoids)) missing.push({ key: 'categoriePoids', label: 'catégorie de poids' });
  return missing;
}

function buildMessage(reg, missing) {
  const prenom = str(reg.prenom) || 'boxeur/boxeuse';
  const nomComplet = (str(reg.prenom) + ' ' + str(reg.nom)).trim() || 'Inscription';
  const lines = missing.map((m) => '• ' + m.label).join('\n');
  let msg =
    '🥊 *Boxing Trophy 18*\n\n' +
    'Bonjour ' + prenom + ',\n\n' +
    'Votre inscription (*' + nomComplet + '*) est incomplète :\n' +
    lines +
    '\n\n';

  msg +=
    'Pour nous transmettre les informations manquantes, envoyez-les par e-mail à :\n' +
    '📧 *' +
    CONTACT_EMAIL +
    '*\n\n';

  if (missing.some((m) => m.key === 'photo')) {
    msg +=
      '📷 Pour la *photo*, joignez-la à votre e-mail en indiquant votre *nom et prénom* dans le message.\n\n';
  }

  msg += 'Merci ! — *Boxing Center St Cyprien*';
  return msg;
}

function normalizePhone(input) {
  if (!input) return '';
  let d = String(input).replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 10) d = '33' + d.slice(1);
  if (d.startsWith('212') && d.length >= 12) return d;
  if (d.startsWith('33') && d.length >= 11) return d;
  if (d.length === 9 && /^[67]/.test(d)) return '33' + d;
  return d;
}

function matchesFilter(reg, filters) {
  const { nom, prenom, query } = filters;
  if (query) {
    const q = query.toLowerCase();
    const n = str(reg.nom).toLowerCase();
    const p = str(reg.prenom).toLowerCase();
    return n.includes(q) || p.includes(q);
  }
  if (nom) {
    const n = str(reg.nom).toLowerCase();
    if (!n.includes(nom.toLowerCase())) return false;
  }
  if (prenom) {
    const p = str(reg.prenom).toLowerCase();
    if (!p.includes(prenom.toLowerCase())) return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!checkAuth(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const q = req.query || {};
  let action = q.action;
  let nom = q.nom || '';
  let prenom = q.prenom || '';
  let query = q.query || '';
  if (!action && req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      action = url.searchParams.get('action');
      nom = nom || url.searchParams.get('nom') || '';
      prenom = prenom || url.searchParams.get('prenom') || '';
      query = query || url.searchParams.get('query') || '';
    } catch {
      /* ignore */
    }
  }
  action = action || 'missing';
  nom = String(nom || '');
  prenom = String(prenom || '');
  query = String(query || '');

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || SECRETS.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    SECRETS.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'Supabase non configuré' });
    return;
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  if (action === 'list') {
    const { data, error } = await sb
      .from('registrations')
      .select('id, nom, prenom, telephone, email')
      .order('nom');
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ registrations: data || [] });
    return;
  }

  if (action === 'participants') {
    const { data, error } = await sb
      .from('registrations')
      .select('nom, prenom, club, categoriePoids, sexe, niveau')
      .order('nom', { ascending: true })
      .order('prenom', { ascending: true });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const participants = (data || [])
      .map((reg) => {
        const name = (str(reg.prenom) + ' ' + str(reg.nom)).trim() || '—';
        return {
          nom: str(reg.nom),
          prenom: str(reg.prenom),
          name,
          club: str(reg.club),
          categoriePoids: str(reg.categoriePoids),
          sexe: str(reg.sexe),
          niveau: str(reg.niveau),
        };
      })
      .sort((a, b) => {
        const cmp = a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
        return cmp !== 0 ? cmp : a.prenom.localeCompare(b.prenom, 'fr', { sensitivity: 'base' });
      });
    res.status(200).json({ total: participants.length, participants });
    return;
  }

  if (action === 'missing') {
    const { data, error } = await sb.from('registrations').select('*').order('nom');
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const recipients = [];
    (data || []).forEach((reg) => {
      if (!matchesFilter(reg, { nom, prenom, query })) return;
      const missing = getMissingFields(reg);
      if (!missing.length) return;
      const phone = normalizePhone(reg.telephone);
      recipients.push({
        id: reg.id,
        nom: reg.nom,
        prenom: reg.prenom,
        telephone: reg.telephone,
        phoneDigits: phone,
        missing,
        message: buildMessage(reg, missing),
        canSend: phone.length >= 11
      });
    });

    res.status(200).json({
      contactEmail: CONTACT_EMAIL,
      filter: { nom: nom || null, prenom: prenom || null, query: query || null },
      total: recipients.length,
      recipients
    });
    return;
  }

  res.status(400).json({ error: 'action invalide (missing | list | participants)' });
};
