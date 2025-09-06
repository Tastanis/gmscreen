<?php
/**
 * Strixhaven Map Setup Script
 * Sets up database tables and initial configuration
 */

// Prevent direct access from web
if (php_sapi_name() !== 'cli' && !defined('SETUP_ALLOWED')) {
    // Allow access if user is logged in as GM
    session_start();
    if (!isset($_SESSION['logged_in']) || $_SESSION['user'] !== 'GM') {
        die('Access denied. GM login required.');
    }
}

require_once '../../includes/database-config.php';
require_once '../../includes/hex-data-manager.php';

echo "<h1>Strixhaven Hex Map Setup</h1>\n";

// Step 1: Check system requirements
echo "<h2>1. System Requirements Check</h2>\n";
checkSystemRequirements();

// Step 2: Database setup
echo "<h2>2. Database Setup</h2>\n";
setupDatabase();

// Step 3: Directory setup
echo "<h2>3. Directory Setup</h2>\n";
setupDirectories();

// Step 4: Test hex data operations
echo "<h2>4. Test Data Operations</h2>\n";
testDataOperations();

// Step 5: Performance test
echo "<h2>5. Performance Test</h2>\n";
performanceTest();

echo "<h2>✅ Setup Complete!</h2>\n";
echo "<p>The Strixhaven hex map system is now ready to use.</p>\n";
echo "<p><a href='index.php'>Open Map Interface</a></p>\n";

function checkSystemRequirements() {
    $requirements = [
        'PHP Version >= 7.4' => version_compare(PHP_VERSION, '7.4.0', '>='),
        'PDO Extension' => extension_loaded('pdo'),
        'PDO MySQL' => extension_loaded('pdo_mysql'),
        'GD Extension' => extension_loaded('gd'),
        'JSON Extension' => extension_loaded('json'),
        'File Upload Enabled' => ini_get('file_uploads'),
        'Sessions Enabled' => extension_loaded('session')
    ];
    
    $allPassed = true;
    
    echo "<ul>\n";
    foreach ($requirements as $requirement => $passed) {
        $status = $passed ? '✅' : '❌';
        echo "<li>$status $requirement</li>\n";
        if (!$passed) $allPassed = false;
    }
    echo "</ul>\n";
    
    if (!$allPassed) {
        die("<p><strong>❌ Some requirements are not met. Please fix them before continuing.</strong></p>\n");
    }
    
    echo "<p>✅ All system requirements met.</p>\n";
}

function setupDatabase() {
    try {
        // Test database connection
        echo "<p>Testing database connection...</p>\n";
        
        if (!DatabaseConfig::testConnection()) {
            echo "<p>⚠️ Database connection failed. Using file-based storage.</p>\n";
            echo "<p>To use database storage, please configure your database settings in includes/database-config.php</p>\n";
            return false;
        }
        
        echo "<p>✅ Database connection successful.</p>\n";
        
        // Check existing tables
        $missingTables = DatabaseConfig::checkTables();
        
        if (empty($missingTables)) {
            echo "<p>✅ All database tables already exist.</p>\n";
            return true;
        }
        
        echo "<p>Creating missing tables: " . implode(', ', $missingTables) . "</p>\n";
        
        if (DatabaseConfig::createTables()) {
            echo "<p>✅ Database tables created successfully.</p>\n";
            return true;
        } else {
            echo "<p>❌ Failed to create database tables.</p>\n";
            return false;
        }
        
    } catch (Exception $e) {
        echo "<p>❌ Database setup error: " . htmlspecialchars($e->getMessage()) . "</p>\n";
        return false;
    }
}

function setupDirectories() {
    $directories = [
        __DIR__ . '/images',
        __DIR__ . '/images/hexes',
        __DIR__ . '/data'
    ];
    
    $allCreated = true;
    
    foreach ($directories as $dir) {
        if (!is_dir($dir)) {
            if (mkdir($dir, 0755, true)) {
                echo "<p>✅ Created directory: " . basename($dir) . "</p>\n";
            } else {
                echo "<p>❌ Failed to create directory: " . basename($dir) . "</p>\n";
                $allCreated = false;
            }
        } else {
            echo "<p>✅ Directory already exists: " . basename($dir) . "</p>\n";
        }
    }
    
    // Set up .htaccess for image directory
    $htaccessFile = __DIR__ . '/images/.htaccess';
    if (!file_exists($htaccessFile)) {
        $htaccessContent = "# Allow access to images\nOrder allow,deny\nAllow from all\n";
        file_put_contents($htaccessFile, $htaccessContent);
        echo "<p>✅ Created .htaccess for images directory</p>\n";
    }
    
    return $allCreated;
}

function testDataOperations() {
    try {
        $hexManager = new HexDataManager();
        $testHexId = "test_0_0";
        $testUser = "setup_test";
        $testSession = "setup_session";
        
        // Test save operation
        $testData = [
            'hex_name' => 'Setup Test Hex',
            'custom_field_1' => 'This is a test hex created during setup',
            'player_notes' => 'Test notes from setup process'
        ];
        
        echo "<p>Testing save operation...</p>\n";
        $saveResult = $hexManager->saveHexData($testHexId, $testData, $testUser, $testSession);
        
        if (!$saveResult['success']) {
            throw new Exception('Save test failed: ' . $saveResult['error']);
        }
        
        echo "<p>✅ Save operation successful</p>\n";
        
        // Test load operation
        echo "<p>Testing load operation...</p>\n";
        $loadedData = $hexManager->getHexData($testHexId);
        
        if (!$loadedData || $loadedData['hex_name'] !== $testData['hex_name']) {
            throw new Exception('Load test failed: Data mismatch');
        }
        
        echo "<p>✅ Load operation successful</p>\n";
        
        // Test lock operations
        echo "<p>Testing lock operations...</p>\n";
        $lockResult = $hexManager->acquireEditLock($testHexId, $testUser, $testSession);
        
        if (!$lockResult['success']) {
            throw new Exception('Lock acquisition failed: ' . $lockResult['error']);
        }
        
        echo "<p>✅ Lock acquisition successful</p>\n";
        
        $unlockResult = $hexManager->releaseEditLock($testHexId, $testSession);
        
        if (!$unlockResult) {
            throw new Exception('Lock release failed');
        }
        
        echo "<p>✅ Lock release successful</p>\n";
        
        // Clean up test data
        $emptyData = array_fill_keys(array_keys($testData), null);
        $hexManager->saveHexData($testHexId, $emptyData, $testUser, $testSession);
        
        echo "<p>✅ All data operations working correctly</p>\n";
        
    } catch (Exception $e) {
        echo "<p>❌ Data operation test failed: " . htmlspecialchars($e->getMessage()) . "</p>\n";
    }
}

function performanceTest() {
    echo "<p>Running performance test...</p>\n";
    
    try {
        $hexManager = new HexDataManager();
        
        // Test bulk operations
        $startTime = microtime(true);
        
        // Simulate loading all hex data
        $allData = $hexManager->getAllHexData();
        
        $loadTime = (microtime(true) - $startTime) * 1000;
        
        echo "<p>✅ Load all data: " . number_format($loadTime, 2) . "ms</p>\n";
        
        // Test coordinate system performance
        $startTime = microtime(true);
        
        $coordSystem = new CoordinateSystem(25);
        
        // Test 1000 coordinate conversions
        for ($i = 0; $i < 1000; $i++) {
            $q = rand(-20, 20);
            $r = rand(-20, 20);
            $pixel = $coordSystem->axialToPixel($q, $r);
            $hex = $coordSystem->pixelToAxial($pixel['x'], $pixel['y']);
        }
        
        $coordTime = (microtime(true) - $startTime) * 1000;
        
        echo "<p>✅ 1000 coordinate conversions: " . number_format($coordTime, 2) . "ms</p>\n";
        
        // Memory usage check
        $memoryUsage = memory_get_usage(true) / 1024 / 1024;
        echo "<p>✅ Current memory usage: " . number_format($memoryUsage, 2) . "MB</p>\n";
        
        echo "<p>✅ Performance test completed successfully</p>\n";
        
    } catch (Exception $e) {
        echo "<p>❌ Performance test failed: " . htmlspecialchars($e->getMessage()) . "</p>\n";
    }
}

function createSampleBackgroundImage() {
    $imagePath = __DIR__ . '/images/sample-background.png';
    
    if (file_exists($imagePath)) {
        echo "<p>✅ Sample background already exists</p>\n";
        return;
    }
    
    // Create a simple sample background image
    $width = 1200;
    $height = 800;
    $image = imagecreatetruecolor($width, $height);
    
    // Create gradient background
    for ($y = 0; $y < $height; $y++) {
        $color = imagecolorallocate($image, 
            30 + ($y / $height) * 50,  // R
            60 + ($y / $height) * 80,  // G
            90 + ($y / $height) * 100  // B
        );
        imageline($image, 0, $y, $width, $y, $color);
    }
    
    // Add some text
    $white = imagecolorallocate($image, 255, 255, 255);
    imagestring($image, 5, 50, 50, "Strixhaven Map", $white);
    imagestring($image, 3, 50, 100, "Replace this with your actual map image", $white);
    imagestring($image, 2, 50, 130, "Supported formats: PNG, JPG, GIF, WebP", $white);
    
    // Save the image
    if (imagepng($image, $imagePath)) {
        echo "<p>✅ Created sample background image</p>\n";
    } else {
        echo "<p>⚠️ Could not create sample background image</p>\n";
    }
    
    imagedestroy($image);
}

// Add some basic styling if viewed in browser
if (php_sapi_name() !== 'cli') {
    echo "<style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1, h2 { color: #333; }
        p { line-height: 1.5; }
        ul { list-style-type: none; padding-left: 0; }
        li { margin: 5px 0; padding: 5px; background: #f5f5f5; border-radius: 3px; }
    </style>";
}
?>