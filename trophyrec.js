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

  // Decisions des juges (pas de KO au Trophy) : UD unanime, MD majoritaire, SD partagee.
  var METHODS = [
    { id: 'ud', label: 'Décision unanime', short: 'UD' },
    { id: 'md', label: 'Décision majoritaire', short: 'MD' },
    { id: 'sd', label: 'Décision partagée', short: 'SD' }
  ];
  // Anciennes saisies encore lisibles
  var LEGACY_METHODS = { decision: 'Décision', ko: 'KO', tko: 'TKO', abandon: 'Abandon', dq: 'Disqualification', forfeit: 'Forfait' };

  // Classement de categorie en echelle (regle du club) :
  //  - le mieux classe gagne : rien ne bouge ;
  //  - le moins bien classe gagne : il remonte d'une part de l'ecart (UD 60 %, MD 45 %, SD 30 %)
  //    et le perdant se place juste en dessous de lui.
  //    Ex. : le 10e bat le 2e a l'unanimite -> il passe 5e, le perdant 6e.
  //  - nul : le moins bien classe remonte un peu (20 % de l'ecart), sans passer devant l'autre.
  // Une cote (base 1000, facon Elo) sert au P4P toutes categories : battre plus fort rapporte plus.
  var LADDER_SHARE = { ud: 0.6, md: 0.45, sd: 0.3 };
  var DRAW_SHARE = 0.2;
  var START_RATING = 1000;
  var K = 48;
  var METHOD_WEIGHT = { ud: 1, md: 0.75, sd: 0.5 };
  var DRAW_WEIGHT = 0.5;

  var RESULTS = [
    { id: 'a_win', label: 'Victoire A' },
    { id: 'b_win', label: 'Victoire B' },
    { id: 'draw', label: 'Nul' },
    { id: 'nc', label: 'Sans décision' }
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
    return m ? m.label : (LEGACY_METHODS[id] || id || '—');
  }

  function methodShort(id) {
    var m = METHODS.find(function (x) { return x.id === id; });
    return m ? m.short : (id === 'decision' ? 'DEC' : String(id || '').toUpperCase());
  }

  function methodWeight(id) {
    return METHOD_WEIGHT[id] || 1;
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
    // Gain maximal possible face a un adversaire de meme niveau (pour l'affichage du bareme)
    return Math.round(K * 0.5 * methodWeight(method));
  }

  function expected(ra, rb) {
    return 1 / (1 + Math.pow(10, (rb - ra) / 400));
  }

  function emptyRecord() {
    return { w: 0, l: 0, d: 0, ud: 0, rating: START_RATING, lastWinAt: '' };
  }

  function boutTime(b) {
    return String((b && (b.bout_date || b.created_at)) || '') + '|' + String((b && b.created_at) || '');
  }

  function ladderShare(method) {
    return LADDER_SHARE[method] || LADDER_SHARE.ud;
  }

  function computeRankings(fighters, bouts) {
    var byId = {};
    (fighters || []).forEach(function (f) {
      byId[f.id] = { fighter: f, divisions: {} };
    });
    var ladders = {}; // division -> ids du 1er au dernier

    function rec(fid, div) {
      if (!byId[fid]) return null;
      if (!byId[fid].divisions[div]) byId[fid].divisions[div] = emptyRecord();
      return byId[fid].divisions[div];
    }

    function place(div, fid) {
      if (!ladders[div]) ladders[div] = [];
      if (ladders[div].indexOf(fid) < 0) ladders[div].push(fid); // nouveau : entre en bas
    }

    // Remonte « up » de « positions » places, sans jamais passer devant « limit »
    function moveUp(div, up, positions, limitId) {
      var L = ladders[div];
      var from = L.indexOf(up);
      var limit = L.indexOf(limitId);
      var to = Math.max(from - positions, limit);
      if (to >= from) return;
      L.splice(from, 1);
      L.splice(to, 0, up);
    }

    // L'ordre compte : les combats sont rejoues du plus ancien au plus recent
    var ordered = (bouts || []).filter(function (b) { return b && b.result !== 'nc'; })
      .slice().sort(function (x, y) { return boutTime(x).localeCompare(boutTime(y)); });

    ordered.forEach(function (b) {
      var div = divisionKey(b);
      var a = rec(b.fighter_a, div);
      var bb = rec(b.fighter_b, div);
      if (!a || !bb) return;
      place(div, b.fighter_a);
      place(div, b.fighter_b);
      var L = ladders[div];
      var when = b.bout_date || b.created_at || '';
      var ea = expected(a.rating, bb.rating);

      if (b.result === 'draw') {
        var shift = K * (0.5 - ea) * DRAW_WEIGHT;
        a.rating += shift;
        bb.rating -= shift;
        a.d += 1;
        bb.d += 1;
        var lowD = L.indexOf(b.fighter_a) > L.indexOf(b.fighter_b) ? b.fighter_a : b.fighter_b;
        var highD = lowD === b.fighter_a ? b.fighter_b : b.fighter_a;
        var gapD = L.indexOf(lowD) - L.indexOf(highD);
        var stepD = Math.floor(gapD * DRAW_SHARE);
        if (stepD > 0) {
          var targetD = L[L.indexOf(highD) + 1];
          moveUp(div, lowD, stepD, targetD);
        }
        return;
      }

      var aWon = b.result === 'a_win';
      var winId = aWon ? b.fighter_a : b.fighter_b;
      var loseId = aWon ? b.fighter_b : b.fighter_a;
      var winner = aWon ? a : bb;
      var loser = aWon ? bb : a;
      var ew = aWon ? ea : 1 - ea;
      var gain = K * (1 - ew) * methodWeight(b.method);
      winner.rating += gain;
      loser.rating -= gain;
      winner.w += 1;
      loser.l += 1;
      if (b.method === 'ud') winner.ud += 1;
      if (when && (!winner.lastWinAt || when > winner.lastWinAt)) winner.lastWinAt = when;

      var wi = L.indexOf(winId);
      var li = L.indexOf(loseId);
      if (wi > li) {
        // Le moins bien classe gagne : il remonte d'une part de l'ecart (jamais au-dessus du perdant)
        // et le perdant se place juste en dessous de lui.
        var step = Math.max(1, Math.round((wi - li) * ladderShare(b.method)));
        var target = Math.max(wi - step, li);
        var rest = L.filter(function (id) { return id !== winId && id !== loseId; });
        rest.splice(target, 0, winId, loseId);
        ladders[div] = rest;
      }
    });

    var boards = {};
    Object.keys(ladders).forEach(function (div) {
      boards[div] = ladders[div].map(function (fid, i) {
        var r = byId[fid].divisions[div];
        return {
          fighter: byId[fid].fighter,
          rank: i + 1,
          w: r.w,
          l: r.l,
          d: r.d,
          ud: r.ud,
          ko: r.ud, // compatibilite : ancien champ « ko »
          rating: r.rating,
          points: Math.round(r.rating),
          lastWinAt: r.lastWinAt,
          record: r.w + '-' + r.l + '-' + r.d
        };
      });
    });
    return boards;
  }

  function compareRows(x, y) {
    if (y.rating !== x.rating) return y.rating - x.rating;
    if (y.w !== x.w) return y.w - x.w;
    if (y.ud !== x.ud) return y.ud - x.ud;
    return String(y.lastWinAt || '').localeCompare(String(x.lastWinAt || ''));
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
    methodShort: methodShort,
    methodWeight: methodWeight,
    compareRows: compareRows,
    START_RATING: START_RATING,
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
