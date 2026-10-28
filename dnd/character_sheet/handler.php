<?php
require_once __DIR__ . "/AtomicJsonFile.php";
require_once __DIR__ . "/CharacterWriteReceipts.php";
require_once __DIR__ . "/SheetChanges.php";
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
require_once __DIR__ . '/../includes/players.php'; players_gate(); // a player turned off is logged out

// Every player on the site's list, on or off (includes/players.php): a new one gets a blank sheet, an off one keeps theirs.
$characters = players_ids();
$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/character_sheets.json';
$heroTokenFile = $dataDir . '/hero_tokens.json';
$currentUser = isset($_SESSION['user']) ? $_SESSION['user'] : '';
$is_gm = ($currentUser === 'GM');

function getDefaultCharacterEntry() {
    return array(
        'hero' => array(
            'name' => '',
            'level' => 1,
            'class' => '',
            'complication' => '',
            'ancestry' => '',
            'culture' => array(
                'culture' => '',
                'environment' => '',
                'organization' => '',
                'upbringing' => '',
            ),
            'career' => array(
                'career' => '',
                'incitingIncident' => '',
            ),
            'classTrack' => '',
            'wealth' => '',
            'renown' => '',
            'xp' => '',
            'victories' => '',
            'surges' => '',
            'resource' => array(
                'title' => 'Resource',
                'value' => '',
                // Talent's Clarity is the only heroic resource that legally
                // drops below 0 ("spend resource you don't have, take damage
                // per negative point at end of turn, strained state"). The
                // checkbox on the sheet's resource editor flips this on.
                // Floor when allowed = -(1 + Reason).
                'allowNegative' => false,
            ),
            'heroTokens' => array(false, false),
            'stats' => array(
                'might' => 0,
                'agility' => 0,
                'reason' => 0,
                'intuition' => 0,
                'presence' => 0,
            ),
            'vitals' => array(
                'size' => '',
                'speed' => '',
                'stability' => '',
                'disengage' => '',
                'save' => '',
                'staminaMax' => 0,
                'recoveriesMax' => 0,
                'currentStamina' => 0,
                'currentRecoveries' => 0,
                'recoveryValue' => '',
                // Temporary Stamina, its own number (Director's ruling, October 2026): damage takes it first,
                // gaining it keeps the higher, healing never touches it, and it ends with combat.
                'tempStamina' => 0,
            ),
            'bonuses' => array(),
            'hirelings' => array(),
        ),
        'sidebar' => array(
            'lists' => array(
                'common' => array(),
                'vulnerability' => array(),
                'immunity' => array(),
                'languages' => array(),
            ),
            'skills' => array(),
            'resource' => array(
                'title' => 'Resource',
                'text' => '',
            ),
        ),
        'features' => array(),
        'actions' => array(
            'mains' => array(),
            'maneuvers' => array(),
            'triggers' => array(),
            'freeStrikes' => array(),
        ),
    );
}

function buildDefaultCharacterSheets($characters) {
    $defaultEntry = getDefaultCharacterEntry();
    $data = array();

    foreach ($characters as $character) {
        $data[$character] = $defaultEntry;
    }

    return $data;
}

function ensureCharacterSheetStorage($dataDir, $dataFile, $characters) {
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }

    if (!file_exists($dataFile)) {
        $defaultSheets = buildDefaultCharacterSheets($characters);
        file_put_contents($dataFile, json_encode($defaultSheets, JSON_PRETTY_PRINT));
    }
}

function loadHeroTokens($dataDir, $heroTokenFile) {
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }

    if (!file_exists($heroTokenFile)) {
        $defaultTokens = array(false, false);
        file_put_contents($heroTokenFile, json_encode($defaultTokens, JSON_PRETTY_PRINT));
        return $defaultTokens;
    }

    $content = file_get_contents($heroTokenFile);
    $tokens = json_decode($content, true);
    if (!is_array($tokens) || count($tokens) < 2) {
        return array(false, false);
    }

    return array((bool)$tokens[0], (bool)$tokens[1]);
}

function saveHeroTokens($heroTokenFile, $tokens) {
    $normalized = array((bool)($tokens[0] ?? false), (bool)($tokens[1] ?? false));
    return file_put_contents($heroTokenFile, json_encode($normalized, JSON_PRETTY_PRINT)) !== false;
}

function normalize_identity_group($value, $defaults) {
    if (is_string($value)) {
        $keys = array_keys($defaults);
        $defaults[$keys[0]] = $value;
        return $defaults;
    }

    if (!is_array($value)) {
        return $defaults;
    }

    return array_merge($defaults, $value);
}

function normalize_vitals($vitals, $defaults) {
    if (!is_array($vitals)) {
        $vitals = array();
    }

    $legacyStamina = isset($vitals['stamina']) ? $vitals['stamina'] : null;
    $legacyRecoveries = isset($vitals['recoveries']) ? $vitals['recoveries'] : null;

    $normalized = $defaults;
    $normalized['size'] = isset($vitals['size']) ? $vitals['size'] : $defaults['size'];
    $normalized['speed'] = isset($vitals['speed']) ? $vitals['speed'] : $defaults['speed'];
    $normalized['stability'] = isset($vitals['stability']) ? $vitals['stability'] : $defaults['stability'];
    $normalized['disengage'] = isset($vitals['disengage']) ? $vitals['disengage'] : $defaults['disengage'];
    $normalized['save'] = isset($vitals['save']) ? $vitals['save'] : $defaults['save'];
    $normalized['recoveryValue'] = isset($vitals['recoveryValue']) ? $vitals['recoveryValue'] : $defaults['recoveryValue'];

    $normalized['staminaMax'] = isset($vitals['staminaMax']) ? $vitals['staminaMax'] : ($legacyStamina !== null ? $legacyStamina : $defaults['staminaMax']);
    $normalized['recoveriesMax'] = isset($vitals['recoveriesMax']) ? $vitals['recoveriesMax'] : ($legacyRecoveries !== null ? $legacyRecoveries : $defaults['recoveriesMax']);
    $normalized['currentStamina'] = isset($vitals['currentStamina']) ? $vitals['currentStamina'] : ($legacyStamina !== null ? $legacyStamina : $defaults['currentStamina']);
    $normalized['currentRecoveries'] = isset($vitals['currentRecoveries']) ? $vitals['currentRecoveries'] : ($legacyRecoveries !== null ? $legacyRecoveries : $defaults['currentRecoveries']);
    $normalized['tempStamina'] = isset($vitals['tempStamina']) ? $vitals['tempStamina'] : 0;

    // Stamina above the maximum (how temporary Stamina used to be kept) becomes temporary Stamina. Idempotent.
    return SheetChanges::migrateTempVitals($normalized);
}

function normalize_skills($skills) {
    $normalized = array();
    if (!is_array($skills)) {
        return $normalized;
    }

    foreach ($skills as $skill => $data) {
        if (is_string($data)) {
            if ($data !== 'Untrained') {
                $normalized[$skill] = array('level' => $data ?: 'Trained', 'bonus' => '');
            }
        } elseif (is_array($data)) {
            $level = isset($data['level']) ? $data['level'] : 'Trained';
            if ($level !== 'Untrained') {
                $normalized[$skill] = array(
                    'level' => $level,
                    'bonus' => isset($data['bonus']) ? $data['bonus'] : '',
                );
            }
        }
    }

    return $normalized;
}

function mergeCharacterDefaults($entry, $defaults) {
    $normalized = $defaults;

    if (isset($entry['hero']) && is_array($entry['hero'])) {
        $heroInput = $entry['hero'];
        $normalized['hero'] = array_merge($defaults['hero'], $heroInput);

        if (isset($heroInput['resource']) && is_array($heroInput['resource'])) {
            $normalized['hero']['resource'] = array_merge($defaults['hero']['resource'], $heroInput['resource']);
        }

        if (isset($heroInput['stats']) && is_array($heroInput['stats'])) {
            $normalized['hero']['stats'] = array_merge($defaults['hero']['stats'], $heroInput['stats']);
        }

        $normalized['hero']['vitals'] = normalize_vitals(isset($heroInput['vitals']) ? $heroInput['vitals'] : array(), $defaults['hero']['vitals']);
        $normalized['hero']['culture'] = normalize_identity_group(isset($heroInput['culture']) ? $heroInput['culture'] : null, $defaults['hero']['culture']);
        $normalized['hero']['career'] = normalize_identity_group(isset($heroInput['career']) ? $heroInput['career'] : null, $defaults['hero']['career']);

        if (isset($heroInput['heroTokens']) && is_array($heroInput['heroTokens'])) {
            $normalized['hero']['heroTokens'] = array(
                isset($heroInput['heroTokens'][0]) ? (bool)$heroInput['heroTokens'][0] : false,
                isset($heroInput['heroTokens'][1]) ? (bool)$heroInput['heroTokens'][1] : false,
            );
        }

        if (isset($heroInput['bonuses']) && is_array($heroInput['bonuses'])) {
            $normalized['hero']['bonuses'] = $heroInput['bonuses'];
        }

        if (isset($heroInput['hirelings']) && is_array($heroInput['hirelings'])) {
            $normalized['hero']['hirelings'] = $heroInput['hirelings'];
        }
    }

    // Migrate legacy resource label/value
    if (isset($entry['resourceLabel'])) {
        $normalized['hero']['resource']['title'] = $entry['resourceLabel'];
        $normalized['sidebar']['resource']['title'] = $entry['resourceLabel'];
    }
    if (isset($entry['hero']['resourceValue'])) {
        $normalized['hero']['resource']['value'] = $entry['hero']['resourceValue'];
    }

    if (isset($entry['sidebar']) && is_array($entry['sidebar'])) {
        if (isset($entry['sidebar']['lists']) && is_array($entry['sidebar']['lists'])) {
            $lists = array_merge($defaults['sidebar']['lists'], $entry['sidebar']['lists']);
            if (isset($entry['sidebar']['lists']['weaknesses']) && !isset($entry['sidebar']['lists']['vulnerability'])) {
                $lists['vulnerability'] = $entry['sidebar']['lists']['weaknesses'];
            }
            if (isset($entry['sidebar']['lists']['vulnerabilities']) && !isset($entry['sidebar']['lists']['immunity'])) {
                $lists['immunity'] = $entry['sidebar']['lists']['vulnerabilities'];
            }
            $normalized['sidebar']['lists'] = $lists;
        }

        if (isset($entry['sidebar']['skills']) && is_array($entry['sidebar']['skills'])) {
            $normalized['sidebar']['skills'] = normalize_skills($entry['sidebar']['skills']);
        }

        if (isset($entry['sidebar']['resource']) && is_array($entry['sidebar']['resource'])) {
            $normalized['sidebar']['resource'] = array_merge($defaults['sidebar']['resource'], $entry['sidebar']['resource']);
        }
    }

    if (isset($entry['features']) && is_array($entry['features'])) {
        $normalized['features'] = $entry['features'];
    }

    if (isset($entry['actions']) && is_array($entry['actions'])) {
        foreach ($defaults['actions'] as $type => $defaultActions) {
            if (isset($entry['actions'][$type]) && is_array($entry['actions'][$type])) {
                $normalized['actions'][$type] = $entry['actions'][$type];
            }
        }
    }

    return $normalized;
}

function sheet_content_score($entry) {
    if (!is_array($entry)) {
        return 0;
    }

    $score = 0;
    $hero = isset($entry['hero']) && is_array($entry['hero']) ? $entry['hero'] : array();

    foreach (array('name', 'class', 'classTrack', 'complication', 'ancestry', 'wealth', 'renown', 'xp', 'victories', 'surges') as $key) {
        if (isset($hero[$key]) && trim((string)$hero[$key]) !== '') {
            $score++;
        }
    }

    if (isset($hero['level']) && (int)$hero['level'] > 1) {
        $score++;
    }

    foreach (array('culture', 'career', 'stats', 'vitals', 'bonuses', 'hirelings') as $key) {
        if (!isset($hero[$key]) || !is_array($hero[$key])) {
            continue;
        }
        foreach ($hero[$key] as $value) {
            if (is_array($value)) {
                if (sheet_content_score(array('hero' => $value)) > 0) {
                    $score++;
                    break;
                }
            } elseif (trim((string)$value) !== '' && (string)$value !== '0') {
                $score++;
                break;
            }
        }
    }

    $sidebar = isset($entry['sidebar']) && is_array($entry['sidebar']) ? $entry['sidebar'] : array();
    if (isset($sidebar['lists']) && is_array($sidebar['lists'])) {
        foreach ($sidebar['lists'] as $list) {
            if (is_array($list) && count($list) > 0) {
                $score++;
            }
        }
    }
    if (isset($sidebar['skills']) && is_array($sidebar['skills']) && count($sidebar['skills']) > 0) {
        $score++;
    }
    if (isset($sidebar['resource']) && is_array($sidebar['resource'])) {
        foreach (array('title', 'text') as $key) {
            if (isset($sidebar['resource'][$key]) && trim((string)$sidebar['resource'][$key]) !== '' && $sidebar['resource'][$key] !== 'Resource') {
                $score++;
            }
        }
    }

    if (isset($entry['features']) && is_array($entry['features'])) {
        $score += count($entry['features']);
    }

    if (isset($entry['actions']) && is_array($entry['actions'])) {
        foreach (array('mains', 'maneuvers', 'triggers', 'freeStrikes') as $type) {
            if (isset($entry['actions'][$type]) && is_array($entry['actions'][$type])) {
                $score += count($entry['actions'][$type]);
            }
        }
    }

    return $score;
}

function sheet_has_meaningful_content($entry) {
    return sheet_content_score($entry) > 0;
}

function find_character_sheet_entry($data, $character) {
    if (!is_array($data)) {
        return null;
    }

    if (isset($data[$character]) && is_array($data[$character]) && sheet_has_meaningful_content($data[$character])) {
        return $data[$character];
    }

    $fallback = isset($data[$character]) && is_array($data[$character]) ? $data[$character] : null;
    foreach ($data as $key => $entry) {
        if (!is_string($key) || strtolower(trim($key)) !== $character || !is_array($entry)) {
            continue;
        }
        if (sheet_has_meaningful_content($entry)) {
            return $entry;
        }
        if ($fallback === null) {
            $fallback = $entry;
        }
    }

    return $fallback;
}

function loadCharacterSheetData($dataDir, $dataFile, $characters, $initialize = true) {
    if ($initialize) ensureCharacterSheetStorage($dataDir, $dataFile, $characters);
    if (!is_readable($dataFile)) throw new RuntimeException('Character sheet storage is unavailable.');

    $content = file_get_contents($dataFile);
    if ($content === false) {
        throw new RuntimeException('Unable to read character sheet data.');
    }

    $data = json_decode($content, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new RuntimeException('Character sheet data is invalid JSON: ' . json_last_error_msg());
    }

    if (!is_array($data)) {
        throw new RuntimeException('Character sheet data must be a JSON object.');
    }

    $defaults = getDefaultCharacterEntry();
    foreach ($characters as $character) {
        $entry = find_character_sheet_entry($data, $character);
        if (!is_array($entry)) {
            $data[$character] = $defaults;
        } else {
            $data[$character] = mergeCharacterDefaults($entry, $defaults);
        }
    }

    return $data;
}

function backupCharacterSheetData($dataDir, $dataFile) {
    if (!is_readable($dataFile) || filesize($dataFile) <= 2) {
        return;
    }

    $backupDir = $dataDir . '/backups';
    if (!is_dir($backupDir)) {
        mkdir($backupDir, 0755, true);
    }

    $latest = $backupDir . '/character_sheets_latest.json';
    @copy($dataFile, $latest);

    $timestamp = date('Ymd_His');
    $backupFile = $backupDir . '/character_sheets_' . $timestamp . '.json';
    @copy($dataFile, $backupFile);

    $backups = glob($backupDir . '/character_sheets_*.json');
    if (is_array($backups) && count($backups) > 30) {
        sort($backups);
        $toDelete = array_slice($backups, 0, count($backups) - 30);
        foreach ($toDelete as $oldBackup) {
            if (basename($oldBackup) !== 'character_sheets_latest.json') {
                @unlink($oldBackup);
            }
        }
    }
}

function saveCharacterSheetData($dataDir, $dataFile, $data) {
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }

    backupCharacterSheetData($dataDir, $dataFile);
    // One copy a day beside the per-write ones, and a line in the change record for every field that differs
    // from what the file holds now: when, who, which request, old value, new value (SheetChanges).
    SheetChanges::dailyCopy($dataDir, $dataFile);
    $before = is_readable($dataFile) ? json_decode((string) file_get_contents($dataFile), true) : null;
    $written = AtomicJsonFile::write($dataFile, $data);
    if ($written && is_array($before)) {
        SheetChanges::record($dataDir, (string) ($GLOBALS['currentUser'] ?? ''), (string) ($GLOBALS['action'] ?? ''), $before, $data, array_keys($data));
    }
    // Each hero whose sheet changed gets a new revision, so pages showing it reload (live editing, October 2026).
    if ($written) sheet_push_update(SheetLive::noteWrite($dataDir, $dataFile, $before, $data));
    return $written;
}

/**
 * When the chat's Pusher is set up, pages with a changed hero's sheet open are told at once ("sheet-updated" on the
 * chat channel, with no sheet data: they read it themselves). Without it they see the change at their next poll.
 */
function sheet_push_update(array $revisions) {
    if (!$revisions || !is_file(__DIR__ . '/../includes/chat_pusher.php')) return;
    // After the answer has gone, so a slow Pusher never holds up a save (or a hit on a token).
    register_shutdown_function(static function () use ($revisions) {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        sheet_push_now($revisions);
    });
}

function sheet_push_now(array $revisions) {
    try {
        require_once __DIR__ . '/../includes/chat_pusher.php';
        $config = function_exists('loadChatPusherConfig') ? loadChatPusherConfig() : null;
        if (!is_array($config) || ($config['app_id'] ?? '') === '' || ($config['key'] ?? '') === '' || ($config['secret'] ?? '') === '') return;
        $client = new PusherClient((string) $config['app_id'], (string) $config['key'], (string) $config['secret'], (string) ($config['cluster'] ?? 'us3'), 2);
        $client->trigger((string) ($config['chat_channel'] ?? 'dnd-chat'), 'sheet-updated', array('revisions' => $revisions));
    } catch (Throwable $error) {
        error_log('[Sheet] Pusher notice failed: ' . $error->getMessage());
    }
}

function acquireCharacterSheetWriteLock($dataDir) {
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }

    $lockFile = $dataDir . '/character_sheets.lock';
    $handle = fopen($lockFile, 'c');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        throw new RuntimeException('Unable to lock character sheet storage.');
    }

    return $handle;
}

/** The name shown to others for a signed-in user ("Cal is editing"). */
function sheet_user_label($user) {
    $user = (string) $user;
    $names = is_file(__DIR__ . '/../includes/chat_participants.php') ? @include __DIR__ . '/../includes/chat_participants.php' : null;
    if (is_array($names)) {
        foreach ($names as $id => $label) if (strcasecmp((string) $id, $user) === 0) return (string) $label;
    }
    return $user === '' ? 'Someone' : ucfirst($user);
}

function sendJsonResponse($payload) {
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

if (defined('HANDLER_INCLUDE_ONLY') && HANDLER_INCLUDE_ONLY) {
    return;
}

$requestMethod = $_SERVER['REQUEST_METHOD'];

if ($requestMethod !== 'POST' && $requestMethod !== 'GET') {
    sendJsonResponse(array('success' => false, 'error' => 'Invalid request method'));
}

$requestData = $requestMethod === 'POST' ? $_POST : $_GET;
$action = isset($requestData['action']) ? $requestData['action'] : '';

if (!in_array($action, array('operation-status', 'summary', 'load', 'live', 'sync-stamina', 'sync-surges', 'sync-token-traits', 'sync-hero-tokens', 'fetch-victories', 'party-vitals'), true) && $requestMethod !== 'POST') {
    sendJsonResponse(array('success' => false, 'error' => 'Invalid request method'));
}

if ($action === 'party-vitals') {
    // Every hero's Stamina in one read, for the Director's map page, which asks every few seconds so that a
    // change made on a sheet on another device reaches the hero's token. "since" is the stamp of the answer the
    // page already has: while the sheets have not been written, nothing is read and nothing is sent.
    // Anyone signed in may read it (October 27, 2026): the Table's hero cards show the sheets' Stamina to the players
    // too, which the hero tokens already show them. Read only.
    if ($requestMethod !== 'GET' || $currentUser === '') sendJsonResponse(array('success' => false, 'error' => 'Permission denied'));
    try {
        clearstatcache(true, $dataFile);
        $stamp = is_file($dataFile) ? filemtime($dataFile) . '-' . filesize($dataFile) : 'none';
        header('Cache-Control: no-store');
        if (isset($requestData['since']) && (string) $requestData['since'] === $stamp) sendJsonResponse(array('success' => true, 'unchanged' => true, 'stamp' => $stamp));
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        clearstatcache(true, $dataFile);
        $party = array();
        foreach ($characters as $character) {
            $vitals = isset($allSheets[$character]['hero']['vitals']) && is_array($allSheets[$character]['hero']['vitals']) ? $allSheets[$character]['hero']['vitals'] : array();
            $max = SheetChanges::whole($vitals['staminaMax'] ?? null);
            // A sheet with no Stamina maximum has no Stamina to show: the map shows a dash for it, never 0.
            $party[$character] = $max !== null && $max > 0
                ? array('hasStamina' => true, 'currentStamina' => SheetChanges::whole($vitals['currentStamina'] ?? null) ?? 0, 'staminaMax' => $max, 'tempStamina' => SheetChanges::temp($allSheets[$character]))
                : array('hasStamina' => false);
        }
        sendJsonResponse(array('success' => true, 'stamp' => is_file($dataFile) ? filemtime($dataFile) . '-' . filesize($dataFile) : 'none', 'party' => $party));
    } catch (Throwable $error) {
        http_response_code(500);
        sendJsonResponse(array('success' => false, 'error' => 'Character sheets could not be read.'));
    }
}

$requestedCharacter = isset($requestData['character']) ? strtolower(trim($requestData['character'])) : '';

if (!$requestedCharacter && !$is_gm && $currentUser) {
    $requestedCharacter = strtolower($currentUser);
}

if (!in_array($requestedCharacter, $characters, true)) {
    sendJsonResponse(array('success' => false, 'error' => 'Unknown character'));
}

$allowVttStaminaSync =
    $action === 'sync-stamina'
    && $requestMethod === 'POST'
    && isset($requestData['source'])
    && $requestData['source'] === 'vtt'
    && $currentUser !== '';
$allowVttSurgeSync =
    $action === 'sync-surges'
    && $requestMethod === 'POST'
    && isset($requestData['source'])
    && $requestData['source'] === 'vtt'
    && $currentUser !== '';
// VTT heroic-resource automation: whoever is RUNNING a hero (per the token's
// claim) applies its resource gains, which may not be the character's own
// account. Like sync-stamina/sync-surges, this is a narrow, single-field
// write open to any authenticated VTT user.
$allowVttFieldSync =
    in_array($action, array('sync-resource', 'sync-vitals', 'sync-victories'), true)
    && $requestMethod === 'POST'
    && isset($requestData['source'])
    && $requestData['source'] === 'vtt'
    && $currentUser !== '';
// The party's hero tokens from the map's side panel: one pool shared by the party, so a player using another
// hero's panel spends or resets the same two tokens. Same narrow rule as the other map writes above.
$allowVttHeroTokenSync =
    $action === 'sync-hero-tokens'
    && $requestMethod === 'POST'
    && isset($requestData['source'])
    && $requestData['source'] === 'vtt'
    && $currentUser !== '';
// A hero's conditions as its token now has them (the map writes the sheet's mirror of the token's list, October
// 2026). Any signed-in map user, as for Stamina: whoever changed the token. A sheet's own edit (source sheet, the
// hero not on the map) keeps the sheet's rule: the hero's player or the Director.
$allowVttConditionSync =
    $action === 'sync-conditions'
    && $requestMethod === 'POST'
    && isset($requestData['source'])
    && $requestData['source'] === 'vtt'
    && $currentUser !== '';
$allowVttTraitRead =
    $action === 'sync-token-traits'
    && $requestMethod === 'GET'
    && isset($requestData['source'])
    && $requestData['source'] === 'vtt';
$allowPublicSummaryRead =
    $action === 'summary'
    && $requestMethod === 'GET'
    && $currentUser !== '';

$allowOperationRead = $action === 'operation-status' && $requestMethod === 'GET' && $currentUser !== '';
// The live revision and locks of a hero's sheet: any signed-in user may read them (the map's side panel shows any
// hero, as the summary does). Taking a lock is a write: the sheet's own player or the Director.
$allowLiveRead = $action === 'live' && $requestMethod === 'GET' && $currentUser !== '';

if (!$is_gm && $requestedCharacter !== strtolower($currentUser) && !$allowVttStaminaSync && !$allowVttSurgeSync && !$allowVttFieldSync && !$allowVttHeroTokenSync && !$allowVttConditionSync && !$allowVttTraitRead && !$allowPublicSummaryRead && !$allowOperationRead && !$allowLiveRead) {
    sendJsonResponse(array('success' => false, 'error' => 'Permission denied'));
}

try {
$characterSheetWriteLock = null;
if (
    $requestMethod === 'POST'
    && in_array($action, array('save-fields', 'respite', 'sync-stamina', 'sync-surges', 'sync-resource', 'sync-vitals', 'sync-victories', 'sync-hero-tokens', 'sync-conditions'), true)
) {
    // Every mutation below is a read-modify-write of shared JSON. Hold one
    // request-wide lock so simultaneous player autosaves and VTT resource
    // updates cannot overwrite a different character's newer data.
    $characterSheetWriteLock = acquireCharacterSheetWriteLock($dataDir);
}

switch ($action) {
    case 'live':
        // A page's cheap poll: the hero's revision (it reloads when it moves) and who holds which field.
        header('Cache-Control: no-store');
        $live = SheetLive::state($dataDir, $dataFile, $requestedCharacter, (string) $currentUser);
        sendJsonResponse(array('success' => true, 'character' => $requestedCharacter, 'revision' => $live['revision'], 'locks' => $live['locks'], 'me' => (string) $currentUser));
        break;

    case 'lock':
    case 'heartbeat':
    case 'unlock':
        // While somebody edits a field it is locked on other screens: released when they leave it, or 20 seconds
        // after the last heartbeat (a page sends one every few seconds while the field is in use).
        $field = SheetLive::field($requestData['field'] ?? null);
        if ($field === null) throw new InvalidArgumentException('Missing or invalid field.');
        if ($action === 'unlock') {
            sendJsonResponse(array('success' => true, 'released' => SheetLive::unlock($dataDir, $requestedCharacter, $field, (string) $currentUser)));
        }
        $taken = SheetLive::lock($dataDir, $requestedCharacter, $field, (string) $currentUser, sheet_user_label($currentUser));
        sendJsonResponse(array('success' => $taken['locked'], 'field' => $field) + $taken + ($taken['locked'] ? array() : array('error' => ($taken['holder']['name'] ?? 'Someone') . ' is editing this.')));
        break;

    case 'operation-status':
        if ($requestMethod !== 'GET') throw new InvalidArgumentException('Operation status requires GET.');
        $operationId = CharacterWriteReceipts::operationId($requestData['operationId'] ?? null);
        if ($operationId === null) throw new InvalidArgumentException('Missing character operation ID.');
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters, false);
        header('Cache-Control: no-store');
        $receipt = CharacterWriteReceipts::inspect($allSheets, $operationId, $currentUser, $requestedCharacter, $is_gm);
        sendJsonResponse(['success'=>true, 'operationId'=>$operationId, 'recorded'=>$receipt !== null, 'receipt'=>$receipt]);
        break;

    case 'summary':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $heroTokens = loadHeroTokens($dataDir, $heroTokenFile);
        $sheet = $allSheets[$requestedCharacter];
        $sheet['hero']['heroTokens'] = $heroTokens;
        sendJsonResponse(array(
            'success' => true,
            'character' => $requestedCharacter,
            'data' => $sheet,
            'revision' => SheetLive::revision($dataDir, $dataFile, $requestedCharacter),
        ));
        break;

    case 'load':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $heroTokens = loadHeroTokens($dataDir, $heroTokenFile);
        $sheet = $allSheets[$requestedCharacter];
        $sheet['hero']['heroTokens'] = $heroTokens;
        sendJsonResponse(array('success' => true, 'data' => $sheet, 'revision' => SheetLive::revision($dataDir, $dataFile, $requestedCharacter)));
        break;

    case 'save':
        // The whole-sheet save. It replaced the stored record with whatever copy of the sheet the page held, old
        // or half-loaded, and that is how fields were rolled back and blanked (Brandon, October 12, 2026:
        // "Character sheets seem to be changing without permission"). A page from before the change still sends
        // it, and it cannot say what it changed, so nothing of it is taken. Nothing is changed and it is told to
        // reload. A page of today sends save-fields.
        sendJsonResponse(array(
            'success' => false,
            'reload' => true,
            'error' => 'This page is from before an update and can no longer save. Reload the page; nothing was changed.'
        ));
        break;

    case 'save-fields':
        // What the page changed, field by field. Only those fields are set on the stored record.
        $changes = SheetChanges::read(isset($_POST['changes']) ? json_decode((string) $_POST['changes'], true) : null);
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        // A save names itself. One whose answer was lost can be asked after (operation-status) and, if sent
        // again, is answered from its receipt: an amount is never added twice.
        $saveOperationId = CharacterWriteReceipts::operationId($_POST['operationId'] ?? null);
        $saveInput = ['changes'=>hash('sha256', (string) ($_POST['changes'] ?? ''))];
        $replayed = CharacterWriteReceipts::lookup($allSheets, $saveOperationId, $currentUser, $requestedCharacter, $action, $saveInput);
        if ($replayed !== null) sendJsonResponse($replayed);
        $existingSheet = isset($allSheets[$requestedCharacter]) && is_array($allSheets[$requestedCharacter])
            ? $allSheets[$requestedCharacter]
            : getDefaultCharacterEntry();
        if (!$changes) {
            sendJsonResponse(array('success' => true, 'applied' => 0));
        }
        // Live editing: a field somebody else changed since this page last read the sheet ("baseRevision"), or
        // holds locked, is not overwritten. The page is told and reloads. A page that sends no revision (one from
        // before this change) is checked for locks only.
        $baseRevision = isset($_POST['baseRevision']) && $_POST['baseRevision'] !== '' ? SheetChanges::whole($_POST['baseRevision']) : null;
        $refused = SheetLive::check($dataDir, $dataFile, $requestedCharacter, $changes, $baseRevision, (string) $currentUser);
        if ($refused !== null) {
            sendJsonResponse(array(
                'success' => false,
                'error' => isset($refused['locked'])
                    ? (($refused['holder']['name'] ?? 'Someone') . ' is editing that. Nothing was changed.')
                    : 'Someone else changed this since your page last read it. Nothing was changed; the sheet will reload.',
            ) + $refused);
        }
        $changedSheet = SheetChanges::apply($existingSheet, $changes);
        $receipts = $existingSheet['_vttOperations'] ?? null;
        $normalizedSheet = mergeCharacterDefaults($changedSheet, getDefaultCharacterEntry());
        if ($receipts !== null) $normalizedSheet['_vttOperations'] = $receipts;
        if (
            sheet_has_meaningful_content($existingSheet)
            && !sheet_has_meaningful_content($normalizedSheet)
            && !isset($_POST['confirm_blank_sheet'])
        ) {
            sendJsonResponse(array(
                'success' => false,
                'error' => 'Refusing to replace a populated character sheet with a blank sheet. Reload before saving.'
            ));
        }
        $allSheets[$requestedCharacter] = $normalizedSheet;
        $saveResponse = CharacterWriteReceipts::record($allSheets, $saveOperationId, $currentUser, $requestedCharacter, $action, $saveInput, array('success' => true, 'applied' => count($changes)));
        if (saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
            // A page that keeps a revision is told the new one (it reloads if somebody else wrote in between).
            sendJsonResponse($baseRevision === null ? $saveResponse : $saveResponse + array('revision' => SheetLive::revision($dataDir, $dataFile, $requestedCharacter)));
        } else {
            sendJsonResponse(array('success' => false, 'error' => 'Failed to save sheet'));
        }
        break;

    case 'respite':
        // Worked out from the stored record, not from numbers a page worked out: a page that was behind used to
        // write its old values back with the respite, and one whose Recoveries maximum was blank set them to none.
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $rested = SheetChanges::respite($allSheets[$requestedCharacter]);
        $allSheets[$requestedCharacter] = $rested['sheet'];
        if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
            sendJsonResponse(array('success' => false, 'error' => 'Failed to save the respite'));
        }
        $sheet = $rested['sheet'];
        $sheet['hero']['heroTokens'] = loadHeroTokens($dataDir, $heroTokenFile);
        unset($sheet['_vttOperations']);
        sendJsonResponse(array('success' => true, 'data' => $sheet, 'victories' => $rested['victories'], 'notes' => $rested['notes']));
        break;

    case 'sync-token-traits':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];
        $speed = isset($sheet['hero']['vitals']['speed']) ? $sheet['hero']['vitals']['speed'] : '';
        sendJsonResponse(array(
            'success' => true,
            'name' => isset($sheet['hero']['name']) && $sheet['hero']['name'] !== '' ? $sheet['hero']['name'] : $requestedCharacter,
            'traits' => array(
                'speed' => $speed,
            ),
            'speed' => $speed,
        ));
        break;

    case 'sync-stamina':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];

        if ($requestMethod === 'POST') {
            // A token holds a copy of the sheet's Stamina, and a copy can be behind. So the map says how much a
            // token's Stamina changed by ("delta") and that is added to what is stored here; it used to say what
            // the token now read, and a token that was behind wrote the sheet back to it. The maximum on a token
            // is a copy too and cannot be typed there (it is shown only), so it is never taken from the map: a
            // page sending back the copy it held is how an empty or old maximum reached a sheet. The maximum is
            // set on the sheet.
            $staminaDelta = isset($requestData['delta']) && $requestData['delta'] !== '' ? SheetChanges::whole($requestData['delta']) : null;
            $currentStamina = $staminaDelta === null && isset($requestData['currentStamina']) && $requestData['currentStamina'] !== ''
                ? (int)$requestData['currentStamina']
                : null;
            // The token's temporary Stamina, as it now reads (the token worked out the hit or the gain).
            $tempStamina = isset($requestData['tempStamina']) && $requestData['tempStamina'] !== '' ? SheetChanges::whole($requestData['tempStamina']) : null;
            if ($tempStamina !== null) $tempStamina = max(0, min(1000000, $tempStamina));

            if ($currentStamina === null && $staminaDelta === null && $tempStamina === null) {
                sendJsonResponse(array('success' => false, 'error' => 'Missing stamina values'));
            }

            $staminaOperationId = CharacterWriteReceipts::operationId($requestData['operationId'] ?? null);
            $staminaInput = ['currentStamina'=>$currentStamina, 'delta'=>$staminaDelta, ...($tempStamina !== null ? ['tempStamina'=>$tempStamina] : [])];
            $replayed = CharacterWriteReceipts::lookup($allSheets, $staminaOperationId, $currentUser, $requestedCharacter, $action, $staminaInput);
            if ($replayed !== null) sendJsonResponse($replayed);

            if ($staminaDelta !== null) {
                $sheet = SheetChanges::move($sheet, 'hero.vitals.currentStamina', $staminaDelta);
            } elseif ($currentStamina !== null) {
                // A token that had no number before has no amount to give: what it now reads is set.
                $sheet['hero']['vitals']['currentStamina'] = $currentStamina;
            }
            if ($tempStamina !== null) $sheet['hero']['vitals']['tempStamina'] = $tempStamina;
            $sheet = SheetChanges::migrateTemp($sheet);

            $allSheets[$requestedCharacter] = $sheet;

        }

        $response = array(
            'success' => true,
            'name' => isset($sheet['hero']['name']) && $sheet['hero']['name'] !== '' ? $sheet['hero']['name'] : $requestedCharacter,
            'staminaMax' => isset($sheet['hero']['vitals']['staminaMax']) ? $sheet['hero']['vitals']['staminaMax'] : 0,
            'currentStamina' => isset($sheet['hero']['vitals']['currentStamina']) ? $sheet['hero']['vitals']['currentStamina'] : 0,
            'tempStamina' => SheetChanges::temp($sheet),
            // False for a sheet with no Stamina maximum: the map then shows a dash on its token, never 0.
            'hasStamina' => (SheetChanges::whole($sheet['hero']['vitals']['staminaMax'] ?? null) ?? 0) > 0,
        );
        // A token placed (or linked) with no conditions takes the sheet's (read by the map leniently: old free text).
        if ($requestMethod === 'GET') $response['conditions'] = is_array($sheet['hero']['conditions'] ?? null) ? array_values($sheet['hero']['conditions']) : array();

        if ($requestMethod === 'POST') {
            $response = CharacterWriteReceipts::record($allSheets, $staminaOperationId, $currentUser, $requestedCharacter, $action, $staminaInput, $response);
            if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save stamina values'));
            }
        }
        sendJsonResponse($response);
        break;

    case 'sync-conditions':
        // The hero's conditions, the whole list (SheetConditions). Two writers:
        // - source vtt: the map, after the hero's token changed (or the sheet page after it changed the token), with
        //   the token's id and revision. The list is the token's: a write from an older revision of the same token
        //   than the one already mirrored is answered, not taken (two pages, or a slow request, never roll it back).
        // - source sheet: the sheet page or the side panel while the hero has no token on the map, with the revision
        //   the page last read. If somebody changed the conditions since, nothing is written and the page re-reads.
        // - a delta (late October 2026, what pages send now): only what one change did, never a whole list. With the
        //   token's id and revision each condition's change is taken once and never an older one
        //   (SheetConditions::guard); without them (the Director's new-fight wipe and its undo) it is applied as it
        //   comes. Whole lists (below) are still read, for a page open from before.
        if ($requestMethod !== 'POST') throw new InvalidArgumentException('Conditions are written with POST.');
        if (isset($requestData['delta'])) {
            if (($requestData['source'] ?? '') !== 'vtt' && !$is_gm && $requestedCharacter !== strtolower((string) $currentUser)) {
                sendJsonResponse(array('success' => false, 'error' => 'Permission denied'));
            }
            $ops = SheetConditions::readOps(json_decode((string) $requestData['delta'], true));
            $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
            $sheet = $allSheets[$requestedCharacter];
            $stored = SheetConditions::lenient($sheet['hero']['conditions'] ?? array());
            $mirrored = is_array($sheet['hero']['conditionsSource'] ?? null) ? $sheet['hero']['conditionsSource'] : null;
            $placementId = substr(trim((string) ($requestData['placementId'] ?? '')), 0, 128);
            $tokenRevision = SheetChanges::whole($requestData['revision'] ?? null);
            $source = $mirrored;
            if ($placementId !== '' && $tokenRevision !== null) {
                [$ops, $source] = SheetConditions::guard($mirrored, $placementId, $tokenRevision, $ops);
            }
            $next = SheetConditions::applyOps($stored, $ops);
            if (SheetConditions::same($next, $stored) && $source == $mirrored) {
                sendJsonResponse(array('success' => true, 'applied' => false, 'conditions' => $next, 'revision' => SheetLive::revision($dataDir, $dataFile, $requestedCharacter)));
            }
            $sheet['hero']['conditions'] = $next;
            if ($source !== null) $sheet['hero']['conditionsSource'] = $source;
            $allSheets[$requestedCharacter] = $sheet;
            if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save conditions'));
            }
            sendJsonResponse(array('success' => true, 'applied' => !SheetConditions::same($next, $stored), 'conditions' => $next, 'revision' => SheetLive::revision($dataDir, $dataFile, $requestedCharacter)));
        }
        $incoming = json_decode((string) ($requestData['conditions'] ?? ''), true);
        if (!is_array($incoming) || !array_is_list($incoming)) throw new InvalidArgumentException('Missing or invalid conditions.');
        $next = SheetConditions::normalize($incoming);
        $fromMap = ($requestData['source'] ?? '') === 'vtt';
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];
        $stored = $sheet['hero']['conditions'] ?? array();
        $mirrored = is_array($sheet['hero']['conditionsSource'] ?? null) ? $sheet['hero']['conditionsSource'] : null;
        $source = null;
        if ($fromMap) {
            $placementId = substr(trim((string) ($requestData['placementId'] ?? '')), 0, 128);
            $tokenRevision = SheetChanges::whole($requestData['revision'] ?? null);
            if ($placementId !== '' && $tokenRevision !== null) {
                if ($mirrored !== null && ($mirrored['placementId'] ?? '') === $placementId && (int) ($mirrored['revision'] ?? 0) >= $tokenRevision) {
                    sendJsonResponse(array('success' => true, 'applied' => false, 'stale' => true, 'conditions' => SheetConditions::normalize($stored),
                        'revision' => SheetLive::revision($dataDir, $dataFile, $requestedCharacter)));
                }
                $source = array('placementId' => $placementId, 'revision' => $tokenRevision);
            }
        } else {
            $baseRevision = isset($requestData['baseRevision']) && $requestData['baseRevision'] !== '' ? SheetChanges::whole($requestData['baseRevision']) : null;
            $refused = SheetLive::check($dataDir, $dataFile, $requestedCharacter, array(array('path' => array('hero', 'conditions'), 'value' => $next)), $baseRevision, (string) $currentUser);
            if ($refused !== null) {
                sendJsonResponse(array(
                    'success' => false,
                    'error' => isset($refused['locked']) ? (($refused['holder']['name'] ?? 'Someone') . ' is editing that. Nothing was changed.') : 'The conditions changed elsewhere. Nothing was changed; the sheet will reload.',
                ) + $refused);
            }
        }
        $sameSource = $source === null ? $mirrored === null || $fromMap : $mirrored == $source;
        if ($stored === $next && $sameSource) {
            sendJsonResponse(array('success' => true, 'applied' => false, 'conditions' => $next, 'revision' => SheetLive::revision($dataDir, $dataFile, $requestedCharacter)));
        }
        $sheet['hero']['conditions'] = $next;
        if ($source !== null) $sheet['hero']['conditionsSource'] = $source;
        elseif (!$fromMap) unset($sheet['hero']['conditionsSource']);
        $allSheets[$requestedCharacter] = $sheet;
        if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
            sendJsonResponse(array('success' => false, 'error' => 'Failed to save conditions'));
        }
        sendJsonResponse(array('success' => true, 'applied' => true, 'conditions' => $next, 'revision' => SheetLive::revision($dataDir, $dataFile, $requestedCharacter)));
        break;

    case 'sync-surges':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];

        $surgeOperationId = null;
        if ($requestMethod === 'POST') {
            $surgeOperationId = CharacterWriteReceipts::operationId($requestData['operationId'] ?? null);
            $surgeInput = isset($requestData['value']) && $requestData['value'] !== ''
                ? ['value'=>max(0, (int)$requestData['value'])]
                : ['delta'=>(int)($requestData['delta'] ?? 0)];
            $replayed = CharacterWriteReceipts::lookup($allSheets, $surgeOperationId, $currentUser, $requestedCharacter, $action, $surgeInput);
            if ($replayed !== null) sendJsonResponse($replayed);
            if (!isset($sheet['hero']) || !is_array($sheet['hero'])) {
                $sheet['hero'] = array();
            }
            if (isset($requestData['value']) && $requestData['value'] !== '') {
                // Absolute set (used by VTT combat start/end surge resets).
                $sheet['hero']['surges'] = max(0, (int)$requestData['value']);
            } else {
                $delta = isset($requestData['delta']) ? (int)$requestData['delta'] : 0;
                $currentSurges = isset($sheet['hero']['surges']) && $sheet['hero']['surges'] !== ''
                    ? (int)$sheet['hero']['surges']
                    : 0;
                $sheet['hero']['surges'] = max(0, $currentSurges + $delta);
            }
            $sheet['hero']['surgesUsed'] = 0;
            $allSheets[$requestedCharacter] = $sheet;

            $surgeResponse = CharacterWriteReceipts::record($allSheets, $surgeOperationId, $currentUser, $requestedCharacter, $action, $surgeInput, [
                'success'=>true,
                'name'=>$sheet['hero']['name'] !== '' ? $sheet['hero']['name'] : $requestedCharacter,
                'surges'=>(int)$sheet['hero']['surges'],
            ]);
            if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save surges'));
            }
        }

        if ($requestMethod === 'POST') sendJsonResponse($surgeResponse);
        sendJsonResponse(array(
            'success' => true,
            'name' => isset($sheet['hero']['name']) && $sheet['hero']['name'] !== '' ? $sheet['hero']['name'] : $requestedCharacter,
            'surges' => isset($sheet['hero']['surges']) ? (int)$sheet['hero']['surges'] : 0,
        ));
        break;

    case 'sync-resource':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];
        $resourceOperationId = CharacterWriteReceipts::operationId($requestData['operationId'] ?? null);
        if (isset($requestData['spend'])) {
            $cost = filter_var($requestData['spend'], FILTER_VALIDATE_INT);
            if ($cost === false || $cost < 1 || $cost > 1000000) throw new InvalidArgumentException('Invalid upkeep cost');
            $asked = trim((string)($requestData['resourceName'] ?? ''));
            $resourceInput = ['spend'=>$cost, 'resourceName'=>strtolower($asked)];
        } elseif (isset($requestData['delta']) && $requestData['delta'] !== '') {
            // "Two more" or "one fewer", added to the stored number (never below the sheet's own least).
            $amount = SheetChanges::whole($requestData['delta']);
            if ($amount === null || abs($amount) > 1000000) throw new InvalidArgumentException('Invalid resource amount');
            $resourceInput = ['delta'=>$amount];
        } else {
            if (!isset($requestData['value']) || $requestData['value'] === '') throw new InvalidArgumentException('Missing resource value');
            $resourceInput = ['value'=>(int)$requestData['value']];
            if (isset($requestData['expectedValue'])) {
                $expected = filter_var($requestData['expectedValue'], FILTER_VALIDATE_INT);
                if ($expected === false) throw new InvalidArgumentException('Invalid expected resource value');
                $resourceInput['expectedValue'] = $expected;
            }
        }
        $replayed = CharacterWriteReceipts::lookup($allSheets, $resourceOperationId, $currentUser, $requestedCharacter, $action, $resourceInput);
        if ($replayed !== null) sendJsonResponse($replayed);
        $finishResource = function(array $response, bool $changed = false) use (&$allSheets, $resourceOperationId, $currentUser, $requestedCharacter, $action, $resourceInput, $dataDir, $dataFile): void {
            $response = CharacterWriteReceipts::record($allSheets, $resourceOperationId, $currentUser, $requestedCharacter, $action, $resourceInput, $response);
            if ($changed || $resourceOperationId !== null) saveCharacterSheetData($dataDir, $dataFile, $allSheets);
            sendJsonResponse($response);
        };
        if (!isset($sheet['hero']) || !is_array($sheet['hero'])) $sheet['hero'] = [];
        if (!isset($sheet['hero']['resource']) || !is_array($sheet['hero']['resource'])) $sheet['hero']['resource'] = [];
        $current = (int)($sheet['hero']['resource']['value'] ?? 0);
        if (isset($resourceInput['spend'])) {
            $title = trim((string)($sheet['hero']['resource']['title'] ?? $sheet['sidebar']['resource']['title'] ?? ''));
            if ($asked !== '' && strcasecmp($asked, $title) !== 0) $finishResource(['success'=>false, 'error'=>'Upkeep resource does not match the character resource.']);
            if ($current < $cost) $finishResource(['success'=>true, 'paid'=>false, 'reason'=>'insufficient resource', 'resource'=>$current]);
            $sheet['hero']['resource']['value'] = $current - $cost;
        } elseif (isset($resourceInput['delta'])) {
            $sheet = SheetChanges::move($sheet, 'hero.resource.value', $resourceInput['delta']);
        } else {
            if (isset($resourceInput['expectedValue']) && $resourceInput['expectedValue'] !== $current) {
                $finishResource(['success'=>false, 'error'=>'Resource changed; review its current value before applying this change.']);
            }
            // Some heroic resources legitimately allow negative balances.
            $sheet['hero']['resource']['value'] = $resourceInput['value'];
        }
        $allSheets[$requestedCharacter] = $sheet;
        $finishResource([
            'success'=>true, 'paid'=>isset($resourceInput['spend']) ? true : null,
            'name'=>!empty($sheet['hero']['name']) ? $sheet['hero']['name'] : $requestedCharacter,
            'resource'=>(int)$sheet['hero']['resource']['value'],
        ], true);
        break;

    case 'sync-vitals':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];

        if (!isset($sheet['hero']['vitals']) || !is_array($sheet['hero']['vitals'])) {
            $sheet['hero']['vitals'] = array();
        }
        if (isset($requestData['spendRecoveries'])) {
            $cost = filter_var($requestData['spendRecoveries'], FILTER_VALIDATE_INT);
            if ($cost === false || $cost < 1 || $cost > 1000) throw new InvalidArgumentException('Invalid recovery cost');
            $recoveryOperationId = CharacterWriteReceipts::operationId($requestData['operationId'] ?? null);
            $recoveryInput = ['spendRecoveries'=>$cost];
            $replayed = CharacterWriteReceipts::lookup($allSheets, $recoveryOperationId, $currentUser, $requestedCharacter, $action, $recoveryInput);
            if ($replayed !== null) sendJsonResponse($replayed);
            $current = max(0, (int)($sheet['hero']['vitals']['currentRecoveries'] ?? 0));
            $spent = $current >= $cost ? $cost : 0;
            $sheet['hero']['vitals']['currentRecoveries'] = $current - $spent;
            if ($spent > 0) $allSheets[$requestedCharacter] = $sheet;
            $response = CharacterWriteReceipts::record($allSheets, $recoveryOperationId, $currentUser, $requestedCharacter, $action, $recoveryInput, [
                'success'=>true, 'spent'=>$spent, 'currentRecoveries'=>$current-$spent,
                ...($spent === 0 ? ['reason'=>'insufficient'] : []),
            ]);
            if ($spent > 0 || $recoveryOperationId !== null) saveCharacterSheetData($dataDir, $dataFile, $allSheets);
            sendJsonResponse($response);
        }
        if (!empty($requestData['useRecovery'])) {
            // One Recovery spent to heal, worked out from the stored record (SheetChanges::useRecovery). A page
            // used to work it out from its own copy and send the two numbers: one that was behind wrote old
            // Stamina back, and the sheet page set Stamina to none on a sheet with no maximum.
            $useOperationId = CharacterWriteReceipts::operationId($requestData['operationId'] ?? null);
            $useInput = ['useRecovery'=>1];
            $replayed = CharacterWriteReceipts::lookup($allSheets, $useOperationId, $currentUser, $requestedCharacter, $action, $useInput);
            if ($replayed !== null) sendJsonResponse($replayed);
            $used = SheetChanges::useRecovery($sheet);
            if ($used['spent'] > 0) $allSheets[$requestedCharacter] = $used['sheet'];
            unset($used['sheet']);
            $response = CharacterWriteReceipts::record($allSheets, $useOperationId, $currentUser, $requestedCharacter, $action, $useInput, ['success'=>true, ...$used]);
            if (($used['spent'] > 0 || $useOperationId !== null) && !saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save the recovery'));
            }
            sendJsonResponse($response);
        }
        if (isset($requestData['staminaDelta']) && $requestData['staminaDelta'] !== '') {
            // Damage or healing from the map's side panel, as an amount added to the stored Stamina.
            $amount = SheetChanges::whole($requestData['staminaDelta']);
            if ($amount === null || abs($amount) > 1000000) throw new InvalidArgumentException('Invalid Stamina amount');
            $deltaOperationId = CharacterWriteReceipts::operationId($requestData['operationId'] ?? null);
            $deltaInput = ['staminaDelta'=>$amount];
            $replayed = CharacterWriteReceipts::lookup($allSheets, $deltaOperationId, $currentUser, $requestedCharacter, $action, $deltaInput);
            if ($replayed !== null) sendJsonResponse($replayed);
            // Damage takes temporary Stamina first; healing stops at the maximum and leaves temporary Stamina alone.
            $sheet = $amount < 0 ? SheetChanges::damage($sheet, -$amount) : SheetChanges::heal($sheet, $amount);
            $allSheets[$requestedCharacter] = $sheet;
            $response = CharacterWriteReceipts::record($allSheets, $deltaOperationId, $currentUser, $requestedCharacter, $action, $deltaInput, [
                'success'=>true,
                'currentStamina'=>SheetChanges::counter($sheet, 'hero.vitals.currentStamina'),
                'currentRecoveries'=>SheetChanges::counter($sheet, 'hero.vitals.currentRecoveries'),
                'tempStamina'=>SheetChanges::temp($sheet),
            ]);
            if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save vital values'));
            }
            sendJsonResponse($response);
        }
        // Temporary Stamina gained (the higher of held and gained), or set outright (the end of combat sets 0).
        if ((isset($requestData['gainTemp']) && $requestData['gainTemp'] !== '') || (isset($requestData['tempStamina']) && $requestData['tempStamina'] !== '')) {
            $gain = isset($requestData['gainTemp']) && $requestData['gainTemp'] !== '' ? SheetChanges::whole($requestData['gainTemp']) : null;
            $setTo = $gain === null ? SheetChanges::whole($requestData['tempStamina']) : null;
            $asked = $gain ?? $setTo;
            if ($asked === null || $asked < 0 || $asked > 1000000) throw new InvalidArgumentException('Invalid temporary Stamina amount');
            $tempOperationId = CharacterWriteReceipts::operationId($requestData['operationId'] ?? null);
            $tempInput = $gain !== null ? ['gainTemp'=>$gain] : ['tempStamina'=>$setTo];
            $replayed = CharacterWriteReceipts::lookup($allSheets, $tempOperationId, $currentUser, $requestedCharacter, $action, $tempInput);
            if ($replayed !== null) sendJsonResponse($replayed);
            if ($gain !== null) {
                $sheet = SheetChanges::gainTemp($sheet, $gain);
            } else {
                $sheet = SheetChanges::migrateTemp($sheet);
                $sheet['hero']['vitals']['tempStamina'] = $setTo;
            }
            $allSheets[$requestedCharacter] = $sheet;
            $response = CharacterWriteReceipts::record($allSheets, $tempOperationId, $currentUser, $requestedCharacter, $action, $tempInput, [
                'success'=>true,
                'currentStamina'=>SheetChanges::counter($sheet, 'hero.vitals.currentStamina'),
                'currentRecoveries'=>SheetChanges::counter($sheet, 'hero.vitals.currentRecoveries'),
                'tempStamina'=>SheetChanges::temp($sheet),
            ]);
            if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save temporary Stamina'));
            }
            sendJsonResponse($response);
        }
        // Recoveries given back or taken by an amount (turn undo, October 2026), worked out against the stored number.
        if (isset($requestData['recoveriesDelta']) && $requestData['recoveriesDelta'] !== '') {
            $sheet = SheetChanges::move($sheet, 'hero.vitals.currentRecoveries', (int) (SheetChanges::whole($requestData['recoveriesDelta']) ?? 0));
            $allSheets[$requestedCharacter] = $sheet;
            if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save vital values'));
            }
            sendJsonResponse(array(
                'success' => true,
                'currentRecoveries' => SheetChanges::counter($sheet, 'hero.vitals.currentRecoveries'),
            ));
        }
        $hasStamina = isset($requestData['currentStamina']) && $requestData['currentStamina'] !== '';
        $hasRecoveries = isset($requestData['currentRecoveries']) && $requestData['currentRecoveries'] !== '';
        if (!$hasStamina && !$hasRecoveries) {
            sendJsonResponse(array('success' => false, 'error' => 'Missing vital values'));
        }
        if ($hasStamina) {
            $sheet['hero']['vitals']['currentStamina'] = (int)$requestData['currentStamina'];
        }
        if ($hasRecoveries) {
            $sheet['hero']['vitals']['currentRecoveries'] = max(0, (int)$requestData['currentRecoveries']);
        }
        $allSheets[$requestedCharacter] = $sheet;

        if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
            sendJsonResponse(array('success' => false, 'error' => 'Failed to save vital values'));
        }
        sendJsonResponse(array(
            'success' => true,
            'currentStamina' => isset($sheet['hero']['vitals']['currentStamina']) ? (int)$sheet['hero']['vitals']['currentStamina'] : 0,
            'currentRecoveries' => isset($sheet['hero']['vitals']['currentRecoveries']) ? (int)$sheet['hero']['vitals']['currentRecoveries'] : 0,
        ));
        break;

    case 'sync-victories':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];
        if (isset($requestData['delta']) && $requestData['delta'] !== '') {
            // "One more", added to the stored number: two pages that each add one add two.
            $amount = SheetChanges::whole($requestData['delta']);
            if ($amount === null || abs($amount) > 1000) throw new InvalidArgumentException('Invalid victory amount');
            $sheet = SheetChanges::move($sheet, 'hero.victories', $amount);
        } else {
            if (!isset($requestData['value']) || $requestData['value'] === '') {
                sendJsonResponse(array('success' => false, 'error' => 'Missing victory value'));
            }
            $sheet['hero']['victories'] = max(0, (int)$requestData['value']);
        }
        $allSheets[$requestedCharacter] = $sheet;

        if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
            sendJsonResponse(array('success' => false, 'error' => 'Failed to save victories'));
        }
        sendJsonResponse(array(
            'success' => true,
            'victories' => (int)$sheet['hero']['victories'],
        ));
        break;

    case 'sync-hero-tokens':
        $heroTokens = loadHeroTokens($dataDir, $heroTokenFile);

        if ($requestMethod === 'POST') {
            $index = isset($requestData['tokenIndex']) ? (int)$requestData['tokenIndex'] : null;
            $state = isset($requestData['tokenState']) ? (int)$requestData['tokenState'] : null;
            if ($index === null || $index < 0 || $index > 1) {
                sendJsonResponse(array('success' => false, 'error' => 'Invalid token index'));
            }
            if ($state === null) {
                sendJsonResponse(array('success' => false, 'error' => 'Missing token state'));
            }
            $heroTokens[$index] = $state === 1;
            if (!saveHeroTokens($heroTokenFile, $heroTokens)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save hero tokens'));
            }
        }

        sendJsonResponse(array('success' => true, 'heroTokens' => $heroTokens));
        break;

    case 'fetch-victories':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];
        $victories = 0;

        if (isset($sheet['hero']['victories']) && $sheet['hero']['victories'] !== '') {
            $victories = (int)$sheet['hero']['victories'];
        }

        sendJsonResponse(array(
            'success' => true,
            'name' => isset($sheet['hero']['name']) && $sheet['hero']['name'] !== '' ? $sheet['hero']['name'] : $requestedCharacter,
            'victories' => $victories,
        ));
        break;

    default:
        sendJsonResponse(array('success' => false, 'error' => 'Unknown action'));
}
} catch (InvalidArgumentException $error) {
    sendJsonResponse(['success'=>false, 'error'=>$error->getMessage()]);
} catch (RuntimeException | JsonException $error) {
    sendJsonResponse(array(
        'success' => false,
        'error' => 'Character sheet storage error: ' . $error->getMessage()
    ));
}
