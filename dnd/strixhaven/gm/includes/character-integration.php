<?php
// Character Integration for GM Screen - FIXED VERSION WITH BETTER PATH HANDLING

// Function to search characters across both staff and students
function searchCharactersByName($searchTerm) {
    $results = array();
    
    // Search staff
    $staffData = loadStaffDataDirect();
    if ($staffData && isset($staffData['staff'])) {
        foreach ($staffData['staff'] as $member) {
            if (stripos($member['name'], $searchTerm) !== false) {
                // Handle both old image_path and new images array formats
                $imagePath = '';
                if (isset($member['images']) && !empty($member['images'])) {
                    $imagePath = $member['images'][0];
                } elseif (isset($member['image_path'])) {
                    $imagePath = $member['image_path'];
                }
                
                $results[] = array(
                    'id' => $member['staff_id'],
                    'name' => $member['name'],
                    'type' => 'staff',
                    'college' => isset($member['college']) ? $member['college'] : '',
                    'image_path' => $imagePath,
                    'description' => isset($member['character_description']) ? substr($member['character_description'], 0, 100) : ''
                );
            }
        }
    }
    
    // Search students
    $studentsData = loadStudentsDataDirect();
    if ($studentsData && isset($studentsData['students'])) {
        foreach ($studentsData['students'] as $student) {
            if (stripos($student['name'], $searchTerm) !== false) {
                // Handle both old image_path and new images array formats
                $imagePath = '';
                if (isset($student['images']) && !empty($student['images'])) {
                    $imagePath = $student['images'][0];
                } elseif (isset($student['image_path'])) {
                    $imagePath = $student['image_path'];
                }
                
                $results[] = array(
                    'id' => $student['student_id'],
                    'name' => $student['name'],
                    'type' => 'student',
                    'grade' => isset($student['grade_level']) ? $student['grade_level'] : '',
                    'college' => isset($student['college']) ? $student['college'] : '',
                    'image_path' => $imagePath,
                    'description' => isset($student['details']['backstory']) ? substr($student['details']['backstory'], 0, 100) : ''
                );
            }
        }
    }
    
    // Sort results by name
    usort($results, function($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });
    
    return array('success' => true, 'matches' => $results);
}

// Function to get all character names
function getAllCharacterNames() {
    $results = array();
    
    // Get all staff
    $staffData = loadStaffDataDirect();
    if ($staffData && isset($staffData['staff'])) {
        foreach ($staffData['staff'] as $member) {
            // Handle both old image_path and new images array formats
            $imagePath = '';
            if (isset($member['images']) && !empty($member['images'])) {
                $imagePath = $member['images'][0];
            } elseif (isset($member['image_path'])) {
                $imagePath = $member['image_path'];
            }
            
            $results[] = array(
                'id' => $member['staff_id'],
                'name' => $member['name'],
                'type' => 'staff',
                'college' => isset($member['college']) ? $member['college'] : '',
                'image_path' => $imagePath
            );
        }
    }
    
    // Get all students
    $studentsData = loadStudentsDataDirect();
    if ($studentsData && isset($studentsData['students'])) {
        foreach ($studentsData['students'] as $student) {
            // Handle both old image_path and new images array formats
            $imagePath = '';
            if (isset($student['images']) && !empty($student['images'])) {
                $imagePath = $student['images'][0];
            } elseif (isset($student['image_path'])) {
                $imagePath = $student['image_path'];
            }
            
            $results[] = array(
                'id' => $student['student_id'],
                'name' => $student['name'],
                'type' => 'student',
                'grade' => isset($student['grade_level']) ? $student['grade_level'] : '',
                'college' => isset($student['college']) ? $student['college'] : '',
                'image_path' => $imagePath
            );
        }
    }
    
    // Get all locations
    $locationsData = loadLocationsDataDirect();
    if ($locationsData && isset($locationsData['locations'])) {
        foreach ($locationsData['locations'] as $location) {
            // Only include locations visible to GM (all locations for GM)
            $results[] = array(
                'id' => $location['location_id'],
                'name' => $location['name'],
                'type' => 'location',
                'college' => isset($location['college']) ? $location['college'] : '',
                'hex_color' => isset($location['hex_color']) ? $location['hex_color'] : '',
                'image_path' => isset($location['images']) && !empty($location['images']) ? $location['images'][0] : ''
            );
        }
    }
    
    // Sort results by name
    usort($results, function($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });
    
    return array('success' => true, 'characters' => $results);
}

// Function to get character details for popout
function getCharacterDetails($characterId, $characterType) {
    if ($characterType === 'staff') {
        $staffData = loadStaffDataDirect();
        if ($staffData && isset($staffData['staff'])) {
            foreach ($staffData['staff'] as $member) {
                if ($member['staff_id'] === $characterId) {
                    return array('success' => true, 'character' => $member, 'type' => 'staff');
                }
            }
        }
    } elseif ($characterType === 'student') {
        $studentsData = loadStudentsDataDirect();
        if ($studentsData && isset($studentsData['students'])) {
            foreach ($studentsData['students'] as $student) {
                if ($student['student_id'] === $characterId) {
                    return array('success' => true, 'character' => $student, 'type' => 'student');
                }
            }
        }
    } elseif ($characterType === 'location') {
        $locationsData = loadLocationsDataDirect();
        if ($locationsData && isset($locationsData['locations'])) {
            foreach ($locationsData['locations'] as $location) {
                if ($location['location_id'] === $characterId) {
                    return array('success' => true, 'character' => $location, 'type' => 'location');
                }
            }
        }
    }
    
    return array('success' => false, 'error' => 'Character not found');
}

// Helper function to load staff data directly - FIXED PATHS
function loadStaffDataDirect() {
    // Get current directory path
    $currentDir = dirname(__FILE__);
    
    // Try multiple possible paths relative to the current file
    $possiblePaths = array(
        // If we're in gm/ folder, go up to strixhaven level, then to staff
        $currentDir . '/../staff/staff.json',
        // If we're in a deeper folder
        $currentDir . '/../../staff/staff.json',
        // If we're in includes/ subfolder of gm/
        $currentDir . '/../../../staff/staff.json',
        // Direct relative path from web root
        $_SERVER['DOCUMENT_ROOT'] . '/dnd/strixhaven/staff/staff.json',
        // Try absolute path construction
        dirname(dirname($currentDir)) . '/staff/staff.json'
    );
    
    foreach ($possiblePaths as $staffFile) {
        if (file_exists($staffFile)) {
            $content = file_get_contents($staffFile);
            if ($content !== false) {
                $data = json_decode($content, true);
                if ($data && json_last_error() === JSON_ERROR_NONE) {
                    error_log("Staff data loaded successfully from: " . $staffFile);
                    return $data;
                }
            }
        } else {
            error_log("Staff file not found at: " . $staffFile);
        }
    }
    
    error_log("Could not find staff.json file. Tried paths: " . implode(', ', $possiblePaths));
    error_log("Current directory: " . $currentDir);
    error_log("Document root: " . $_SERVER['DOCUMENT_ROOT']);
    
    return null;
}

// Helper function to load students data directly - FIXED PATHS
function loadStudentsDataDirect() {
    // Get current directory path
    $currentDir = dirname(__FILE__);
    
    // Try multiple possible paths relative to the current file
    $possiblePaths = array(
        // If we're in gm/ folder, go up to strixhaven level, then to students
        $currentDir . '/../students/students.json',
        // If we're in a deeper folder
        $currentDir . '/../../students/students.json',
        // If we're in includes/ subfolder of gm/
        $currentDir . '/../../../students/students.json',
        // Direct relative path from web root
        $_SERVER['DOCUMENT_ROOT'] . '/dnd/strixhaven/students/students.json',
        // Try absolute path construction
        dirname(dirname($currentDir)) . '/students/students.json'
    );
    
    foreach ($possiblePaths as $studentsFile) {
        if (file_exists($studentsFile)) {
            $content = file_get_contents($studentsFile);
            if ($content !== false) {
                $data = json_decode($content, true);
                if ($data && json_last_error() === JSON_ERROR_NONE) {
                    error_log("Students data loaded successfully from: " . $studentsFile);
                    return $data;
                }
            }
        } else {
            error_log("Students file not found at: " . $studentsFile);
        }
    }
    
    error_log("Could not find students.json file. Tried paths: " . implode(', ', $possiblePaths));
    error_log("Current directory: " . $currentDir);
    error_log("Document root: " . $_SERVER['DOCUMENT_ROOT']);
    
    return null;
}

// Helper function to load locations data directly - FIXED PATHS
function loadLocationsDataDirect() {
    // Get current directory path
    $currentDir = dirname(__FILE__);
    
    // Try multiple possible paths relative to the current file
    $possiblePaths = array(
        // If we're in gm/includes/ folder, go up to strixhaven level, then to locations
        $currentDir . '/../../locations/locations.json',
        // If we're in gm/ folder
        $currentDir . '/../locations/locations.json',
        // If we're in a deeper folder
        $currentDir . '/../../../locations/locations.json',
        // Direct relative path from web root
        $_SERVER['DOCUMENT_ROOT'] . '/dnd/strixhaven/locations/locations.json',
        // Try absolute path construction
        dirname(dirname($currentDir)) . '/locations/locations.json'
    );
    
    foreach ($possiblePaths as $locationsFile) {
        if (file_exists($locationsFile)) {
            $content = file_get_contents($locationsFile);
            if ($content !== false) {
                $data = json_decode($content, true);
                if ($data && json_last_error() === JSON_ERROR_NONE) {
                    error_log("Locations data loaded successfully from: " . $locationsFile);
                    return $data;
                }
            }
        } else {
            error_log("Locations file not found at: " . $locationsFile);
        }
    }
    
    error_log("Could not find locations.json file. Tried paths: " . implode(', ', $possiblePaths));
    error_log("Current directory: " . $currentDir);
    error_log("Document root: " . $_SERVER['DOCUMENT_ROOT']);
    
    return null;
}

// Debug function to test file loading
function debugFileLoading() {
    echo "<h3>Debug Information</h3>";
    echo "<p><strong>Current Directory:</strong> " . dirname(__FILE__) . "</p>";
    echo "<p><strong>Document Root:</strong> " . $_SERVER['DOCUMENT_ROOT'] . "</p>";
    
    echo "<h4>Staff File Check:</h4>";
    $staffData = loadStaffDataDirect();
    if ($staffData) {
        echo "<p>✓ Staff data loaded successfully (" . count($staffData['staff']) . " members)</p>";
    } else {
        echo "<p>✗ Failed to load staff data</p>";
    }
    
    echo "<h4>Students File Check:</h4>";
    $studentsData = loadStudentsDataDirect();
    if ($studentsData) {
        echo "<p>✓ Students data loaded successfully (" . count($studentsData['students']) . " students)</p>";
    } else {
        echo "<p>✗ Failed to load students data</p>";
    }
    
    echo "<h4>All Characters:</h4>";
    $allChars = getAllCharacterNames();
    if ($allChars['success']) {
        echo "<p>✓ Total characters found: " . count($allChars['characters']) . "</p>";
        foreach (array_slice($allChars['characters'], 0, 5) as $char) {
            echo "<p>- " . htmlspecialchars($char['name']) . " (" . $char['type'] . ")</p>";
        }
        if (count($allChars['characters']) > 5) {
            echo "<p>... and " . (count($allChars['characters']) - 5) . " more</p>";
        }
    } else {
        echo "<p>✗ Failed to get character list</p>";
    }
}

// If this file is accessed directly, show debug info
if (basename($_SERVER['PHP_SELF']) === 'character-integration.php') {
    debugFileLoading();
}
?>