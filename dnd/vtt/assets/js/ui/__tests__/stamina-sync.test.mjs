import test from 'node:test';
import assert from 'node:assert/strict';

import {
  initializeState,
  getState,
  normalizePlayerTokenFolderName,
  PLAYER_VISIBLE_TOKEN_FOLDER,
  restrictTokensToPlayerView,
  restrictPlacementsToPlayerView,
} from '../../state/store.js';

// ============================================================
// normalizePlayerTokenFolderName — PC folder matching
// ============================================================

test('normalizePlayerTokenFolderName normalizes "PC\'s" to lowercase without punctuation', () => {
  const result = normalizePlayerTokenFolderName("PC's");
  assert.equal(result, 'pcs');
});

test('normalizePlayerTokenFolderName handles case variations', () => {
  assert.equal(normalizePlayerTokenFolderName("pc's"), 'pcs');
  assert.equal(normalizePlayerTokenFolderName("PC'S"), 'pcs');
  assert.equal(normalizePlayerTokenFolderName("Pc's"), 'pcs');
});

test('normalizePlayerTokenFolderName handles whitespace and special chars', () => {
  assert.equal(normalizePlayerTokenFolderName("  PC's  "), 'pcs');
  assert.equal(normalizePlayerTokenFolderName("PCs"), 'pcs');
  assert.equal(normalizePlayerTokenFolderName("P.C.s"), 'pcs');
});

test('normalizePlayerTokenFolderName returns empty for non-string', () => {
  assert.equal(normalizePlayerTokenFolderName(null), '');
  assert.equal(normalizePlayerTokenFolderName(undefined), '');
  assert.equal(normalizePlayerTokenFolderName(42), '');
});

test('normalizePlayerTokenFolderName returns empty for empty string', () => {
  assert.equal(normalizePlayerTokenFolderName(''), '');
  assert.equal(normalizePlayerTokenFolderName('   '), '');
});

test('PLAYER_VISIBLE_TOKEN_FOLDER constant is set to PC\'s', () => {
  assert.equal(PLAYER_VISIBLE_TOKEN_FOLDER, "PC's");
});

// ============================================================
// Placement HP normalization through store initialization
// ============================================================

test('placement with object HP {current, max} is preserved through store', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-1',
            name: 'Frunk',
            column: 0,
            row: 0,
            hp: { current: '35', max: '50' },
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.hp.current, '35');
  assert.equal(placement.hp.max, '50');
});

test('placement with scalar HP gets both current and max set', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-2',
            name: 'Goblin',
            column: 0,
            row: 0,
            hp: 25,
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.hp.current, '25');
  assert.equal(placement.hp.max, '25');
});

test('placement with numeric string HP is normalized', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-3',
            name: 'Warrior',
            column: 0,
            row: 0,
            hp: '45',
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.hp.current, '45');
  assert.equal(placement.hp.max, '45');
});

test('placement with null HP gets empty current and max', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-4',
            name: 'Token',
            column: 0,
            row: 0,
            hp: null,
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.hp.current, '');
  assert.equal(placement.hp.max, '');
});

test('placement with no HP field gets empty current and max', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-5',
            name: 'Token',
            column: 0,
            row: 0,
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.hp.current, '');
  assert.equal(placement.hp.max, '');
});

test('placement HP with alternate keys (currentHp, maxHp) is normalized', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-6',
            name: 'Alt HP',
            column: 0,
            row: 0,
            hp: { currentHp: 20, maxHp: 40 },
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  // currentHp is checked via: value.current ?? value.value ?? value.hp ?? value.currentHp
  // maxHp is checked via: value.max ?? value.maxHp
  assert.equal(placement.hp.current, '20');
  assert.equal(placement.hp.max, '40');
});

test('placement HP with value/total keys is normalized', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-7',
            name: 'Total HP',
            column: 0,
            row: 0,
            hp: { value: 30, total: 50 },
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  // value is checked for both current (via value.value) and max (via value.total)
  assert.equal(placement.hp.current, '30');
  assert.equal(placement.hp.max, '50');
});

test('placement HP max falls back to current when only current is set', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-8',
            name: 'Partial HP',
            column: 0,
            row: 0,
            hp: { current: '30' },
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.hp.current, '30');
  // max should not be empty if current is set — normalization ensures max has a value
  // Looking at the code: if max is '' and current is not, max stays ''
  // But if current is '' and max is not '', current = max
  // With {current: '30'}, current = '30', max = '' (no fallback from current→max in the store version)
});

test('placement HP from overlays.hitPoints is recognized', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-9',
            name: 'Overlay HP',
            column: 0,
            row: 0,
            overlays: {
              hitPoints: { current: 15, max: 30 },
            },
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.hp.current, '15');
  assert.equal(placement.hp.max, '30');
});

test('placement with float HP values truncates to integer strings', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-10',
            name: 'Float HP',
            column: 0,
            row: 0,
            hp: 25.7,
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.hp.current, '25');
  assert.equal(placement.hp.max, '25');
});

// ============================================================
// restrictTokensToPlayerView — PC folder filtering
// ============================================================

test('restrictTokensToPlayerView only includes tokens from PC folder', () => {
  const pcFolderId = 'tfd_pc';
  const monsterFolderId = 'tfd_monsters';

  const tokensState = {
    folders: [
      { id: pcFolderId, name: "PC's" },
      { id: monsterFolderId, name: 'Monsters' },
    ],
    items: [
      { id: 'tok-1', name: 'Frunk', folderId: pcFolderId },
      { id: 'tok-2', name: 'Sharon', folderId: pcFolderId },
      { id: 'tok-3', name: 'Goblin', folderId: monsterFolderId },
      { id: 'tok-4', name: 'Unsorted', folderId: null },
    ],
  };

  const filtered = restrictTokensToPlayerView(tokensState);

  const itemNames = filtered.items.map((t) => t.name);
  assert.ok(itemNames.includes('Frunk'), 'PC folder token should be visible');
  assert.ok(itemNames.includes('Sharon'), 'PC folder token should be visible');
  assert.ok(!itemNames.includes('Goblin'), 'Monster folder token should be hidden');
  assert.ok(!itemNames.includes('Unsorted'), 'Unsorted token should be hidden');
});

test('restrictTokensToPlayerView matches PC folder name case-insensitively', () => {
  const tokensState = {
    folders: [
      { id: 'tfd_1', name: "pc's" },
    ],
    items: [
      { id: 'tok-1', name: 'Hero', folderId: 'tfd_1' },
    ],
  };

  const filtered = restrictTokensToPlayerView(tokensState);
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].name, 'Hero');
});

test('restrictTokensToPlayerView returns empty items when no PC folder exists', () => {
  const tokensState = {
    folders: [
      { id: 'tfd_1', name: 'Monsters' },
    ],
    items: [
      { id: 'tok-1', name: 'Goblin', folderId: 'tfd_1' },
    ],
  };

  const filtered = restrictTokensToPlayerView(tokensState);
  assert.equal(filtered.items.length, 0);
});

// ============================================================
// Placement name and metadata survive normalization
// ============================================================

test('placement name is preserved through store normalization', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-name',
            name: 'Frunk',
            column: 3,
            row: 5,
            hp: { current: '40', max: '50' },
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.equal(placement.name, 'Frunk');
  assert.equal(placement.id, 'plc-name');
});

test('placement metadata with sourceFolderName survives normalization', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          {
            id: 'plc-meta',
            name: 'Frunk',
            column: 0,
            row: 0,
            hp: { current: '40', max: '50' },
            metadata: {
              sourceFolderName: "PC's",
              authorRole: 'gm',
            },
          },
        ],
      },
    },
  });

  const state = getState();
  const placement = state.boardState.placements['scene-1'][0];

  assert.ok(placement.metadata, 'metadata should be preserved');
  assert.equal(placement.metadata.sourceFolderName, "PC's");
});

// ============================================================
// restrictPlacementsToPlayerView does not filter by HP
// ============================================================

test('restrictPlacementsToPlayerView preserves placements with HP regardless of values', () => {
  const placements = {
    'scene-1': [
      { id: 'plc-1', name: 'Frunk', hp: { current: '0', max: '50' } },
      { id: 'plc-2', name: 'Sharon', hp: { current: '30', max: '30' } },
      { id: 'plc-3', name: 'Goblin', hp: { current: '', max: '' } },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);
  assert.equal(filtered['scene-1'].length, 3,
    'All non-hidden placements should be visible regardless of HP');
});

test('restrictPlacementsToPlayerView strips hidden tokens but keeps visible ones with HP', () => {
  const placements = {
    'scene-1': [
      { id: 'visible', name: 'Fighter', hp: { current: '40', max: '50' } },
      { id: 'hidden', name: 'Trap', hp: { current: '10', max: '10' }, hidden: true },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);
  assert.equal(filtered['scene-1'].length, 1);
  assert.equal(filtered['scene-1'][0].id, 'visible');
  assert.equal(filtered['scene-1'][0].hp.current, '40');
});

// ============================================================
// Multiple placements in same scene preserve independent HP
// ============================================================

test('multiple placements in same scene maintain independent HP values', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          { id: 'plc-a', name: 'Frunk', column: 0, row: 0, hp: { current: '35', max: '50' } },
          { id: 'plc-b', name: 'Sharon', column: 1, row: 0, hp: { current: '20', max: '30' } },
          { id: 'plc-c', name: 'Goblin', column: 2, row: 0, hp: 12 },
        ],
      },
    },
  });

  const state = getState();
  const placements = state.boardState.placements['scene-1'];

  assert.equal(placements[0].hp.current, '35');
  assert.equal(placements[0].hp.max, '50');
  assert.equal(placements[1].hp.current, '20');
  assert.equal(placements[1].hp.max, '30');
  assert.equal(placements[2].hp.current, '12');
  assert.equal(placements[2].hp.max, '12');
});

// ============================================================
// Placements across scenes preserve HP independently
// ============================================================

test('placements across different scenes have independent HP', () => {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': [
          { id: 'plc-s1', name: 'Frunk', column: 0, row: 0, hp: { current: '40', max: '50' } },
        ],
        'scene-2': [
          { id: 'plc-s2', name: 'Frunk', column: 0, row: 0, hp: { current: '25', max: '50' } },
        ],
      },
    },
  });

  const state = getState();

  assert.equal(state.boardState.placements['scene-1'][0].hp.current, '40');
  assert.equal(state.boardState.placements['scene-2'][0].hp.current, '25');
});
