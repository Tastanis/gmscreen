<?php
session_start();

// For standalone game, we'll get all available word lists
// This can work with or without login

header('Content-Type: application/json');

// Include config from parent directory (asl1)
if (file_exists('../config.php')) {
    require_once '../config.php';
} else {
    // Return empty if no config found
    echo json_encode(['wordlists' => []]);
    exit;
}

try {
    // Get ASL level filter parameter
    $levelFilter = isset($_GET['level']) ? $_GET['level'] : 'all';
    
    // Get all word lists that are enabled for scroller game
    // First check if scroller_enabled column exists
    $checkColumn = $pdo->query("SHOW COLUMNS FROM scroller_wordlists LIKE 'scroller_enabled'");
    $columnExists = $checkColumn->rowCount() > 0;
    
    // Check if asl_level column exists
    $checkAslColumn = $pdo->query("SHOW COLUMNS FROM scroller_wordlists LIKE 'asl_level'");
    $aslColumnExists = $checkAslColumn->rowCount() > 0;
    
    // Build the base query
    $baseQuery = "SELECT id, name as wordlist_name, words, speed_setting as speed, word_count";
    if ($aslColumnExists) {
        $baseQuery .= ", asl_level";
    }
    $baseQuery .= " FROM scroller_wordlists WHERE 1=1";
    
    // Add scroller_enabled filter if column exists
    if ($columnExists) {
        $baseQuery .= " AND scroller_enabled = 1";
    }
    
    // Add ASL level filter if requested and column exists
    if ($aslColumnExists && $levelFilter !== 'all') {
        if ($levelFilter === '1') {
            // ASL 1 Only: show level 1 and "both levels" (3)
            $baseQuery .= " AND (asl_level = 1 OR asl_level = 3)";
        } elseif ($levelFilter === '2') {
            // ASL 2 Only: show level 2 and "both levels" (3)
            $baseQuery .= " AND (asl_level = 2 OR asl_level = 3)";
        } elseif ($levelFilter === '3') {
            // Both Levels Only: show only level 3
            $baseQuery .= " AND asl_level = 3";
        }
    }
    
    $baseQuery .= " ORDER BY name ASC";
    
    $stmt = $pdo->prepare($baseQuery);
    $stmt->execute();
    $lists = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Decode words column before returning
    foreach ($lists as &$list) {
        $decoded = json_decode($list['words'], true);
        $list['words'] = is_array($decoded) ? $decoded : [];
    }
    
    echo json_encode(['wordlists' => $lists]);
} catch (PDOException $e) {
    // Return empty array on error
    echo json_encode(['wordlists' => []]);
}
?>