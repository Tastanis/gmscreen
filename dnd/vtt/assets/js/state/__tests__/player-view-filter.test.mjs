import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  restrictPlacementsToPlayerView,
  restrictTokensToPlayerView,
} from '../store.js';

// ============================================================
// restrictPlacementsToPlayerView — hidden token filtering
// ============================================================

test('hidden:true placements are stripped from player view', () => {
  const placements = {
    'scene-1': [
      { id: 'visible', name: 'Fighter', column: 3 },
      { id: 'hidden', name: 'Trap', column: 7, hidden: true },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 1);
  assert.equal(filtered['scene-1'][0].id, 'visible');
});

test('isHidden alternate key is recognized', () => {
  const placements = {
    'scene-1': [
      { id: 'hidden-alt', name: 'Secret', isHidden: true },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 0);
});

test('flags.hidden nested key is recognized', () => {
  const placements = {
    'scene-1': [
      { id: 'hidden-flags', name: 'Ambush', flags: { hidden: true } },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 0);
});

test('non-hidden placements are preserved', () => {
  const placements = {
    'scene-1': [
      { id: 'token-1', hidden: false },
      { id: 'token-2' },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 2);
});

test('mixed hidden and visible in same scene', () => {
  const placements = {
    'scene-1': [
      { id: 'visible-1', name: 'Fighter' },
      { id: 'hidden-1', name: 'Trap', hidden: true },
      { id: 'visible-2', name: 'Cleric' },
      { id: 'hidden-2', name: 'Assassin', isHidden: true },
      { id: 'visible-3', name: 'Goblin', hidden: false },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);
  const ids = filtered['scene-1'].map((e) => e.id);

  assert.deepEqual(ids, ['visible-1', 'visible-2', 'visible-3']);
});

test('string "true" is recognized as hidden', () => {
  const placements = {
    'scene-1': [
      { id: 'str-true', hidden: 'true' },
      { id: 'str-1', hidden: '1' },
      { id: 'str-yes', hidden: 'yes' },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 0);
});

test('string "false" is NOT hidden', () => {
  const placements = {
    'scene-1': [
      { id: 'str-false', hidden: 'false' },
      { id: 'str-0', hidden: '0' },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 2);
});

test('integer 1 is recognized as hidden', () => {
  const placements = {
    'scene-1': [
      { id: 'int-hidden', hidden: 1 },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 0);
});

test('multiple scenes are filtered independently', () => {
  const placements = {
    'scene-1': [
      { id: 's1-visible', name: 'Fighter' },
      { id: 's1-hidden', name: 'Trap', hidden: true },
    ],
    'scene-2': [
      { id: 's2-hidden', name: 'Boss', hidden: true },
    ],
    'scene-3': [
      { id: 's3-visible', name: 'NPC' },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 1);
  assert.equal(filtered['scene-1'][0].id, 's1-visible');
  assert.equal(filtered['scene-2'].length, 0);
  assert.equal(filtered['scene-3'].length, 1);
  assert.equal(filtered['scene-3'][0].id, 's3-visible');
});

test('empty placements returns empty object', () => {
  const filtered = restrictPlacementsToPlayerView({});

  assert.deepEqual(filtered, {});
});

test('null/undefined placements returns empty object', () => {
  assert.deepEqual(restrictPlacementsToPlayerView(null), {});
  assert.deepEqual(restrictPlacementsToPlayerView(undefined), {});
});

// ============================================================
// restrictPlacementsToPlayerView — monster stat stripping
// ============================================================

test('enemy placement has monster data stripped', () => {
  const placements = {
    'scene-1': [
      {
        id: 'enemy-1',
        name: 'Goblin',
        combatTeam: 'enemy',
        monster: { name: 'Goblin', hp: 7, ac: 15 },
        monsterId: 'goblin-001',
      },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);
  const token = filtered['scene-1'][0];

  assert.equal(token.monster, undefined);
  assert.equal(token.monsterId, undefined);
  assert.equal(token.id, 'enemy-1');
});

test('ally placement keeps monster data', () => {
  const monsterData = { name: 'Fighter', hp: 45 };
  const placements = {
    'scene-1': [
      {
        id: 'ally-1',
        combatTeam: 'ally',
        monster: monsterData,
        monsterId: 'fighter-001',
      },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);
  const token = filtered['scene-1'][0];

  assert.deepEqual(token.monster, monsterData);
  assert.equal(token.monsterId, 'fighter-001');
});

test('placement with no combatTeam has monster stripped', () => {
  const placements = {
    'scene-1': [
      {
        id: 'no-team',
        monster: { name: 'Mystery', hp: 20 },
        monsterId: 'mystery-001',
      },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);
  const token = filtered['scene-1'][0];

  assert.equal(token.monster, undefined);
  assert.equal(token.monsterId, undefined);
});

test('hidden enemy with monster data is fully stripped (entire placement removed)', () => {
  const placements = {
    'scene-1': [
      {
        id: 'hidden-enemy',
        combatTeam: 'enemy',
        hidden: true,
        monster: { name: 'Boss', hp: 300 },
      },
    ],
  };

  const filtered = restrictPlacementsToPlayerView(placements);

  assert.equal(filtered['scene-1'].length, 0);
});

// ============================================================
// restrictTokensToPlayerView — token library filtering
// ============================================================

test('only PC folder tokens are visible to players', () => {
  const tokens = {
    folders: [
      { id: 'folder-pcs', name: "PC's" },
      { id: 'folder-monsters', name: 'Monsters' },
    ],
    items: [
      { id: 'fighter', name: 'Fighter', folderId: 'folder-pcs' },
      { id: 'goblin', name: 'Goblin', folderId: 'folder-monsters' },
    ],
  };

  const filtered = restrictTokensToPlayerView(tokens);

  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].id, 'fighter');
  assert.equal(filtered.folders.length, 1);
  assert.equal(filtered.folders[0].name, "PC's");
});

test('GM tokens in other folders not visible', () => {
  const tokens = {
    folders: [
      { id: 'folder-pcs', name: "PC's" },
      { id: 'folder-gm', name: 'GM Secrets' },
    ],
    items: [
      { id: 'rogue', name: 'Rogue', folderId: 'folder-pcs' },
      { id: 'boss', name: 'Final Boss', folderId: 'folder-gm' },
    ],
  };

  const filtered = restrictTokensToPlayerView(tokens);
  const ids = filtered.items.map((t) => t.id);

  assert.ok(ids.includes('rogue'));
  assert.ok(!ids.includes('boss'));
});

test('token library monster data is stripped', () => {
  const tokens = {
    folders: [
      { id: 'folder-pcs', name: "PC's" },
    ],
    items: [
      {
        id: 'fighter',
        name: 'Fighter',
        folderId: 'folder-pcs',
        monster: { name: 'Fighter', hp: 45 },
        monsterId: 'fighter-001',
      },
    ],
  };

  const filtered = restrictTokensToPlayerView(tokens);
  const token = filtered.items[0];

  assert.equal(token.monster, undefined);
  assert.equal(token.monsterId, undefined);
  assert.equal(token.name, 'Fighter');
});

test('no matching folder returns empty', () => {
  const tokens = {
    folders: [
      { id: 'folder-monsters', name: 'Monsters' },
    ],
    items: [
      { id: 'goblin', name: 'Goblin', folderId: 'folder-monsters' },
    ],
  };

  const filtered = restrictTokensToPlayerView(tokens);

  assert.equal(filtered.items.length, 0);
});

test('empty token library returns empty', () => {
  const filtered = restrictTokensToPlayerView({ folders: [], items: [] });

  assert.deepEqual(filtered.folders, []);
  assert.deepEqual(filtered.items, []);
});

test('tokens with folder metadata fallback are matched', () => {
  const tokens = {
    folders: [],
    items: [
      {
        id: 'ranger',
        name: 'Ranger',
        folderId: 'folder-pcs',
        folder: { name: "PC's" },
      },
    ],
  };

  const filtered = restrictTokensToPlayerView(tokens);

  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].id, 'ranger');
});
