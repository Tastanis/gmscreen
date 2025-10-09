<?php
declare(strict_types=1);

$routes = require __DIR__ . '/config/routes.php';

require_once __DIR__ . '/components/ChatPanel.php';
require_once __DIR__ . '/components/SettingsPanel.php';
require_once __DIR__ . '/components/SceneBoard.php';
require_once __DIR__ . '/components/TokenLibrary.php';

const VTT_PLAYER_TOKEN_FOLDER = "PC's";

function ensureVttSession(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
}

/**
 * @return array{user:string,isLoggedIn:bool,isGM:bool}
 */
function getVttUserContext(): array
{
    ensureVttSession();

    $user = isset($_SESSION['user']) ? (string) $_SESSION['user'] : '';
    $isLoggedIn = isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true;
    $isGm = $isLoggedIn && strcasecmp($user, 'GM') === 0;

    return [
        'user' => $user,
        'isLoggedIn' => $isLoggedIn,
        'isGM' => $isGm,
    ];
}

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
function getVttBootstrapConfig(?array $authContext = null): array
{
    global $routes;

    $context = $authContext ?? getVttUserContext();
    $isGm = (bool) ($context['isGM'] ?? false);

    $scenes = loadVttScenes();
    $tokens = loadVttTokens();
    if (!$isGm) {
        $tokens = filterTokensForPlayerView($tokens);
    }

    return [
        'routes' => $routes,
        'scenes' => $scenes,
        'tokens' => $tokens,
        'boardState' => loadVttJson('board-state.json'),
        'assetsVersion' => time(),
        'isGM' => $isGm,
        'currentUser' => $context['user'] ?? '',
    ];
}

/**
 * Builds render-ready markup for server-rendered components.
 */
function buildVttSections(bool $isGm = false): array
{
    $tokenLibraryMarkup = renderVttTokenLibrary($isGm);

    return [
        'chatPanel' => renderVttChatPanel(),
        'settingsPanel' => renderVttSettingsPanel($tokenLibraryMarkup, $isGm),
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

/**
 * @return array{folders:array<int,array>,items:array<int,array>}
 */
function loadVttScenes(): array
{
    $data = loadVttJson('scenes.json');
    if (!is_array($data)) {
        return ['folders' => [], 'items' => []];
    }

    $folders = array_filter($data['folders'] ?? [], 'is_array');
    $items = $data['scenes'] ?? $data['items'] ?? [];
    $items = array_filter(is_array($items) ? $items : [], 'is_array');

    return [
        'folders' => array_values($folders),
        'items' => array_values($items),
    ];
}

/**
 * @return array{folders:array<int,array>,items:array<int,array>}
 */
function loadVttTokens(): array
{
    $data = loadVttJson('tokens.json');
    if (!is_array($data)) {
        return ['folders' => [], 'items' => []];
    }

    $folders = array_filter($data['folders'] ?? [], 'is_array');
    $items = $data['tokens'] ?? $data['items'] ?? [];
    $items = array_filter(is_array($items) ? $items : [], 'is_array');

    return [
        'folders' => array_values($folders),
        'items' => array_values($items),
    ];
}

/**
 * @param array{folders:array<int,array>,items:array<int,array>} $tokens
 * @return array{folders:array<int,array>,items:array<int,array>}
 */
function filterTokensForPlayerView(array $tokens): array
{
    $visibleFolders = [];
    $folderIndex = [];

    foreach ($tokens['folders'] ?? [] as $folder) {
        if (!is_array($folder)) {
            continue;
        }

        $name = isset($folder['name']) ? trim((string) $folder['name']) : '';
        if ($name !== VTT_PLAYER_TOKEN_FOLDER) {
            continue;
        }

        $id = isset($folder['id']) ? (string) $folder['id'] : '';
        if ($id === '') {
            continue;
        }

        $visibleFolders[$id] = [
            'id' => $id,
            'name' => VTT_PLAYER_TOKEN_FOLDER,
        ];
        $folderIndex[$id] = true;
    }

    $visibleTokens = [];

    foreach ($tokens['items'] ?? [] as $token) {
        if (!is_array($token)) {
            continue;
        }

        $folderId = isset($token['folderId']) ? (string) $token['folderId'] : '';
        if ($folderId !== '' && isset($folderIndex[$folderId])) {
            $visibleTokens[] = $token;
            continue;
        }

        $folderMeta = $token['folder'] ?? null;
        if (is_array($folderMeta)) {
            $name = isset($folderMeta['name']) ? trim((string) $folderMeta['name']) : '';
            if ($name === VTT_PLAYER_TOKEN_FOLDER) {
                if ($folderId !== '') {
                    $visibleFolders[$folderId] = [
                        'id' => $folderId,
                        'name' => VTT_PLAYER_TOKEN_FOLDER,
                    ];
                }
                $visibleTokens[] = $token;
            }
        }
    }

    return [
        'folders' => array_values($visibleFolders),
        'items' => array_values($visibleTokens),
    ];
}
