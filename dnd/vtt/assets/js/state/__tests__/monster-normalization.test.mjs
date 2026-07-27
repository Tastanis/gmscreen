import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMonsterSnapshot } from '../normalize/monsters.js';

test('normalizeMonsterSnapshot preserves monster ability automation payloads', () => {
  const monster = normalizeMonsterSnapshot({
    id: 'm-1',
    name: 'Automated Horror',
    abilities: {
      action: [
        {
          name: 'Static Lash',
          effect: 'Zap a nearby target.',
          automation: {
            cards: [
              { type: 'damage', amount: '5' },
            ],
          },
        },
      ],
    },
  });

  assert.deepEqual(monster.abilities.action[0].automation, {
    cards: [
      { type: 'damage', amount: '5' },
    ],
  });
});

test('normalizeMonsterSnapshot preserves case-variant nested characteristics', () => {
  const monster = normalizeMonsterSnapshot({
    id: 'm-2',
    name: 'Imported Horror',
    Characteristics: {
      Might: 4,
      Agility: 2,
      Reason: -1,
      Intuition: 3,
      Presence: 1,
    },
  });

  assert.deepEqual(monster.attributes, {
    might: 4,
    agility: 2,
    reason: -1,
    intuition: 3,
    presence: 1,
  });
});
