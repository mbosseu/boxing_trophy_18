(function () {
  'use strict';

  function msg(el, text, ok) {
    if (!el) return;
    el.hidden = false;
    el.className = ok ? 'tr-ok' : 'tr-error';
    el.textContent = text;
  }

  function client() {
    return typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  }

  async function sessionUser() {
    var sb = client();
    if (!sb) return null;
    var s = await sb.auth.getSession();
    return s.data && s.data.session ? s.data.session : null;
  }

  function fillGyms(sel, value) {
    sel.innerHTML = TrophyRec.GYMS.map(function (g) {
      return '<option value="' + g.id + '"' + (g.id === value ? ' selected' : '') + '>' + g.label + '</option>';
    }).join('');
  }

  function fillStances(sel, value) {
    sel.innerHTML = '<option value="">—</option>' + TrophyRec.STANCES.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === value ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');
  }

  function fillCoaches(sel, coaches, gymId, current) {
    var list = (coaches || []).filter(function (c) {
      if (c.active === false) return false;
      if (!gymId) return true;
      return c.gym_id === gymId || c.gym_id === 'autre';
    });
    sel.innerHTML = '<option value="">Choisir un coach</option>' + list.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === current ? ' selected' : '') + '>' +
        String(c.name).replace(/</g, '') + '</option>';
    }).join('');
  }

  async function initLogin() {
    var form = document.getElementById('loginForm');
    if (!form) return;
    var sess = await sessionUser();
    if (sess) {
      location.replace('/compte');
      return;
    }
    var err = document.getElementById('authMsg');
    var mode = 'login';
    var submitBtn = document.getElementById('loginBtn');
    var pass = document.getElementById('password');
    var hint = document.getElementById('authHint');
    var tabLogin = document.getElementById('tabLogin');
    var tabSignup = document.getElementById('tabSignup');

    function setMode(m) {
      mode = m;
      if (tabLogin) { tabLogin.classList.toggle('is-on', m === 'login'); tabLogin.setAttribute('aria-selected', m === 'login'); }
      if (tabSignup) { tabSignup.classList.toggle('is-on', m === 'signup'); tabSignup.setAttribute('aria-selected', m === 'signup'); }
      if (submitBtn) submitBtn.textContent = m === 'login' ? 'Se connecter' : 'Créer mon accès';
      pass.setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
      if (hint) hint.textContent = m === 'login'
        ? 'Pas encore d\'accès ? Passe sur « Créer mon accès ».'
        : 'Utilise l\'e-mail de ton inscription au Trophy : ta fiche sera reliée toute seule.';
      err.hidden = true;
    }
    if (tabLogin) tabLogin.addEventListener('click', function () { setMode('login'); });
    if (tabSignup) tabSignup.addEventListener('click', function () { setMode('signup'); });
    var toggle = document.getElementById('togglePass');
    if (toggle) toggle.addEventListener('click', function () {
      var show = pass.type === 'password';
      pass.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Cacher' : 'Voir';
      toggle.setAttribute('aria-label', show ? 'Cacher le mot de passe' : 'Afficher le mot de passe');
    });

    function frError(e) {
      var m = String((e && e.message) || '');
      if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
      if (/banned/i.test(m)) return 'Ton compte a été fermé par l\'organisation. Pour toute question : boxingcenter31@gmail.com.';
      if (/email not confirmed/i.test(m)) return 'Reconnecte-toi : le mail de confirmation passe par Brevo, pas par un lien Supabase.';
      if (/already registered|already exists/i.test(m)) return 'Un accès existe déjà avec cet e-mail. Connecte-toi plutôt.';
      if (/rate limit|too many/i.test(m)) return 'Trop d\'essais d\'un coup. Attends une minute et réessaie.';
      if (/password/i.test(m)) return 'Mot de passe trop court : 6 caractères minimum.';
      return m || 'Ça n\'a pas marché, réessaie.';
    }

    async function doLogin(email, password) {
      var sb = client();
      if (!sb) return msg(err, 'Connexion indisponible pour le moment.');
      var r = await sb.auth.signInWithPassword({ email: email, password: password });
      if (r.error) return msg(err, frError(r.error));
      location.replace('/compte');
    }

    async function doSignup(email, password) {
      var sb = client();
      if (!sb) return msg(err, 'Inscription indisponible pour le moment.');
      var created = await fetch('/api/trophyrec/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signup', email: email, password: password })
      });
      var body = await created.json().catch(function () { return {}; });
      if (!created.ok) return msg(err, body.error || 'Inscription impossible.');
      var r = await sb.auth.signInWithPassword({ email: email, password: password });
      if (r.error) return msg(err, 'Accès créé, e-mail envoyé. Connecte-toi.', true);
      location.replace('/compte');
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = document.getElementById('email').value.trim();
      var password = pass.value;
      if (!/^\S+@\S+\.\S+$/.test(email)) return msg(err, 'Entre une adresse e-mail valide.');
      if (password.length < 6) return msg(err, 'Mot de passe : 6 caractères minimum.');
      if (submitBtn) submitBtn.disabled = true;
      try {
        if (mode === 'signup') await doSignup(email, password);
        else await doLogin(email, password);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
    var signupBtn = document.getElementById('signupBtn');
    if (signupBtn) signupBtn.addEventListener('click', function () { setMode('signup'); });

    var forgot = document.getElementById('forgotBtn');
    if (forgot) forgot.addEventListener('click', async function () {
      var email = document.getElementById('email').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return msg(err, 'Écris d\'abord ton e-mail dans le champ, puis clique sur « Mot de passe oublié ».');
      forgot.disabled = true;
      try {
        await fetch('/api/trophyrec/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'forgot', email: email })
        });
      } catch (e) { /* meme message dans tous les cas */ }
      forgot.disabled = false;
      msg(err, 'Si un accès existe pour cet e-mail, un lien pour choisir un nouveau mot de passe vient de partir. Regarde aussi dans les spams.', true);
    });
  }

  async function initCompte() {
    var form = document.getElementById('profileForm');
    if (!form) return;
    var status = document.getElementById('trStatus');
    var sb = client();
    var sess = await sessionUser();
    if (!sess) {
      location.replace('/connexion');
      return;
    }
    var coachesRes = await sb.from('trophyrec_coaches').select('id,name,gym_id,active');
    var coaches = coachesRes.data || [];

    async function claim() {
      var r = await fetch('/api/trophyrec/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + sess.access_token
        },
        body: JSON.stringify({
          prenom: (document.getElementById('prenom') || {}).value || '',
          nom: (document.getElementById('nom') || {}).value || ''
        })
      });
      return r.json();
    }

    var claimed = await claim();
    var COLS = 'id,slug,prenom,nom,alias,photo_url,height_cm,stance,gym_id,gym_other,coach_id,sexe,user_id';
    var COLS_STATUS = COLS + ',account_status,licence_status,licence_gate';
    async function loadFighter() {
      var q = await sb.from('trophyrec_fighters').select(COLS_STATUS).eq('user_id', sess.user.id).maybeSingle();
      if (q.error) q = await sb.from('trophyrec_fighters').select(COLS).eq('user_id', sess.user.id).maybeSingle();
      return q;
    }
    var fighterQ = await loadFighter();
    var fighter = fighterQ.data;
    if (fighter && fighter.account_status === 'ferme') {
      await sb.auth.signOut();
      status.textContent = 'Ton compte a été fermé par l\'organisation. Pour toute question : boxingcenter31@gmail.com.';
      return;
    }
    var licEl = document.getElementById('accLicence');
    if (licEl && fighter && fighter.licence_status) {
      var lic = {
        a_verifier: ['Licence en cours de vérification', ''],
        verifiee: ['Licence vérifiée', 'ok'],
        refusee: ['Licence refusée', 'ko']
      }[fighter.licence_status];
      if (lic) {
        licEl.textContent = (fighter.licence_gate === 'paid_50' ? 'Cotisation 50 € · ' : '') + lic[0];
        licEl.className = 'tr-licence ' + lic[1];
        licEl.hidden = false;
      }
    }
    if (!fighter) {
      status.textContent = (claimed && claimed.message) || 'Indique ton prénom et ton nom, enregistre, puis recharge la page.';
      form.hidden = false;
    } else {
      status.hidden = true;
      form.hidden = false;
    }

    fillGyms(document.getElementById('gym_id'), fighter && fighter.gym_id);
    fillStances(document.getElementById('stance'), fighter && fighter.stance);
    fillCoaches(document.getElementById('coach_id'), coaches, fighter && fighter.gym_id, fighter && fighter.coach_id);

    function applyFighter(f) {
      if (!f) return;
      document.getElementById('prenom').value = f.prenom || '';
      document.getElementById('nom').value = f.nom || '';
      document.getElementById('alias').value = f.alias || '';
      document.getElementById('height_cm').value = f.height_cm || '';
      document.getElementById('photo_url').value = f.photo_url || '';
      document.getElementById('gym_other').value = f.gym_other || '';
      document.getElementById('publicLink').href = '/boxeur/' + encodeURIComponent(f.slug);
    }
    applyFighter(fighter);

    // En-tête : nom et avatar suivent la saisie
    function refreshHead() {
      var alias = document.getElementById('alias').value.trim();
      var prenom = document.getElementById('prenom').value.trim();
      var nom = document.getElementById('nom').value.trim();
      var title = alias || (prenom + ' ' + nom).trim() || 'Mon profil';
      var nameEl = document.getElementById('accName');
      if (nameEl) nameEl.textContent = title;
      var av = document.getElementById('accAvatar');
      if (!av) return;
      var url = document.getElementById('photo_url').value.trim();
      if (/^https?:\/\//.test(url)) {
        av.textContent = '';
        av.style.backgroundImage = 'url("' + url.replace(/["\\]/g, '') + '")';
        av.style.backgroundSize = 'cover';
        av.style.backgroundPosition = 'center';
      } else {
        av.style.backgroundImage = '';
        var p = title.split(/\s+/);
        av.textContent = (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || 'BC';
      }
    }
    ['alias', 'prenom', 'nom', 'photo_url'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', refreshHead);
    });
    refreshHead();

    document.getElementById('gym_id').addEventListener('change', function () {
      fillCoaches(document.getElementById('coach_id'), coaches, document.getElementById('gym_id').value, document.getElementById('coach_id').value);
    });

    var photoFile = document.getElementById('photoFile');
    if (photoFile) {
      photoFile.addEventListener('change', async function () {
        var file = photoFile.files && photoFile.files[0];
        if (!file || typeof BT18Cloudinary === 'undefined') return;
        try {
          var url = await BT18Cloudinary.uploadFile(file);
          document.getElementById('photo_url').value = url;
          refreshHead();
        } catch (e) {
          msg(document.getElementById('saveMsg'), e.message || 'Envoi de la photo impossible.');
        }
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var saveMsg = document.getElementById('saveMsg');
      if (!fighter) {
        claimed = await claim();
        fighterQ = await loadFighter();
        fighter = fighterQ.data;
        if (!fighter) return msg(saveMsg, (claimed && claimed.error) || "Ta fiche n'est pas encore reliée. Inscris-toi au Trophy avec le même e-mail, ou demande à l'organisation.");
      }
      var payload = {
        prenom: document.getElementById('prenom').value.trim(),
        nom: document.getElementById('nom').value.trim(),
        alias: document.getElementById('alias').value.trim() || null,
        height_cm: document.getElementById('height_cm').value ? Number(document.getElementById('height_cm').value) : null,
        stance: document.getElementById('stance').value || null,
        gym_id: document.getElementById('gym_id').value || null,
        gym_other: document.getElementById('gym_other').value.trim() || null,
        coach_id: document.getElementById('coach_id').value || null,
        photo_url: document.getElementById('photo_url').value.trim() || null,
        updated_at: new Date().toISOString()
      };
      var up = await sb.from('trophyrec_fighters').update(payload).eq('id', fighter.id).eq('user_id', sess.user.id);
      if (up.error) return msg(saveMsg, up.error.message);
      msg(saveMsg, 'Profil enregistré.', true);
    });

    // Changement de mot de passe
    var pwForm = document.getElementById('passwordForm');
    if (pwForm) {
      pwForm.hidden = false;
      if (/[?&]motdepasse=1/.test(location.search)) {
        var pwMsg0 = document.getElementById('pwMsg');
        msg(pwMsg0, 'Tu es connecté. Choisis ton nouveau mot de passe ci-dessous.', true);
        setTimeout(function () { pwForm.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.getElementById('newPassword').focus(); }, 300);
      }
      pwForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var pwMsg = document.getElementById('pwMsg');
        var p1 = document.getElementById('newPassword').value;
        var p2 = document.getElementById('newPassword2').value;
        if (p1.length < 8) return msg(pwMsg, 'Prends au moins 8 caractères.');
        if (p1 !== p2) return msg(pwMsg, 'Les deux mots de passe ne sont pas identiques.');
        var r = await sb.auth.updateUser({ password: p1 });
        if (r.error) {
          var m = String(r.error.message || '');
          if (/different from the old|same/i.test(m)) return msg(pwMsg, 'C\'est déjà ton mot de passe actuel. Choisis-en un autre.');
          if (/reauthentication|recent/i.test(m)) return msg(pwMsg, 'Par sécurité, déconnecte-toi puis reconnecte-toi avant de changer ton mot de passe.');
          return msg(pwMsg, m || 'Changement impossible pour le moment.');
        }
        pwForm.reset();
        if (/[?&]motdepasse=1/.test(location.search)) history.replaceState(null, '', '/compte');
        msg(pwMsg, 'Mot de passe changé. Utilise-le à ta prochaine connexion.', true);
      });
    }

    document.getElementById('logoutBtn').addEventListener('click', async function () {
      await sb.auth.signOut();
      location.replace('/connexion');
    });

    document.getElementById('deleteBtn').addEventListener('click', async function () {
      if (!confirm('Supprimer ton compte TrophyRec ? Tes combats restent dans le classement.')) return;
      var r = await fetch('/api/trophyrec/delete-account', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + sess.access_token }
      });
      var body = await r.json().catch(function () { return {}; });
      if (!r.ok) return msg(document.getElementById('saveMsg'), body.error || 'Suppression impossible pour le moment.');
      await sb.auth.signOut();
      location.replace('/');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('loginForm')) initLogin();
    if (document.getElementById('profileForm')) initCompte();
  });
})();
