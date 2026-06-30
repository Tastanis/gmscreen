<?php
session_start();

header('Content-Type: application/json');

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || $_SESSION['user'] !== 'GM') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Unauthorized access']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || !isset($input['json_data'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing JSON data']);
    exit;
}

$importData = json_decode($input['json_data'], true);
if (!$importData) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON format in NPC data']);
    exit;
}

require_once __DIR__ . '/data-utils.php';

$validColleges = ['Silverquill', 'Prismari', 'Witherbloom', 'Lorehold', 'Quandrix'];
$validWantTags = ['Legacy', 'Recognition', 'Freedom', 'Power', 'Knowledge', 'Connection', 'Survival', 'Justice', 'Creation', 'Redemption'];

function cleanNpcImportString($value) {
    if (is_array($value) || is_object($value)) {
        return '';
    }
    return trim((string)$value);
}

function normalizeNpcRecords($importData) {
    if (isset($importData['npcs']) && is_array($importData['npcs'])) {
        return $importData['npcs'];
    }
    if (isset($importData['other_npcs']) && is_array($importData['other_npcs'])) {
        return $importData['other_npcs'];
    }
    return [$importData];
}

function mapImportDataToNpc($importData) {
    global $validColleges, $validWantTags;

    $warnings = [];
    $npc = getBlankNpcRecord();

    if (!isset($importData['name']) || cleanNpcImportString($importData['name']) === '') {
        return ['npc' => null, 'warnings' => ['Skipped record without an NPC name']];
    }

    $npc['name'] = cleanNpcImportString($importData['name']);

    foreach (['race', 'age', 'school', 'character_description', 'general_info', 'pressure_point', 'trajectory', 'directors_notes'] as $field) {
        if (isset($importData[$field])) {
            $npc[$field] = cleanNpcImportString($importData[$field]);
        }
    }

    if (isset($importData['college'])) {
        $college = cleanNpcImportString($importData['college']);
        if ($college === '' || in_array($college, $validColleges)) {
            $npc['college'] = $college;
            if ($npc['school'] === '') {
                $npc['school'] = $college;
            }
        } else {
            $npc['college'] = '';
            if ($npc['school'] === '') {
                $npc['school'] = $college;
            }
            $warnings[] = "Invalid college '{$college}' for {$npc['name']}; kept as school text only";
        }
    }

    if (isset($importData['conflict_engine']) && is_array($importData['conflict_engine'])) {
        $ce = $importData['conflict_engine'];
        foreach (['want', 'obstacle', 'action', 'consequence'] as $key) {
            if (isset($ce[$key])) {
                $npc['conflict_engine'][$key] = cleanNpcImportString($ce[$key]);
            }
        }
        if (isset($ce['want_tag'])) {
            $wantTag = cleanNpcImportString($ce['want_tag']);
            $npc['conflict_engine']['want_tag'] = $wantTag;
            if ($wantTag !== '' && !in_array($wantTag, $validWantTags)) {
                $warnings[] = "Custom want tag '{$wantTag}' added for {$npc['name']}";
            }
        }
    }

    if (isset($importData['tension_web']) && is_array($importData['tension_web'])) {
        $tensionWeb = [];
        foreach ($importData['tension_web'] as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $twEntry = [
                'name' => isset($entry['name']) ? cleanNpcImportString($entry['name']) : '',
                'role' => isset($entry['role']) ? cleanNpcImportString($entry['role']) : '',
                'description' => isset($entry['description']) ? cleanNpcImportString($entry['description']) : '',
            ];
            if ($twEntry['name'] !== '' || $twEntry['role'] !== '' || $twEntry['description'] !== '') {
                $tensionWeb[] = $twEntry;
            }
        }
        $npc['tension_web'] = $tensionWeb;
    }

    if (isset($importData['details']) && is_array($importData['details'])) {
        foreach ($importData['details'] as $key => $value) {
            $npc['details'][$key] = cleanNpcImportString($value);
        }
    }

    if (isset($importData['gm_only']) && is_array($importData['gm_only'])) {
        foreach ($importData['gm_only'] as $key => $value) {
            $npc['gm_only'][$key] = cleanNpcImportString($value);
        }
    }

    if (isset($importData['gm_notes']) && is_array($importData['gm_notes'])) {
        foreach ($importData['gm_notes'] as $key => $value) {
            $npc['gm_only'][$key] = cleanNpcImportString($value);
        }
    }

    if (isset($importData['image_path'])) {
        $npc['image_path'] = cleanNpcImportString($importData['image_path']);
    }

    if (isset($importData['images']) && is_array($importData['images'])) {
        $npc['images'] = array_values(array_filter(array_map('cleanNpcImportString', $importData['images'])));
    }

    if (isset($importData['image_adjustments']) && is_array($importData['image_adjustments'])) {
        $npc['image_adjustments'] = $importData['image_adjustments'];
    }

    return ['npc' => $npc, 'warnings' => $warnings];
}

try {
    $records = normalizeNpcRecords($importData);
    $newNpcs = [];
    $warnings = [];
    $skipped = 0;

    foreach ($records as $record) {
        if (!is_array($record)) {
            $skipped++;
            $warnings[] = 'Skipped non-object NPC record';
            continue;
        }

        $result = mapImportDataToNpc($record);
        $warnings = array_merge($warnings, $result['warnings']);

        if ($result['npc'] === null) {
            $skipped++;
            continue;
        }

        $newNpcs[] = $result['npc'];
    }

    if (empty($newNpcs)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No valid NPC records found']);
        exit;
    }

    $saveResult = modifyNpcData(function (&$data) use ($newNpcs) {
        foreach ($newNpcs as $npc) {
            $data['npcs'][] = $npc;
        }
        return ['result' => true];
    });

    if (!$saveResult['success']) {
        $error = isset($saveResult['error']) ? $saveResult['error'] : 'Failed to save NPC data';
        throw new Exception($error);
    }

    $response = [
        'success' => true,
        'message' => count($newNpcs) === 1 ? 'NPC imported successfully' : 'NPCs imported successfully',
        'imported_count' => count($newNpcs),
        'skipped_count' => $skipped,
        'npc_names' => array_map(function ($npc) {
            return $npc['name'];
        }, $newNpcs),
        'npc_ids' => array_map(function ($npc) {
            return $npc['npc_id'];
        }, $newNpcs),
    ];

    if (!empty($warnings)) {
        $response['warnings'] = $warnings;
    }

    echo json_encode($response);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to import NPCs: ' . $e->getMessage(),
    ]);
}
?>
