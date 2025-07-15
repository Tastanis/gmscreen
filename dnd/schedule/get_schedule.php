<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    echo json_encode(array('success' => false, 'error' => 'Not authenticated'));
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Validate action
if (!isset($_POST['action']) || $_POST['action'] !== 'load') {
    echo json_encode(array('success' => false, 'error' => 'Invalid action'));
    exit;
}

// Get week parameter (default to 1 if not provided)
$week = isset($_POST['week']) ? intval($_POST['week']) : 1;
if ($week < 1) {
    $week = 1;
}

// Load schedules from file
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
    saveScheduleFile($schedules_file, $schedules);
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

// Get or create the week structure for all characters
$valid_characters = ['frunk', 'sharon', 'indigo', 'zepha'];
$valid_days = ['monday', 'tuesday', 'thursday', 'friday', 'saturday', 'sunday'];

foreach ($valid_characters as $character) {
    // Ensure character exists
    if (!isset($schedules[$character])) {
        $schedules[$character] = array();
    }
    
    // Ensure week exists for this character
    if (!isset($schedules[$character][$week])) {
        $schedules[$character][$week] = array();
        foreach ($valid_days as $day) {
            $schedules[$character][$week][$day] = array(
                'block1' => '',
                'block2' => '',
                'block3' => '',
                'block4' => ''
            );
        }
    }
}

// Save the updated schedules (to persist current week)
saveScheduleFile($schedules_file, $schedules);

// Prepare clean data for the specific week
$clean_schedules = array();

foreach ($valid_characters as $character) {
    $clean_schedules[$character] = isset($schedules[$character][$week]) ? $schedules[$character][$week] : array();
    
    // Ensure complete structure for week
    foreach ($valid_days as $day) {
        if (!isset($clean_schedules[$character][$day])) {
            $clean_schedules[$character][$day] = array(
                'block1' => '',
                'block2' => '',
                'block3' => '',
                'block4' => ''
            );
        }
    }
}

// Prepare response based on user type
if ($is_gm) {
    // GM gets all character schedules for the week
    $response_data = array(
        'success' => true,
        'schedules' => $clean_schedules,
        'user_type' => 'gm',
        'week' => $week,
        'current_week' => $schedules['_current_week'][$user],
        'timestamp' => time()
    );
    
    // Add last update info if available
    if (isset($schedules['_last_updated'])) {
        $response_data['last_updated'] = $schedules['_last_updated'];
    }
    
} else {
    // Players get only their own schedule for the week
    if (!in_array($user, $valid_characters)) {
        echo json_encode(array('success' => false, 'error' => 'Invalid user'));
        exit;
    }
    
    $user_schedule = isset($clean_schedules[$user]) ? $clean_schedules[$user] : array();
    
    $response_data = array(
        'success' => true,
        'schedules' => array($user => $user_schedule),
        'user_type' => 'player',
        'character' => $user,
        'week' => $week,
        'current_week' => $schedules['_current_week'][$user],
        'timestamp' => time()
    );
}

// Log the access
$log_entry = date('Y-m-d H:i:s') . " - Load request: User: $user, Type: " . ($is_gm ? 'GM' : 'Player') . ", Week: $week\n";
file_put_contents('data/access_log.txt', $log_entry, FILE_APPEND | LOCK_EX);

// Return the data
header('Content-Type: application/json');
echo json_encode($response_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

// Helper functions
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

function saveScheduleFile($filename, $data) {
    $json_content = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    
    if (!is_dir('data')) {
        mkdir('data', 0755, true);
    }
    
    return file_put_contents($filename, $json_content);
}
?>