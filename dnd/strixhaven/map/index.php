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

// Include navigation bar
require_once '../../includes/strix-nav.php';
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Map - 60x60 Hex Grid</title>

    <!-- Shared foundation (theme tokens + UI kit) loads before map CSS/JS -->
    <link rel="stylesheet" href="../../css/theme.css">
    <link rel="stylesheet" href="../../css/ui-kit.css">
    <link rel="stylesheet" href="css/map-ui.css">
    <script src="../../js/ui-kit.js"></script>
</head>
<body>
    <?php renderStrixNav('map'); ?>
    <div class="map-container">
        <!-- Main canvas for hex grid -->
        <canvas id="hex-canvas"></canvas>

        <!-- Loading overlay (removed by hex-grid.js once the map image loads) -->
        <div id="map-loading-overlay" class="map-loading-overlay">
            <div class="map-loading-spinner"></div>
            <div>Loading map&hellip;</div>
        </div>

        <!-- Ping Layer (for cross-user pings) -->
        <div id="ping-layer" class="map-ping-layer"></div>

        <!-- Controls -->
        <div class="controls">
            <button onclick="resetView()">Reset View</button>
            <button onclick="zoomIn()">Zoom In</button>
            <button onclick="zoomOut()">Zoom Out</button>
            <button id="player-path-toggle" type="button">Player Path</button>
        </div>

        <div id="player-path-panel" class="player-path-panel">
            <h3>Player Path <span id="player-path-sync" class="player-path-sync" title="Waiting for sync"></span></h3>
            <div class="player-path-tools">
                <button id="player-path-marker-tool" type="button">Destination</button>
                <button id="player-path-draw-tool" type="button">Draw</button>
                <button id="player-path-delete-tool" type="button">Delete</button>
                <button id="player-path-new-section" type="button">New Line</button>
            </div>
            <?php if ($isGM): ?>
                <div class="player-path-actions player-path-actions--single">
                    <button id="player-terrain-toggle" type="button">Terrain</button>
                </div>
                <div id="player-terrain-panel" class="player-terrain-panel">
                    <h4>Travel Difficulty</h4>
                    <div class="player-terrain-tools">
                        <button class="terrain-normal" type="button" data-terrain-difficulty="normal">Normal</button>
                        <button class="terrain-fast" type="button" data-terrain-difficulty="fast">Easy</button>
                        <button class="terrain-yellow" type="button" data-terrain-difficulty="yellow">Yellow</button>
                        <button class="terrain-red" type="button" data-terrain-difficulty="red">Red</button>
                    </div>
                </div>
            <?php endif; ?>
            <div class="player-path-actions">
                <button id="player-path-undo" type="button">Undo</button>
                <button id="player-path-clear" type="button">Clear All</button>
            </div>
            <div class="player-path-total">Total: <span id="player-path-total">0 hexes</span></div>
            <div id="player-path-status" class="player-path-status">Press Shift for player path mode.</div>
        </div>
        
        <!-- Info panel -->
        <div class="info-panel">
            <div>User: <?php echo htmlspecialchars($user); ?> <?php if ($isGM): ?><span class="info-gm-tag">(GM)</span><?php endif; ?></div>
            <div>Hex: <span id="hex-info">-</span></div>
            <div>Zoom: <span id="zoom-info">100%</span></div>
            <div class="info-hints">
                <div>Alt+Click: Ping</div>
                <div>Alt+Right: Focus all</div>
            </div>
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
    <script src="js/player-path-layer.js"></script>
    <script src="js/hex-popup.js"></script>
    <script src="js/map-ping.js"></script>
    
    <script>
        // Global map interface
        let mapInterface;
        let pingManager;
        let playerPathLayer;

        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', function() {
            console.log('Initializing Strixhaven 60x60 hex grid...');

            mapInterface = new MapInterface();
            mapInterface.initialize();

            // Expose the interface globally for popup helpers (copy mode, etc.)
            window.mapInterface = mapInterface;

            // Initialize ping manager
            pingManager = new MapPingManager(mapInterface);
            window.pingManager = pingManager;

            // Initialize shared player path/destination overlay
            playerPathLayer = new PlayerPathLayer(mapInterface);
            playerPathLayer.initialize();
            mapInterface.hexGrid.setPlayerPathLayer(playerPathLayer);
            window.playerPathLayer = playerPathLayer;
            
            // Update info panel on mouse move
            document.getElementById('hex-canvas').addEventListener('mousemove', function(e) {
                if (mapInterface.hexGrid && mapInterface.hexGrid.hoveredHex) {
                    const hex = mapInterface.hexGrid.hoveredHex;
                    document.getElementById('hex-info').textContent = `(${hex.q}, ${hex.r})`;
                } else {
                    document.getElementById('hex-info').textContent = '-';
                }
            });

            showFirstVisitTips();
        });

        // First-visit tips (shown once, dismissed via click or after 12s)
        function showFirstVisitTips() {
            if (localStorage.getItem('strixMapTipsDismissed')) return;

            const tips = document.createElement('div');
            tips.className = 'map-tips';
            tips.setAttribute('role', 'status');
            tips.innerHTML = `
                <h4>Map controls</h4>
                <ul>
                    <li>Right-click drag to pan</li>
                    <li>Scroll to zoom</li>
                    <li>Click a hex for details</li>
                    <li>Alt+Click to ping</li>
                </ul>
                <div class="map-tips-dismiss">Click to dismiss</div>
            `;

            const dismiss = () => {
                localStorage.setItem('strixMapTipsDismissed', '1');
                tips.remove();
            };
            tips.addEventListener('click', dismiss);
            setTimeout(() => {
                if (tips.parentNode) dismiss();
            }, 12000);

            document.body.appendChild(tips);
        }
        
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
    </script>
    
    <!-- Hex Details Popup -->
    <div id="hex-popup" class="hex-popup" style="display: none;">
        <div class="hex-popup-content">
            <span class="hex-popup-close" onclick="closeHexPopup()">&times;</span>
            <h2 id="hex-coords">Hex (0, 0)</h2>
            
            <!-- GM Section (visible only to GM, shown first) -->
            <div id="gm-section" class="hex-section gm-only" style="display: none;">
                <h2 class="section-title">GM Section <span class="gm-badge">GM only</span></h2>

                <div class="hex-title-container">
                    <label class="hex-field-label" for="gm-title">Location Title (GM):</label>
                    <input type="text" id="gm-title" class="hex-title-input" placeholder="Enter location name (visible only to GM)...">
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
                
                <div class="gm-actions">
                    <button onclick="startCopyMode()" class="copy-btn">
                        Copy Data From Another Hex
                    </button>
                    <button onclick="resetHexData()" class="reset-btn">
                        Reset Hex Data
                    </button>
                    <button onclick="showPlayersFromGm()" class="show-players-btn">
                        Show Players
                    </button>
                </div>
            </div>
            
            <!-- Player Section (visible to all users) -->
            <div id="player-section" class="hex-section hex-section--player">
                <h2 class="section-title">Player Section</h2>

                <div class="hex-title-container">
                    <label class="hex-field-label" for="player-title">Location Title:</label>
                    <input type="text" id="player-title" class="hex-title-input" placeholder="Enter location name (visible to all players)...">
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
                <button id="hex-save-btn" onclick="saveHexData()">Save</button>
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
        <div class="tooltip-marker-note" style="display: none;"></div>
    </div>

    <div id="player-marker-modal" class="player-marker-modal" style="display: none;">
        <div class="player-marker-card">
            <button id="player-marker-close" class="player-marker-close" type="button" aria-label="Close">&times;</button>
            <h2 id="player-marker-title">Destination</h2>
            <textarea id="player-marker-note" placeholder="Add a quick destination note..."></textarea>
            <div class="player-marker-actions">
                <button id="player-marker-delete" class="delete" type="button">Delete</button>
                <button id="player-marker-cancel" class="cancel" type="button">Cancel</button>
                <button id="player-marker-save" class="save" type="button">Save</button>
            </div>
        </div>
    </div>
</body>
</html>
