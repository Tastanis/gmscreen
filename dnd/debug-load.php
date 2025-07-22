<?php
session_start();
$_SESSION['logged_in'] = true;
$_SESSION['user'] = 'GM';

// Test what happens when we manually call the load logic
$characters = array('frunk', 'sharon', 'indigo', 'zepha');
$is_gm = true;

// Simulate the load request
$character = 'frunk';

echo "Testing load for character: $character\n\n";

// Include the functions
include 'dashboard.php';

if (($is_gm && in_array($character, $characters)) || (!$is_gm && $character === 'GM')) {
    echo "Access check passed\n";
    
    $data = loadCharacterData();
    echo "Full data loaded, keys: " . implode(', ', array_keys($data)) . "\n\n";
    
    foreach ($data as $char => $charData) {
        echo "$char character_name: " . ($charData['character']['character_name'] ?? 'NOT SET') . "\n";
    }
    
    echo "\n\nRequested character: $character\n";
    $characterData = isset($data[$character]) ? $data[$character] : array();
    echo "Returned character_name: " . ($characterData['character']['character_name'] ?? 'NOT SET') . "\n";
    echo "Returned player_name: " . ($characterData['character']['player_name'] ?? 'NOT SET') . "\n";
    echo "Number of projects: " . count($characterData['projects'] ?? []) . "\n";
    echo "Number of relationships: " . count($characterData['relationships'] ?? []) . "\n";
} else {
    echo "Access denied\n";
}
?>