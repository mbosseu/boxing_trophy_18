/**
 * Génère env.js pour le navigateur (window.__ENV__).
 * Local : lit .env — Vercel : variables d'environnement du projet.
 * Usage : npm run build  |  npm run config
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const outPath = path.join(root, 'env.js');

const KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_UPLOAD_PRESET',
  'ADMIN_PASSWORD',
  'WHATSAPP_BOT_URL',
  'SITE_URL',
  'CONTACT_EMAIL',
];

function parseEnvFile(content) {
  const out = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  });
  return out;
}

function cloudNameFromUrl(url) {
  if (!url) return '';
  const m = String(url).match(/@([^/?#]+)/);
  return m ? m[1] : '';
}

function loadEnv() {
  const fromFile = fs.existsSync(envPath)
    ? parseEnvFile(fs.readFileSync(envPath, 'utf8'))
    : {};

  const env = {};
  KEYS.forEach((k) => {
    env[k] = (fromFile[k] || process.env[k] || '').trim();
  });

  if (!env.CLOUDINARY_CLOUD_NAME) {
    env.CLOUDINARY_CLOUD_NAME = cloudNameFromUrl(
      fromFile.CLOUDINARY_URL || process.env.CLOUDINARY_URL || ''
    );
  }

  return env;
}

const env = loadEnv();
const hasAny = KEYS.some((k) => env[k]);

if (!hasAny) {
  console.warn(
    'Aucune variable trouvée (.env ou variables Vercel). env.js sera vide — configurez SUPABASE_URL, etc.'
  );
}

const js =
  '/* Généré par npm run build — ne pas modifier à la main */\n' +
  'window.__ENV__ = ' +
  JSON.stringify(env, null, 2) +
  ';\n';

fs.writeFileSync(outPath, js, 'utf8');
console.log('✓ env.js généré (' + outPath + ')');
