<?php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Define character names for display
$character_names = [
    'frunk' => 'FRUNK',
    'sharon' => 'SHARON', 
    'indigo' => 'INDIGO',
    'zepha' => 'ZEPHA',
    'GM' => 'GAME MASTER'
];

// Define time blocks
$time_blocks = [
    'block1' => '1st Full Block (Morning)',
    'block2' => '2nd Full Block (Afternoon)', 
    'block3' => '3rd Half Block (Evening)',
    'block4' => '4th Full Block (Sleeping/Cramming)'
];

// Define days (no Wednesday)
$days = ['monday', 'tuesday', 'thursday', 'friday', 'saturday', 'sunday'];
$day_labels = [
    'monday' => 'Mon',
    'tuesday' => 'Tue', 
    'thursday' => 'Thu',
    'friday' => 'Fri',
    'saturday' => 'Sat',
    'sunday' => 'Sun'
];

// Initialize schedules.json if it doesn't exist
$schedules_file = 'data/schedules.json';
if (!file_exists('data/')) {
    mkdir('data/', 0755, true);
}

if (!file_exists($schedules_file)) {
    $empty_schedule = [
        '_current_week' => [
            'GM' => 1,
            'frunk' => 1,
            'sharon' => 1,
            'indigo' => 1,
            'zepha' => 1
        ]
    ];
    
    // Initialize week 1 for all characters
    foreach (['frunk', 'sharon', 'indigo', 'zepha'] as $char) {
        $empty_schedule[$char] = [
            '1' => []
        ];
        foreach ($days as $day) {
            $empty_schedule[$char]['1'][$day] = [
                'block1' => '',
                'block2' => '',
                'block3' => '', 
                'block4' => ''
            ];
        }
    }
    file_put_contents($schedules_file, json_encode($empty_schedule, JSON_PRETTY_PRINT));
}

// Create .htaccess for data folder if it doesn't exist
$htaccess_file = 'data/.htaccess';
if (!file_exists($htaccess_file)) {
    file_put_contents($htaccess_file, "Deny from all\n");
}

// Load current week for user from saved data
$current_week = 1; // Default fallback

if (file_exists($schedules_file)) {
    $json_content = file_get_contents($schedules_file);
    $schedules = json_decode($json_content, true);

    if ($schedules !== null && isset($schedules['_current_week'][$user])) {
        $current_week = intval($schedules['_current_week'][$user]);
        if ($current_week < 1) {
            $current_week = 1;
        }
    }
}

// Include navigation bar
require_once '../includes/strix-nav.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Schedule System</title>
    <link rel="stylesheet" href="schedule.css">
</head>
<body>
    <?php renderStrixNav('schedule'); ?>
    <div class="container">
        <header>
            <h1><?php echo $is_gm ? 'Game Master Schedule' : $character_names[$user] . ' Schedule'; ?></h1>
            <div class="user-info">
                <a href="../dashboard.php" class="back-btn">← Back to Main</a>
            </div>
        </header>

        <!-- Week Navigation -->
        <div class="week-navigation">
            <button id="prevWeekBtn" class="week-nav-btn">
                <span class="nav-arrow">←</span>
                <span class="nav-text">Previous Week</span>
            </button>
            
            <div class="current-week-display">
                <span class="week-label">Academic Week</span>
                <span id="currentWeekNumber" class="week-number"><?php echo $current_week; ?></span>
            </div>
            
            <button id="nextWeekBtn" class="week-nav-btn">
                <span class="nav-text">Next Week</span>
                <span class="nav-arrow">→</span>
            </button>
        </div>

        <div class="schedule-container">
            <?php if ($is_gm): ?>
                <!-- GM VIEW: All characters stacked -->
                <div class="gm-view">
                    <div class="view-info">
                        <span class="view-label">All Characters</span>
                        <span class="save-status" id="saveStatus">Ready</span>
                    </div>
                    
                    <?php foreach (['frunk', 'sharon', 'indigo', 'zepha'] as $character): ?>
                        <div class="character-section">
                            <h2 class="character-name"><?php echo $character_names[$character]; ?></h2>
                            <div class="table-wrapper">
                                <table class="schedule-table gm-table">
                                <thead>
                                    <tr>
                                        <th class="time-header">Time Block</th>
                                        <?php foreach ($days as $day): ?>
                                            <th class="day-header"><?php echo $day_labels[$day]; ?></th>
                                        <?php endforeach; ?>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ($time_blocks as $block_key => $block_label): ?>
                                        <tr>
                                            <td class="time-label"><?php echo $block_label; ?></td>
                                            <?php foreach ($days as $day): ?>
                                                <td class="schedule-cell">
                                                    <textarea 
                                                           class="schedule-input gm-input" 
                                                           data-character="<?php echo $character; ?>" 
                                                           data-day="<?php echo $day; ?>" 
                                                           data-block="<?php echo $block_key; ?>"
                                                           placeholder="Enter activity..."
                                                           maxlength="500"
                                                           rows="4"></textarea>
                                                </td>
                                            <?php endforeach; ?>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>

            <?php else: ?>
                <!-- PLAYER VIEW: Individual character only -->
                <div class="player-view">
                    <div class="view-info">
                        <span class="view-label">Weekly Schedule</span>
                        <span class="save-status" id="saveStatus">Ready</span>
                    </div>
                    
                    <div class="character-section">
                        <div class="table-wrapper">
                            <table class="schedule-table player-table">
                            <thead>
                                <tr>
                                    <th class="time-header">Time Block</th>
                                    <?php foreach ($days as $day): ?>
                                        <th class="day-header"><?php echo $day_labels[$day]; ?></th>
                                    <?php endforeach; ?>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($time_blocks as $block_key => $block_label): ?>
                                    <tr>
                                        <td class="time-label"><?php echo $block_label; ?></td>
                                        <?php foreach ($days as $day): ?>
                                            <td class="schedule-cell">
                                                <textarea 
                                                       class="schedule-input" 
                                                       data-character="<?php echo $user; ?>" 
                                                       data-day="<?php echo $day; ?>" 
                                                       data-block="<?php echo $block_key; ?>"
                                                       placeholder="Enter activity..."
                                                       maxlength="500"
                                                       rows="4"></textarea>
                                            </td>
                                        <?php endforeach; ?>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            <?php endif; ?>
        </div>

        <footer>
            <p>Strixhaven University Academic Scheduling System | Week View (No Wednesday Classes)</p>
        </footer>
    </div>

    <script>
        // Pass PHP variables to JavaScript
        const isGM = <?php echo $is_gm ? 'true' : 'false'; ?>;
        const currentUser = '<?php echo $user; ?>';
        const initialWeek = <?php echo $current_week; ?>; // Pass the current week from PHP
    </script>
    <script src="schedule.js"></script>
</body>
</html>