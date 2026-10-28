import * as THREE from 'three';
import { makeSight } from '../assets/js/ui/vision-height.mjs';
import { supportAt } from '../assets/js/ui/stacked-surfaces.mjs';
import { resolveSupportSurfaces } from '../assets/js/ui/floor-support.js';
import { rampHeight } from '../assets/js/ui/imported-ramps.mjs';

// "Vision (test)" (Brandon, October 2026): what the viewing heroes cannot see is dimmed and greyed on the 3D board.
// Not a light: "I don't want it to look like my player is carrying a torch ... it can't interfere or be interfered
// with other lights." So it is a mask laid over the finished picture:
//  1. From each viewing hero's eyes, one depth picture of the solid board (six faces, how far the nearest surface is
//     in every direction). Made again only when a hero moves (or every few seconds, for doors and the like).
//  2. The board is drawn exactly as always, with its own lights, into a picture with its depth.
//  3. One pass over the screen: each pixel's spot on the board is farther from every hero than that hero's depth
//     picture says → nobody sees it → dimmed and greyed. The sky is left alone.
// Creatures out of sight are hidden by the board (board-interactions.js, isOutOfSightForViewer). A button beside 1st
// person; off by default; only this page changes.
//
// Who views: a player, their own hero(es); the Director, the selected tokens (nothing selected: everything shows).
const EYE = .92;            // eye height as a share of the model's height
const CUBE_SIZE = 512;      // pixels per face of a hero's depth picture
const FAR = 400;            // squares: nothing farther is seen
const DIM = .22;            // brightness left where nobody sees
const GREY = .7;            // how grey it goes there (0 = full colour, 1 = grey)
// Looks to try while testing (a second button cycles them): brightness left and how grey, where nobody sees.
const LOOKS = [
  { name: 'Grey', dim: DIM, grey: GREY },
  { name: 'Dark', dim: .07, grey: .4 },
  { name: 'Black', dim: 0, grey: 1 },
];
const MAX_VIEWERS = 4;
// Rooms (Brandon: "small things just not block vision"): the board's drawn sight walls split the map into rooms. On
// the hero's own floor, anything with no drawn wall between it and the hero is seen, whatever props, grass or carts
// stand in the way. The depth picture still decides other floors and what shows through windows and doors.
const ROOM_REACH = 36;      // squares each way from the hero that the room map covers
const ROOM_STEPS = 2;       // samples per square in the room map
const FLOOR_BELOW = .6;     // a hero's own floor: from this far below their feet...
const FLOOR_ABOVE = 2.9;    // ...to this far above (under the next storey)
const REFRESH_MS = 4000;    // the depth pictures are made again this often even when nobody moves

const waitFor = (test, ms = 200) => new Promise((resolve) => { const tick = () => (test() ? resolve() : setTimeout(tick, ms)); tick(); });

// How far the nearest surface is, written by every solid thing (instanced or not), both faces.
function distanceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { eye: { value: new THREE.Vector3() } },
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          world = instanceMatrix * world;
        #endif
        world = modelMatrix * world;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 eye;
      varying vec3 vWorld;
      void main() { gl_FragColor = vec4(distance(vWorld, eye), 0.0, 0.0, 1.0); }`,
  });
}

function compositeMaterial() {
  const uniforms = {
    tColor: { value: null }, tDepth: { value: null },
    invProj: { value: new THREE.Matrix4() }, invView: { value: new THREE.Matrix4() },
    count: { value: 0 }, dim: { value: DIM }, grey: { value: GREY },
  };
  for (let i = 0; i < MAX_VIEWERS; i += 1) {
    uniforms[`sight${i}`] = { value: null }; uniforms[`eye${i}`] = { value: new THREE.Vector3() };
    uniforms[`room${i}`] = { value: null }; uniforms[`roomBox${i}`] = { value: new THREE.Vector4(0, 0, 1, -1000) };
  }
  const sees = (i) => `if (count > ${i}) { vec3 d${i} = world - eye${i}; float r${i} = length(d${i}); if (inRoom(room${i}, roomBox${i}, world, eye${i}) || r${i} <= nearest(sight${i}, d${i}, r${i}) + 0.3 + r${i} * 0.045) seen = true; }`;
  return new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: true,
    toneMapped: true,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tColor; uniform sampler2D tDepth;
      uniform mat4 invProj; uniform mat4 invView;
      uniform int count; uniform float dim; uniform float grey;
      ${Array.from({ length: MAX_VIEWERS }, (_, i) => `uniform samplerCube sight${i}; uniform vec3 eye${i}; uniform sampler2D room${i}; uniform vec4 roomBox${i};`).join('\n')}
      // Same room: box = (left, top, span in squares, hero's ground). The map holds, per spot: r = open at the hero's
      // eye height (the hero's own floor), g = open down to the ground there (slopes, hills), b = that ground's height,
      // a = the lowest ground within a square (so a cliff face between low and high ground counts too).
      // Looked up a little toward the hero, so the face of a wall the hero looks at counts as in the room.
      const float CELLS = ${(ROOM_REACH * 2 * ROOM_STEPS).toFixed(1)};
      vec4 roomAt(sampler2D map, vec2 uv) {
        vec2 t = uv * CELLS - 0.5, f = fract(t), c = (floor(t) + 0.5) / CELLS, s = vec2(1.0 / CELLS, 0.0);
        vec3 a = texture2D(map, c).rgb, b = texture2D(map, c + s.xy).rgb, d = texture2D(map, c + s.yx).rgb, e = texture2D(map, c + s.xx).rgb;
        vec2 open = mix(mix(a.rg, b.rg, f.x), mix(d.rg, e.rg, f.x), f.y);
        vec4 here = texture2D(map, uv);
        return vec4(open, here.b, here.a);
      }
      bool inRoom(sampler2D map, vec4 box, vec3 world, vec3 eye) {
        if (box.w < -999.0) return false;
        vec2 toward = eye.xz - world.xz;
        float len = length(toward);
        vec2 at = world.xz + (len > 0.01 ? toward / len * min(len, 0.3) : vec2(0.0));
        vec2 uv = (at - box.xy) / box.z;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return false;
        vec4 room = roomAt(map, uv);
        bool ownFloor = world.y > box.w - ${FLOOR_BELOW.toFixed(2)} && world.y < box.w + ${FLOOR_ABOVE.toFixed(2)} && room.r > 0.5;
        bool onGround = world.y > min(room.a, room.b) - ${FLOOR_BELOW.toFixed(2)} && world.y < room.b + ${FLOOR_ABOVE.toFixed(2)} && room.g > 0.5;
        return ownFloor || onGround;
      }
      varying vec2 vUv;
      // The depth picture's answer for a direction, a little forgiving: the farthest of a few close directions, so a
      // wall seen edge-on is not speckled (one texel there covers a long stretch of wall).
      float nearest(samplerCube map, vec3 dir, float r) {
        vec3 n = normalize(dir);
        vec3 a = normalize(abs(n.y) < 0.9 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
        vec3 b = cross(n, a);
        float step = 0.004;
        float best = textureCube(map, n).r;
        best = max(best, textureCube(map, n + a * step).r);
        best = max(best, textureCube(map, n - a * step).r);
        best = max(best, textureCube(map, n + b * step).r);
        best = max(best, textureCube(map, n - b * step).r);
        return best;
      }
      void main() {
        vec4 color = texture2D(tColor, vUv);
        float depth = texture2D(tDepth, vUv).x;
        gl_FragDepth = depth;
        if (depth < 0.99999) {
          vec4 view = invProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          view /= view.w;
          vec3 world = (invView * view).xyz;
          bool seen = false;
          ${Array.from({ length: MAX_VIEWERS }, (_, i) => sees(i)).join('\n          ')}
          if (!seen) {
            float g = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            color.rgb = mix(color.rgb, vec3(g), grey) * dim;
          }
        }
        gl_FragColor = color;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

async function start() {
  await waitFor(() => window.vtt3dRenderer?.ready && window.vtt3dBridge && document.querySelector('[data-action="first-person"]'));
  const api = window.vtt3dRenderer, bridge = window.vtt3dBridge;
  const style = document.createElement('style');
  style.textContent = '.vtt3d-sight-button[aria-pressed="true"]{background:#5b7fa8;color:#0d1621;border-color:#a9c7e8}';
  document.head.append(style);
  const anchor = document.querySelector('[data-action="first-person"]');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = anchor.className.replace('vtt3d-first-person-button', '').trim() + ' vtt3d-sight-button';
  button.textContent = 'Vision';
  button.setAttribute('aria-pressed', 'false');
  button.dataset.action = 'sight-test';
  button.title = 'Vision for everyone: what the heroes cannot see is dimmed on every player\'s map (you see as the selected tokens see).';
  anchor.after(button);
  // Players have no say over vision (Brandon, October 27, 2026): the Director's switch and look are everyone's.
  const director = !!bridge.getContext().isGM;
  if (!director) button.style.display = 'none';
  let on = false;
  const lookButton = document.createElement('button');
  lookButton.type = 'button';
  lookButton.className = button.className.replace('vtt3d-sight-button', '').trim();
  lookButton.dataset.action = 'sight-look';
  lookButton.title = 'How the parts nobody sees look: Grey, Dark or Black. Click to switch.';
  let look = 0;
  const showLook = () => { lookButton.textContent = `Unseen: ${LOOKS[look].name}`; lookButton.style.display = director && on ? '' : 'none'; };
  button.after(lookButton);
  showLook();
  lookButton.addEventListener('click', () => {
    if (!director) return;
    look = (look + 1) % LOOKS.length;
    showLook();
    api.requestRender?.();
    send();
  });

  // The setting everyone shares (api/v2/vision.php): the Director writes it, every page reads it every few seconds.
  const VISION_URL = '/dnd/vtt/api/v2/vision.php';
  let heard = 0;
  function apply(vision) {
    if (!vision || typeof vision !== 'object') return;
    const index = Math.max(0, LOOKS.findIndex((l) => l.name === vision.look));
    const changed = on !== (vision.on === true) || look !== index;
    on = vision.on === true; look = index;
    button.setAttribute('aria-pressed', String(on));
    showLook();
    if (changed) { api.requestRender?.(); tick(); }
  }
  function send() {
    fetch(VISION_URL, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on, look: LOOKS[look].name }) })
      .then((r) => r.json()).then((j) => { if (j?.success) heard = j.vision.updatedAt; else window.UIKit?.toast?.(j?.error || 'Vision was not saved.', 'warning'); })
      .catch(() => window.UIKit?.toast?.('Vision was not saved.', 'warning'));
  }
  function listen() {
    if (document.hidden) return;
    fetch(VISION_URL, { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (!j?.success || j.vision.updatedAt === heard) return;
      heard = j.vision.updatedAt; apply(j.vision);
    }).catch(() => { /* next time */ });
  }
  listen();
  setInterval(listen, 3000);
  document.addEventListener('visibilitychange', listen);

  let bound = null;   // everything made for one board view
  let key = '';
  let madeAt = 0;

  const placements = () => bridge.getContext().placements || [];
  function viewers() {
    const ctx = bridge.getContext();
    const list = placements();
    if (ctx.isGM) {
      const picked = new Set(ctx.selectedIds || []);
      return list.filter((p) => picked.has(p.id)).slice(0, MAX_VIEWERS);
    }
    const me = String(ctx.user?.name || '').toLowerCase();
    const words = (p) => String(p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
    const own = list.filter((p) => String(p.characterProfileId || p.profileId || '').toLowerCase() === me);
    return (own.length ? own : list.filter((p) => words(p).includes(me))).slice(0, MAX_VIEWERS);
  }
  function eyeOf(p) {
    // Same spot as the 1st person camera (Brandon: "let's make them the same spot").
    try { const shared = window.vtt3dFirstPerson?.eyeOf?.(p.id); if (shared && Number.isFinite(shared.y)) return shared; } catch (_) { /* fall back */ }
    const w = p.width || 1, h = p.height || 1;
    const ground = Number(bridge.heightFor?.(p.id));
    return new THREE.Vector3(p.column + w / 2, (Number.isFinite(ground) ? ground : 0) + 1.1 * Math.max(w, h) * EYE, p.row + h / 2);
  }

  function bind(view) {
    if (bound?.view === view) return bound;
    release();
    const renderer = view.renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    const composite = compositeMaterial();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), composite);
    quad.frustumCulled = false;
    const screen = new THREE.Scene();
    screen.add(quad);
    const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const cubes = Array.from({ length: MAX_VIEWERS }, () => {
      const cube = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, { type: THREE.HalfFloatType });
      const camera = new THREE.CubeCamera(.05, FAR, cube);
      return { cube, camera };
    });
    const original = renderer.render.bind(renderer);
    const state = { view, renderer, original, target, composite, screen, screenCamera, cubes, distance: distanceMaterial(), capturing: false, eyes: [], rooms: [] };
    // Board guides (height tethers, movement paths, reach squares) go into the masked picture too: Brandon wants them
    // gone from the dark. Their own pass is then skipped.
    renderer.render = (scene, camera) => {
      if (on && !state.capturing && state.eyes.length && scene?.name === 'movement-overlay-pass') {
        if (state.guides === scene) return undefined;
        state.guides = scene;
        return original(scene, camera);
      }
      if (!on || state.capturing || scene !== view.scene || !state.eyes.length) return original(scene, camera);
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      original(scene, camera);
      if (state.guides) {
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        try { original(state.guides, camera); } finally { renderer.autoClear = autoClear; }
      }
      renderer.setRenderTarget(previous);
      const u = composite.uniforms;
      u.tColor.value = target.texture;
      u.tDepth.value = target.depthTexture;
      u.dim.value = LOOKS[look].dim;
      u.grey.value = LOOKS[look].grey;
      u.invProj.value.copy(camera.projectionMatrixInverse);
      u.invView.value.copy(camera.matrixWorld);
      original(screen, screenCamera);
    };
    bound = state;
    return state;
  }

  function release() {
    if (!bound) return;
    const state = bound;
    bound = null;
    key = '';
    state.renderer.render = state.original;
    state.target.dispose();
    state.target.depthTexture?.dispose();
    state.composite.dispose();
    state.distance.dispose();
    state.cubes.forEach(({ cube }) => cube.dispose());
    state.rooms.forEach((room) => room?.dispose());
  }

  // The hero's room map: which spots around them have no drawn sight wall between (a level line at eye height).
  function rooms(state, i, p, eye) {
    const size = ROOM_REACH * 2 * ROOM_STEPS;
    let room = state.rooms[i];
    if (!room) {
      room = state.rooms[i] = new THREE.DataTexture(new Float32Array(size * size * 4), size, size, THREE.RGBAFormat, THREE.FloatType);
      room.magFilter = THREE.NearestFilter;
      room.minFilter = THREE.NearestFilter;
    }
    const left = Math.floor(eye.x) - ROOM_REACH, top = Math.floor(eye.z) - ROOM_REACH;
    const ground = Number(bridge.heightFor?.(p.id)) || 0;
    const data = room.image.data;
    const walls = window.wallPrototype?.model;
    const started = performance.now();
    let see = null, groundAt = () => 0;
    try {
      if (walls?.nodes && walls?.segments) {
        const v = bridge.getContext().view || {}, g = v.gridSize || 64, o = v.gridOffsets || {}, tp = window.terrainPrototype;
        const terrainAt = (x, y) => (tp?.heightAt ? Number(tp.heightAt((o.left || 0) + x * g, (o.top || 0) + y * g)) || 0 : 0);
        // The top a creature would stand on at each spot, not above the hero's eye: the ground, a floor plate (an
        // island, a deck, an upper floor) or a stair. Worked out once per spot of the room map, then looked up.
        const design = tp?.design || {};
        const surfaces = (() => { try { return resolveSupportSurfaces(design); } catch (_) { return []; } })();
        const ramps = design.ramps || walls.ramps || [];
        const reach = eye.y + .5;
        const topAt = (x, y) => {
          let top = terrainAt(x, y);
          try { const plate = surfaces.length ? supportAt(surfaces, { x, y }, reach) : null; if (plate && plate.height > top) top = plate.height; } catch (_) { /* keep */ }
          for (const ramp of ramps) { try { const h = rampHeight(ramp, x, y); if (h !== null && h <= reach && h > top) top = h; } catch (_) { /* keep */ } }
          return top;
        };
        const tops = new Float32Array(size * size);
        for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) tops[r * size + c] = topAt(left + (c + .5) / ROOM_STEPS, top + (r + .5) / ROOM_STEPS);
        groundAt = (x, y) => {
          const c = Math.floor((x - left) * ROOM_STEPS), r = Math.floor((y - top) * ROOM_STEPS);
          return c >= 0 && r >= 0 && c < size && r < size ? tops[r * size + c] : terrainAt(x, y);
        };
        // Brandon: outdoors they should see more. Land lower than the hero's eyes never blocks (a ledge, an island
        // edge, a hill they stand on); only land rising above the eyes does, and drawn walls (indoors: rooms).
        const blocksAt = (x, y) => { const h = groundAt(x, y); return h > eye.y ? h : -1e6; };
        see = makeSight({ viewer: p, groundAt: blocksAt, walls, viewerGround: ground });
      }
    } catch (error) { console.warn('[VTT 3D] vision test: room map', error); }
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const x = left + (c + .5) / ROOM_STEPS, y = top + (r + .5) / ROOM_STEPS, k = (r * size + c) * 4;
        const there = groundAt(x, y);
        let level = 0, down = 0;
        if (see) {
          try { level = see({ x, y }, eye.y) !== false ? 1 : 0; } catch (_) { level = 0; }
          try { down = see({ x, y }, there + 1) !== false ? 1 : 0; } catch (_) { down = 0; }
        }
        data[k] = level;
        data[k + 1] = down;
        data[k + 2] = there;
        let low = there;
        for (let dr = -ROOM_STEPS; dr <= ROOM_STEPS; dr += 1) for (let dc = -ROOM_STEPS; dc <= ROOM_STEPS; dc += 1) low = Math.min(low, groundAt(x + dc / ROOM_STEPS, y + dr / ROOM_STEPS));
        data[k + 3] = low;
      }
    }
    state.roomMs = Math.round(performance.now() - started);
    (state.roomInfo ||= [])[i] = see ? { left, top, size, data } : null;
    window.vttSightVersion = (window.vttSightVersion || 0) + 1;
    room.needsUpdate = true;
    state.composite.uniforms[`room${i}`].value = room;
    state.composite.uniforms[`roomBox${i}`].value.set(left, top, ROOM_REACH * 2, see ? ground : -1000);
  }

  // What does not stop sight: tokens and minis, water, steam, mist, glows, the sky.
  function passesSight(object) {
    if (object.isPoints || object.isSprite || object.isLine) return true;
    if (object.userData?.token || object.name === 'vtt-hero-minis') return true;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!material) return false;
    return material.transparent === true || (material.side === THREE.BackSide && material.depthWrite === false);
  }

  function capture(state, eyes) {
    const { renderer, view } = state;
    const scene = view.scene;
    const hidden = [];
    scene.traverse((object) => { if (object.visible && object !== scene && passesSight(object)) { object.visible = false; hidden.push(object); } });
    const clear = new THREE.Color();
    renderer.getClearColor(clear);
    const clearAlpha = renderer.getClearAlpha();
    const overrideMaterial = scene.overrideMaterial;
    const background = scene.background;
    state.capturing = true;
    try {
      scene.overrideMaterial = state.distance;
      scene.background = null;
      renderer.setClearColor(new THREE.Color(FAR * 10, 0, 0), 1);
      eyes.forEach((eye, i) => {
        const { camera, cube } = state.cubes[i];
        state.distance.uniforms.eye.value.copy(eye);
        camera.position.copy(eye);
        camera.updateMatrixWorld(true);
        camera.update(renderer, scene);
        state.composite.uniforms[`sight${i}`].value = cube.texture;
        state.composite.uniforms[`eye${i}`].value.copy(eye);
      });
    } finally {
      state.capturing = false;
      scene.overrideMaterial = overrideMaterial;
      scene.background = background;
      renderer.setClearColor(clear, clearAlpha);
      hidden.forEach((object) => { object.visible = true; });
    }
    state.composite.uniforms.count.value = eyes.length;
  }

  // Is this spot (squares) seen by any of the viewing heroes, on their floor? true / false, or null when vision is off
  // or has no heroes (then nothing is hidden). A door or window sits on a wall line, so a little each side counts.
  window.vttSightSees = (x, y) => {
    if (!on || !bound?.eyes?.length || !Array.isArray(bound.roomInfo)) return null;
    const near = [[0, 0], [.35, 0], [-.35, 0], [0, .35], [0, -.35]];
    let known = false;
    for (const info of bound.roomInfo.slice(0, bound.eyes.length)) {
      if (!info) continue;
      known = true;
      for (const [dx, dy] of near) {
        const c = Math.floor((x + dx - info.left) * ROOM_STEPS), r = Math.floor((y + dy - info.top) * ROOM_STEPS);
        if (c < 0 || r < 0 || c >= info.size || r >= info.size) continue;
        const k = (r * info.size + c) * 4;
        if (info.data[k] > .5 || info.data[k + 1] > .5) return true;
      }
    }
    return known ? false : null;
  };

  function publish(ids) {
    const before = JSON.stringify(window.vttSightTest || null);
    window.vttSightTest = on && ids.length ? { on: true, viewerIds: ids } : null;
    if (JSON.stringify(window.vttSightTest || null) !== before) document.dispatchEvent(new CustomEvent('vtt:sight-test-changed'));
  }

  function tick() {
    try {
      const view = api.view;
      if (!on || !view) { if (bound) release(); publish([]); return; }
      const people = viewers();
      if (!people.length) { if (bound) { bound.eyes = []; } publish([]); return; }
      const state = bind(view);
      const eyes = people.map(eyeOf);
      publish(people.map((p) => p.id));
      const next = JSON.stringify(eyes.map((e) => [e.x.toFixed(2), e.y.toFixed(2), e.z.toFixed(2)]));
      if (next === key && Date.now() - madeAt < REFRESH_MS) return;
      key = next;
      madeAt = Date.now();
      capture(state, eyes);
      people.forEach((p, i) => rooms(state, i, p, eyes[i]));
      state.eyes = eyes;
      window.vttSightDebug = state;   // for checking the test from the console
    } catch (error) {
      console.error('[VTT 3D] vision', error);
    }
  }
  setInterval(tick, 150);

  button.addEventListener('click', () => {
    if (!director) return;
    on = !on;
    button.setAttribute('aria-pressed', String(on));
    showLook();
    window.UIKit?.toast?.(on ? 'Vision on for everyone. You see as the tokens you select.' : 'Vision off for everyone.', 'info');
    tick();
    send();
  });
}

start().catch((error) => console.error('[VTT 3D] vision failed to start', error));
