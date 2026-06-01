import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const fixturePath = '/dnd/character_sheet/ability-automation/__tests__/fixtures/automation-smoke.html';

const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch (_err) {
    return false;
  }
}

async function resolveBrowserExecutable() {
  for (const candidate of chromeCandidates) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error(
    'No local Chrome/Edge executable found for Playwright smoke tests. Set PLAYWRIGHT_CHROME_PATH or install Playwright browsers.'
  );
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const absolutePath = path.resolve(repoRoot, requestedPath || fixturePath.slice(1));
      if (!absolutePath.startsWith(repoRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const body = await readFile(absolutePath);
      res.writeHead(200, { 'content-type': contentType(absolutePath) });
      res.end(body);
    } catch (err) {
      res.writeHead(404);
      res.end(String(err?.message || 'Not found'));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function withSmokePage(fn) {
  const executablePath = await resolveBrowserExecutable();
  const staticServer = await startStaticServer();
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`${staticServer.baseUrl}${fixturePath}`);
    await page.waitForFunction(() => Boolean(window.AbilityAutomationRunner && window.__automationSmoke));
    await fn(page);
  } finally {
    await browser.close();
    await staticServer.close();
  }
}

const targetAndDamageAutomation = {
  schema: 'ability-automation/v3',
  cards: [
    {
      type: 'target',
      name: 'primary',
      mode: 'token',
      predicate: 'enemy',
      count: { value: 1, mode: 'exact' },
      promptTitle: 'Smoke Pick Enemy',
      promptText: 'Pick one enemy for the smoke test.',
      distance: { form: 'ranged', value: 5 },
    },
    {
      type: 'powerRoll',
      attribute: 'Might',
      target: 'primary',
      tiers: {
        tier1: { effects: [{ kind: 'damage', amount: 3, attribute: 'M', damageType: 'fire' }] },
        tier2: { effects: [{ kind: 'damage', amount: 6, attribute: 'M', damageType: 'fire' }] },
        tier3: { effects: [{ kind: 'damage', amount: 9, attribute: 'M', damageType: 'fire' }] },
      },
    },
  ],
};

const halfDamageTriggerAutomation = {
  schema: 'ability-automation/v3',
  cards: [
    {
      type: 'trigger',
      id: 'trigger-half-damage',
      condition: 'You take damage.',
      match: { event: 'damage', filter: { whose: 'self' } },
      effects: [
        { kind: 'halveTriggeringDamage', rounding: 'up' },
      ],
    },
  ],
};

test('browser smoke: target picker, token selection, power roll modal, and damage completion render end-to-end', async () => {
  await withSmokePage(async (page) => {
    await page.evaluate((automation) => {
      window.__automationRunPromise = window.__automationSmoke.run(automation, {
        action: { id: 'smoke-strike', name: 'Smoke Strike', actionLabel: 'Main Action' },
        randomValues: [0.5, 0.5],
      });
    }, targetAndDamageAutomation);

    await page.locator('.vtt-automation-picker-prompt').waitFor();
    await assert.rejects(
      page.locator('[data-power-roll-roll]').waitFor({ timeout: 250 }),
      /Timeout/
    );
    await page.locator('[data-smoke-token="enemy-1"]').click();

    await page.locator('#ability-automation-runner [data-power-roll-roll]').waitFor();
    await page.locator('#ability-automation-runner [data-power-roll-roll]').click();
    await page.locator('#ability-automation-runner [data-power-roll-accept]').waitFor();
    await page.locator('#ability-automation-runner [data-power-roll-accept]').click();
    await page.evaluate(() => window.__automationRunPromise);

    const damageCalls = await page.evaluate(() => (
      window.__automationSmoke.calls.filter((entry) => entry.name === 'applyDamage')
    ));
    assert.equal(damageCalls.length, 1);
    assert.equal(damageCalls[0].payload.placementId, 'enemy-1');
    assert.equal(damageCalls[0].payload.amount, 8);
    assert.equal(damageCalls[0].payload.damageType, 'fire');
  });
});

test('browser smoke: damage trigger marks caster token ready and clear removes the indicator', async () => {
  await withSmokePage(async (page) => {
    await page.evaluate((automation) => (
      window.__automationSmoke.run(automation, {
        action: { id: 'half-damage', name: 'Half Damage', actionLabel: 'Triggered Action' },
        actionType: 'triggered',
      })
    ), halfDamageTriggerAutomation);

    await page.evaluate(() => window.__automationSmoke.fire('damage', {
      placementId: 'enemy-1',
      sourceId: 'caster-1',
      amount: 9,
      damageType: 'fire',
    }));
    assert.equal(await page.locator('[data-smoke-token="caster-1"] [data-token-trigger-ready="true"]').count(), 0);

    await page.evaluate(() => window.__automationSmoke.fire('damage', {
      placementId: 'caster-1',
      sourceId: 'enemy-1',
      amount: 11,
      damageType: 'corruption',
    }));

    const readyIndicator = page.locator('[data-smoke-token="caster-1"] [data-token-trigger-ready="true"]');
    await readyIndicator.waitFor();
    assert.equal(await readyIndicator.textContent(), '!');

    const casterSnapshot = await page.evaluate(() => window.__automationSmoke.placement('caster-1'));
    assert.deepEqual(casterSnapshot.readyTriggerAbilities, ['half-damage']);
    assert.equal(casterSnapshot.readyTriggerSources['half-damage'], 'enemy-1');
    assert.equal(casterSnapshot.readyTriggerPayloads['half-damage'].eventType, 'damage');
    assert.equal(casterSnapshot.readyTriggerPayloads['half-damage'].payload.amount, 11);

    await page.evaluate(() => window.__automationSmoke.clearReady('caster-1', 'half-damage'));
    assert.equal(await readyIndicator.count(), 0);
  });
});

test('browser smoke: ready damage trigger payload resolves halveTriggeringDamage and clears ready UI', async () => {
  await withSmokePage(async (page) => {
    await page.evaluate((automation) => (
      window.__automationSmoke.run(automation, {
        action: { id: 'half-damage', name: 'Half Damage', actionLabel: 'Triggered Action' },
        actionType: 'triggered',
      })
    ), halfDamageTriggerAutomation);

    await page.evaluate(() => window.__automationSmoke.fire('damage', {
      placementId: 'caster-1',
      sourceId: 'enemy-1',
      amount: 11,
      damageType: 'corruption',
    }));

    const readyIndicator = page.locator('[data-smoke-token="caster-1"] [data-token-trigger-ready="true"]');
    await readyIndicator.waitFor();
    await page.evaluate((automation) => window.__automationSmoke.resolveReadyTrigger(automation), halfDamageTriggerAutomation);

    const healCalls = await page.evaluate(() => (
      window.__automationSmoke.calls.filter((entry) => entry.name === 'applyHeal')
    ));
    assert.equal(healCalls.length, 1);
    assert.deepEqual(healCalls[0].payload, {
      placementId: 'caster-1',
      amount: 5,
      allowTempHp: false,
      abilityName: 'Half Damage',
    });
    assert.equal(await readyIndicator.count(), 0);
  });
});

test('browser smoke: board picker renders Done for upTo targets and Skip for optional targets', async () => {
  await withSmokePage(async (page) => {
    const upToAutomation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          name: 'nearby',
          mode: 'token',
          predicate: 'enemy',
          count: { value: 2, mode: 'upTo' },
          promptTitle: 'Pick Up To Two',
          promptText: 'Pick up to two enemies, or finish early.',
          distance: { form: 'ranged', value: 5 },
        },
      ],
    };

    await page.evaluate((automation) => {
      window.__automationRunPromise = window.__automationSmoke.run(automation);
    }, upToAutomation);
    await page.locator('.vtt-automation-picker-prompt [data-automation-target-done]').waitFor();
    await page.locator('.vtt-automation-picker-prompt [data-automation-target-done]').click();
    await page.evaluate(() => window.__automationRunPromise);

    const optionalAutomation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          name: 'optionalEnemy',
          mode: 'token',
          predicate: 'enemy',
          optional: true,
          count: { value: 1, mode: 'exact' },
          promptTitle: 'Optional Enemy',
          promptText: 'Pick an optional enemy or skip.',
          distance: { form: 'ranged', value: 5 },
        },
      ],
    };

    await page.evaluate((automation) => {
      window.__automationRunPromise = window.__automationSmoke.run(automation);
    }, optionalAutomation);
    await page.locator('.vtt-automation-picker-prompt [data-automation-target-skip]').waitFor();
    await page.locator('.vtt-automation-picker-prompt [data-automation-target-skip]').click();
    await page.evaluate(() => window.__automationRunPromise);

    const selectCalls = await page.evaluate(() => (
      window.__automationSmoke.calls.filter((entry) => entry.name === 'selectTarget')
    ));
    assert.equal(selectCalls.length, 1);
    assert.equal(selectCalls[0].payload.optional, true);
  });
});
