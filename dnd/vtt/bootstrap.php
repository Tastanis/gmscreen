<?php
declare(strict_types=1);

$routes = require __DIR__ . '/config/routes.php';

require_once __DIR__ . '/components/ChatPanel.php';
require_once __DIR__ . '/components/SettingsPanel.php';
require_once __DIR__ . '/components/SceneBoard.php';
require_once __DIR__ . '/components/TokenLibrary.php';

const VTT_PLAYER_TOKEN_FOLDER = "PC's";

function normalizeTokenFolderKey($value): string
{
    if (!is_string($value)) {
        return '';
    }

    $normalized = strtolower(trim($value));
    if ($normalized === '') {
        return '';
    }

    $sanitized = preg_replace('/[^a-z0-9]/', '', $normalized);
    return is_string($sanitized) ? $sanitized : '';
}

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
    $boardState = loadVttJson('board-state.json');
    if (!$isGm) {
        $tokens = filterTokensForPlayerView($tokens);
        $boardState = filterPlacementsForPlayerView($boardState);
    }

    return [
        'routes' => $routes,
        'scenes' => $scenes,
        'tokens' => $tokens,
        'boardState' => $boardState,
        'assetsVersion' => time(),
        'isGM' => $isGm,
        'currentUser' => $context['user'] ?? '',
        'chatParticipants' => loadChatParticipants(),
        'chatHandlerUrl' => $routes['chat'] ?? '/dnd/chat_handler.php',
    ];
}

/**
 * Builds render-ready markup for server-rendered components.
 */
function buildVttSections(bool $isGm = false): array
{
    $tokenLibraryMarkup = renderVttTokenLibrary($isGm);

    return [
        'chatPanel' => renderVttChatPanel($isGm),
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
 * @return array<int,array{id:string,label:string}>
 */
function loadChatParticipants(): array
{
    static $participants = null;

    if ($participants !== null) {
        return $participants;
    }

    $mapPath = __DIR__ . '/../includes/chat_participants.php';
    if (!is_file($mapPath)) {
        $participants = [];
        return $participants;
    }

    $raw = require $mapPath;
    if (!is_array($raw)) {
        $participants = [];
        return $participants;
    }

    $list = [];
    foreach ($raw as $id => $label) {
        $idString = (string) $id;
        $labelString = trim((string) $label);
        $list[] = [
            'id' => $idString,
            'label' => $labelString !== '' ? $labelString : $idString,
        ];
    }

    $participants = $list;
    return $participants;
}

/**
 * @param array{folders:array<int,array>,items:array<int,array>} $tokens
 * @return array{folders:array<int,array>,items:array<int,array>}
 */
function filterTokensForPlayerView(array $tokens): array
{
    $playerFolderKey = normalizeTokenFolderKey(VTT_PLAYER_TOKEN_FOLDER);
    if ($playerFolderKey === '') {
        return ['folders' => [], 'items' => []];
    }

    $visibleFolders = [];
    $folderIndex = [];

    foreach ($tokens['folders'] ?? [] as $folder) {
        if (!is_array($folder)) {
            continue;
        }

        $name = isset($folder['name']) ? (string) $folder['name'] : '';
        if (normalizeTokenFolderKey($name) !== $playerFolderKey) {
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
            $visibleTokens[] = sanitizeTokenForPlayerView($token);
            continue;
        }

        $folderMeta = $token['folder'] ?? null;
        if (is_array($folderMeta)) {
            $name = isset($folderMeta['name']) ? (string) $folderMeta['name'] : '';
            if (normalizeTokenFolderKey($name) === $playerFolderKey) {
                if ($folderId !== '') {
                    $visibleFolders[$folderId] = [
                        'id' => $folderId,
                        'name' => VTT_PLAYER_TOKEN_FOLDER,
                    ];
                }
                $visibleTokens[] = sanitizeTokenForPlayerView($token);
            }
        }
    }

    return [
        'folders' => array_values($visibleFolders),
        'items' => array_values($visibleTokens),
    ];
}

/**
 * @param array<string,mixed>|mixed $boardState
 * @return array<string,mixed>
 */
function filterPlacementsForPlayerView($boardState): array
{
    if (!is_array($boardState)) {
        return [];
    }

    $filtered = $boardState;
    $placements = isset($filtered['placements']) && is_array($filtered['placements'])
        ? $filtered['placements']
        : [];

    $visiblePlacements = [];
    foreach ($placements as $sceneId => $entries) {
        if (!is_array($entries)) {
            $visiblePlacements[$sceneId] = [];
            continue;
        }

        $visibleEntries = [];
        foreach ($entries as $placement) {
            if (!is_array($placement)) {
                continue;
            }
            if (isPlacementHiddenFromPlayers($placement)) {
                continue;
            }
            $visibleEntries[] = sanitizePlacementForPlayerView($placement);
        }

        $visiblePlacements[$sceneId] = array_values($visibleEntries);
    }

    $filtered['placements'] = $visiblePlacements;

    return $filtered;
}

/**
 * @param array<string,mixed> $placement
 */
function isPlacementHiddenFromPlayers(array $placement): bool
{
    if (array_key_exists('hidden', $placement)) {
        return normalizeBooleanFlag($placement['hidden'], false);
    }

    if (array_key_exists('isHidden', $placement)) {
        return normalizeBooleanFlag($placement['isHidden'], false);
    }

    if (isset($placement['flags']) && is_array($placement['flags']) && array_key_exists('hidden', $placement['flags'])) {
        return normalizeBooleanFlag($placement['flags']['hidden'], false);
    }

    return false;
}

/**
 * @param array<string,mixed> $token
 * @return array<string,mixed>
 */
function sanitizeTokenForPlayerView(array $token): array
{
    $sanitized = $token;
    unset($sanitized['monster'], $sanitized['monsterId']);

    if (isset($sanitized['metadata']) && is_array($sanitized['metadata'])) {
        $metadata = $sanitized['metadata'];
        unset($metadata['monster'], $metadata['monsterId']);
        $sanitized['metadata'] = $metadata === [] ? [] : $metadata;
        if ($sanitized['metadata'] === []) {
            unset($sanitized['metadata']);
        }
    }

    return $sanitized;
}

/**
 * @param array<string,mixed> $placement
 * @return array<string,mixed>
 */
function sanitizePlacementForPlayerView(array $placement): array
{
    $sanitized = $placement;

    if (!canPlayersViewPlacementMonster($placement)) {
        unset($sanitized['monster'], $sanitized['monsterId']);

        if (isset($sanitized['metadata']) && is_array($sanitized['metadata'])) {
            $metadata = $sanitized['metadata'];
            unset($metadata['monster'], $metadata['monsterId']);
            $sanitized['metadata'] = $metadata === [] ? [] : $metadata;
            if ($sanitized['metadata'] === []) {
                unset($sanitized['metadata']);
            }
        }
    }

    return $sanitized;
}

/**
 * @param array<string,mixed> $placement
 */
function canPlayersViewPlacementMonster(array $placement): bool
{
    $team = normalizeCombatTeamFlag($placement['combatTeam'] ?? ($placement['team'] ?? null));
    return $team === 'ally';
}

/**
 * @param mixed $value
 */
function normalizeCombatTeamFlag($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = strtolower(trim($value));
    if ($normalized === 'ally') {
        return 'ally';
    }

    if ($normalized === 'enemy') {
        return 'enemy';
    }

    return null;
}

/**
 * @param mixed $value
 */
function normalizeBooleanFlag($value, bool $fallback = false): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_int($value) || is_float($value)) {
        return (int) $value !== 0;
    }

    if (is_string($value)) {
        $normalized = strtolower(trim($value));
        if ($normalized === '') {
            return $fallback;
        }

        if (in_array($normalized, ['true', '1', 'yes', 'on'], true)) {
            return true;
        }

        if (in_array($normalized, ['false', '0', 'no', 'off'], true)) {
            return false;
        }

        return $fallback;
    }

    if (is_object($value) && method_exists($value, '__toString')) {
        return normalizeBooleanFlag((string) $value, $fallback);
    }

    return $fallback;
}
