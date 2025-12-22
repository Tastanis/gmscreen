<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$characters = array('frunk', 'sharon', 'indigo', 'zepha');
$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/character_sheets.json';
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
            'culture' => '',
            'career' => '',
            'classTrack' => '',
            'resourceValue' => '',
            'stamina' => 0,
            'recovery' => 0,
        ),
        'resourceLabel' => '',
        'sidebar' => array(
            'lists' => array(
                'common' => array(),
                'weaknesses' => array(),
                'languages' => array(),
            ),
            'skills' => array(),
        ),
        'tokens' => array(
            'heroic' => false,
            'legendary' => false,
        ),
        'tabs' => array(
            'hero' => '',
            'features' => '',
            'mains' => '',
            'maneuvers' => '',
            'triggers' => '',
            'free-strikes' => '',
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

function mergeCharacterDefaults($entry, $defaults) {
    $normalized = $defaults;

    if (isset($entry['hero']) && is_array($entry['hero'])) {
        $normalized['hero'] = array_merge($defaults['hero'], $entry['hero']);
    }

    if (isset($entry['resourceLabel'])) {
        $normalized['resourceLabel'] = $entry['resourceLabel'];
    }

    if (isset($entry['sidebar']) && is_array($entry['sidebar'])) {
        if (isset($entry['sidebar']['lists']) && is_array($entry['sidebar']['lists'])) {
            $normalized['sidebar']['lists'] = array_merge(
                $defaults['sidebar']['lists'],
                $entry['sidebar']['lists']
            );
        }

        if (isset($entry['sidebar']['skills']) && is_array($entry['sidebar']['skills'])) {
            $normalized['sidebar']['skills'] = $entry['sidebar']['skills'];
        }
    }

    if (isset($entry['tokens']) && is_array($entry['tokens'])) {
        foreach ($defaults['tokens'] as $token => $defaultValue) {
            $normalized['tokens'][$token] = isset($entry['tokens'][$token])
                ? (bool)$entry['tokens'][$token]
                : $defaultValue;
        }
    }

    if (isset($entry['tabs']) && is_array($entry['tabs'])) {
        $normalized['tabs'] = array_merge($defaults['tabs'], $entry['tabs']);
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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonResponse(array('success' => false, 'error' => 'Invalid request method'));
}

$action = isset($_POST['action']) ? $_POST['action'] : '';
$requestedCharacter = isset($_POST['character']) ? strtolower(trim($_POST['character'])) : '';

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
        sendJsonResponse(array('success' => true, 'data' => $allSheets[$requestedCharacter]));
        break;

    case 'save':
        $sheetData = isset($_POST['data']) ? json_decode($_POST['data'], true) : null;
        if ($sheetData === null) {
            sendJsonResponse(array('success' => false, 'error' => 'Invalid sheet data'));
        }

        $allSheets = loadCharacterSheetData($dataDir, $dataFile, $characters);
        $allSheets[$requestedCharacter] = mergeCharacterDefaults($sheetData, getDefaultCharacterEntry());

        if (saveCharacterSheetData($dataDir, $dataFile, $allSheets)) {
            sendJsonResponse(array('success' => true));
        } else {
            sendJsonResponse(array('success' => false, 'error' => 'Failed to save sheet'));
        }
        break;

    default:
        sendJsonResponse(array('success' => false, 'error' => 'Unknown action'));
}
