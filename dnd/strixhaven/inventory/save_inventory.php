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
    
    // Return default data structure if file doesn't exist
    $default_data = array();
    foreach (array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm') as $section) {
        $default_data[$section] = array('items' => array());
    }
    return $default_data;
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

// Handle AJAX requests
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    header('Content-Type: application/json');
    
    $action = $_POST['action'];
    
    switch ($action) {
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
            
            if (!canEditTab($tab, $user, $is_gm)) {
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
            
            // Validate item data structure - UPDATED: Only include the fields you want
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
            
            if (!canEditTab($tab, $user, $is_gm)) {
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
            
            // Delete associated image file if it exists
            if (!empty($item['image']) && file_exists($item['image'])) {
                unlink($item['image']);
            }
            
            // Remove item from array
            array_splice($data[$tab]['items'], $index, 1);
            
            // Save to file
            if (saveInventoryData($data)) {
                echo json_encode(array('success' => true));
            } else {
                echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
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
            
            if (!canEditTab($tab, $user, $is_gm)) {
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
            $new_item['id'] = 'item_' . time() . '_' . substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 9);
            $new_item['grid_x'] = 0;
            $new_item['grid_y'] = 0;
            
            // Handle image file - copy the image if it exists
            if (!empty($original_item['image']) && file_exists($original_item['image'])) {
                $old_path = $original_item['image'];
                $path_info = pathinfo($old_path);
                $new_filename = $new_item['id'] . '_' . time() . '.' . $path_info['extension'];
                $new_path = 'images/' . $new_filename;
                
                // Ensure images directory exists
                if (!is_dir('images')) {
                    mkdir('images', 0755, true);
                }
                
                if (copy($old_path, $new_path)) {
                    $new_item['image'] = $new_path;
                } else {
                    // If copy fails, remove image reference
                    $new_item['image'] = '';
                }
            } else {
                // No image or file doesn't exist
                $new_item['image'] = '';
            }
            
            // Ensure target tab structure exists
            if (!isset($data[$to_tab])) {
                $data[$to_tab] = array('items' => array());
            }
            if (!isset($data[$to_tab]['items'])) {
                $data[$to_tab]['items'] = array();
            }
            
            // Add to target folder
            $data[$to_tab]['items'][] = $new_item;
            
            // Remove from original location
            array_splice($data[$from_tab]['items'], $index, 1);
            
            // Delete the original image file after successful copy
            if (!empty($original_item['image']) && file_exists($original_item['image']) && !empty($new_item['image'])) {
                unlink($original_item['image']);
            }
            
            // Save to file
            if (saveInventoryData($data)) {
                echo json_encode(array(
                    'success' => true,
                    'new_item' => $new_item,
                    'to_tab' => $to_tab
                ));
            } else {
                echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
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
            $new_item['id'] = 'item_' . time() . '_' . substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 9);
            $new_item['grid_x'] = 0;
            $new_item['grid_y'] = 0;
            
            // Handle image file - copy the image if it exists
            if (!empty($original_item['image']) && file_exists($original_item['image'])) {
                $old_path = $original_item['image'];
                $path_info = pathinfo($old_path);
                $new_filename = $new_item['id'] . '_' . time() . '.' . $path_info['extension'];
                $new_path = 'images/' . $new_filename;
                
                // Ensure images directory exists
                if (!is_dir('images')) {
                    mkdir('images', 0755, true);
                }
                
                if (copy($old_path, $new_path)) {
                    $new_item['image'] = $new_path;
                } else {
                    // If copy fails, remove image reference
                    $new_item['image'] = '';
                }
            } else {
                // No image or file doesn't exist
                $new_item['image'] = '';
            }
            
            // Ensure target tab structure exists
            if (!isset($data[$to_tab])) {
                $data[$to_tab] = array('items' => array());
            }
            if (!isset($data[$to_tab]['items'])) {
                $data[$to_tab]['items'] = array();
            }
            
            // Add to player's inventory
            $data[$to_tab]['items'][] = $new_item;
            
            // Remove from original location
            array_splice($data[$from_tab]['items'], $index, 1);
            
            // Delete the original image file after successful copy
            if (!empty($original_item['image']) && file_exists($original_item['image']) && !empty($new_item['image'])) {
                unlink($original_item['image']);
            }
            
            // Save to file
            if (saveInventoryData($data)) {
                echo json_encode(array(
                    'success' => true,
                    'new_item' => $new_item,
                    'to_tab' => $to_tab
                ));
            } else {
                echo json_encode(array('success' => false, 'error' => 'Failed to save data'));
            }
            break;
            
        default:
            echo json_encode(array('success' => false, 'error' => 'Invalid action'));
            break;
    }
} else {
    echo json_encode(array('success' => false, 'error' => 'Invalid request'));
}
?>