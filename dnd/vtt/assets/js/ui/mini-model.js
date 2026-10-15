// 3D minis: the one place that says what a monster's model is, which files are accepted, and how
// a model is fitted to its token. Used by the 3D board, the Monster Creator and the upload tool
// (dnd/tools/site-upload.mjs), in the browser and in Node. See docs/vtt-3d-minis.md.
//
// A monster's model is stored on the monster as
//   model: { file: "mini_<sha256 first 24 hex>.glb", scale: 1, yaw: 0, lift: 0 }
// and travels to the board on the placement as the same object (placement.model), so players,
// who never receive a monster's stat block, still see the mini.
//
// The PHP rules that match these are in dnd/strixhaven/monster-creator/includes/model-store.php.

export const MINI_MODEL_DIR = '/dnd/strixhaven/monster-creator/models/';
export const MINI_MODEL_MAX_BYTES = 12 * 1024 * 1024;
export const MINI_MODEL_MAX_TRIANGLES = 200000;
export const MINI_MODEL_MAX_IMAGES = 16;
/** A stored model's name: made by the server from the file's own content, never by an uploader. */
export const MINI_MODEL_FILE_PATTERN = /^mini_[a-f0-9]{24}\.glb$/;
/** glTF extensions three.js r160 reads without an extra decoder. Draco and meshopt need one. */
export const MINI_MODEL_SUPPORTED_EXTENSIONS = Object.freeze([
  'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_mesh_quantization', 'KHR_materials_emissive_strength',
  'KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_clearcoat', 'KHR_materials_sheen',
  'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_iridescence', 'KHR_materials_anisotropy',
  'KHR_lights_punctual',
]);

const SCALE_RANGE = [0.25, 4];
const LIFT_RANGE = [-2, 4];

function clamp(value, [low, high], fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(high, Math.max(low, number));
}

/** The address a stored model is served from. */
export function miniModelUrl(file) {
  return MINI_MODEL_FILE_PATTERN.test(file) ? MINI_MODEL_DIR + file : null;
}

/**
 * A monster's or placement's model in its one accepted shape, or null.
 * Accepts {file} or {url} (the url must be a stored model's own address). Nothing else is ever
 * turned into an address, so a placement cannot point a player's browser anywhere else.
 */
export function normalizeMiniModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let file = typeof value.file === 'string' ? value.file.trim() : '';
  if (!file && typeof value.url === 'string' && value.url.startsWith(MINI_MODEL_DIR)) {
    file = value.url.slice(MINI_MODEL_DIR.length).split(/[?#]/)[0];
  }
  if (!MINI_MODEL_FILE_PATTERN.test(file)) return null;
  const yaw = Number(value.yaw);
  return {
    file,
    url: MINI_MODEL_DIR + file,
    scale: clamp(value.scale, SCALE_RANGE, 1),
    // Degrees, turned toward +X from facing +Z, kept within -180..180.
    yaw: Number.isFinite(yaw) ? ((((yaw + 180) % 360) + 360) % 360) - 180 : 0,
    lift: clamp(value.lift, LIFT_RANGE, 0),
  };
}

/** What is saved on a monster or a placement: the file and the three settings, nothing derived. */
export function storedMiniModel(value) {
  const model = normalizeMiniModel(value);
  return model ? { file: model.file, scale: model.scale, yaw: model.yaw, lift: model.lift } : null;
}

/**
 * The scale that fits a model to its token. The model's widest side across the ground fills
 * 92% of the footprint, unless that would make it taller than 1.5 squares per square of
 * footprint; then its height decides. `scale` multiplies the result.
 * `size` is the model's bounding box {x, y, z} in its own units (y is up).
 */
export function miniModelFitScale(size, footprint = 1, scale = 1) {
  const across = Math.max(Number(size?.x) || 0, Number(size?.z) || 0);
  const tall = Number(size?.y) || 0;
  const squares = Math.max(1, Number(footprint) || 1);
  const fits = [];
  if (across > 1e-6) fits.push((0.92 * squares) / across);
  if (tall > 1e-6) fits.push((1.5 * squares) / tall);
  if (!fits.length) return 1;
  return Math.min(...fits) * clamp(scale, SCALE_RANGE, 1);
}

// ---- checking a .glb file --------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function bytesOf(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('A .glb file is read as bytes.');
}

/**
 * Checks a .glb file the way the server does. Returns
 * {ok, problems: [plain sentences], stats: {bytes, meshes, primitives, triangles, nodes, materials,
 * images, animations, skins}}. A file is accepted only when everything it needs is inside it.
 */
export function inspectGlb(input) {
  const problems = [];
  const stats = { bytes: 0, meshes: 0, primitives: 0, triangles: 0, nodes: 0, materials: 0, images: 0, animations: 0, skins: 0 };
  let bytes;
  try { bytes = bytesOf(input); } catch (error) { return { ok: false, problems: [error.message], stats }; }
  stats.bytes = bytes.byteLength;
  if (bytes.byteLength > MINI_MODEL_MAX_BYTES) problems.push(`The file is ${(bytes.byteLength / 1048576).toFixed(1)} MB; a mini may be at most ${MINI_MODEL_MAX_BYTES / 1048576} MB.`);
  if (bytes.byteLength < 20) return { ok: false, problems: ['It is not a .glb file (too short).'], stats };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return { ok: false, problems: ['It is not a .glb file (a binary glTF starts with "glTF").'], stats };
  if (view.getUint32(4, true) !== 2) return { ok: false, problems: ['It is not glTF 2.0.'], stats };
  if (view.getUint32(8, true) !== bytes.byteLength) return { ok: false, problems: ['The file is cut short or has extra bytes at its end.'], stats };
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLength > bytes.byteLength) return { ok: false, problems: ['Its first part is not the glTF description.'], stats };
  let json;
  try { json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))); }
  catch { return { ok: false, problems: ['Its glTF description is not valid JSON.'], stats }; }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, problems: ['Its glTF description is not an object.'], stats };
  let binLength = 0;
  let offset = 20 + jsonLength;
  if (offset + 8 <= bytes.byteLength) {
    binLength = view.getUint32(offset, true);
    if (view.getUint32(offset + 4, true) !== CHUNK_BIN || offset + 8 + binLength > bytes.byteLength) problems.push('Its second part is not the binary data.');
  }
  if (!String(json.asset?.version ?? '').startsWith('2.')) problems.push('Its glTF description does not say version 2.');

  const list = (key) => (Array.isArray(json[key]) ? json[key] : []);
  list('buffers').forEach((buffer, index) => {
    if (buffer && typeof buffer === 'object' && 'uri' in buffer) problems.push(`Buffer ${index} points to a file outside the .glb ("${String(buffer.uri).slice(0, 40)}"). Everything must be inside the one file.`);
  });
  list('images').forEach((image, index) => {
    if (!image || typeof image !== 'object') return;
    if ('uri' in image) problems.push(`Image ${index} points to a picture outside the .glb. Pack textures into the file.`);
    else if (!['image/png', 'image/jpeg'].includes(image.mimeType)) problems.push(`Image ${index} is ${image.mimeType || 'of no stated kind'}; use PNG or JPEG textures.`);
  });
  const required = Array.isArray(json.extensionsRequired) ? json.extensionsRequired : [];
  for (const name of required) {
    if (!MINI_MODEL_SUPPORTED_EXTENSIONS.includes(String(name))) problems.push(`It needs the glTF extension ${name}, which the board cannot read (export without Draco or meshopt compression).`);
  }

  const accessors = list('accessors');
  for (const mesh of list('meshes')) {
    stats.meshes += 1;
    for (const primitive of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      stats.primitives += 1;
      const mode = primitive?.mode ?? 4;
      const counted = Number.isInteger(primitive?.indices) ? accessors[primitive.indices]?.count : accessors[primitive?.attributes?.POSITION]?.count;
      const count = Number.isFinite(counted) ? counted : 0;
      if (mode === 4) stats.triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) stats.triangles += Math.max(0, count - 2);
    }
  }
  stats.nodes = list('nodes').length;
  stats.materials = list('materials').length;
  stats.images = list('images').length;
  stats.animations = list('animations').length;
  stats.skins = list('skins').length;
  if (!stats.meshes) problems.push('It has no meshes: there is nothing to draw.');
  if (stats.triangles > MINI_MODEL_MAX_TRIANGLES) problems.push(`It has ${stats.triangles} triangles; a mini may have at most ${MINI_MODEL_MAX_TRIANGLES}.`);
  if (stats.images > MINI_MODEL_MAX_IMAGES) problems.push(`It has ${stats.images} textures; a mini may have at most ${MINI_MODEL_MAX_IMAGES}.`);
  return { ok: problems.length === 0, problems, stats, binLength };
}

/** "1.2 MB, 4 meshes, 5,120 triangles, 2 textures". */
export function describeGlbStats(stats) {
  if (!stats) return '';
  const parts = [`${(stats.bytes / 1048576).toFixed(stats.bytes < 104858 ? 2 : 1)} MB`, `${stats.meshes} mesh${stats.meshes === 1 ? '' : 'es'}`,
    `${Number(stats.triangles).toLocaleString('en-US')} triangles`];
  if (stats.images) parts.push(`${stats.images} texture${stats.images === 1 ? '' : 's'}`);
  if (stats.animations) parts.push(`${stats.animations} animation${stats.animations === 1 ? '' : 's'}`);
  return parts.join(', ');
}
