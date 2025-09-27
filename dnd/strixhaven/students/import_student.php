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

require_once __DIR__ . '/data-utils.php';

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
    $student = getBlankStudentRecord();

    $student['name'] = trim($importData['name']);
    if (isset($importData['race'])) {
        $student['race'] = trim($importData['race']);
    }
    if (isset($importData['age'])) {
        $student['age'] = trim($importData['age']);
    }
    if (isset($importData['job'])) {
        $student['job'] = trim($importData['job']);
    }
    if (isset($importData['edge'])) {
        $student['edge'] = trim($importData['edge']);
    }
    if (isset($importData['bane'])) {
        $student['bane'] = trim($importData['bane']);
    }
    
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
    
    if (isset($importData['other_notes'])) {
        $student['details']['other'] = trim($importData['other_notes']);
    }

    return array('student' => $student, 'warnings' => $warnings);
}

try {
    // Map import data to student structure
    $result = mapImportDataToStudent($importData);
    $newStudent = $result['student'];
    $warnings = $result['warnings'];

    $saveResult = modifyStudentData(function (&$data) use ($newStudent) {
        $data['students'][] = $newStudent;
        return ['result' => true];
    });

    if (!$saveResult['success']) {
        $error = isset($saveResult['error']) ? $saveResult['error'] : 'Failed to save student data';
        throw new Exception($error);
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