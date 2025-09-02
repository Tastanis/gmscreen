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
    // Get all word lists that are enabled for scroller game
    // First check if scroller_enabled column exists
    $checkColumn = $pdo->query("SHOW COLUMNS FROM scroller_wordlists LIKE 'scroller_enabled'");
    $columnExists = $checkColumn->rowCount() > 0;
    
    if ($columnExists) {
        // Get only enabled word lists
        $stmt = $pdo->prepare("SELECT id, name as wordlist_name, words, speed_setting as speed, word_count 
                               FROM scroller_wordlists 
                               WHERE scroller_enabled = 1 
                               ORDER BY name ASC");
    } else {
        // Get all word lists (backward compatibility)
        $stmt = $pdo->prepare("SELECT id, name as wordlist_name, words, speed_setting as speed, word_count 
                               FROM scroller_wordlists 
                               ORDER BY name ASC");
    }
    
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