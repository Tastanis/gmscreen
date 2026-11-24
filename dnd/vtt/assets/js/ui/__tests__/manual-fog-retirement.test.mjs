import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountVisionPanel } from '../vision-panel.js';

test('the GM can open and close automatic vision settings', () => {
  const dom = new JSDOM('<main id="vtt-app"><button data-settings-launch="fog"></button></main>');
  globalThis.document = dom.window.document;
  try {
    mountVisionPanel();
    const launcher = document.querySelector('[data-settings-launch]');
    launcher.click();
    assert.equal(document.querySelector('#vtt-fog-panel').hidden, false);
    assert.equal(launcher.getAttribute('aria-pressed'), 'true');
    document.querySelector('[data-fog-close]').click();
    assert.equal(document.querySelector('#vtt-fog-panel').hidden, true);
    assert.equal(launcher.getAttribute('aria-pressed'), 'false');
  } finally { delete globalThis.document; dom.window.close(); }
});
