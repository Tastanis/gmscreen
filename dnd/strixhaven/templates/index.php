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
        if ($data && isset($data['templates'])) {
            return $data;
        }
    }
    
    // Return default structure
    return [
        'templates' => [],
        'metadata' => [
            'last_updated' => date('Y-m-d H:i:s'),
            'version' => '1.0.0'
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
</head>
<body>
    <div class="top-nav">
        <button class="back-btn" onclick="window.close()">← Back to Dashboard</button>
        <h1 class="page-title">Organizational Templates</h1>
    </div>

    <div class="main-container">
        <!-- Template Tabs -->
        <div class="template-tabs-container">
            <div class="template-tabs" id="template-tabs">
                <!-- Tabs will be dynamically generated -->
            </div>
            <button class="add-template-btn" onclick="addNewTemplate()">+ Add New Template</button>
        </div>

        <!-- Template Content -->
        <div class="template-content" id="template-content">
            <div class="no-template-message" id="no-template-message">
                <p>No templates yet. Click "Add New Template" to create your first template.</p>
            </div>

            <!-- Template Form (hidden by default) -->
            <div class="template-form" id="template-form" style="display: none;">
                <div class="template-header">
                    <input type="text" id="template-title" class="template-title-input" placeholder="Template Title" <?php echo !$is_gm ? 'readonly' : ''; ?>>
                    <?php if ($is_gm): ?>
                        <button class="delete-template-btn" onclick="deleteCurrentTemplate()">Delete Template</button>
                    <?php endif; ?>
                </div>

                <div class="template-body">
                    <!-- Image Upload Section -->
                    <div class="image-section">
                        <div class="image-container">
                            <img id="template-image" src="" alt="Template Image" style="display: none;">
                            <div id="image-placeholder" class="image-placeholder">
                                <p>No Image</p>
                                <?php if ($is_gm): ?>
                                    <button class="upload-image-btn" onclick="uploadImage()">Upload Image</button>
                                <?php endif; ?>
                            </div>
                        </div>
                        <input type="file" id="image-upload" accept="image/*" style="display: none;" onchange="handleImageUpload(event)">
                    </div>

                    <!-- Template Fields -->
                    <div class="template-fields">
                        <div class="field-section">
                            <label>Section 1: Notes</label>
                            <textarea id="section1" class="template-field" rows="4" placeholder="Enter notes here..." <?php echo !$is_gm ? 'readonly' : ''; ?>></textarea>
                        </div>

                        <div class="field-section">
                            <label>Section 2: Details</label>
                            <textarea id="section2" class="template-field" rows="4" placeholder="Enter details here..." <?php echo !$is_gm ? 'readonly' : ''; ?>></textarea>
                        </div>

                        <div class="field-section">
                            <label>Section 3: Important Information</label>
                            <textarea id="section3" class="template-field" rows="4" placeholder="Enter important information here..." <?php echo !$is_gm ? 'readonly' : ''; ?>></textarea>
                        </div>

                        <div class="field-section">
                            <label>Section 4: Additional Notes</label>
                            <textarea id="section4" class="template-field" rows="4" placeholder="Enter additional notes here..." <?php echo !$is_gm ? 'readonly' : ''; ?>></textarea>
                        </div>

                        <div class="field-section">
                            <label>Section 5: References</label>
                            <textarea id="section5" class="template-field" rows="4" placeholder="Enter references here..." <?php echo !$is_gm ? 'readonly' : ''; ?>></textarea>
                        </div>

                        <div class="field-section">
                            <label>Section 6: Summary</label>
                            <textarea id="section6" class="template-field" rows="4" placeholder="Enter summary here..." <?php echo !$is_gm ? 'readonly' : ''; ?>></textarea>
                        </div>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="action-buttons">
                    <button class="print-btn" onclick="printTemplate()">Print Template</button>
                    <?php if ($is_gm): ?>
                        <button class="save-btn" onclick="saveTemplateData()">Save Changes</button>
                        <button class="backup-btn" onclick="createManualBackup()">Create Backup</button>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Save Status -->
    <div id="save-status" class="save-status"></div>

    <!-- Delete Confirmation Modal -->
    <div id="delete-modal" class="modal" style="display: none;">
        <div class="modal-content">
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete this template? This action cannot be undone.</p>
            <div class="modal-buttons">
                <button class="btn-danger" onclick="confirmDelete()">Delete</button>
                <button class="btn-secondary" onclick="cancelDelete()">Cancel</button>
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
        let currentTemplateId = null;
        let hasUnsavedChanges = false;
        let autoSaveTimer = null;
        let lastBackupTime = Date.now();
    </script>
    <script src="js/templates.js"></script>
</body>
</html>