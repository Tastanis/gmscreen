// Monster Automation UI — wiring for the "Automate" button on each ability row
// in the monster creator. Lives separate from monster-builder.js so changes to
// the automation paste flow don't touch the monster builder, and vice versa.
//
// Depends on (loaded earlier on the page):
//   - window.AbilityAutomationPrimitives  (primitives.js)
//   - window.AbilityAutomationSchema      (schema.js)
//   - window.AbilityAutomation            (paste.js — exposes .open())
//   - monsterData                         (monster-builder.js — script-scope `let`)
//   - markMonsterDirty                    (monster-builder.js — function decl)
//
// monster-builder.js declares `let monsterData = {...}` at the script top. In
// classic scripts that creates a Script-scope binding shared across every
// classic script on the page, but it is NOT exposed on `window`. We read it
// through `lookupMonsterData()` which uses direct eval to reach the Script
// scope safely.
//
// Hook points in monster-builder.js are minimal: each ability row renders a
// <button class="monster-automate-btn"> with data-monster-id /
// data-ability-category / data-ability-index. We attach a single delegated
// click handler at document level so dynamic re-renders just work.

(function () {
    'use strict';

    var SUPPORTED_CATEGORIES = [
        'passive',
        'maneuver',
        'action',
        'triggered_action',
        'villain_action',
        'malice'
    ];

    function readyCheck() {
        return !!(window.AbilityAutomation && typeof window.AbilityAutomation.open === 'function');
    }

    // Direct eval inherits the calling lexical scope, so this reaches the
    // Script-scope `monsterData` declared in monster-builder.js. `window.eval`
    // / indirect-eval would NOT — those only see the Global object.
    function lookupMonsterData() {
        try {
            // eslint-disable-next-line no-eval
            return eval('typeof monsterData !== "undefined" ? monsterData : null');
        } catch (e) {
            return null;
        }
    }

    function lookupMarkMonsterDirty() {
        if (typeof window.markMonsterDirty === 'function') return window.markMonsterDirty;
        try {
            // eslint-disable-next-line no-eval
            var fn = eval('typeof markMonsterDirty === "function" ? markMonsterDirty : null');
            return typeof fn === 'function' ? fn : null;
        } catch (e) { return null; }
    }

    function getAbility(monsterId, category, index) {
        var data = lookupMonsterData();
        if (!data || !data.monsters) return null;
        var monster = data.monsters[monsterId];
        if (!monster || !monster.abilities) return null;
        var bucket = monster.abilities[category];
        if (!Array.isArray(bucket)) return null;
        return bucket[index] || null;
    }

    function setAutomation(monsterId, category, index, automation) {
        var ability = getAbility(monsterId, category, index);
        if (!ability) {
            console.warn('[monster-automation-ui] ability not found', monsterId, category, index);
            return false;
        }
        if (!automation || typeof automation !== 'object' || Object.keys(automation).length === 0) {
            delete ability.automation;
        } else {
            ability.automation = automation;
        }
        var mark = lookupMarkMonsterDirty();
        if (mark) mark(monsterId);
        return true;
    }

    function refreshButton(button, hasAutomation) {
        if (!button) return;
        button.classList.toggle('automation-action-btn--configured', !!hasAutomation);
        button.title = hasAutomation ? 'Edit automation JSON' : 'Add automation JSON';
    }

    function handleAutomateClick(event) {
        var button = event.target.closest && event.target.closest('.monster-automate-btn');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();

        if (!readyCheck()) {
            console.warn('[monster-automation-ui] AbilityAutomation paste UI not loaded.');
            alert('Automation editor failed to load. Reload the page.');
            return;
        }

        var monsterId = button.getAttribute('data-monster-id');
        var category = button.getAttribute('data-ability-category');
        var indexAttr = button.getAttribute('data-ability-index');
        var index = parseInt(indexAttr, 10);
        if (!monsterId || SUPPORTED_CATEGORIES.indexOf(category) === -1 || isNaN(index)) {
            console.warn('[monster-automation-ui] missing/invalid hook attributes on button', {
                monsterId: monsterId, category: category, index: indexAttr
            });
            return;
        }

        var ability = getAbility(monsterId, category, index);
        if (!ability) {
            console.warn('[monster-automation-ui] ability lookup failed; was the monster re-rendered?');
            return;
        }

        // paste.js signature: open(actionId, actionType, currentAutomation, onSave)
        // actionId / actionType are opaque to paste — used only for logging /
        // future cross-ability references. We pass meaningful values.
        var actionId = monsterId + ':' + category + ':' + index;
        var currentAutomation = (ability.automation && typeof ability.automation === 'object')
            ? ability.automation
            : null;

        window.AbilityAutomation.open(actionId, category, currentAutomation, function (savedAutomation) {
            // paste.js normalizes the JSON before invoking onSave. A truly
            // empty save (cleared automation) comes through as null or {}.
            var hasAutomation = savedAutomation && typeof savedAutomation === 'object'
                && Object.keys(savedAutomation).length > 0;
            setAutomation(monsterId, category, index, hasAutomation ? savedAutomation : null);
            refreshButton(button, hasAutomation);
        });
    }

    function attach() {
        document.addEventListener('click', handleAutomateClick, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
    } else {
        attach();
    }

    // Expose a tiny debug surface so it's testable from the console.
    window.MonsterAutomationUI = {
        getAbility: getAbility,
        setAutomation: setAutomation,
        refreshButton: refreshButton
    };
})();
