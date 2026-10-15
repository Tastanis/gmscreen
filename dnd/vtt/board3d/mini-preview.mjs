// A small turntable for a 3D mini, for the Monster Creator (docs/vtt-3d-minis.md). The model is
// fitted, based and turned exactly as the board does it (minis.mjs), on a grid of squares the size
// of the monster's footprint, so what is seen here is what stands on the table.
import * as THREE from 'three';
import { GLTFLoader } from './lib/addons/loaders/GLTFLoader.js';
import { createMiniLayer, MINI_BASE_TOP } from './minis.mjs';

/**
 * Opens the preview in `host` (an element with a size). `model` is {file, scale, yaw, lift};
 * `footprint` is the monster's size in squares. Returns {update(model, footprint), dispose(), ready}.
 * `ready` resolves to 'ready' or 'failed'.
 */
export function openMiniPreview(host, model, footprint = 1) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
  host.replaceChildren(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c2b31');
  scene.add(new THREE.HemisphereLight('#dfefff', '#2d3a2b', 1.4));
  const sun = new THREE.DirectionalLight('#fff3df', 2.2);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);

  let squares = Math.max(1, Number(footprint) || 1);
  let current = model;
  const floor = new THREE.Group();
  scene.add(floor);
  function buildFloor() {
    floor.clear();
    const size = squares + 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: '#3b4a3c', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    floor.add(ground);
    const grid = new THREE.GridHelper(size, size, '#7d8f74', '#56664f');
    grid.position.y = 0.002;
    floor.add(grid);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * squares, 0.44 * squares, 0.1, 32), new THREE.MeshStandardMaterial({ color: '#162d37', roughness: 0.35, metalness: 0.4 }));
    base.position.y = MINI_BASE_TOP - 0.05;
    base.receiveShadow = true;
    floor.add(base);
    // The grid is (footprint + 2) squares across, centred on the mini, so the mini's own
    // squares are whole grid squares whatever its size.
  }
  buildFloor();

  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const minis = createMiniLayer(scene, { loader: new GLTFLoader(), onLoaded: (url) => resolveReady(minis.status(url)) });
  const record = () => ({ id: 'preview', x: 0, y: 0, z: 0, width: squares, height: squares, model: current });

  let angle = 0.6, tilt = 0.42, distance = 2.6 * squares + 1.2, spinning = true, dragging = null, last = performance.now(), frame = 0;
  canvas.addEventListener('pointerdown', (event) => { dragging = { x: event.clientX, y: event.clientY }; spinning = false; canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    angle -= (event.clientX - dragging.x) * 0.01;
    tilt = Math.min(1.35, Math.max(0.05, tilt + (event.clientY - dragging.y) * 0.006));
    dragging = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', () => { dragging = null; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); distance = Math.min(30, Math.max(0.8, distance * (event.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });

  function render(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const width = host.clientWidth || 320, height = host.clientHeight || 240;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    if (spinning) angle += dt * 0.5;
    const target = new THREE.Vector3(0, 0.6 * squares, 0);
    camera.position.set(Math.sin(angle) * Math.cos(tilt) * distance, target.y + Math.sin(tilt) * distance, Math.cos(angle) * Math.cos(tilt) * distance);
    camera.lookAt(target);
    minis.update([record()], dt);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);

  return {
    ready,
    canvas,
    update(nextModel, nextFootprint = squares) {
      current = nextModel;
      const next = Math.max(1, Number(nextFootprint) || 1);
      if (next !== squares) { squares = next; distance = 2.6 * squares + 1.2; buildFloor(); }
    },
    dispose() { cancelAnimationFrame(frame); minis.dispose(); renderer.dispose(); host.replaceChildren(); },
  };
}
