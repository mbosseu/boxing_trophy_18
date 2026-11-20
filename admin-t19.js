/* Back office — onglet Trophy 19 : archives en lecture seule (inscrits, carte des combats, vainqueurs). */
(function () {
  'use strict';

  var loaded = false;
  var data = { registrations: [], matches: [] };

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fullName(f) { return f ? ((f.prenom || '') + ' ' + (f.nom || '')).trim() || '—' : '—'; }

  async function load() {
    var status = $('t19Status');
    status.textContent = 'Chargement des archives…';
    try {
      var res = await fetch('/api/admin/sync?edition=t19', {
        cache: 'no-store',
        headers: { 'x-admin-password': sessionStorage.getItem('bt20_admin_pw') || '' }
      });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.error || 'Archives indisponibles');
      if (body.edition !== 't19') {
        status.textContent = 'Le classement par édition n\'est pas encore actif : passez le SQL « Trophy 19 / Trophy 20 » de schema.sql dans Supabase.';
        return;
      }
      data.registrations = body.registrations || [];
      data.matches = (body.matches || []).filter(function (m) { return m.fighter1 && m.fighter2; });
      loaded = true;
      render();
      status.textContent = '';
    } catch (e) {
      status.textContent = e.message;
    }
  }

  function render() {
    var regs = data.registrations.slice().sort(function (a, b) { return String(a.nom || '').localeCompare(String(b.nom || ''), 'fr'); });
    var matches = data.matches.slice().sort(function (a, b) { return (a.match_number || a.sort_order || 0) - (b.match_number || b.sort_order || 0); });
    var winners = matches.filter(function (m) { return m.winner === 'fighter1' || m.winner === 'fighter2'; }).length;
    var clubs = {};
    regs.forEach(function (r) { if (r.club) clubs[String(r.club).trim().toLowerCase()] = 1; });
    $('t19Stats').innerHTML = [
      ['Inscrits', regs.length, 'gold'], ['Combats', matches.length, 'blue'], ['Vainqueurs saisis', winners, 'green'], ['Clubs', Object.keys(clubs).length, 'red']
    ].map(function (c) {
      return '<div class="stat-card ' + c[2] + '"><div class="stat-value">' + c[1] + '</div><div class="stat-label">' + c[0] + '</div></div>';
    }).join('');

    $('t19Matches').innerHTML = matches.length ? matches.map(function (m) {
      var w1 = m.winner === 'fighter1', w2 = m.winner === 'fighter2';
      var side = function (f, win) {
        return '<td style="' + (win ? 'font-weight:700;color:var(--gold);' : '') + '">' + esc(fullName(f)) + (win ? ' <span class="badge badge-success">V</span>' : '') +
          '<div style="font-size:12px;color:var(--text-dim);">' + esc(f.club || '') + '</div></td>';
      };
      return '<tr><td>' + esc(m.match_number || '') + '</td>' + side(m.fighter1, w1) + '<td style="text-align:center;color:var(--text-dim);">VS</td>' + side(m.fighter2, w2) +
        '<td style="font-size:13px;">' + esc([m.discipline || m.fighter1.discipline, m.sexe || m.fighter1.sexe, m.categoriePoids || m.fighter1.categoriePoids].filter(Boolean).join(' · ')) + '</td></tr>';
    }).join('') : '<tr><td colspan="5" style="color:var(--text-dim)">Aucun combat archivé.</td></tr>';

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

  /* Vainqueurs du Trophy 19 -> resultats officiels TrophyRec (methode notee Decision, a corriger si KO). */
  var T19_DATE = '2026-11-13';
  async function importTrophyRec() {
    var status = $('t19Status');
    if (!loaded) { status.textContent = 'Chargez d\'abord les archives.'; return; }
    var withWinner = data.matches.filter(function (m) { return m.winner === 'fighter1' || m.winner === 'fighter2'; });
    if (!withWinner.length) { status.textContent = 'Aucun vainqueur saisi sur la carte du Trophy 19.'; return; }
    if (!confirm('Importer ' + withWinner.length + ' résultat(s) du Trophy 19 dans TrophyRec ?\n\nLa méthode sera notée « Décision » : corrigez ensuite les KO dans TrophyRec > Résultat officiel.\nVous pouvez relancer l\'import sans créer de doublons.')) return;
    var pw = sessionStorage.getItem('bt20_admin_pw') || '';
    async function post(path, body) {
      var r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': pw }, body: JSON.stringify(body) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
      return j;
    }
    var btn = $('t19Import');
    btn.disabled = true;
    try {
      status.textContent = 'Création des fiches combattants…';
      await post('/api/trophyrec/sync-fighters', {});
      var ok = 0, fails = [];
      for (var i = 0; i < withWinner.length; i++) {
        var m = withWinner[i], f1 = m.fighter1 || {}, f2 = m.fighter2 || {};
        status.textContent = 'Import des résultats… ' + (i + 1) + ' / ' + withWinner.length;
        try {
          await post('/api/trophyrec/result', {
            fighter_a: f1.id, fighter_b: f2.id,
            result: m.winner === 'fighter1' ? 'a_win' : 'b_win',
            method: 'decision',
            discipline: m.discipline || f1.discipline || null,
            sexe: m.sexe || f1.sexe || null,
            categorie_poids: m.categoriePoids || f1.categoriePoids || null,
            bout_date: T19_DATE,
            edition_id: 't19',
            source_match_id: 't19-' + (m.id != null ? m.id : (m.match_number || i))
          });
          ok++;
        } catch (e) {
          fails.push(fullName(f1) + ' vs ' + fullName(f2) + ' : ' + e.message);
        }
      }
      status.textContent = ok + ' résultat(s) importé(s) dans TrophyRec.' + (fails.length ? ' ' + fails.length + ' en échec : ' + fails.join(' | ') : ' Pensez à corriger les victoires par KO.');
    } catch (e) {
      status.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('tab-t19')) return;
    $('t19Import').addEventListener('click', importTrophyRec);
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-tab') === 't19' && !loaded) load();
      });
    });
    $('t19Search').addEventListener('input', function () { if (loaded) render(); });
    $('t19Export').addEventListener('click', exportCsv);
    $('t19Refresh').addEventListener('click', load);
  });
})();
