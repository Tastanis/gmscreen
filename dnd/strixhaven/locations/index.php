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

// Function to load location data
function loadLocationData() {
    $dataFile = 'locations.json';
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data && isset($data['locations'])) {
            return $data;
        }
    }
    
    // Return default data structure if file doesn't exist
    return array(
        'locations' => array(),
        'metadata' => array(
            'last_updated' => date('Y-m-d H:i:s'),
            'total_locations' => 0
        )
    );
}

// Function to save location data
function saveLocationData($data) {
    $dataFile = 'locations.json';
    
    // Update metadata
    $data['metadata']['last_updated'] = date('Y-m-d H:i:s');
    $data['metadata']['total_locations'] = count($data['locations']);
    
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    return file_put_contents($dataFile, $jsonData, LOCK_EX);
}

// Handle AJAX requests
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    header('Content-Type: application/json');
    
    // BLOCK ALL SAVE OPERATIONS FOR NON-GM USERS
    if (!$is_gm && in_array($_POST['action'], ['save_location', 'add_location', 'delete_location', 'upload_image', 'delete_image'])) {
        echo json_encode(array('success' => false, 'error' => 'Only GM can make changes'));
        exit;
    }
    
    if ($_POST['action'] === 'load_locations') {
        $data = loadLocationData();
        $sort_by = isset($_POST['sort_by']) ? $_POST['sort_by'] : 'name';
        $filter_college = isset($_POST['filter_college']) ? $_POST['filter_college'] : '';
        $filter_hex_color = isset($_POST['filter_hex_color']) ? $_POST['filter_hex_color'] : '';
        $show_favorites = isset($_POST['show_favorites']) ? $_POST['show_favorites'] === 'true' : false;
        $search_term = isset($_POST['search_term']) ? trim($_POST['search_term']) : '';
        
        $locations = $data['locations'];
        
        // Filter out invisible locations for non-GM users
        if (!$is_gm) {
            $locations = array_filter($locations, function($location) {
                return isset($location['visible_to_players']) && $location['visible_to_players'];
            });
        }
        
        // Apply filters
        if ($show_favorites) {
            $locations = array_filter($locations, function($location) use ($user) {
                return isset($location['favorites'][$user]) && $location['favorites'][$user];
            });
        }
        
        if ($filter_college) {
            $locations = array_filter($locations, function($location) use ($filter_college) {
                return isset($location['college']) && $location['college'] === $filter_college;
            });
        }
        
        if ($filter_hex_color) {
            $locations = array_filter($locations, function($location) use ($filter_hex_color) {
                return isset($location['hex_color']) && $location['hex_color'] === $filter_hex_color;
            });
        }
        
        if ($search_term) {
            $locations = array_filter($locations, function($location) use ($search_term) {
                return stripos($location['name'], $search_term) !== false;
            });
        }
        
        // Sort locations
        usort($locations, function($a, $b) use ($sort_by) {
            switch ($sort_by) {
                case 'hex_color':
                    $color_order = ['Black' => 1, 'Grey' => 2, 'White' => 3, 'Yellow' => 4, 'Orange' => 5, 'Red' => 6, 'Green' => 7, 'Blue' => 8, 'Purple' => 9];
                    $a_color = isset($color_order[$a['hex_color']]) ? $color_order[$a['hex_color']] : 10;
                    $b_color = isset($color_order[$b['hex_color']]) ? $color_order[$b['hex_color']] : 10;
                    if ($a_color === $b_color) {
                        return strcasecmp($a['name'], $b['name']);
                    }
                    return $a_color - $b_color;
                
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
        
        // Return all locations, no pagination
        echo json_encode(array(
            'success' => true,
            'locations' => array_values($locations)
        ));
        
    } elseif ($_POST['action'] === 'save_location') {
        $location_id = isset($_POST['location_id']) ? $_POST['location_id'] : '';
        $field = isset($_POST['field']) ? $_POST['field'] : '';
        $value = isset($_POST['value']) ? $_POST['value'] : '';
        
        if ($location_id && $field) {
            $data = loadLocationData();
            
            // Find location
            $location_index = -1;
            foreach ($data['locations'] as $index => $location) {
                if ($location['location_id'] === $location_id) {
                    $location_index = $index;
                    break;
                }
            }
            
            if ($location_index !== -1) {
                // Handle nested fields (location_info.*)
                if (strpos($field, 'location_info.') === 0) {
                    $info_field = substr($field, 14);
                    if (!isset($data['locations'][$location_index]['location_info'])) {
                        $data['locations'][$location_index]['location_info'] = array();
                    }
                    $data['locations'][$location_index]['location_info'][$info_field] = $value;
                } elseif ($field === 'visible_to_players') {
                    $data['locations'][$location_index][$field] = ($value === 'true' || $value === true);
                } else {
                    $data['locations'][$location_index][$field] = $value;
                }
                
                if (saveLocationData($data)) {
                    echo json_encode(array('success' => true));
                } else {
                    echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
                }
            } else {
                echo json_encode(array('success' => false, 'error' => 'Location not found'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
        }
        
    } elseif ($_POST['action'] === 'add_location') {
        $data = loadLocationData();
        
        $new_location = array(
            'location_id' => 'location_' . time() . '_' . uniqid(),
            'name' => 'New Location',
            'images' => array(),
            'college' => '',
            'hex_color' => '',
            'hex_number' => '',
            'visible_to_players' => false,
            'favorites' => array(),
            'location_info' => array(
                'world_wound' => '',
                'origin' => '',
                'desire' => '',
                'fear' => '',
                'connection' => '',
                'impact' => '',
                'change' => ''
            ),
            'other' => ''
        );
        
        $data['locations'][] = $new_location;
        
        if (saveLocationData($data)) {
            echo json_encode(array('success' => true, 'location' => $new_location));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to add location'));
        }
        
    } elseif ($_POST['action'] === 'delete_location') {
        $location_id = isset($_POST['location_id']) ? $_POST['location_id'] : '';
        
        if ($location_id) {
            $data = loadLocationData();
            
            $location_index = -1;
            foreach ($data['locations'] as $index => $location) {
                if ($location['location_id'] === $location_id) {
                    $location_index = $index;
                    break;
                }
            }
            
            if ($location_index !== -1) {
                // Delete associated images
                if (isset($data['locations'][$location_index]['images'])) {
                    foreach ($data['locations'][$location_index]['images'] as $image_path) {
                        if (!empty($image_path) && file_exists($image_path)) {
                            unlink($image_path);
                        }
                    }
                }
                
                array_splice($data['locations'], $location_index, 1);
                
                if (saveLocationData($data)) {
                    echo json_encode(array('success' => true));
                } else {
                    echo json_encode(array('success' => false, 'error' => 'Failed to delete location'));
                }
            } else {
                echo json_encode(array('success' => false, 'error' => 'Location not found'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid location ID'));
        }
        
    } elseif ($_POST['action'] === 'toggle_favorite') {
        $location_id = isset($_POST['location_id']) ? $_POST['location_id'] : '';
        
        if ($location_id) {
            $data = loadLocationData();
            
            foreach ($data['locations'] as &$location) {
                if ($location['location_id'] === $location_id) {
                    // Initialize favorites array if it doesn't exist
                    if (!isset($location['favorites'])) {
                        $location['favorites'] = array();
                    }
                    
                    // Toggle favorite status for current user
                    $current_status = isset($location['favorites'][$user]) ? $location['favorites'][$user] : false;
                    $location['favorites'][$user] = !$current_status;
                    
                    if (saveLocationData($data)) {
                        echo json_encode(array('success' => true, 'is_favorite' => $location['favorites'][$user]));
                    } else {
                        echo json_encode(array('success' => false, 'error' => 'Failed to update favorite status'));
                    }
                    exit;
                }
            }
            
            echo json_encode(array('success' => false, 'error' => 'Location not found'));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid location ID'));
        }
        
    } elseif ($_POST['action'] === 'upload_image') {
        $location_id = isset($_POST['location_id']) ? $_POST['location_id'] : '';
        
        if (!$location_id) {
            echo json_encode(array('success' => false, 'error' => 'Invalid location ID'));
            exit;
        }
        
        if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            echo json_encode(array('success' => false, 'error' => 'No file uploaded or upload error'));
            exit;
        }
        
        $file = $_FILES['image'];
        
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
        
        // Create images directory if it doesn't exist
        $images_dir = 'images';
        if (!is_dir($images_dir)) {
            mkdir($images_dir, 0755, true);
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
        
        $filename = $location_id . '_image_' . time() . '_' . uniqid() . '.' . $file_extension;
        $filepath = $images_dir . '/' . $filename;
        
        // Move uploaded file
        if (move_uploaded_file($file['tmp_name'], $filepath)) {
            // Update location data
            $data = loadLocationData();
            $location_found = false;
            
            foreach ($data['locations'] as &$location) {
                if ($location['location_id'] === $location_id) {
                    if (!isset($location['images'])) {
                        $location['images'] = array();
                    }
                    $location['images'][] = $filepath;
                    $location_found = true;
                    break;
                }
            }
            
            if ($location_found && saveLocationData($data)) {
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
                echo json_encode(array('success' => false, 'error' => 'Failed to update location data'));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file'));
        }
        
    } elseif ($_POST['action'] === 'delete_image') {
        $location_id = isset($_POST['location_id']) ? $_POST['location_id'] : '';
        $image_path = isset($_POST['image_path']) ? $_POST['image_path'] : '';
        
        if ($location_id && $image_path) {
            $data = loadLocationData();
            $location_found = false;
            
            foreach ($data['locations'] as &$location) {
                if ($location['location_id'] === $location_id) {
                    if (isset($location['images'])) {
                        $image_index = array_search($image_path, $location['images']);
                        if ($image_index !== false) {
                            // Remove from array
                            array_splice($location['images'], $image_index, 1);
                            $location_found = true;
                            
                            // Delete physical file
                            if (file_exists($image_path)) {
                                unlink($image_path);
                            }
                        }
                    }
                    break;
                }
            }
            
            if ($location_found && saveLocationData($data)) {
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
        $locationData = loadLocationData();
        if ($locationData && isset($locationData['locations'])) {
            foreach ($locationData['locations'] as $location) {
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
$locationData = loadLocationData();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Locations - <?php echo htmlspecialchars($user); ?></title>
    <link rel="stylesheet" href="../../css/style.css">
    <link rel="stylesheet" href="css/locations.css">
    <link rel="stylesheet" href="../gm/css/character-refs.css">
</head>
<body>
    <!-- Top Navigation Bar -->
    <div class="top-nav">
        <div class="nav-buttons">
            <button class="nav-btn" onclick="window.location.href='../../dashboard.php'">← Back to Dashboard</button>
            <button class="nav-btn logout-btn" onclick="window.location.href='../../logout.php'">Logout</button>
        </div>
        <h1 class="nav-title">Strixhaven Locations<?php echo $is_gm ? ' - GM View' : ' - Player View'; ?></h1>
    </div>

    <div class="main-container">
        <!-- Control Panel -->
        <div class="control-panel">
            <!-- Search Bar -->
            <div class="search-section">
                <input type="text" id="search-input" placeholder="Search locations by name..." class="search-input">
            </div>
            
            <!-- Sort and Filter Controls -->
            <div class="filter-section">
                <div class="filter-group">
                    <label>Sort by:</label>
                    <button class="filter-btn active" data-sort="name">Name</button>
                    <button class="filter-btn" data-sort="hex_color">Hex Color</button>
                    <button class="filter-btn" data-sort="college">College</button>
                </div>
                
                <div class="filter-group">
                    <label>Filter:</label>
                    <select id="filter-college" class="filter-select">
                        <option value="">All Colleges</option>
                        <option value="Central Campus">Central Campus</option>
                        <option value="Silverquill">Silverquill</option>
                        <option value="Prismari">Prismari</option>
                        <option value="Witherbloom">Witherbloom</option>
                        <option value="Lorehold">Lorehold</option>
                        <option value="Quandrix">Quandrix</option>
                    </select>
                    
                    <select id="filter-hex-color" class="filter-select">
                        <option value="">All Colors</option>
                        <option value="Black">Black</option>
                        <option value="Grey">Grey</option>
                        <option value="White">White</option>
                        <option value="Yellow">Yellow</option>
                        <option value="Orange">Orange</option>
                        <option value="Red">Red</option>
                        <option value="Green">Green</option>
                        <option value="Blue">Blue</option>
                        <option value="Purple">Purple</option>
                    </select>
                    
                    <button class="filter-btn" id="favorites-toggle">★ Favorites</button>
                </div>
                
                <?php if ($is_gm): ?>
                <div class="admin-controls">
                    <button class="btn-add" id="add-location-btn">+ Add Location</button>
                </div>
                <?php endif; ?>
            </div>
        </div>

        <!-- Locations Grid -->
        <div class="locations-container">
            <div id="locations-grid" class="locations-grid">
                <!-- Locations will be loaded here via JavaScript -->
            </div>
            
        </div>

        <!-- Loading indicator -->
        <div id="loading" class="loading" style="display: none;">
            <div class="spinner"></div>
            <p>Loading locations...</p>
        </div>
    </div>

    <!-- Location Detail Modal -->
    <div id="location-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modal-location-name">Location Details</h2>
                <div class="modal-controls">
                    <button class="btn-expand" id="modal-expand-btn" title="Open in New Tab">📋</button>
                    <button class="btn-favorite" id="modal-favorite-btn" title="Toggle Favorite">★</button>
                    <?php if ($is_gm): ?>
                        <button class="btn-danger" id="modal-delete-btn" title="Delete Location">🗑</button>
                    <?php endif; ?>
                    <span class="close" onclick="closeLocationModal()">&times;</span>
                </div>
            </div>
            <div class="modal-body">
                <div class="location-details">
                    <!-- Location details will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <!-- Image Modal for full-size viewing -->
    <div id="image-modal" class="modal image-modal">
        <div class="modal-content image-modal-content">
            <span class="close" onclick="closeImageModal()">&times;</span>
            <img id="modal-image" src="" alt="Full size image">
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
            hex_color: '',
            favorites: false,
            search: ''
        };
        let selectedLocation = null;
        
        // Check if we should auto-open a location modal based on URL parameters
        function checkForAutoOpenLocation() {
            const urlParams = new URLSearchParams(window.location.search);
            const openLocationId = urlParams.get('open');
            
            if (openLocationId) {
                // Wait for locations to load, then open the modal
                const checkInterval = setInterval(() => {
                    if (window.locationsLoaded && Array.isArray(window.allLocations)) {
                        const location = window.allLocations.find(l => l.location_id === openLocationId);
                        if (location) {
                            openLocationModal(location);
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
            loadLocations();
            checkForAutoOpenLocation();
        });
    </script>
    <!-- Character Autocomplete Container -->
    <div id="character-autocomplete" class="character-autocomplete" style="display: none;"></div>

    <script src="../gm/js/rich-text-editor.js"></script>
    <script src="../gm/js/character-lookup.js"></script>
    <script src="js/locations.js"></script>
</body>
</html>