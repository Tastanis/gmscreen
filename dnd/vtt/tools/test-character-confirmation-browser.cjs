const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  assert.equal((await fetch(origin + '/diagnostic-manifest.json').then(r => r.json())).test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/test-login.php?user=cal');
    await page.locator('#vtt-token-layer [data-placement-id="floor-cal"]').click();
    const panel = page.locator('#vtt-character-summary-panel');
    await panel.locator('[data-character-recovery]').waitFor();
    const endpoint = origin + '/dnd/character_sheet/handler.php';
    async function savedSheet() {
      const response = await page.request.get(endpoint + '?action=summary&character=cal&source=vtt');
      return (await response.json()).data;
    }
    async function setVitals(currentStamina, currentRecoveries) {
      const response = await page.request.post(endpoint, { form: { action: 'sync-vitals', character: 'cal', source: 'vtt', currentStamina: String(currentStamina), currentRecoveries: String(currentRecoveries) } });
      assert.equal((await response.json()).success, true);
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('vtt:character-sheet-updated', { detail: { characterId: 'cal' } })));
      await page.waitForFunction(value => document.querySelector('.vtt-character-healthbar__text')?.textContent.trim().startsWith(value + ' /'), currentStamina);
    }
    const original = (await savedSheet()).hero.vitals;
    await setVitals(20, 4);
    await panel.locator('[data-character-recovery]').click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    await setVitals(10, 3);
    await dialog.getByRole('button', { name: 'Spend', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-character-save-status]')?.textContent === 'Character resources saved.');
    const current = (await savedSheet()).hero.vitals;
    assert.equal(Number(current.currentRecoveries), 2, 'Recovery spends from the refreshed count.');
    assert.equal(Number(current.currentStamina), Math.min(Number(current.staminaMax), 10 + Number(current.recoveryValue)), 'Recovery heals the refreshed sheet, not a detached old object.');
    await setVitals(original.currentStamina, original.currentRecoveries);
    assert.deepEqual(errors, []);
    console.log('PASS: recovery confirmation survives a concurrent sheet refresh and updates current saved values.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
