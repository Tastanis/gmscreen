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

let currentMainTab = 'default';
let currentSubTab = 'default-sub';
let autoSaveTimer = null;
let saveQueue = [];
let isSaving = false;
let isInitialLoad = true; // Flag to track initial page load vs user changes

// New change tracking system
let dirtyMonsters = new Set(); // Track which monsters have unsaved changes
let changeListeners = new Map(); // Track active event listeners
let needsTabSave = false; // Track when tab structure needs saving

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
    
    // Mark initial load as complete after everything is set up
    setTimeout(() => {
        isInitialLoad = false;
        console.log('Initial load complete - user changes will now be tracked');
    }, 1000);
    
    // Set up window close handler
    window.addEventListener('beforeunload', function(e) {
        if (hasUnsavedChanges()) {
            // Force immediate save before leaving
            if (!isSaving) {
                saveChangedData();
            }
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
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
function addMainTab() {
    const tabId = 'tab_' + Date.now();
    const tabName = prompt('Enter tab name:', 'New Tab');
    
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
    nameSpan.ondblclick = () => renameTab(tabId, isSubTab);
    
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
    // Save current tab data before switching
    saveCurrentWorkspace();
    
    // Update active states
    document.querySelectorAll('.main-tabs .tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab-id="${tabId}"]`).classList.add('active');
    
    currentMainTab = tabId;
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
    // Save current workspace before switching
    saveCurrentWorkspace();
    
    // Update active states
    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-subtab-id="${subTabId}"]`).classList.add('active');
    
    currentSubTab = subTabId;
    
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
    console.log('Loaded subtabs for main tab:', mainTabId, 'Current subtab:', currentSubTab);
}

function addSubTab() {
    const subTabId = 'subtab_' + Date.now();
    const subTabName = prompt('Enter sub-tab name:', 'New Sub-Tab');
    
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

function renameTab(tabId, isSubTab) {
    const tab = isSubTab ? 
        monsterData.tabs[currentMainTab].subTabs[tabId] : 
        monsterData.tabs[tabId];
    
    const newName = prompt('Enter new name:', tab.name);
    
    if (newName && newName !== tab.name) {
        tab.name = newName;
        
        const selector = isSubTab ? 
            `[data-subtab-id="${tabId}"] .tab-name` : 
            `[data-tab-id="${tabId}"] .tab-name`;
        
        document.querySelector(selector).textContent = newName;
        
        queueSave();
        console.log('Renamed tab to:', newName);
    }
}

function closeMainTab(tabId) {
    const tabCount = Object.keys(monsterData.tabs).length;
    
    if (tabCount <= 1) {
        alert('Cannot close the last tab');
        return;
    }
    
    if (confirm('Are you sure you want to close this tab? All monsters in this tab will be lost.')) {
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
    }
}

function closeSubTab(subTabId) {
    const subTabs = monsterData.tabs[currentMainTab].subTabs;
    
    if (Object.keys(subTabs).length <= 1) {
        alert('Cannot close the last sub-tab');
        return;
    }
    
    if (confirm('Are you sure you want to close this sub-tab? All monsters in this sub-tab will be lost.')) {
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
    
    // Create workspace header with Add New Monster button (always visible)
    const workspaceHeader = document.createElement('div');
    workspaceHeader.className = 'workspace-header';
    workspaceHeader.innerHTML = `
        <div class="workspace-title">
            <h3>Monster Workspace</h3>
        </div>
        <div class="workspace-actions">
            <button class="btn-primary add-monster-btn" onclick="addNewMonster()">+ Add New Monster</button>
        </div>
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
    const card = document.createElement('div');
    card.className = 'monster-card';
    card.setAttribute('data-monster-id', monsterId);
    
    // Initialize nested data structures and new fields if they don't exist
    if (!monsterData.abilities) monsterData.abilities = [];
    if (!monsterData.spells) monsterData.spells = [];
    if (monsterData.roll === undefined) monsterData.roll = 'Tank';
    if (monsterData.types === undefined) monsterData.types = '';
    if (monsterData.ev === undefined) monsterData.ev = 0;
    
    // Predefined roll options
    const rollOptions = ['Tank', 'DPS', 'Support', 'Healer', 'Controller', 'Scout', 'Boss', 'Minion', 'Elite'];
    const rollDropdown = rollOptions.map(option => 
        `<option value="${option}" ${monsterData.roll === option ? 'selected' : ''}>${option}</option>`
    ).join('');
    
    card.innerHTML = `
        <div class="card-header">
            <button class="card-menu" onclick="deleteMonster('${monsterId}')">×</button>
        </div>
        <div class="card-body">
            <!-- New Top Section with Enhanced Layout -->
            <div class="monster-info-top">
                <div class="info-row-1">
                    <div class="name-section">
                        <input type="text" class="monster-name" placeholder="Monster Name" 
                               data-field="name" value="${monsterData.name || ''}">
                    </div>
                    <div class="level-roll-section">
                        <input type="number" class="level-input" placeholder="Level" 
                               data-field="level" value="${monsterData.level || 1}" min="1" max="30">
                        <select class="roll-select" data-field="roll">
                            ${rollDropdown}
                        </select>
                    </div>
                </div>
                <div class="info-row-2">
                    <div class="types-section">
                        <input type="text" class="types-input" placeholder="Types (e.g., Fire, Dragon)" 
                               data-field="types" value="${monsterData.types || ''}">
                    </div>
                    <div class="ev-section">
                        <input type="number" class="ev-input" placeholder="EV" 
                               data-field="ev" value="${monsterData.ev || 0}" min="0">
                    </div>
                </div>
            </div>
            
            <!-- Basic Stats Section -->
            <div class="basic-stats">
                <div class="stat-row">
                    <label>HP:</label>
                    <input type="number" class="stat-input" data-field="hp" value="${monsterData.hp || ''}">
                    <label>AC:</label>
                    <input type="number" class="stat-input" data-field="ac" value="${monsterData.ac || ''}">
                </div>
                <div class="stat-row">
                    <label>Speed:</label>
                    <input type="text" class="stat-input" data-field="speed" value="${monsterData.speed || ''}">
                </div>
            </div>
            
            <!-- Abilities Section -->
            <div class="abilities-section">
                <h4>Abilities <button class="btn-small" onclick="addAbility('${monsterId}')">+ Add</button></h4>
                <div class="abilities-container" id="abilities-${monsterId}">
                    ${renderAbilities(monsterData.abilities || [])}
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners using new system
    setupCardEventListeners(card, monsterId);
    
    return card;
}

function renderAbilities(abilities) {
    return abilities.map((ability, index) => `
        <div class="ability-item" data-ability-index="${index}">
            <div class="ability-header">
                <input type="text" placeholder="Ability Name" 
                       data-field-path="abilities.${index}.name" 
                       value="${ability.name || ''}">
                <button class="btn-small" onclick="removeAbility(this)">×</button>
            </div>
            <div class="ability-details">
                <label>Dice:</label>
                <input type="text" placeholder="2d10" 
                       data-field-path="abilities.${index}.dice" 
                       value="${ability.dice || ''}">
                <label>Conditions:</label>
                <textarea placeholder="Enter conditions..." 
                          data-field-path="abilities.${index}.conditions">${ability.conditions || ''}</textarea>
            </div>
        </div>
    `).join('');
}

function setupCardEventListeners(card, monsterId) {
    // Remove old listeners if they exist
    if (changeListeners.has(monsterId)) {
        changeListeners.get(monsterId).forEach(element => {
            element.removeEventListener('input', handleFieldChange);
            element.removeEventListener('change', handleFieldChange);
        });
    }
    
    // Add new listeners
    const inputs = card.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.addEventListener('input', handleFieldChange);
        input.addEventListener('change', handleFieldChange);
    });
    
    // Track listeners for cleanup
    changeListeners.set(monsterId, Array.from(inputs));
    
    // Simplified logging - only show when setting up many listeners
    if (inputs.length > 6) {
        console.log(`Set up ${inputs.length} event listeners for ${monsterId}`);
    }
}

// Delete monster function - Updated for new save system
function deleteMonster(monsterId) {
    if (confirm('Are you sure you want to delete this monster?')) {
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
            
            if (nameField && monster.name !== nameField.value) {
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
        queueSave();
    }
}

function markTabsDirty() {
    if (!isInitialLoad) {
        needsTabSave = true;
        console.log('Tab structure marked as dirty');
        queueSave();
    }
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
    }
    
    // Handle special cases
    if (element.classList.contains('monster-name')) {
        monster.name = value;
    } else {
        // Set nested value
        setNestedValue(monster, fieldPath, value);
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
async function saveChangedData() {
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
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            updateSaveStatus('saved');
            // Clear dirty flags after successful save
            dirtyMonsters.clear();
            needsTabSave = false;
            console.log('✅ Data saved successfully');
        } else {
            updateSaveStatus('error');
            console.error('Save failed:', result.error);
        }
    } catch (error) {
        updateSaveStatus('error');
        console.error('Save error:', error);
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
    
    console.log('UI rebuilt successfully');
}

// Add new monster function
function addNewMonster() {
    if (!currentMainTab || !currentSubTab) {
        alert('Please select a tab first');
        return;
    }
    
    const monsterId = 'monster_' + Date.now();
    const monsterName = prompt('Enter monster name:', 'New Monster');
    
    if (monsterName) {
        // Create monster data with enhanced structure
        monsterData.monsters[monsterId] = {
            name: monsterName,
            level: 1,
            roll: 'Tank',
            types: '',
            ev: 0,
            hp: 1,
            ac: 10,
            speed: '30 ft',
            abilities: [],
            spells: [],
            equipment: [],
            tabId: currentMainTab,
            subTabId: currentSubTab,
            lastModified: Date.now()
        };
        
        // Add to current sub-tab
        const subTab = monsterData.tabs[currentMainTab].subTabs[currentSubTab];
        if (!subTab.monsters) {
            subTab.monsters = [];
        }
        subTab.monsters.push(monsterId);
        
        // Mark as dirty for saving
        markMonsterDirty(monsterId);
        
        // Refresh workspace and sidebar
        loadWorkspace();
        updateRightSidebar();
        
        console.log('Added new monster:', monsterName, 'ID:', monsterId);
    }
}

// Functions for managing abilities
function addAbility(monsterId) {
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    
    if (!monster.abilities) monster.abilities = [];
    
    monster.abilities.push({
        name: '',
        dice: '',
        conditions: ''
    });
    
    // Refresh the monster card
    refreshMonsterCard(monsterId);
    markMonsterDirty(monsterId);
}

function removeAbility(button) {
    const abilityItem = button.closest('.ability-item');
    const card = button.closest('.monster-card');
    const monsterId = card.getAttribute('data-monster-id');
    const abilityIndex = parseInt(abilityItem.getAttribute('data-ability-index'));
    
    const monster = monsterData.monsters[monsterId];
    if (monster && monster.abilities) {
        monster.abilities.splice(abilityIndex, 1);
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

function hasUnsavedChanges() {
    // Don't consider changes during initial load as "unsaved"
    if (isInitialLoad) {
        return false;
    }
    
    // Use the new dirty tracking system
    return dirtyMonsters.size > 0 || needsTabSave;
}

// Right Sidebar Browser Functions
function updateRightSidebar() {
    console.log('Updating right sidebar...');
    console.log('Current main tab:', currentMainTab);
    console.log('Current sub tab:', currentSubTab);
    
    const monsters = getMonstersForCurrentView();
    const abilities = getAbilitiesForCurrentView();
    
    // Update browser title and context
    updateBrowserContext();
    
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
    // For now, return empty array - we'll implement abilities later
    return [];
}

function updateBrowserContext() {
    const titleElement = document.getElementById('browserTitle');
    const contextElement = document.getElementById('browserContext');
    
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
        card.setAttribute('data-monster-id', monster.id);
        card.onclick = () => selectMonster(monster.id);
        
        card.innerHTML = `
            <div class="browser-card-name">${monster.data.name || 'Unnamed Monster'}</div>
            <div class="browser-card-info">HP: ${monster.data.hp || 0} | AC: ${monster.data.ac || 0}</div>
            <div class="browser-card-location">${monster.location}</div>
        `;
        
        monsterList.appendChild(card);
    });
}

function updateAbilityBrowser(abilities) {
    const abilityList = document.getElementById('abilityBrowserList');
    const abilityCount = document.getElementById('abilityCount');
    
    abilityCount.textContent = abilities.length;
    
    if (abilities.length === 0) {
        abilityList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px; font-style: italic;">No abilities found</div>';
        return;
    }
    
    abilityList.innerHTML = '';
    
    abilities.forEach(ability => {
        const card = document.createElement('div');
        card.className = 'browser-ability-card';
        card.setAttribute('data-ability-id', ability.id);
        
        card.innerHTML = `
            <div class="browser-card-name">${ability.name}</div>
            <div class="browser-card-info">${ability.description}</div>
            <div class="browser-card-location">${ability.location}</div>
        `;
        
        abilityList.appendChild(card);
    });
}

function selectMonster(monsterId) {
    console.log('Selected monster:', monsterId);
    // For now, just log - we can implement editing later
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

function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('abilityId', e.target.getAttribute('data-ability-id'));
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}