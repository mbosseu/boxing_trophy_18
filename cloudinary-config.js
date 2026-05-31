/* Configuration Cloudinary — priorité : .env → admin localStorage */
(function (global) {
    'use strict';

    var CLOUD_KEY = 'bt18_cloudinary_cloud';
    var PRESET_KEY = 'bt18_cloudinary_preset';

    function envGet(key) {
        if (typeof global !== 'undefined' && global.__ENV__ && global.__ENV__[key]) {
            return String(global.__ENV__[key]).trim();
        }
        return '';
    }

    function getCloudinaryConfig() {
        var cloudName =
            (localStorage.getItem(CLOUD_KEY) || '').trim() || envGet('CLOUDINARY_CLOUD_NAME');
        var uploadPreset =
            (localStorage.getItem(PRESET_KEY) || '').trim() || envGet('CLOUDINARY_UPLOAD_PRESET');
        return {
            cloudName: cloudName,
            uploadPreset: uploadPreset,
            isConfigured: function () {
                return !!(cloudName && uploadPreset);
            }
        };
    }

    function saveCloudinaryConfig(cloudName, uploadPreset) {
        localStorage.setItem(CLOUD_KEY, (cloudName || '').trim());
        localStorage.setItem(PRESET_KEY, (uploadPreset || '').trim());
    }

    function clearCloudinaryConfig() {
        localStorage.removeItem(CLOUD_KEY);
        localStorage.removeItem(PRESET_KEY);
    }

    function parseUploadResponse(res) {
        return res.json().then(function (data) {
            if (!res.ok) {
                var msg = (data && data.error && data.error.message) || 'Échec envoi Cloudinary';
                throw new Error(msg);
            }
            if (!data.secure_url) throw new Error('URL manquante dans la réponse Cloudinary');
            return data.secure_url;
        });
    }

    function uploadUnsigned(file, conf) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', conf.uploadPreset);
        return fetch('https://api.cloudinary.com/v1_1/' + conf.cloudName + '/image/upload', {
            method: 'POST',
            body: fd
        }).then(parseUploadResponse);
    }

    function uploadSigned(file, conf, adminPassword) {
        return fetch('/api/cloudinary/sign', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': adminPassword
            },
            body: JSON.stringify({ upload_preset: conf.uploadPreset })
        })
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) {
                        throw new Error(
                            (data && data.error) ||
                                'Signature serveur impossible (Vercel + CLOUDINARY_URL requis)'
                        );
                    }
                    return data;
                });
            })
            .then(function (sign) {
                var fd = new FormData();
                fd.append('file', file);
                fd.append('upload_preset', sign.upload_preset);
                fd.append('api_key', sign.api_key);
                fd.append('timestamp', String(sign.timestamp));
                fd.append('signature', sign.signature);
                return fetch(
                    'https://api.cloudinary.com/v1_1/' + sign.cloud_name + '/image/upload',
                    { method: 'POST', body: fd }
                ).then(parseUploadResponse);
            });
    }

    function isUnsignedPresetError(err) {
        var m = (err && err.message) || '';
        return (
            /unsigned/i.test(m) ||
            /whitelisted/i.test(m) ||
            /Invalid signature/i.test(m) ||
            /upload preset/i.test(m)
        );
    }

  /**
   * @param {File} file
   * @param {{ adminPassword?: string }} [options] — admin : upload signé via /api/cloudinary/sign
   */
    function uploadFile(file, options) {
        options = options || {};
        var conf = getCloudinaryConfig();
        if (!conf.isConfigured()) {
            return Promise.reject(new Error('Cloudinary non configuré (cloud + preset)'));
        }
        if (!file) {
            return Promise.reject(new Error('Aucun fichier sélectionné'));
        }

        var trySigned = function (unsignedErr) {
            if (!options.adminPassword) {
                var hint =
                    'Le preset « ' +
                    conf.uploadPreset +
                    ' » doit être NON SIGNÉ sur Cloudinary, ou connectez-vous à l’admin pour un envoi signé.';
                throw new Error((unsignedErr && unsignedErr.message) || hint);
            }
            return uploadSigned(file, conf, options.adminPassword).catch(function (signedErr) {
                throw new Error(
                    (signedErr && signedErr.message) ||
                        'Upload signé échoué — ajoutez CLOUDINARY_URL sur Vercel (Dashboard → Settings → Environment Variables).'
                );
            });
        };

        return uploadUnsigned(file, conf).catch(function (err) {
            if (options.adminPassword || isUnsignedPresetError(err)) {
                return trySigned(err);
            }
            throw err;
        });
    }

    function pickFighterPhoto(onUrl, fileInput) {
        var conf = getCloudinaryConfig();
        if (conf.isConfigured() && global.cloudinary && global.cloudinary.createUploadWidget) {
            var widget = global.cloudinary.createUploadWidget(
                {
                    cloudName: conf.cloudName,
                    uploadPreset: conf.uploadPreset,
                    sources: ['local', 'camera'],
                    multiple: false,
                    maxFiles: 1
                },
                function (err, result) {
                    if (!err && result && result.event === 'success' && result.info) {
                        onUrl(result.info.secure_url);
                    }
                }
            );
            widget.open();
            return;
        }
        if (fileInput) {
            fileInput.click();
        }
    }

    global.BT18Cloudinary = {
        getCloudinaryConfig: getCloudinaryConfig,
        saveCloudinaryConfig: saveCloudinaryConfig,
        clearCloudinaryConfig: clearCloudinaryConfig,
        uploadFile: uploadFile,
        pickFighterPhoto: pickFighterPhoto
    };
})(typeof window !== 'undefined' ? window : global);
