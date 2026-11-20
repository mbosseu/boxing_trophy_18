(function () {
  'use strict';

  async function loadAll() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      throw new Error('Supabase indisponible');
    }
    const [f, b, c] = await Promise.all([
      supabaseClient.from('trophyrec_fighters').select('id,slug,prenom,nom,alias,photo_url,height_cm,stance,gym_id,gym_other,coach_id,sexe'),
      supabaseClient.from('trophyrec_bouts').select('*'),
      supabaseClient.from('trophyrec_coaches').select('id,name,gym_id,active')
    ]);
    if (f.error) throw f.error;
    if (b.error) throw b.error;
    if (c.error) throw c.error;
    return { fighters: f.data || [], bouts: b.data || [], coaches: c.data || [] };
  }

  function coachName(id, coaches) {
    var c = (coaches || []).find(function (x) { return x.id === id; });
    return c ? c.name : '—';
  }

  function fillSelect(el, values, allLabel) {
    if (!el) return;
    el.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = allLabel;
    el.appendChild(o0);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
  }

  function unique(arr) {
    return arr.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  }

  async function renderClassement() {
    var status = document.getElementById('trStatus');
    var table = document.getElementById('trTable');
    try {
      var data = await loadAll();
      var boards = TrophyRec.computeRankings(data.fighters, data.bouts);
      var keys = Object.keys(boards).sort();
      if (!keys.length) {
        status.textContent = 'Aucun combat officiel pour le moment. Le classement apparait des que l organisation saisit un resultat.';
        return;
      }
      var disc = unique(keys.map(function (k) { return k.split('|')[0]; }));
      var sexes = unique(keys.map(function (k) { return k.split('|')[1]; }));
      var poids = unique(keys.map(function (k) { return k.split('|')[2]; }));
      fillSelect(document.getElementById('fDiscipline'), disc, 'Toutes disciplines');
      fillSelect(document.getElementById('fSexe'), sexes, 'Tous');
      fillSelect(document.getElementById('fPoids'), poids, 'Toutes categories');

      function paint() {
        var d = document.getElementById('fDiscipline').value;
        var s = document.getElementById('fSexe').value;
        var p = document.getElementById('fPoids').value;
        var pick = keys.find(function (k) {
          var a = k.split('|');
          if (d && a[0] !== d) return false;
          if (s && a[1] !== s) return false;
          if (p && a[2] !== p) return false;
          return true;
        }) || keys[0];
        var rows = boards[pick] || [];
        var tb = table.querySelector('tbody');
        tb.innerHTML = rows.map(function (r) {
          var f = r.fighter;
          var salle = f.gym_id === 'autre' && f.gym_other ? f.gym_other : TrophyRec.gymLabel(f.gym_id);
          return '<tr><td>' + r.rank + '</td><td><a href="/boxeur/' + encodeURIComponent(f.slug) + '">' +
            TrophyRec.displayName(f).replace(/</g, '') + '</a></td><td>' + String(salle || '—').replace(/</g, '') +
            '</td><td>' + coachName(f.coach_id, data.coaches).replace(/</g, '') +
            '</td><td>' + r.record + '</td><td>' + r.points + '</td></tr>';
        }).join('');
        table.hidden = false;
        status.textContent = TrophyRec.divisionLabel(pick) + ' — ' + rows.length + ' combattant(s).';
      }
      ['fDiscipline', 'fSexe', 'fPoids'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', paint);
      });
      paint();
    } catch (e) {
      status.textContent = 'Classement indisponible pour l instant (tables TrophyRec a creer dans Supabase).';
    }
  }

  async function renderBoxeur() {
    var status = document.getElementById('trStatus');
    var fiche = document.getElementById('trFiche');
    var parts = location.pathname.split('/').filter(Boolean);
    var slug = decodeURIComponent(parts[parts.length - 1] || '');
    if (!slug || slug === 'boxeur') {
      status.textContent = 'Combattant introuvable.';
      return;
    }
    try {
      var data = await loadAll();
      var f = data.fighters.find(function (x) { return x.slug === slug; });
      if (!f) {
        status.textContent = 'Aucune fiche pour cette adresse.';
        return;
      }
      document.title = TrophyRec.displayName(f) + ' — TrophyRec';
      var history = TrophyRec.fighterBouts(f.id, data.bouts, data.fighters);
      var salle = f.gym_id === 'autre' && f.gym_other ? f.gym_other : TrophyRec.gymLabel(f.gym_id);
      var rec = { w: 0, l: 0, d: 0 };
      history.forEach(function (h) {
        if (h.outcome === 'V') rec.w += 1;
        else if (h.outcome === 'D') rec.l += 1;
        else if (h.outcome === 'N') rec.d += 1;
      });
      fiche.innerHTML =
        '<div class="tr-hero">' +
        '<img class="tr-photo" alt="" src="' + (f.photo_url ? String(f.photo_url).replace(/"/g, '') : '/image/logo_boxing_center.png') + '" />' +
        '<div><h1 class="tr-h1">' + TrophyRec.displayName(f).replace(/</g, '') + '</h1>' +
        '<p class="tr-meta">' + [f.prenom, f.nom].filter(Boolean).join(' ').replace(/</g, '') + '</p>' +
        '<p class="tr-meta">Palmares ' + rec.w + '-' + rec.l + '-' + rec.d + '</p>' +
        '<p class="tr-meta">Salle : ' + String(salle || '—').replace(/</g, '') + '<br>Coach : ' +
        coachName(f.coach_id, data.coaches).replace(/</g, '') + '<br>Garde : ' +
        TrophyRec.stanceLabel(f.stance) + '<br>Taille : ' + (f.height_cm ? f.height_cm + ' cm' : '—') +
        '</p></div></div>' +
        '<div class="tr-card"><h2>Palmares</h2><ul class="tr-list">' +
        (history.length
          ? history.map(function (h) {
            return '<li><strong>' + h.outcome + '</strong> vs ' +
              TrophyRec.displayName(h.opponent).replace(/</g, '') +
              ' — ' + h.method + ' · ' + h.division + '</li>';
          }).join('')
          : '<li>Pas encore de combat officiel.</li>') +
        '</ul></div>';
      fiche.hidden = false;
      status.hidden = true;
    } catch (e) {
      status.textContent = 'Fiche indisponible.';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.querySelector('[data-page]');
    var kind = page ? page.getAttribute('data-page') : '';
    if (kind === 'classement') renderClassement();
    if (kind === 'boxeur') renderBoxeur();
  });
})();
