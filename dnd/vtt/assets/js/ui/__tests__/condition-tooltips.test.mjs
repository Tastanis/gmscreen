import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createConditionTooltips } from '../condition-tooltips.js';

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
  return { documentRef: dom.window.document, windowRef: dom.window };
}

test('createConditionTooltips returns attach and detach', () => {
  const { documentRef, windowRef } = setupDom();
  const api = createConditionTooltips({
    getConditionDefinition: () => null,
    documentRef,
    windowRef,
  });
  assert.equal(typeof api.attach, 'function');
  assert.equal(typeof api.detach, 'function');
});

test('attach lazily creates the shared tooltip element on first use', () => {
  const { documentRef, windowRef } = setupDom();
  const definitions = new Map([
    ['bleeding', { name: 'Bleeding', description: 'You are bleeding.' }],
  ]);
  const { attach } = createConditionTooltips({
    getConditionDefinition: (name) => definitions.get(String(name).toLowerCase()) ?? null,
    documentRef,
    windowRef,
  });

  const target = documentRef.createElement('span');
  documentRef.body.appendChild(target);

  // Before attach there is no tooltip element.
  assert.equal(documentRef.getElementById('vtt-condition-tooltip'), null);

  attach(target, 'Bleeding', { delay: 0 });

  // Trigger the hover handler synchronously then fire the queued timeout.
  target.dispatchEvent(new windowRef.Event('pointerenter'));

  // The tooltip element is created lazily on show, which happens after the delay.
  // With delay=0 the setTimeout is still async; run pending timers manually.
  return new Promise((resolve) => {
    windowRef.setTimeout(() => {
      const tooltip = documentRef.getElementById('vtt-condition-tooltip');
      assert.ok(tooltip, 'tooltip element should exist after hover');
      assert.equal(tooltip.classList.contains('vtt-condition-tooltip'), true);
      assert.equal(tooltip.getAttribute('role'), 'tooltip');
      // At least one rendered item is present.
      const items = tooltip.querySelectorAll('.vtt-condition-tooltip__item');
      assert.ok(items.length >= 1, 'tooltip should render at least one condition entry');
      resolve();
    }, 10);
  });
});

test('attach with empty or unknown entries does not register listeners', () => {
  const { documentRef, windowRef } = setupDom();
  const { attach } = createConditionTooltips({
    getConditionDefinition: () => null,
    documentRef,
    windowRef,
  });

  const target = documentRef.createElement('span');
  documentRef.body.appendChild(target);

  attach(target, [], { delay: 0 });
  target.dispatchEvent(new windowRef.Event('pointerenter'));
  // No tooltip should be shown since there are no entries.
  assert.equal(documentRef.getElementById('vtt-condition-tooltip'), null);
});

test('detach removes listeners and hides the tooltip', async () => {
  const { documentRef, windowRef } = setupDom();
  const definitions = new Map([
    ['dazed', { name: 'Dazed', description: 'You are dazed.' }],
  ]);
  const { attach, detach } = createConditionTooltips({
    getConditionDefinition: (name) => definitions.get(String(name).toLowerCase()) ?? null,
    documentRef,
    windowRef,
  });

  const target = documentRef.createElement('span');
  documentRef.body.appendChild(target);

  attach(target, 'Dazed', { delay: 0 });
  target.dispatchEvent(new windowRef.Event('pointerenter'));
  await new Promise((resolve) => windowRef.setTimeout(resolve, 10));

  const tooltip = documentRef.getElementById('vtt-condition-tooltip');
  assert.ok(tooltip, 'tooltip should exist after hover');
  assert.equal(tooltip.hidden, false);

  detach(target);

  assert.equal(tooltip.hidden, true, 'tooltip should be hidden after detach');

  // Second pointerenter after detach should not re-show.
  target.dispatchEvent(new windowRef.Event('pointerenter'));
  await new Promise((resolve) => windowRef.setTimeout(resolve, 10));
  assert.equal(tooltip.hidden, true, 'tooltip should remain hidden after detach');
});
