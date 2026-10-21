/*
 * Ask heroes for a test (Brandon, October 2026).
 *
 * The Director picks the heroes and, if he wishes, one or several characteristics. Each player gets a pop-up and
 * picks the rest: a characteristic among those offered (or none), a skill (or none), an edge or a bane, and a
 * typed extra. Nothing is forced. The roll itself is made on the server (dnd/includes/ask-test.php) from the
 * hero's own sheet; this file only shows the forms and what came back.
 *
 * It rides on the chat (js/chat-panel.js starts it and tells it when the tests have changed), so it is on every
 * page the chat is on: the main page, the character sheet and the map.
 */
(function () {
  'use strict';

  const STATS = ['might', 'agility', 'reason', 'intuition', 'presence'];
  const MINUS = '−';
  const EXTRA_LIMIT = 20;
  const OFFERED_SECONDS = 1800;
  const titled = (word) => String(word).charAt(0).toUpperCase() + String(word).slice(1);
  const signed = (n) => (n < 0 ? MINUS + Math.abs(n) : '+' + n);

  // ---- what is said and summed, kept apart from the page so it can be checked on its own ---------------
  const logic = {
    STATS,
    titled,
    signed,

    /** The line under the hero buttons, as [text, bold?] pieces. */
    heroLine(heroes, lit) {
      const asking = heroes.filter((hero) => lit.includes(hero.id)).map((hero) => hero.label);
      const left = heroes.filter((hero) => !lit.includes(hero.id)).map((hero) => hero.label);
      if (!asking.length) return [['Nobody is picked.']];
      const pieces = [['Asking ']];
      asking.forEach((name, index) => {
        if (index) pieces.push([', ']);
        pieces.push([name, true]);
      });
      pieces.push([left.length ? '. Not asking ' + left.join(', ') + '.' : '.']);
      return pieces;
    },

    /** The line under the characteristic buttons. */
    statLine(lit) {
      if (!lit.length) return [['The player picks: '], ['any characteristic', true], [', or none']];
      if (lit.length === 1) return [['The player rolls '], [titled(lit[0]), true], [', or none']];
      const pieces = [['The player picks: ']];
      lit.forEach((name, index) => {
        if (index) pieces.push([' or ']);
        pieces.push([titled(name), true]);
      });
      pieces.push([', or none']);
      return pieces;
    },

    /** The characteristics a player is shown: those the Director lit, or all five when he lit none. */
    offered(lit) {
      const asked = Array.isArray(lit) ? lit : [];
      return asked.length ? STATS.filter((name) => asked.includes(name)) : STATS.slice();
    },

    /** Where the player's pop-up starts: on the one lit, on the hero's best of several, on none when none is lit. */
    startOn(lit, stats) {
      const asked = Array.isArray(lit) ? STATS.filter((name) => lit.includes(name)) : [];
      if (!asked.length) return null;
      return asked.reduce((best, name) => ((stats[name] || 0) > (stats[best] || 0) ? name : best), asked[0]);
    },

    /** The typed extra: "+1", "-2", "3", with a true minus sign too. Anything else is nothing. */
    extra(text) {
      const cleaned = String(text == null ? '' : text).replace(MINUS, '-').replace(/\s+/g, '');
      if (!/^[+-]?\d{1,3}$/.test(cleaned)) return 0;
      return Math.max(-EXTRA_LIMIT, Math.min(EXTRA_LIMIT, parseInt(cleaned, 10)));
    },

    /** What is added to the 2d10. A skill adds only when it is the hero's own: 2, and that skill's own bonus. */
    modifier(pick, sheet) {
      const stats = (sheet && sheet.stats) || {};
      const skills = (sheet && sheet.skills) || {};
      const own = Boolean(pick.skill) && Object.prototype.hasOwnProperty.call(skills, pick.skill);
      return (pick.stat ? stats[pick.stat] || 0 : 0) + (own ? 2 + (skills[pick.skill] || 0) : 0) + (pick.edge || 0) * 2 + logic.extra(pick.extra);
    },

    rollLabel(sum) {
      return sum ? 'Roll 2d10 ' + signed(sum) : 'Roll 2d10';
    },

    /** A rolled row for the Director's list: ["Intuition, no skill: 9 − 1 =", 8, "tier 1"]. */
    rowParts(row) {
      const said = [row.characteristic ? titled(row.characteristic) : 'No characteristic', row.skill ? row.skill : 'no skill'];
      if (row.edge > 0) said.push('edge');
      if (row.edge < 0) said.push('bane');
      if (row.extra) said.push('extra ' + signed(row.extra));
      const dice = (row.dice && row.dice[0] + row.dice[1]) || 0;
      return [said.join(', ') + ': ' + dice + ' ' + (row.modifier < 0 ? MINUS : '+') + ' ' + Math.abs(row.modifier) + ' =', row.total, 'tier ' + row.tier];
    },

    /** What a test asks for, as the Director's list heads it. */
    heading(test, labelOf) {
      const hero = Object.keys(test.rows || {})[0];
      return (test.private ? 'Test, to ' + labelOf(hero) + ' only: ' : 'Test: ') + (test.asks === 'any characteristic' ? 'any characteristic' : test.asks);
    },

    /** The tests still waiting on this hero, oldest first. `elapsed` is the seconds since they were fetched. */
    waitingOn(tests, user, elapsed) {
      return (Array.isArray(tests) ? tests : []).filter((test) => {
        const row = test && test.rows && test.rows[user];
        return Boolean(row) && row.status === 'waiting' && (test.age || 0) + (elapsed || 0) <= OFFERED_SECONDS;
      });
    },

    /** [test id, hero] of every row that has been rolled since `before`. */
    newlyRolled(before, after) {
      const was = new Map((Array.isArray(before) ? before : []).map((test) => [test.id, test]));
      const found = [];
      (Array.isArray(after) ? after : []).forEach((test) => {
        Object.keys(test.rows || {}).forEach((hero) => {
          const old = was.get(test.id);
          if (test.rows[hero].status === 'rolled' && !(old && old.rows && old.rows[hero] && old.rows[hero].status === 'rolled')) found.push([test.id, hero]);
        });
      });
      return found;
    },
  };

  // ---- the page -------------------------------------------------------------------------------------
  let settings = null;
  let host = null;
  let tests = [];
  let fetchedAt = 0;
  let stamp = null;
  let loaded = false;
  let fetching = false;
  let again = false;
  let told = false;
  const open = { form: null, results: null, request: null, chip: null };
  let shownTestId = null;
  // Tests this page has rolled, so that one is not offered again in the moment before the site's list catches up.
  const answered = new Set();

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const slab = (text, extra) => {
    const button = el('button', 'ask-test__slab' + (extra ? ' ' + extra : ''), text);
    button.type = 'button';
    return button;
  };
  const pieces = (node, parts) => {
    node.textContent = '';
    parts.forEach(([text, bold]) => node.appendChild(bold ? el('b', '', text) : document.createTextNode(text)));
  };
  const heroes = () => (settings.participants || []).filter((person) => person && person.id !== 'GM');
  const labelOf = (id) => {
    const found = (settings.participants || []).find((person) => person && person.id === id);
    return (found && found.label) || titled(id || '');
  };

  /** What this browser has been told to leave shut, kept across pages. */
  // A user's other open windows (the map, the sheet, the main page): when a pop-up is settled in one (rolled, closed),
  // it closes in the rest at once (Brandon, October 2026). The server's list catches up a moment later anyway.
  let windows = null;
  const tellWindows = (message) => { try { windows?.postMessage({ ...message, user: settings?.currentUser }); } catch (error) { /* one window only */ } };

  const closed = {
    has(id) {
      try { return JSON.parse(window.localStorage.getItem('askTestClosed') || '[]').includes(id); } catch (error) { return false; }
    },
    add(id) {
      try {
        const list = JSON.parse(window.localStorage.getItem('askTestClosed') || '[]').filter((entry) => entry !== id);
        list.push(id);
        window.localStorage.setItem('askTestClosed', JSON.stringify(list.slice(-40)));
      } catch (error) { /* a browser that keeps nothing still works; the pop-up just comes back */ }
    },
    remove(id) {
      try {
        window.localStorage.setItem('askTestClosed', JSON.stringify(JSON.parse(window.localStorage.getItem('askTestClosed') || '[]').filter((entry) => entry !== id)));
      } catch (error) { /* as above */ }
    },
  };

  async function send(action, fields) {
    const params = new URLSearchParams();
    params.append('action', action);
    Object.keys(fields || {}).forEach((name) => params.append(name, fields[name]));
    try {
      const response = await fetch(settings.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
      const data = await response.json();
      return data && typeof data === 'object' ? data : { success: false, error: 'The site did not answer.' };
    } catch (error) {
      return { success: false, error: 'The site did not answer.' };
    }
  }

  function ensureHost() {
    if (!host) {
      host = el('div', 'ask-test');
      document.body.appendChild(host);
    }
    return host;
  }

  /** A framed pop-up with a title and a close cross. It can be dragged by its title. */
  function panel(titleText, kind, onClose) {
    const node = el('section', 'ask-test__panel ask-test__panel--' + kind);
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-label', titleText);
    const head = el('div', 'ask-test__head');
    const title = el('h2', 'ask-test__title', titleText);
    const cross = el('button', 'ask-test__close', '×');
    cross.type = 'button';
    cross.setAttribute('aria-label', 'Close');
    cross.addEventListener('click', onClose);
    head.appendChild(title);
    head.appendChild(cross);
    node.appendChild(head);
    let drag = null;
    head.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target === cross) return;
      const box = node.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - box.left, y: event.clientY - box.top };
      head.setPointerCapture(event.pointerId);
    });
    head.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const box = node.getBoundingClientRect();
      node.style.left = Math.max(0, Math.min(window.innerWidth - box.width, event.clientX - drag.x)) + 'px';
      node.style.top = Math.max(0, Math.min(window.innerHeight - 40, event.clientY - drag.y)) + 'px';
      node.style.right = 'auto';
      node.style.transform = 'none';
    });
    const drop = (event) => { if (drag && event.pointerId === drag.id) drag = null; };
    head.addEventListener('pointerup', drop);
    head.addEventListener('pointercancel', drop);
    ensureHost().appendChild(node);
    return { node, title };
  }

  function box(labelText) {
    const node = el('div', 'ask-test__box');
    const label = el('div', 'ask-test__label', labelText);
    const slabs = el('div', 'ask-test__slabs');
    node.appendChild(label);
    node.appendChild(slabs);
    return { node, label, slabs };
  }

  function shut(name) {
    if (open[name]) {
      open[name].node.remove();
      open[name] = null;
    }
  }

  // ---- the Director asks ----------------------------------------------------------------------------
  /** `from` is 'map' (the heroes with a token on the map start lit) or anything else (all of them do); `only` is one hero, privately. */
  function openForm({ from = '', only = '' } = {}) {
    if (!settings || !settings.isGM) return;
    shut('form');
    const everyone = heroes();
    let lit = everyone.map((hero) => hero.id);
    if (only) {
      lit = [only];
    } else if (from === 'map' && typeof window.vttHeroesOnMap === 'function') {
      let onMap = [];
      try { onMap = window.vttHeroesOnMap() || []; } catch (error) { onMap = []; }
      lit = everyone.map((hero) => hero.id).filter((id) => onMap.includes(id));
    }
    let stats = [];
    let asking = false;

    const view = panel('Test', 'form', () => shut('form'));
    const heroBox = box(only ? 'Hero, privately' : 'Heroes');
    const heroLine = el('div', 'ask-test__line');
    heroBox.node.appendChild(heroLine);
    const statBox = box('Characteristic');
    const statLine = el('div', 'ask-test__line');
    statBox.node.appendChild(statLine);
    const ask = slab('Ask', 'ask-test__slab--wide');
    const trouble = el('div', 'ask-test__line ask-test__line--trouble');
    trouble.hidden = true;
    view.node.appendChild(heroBox.node);
    view.node.appendChild(statBox.node);
    view.node.appendChild(ask);
    view.node.appendChild(trouble);

    const draw = () => {
      heroBox.slabs.textContent = '';
      (only ? everyone.filter((hero) => hero.id === only) : everyone).forEach((hero) => {
        const button = slab(hero.label, lit.includes(hero.id) ? 'ask-test__slab--on' : '');
        button.setAttribute('aria-pressed', lit.includes(hero.id) ? 'true' : 'false');
        button.dataset.hero = hero.id;
        if (!only) {
          button.addEventListener('click', () => {
            lit = lit.includes(hero.id) ? lit.filter((id) => id !== hero.id) : everyone.map((entry) => entry.id).filter((id) => id === hero.id || lit.includes(id));
            draw();
          });
        }
        heroBox.slabs.appendChild(button);
      });
      pieces(heroLine, only ? [['Asking '], [labelOf(only), true], [' only. Nobody else sees it.']] : logic.heroLine(everyone, lit));
      statBox.slabs.textContent = '';
      STATS.forEach((name) => {
        const button = slab(titled(name), stats.includes(name) ? 'ask-test__slab--on' : '');
        button.setAttribute('aria-pressed', stats.includes(name) ? 'true' : 'false');
        button.dataset.stat = name;
        button.addEventListener('click', () => {
          stats = stats.includes(name) ? stats.filter((entry) => entry !== name) : STATS.filter((entry) => entry === name || stats.includes(entry));
          draw();
        });
        statBox.slabs.appendChild(button);
      });
      pieces(statLine, logic.statLine(stats));
      ask.textContent = lit.length ? 'Ask' : 'Ask (pick a hero)';
      ask.classList.toggle('ask-test__slab--dim', !lit.length || asking);
    };

    ask.addEventListener('click', async () => {
      if (!lit.length || asking) return;
      asking = true;
      trouble.hidden = true;
      draw();
      const answer = await send('chat_test_ask', { heroes: JSON.stringify(lit), characteristics: JSON.stringify(stats), private: only ? '1' : '0' });
      asking = false;
      if (!answer.success) {
        trouble.textContent = answer.error || 'The test was not sent.';
        trouble.hidden = false;
        draw();
        return;
      }
      shut('form');
      take(answer);
      if (answer.id) showResults(answer.id);
    });

    open.form = view;
    draw();
  }

  // ---- what comes back to the Director ----------------------------------------------------------------
  function showResults(id) {
    const test = tests.find((entry) => entry.id === id);
    if (!test) return;
    closed.remove(id);
    if (!open.results || shownTestId !== id) {
      shut('results');
      open.results = panel('', 'results', () => { closed.add(shownTestId); tellWindows({ type: 'results-closed', id: shownTestId }); shut('results'); });
      open.results.table = el('table', 'ask-test__table');
      open.results.node.appendChild(open.results.table);
      shownTestId = id;
    }
    const view = open.results;
    view.title.textContent = logic.heading(test, labelOf);
    view.node.setAttribute('aria-label', view.title.textContent);
    view.table.textContent = '';
    Object.keys(test.rows).forEach((hero) => {
      const row = test.rows[hero];
      const line = el('tr');
      line.dataset.hero = hero;
      line.appendChild(el('td', '', labelOf(hero)));
      const cell = el('td');
      if (row.status === 'rolled') {
        const [lead, total, tier] = logic.rowParts(row);
        cell.appendChild(el('span', 'ask-test__dim', lead + ' '));
        const score = el('span', 'ask-test__score');
        score.appendChild(el('span', 'ask-test__sum', String(total)));
        score.appendChild(el('span', 'ask-test__dim', ' ' + tier));
        cell.appendChild(score);
      } else {
        cell.className = 'ask-test__dim';
        cell.textContent = 'waiting';
      }
      line.appendChild(cell);
      view.table.appendChild(line);
    });
  }

  // ---- the player answers -------------------------------------------------------------------------------
  async function showRequest(test) {
    if (open.request) return;
    const view = panel(test.private ? 'Test, to you only' : 'Test', 'request', () => { if (!view.rolled) closed.add(test.id); tellWindows({ type: view.rolled ? 'request-done' : 'request-closed', id: test.id }); shut('request'); settle(); });
    view.testId = test.id;
    open.request = view;
    shut('chip');
    const waiting = el('div', 'ask-test__line', 'Reading your sheet…');
    view.node.appendChild(waiting);
    const sheet = await send('chat_test_sheet', {});
    if (open.request !== view) return;
    waiting.remove();
    if (!sheet.success) {
      const trouble = el('div', 'ask-test__line ask-test__line--trouble', sheet.error || 'Your sheet could not be read.');
      const retry = slab('Try again', 'ask-test__slab--wide');
      retry.addEventListener('click', () => { shut('request'); showRequest(test); });
      view.node.appendChild(trouble);
      view.node.appendChild(retry);
      return;
    }
    sheet.skills = sheet.skills && !Array.isArray(sheet.skills) ? sheet.skills : {};
    const lit = Array.isArray(test.characteristics) ? test.characteristics : [];
    const pick = { stat: logic.startOn(lit, sheet.stats || {}), group: null, skill: null, edge: 0, extra: '' };
    let rolling = false;

    const statBox = box(lit.length ? 'Characteristic (click it again for none)' : 'Characteristic (yours to pick, or none)');
    const groupBox = box('Skill');
    const skillBox = box('');
    const pair = el('div', 'ask-test__pair');
    const edgeBox = box('Edge or bane');
    const extraBox = box('Extra');
    extraBox.node.classList.add('ask-test__box--extra');
    const extra = el('input', 'ask-test__extra');
    extra.type = 'text';
    extra.placeholder = '+0';
    extra.setAttribute('inputmode', 'text');
    extra.setAttribute('aria-label', 'Extra plus or minus');
    extra.maxLength = 4;
    extraBox.slabs.replaceWith(extra);
    pair.appendChild(edgeBox.node);
    pair.appendChild(extraBox.node);
    const roll = slab('Roll 2d10', 'ask-test__slab--wide');
    const trouble = el('div', 'ask-test__line ask-test__line--trouble');
    trouble.hidden = true;
    [statBox.node, groupBox.node, skillBox.node, pair, roll, trouble].forEach((node) => view.node.appendChild(node));

    const draw = () => {
      statBox.slabs.textContent = '';
      logic.offered(lit).forEach((name) => {
        const button = slab(titled(name), pick.stat === name ? 'ask-test__slab--on' : '');
        button.dataset.stat = name;
        button.setAttribute('aria-pressed', pick.stat === name ? 'true' : 'false');
        button.appendChild(el('span', 'ask-test__plus', signed((sheet.stats && sheet.stats[name]) || 0)));
        button.addEventListener('click', () => { pick.stat = pick.stat === name ? null : name; draw(); });
        statBox.slabs.appendChild(button);
      });
      groupBox.slabs.textContent = '';
      Object.keys(sheet.groups || {}).forEach((group) => {
        const button = slab(group, pick.group === group ? 'ask-test__slab--on' : '');
        button.dataset.group = group;
        button.addEventListener('click', () => {
          if (pick.group !== group) pick.skill = null;
          pick.group = group;
          draw();
        });
        groupBox.slabs.appendChild(button);
      });
      skillBox.node.hidden = !pick.group;
      skillBox.label.textContent = pick.group || '';
      skillBox.slabs.textContent = '';
      ((sheet.groups && sheet.groups[pick.group]) || []).slice().sort((a, b) => a.localeCompare(b)).forEach((skill) => {
        const own = Object.prototype.hasOwnProperty.call(sheet.skills, skill);
        const button = slab(skill, (own ? '' : 'ask-test__slab--plain') + (pick.skill === skill ? ' ask-test__slab--on' : ''));
        button.dataset.skill = skill;
        button.setAttribute('aria-pressed', pick.skill === skill ? 'true' : 'false');
        if (own) button.appendChild(el('span', 'ask-test__star', '★'));
        if (own && sheet.skills[skill]) button.appendChild(el('span', 'ask-test__plus', signed(sheet.skills[skill])));
        button.addEventListener('click', () => { pick.skill = pick.skill === skill ? null : skill; draw(); });
        skillBox.slabs.appendChild(button);
      });
      edgeBox.slabs.textContent = '';
      [['Bane', -1], ['None', 0], ['Edge', 1]].forEach(([text, value]) => {
        const button = slab(text, 'ask-test__slab--tiny' + (pick.edge === value ? ' ask-test__slab--on' : ''));
        button.dataset.edge = String(value);
        button.addEventListener('click', () => { pick.edge = value; draw(); });
        edgeBox.slabs.appendChild(button);
      });
      roll.textContent = logic.rollLabel(logic.modifier(pick, sheet));
      roll.classList.toggle('ask-test__slab--dim', rolling);
    };
    extra.addEventListener('input', () => { pick.extra = extra.value; roll.textContent = logic.rollLabel(logic.modifier(pick, sheet)); });

    roll.addEventListener('click', async () => {
      if (rolling) return;
      rolling = true;
      trouble.hidden = true;
      draw();
      const answer = await send('chat_test_roll', { test: test.id, characteristic: pick.stat || '', skill: pick.skill || '', edge: String(pick.edge), extra: String(logic.extra(pick.extra)) });
      rolling = false;
      if (open.request !== view) return;
      if (!answer.success || !answer.row) {
        trouble.textContent = answer.error || 'The roll was not made.';
        trouble.hidden = false;
        draw();
        if (answer.stamp) refresh();
        return;
      }
      view.rolled = true;
      answered.add(test.id);
      tellWindows({ type: 'request-done', id: test.id });
      [statBox.node, groupBox.node, skillBox.node, pair, roll, trouble].forEach((node) => node.remove());
      const [lead, total, tier] = logic.rowParts(answer.row);
      const result = el('div', 'ask-test__result');
      result.appendChild(el('div', 'ask-test__dim', lead));
      result.appendChild(el('div', 'ask-test__sum ask-test__sum--big', String(total)));
      result.appendChild(el('div', 'ask-test__tier', tier));
      const done = slab('Close', 'ask-test__slab--wide');
      done.addEventListener('click', () => { tellWindows({ type: 'request-done', id: test.id }); shut('request'); settle(); });
      view.node.appendChild(result);
      view.node.appendChild(done);
      refresh();
    });

    draw();
  }

  /** A small button for a test that was shut without a roll, so it can be opened again. */
  function showChip(test) {
    if (open.chip && open.chip.testId === test.id) return;
    shut('chip');
    const node = slab('Test waiting', 'ask-test__chip');
    node.addEventListener('click', () => { closed.remove(test.id); shut('chip'); showRequest(test); });
    ensureHost().appendChild(node);
    open.chip = { node, testId: test.id };
  }

  // ---- keeping up -----------------------------------------------------------------------------------
  // Pop-ups open in the window in use only (Brandon, October 2026: they showed in every open window); another of his
  // windows opens one when it is next used, if it is still unsettled. Settled in one, they close in all (heard).
  let resultsDue = null;
  function inUse() {
    return document.visibilityState !== 'hidden' && (typeof document.hasFocus !== 'function' || document.hasFocus());
  }

  /** Puts on the page whatever the tests now call for. */
  function settle(before) {
    if (!settings || !loaded) return;
    if (settings.isGM) {
      const rolled = before ? logic.newlyRolled(before, tests) : [];
      if (rolled.length) resultsDue = rolled[rolled.length - 1][0];
      if (resultsDue && (inUse() || open.results)) {
        const id = resultsDue;
        resultsDue = null;
        showResults(id);
      } else if (open.results && shownTestId) {
        showResults(shownTestId);
      } else if (!before && tests.length && inUse()) {
        // A page opened while a test is still out: the newest one, unless he shut it.
        const newest = tests[tests.length - 1];
        const stillOut = Object.keys(newest.rows).some((hero) => newest.rows[hero].status === 'waiting');
        if (stillOut && newest.age <= 600 && !closed.has(newest.id)) showResults(newest.id);
      }
      return;
    }
    // A request still open here that was rolled meanwhile (in another window, or on another device) closes; one that
    // shows this window's own result stays until it is closed.
    if (open.request) {
      const stillWaiting = tests.some((test) => test.id === open.request.testId && test.rows?.[settings.currentUser]?.status === 'waiting');
      if (open.request.rolled || stillWaiting) return;
      shut('request');
    }
    const waiting = logic.waitingOn(tests, settings.currentUser, (Date.now() - fetchedAt) / 1000).filter((test) => !answered.has(test.id));
    const fresh = waiting.find((test) => !closed.has(test.id));
    if (fresh && !inUse()) return;   // opens when this window is next used, if still waiting then
    if (fresh) {
      showRequest(fresh);
    } else if (waiting.length) {
      showChip(waiting[0]);
    } else {
      shut('chip');
    }
  }

  /** Takes an answer that carries the tests. */
  function take(answer) {
    if (!answer || !answer.success) return;
    if (answer.stamp) stamp = answer.stamp;
    if (Array.isArray(answer.tests)) {
      const before = loaded ? tests : null;
      tests = answer.tests;
      fetchedAt = Date.now();
      loaded = true;
      settle(before);
    }
  }

  async function refresh() {
    if (!settings) return;
    if (fetching) { again = true; return; }
    fetching = true;
    try {
      take(await send('chat_test_state', stamp && loaded ? { stamp } : {}));
    } finally {
      fetching = false;
      if (again) { again = false; refresh(); }
    }
  }

  /** The chat tells this what mark the tests carry each time it looks; a new mark means something changed. */
  function noticed(mark) {
    told = true;
    if (!settings || typeof mark !== 'string' || mark === '') return;
    if (mark !== stamp || !loaded) refresh();
    else if (!settings.isGM) settle(tests);     // nothing new, but a test left waiting may have grown too old to offer
  }

  // What another of this user's windows settled.
  function heard(message) {
    if (!settings || !message || message.user !== settings.currentUser || typeof message.id !== 'string') return;
    if (message.type === 'results-closed' && resultsDue === message.id) resultsDue = null;
    if (message.type === 'results-closed' && open.results && shownTestId === message.id) { closed.add(message.id); shut('results'); return; }
    if (message.type === 'request-done' || message.type === 'request-closed') {
      if (message.type === 'request-done') answered.add(message.id); else closed.add(message.id);
      if (open.request && open.request.testId === message.id && !open.request.rolled) shut('request');
      settle(tests);
    }
  }

  function start(options) {
    if (settings || !options || typeof options.currentUser !== 'string' || options.currentUser === '') return;
    // Opened here, on a page, not when the file loads.
    try { windows = typeof BroadcastChannel === 'function' ? new BroadcastChannel('dnd-ask-test-v1') : null; } catch (error) { windows = null; }
    windows?.addEventListener?.('message', (event) => heard(event?.data));
    window.addEventListener('focus', () => settle());
    document.addEventListener('visibilitychange', () => { if (inUse()) settle(); });
    settings = { isGM: Boolean(options.isGM), currentUser: options.currentUser, endpoint: options.endpoint || 'chat_handler.php', participants: Array.isArray(options.participants) ? options.participants : [] };
    document.addEventListener('click', (event) => {
      const opener = event.target && event.target.closest ? event.target.closest('[data-ask-test-open]') : null;
      if (opener) openForm({ from: opener.dataset.askTestFrom || '', only: opener.dataset.askTestOnly || '' });
    });
    refresh();
    // If the chat on this page never reports (an old copy of it held by the browser), look every so often.
    window.setTimeout(() => { if (!told) window.setInterval(refresh, 6000); }, 12000);
  }

  window.AskTest = { start, noticed, refresh, openForm, logic };
})();
