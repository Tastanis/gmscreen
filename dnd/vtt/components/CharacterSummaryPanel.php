<?php
declare(strict_types=1);

function renderVttCharacterSummaryPanel(): string
{
    ob_start();
    ?>
    <aside
        id="vtt-character-summary-panel"
        class="vtt-character-summary vtt-character-summary--closed"
        aria-hidden="true"
        data-module="vtt-character-summary"
    >
        <div class="vtt-character-summary__empty">
            Select a PC token to view character details.
        </div>
    </aside>
    <?php
    return trim((string) ob_get_clean());
}
