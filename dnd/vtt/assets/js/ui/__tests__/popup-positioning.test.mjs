import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateTokenSettingsPopupLayout,
  escapeHtmlAttribute,
} from '../board-interactions.js';

test('token settings automation aura attributes are safely escaped', () => {
  assert.equal(
    escapeHtmlAttribute(`aura"&'<id>`),
    'aura&quot;&amp;&#039;&lt;id&gt;'
  );
});

test('token settings popup stays entirely above the visible action bar', () => {
  const layout = calculateTokenSettingsPopupLayout({
    clientX: 300,
    clientY: 470,
    width: 260,
    height: 420,
    viewportWidth: 707,
    viewportHeight: 662,
    actionBarTop: 607,
  });

  assert.equal(layout.safeBottom, 595);
  assert.equal(layout.top, 175);
  assert.equal(layout.top + 420, 595);
});

test('token settings popup uses the normal viewport bottom when no action bar is visible', () => {
  const layout = calculateTokenSettingsPopupLayout({
    clientX: 300,
    clientY: 470,
    width: 260,
    height: 420,
    viewportWidth: 707,
    viewportHeight: 662,
  });

  assert.equal(layout.safeBottom, 650);
  assert.equal(layout.top, 230);
  assert.equal(layout.top + 420, 650);
});

test('oversized token settings popup becomes scrollable within the safe region', () => {
  const layout = calculateTokenSettingsPopupLayout({
    clientX: 300,
    clientY: 500,
    width: 260,
    height: 900,
    viewportWidth: 707,
    viewportHeight: 662,
    actionBarTop: 607,
  });

  assert.equal(layout.top, 12);
  assert.equal(layout.maxHeight, 583);
  assert.equal(layout.top + layout.maxHeight, 595);
});

test('token settings popup remains horizontally clamped at both viewport edges', () => {
  assert.equal(calculateTokenSettingsPopupLayout({
    clientX: -200,
    clientY: 100,
    width: 260,
    height: 200,
    viewportWidth: 707,
    viewportHeight: 662,
  }).left, 12);

  assert.equal(calculateTokenSettingsPopupLayout({
    clientX: 700,
    clientY: 100,
    width: 260,
    height: 200,
    viewportWidth: 707,
    viewportHeight: 662,
  }).left, 435);
});
