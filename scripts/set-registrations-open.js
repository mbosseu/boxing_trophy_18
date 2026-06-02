/**
 * Met à jour registrations_open dans Supabase.
 * Usage : node scripts/set-registrations-open.js false
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

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

const openArg = process.argv[2];
if (openArg !== 'true' && openArg !== 'false') {
  console.error('Usage: node scripts/set-registrations-open.js true|false');
  process.exit(1);
}

const fromFile = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, 'utf8')) : {};
const url = (fromFile.SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const key = (fromFile.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

if (!url || !key) {
  console.error('SUPABASE_URL et SUPABASE_ANON_KEY requis (.env ou env).');
  process.exit(1);
}

const open = openArg === 'true';
const ts = open ? '' : new Date().toISOString();
const sb = createClient(url, key);

(async () => {
  const rows = [
    { key: 'registrations_open', value: open ? 'true' : 'false' },
    { key: 'registrations_closed_at', value: ts },
  ];
  const { error } = await sb.from('match_metadata').upsert(rows);
  if (error) {
    console.error('Erreur Supabase:', error.message);
    process.exit(1);
  }
  console.log(open ? 'Inscriptions ouvertes.' : 'Inscriptions fermées (' + ts + ').');
})();
