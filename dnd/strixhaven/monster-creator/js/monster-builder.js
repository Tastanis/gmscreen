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

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Monster Builder initialized');
    
    // Initialize default tab structure
    monsterData.tabs.default = {
        name: 'Untitled',
        subTabs: {
            'default-sub': {
                name: 'General',
                monsters: ['test-monster']
            }
        }
    };
    
    // Initialize test monster
    monsterData.monsters['test-monster'] = {
        name: 'Test Monster',
        hp: 10,
        ac: 12,
        speed: '30 ft',
        abilities: [],
        tabId: 'default',
        subTabId: 'default-sub',
        lastModified: Date.now()
    };
    
    // Load saved data
    loadMonsterData();
    
    // Set up event listeners
    setupEventListeners();
    
    // Start auto-save timer
    startAutoSave();
    
    // Set up window close handler
    window.addEventListener('beforeunload', function(e) {
        if (hasUnsavedChanges()) {
            saveAllData();
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
});

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
    
    // Load sub-tabs for this main tab
    loadSubTabs(tabId);
    
    console.log('Switched to main tab:', tabId);
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
    
    console.log('Switched to sub-tab:', subTabId);
}

function loadSubTabs(mainTabId) {
    const subTabList = document.getElementById('subTabList');
    subTabList.innerHTML = '';
    
    const mainTab = monsterData.tabs[mainTabId];
    if (mainTab && mainTab.subTabs) {
        Object.entries(mainTab.subTabs).forEach(([subTabId, subTab]) => {
            const tabElement = createTabElement(subTabId, subTab.name, true);
            subTabList.appendChild(tabElement);
        });
    }
    
    // Add the + button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-sub-tab-btn';
    addBtn.textContent = '+';
    addBtn.onclick = addSubTab;
    subTabList.appendChild(addBtn);
    
    // Select first sub-tab if exists
    const firstSubTab = subTabList.querySelector('.sub-tab');
    if (firstSubTab) {
        switchSubTab(firstSubTab.getAttribute('data-subtab-id'));
    }
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
    if (tabId === 'default') {
        alert('Cannot close the default tab');
        return;
    }
    
    if (confirm('Are you sure you want to close this tab? All monsters in this tab will be lost.')) {
        // Remove tab data
        delete monsterData.tabs[tabId];
        
        // Remove tab element
        document.querySelector(`[data-tab-id="${tabId}"]`).remove();
        
        // Switch to default tab
        switchMainTab('default');
        
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
        // Remove sub-tab data
        delete subTabs[subTabId];
        
        // Remove sub-tab element
        document.querySelector(`[data-subtab-id="${subTabId}"]`).remove();
        
        // Switch to first available sub-tab
        const firstSubTab = document.querySelector('.sub-tab');
        if (firstSubTab) {
            switchSubTab(firstSubTab.getAttribute('data-subtab-id'));
        }
        
        queueSave();
        console.log('Closed sub-tab:', subTabId);
    }
}

// Workspace Management
function loadWorkspace() {
    const workspace = document.getElementById('workspace');
    workspace.innerHTML = '';
    
    const subTab = monsterData.tabs[currentMainTab]?.subTabs[currentSubTab];
    if (subTab && subTab.monsters) {
        subTab.monsters.forEach(monsterId => {
            const monster = monsterData.monsters[monsterId];
            if (monster) {
                const monsterCard = createMonsterCard(monsterId, monster);
                workspace.appendChild(monsterCard);
            }
        });
    }
    
    console.log('Loaded workspace for:', currentSubTab);
}

function createMonsterCard(monsterId, monsterData) {
    const card = document.createElement('div');
    card.className = 'monster-card';
    card.setAttribute('data-monster-id', monsterId);
    
    card.innerHTML = `
        <div class="card-header">
            <input type="text" class="monster-name" placeholder="Monster Name" value="${monsterData.name || ''}">
            <button class="card-menu">⋮</button>
        </div>
        <div class="card-body">
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
            <div class="abilities-section">
                <h4>Abilities</h4>
                <div class="ability-slots" id="abilitySlots_${monsterId}">
                    <!-- Ability cards will be dropped here -->
                </div>
            </div>
        </div>
    `;
    
    // Add input listeners
    card.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', debounce(() => saveMonsterField(monsterId, input), 500));
    });
    
    return card;
}

function saveCurrentWorkspace() {
    document.querySelectorAll('.monster-card').forEach(card => {
        const monsterId = card.getAttribute('data-monster-id');
        const monster = monsterData.monsters[monsterId];
        
        if (monster) {
            // Save all fields
            monster.name = card.querySelector('.monster-name').value;
            monster.hp = parseInt(card.querySelector('[data-field="hp"]').value) || 0;
            monster.ac = parseInt(card.querySelector('[data-field="ac"]').value) || 0;
            monster.speed = card.querySelector('[data-field="speed"]').value;
            monster.lastModified = Date.now();
        }
    });
}

function saveMonsterField(monsterId, input) {
    const monster = monsterData.monsters[monsterId];
    if (!monster) return;
    
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

// Save System
function queueSave() {
    updateSaveStatus('saving');
    
    // Clear existing timer
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    // Set new timer for batch save
    autoSaveTimer = setTimeout(() => {
        saveAllData();
    }, 2000); // Wait 2 seconds before saving to batch changes
}

async function saveAllData() {
    if (isSaving) {
        console.log('Save already in progress, queueing...');
        return;
    }
    
    isSaving = true;
    updateSaveStatus('saving');
    
    try {
        // Save current workspace state
        saveCurrentWorkspace();
        
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
            console.log('Data saved successfully');
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
            console.log('Data loaded successfully');
            
            // Refresh UI
            loadSubTabs(currentMainTab);
            loadWorkspace();
        }
    } catch (error) {
        console.error('Load error:', error);
    }
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
    // Check if any monster has been modified recently
    const recentThreshold = Date.now() - 35000; // 35 seconds ago
    return Object.values(monsterData.monsters).some(monster => 
        monster.lastModified > recentThreshold
    );
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

// Ability Tab Functions
function addAbilityTab() {
    const tabId = 'ability_tab_' + Date.now();
    const tabName = prompt('Enter ability tab name:', 'New Category');
    
    if (tabName) {
        // Create ability tab data
        monsterData.abilityTabs[tabId] = {
            name: tabName,
            abilities: []
        };
        
        // Create tab element
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.setAttribute('data-ability-tab-id', tabId);
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tab-name';
        nameSpan.textContent = tabName;
        
        tab.appendChild(nameSpan);
        
        document.getElementById('abilityTabList').insertBefore(
            tab,
            document.querySelector('#abilityTabList .add-tab-btn')
        );
        
        queueSave();
        console.log('Added ability tab:', tabName);
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Input change tracking
    document.addEventListener('input', function(e) {
        if (e.target.matches('.monster-card input')) {
            // Input changes are handled by individual listeners
        }
    });
    
    // Drag and drop setup (basic structure for future implementation)
    document.querySelectorAll('.ability-card').forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('abilityId', e.target.getAttribute('data-ability-id'));
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}