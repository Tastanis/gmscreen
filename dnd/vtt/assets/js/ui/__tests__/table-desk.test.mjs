import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// The Table (dnd/table): its window manager and rail, run as the file version (?mock: made-up data, no site).
// Found by the end-to-end test of Build 578 (October 2026).

const root = new URL('../../../../../table/', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

function openTable() {
  // The page is PHP since October 27, 2026 (versions on its files, settings from the server): its PHP and scripts are left out.
  const html = read('index.php').replace(/^<\?php[\s\S]*?\?>/, '').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/dnd/table/?mock', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.Element.prototype.setPointerCapture = () => {};
  w.Element.prototype.releasePointerCapture = () => {};
  // The table is 1546 × 900 (a 1600 × 900 screen less the rail).
  const table = w.document.getElementById('table');
  table.getBoundingClientRect = () => ({ left: 54, top: 0, right: 1600, bottom: 900, width: 1546, height: 900, x: 54, y: 0 });
  w.eval(read('table.js'));
  w.eval(read('table-apps.js'));
  return dom;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const pointer = (w, type, x, y) => { const e = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }); e.pointerId = 1; return e; };
const savedLayout = (w) => JSON.parse(w.localStorage.getItem('table-proto-layout-v1'));

test('a layout from the S menu (Prep) is saved at once, so a reload brings it back', async () => {
  const dom = openTable(); const w = dom.window;
  try {
    await settle();
    w.document.querySelector('#rail .logo').click();
    const prep = [...w.document.querySelectorAll('.flyout .menu-row')].find((n) => n.querySelector('span')?.textContent === 'Prep');
    prep.click();
    const byApp = Object.fromEntries(savedLayout(w).windows.map((s) => [s.app, s]));
    assert.equal(Math.round(byApp.creatures.x), 0);
    assert.equal(Math.round(byApp.map.x), Math.round(1546 * 0.36), 'the map beside the creatures, as placed');
    assert.equal(Math.round(byApp.map.w), Math.round(1546 * 0.64));
  } finally { dom.window.close(); }
});

test('a window grip resizes by how far the pointer moved (not by where the window is)', async () => {
  const dom = openTable(); const w = dom.window;
  try {
    await settle();
    const map = w.Table.windows.get('map');
    const before = { ...map.state };
    const grip = map.node.querySelector('.grip.se');
    grip.dispatchEvent(pointer(w, 'pointerdown', 900, 700));
    grip.dispatchEvent(pointer(w, 'pointermove', 850, 650));
    grip.dispatchEvent(pointer(w, 'pointerup', 850, 650));
    assert.equal(map.state.w, before.w - 50);
    assert.equal(map.state.h, before.h - 50);
    assert.equal(map.state.x, before.x, 'the window stays where it is');
  } finally { dom.window.close(); }
});

test('a hero card is not moved in the page by a press (that lost the click, and the double-click that opens the sheet)', async () => {
  const dom = openTable(); const w = dom.window;
  try {
    await settle();
    const cards = () => [...w.document.querySelectorAll('.card[data-hero]')];
    const first = cards()[0];
    assert.notEqual(cards().at(-1), first);
    first.dispatchEvent(pointer(w, 'pointerdown', 60, 60));
    first.dispatchEvent(pointer(w, 'pointerup', 60, 60));
    assert.equal(cards()[0], first, 'a plain press leaves the card where it is in the page');
    // The second quick press, a few pixels off (a real hand wobbles), is the double-click that opens the sheet.
    first.dispatchEvent(pointer(w, 'pointerdown', 64, 63));
    first.dispatchEvent(pointer(w, 'pointermove', 66, 64));
    first.dispatchEvent(pointer(w, 'pointerup', 66, 64));
    assert.ok(w.Table.windows.has('sheet-' + first.dataset.hero), 'the double-click opens that hero\'s sheet');
    // A drag still brings the card to the front.
    first.dispatchEvent(pointer(w, 'pointerdown', 60, 60));
    first.dispatchEvent(pointer(w, 'pointermove', 120, 90));
    first.dispatchEvent(pointer(w, 'pointerup', 120, 90));
    assert.equal(cards().at(-1), first);
    assert.equal(first.style.left, '60px', 'moved by the drag (jsdom has no layout: it starts from offsetLeft 0)');
  } finally { dom.window.close(); }
});

test('closing a full-screen map takes its tools off the rail', async () => {
  const dom = openTable(); const w = dom.window;
  try {
    await settle();
    const map = w.Table.windows.get('map');
    w.Table.maximize(map, true);
    w.document.getElementById('map-tools').innerHTML = '<button class="rail-btn" data-rtool="view"></button>';
    w.Table.closeWindow(map);
    assert.equal(w.document.querySelectorAll('#map-tools [data-rtool]').length, 0);
    assert.equal(w.document.body.classList.contains('map-docked'), false);
  } finally { dom.window.close(); }
});

test('flyout search hides rows (the rows\' display does not win over [hidden]); the hero list draws no initials over portraits', () => {
  const css = read('table.css');
  assert.match(css, /\.flyout \[hidden\] \{ display: none !important; \}/);
  assert.match(css, /@media \(max-height: 860px\) \{\s*body\.map-docked #rail \.rail-label \{ display: none; \}/, 'a short screen keeps every map tool on the rail in sight');
  assert.match(read('table-apps.js'), /\$\{\(h\.pic \|\| h\.picUrl\) && SERVED \? '' : initials\(h\.name\)\}<\/div><div class="txt">/);
});

test('the map strip: menus open under the 72px top bar, a second press closes them, the damage box opens beside the strip', () => {
  const js = read('vtt-embed.js');
  assert.match(js, /const TOP_BAR = 72;/);
  assert.match(js, /menu\.style\.top = Math\.max\(topBarBottom\(\) \+ 6,/);
  assert.match(js, /if \(t\?\.menu && menu && menuTool === id\) \{ closeMenu\(\); return true; \}/);
  assert.match(js, /classList\.contains\('vtt-damage-heal'\)/);
  assert.match(read('vtt-embed.css'), /html\.vtt-embed \.vtt-board__condition-banner-region \{ z-index: 1290; \}/, 'the new-fight banner and its Undo sit above the hero panel');
});
