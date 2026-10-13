<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    echo json_encode(array('success' => false, 'error' => 'Not logged in'));
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Function to load inventory data
function loadInventoryData() {
    $dataFile = '../data/inventory.json';
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data) {
            return $data;
        }
    }
    return array();
}

// Function to save inventory data
function saveInventoryData($data) {
    $dataFile = '../data/inventory.json';
    
    // Ensure data directory exists
    $dataDir = dirname($dataFile);
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0755, true);
    }
    
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    return file_put_contents($dataFile, $jsonData);
}

// Function to check if user can edit a specific tab
function canEditTab($tab, $user, $is_gm) {
    if ($is_gm) return true;
    if ($tab === $user) return true;
    if ($tab === 'shared') return true;
    return false; // GM tab is read-only for players
}

// Handle image upload
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'upload_image') {
    header('Content-Type: application/json');
    
    // Debug logging
    error_log("Image upload started - User: $user, Is GM: " . ($is_gm ? 'true' : 'false'));
    
    $item_id = isset($_POST['item_id']) ? $_POST['item_id'] : '';
    
    if (empty($item_id)) {
        echo json_encode(array('success' => false, 'error' => 'No item ID provided'));
        exit;
    }
    
    // Check if file was uploaded
    if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        $error_msg = 'No file uploaded or upload error';
        if (isset($_FILES['image']['error'])) {
            $error_msg .= ' (Error code: ' . $_FILES['image']['error'] . ')';
        }
        echo json_encode(array('success' => false, 'error' => $error_msg));
        exit;
    }
    
    $uploadedFile = $_FILES['image'];
    
    // Judged by its content, named by the site, stored in a folder that runs nothing (includes/picture-store.php).
    // The item's id used to go into the file's path as it came, the file kept the ending of the uploader's own
    // file name, and either the browser's word or that ending was enough to call it a picture.
    require_once __DIR__ . '/../../includes/picture-store.php';
    $imagesDir = 'images';
    $idPart = PictureStore::namePart($item_id, 100);
    if ($idPart === null) {
        echo json_encode(array('success' => false, 'error' => 'Invalid item.'));
        exit;
    }
    try {
        // (The random part: two uploads for one item inside a second had the same name, and the second then
        // deleted "the old picture", which was itself.)
        $fileName = PictureStore::store($uploadedFile, __DIR__ . '/' . $imagesDir, $idPart . '_' . time() . '_' . bin2hex(random_bytes(4)));
    } catch (InvalidArgumentException $refused) {
        echo json_encode(array('success' => false, 'error' => $refused->getMessage()));
        exit;
    } catch (Throwable $failed) {
        $fileName = '';
    }
    $filePath = $imagesDir . '/' . $fileName;

    if ($fileName !== '') {
        error_log("File uploaded successfully to: $filePath");
        
        // Load current inventory data
        $data = loadInventoryData();
        
        // Find the item and update its image path
        $itemFound = false;
        $itemTab = null;
        
        foreach (array('cal', 'sharon', 'indigo', 'zepha', 'shared', 'gm') as $tab) {
            if (isset($data[$tab]['items'])) {
                foreach ($data[$tab]['items'] as $index => $item) {
                    if ($item['id'] === $item_id) {
                        // Check permissions
                        if (!canEditTab($tab, $user, $is_gm)) {
                            unlink($filePath); // Clean up uploaded file
                            echo json_encode(array('success' => false, 'error' => "Permission denied for tab: $tab (User: $user, Is GM: " . ($is_gm ? 'true' : 'false') . ")"));
                            exit;
                        }
                        
                        // Remove old image file if it exists
                        // Only a picture in this page's own folder: the field holds whatever a request put there.
                        if (!empty($item['image']) && PictureStore::remove(__DIR__ . '/images', $item['image'])) {
                            error_log("Removed old image: " . $item['image']);
                        }
                        
                        // Update item with new image path
                        $data[$tab]['items'][$index]['image'] = $filePath;
                        $itemFound = true;
                        $itemTab = $tab;
                        error_log("Updated item in tab: $tab with image: $filePath");
                        break 2;
                    }
                }
            }
        }
        
        if (!$itemFound) {
            unlink($filePath); // Clean up uploaded file
            echo json_encode(array('success' => false, 'error' => 'Item not found in any tab'));
            exit;
        }
        
        // Save updated data
        if (saveInventoryData($data)) {
            echo json_encode(array(
                'success' => true, 
                'image_path' => $filePath,
                'item_id' => $item_id,
                'tab' => $itemTab,
                'message' => 'Image uploaded successfully'
            ));
        } else {
            // Delete uploaded file if we can't update the data
            unlink($filePath);
            echo json_encode(array('success' => false, 'error' => 'Failed to save image data to inventory'));
        }
    } else {
        echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file to server'));
    }
} else {
    echo json_encode(array('success' => false, 'error' => 'Invalid request method or action'));
}
?>