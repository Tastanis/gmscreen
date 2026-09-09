const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';

(async () => {
  assert.equal((await fetch(origin + '/diagnostic-manifest.json').then(r => r.json())).test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/test-login.php?user=GM');
    await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent === 'Connected');
    await page.evaluate(async () => {
      const { getPowerRollSuggestions } = await import('/dnd/vtt/assets/js/ui/power-roll-suggestions.js');
      const actor = { id: 'suggestion-actor', name: 'Archer', column: 2, row: 2, width: 1, height: 1, levelId: 'upper', team: 'ally' };
      const target = { id: 'suggestion-target', name: 'Enemy', column: 3, row: 2, width: 1, height: 1, levelId: 'level-0', team: 'enemy' };
      window.suggestionFixture = { actor, target, reads: 0, chat: [] };
      const action = { id: 'suggestion-check', name: 'Suggestion browser check', keywords: ['Ranged', 'Strike'], range: 'Ranged 10' };
      window.suggestionRun = window.AbilityAutomationRunner.open({
        action, hero: { name: 'Archer', surges: 0 }, sourcePlacement: actor,
        automation: { schema: 'ability-automation/v3', cards: [{ type: 'powerRoll', id: 'roll', target: 'self', attribute: 'Agility', tiers: { tier1: { effects: [] }, tier2: { effects: [] }, tier3: { effects: [] } } }] },
        getAttributeBonus: () => 0,
        postChat: entry => window.suggestionFixture.chat.push(entry),
        getPowerRollSuggestions: payload => {
          window.suggestionFixture.reads++;
          return getPowerRollSuggestions({ actor, targets: [target], placements: [actor, target],
            mapLevels: { levels: [{ id: 'upper', elevationSquares: 5 }] }, context: payload,
            getTeam: token => token.team });
        }
      });
    });
    const edge = page.locator('[data-power-roll-suggestion-toggle="edge-high-ground"]');
    await edge.waitFor();
    assert.equal(await edge.getAttribute('aria-pressed'), 'true');
    await edge.click();
    assert.equal(await edge.getAttribute('aria-pressed'), 'false');
    const reads = await page.evaluate(() => suggestionFixture.reads);
    await page.waitForFunction(n => suggestionFixture.reads > n, reads);
    assert.equal(await edge.getAttribute('aria-pressed'), 'false', 'refresh preserves unchecked edge');
    await page.evaluate(() => { suggestionFixture.actor.levelId = 'level-0'; });
    const bane = page.locator('[data-power-roll-suggestion-toggle="bane-enemy-adjacent"]');
    await bane.waitFor();
    assert.equal(await bane.getAttribute('aria-pressed'), 'true');
    await page.locator('[data-power-roll-roll]').click();
    const afterRoll = await page.evaluate(() => suggestionFixture.reads);
    await page.evaluate(() => { suggestionFixture.target.column = 8; });
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => suggestionFixture.reads), afterRoll, 'automatic refresh freezes rolled modifiers');
    assert.equal(await bane.getAttribute('aria-pressed'), 'true');
    await page.locator('[data-power-roll-roll]').click();
    await bane.waitFor({ state: 'detached' });
    await page.locator('[data-power-roll-accept]').click();
    await page.evaluate(() => window.suggestionRun);
    const closedReads = await page.evaluate(() => suggestionFixture.reads);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => suggestionFixture.reads), closedReads);
    assert.deepEqual(errors, []);
    console.log('PASS real ability window: initial high ground, manual override, nearby enemy update, frozen roll, reroll refresh, close cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
