<?php
declare(strict_types=1);

$routes = require __DIR__ . '/config/routes.php';

if (!defined('VERSION_SYSTEM_INTERNAL')) {
    define('VERSION_SYSTEM_INTERNAL', true);
}
require_once __DIR__ . '/../version.php';

require_once __DIR__ . '/components/ChatPanel.php';
require_once __DIR__ . '/components/CharacterSummaryPanel.php';
require_once __DIR__ . '/components/MonsterSummaryPanel.php';
require_once __DIR__ . '/components/SettingsPanel.php';
require_once __DIR__ . '/components/SceneBoard.php';
require_once __DIR__ . '/components/TokenLibrary.php';

const VTT_PLAYER_TOKEN_FOLDER = "PC's";
const VTT_BACKUP_MIN_INTERVAL_SECONDS = 1800;
const VTT_BACKUP_MAX_FILES_PER_DATA_FILE = 48;

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
 * @return array<int,string>
 */
function listVttJsonBackups(string $backupDir, string $stem): array
{
    if (!is_dir($backupDir)) {
        return [];
    }

    $entries = scandir($backupDir);
    if (!is_array($entries)) {
        return [];
    }

    $pattern = '/^' . preg_quote($stem, '/') . '-\d{8}_\d{6}\.json$/';
    $backups = [];

    foreach ($entries as $entry) {
        if (!is_string($entry) || preg_match($pattern, $entry) !== 1) {
            continue;
        }

        $path = $backupDir . '/' . $entry;
        if (is_file($path)) {
            $backups[] = $path;
        }
    }

    usort($backups, static function (string $left, string $right): int {
        $leftModified = @filemtime($left);
        $rightModified = @filemtime($right);
        $leftModified = is_int($leftModified) ? $leftModified : 0;
        $rightModified = is_int($rightModified) ? $rightModified : 0;

        if ($leftModified === $rightModified) {
            return strcmp(basename($right), basename($left));
        }

        return $rightModified <=> $leftModified;
    });

    return $backups;
}

function pruneVttJsonBackups(
    string $backupDir,
    string $stem,
    int $maxFiles = VTT_BACKUP_MAX_FILES_PER_DATA_FILE
): void {
    $maxFiles = max(0, $maxFiles);
    $backups = listVttJsonBackups($backupDir, $stem);

    foreach (array_slice($backups, $maxFiles) as $expiredBackup) {
        @unlink($expiredBackup);
    }
}

/**
 * Creates a spaced recovery snapshot and enforces a hard per-file retention cap.
 */
function maintainVttJsonBackup(
    string $filename,
    string $sourcePath,
    ?string $backupDir = null,
    ?int $now = null
): void {
    if (!is_file($sourcePath)) {
        return;
    }

    $backupDir = $backupDir ?? (__DIR__ . '/storage/backups');
    if (
        !is_dir($backupDir)
        && !mkdir($backupDir, 0775, true)
        && !is_dir($backupDir)
    ) {
        return;
    }

    $stem = basename($filename, '.json');
    $now = $now ?? time();
    $backups = listVttJsonBackups($backupDir, $stem);

    // Enforce the cap even when the next spaced snapshot is not due yet.
    if (count($backups) > VTT_BACKUP_MAX_FILES_PER_DATA_FILE) {
        pruneVttJsonBackups($backupDir, $stem);
        $backups = array_slice($backups, 0, VTT_BACKUP_MAX_FILES_PER_DATA_FILE);
    }

    $newestBackup = $backups[0] ?? null;
    if (is_string($newestBackup)) {
        $newestModified = @filemtime($newestBackup);
        if (
            is_int($newestModified)
            && ($now - $newestModified) < VTT_BACKUP_MIN_INTERVAL_SECONDS
        ) {
            return;
        }
    }

    $timestamp = date('Ymd_His', $now);
    $backupPath = $backupDir . '/' . $stem . '-' . $timestamp . '.json';
    if (@copy($sourcePath, $backupPath)) {
        @touch($backupPath, $now);
        pruneVttJsonBackups($backupDir, $stem);
    }
}

/**
 * Persists JSON data to storage with a retained backup of the previous file.
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

    maintainVttJsonBackup($filename, $path);

    return rename($tempPath, $path);
}

/**
 * Provides an exclusive lock file for board-state operations to avoid clobbered writes.
 *
 * @template T
 * @param callable():T $callback
 * @return T
 */
function withVttBoardStateLock(callable $callback)
{
    $lockDir = __DIR__ . '/storage';
    if (!is_dir($lockDir) && !mkdir($lockDir, 0775, true) && !is_dir($lockDir)) {
        throw new RuntimeException('Unable to prepare VTT storage directory.');
    }

    $lockPath = $lockDir . '/board-state.lock';
    $handle = fopen($lockPath, 'c');
    if ($handle === false) {
        throw new RuntimeException('Unable to open board state lock file.');
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('Unable to acquire the board state lock.');
        }

        return $callback();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

/**
 * Build the browser's compatibility-shaped board projection exclusively from
 * canonical Sync V2 state.
 */
function overlaySyncV2Placements(array $boardState): array
{
    $configPath = __DIR__ . '/config/sync-v2.php';
    $config = is_file($configPath) ? require $configPath : [];
    if (!is_array($config) || ($config['domains']['placements'] ?? false) !== true) {
        return $boardState;
    }
    try {
        require_once __DIR__ . '/lib/SyncV2Store.php';
        $configuredPath = getenv('VTT_SYNC_V2_DATABASE');
        $databasePath = is_string($configuredPath) && trim($configuredPath) !== ''
            ? trim($configuredPath)
            : (__DIR__ . '/storage/sync-v2.sqlite');
        $store = new SyncV2Store(
            $databasePath,
            (string) ($config['world_id'] ?? 'default'),
            (int) ($config['event_retention'] ?? 1000),
            (int) ($config['snapshot_interval'] ?? 100),
            (int) ($config['snapshot_retention'] ?? 20)
        );
        $boardDomainsEnabled = false;
        foreach ([
            'templates', 'drawings', 'pings', 'fog',
            'levels', 'scenes', 'grid', 'routing',
        ] as $domain) {
            if (($config['domains'][$domain] ?? false) === true) {
                $boardDomainsEnabled = true;
                break;
            }
        }
        $snapshot = $store->getSnapshot();
        $boardState['placements'] = [];
        foreach (($snapshot['state']['placements'] ?? []) as $sceneId => $placements) {
            if (is_string($sceneId) && is_array($placements)) {
                $boardState['placements'][$sceneId] = array_values($placements);
            }
        }
        if (($config['domains']['combat'] ?? false) === true) {
            foreach (($snapshot['state']['combat'] ?? []) as $sceneId => $combat) {
                if (!is_string($sceneId) || !is_array($combat)) {
                    continue;
                }
                $boardState['sceneState'][$sceneId] = is_array($boardState['sceneState'][$sceneId] ?? null)
                    ? $boardState['sceneState'][$sceneId]
                    : [];
                $boardState['sceneState'][$sceneId]['combat'] = $combat;
            }
        }
        if ($boardDomainsEnabled) {
            foreach (['templates', 'drawings'] as $domain) {
                if (($config['domains'][$domain] ?? false) !== true) continue;
                $boardState[$domain] = [];
                foreach (($snapshot['state'][$domain] ?? []) as $sceneId => $entries) {
                    if (is_string($sceneId) && is_array($entries)) {
                        $boardState[$domain][$sceneId] = array_values($entries);
                    }
                }
            }
            if (($config['domains']['pings'] ?? false) === true) {
                $boardState['pings'] = array_values($snapshot['state']['pings'] ?? []);
            }
            foreach (($snapshot['state']['sceneConfig'] ?? []) as $sceneId => $sceneConfig) {
                if (!is_string($sceneId) || !is_array($sceneConfig)) continue;
                $boardState['sceneState'][$sceneId] = is_array($boardState['sceneState'][$sceneId] ?? null)
                    ? $boardState['sceneState'][$sceneId]
                    : [];
                $fieldDomains = [
                    'grid' => 'grid',
                    'fogOfWar' => 'fog',
                    'mapLevels' => 'levels',
                    'userLevelState' => 'levels',
                ];
                foreach ($fieldDomains as $field => $domain) {
                    if (
                        ($config['domains'][$domain] ?? false) === true
                        && array_key_exists($field, $sceneConfig)
                    ) {
                        $boardState['sceneState'][$sceneId][$field] = $sceneConfig[$field];
                    }
                }
            }
            foreach (($snapshot['state']['routing'] ?? []) as $field => $value) {
                if (!is_string($field) || str_starts_with($field, '_')) continue;
                if (
                    ($field === 'activeSceneId' && ($config['domains']['scenes'] ?? false) === true)
                    || ($field !== 'activeSceneId' && ($config['domains']['routing'] ?? false) === true)
                ) {
                    $boardState[$field] = $value;
                }
            }
        }
    } catch (Throwable $error) {
        error_log('[VTT Sync V2] Placement overlay failed: ' . $error->getMessage());
    }
    return $boardState;
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
    $boardState = overlaySyncV2Placements([]);

    // Normalize fogOfWar revealedCells to ensure they're always JSON objects, not arrays.
    // PHP's json_encode() turns empty PHP arrays into [] (JSON array) instead of {} (JSON object).
    // JavaScript treats [] as an Array, so setting arr["36,66"] = true creates an expando property
    // that JSON.stringify() silently drops (non-numeric keys on arrays are ignored).
    // Per-level shape: fogOfWar.byLevel[levelId] = { enabled, revealedCells }.
    if (is_array($boardState) && isset($boardState['sceneState']) && is_array($boardState['sceneState'])) {
        foreach ($boardState['sceneState'] as &$scene) {
            if (!is_array($scene) || !isset($scene['fogOfWar']) || !is_array($scene['fogOfWar'])) {
                continue;
            }
            $fog = &$scene['fogOfWar'];

            // Migrate legacy { enabled, revealedCells } at the top level into byLevel['level-0'].
            $hasLegacy = array_key_exists('enabled', $fog) || array_key_exists('revealedCells', $fog);
            $hasByLevel = isset($fog['byLevel']) && is_array($fog['byLevel']);
            if ($hasLegacy && !$hasByLevel) {
                $legacyCells = (isset($fog['revealedCells']) && is_array($fog['revealedCells']))
                    ? $fog['revealedCells']
                    : [];
                $fog['byLevel'] = [
                    'level-0' => [
                        'enabled' => !empty($fog['enabled']),
                        'revealedCells' => empty($legacyCells) ? new \stdClass() : $legacyCells,
                    ],
                ];
                unset($fog['enabled'], $fog['revealedCells']);
                $hasByLevel = true;
            }

            if ($hasByLevel) {
                foreach ($fog['byLevel'] as &$levelEntry) {
                    if (!is_array($levelEntry)) continue;
                    if (!isset($levelEntry['revealedCells'])
                        || !is_array($levelEntry['revealedCells'])
                        || empty($levelEntry['revealedCells'])) {
                        $levelEntry['revealedCells'] = new \stdClass();
                    }
                }
                unset($levelEntry);
            } else {
                $fog['byLevel'] = new \stdClass();
            }
            unset($fog);
        }
        unset($scene);
    }

    if (!$isGm) {
        $tokens = filterTokensForPlayerView($tokens);
        $boardState = filterPlacementsForPlayerView($boardState);
    }

    // Load Pusher config if available
    $pusherConfig = null;
    $chatPusherConfig = null;
    $syncV2PublicConfig = [
        'mode' => 'disabled',
        'domains' => [],
    ];
    $syncV2ConfigPath = __DIR__ . '/config/sync-v2.php';
    if (is_file($syncV2ConfigPath)) {
        $syncV2Config = require $syncV2ConfigPath;
        if (is_array($syncV2Config)) {
            $syncV2PublicConfig = [
                'mode' => (string) ($syncV2Config['mode'] ?? 'disabled'),
                'domains' => is_array($syncV2Config['domains'] ?? null)
                    ? $syncV2Config['domains']
                    : [],
            ];
        }
    }
    $pusherConfigPath = __DIR__ . '/config/pusher.php';
    if (is_file($pusherConfigPath)) {
        $pusherData = require $pusherConfigPath;
        if (is_array($pusherData) && !empty($pusherData['enabled'])) {
            $pusherConfig = [
                'key' => $pusherData['key'] ?? '',
                'cluster' => $pusherData['cluster'] ?? 'us3',
                'syncV2Channel' => $isGm
                    ? ($pusherData['sync_v2_gm_channel'] ?? 'private-vtt-sync-v2-gm')
                    : ($pusherData['sync_v2_player_channel'] ?? 'private-vtt-sync-v2-players'),
                'syncV2AuthEndpoint' => $routes['syncV2Auth'] ?? '/dnd/vtt/api/v2/pusher-auth.php',
            ];
            $chatChannel = $pusherData['chat_channel'] ?? 'dnd-chat';
            if (!empty($pusherData['key']) && $chatChannel !== '') {
                $chatPusherConfig = [
                    'key' => $pusherData['key'],
                    'cluster' => $pusherData['cluster'] ?? 'us3',
                    'channel' => $chatChannel,
                ];
            }
        }
    }

    return [
        'routes' => $routes,
        'scenes' => $scenes,
        'tokens' => $tokens,
        'boardState' => $boardState,
        // Keep asset URLs stable between deploys so browser caching works.
        // The repository version build is incremented when assets change.
        'assetsVersion' => Version::getBuildNumber(),
        'isGM' => $isGm,
        'currentUser' => $context['user'] ?? '',
        'chatParticipants' => loadChatParticipants(),
        'chatHandlerUrl' => $routes['chat'] ?? '/dnd/chat_handler.php',
        'pusher' => $pusherConfig,
        'chatPusher' => $chatPusherConfig,
        'syncV2' => $syncV2PublicConfig,
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
        'characterSummaryPanel' => renderVttCharacterSummaryPanel(),
        'monsterSummaryPanel' => renderVttMonsterSummaryPanel(),
        'settingsPanel' => renderVttSettingsPanel($tokenLibraryMarkup, $isGm),
        'sceneBoard' => renderVttSceneBoard($isGm),
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
    $playerMapDisabled = !empty($filtered['playerMapDisabled']);
    if ($playerMapDisabled) {
        $filtered['activeSceneId'] = null;
        $filtered['mapUrl'] = null;
        $filtered['thumbnailUrl'] = null;
    }

    $playerSceneId = $filtered['playerActiveSceneId'] ?? null;
    if (!$playerMapDisabled && is_string($playerSceneId) && trim($playerSceneId) !== '') {
        $filtered['activeSceneId'] = is_string($playerSceneId) && trim($playerSceneId) !== ''
            ? trim($playerSceneId)
            : null;
    }

    $playerMapUrl = $filtered['playerMapUrl'] ?? null;
    if (!$playerMapDisabled && is_string($playerMapUrl) && trim($playerMapUrl) !== '') {
        $filtered['mapUrl'] = is_string($playerMapUrl) && trim($playerMapUrl) !== ''
            ? trim($playerMapUrl)
            : null;
    }

    $playerThumbnailUrl = $filtered['playerThumbnailUrl'] ?? null;
    if (!$playerMapDisabled && is_string($playerThumbnailUrl) && trim($playerThumbnailUrl) !== '') {
        $filtered['thumbnailUrl'] = is_string($playerThumbnailUrl) && trim($playerThumbnailUrl) !== ''
            ? trim($playerThumbnailUrl)
            : null;
    }

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
                // Hidden placements are GM-only information. Omitting them
                // prevents coordinates, identity, and stat data from leaking
                // through authenticated player GET responses.
                continue;
            }
            $visibleEntries[] = sanitizePlacementForPlayerView($placement);
        }

        $visiblePlacements[$sceneId] = array_values($visibleEntries);
    }

    $filtered['placements'] = $visiblePlacements;

    if (isset($filtered['sceneState']) && is_array($filtered['sceneState'])) {
        foreach ($filtered['sceneState'] as $sceneId => &$sceneEntry) {
            if (!is_array($sceneEntry) || !isset($sceneEntry['combat']) || !is_array($sceneEntry['combat'])) {
                continue;
            }
            $scenePlacements = isset($placements[$sceneId]) && is_array($placements[$sceneId])
                ? $placements[$sceneId]
                : [];
            $sceneEntry['combat'] = sanitizeCombatStateForPlayerView(
                $sceneEntry['combat'],
                $scenePlacements
            );
        }
        unset($sceneEntry);
    }

    return $filtered;
}

/**
 * Remove hidden placement identities from the shared player combat view.
 *
 * @param array<string,mixed> $combat
 * @param array<int,mixed> $placements
 * @return array<string,mixed>
 */
function sanitizeCombatStateForPlayerView(array $combat, array $placements): array
{
    $visibleIds = [];
    foreach ($placements as $placement) {
        if (!is_array($placement)) {
            continue;
        }
        $placementId = $placement['id'] ?? null;
        if (!is_string($placementId) || trim($placementId) === '') {
            continue;
        }
        $placementId = trim($placementId);
        if (isPlacementHiddenFromPlayers($placement)) {
            continue;
        } else {
            $visibleIds[$placementId] = true;
        }
    }

    $safe = $combat;
    $hiddenActive = is_string($safe['activeCombatantId'] ?? null)
        && trim($safe['activeCombatantId']) !== ''
        && !isset($visibleIds[trim($safe['activeCombatantId'])]);
    if ($hiddenActive) {
        // Preserve the fact that a turn is active without exposing which
        // hidden monster is taking it.
        $safe['activeCombatantId'] = '__hidden_enemy__';
    }

    if (isset($safe['completedCombatantIds']) && is_array($safe['completedCombatantIds'])) {
        $safe['completedCombatantIds'] = array_values(array_filter(
            $safe['completedCombatantIds'],
            static fn($id): bool => is_string($id) && isset($visibleIds[trim($id)])
        ));
    }

    if (isset($safe['groups']) && is_array($safe['groups'])) {
        $safeGroups = [];
        foreach ($safe['groups'] as $group) {
            if (!is_array($group)) {
                continue;
            }
            $members = isset($group['memberIds']) && is_array($group['memberIds'])
                ? array_values(array_filter(
                    $group['memberIds'],
                    static fn($id): bool => is_string($id) && isset($visibleIds[trim($id)])
                ))
                : [];
            if (count($members) <= 1) {
                continue;
            }
            $representativeId = is_string($group['representativeId'] ?? null)
                && isset($visibleIds[trim($group['representativeId'])])
                ? trim($group['representativeId'])
                : $members[0];
            $safeGroups[] = [
                'representativeId' => $representativeId,
                'memberIds' => $members,
            ];
        }
        $safe['groups'] = $safeGroups;
    }

    if ($hiddenActive && isset($safe['turnLock']) && is_array($safe['turnLock'])) {
        $safe['turnLock']['combatantId'] = '__hidden_enemy__';
    }

    foreach (['lastEffect', 'lastEffects'] as $field) {
        if ($field === 'lastEffect') {
            $effect = $safe[$field] ?? null;
            if (is_array($effect) && combatEffectReferencesNonPublicPlacement($effect, $visibleIds)) {
                $safe[$field] = null;
            }
            continue;
        }
        if (isset($safe[$field]) && is_array($safe[$field])) {
            $safe[$field] = array_values(array_filter(
                $safe[$field],
                static fn($effect): bool =>
                    is_array($effect) && !combatEffectReferencesNonPublicPlacement($effect, $visibleIds)
            ));
        }
    }

    return $safe;
}

/**
 * @param array<string,mixed> $effect
 * @param array<string,bool> $visibleIds
 */
function combatEffectReferencesNonPublicPlacement(array $effect, array $visibleIds): bool
{
    foreach (['placementId', 'combatantId'] as $field) {
        $value = $effect[$field] ?? null;
        if (is_string($value) && trim($value) !== '' && !isset($visibleIds[trim($value)])) {
            return true;
        }
    }
    return false;
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
    $sanitized = attachSafeMovementTrait($token);
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
        $sanitized = attachSafeMovementTrait($sanitized);
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
 * @param array<string,mixed> $entity
 * @return array<string,mixed>
 */
function attachSafeMovementTrait(array $entity): array
{
    $speed = extractSafeMovementSpeed($entity);
    if ($speed === null) {
        return $entity;
    }

    $traits = isset($entity['traits']) && is_array($entity['traits']) ? $entity['traits'] : [];
    $traits['speed'] = $speed;
    $entity['traits'] = $traits;
    return $entity;
}

/**
 * @param array<string,mixed> $entity
 */
function extractSafeMovementSpeed(array $entity): ?int
{
    $metadata = isset($entity['metadata']) && is_array($entity['metadata']) ? $entity['metadata'] : [];
    $monster = isset($entity['monster']) && is_array($entity['monster']) ? $entity['monster'] : [];
    $metadataMonster = isset($metadata['monster']) && is_array($metadata['monster']) ? $metadata['monster'] : [];
    $traits = isset($entity['traits']) && is_array($entity['traits']) ? $entity['traits'] : [];
    $metadataTraits = isset($metadata['traits']) && is_array($metadata['traits']) ? $metadata['traits'] : [];

    $candidates = [
        $traits['speed'] ?? null,
        $entity['movementSpeed'] ?? null,
        $entity['speed'] ?? null,
        $entity['movement'] ?? null,
        $metadataTraits['speed'] ?? null,
        $metadata['movementSpeed'] ?? null,
        $metadata['speed'] ?? null,
        $metadata['movement'] ?? null,
        $monster['speed'] ?? null,
        $monster['movement'] ?? null,
        $metadataMonster['speed'] ?? null,
        $metadataMonster['movement'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        $parsed = parseSafeMovementSpeed($candidate);
        if ($parsed !== null) {
            return $parsed;
        }
    }

    return null;
}

/**
 * @param mixed $value
 */
function parseSafeMovementSpeed($value): ?int
{
    if (is_int($value) || is_float($value)) {
        return max(0, (int) $value);
    }
    if (!is_string($value)) {
        return null;
    }
    $trimmed = trim($value);
    if ($trimmed === '') {
        return null;
    }
    if (is_numeric($trimmed)) {
        return max(0, (int) $trimmed);
    }
    if (preg_match('/-?\d+/', $trimmed, $matches) === 1) {
        return max(0, (int) $matches[0]);
    }
    return null;
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
