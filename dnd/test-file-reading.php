<?php
header('Content-Type: text/plain');

echo "=== TESTING FILE READING METHODS ===\n\n";

$file = 'data/characters.json';

// Method 1: file_get_contents
echo "1. file_get_contents():\n";
$content1 = file_get_contents($file);
echo "Length: " . strlen($content1) . "\n";
echo "First 100 chars: " . substr($content1, 0, 100) . "\n";
$data1 = json_decode($content1, true);
echo "JSON decode result: " . (is_array($data1) ? "SUCCESS" : "FAILED - " . json_last_error_msg()) . "\n";
if (is_array($data1)) {
    echo "Frunk name: '" . ($data1['frunk']['character']['character_name'] ?? 'NOT FOUND') . "'\n";
}
echo "\n";

// Method 2: fread
echo "2. fread():\n";
$handle = fopen($file, 'r');
if ($handle) {
    $content2 = fread($handle, filesize($file));
    fclose($handle);
    echo "Length: " . strlen($content2) . "\n";
    echo "First 100 chars: " . substr($content2, 0, 100) . "\n";
    $data2 = json_decode($content2, true);
    echo "JSON decode result: " . (is_array($data2) ? "SUCCESS" : "FAILED - " . json_last_error_msg()) . "\n";
    if (is_array($data2)) {
        echo "Frunk name: '" . ($data2['frunk']['character']['character_name'] ?? 'NOT FOUND') . "'\n";
    }
} else {
    echo "Failed to open file\n";
}
echo "\n";

// Method 3: file() 
echo "3. file():\n";
$lines = file($file);
if ($lines) {
    $content3 = implode('', $lines);
    echo "Length: " . strlen($content3) . "\n";
    echo "First 100 chars: " . substr($content3, 0, 100) . "\n";
    $data3 = json_decode($content3, true);
    echo "JSON decode result: " . (is_array($data3) ? "SUCCESS" : "FAILED - " . json_last_error_msg()) . "\n";
    if (is_array($data3)) {
        echo "Frunk name: '" . ($data3['frunk']['character']['character_name'] ?? 'NOT FOUND') . "'\n";
    }
} else {
    echo "file() failed\n";
}
echo "\n";

// Check file permissions
echo "4. File info:\n";
echo "Exists: " . (file_exists($file) ? "YES" : "NO") . "\n";
echo "Readable: " . (is_readable($file) ? "YES" : "NO") . "\n";
echo "Size: " . filesize($file) . "\n";
echo "Permissions: " . substr(sprintf('%o', fileperms($file)), -4) . "\n";

// Test JSON validation with external tool
echo "\n5. Raw JSON sample:\n";
echo substr($content1, 0, 500) . "\n";
?>