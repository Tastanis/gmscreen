<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Include character integration for character details functionality
require_once '../gm/includes/character-integration.php';

// Function to load staff data
function loadStaffData() {
    $dataFile = 'staff.json';
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data && isset($data['staff'])) {
            return $data;
        }
    }
    
    // Return default data structure if file doesn't exist
    return array(
        'staff' => array(),
        'metadata' => array(
            'last_updated' => date('Y-m-d H:i:s'),
            'total_staff' => 0
        )
    );
}

// Function to save staff data
function saveStaffData($data) {
    $dataFile = 'staff.json';
    
    // Update metadata
    $data['metadata']['last_updated'] = date('Y-m-d H:i:s');
    $data['metadata']['total_staff'] = count($data['staff']);
    
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    return file_put_contents($dataFile, $jsonData, LOCK_EX);
}

// Handle AJAX requests
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    header('Content-Type: application/json');
    
    // BLOCK SOME SAVE OPERATIONS FOR NON-GM USERS (but allow toggle_favorite for all users)
    if (!$is_gm && in_array($_POST['action'], ['save_staff', 'add_staff', 'delete_staff', 'upload_portrait', 'delete_image'])) {
        echo json_encode(array('success' => false, 'error' => 'Only GM can make changes'));
        exit;
    }
    
    if ($_POST['action'] === 'load_staff') {
        $data = loadStaffData();
        $sort_by = isset($_POST['sort_by']) ? $_POST['sort_by'] : 'name';
        $filter_college = isset($_POST['filter_college']) ? $_POST['filter_college'] : '';
        $show_favorites = isset($_POST['show_favorites']) ? $_POST['show_favorites'] === 'true' : false;
        $search_term = isset($_POST['search_term']) ? trim($_POST['search_term']) : '';
        
        $staff = $data['staff'];
        
        // Apply filters
        if ($show_favorites) {
            $staff = array_filter($staff, function($member) use ($user) {
                return isset($member['favorites'][$user]) && $member['favorites'][$user];
            });
        }
        
        if ($filter_college) {
            $staff = array_filter($staff, function($member) use ($filter_college) {
                return isset($member['college']) && $member['college'] === $filter_college;
            });
        }
        
        if ($search_term) {
            $staff = array_filter($staff, function($member) use ($search_term) {
                return stripos($member['name'], $search_term) !== false;
            });
        }
        
        // Sort staff
        usort($staff, function($a, $b) use ($sort_by) {
            switch ($sort_by) {
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
        
        // Return all staff, no pagination
        echo json_encode(array(
            'success' => true,
            'staff' => array_values($staff)
        ));
        
    } elseif ($_POST['action'] === 'save_staff') {
        $staff_id = isset($_POST['staff_id']) ? $_POST['staff_id'] : '';
        $field = isset($_POST['field']) ? $_POST['field'] : '';
        $value = isset($_POST['value']) ? $_POST['value'] : '';
        
        if ($staff_id && $field) {
            $data = loadStaffData();
            
            // Find staff member
            $staff_index = -1;
            foreach ($data['staff'] as $index => $member) {
                if ($member['staff_id'] === $staff_id) {
                    $staff_index = $index;
                    break;
                }
            }
            
            if ($staff_index !== -1) {
                // Handle nested fields (gm_only.* and character_info.*)
                if (strpos($field, 'gm_only.') === 0) {
                    $gm_field = substr($field, 8);
                    if (!isset($data['staff'][$staff_index]['gm_only'])) {
                        $data['staff'][$staff_index]['gm_only'] = array();
                    }
                    $data['staff'][$staff_index]['gm_only'][$gm_field] = $value;
                } elseif (strpos($field, 'character_info.') === 0) {
                    $char_info_field = substr($field, 15);
                    if (!isset($data['staff'][$staff_index]['character_info'])) {
                        $data['staff'][$staff_index]['character_info'] = array();
                    }
                    $data['staff'][$staff_index]['character_info'][$char_info_field] = $value;
                } else {
                    $data['staff'][$staff_index][$field] = $value;
                }
                
                if (saveStaffData($data)) {
                    echo json_encode(array('success' => true));
                } else {
                    echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
                }
            } else {
                echo json_encode(array('success' => false, 'error' => 'Staff member not found'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
        }
        
    } elseif ($_POST['action'] === 'add_staff') {
        $data = loadStaffData();
        
        $new_staff = array(
            'staff_id' => 'staff_' . time() . '_' . uniqid(),
            'name' => 'New Staff Member',
            'images' => array(),
            'college' => '',
            'character_description' => '',
            'general_info' => '',
            'favorites' => array(),
            'character_info' => array(
                'origin' => '',
                'desire' => '',
                'fear' => '',
                'connection' => '',
                'impact' => '',
                'change' => ''
            ),
            'gm_only' => array(
                'personality' => '',
                'other' => ''
            )
        );
        
        $data['staff'][] = $new_staff;
        
        if (saveStaffData($data)) {
            echo json_encode(array('success' => true, 'staff' => $new_staff));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to add staff member'));
        }
        
    } elseif ($_POST['action'] === 'delete_staff') {
        $staff_id = isset($_POST['staff_id']) ? $_POST['staff_id'] : '';
        
        if ($staff_id) {
            $data = loadStaffData();
            
            $staff_index = -1;
            foreach ($data['staff'] as $index => $member) {
                if ($member['staff_id'] === $staff_id) {
                    $staff_index = $index;
                    break;
                }
            }
            
            if ($staff_index !== -1) {
                // Delete associated images
                $member = $data['staff'][$staff_index];
                if (isset($member['images'])) {
                    foreach ($member['images'] as $image_path) {
                        if (!empty($image_path) && file_exists($image_path)) {
                            unlink($image_path);
                        }
                    }
                } elseif (isset($member['image_path']) && !empty($member['image_path']) && file_exists($member['image_path'])) {
                    // Backward compatibility
                    unlink($member['image_path']);
                }
                
                array_splice($data['staff'], $staff_index, 1);
                
                if (saveStaffData($data)) {
                    echo json_encode(array('success' => true));
                } else {
                    echo json_encode(array('success' => false, 'error' => 'Failed to delete staff member'));
                }
            } else {
                echo json_encode(array('success' => false, 'error' => 'Staff member not found'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid staff ID'));
        }
        
    } elseif ($_POST['action'] === 'toggle_favorite') {
        $staff_id = isset($_POST['staff_id']) ? $_POST['staff_id'] : '';
        
        if ($staff_id) {
            $data = loadStaffData();
            
            foreach ($data['staff'] as &$member) {
                if ($member['staff_id'] === $staff_id) {
                    // Initialize favorites array if it doesn't exist
                    if (!isset($member['favorites'])) {
                        $member['favorites'] = array();
                    }
                    
                    // Toggle favorite status for current user
                    $current_status = isset($member['favorites'][$user]) ? $member['favorites'][$user] : false;
                    $member['favorites'][$user] = !$current_status;
                    
                    if (saveStaffData($data)) {
                        echo json_encode(array('success' => true, 'is_favorite' => $member['favorites'][$user]));
                    } else {
                        echo json_encode(array('success' => false, 'error' => 'Failed to update favorite status'));
                    }
                    exit;
                }
            }
            
            echo json_encode(array('success' => false, 'error' => 'Staff member not found'));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid staff ID'));
        }
        
    } elseif ($_POST['action'] === 'lookup_character_by_name') {
        $search_name = isset($_POST['name']) ? trim($_POST['name']) : '';
        
        if ($search_name) {
            $data = loadStaffData();
            $matches = array();
            
            foreach ($data['staff'] as $member) {
                // Case-insensitive search
                if (stripos($member['name'], $search_name) !== false) {
                    $matches[] = array(
                        'id' => $member['staff_id'],
                        'name' => $member['name'],
                        'type' => 'staff',
                        'college' => $member['college'] || '',
                        'image_path' => $member['image_path'] || '',
                        'description' => substr($member['character_description'] || '', 0, 100)
                    );
                }
            }
            
            echo json_encode(array('success' => true, 'matches' => $matches));
        } else {
            echo json_encode(array('success' => false, 'error' => 'No search term provided'));
        }
        
    } elseif ($_POST['action'] === 'get_all_character_names') {
        $data = loadStaffData();
        $names = array();
        
        foreach ($data['staff'] as $member) {
            $names[] = array(
                'id' => $member['staff_id'],
                'name' => $member['name'],
                'type' => 'staff',
                'college' => $member['college'] || '',
                'image_path' => $member['image_path'] || ''
            );
        }
        
        echo json_encode(array('success' => true, 'characters' => $names));
        
    } elseif ($_POST['action'] === 'get_character_popup_data') {
        $character_id = isset($_POST['character_id']) ? $_POST['character_id'] : '';
        
        if ($character_id) {
            $data = loadStaffData();
            
            foreach ($data['staff'] as $member) {
                if ($member['staff_id'] === $character_id) {
                    echo json_encode(array('success' => true, 'character' => $member, 'type' => 'staff'));
                    exit;
                }
            }
            
            echo json_encode(array('success' => false, 'error' => 'Staff member not found'));
        } else {
            echo json_encode(array('success' => false, 'error' => 'No character ID provided'));
        }
        
    } elseif ($_POST['action'] === 'upload_portrait') {
        $staff_id = isset($_POST['staff_id']) ? $_POST['staff_id'] : '';
        
        if (!$staff_id) {
            echo json_encode(array('success' => false, 'error' => 'Invalid staff ID'));
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
        
        $filename = $staff_id . '_portrait_' . time() . '.' . $file_extension;
        $filepath = $portraits_dir . '/' . $filename;
        
        // Move uploaded file
        if (move_uploaded_file($file['tmp_name'], $filepath)) {
            // Update staff data
            $data = loadStaffData();
            $staff_found = false;
            
            foreach ($data['staff'] as &$member) {
                if ($member['staff_id'] === $staff_id) {
                    // Initialize images array if it doesn't exist (backward compatibility)
                    if (!isset($member['images'])) {
                        $member['images'] = array();
                        // Migrate old image_path to images array
                        if (!empty($member['image_path'])) {
                            $member['images'][] = $member['image_path'];
                            unset($member['image_path']);
                        }
                    }
                    
                    // Add new image to array
                    $member['images'][] = $filepath;
                    $staff_found = true;
                    break;
                }
            }
            
            if ($staff_found && saveStaffData($data)) {
                echo json_encode(array(
                    'success' => true, 
                    'image_path' => $filepath,
                    'message' => 'Image uploaded successfully'
                ));
            } else {
                // Clean up uploaded file if database update failed
                if (file_exists($filepath)) {
                    unlink($filepath);
                }
                echo json_encode(array('success' => false, 'error' => 'Failed to update staff data'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file'));
        }
        
    } elseif ($_POST['action'] === 'delete_image') {
        $staff_id = isset($_POST['staff_id']) ? $_POST['staff_id'] : '';
        $image_path = isset($_POST['image_path']) ? $_POST['image_path'] : '';
        
        if ($staff_id && $image_path) {
            $data = loadStaffData();
            $staff_found = false;
            
            foreach ($data['staff'] as &$member) {
                if ($member['staff_id'] === $staff_id) {
                    // Handle backward compatibility
                    if (!isset($member['images']) && isset($member['image_path'])) {
                        $member['images'] = array($member['image_path']);
                        unset($member['image_path']);
                    }
                    
                    if (isset($member['images'])) {
                        $image_index = array_search($image_path, $member['images']);
                        if ($image_index !== false) {
                            // Remove from array
                            array_splice($member['images'], $image_index, 1);
                            $staff_found = true;
                            
                            // Delete physical file
                            if (file_exists($image_path)) {
                                unlink($image_path);
                            }
                        }
                    }
                    break;
                }
            }
            
            if ($staff_found && saveStaffData($data)) {
                echo json_encode(array('success' => true));
            } else {
                echo json_encode(array('success' => false, 'error' => 'Failed to delete image'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
        }
        
    } elseif ($_POST['action'] === 'get_all_characters') {
        // Get all characters (students, staff, locations) for autocomplete
        $allCharacters = array();
        
        // Load students
        $studentsFile = '../students/students.json';
        if (file_exists($studentsFile)) {
            $studentsData = json_decode(file_get_contents($studentsFile), true);
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
        }
        
        // Load staff
        $staffData = loadStaffData();
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
    }
    exit;
}

// Load initial data for page
$staffData = loadStaffData();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Staff - <?php echo htmlspecialchars($user); ?></title>
    <link rel="stylesheet" href="../../css/style.css">
    <link rel="stylesheet" href="css/staff.css">
</head>
<body>
    <!-- Top Navigation Bar -->
    <div class="top-nav">
        <div class="nav-buttons">
            <button class="nav-btn" onclick="window.location.href='../../dashboard.php'">← Back to Dashboard</button>
            <button class="nav-btn logout-btn" onclick="window.location.href='../../logout.php'">Logout</button>
        </div>
        <h1 class="nav-title">Strixhaven Staff<?php echo $is_gm ? ' - GM View' : ' - Player View'; ?></h1>
    </div>

    <div class="main-container">
        <!-- Control Panel -->
        <div class="control-panel">
            <!-- Search Bar -->
            <div class="search-section">
                <input type="text" id="search-input" placeholder="Search staff by name..." class="search-input">
            </div>
            
            <!-- Sort and Filter Controls -->
            <div class="filter-section">
                <div class="filter-group">
                    <label>Sort by:</label>
                    <button class="filter-btn active" data-sort="name">Name</button>
                    <button class="filter-btn" data-sort="college">College</button>
                </div>
                
                <div class="filter-group">
                    <label>Filter:</label>
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
                    <button class="btn-add" id="add-staff-btn">+ Add Staff Member</button>
                </div>
                <?php endif; ?>
            </div>
        </div>

        <!-- Staff Grid -->
        <div class="staff-container">
            <div id="staff-grid" class="staff-grid">
                <!-- Staff will be loaded here via JavaScript -->
            </div>
            
        </div>

        <!-- Loading indicator -->
        <div id="loading" class="loading" style="display: none;">
            <div class="spinner"></div>
            <p>Loading staff...</p>
        </div>
    </div>

    <!-- Staff Detail Modal -->
    <div id="staff-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modal-staff-name">Staff Details</h2>
                <div class="modal-controls">
                    <button class="btn-expand" id="modal-expand-btn" title="Open in New Tab">📋</button>
                    <button class="btn-favorite" id="modal-favorite-btn" title="Toggle Favorite">★</button>
                    <?php if ($is_gm): ?>
                        <button class="btn-danger" id="modal-delete-btn" title="Delete Staff Member">🗑</button>
                    <?php endif; ?>
                    <span class="close" onclick="closeStaffModal()">&times;</span>
                </div>
            </div>
            <div class="modal-body">
                <div class="staff-details">
                    <!-- Staff details will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <script>
        // Global variables
        const isGM = <?php echo $is_gm ? 'true' : 'false'; ?>;
        const currentUser = '<?php echo $user; ?>';
        let currentPage = 1;
        let currentSort = 'name';
        let currentFilters = {
            college: '',
            favorites: false,
            search: ''
        };
        let selectedStaff = null;
        
        // Check if we should auto-open a staff modal based on URL parameters
        function checkForAutoOpenStaff() {
            const urlParams = new URLSearchParams(window.location.search);
            const openStaffId = urlParams.get('open');
            
            if (openStaffId) {
                // Wait for staff to load, then open the modal
                const checkInterval = setInterval(() => {
                    if (window.staffLoaded && Array.isArray(window.allStaff)) {
                        const staff = window.allStaff.find(s => s.staff_id === openStaffId);
                        if (staff) {
                            openStaffModal(staff);
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
            loadStaff();
            checkForAutoOpenStaff();
        });
    </script>
    <!-- Character Autocomplete Container -->
    <div id="character-autocomplete" class="character-autocomplete" style="display: none;"></div>

    <script src="../gm/js/rich-text-editor.js"></script>
    <script src="../gm/js/character-lookup.js"></script>
    <script src="js/staff.js"></script>
</body>
</html>