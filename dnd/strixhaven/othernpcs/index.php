<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// GM-only gate. Non-GM users cannot access this section at all.
if (!$is_gm) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Access restricted: GM only']);
        exit;
    }
    http_response_code(403);
    ?><!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Access Restricted</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .box { background: #2a2a4e; padding: 40px 60px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); text-align: center; }
            h1 { color: #ff6b6b; margin: 0 0 12px; }
            p { color: #aab; margin: 0 0 20px; }
            a { color: #667eea; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <div class="box">
            <h1>Access Restricted</h1>
            <p>The Other NPCs section is only available to the GM.</p>
            <a href="../../dashboard.php">Return to Dashboard</a>
        </div>
    </body>
    </html><?php
    exit;
}

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';

// Include character integration for character details functionality
require_once '../gm/includes/character-integration.php';
require_once __DIR__ . '/data-utils.php';

$npcs_endpoint = $_SERVER['PHP_SELF'] ?? ($_SERVER['SCRIPT_NAME'] ?? '/dnd/strixhaven/othernpcs/index.php');

// Handle AJAX requests
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    header('Content-Type: application/json');

    if ($_POST['action'] === 'load_npcs') {
        $data = loadNpcData();
        $sort_by = isset($_POST['sort_by']) ? $_POST['sort_by'] : 'name';
        $filter_college = isset($_POST['filter_college']) ? $_POST['filter_college'] : '';
        $show_favorites = isset($_POST['show_favorites']) ? $_POST['show_favorites'] === 'true' : false;
        $search_term = isset($_POST['search_term']) ? trim($_POST['search_term']) : '';

        $npcs = isset($data['npcs']) && is_array($data['npcs']) ? $data['npcs'] : [];

        if ($show_favorites) {
            $npcs = array_filter($npcs, function($npc) use ($user) {
                return isset($npc['favorites'][$user]) && $npc['favorites'][$user];
            });
        }

        if ($filter_college) {
            $npcs = array_filter($npcs, function($npc) use ($filter_college) {
                return isset($npc['college']) && $npc['college'] === $filter_college;
            });
        }

        if ($search_term) {
            $npcs = array_filter($npcs, function($npc) use ($search_term) {
                return stripos($npc['name'], $search_term) !== false;
            });
        }

        usort($npcs, function($a, $b) use ($sort_by) {
            switch ($sort_by) {
                case 'college':
                    $ac = isset($a['college']) ? $a['college'] : '';
                    $bc = isset($b['college']) ? $b['college'] : '';
                    if ($ac === $bc) {
                        return strcasecmp($a['name'], $b['name']);
                    }
                    return strcasecmp($ac, $bc);

                case 'race':
                    $ar = isset($a['race']) ? $a['race'] : '';
                    $br = isset($b['race']) ? $b['race'] : '';
                    if ($ar === $br) {
                        return strcasecmp($a['name'], $b['name']);
                    }
                    return strcasecmp($ar, $br);

                case 'name':
                default:
                    return strcasecmp($a['name'], $b['name']);
            }
        });

        require_once '../includes/thumbnail-utils.php';
        foreach ($npcs as &$n) {
            if (isset($n['images']) && is_array($n['images'])) {
                $n['thumbnails'] = array();
                foreach ($n['images'] as $img) {
                    $thumbPath = getThumbnailPath($img);
                    $n['thumbnails'][$img] = file_exists($thumbPath) ? $thumbPath : null;
                }
            }
        }
        unset($n);

        echo json_encode(array(
            'success' => true,
            'npcs' => array_values($npcs)
        ));

    } elseif ($_POST['action'] === 'save_npc') {
        $npc_id = isset($_POST['npc_id']) ? $_POST['npc_id'] : '';
        $field = isset($_POST['field']) ? $_POST['field'] : '';
        $value = isset($_POST['value']) ? $_POST['value'] : '';

        if ($npc_id && $field) {
            $result = modifyNpcData(function (&$data) use ($npc_id, $field, $value) {
                foreach ($data['npcs'] as &$npc) {
                    if ($npc['npc_id'] === $npc_id) {
                        if (strpos($field, 'conflict_engine.') === 0) {
                            $ceField = substr($field, 16);
                            if (!isset($npc['conflict_engine']) || !is_array($npc['conflict_engine'])) {
                                $npc['conflict_engine'] = array();
                            }
                            $npc['conflict_engine'][$ceField] = $value;
                        } elseif ($field === 'tension_web') {
                            $decoded = json_decode($value, true);
                            if (!is_array($decoded)) {
                                return ['save' => false, 'error' => 'Invalid tension web data'];
                            }
                            $npc['tension_web'] = $decoded;
                        } elseif ($field === 'pressure_point' || $field === 'trajectory' || $field === 'directors_notes') {
                            $npc[$field] = $value;
                        } elseif (strpos($field, 'details.') === 0) {
                            $detailField = substr($field, 8);
                            if (!isset($npc['details']) || !is_array($npc['details'])) {
                                $npc['details'] = array();
                            }
                            $npc['details'][$detailField] = $value;
                        } else {
                            $npc[$field] = $value;
                        }

                        return ['result' => true];
                    }
                }

                return ['save' => false, 'error' => 'NPC not found'];
            });

            if ($result['success']) {
                echo json_encode(array('success' => true));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to save data';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
        }

    } elseif ($_POST['action'] === 'add_npc') {
        $new_npc = getBlankNpcRecord();
        $result = modifyNpcData(function (&$data) use (&$new_npc) {
            $data['npcs'][] = $new_npc;
            return ['result' => $new_npc];
        });

        if ($result['success']) {
            echo json_encode(array('success' => true, 'npc' => $new_npc));
        } else {
            $error = isset($result['error']) ? $result['error'] : 'Failed to add NPC';
            echo json_encode(array('success' => false, 'error' => $error));
        }

    } elseif ($_POST['action'] === 'delete_npc') {
        $npc_id = isset($_POST['npc_id']) ? $_POST['npc_id'] : '';

        if ($npc_id) {
            $imagesToDelete = array();
            $result = modifyNpcData(function (&$data) use ($npc_id, &$imagesToDelete) {
                foreach ($data['npcs'] as $index => $npc) {
                    if ($npc['npc_id'] === $npc_id) {
                        if (isset($npc['images']) && is_array($npc['images'])) {
                            foreach ($npc['images'] as $image_path) {
                                if (!empty($image_path)) {
                                    $imagesToDelete[] = $image_path;
                                }
                            }
                        }
                        array_splice($data['npcs'], $index, 1);
                        return ['result' => true];
                    }
                }

                return ['save' => false, 'error' => 'NPC not found'];
            });

            if ($result['success']) {
                foreach ($imagesToDelete as $image_path) {
                    if (!empty($image_path) && file_exists($image_path)) {
                        unlink($image_path);
                    }
                }
                echo json_encode(array('success' => true));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to delete NPC';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid NPC ID'));
        }

    } elseif ($_POST['action'] === 'toggle_favorite') {
        $npc_id = isset($_POST['npc_id']) ? $_POST['npc_id'] : '';

        if ($npc_id) {
            $result = modifyNpcData(function (&$data) use ($npc_id, $user) {
                foreach ($data['npcs'] as &$npc) {
                    if ($npc['npc_id'] === $npc_id) {
                        if (!isset($npc['favorites']) || !is_array($npc['favorites'])) {
                            $npc['favorites'] = array();
                        }
                        $current_status = isset($npc['favorites'][$user]) ? (bool)$npc['favorites'][$user] : false;
                        $npc['favorites'][$user] = !$current_status;
                        return ['result' => $npc['favorites'][$user]];
                    }
                }
                return ['save' => false, 'error' => 'NPC not found'];
            });

            if ($result['success']) {
                echo json_encode(array('success' => true, 'is_favorite' => (bool)$result['result']));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to update favorite status';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid NPC ID'));
        }

    } elseif ($_POST['action'] === 'upload_portrait') {
        $npc_id = isset($_POST['npc_id']) ? $_POST['npc_id'] : '';

        if (!$npc_id) {
            echo json_encode(array('success' => false, 'error' => 'Invalid NPC ID'));
            exit;
        }

        if (!isset($_FILES['portrait']) || $_FILES['portrait']['error'] !== UPLOAD_ERR_OK) {
            echo json_encode(array('success' => false, 'error' => 'No file uploaded or upload error'));
            exit;
        }

        $file = $_FILES['portrait'];

        $allowed_types = array('image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp');
        $file_type = mime_content_type($file['tmp_name']);

        if (!in_array($file_type, $allowed_types) && !in_array($file['type'], $allowed_types)) {
            echo json_encode(array('success' => false, 'error' => 'Invalid file type. Please upload JPEG, PNG, GIF, or WebP images only.'));
            exit;
        }

        if ($file['size'] > 5 * 1024 * 1024) {
            echo json_encode(array('success' => false, 'error' => 'File too large. Maximum size is 5MB.'));
            exit;
        }

        $portraits_dir = 'portraits';
        if (!is_dir($portraits_dir)) {
            mkdir($portraits_dir, 0755, true);
        }

        $file_extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        if (empty($file_extension)) {
            $mime_extensions = array(
                'image/jpeg' => 'jpg',
                'image/jpg' => 'jpg',
                'image/png' => 'png',
                'image/gif' => 'gif',
                'image/webp' => 'webp'
            );
            $file_extension = isset($mime_extensions[$file_type]) ? $mime_extensions[$file_type] : 'jpg';
        }

        $filename = $npc_id . '_portrait_' . time() . '.' . $file_extension;
        $filepath = $portraits_dir . '/' . $filename;

        if (move_uploaded_file($file['tmp_name'], $filepath)) {
            require_once '../includes/thumbnail-utils.php';
            generateThumbnail($filepath, 'thumbnails', 320);

            $result = modifyNpcData(function (&$data) use ($npc_id, $filepath) {
                foreach ($data['npcs'] as &$npc) {
                    if ($npc['npc_id'] === $npc_id) {
                        if (!isset($npc['images']) || !is_array($npc['images'])) {
                            $npc['images'] = array();
                        }
                        $npc['images'][] = $filepath;
                        return ['result' => true];
                    }
                }
                return ['save' => false, 'error' => 'NPC not found'];
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
                $error = isset($result['error']) ? $result['error'] : 'Failed to update NPC data';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file'));
        }

    } elseif ($_POST['action'] === 'delete_image') {
        $npc_id = isset($_POST['npc_id']) ? $_POST['npc_id'] : '';
        $image_path = isset($_POST['image_path']) ? $_POST['image_path'] : '';

        if ($npc_id && $image_path) {
            $shouldDeleteFile = false;
            $result = modifyNpcData(function (&$data) use ($npc_id, $image_path, &$shouldDeleteFile) {
                foreach ($data['npcs'] as &$npc) {
                    if ($npc['npc_id'] === $npc_id) {
                        if (isset($npc['images'])) {
                            $image_index = array_search($image_path, $npc['images']);
                            if ($image_index !== false) {
                                array_splice($npc['images'], $image_index, 1);
                                $shouldDeleteFile = true;
                                return ['result' => true];
                            }
                        }
                        return ['save' => false, 'error' => 'Image not found'];
                    }
                }
                return ['save' => false, 'error' => 'NPC not found'];
            });

            if ($result['success']) {
                if ($shouldDeleteFile && file_exists($image_path)) {
                    unlink($image_path);
                    require_once '../includes/thumbnail-utils.php';
                    $thumbPath = getThumbnailPath($image_path);
                    if (file_exists($thumbPath)) {
                        unlink($thumbPath);
                    }
                }
                echo json_encode(array('success' => true));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to delete image';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
        }

    } elseif ($_POST['action'] === 'save_image_adjust') {
        $npc_id = isset($_POST['npc_id']) ? $_POST['npc_id'] : '';
        $image_path = isset($_POST['image_path']) ? $_POST['image_path'] : '';
        $adjustment = isset($_POST['adjustment']) ? $_POST['adjustment'] : '';

        if ($npc_id && $image_path && $adjustment) {
            $adj_data = json_decode($adjustment, true);
            if (!is_array($adj_data)) {
                echo json_encode(array('success' => false, 'error' => 'Invalid adjustment data'));
                exit;
            }

            $result = modifyNpcData(function (&$data) use ($npc_id, $image_path, $adj_data) {
                foreach ($data['npcs'] as &$npc) {
                    if ($npc['npc_id'] === $npc_id) {
                        if (!isset($npc['image_adjustments']) || !is_array($npc['image_adjustments'])) {
                            $npc['image_adjustments'] = array();
                        }
                        $npc['image_adjustments'][$image_path] = $adj_data;
                        return ['result' => true];
                    }
                }
                return ['save' => false, 'error' => 'NPC not found'];
            });

            if ($result['success']) {
                echo json_encode(array('success' => true));
            } else {
                $error = isset($result['error']) ? $result['error'] : 'Failed to save adjustment';
                echo json_encode(array('success' => false, 'error' => $error));
            }
        } else {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
        }
    }

    exit;
}

// Load initial data for page
$npcData = loadNpcData();

// Include navigation bar
require_once '../../includes/strix-nav.php';
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Other NPCs - <?php echo htmlspecialchars($user); ?></title>
    <link rel="stylesheet" href="../../css/style.css">
    <link rel="stylesheet" href="css/othernpcs.css">
    <link rel="stylesheet" href="../includes/image-adjuster.css">
</head>
<body>
    <?php renderStrixNav(''); ?>
    <!-- Top Navigation Bar -->
    <div class="top-nav">
        <div class="nav-buttons">
            <button class="nav-btn" onclick="window.close()">Close Other NPCs</button>
            <button class="nav-btn logout-btn" onclick="window.location.href='../../logout.php'">Logout</button>
        </div>
        <h1 class="nav-title">Strixhaven Other NPCs - GM View</h1>
    </div>

    <div class="main-container">
        <!-- Control Panel -->
        <div class="control-panel">
            <div class="search-section">
                <input type="text" id="search-input" placeholder="Search NPCs by name..." class="search-input">
            </div>

            <div class="filter-section">
                <div class="filter-group">
                    <label>Sort by:</label>
                    <button class="filter-btn active" data-sort="name">Name</button>
                    <button class="filter-btn" data-sort="race">Race</button>
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

                <div class="admin-controls">
                    <button class="btn-add" id="add-npc-btn">+ Add NPC</button>
                </div>
            </div>
        </div>

        <!-- NPCs Grid -->
        <div class="npcs-container">
            <div id="npcs-grid" class="npcs-grid">
                <!-- NPCs will be loaded here via JavaScript -->
            </div>
        </div>

        <!-- Loading indicator -->
        <div id="loading" class="loading" style="display: none;">
            <div class="spinner"></div>
            <p>Loading NPCs...</p>
        </div>
    </div>

    <!-- NPC Detail Modal -->
    <div id="npc-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modal-npc-name">NPC Details</h2>
                <div class="modal-controls">
                    <button class="btn-favorite" id="modal-favorite-btn" title="Toggle Favorite">★</button>
                    <button class="btn-danger" id="modal-delete-btn" title="Delete NPC">🗑</button>
                    <span class="close" onclick="closeNpcModal()">&times;</span>
                </div>
            </div>
            <div class="modal-body">
                <div class="npc-details">
                    <!-- NPC details will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <script>
        // Globals used by npcs.js
        const isGM = true;
        const currentUser = '<?php echo htmlspecialchars($user, ENT_QUOTES); ?>';
        const NPCS_ENDPOINT = <?php echo json_encode($npcs_endpoint); ?>;
        let currentSort = 'name';
        let currentFilters = {
            college: '',
            favorites: false,
            search: ''
        };
        let selectedNpc = null;

        document.addEventListener('DOMContentLoaded', function() {
            setupEventListeners();
            loadNpcs();
        });
    </script>
    <!-- Character Autocomplete Container -->
    <div id="character-autocomplete" class="character-autocomplete" style="display: none;"></div>

    <!-- Version Footer -->
    <div class="version-footer">
        <span class="version-info"><?php echo Version::displayVersion(); ?></span>
        <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
    </div>

    <script src="../gm/js/rich-text-editor.js"></script>
    <script src="../gm/js/character-lookup.js"></script>
    <script src="../includes/image-adjuster.js"></script>
    <script src="js/othernpcs.js"></script>
</body>
</html>
