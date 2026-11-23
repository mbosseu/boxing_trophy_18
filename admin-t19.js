/* Back office — onglet Trophy 19 : archives (inscrits, carte des combats) et saisie des décisions.
   Un clic sur un combat ouvre la décision : victoire, nul ou sans décision, décision des juges (unanime, majoritaire, partagée) et round.
   Enregistrer met à jour TrophyRec (gala Trophy 19) et le vainqueur sur la carte archivée. */
(function () {
  'use strict';

  var T19_DATE = '2026-11-13';
  var loaded = false;
  var fightersSynced = false;
  var data = { registrations: [], matches: [], bouts: {}, fighters: [] };
  var current = null;

  var METHODS = { ud: 'Unanime (UD)', md: 'Majoritaire (MD)', sd: 'Partagée (SD)', decision: 'Décision', ko: 'KO', tko: 'TKO' };

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pw() { return sessionStorage.getItem('bt20_admin_pw') || ''; }

  /* Mot de passe change sur Vercel depuis la connexion : on deconnecte proprement. */
  function sessionExpired() {
    sessionStorage.removeItem('boxingtrophy20_admin_auth');
    sessionStorage.removeItem('bt20_admin_pw');
    alert('Le mot de passe admin a changé depuis votre connexion. Reconnectez-vous avec le nouveau.');
    location.reload();
  }
  window.BT20AdminExpired = sessionExpired;

  async function post(path, body) {
    var r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': pw() }, body: JSON.stringify(body) });
    var j = await r.json().catch(function () { return {}; });
    if (r.status === 401) { sessionExpired(); throw new Error('Session expirée'); }
    if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
    return j;
  }

  function fullName(f) { return f ? ((f.prenom || '') + ' ' + (f.nom || '')).trim() || '—' : '—'; }
  function sourceId(m) { return 't19-' + m.id; }
  function divOf(m) {
    var f1 = m.fighter1 || {};
    return { discipline: m.discipline || f1.discipline || null, sexe: m.sexe || f1.sexe || null, poids: m.categoriePoids || f1.categoriePoids || null };
  }

  /* ───────── Chargement ───────── */
  async function loadBouts() {
    data.bouts = {};
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    var r = await supabaseClient.from('trophyrec_bouts').select('*').eq('edition_id', 't19');
    (r.data || []).forEach(function (b) { if (b.source_match_id) data.bouts[b.source_match_id] = b; });
  }

  async function load() {
    var status = $('t19Status');
    status.textContent = 'Chargement des archives…';
    try {
      var res = await fetch('/api/admin/sync?edition=t19', { cache: 'no-store', headers: { 'x-admin-password': pw() } });
      var body = await res.json().catch(function () { return {}; });
      if (res.status === 401) return sessionExpired();
      if (!res.ok) throw new Error(body.error || 'Archives indisponibles');
      if (body.edition !== 't19') {
        status.textContent = 'Le classement par édition n\'est pas encore actif : passez le SQL « Trophy 19 / Trophy 20 » de schema.sql dans Supabase.';
        return;
      }
      data.registrations = body.registrations || [];
      data.matches = (body.matches || []).filter(function (m) { return m.fighter1 && m.fighter2; });
      await loadBouts();
      loaded = true;
      render();
      status.textContent = 'Cliquez sur un combat pour saisir la décision.';
    } catch (e) {
      status.textContent = e.message;
    }
  }

  /* ───────── Affichage ───────── */
  function resultBadge(m) {
    var b = data.bouts[sourceId(m)];
    if (!b) return '<span class="badge badge-warning">À saisir</span>';
    if (b.result === 'draw') return '<span class="badge badge-info">Nul</span>';
    if (b.result === 'nc') return '<span class="badge">Sans décision</span>';
    return '<span class="badge badge-success">' + esc(METHODS[b.method] || b.method || '') + (b.round ? ' · R' + b.round : '') + '</span>';
  }

  function render() {
    var regs = data.registrations.slice().sort(function (a, b) { return String(a.nom || '').localeCompare(String(b.nom || ''), 'fr'); });
    var matches = data.matches.slice().sort(function (a, b) { return (a.match_number || a.sort_order || 0) - (b.match_number || b.sort_order || 0); });
    var decided = matches.filter(function (m) { return data.bouts[sourceId(m)]; }).length;
    var clubs = {};
    regs.forEach(function (r) { if (r.club) clubs[String(r.club).trim().toLowerCase()] = 1; });
    $('t19Stats').innerHTML = [
      ['Inscrits', regs.length, 'gold'], ['Combats', matches.length, 'blue'], ['Décisions saisies', decided + ' / ' + matches.length, 'green'], ['Clubs', Object.keys(clubs).length, 'red']
    ].map(function (c) {
      return '<div class="stat-card ' + c[2] + '"><div class="stat-value">' + c[1] + '</div><div class="stat-label">' + c[0] + '</div></div>';
    }).join('');

    $('t19Matches').innerHTML = matches.length ? matches.map(function (m) {
      var b = data.bouts[sourceId(m)];
      var w1 = b ? b.result === 'a_win' : m.winner === 'fighter1';
      var w2 = b ? b.result === 'b_win' : m.winner === 'fighter2';
      var lost = function (win, other) { return b && (b.result === 'a_win' || b.result === 'b_win') && !win && other; };
      var side = function (f, win, lose) {
        return '<td style="' + (win ? 'font-weight:700;color:var(--gold);' : lose ? 'opacity:.6;' : '') + '">' + esc(fullName(f)) +
          (win ? ' <span class="badge badge-success">V</span>' : lose ? ' <span class="badge badge-danger">D</span>' : '') +
          '<div style="font-size:12px;color:var(--text-dim);font-weight:400;">' + esc(f.club || '') + '</div></td>';
      };
      var d = divOf(m);
      return '<tr class="t19-row" data-mid="' + esc(m.id) + '" tabindex="0" role="button" style="cursor:pointer;" title="Saisir la décision">' +
        '<td>' + esc(m.match_number || '') + '</td>' + side(m.fighter1, w1, lost(w1, w2)) + '<td style="text-align:center;color:var(--text-dim);">VS</td>' + side(m.fighter2, w2, lost(w2, w1)) +
        '<td style="font-size:13px;">' + esc([d.discipline, d.sexe, d.poids].filter(Boolean).join(' · ')) + '</td><td>' + resultBadge(m) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" style="color:var(--text-dim)">Aucun combat archivé.</td></tr>';

    var q = ($('t19Search').value || '').trim().toLowerCase();
    var list = regs.filter(function (r) {
      return !q || [r.prenom, r.nom, r.club, r.email].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    $('t19Regs').innerHTML = list.length ? list.map(function (r) {
      return '<tr><td><strong>' + esc(fullName(r)) + '</strong></td><td>' + esc(r.club || '') + '</td><td>' + esc(r.discipline || '') + '</td>' +
        '<td>' + esc(r.sexe || '') + '</td><td>' + esc(r.categoriePoids || '') + '</td><td>' + esc(r.niveau || '') + '</td>' +
        '<td style="font-size:12px;">' + esc(r.email || '') + '<br>' + esc(r.telephone || '') + '</td></tr>';
    }).join('') : '<tr><td colspan="7" style="color:var(--text-dim)">Aucun inscrit.</td></tr>';
  }

  /* ───────── Fenêtre de décision ───────── */
  function updateMethodState() {
    var res = (document.querySelector('input[name="t19Res"]:checked') || {}).value || '';
    var win = res === 'a_win' || res === 'b_win';
    $('t19Method').disabled = !win;
    $('t19Round').disabled = !win;
    $('t19DlgSave').disabled = !res;
  }

  function openDecision(id) {
    var m = data.matches.find(function (x) { return String(x.id) === String(id); });
    if (!m) return;
    current = m;
    var b = data.bouts[sourceId(m)];
    var d = divOf(m);
    $('t19DlgTitle').textContent = 'Combat n°' + (m.match_number || '') + ' · ' + [d.discipline, d.sexe, d.poids].filter(Boolean).join(' · ');
    fillCorners(m);
    refreshCorners();
    var res = b ? b.result : (m.winner === 'fighter1' ? 'a_win' : m.winner === 'fighter2' ? 'b_win' : '');
    document.querySelectorAll('input[name="t19Res"]').forEach(function (r) { r.checked = r.value === res; });
    $('t19Method').value = (b && METHODS[b.method] && /^(ud|md|sd)$/.test(b.method)) ? b.method : 'ud';
    $('t19Round').value = (b && b.round) || '';
    $('t19DlgDelete').hidden = !b;
    $('t19DlgMsg').textContent = '';
    updateMethodState();
    var dlg = $('t19Dlg');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  /* ───────── Choix des adversaires (affiche erronée : le vrai adversaire était un autre) ───────── */
  var extras = []; // combattants non inscrits ajoutes a la main (ex. remplaçant le soir du gala)
  function regById(id, fallback) {
    return data.registrations.find(function (r) { return String(r.id) === String(id); }) ||
      extras.find(function (r) { return String(r.id) === String(id); }) || fallback || null;
  }

  function slugId(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* « + Combattant non inscrit… » : prénom, nom, club, puis il devient choisissable dans les deux coins */
  function addExternal(sel) {
    var prenom = (prompt('Prénom du combattant non inscrit :') || '').trim();
    var nom = prenom ? (prompt('Nom de ' + prenom + ' :') || '').trim() : '';
    if (!prenom || !nom) { sel.value = sel.getAttribute('data-prev') || ''; return; }
    var club = (prompt('Club de ' + prenom + ' ' + nom + ' (facultatif) :') || '').trim();
    var f = { id: 'ext_t19_' + slugId(prenom + '-' + nom), prenom: prenom, nom: nom, club: club, ext: true };
    if (!regById(f.id)) extras.push(f);
    var m = current;
    fillCorners(m, { t19F1: $('t19F1').value, t19F2: $('t19F2').value });
    sel.value = f.id;
    refreshCorners();
  }

  function fillCorners(m, keep) {
    var regs = data.registrations.concat(extras).sort(function (a, b) { return fullName(a).localeCompare(fullName(b), 'fr'); });
    [[m.fighter1, 't19F1'], [m.fighter2, 't19F2']].forEach(function (pair) {
      var f = pair[0], sel = $(pair[1]);
      var list = regs.slice();
      if (f && !regById(f.id)) list.unshift(f); // combattant de l'affiche absent des inscrits : on le garde
      sel.innerHTML = list.map(function (r) {
        var extra = [r.ext ? 'non inscrit' : '', r.club, r.categoriePoids].filter(Boolean).join(' · ');
        return '<option value="' + esc(r.id) + '">' + esc(fullName(r)) + (extra ? ' — ' + esc(extra) : '') + '</option>';
      }).join('') + '<option value="__new">+ Combattant non inscrit…</option>';
      sel.value = keep && keep[pair[1]] ? keep[pair[1]] : (f ? String(f.id) : '');
      sel.setAttribute('data-prev', sel.value);
    });
  }

  function corners() {
    var m = current;
    return {
      f1: regById($('t19F1').value, m && String(m.fighter1.id) === $('t19F1').value ? m.fighter1 : null),
      f2: regById($('t19F2').value, m && String(m.fighter2.id) === $('t19F2').value ? m.fighter2 : null)
    };
  }

  function refreshCorners() {
    var c = corners();
    var m = current;
    $('t19ResA').textContent = 'Victoire ' + fullName(c.f1);
    $('t19ResB').textContent = 'Victoire ' + fullName(c.f2);
    $('t19DlgFighters').innerHTML = '<strong>' + esc(fullName(c.f1)) + '</strong> <span style="color:var(--text-dim)">(' + esc((c.f1 && c.f1.club) || '—') + ')</span>' +
      ' &nbsp;vs&nbsp; <strong>' + esc(fullName(c.f2)) + '</strong> <span style="color:var(--text-dim)">(' + esc((c.f2 && c.f2.club) || '—') + ')</span>';
    var changed = m && (String(m.fighter1.id) !== $('t19F1').value || String(m.fighter2.id) !== $('t19F2').value);
    $('t19OppNote').hidden = !changed;
  }

  /* Fiche TrophyRec du combattant : même id, même inscription ou même e-mail */
  async function resolveFighters(m) {
    if (!fightersSynced) {
      $('t19DlgMsg').textContent = 'Préparation des fiches combattants…';
      await post('/api/trophyrec/sync-fighters', {});
      var list = await post('/api/trophyrec/accounts', { action: 'list' });
      data.fighters = list.accounts || [];
      fightersSynced = true;
    }
    async function find(f) {
      if (f.ext) {
        // Non inscrit : fiche TrophyRec creee (ou retrouvee) par le serveur
        var created = await post('/api/trophyrec/result', { action: 'ensure_fighter', id: f.id, prenom: f.prenom, nom: f.nom, club: f.club || null });
        return created.id;
      }
      var email = String(f.email || '').trim().toLowerCase();
      var hit = data.fighters.find(function (x) { return String(x.id) === String(f.id); }) ||
        data.fighters.find(function (x) { return x.registration_id && String(x.registration_id) === String(f.id); }) ||
        (email && data.fighters.find(function (x) { return String(x.email || '').toLowerCase() === email; }));
      if (!hit) throw new Error('Fiche TrophyRec introuvable pour ' + fullName(f) + '.');
      return hit.id;
    }
    return { a: await find(m.f1), b: await find(m.f2) };
  }

  async function saveDecision(e) {
    e.preventDefault();
    var m = current;
    var res = (document.querySelector('input[name="t19Res"]:checked') || {}).value;
    if (!m || !res) return;
    var c = corners();
    if (!c.f1 || !c.f2) { $('t19DlgMsg').textContent = 'Choisissez les deux combattants.'; return; }
    if (String(c.f1.id) === String(c.f2.id)) { $('t19DlgMsg').textContent = 'Le même combattant ne peut pas être dans les deux coins.'; return; }
    var changed = String(m.fighter1.id) !== String(c.f1.id) || String(m.fighter2.id) !== String(c.f2.id);
    var win = res === 'a_win' || res === 'b_win';
    var btn = $('t19DlgSave');
    btn.disabled = true;
    try {
      var ids = await resolveFighters(c);
      var d = divOf(m);
      var b = data.bouts[sourceId(m)];
      $('t19DlgMsg').textContent = 'Enregistrement…';
      await post('/api/trophyrec/result', {
        id: b ? b.id : undefined,
        fighter_a: ids.a, fighter_b: ids.b,
        result: res,
        method: win ? $('t19Method').value : null,
        round: win && $('t19Round').value ? $('t19Round').value : null,
        discipline: d.discipline, sexe: d.sexe, categorie_poids: d.poids,
        bout_date: T19_DATE, edition_id: 't19',
        source_match_id: sourceId(m),
        affiche_match_id: m.id,
        affiche_fighters: changed ? {
          fighter1: c.f1.id, fighter2: c.f2.id,
          extra: [c.f1, c.f2].filter(function (f) { return f.ext; }).map(function (f) { return { id: f.id, prenom: f.prenom, nom: f.nom, club: f.club || '' }; })
        } : undefined,
        sync_affiche: true
      });
      if (changed) { m.fighter1 = c.f1; m.fighter2 = c.f2; }
      m.winner = res === 'a_win' ? 'fighter1' : res === 'b_win' ? 'fighter2' : null;
      await loadBouts();
      render();
      $('t19Dlg').close();
      $('t19Status').textContent = 'Décision enregistrée pour le combat n°' + (m.match_number || '') + '. TrophyRec est à jour.';
    } catch (err) {
      $('t19DlgMsg').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteDecision() {
    var m = current;
    var b = m && data.bouts[sourceId(m)];
    if (!b || !confirm('Effacer la décision de ce combat ? Le classement TrophyRec sera recalculé.')) return;
    try {
      await post('/api/trophyrec/result', { action: 'delete', id: b.id, affiche_match_id: m.id });
      m.winner = null;
      await loadBouts();
      render();
      $('t19Dlg').close();
      $('t19Status').textContent = 'Décision effacée pour le combat n°' + (m.match_number || '') + '.';
    } catch (err) {
      $('t19DlgMsg').textContent = err.message;
    }
  }

  /* ───────── Export ───────── */
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function exportCsv() {
    if (!loaded) return;
    var head = ['Prénom', 'Nom', 'Club', 'Discipline', 'Sexe', 'Catégorie', 'Niveau', 'E-mail', 'Téléphone', 'Date inscription'];
    var rows = data.registrations.map(function (r) {
      return [r.prenom, r.nom, r.club, r.discipline, r.sexe, r.categoriePoids, r.niveau, r.email, r.telephone, r.dateInscription].map(csvCell).join(';');
    });
    var blob = new Blob(['﻿' + head.map(csvCell).join(';') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'boxingtrophy19_inscriptions_archive.csv';
    a.click();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('tab-t19')) return;
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-tab') === 't19' && !loaded) load();
      });
    });
    $('t19Search').addEventListener('input', function () { if (loaded) render(); });
    $('t19Export').addEventListener('click', exportCsv);
    $('t19Refresh').addEventListener('click', load);

    var tbody = $('t19Matches');
    tbody.addEventListener('click', function (e) {
      var row = e.target.closest('.t19-row');
      if (row) openDecision(row.getAttribute('data-mid'));
    });
    tbody.addEventListener('keydown', function (e) {
      var row = e.target.closest('.t19-row');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDecision(row.getAttribute('data-mid')); }
    });
    document.querySelectorAll('input[name="t19Res"]').forEach(function (r) { r.addEventListener('change', updateMethodState); });
    $('t19DlgForm').addEventListener('submit', saveDecision);
    ['t19F1', 't19F2'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var sel = $(id);
        if (sel.value === '__new') { addExternal(sel); return; }
        sel.setAttribute('data-prev', sel.value);
        refreshCorners();
      });
    });
    $('t19DlgCancel').addEventListener('click', function () { $('t19Dlg').close(); });
    $('t19DlgDelete').addEventListener('click', deleteDecision);
  });
})();
