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
    echo json_encode(['success' => false, 'error' => 'Invalid JSON format in student data']);
    exit;
}

// Validate required fields in import data
if (!isset($importData['name']) || empty(trim($importData['name']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Student name is required']);
    exit;
}

// Load existing student data
function loadStudentData() {
    $dataFile = 'students.json';
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data && isset($data['students'])) {
            return $data;
        }
    }
    
    // Return default data structure if file doesn't exist
    return array(
        'students' => array(),
        'metadata' => array(
            'last_updated' => date('Y-m-d H:i:s'),
            'total_students' => 0
        )
    );
}

// Function to save student data
function saveStudentData($data) {
    $dataFile = 'students.json';
    
    // Update metadata
    $data['metadata']['last_updated'] = date('Y-m-d H:i:s');
    $data['metadata']['total_students'] = count($data['students']);
    
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    return file_put_contents($dataFile, $jsonData, LOCK_EX);
}

// Define valid options for validation
$validColleges = ['Silverquill', 'Prismari', 'Witherbloom', 'Lorehold', 'Quandrix'];
$validYears = ['1st', '2nd', '3rd', '4th'];

// Predefined skills list for validation
$validSkills = [
    // Crafting Skills
    'Alchemy', 'Architecture', 'Blacksmithing', 'Carpentry', 'Cooking', 'Fletching', 
    'Forgery', 'Jewelry', 'Mechanics', 'Tailoring',
    
    // Exploration Skills  
    'Climb', 'Drive', 'Endurance', 'Gymnastics', 'Heal', 'Jump', 'Lift', 'Navigate', 
    'Ride', 'Swim', 'Track',
    
    // Interpersonal Skills
    'Brag', 'Empathize', 'Flirt', 'Gamble', 'Handle Animals', 'Interrogate', 
    'Intimidate', 'Lead', 'Lie', 'Music', 'Perform', 'Persuade', 'Read Person',
    
    // Intrigue Skills
    'Alertness', 'Conceal Object', 'Disguise', 'Eavesdrop', 'Escape Artist', 'Hide', 
    'Pick Lock', 'Pick Pocket', 'Sabotage', 'Search',
    
    // Lore Skills
    'Culture', 'Criminal Underworld', 'History', 'Magic', 'Monsters', 'Nature', 
    'Psionics', 'Religion', 'Rumors', 'Society', 'Strategy', 'Timescape'
];

// Function to map import data to student structure
function mapImportDataToStudent($importData) {
    global $validColleges, $validYears, $validSkills;
    
    $warnings = [];
    
    // Generate unique student ID
    $student_id = 'student_' . time() . '_' . uniqid();
    
    // Map basic fields
    $student = array(
        'student_id' => $student_id,
        'name' => trim($importData['name']),
        'images' => array(),
        'race' => isset($importData['race']) ? trim($importData['race']) : '',
        'age' => isset($importData['age']) ? trim($importData['age']) : '',
        'job' => isset($importData['job']) ? trim($importData['job']) : '',
        'edge' => isset($importData['edge']) ? trim($importData['edge']) : '',
        'bane' => isset($importData['bane']) ? trim($importData['bane']) : '',
        'favorites' => array(),
        'relationships' => array(
            'frunk_points' => '',
            'frunk_notes' => '',
            'zepha_points' => '',
            'zepha_notes' => '',
            'sharon_points' => '',
            'sharon_notes' => '',
            'indigo_points' => '',
            'indigo_notes' => ''
        )
    );
    
    // Handle year to grade_level conversion
    if (isset($importData['year'])) {
        $year = trim($importData['year']);
        // Remove 'Year' if present and normalize
        $year = str_replace(['Year', 'year'], '', $year);
        $year = trim($year);
        
        if (in_array($year, $validYears)) {
            $student['grade_level'] = $year . ' Year';
        } else {
            $student['grade_level'] = '1st Year'; // Default
            $warnings[] = "Invalid year '{$importData['year']}', defaulted to '1st Year'";
        }
    } else {
        $student['grade_level'] = '1st Year';
    }
    
    // Handle college validation
    if (isset($importData['college'])) {
        $college = trim($importData['college']);
        if (in_array($college, $validColleges)) {
            $student['college'] = $college;
        } else {
            $student['college'] = '';
            $warnings[] = "Invalid college '{$college}', please select from: " . implode(', ', $validColleges);
        }
    } else {
        $student['college'] = '';
    }
    
    // Handle clubs
    if (isset($importData['clubs']) && is_array($importData['clubs'])) {
        $student['clubs'] = array_filter(array_map('trim', $importData['clubs']));
    } else {
        $student['clubs'] = array();
    }
    
    // Handle skills with validation
    if (isset($importData['skills']) && is_array($importData['skills'])) {
        $skills = array();
        $customSkills = array();
        
        foreach ($importData['skills'] as $skill) {
            $skill = trim($skill);
            if (!empty($skill)) {
                $skills[] = $skill;
                if (!in_array($skill, $validSkills)) {
                    $customSkills[] = $skill;
                }
            }
        }
        
        $student['skills'] = $skills;
        
        if (!empty($customSkills)) {
            $warnings[] = "Custom skills added: " . implode(', ', $customSkills);
        }
    } else {
        $student['skills'] = array();
    }
    
    // Handle character_information mapping to character_info
    $student['character_info'] = array(
        'origin' => '',
        'desire' => '',
        'fear' => '',
        'connection' => '',
        'impact' => '',
        'change' => ''
    );
    
    if (isset($importData['character_information']) && is_array($importData['character_information'])) {
        $charInfo = $importData['character_information'];
        
        if (isset($charInfo['origin'])) {
            $student['character_info']['origin'] = trim($charInfo['origin']);
        }
        if (isset($charInfo['desire'])) {
            $student['character_info']['desire'] = trim($charInfo['desire']);
        }
        if (isset($charInfo['fear'])) {
            $student['character_info']['fear'] = trim($charInfo['fear']);
        }
        if (isset($charInfo['connection'])) {
            $student['character_info']['connection'] = trim($charInfo['connection']);
        }
        if (isset($charInfo['impact'])) {
            $student['character_info']['impact'] = trim($charInfo['impact']);
        }
        if (isset($charInfo['change'])) {
            $student['character_info']['change'] = trim($charInfo['change']);
        }
    }
    
    // Handle details section
    $student['details'] = array(
        'backstory' => '',
        'core_want' => '',
        'core_fear' => '',
        'other' => isset($importData['other_notes']) ? trim($importData['other_notes']) : ''
    );
    
    return array('student' => $student, 'warnings' => $warnings);
}

try {
    // Load existing data
    $data = loadStudentData();
    
    // Map import data to student structure
    $result = mapImportDataToStudent($importData);
    $newStudent = $result['student'];
    $warnings = $result['warnings'];
    
    // Create backup of existing file
    $dataFile = 'students.json';
    if (file_exists($dataFile)) {
        $backupFile = 'students_backup_' . date('Y-m-d_H-i-s') . '.json';
        copy($dataFile, $backupFile);
    }
    
    // Add new student to data
    $data['students'][] = $newStudent;
    
    // Save updated data
    $saveResult = saveStudentData($data);
    
    if ($saveResult === false) {
        throw new Exception('Failed to save student data');
    }
    
    // Return success response
    $response = array(
        'success' => true,
        'message' => 'Student imported successfully',
        'student_name' => $newStudent['name'],
        'student_id' => $newStudent['student_id']
    );
    
    if (!empty($warnings)) {
        $response['warnings'] = $warnings;
    }
    
    echo json_encode($response);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to import student: ' . $e->getMessage()
    ]);
}
?>