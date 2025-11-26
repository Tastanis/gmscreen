<?php
// This file handles inventory-related AJAX requests
// It should be included from dashboard.php when needed
// Note: dashboard.php already has loadInventoryData() function
// We need to add saveInventoryData() function here since it's not in dashboard.php

// Function to save inventory data
function saveInventoryData($data) {
    $dataFile = 'data/inventory.json';
    
    // Ensure data directory exists
    if (!is_dir('data')) {
        mkdir('data', 0755, true);
    }
    
    $jsonData = json_encode($data, JSON_PRETTY_PRINT);
    return file_put_contents($dataFile, $jsonData);
}

// Generate a unique inventory item ID
function generateInventoryItemId() {
    return 'item_' . time() . '_' . substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 9);
}

// Build a map of image usage counts across all inventory items
function getInventoryImageUsage($data) {
    $usage = array();

    foreach ($data as $tab) {
        if (!isset($tab['items']) || !is_array($tab['items'])) {
            continue;
        }

        foreach ($tab['items'] as $item) {
            if (!empty($item['image'])) {
                $path = $item['image'];
                if (!isset($usage[$path])) {
                    $usage[$path] = 0;
                }
                $usage[$path]++;
            }
        }
    }

    return $usage;
}

// Delete an inventory image file if no items reference it
function deleteInventoryImageIfUnused($data, $imagePath) {
    if (empty($imagePath)) {
        return;
    }

    $usage = getInventoryImageUsage($data);

    if (!isset($usage[$imagePath]) || $usage[$imagePath] === 0) {
        if (file_exists($imagePath)) {
            unlink($imagePath);
        }
    }
}

// Function to check if user can edit a specific inventory tab
function canEditInventoryTab($tab, $user, $is_gm) {
    if ($is_gm) return true;
    if ($tab === $user) return true;
    if ($tab === 'shared') return true;
    return false; // GM tab is read-only for players
}

// Remove the "inventory_" prefix from action name for processing
$inventory_action = substr($_POST['action'], 10); // Remove "inventory_" prefix

switch ($inventory_action) {
    case 'load':
        $data = loadInventoryData();
        echo json_encode(array('success' => true, 'data' => $data));
        break;
        
    case 'save_item':
        $tab = isset($_POST['tab']) ? $_POST['tab'] : '';
        $index = isset($_POST['index']) ? intval($_POST['index']) : -1;
        $item_data = isset($_POST['item_data']) ? json_decode($_POST['item_data'], true) : null;
        
        // Validate tab and permissions
        if (!in_array($tab, array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm'))) {
            echo json_encode(array('success' => false, 'error' => 'Invalid tab'));
            break;
        }
        
        if (!canEditInventoryTab($tab, $user, $is_gm)) {
            echo json_encode(array('success' => false, 'error' => 'Permission denied'));
            break;
        }
        
        if ($item_data === null || $index < 0) {
            echo json_encode(array('success' => false, 'error' => 'Invalid item data'));
            break;
        }
        
        // Load current data
        $data = loadInventoryData();
        
        // Ensure tab structure exists
        if (!isset($data[$tab])) {
            $data[$tab] = array('items' => array());
        }
        if (!isset($data[$tab]['items'])) {
            $data[$tab]['items'] = array();
        }
        
        // Validate item data structure
        $required_fields = array('id', 'name', 'description', 'keywords', 'effect');
        foreach ($required_fields as $field) {
            if (!isset($item_data[$field])) {
                $item_data[$field] = '';
            }
        }
        
        // Ensure grid position fields exist
        if (!isset($item_data['grid_x'])) $item_data['grid_x'] = 0;
        if (!isset($item_data['grid_y'])) $item_data['grid_y'] = 0;
        if (!isset($item_data['image'])) $item_data['image'] = '';
        
        // Ensure visibility field exists (default to true for new items)
        if (!isset($item_data['visible'])) {
            $item_data['visible'] = true;
        } else {
            // Ensure it's a boolean
            $item_data['visible'] = (bool)$item_data['visible'];
        }
        
        // Clean up the item data to only include the fields we want
        $clean_item_data = array();
        $allowed_fields = array('id', 'name', 'description', 'keywords', 'effect', 'image', 'grid_x', 'grid_y', 'visible');
        foreach ($allowed_fields as $field) {
            if (isset($item_data[$field])) {
                $clean_item_data[$field] = $item_data[$field];
            }
        }
        
        // Update or add item
        if ($index < count($data[$tab]['items'])) {
            // Update existing item
            $data[$tab]['items'][$index] = $clean_item_data;
        } else {
            // Add new item
            $data[$tab]['items'][] = $clean_item_data;
        }
        
        // Save to file
        if (saveInventoryData($data)) {
            echo json_encode(array('success' => true));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
        }
        break;
        
    case 'delete_item':
        $tab = isset($_POST['tab']) ? $_POST['tab'] : '';
        $index = isset($_POST['index']) ? intval($_POST['index']) : -1;
        
        // Validate tab and permissions
        if (!in_array($tab, array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm'))) {
            echo json_encode(array('success' => false, 'error' => 'Invalid tab'));
            break;
        }
        
        if (!canEditInventoryTab($tab, $user, $is_gm)) {
            echo json_encode(array('success' => false, 'error' => 'Permission denied'));
            break;
        }
        
        if ($index < 0) {
            echo json_encode(array('success' => false, 'error' => 'Invalid index'));
            break;
        }
        
        // Load current data
        $data = loadInventoryData();
        
        // Check if item exists
        if (!isset($data[$tab]['items'][$index])) {
            echo json_encode(array('success' => false, 'error' => 'Item not found'));
            break;
        }
        
        // Get item data for cleanup
        $item = $data[$tab]['items'][$index];
        
        // Remove item from array
        array_splice($data[$tab]['items'], $index, 1);
        
        // Save to file
        if (saveInventoryData($data)) {
            deleteInventoryImageIfUnused($data, $item['image']);
            echo json_encode(array('success' => true));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
        }
        break;

    case 'duplicate_item':
        $tab = isset($_POST['tab']) ? $_POST['tab'] : '';
        $index = isset($_POST['index']) ? intval($_POST['index']) : -1;

        if (!$is_gm) {
            echo json_encode(array('success' => false, 'error' => 'Only GM can duplicate items'));
            break;
        }

        if (!in_array($tab, array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm'))) {
            echo json_encode(array('success' => false, 'error' => 'Invalid tab'));
            break;
        }

        if ($index < 0) {
            echo json_encode(array('success' => false, 'error' => 'Invalid index'));
            break;
        }

        $data = loadInventoryData();

        if (!isset($data[$tab]['items'][$index])) {
            echo json_encode(array('success' => false, 'error' => 'Item not found'));
            break;
        }

        $original_item = $data[$tab]['items'][$index];

        $new_item = $original_item;
        $new_item['id'] = generateInventoryItemId();

        // Ensure required fields exist
        $field_defaults = array(
            'name' => '',
            'description' => '',
            'keywords' => '',
            'effect' => '',
            'image' => '',
            'grid_x' => 0,
            'grid_y' => 0,
            'visible' => true
        );
        foreach ($field_defaults as $field => $default) {
            if (!isset($new_item[$field])) {
                $new_item[$field] = $default;
            }
        }
        $new_item['visible'] = isset($new_item['visible']) ? (bool)$new_item['visible'] : true;

        if (!isset($data[$tab]['items']) || !is_array($data[$tab]['items'])) {
            $data[$tab]['items'] = array();
        }

        $data[$tab]['items'][] = $new_item;

        if (saveInventoryData($data)) {
            echo json_encode(array(
                'success' => true,
                'new_item' => $new_item,
                'tab' => $tab
            ));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to duplicate item'));
        }
        break;
        
    case 'update_item_field':
        $tab = isset($_POST['tab']) ? $_POST['tab'] : '';
        $index = isset($_POST['index']) ? intval($_POST['index']) : -1;
        $field = isset($_POST['field']) ? $_POST['field'] : '';
        $value = isset($_POST['value']) ? $_POST['value'] : '';
        
        // Validate tab and permissions
        if (!in_array($tab, array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm'))) {
            echo json_encode(array('success' => false, 'error' => 'Invalid tab'));
            break;
        }
        
        if (!canEditInventoryTab($tab, $user, $is_gm)) {
            echo json_encode(array('success' => false, 'error' => 'Permission denied'));
            break;
        }
        
        if ($index < 0 || empty($field)) {
            echo json_encode(array('success' => false, 'error' => 'Invalid parameters'));
            break;
        }
        
        // Only allow updating the fields we want to keep
        $allowed_fields = array('name', 'description', 'keywords', 'effect', 'visible', 'grid_x', 'grid_y', 'image');
        if (!in_array($field, $allowed_fields)) {
            echo json_encode(array('success' => false, 'error' => 'Field not allowed'));
            break;
        }
        
        // Load current data
        $data = loadInventoryData();
        
        // Check if item exists
        if (!isset($data[$tab]['items'][$index])) {
            echo json_encode(array('success' => false, 'error' => 'Item not found'));
            break;
        }
        
        // Handle special fields
        if ($field === 'visible') {
            // Convert string values to proper boolean
            if ($value === 'true' || $value === '1' || $value === 1 || $value === true) {
                $value = true;
            } else {
                $value = false;
            }
        }
        
        // Update field
        $data[$tab]['items'][$index][$field] = $value;
        
        // Save to file
        if (saveInventoryData($data)) {
            echo json_encode(array('success' => true));
        } else {
            echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
        }
        break;
        
    case 'share_item':
        $from_tab = isset($_POST['from_tab']) ? $_POST['from_tab'] : '';
        $to_tab = isset($_POST['to_tab']) ? $_POST['to_tab'] : '';
        $index = isset($_POST['index']) ? intval($_POST['index']) : -1;
        
        // Validate source tab (must be player's own tab)
        if (!in_array($from_tab, array('frunk', 'sharon', 'indigo', 'zepha'))) {
            echo json_encode(array('success' => false, 'error' => 'Can only share from personal inventory'));
            break;
        }
        
        // Validate that user owns the source tab
        if (!$is_gm && $from_tab !== $user) {
            echo json_encode(array('success' => false, 'error' => 'Can only share from your own inventory'));
            break;
        }
        
        // Validate target tab
        if (!in_array($to_tab, array('shared', 'gm'))) {
            echo json_encode(array('success' => false, 'error' => 'Can only share to shared or GM folder'));
            break;
        }
        
        // For non-GM users, only allow sharing to shared folder
        if (!$is_gm && $to_tab !== 'shared') {
            echo json_encode(array('success' => false, 'error' => 'Players can only share to shared folder'));
            break;
        }
        
        if ($index < 0) {
            echo json_encode(array('success' => false, 'error' => 'Invalid index'));
            break;
        }
        
        // Load current data
        $data = loadInventoryData();
        
        // Check if source item exists
        if (!isset($data[$from_tab]['items'][$index])) {
            echo json_encode(array('success' => false, 'error' => 'Item not found'));
            break;
        }
        
        // Get the item to copy
        $original_item = $data[$from_tab]['items'][$index];
        
        // Create a copy with new ID
        $new_item = $original_item;
        $new_item['id'] = generateInventoryItemId();
        $new_item['grid_x'] = 0;
        $new_item['grid_y'] = 0;
        $new_item['image'] = (!empty($original_item['image']) && file_exists($original_item['image'])) ? $original_item['image'] : '';
        
        // Ensure target tab structure exists
        if (!isset($data[$to_tab])) {
            $data[$to_tab] = array('items' => array());
        }
        if (!isset($data[$to_tab]['items'])) {
            $data[$to_tab]['items'] = array();
        }
        
        // Add to target folder and save before mutating source
        $data_with_new_item = $data;
        $data_with_new_item[$to_tab]['items'][] = $new_item;

        if (!saveInventoryData($data_with_new_item)) {
            echo json_encode(array('success' => false, 'error' => 'Failed to save data when adding shared item'));
            break;
        }

        // Remove from original location only after the new item has been persisted
        $final_data = $data_with_new_item;
        array_splice($final_data[$from_tab]['items'], $index, 1);

        // Save to file
        if (saveInventoryData($final_data)) {
            deleteInventoryImageIfUnused($final_data, $original_item['image']);

            echo json_encode(array(
                'success' => true,
                'new_item' => $new_item,
                'to_tab' => $to_tab
            ));
        } else {
            // Attempt to rollback to the state where both items are present to prevent data loss
            saveInventoryData($data_with_new_item);
            echo json_encode(array('success' => false, 'error' => 'Failed to remove item from original tab after sharing'));
        }
        break;
        
    case 'take_item':
        $from_tab = isset($_POST['from_tab']) ? $_POST['from_tab'] : '';
        $index = isset($_POST['index']) ? intval($_POST['index']) : -1;
        $to_tab = $user; // Player's own tab
        
        // Validate that user is not GM (GMs don't need to take items)
        if ($is_gm) {
            echo json_encode(array('success' => false, 'error' => 'GMs cannot take items'));
            break;
        }
        
        // Validate source tab (only GM and shared sections)
        if (!in_array($from_tab, array('gm', 'shared'))) {
            echo json_encode(array('success' => false, 'error' => 'Can only take items from GM or shared sections'));
            break;
        }
        
        // Validate target tab
        if (!in_array($to_tab, array('frunk', 'sharon', 'indigo', 'zepha'))) {
            echo json_encode(array('success' => false, 'error' => 'Invalid target tab'));
            break;
        }
        
        if ($index < 0) {
            echo json_encode(array('success' => false, 'error' => 'Invalid index'));
            break;
        }
        
        // Load current data
        $data = loadInventoryData();
        
        // Check if source item exists
        if (!isset($data[$from_tab]['items'][$index])) {
            echo json_encode(array('success' => false, 'error' => 'Item not found'));
            break;
        }
        
        // Get the item to copy
        $original_item = $data[$from_tab]['items'][$index];
        
        // Create a copy with new ID
        $new_item = $original_item;
        $new_item['id'] = generateInventoryItemId();
        $new_item['grid_x'] = 0;
        $new_item['grid_y'] = 0;
        $new_item['image'] = (!empty($original_item['image']) && file_exists($original_item['image'])) ? $original_item['image'] : '';
        
        // Ensure target tab structure exists
        if (!isset($data[$to_tab])) {
            $data[$to_tab] = array('items' => array());
        }
        if (!isset($data[$to_tab]['items'])) {
            $data[$to_tab]['items'] = array();
        }
        
        // Add to player's inventory and save before mutating source
        $data_with_new_item = $data;
        $data_with_new_item[$to_tab]['items'][] = $new_item;

        if (!saveInventoryData($data_with_new_item)) {
            echo json_encode(array('success' => false, 'error' => 'Failed to save data when adding taken item'));
            break;
        }

        // Remove from original location only after the new item has been persisted
        $final_data = $data_with_new_item;
        array_splice($final_data[$from_tab]['items'], $index, 1);

        // Save to file
        if (saveInventoryData($final_data)) {
            deleteInventoryImageIfUnused($final_data, $original_item['image']);

            echo json_encode(array(
                'success' => true,
                'new_item' => $new_item,
                'to_tab' => $to_tab
            ));
        } else {
            // Attempt to rollback to the state where both items are present to prevent data loss
            saveInventoryData($data_with_new_item);
            echo json_encode(array('success' => false, 'error' => 'Failed to remove item from source tab after taking'));
        }
        break;
        
    case 'upload_image':
        $item_id = isset($_POST['item_id']) ? $_POST['item_id'] : '';
        
        if (empty($item_id)) {
            echo json_encode(array('success' => false, 'error' => 'No item ID provided'));
            break;
        }
        
        // Check if file was uploaded
        if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            $error_msg = 'No file uploaded or upload error';
            if (isset($_FILES['image']['error'])) {
                $error_msg .= ' (Error code: ' . $_FILES['image']['error'] . ')';
            }
            echo json_encode(array('success' => false, 'error' => $error_msg));
            break;
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
            break;
        }
        
        // Validate file size (max 5MB)
        $maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if ($uploadedFile['size'] > $maxSize) {
            echo json_encode(array('success' => false, 'error' => 'File too large. Maximum size is 5MB.'));
            break;
        }
        
        // Create images directory if it doesn't exist
        $imagesDir = 'images';
        if (!is_dir($imagesDir)) {
            if (!mkdir($imagesDir, 0755, true)) {
                echo json_encode(array('success' => false, 'error' => 'Could not create images directory'));
                break;
            }
        }
        
        // Generate unique filename
        $fileName = $item_id . '_' . time() . '.' . $fileExtension;
        $filePath = $imagesDir . '/' . $fileName;
        
        // Move uploaded file
        if (move_uploaded_file($uploadedFile['tmp_name'], $filePath)) {
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
                            if (!canEditInventoryTab($tab, $user, $is_gm)) {
                                unlink($filePath); // Clean up uploaded file
                                echo json_encode(array('success' => false, 'error' => "Permission denied for tab: $tab"));
                                exit;
                            }

                            $oldImagePath = !empty($item['image']) ? $item['image'] : '';

                            // Update item with new image path
                            $data[$tab]['items'][$index]['image'] = $filePath;
                            $itemFound = true;
                            $itemTab = $tab;
                            break 2;
                        }
                    }
                }
            }
            
            if (!$itemFound) {
                unlink($filePath); // Clean up uploaded file
                echo json_encode(array('success' => false, 'error' => 'Item not found in any tab'));
                break;
            }

            // Save updated data
            if (saveInventoryData($data)) {
                deleteInventoryImageIfUnused($data, isset($oldImagePath) ? $oldImagePath : '');
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
        break;
        
    default:
        echo json_encode(array('success' => false, 'error' => 'Invalid inventory action'));
        break;
}
?>