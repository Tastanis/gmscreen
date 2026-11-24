import {
  abilitiesHtml, esc, featuresHtml, recordHtml, statusHtml, tabsHtml, toggleMore, traitsHtml, words,
} from '../parts/sheet-parts.js';
import { mergeWithDefaults } from '../parts/sheet-model.js';

const root = document.querySelector('#saved-sheet');
const tabs = [['traits', 'Skills & traits'], ['abilities', 'Abilities'], ['features', 'Features'], ['background', 'Background']];

// Mount only passive sheet content. This page has its own navigation and never mounts the live sheet controller.
function passive(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelector('.sp-record')?.closest('.sp-card')?.remove();
  template.content.querySelectorAll('.sp-counters, .sp-vbtns, button:not([data-sheet-more], [data-sheet-ab-tab], [data-sheet-tab])')
    .forEach((node) => node.remove());
  return template.content;
}

try {
  const sheet = mergeWithDefaults(JSON.parse(document.querySelector('#snapshot').textContent));
  let section = 'traits';
  let abTab = 'all';
  root.innerHTML = '<div class="sheet-identity"></div><div class="sheet-tabs"></div><div class="sp-pane"></div>';
  root.querySelector('.sheet-identity').append(passive(statusHtml(sheet, { conditions: sheet.hero.conditions })));
  const resource = sheet.sidebar.resource;
  function draw() {
    root.querySelector('.sheet-tabs').replaceChildren(passive(tabsHtml(tabs, section)));
    const panes = {
      traits: () => traitsHtml(sheet) + (resource?.text ? '<section class="resource-rule"><h3>' + esc(resource.title) + '</h3><p>' + esc(words(resource.text)) + '</p></section>' : ''),
      abilities: () => abilitiesHtml(sheet, { abTab }),
      features: () => featuresHtml(sheet),
      background: () => recordHtml(sheet, null),
    };
    root.querySelector('.sp-pane').replaceChildren(passive(panes[section]()));
  }
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-sheet-more')) { toggleMore(button); return; }
    if (button.dataset.sheetTab) section = button.dataset.sheetTab;
    else if (button.dataset.sheetAbTab) abTab = button.dataset.sheetAbTab;
    else return;
    draw();
    const selector = button.dataset.sheetTab ? '[data-sheet-tab][aria-selected="true"]' : '[data-sheet-ab-tab][aria-selected="true"]';
    root.querySelector(selector)?.focus({ preventScroll: true });
  });
  draw();
} catch {
  root.textContent = 'This saved sheet could not be displayed.';
}
