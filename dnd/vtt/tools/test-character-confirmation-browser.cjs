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
    const maximum = Number(current.staminaMax);
    await setVitals(maximum, 3);
    const temporary = panel.locator('[data-character-temporary-stamina]');
    assert.equal(await temporary.textContent(), '0');
    async function adjustStamina(action, amount, overflow = false) {
      await panel.locator(`[data-character-stamina-action="${action}"]`).click();
      await page.getByPlaceholder('Amount', { exact: true }).fill(String(amount));
      await page.getByPlaceholder('Amount', { exact: true }).press('Enter');
      if (overflow) await page.getByRole('alertdialog').getByRole('button', { name: overflow === 'cap' ? 'Heal to max' : 'Use as temp', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-character-save-status]')?.textContent === 'Character resources saved.');
    }
    await adjustStamina('heal', 12, true);
    assert.equal(await temporary.textContent(), '12', 'Accepted overflow appears as temporary stamina.');
    await page.reload();
    await page.locator('#vtt-token-layer [data-placement-id="floor-cal"]').click();
    await temporary.waitFor();
    assert.equal(await temporary.textContent(), '12', 'Temporary stamina display survives reload.');
    await adjustStamina('heal', 4, 'cap');
    assert.equal(await temporary.textContent(), '12', 'Capped healing preserves existing temporary stamina.');
    await panel.locator('[data-character-recovery]').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Spend', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-character-save-status]')?.textContent === 'Character resources saved.');
    assert.equal(await temporary.textContent(), '12', 'Recovery preserves existing temporary stamina.');
    await adjustStamina('damage', 5);
    assert.equal(await temporary.textContent(), '7', 'Damage consumes overflow first.');
    await adjustStamina('damage', 10);
    assert.equal(await temporary.textContent(), '0', 'Temporary stamina does not become negative.');
    assert.equal(Number((await savedSheet()).hero.vitals.currentStamina), maximum - 3);
    await setVitals(original.currentStamina, original.currentRecoveries);
    assert.deepEqual(errors, []);
    console.log('PASS: current-sheet recovery confirmation plus temporary stamina healing, reload, and damage display.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
