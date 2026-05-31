// supabase-config.js — charge env.js (window.__ENV__) avant ce script

function envGet(key) {
  if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) {
    return String(window.__ENV__[key]).trim();
  }
  return '';
}

function getSupabaseConfig() {
  const localUrl = localStorage.getItem('supabase_url');
  const localKey = localStorage.getItem('supabase_anon_key');

  const url = (localUrl && localUrl !== 'null' && localUrl !== 'undefined')
    ? localUrl
    : envGet('SUPABASE_URL');
  const key = (localKey && localKey !== 'null' && localKey !== 'undefined')
    ? localKey
    : envGet('SUPABASE_ANON_KEY');

  const isValid =
    url &&
    url !== 'YOUR_SUPABASE_URL' &&
    url.trim() !== '' &&
    key &&
    key !== 'YOUR_SUPABASE_ANON_KEY' &&
    key.trim() !== '';

  return { url, key, isValid };
}

let supabaseClient = null;
const supabaseConfig = getSupabaseConfig();

if (supabaseConfig.isValid && typeof window.supabase !== 'undefined') {
  try {
    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.key);
  } catch (err) {
    console.error("Échec de l'initialisation du client Supabase :", err);
  }
}

function reinitSupabaseClient(url, key) {
  if (url && key && typeof window.supabase !== 'undefined') {
    try {
      supabaseClient = window.supabase.createClient(url, key);
      localStorage.setItem('supabase_url', url);
      localStorage.setItem('supabase_anon_key', key);
      return true;
    } catch (err) {
      console.error('Erreur lors de la mise à jour du client Supabase :', err);
      return false;
    }
  }
  return false;
}

function getAdminPasswordFromEnv() {
  return envGet('ADMIN_PASSWORD');
}
