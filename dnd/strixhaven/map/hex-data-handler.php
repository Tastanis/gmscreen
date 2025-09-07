<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Not logged in']);
    exit;
}

$user = $_SESSION['user'] ?? 'unknown';
$isGM = ($user === 'GM');

// Ensure hex-data directory exists
$hexDataDir = 'hex-data';
if (!is_dir($hexDataDir)) {
    mkdir($hexDataDir, 0755, true);
}

// Ensure hex-images directory exists
$hexImagesDir = 'hex-images';
if (!is_dir($hexImagesDir)) {
    mkdir($hexImagesDir, 0755, true);
}

/**
 * Get hex data file path
 */
function getHexDataPath($q, $r) {
    return "hex-data/hex-{$q}-{$r}.json";
}

/**
 * Load hex data
 */
function loadHexData($q, $r) {
    $filePath = getHexDataPath($q, $r);
    if (file_exists($filePath)) {
        $content = file_get_contents($filePath);
        $data = json_decode($content, true);
        if ($data) {
            return $data;
        }
    }
    
    // Return default structure
    return [
        'player' => [
            'images' => [],
            'notes' => ''
        ],
        'gm' => [
            'images' => [],
            'notes' => ''
        ],
        'editing' => [
            'user' => '',
            'timestamp' => '',
            'section' => ''
        ]
    ];
}

/**
 * Save hex data
 */
function saveHexData($q, $r, $data) {
    $filePath = getHexDataPath($q, $r);
    return file_put_contents($filePath, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX) !== false;
}

/**
 * Handle image upload
 */
function handleImageUpload($q, $r, $section) {
    global $user, $isGM;
    
    // Check permissions
    if ($section === 'gm' && !$isGM) {
        return ['success' => false, 'error' => 'GM access required'];
    }
    
    if (!isset($_FILES['image'])) {
        return ['success' => false, 'error' => 'No image uploaded'];
    }
    
    $file = $_FILES['image'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return ['success' => false, 'error' => 'Upload failed'];
    }
    
    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($file['type'], $allowedTypes)) {
        return ['success' => false, 'error' => 'Invalid file type'];
    }
    
    // Generate unique filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = "hex-{$q}-{$r}-{$section}-" . time() . "-" . rand(1000, 9999) . "." . $extension;
    $filepath = "hex-images/" . $filename;
    
    // Move uploaded file
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        // Add to hex data
        $hexData = loadHexData($q, $r);
        $hexData[$section]['images'][] = [
            'filename' => $filename,
            'original_name' => $file['name'],
            'uploaded_by' => $user,
            'uploaded_at' => date('Y-m-d H:i:s')
        ];
        
        if (saveHexData($q, $r, $hexData)) {
            return ['success' => true, 'filename' => $filename, 'filepath' => $filepath];
        } else {
            unlink($filepath); // Clean up file if save failed
            return ['success' => false, 'error' => 'Failed to save data'];
        }
    }
    
    return ['success' => false, 'error' => 'Failed to move file'];
}

// Handle POST requests
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    
    $action = $_POST['action'] ?? '';
    $q = (int)($_POST['q'] ?? 0);
    $r = (int)($_POST['r'] ?? 0);
    
    switch ($action) {
        case 'load':
            $data = loadHexData($q, $r);
            // Filter GM data for non-GM users
            if (!$isGM) {
                unset($data['gm']);
            }
            echo json_encode(['success' => true, 'data' => $data]);
            break;
            
        case 'save_notes':
            $section = $_POST['section'] ?? '';
            $notes = $_POST['notes'] ?? '';
            
            // Check permissions
            if ($section === 'gm' && !$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }
            
            $hexData = loadHexData($q, $r);
            $hexData[$section]['notes'] = $notes;
            
            if (saveHexData($q, $r, $hexData)) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Failed to save notes']);
            }
            break;
            
        case 'upload_image':
            $section = $_POST['section'] ?? '';
            $result = handleImageUpload($q, $r, $section);
            echo json_encode($result);
            break;
            
        case 'delete_image':
            $section = $_POST['section'] ?? '';
            $filename = $_POST['filename'] ?? '';
            
            // Check permissions
            if ($section === 'gm' && !$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }
            
            $hexData = loadHexData($q, $r);
            $images = &$hexData[$section]['images'];
            
            // Find and remove image
            for ($i = 0; $i < count($images); $i++) {
                if ($images[$i]['filename'] === $filename) {
                    // Delete file
                    $filepath = "hex-images/" . $filename;
                    if (file_exists($filepath)) {
                        unlink($filepath);
                    }
                    
                    // Remove from array
                    array_splice($images, $i, 1);
                    break;
                }
            }
            
            if (saveHexData($q, $r, $hexData)) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Failed to save data']);
            }
            break;
            
        case 'lock_edit':
            $section = $_POST['section'] ?? '';
            
            $hexData = loadHexData($q, $r);
            
            // Check if already locked by someone else
            $currentTime = time();
            $lockTimeout = 300; // 5 minutes
            $existingLock = $hexData['editing'];
            
            if ($existingLock['user'] && $existingLock['user'] !== $user) {
                $lockTime = strtotime($existingLock['timestamp']);
                if ($currentTime - $lockTime < $lockTimeout) {
                    echo json_encode(['success' => false, 'error' => 'Currently being edited by ' . $existingLock['user']]);
                    break;
                }
            }
            
            // Set lock
            $hexData['editing'] = [
                'user' => $user,
                'timestamp' => date('Y-m-d H:i:s'),
                'section' => $section
            ];
            
            if (saveHexData($q, $r, $hexData)) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Failed to set lock']);
            }
            break;
            
        case 'unlock_edit':
            $hexData = loadHexData($q, $r);
            
            // Only allow unlocking if locked by current user or timeout
            $currentTime = time();
            $lockTimeout = 300; // 5 minutes
            $existingLock = $hexData['editing'];
            
            if ($existingLock['user'] === $user || 
                ($existingLock['timestamp'] && $currentTime - strtotime($existingLock['timestamp']) >= $lockTimeout)) {
                
                $hexData['editing'] = [
                    'user' => '',
                    'timestamp' => '',
                    'section' => ''
                ];
                
                if (saveHexData($q, $r, $hexData)) {
                    echo json_encode(['success' => true]);
                } else {
                    echo json_encode(['success' => false, 'error' => 'Failed to unlock']);
                }
            } else {
                echo json_encode(['success' => false, 'error' => 'Cannot unlock - not your lock']);
            }
            break;
            
        case 'get_hex_status':
            $hexStatus = [];
            
            // Scan hex-data directory for files
            $hexDataFiles = glob($hexDataDir . '/hex-*.json');
            
            foreach ($hexDataFiles as $file) {
                $filename = basename($file);
                if (preg_match('/hex-(-?\d+)-(-?\d+)\.json/', $filename, $matches)) {
                    $q = (int)$matches[1];
                    $r = (int)$matches[2];
                    
                    $data = json_decode(file_get_contents($file), true);
                    if ($data) {
                        $hasPlayerData = !empty($data['player']['notes']) || !empty($data['player']['images']);
                        $hasGMData = !empty($data['gm']['notes']) || !empty($data['gm']['images']);
                        
                        // For non-GM users, only show status if there's player data
                        if ($isGM || $hasPlayerData) {
                            $hexStatus["$q,$r"] = [
                                'hasPlayerData' => $hasPlayerData,
                                'hasGMData' => $hasGMData
                            ];
                        }
                    }
                }
            }
            
            echo json_encode(['success' => true, 'hexStatus' => $hexStatus]);
            break;
            
        case 'reset_hex':
            // GM-only action
            if (!$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }
            
            $hexData = loadHexData($q, $r);
            
            // Delete all associated image files
            if (isset($hexData['player']['images'])) {
                foreach ($hexData['player']['images'] as $image) {
                    $filepath = "hex-images/" . $image['filename'];
                    if (file_exists($filepath)) {
                        unlink($filepath);
                    }
                }
            }
            
            if (isset($hexData['gm']['images'])) {
                foreach ($hexData['gm']['images'] as $image) {
                    $filepath = "hex-images/" . $image['filename'];
                    if (file_exists($filepath)) {
                        unlink($filepath);
                    }
                }
            }
            
            // Delete hex data file
            $filePath = getHexDataPath($q, $r);
            if (file_exists($filePath)) {
                unlink($filePath);
            }
            
            echo json_encode(['success' => true]);
            break;
            
        case 'duplicate_hex':
            // GM-only action
            if (!$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }
            
            $sourceQ = (int)($_POST['source_q'] ?? 0);
            $sourceR = (int)($_POST['source_r'] ?? 0);
            $copyImages = ($_POST['copy_images'] ?? 'true') === 'true';
            $copyNotes = ($_POST['copy_notes'] ?? 'true') === 'true';
            $copyPlayerData = ($_POST['copy_player_data'] ?? 'true') === 'true';
            $copyGMData = ($_POST['copy_gm_data'] ?? 'true') === 'true';
            
            // Load source hex data
            $sourceData = loadHexData($sourceQ, $sourceR);
            $targetData = loadHexData($q, $r);
            
            // Copy player data if requested
            if ($copyPlayerData) {
                if ($copyNotes) {
                    $targetData['player']['notes'] = $sourceData['player']['notes'] ?? '';
                }
                
                if ($copyImages && !empty($sourceData['player']['images'])) {
                    foreach ($sourceData['player']['images'] as $image) {
                        // Copy image file
                        $sourceFile = "hex-images/" . $image['filename'];
                        if (file_exists($sourceFile)) {
                            $extension = pathinfo($image['filename'], PATHINFO_EXTENSION);
                            $newFilename = "hex-{$q}-{$r}-player-" . time() . "-" . rand(1000, 9999) . "." . $extension;
                            $targetFile = "hex-images/" . $newFilename;
                            
                            if (copy($sourceFile, $targetFile)) {
                                $newImage = $image;
                                $newImage['filename'] = $newFilename;
                                $newImage['uploaded_by'] = $user;
                                $newImage['uploaded_at'] = date('Y-m-d H:i:s');
                                $targetData['player']['images'][] = $newImage;
                            }
                        }
                    }
                }
            }
            
            // Copy GM data if requested
            if ($copyGMData) {
                if ($copyNotes) {
                    $targetData['gm']['notes'] = $sourceData['gm']['notes'] ?? '';
                }
                
                if ($copyImages && !empty($sourceData['gm']['images'])) {
                    foreach ($sourceData['gm']['images'] as $image) {
                        // Copy image file
                        $sourceFile = "hex-images/" . $image['filename'];
                        if (file_exists($sourceFile)) {
                            $extension = pathinfo($image['filename'], PATHINFO_EXTENSION);
                            $newFilename = "hex-{$q}-{$r}-gm-" . time() . "-" . rand(1000, 9999) . "." . $extension;
                            $targetFile = "hex-images/" . $newFilename;
                            
                            if (copy($sourceFile, $targetFile)) {
                                $newImage = $image;
                                $newImage['filename'] = $newFilename;
                                $newImage['uploaded_by'] = $user;
                                $newImage['uploaded_at'] = date('Y-m-d H:i:s');
                                $targetData['gm']['images'][] = $newImage;
                            }
                        }
                    }
                }
            }
            
            // Save target hex data
            if (saveHexData($q, $r, $targetData)) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Failed to save duplicated data']);
            }
            break;
            
        default:
            echo json_encode(['success' => false, 'error' => 'Invalid action']);
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
}
?>