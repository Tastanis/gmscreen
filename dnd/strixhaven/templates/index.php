<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';

// Include backup helper
require_once 'includes/backup-helper.php';

// Data file path
$dataFile = 'data/templates.json';

// Load templates data
function loadTemplatesData() {
    global $dataFile;
    
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data && isset($data['folders'])) {
            return $data;
        }
    }
    
    // Return default structure
    return [
        'folders' => [],
        'metadata' => [
            'last_updated' => date('Y-m-d H:i:s'),
            'version' => '2.0.0'
        ]
    ];
}

// Initialize data
$templatesData = loadTemplatesData();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Organizational Templates - Strixhaven</title>
    <link rel="stylesheet" href="../../css/style.css">
    <link rel="stylesheet" href="css/templates.css">
    <link rel="stylesheet" href="css/template-editor.css">
</head>
<body>
    <div class="template-container">
        <!-- Left Sidebar -->
        <div class="template-sidebar">
            <div class="sidebar-header">
                <h2>Templates</h2>
                <button class="back-btn" onclick="window.close()">← Back</button>
            </div>
            
            <div class="folder-tree" id="folder-tree">
                <!-- Folders will be dynamically generated -->
            </div>
            
            <?php if ($is_gm): ?>
                <div class="sidebar-footer">
                    <button class="add-folder-btn" onclick="addNewFolder()">+ Add Folder</button>
                    <button class="delete-mode-btn" id="delete-mode-btn" onclick="toggleDeleteMode()">Delete Mode</button>
                    <button class="data-recovery-btn" onclick="window.location.href='templates-recovery.php'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17,8 12,3 7,8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        Data Recovery
                    </button>
                </div>
            <?php endif; ?>
        </div>

        <!-- Main Content Area -->
        <div class="template-main">
            <!-- Template Strip -->
            <div class="template-strip-container" id="template-strip-container" style="display: none;">
                <button class="strip-nav-btn strip-nav-left" onclick="scrollTemplateStrip('left')">◀</button>
                <div class="template-strip" id="template-strip">
                    <!-- Template thumbnails will be dynamically generated -->
                </div>
                <button class="strip-nav-btn strip-nav-right" onclick="scrollTemplateStrip('right')">▶</button>
                <?php if ($is_gm): ?>
                    <button class="add-template-btn" onclick="addNewTemplate()">+</button>
                <?php endif; ?>
            </div>

            <!-- Template Content -->
            <div class="template-content" id="template-content">
                <div class="no-template-message" id="no-template-message">
                    <p>Select a folder and subfolder to view templates</p>
                </div>

                <!-- Template Form (hidden by default) -->
                <div class="template-form" id="template-form" style="display: none;">
                    <div class="template-page">
                        <!-- Header Section -->
                        <div class="template-header-section">
                            <div class="header-left">
                                <input type="text" id="template-title" class="template-title-input" placeholder="Template Title" <?php echo !$is_gm ? 'readonly' : ''; ?>>
                            </div>
                            <div class="header-right">
                                <div class="image-and-circle">
                                    <div class="image-container">
                                        <img id="template-image" src="" alt="Template Image" style="display: none;" tabindex="0" role="button" aria-label="View template image">
                                        <div id="image-placeholder" class="image-placeholder">
                                            <p>No Image</p>
                                            <?php if ($is_gm): ?>
                                                <button class="upload-image-btn" onclick="uploadImage()">Upload</button>
                                            <?php endif; ?>
                                        </div>
                                    </div>
                                    <div class="color-circle-container">
                                        <div id="color-circle" class="color-circle" <?php echo $is_gm ? 'onclick="changeColor()"' : ''; ?>></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Template Sections -->
                        <div class="template-sections">
                            <div class="template-section">
                                <label>1. Origin (where from?)</label>
                                <div class="rich-text-container" id="origin-container"></div>
                            </div>

                            <div class="template-section">
                                <label>2. Motive (Want)</label>
                                <div class="rich-text-container" id="motive-container"></div>
                            </div>

                            <div class="template-section">
                                <label>3. Fear (what threatens it)</label>
                                <div class="rich-text-container" id="fear-container"></div>
                            </div>

                            <div class="template-section">
                                <label>4. Connections</label>
                                <div class="rich-text-container" id="connections-container"></div>
                            </div>

                            <div class="template-section">
                                <label>5. Change (how will the world impact it)</label>
                                <div class="rich-text-container" id="change-container"></div>
                            </div>

                            <div class="template-section">
                                <label>6. Impact (how will it impact the world)</label>
                                <div class="impact-subsection">
                                    <label class="sublabel">(if it gets what it wants)</label>
                                    <div class="rich-text-container" id="impact-positive-container"></div>
                                </div>
                                <div class="impact-subsection">
                                    <label class="sublabel">(if it doesn't get what it wants)</label>
                                    <div class="rich-text-container" id="impact-negative-container"></div>
                                </div>
                            </div>

                            <div class="template-divider"></div>

                            <div class="template-section story-section">
                                <label>The Story</label>
                                <div class="rich-text-container" id="story-container"></div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="action-buttons no-print">
                            <button class="print-btn" onclick="printTemplate()">Print</button>
                            <?php if ($is_gm): ?>
                                <button class="save-btn" onclick="saveTemplateData()">Save</button>
                                <button class="delete-btn" onclick="deleteCurrentTemplate()">Delete</button>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Hidden file input for image uploads -->
    <input type="file" id="image-upload" accept="image/*" style="display: none;" onchange="handleImageUpload(event)">

    <!-- Context Menu -->
    <div id="context-menu" class="context-menu" style="display: none;">
        <div class="context-menu-item" onclick="renameItem()">Rename</div>
        <div class="context-menu-item" onclick="deleteItem()">Delete</div>
    </div>

    <!-- Save Status -->
    <div id="save-status" class="save-status"></div>

    <!-- Delete Confirmation Modal -->
    <div id="delete-modal" class="modal" style="display: none;">
        <div class="modal-content">
            <h3>Confirm Delete</h3>
            <p id="delete-message">Are you sure you want to delete this?</p>
            <div class="modal-buttons">
                <button class="btn-danger" onclick="confirmDelete()">Delete</button>
                <button class="btn-secondary" onclick="cancelDelete()">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Image Preview Modal -->
    <div id="image-modal" class="modal" style="display: none;" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Template image preview">
        <div class="image-modal-content">
            <button type="button" id="image-modal-close" class="image-modal-close" aria-label="Close image preview">&times;</button>
            <img id="image-modal-img" src="" alt="Template Image Preview">
            <div class="image-modal-actions">
                <a id="image-modal-open" class="image-modal-link" href="#" target="_blank" rel="noopener noreferrer">Open in new tab</a>
                <a id="image-modal-download" class="image-modal-link image-modal-download" href="#" download>Download</a>
            </div>
        </div>
    </div>

    <!-- Version footer -->
    <div class="version-footer">
        <span class="version-info"><?php echo Version::displayVersion(); ?></span>
        <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
    </div>

    <script>
        // Global variables
        const isGM = <?php echo $is_gm ? 'true' : 'false'; ?>;
        const currentUser = '<?php echo $user; ?>';
        let templatesData = <?php echo json_encode($templatesData); ?>;
        let currentFolderId = null;
        let currentSubfolderId = null;
        let currentTemplateId = null;
        let hasUnsavedChanges = false;
        let autoSaveTimer = null;
        let lastBackupTime = Date.now();
        let richTextEditors = {};
        let contextMenuTarget = null;
        let contextMenuType = null;
        
        // Color settings
        const colors = ['#4CAF50', '#F44336', '#FFEB3B', '#9C27B0', '#2196F3', '#FFFFFF'];
        const colorNames = ['green', 'red', 'yellow', 'purple', 'blue', 'white'];
        let currentColorIndex = 0;
        
        // Delete mode
        let isDeleteMode = false;
    </script>
    
    <!-- Load scripts in correct order -->
    <script src="js/template-rich-editor.js"></script>
    <script src="js/template-character-lookup.js"></script>
    <script src="js/templates.js"></script>
</body>
</html>