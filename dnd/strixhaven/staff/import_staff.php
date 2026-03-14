<?php
session_start();

// Check if user is logged in and is GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || $_SESSION['user'] !== 'GM') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Unauthorized access']);
    exit;
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON input']);
    exit;
}

// Validate required fields
if (!isset($input['json_data'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing JSON data']);
    exit;
}

$jsonData = $input['json_data'];

// Parse and validate import JSON data
$importData = json_decode($jsonData, true);
if (!$importData) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON format in staff data']);
    exit;
}

// Validate required fields in import data
if (!isset($importData['name']) || empty(trim($importData['name']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Staff member name is required']);
    exit;
}

require_once __DIR__ . '/data-utils.php';

// Define valid options for validation
$validColleges = ['Silverquill', 'Prismari', 'Witherbloom', 'Lorehold', 'Quandrix'];

// Function to map import data to staff structure
function mapImportDataToStaff($importData) {
    global $validColleges;

    $warnings = [];
    $staff = getBlankStaffRecord();

    $staff['name'] = trim($importData['name']);

    if (isset($importData['title'])) {
        $staff['title'] = trim($importData['title']);
    }
    if (isset($importData['role'])) {
        $staff['role'] = trim($importData['role']);
    }
    if (isset($importData['pronouns'])) {
        $staff['pronouns'] = trim($importData['pronouns']);
    }

    // Handle college validation
    if (isset($importData['college'])) {
        $college = trim($importData['college']);
        if (in_array($college, $validColleges)) {
            $staff['college'] = $college;
        } else {
            $staff['college'] = '';
            $warnings[] = "Invalid college '{$college}', please select from: " . implode(', ', $validColleges);
        }
    } else {
        $staff['college'] = '';
    }

    // Character description and general info
    if (isset($importData['character_description'])) {
        $staff['character_description'] = trim($importData['character_description']);
    }
    if (isset($importData['general_info'])) {
        $staff['general_info'] = trim($importData['general_info']);
    }

    // Conflict Engine fields
    if (isset($importData['conflict_engine']) && is_array($importData['conflict_engine'])) {
        $ce = $importData['conflict_engine'];
        foreach (['want', 'want_tag', 'obstacle', 'action', 'consequence'] as $key) {
            if (isset($ce[$key])) {
                $staff['conflict_engine'][$key] = trim($ce[$key]);
            }
        }
    }

    // Tension Web array
    if (isset($importData['tension_web']) && is_array($importData['tension_web'])) {
        $tensionWeb = array();
        foreach ($importData['tension_web'] as $entry) {
            if (is_array($entry)) {
                $twEntry = array(
                    'name' => isset($entry['name']) ? trim($entry['name']) : '',
                    'role' => isset($entry['role']) ? trim($entry['role']) : '',
                    'description' => isset($entry['description']) ? trim($entry['description']) : '',
                );
                if (!empty($twEntry['name']) || !empty($twEntry['role']) || !empty($twEntry['description'])) {
                    $tensionWeb[] = $twEntry;
                }
            }
        }
        $staff['tension_web'] = $tensionWeb;
    }

    // Pressure Point, Trajectory, Director's Notes
    if (isset($importData['pressure_point'])) {
        $staff['pressure_point'] = trim($importData['pressure_point']);
    }
    if (isset($importData['trajectory'])) {
        $staff['trajectory'] = trim($importData['trajectory']);
    }
    if (isset($importData['directors_notes'])) {
        $staff['directors_notes'] = trim($importData['directors_notes']);
    }

    // Character information fields
    if (isset($importData['character_info']) && is_array($importData['character_info'])) {
        $charInfo = $importData['character_info'];
        foreach (['origin', 'motivation', 'secrets', 'relationships'] as $key) {
            if (isset($charInfo[$key])) {
                $staff['character_info'][$key] = trim($charInfo[$key]);
            }
        }
    }

    // GM Only notes
    if (isset($importData['gm_notes']) && is_array($importData['gm_notes'])) {
        $gmNotes = $importData['gm_notes'];
        foreach (['plot_hooks', 'secrets', 'notes'] as $key) {
            if (isset($gmNotes[$key])) {
                $staff['gm_only'][$key] = trim($gmNotes[$key]);
            }
        }
    }

    return array('staff' => $staff, 'warnings' => $warnings);
}

try {
    // Map import data to staff structure
    $result = mapImportDataToStaff($importData);
    $newStaff = $result['staff'];
    $warnings = $result['warnings'];

    $saveResult = modifyStaffData(function (&$data) use ($newStaff) {
        $data['staff'][] = $newStaff;
        return ['result' => true];
    });

    if (!$saveResult['success']) {
        $error = isset($saveResult['error']) ? $saveResult['error'] : 'Failed to save staff data';
        throw new Exception($error);
    }

    // Return success response
    $response = array(
        'success' => true,
        'message' => 'Staff member imported successfully',
        'staff_name' => $newStaff['name'],
        'staff_id' => $newStaff['staff_id']
    );

    if (!empty($warnings)) {
        $response['warnings'] = $warnings;
    }

    echo json_encode($response);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to import staff member: ' . $e->getMessage()
    ]);
}
?>