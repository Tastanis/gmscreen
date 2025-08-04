<?php
session_start();

// Check if user is logged in and is GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

if (!$is_gm) {
    header('Location: ../../dashboard.php');
    exit;
}

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';

// Include character integration
require_once 'includes/character-integration.php';

// Include backup system
require_once 'includes/gm-backup-helper.php';

// Include file lock manager
require_once 'includes/file-lock-manager.php';

// Data file paths
$dataDir = 'data';
$tabsFile = $dataDir . '/gm-tabs.json';
$settingsFile = $dataDir . '/gm-settings.json';
$panelTitlesFile = $dataDir . '/panel-titles.json';

// Ensure data directory exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// Function to load GM tabs data
function loadTabsData($tabsFile) {
    if (file_exists($tabsFile)) {
        $content = file_get_contents($tabsFile);
        $data = json_decode($content, true);
        if ($data && json_last_error() === JSON_ERROR_NONE) {
            // Fix data structure if needed
            return fixTabsDataStructure($data);
        }
    }
    
    // Return default tabs structure
    return getDefaultTabsStructure();
}

// Function to fix tabs data structure
function fixTabsDataStructure($data) {
    $panels = ['left-1', 'left-2', 'right-1', 'right-2'];
    $panelNames = ['Note', 'Reference', 'Rule', 'Campaign'];
    $fixedData = [];
    
    foreach ($panels as $index => $panel) {
        if (isset($data[$panel]) && is_array($data[$panel])) {
            // Panel exists and is array, keep it but ensure all tabs have correct IDs
            $fixedData[$panel] = [];
            for ($i = 1; $i <= 20; $i++) {
                $expectedTabId = "{$panel}-{$i}";
                
                // Find existing tab with this ID
                $existingTab = null;
                foreach ($data[$panel] as $tab) {
                    if (isset($tab['id']) && $tab['id'] === $expectedTabId) {
                        $existingTab = $tab;
                        break;
                    }
                }
                
                if ($existingTab) {
                    $fixedData[$panel][] = $existingTab;
                } else {
                    // Create default tab
                    $fixedData[$panel][] = [
                        'id' => $expectedTabId,
                        'name' => "{$panelNames[$index]} {$i}",
                        'content' => '',
                        'lastModified' => date('c'),
                        'created' => date('c')
                    ];
                }
            }
        } else {
            // Panel doesn't exist or isn't array, create default
            $fixedData[$panel] = [];
            for ($i = 1; $i <= 20; $i++) {
                $fixedData[$panel][] = [
                    'id' => "{$panel}-{$i}",
                    'name' => "{$panelNames[$index]} {$i}",
                    'content' => '',
                    'lastModified' => date('c'),
                    'created' => date('c')
                ];
            }
        }
    }
    
    // Keep metadata
    $fixedData['metadata'] = $data['metadata'] ?? [
        'lastUpdated' => date('c'),
        'version' => '1.0'
    ];
    
    return $fixedData;
}

// Function to load panel titles
function loadPanelTitles($panelTitlesFile) {
    if (file_exists($panelTitlesFile)) {
        $content = file_get_contents($panelTitlesFile);
        $data = json_decode($content, true);
        if ($data && json_last_error() === JSON_ERROR_NONE) {
            return $data;
        }
    }
    
    // Return default panel titles
    return [
        'left-panel-1' => 'Notes',
        'left-panel-2' => 'References',
        'right-panel-1' => 'Rules',
        'right-panel-2' => 'Campaign'
    ];
}

// Function to save panel titles
function savePanelTitles($data, $panelTitlesFile) {
    $jsonData = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    return file_put_contents($panelTitlesFile, $jsonData, LOCK_EX);
}

// Function to get default tabs structure
function getDefaultTabsStructure() {
    $panels = ['left-1', 'left-2', 'right-1', 'right-2'];
    $panelNames = ['Note', 'Reference', 'Rule', 'Campaign'];
    $result = [];
    
    foreach ($panels as $index => $panel) {
        $result[$panel] = [];
        for ($i = 1; $i <= 20; $i++) {
            $result[$panel][] = [
                'id' => "{$panel}-{$i}",
                'name' => "{$panelNames[$index]} {$i}",
                'content' => '',
                'lastModified' => date('c'),
                'created' => date('c')
            ];
        }
    }
    
    $result['metadata'] = [
        'lastUpdated' => date('c'),
        'version' => '1.0'
    ];
    
    return $result;
}

// Function to save tabs data with atomic writes and backup
function saveTabsData($data, $tabsFile, $backupType = 'pre-save') {
    global $dataDir;
    
    try {
        // Create backup before saving
        $backupHelper = new GMBackupHelper($dataDir);
        if (file_exists($tabsFile)) {
            $backupResult = $backupHelper->createBackup($tabsFile, $backupType);
            if (!$backupResult['success']) {
                error_log('GM Screen: Failed to create backup: ' . $backupResult['error']);
            }
        }
        
        // Update metadata
        $data['metadata']['lastUpdated'] = date('c');
        
        // Validate data structure before saving
        if (!validateTabsData($data)) {
            throw new Exception('Invalid tabs data structure');
        }
        
        $jsonData = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($jsonData === false) {
            throw new Exception('Failed to encode JSON: ' . json_last_error_msg());
        }
        
        // Atomic write: write to temp file first
        $tempFile = $tabsFile . '.tmp.' . uniqid();
        
        // Write to temp file
        $bytesWritten = file_put_contents($tempFile, $jsonData, LOCK_EX);
        if ($bytesWritten === false) {
            throw new Exception('Failed to write to temporary file');
        }
        
        // Verify the temp file is valid JSON
        $verifyContent = file_get_contents($tempFile);
        $verifyData = json_decode($verifyContent, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            unlink($tempFile);
            throw new Exception('Written data is not valid JSON');
        }
        
        // Atomic rename (this is atomic on most filesystems)
        if (!rename($tempFile, $tabsFile)) {
            unlink($tempFile);
            throw new Exception('Failed to rename temporary file');
        }
        
        return true;
        
    } catch (Exception $e) {
        error_log('GM Screen: Save error - ' . $e->getMessage());
        
        // Try to restore from backup if save failed
        if (isset($backupResult) && $backupResult['success']) {
            error_log('GM Screen: Attempting to restore from backup after failed save');
            $backupHelper->restoreBackup($backupResult['backup_path'], $tabsFile);
        }
        
        return false;
    }
}

// Function to validate tabs data structure
function validateTabsData($data) {
    if (!is_array($data)) {
        return false;
    }
    
    $requiredPanels = ['left-1', 'left-2', 'right-1', 'right-2'];
    foreach ($requiredPanels as $panel) {
        if (!isset($data[$panel]) || !is_array($data[$panel])) {
            return false;
        }
    }
    
    return true;
}

// Handle AJAX requests
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    header('Content-Type: application/json');
    
    switch ($_POST['action']) {
        case 'load_tabs':
            try {
                $tabsData = loadTabsData($tabsFile);
                
                echo json_encode([
                    'success' => true,
                    'tabs' => [
                        'left-1' => $tabsData['left-1'],
                        'left-2' => $tabsData['left-2'],
                        'right-1' => $tabsData['right-1'],
                        'right-2' => $tabsData['right-2']
                    ],
                    'metadata' => $tabsData['metadata'] ?? ['lastUpdated' => date('c'), 'version' => '1.0']
                ]);
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to load tabs: ' . $e->getMessage()
                ]);
            }
            break;

        case 'load_panel_titles':
            try {
                $panelTitles = loadPanelTitles($panelTitlesFile);
                
                echo json_encode([
                    'success' => true,
                    'panelTitles' => $panelTitles
                ]);
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to load panel titles: ' . $e->getMessage()
                ]);
            }
            break;

        case 'save_panel_title':
            try {
                $panelId = isset($_POST['panel_id']) ? $_POST['panel_id'] : '';
                $title = isset($_POST['title']) ? trim($_POST['title']) : '';
                
                if (!$panelId || !$title) {
                    throw new Exception('Invalid panel ID or title');
                }
                
                $panelTitles = loadPanelTitles($panelTitlesFile);
                $panelTitles[$panelId] = $title;
                
                if (savePanelTitles($panelTitles, $panelTitlesFile)) {
                    echo json_encode(['success' => true]);
                } else {
                    throw new Exception('Failed to save panel title');
                }
                
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to save panel title: ' . $e->getMessage()
                ]);
            }
            break;
            
        case 'save_tab':
            try {
                $tabData = json_decode($_POST['tab_data'], true);
                
                if (!$tabData || !isset($tabData['id'])) {
                    throw new Exception('Invalid tab data');
                }
                
                // Use file lock manager to prevent race conditions
                $lockManager = new FileLockManager($dataDir);
                
                $result = $lockManager->withLock($tabsFile, function() use ($tabsFile, $tabData) {
                    $tabsData = loadTabsData($tabsFile);
                    
                    // Determine which panel this tab belongs to
                    $panel = null;
                    if (strpos($tabData['id'], 'left-1-') === 0) $panel = 'left-1';
                    elseif (strpos($tabData['id'], 'left-2-') === 0) $panel = 'left-2';
                    elseif (strpos($tabData['id'], 'right-1-') === 0) $panel = 'right-1';
                    elseif (strpos($tabData['id'], 'right-2-') === 0) $panel = 'right-2';
                    
                    if (!$panel) {
                        throw new Exception('Invalid tab ID format');
                    }
                    
                    // Initialize panel if it doesn't exist
                    if (!isset($tabsData[$panel])) {
                        $tabsData[$panel] = [];
                    }
                    
                    // Find and update the tab
                    $tabFound = false;
                    foreach ($tabsData[$panel] as &$tab) {
                        if ($tab['id'] === $tabData['id']) {
                            $tab['name'] = $tabData['name'];
                            $tab['content'] = $tabData['content'];
                            $tab['lastModified'] = date('c');
                            $tabFound = true;
                            break;
                        }
                    }
                    
                    // If tab not found, add it
                    if (!$tabFound) {
                        $tabData['created'] = date('c');
                        $tabData['lastModified'] = date('c');
                        $tabsData[$panel][] = $tabData;
                    }
                    
                    if (!saveTabsData($tabsData, $tabsFile)) {
                        throw new Exception('Failed to save tab data');
                    }
                    
                    return true;
                });
                
                if ($result['success']) {
                    echo json_encode(['success' => true]);
                } else {
                    throw new Exception($result['error'] ?? 'Failed to save tab');
                }
                
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to save tab: ' . $e->getMessage()
                ]);
            }
            break;

        case 'search_characters':
            try {
                $searchTerm = isset($_POST['search_term']) ? trim($_POST['search_term']) : '';
                
                if ($searchTerm) {
                    $result = searchCharactersByName($searchTerm);
                    echo json_encode($result);
                } else {
                    echo json_encode(['success' => false, 'error' => 'No search term provided']);
                }
            } catch (Exception $e) {
                echo json_encode(['success' => false, 'error' => 'Search failed: ' . $e->getMessage()]);
            }
            break;

        case 'get_all_characters':
            try {
                $result = getAllCharacterNames();
                echo json_encode($result);
            } catch (Exception $e) {
                echo json_encode(['success' => false, 'error' => 'Failed to get characters: ' . $e->getMessage()]);
            }
            break;

        case 'get_character_details':
            try {
                $characterId = isset($_POST['character_id']) ? $_POST['character_id'] : '';
                $characterType = isset($_POST['character_type']) ? $_POST['character_type'] : '';
                
                if ($characterId && $characterType) {
                    $result = getCharacterDetails($characterId, $characterType);
                    echo json_encode($result);
                } else {
                    echo json_encode(['success' => false, 'error' => 'Missing character ID or type']);
                }
            } catch (Exception $e) {
                echo json_encode(['success' => false, 'error' => 'Failed to get character details: ' . $e->getMessage()]);
            }
            break;

        case 'session_backup':
            try {
                $tabsData = loadTabsData($tabsFile);
                
                if (saveTabsData($tabsData, $tabsFile, 'session')) {
                    echo json_encode(['success' => true]);
                } else {
                    throw new Exception('Failed to create session backup');
                }
                
            } catch (Exception $e) {
                echo json_encode([
                    'success' => false,
                    'error' => 'Failed to create session backup: ' . $e->getMessage()
                ]);
            }
            break;
            
        default:
            echo json_encode([
                'success' => false,
                'error' => 'Unknown action'
            ]);
            break;
    }
    
    exit;
}

// Load panel titles for display
$panelTitles = loadPanelTitles($panelTitlesFile);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Strixhaven GM Screen</title>
    <link rel="stylesheet" href="css/gm-screen.css">
    <link rel="stylesheet" href="css/character-refs.css">
</head>
<body>
    <!-- Background Image -->
    <div class="background-layer"></div>
    
    <!-- Main GM Screen Container -->
    <div class="gm-screen-container">
        
        <!-- Left Side Panel 1 -->
        <aside class="side-panel left-panel" id="left-panel-1">
            <div class="panel-handle">
                <span class="panel-title" title="Click to edit panel name"><?php echo htmlspecialchars($panelTitles['left-panel-1']); ?></span>
                <div class="handle-icon">📝</div>
            </div>
            
            <div class="panel-content">
                <div class="panel-header">
                    <h3><?php echo htmlspecialchars($panelTitles['left-panel-1']); ?></h3>
                    <button class="panel-close" onclick="togglePanel('left-panel-1')">&times;</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-list" id="left-1-tabs">
                        <!-- Tabs will be generated dynamically -->
                    </div>
                </div>
            </div>
        </aside>

        <!-- Left Side Panel 2 -->
        <aside class="side-panel left-panel" id="left-panel-2">
            <div class="panel-handle">
                <span class="panel-title" title="Click to edit panel name"><?php echo htmlspecialchars($panelTitles['left-panel-2']); ?></span>
                <div class="handle-icon">📚</div>
            </div>
            
            <div class="panel-content">
                <div class="panel-header">
                    <h3><?php echo htmlspecialchars($panelTitles['left-panel-2']); ?></h3>
                    <button class="panel-close" onclick="togglePanel('left-panel-2')">&times;</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-list" id="left-2-tabs">
                        <!-- Tabs will be generated dynamically -->
                    </div>
                </div>
            </div>
        </aside>

        <!-- Central Content Area -->
        <main class="central-content">
            <div class="gm-header">
                <h1>Strixhaven Campaign</h1>
                <div class="session-info">
                    <span id="session-date"></span>
                    <span id="auto-save-status">Popup Mode Active</span>
                </div>
            </div>
            
            <!-- Quick Actions Bar -->
            <div class="quick-actions">
                <button onclick="window.location.href='../../dashboard.php'">← Back to Dashboard</button>
                <button onclick="window.location.href='data-recovery.php'">Data Recovery</button>
                <button onclick="exportNotes()">Export Notes</button>
                <button onclick="window.location.href='../../logout.php'">Logout</button>
            </div>
        </main>

        <!-- Right Side Panel 1 -->
        <aside class="side-panel right-panel" id="right-panel-1">
            <div class="panel-handle">
                <span class="panel-title" title="Click to edit panel name"><?php echo htmlspecialchars($panelTitles['right-panel-1']); ?></span>
                <div class="handle-icon">📋</div>
            </div>
            
            <div class="panel-content">
                <div class="panel-header">
                    <h3><?php echo htmlspecialchars($panelTitles['right-panel-1']); ?></h3>
                    <button class="panel-close" onclick="togglePanel('right-panel-1')">&times;</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-list" id="right-1-tabs">
                        <!-- Tabs will be generated dynamically -->
                    </div>
                </div>
            </div>
        </aside>

        <!-- Right Side Panel 2 -->
        <aside class="side-panel right-panel" id="right-panel-2">
            <div class="panel-handle">
                <span class="panel-title" title="Click to edit panel name"><?php echo htmlspecialchars($panelTitles['right-panel-2']); ?></span>
                <div class="handle-icon">🌟</div>
            </div>
            
            <div class="panel-content">
                <div class="panel-header">
                    <h3><?php echo htmlspecialchars($panelTitles['right-panel-2']); ?></h3>
                    <button class="panel-close" onclick="togglePanel('right-panel-2')">&times;</button>
                </div>
                
                <div class="tabs-container">
                    <div class="tabs-list" id="right-2-tabs">
                        <!-- Tabs will be generated dynamically -->
                    </div>
                </div>
            </div>
        </aside>
    </div>

    <!-- Character Autocomplete Container (for popup editor) -->
    <div id="character-autocomplete" class="character-autocomplete" style="display: none;"></div>

    <!-- Character Modal (kept for character details) -->
    <div id="character-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title-container">
                    <h2 id="character-modal-title">Character Details</h2>
                </div>
                <div class="modal-controls">
                    <button onclick="openCharacterInNewTab()" class="modal-action-btn" title="Open in New Tab">📋</button>
                    <button onclick="closeCharacterModal()" class="modal-close">&times;</button>
                </div>
            </div>
            
            <div class="modal-body">
                <div id="character-details-content">
                    <!-- Character details will be loaded here -->
                </div>
            </div>
        </div>
    </div>

    <!-- Dice Roller will be created dynamically by JavaScript -->

    <!-- Version Display -->
    <div class="version-footer" style="position: fixed; bottom: 10px; right: 10px; font-size: 0.8em; color: #666; background: rgba(255,255,255,0.9); padding: 5px 10px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
        <span class="version-info"><?php echo Version::displayVersion(); ?></span>
        <span class="version-updated" style="margin-left: 10px;">Updated: <?php echo Version::getLastUpdated(); ?></span>
    </div>

    <!-- Scripts -->
    <script src="js/rich-text-editor.js"></script>
    <script src="js/character-lookup.js"></script>
    <script src="js/gm-screen.js"></script>
    
    <script>
        // Initialize the GM Screen
        document.addEventListener('DOMContentLoaded', function() {
            console.log('Initializing GM Screen with Popup Tabs and Dice Roller...');
            GMScreen.init();
        });
    </script>
</body>
</html>