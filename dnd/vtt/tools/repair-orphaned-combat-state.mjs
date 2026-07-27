#!/usr/bin/env node

import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCombatSceneRepairPlan } from '../assets/js/combat/combat-sync.js';

function parseArgs(argv) {
  const options = { apply: false, boardState: '', scenes: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--board-state') {
      options.boardState = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--scenes') {
      options.scenes = argv[index + 1] ?? '';
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.boardState || !options.scenes) {
    throw new Error(
      'Usage: node repair-orphaned-combat-state.mjs --board-state <board-state.json> --scenes <scenes.json> [--apply]'
    );
  }
  return options;
}

function normalizeScenes(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const items = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.scenes)
      ? source.scenes
      : Array.isArray(source)
        ? source
        : [];
  return { items };
}

export function applyCombatSceneRepair(boardState, scenes, plan, now = Date.now()) {
  const next = structuredClone(boardState);
  let changed = false;

  plan.deactivations.forEach(({ sceneId }) => {
    const combat = next?.sceneState?.[sceneId]?.combat;
    if (!combat || typeof combat !== 'object') {
      return;
    }
    combat.active = false;
    if (Object.prototype.hasOwnProperty.call(combat, 'isActive')) {
      combat.isActive = false;
    }
    combat.activeCombatantId = null;
    combat.turnPhase = 'idle';
    combat.turnLock = null;
    combat.sequence = Math.max(0, Number(combat.sequence ?? combat.seq ?? 0) || 0) + 1;
    combat.updatedAt = Math.max(0, Math.trunc(Number(now) || Date.now()));
    changed = true;
  });

  if (changed) {
    next._version = Math.max(0, Number(next._version ?? 0) || 0) + 1;
  }
  return next;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const boardPath = resolve(options.boardState);
  const scenesPath = resolve(options.scenes);
  const [boardRaw, scenesRaw] = await Promise.all([
    readFile(boardPath, 'utf8'),
    readFile(scenesPath, 'utf8'),
  ]);
  const boardState = JSON.parse(boardRaw);
  const scenes = normalizeScenes(JSON.parse(scenesRaw));
  const plan = getCombatSceneRepairPlan({ boardState, scenes });

  process.stdout.write(`${JSON.stringify({
    mode: options.apply ? 'apply' : 'dry-run',
    boardState: boardPath,
    scenes: scenesPath,
    canonicalSceneId: plan.canonicalSceneId,
    deactivations: plan.deactivations,
  }, null, 2)}\n`);

  if (!options.apply || plan.deactivations.length === 0) {
    return;
  }

  const repaired = applyCombatSceneRepair(boardState, scenes, plan);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${boardPath}.pre-combat-repair-${timestamp}.bak`;
  const temporaryPath = resolve(dirname(boardPath), `.board-state-repair-${process.pid}.tmp`);
  await copyFile(boardPath, backupPath);
  await writeFile(temporaryPath, `${JSON.stringify(repaired, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, boardPath);
  process.stdout.write(`Applied repair. Backup: ${backupPath}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
