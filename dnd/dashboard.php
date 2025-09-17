<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Define character list
$characters = array('frunk', 'sharon', 'indigo', 'zepha');

// Include character integration utilities for loading student data
require_once __DIR__ . '/strixhaven/gm/includes/character-integration.php';

// Update a student's relationship points with a PC
function updateStudentRelationshipPoints($npcName, $pcName, $points) {
    $studentsFile = __DIR__ . '/strixhaven/students/students.json';
    if (!file_exists($studentsFile)) {
        return;
    }

    $content = file_get_contents($studentsFile);
    $data = json_decode($content, true);
    if (!$data || !isset($data['students'])) {
        return;
    }

    $updated = false;
    foreach ($data['students'] as &$student) {
        if (strcasecmp($student['name'], $npcName) === 0) {
            if (!isset($student['relationships'])) {
                $student['relationships'] = array();
            }
            $key = strtolower($pcName) . '_points';
            $student['relationships'][$key] = $points;
            $updated = true;
            break;
        }
    }

    if ($updated) {
        if (!isset($data['metadata'])) {
            $data['metadata'] = array();
        }
        $data['metadata']['last_updated'] = date('Y-m-d H:i:s');
        $data['metadata']['total_students'] = count($data['students']);
        file_put_contents($studentsFile, json_encode($data, JSON_PRETTY_PRINT));
    }
}

// Function to load character data
function loadCharacterData() {
    $dataFile = 'data/characters.json';
    
    // If file exists, try to load it
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        
        // Check if file is not empty
        if (empty($content)) {
            error_log("ERROR: characters.json exists but is empty!");
            // Try to load from backup
            $backupFile = 'data/characters_backup_latest.json';
            if (file_exists($backupFile)) {
                $content = file_get_contents($backupFile);
                error_log("Attempting to recover from backup file");
            } else {
                die("CRITICAL ERROR: Character data file is empty and no backup found. Please restore from a manual backup.");
            }
        }
        
        // Try to decode JSON
        $data = json_decode($content, true);
        
        // Check for JSON errors
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log("ERROR: JSON decode failed - " . json_last_error_msg());
            error_log("File content length: " . strlen($content));
            
            // Try to load from backup
            $backupFile = 'data/characters_backup_latest.json';
            if (file_exists($backupFile)) {
                $backupContent = file_get_contents($backupFile);
                $data = json_decode($backupContent, true);
                if (json_last_error() === JSON_ERROR_NONE && $data) {
                    error_log("Successfully recovered from backup file");
                    // Restore the backup as main file
                    file_put_contents($dataFile, $backupContent, LOCK_EX);
                    return $data;
                }
            }
            
            die("CRITICAL ERROR: Character data file is corrupted. JSON Error: " . json_last_error_msg() . ". Please restore from a manual backup.");
        }
        
        // Validate that we have actual character data
        if ($data && is_array($data) && !empty($data)) {
            // Check if at least one character has a name (indicates real data vs empty defaults)
            $hasRealData = false;
            foreach ($data as $char => $charData) {
                if (isset($charData['character']['character_name']) && !empty($charData['character']['character_name'])) {
                    $hasRealData = true;
                    break;
                }
            }
            
            if ($hasRealData) {
                return $data;
            } else {
                error_log("WARNING: Character data exists but appears to be all defaults. This might indicate data loss.");
                // Still return it but log the warning
                return $data;
            }
        }
    }
    
    // Only create default data if file doesn't exist at all (fresh install)
    if (!file_exists($dataFile)) {
        error_log("Creating new character data file (first time setup)");
        $default_data = array();
        foreach (array('frunk', 'sharon', 'indigo', 'zepha') as $char) {
            $default_data[$char] = array(
                'character' => array(
                    'character_name' => '',
                    'player_name' => '',
                    'class' => '',
                    'race' => '',
                    'level' => '',
                    'college' => '',
                    'minor' => '',
                    'extra_curricular' => '',
                    'boon' => '',
                    'wealth' => '',
                    'renown' => '',
                    'other' => '',
                    'portrait' => ''
                ),
                'current_classes' => array(
                    'class_name' => '',
                    'test_1_grade' => '',
                    'test_2_grade' => '',
                    'project_1_grade' => '',
                    'project_2_grade' => '',
                    'overall_grade' => '',
                    'test_buffs' => ''
                ),
                'past_classes' => array(),
                'relationships' => array(),
                'projects' => array(),
                'clubs' => array(
                    array('name' => '', 'people' => '', 'bonuses' => '', 'other' => '')
                ),
                'job' => array(
                    'job_title' => '',
                    'job_satisfaction' => '',
                    'wages' => '',
                    'coworkers' => ''
                )
            );
        }
        return $default_data;
    }
    
    // This should never be reached
    die("CRITICAL ERROR: Unexpected state in loadCharacterData()");
}

// Function to validate field data
function validateFieldData($section, $field, $value) {
    // Basic validation - prevent obviously bad data
    if ($value === null || $value === 'undefined' || $value === 'null') {
        return '';
    }
    
    // Strip any HTML tags for security
    $value = strip_tags($value);
    
    // Field-specific validation
    switch ($section) {
        case 'character':
            if ($field === 'character_name' && strlen($value) > 100) {
                return substr($value, 0, 100);
            }
            break;
        case 'relationships':
            if ($field === 'points' && !is_numeric($value) && !empty($value)) {
                return '0';
            }
            break;
        case 'projects':
            if (($field === 'points_earned' || $field === 'total_points') && !is_numeric($value) && !empty($value)) {
                return '0';
            }
            break;
    }
    
    return $value;
}

// Function to save character data
function saveCharacterData($data) {
    $dataFile = 'data/characters.json';
    $tempFile = 'data/characters_temp.json';
    $backupFile = 'data/characters_backup_latest.json';
    $lockFile = 'data/characters.lock';
    
    // Ensure data directory exists
    if (!is_dir('data')) {
        mkdir('data', 0755, true);
    }
    
    // Implement request-level locking to prevent concurrent saves
    $lockHandle = fopen($lockFile, 'c+');
    if (!$lockHandle) {
        error_log("ERROR: Failed to create lock file");
        return false;
    }
    
    // Try to acquire exclusive lock with timeout
    $lockAcquired = false;
    $attempts = 0;
    while ($attempts < 50) { // 5 second timeout (50 * 100ms)
        if (flock($lockHandle, LOCK_EX | LOCK_NB)) {
            $lockAcquired = true;
            break;
        }
        usleep(100000); // Wait 100ms
        $attempts++;
    }
    
    if (!$lockAcquired) {
        fclose($lockHandle);
        error_log("ERROR: Failed to acquire lock for character save after 5 seconds");
        return false;
    }
    
    // Validate data before saving
    if (!is_array($data) || empty($data)) {
        error_log("ERROR: Attempted to save invalid character data");
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
        return false;
    }
    
    // Check if we're about to save empty character data
    $hasRealData = false;
    foreach ($data as $char => $charData) {
        if (isset($charData['character']['character_name']) && !empty($charData['character']['character_name'])) {
            $hasRealData = true;
            break;
        }
    }
    
    // If current file has real data but new data is all empty, reject the save
    if (!$hasRealData && file_exists($dataFile)) {
        // Read current file directly to avoid recursion
        $currentContent = file_get_contents($dataFile);
        if ($currentContent) {
            $currentData = json_decode($currentContent, true);
            if ($currentData && json_last_error() === JSON_ERROR_NONE) {
                $currentHasRealData = false;
                foreach ($currentData as $char => $charData) {
                    if (isset($charData['character']['character_name']) && !empty($charData['character']['character_name'])) {
                        $currentHasRealData = true;
                        break;
                    }
                }
                
                if ($currentHasRealData) {
                    error_log("ERROR: Rejected save - would overwrite real data with empty defaults");
                    flock($lockHandle, LOCK_UN);
                    fclose($lockHandle);
                    return false;
                }
            }
        }
    }
    
    // Create backup of current file before saving
    if (file_exists($dataFile)) {
        $backupContent = file_get_contents($dataFile);
        if (!empty($backupContent)) {
            file_put_contents($backupFile, $backupContent, LOCK_EX);
            
            // Also create timestamped backup (keep last 5)
            $timestampedBackup = 'data/characters_backup_' . date('Ymd_His') . '.json';
            file_put_contents($timestampedBackup, $backupContent, LOCK_EX);
            
            // Clean up old backups (keep only last 5 timestamped ones)
            $backups = glob('data/characters_backup_*.json');
            if (count($backups) > 5) {
                // Sort by filename (which includes timestamp)
                sort($backups);
                // Remove oldest ones
                $toDelete = array_slice($backups, 0, count($backups) - 5);
                foreach ($toDelete as $oldBackup) {
                    if ($oldBackup !== $backupFile) { // Don't delete the _latest backup
                        unlink($oldBackup);
                    }
                }
            }
        }
    }
    
    // Encode data with validation
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    if ($jsonData === false) {
        error_log("ERROR: Failed to encode character data to JSON");
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
        return false;
    }
    
    // Use atomic write: write to temp file first, then rename
    $result = file_put_contents($tempFile, $jsonData, LOCK_EX);
    if ($result === false) {
        error_log("ERROR: Failed to write character data to temp file");
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
        return false;
    }
    
    // Verify the temp file is valid JSON
    $verifyContent = file_get_contents($tempFile);
    $verifyData = json_decode($verifyContent, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log("ERROR: Temp file contains invalid JSON, aborting save");
        unlink($tempFile);
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
        return false;
    }
    
    // Atomic rename (this is atomic on most filesystems)
    if (!rename($tempFile, $dataFile)) {
        error_log("ERROR: Failed to rename temp file to main file");
        unlink($tempFile);
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
        return false;
    }
    
    // Release lock
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
    
    return true;
}

// Function to load inventory data
function loadInventoryData() {
    $dataFile = 'data/inventory.json';
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data) {
            return $data;
        }
    }
    
    // Return default data structure if file doesn't exist
    $default_data = array();
    foreach (array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm') as $section) {
        $default_data[$section] = array('items' => array());
    }
    return $default_data;
}

// Handle AJAX requests - ONLY ALLOW GM TO SAVE CHARACTER DATA
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    // Clear any previous output and set JSON header
    ob_clean();
    header('Content-Type: application/json');
    
    // Set up error handling to ensure we always return JSON
    set_error_handler(function($severity, $message, $file, $line) {
        error_log("PHP Error in AJAX handler: $message in $file:$line");
        echo json_encode(array('success' => false, 'error' => 'Server error occurred'));
        exit;
    });
    
    // Debug logging
    error_log("DEBUG: Received action: " . $_POST['action']);
    
    // Handle inventory requests (separate from character data)
    // Use exact action matching to prevent false matches
    if (isset($_POST['action']) && 
        ($_POST['action'] === 'inventory_load' || 
         $_POST['action'] === 'inventory_save' || 
         $_POST['action'] === 'inventory_update' || 
         $_POST['action'] === 'inventory_delete' || 
         $_POST['action'] === 'inventory_add' ||
         $_POST['action'] === 'inventory_save_item' ||
         $_POST['action'] === 'inventory_delete_item' ||
         $_POST['action'] === 'inventory_share_item' ||
         $_POST['action'] === 'inventory_take_item' ||
         $_POST['action'] === 'inventory_update_item_field' ||
         $_POST['action'] === 'inventory_upload_image')) {
        error_log("DEBUG: Routing to inventory handler for action: " . $_POST['action']);
        include_once 'inventory_handler.php';
        exit;
    }
    
    error_log("DEBUG: Processing character data action: " . $_POST['action']);
    
    // BLOCK ALL SAVE OPERATIONS FOR NON-GM USERS (character data only)
    if (!$is_gm && ($_POST['action'] === 'save' || $_POST['action'] === 'add_item' || $_POST['action'] === 'delete_item')) {
        echo json_encode(array('success' => false, 'error' => 'Only GM can make changes'));
        exit;
    }
    
    if ($_POST['action'] === 'batch_save') {
        // Handle batch save to reduce server load
        $updates = isset($_POST['updates']) ? json_decode($_POST['updates'], true) : array();
        $character = isset($_POST['character']) ? $_POST['character'] : '';
        
        if (!in_array($character, $characters) || !is_array($updates)) {
            echo json_encode(array('success' => false, 'error' => 'Invalid batch save request'));
            exit;
        }
        
        $data = loadCharacterData();
        if (!isset($data[$character])) {
            $data[$character] = array();
        }
        
        $successCount = 0;
        $errorCount = 0;
        
        foreach ($updates as $update) {
            $section = isset($update['section']) ? $update['section'] : '';
            $field = isset($update['field']) ? $update['field'] : '';
            $value = isset($update['value']) ? $update['value'] : '';
            $index = isset($update['index']) ? intval($update['index']) : null;
            
            try {
                // Handle different sections
                switch ($section) {
                    case 'character':
                    case 'current_classes':
                    case 'job':
                        if (!isset($data[$character][$section])) {
                            $data[$character][$section] = array();
                        }
                        // Validate the value before saving
                        $validatedValue = validateFieldData($section, $field, $value);
                        $data[$character][$section][$field] = $validatedValue;
                        $successCount++;
                        break;
                        
                    case 'relationships':
                    case 'projects':
                        if (!isset($data[$character][$section])) {
                            $data[$character][$section] = array();
                        }
                        if ($index !== null) {
                            if (!isset($data[$character][$section][$index])) {
                                $data[$character][$section][$index] = array();
                            }
                            
                            // Handle special case for points_history array
                            if ($field === 'points_history' && is_string($value)) {
                                $data[$character][$section][$index][$field] = json_decode($value, true);
                            } else {
                                // Validate the value before saving
                                $validatedValue = validateFieldData($section, $field, $value);
                                $data[$character][$section][$index][$field] = $validatedValue;
                            }
                            $successCount++;
                        }
                        break;
                        
                    case 'clubs':
                        if (!isset($data[$character][$section])) {
                            $data[$character][$section] = array();
                        }
                        if ($index !== null) {
                            if (!isset($data[$character][$section][$index])) {
                                $data[$character][$section][$index] = array();
                            }
                            // Validate the value before saving
                            $validatedValue = validateFieldData($section, $field, $value);
                            $data[$character][$section][$index][$field] = $validatedValue;
                            $successCount++;
                        }
                        break;
                        
                    default:
                        $errorCount++;
                        break;
                }
            } catch (Exception $e) {
                $errorCount++;
            }
        }
        
        if ($successCount > 0 && saveCharacterData($data)) {
            echo json_encode(array(
                'success' => true, 
                'saved' => $successCount,
                'errors' => $errorCount
            ));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to save batch data'));
        }
    } elseif ($_POST['action'] === 'save') {
        $character = isset($_POST['character']) ? $_POST['character'] : '';
        $section = isset($_POST['section']) ? $_POST['section'] : '';
        $field = isset($_POST['field']) ? $_POST['field'] : '';
        $value = isset($_POST['value']) ? $_POST['value'] : '';
        $index = isset($_POST['index']) ? intval($_POST['index']) : null;
        
        if (in_array($character, $characters)) {
            $data = loadCharacterData();
            
            if (!isset($data[$character])) {
                $data[$character] = array();
            }
            
            // Handle different sections
            switch ($section) {
                case 'character':
                case 'current_classes':
                case 'job':
                    if (!isset($data[$character][$section])) {
                        $data[$character][$section] = array();
                    }
                    
                    // CRITICAL DATA VALIDATION: Prevent character name corruption
                    if ($section === 'character' && $field === 'character_name') {
                        // Check if trying to set all characters to the same name
                        $newName = trim($value);
                        if (!empty($newName)) {
                            $nameCount = 0;
                            foreach ($data as $charKey => $charData) {
                                if (isset($charData['character']['character_name']) && 
                                    $charData['character']['character_name'] === $newName) {
                                    $nameCount++;
                                }
                            }
                            
                            // If this name already exists on another character, reject the save
                            if ($nameCount > 0 && !isset($data[$character]['character']['character_name']) || 
                                $data[$character]['character']['character_name'] !== $newName) {
                                echo json_encode(array('success' => false, 'error' => "Character name '$newName' is already in use by another character"));
                                exit;
                            }
                        }
                    }
                    
                    // Validate the value before saving
                    $validatedValue = validateFieldData($section, $field, $value);
                    $data[$character][$section][$field] = $validatedValue;
                    break;
                    
                case 'relationships':
                case 'projects':
                    if (!isset($data[$character][$section])) {
                        $data[$character][$section] = array();
                    }
                    if ($index !== null) {
                        if (!isset($data[$character][$section][$index])) {
                            $data[$character][$section][$index] = array();
                        }
                        
                        // Handle special case for points_history array
                        if ($field === 'points_history' && is_string($value)) {
                            $data[$character][$section][$index][$field] = json_decode($value, true);
                        } else {
                            // Validate the value before saving
                            $validatedValue = validateFieldData($section, $field, $value);
                            $data[$character][$section][$index][$field] = $validatedValue;
                        }
                    }
                    break;
                    
                case 'clubs':
                    if (!isset($data[$character][$section])) {
                        $data[$character][$section] = array();
                    }
                    if ($index !== null) {
                        if (!isset($data[$character][$section][$index])) {
                            $data[$character][$section][$index] = array();
                        }
                        $data[$character][$section][$index][$field] = $value;
                    }
                    break;

                case 'past_classes':
                    // Handle finalize class action
                    if ($field === 'finalize') {
                        $current_class = $data[$character]['current_classes'];
                        if (!empty($current_class['class_name'])) {
                            if (!isset($data[$character]['past_classes'])) {
                                $data[$character]['past_classes'] = array();
                            }
                            $data[$character]['past_classes'][] = $current_class;
                            
                            // Clear current class
                            $data[$character]['current_classes'] = array(
                                'class_name' => '',
                                'test_1_grade' => '',
                                'test_2_grade' => '',
                                'project_1_grade' => '',
                                'project_2_grade' => '',
                                'overall_grade' => '',
                                'test_buffs' => ''
                            );
                        }
                    }
                    break;
            }

            // Sync relationship points to student record if applicable
            if ($section === 'relationships' && $index !== null) {
                $rel = $data[$character][$section][$index];
                $npcName = isset($rel['npc_name']) ? $rel['npc_name'] : '';
                $pointsVal = isset($rel['points']) ? $rel['points'] : '';
                if ($npcName !== '') {
                    updateStudentRelationshipPoints($npcName, $character, $pointsVal);
                }
            }
            
            if (saveCharacterData($data)) {
                echo json_encode(array('success' => true));
            } else {
                echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Access denied'));
        }
    } elseif ($_POST['action'] === 'load') {
        $character = isset($_POST['character']) ? $_POST['character'] : '';
        
        // Players can only load their own character, GM can load any
        if (($is_gm && in_array($character, $characters)) || (!$is_gm && $character === $user)) {
            $data = loadCharacterData();
            $characterData = isset($data[$character]) ? $data[$character] : array();
            echo json_encode(array('success' => true, 'data' => $characterData));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Access denied'));
        }
    } elseif ($_POST['action'] === 'add_item') {
        $character = isset($_POST['character']) ? $_POST['character'] : '';
        $section = isset($_POST['section']) ? $_POST['section'] : '';
        
        if (in_array($character, $characters)) {
            $data = loadCharacterData();
            
            if ($section === 'relationships') {
                if (!isset($data[$character]['relationships'])) {
                    $data[$character]['relationships'] = array();
                }
                $data[$character]['relationships'][] = array(
                    'npc_name' => 'New Relationship',
                    'student_id' => '',
                    'points' => '0',
                    'boon' => '',
                    'bane' => '',
                    'extra' => ''
                );
            } elseif ($section === 'projects') {
                if (!isset($data[$character]['projects'])) {
                    $data[$character]['projects'] = array();
                }
                $data[$character]['projects'][] = array(
                    'project_name' => 'New Project',
                    'source' => '',
                    'points_earned' => '0',
                    'total_points' => '10',
                    'extra' => '',
                    'points_history' => array()
                );
            } elseif ($section === 'clubs') {
                if (!isset($data[$character]['clubs'])) {
                    $data[$character]['clubs'] = array();
                }
                $data[$character]['clubs'][] = array(
                    'name' => '',
                    'people' => '',
                    'bonuses' => '',
                    'other' => ''
                );
            }
            
            if (saveCharacterData($data)) {
                echo json_encode(array('success' => true));
            } else {
                echo json_encode(array('success' => false, 'error' => 'Failed to add item'));
            }
        }
    } elseif ($_POST['action'] === 'delete_item') {
        $character = isset($_POST['character']) ? $_POST['character'] : '';
        $section = isset($_POST['section']) ? $_POST['section'] : '';
        $index = isset($_POST['index']) ? intval($_POST['index']) : null;
        
        if (in_array($character, $characters) && $index !== null) {
            $data = loadCharacterData();
            
            if (isset($data[$character][$section][$index])) {
                array_splice($data[$character][$section], $index, 1);
                
                if (saveCharacterData($data)) {
                    echo json_encode(array('success' => true));
                } else {
                    echo json_encode(array('success' => false, 'error' => 'Failed to delete item'));
                }
            } else {
                echo json_encode(array('success' => false, 'error' => 'Item not found'));
            }
        }
    } elseif ($_POST['action'] === 'get_students_for_autocomplete') {
        // Load students data for autocomplete
        $studentsFile = 'strixhaven/students/students.json';
        if (file_exists($studentsFile)) {
            $studentsData = json_decode(file_get_contents($studentsFile), true);
            $students = array();
            
            if (isset($studentsData['students'])) {
                foreach ($studentsData['students'] as $student) {
                    $students[] = array(
                        'id' => $student['student_id'],
                        'name' => $student['name'],
                        'type' => 'student',
                        'grade' => isset($student['grade']) ? $student['grade'] : '',
                        'college' => isset($student['college']) ? $student['college'] : '',
                        'image_path' => isset($student['image_path']) ? $student['image_path'] : ''
                    );
                }
            }
            
            echo json_encode(array('success' => true, 'students' => $students));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Students data not found'));
        }
    } elseif ($_POST['action'] === 'sync_relationship_to_student') {
        // Only GM can sync relationships
        if (!$is_gm) {
            echo json_encode(array('success' => false, 'error' => 'Only GM can sync relationships'));
            exit;
        }
        
        $student_id = isset($_POST['student_id']) ? $_POST['student_id'] : '';
        $pc_name = isset($_POST['pc_name']) ? $_POST['pc_name'] : '';
        $points = isset($_POST['points']) ? $_POST['points'] : '';
        $notes = isset($_POST['notes']) ? $_POST['notes'] : '';
        
        if ($student_id && $pc_name) {
            // Load students data
            $studentsFile = 'strixhaven/students/students.json';
            if (file_exists($studentsFile)) {
                $studentsData = json_decode(file_get_contents($studentsFile), true);
                
                // Find and update the student
                $updated = false;
                foreach ($studentsData['students'] as &$student) {
                    if ($student['student_id'] === $student_id) {
                        if (!isset($student['relationships'])) {
                            $student['relationships'] = array();
                        }
                        
                        // Update the specific PC relationship
                        $student['relationships'][$pc_name . '_points'] = $points;
                        $student['relationships'][$pc_name . '_notes'] = $notes;
                        
                        $updated = true;
                        break;
                    }
                }
                
                if ($updated) {
                    // Save the updated data
                    $jsonData = json_encode($studentsData, JSON_PRETTY_PRINT);
                    if (file_put_contents($studentsFile, $jsonData, LOCK_EX)) {
                        echo json_encode(array('success' => true));
                    } else {
                        echo json_encode(array('success' => false, 'error' => 'Failed to save student data'));
                    }
                } else {
                    echo json_encode(array('success' => false, 'error' => 'Student not found'));
                }
            } else {
                echo json_encode(array('success' => false, 'error' => 'Students data file not found'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Missing required parameters'));
        }
    } elseif ($_POST['action'] === 'get_all_characters') {
        // Load all character data for autocomplete/lookup functionality
        try {
            $allCharacters = array();
            
            // Load students
            $studentsFile = 'strixhaven/students/students.json';
            if (file_exists($studentsFile)) {
                $studentsData = json_decode(file_get_contents($studentsFile), true);
                if (isset($studentsData['students'])) {
                    foreach ($studentsData['students'] as $student) {
                        $allCharacters[] = array(
                            'id' => isset($student['student_id']) ? $student['student_id'] : '',
                            'name' => isset($student['name']) ? $student['name'] : '',
                            'type' => 'student',
                            'grade' => isset($student['grade']) ? $student['grade'] : '',
                            'college' => isset($student['college']) ? $student['college'] : '',
                            'image_path' => isset($student['image_path']) ? $student['image_path'] : ''
                        );
                    }
                }
            }
            
            // Load staff
            $staffFile = 'strixhaven/staff/staff.json';
            if (file_exists($staffFile)) {
                $staffData = json_decode(file_get_contents($staffFile), true);
                if (isset($staffData['staff'])) {
                    foreach ($staffData['staff'] as $staff) {
                        $allCharacters[] = array(
                            'id' => isset($staff['staff_id']) ? $staff['staff_id'] : '',
                            'name' => isset($staff['name']) ? $staff['name'] : '',
                            'type' => 'staff',
                            'college' => isset($staff['college']) ? $staff['college'] : '',
                            'role' => isset($staff['role']) ? $staff['role'] : '',
                            'image_path' => isset($staff['image_path']) ? $staff['image_path'] : ''
                        );
                    }
                }
            }
            
            // Load locations
            $locationsFile = 'strixhaven/locations/locations.json';
            if (file_exists($locationsFile)) {
                $locationsData = json_decode(file_get_contents($locationsFile), true);
                if (isset($locationsData['locations'])) {
                    foreach ($locationsData['locations'] as $location) {
                        $allCharacters[] = array(
                            'id' => isset($location['location_id']) ? $location['location_id'] : '',
                            'name' => isset($location['name']) ? $location['name'] : '',
                            'type' => 'location',
                            'college' => isset($location['college']) ? $location['college'] : '',
                            'hex_number' => isset($location['hex_number']) ? $location['hex_number'] : '',
                            'image_path' => isset($location['image_path']) ? $location['image_path'] : ''
                        );
                    }
                }
            }
            
            echo json_encode(array('success' => true, 'characters' => $allCharacters));
        } catch (Exception $e) {
            error_log('Error loading all characters: ' . $e->getMessage());
            echo json_encode(array('success' => false, 'error' => 'Failed to load character data'));
        }
    } else {
        // Unknown action
        error_log("ERROR: Unknown action received: " . $_POST['action']);
        echo json_encode(array('success' => false, 'error' => 'Unknown action: ' . $_POST['action']));
    }
    exit;
}

// Load initial data
$allData = loadCharacterData();
$currentCharacter = $is_gm ? 'frunk' : $user; // GM starts viewing Frunk, players see their own

// Determine which inventory tabs the user can see
$visibleInventoryTabs = array();
if ($is_gm) {
    $visibleInventoryTabs = array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm');
} else {
    $visibleInventoryTabs = array($user, 'shared', 'gm');
}
$defaultInventoryTab = $is_gm ? 'frunk' : $user;
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Report Card - <?php echo htmlspecialchars($user); ?></title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/inventory.css">
    <link rel="stylesheet" href="Halloween/theme.css" id="halloween-theme" disabled>
    <link rel="stylesheet" href="Christmas/theme.css" id="christmas-theme" disabled>
</head>
<body>
    <!-- Top Navigation Bar -->
    <div class="top-nav">
        <div class="nav-buttons">
            <div class="dropdown">
                <button class="nav-btn dropdown-btn">Rules</button>
                <div class="dropdown-content">
                    <a href="#" onclick="openRulesSection('conditions')">Conditions</a>
                    <a href="#" onclick="openRulesSection('tests-studying')">Tests and Studying</a>
                    <a href="#" onclick="openRulesSection('projects')">Projects</a>
                    <a href="#" onclick="openRulesSection('skills')">Skills</a>
                    <a href="#" onclick="openRulesSection('fall-jump')">Fall/Jump</a>
                    <a href="#" onclick="openRulesSection('breakthrough')">Breakthrough</a>
                    <a href="#" onclick="openRulesSection('respites')">Respites</a>
                    <a href="#" onclick="openRulesSection('negotiation')">Negotiation</a>
                    <a href="#" onclick="openRulesSection('universal-actions')">Universal Actions</a>
                    <a href="#" onclick="openRulesSection('coming-soon-3')">Coming Soon</a>
                </div>
            </div>
            <div class="dropdown">
                <button class="nav-btn dropdown-btn">Strixhaven</button>
                <div class="dropdown-content">
                    <a href="#" onclick="openStrixhavenSection('map')">Map</a>
                    <a href="#" onclick="openStrixhavenSection('colleges')">Colleges</a>
                    <a href="#" onclick="openStrixhavenSection('students')">Students</a>
                    <a href="#" onclick="openStrixhavenSection('staff')">Staff</a>
                    <a href="#" onclick="openStrixhavenSection('locations')">Locations</a>
                    <a href="#" onclick="openStrixhavenSection('monster-creator')" class="<?php echo $is_gm ? 'gm-allowed' : 'gm-restricted'; ?>">Monster Creator</a>
                    <a href="#" onclick="openStrixhavenSection('templates')">Templates</a>
                    <a href="#" onclick="openStrixhavenSection('arcaneconstruction')" class="<?php echo ($user === 'zepha' || $is_gm) ? 'zepha-gm-allowed' : 'access-restricted'; ?>">Arcane Construction</a>
                    <a href="#" onclick="openStrixhavenSection('coming-soon-5')">Coming Soon</a>
                    <!-- GM tab - positioned at bottom with conditional styling -->
                    <a href="#" onclick="openStrixhavenSection('gm')" class="<?php echo $is_gm ? 'gm-allowed' : 'gm-restricted'; ?>">GM</a>
                </div>
            </div>
            <button class="nav-btn" onclick="openCombatTracker()">Combat Tracker</button>
            <button class="nav-btn" onclick="openSchedule()">Schedule</button>
            <button type="button" class="nav-btn" id="theme-toggle-btn" title="Enable the Halloween theme" aria-label="Enable the Halloween theme" aria-pressed="false">Theme</button>
            <button class="nav-btn logout-btn" onclick="window.location.href='logout.php'">Logout</button>
        </div>
        <h1 class="nav-title"><?php echo $is_gm ? 'GM Dashboard' : ucfirst($user) . '\'s Character Sheet'; ?></h1>
    </div>

    <div class="main-container">
        <?php if ($is_gm): ?>
            <!-- GM Character Tabs -->
            <div class="character-tabs">
                <?php foreach ($characters as $index => $character): ?>
                    <button class="character-tab <?php echo $index === 0 ? 'active' : ''; ?>" 
                            data-character="<?php echo $character; ?>"
                            onclick="switchCharacter('<?php echo $character; ?>').catch(err => console.error('Error switching character:', err))">
                        <?php echo ucfirst($character); ?>
                    </button>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <!-- Main Content Area -->
        <div class="content-wrapper">
            <!-- Section Tabs -->
            <div class="section-tabs">
                <button class="section-tab active" data-section="character" onclick="switchSection('character').catch(err => console.error('Error switching section:', err))">Character Info</button>
                <button class="section-tab" data-section="classes" onclick="switchSection('classes').catch(err => console.error('Error switching section:', err))">Current Classes</button>
                <button class="section-tab" data-section="past-classes" onclick="switchSection('past-classes').catch(err => console.error('Error switching section:', err))">Past Classes</button>
                <button class="section-tab" data-section="relationships" onclick="switchSection('relationships').catch(err => console.error('Error switching section:', err))">Relationships</button>
                <button class="section-tab" data-section="projects" onclick="switchSection('projects').catch(err => console.error('Error switching section:', err))">Projects</button>
                <button class="section-tab" data-section="clubs" onclick="switchSection('clubs').catch(err => console.error('Error switching section:', err))">Clubs</button>
                <button class="section-tab" data-section="job" onclick="switchSection('job').catch(err => console.error('Error switching section:', err))">Job</button>
                <button class="section-tab" data-section="inventory" onclick="switchSection('inventory').catch(err => console.error('Error switching section:', err))">Inventory</button>
            </div>

            <!-- Section Content -->
            <div class="section-content">
                <!-- Character Info Section -->
                <div class="section character-section active" id="character-section">
                    <div class="character-info-container">
                        <div class="portrait-section">
                            <div class="portrait-frame">
                                <img id="character-portrait" src="" alt="Character Portrait" style="display: none;">
                                <div id="portrait-placeholder" class="portrait-placeholder">No Portrait</div>
                            </div>
                            <?php if ($is_gm): ?>
                                <button class="upload-btn" onclick="uploadPortrait()">Upload Portrait</button>
                                <input type="file" id="portrait-input" accept="image/*,.webp" style="display: none;" onchange="handlePortraitUpload(event)">
                            <?php endif; ?>
                        </div>
                        <div class="character-details">
                            <h2>Character Details</h2>
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Character Name:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="character_name" data-field="character_name" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="character_name">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Player Name:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="player_name" data-field="player_name" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="player_name">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Class:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="class" data-field="class" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="class">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Race:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="race" data-field="race" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="race">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Level:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="level" data-field="level" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="level">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>College:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="college" data-field="college" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="college">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Minor:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="minor" data-field="minor" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="minor">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Extra Curricular:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="extra_curricular" data-field="extra_curricular" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="extra_curricular">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Boon:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="boon" data-field="boon" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="boon">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Wealth:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="wealth" data-field="wealth" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="wealth">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group">
                                    <label>Renown:</label>
                                    <?php if ($is_gm): ?>
                                        <input type="text" id="renown" data-field="renown" data-section="character">
                                    <?php else: ?>
                                        <div class="readonly-field" id="renown">-</div>
                                    <?php endif; ?>
                                </div>
                                <div class="form-group full-width">
                                    <label>Other:</label>
                                    <?php if ($is_gm): ?>
                                        <textarea id="other" data-field="other" data-section="character" rows="4"></textarea>
                                    <?php else: ?>
                                        <div class="readonly-field readonly-textarea" id="other">-</div>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Current Classes Section -->
                <div class="section classes-section" id="classes-section">
                    <h2>Current Class Information</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Class Name:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="class_name" data-field="class_name" data-section="current_classes">
                            <?php else: ?>
                                <div class="readonly-field" id="class_name">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Test 1 Grade:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="test_1_grade" data-field="test_1_grade" data-section="current_classes" onchange="calculateOverallGrade()" oninput="calculateOverallGrade()">
                            <?php else: ?>
                                <div class="readonly-field" id="test_1_grade">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Test 2 Grade:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="test_2_grade" data-field="test_2_grade" data-section="current_classes" onchange="calculateOverallGrade()" oninput="calculateOverallGrade()">
                            <?php else: ?>
                                <div class="readonly-field" id="test_2_grade">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Project 1 Grade:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="project_1_grade" data-field="project_1_grade" data-section="current_classes" onchange="calculateOverallGrade()" oninput="calculateOverallGrade()">
                            <?php else: ?>
                                <div class="readonly-field" id="project_1_grade">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Project 2 Grade:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="project_2_grade" data-field="project_2_grade" data-section="current_classes" onchange="calculateOverallGrade()" oninput="calculateOverallGrade()">
                            <?php else: ?>
                                <div class="readonly-field" id="project_2_grade">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Overall Grade:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="overall_grade" data-field="overall_grade" data-section="current_classes" readonly style="background-color: #f8f9fa;">
                            <?php else: ?>
                                <div class="readonly-field" id="overall_grade">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group full-width">
                            <label>Test Buffs:</label>
                            <?php if ($is_gm): ?>
                                <textarea id="test_buffs" data-field="test_buffs" data-section="current_classes" rows="3"></textarea>
                            <?php else: ?>
                                <div class="readonly-field readonly-textarea" id="test_buffs">-</div>
                            <?php endif; ?>
                        </div>
                    </div>
                    <?php if ($is_gm): ?>
                        <div class="action-buttons">
                            <button class="btn-primary" onclick="finalizeClass()">Finalize Class</button>
                        </div>
                    <?php endif; ?>
                </div>

                <!-- Past Classes Section -->
                <div class="section past-classes-section" id="past-classes-section">
                    <h2>Past Classes</h2>
                    <div id="past-classes-list" class="past-classes-list">
                        <!-- Past classes will be populated by JavaScript -->
                    </div>
                </div>

                <!-- Relationships Section -->
                <div class="section relationships-section" id="relationships-section">
                    <div class="section-header">
                        <h2>NPC Relationships</h2>
                        <?php if ($is_gm): ?>
                            <button class="btn-add" onclick="addRelationship()">Add Relationship</button>
                        <?php endif; ?>
                    </div>
                    <div id="relationships-list" class="relationships-list">
                        <!-- Relationships will be populated by JavaScript -->
                    </div>
                </div>

                <!-- Projects Section -->
                <div class="section projects-section" id="projects-section">
                    <div class="section-header">
                        <h2>Projects</h2>
                        <?php if ($is_gm): ?>
                            <button class="btn-add" onclick="addProject()">Add Project</button>
                        <?php endif; ?>
                    </div>
                    <div id="projects-list" class="projects-list">
                        <!-- Projects will be populated by JavaScript -->
                    </div>
                </div>

                <!-- Clubs Section -->
                <div class="section clubs-section" id="clubs-section">
                    <div class="section-header">
                        <h2>Clubs</h2>
                        <?php if ($is_gm): ?>
                            <div class="club-navigation">
                                <button id="prev-club" onclick="navigateClub(-1).catch(err => console.error('Error navigating club:', err))">◀ Previous</button>
                                <span id="club-indicator">Club 1/1</span>
                                <button id="next-club" onclick="navigateClub(1).catch(err => console.error('Error navigating club:', err))">Next ▶</button>
                                <button class="btn-add" onclick="addClub()">Add Club</button>
                            </div>
                        <?php else: ?>
                            <div class="club-navigation">
                                <button id="prev-club" onclick="navigateClub(-1).catch(err => console.error('Error navigating club:', err))">◀ Previous</button>
                                <span id="club-indicator">Club 1/1</span>
                                <button id="next-club" onclick="navigateClub(1).catch(err => console.error('Error navigating club:', err))">Next ▶</button>
                            </div>
                        <?php endif; ?>
                    </div>
                    <div id="current-club" class="club-form">
                        <div class="form-group">
                            <label>Club Name:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="club_name" data-field="name" data-section="clubs">
                            <?php else: ?>
                                <div class="readonly-field" id="club_name">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>People:</label>
                            <?php if ($is_gm): ?>
                                <textarea id="club_people" data-field="people" data-section="clubs" rows="5"></textarea>
                            <?php else: ?>
                                <div class="readonly-field readonly-textarea" id="club_people">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Bonuses:</label>
                            <?php if ($is_gm): ?>
                                <textarea id="club_bonuses" data-field="bonuses" data-section="clubs" rows="4"></textarea>
                            <?php else: ?>
                                <div class="readonly-field readonly-textarea" id="club_bonuses">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Other:</label>
                            <?php if ($is_gm): ?>
                                <textarea id="club_other" data-field="other" data-section="clubs" rows="8"></textarea>
                            <?php else: ?>
                                <div class="readonly-field readonly-textarea" id="club_other">-</div>
                            <?php endif; ?>
                        </div>
                        <?php if ($is_gm): ?>
                            <div class="action-buttons">
                                <button class="btn-danger" onclick="deleteClub()" id="delete-club-btn">Delete Club</button>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Job Section -->
                <div class="section job-section" id="job-section">
                    <h2>Job Information</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Job Title:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="job_title" data-field="job_title" data-section="job">
                            <?php else: ?>
                                <div class="readonly-field" id="job_title">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Job Satisfaction:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="job_satisfaction" data-field="job_satisfaction" data-section="job">
                            <?php else: ?>
                                <div class="readonly-field" id="job_satisfaction">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group">
                            <label>Wages:</label>
                            <?php if ($is_gm): ?>
                                <input type="text" id="wages" data-field="wages" data-section="job">
                            <?php else: ?>
                                <div class="readonly-field" id="wages">-</div>
                            <?php endif; ?>
                        </div>
                        <div class="form-group full-width">
                            <label>Coworkers:</label>
                            <?php if ($is_gm): ?>
                                <textarea id="coworkers" data-field="coworkers" data-section="job" rows="5"></textarea>
                            <?php else: ?>
                                <div class="readonly-field readonly-textarea" id="coworkers">-</div>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>

                <!-- Inventory Section -->
                <div class="section inventory-section" id="inventory-section">
                    <div class="inventory-container">
                        <!-- Inventory Tabs -->
                        <div class="inventory-tabs">
                            <?php foreach ($visibleInventoryTabs as $index => $tab): ?>
                                <button class="inventory-tab <?php echo $index === 0 ? 'active' : ''; ?>" 
                                        data-tab="<?php echo $tab; ?>"
                                        onclick="switchInventoryTab('<?php echo $tab; ?>')">
                                    <?php echo $tab === 'gm' ? 'GM' : ucfirst($tab); ?>
                                </button>
                            <?php endforeach; ?>
                        </div>

                        <!-- Inventory Content Wrapper -->
                        <div class="inventory-content-wrapper">
                            <?php foreach ($visibleInventoryTabs as $index => $tab): ?>
                                <div class="inventory-tab-content <?php echo $index === 0 ? 'active' : ''; ?>" id="inventory-tab-<?php echo $tab; ?>">
                                    <!-- Add Item Section -->
                                    <div class="add-item-section">
                                        <button class="btn-add-item" onclick="addNewInventoryItem('<?php echo $tab; ?>')" 
                                                id="inventory-add-btn-<?php echo $tab; ?>">
                                            Add New Item
                                        </button>
                                        <span id="inventory-item-count-<?php echo $tab; ?>">0 items</span>
                                    </div>
                                    
                                    <!-- Inventory Grid Container -->
                                    <div class="inventory-grid-container">
                                        <div class="inventory-grid" id="inventory-grid-<?php echo $tab; ?>">
                                            <!-- Items will be loaded here by JavaScript -->
                                        </div>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Save Button (GM Only) -->
        <?php if ($is_gm): ?>
            <div class="save-container">
                <button id="save-all-btn" class="btn-save" onclick="batchSaveAllData()">Save All Data</button>
                <div id="save-status" class="save-status"></div>
            </div>
        <?php endif; ?>

        <!-- Backup Button (GM Only) - Bottom Left -->
        <?php if ($is_gm): ?>
            <div class="backup-container">
                <button id="backup-btn" class="btn-backup" onclick="window.location.href='dashboard-recovery.php'">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17,8 12,3 7,8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    Backup Data
                </button>
            </div>
        <?php endif; ?>
    </div>

    <!-- Modal for Past Class Details -->
    <div id="past-class-modal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closePastClassModal()">&times;</span>
            <h2 id="past-class-title">Class Details</h2>
            <div id="past-class-details"></div>
            <?php if ($is_gm): ?>
                <div class="modal-actions">
                    <button class="btn-danger" onclick="deletePastClass()">Delete Class</button>
                    <button class="btn-secondary" onclick="closePastClassModal()">Close</button>
                </div>
            <?php else: ?>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="closePastClassModal()">Close</button>
                </div>
            <?php endif; ?>
        </div>
    </div>

    <!-- Hidden file input for image uploads -->
    <input type="file" id="inventory-image-upload" accept="image/*" style="display: none;" onchange="handleInventoryImageUpload(event)">

    <!-- Autocomplete dropdown for NPC names -->
    <div id="character-autocomplete" class="character-autocomplete" style="display: none;"></div>

    <script>
        // Global variables
        const isGM = <?php echo $is_gm ? 'true' : 'false'; ?>;
        const currentUser = '<?php echo $user; ?>';
        let currentCharacter = '<?php echo $currentCharacter; ?>';
        let characterData = {};
        let currentClubIndex = 0;
        let currentPastClassIndex = -1;
        let autoSaveInterval;
        let sessionBackupInterval;
        let lastSessionBackupTime = 0;
        let isSwitchingCharacter = false;
        
        // Inventory variables
        const visibleInventoryTabs = <?php echo json_encode($visibleInventoryTabs); ?>;
        let currentInventoryTab = '<?php echo $defaultInventoryTab; ?>';
        let inventoryData = {};
        let expandedInventoryCard = null;
        let inventorySaveTimeout = null;
        let currentUploadItemId = null;
        
        // Initialize the application
        document.addEventListener('DOMContentLoaded', function() {
            initRelationshipAutocomplete();
            loadCharacterData(currentCharacter);
            if (isGM) {
                setupAutoSave();
                setupEventListeners();
                setupSessionBackup();
            }

            // Initialize inventory
            loadInventoryData();
            setupInventoryAutoSave();
            updateInventoryPermissions();
        });

        // Session backup functionality for Dashboard
        function setupSessionBackup() {
            if (!isGM) return;
            
            // Create initial session backup after page loads
            setTimeout(() => {
                createSessionBackup();
            }, 5000); // Wait 5 seconds after page load
            
            // Session backup every 10 minutes (600,000 ms)
            sessionBackupInterval = setInterval(() => {
                const now = Date.now();
                // Only create backup if enough time has passed and there are changes
                if (now - lastSessionBackupTime > 600000 && hasPendingChanges()) {
                    createSessionBackup();
                    lastSessionBackupTime = now;
                }
            }, 60000); // Check every minute
        }

        // Create session backup
        async function createSessionBackup() {
            if (!isGM) return;
            
            try {
                const response = await fetch('dashboard-backup-handler.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: 'action=create_session_backup'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    lastSessionBackupTime = Date.now();
                    console.log('Session backup created:', result.backup_name);
                } else {
                    console.warn('Session backup failed:', result.error);
                }
            } catch (error) {
                console.warn('Session backup error:', error);
            }
        }

        // Create pre-save backup before each save operation
        async function createPreSaveBackup() {
            if (!isGM) return;
            
            try {
                const response = await fetch('dashboard-backup-handler.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: 'action=create_pre_save_backup'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    console.log('Pre-save backup created:', result.backup_name);
                } else {
                    console.warn('Pre-save backup failed:', result.error);
                }
            } catch (error) {
                console.warn('Pre-save backup error:', error);
            }
        }
    </script>
    <script src="Halloween/theme.js"></script>
    <script src="strixhaven/gm/js/character-lookup.js"></script>
    <script src="js/character-sheet.js"></script>
    <script src="js/inventory-integrated.js"></script>
    <script src="js/relationship-autocomplete.js"></script>
    
    <!-- Autocomplete container for relationships -->
    <div id="relationship-autocomplete" class="character-autocomplete" style="display: none;"></div>
</body>
</html>