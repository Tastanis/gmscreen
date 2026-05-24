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
