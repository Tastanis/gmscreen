// 3D minis on the board: a token whose placement names a model (placement.model) is drawn as that
// model standing on its base, instead of as its picture. Everything else about the token (its
// card with the HP bar and badges, picking, dragging, rules) stays as it is. See docs/vtt-3d-minis.md.
//
// A model is loaded once per address and shared; each token gets its own copy. While a model is
// loading, or if it cannot be loaded, the token keeps its picture.
import * as THREE from 'three';
import { GLTFLoader } from './lib/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from './lib/addons/utils/SkeletonUtils.js';
import { normalizeMiniModel, miniModelFitScale } from '../assets/js/ui/mini-model.js';

/** The top of a token's base above the ground it stands on (scene-view.mjs draws the base). */
export const MINI_BASE_TOP = 0.17;

export function createMiniLayer(scene, { loader = new GLTFLoader(), onLoaded = () => {} } = {}) {
  const root = new THREE.Group();
  root.name = 'vtt3d-minis';
  scene.add(root);
  const models = new Map(); // url -> {status:'loading'|'ready'|'failed', template, size, center, bottom, animations, skinned}
  const minis = new Map(); // placement id -> {url, holder, pivot, mixer, key}

  function load(url) {
    if (models.has(url)) return models.get(url);
    const entry = { status: 'loading' };
    models.set(url, entry);
    loader.loadAsync(url).then((gltf) => {
      const template = gltf.scene || gltf.scenes?.[0];
      if (!template) throw new Error('The model has no scene.');
      let skinned = false;
      template.traverse((child) => {
        if (child.isSkinnedMesh) skinned = true;
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      template.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(template);
      if (box.isEmpty()) throw new Error('The model is empty.');
      Object.assign(entry, {
        status: 'ready', template, skinned, animations: gltf.animations || [],
        size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), bottom: box.min.y,
      });
      onLoaded(url);
    }).catch((error) => {
      entry.status = 'failed';
      entry.error = error;
      console.warn('[VTT 3D] A mini could not be loaded; its token keeps its picture.', url, error?.message || error);
      onLoaded(url);
    });
    return entry;
  }

  function build(entry) {
    const copy = entry.skinned ? cloneSkinned(entry.template) : entry.template.clone(true);
    // The model's feet at the pivot, centred on it across the ground.
    copy.position.set(-entry.center.x, -entry.bottom, -entry.center.z);
    const pivot = new THREE.Group();
    pivot.add(copy);
    const holder = new THREE.Group();
    holder.add(pivot);
    let mixer = null;
    if (entry.animations.length) {
      mixer = new THREE.AnimationMixer(copy);
      const idle = entry.animations.find((clip) => /idle/i.test(clip.name)) || entry.animations[0];
      mixer.clipAction(idle).play();
    }
    return { holder, pivot, mixer };
  }

  function drop(id) {
    const mini = minis.get(id);
    if (!mini) return;
    root.remove(mini.holder);
    mini.mixer?.stopAllAction();
    minis.delete(id);
  }

  /**
   * records: [{id, x, y, z, width, height, model}] in squares (x = column, y = row, z = height),
   * only the tokens that should be seen. Returns the ids now drawn as minis.
   */
  let moved = false;
  function update(records, dt = 0) {
    const shown = new Set();
    moved = false;
    for (const record of records) {
      const model = normalizeMiniModel(record.model);
      if (!model) continue;
      const entry = load(model.url);
      if (entry.status !== 'ready') continue;
      let mini = minis.get(record.id);
      if (mini && mini.url !== model.url) { drop(record.id); mini = null; }
      if (!mini) { mini = { url: model.url, ...build(entry), key: '' }; minis.set(record.id, mini); root.add(mini.holder); moved = true; }
      const footprint = Math.max(Number(record.width) || 1, Number(record.height) || 1);
      const key = [record.x, record.y, record.z, footprint, model.scale, model.yaw, model.lift].join('|');
      if (key !== mini.key) {
        mini.key = key;
        moved = true;
        const fit = miniModelFitScale(entry.size, footprint, model.scale);
        mini.pivot.scale.setScalar(fit);
        // How far above the ground under the token the model's top is, in squares.
        mini.top = MINI_BASE_TOP + model.lift + entry.size.y * fit;
        mini.pivot.rotation.y = (model.yaw * Math.PI) / 180;
        mini.holder.position.set(record.x, (Number(record.z) || 0) + MINI_BASE_TOP + model.lift, record.y);
      }
      if (mini.mixer) { mini.mixer.update(dt); moved = true; }
      shown.add(record.id);
    }
    for (const id of [...minis.keys()]) if (!shown.has(id)) { drop(id); moved = true; }
    return shown;
  }

  function status(url) { return models.get(url)?.status ?? null; }
  /** The top of a drawn mini above the ground under its token, in squares, or null. */
  function topOf(id) { return minis.get(id)?.top ?? null; }
  function dispose() { for (const id of [...minis.keys()]) drop(id); scene.remove(root); }
  /** Whether the last update moved, added or removed a mini (the board then redraws its shadows). */
  return { root, update, status, topOf, dispose, get count() { return minis.size; }, get moved() { return moved; } };
}
