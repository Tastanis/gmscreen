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

// Storing a hex's picture, and deleting or copying one: includes/picture-store.php.
require_once __DIR__ . '/../../includes/picture-store.php';

/**
 * What a result may carry back to whoever asked. A save returns the whole hex record,
 * and for anyone but the GM the GM section must not go with it.
 */
function forViewer($result) {
    global $isGM;
    if (!$isGM && is_array($result) && isset($result['data']) && is_array($result['data'])) {
        unset($result['data']['gm']);
    }
    return $result;
}

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
 * Get the lock file path for a hex (separate from data file to avoid corruption)
 */
function getHexLockPath($q, $r) {
    $lockDir = 'hex-data/locks';
    if (!is_dir($lockDir)) {
        mkdir($lockDir, 0755, true);
    }
    return "$lockDir/hex-{$q}-{$r}.lock";
}

/**
 * Get default hex data structure
 */
function getDefaultHexData() {
    return [
        'player' => [
            'title' => '',
            'images' => [],
            'notes' => ''
        ],
        'gm' => [
            'title' => '',
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
 * Load hex data (for read-only use, e.g. 'load' action)
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
    return getDefaultHexData();
}

/**
 * Safely modify hex data with file locking.
 * Locks, reads, calls $modifyFn to apply changes, then writes and unlocks.
 * This prevents race conditions where two operations read stale data
 * and one overwrites the other's changes.
 *
 * @param int $q Hex q coordinate
 * @param int $r Hex r coordinate
 * @param callable $modifyFn Function that receives hex data array and returns modified array
 * @return array ['success' => bool, 'data' => array|null, 'error' => string|null]
 */
function lockedModifyHexData($q, $r, $modifyFn) {
    $lockPath = getHexLockPath($q, $r);
    $dataPath = getHexDataPath($q, $r);

    $lockFp = fopen($lockPath, 'c');
    if (!$lockFp) {
        return ['success' => false, 'error' => 'Could not open lock file'];
    }

    // Block until we get an exclusive lock
    if (!flock($lockFp, LOCK_EX)) {
        fclose($lockFp);
        return ['success' => false, 'error' => 'Could not acquire lock'];
    }

    try {
        // Read current data while holding the lock
        $hexData = getDefaultHexData();
        if (file_exists($dataPath)) {
            $content = file_get_contents($dataPath);
            $decoded = json_decode($content, true);
            if ($decoded) {
                $hexData = $decoded;
            }
        }

        // Apply the modification
        $modified = $modifyFn($hexData);

        // Write back while still holding the lock
        $written = file_put_contents($dataPath, json_encode($modified, JSON_PRETTY_PRINT));

        flock($lockFp, LOCK_UN);
        fclose($lockFp);

        if ($written === false) {
            return ['success' => false, 'error' => 'Failed to write hex data'];
        }

        return ['success' => true, 'data' => $modified];
    } catch (Exception $e) {
        flock($lockFp, LOCK_UN);
        fclose($lockFp);
        return ['success' => false, 'error' => 'Error modifying hex data: ' . $e->getMessage()];
    }
}

/**
 * Save hex data (only used for operations that already hold their own lock,
 * like reset_hex which deletes the file, or duplicate_hex)
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
    
    if ($section !== 'player' && $section !== 'gm') {
        return ['success' => false, 'error' => 'Invalid section'];
    }

    // Judged by its content, named by the site, stored in a folder that runs nothing. The file used to keep the
    // ending of the uploader's own file name, the browser's word that it was a picture was enough, and the
    // section went into the file's name as it came.
    $filename = '';
    try {
        $filename = PictureStore::store($file, __DIR__ . '/hex-images', "hex-{$q}-{$r}-{$section}-" . time() . '-' . rand(1000, 9999), 25 * 1024 * 1024);
    } catch (InvalidArgumentException $refused) {
        return ['success' => false, 'error' => $refused->getMessage()];
    } catch (Throwable $failed) {
        $filename = '';
    }
    $filepath = "hex-images/" . $filename;

    if ($filename !== '') {
        // Add to hex data using locked modify to prevent race conditions
        $imageEntry = [
            'filename' => $filename,
            'original_name' => $file['name'],
            'uploaded_by' => $user,
            'uploaded_at' => date('Y-m-d H:i:s')
        ];

        $result = lockedModifyHexData($q, $r, function($hexData) use ($section, $imageEntry) {
            $hexData[$section]['images'][] = $imageEntry;
            return $hexData;
        });

        if ($result['success']) {
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

            $result = lockedModifyHexData($q, $r, function($hexData) use ($section, $notes) {
                $hexData[$section]['notes'] = $notes;
                return $hexData;
            });
            echo json_encode(forViewer($result));
            break;

        case 'save_title':
            $section = $_POST['section'] ?? '';
            $title = $_POST['title'] ?? '';

            // Check permissions
            if ($section === 'gm' && !$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }

            $result = lockedModifyHexData($q, $r, function($hexData) use ($section, $title) {
                $hexData[$section]['title'] = $title;
                return $hexData;
            });
            echo json_encode(forViewer($result));
            break;

        case 'save_all':
            // Save title and notes for player (and gm if GM user) in a single locked operation.
            // This replaces the old pattern of 4 separate save calls that could race with each other.
            $playerTitle = $_POST['player_title'] ?? null;
            $playerNotes = $_POST['player_notes'] ?? null;
            $gmTitle = $_POST['gm_title'] ?? null;
            $gmNotes = $_POST['gm_notes'] ?? null;

            $result = lockedModifyHexData($q, $r, function($hexData) use ($isGM, $playerTitle, $playerNotes, $gmTitle, $gmNotes) {
                if ($playerTitle !== null) {
                    $hexData['player']['title'] = $playerTitle;
                }
                if ($playerNotes !== null) {
                    $hexData['player']['notes'] = $playerNotes;
                }
                if ($isGM) {
                    if ($gmTitle !== null) {
                        $hexData['gm']['title'] = $gmTitle;
                    }
                    if ($gmNotes !== null) {
                        $hexData['gm']['notes'] = $gmNotes;
                    }
                }
                return $hexData;
            });
            echo json_encode(forViewer($result));
            break;
            
        case 'upload_image':
            $section = $_POST['section'] ?? '';
            $result = handleImageUpload($q, $r, $section);
            echo json_encode(forViewer($result));
            break;

        case 'share_gm_images':
            if (!$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }

            $sharedFiles = [];
            $result = lockedModifyHexData($q, $r, function($hexData) use (&$sharedFiles) {
                $gmImages = [];
                if (isset($hexData['gm']['images']) && is_array($hexData['gm']['images'])) {
                    $gmImages = $hexData['gm']['images'];
                }

                if (count($gmImages) === 0) {
                    return $hexData; // Nothing to share
                }

                $playerImages = [];
                if (isset($hexData['player']['images']) && is_array($hexData['player']['images'])) {
                    $playerImages = $hexData['player']['images'];
                }

                $existing = [];
                foreach ($playerImages as $image) {
                    if (is_array($image) && isset($image['filename'])) {
                        $existing[$image['filename']] = true;
                    }
                }

                foreach ($gmImages as $image) {
                    if (!is_array($image) || !isset($image['filename'])) {
                        continue;
                    }
                    $filename = $image['filename'];
                    if (isset($existing[$filename])) {
                        continue;
                    }
                    $sharedImage = $image;
                    $sharedImage['shared_from'] = 'gm';
                    $playerImages[] = $sharedImage;
                    $existing[$filename] = true;
                    $sharedFiles[] = $filename;
                }

                $hexData['player']['images'] = $playerImages;
                return $hexData;
            });

            if ($result['success']) {
                echo json_encode(['success' => true, 'shared' => $sharedFiles]);
            } else {
                echo json_encode(['success' => false, 'error' => $result['error'] ?? 'Failed to share GM images.']);
            }
            break;

        case 'unshare_gm_images':
            // GM-only: stop showing the GM's images to players. Only the shared copies in the
            // player list are removed; the image files and the GM's own list are left alone.
            if (!$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }
            $result = lockedModifyHexData($q, $r, function($hexData) {
                if (isset($hexData['player']['images']) && is_array($hexData['player']['images'])) {
                    $hexData['player']['images'] = array_values(array_filter(
                        $hexData['player']['images'],
                        function ($image) {
                            return !(is_array($image) && isset($image['shared_from']) && $image['shared_from'] === 'gm');
                        }
                    ));
                }
                return $hexData;
            });
            echo json_encode(['success' => $result['success'], 'error' => $result['error'] ?? null]);
            break;

        case 'delete_image':
            $section = $_POST['section'] ?? '';
            $filename = $_POST['filename'] ?? '';

            // Check permissions
            if ($section === 'gm' && !$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }
            if ($section !== 'player' && $section !== 'gm') {
                echo json_encode(['success' => false, 'error' => 'Invalid section']);
                break;
            }

            $result = lockedModifyHexData($q, $r, function($hexData) use ($section, $filename) {
                $images = $hexData[$section]['images'] ?? [];

                // Find and remove image
                for ($i = 0; $i < count($images); $i++) {
                    if ($images[$i]['filename'] === $filename) {
                        // Delete the file: one of this page's own pictures only, and not while the GM's list
                        // still shows it. (A picture the GM shared sits in the players' list under the same file
                        // name, and a player taking it off that list used to delete the GM's file.)
                        $gmStillHas = $section !== 'gm' && in_array($filename, array_column(array_filter($hexData['gm']['images'] ?? [], 'is_array'), 'filename'), true);
                        if (!$gmStillHas) {
                            PictureStore::remove(__DIR__ . '/hex-images', $filename);
                        }

                        // Remove from array
                        array_splice($images, $i, 1);
                        $hexData[$section]['images'] = $images;

                        // If deleting a GM image, also remove shared copies from player section
                        if ($section === 'gm' && isset($hexData['player']['images']) && is_array($hexData['player']['images'])) {
                            $hexData['player']['images'] = array_values(array_filter(
                                $hexData['player']['images'],
                                function ($playerImage) use ($filename) {
                                    if (!is_array($playerImage)) {
                                        return false;
                                    }
                                    if (!isset($playerImage['filename'])) {
                                        return true;
                                    }
                                    if ($playerImage['filename'] !== $filename) {
                                        return true;
                                    }
                                    if (isset($playerImage['shared_from']) && $playerImage['shared_from'] === 'gm') {
                                        return false;
                                    }
                                    return true;
                                }
                            ));
                        }
                        break;
                    }
                }

                return $hexData;
            });
            echo json_encode(forViewer($result));
            break;
            
        case 'lock_edit':
            $section = $_POST['section'] ?? '';
            $lockError = null;

            $result = lockedModifyHexData($q, $r, function($hexData) use ($user, $section, &$lockError) {
                $currentTime = time();
                $lockTimeout = 300; // 5 minutes
                $existingLock = $hexData['editing'] ?? ['user' => '', 'timestamp' => '', 'section' => ''];

                if ($existingLock['user'] && $existingLock['user'] !== $user) {
                    $lockTime = strtotime($existingLock['timestamp']);
                    if ($currentTime - $lockTime < $lockTimeout) {
                        $lockError = 'Currently being edited by ' . $existingLock['user'];
                        return $hexData; // Return unchanged
                    }
                }

                $hexData['editing'] = [
                    'user' => $user,
                    'timestamp' => date('Y-m-d H:i:s'),
                    'section' => $section
                ];
                return $hexData;
            });

            if ($lockError) {
                echo json_encode(['success' => false, 'error' => $lockError]);
            } else {
                echo json_encode(forViewer($result));
            }
            break;

        case 'unlock_edit':
            $unlockError = null;

            $result = lockedModifyHexData($q, $r, function($hexData) use ($user, &$unlockError) {
                $currentTime = time();
                $lockTimeout = 300; // 5 minutes
                $existingLock = $hexData['editing'] ?? ['user' => '', 'timestamp' => '', 'section' => ''];

                if ($existingLock['user'] === $user ||
                    ($existingLock['timestamp'] && $currentTime - strtotime($existingLock['timestamp']) >= $lockTimeout)) {
                    $hexData['editing'] = [
                        'user' => '',
                        'timestamp' => '',
                        'section' => ''
                    ];
                } else {
                    $unlockError = 'Cannot unlock - not your lock';
                }
                return $hexData;
            });

            if ($unlockError) {
                echo json_encode(['success' => false, 'error' => $unlockError]);
            } else {
                echo json_encode(forViewer($result));
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
                        $hasPlayerData = !empty($data['player']['title']) || !empty($data['player']['notes']) || !empty($data['player']['images']);
                        $hasGMData = !empty($data['gm']['title']) || !empty($data['gm']['notes']) || !empty($data['gm']['images']);
                        
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
            
        case 'get_all_hex_data':
            // Get basic data for all hexes (for tooltips)
            $allHexData = [];
            $hexDataFiles = glob($hexDataDir . '/hex-*.json');
            
            foreach ($hexDataFiles as $file) {
                $filename = basename($file);
                if (preg_match('/hex-(-?\d+)-(-?\d+)\.json/', $filename, $matches)) {
                    $q = (int)$matches[1];
                    $r = (int)$matches[2];
                    $coords = "$q,$r";
                    
                    $data = json_decode(file_get_contents($file), true);
                    if ($data) {
                        $hexInfo = [];
                        
                        // Include player data if it exists
                        if (!empty($data['player']['title']) || !empty($data['player']['images'])) {
                            $hexInfo['player'] = [
                                'title' => $data['player']['title'] ?? '',
                                'firstImage' => !empty($data['player']['images']) ? $data['player']['images'][0]['filename'] : null
                            ];
                        }
                        
                        // Include GM data only for GM users
                        if ($isGM && (!empty($data['gm']['title']) || !empty($data['gm']['images']))) {
                            $hexInfo['gm'] = [
                                'title' => $data['gm']['title'] ?? '',
                                'firstImage' => !empty($data['gm']['images']) ? $data['gm']['images'][0]['filename'] : null
                            ];
                        }
                        
                        if (!empty($hexInfo)) {
                            $allHexData[$coords] = $hexInfo;
                        }
                    }
                }
            }
            
            echo json_encode(['success' => true, 'hexData' => $allHexData]);
            break;
            
        case 'reset_hex':
            // GM-only action
            if (!$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }

            // Lock the hex before resetting to prevent concurrent modifications
            $lockPath = getHexLockPath($q, $r);
            $lockFp = fopen($lockPath, 'c');
            if ($lockFp && flock($lockFp, LOCK_EX)) {
                $hexData = loadHexData($q, $r);

                // Delete all associated image files
                if (isset($hexData['player']['images'])) {
                    foreach ($hexData['player']['images'] as $image) {
                        PictureStore::remove(__DIR__ . '/hex-images', $image['filename'] ?? '');
                    }
                }

                if (isset($hexData['gm']['images'])) {
                    foreach ($hexData['gm']['images'] as $image) {
                        PictureStore::remove(__DIR__ . '/hex-images', $image['filename'] ?? '');
                    }
                }

                // Delete hex data file
                $filePath = getHexDataPath($q, $r);
                if (file_exists($filePath)) {
                    unlink($filePath);
                }

                flock($lockFp, LOCK_UN);
                fclose($lockFp);
                echo json_encode(['success' => true]);
            } else {
                if ($lockFp) fclose($lockFp);
                echo json_encode(['success' => false, 'error' => 'Could not acquire lock for reset']);
            }
            break;
            
        case 'duplicate_hex':
            // GM-only action
            if (!$isGM) {
                echo json_encode(['success' => false, 'error' => 'GM access required']);
                break;
            }

            $sourceQ = (int)($_POST['source_q'] ?? 0);
            $sourceR = (int)($_POST['source_r'] ?? 0);
            $copyPlayerNotes = ($_POST['copy_player_notes'] ?? 'true') === 'true';
            $copyPlayerImages = ($_POST['copy_player_images'] ?? 'true') === 'true';
            $copyPlayerData = ($_POST['copy_player_data'] ?? 'true') === 'true';
            $copyGMNotes = ($_POST['copy_gm_notes'] ?? 'true') === 'true';
            $copyGMImages = ($_POST['copy_gm_images'] ?? 'true') === 'true';
            $copyGMData = ($_POST['copy_gm_data'] ?? 'true') === 'true';

            // Lock source (read) then target (write) to prevent concurrent modifications.
            // Always lock in coordinate order to prevent deadlocks.
            $firstQ = $sourceQ; $firstR = $sourceR;
            $secondQ = $q; $secondR = $r;
            if ($sourceQ > $q || ($sourceQ === $q && $sourceR > $r)) {
                $firstQ = $q; $firstR = $r;
                $secondQ = $sourceQ; $secondR = $sourceR;
            }

            $lock1Path = getHexLockPath($firstQ, $firstR);
            $lock2Path = getHexLockPath($secondQ, $secondR);
            $lock1Fp = fopen($lock1Path, 'c');
            $lock2Fp = fopen($lock2Path, 'c');

            if (!$lock1Fp || !flock($lock1Fp, LOCK_EX)) {
                if ($lock1Fp) fclose($lock1Fp);
                if ($lock2Fp) fclose($lock2Fp);
                echo json_encode(['success' => false, 'error' => 'Could not acquire lock']);
                break;
            }
            if (!$lock2Fp || !flock($lock2Fp, LOCK_EX)) {
                flock($lock1Fp, LOCK_UN); fclose($lock1Fp);
                if ($lock2Fp) fclose($lock2Fp);
                echo json_encode(['success' => false, 'error' => 'Could not acquire lock']);
                break;
            }

            $sourceData = loadHexData($sourceQ, $sourceR);
            $targetData = loadHexData($q, $r);

            if (!isset($targetData['player']) || !is_array($targetData['player'])) {
                $targetData['player'] = ['title' => '', 'notes' => '', 'images' => []];
            }
            if (!isset($targetData['gm']) || !is_array($targetData['gm'])) {
                $targetData['gm'] = ['title' => '', 'notes' => '', 'images' => []];
            }

            // Copy player data if requested
            if ($copyPlayerData) {
                $targetData['player']['title'] = $sourceData['player']['title'] ?? '';

                if ($copyPlayerNotes) {
                    $targetData['player']['notes'] = $sourceData['player']['notes'] ?? '';
                }

                if ($copyPlayerImages) {
                    $existingPlayerImages = $targetData['player']['images'] ?? [];
                    $copiedPlayerImages = [];

                    foreach ($sourceData['player']['images'] ?? [] as $image) {
                        $sourceFile = PictureStore::owned(__DIR__ . '/hex-images', $image['filename'] ?? '');
                        if ($sourceFile === null) {
                            continue;
                        }

                        $extension = pathinfo($image['filename'], PATHINFO_EXTENSION);
                        $newFilename = "hex-{$q}-{$r}-player-" . time() . "-" . rand(1000, 9999) . "." . $extension;
                        $targetFile = "hex-images/" . $newFilename;

                        if (copy($sourceFile, $targetFile)) {
                            $newImage = $image;
                            $newImage['filename'] = $newFilename;
                            $newImage['uploaded_by'] = $user;
                            $newImage['uploaded_at'] = date('Y-m-d H:i:s');
                            $copiedPlayerImages[] = $newImage;
                        }
                    }

                    foreach ($existingPlayerImages as $image) {
                        $existingFilename = $image['filename'] ?? '';
                        if (!$existingFilename) continue;
                        if (($image['shared_from'] ?? '') === 'gm') continue;
                        PictureStore::remove(__DIR__ . '/hex-images', $existingFilename);
                    }

                    $targetData['player']['images'] = $copiedPlayerImages;
                }
            }

            // Copy GM data if requested
            if ($copyGMData) {
                $targetData['gm']['title'] = $sourceData['gm']['title'] ?? '';

                if ($copyGMNotes) {
                    $targetData['gm']['notes'] = $sourceData['gm']['notes'] ?? '';
                }

                if ($copyGMImages) {
                    $existingGMImages = $targetData['gm']['images'] ?? [];
                    $copiedGMImages = [];

                    foreach ($sourceData['gm']['images'] ?? [] as $image) {
                        $sourceFile = PictureStore::owned(__DIR__ . '/hex-images', $image['filename'] ?? '');
                        if ($sourceFile === null) {
                            continue;
                        }

                        $extension = pathinfo($image['filename'], PATHINFO_EXTENSION);
                        $newFilename = "hex-{$q}-{$r}-gm-" . time() . "-" . rand(1000, 9999) . "." . $extension;
                        $targetFile = "hex-images/" . $newFilename;

                        if (copy($sourceFile, $targetFile)) {
                            $newImage = $image;
                            $newImage['filename'] = $newFilename;
                            $newImage['uploaded_by'] = $user;
                            $newImage['uploaded_at'] = date('Y-m-d H:i:s');
                            $copiedGMImages[] = $newImage;
                        }
                    }

                    foreach ($existingGMImages as $image) {
                        $existingFilename = $image['filename'] ?? '';
                        if (!$existingFilename) continue;
                        PictureStore::remove(__DIR__ . '/hex-images', $existingFilename);
                    }

                    $targetData['gm']['images'] = $copiedGMImages;
                }
            }

            // Save target hex data while still holding locks
            if (saveHexData($q, $r, $targetData)) {
                flock($lock1Fp, LOCK_UN); fclose($lock1Fp);
                flock($lock2Fp, LOCK_UN); fclose($lock2Fp);
                echo json_encode(['success' => true]);
            } else {
                flock($lock1Fp, LOCK_UN); fclose($lock1Fp);
                flock($lock2Fp, LOCK_UN); fclose($lock2Fp);
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