/* Charge env.js (généré par npm run config) sans bloquer si le fichier est absent */
(function () {
    'use strict';
    window.__ENV__ = window.__ENV__ || {};
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'env.js', false);
        xhr.send(null);
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
            // eslint-disable-next-line no-new-func
            new Function(xhr.responseText)();
        }
    } catch (e) {
        console.warn('env.js introuvable — copiez .env.example vers .env puis lancez : npm run config');
    }

    var siteUrl = (window.__ENV__ && window.__ENV__.SITE_URL) ? String(window.__ENV__.SITE_URL).trim().replace(/\/$/, '') : '';
    if (!siteUrl && window.location && /^https?:/.test(window.location.origin)) {
        siteUrl = window.location.origin;
    }
    if (!siteUrl) return;

    window.__ENV__.SITE_URL = siteUrl;
    var canonical = siteUrl + (window.location.pathname === '/' ? '/' : window.location.pathname);
    var link = document.querySelector('link[rel="canonical"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
    }
    link.href = canonical;

    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
        ogUrl = document.createElement('meta');
        ogUrl.setAttribute('property', 'og:url');
        document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', canonical);
})();
