'use strict';

// Playwright's waitForFunction treats an async predicate's Promise as truthy.
// Evaluate and await each read before deciding whether the condition passed.
async function waitForBrowserState(page, predicate, arg, { timeout = 30000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    let timer;
    let passed;
    try {
      passed = await Promise.race([
        page.evaluate(predicate, arg),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Browser state check timed out')), remaining);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (passed) return;
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, Math.max(0, deadline - Date.now()))));
  }
  throw new Error('Browser state condition did not become true before timeout');
}

module.exports = { waitForBrowserState };
