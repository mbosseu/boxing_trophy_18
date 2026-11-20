const assert = require('assert');
const TR = require('../trophyrec.js');

const DIV = { discipline: 'Boxe Anglaise', sexe: 'Homme', categorie_poids: '-69kg' };
const key = 'Boxe Anglaise|Homme|-69kg';
let day = 0;
function bout(a, b, result, method) {
  day += 1;
  return Object.assign({ fighter_a: a, fighter_b: b, result: result, method: method, bout_date: '2026-01-' + String(day).padStart(2, '0') }, DIV);
}

assert.strictEqual(TR.slugify('Jean Dupont'), 'jean-dupont');
assert.strictEqual(TR.methodShort('md'), 'MD');
assert.ok(TR.winPoints('ud') > TR.winPoints('md') && TR.winPoints('md') > TR.winPoints('sd'), 'UD > MD > SD');

// 1. Un nul ne bouge pas deux boxeurs de meme niveau, le bilan suit
let fighters = [{ id: 'a', prenom: 'Ada' }, { id: 'b', prenom: 'Ben' }, { id: 'c', prenom: 'Cam' }];
let boards = TR.computeRankings(fighters, [bout('a', 'b', 'a_win', 'ud'), bout('a', 'c', 'draw', null)]);
assert.strictEqual(boards[key][0].fighter.id, 'a');
assert.strictEqual(boards[key][0].record, '1-0-1');
assert.ok(boards[key][0].points > TR.START_RATING);

// 2. Unanime rapporte plus que majoritaire, plus que partagee
function gain(method) {
  const r = TR.computeRankings([{ id: 'x' }, { id: 'y' }], [bout('x', 'y', 'a_win', method)]);
  return r[key].find((row) => row.fighter.id === 'x').rating - TR.START_RATING;
}
assert.ok(gain('ud') > gain('md') && gain('md') > gain('sd'), 'UD > MD > SD en points gagnes');

// 3. Battre un mieux classe rapporte plus que battre un moins bien classe
fighters = [];
for (let i = 1; i <= 10; i++) fighters.push({ id: 'f' + i, prenom: 'F' + i });
day = 0;
const history = [];
// f1 > f2 > ... > f10 : chacun bat ceux qui sont en dessous
for (let i = 1; i <= 10; i++) {
  for (let j = i + 1; j <= 10; j++) history.push(bout('f' + i, 'f' + j, 'a_win', 'ud'));
}
const before = TR.computeRankings(fighters, history)[key];
assert.strictEqual(before[1].fighter.id, 'f2', 'f2 est 2e avant le combat');
assert.strictEqual(before[9].fighter.id, 'f10', 'f10 est 10e avant le combat');

// Exemple de la reunion : le 10e bat le 2e. Il monte, mais ne prend pas la 2e place.
const afterUD = TR.computeRankings(fighters, history.concat([bout('f10', 'f2', 'a_win', 'ud')]))[key];
const rank = (rows, id) => rows.find((r) => r.fighter.id === id).rank;
assert.strictEqual(rank(afterUD, 'f10'), 5, 'le 10e passe 5e');
assert.strictEqual(rank(afterUD, 'f2'), 6, 'le 2e descend juste en dessous, 6e');

// Par decision majoritaire, il prend moins de places qu'a l'unanimite
const afterMD = TR.computeRankings(fighters, history.concat([bout('f10', 'f2', 'a_win', 'md')]))[key];
assert.ok(rank(afterMD, 'f10') > rank(afterUD, 'f10'), 'MD fait moins monter que UD');
const afterSD = TR.computeRankings(fighters, history.concat([bout('f10', 'f2', 'a_win', 'sd')]))[key];
assert.ok(rank(afterSD, 'f10') > rank(afterMD, 'f10'), 'SD fait moins monter que MD');

// Le mieux classe gagne : rien ne bouge
const favourite = TR.computeRankings(fighters, history.concat([bout('f2', 'f3', 'a_win', 'ud')]))[key];
assert.strictEqual(rank(favourite, 'f2'), 2);
assert.strictEqual(rank(favourite, 'f3'), 3);

// Le 3e bat le 2e : il prend sa place, le 2e passe 3e
const swap = TR.computeRankings(fighters, history.concat([bout('f3', 'f2', 'a_win', 'ud')]))[key];
assert.strictEqual(rank(swap, 'f3'), 2);
assert.strictEqual(rank(swap, 'f2'), 3);

// Battre le 2e rapporte plus que battre le 9e
const vsNinth = TR.computeRankings(fighters, history.concat([bout('f10', 'f9', 'a_win', 'ud')]))[key];
const pts = (rows, id) => rows.find((r) => r.fighter.id === id).rating;
assert.ok(pts(afterUD, 'f10') > pts(vsNinth, 'f10'), 'battre le 2e vaut plus que battre le 9e');

// 4. Historique d'un combattant
const fake = bout('a', 'b', 'a_win', 'ud');
assert.strictEqual(TR.fighterBouts('b', [fake], [{ id: 'a' }, { id: 'b' }])[0].outcome, 'D');

console.log('trophyrec-rank.test.js ok — 10e bat 2e : UD -> ' + rank(afterUD, 'f10') + 'e (perdant ' + rank(afterUD, 'f2') + 'e), MD -> ' + rank(afterMD, 'f10') + 'e, SD -> ' + rank(afterSD, 'f10') + 'e');
