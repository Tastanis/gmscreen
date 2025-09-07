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
    <title>Strixhaven Map - 60x60 Hex Grid</title>
    
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
            /* Background image - purely decorative */
            background-image: url('images/Strixhavenmap.png');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }
        
        #hex-canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            cursor: default;
            /* Canvas is transparent to show background */
            background: transparent;
        }
        
        .info-panel {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px;
            border-radius: 5px;
            font-size: 14px;
            z-index: 100;
        }
        
        .controls {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px;
            border-radius: 5px;
            z-index: 100;
        }
        
        .controls button {
            display: block;
            margin: 5px 0;
            padding: 5px 10px;
            background: #4a4a6a;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        
        .controls button:hover {
            background: #6a6a8a;
        }
        
        /* Version footer */
        .version-footer {
            position: absolute;
            bottom: 10px;
            right: 10px;
            font-size: 10px;
            color: #aaa;
            background: rgba(0, 0, 0, 0.5);
            padding: 4px 8px;
            border-radius: 4px;
            z-index: 100;
        }
    </style>
</head>
<body>
    <div class="map-container">
        <!-- Main canvas for hex grid -->
        <canvas id="hex-canvas"></canvas>
        
        <!-- Controls -->
        <div class="controls">
            <button onclick="resetView()">Reset View</button>
            <button onclick="zoomIn()">Zoom In</button>
            <button onclick="zoomOut()">Zoom Out</button>
        </div>
        
        <!-- Info panel -->
        <div class="info-panel">
            <div>User: <?php echo htmlspecialchars($user); ?></div>
            <div>Hex: <span id="hex-info">-</span></div>
            <div>Zoom: <span id="zoom-info">100%</span></div>
        </div>
        
        <!-- Version footer -->
        <div class="version-footer">
            <span class="version-info"><?php echo Version::displayVersion(); ?></span>
        </div>
    </div>

    <!-- JavaScript Files - V2 System -->
    <script src="js/coordinate-system-v2.js"></script>
    <script src="js/hex-grid-v2.js"></script>
    <script src="js/map-interface-v2.js"></script>
    
    <script>
        // Global map interface
        let mapInterface;
        
        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', function() {
            mapInterface = new MapInterfaceV2();
            mapInterface.initialize();
            
            // Update info panel on mouse move
            document.getElementById('hex-canvas').addEventListener('mousemove', function(e) {
                if (mapInterface.hexGrid && mapInterface.hexGrid.hoveredHex) {
                    const hex = mapInterface.hexGrid.hoveredHex;
                    document.getElementById('hex-info').textContent = `(${hex.q}, ${hex.r})`;
                } else {
                    document.getElementById('hex-info').textContent = '-';
                }
            });
        });
        
        // Control functions
        function resetView() {
            if (mapInterface) {
                mapInterface.viewport = {
                    scale: 1,
                    offsetX: 0,
                    offsetY: 0
                };
                mapInterface.hexGrid.setViewport(1, 0, 0);
                updateZoomInfo();
            }
        }
        
        function zoomIn() {
            if (mapInterface) {
                const newScale = Math.min(mapInterface.viewport.scale * 1.2, 3);
                mapInterface.viewport.scale = newScale;
                mapInterface.hexGrid.setViewport(
                    newScale,
                    mapInterface.viewport.offsetX,
                    mapInterface.viewport.offsetY
                );
                updateZoomInfo();
            }
        }
        
        function zoomOut() {
            if (mapInterface) {
                const newScale = Math.max(mapInterface.viewport.scale * 0.8, 0.5);
                mapInterface.viewport.scale = newScale;
                mapInterface.hexGrid.setViewport(
                    newScale,
                    mapInterface.viewport.offsetX,
                    mapInterface.viewport.offsetY
                );
                updateZoomInfo();
            }
        }
        
        function updateZoomInfo() {
            if (mapInterface) {
                const percent = Math.round(mapInterface.viewport.scale * 100);
                document.getElementById('zoom-info').textContent = percent + '%';
            }
        }
        
        // Pass PHP variables to JavaScript
        window.USER_DATA = {
            username: '<?php echo htmlspecialchars($user); ?>',
            isGM: <?php echo $isGM ? 'true' : 'false'; ?>
        };
    </script>
</body>
</html>