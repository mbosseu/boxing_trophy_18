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
    sel.innerHTML = '<option value="">— Choisir un coach —</option>' + list.map(function (c) {
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
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var sb = client();
      if (!sb) return msg(err, 'Connexion indisponible.');
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      var r = await sb.auth.signInWithPassword({ email: email, password: password });
      if (r.error) return msg(err, r.error.message);
      location.replace('/compte');
    });
    document.getElementById('signupBtn').addEventListener('click', async function () {
      var sb = client();
      if (!sb) return msg(err, 'Inscription indisponible.');
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      if (password.length < 6) return msg(err, 'Mot de passe : 6 caracteres minimum.');
      var r = await sb.auth.signUp({ email: email, password: password });
      if (r.error) return msg(err, r.error.message);
      if (r.data.session) location.replace('/compte');
      else msg(err, 'Compte cree. Confirmez l e-mail si demande, puis reconnectez-vous.', true);
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
    var fighterQ = await sb.from('trophyrec_fighters').select('*').eq('user_id', sess.user.id).maybeSingle();
    var fighter = fighterQ.data;
    if (!fighter) {
      status.textContent = (claimed && claimed.message) || 'Indiquez nom et prenom, enregistrez, puis rechargez.';
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
        } catch (e) {
          msg(document.getElementById('saveMsg'), e.message || 'Upload photo impossible');
        }
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var saveMsg = document.getElementById('saveMsg');
      if (!fighter) {
        claimed = await claim();
        fighterQ = await sb.from('trophyrec_fighters').select('*').eq('user_id', sess.user.id).maybeSingle();
        fighter = fighterQ.data;
        if (!fighter) return msg(saveMsg, (claimed && claimed.error) || 'Fiche pas encore liee. Inscrivez-vous d abord au Trophy avec le meme e-mail, ou demandez a l organisation.');
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
      msg(saveMsg, 'Profil enregistre.', true);
    });

    document.getElementById('logoutBtn').addEventListener('click', async function () {
      await sb.auth.signOut();
      location.replace('/connexion');
    });

    document.getElementById('deleteBtn').addEventListener('click', async function () {
      if (!confirm('Supprimer le compte TrophyRec ? Le palmares officiel reste.')) return;
      var r = await fetch('/api/trophyrec/delete-account', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + sess.access_token }
      });
      var body = await r.json().catch(function () { return {}; });
      if (!r.ok) return msg(document.getElementById('saveMsg'), body.error || 'Suppression impossible');
      await sb.auth.signOut();
      location.replace('/');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('loginForm')) initLogin();
    if (document.getElementById('profileForm')) initCompte();
  });
})();
