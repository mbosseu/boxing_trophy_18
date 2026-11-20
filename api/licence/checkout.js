/**
 * Paiement de la licence loisirs Trophy (50 EUR) — encaissé par Noble Art Portésien.
 *
 * Utilise les API existantes de la boutique Boxing Center, sans la modifier :
 *   1. POST /api/orders/draft       → dossier « licence-loisirs-trophy », salle Portet
 *   2. POST /api/orders/:id/pay     → moyen de paiement PayPal
 * La boutique encaisse alors sur le compte PayPal de Portet (Noble Art Portésien).
 * Le visiteur ne passe pas par la page de paiement de la boutique : aucune carte
 * Boxing Center (PayPlug) ni CAWL ne peut être choisie. PayPal accepte la carte bancaire
 * sans compte PayPal (page « carte » ouverte d'office).
 *
 * Appel côté serveur : les API de la boutique n'acceptent pas les appels d'un autre site.
 */
const BOUTIQUE_URL = String(process.env.BOUTIQUE_URL || 'https://boutique.boxingcenter.fr').replace(/\/$/, '');
const PRODUCT_ID = 'licence-loisirs-trophy';
const GYM = 'portet'; // salle Portet = compte PayPal Noble Art Portésien côté boutique
const ADULT_MIN_AGE = 18;
const TIMEOUT_MS = 20000;

function clean(v, max = 80) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s.\-()]/g, '');
  if (p.startsWith('+33')) p = '0' + p.slice(3);
  else if (p.startsWith('0033')) p = '0' + p.slice(4);
  return p;
}

function ageFrom(birthdate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const birth = new Date(y, mo - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== mo - 1 || birth.getDate() !== d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() < mo - 1 || (now.getMonth() === mo - 1 && now.getDate() < d)) age -= 1;
  return age;
}

function validate(body) {
  const data = {
    first_name: clean(body.first_name, 60),
    last_name: clean(body.last_name, 60),
    email: clean(body.email, 120).toLowerCase(),
    phone: normalizePhone(body.phone),
    birthdate: clean(body.birthdate, 10),
  };
  const errors = [];
  if (!data.first_name) errors.push('Prénom requis');
  if (!data.last_name) errors.push('Nom requis');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errors.push('Adresse e-mail invalide');
  if (!/^0[67]\d{8}$/.test(data.phone)) errors.push('Téléphone mobile français requis (06 ou 07)');
  const age = ageFrom(data.birthdate);
  if (age == null) errors.push('Date de naissance invalide');
  else if (age < ADULT_MIN_AGE) errors.push('La licence loisirs est réservée aux majeurs (18 ans et plus)');
  return { data, errors };
}

async function boutique(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BOUTIQUE_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function shopMessage(json, fallback) {
  if (Array.isArray(json && json.errors) && json.errors.length) return json.errors.join(' · ');
  return (json && (json.message || json.error)) || fallback;
}

function isPaypalUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'paypal.com' || u.hostname.endsWith('.paypal.com'));
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { data, errors } = validate(body || {});
  if (errors.length) return res.status(400).json({ ok: false, errors });

  try {
    // 1. Dossier licence, salle Portet
    const draft = await boutique('/api/orders/draft', { product_id: PRODUCT_ID, gym: GYM, ...data });
    if (!draft.json.ok || !draft.json.order_id || !draft.json.access_token) {
      return res.status(draft.status >= 400 && draft.status < 500 ? 400 : 502).json({
        ok: false,
        error: shopMessage(draft.json, 'Impossible de créer le dossier de licence. Réessayez dans un instant.'),
      });
    }

    // 2. Paiement PayPal (compte Portet = Noble Art Portésien), page carte bancaire ouverte d'office
    const pay = await boutique(`/api/orders/${encodeURIComponent(draft.json.order_id)}/pay`, {
      token: draft.json.access_token,
      pay_method: 'paypal',
      payment_plan: 'once',
      gym: GYM,
      paypal_landing: 'billing',
    });

    // Garde-fou : on ne renvoie le visiteur que vers PayPal. Tout autre moyen est refusé.
    if (pay.json.ok && pay.json.mode === 'paypal' && isPaypalUrl(pay.json.url)) {
      return res.status(200).json({ ok: true, url: pay.json.url });
    }
    if (pay.json.mode === 'already_paid') {
      return res.status(409).json({ ok: false, error: 'Cette licence est déjà payée.' });
    }
    return res.status(502).json({
      ok: false,
      error: shopMessage(pay.json, 'Le paiement PayPal est momentanément indisponible. Réessayez dans un instant.'),
    });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: 'La boutique ne répond pas. Réessayez dans un instant.',
    });
  }
};
