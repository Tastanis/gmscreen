import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFlowAnimation, flowSpeedOf, FLOW_SPEED_DEFAULT } from '../../../../board3d/flow-art.mjs';
import { applySwampWaterAnimation, rippleLook, linearColor } from '../../../../board3d/swamp-water.mjs';
import { readFileSync } from 'node:fs';

// Map art options for Dead Root's blood (Brandon's notes, November 13, 2026: "this should be blood pouring out ... the
// blood is solid red with no rippling"): a material that flows, and swamp ripples with their own colour and speed.
// Left out, every option gives the look the art had before.

const vertex = '#include <common>\nvoid main(){\n#include <uv_vertex>\n#include <begin_vertex>\n}';
const fragment = 'void main(){\n#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>\n}';
const compile = (material) => { const shader = { uniforms: {}, vertexShader: vertex, fragmentShader: fragment }; material.onBeforeCompile(shader, null); return shader; };

test('"flow": the textures slide along V by flowSpeed a second, the shape stays', () => {
  const material = { name: 'Blood pour', userData: {} };
  applyFlowAnimation(material, { flowSpeed: 0.5 });
  const shader = compile(material);
  assert.match(shader.vertexShader, /#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv\.y\+=uFlowOffset;\n#endif/);
  assert.match(shader.vertexShader, /vNormalMapUv\.y\+=uFlowOffset/);
  assert.doesNotMatch(shader.vertexShader, /vAoMapUv|vLightMapUv/, 'baked shade stays put');
  assert.equal(shader.uniforms.uFlowOffset, material.userData.flowMotion.offset);
  material.onBeforeRender();
  const offset = shader.uniforms.uFlowOffset.value;
  assert.ok(offset >= 0 && offset < 1, 'kept within one texture length');
  assert.match(material.customProgramCacheKey(), /flow-v1$/);
  assert.equal(flowSpeedOf({}), FLOW_SPEED_DEFAULT);
  assert.equal(flowSpeedOf({ flowSpeed: -0.3 }), -0.3, 'negative runs the other way');
  assert.equal(flowSpeedOf({ flowSpeed: 1e9 }), 10);
});

test('swamp ripples: rippleColor, rippleSpeed and waterColor, and the bog as it was without them', () => {
  const bog = rippleLook({});
  assert.deepEqual(bog, { crest: [0.016, 0.019, 0.007], ambient: [0.0035, 0.004, 0.0015], deep: [0.02285, 0.0296, 0.00706], speed: 1 });
  assert.deepEqual(linearColor('#ffffff'), [1, 1, 1]);
  assert.equal(linearColor('red'), null);
  const blood = rippleLook({ rippleColor: '#5a0a08', rippleSpeed: 0.4, waterColor: '#1a0202' });
  assert.ok(blood.crest[0] > blood.crest[1] * 5, 'a red crest');
  assert.equal(blood.speed, 0.4);
  assert.equal(rippleLook({ rippleSpeed: -2 }).speed, 0);

  const material = { name: 'Blood', userData: {} };
  applySwampWaterAnimation(material, { rippleSources: [{ x: 1, z: 1, radius: 0.3 }], rippleColor: '#5a0a08', rippleSpeed: 0.4, waterColor: '#1a0202' });
  const shader = compile(material);
  assert.deepEqual(shader.uniforms.uCrestColor.value, blood.crest);
  assert.deepEqual(shader.uniforms.uDeepColor.value, blood.deep);
  assert.match(shader.fragmentShader, /mix\(uDeepColor,/);
  assert.match(shader.fragmentShader, /diffuseColor\.rgb\+=uCrestColor\*fronts\.x\+uAmbientCrestColor\*ambientCrest;/);
  assert.doesNotMatch(shader.fragmentShader, /vec3\(\.016,\.019,\.007\)/, 'no fixed green left');
});

test('index.json picks either animation by name', () => {
  // scene-art.mjs needs the browser's three.js, so it is read, not run.
  const art = readFileSync(new URL('../../../../board3d/scene-art.mjs', import.meta.url), 'utf8');
  assert.ok(art.includes("if(option.animation==='swamp-ripples')applySwampWaterAnimation(material,option);\n else if(option.animation==='flow')applyFlowAnimation(material,option);"));
  assert.ok(art.includes("import {applyFlowAnimation} from './flow-art.mjs';"));
});
