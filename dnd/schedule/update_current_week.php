<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    echo json_encode(array('success' => false, 'error' => 'Not authenticated'));
    exit;
}

$user = $_SESSION['user'];

// Validate action
if (!isset($_POST['action']) || $_POST['action'] !== 'update_week') {
    echo json_encode(array('success' => false, 'error' => 'Invalid action'));
    exit;
}

// Validate week parameter
if (!isset($_POST['week'])) {
    echo json_encode(array('success' => false, 'error' => 'Missing week parameter'));
    exit;
}

$week = intval($_POST['week']);
if ($week < 1) {
    echo json_encode(array('success' => false, 'error' => 'Invalid week number'));
    exit;
}

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

// Update current week for this user
$schedules['_current_week'][$user] = $week;

// Save the updated schedules
$json_content = json_encode($schedules, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

if (!is_dir('data')) {
    mkdir('data', 0755, true);
}

if (file_put_contents($schedules_file, $json_content) === false) {
    echo json_encode(array('success' => false, 'error' => 'Failed to save current week'));
    exit;
}

// Log the week update
$log_entry = date('Y-m-d H:i:s') . " - Week update: User: $user, Week: $week\n";
file_put_contents('data/week_log.txt', $log_entry, FILE_APPEND | LOCK_EX);

// Return success
echo json_encode(array(
    'success' => true,
    'message' => 'Current week updated successfully',
    'user' => $user,
    'week' => $week,
    'timestamp' => time()
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