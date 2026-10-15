import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 3D minis (docs/vtt-3d-minis.md): the model's one saved shape, which files are accepted, how a
// model is fitted to its token, that it rides on placements, the Director's model list, the mini
// builder, and the upload tool sending a creature's .glb before the creature. The server's side is
// mini-models.test.php, run at the end.
import {
  normalizeMiniModel, storedMiniModel, miniModelUrl, miniModelFitScale, inspectGlb, describeGlbStats,
  MINI_MODEL_DIR, MINI_MODEL_FILE_PATTERN,
} from '../mini-model.js';
import { loadMonsterModels, monsterModelFor, resetMonsterModels } from '../monster-models.js';
import { normalizePlacements } from '../../state/normalize/placements.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../../../..');
const { buildMini, RecipeError } = await import(path.join(repository, 'dnd/tools/mini-build.mjs'));
const file = 'mini_' + 'a1'.repeat(12) + '.glb';
const scratch = await mkdtemp(path.join(os.tmpdir(), 'vtt-minis-'));
test.after(() => rm(scratch, { recursive: true, force: true }));

test('a model has one saved shape, and only a stored model becomes an address', () => {
  assert.deepEqual(normalizeMiniModel({ file }), { file, url: MINI_MODEL_DIR + file, scale: 1, yaw: 0, lift: 0 });
  assert.deepEqual(storedMiniModel({ url: MINI_MODEL_DIR + file + '?v=3', scale: 9, yaw: 270, lift: -7, extra: 1 }), { file, scale: 4, yaw: -90, lift: -2 });
  assert.equal(miniModelUrl(file), MINI_MODEL_DIR + file);
  for (const bad of [null, [], 'x', { file: 'werewolf.glb' }, { file: '../' + file }, { url: 'https://example.invalid/' + file }, { url: '/dnd/vtt/storage/' + file }, { file: file + '.php' }]) {
    assert.equal(normalizeMiniModel(bad), null, JSON.stringify(bad));
  }
  assert.equal(MINI_MODEL_FILE_PATTERN.test('MINI_' + 'a'.repeat(24) + '.glb'), false);
});

test('a model is fitted to its footprint: 92% across, at most 1.5 squares tall per square', () => {
  assert.equal(miniModelFitScale({ x: 1, y: 0.5, z: 1 }, 1), 0.92); // wide and low: width decides
  assert.equal(miniModelFitScale({ x: 0.5, y: 3, z: 0.4 }, 1), 0.5); // tall and thin: height decides
  assert.equal(miniModelFitScale({ x: 2, y: 1, z: 1 }, 2), 0.92); // a 2x2 creature
  assert.equal(miniModelFitScale({ x: 1, y: 0.5, z: 1 }, 1, 2), 1.84); // scale multiplies
  assert.equal(miniModelFitScale({ x: 0, y: 0, z: 0 }, 1), 1); // nothing to measure
});

test('a model rides on the placement, for players as well, and nothing else is kept from it', () => {
  const placements = normalizePlacements({ s: [{ id: 'p', column: 1, row: 2, name: 'Wolf', model: { file, scale: 2, url: 'https://evil.invalid/x' } }, { id: 'q', column: 0, row: 0, model: { file: 'nope.glb' } }] });
  assert.deepEqual(placements.s.find((p) => p.id === 'p').model, { file, scale: 2, yaw: 0, lift: 0 });
  assert.equal(placements.s.find((p) => p.id === 'q').model, undefined);
});

test('the Director\'s model list: each monster\'s current mini, read again at most every 20 seconds', async () => {
  resetMonsterModels();
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ data: [{ id: 'wolf', model: { file, scale: 1.5 } }, { id: 'goblin' }, { id: 'bad', model: { file: 'x.glb' } }] }) }; };
  await loadMonsterModels('/dnd/vtt/api/monsters.php', { fetchImpl });
  assert.deepEqual(monsterModelFor('wolf'), { file, scale: 1.5, yaw: 0, lift: 0 });
  assert.equal(monsterModelFor('goblin'), null);
  assert.equal(monsterModelFor('bad'), null);
  await loadMonsterModels('/dnd/vtt/api/monsters.php', { fetchImpl });
  assert.equal(calls, 1, 'not read again within 20 seconds');
  await loadMonsterModels('/dnd/vtt/api/monsters.php', { fetchImpl: async () => { throw new Error('offline'); }, maxAgeMs: 0 });
  assert.deepEqual(monsterModelFor('wolf')?.file, file, 'a failed read keeps what it had');
  resetMonsterModels();
});

/** Every triangle's winding against its stored normals: outward when they agree. */
function outwardShare(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const bin = 20 + jsonLength + 8;
  let agree = 0, total = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    const read = (accessor, Type, size) => { const a = json.accessors[accessor], v = json.bufferViews[a.bufferView]; return new Type(bytes.buffer.slice(bytes.byteOffset + bin + v.byteOffset, bytes.byteOffset + bin + v.byteOffset + v.byteLength)).slice(0, a.count * size); };
    const p = read(primitive.attributes.POSITION, Float32Array, 3), n = read(primitive.attributes.NORMAL, Float32Array, 3);
    const indexAccessor = json.accessors[primitive.indices];
    const index = read(primitive.indices, indexAccessor.componentType === 5125 ? Uint32Array : Uint16Array, 1);
    for (let i = 0; i < index.length; i += 3) {
      const [a, b, c] = [index[i] * 3, index[i + 1] * 3, index[i + 2] * 3];
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], w = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const face = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const normal = [n[a] + n[b] + n[c], n[a + 1] + n[b + 1] + n[c + 1], n[a + 2] + n[b + 2] + n[c + 2]];
      if (Math.hypot(...face) < 1e-9) continue;
      total++;
      if (face[0] * normal[0] + face[1] * normal[1] + face[2] * normal[2] > 0) agree++;
    }
  }
  return agree / total;
}

test('the mini builder makes a .glb the site accepts, one mesh per material, faces outward even when mirrored', async () => {
  const recipe = {
    name: 'Test', materials: { skin: { color: '#c08040' }, glow: { color: '#ffffff', emissive: '#ff8800', emissiveIntensity: 3 }, flat: { color: '#334455', flat: true } },
    parts: [
      { shape: 'box', size: [0.4, 0.8, 0.3], material: 'skin', position: [0, 0.4, 0] },
      { name: 'arm', mirror: 'x', position: [0.3, 0.6, 0], rotation: [0, 0, 20], parts: [{ shape: 'capsule', radius: 0.06, length: 0.3, material: 'skin' }] },
      { shape: 'sphere', radius: 0.05, material: 'glow', position: [0.08, 0.9, 0.16], mirror: 'x' },
      { shape: 'cone', radius: 0.1, height: 0.3, material: 'flat', position: [0, 1, 0], scale: [-1, 1, 1] },
      { shape: 'lathe', points: [[0, 0], [0.2, 0.05], [0.1, 0.2]], material: 'flat', position: [0, 0, 0.4] },
      { shape: 'torus', radius: 0.2, tube: 0.03, material: 'skin', position: [0, 0.2, 0], rotation: [90, 0, 0] },
      { shape: 'cylinder', radius: 0.1, height: 0.2, material: 'skin', position: [0, 0.1, -0.3] },
    ],
  };
  const { bytes, check } = await buildMini(recipe);
  assert.equal(check.ok, true, check.problems.join(' '));
  assert.equal(check.stats.meshes, 3);
  assert.ok(outwardShare(bytes) > 0.97, `faces outward: ${outwardShare(bytes)}`);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true))));
  assert.deepEqual(json.extensionsUsed, ['KHR_materials_emissive_strength']);
  assert.ok(Math.abs(json.materials[0].pbrMetallicRoughness.baseColorFactor[0] - 0.527) < 0.01, 'colours are stored linear, as glTF wants');
  assert.match(describeGlbStats(check.stats), /3 meshes/);
  await assert.rejects(buildMini({ parts: [{ shape: 'blob' }] }), RecipeError);
  await assert.rejects(buildMini({ parts: [{ shape: 'box', material: 'missing' }] }), /no material "missing"/);
  await assert.rejects(buildMini({ parts: [] }), /no shapes/);
  const wolf = await buildMini(JSON.parse(await readFile(path.join(repository, 'dnd/tools/minis/werewolf.mini.json'), 'utf8')));
  assert.equal(wolf.check.ok, true);
  assert.ok(outwardShare(wolf.bytes) > 0.97, 'the example werewolf faces outward');
});

test('a .glb is checked by the same rules as the server', async () => {
  const { bytes } = await buildMini({ parts: [{ shape: 'box' }] });
  assert.equal(inspectGlb(bytes).ok, true);
  assert.match(inspectGlb(new TextEncoder().encode('<?php echo 1; ?>' + 'x'.repeat(40))).problems.join(' '), /not a \.glb/);
  assert.match(inspectGlb(bytes.slice(0, bytes.length - 4)).problems.join(' '), /cut short/);
  // A description that asks for an outside file or for Draco.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  const rebuild = (change) => {
    let text = new TextEncoder().encode(JSON.stringify({ ...json, ...change }));
    const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20); padded.set(text); text = padded;
    const rest = bytes.subarray(20 + length);
    const out = new Uint8Array(20 + text.length + rest.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, out.length, true); v.setUint32(12, text.length, true); v.setUint32(16, 0x4e4f534a, true);
    out.set(text, 20); out.set(rest, 20 + text.length);
    return out;
  };
  assert.match(inspectGlb(rebuild({ buffers: [{ byteLength: 10, uri: 'mesh.bin' }] })).problems.join(' '), /outside the \.glb/);
  assert.match(inspectGlb(rebuild({ extensionsRequired: ['KHR_draco_mesh_compression'] })).problems.join(' '), /Draco/);
  assert.match(inspectGlb(rebuild({ images: [{ uri: 'skin.png' }] })).problems.join(' '), /outside the \.glb/);
});

test('the upload tool sends a creature\'s .glb first, then the creature naming the stored file', async () => {
  const tool = await import(path.join(repository, 'dnd/tools/site-upload.mjs'));
  const { bytes } = await buildMini({ parts: [{ shape: 'box' }] });
  const creature = { name: 'Box Golem', level: 1, abilities: { action: [] }, model: { scale: 1.5, yaw: 90 } };
  await writeFile(path.join(scratch, 'box-golem.json'), JSON.stringify(creature));
  await writeFile(path.join(scratch, 'box-golem.glb'), bytes);
  await writeFile(path.join(scratch, 'bad-golem.json'), JSON.stringify({ ...creature, name: 'Bad Golem', model: { file: 'broken.glb' } }));
  await writeFile(path.join(scratch, 'broken.glb'), 'not a model');
  await writeFile(path.join(scratch, 'kept-golem.json'), JSON.stringify({ ...creature, name: 'Kept Golem', model: { file, lift: 0.5 } }));
  const seen = [];
  const stored = 'mini_' + 'c3'.repeat(12) + '.glb';
  const fetcher = async (url, options) => {
    seen.push({ action: new URL(url).searchParams.get('action'), body: options.body });
    const action = new URL(url).searchParams.get('action');
    const body = action === 'creature-model' ? { success: true, result: { file: stored, stored: true } }
      : { success: true, result: { creatures: JSON.parse(options.body).creatures.map((c) => ({ file: c.file, name: c.monster.name, action: 'created', abilities: 0, tab: 'Imported / General' })) } };
    return { status: 200, ok: true, json: async () => body };
  };
  const outcome = await tool.uploadCreatures({ site: 'https://site.invalid', key: 'k'.repeat(40) }, scratch, {}, { fetcher });
  assert.deepEqual(seen.map((s) => s.action), ['creature-model', 'creature-import']);
  assert.ok(Buffer.from(seen[0].body).equals(Buffer.from(bytes)), 'the .glb itself is the body');
  const sent = JSON.parse(seen[1].body).creatures;
  assert.deepEqual(sent.find((c) => c.monster.name === 'Box Golem').monster.model, { file: stored, scale: 1.5, yaw: 90, lift: 0 });
  assert.deepEqual(sent.find((c) => c.monster.name === 'Kept Golem').monster.model, { file, scale: 1, yaw: 0, lift: 0.5 }, 'a stored model already named needs nothing sent');
  assert.equal(sent.some((c) => c.monster.name === 'Bad Golem'), false, 'a creature whose model is refused is not sent');
  const refusal = outcome.refused.find((r) => r.file === 'bad-golem.json');
  assert.match(refusal.reason, /broken\.glb was not accepted/);
  const report = tool.creatureReport(outcome).join('\n');
  assert.match(report, /box-golem\.json: created "Box Golem" \(0 abilities\), in Imported \/ General, with its 3D mini box-golem\.glb/);
  assert.match(report, /bad-golem\.json: NOT uploaded\. Its 3D mini broken\.glb was not accepted/);
});

test('the server\'s rules (mini-models.test.php)', () => {
  const php = spawnSync('php', ['-r', 'echo PHP_BINARY;'], { encoding: 'utf8' }).stdout.trim();
  if (!php) return;
  const run = spawnSync(php, [path.join(repository, 'dnd/vtt/api/v2/tests/mini-models.test.php')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal((run.stdout.match(/^PASS/gm) || []).length, 3, run.stdout);
});
