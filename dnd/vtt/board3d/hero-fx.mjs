import * as THREE from 'three';

// Hero particle effects: one small glowing point cloud per effect, animated entirely on the GPU (each point's path
// is a function of time and its own random seed), so nothing is updated per frame on the CPU except one clock.
// Add the returned THREE.Points as a child of a mini: positions are in the model's own units (glTF, y up, +z its front)
// and follow the mini's scale, turn and height. Additive, no depth writes, no shadows: one draw call each.
//
//   const fx = createParticles({type: 'embers', at: [-.277, 1.03, .175], radius: .11});
//   mini.add(fx);   ...   fx.geometry.dispose(); fx.material.dispose();
// It can also be added to a model's template before cloning: the clones share its geometry and material.
// clock: optional () => seconds, to drive it from the board's own clock (default: page time).
//
// Types:
//   embers  - sparks rising from a fire (yellow-white, fading to red), flickering.  at = fire centre, radius = fire size.
//   spores  - golden spores falling slowly from under a cap and drifting round the figure.  at = cap underside centre,
//             radius = cap radius, height = figure height.
//   psionic - violet and pale-blue motes circling a hand on tilted rings, a few drifting off.  at = palm, radius = orbit.
const PRESETS = {
  embers: {count: 70, life: 1.6, size: .028, colors: ['#fff3b0', '#ffb43a', '#ff5a14', '#a01e08']},
  spores: {count: 85, life: 7.0, size: .02, colors: ['#fff6c8', '#ffd76a', '#e0a63a', '#c98a2a']},
  psionic: {count: 80, life: 3.2, size: .022, colors: ['#dff0ff', '#9fd4ff', '#a874ff', '#6a3ad0']},
};
const KIND = {embers: 0, spores: 1, psionic: 2};

const vertex = /* glsl */`
uniform float uTime, uLife, uSize, uPx, uKind, uRadius, uHeight;
uniform vec3 uAt;
attribute vec4 seed;            // four randoms in 0..1
varying float vAge, vSeed;
const float TAU = 6.2831853;
void main(){
  float age = fract(uTime / (uLife * (.7 + .6 * seed.w)) + seed.x);
  vec3 p; float sizeK = 1.;
  if (uKind < .5) {               // embers: start inside the fire, rise with a sway, shrink as they cool
    float a = seed.y * TAU, r = uRadius * sqrt(seed.z) * .8;
    p = uAt + vec3(cos(a) * r, -uRadius * .35 + uRadius * .5 * seed.w, sin(a) * r);
    p.y += age * (.28 + .22 * seed.w);
    p.x += sin(age * 7. + seed.y * 20.) * .025 * age; p.z += cos(age * 6. + seed.z * 20.) * .025 * age;
    sizeK = (1. - age) * (.6 + .8 * fract(sin((uTime * 9. + seed.y * 50.)) * 43758.5));   // flicker
  } else if (uKind < 1.5) {       // spores: half fall from under the cap, half drift round the body; slow swirl
    float a = seed.y * TAU + age * (.6 + .6 * seed.z), fromCap = step(.5, seed.w);
    float r = mix(uRadius * 1.6 + .08 * seed.z, uRadius * sqrt(seed.z), fromCap);
    float y = mix(uHeight * (.08 + .85 * seed.x) + .12 * sin(age * TAU + seed.z * 9.), uAt.y - age * uHeight * .55, fromCap);
    p = vec3(uAt.x + cos(a) * r, y, uAt.z + sin(a) * r);
    sizeK = sin(age * 3.14159) * (.7 + .6 * seed.z);
  } else {                         // psionic: circling the palm on a few tilted rings; one in five drifts outward
    float ring = floor(seed.z * 3.), tilt = .5 + ring * .9, a = seed.y * TAU + age * TAU * (ring == 1. ? -1. : 1.);
    float drift = step(.8, seed.w), r = uRadius * (.6 + .5 * seed.x) + drift * age * .25;
    vec3 q = vec3(cos(a) * r, 0., sin(a) * r);
    float c = cos(tilt), s = sin(tilt);
    q = vec3(q.x, q.z * s, q.z * c);
    float ca = cos(ring * 2.1), sa = sin(ring * 2.1); q = vec3(q.x * ca - q.z * sa, q.y, q.x * sa + q.z * ca);
    p = uAt + q + vec3(0., drift * age * .12 + .02 * sin(uTime * 3. + seed.x * 9.), 0.);
    sizeK = mix(.8 + .4 * sin(uTime * 6. + seed.x * 20.), 1. - age, drift);
  }
  vAge = age; vSeed = seed.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float worldScale = length(modelMatrix[0].xyz);
  gl_PointSize = max(1., uSize * worldScale * sizeK * uPx / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const fragment = /* glsl */`
uniform vec3 uC0, uC1, uC2, uC3; uniform float uKind;
varying float vAge, vSeed;
void main(){
  vec2 d = gl_PointCoord - .5; float r = length(d) * 2.;
  if (r > 1.) discard;
  float core = pow(1. - r, 2.2);
  float t = uKind < .5 ? vAge : (uKind < 1.5 ? vSeed : vSeed);
  vec3 col = t < .33 ? mix(uC0, uC1, t / .33) : t < .66 ? mix(uC1, uC2, (t - .33) / .33) : mix(uC2, uC3, (t - .66) / .34);
  col = mix(col, uC0, pow(1. - r, 6.) * (uKind < .5 ? .6 : .3));   // white-hot centre, softer for motes and spores
  if (uKind > 1.5) col *= .75;                 // motes overlap round a small hand; keep them from adding up to white
  float fade = uKind < .5 ? (1. - vAge) : sin(vAge * 3.14159);
  gl_FragColor = vec4(col * core * fade, 1.);
}`;

export function createParticles({type = 'embers', at = [0, 1, 0], radius = .1, height = 1.2, count, size, life, clock} = {}) {
  const pre = PRESETS[type]; if (!pre) throw Error('unknown particle type ' + type);
  const n = count ?? pre.count, seeds = new Float32Array(n * 4);
  let s = 1234567; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));   // unused, the shader places points
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...at), Math.max(radius * 3, height));
  const c = pre.colors.map(h => new THREE.Color(h));
  const uniforms = {uTime: {value: 0}, uLife: {value: life ?? pre.life}, uSize: {value: size ?? pre.size}, uPx: {value: 800},
    uKind: {value: KIND[type]}, uRadius: {value: radius}, uHeight: {value: height}, uAt: {value: new THREE.Vector3(...at)},
    uC0: {value: c[0]}, uC1: {value: c[1]}, uC2: {value: c[2]}, uC3: {value: c[3]}};
  const m = new THREE.ShaderMaterial({uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, forceSinglePass: true});
  const pts = new THREE.Points(g, m); pts.name = 'hero-fx-' + type; pts.frustumCulled = true; pts.renderOrder = 6;
  pts.castShadow = pts.receiveShadow = false;
  // The hook sits on the material, not the object: a mini's clone() shares the material but drops an object's hook.
  const size2 = new THREE.Vector2(), t0 = performance.now(), now = clock || (() => (performance.now() - t0) / 1000);
  m.onBeforeRender = (renderer, scene, camera) => {
    uniforms.uTime.value = now();
    renderer.getDrawingBufferSize(size2); uniforms.uPx.value = size2.y * .5 * camera.projectionMatrix.elements[5];
  };
  return pts;
}

// Ready-made settings for the four heroes' Meshy models (glTF units, as they come out of the .glb).
export const HERO_FX = {
  'zepha-meshy': [{type: 'embers', at: [-.277, 1.03, .175], radius: .11}],
  'mycelian-meshy': [{type: 'spores', at: [-.074, 1.11, -.034], radius: .19, height: 1.15}],
  'psion-meshy': [{type: 'psionic', at: [-.235, .9, .17], radius: .1}],
};
