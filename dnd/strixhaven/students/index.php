<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';

// Include character integration for character details functionality
require_once '../gm/includes/character-integration.php';
require_once __DIR__ . '/data-utils.php';

$students_endpoint = $_SERVER['PHP_SELF'] ?? ($_SERVER['SCRIPT_NAME'] ?? '/dnd/strixhaven/students/index.php');

// Function to sync student relationships back to character dashboard
function syncRelationshipsToCharacters($student) {
    if (!isset($student['relationships']) || !isset($student['student_id'])) {
        return;
    }
    
    $charactersFile = __DIR__ . '/../../data/characters.json';
    if (!file_exists($charactersFile)) {
        return;
    }

    $result = modifyJsonFileWithLock(
        $charactersFile,
        function (&$charactersData) use ($student) {
            if (!is_array($charactersData) || empty($charactersData)) {
                return ['save' => false, 'error' => 'Character data unavailable'];
            }

            $relationships = $student['relationships'];
            $studentId = $student['student_id'];
            $studentName = isset($student['name']) ? $student['name'] : '';
            $pcs = array('frunk', 'zepha', 'sharon', 'indigo');
            $updated = false;

            foreach ($pcs as $pc) {
                if (!isset($charactersData[$pc]['relationships']) || !is_array($charactersData[$pc]['relationships'])) {
                    continue;
                }

                $points = isset($relationships[$pc . '_points']) ? $relationships[$pc . '_points'] : '';
                $notes = isset($relationships[$pc . '_notes']) ? $relationships[$pc . '_notes'] : '';

                foreach ($charactersData[$pc]['relationships'] as &$rel) {
                    if (isset($rel['student_id']) && $rel['student_id'] === $studentId) {
                        $rel['points'] = $points;
                        $rel['extra'] = $notes;
                        $rel['npc_name'] = $studentName;
                        $updated = true;
                        break;
                    }
                }
            }

            return $updated ? ['result' => true] : ['save' => false];
        },
        [
            'default' => function () {
                return [];
            },
            'backup_prefix' => 'characters',
            'lock_file' => __DIR__ . '/../../data/characters.lock',
        ]
    );

    if (!$result['success'] && isset($result['error']) && $result['error'] !== 'Character data unavailable') {
        error_log('Failed to sync relationship data to characters: ' . $result['error']);
    }
}

// Handle AJAX requests
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    header('Content-Type: application/json');
    
    // BLOCK SOME SAVE OPERATIONS FOR NON-GM USERS (but allow toggle_favorite for all users)
    if (!$is_gm && in_array($_POST['action'], ['save_student', 'add_student', 'delete_student', 'upload_portrait', 'delete_image'])) {
        echo json_encode(array('success' => false, 'error' => 'Only GM can make changes'));
        exit;
    }
    
    if ($_POST['action'] === 'load_students') {
        $data = loadStudentData();
        $sort_by = isset($_POST['sort_by']) ? $_POST['sort_by'] : 'name';
        $filter_grade = isset($_POST['filter_grade']) ? $_POST['filter_grade'] : '';
        $filter_college = isset($_POST['filter_college']) ? $_POST['filter_college'] : '';
        $filter_club = isset($_POST['filter_club']) ? $_POST['filter_club'] : '';
        $show_favorites = isset($_POST['show_favorites']) ? $_POST['show_favorites'] === 'true' : false;
        $search_term = isset($_POST['search_term']) ? trim($_POST['search_term']) : '';
        
        $students = $data['students'];
        
        // Apply filters
        if ($show_favorites) {
            $students = array_filter($students, function($student) use ($user) {
                return isset($student['favorites'][$user]) && $student['favorites'][$user];
            });
        }
        
        if ($filter_grade) {
            $students = array_filter($students, function($student) use ($filter_grade) {
                return isset($student['grade_level']) && $student['grade_level'] === $filter_grade;
            });
        }
        
        if ($filter_college) {
            $students = array_filter($students, function($student) use ($filter_college) {
                return isset($student['college']) && $student['college'] === $filter_college;
            });
        }
        
        if ($filter_club) {
            $students = array_filter($students, function($student) use ($filter_club) {
                return isset($student['clubs']) && in_array($filter_club, $student['clubs']);
            });
        }
        
        if ($search_term) {
            $students = array_filter($students, function($student) use ($search_term) {
                return stripos($student['name'], $search_term) !== false;
            });
        }
        
        // Sort students
        usort($students, function($a, $b) use ($sort_by) {
            switch ($sort_by) {
                case 'grade':
                    $grade_order = ['1st Year' => 1, '2nd Year' => 2, '3rd Year' => 3, '4th Year' => 4];
                    $a_grade = isset($grade_order[$a['grade_level']]) ? $grade_order[$a['grade_level']] : 5;
                    $b_grade = isset($grade_order[$b['grade_level']]) ? $grade_order[$b['grade_level']] : 5;
                    if ($a_grade === $b_grade) {
                        return strcasecmp($a['name'], $b['name']);
                    }
                    return $a_grade - $b_grade;
                
                case 'college':
                    if ($a['college'] === $b['college']) {
                        return strcasecmp($a['name'], $b['name']);
                    }
                    return strcasecmp($a['college'], $b['college']);
                
                case 'name':
                default:
                    return strcasecmp($a['name'], $b['name']);
            }
        });
        
        // Return all students, no pagination
        echo json_encode(array(
            'success' => true,
            'students' => array_values($students)
        ));
        
    } elseif ($_POST['action'] === 'save_student') {
        $student_id = isset($_POST['student_id']) ? $_POST['student_id'] : '';
        $field = isset($_POST['field']) ? $_POST['field'] : '';
        $value = isset($_POST['value']) ? $_POST['value'] : '';
        
        if ($student_id && $field) {
            $updatedStudent = null;
            $result = modifyStudentData(function (&$data) use ($student_id, $field, $value, &$updatedStudent) {
                foreach ($data['students'] as &$student) {
                    if ($student['student_id'] === $student_id) {
                        if (strpos($field, 'details.') === 0) {
                            $detailField = substr($field, 8);
                            if (!isset($student['details']) || !is_array($student['details'])) {
                                $student['details'] = array();
                            }
                            $student['details'][$detailField] = $value;
                        } elseif (strpos($field, 'character_info.') === 0) {
                            $charInfoField = substr($field, 15);
                            if (!isset($student['character_info']) || !is_array($student['character_info'])) {
                                $student['character_info'] = array();
                            }
                            $student['character_info'][$charInfoField] = $value;
                        } elseif ($field === 'clubs' || $field === 'skills') {
                            $decoded = json_decode($value, true);
                            if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
                                return ['save' => false, 'error' => 'Invalid data format'];
                            }
                            $student[$field] = is_array($decoded) ? $decoded : array();
                        } elseif ($field === 'relationships') {
                            $decoded = json_decode($value, true);
                            if (!is_array($decoded)) {
                                return ['save' => false, 'error' => 'Invalid relationships data'];
                            }
                            $student['relationships'] = $decoded;
                        } else {
                            $student[$field] = $value;
                        }

                        $updatedStudent = $student;
                        return ['result' => true];
                    }
                }

                return ['save' => false, 'error' => 'Student not found'];
            });

            if ($result['success']) {
                if ($field === 'relationships' && $updatedStudent !== null) {
                    syncRelationshipsToCharacters($updatedStudent);
                }
                echo json_encode(array('success' => true));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to save data';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
        }
        
    } elseif ($_POST['action'] === 'add_student') {
        $new_student = getBlankStudentRecord();
        $result = modifyStudentData(function (&$data) use (&$new_student) {
            $data['students'][] = $new_student;
            return ['result' => $new_student];
        });

        if ($result['success']) {
            echo json_encode(array('success' => true, 'student' => $new_student));
        } else {
            $error = isset($result['error']) ? $result['error'] : 'Failed to add student';
            echo json_encode(array('success' => false, 'error' => $error));
        }
        
    } elseif ($_POST['action'] === 'delete_student') {
        $student_id = isset($_POST['student_id']) ? $_POST['student_id'] : '';
        
        if ($student_id) {
            $imagesToDelete = array();
            $result = modifyStudentData(function (&$data) use ($student_id, &$imagesToDelete) {
                foreach ($data['students'] as $index => $student) {
                    if ($student['student_id'] === $student_id) {
                        if (isset($student['images']) && is_array($student['images'])) {
                            foreach ($student['images'] as $image_path) {
                                if (!empty($image_path)) {
                                    $imagesToDelete[] = $image_path;
                                }
                            }
                        } elseif (isset($student['image_path']) && !empty($student['image_path'])) {
                            $imagesToDelete[] = $student['image_path'];
                        }

                        array_splice($data['students'], $index, 1);
                        return ['result' => true];
                    }
                }

                return ['save' => false, 'error' => 'Student not found'];
            });

            if ($result['success']) {
                foreach ($imagesToDelete as $image_path) {
                    if (!empty($image_path) && file_exists($image_path)) {
                        unlink($image_path);
                    }
                }
                echo json_encode(array('success' => true));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to delete student';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid student ID'));
        }
        
    } elseif ($_POST['action'] === 'toggle_favorite') {
        $student_id = isset($_POST['student_id']) ? $_POST['student_id'] : '';
        
        if ($student_id) {
            $result = modifyStudentData(function (&$data) use ($student_id, $user) {
                foreach ($data['students'] as &$student) {
                    if ($student['student_id'] === $student_id) {
                        if (!isset($student['favorites']) || !is_array($student['favorites'])) {
                            $student['favorites'] = array();
                        }

                        $current_status = isset($student['favorites'][$user]) ? (bool)$student['favorites'][$user] : false;
                        $student['favorites'][$user] = !$current_status;

                        return ['result' => $student['favorites'][$user]];
                    }
                }

                return ['save' => false, 'error' => 'Student not found'];
            });

            if ($result['success']) {
                echo json_encode(array('success' => true, 'is_favorite' => (bool)$result['result']));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to update favorite status';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid student ID'));
        }
        
    } elseif ($_POST['action'] === 'lookup_character_by_name') {
        $search_name = isset($_POST['name']) ? trim($_POST['name']) : '';
        
        if ($search_name) {
            $data = loadStudentData();
            $matches = array();
            
            foreach ($data['students'] as $student) {
                // Case-insensitive search
                if (stripos($student['name'], $search_name) !== false) {
                    $matches[] = array(
                        'id' => $student['student_id'],
                        'name' => $student['name'],
                        'type' => 'student',
                        'grade' => $student['grade_level'] ?: '',
                        'college' => $student['college'] ?: '',
                        'image_path' => $student['image_path'] ?: '',
                        'description' => substr($student['details']['backstory'] ?: '', 0, 100)
                    );
                }
            }
            
            echo json_encode(array('success' => true, 'matches' => $matches));
        } else {
            echo json_encode(array('success' => false, 'error' => 'No search term provided'));
        }
        
    } elseif ($_POST['action'] === 'get_all_character_names') {
        $data = loadStudentData();
        $names = array();
        
        foreach ($data['students'] as $student) {
            $names[] = array(
                'id' => $student['student_id'],
                'name' => $student['name'],
                'type' => 'student',
                'grade' => $student['grade_level'] ?: '',
                'college' => $student['college'] ?: '',
                'image_path' => $student['image_path'] ?: ''
            );
        }
        
        echo json_encode(array('success' => true, 'characters' => $names));
        
    } elseif ($_POST['action'] === 'get_all_characters') {
        // Get all characters (students, staff, locations) for autocomplete
        $allCharacters = array();
        
        // Load students
        $studentsData = loadStudentData();
        if ($studentsData && isset($studentsData['students'])) {
            foreach ($studentsData['students'] as $student) {
                $allCharacters[] = array(
                    'id' => $student['student_id'],
                    'name' => $student['name'],
                    'type' => 'student',
                    'grade' => isset($student['grade_level']) ? $student['grade_level'] : '',
                    'college' => isset($student['college']) ? $student['college'] : '',
                    'image_path' => isset($student['image_path']) ? $student['image_path'] : ''
                );
            }
        }
        
        // Load staff
        $staffFile = '../staff/staff.json';
        if (file_exists($staffFile)) {
            $staffData = json_decode(file_get_contents($staffFile), true);
            if ($staffData && isset($staffData['staff'])) {
                foreach ($staffData['staff'] as $member) {
                    $allCharacters[] = array(
                        'id' => $member['staff_id'],
                        'name' => $member['name'],
                        'type' => 'staff',
                        'college' => isset($member['college']) ? $member['college'] : '',
                        'image_path' => isset($member['image_path']) ? $member['image_path'] : ''
                    );
                }
            }
        }
        
        // Load locations
        $locationsFile = '../locations/locations.json';
        if (file_exists($locationsFile)) {
            $locationsData = json_decode(file_get_contents($locationsFile), true);
            if ($locationsData && isset($locationsData['locations'])) {
                foreach ($locationsData['locations'] as $location) {
                    $allCharacters[] = array(
                        'id' => $location['location_id'],
                        'name' => $location['name'],
                        'type' => 'location',
                        'college' => isset($location['college']) ? $location['college'] : '',
                        'hex_color' => isset($location['hex_color']) ? $location['hex_color'] : '',
                        'image_path' => isset($location['images']) && !empty($location['images']) ? $location['images'][0] : ''
                    );
                }
            }
        }
        
        echo json_encode(array('success' => true, 'characters' => $allCharacters));
        
    } elseif ($_POST['action'] === 'get_character_popup_data') {
        $character_id = isset($_POST['character_id']) ? $_POST['character_id'] : '';
        
        if ($character_id) {
            $data = loadStudentData();
            
            foreach ($data['students'] as $student) {
                if ($student['student_id'] === $character_id) {
                    echo json_encode(array('success' => true, 'character' => $student, 'type' => 'student'));
                    exit;
                }
            }
            
            echo json_encode(array('success' => false, 'error' => 'Student not found'));
        } else {
            echo json_encode(array('success' => false, 'error' => 'No character ID provided'));
        }
        
    } elseif ($_POST['action'] === 'upload_portrait') {
        $student_id = isset($_POST['student_id']) ? $_POST['student_id'] : '';
        
        if (!$student_id) {
            echo json_encode(array('success' => false, 'error' => 'Invalid student ID'));
            exit;
        }
        
        if (!isset($_FILES['portrait']) || $_FILES['portrait']['error'] !== UPLOAD_ERR_OK) {
            echo json_encode(array('success' => false, 'error' => 'No file uploaded or upload error'));
            exit;
        }
        
        $file = $_FILES['portrait'];
        
        // Validate file type
        $allowed_types = array('image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp');
        $file_type = mime_content_type($file['tmp_name']);
        
        if (!in_array($file_type, $allowed_types) && !in_array($file['type'], $allowed_types)) {
            echo json_encode(array('success' => false, 'error' => 'Invalid file type. Please upload JPEG, PNG, GIF, or WebP images only.'));
            exit;
        }
        
        // Validate file size (5MB max)
        if ($file['size'] > 5 * 1024 * 1024) {
            echo json_encode(array('success' => false, 'error' => 'File too large. Maximum size is 5MB.'));
            exit;
        }
        
        // Create portraits directory if it doesn't exist
        $portraits_dir = 'portraits';
        if (!is_dir($portraits_dir)) {
            mkdir($portraits_dir, 0755, true);
        }
        
        // Generate unique filename
        $file_extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        if (empty($file_extension)) {
            // Determine extension from MIME type
            $mime_extensions = array(
                'image/jpeg' => 'jpg',
                'image/jpg' => 'jpg',
                'image/png' => 'png',
                'image/gif' => 'gif',
                'image/webp' => 'webp'
            );
            $file_extension = isset($mime_extensions[$file_type]) ? $mime_extensions[$file_type] : 'jpg';
        }
        
        $filename = $student_id . '_portrait_' . time() . '.' . $file_extension;
        $filepath = $portraits_dir . '/' . $filename;
        
        // Move uploaded file
        if (move_uploaded_file($file['tmp_name'], $filepath)) {
            $result = modifyStudentData(function (&$data) use ($student_id, $filepath) {
                foreach ($data['students'] as &$student) {
                    if ($student['student_id'] === $student_id) {
                        if (!isset($student['images']) || !is_array($student['images'])) {
                            $student['images'] = array();
                            if (!empty($student['image_path'])) {
                                $student['images'][] = $student['image_path'];
                                unset($student['image_path']);
                            }
                        }

                        $student['images'][] = $filepath;
                        return ['result' => true];
                    }
                }

                return ['save' => false, 'error' => 'Student not found'];
            });

            if ($result['success']) {
                echo json_encode(array(
                    'success' => true,
                    'image_path' => $filepath,
                    'message' => 'Image uploaded successfully'
                ));
            } else {
                if (file_exists($filepath)) {
                    unlink($filepath);
                }
                $error = isset($result['error']) ? $result['error'] : 'Failed to update student data';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file'));
        }
        
    } elseif ($_POST['action'] === 'delete_image') {
        $student_id = isset($_POST['student_id']) ? $_POST['student_id'] : '';
        $image_path = isset($_POST['image_path']) ? $_POST['image_path'] : '';
        
        if ($student_id && $image_path) {
            $shouldDeleteFile = false;
            $result = modifyStudentData(function (&$data) use ($student_id, $image_path, &$shouldDeleteFile) {
                foreach ($data['students'] as &$student) {
                    if ($student['student_id'] === $student_id) {
                        if (!isset($student['images']) && isset($student['image_path'])) {
                            $student['images'] = array($student['image_path']);
                            unset($student['image_path']);
                        }

                        if (isset($student['images'])) {
                            $image_index = array_search($image_path, $student['images']);
                            if ($image_index !== false) {
                                array_splice($student['images'], $image_index, 1);
                                $shouldDeleteFile = true;
                                return ['result' => true];
                            }
                        }

                        return ['save' => false, 'error' => 'Image not found'];
                    }
                }

                return ['save' => false, 'error' => 'Student not found'];
            });

            if ($result['success']) {
                if ($shouldDeleteFile && file_exists($image_path)) {
                    unlink($image_path);
                }
                echo json_encode(array('success' => true));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to delete image';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
        }
    } elseif ($_POST['action'] === 'get_character_details') {
        try {
            $characterId = isset($_POST['character_id']) ? $_POST['character_id'] : '';
            $characterType = isset($_POST['character_type']) ? $_POST['character_type'] : '';
            
            if ($characterId && $characterType) {
                $result = getCharacterDetails($characterId, $characterType);
                echo json_encode($result);
            } else {
                echo json_encode(['success' => false, 'error' => 'Missing character ID or type']);
            }
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => 'Failed to get character details: ' . $e->getMessage()]);
        }
    } elseif ($_POST['action'] === 'export_students') {
        // Export all students data
        if (!$is_gm) {
            echo json_encode(array('success' => false, 'error' => 'Only GM can export data'));
            exit;
        }
        
        $data = loadStudentData();
        echo json_encode(array(
            'success' => true,
            'data' => $data
        ));
    }
    exit;
}

// Load initial data for page
$studentData = loadStudentData();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Students - <?php echo htmlspecialchars($user); ?></title>
    <link rel="stylesheet" href="../../css/style.css">
    <link rel="stylesheet" href="css/students.css">
</head>
<body>
    <!-- Top Navigation Bar -->
    <div class="top-nav">
        <div class="nav-buttons">
            <button class="nav-btn" onclick="window.close()">Close Students</button>
            <button class="nav-btn logout-btn" onclick="window.location.href='../../logout.php'">Logout</button>
        </div>
        <h1 class="nav-title">Strixhaven Students<?php echo $is_gm ? ' - GM View' : ' - Player View'; ?></h1>
    </div>

    <div class="main-container">
        <!-- Control Panel -->
        <div class="control-panel">
            <!-- Search Bar -->
            <div class="search-section">
                <input type="text" id="search-input" placeholder="Search students by name..." class="search-input">
            </div>
            
            <!-- Sort and Filter Controls -->
            <div class="filter-section">
                <div class="filter-group">
                    <label>Sort by:</label>
                    <button class="filter-btn active" data-sort="name">Name</button>
                    <button class="filter-btn" data-sort="grade">Grade</button>
                    <button class="filter-btn" data-sort="college">College</button>
                </div>
                
                <div class="filter-group">
                    <label>Filter:</label>
                    <select id="filter-grade" class="filter-select">
                        <option value="">All Grades</option>
                        <option value="1st Year">1st Year</option>
                        <option value="2nd Year">2nd Year</option>
                        <option value="3rd Year">3rd Year</option>
                        <option value="4th Year">4th Year</option>
                    </select>
                    
                    <select id="filter-college" class="filter-select">
                        <option value="">All Colleges</option>
                        <option value="Silverquill">Silverquill</option>
                        <option value="Prismari">Prismari</option>
                        <option value="Witherbloom">Witherbloom</option>
                        <option value="Lorehold">Lorehold</option>
                        <option value="Quandrix">Quandrix</option>
                    </select>
                    
                    <button class="filter-btn" id="favorites-toggle">★ Favorites</button>
                </div>
                
                <?php if ($is_gm): ?>
                <div class="admin-controls">
                    <button class="btn-add" id="add-student-btn">+ Add Student</button>
                    <button class="btn-import" onclick="window.location.href='student-import.php'">📥 Import Student</button>
                    <button class="btn-export" id="export-students-btn">📤 Export Students</button>
                    <div class="export-selection-actions" id="export-selection-actions" style="display: none;">
                        <span class="export-selection-count" id="export-selection-count">0 selected</span>
                        <button class="btn-export" id="export-selected-students-btn" disabled>📤 Export Selected</button>
                        <button class="btn-cancel" id="cancel-export-selection-btn">Cancel</button>
                    </div>
                </div>
                
                <?php endif; ?>
            </div>
        </div>

        <!-- Students Grid -->
        <div class="students-container">
            <div id="students-grid" class="students-grid">
                <!-- Students will be loaded here via JavaScript -->
            </div>
            
        </div>

        <!-- Loading indicator -->
        <div id="loading" class="loading" style="display: none;">
            <div class="spinner"></div>
            <p>Loading students...</p>
        </div>
    </div>

    <!-- Student Detail Modal -->
    <div id="student-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modal-student-name">Student Details</h2>
                <div class="modal-controls">
                    <button class="btn-expand" id="modal-expand-btn" title="Open in New Tab">📋</button>
                    <button class="btn-favorite" id="modal-favorite-btn" title="Toggle Favorite">★</button>
                    <?php if ($is_gm): ?>
                        <button class="btn-danger" id="modal-delete-btn" title="Delete Student">🗑</button>
                    <?php endif; ?>
                    <span class="close" onclick="closeStudentModal()">&times;</span>
                </div>
            </div>
            <div class="modal-body">
                <div class="student-details">
                    <!-- Student details will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <script>
        // Global variables
        const isGM = <?php echo $is_gm ? 'true' : 'false'; ?>;
        const currentUser = '<?php echo $user; ?>';
        const STUDENTS_ENDPOINT = <?php echo json_encode($students_endpoint); ?>;
        let currentPage = 1;
        let currentSort = 'name';
        let currentFilters = {
            grade: '',
            college: '',
            club: '',
            favorites: false,
            search: ''
        };
        let selectedStudent = null;
        
        // Check if we should auto-open a student modal based on URL parameters
        function checkForAutoOpenStudent() {
            const urlParams = new URLSearchParams(window.location.search);
            const openStudentId = urlParams.get('open');
            
            if (openStudentId) {
                // Wait for students to load, then open the modal
                const checkInterval = setInterval(() => {
                    if (window.studentsLoaded && Array.isArray(window.allStudents)) {
                        const student = window.allStudents.find(s => s.student_id === openStudentId);
                        if (student) {
                            openStudentModal(student);
                            // Clean up URL without reloading page
                            window.history.replaceState({}, document.title, window.location.pathname);
                        }
                        clearInterval(checkInterval);
                    }
                }, 100);
                
                // Timeout after 5 seconds
                setTimeout(() => clearInterval(checkInterval), 5000);
            }
        }

        // Initialize the application
        document.addEventListener('DOMContentLoaded', function() {
            setupEventListeners();
            loadStudents();
            checkForAutoOpenStudent();
        });
    </script>
    <!-- Character Autocomplete Container -->
    <div id="character-autocomplete" class="character-autocomplete" style="display: none;"></div>

    <!-- Export Modal -->
    <div id="export-modal" class="modal" style="display: none;">
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h2>Export Students Data</h2>
                <span class="close" onclick="closeExportModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div style="margin-bottom: 10px;">
                    <button class="btn-copy" onclick="copyExportData()">📋 Copy to Clipboard</button>
                    <span id="copy-feedback" style="margin-left: 10px; color: #10b981; display: none;">✓ Copied!</span>
                </div>
                <textarea id="export-data" style="width: 100%; height: 400px; font-family: monospace; font-size: 12px;" readonly></textarea>
            </div>
        </div>
    </div>

    <!-- Version Footer -->
    <div class="version-footer">
        <span class="version-info"><?php echo Version::displayVersion(); ?></span>
        <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
    </div>

    <script src="../gm/js/rich-text-editor.js"></script>
    <script src="../gm/js/character-lookup.js"></script>
    <script src="js/students.js"></script>
</body>
</html>
