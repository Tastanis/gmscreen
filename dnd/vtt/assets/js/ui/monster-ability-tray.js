// Monster Ability Tray — bottom-of-screen launcher for monster abilities.
//
// Mirrors the structure of the PC tray (vtt-character-ability-tray) but as a
// SIBLING module so PC behavior is untouched. Created via
// document.body.appendChild on first use. Driven by the Phase 9 token-select
// router via openFor(placement, monster) / close().
//
// Public surface:
//   window.MonsterAbilityTray.openFor(placement, monster)
//   window.MonsterAbilityTray.close()
//
// Dependencies (looked up at click time, not load time):
//   window.MonsterAbilityRunner   (monster-ability-runner-glue.js)
//   window.canViewMonster         (board-interactions.js, Phase 8 — optional;
//                                  if missing, GM-only is enforced by caller)

(function () {
    'use strict';

    var TRAY_ID = 'vtt-monster-ability-tray';
    var BODY_OPEN_CLASS = 'vtt-monster-ability-tray-is-open';

    var CATEGORIES = [
        { key: 'passive',          label: 'Passive' },
        { key: 'maneuver',         label: 'Maneuver' },
        { key: 'action',           label: 'Action' },
        { key: 'triggered_action', label: 'Triggered' },
        { key: 'villain_action',   label: 'Villain' },
        { key: 'malice',           label: 'Malice' }
    ];

    var MALICE_CATEGORIES = ['villain_action', 'malice'];

    var state = {
        placement: null,
        monster: null,
        activeCategory: null
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureTray() {
        var tray = document.getElementById(TRAY_ID);
        if (!tray) {
            tray = document.createElement('aside');
            tray.id = TRAY_ID;
            tray.className = 'vtt-monster-ability-tray vtt-monster-ability-tray--closed';
            tray.setAttribute('aria-hidden', 'true');
            tray.addEventListener('click', handleTrayClick);
            (document.body || document.documentElement).appendChild(tray);
        }
        return tray;
    }

    function abilitiesFor(monster, categoryKey) {
        if (!monster || !monster.abilities || typeof monster.abilities !== 'object') return [];
        var list = monster.abilities[categoryKey];
        return Array.isArray(list) ? list : [];
    }

    function hasAutomation(ability) {
        var a = ability && ability.automation;
        return !!(a && typeof a === 'object' && Object.keys(a).length > 0);
    }

    function parseMaliceCostDisplay(resourceCost) {
        if (typeof resourceCost !== 'string' || !resourceCost.trim()) return '';
        var m = resourceCost.match(/(\d+)/);
        return m ? m[1] : resourceCost.trim();
    }

    function renderAbilityList(categoryKey, abilities) {
        if (!abilities.length) {
            return '<div class="vtt-monster-ability-empty">No abilities in this category.</div>';
        }
        var showCost = MALICE_CATEGORIES.indexOf(categoryKey) !== -1;
        var rowsHtml = abilities.map(function (ability, index) {
            var canFire = hasAutomation(ability);
            var costText = showCost ? parseMaliceCostDisplay(ability.resource_cost) : '';
            var costHtml = costText
                ? '<span class="vtt-monster-ability-item__cost">' + escapeHtml(costText) + '</span>'
                : '';
            var disabledClass = canFire ? '' : ' vtt-monster-ability-item--disabled';
            var launchAttrs = canFire ? '' : ' disabled aria-disabled="true"';
            var launchTitle = canFire
                ? 'Run automation'
                : 'No automation configured — author in the monster creator';
            return '<div class="vtt-monster-ability-item' + disabledClass +
                '" data-ability-index="' + index + '" data-ability-category="' + escapeHtml(categoryKey) + '">' +
                '<span class="vtt-monster-ability-item__name">' + escapeHtml(ability.name || 'Unnamed') + '</span>' +
                costHtml +
                '<button type="button" class="vtt-monster-ability-item__launch" ' +
                'data-monster-launch ' +
                'data-ability-index="' + index + '" ' +
                'data-ability-category="' + escapeHtml(categoryKey) + '" ' +
                'title="' + escapeHtml(launchTitle) + '"' + launchAttrs + '>&#9654;</button>' +
                '</div>';
        }).join('');
        return '<div class="vtt-monster-ability-list__heading">' + escapeHtml(categoryKey.replace('_', ' ')) + '</div>' +
            rowsHtml;
    }

    function render() {
        var tray = ensureTray();
        if (!state.monster) {
            tray.innerHTML = '';
            tray.classList.add('vtt-monster-ability-tray--closed');
            tray.setAttribute('aria-hidden', 'true');
            document.body && document.body.classList.remove(BODY_OPEN_CLASS);
            return;
        }

        var tabsHtml = CATEGORIES.map(function (cat) {
            var abilities = abilitiesFor(state.monster, cat.key);
            var count = abilities.length;
            var isActive = state.activeCategory === cat.key;
            var listHtml = isActive
                ? '<div class="vtt-monster-ability-list" role="menu">' + renderAbilityList(cat.key, abilities) + '</div>'
                : '';
            return '<div class="vtt-monster-ability-category' + (isActive ? ' is-active' : '') + '">' +
                listHtml +
                '<button type="button" class="vtt-monster-ability-tab" ' +
                'data-monster-tab="' + escapeHtml(cat.key) + '" ' +
                'aria-expanded="' + (isActive ? 'true' : 'false') + '">' +
                '<span class="vtt-monster-ability-tab__label">' + escapeHtml(cat.label) + '</span>' +
                (count > 0 ? '<span class="vtt-monster-ability-tab__count">' + count + '</span>' : '') +
                '</button>' +
                '</div>';
        }).join('');

        tray.innerHTML = '<nav class="vtt-monster-ability-tray__inner" aria-label="Monster abilities">' +
            tabsHtml + '</nav>';
        tray.classList.remove('vtt-monster-ability-tray--closed');
        tray.setAttribute('aria-hidden', 'false');
        document.body && document.body.classList.add(BODY_OPEN_CLASS);
    }

    function handleTrayClick(event) {
        var target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        var tabBtn = target.closest('[data-monster-tab]');
        if (tabBtn) {
            var key = tabBtn.getAttribute('data-monster-tab');
            state.activeCategory = state.activeCategory === key ? null : key;
            render();
            return;
        }

        var launchBtn = target.closest('[data-monster-launch]');
        if (launchBtn && !launchBtn.disabled) {
            var indexAttr = launchBtn.getAttribute('data-ability-index');
            var categoryKey = launchBtn.getAttribute('data-ability-category');
            var index = parseInt(indexAttr, 10);
            if (isNaN(index) || !categoryKey) return;
            launchAbility(categoryKey, index);
        }
    }

    function launchAbility(categoryKey, index) {
        if (!state.monster || !state.placement) return;
        var abilities = abilitiesFor(state.monster, categoryKey);
        var ability = abilities[index];
        if (!ability) return;
        if (!window.MonsterAbilityRunner || typeof window.MonsterAbilityRunner.start !== 'function') {
            console.warn('[MonsterAbilityTray] MonsterAbilityRunner not loaded.');
            return;
        }
        window.MonsterAbilityRunner.start(state.monster, ability, categoryKey, state.placement);
    }

    function openFor(placement, monster) {
        // Visibility gate: monsters are hidden from players unless allied or
        // claimed (window.canViewMonster). GM always passes. If the helper is
        // unavailable for some reason, default to refusing — fail closed.
        if (typeof window.canViewMonster === 'function' && !window.canViewMonster(placement)) {
            close();
            return;
        }
        state.placement = placement || null;
        state.monster = monster || null;
        state.activeCategory = null;
        render();
    }

    function close() {
        state.placement = null;
        state.monster = null;
        state.activeCategory = null;
        render();
    }

    window.MonsterAbilityTray = {
        openFor: openFor,
        close: close
    };
})();
