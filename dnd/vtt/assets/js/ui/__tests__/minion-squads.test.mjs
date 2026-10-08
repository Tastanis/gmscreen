import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squadForPlacement, squadPool, damageSquad, pickCaptain, livingCaptain, parseCaptainBonus, describeCaptainBonus, captainBonusFor, captainFeature, squadsOnScene, squadsLedBy, canBeCaptain, captainAction, squadBadge } from '../minion-squads.mjs';

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

test('forming a group names a captain only when exactly one creature in it is not a minion', () => {
  const placements = scene();
  assert.equal(pickCaptain(placements.filter((p) => p.id !== 'cal')), 'pm');
  assert.equal(pickCaptain(placements.filter((p) => p.squad)), null, 'a group of minions only has no captain');
  assert.equal(pickCaptain([hero, ...placements.filter((p) => p.squad)]), null, 'a hero is never a captain');
  assert.equal(pickCaptain([{ id: 'x', monster: { organization: 'Minion' } }, { id: 'boss', monster: { organization: 'Leader' } }, packmaster()]), null, 'two candidates: the GM attaches the one they mean');
});

test('a captain counts only while it is on the scene and has Stamina', () => {
  const led = scene({ captainId: 'pm' });
  const squad = squadForPlacement(led, 'g1');
  assert.equal(livingCaptain(squad, led)?.id, 'pm');
  assert.equal(livingCaptain(squad, led.map((p) => (p.id === 'pm' ? packmaster(0) : p))), null, 'at 0 Stamina the captain is down');
  assert.equal(livingCaptain(squad, led.filter((p) => p.id !== 'pm')), null, 'removed from the board');
  assert.equal(livingCaptain(squadForPlacement(scene(), 'g1'), scene()), null, 'a squad with no captain');
});

test('the "With Captain" line, as the monster book writes it: what is applied, and what is left to the table', () => {
  const none = { strikeDamage: 0, edge: 0, rangedDistance: 0, meleeDistance: 0, speed: 0, forcedMovement: 0, byHand: [], manual: false };
  assert.deepEqual(parseCaptainBonus('+2 damage bonus to strikes'), { text: '+2 damage bonus to strikes', ...none, strikeDamage: 2 });
  assert.equal(parseCaptainBonus('+1 damage bonus on strikes').strikeDamage, 1);
  assert.equal(parseCaptainBonus('Strike damage +2').strikeDamage, 2);
  assert.equal(parseCaptainBonus('+5 bonus to ranged distance').rangedDistance, 5);
  assert.equal(parseCaptainBonus('+4 Bonus to ranged distance').rangedDistance, 4);
  assert.equal(parseCaptainBonus('+3 bonus to melee distance').meleeDistance, 3);
  assert.equal(parseCaptainBonus('+2 bonus to speed').speed, 2);
  assert.equal(parseCaptainBonus('Speed +3').speed, 3);
  assert.equal(parseCaptainBonus('+2 bonus to forced movement').forcedMovement, 2);
  // An edge is applied, as one or two.
  assert.deepEqual(parseCaptainBonus('Gain an edge on strikes'), { text: 'Gain an edge on strikes', ...none, edge: 1 });
  assert.equal(parseCaptainBonus('Have a double edge on strikes').edge, 2);
  const both = parseCaptainBonus('+2 bonus to speed and +1 damage bonus on strikes');
  assert.deepEqual([both.speed, both.strikeDamage, both.manual], [2, 1, false]);
  // Extra Stamina, and anything it does not recognise, is left for the table and named.
  const stamina = parseCaptainBonus('+2 bonus to Stamina');
  assert.deepEqual([stamina.byHand, stamina.manual, stamina.strikeDamage], [['+2 bonus to Stamina'], true, 0]);
  const odd = parseCaptainBonus('+1 damage bonus on strikes; Lightning spread increases by 1 square');
  assert.deepEqual([odd.strikeDamage, odd.byHand, odd.manual], [1, ['Lightning spread increases by 1 square'], true]);
  assert.equal(parseCaptainBonus('An edge on Might tests').edge, 0, 'only an edge on strikes is applied');
  assert.deepEqual(parseCaptainBonus(''), { text: '', ...none });
  assert.equal(parseCaptainBonus(null).text, '');
});

test('the line in plain words, for the Monster Creator and the GM', () => {
  assert.deepEqual(describeCaptainBonus('+2 bonus to speed and Gain an edge on strikes'), { applied: ['edge on strikes', '+2 speed'], byHand: [] });
  assert.deepEqual(describeCaptainBonus('+4 damage bonus to strikes; +2 bonus to Stamina'), { applied: ['+4 damage on strikes'], byHand: ['+2 bonus to Stamina'] });
  assert.deepEqual(describeCaptainBonus('Have a double edge on strikes').applied, ['double edge on strikes']);
  assert.deepEqual(describeCaptainBonus('+5 bonus to ranged distance, +3 bonus to melee distance, +2 bonus to forced movement').applied, ['+5 ranged distance', '+3 melee distance', '+2 forced movement']);
  assert.deepEqual(describeCaptainBonus(''), { applied: [], byHand: [] });
  assert.deepEqual(describeCaptainBonus(parseCaptainBonus('Speed +1')).applied, ['+1 speed'], 'an already-read bonus is accepted too');
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
  assert.equal(captainFeature({ captainName: 'X', strikeDamage: 0, rangedDistance: 0, meleeDistance: 0, speed: 2, edge: 1 }), null, 'speed is handled by the movement counter and the edge by the roll, not here');
  assert.deepEqual(captainFeature({ captainName: 'X', forcedMovement: 2 }).automation.modifiers[0].apply, { forcedMovementBonus: 2 });
  assert.equal(captainFeature(null), null);
});

// A second squad of a different minion, and a second creature that could lead.
const rootMarker = { id: 'rep::root', monsterId: 'root', representativeId: 'r1', perMinionStamina: 7, maxPool: 14, initialMemberCount: 2 };
const gnawer = (id, extra = {}) => ({ id, name: 'Sluice Rootgnawer', hp: { current: '14', max: '14' }, monster: { id: 'root', role: 'Minion Brute' }, squad: { ...rootMarker, ...extra } });
const warden = { id: 'warden', name: 'Sluice Warden', hp: { current: '60', max: '60' }, monster: { id: 'warden', organization: 'Elite' } };
const field = (ghoulExtra = {}, rootExtra = {}) => [...scene(ghoulExtra), warden, gnawer('r1', rootExtra), gnawer('r2', rootExtra)];

test('squads on the scene, and who leads which', () => {
  const placements = field({ captainId: 'pm' });
  assert.deepEqual(squadsOnScene(placements).map((s) => [s.id, s.memberIds.length, s.captainId]), [['rep::ghoul', 4, 'pm'], ['rep::root', 2, null]]);
  assert.deepEqual(squadsLedBy(placements, 'pm').map((s) => s.id), ['rep::ghoul']);
  assert.deepEqual(squadsLedBy(placements, 'warden'), []);
  assert.deepEqual(squadsLedBy(placements, null), []);
  assert.equal(canBeCaptain(warden), true);
  assert.equal(canBeCaptain(hero), false, 'a hero token is not made from a monster');
  assert.equal(canBeCaptain(placements.find((p) => p.id === 'g1')), false, 'a minion cannot lead');
  assert.equal(canBeCaptain(null), false);
});

test('the captain action: attach with one leader and one squad selected', () => {
  const placements = field();
  assert.deepEqual(captainAction(placements, ['g1', 'g2', 'g3', 'g4', 'pm']), { kind: 'attach', squadId: 'rep::ghoul', captainId: 'pm', captainName: 'Ghoul Packmaster', replaces: '', leaves: [] });
  assert.equal(captainAction(placements, ['pm', 'g2']).kind, 'attach', 'one member of the squad is enough to say which squad');
  // Replacing a captain names the one who steps down.
  const led = field({ captainId: 'pm' });
  assert.deepEqual(captainAction(led, ['warden', 'g1']), { kind: 'attach', squadId: 'rep::ghoul', captainId: 'warden', captainName: 'Sluice Warden', replaces: 'Ghoul Packmaster', leaves: [] });
  // One squad per captain: attaching a captain elsewhere says which squad it leaves.
  assert.deepEqual(captainAction(led, ['pm', 'r1']).leaves, ['rep::ghoul']);
});

test('the captain action: detach, and the selections it does not apply to', () => {
  const led = field({ captainId: 'pm' });
  const detach = { kind: 'detach', squadId: 'rep::ghoul', captainId: 'pm', captainName: 'Ghoul Packmaster' };
  assert.deepEqual(captainAction(led, ['pm']), detach, 'the captain alone');
  assert.deepEqual(captainAction(led, ['pm', 'g1', 'g2']), detach, 'the captain with its own squad');
  assert.deepEqual(captainAction(led, ['g3']), detach, 'members of a led squad');
  assert.equal(captainAction(led, ['r1', 'r2']), null, 'a squad with no captain and no leader selected');
  assert.equal(captainAction(led, ['g1', 'r1', 'warden']), null, 'two squads: which one is not clear');
  assert.equal(captainAction(led, ['warden', 'pm', 'g1']), null, 'two leaders');
  assert.equal(captainAction(led, ['cal', 'g1']), null, 'a hero cannot be attached');
  assert.equal(captainAction(led, ['warden']), null, 'a creature that leads nothing');
  assert.equal(captainAction(led, []), null);
  assert.equal(captainAction(led, ['gone']), null);
});

test('badges: the captain, its minions while it is up, and nothing once it is down or detached', () => {
  const led = field({ captainId: 'pm' });
  assert.deepEqual(squadBadge(led, 'pm'), { kind: 'captain', down: false, minions: 4 });
  assert.deepEqual(squadBadge(led, 'g2'), { kind: 'led', captainName: 'Ghoul Packmaster' });
  assert.equal(squadBadge(led, 'r1'), null, 'a squad with no captain');
  assert.equal(squadBadge(led, 'warden'), null);
  assert.equal(squadBadge(led, 'cal'), null);
  const down = led.map((p) => (p.id === 'pm' ? packmaster(0) : p));
  assert.deepEqual(squadBadge(down, 'pm'), { kind: 'captain', down: true, minions: 4 });
  assert.equal(squadBadge(down, 'g2'), null, 'the minions lose the badge with the bonus');
  assert.equal(squadBadge(field(), 'pm'), null, 'detached');
  // A player whose view does not include the captain (it is hidden) sees no badge on the minions.
  assert.equal(squadBadge(led.filter((p) => p.id !== 'pm'), 'g2'), null);
});
