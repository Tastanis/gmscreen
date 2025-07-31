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
                    <div class="tab active" data-tab-id="default">
                        <span class="tab-name">Untitled</span>
                        <button class="tab-close" onclick="closeMainTab('default')">×</button>
                    </div>
                    <button class="add-tab-btn" onclick="addMainTab()">+</button>
                </div>
                <div class="sub-tabs" id="subTabsContainer">
                    <div class="sub-tab-list" id="subTabList">
                        <div class="sub-tab active" data-subtab-id="default-sub">
                            <span class="tab-name">General</span>
                            <button class="tab-close" onclick="closeSubTab('default-sub')">×</button>
                        </div>
                        <button class="add-sub-tab-btn" onclick="addSubTab()">+</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Content Area -->
        <div class="content-area">
            <!-- Workspace -->
            <div class="workspace" id="workspace">
                <!-- Test Monster Card -->
                <div class="monster-card" data-monster-id="test-monster">
                    <div class="card-header">
                        <input type="text" class="monster-name" placeholder="Monster Name" value="Test Monster">
                        <button class="card-menu">⋮</button>
                    </div>
                    <div class="card-body">
                        <div class="stat-row">
                            <label>HP:</label>
                            <input type="number" class="stat-input" data-field="hp" value="10">
                            <label>AC:</label>
                            <input type="number" class="stat-input" data-field="ac" value="12">
                        </div>
                        <div class="stat-row">
                            <label>Speed:</label>
                            <input type="text" class="stat-input" data-field="speed" value="30 ft">
                        </div>
                        <div class="abilities-section">
                            <h4>Abilities</h4>
                            <div class="ability-slots" id="abilitySlots">
                                <!-- Ability cards will be dropped here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Sidebar - Abilities -->
            <div class="abilities-sidebar">
                <div class="abilities-tabs">
                    <div class="tab-list" id="abilityTabList">
                        <div class="tab active" data-ability-tab-id="common">
                            <span class="tab-name">Common</span>
                        </div>
                        <button class="add-tab-btn" onclick="addAbilityTab()">+</button>
                    </div>
                </div>
                <div class="abilities-content" id="abilitiesContent">
                    <!-- Sample ability cards -->
                    <div class="ability-card" draggable="true" data-ability-id="multiattack">
                        <h5>Multiattack</h5>
                        <p>The creature makes two attacks.</p>
                    </div>
                    <div class="ability-card" draggable="true" data-ability-id="bite">
                        <h5>Bite</h5>
                        <p>Melee Weapon Attack: +5 to hit, reach 5 ft., one target.</p>
                    </div>
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