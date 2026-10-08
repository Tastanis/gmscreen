import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squadForPlacement, squadPool, damageSquad, pickCaptain, livingCaptain, parseCaptainBonus, captainBonusFor, captainFeature } from '../minion-squads.mjs';

const marker = (extra = {}) => ({ id: 'rep::ghoul', monsterId: 'ghoul', representativeId: 'g1', perMinionStamina: 8, maxPool: 32, initialMemberCount: 4, ...extra });
const ghoul = (id, hp = 32, extra = {}) => ({ id, name: 'Sluice Ghoul', hp: { current: String(hp), max: '32' }, monster: { id: 'ghoul', role: 'Minion Harrier', stamina: 8 }, squad: marker(extra) });
const packmaster = (hp = 40) => ({ id: 'pm', name: 'Ghoul Packmaster', hp: { current: String(hp), max: '40' }, monster: { id: 'packmaster', organization: 'Horde', role: 'Horde Harrier' } });
const hero = { id: 'cal', name: 'Cal', hp: { current: '72', max: '72' } };
const scene = (extra = {}, hps = [32, 32, 32, 32]) => [hero, packmaster(), ...['g1', 'g2', 'g3', 'g4'].map((id, i) => ghoul(id, hps[i], extra))];

test('a squad is rebuilt from the markers on the tokens, by any browser, in either store shape', () => {
  const placements = scene();
  const squad = squadForPlacement(placements, 'g3');
  assert.deepEqual(squad.memberIds, ['g1', 'g2', 'g3', 'g4']);
  assert.deepEqual([squad.perMinionStamina, squad.maxPool, squad.initialMemberCount, squad.captainId], [8, 32, 4, null]);
  // The same answer whichever member is asked about, and from a keyed map as well as a list.
  assert.deepEqual(squadForPlacement(placements, 'g1').memberIds, squad.memberIds);
  assert.deepEqual(squadForPlacement(Object.fromEntries(placements.map((p) => [p.id, p])), 'g4').memberIds, squad.memberIds);
  assert.equal(squadForPlacement(placements, 'cal'), null, 'a token with no marker is in no squad');
  assert.equal(squadForPlacement(placements, 'nobody'), null);
  assert.equal(squadForPlacement(null, 'g1'), null);
  // A member that has been removed from the board simply is not counted.
  assert.deepEqual(squadForPlacement(placements.filter((p) => p.id !== 'g2'), 'g1').memberIds, ['g1', 'g3', 'g4']);
});

test('one hit on any member comes off the shared pool and drops whole minions', () => {
  const placements = scene();
  const squad = squadForPlacement(placements, 'g2');
  assert.equal(squadPool(squad, placements), 32);
  assert.deepEqual(damageSquad(squad, 32, 11), { previous: 32, current: 21, standingBefore: 4, standing: 3, kills: 1 });
  assert.deepEqual(damageSquad(squad, 21, 11), { previous: 21, current: 10, standingBefore: 3, standing: 2, kills: 1 });
  assert.deepEqual(damageSquad(squad, 10, 3), { previous: 10, current: 7, standingBefore: 2, standing: 1, kills: 1 });
  assert.equal(damageSquad(squad, 32, 3).kills, 0, 'a scratch drops nobody');
  assert.deepEqual(damageSquad(squad, 7, 50), { previous: 7, current: 0, standingBefore: 1, standing: 0, kills: 1 }, 'the pool never goes below zero');
  assert.equal(damageSquad(squad, 32, 24).kills, 3, 'a big hit drops several');
  assert.equal(damageSquad(squad, 32, -5).current, 32);
});

test('members that disagree about the pool (an older save) settle on the lowest, so damage is never given back', () => {
  const broken = scene({}, [32, 15, 21, 32]);
  const squad = squadForPlacement(broken, 'g1');
  assert.equal(squadPool(squad, broken), 15);
  assert.equal(squadPool(squad, scene({}, [10, 10, 10, 10])), 10);
  assert.equal(squadPool(squad, scene({}, [99, 99, 99, 99])), 32, 'never above the squad’s full pool');
  assert.equal(squadPool(squad, [hero]), 32, 'no member on the board: a full pool');
});

test('the captain is the group’s first creature that is not a minion', () => {
  const placements = scene();
  assert.equal(pickCaptain(placements.filter((p) => p.id !== 'cal')), 'pm');
  assert.equal(pickCaptain(placements.filter((p) => p.squad)), null, 'a group of minions only has no captain');
  assert.equal(pickCaptain([hero, ...placements.filter((p) => p.squad)]), null, 'a hero is never a captain');
  assert.equal(pickCaptain([{ id: 'x', monster: { organization: 'Minion' } }, { id: 'boss', monster: { organization: 'Leader' } }, packmaster()]), 'boss', 'the first non-minion wins');
});

test('a captain counts only while it is on the scene and has Stamina', () => {
  const led = scene({ captainId: 'pm' });
  const squad = squadForPlacement(led, 'g1');
  assert.equal(livingCaptain(squad, led)?.id, 'pm');
  assert.equal(livingCaptain(squad, led.map((p) => (p.id === 'pm' ? packmaster(0) : p))), null, 'at 0 Stamina the captain is down');
  assert.equal(livingCaptain(squad, led.filter((p) => p.id !== 'pm')), null, 'removed from the board');
  assert.equal(livingCaptain(squadForPlacement(scene(), 'g1'), scene()), null, 'a squad with no captain');
});

test('the "With Captain" line: what is applied, and what is left to the table', () => {
  assert.deepEqual(parseCaptainBonus('+1 damage bonus on strikes'), { text: '+1 damage bonus on strikes', strikeDamage: 1, rangedDistance: 0, meleeDistance: 0, speed: 0, edgeOnStrikes: false, manual: false });
  assert.equal(parseCaptainBonus('Strike damage +2').strikeDamage, 2);
  assert.equal(parseCaptainBonus('+4 bonus to ranged distance').rangedDistance, 4);
  assert.equal(parseCaptainBonus('Ranged distance +5').rangedDistance, 5);
  assert.equal(parseCaptainBonus('+1 bonus to melee distance').meleeDistance, 1);
  assert.equal(parseCaptainBonus('+2 bonus to speed').speed, 2);
  assert.equal(parseCaptainBonus('Speed +3').speed, 3);
  const edge = parseCaptainBonus('Gain an edge on strikes');
  assert.deepEqual([edge.edgeOnStrikes, edge.manual, edge.strikeDamage], [true, true, 0], 'an edge is a reminder, not applied');
  const both = parseCaptainBonus('+2 bonus to speed and +1 damage bonus on strikes');
  assert.deepEqual([both.speed, both.strikeDamage, both.manual], [2, 1, false]);
  const odd = parseCaptainBonus('+1 damage bonus on strikes; can use Howl as a free maneuver');
  assert.deepEqual([odd.strikeDamage, odd.manual], [1, true], 'the part it cannot read is flagged for the table');
  assert.equal(parseCaptainBonus('Regains the Hurry Them villain action').manual, true);
  assert.deepEqual(parseCaptainBonus(''), { text: '', strikeDamage: 0, rangedDistance: 0, meleeDistance: 0, speed: 0, edgeOnStrikes: false, manual: false });
  assert.equal(parseCaptainBonus(null).text, '');
});

test('a minion gets its captain’s bonus only inside a led squad whose captain is up', () => {
  const text = '+1 damage bonus on strikes and +2 bonus to speed';
  const led = scene({ captainId: 'pm', withCaptain: text });
  const bonus = captainBonusFor(led, 'g2');
  assert.deepEqual([bonus.captainName, bonus.strikeDamage, bonus.speed], ['Ghoul Packmaster', 1, 2]);
  assert.equal(captainBonusFor(led.map((p) => (p.id === 'pm' ? packmaster(0) : p)), 'g2'), null, 'the captain is down');
  assert.equal(captainBonusFor(scene({ withCaptain: text }), 'g2'), null, 'no captain in the group');
  assert.equal(captainBonusFor(scene({ captainId: 'pm' }), 'g2'), null, 'the minion has no "With Captain" line');
  assert.equal(captainBonusFor(led, 'pm'), null, 'the captain itself gets nothing');
  assert.equal(captainBonusFor(led, 'cal'), null);
  // The line can also come from the minion's own record when the marker has none.
  const fromRecord = scene({ captainId: 'pm' }).map((p) => (p.squad ? { ...p, monster: { ...p.monster, with_captain: 'Speed +2' } } : p));
  assert.equal(captainBonusFor(fromRecord, 'g1').speed, 2);
});

test('the bonus reaches abilities as a feature the runner already understands', () => {
  const feature = captainFeature({ captainName: 'Ghoul Packmaster', strikeDamage: 1, rangedDistance: 4, meleeDistance: 0 });
  assert.equal(feature.title, 'With Captain (Ghoul Packmaster)');
  assert.deepEqual(feature.automation.modifiers.map((m) => [m.match.keywordsAny, m.apply]), [[['Strike'], { damageBonus: 1 }], [['Ranged'], { rangeBonus: 4 }]]);
  assert.deepEqual(captainFeature({ captainName: 'X', meleeDistance: 1 }).automation.modifiers[0].match, { keywordsAny: ['Melee'], keywordsNone: ['Ranged'] });
  assert.equal(captainFeature({ captainName: 'X', strikeDamage: 0, rangedDistance: 0, meleeDistance: 0, speed: 2 }), null, 'speed is handled by the movement counter, not by abilities');
  assert.equal(captainFeature(null), null);
});
