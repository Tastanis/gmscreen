const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.VTT_TEST_ORIGIN || 'http://127.0.0.1:18795';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback required');

(async () => {
  assert.equal((await (await fetch(origin + '/diagnostic-manifest.json')).json()).test_fixture, 'combat-wall-audit');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/test-login.php?user=GM');
    await page.waitForFunction(() => window.terrainContext?.().view.mapLoaded);
    await page.evaluate(async () => {
      const { normalizeMonsterSnapshot } = await import('/dnd/vtt/assets/js/state/normalize/monsters.js');
      window.tierDisplayMonster = normalizeMonsterSnapshot({
        id: 'tier-display-test', name: 'Display test siren',
        abilities: { action: [{ name: 'Undertow Song', has_test: true, test: {
          tier1: { damage_amount: '7', damage_type: 'psychic', tier_effect: 'pull 2',
            has_attribute_check: true, attribute: 'intuition', attribute_threshold: 1,
            attribute_effect: 'Enthralled (save ends)' },
          tier2: { tier_effect: 'the target gains 2 rage' },
          tier3: { tier_effect: '<img src=x onerror="window.tierInjection=true">' },
        } }] },
      });
      window.dashboardChat = { sendMessage: message => { window.tierChat = message; return true; } };
      window.MonsterAbilityTray.openFor({ id: 'tier-display-placement', name: 'Display test siren', team: 'enemy' }, window.tierDisplayMonster);
    });
    await page.locator('[data-monster-tab="action"]').click();
    const ability = page.locator('[data-monster-ability-item]').filter({ hasText: 'Undertow Song' });
    await ability.hover();
    const preview = page.locator('#vtt-monster-ability-preview');
    await preview.waitFor({ state: 'visible' });
    const text = await preview.innerText();
    assert.match(text, /7 psychic damage; pull 2; I<1 Enthralled/);
    assert.match(text, /the target gains 2 rage/);
    assert.match(text, /<img src=x/);
    assert.equal(await preview.locator('img').count(), 0, 'tier prose is escaped');
    assert.equal(await page.evaluate(() => window.tierInjection), undefined);
    await ability.locator('[data-monster-chat-post]').click();
    assert.match((await page.evaluate(() => window.tierChat)).message, /7 psychic damage \| pull 2 \| I<1 Enthralled/);
    await page.evaluate(async () => {
      const statBlock = await import('/dnd/vtt/assets/js/ui/monster-stat-block.js');
      statBlock.open(window.tierDisplayMonster);
    });
    const details = await page.locator('.vtt-monster-stat-block__test-details').allTextContents();
    assert.match(details.join('\n'), /pull 2/);
    assert.match(details.join('\n'), /the target gains 2 rage/);
    assert.match(details.join('\n'), /<img src=x/);
    assert.deepEqual(errors, []);
    console.log('PASS real tray hover, flat/rider-only tiers, chat, stat block and escaped text; no canonical state or chat writes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
