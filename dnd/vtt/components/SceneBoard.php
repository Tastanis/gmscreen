<?php
declare(strict_types=1);

function renderVttSceneBoard(): string
{
    ob_start();
    ?>
    <section class="vtt-board" data-module="vtt-board" aria-label="Virtual tabletop board">
        <header class="vtt-board__header">
            <div class="vtt-board__scene-meta">
                <h1 id="active-scene-name" class="vtt-board__title">No Active Scene</h1>
                <p id="active-scene-status" class="vtt-board__status">Select or create a scene to begin.</p>
            </div>
            <div class="vtt-board__controls">
                <button class="btn" type="button" data-action="measure-distance">Measure</button>
            </div>
        </header>
        <div class="vtt-board__canvas-wrapper">
            <div id="vtt-grid-overlay" class="vtt-board__grid" aria-hidden="true"></div>
            <div id="vtt-board-canvas" class="vtt-board__canvas" tabindex="0" role="application">
                <div id="vtt-map-surface" class="vtt-board__map-surface" aria-live="polite">
                    <div id="vtt-map-backdrop" class="vtt-board__map-backdrop">
                        <img id="vtt-map-image" class="vtt-board__map-image" alt="Scene map" hidden />
                    </div>
                </div>
                <p class="vtt-board__empty">Drag a scene map here or create a scene from the settings panel.</p>
            </div>
            <div id="vtt-distance-ruler" class="vtt-board__ruler" hidden>
                <span class="vtt-board__ruler-value">0 ft</span>
            </div>
        </div>
    </section>
    <?php
    return trim((string) ob_get_clean());
}
