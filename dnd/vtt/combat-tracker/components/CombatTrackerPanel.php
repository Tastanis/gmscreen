<?php
declare(strict_types=1);

namespace VTT\CombatTracker\Components;

/**
 * Placeholder render helper for the combat tracker panel.
 * Returns a bare container div so template integration work can begin
 * without committing to markup or data contracts.
 */
function render_combat_tracker_panel(array $props = []): string
{
    $attributes = [
        'class' => 'vtt-combat-tracker',
        'data-initialized' => 'false',
    ];

    if (isset($props['isGM'])) {
        $attributes['data-is-gm'] = $props['isGM'] ? 'true' : 'false';
    }

    if (!empty($props['sceneId'])) {
        $attributes['data-scene-id'] = (string) $props['sceneId'];
    }

    $attrString = '';
    foreach ($attributes as $key => $value) {
        $attrString .= sprintf(' %s="%s"', $key, htmlspecialchars($value, ENT_QUOTES));
    }

    return sprintf('<section%s></section>', $attrString);
}
