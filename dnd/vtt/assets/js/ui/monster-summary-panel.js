// Monster Summary Panel — left-side at-a-glance reference for monster tokens.
//
// Sibling to the PC character summary panel; lives in its own module so PC
// behavior is untouched. Driven by the Phase 9 token-select router via
// openFor(placement, monster) / close().
//
// Public surface:
//   window.MonsterSummaryPanel.openFor(placement, monster)
//   window.MonsterSummaryPanel.close()
//
// Renders read-only monster details. Actual ability launching happens in the
// bottom monster ability tray.

(function () {
    'use strict';

    var PANEL_ID = 'vtt-monster-summary-panel';

    var CATEGORIES = [
        { key: 'passive',          label: 'Passive Abilities' },
        { key: 'maneuver',         label: 'Maneuvers' },
        { key: 'action',           label: 'Actions' },
        { key: 'triggered_action', label: 'Triggered Actions' },
        { key: 'villain_action',   label: 'Villain Actions' },
        { key: 'malice',           label: 'Malice Abilities' }
    ];

    var CHARACTERISTICS = ['might', 'agility', 'reason', 'intuition', 'presence'];

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatPlain(text) {
        // Lightweight escape + line breaks. Stat-block effect text often
        // contains semicolons and short clauses — keep them readable.
        return escapeHtml(text).replace(/\n+/g, '<br>');
    }

    function ensurePanel() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) {
            // Fall back to creating one if the layout did not render the slot.
            panel = document.createElement('aside');
            panel.id = PANEL_ID;
            panel.className = 'vtt-monster-summary vtt-monster-summary--closed';
            panel.setAttribute('aria-hidden', 'true');
            (document.body || document.documentElement).appendChild(panel);
        }
        return panel;
    }

    function renderStatLine(placement, monster) {
        var parts = [];
        var hp = placement && Number.isFinite(Number(placement.hp)) ? placement.hp : (monster && monster.hp);
        var maxHp = placement && Number.isFinite(Number(placement.maxHp)) ? placement.maxHp : (monster && monster.hp);
        if (hp !== undefined || maxHp !== undefined) {
            parts.push(
                '<span class="vtt-monster-summary__statline-item"><strong>HP</strong> ' +
                escapeHtml((hp != null ? hp : '?') + ' / ' + (maxHp != null ? maxHp : '?')) + '</span>'
            );
        }
        if (monster && monster.ac != null && monster.ac !== '') {
            parts.push('<span class="vtt-monster-summary__statline-item"><strong>AC</strong> ' + escapeHtml(monster.ac) + '</span>');
        }
        if (monster && monster.speed != null && monster.speed !== '') {
            parts.push('<span class="vtt-monster-summary__statline-item"><strong>Speed</strong> ' + escapeHtml(monster.speed) + '</span>');
        }
        if (monster && monster.size != null && monster.size !== '') {
            parts.push('<span class="vtt-monster-summary__statline-item"><strong>Size</strong> ' + escapeHtml(monster.size) + '</span>');
        }
        if (monster && monster.level != null && monster.level !== '') {
            parts.push('<span class="vtt-monster-summary__statline-item"><strong>Level</strong> ' + escapeHtml(monster.level) + '</span>');
        }
        if (!parts.length) return '';
        return '<div class="vtt-monster-summary__statline">' + parts.join('') + '</div>';
    }

    function renderCharacteristics(monster) {
        var chars = monster && monster.characteristics;
        if (!chars || typeof chars !== 'object') return '';
        var cells = CHARACTERISTICS.map(function (key) {
            var raw = chars[key];
            var val = (raw == null || raw === '') ? '—' : raw;
            return '<div>' +
                '<span class="vtt-monster-summary__characteristic-label">' + escapeHtml(key.slice(0, 3)) + '</span>' +
                '<span class="vtt-monster-summary__characteristic-value">' + escapeHtml(val) + '</span>' +
                '</div>';
        }).join('');
        return '<section class="vtt-monster-summary__section">' +
            '<h3 class="vtt-monster-summary__section-title">Characteristics</h3>' +
            '<div class="vtt-monster-summary__characteristics">' + cells + '</div>' +
            '</section>';
    }

    function renderTraits(monster) {
        var traits = monster && monster.traits;
        if (!Array.isArray(traits) || !traits.length) return '';
        var items = traits.map(function (t) {
            if (!t || typeof t !== 'object') return '';
            var name = t.name ? escapeHtml(t.name) : '';
            var text = t.text || t.description || t.effect || '';
            return '<li class="vtt-monster-summary__ability">' +
                (name ? '<h4 class="vtt-monster-summary__ability-name">' + name + '</h4>' : '') +
                '<p class="vtt-monster-summary__ability-text">' + formatPlain(text) + '</p>' +
                '</li>';
        }).filter(Boolean).join('');
        if (!items) return '';
        return '<section class="vtt-monster-summary__section">' +
            '<h3 class="vtt-monster-summary__section-title">Traits</h3>' +
            '<ul class="vtt-monster-summary__ability-list">' + items + '</ul>' +
            '</section>';
    }

    function renderAbilities(monster) {
        var abilities = monster && monster.abilities;
        if (!abilities || typeof abilities !== 'object') return '';
        var sections = CATEGORIES.map(function (cat) {
            var list = Array.isArray(abilities[cat.key]) ? abilities[cat.key] : [];
            if (!list.length) return '';
            var items = list.map(function (ability) {
                if (!ability || typeof ability !== 'object') return '';
                var name = ability.name ? escapeHtml(ability.name) : '(unnamed)';
                var effect = ability.effect || '';
                var additional = ability.additional_effect || '';
                var trigger = ability.trigger || '';
                var parts = [];
                if (trigger && cat.key === 'triggered_action') {
                    parts.push('<p class="vtt-monster-summary__ability-text"><strong>Trigger:</strong> ' +
                        formatPlain(trigger) + '</p>');
                }
                if (effect) {
                    parts.push('<p class="vtt-monster-summary__ability-text">' + formatPlain(effect) + '</p>');
                }
                if (additional) {
                    parts.push('<p class="vtt-monster-summary__ability-text">' + formatPlain(additional) + '</p>');
                }
                return '<li class="vtt-monster-summary__ability">' +
                    '<h4 class="vtt-monster-summary__ability-name">' + name + '</h4>' +
                    parts.join('') +
                    '</li>';
            }).filter(Boolean).join('');
            if (!items) return '';
            return '<section class="vtt-monster-summary__section">' +
                '<h3 class="vtt-monster-summary__section-title">' + escapeHtml(cat.label) + '</h3>' +
                '<ul class="vtt-monster-summary__ability-list">' + items + '</ul>' +
                '</section>';
        }).filter(Boolean).join('');
        return sections;
    }

    function render(panel, placement, monster) {
        if (!monster) {
            panel.innerHTML = '<div class="vtt-monster-summary__empty">Select a monster token to view its details.</div>';
            return;
        }
        var imageHtml = monster.image
            ? '<img class="vtt-monster-summary__image" alt="' + escapeHtml(monster.name || 'monster') +
              '" src="' + escapeHtml(monster.image) + '">'
            : '';
        var header = '<header class="vtt-monster-summary__header">' +
            '<button type="button" class="vtt-monster-summary__tuck" data-monster-summary-tuck aria-label="Close monster summary" title="Close">&lt;</button>' +
            '<h2 class="vtt-monster-summary__name">' + escapeHtml(monster.name || 'Monster') + '</h2>' +
            imageHtml +
            '</header>';
        panel.innerHTML = header +
            renderStatLine(placement, monster) +
            renderCharacteristics(monster) +
            renderTraits(monster) +
            renderAbilities(monster);
    }

    function bindControls(panel) {
        panel.addEventListener('click', function (event) {
            var target = event.target instanceof Element ? event.target : null;
            if (target && target.closest('[data-monster-summary-tuck]')) {
                event.preventDefault();
                close();
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
    }

    function close() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.classList.remove('vtt-monster-summary--open');
        panel.classList.add('vtt-monster-summary--closed');
        panel.setAttribute('aria-hidden', 'true');
    }

    window.MonsterSummaryPanel = {
        openFor: openFor,
        close: close
    };
})();
