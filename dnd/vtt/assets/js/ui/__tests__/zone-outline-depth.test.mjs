import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Dead Root, November 12, 2026: the blood zone's outline showed through the +4 hill and read as a box round a jar
// ("do these make you climb over them?"). On the 3D board zone outlines are hidden behind terrain and art like
// everything else; ability areas keep their faint see-through edge.
test('zone outlines draw no hidden part; area outlines still do', () => {
  const zones = readFileSync(new URL('../../../../board3d/layers/terrain-zones.mjs', import.meta.url), 'utf8');
  assert.equal(zones.match(/hiddenOpacity:0,renderOrder:[78]\}/g)?.length, 2);
  const lines = readFileSync(new URL('../../../../board3d/area-volume.mjs', import.meta.url), 'utf8');
  assert.match(lines, /for\(const hidden of hiddenOpacity>0\?\[false,true\]:\[false\]\)\{/);
  assert.match(lines, /hiddenOpacity=HIDDEN_EDGE/, 'the default is unchanged');
});
