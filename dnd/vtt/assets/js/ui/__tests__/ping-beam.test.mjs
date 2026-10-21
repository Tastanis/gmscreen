import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Brandon (October 2026): pings "a little more like on the 3D map. With the god [rays], but not as big and not as
// long." The campus map (strixhaven/map3d showPing) brings a shaft of light down onto the spot for 9 to 11 seconds,
// several squares wide; the board's pings keep their ring and add a narrow shaft for about two and a half seconds.
const source = readFileSync(new URL('../../../../board3d/layers/pings.mjs', import.meta.url), 'utf8');

test('a 3D ping brings a narrow shaft of light down onto the spot, briefly', () => {
  const value = (name) => Number(source.match(new RegExp(name + '=([0-9.]+)'))?.[1]);
  assert.ok(value('BEAM_MS') >= 2000 && value('BEAM_MS') <= 3500, 'a couple of seconds, not nine or eleven');
  assert.ok(value('BEAM_RADIUS') <= 1.2, 'about a square across, not a hex');
  assert.match(source, /const COLOURS=\{ping:0xffc566,focus:0x86c4ff\};/, 'the campus map\'s colours: amber for a ping, blue for a focus');
  assert.match(source, /beam\(at\.x,at\.y,height,type\);/, 'every pulse gets its shaft, at the height it was put on');
  assert.match(source, /if\(e>BEAM_MS\)\{drop\(entry\);continue;\}/, 'and it is taken away when it is done');
  assert.match(source, /el\.className='vtt-board__ping'/, 'the ring stays');
});
