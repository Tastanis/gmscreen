import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../..');

const SCRIPT_PATHS = [
  'dnd/character_sheet/ability-automation/primitives.js',
  'dnd/character_sheet/ability-automation/schema.js',
  'dnd/character_sheet/ability-automation/runner.js',
];

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function loadBrowserScript(window, relativePath) {
  const source = await readFile(path.join(repoRoot, relativePath), 'utf8');
  window.eval(`${source}\n//# sourceURL=${relativePath}`);
}

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.target = init.target || null;
    this.currentTarget = null;
    this.button = init.button || 0;
    this.defaultPrevented = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.items = new Set();
  }

  add(...names) {
    names.filter(Boolean).forEach((name) => this.items.add(name));
    this.owner.attributes.class = [...this.items].join(' ');
  }

  remove(...names) {
    names.filter(Boolean).forEach((name) => this.items.delete(name));
    this.owner.attributes.class = [...this.items].join(' ');
  }

  contains(name) {
    return this.items.has(name);
  }

  setFromString(value) {
    this.items = new Set(String(value || '').split(/\s+/).filter(Boolean));
    this.owner.attributes.class = [...this.items].join(' ');
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.listeners = {};
    this.classList = new FakeClassList(this);
    this.disabled = false;
    this.textContent = '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set innerHTML(value) {
    this.children = parseHtmlIntoElements(String(value || ''), this.ownerDocument, this);
    this.textContent = stripTags(value);
  }

  get innerHTML() {
    return '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child);
    child.parentNode = null;
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  setAttribute(name, value) {
    const key = String(name);
    this.attributes[key] = String(value ?? '');
    if (key === 'class') this.classList.setFromString(value);
    if (key === 'disabled') this.disabled = true;
  }

  getAttribute(name) {
    const key = String(name);
    return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type]?.delete(listener);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners[event.type] || []) {
      listener.call(this, event);
    }
    if (event.bubbles !== false && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent(new FakeEvent('click', { target: this }));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const selectors = String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectors.some((part) => matchesSelector(child, part))) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 360, bottom: 240, width: 360, height: 240 };
  }
}

class FakeDocument {
  constructor() {
    this.listeners = {};
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.body.querySelector(`#${id}`);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type]?.delete(listener);
  }
}

function createFakeWindow() {
  const document = new FakeDocument();
  const timers = new Map();
  let nextTimerId = 1;
  const window = {
    document,
    console,
    Element: FakeElement,
    HTMLElement: FakeElement,
    CustomEvent: FakeEvent,
    Event: FakeEvent,
    Math,
    Date,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Promise,
    parseInt,
    parseFloat,
    isFinite,
    innerWidth: 1280,
    innerHeight: 720,
    setTimeout(callback, ms = 0) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, setTimeout(callback, ms));
      return id;
    },
    clearTimeout(id) {
      const timer = timers.get(id);
      if (timer) clearTimeout(timer);
      timers.delete(id);
    },
    requestAnimationFrame(callback) {
      return window.setTimeout(() => callback(Date.now()), 0);
    },
    cancelAnimationFrame(id) {
      window.clearTimeout(id);
    },
    getComputedStyle() {
      return { getPropertyValue: () => '' };
    },
    confirm: () => true,
    close() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
  document.defaultView = window;
  window.window = window;
  window.self = window;
  window.globalThis = window;
  window.eval = (source) => {
    const fn = new Function('window', 'document', 'globalThis', `with (window) {\n${source}\n}`);
    return fn(window, document, window);
  };
  return window;
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseHtmlIntoElements(html, document, parent) {
  const elements = [];
  const tagPattern = /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let match;
  while ((match = tagPattern.exec(html))) {
    if (match[0].startsWith('</')) continue;
    const element = document.createElement(match[1]);
    parseAttributes(match[2]).forEach(([name, value]) => element.setAttribute(name, value));
    element.parentNode = parent;
    elements.push(element);
  }
  return elements;
}

function parseAttributes(source) {
  const attrs = [];
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = attrPattern.exec(source || ''))) {
    attrs.push([match[1], match[2] ?? match[3] ?? match[4] ?? '']);
  }
  return attrs;
}

function matchesSelector(element, selector) {
  const raw = String(selector || '').trim();
  if (!raw) return false;
  if (raw.startsWith('#')) return element.id === raw.slice(1);
  if (raw.startsWith('.')) return element.classList.contains(raw.slice(1));
  const attrMatch = raw.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attrMatch) {
    const value = element.getAttribute(attrMatch[1]);
    return attrMatch[2] === undefined ? value !== null : value === attrMatch[2];
  }
  const tagAttrMatch = raw.match(/^[a-zA-Z][a-zA-Z0-9-]*(\[.+\])$/);
  if (tagAttrMatch) return matchesSelector(element, tagAttrMatch[1]);
  return element.tagName.toLowerCase() === raw.toLowerCase();
}

function normalizeAttributeKey(name) {
  const raw = String(name || '').trim().toLowerCase();
  switch (raw) {
    case 'm':
    case 'might':
      return 'Might';
    case 'a':
    case 'agility':
      return 'Agility';
    case 'r':
    case 'reason':
      return 'Reason';
    case 'i':
    case 'intuition':
      return 'Intuition';
    case 'p':
    case 'presence':
      return 'Presence';
    default:
      return name || '';
  }
}

function collectExtras(value, pathName = 'automation', issues = []) {
  if (!value || typeof value !== 'object') return issues;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExtras(item, `${pathName}[${index}]`, issues));
    return issues;
  }
  if (value._extra && typeof value._extra === 'object') {
    issues.push(`${pathName}: unsupported field(s): ${Object.keys(value._extra).join(', ')}`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === '_extra') continue;
    collectExtras(child, `${pathName}.${key}`, issues);
  }
  return issues;
}

function createRecorder() {
  const all = [];
  const byHook = {
    selectTarget: [],
    selectAreaTarget: [],
    applyDamage: [],
    applyHeal: [],
    applyCondition: [],
    forceMove: [],
    spendHeroicResource: [],
    spendResource: [],
    registerTrigger: [],
    fireTriggerEvent: [],
    postChat: [],
    applyResourceGain: [],
    applySurgeGain: [],
    getRecoveryValueForTarget: [],
    spendRecoveryForTarget: [],
    checkPotency: [],
    checkMark: [],
    checkScopedFlag: [],
    setScopedFlag: [],
    setAura: [],
    showFloatingText: [],
    startTurn: [],
  };
  return {
    all,
    byHook,
    record(name, payload) {
      const entry = { name, payload: clone(payload) };
      all.push(entry);
      if (!byHook[name]) byHook[name] = [];
      byHook[name].push(entry.payload);
      return entry.payload;
    },
  };
}

function createUiDriver(window, script) {
  let stopped = false;
  let acceptedPowerRolls = 0;

  async function tick() {
    const document = window.document;

    const choiceButtons = [...document.querySelectorAll('[data-choice-option]')];
    if (choiceButtons.length) {
      const requested = script.choiceSelections.shift();
      const button = requested
        ? choiceButtons.find((item) => item.getAttribute('data-choice-option') === requested)
        : choiceButtons[0];
      button?.click();
      return;
    }

    const promptButtons = [...document.querySelectorAll('[data-if-prompt-answer]')];
    if (promptButtons.length) {
      const answer = script.promptAnswers.length ? script.promptAnswers.shift() : true;
      const button = promptButtons.find((item) => (
        item.getAttribute('data-if-prompt-answer') === (answer ? 'yes' : 'no')
      ));
      button?.click();
      return;
    }

    const rollButton = document.querySelector('[data-power-roll-roll]');
    const acceptButton = document.querySelector('[data-power-roll-accept]');
    if (rollButton && !acceptButton) {
      rollButton.click();
      return;
    }

    if (acceptButton) {
      const host = document.getElementById('ability-automation-runner');
      if (host && host.getAttribute('data-harness-tier-selected') !== 'true') {
        const requestedTier = script.powerRollTiers[acceptedPowerRolls];
        if (requestedTier) {
          const tierButton = document.querySelector(`[data-select-tier="${requestedTier}"]`);
          if (tierButton && !tierButton.disabled) tierButton.click();
        }
        host.setAttribute('data-harness-tier-selected', 'true');
      }
      acceptButton.click();
      acceptedPowerRolls += 1;
    }
  }

  return {
    stop() {
      stopped = true;
    },
    async run() {
      while (!stopped) {
        await tick();
        await delay(1);
      }
    },
  };
}

function createDefaultTarget(id, name = id) {
  return { id, name, placement: { id, name } };
}

export async function createAbilityAutomationHarness(options = {}) {
  const window = createFakeWindow();

  for (const scriptPath of SCRIPT_PATHS) {
    await loadBrowserScript(window, scriptPath);
  }

  const recorder = createRecorder();
  const baseTargets = options.targets || [
    createDefaultTarget('target-1', 'Target One'),
    createDefaultTarget('target-2', 'Target Two'),
  ];

  function validateAutomation(automation, { strict = true } = {}) {
    const normalized = window.AbilityAutomationSchema.normalizeAutomation(automation);
    const issues = [
      ...(normalized.warnings || []),
      ...collectExtras(normalized),
    ];
    if (strict && issues.length) {
      throw new Error(`Automation validation failed:\n${issues.join('\n')}`);
    }
    return { normalized, issues };
  }

  async function runAutomation(runOptions = {}) {
    const script = {
      targetSelections: [...(runOptions.targetSelections || options.targetSelections || [baseTargets[0]])],
      areaSelections: [...(runOptions.areaSelections || options.areaSelections || [])],
      promptAnswers: [...(runOptions.promptAnswers || options.promptAnswers || [])],
      choiceSelections: [...(runOptions.choiceSelections || options.choiceSelections || [])],
      powerRollTiers: [...(runOptions.powerRollTiers || options.powerRollTiers || [])],
      randomValues: [...(runOptions.randomValues || options.randomValues || [0.45, 0.45])],
      spendHeroicResourceResults: [...(runOptions.spendHeroicResourceResults || options.spendHeroicResourceResults || [])],
      recoveryValueResults: [...(runOptions.recoveryValueResults || options.recoveryValueResults || [])],
      spendRecoveryResults: [...(runOptions.spendRecoveryResults || options.spendRecoveryResults || [])],
      checkPotencyResults: [...(runOptions.checkPotencyResults || options.checkPotencyResults || [])],
      checkMarkResults: [...(runOptions.checkMarkResults || options.checkMarkResults || [])],
      checkScopedFlagResults: [...(runOptions.checkScopedFlagResults || options.checkScopedFlagResults || [])],
    };

    const attrs = {
      Might: 0,
      Agility: 0,
      Reason: 0,
      Intuition: 0,
      Presence: 0,
      ...(options.attributes || {}),
      ...(runOptions.attributes || {}),
    };

    window.Math.random = () => (
      script.randomValues.length ? Number(script.randomValues.shift()) : 0.45
    );

    const context = {
      action: runOptions.action || options.action || { id: 'ability-under-test', name: 'Ability Under Test' },
      automation: runOptions.automation,
      hero: runOptions.hero || options.hero || { name: 'Harness Hero', resource: { value: 0 } },
      heroName: runOptions.heroName || options.heroName || 'Harness Hero',
      sourcePlacement: runOptions.sourcePlacement || options.sourcePlacement || createDefaultTarget('caster-1', 'Harness Hero'),
      sourceTraits: runOptions.sourceTraits || options.sourceTraits || {},
      actionType: runOptions.actionType || options.actionType || '',
      triggerPayload: runOptions.triggerPayload || null,
      suggestedTargetId: runOptions.suggestedTargetId || '',

      selectTarget(config) {
        recorder.record('selectTarget', config);
        return clone(script.targetSelections.shift() || { done: true });
      },
      selectAreaTarget(config) {
        recorder.record('selectAreaTarget', config);
        return clone(script.areaSelections.shift() || { targets: [] });
      },
      cancelTargetSelection() {
        recorder.record('cancelTargetSelection', {});
      },
      cancelAreaSelection() {
        recorder.record('cancelAreaSelection', {});
      },
      applyDamage(payload) {
        recorder.record('applyDamage', payload);
        const target = baseTargets.find((item) => item.id === payload.placementId);
        return {
          name: target?.name || payload.placementId || 'Target',
          amount: payload.amount,
          current: 20 - Number(payload.amount || 0),
          max: 20,
        };
      },
      applyHeal(payload) {
        recorder.record('applyHeal', payload);
        return {
          name: payload.placementId === 'caster-1' ? 'Harness Hero' : payload.placementId,
          change: payload.amount,
          current: 10 + Number(payload.amount || 0),
          max: 20,
          allowTempHp: Boolean(payload.allowTempHp),
        };
      },
      applyCondition(payload) {
        recorder.record('applyCondition', payload);
        return { ok: true };
      },
      forceMove(payload) {
        recorder.record('forceMove', payload);
        return { name: payload.target?.name || payload.targetId, movedDistance: payload.distance };
      },
      spendHeroicResource(payload) {
        recorder.record('spendHeroicResource', payload);
        return clone(script.spendHeroicResourceResults.shift() || {
          spent: payload.amount || 0,
          resource: payload.resource || '',
          current: 0,
        });
      },
      spendResource(action) {
        recorder.record('spendResource', action);
        return { spent: 0 };
      },
      registerTrigger(payload) {
        recorder.record('registerTrigger', payload);
        return { registered: true, abilityId: payload.abilityId, eventType: payload.match?.event || '' };
      },
      fireTriggerEvent(payload) {
        recorder.record('fireTriggerEvent', payload);
      },
      postChat(entry) {
        recorder.record('postChat', entry);
        return true;
      },
      getAttributeBonus(name) {
        return Number(attrs[normalizeAttributeKey(name)] || 0);
      },
      getStrongestAttribute() {
        const entries = Object.entries(attrs);
        const [attribute, bonus] = entries.reduce((best, current) => (
          current[1] > best[1] ? current : best
        ), ['Might', 0]);
        return { attribute, bonus };
      },
      isWinded() {
        return Boolean(runOptions.winded ?? options.winded ?? false);
      },
      getRecoveryValueForTarget(payload) {
        recorder.record('getRecoveryValueForTarget', payload);
        return clone(script.recoveryValueResults.shift() || { recoveryValue: 0 });
      },
      spendRecoveryForTarget(payload) {
        recorder.record('spendRecoveryForTarget', payload);
        return clone(script.spendRecoveryResults.shift() || {
          spent: payload.recoveries || 1,
          recoveryValue: 5,
          currentRecoveries: 0,
          name: payload.placementId || 'Target',
        });
      },
      checkPotency(payload) {
        recorder.record('checkPotency', payload);
        return clone(script.checkPotencyResults.shift() || { passes: false });
      },
      checkMark(payload) {
        recorder.record('checkMark', payload);
        return clone(script.checkMarkResults.shift() || { matched: false });
      },
      checkScopedFlag(payload) {
        recorder.record('checkScopedFlag', payload);
        return clone(script.checkScopedFlagResults.shift() || { set: false });
      },
      setScopedFlag(payload) {
        recorder.record('setScopedFlag', payload);
        return { set: true };
      },
      setAura(payload) {
        recorder.record('setAura', payload);
        return { applied: true, enabled: payload.enabled, radius: payload.radius };
      },
      showFloatingText(payload) {
        recorder.record('showFloatingText', payload);
        return { shown: true };
      },
      startTurn(payload) {
        recorder.record('startTurn', payload);
        if (payload?.preflight) {
          return { started: false, valid: true, accepted: true };
        }
        return { started: true };
      },
    };

    validateAutomation(runOptions.automation, { strict: runOptions.strictValidation ?? true });

    const driver = createUiDriver(window, script);
    const driverPromise = driver.run();
    try {
      await Promise.race([
        window.AbilityAutomationRunner.open(context),
        delay(runOptions.timeoutMs || 1000).then(() => {
          throw new Error('Ability automation test timed out.');
        }),
      ]);
    } finally {
      driver.stop();
      await driverPromise;
      window.AbilityAutomationRunner.close();
    }

    return {
      calls: recorder.byHook,
      callLog: recorder.all,
      document: window.document,
    };
  }

  return {
    window,
    calls: recorder.byHook,
    callLog: recorder.all,
    validateAutomation,
    runAutomation,
    close() {
      window.close();
    },
  };
}
