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
                <div class="vtt-board__round-tracker" data-round-tracker hidden>
                    <span class="vtt-board__round-label">Round</span>
                    <span class="vtt-board__round-value" data-round-value>1</span>
                </div>
                <p
                    id="active-scene-status"
                    class="vtt-board__status visually-hidden"
                    aria-live="polite"
                >
                    Select or create a scene to begin.
                </p>
            </div>
            <div class="vtt-board__tracker" data-combat-tracker>
                <div class="vtt-combat-tracker" role="group" aria-label="Scene combat tracker">
                    <div class="vtt-combat-tracker__segment">
                        <p id="vtt-combat-tracker-waiting-label" class="vtt-combat-tracker__heading">
                            Waiting for turn
                        </p>
                        <div
                            class="vtt-combat-tracker__section vtt-combat-tracker__section--waiting"
                            data-combat-tracker-waiting
                            role="list"
                            aria-labelledby="vtt-combat-tracker-waiting-label"
                            data-empty="true"
                            data-empty-label="No combatants waiting"
                        ></div>
                    </div>
                    <div class="vtt-combat-tracker__divider" aria-hidden="true"></div>
                    <div class="vtt-combat-tracker__segment">
                        <p id="vtt-combat-tracker-completed-label" class="vtt-combat-tracker__heading">
                            Turn completed
                        </p>
                        <div
                            class="vtt-combat-tracker__section vtt-combat-tracker__section--completed"
                            data-combat-tracker-completed
                            role="list"
                            aria-labelledby="vtt-combat-tracker-completed-label"
                            data-empty="true"
                            data-empty-label="No turns completed"
                        ></div>
                    </div>
                </div>
            </div>
            <div class="vtt-board__actions">
                <div class="vtt-board__quick-launch">
                    <button
                        class="btn"
                        type="button"
                        id="vtt-dice-roller-btn"
                        aria-haspopup="dialog"
                        title="Open the dice roller"
                    >
                        Dice Roller
                    </button>
                    <button
                        class="btn"
                        type="button"
                        id="vtt-damage-heal-btn"
                        data-action="damage-heal"
                        title="Adjust token hit points"
                    >
                        Damage/Heal
                    </button>
                </div>
                <div class="vtt-board__coming-soon">
                    <button
                        class="btn"
                        type="button"
                        data-action="group-combatants"
                        disabled
                        title="Select at least two tokens to enable grouping"
                    >
                        Group
                    </button>
                    <button class="btn" type="button" data-action="start-combat">Start Combat</button>
                </div>
                <div class="vtt-board__controls">
                    <button class="btn" type="button" data-action="measure-distance" aria-pressed="false">Measure</button>
                    <button
                        class="btn"
                        type="button"
                        data-action="open-templates"
                        aria-haspopup="true"
                        aria-expanded="false"
                    >
                        Templates
                    </button>
                </div>
            </div>
        </header>
        <div class="vtt-board__canvas-wrapper">
            <div id="vtt-board-canvas" class="vtt-board__canvas" tabindex="0" role="application">
                <div id="vtt-map-surface" class="vtt-board__map-surface" aria-live="polite">
                    <div id="vtt-map-transform" class="vtt-board__map-transform" hidden>
                        <div id="vtt-map-backdrop" class="vtt-board__map-backdrop">
                            <img id="vtt-map-image" class="vtt-board__map-image" alt="Scene map" hidden />
                        </div>
                        <div id="vtt-map-overlay" class="vtt-board__map-overlay" aria-hidden="true" hidden></div>
                        <div id="vtt-grid-overlay" class="vtt-board__grid" aria-hidden="true"></div>
                        <div id="vtt-template-layer" class="vtt-board__templates" aria-hidden="true"></div>
                        <div
                            id="vtt-token-layer"
                            class="vtt-board__tokens"
                            aria-live="off"
                            hidden
                        ></div>
                    </div>
                </div>
                <p class="vtt-board__empty">Drag a scene map here or create a scene from the settings panel.</p>
            </div>
            <div
                class="vtt-board__condition-banner-region"
                data-condition-banner-region
                aria-live="polite"
            ></div>
            <div
                class="vtt-board__turn-timer"
                data-turn-timer
                hidden
            >
                <div class="vtt-board__turn-timer-image" data-turn-timer-image></div>
                <span
                    class="vtt-board__turn-timer-display"
                    data-turn-timer-display
                    role="timer"
                    aria-live="polite"
                >1:00</span>
            </div>
            <div id="vtt-distance-ruler" class="vtt-board__ruler" hidden>
                <span class="vtt-board__ruler-value">0 squares</span>
            </div>
        </div>
    </section>
    <?php
    return trim((string) ob_get_clean());
}
