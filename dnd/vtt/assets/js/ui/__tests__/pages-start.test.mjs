import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, readFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
  const files = [...list([]), ...list(['--others', '--exclude-standard']).filter((file) => /\.(?:php|m?js|cjs|css|html)$/i.test(file) || file==='dnd/character_sheet/builder/rules.json')];
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

// Open through the same S menu as a player or Director. Only the Table's own map may contact a sheet.
async function openBuilder(page) {
  await page.getByRole('button',{name:'Table menu'}).click();
  await page.getByText('Character builder',{exact:true}).click();
  const frame=page.frameLocator('iframe[src*="character_sheet/builder/"]');
  await frame.locator('[name="hero-name"]').waitFor();
}

async function finishTableHeroes(page, ...classes) {
  await openBuilder(page);
  const frame = page.frames().find(f => f.url().includes('/character_sheet/builder/'));
  assert.ok(frame);
  for (const [index, classId] of classes.entries()) {
    if (index) {
      page.once('dialog', dialog => dialog.accept());
      await frame.getByRole('button',{name:'Start another hero'}).click();
    }
    await finishIndependentHero(page, frame, classId);
  }
  return frame;
}
async function finishPlayerBuilds(page) {
  const frame = await finishTableHeroes(page, 'null', 'conduit');
  await frame.locator('nav [data-step="Identity"]').click();
  await finishIndependentHero(page, frame, 'shadow');
  await frame.locator('nav [data-step="Identity"]').click();
  await finishIndependentHero(page, frame, 'talent');
}
async function finishDirectorBuilds(page) {
  const frame = await finishTableHeroes(page, 'censor');
  await frame.locator('nav [data-step="Identity"]').click();
  await finishIndependentHero(page, frame, 'fury');
  await frame.locator('nav [data-step="Identity"]').click();
  await finishIndependentHero(page, frame, 'tactician');
  await frame.locator('nav [data-step="Identity"]').click();
  await finishIndependentHero(page, frame, 'troubadour');
}

async function finishIndependentHero(page, builder = page.mainFrame(), classId = 'elementalist') {
  const isNull = classId === 'null';
  const isCensor = classId === 'censor';
  const specialization = { censor: 'Paragon', conduit: 'Life and Protection', fury: 'Stormwight', null: 'Cryokinetic', elementalist: 'Fire', shadow: 'College of Caustic Alchemy', tactician: 'Vanguard', talent: 'Telepathy', troubadour: 'Virtuoso' }[classId];
  const heroName = { censor: 'Cavall Polder', conduit: 'Polder of Adûn', fury: 'Wolf Polder', null: 'Frost Polder', elementalist: 'Ember Polder', shadow: 'Nightshade Polder', tactician: 'Banner Polder', talent: 'Dream Polder', troubadour: 'Ballad Polder' }[classId];
  page.setDefaultTimeout(5000);
  const unrelatedStorage=()=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('draw-steel.builder.'))));
  const before=await unrelatedStorage();
  await builder.locator('[name="hero-name"]').fill(heroName);
  await builder.locator('[name="hero-class"]').selectOption(classId);
  if (classId !== 'elementalist') await builder.locator('[name="hero-level"]').selectOption('2');
  await builder.locator('nav [data-step="Ancestry"]').click();
  const ancestry = builder.locator('[data-slot="ancestry"]');
  if (!await ancestry.locator('[data-option="ancestry-polder"][aria-pressed="true"]').count()) {
    await ancestry.getByRole('button',{name:'Polder',exact:true}).click();
    await builder.goto(builder.url());
    await builder.locator('[data-slot="ancestry"] button[aria-pressed="true"]').waitFor();
  }
  for(const step of ['Ancestry','Background','Class','Training']){
    await builder.locator('nav [data-step="'+step+'"]').click();
    for(let i=0;i<70;i++){
      const key=await builder.locator('fieldset[data-slot]').evaluateAll(groups=>{
        return groups.find(group=>{const [used,max]=group.querySelector('legend small').textContent.split('/').map(parseFloat);return used!==max;})?.dataset.slot;
      });
      if(!key)break;
      const slot=builder.locator('fieldset[data-slot="'+key+'"]');
      if(key==='subclass'){await slot.getByRole('button',{name:specialization,exact:true}).click();continue;}
      if (key === 'tactician-kits') {
        await slot.getByRole('button',{name:'Martial Artist',exact:true}).click();
        await slot.getByRole('button',{name:'Mountain',exact:true}).click();
        continue;
      }
      if (key === 'tactician-kits-meleeDamage') {
        const mountain = slot.locator('button[data-option="kit-mountain"]');
        assert.match(await mountain.innerText(), /\+0\/\+0\/\+4/);
        await mountain.click();
        continue;
      }
      if(key==='conduit-domain'){
        await slot.getByRole('button',{name:'Life',exact:true}).click();
        await slot.getByRole('button',{name:'Protection',exact:true}).click();
        continue;
      }
      const preferred = {
        'censor-1-2': 'Cavall', 'censor-domain': 'War', 'censor-1-5': 'Warrior Priest',
        'conduit-deity': 'Adûn', 'conduit-feature-1': 'Protection', 'conduit-domain-ability-2': 'Wellspring of Grace',
        'fury-stormwight-kit': 'Vuken', 'fury-stormwight-ability-2': 'Visceral Roar', 'fury-perk-2': 'Expert Artisan',
        'shadow-kit': 'Cloak and Dagger', 'shadow-caustic-alchemy-ability-2': 'Sticky Bomb',
        'tactician-vanguard-ability-2': 'Squad! On Me!',
        'talent-augmentation': 'Distance Augmentation', 'talent-ward': 'Vanishing Ward',
        'talent-telepathy-ability-2': 'Synaptic Override',
        'troubadour-kit': 'Swashbuckler', 'troubadour-virtuoso-ability-2': 'Encore',
        'troubadour-invocation': 'Formal Introductions',
      }[key];
      if (preferred) {
        await slot.getByRole('button', { name: preferred, exact: true }).click();
        continue;
      }
      if(key==='elementalist-1-7'){await slot.getByRole('button',{name:'Enchantment of Celerity',exact:true}).click();continue;}
      if(step==='Training' && key==='env-nomadic'){
        await slot.locator('.soft button').first().click();
        await builder.getByRole('button',{name:'Keep choosing'}).click();
        await slot.locator('.soft button').first().click();
        await builder.getByRole('button',{name:'Use this choice'}).click();
        await slot.locator('.soft button[aria-pressed="true"]').waitFor();
      }else await slot.locator('.choice:not(.soft) button[aria-pressed="false"]:enabled').first().click();
    }
  }
  await builder.locator('nav [data-step="Review"]').click();
  assert.ok(await builder.getByRole('heading',{name:'Accepted house rules'}).count());
  const download=page.waitForEvent('download');
  await builder.getByRole('button',{name:'Download hero JSON'}).click();
  const saved=await download;
  const sheet=JSON.parse(readFileSync(await saved.path(),'utf8'));
  assert.equal(sheet.hero.name,heroName); assert.equal(sheet.hero.classTrack,specialization);assert.equal(sheet.hero.vitals.size,'1S');
  assert.ok(sheet.features.some(f=>f.title==='House rules'));
  if (isNull) {
    assert.equal(sheet.hero.resource.title,'Discipline');
    assert.equal(sheet.hero.level,2);
    assert.ok(sheet.actions.mains.some(a=>a.name==='Entropic Field' && a.cost==='5 Discipline'));
    assert.ok(!Object.values(sheet.actions).flat().some(a=>a.id.startsWith('elementalist')));
  } else if (isCensor) {
    assert.equal(sheet.hero.resource.title, 'Wrath');
    assert.equal(sheet.hero.kit.name, 'Warrior Priest');
    assert.ok(sheet.features.some(f => f.title === 'Sanctified Weapon'));
    assert.ok(sheet.actions.maneuvers.some(a => a.name === 'Blessing of the Faithful' && a.cost === '5 Wrath'));
    assert.ok(sheet.actions.mains.some(a => a.name === 'Weakening Brand'));
  } else if (classId === 'fury') {
    assert.equal(sheet.hero.resource.title, 'Ferocity');
    assert.equal(sheet.hero.kit.name, 'Vuken');
    assert.ok(sheet.actions.maneuvers.some(a=>a.name==='Aspect of the Wild'));
    const roar = sheet.actions.mains.find(a=>a.name==='Visceral Roar');
    assert.equal(roar.cost,'5 Ferocity');
    assert.equal(roar.tests[0].tiers.low.damageType,'lightning');
    assert.ok(!Object.values(sheet.actions).flat().some(a=>a.name==='Judgment' || a.name==='Weakening Brand'));
  } else if (classId === 'tactician') {
    assert.equal(sheet.hero.resource.title, 'Focus');
    assert.equal(sheet.hero.kit.name, 'Martial Artist and Mountain');
    assert.ok(sheet.actions.maneuvers.some(a => a.name === 'Squad! On Me!' && a.cost === '5 Focus'));
    assert.ok(sheet.actions.triggers.some(a => a.name === 'Parry'));
    const grace = sheet.actions.mains.find(a => a.name === 'Battle Grace');
    assert.equal(grace.tests[0].tiers.high.damage, String(13 + Math.max(sheet.hero.stats.might, sheet.hero.stats.agility)));
    assert.ok(sheet.actions.mains.some(a => a.name === 'Pain for Pain'));
    assert.ok(!Object.values(sheet.actions).flat().some(a => a.name === 'Visceral Roar' || a.name === 'Overwatch'));
  } else if (classId === 'troubadour') {
    assert.equal(sheet.hero.resource.title, 'Drama');
    assert.equal(sheet.hero.kit.name, 'Swashbuckler');
    assert.ok(sheet.sidebar.skills.Music);
    assert.ok(sheet.features.some(f => f.title === 'Formal Introductions'));
    assert.ok(sheet.actions.mains.some(a => a.name === 'Encore' && a.cost === '5 Drama'));
    assert.ok(sheet.actions.mains.some(a => a.name === 'Thunder Mother' && a.actionLabel === 'No action'));
    assert.ok(sheet.actions.triggers.some(a => a.name === 'Harmonize'));
    assert.ok(!Object.values(sheet.actions).flat().some(a => ['Riposte', 'Mark', 'Guest Star'].includes(a.name)));
  } else if (classId === 'talent') {
    assert.equal(sheet.hero.resource.title, 'Clarity');
    assert.equal(sheet.hero.resource.allowNegative, true);
    assert.ok(sheet.sidebar.lists.languages.includes('Mindspeech'));
    assert.equal(sheet.actions.freeStrikes.find(a => a.name === 'Mind Spike').range, 'Ranged 12');
    assert.ok(sheet.actions.mains.some(a => a.name === 'Synaptic Override' && a.cost === '5 Clarity'));
    assert.ok(sheet.features.some(f => f.title === 'Vanishing Ward'));
    assert.ok(!Object.values(sheet.actions).flat().some(a => a.name === 'Minor Telekinesis' || a.name === 'Sticky Bomb'));
  } else if (classId === 'shadow') {
    assert.equal(sheet.hero.resource.title, 'Insight');
    assert.equal(sheet.hero.resource.discountOnPowerRollEdge, true);
    assert.equal(sheet.hero.kit.name, 'Cloak and Dagger');
    assert.ok(sheet.actions.mains.some(a => a.name === 'Sticky Bomb' && a.cost === '5 Insight'));
    assert.ok(sheet.actions.triggers.some(a => a.name === 'Defensive Roll'));
    assert.ok(!Object.values(sheet.actions).flat().some(a => a.name === 'Black Ash Teleport' || a.name === 'Healing Grace'));
  } else if (classId === 'conduit') {
    assert.equal(sheet.hero.resource.title,'Piety');
    assert.ok(sheet.actions.mains.some(a=>a.name==='Wellspring of Grace' && a.cost==='5 Piety'));
    assert.ok(sheet.features.some(f=>f.title==='Revitalizing Ritual'));
    assert.ok(sheet.features.some(f=>f.title==='Protective Circle'));
    assert.ok(!Object.values(sheet.actions).flat().some(a=>a.name==='Sacred Bond'));
  } else assert.ok(sheet.actions.mains.some(a=>a.name==='Hurl Element'));
  if (builder === page.mainFrame()) assert.deepEqual(await unrelatedStorage(),before);
}

// Each page: who opens it, where, and how it shows that it has started.
const PAGES = [
  { name: 'the map, as the Director', as: 'GM', path: '/dnd/vtt/', started: () => document.documentElement.dataset.vttStarted === '1' },
  { name: 'the map, as a player', as: 'cal', path: '/dnd/vtt/', started: () => document.documentElement.dataset.vttStarted === '1' },
  // Changed on purpose (October 2026): the sheet was rebuilt (app.js draws it from parts/); its status bar is drawn
  // once it has started. The classic sheet (classic.php) was retired when the new one was approved.
  { name: 'the character sheet, as its player', as: 'cal', path: '/dnd/character_sheet/index.php',
    started: () => document.documentElement.dataset.sheetStarted === '1' && Boolean(document.querySelector('[data-sp-status]')) },
  { name: 'the main page, as the Director', as: 'GM', path: '/dnd/table/', check:finishDirectorBuilds, started: () => !!window.Table && !!document.querySelector('iframe[title="Map"]') },
  { name: 'the main page, as a player', as: 'cal', path: '/dnd/table/', check:finishPlayerBuilds, started: () => !!window.Table && !!document.querySelector('iframe[title="Map"]') },
  { name: 'the character builder as a player', as: 'cal', path: '/dnd/character_sheet/builder/', check:finishIndependentHero,
    started: () => !!document.querySelector('[data-step="Identity"]') && !!document.querySelector('[name="hero-name"]') },
];

test('every page starts: the map as Director and as a player, the character sheet, the Table and standalone character builder', { timeout: 240000, skip: process.env.SKIP_PAGE_START_CHECK === '1' ? 'SKIP_PAGE_START_CHECK=1' : false }, async () => {
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
    catch (error) { assert.fail('Chrome could not be started through Playwright: ' + error.message); }
    for (const one of PAGES) {
      const port = await freePort(), origin = `http://127.0.0.1:${port}`;
      const server = spawn(php, [...extensions, '-S', `127.0.0.1:${port}`, '-t', site, router], { env: { ...process.env, PAGE_START_CHECK: '1' }, stdio: 'ignore' });
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      try {
        assert.ok(await answers(origin), 'PHP\'s own server did not come up');
        const page = await context.newPage();
        if([finishIndependentHero,finishPlayerBuilds,finishDirectorBuilds].includes(one.check))page.on('request',request=>{
          if (one.check !== finishIndependentHero && !request.frame().url().includes('/character_sheet/builder/')) return;
          const url=new URL(request.url());
          if(request.method()!=='GET' || url.pathname.endsWith('handler.php') || url.pathname.includes('/character_sheet/data/'))errors.push('Unexpected builder request '+request.method()+' '+url.pathname);
        });
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
        // Listen for late start-up errors while the longer interactive checks run.
        await Promise.all([page.waitForTimeout(1500), one.check?.(page)]);
        if (errors.length) failures.push(`${one.name}: ${errors.slice(0, 3).join(' | ')}`);
      } catch (error) {
        failures.push(`${one.name}: DID NOT START. ${error.message}${errors.length ? ' Errors: ' + errors.slice(0, 3).join(' | ') : ' No error was logged.'}`);
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
