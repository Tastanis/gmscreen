import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 545, Brandon (October 2026): auras on the 3D board are see-through moving cubes. Enemies: a red force field;
// Indigo: a blue psychic field; Zepha: fire; Cal: sparkly spores; Sharon: black ink swirls. They must read as an
// aura and not hide what is under them. The layer needs three.js and a canvas, so this reads it; the look is checked
// in the browser (scratchpad look_545a.cjs).

const source = readFileSync(new URL('../../../../board3d/layers/auras.mjs', import.meta.url), 'utf8');
// auraLook has no three.js in it: lift it out and run it.
const body = source.slice(source.indexOf('export function auraLook('), source.indexOf('\nconst vertex='));
const HEROES = eval(`(${source.match(/const HEROES=(\{[^}]*\})/)[1]})`);
const auraLook = new Function('HEROES', `${body.replace('export function', 'function')}; return auraLook;`)(HEROES);

test('which look an aura takes', () => {
  assert.equal(auraLook({ name: 'Indigo' }), 'psychic');
  assert.equal(auraLook({ name: 'Zepha (flying)' }), 'fire', 'the hero name as a whole word, as the minis find it');
  assert.equal(auraLook({ name: 'Cal' }), 'spores');
  assert.equal(auraLook({ characterProfileId: 'sharon', name: 'S.' }), 'ink', 'or by the sheet');
  assert.equal(auraLook({ name: 'Calamity Goblin', combatTeam: 'enemy' }), 'enemy', 'part of a word is not the hero');
  assert.equal(auraLook({ name: 'Driftstone', monsterId: 'driftstone' }), 'enemy', 'a monster with no team is an enemy');
  assert.equal(auraLook({ name: 'Guard captain', combatTeam: 'ally', monsterId: 'guard' }), 'field', 'an ally keeps its own colour');
});

test('a cube round the creature, standing on the ground, see-through and moving', () => {
  assert.match(source, /rect=\{column:column-radius,row:row-radius,width:p\.width\+radius\*2,height:p\.height\+radius\*2\}/, 'radius past every side');
  assert.match(source, /bottom=Math\.max\(z-radius,low-\.05\);/, 'on the ground the walls stand on it, never deeper than the radius');
  assert.match(source, /top:z\+tall\+radius/, 'radius above its head');
  assert.match(source, /if\(vNormal\.y<-0\.5\)discard;/, 'no bottom face');
  assert.match(source, /transparent:true,depthWrite:false,side:THREE\.DoubleSide,\s*forceSinglePass:true/, 'see-through, drawn in one pass');
  assert.match(source, /uniforms:\{uTime:time,uColor/, 'one shared time value moves them all');
  assert.match(source, /time\.value\+=Math\.min\(dt\|\|0,\.1\);/, 'every frame');
  assert.match(source, /gl_FragColor=vec4\(col,clamp\(a,0\.0,0\.85\)\);/, 'never solid');
});
