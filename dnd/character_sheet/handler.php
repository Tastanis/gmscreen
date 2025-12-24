<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$characters = array('frunk', 'sharon', 'indigo', 'zepha');
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
            ),
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

    return $normalized;
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

function loadCharacterSheetData($dataDir, $dataFile, $characters) {
    ensureCharacterSheetStorage($dataDir, $dataFile, $characters);

    $content = file_get_contents($dataFile);
    $data = json_decode($content, true);

    if (!is_array($data)) {
        $data = array();
    }

    $defaults = getDefaultCharacterEntry();
    foreach ($characters as $character) {
        if (!isset($data[$character]) || !is_array($data[$character])) {
            $data[$character] = $defaults;
        } else {
            $data[$character] = mergeCharacterDefaults($data[$character], $defaults);
        }
    }

    return $data;
}

function saveCharacterSheetData($dataDir, $dataFile, $data) {
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }

    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    return file_put_contents($dataFile, $jsonData) !== false;
}

function sendJsonResponse($payload) {
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

$requestMethod = $_SERVER['REQUEST_METHOD'];

if ($requestMethod !== 'POST' && $requestMethod !== 'GET') {
    sendJsonResponse(array('success' => false, 'error' => 'Invalid request method'));
}

$requestData = $requestMethod === 'POST' ? $_POST : $_GET;
$action = isset($requestData['action']) ? $requestData['action'] : '';

if (!in_array($action, array('sync-stamina', 'sync-hero-tokens'), true) && $requestMethod !== 'POST') {
    sendJsonResponse(array('success' => false, 'error' => 'Invalid request method'));
}

$requestedCharacter = isset($requestData['character']) ? strtolower(trim($requestData['character'])) : '';

if (!$requestedCharacter && !$is_gm && $currentUser) {
    $requestedCharacter = strtolower($currentUser);
}

if (!in_array($requestedCharacter, $characters, true)) {
    sendJsonResponse(array('success' => false, 'error' => 'Unknown character'));
}

if (!$is_gm && $requestedCharacter !== strtolower($currentUser)) {
    sendJsonResponse(array('success' => false, 'error' => 'Permission denied'));
}

switch ($action) {
    case 'load':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $heroTokens = loadHeroTokens($dataDir, $heroTokenFile);
        $sheet = $allSheets[$requestedCharacter];
        $sheet['hero']['heroTokens'] = $heroTokens;
        sendJsonResponse(array('success' => true, 'data' => $sheet));
        break;

    case 'save':
        $sheetData = isset($_POST['data']) ? json_decode($_POST['data'], true) : null;
        if ($sheetData === null) {
            sendJsonResponse(array('success' => false, 'error' => 'Invalid sheet data'));
        }

        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $heroTokens = loadHeroTokens($dataDir, $heroTokenFile);
        if (!isset($sheetData['hero']) || !is_array($sheetData['hero'])) {
            $sheetData['hero'] = array();
        }
        $sheetData['hero']['heroTokens'] = $heroTokens;
        $allSheets[$requestedCharacter] = mergeCharacterDefaults($sheetData, getDefaultCharacterEntry());

        if (saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
            sendJsonResponse(array('success' => true));
        } else {
            sendJsonResponse(array('success' => false, 'error' => 'Failed to save sheet'));
        }
        break;

    case 'sync-stamina':
        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $sheet = $allSheets[$requestedCharacter];

        if ($requestMethod === 'POST') {
            $staminaMax = isset($requestData['staminaMax']) && $requestData['staminaMax'] !== ''
                ? (int)$requestData['staminaMax']
                : null;
            $currentStamina = isset($requestData['currentStamina']) && $requestData['currentStamina'] !== ''
                ? (int)$requestData['currentStamina']
                : null;

            if ($currentStamina === null) {
                sendJsonResponse(array('success' => false, 'error' => 'Missing stamina values'));
            }

            if ($staminaMax !== null) {
                $sheet['hero']['vitals']['staminaMax'] = $staminaMax;
            }
            $sheet['hero']['vitals']['currentStamina'] = $currentStamina;

            $allSheets[$requestedCharacter] = $sheet;

            if (!saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
                sendJsonResponse(array('success' => false, 'error' => 'Failed to save stamina values'));
            }
        }

        $response = array(
            'name' => isset($sheet['hero']['name']) && $sheet['hero']['name'] !== '' ? $sheet['hero']['name'] : $requestedCharacter,
            'staminaMax' => isset($sheet['hero']['vitals']['staminaMax']) ? $sheet['hero']['vitals']['staminaMax'] : 0,
            'currentStamina' => isset($sheet['hero']['vitals']['currentStamina']) ? $sheet['hero']['vitals']['currentStamina'] : 0,
        );

        sendJsonResponse($response);
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

    default:
        sendJsonResponse(array('success' => false, 'error' => 'Unknown action'));
}
