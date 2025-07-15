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
if (!isset($input['character_slot']) || !isset($input['json_data'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields']);
    exit;
}

$characterSlot = $input['character_slot'];
$jsonData = $input['json_data'];

// Validate character slot
$validSlots = ['frunk', 'sharon', 'indigo', 'zepha'];
if (!in_array($characterSlot, $validSlots)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid character slot']);
    exit;
}

// Parse and validate import JSON data
$importData = json_decode($jsonData, true);
if (!$importData) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON format in character data']);
    exit;
}

// Load existing character data
$dataFile = '../data/characters.json';
$existingData = [];
if (file_exists($dataFile)) {
    $content = file_get_contents($dataFile);
    $existingData = json_decode($content, true);
    if (!$existingData) {
        $existingData = [];
    }
}

// Initialize character slot if it doesn't exist
if (!isset($existingData[$characterSlot])) {
    $existingData[$characterSlot] = [
        'character' => [],
        'current_classes' => [],
        'past_classes' => [],
        'relationships' => [],
        'projects' => [],
        'clubs' => [],
        'job' => []
    ];
}

// Function to safely map imported data to character structure
function mapImportData($importData, $existingCharacter) {
    $character = $existingCharacter;
    
    // Initialize character section if needed
    if (!isset($character['character'])) {
        $character['character'] = [];
    }
    
    // Map basic character information
    if (isset($importData['name'])) {
        $character['character']['character_name'] = $importData['name'];
    }
    
    if (isset($importData['race'])) {
        $character['character']['race'] = $importData['race'];
    }
    
    if (isset($importData['year'])) {
        // Map year to level (1st = 1, 2nd = 2, etc.)
        $yearMap = ['1st' => '1', '2nd' => '2', '3rd' => '3', '4th' => '4'];
        $character['character']['level'] = isset($yearMap[$importData['year']]) ? $yearMap[$importData['year']] : $importData['year'];
    }
    
    if (isset($importData['college'])) {
        $character['character']['college'] = $importData['college'];
    }
    
    if (isset($importData['clubs']) && is_array($importData['clubs'])) {
        $character['character']['extra_curricular'] = implode(', ', $importData['clubs']);
    }
    
    if (isset($importData['edge'])) {
        $character['character']['boon'] = $importData['edge'];
    }
    
    // Handle other character information in the 'other' field
    $otherInfo = [];
    
    if (isset($importData['age'])) {
        $otherInfo[] = "Age: " . $importData['age'];
    }
    
    if (isset($importData['job'])) {
        $otherInfo[] = "Job: " . $importData['job'];
    }
    
    if (isset($importData['bane'])) {
        $otherInfo[] = "Bane: " . $importData['bane'];
    }
    
    // Handle character information section
    if (isset($importData['character_information']) && is_array($importData['character_information'])) {
        $charInfo = $importData['character_information'];
        $otherInfo[] = "\nCharacter Information:";
        
        if (isset($charInfo['origin'])) {
            $otherInfo[] = "Origin: " . $charInfo['origin'];
        }
        
        if (isset($charInfo['desire'])) {
            $otherInfo[] = "Desire: " . $charInfo['desire'];
        }
        
        if (isset($charInfo['fear'])) {
            $otherInfo[] = "Fear: " . $charInfo['fear'];
        }
        
        if (isset($charInfo['connection'])) {
            $otherInfo[] = "Connection: " . $charInfo['connection'];
        }
        
        if (isset($charInfo['impact'])) {
            $otherInfo[] = "Impact: " . $charInfo['impact'];
        }
        
        if (isset($charInfo['change'])) {
            $otherInfo[] = "Change: " . $charInfo['change'];
        }
    }
    
    // Handle skills
    if (isset($importData['skills']) && is_array($importData['skills'])) {
        $otherInfo[] = "\nSkills: " . implode(', ', $importData['skills']);
    }
    
    // Handle other notes
    if (isset($importData['other_notes'])) {
        $otherInfo[] = "\nOther Notes: " . $importData['other_notes'];
    }
    
    // Preserve existing 'other' content and append new content
    $existingOther = isset($character['character']['other']) ? $character['character']['other'] : '';
    $newOther = implode("\n", $otherInfo);
    
    if (!empty($existingOther) && !empty($newOther)) {
        $character['character']['other'] = $existingOther . "\n\n--- Imported Data ---\n" . $newOther;
    } else if (!empty($newOther)) {
        $character['character']['other'] = $newOther;
    }
    
    // Preserve existing data that we're not importing
    $preserveFields = [
        'player_name', 'class', 'minor', 'wealth', 'renown', 'portrait'
    ];
    
    foreach ($preserveFields as $field) {
        if (!isset($character['character'][$field])) {
            $character['character'][$field] = '';
        }
    }
    
    // Preserve other sections if they exist
    $preserveSections = ['current_classes', 'past_classes', 'relationships', 'projects', 'clubs', 'job'];
    foreach ($preserveSections as $section) {
        if (!isset($character[$section])) {
            if ($section === 'clubs') {
                $character[$section] = [['name' => '', 'people' => '', 'bonuses' => '', 'other' => '']];
            } else if (in_array($section, ['past_classes', 'relationships', 'projects'])) {
                $character[$section] = [];
            } else if ($section === 'job') {
                $character[$section] = [
                    'job_title' => '',
                    'job_satisfaction' => '',
                    'wages' => '',
                    'coworkers' => ''
                ];
            } else if ($section === 'current_classes') {
                $character[$section] = [
                    'class_name' => '',
                    'test_1_grade' => '',
                    'test_2_grade' => '',
                    'project_1_grade' => '',
                    'project_2_grade' => '',
                    'overall_grade' => '',
                    'test_buffs' => ''
                ];
            }
        }
    }
    
    return $character;
}

try {
    // Map import data to character structure
    $existingData[$characterSlot] = mapImportData($importData, $existingData[$characterSlot]);
    
    // Create backup of existing file
    if (file_exists($dataFile)) {
        $backupFile = '../data/characters_backup_' . date('Y-m-d_H-i-s') . '.json';
        copy($dataFile, $backupFile);
    }
    
    // Save updated data
    $result = file_put_contents($dataFile, json_encode($existingData, JSON_PRETTY_PRINT));
    
    if ($result === false) {
        throw new Exception('Failed to save character data');
    }
    
    // Return success response
    echo json_encode([
        'success' => true,
        'message' => 'Character imported successfully',
        'character_slot' => $characterSlot,
        'character_name' => isset($importData['name']) ? $importData['name'] : 'Unknown'
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to import character: ' . $e->getMessage()
    ]);
}
?>