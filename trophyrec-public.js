/* TrophyRec public : page classement et fiche combattant. */
(function () {
  'use strict';

  var TR = window.TrophyRec;

  /* ───────── Outils ───────── */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function initials(f) {
    var a = (f && (f.alias || ((f.prenom || '') + ' ' + (f.nom || '')))) || 'BC';
    var p = a.trim().split(/\s+/);
    return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || '') || 'BC';
  }
  function avatar(f, cls) {
    if (f && f.photo_url) {
      return '<img class="tr-av ' + (cls || '') + '" src="' + esc(f.photo_url) + '" alt="" loading="lazy" />';
    }
    return '<span class="tr-av ' + (cls || '') + '" aria-hidden="true">' + esc(initials(f).toUpperCase()) + '</span>';
  }
  function recHtml(w, l, d) {
    return '<span class="tr-rec" title="' + w + ' victoire(s), ' + l + ' défaite(s), ' + d + ' nul(s)">' +
      '<span class="w">' + w + '</span><i>-</i><span class="l">' + l + '</span><i>-</i><span class="d">' + d + '</span></span>';
  }
  function gymName(f) {
    if (!f) return '';
    if (f.gym_id === 'autre' && f.gym_other) return f.gym_other;
    return f.gym_id ? TR.gymLabel(f.gym_id) : '';
  }
  function coachName(id, coaches) {
    var c = (coaches || []).find(function (x) { return x.id === id; });
    return c ? c.name : '';
  }
  function boutDate(b) { return String((b && (b.bout_date || b.created_at)) || '').slice(0, 10); }
  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s + 'T12:00:00');
    if (isNaN(d)) return s;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function editionLabel(id) {
    var m = /^t(\d+)$/i.exec(String(id || ''));
    return m ? 'Trophy ' + m[1] : (id || '');
  }
  function methodTag(method) {
    if (method === 'ko' || method === 'tko') return '<span class="tr-tag ko">' + esc(TR.methodLabel(method)) + '</span>';
    return '<span class="tr-tag dec">' + esc(TR.methodLabel(method)) + '</span>';
  }
  function sortRows(rows) {
    return rows.sort(function (x, y) {
      if (y.points !== x.points) return y.points - x.points;
      if (y.w !== x.w) return y.w - x.w;
      if (y.ko !== x.ko) return y.ko - x.ko;
      return String(y.lastWinAt || '').localeCompare(String(x.lastWinAt || ''));
    });
  }

  /* ───────── Données ───────── */
  function demoData() {
    var names = [
      ['Yanis', 'Belkacem', 'Le Cobra', 'minimes', 'Homme'], ['Lucas', 'Martin', '', 'portet', 'Homme'],
      ['Samir', 'Haddad', 'Sniper', 'st-cyprien', 'Homme'], ['Hugo', 'Roux', '', 'ramonville', 'Homme'],
      ['Ilyes', 'Mansouri', 'Tornado', 'etats-unis', 'Homme'], ['Théo', 'Garcia', '', 'minimes', 'Homme'],
      ['Nora', 'Benali', 'La Lionne', 'portet', 'Femme'], ['Léa', 'Fabre', '', 'st-cyprien', 'Femme'],
      ['Inès', 'Moreau', '', 'ramonville', 'Femme'], ['Kevin', 'Diallo', 'K-Dynamite', 'moteka', 'Homme'],
      ['Adam', 'Petit', '', 'etats-unis', 'Homme'], ['Rayan', 'Lopez', '', 'portet', 'Homme']
    ];
    var fighters = names.map(function (n, i) {
      return { id: 'd' + i, slug: TR.slugify(n[0] + ' ' + n[1]), prenom: n[0], nom: n[1], alias: n[2] || null, gym_id: n[3], sexe: n[4], stance: i % 3 ? 'orthodoxe' : 'southpaw', height_cm: 165 + (i * 3) % 25, coach_id: null };
    });
    var plan = [
      [0, 1, 'a_win', 'ko', 'Boxe Anglaise', 'Homme', '-69kg', 1], [2, 3, 'a_win', 'decision', 'Boxe Anglaise', 'Homme', '-69kg', 3],
      [0, 2, 'a_win', 'decision', 'Boxe Anglaise', 'Homme', '-69kg', 3], [1, 3, 'draw', 'decision', 'Boxe Anglaise', 'Homme', '-69kg', 3],
      [5, 1, 'b_win', 'tko', 'Boxe Anglaise', 'Homme', '-69kg', 2], [5, 3, 'a_win', 'decision', 'Boxe Anglaise', 'Homme', '-69kg', 3],
      [4, 10, 'a_win', 'tko', 'Boxe Anglaise', 'Homme', '-75kg', 2], [9, 11, 'a_win', 'ko', 'Boxe Anglaise', 'Homme', '-75kg', 1],
      [4, 9, 'b_win', 'decision', 'Boxe Anglaise', 'Homme', '-75kg', 3], [10, 11, 'a_win', 'decision', 'Boxe Anglaise', 'Homme', '-75kg', 3],
      [6, 7, 'a_win', 'decision', 'Boxe Anglaise', 'Femme', '-60kg', 3], [7, 8, 'a_win', 'tko', 'Boxe Anglaise', 'Femme', '-60kg', 2],
      [6, 8, 'a_win', 'ko', 'Boxe Anglaise', 'Femme', '-60kg', 1], [9, 4, 'a_win', 'decision', 'Pied-Poing', 'Homme', '-75kg', 3],
      [11, 2, 'b_win', 'abandon', 'Pied-Poing', 'Homme', '-75kg', 2]
    ];
    var bouts = plan.map(function (p, i) {
      return { id: 'b' + i, edition_id: i < 8 ? 't19' : 't20', fighter_a: 'd' + p[0], fighter_b: 'd' + p[1], result: p[2], method: p[3], discipline: p[4], sexe: p[5], categorie_poids: p[6], round: p[7], bout_date: i < 8 ? '2026-05-16' : '2026-12-12' };
    });
    return { fighters: fighters, bouts: bouts, coaches: [] };
  }

  async function loadAll() {
    var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (local && /[?&]demo=1/.test(location.search)) return demoData();
    if (typeof supabaseClient === 'undefined' || !supabaseClient) throw new Error('Supabase indisponible');
    var res = await Promise.all([
      supabaseClient.from('trophyrec_fighters').select('id,slug,prenom,nom,alias,photo_url,height_cm,stance,gym_id,gym_other,coach_id,sexe'),
      supabaseClient.from('trophyrec_bouts').select('*'),
      supabaseClient.from('trophyrec_coaches').select('id,name,gym_id,active')
    ]);
    res.forEach(function (r) { if (r.error) throw r.error; });
    return { fighters: res[0].data || [], bouts: res[1].data || [], coaches: res[2].data || [] };
  }

  /* ───────── Classement ───────── */
  async function renderClassement() {
    var status = $('trStatus');
    var table = $('trTable');
    var empty = $('trEmpty');
    var skel = $('trSkeleton');

    function showEmpty(title, text) {
      skel.hidden = true; table.hidden = true; $('trPodium').hidden = true;
      $('trBoardTitle').textContent = title;
      empty.innerHTML = '<p class="tr-lead">' + text + '</p><div class="tr-actions" style="justify-content:center"><a class="tr-btn" href="/#licence">S\'inscrire au Trophy 20</a></div>';
      empty.hidden = false;
    }

    var data;
    try {
      data = await loadAll();
    } catch (e) {
      showEmpty('Classement indisponible', 'On n\'arrive pas à charger le classement pour le moment. Réessaie dans quelques minutes.');
      return;
    }

    var byId = {};
    data.fighters.forEach(function (f) { byId[f.id] = f; });
    var valid = data.bouts.filter(function (b) { return byId[b.fighter_a] && byId[b.fighter_b]; });
    var boards = TR.computeRankings(data.fighters, valid);
    var keys = Object.keys(boards).sort();

    // Chiffres du haut
    var ranked = {};
    keys.forEach(function (k) { boards[k].forEach(function (r) { ranked[r.fighter.id] = 1; }); });
    var counted = valid.filter(function (b) { return b.result !== 'nc'; });
    var stats = {
      fighters: Object.keys(ranked).length,
      bouts: counted.length,
      ko: counted.filter(function (b) { return (b.result === 'a_win' || b.result === 'b_win') && (b.method === 'ko' || b.method === 'tko'); }).length,
      divs: keys.length
    };
    document.querySelectorAll('#trStats [data-k]').forEach(function (el) { countUp(el, stats[el.getAttribute('data-k')] || 0); });

    renderFeed(counted, byId);
    renderGyms(counted, byId);

    if (!keys.length) {
      showEmpty('Le classement démarre au Trophy 20', 'Aucun combat officiel saisi pour l\'instant. Dès le premier résultat du 12 décembre, le tableau se remplit tout seul.');
      return;
    }

    var parts = keys.map(function (k) { return k.split('|'); });
    var params = new URLSearchParams(location.search);
    var state = {
      d: params.get('discipline') || '',
      s: params.get('sexe') || '',
      p: params.get('poids') || '',
      q: '',
      sort: 'points',
      asc: false
    };

    function uniq(arr) { return arr.filter(function (v, i, a) { return v && a.indexOf(v) === i; }); }
    function options(idx, filterFn) { return uniq(parts.filter(filterFn).map(function (a) { return a[idx]; })); }

    function chips(el, list, allLabel, current, onPick) {
      el.innerHTML = [''].concat(list).map(function (v) {
        return '<button type="button" class="tr-chip' + (v === current ? ' is-on' : '') + '" data-v="' + esc(v) + '" aria-pressed="' + (v === current) + '">' + esc(v || allLabel) + '</button>';
      }).join('');
      el.onclick = function (e) {
        var b = e.target.closest('.tr-chip');
        if (b) onPick(b.getAttribute('data-v'));
      };
    }

    function paintChips() {
      var dList = options(0, function () { return true; });
      if (state.d && dList.indexOf(state.d) < 0) state.d = '';
      var sList = options(1, function (a) { return !state.d || a[0] === state.d; });
      if (state.s && sList.indexOf(state.s) < 0) state.s = '';
      var pList = options(2, function (a) { return (!state.d || a[0] === state.d) && (!state.s || a[1] === state.s); });
      if (state.p && pList.indexOf(state.p) < 0) state.p = '';
      chips($('fDiscipline'), dList, 'Toutes', state.d, function (v) { state.d = v; state.p = ''; update(); });
      chips($('fSexe'), sList, 'Tous', state.s, function (v) { state.s = v; state.p = ''; update(); });
      chips($('fPoids'), pList, 'Toutes · P4P', state.p, function (v) { state.p = v; update(); });
    }

    function matchingKeys() {
      return keys.filter(function (k) {
        var a = k.split('|');
        return (!state.d || a[0] === state.d) && (!state.s || a[1] === state.s) && (!state.p || a[2] === state.p);
      });
    }

    function formFor(fid, keySet) {
      return valid
        .filter(function (b) { return (b.fighter_a === fid || b.fighter_b === fid) && keySet[TR.divisionKey(b)]; })
        .sort(function (x, y) { return boutDate(y).localeCompare(boutDate(x)); })
        .slice(0, 5)
        .map(function (b) {
          var isA = b.fighter_a === fid;
          if (b.result === 'draw') return 'N';
          if (b.result === 'nc') return 'NC';
          return (b.result === 'a_win') === isA ? 'V' : 'D';
        });
    }

    function buildRows(mk) {
      var keySet = {};
      mk.forEach(function (k) { keySet[k] = 1; });
      var rows;
      if (mk.length === 1) {
        rows = boards[mk[0]].map(function (r) { return Object.assign({}, r); });
      } else {
        var acc = {};
        mk.forEach(function (k) {
          boards[k].forEach(function (r) {
            var id = r.fighter.id;
            if (!acc[id]) acc[id] = { fighter: r.fighter, w: 0, l: 0, d: 0, ko: 0, points: 0, lastWinAt: '' };
            var a = acc[id];
            a.w += r.w; a.l += r.l; a.d += r.d; a.ko += r.ko; a.points += r.points;
            if (String(r.lastWinAt) > String(a.lastWinAt)) a.lastWinAt = r.lastWinAt;
          });
        });
        rows = sortRows(Object.keys(acc).map(function (id) { return acc[id]; }));
        rows.forEach(function (r, i) { r.rank = i + 1; });
      }
      rows.forEach(function (r) {
        r.koPct = r.w ? Math.round((r.ko / r.w) * 100) : 0;
        r.form = formFor(r.fighter.id, keySet);
        r.gym = gymName(r.fighter);
        r.coach = coachName(r.fighter.coach_id, data.coaches);
      });
      return rows;
    }

    function update() {
      paintChips();
      var mk = matchingKeys();
      var rows = buildRows(mk);
      var single = mk.length === 1;
      $('trBoardKicker').textContent = single ? 'Classement de la catégorie' : 'Pound for pound';
      $('trBoardTitle').textContent = single ? TR.divisionLabel(mk[0]) : [state.d || 'Toutes disciplines', state.s].filter(Boolean).join(' · ');

      // Podium
      var pod = $('trPodium');
      var top = rows.slice(0, 3);
      if (!state.q && top.length === 3) {
        pod.innerHTML = top.map(function (r, i) {
          var f = r.fighter;
          return '<a class="tr-pod p' + (i + 1) + '" href="/boxeur/' + encodeURIComponent(f.slug) + '">' +
            '<span class="tr-pod-rank">' + r.rank + '</span>' + avatar(f, i ? 'alt' : '') +
            '<span class="tr-pod-name">' + esc(TR.displayName(f)) + '</span>' +
            '<span class="tr-pod-gym">' + esc(r.gym || 'Club non renseigné') + '</span>' +
            '<span class="tr-pod-rec">' + recHtml(r.w, r.l, r.d) + '</span>' +
            '<span class="tr-pod-pts">' + r.points + ' pts' + (r.ko ? ' · ' + r.ko + ' KO' : '') + '</span></a>';
        }).join('');
        pod.hidden = false;
      } else {
        pod.hidden = true;
      }

      // Recherche + tri
      var q = state.q.trim().toLowerCase();
      var list = rows.filter(function (r) {
        if (!q) return true;
        var f = r.fighter;
        return [f.alias, f.prenom, f.nom, r.gym, r.coach].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      if (state.sort !== 'points' || state.asc) {
        list.sort(function (x, y) {
          var v;
          if (state.sort === 'record') v = (y.w - x.w) || (x.l - y.l) || (y.d - x.d);
          else if (state.sort === 'koPct') v = (y.koPct - x.koPct) || (y.ko - x.ko);
          else v = x.rank - y.rank;
          return state.asc ? -v : v;
        });
      }

      skel.hidden = true;
      var tb = table.querySelector('tbody');
      if (!list.length) {
        table.hidden = true;
        empty.innerHTML = '<p class="tr-lead" style="margin:0 auto">Personne ne correspond à « ' + esc(state.q) + ' » dans ce tableau.</p>';
        empty.hidden = false;
      } else {
        empty.hidden = true;
        tb.innerHTML = list.map(function (r) {
          var f = r.fighter;
          var real = f.alias ? [f.prenom, f.nom].filter(Boolean).join(' ') : '';
          var sub = [real, r.gym].filter(Boolean).join(' · ');
          return '<tr class="' + (r.rank <= 3 ? 'top3' : '') + '">' +
            '<td class="tr-rank">' + r.rank + '</td>' +
            '<td><a class="tr-who" href="/boxeur/' + encodeURIComponent(f.slug) + '">' + avatar(f, r.rank === 1 ? '' : 'alt') +
            '<span><b>' + esc(TR.displayName(f)) + '</b><small>' + esc(sub || '—') + '</small></span></a></td>' +
            '<td class="hide-m tr-dim">' + esc(r.gym || '—') + (r.coach ? '<br><small style="color:var(--g-muted)">Coach ' + esc(r.coach) + '</small>' : '') + '</td>' +
            '<td>' + recHtml(r.w, r.l, r.d) + '</td>' +
            '<td class="hide-m"><span class="tr-bar" aria-hidden="true"><i style="width:' + r.koPct + '%"></i></span> <span class="tr-dim">' + r.koPct + '%</span></td>' +
            '<td class="hide-m"><span class="tr-form">' + r.form.map(function (o) { return '<span class="' + o + '" title="' + ({ V: 'Victoire', D: 'Défaite', N: 'Nul', NC: 'Sans décision' })[o] + '">' + o + '</span>'; }).join('') + '</span></td>' +
            '<td class="num"><span class="tr-pts">' + r.points + '</span></td></tr>';
        }).join('');
        table.hidden = false;
      }
      status.textContent = rows.length + ' combattant' + (rows.length > 1 ? 's' : '') + ' classé' + (rows.length > 1 ? 's' : '');

      // URL partageable
      var p = new URLSearchParams();
      if (state.d) p.set('discipline', state.d);
      if (state.s) p.set('sexe', state.s);
      if (state.p) p.set('poids', state.p);
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + (/[?&]demo=1/.test(location.search) ? (qs ? '&' : '?') + 'demo=1' : ''));
    }

    table.querySelectorAll('th button[data-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-sort');
        if (state.sort === k) state.asc = !state.asc;
        else { state.sort = k; state.asc = false; }
        table.querySelectorAll('th button').forEach(function (b) { b.classList.remove('is-sort', 'asc'); });
        btn.classList.add('is-sort');
        if (state.asc) btn.classList.add('asc');
        update();
      });
    });
    var t;
    $('fSearch').addEventListener('input', function (e) {
      clearTimeout(t);
      t = setTimeout(function () { state.q = e.target.value; update(); }, 120);
    });

    update();
  }

  function countUp(el, to) {
    if (!to || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to; return; }
    setTimeout(function () { el.textContent = to; }, 1100);
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / 900);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  function link(f) {
    return '<a href="/boxeur/' + encodeURIComponent(f.slug || '') + '">' + esc(TR.displayName(f)) + '</a>';
  }

  function renderFeed(bouts, byId) {
    var el = $('trFeed');
    if (!el) return;
    var last = bouts.slice().sort(function (x, y) { return boutDate(y).localeCompare(boutDate(x)); }).slice(0, 6);
    if (!last.length) return;
    el.innerHTML = last.map(function (b) {
      var a = byId[b.fighter_a], c = byId[b.fighter_b];
      var line, tag;
      if (b.result === 'draw') {
        line = link(a) + ' et ' + link(c) + ' se quittent sur un nul';
        tag = '<span class="tr-tag nul">Nul</span>';
      } else {
        var win = b.result === 'a_win' ? a : c;
        var los = b.result === 'a_win' ? c : a;
        line = link(win) + ' bat ' + link(los);
        tag = methodTag(b.method);
      }
      var info = [b.categorie_poids, b.round ? 'R' + b.round : '', fmtDate(boutDate(b))].filter(Boolean).join(' · ');
      return '<li>' + tag + ' ' + line + '<small>' + esc(info) + '</small></li>';
    }).join('');
  }

  function renderGyms(bouts, byId) {
    var el = $('trGyms');
    if (!el) return;
    var wins = {};
    bouts.forEach(function (b) {
      if (b.result !== 'a_win' && b.result !== 'b_win') return;
      var f = byId[b.result === 'a_win' ? b.fighter_a : b.fighter_b];
      var g = gymName(f) || 'Club non renseigné';
      wins[g] = (wins[g] || 0) + 1;
    });
    var list = Object.keys(wins).map(function (g) { return [g, wins[g]]; }).sort(function (x, y) { return y[1] - x[1]; });
    if (!list.length) return;
    var max = list[0][1];
    el.innerHTML = list.map(function (g) {
      return '<li><span>' + esc(g[0].replace(/^Boxing Center /, 'BC ')) + '</span><b>' + g[1] + ' V</b><i style="--w:' + Math.round((g[1] / max) * 100) + '%"></i></li>';
    }).join('');
  }

  /* ───────── Fiche combattant ───────── */
  async function renderBoxeur() {
    var status = $('trStatus');
    var fiche = $('trFiche');
    var parts = location.pathname.split('/').filter(Boolean);
    var slug = decodeURIComponent(parts[parts.length - 1] || '');
    if (!slug || slug === 'boxeur' || slug === 'boxeur.html') slug = new URLSearchParams(location.search).get('slug') || '';

    function fail(text) {
      status.innerHTML = '<div class="tr-empty"><h1 class="tr-h2">Fiche introuvable</h1><p class="tr-lead">' + text + '</p><div class="tr-actions" style="justify-content:center"><a class="tr-btn" href="/classement">Voir le classement</a></div></div>';
    }
    if (!slug) return fail('Cette adresse ne correspond à aucun combattant.');

    var data;
    try { data = await loadAll(); } catch (e) { return fail('On n\'arrive pas à charger la fiche pour le moment. Réessaie dans quelques minutes.'); }

    var f = data.fighters.find(function (x) { return x.slug === slug; });
    if (!f) return fail('Aucun combattant enregistré sous cette adresse.');

    var byId = {};
    data.fighters.forEach(function (x) { byId[x.id] = x; });
    var valid = data.bouts.filter(function (b) { return byId[b.fighter_a] && byId[b.fighter_b]; });
    var history = TR.fighterBouts(f.id, valid, data.fighters)
      .sort(function (x, y) { return boutDate(y.bout).localeCompare(boutDate(x.bout)); });
    var boards = TR.computeRankings(data.fighters, valid);

    var rec = { w: 0, l: 0, d: 0, ko: 0 };
    history.forEach(function (h) {
      if (h.outcome === 'V') { rec.w += 1; if (h.bout.method === 'ko' || h.bout.method === 'tko') rec.ko += 1; }
      else if (h.outcome === 'D') rec.l += 1;
      else if (h.outcome === 'N') rec.d += 1;
    });
    var points = 0;
    var divs = [];
    Object.keys(boards).forEach(function (k) {
      var row = boards[k].find(function (r) { return r.fighter.id === f.id; });
      if (row) { points += row.points; divs.push({ key: k, rank: row.rank, size: boards[k].length, row: row }); }
    });
    divs.sort(function (x, y) { return x.rank - y.rank; });

    var streak = '';
    var counted = history.filter(function (h) { return h.outcome !== 'NC'; });
    if (counted.length) {
      var first = counted[0].outcome, n = 0;
      while (n < counted.length && counted[n].outcome === first) n++;
      streak = n + ' ' + ({ V: 'victoire', D: 'défaite', N: 'nul' })[first] + (n > 1 ? 's' : '');
    }

    function overall(fid) {
      var r = { w: 0, l: 0, d: 0 };
      valid.forEach(function (b) {
        if (b.fighter_a !== fid && b.fighter_b !== fid) return;
        if (b.result === 'draw') r.d++;
        else if (b.result === 'a_win') { if (b.fighter_a === fid) r.w++; else r.l++; }
        else if (b.result === 'b_win') { if (b.fighter_b === fid) r.w++; else r.l++; }
      });
      return r;
    }

    var name = TR.displayName(f);
    var real = [f.prenom, f.nom].filter(Boolean).join(' ');
    var gym = gymName(f);
    var coach = coachName(f.coach_id, data.coaches);
    document.title = name + ' — Fiche TrophyRec';
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', name + ' : bilan ' + rec.w + '-' + rec.l + '-' + rec.d + (gym ? ', ' + gym : '') + '. Fiche officielle du Boxing Trophy.');

    var pills = [
      gym ? ['Salle', gym] : null,
      coach ? ['Coach', coach] : null,
      f.stance ? ['Garde', TR.stanceLabel(f.stance)] : null,
      f.height_cm ? ['Taille', f.height_cm + ' cm'] : null,
      f.sexe ? ['Tableau', f.sexe] : null
    ].filter(Boolean);

    var best = divs[0];
    var html = '';
    html += '<section class="tr-panel tr-fiche-hero tr-in" data-num="' + (best ? '#' + best.rank : '') + '">' +
      '<div class="tr-portrait">' + (f.photo_url ? '<img src="' + esc(f.photo_url) + '" alt="' + esc(name) + '" />' : '<span class="tr-gold">' + esc(initials(f).toUpperCase()) + '</span>') + '</div>' +
      '<div><p class="tr-cap">' + (best ? 'N°' + best.rank + ' · ' + esc(TR.divisionLabel(best.key)) : 'Fiche combattant') + '</p>' +
      '<h1 class="tr-fiche-name">' + esc(name) + '</h1>' +
      (f.alias && real ? '<p class="tr-fiche-real">' + esc(real) + '</p>' : '') +
      '<div class="tr-pills">' + pills.map(function (p) { return '<span class="tr-pill"><b>' + esc(p[0]) + '</b>' + esc(p[1]) + '</span>'; }).join('') + '</div></div>' +
      '<div class="tr-bigrec"><div class="w"><b>' + rec.w + '</b><span>Victoires</span></div><div class="l"><b>' + rec.l + '</b><span>Défaites</span></div><div class="d"><b>' + rec.d + '</b><span>Nuls</span></div></div>' +
      '</section>';

    html += '<div class="tr-kpis tr-in d1">' +
      '<div class="tr-stat"><b>' + points + '</b><span>Points TrophyRec</span></div>' +
      '<div class="tr-stat"><b>' + rec.ko + (rec.w ? ' <small style="font-size:.5em;color:var(--g-muted)">' + Math.round(rec.ko / rec.w * 100) + '%</small>' : '') + '</b><span>Victoires par KO</span></div>' +
      '<div class="tr-stat"><b>' + counted.length + '</b><span>Combats officiels</span></div>' +
      '<div class="tr-stat"><b>' + esc(streak || '—') + '</b><span>Série en cours</span></div>' +
      '</div>';

    if (divs.length) {
      html += '<section class="tr-panel tr-in d2"><p class="tr-mono">Classements</p><h2 class="tr-h2">Ses catégories</h2><div class="tr-divs">' +
        divs.map(function (d) {
          var a = d.key.split('|');
          var q = new URLSearchParams({ discipline: a[0], sexe: a[1], poids: a[2] }).toString();
          return '<a class="tr-div" href="/classement?' + esc(q) + '"><b>#' + d.rank + '</b><span>' + esc(TR.divisionLabel(d.key)) + '<br><small style="color:var(--g-muted)">sur ' + d.size + ' · ' + d.row.points + ' pts</small></span></a>';
        }).join('') + '</div></section>';
    }

    html += '<section class="tr-panel tr-in d3"><p class="tr-mono">Palmarès</p><h2 class="tr-h2">Tous ses combats</h2>';
    if (!history.length) {
      html += '<p class="tr-lead" style="margin-top:12px">Pas encore de combat officiel. Rendez-vous le 12 décembre au garage Moteka.</p>';
    } else {
      html += '<div class="tr-table-wrap" style="margin-top:18px"><table class="tr-table"><thead><tr>' +
        '<th scope="col">Rés.</th><th scope="col">Adversaire</th><th scope="col">Méthode</th><th scope="col" class="hide-m">Catégorie</th><th scope="col" class="hide-m">Gala</th></tr></thead><tbody>' +
        history.map(function (h) {
          var o = h.opponent;
          var or = overall(o.id);
          var meth = h.outcome === 'N' ? 'Nul' : h.outcome === 'NC' ? 'Sans décision' : h.method;
          return '<tr><td><span class="tr-res ' + h.outcome + '">' + h.outcome + '</span></td>' +
            '<td>' + (o.slug ? '<a class="tr-who" href="/boxeur/' + encodeURIComponent(o.slug) + '">' : '<span class="tr-who">') + avatar(o, 'alt') +
            '<span><b>' + esc(TR.displayName(o)) + '</b><small>' + recHtml(or.w, or.l, or.d) + '</small></span>' + (o.slug ? '</a>' : '</span>') + '</td>' +
            '<td class="tr-dim">' + esc(meth) + (h.bout.round ? ' · R' + h.bout.round : '') + '</td>' +
            '<td class="hide-m tr-dim">' + esc(h.division) + '</td>' +
            '<td class="hide-m tr-dim">' + esc(editionLabel(h.bout.edition_id)) + '<br><small style="color:var(--g-muted)">' + esc(fmtDate(boutDate(h.bout))) + '</small></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '</section>';

    fiche.innerHTML = html;
    fiche.hidden = false;
    status.hidden = true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.querySelector('[data-page]');
    var kind = page ? page.getAttribute('data-page') : '';
    if (kind === 'classement') renderClassement();
    if (kind === 'boxeur') renderBoxeur();
  });
})();
