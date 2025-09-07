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
            background: #1a1a2e;
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
        
        /* Hex Popup Styles */
        .hex-popup {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .hex-popup-content {
            background: #2a2a3e;
            color: #eee;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 90%;
            max-height: 80%;
            overflow-y: auto;
            position: relative;
        }
        
        .hex-popup-close {
            position: absolute;
            top: 10px;
            right: 15px;
            font-size: 24px;
            font-weight: bold;
            color: #aaa;
            cursor: pointer;
        }
        
        .hex-popup-close:hover {
            color: #fff;
        }
        
        .hex-popup h2 {
            margin-top: 0;
            color: #ff6b6b;
            border-bottom: 1px solid #4a4a6a;
            padding-bottom: 10px;
        }
        
        .hex-popup-actions {
            margin-top: 20px;
            text-align: right;
        }
        
        .hex-popup-actions button {
            background: #4a4a6a;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .hex-popup-actions button:hover {
            background: #6a6a8a;
        }
        
        /* Enhanced Hex Popup Styles */
        .hex-popup-tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 2px solid #4a4a6a;
        }
        
        .hex-tab {
            background: transparent;
            color: #aaa;
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            border-bottom: 3px solid transparent;
            transition: all 0.3s ease;
        }
        
        .hex-tab.active {
            color: #ff6b6b;
            border-bottom-color: #ff6b6b;
        }
        
        .hex-tab:hover {
            color: #fff;
        }
        
        .hex-section {
            display: none;
        }
        
        .hex-section.active {
            display: block;
        }
        
        .hex-images-container {
            margin-bottom: 25px;
        }
        
        .hex-images-container h3 {
            color: #ff6b6b;
            margin-bottom: 10px;
            font-size: 16px;
        }
        
        .hex-image-upload {
            margin-bottom: 15px;
        }
        
        .hex-image-upload .upload-btn {
            background: #4a4a6a;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .hex-image-upload .upload-btn:hover {
            background: #6a6a8a;
        }
        
        .hex-images-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            gap: 10px;
            min-height: 100px;
            padding: 10px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 5px;
        }
        
        .hex-images-gallery.single-image {
            grid-template-columns: 1fr;
            max-width: 200px;
        }
        
        .hex-image-thumb {
            position: relative;
            aspect-ratio: 1;
            border-radius: 4px;
            overflow: hidden;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        
        .hex-image-thumb:hover {
            transform: scale(1.05);
        }
        
        .hex-image-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .hex-notes-container h3 {
            color: #ff6b6b;
            margin-bottom: 10px;
            font-size: 16px;
        }
        
        .notes-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }
        
        .edit-btn {
            background: #4a4a6a;
            color: white;
            border: none;
            padding: 5px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .edit-btn:hover {
            background: #6a6a8a;
        }
        
        .edit-btn.editing {
            background: #ff6b6b;
        }
        
        .edit-status {
            font-size: 12px;
            color: #aaa;
        }
        
        .hex-notes {
            width: 100%;
            min-height: 120px;
            background: rgba(0, 0, 0, 0.3);
            color: #eee;
            border: 1px solid #4a4a6a;
            border-radius: 4px;
            padding: 10px;
            resize: vertical;
            font-family: inherit;
        }
        
        .hex-notes[readonly] {
            background: rgba(0, 0, 0, 0.1);
            cursor: not-allowed;
        }
        
        .hex-notes:focus {
            outline: none;
            border-color: #ff6b6b;
        }
        
        /* Image Lightbox Styles */
        .image-lightbox {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 2000;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .lightbox-content {
            position: relative;
            max-width: 90%;
            max-height: 90%;
            text-align: center;
        }
        
        .lightbox-close {
            position: absolute;
            top: -40px;
            right: 0;
            font-size: 30px;
            color: white;
            cursor: pointer;
            z-index: 2001;
        }
        
        .lightbox-close:hover {
            color: #ff6b6b;
        }
        
        #lightbox-image {
            max-width: 100%;
            max-height: calc(100vh - 100px);
            border-radius: 5px;
        }
        
        .lightbox-actions {
            margin-top: 20px;
        }
        
        .lightbox-actions button {
            background: #4a4a6a;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 0 5px;
        }
        
        .lightbox-actions .delete-btn {
            background: #dc3545;
        }
        
        .lightbox-actions button:hover {
            opacity: 0.8;
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
            <div>User: <?php echo htmlspecialchars($user); ?> <?php if ($isGM): ?><span style="color: #ff6b6b;">(GM)</span><?php endif; ?></div>
            <div>Hex: <span id="hex-info">-</span></div>
            <div>Zoom: <span id="zoom-info">100%</span></div>
        </div>
        
        <!-- Version footer -->
        <div class="version-footer">
            <span class="version-info"><?php echo Version::displayVersion(); ?></span>
            <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
        </div>
    </div>

    <!-- JavaScript Files - Clean V2 System -->
    <script src="js/coordinate-system.js"></script>
    <script src="js/hex-grid.js"></script>
    <script src="js/map-interface.js"></script>
    <script src="js/hex-popup.js"></script>
    
    <script>
        // Global map interface
        let mapInterface;
        
        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', function() {
            console.log('Initializing Strixhaven 60x60 hex grid...');
            
            mapInterface = new MapInterface();
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
                // Center on hex (18,27)
                const centerOffset = mapInterface.getCenterOffsetForHex(18, 27);
                mapInterface.viewport = {
                    scale: 1,
                    offsetX: centerOffset.offsetX,
                    offsetY: centerOffset.offsetY
                };
                mapInterface.hexGrid.setViewport(1, centerOffset.offsetX, centerOffset.offsetY);
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
            isGM: <?php echo $isGM ? 'true' : 'false'; ?>,
            sessionId: '<?php echo session_id(); ?>'
        };
        
        // Function to close hex popup
        function closeHexPopup() {
            document.getElementById('hex-popup').style.display = 'none';
        }
    </script>
    
    <!-- Hex Details Popup -->
    <div id="hex-popup" class="hex-popup" style="display: none;">
        <div class="hex-popup-content">
            <span class="hex-popup-close" onclick="closeHexPopup()">&times;</span>
            <h2 id="hex-coords">Hex (0, 0)</h2>
            
            <!-- Section Tabs -->
            <div class="hex-popup-tabs">
                <button class="hex-tab active" data-section="player" onclick="switchHexTab('player')">Player</button>
                <button class="hex-tab" data-section="gm" onclick="switchHexTab('gm')" style="display: none;">GM</button>
            </div>
            
            <!-- Player Section -->
            <div id="player-section" class="hex-section active">
                <div class="hex-images-container">
                    <h3>Images</h3>
                    <div class="hex-image-upload">
                        <button onclick="uploadHexImage('player')" class="upload-btn">Upload Image</button>
                        <input type="file" id="player-image-upload" accept="image/*" style="display: none;">
                    </div>
                    <div id="player-images" class="hex-images-gallery">
                        <!-- Images will be populated here -->
                    </div>
                </div>
                
                <div class="hex-notes-container">
                    <h3>Player Notes</h3>
                    <div class="notes-controls">
                        <button id="player-edit-btn" onclick="toggleEdit('player')" class="edit-btn">Edit</button>
                        <span id="player-edit-status" class="edit-status"></span>
                    </div>
                    <textarea id="player-notes" class="hex-notes" placeholder="Add notes about this hex..." readonly></textarea>
                </div>
            </div>
            
            <!-- GM Section -->
            <div id="gm-section" class="hex-section" style="display: none;">
                <div class="hex-images-container">
                    <h3>GM Images</h3>
                    <div class="hex-image-upload">
                        <button onclick="uploadHexImage('gm')" class="upload-btn">Upload Image</button>
                        <input type="file" id="gm-image-upload" accept="image/*" style="display: none;">
                    </div>
                    <div id="gm-images" class="hex-images-gallery">
                        <!-- Images will be populated here -->
                    </div>
                </div>
                
                <div class="hex-notes-container">
                    <h3>GM Notes</h3>
                    <textarea id="gm-notes" class="hex-notes" placeholder="Add GM notes about this hex..."></textarea>
                </div>
            </div>
            
            <div class="hex-popup-actions">
                <button onclick="saveHexData()">Save</button>
                <button onclick="closeHexPopup()">Close</button>
            </div>
        </div>
    </div>
    
    <!-- Image Lightbox -->
    <div id="image-lightbox" class="image-lightbox" style="display: none;">
        <div class="lightbox-content">
            <span class="lightbox-close" onclick="closeLightbox()">&times;</span>
            <img id="lightbox-image" src="" alt="">
            <div class="lightbox-actions">
                <button onclick="deleteCurrentImage()" class="delete-btn">Delete Image</button>
                <button onclick="closeLightbox()">Close</button>
            </div>
        </div>
    </div>
</body>
</html>