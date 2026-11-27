(function () {
  'use strict';

  function adminPw() {
    return sessionStorage.getItem('boxingtrophy19_admin_auth') ? document.getElementById('loginPassword') : null;
  }

  async function api(path, body) {
    var res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.status === 401 && typeof window.BT20AdminExpired === 'function') {
      window.BT20AdminExpired();
      throw new Error('Session expirée');
    }
    if (!res.ok) throw new Error(data.error || 'Erreur API');
    return data;
  }

  function initPasswordCapture() {
    var form = document.getElementById('loginForm');
    var input = document.getElementById('loginPassword');
    if (!form || !input) return;
    form.addEventListener('submit', function () {
      /* le mot de passe est enregistre par admin.js apres verification par le serveur */
    });
  }

  async function loadLists() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    // Les comptes (e-mail, licence) passent par l'API admin : ils ne sont plus lisibles en public.
    var accounts = null;
    try {
      var r = await api('/api/trophyrec/accounts', { action: 'list' });
      accounts = r.accounts || [];
      window.__trBrevo = r.brevo;
    } catch (e) {
      setAccStatus('Comptes : ' + e.message);
    }
    if (accounts) {
      window.__trFighters = accounts;
    } else {
      var f = await supabaseClient.from('trophyrec_fighters').select('id,prenom,nom,alias,slug');
      window.__trFighters = f.data || [];
    }
    window.__trAccountsLoaded = Boolean(accounts);
    var c = await supabaseClient.from('trophyrec_coaches').select('*').order('name');
    var b = await supabaseClient.from('trophyrec_bouts').select('*');
    window.__trCoaches = c.data || [];
    window.__trBouts = b.data || [];
    fillFighterSelects();
    renderCoaches();
    renderBouts();
    renderAccounts();
  }

  /* ───────── Comptes combattants ───────── */
  var accFilter = 'all';
  var accQuery = '';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setAccStatus(text) {
    var st = document.getElementById('trAdminStatus');
    if (st) st.textContent = text;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function licenceCell(a) {
    if (a.licence_gate === 'paid_50') return '<span class="badge badge-info">Cotisation 50 €</span>';
    if (a.numero_licence) {
      return '<span style="font-family:monospace;font-size:14px;">' + esc(a.numero_licence) + '</span>' +
        ' <button type="button" class="btn btn-ghost btn-sm" data-copy="' + esc(a.numero_licence) + '" title="Copier le numéro" style="padding:4px 8px;min-height:0;">Copier</button>';
    }
    return '<span style="color:var(--text-dim)">Non renseignée</span>';
  }

  function verifCell(a) {
    if (a.licence_status === 'verifiee') return '<span class="badge badge-success">Vérifiée</span>';
    if (a.licence_status === 'refusee') return '<span class="badge badge-danger">Refusée</span>';
    return '<span class="badge badge-warning">À vérifier</span>';
  }

  function accountCell(a) {
    var out;
    if (a.account_status === 'ferme') out = '<span class="badge badge-danger">Fermé</span>';
    else if (a.has_access) out = '<span class="badge badge-success">Actif</span>';
    else out = '<span class="badge">Sans accès</span>';
    var sub = [];
    if (a.closed_reason && a.account_status === 'ferme') sub.push(esc(a.closed_reason));
    if (a.welcome_sent_at) sub.push('Invité le ' + fmtDate(a.welcome_sent_at));
    if (a.last_sign_in_at) sub.push('Vu le ' + fmtDate(a.last_sign_in_at));
    else if (a.has_access) sub.push('Jamais connecté');
    if (a.bouts) sub.push(a.bouts + ' combat' + (a.bouts > 1 ? 's' : ''));
    return out + (sub.length ? '<div style="font-size:12px;color:var(--text-dim);margin-top:4px;">' + sub.join(' · ') + '</div>' : '');
  }

  function actionsCell(a) {
    var b = [];
    function btn(act, label, cls) {
      b.push('<button type="button" class="btn ' + cls + ' btn-sm" data-acc="' + act + '" data-id="' + esc(a.id) + '">' + label + '</button>');
    }
    if (a.licence_status !== 'verifiee' && a.account_status !== 'ferme') btn('verify_licence', 'Valider la licence', 'btn-primary');
    if (a.licence_status !== 'refusee' && a.account_status !== 'ferme') btn('refuse_licence', 'Refuser', 'btn-danger-outline');
    if (a.account_status === 'ferme') btn('activate', 'Réactiver', 'btn-outline');
    else btn('close', 'Fermer', 'btn-outline');
    if (a.email && a.account_status !== 'ferme') btn('resend', a.has_access ? 'Renvoyer les accès' : 'Créer l\'accès', 'btn-ghost');
    btn('profile', 'Modifier la fiche', 'btn-outline');
    btn('delete', 'Supprimer', 'btn-danger');
    return '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + b.join('') + '</div>';
  }

  function matchFilter(a) {
    if (accFilter === 'a_verifier' && !(a.licence_status === 'a_verifier' && a.account_status !== 'ferme')) return false;
    if (accFilter === 'actif' && !(a.account_status !== 'ferme' && a.has_access)) return false;
    if (accFilter === 'ferme' && a.account_status !== 'ferme') return false;
    if (accFilter === 'sans_acces' && (a.has_access || a.account_status === 'ferme')) return false;
    if (accQuery) {
      var hay = [a.prenom, a.nom, a.alias, a.email, a.numero_licence].join(' ').toLowerCase();
      if (hay.indexOf(accQuery) < 0) return false;
    }
    return true;
  }

  function renderAccounts() {
    var tb = document.getElementById('trAccBody');
    if (!tb) return;
    if (!window.__trAccountsLoaded) {
      tb.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim)">Comptes indisponibles : verifiez SUPABASE_SERVICE_ROLE_KEY, SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD et SESSION_SECRET sur Vercel, et passez le SQL de schema-trophyrec.sql.</td></tr>';
      return;
    }
    var all = window.__trFighters || [];
    var stats = document.getElementById('trAccStats');
    if (stats) {
      var n = function (fn) { return all.filter(fn).length; };
      var cards = [
        ['Comptes', all.length, ''],
        ['Licence à vérifier', n(function (a) { return a.licence_status === 'a_verifier' && a.account_status !== 'ferme'; }), 'gold'],
        ['Actifs', n(function (a) { return a.has_access && a.account_status !== 'ferme'; }), 'green'],
        ['Fermés', n(function (a) { return a.account_status === 'ferme'; }), 'red']
      ];
      stats.innerHTML = cards.map(function (c) {
        return '<div class="stat-card ' + c[2] + '"><div class="stat-value">' + c[1] + '</div><div class="stat-label">' + c[0] + '</div></div>';
      }).join('');
    }
    var list = all.filter(matchFilter);
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim)">Aucun compte dans ce filtre.</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (a) {
      var name = ((a.prenom || '') + ' ' + (a.nom || '')).trim() || '—';
      return '<tr><td><strong>' + esc(name) + '</strong>' + (a.alias ? ' <span style="color:var(--text-dim)">« ' + esc(a.alias) + ' »</span>' : '') +
        '<div style="font-size:12px;color:var(--text-dim);">' + esc(a.email || 'pas d\'e-mail') + '</div>' +
        (a.slug ? '<a href="/boxeur/' + encodeURIComponent(a.slug) + '" target="_blank" rel="noopener" style="font-size:12px;">Voir la fiche</a>' : '') + '</td>' +
        '<td>' + licenceCell(a) + '</td><td>' + verifCell(a) + '</td><td>' + accountCell(a) + '</td><td>' + actionsCell(a) + '</td></tr>';
    }).join('');
  }

  var CONFIRM = {
    refuse_licence: function (a) { return 'Refuser la licence de ' + a.name + ' ? Le compte sera fermé et la fiche retirée du classement.'; },
    close: function (a) { return 'Fermer le compte de ' + a.name + ' ? Il ne pourra plus se connecter et sa fiche disparaît du classement.'; },
    delete: function (a) { return 'Supprimer définitivement le compte de ' + a.name + ' ? Si des combats officiels existent, le palmarès est gardé sans les données perso.'; },
    resend: function (a) { return 'Envoyer un nouveau mot de passe provisoire à ' + a.email + ' ? L\'ancien ne marchera plus.'; }
  };

  async function onAccountAction(btn) {
    var act = btn.getAttribute('data-acc');
    var id = btn.getAttribute('data-id');
    var acc = (window.__trFighters || []).find(function (x) { return x.id === id; }) || {};
    var info = { name: ((acc.prenom || '') + ' ' + (acc.nom || '')).trim() || 'ce combattant', email: acc.email || '' };
    if (CONFIRM[act] && !confirm(CONFIRM[act](info))) return;
    var body = { action: act, id: id };
    if (act === 'close' || act === 'refuse_licence') {
      var reason = prompt('Raison (visible dans le mail envoyé au combattant, facultatif) :', act === 'refuse_licence' ? 'Numéro de licence non valide' : '');
      if (reason === null) return;
      body.reason = reason;
      body.notify = Boolean(acc.email) && confirm('Prévenir ' + info.name + ' par mail ?');
    }
    btn.disabled = true;
    try {
      var r = await api('/api/trophyrec/accounts', body);
      var done = {
        verify_licence: 'Licence validée pour ' + info.name + '.',
        refuse_licence: 'Licence refusée, compte de ' + info.name + ' fermé.',
        close: 'Compte de ' + info.name + ' fermé.',
        activate: 'Compte de ' + info.name + ' réactivé.',
        resend: r.mail ? 'Nouveaux accès envoyés à ' + info.email + '.' : 'Mail non envoyé (Brevo). Mot de passe provisoire à transmettre : ' + r.password,
        delete: r.kept ? 'Compte supprimé, palmarès gardé.' : 'Compte et fiche supprimés.'
      }[act];
      setAccStatus(done || 'OK');
      if (act === 'resend' && !r.mail && r.password) alert('Le mail n\'est pas parti. Mot de passe provisoire pour ' + info.email + ' :\n\n' + r.password);
      await loadLists();
    } catch (e) {
      setAccStatus(e.message);
      btn.disabled = false;
    }
  }

  function initAccounts() {
    var card = document.getElementById('trAccountsCard');
    if (!card) return;
    card.addEventListener('click', function (e) {
      var f = e.target.closest('[data-accf]');
      if (f) {
        accFilter = f.getAttribute('data-accf');
        card.querySelectorAll('[data-accf]').forEach(function (b) { b.classList.toggle('is-active', b === f); });
        renderAccounts();
        return;
      }
      var copy = e.target.closest('[data-copy]');
      if (copy) {
        var v = copy.getAttribute('data-copy');
        if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { copy.textContent = 'Copié'; setTimeout(function () { copy.textContent = 'Copier'; }, 1200); });
        return;
      }
      var act = e.target.closest('[data-acc]');
      if (act && act.getAttribute('data-acc') === 'profile') { openProfile(act.getAttribute('data-id')); return; }
      if (act) onAccountAction(act);
    });
    var search = document.getElementById('trAccSearch');
    if (search) search.addEventListener('input', function () { accQuery = search.value.trim().toLowerCase(); renderAccounts(); });
    var refresh = document.getElementById('trAccRefresh');
    if (refresh) refresh.addEventListener('click', loadLists);
    var create = document.getElementById('trAccCreate');
    if (create) create.addEventListener('submit', async function (e) {
      e.preventDefault();
      var send = document.getElementById('trAccSend').checked;
      try {
        var r = await api('/api/trophyrec/accounts', {
          action: 'create',
          prenom: document.getElementById('trAccPrenom').value.trim(),
          nom: document.getElementById('trAccNom').value.trim(),
          email: document.getElementById('trAccEmail').value.trim(),
          numero_licence: document.getElementById('trAccLicence').value.trim(),
          licence_status: document.getElementById('trAccLicStatus').value,
          send: send
        });
        var email = document.getElementById('trAccEmail').value.trim();
        create.reset();
        if (r.mail) setAccStatus('Compte créé, accès envoyés à ' + email + '.');
        else {
          setAccStatus('Compte créé. Mail non envoyé : transmettez le mot de passe provisoire.');
          if (r.password) alert('Compte créé pour ' + email + '.\nMot de passe provisoire :\n\n' + r.password);
        }
        await loadLists();
      } catch (err) {
        setAccStatus(err.message);
      }
    });
  }

  function nameOf(id) {
    var f = (window.__trFighters || []).find(function (x) { return x.id === id; });
    if (!f) return id;
    var n = ((f.prenom || '') + ' ' + (f.nom || '')).trim();
    return f.alias ? n + ' « ' + f.alias + ' »' : n;
  }

  var GYM_SHORT = { minimes: 'BC Minimes', 'etats-unis': 'BC Etats-Unis', 'st-cyprien': 'BC Saint-Cyprien', ramonville: 'BC Ramonville', portet: 'BC Portet', moteka: 'Moteka', autre: 'Autre club' };

  function fillFighterSelects() {
    var list = (window.__trFighters || []).slice().sort(function (a, b) {
      return ((a.prenom || '') + (a.nom || '')).localeCompare((b.prenom || '') + (b.nom || ''));
    });
    var opts = '<option value="">Choisir…</option>' + list.map(function (f) {
      var club = f.gym_id === 'autre' && f.gym_other ? f.gym_other : (GYM_SHORT[f.gym_id] || '');
      var extra = [f.sexe, club, f.account_status === 'ferme' ? 'compte fermé' : ''].filter(Boolean).join(' · ');
      return '<option value="' + esc(f.id) + '">' + esc(nameOf(f.id)) + (extra ? ' (' + esc(extra) + ')' : '') + '</option>';
    }).join('');
    ['trFighterA', 'trFighterB'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var keep = el.value;
      el.innerHTML = opts;
      el.value = keep;
    });
  }

  function renderCoaches() {
    var ul = document.getElementById('trCoachList');
    if (!ul) return;
    ul.innerHTML = (window.__trCoaches || []).map(function (c) {
      var off = c.active === false;
      return '<li style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);' + (off ? 'opacity:.55;' : '') + '">' +
        '<strong>' + esc(c.name) + '</strong><span style="color:var(--text-dim);font-size:13px;">' + esc(GYM_SHORT[c.gym_id] || c.gym_id || '') + (off ? ' · désactivé' : '') + '</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" style="margin-left:auto;" data-coach="' + esc(c.id) + '" data-active="' + (off ? '1' : '0') + '">' + (off ? 'Réactiver' : 'Désactiver') + '</button></li>';
    }).join('') || '<li>Aucun coach. Ajoutez-en un.</li>';
  }

  var RES_LABEL = { a_win: 'Victoire', b_win: 'Victoire', draw: 'Nul', nc: 'Sans décision' };
  var METHOD_LABEL = { ud: 'Unanime (UD)', md: 'Majoritaire (MD)', sd: 'Partagée (SD)', decision: 'Décision', ko: 'KO', tko: 'TKO' };

  function renderBouts() {
    var tb = document.getElementById('trBoutsBody');
    if (!tb) return;
    var list = (window.__trBouts || []).slice().sort(function (a, b) {
      return String(b.bout_date || b.created_at || '').localeCompare(String(a.bout_date || a.created_at || ''));
    });
    if (!list.length) { tb.innerHTML = '<tr><td colspan="7" style="color:var(--text-dim)">Aucun résultat saisi.</td></tr>'; return; }
    tb.innerHTML = list.map(function (b) {
      var aWin = b.result !== 'b_win';
      var left = aWin ? b.fighter_a : b.fighter_b;
      var right = aWin ? b.fighter_b : b.fighter_a;
      var res = b.result === 'draw' || b.result === 'nc'
        ? '<span class="badge">' + RES_LABEL[b.result] + '</span>'
        : '<span class="badge badge-success">V · ' + esc(METHOD_LABEL[b.method] || b.method || '') + (b.round ? ' R' + b.round : '') + '</span>';
      var ed = /^t(\d+)$/.exec(b.edition_id || '');
      return '<tr><td>' + esc(b.bout_date || '') + '</td><td>' + esc(ed ? 'Trophy ' + ed[1] : (b.edition_id || '')) + '</td>' +
        '<td><strong>' + esc(nameOf(left)) + '</strong></td><td>' + res + '</td><td>' + esc(nameOf(right)) + '</td>' +
        '<td style="font-size:13px;">' + esc([b.discipline, b.sexe, b.categorie_poids].filter(Boolean).join(' · ')) + '</td>' +
        '<td><div style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="btn btn-outline btn-sm" data-bout-edit="' + esc(b.id) + '">Corriger</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-bout-del="' + esc(b.id) + '">Supprimer</button></div></td></tr>';
    }).join('');
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function resetBoutForm() {
    var form = document.getElementById('trBoutForm');
    form.reset();
    document.getElementById('trBoutId').value = '';
    document.getElementById('trBoutDate').value = today();
    document.getElementById('trBoutTitle').textContent = '2. Résultat officiel';
    document.getElementById('trBoutSubmit').textContent = 'Enregistrer le résultat';
    document.getElementById('trBoutCancel').hidden = true;
  }

  function editBout(id) {
    var b = (window.__trBouts || []).find(function (x) { return String(x.id) === String(id); });
    if (!b) return;
    var set = function (elId, v) { var el = document.getElementById(elId); if (el && v != null) el.value = v; };
    set('trBoutId', b.id); set('trFighterA', b.fighter_a); set('trFighterB', b.fighter_b);
    set('trResult', b.result); set('trMethod', /^(ud|md|sd)$/.test(b.method || '') ? b.method : 'ud'); set('trDiscipline', b.discipline);
    set('trSexe', b.sexe); set('trPoids', b.categorie_poids); set('trRound', b.round || '');
    set('trBoutDate', b.bout_date || today()); set('trEdition', b.edition_id || 't20'); set('trMatchId', b.source_match_id || '');
    document.getElementById('trBoutTitle').textContent = 'Corriger le résultat';
    document.getElementById('trBoutSubmit').textContent = 'Enregistrer la correction';
    document.getElementById('trBoutCancel').hidden = false;
    document.getElementById('trBoutForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* Discipline, tableau et poids repris de la fiche et du dernier combat du combattant A */
  function prefillFromFighter() {
    if (document.getElementById('trBoutId').value) return;
    var id = document.getElementById('trFighterA').value;
    var f = (window.__trFighters || []).find(function (x) { return x.id === id; });
    if (!f) return;
    if (f.sexe) document.getElementById('trSexe').value = f.sexe;
    var last = (window.__trBouts || []).filter(function (b) { return b.fighter_a === id || b.fighter_b === id; })
      .sort(function (a, b) { return String(b.bout_date || '').localeCompare(String(a.bout_date || '')); })[0];
    if (last) {
      if (last.discipline) document.getElementById('trDiscipline').value = last.discipline;
      if (last.categorie_poids) document.getElementById('trPoids').value = last.categorie_poids;
    }
  }

  /* ───────── Fiche publique (club, photo, surnom...) ───────── */
  function openProfile(id) {
    var f = (window.__trFighters || []).find(function (x) { return x.id === id; });
    var dlg = document.getElementById('trEditDlg');
    if (!f || !dlg) return;
    var set = function (elId, v) { document.getElementById(elId).value = v == null ? '' : v; };
    set('trEdId', f.id); set('trEdPrenom', f.prenom); set('trEdNom', f.nom); set('trEdAlias', f.alias);
    set('trEdSexe', f.sexe || ''); set('trEdGym', f.gym_id || 'autre'); set('trEdGymOther', f.gym_other);
    set('trEdStance', f.stance || ''); set('trEdHeight', f.height_cm); set('trEdLicence', f.numero_licence); set('trEdPhoto', f.photo_url);
    var coach = document.getElementById('trEdCoach');
    coach.innerHTML = '<option value="">Aucun</option>' + (window.__trCoaches || []).filter(function (c) { return c.active !== false || c.id === f.coach_id; }).map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + ' · ' + esc(GYM_SHORT[c.gym_id] || '') + '</option>';
    }).join('');
    coach.value = f.coach_id || '';
    document.getElementById('trEdMsg').textContent = '';
    document.getElementById('trEdPhotoFile').value = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function initProfileDialog() {
    var dlg = document.getElementById('trEditDlg');
    if (!dlg) return;
    var msgEl = document.getElementById('trEdMsg');
    document.getElementById('trEdCancel').addEventListener('click', function () { dlg.close(); });
    document.getElementById('trEdPhotoFile').addEventListener('change', async function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (typeof BT18Cloudinary === 'undefined') { msgEl.textContent = 'Envoi de photo indisponible : collez un lien.'; return; }
      msgEl.textContent = 'Envoi de la photo…';
      try {
        document.getElementById('trEdPhoto').value = await BT18Cloudinary.uploadFile(file);
        msgEl.textContent = 'Photo envoyée. Pensez à enregistrer.';
      } catch (err) {
        msgEl.textContent = err.message || 'Envoi impossible.';
      }
    });
    document.getElementById('trEditForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var v = function (id) { return document.getElementById(id).value.trim(); };
      var save = document.getElementById('trEdSave');
      save.disabled = true;
      try {
        await api('/api/trophyrec/accounts', {
          action: 'update_profile', id: v('trEdId'), prenom: v('trEdPrenom'), nom: v('trEdNom'), alias: v('trEdAlias'),
          sexe: v('trEdSexe'), gym_id: v('trEdGym'), gym_other: v('trEdGymOther'), coach_id: v('trEdCoach'),
          stance: v('trEdStance'), height_cm: v('trEdHeight'), numero_licence: v('trEdLicence'), photo_url: v('trEdPhoto')
        });
        dlg.close();
        setAccStatus('Fiche de ' + v('trEdPrenom') + ' ' + v('trEdNom') + ' mise à jour. TrophyRec est à jour.');
        await loadLists();
      } catch (err) {
        msgEl.textContent = err.message;
      } finally {
        save.disabled = false;
      }
    });
  }

  function init() {
    initPasswordCapture();
    var tab = document.getElementById('tab-trophyrec');
    if (!tab) return;
    initAccounts();
    initProfileDialog();

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-tab') === 'trophyrec') loadLists();
      });
    });

    var syncBtn = document.getElementById('trSyncBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async function () {
        var st = document.getElementById('trAdminStatus');
        try {
          var r = await api('/api/trophyrec/sync-fighters', {});
          st.textContent = 'Fiches créées : ' + r.created + ' (déjà là : ' + r.skipped + ').';
          await loadLists();
        } catch (e) {
          st.textContent = e.message;
        }
      });
    }

    var boutForm = document.getElementById('trBoutForm');
    if (boutForm) {
      resetBoutForm();
      document.getElementById('trFighterA').addEventListener('change', prefillFromFighter);
      document.getElementById('trBoutCancel').addEventListener('click', resetBoutForm);
      boutForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var st = document.getElementById('trAdminStatus');
        var id = document.getElementById('trBoutId').value;
        var a = document.getElementById('trFighterA').value;
        var b = document.getElementById('trFighterB').value;
        if (a && a === b) { st.textContent = 'Choisissez deux combattants différents.'; return; }
        try {
          await api('/api/trophyrec/result', {
            id: id || undefined,
            fighter_a: a,
            fighter_b: b,
            result: document.getElementById('trResult').value,
            method: document.getElementById('trMethod').value,
            discipline: document.getElementById('trDiscipline').value,
            sexe: document.getElementById('trSexe').value,
            categorie_poids: document.getElementById('trPoids').value,
            round: document.getElementById('trRound').value || null,
            bout_date: document.getElementById('trBoutDate').value,
            edition_id: document.getElementById('trEdition').value,
            source_match_id: document.getElementById('trMatchId').value.trim() || null,
            sync_affiche: true
          });
          st.textContent = id ? 'Résultat corrigé. TrophyRec est à jour.' : 'Résultat enregistré. TrophyRec est à jour.';
          resetBoutForm();
          await loadLists();
        } catch (err) {
          st.textContent = err.message;
        }
      });

      document.getElementById('trBoutsBody').addEventListener('click', async function (e) {
        var ed = e.target.closest('[data-bout-edit]');
        if (ed) { editBout(ed.getAttribute('data-bout-edit')); return; }
        var del = e.target.closest('[data-bout-del]');
        if (!del) return;
        var bout = (window.__trBouts || []).find(function (x) { return String(x.id) === del.getAttribute('data-bout-del'); });
        if (!bout || !confirm('Supprimer le combat ' + nameOf(bout.fighter_a) + ' contre ' + nameOf(bout.fighter_b) + ' ? Le classement sera recalculé.')) return;
        try {
          await api('/api/trophyrec/result', { action: 'delete', id: bout.id });
          setAccStatus('Combat supprimé. Classement recalculé.');
          await loadLists();
        } catch (err) {
          setAccStatus(err.message);
        }
      });
    }

    var coachForm = document.getElementById('trCoachForm');
    if (coachForm) {
      coachForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var st = document.getElementById('trAdminStatus');
        try {
          await api('/api/trophyrec/coach', {
            name: document.getElementById('trCoachName').value.trim(),
            gym_id: document.getElementById('trCoachGym').value
          });
          st.textContent = 'Coach ajouté.';
          coachForm.reset();
          await loadLists();
        } catch (err) {
          st.textContent = err.message;
        }
      });
      document.getElementById('trCoachList').addEventListener('click', async function (e) {
        var btn = e.target.closest('[data-coach]');
        if (!btn) return;
        var on = btn.getAttribute('data-active') === '1';
        try {
          await api('/api/trophyrec/coach', { action: 'toggle', id: btn.getAttribute('data-coach'), active: on });
          setAccStatus(on ? 'Coach réactivé.' : 'Coach désactivé : il n\'est plus proposé aux combattants.');
          await loadLists();
        } catch (err) {
          setAccStatus(err.message);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
