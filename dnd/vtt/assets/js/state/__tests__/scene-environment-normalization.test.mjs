import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSceneBoardState } from '../normalize/scene-board-state.js';
import { initializeState, getState } from '../store.js';

const environment = {
  terrain: { revision: 4, value: { n: 2, m: 2, h: [0, 0, 2, 2], bounds: { left: 0, top: 0, width: 2, height: 2 } } },
  walls: { revision: 7, value: { corners: [], segments: [{ id: 'closed-secret', interaction: 'none' }], roofs: [] } },
  exploration: { revision: 3, value: { resetId: 'reset-1' } },
};

test('initial player store retains projected environment before recovery', () => {
  const source = JSON.parse(JSON.stringify(environment));
  initializeState({
    user: { isGM: false, name: 'cal' },
    boardState: { activeSceneId: 'scene-height', sceneState: { 'scene-height': { environment: source } } },
  });
  assert.deepEqual(getState().boardState.sceneState['scene-height'].environment, environment);
  source.terrain.value.h[0] = 100;
  assert.equal(getState().boardState.sceneState['scene-height'].environment.terrain.value.h[0], 0);
  assert.deepEqual(getState().boardState.sceneState['scene-height'].environment.walls.value.segments[0],
    { id: 'closed-secret', interaction: 'none' }, 'Do not reconstruct stripped secret-door metadata.');
});

test('scene normalization preserves explicit flat environment without inventing geometry', () => {
  const normalized = normalizeSceneBoardState({ flat: { environment: {} }, legacy: {}, invalid: { environment: [] } });
  assert.deepEqual(normalized.flat.environment, {});
  assert.equal(Object.hasOwn(normalized.legacy, 'environment'), false);
  assert.equal(Object.hasOwn(normalized.invalid, 'environment'), false);
});
