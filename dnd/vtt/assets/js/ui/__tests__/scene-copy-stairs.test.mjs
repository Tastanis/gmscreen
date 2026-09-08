import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cycleSegmentColor, updateStairCorners, removeStairWithMirror } from '../stairs-mutations.js';

const library = fileURLToPath(new URL('../../../../lib/ScenePackage.php', import.meta.url));
function prepare(packageData) {
  const result = JSON.parse(execFileSync(process.env.PHP_BINARY || 'php', ['-r',
    'require $argv[1]; try { echo json_encode(ScenePackage::prepareForNewScene(json_decode(stream_get_contents(STDIN), true), "scn-copy-editor-test")); } catch (InvalidArgumentException $error) { echo json_encode(["error"=>$error->getMessage()]); }', library],
  { input: JSON.stringify(packageData), encoding: 'utf8' }));
  if (result.error) throw new Error(result.error);
  return result;
}
const corners = [{column:1,row:1},{column:4,row:1},{column:4,row:5},{column:1,row:5}];
function fixture() {
  const stair = linkedLevelId => ({id:'same-original-id',linkedLevelId,corners,edgeColors:{}});
  return {format:'gmscreen-scene/v1',scene:{id:'original',name:'Stair copy',mapUrl:'/map.jpg'},domains:{
    placements:{},drawings:{},templates:{},sceneConfig:{mapLevels:{activeLevelId:'upper',baseStairs:[stair('upper')],levels:[
      {id:'upper',stairs:[stair('level-0')]}, {id:'tower',stairs:[stair('roof')]}, {id:'roof',stairs:[stair('tower')]},
    ]}},
  }};
}

test('PHP-prepared stairs support mirrored corner edits, edge edits and deletion in the real editor', () => {
  const source = fixture(); const original = structuredClone(source);
  const {package: copied,idMap} = prepare(source);
  const scene = copied.domains.sceneConfig;
  const base = scene.mapLevels.baseStairs[0];
  const upper = scene.mapLevels.levels[0].stairs[0];
  const unrelated = scene.mapLevels.levels[1].stairs[0];
  assert.equal(base.id, upper.id);
  assert.notEqual(base.id, unrelated.id);
  assert.equal(scene.mapLevels.activeLevelId, idMap.levels.upper);
  const nextCorners = corners.map(p => ({column:p.column+1,row:p.row+2}));
  assert.equal(updateStairCorners(scene, 'level-0', base.id, nextCorners), true);
  assert.deepEqual(upper.corners, nextCorners);
  assert.deepEqual(unrelated.corners, corners);
  assert.equal(cycleSegmentColor(scene, idMap.levels.upper, upper.id, '2,3-3,3'), 'green');
  assert.equal(base.edgeColors['2,3-3,3'], 'green');
  assert.equal(unrelated.edgeColors['2,3-3,3'], undefined);
  assert.equal(removeStairWithMirror(scene, 'level-0', base.id), true);
  assert.deepEqual(scene.mapLevels.baseStairs, []);
  assert.deepEqual(scene.mapLevels.levels[0].stairs, []);
  assert.equal(scene.mapLevels.levels[1].stairs.length, 1);
  assert.deepEqual(source, original);
});

test('ambiguous duplicate stairs on one floor reject preparation', () => {
  const source = fixture();
  source.domains.sceneConfig.mapLevels.baseStairs.push(structuredClone(source.domains.sceneConfig.mapLevels.baseStairs[0]));
  assert.throws(() => prepare(source), /unique IDs within each floor/);
});
