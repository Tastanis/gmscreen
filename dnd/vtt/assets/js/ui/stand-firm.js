(function () {
  'use strict';

  var DEFAULT_PREVENTED = ['prone', 'frightened'];

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeName(value) {
    return normalizeText(value).replace(/[^a-z0-9]+/g, '');
  }

  function toInt(value, fallback) {
    var parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function tokenRect(placement) {
    var column = Number.isFinite(placement && placement.column) ? placement.column : Number.parseInt(placement && placement.column, 10) || 0;
    var row = Number.isFinite(placement && placement.row) ? placement.row : Number.parseInt(placement && placement.row, 10) || 0;
    var width = Math.max(1, Number.isFinite(placement && placement.width) ? placement.width : Number.parseInt(placement && placement.width, 10) || 1);
    var height = Math.max(1, Number.isFinite(placement && placement.height) ? placement.height : Number.parseInt(placement && placement.height, 10) || 1);
    return {
      left: column,
      top: row,
      right: column + width - 1,
      bottom: row + height - 1,
    };
  }

  function rectDistance(a, b) {
    var dx = a.right < b.left ? b.left - a.right : b.right < a.left ? a.left - b.right : 0;
    var dy = a.bottom < b.top ? b.top - a.bottom : b.bottom < a.top ? a.top - b.bottom : 0;
    return Math.max(dx, dy);
  }

  function isAdjacent(a, b) {
    if (!a || !b || a.id === b.id) return false;
    return rectDistance(tokenRect(a), tokenRect(b)) <= 1;
  }

  function sameTeam(a, b, getTeam) {
    var teamA = normalizeText(typeof getTeam === 'function' ? getTeam(a) : a && a.team);
    var teamB = normalizeText(typeof getTeam === 'function' ? getTeam(b) : b && b.team);
    return Boolean(teamA && teamB && teamA === teamB);
  }

  function hasAdjacentAlly(placement, placements, options) {
    if (!placement || !Array.isArray(placements)) return false;
    var getTeam = options && options.getTeam;
    return placements.some(function (candidate) {
      return Boolean(candidate && candidate.id !== placement.id && sameTeam(placement, candidate, getTeam) && isAdjacent(placement, candidate));
    });
  }

  function normalizeStandFirmPassive(passive) {
    if (!passive || typeof passive !== 'object') return null;
    var kind = normalizeName(passive.kind || passive.type || passive.passive || passive.id || passive.label || passive.name);
    if (kind !== 'standfirm') return null;
    var prevented = Array.isArray(passive.preventConditions)
      ? passive.preventConditions
      : Array.isArray(passive.preventedConditions)
        ? passive.preventedConditions
        : DEFAULT_PREVENTED;
    prevented = prevented.map(normalizeText).filter(Boolean);
    if (!prevented.length) prevented = DEFAULT_PREVENTED.slice();
    return {
      kind: 'standFirm',
      label: String(passive.label || passive.name || 'Stand Firm').trim() || 'Stand Firm',
      stabilityBonus: Math.max(0, toInt(passive.stabilityBonus ?? passive.stability ?? passive.amount, 3)),
      preventConditions: Array.from(new Set(prevented)),
    };
  }

  function collectAutomationPassives(automation) {
    if (!automation || typeof automation !== 'object') return [];
    var raw = Array.isArray(automation.passives) ? automation.passives : [];
    if (!raw.length && automation.kind) raw = [automation];
    return raw.map(normalizeStandFirmPassive).filter(Boolean);
  }

  function collectSheetPassives(sheet) {
    var passives = [];
    var features = Array.isArray(sheet && sheet.features) ? sheet.features : [];
    features.forEach(function (feature) {
      collectAutomationPassives(feature && feature.automation).forEach(function (passive) {
        passives.push(passive);
      });
    });
    return passives;
  }

  function collectMonsterPassives(monster) {
    var passives = [];
    var traits = Array.isArray(monster && monster.traits) ? monster.traits : [];
    traits.forEach(function (trait) {
      collectAutomationPassives(trait && trait.automation).forEach(function (passive) {
        passives.push(passive);
      });
    });
    var abilities = monster && monster.abilities && typeof monster.abilities === 'object' ? monster.abilities : {};
    Object.keys(abilities).forEach(function (key) {
      var list = Array.isArray(abilities[key]) ? abilities[key] : [];
      list.forEach(function (ability) {
        collectAutomationPassives(ability && ability.automation).forEach(function (passive) {
          passives.push(passive);
        });
      });
    });
    return passives;
  }

  function resolveStandFirmState(args) {
    var placement = args && args.placement;
    var placements = args && Array.isArray(args.placements) ? args.placements : [];
    var passives = [];
    collectSheetPassives(args && args.sheet).forEach(function (passive) { passives.push(passive); });
    collectMonsterPassives((args && args.monster) || (placement && placement.monster)).forEach(function (passive) { passives.push(passive); });
    if (!placement || !passives.length) {
      return { active: false, adjacentAlly: false, stabilityBonus: 0, preventConditions: [], labels: [] };
    }
    var adjacentAlly = hasAdjacentAlly(placement, placements, { getTeam: args && args.getTeam });
    if (!adjacentAlly) {
      return { active: false, adjacentAlly: false, stabilityBonus: 0, preventConditions: [], labels: passives.map(function (p) { return p.label; }) };
    }
    return passives.reduce(function (state, passive) {
      state.active = true;
      state.adjacentAlly = true;
      state.stabilityBonus += passive.stabilityBonus;
      passive.preventConditions.forEach(function (name) {
        if (!state.preventConditions.includes(name)) state.preventConditions.push(name);
      });
      if (!state.labels.includes(passive.label)) state.labels.push(passive.label);
      return state;
    }, { active: false, adjacentAlly: false, stabilityBonus: 0, preventConditions: [], labels: [] });
  }

  function conditionPrevented(state, conditionName) {
    if (!state || !state.active) return false;
    return state.preventConditions.includes(normalizeText(conditionName));
  }

  window.DrawSteelStandFirm = {
    collectAutomationPassives: collectAutomationPassives,
    collectSheetPassives: collectSheetPassives,
    collectMonsterPassives: collectMonsterPassives,
    conditionPrevented: conditionPrevented,
    hasAdjacentAlly: hasAdjacentAlly,
    isAdjacent: isAdjacent,
    resolveStandFirmState: resolveStandFirmState,
  };
})();
