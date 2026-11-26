// Brandon's list after the November 24, 2026 session (the plain parts; the browser's side was checked on a
// disposable board, and the universal actions have their own file in character_sheet/ability-automation/__tests__).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compassDegrees } from '../../../../board3d/compass-math.mjs';
import { wheelNotches } from '../../../../board3d/wheel-notches.mjs';
import { TOKEN_LOOKS, tokenLookSettings } from '../../../../board3d/token-looks.mjs';
import { forcedOutcomeWording, WORDING_SEPARATOR } from '../ruler-label-layout.mjs';
import { resolveForcedDrag } from '../forced-drag.js';
import { pickDefense, defenseEntriesFromConditions } from '../automation-resistance.js';
import { normalizePlacementForRender } from '../token-render-normalize.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const board = read('../board-interactions.js');
const integration = read('../../../../board3d/integration.mjs');
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing source boundaries: ${start} / ${end}`);
  return source.slice(from, to);
};

test('9. the compass: north is the top of the map picture, whichever way the camera looks', () => {
  const up = { x: 0, y: 1, z: 0 };
  // x east, y up, z south (rows go down the picture).
  assert.equal(compassDegrees({ x: 0, y: -0.7, z: -0.7 }, up), 0, 'looking north: north is straight up the screen');
  assert.equal(compassDegrees({ x: -0.7, y: -0.7, z: 0 }, up), 90, 'looking west: north is to the right');
  assert.equal(compassDegrees({ x: 0, y: -0.7, z: 0.7 }, up), 180, 'looking south: north is down the screen');
  assert.equal(compassDegrees({ x: 0.7, y: -0.7, z: 0 }, up), 270, 'looking east: north is to the left');
  // Straight down there is no forward along the ground: the top of the picture decides.
  assert.equal(compassDegrees({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }), 0);
  assert.equal(compassDegrees({ x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }), 270);
  assert.equal(compassDegrees({ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }), 0, 'nothing to go by: north up');
  const layers = read('../../../../board3d/layers/index.mjs');
  assert.match(layers, /vtt3d\.addLayer\('compass',createCompassLayer\);/);
});

test('5. Z and the wheel: one step a notch, up is up, a touchpad adds up to a step', () => {
  assert.equal(wheelNotches({ deltaY: -100, deltaMode: 0 }), 1, 'wheel away from you: up');
  assert.equal(wheelNotches({ deltaY: 100, deltaMode: 0 }), -1);
  assert.equal(wheelNotches({ deltaY: -3, deltaMode: 1 }), 1, 'lines');
  assert.equal(wheelNotches({ deltaY: 0, deltaMode: 0 }), 0);
  assert.deepEqual([-20, -20, -20, -20].map((deltaY) => wheelNotches({ deltaY, deltaMode: 0 })), [0, 0, 1, 0], 'small moves add up');
  // The Measure tool and a held token both take it; with neither, the camera zooms as before.
  assert.match(integration, /onWheel:e=>wheelHeight\(e\)/);
  assert.match(section(integration, ' function wheelHeight(e){', '\n }'), /if\(!zHeld\|\|!\(lift\|\|isMeasureToolMeasuring\(\)\)\)return false;/, 'without Z, or with nothing to raise, the wheel is the camera\'s');
  assert.match(integration, /if\(!drag\?\.moved&&!clickMoveTokenId\)return addMeasureToolNode\(\);/, 'a right click with the Measure tool is a corner');
  const ruler = read('../drag-ruler.js');
  assert.match(ruler, /export function addMeasureToolNode\(\)/);
  assert.match(ruler, /export function nudgeMeasureHeight\(steps\)/);
  assert.match(section(ruler, 'export function nudgeMeasureHeight(steps)', '\n}'), /if \(!state\.heightNodeDropped\) \{ state\.heightNodeDropped = true; addMeasurementNode\(state\); \}/, 'the first notch drops a corner');
  assert.match(ruler, /const sameMeasuredSpot = \(a, b\) => a\.column === b\.column && a\.row === b\.row && \(Number\(a\.raisedBy\) \|\| 0\) === \(Number\(b\.raisedBy\) \|\| 0\);/, 'the same square higher up is another corner');
});

test('2. a body: the mark is kept through drawing, and the ring has its own settings', () => {
  assert.equal(normalizePlacementForRender({ id: 'orc', column: 1, row: 1, dead: true }).dead, true);
  assert.equal(normalizePlacementForRender({ id: 'orc', column: 1, row: 1 }).dead, false);
  assert.equal(normalizePlacementForRender({ id: 'orc', column: 1, row: 1, dead: 'yes' }).dead, false, 'only a true mark');
  const body = tokenLookSettings(undefined).body;
  assert.deepEqual(body, { ...TOKEN_LOOKS.body });
  assert.ok(body.show && body.ringOuter > body.ringInner && body.ringOuter > 1, 'the ring shows outside the base');
  const set = tokenLookSettings({ body: { show: false, ringColor: 'not a colour', ringOpacity: 9, ringInner: -1 } }).body;
  assert.equal(set.show, false); assert.equal(set.ringColor, TOKEN_LOOKS.body.ringColor); assert.equal(set.ringOpacity, 1); assert.equal(set.ringInner, 0.1);
  assert.match(board, /paintDeadMark\(token, normalized\.dead === true\);/);
  assert.match(board, /data-token-settings-toggle="dead"/);
  // Only the Director's menu has the switch (the markup is built for the Director alone).
  assert.match(section(board, '    const hiddenToggleMarkup = gmUser', "      : '';"), /data-token-settings-toggle="dead"/);
  assert.match(read('../../../../lib/SyncV2Store.php'), /'dead',\s+\/\/ the Director's mark on a body/);
});

test('15. pushed into a wall it stands against: the squares really moved and the damage are said', () => {
  const wallAt = (column) => ({ wallBlocked: (from, to) => to.column > column - 1 + 1e-9 });   // a wall on the east face of `column - 1`
  const orc = { id: 'orc', column: 6, row: 5, width: 1, height: 1 };
  const outcome = (from, to, options) => {
    const drag = resolveForcedDrag(from, to, [from], options);
    return { moved: Math.round(Math.max(Math.abs(drag.destination.column - from.column), Math.abs(drag.destination.row - from.row))), damage: drag.damage, wall: drag.wall, collided: drag.collidedIds.length };
  };
  // Draw Steel: stopped by an object, 2 + the squares of the push left over.
  assert.deepEqual(outcome(orc, { column: 7, row: 5 }, wallAt(7)), { moved: 0, damage: 3, wall: true, collided: 0 }, 'against the wall, pushed 1');
  assert.deepEqual(outcome(orc, { column: 9, row: 5 }, wallAt(7)), { moved: 0, damage: 5, wall: true, collided: 0 }, 'against the wall, pushed 3');
  assert.deepEqual(outcome({ ...orc, column: 5 }, { column: 8, row: 5 }, wallAt(7)), { moved: 1, damage: 4, wall: true, collided: 0 }, 'one square away, pushed 3');
  assert.deepEqual(outcome(orc, { column: 3, row: 5 }, wallAt(7)), { moved: 3, damage: 0, wall: false, collided: 0 }, 'pushed the other way: free');

  assert.deepEqual(forcedOutcomeWording({ moved: 0, damage: 3, wall: true, collided: 0 }), ['Moves 0', '3 damage']);
  assert.deepEqual(forcedOutcomeWording({ moved: 2, damage: 1, wall: false, collided: 1 }), ['Hits a creature', 'Moves 2', '1 damage']);
  assert.deepEqual(forcedOutcomeWording({ moved: 3, damage: 0, wall: false, collided: 0 }), [], 'a push that runs free says nothing more');
  assert.deepEqual(forcedOutcomeWording(null), []);
  assert.equal(['Forced movement 1', 'Stops at a wall', ...forcedOutcomeWording({ moved: 0, damage: 3, wall: true, collided: 0 })].join(WORDING_SEPARATOR), 'Forced movement 1 · Stops at a wall · Moves 0 · 3 damage');
  // An ability's push that moves nothing still shows its label ("Push 0 · hits a wall for 3").
  assert.match(integration, /guideRoute=land\.moved\|\|hit\?\{pieces:land\.moved\?/);
  assert.doesNotMatch(integration, /guideRoute=land\.moved\?\{pieces/);
});

test('12b. two weaknesses to the same damage: both stay on the token, the larger one counts', () => {
  const conditions = [
    { name: 'damageWeakness', amount: 3, damageType: 'fire' },
    { name: 'damageWeakness', amount: 5, damageType: 'fire' },
    { name: 'damageWeakness', amount: 4, damageType: 'cold' },
  ];
  const entries = defenseEntriesFromConditions(conditions);
  assert.equal(entries.length, 3, 'each stays its own entry');
  assert.equal(pickDefense(entries, 'weakness', 'fire').value, 5, 'fire 3 and fire 5: 5, not 8');
  assert.equal(pickDefense(entries, 'weakness', 'cold').value, 4);
  assert.equal(pickDefense(entries, 'weakness', 'holy').value, 0);
  // Weakness to all damage and to one type: still the larger, not both.
  assert.equal(pickDefense([...entries, ...defenseEntriesFromConditions([{ name: 'damageWeakness', amount: 2, damageType: '' }])], 'weakness', 'fire').value, 5);
  // Only an effect written to add ("stacks": true, shown as "(adds)") adds to it.
  assert.equal(pickDefense(defenseEntriesFromConditions([...conditions, { name: 'damageWeakness', amount: 2, damageType: 'fire', stacks: true }]), 'weakness', 'fire').value, 7);
});

test("8. an area's time is up: the question goes to whoever is running the turn's hero, the Director only for the Director's own", () => {
  const asker = (deps) => new Function('deps', `with (deps) { ${section(board, '  function zoneEndAsker(casterId) {', '  async function endPersistentZonesByTime(')}; return zoneEndAsker; }`)(deps);
  const base = { normalizeProfileId: (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null) };
  const linked = (id) => ({ 'indigo-token': 'indigo' }[id] || '');
  assert.equal(asker({ ...base, getCurrentUserId: () => 'GM', isGmUser: () => true, getLinkedProfileUserIdForPlacement: linked })('indigo-token'), 'gm', 'the Director is taking her turn: the Director');
  assert.equal(asker({ ...base, getCurrentUserId: () => 'indigo', isGmUser: () => false, getLinkedProfileUserIdForPlacement: linked })('indigo-token'), 'indigo', 'she started her own turn: hers');
  assert.equal(asker({ ...base, getCurrentUserId: () => 'cal', isGmUser: () => false, getLinkedProfileUserIdForPlacement: linked })('indigo-token'), 'indigo', "another player started her turn: still hers");
  assert.equal(asker({ ...base, getCurrentUserId: () => 'cal', isGmUser: () => false, getLinkedProfileUserIdForPlacement: linked })('summoned-thing'), 'cal', 'no player of its own: whoever is running it');

  // Who shows the popup.
  const prompts = (me, gm, zones, now = 100000) => {
    let asked = null, timers = 0;
    const deps = { ...base, getCurrentUserId: () => me, isGmUser: () => gm, getActivePersistentZones: () => zones, promptedZoneEnds: new Set(), ZONE_END_DIRECTOR_AFTER_MS: 25000,
      Date: { now: () => now }, window: { setTimeout: () => { timers += 1; return 1; } }, console,
      confirmBoardAction: (message) => { asked = message; return new Promise(() => {}); }, removePersistentZones: async () => {}, updatePlacementById() {}, scheduleZoneEndPrompts() {} };
    new Function('deps', `with (deps) { let zoneEndPromptOpen = false; ${section(board, '  let zoneEndRecheck = null;', '  // Zones that last')}; maybePromptZoneEnds(); }`)(deps);
    return { asked, timers };
  };
  const hers = [{ id: 'z', casterId: 'indigo-token', abilityName: 'Incinerate', endDue: { reason: "start of Indigo's turn", at: 100000, askUserId: 'indigo' } }];
  assert.match(prompts('indigo', false, hers).asked, /Incinerate/, 'her page asks her');
  assert.equal(prompts('cal', false, hers).asked, null, "another player's page does not");
  const director = prompts('gm', true, hers);
  assert.equal(director.asked, null, 'nor the Director, at first'); assert.equal(director.timers, 1, 'who looks again later');
  assert.match(prompts('gm', true, hers, 100000 + 26000).asked, /Incinerate/, 'she has not answered for 25 seconds: the Director is asked after all');
  assert.match(prompts('gm', true, [{ ...hers[0], endDue: { reason: 'x', at: 100000, askUserId: 'gm' } }]).asked, /Incinerate/, 'the Director ran the turn: asked at once');
  assert.match(prompts('gm', true, [{ ...hers[0], endDue: { reason: 'x', at: 100000 } }]).asked, /Incinerate/, 'a mark made by an older page: the Director, as it was');
  assert.equal(prompts('indigo', false, [{ ...hers[0], endDue: { reason: 'x', at: 100000 } }]).asked, null);
});

test('13. a player may push a creature that is not theirs, and only push it', () => {
  const rules = (deps) => new Function('deps', `with (deps) { ${section(board, '  function canCurrentUserPushPlacement(placement) {', '\n  function normalizeProfileId(')}; return { canCurrentUserPushPlacement, mayMoveAs }; }`)(deps);
  const player = rules({ isGmUser: () => false, normalizePlacementForRender, canCurrentUserMovePlacement: (p) => p.team === 'ally' });
  const orc = { id: 'orc', column: 1, row: 1, team: 'enemy' }, hero = { id: 'cal', column: 2, row: 2, team: 'ally' };
  assert.equal(player.mayMoveAs(orc, 'walk'), false); assert.equal(player.mayMoveAs(orc, 'shift'), false); assert.equal(player.mayMoveAs(orc, 'teleport'), false);
  assert.equal(player.mayMoveAs(orc, 'forced'), true, 'Ctrl held: a push');
  assert.equal(player.mayMoveAs({ ...orc, hidden: true }, 'forced'), false, 'never a token hidden from players');
  assert.equal(player.mayMoveAs(hero, 'walk'), true, 'their own as before');
  assert.equal(rules({ isGmUser: () => true, normalizePlacementForRender, canCurrentUserMovePlacement: () => true }).mayMoveAs({ ...orc, hidden: true }, 'forced'), true);
  assert.match(integration, /const mayMove=\(p,e\)=>p\.canMove!==false\|\|\(movementKind\(e\)==='forced'&&p\.canPush!==false\);/);
  const store = read('../../../../lib/SyncV2Store.php');
  assert.match(store, /public function playerMayPushPlacement\(array \$placement, \$movementKind, \$forcedDestination, \$undoRevision = null\): bool/);
  assert.match(store, /if \(!\$this->playerMayMovePlacement\(\$current\)\s+&& !\$this->playerMayPushPlacement\(\$current, \$normalized\['movementKind'\], \$normalized\['forcedDestination'\], \$normalized\['undoRevision'\]\)\) \{/);
});

test('4. chat lines the board writes are spoken by the board, not by whoever\'s page ran them', () => {
  assert.doesNotMatch(board, /window\.dashboardChat\??\.sendMessage\??\.?\(/, 'every line goes through sendBoardChat');
  const send = (chat) => new Function('deps', `with (deps) { ${section(board, "  const BOARD_CHAT_SPEAKER = 'Table';", '  function announceToChat(message) {')}; return sendBoardChat; }`)({ window: { dashboardChat: chat }, Promise });
  const sent = [];
  const chat = { sendMessage: (options) => { sent.push(options); return Promise.resolve(true); } };
  send(chat)({ message: 'Incinerate ticks', type: 'text' });
  assert.deepEqual(sent, [{ message: 'Incinerate ticks', type: 'text', speaker: 'Table' }]);
  return send(null)({ message: 'x' }).then((result) => assert.equal(result, false, 'no chat: a quiet no, never an error'));
});

test('10 and 6. the turn indicator says whose side it is; the turn buttons follow what covers the right of the board', () => {
  assert.match(board, /indicatorLabel === TURN_INDICATOR_GM_TEXT \|\| indicatorLabel === TURN_INDICATOR_ENEMY_PICK_TEXT \? 'enemy' : 'ally'/);
  const embed = readFileSync(new URL('../../../../../table/vtt-embed.js', import.meta.url), 'utf8');
  assert.match(embed, /fight\.classList\.toggle\('heroes', st\.combat && st\.turnSide === 'ally'\);/);
  assert.match(readFileSync(new URL('../../../../../table/vtt-embed.css', import.meta.url), 'utf8'), /#te-top \.te-fight\.heroes \{ background: #17301d; color: #b9ecc2; \}/);
  assert.match(section(board, '  function positionTurnPromptOverlay(overlay) {', '\n  }'), /getPropertyValue\('--vtt-free-right'\)/);
  assert.match(board, /document\.addEventListener\('vtt:free-area', \(event\) => \{/);
  assert.match(read('../board-free-area.js'), /doc\.dispatchEvent\(new win\.CustomEvent\('vtt:free-area'/);
});

test('7. a creature in plain view is not left hidden: its floor, the cut and the sight check', () => {
  // Dropped on the ground it is filed under the ground, whatever the Director's Height is on.
  assert.match(board, /const levelId = \(typeof droppedOn\?\.levelId === 'string' && droppedOn\.levelId \? droppedOn\.levelId : null\) \|\| getActiveTokenPlacementLevelId\(state\);/);
  // The Height cut goes by where a creature on foot stands, when that is well below the floor it is filed under.
  const standingLevel = new Function('deps', `with (deps) { ${section(integration, ' function standingLevel(p,z){', '\n function world(p){')}; return standingLevel; }`);
  const levels = ['level-0', 'upper', 'top'];
  const fn = standingLevel({ data: { levelHeights: [0, 6, 12] }, levelIndex: (id) => Math.max(0, levels.indexOf(id)) });
  assert.equal(fn({ levelId: 'upper' }, 0), 0, 'filed under the upper floor, standing on the ground: counts as on the ground');
  assert.equal(fn({ levelId: 'upper' }, 6), 1, 'standing on the upper floor');
  assert.equal(fn({ levelId: 'top' }, 6.2), 1);
  assert.equal(fn({ levelId: 'upper', movementMode: 'fly' }, 0), 1, 'a flier is left as filed');
  assert.equal(fn({ levelId: 'upper', _floorTraversal: { stair: 1 } }, 3), 1, 'so is one on a stair');
  assert.equal(fn({ levelId: 'level-0' }, 0), 0);
  // The sight check's kept answers name the walls they were worked out from, and it is looked at again by itself.
  assert.match(board, /const key = JSON\.stringify\(\[coverStanding\(actor\), coverStanding\(target\), getActiveSceneId\(\), coverModelStamp\(walls\),/);
  assert.match(board, /if \(now === renderedSightSignature\) return;\s+renderTokens\(boardApi\.getState\?\.\(\) \?\? \{\}, tokenLayer, viewState\);/);
});
