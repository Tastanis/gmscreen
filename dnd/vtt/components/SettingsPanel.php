<?php
declare(strict_types=1);

function renderVttSettingsPanel(string $tokenLibraryMarkup = ''): string
{
    ob_start();
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
                <button class="settings-tab is-active" data-settings-tab="scenes" type="button">Scenes</button>
                <button class="settings-tab" data-settings-tab="tokens" type="button">Tokens</button>
                <button class="settings-tab" data-settings-tab="preferences" type="button">Preferences</button>
            </nav>
            <section class="settings-view settings-view--scenes" data-settings-view="scenes">
                <header class="settings-view__header">
                    <h3>Scene Manager</h3>
                    <button class="btn btn--primary" type="button" data-action="create-scene">New Scene</button>
                </header>
                <div class="settings-view__content" id="scene-manager"></div>
            </section>
            <section class="settings-view settings-view--tokens" data-settings-view="tokens" hidden>
                <header class="settings-view__header">
                    <h3>Token Maker</h3>
                    <button class="btn btn--primary" type="button" data-action="create-token">New Token</button>
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
