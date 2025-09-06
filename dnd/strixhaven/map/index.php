<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';

$user = $_SESSION['user'] ?? 'unknown';
$isGM = ($user === 'GM');
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Map - Interactive Hex Grid</title>
    
    <!-- CSS Files -->
    <link rel="stylesheet" href="../../css/style.css">
    <link rel="stylesheet" href="css/hex-map.css">
    
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #1a1a2e;
            color: #eee;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow: hidden;
        }
        
        .map-container {
            position: relative;
            width: 100vw;
            height: 100vh;
            overflow: hidden;
        }
        
        #hex-canvas {
            position: absolute;
            top: 0;
            left: 0;
            cursor: crosshair;
            background: #2a2a3e;
        }
        
        .map-ui {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 1000;
            background: rgba(26, 26, 46, 0.9);
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #4a4a6a;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .map-controls {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .map-controls button {
            background: #4a4a6a;
            color: #eee;
            border: 1px solid #6a6a8a;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .map-controls button:hover {
            background: #6a6a8a;
        }
        
        .zoom-controls {
            display: flex;
            gap: 5px;
            align-items: center;
        }
        
        .zoom-level {
            min-width: 60px;
            text-align: center;
            font-size: 12px;
        }
        
        .status-bar {
            position: absolute;
            bottom: 10px;
            left: 10px;
            right: 10px;
            z-index: 1000;
            background: rgba(26, 26, 46, 0.9);
            padding: 8px 15px;
            border-radius: 4px;
            border: 1px solid #4a4a6a;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
        }
        
        .coordinates {
            color: #8a8aaa;
        }
        
        .loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(26, 26, 46, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            font-size: 18px;
        }
        
        .hidden {
            display: none !important;
        }
        
        /* Version footer */
        .version-footer {
            position: absolute;
            bottom: 10px;
            right: 10px;
            font-size: 10px;
            color: #666;
            background: rgba(0, 0, 0, 0.5);
            padding: 4px 8px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="map-container">
        <!-- Loading overlay -->
        <div id="loading-overlay" class="loading-overlay">
            <div>Loading Strixhaven Map...</div>
        </div>
        
        <!-- Map UI Controls -->
        <div class="map-ui">
            <h3 style="margin: 0 0 10px 0;">Strixhaven Map</h3>
            <div class="map-controls">
                <button id="reset-view">Reset View</button>
                <button id="toggle-grid">Toggle Grid</button>
                <?php if ($isGM): ?>
                    <button id="admin-mode">GM Mode</button>
                <?php endif; ?>
            </div>
            <div class="zoom-controls">
                <button id="zoom-out">-</button>
                <div class="zoom-level" id="zoom-level">100%</div>
                <button id="zoom-in">+</button>
            </div>
        </div>
        
        <!-- Main canvas -->
        <canvas id="hex-canvas"></canvas>
        
        <!-- Status bar -->
        <div class="status-bar">
            <div class="coordinates">
                <span>Mouse: <span id="mouse-coords">-</span></span>
                <span style="margin-left: 20px;">Hex: <span id="hex-coords">-</span></span>
            </div>
            <div class="user-info">
                User: <?php echo htmlspecialchars($user); ?> 
                <?php if ($isGM): ?><span style="color: #ff6b6b;">(GM)</span><?php endif; ?>
            </div>
        </div>
        
        <!-- Version footer -->
        <div class="version-footer">
            <span class="version-info"><?php echo Version::displayVersion(); ?></span>
            <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
        </div>
    </div>

    <!-- JavaScript Files -->
    <script src="js/coordinate-system.js"></script>
    <script src="js/hex-grid.js"></script>
    <script src="js/zoom-pan.js"></script>
    <script src="js/hex-data-manager.js"></script>
    <script src="js/map-interface.js"></script>
    
    <script>
        // Initialize map system when page loads
        document.addEventListener('DOMContentLoaded', function() {
            const mapInterface = new MapInterface();
            mapInterface.initialize();
        });
        
        // Pass PHP variables to JavaScript
        window.USER_DATA = {
            username: '<?php echo htmlspecialchars($user); ?>',
            isGM: <?php echo $isGM ? 'true' : 'false'; ?>,
            sessionId: '<?php echo session_id(); ?>'
        };
    </script>
</body>
</html>