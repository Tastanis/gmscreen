/* Site pages inside a Table window (html.in-table). Loaded by the Table after the page; every step is a no-op
   when its elements are missing, so a page that changes later just loses the extra, never breaks.
   - theme: follows the sheet's switch (localStorage 'sheet-theme', Diablo by default), not the dashboard's;
   - page class (html.pe-<page>) so pages-embed.css can scope per page;
   - people cards: the key facts (clubs, role, job) on the card, read from the page's own loaded list. */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root || root.__peDone) return;
  root.__peDone = true;
  root.classList.add('in-table');

  // ---------------------------------------------------------------- which page
  var path = location.pathname.toLowerCase();
  var PAGES = [
    [/\/strixhaven\/students\//, 'students people roster'], [/\/strixhaven\/staff\//, 'staff people roster'], [/\/strixhaven\/othernpcs\//, 'npcs people roster'],
    [/\/schedule\//, 'schedule'], [/\/strixhaven\/gm\//, 'gm'], [/\/rules\//, 'rules'],
    [/\/strixhaven\/locations\//, 'locations roster'], [/\/strixhaven\/templates\//, 'templates'], [/\/players\.php/, 'players']
  ];
  var page = '';
  PAGES.forEach(function (p) { if (!page && p[0].test(path)) page = p[1]; });
  page.split(' ').forEach(function (c) { if (c) root.classList.add('pe-' + c); });

  // ---------------------------------------------------------------- theme
  // Pages with the old Diablo skin (people, rules) keep using it for colours: it is switched on/off with the sheet theme.
  var OLD_SKIN = /people|rules/.test(page);
  function stored() { try { return localStorage.getItem('sheet-theme') === 'parchment' ? 'parchment' : 'diablo'; } catch (_) { return 'diablo'; } }
  function current() { return root.classList.contains('parchment') ? 'parchment' : root.classList.contains('diablo') ? 'diablo' : ''; }
  var syncing = false;
  function apply(theme) {
    syncing = true;
    root.classList.toggle('diablo', theme === 'diablo');
    root.classList.toggle('parchment', theme === 'parchment');
    var dark = OLD_SKIN && theme === 'diablo';
    root.classList.toggle('diablo-theme', dark);
    if (document.body) document.body.classList.toggle('diablo-theme', dark);
    syncing = false;
  }
  function sync() { apply(current() || stored()); }
  sync();
  if (!document.body) document.addEventListener('DOMContentLoaded', sync);
  // The Table may swap the diablo/parchment class; the dashboard's loader may re-apply its own theme on a storage event.
  try {
    new MutationObserver(function () { if (!syncing) sync(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  } catch (_) { /* old browser */ }
  window.addEventListener('storage', function (e) {
    if (e.key === 'sheet-theme') apply(stored());
    else if (e.key === 'dnd-dashboard-theme' || e.key === null) setTimeout(sync, 0);
  });
  // No drifting embers in a window (Diablo/theme.js stops on a 'classic' theme change).
  function stopEmbers() {
    try { document.dispatchEvent(new CustomEvent('themechange', { detail: { themeName: 'classic', previousTheme: 'diablo' } })); } catch (_) { /* no-op */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stopEmbers); else stopEmbers();

  // ---------------------------------------------------------------- people cards: key facts on the card
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var PEOPLE = {
    students: { grid: 'students-grid', card: 'student-card', attr: 'data-student-id', id: 'student_id', list: function () { return window.allStudents; },
      tags: function (s) { return [].concat(s.clubs || []).concat(s.job ? [s.job] : []); } },
    staff: { grid: 'staff-grid', card: 'staff-card', attr: 'data-staff-id', id: 'staff_id', list: function () { return window.allStaff; },
      tags: function (s) { return [s.title, s.role].filter(Boolean); } },
    npcs: { grid: 'npcs-grid', card: 'npc-card', attr: 'data-npc-id', id: 'npc_id', list: function () { return window.allNpcs; },
      tags: function (s) { return [s.college && s.school ? s.college : ''].filter(Boolean); } }
  };
  var cfg = PEOPLE[page.split(' ')[0]];
  /** "rune decoders" -> "Rune Decoders" for display (the chips get the same through CSS text-transform). */
  function titleCase(t) { return String(t).replace(/(^|[\s(/-])([a-z])/g, function (_, a, b) { return a + b.toUpperCase(); }); }
  function tagCards() {
    var grid = cfg && document.getElementById(cfg.grid), list = cfg && cfg.list();
    if (!grid || !Array.isArray(list)) return;
    var byId = {};
    list.forEach(function (x) { if (x && x[cfg.id]) byId[x[cfg.id]] = x; });
    grid.querySelectorAll('.' + cfg.card + ':not([data-pe])').forEach(function (card) {
      card.setAttribute('data-pe', '1');
      var item = byId[card.getAttribute(cfg.attr)];
      var tags = item ? cfg.tags(item).map(function (t) { return String(t).trim(); }).filter(Boolean) : [];
      if (!tags.length) return;
      // One tag in full and "+N" for the rest (several cut to "Dr…" read as nothing); every tag in the tooltip.
      var row = document.createElement('div');
      row.className = 'pe-tags';
      row.title = tags.map(titleCase).join(' · ');
      row.innerHTML = '<span>' + esc(tags[0]) + '</span>' + (tags.length > 1 ? '<span class="pe-more">+' + (tags.length - 1) + '</span>' : '');
      card.appendChild(row);
    });
  }
  function watchGrid() {
    var grid = cfg && document.getElementById(cfg.grid);
    if (!grid) return;
    tagCards();
    try { new MutationObserver(tagCards).observe(grid, { childList: true }); } catch (_) { /* no-op */ }
  }
  if (cfg) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchGrid); else watchGrid(); }

  // ---------------------------------------------------------------- tool buttons: icon + label, so narrow windows show just the icon
  // The page may rewrite a button's text (e.g. the export button while selecting); it is split again when it does.
  var ICONS = { 'btn-add': '+', 'btn-import': '📥', 'btn-export': '📤' };
  function iconify(btn) {
    if (btn.querySelector('.pe-lbl') || btn.children.length) return;
    var text = (btn.textContent || '').trim(), m = text.match(/^([^\w\s(]+)\s*(.+)$/);
    var icon = m ? m[1] : '', label = m ? m[2] : text;
    if (!icon) Object.keys(ICONS).forEach(function (k) { if (!icon && btn.classList.contains(k)) icon = ICONS[k]; });
    if (!icon || !label) return;
    if (!btn.title) btn.title = label;
    btn.setAttribute('aria-label', label);
    var short = label.split(' ')[0];
    btn.innerHTML = '<i class="pe-ico" aria-hidden="true">' + esc(icon) + '</i><span class="pe-lbl">' + esc(label) + '</span>'
      + '<span class="pe-short" aria-hidden="true">' + esc(short) + '</span>';
  }
  function iconifyAll() {
    document.querySelectorAll('.admin-controls > button').forEach(function (btn) {
      iconify(btn);
      if (btn.__peObs) return;
      try { btn.__peObs = new MutationObserver(function () { iconify(btn); }); btn.__peObs.observe(btn, { childList: true }); } catch (_) { /* no-op */ }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iconifyAll); else iconifyAll();

  // ---------------------------------------------------------------- rules: gold for defined game terms only
  // The pages mark many phrases (span.mechanic / .highlight / .bonus): conditions and keywords, but also plain emphasis
  // ("one thing on your turn", "can't shift"). Each span is sorted: a defined term (condition, characteristic,
  // Bane/Edge/Surge/Malice/Recovery, named maneuvers, forced movement...) -> .pe-term (gold); a line label ("Maneuver:")
  // -> .pe-label (bold, body colour); anything else -> .pe-plain (plain text).
  var TERM_WORDS = [
    'bleeding', 'dazed', 'frightened', 'grabbed', 'prone', 'restrained', 'slowed', 'taunted', 'weakened', 'dying', 'winded', 'unconscious', 'dead', 'hidden',
    'might', 'agility', 'reason', 'intuition', 'presence',
    '(?:double )?(?:bane|edge)s?', 'surges?', 'malice', 'recover(?:y|ies)', 'recovery value', 'stamina', 'heroic resources?',
    'victory points?(?: \\(vp\\))?', 'vp', 'experience points?', 'xp', 'speed', 'stability', 'size', 'shift(?: \\d+ squares?)?',
    '(?:melee |ranged )?(?:weapon )?free strikes?', 'difficult terrain', 'damaging terrain', 'forced movement', 'force moved', '(?:push|pull|slide) \\d+',
    'interest', 'patience', 'respite', 'critical', 'tier [123]', 'stand up', 'disengage', 'knockback', 'charge', 'defend', 'catch breath', 'escape grab',
    'aid attack', 'saving throws?', 'cover', 'concealment', 'potency', 'difficult', 'damaging'
  ].join('|');
  var TERM_RE = new RegExp('^(?:(?:easy|medium|hard) )?(?:' + TERM_WORDS + ')(?:\\s*(?:,|\\/|or|and)\\s*(?:' + TERM_WORDS + '))*(?: (?:tests?|scores?|rolls?|terrain))?$');
  function ruleTermKind(text) {
    var raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (/:$/.test(raw)) return 'label';
    var t = raw.toLowerCase().replace(/[‘’]/g, "'").replace(/[.,;!]+$/, '').replace(/^[+\-−]?\d+\s+/, '');
    return TERM_RE.test(t) ? 'term' : 'plain';
  }
  window.__peRuleTermKind = ruleTermKind; // for checks from the console
  function markRuleTerms() {
    document.querySelectorAll('span.mechanic, span.highlight, span.bonus').forEach(function (el) {
      if (el.hasAttribute('data-pe-term')) return;
      var kind = ruleTermKind(el.textContent);
      el.setAttribute('data-pe-term', kind);
      el.classList.add('pe-' + kind);
    });
  }

  // ---------------------------------------------------------------- schedule helpers
  // Block names too long for the narrow time column, shortened on screen (the cell's tooltip keeps the full label).
  var SHORT_WHEN = { 'sleeping/cramming': 'Sleep/Cram' };
  // A week with nothing in any cell says so above the grid. The page fills the cells, then sets its save status; this
  // script may arrive after that first load, so it also checks a moment after the page has loaded.
  function watchEmptyWeek() {
    var status = document.getElementById('saveStatus');
    var first = document.querySelector('.character-section');
    if (!first || !document.querySelector('.schedule-input') || document.querySelector('.pe-empty-week')) return;
    var note = document.createElement('div');
    note.className = 'pe-empty-week';
    note.setAttribute('role', 'status');
    note.textContent = 'Nothing scheduled this week';
    note.hidden = true;
    first.parentNode.insertBefore(note, first);
    var loaded = !status;
    function check(fromLoad) {
      if (!loaded) return;
      var any = false;
      document.querySelectorAll('.schedule-input').forEach(function (el) { if (!any && String(el.value || '').trim()) any = true; });
      note.hidden = any;
      if (fromLoad) foldEmptyHeroes();
    }
    if (status) {
      try { new MutationObserver(function () { loaded = true; check(true); }).observe(status, { childList: true, characterData: true, subtree: true }); } catch (_) { loaded = true; }
    }
    document.addEventListener('input', function (e) { if (e.target && e.target.classList && e.target.classList.contains('schedule-input')) check(false); });
    function settle() { setTimeout(function () { loaded = true; check(true); }, 1200); }
    if (document.readyState === 'complete') settle(); else window.addEventListener('load', settle);
    check(true);
  }

  // The Director's view: a hero whose whole week is blank folds into one line ("Indigo: no plans this week"); a click
  // opens the grid to type in. Re-checked after each load or save (the page's save status changes), never while
  // typing: a grid opened by hand stays open for that week, even emptied. Players' own single grid is left as it is.
  var foldWeek = '';
  function foldEmptyHeroes() {
    var week = (document.querySelector('.week-number') || {}).textContent || '';
    var newWeek = week !== foldWeek;
    foldWeek = week;
    document.querySelectorAll('.character-section').forEach(function (section) {
      var name = section.querySelector('.character-name');
      var inputs = section.querySelectorAll('.schedule-input');
      if (!name || !inputs.length) return;
      if (newWeek) section.removeAttribute('data-pe-opened');
      var line = section.querySelector('.pe-hero-empty');
      if (!line) {
        line = document.createElement('button');
        line.type = 'button';
        line.className = 'pe-hero-empty';
        line.setAttribute('aria-expanded', 'false');
        line.innerHTML = '<b>' + esc(name.textContent.trim()) + '</b><span>: no plans this week</span><i>+ Add plans</i>';
        line.title = 'Open ' + name.textContent.trim() + '’s week to type plans in';
        line.addEventListener('click', function () {
          section.setAttribute('data-pe-opened', '1');
          section.classList.remove('pe-folded');
          line.setAttribute('aria-expanded', 'true');
          var first = section.querySelector('.schedule-input');
          if (first) first.focus();
        });
        name.parentNode.insertBefore(line, name.nextSibling);
      }
      var blank = true;
      inputs.forEach(function (el) { if (blank && String(el.value || '').trim()) blank = false; });
      var fold = blank && !section.hasAttribute('data-pe-opened');
      section.classList.toggle('pe-folded', fold);
      line.setAttribute('aria-expanded', String(!fold));
    });
  }

  // ---------------------------------------------------------------- page-specific moves (each a no-op when its parts are missing)
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(function () {
    // Rules: a heading's leading emoji (🛡️ 💥 📚 ...) gets the icon class, so it is toned to the gold palette.
    if (page === 'rules') {
      markRuleTerms();
      document.querySelectorAll('h1, h2, h3').forEach(function (h) {
        var t = h.firstChild;
        if (!t || t.nodeType !== 3 || h.querySelector('.pe-ico')) return;
        var m = t.nodeValue.match(/^(\s*)([^\w\s(]+)\s+/);
        if (!m) return;
        var ico = document.createElement('i');
        ico.className = 'pe-ico'; ico.setAttribute('aria-hidden', 'true'); ico.textContent = m[2];
        t.nodeValue = t.nodeValue.slice(m[0].length);
        h.insertBefore(ico, t);
      });
    }
    // Schedule: the save status joins the week bar, so the grid starts right under it.
    if (page === 'schedule') {
      var bar = document.querySelector('.week-navigation'), status = document.getElementById('saveStatus');
      if (bar && status && !bar.contains(status)) bar.appendChild(status);
      // "Ready" is the page's autosave light (schedule.js): Saving… / Saved / Ready / an error. Say so.
      if (status) {
        status.title = 'Autosave: each cell saves by itself as you type. "Ready" means everything is saved.';
        status.setAttribute('aria-live', 'polite');
      }
      // No Wednesday column is by design (no Wednesday classes); say so where the missing day would be noticed.
      if (bar && !bar.querySelector('.pe-nowed')) {
        var note = document.createElement('span');
        note.className = 'pe-nowed';
        note.textContent = 'No Wednesday classes';
        if (status && bar.contains(status)) bar.insertBefore(note, status); else bar.appendChild(note);
      }
      // "1st Full Block (Morning)" -> Morning, with "1st · full" under it: the part read at a glance first.
      document.querySelectorAll('.time-label').forEach(function (td) {
        var m = (td.textContent || '').trim().match(/^(\S+)\s+(\S+)\s+Block\s*\((.+)\)$/i);
        if (!m || td.querySelector('.pe-when')) return;
        td.title = td.textContent.trim();
        var when = SHORT_WHEN[m[3].trim().toLowerCase()];
        td.innerHTML = '<b class="pe-when">' + (when ? esc(when) : esc(m[3]).replace(/\//g, '/<wbr>')) + '</b><small>' + esc(m[1] + ' · ' + m[2].toLowerCase()) + '</small>';
      });
      watchEmptyWeek();
    }
  });
})();
