// Monster Summary Panel - left-side reference for monster tokens.
//
// Uses the PC character-summary card structure so token sheets read the same
// way at the table, while omitting PC-only resources like recoveries.

(function () {
    'use strict';

    var PANEL_ID = 'vtt-monster-summary-panel';
    var BODY_OPEN_CLASS = 'vtt-monster-summary-is-open';

    var CATEGORIES = [
        { key: 'passive',          label: 'Passive Abilities' },
        { key: 'maneuver',         label: 'Maneuvers' },
        { key: 'action',           label: 'Actions' },
        { key: 'triggered_action', label: 'Triggered Actions' },
        { key: 'villain_action',   label: 'Villain Actions' },
        { key: 'malice',           label: 'Malice Abilities' }
    ];

    var ATTRIBUTES = ['might', 'agility', 'reason', 'intuition', 'presence'];

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

    function formatText(text) {
        return escapeHtml(text).replace(/\n+/g, '<br>');
    }

    function ensurePanel() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement('aside');
            panel.id = PANEL_ID;
            panel.className = 'vtt-character-summary vtt-monster-summary vtt-monster-summary--closed';
            panel.setAttribute('aria-hidden', 'true');
            (document.body || document.documentElement).appendChild(panel);
        }
        panel.classList.add('vtt-character-summary', 'vtt-monster-summary');
        return panel;
    }

    function render(panel, placement, monster) {
        if (!monster) {
            panel.innerHTML = '<div class="vtt-character-summary__empty vtt-monster-summary__empty">Select a monster token to view its details.</div>';
            return;
        }

        var name = monster.name || placementName(placement) || 'Monster';
        var imageUrl = monster.imageUrl || monster.image || placement?.imageUrl || '';
        var hp = resolveHitPoints(placement, monster);
        var healthPercent = hp.max > 0 ? clamp((hp.current / hp.max) * 100, 0, 100) : 0;
        var attrs = monster.attributes || monster.characteristics || {};
        var defenses = monster.defenses || {};
        var role = monster.role || monster.types || '';
        var typeLine = [role, monster.size || monster.footprint || ''].filter(Boolean).join(' - ');
        var conditions = normalizeConditions(placement?.conditions ?? placement?.condition ?? []);

        panel.innerHTML = '<article class="vtt-character-card vtt-monster-card" data-monster-id="' + escapeAttribute(monster.id || '') + '">' +
            '<button type="button" class="vtt-character-summary__tuck vtt-monster-summary__tuck" data-monster-summary-tuck aria-label="Tuck monster sheet" title="Tuck monster sheet">&lt;</button>' +
            '<header class="vtt-character-card__hero vtt-monster-card__hero">' +
            '<div class="vtt-character-card__portrait vtt-monster-card__portrait">' +
            (imageUrl ? '<img src="' + escapeAttribute(imageUrl) + '" alt="' + escapeAttribute(name) + ' token">' : '') +
            '</div>' +
            '<div class="vtt-character-card__identity">' +
            '<h2 class="vtt-character-card__name">' + escapeHtml(name) + '</h2>' +
            (monster.level != null && monster.level !== '' ? '<div class="vtt-character-card__level">Level ' + escapeHtml(monster.level) + '</div>' : '') +
            (role ? '<div class="vtt-character-card__class">' + escapeHtml(role) + '</div>' : '') +
            (typeLine ? '<div class="vtt-character-card__track">' + escapeHtml(typeLine) + '</div>' : '') +
            '</div>' +
            '<div class="vtt-character-card__quick">' +
            renderQuickBox('EV', valueOrDash(monster.ev)) +
            renderQuickBox('Free Strike', valueOrDash(monster.free_strike ?? defenses.free_strike)) +
            '</div>' +
            '</header>' +
            renderSection('Stamina', renderStaminaSection(hp, healthPercent)) +
            renderSection('Statistics', renderStats(attrs, monster, defenses, placement)) +
            renderDefenses(defenses) +
            renderSection('Auras, Conditions, & Effects',
                '<div class="vtt-character-condition-list">' +
                (conditions.length ? conditions.map(function (condition) {
                    return renderCondition(condition, placement?.id);
                }).join('') : '<span class="vtt-character-condition">No conditions</span>') +
                '</div>'
            ) +
            renderTraits(monster) +
            renderAbilities(monster) +
            '</article>';
    }

    function renderStaminaSection(hp, healthPercent) {
        return '<div class="vtt-monster-stamina">' +
            '<div class="vtt-character-pill vtt-character-pill--damage"><span class="vtt-character-pill__label">DMG</span><span class="vtt-character-pill__value">-</span></div>' +
            '<div class="vtt-character-pill"><span class="vtt-character-pill__label">HP</span><span class="vtt-character-pill__value">' + escapeHtml(hp.current) + ' / ' + escapeHtml(hp.max) + '</span></div>' +
            '<div class="vtt-character-pill"><span class="vtt-character-pill__label">Heal</span><span class="vtt-character-pill__value">+</span></div>' +
            '<div class="vtt-character-pill vtt-character-pill--temp"><span class="vtt-character-pill__label">Temp</span><span class="vtt-character-pill__value">0</span></div>' +
            '</div>' +
            '<div class="vtt-character-healthbar">' +
            '<div class="vtt-character-healthbar__fill" style="width: ' + healthPercent + '%;"></div>' +
            '<div class="vtt-character-healthbar__text">' + escapeHtml(hp.current) + ' / ' + escapeHtml(hp.max) + '</div>' +
            '</div>';
    }

    function renderStats(attrs, monster, defenses, placement) {
        var standFirm = resolveMonsterStandFirmState(placement, monster);
        var stabilityBonus = standFirm && standFirm.active ? Math.max(0, toNumber(standFirm.stabilityBonus, 0)) : 0;
        return '<div class="vtt-character-stats">' +
            ATTRIBUTES.map(function (key) {
                return renderStat(capitalize(key), attrs[key]);
            }).join('') +
            '</div>' +
            '<div class="vtt-character-vitals">' +
            renderVital('Speed', monster.speed ?? monster.movement) +
            renderVital('Stability', monster.stability ?? defenses.stability, { bonus: stabilityBonus, source: standFirm?.labels?.[0] || 'Stand Firm' }) +
            renderVital('Size', monster.size || monster.footprint) +
            '</div>';
    }

    function renderDefenses(defenses) {
        if (!defenses || typeof defenses !== 'object') return '';
        var rows = [];
        var immunityText = formatDefenseList(defenses.immunities, defenses.immunity);
        if (immunityText) {
            rows.push('<p><strong>Immunity:</strong> ' + escapeHtml(immunityText) + '</p>');
        }
        var weaknessText = formatDefenseList(defenses.weaknesses, defenses.weakness);
        if (weaknessText) {
            rows.push('<p><strong>Weakness:</strong> ' + escapeHtml(weaknessText) + '</p>');
        }
        if (!rows.length) return '';
        return renderSection('Defenses', '<div class="vtt-character-text-list">' + rows.join('') + '</div>');
    }

    function formatDefenseList(list, fallbackSingle) {
        var entries = [];
        if (Array.isArray(list)) {
            list.forEach(function (entry) {
                if (entry && typeof entry === 'object') entries.push(entry);
            });
        }
        if (entries.length === 0 && fallbackSingle && typeof fallbackSingle === 'object') {
            entries.push(fallbackSingle);
        }
        if (entries.length === 0) return '';
        return entries.map(function (entry) {
            var type = entry && entry.type ? String(entry.type).trim() : '';
            var value = entry && entry.value !== undefined && entry.value !== null ? String(entry.value).trim() : '';
            return [type, value].filter(Boolean).join(' ');
        }).filter(Boolean).join(', ');
    }

    function renderTraits(monster) {
        var traits = monster && monster.traits;
        if (!Array.isArray(traits) || !traits.length) return '';
        return renderSection('Traits', traits.map(function (trait) {
            if (!trait || typeof trait !== 'object') return '';
            var name = trait.name || '';
            var text = trait.text || trait.description || trait.effect || '';
            return '<p class="vtt-character-feature">' +
                (name ? '<strong class="vtt-character-feature__title">' + escapeHtml(name) + '</strong>' : '') +
                (text ? formatText(text) : '') +
                '</p>';
        }).filter(Boolean).join(''));
    }

    function renderAbilities(monster) {
        var abilities = monster && monster.abilities;
        if (!abilities || typeof abilities !== 'object') return '';
        return CATEGORIES.map(function (cat) {
            var list = Array.isArray(abilities[cat.key]) ? abilities[cat.key] : [];
            if (!list.length) return '';
            var items = list.map(function (ability) {
                return renderAbility(ability, cat.key);
            }).filter(Boolean).join('');
            return items ? renderSection(cat.label, '<div class="vtt-monster-summary__ability-list">' + items + '</div>') : '';
        }).filter(Boolean).join('');
    }

    function renderAbility(ability, categoryKey) {
        if (!ability || typeof ability !== 'object') return '';
        var name = ability.name || '';
        if (!name) return '';
        var meta = [
            ability.keywords,
            ability.range ? 'Range ' + ability.range : '',
            ability.targets ? 'Target ' + ability.targets : '',
            ability.resource_cost ? 'Cost ' + ability.resource_cost : ''
        ].filter(Boolean).join(' - ');
        var parts = [];
        if (categoryKey === 'triggered_action' && ability.trigger) {
            parts.push('<p><strong>Trigger:</strong> ' + formatText(ability.trigger) + '</p>');
        }
        if (ability.effect) parts.push('<p>' + formatText(ability.effect) + '</p>');
        if (ability.additional_effect) parts.push('<p>' + formatText(ability.additional_effect) + '</p>');
        if (ability.has_test && ability.test) parts.push(renderAbilityTest(ability.test));
        return '<article class="vtt-monster-summary__ability">' +
            '<h4 class="vtt-character-feature__title">' + escapeHtml(name) + '</h4>' +
            (meta ? '<p class="vtt-monster-summary__ability-meta">' + escapeHtml(meta) + '</p>' : '') +
            '<div class="vtt-character-text-list">' + parts.join('') + '</div>' +
            '</article>';
    }

    function renderAbilityTest(test) {
        var labels = { tier1: '<= 11', tier2: '12-16', tier3: '17+' };
        var rows = ['tier1', 'tier2', 'tier3'].map(function (tier) {
            var entry = test && test[tier];
            if (!entry || typeof entry !== 'object') return '';
            var text = [
                entry.damage_amount ? 'Damage: ' + entry.damage_amount : '',
                entry.effect || ''
            ].filter(Boolean).join(' - ');
            return text ? '<p><strong>' + escapeHtml(labels[tier]) + ':</strong> ' + formatText(text) + '</p>' : '';
        }).filter(Boolean).join('');
        return rows;
    }

    function renderSection(title, body) {
        if (!body) return '';
        return '<section class="vtt-character-section vtt-monster-section">' +
            '<header class="vtt-character-section__header">' +
            '<span class="vtt-character-section__icon" aria-hidden="true">=</span>' +
            '<span>' + escapeHtml(title) + '</span>' +
            '</header>' +
            '<div class="vtt-character-section__body">' + body + '</div>' +
            '</section>';
    }

    function renderQuickBox(label, value) {
        return '<div class="vtt-character-card__quick-box">' +
            '<span class="vtt-character-card__quick-label">' + escapeHtml(label) + '</span>' +
            '<span class="vtt-character-card__quick-value">' + escapeHtml(value) + '</span>' +
            '</div>';
    }

    function renderStat(label, value) {
        return '<div class="vtt-character-stat">' +
            '<span class="vtt-character-stat__label">' + escapeHtml(label) + '</span>' +
            '<span class="vtt-character-stat__value">' + formatSigned(value) + '</span>' +
            '</div>';
    }

    function renderVital(label, value, options) {
        options = options || {};
        var bonus = Math.max(0, toNumber(options.bonus, 0));
        var base = Number.parseInt(value, 10);
        var boostedValue = Number.isFinite(base) ? base + bonus : bonus;
        var title = bonus > 0 ? ' title="' + escapeAttribute((options.source || 'Stand Firm') + ' adds ' + bonus) + '"' : '';
        var valueHtml = bonus > 0
            ? '<span class="vtt-character-vital__base">' + escapeHtml(valueOrDash(value)) + '</span>' +
                '<span class="vtt-character-vital__bonus">+' + escapeHtml(bonus) + '</span>' +
                '<span class="vtt-character-vital__total">=' + escapeHtml(boostedValue) + '</span>'
            : escapeHtml(valueOrDash(value));
        return '<div class="vtt-character-vital ' + (bonus > 0 ? 'vtt-character-vital--boosted' : '') + '"' + title + '>' +
            '<div class="vtt-character-vital__label">' + escapeHtml(label) + '</div>' +
            '<div class="vtt-character-vital__value">' + valueHtml + '</div>' +
            '</div>';
    }

    function resolveMonsterStandFirmState(placement, monster) {
        var helper = window.DrawSteelStandFirm;
        if (!helper || typeof helper.resolveStandFirmState !== 'function' || !placement) return null;
        var placements = window.VTTBoardCallbacks && typeof window.VTTBoardCallbacks.getActiveScenePlacements === 'function'
            ? window.VTTBoardCallbacks.getActiveScenePlacements()
            : [];
        var livePlacement = placements.find(function (item) { return item && item.id === placement.id; }) || placement;
        return helper.resolveStandFirmState({
            placement: livePlacement,
            placements: placements,
            monster: monster,
            getTeam: function (item) { return item && item.team; }
        });
    }

    function renderCondition(condition, placementId) {
        var entry = condition && typeof condition === 'object'
            ? condition
            : { label: String(condition || ''), index: 0, hidden: false };
        var label = entry.label || entry.name || 'Effect';
        var index = Number.isInteger(entry.index) ? entry.index : 0;
        var detail = entry.detail || '';
        var removeButton = placementId
            ? '<button class="vtt-character-condition__remove" type="button" data-character-condition-remove data-placement-id="' + escapeAttribute(placementId) + '" data-condition-index="' + escapeAttribute(index) + '" aria-label="Remove ' + escapeAttribute(label) + '">x</button>'
            : '';
        return '<span class="vtt-character-condition ' + (entry.hidden ? 'vtt-character-condition--hidden-effect' : '') + '">' +
            '<span class="vtt-character-condition__body"><span class="vtt-character-condition__name">' + escapeHtml(label) + '</span>' +
            (detail ? '<span class="vtt-character-condition__detail">' + escapeHtml(detail) + '</span>' : '') +
            '</span>' + removeButton + '</span>';
    }

    function bindControls(panel) {
        panel.addEventListener('click', function (event) {
            var target = event.target instanceof Element ? event.target : null;
            if (target && target.closest('[data-monster-summary-tuck]')) {
                event.preventDefault();
                close();
                return;
            }
            var conditionRemove = target && target.closest('[data-character-condition-remove]');
            if (conditionRemove) {
                event.preventDefault();
                event.stopPropagation();
                var placementId = conditionRemove.dataset.placementId || '';
                var conditionIndex = Number.parseInt(conditionRemove.dataset.conditionIndex || '', 10);
                if (placementId && Number.isInteger(conditionIndex) && conditionIndex >= 0) {
                    document.dispatchEvent(new CustomEvent('vtt:character-summary-remove-condition', {
                        detail: {
                            placementId: placementId,
                            conditionIndex: conditionIndex
                        }
                    }));
                }
            }
        });
    }

    function openFor(placement, monster) {
        if (typeof window.canViewMonster === 'function' && !window.canViewMonster(placement)) {
            close();
            return;
        }
        var panel = ensurePanel();
        if (!panel.dataset.controlsBound) {
            bindControls(panel);
            panel.dataset.controlsBound = '1';
        }
        render(panel, placement || null, monster || null);
        panel.classList.add('vtt-monster-summary--open');
        panel.classList.remove('vtt-monster-summary--closed');
        panel.setAttribute('aria-hidden', 'false');
        document.body && document.body.classList.add(BODY_OPEN_CLASS);
    }

    function close() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.classList.remove('vtt-monster-summary--open');
        panel.classList.add('vtt-monster-summary--closed');
        panel.setAttribute('aria-hidden', 'true');
        document.body && document.body.classList.remove(BODY_OPEN_CLASS);
    }

    function resolveHitPoints(placement, monster) {
        var placementHp = placement && placement.hp && typeof placement.hp === 'object' ? placement.hp : null;
        var current = toNumber(placementHp?.current, null);
        var max = toNumber(placementHp?.max, null);
        if (current === null) current = toNumber(placement?.hp, null);
        if (max === null) max = toNumber(placement?.maxHp, null);
        if (max === null) max = toNumber(monster?.hp ?? monster?.stamina, 0);
        if (current === null) current = max;
        return { current: current || 0, max: max || 0 };
    }

    function normalizeConditions(value) {
        var entries = Array.isArray(value) ? value : value ? [value] : [];
        return entries.map(function (condition, index) {
            if (typeof condition === 'string') {
                var label = condition.trim();
                return label ? { label: label, name: label, index: index, hidden: false } : null;
            }
            if (condition && typeof condition === 'object') {
                var hidden = Boolean(condition.hidden || String(condition.name || '').trim().toLowerCase() === 'hiddeneffect');
                var label = formatConditionLabel(condition, hidden);
                if (!label) return null;
                var durationLabel = formatConditionDuration(condition.duration);
                return {
                    label: label,
                    name: String(condition.name ?? label).trim(),
                    index: index,
                    hidden: hidden,
                    sourceName: String(condition.sourceName ?? '').trim(),
                    sourceAbility: String(condition.sourceAbility ?? '').trim(),
                    durationLabel: durationLabel,
                    detail: formatConditionDetail(condition, hidden, durationLabel)
                };
            }
            return null;
        }).filter(Boolean);
    }

    function formatConditionLabel(condition, hidden) {
        var rawName = String(condition?.name ?? '').trim();
        var normalized = rawName.toLowerCase();
        if (normalized === 'damageweakness' || normalized === 'damageimmunity') {
            var amount = Number.parseInt(condition.amount, 10);
            var damageType = String(condition.damageType || '').trim().toLowerCase();
            var typeLabel = damageType ? damageType.charAt(0).toUpperCase() + damageType.slice(1) + ' ' : '';
            var rider = normalized === 'damageweakness' ? 'weakness' : 'immunity';
            return (typeLabel + rider + (Number.isFinite(amount) && amount > 0 ? ' ' + amount : '')).trim();
        }
        return String(hidden
            ? (condition.label ?? condition.sourceAbility ?? condition.text ?? condition.name ?? 'Hidden effect')
            : (condition.label ?? condition.name ?? condition.id ?? '')).trim();
    }

    function formatConditionDetail(condition, hidden, durationLabel) {
        var parts = [];
        if (hidden) {
            parts.push(condition.sourceAbility, condition.sourceName);
        }
        if (durationLabel && durationLabel !== 'instantaneous') {
            parts.push(durationLabel);
        }
        return parts.filter(Boolean).join(' - ');
    }

    function formatConditionDuration(duration) {
        var type = typeof duration === 'string'
            ? duration
            : duration && typeof duration === 'object'
                ? duration.type || duration.value || duration.mode || ''
                : '';
        var normalized = String(type || '').trim();
        if (!normalized) return '';
        if (normalized === 'end-of-turn') return 'end of turn';
        if (normalized === 'save-ends') return 'save ends';
        return normalized.replace(/-/g, ' ');
    }

    function placementName(placement) {
        return typeof placement?.name === 'string' ? placement.name : '';
    }

    function valueOrDash(value) {
        return value === null || value === undefined || value === '' ? '-' : value;
    }

    function toNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function formatSigned(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return '0';
        return number > 0 ? '+' + number : String(number);
    }

    function capitalize(value) {
        value = String(value || '');
        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    window.MonsterSummaryPanel = {
        openFor: openFor,
        close: close
    };
})();
