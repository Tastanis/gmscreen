import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdjacentTokenLevel,
  getFallingDestinationLevelId,
  getMapLevelDistanceScale,
  getMapLevelNavigationControlState,
  getOrderedTokenMapLevels,
  getPlayerTokenMapLevelVisibility,
  getTokenLevelControlState,
  getTokenLevelPresentation,
  isPlacementFullyInsideRawCutouts,
  isPlacementInteractableOnPlayerMapLevel,
  isPlacementOnPlayerVisibleMapLevel,
  resolvePlayerActiveMapLevelId,
  resolveSceneTokenLevelState,
  resolveTokenLevelId,
} from '../token-levels.js';

describe('token level helpers', () => {
  test('orders map levels by z-index for up and down movement', () => {
    const levels = getOrderedTokenMapLevels([
      { id: 'roof', name: 'Roof', zIndex: 2 },
      { id: 'ground', name: 'Ground', zIndex: 0 },
      { id: 'upper', name: 'Upper', zIndex: 1 },
    ]);

    assert.deepEqual(levels.map((level) => level.id), ['ground', 'upper', 'roof']);
  });

  test('resolves explicit placement level before active fallback', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
      ],
    };

    assert.equal(resolveTokenLevelId({ levelId: ' ground ' }, mapLevels), 'ground');
    assert.equal(resolveTokenLevelId({ levelId: '', mapLevelId: 'ground' }, mapLevels), 'ground');
    assert.equal(resolveTokenLevelId({}, mapLevels), 'upper');
  });

  test('returns adjacent levels around the resolved current level', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
        { id: 'roof', name: 'Roof', zIndex: 2 },
      ],
    };

    assert.equal(getAdjacentTokenLevel(mapLevels, 'upper', 'down')?.id, 'ground');
    assert.equal(getAdjacentTokenLevel(mapLevels, 'upper', 'up')?.id, 'roof');
    assert.equal(getAdjacentTokenLevel(mapLevels, 'roof', 'up'), null);
  });

  test('builds GM menu control state for a placement', () => {
    const mapLevels = {
      activeLevelId: 'ground',
      levels: [
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
      ],
    };

    const controls = getTokenLevelControlState(mapLevels, { id: 'token-1', levelId: 'ground' });

    assert.equal(controls.hasLevels, true);
    assert.equal(controls.currentLevel?.id, 'ground');
    assert.equal(controls.canMoveDown, false);
    assert.equal(controls.canMoveUp, true);
  });

  test('builds active map level navigation control state', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'roof', name: 'Roof', zIndex: 2 },
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
      ],
    };

    const controls = getMapLevelNavigationControlState(mapLevels);

    assert.equal(controls.hasLevels, true);
    assert.equal(controls.currentLevel?.id, 'upper');
    assert.equal(controls.canMoveDown, true);
    assert.equal(controls.canMoveUp, true);
    assert.deepEqual(controls.levels.map((level) => level.id), ['ground', 'upper', 'roof']);
  });

  test('navigation control state honors an explicit currentLevelId override', () => {
    // Levels v2: GM browsing supplies its per-user level via the
    // `currentLevelId` option so the nav reflects `userLevelState[gmId]`
    // instead of the legacy scene-global active id.
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
        { id: 'roof', name: 'Roof', zIndex: 2 },
      ],
    };

    const controls = getMapLevelNavigationControlState(mapLevels, {
      currentLevelId: 'ground',
    });
    assert.equal(controls.currentLevel?.id, 'ground');
    assert.equal(controls.canMoveDown, false);
    assert.equal(controls.canMoveUp, true);
  });

  test('navigation control state ignores an unknown currentLevelId override', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
      ],
    };

    const controls = getMapLevelNavigationControlState(mapLevels, {
      currentLevelId: 'level-0',
    });
    // Falls back to the scene's legacy active id when the override is
    // not one of the stored Level 1+ entries.
    assert.equal(controls.currentLevel?.id, 'upper');
  });

  test('navigation control state includes the virtual Level 0 when requested', () => {
    // Levels v2 (§5.1): GM nav passes `includeBaseLevel: true` so the
    // up/down controls can step into and out of the base map.
    const mapLevels = {
      activeLevelId: null,
      levels: [
        { id: 'upper', name: 'Upper', zIndex: 1 },
        { id: 'roof', name: 'Roof', zIndex: 2 },
      ],
    };

    const onBase = getMapLevelNavigationControlState(mapLevels, {
      currentLevelId: 'level-0',
      includeBaseLevel: true,
    });
    assert.equal(onBase.currentLevel?.id, 'level-0');
    assert.equal(onBase.currentLevel?.name, 'Level 0');
    assert.deepEqual(onBase.levels.map((level) => level.id), ['level-0', 'upper', 'roof']);
    assert.equal(onBase.canMoveDown, false);
    assert.equal(onBase.canMoveUp, true);

    const onUpper = getMapLevelNavigationControlState(mapLevels, {
      currentLevelId: 'upper',
      includeBaseLevel: true,
    });
    assert.equal(onUpper.canMoveDown, true);
    assert.equal(onUpper.canMoveUp, true);
  });

  test('adjacent token level steps into and out of Level 0 when included', () => {
    const mapLevels = {
      activeLevelId: null,
      levels: [
        { id: 'upper', name: 'Upper', zIndex: 1 },
        { id: 'roof', name: 'Roof', zIndex: 2 },
      ],
    };

    assert.equal(
      getAdjacentTokenLevel(mapLevels, 'upper', 'down', { includeBaseLevel: true })?.id,
      'level-0',
    );
    assert.equal(
      getAdjacentTokenLevel(mapLevels, 'level-0', 'up', { includeBaseLevel: true })?.id,
      'upper',
    );
    assert.equal(
      getAdjacentTokenLevel(mapLevels, 'level-0', 'down', { includeBaseLevel: true }),
      null,
    );
  });

  test('token level controls expose Level 0 as a valid target', () => {
    // §5.1: token-settings move buttons let the GM move a token to or
    // from Level 0. A placement with no `levelId` (legacy data) is
    // treated as already on Level 0.
    const mapLevels = {
      activeLevelId: null,
      levels: [
        { id: 'upper', name: 'Upper', zIndex: 1 },
      ],
    };

    const legacy = getTokenLevelControlState(mapLevels, { id: 'legacy' }, {
      includeBaseLevel: true,
    });
    assert.equal(legacy.currentLevel?.id, 'level-0');
    assert.equal(legacy.canMoveDown, false);
    assert.equal(legacy.canMoveUp, true);

    const explicit = getTokenLevelControlState(mapLevels, {
      id: 'explicit',
      levelId: 'level-0',
    }, { includeBaseLevel: true });
    assert.equal(explicit.currentLevel?.id, 'level-0');

    const onUpper = getTokenLevelControlState(mapLevels, {
      id: 'on-upper',
      levelId: 'upper',
    }, { includeBaseLevel: true });
    assert.equal(onUpper.currentLevel?.id, 'upper');
    assert.equal(onUpper.canMoveDown, true);
    assert.equal(onUpper.canMoveUp, false);
  });

  test('resolves scene-scoped map level state from board state', () => {
    const mapLevels = resolveSceneTokenLevelState({
      boardState: {
        sceneState: {
          'scene-1': {
            grid: { size: 70, offsetX: 2, offsetY: 4 },
            mapLevels: {
              activeLevelId: 'upper',
              levels: [{ id: 'upper', name: 'Upper', zIndex: 1 }],
            },
          },
        },
      },
    }, 'scene-1');

    assert.equal(mapLevels.activeLevelId, 'upper');
    assert.equal(mapLevels.levels[0].id, 'upper');
  });

  test('resolves the player active level only when it is visible', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', visible: true, defaultForPlayers: true, zIndex: 0 },
        { id: 'upper', name: 'Upper', visible: false, zIndex: 1 },
      ],
    };

    assert.equal(resolvePlayerActiveMapLevelId(mapLevels), null);
    assert.equal(resolvePlayerActiveMapLevelId({ ...mapLevels, activeLevelId: null }), 'ground');
  });

  test('filters player-visible placements to the active visible map level', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        { id: 'upper', name: 'Upper', visible: true, mapUrl: '/upper.png', zIndex: 1 },
      ],
    };

    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'a', levelId: 'upper' }, mapLevels), true);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'b', levelId: 'ground' }, mapLevels), false);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'legacy' }, mapLevels), true);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'no-levels' }, { levels: [] }), true);
  });

  test('reveals lower-level placements only through blocking level cutouts', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        {
          id: 'upper',
          name: 'Upper',
          visible: true,
          mapUrl: '/upper.png',
          zIndex: 1,
          cutouts: [{ column: 2, row: 3, width: 1, height: 1 }],
        },
      ],
    };

    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'open', levelId: 'ground', column: 2, row: 3 }, mapLevels), true);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'covered', levelId: 'ground', column: 1, row: 3 }, mapLevels), false);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'upper', levelId: 'upper', column: 1, row: 3 }, mapLevels), true);
  });

  test('requires cutouts through every blocking level above a lower placement', () => {
    const mapLevels = {
      activeLevelId: 'roof',
      levels: [
        { id: 'ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        {
          id: 'middle',
          visible: true,
          mapUrl: '/middle.png',
          zIndex: 1,
          cutouts: [{ column: 4, row: 4, width: 1, height: 1 }],
        },
        {
          id: 'roof',
          visible: true,
          mapUrl: '/roof.png',
          zIndex: 2,
          cutouts: [{ column: 5, row: 4, width: 1, height: 1 }],
        },
      ],
    };

    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'blocked-by-roof', levelId: 'ground', column: 4, row: 4 }, mapLevels), false);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'blocked-by-middle', levelId: 'ground', column: 5, row: 4 }, mapLevels), false);

    mapLevels.levels[1].cutouts.push({ column: 5, row: 4, width: 1, height: 1 });
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'open-through-both', levelId: 'ground', column: 5, row: 4 }, mapLevels), true);
  });

  test('tracks partially visible cells for lower multi-cell placements', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        {
          id: 'upper',
          visible: true,
          mapUrl: '/upper.png',
          zIndex: 1,
          cutouts: [{ column: 3, row: 2, width: 1, height: 2 }],
        },
      ],
    };

    const visibility = getPlayerTokenMapLevelVisibility(
      { id: 'large', levelId: 'ground', column: 2, row: 2, width: 2, height: 2 },
      mapLevels
    );

    assert.equal(visibility.visible, true);
    assert.equal(visibility.fullyVisible, false);
    assert.deepEqual(visibility.visibleCells, [
      { column: 3, row: 2 },
      { column: 3, row: 3 },
    ]);
  });

  test('uses interaction blockers separately from vision blockers', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        {
          id: 'upper',
          visible: true,
          mapUrl: '/upper.png',
          zIndex: 1,
          blocksLowerLevelVision: false,
          blocksLowerLevelInteraction: true,
          cutouts: [{ column: 8, row: 8, width: 1, height: 1 }],
        },
      ],
    };

    const placement = { id: 'ground-token', levelId: 'ground', column: 7, row: 8 };
    assert.equal(isPlacementOnPlayerVisibleMapLevel(placement, mapLevels), true);
    assert.equal(isPlacementInteractableOnPlayerMapLevel(placement, mapLevels, { point: { column: 7, row: 8 } }), false);
    assert.equal(isPlacementInteractableOnPlayerMapLevel({ ...placement, column: 8 }, mapLevels, { point: { column: 8, row: 8 } }), true);
  });
});

describe('Levels v2 token presentation', () => {
  // §5.5.2: below-level scaling clamps at 50%; above-level stays 100%.
  test('getMapLevelDistanceScale returns the correct scale for direction/distance', () => {
    assert.equal(getMapLevelDistanceScale('same', 0), 1);
    assert.equal(getMapLevelDistanceScale('above', 1), 1);
    assert.equal(getMapLevelDistanceScale('above', 5), 1);
    assert.equal(Math.round(getMapLevelDistanceScale('below', 1) * 100) / 100, 0.9);
    assert.equal(Math.round(getMapLevelDistanceScale('below', 2) * 100) / 100, 0.8);
    assert.equal(Math.round(getMapLevelDistanceScale('below', 4) * 100) / 100, 0.6);
    assert.equal(getMapLevelDistanceScale('below', 5), 0.5);
    assert.equal(getMapLevelDistanceScale('below', 12), 0.5);
  });

  test('same-level placement returns full visibility, no indicator, scale 1', () => {
    const mapLevels = {
      levels: [
        { id: 'upper', name: 'Upper', visible: true, mapUrl: '/u.png', zIndex: 1 },
      ],
    };
    const presentation = getTokenLevelPresentation(
      { id: 't', levelId: 'upper', column: 1, row: 1 },
      mapLevels,
      { viewerLevelId: 'upper', gmViewing: false },
    );
    assert.equal(presentation.visible, true);
    assert.equal(presentation.fullyVisible, true);
    assert.equal(presentation.sameLevel, true);
    assert.equal(presentation.direction, 'same');
    assert.equal(presentation.distance, 0);
    assert.equal(presentation.scale, 1);
    assert.equal(presentation.indicator, null);
  });

  test('GM bypass: above and below tokens are always visible regardless of cutouts', () => {
    const mapLevels = {
      levels: [
        // Level 1+ that fully blocks vision (no cutouts).
        { id: 'upper', name: 'Upper', visible: true, mapUrl: '/u.png', zIndex: 1 },
      ],
    };
    const aboveAsGm = getTokenLevelPresentation(
      { id: 'above', levelId: 'upper', column: 5, row: 5 },
      mapLevels,
      { viewerLevelId: 'level-0', gmViewing: true },
    );
    assert.equal(aboveAsGm.visible, true);
    assert.equal(aboveAsGm.direction, 'above');
    assert.equal(aboveAsGm.distance, 1);
    assert.equal(aboveAsGm.scale, 1);
    assert.deepEqual(aboveAsGm.indicator, { direction: 'above', distance: 1 });

    const belowAsGm = getTokenLevelPresentation(
      { id: 'below', levelId: 'level-0', column: 5, row: 5 },
      mapLevels,
      { viewerLevelId: 'upper', gmViewing: true },
    );
    assert.equal(belowAsGm.visible, true);
    assert.equal(belowAsGm.direction, 'below');
    assert.equal(belowAsGm.distance, 1);
    assert.equal(Math.round(belowAsGm.scale * 100) / 100, 0.9);
    assert.deepEqual(belowAsGm.indicator, { direction: 'below', distance: 1 });
  });

  test('player below-level: edge rule reveals tokens whose cells are within one square of a cutout', () => {
    // Viewer on Upper looking down at Level 0. Upper has a 1x1 cutout at (5, 5).
    // Expanded cutout cells (3x3 around the raw cutout) span (4..6, 4..6).
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          visible: true,
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
        },
      ],
    };

    const inside = getTokenLevelPresentation(
      { id: 'inside', levelId: 'level-0', column: 5, row: 5 },
      mapLevels,
      { viewerLevelId: 'upper', gmViewing: false },
    );
    assert.equal(inside.visible, true);
    assert.equal(inside.direction, 'below');

    const adjacent = getTokenLevelPresentation(
      { id: 'adjacent', levelId: 'level-0', column: 4, row: 5 },
      mapLevels,
      { viewerLevelId: 'upper', gmViewing: false },
    );
    assert.equal(adjacent.visible, true, 'edge cell must reveal token');

    const corner = getTokenLevelPresentation(
      { id: 'corner', levelId: 'level-0', column: 4, row: 4 },
      mapLevels,
      { viewerLevelId: 'upper', gmViewing: false },
    );
    assert.equal(corner.visible, true, 'diagonal/corner cell must reveal token');

    const farAway = getTokenLevelPresentation(
      { id: 'far', levelId: 'level-0', column: 1, row: 1 },
      mapLevels,
      { viewerLevelId: 'upper', gmViewing: false },
    );
    assert.equal(farAway.visible, false, 'cells outside expanded cutout stay hidden');
  });

  test('player above-level visibility uses the same edge rule mirrored upward', () => {
    // Viewer on Level 0 looking up at Upper. The blocking level is Upper
    // (the higher level), so its expanded cutout determines visibility.
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          visible: true,
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
        },
      ],
    };

    const above = getTokenLevelPresentation(
      { id: 'above', levelId: 'upper', column: 4, row: 6 },
      mapLevels,
      { viewerLevelId: 'level-0', gmViewing: false },
    );
    assert.equal(above.visible, true);
    assert.equal(above.direction, 'above');
    assert.equal(above.distance, 1);
    assert.equal(above.scale, 1);
    assert.deepEqual(above.indicator, { direction: 'above', distance: 1 });

    const blocked = getTokenLevelPresentation(
      { id: 'above-blocked', levelId: 'upper', column: 0, row: 0 },
      mapLevels,
      { viewerLevelId: 'level-0', gmViewing: false },
    );
    assert.equal(blocked.visible, false);
  });

  test('multi-level edge intersection requires every blocking level to overlap', () => {
    // Viewer Level 2, token Level 0. Two blocking levels (Upper and Roof)
    // must both have an expanded cutout covering at least one of the
    // token's occupied cells.
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          visible: true,
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
        },
        {
          id: 'roof',
          name: 'Roof',
          visible: true,
          mapUrl: '/r.png',
          zIndex: 2,
          cutouts: [{ column: 7, row: 5, width: 1, height: 1 }],
        },
      ],
    };

    const noOverlap = getTokenLevelPresentation(
      { id: 'no-overlap', levelId: 'level-0', column: 5, row: 5 },
      mapLevels,
      { viewerLevelId: 'roof', gmViewing: false },
    );
    // Expanded Upper covers (4..6, 4..6); expanded Roof covers (6..8, 4..6).
    // Cell (5,5) is in Upper's expanded set but not Roof's, so blocked.
    assert.equal(noOverlap.visible, false);

    const intersection = getTokenLevelPresentation(
      { id: 'overlap', levelId: 'level-0', column: 6, row: 5 },
      mapLevels,
      { viewerLevelId: 'roof', gmViewing: false },
    );
    // Cell (6,5) is inside both expanded cutouts.
    assert.equal(intersection.visible, true);
    assert.equal(intersection.direction, 'below');
    assert.equal(intersection.distance, 2);
    assert.equal(Math.round(intersection.scale * 100) / 100, 0.8);
  });

  test('non-blocking levels (hidden, opacity 0, blocksLowerLevelVision=false) are skipped', () => {
    const mapLevels = {
      levels: [
        {
          id: 'transparent',
          name: 'Transparent',
          visible: true,
          mapUrl: '/t.png',
          zIndex: 1,
          opacity: 0,
          cutouts: [],
        },
      ],
    };
    const presentation = getTokenLevelPresentation(
      { id: 'token', levelId: 'level-0', column: 12, row: 12 },
      mapLevels,
      { viewerLevelId: 'transparent', gmViewing: false },
    );
    // No blocking levels remaining → path is open per §5.5.4 step 7.
    assert.equal(presentation.visible, true);
    assert.equal(presentation.direction, 'below');
  });

  test('placement on Level 0 (legacy missing levelId) is recognized as the base level', () => {
    const mapLevels = {
      levels: [
        { id: 'upper', name: 'Upper', visible: true, mapUrl: '/u.png', zIndex: 1 },
      ],
    };
    const legacy = getTokenLevelPresentation(
      { id: 'legacy', column: 1, row: 1 },
      mapLevels,
      { viewerLevelId: 'level-0', gmViewing: false },
    );
    assert.equal(legacy.levelId, 'level-0');
    assert.equal(legacy.sameLevel, true);
    assert.equal(legacy.visible, true);
  });

  test('viewer falls back to Level 0 when viewerLevelId is missing or unknown', () => {
    const mapLevels = {
      levels: [
        { id: 'upper', name: 'Upper', visible: true, mapUrl: '/u.png', zIndex: 1 },
      ],
    };
    const missing = getTokenLevelPresentation(
      { id: 'token', levelId: 'upper', column: 0, row: 0 },
      mapLevels,
      { gmViewing: true },
    );
    assert.equal(missing.activeLevelId, 'level-0');
    assert.equal(missing.direction, 'above');

    const unknown = getTokenLevelPresentation(
      { id: 'token', levelId: 'upper', column: 0, row: 0 },
      mapLevels,
      { viewerLevelId: 'does-not-exist', gmViewing: true },
    );
    assert.equal(unknown.activeLevelId, 'level-0');
    assert.equal(unknown.direction, 'above');
  });

  test('multi-cell placement is binary: any visible cell shows the whole token', () => {
    // §5.5.4 final paragraph: cross-level visibility is binary in v2.
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          visible: true,
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 3, row: 3, width: 1, height: 1 }],
        },
      ],
    };
    // 2x2 token at (2,2)-(3,3). Cell (3,3) is in expanded cutout (cells 2..4 around (3,3)).
    const presentation = getTokenLevelPresentation(
      { id: 'big', levelId: 'level-0', column: 2, row: 2, width: 2, height: 2 },
      mapLevels,
      { viewerLevelId: 'upper', gmViewing: false },
    );
    assert.equal(presentation.visible, true);
    assert.equal(presentation.fullyVisible, true);
    // visibleCells is null per the binary v2 rule (no partial mask).
    assert.equal(presentation.visibleCells, null);
  });

  test('interaction mode uses interaction blockers separately from vision', () => {
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          visible: true,
          mapUrl: '/u.png',
          zIndex: 1,
          blocksLowerLevelVision: false,
          blocksLowerLevelInteraction: true,
          cutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
        },
      ],
    };
    const placement = { id: 'ground', levelId: 'level-0', column: 0, row: 0 };
    // Vision: Upper does not block vision → token visible.
    const vision = getTokenLevelPresentation(placement, mapLevels, {
      viewerLevelId: 'upper',
      gmViewing: false,
      mode: 'vision',
    });
    assert.equal(vision.visible, true);
    // Interaction: Upper blocks interaction. Cell (0,0) is outside the
    // expanded cutout, so the token cannot be clicked.
    const interaction = getTokenLevelPresentation(placement, mapLevels, {
      viewerLevelId: 'upper',
      gmViewing: false,
      mode: 'interaction',
      cells: [{ column: 0, row: 0 }],
    });
    assert.equal(interaction.visible, false);
  });

  test('placement referencing a deleted level reports not visible', () => {
    const mapLevels = {
      levels: [
        { id: 'upper', name: 'Upper', visible: true, mapUrl: '/u.png', zIndex: 1 },
      ],
    };
    const orphan = getTokenLevelPresentation(
      { id: 'orphan', levelId: 'gone', column: 0, row: 0 },
      mapLevels,
      { viewerLevelId: 'upper', gmViewing: true },
    );
    assert.equal(orphan.visible, false);
  });
});

// Levels v2 §5.6: falling — raw-cutout containment, chained fall
// resolution, and edge-buffer non-trigger.
describe('Levels v2 falling detection', () => {
  test('isPlacementFullyInsideRawCutouts: single-cell token entirely inside a cutout returns true', () => {
    const level = {
      id: 'upper',
      cutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
    };
    const placement = { id: 't', column: 5, row: 5, width: 1, height: 1 };
    assert.equal(isPlacementFullyInsideRawCutouts(placement, level), true);
  });

  test('isPlacementFullyInsideRawCutouts: edge-of-cutout placement does NOT trigger', () => {
    // The §5.6 rule is "every occupied cell sits inside the raw cutout
    // area" — edge-of-cutout placement should NOT fall. Step 5's edge
    // expansion (8-neighborhood) is for visibility only.
    const level = {
      id: 'upper',
      cutouts: [{ column: 5, row: 5, width: 2, height: 2 }],
    };
    const adjacent = { id: 't', column: 4, row: 5, width: 1, height: 1 };
    const corner = { id: 't', column: 4, row: 4, width: 1, height: 1 };
    assert.equal(isPlacementFullyInsideRawCutouts(adjacent, level), false);
    assert.equal(isPlacementFullyInsideRawCutouts(corner, level), false);
  });

  test('isPlacementFullyInsideRawCutouts: multi-cell token partially over a cutout returns false', () => {
    const level = {
      id: 'upper',
      cutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
    };
    const placement = { id: 't', column: 5, row: 5, width: 2, height: 2 };
    assert.equal(isPlacementFullyInsideRawCutouts(placement, level), false);
  });

  test('isPlacementFullyInsideRawCutouts: multi-cell token fully covered by a wide cutout returns true', () => {
    const level = {
      id: 'upper',
      cutouts: [{ column: 5, row: 5, width: 3, height: 3 }],
    };
    const placement = { id: 't', column: 6, row: 6, width: 2, height: 2 };
    assert.equal(isPlacementFullyInsideRawCutouts(placement, level), true);
  });

  test('isPlacementFullyInsideRawCutouts: missing or empty cutouts returns false', () => {
    const placement = { id: 't', column: 0, row: 0, width: 1, height: 1 };
    assert.equal(isPlacementFullyInsideRawCutouts(placement, null), false);
    assert.equal(isPlacementFullyInsideRawCutouts(placement, {}), false);
    assert.equal(isPlacementFullyInsideRawCutouts(placement, { cutouts: [] }), false);
  });

  test('getFallingDestinationLevelId: single fall from Level 1 to Level 0', () => {
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 4, row: 4, width: 1, height: 1 }],
        },
      ],
    };
    const placement = { id: 't', levelId: 'upper', column: 4, row: 4, width: 1, height: 1 };
    assert.equal(getFallingDestinationLevelId(placement, mapLevels), 'level-0');
  });

  test('getFallingDestinationLevelId: chained fall from Level 2 through Level 1 to Level 0', () => {
    // Cutouts on both upper levels stack so a token landing on the cell
    // falls through both. Step 5 visibility uses edge expansion; falling
    // uses raw cells only — confirm the helper walks the chain via raw
    // containment.
    const mapLevels = {
      levels: [
        {
          id: 'level1',
          name: 'Level 1',
          mapUrl: '/1.png',
          zIndex: 1,
          cutouts: [{ column: 7, row: 3, width: 1, height: 1 }],
        },
        {
          id: 'level2',
          name: 'Level 2',
          mapUrl: '/2.png',
          zIndex: 2,
          cutouts: [{ column: 7, row: 3, width: 1, height: 1 }],
        },
      ],
    };
    const placement = { id: 't', levelId: 'level2', column: 7, row: 3, width: 1, height: 1 };
    assert.equal(getFallingDestinationLevelId(placement, mapLevels), 'level-0');
  });

  test('getFallingDestinationLevelId: chained fall stops at the first level WITHOUT a cutout', () => {
    const mapLevels = {
      levels: [
        // Level 1: NO cutout at the placement column — chain stops here.
        {
          id: 'level1',
          name: 'Level 1',
          mapUrl: '/1.png',
          zIndex: 1,
          cutouts: [{ column: 0, row: 0, width: 1, height: 1 }],
        },
        // Level 2: cutout under the placement.
        {
          id: 'level2',
          name: 'Level 2',
          mapUrl: '/2.png',
          zIndex: 2,
          cutouts: [{ column: 7, row: 3, width: 1, height: 1 }],
        },
      ],
    };
    const placement = { id: 't', levelId: 'level2', column: 7, row: 3, width: 1, height: 1 };
    assert.equal(getFallingDestinationLevelId(placement, mapLevels), 'level1');
  });

  test('getFallingDestinationLevelId: token already on Level 0 never falls', () => {
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 0, row: 0, width: 5, height: 5 }],
        },
      ],
    };
    const placement = { id: 't', levelId: 'level-0', column: 1, row: 1, width: 1, height: 1 };
    assert.equal(getFallingDestinationLevelId(placement, mapLevels), null);
  });

  test('getFallingDestinationLevelId: token with missing levelId is treated as Level 0 and never falls', () => {
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 0, row: 0, width: 5, height: 5 }],
        },
      ],
    };
    // Legacy placements with no levelId resolve to Level 0 per
    // resolvePlacementLevelId; they should not be re-classified as
    // upper-level just because they sit over a cutout above them.
    const placement = { id: 't', column: 1, row: 1, width: 1, height: 1 };
    assert.equal(getFallingDestinationLevelId(placement, mapLevels), null);
  });

  test('getFallingDestinationLevelId: edge-of-cutout placement does not fall', () => {
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 5, row: 5, width: 2, height: 2 }],
        },
      ],
    };
    // Adjacent to but not inside the cutout.
    const placement = { id: 't', levelId: 'upper', column: 4, row: 5, width: 1, height: 1 };
    assert.equal(getFallingDestinationLevelId(placement, mapLevels), null);
  });

  test('getFallingDestinationLevelId: multi-cell partial overlap does not fall', () => {
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
        },
      ],
    };
    // 2x2 token covers (5,5), (6,5), (5,6), (6,6) but the cutout is
    // only (5,5). Partial — does not fall.
    const placement = { id: 't', levelId: 'upper', column: 5, row: 5, width: 2, height: 2 };
    assert.equal(getFallingDestinationLevelId(placement, mapLevels), null);
  });

  test('getFallingDestinationLevelId: returns null when no levels exist', () => {
    const placement = { id: 't', levelId: 'upper', column: 0, row: 0, width: 1, height: 1 };
    assert.equal(getFallingDestinationLevelId(placement, { levels: [] }), null);
    assert.equal(getFallingDestinationLevelId(placement, null), null);
  });

  test('getFallingDestinationLevelId: returns null when current level is unknown', () => {
    const mapLevels = {
      levels: [
        {
          id: 'upper',
          name: 'Upper',
          mapUrl: '/u.png',
          zIndex: 1,
          cutouts: [{ column: 0, row: 0, width: 5, height: 5 }],
        },
      ],
    };
    const placement = { id: 't', levelId: 'phantom', column: 1, row: 1, width: 1, height: 1 };
    assert.equal(getFallingDestinationLevelId(placement, mapLevels), null);
  });
});
