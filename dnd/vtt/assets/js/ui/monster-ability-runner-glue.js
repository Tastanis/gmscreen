// Monster Ability Runner Glue
//
// Bridges the monster ability tray (Phase 5) to the ability automation runner
// (PC system at dnd/character_sheet/ability-automation/runner.js). Builds a
// monster-flavored context that reuses every VTT board callback the PC runner
// uses today.
//
// Public surface:
//   window.MonsterAbilityRunner.canRun(ability)        -> boolean
//   window.MonsterAbilityRunner.start(monster, ability, category, placement, options)
//
// Cross-module dependencies (consumed at call time, NOT at load time):
//   window.AbilityAutomationRunner   (runner.js)
//   window.VTTBoardCallbacks         (board-interactions.js, exported in Phase 9)
//   window.MaliceTracker             (board-interactions.js, exported in Phase 7)
//   window.dashboardChat             (chat sink — optional)
//
// Monster mechanic notes baked in here (matches Draw Steel rules):
//   - Monster numbers are static (no attribute math). Power rolls should use
//     `flatBonus` (already in the v3 schema) so this glue can safely return 0
//     from getAttributeBonus / getStrongestAttribute.
//   - Heroic resource and recoveries don't exist on monsters. spendResource
//     skips with a chat note.
//   - Villain / malice abilities auto-deduct from the encounter malice pool.
//   - Triggered actions prompt the GM with a confirm dialog before firing.

(function () {
    'use strict';

    var TRIGGERED_CATEGORY = 'triggered_action';
    var MALICE_CATEGORIES = ['villain_action', 'malice'];

    function canRun(ability) {
        if (!ability || typeof ability !== 'object') return false;
        var a = ability.automation;
        return !!(a && typeof a === 'object' && Object.keys(a).length > 0);
    }

    function parseMaliceCost(resourceCost) {
        if (typeof resourceCost !== 'string') return 0;
        var match = resourceCost.match(/(\d+)/);
        if (!match) return 0;
        var n = parseInt(match[1], 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function postChat(entry) {
        try {
            if (window.dashboardChat && typeof window.dashboardChat.sendMessage === 'function') {
                return window.dashboardChat.sendMessage({
                    message: entry.message || '',
                    type: entry.type || 'text',
                    payload: entry.payload || null
                });
            }
        } catch (e) {
            console.warn('[MonsterAbilityRunner] chat post failed', e);
        }
        return null;
    }

    function getBoardCallbacks() {
        return window.VTTBoardCallbacks || {};
    }

    function isWindedFromPlacement(placement) {
        if (!placement) return false;
        var cur = Number(placement.hp);
        var max = Number(placement.maxHp);
        if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return false;
        return cur <= Math.floor(max / 2);
    }

    function buildMonsterContext(monster, ability, category, placement) {
        var board = getBoardCallbacks();
        var actionId = (placement && placement.id ? placement.id : 'monster') +
            ':' + category + ':' + (ability.name || 'ability');

        var action = {
            id: actionId,
            name: ability.name || 'Ability',
            automation: ability.automation || null,
            keywords: typeof ability.keywords === 'string'
                ? ability.keywords.split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean)
                : [],
            description: ability.effect || '',
            range: ability.range || '',
            cost: ability.resource_cost || ''
        };

        var hero = {
            name: monster && monster.name ? monster.name : 'Monster',
            hp: placement ? placement.hp : null,
            maxHp: placement ? placement.maxHp : null,
            stamina: placement ? placement.hp : null,
            maxStamina: placement ? placement.maxHp : null
        };

        // Monster-flavored spendResource: rejects PC-only resources with chat note.
        function spendResource(spec) {
            var resource = spec && spec.resource ? String(spec.resource).toLowerCase() : '';
            if (resource === 'heroic' || resource === 'recovery' || resource === 'recoveries') {
                postChat({
                    message: hero.name + ' has no ' + resource + ' resource — skipped (monsters do not use this).'
                });
                return { skipped: true, reason: 'monster' };
            }
            // Unknown resources also skip with note — monsters don't have arbitrary pools.
            postChat({
                message: hero.name + ' would spend ' + (spec && spec.amount ? spec.amount : 1) +
                    ' ' + (resource || 'resource') + ' — monster pools not tracked, skipping.'
            });
            return { skipped: true, reason: 'monster' };
        }

        return {
            action: action,
            hero: hero,
            automation: ability.automation || null,
            sourceToken: placement || null,
            sourcePlacement: placement || null,
            // Static-number rules: attribute lookups always 0; flatBonus carries
            // the real value in monster-authored powerRoll blocks.
            getAttributeBonus: function () { return 0; },
            getStrongestAttribute: function () { return { attribute: 'Flat', bonus: 0 }; },
            getPotencyThreshold: function () { return 0; },
            isWinded: function () { return isWindedFromPlacement(placement); },
            postChat: postChat,
            spendResource: spendResource,
            // VTT board callbacks (provided by board-interactions.js, Phase 9).
            // We pass them through 1:1 so the runner sees the same surface PCs
            // see. If a callback is missing the runner will fall back to its
            // own internal no-op / chat-reminder paths.
            selectTarget: board.selectTarget,
            selectAreaTarget: board.selectAreaTarget,
            applyDamage: board.applyDamage,
            applyCondition: board.applyCondition,
            checkPotency: board.checkPotency,
            forceMove: board.forceMove,
            applyHeal: board.applyHeal,
            applyTemporaryStamina: board.applyTemporaryStamina,
            cancelTargetSelection: board.cancelTargetSelection,
            registerTrigger: board.registerTrigger
        };
    }

    function confirmTriggeredFire(ability) {
        var name = (ability && ability.name) || 'this triggered action';
        return window.confirm("Fire triggered action '" + name + "' now?");
    }

    function ensureMalice(monster, ability) {
        var cost = parseMaliceCost(ability.resource_cost);
        if (cost <= 0) {
            return { proceed: true, cost: 0 };
        }
        var tracker = window.MaliceTracker;
        if (!tracker || typeof tracker.get !== 'function' || typeof tracker.spend !== 'function') {
            console.warn('[MonsterAbilityRunner] MaliceTracker not available; skipping spend.');
            return { proceed: true, cost: cost, skippedSpend: true };
        }
        var current = tracker.get();
        if (current < cost) {
            var ok = window.confirm(
                'Not enough malice (current ' + current + ', need ' + cost + '). Spend anyway?'
            );
            if (!ok) return { proceed: false, cost: cost };
        }
        tracker.spend(cost);
        postChat({
            message: (monster && monster.name ? monster.name : 'Monster') +
                ' spends ' + cost + ' malice → ' + (ability.name || 'ability')
        });
        return { proceed: true, cost: cost };
    }

    async function start(monster, ability, category, placement, options) {
        if (!canRun(ability)) {
            console.warn('[MonsterAbilityRunner] ability has no automation; aborting.');
            return { aborted: true, reason: 'no-automation' };
        }
        if (!window.AbilityAutomationRunner || typeof window.AbilityAutomationRunner.open !== 'function') {
            console.warn('[MonsterAbilityRunner] AbilityAutomationRunner not loaded.');
            return { aborted: true, reason: 'runner-missing' };
        }

        if (category === TRIGGERED_CATEGORY) {
            if (!confirmTriggeredFire(ability)) {
                return { aborted: true, reason: 'triggered-cancelled' };
            }
        }

        if (MALICE_CATEGORIES.indexOf(category) !== -1) {
            var maliceResult = ensureMalice(monster, ability);
            if (!maliceResult.proceed) {
                return { aborted: true, reason: 'malice-cancelled' };
            }
        }

        var context = buildMonsterContext(monster, ability, category, placement);
        if (options && typeof options === 'object') {
            for (var key in options) {
                if (Object.prototype.hasOwnProperty.call(options, key)) {
                    context[key] = options[key];
                }
            }
        }

        try {
            return await window.AbilityAutomationRunner.open(context);
        } catch (err) {
            console.error('[MonsterAbilityRunner] runner threw', err);
            return { aborted: true, reason: 'runner-error', error: err };
        }
    }

    window.MonsterAbilityRunner = {
        canRun: canRun,
        start: start,
        // Test surface — handy from the console.
        _parseMaliceCost: parseMaliceCost,
        _buildContext: buildMonsterContext
    };
})();
