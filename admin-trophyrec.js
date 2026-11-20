(function () {
  'use strict';

  function adminPw() {
    return sessionStorage.getItem('boxingtrophy19_admin_auth') ? document.getElementById('loginPassword') : null;
  }

  function password() {
    if (typeof getAdminPasswordFromEnv === 'function') {
      var envPw = getAdminPasswordFromEnv();
      if (envPw) return envPw;
    }
    try {
      return sessionStorage.getItem('bt19_admin_pw') || '';
    } catch (e) {
      return '';
    }
  }

  async function api(path, body) {
    var res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': password()
      },
      body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Erreur API');
    return data;
  }

  function initPasswordCapture() {
    var form = document.getElementById('loginForm');
    var input = document.getElementById('loginPassword');
    if (!form || !input) return;
    form.addEventListener('submit', function () {
      try { sessionStorage.setItem('bt19_admin_pw', input.value); } catch (e) {}
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
      tb.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim)">Comptes indisponibles : vérifiez SUPABASE_SERVICE_ROLE_KEY et ADMIN_PASSWORD sur Vercel, et passez le SQL de schema-trophyrec.sql.</td></tr>';
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
    return f ? ((f.prenom || '') + ' ' + (f.nom || '')).trim() : id;
  }

  function fillFighterSelects() {
    var opts = '<option value="">—</option>' + (window.__trFighters || []).map(function (f) {
      return '<option value="' + f.id + '">' + ((f.prenom || '') + ' ' + (f.nom || '')).replace(/</g, '') + '</option>';
    }).join('');
    ['trFighterA', 'trFighterB'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  }

  function renderCoaches() {
    var ul = document.getElementById('trCoachList');
    if (!ul) return;
    ul.innerHTML = (window.__trCoaches || []).map(function (c) {
      return '<li>' + String(c.name).replace(/</g, '') + ' · ' + (c.gym_id || '') + '</li>';
    }).join('') || '<li>Aucun coach. Ajoutez-en un.</li>';
  }

  function renderBouts() {
    var tb = document.getElementById('trBoutsBody');
    if (!tb) return;
    tb.innerHTML = (window.__trBouts || []).map(function (b) {
      return '<tr><td>' + nameOf(b.fighter_a) + '</td><td>' + nameOf(b.fighter_b) + '</td><td>' +
        (b.result || '') + '</td><td>' + (b.method || '') + '</td><td>' + (b.categorie_poids || '') + '</td></tr>';
    }).join('');
  }

  function init() {
    initPasswordCapture();
    var tab = document.getElementById('tab-trophyrec');
    if (!tab) return;
    initAccounts();

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
          st.textContent = 'Fiches creees : ' + r.created + ' (deja la : ' + r.skipped + ').';
          await loadLists();
        } catch (e) {
          st.textContent = e.message;
        }
      });
    }

    var boutForm = document.getElementById('trBoutForm');
    if (boutForm) {
      boutForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var st = document.getElementById('trAdminStatus');
        try {
          await api('/api/trophyrec/result', {
            fighter_a: document.getElementById('trFighterA').value,
            fighter_b: document.getElementById('trFighterB').value,
            result: document.getElementById('trResult').value,
            method: document.getElementById('trMethod').value,
            discipline: document.getElementById('trDiscipline').value,
            sexe: document.getElementById('trSexe').value,
            categorie_poids: document.getElementById('trPoids').value,
            source_match_id: document.getElementById('trMatchId').value.trim() || null,
            sync_affiche: true
          });
          st.textContent = 'Resultat enregistre. Classement public mis a jour.';
          boutForm.reset();
          await loadLists();
        } catch (err) {
          st.textContent = err.message;
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
          st.textContent = 'Coach ajoute.';
          coachForm.reset();
          await loadLists();
        } catch (err) {
          st.textContent = err.message;
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
