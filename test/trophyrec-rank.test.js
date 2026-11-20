const assert = require('assert');
const TR = require('../trophyrec.js');

assert.strictEqual(TR.winPoints('ko'), 5);
assert.strictEqual(TR.winPoints('decision'), 3);
assert.strictEqual(TR.slugify('Jean Dupont'), 'jean-dupont');

const fighters = [
  { id: 'a', prenom: 'Ada', nom: 'A' },
  { id: 'b', prenom: 'Ben', nom: 'B' },
  { id: 'c', prenom: 'Cam', nom: 'C' }
];
const bouts = [
  {
    fighter_a: 'a',
    fighter_b: 'b',
    result: 'a_win',
    method: 'ko',
    discipline: 'Boxe Anglaise',
    sexe: 'Homme',
    categorie_poids: '-69kg'
  },
  {
    fighter_a: 'a',
    fighter_b: 'c',
    result: 'draw',
    method: 'decision',
    discipline: 'Boxe Anglaise',
    sexe: 'Homme',
    categorie_poids: '-69kg'
  }
];
const boards = TR.computeRankings(fighters, bouts);
const div = 'Boxe Anglaise|Homme|-69kg';
assert.ok(boards[div]);
assert.strictEqual(boards[div][0].fighter.id, 'a');
assert.strictEqual(boards[div][0].points, 6);
assert.strictEqual(boards[div][0].record, '1-0-1');

const fake = Object.assign({}, bouts[0], { result: 'a_win' });
assert.strictEqual(TR.fighterBouts('b', [fake], fighters)[0].outcome, 'D');

console.log('trophyrec-rank.test.js ok');
