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
})();
