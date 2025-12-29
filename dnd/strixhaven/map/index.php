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
        
        /* Hex Popup Styles - DND Dashboard Theme */
        .hex-popup {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: flex;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(10px);
        }
        
        .hex-popup-content {
            background: rgba(255, 255, 255, 0.95);
            color: #2c3e50;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.2);
            max-width: 500px;
            width: 95%;
            max-height: 85%;
            overflow-y: auto;
            position: relative;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .hex-popup-close {
            position: absolute;
            top: 15px;
            right: 20px;
            font-size: 28px;
            font-weight: bold;
            color: #666;
            cursor: pointer;
            transition: color 0.3s ease;
        }
        
        .hex-popup-close:hover {
            color: #667eea;
        }
        
        .hex-popup h2 {
            margin-top: 0;
            color: #2c3e50;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 15px;
            font-size: 1.5em;
            font-weight: 600;
        }
        
        .hex-popup-actions {
            margin-top: 25px;
            text-align: right;
            padding-top: 20px;
            border-top: 1px solid #ecf0f1;
        }
        
        .hex-popup-actions button {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1em;
            font-weight: 500;
            margin-left: 10px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        
        .hex-popup-actions button:hover {
            background: #5a67d8;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        /* Section Styling */
        .hex-section {
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.7);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .hex-section:last-of-type {
            margin-bottom: 0;
        }
        
        .section-title {
            color: #667eea;
            font-size: 1.3em;
            font-weight: 600;
            margin: 0 0 20px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        
        .gm-only {
            border-left: 4px solid #667eea;
        }
        
        .hex-images-container {
            margin-bottom: 25px;
        }
        
        .hex-images-container h3 {
            color: #34495e;
            margin-bottom: 15px;
            font-size: 16px;
            font-weight: 600;
        }
        
        .hex-image-upload {
            margin-bottom: 15px;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
        }

        .hex-image-upload .upload-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .hex-image-upload .upload-btn:hover {
            background: #5a67d8;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }

        .hex-image-upload .upload-btn--secondary {
            background: rgba(102, 126, 234, 0.18);
            color: #3248c4;
            box-shadow: none;
        }

        .hex-image-upload .upload-btn--secondary:hover {
            background: rgba(102, 126, 234, 0.28);
            color: #2537a0;
            box-shadow: 0 2px 6px rgba(37, 55, 160, 0.25);
        }

        .hex-image-upload .upload-btn:disabled,
        .hex-image-upload .upload-btn--disabled {
            background: rgba(148, 163, 184, 0.35);
            color: rgba(44, 62, 80, 0.6);
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        .hex-images-gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            gap: 12px;
            min-height: 100px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.8);
            border-radius: 8px;
            border: 2px solid #ecf0f1;
        }
        
        .hex-images-gallery.single-image {
            grid-template-columns: 1fr;
            max-width: 200px;
        }
        
        .hex-image-thumb {
            position: relative;
            aspect-ratio: 1;
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .hex-image-thumb:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }
        
        .hex-image-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .hex-notes-container h3 {
            color: #34495e;
            margin-bottom: 15px;
            font-size: 16px;
            font-weight: 600;
        }
        
        .notes-controls {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        
        .edit-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .edit-btn:hover {
            background: #5a67d8;
            transform: translateY(-1px);
            box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
        }
        
        .edit-btn.editing {
            background: #e74c3c;
        }
        
        .edit-status {
            font-size: 13px;
            color: #666;
            font-weight: 500;
        }
        
        .hex-notes {
            width: 100%;
            min-height: 120px;
            background: rgba(255, 255, 255, 0.9);
            color: #2c3e50;
            border: 2px solid #ecf0f1;
            border-radius: 8px;
            padding: 12px;
            resize: vertical;
            font-family: inherit;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        
        .hex-notes[readonly] {
            background: rgba(255, 255, 255, 0.6);
            cursor: not-allowed;
            color: #666;
        }
        
        .hex-notes:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        /* Image Lightbox Styles */
        .image-lightbox {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 2000;
            display: flex;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(5px);
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
            font-size: 32px;
            color: white;
            cursor: pointer;
            z-index: 2001;
            transition: color 0.3s ease;
        }
        
        .lightbox-close:hover {
            color: #667eea;
        }
        
        #lightbox-image {
            max-width: 100%;
            max-height: calc(100vh - 100px);
            border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        
        .lightbox-actions {
            margin-top: 20px;
        }
        
        .lightbox-actions button {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 18px;
            border-radius: 8px;
            cursor: pointer;
            margin: 0 8px;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        }
        
        .lightbox-actions .delete-btn {
            background: #e74c3c;
        }
        
        .lightbox-actions button:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        /* Hex Tooltip Styles */
        #hex-tooltip {
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            pointer-events: none;
            z-index: 2000;
            max-width: 250px;
            display: none;
            backdrop-filter: blur(5px);
        }
        
        #hex-tooltip .tooltip-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #667eea;
        }
        
        #hex-tooltip .tooltip-image {
            width: 100%;
            max-width: 200px;
            height: auto;
            border-radius: 6px;
            margin-top: 8px;
        }
        
        #hex-tooltip.visible {
            display: block;
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

            // Expose the interface globally for popup helpers (copy mode, etc.)
            window.mapInterface = mapInterface;
            
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
            
            <!-- GM Section (visible only to GM, shown first) -->
            <div id="gm-section" class="hex-section gm-only" style="display: none;">
                <h2 class="section-title">GM Section</h2>
                
                <div class="hex-title-container" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #667eea;">Location Title (GM):</label>
                    <input type="text" id="gm-title" class="hex-title-input" placeholder="Enter location name (visible only to GM)..." 
                           style="width: 100%; padding: 10px; border: 2px solid #ecf0f1; border-radius: 6px; font-size: 16px; background: rgba(255, 255, 255, 0.9); color: #2c3e50;">
                </div>
                
                <div class="hex-images-container">
                    <h3>GM Images</h3>
                    <div class="hex-image-upload">
                        <button type="button" onclick="uploadHexImage('gm')" class="upload-btn">Upload Image</button>
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
                
                <div class="gm-actions" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #ecf0f1;">
                    <button onclick="startCopyMode()" class="copy-btn" style="background: #2ecc71; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; margin-right: 10px;">
                        Copy Data From Another Hex
                    </button>
                    <button onclick="resetHexData()" class="reset-btn" style="background: #e74c3c; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">
                        Reset Hex Data
                    </button>
                    <button onclick="showPlayersFromGm()" class="show-players-btn" style="background: #667eea; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; margin-left: 10px;">
                        Show Players
                    </button>
                </div>
            </div>
            
            <!-- Player Section (visible to all users) -->
            <div id="player-section" class="hex-section">
                <h2 class="section-title">Player Section</h2>
                
                <div class="hex-title-container" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #667eea;">Location Title:</label>
                    <input type="text" id="player-title" class="hex-title-input" placeholder="Enter location name (visible to all players)..." 
                           style="width: 100%; padding: 10px; border: 2px solid #ecf0f1; border-radius: 6px; font-size: 16px; background: rgba(255, 255, 255, 0.9); color: #2c3e50;">
                </div>
                
                <div class="hex-images-container">
                    <h3>Images</h3>
                    <div class="hex-image-upload">
                        <button type="button" onclick="uploadHexImage('player')" class="upload-btn">Upload Image</button>
                        <input type="file" id="player-image-upload" accept="image/*" style="display: none;">
                        <?php if ($isGM): ?>
                            <button type="button" id="player-use-gm-image" class="upload-btn upload-btn--secondary" onclick="useGmImagesForPlayers()">
                                Use GM Image
                            </button>
                        <?php endif; ?>
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
    
    <!-- Hex Tooltip -->
    <div id="hex-tooltip">
        <div class="tooltip-title"></div>
        <img class="tooltip-image" style="display: none;">
    </div>
</body>
</html>
