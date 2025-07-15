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
    
    // Validate file type - EXPLICITLY INCLUDING .webp
    $allowedTypes = array('image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp');
    $fileType = $uploadedFile['type'];
    
    // Additional check for webp since some browsers may not report correct MIME type
    $fileExtension = strtolower(pathinfo($uploadedFile['name'], PATHINFO_EXTENSION));
    $allowedExtensions = array('jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp');
    
    if (!in_array($fileType, $allowedTypes) && !in_array($fileExtension, $allowedExtensions)) {
        echo json_encode(array('success' => false, 'error' => "Invalid file type: $fileType (.$fileExtension). Only JPG, PNG, GIF, BMP, and WebP images are allowed."));
        exit;
    }
    
    // Validate file size (max 5MB)
    $maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if ($uploadedFile['size'] > $maxSize) {
        echo json_encode(array('success' => false, 'error' => 'File too large. Maximum size is 5MB.'));
        exit;
    }
    
    // Create images directory if it doesn't exist
    $imagesDir = 'images';
    if (!is_dir($imagesDir)) {
        if (!mkdir($imagesDir, 0755, true)) {
            echo json_encode(array('success' => false, 'error' => 'Could not create images directory'));
            exit;
        }
    }
    
    // Generate unique filename
    $fileName = $item_id . '_' . time() . '.' . $fileExtension;
    $filePath = $imagesDir . '/' . $fileName;
    
    error_log("Attempting to save file to: $filePath");
    
    // Move uploaded file
    if (move_uploaded_file($uploadedFile['tmp_name'], $filePath)) {
        error_log("File uploaded successfully to: $filePath");
        
        // Load current inventory data
        $data = loadInventoryData();
        
        // Find the item and update its image path
        $itemFound = false;
        $itemTab = null;
        
        foreach (array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm') as $tab) {
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
                        if (!empty($item['image']) && file_exists($item['image'])) {
                            unlink($item['image']);
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