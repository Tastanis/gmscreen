#!/usr/bin/env node
// Upload a map package or creature files to the live site without signing in.
// The whole story, the one-time setup and the risk are in docs/site-upload.md.
//
//   node dnd/tools/site-upload.mjs setup
//   node dnd/tools/site-upload.mjs status
//   node dnd/tools/site-upload.mjs map "C:\maps\Gravity Orchard.vttmap" --folder Prismari --replace
//   node dnd/tools/site-upload.mjs creature "C:\creatures\orchard" --tab "Gravity Orchard" --create-tab --replace
//
// The key is read from a file outside this repository and sent in a request header over HTTPS.
// This tool never prints it, never puts it in an address, and never writes it anywhere else.

import { readFile, writeFile, mkdir, readdir, stat, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
export const DEFAULT_SITE = 'https://bharmsasl.com';
export const DEFAULT_KEY_FOLDER = path.join(os.homedir(), '.gmscreen-site-upload');
export const ENDPOINT = '/dnd/admin/site-upload/index.php';
const KEY_HEADER = 'X-GMScreen-Upload-Key';
const MAX_BUNDLE_BYTES = 128 * 1024 * 1024;

export class Refused extends Error {}

/** Command line into {command, target, flags}. Flags that take a value are listed in `valued`. */
export function parseArguments(argv) {
  const valued = new Set(['folder', 'name', 'tab', 'subtab', 'site', 'key-file']);
  const flags = {}, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i];
    if (!word.startsWith('--')) { rest.push(word); continue; }
    const name = word.slice(2);
    if (valued.has(name)) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Refused(`--${name} needs a value after it.`);
      flags[name] = argv[++i];
    } else flags[name] = true;
  }
  return { command: rest[0] || '', target: rest[1] || '', flags };
}

/** "64M" as a number of bytes; 0 or less means no limit. */
export function iniBytes(text) {
  const match = /^\s*(-?\d+)\s*([kmg]?)/i.exec(String(text ?? ''));
  if (!match) return 0;
  const factor = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[match[2].toLowerCase()];
  return Number(match[1]) * factor;
}

/** The largest single request the server says it takes, in bytes, or Infinity when it sets no limit. */
export function requestLimit(limits, upload = false) {
  const sizes = [iniBytes(limits?.post_max_size), ...(upload ? [iniBytes(limits?.upload_max_filesize)] : [])].filter((n) => n > 0);
  return sizes.length ? Math.min(...sizes) : Infinity;
}

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

/** Where the site is, checked: HTTPS, or plain HTTP only to this PC when asked for (the test sandbox). */
export function siteAddress(site, loopback = false) {
  let url;
  try { url = new URL(site); } catch { throw new Refused(`"${site}" is not a site address.`); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(loopback && local && url.protocol === 'http:')) throw new Refused('The site address must start with https://. (Plain http is allowed only to 127.0.0.1 with --loopback, for the test sandbox.)');
  if (url.username || url.password || url.search || url.hash) throw new Refused('The site address must be just the site, with nothing after it.');
  return url.origin;
}

async function readKey(keyFile) {
  let key;
  try { key = (await readFile(keyFile, 'utf8')).trim(); }
  catch { throw new Refused(`There is no key file at ${keyFile}. Run "node dnd/tools/site-upload.mjs setup" once, then put the file it makes on the server (docs/site-upload.md).`); }
  if (key.length < 32 || /\s/.test(key)) throw new Refused(`The key file at ${keyFile} does not hold a key. Run setup again with --new-key.`);
  return key;
}

/** One call to the endpoint. Returns the `result` of a good answer; throws Refused with the server's words otherwise. */
export async function call(connection, action, { json = null, form = null } = {}, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`${connection.site}${ENDPOINT}?action=${action}`, {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { [KEY_HEADER]: connection.key, ...(json !== null ? { 'Content-Type': 'application/json' } : {}) },
      body: json !== null ? JSON.stringify(json) : form ?? '',
    });
  } catch (error) { throw new Refused(`Could not reach ${connection.site}. Check the internet connection and the site address.`); }
  let data = null;
  try { data = await response.json(); } catch { /* not JSON: handled below */ }
  if (response.status === 404) throw new Refused('The site says there is no upload here. Either this build is not deployed yet, or the server has no key file (the upload is switched off). See docs/site-upload.md.');
  if (response.status === 403) throw new Refused(data?.error === 'HTTPS required.' ? 'The site refused: HTTPS is required.' : 'The site refused the key. The key file on this PC and the file on the server do not match; run setup again with --new-key and replace the server\'s file.');
  if (response.status === 429) throw new Refused('The site is refusing all uploads for fifteen minutes because of repeated wrong keys.');
  if (response.status === 413) throw new Refused(data?.error || 'The site says the file is too large for one request.');
  if (!response.ok || !data || data.success !== true) throw new Refused(data?.error || `The site answered ${response.status} and no reason.`);
  return data.result ?? data.data ?? data;
}

// ---- setup -----------------------------------------------------------------------------------

/** Makes the key (never shown) and the one file that goes on the server. */
export async function setup({ folder = DEFAULT_KEY_FOLDER, newKey = false } = {}) {
  const inside = path.relative(repository, path.resolve(folder));
  if (!inside.startsWith('..') && !path.isAbsolute(inside)) throw new Refused('The key must not be kept inside the repository. Choose a folder outside it.');
  const keyFile = path.join(folder, 'key.txt'), serverFile = path.join(folder, 'dnd-site-upload.php');
  if (existsSync(keyFile) && !newKey) throw new Refused(`A key already exists at ${keyFile}. Nothing was changed. To throw it away and make a new one, run setup again with --new-key (the server's file must then be replaced too).`);
  await mkdir(folder, { recursive: true });
  const key = randomBytes(48).toString('base64url');
  await writeFile(keyFile, key + '\n', { encoding: 'utf8', mode: 0o600 });
  await chmod(keyFile, 0o600).catch(() => {});
  const config = `<?php
// Private configuration for the gmscreen site upload (docs/site-upload.md).
// This file goes in the account home, NEXT TO public_html, never inside it.
// It holds only a fingerprint of the key, not the key. Delete this file to switch the upload off.
return [
    'key_sha256' => '${createHash('sha256').update(key).digest('hex')}',
    'allow_loopback_http' => false,
];
`;
  await writeFile(serverFile, config, 'utf8');
  return { keyFile, serverFile };
}

// ---- maps ------------------------------------------------------------------------------------

/** Reads a .vttmap bundle or a plain scene package from disk, checked by the Scenes screen's own code. */
export async function readMapFile(file) {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new Refused(`There is no file at ${file}.`);
  if (info.size > MAX_BUNDLE_BYTES) throw new Refused('The map package is too large (128 MB maximum).');
  let parsed;
  try { parsed = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Refused('The file is not a map package: it is not valid JSON.'); }
  const bundles = await import(pathToFileURL(path.join(repository, 'dnd/vtt/assets/js/ui/scene-map-bundle.mjs')).href);
  if (parsed?.format === bundles.BUNDLE_FORMAT) {
    let bundle;
    try { bundle = await bundles.validateMapBundle(parsed); } catch (error) { throw new Refused(`The map package was refused before sending: ${error.message}`); }
    return { bundle, package: bundle.package, upload: bundles.uploadMapBundle };
  }
  if (parsed?.format !== 'gmscreen-scene/v1') throw new Refused('The file is not a map package (.vttmap) or an exported scene.');
  return { bundle: null, package: parsed, upload: null };
}

export async function uploadMap(connection, file, flags, { fetcher = fetch, say = console.log } = {}) {
  const map = await readMapFile(file);
  const operationId = `site-upload-${randomUUID()}`;
  const request = { operationId, name: typeof flags.name === 'string' ? flags.name : undefined, folder: typeof flags.folder === 'string' ? flags.folder : undefined,
    createFolder: flags['create-folder'] === true, replace: flags.replace === true };
  const status = await call(connection, 'status', {}, fetcher);
  // Ask first, with nothing sent but the design: a refusal costs no uploaded pictures.
  const plan = await call(connection, 'map-import', { json: { ...request, package: map.package, dryRun: true } }, fetcher);
  say(`${plan.action === 'replaced' ? 'Will replace' : 'Will create'} "${plan.scene.name}"${plan.folder ? ` in the folder ${plan.folder}` : ''}.`);
  let packageData = map.package;
  if (map.bundle) {
    const limit = requestLimit(status.limits, true);
    for (const [reference, blob] of map.bundle.assets) if (blob.size > limit) throw new Refused(`One of the map's pictures is ${megabytes(blob.size)}, and the server takes ${megabytes(limit)} at most in one upload (upload_max_filesize ${status.limits.upload_max_filesize}, post_max_size ${status.limits.post_max_size}). Nothing was sent. The limit is raised in cPanel under MultiPHP INI Editor.`);
    // The Scenes screen's own uploader, pointed at the key-guarded endpoint.
    const through = (url, options) => {
      if (url !== '/dnd/vtt/api/uploads.php') throw new Error('Unexpected upload address.');
      return fetcher(`${connection.site}${ENDPOINT}?action=map-image`, { method: 'POST', redirect: 'error', cache: 'no-store', headers: { [KEY_HEADER]: connection.key }, body: options.body });
    };
    try { packageData = await map.upload(map.bundle, new Map(), through, (text) => say(text)); }
    catch (error) { throw new Refused(`A picture could not be uploaded: ${error.message} The scene was not created or changed.`); }
  }
  const body = { ...request, package: packageData };
  const size = Buffer.byteLength(JSON.stringify(body));
  if (size > requestLimit(status.limits)) throw new Refused(`The map's design is ${megabytes(size)}, and the server takes ${megabytes(requestLimit(status.limits))} at most in one request (post_max_size ${status.limits.post_max_size}). The scene was not created or changed.`);
  return call(connection, 'map-import', { json: body }, fetcher);
}

export function mapReport(result) {
  const c = result.counts || {}, lines = [];
  lines.push(`${result.action === 'replaced' ? 'Replaced' : 'Created'} the scene "${result.scene.name}"${result.folder ? ` in the folder ${result.folder}${result.folderCreated ? ' (new folder)' : ''}` : ' (in no folder)'}.`);
  lines.push(`It has ${c.floors} floor${c.floors === 1 ? '' : 's'}, ${c.walls} walls (${c.breakableWalls} breakable), ${c.plates} plates, ${c.ramps} ramps and ${c.zones} zones.`);
  if (result.action === 'replaced' && result.kept) {
    const k = result.kept;
    lines.push(`Kept as they were: ${k.tokens} token${k.tokens === 1 ? '' : 's'}, ${k.drawings} drawing${k.drawings === 1 ? '' : 's'}, ${k.templates} template${k.templates === 1 ? '' : 's'}, ${k.rememberedGround ? 'what each player has explored, ' : ''}and ${k.brokenWalls} broken wall${k.brokenWalls === 1 ? '' : 's'}.`);
    if (!k.rememberedGround) lines.push('The ground picture, the grid or the ground heights changed, so what each player had explored on this scene starts again.');
    if (k.tokensMovedToGround) lines.push(`${k.tokensMovedToGround} token${k.tokensMovedToGround === 1 ? ' was' : 's were'} on a floor the new map does not have and now stand${k.tokensMovedToGround === 1 ? 's' : ''} on the ground floor.`);
    if (k.packageTokensNotAdded) lines.push(`The package's own ${k.packageTokensNotAdded} token${k.packageTokensNotAdded === 1 ? ' was' : 's were'} not added, because the scene already has its tokens.`);
    if (result.onTheTable) lines.push('This scene is the one on the table now; open browsers were sent the new map.');
  } else if (c.tokens) lines.push(`It came with ${c.tokens} token${c.tokens === 1 ? '' : 's'}.`);
  if (result.action === 'created') lines.push('Nobody was moved to it. Open it from the Scenes list.');
  if (result.idempotent) lines.push('(The server had already done this exact upload; nothing was done twice.)');
  return lines;
}

// ---- creatures -------------------------------------------------------------------------------

/** Every automation block in a creature file, with the name of the ability it belongs to. */
export function automationsIn(value, label = 'creature', found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { value.forEach((item) => automationsIn(item, label, found)); return found; }
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : label;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'automation' && child && typeof child === 'object' && !Array.isArray(child)) found.push({ ability: name, automation: child });
    else automationsIn(child, name, found);
  }
  return found;
}

/**
 * The monster creator's own import, run on this PC as the page runs it: the same scripts, unchanged,
 * in a page of their own. Returns {read(parsed), check(parsed), close()}.
 */
export async function monsterCreator() {
  const require = createRequire(import.meta.url);
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://monster-creator.invalid/', virtualConsole: new VirtualConsole() });
  const { window } = dom;
  window.fetch = () => Promise.reject(new Error('This page is not connected to a site.'));
  for (const script of ['dnd/character_sheet/ability-automation/primitives.js', 'dnd/character_sheet/ability-automation/schema.js',
    'dnd/strixhaven/monster-creator/js/monster-json-import-normalize.js', 'dnd/strixhaven/monster-creator/js/monster-builder.js']) {
    window.eval(await readFile(path.join(repository, script), 'utf8'));
  }
  if (typeof window.normalizeImportedMonsterJson !== 'function' || typeof window.AbilityAutomationSchema?.normalizeAutomation !== 'function') throw new Error('The monster creator\'s import could not be loaded.');
  // The strict checker the creature files are held to: no warnings, no field the app does not know.
  const harness = await import(pathToFileURL(path.join(repository, 'dnd/character_sheet/ability-automation/__tests__/support/automation-harness.mjs')).href);
  const strict = await harness.createAbilityAutomationHarness();
  return {
    read: (parsed) => ({ monster: JSON.parse(JSON.stringify(window.normalizeImportedMonsterJson(parsed))), requestedId: String((parsed?.monster ?? parsed)?.id ?? (parsed?.monster ?? parsed)?.monsterId ?? '').trim() || undefined }),
    check: (parsed) => automationsIn(parsed).flatMap(({ ability, automation }) => strict.validateAutomation(automation, { strict: false }).issues.map((issue) => `${ability}: ${issue}`)),
    close: () => { strict.close(); window.close(); },
  };
}

async function creatureFiles(target) {
  const info = await stat(target).catch(() => null);
  if (!info) throw new Refused(`There is nothing at ${target}.`);
  if (info.isFile()) return [target];
  const names = (await readdir(target)).filter((name) => name.toLowerCase().endsWith('.json')).sort();
  if (!names.length) throw new Refused(`There are no .json files in ${target}.`);
  return names.map((name) => path.join(target, name));
}

/** Reads and checks creature files on this PC. Returns {ready: [{file, monster, requestedId}], refused: [{file, reason}]}. */
export async function prepareCreatures(files, { force = false, creator = null } = {}) {
  const page = creator ?? await monsterCreator(), ready = [], refused = [];
  try {
    for (const file of files) {
      const short = path.basename(file);
      let parsed;
      try { parsed = JSON.parse(await readFile(file, 'utf8')); } catch { refused.push({ file: short, reason: 'It is not valid JSON.' }); continue; }
      let read;
      try { read = page.read(parsed); } catch (error) { refused.push({ file: short, reason: `The monster creator's import refused it: ${error.message}` }); continue; }
      const issues = page.check(parsed);
      if (issues.length && !force) { refused.push({ file: short, name: read.monster.name, reason: `The automation checker found ${issues.length} problem${issues.length === 1 ? '' : 's'} (add --force to upload anyway):`, issues }); continue; }
      ready.push({ file: short, ...read, warnings: issues });
    }
  } finally { if (!creator) page.close(); }
  return { ready, refused };
}

export async function uploadCreatures(connection, target, flags, { fetcher = fetch } = {}) {
  const prepared = await prepareCreatures(await creatureFiles(target), { force: flags.force === true });
  let results = [];
  if (prepared.ready.length) {
    const answer = await call(connection, 'creature-import', { json: {
      creatures: prepared.ready.map(({ file, monster, requestedId }) => ({ file, monster, requestedId })),
      replace: flags.replace === true, tab: typeof flags.tab === 'string' ? flags.tab : undefined, subTab: typeof flags.subtab === 'string' ? flags.subtab : undefined, createTab: flags['create-tab'] === true,
    } }, fetcher);
    results = answer.creatures || [];
  }
  return { results, refused: prepared.refused, forced: prepared.ready.filter((entry) => entry.warnings.length) };
}

export function creatureReport({ results, refused, forced }) {
  const lines = [];
  for (const r of results) {
    if (r.action === 'refused') lines.push(`${r.file}: NOT uploaded. ${r.reason}`);
    else lines.push(`${r.file}: ${r.action === 'replaced' ? 'replaced' : 'created'} "${r.name}" (${r.abilities} abilities)${r.tab ? `, in ${r.tab}` : ', in no tab'}.`);
  }
  for (const r of refused) {
    lines.push(`${r.file}: NOT uploaded. ${r.reason}`);
    for (const issue of r.issues || []) lines.push(`    ${issue}`);
  }
  for (const r of forced) lines.push(`${r.file}: uploaded with ${r.warnings.length} checker problem${r.warnings.length === 1 ? '' : 's'} because of --force.`);
  const done = results.filter((r) => r.action !== 'refused').length, not = results.length - done + refused.length;
  lines.push(`${done} uploaded, ${not} not.`);
  if (done) lines.push('If the monster creator is open in a browser, reload it before saving there: its Save writes the whole list and would undo this upload.');
  return lines;
}

// ---- the command -----------------------------------------------------------------------------

const USAGE = `Upload to the live site without signing in. See docs/site-upload.md.

  node dnd/tools/site-upload.mjs setup [--new-key]
  node dnd/tools/site-upload.mjs status
  node dnd/tools/site-upload.mjs map <file.vttmap> [--folder NAME] [--create-folder] [--replace] [--name NAME]
  node dnd/tools/site-upload.mjs creature <file.json or folder> [--tab NAME] [--subtab NAME] [--create-tab] [--replace] [--force]

  --site https://...     another site (default ${DEFAULT_SITE})
  --key-file PATH        another key file (default ${path.join(DEFAULT_KEY_FOLDER, 'key.txt')})
  --loopback             allow http://127.0.0.1, for the test sandbox only`;

export async function main(argv, { say = console.log, fetcher = fetch } = {}) {
  const { command, target, flags } = parseArguments(argv);
  if (!command || flags.help) { say(USAGE); return 0; }
  if (command === 'setup') {
    const made = await setup({ folder: typeof flags['key-file'] === 'string' ? path.dirname(flags['key-file']) : DEFAULT_KEY_FOLDER, newKey: flags['new-key'] === true });
    say(`A new key was made. It is not shown, and you never need to see it.`);
    say(`  On this PC, keep:      ${made.keyFile}`);
    say(`  Put on the server:     ${made.serverFile}`);
    say('Upload that second file with cPanel File Manager into the account home, next to public_html and NOT inside it');
    say('(for this account: /home/rylabsuueil3/dnd-site-upload.php), and set its permissions to 0600.');
    say('Then run: node dnd/tools/site-upload.mjs status');
    return 0;
  }
  if (!['status', 'map', 'creature'].includes(command)) throw new Refused(`"${command}" is not a command.\n\n${USAGE}`);
  if (command !== 'status' && !target) throw new Refused(`Say which file to upload.\n\n${USAGE}`);
  const connection = { site: siteAddress(typeof flags.site === 'string' ? flags.site : DEFAULT_SITE, flags.loopback === true),
    key: await readKey(typeof flags['key-file'] === 'string' ? flags['key-file'] : path.join(DEFAULT_KEY_FOLDER, 'key.txt')) };
  if (command === 'status') {
    const status = await call(connection, 'status', {}, fetcher);
    say(`The upload is switched on at ${connection.site}, and the key is accepted.`);
    say(`Scene folders: ${status.folders.length ? status.folders.join(', ') : '(none yet)'}.`);
    say(`Monster creator tabs: ${status.monsterTabs.length ? status.monsterTabs.map((tab) => `${tab.name}${tab.subTabs.length ? ` (${tab.subTabs.join(', ')})` : ''}`).join('; ') : '(none yet)'}.`);
    const one = requestLimit(status.limits, true), whole = requestLimit(status.limits);
    say(`Largest single picture the server takes: ${Number.isFinite(one) ? megabytes(one) : 'no limit set'} (upload_max_filesize ${status.limits.upload_max_filesize}, post_max_size ${status.limits.post_max_size}).`);
    say(`Largest map design in one request: ${Number.isFinite(whole) ? megabytes(Math.min(whole, 32 * 1048576)) : '32.0 MB'}. Memory ${status.limits.memory_limit}, time ${status.limits.max_execution_time} seconds.`);
    return 0;
  }
  if (command === 'map') {
    for (const line of mapReport(await uploadMap(connection, target, flags, { fetcher, say }))) say(line);
    return 0;
  }
  const outcome = await uploadCreatures(connection, target, flags, { fetcher });
  for (const line of creatureReport(outcome)) say(line);
  return outcome.refused.length || outcome.results.some((r) => r.action === 'refused') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    // Only what the person needs to read. Never a request, a header or the key.
    console.error(error instanceof Refused ? error.message : `The upload tool stopped: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
