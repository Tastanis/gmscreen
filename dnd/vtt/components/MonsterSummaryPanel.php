<?php
declare(strict_types=1);

function renderVttMonsterSummaryPanel(): string
{
    ob_start();
    ?>
    <aside
        id="vtt-monster-summary-panel"
        class="vtt-character-summary vtt-monster-summary vtt-monster-summary--closed"
        aria-hidden="true"
        data-module="vtt-monster-summary"
    >
        <div class="vtt-monster-summary__empty">
            Select a monster token to view its details.
        </div>
    </aside>
    <?php
    return trim((string) ob_get_clean());
}
