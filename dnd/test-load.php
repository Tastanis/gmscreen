<?php
// Test script to debug character loading

ini_set('display_errors', 1);
error_reporting(E_ALL);

session_start();
$_SESSION['logged_in'] = true;
$_SESSION['user'] = 'GM';

// Load the functions
require_once 'dashboard.php';

echo "Testing loadCharacterData function:\n\n";

try {
    $data = loadCharacterData();
    echo "SUCCESS: Data loaded successfully!\n";
    echo "Number of characters: " . count($data) . "\n";
    
    foreach ($data as $char => $charData) {
        echo "\n$char:\n";
        echo "  Name: " . ($charData['character']['character_name'] ?? 'NOT SET') . "\n";
        echo "  Relationships: " . count($charData['relationships'] ?? []) . "\n";
        echo "  Projects: " . count($charData['projects'] ?? []) . "\n";
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
?>