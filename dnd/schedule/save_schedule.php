<?php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    echo json_encode(array('success' => false, 'error' => 'Not authenticated'));
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Validate action
if (!isset($_POST['action']) || $_POST['action'] !== 'save') {
    echo json_encode(array('success' => false, 'error' => 'Invalid action'));
    exit;
}

// Validate required fields
$required_fields = ['character', 'day', 'block', 'value', 'week'];
foreach ($required_fields as $field) {
    if (!isset($_POST[$field])) {
        echo json_encode(array('success' => false, 'error' => "Missing field: $field"));
        exit;
    }
}

$character = $_POST['character'];
$day = $_POST['day'];
$block = $_POST['block'];
$value = $_POST['value'];
$week = intval($_POST['week']);

// NOW validate character access - AFTER we have the variables
// GM can edit any character, players can only edit their own
if (!$is_gm) {
    // Validate character access - players can only edit their own schedule
    if ($character !== $user) {
        echo json_encode(array('success' => false, 'error' => 'Cannot edit another character\'s schedule'));
        exit;
    }
}

// Validate week
if ($week < 1) {
    echo json_encode(array('success' => false, 'error' => 'Invalid week number'));
    exit;
}

// Validate character name
$valid_characters = ['frunk', 'sharon', 'indigo', 'zepha'];
if (!in_array($character, $valid_characters)) {
    echo json_encode(array('success' => false, 'error' => 'Invalid character'));
    exit;
}

// Validate day
$valid_days = ['monday', 'tuesday', 'thursday', 'friday', 'saturday', 'sunday'];
if (!in_array($day, $valid_days)) {
    echo json_encode(array('success' => false, 'error' => 'Invalid day'));
    exit;
}

// Validate block
$valid_blocks = ['block1', 'block2', 'block3', 'block4'];
if (!in_array($block, $valid_blocks)) {
    echo json_encode(array('success' => false, 'error' => 'Invalid block'));
    exit;
}

// Sanitize and validate value
$value = trim($value);
if (strlen($value) > 500) {
    echo json_encode(array('success' => false, 'error' => 'Text too long (max 500 characters)'));
    exit;
}

// Remove potentially harmful characters
$value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
$value = preg_replace('/[<>]/', '', $value);

// Load existing schedules
$schedules_file = 'data/schedules.json';
$schedules = array();

if (file_exists($schedules_file)) {
    $json_content = file_get_contents($schedules_file);
    $schedules = json_decode($json_content, true);
    
    if ($schedules === null) {
        echo json_encode(array('success' => false, 'error' => 'Invalid JSON in schedules file'));
        exit;
    }
} else {
    // Create empty structure if file doesn't exist
    $schedules = initializeEmptySchedule();
}

// Ensure current week tracking exists
if (!isset($schedules['_current_week'])) {
    $schedules['_current_week'] = array(
        'GM' => 1,
        'frunk' => 1,
        'sharon' => 1,
        'indigo' => 1,
        'zepha' => 1
    );
}

// Ensure the character structure exists
if (!isset($schedules[$character])) {
    $schedules[$character] = array();
}

// Ensure the week structure exists
if (!isset($schedules[$character][$week])) {
    $schedules[$character][$week] = array();
    foreach ($valid_days as $d) {
        $schedules[$character][$week][$d] = array(
            'block1' => '',
            'block2' => '',
            'block3' => '',
            'block4' => ''
        );
    }
}

// Ensure the day structure exists
if (!isset($schedules[$character][$week][$day])) {
    $schedules[$character][$week][$day] = array(
        'block1' => '',
        'block2' => '',
        'block3' => '',
        'block4' => ''
    );
}

// Update the specific block
$schedules[$character][$week][$day][$block] = $value;

// Update current week for this user (to persist their current week)
$schedules['_current_week'][$user] = $week;

// Add timestamp for tracking
$schedules['_last_updated'] = array(
    'timestamp' => time(),
    'user' => $user,
    'character' => $character,
    'week' => $week,
    'day' => $day,
    'block' => $block
);

// Save the updated schedules
$json_content = json_encode($schedules, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

if (file_put_contents($schedules_file, $json_content) === false) {
    echo json_encode(array('success' => false, 'error' => 'Failed to save schedule'));
    exit;
}

// Create backup with timestamp
$backup_dir = 'data/backups';
if (!file_exists($backup_dir)) {
    mkdir($backup_dir, 0755, true);
}

$backup_file = $backup_dir . '/schedules_backup_' . date('Y-m-d_H-i-s') . '.json';
copy($schedules_file, $backup_file);

// Clean up old backups (keep only last 50)
$backup_files = glob($backup_dir . '/schedules_backup_*.json');
if (count($backup_files) > 50) {
    // Sort by modification time
    usort($backup_files, function($a, $b) {
        return filemtime($a) - filemtime($b);
    });
    
    // Remove oldest files
    $files_to_remove = array_slice($backup_files, 0, count($backup_files) - 50);
    foreach ($files_to_remove as $file) {
        unlink($file);
    }
}

// Log the save action
$log_entry = date('Y-m-d H:i:s') . " - User: $user, Character: $character, Week: $week, Day: $day, Block: $block, Length: " . strlen($value) . " chars\n";
file_put_contents('data/save_log.txt', $log_entry, FILE_APPEND | LOCK_EX);

// Return success
echo json_encode(array(
    'success' => true,
    'message' => 'Schedule saved successfully',
    'timestamp' => time(),
    'character' => $character,
    'week' => $week,
    'day' => $day,
    'block' => $block
));

// Helper function
function initializeEmptySchedule() {
    $valid_characters = ['frunk', 'sharon', 'indigo', 'zepha'];
    $valid_days = ['monday', 'tuesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    $schedule = array(
        '_current_week' => array(
            'GM' => 1,
            'frunk' => 1,
            'sharon' => 1,
            'indigo' => 1,
            'zepha' => 1
        )
    );
    
    foreach ($valid_characters as $char) {
        $schedule[$char] = array(
            '1' => array()
        );
        foreach ($valid_days as $day) {
            $schedule[$char]['1'][$day] = array(
                'block1' => '',
                'block2' => '',
                'block3' => '',
                'block4' => ''
            );
        }
    }
    
    return $schedule;
}
?>