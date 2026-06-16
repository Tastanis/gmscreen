// Monster Ability Tray - bottom-of-screen launcher for monster abilities.
//
// Mirrors the PC tray DOM and interaction model, with monster-specific
// categories and malice costs.

(function () {
    'use strict';

    var TRAY_ID = 'vtt-monster-ability-tray';
    var PREVIEW_ID = 'vtt-monster-ability-preview';
    var BODY_OPEN_CLASS = 'vtt-monster-ability-tray-is-open';

    var CATEGORIES = [
        { key: 'passive',          label: 'Passive',   heading: 'Passive Abilities' },
        { key: 'maneuver',         label: 'Maneuver',  heading: 'Maneuvers' },
        { key: 'action',           label: 'Action',    heading: 'Actions' },
        { key: 'triggered_action', label: 'Triggered', heading: 'Triggered Actions' },
        { key: 'villain_action',   label: 'Villain',   heading: 'Villain Actions' },
        { key: 'malice',           label: 'Malice',    heading: 'Malice Abilities' }
    ];

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

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/`/g, '&#96;');
    }

    function ensureTray() {
        var tray = document.getElementById(TRAY_ID);
        if (!tray) {
            tray = document.createElement('aside');
            tray.id = TRAY_ID;
            tray.className = 'vtt-character-ability-tray vtt-monster-ability-tray vtt-monster-ability-tray--closed';
            tray.setAttribute('aria-hidden', 'true');
            tray.addEventListener('click', handleTrayClick);
            tray.addEventListener('pointerover', handleTrayPreviewOpen);
            tray.addEventListener('pointerout', handleTrayPreviewClose);
            tray.addEventListener('focusin', handleTrayPreviewOpen);
            tray.addEventListener('focusout', handleTrayPreviewClose);
            (document.body || document.documentElement).appendChild(tray);
        }
        return tray;
    }

    function ensurePreview() {
        var preview = document.getElementById(PREVIEW_ID);
        if (!preview) {
            preview = document.createElement('aside');
            preview.id = PREVIEW_ID;
            preview.className = 'vtt-character-ability-preview vtt-monster-ability-preview';
            preview.setAttribute('aria-hidden', 'true');
            (document.body || document.documentElement).appendChild(preview);
        }
        return preview;
    }

    function abilitiesFor(monster, categoryKey) {
        if (!monster || !monster.abilities || typeof monster.abilities !== 'object') return [];
        var list = monster.abilities[categoryKey];
        return Array.isArray(list) ? list : [];
    }

    function hasAutomation(ability) {
        var automation = ability && ability.automation;
        return Boolean(automation && typeof automation === 'object' && Object.keys(automation).length > 0);
    }

    function getVisibleCategories(monster) {
        return CATEGORIES.map(function (cat) {
            return {
                key: cat.key,
                label: cat.label,
                heading: cat.heading,
                abilities: abilitiesFor(monster, cat.key)
            };
        }).filter(function (cat) {
            return cat.abilities.length > 0;
        });
    }

    function renderAbilityList(category) {
        var categoryKey = category.key;
        var ready = Array.isArray(state.placement && state.placement.readyTriggerAbilities)
            ? state.placement.readyTriggerAbilities
            : [];
        var rowsHtml = category.abilities.map(function (ability, index) {
            var automated = hasAutomation(ability);
            var meta = summarizeAbility(ability, categoryKey);
            var triggerId = getMonsterAbilityTriggerId(categoryKey, ability);
            var isReadyTrigger = triggerId && ready.indexOf(triggerId) !== -1;
            return '<button type="button" role="menuitem" ' +
                'class="vtt-character-ability-item vtt-monster-ability-item' +
                    (automated ? ' vtt-character-ability-item--automated vtt-monster-ability-item--automated' : '') +
                    (isReadyTrigger ? ' vtt-character-ability-item--trigger-ready vtt-monster-ability-item--trigger-ready' : '') + '" ' +
                'data-monster-ability-item ' +
                'data-ability-index="' + escapeAttribute(index) + '" ' +
                'data-ability-category="' + escapeAttribute(categoryKey) + '" ' +
                (isReadyTrigger ? 'data-clears-trigger="' + escapeAttribute(triggerId) + '" ' : '') + '>' +
                '<span class="vtt-character-ability-item__mark" aria-hidden="true">' + escapeHtml(getAbilityIcon(categoryKey)) + '</span>' +
                '<span class="vtt-character-ability-item__text">' +
                '<span class="vtt-character-ability-item__name">' + escapeHtml(ability.name || 'Unnamed') + '</span>' +
                (meta ? '<span class="vtt-character-ability-item__meta">' + escapeHtml(meta) + '</span>' : '') +
                '</span>' +
                (automated ? '<span class="vtt-character-ability-item__auto" title="Automated" aria-label="Automated">A</span>' : '') +
                '<span class="vtt-character-chat-dot" role="button" tabindex="0" ' +
                    'data-monster-chat-post="ability" ' +
                    'data-ability-index="' + escapeAttribute(index) + '" ' +
                    'data-ability-category="' + escapeAttribute(categoryKey) + '" ' +
                    'aria-label="Post ability to chat" title="Post to chat"></span>' +
                '</button>';
        }).join('');

        return '<div class="vtt-character-ability-list vtt-monster-ability-list" role="menu" aria-label="' + escapeAttribute(category.heading) + '">' +
            '<div class="vtt-character-ability-list__heading vtt-monster-ability-list__heading">' + escapeHtml(category.heading) + '</div>' +
            rowsHtml +
            '</div>';
    }

    function render() {
        var tray = ensureTray();
        var categories = state.monster ? getVisibleCategories(state.monster) : [];
        if (!state.monster || !categories.length) {
            tray.innerHTML = '';
            tray.classList.add('vtt-monster-ability-tray--closed');
            tray.classList.remove('vtt-character-ability-tray--open');
            tray.setAttribute('aria-hidden', 'true');
            document.body && document.body.classList.remove(BODY_OPEN_CLASS);
            hidePreview();
            return;
        }

        if (state.activeCategory && !categories.some(function (cat) { return cat.key === state.activeCategory; })) {
            state.activeCategory = null;
        }

        var tabsHtml = categories.map(function (cat) {
            var isActive = state.activeCategory === cat.key;
            return '<div class="vtt-character-ability-category vtt-monster-ability-category' + (isActive ? ' is-active' : '') + '">' +
                (isActive ? renderAbilityList(cat) : '') +
                '<button type="button" class="vtt-character-ability-tab vtt-monster-ability-tab" ' +
                'data-monster-tab="' + escapeAttribute(cat.key) + '" ' +
                'aria-expanded="' + (isActive ? 'true' : 'false') + '">' +
                '<span class="vtt-character-ability-tab__label vtt-monster-ability-tab__label">' + escapeHtml(cat.label) + '</span>' +
                '</button>' +
                '</div>';
        }).join('');

        tray.innerHTML = '<nav class="vtt-character-ability-tray__inner vtt-monster-ability-tray__inner" aria-label="Monster abilities">' +
            tabsHtml +
            '</nav>';
        tray.classList.remove('vtt-monster-ability-tray--closed');
        tray.classList.add('vtt-character-ability-tray--open');
        tray.setAttribute('aria-hidden', 'false');
        document.body && document.body.classList.add(BODY_OPEN_CLASS);
    }

    function handleTrayClick(event) {
        var target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        var chatPost = target.closest('[data-monster-chat-post]');
        if (chatPost) {
            event.preventDefault();
            event.stopPropagation();
            var postIndex = parseInt(chatPost.getAttribute('data-ability-index'), 10);
            var postCategory = chatPost.getAttribute('data-ability-category');
            if (!isNaN(postIndex) && postCategory) {
                postAbilityToChat(postCategory, postIndex);
            }
            return;
        }

        var tabBtn = target.closest('[data-monster-tab]');
        if (tabBtn) {
            var key = tabBtn.getAttribute('data-monster-tab');
            state.activeCategory = state.activeCategory === key ? null : key;
            hidePreview();
            render();
            return;
        }

        var abilityItem = target.closest('[data-monster-ability-item]');
        if (!abilityItem) return;
        var index = parseInt(abilityItem.getAttribute('data-ability-index'), 10);
        var categoryKey = abilityItem.getAttribute('data-ability-category');
        if (isNaN(index) || !categoryKey) return;
        var ability = abilitiesFor(state.monster, categoryKey)[index];
        if (!hasAutomation(ability)) return;
        state.activeCategory = null;
        hidePreview();
        render();
        launchAbility(categoryKey, index, {
            clearsTrigger: abilityItem.getAttribute('data-clears-trigger') || ''
        });
    }

    function handleTrayPreviewOpen(event) {
        var target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        var item = target.closest('[data-monster-ability-item]');
        if (!item || !state.monster) return;
        var index = parseInt(item.getAttribute('data-ability-index'), 10);
        var categoryKey = item.getAttribute('data-ability-category');
        if (isNaN(index) || !categoryKey) return;
        var ability = abilitiesFor(state.monster, categoryKey)[index];
        if (ability) renderPreview(ability, categoryKey);
    }

    function handleTrayPreviewClose(event) {
        var target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        var item = target.closest('[data-monster-ability-item]');
        if (!item || item.contains(event.relatedTarget)) return;
        hidePreview();
    }

    function renderPreview(ability, categoryKey) {
        var preview = ensurePreview();
        var category = CATEGORIES.find(function (cat) { return cat.key === categoryKey; }) || {};
        var title = ability.name || 'Unnamed Ability';
        var keywords = typeof ability.keywords === 'string'
            ? ability.keywords.split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean)
            : [];
        preview.innerHTML = '<article class="vtt-character-ability-card vtt-monster-ability-card">' +
            '<header class="vtt-character-ability-card__header">' +
            '<h2>' + escapeHtml(title) + '</h2>' +
            (ability.resource_cost ? '<span class="vtt-character-ability-card__cost">' + escapeHtml(ability.resource_cost) + '</span>' : '') +
            '</header>' +
            '<div class="vtt-character-ability-card__type">' +
            '<strong>' + escapeHtml(category.label || 'Ability') + '</strong>' +
            (keywords.length ? '<span>' + escapeHtml(keywords.join(', ')) + '</span>' : '') +
            '</div>' +
            renderAbilityMeta(ability, categoryKey) +
            renderAbilityText(ability) +
            renderAbilityTest(ability.test) +
            '</article>';
        preview.setAttribute('aria-hidden', 'false');
        preview.classList.add('vtt-character-ability-preview--open');
    }

    function renderAbilityMeta(ability, categoryKey) {
        var entries = [
            ['Range', ability.range],
            ['Target', ability.targets],
            categoryKey === 'triggered_action' ? ['Trigger', ability.trigger] : null
        ].filter(function (entry) {
            return entry && typeof entry[1] === 'string' && entry[1].trim();
        });
        if (!entries.length) return '';
        return '<dl class="vtt-character-ability-card__meta">' +
            entries.map(function (entry) {
                return '<div><dt>' + escapeHtml(entry[0]) + '</dt><dd>' + escapeHtml(entry[1]) + '</dd></div>';
            }).join('') +
            '</dl>';
    }

    function renderAbilityText(ability) {
        var parts = [];
        if (ability.effect) parts.push(ability.effect);
        if (ability.additional_effect) parts.push(ability.additional_effect);
        if (!parts.length) return '';
        return '<div class="vtt-character-ability-card__description">' +
            parts.map(function (text) { return '<p>' + formatText(text) + '</p>'; }).join('') +
            '</div>';
    }

    function renderAbilityTest(test) {
        if (!test || typeof test !== 'object') return '';
        var labels = { tier1: '<= 11', tier2: '12-16', tier3: '17+' };
        var rows = ['tier1', 'tier2', 'tier3'].map(function (tier) {
            var entry = test[tier];
            if (!entry || typeof entry !== 'object') return '';
            var pieces = [];

            // Damage clause: "5 fire damage" / "5 damage"
            var dmgAmount = (entry.damage_amount || '').toString().trim();
            if (dmgAmount) {
                var dmgType = (entry.damage_type || '').toString().trim();
                pieces.push(dmgAmount + (dmgType ? ' ' + dmgType : '') + ' damage');
            }

            // Potency clause: "M<2 prone"
            var attr = (entry.attribute || '').toString().trim();
            var attrEffect = (entry.attribute_effect || '').toString().trim();
            if (attrEffect) {
                var attrInitial = attr ? attr.charAt(0).toUpperCase() : '';
                var threshold = entry.attribute_threshold;
                var threshStr = (threshold !== undefined && threshold !== null && threshold !== '')
                    ? String(threshold) : '';
                if (attrInitial && threshStr) {
                    pieces.push(attrInitial + '<' + threshStr + ' ' + attrEffect);
                } else {
                    pieces.push(attrEffect);
                }
            }

            // Free-text tier effect (older field name some importers use)
            if (entry.effect) pieces.push(entry.effect);

            if (!pieces.length) return '';
            var text = pieces.join('; ');
            return '<div><span>' + escapeHtml(labels[tier]) + '</span><p>' + formatText(text) + '</p></div>';
        }).filter(Boolean).join('');
        if (!rows) return '';
        return '<div class="vtt-character-ability-test"><header><strong>Power Roll</strong></header>' +
            '<div class="vtt-character-ability-test__tiers">' + rows + '</div></div>';
    }

    function hidePreview() {
        var preview = document.getElementById(PREVIEW_ID);
        if (!preview) return;
        preview.setAttribute('aria-hidden', 'true');
        preview.classList.remove('vtt-character-ability-preview--open');
    }

    function summarizeAbility(ability, categoryKey) {
        var parts = [];
        var category = CATEGORIES.find(function (cat) { return cat.key === categoryKey; });
        if (category && category.label) parts.push(category.label);
        if (ability && ability.resource_cost) parts.push(ability.resource_cost);
        if (ability && ability.keywords) {
            parts.push(String(ability.keywords).split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 3).join(', '));
        }
        if (ability && ability.range) parts.push('Range ' + ability.range);
        return parts.filter(Boolean).join(' - ');
    }

    function postAbilityToChat(categoryKey, index) {
        var ability = abilitiesFor(state.monster, categoryKey)[index];
        if (!ability || !window.dashboardChat || typeof window.dashboardChat.sendMessage !== 'function') {
            return false;
        }
        return window.dashboardChat.sendMessage({
            message: formatAbilityForChat(ability, categoryKey),
            type: 'text',
            payload: {
                kind: 'monster-ability',
                placementId: state.placement && state.placement.id ? state.placement.id : '',
                category: categoryKey,
                name: ability.name || ''
            }
        });
    }

    function formatAbilityForChat(ability, categoryKey) {
        var category = CATEGORIES.find(function (cat) { return cat.key === categoryKey; }) || {};
        var monsterName = (state.placement && state.placement.name) || (state.monster && state.monster.name) || 'Monster';
        var keywords = typeof ability.keywords === 'string'
            ? ability.keywords.split(/[,;]+/).map(function (s) { return s.trim(); }).filter(Boolean).join(', ')
            : '';
        var lines = [
            monsterName + ' - ' + (ability.name || 'Unnamed Ability'),
            'Type: ' + (category.label || 'Ability') + (keywords ? ' | ' + keywords : '')
        ];
        if (ability.range) lines.push('Range: ' + ability.range);
        if (ability.targets) lines.push('Target: ' + ability.targets);
        if (categoryKey === 'triggered_action' && ability.trigger) lines.push('Trigger: ' + ability.trigger);
        if (ability.resource_cost) lines.push('Cost: ' + ability.resource_cost);
        if (ability.effect) lines.push('Effect: ' + ability.effect);
        if (ability.additional_effect) lines.push('Additional: ' + ability.additional_effect);

        var testText = formatTestForChat(ability.test);
        if (testText) lines.push(testText);
        return lines.filter(Boolean).join('\n');
    }

    function formatTestForChat(test) {
        if (!test || typeof test !== 'object') return '';
        var labels = { tier1: '<= 11', tier2: '12-16', tier3: '17+' };
        var lines = ['-- Power Roll --'];
        ['tier1', 'tier2', 'tier3'].forEach(function (tier) {
            var entry = test[tier];
            if (!entry || typeof entry !== 'object') return;
            var pieces = [];
            var dmgAmount = (entry.damage_amount || '').toString().trim();
            if (dmgAmount) {
                var dmgType = (entry.damage_type || '').toString().trim();
                pieces.push((dmgAmount + (dmgType ? ' ' + dmgType : '') + ' damage').trim());
            }
            var attr = (entry.attribute || '').toString().trim();
            var attrEffect = (entry.attribute_effect || '').toString().trim();
            if (attrEffect) {
                var attrInitial = attr ? attr.charAt(0).toUpperCase() : '';
                var threshold = entry.attribute_threshold !== undefined && entry.attribute_threshold !== null
                    ? String(entry.attribute_threshold)
                    : '';
                pieces.push(attrInitial && threshold ? attrInitial + '<' + threshold + ' ' + attrEffect : attrEffect);
            }
            if (entry.effect) pieces.push(entry.effect);
            if (pieces.length) lines.push(labels[tier] + ': ' + pieces.join(' | '));
        });
        return lines.length > 1 ? lines.join('\n') : '';
    }

    function getAbilityIcon(categoryKey) {
        if (categoryKey === 'triggered_action') return '!';
        if (categoryKey === 'maneuver') return '+';
        if (categoryKey === 'villain_action' || categoryKey === 'malice') return 'M';
        return '>';
    }

    function getMonsterAbilityTriggerId(categoryKey, ability) {
        if (!state.placement || !state.placement.id || !ability || !ability.name) return '';
        return state.placement.id + ':' + categoryKey + ':' + ability.name;
    }

    function formatText(text) {
        return escapeHtml(text).replace(/\n+/g, '<br>');
    }

    function launchAbility(categoryKey, index, options) {
        if (!state.monster || !state.placement) return;
        var abilities = abilitiesFor(state.monster, categoryKey);
        var ability = abilities[index];
        if (!ability) return;
        if (!window.MonsterAbilityRunner || typeof window.MonsterAbilityRunner.start !== 'function') {
            console.warn('[MonsterAbilityTray] MonsterAbilityRunner not loaded.');
            return;
        }
        var runnerOptions = {};
        var triggerId = options && options.clearsTrigger ? options.clearsTrigger : '';
        if (triggerId) {
            var sources = state.placement.readyTriggerSources && typeof state.placement.readyTriggerSources === 'object'
                ? state.placement.readyTriggerSources
                : {};
            var payloads = state.placement.readyTriggerPayloads && typeof state.placement.readyTriggerPayloads === 'object'
                ? state.placement.readyTriggerPayloads
                : {};
            var snapshot = payloads[triggerId];
            runnerOptions.suggestedTargetId = sources[triggerId] || '';
            runnerOptions.triggerPayload = snapshot && typeof snapshot === 'object'
                ? (snapshot.payload && typeof snapshot.payload === 'object' ? snapshot.payload : snapshot)
                : null;
            document.dispatchEvent(new CustomEvent('vtt:clear-trigger-ready', {
                detail: { placementId: state.placement.id, abilityId: triggerId }
            }));
        }
        window.MonsterAbilityRunner.start(state.monster, ability, categoryKey, state.placement, runnerOptions);
    }

    function openFor(placement, monster) {
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
