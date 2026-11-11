import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// The ability hover card above the Table's windows (Brandon, November 10, 2026: "The ability pops up while I'm
// hovering, shows up over the chat, and then goes away when I move off of it."). The map runs framed in the Table;
// vtt-embed.js draws a copy of the open card in the Table's page, on the same spot of the screen, above every window.

const embedJs = readFileSync(new URL('../../../../../table/vtt-embed.js', import.meta.url), 'utf8');
const embedCss = readFileSync(new URL('../../../../../table/vtt-embed.css', import.meta.url), 'utf8');
const frames = () => new Promise((resolve) => setTimeout(resolve, 60));

function openTableWithMap() {
  const dom = new JSDOM('<body><div class="win chat" style="z-index:30"></div><iframe id="map"></iframe></body>', { url: 'http://localhost/dnd/table/', runScripts: 'outside-only', pretendToBeVisual: true });
  // A 1600 x 900 Table page; the map window inside it at 300, 100.
  Object.defineProperty(dom.window, 'innerWidth', { value: 1600 });
  Object.defineProperty(dom.window, 'innerHeight', { value: 900 });
  const iframe = dom.window.document.getElementById('map');
  iframe.getBoundingClientRect = () => ({ left: 300, top: 100, right: 1100, bottom: 700, width: 800, height: 600, x: 300, y: 100 });
  const vtt = iframe.contentWindow;
  // A blank frame has no origin to post to, and the embed's once-a-second top-bar repaint is not wanted here.
  dom.window.postMessage = () => {};
  vtt.setInterval = () => 0;
  vtt.document.body.innerHTML = '<aside id="vtt-character-ability-preview" class="vtt-character-ability-preview" aria-hidden="true"></aside>';
  vtt.eval(embedJs);
  const card = vtt.document.getElementById('vtt-character-ability-preview');
  card.getBoundingClientRect = () => (card.classList.contains('vtt-character-ability-preview--open')
    ? { left: 396, top: 118, right: 776, bottom: 418, width: 380, height: 300, x: 396, y: 118 }
    : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
  return { dom, vtt, card, iframe };
}

test('an open hover card is drawn in the Table\'s page above its windows, on the same spot, and goes when it closes', async () => {
  const { dom, vtt, card, iframe } = openTableWithMap();
  const table = dom.window.document;
  try {
    await frames();
    assert.equal(table.querySelector('.te-lifted-card'), null, 'nothing drawn while no card is open');

    // Hovering an ability: the tray fills the card and opens it.
    card.innerHTML = '<article class="vtt-character-ability-card"><h2>Surge of Insight</h2><p>The first time each round...</p></article>';
    card.classList.add('vtt-character-ability-preview--open');
    await frames();
    const lifted = table.querySelector('.te-lifted-card');
    assert.ok(lifted, 'the card is drawn in the Table page');
    assert.equal(lifted.parentElement, table.body);
    assert.match(lifted.textContent, /Surge of Insight/);
    assert.equal(lifted.style.position, 'fixed');
    assert.equal(lifted.style.left, '696px', 'the map window\'s left (300) + the card\'s left in the map (396)');
    assert.equal(lifted.style.top, '218px', 'the map window\'s top (100) + the card\'s top in the map (118)');
    assert.equal(lifted.style.width, '380px');
    assert.equal(lifted.style.pointerEvents, 'none', 'hover only: it takes no clicks');
    assert.ok(Number(lifted.style.zIndex) > 2147483000, 'above every Table window');
    assert.equal(lifted.id, '', 'no second element with the card\'s id');
    assert.ok(vtt.document.documentElement.classList.contains('te-card-lifted'), 'the card in the map is hidden under it');

    // Another ability: the copy follows; only one at a time.
    card.querySelector('h2').textContent = 'Clarity';
    await frames();
    assert.equal(table.querySelectorAll('.te-lifted-card').length, 1);
    assert.match(table.querySelector('.te-lifted-card').textContent, /Clarity/);

    // A map window partly off the Table page: the copy stays inside the page.
    iframe.getBoundingClientRect = () => ({ left: 1400, top: 100, right: 2200, bottom: 700, width: 800, height: 600, x: 1400, y: 100 });
    card.querySelector('h2').textContent = 'Clarity, moved';
    await frames();
    assert.equal(table.querySelector('.te-lifted-card').style.left, '1216px', '1600 - 380 - 4');

    // Moving off: the card closes and the copy goes.
    card.classList.remove('vtt-character-ability-preview--open');
    await frames();
    assert.equal(table.querySelector('.te-lifted-card'), null, 'no card left behind');
    assert.equal(vtt.document.documentElement.classList.contains('te-card-lifted'), false);

    // The pointer on the Table page (off the map) never leaves a card behind.
    card.classList.add('vtt-character-ability-preview--open');
    await frames();
    assert.ok(table.querySelector('.te-lifted-card'));
    table.dispatchEvent(new dom.window.Event('pointermove'));
    assert.equal(table.querySelector('.te-lifted-card'), null);
  } finally {
    dom.window.close();
  }
});

test('a card the monster bar adds later is lifted too; the map on its own (not framed) draws no copy', async () => {
  const { dom, vtt } = openTableWithMap();
  try {
    await frames();
    const monster = vtt.document.createElement('aside');
    monster.id = 'vtt-monster-ability-preview';
    monster.className = 'vtt-character-ability-preview vtt-monster-ability-preview';
    monster.getBoundingClientRect = () => ({ left: 10, top: 20, right: 210, bottom: 220, width: 200, height: 200, x: 10, y: 20 });
    vtt.document.body.append(monster);
    await frames();
    monster.innerHTML = '<article>Bite</article>';
    monster.classList.add('vtt-character-ability-preview--open');
    await frames();
    assert.match(dom.window.document.querySelector('.te-lifted-card')?.textContent || '', /Bite/);
  } finally {
    dom.window.close();
  }

  const alone = new JSDOM('<body><aside class="vtt-character-ability-preview vtt-character-ability-preview--open">Card</aside></body>', { url: 'http://localhost/dnd/vtt/?table=1', runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    alone.window.setInterval = () => 0;
    alone.window.eval(embedJs);
    await frames();
    assert.equal(alone.window.document.querySelectorAll('.te-lifted-card').length, 0);
    assert.equal(alone.window.document.documentElement.classList.contains('te-card-lifted'), false, 'its own card stays shown');
  } finally {
    alone.window.close();
  }
  assert.match(embedCss, /html\.vtt-embed\.te-card-lifted \.vtt-character-ability-preview \{ visibility: hidden !important; \}/);
});
