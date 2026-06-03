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
    echo json_encode(['success' => false, 'error' => 'Invalid JSON format in staff data']);
    exit;
}

require_once __DIR__ . '/data-utils.php';

$validColleges = ['Silverquill', 'Prismari', 'Witherbloom', 'Lorehold', 'Quandrix'];
$validWantTags = ['Legacy', 'Recognition', 'Freedom', 'Power', 'Knowledge', 'Connection', 'Survival', 'Justice', 'Creation', 'Redemption'];

function cleanImportString($value) {
    if (is_array($value) || is_object($value)) {
        return '';
    }
    return trim((string)$value);
}

function normalizeStaffRecords($importData) {
    if (isset($importData['staff']) && is_array($importData['staff'])) {
        return $importData['staff'];
    }
    return [$importData];
}

function mapImportDataToStaff($importData) {
    global $validColleges, $validWantTags;

    $warnings = [];
    $staff = getBlankStaffRecord();

    if (!isset($importData['name']) || cleanImportString($importData['name']) === '') {
        return ['staff' => null, 'warnings' => ['Skipped record without a staff name']];
    }

    $staff['name'] = cleanImportString($importData['name']);

    foreach (['title', 'role', 'pronouns', 'character_description', 'general_info', 'pressure_point', 'trajectory', 'directors_notes'] as $field) {
        if (isset($importData[$field])) {
            $staff[$field] = cleanImportString($importData[$field]);
        }
    }

    if (isset($importData['college'])) {
        $college = cleanImportString($importData['college']);
        if ($college === '' || in_array($college, $validColleges)) {
            $staff['college'] = $college;
        } else {
            $warnings[] = "Invalid college '{$college}' for {$staff['name']}; left blank";
        }
    }

    if (isset($importData['conflict_engine']) && is_array($importData['conflict_engine'])) {
        $ce = $importData['conflict_engine'];
        foreach (['want', 'obstacle', 'action', 'consequence'] as $key) {
            if (isset($ce[$key])) {
                $staff['conflict_engine'][$key] = cleanImportString($ce[$key]);
            }
        }
        if (isset($ce['want_tag'])) {
            $wantTag = cleanImportString($ce['want_tag']);
            if ($wantTag === '' || in_array($wantTag, $validWantTags)) {
                $staff['conflict_engine']['want_tag'] = $wantTag;
            } else {
                $staff['conflict_engine']['want_tag'] = $wantTag;
                $warnings[] = "Custom want tag '{$wantTag}' added for {$staff['name']}";
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
                'name' => isset($entry['name']) ? cleanImportString($entry['name']) : '',
                'role' => isset($entry['role']) ? cleanImportString($entry['role']) : '',
                'description' => isset($entry['description']) ? cleanImportString($entry['description']) : '',
            ];
            if ($twEntry['name'] !== '' || $twEntry['role'] !== '' || $twEntry['description'] !== '') {
                $tensionWeb[] = $twEntry;
            }
        }
        $staff['tension_web'] = $tensionWeb;
    }

    if (isset($importData['character_info']) && is_array($importData['character_info'])) {
        foreach ($importData['character_info'] as $key => $value) {
            $staff['character_info'][$key] = cleanImportString($value);
        }
    }

    if (isset($importData['character_information']) && is_array($importData['character_information'])) {
        foreach ($importData['character_information'] as $key => $value) {
            $staff['character_info'][$key] = cleanImportString($value);
        }
    }

    if (isset($importData['gm_only']) && is_array($importData['gm_only'])) {
        foreach ($importData['gm_only'] as $key => $value) {
            $staff['gm_only'][$key] = cleanImportString($value);
        }
    }

    if (isset($importData['gm_notes']) && is_array($importData['gm_notes'])) {
        foreach ($importData['gm_notes'] as $key => $value) {
            $staff['gm_only'][$key] = cleanImportString($value);
        }
    }

    if (isset($importData['image_path'])) {
        $staff['image_path'] = cleanImportString($importData['image_path']);
    }

    if (isset($importData['images']) && is_array($importData['images'])) {
        $staff['images'] = array_values(array_filter(array_map('cleanImportString', $importData['images'])));
    }

    if (isset($importData['image_adjustments']) && is_array($importData['image_adjustments'])) {
        $staff['image_adjustments'] = $importData['image_adjustments'];
    }

    return ['staff' => $staff, 'warnings' => $warnings];
}

try {
    $records = normalizeStaffRecords($importData);
    $newStaff = [];
    $warnings = [];
    $skipped = 0;

    foreach ($records as $record) {
        if (!is_array($record)) {
            $skipped++;
            $warnings[] = 'Skipped non-object staff record';
            continue;
        }

        $result = mapImportDataToStaff($record);
        $warnings = array_merge($warnings, $result['warnings']);

        if ($result['staff'] === null) {
            $skipped++;
            continue;
        }

        $newStaff[] = $result['staff'];
    }

    if (empty($newStaff)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No valid staff records found']);
        exit;
    }

    $saveResult = modifyStaffData(function (&$data) use ($newStaff) {
        foreach ($newStaff as $staffMember) {
            $data['staff'][] = $staffMember;
        }
        return ['result' => true];
    });

    if (!$saveResult['success']) {
        $error = isset($saveResult['error']) ? $saveResult['error'] : 'Failed to save staff data';
        throw new Exception($error);
    }

    $response = [
        'success' => true,
        'message' => count($newStaff) === 1 ? 'Staff member imported successfully' : 'Staff members imported successfully',
        'imported_count' => count($newStaff),
        'skipped_count' => $skipped,
        'staff_names' => array_map(function ($staffMember) {
            return $staffMember['name'];
        }, $newStaff),
        'staff_ids' => array_map(function ($staffMember) {
            return $staffMember['staff_id'];
        }, $newStaff),
    ];

    if (!empty($warnings)) {
        $response['warnings'] = $warnings;
    }

    echo json_encode($response);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to import staff: ' . $e->getMessage(),
    ]);
}
?>
