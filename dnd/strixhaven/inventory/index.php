<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');
$characters = array('frunk', 'sharon', 'indigo', 'zepha');

// Function to load inventory data
function loadInventoryData() {
    $dataFile = '../data/inventory.json';
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data) {
            return $data;
        }
    }
    
    // Return default data structure if file doesn't exist
    $default_data = array();
    foreach (array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm') as $section) {
        $default_data[$section] = array('items' => array());
    }
    return $default_data;
}

// Determine which tabs the user can see
$visibleTabs = array();
if ($is_gm) {
    $visibleTabs = array('frunk', 'sharon', 'indigo', 'zepha', 'shared', 'gm');
} else {
    $visibleTabs = array($user, 'shared', 'gm');
}

$defaultTab = $is_gm ? 'frunk' : $user;
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven Inventory - <?php echo htmlspecialchars($user); ?></title>
    <style>
        /* Reset and base styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        /* Header */
        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 15px 20px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 1000;
        }

        .header h1 {
            color: #2c3e50;
            font-size: 1.6em;
            font-weight: 600;
        }

        .close-btn {
            background: #e74c3c;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .close-btn:hover {
            background: #c0392b;
        }

        /* Main container */
        .main-container {
            max-width: 1600px;
            margin: 20px auto;
            padding: 0 20px;
        }

        /* Tab system */
        .inventory-tabs {
            display: flex;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 10px 10px 0 0;
            margin-bottom: 0;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            overflow-x: auto;
        }

        .inventory-tab {
            flex: 1;
            min-width: 120px;
            padding: 15px 20px;
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 1.1em;
            font-weight: 600;
            color: #666;
            transition: all 0.3s ease;
            border-bottom: 3px solid transparent;
            text-transform: capitalize;
        }

        .inventory-tab:hover {
            background: rgba(103, 126, 234, 0.1);
            color: #333;
        }

        .inventory-tab.active {
            background: rgba(103, 126, 234, 0.2);
            color: #2c3e50;
            border-bottom-color: #667eea;
        }

        /* Content wrapper */
        .content-wrapper {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 0 0 15px 15px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            min-height: 600px;
            padding: 20px;
        }

        /* Tab content */
        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        /* Add item section */
        .add-item-section {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .btn-add-item {
            background: #28a745;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }

        .btn-add-item:hover {
            background: #218838;
            transform: translateY(-1px);
        }

        .btn-add-item:disabled {
            background: #6c757d;
            cursor: not-allowed;
            transform: none;
        }

        /* Grid container */
        .inventory-grid-container {
            height: 600px;
            overflow: auto;
            border-radius: 8px;
            background: rgba(240, 240, 240, 0.3);
            padding: 20px;
        }

        .inventory-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            min-width: 100%;
            position: relative;
            align-content: flex-start;
            justify-content: flex-start;
        }

        /* Item cards - Made wider for 3 per row */
        .item-card {
            background: white;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            position: relative;
            width: calc(33.333% - 14px); /* 3 cards per row with gaps */
            min-width: 350px;
            min-height: 140px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .item-card:hover {
            border-color: #667eea;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .item-card.expanded {
            min-height: auto;
            height: auto;
            z-index: 100;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
            border-color: #667eea;
        }

        .item-card-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            margin-bottom: 10px;
        }

        .item-name {
            font-weight: 600;
            color: #2c3e50;
            font-size: 16px;
            margin-bottom: 10px;
            text-align: center;
            word-wrap: break-word;
        }

        .item-card.expanded .item-name {
            font-size: 18px;
            margin-bottom: 15px;
        }

        .item-image-small {
            width: 80px;
            height: 80px;
            object-fit: cover;
            border-radius: 6px;
            margin-bottom: 8px;
        }

        .item-image-large {
            width: 100%;
            max-height: 180px;
            object-fit: contain;
            border-radius: 8px;
            margin-bottom: 15px;
        }

        .item-details {
            display: none;
            width: 100%;
        }

        .item-card.expanded .item-details {
            display: block;
        }

        .item-card.expanded .item-image-small {
            display: none;
        }

        .item-field {
            margin-bottom: 15px;
        }

        .item-field label {
            display: block;
            font-weight: 600;
            color: #34495e;
            margin-bottom: 6px;
            font-size: 14px;
        }

        .item-field input,
        .item-field textarea {
            width: 100%;
            padding: 8px 12px;
            border: 2px solid #ecf0f1;
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.3s ease;
        }

        .item-field input:focus,
        .item-field textarea:focus {
            outline: none;
            border-color: #667eea;
        }

        .item-field textarea {
            resize: vertical;
            min-height: 50px;
        }

        .readonly-field {
            padding: 8px 12px;
            border: 2px solid #e8e8e8;
            border-radius: 6px;
            background: #f8f9fa;
            color: #495057;
            min-height: 24px;
            font-size: 14px;
        }

        .readonly-field.readonly-textarea {
            min-height: 50px;
            white-space: pre-wrap;
        }

        /* Card actions */
        .card-actions {
            display: flex;
            gap: 10px;
            margin-top: 15px;
            justify-content: flex-end;
            flex-wrap: wrap;
        }

        .btn-save, .btn-delete, .btn-close, .btn-upload, .btn-take, .btn-share {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s ease;
        }

        .btn-save {
            background: #28a745;
            color: white;
        }

        .btn-save:hover {
            background: #218838;
        }

        .btn-delete {
            background: #e74c3c;
            color: white;
        }

        .btn-delete:hover {
            background: #c0392b;
        }

        .btn-close {
            background: #6c757d;
            color: white;
        }

        .btn-close:hover {
            background: #545b62;
        }

        .btn-upload {
            background: #667eea;
            color: white;
        }

        .btn-upload:hover {
            background: #5a67d8;
        }

        .btn-take {
            background: #17a2b8;
            color: white;
        }

        .btn-take:hover {
            background: #138496;
        }

        .btn-share {
            background: #6f42c1;
            color: white;
        }

        .btn-share:hover {
            background: #5a32a3;
        }

        .btn-visibility {
            background: #f39c12;
            color: white;
        }

        .btn-visibility:hover {
            background: #e67e22;
        }

        /* Hidden item styling (GM only) */
        .item-card.item-hidden {
            opacity: 0.6;
            border: 2px dashed #e74c3c;
            background: rgba(231, 76, 60, 0.05);
        }

        .item-card.item-hidden:hover {
            opacity: 0.8;
            border-color: #c0392b;
        }

        .item-card.item-hidden .item-name {
            color: #e74c3c;
            font-style: italic;
        }

        /* Status messages */
        .status-message {
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            font-weight: 500;
            z-index: 3000;
            transition: all 0.3s ease;
        }

        .status-message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .status-message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .status-message.loading {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }

        /* Responsive design */
        @media (max-width: 1200px) {
            .item-card {
                width: calc(50% - 10px); /* 2 cards per row on medium screens */
                min-width: 300px;
            }
        }

        @media (max-width: 768px) {
            .item-card {
                width: 100%; /* 1 card per row on small screens */
                min-width: 280px;
            }
            
            .inventory-tabs {
                flex-wrap: wrap;
            }
            
            .main-container {
                padding: 0 10px;
            }
        }

        @media (max-width: 480px) {
            .header h1 {
                font-size: 1.2em;
            }
            
            .add-item-section {
                flex-direction: column;
                align-items: flex-start;
                gap: 5px;
            }
            
            .item-card {
                min-width: 250px;
                padding: 12px;
            }
        }
    </style>
</head>
<body>
    <!-- Header -->
    <div class="header">
        <h1>Strixhaven Inventory - <?php echo $is_gm ? 'GM View' : ucfirst($user); ?></h1>
        <button class="close-btn" onclick="window.close()">Close</button>
    </div>

    <div class="main-container">
        <!-- Inventory Tabs -->
        <div class="inventory-tabs">
            <?php foreach ($visibleTabs as $index => $tab): ?>
                <button class="inventory-tab <?php echo $index === 0 ? 'active' : ''; ?>" 
                        data-tab="<?php echo $tab; ?>"
                        onclick="switchTab('<?php echo $tab; ?>')">
                    <?php echo $tab === 'gm' ? 'GM' : ucfirst($tab); ?>
                </button>
            <?php endforeach; ?>
        </div>

        <!-- Content Wrapper -->
        <div class="content-wrapper">
            <?php foreach ($visibleTabs as $index => $tab): ?>
                <div class="tab-content <?php echo $index === 0 ? 'active' : ''; ?>" id="tab-<?php echo $tab; ?>">
                    <!-- Add Item Section -->
                    <div class="add-item-section">
                        <button class="btn-add-item" onclick="addNewItem('<?php echo $tab; ?>')" 
                                id="add-btn-<?php echo $tab; ?>">
                            Add New Item
                        </button>
                        <span id="item-count-<?php echo $tab; ?>">0 items</span>
                    </div>
                    
                    <!-- Inventory Grid Container -->
                    <div class="inventory-grid-container">
                        <div class="inventory-grid" id="grid-<?php echo $tab; ?>">
                            <!-- Items will be loaded here by JavaScript -->
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>

    <!-- Hidden file input for image uploads -->
    <input type="file" id="image-upload" accept="image/*" style="display: none;" onchange="handleImageUpload(event)">

    <script>
        // Global variables
        const isGM = <?php echo $is_gm ? 'true' : 'false'; ?>;
        const currentUser = '<?php echo $user; ?>';
        const visibleTabs = <?php echo json_encode($visibleTabs); ?>;
        let currentTab = '<?php echo $defaultTab; ?>';
        let inventoryData = {};
        let expandedCard = null;
        let saveTimeout = null;
        let currentUploadItemId = null;
        
        // Initialize the application
        document.addEventListener('DOMContentLoaded', function() {
            loadInventoryData();
            setupAutoSave();
            updatePermissions();
        });
    </script>
    <script src="js/inventory.js"></script>
</body>
</html>