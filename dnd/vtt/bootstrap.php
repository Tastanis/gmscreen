<?php
declare(strict_types=1);

$routes = require __DIR__ . '/config/routes.php';

require_once __DIR__ . '/components/ChatPanel.php';
require_once __DIR__ . '/components/SettingsPanel.php';
require_once __DIR__ . '/components/SceneBoard.php';
require_once __DIR__ . '/components/TokenLibrary.php';

/**
 * Loads JSON data from storage with graceful fallbacks.
 *
 * @return array<string,mixed>|array<int,mixed>
 */
function loadVttJson(string $filename)
{
    $path = __DIR__ . '/storage/' . $filename;
    if (!is_readable($path)) {
        return [];
    }

    $contents = file_get_contents($path);
    if ($contents === false || $contents === '') {
        return [];
    }

    $data = json_decode($contents, true);
    return is_array($data) ? $data : [];
}

/**
 * Persists JSON data to storage with a timestamped backup of the previous file.
 */
function saveVttJson(string $filename, $data): bool
{
    $path = __DIR__ . '/storage/' . $filename;
    $directory = dirname($path);

    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        return false;
    }

    $encoded = json_encode($data, JSON_PRETTY_PRINT);
    if ($encoded === false) {
        return false;
    }

    $tempPath = $path . '.tmp';
    if (file_put_contents($tempPath, $encoded) === false) {
        return false;
    }

    if (is_file($path)) {
        $backupDir = __DIR__ . '/storage/backups';
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0775, true);
        }
        $timestamp = date('Ymd_His');
        @copy($path, $backupDir . '/' . basename($filename, '.json') . '-' . $timestamp . '.json');
    }

    return rename($tempPath, $path);
}

/**
 * Provides a configuration snapshot for bootstrapping the front end.
 */
function getVttBootstrapConfig(): array
{
    global $routes;

    return [
        'routes' => $routes,
        'scenes' => loadVttJson('scenes.json'),
        'tokens' => loadVttJson('tokens.json'),
        'boardState' => loadVttJson('board-state.json'),
        'assetsVersion' => time(),
    ];
}

/**
 * Builds render-ready markup for server-rendered components.
 */
function buildVttSections(): array
{
    $tokenLibraryMarkup = renderVttTokenLibrary();

    return [
        'chatPanel' => renderVttChatPanel(),
        'settingsPanel' => renderVttSettingsPanel($tokenLibraryMarkup),
        'sceneBoard' => renderVttSceneBoard(),
        'tokenLibrary' => $tokenLibraryMarkup,
    ];
}

/**
 * Renders the full layout template.
 */
function renderVttLayout(array $sections, array $config): string
{
    ob_start();
    $routes = $config['routes'] ?? [];
    include __DIR__ . '/templates/layout.php';
    return (string) ob_get_clean();
}
