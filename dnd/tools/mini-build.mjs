#!/usr/bin/env node
// Build a 3D mini (.glb) from a mini recipe (.mini.json). See docs/vtt-3d-minis.md.
//
//   node dnd/tools/mini-build.mjs dnd/tools/minis/werewolf.mini.json
//   node dnd/tools/mini-build.mjs recipe.mini.json --out "C:\creatures\werewolf.glb"
//
// A recipe is a list of simple shapes (box, sphere, capsule, cylinder, cone, torus, lathe) with a
// position, a turn and a size each, in squares (1 = one 5-foot square, y up, feet at 0, facing +Z),
// grouped and mirrored as needed, and painted with named materials. The tool writes one binary
// glTF with everything inside it, one mesh per material, and checks it by the same rules as the
// site. No other program is needed: the shapes are the VTT's own three.js.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
const THREE_URL = pathToFileURL(path.join(repository, 'dnd/vtt/board3d/lib/three.module.js')).href;
const RULES_URL = pathToFileURL(path.join(repository, 'dnd/vtt/assets/js/ui/mini-model.js')).href;

export class RecipeError extends Error {}

const SHAPES = {
  box: (T, p) => new T.BoxGeometry(...vector(p.size, [1, 1, 1], 'size')),
  sphere: (T, p) => new T.SphereGeometry(number(p.radius, 0.5, 'radius'), whole(p.segments, 16, 3, 64), whole(p.rings, 10, 2, 48)),
  capsule: (T, p) => new T.CapsuleGeometry(number(p.radius, 0.25, 'radius'), number(p.length, 0.5, 'length'), whole(p.capSegments, 4, 1, 16), whole(p.segments, 12, 3, 64)),
  cylinder: (T, p) => new T.CylinderGeometry(number(p.radiusTop ?? p.radius, 0.5, 'radiusTop'), number(p.radiusBottom ?? p.radius, 0.5, 'radiusBottom'), number(p.height, 1, 'height'), whole(p.segments, 14, 3, 64), 1, p.open === true),
  cone: (T, p) => new T.ConeGeometry(number(p.radius, 0.5, 'radius'), number(p.height, 1, 'height'), whole(p.segments, 12, 3, 64), 1, p.open === true),
  torus: (T, p) => new T.TorusGeometry(number(p.radius, 0.5, 'radius'), number(p.tube, 0.1, 'tube'), whole(p.tubeSegments, 8, 3, 48), whole(p.segments, 24, 3, 96), (number(p.arc, 360, 'arc') * Math.PI) / 180),
  // A profile [[radius, height], ...] turned around the y axis: vases, hats, skirts, horns.
  lathe: (T, p) => {
    if (!Array.isArray(p.points) || p.points.length < 2) throw new RecipeError('A lathe needs "points": at least two [radius, height] pairs.');
    return new T.LatheGeometry(p.points.map((pair, i) => new T.Vector2(...vector(pair, null, `points[${i}]`, 2))), whole(p.segments, 16, 3, 64));
  },
};

function number(value, fallback, name) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RecipeError(`"${name}" must be a number.`);
  return n;
}
function whole(value, fallback, low, high) {
  const n = Math.round(number(value, fallback, 'segments'));
  return Math.min(high, Math.max(low, n));
}
function vector(value, fallback, name, length = 3) {
  if (value === undefined || value === null) {
    if (fallback) return fallback;
    throw new RecipeError(`"${name}" is needed.`);
  }
  if (typeof value === 'number' && length === 3) return [value, value, value];
  if (!Array.isArray(value) || value.length !== length || !value.every((v) => Number.isFinite(Number(v)))) throw new RecipeError(`"${name}" must be ${length} numbers.`);
  return value.map(Number);
}

/** "#c08040" → linear [r, g, b], as glTF's colours are. */
function linearColor(hex, name) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!match) throw new RecipeError(`${name} must be a colour like "#c08040".`);
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [0, 2, 4].map((i) => toLinear(parseInt(match[1].slice(i, i + 2), 16) / 255));
}

/** The transform of a part or group: position, rotation (degrees, applied x then y then z) and scale. */
function partMatrix(T, part) {
  const position = new T.Vector3(...vector(part.position, [0, 0, 0], 'position'));
  const [rx, ry, rz] = vector(part.rotation, [0, 0, 0], 'rotation').map((d) => (d * Math.PI) / 180);
  const quaternion = new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'XYZ'));
  const scale = new T.Vector3(...vector(part.scale, [1, 1, 1], 'scale'));
  return new T.Matrix4().compose(position, quaternion, scale);
}

/**
 * Turns a recipe into geometry pieces: [{material, positions:Float32Array, normals, indices}],
 * each already moved into place. `mirror: "x"` on a part or group adds its reflection across x = 0.
 */
function collect(T, parts, parent, materials, out, trail) {
  if (!Array.isArray(parts)) throw new RecipeError(`${trail || 'The recipe'} needs "parts": a list.`);
  parts.forEach((part, index) => {
    const where = `${trail ? `${trail} › ` : ''}${part?.name || `part ${index + 1}`}`;
    if (!part || typeof part !== 'object') throw new RecipeError(`${where} is not an object.`);
    const mirrors = part.mirror === 'x' ? [false, true] : part.mirror === undefined ? [false] : (() => { throw new RecipeError(`${where}: "mirror" may only be "x".`); })();
    for (const mirrored of mirrors) {
      let matrix = new T.Matrix4().multiplyMatrices(parent, partMatrix(T, part));
      if (mirrored) matrix = new T.Matrix4().makeScale(-1, 1, 1).multiply(matrix);
      if (Array.isArray(part.parts)) { collect(T, part.parts, matrix, materials, out, where); continue; }
      const make = SHAPES[part.shape];
      if (!make) throw new RecipeError(`${where}: "shape" must be one of ${Object.keys(SHAPES).join(', ')} (or give "parts" for a group).`);
      const material = part.material ?? 'default';
      if (!materials.has(material)) throw new RecipeError(`${where}: there is no material "${material}".`);
      let geometry;
      try { geometry = make(T, part); } catch (error) { throw error instanceof RecipeError ? new RecipeError(`${where}: ${error.message}`) : error; }
      const flat = materials.get(material).flat === true;
      if (flat) geometry = geometry.toNonIndexed();
      // applyMatrix4 also turns the normals (with the reflection, when mirrored).
      geometry.applyMatrix4(matrix);
      const index = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
      // A reflection (a mirror, or a negative scale) turns faces inside out; turn their winding back.
      if (matrix.determinant() < 0) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
      if (flat) faceNormals(geometry.attributes.position.array, geometry.attributes.normal.array, index);
      out.push({ material, positions: Float32Array.from(geometry.attributes.position.array), normals: Float32Array.from(geometry.attributes.normal.array), indices: index });
      geometry.dispose();
    }
  });
}

/** Flat shading: each triangle's own normal on its three (unshared) corners. */
function faceNormals(positions, normals, index) {
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i] * 3, index[i + 1] * 3, index[i + 2] * 3];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (const v of [a, b, c]) { normals[v] = nx; normals[v + 1] = ny; normals[v + 2] = nz; }
  }
}

function readMaterials(recipe) {
  const materials = new Map([['default', { color: '#9a9a9a', roughness: 0.7, metalness: 0 }]]);
  for (const [name, m] of Object.entries(recipe.materials ?? {})) {
    if (!m || typeof m !== 'object') throw new RecipeError(`Material "${name}" is not an object.`);
    materials.set(name, m);
  }
  return materials;
}

/** Builds the .glb bytes and its check. Returns {bytes: Uint8Array, check, triangles}. */
export async function buildMini(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) throw new RecipeError('A recipe is a JSON object with "parts".');
  const T = await import(THREE_URL);
  const rules = await import(RULES_URL);
  const materials = readMaterials(recipe);
  const pieces = [];
  collect(T, recipe.parts, new T.Matrix4(), materials, pieces, '');
  if (!pieces.length) throw new RecipeError('The recipe has no shapes.');

  // One mesh per material, in the order the materials are first used.
  const groups = new Map();
  for (const piece of pieces) {
    if (!groups.has(piece.material)) groups.set(piece.material, []);
    groups.get(piece.material).push(piece);
  }
  const json = { asset: { version: '2.0', generator: 'gmscreen mini-build' }, scene: 0, scenes: [{ name: String(recipe.name || 'Mini'), nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  const chunks = [];
  let byteLength = 0, triangles = 0, usesEmissiveStrength = false;
  const addView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const padding = (4 - (byteLength % 4)) % 4;
    if (padding) { chunks.push(new Uint8Array(padding)); byteLength += padding; }
    json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, target });
    chunks.push(bytes);
    byteLength += bytes.byteLength;
    return json.bufferViews.length - 1;
  };
  for (const [name, list] of groups) {
    const vertexCount = list.reduce((sum, p) => sum + p.positions.length / 3, 0);
    const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), indices = [];
    let base = 0;
    for (const piece of list) {
      positions.set(piece.positions, base * 3);
      normals.set(piece.normals, base * 3);
      for (const i of piece.indices) indices.push(i + base);
      base += piece.positions.length / 3;
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
    const indexArray = vertexCount > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices);
    json.accessors.push({ bufferView: addView(positions, 34962), componentType: 5126, count: vertexCount, type: 'VEC3', min, max });
    const positionAccessor = json.accessors.length - 1;
    json.accessors.push({ bufferView: addView(normals, 34962), componentType: 5126, count: vertexCount, type: 'VEC3' });
    const normalAccessor = json.accessors.length - 1;
    json.accessors.push({ bufferView: addView(indexArray, 34963), componentType: indexArray instanceof Uint32Array ? 5125 : 5123, count: indexArray.length, type: 'SCALAR' });
    triangles += indexArray.length / 3;
    const m = materials.get(name);
    const material = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [...linearColor(m.color ?? '#9a9a9a', `Material "${name}" colour`), Math.min(1, Math.max(0, number(m.opacity, 1, 'opacity')))],
        metallicFactor: Math.min(1, Math.max(0, number(m.metalness, 0, 'metalness'))),
        roughnessFactor: Math.min(1, Math.max(0, number(m.roughness, 0.7, 'roughness'))),
      },
    };
    if (m.emissive) {
      material.emissiveFactor = linearColor(m.emissive, `Material "${name}" emissive`);
      const strength = number(m.emissiveIntensity, 1, 'emissiveIntensity');
      if (strength > 1) { material.extensions = { KHR_materials_emissive_strength: { emissiveStrength: strength } }; usesEmissiveStrength = true; }
    }
    if (material.pbrMetallicRoughness.baseColorFactor[3] < 1) material.alphaMode = 'BLEND';
    if (m.doubleSided === true) material.doubleSided = true;
    json.materials.push(material);
    json.meshes.push({ name, primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: json.accessors.length - 1, material: json.materials.length - 1, mode: 4 }] });
    json.nodes.push({ name, mesh: json.meshes.length - 1 });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  if (usesEmissiveStrength) json.extensionsUsed = ['KHR_materials_emissive_strength'];
  const padding = (4 - (byteLength % 4)) % 4;
  if (padding) { chunks.push(new Uint8Array(padding)); byteLength += padding; }
  json.buffers.push({ byteLength });

  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4).fill(0x20);
  jsonPadded.set(jsonBytes);
  jsonBytes = jsonPadded;
  const total = 12 + 8 + jsonBytes.length + 8 + byteLength;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(jsonBytes, 20);
  let offset = 20 + jsonBytes.length;
  view.setUint32(offset, byteLength, true); view.setUint32(offset + 4, 0x004e4942, true); offset += 8;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const check = rules.inspectGlb(bytes);
  if (!check.ok) throw new RecipeError(`The built model breaks the site's rules: ${check.problems.join(' ')}`);
  return { bytes, check, triangles };
}

export async function main(argv, { say = console.log } = {}) {
  const input = argv.find((word) => !word.startsWith('--'));
  const outFlag = argv.indexOf('--out');
  if (!input) { say('Usage: node dnd/tools/mini-build.mjs <recipe.mini.json> [--out <file.glb>]'); return 1; }
  let recipe;
  try { recipe = JSON.parse(await readFile(input, 'utf8')); } catch (error) { throw new RecipeError(`${input} is not a readable JSON recipe: ${error.message}`); }
  const out = outFlag >= 0 && argv[outFlag + 1] ? argv[outFlag + 1] : input.replace(/(\.mini)?\.json$/i, '') + '.glb';
  const { bytes, check } = await buildMini(recipe);
  await writeFile(out, bytes);
  const rules = await import(RULES_URL);
  say(`Built ${out}: ${rules.describeGlbStats(check.stats)}.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error instanceof RecipeError ? error.message : `The mini builder stopped: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
