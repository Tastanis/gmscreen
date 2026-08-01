import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseUrl = process.env.TASKS_TEST_URL || 'http://127.0.0.1:18901/tasks/';
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ headless: true, executablePath: edge });
try {
  const anonymous = await browser.newContext();
  const anonymousResponse = await anonymous.request.get(`${baseUrl}api/data.php`);
  assert.equal(anonymousResponse.status(), 401);
  await anonymous.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pageA = await context.newPage();
  await pageA.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await pageA.locator('h1').textContent(), 'My Tasks');
  await pageA.fill('input[name="password"]', 'TestOnlyPassword!');
  await pageA.click('button[type="submit"]');
  await pageA.waitForSelector('#add-task-form');
  const csrfDenied = await context.request.put(`${baseUrl}api/data.php`, {
    data: { baseRevision: 0, data: { schemaVersion: 1, activeListId: 'inbox', lists: [{ id: 'inbox', name: 'Tasks' }], tasks: [] } }
  });
  assert.equal(csrfDenied.status(), 403);

  const pageB = await context.newPage();
  await pageB.addInitScript(() => {
    const original = window.addEventListener.bind(window);
    window.addEventListener = (type, listener, options) => {
      if (type === 'focus') return;
      return original(type, listener, options);
    };
  });
  await pageB.goto(baseUrl, { waitUntil: 'networkidle' });
  await pageA.fill('#new-task-input', 'Saved on phone');
  const phoneSave = pageA.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/data.php'));
  await pageA.click('#add-task-form button[type="submit"]');
  assert.equal((await phoneSave).status(), 200);
  await pageB.fill('#new-task-input', 'Conflicting desktop edit');
  const conflictingSave = pageB.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/data.php'));
  await pageB.click('#add-task-form button[type="submit"]');
  assert.equal((await conflictingSave).status(), 409);
  await pageB.waitForSelector('#conflict-dialog[open]');
  await pageB.click('#conflict-reload');
  assert.equal(await pageB.locator('.task-text strong').textContent(), 'Saved on phone');
  await pageB.fill('#new-task-input', 'Saved on desktop');
  const desktopSave = pageB.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/data.php'));
  await pageB.click('#add-task-form button[type="submit"]');
  assert.equal((await desktopSave).status(), 200);

  await pageA.bringToFront();
  await pageA.evaluate(() => window.dispatchEvent(new Event('focus')));
  await pageA.waitForFunction(() => [...document.querySelectorAll('.task-text strong')].some((node) => node.textContent === 'Saved on desktop'));

  await pageA.evaluate(() => localStorage.setItem('my-tasks-data-v1', JSON.stringify({
    schemaVersion: 1, activeListId: 'inbox', lists: [{ id: 'inbox', name: 'Tasks', createdAt: new Date().toISOString() }],
    tasks: [{ id: 'legacy-test', listId: 'inbox', title: 'Legacy local task', notes: '', completed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null }]
  })));
  await pageA.reload({ waitUntil: 'networkidle' });
  await pageA.waitForSelector('#legacy-import:not([hidden])');
  await pageA.click('#legacy-import-button');
  await pageA.waitForFunction(() => localStorage.getItem('my-tasks-data-v1') === null);
  assert.equal(await pageA.locator('.task-text strong', { hasText: 'Legacy local task' }).count(), 1);

  const cacheKeys = await pageA.evaluate(() => caches.keys());
  assert.equal(cacheKeys.includes('my-tasks-v3'), true);
  const cachedApi = await pageA.evaluate(async () => Boolean(await caches.match('./api/data.php')));
  assert.equal(cachedApi, false);
  await pageA.screenshot({ path: 'tmp/my-tasks-shared-mobile.png', fullPage: true });
  console.log('TASK BROWSER SYNC TEST PASSED');
} finally {
  await browser.close();
}
