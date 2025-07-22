<?php
// Simple debug script - NO JavaScript interference
header('Content-Type: text/plain');
session_start();
$_SESSION['logged_in'] = true;
$_SESSION['user'] = 'GM';

echo "=== CHARACTER LOADING DEBUG ===\n\n";

// Define functions inline to avoid including dashboard.php
function simpleLoadCharacterData() {
    $dataFile = 'data/characters.json';
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $data;
        } else {
            return "JSON_ERROR: " . json_last_error_msg();
        }
    } else {
        return "FILE_NOT_FOUND";
    }
}

// Test the loading
echo "1. Testing direct file load...\n";
$data = simpleLoadCharacterData();

if (is_array($data)) {
    echo "SUCCESS: Data loaded\n";
    echo "Characters found: " . implode(', ', array_keys($data)) . "\n\n";
    
    foreach ($data as $char => $charData) {
        echo "=== $char ===\n";
        echo "  Character Name: " . ($charData['character']['character_name'] ?? 'NOT SET') . "\n";
        echo "  Player Name: " . ($charData['character']['player_name'] ?? 'NOT SET') . "\n";
        echo "  Relationships: " . count($charData['relationships'] ?? []) . "\n";
        echo "  Projects: " . count($charData['projects'] ?? []) . "\n";
        echo "  Past Classes: " . count($charData['past_classes'] ?? []) . "\n\n";
    }
    
    echo "\n2. Testing individual character access...\n";
    $testChar = 'frunk';
    $frunkData = isset($data[$testChar]) ? $data[$testChar] : null;
    if ($frunkData) {
        echo "Frunk data found:\n";
        echo "  Name: " . ($frunkData['character']['character_name'] ?? 'NOT SET') . "\n";
        echo "  Player: " . ($frunkData['character']['player_name'] ?? 'NOT SET') . "\n";
        echo "  Projects: " . count($frunkData['projects'] ?? []) . "\n";
        
        if (!empty($frunkData['projects'])) {
            echo "\n  Project details:\n";
            foreach ($frunkData['projects'] as $i => $project) {
                echo "    " . ($i + 1) . ". " . ($project['project_name'] ?? 'NO NAME') . "\n";
            }
        }
    } else {
        echo "ERROR: Frunk data not found\n";
    }
    
} else {
    echo "ERROR: " . $data . "\n";
}

echo "\n3. File info:\n";
echo "File exists: " . (file_exists('data/characters.json') ? 'YES' : 'NO') . "\n";
echo "File size: " . filesize('data/characters.json') . " bytes\n";
echo "File modified: " . date('Y-m-d H:i:s', filemtime('data/characters.json')) . "\n";
?>