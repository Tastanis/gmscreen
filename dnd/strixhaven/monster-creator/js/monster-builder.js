// Monster Builder JavaScript

// Global state
let monsterData = {
    tabs: {},
    monsters: {},
    abilityTabs: {
        common: {
            name: 'Common',
            abilities: []
        }
    }
};

// Delete mode state
let isDeleteModeActive = false;

// Print mode state
let isPrintMode = false;
let selectedForPrint = new Set();

let currentMainTab = 'default';
let currentSubTab = 'default-sub';
let autoSaveTimer = null;
let saveQueue = [];
let isSaving = false;
let isInitialLoad = true; // Flag to track initial page load vs user changes

// LocalStorage keys and recovery
const LOCALSTORAGE_KEY = 'monster_creator_unsaved_data';
const RECOVERY_CHECK_INTERVAL = 300000; // 5 minutes
let recoveryCheckInterval = null;
let lastSessionBackupTime = Date.now();
let sessionBackupInterval = null;

// Attribute formatting debounce
let attributeFormatTimers = new Map(); // Store timers for each element

// Mode management
let currentMode = 'search'; // 'search' or 'editor'
let editorMonsterId = null; // ID of monster being edited
let editorMonsterOriginalTab = null; // Track original tab location
let editorMonsterOriginalSubTab = null; // Track original subtab location
let selectedMonsterId = null; // ID of monster selected for ability viewing

const MONSTER_ABILITY_CATEGORIES = [
    'passive',
    'maneuver',
    'action',
    'triggered_action',
    'villain_action',
    'malice'
];

// New change tracking system
let dirtyMonsters = new Set(); // Track which monsters have unsaved changes
let changeListeners = new Map(); // Track active event listeners
let needsTabSave = false; // Track when tab structure needs saving

// Format attribute values with +/- signs
function formatAttributeValue(value) {
    const numValue = parseInt(value) || 0;
    if (numValue === 0) return '0';
    return numValue > 0 ? `+${numValue}` : `${numValue}`;
}

// Icons for ability categories so color is not the only differentiator
const CATEGORY_ICONS = {
    'passive': '◆',
    'maneuver': '⟳',
    'action': '⚔',
    'triggered_action': '⚡',
    'villain_action': '☠',
    'malice': '✦'
};

function getCategoryIcon(category) {
    return CATEGORY_ICONS[category] || '◆';
}

// Get display name for ability categories
function getCategoryDisplayName(category) {
    const categoryNames = {
        'passive': 'Passive',
        'maneuver': 'Maneuver', 
        'action': 'Action',
        'triggered_action': 'Triggered Action',
        'villain_action': 'Villain Action',
        'malice': 'Malice'
    };
    return categoryNames[category] || 'Action';
}

// Migrate simple ability to comprehensive format
function migrateAbility(simpleAbility, category) {
    return {
        name: simpleAbility.name || '',
        roll_bonus: 0,
        action_type: getCategoryDisplayName(category),
        resource_cost: '',
        keywords: '',
        range: '',
        targets: '',
        effect: simpleAbility.conditions || '',
        has_test: false,
        test: {
            tier1: {
                damage_amount: '',
                damage_type: '',
                has_attribute_check: false,
                attribute: 'might',
                attribute_threshold: 0,
                attribute_effect: ''
            },
            tier2: {
                damage_amount: '',
                damage_type: '',
                has_attribute_check: false,
                attribute: 'might',
                attribute_threshold: 0,
                attribute_effect: ''
            },
            tier3: {
                damage_amount: '',
                damage_type: '',
                has_attribute_check: false,
                attribute: 'might',
                attribute_threshold: 0,
                attribute_effect: ''
            }
        },
        additional_effect: ''
    };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Monster Builder initialized');
    
    // Load saved data first, then create defaults if none exist
    await loadMonsterData();
    
    // If no tabs exist after loading, create default structure
    if (Object.keys(monsterData.tabs).length === 0) {
        console.log('No saved data found, creating default structure');
        createDefaultStructure();
    }
    
    // Build the UI from loaded/default data
    rebuildUI();
    
    // Set up event listeners
    setupEventListeners();
    
    // Start auto-save timer
    startAutoSave();
    
    // Initialize session backup system
    initSessionBackup();
    
    // Initialize recovery system
    initRecoverySystem();
    
    // Mark initial load as complete after everything is set up
    setTimeout(() => {
        isInitialLoad = false;
        console.log('Initial load complete - user changes will now be tracked');
    }, 1000);
    
    // Set up window close handler
    window.addEventListener('beforeunload', function(e) {
        // Block leaving if any orphan monster exists — they would be stripped
        // by the next save and silently lost.
        const referenced = getReferencedMonsterIds();
        const hasOrphans = Object.keys(monsterData.monsters || {}).some(id => !referenced.has(id));
        if (hasOrphans) {
            e.preventDefault();
            e.returnValue = 'You have draft monsters not saved to any tab. They will be lost if you leave. Save to Tab first?';
            return;
        }
        if (hasUnsavedChanges()) {
            // Force immediate save before leaving
            if (!isSaving) {
                saveChangedData();
            }
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
    
    // Set up escape key handler to exit delete mode
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isDeleteModeActive) {
            toggleDeleteMode();
        }
    });
    
    // Periodic cleanup of animation states every 30 seconds
    setInterval(cleanupAnimationStates, 30000);
    
    // Make cleanup and debug functions globally available
    window.cleanupAnimationStates = cleanupAnimationStates;
    window.debugTestSections = debugTestSections;
    
    // Make print functions globally available
    window.togglePrintMode = togglePrintMode;
    window.showPrintPreview = showPrintPreview;
    window.printMonsters = printMonsters;
    window.clearPrintSelection = clearPrintSelection;
    window.closePrintPreview = closePrintPreview;
    window.printFinal = printFinal;
    
    console.log('Animation cleanup system initialized');
    console.log('Debug functions available: window.cleanupAnimationStates(), window.debugTestSections()');
});

// Create default structure when no saved data exists
function createDefaultStructure() {
    const defaultTabId = 'tab_' + Date.now();
    const defaultSubTabId = 'subtab_' + Date.now();
    const testMonsterId = 'monster_' + Date.now();
    
    console.log('Creating default structure with IDs:', {
        tabId: defaultTabId,
        subTabId: defaultSubTabId,
        monsterId: testMonsterId
    });
    
    monsterData.tabs[defaultTabId] = {
        name: 'Untitled',
        subTabs: {
            [defaultSubTabId]: {
                name: 'General',
                monsters: [testMonsterId]
            }
        }
    };
    
    monsterData.monsters[testMonsterId] = {
        name: 'Test Monster',
        hp: 10,
        ac: 12,
        speed: '30 ft',
        abilities: [],
        tabId: defaultTabId,
        subTabId: defaultSubTabId,
        lastModified: Date.now()
    };
    
    currentMainTab = defaultTabId;
    currentSubTab = defaultSubTabId;
    
    console.log('Default structure created:', monsterData);
    console.log('Current tabs set to:', currentMainTab, currentSubTab);
}

// Tab Management Functions
async function addMainTab() {
    const tabId = 'tab_' + Date.now();
    const tabName = await UIKit.prompt({
        title: 'New Tab',
        message: 'Enter tab name:',
        defaultValue: 'New Tab'
    });

    if (tabName) {
        // Create tab data
        monsterData.tabs[tabId] = {
            name: tabName,
            subTabs: {}
        };
        
        // Create tab element
        const tabElement = createTabElement(tabId, tabName, false);
        document.getElementById('mainTabList').insertBefore(
            tabElement, 
            document.querySelector('.add-tab-btn')
        );
        
        // Switch to new tab
        switchMainTab(tabId);
        
        // Save changes
        queueSave();
        
        console.log('Added main tab:', tabName);
    }
}

function createTabElement(tabId, tabName, isSubTab = false) {
    const tab = document.createElement('div');
    tab.className = isSubTab ? 'sub-tab' : 'tab';
    tab.setAttribute(isSubTab ? 'data-subtab-id' : 'data-tab-id', tabId);
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = tabName;
    nameSpan.ondblclick = (e) => {
        e.stopPropagation();
        startTabRename(tabId, isSubTab, nameSpan);
    };
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => isSubTab ? closeSubTab(tabId) : closeMainTab(tabId);
    
    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);
    
    if (!isSubTab) {
        tab.onclick = (e) => {
            if (e.target !== closeBtn) {
                switchMainTab(tabId);
            }
        };
    } else {
        tab.onclick = (e) => {
            if (e.target !== closeBtn) {
                switchSubTab(tabId);
            }
        };
    }
    
    return tab;
}

function switchMainTab(tabId) {
    // Save current tab data before switching (but not if in editor mode)
    if (currentMode === 'search') {
        saveCurrentWorkspace();
    }
    
    // Update active states
    document.querySelectorAll('.main-tabs .tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab-id="${tabId}"]`).classList.add('active');
    
    currentMainTab = tabId;
    
    // In editor mode, don't change subtab or reload workspace
    if (currentMode === 'editor') {
        // Clear subtab selection to show ALL monsters from main tab
        currentSubTab = null;
        
        // Just update the subtabs display but don't change current content
        loadSubTabs(tabId);
        
        // Update right sidebar to show monsters from new tab selection
        updateRightSidebar();
        
        console.log('Main tab switched to:', tabId, '(editor mode - content preserved)');
        return;
    }
    
    // Search mode - normal behavior
    currentSubTab = null; // Clear subtab selection to show ALL subtabs
    
    // Load sub-tabs for this main tab (but don't auto-select one)
    loadSubTabs(tabId);
    
    // Load workspace (will show all monsters from all subtabs)
    loadWorkspace();
    
    // Update right sidebar
    updateRightSidebar();
    
    console.log('Switched to main tab (showing all subtabs):', tabId);
}

function switchSubTab(subTabId) {
    // Save current workspace before switching (but not if in editor mode)
    if (currentMode === 'search') {
        saveCurrentWorkspace();
    }
    
    // Update active states
    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-subtab-id="${subTabId}"]`).classList.add('active');
    
    currentSubTab = subTabId;
    
    // In editor mode, don't reload workspace
    if (currentMode === 'editor') {
        // Update right sidebar to show monsters from new subtab selection
        updateRightSidebar();
        
        console.log('Sub-tab switched to:', subTabId, '(editor mode - content preserved)');
        return;
    }
    
    // Search mode - normal behavior
    // Load monsters for this sub-tab
    loadWorkspace();
    
    // Update right sidebar
    updateRightSidebar();
    
    console.log('Switched to sub-tab:', subTabId);
}

function loadSubTabs(mainTabId) {
    const subTabList = document.getElementById('subTabList');
    subTabList.innerHTML = '';
    
    const mainTab = monsterData.tabs[mainTabId];
    if (mainTab && mainTab.subTabs) {
        Object.entries(mainTab.subTabs).forEach(([subTabId, subTab]) => {
            const tabElement = createTabElement(subTabId, subTab.name, true);
            // Only mark as active if this is the currently selected subtab
            if (subTabId === currentSubTab) {
                tabElement.classList.add('active');
            }
            subTabList.appendChild(tabElement);
        });
    }
    
    // Add the + button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-sub-tab-btn';
    addBtn.textContent = '+';
    addBtn.onclick = addSubTab;
    subTabList.appendChild(addBtn);
    
    // DON'T auto-select first sub-tab - let main tab show all contents
    updateTabDirtyIndicators();
    console.log('Loaded subtabs for main tab:', mainTabId, 'Current subtab:', currentSubTab);
}

async function addSubTab() {
    const subTabId = 'subtab_' + Date.now();
    const subTabName = await UIKit.prompt({
        title: 'New Sub-Tab',
        message: 'Enter sub-tab name:',
        defaultValue: 'New Sub-Tab'
    });

    if (subTabName) {
        // Create sub-tab data
        if (!monsterData.tabs[currentMainTab].subTabs) {
            monsterData.tabs[currentMainTab].subTabs = {};
        }
        
        monsterData.tabs[currentMainTab].subTabs[subTabId] = {
            name: subTabName,
            monsters: []
        };
        
        // Create tab element
        const tabElement = createTabElement(subTabId, subTabName, true);
        document.getElementById('subTabList').insertBefore(
            tabElement,
            document.querySelector('.add-sub-tab-btn')
        );
        
        // Switch to new sub-tab
        switchSubTab(subTabId);
        
        // Save changes
        queueSave();
        
        console.log('Added sub-tab:', subTabName);
    }
}

function startTabRename(tabId, isSubTab, nameSpan) {
    const tab = isSubTab ?
        monsterData.tabs[currentMainTab]?.subTabs[tabId] :
        monsterData.tabs[tabId];

    if (!tab || nameSpan.querySelector('.tab-rename-input')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-rename-input';
    input.value = tab.name;
    input.setAttribute('aria-label', isSubTab ? 'Rename sub-tab' : 'Rename tab');

    nameSpan.textContent = '';
    nameSpan.appendChild(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (commit) => {
        if (finished) return;
        finished = true;
        const newName = input.value.trim();
        if (commit && newName && newName !== tab.name) {
            tab.name = newName;
            queueSave();
            console.log('Renamed tab to:', newName);
        }
        nameSpan.textContent = tab.name;
    };

    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
        }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
}

// Toggle delete mode for tabs
function toggleDeleteMode() {
    isDeleteModeActive = !isDeleteModeActive;
    const toggleBtn = document.getElementById('deleteModeToggle');
    const body = document.body;
    
    if (isDeleteModeActive) {
        toggleBtn.classList.add('active');
        body.classList.add('delete-mode-active');
        toggleBtn.textContent = 'Cancel Delete';
    } else {
        toggleBtn.classList.remove('active');
        body.classList.remove('delete-mode-active');
        toggleBtn.textContent = 'Delete Tab';
    }
}

// Auto-disable delete mode after successful deletion
function disableDeleteMode() {
    if (isDeleteModeActive) {
        isDeleteModeActive = false;
        const toggleBtn = document.getElementById('deleteModeToggle');
        const body = document.body;
        toggleBtn.classList.remove('active');
        body.classList.remove('delete-mode-active');
        toggleBtn.textContent = 'Delete Tab';
    }
}

async function closeMainTab(tabId) {
    const tabCount = Object.keys(monsterData.tabs).length;

    if (tabCount <= 1) {
        UIKit.toast('Cannot close the last tab', 'warning');
        return;
    }

    const confirmed = await UIKit.confirm({
        title: 'Close Tab',
        message: 'Are you sure you want to close this tab? All monsters in this tab will be lost.',
        confirmText: 'Delete',
        danger: true
    });
    if (confirmed) {
        // Remove tab data and associated monsters
        const tab = monsterData.tabs[tabId];
        if (tab && tab.subTabs) {
            Object.values(tab.subTabs).forEach(subTab => {
                if (subTab.monsters) {
                    subTab.monsters.forEach(monsterId => {
                        delete monsterData.monsters[monsterId];
                    });
                }
            });
        }
        delete monsterData.tabs[tabId];
        
        // If we're closing the current tab, switch to the first available tab
        if (currentMainTab === tabId) {
            const remainingTabs = Object.keys(monsterData.tabs);
            if (remainingTabs.length > 0) {
                currentMainTab = remainingTabs[0];
                const firstSubTab = Object.keys(monsterData.tabs[currentMainTab].subTabs)[0];
                currentSubTab = firstSubTab;
            }
        }
        
        // Rebuild UI
        rebuildUI();
        
        queueSave();
        console.log('Closed main tab:', tabId);
        
        // Auto-disable delete mode after successful deletion
        disableDeleteMode();
    }
}

async function closeSubTab(subTabId) {
    const subTabs = monsterData.tabs[currentMainTab].subTabs;

    if (Object.keys(subTabs).length <= 1) {
        UIKit.toast('Cannot close the last sub-tab', 'warning');
        return;
    }

    const confirmed = await UIKit.confirm({
        title: 'Close Sub-Tab',
        message: 'Are you sure you want to close this sub-tab? All monsters in this sub-tab will be lost.',
        confirmText: 'Delete',
        danger: true
    });
    if (confirmed) {
        // Remove monsters in this sub-tab
        const subTab = subTabs[subTabId];
        if (subTab && subTab.monsters) {
            subTab.monsters.forEach(monsterId => {
                delete monsterData.monsters[monsterId];
            });
        }
        
        // Remove sub-tab data
        delete subTabs[subTabId];
        
        // If we're closing the current sub-tab, switch to the first available
        if (currentSubTab === subTabId) {
            const remainingSubTabs = Object.keys(subTabs);
            if (remainingSubTabs.length > 0) {
                currentSubTab = remainingSubTabs[0];
            }
        }
        
        // Rebuild sub-tabs UI
        loadSubTabs(currentMainTab);
        
        queueSave();
        console.log('Closed sub-tab:', subTabId);
        
        // Auto-disable delete mode after successful deletion
        disableDeleteMode();
    }
}

// Workspace Management
function loadWorkspace() {
    console.log('Loading workspace...');
    console.log('Current main tab:', currentMainTab);
    console.log('Current sub tab:', currentSubTab);
    console.log('monsterData structure check:');
    console.log('  - monsterData.monsters type:', typeof monsterData.monsters);
    console.log('  - monsterData.monsters keys:', Object.keys(monsterData.monsters || {}));
    console.log('  - monsterData.monsters content:', monsterData.monsters);
    
    const workspace = document.getElementById('workspace');
    
    // Apply search-mode class if in search mode
    if (currentMode === 'search') {
        workspace.classList.add('search-mode');
    } else {
        workspace.classList.remove('search-mode');
    }
    
    // Create workspace header with Add New Monster button (always visible)
    const workspaceHeader = document.createElement('div');
    workspaceHeader.className = 'workspace-header';
    
    // Build title based on mode and editing state
    let title = 'Monster Workspace';
    if (currentMode === 'editor') {
        if (editorMonsterId && monsterData.monsters[editorMonsterId]) {
            const monsterName = monsterData.monsters[editorMonsterId].name || 'Unnamed Monster';
            title += ` - Editing: ${monsterName}`;
        } else {
            title += ' - Editor Mode';
        }
    }
    
    // Build action buttons based on mode and state
    let actionButtons;
    if (currentMode === 'search') {
        actionButtons = '<button class="btn-primary add-monster-btn" onclick="addNewMonster()">+ Add New Monster</button>';
    } else {
        // Editor mode
        if (editorMonsterId) {
            actionButtons = `
                <button class="btn-primary save-to-tab-btn" onclick="showTabAssignment()">Save to Tab</button>
                <button class="btn-secondary" onclick="finishEditing()">Finish Editing</button>
            `;
        } else {
            actionButtons = '<button class="btn-primary add-monster-btn" onclick="addNewMonster()">+ Add New Monster</button>';
        }
    }

    // Warn loudly if the monster being edited isn't saved to a tab — the
    // auto-save will NOT include it until you assign one.
    const showOrphanBanner = currentMode === 'editor' && editorMonsterId && isMonsterOrphan(editorMonsterId);

    workspaceHeader.innerHTML = `
        <div class="workspace-title">
            <h3>${title}</h3>
        </div>
        <div class="workspace-actions">
            <div class="mode-toggle">
                <button class="mode-btn ${currentMode === 'search' ? 'active' : ''}" onclick="setMode('search')">
                    <span class="mode-icon">🔍</span> Search
                </button>
                <button class="mode-btn ${currentMode === 'editor' ? 'active' : ''}" onclick="setMode('editor')">
                    <span class="mode-icon">✏️</span> Editor
                </button>
            </div>
            ${actionButtons}
        </div>
        ${showOrphanBanner ? `
        <div class="orphan-warning-banner" role="alert">
            <span class="orphan-warning-icon">⚠</span>
            <span class="orphan-warning-text">
                <strong>Draft only — not saved to any tab.</strong>
                Auto-save will NOT keep this monster across reloads.
                Click <strong>Save to Tab</strong> after selecting a tab/subtab to keep it permanently.
            </span>
            <button type="button" class="orphan-warning-action" onclick="showTabAssignment()">Save to Tab Now</button>
        </div>` : ''}
    `;
    
    // Create content area for monsters
    const workspaceContent = document.createElement('div');
    workspaceContent.className = 'workspace-content';
    workspaceContent.id = 'workspaceContent';
    
    // Clear and rebuild workspace
    workspace.innerHTML = '';
    workspace.appendChild(workspaceHeader);
    workspace.appendChild(workspaceContent);
    
    let monstersToShow = [];
    
    // Check if we're in editor mode
    if (currentMode === 'editor') {
        if (editorMonsterId) {
            // In editor mode with active monster - show the monster being edited
            const monster = monsterData.monsters[editorMonsterId];
            if (monster) {
                monstersToShow.push({ id: editorMonsterId, data: monster });
            }
        } else {
            // In editor mode but no active monster - show empty editor message
            workspaceContent.innerHTML = `
                <div class="workspace-info">
                    <h3>Monster Editor</h3>
                    <p>Ready to create a new monster!</p>
                    <p class="info-hint">Click "Add New Monster" above to start creating a monster, or switch to Search mode to edit an existing monster.</p>
                </div>
            `;
            console.log('Loaded empty editor');
            return; // Don't continue with normal monster loading
        }
    } else {
        // Search mode - show monsters based on tab selection
        if (currentSubTab) {
            // Specific subtab selected - show only monsters from that subtab
            const subTab = monsterData.tabs[currentMainTab]?.subTabs[currentSubTab];
            console.log('Found specific sub-tab:', subTab);
            
            if (subTab && subTab.monsters) {
                subTab.monsters.forEach(monsterId => {
                    const monster = monsterData.monsters[monsterId];
                    if (monster) {
                        monstersToShow.push({ id: monsterId, data: monster });
                    }
                });
            }
        } else if (currentMainTab) {
            // Main tab selected (no subtab) - show ALL monsters from ALL subtabs
            const mainTab = monsterData.tabs[currentMainTab];
            console.log('Loading ALL monsters from main tab:', mainTab);
            
            if (mainTab && mainTab.subTabs) {
                Object.entries(mainTab.subTabs).forEach(([subTabId, subTab]) => {
                    if (subTab.monsters) {
                        subTab.monsters.forEach(monsterId => {
                            const monster = monsterData.monsters[monsterId];
                            if (monster) {
                                monstersToShow.push({ id: monsterId, data: monster });
                            }
                        });
                    }
                });
            }
        }
    }
    
    console.log('Monsters to show:', monstersToShow.length);
    
    if (monstersToShow.length > 0) {
        // Sort alphabetically and display monsters
        monstersToShow.sort((a, b) => (a.data.name || 'Unnamed').localeCompare(b.data.name || 'Unnamed'));
        
        monstersToShow.forEach(monster => {
            console.log('Loading monster:', monster.id, monster.data);
            const monsterCard = createMonsterCard(monster.id, monster.data);
            workspaceContent.appendChild(monsterCard);
        });
        
        console.log('Loaded workspace with monsters:', monstersToShow.length);
        
        // Re-apply print mode handlers if print mode is active
        if (isPrintMode) {
            console.log('Re-applying print mode handlers after workspace load');
            updateMonsterCardsForPrintMode();
        }
    } else {
        // Show info message in content area
        const contextMessage = currentSubTab ? 
            'No monsters in this sub-tab yet.' : 
            'No monsters in any sub-tab yet.';
            
        workspaceContent.innerHTML = `
            <div class="workspace-info">
                <p>${contextMessage}</p>
                <p class="info-hint">Use the "Add New Monster" button above to create your first monster.</p>
            </div>
        `;
        console.log('Loaded empty workspace');
    }
}

function createMonsterCard(monsterId, monsterData) {
    // Ensure multi-entry defense arrays exist before either renderer runs.
    ensureMonsterDefenseArrays(monsterData);
    ensureMonsterRoleSplit(monsterData);
    ensureMonsterMovementModes(monsterData);
    // Check current mode and render accordingly
    if (currentMode === 'search') {
        return createCompactMonsterCard(monsterId, monsterData);
    } else {
        return createFullMonsterCard(monsterId, monsterData);
    }
}

function createCompactMonsterCard(monsterId, monsterData) {
    const card = document.createElement('div');
    card.className = 'monster-card';
    card.setAttribute('data-monster-id', monsterId);
    
    // Add click handler for expansion or print selection
    card.addEventListener('click', function(e) {
        // Don't expand if clicking the edit button
        if (e.target.classList.contains('edit-monster-btn')) return;
        
        if (isPrintMode) {
            // In print mode, toggle selection
            toggleMonsterPrintSelection(monsterId);
        } else {
            // In normal mode, expand and show abilities
            selectMonster(monsterId);
            toggleCardExpansion(monsterId);
        }
    });
    
    // Ensure all required fields have default values
    const defaultData = {
        name: monsterData.name || '',
        level: monsterData.level || 1,
        role: monsterData.role || 'Brute',
        types: monsterData.types || '',
        ev: monsterData.ev || 0,
        size: monsterData.size || '1M',
        speed: monsterData.speed || 6,
        stamina: monsterData.stamina || 0,
        stability: monsterData.stability || 0,
        free_strike: monsterData.free_strike || 0,
        immunity_type: monsterData.immunity_type || '',
        immunity_value: monsterData.immunity_value || '',
        weakness_type: monsterData.weakness_type || '',
        weakness_value: monsterData.weakness_value || '',
        movement: monsterData.movement || '',
        might: monsterData.might || 0,
        agility: monsterData.agility || 0,
        reason: monsterData.reason || 0,
        intuition: monsterData.intuition || 0,
        presence: monsterData.presence || 0,
        image: monsterData.image || null,
        abilities: monsterData.abilities || {}
    };
    
    // Create image display
    const imageDisplay = defaultData.image ? 
        `<div class="monster-image">
            <img src="images/${defaultData.image}" alt="${defaultData.name}">
        </div>` :
        `<div class="image-upload-area">
            <span class="upload-icon">📷</span>
        </div>`;

    card.innerHTML = `
        <div class="card-body">
            <div class="monster-info-top">
                <div class="info-left">
                    ${imageDisplay}
                </div>
                <div class="info-right">
                    <div class="info-row-1">
                        <span class="monster-name">${defaultData.name}</span>
                        <div class="level-role-section">
                            <span class="field-label">Level:</span>
                            <span class="level-value">${defaultData.level}</span>
                            <span class="field-label">Role:</span>
                            <span class="role-value">${formatMonsterRole(monsterData) || '—'}</span>
                        </div>
                    </div>
                    <div class="info-row-2">
                        <span class="field-label">Type:</span>
                        <span class="types-value">${defaultData.types}</span>
                        <span class="field-label">EV:</span>
                        <span class="ev-value">${formatMonsterEv(monsterData) || '—'}</span>
                        <button class="edit-monster-btn" onclick="event.stopPropagation(); enterEditorMode('${monsterId}')">✏️ Edit</button>
                    </div>
                </div>
            </div>
            
            <!-- Compact Stats Grid -->
            <div class="search-stats-grid">
                <div class="search-stat-item">
                    <span class="search-stat-label">Size:</span>
                    <span class="search-stat-value">${defaultData.size}</span>
                </div>
                <div class="search-stat-item">
                    <span class="search-stat-label">Speed:</span>
                    <span class="search-stat-value">${defaultData.speed}</span>
                </div>
                <div class="search-stat-item">
                    <span class="search-stat-label">Stamina:</span>
                    <span class="search-stat-value">${defaultData.stamina}</span>
                </div>
                <div class="search-stat-item">
                    <span class="search-stat-label">Stability:</span>
                    <span class="search-stat-value">${defaultData.stability}</span>
                </div>
                <div class="search-stat-item">
                    <span class="search-stat-label">Free Strike:</span>
                    <span class="search-stat-value">${defaultData.free_strike}</span>
                </div>
                <div class="search-stat-item">
                    <span class="search-stat-label">Movement:</span>
                    <span class="search-stat-value">${(monsterData.movement_modes || []).join(', ') || defaultData.movement || '—'}</span>
                </div>
                <div class="search-stat-item">
                    <span class="search-stat-label">Immunity:</span>
                    <span class="search-stat-value">${formatMonsterDefenseList(monsterData.immunities) || '—'}</span>
                </div>
                <div class="search-stat-item">
                    <span class="search-stat-label">Weakness:</span>
                    <span class="search-stat-value">${formatMonsterDefenseList(monsterData.weaknesses) || '—'}</span>
                </div>
                ${(monsterData.with_captain || '').trim() ? `
                <div class="search-stat-item search-stat-item--captain">
                    <span class="search-stat-label">With Captain:</span>
                    <span class="search-stat-value">${escapeMonsterText(monsterData.with_captain)}</span>
                </div>` : ''}
            </div>
            
            <!-- Compact Attributes -->
            <div class="attributes-bar">
                <div class="attribute">
                    <span class="attribute-label"><span class="first-letter">M</span>ight</span>
                    <span class="attribute-value">${formatAttributeValue(defaultData.might)}</span>
                </div>
                <div class="attribute-separator"></div>
                <div class="attribute">
                    <span class="attribute-label"><span class="first-letter">A</span>gility</span>
                    <span class="attribute-value">${formatAttributeValue(defaultData.agility)}</span>
                </div>
                <div class="attribute-separator"></div>
                <div class="attribute">
                    <span class="attribute-label"><span class="first-letter">R</span>eason</span>
                    <span class="attribute-value">${formatAttributeValue(defaultData.reason)}</span>
                </div>
                <div class="attribute-separator"></div>
                <div class="attribute">
                    <span class="attribute-label"><span class="first-letter">I</span>ntuition</span>
                    <span class="attribute-value">${formatAttributeValue(defaultData.intuition)}</span>
                </div>
                <div class="attribute-separator"></div>
                <div class="attribute">
                    <span class="attribute-label"><span class="first-letter">P</span>resence</span>
                    <span class="attribute-value">${formatAttributeValue(defaultData.presence)}</span>
                </div>
            </div>
            
            <!-- Expandable Abilities Section -->
            <div class="search-abilities" id="abilities-${monsterId}">
                ${renderCompactAbilities(defaultData.abilities)}
            </div>
        </div>
    `;
    
    return card;
}

function renderCompactAbilities(abilities) {
    if (!abilities || typeof abilities !== 'object') return '';
    
    const categories = [
        { key: 'passive', name: 'Passive' },
        { key: 'maneuver', name: 'Maneuver' },
        { key: 'action', name: 'Action' },
        { key: 'triggered_action', name: 'Triggered Action' },
        { key: 'villain_action', name: 'Villain Action' },
        { key: 'malice', name: 'Malice' }
    ];
    
    let html = '';
    
    categories.forEach(category => {
        const categoryAbilities = abilities[category.key] || [];
        if (categoryAbilities.length > 0) {
            html += `
                <div class="search-ability-category category-${category.key}">
                    <div class="category-header">
                        <span class="category-name"><span class="category-icon" aria-hidden="true">${getCategoryIcon(category.key)}</span>${category.name}</span>
                        <span class="ability-count">${categoryAbilities.length}</span>
                    </div>
                    <div class="category-content">
                        ${categoryAbilities.map(ability => renderCompactAbility(ability, category.key)).join('')}
                    </div>
                </div>
            `;
        }
    });
    
    return html || '<div class="no-abilities">No abilities</div>';
}

function renderCompactAbility(ability, category) {
    if (!ability) return '';
    
    let details = [];
    if (ability.keywords) details.push(`Keywords: ${ability.keywords}`);
    if (ability.range) details.push(`Range: ${ability.range}`);
    if (ability.targets) details.push(`Targets: ${ability.targets}`);
    // Only show cost for villain_action and malice
    if ((category === 'villain_action' || category === 'malice') && ability.resource_cost) {
        details.push(`Cost: ${ability.resource_cost}`);
    }
    
    let html = `
        <div class="search-ability-item">
            <div class="search-ability-name">${ability.name || 'Unnamed Ability'}</div>
            ${details.length > 0 ? `<div class="search-ability-details">${details.join(' • ')}</div>` : ''}
            ${ability.trigger && category === 'triggered_action' ? `<div class="search-ability-details"><strong>Trigger:</strong> ${ability.trigger}</div>` : ''}
            ${ability.effect ? `<div class="search-ability-details">${ability.effect}</div>` : ''}
    `;
    
    // Add test information if ability has tests
    if (ability.has_test && ability.test) {
        const testHtml = renderCompactTestInfo(ability.test);
        if (testHtml) {
            html += `<div class="search-test-section">
                <div class="search-test-header">Test Results:</div>
                ${testHtml}
            </div>`;
        }
    }
    
    // Add additional effect at the end
    if (ability.additional_effect) {
        html += `<div class="search-ability-details"><em>${ability.additional_effect}</em></div>`;
    }
    
    html += '</div>';
    return html;
}

function renderCompactTestInfo(test) {
    if (!test) return '';
    
    const tiers = [
        { key: 'tier1', label: '≤11' },
        { key: 'tier2', label: '12-16' },
        { key: 'tier3', label: '17+' }
    ];
    
    let testHtml = '';
    
    tiers.forEach(tier => {
        const tierData = test[tier.key];
        if (tierData && (tierData.damage_amount || tierData.damage_type)) {
            let tierText = `• (${tier.label}): `;
            
            // Add damage info
            if (tierData.damage_amount || tierData.damage_type) {
                const damage = tierData.damage_amount || '';
                const type = tierData.damage_type || '';
                if (damage) {
                    tierText += damage;
                    if (type) {
                        tierText += ` ${type} damage`;
                    } else {
                        tierText += ' damage';
                    }
                } else if (type) {
                    // If only type is specified, just show the type
                    tierText += type;
                }
            }
            
            // Add attribute check info
            if (tierData.has_attribute_check && tierData.attribute && tierData.attribute_threshold) {
                const attributeName = tierData.attribute.charAt(0).toUpperCase() + tierData.attribute.slice(1);
                tierText += `; ${attributeName} ≤${tierData.attribute_threshold}`;
                if (tierData.attribute_effect) {
                    tierText += `: ${tierData.attribute_effect}`;
                }
            }
            
            testHtml += `<div class="search-test-tier">${tierText}</div>`;
        }
    });
    
    return testHtml;
}

function toggleCardExpansion(monsterId) {
    const card = document.querySelector(`[data-monster-id="${monsterId}"]`);
    const abilitiesSection = document.getElementById(`abilities-${monsterId}`);
    
    if (!card || !abilitiesSection) return;
    
    const isExpanded = card.classList.contains('expanded');
    
    if (isExpanded) {
        card.classList.remove('expanded');
        abilitiesSection.classList.remove('expanded');
    } else {
        card.classList.add('expanded');
        abilitiesSection.classList.add('expanded');
    }
}

function createFullMonsterCard(monsterId, monsterData) {
    const card = document.createElement('div');
    card.className = 'monster-card';
    card.setAttribute('data-monster-id', monsterId);
    
    // Initialize nested data structures and new fields if they don't exist
    if (!monsterData.abilities) {
        monsterData.abilities = {
            passive: [
                // Test ability with new comprehensive format
                {
                    name: 'Aura of Fear',
                    roll_bonus: 2,
                    action_type: 'Passive',
                    resource_cost: '',
                    keywords: 'Fear, Aura',
                    range: '5 squares',
                    targets: 'All enemies',
                    effect: 'Enemies within range are frightened while in the aura.',
                    has_test: true,
                    test: {
                        tier1: { damage_amount: '1d4', damage_type: 'psychic', has_attribute_check: true, attribute: 'intuition', attribute_threshold: 12, attribute_effect: 'stunned until end of turn' },
                        tier2: { damage_amount: '2d4', damage_type: 'psychic', has_attribute_check: true, attribute: 'intuition', attribute_threshold: 15, attribute_effect: 'paralyzed until end of turn' },
                        tier3: { damage_amount: '3d4', damage_type: 'psychic', has_attribute_check: false, attribute: 'intuition', attribute_threshold: 0, attribute_effect: '' }
                    },
                    additional_effect: 'This effect persists until the creature leaves the aura.'
                }
            ],
            maneuver: [],
            action: [],
            triggered_action: [],
            villain_action: [],
            malice: []
        };
    } else if (Array.isArray(monsterData.abilities)) {
        // Migrate old flat array structure to categorized
        const oldAbilities = monsterData.abilities;
        monsterData.abilities = {
            passive: [],
            maneuver: [],
            action: oldAbilities, // Put existing abilities in 'action' category
            triggered_action: [],
            villain_action: [],
            malice: []
        };
    }
    if (!monsterData.spells) monsterData.spells = [];
    if (monsterData.role === undefined) monsterData.role = 'Brute';
    if (monsterData.types === undefined) monsterData.types = '';
    if (monsterData.ev === undefined) monsterData.ev = 0;
    if (monsterData.image === undefined) monsterData.image = '';
    
    // Initialize new stats system fields
    if (monsterData.size === undefined) monsterData.size = '1M';
    if (monsterData.speed === undefined) monsterData.speed = 0;
    if (monsterData.stamina === undefined) monsterData.stamina = 0;
    if (monsterData.stability === undefined) monsterData.stability = 0;
    if (monsterData.free_strike === undefined) monsterData.free_strike = 0;
    if (monsterData.immunity_type === undefined) monsterData.immunity_type = '';
    if (monsterData.immunity_value === undefined) monsterData.immunity_value = '';
    if (monsterData.weakness_type === undefined) monsterData.weakness_type = '';
    if (monsterData.weakness_value === undefined) monsterData.weakness_value = '';
    // Migrate legacy single immunity/weakness to multi-entry array form.
    ensureMonsterDefenseArrays(monsterData);
    if (monsterData.movement === undefined) monsterData.movement = '';
    if (monsterData.might === undefined) monsterData.might = 0;
    if (monsterData.agility === undefined) monsterData.agility = 0;
    if (monsterData.reason === undefined) monsterData.reason = 0;
    if (monsterData.intuition === undefined) monsterData.intuition = 0;
    if (monsterData.presence === undefined) monsterData.presence = 0;
    
    // Migrate legacy single-role string to org + tactical_role pair.
    ensureMonsterRoleSplit(monsterData);
    ensureMonsterMovementModes(monsterData);

    const organizationOptions = ['', 'Solo', 'Elite', 'Platoon', 'Horde', 'Minion', 'Retainer', 'Leader'];
    const organizationDropdown = organizationOptions.map(option =>
        `<option value="${option}" ${(monsterData.organization || '') === option ? 'selected' : ''}>${option || '— none —'}</option>`
    ).join('');

    const tacticalRoleOptions = ['', 'Ambusher', 'Artillery', 'Brute', 'Controller', 'Defender', 'Harrier', 'Hexer', 'Mount', 'Support'];
    const tacticalRoleDropdown = tacticalRoleOptions.map(option =>
        `<option value="${option}" ${(monsterData.tactical_role || '') === option ? 'selected' : ''}>${option || '— none —'}</option>`
    ).join('');

    const isMinion = (monsterData.organization || '').toLowerCase() === 'minion';
    const captainEligible = ['minion', 'horde', 'platoon'].includes((monsterData.organization || '').toLowerCase());
    
    // Size options dropdown
    const sizeOptions = ['1T', '1S', '1M', '1L', '2', '3', '4', '5'];
    const sizeDropdown = sizeOptions.map(option => 
        `<option value="${option}" ${monsterData.size === option ? 'selected' : ''}>${option}</option>`
    ).join('');
    
    // Create image display HTML
    const imageDisplay = monsterData.image ? 
        `<div class="monster-image" onclick="showImageModal('${monsterId}')">
            <img src="images/${monsterData.image}" alt="${monsterData.name || 'Monster'}">
        </div>` :
        `<div class="image-upload-area" onclick="document.getElementById('file-${monsterId}').click()">
            <span class="upload-icon">📷</span>
            <span class="upload-text">Upload Image</span>
        </div>`;

    card.innerHTML = `
        <div class="card-header">
            <button class="card-menu" onclick="deleteMonster('${monsterId}')">×</button>
        </div>
        <div class="card-body">
            <!-- New Top Section with Image and Enhanced Layout -->
            <div class="monster-info-top">
                <div class="info-left">
                    ${imageDisplay}
                    <input type="file" id="file-${monsterId}" style="display: none;" 
                           accept="image/*" onchange="handleImageUpload('${monsterId}', this)">
                </div>
                <div class="info-right">
                    <div class="info-row-1">
                        <input type="text" class="monster-name" id="name-${monsterId}" placeholder="Monster Name" aria-label="Monster Name"
                               data-field="name" value="${monsterData.name || ''}">
                        <div class="level-role-section">
                            <label class="field-label" for="level-${monsterId}">Level:</label>
                            <input type="number" class="level-input" id="level-${monsterId}" placeholder="1"
                                   data-field="level" value="${monsterData.level || 1}" min="1" max="30">
                            <label class="field-label" for="organization-${monsterId}">Org:</label>
                            <select class="role-select" id="organization-${monsterId}" data-field="organization" data-role-part="organization">
                                ${organizationDropdown}
                            </select>
                            <label class="field-label" for="tactical-role-${monsterId}">Role:</label>
                            <select class="role-select" id="tactical-role-${monsterId}" data-field="tactical_role" data-role-part="tactical">
                                ${tacticalRoleDropdown}
                            </select>
                        </div>
                    </div>
                    <div class="info-row-2">
                        <label class="field-label" for="types-${monsterId}">Type:</label>
                        <input type="text" class="types-input" id="types-${monsterId}" placeholder="Fire, Dragon, etc."
                               data-field="types" value="${monsterData.types || ''}">
                        <label class="field-label" for="ev-${monsterId}">EV:</label>
                        <input type="number" class="ev-input" id="ev-${monsterId}" placeholder="0"
                               data-field="ev" value="${monsterData.ev || 0}" min="0">
                        ${isMinion ? '<span class="ev-minion-suffix">for four minions</span>' : ''}
                        ${currentMode === 'search' ?
                            `<button class="edit-monster-btn" onclick="enterEditorMode('${monsterId}')">✏️ Edit</button>` :
                            ''
                        }
                    </div>
                </div>
            </div>
            
            <!-- Monster Stats -->
            <div class="monster-stats">
                <!-- Core Stats Row -->
                <div class="core-stats-row">
                    <div class="core-stat">
                        <select class="core-stat-input" id="size-${monsterId}" data-field="size">
                            ${sizeDropdown}
                        </select>
                        <label class="core-stat-label" for="size-${monsterId}">Size</label>
                    </div>
                    <div class="core-stat">
                        <input type="number" class="core-stat-input" id="speed-${monsterId}" data-field="speed" value="${monsterData.speed || 0}" min="0" max="200">
                        <label class="core-stat-label" for="speed-${monsterId}">Speed</label>
                    </div>
                    <div class="core-stat">
                        <input type="number" class="core-stat-input" id="stamina-${monsterId}" data-field="stamina" value="${monsterData.stamina || 0}" min="0" max="50">
                        <label class="core-stat-label" for="stamina-${monsterId}">Stamina</label>
                    </div>
                    <div class="core-stat">
                        <input type="number" class="core-stat-input" id="stability-${monsterId}" data-field="stability" value="${monsterData.stability || 0}" min="0" max="30">
                        <label class="core-stat-label" for="stability-${monsterId}">Stability</label>
                    </div>
                    <div class="core-stat">
                        <input type="number" class="core-stat-input" id="free-strike-${monsterId}" data-field="free_strike" value="${monsterData.free_strike || 0}" min="0" max="10">
                        <label class="core-stat-label" for="free-strike-${monsterId}">Free Strike</label>
                    </div>
                </div>

                <!-- Defensive Stats Row -->
                <div class="defensive-stats-row">
                    ${renderMonsterDefenseEditor(monsterId, monsterData, 'immunity')}
                    ${renderMonsterDefenseEditor(monsterId, monsterData, 'weakness')}
                    ${renderMonsterMovementEditor(monsterId, monsterData)}
                </div>
                ${captainEligible ? `
                <div class="captain-row">
                    <span class="captain-label">With Captain:</span>
                    <input type="text" class="captain-input" data-field="with_captain" value="${(monsterData.with_captain || '').replace(/"/g, '&quot;')}" placeholder="+2 damage bonus to strikes">
                </div>` : ''}

                <!-- Attributes Bar -->
                <div class="attributes-bar">
                    <div class="attribute">
                        <label class="attribute-label" for="might-${monsterId}"><span class="first-letter">M</span>ight</label>
                        <input type="text" class="attribute-input" id="might-${monsterId}" data-field="might" data-attribute="true" value="${formatAttributeValue(monsterData.might || 0)}" data-raw-value="${monsterData.might || 0}">
                    </div>
                    <div class="attribute-separator"></div>
                    <div class="attribute">
                        <label class="attribute-label" for="agility-${monsterId}"><span class="first-letter">A</span>gility</label>
                        <input type="text" class="attribute-input" id="agility-${monsterId}" data-field="agility" data-attribute="true" value="${formatAttributeValue(monsterData.agility || 0)}" data-raw-value="${monsterData.agility || 0}">
                    </div>
                    <div class="attribute-separator"></div>
                    <div class="attribute">
                        <label class="attribute-label" for="reason-${monsterId}"><span class="first-letter">R</span>eason</label>
                        <input type="text" class="attribute-input" id="reason-${monsterId}" data-field="reason" data-attribute="true" value="${formatAttributeValue(monsterData.reason || 0)}" data-raw-value="${monsterData.reason || 0}">
                    </div>
                    <div class="attribute-separator"></div>
                    <div class="attribute">
                        <label class="attribute-label" for="intuition-${monsterId}"><span class="first-letter">I</span>ntuition</label>
                        <input type="text" class="attribute-input" id="intuition-${monsterId}" data-field="intuition" data-attribute="true" value="${formatAttributeValue(monsterData.intuition || 0)}" data-raw-value="${monsterData.intuition || 0}">
                    </div>
                    <div class="attribute-separator"></div>
                    <div class="attribute">
                        <label class="attribute-label" for="presence-${monsterId}"><span class="first-letter">P</span>resence</label>
                        <input type="text" class="attribute-input" id="presence-${monsterId}" data-field="presence" data-attribute="true" value="${formatAttributeValue(monsterData.presence || 0)}" data-raw-value="${monsterData.presence || 0}">
                    </div>
                </div>
            </div>
            
            <!-- Abilities Section -->
            <div class="abilities-section">
                <h4>Abilities</h4>
                <div class="abilities-container" id="abilities-${monsterId}">
                    ${renderCategorizedAbilities(monsterId, monsterData.abilities)}
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners using new system
    setupCardEventListeners(card, monsterId);
    
    return card;
}

// Legacy function for backward compatibility
function renderAbilities(abilities) {
    if (Array.isArray(abilities)) {
        return abilities.map((ability, index) => renderSingleAbility(ability, index, 'action')).join('');
    }
    return '';
}

// New categorized abilities renderer
function renderCategorizedAbilities(monsterId, abilities) {
    const categories = [
        { key: 'passive', name: 'Passive' },
        { key: 'maneuver', name: 'Maneuver' },
        { key: 'action', name: 'Action' },
        { key: 'triggered_action', name: 'Triggered Action' },
        { key: 'villain_action', name: 'Villain Action' },
        { key: 'malice', name: 'Malice' }
    ];

    return categories.map(category => {
        const categoryAbilities = abilities[category.key] || [];
        const hasAbilities = categoryAbilities.length > 0;
        const expandedClass = hasAbilities ? 'expanded' : 'collapsed';
        const hasAbilitiesClass = hasAbilities ? 'has-abilities' : '';
        const abilityCount = categoryAbilities.length;
        
        return `
            <div class="ability-category category-${category.key} ${expandedClass} ${hasAbilitiesClass}" data-category="${category.key}">
                <div class="category-header" onclick="toggleCategory('${monsterId}', '${category.key}')">
                    <span class="category-name"><span class="category-icon" aria-hidden="true">${getCategoryIcon(category.key)}</span>${category.name}</span>
                    ${abilityCount > 0 ? `<span class="ability-count">${abilityCount}</span>` : ''}
                    <button class="btn-small add-category-btn" onclick="event.stopPropagation(); addAbility('${monsterId}', '${category.key}')">+ Add</button>
                    <span class="expand-icon">${hasAbilities ? '▼' : '▶'}</span>
                </div>
                <div class="category-content">
                    ${categoryAbilities.map((ability, index) => 
                        renderSingleAbility(ability, index, category.key, monsterId)
                    ).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// Render individual ability with comprehensive format
function renderSingleAbility(ability, index, category, monsterId = '') {
    // Migrate simple ability format if needed
    if (ability.dice && !ability.roll_bonus === undefined) {
        ability = migrateAbility(ability, category);
    }
    
    // Ensure test structure exists and has_test is defined
    if (ability.has_test === undefined) {
        ability.has_test = false;
    }
    if (!ability.test) {
        ability.test = {
            tier1: { damage_amount: '', damage_type: '', has_attribute_check: false, attribute: 'might', attribute_threshold: 0, attribute_effect: '' },
            tier2: { damage_amount: '', damage_type: '', has_attribute_check: false, attribute: 'might', attribute_threshold: 0, attribute_effect: '' },
            tier3: { damage_amount: '', damage_type: '', has_attribute_check: false, attribute: 'might', attribute_threshold: 0, attribute_effect: '' }
        };
    }

    // HOOK POINT: monster-automation-ui.js binds clicks on .monster-automate-btn
    // via event delegation. The data-* attributes carry everything the handler
    // needs to look up the ability, open the paste modal, and refresh the pip.
    const hasAutomation = ability.automation && typeof ability.automation === 'object'
        && Object.keys(ability.automation).length > 0;
    const automateButtonHtml = `
        <button type="button"
                class="btn-small monster-automate-btn automation-action-btn ${hasAutomation ? 'automation-action-btn--configured' : ''}"
                data-monster-id="${monsterId}"
                data-ability-category="${category}"
                data-ability-index="${index}"
                title="${hasAutomation ? 'Edit automation JSON' : 'Add automation JSON'}">
            <span class="automation-action-btn__status" aria-hidden="true"></span>
            <span class="monster-automate-btn__label">Automate</span>
        </button>
    `;

    return `
        <div class="ability-item" data-ability-index="${index}" data-category="${category}">
            <!-- Row 1: Header Information -->
            <div class="ability-row-1">
                <input type="text" class="ability-name" placeholder="Ability Name"
                       data-field-path="abilities.${category}.${index}.name"
                       value="${ability.name || ''}">

                <span class="action-type">${ability.action_type || getCategoryDisplayName(category)}</span>

                ${(category === 'villain_action' || category === 'malice') ? `
                    <input type="text" class="resource-cost-input" placeholder="3 points"
                           data-field-path="abilities.${category}.${index}.resource_cost"
                           value="${ability.resource_cost || ''}">
                ` : ''}

                ${automateButtonHtml}
                <button class="btn-small remove-ability" onclick="removeAbility(this, '${category}')">×</button>
            </div>
            
            ${category === 'triggered_action' ? `
            <!-- Trigger Row for Triggered Actions -->
            <div class="ability-row-trigger">
                <label>Trigger:</label>
                <textarea class="trigger-input" placeholder="Describe what triggers this action (e.g., 'When an enemy moves adjacent to this creature', 'At the start of each turn', etc.)" 
                          data-field-path="abilities.${category}.${index}.trigger">${ability.trigger || ''}</textarea>
            </div>
            ` : ''}

            <!-- Row 2: Combat Details -->
            <div class="ability-row-2">
                <div class="keywords-section">
                    <label>Keywords:</label>
                    <input type="text" class="keywords-input" placeholder="Fear, Aura, Fire" 
                           data-field-path="abilities.${category}.${index}.keywords" 
                           value="${ability.keywords || ''}">
                </div>
                
                <div class="range-section">
                    <span class="range-icon">📏</span>
                    <label>Range:</label>
                    <input type="text" class="range-input" placeholder="5 squares" 
                           data-field-path="abilities.${category}.${index}.range" 
                           value="${ability.range || ''}">
                </div>
                
                <div class="targets-section">
                    <span class="target-icon">🎯</span>
                    <label>Targets:</label>
                    <input type="text" class="targets-input" placeholder="1 creature" 
                           data-field-path="abilities.${category}.${index}.targets" 
                           value="${ability.targets || ''}">
                </div>
            </div>

            <!-- Row 3: Effect -->
            <div class="ability-row-3">
                <label>Effect:</label>
                <textarea class="effect-input" placeholder="Describe the main effect of this ability..." 
                          data-field-path="abilities.${category}.${index}.effect">${ability.effect || ''}</textarea>
            </div>

            <!-- Row 4: Test System -->
            <div class="ability-row-4">
                ${ability.has_test ? `
                    <div class="test-header" onclick="toggleTestSection(event, '${monsterId}', '${category}', ${index})">
                        <span class="test-label">Test</span>
                        <span class="test-toggle">▶</span>
                    </div>
                    <div class="test-content collapsed">
                        <!-- Roll section moved to top of test -->
                        <div class="test-roll-section">
                            <span class="roll-text">2d10+</span>
                            <input type="number" class="roll-bonus" min="0" max="20" 
                                   data-field-path="abilities.${category}.${index}.roll_bonus" 
                                   value="${ability.roll_bonus || 0}">
                        </div>
                        
                        ${renderTestTier('tier1', '≤ 11', ability.test.tier1, category, index)}
                        ${renderTestTier('tier2', '12-16', ability.test.tier2, category, index)}
                        ${renderTestTier('tier3', '17+', ability.test.tier3, category, index)}
                        
                        <!-- Additional Effect inside test -->
                        <div class="additional-effect-section">
                            <label>Additional Effect:</label>
                            <textarea class="additional-effect-input" placeholder="Any additional effects after the test..." 
                                      data-field-path="abilities.${category}.${index}.additional_effect">${ability.additional_effect || ''}</textarea>
                        </div>
                    </div>
                ` : `
                    <button class="btn-small add-test-btn" onclick="addTest('${monsterId}', '${category}', ${index})">
                        + Add Test
                    </button>
                `}
            </div>
        </div>
    `;
}

// Render individual test tier
function renderTestTier(tierKey, tierLabel, tierData, category, abilityIndex) {
    return `
        <div class="test-tier" data-tier="${tierKey}">
            <div class="tier-header">
                <span class="tier-label">(${tierLabel})</span>
                <input type="text" class="damage-amount" placeholder="2d6" 
                       data-field-path="abilities.${category}.${abilityIndex}.test.${tierKey}.damage_amount" 
                       value="${tierData.damage_amount || ''}"
                       onchange="updateDamageLabel(this, '${category}', ${abilityIndex}, '${tierKey}')">
                <input type="text" class="damage-type" placeholder="type of damage" 
                       data-field-path="abilities.${category}.${abilityIndex}.test.${tierKey}.damage_type" 
                       value="${tierData.damage_type || ''}">
                <span class="damage-label" data-tier="${tierKey}">${tierData.damage_amount ? 'damage;' : ''}</span>
                
                <button class="btn-small attribute-toggle ${tierData.has_attribute_check ? 'active' : ''}" 
                        onclick="toggleAttributeCheck('${category}', ${abilityIndex}, '${tierKey}')">
                    Attribute Check
                </button>
            </div>
            
            <div class="attribute-section ${tierData.has_attribute_check ? 'visible' : 'hidden'}">
                <div class="attribute-check-row">
                    <select class="attribute-select" data-field-path="abilities.${category}.${abilityIndex}.test.${tierKey}.attribute">
                        <option value="might" ${tierData.attribute === 'might' ? 'selected' : ''}>Might</option>
                        <option value="agility" ${tierData.attribute === 'agility' ? 'selected' : ''}>Agility</option>
                        <option value="reason" ${tierData.attribute === 'reason' ? 'selected' : ''}>Reason</option>
                        <option value="intuition" ${tierData.attribute === 'intuition' ? 'selected' : ''}>Intuition</option>
                        <option value="presence" ${tierData.attribute === 'presence' ? 'selected' : ''}>Presence</option>
                    </select>
                    <span>≤</span>
                    <input type="number" class="attribute-threshold" min="0" max="30" 
                           data-field-path="abilities.${category}.${abilityIndex}.test.${tierKey}.attribute_threshold" 
                           value="${tierData.attribute_threshold || 0}">
                    <span>:</span>
                </div>
                <div class="attribute-effect-row">
                    <input type="text" class="attribute-effect" placeholder="stunned until end of turn" 
                           data-field-path="abilities.${category}.${abilityIndex}.test.${tierKey}.attribute_effect" 
                           value="${tierData.attribute_effect || ''}">
                </div>
            </div>
        </div>
    `;
}

// Function to update damage label visibility
function updateDamageLabel(input, category, abilityIndex, tierKey) {
    const damageLabel = input.closest('.tier-header').querySelector('.damage-label');
    if (damageLabel) {
        damageLabel.textContent = input.value.trim() ? 'damage;' : '';
    }
    
    // Update the data
    const monsterId = input.closest('.monster-card')?.getAttribute('data-monster-id');
    if (monsterId) {
        const monster = monsterData.monsters[monsterId];
        if (monster && monster.abilities && monster.abilities[category] && monster.abilities[category][abilityIndex]) {
            markMonsterDirty(monsterId);
        }
    }
}

// Toggle test section visibility with enhanced targeting and debugging
let toggleDebounceTimer = null;
let animatingElements = new Set(); // Track elements currently animating

function toggleTestSection(event, monsterId, category, abilityIndex) {
    event.preventDefault();
    event.stopPropagation();
    
    // Create unique element ID for tracking
    const elementId = `${monsterId}-${category}-${abilityIndex}`;
    
    // Prevent multiple rapid clicks on the same element
    if (animatingElements.has(elementId)) {
        console.log(`Animation already in progress for ${elementId}`);
        return;
    }
    
    // Enhanced selector with category specificity
    const categorySelector = `[data-monster-id="${monsterId}"] [data-category="${category}"] .ability-item[data-ability-index="${abilityIndex}"]`;
    let testContent = document.querySelector(`${categorySelector} .test-content`);
    let toggle = document.querySelector(`${categorySelector} .test-toggle`);
    
    // Fallback selector if category-specific fails
    if (!testContent || !toggle) {
        console.log(`Primary selector failed for ${elementId}, trying fallback`);
        const fallbackSelector = `[data-monster-id="${monsterId}"] .ability-item[data-ability-index="${abilityIndex}"][data-category="${category}"]`;
        testContent = document.querySelector(`${fallbackSelector} .test-content`);
        toggle = document.querySelector(`${fallbackSelector} .test-toggle`);
    }
    
    // Additional fallback using direct DOM traversal
    if (!testContent || !toggle) {
        console.log(`Fallback selector failed for ${elementId}, trying DOM traversal`);
        const clickedElement = event.target.closest('.test-header');
        if (clickedElement) {
            testContent = clickedElement.nextElementSibling;
            toggle = clickedElement.querySelector('.test-toggle');
        }
    }
    
    if (testContent && toggle) {
        console.log(`Successfully found elements for ${elementId}`);
        
        // Add to animating set
        animatingElements.add(elementId);
        
        // Clear any stuck pointer events from previous operations
        testContent.style.pointerEvents = '';
        
        if (testContent.classList.contains('collapsed')) {
            // Expanding
            console.log(`Expanding test section for ${elementId}`);
            testContent.classList.remove('collapsed');
            testContent.classList.add('expanded');
            toggle.textContent = '▼';
        } else {
            // Collapsing
            console.log(`Collapsing test section for ${elementId}`);
            testContent.classList.remove('expanded');
            testContent.classList.add('collapsed');
            toggle.textContent = '▶';
        }
        
        // Remove from animating set after animation completes
        setTimeout(() => {
            animatingElements.delete(elementId);
            console.log(`Animation completed for ${elementId}`);
        }, 300); // Slightly longer than CSS transition for safety
        
    } else {
        console.error(`Failed to find test elements for monster: ${monsterId}, category: ${category}, index: ${abilityIndex}`);
        console.error('Available monster cards:', document.querySelectorAll(`[data-monster-id="${monsterId}"]`));
        console.error('Available ability items:', document.querySelectorAll(`[data-monster-id="${monsterId}"] .ability-item`));
    }
}

// Cleanup function to reset any stuck animation states
function cleanupAnimationStates() {
    // Clear the animating elements set
    const wasAnimating = animatingElements.size > 0;
    animatingElements.clear();
    
    // Reset any stuck pointer-events
    let stuckElements = 0;
    const allTestContent = document.querySelectorAll('.test-content');
    allTestContent.forEach(element => {
        if (element.style.pointerEvents === 'none') {
            element.style.pointerEvents = '';
            stuckElements++;
        }
    });
    
    if (wasAnimating || stuckElements > 0) {
        console.log(`Animation cleanup completed: ${stuckElements} stuck elements reset, ${wasAnimating ? 'cleared animating set' : 'no animations in progress'}`);
    }
}

// Debug function to inspect current test section states
function debugTestSections() {
    console.group('Test Section Debug Info');
    
    const allMonsters = document.querySelectorAll('[data-monster-id]');
    console.log(`Found ${allMonsters.length} monster cards`);
    
    allMonsters.forEach(monsterCard => {
        const monsterId = monsterCard.getAttribute('data-monster-id');
        const abilities = monsterCard.querySelectorAll('.ability-item');
        console.log(`Monster ${monsterId}: ${abilities.length} abilities`);
        
        abilities.forEach(ability => {
            const index = ability.getAttribute('data-ability-index');
            const category = ability.getAttribute('data-category');
            const testContent = ability.querySelector('.test-content');
            const toggle = ability.querySelector('.test-toggle');
            
            if (testContent) {
                const isCollapsed = testContent.classList.contains('collapsed');
                const isExpanded = testContent.classList.contains('expanded');
                const hasPointerEvents = testContent.style.pointerEvents === 'none';
                
                console.log(`  Ability ${category}[${index}]: ${isCollapsed ? 'collapsed' : isExpanded ? 'expanded' : 'unknown state'} ${hasPointerEvents ? '(pointer-events disabled)' : ''}`);
            }
        });
    });
    
    console.log(`Currently animating elements: ${Array.from(animatingElements).join(', ') || 'none'}`);
    console.groupEnd();
}

// Add test to an ability
function addTest(monsterId, category, abilityIndex) {
    event.preventDefault();
    event.stopPropagation();
    
    const monster = monsterData.monsters[monsterId];
    if (monster && monster.abilities && monster.abilities[category] && monster.abilities[category][abilityIndex]) {
        monster.abilities[category][abilityIndex].has_test = true;
        
        // Refresh the monster card to show the test section
        refreshMonsterCard(monsterId);
        markMonsterDirty(monsterId);
    }
}

// Toggle attribute check for a specific tier
function toggleAttributeCheck(category, abilityIndex, tierKey) {
    const button = event.currentTarget;
    const attributeSection = button.closest('.test-tier').querySelector('.attribute-section');
    const monsterId = button.closest('.monster-card').getAttribute('data-monster-id');
    
    const isActive = button.classList.contains('active');
    
    if (isActive) {
        button.classList.remove('active');
        attributeSection.classList.remove('visible');
        attributeSection.classList.add('hidden');
    } else {
        button.classList.add('active');
        attributeSection.classList.remove('hidden');
        attributeSection.classList.add('visible');
    }
    
    // Update the data
    const monster = monsterData.monsters[monsterId];
    if (monster && monster.abilities && monster.abilities[category] && monster.abilities[category][abilityIndex]) {
        monster.abilities[category][abilityIndex].test[tierKey].has_attribute_check = !isActive;
        markMonsterDirty(monsterId);
    }
}

function setupCardEventListeners(card, monsterId) {
    // Remove old listeners if they exist
    if (changeListeners.has(monsterId)) {
        changeListeners.get(monsterId).forEach(element => {
            element.removeEventListener('input', handleFieldChange);
            element.removeEventListener('change', handleFieldChange);
        });
    }
    
    // Add new listeners (exclude file inputs)
    const inputs = card.querySelectorAll('input:not([type="file"]), textarea, select');
    inputs.forEach(input => {
        input.addEventListener('input', handleFieldChange);
        input.addEventListener('change', handleFieldChange);
    });
    
    // Track listeners for cleanup
    changeListeners.set(monsterId, Array.from(inputs));
    
    // Add click handler to enter editor mode from search (only in search mode)
    if (currentMode === 'search') {
        const monsterHeader = card.querySelector('.monster-header');
        if (monsterHeader) {
            monsterHeader.style.cursor = 'pointer';
            monsterHeader.title = 'Click to edit this monster';
            monsterHeader.addEventListener('click', (e) => {
                // Only if clicking the header directly, not buttons or inputs
                if (e.target === monsterHeader || e.target.closest('.monster-name')) {
                    enterEditorMode(monsterId);
                }
            });
        }
    }
    
    // Simplified logging - only show when setting up many listeners
    if (inputs.length > 6) {
        console.log(`Set up ${inputs.length} event listeners for ${monsterId}`);
    }
}

// Delete monster function - Updated for new save system
async function deleteMonster(monsterId) {
    const monsterName = monsterData.monsters[monsterId]?.name || 'this monster';
    const confirmed = await UIKit.confirm({
        title: 'Delete Monster',
        message: `Are you sure you want to delete ${monsterName}?`,
        confirmText: 'Delete',
        danger: true
    });
    if (confirmed) {
        console.log(`Deleting monster: ${monsterId}`);
        
        // Clean up event listeners first
        if (changeListeners.has(monsterId)) {
            changeListeners.get(monsterId).forEach(element => {
                element.removeEventListener('input', handleFieldChange);
                element.removeEventListener('change', handleFieldChange);
            });
            changeListeners.delete(monsterId);
            console.log(`Cleaned up event listeners for ${monsterId}`);
        }
        
        // Remove from monsters data
        delete monsterData.monsters[monsterId];
        
        // Remove from ALL subtabs that contain this monster (not just current)
        let removedFromTabs = [];
        Object.entries(monsterData.tabs).forEach(([tabId, tab]) => {
            if (tab.subTabs) {
                Object.entries(tab.subTabs).forEach(([subTabId, subTab]) => {
                    if (subTab.monsters) {
                        const index = subTab.monsters.indexOf(monsterId);
                        if (index > -1) {
                            subTab.monsters.splice(index, 1);
                            removedFromTabs.push(`${tab.name} > ${subTab.name}`);
                        }
                    }
                });
            }
        });
        
        console.log(`Removed monster from tabs: ${removedFromTabs.join(', ')}`);
        
        // Remove from dirty tracking (if it was dirty)
        dirtyMonsters.delete(monsterId);
        
        // Mark tabs as needing save (since we modified subtab monster arrays)
        markTabsDirty();
        
        // Refresh UI immediately
        loadWorkspace();
        updateRightSidebar();
        
        console.log(`Monster ${monsterId} deleted successfully`);
    }
}

function saveCurrentWorkspace() {
    // Removed verbose workspace saving log for cleaner console
    
    document.querySelectorAll('.monster-card').forEach(card => {
        const monsterId = card.getAttribute('data-monster-id');
        const monster = monsterData.monsters[monsterId];
        
        console.log('Saving monster card:', monsterId, 'Current data:', monster);
        
        if (monster) {
            // Save all fields from the card
            const nameField = card.querySelector('.monster-name');
            const hpField = card.querySelector('[data-field="hp"]');
            const acField = card.querySelector('[data-field="ac"]');
            const speedField = card.querySelector('[data-field="speed"]');
            
            // Check if any values actually changed before updating lastModified
            let hasChanges = false;
            
            if (nameField && nameField.tagName === 'INPUT' && monster.name !== nameField.value) {
                monster.name = nameField.value;
                hasChanges = true;
            }
            if (hpField && monster.hp !== (parseInt(hpField.value) || 0)) {
                monster.hp = parseInt(hpField.value) || 0;
                hasChanges = true;
            }
            if (acField && monster.ac !== (parseInt(acField.value) || 0)) {
                monster.ac = parseInt(acField.value) || 0;
                hasChanges = true;
            }
            if (speedField && monster.speed !== speedField.value) {
                monster.speed = speedField.value;
                hasChanges = true;
            }
            
            // Only update lastModified if there were actual changes AND we're not in initial load
            if (hasChanges && !isInitialLoad) {
                monster.lastModified = Date.now();
                console.log('Monster modified:', monsterId);
            }
            
            console.log('Updated monster data:', monster);
        } else {
            console.warn('Monster data missing for ID:', monsterId);
        }
    });
    
    // Workspace save complete - removed verbose logging for cleaner console
}

function saveMonsterField(monsterId, input) {
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    
    // Don't save changes during initial load
    if (isInitialLoad) return;
    
    const field = input.getAttribute('data-field') || 'name';
    const value = input.type === 'number' ? parseInt(input.value) || 0 : input.value;
    
    if (input.classList.contains('monster-name')) {
        monster.name = value;
    } else {
        monster[field] = value;
    }
    
    monster.lastModified = Date.now();
    
    queueSave();
    console.log(`Saved ${field} for monster ${monsterId}:`, value);
}

// New Change Tracking Functions
function markMonsterDirty(monsterId) {
    if (!isInitialLoad) {
        dirtyMonsters.add(monsterId);
        // Only log when first marking as dirty, not for every keystroke
        if (dirtyMonsters.size === 1) {
            console.log(`Started tracking changes...`);
        }
        updateTabDirtyIndicators();
        queueSave();
    }
}

// Show an "unsaved changes" dot on tabs/sub-tabs containing dirty monsters
function updateTabDirtyIndicators() {
    const dirtyTabs = new Set();
    const dirtySubTabs = new Set();

    dirtyMonsters.forEach(monsterId => {
        Object.entries(monsterData.tabs || {}).forEach(([tabId, tab]) => {
            Object.entries(tab?.subTabs || {}).forEach(([subTabId, subTab]) => {
                if ((subTab?.monsters || []).includes(monsterId)) {
                    dirtyTabs.add(tabId);
                    dirtySubTabs.add(subTabId);
                }
            });
        });
    });

    document.querySelectorAll('.tab[data-tab-id]').forEach(el => {
        el.classList.toggle('has-unsaved', dirtyTabs.has(el.getAttribute('data-tab-id')));
    });
    document.querySelectorAll('.sub-tab[data-subtab-id]').forEach(el => {
        el.classList.toggle('has-unsaved', dirtySubTabs.has(el.getAttribute('data-subtab-id')));
    });
}

function markTabsDirty() {
    if (!isInitialLoad) {
        needsTabSave = true;
        console.log('Tab structure marked as dirty');
        queueSave();
    }
}

// ---------- Multi-entry immunity / weakness helpers ----------
//
// Canonical storage is `monster.immunities` and `monster.weaknesses` —
// each an array of { type, value } entries. The legacy single-field form
// (`immunity_type` / `immunity_value`) is still written so older readers
// keep working: it mirrors the first entry of the list.

function ensureMonsterDefenseArrays(monster) {
    if (!monster || typeof monster !== 'object') return;

    ['immunities', 'weaknesses'].forEach(listKey => {
        const singularKey = listKey === 'immunities' ? 'immunity' : 'weakness';

        // Already a non-empty array — normalize entries and we're done.
        if (Array.isArray(monster[listKey]) && monster[listKey].length > 0) {
            monster[listKey] = monster[listKey]
                .map(normalizeMonsterDefenseEntry)
                .filter(Boolean);
            syncLegacyDefenseFields(monster, singularKey);
            return;
        }

        // Build from legacy single fields if present.
        const legacyType = monster[`${singularKey}_type`];
        const legacyValue = monster[`${singularKey}_value`];
        const legacyEntry = normalizeMonsterDefenseEntry({ type: legacyType, value: legacyValue });
        monster[listKey] = legacyEntry ? [legacyEntry] : [];

        syncLegacyDefenseFields(monster, singularKey);
    });
}

function normalizeMonsterDefenseEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const rawType = entry.type ?? entry.damageType ?? '';
    const rawValue = entry.value ?? entry.amount ?? '';
    const type = String(rawType).trim();
    const valueStr = String(rawValue).trim();
    if (!type && !valueStr) return null;
    return { type, value: valueStr };
}

function syncLegacyDefenseFields(monster, singularKey) {
    const listKey = singularKey === 'immunity' ? 'immunities' : 'weaknesses';
    const list = Array.isArray(monster[listKey]) ? monster[listKey] : [];
    const first = list[0] || { type: '', value: '' };
    monster[`${singularKey}_type`] = first.type || '';
    monster[`${singularKey}_value`] = first.value || '';
}

function addMonsterDefense(monsterId, kind) {
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    const listKey = kind === 'immunity' ? 'immunities' : 'weaknesses';
    if (!Array.isArray(monster[listKey])) monster[listKey] = [];
    monster[listKey].push({ type: '', value: '' });
    syncLegacyDefenseFields(monster, kind);
    refreshMonsterCard(monsterId);
    markMonsterDirty(monsterId);
}

function removeMonsterDefense(monsterId, kind, index) {
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    const listKey = kind === 'immunity' ? 'immunities' : 'weaknesses';
    if (!Array.isArray(monster[listKey])) return;
    if (index < 0 || index >= monster[listKey].length) return;
    monster[listKey].splice(index, 1);
    syncLegacyDefenseFields(monster, kind);
    refreshMonsterCard(monsterId);
    markMonsterDirty(monsterId);
}

// ---------- Role split (Organization + Tactical Role) ----------

const KNOWN_ORGANIZATIONS = ['solo', 'elite', 'platoon', 'horde', 'minion', 'retainer', 'leader'];
const KNOWN_TACTICAL_ROLES = ['ambusher', 'artillery', 'brute', 'controller', 'defender', 'harrier', 'hexer', 'mount', 'support'];

function ensureMonsterRoleSplit(monster) {
    if (!monster || typeof monster !== 'object') return;
    if (typeof monster.organization !== 'string') monster.organization = '';
    if (typeof monster.tactical_role !== 'string') monster.tactical_role = '';

    // Migrate legacy single `role` string if the split fields are empty.
    if (!monster.organization && !monster.tactical_role && typeof monster.role === 'string' && monster.role.trim()) {
        const parts = monster.role.trim().split(/\s+/);
        parts.forEach(part => {
            const lower = part.toLowerCase();
            if (KNOWN_ORGANIZATIONS.includes(lower) && !monster.organization) {
                monster.organization = capitalizeFirst(lower);
            } else if (KNOWN_TACTICAL_ROLES.includes(lower) && !monster.tactical_role) {
                monster.tactical_role = capitalizeFirst(lower);
            }
        });
    }

    monster.role = formatMonsterRole(monster);
}

function capitalizeFirst(value) {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMonsterRole(monster) {
    const org = (monster?.organization || '').trim();
    const tactical = (monster?.tactical_role || '').trim();
    return [org, tactical].filter(Boolean).join(' ');
}

function formatMonsterEv(monster) {
    const ev = monster?.ev ?? 0;
    const evStr = (ev || ev === 0) ? String(ev) : '';
    if (!evStr) return '';
    if ((monster?.organization || '').toLowerCase() === 'minion') {
        return `${evStr} for four minions`;
    }
    return evStr;
}

// ---------- Movement modes (chip-style multi-select) ----------

const KNOWN_MOVEMENT_MODES = ['Fly', 'Hover', 'Climb', 'Swim', 'Burrow', 'Teleport', 'Phase'];

function ensureMonsterMovementModes(monster) {
    if (!monster || typeof monster !== 'object') return;
    if (!Array.isArray(monster.movement_modes)) {
        monster.movement_modes = [];
    }
    // Migrate legacy `movement` string ("Climb, Swim" / "fly 8 squares") to modes.
    if (monster.movement_modes.length === 0 && typeof monster.movement === 'string' && monster.movement.trim()) {
        const tokens = monster.movement.split(/[,/]+/).map(t => t.trim()).filter(Boolean);
        tokens.forEach(token => {
            // Strip trailing numbers/units that the old free-text format sometimes had.
            const cleanedMatch = token.match(/^([A-Za-z][A-Za-z\- ]*?)(?:\s+\d.*)?$/);
            const cleaned = (cleanedMatch ? cleanedMatch[1] : token).trim();
            if (!cleaned) return;
            const matched = KNOWN_MOVEMENT_MODES.find(m => m.toLowerCase() === cleaned.toLowerCase());
            const value = matched || capitalizeFirst(cleaned.toLowerCase());
            if (!monster.movement_modes.some(existing => existing.toLowerCase() === value.toLowerCase())) {
                monster.movement_modes.push(value);
            }
        });
    }
    syncLegacyMovementString(monster);
}

function syncLegacyMovementString(monster) {
    const modes = Array.isArray(monster.movement_modes) ? monster.movement_modes : [];
    monster.movement = modes.join(', ');
}

function toggleMonsterMovementMode(monsterId, mode) {
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    if (!Array.isArray(monster.movement_modes)) monster.movement_modes = [];
    const idx = monster.movement_modes.findIndex(m => m.toLowerCase() === mode.toLowerCase());
    if (idx >= 0) {
        monster.movement_modes.splice(idx, 1);
    } else {
        monster.movement_modes.push(mode);
    }
    syncLegacyMovementString(monster);
    refreshMonsterCard(monsterId);
    markMonsterDirty(monsterId);
}

function addCustomMonsterMovementMode(monsterId, inputEl) {
    if (!inputEl) return;
    const raw = (inputEl.value || '').trim();
    if (!raw) return;
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    if (!Array.isArray(monster.movement_modes)) monster.movement_modes = [];
    if (!monster.movement_modes.some(m => m.toLowerCase() === raw.toLowerCase())) {
        monster.movement_modes.push(raw);
    }
    inputEl.value = '';
    syncLegacyMovementString(monster);
    refreshMonsterCard(monsterId);
    markMonsterDirty(monsterId);
}

function removeMonsterMovementMode(monsterId, index) {
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    if (!Array.isArray(monster.movement_modes)) return;
    if (index < 0 || index >= monster.movement_modes.length) return;
    monster.movement_modes.splice(index, 1);
    syncLegacyMovementString(monster);
    refreshMonsterCard(monsterId);
    markMonsterDirty(monsterId);
}

function renderMonsterMovementEditor(monsterId, monster) {
    const selectedModes = Array.isArray(monster.movement_modes) ? monster.movement_modes : [];
    const lowerSelected = new Set(selectedModes.map(m => m.toLowerCase()));

    const chips = selectedModes.map((mode, index) => `
        <span class="movement-chip" data-mode="${(mode || '').replace(/"/g, '&quot;')}">
            ${escapeMonsterText(mode)}
            <button type="button" class="movement-chip-remove" aria-label="Remove ${escapeMonsterText(mode)}" onclick="removeMonsterMovementMode('${monsterId}', ${index})">×</button>
        </span>
    `).join('');

    const presetButtons = KNOWN_MOVEMENT_MODES.map(mode => {
        const active = lowerSelected.has(mode.toLowerCase()) ? ' is-active' : '';
        return `<button type="button" class="movement-preset${active}" onclick="toggleMonsterMovementMode('${monsterId}', '${mode}')">${mode}</button>`;
    }).join('');

    return `
        <div class="defensive-stat defensive-stat--multi">
            <span class="defensive-stat-label">Movement Types:</span>
            <div class="movement-editor">
                <div class="movement-chips">${chips || '<span class="movement-empty">none</span>'}</div>
                <div class="movement-presets">${presetButtons}</div>
                <input type="text" class="movement-custom-input" placeholder="Custom (Enter to add)"
                    onkeydown="if (event.key === 'Enter') { event.preventDefault(); addCustomMonsterMovementMode('${monsterId}', this); }">
            </div>
        </div>
    `;
}

function escapeMonsterText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderMonsterDefenseEditor(monsterId, monster, kind) {
    const listKey = kind === 'immunity' ? 'immunities' : 'weaknesses';
    const label = kind === 'immunity' ? 'Immunity' : 'Weakness';
    const typePlaceholder = kind === 'immunity' ? 'fire' : 'cold';
    const valuePlaceholder = kind === 'immunity' ? '3' : '2';
    const list = Array.isArray(monster[listKey]) && monster[listKey].length > 0
        ? monster[listKey]
        : [{ type: '', value: '' }];

    const rows = list.map((entry, index) => {
        const typeVal = (entry?.type || '').replace(/"/g, '&quot;');
        const valueVal = (entry?.value || '').toString().replace(/"/g, '&quot;');
        const canRemove = list.length > 1;
        const removeBtn = canRemove
            ? `<button type="button" class="defensive-stat-remove" title="Remove" onclick="removeMonsterDefense('${monsterId}', '${kind}', ${index})">×</button>`
            : '<span class="defensive-stat-remove-placeholder" aria-hidden="true"></span>';
        return `
            <div class="defensive-stat-row" data-defense-kind="${kind}" data-defense-index="${index}">
                <input type="text" class="defensive-stat-text" data-field="${listKey}.${index}.type" value="${typeVal}" placeholder="${typePlaceholder}">
                <input type="number" class="defensive-stat-number" data-field="${listKey}.${index}.value" value="${valueVal}" placeholder="${valuePlaceholder}">
                ${removeBtn}
            </div>
        `;
    }).join('');

    return `
        <div class="defensive-stat defensive-stat--multi" data-defense-kind="${kind}">
            <span class="defensive-stat-label">${label}:</span>
            <div class="defensive-stat-rows">
                ${rows}
            </div>
            <button type="button" class="defensive-stat-add" onclick="addMonsterDefense('${monsterId}', '${kind}')">+ Add ${label}</button>
        </div>
    `;
}

function formatMonsterDefenseList(list) {
    if (!Array.isArray(list) || list.length === 0) return '';
    return list
        .map(entry => {
            const type = (entry?.type || '').trim();
            const value = (entry?.value || '').toString().trim();
            return [type, value].filter(Boolean).join(' ');
        })
        .filter(Boolean)
        .join(', ');
}

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    // Navigate to the parent of the target property
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        
        // Handle array indices
        if (!isNaN(key)) {
            const index = parseInt(key);
            if (!Array.isArray(current)) {
                current = [];
            }
            if (!current[index]) {
                current[index] = {};
            }
            current = current[index];
        } else {
            if (!current[key]) {
                current[key] = {};
            }
            current = current[key];
        }
    }
    
    // Set the final value
    const finalKey = keys[keys.length - 1];
    if (!isNaN(finalKey)) {
        const index = parseInt(finalKey);
        if (!Array.isArray(current)) {
            current = [];
        }
        current[index] = value;
    } else {
        current[finalKey] = value;
    }
    
    return obj;
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        if (!isNaN(key)) {
            return current?.[parseInt(key)];
        }
        return current?.[key];
    }, obj);
}

function handleFieldChange(event) {
    if (isInitialLoad) return;
    
    const element = event.target;
    const monsterId = element.closest('.monster-card')?.getAttribute('data-monster-id');
    
    if (!monsterId) return;
    
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    
    // Get field path (supports nested fields like "abilities.0.name")
    const fieldPath = element.getAttribute('data-field-path') || element.getAttribute('data-field') || 'name';
    
    // Get the new value
    let value = element.value;
    if (element.type === 'number') {
        value = parseInt(value) || 0;
    } else if (element.type === 'checkbox') {
        value = element.checked;
    } else if (element.hasAttribute('data-attribute')) {
        // Handle attribute fields with debounced formatting
        
        // Store raw value for processing
        const rawValue = value;
        
        // Extract numeric value for saving
        let numValue = parseInt(rawValue.replace(/[^-\d]/g, '')) || 0;
        // Clamp to range -5 to +5
        numValue = Math.max(-5, Math.min(5, numValue));
        value = numValue;
        
        // Clear existing format timer for this element
        const elementId = element.getAttribute('data-field') || 'unknown';
        if (attributeFormatTimers.has(elementId)) {
            clearTimeout(attributeFormatTimers.get(elementId));
        }
        
        // Set up delayed formatting (1 second after user stops typing)
        const formatTimer = setTimeout(() => {
            const formattedValue = formatAttributeValue(numValue);
            if (element.value !== formattedValue) {
                const cursorPos = element.selectionStart;
                element.value = formattedValue;
                // Restore cursor position at end
                setTimeout(() => {
                    element.setSelectionRange(formattedValue.length, formattedValue.length);
                }, 0);
            }
            attributeFormatTimers.delete(elementId);
        }, 1000);
        
        attributeFormatTimers.set(elementId, formatTimer);
    }
    
    // Set nested value (works for all fields including name)
    setNestedValue(monster, fieldPath, value);

    // When a multi-entry immunity/weakness row changes, keep the legacy
    // single-field mirror (immunity_type/value, weakness_type/value) in sync.
    if (fieldPath.startsWith('immunities.')) {
        syncLegacyDefenseFields(monster, 'immunity');
    } else if (fieldPath.startsWith('weaknesses.')) {
        syncLegacyDefenseFields(monster, 'weakness');
    }

    // Organization/tactical role -> rebuild legacy `role` string, and trigger a
    // re-render so the captain row + EV "for four minions" suffix react.
    if (fieldPath === 'organization' || fieldPath === 'tactical_role') {
        monster.role = formatMonsterRole(monster);
        monster.lastModified = Date.now();
        markMonsterDirty(monsterId);
        refreshMonsterCard(monsterId);
        return;
    }

    // Mark monster as modified
    monster.lastModified = Date.now();
    markMonsterDirty(monsterId);
    
    // Only log field changes occasionally to reduce console noise
    if (Math.random() < 0.1) { // Log ~10% of field changes
        console.log(`Field update: ${fieldPath} → ${value}`);
    }
}

// Save System
function queueSave() {
    updateSaveStatus('saving');
    
    // Clear existing timer
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    // Set new timer for batch save
    autoSaveTimer = setTimeout(() => {
        saveChangedData();
    }, 2000); // Wait 2 seconds before saving to batch changes
}

// New selective save function - only saves changed monsters
// Returns the set of monster IDs that are referenced by at least one subtab.
// Anything in monsterData.monsters but NOT in this set is an orphan/draft.
function getReferencedMonsterIds() {
    const referenced = new Set();
    Object.values(monsterData.tabs || {}).forEach(mainTab => {
        Object.values(mainTab?.subTabs || {}).forEach(subTab => {
            (subTab?.monsters || []).forEach(id => referenced.add(id));
        });
    });
    return referenced;
}

function isMonsterOrphan(monsterId) {
    return !getReferencedMonsterIds().has(monsterId);
}

// Build a copy of monsterData that excludes orphaned monsters before
// persisting to the server. Orphans stay in memory + localStorage for the
// current session, but never reach the saved file — the user must Save to Tab
// to keep them across reloads.
function buildPersistedMonsterData() {
    const referenced = getReferencedMonsterIds();
    const filteredMonsters = {};
    Object.entries(monsterData.monsters || {}).forEach(([id, monster]) => {
        if (referenced.has(id)) {
            filteredMonsters[id] = monster;
        }
    });
    return { ...monsterData, monsters: filteredMonsters };
}

async function saveChangedData(backupType = 'auto') {
    if (isSaving) {
        console.log('Save already in progress, queueing...');
        return;
    }

    if (dirtyMonsters.size === 0 && !needsTabSave) {
        console.log('No changes to save');
        updateSaveStatus('saved');
        return;
    }

    isSaving = true;
    updateSaveStatus('saving');

    try {
        let saveReason = [];
        if (dirtyMonsters.size > 0) {
            saveReason.push(`${dirtyMonsters.size} modified monsters`);
        }
        if (needsTabSave) {
            saveReason.push('tab structure changes');
        }

        console.log(`💾 Saving: ${saveReason.join(' + ')}`);
        if (dirtyMonsters.size > 0) {
            console.log(`📝 Changed monsters: ${dirtyMonsters.size}`);
        }

        // Save to localStorage as backup — includes orphans so an in-session
        // refresh can recover unsaved drafts.
        saveToLocalStorage();

        // Strip orphans from the server-bound payload so the saved file
        // never accumulates ghost monsters that can't be reached from any tab.
        const persistedData = buildPersistedMonsterData();
        const orphanCount = Object.keys(monsterData.monsters || {}).length
            - Object.keys(persistedData.monsters || {}).length;
        if (orphanCount > 0) {
            console.log(`⚠ Stripped ${orphanCount} orphan monster(s) from server save (Save to Tab to keep them).`);
        }

        const response = await fetch('save-monster-data.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'save',
                data: persistedData,
                backup_type: backupType
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateSaveStatus('saved');
            // Clear dirty flags after successful save
            dirtyMonsters.clear();
            needsTabSave = false;
            updateTabDirtyIndicators();
            // Clear from localStorage since save was successful
            clearLocalStorage();
            console.log('✅ Data saved successfully');
        } else {
            updateSaveStatus('error');
            console.error('Save failed:', result.error);
            // Keep in localStorage for recovery
            console.log('💾 Data saved to localStorage for recovery');
        }
    } catch (error) {
        updateSaveStatus('error');
        console.error('Save error:', error);
        // Keep in localStorage for recovery
        console.log('💾 Data saved to localStorage for recovery');
    } finally {
        isSaving = false;
    }
}

// Keep old function for compatibility but make it use new system
async function saveAllData() {
    // Mark all monsters as dirty and save
    Object.keys(monsterData.monsters).forEach(id => dirtyMonsters.add(id));
    return saveChangedData();
}

async function loadMonsterData() {
    try {
        const response = await fetch('save-monster-data.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'load'
            })
        });
        
        const result = await response.json();
        
        if (result.success && result.data) {
            monsterData = result.data;
            
            // CRITICAL FIX: Ensure monsters is always an Object, never an Array
            if (Array.isArray(monsterData.monsters)) {
                console.log('Converting monsters from Array to Object');
                const monstersObj = {};
                monsterData.monsters.forEach((monster, index) => {
                    if (monster && typeof monster === 'object') {
                        // Try to use existing ID or create one
                        const monsterId = monster.id || `monster_${Date.now()}_${index}`;
                        monstersObj[monsterId] = monster;
                    }
                });
                monsterData.monsters = monstersObj;
            } else if (!monsterData.monsters || typeof monsterData.monsters !== 'object') {
                console.log('Initializing empty monsters object');
                monsterData.monsters = {};
            }
            
            // Ensure tabs is also properly structured
            if (!monsterData.tabs || typeof monsterData.tabs !== 'object') {
                monsterData.tabs = {};
            }
            
            console.log('Data loaded successfully:', monsterData);
            console.log('Loaded monster count:', Object.keys(monsterData.monsters).length);
            console.log('Loaded tab count:', Object.keys(monsterData.tabs).length);
            console.log('Detailed monster data loaded:');
            Object.entries(monsterData.monsters).forEach(([id, monster]) => {
                console.log(`  - ${id}:`, monster);
            });
            
            // Set current tabs to first available tabs if they exist
            const tabIds = Object.keys(monsterData.tabs);
            if (tabIds.length > 0) {
                currentMainTab = tabIds[0];
                const subTabIds = Object.keys(monsterData.tabs[currentMainTab].subTabs || {});
                if (subTabIds.length > 0) {
                    currentSubTab = subTabIds[0];
                }
            }
        } else {
            console.log('No saved data found or load failed');
        }
    } catch (error) {
        console.error('Load error:', error);
    }
}

// Rebuild entire UI from current data
function rebuildUI() {
    console.log('Rebuilding UI...');
    
    // Rebuild main tabs
    const mainTabList = document.getElementById('mainTabList');
    // Keep only the + button
    mainTabList.innerHTML = '<button class="add-tab-btn" onclick="addMainTab()">+</button>';
    
    // Add all main tabs
    Object.entries(monsterData.tabs).forEach(([tabId, tab]) => {
        const tabElement = createTabElement(tabId, tab.name, false);
        if (tabId === currentMainTab) {
            tabElement.classList.add('active');
        }
        mainTabList.insertBefore(tabElement, mainTabList.querySelector('.add-tab-btn'));
    });
    
    // Rebuild sub-tabs for current main tab
    loadSubTabs(currentMainTab);
    
    // Load workspace
    loadWorkspace();
    
    // Update right sidebar
    updateRightSidebar();

    updateTabDirtyIndicators();

    console.log('UI rebuilt successfully');
}

// Add new monster function - now uses editor mode
function addNewMonster() {
    // Create new monster and enter editor mode
    createNewMonsterForEditor();
}

// Functions for managing abilities
function addAbility(monsterId, category = 'action') {
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;

    // Save current expanded/collapsed state of all categories BEFORE refresh
    const categoryStates = {};
    const categoryElements = document.querySelectorAll(`[data-monster-id="${monsterId}"] .ability-category`);
    categoryElements.forEach(el => {
        const cat = el.dataset.category;
        categoryStates[cat] = el.classList.contains('expanded');
    });

    // Ensure abilities structure exists
    if (!monster.abilities || Array.isArray(monster.abilities)) {
        monster.abilities = {
            passive: [],
            maneuver: [],
            action: [],
            triggered_action: [],
            villain_action: [],
            malice: []
        };
    }
    
    // Ensure category exists
    if (!monster.abilities[category]) {
        monster.abilities[category] = [];
    }
    
    // Add new ability to category with comprehensive structure
    const newAbility = {
        name: '',
        roll_bonus: 0,
        action_type: getCategoryDisplayName(category),
        resource_cost: '',
        keywords: '',
        range: '',
        targets: '',
        effect: '',
        has_test: false,
        test: {
            tier1: {
                damage_amount: '',
                damage_type: '',
                has_attribute_check: false,
                attribute: 'might',
                attribute_threshold: 0,
                attribute_effect: ''
            },
            tier2: {
                damage_amount: '',
                damage_type: '',
                has_attribute_check: false,
                attribute: 'might',
                attribute_threshold: 0,
                attribute_effect: ''
            },
            tier3: {
                damage_amount: '',
                damage_type: '',
                has_attribute_check: false,
                attribute: 'might',
                attribute_threshold: 0,
                attribute_effect: ''
            }
        },
        additional_effect: ''
    };
    
    // Add trigger field for triggered actions
    if (category === 'triggered_action') {
        newAbility.trigger = '';
    }
    
    monster.abilities[category].push(newAbility);
    
    // Refresh the monster card first
    refreshMonsterCard(monsterId);
    markMonsterDirty(monsterId);
    
    // Restore collapsed state for other categories, and expand only the added category
    setTimeout(() => {
        const newCategoryElements = document.querySelectorAll(`[data-monster-id="${monsterId}"] .ability-category`);
        newCategoryElements.forEach(el => {
            const cat = el.dataset.category;
            const icon = el.querySelector('.expand-icon');

            if (cat === category) {
                // Expand the category where we added the ability
                el.classList.remove('collapsed');
                el.classList.add('expanded');
                if (icon) icon.textContent = '▼';
            } else if (categoryStates.hasOwnProperty(cat)) {
                // Restore previous state for other categories
                if (categoryStates[cat]) {
                    el.classList.remove('collapsed');
                    el.classList.add('expanded');
                    if (icon) icon.textContent = '▼';
                } else {
                    el.classList.remove('expanded');
                    el.classList.add('collapsed');
                    if (icon) icon.textContent = '▶';
                }
            }
        });
    }, 100);
}

// Copy ability from sidebar to currently editing monster
function copyAbilityToCurrentMonster(abilityData, categoryKey) {
    // Check if we're in editor mode with an active monster
    if (currentMode !== 'editor' || !editorMonsterId) {
        UIKit.toast('Enter editor mode and select a monster to edit before copying abilities.', 'warning');
        return;
    }

    // Get the monster being edited
    const monster = monsterData.monsters[editorMonsterId];
    if (!monster) {
        UIKit.toast('Could not find the monster being edited.', 'error');
        return;
    }
    
    // Ensure abilities structure exists
    if (!monster.abilities || Array.isArray(monster.abilities)) {
        monster.abilities = {
            passive: [],
            maneuver: [],
            action: [],
            triggered_action: [],
            villain_action: [],
            malice: []
        };
    }
    
    // Ensure category exists
    if (!monster.abilities[categoryKey]) {
        monster.abilities[categoryKey] = [];
    }
    
    // Deep clone the ability data to avoid reference issues
    const copiedAbility = JSON.parse(JSON.stringify(abilityData));
    
    // Add the copied ability to the appropriate category
    monster.abilities[categoryKey].push(copiedAbility);
    
    // Refresh the monster card to show the new ability
    refreshMonsterCard(editorMonsterId);
    markMonsterDirty(editorMonsterId);
    
    // Expand the category to show the newly added ability
    setTimeout(() => {
        const categoryElement = document.querySelector(`[data-monster-id="${editorMonsterId}"] .ability-category[data-category="${categoryKey}"]`);
        if (categoryElement) {
            categoryElement.classList.remove('collapsed');
            categoryElement.classList.add('expanded');
            const icon = categoryElement.querySelector('.expand-icon');
            if (icon) icon.textContent = '▼';
        }
    }, 100);
    
    // Brief success message
    UIKit.toast(`Copied "${copiedAbility.name || 'ability'}" to ${monster.name || 'monster'}`, 'success');
    console.log(`Copied ability "${copiedAbility.name}" to ${monster.name}`);
}

function toggleCategory(monsterId, category) {
    const categoryElement = document.querySelector(`[data-monster-id="${monsterId}"] .ability-category[data-category="${category}"]`);
    if (!categoryElement) return;
    
    const isCollapsed = categoryElement.classList.contains('collapsed');
    const icon = categoryElement.querySelector('.expand-icon');
    
    if (isCollapsed) {
        categoryElement.classList.remove('collapsed');
        categoryElement.classList.add('expanded');
        if (icon) icon.textContent = '▼';
    } else {
        categoryElement.classList.remove('expanded');
        categoryElement.classList.add('collapsed');
        if (icon) icon.textContent = '▶';
    }
}

function removeAbility(button, category = null) {
    const abilityItem = button.closest('.ability-item');
    const card = button.closest('.monster-card');
    const monsterId = card.getAttribute('data-monster-id');
    const abilityIndex = parseInt(abilityItem.getAttribute('data-ability-index'));
    
    // Get category from element if not provided
    if (!category) {
        category = abilityItem.getAttribute('data-category') || 'action';
    }
    
    const monster = monsterData.monsters[monsterId];
    if (monster && monster.abilities) {
        // Handle both old array format and new categorized format
        if (Array.isArray(monster.abilities)) {
            monster.abilities.splice(abilityIndex, 1);
        } else if (monster.abilities[category]) {
            monster.abilities[category].splice(abilityIndex, 1);
        }
        
        refreshMonsterCard(monsterId);
        markMonsterDirty(monsterId);
    }
}

function refreshMonsterCard(monsterId) {
    const existingCard = document.querySelector(`[data-monster-id="${monsterId}"]`);
    if (!existingCard) return;
    
    const monster = monsterData.monsters[monsterId];
    const newCard = createMonsterCard(monsterId, monster);
    
    existingCard.parentNode.replaceChild(newCard, existingCard);
}

// Auto-save functionality
function startAutoSave() {
    setInterval(() => {
        if (hasUnsavedChanges()) {
            console.log('Auto-saving...');
            saveAllData();
        }
    }, 30000); // Save every 30 seconds
}

// Session backup functionality
function initSessionBackup() {
    // Create initial session backup
    createSessionBackup();
    
    // Session backup every 10 minutes
    sessionBackupInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastSessionBackupTime > 600000) { // 10 minutes
            createSessionBackup();
            lastSessionBackupTime = now;
        }
    }, 60000); // Check every minute
}

async function createSessionBackup() {
    try {
        console.log('Creating session backup...');
        await saveChangedData('session');
        console.log('Session backup created successfully');
    } catch (error) {
        console.warn('Session backup failed:', error);
    }
}

function hasUnsavedChanges() {
    // Don't consider changes during initial load as "unsaved"
    if (isInitialLoad) {
        return false;
    }
    
    // Use the new dirty tracking system
    return dirtyMonsters.size > 0 || needsTabSave;
}

// Browser search state — when non-empty, the monster browser searches across
// ALL tabs/subtabs instead of the current tab context.
let browserSearchQuery = '';

function handleMonsterBrowserSearchInput(value) {
    browserSearchQuery = (value || '').trim();
    const clearBtn = document.getElementById('monsterBrowserSearchClear');
    if (clearBtn) {
        clearBtn.style.display = browserSearchQuery ? 'inline-flex' : 'none';
    }
    updateRightSidebar();
}

function clearMonsterBrowserSearch() {
    const input = document.getElementById('monsterBrowserSearchInput');
    if (input) input.value = '';
    browserSearchQuery = '';
    const clearBtn = document.getElementById('monsterBrowserSearchClear');
    if (clearBtn) clearBtn.style.display = 'none';
    updateRightSidebar();
}

function getMonstersForBrowserSearch(query) {
    const q = (query || '').toLowerCase();
    if (!q) return [];

    // Build a placement index: monsterId -> "MainTab > SubTab" (first match).
    // Monsters NOT referenced by any subtab are orphans (created but not yet
    // "Save to Tab"'d, or saved-to-tab pointers were lost). We still want them
    // findable via search.
    const locationByMonsterId = new Map();
    Object.entries(monsterData.tabs || {}).forEach(([mainTabId, mainTab]) => {
        if (!mainTab?.subTabs) return;
        Object.entries(mainTab.subTabs).forEach(([subTabId, subTab]) => {
            if (!Array.isArray(subTab?.monsters)) return;
            subTab.monsters.forEach(monsterId => {
                if (!locationByMonsterId.has(monsterId)) {
                    locationByMonsterId.set(monsterId, {
                        label: `${mainTab.name} > ${subTab.name}`,
                        mainTabId,
                        subTabId,
                    });
                }
            });
        });
    });

    const results = [];
    Object.entries(monsterData.monsters || {}).forEach(([monsterId, monster]) => {
        if (!monster) return;
        const haystack = [
            monster.name,
            monster.role,
            monster.organization,
            monster.tactical_role,
            monster.types
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return;

        const placement = locationByMonsterId.get(monsterId);
        results.push({
            id: monsterId,
            data: monster,
            location: placement ? placement.label : '⚠ Not saved to any tab',
            isOrphan: !placement,
            placement: placement || null,
        });
    });

    results.sort((a, b) => {
        // Orphans first so the user notices them immediately.
        if (a.isOrphan !== b.isOrphan) return a.isOrphan ? -1 : 1;
        return (a.data.name || 'Unnamed').localeCompare(b.data.name || 'Unnamed');
    });

    return results;
}

// Right Sidebar Browser Functions
function updateRightSidebar() {
    console.log('Updating right sidebar...');
    console.log('Current main tab:', currentMainTab);
    console.log('Current sub tab:', currentSubTab);

    const searching = browserSearchQuery.length > 0;
    const monsters = searching
        ? getMonstersForBrowserSearch(browserSearchQuery)
        : getMonstersForCurrentView();
    const abilities = getAbilitiesForCurrentView();

    // Update browser title and context
    updateBrowserContext(searching);
    
    // Update monster list
    updateMonsterBrowser(monsters);
    
    // Update ability list
    updateAbilityBrowser(abilities);
    
    // Update debug info
    updateDebugInfo(monsters, abilities);
    
    console.log(`Sidebar updated: ${monsters.length} monsters, ${abilities.length} abilities`);
}

function getMonstersForCurrentView() {
    let monsters = [];
    
    if (currentSubTab && currentMainTab) {
        // Specific sub-tab selected - show only monsters from this sub-tab
        const subTab = monsterData.tabs[currentMainTab]?.subTabs[currentSubTab];
        if (subTab && subTab.monsters) {
            monsters = subTab.monsters.map(monsterId => ({
                id: monsterId,
                data: monsterData.monsters[monsterId],
                location: `${monsterData.tabs[currentMainTab].name} > ${subTab.name}`
            })).filter(m => m.data); // Filter out undefined monsters
        }
    } else if (currentMainTab) {
        // Main tab selected (no specific subtab) - show ALL monsters from ALL sub-tabs
        const mainTab = monsterData.tabs[currentMainTab];
        if (mainTab && mainTab.subTabs) {
            Object.entries(mainTab.subTabs).forEach(([subTabId, subTab]) => {
                if (subTab.monsters) {
                    subTab.monsters.forEach(monsterId => {
                        const monster = monsterData.monsters[monsterId];
                        if (monster) { // Only add if monster data exists
                            monsters.push({
                                id: monsterId,
                                data: monster,
                                location: `${mainTab.name} > ${subTab.name}`
                            });
                        }
                    });
                }
            });
        }
    }
    
    // Sort alphabetically by name
    monsters.sort((a, b) => (a.data.name || 'Unnamed').localeCompare(b.data.name || 'Unnamed'));
    
    console.log('getMonstersForCurrentView found:', monsters.length, 'monsters');
    return monsters;
}

function getAbilitiesForCurrentView() {
    let abilities = [];
    
    // If a monster is selected, show its abilities
    if (selectedMonsterId && monsterData.monsters[selectedMonsterId]) {
        const monster = monsterData.monsters[selectedMonsterId];
        
        if (monster.abilities && typeof monster.abilities === 'object') {
            // Categories in order they should appear
            const categories = [
                { key: 'passive', name: 'Passive' },
                { key: 'maneuver', name: 'Maneuver' },
                { key: 'action', name: 'Action' },
                { key: 'triggered_action', name: 'Triggered Action' },
                { key: 'villain_action', name: 'Villain Action' },
                { key: 'malice', name: 'Malice' }
            ];
            
            categories.forEach(category => {
                const categoryAbilities = monster.abilities[category.key];
                if (Array.isArray(categoryAbilities)) {
                    categoryAbilities.forEach((ability, index) => {
                        if (ability && ability.name) {
                            abilities.push({
                                id: `${selectedMonsterId}_${category.key}_${index}`,
                                name: ability.name,
                                category: category.name,
                                categoryKey: category.key,
                                keywords: ability.keywords || '',
                                effect: ability.effect || '',
                                data: ability,
                                monsterName: monster.name || 'Unnamed Monster'
                            });
                        }
                    });
                }
            });
        }
    }
    
    return abilities;
}

function updateBrowserContext(isSearching = false) {
    const titleElement = document.getElementById('browserTitle');
    const contextElement = document.getElementById('browserContext');

    if (isSearching) {
        titleElement.textContent = 'Search Results';
        contextElement.innerHTML = `<span class="context-info">Searching all monsters for "<strong>${escapeMonsterText(browserSearchQuery)}</strong>"</span>`;
        return;
    }

    // Don't update title if we're showing a monster's abilities
    if (selectedMonsterId && monsterData.monsters[selectedMonsterId]) {
        // Title will be updated by updateAbilityBrowser, just update context
        const monster = monsterData.monsters[selectedMonsterId];
        const monsterName = monster.name || 'Selected Monster';
        contextElement.innerHTML = `<span class="context-info">Viewing abilities for: ${monsterName}</span>`;
        return;
    }

    if (currentSubTab && currentMainTab) {
        // Specific subtab selected
        const mainTab = monsterData.tabs[currentMainTab];
        const subTab = mainTab?.subTabs[currentSubTab];
        titleElement.textContent = `${subTab?.name || 'Unknown'} Contents`;
        contextElement.innerHTML = `<span class="context-info">Sub-tab: ${mainTab?.name || 'Unknown'} > ${subTab?.name || 'Unknown'}</span>`;
    } else if (currentMainTab) {
        // Main tab selected (showing all subtabs)
        const mainTab = monsterData.tabs[currentMainTab];
        const subTabCount = Object.keys(mainTab?.subTabs || {}).length;
        titleElement.textContent = `${mainTab?.name || 'Unknown'} - All Contents`;
        contextElement.innerHTML = `<span class="context-info">All sub-tabs (${subTabCount} total) from: ${mainTab?.name || 'Unknown'}</span>`;
    } else {
        titleElement.textContent = 'All Monsters & Abilities';
        contextElement.innerHTML = '<span class="context-info">Viewing: All tabs</span>';
    }
}

function updateMonsterBrowser(monsters) {
    const monsterList = document.getElementById('monsterBrowserList');
    const monsterCount = document.getElementById('monsterCount');
    
    monsterCount.textContent = monsters.length;
    
    if (monsters.length === 0) {
        monsterList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-style: italic;">No monsters found</div>';
        return;
    }
    
    monsterList.innerHTML = '';
    
    monsters.forEach(monster => {
        const card = document.createElement('div');
        card.className = 'browser-monster-card';
        if (monster.isOrphan) card.classList.add('browser-monster-card--orphan');
        card.setAttribute('data-monster-id', monster.id);
        // Orphans: open straight in editor mode so the user can Save to Tab.
        card.onclick = () => {
            if (monster.isOrphan) {
                enterEditorMode(monster.id);
            } else {
                selectMonster(monster.id);
            }
        };

        // Create image element
        const imageHtml = monster.data.image
            ? `<img src="images/${monster.data.image}" alt="${monster.data.name || 'Monster'}">`
            : `<div class="placeholder">🐉</div>`;

        // Get level and role info
        const level = monster.data.level || '?';
        const role = formatMonsterRole(monster.data) || monster.data.role || 'Unknown';

        card.innerHTML = `
            <div class="browser-monster-image">
                ${imageHtml}
            </div>
            <div class="browser-monster-content">
                <div class="browser-card-name">${monster.data.name || 'Unnamed Monster'}</div>
                <div class="browser-card-info">
                    <span>Level ${level}</span>
                    <span>${role}</span>
                </div>
                <div class="browser-card-location">${monster.location}</div>
            </div>
        `;

        monsterList.appendChild(card);
    });
}

function updateAbilityBrowser(abilities) {
    const abilityList = document.getElementById('abilityBrowserList');
    const abilityCount = document.getElementById('abilityCount');
    
    abilityCount.textContent = abilities.length;
    
    if (abilities.length === 0) {
        const message = selectedMonsterId ? 
            'This monster has no abilities yet.' : 
            'Click on a monster to view its abilities.';
        abilityList.innerHTML = `<div style="text-align: center; color: #999; padding: 20px; font-style: italic;">${message}</div>`;
        return;
    }
    
    abilityList.innerHTML = '';
    
    // Update browser title to show monster name
    if (selectedMonsterId && abilities.length > 0) {
        const titleElement = document.getElementById('browserTitle');
        const monsterName = abilities[0].monsterName || 'Selected Monster';
        titleElement.textContent = `Abilities for ${monsterName}`;
    }
    
    // Group abilities by category
    let currentCategory = '';
    
    abilities.forEach(ability => {
        // Add category header if new category
        if (ability.category !== currentCategory) {
            currentCategory = ability.category;
            const categoryHeader = document.createElement('div');
            categoryHeader.className = `browser-category-header category-${ability.categoryKey}`;
            categoryHeader.textContent = `${getCategoryIcon(ability.categoryKey)} ${currentCategory}`;
            abilityList.appendChild(categoryHeader);
        }
        
        const card = document.createElement('div');
        card.className = `browser-ability-card category-${ability.categoryKey}`;
        card.setAttribute('data-ability-id', ability.id);
        card.style.cursor = 'copy';
        card.title = 'Click to copy this ability to the monster you are editing';
        
        // Make it clickable - copy ability to current monster
        card.onclick = () => {
            copyAbilityToCurrentMonster(ability.data, ability.categoryKey);
        };
        
        // Build comprehensive ability display
        let headerHtml = '';
        let detailsHtml = '';
        let effectHtml = '';
        let testHtml = '';
        let additionalHtml = '';
        
        // Header: Name and Roll Info
        let nameRollText = ability.name;
        // Only show roll bonus if the ability has a test
        if (ability.data.has_test && ability.data.roll_bonus && ability.data.roll_bonus > 0) {
            nameRollText += ` (2d10+${ability.data.roll_bonus})`;
        }
        
        // Meta info: Action type and cost
        let metaInfo = [];
        if (ability.data.action_type && ability.data.action_type !== ability.category) {
            metaInfo.push(ability.data.action_type);
        }
        // Only show cost for villain_action and malice
        if ((ability.categoryKey === 'villain_action' || ability.categoryKey === 'malice') && ability.data.resource_cost) {
            metaInfo.push(`Cost: ${ability.data.resource_cost}`);
        }
        
        headerHtml = `
            <div class="ability-header">
                <div class="ability-name-roll">${nameRollText}</div>
                ${metaInfo.length > 0 ? `<div class="ability-meta">${metaInfo.join(' • ')}</div>` : ''}
            </div>
        `;
        
        // Details: Keywords, Range, Targets
        let details = [];
        if (ability.keywords) details.push(`Keywords: ${ability.keywords}`);
        if (ability.data.range) details.push(`Range: ${ability.data.range}`);
        if (ability.data.targets) details.push(`Targets: ${ability.data.targets}`);
        
        if (details.length > 0) {
            detailsHtml = `<div class="ability-details">${details.join(' • ')}</div>`;
        }
        
        // Trigger for triggered actions
        let triggerHtml = '';
        if (ability.categoryKey === 'triggered_action' && ability.data.trigger) {
            triggerHtml = `<div class="ability-effect"><strong>Trigger:</strong> ${ability.data.trigger}</div>`;
        }
        
        // Main Effect
        if (ability.effect) {
            effectHtml = `<div class="ability-effect">${ability.effect}</div>`;
        }
        
        // Test Results
        if (ability.data.has_test && ability.data.test) {
            const testResultsHtml = renderBrowserTestInfo(ability.data.test);
            if (testResultsHtml) {
                testHtml = `
                    <div class="ability-test-results">
                        <div class="test-header">Test Results:</div>
                        ${testResultsHtml}
                    </div>
                `;
            }
        }
        
        // Additional Effect
        if (ability.data.additional_effect) {
            additionalHtml = `<div class="ability-additional"><em>${ability.data.additional_effect}</em></div>`;
        }
        
        card.innerHTML = headerHtml + detailsHtml + triggerHtml + effectHtml + testHtml + additionalHtml;
        
        abilityList.appendChild(card);
    });
}

function renderBrowserTestInfo(test) {
    if (!test) return '';
    
    const tiers = [
        { key: 'tier1', label: '≤11', class: 'tier-low' },
        { key: 'tier2', label: '12-16', class: 'tier-mid' },
        { key: 'tier3', label: '17+', class: 'tier-high' }
    ];
    
    let testHtml = '';
    
    tiers.forEach(tier => {
        const tierData = test[tier.key];
        if (tierData && (tierData.damage_amount || tierData.damage_type || tierData.has_attribute_check)) {
            let tierContent = [];
            
            // Add damage info
            if (tierData.damage_amount || tierData.damage_type) {
                const damage = tierData.damage_amount || '';
                const type = tierData.damage_type || '';
                if (damage) {
                    let damageText = damage;
                    if (type) {
                        damageText += ` ${type} damage`;
                    } else {
                        damageText += ' damage';
                    }
                    tierContent.push(damageText);
                } else if (type) {
                    // If only type is specified, just show the type
                    tierContent.push(type);
                }
            }
            
            // Add attribute check info
            if (tierData.has_attribute_check && tierData.attribute && tierData.attribute_threshold) {
                const attributeName = tierData.attribute.charAt(0).toUpperCase() + tierData.attribute.slice(1);
                let attrText = `${attributeName} ≤${tierData.attribute_threshold}`;
                if (tierData.attribute_effect) {
                    attrText += `: ${tierData.attribute_effect}`;
                }
                tierContent.push(attrText);
            }
            
            if (tierContent.length > 0) {
                testHtml += `
                    <div class="test-tier ${tier.class}">
                        <span class="tier-label">(${tier.label})</span>
                        <span class="tier-content">${tierContent.join('; ')}</span>
                    </div>
                `;
            }
        }
    });
    
    return testHtml;
}

function selectMonster(monsterId) {
    console.log('Selected monster:', monsterId);
    
    // Update selected monster
    selectedMonsterId = monsterId;
    
    // Remove previous selection highlight
    document.querySelectorAll('.browser-monster-card.selected, .monster-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selection highlight to browser sidebar card
    const browserCard = document.querySelector(`.browser-monster-card[data-monster-id="${monsterId}"]`);
    if (browserCard) {
        browserCard.classList.add('selected');
    }
    
    // Add selection highlight to search view card if visible
    const searchCard = document.querySelector(`.monster-card[data-monster-id="${monsterId}"]`);
    if (searchCard) {
        searchCard.classList.add('selected');
    }
    
    // Update the abilities display
    updateRightSidebar();
}

function updateDebugInfo(monsters, abilities) {
    const debugContent = document.getElementById('debugContent');
    const debugInfo = [
        `Current Main Tab: ${currentMainTab}`,
        `Current Sub Tab: ${currentSubTab}`,
        `Monsters Found: ${monsters.length}`,
        `Abilities Found: ${abilities.length}`,
        `Total Tabs: ${Object.keys(monsterData.tabs).length}`,
        `Total Monsters: ${Object.keys(monsterData.monsters).length}`,
        '',
        'Monster IDs:',
        ...monsters.map(m => `  - ${m.id}: ${m.data.name || 'Unnamed'}`)
    ];
    
    debugContent.innerHTML = debugInfo.join('<br>');
}

// Toggle debug info visibility
function toggleDebugInfo() {
    const debugElement = document.getElementById('debugInfo');
    debugElement.style.display = debugElement.style.display === 'none' ? 'block' : 'none';
}

// Utility Functions
function updateSaveStatus(status) {
    const saveStatus = document.getElementById('saveStatus');
    const statusText = saveStatus.querySelector('.status-text');
    
    saveStatus.className = 'save-status ' + status;
    
    switch(status) {
        case 'saving':
            statusText.textContent = 'Saving...';
            break;
        case 'saved':
            statusText.textContent = 'All changes saved';
            break;
        case 'error':
            statusText.textContent = 'Error saving changes';
            break;
    }
}

// Browser sidebar overlay toggle (small screens)
function toggleBrowserSidebar() {
    const sidebar = document.getElementById('browserSidebar');
    const toggleBtn = document.getElementById('browserSidebarToggle');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('open');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        toggleBtn.classList.toggle('active', isOpen);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Event Listeners Setup
function setupEventListeners() {
    // Input change tracking
    document.addEventListener('input', function(e) {
        if (e.target.matches('.monster-card input')) {
            // Input changes are handled by individual listeners
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl+D or Cmd+D to toggle debug info
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            toggleDebugInfo();
        }
    });
    
    console.log('Event listeners set up. Press Ctrl+D to toggle debug info.');
}

// Image handling functions
async function handleImageUpload(monsterId, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        UIKit.toast('Please select an image file', 'warning');
        return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        UIKit.toast('Image must be less than 5MB', 'warning');
        return;
    }
    
    // Create FormData for upload
    const formData = new FormData();
    formData.append('image', file);
    formData.append('monsterId', monsterId);
    formData.append('action', 'upload');
    
    try {
        const response = await fetch('upload-image.php', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Update monster data with new image
            const monster = monsterData.monsters[monsterId];
            if (monster) {
                // Delete old image if exists
                if (monster.image) {
                    deleteOldImage(monster.image);
                }
                
                monster.image = result.filename;
                monster.lastModified = Date.now();
                markMonsterDirty(monsterId);
                
                // Refresh the monster card
                refreshMonsterCard(monsterId);
                
                console.log('Image uploaded successfully:', result.filename);
            }
        } else {
            UIKit.toast('Failed to upload image: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Image upload error:', error);
        UIKit.toast('Failed to upload image', 'error');
    }
}

function showImageModal(monsterId) {
    const monster = monsterData.monsters[monsterId];
    if (!monster || !monster.image) return;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="image-modal-content">
            <span class="image-modal-close" onclick="closeImageModal()">&times;</span>
            <img src="images/${monster.image}" alt="${monster.name || 'Monster'}">
            <button class="btn-danger" onclick="deleteMonsterImage('${monsterId}')">Delete Image</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');

    UIKit.openModal(modal, {
        onClose: () => {
            document.body.classList.remove('modal-open');
            modal.remove();
        }
    });

    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeImageModal();
        }
    };
}

function closeImageModal() {
    const modal = document.querySelector('.image-modal');
    if (!modal) return;
    UIKit.closeModal(modal);
    if (modal.parentNode) {
        document.body.classList.remove('modal-open');
        modal.remove();
    }
}

async function deleteMonsterImage(monsterId) {
    const confirmed = await UIKit.confirm({
        title: 'Delete Image',
        message: 'Are you sure you want to delete this image?',
        confirmText: 'Delete',
        danger: true
    });
    if (!confirmed) return;

    const monster = monsterData.monsters[monsterId];
    if (!monster || !monster.image) return;
    
    try {
        // Delete from server
        await deleteOldImage(monster.image);
        
        // Update monster data
        monster.image = '';
        monster.lastModified = Date.now();
        markMonsterDirty(monsterId);
        
        // Close modal and refresh card
        closeImageModal();
        refreshMonsterCard(monsterId);
        
        console.log('Image deleted successfully');
    } catch (error) {
        console.error('Failed to delete image:', error);
        UIKit.toast('Failed to delete image', 'error');
    }
}

async function deleteOldImage(filename) {
    if (!filename) return;
    
    try {
        const response = await fetch('upload-image.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'delete',
                filename: filename
            })
        });
        
        const result = await response.json();
        if (!result.success) {
            console.error('Failed to delete old image:', result.error);
        }
    } catch (error) {
        console.error('Error deleting old image:', error);
    }
}

function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('abilityId', e.target.getAttribute('data-ability-id'));
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

// Mode Management Functions
function setMode(mode) {
    if (mode === currentMode) return; // Already in this mode
    
    // Update workspace CSS class
    const workspace = document.getElementById('workspace');
    if (workspace) {
        if (mode === 'search') {
            workspace.classList.add('search-mode');
        } else {
            workspace.classList.remove('search-mode');
        }
    }
    
    if (mode === 'editor') {
        currentMode = 'editor';
        if (editorMonsterId) {
            // Resume existing editing session
            console.log('Resuming editor mode with monster:', editorMonsterId);
        } else {
            // Show empty editor - don't auto-create monster
            console.log('Entering empty editor mode');
        }
        loadWorkspace();
    } else if (mode === 'search') {
        exitEditorMode();
    }
}

function enterEditorMode(monsterId) {
    // Store original location if this monster is already in a tab
    findMonsterLocation(monsterId);
    
    currentMode = 'editor';
    editorMonsterId = monsterId;
    
    console.log(`Entered editor mode with monster: ${monsterId}`);
    
    // Refresh workspace to show only this monster
    loadWorkspace();
}

function exitEditorMode() {
    currentMode = 'search';
    // DON'T clear editorMonsterId - keep the editing session alive
    // Keep: editorMonsterId, editorMonsterOriginalTab, editorMonsterOriginalSubTab
    
    console.log('Switched to search mode (editing session preserved)');
    
    // Refresh workspace to show search results
    loadWorkspace();
    
    // Re-apply print mode handlers if print mode is active
    if (isPrintMode) {
        setTimeout(() => {
            console.log('Re-applying print mode after editor exit');
            updateMonsterCardsForPrintMode();
        }, 100); // Small delay to ensure DOM is updated
    }
}

function finishEditing() {
    // Explicitly end the editing session
    console.log('Finishing editing session for monster:', editorMonsterId);
    
    editorMonsterId = null;
    editorMonsterOriginalTab = null;
    editorMonsterOriginalSubTab = null;
    
    // Refresh the workspace to show empty editor
    loadWorkspace();
}

async function createNewMonsterForEditor() {
    const monsterId = 'monster_' + Date.now();
    const monsterName = await UIKit.prompt({
        title: 'New Monster',
        message: 'Enter monster name:',
        defaultValue: 'New Monster'
    });

    if (monsterName) {
        // Create monster data with enhanced structure
        monsterData.monsters[monsterId] = {
            name: monsterName,
            level: 1,
            role: 'Brute',
            types: '',
            ev: 0,
            hp: 1,
            ac: 10,
            speed: '30 ft',
            image: '',
            // Enhanced stats system
            size: '1M',
            movement: '',
            stamina: 0,
            stability: 0,
            free_strike: 0,
            immunity_text: '',
            immunity_number: 0,
            weakness_text: '',
            weakness_number: 0,
            might: 0,
            agility: 0,
            reason: 0,
            intuition: 0,
            presence: 0,
            // Enhanced abilities system with categories
            abilities: {
                passive: [],
                maneuver: [],
                action: [],
                triggered_action: [],
                villain_action: [],
                malice: []
            },
            created: Date.now(),
            lastModified: Date.now()
        };
        
        // Enter editor mode with this monster
        enterEditorMode(monsterId);
        markMonsterDirty(monsterId);
    }
}

function openMonsterJsonImportModal() {
    const modal = document.getElementById('monsterJsonImportModal');
    if (!modal) {
        triggerMonsterJsonImport();
        return;
    }
    const textarea = document.getElementById('monsterJsonImportTextarea');
    const errorEl = document.getElementById('monsterJsonImportError');
    if (textarea) textarea.value = '';
    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    UIKit.openModal(modal, {
        onClose: () => {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        },
        initialFocus: textarea
    });
}

function closeMonsterJsonImportModal() {
    const modal = document.getElementById('monsterJsonImportModal');
    if (!modal) return;
    UIKit.closeModal(modal);
    if (modal.style.display !== 'none') {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }
}

function showMonsterJsonImportError(message) {
    const errorEl = document.getElementById('monsterJsonImportError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    } else {
        UIKit.toast(message, 'error');
    }
}

function importMonsterFromPastedJson() {
    const textarea = document.getElementById('monsterJsonImportTextarea');
    const raw = textarea ? textarea.value.trim() : '';
    if (!raw) {
        showMonsterJsonImportError('Paste a monster JSON object first.');
        return;
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        showMonsterJsonImportError(`Invalid JSON: ${error.message}`);
        return;
    }

    try {
        applyMonsterJsonImport(parsed);
        closeMonsterJsonImportModal();
    } catch (error) {
        console.error('Monster JSON import failed:', error);
        showMonsterJsonImportError(`Monster JSON import failed: ${error.message}`);
    }
}

function triggerMonsterJsonImport() {
    const input = document.getElementById('monsterJsonImportInput');
    if (!input) {
        UIKit.toast('Monster JSON import input is missing.', 'error');
        return;
    }
    input.value = '';
    input.click();
}

async function handleMonsterJsonImportFile(input) {
    const file = input?.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        applyMonsterJsonImport(parsed);
        closeMonsterJsonImportModal();
    } catch (error) {
        console.error('Monster JSON import failed:', error);
        const message = `Monster JSON import failed: ${error.message}`;
        const modal = document.getElementById('monsterJsonImportModal');
        if (modal && modal.style.display !== 'none') {
            showMonsterJsonImportError(message);
        } else {
            UIKit.toast(message, 'error');
        }
    } finally {
        input.value = '';
    }
}

function applyMonsterJsonImport(parsed) {
    const importedMonster = normalizeImportedMonsterJson(parsed);
    const monsterId = buildImportedMonsterId(parsed, importedMonster);

    monsterData.monsters[monsterId] = importedMonster;
    enterEditorMode(monsterId);
    dirtyMonsters.add(monsterId);
    saveToLocalStorage();
    queueSave();

    UIKit.toast(`Imported ${importedMonster.name}. Review it, then use Save to Tab when ready.`, 'success', { duration: 6000 });
}

// LLM AUTHORING NOTE:
// Full monster import JSON is documented in:
//   dnd/strixhaven/monster-creator/MONSTER_JSON_IMPORT_TEMPLATE.md
// Per-ability automation JSON is the shared ability-automation/v3 format:
//   dnd/character_sheet/ability-automation/AUTHORING.md
//   dnd/character_sheet/ability-automation/REGISTRY.md
// Target automation cards must use v3 direct fields (`mode`, `predicate`,
// `count`, `distance`, `shape`, `size`) rather than old nested
// `{ target: { kind: ... } }` examples.
function normalizeImportedMonsterJson(raw) {
    const source = unwrapImportedMonsterJson(raw);
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        throw new Error('Expected a JSON object for one monster.');
    }

    const name = cleanText(source.name);
    if (!name) {
        throw new Error('Monster JSON must include a non-empty "name".');
    }

    const attributes = source.attributes && typeof source.attributes === 'object' ? source.attributes : {};
    const defenses = source.defenses && typeof source.defenses === 'object' ? source.defenses : {};
    const immunity = defenses.immunity && typeof defenses.immunity === 'object' ? defenses.immunity : {};
    const weakness = defenses.weakness && typeof defenses.weakness === 'object' ? defenses.weakness : {};
    const abilities = normalizeImportedAbilities(source.abilities || {});

    const immunities = normalizeImportedDefenseList(
        source.immunities ?? defenses.immunities,
        { type: source.immunity_type ?? source.immunityType ?? immunity.type, value: source.immunity_value ?? source.immunityValue ?? immunity.value }
    );
    const weaknesses = normalizeImportedDefenseList(
        source.weaknesses ?? defenses.weaknesses,
        { type: source.weakness_type ?? source.weaknessType ?? weakness.type, value: source.weakness_value ?? source.weaknessValue ?? weakness.value }
    );
    const firstImmunity = immunities[0] || { type: '', value: '' };
    const firstWeakness = weaknesses[0] || { type: '', value: '' };

    // Role split: accept explicit organization/tactical_role, or split a legacy `role` string.
    const importedRole = parseImportedRoleString(source.role);
    const organization = cleanText(source.organization || importedRole.organization);
    const tacticalRole = cleanText(source.tactical_role || source.tacticalRole || importedRole.tactical_role || (source.role && !importedRole.organization ? source.role : ''));

    // Movement modes: accept explicit array, or split a legacy `movement` string.
    const movementModes = normalizeImportedMovementModes(source.movement_modes ?? source.movementModes, source.movement);

    const monster = {
        name,
        level: toImportedInt(source.level, 1),
        organization,
        tactical_role: tacticalRole,
        role: '',
        with_captain: cleanText(source.with_captain ?? source.withCaptain ?? ''),
        types: cleanText(source.types || source.type || ''),
        ev: toImportedInt(source.ev, 0),
        hp: toImportedInt(source.hp ?? source.stamina, 1),
        ac: toImportedInt(source.ac, 10),
        speed: toImportedInt(source.speed, 0),
        image: cleanText(source.image || source.imageUrl || ''),
        size: cleanText(source.size || '1M') || '1M',
        movement_modes: movementModes,
        movement: movementModes.join(', '),
        stamina: toImportedInt(source.stamina ?? source.hp, 0),
        stability: toImportedInt(source.stability ?? defenses.stability, 0),
        free_strike: toImportedInt(source.free_strike ?? source.freeStrike ?? defenses.free_strike ?? defenses.freeStrike, 0),
        immunities,
        weaknesses,
        immunity_type: firstImmunity.type,
        immunity_value: firstImmunity.value,
        weakness_type: firstWeakness.type,
        weakness_value: firstWeakness.value,
        might: toImportedInt(source.might ?? attributes.might, 0),
        agility: toImportedInt(source.agility ?? attributes.agility, 0),
        reason: toImportedInt(source.reason ?? attributes.reason, 0),
        intuition: toImportedInt(source.intuition ?? attributes.intuition, 0),
        presence: toImportedInt(source.presence ?? attributes.presence, 0),
        traits: Array.isArray(source.traits) ? source.traits.map(normalizeImportedTrait).filter(Boolean) : [],
        abilities,
        created: Date.now(),
        lastModified: Date.now()
    };
    monster.role = formatMonsterRole(monster);
    return monster;
}

function parseImportedRoleString(roleString) {
    const out = { organization: '', tactical_role: '' };
    if (typeof roleString !== 'string') return out;
    const parts = roleString.trim().split(/\s+/);
    parts.forEach(part => {
        const lower = part.toLowerCase();
        if (KNOWN_ORGANIZATIONS.includes(lower) && !out.organization) {
            out.organization = capitalizeFirst(lower);
        } else if (KNOWN_TACTICAL_ROLES.includes(lower) && !out.tactical_role) {
            out.tactical_role = capitalizeFirst(lower);
        }
    });
    return out;
}

function normalizeImportedMovementModes(arrayInput, legacyString) {
    const out = [];
    const seen = new Set();
    const addMode = (raw) => {
        const cleaned = String(raw || '').trim();
        if (!cleaned) return;
        const matched = KNOWN_MOVEMENT_MODES.find(m => m.toLowerCase() === cleaned.toLowerCase());
        const value = matched || capitalizeFirst(cleaned.toLowerCase());
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(value);
    };
    if (Array.isArray(arrayInput)) {
        arrayInput.forEach(addMode);
    }
    if (out.length === 0 && typeof legacyString === 'string') {
        legacyString.split(/[,/]+/).forEach(token => {
            const cleanedMatch = token.match(/^([A-Za-z][A-Za-z\- ]*?)(?:\s+\d.*)?$/);
            addMode(cleanedMatch ? cleanedMatch[1] : token);
        });
    }
    return out;
}

function normalizeImportedDefenseList(rawList, legacyFallback) {
    const result = [];
    if (Array.isArray(rawList)) {
        rawList.forEach(entry => {
            const normalized = normalizeMonsterDefenseEntry(entry);
            if (normalized) result.push(normalized);
        });
    }
    if (result.length === 0 && legacyFallback) {
        const normalized = normalizeMonsterDefenseEntry(legacyFallback);
        if (normalized) result.push(normalized);
    }
    return result;
}

function unwrapImportedMonsterJson(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        if (raw.monster && typeof raw.monster === 'object' && !Array.isArray(raw.monster)) {
            return raw.monster;
        }
        return raw;
    }
    return null;
}

function buildImportedMonsterId(raw, monster) {
    const source = unwrapImportedMonsterJson(raw) || {};
    const requestedId = cleanText(source.id || source.monsterId || '');
    const baseId = requestedId || `monster_${slugifyMonsterName(monster.name)}`;
    let candidate = baseId;
    let suffix = Date.now();
    while (monsterData.monsters[candidate]) {
        candidate = `${baseId}_${suffix}`;
        suffix += 1;
    }
    return candidate;
}

function normalizeImportedAbilities(rawAbilities) {
    const abilities = {};
    MONSTER_ABILITY_CATEGORIES.forEach(category => {
        abilities[category] = [];
    });

    if (Array.isArray(rawAbilities)) {
        abilities.action = rawAbilities.map(ability => normalizeImportedAbility(ability, 'action')).filter(Boolean);
        return abilities;
    }

    if (!rawAbilities || typeof rawAbilities !== 'object') {
        return abilities;
    }

    const aliases = {
        passive: ['passive', 'passives', 'traits'],
        maneuver: ['maneuver', 'maneuvers'],
        action: ['action', 'actions', 'main', 'mains'],
        triggered_action: ['triggered_action', 'triggeredAction', 'triggered_actions', 'triggeredActions', 'triggered'],
        villain_action: ['villain_action', 'villainAction', 'villain_actions', 'villainActions', 'villain'],
        malice: ['malice', 'malice_actions', 'maliceActions']
    };

    MONSTER_ABILITY_CATEGORIES.forEach(category => {
        const list = aliases[category]
            .map(key => rawAbilities[key])
            .find(value => Array.isArray(value));
        if (Array.isArray(list)) {
            abilities[category] = list.map(ability => normalizeImportedAbility(ability, category)).filter(Boolean);
        }
    });

    return abilities;
}

function normalizeImportedAbility(rawAbility, category) {
    if (!rawAbility || typeof rawAbility !== 'object') return null;
    const source = rawAbility.fields && typeof rawAbility.fields === 'object'
        ? { ...rawAbility.fields, automation: rawAbility.automation }
        : rawAbility;
    const name = cleanText(source.name);
    if (!name) return null;

    const ability = {
        name,
        roll_bonus: toImportedInt(source.roll_bonus ?? source.rollBonus, 0),
        action_type: cleanText(source.action_type ?? source.actionType ?? getCategoryDisplayName(category)),
        resource_cost: cleanText(source.resource_cost ?? source.resourceCost ?? source.cost ?? ''),
        keywords: cleanText(Array.isArray(source.keywords) ? source.keywords.join(', ') : source.keywords ?? ''),
        range: cleanText(source.range ?? ''),
        targets: cleanText(source.targets ?? source.target ?? ''),
        effect: cleanText(source.effect ?? source.description ?? ''),
        has_test: Boolean(source.has_test ?? source.hasTest ?? source.test),
        test: normalizeImportedAbilityTest(source.test),
        additional_effect: cleanText(source.additional_effect ?? source.additionalEffect ?? ''),
    };

    if (category === 'triggered_action') {
        ability.trigger = cleanText(source.trigger ?? source.useWhen ?? '');
    }
    if (source.automation && typeof source.automation === 'object' && !Array.isArray(source.automation)) {
        ability.automation = cloneImportedPlainObject(source.automation);
    }

    return ability;
}

function normalizeImportedAbilityTest(rawTest) {
    const empty = createEmptyImportedTest();
    if (!rawTest || typeof rawTest !== 'object') return empty;

    ['tier1', 'tier2', 'tier3'].forEach(tierKey => {
        const tier = rawTest[tierKey] || {};
        empty[tierKey] = {
            damage_amount: cleanText(tier.damage_amount ?? tier.damageAmount ?? ''),
            damage_type: cleanText(tier.damage_type ?? tier.damageType ?? ''),
            has_attribute_check: Boolean(tier.has_attribute_check ?? tier.hasAttributeCheck ?? tier.attribute_effect ?? tier.attributeEffect),
            attribute: cleanText(tier.attribute ?? 'might') || 'might',
            attribute_threshold: toImportedInt(tier.attribute_threshold ?? tier.attributeThreshold, 0),
            attribute_effect: cleanText(tier.attribute_effect ?? tier.attributeEffect ?? '')
        };
    });

    return empty;
}

function createEmptyImportedTest() {
    return {
        tier1: { damage_amount: '', damage_type: '', has_attribute_check: false, attribute: 'might', attribute_threshold: 0, attribute_effect: '' },
        tier2: { damage_amount: '', damage_type: '', has_attribute_check: false, attribute: 'might', attribute_threshold: 0, attribute_effect: '' },
        tier3: { damage_amount: '', damage_type: '', has_attribute_check: false, attribute: 'might', attribute_threshold: 0, attribute_effect: '' }
    };
}

function normalizeImportedTrait(rawTrait) {
    if (!rawTrait || typeof rawTrait !== 'object') return null;
    const name = cleanText(rawTrait.name);
    const text = cleanText(rawTrait.text ?? rawTrait.description ?? rawTrait.effect ?? '');
    if (!name && !text) return null;
    return { name, text };
}

function toImportedInt(value, fallback = 0) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : fallback;
}

function toImportedOptionalInt(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : '';
}

function cleanText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function slugifyMonsterName(name) {
    return cleanText(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || Date.now();
}

function cloneImportedPlainObject(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return {};
    }
}

function findMonsterLocation(monsterId) {
    // Find which tab/subtab contains this monster
    editorMonsterOriginalTab = null;
    editorMonsterOriginalSubTab = null;
    
    for (const [mainTabId, mainTab] of Object.entries(monsterData.tabs)) {
        if (mainTab.subTabs) {
            for (const [subTabId, subTab] of Object.entries(mainTab.subTabs)) {
                if (subTab.monsters && subTab.monsters.includes(monsterId)) {
                    editorMonsterOriginalTab = mainTabId;
                    editorMonsterOriginalSubTab = subTabId;
                    return;
                }
            }
        }
    }
}

async function showTabAssignment() {
    if (!editorMonsterId) {
        UIKit.toast('No monster in editor mode', 'warning');
        return;
    }
    
    // Check if we have a currently selected tab and subtab
    if (currentMainTab && currentSubTab) {
        // Verify the selected tab/subtab still exists
        if (monsterData.tabs[currentMainTab]?.subTabs[currentSubTab]) {
            const mainTabName = monsterData.tabs[currentMainTab].name;
            const subTabName = monsterData.tabs[currentMainTab].subTabs[currentSubTab].name;
            
            // Auto-save to currently selected tab
            console.log(`Auto-saving to selected tab: ${mainTabName} > ${subTabName}`);
            saveMonsterToTab(currentMainTab, currentSubTab);
            return;
        }
    }
    
    // If no tab is selected or selected tab doesn't exist, show error
    if (!currentMainTab || !currentSubTab) {
        UIKit.toast('Select a tab and sub-tab first, then click Save to Tab.', 'warning');
        return;
    }
    
    // Fallback to manual selection if current tab is invalid
    // Create a modal or simple prompt for tab selection
    const availableTabs = [];
    
    Object.entries(monsterData.tabs).forEach(([mainTabId, mainTab]) => {
        if (mainTab.subTabs) {
            Object.entries(mainTab.subTabs).forEach(([subTabId, subTab]) => {
                availableTabs.push({
                    label: `${mainTab.name} > ${subTab.name}`,
                    mainTabId: mainTabId,
                    subTabId: subTabId
                });
            });
        }
    });
    
    // Simple selection for now - can be enhanced with a proper modal later
    const tabLabels = availableTabs.map(tab => tab.label);
    const selectedIndex = await UIKit.prompt({
        title: 'Save to Tab',
        message: `Select a tab to save the monster to:\n${tabLabels.map((label, i) => `${i + 1}. ${label}`).join('\n')}\n\nEnter the number:`,
        placeholder: '1',
        confirmText: 'Save'
    });
    if (selectedIndex === null) return;

    const index = parseInt(selectedIndex) - 1;
    if (index >= 0 && index < availableTabs.length) {
        const selectedTab = availableTabs[index];
        saveMonsterToTab(selectedTab.mainTabId, selectedTab.subTabId);
    } else {
        UIKit.toast('That was not a valid tab number.', 'warning');
    }
}

function saveMonsterToTab(mainTabId, subTabId) {
    if (!editorMonsterId) return;
    
    // Remove from original location if it exists
    if (editorMonsterOriginalTab && editorMonsterOriginalSubTab) {
        const originalSubTab = monsterData.tabs[editorMonsterOriginalTab]?.subTabs[editorMonsterOriginalSubTab];
        if (originalSubTab && originalSubTab.monsters) {
            const index = originalSubTab.monsters.indexOf(editorMonsterId);
            if (index > -1) {
                originalSubTab.monsters.splice(index, 1);
            }
        }
    }
    
    // Add to new location
    const targetSubTab = monsterData.tabs[mainTabId]?.subTabs[subTabId];
    if (targetSubTab) {
        if (!targetSubTab.monsters) {
            targetSubTab.monsters = [];
        }
        if (!targetSubTab.monsters.includes(editorMonsterId)) {
            targetSubTab.monsters.push(editorMonsterId);
        }
        
        // Update last modified
        monsterData.monsters[editorMonsterId].lastModified = Date.now();
        markMonsterDirty(editorMonsterId);

        const savedMonsterName = monsterData.monsters[editorMonsterId].name || 'Unnamed Monster';
        const mainTabName = monsterData.tabs[mainTabId]?.name || 'Tab';
        const subTabName = targetSubTab.name || 'Sub-Tab';

        console.log(`Saved monster ${editorMonsterId} to ${mainTabId}/${subTabId}`);

        // Finish editing session since monster is now saved to a tab
        finishEditing();

        // Switch to search mode and the tab where we saved the monster
        setMode('search');
        selectMainTab(mainTabId);
        selectSubTab(subTabId);

        UIKit.toast(`Saved '${savedMonsterName}' to ${mainTabName} / ${subTabName}`, 'success');
    }
}

// Helper functions for programmatic tab selection
function selectMainTab(tabId) {
    if (tabId && monsterData.tabs[tabId]) {
        switchMainTab(tabId);
    }
}

function selectSubTab(subTabId) {
    if (subTabId && currentMainTab && monsterData.tabs[currentMainTab]?.subTabs[subTabId]) {
        switchSubTab(subTabId);
    }
}

// ============================================================================
// LocalStorage Recovery System
// ============================================================================

/**
 * Save current monster data to localStorage
 */
function saveToLocalStorage() {
    try {
        const saveData = {
            data: monsterData,
            timestamp: new Date().toISOString(),
            dirtyMonsters: Array.from(dirtyMonsters),
            needsTabSave: needsTabSave
        };
        
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(saveData));
        console.log('💾 Data saved to localStorage for recovery');
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
    }
}

/**
 * Clear data from localStorage after successful save
 */
function clearLocalStorage() {
    try {
        localStorage.removeItem(LOCALSTORAGE_KEY);
        console.log('🗑️ Cleared recovery data from localStorage');
    } catch (error) {
        console.error('Failed to clear localStorage:', error);
    }
}

/**
 * Get saved data from localStorage
 */
function getLocalStorageData() {
    try {
        const data = localStorage.getItem(LOCALSTORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Failed to read from localStorage:', error);
        return null;
    }
}

/**
 * Check for recoverable data on page load
 */
function checkForRecoverableData() {
    const savedData = getLocalStorageData();
    
    if (savedData) {
        const ageMinutes = (new Date() - new Date(savedData.timestamp)) / 1000 / 60;
        console.log(`Found unsaved data from ${ageMinutes.toFixed(1)} minutes ago`);
        
        // Show recovery notification
        showRecoveryNotification(savedData);
    }
}

/**
 * Show recovery notification to user
 */
function showRecoveryNotification(savedData) {
    const notification = document.createElement('div');
    notification.className = 'recovery-notification';
    notification.innerHTML = `
        <div class="recovery-content">
            <h4>🔄 Unsaved Changes Found</h4>
            <p>Found unsaved monster data from a previous session.</p>
            <div class="recovery-details">
                <span>Monsters: ${Object.keys(savedData.data.monsters || {}).length}</span>
                <span>Tabs: ${Object.keys(savedData.data.tabs || {}).length}</span>
                <span>Age: ${Math.round((new Date() - new Date(savedData.timestamp)) / 1000 / 60)} min ago</span>
            </div>
            <div class="recovery-actions">
                <button class="btn-recover">Recover Data</button>
                <button class="btn-discard">Discard</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Handle recovery
    notification.querySelector('.btn-recover').addEventListener('click', async () => {
        await recoverFromLocalStorage(savedData);
        notification.remove();
    });
    
    // Handle discard
    notification.querySelector('.btn-discard').addEventListener('click', () => {
        clearLocalStorage();
        notification.remove();
        console.log('🗑️ Discarded recovery data');
    });
}

/**
 * Recover data from localStorage
 */
async function recoverFromLocalStorage(savedData) {
    try {
        console.log('🔄 Recovering data from localStorage...');
        
        // Update monster data
        monsterData = savedData.data;
        
        // Restore dirty flags
        if (savedData.dirtyMonsters) {
            savedData.dirtyMonsters.forEach(id => dirtyMonsters.add(id));
        }
        needsTabSave = savedData.needsTabSave || false;
        
        // Refresh UI
        rebuildUI();
        
        // Try to save to server
        updateSaveStatus('saving');
        console.log('💾 Attempting to save recovered data to server...');
        
        const response = await fetch('save-monster-data.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'save',
                data: monsterData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            updateSaveStatus('saved');
            clearLocalStorage();
            dirtyMonsters.clear();
            needsTabSave = false;
            console.log('✅ Recovery data saved successfully to server');
            UIKit.toast('Data recovered and saved successfully!', 'success');
        } else {
            updateSaveStatus('error');
            console.error('Failed to save recovered data:', result.error);
            UIKit.toast('Data recovered but failed to save to server. Please try saving manually.', 'error');
        }

    } catch (error) {
        console.error('Error during recovery:', error);
        updateSaveStatus('error');
        UIKit.toast('Error during recovery: ' + error.message, 'error');
    }
}

/**
 * Setup periodic check for old unsaved data
 */
function setupRecoveryCheck() {
    recoveryCheckInterval = setInterval(() => {
        const savedData = getLocalStorageData();
        
        if (savedData) {
            const ageMinutes = (new Date() - new Date(savedData.timestamp)) / 1000 / 60;
            
            if (ageMinutes > 10) { // More than 10 minutes old
                console.warn(`Found old unsaved data (${ageMinutes.toFixed(1)} minutes old)`);
                // Could show a notification here
            }
        }
    }, RECOVERY_CHECK_INTERVAL);
}

/**
 * Initialize recovery system
 */
function initRecoverySystem() {
    console.log('🔄 Initializing recovery system...');
    
    // Check for existing recoverable data
    checkForRecoverableData();
    
    // Setup periodic checks
    setupRecoveryCheck();
    
    // Save to localStorage periodically during editing
    setInterval(() => {
        if (dirtyMonsters.size > 0 || needsTabSave) {
            saveToLocalStorage();
        }
    }, 30000); // Every 30 seconds if there are changes
}

// ========================================
// Print Mode Functions
// ========================================

function togglePrintMode() {
    isPrintMode = !isPrintMode;
    const toggleBtn = document.getElementById('printModeToggle');
    const printControls = document.getElementById('printControls');
    const workspace = document.querySelector('.workspace');
    
    if (isPrintMode) {
        // Enter print mode
        toggleBtn.classList.add('active');
        toggleBtn.innerHTML = '🖨️ Exit Print Mode';
        printControls.style.display = 'flex';
        workspace.classList.add('print-mode-active');
        
        // Clear any previous selections
        selectedForPrint.clear();
        updateSelectionCount();
        
        // Update all monster cards to show selection state
        updateMonsterCardsForPrintMode();
    } else {
        // Exit print mode
        toggleBtn.classList.remove('active');
        toggleBtn.innerHTML = '🖨️ Print Mode';
        printControls.style.display = 'none';
        workspace.classList.remove('print-mode-active');
        
        // Clear selections and remove indicators
        selectedForPrint.clear();
        removeAllPrintSelectionIndicators();
    }
}

function updateMonsterCardsForPrintMode() {
    const monsterCards = document.querySelectorAll('.monster-card');
    monsterCards.forEach(card => {
        const monsterId = card.getAttribute('data-monster-id');
        
        if (isPrintMode) {
            // Just update visual cursor style
            card.style.cursor = 'pointer';
            
            // Add selection checkbox if not present
            if (!card.querySelector('.print-selection-checkbox')) {
                const checkbox = document.createElement('div');
                checkbox.className = 'print-selection-checkbox';
                checkbox.innerHTML = '<input type="checkbox" onclick="event.stopPropagation()" disabled>';
                card.appendChild(checkbox);
            }
            
            // Update checkbox state if monster is selected
            const checkbox = card.querySelector('.print-selection-checkbox input');
            if (checkbox) {
                checkbox.checked = selectedForPrint.has(monsterId);
            }
            
            // Update selection visual
            if (selectedForPrint.has(monsterId)) {
                card.classList.add('selected-for-print');
            } else {
                card.classList.remove('selected-for-print');
            }
        } else {
            // Restore normal cursor
            card.style.cursor = '';
            
            // Remove checkbox
            const checkbox = card.querySelector('.print-selection-checkbox');
            if (checkbox) checkbox.remove();
            
            // Remove selection class
            card.classList.remove('selected-for-print');
        }
    });
}

function toggleMonsterPrintSelection(monsterId) {
    if (!isPrintMode) return;
    
    if (selectedForPrint.has(monsterId)) {
        // Deselect
        selectedForPrint.delete(monsterId);
    } else {
        // Select
        selectedForPrint.add(monsterId);
    }
    
    // Update visual state
    updateMonsterSelectionVisual(monsterId);
    updateSelectionCount();
}

function updateMonsterSelectionVisual(monsterId) {
    const card = document.querySelector(`[data-monster-id="${monsterId}"]`);
    if (!card) return;
    
    const checkbox = card.querySelector('.print-selection-checkbox input');
    if (checkbox) {
        checkbox.checked = selectedForPrint.has(monsterId);
    }
    
    if (selectedForPrint.has(monsterId)) {
        card.classList.add('selected-for-print');
    } else {
        card.classList.remove('selected-for-print');
    }
}

function updateSelectionCount() {
    const countElement = document.getElementById('selectionCount');
    if (countElement) {
        countElement.textContent = `${selectedForPrint.size} selected`;
    }
}

function clearPrintSelection() {
    selectedForPrint.clear();
    document.querySelectorAll('.selected-for-print').forEach(card => {
        card.classList.remove('selected-for-print');
        const checkbox = card.querySelector('.print-selection-checkbox input');
        if (checkbox) checkbox.checked = false;
    });
    updateSelectionCount();
}

function removeAllPrintSelectionIndicators() {
    document.querySelectorAll('.print-selection-checkbox').forEach(el => el.remove());
    document.querySelectorAll('.selected-for-print').forEach(card => {
        card.classList.remove('selected-for-print');
    });
}

function showPrintPreview() {
    if (selectedForPrint.size === 0) {
        UIKit.toast('Select at least one monster to print', 'warning');
        return;
    }

    const modal = document.getElementById('printPreviewModal');
    const previewBody = document.getElementById('printPreviewBody');

    // Track border color index for rotating colors
    let borderColorIndex = 0;
    const totalBorderColors = 8;

    const selectedMonsters = Array.from(selectedForPrint)
        .map(monsterId => {
            const monster = monsterData.monsters[monsterId];
            if (!monster) {
                return null;
            }

            // Assign rotating border color (1-8)
            borderColorIndex = (borderColorIndex % totalBorderColors) + 1;
            return renderMonsterForPrint(monsterId, monster, { borderColor: borderColorIndex });
        })
        .filter(Boolean);

    if (selectedMonsters.length === 0) {
        previewBody.innerHTML = '<p>No monsters available for print.</p>';
        openPrintPreviewModal(modal);
        return;
    }

    const previewHtml = `
        <div class="print-preview-layout">
            <div class="print-columns-flow">
                ${selectedMonsters.join('')}
            </div>
        </div>
    `;

    previewBody.innerHTML = previewHtml;
    openPrintPreviewModal(modal);
}

function openPrintPreviewModal(modal) {
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    UIKit.openModal(modal, {
        onClose: () => {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    });
}

function closePrintPreview() {
    const modal = document.getElementById('printPreviewModal');
    if (!modal) return;
    UIKit.closeModal(modal);
    if (modal.style.display !== 'none') {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }
}

function renderMonsterForPrint(monsterId, monsterData, options = {}) {
    if (!monsterData) return '<div class="print-monster">Monster not found</div>';

    const { isFullPage = false, borderColor = 1 } = options;
    const classes = ['print-monster', isFullPage ? 'print-monster-full' : 'print-monster-normal'];

    let html = `<div class="${classes.join(' ')}" data-monster-id="${monsterId}" data-print-size="${isFullPage ? 'full' : 'normal'}" data-border-color="${borderColor}">`;
    
    // Add image if available
    if (monsterData.image) {
        html += `<div class="print-monster-image">
            <img src="images/${monsterData.image}" alt="${monsterData.name || 'Monster'}">
        </div>`;
    }
    
    // Monster name and basic info
    if (monsterData.name) {
        html += `<h2 class="print-monster-name">${monsterData.name}</h2>`;
    }
    
    // Level, Role, Type, EV - only if they have values
    ensureMonsterRoleSplit(monsterData);
    ensureMonsterMovementModes(monsterData);
    let basicInfo = [];
    if (monsterData.level && monsterData.level !== 1) basicInfo.push(`Level ${monsterData.level}`);
    const printRole = formatMonsterRole(monsterData);
    if (printRole) basicInfo.push(printRole);
    if (monsterData.types) basicInfo.push(monsterData.types);
    const printEv = formatMonsterEv(monsterData);
    if (printEv && printEv !== '0') basicInfo.push(`EV ${printEv}`);
    
    if (basicInfo.length > 0) {
        html += `<div class="print-basic-info">${basicInfo.join(' • ')}</div>`;
    }
    
    // Combat stats - only show non-zero/non-default values
    let combatStats = [];
    if (monsterData.size && monsterData.size !== '1M') combatStats.push(`Size: ${monsterData.size}`);
    if (monsterData.speed && monsterData.speed !== 0 && monsterData.speed !== 6) combatStats.push(`Speed: ${monsterData.speed}`);
    if (monsterData.stamina && monsterData.stamina !== 0) combatStats.push(`Stamina: ${monsterData.stamina}`);
    if (monsterData.stability && monsterData.stability !== 0) combatStats.push(`Stability: ${monsterData.stability}`);
    if (monsterData.free_strike && monsterData.free_strike !== 0) combatStats.push(`Free Strike: ${monsterData.free_strike}`);
    const printMovement = Array.isArray(monsterData.movement_modes) && monsterData.movement_modes.length > 0
        ? monsterData.movement_modes.join(', ')
        : (monsterData.movement || '');
    if (printMovement) combatStats.push(`Movement: ${printMovement}`);

    if (combatStats.length > 0) {
        html += '<div class="print-combat-stats">';
        html += combatStats.join(' • ');
        html += '</div>';
    }

    // With Captain row (only meaningful when org is Minion/Horde/Platoon)
    const captainText = (monsterData.with_captain || '').trim();
    if (captainText) {
        html += `<div class="print-captain">With Captain: ${escapeMonsterText(captainText)}</div>`;
    }
    
    // Immunities and Weaknesses - only if present
    let resistances = [];
    const immunitiesPrint = formatMonsterDefenseList(monsterData.immunities);
    if (immunitiesPrint) {
        resistances.push(`Immunity: ${immunitiesPrint}`);
    } else if (monsterData.immunity_type && monsterData.immunity_value) {
        resistances.push(`Immunity: ${monsterData.immunity_type} ${monsterData.immunity_value}`);
    }
    const weaknessesPrint = formatMonsterDefenseList(monsterData.weaknesses);
    if (weaknessesPrint) {
        resistances.push(`Weakness: ${weaknessesPrint}`);
    } else if (monsterData.weakness_type && monsterData.weakness_value) {
        resistances.push(`Weakness: ${monsterData.weakness_type} ${monsterData.weakness_value}`);
    }
    
    if (resistances.length > 0) {
        html += `<div class="print-resistances">${resistances.join(' • ')}</div>`;
    }
    
    // Attributes - only show non-zero values
    let attributes = [];
    if (monsterData.might && monsterData.might !== 0) attributes.push(`Might ${formatAttributeValue(monsterData.might)}`);
    if (monsterData.agility && monsterData.agility !== 0) attributes.push(`Agility ${formatAttributeValue(monsterData.agility)}`);
    if (monsterData.reason && monsterData.reason !== 0) attributes.push(`Reason ${formatAttributeValue(monsterData.reason)}`);
    if (monsterData.intuition && monsterData.intuition !== 0) attributes.push(`Intuition ${formatAttributeValue(monsterData.intuition)}`);
    if (monsterData.presence && monsterData.presence !== 0) attributes.push(`Presence ${formatAttributeValue(monsterData.presence)}`);
    
    if (attributes.length > 0) {
        html += '<div class="print-attributes">';
        html += '<strong>Attributes:</strong> ' + attributes.join(', ');
        html += '</div>';
    }
    
    // Abilities - only show categories with abilities
    if (monsterData.abilities && typeof monsterData.abilities === 'object') {
        const categories = [
            { key: 'passive', name: 'Passive' },
            { key: 'maneuver', name: 'Maneuver' },
            { key: 'action', name: 'Action' },
            { key: 'triggered_action', name: 'Triggered Action' },
            { key: 'villain_action', name: 'Villain Action' },
            { key: 'malice', name: 'Malice' }
        ];
        
        let hasAnyAbilities = false;
        
        categories.forEach(category => {
            const categoryAbilities = monsterData.abilities[category.key] || [];
            if (categoryAbilities.length > 0) {
                hasAnyAbilities = true;
                html += `<div class="print-ability-category" data-category="${category.key}">`;
                html += `<h3 class="print-category-name">${category.name}</h3>`;

                categoryAbilities.forEach(ability => {
                    if (ability && ability.name) {
                        html += renderAbilityForPrint(ability, category.key);
                    }
                });

                html += '</div>';
            }
        });
    }
    
    html += '</div>';
    return html;
}

function renderAbilityForPrint(ability, category) {
    let html = '<div class="print-ability">';
    
    // Ability name
    html += `<div class="print-ability-name"><strong>${ability.name}</strong></div>`;
    
    // Keywords, range, targets - only if present
    const metaItems = [];
    if (ability.keywords) metaItems.push({ label: 'Keywords', symbol: '🏷️', value: ability.keywords });
    if (ability.range) metaItems.push({ label: 'Range', symbol: '🏹', value: ability.range });
    if (ability.targets) metaItems.push({ label: 'Targets', symbol: '🎯', value: ability.targets });
    if ((category === 'villain_action' || category === 'malice') && ability.resource_cost) {
        metaItems.push({ label: 'Cost', symbol: '✨', value: ability.resource_cost });
    }
    
    if (metaItems.length > 0) {
        html += '<div class="print-ability-meta">';
        html += metaItems
            .map(
                (item) => `
                <div class="print-ability-meta-item">
                    <span class="print-ability-meta-symbol" aria-hidden="true">${item.symbol}</span>
                    <span class="print-ability-meta-label">${item.label}</span>
                    <span class="print-ability-meta-value">${item.value}</span>
                </div>
            `
            )
            .join('');
        html += '</div>';
    }
    
    // Trigger for triggered actions
    if (category === 'triggered_action' && ability.trigger) {
        html += `<div class="print-ability-trigger"><strong>Trigger:</strong> ${ability.trigger}</div>`;
    }
    
    // Effect
    if (ability.effect) {
        html += `<div class="print-ability-effect">${ability.effect}</div>`;
    }
    
    // Test results
    if (ability.has_test && ability.test) {
        html += renderTestForPrint(ability.test);
    }
    
    // Additional effect
    if (ability.additional_effect) {
        html += `<div class="print-ability-additional"><em>${ability.additional_effect}</em></div>`;
    }
    
    html += '</div>';
    return html;
}

function renderTestForPrint(test) {
    if (!test) return '';
    
    const tiers = [
        { key: 'tier1', label: '≤11', tier: 'low' },
        { key: 'tier2', label: '12-16', tier: 'mid' },
        { key: 'tier3', label: '17+', tier: 'high' }
    ];
    
    let hasAnyTest = false;
    let testHtml = '<div class="print-test"><div class="print-test-title">Test</div><div class="print-test-tiers">';
    
    tiers.forEach(tier => {
        const tierData = test[tier.key];
        if (tierData && (tierData.damage_amount || tierData.damage_type || tierData.has_attribute_check)) {
            hasAnyTest = true;
            const lines = [];
            
            // Add damage info
            if (tierData.damage_amount || tierData.damage_type) {
                const damage = tierData.damage_amount || '';
                const type = tierData.damage_type || '';
                if (damage) {
                    let damageText = damage;
                    if (type) {
                        damageText += ` ${type} damage`;
                    } else {
                        damageText += ' damage';
                    }
                    lines.push(`Damage: ${damageText}`);
                } else if (type) {
                    lines.push(`Damage: ${type}`);
                }
            }
            
            // Add attribute check info
            if (tierData.has_attribute_check && tierData.attribute && tierData.attribute_threshold) {
                const attributeName = tierData.attribute.charAt(0).toUpperCase() + tierData.attribute.slice(1);
                let checkText = `${attributeName} ≤${tierData.attribute_threshold}`;
                if (tierData.attribute_effect) {
                    checkText += `: ${tierData.attribute_effect}`;
                }
                lines.push(`Check: ${checkText}`);
            }
            
            if (lines.length > 0) {
                testHtml += `
                    <div class="print-test-tier" data-tier="${tier.tier}">
                        <div class="print-test-tier-label">${tier.label}</div>
                        <div class="print-test-tier-body">
                            ${lines.map(line => `<div class="print-test-tier-line">${line}</div>`).join('')}
                        </div>
                    </div>
                `;
            }
        }
    });
    
    testHtml += '</div></div>';
    
    return hasAnyTest ? testHtml : '';
}

function printMonsters() {
    showPrintPreview();
}

function printFinal() {
    // Hide modal UI elements for printing
    const modal = document.getElementById('printPreviewModal');
    const header = modal.querySelector('.print-preview-header');
    const footer = modal.querySelector('.print-preview-footer');
    
    header.style.display = 'none';
    footer.style.display = 'none';
    modal.classList.add('printing');
    
    // Trigger browser print
    window.print();
    
    // Restore UI after print
    setTimeout(() => {
        header.style.display = '';
        footer.style.display = '';
        modal.classList.remove('printing');
    }, 100);
}
