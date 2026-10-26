import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLevel, qualityChoice, qualityLevel, fitSize, LEVELS, QUALITY_KEY } from '../../../../board3d/quality.mjs';

// Map quality (Brandon, October 2026): Auto picks a lighter level on small laptops; a forced level always wins.
const store = (v) => ({ getItem: (k) => (k === QUALITY_KEY ? v : null) });

test('Auto: small memory → low, an 8 GB Mac → balanced, a big PC → high', () => {
  assert.equal(autoLevel({ deviceMemory: 4, platform: 'Win32' }), 'low');
  assert.equal(autoLevel({ deviceMemory: 8, platform: 'MacIntel' }), 'balanced');
  assert.equal(autoLevel({ deviceMemory: 8, platform: 'Win32' }), 'high');
  assert.equal(autoLevel({ platform: 'Win32' }), 'high', 'unknown memory stays high');
});

test('a forced level wins over Auto; nonsense falls back to Auto', () => {
  assert.equal(qualityChoice(store(null)), 'auto');
  assert.equal(qualityChoice(store('rubbish')), 'auto');
  assert.equal(qualityLevel(store('low'), { deviceMemory: 32, platform: 'Win32' }), 'low');
  assert.equal(qualityLevel(store('high'), { deviceMemory: 2, platform: 'Win32' }), 'high');
  assert.equal(qualityLevel(store('auto'), { deviceMemory: 2, platform: 'Win32' }), 'low');
});

test('pictures shrink to fit the level, keeping their shape', () => {
  assert.deepEqual(fitSize(4536, 4320, LEVELS.low.maxTexture), { width: 512, height: 488, scaled: true });
  assert.deepEqual(fitSize(400, 300, LEVELS.low.maxTexture), { width: 400, height: 300, scaled: false });
  assert.ok(LEVELS.high.pixelRatio > LEVELS.balanced.pixelRatio && LEVELS.balanced.pixelRatio > LEVELS.low.pixelRatio);
  assert.equal(LEVELS.high.unloadAfterMs, 0, 'High never unloads a map on its own');
});
