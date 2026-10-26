import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every page is STARTED here, in a real browser with no window, and the test fails if one does not start.
//
// Twice in one night a page would not start and every other test passed, because none of them starts a page:
//  - Build 493: the Director's map page threw "Cannot access 'PARTY_VITALS_INTERVAL_MS' before initialization"
//    part-way through its start-up.
//  - Build 491: the character sheet page came up with its frame and tabs and every pane empty (its script waited
//    at its top level and missed the signal the sheet starts on). It logged nothing at all.
// So "started" is not "no error": each page says when it has finished starting (bootstrap.js sets vttStarted,
// sheet.js sets sheetStarted), and that is what is waited for. An uncaught error on the way fails the test too.
//
// How: the tracked files of dnd/ as they stand in the working folder (and any new code file not yet added) are
// copied to a temporary folder, PHP's own command-line server serves that copy, and Chrome is driven through
// Playwright. Nothing is written in the working folder and nothing outside this machine is asked for. Each page
// gets a server of its own: PHP's server answers one request at a time, and a page left waiting on another
// page's slow request would look like a page that did not start.
//
// Without PHP, Playwright or Chrome it FAILS, saying what is missing: a check that quietly skips itself is how
// this got through. SKIP_PAGE_START_CHECK=1 turns it off for a machine that has none of them.
// It is a heavy check (a browser and a server, about half a minute): on a machine shared with other runs, say
// so before starting the suite.
// When it fails: dnd/vtt/tools/page-start-probe.cjs prints what one page logged and how far it got.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

function findPhp() {
  if (process.env.PHP_BIN && existsSync(process.env.PHP_BIN)) return process.env.PHP_BIN;
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['php'], { encoding: 'utf8' });
  const first = onPath.status === 0 ? onPath.stdout.split(/\r?\n/).find(Boolean) : '';
  if (first && existsSync(first.trim())) return first.trim();
  const packages = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (existsSync(packages)) {
    for (const folder of readdirSync(packages).filter((name) => /^PHP\.PHP\./i.test(name)).sort().reverse()) {
      const candidate = path.join(packages, folder, 'php.exe');
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** The code of dnd/ as it stands in the working folder, in a folder of its own: tracked files, and new code files. */
function copyOfTheSite() {
  const list = (args) => spawnSync('git', ['-C', repo, 'ls-files', '-z', ...args, 'dnd'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.split('\0').filter(Boolean);
  const files = [...list([]), ...list(['--others', '--exclude-standard']).filter((file) => /\.(?:php|m?js|cjs|css|html)$/i.test(file))];
  assert.ok(files.length > 100, 'the list of the site\'s files could not be read from git');
  const copy = mkdtempSync(path.join(tmpdir(), 'vtt-pages-start-'));
  for (const file of files) {
    const from = path.join(repo, file);
    if (!existsSync(from)) continue;                                  // deleted in the working folder
    mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
    cpSync(from, path.join(copy, file));
  }
  return copy;
}

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function answers(origin, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try { await fetch(origin + '/dnd/data/version.json'); return true; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  return false;
}

const SCRIPT_DELAY_MS = 250;

// Each page: who opens it, where, and how it shows that it has started.
const PAGES = [
  { name: 'the map, as the Director', as: 'GM', path: '/dnd/vtt/', started: () => document.documentElement.dataset.vttStarted === '1' },
  { name: 'the map, as a player', as: 'cal', path: '/dnd/vtt/', started: () => document.documentElement.dataset.vttStarted === '1' },
  // Changed on purpose (October 2026): the sheet was rebuilt (app.js draws it from parts/); its status bar is drawn
  // once it has started. The classic sheet (classic.php) was retired when the new one was approved.
  { name: 'the character sheet, as its player', as: 'cal', path: '/dnd/character_sheet/index.php',
    started: () => document.documentElement.dataset.sheetStarted === '1' && Boolean(document.querySelector('[data-sp-status]')) },
  { name: 'the main page, as the Director', as: 'GM', path: '/dnd/dashboard.php', started: () => document.readyState === 'complete' && document.body.children.length > 0 },
  { name: 'the main page, as a player', as: 'cal', path: '/dnd/dashboard.php', started: () => document.readyState === 'complete' && document.body.children.length > 0 },
];

test('every page starts: the map as Director and as a player, the character sheet, the main page', { timeout: 240000, skip: process.env.SKIP_PAGE_START_CHECK === '1' ? 'SKIP_PAGE_START_CHECK=1' : false }, async () => {
  const php = findPhp();
  assert.ok(php, 'PHP was not found (set PHP_BIN): the pages cannot be started, so this check cannot pass');
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (error) { assert.fail('Playwright is not installed (npm install): the pages cannot be started. ' + error.message); }
  const ext = path.join(path.dirname(php), 'ext');
  const extensions = existsSync(path.join(ext, 'php_pdo_sqlite.dll'))
    ? ['-d', `extension_dir=${ext}`, ...['pdo_sqlite', 'sqlite3', 'mbstring', 'gd', 'fileinfo'].flatMap((name) => ['-d', `extension=${name}`])] : [];

  const site = copyOfTheSite();
  const router = path.join(site, 'dnd', 'vtt', 'tools', 'page-start-router.php');
  let browser;
  const failures = [];
  try {
    try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
    catch (error) { assert.fail('Chrome could not be started through Playwright: ' + error.message.split('\n')[0]); }
    for (const one of PAGES) {
      const port = await freePort(), origin = `http://127.0.0.1:${port}`;
      const server = spawn(php, [...extensions, '-S', `127.0.0.1:${port}`, '-t', site, router], { env: { ...process.env, PAGE_START_CHECK: '1' }, stdio: 'ignore' });
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      try {
        assert.ok(await answers(origin), 'PHP\'s own server did not come up');
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        // A script or stylesheet of ours that will not load is a start-up fault too.
        page.on('response', (response) => { const url = response.url(); if (url.startsWith(origin) && response.status() >= 400 && /\.(?:m?js|css)(?:\?|$)/.test(url)) errors.push(`${response.status()} ${url.slice(origin.length)}`); });
        // Nothing outside this machine is asked for. And every script of ours arrives a little late, as it does
        // over a real connection: the blank sheet page of Build 491 was a race (a file fetched after the rest
        // against the browser's "page is ready"), and on a fast local server the page won it and looked fine.
        await page.route('**/*', async (route) => {
          if (new URL(route.request().url()).origin !== origin) return route.abort();
          if (route.request().resourceType() === 'script') await new Promise((r) => setTimeout(r, SCRIPT_DELAY_MS));
          return route.continue();
        });
        await page.goto(`${origin}${one.path}?__start_as=${one.as}`, { waitUntil: 'load', timeout: 30000 });
        assert.ok(new URL(page.url()).pathname.startsWith(one.path.replace(/index\.php$/, '')), `was sent away to ${new URL(page.url()).pathname} (not signed in?)`);
        await page.waitForFunction(one.started, null, { timeout: 20000 });
        await page.waitForTimeout(1500);                               // anything thrown just after start-up
        if (errors.length) failures.push(`${one.name}: ${errors.slice(0, 3).join(' | ')}`);
      } catch (error) {
        failures.push(`${one.name}: DID NOT START. ${error.message.split('\n')[0]}${errors.length ? ' Errors: ' + errors.slice(0, 3).join(' | ') : ' No error was logged.'}`);
      } finally {
        await context.close().catch(() => {});
        server.kill();                                                 // this server, by its own handle; never by name
      }
    }
    assert.deepEqual(failures, [], 'pages that did not start cleanly');
  } finally {
    await browser?.close().catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    try { rmSync(site, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a temporary folder; the system clears it */ }
  }
});
