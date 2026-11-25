const { adminClient } = require('../lib/supabase-admin');

function loc(host, path) {
  return 'https://' + host.replace(/^https?:\/\//, '').replace(/\/$/, '') + path;
}

module.exports = async function handler(req, res) {
  const host =
    process.env.SITE_URL ||
    'https://boxing-trophy-20.vercel.app';
  const origin = host.replace(/\/$/, '');
  const urls = [
    { path: '/', pri: '1.0', freq: 'daily' },
    { path: '/classement', pri: '0.9', freq: 'daily' },
    { path: '/connexion', pri: '0.5', freq: 'monthly' },
    { path: '/compte', pri: '0.4', freq: 'monthly' }
  ];

  try {
    const supabase = adminClient();
    if (supabase) {
      let { data, error } = await supabase.from('trophyrec_fighters').select('slug, updated_at').is('deleted_at', null);
      if (error) ({ data } = await supabase.from('trophyrec_fighters').select('slug, updated_at'));
      (data || []).forEach(function (f) {
        if (f.slug) urls.push({ path: '/boxeur/' + encodeURIComponent(f.slug), pri: '0.8', freq: 'weekly' });
      });
    }
  } catch (e) {
    /* sitemap partiel */
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];
  urls.forEach(function (u) {
    xml.push('<url>');
    xml.push('<loc>' + origin + u.path.replace(/&/g, '&amp;') + '</loc>');
    xml.push('<changefreq>' + u.freq + '</changefreq>');
    xml.push('<priority>' + u.pri + '</priority>');
    xml.push('</url>');
  });
  xml.push('</urlset>');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(xml.join(''));
};
