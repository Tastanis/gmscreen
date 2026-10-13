// A look at one page for whoever is chasing a page-start failure:
//   node dnd/vtt/tools/page-start-probe.cjs <origin> <user> <path>
// against a server started as pages-start.test.mjs starts it. Prints what the page logged and where it got to.
const { chromium } = require('playwright');
const [, , origin, user, pagePath] = process.argv;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) console.log(message.type().toUpperCase(), message.text().slice(0, 300)); });
  page.on('response', (response) => { if (response.status() >= 400) console.log(response.status(), response.url().slice(origin.length)); });
  await page.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
  await page.goto(`${origin}${pagePath}?__start_as=${user}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(6000);
  console.log('AT', page.url());
  console.log('STATE', JSON.stringify(await page.evaluate(() => ({ ...document.documentElement.dataset, title: document.title, body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200) }))));
  await browser.close();
})().catch((error) => { console.error(error.message); process.exit(1); });
