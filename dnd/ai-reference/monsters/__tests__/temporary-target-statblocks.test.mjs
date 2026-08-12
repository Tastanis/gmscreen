import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  new URL('../angel.json', import.meta.url),
  new URL('../shaile-dean-of-radiance.json', import.meta.url),
  new URL('../ioria.json', import.meta.url),
];

test('temporary angel and Shaile statblocks have complete targeting stats and no abilities', async () => {
  for (const file of files) {
    const monster = JSON.parse(await readFile(file, 'utf8'));
    assert.ok(monster.name);
    for (const field of ['level', 'ev', 'speed', 'stamina', 'stability', 'free_strike']) {
      assert.equal(typeof monster[field], 'number', `${monster.name}.${field}`);
    }
    assert.ok(monster.size);
    for (const attribute of ['might', 'agility', 'reason', 'intuition', 'presence']) {
      assert.equal(typeof monster.attributes[attribute], 'number', `${monster.name}.${attribute}`);
    }
    assert.deepEqual(
      Object.values(monster.abilities).flat(),
      [],
      `${monster.name} must remain an ability-free temporary target`,
    );
  }
});

test('Ioria has exactly 45 Stamina', async () => {
  const ioria = JSON.parse(await readFile(new URL('../ioria.json', import.meta.url), 'utf8'));
  assert.equal(ioria.stamina, 45);
});
