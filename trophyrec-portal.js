/* TrophyRec — portail /classement : champions, P4P, n°1 à la une, programme, résultats, clubs, recherche.
   S'appuie sur trophyrec.js (calculs) et trophyrec-public.js (outils, chargement, tableau par catégorie). */
(function () {
  'use strict';

  var TR = window.TrophyRec;
  var P = null;
  var S = {}; // etat calcule

  var CLUB_COLORS = {
    minimes: '#e8ab36', 'etats-unis': '#3f7bff', 'st-cyprien': '#e0443a', ramonville: '#5fd38a',
    portet: '#b77cf2', moteka: '#f2efe9', autre: '#8a7f78'
  };
  var CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffc570" d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z"/><rect x="5" y="19" width="14" height="2" rx="1" fill="#e8ab36"/></svg>';
  var SEXES = [['Homme', 'Hommes', '♂'], ['Femme', 'Femmes', '♀']];

  function $(id) { return document.getElementById(id); }
  function esc(v) { return P.esc(v); }
  function link(f) { return '/boxeur/' + encodeURIComponent((f && f.slug) || ''); }
  function nm(f) { return TR.displayName(f); }
  function wkg(s) { return String(s || '').replace(/^([+-]?\d+)\s*kg$/i, '$1 kg'); }
  function discShort(d) { return /pied/i.test(d || '') ? 'Pied-poing' : (/anglaise/i.test(d || '') ? 'Anglaise' : (d || '')); }
  function weightNum(s) { var m = /(\d+)/.exec(String(s || '')); var n = m ? +m[1] : 999; return /^\+/.test(String(s)) ? n + 0.5 : n; }
  function divShort(key) { var p = key.split('|'); return wkg(p[2]) + ' · ' + discShort(p[0]); }

  function clubShort(f) {
    var g = P.gymName(f);
    return g ? g.replace(/^Boxing Center\s+/i, 'BC ') : '';
  }
  function clubTag(f) {
    var g = clubShort(f);
    if (!g) return '';
    var c = CLUB_COLORS[(f && f.gym_id) || 'autre'] || CLUB_COLORS.autre;
    return '<span class="rx-club" style="--c:' + c + '">' + esc(g) + '</span>';
  }
  function photo(f, cls) {
    if (f && f.photo_url) return '<img class="rx-ph ' + (cls || '') + '" src="' + esc(f.photo_url) + '" alt="" loading="lazy" />';
    return '<span class="rx-ph ' + (cls || '') + '" aria-hidden="true">' + esc(P.initials(f).toUpperCase()) + '</span>';
  }
  function empty(text) { return '<p class="rx-empty">' + text + '</p>'; }

  /* ───────── Calculs ───────── */
  function cleanBoards(fighters, bouts) {
    var boards = TR.computeRankings(fighters, bouts);
    Object.keys(boards).forEach(function (k) {
      boards[k] = boards[k].filter(function (r) { return r.fighter.account_status !== 'ferme'; });
      boards[k].forEach(function (r, i) { r.rank = i + 1; });
      if (!boards[k].length) delete boards[k];
    });
    return boards;
  }

  function aggregate(boards, keyFilter) {
    var acc = {};
    Object.keys(boards).filter(keyFilter).forEach(function (k) {
      boards[k].forEach(function (r) {
        var id = r.fighter.id;
        if (!acc[id]) acc[id] = { fighter: r.fighter, w: 0, l: 0, d: 0, ko: 0, points: 0, lastWinAt: '', best: null };
        var a = acc[id];
        a.w += r.w; a.l += r.l; a.d += r.d; a.ko += r.ko; a.points += r.points;
        if (String(r.lastWinAt) > String(a.lastWinAt)) a.lastWinAt = r.lastWinAt;
        if (!a.best || r.rank < a.best.rank) a.best = { key: k, rank: r.rank };
      });
    });
    var rows = P.sortRows(Object.keys(acc).map(function (id) { return acc[id]; }));
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  function bySex(sexe) { return function (k) { return k.split('|')[1] === sexe; }; }
  function all() { return true; }

  function trendOf(row, prevRows) {
    if (!prevRows) return { cls: 'same', txt: '=' };
    var prev = prevRows.find(function (r) { return r.fighter.id === row.fighter.id; });
    if (!prev) return { cls: 'new', txt: 'NEW' };
    if (prev.rank > row.rank) return { cls: 'up', txt: '▲' };
    if (prev.rank < row.rank) return { cls: 'down', txt: '▼' };
    return { cls: 'same', txt: '=' };
  }

  function outcomeFor(b, fid) {
    if (b.result === 'draw') return 'N';
    if (b.result === 'nc') return 'NC';
    return (b.result === 'a_win') === (b.fighter_a === fid) ? 'V' : 'D';
  }

  function compute(data) {
    var byId = {};
    data.fighters.forEach(function (f) { byId[f.id] = f; });
    var valid = data.bouts.filter(function (b) { return byId[b.fighter_a] && byId[b.fighter_b]; });
    var boards = cleanBoards(data.fighters, valid);
    var dates = valid.map(P.boutDate).filter(Boolean).sort();
    var last = dates[dates.length - 1] || '';
    var prevBouts = valid.filter(function (b) { return P.boutDate(b) && P.boutDate(b) < last; });
    var prevBoards = prevBouts.length ? cleanBoards(data.fighters, prevBouts) : null;
    var sorted = valid.slice().sort(function (x, y) {
      return P.boutDate(y).localeCompare(P.boutDate(x)) || String(y.created_at || '').localeCompare(String(x.created_at || ''));
    });
    S = {
      data: data, byId: byId, valid: valid, sorted: sorted, boards: boards, prevBoards: prevBoards,
      keys: Object.keys(boards).sort(function (a, b) {
        var pa = a.split('|'), pb = b.split('|');
        var sx = function (s) { return s === 'Homme' ? 0 : s === 'Femme' ? 1 : 2; };
        return sx(pa[1]) - sx(pb[1]) || pa[0].localeCompare(pb[0]) || weightNum(pa[2]) - weightNum(pb[2]);
      })
    };
    S.p4p = {};
    S.p4pPrev = {};
    SEXES.forEach(function (s) {
      S.p4p[s[0]] = aggregate(boards, bySex(s[0]));
      S.p4pPrev[s[0]] = prevBoards ? aggregate(prevBoards, bySex(s[0])) : null;
    });
    S.overall = aggregate(boards, all);
  }

  /* ───────── Badges résultat ───────── */
  var CODES = { ko: 'KO', tko: 'TKO', decision: 'DEC', abandon: 'ABD', dq: 'DQ', forfeit: 'FFT' };
  function resBadge(b) {
    if (b.result === 'draw') return '<span class="rx-res nul" title="Match nul">NUL</span>';
    if (b.result === 'nc') return '<span class="rx-res nc" title="Sans décision">S.D.</span>';
    var code = CODES[b.method] || 'V';
    var ko = b.method === 'ko' || b.method === 'tko';
    return '<span class="rx-res' + (ko ? ' ko' : '') + '" title="Victoire, ' + esc(TR.methodLabel(b.method)) + '">V-' + code + '</span>';
  }
  function fighterCell(f, cls, rank) {
    if (!f) return '<div class="' + cls + '"><span class="nm">À venir</span></div>';
    var label = (rank ? '<em>#' + rank + '</em>' : '') + esc(nm(f));
    var inner = f.slug ? '<a href="' + link(f) + '">' + label + '</a>' : '<span class="nm">' + label + '</span>';
    return '<div class="' + cls + '">' + inner + (clubShort(f) ? '<small>' + clubTag(f) + '</small>' : '') + '</div>';
  }
  function resultRow(b) {
    var a = S.byId[b.fighter_a], c = S.byId[b.fighter_b];
    var left = a, right = c, loseRight = false;
    if (b.result === 'b_win') { left = c; right = a; }
    if (b.result === 'a_win' || b.result === 'b_win') loseRight = true;
    var meta = [divShort(TR.divisionKey(b)), b.round ? 'R' + b.round : '', P.fmtDate(P.boutDate(b))].filter(Boolean).join(' · ');
    return '<li><div class="rx-bout">' + fighterCell(left, 'a') + resBadge(b) + fighterCell(right, 'b' + (loseRight ? ' lose' : '')) + '</div>' +
      '<p class="rx-meta">' + esc(meta) + '</p></li>';
  }

  /* ───────── Accueil ───────── */
  function renderChamps() {
    var el = $('rxChamps');
    if (!S.keys.length) { el.innerHTML = empty('Les premiers champions seront couronnés le 12 décembre au garage Moteka.'); return; }
    var html = '';
    SEXES.forEach(function (s) {
      var keys = S.keys.filter(bySex(s[0]));
      if (!keys.length) return;
      html += '<p class="rx-sex">' + s[1] + '</p><ul class="rx-champs">' + keys.map(function (k) {
        var c = S.boards[k][0];
        var p = k.split('|');
        return '<li><a href="' + link(c.fighter) + '">' + photo(c.fighter, 'gold') +
          '<span><span class="rx-cdiv">' + esc(wkg(p[2])) + ' <em>' + esc(discShort(p[0])) + '</em></span>' +
          '<span class="rx-cn">' + esc(nm(c.fighter)) + clubTag(c.fighter) + '</span></span></a></li>';
      }).join('') + '</ul>';
    });
    el.innerHTML = html;
  }

  function p4pList(sexe, limit) {
    var rows = S.p4p[sexe].slice(0, limit);
    if (!rows.length) return empty('Pas encore de classement.');
    return '<ol>' + rows.map(function (r) {
      var t = trendOf(r, S.p4pPrev[sexe]);
      return '<li><a href="' + link(r.fighter) + '">' +
        '<span class="rx-rk">' + (r.rank === 1 ? CROWN : r.rank) + '</span>' +
        '<span class="rx-tr ' + t.cls + '" title="Évolution depuis le dernier gala">' + t.txt + '</span>' +
        photo(r.fighter, r.rank === 1 ? 'gold' : '') +
        '<span><b>' + esc(nm(r.fighter)) + '</b>' + clubTag(r.fighter) + '</span></a></li>';
    }).join('') + '</ol>';
  }

  function renderP4P() {
    var el = $('rxP4P');
    if (!S.overall.length) { el.style.display = 'block'; el.innerHTML = empty('Le P4P se remplit avec les premiers résultats officiels.'); return; }
    el.innerHTML = SEXES.map(function (s) {
      return '<div><p class="rx-p4p-h"><i>' + s[2] + '</i>' + s[1] + '</p>' + p4pList(s[0], 5) + '</div>';
    }).join('');
  }

  function renderStar() {
    var el = $('rxStar');
    var top = S.overall[0];
    if (!top) { el.hidden = true; return; }
    var f = top.fighter;
    var sub = [top.best ? 'N°' + top.best.rank + ' en ' + divShort(top.best.key) : '', clubShort(f)].filter(Boolean).join(' · ');
    el.innerHTML = '<p class="rx-star-t">' + CROWN + esc(nm(f)) + '</p>' +
      '<a class="rx-star-ph" href="' + link(f) + '">' + (f.photo_url ? '<img src="' + esc(f.photo_url) + '" alt="' + esc(nm(f)) + '" />' : '<span class="tr-gold">' + esc(P.initials(f).toUpperCase()) + '</span>') + '</a>' +
      '<p class="rx-star-name">N°1 toutes catégories</p><p class="rx-star-sub">' + esc(sub) + '</p>' +
      '<div class="rx-star-stats"><div class="w"><b>' + top.w + '</b><span>Victoires</span></div><div class="l"><b>' + top.l + '</b><span>Défaites</span></div>' +
      '<div><b>' + top.ko + '</b><span>KO</span></div><div><b class="tr-gold">' + top.points + '</b><span>Points</span></div></div>' +
      '<a class="rx-more" href="' + link(f) + '">Ouvrir sa fiche</a>';
    el.hidden = false;
  }

  function renderHot() {
    var box = $('rxHotBox');
    var list = [];
    S.overall.forEach(function (r) {
      var fid = r.fighter.id;
      var mine = S.sorted.filter(function (b) { return (b.fighter_a === fid || b.fighter_b === fid) && b.result !== 'nc'; });
      var n = 0;
      while (n < mine.length && outcomeFor(mine[n], fid) === 'V') n++;
      if (n >= 2) list.push({ r: r, n: n, form: mine.slice(0, 5).map(function (b) { return outcomeFor(b, fid); }) });
    });
    list.sort(function (a, b) { return b.n - a.n || a.r.rank - b.r.rank; });
    if (!list.length) { box.hidden = true; return; }
    $('rxHot').innerHTML = list.slice(0, 5).map(function (h) {
      var f = h.r.fighter;
      return '<li><a href="' + link(f) + '">' + photo(f) + '<span><b>' + esc(nm(f)) + '</b><small>' + h.n + ' victoires de suite</small></span>' +
        '<span class="tr-form">' + h.form.map(function (o) { return '<span class="' + o + '">' + o + '</span>'; }).join('') + '</span></a></li>';
    }).join('');
    box.hidden = false;
  }

  function renderResultsHome() {
    var el = $('rxResults');
    var rows = S.sorted.slice(0, 8);
    if (!rows.length) { el.innerHTML = empty('Aucun résultat pour l\'instant. Les premiers tombent le 12 décembre.'); return; }
    var html = '', day = '';
    rows.forEach(function (b) {
      var d = P.boutDate(b);
      if (d !== day) {
        if (day) html += '</ul>';
        day = d;
        html += '<p class="rx-day">' + esc(P.editionLabel(b.edition_id) || 'Gala') + ' · ' + esc(P.fmtDate(d)) + '</p><ul class="rx-bouts">';
      }
      html += resultRow(b);
    });
    el.innerHTML = html + '</ul>';
  }

  /* ───────── Programme ───────── */
  async function loadSchedule() {
    var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (local && /[?&]demo=1/.test(location.search)) {
      var f = S.data.fighters;
      return [[0, 4, 1], [6, 8, 2], [2, 5, 3], [9, 10, 4]].map(function (p) {
        var a = f[p[0]], b = f[p[1]];
        return { match_number: p[2], fighter1: Object.assign({ discipline: 'Boxe Anglaise', categoriePoids: p[2] === 2 ? '-60kg' : '-69kg' }, a), fighter2: b };
      });
    }
    if (!window.BT18PublishedMatches) return [];
    var res = await window.BT18PublishedMatches.loadPublishedMatches();
    if (!res || !res.published) return [];
    return (res.matches || []).filter(function (m) { return m && m.fighter1 && m.fighter2; });
  }

  function scheduleRow(m) {
    var a = S.byId[m.fighter1.id] || m.fighter1;
    var b = S.byId[m.fighter2.id] || m.fighter2;
    var src = m.fighter1;
    var key = [src.discipline || m.discipline || '', src.sexe || a.sexe || '', src.categoriePoids || m.categoriePoids || ''].join('|');
    function rankOf(f) {
      var board = S.boards[key];
      var row = board && board.find(function (r) { return r.fighter.id === f.id; });
      return row ? row.rank : 0;
    }
    var meta = [m.match_number ? 'Combat ' + m.match_number : '', src.categoriePoids ? wkg(src.categoriePoids) : '', discShort(src.discipline || m.discipline)].filter(Boolean).join(' · ');
    return '<li><div class="rx-bout">' + fighterCell(a, 'a', rankOf(a)) + '<span class="rx-vs">VS</span>' + fighterCell(b, 'b', rankOf(b)) + '</div>' +
      '<p class="rx-meta">' + esc(meta) + '</p></li>';
  }

  async function renderSchedule() {
    var list = [];
    try { list = await loadSchedule(); } catch (e) { list = []; }
    var head = '<p class="rx-day">Samedi 12 décembre · Garage Moteka</p>';
    if (!list.length) {
      var msg = empty('La carte du Trophy 20 sera publiée ici dès que les combats sont faits. <a href="/#licence" style="color:var(--g-gold-2)">Les inscriptions sont ouvertes</a>.');
      $('rxSchedule').innerHTML = head + msg;
      $('rxScheduleFull').innerHTML = head + msg;
      return;
    }
    $('rxSchedule').innerHTML = head + '<ul class="rx-bouts">' + list.slice(0, 6).map(scheduleRow).join('') + '</ul>';
    $('rxScheduleFull').innerHTML = head + '<ul class="rx-bouts">' + list.map(scheduleRow).join('') + '</ul>';
  }

  /* ───────── Vues complètes ───────── */
  function renderP4PFull() {
    $('rxP4PFull').innerHTML = SEXES.map(function (s) {
      var rows = S.p4p[s[0]];
      var body = rows.length ? '<div class="tr-table-wrap"><table class="tr-table"><thead><tr><th scope="col">#</th><th scope="col"></th><th scope="col">Combattant</th><th scope="col">Bilan</th><th scope="col" class="hide-m">KO</th><th scope="col" class="num">Pts</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var t = trendOf(r, S.p4pPrev[s[0]]);
          var f = r.fighter;
          return '<tr class="' + (r.rank <= 3 ? 'top3' : '') + '"><td class="tr-rank">' + r.rank + '</td><td><span class="rx-tr ' + t.cls + '">' + t.txt + '</span></td>' +
            '<td><a class="tr-who" href="' + link(f) + '">' + photo(f, r.rank === 1 ? 'gold' : '') + '<span><b>' + esc(nm(f)) + '</b><small>' + (r.best ? esc(divShort(r.best.key)) : '') + '</small></span></a></td>' +
            '<td>' + P.recHtml(r.w, r.l, r.d) + '</td><td class="hide-m tr-dim">' + r.ko + '</td><td class="num"><span class="tr-pts">' + r.points + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' : empty('Pas encore de classement.');
      return '<section class="rx-box"><h2 class="rx-h">' + s[2] + ' ' + s[1] + '</h2>' + body + '</section>';
    }).join('');
  }

  function renderChampsFull() {
    var el = $('rxChampsFull');
    if (!S.keys.length) { el.innerHTML = empty('Les premiers champions seront couronnés le 12 décembre au garage Moteka.'); return; }
    el.innerHTML = S.keys.map(function (k) {
      var b = S.boards[k], c = b[0], f = c.fighter, p = k.split('|');
      var q = new URLSearchParams({ discipline: p[0], sexe: p[1], poids: p[2] }).toString();
      return '<section class="rx-box"><p class="rx-cap2"><span>' + esc(p[1]) + ' · ' + esc(wkg(p[2])) + ' · ' + esc(discShort(p[0])) + '</span>' + CROWN + '</p>' +
        '<a class="rx-ctop" href="' + link(f) + '">' + photo(f, 'gold') + '<span><b>' + esc(nm(f)) + '</b>' + clubTag(f) + '<br>' + P.recHtml(c.w, c.l, c.d) + '</span></a>' +
        (b.length > 1 ? '<ol class="rx-contenders">' + b.slice(1, 4).map(function (r) {
          return '<li><span>#' + r.rank + '</span><a href="' + link(r.fighter) + '">' + esc(nm(r.fighter)) + '</a>' + P.recHtml(r.w, r.l, r.d) + '</li>';
        }).join('') + '</ol>' : '<p class="tr-note" style="margin-top:12px">Pas encore de challenger classé.</p>') +
        '<a class="rx-more" href="?' + esc(q) + '#classements">Classement complet</a></section>';
    }).join('');
  }

  function renderResultsFull() {
    var el = $('rxResultsFull');
    if (!S.sorted.length) { el.innerHTML = '<div class="rx-box">' + empty('Aucun résultat pour l\'instant. Les premiers tombent le 12 décembre.') + '</div>'; return; }
    var groups = [], idx = {};
    S.sorted.forEach(function (b) {
      var g = (b.edition_id || '') + '|' + P.boutDate(b);
      if (!(g in idx)) { idx[g] = groups.length; groups.push({ ed: b.edition_id, date: P.boutDate(b), bouts: [] }); }
      groups[idx[g]].bouts.push(b);
    });
    el.innerHTML = groups.map(function (g) {
      var ko = g.bouts.filter(function (b) { return b.method === 'ko' || b.method === 'tko'; }).length;
      return '<section class="rx-box rx-gala"><h2 class="rx-h">' + esc(P.editionLabel(g.ed) || 'Gala') + '</h2>' +
        '<p class="rx-sub">' + esc(P.fmtDate(g.date)) + ' · ' + g.bouts.length + ' combat' + (g.bouts.length > 1 ? 's' : '') + (ko ? ' · ' + ko + ' avant la limite' : '') + '</p>' +
        '<ul class="rx-bouts">' + g.bouts.map(resultRow).join('') + '</ul></section>';
    }).join('');
  }

  function renderClubs() {
    var el = $('rxClubs');
    var clubs = {};
    S.overall.forEach(function (r) {
      var f = r.fighter;
      var name = P.gymName(f) || 'Club non renseigné';
      if (!clubs[name]) clubs[name] = { name: name, gym: f.gym_id, n: 0, w: 0, l: 0, d: 0, ko: 0, points: 0, best: null };
      var c = clubs[name];
      c.n++; c.w += r.w; c.l += r.l; c.d += r.d; c.ko += r.ko; c.points += r.points;
      if (!c.best || r.points > c.best.points) c.best = r;
    });
    var rows = Object.keys(clubs).map(function (k) { return clubs[k]; })
      .sort(function (a, b) { return b.points - a.points || b.w - a.w || b.ko - a.ko; });
    if (!rows.length) { el.innerHTML = '<tr><td colspan="7">' + empty('Le classement des clubs démarre avec les premiers résultats.') + '</td></tr>'; return; }
    el.innerHTML = rows.map(function (c, i) {
      var color = CLUB_COLORS[c.gym || 'autre'] || CLUB_COLORS.autre;
      return '<tr class="' + (i < 3 ? 'top3' : '') + '"><td class="tr-rank">' + (i + 1) + '</td>' +
        '<td><span class="rx-club" style="--c:' + color + ';font-size:12px;color:var(--g-text)">' + esc(c.name) + '</span></td>' +
        '<td class="hide-m tr-dim">' + c.n + '</td><td>' + P.recHtml(c.w, c.l, c.d) + '</td><td class="hide-m tr-dim">' + c.ko + '</td>' +
        '<td class="hide-m">' + (c.best ? '<a class="tr-who" href="' + link(c.best.fighter) + '" style="min-width:0">' + photo(c.best.fighter) + '<span><b>' + esc(nm(c.best.fighter)) + '</b><small>' + c.best.points + ' pts</small></span></a>' : '') + '</td>' +
        '<td class="num"><span class="tr-pts">' + c.points + '</span></td></tr>';
    }).join('');
  }

  /* ───────── Recherche ───────── */
  function initSearch() {
    var input = $('rxSearch'), box = $('rxSuggest');
    var active = -1, items = [];
    var pool = S.data.fighters.filter(function (f) { return f.account_status !== 'ferme' && f.slug; });
    var rankOf = {};
    S.overall.forEach(function (r) { rankOf[r.fighter.id] = r; });

    function close() { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function paint() {
      var q = norm(input.value.trim());
      if (q.length < 2) { close(); return; }
      items = pool.filter(function (f) {
        return norm([f.alias, f.prenom, f.nom, P.gymName(f)].join(' ')).indexOf(q) >= 0;
      }).sort(function (a, b) {
        return ((rankOf[b.id] || {}).points || 0) - ((rankOf[a.id] || {}).points || 0);
      }).slice(0, 8);
      box.innerHTML = items.length ? items.map(function (f, i) {
        var r = rankOf[f.id];
        var sub = [r ? P.recHtml(r.w, r.l, r.d).replace(/<[^>]+>/g, '') : 'Pas encore de combat', clubShort(f)].filter(Boolean).join(' · ');
        return '<a role="option" href="' + link(f) + '" class="' + (i === active ? 'is-active' : '') + '">' + photo(f) + '<span><b>' + esc(nm(f)) + '</b><small>' + esc(sub) + '</small></span></a>';
      }).join('') : '<p>Personne à ce nom. Essaie un prénom ou un club.</p>';
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    input.addEventListener('input', function () { active = -1; paint(); });
    input.addEventListener('focus', paint);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        paint();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0 && items[active]) { location.href = link(items[active]); return; }
        if (items.length === 1) { location.href = link(items[0]); return; }
        var f = $('fSearch');
        if (f) { f.value = input.value; f.dispatchEvent(new Event('input')); }
        close();
        location.hash = '#classements';
      } else if (e.key === 'Escape') {
        close();
      }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.rx-search')) close(); });
  }

  /* ───────── Onglets ───────── */
  var VIEWS = ['accueil', 'classements', 'p4p', 'champions', 'programme', 'resultats', 'clubs'];
  function route(scroll) {
    var v = location.hash.replace('#', '');
    if (VIEWS.indexOf(v) < 0) {
      var qs = new URLSearchParams(location.search);
      v = (qs.get('discipline') || qs.get('sexe') || qs.get('poids')) ? 'classements' : 'accueil';
    }
    document.querySelectorAll('.rx-view').forEach(function (s) { s.hidden = s.getAttribute('data-v') !== v; });
    document.querySelectorAll('.rx-tabs a').forEach(function (a) {
      var on = a.getAttribute('data-view') === v;
      a.classList.toggle('is-on', on);
      if (on) { a.setAttribute('aria-current', 'page'); a.scrollIntoView({ block: 'nearest', inline: 'center' }); }
      else a.removeAttribute('aria-current');
    });
    if (scroll) {
      var top = document.querySelector('.rx-wrap').getBoundingClientRect().top + window.scrollY - 80;
      if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  async function init() {
    P = window.TRPublic;
    route(false);
    window.addEventListener('hashchange', function () { route(true); });
    var data;
    try {
      data = await P.loadAll();
    } catch (e) {
      var msg = empty('On n\'arrive pas à charger TrophyRec pour le moment. Réessaie dans quelques minutes.');
      ['rxChamps', 'rxP4P', 'rxResults', 'rxSchedule'].forEach(function (id) { $(id).innerHTML = msg; });
      P.renderClassement(null);
      return;
    }
    compute(data);
    renderChamps();
    renderP4P();
    renderStar();
    renderHot();
    renderResultsHome();
    renderP4PFull();
    renderChampsFull();
    renderResultsFull();
    renderClubs();
    initSearch();
    P.renderClassement(data);
    renderSchedule();
  }

  window.TRPortal = { init: init };
})();
