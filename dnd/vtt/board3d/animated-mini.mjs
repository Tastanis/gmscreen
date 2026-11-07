// GM Screen integration helper. Uses the VTT's existing three.js import map.
import * as THREE from 'three';

export function createAnimatedMini(template, clips) {
  const root = template.clone(true);
  const clones = new Map();
  function pair(source, clone) {
    clones.set(source, clone);
    source.children.forEach((child, i) => pair(child, clone.children[i]));
  }
  pair(template, root);
  template.traverse(source => {
    if (!source.isSkinnedMesh) return;
    const clone = clones.get(source);
    clone.skeleton = new THREE.Skeleton(
      source.skeleton.bones.map(bone => clones.get(bone)),
      source.skeleton.boneInverses.map(matrix => matrix.clone()),
    );
    // glTF inverse binds already convert mesh coordinates to joint space.
    // The current GM Screen reader supplies matrixWorld as the bind matrix;
    // neutralize that extra transform so a translated rig is not offset twice.
    clone.bindMatrix.identity();
    clone.bindMatrixInverse.copy(clone.matrixWorld).invert();
    // Conservative animated bounds: don't cull a curled arm from its rest pose.
    clone.frustumCulled = false;
  });
  const levels = root.children.filter(child => /_lod\d+$/.test(child.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (levels.length > 1) {
    const lod = new THREE.LOD();
    levels.forEach((child, i) => lod.addLevel(child, [0, 4, 10][i] ?? i * 10));
    root.add(lod);
  }
  const mixer = new THREE.AnimationMixer(root);
  clips.forEach(clip => mixer.clipAction(clip).play());
  return {
    root, mixer,
    update(dt, camera) {
      mixer.update(Math.max(0, Math.min(dt, 0.1)));
      root.updateMatrixWorld(true);
      if (camera) root.traverse(o => { if (o.isLOD) o.update(camera); });
    },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(root);
      const skeletons = new Set();
      root.traverse(o => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); });
      for (const skeleton of skeletons) skeleton.dispose();
      root.removeFromParent();
    },
  };
}
