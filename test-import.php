<?php
// Simple test file to verify paths and import functionality
session_start();

// Set session variables for testing
$_SESSION['logged_in'] = true;
$_SESSION['user'] = 'GM';

echo "<h1>Import System Test</h1>";

// Test 1: Check if character-integration.php can be loaded
echo "<h2>Test 1: Loading character-integration.php</h2>";
$integration_path = __DIR__ . '/dnd/strixhaven/gm/includes/character-integration.php';
if (file_exists($integration_path)) {
    echo "<p style='color: green;'>✓ character-integration.php found at: $integration_path</p>";
    require_once $integration_path;
    echo "<p style='color: green;'>✓ character-integration.php loaded successfully</p>";
} else {
    echo "<p style='color: red;'>✗ character-integration.php not found at: $integration_path</p>";
}

// Test 2: Check if version.php can be loaded
echo "<h2>Test 2: Loading version.php</h2>";
$version_path = __DIR__ . '/dnd/version.php';
if (file_exists($version_path)) {
    echo "<p style='color: green;'>✓ version.php found at: $version_path</p>";
    define('VERSION_SYSTEM_INTERNAL', true);
    require_once $version_path;
    echo "<p style='color: green;'>✓ version.php loaded successfully</p>";
    echo "<p>Version: " . Version::displayVersion() . "</p>";
} else {
    echo "<p style='color: red;'>✗ version.php not found at: $version_path</p>";
}

// Test 3: Check if students.json exists
echo "<h2>Test 3: Checking students.json</h2>";
$students_path = __DIR__ . '/dnd/strixhaven/students/students.json';
if (file_exists($students_path)) {
    echo "<p style='color: green;'>✓ students.json found at: $students_path</p>";
    $content = file_get_contents($students_path);
    $data = json_decode($content, true);
    if ($data) {
        echo "<p style='color: green;'>✓ students.json is valid JSON</p>";
        echo "<p>Number of students: " . count($data['students']) . "</p>";
    } else {
        echo "<p style='color: red;'>✗ students.json is not valid JSON</p>";
    }
} else {
    echo "<p style='color: red;'>✗ students.json not found at: $students_path</p>";
}

// Test 4: Test getAllCharacterNames function
echo "<h2>Test 4: Testing getAllCharacterNames()</h2>";
if (function_exists('getAllCharacterNames')) {
    $result = getAllCharacterNames();
    if ($result['success']) {
        echo "<p style='color: green;'>✓ getAllCharacterNames() executed successfully</p>";
        echo "<p>Total characters found: " . count($result['characters']) . "</p>";
        
        // Show first 5 characters
        echo "<h3>Sample Characters:</h3><ul>";
        foreach (array_slice($result['characters'], 0, 5) as $char) {
            echo "<li>" . htmlspecialchars($char['name']) . " (" . $char['type'] . ")</li>";
        }
        echo "</ul>";
    } else {
        echo "<p style='color: red;'>✗ getAllCharacterNames() failed</p>";
    }
} else {
    echo "<p style='color: red;'>✗ getAllCharacterNames() function not found</p>";
}

// Test 5: Check import button visibility
echo "<h2>Test 5: Import Button Visibility Check</h2>";
echo "<p>Session user: " . $_SESSION['user'] . "</p>";
echo "<p>Is GM: " . ($_SESSION['user'] === 'GM' ? 'Yes' : 'No') . "</p>";
echo "<p>Import button should be: " . ($_SESSION['user'] === 'GM' ? 'VISIBLE' : 'HIDDEN') . "</p>";

echo "<hr>";
echo "<p><a href='dnd/strixhaven/gm/'>Go to GM Screen</a></p>";
echo "<p><a href='dnd/strixhaven/students/'>Go to Students Page</a></p>";
?>