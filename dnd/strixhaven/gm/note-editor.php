<?php
error_log("DEBUG: note-editor.php loaded at " . date('Y-m-d H:i:s'));

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

// Include character integration
require_once 'includes/character-integration.php';

// Get tab details from URL parameters
$tabId = isset($_GET['tab']) ? $_GET['tab'] : '';
$panelName = isset($_GET['panel']) ? $_GET['panel'] : 'Note';

if (!$tabId) {
    die('Invalid tab ID');
}

// Handle AJAX save requests FIRST
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    error_log("DEBUG: POST request received, action=" . $_POST['action']);
    
    // ALWAYS output JSON
    header('Content-Type: application/json');
    
    if ($_POST['action'] === 'save_tab') {
        try {
            error_log("DEBUG: Processing save_tab request");
            
            $tabDataJson = $_POST['tab_data'] ?? '';
            error_log("DEBUG: Received tab_data: " . substr($tabDataJson, 0, 100) . "...");
            
            if (empty($tabDataJson)) {
                throw new Exception('No tab data provided');
            }
            
            $tabData = json_decode($tabDataJson, true);
            if (!$tabData) {
                throw new Exception('Invalid JSON: ' . json_last_error_msg());
            }
            
            $tabId = $tabData['id'] ?? '';
            error_log("DEBUG: Tab ID: " . $tabId);
            
            if (empty($tabId)) {
                throw new Exception('Missing tab ID');
            }
            
            // Load existing data
            $dataDir = 'data';
            $tabsFile = $dataDir . '/gm-tabs.json';
            
            error_log("DEBUG: Looking for tabs file: " . $tabsFile);
            
            if (!file_exists($tabsFile)) {
                throw new Exception('Tabs file not found: ' . $tabsFile);
            }
            
            $content = file_get_contents($tabsFile);
            $tabsData = json_decode($content, true);
            
            if (!$tabsData) {
                throw new Exception('Invalid tabs file JSON');
            }
            
            error_log("DEBUG: Loaded tabs data, keys: " . implode(', ', array_keys($tabsData)));
            
            // Determine panel
            $panel = null;
            if (strpos($tabId, 'left-1-') === 0) $panel = 'left-1';
            elseif (strpos($tabId, 'left-2-') === 0) $panel = 'left-2';  
            elseif (strpos($tabId, 'right-1-') === 0) $panel = 'right-1';
            elseif (strpos($tabId, 'right-2-') === 0) $panel = 'right-2';
            
            error_log("DEBUG: Detected panel: " . ($panel ?? 'NULL'));
            
            if (!$panel) {
                throw new Exception('Cannot determine panel for tab: ' . $tabId);
            }
            
            // Initialize panel if needed
            if (!isset($tabsData[$panel])) {
                $tabsData[$panel] = [];
            }
            
            // Find and update tab
            $found = false;
            foreach ($tabsData[$panel] as &$tab) {
                if ($tab['id'] === $tabId) {
                    $tab['name'] = $tabData['name'];
                    $tab['content'] = $tabData['content'];
                    $tab['lastModified'] = date('c');
                    $found = true;
                    break;
                }
            }
            
            if (!$found) {
                // Add new tab
                $tabData['created'] = date('c');
                $tabData['lastModified'] = date('c');
                $tabsData[$panel][] = $tabData;
            }
            
            // Update metadata
            if (!isset($tabsData['metadata'])) {
                $tabsData['metadata'] = [];
            }
            $tabsData['metadata']['lastUpdated'] = date('c');
            
            // Save file
            $jsonData = json_encode($tabsData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            $result = file_put_contents($tabsFile, $jsonData, LOCK_EX);
            
            if ($result === false) {
                throw new Exception('Failed to write file');
            }
            
            error_log("DEBUG: Successfully saved tab data");
            
            echo json_encode([
                'success' => true,
                'message' => 'Tab saved successfully'
            ]);
            
        } catch (Exception $e) {
            error_log("DEBUG: Save error: " . $e->getMessage());
            echo json_encode([
                'success' => false,
                'error' => $e->getMessage()
            ]);
        }
    } else {
        echo json_encode([
            'success' => false,
            'error' => 'Unknown action'
        ]);
    }
    
    exit;
}

// Load the specific tab data
$dataDir = 'data';
$tabsFile = $dataDir . '/gm-tabs.json';
$currentTab = null;

if (file_exists($tabsFile)) {
    $content = file_get_contents($tabsFile);
    $tabsData = json_decode($content, true);
    
    if ($tabsData) {
        $panels = ['left-1', 'left-2', 'right-1', 'right-2'];
        foreach ($panels as $panel) {
            if (isset($tabsData[$panel]) && is_array($tabsData[$panel])) {
                foreach ($tabsData[$panel] as $tab) {
                    if (isset($tab['id']) && $tab['id'] === $tabId) {
                        $currentTab = $tab;
                        break 2;
                    }
                }
            }
        }
    }
}

if (!$currentTab) {
    // Create default tab if not found
    $currentTab = [
        'id' => $tabId,
        'name' => $panelName . ' ' . substr($tabId, -1),
        'content' => '',
        'lastModified' => date('c'),
        'created' => date('c')
    ];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($currentTab['name']); ?> - Strixhaven GM Notes</title>
    <link rel="stylesheet" href="css/gm-screen.css">
    <link rel="stylesheet" href="css/character-refs.css">
    <style>
        body {
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        
        .note-editor-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .note-header {
            background: rgba(255, 255, 255, 0.95);
            padding: 20px 30px;
            border-radius: 12px 12px 0 0;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
            backdrop-filter: blur(10px);
        }
        
        .note-title-input {
            font-size: 24px;
            font-weight: 600;
            border: none;
            background: transparent;
            color: #2c3e50;
            padding: 5px 10px;
            border-radius: 4px;
            transition: background 0.3s ease;
            flex: 1;
            max-width: 400px;
        }
        
        .note-title-input:focus {
            outline: none;
            background: rgba(0, 123, 255, 0.1);
        }
        
        .note-controls {
            display: flex;
            gap: 15px;
            align-items: center;
        }
        
        .control-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s ease;
            font-size: 14px;
        }
        
        .control-btn:hover {
            background: #5a67d8;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .control-btn.save {
            background: #28a745;
        }
        
        .control-btn.save:hover {
            background: #1e7e34;
        }
        
        .note-editor-wrapper {
            background: white;
            flex: 1;
            border-radius: 0 0 12px 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
            min-height: 70vh;
        }
        
        .editor-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 20px;
        }
        
        .rich-text-container {
            flex: 1;
            min-height: 500px;
        }
        
        .save-status {
            font-size: 14px;
            font-weight: 500;
            transition: color 0.3s ease;
        }
        
        .save-status.saved {
            color: #28a745;
        }
        
        .save-status.saving {
            color: #ffc107;
        }
        
        .save-status.error {
            color: #dc3545;
        }
        
        @media (max-width: 768px) {
            .note-editor-container {
                padding: 10px;
            }
            
            .note-header {
                flex-direction: column;
                gap: 15px;
                padding: 15px 20px;
            }
            
            .note-title-input {
                max-width: 100%;
                text-align: center;
            }
            
            .note-controls {
                width: 100%;
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="note-editor-container">
        <div class="note-header">
            <input type="text" id="note-title" class="note-title-input" 
                   value="<?php echo htmlspecialchars($currentTab['name']); ?>" 
                   placeholder="Note Title">
            
            <div class="note-controls">
                <span id="save-status" class="save-status saved">All changes saved</span>
                <button onclick="saveNote()" class="control-btn save">Save</button>
                <button onclick="window.close()" class="control-btn">Close</button>
            </div>
        </div>
        
        <div class="note-editor-wrapper">
            <div class="editor-container">
                <div id="rich-text-container" class="rich-text-container">
                    <!-- Rich text editor will be initialized here -->
                </div>
                <div id="character-autocomplete" class="character-autocomplete" style="display: none;"></div>
            </div>
        </div>
    </div>

    <!-- Scripts -->
    <script src="js/rich-text-editor.js"></script>
    <script src="js/character-lookup.js"></script>
    
    <script>
        // Global variables
        let richTextEditor = null;
        let unsavedChanges = false;
        let autoSaveInterval = null;
        
        // Tab data
        const tabData = {
            id: <?php echo json_encode($tabId); ?>,
            name: <?php echo json_encode($currentTab['name']); ?>,
            content: <?php echo json_encode($currentTab['content']); ?>,
            lastModified: <?php echo json_encode($currentTab['lastModified']); ?>
        };
        
        console.log('FIXED VERSION - Tab data loaded:', tabData);
        
        // Initialize the note editor
        document.addEventListener('DOMContentLoaded', async function() {
            console.log('FIXED VERSION - Initializing note editor for tab:', tabData.id);
            
            try {
                // Wait a bit for all scripts to load
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Initialize character lookup FIRST
                if (window.characterLookup) {
                    try {
                        console.log('Initializing character lookup...');
                        await window.characterLookup.init();
                        console.log('Character lookup initialized successfully');
                    } catch (error) {
                        console.warn('Character lookup failed to initialize:', error);
                    }
                } else {
                    console.warn('CharacterLookup class not found - make sure character-lookup.js is loaded');
                }
                
                // Check if RichTextEditor is available
                if (typeof RichTextEditor === 'undefined') {
                    throw new Error('RichTextEditor class not found - make sure rich-text-editor.js is loaded');
                }
                
                // Initialize rich text editor
                const container = document.getElementById('rich-text-container');
                if (!container) {
                    throw new Error('Rich text container not found');
                }
                
                richTextEditor = new RichTextEditor(container, {
                    placeholder: 'Enter your notes here... Type [[character name]] to link to characters'
                });
                
                richTextEditor.init();
                richTextEditor.setContent(tabData.content || '');
                
                // Setup change detection
                richTextEditor.onChange(() => {
                    unsavedChanges = true;
                    updateSaveStatus('Unsaved changes...', 'saving');
                });
                
                // Setup character lookup integration
                if (window.characterLookup && window.characterLookup.isReady()) {
                    const editor = richTextEditor.getEditor();
                    if (editor) {
                        window.characterLookup.setupEditorListeners(editor);
                        console.log('Character lookup integrated with editor');
                    }
                } else {
                    console.warn('Character lookup not ready - autocomplete may not work');
                }
                
                // Setup title change detection
                const titleInput = document.getElementById('note-title');
                if (titleInput) {
                    titleInput.addEventListener('input', () => {
                        unsavedChanges = true;
                        updateSaveStatus('Unsaved changes...', 'saving');
                    });
                }
                
                // Setup auto-save
                setupAutoSave();
                
                // Keyboard shortcuts
                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        if (e.key === 's') {
                            e.preventDefault();
                            saveNote();
                        }
                    }
                });
                
                console.log('FIXED VERSION - Note editor initialized successfully');
                
                // Final check for character lookup
                if (window.characterLookup) {
                    console.log('Character lookup status:', {
                        isReady: window.characterLookup.isReady(),
                        characterCount: window.characterLookup.getCharacterCount()
                    });
                }
                
            } catch (error) {
                console.error('Error initializing note editor:', error);
                updateSaveStatus('Initialization error: ' + error.message, 'error');
                
                // Show user-friendly error
                alert('Failed to initialize the note editor. Please refresh the page and try again.\n\nError: ' + error.message);
            }
        });
        
        // Save the note
        async function saveNote() {
            console.log('FIXED VERSION - saveNote called');
            
            if (!richTextEditor) {
                console.error('Rich text editor not initialized');
                updateSaveStatus('Editor not ready', 'error');
                return;
            }
            
            try {
                updateSaveStatus('Saving...', 'saving');
                
                const titleInput = document.getElementById('note-title');
                
                const updatedTabData = {
                    ...tabData,
                    name: titleInput.value || tabData.name,
                    content: richTextEditor.getContent(),
                    lastModified: new Date().toISOString()
                };
                
                console.log('FIXED VERSION - Saving tab data:', updatedTabData);
                
                const formData = new FormData();
                formData.append('action', 'save_tab');
                formData.append('tab_data', JSON.stringify(updatedTabData));
                
                const response = await fetch(window.location.href, {
                    method: 'POST',
                    body: formData
                });
                
                console.log('FIXED VERSION - Response status:', response.status);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const responseText = await response.text();
                console.log('FIXED VERSION - Raw response:', responseText.substring(0, 200) + '...');
                
                let result;
                try {
                    result = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('Failed to parse JSON response:', parseError);
                    console.error('Full response:', responseText);
                    throw new Error('Invalid response from server');
                }
                
                console.log('FIXED VERSION - Parsed response:', result);
                
                if (result.success) {
                    tabData.name = updatedTabData.name;
                    tabData.content = updatedTabData.content;
                    tabData.lastModified = updatedTabData.lastModified;
                    
                    document.title = tabData.name + ' - Strixhaven GM Notes';
                    
                    unsavedChanges = false;
                    updateSaveStatus('Saved!', 'saved');
                    
                    console.log('FIXED VERSION - Note saved successfully');
                } else {
                    updateSaveStatus('Save failed!', 'error');
                    console.error('FIXED VERSION - Save failed:', result.error);
                    alert('Save failed: ' + result.error);
                }
                
            } catch (error) {
                updateSaveStatus('Save error!', 'error');
                console.error('FIXED VERSION - Error saving note:', error);
                alert('Error saving note: ' + error.message);
            }
        }
        
        // Update save status
        function updateSaveStatus(message, type) {
            const statusElement = document.getElementById('save-status');
            if (statusElement) {
                statusElement.textContent = message;
                statusElement.className = `save-status ${type}`;
            }
        }
        
        // Setup auto-save
        function setupAutoSave() {
            autoSaveInterval = setInterval(() => {
                if (unsavedChanges) {
                    console.log('FIXED VERSION - Auto-saving...');
                    saveNote();
                }
            }, 10000);
            
            console.log('FIXED VERSION - Auto-save enabled');
        }
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges) {
                const message = 'You have unsaved changes. Are you sure you want to leave?';
                e.returnValue = message;
                return message;
            }
        });
    </script>
</body>
</html>