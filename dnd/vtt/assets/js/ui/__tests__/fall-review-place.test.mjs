import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 537 (Brandon, October 19, 2026): the fall pop-up has to be settled, so it stands middle-right of the screen,
// not docked at the far right (and still not beside the fallen token, where it covered the squares being clicked).
const source = readFileSync(new URL('../fall-review.js', import.meta.url), 'utf8');

test('the fall pop-up stands middle-right: its middle at about 62% across, halfway down, below the top bar', () => {
  const dock = source.match(/const dock=\(\)=>\{[\s\S]*?panel\.style\.top=top\+'px';\};/);
  assert.ok(dock, 'the placing code');
  const place = ({ width, height, panel = { width: 264, height: 300 }, barBottom = 60 }) => {
    const style = {};
    const run = new Function('disposed', 'panel', 'document', 'innerWidth', 'innerHeight', `${dock[0]}\ndock();return panel.style;`);
    return run(false, { isConnected: true, getBoundingClientRect: () => panel, style }, { querySelector: () => ({ getBoundingClientRect: () => ({ bottom: barBottom }) }) }, width, height);
  };
  const wide = place({ width: 1400, height: 900 });
  assert.equal(wide.left, `${1400 * 0.62 - 132}px`, 'its middle at 62% across');
  assert.equal(wide.top, '300px', 'halfway down');
  assert.ok(parseFloat(wide.left) + 264 < 1400 - 200, 'well clear of the right edge');
  const small = place({ width: 500, height: 400, panel: { width: 264, height: 380 } });
  assert.equal(small.left, `${500 * 0.62 - 132}px`);
  assert.equal(place({ width: 300, height: 400, panel: { width: 264, height: 380 } }).left, '24px', 'never off the screen');
  assert.equal(small.top, '72px', 'never under the top bar');
  assert.doesNotMatch(source, /innerWidth-box\.width-64/, 'no longer docked at the far right');
});
