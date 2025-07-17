// Enhanced Combat Tracker - Complete Implementation
let isDragging = false;
let dragElement = null;
let dragOffset = { x: 0, y: 0 };
let lastSaveTime = 0;
let autoRefreshInterval = null;
let lastKnownData = {};
let saveTimeout = null;
let currentConditionSlot = null;
let currentCreatureId = null;
let recentlyAddedCreatures = new Set(); // Track recently added creatures

// Grid system for card placement - Updated for increased height and spacing
const CARD_WIDTH = 240;
const CARD_HEIGHT = 155; // Updated to match new CSS height
const CARD_MARGIN = 10; // Space between cards
const GRID_CELL_HEIGHT = CARD_HEIGHT + CARD_MARGIN; // Total height of a grid cell
const GRID_CELL_WIDTH = CARD_WIDTH + CARD_MARGIN; // Total width of a grid cell
const GRID_ROWS_PER_COLUMN = 12; // Maximum cards per column before scrolling

// Track mouse position during drag
let currentMouseX = 0;
let currentMouseY = 0;

// DOM elements
const saveStatus = document.getElementById('save-status');
const lastUpdate = document.getElementById('last-update');
const creatureCount = document.getElementById('creature-count');
const combatArea = document.getElementById('combat-area');
const conditionModal = document.getElementById('condition-modal');
const conditionTooltip = document.getElementById('condition-tooltip');
const imageUpload = document.getElementById('image-upload');

// Combat state
let creatures = {};
let roundCount = 1;
let playerTurnFirst = null;
let initiativeRolled = false;

// Initialize the system
document.addEventListener('DOMContentLoaded', function() {
    console.log('Enhanced Combat Tracker initialized');
    console.log('User is GM:', isGM);
    console.log('Current user:', currentUser);
    
    updateFromCombatData(combatData);
    
    if (isGM) {
        initializeGMMode();
    } else {
        initializePlayerMode();
    }
    
    updateLastUpdateTime();
    setupEventListeners();
});

function initializeGMMode() {
    console.log('Initializing GM mode with enhanced features');
    
    document.getElementById('add-enemy')?.addEventListener('click', () => addCreature('enemy'));
    document.getElementById('add-hero')?.addEventListener('click', () => addCreature('hero'));
    document.getElementById('add-pcs')?.addEventListener('click', addStoredPCs);
    document.getElementById('roll-initiative')?.addEventListener('click', rollInitiative);
    document.getElementById('end-combat')?.addEventListener('click', confirmEndCombat);
    
    // Modal event listeners
    document.getElementById('close-condition-modal')?.addEventListener('click', closeConditionModal);
    conditionModal?.addEventListener('click', (e) => {
        if (e.target === conditionModal) closeConditionModal();
    });
    
    imageUpload?.addEventListener('change', handleImageUpload);
    
    updateStatus('Ready - Enhanced GM Mode Active', 'saved');
}

function initializePlayerMode() {
    console.log('Initializing enhanced Player mode');
    
    loadCombatData();
    autoRefreshInterval = setInterval(loadCombatData, 2000);
    
    updateStatus('Read-Only Mode - Auto-refreshing every 2 seconds', 'saved');
}

function setupEventListeners() {
    document.addEventListener('dragstart', (e) => e.preventDefault());
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.condition-display') && !e.target.closest('#condition-modal')) {
            hideConditionTooltip();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeConditionModal();
            hideConditionTooltip();
        }
    });
}

// Grid positioning system
function getColumnBounds(column) {
    const areaRect = combatArea.getBoundingClientRect();
    const areaWidth = combatArea.clientWidth;
    
    // Fixed column width based on card width
    const columnWidth = CARD_WIDTH + (CARD_MARGIN * 2);
    const totalGridWidth = columnWidth * 4;
    
    // Center the grid if screen is wider than needed
    const gridOffset = Math.max(0, (areaWidth - totalGridWidth) / 2);
    
    return {
        left: gridOffset + (column * columnWidth) + CARD_MARGIN,
        right: gridOffset + ((column + 1) * columnWidth) - CARD_MARGIN,
        width: CARD_WIDTH
    };
}

// Enhanced grid positioning - finds actual empty spots and prevents overlaps  
function getNextGridPosition(column, status) {
    const columnBounds = getColumnBounds(column);
    const startY = 60; // Below column headers
    
    // Get all creatures in this column with their Y positions
    const columnCreatures = Object.values(creatures).filter(c => 
        c.column === column && c.status === status
    );
    
    // If no creatures in column, start at row 0
    if (columnCreatures.length === 0) {
        return {
            x: columnBounds.left,
            y: startY,
            column: column,
            row: 0
        };
    }
    
    // Create array of occupied Y positions (normalized to grid positions)
    const occupiedGridRows = columnCreatures.map(c => {
        return Math.round((c.y_pos - startY) / GRID_CELL_HEIGHT);
    }).filter(row => row >= 0).sort((a, b) => a - b); // Filter out negative rows and sort
    
    // Find first empty grid row
    let targetRow = 0;
    for (let i = 0; i < occupiedGridRows.length; i++) {
        if (occupiedGridRows[i] !== targetRow) {
            break; // Found gap at targetRow
        }
        targetRow++; // This row is occupied, try next
    }
    
    const gridY = startY + (targetRow * GRID_CELL_HEIGHT);
    
    return {
        x: columnBounds.left,
        y: gridY,
        column: column,
        row: targetRow
    };
}

// Find the best available position when dropping - improved
function findBestDropPosition(mouseX, mouseY, status) {
    const targetColumn = determineColumnFromPosition(mouseX, status);
    const columnBounds = getColumnBounds(targetColumn);
    const startY = 60; // Same as getNextGridPosition
    
    // Calculate which row the mouse is over
    const targetRow = Math.max(0, Math.round((mouseY - startY) / GRID_CELL_HEIGHT));
    
    // Check if this exact spot is available
    const exactPosition = startY + (targetRow * GRID_CELL_HEIGHT);
    const tolerance = GRID_CELL_HEIGHT / 3; // Allow some tolerance for "close enough"
    
    const isOccupied = Object.values(creatures).some(c => 
        c.column === targetColumn && 
        c.status === status && 
        Math.abs(c.y_pos - exactPosition) < tolerance
    );
    
    if (!isOccupied) {
        // Exact spot is free
        return {
            x: columnBounds.left,
            y: exactPosition,
            column: targetColumn,
            row: targetRow
        };
    } else {
        // Find next available spot in this column
        return getNextGridPosition(targetColumn, status);
    }
}

function determineColumnFromPosition(x, status) {
    const areaWidth = combatArea.clientWidth;
    const columnWidth = CARD_WIDTH + (CARD_MARGIN * 2);
    const totalGridWidth = columnWidth * 4;
    const gridOffset = Math.max(0, (areaWidth - totalGridWidth) / 2);
    
    // Adjust x position relative to grid start
    const relativeX = x - gridOffset;
    
    // Determine which column based on fixed column width
    let column = Math.floor(relativeX / columnWidth);
    
    // Constrain to valid columns
    if (status === 'waiting') {
        column = Math.max(0, Math.min(1, column)); // Columns 0-1
    } else {
        column = Math.max(2, Math.min(3, column)); // Columns 2-3
    }
    
    return column;
}

function updateFromCombatData(data) {
    lastKnownData = JSON.parse(JSON.stringify(data));
    creatures = data.creatures || {};
    roundCount = data.round_count || 1;
    playerTurnFirst = data.player_turn_first;
    initiativeRolled = data.initiative_rolled || false;
    
    updateRoundDisplay();
    updateInitiativeDisplay();
    updateCreatureCount();
    renderAllCreatures();
}

function renderAllCreatures() {
    const combatAreaInner = combatArea.querySelector('.combat-area-inner') || combatArea;
    const existingCards = combatAreaInner.querySelectorAll('.creature-card');
    existingCards.forEach(card => card.remove());
    
    // Filter creatures based on player visibility
    const visibleCreatures = Object.values(creatures).filter(creature => {
        if (isGM) return true; // GM sees everything
        return !creature.hidden_from_players; // Players only see non-hidden
    });
    
    visibleCreatures.forEach(creature => {
        renderCreature(creature);
    });
}

function renderCreature(creature) {
    const card = document.createElement('div');
    card.className = `creature-card ${creature.creature_type} ${isGM ? 'draggable' : 'readonly'}`;
    
    if (creature.hidden_from_players && isGM) {
        card.classList.add('hidden-from-players');
    }
    
    card.id = `creature-${creature.id}`;
    card.style.left = `${creature.x_pos || 10}px`;
    card.style.top = `${creature.y_pos || 10}px`;
    
    card.innerHTML = `
        <div class="creature-header">
            <div class="creature-portrait ${creature.image_path ? '' : 'placeholder'}" data-creature-id="${creature.id}">
                ${creature.image_path ? 
                    `<img src="portraits/${creature.image_path}" alt="Portrait">` : 
                    'No Image'
                }
                ${isGM ? '<button class="portrait-upload-btn" onclick="selectImage(\'' + creature.id + '\')">📷</button>' : ''}
            </div>
            <div class="creature-info">
                ${isGM ? 
                    `<input type="text" class="creature-name" value="${creature.name || ''}" data-creature-id="${creature.id}" onchange="updateCreatureName('${creature.id}', this.value)">` :
                    `<div class="creature-name readonly">${creature.name || 'Unnamed'}</div>`
                }
                <div class="header-controls">
                    <div class="trigger-section">
                        <span class="trigger-label">Triggered</span>
                        <div class="trigger-status ${creature.triggered_used ? 'used' : 'ready'} ${isGM ? '' : 'readonly'}" 
                             data-creature-id="${creature.id}" 
                             title="Triggered Action"
                             ${isGM ? `onclick="toggleTriggeredAction('${creature.id}')"` : ''}>
                        </div>
                    </div>
                    ${isGM ? `
                        <button class="visibility-btn ${creature.hidden_from_players ? 'hidden' : 'visible'}" 
                                onclick="toggleVisibility('${creature.id}')"
                                title="${creature.hidden_from_players ? 'Show to Players' : 'Hide from Players'}">
                            ${creature.hidden_from_players ? '👁️‍🗨️' : '👁️'}
                        </button>
                    ` : ''}
                    ${isGM ? `<button class="remove-btn" onclick="removeCreature('${creature.id}')" title="Remove Creature">×</button>` : ''}
                </div>
            </div>
        </div>
        
        <div class="creature-body">
            <div class="conditions-section">
                <div class="conditions-title">Conditions</div>
                <div class="condition-slots">
                    ${renderConditionSlots(creature)}
                </div>
                <div class="other-condition">
                    <div class="other-condition-label">Other:</div>
                    ${isGM ? 
                        `<input type="text" class="other-condition-input" value="${creature.other_condition || ''}" 
                                data-creature-id="${creature.id}" 
                                onchange="updateOtherCondition('${creature.id}', this.value)"
                                onmouseenter="showOtherTooltip(event)"
                                onmouseleave="hideOtherTooltip()"
                                title="Type 'PC' to save as reusable character, 'REMOVE' to delete saved PC">` :
                        `<div class="other-condition-display">${creature.other_condition || ''}</div>`
                    }
                </div>
            </div>
            ${isGM ? `<div class="drag-zone" data-creature-id="${creature.id}">⋮⋮</div>` : `<div class="drag-zone readonly">⋮⋮</div>`}
        </div>
    `;
    
    const combatAreaInner = combatArea.querySelector('.combat-area-inner') || combatArea;
    combatAreaInner.appendChild(card);
    
    if (isGM) {
        setupDragging(card);
    }
}

function renderConditionSlots(creature) {
    const conditions = creature.conditions || ['', ''];
    return conditions.map((condition, index) => `
        <div class="condition-slot">
            <div class="condition-number">${index + 1}:</div>
            <div class="condition-display ${condition ? '' : 'empty'} ${isGM ? '' : 'readonly'}" 
                 data-creature-id="${creature.id}" 
                 data-slot="${index}"
                 ${isGM ? `onclick="selectCondition('${creature.id}', ${index})"` : ''}
                 ${condition ? `onmouseenter="showConditionTooltip(event, '${condition}')" onmouseleave="hideConditionTooltip()"` : ''}>
                ${condition || 'None'}
            </div>
        </div>
    `).join('');
}

// Enhanced dragging - ONLY from drag zone, not header
function setupDragging(card) {
    const dragZone = card.querySelector('.drag-zone');
    
    // ONLY drag zone is draggable, NOT the header
    if (dragZone) {
        dragZone.addEventListener('mousedown', startDrag);
        dragZone.addEventListener('touchstart', startDrag, { passive: false });
    }
}

function startDrag(e) {
    if (!isGM) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    isDragging = true;
    dragElement = e.target.closest('.creature-card');
    
    if (!dragElement) return;
    
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    
    const rect = dragElement.getBoundingClientRect();
    const areaRect = combatArea.getBoundingClientRect();
    
    // Initialize mouse position
    currentMouseX = clientX - areaRect.left;
    currentMouseY = clientY - areaRect.top;
    
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;
    
    dragElement.classList.add('dragging');
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', stopDrag);
    
    updateStatus('Dragging...', 'saving');
}

function drag(e) {
    if (!isDragging || !dragElement || !isGM) return;
    
    e.preventDefault();
    
    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
    
    const areaRect = combatArea.getBoundingClientRect();
    
    // Track current mouse position relative to combat area
    currentMouseX = clientX - areaRect.left;
    currentMouseY = clientY - areaRect.top;
    
    let newX = clientX - areaRect.left - dragOffset.x;
    let newY = clientY - areaRect.top - dragOffset.y;
    
    // Constrain to combat area
    newX = Math.max(0, Math.min(newX, areaRect.width - CARD_WIDTH));
    newY = Math.max(50, Math.min(newY, areaRect.height - CARD_HEIGHT)); // Updated for new card height
    
    dragElement.style.left = newX + 'px';
    dragElement.style.top = newY + 'px';
}

function stopDrag(e) {
    if (!isDragging || !dragElement || !isGM) return;
    
    isDragging = false;
    dragElement.classList.remove('dragging');
    
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', drag);
    document.removeEventListener('touchend', stopDrag);
    
    const creatureId = dragElement.id.replace('creature-', '');
    
    // Use the last known mouse position for determining drop location
    const areaWidth = combatArea.clientWidth;
    const columnWidth = CARD_WIDTH + (CARD_MARGIN * 2);
    const totalGridWidth = columnWidth * 4;
    const gridOffset = Math.max(0, (areaWidth - totalGridWidth) / 2);
    
    // Check if mouse is in the right half of the grid (columns 2-3)
    const gridMidpoint = gridOffset + (totalGridWidth / 2);
    const newStatus = currentMouseX > gridMidpoint ? 'complete' : 'waiting';
    
    // Get current creature and temporarily remove from creatures object for clean positioning
    const currentCreature = creatures[creatureId];
    if (!currentCreature) {
        dragElement = null;
        return;
    }
    
    const oldStatus = currentCreature.status;
    
    // Temporarily remove creature from creatures object to avoid self-conflict in positioning
    delete creatures[creatureId];
    
    // Find the best available position for this drop using mouse position
    const bestPosition = findBestDropPosition(currentMouseX, currentMouseY, newStatus);
    
    // Update creature data
    currentCreature.x_pos = bestPosition.x;
    currentCreature.y_pos = bestPosition.y;
    currentCreature.status = newStatus;
    currentCreature.column = bestPosition.column;
    
    // Add creature back to creatures object
    creatures[creatureId] = currentCreature;
    
    // Snap the card to final position
    dragElement.style.left = bestPosition.x + 'px';
    dragElement.style.top = bestPosition.y + 'px';
    
    // Check for round end if moved to complete
    if (oldStatus === 'waiting' && newStatus === 'complete') {
        setTimeout(checkRoundEnd, 500);
    }
    
    saveCreaturePosition(creatureId, bestPosition.x, bestPosition.y, newStatus, bestPosition.column);
    dragElement = null;
}

// Creature management with improved grid positioning
function addCreature(type) {
    if (!isGM) return;
    
    // Determine default column (0 for heroes, 1 for enemies when waiting)
    const defaultColumn = type === 'hero' ? 0 : 1;
    const gridPos = getNextGridPosition(defaultColumn, 'waiting');
    
    const newCreature = {
        id: generateId(),
        creature_type: type,
        name: type === 'enemy' ? 'New Enemy' : 'New Hero',
        x_pos: gridPos.x,
        y_pos: gridPos.y,
        status: 'waiting',
        column: defaultColumn,
        conditions: ['', ''],
        other_condition: '',
        triggered_used: false,
        image_path: null,
        hidden_from_players: true // ALL new creatures start hidden
    };
    
    creatures[newCreature.id] = newCreature;
    recentlyAddedCreatures.add(newCreature.id); // Track new creature
    
    renderCreature(newCreature);
    updateCreatureCount();
    
    saveCombatData('Creature added');
    
    // Remove from recently added after 2 seconds (enough time for save to complete)
    setTimeout(() => {
        recentlyAddedCreatures.delete(newCreature.id);
    }, 2000);
}

function removeCreature(creatureId) {
    if (!isGM) return;
    
    const creature = creatures[creatureId];
    if (!creature) return;
    
    if (confirm(`Remove ${creature.name}?`)) {
        delete creatures[creatureId];
        recentlyAddedCreatures.delete(creatureId); // Remove from tracking
        const card = document.getElementById(`creature-${creatureId}`);
        if (card) card.remove();
        
        updateCreatureCount();
        
        // Re-render all creatures to fix any grid positioning issues
        renderAllCreatures();
        
        saveCombatData('Creature removed');
        
        setTimeout(checkRoundEnd, 100);
    }
}

// Visibility system - Enhanced with race condition protection
function toggleVisibility(creatureId) {
    if (!isGM) return;
    
    console.log('Toggling visibility for creature:', creatureId);
    
    // If this is a recently added creature, wait a moment for save to complete
    if (recentlyAddedCreatures.has(creatureId)) {
        console.log('Recently added creature, waiting for save...');
        updateStatus('Waiting for save...', 'saving');
        setTimeout(() => toggleVisibility(creatureId), 1000);
        return;
    }
    
    // Check if creature exists locally first
    if (!creatures[creatureId]) {
        console.error('Creature not found in local data:', creatureId);
        updateStatus('Toggle failed: Creature not found locally', 'error');
        return;
    }
    
    updateStatus('Toggling visibility...', 'saving');
    
    const formData = new FormData();
    formData.append('action', 'toggle_visibility');
    formData.append('creature_id', creatureId);
    
    fetch('combat_handler.php', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
    })
    .then(text => {
        console.log('Toggle visibility response:', text);
        try {
            const data = JSON.parse(text);
            if (data.success) {
                updateFromCombatData(data.data);
                updateStatus('Visibility toggled', 'saved');
                updateLastUpdateTime();
            } else {
                updateStatus('Toggle failed: ' + data.error, 'error');
                console.error('Failed to toggle visibility:', data.error);
            }
        } catch (e) {
            console.error('Invalid JSON response from toggle visibility:', text);
            updateStatus('Toggle failed: Invalid response', 'error');
        }
    })
    .catch(error => {
        updateStatus('Network error', 'error');
        console.error('Error toggling visibility:', error);
    });
}

// Enhanced other condition handling with PC removal
function updateOtherCondition(creatureId, condition) {
    if (!isGM) return;
    
    const creature = creatures[creatureId];
    if (!creature) return;
    
    const trimmedCondition = condition.trim();
    
    // Handle PC removal
    if (trimmedCondition.toUpperCase() === 'REMOVE' && creature.creature_type === 'hero') {
        if (confirm(`Remove PC "${creature.name}" from saved PCs?`)) {
            removePCData(creature.name);
        }
        // Clear the REMOVE text
        const input = document.querySelector(`input[data-creature-id="${creatureId}"]`);
        if (input) input.value = '';
        return;
    }
    
    creature.other_condition = trimmedCondition;
    
    // Handle PC save
    if (trimmedCondition.toLowerCase() === 'pc' && creature.creature_type === 'hero') {
        savePCData(creature);
        alert(`PC "${creature.name}" saved for future use!`);
    }
    
    saveCombatData('Other condition updated');
}

function removePCData(name) {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'remove_pc');
    formData.append('name', name);
    
    fetch('combat_handler.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`PC "${name}" removed from saved PCs.`);
        } else {
            alert('Failed to remove PC: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error removing PC:', error);
        alert('Failed to remove PC');
    });
}

// Tooltip system
function showOtherTooltip(event) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-helper';
    tooltip.innerHTML = `
        <div class="tooltip-title">Other Condition Commands</div>
        <div class="tooltip-commands">
            <div class="tooltip-command"><strong>PC</strong> - Save this hero as a reusable PC</div>
            <div class="tooltip-command"><strong>REMOVE</strong> - Remove this PC from saved PCs</div>
        </div>
    `;
    
    const rect = event.target.getBoundingClientRect();
    tooltip.style.position = 'absolute';
    tooltip.style.left = `${rect.right + 10}px`;
    tooltip.style.top = `${rect.top}px`;
    tooltip.style.zIndex = '1600';
    
    document.body.appendChild(tooltip);
    event.target.tooltip = tooltip;
}

function hideOtherTooltip() {
    document.querySelectorAll('.tooltip-helper').forEach(tooltip => {
        tooltip.remove();
    });
}

// Combat management functions (existing ones updated)
function rollInitiative() {
    if (!isGM) return;
    
    const roll = Math.floor(Math.random() * 10) + 1;
    playerTurnFirst = roll >= 6;
    initiativeRolled = true;
    
    const winner = playerTurnFirst ? 'Players' : 'Monsters';
    alert(`Rolled ${roll}! ${winner} win initiative!\n\nThe winning team picks the first creature to act.`);
    
    updateInitiativeDisplay();
    saveCombatData('Initiative rolled');
}

function confirmEndCombat() {
    if (!isGM) return;
    
    if (confirm('End combat and remove all creatures?')) {
        endCombat();
    }
}

function endCombat() {
    if (!isGM) return;
    
    creatures = {};
    roundCount = 1;
    playerTurnFirst = null;
    initiativeRolled = false;
    recentlyAddedCreatures.clear(); // Clear tracking
    
    renderAllCreatures();
    updateRoundDisplay();
    updateInitiativeDisplay();
    updateCreatureCount();
    
    saveCombatData('Combat ended');
}

function checkRoundEnd() {
    if (!isGM) return;
    
    const waitingCreatures = Object.values(creatures).filter(c => c.status === 'waiting');
    
    if (waitingCreatures.length === 0 && Object.keys(creatures).length > 0) {
        if (confirm(`All creatures have acted in Round ${roundCount}. Advance to Round ${roundCount + 1}?`)) {
            advanceRound();
        }
    }
}

function advanceRound() {
    if (!isGM) return;
    
    roundCount++;
    
    // Reset all creatures to waiting status and reset triggered actions
    Object.values(creatures).forEach(creature => {
        creature.status = 'waiting';
        creature.triggered_used = false;
    });
    
    // Clear creatures object temporarily to get clean grid positioning
    const allCreatures = Object.values(creatures);
    creatures = {}; // Temporarily clear to calculate positions
    
    // Separate heroes and enemies
    const heroesWaiting = allCreatures.filter(c => c.creature_type === 'hero');
    const enemiesWaiting = allCreatures.filter(c => c.creature_type === 'enemy');
    
    // Position heroes in column 0 using grid system
    heroesWaiting.forEach((creature, index) => {
        const gridPos = getNextGridPosition(0, 'waiting');
        creature.x_pos = gridPos.x;
        creature.y_pos = gridPos.y;
        creature.column = 0;
        creature.status = 'waiting';
        creatures[creature.id] = creature; // Add back to creatures object
    });
    
    // Position enemies in column 1 using grid system  
    enemiesWaiting.forEach((creature, index) => {
        const gridPos = getNextGridPosition(1, 'waiting');
        creature.x_pos = gridPos.x;
        creature.y_pos = gridPos.y;
        creature.column = 1;
        creature.status = 'waiting';
        creatures[creature.id] = creature; // Add back to creatures object
    });
    
    renderAllCreatures();
    updateRoundDisplay();
    saveCombatData('Round advanced');
}

// Condition system (existing functions remain the same)
function selectCondition(creatureId, slot) {
    if (!isGM) return;
    
    currentCreatureId = creatureId;
    currentConditionSlot = slot;
    
    const creature = creatures[creatureId];
    if (!creature) return;
    
    const currentCondition = creature.conditions[slot];
    
    if (currentCondition) {
        creature.conditions[slot] = '';
        updateCreatureDisplay(creatureId);
        saveCombatData('Condition cleared');
    } else {
        showConditionModal();
    }
}

function showConditionModal() {
    if (!conditionModal) return;
    
    const conditionGrid = conditionModal.querySelector('.condition-grid');
    if (conditionGrid) {
        conditionGrid.innerHTML = '';
        
        availableConditions.forEach(condition => {
            const option = document.createElement('div');
            option.className = 'condition-option';
            option.dataset.condition = condition;
            
            const rule = conditionRules[condition] || '';
            option.innerHTML = `
                <div class="condition-name">${condition}</div>
                <div class="condition-preview">${rule.substring(0, 80)}...</div>
            `;
            
            option.addEventListener('click', () => selectConditionFromModal(condition));
            conditionGrid.appendChild(option);
        });
    }
    
    conditionModal.style.display = 'block';
}

function selectConditionFromModal(condition) {
    if (!isGM || !currentCreatureId || currentConditionSlot === null) return;
    
    const creature = creatures[currentCreatureId];
    if (creature) {
        creature.conditions[currentConditionSlot] = condition;
        updateCreatureDisplay(currentCreatureId);
        saveCombatData('Condition set');
    }
    
    closeConditionModal();
}

function closeConditionModal() {
    if (conditionModal) {
        conditionModal.style.display = 'none';
    }
    currentCreatureId = null;
    currentConditionSlot = null;
}

function showConditionTooltip(event, condition) {
    const rule = conditionRules[condition];
    if (!rule || !conditionTooltip) return;
    
    const title = conditionTooltip.querySelector('.tooltip-title');
    const text = conditionTooltip.querySelector('.tooltip-text');
    
    if (title) title.textContent = condition.toUpperCase();
    if (text) text.textContent = rule;
    
    const rect = event.target.getBoundingClientRect();
    conditionTooltip.style.left = `${rect.right + 10}px`;
    conditionTooltip.style.top = `${rect.top}px`;
    conditionTooltip.style.display = 'block';
}

function hideConditionTooltip() {
    if (conditionTooltip) {
        conditionTooltip.style.display = 'none';
    }
}

// Remaining functions (creature updates, image handling, PC management, save/load, utilities)
function updateCreatureName(creatureId, name) {
    if (!isGM) return;
    
    const creature = creatures[creatureId];
    if (creature) {
        creature.name = name;
        saveCombatData('Name updated');
    }
}

function toggleTriggeredAction(creatureId) {
    if (!isGM) return;
    
    const creature = creatures[creatureId];
    if (creature) {
        creature.triggered_used = !creature.triggered_used;
        updateCreatureDisplay(creatureId);
        saveCombatData('Triggered action toggled');
    }
}

function updateCreatureDisplay(creatureId) {
    const creature = creatures[creatureId];
    const card = document.getElementById(`creature-${creatureId}`);
    
    if (!creature || !card) return;
    
    // Update triggered action status
    const triggerStatus = card.querySelector('.trigger-status');
    if (triggerStatus) {
        triggerStatus.className = `trigger-status ${creature.triggered_used ? 'used' : 'ready'} ${isGM ? '' : 'readonly'}`;
    }
    
    // Update visibility button
    const visibilityBtn = card.querySelector('.visibility-btn');
    if (visibilityBtn && isGM) {
        visibilityBtn.className = `visibility-btn ${creature.hidden_from_players ? 'hidden' : 'visible'}`;
        visibilityBtn.innerHTML = creature.hidden_from_players ? '👁️‍🗨️' : '👁️';
        visibilityBtn.title = creature.hidden_from_players ? 'Show to Players' : 'Hide from Players';
    }
    
    // Update conditions
    const conditionSlots = card.querySelector('.condition-slots');
    if (conditionSlots) {
        conditionSlots.innerHTML = renderConditionSlots(creature);
    }
    
    // Add update animation
    card.classList.add('updating');
    setTimeout(() => card.classList.remove('updating'), 600);
}

// Image handling (same as before)
function selectImage(creatureId) {
    if (!isGM) return;
    
    imageUpload.dataset.creatureId = creatureId;
    imageUpload.click();
}

function handleImageUpload(event) {
    if (!isGM) return;
    
    const file = event.target.files[0];
    const creatureId = event.target.dataset.creatureId;
    
    if (!file || !creatureId) return;
    
    const formData = new FormData();
    formData.append('action', 'upload_image');
    formData.append('creature_id', creatureId);
    formData.append('image', file);
    
    fetch('combat_handler.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && creatures[creatureId]) {
            creatures[creatureId].image_path = data.filename;
            updateCreaturePortrait(creatureId, data.filename);
            saveCombatData('Image uploaded');
        } else {
            alert('Failed to upload image: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
        alert('Failed to upload image');
    });
    
    event.target.value = '';
}

function updateCreaturePortrait(creatureId, filename) {
    const card = document.getElementById(`creature-${creatureId}`);
    const portrait = card?.querySelector('.creature-portrait');
    
    if (portrait) {
        portrait.className = 'creature-portrait';
        portrait.innerHTML = `
            <img src="portraits/${filename}" alt="Portrait">
            ${isGM ? '<button class="portrait-upload-btn" onclick="selectImage(\'' + creatureId + '\')">📷</button>' : ''}
        `;
    }
}

// PC Management (updated)
function addStoredPCs() {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'get_pcs');
    
    fetch('combat_handler.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.pcs && data.pcs.length > 0) {
            let added = 0;
            data.pcs.forEach(pc => {
                if (!Object.values(creatures).some(c => c.name.toLowerCase() === pc.name.toLowerCase())) {
                    const gridPos = getNextGridPosition(0, 'waiting'); // Heroes go to column 0
                    
                    const newCreature = {
                        id: generateId(),
                        creature_type: 'hero',
                        name: pc.name,
                        x_pos: gridPos.x,
                        y_pos: gridPos.y,
                        status: 'waiting',
                        column: 0,
                        conditions: ['', ''],
                        other_condition: '',
                        triggered_used: false,
                        image_path: pc.image_path,
                        hidden_from_players: false // PCs from "Add PCs" start visible
                    };
                    
                    creatures[newCreature.id] = newCreature;
                    renderCreature(newCreature);
                    added++;
                }
            });
            
            if (added > 0) {
                updateCreatureCount();
                saveCombatData('PCs added');
                alert(`Added ${added} PC(s) to combat.`);
            } else {
                alert('All saved PCs are already in combat.');
            }
        } else {
            alert('No saved PCs found. Add heroes and type "PC" in their Other condition to save them.');
        }
    })
    .catch(error => {
        console.error('Error loading PCs:', error);
        alert('Failed to load PCs');
    });
}

function savePCData(creature) {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'save_pc');
    formData.append('name', creature.name);
    formData.append('image_path', creature.image_path || '');
    
    fetch('combat_handler.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('Failed to save PC:', data.error);
        }
    })
    .catch(error => {
        console.error('Error saving PC:', error);
    });
}

// Utility functions
function generateId() {
    return 'creature_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function updateRoundDisplay() {
    const roundDisplay = document.getElementById('round-display');
    if (roundDisplay) {
        roundDisplay.textContent = `Round: ${roundCount}`;
    }
}

function updateInitiativeDisplay() {
    const initiativeDisplay = document.getElementById('initiative-display');
    if (initiativeDisplay) {
        let text = 'Initiative: ';
        if (initiativeRolled) {
            const winner = playerTurnFirst ? 'Players' : 'Monsters';
            text += `${winner} win!`;
        } else {
            text += 'Not Rolled';
        }
        initiativeDisplay.textContent = text;
    }
}

function updateCreatureCount() {
    if (creatureCount) {
        const visibleCount = isGM ? 
            Object.keys(creatures).length : 
            Object.values(creatures).filter(c => !c.hidden_from_players).length;
        
        creatureCount.textContent = `Creatures: ${visibleCount}`;
    }
}

// Save and load functions (enhanced with better error handling)
function saveCombatData(reason = 'Unknown') {
    if (!isGM) return;
    
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(() => {
        updateStatus('Saving...', 'saving');
        
        const data = {
            round_count: roundCount,
            player_turn_first: playerTurnFirst,
            initiative_rolled: initiativeRolled,
            creatures: creatures
        };
        
        const formData = new FormData();
        formData.append('action', 'save_combat_data');
        formData.append('data', JSON.stringify(data));
        
        fetch('combat_handler.php', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.text(); // Get text first to debug
        })
        .then(text => {
            try {
                const data = JSON.parse(text);
                if (data.success) {
                    updateStatus('Combat saved', 'saved');
                    lastSaveTime = Date.now();
                    updateLastUpdateTime();
                } else {
                    updateStatus('Save failed: ' + data.error, 'error');
                    console.error('Save failed:', data.error);
                }
            } catch (e) {
                console.error('Invalid JSON response:', text);
                updateStatus('Save failed: Invalid response', 'error');
            }
        })
        .catch(error => {
            updateStatus('Network error', 'error');
            console.error('Network error:', error);
        });
    }, 300);
}

function saveCreaturePosition(creatureId, x, y, status, column) {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'save_position');
    formData.append('creature_id', creatureId);
    formData.append('x', x);
    formData.append('y', y);
    formData.append('status', status);
    formData.append('column', column);
    
    fetch('combat_handler.php', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
    })
    .then(text => {
        try {
            const data = JSON.parse(text);
            if (data.success) {
                updateStatus('Position saved', 'saved');
                updateLastUpdateTime();
            } else {
                updateStatus('Save failed: ' + data.error, 'error');
                console.error('Position save failed:', data.error);
            }
        } catch (e) {
            console.error('Invalid JSON response from save position:', text);
            updateStatus('Position save failed: Invalid response', 'error');
        }
    })
    .catch(error => {
        updateStatus('Network error', 'error');
        console.error('Position save network error:', error);
    });
}

function loadCombatData() {
    const formData = new FormData();
    formData.append('action', 'load_data');
    
    fetch('combat_handler.php', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
    })
    .then(text => {
        try {
            const data = JSON.parse(text);
            if (data.success) {
                if (hasDataChanged(data.data, lastKnownData)) {
                    console.log('Combat data changed, updating display');
                    updateFromCombatData(data.data);
                    
                    updateLastUpdateTime();
                    if (!isGM) {
                        updateStatus('Updated from GM', 'saved');
                        setTimeout(() => {
                            updateStatus('Read-Only Mode - Auto-refreshing every 2 seconds', 'saved');
                        }, 1500);
                    }
                }
            } else {
                console.error('Load failed:', data.error);
                if (!isGM) {
                    updateStatus('Update failed: ' + data.error, 'error');
                }
            }
        } catch (e) {
            console.error('Invalid JSON response from load:', text);
            if (!isGM) {
                updateStatus('Update failed: Invalid response', 'error');
            }
        }
    })
    .catch(error => {
        console.error('Load network error:', error);
        if (!isGM) {
            updateStatus('Connection error', 'error');
        }
    });
}

function hasDataChanged(newData, oldData) {
    return JSON.stringify(newData) !== JSON.stringify(oldData);
}

function updateStatus(message, type) {
    if (saveStatus) {
        saveStatus.textContent = message;
        saveStatus.className = type;
    }
}

function updateLastUpdateTime() {
    if (lastUpdate) {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        lastUpdate.textContent = `Last update: ${timeString}`;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    hideOtherTooltip();
});