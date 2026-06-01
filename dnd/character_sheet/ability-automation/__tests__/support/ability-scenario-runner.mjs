import { createAbilityAutomationHarness } from './automation-harness.mjs';
import {
  applyTriggerReadyState,
  clearTriggerReadyState,
} from '../../../../vtt/assets/js/ui/automation-trigger-ready.js';
import { buildAutomationTriggerPredicate } from '../../../../vtt/assets/js/ui/automation-trigger-predicate.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function extractAbility(input) {
  const ability = input?.ability || input;
  const fields = ability?.fields && typeof ability.fields === 'object' ? ability.fields : {};
  const automation = ability?.automation && typeof ability.automation === 'object' ? ability.automation : ability;
  const action = {
    id: fields.id || fields.name || 'ability-under-scenario-test',
    name: fields.name || 'Ability Under Scenario Test',
    actionLabel: fields.actionLabel || fields.type || '',
    actionType: fields.actionLabel || fields.type || '',
    cost: fields.cost || '',
    keywords: normalizeKeywords(fields.keywords || automation?.keywords || []),
  };
  return { fields, automation, action };
}

function createPlacement(token) {
  return {
    id: token.id,
    name: token.name || token.id,
    team: token.team || '',
    column: token.column || token.x || 0,
    row: token.row || token.y || 0,
    width: token.width || 1,
    height: token.height || 1,
    triggeredActionReady: token.triggeredActionReady ?? true,
    triggeredActionUsedThisRound: Boolean(token.triggeredActionUsedThisRound),
    activeMarks: {},
    marks: {},
    hasReadyTrigger: false,
    readyTriggerAbilities: [],
    readyTriggerSources: {},
    readyTriggerPayloads: {},
    triggerSetAtPhase: null,
  };
}

function createScenarioBoard(scenario = {}) {
  const casterId = scenario.caster || scenario.casterId || 'caster-1';
  const tokens = Array.isArray(scenario.tokens) && scenario.tokens.length
    ? scenario.tokens
    : [
        { id: casterId, name: 'Caster', team: 'heroes' },
        { id: 'enemy-1', name: 'Enemy One', team: 'monsters' },
      ];
  const placements = new Map();
  for (const token of tokens) {
    if (!token?.id) continue;
    placements.set(token.id, createPlacement(token));
  }
  if (!placements.has(casterId)) {
    placements.set(casterId, createPlacement({ id: casterId, name: 'Caster', team: 'heroes' }));
  }
  for (const mark of scenario.marks || []) {
    const type = mark.type || mark.markType || 'judgment';
    const sourceId = mark.sourceId || casterId;
    const targetId = mark.targetId || mark.placementId || '';
    const source = placements.get(sourceId);
    const target = placements.get(targetId);
    if (!source || !target) continue;
    source.activeMarks[type] = {
      targetId,
      targetName: target.name,
      duration: mark.duration || 'endOfEncounter',
    };
    target.marks[type] = {
      markType: type,
      sourceId,
      sourceName: source.name,
      targetId,
      targetName: target.name,
      duration: mark.duration || 'endOfEncounter',
    };
  }
  return {
    casterId,
    placements,
    getPlacementFromStore(id) {
      return placements.get(id) || null;
    },
    getTeamForPlacementId(id) {
      return placements.get(id)?.team || null;
    },
    getPlacementMark(placement, markType = 'judgment') {
      return placement?.marks?.[markType] || null;
    },
    getJudgedTargetForSource(sourceId, markType = 'judgment') {
      const source = placements.get(sourceId);
      const targetId = source?.activeMarks?.[markType]?.targetId || '';
      return targetId ? placements.get(targetId) || null : null;
    },
    getSquareDistance(idA, idB) {
      const a = placements.get(idA);
      const b = placements.get(idB);
      if (!a || !b) return null;
      return Math.max(Math.abs((a.column || 0) - (b.column || 0)), Math.abs((a.row || 0) - (b.row || 0)));
    },
  };
}

function getActionType(action) {
  const label = String(action.actionLabel || action.actionType || '').toLowerCase();
  return label.includes('trigger') ? 'triggered' : '';
}

function makeTriggerEntries(registerCalls, board) {
  return registerCalls.map((payload) => {
    const entry = {
      tokenId: payload.casterId,
      eventType: payload.match?.event || '',
      casterId: payload.casterId,
      casterTeam: board.getTeamForPlacementId(payload.casterId),
      match: payload.match,
      targetIds: Array.isArray(payload.targetIds) ? [...payload.targetIds] : [],
      abilityId: payload.abilityId || `scenario_trigger_${payload.casterId}`,
      abilityName: payload.abilityName || '',
      authored: true,
      freeTriggered: String(payload.abilityName || '').toLowerCase().includes('free'),
    };
    entry.predicate = buildAutomationTriggerPredicate(entry, {
      getTeamForPlacementId: board.getTeamForPlacementId,
      getJudgedTargetForSource: board.getJudgedTargetForSource,
      getPlacementMark: board.getPlacementMark,
      getPlacementFromStore: board.getPlacementFromStore,
      getSquareDistance: board.getSquareDistance,
      isTriggerActionAvailable(casterId) {
        const caster = board.getPlacementFromStore(casterId);
        return !(caster?.triggeredActionReady === false || caster?.triggeredActionUsedThisRound === true);
      },
    });
    return entry;
  });
}

function fireScenarioEvent(board, entries, event) {
  const eventType = event?.type || event?.eventType || '';
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  const ready = [];
  for (const entry of entries.filter((item) => item.eventType === eventType)) {
    if (!entry.predicate(payload)) continue;
    const placement = board.getPlacementFromStore(entry.tokenId);
    const readyState = applyTriggerReadyState(placement, {
      abilityId: entry.abilityId,
      sourceId: payload.sourceId || null,
      eventSnapshot: { eventType, payload },
      phaseTick: 1,
    });
    if (readyState) {
      ready.push({
        placementId: entry.tokenId,
        abilityId: entry.abilityId,
        eventType,
        payload: clone(payload),
        readyState: clone(readyState),
      });
    }
  }
  return ready;
}

export async function runAbilityScenario(input) {
  const { automation, action } = extractAbility(input);
  const scenario = input?.scenario || {};
  const board = createScenarioBoard(scenario);
  const harness = await createAbilityAutomationHarness({
    targets: [...board.placements.values()].map((placement) => ({
      id: placement.id,
      name: placement.name,
      placement: clone(placement),
    })),
  });
  const actionType = scenario.actionType || getActionType(action);
  try {
    const validation = harness.validateAutomation(automation, { strict: false });
    const armed = await harness.runAutomation({
      automation,
      action,
      actionType,
      sourcePlacement: clone(board.getPlacementFromStore(board.casterId)),
      strictValidation: true,
    });
    const entries = makeTriggerEntries(armed.calls.registerTrigger, board);
    const events = Array.isArray(scenario.events)
      ? scenario.events
      : scenario.event
        ? [scenario.event]
        : [];
    const ready = events.flatMap((event) => fireScenarioEvent(board, entries, event));
    let resolved = null;
    if (scenario.resolve !== false && ready.length) {
      const firstReady = ready[0];
      const placement = board.getPlacementFromStore(firstReady.placementId);
      const triggerPayload = placement?.readyTriggerPayloads?.[firstReady.abilityId] || null;
      resolved = await harness.runAutomation({
        automation,
        action,
        actionType,
        triggerPayload,
        sourcePlacement: clone(board.getPlacementFromStore(firstReady.placementId)),
        strictValidation: true,
      });
      clearTriggerReadyState(placement, firstReady.abilityId);
    }
    return {
      validation,
      action,
      board,
      registeredTriggers: clone(armed.calls.registerTrigger),
      ready,
      resolved,
      calls: clone(harness.calls),
      callLog: clone(harness.callLog),
      placements: Object.fromEntries([...board.placements.entries()].map(([id, placement]) => [id, clone(placement)])),
    };
  } finally {
    harness.close();
  }
}
