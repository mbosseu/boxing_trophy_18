/* TrophyRec — constantes, classements, slugs (navigateur + Node). */
(function (root) {
  'use strict';

  var GYMS = [
    { id: 'minimes', label: 'Boxing Center Minimes' },
    { id: 'etats-unis', label: 'Boxing Center Etats-Unis' },
    { id: 'st-cyprien', label: 'Boxing Center Saint-Cyprien' },
    { id: 'ramonville', label: 'Boxing Center Ramonville' },
    { id: 'portet', label: 'Boxing Center Portet' },
    { id: 'moteka', label: 'Moteka Fenouillet' },
    { id: 'autre', label: 'Autre club' }
  ];

  var STANCES = [
    { id: 'orthodoxe', label: 'Droitier (orthodoxe)' },
    { id: 'southpaw', label: 'Gaucher (southpaw)' }
  ];

  var METHODS = [
    { id: 'decision', label: 'Decision' },
    { id: 'ko', label: 'KO' },
    { id: 'tko', label: 'TKO' },
    { id: 'abandon', label: 'Abandon' },
    { id: 'dq', label: 'Disqualification' },
    { id: 'forfeit', label: 'Forfait' }
  ];

  var RESULTS = [
    { id: 'a_win', label: 'Victoire A' },
    { id: 'b_win', label: 'Victoire B' },
    { id: 'draw', label: 'Nul' },
    { id: 'nc', label: 'Sans decision' }
  ];

  var SEED_COACHES = [
    { name: 'Mehdi', gym_id: 'minimes' },
    { name: 'Pascal', gym_id: 'ramonville' },
    { name: 'Dadi', gym_id: 'st-cyprien' },
    { name: 'Valentin', gym_id: 'portet' },
    { name: 'Sebastien', gym_id: 'etats-unis' }
  ];

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }

  function gymLabel(id) {
    var g = GYMS.find(function (x) { return x.id === id; });
    return g ? g.label : (id || '—');
  }

  function methodLabel(id) {
    var m = METHODS.find(function (x) { return x.id === id; });
    return m ? m.label : (id || '—');
  }

  function stanceLabel(id) {
    var s = STANCES.find(function (x) { return x.id === id; });
    return s ? s.label : (id || '—');
  }

  function divisionKey(bout) {
    return [bout.discipline || '', bout.sexe || '', bout.categorie_poids || bout.categoriePoids || ''].join('|');
  }

  function divisionLabel(key) {
    var p = String(key || '').split('|');
    return [p[0], p[1], p[2]].filter(Boolean).join(' · ') || 'Division';
  }

  function winPoints(method) {
    if (method === 'ko' || method === 'tko') return 5;
    return 3;
  }

  function emptyRecord() {
    return { w: 0, l: 0, d: 0, ko: 0, points: 0, lastWinAt: '' };
  }

  function computeRankings(fighters, bouts) {
    var byId = {};
    (fighters || []).forEach(function (f) {
      byId[f.id] = {
        fighter: f,
        divisions: {}
      };
    });

    function rec(fid, div) {
      if (!byId[fid]) return null;
      if (!byId[fid].divisions[div]) byId[fid].divisions[div] = emptyRecord();
      return byId[fid].divisions[div];
    }

    (bouts || []).forEach(function (b) {
      if (!b || b.result === 'nc') return;
      var div = divisionKey(b);
      var a = rec(b.fighter_a, div);
      var bb = rec(b.fighter_b, div);
      if (!a || !bb) return;
      var when = b.bout_date || b.created_at || '';
      if (b.result === 'draw') {
        a.d += 1;
        bb.d += 1;
        a.points += 1;
        bb.points += 1;
        return;
      }
      var aWon = b.result === 'a_win';
      var winner = aWon ? a : bb;
      var loser = aWon ? bb : a;
      winner.w += 1;
      loser.l += 1;
      winner.points += winPoints(b.method);
      if (b.method === 'ko' || b.method === 'tko') winner.ko += 1;
      if (when && (!winner.lastWinAt || when > winner.lastWinAt)) winner.lastWinAt = when;
    });

    var boards = {};
    Object.keys(byId).forEach(function (fid) {
      var node = byId[fid];
      Object.keys(node.divisions).forEach(function (div) {
        var r = node.divisions[div];
        if (r.w + r.l + r.d === 0) return;
        if (!boards[div]) boards[div] = [];
        boards[div].push({
          fighter: node.fighter,
          w: r.w,
          l: r.l,
          d: r.d,
          ko: r.ko,
          points: r.points,
          lastWinAt: r.lastWinAt,
          record: r.w + '-' + r.l + '-' + r.d
        });
      });
    });

    Object.keys(boards).forEach(function (div) {
      boards[div].sort(function (x, y) {
        if (y.points !== x.points) return y.points - x.points;
        if (y.w !== x.w) return y.w - x.w;
        if (y.ko !== x.ko) return y.ko - x.ko;
        return String(y.lastWinAt).localeCompare(String(x.lastWinAt));
      });
      boards[div].forEach(function (row, i) {
        row.rank = i + 1;
      });
    });

    return boards;
  }

  function fighterBouts(fighterId, bouts, fighters) {
    var map = {};
    (fighters || []).forEach(function (f) { map[f.id] = f; });
    return (bouts || [])
      .filter(function (b) { return b.fighter_a === fighterId || b.fighter_b === fighterId; })
      .map(function (b) {
        var isA = b.fighter_a === fighterId;
        var oppId = isA ? b.fighter_b : b.fighter_a;
        var outcome = 'NC';
        if (b.result === 'draw') outcome = 'N';
        else if (b.result === 'a_win') outcome = isA ? 'V' : 'D';
        else if (b.result === 'b_win') outcome = isA ? 'D' : 'V';
        return {
          bout: b,
          opponent: map[oppId] || { nom: 'Inconnu', prenom: '' },
          outcome: outcome,
          method: methodLabel(b.method),
          division: divisionLabel(divisionKey(b))
        };
      });
  }

  function displayName(f) {
    if (!f) return 'Combattant';
    if (f.alias) return f.alias;
    return ((f.prenom || '') + ' ' + (f.nom || '')).trim() || 'Combattant';
  }

  var api = {
    GYMS: GYMS,
    STANCES: STANCES,
    METHODS: METHODS,
    RESULTS: RESULTS,
    SEED_COACHES: SEED_COACHES,
    slugify: slugify,
    gymLabel: gymLabel,
    methodLabel: methodLabel,
    stanceLabel: stanceLabel,
    divisionKey: divisionKey,
    divisionLabel: divisionLabel,
    computeRankings: computeRankings,
    fighterBouts: fighterBouts,
    displayName: displayName,
    winPoints: winPoints
  };

  root.TrophyRec = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
