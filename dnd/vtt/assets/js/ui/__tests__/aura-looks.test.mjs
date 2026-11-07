import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 545, Brandon (October 2026): auras on the 3D board are see-through moving cubes. Enemies: a red force field;
// Indigo: a blue psychic field; Zepha: fire; Cal: sparkly spores; Sharon: black ink swirls. They must read as an
// aura and not hide what is under them. The layer needs three.js and a canvas, so this reads it; the look is checked
// in the browser (scratchpad look_545a.cjs).

const source = readFileSync(new URL('../../../../board3d/layers/auras.mjs', import.meta.url), 'utf8');
// The Blender vines' glTF JSON (Pippa's thorns).
const json0 = () => { const glb = readFileSync(new URL('../../../../board3d/assets/fx/thorn-vines.glb', import.meta.url)); return JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString()); };
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
  // Pippa (sheet player6): psionic thorns (Brandon, November 6, 2026).
  assert.equal(auraLook({ name: 'Pippa' }), 'thorns');
  assert.equal(auraLook({ characterProfileId: 'player6', name: 'P.' }), 'thorns');
});

// Brandon, November 6, 2026: "animated vines, not long tubes that sway. Use Blender, give them joints and curls."
test('Pippa\'s thorns: jointed Blender vines that grow in and curl, round the edge; see-through; clicks go through', () => {
  assert.match(source, /if\(look==='thorns'\)\{/);
  assert.match(source, /readGlb\(new URL\('\.\.\/assets\/fx\/thorn-vines\.glb'/, 'the Blender pieces');
  assert.match(source, /for\(const name of \['climbover','toprun','reachin','creeper','climber','tendril'\]\)/);
  // Rooted in the ground and connected: clumps from one root (Brandon: "growing up from the ground and dangling over the
  // top"); mostly running along the top or reaching in, not escaping ("grouping along the top ... somewhere in the middle").
  assert.match(source, /const THORN_PIECES=\[\['toprun',\.3\],\['reachin',\.17\],\['climbover',\.1\],/, 'mostly along the top or reaching in');
  // Spread evenly all round, no gap in the middle of a side; each comes up somewhere else when it grows again.
  assert.match(source, /count=Math\.round\(perimeter\/\.5\)/);
  assert.match(source, /if\(vine\.grownOnce\)\{const \{rect\}=vine\.item,spot=thornSpot\(/);
  // A life: grows up out of the ground, lives a while, sinks back in (its growth played backwards), rests, grows again.
  assert.match(source, /function vineSink\(vine\)/);
  assert.match(source, /const scale=-\(vine\.speed\*/, 'the growth played backwards');
  // 30% slower than made, all of it alike (November 6, 2026).
  assert.match(source, /const THORN_PACE=\.7;/);
  assert.match(source, /vine\.mixer\.update\(Math\.min\(dt\|\|0,\.1\)\*THORN_PACE\)/);
  // Each grows in, then goes its own way: two curls and a pulse that draws in and grows out, on its own clock.
  assert.match(source, /for\(const n of \['grow','idle','idle2','pulse'\]\)/);
  assert.match(source, /speed:\.7\+Math\.random\(\)\*\.6/, 'each its own speed');
  assert.match(source, /Math\.random\(\)<\.4\?'pulse'/, 'now and then the pulse');
  // Solid, in vine colours with texture (November 6, 2026): the pieces' own baked colours, a bark grain, four tints.
  assert.match(source, /new THREE\.MeshStandardMaterial\(\{color:tint,vertexColors:true,roughness:\.85,metalness:0,side:THREE\.DoubleSide\}\)/);
  assert.doesNotMatch(source, /thornMaterial=new THREE\.MeshStandardMaterial\(\{[^}]*transparent:true/, 'not see-through');
  assert.match(source, /const thornMaterials=\['#ffffff','#e2f0cf','#f6e7c8','#d9e6bd'\]/);
  assert.match(source, /diffuseColor\.rgb\*=0\.82\*\(0\.7\+0\.42\*blot/, 'bark grain and blotches, a little darker');
  assert.ok(json0().meshes.every((m) => m.primitives[0].attributes.COLOR_0 !== undefined), 'colours baked in Blender');
  assert.match(source, /o\.raycast=\(\)=>\{\}/, 'clicks go through the vines');
  assert.match(source, /piece is rooted at its origin in the ground/, 'rooted, just inside the edge');
  assert.match(source, /thornMotes\(/, 'motes drifting up');
  const glb = readFileSync(new URL('../../../../board3d/assets/fx/thorn-vines.glb', import.meta.url));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  assert.deepEqual(json.skins.map((s) => s.joints.length).sort((a, b) => a - b), [7, 10, 12, 18, 18, 20], 'six pieces, each on its own joints');
  const names = json.animations.map((a) => a.name);
  for (const piece of ['climbover', 'toprun', 'reachin', 'creeper', 'climber', 'tendril']) for (const clip of ['grow', 'idle', 'idle2', 'pulse']) assert.ok(names.includes(`${piece}_${clip}`), `${piece}_${clip}`);
});

test('the board reads joints and animations from a .glb', () => {
  const reader = readFileSync(new URL('../../../../board3d/glb-reader.mjs', import.meta.url), 'utf8');
  assert.match(reader, /MAT4:16/, 'joint rest matrices');
  assert.match(reader, /\['JOINTS_0','skinIndex'\],\['WEIGHTS_0','skinWeight'\]/);
  assert.match(reader, /o\.bind\(new THREE\.Skeleton\(bones,inverses\),o\.matrixWorld\)/);
  assert.match(reader, /new THREE\.AnimationClip\(/);
});

test('a cube round the creature, standing on the ground, see-through and moving', () => {
  assert.match(source, /rect=\{column:column-radius,row:row-radius,width:p\.width\+radius\*2,height:p\.height\+radius\*2\}/, 'radius past every side');
  assert.match(source, /bottom=Math\.max\(z-radius,low-\.05\);/, 'on the ground the walls stand on it, never deeper than the radius');
  assert.match(source, /top:z\+tall\+radius/, 'radius above its head');
  assert.match(source, /if\(vNormal\.y<-0\.5\)discard;/, 'no bottom face');
  assert.match(source, /transparent:true,depthWrite:false,side:THREE\.DoubleSide,\s*forceSinglePass:true/, 'see-through, drawn in one pass');
  assert.match(source, /uniforms:\{uTime:time,uColor/, 'one shared time value moves them all');
  assert.match(source, /time\.value\+=Math\.min\(dt\|\|0,\.1\);/, 'every frame');
  assert.match(source, /gl_FragColor=vec4\(col,clamp\(a,0\.0,0\.85\)\*uBox\);/, 'never solid, and as strong as this screen chose');
});

// Brandon, November 6, 2026: animated auras on or off and how strong the boxes are, each on their own screen; Zepha's real
// flames (Blender's fire) with smoke; Cal's spores as a swarm that whirls round him; Indigo's waves pulsing out from her.
test('aura settings, and the fire, spores and waves', () => {
  const quality = readFileSync(new URL('../../../../board3d/quality.mjs', import.meta.url), 'utf8');
  assert.match(quality, /export const AURA_ANIMATED_KEY = 'vtt-aura-animated';/);
  assert.match(quality, /export const AURA_BOX_KEY = 'vtt-aura-box';/);
  assert.match(source, /look=settings\.animated\?own:'field'/, 'off: every aura a plain box');
  assert.match(source, /window\.addEventListener\('storage',onStorage\)/, 'the Table menu changes it at once');
  const table = readFileSync(new URL('../../../../../table/table-apps.js', import.meta.url), 'utf8');
  assert.match(table, /\.\.\.\(SERVED \? auraRows\(\) : \[\]\),/);
  assert.match(source, /new THREE\.TextureLoader\(\)\.load\(new URL\('\.\.\/assets\/fx\/fire-flipbook\.png'/, 'the flames play Blender\'s fire');
  assert.match(source, /function fireLayout\(item\)/);
  assert.match(source, /if\(e>=1\.8\)\{swarm\.start=null;swarm\.next=t\+50\+Math\.random\(\)\*20;\}/, 'Cal\'s whirl about once a minute');
  assert.match(source, /if\(look==='psychic'\)\{/);
  assert.match(source, /const waves=new THREE\.InstancedMesh\(sphere,material,2\)/, 'two waves half a beat apart');
  assert.match(source, /float k=fract\(uTime\/19\.2\+aPhase\)/, 'an eighth of the first speed');
});
