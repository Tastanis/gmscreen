/**
 * Unit tests for the fog-of-war cutout cascade.
 *
 * When the GM reveals a cell on a level that has a cutout at that
 * coordinate, the reveal cascades down to the next level beneath. If that
 * level also has a cutout there, it keeps cascading. The cascade is
 * one-way: re-fogging on the higher level does NOT un-cascade.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { cascadeReveals, levelHasCutoutAt } from '../fog-of-war.js';

describe('levelHasCutoutAt', () => {
  test('returns true for a cell inside a cutout rect', () => {
    const level = {
      cutouts: [{ column: 5, row: 5, width: 3, height: 3 }],
    };
    assert.equal(levelHasCutoutAt(level, 5, 5), true);
    assert.equal(levelHasCutoutAt(level, 7, 7), true, 'last cell of 3x3 should match');
  });

  test('returns false for a cell outside every cutout', () => {
    const level = {
      cutouts: [{ column: 5, row: 5, width: 3, height: 3 }],
    };
    assert.equal(levelHasCutoutAt(level, 8, 5), false);
    assert.equal(levelHasCutoutAt(level, 5, 8), false);
    assert.equal(levelHasCutoutAt(level, 4, 5), false);
  });

  test('returns false when cutouts is missing or empty', () => {
    assert.equal(levelHasCutoutAt({}, 0, 0), false);
    assert.equal(levelHasCutoutAt({ cutouts: [] }, 0, 0), false);
    assert.equal(levelHasCutoutAt(null, 0, 0), false);
  });
});

describe('cascadeReveals', () => {
  function buildViewModel({ levelACutouts = [], levelBCutouts = [] } = {}) {
    return [
      // Level 0 (base) — no cutouts. zIndex -1.
      { id: 'level-0', zIndex: -1, cutouts: [] },
      // Level A (above 0). zIndex 0.
      { id: 'level-A', zIndex: 0, cutouts: levelACutouts },
      // Level B (above A). zIndex 1.
      { id: 'level-B', zIndex: 1, cutouts: levelBCutouts },
    ];
  }

  test('reveal on a level with no cutout at that cell does not cascade', () => {
    const viewModel = buildViewModel({
      levelACutouts: [{ column: 0, row: 0, width: 1, height: 1 }],
    });
    const byLevel = {
      'level-A': { enabled: true, revealedCells: { '5,5': true } },
    };
    cascadeReveals(byLevel, viewModel, 'level-A', ['5,5']);
    assert.equal(byLevel['level-0'], undefined, 'level-0 should not get a fog entry');
  });

  test('reveal cascades one level down through a cutout', () => {
    const viewModel = buildViewModel({
      levelACutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
    });
    const byLevel = {
      'level-A': { enabled: true, revealedCells: { '5,5': true } },
    };
    cascadeReveals(byLevel, viewModel, 'level-A', ['5,5']);
    assert.ok(byLevel['level-0'], 'level-0 should get a fog entry');
    assert.equal(byLevel['level-0'].revealedCells['5,5'], true);
    assert.equal(byLevel['level-0'].enabled, false,
      'cascading should not flip enabled (per-level toggle is independent)');
  });

  test('reveal cascades through multiple stacked cutouts', () => {
    const viewModel = buildViewModel({
      levelBCutouts: [{ column: 3, row: 4, width: 1, height: 1 }],
      levelACutouts: [{ column: 3, row: 4, width: 1, height: 1 }],
    });
    const byLevel = {
      'level-B': { enabled: true, revealedCells: { '3,4': true } },
    };
    cascadeReveals(byLevel, viewModel, 'level-B', ['3,4']);
    assert.equal(byLevel['level-A'].revealedCells['3,4'], true);
    assert.equal(byLevel['level-0'].revealedCells['3,4'], true);
  });

  test('cascade stops where the cutout column ends', () => {
    // Level B has a cutout at (3,4), Level A does NOT.
    const viewModel = buildViewModel({
      levelBCutouts: [{ column: 3, row: 4, width: 1, height: 1 }],
      levelACutouts: [],
    });
    const byLevel = {
      'level-B': { enabled: true, revealedCells: { '3,4': true } },
    };
    cascadeReveals(byLevel, viewModel, 'level-B', ['3,4']);
    assert.equal(byLevel['level-A'].revealedCells['3,4'], true,
      'first hop reaches level-A');
    assert.equal(byLevel['level-0'], undefined,
      'level-0 should not be reached when level-A has no cutout');
  });

  test('cascade preserves existing reveals on lower levels (no overwrite)', () => {
    const viewModel = buildViewModel({
      levelACutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
    });
    const byLevel = {
      'level-A': { enabled: true, revealedCells: { '5,5': true } },
      'level-0': { enabled: true, revealedCells: { '0,0': true } },
    };
    cascadeReveals(byLevel, viewModel, 'level-A', ['5,5']);
    assert.equal(byLevel['level-0'].revealedCells['0,0'], true,
      'pre-existing reveal on level-0 should remain');
    assert.equal(byLevel['level-0'].revealedCells['5,5'], true,
      'cascaded reveal added to level-0');
  });

  test('multi-cell selection cascades each cell independently', () => {
    const viewModel = buildViewModel({
      // Level A has a cutout only at (5,5), not at (6,6).
      levelACutouts: [{ column: 5, row: 5, width: 1, height: 1 }],
    });
    const byLevel = {
      'level-A': { enabled: true, revealedCells: { '5,5': true, '6,6': true } },
    };
    cascadeReveals(byLevel, viewModel, 'level-A', ['5,5', '6,6']);
    assert.equal(byLevel['level-0']?.revealedCells['5,5'], true,
      '(5,5) cascades through cutout');
    assert.equal(byLevel['level-0']?.revealedCells['6,6'], undefined,
      '(6,6) does not cascade — no cutout there');
  });

  test('rect cutouts cascade across all cells inside them', () => {
    // Level B has a 3x2 cutout at (10,10).
    const viewModel = buildViewModel({
      levelBCutouts: [{ column: 10, row: 10, width: 3, height: 2 }],
    });
    const byLevel = {
      'level-B': {
        enabled: true,
        revealedCells: { '10,10': true, '12,11': true, '20,20': true },
      },
    };
    cascadeReveals(byLevel, viewModel, 'level-B', ['10,10', '12,11', '20,20']);
    assert.equal(byLevel['level-A'].revealedCells['10,10'], true);
    assert.equal(byLevel['level-A'].revealedCells['12,11'], true);
    assert.equal(byLevel['level-A'].revealedCells['20,20'], undefined,
      '(20,20) is outside the cutout');
  });
});
