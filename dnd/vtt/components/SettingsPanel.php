<?php
declare(strict_types=1);

function renderVttSettingsPanel(string $tokenLibraryMarkup = '', bool $isGm = false): string
{
    ob_start();
    $defaultTab = $isGm ? 'scenes' : 'tokens';
    ?>
    <aside
        id="vtt-settings-panel"
        class="vtt-settings-panel vtt-settings-panel--closed"
        data-module="vtt-settings"
        aria-hidden="true"
    >
        <header class="vtt-settings-panel__header">
            <h2 class="vtt-settings-panel__title">Settings</h2>
            <button
                type="button"
                class="vtt-settings-panel__close"
                data-action="close-settings"
                aria-label="Close settings"
            >&times;</button>
        </header>
        <div class="vtt-settings-panel__body">
            <nav class="settings-tabs" aria-label="Settings">
                <?php if ($isGm): ?>
                    <button class="settings-tab <?= $defaultTab === 'scenes' ? 'is-active' : '' ?>" data-settings-tab="scenes" type="button">Scenes</button>
                <?php endif; ?>
                <button class="settings-tab <?= $defaultTab === 'tokens' ? 'is-active' : '' ?>" data-settings-tab="tokens" type="button">Tokens</button>
                <button class="settings-tab" data-settings-tab="preferences" type="button">Preferences</button>
            </nav>
            <?php if ($isGm): ?>
                <section class="settings-view settings-view--scenes" data-settings-view="scenes" <?= $defaultTab === 'scenes' ? '' : 'hidden' ?>>
                    <header class="settings-view__header">
                        <h3>Scene Manager</h3>
                        <button class="btn" type="button" data-action="create-folder">New Folder</button>
                    </header>
                    <div class="settings-view__content">
                        <section class="scene-controls" aria-label="Scene map and grid controls">
                            <input
                                id="vtt-map-upload-input"
                                class="visually-hidden"
                                type="file"
                                accept="image/*"
                            />
                            <div class="scene-controls__buttons">
                                <button class="btn btn--primary" type="button" data-action="upload-map">Upload Map</button>
                                <button class="btn" type="button" data-action="toggle-grid">Toggle Grid</button>
                                <button class="btn" type="button" data-action="lock-grid">Lock Grid</button>
                            </div>
                            <div class="scene-controls__grid">
                                <div class="scene-controls__grid-label">
                                    <label for="vtt-grid-size-input">Grid Size</label>
                                    <span class="scene-controls__grid-value">
                                        <span data-grid-size-display>64</span> px
                                    </span>
                                </div>
                                <input
                                    id="vtt-grid-size-input"
                                    type="range"
                                    min="24"
                                    max="160"
                                    step="4"
                                    value="64"
                                    data-grid-size-input
                                    aria-describedby="vtt-grid-size-hint"
                                />
                                <p id="vtt-grid-size-hint" class="scene-controls__hint">
                                    Adjust how large each grid square should appear on the board.
                                </p>
                            </div>
                            <p class="scene-controls__hint">Upload a background map and adjust the shared grid without leaving settings.</p>
                        </section>
                        <form class="scene-creator" data-scene-form>
                            <div class="scene-creator__field">
                                <label for="vtt-scene-name-input">Scene Title</label>
                                <input
                                    id="vtt-scene-name-input"
                                    type="text"
                                    name="scene-name"
                                    placeholder="Enter a memorable scene name"
                                    autocomplete="off"
                                    data-scene-name-input
                                />
                            </div>
                            <div class="scene-creator__field">
                                <label for="vtt-scene-folder-select">Folder</label>
                                <select id="vtt-scene-folder-select" name="scene-folder" data-scene-folder-select>
                                    <option value="">Unsorted</option>
                                </select>
                                <p class="scene-creator__hint">Folders help keep adventures organized. Create one if you need it.</p>
                            </div>
                            <p class="scene-creator__hint">
                                Upload a map, dial in the grid, then save to capture the scene for later.
                            </p>
                            <div class="scene-creator__actions">
                                <button class="btn btn--primary" type="submit" data-action="save-scene">Save Scene</button>
                                <p class="scene-creator__feedback" data-scene-feedback hidden></p>
                            </div>
                        </form>
                        <div class="scene-manager" id="scene-manager"></div>
                    </div>
                </section>
            <?php endif; ?>
            <section class="settings-view settings-view--tokens" data-settings-view="tokens" <?= $defaultTab === 'tokens' ? '' : 'hidden' ?>
            >
                <header class="settings-view__header">
                    <h3>Token Maker</h3>
                </header>
                <div class="settings-view__content" id="token-library">
                    <?= $tokenLibraryMarkup ?>
                </div>
            </section>
            <section class="settings-view settings-view--preferences" data-settings-view="preferences" hidden>
                <header class="settings-view__header">
                    <h3>Preferences</h3>
                </header>
                <div class="settings-view__content" id="vtt-preferences">
                    <p class="empty-state">Preferences configuration coming soon.</p>
                </div>
            </section>
        </div>
    </aside>
    <button
        id="vtt-settings-toggle"
        class="vtt-settings-toggle"
        type="button"
        aria-controls="vtt-settings-panel"
        aria-expanded="false"
        data-action="toggle-settings"
    >
        Settings
    </button>
    <?php
    return trim((string) ob_get_clean());
}
