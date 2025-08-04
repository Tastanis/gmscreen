<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Check if user is GM - restrict access
if (!$is_gm) {
    header('Location: ../../dashboard.php');
    exit;
}

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monster Creator - Strixhaven</title>
    <link rel="stylesheet" href="../../css/style.css">
    <link rel="stylesheet" href="css/monster-builder.css">
</head>
<body>
    <!-- Main Layout Container -->
    <div class="monster-builder-container">
        <!-- Top Tab System -->
        <div class="top-tabs-container">
            <div class="main-tabs">
                <div class="tab-list" id="mainTabList">
                    <button class="add-tab-btn" onclick="addMainTab()">+</button>
                </div>
                <div class="sub-tabs" id="subTabsContainer">
                    <div class="sub-tab-list" id="subTabList">
                        <button class="add-sub-tab-btn" onclick="addSubTab()">+</button>
                    </div>
                </div>
            </div>
            <!-- Delete Mode Toggle -->
            <button class="delete-mode-toggle" id="deleteModeToggle" onclick="toggleDeleteMode()">
                Delete Tab
            </button>
            
            <!-- Data Recovery Button -->
            <button class="recovery-toggle" onclick="window.location.href='monster-recovery.php'" title="View backups and recover lost data">
                Data Recovery
            </button>
        </div>

        <!-- Main Content Area -->
        <div class="content-area">
            <!-- Workspace -->
            <div class="workspace" id="workspace">
                <!-- Monsters will be populated here dynamically -->
                <div class="workspace-info">
                    <p>Select a tab to view monsters, or create a new monster.</p>
                    <button class="btn-primary" onclick="addNewMonster()">Add New Monster</button>
                </div>
            </div>

            <!-- Right Sidebar - Monster/Ability Browser -->
            <div class="browser-sidebar">
                <div class="browser-header">
                    <h3 id="browserTitle">All Monsters & Abilities</h3>
                    <div class="browser-context" id="browserContext">
                        <span class="context-info">Viewing: All tabs</span>
                    </div>
                </div>
                
                <div class="browser-content">
                    <!-- Monsters Section -->
                    <div class="browser-section monsters-section">
                        <div class="section-header">
                            <h4>Monsters</h4>
                            <span class="count" id="monsterCount">0</span>
                        </div>
                        <div class="monster-list" id="monsterBrowserList">
                            <!-- Monsters will be populated here -->
                        </div>
                    </div>
                    
                    <!-- Abilities Section -->
                    <div class="browser-section abilities-section">
                        <div class="section-header">
                            <h4>Abilities</h4>
                            <span class="count" id="abilityCount">0</span>
                        </div>
                        <div class="ability-list" id="abilityBrowserList">
                            <!-- Abilities will be populated here -->
                        </div>
                    </div>
                </div>
                
                <!-- Debug Info -->
                <div class="debug-info" id="debugInfo" style="display: none;">
                    <h5>Debug Info</h5>
                    <div id="debugContent"></div>
                </div>
            </div>
        </div>

        <!-- Save Status Indicator -->
        <div class="save-status" id="saveStatus">
            <span class="status-text">All changes saved</span>
            <span class="status-indicator"></span>
        </div>
    </div>
    
    <!-- Version display -->
    <div class="version-footer">
        <span class="version-info"><?php echo Version::displayVersion(); ?></span>
        <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
    </div>

    <!-- JavaScript -->
    <script src="js/monster-builder.js"></script>
</body>
</html>