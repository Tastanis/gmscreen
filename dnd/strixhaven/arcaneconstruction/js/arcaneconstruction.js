/**
 * Arcane Construction Grid System
 * Full-screen zoomable 12x19 grid with role-based interactions
 */

// Configuration
const GRID_CONFIG = {
    columns: 12,
    rows: 20, // Reduced from 24 to 20 rows
    cellSize: 120, // Increased base cell size for better visibility
    minZoom: 0.3,
    maxZoom: 3.0,
    zoomStep: 0.1
};

// Global state
let gridState = {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    selectedCells: new Set(),
    editableCells: new Map(), // Store GM-editable cell content
    isGM: false, // Will be set from PHP
    currentUser: '', // Will be set from PHP
    connectionMode: false, // Whether GM is in connection mode
    connectionSource: null, // Source cell for connection
    customConnections: new Map(), // Store custom connections
    autoConnections: new Map(), // Store automatic tier connections
    learningMode: false, // Whether Zepha is in learning mode
    learnedSkills: new Set(), // Zepha's learned skills
    isSaving: false, // Save operation in progress
    lastSaveTime: 0, // Timestamp of last save
    refreshInterval: null, // Auto-refresh interval ID
    hasUnsavedChanges: false // Track if user has made changes
};

/**
 * Initialize the grid system
 */
async function initializeGrid() {
    console.log('Initializing Arcane Construction Grid...');
    
    // Get user info from global scope (set by PHP)
    if (typeof window.userRole !== 'undefined') {
        gridState.isGM = window.userRole === 'GM';
        gridState.currentUser = window.userName || '';
    }
    
    // Load data first so it's available when creating cells
    await loadGridData();
    
    createGridStructure();
    setupZoomControls();
    setupEventListeners();
    setupConnectionSystem();
    setupLearningSystem();
    setupSaveSystem();
    createAutoConnections();
    
    // Apply visual state for loaded learned skills after grid is created
    if (gridState.learnedSkills.size > 0) {
        console.log('[INIT] Applying visual state for loaded learned skills:', Array.from(gridState.learnedSkills));
        gridState.learnedSkills.forEach(skillId => {
            const cell = document.getElementById(skillId);
            if (cell) {
                cell.classList.add('learned-skill');
                console.log(`[INIT] Applied learned-skill class to ${skillId}`);
            }
        });
    }
    
    console.log(`Grid initialized for user: ${gridState.currentUser} (GM: ${gridState.isGM})`);
}

/**
 * Create the complete grid structure with all zones
 */
function createGridStructure() {
    const gridContainer = document.getElementById('construction-grid');
    if (!gridContainer) {
        console.error('Grid container not found');
        return;
    }

    // Clear existing content
    gridContainer.innerHTML = '';

    // Create all 240 cells (12x20)
    for (let row = 1; row <= GRID_CONFIG.rows; row++) {
        for (let col = 1; col <= GRID_CONFIG.columns; col++) {
            const cell = createGridCell(row, col);
            gridContainer.appendChild(cell);
        }
    }

    // Setup special zones
    setupSpecialZones();
    
    console.log('Grid structure created with all zones');
}

/**
 * Create individual grid cell
 */
function createGridCell(row, col) {
    const cell = document.createElement('div');
    const cellId = `cell-${row}-${col}`;
    
    cell.className = 'grid-cell empty';
    cell.id = cellId;
    cell.dataset.row = row;
    cell.dataset.col = col;
    cell.style.gridColumn = col;
    cell.style.gridRow = row;
    
    // DEBUG: Log cell creation (only for interactive cells)
    if ((row >= 4 && row <= 9 && col >= 3 && col <= 5) || 
        (row >= 4 && row <= 9 && col >= 9 && col <= 11) ||
        (row >= 14 && row <= 19 && col >= 3 && col <= 5) ||
        (row >= 14 && row <= 19 && col >= 9 && col <= 11)) {
        console.log(`[CREATE] Interactive cell created: ID=${cellId}, dataset.row=${row}, dataset.col=${col}`);
    }
    
    return cell;
}

/**
 * Setup special zones according to specifications
 */
function setupSpecialZones() {
    // Enchanting zone (2-2 to 5-2) - merged across 4 cells
    const enchantingCell = document.getElementById('cell-2-2');
    if (enchantingCell) {
        enchantingCell.className = 'grid-cell label merged enchanting-zone';
        enchantingCell.textContent = 'Enchanting';
        enchantingCell.style.gridColumn = '2 / 6'; // Span columns 2-5
        enchantingCell.style.gridRow = '2 / 3';
        // Hide overlapped cells
        for (let col = 3; col <= 5; col++) {
            const cell = document.getElementById(`cell-2-${col}`);
            if (cell) cell.style.display = 'none';
        }
    }

    // Constructs zone (8-2 to 11-2) - merged across 4 cells
    const constructsCell = document.getElementById('cell-2-8');
    if (constructsCell) {
        constructsCell.className = 'grid-cell label merged constructs-zone';
        constructsCell.textContent = 'Constructs';
        constructsCell.style.gridColumn = '8 / 12'; // Span columns 8-11
        constructsCell.style.gridRow = '2 / 3';
        // Hide overlapped cells
        for (let col = 9; col <= 11; col++) {
            const cell = document.getElementById(`cell-2-${col}`);
            if (cell) cell.style.display = 'none';
        }
    }

    // ENCHANTING SECTION
    // Enchanting tier header (2-3)
    const enchantingTierHeader = document.getElementById('cell-3-2');
    if (enchantingTierHeader) {
        enchantingTierHeader.className = 'grid-cell label tier-header';
        enchantingTierHeader.textContent = 'Tier';
    }

    // Enchanting headers (row 3, horizontal)
    const runeCarving = document.getElementById('cell-3-3');
    if (runeCarving) {
        runeCarving.className = 'grid-cell label rune-carving';
        runeCarving.textContent = 'Rune Carving';
    }

    const inlayLabel = document.getElementById('cell-3-4');
    if (inlayLabel) {
        inlayLabel.className = 'grid-cell label inlay-label';
        inlayLabel.textContent = 'Inlay';
    }

    const focusedArcanum = document.getElementById('cell-3-5');
    if (focusedArcanum) {
        focusedArcanum.className = 'grid-cell label focused-arcanum';
        focusedArcanum.textContent = 'Focused Arcanum';
    }

    // Enchanting tier labels (2-4 to 2-9)
    for (let i = 1; i <= 6; i++) {
        const tierCell = document.getElementById(`cell-${3 + i}-2`);
        if (tierCell) {
            tierCell.className = 'grid-cell label tier-label';
            tierCell.textContent = `Tier ${i}`;
        }
    }

    // CONSTRUCTS SECTION
    // Constructs tier header (8-3)
    const constructsTierHeader = document.getElementById('cell-3-8');
    if (constructsTierHeader) {
        constructsTierHeader.className = 'grid-cell label tier-header';
        constructsTierHeader.textContent = 'Tier';
    }

    // Constructs headers (row 3, horizontal)
    const animationLabel = document.getElementById('cell-3-9');
    if (animationLabel) {
        animationLabel.className = 'grid-cell label animation-label';
        animationLabel.textContent = 'Animation';
    }

    const formLabel = document.getElementById('cell-3-10');
    if (formLabel) {
        formLabel.className = 'grid-cell label form-label';
        formLabel.textContent = 'Form';
    }

    const sentienceLabel = document.getElementById('cell-3-11');
    if (sentienceLabel) {
        sentienceLabel.className = 'grid-cell label sentience-label';
        sentienceLabel.textContent = 'Sentience';
    }

    // Constructs tier labels (8-4 to 8-9)
    for (let i = 1; i <= 6; i++) {
        const tierCell = document.getElementById(`cell-${3 + i}-8`);
        if (tierCell) {
            tierCell.className = 'grid-cell label tier-label';
            tierCell.textContent = `Tier ${i}`;
        }
    }

    // COLOSSAL CONSTRUCTION SECTION (rows 12-19)
    // Colossal Construction zone (2-12 to 5-12) - merged across 4 cells
    const colossalCell = document.getElementById('cell-12-2');
    if (colossalCell) {
        colossalCell.className = 'grid-cell label merged colossal-zone';
        colossalCell.textContent = 'Colossal Construction';
        colossalCell.style.gridColumn = '2 / 6'; // Span columns 2-5
        colossalCell.style.gridRow = '12 / 13';
        // Hide overlapped cells
        for (let col = 3; col <= 5; col++) {
            const cell = document.getElementById(`cell-12-${col}`);
            if (cell) cell.style.display = 'none';
        }
    }

    // Colossal Construction tier header (2-13)
    const colossalTierHeader = document.getElementById('cell-13-2');
    if (colossalTierHeader) {
        colossalTierHeader.className = 'grid-cell label tier-header';
        colossalTierHeader.textContent = 'Tier';
    }

    // Colossal Construction headers (row 13, horizontal)
    const planningLabel = document.getElementById('cell-13-3');
    if (planningLabel) {
        planningLabel.className = 'grid-cell label planning-label';
        planningLabel.textContent = 'Planning';
    }

    const sizeLabel = document.getElementById('cell-13-4');
    if (sizeLabel) {
        sizeLabel.className = 'grid-cell label size-label';
        sizeLabel.textContent = 'Size';
    }

    const efficiencyLabel = document.getElementById('cell-13-5');
    if (efficiencyLabel) {
        efficiencyLabel.className = 'grid-cell label efficiency-label';
        efficiencyLabel.textContent = 'Efficiency';
    }

    // Colossal Construction tier labels (2-14 to 2-19)
    for (let i = 1; i <= 6; i++) {
        const tierCell = document.getElementById(`cell-${13 + i}-2`);
        if (tierCell) {
            tierCell.className = 'grid-cell label tier-label';
            tierCell.textContent = `Tier ${i}`;
        }
    }

    // ARCANE MASTERY SECTION (rows 12-19)
    // Arcane Mastery zone (8-12 to 11-12) - merged across 4 cells
    const arcaneCell = document.getElementById('cell-12-8');
    if (arcaneCell) {
        arcaneCell.className = 'grid-cell label merged arcane-zone';
        arcaneCell.textContent = 'Arcane Mastery';
        arcaneCell.style.gridColumn = '8 / 12'; // Span columns 8-11
        arcaneCell.style.gridRow = '12 / 13';
        // Hide overlapped cells
        for (let col = 9; col <= 11; col++) {
            const cell = document.getElementById(`cell-12-${col}`);
            if (cell) cell.style.display = 'none';
        }
    }

    // Arcane Mastery tier header (8-13)
    const arcaneTierHeader = document.getElementById('cell-13-8');
    if (arcaneTierHeader) {
        arcaneTierHeader.className = 'grid-cell label tier-header';
        arcaneTierHeader.textContent = 'Tier';
    }

    // Arcane Mastery headers (row 13, horizontal)
    const spellsLabel = document.getElementById('cell-13-9');
    if (spellsLabel) {
        spellsLabel.className = 'grid-cell label spells-label';
        spellsLabel.textContent = 'Spells';
    }

    const elementalLabel = document.getElementById('cell-13-10');
    if (elementalLabel) {
        elementalLabel.className = 'grid-cell label elemental-label';
        elementalLabel.textContent = 'Elemental Sculpting';
    }

    const rawArcaneLabel = document.getElementById('cell-13-11');
    if (rawArcaneLabel) {
        rawArcaneLabel.className = 'grid-cell label raw-arcane-label';
        rawArcaneLabel.textContent = 'Raw Arcane';
    }

    // Arcane Mastery tier labels (8-14 to 8-19)
    for (let i = 1; i <= 6; i++) {
        const tierCell = document.getElementById(`cell-${13 + i}-8`);
        if (tierCell) {
            tierCell.className = 'grid-cell label tier-label';
            tierCell.textContent = `Tier ${i}`;
        }
    }

    // Setup interactive grids
    setupInteractiveGrid();
}

/**
 * Setup the interactive button grids for all four sections
 */
function setupInteractiveGrid() {
    // Enchanting section interactive grid (columns 3-5, rows 4-9)
    for (let row = 4; row <= 9; row++) {
        for (let col = 3; col <= 5; col++) {
            const cell = document.getElementById(`cell-${row}-${col}`);
            if (cell) {
                setupInteractiveCell(cell, row, col);
            }
        }
    }
    
    // Constructs section interactive grid (columns 9-11, rows 4-9)
    for (let row = 4; row <= 9; row++) {
        for (let col = 9; col <= 11; col++) {
            const cell = document.getElementById(`cell-${row}-${col}`);
            if (cell) {
                setupInteractiveCell(cell, row, col);
            }
        }
    }
    
    // Colossal Construction section interactive grid (columns 3-5, rows 14-19)
    for (let row = 14; row <= 19; row++) {
        for (let col = 3; col <= 5; col++) {
            const cell = document.getElementById(`cell-${row}-${col}`);
            if (cell) {
                setupInteractiveCell(cell, row, col);
            }
        }
    }
    
    // Arcane Mastery section interactive grid (columns 9-11, rows 14-19)
    for (let row = 14; row <= 19; row++) {
        for (let col = 9; col <= 11; col++) {
            const cell = document.getElementById(`cell-${row}-${col}`);
            if (cell) {
                setupInteractiveCell(cell, row, col);
            }
        }
    }
}

/**
 * Setup individual interactive cell
 */
function setupInteractiveCell(cell, row, col) {
    // Determine which section this cell belongs to
    let section = '';
    if (row >= 4 && row <= 9 && col >= 3 && col <= 5) {
        section = 'enchanting';
    } else if (row >= 4 && row <= 9 && col >= 9 && col <= 11) {
        section = 'constructs';
    } else if (row >= 14 && row <= 19 && col >= 3 && col <= 5) {
        section = 'colossal';
    } else if (row >= 14 && row <= 19 && col >= 9 && col <= 11) {
        section = 'arcane';
    }
    
    if (gridState.isGM) {
        // GM can edit these cells
        cell.className = 'grid-cell editable';
        cell.addEventListener('click', handleGMEdit);
    } else {
        // Zepha can click/highlight these cells
        cell.className = 'grid-cell clickable';
        cell.addEventListener('click', handleZephaClick);
    }
    
    // Add section data attribute for styling
    if (section) {
        cell.setAttribute('data-section', section);
    }
    
    // Load saved content
    const cellKey = `${row}-${col}`;
    const savedContent = gridState.editableCells.get(cellKey);
    if (savedContent) {
        cell.innerHTML = savedContent;
        
        // DEBUG: Log load operation
        console.log(`[LOAD] Cell ${cellKey} (ID: ${cell.id}) loaded with text:`, savedContent);
        console.log(`[LOAD] Cell dataset - row: ${cell.dataset.row}, col: ${cell.dataset.col}`);
    }
}

/**
 * Handle GM editing functionality
 */
function handleGMEdit(event) {
    event.stopPropagation();
    const cell = event.currentTarget;
    
    // If in connection mode, handle connection
    if (gridState.connectionMode) {
        handleConnectionClick(cell);
        return;
    }
    
    // Don't start editing if already editing
    if (cell.classList.contains('editing')) {
        return;
    }
    
    startInlineEdit(cell);
}

/**
 * Handle Zepha clicking functionality with back-propagation and learning
 */
function handleZephaClick(event) {
    const cell = event.currentTarget;
    const cellId = cell.id;
    
    // If in learning mode, toggle learned skill
    if (gridState.learningMode) {
        toggleLearnedSkill(cell, cellId);
        return;
    }
    
    // Clear any existing chain highlighting
    clearChainHighlighting();
    
    // Highlight the clicked cell as target
    cell.classList.add('chain-target');
    
    // Find and highlight all cells that lead to this cell
    const sourceCells = findAllSourceCells(cellId);
    sourceCells.forEach(sourceId => {
        const sourceCell = document.getElementById(sourceId);
        if (sourceCell && sourceCell !== cell) {
            sourceCell.classList.add('chain-source');
        }
    });
    
    console.log(`Cell ${cell.dataset.row}-${cell.dataset.col} clicked by Zepha, found ${sourceCells.length} source cells`);
}

/**
 * Start inline editing for a cell
 */
function startInlineEdit(cell) {
    const row = cell.dataset.row;
    const col = cell.dataset.col;
    const currentText = cell.innerHTML; // Use innerHTML to preserve formatting
    
    // Mark cell as editing
    cell.classList.add('editing');
    
    // Create textarea for editing
    const textarea = document.createElement('textarea');
    textarea.className = 'inline-editor';
    textarea.value = htmlToText(currentText); // Convert HTML to text with newlines
    
    // Clear cell and add textarea
    cell.innerHTML = '';
    cell.appendChild(textarea);
    
    // Focus and select text
    textarea.focus();
    textarea.select();
    
    // Store original content for cancel
    textarea.dataset.originalContent = currentText;
    
    // Add event listeners
    textarea.addEventListener('blur', () => finishInlineEdit(cell, textarea, true));
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            finishInlineEdit(cell, textarea, true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishInlineEdit(cell, textarea, false);
        }
    });
}

/**
 * Finish inline editing
 */
function finishInlineEdit(cell, textarea, save) {
    const row = cell.dataset.row;
    const col = cell.dataset.col;
    
    if (save) {
        const newText = textarea.value.trim();
        const formattedText = textToHtml(newText); // Convert text to HTML with formatting
        
        // Update cell content
        cell.innerHTML = formattedText;
        
        // Save to state
        const cellKey = `${row}-${col}`;
        gridState.editableCells.set(cellKey, formattedText);
        gridState.hasUnsavedChanges = true;
        
        // DEBUG: Log save operation
        console.log(`[SAVE] Cell ${cellKey} (ID: ${cell.id}) saved with text:`, formattedText);
        console.log(`[SAVE] Cell dataset - row: ${cell.dataset.row}, col: ${cell.dataset.col}`);
        
        // Update save button to indicate unsaved changes
        updateSaveButtonState();
        
        // Text editing complete - use manual save button to persist
    } else {
        // Restore original content
        cell.innerHTML = textarea.dataset.originalContent;
    }
    
    // Remove editing state
    cell.classList.remove('editing');
}

/**
 * Convert HTML to plain text with newlines
 */
function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Convert <br> to newlines
    temp.innerHTML = temp.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    
    // Convert list items to bullet points
    temp.innerHTML = temp.innerHTML.replace(/<li>/gi, '• ').replace(/<\/li>/gi, '\n');
    temp.innerHTML = temp.innerHTML.replace(/<\/?ul>/gi, '');
    
    return temp.textContent || temp.innerText || '';
}

/**
 * Convert plain text to HTML with formatting
 */
function textToHtml(text) {
    if (!text) return '';
    
    // Split by lines
    const lines = text.split('\n');
    const processedLines = [];
    
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        // Convert bullet points
        if (line.startsWith('• ') || line.startsWith('* ')) {
            line = '<li>' + line.substring(2) + '</li>';
        }
        
        processedLines.push(line);
    }
    
    // Group consecutive list items
    let result = '';
    let inList = false;
    
    for (let line of processedLines) {
        if (line.startsWith('<li>')) {
            if (!inList) {
                result += '<ul>';
                inList = true;
            }
            result += line;
        } else {
            if (inList) {
                result += '</ul>';
                inList = false;
            }
            if (result) result += '<br>';
            result += line;
        }
    }
    
    if (inList) {
        result += '</ul>';
    }
    
    return result;
}

/**
 * Find all cells that have arrows pointing to the target cell (recursive back-propagation)
 */
function findAllSourceCells(targetId, visited = new Set()) {
    if (visited.has(targetId)) {
        return []; // Prevent infinite loops
    }
    visited.add(targetId);
    
    const sources = new Set();
    
    // Check auto connections (tier connections)
    gridState.autoConnections.forEach(connection => {
        if (connection.target === targetId) {
            sources.add(connection.source);
            // Recursively find sources of this source
            const nestedSources = findAllSourceCells(connection.source, visited);
            nestedSources.forEach(id => sources.add(id));
        }
    });
    
    // Check custom connections
    gridState.customConnections.forEach(connection => {
        if (connection.target === targetId) {
            sources.add(connection.source);
            // Recursively find sources of this source
            const nestedSources = findAllSourceCells(connection.source, visited);
            nestedSources.forEach(id => sources.add(id));
        }
    });
    
    return Array.from(sources);
}

/**
 * Clear all chain highlighting
 */
function clearChainHighlighting() {
    const targetCells = document.querySelectorAll('.grid-cell.chain-target');
    const sourceCells = document.querySelectorAll('.grid-cell.chain-source');
    
    targetCells.forEach(cell => {
        cell.classList.remove('chain-target');
    });
    
    sourceCells.forEach(cell => {
        cell.classList.remove('chain-source');
    });
}

/**
 * Setup connection system for GM
 */
function setupConnectionSystem() {
    if (!gridState.isGM) return;
    
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', toggleConnectionMode);
    }
}

/**
 * Setup learning system for Zepha
 */
function setupLearningSystem() {
    if (gridState.isGM) return;
    
    const learnBtn = document.getElementById('learn-skill-btn');
    if (learnBtn) {
        learnBtn.addEventListener('click', toggleLearningMode);
    }
}

/**
 * Setup save system for both users
 */
function setupSaveSystem() {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSave);
    }
    
    // Auto-refresh disabled - page now behaves as static page
    // User must manually refresh page to see other user's changes
    console.log('[SETUP] Auto-refresh system disabled for static page behavior');
}

/**
 * Toggle learning mode for Zepha
 */
function toggleLearningMode() {
    gridState.learningMode = !gridState.learningMode;
    const learnBtn = document.getElementById('learn-skill-btn');
    
    if (gridState.learningMode) {
        learnBtn.classList.add('active');
        learnBtn.textContent = 'Exit Learning';
        
        // Add learning mode indicator to all clickable cells
        const clickableCells = document.querySelectorAll('.grid-cell.clickable');
        clickableCells.forEach(cell => {
            if (!cell.classList.contains('learned-skill')) {
                cell.classList.add('learning-mode');
            }
        });
    } else {
        learnBtn.classList.remove('active');
        learnBtn.textContent = 'Learn Skill';
        
        // Remove learning mode indicators
        const learningCells = document.querySelectorAll('.grid-cell.learning-mode');
        learningCells.forEach(cell => {
            cell.classList.remove('learning-mode');
        });
    }
}

/**
 * Toggle learned skill for Zepha
 */
function toggleLearnedSkill(cell, cellId) {
    const wasLearned = gridState.learnedSkills.has(cellId);
    
    if (wasLearned) {
        // Remove learned skill
        gridState.learnedSkills.delete(cellId);
        cell.classList.remove('learned-skill');
        cell.classList.add('learning-mode');
        console.log(`[ZEPHA] Skill ${cellId} unlearned`);
    } else {
        // Add learned skill
        gridState.learnedSkills.add(cellId);
        cell.classList.add('learned-skill');
        cell.classList.remove('learning-mode');
        console.log(`[ZEPHA] Skill ${cellId} learned`);
    }
    
    gridState.hasUnsavedChanges = true;
    updateSaveButtonState();
}

/**
 * Update save button state to show unsaved changes
 */
function updateSaveButtonState() {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        if (gridState.hasUnsavedChanges && !gridState.isSaving) {
            saveBtn.textContent = 'Save Changes*';
            saveBtn.style.backgroundColor = '#ff6b6b';
            saveBtn.style.color = 'white';
        } else {
            saveBtn.textContent = 'Save Grid';
            saveBtn.style.backgroundColor = '';
            saveBtn.style.color = '';
        }
    }
}

/**
 * Handle save button click
 */
async function handleSave() {
    if (gridState.isSaving) {
        console.log('[SAVE] Save already in progress - ignoring click');
        return; // Prevent double-clicking
    }
    
    gridState.isSaving = true;
    const saveBtn = document.getElementById('save-btn');
    const saveStatus = document.getElementById('save-status');
    
    saveBtn.disabled = true;
    saveStatus.textContent = 'Saving...';
    
    // Update button immediately
    saveBtn.textContent = 'Saving...';
    saveBtn.style.backgroundColor = '#ffa726';
    
    try {
        let success = false;
        if (gridState.isGM) {
            success = await saveGMDataReliably();
        } else {
            success = await saveZephaDataReliably();
        }
        
        if (success) {
            saveStatus.textContent = 'Saved!';
            gridState.hasUnsavedChanges = false;
            updateSaveButtonState();
            setTimeout(() => {
                if (saveStatus) saveStatus.textContent = '';
            }, 2000);
        } else {
            throw new Error('Save operation returned false');
        }
        
    } catch (error) {
        console.error('Save failed:', error);
        saveStatus.textContent = 'Save failed! Try again.';
        setTimeout(() => {
            if (saveStatus) saveStatus.textContent = '';
        }, 5000);
    } finally {
        gridState.isSaving = false;
        if (saveBtn) {
            saveBtn.disabled = false;
        }
        gridState.lastSaveTime = Date.now();
        updateSaveButtonState();
    }
}

/**
 * Toggle connection mode
 */
function toggleConnectionMode() {
    gridState.connectionMode = !gridState.connectionMode;
    const connectBtn = document.getElementById('connect-btn');
    
    if (gridState.connectionMode) {
        connectBtn.classList.add('active');
        connectBtn.textContent = 'Exit Connect';
        clearConnectionSource();
    } else {
        connectBtn.classList.remove('active');
        connectBtn.textContent = 'Connect';
        clearConnectionSource();
    }
}

/**
 * Handle connection click
 */
function handleConnectionClick(cell) {
    const cellId = cell.id;
    
    if (!gridState.connectionSource) {
        // First click - set source
        gridState.connectionSource = cellId;
        cell.classList.add('connect-source');
    } else if (gridState.connectionSource === cellId) {
        // Clicking same cell - cancel
        clearConnectionSource();
    } else {
        // Second click - create connection
        createCustomConnection(gridState.connectionSource, cellId);
        clearConnectionSource();
    }
}

/**
 * Clear connection source
 */
function clearConnectionSource() {
    if (gridState.connectionSource) {
        const sourceCell = document.getElementById(gridState.connectionSource);
        if (sourceCell) {
            sourceCell.classList.remove('connect-source');
        }
        gridState.connectionSource = null;
    }
}

/**
 * Create custom connection between two cells (or remove if duplicate)
 */
function createCustomConnection(sourceId, targetId) {
    const connectionId = `${sourceId}-to-${targetId}`;
    
    // Check if connection already exists
    if (gridState.customConnections.has(connectionId)) {
        // Remove existing connection
        removeCustomConnection(sourceId, targetId);
        // Immediately save after removing connection
        gridState.hasUnsavedChanges = true;
        updateSaveButtonState();
        console.log(`[GM CONNECT] Connection removed: ${connectionId}`);
    } else {
        // Create new connection
        gridState.customConnections.set(connectionId, {
            source: sourceId,
            target: targetId,
            type: 'custom'
        });
        
        drawArrow(sourceId, targetId, 'arrow-line');
        // Immediately mark as unsaved changes and prompt to save
        gridState.hasUnsavedChanges = true;
        updateSaveButtonState();
        console.log(`[GM CONNECT] Connection created: ${connectionId} - marked for save`);
    }
}

/**
 * Remove custom connection between two cells
 */
function removeCustomConnection(sourceId, targetId) {
    const connectionId = `${sourceId}-to-${targetId}`;
    
    // Remove from state
    gridState.customConnections.delete(connectionId);
    
    // Remove visual arrow
    const svg = document.getElementById('arrow-overlay');
    if (svg) {
        const line = svg.querySelector(`line[data-connection="${connectionId}"]`);
        if (line) {
            line.remove();
        }
    }
    
    console.log(`[GM CONNECT] Arrow removed from UI: ${connectionId}`);
}

/**
 * Create automatic tier connections
 */
function createAutoConnections() {
    // Enchanting section (columns 3-5, rows 4-9)
    createTierConnections(3, 5, 4, 9);
    
    // Constructs section (columns 9-11, rows 4-9)
    createTierConnections(9, 11, 4, 9);
    
    // Colossal Construction section (columns 3-5, rows 14-19)
    createTierConnections(3, 5, 14, 19);
    
    // Arcane Mastery section (columns 9-11, rows 14-19)
    createTierConnections(9, 11, 14, 19);
}

/**
 * Create tier connections for a section
 */
function createTierConnections(startCol, endCol, startRow, endRow) {
    for (let col = startCol; col <= endCol; col++) {
        for (let row = startRow; row < endRow; row++) {
            const sourceId = `cell-${row}-${col}`;
            const targetId = `cell-${row + 1}-${col}`;
            
            const connectionId = `${sourceId}-to-${targetId}`;
            gridState.autoConnections.set(connectionId, {
                source: sourceId,
                target: targetId,
                type: 'auto'
            });
            
            drawArrow(sourceId, targetId, 'auto-arrow-line');
        }
    }
}

/**
 * Draw arrow between two cells using grid coordinates
 */
function drawArrow(sourceId, targetId, className) {
    const svg = document.getElementById('arrow-overlay');
    if (!svg) return;
    
    // Extract row and column from cell IDs
    const sourceMatch = sourceId.match(/cell-(\d+)-(\d+)/);
    const targetMatch = targetId.match(/cell-(\d+)-(\d+)/);
    
    if (!sourceMatch || !targetMatch) return;
    
    const sourceRow = parseInt(sourceMatch[1]);
    const sourceCol = parseInt(sourceMatch[2]);
    const targetRow = parseInt(targetMatch[1]);
    const targetCol = parseInt(targetMatch[2]);
    
    // Calculate grid positions (center of cells)
    const cellWidth = 120;
    const cellHeight = 100;
    
    const sourceX = (sourceCol - 1) * cellWidth + cellWidth / 2;
    const sourceY = (sourceRow - 1) * cellHeight + cellHeight / 2;
    const targetX = (targetCol - 1) * cellWidth + cellWidth / 2;
    const targetY = (targetRow - 1) * cellHeight + cellHeight / 2;
    
    // Create arrow line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', sourceX);
    line.setAttribute('y1', sourceY);
    line.setAttribute('x2', targetX);
    line.setAttribute('y2', targetY);
    line.setAttribute('class', className);
    line.setAttribute('data-connection', `${sourceId}-to-${targetId}`);
    
    svg.appendChild(line);
}

/**
 * Redraw all arrows (used only when loading data, not for transforms)
 */
function redrawAllArrows() {
    const svg = document.getElementById('arrow-overlay');
    if (!svg) return;
    
    // Clear existing arrows
    const lines = svg.querySelectorAll('line');
    lines.forEach(line => line.remove());
    
    // Redraw custom connections
    gridState.customConnections.forEach(connection => {
        drawArrow(connection.source, connection.target, 'arrow-line');
    });
    
    // Redraw auto connections
    gridState.autoConnections.forEach(connection => {
        drawArrow(connection.source, connection.target, 'auto-arrow-line');
    });
}

/**
 * Setup zoom and pan controls
 */
function setupZoomControls() {
    const viewport = document.querySelector('.grid-viewport');
    const container = document.querySelector('.grid-container');
    
    if (!viewport || !container) return;
    
    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? -GRID_CONFIG.zoomStep : GRID_CONFIG.zoomStep;
        const newZoom = Math.max(GRID_CONFIG.minZoom, Math.min(GRID_CONFIG.maxZoom, gridState.zoom + delta));
        
        if (newZoom !== gridState.zoom) {
            gridState.zoom = newZoom;
            updateGridTransform();
            updateZoomIndicator();
        }
    });
    
    // Mouse drag for panning
    viewport.addEventListener('mousedown', (e) => {
        gridState.isDragging = true;
        gridState.lastMouseX = e.clientX;
        gridState.lastMouseY = e.clientY;
        viewport.style.cursor = 'grabbing';
    });
    
    viewport.addEventListener('mousemove', (e) => {
        if (!gridState.isDragging) return;
        
        const deltaX = e.clientX - gridState.lastMouseX;
        const deltaY = e.clientY - gridState.lastMouseY;
        
        gridState.panX += deltaX;
        gridState.panY += deltaY;
        gridState.lastMouseX = e.clientX;
        gridState.lastMouseY = e.clientY;
        
        updateGridTransform();
    });
    
    viewport.addEventListener('mouseup', () => {
        gridState.isDragging = false;
        viewport.style.cursor = 'grab';
    });
    
    viewport.addEventListener('mouseleave', () => {
        gridState.isDragging = false;
        viewport.style.cursor = 'grab';
    });
}

/**
 * Update grid transform for zoom and pan
 */
function updateGridTransform() {
    const container = document.querySelector('.grid-container');
    if (!container) return;
    
    const transform = `translate(calc(-50% + ${gridState.panX}px), calc(-50% + ${gridState.panY}px)) scale(${gridState.zoom})`;
    container.style.transform = transform;
    
    // SVG now inherits transform from container automatically - no separate transform needed
}

/**
 * Update zoom indicator
 */
function updateZoomIndicator() {
    let indicator = document.querySelector('.zoom-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'zoom-indicator';
        document.querySelector('.arcane-main').appendChild(indicator);
    }
    
    indicator.textContent = `Zoom: ${Math.round(gridState.zoom * 100)}%`;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Escape key to clear selections (Zepha only)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !gridState.isGM) {
            clearSelections();
        }
    });
    
    // Click on empty areas to clear highlighting (Zepha only)
    document.addEventListener('click', (e) => {
        if (!gridState.isGM && !e.target.closest('.grid-cell.clickable')) {
            clearChainHighlighting();
        }
    });
    
    // Add instructions
    addInstructions();
}

/**
 * Add instructions overlay
 */
function addInstructions() {
    const instructions = document.createElement('div');
    instructions.className = 'grid-instructions';
    
    if (gridState.isGM) {
        instructions.innerHTML = `
            <strong>GM Controls:</strong><br>
            • Mouse wheel: Zoom in/out<br>
            • Click & drag: Pan view<br>
            • Click blue cells: Edit inline<br>
            • Enter: Save, Esc: Cancel<br>
            • Use * or • for bullets, Enter for new lines
        `;
    } else {
        instructions.innerHTML = `
            <strong>Controls:</strong><br>
            • Mouse wheel: Zoom in/out<br>
            • Click & drag: Pan view<br>
            • Click purple cells: Select/deselect<br>
            • ESC: Clear selections
        `;
    }
    
    document.querySelector('.arcane-main').appendChild(instructions);
}

/**
 * Clear all selections and chain highlighting (Zepha only)
 */
function clearSelections() {
    gridState.selectedCells.forEach(cellId => {
        const cell = document.getElementById(cellId);
        if (cell) {
            cell.classList.remove('selected');
        }
    });
    gridState.selectedCells.clear();
    clearChainHighlighting();
}

/**
 * Save GM data (text and arrows) - Legacy function kept for compatibility
 */
async function saveGMData() {
    return await saveGMDataReliably();
}

/**
 * Save GM data with enhanced reliability and error handling
 */
async function saveGMDataReliably() {
    console.log('[SAVE] Starting GM data save operation');
    
    // Create a snapshot of data to save to prevent race conditions
    const cellsSnapshot = new Map(gridState.editableCells);
    const connectionsSnapshot = new Map(gridState.customConnections);
    
    const data = {
        editableCells: Object.fromEntries(cellsSnapshot),
        customConnections: Object.fromEntries(connectionsSnapshot),
        timestamp: new Date().toISOString(),
        user: 'GM'
    };
    
    // DEBUG: Log save data
    console.log('[SAVE] GM data snapshot being saved:');
    for (const [key, value] of cellsSnapshot) {
        console.log(`  Cell ${key}: "${value}"`);
    }
    console.log(`[SAVE] Total cells: ${cellsSnapshot.size}, connections: ${connectionsSnapshot.size}`);
    
    try {
        const response = await fetch('save_gm_data.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            console.log('[SAVE] GM data saved successfully to server');
            return true;
        } else {
            console.error('[SAVE] Server rejected GM data save:', result.error || 'Unknown error');
            throw new Error(result.error || 'Server rejected save');
        }
        
    } catch (error) {
        console.error('[SAVE] Error saving GM data to server:', error);
        
        // Fallback to localStorage as backup
        try {
            localStorage.setItem('arcaneGMData_backup', JSON.stringify(data));
            console.log('[SAVE] GM data backed up to localStorage');
        } catch (storageError) {
            console.error('[SAVE] Failed to backup to localStorage:', storageError);
        }
        
        return false; // Save failed
    }
}

/**
 * Save Zepha data (learned skills) - Legacy function kept for compatibility
 */
async function saveZephaData() {
    return await saveZephaDataReliably();
}

/**
 * Save Zepha data with enhanced reliability and error handling
 */
async function saveZephaDataReliably() {
    console.log('[SAVE] Starting Zepha data save operation');
    
    // Capture the learned skills at save time to prevent race conditions
    const learnedSkillsSnapshot = Array.from(gridState.learnedSkills);
    console.log('[SAVE] Zepha skills snapshot for save:', learnedSkillsSnapshot);
    
    const data = {
        learnedSkills: learnedSkillsSnapshot,
        timestamp: new Date().toISOString(),
        user: 'zepha'
    };
    
    console.log('[SAVE] Zepha data being sent to server:', data);
    
    try {
        const response = await fetch('save_zepha_data.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            console.log('[SAVE] Zepha data saved successfully to server');
            
            // Verify that our local state matches what we just saved
            const currentSkills = Array.from(gridState.learnedSkills).sort();
            const savedSkills = learnedSkillsSnapshot.sort();
            const skillsMatch = JSON.stringify(currentSkills) === JSON.stringify(savedSkills);
            
            if (!skillsMatch) {
                console.warn('[SAVE] Warning: Local skills changed during save operation');
                console.warn('[SAVE] Current:', currentSkills);
                console.warn('[SAVE] Saved:', savedSkills);
            }
            
            return true;
        } else {
            console.error('[SAVE] Server rejected Zepha data save:', result.error || 'Unknown error');
            throw new Error(result.error || 'Server rejected save');
        }
        
    } catch (error) {
        console.error('[SAVE] Error saving Zepha data to server:', error);
        
        // Fallback to localStorage as backup
        try {
            localStorage.setItem('arcaneZephaData_backup', JSON.stringify(data));
            console.log('[SAVE] Zepha data backed up to localStorage');
        } catch (storageError) {
            console.error('[SAVE] Failed to backup to localStorage:', storageError);
        }
        
        return false; // Save failed
    }
}

/**
 * Wait for save lock to be released
 */
async function waitForSaveLock() {
    let attempts = 0;
    while (attempts < 10) { // Max 5 seconds wait
        try {
            const response = await fetch('check_save_lock.php');
            const result = await response.json();
            
            if (!result.locked || (Date.now() - result.timestamp) > 10000) {
                // No lock or expired lock
                return;
            }
            
            // Wait 500ms and try again
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        } catch (error) {
            console.error('Error checking save lock:', error);
            return; // Proceed anyway if check fails
        }
    }
}

/**
 * Load shared data from server (both GM and Zepha data)
 */
async function loadGridData() {
    await loadSharedData();
}

/**
 * Auto-refresh system DISABLED
 * Previously started smart refresh system that adapted to save operations.
 * Now disabled to prevent interference with GM arrow drawing and provide static page behavior.
 * Users can manually refresh the page to get updates from other users.
 */
function startSmartRefresh() {
    console.log('[REFRESH] Auto-refresh system permanently disabled');
    console.log('[REFRESH] Page now behaves as static - manual refresh required for updates');
    
    // Clear any existing interval to ensure nothing runs
    if (gridState.refreshInterval) {
        clearInterval(gridState.refreshInterval);
        gridState.refreshInterval = null;
    }
    
    // DO NOT START ANY AUTO-REFRESH INTERVALS
    // This function is now essentially a no-op to prevent arrows from disappearing
}

/**
 * Load shared data (called periodically and on init)
 */
async function loadSharedData() {
    // Additional safety checks
    if (gridState.isSaving) {
        console.log('[LOAD] Skipping data reload - save operation in progress');
        return;
    }
    
    try {
        const response = await fetch('load_shared_data.php');
        
        if (response.ok) {
            const data = await response.json();
            
            // Load GM data (visible to both users)
            if (data.gm_data) {
                if (data.gm_data.editableCells) {
                    // CRITICAL FIX: Don't overwrite local changes if user has unsaved changes
                    const serverCells = new Map(Object.entries(data.gm_data.editableCells));
                    const timeSinceLastSave = Date.now() - gridState.lastSaveTime;
                    
                    if (gridState.hasUnsavedChanges && timeSinceLastSave > 3000) {
                        console.log('[LOAD] Preserving unsaved GM cell changes - not overwriting local data');
                        
                        // Only update cells that don't have local changes
                        // Keep local changes, merge in server changes for other cells
                        for (const [key, value] of serverCells) {
                            if (!gridState.editableCells.has(key)) {
                                gridState.editableCells.set(key, value);
                                console.log(`[LOAD] Added new server cell ${key}: ${value}`);
                            }
                        }
                    } else {
                        // Safe to update - no local changes or just saved
                        gridState.editableCells = serverCells;
                        
                        // DEBUG: Log loaded data
                        console.log('[LOAD] GM data loaded from server:');
                        for (const [key, value] of gridState.editableCells) {
                            console.log(`  Cell ${key}: ${value}`);
                        }
                        
                        // Apply loaded data to UI cells that exist
                        gridState.editableCells.forEach((content, cellKey) => {
                            const cellId = `cell-${cellKey}`;
                            const cell = document.getElementById(cellId);
                            if (cell && cell.classList.contains('editable')) {
                                if (cell.innerHTML !== content) {
                                    cell.innerHTML = content;
                                    console.log(`[LOAD] Updated UI for cell ${cellKey} with: ${content}`);
                                }
                            }
                        });
                    }
                }
                if (data.gm_data.customConnections) {
                    // Clear existing custom connections
                    const svg = document.getElementById('arrow-overlay');
                    if (svg) {
                        const customLines = svg.querySelectorAll('.arrow-line');
                        customLines.forEach(line => line.remove());
                    }
                    
                    gridState.customConnections = new Map(Object.entries(data.gm_data.customConnections));
                    // Redraw custom connections
                    gridState.customConnections.forEach(connection => {
                        drawArrow(connection.source, connection.target, 'arrow-line');
                    });
                }
            }
            
            // Load Zepha data (visible to both users)
            if (data.zepha_data && data.zepha_data.learnedSkills) {
                const serverSkills = new Set(data.zepha_data.learnedSkills);
                const timeSinceLastSave = Date.now() - gridState.lastSaveTime;
                
                // Don't overwrite local changes if:
                // 1. We have unsaved local skills AND haven't saved recently (more than 3 seconds ago)
                // 2. OR we just saved recently (less than 30 seconds ago) and have local skills
                const hasUnsavedChanges = gridState.learnedSkills.size > 0 && 
                    (gridState.lastSaveTime === 0 || timeSinceLastSave > 3000);
                const justSaved = gridState.lastSaveTime > 0 && timeSinceLastSave < 30000;
                
                if (hasUnsavedChanges && !justSaved) {
                    console.log('[LOAD] Preserving unsaved learned skills changes');
                } else if (justSaved && gridState.learnedSkills.size > 0) {
                    console.log('[LOAD] Preserving recently saved skills - not overwriting with server data yet');
                } else {
                    // Safe to update from server
                    // Clear existing learned skill highlighting
                    const learnedCells = document.querySelectorAll('.grid-cell.learned-skill');
                    learnedCells.forEach(cell => cell.classList.remove('learned-skill'));
                    
                    gridState.learnedSkills = serverSkills;
                    // Apply learned skill highlighting
                    gridState.learnedSkills.forEach(skillId => {
                        const cell = document.getElementById(skillId);
                        if (cell) {
                            cell.classList.add('learned-skill');
                        }
                    });
                    
                    console.log('[LOAD] Zepha learned skills updated from server:', Array.from(gridState.learnedSkills));
                }
                
                // Always ensure visual state matches internal state (for page refresh scenarios)
                if (gridState.learnedSkills.size > 0) {
                    gridState.learnedSkills.forEach(skillId => {
                        const cell = document.getElementById(skillId);
                        if (cell && !cell.classList.contains('learned-skill')) {
                            cell.classList.add('learned-skill');
                            console.log(`[VISUAL] Applied learned-skill class to ${skillId}`);
                        }
                    });
                }
            }
            
            console.log('Shared data loaded from server');
            return;
        }
    } catch (error) {
        console.error('Error loading shared data:', error);
    }
    
    // Fallback to localStorage
    const gmData = localStorage.getItem('arcaneGMData');
    const zephaData = localStorage.getItem('arcaneZephaData');
    
    if (gmData) {
        const data = JSON.parse(gmData);
        if (data.editableCells) {
            gridState.editableCells = new Map(Object.entries(data.editableCells));
        }
        if (data.customConnections) {
            gridState.customConnections = new Map(Object.entries(data.customConnections));
            gridState.customConnections.forEach(connection => {
                drawArrow(connection.source, connection.target, 'arrow-line');
            });
        }
    }
    
    if (zephaData) {
        const data = JSON.parse(zephaData);
        if (data.learnedSkills) {
            gridState.learnedSkills = new Set(data.learnedSkills);
            gridState.learnedSkills.forEach(skillId => {
                const cell = document.getElementById(skillId);
                if (cell) {
                    cell.classList.add('learned-skill');
                }
            });
        }
    }
    
    console.log('Shared data loaded from localStorage');
}

/**
 * Helper function to compare two Sets for equality
 */
function setsEqual(set1, set2) {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
        if (!set2.has(item)) return false;
    }
    return true;
}

// Global functions (none needed for inline editing)

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Add zoom indicator on load
    updateZoomIndicator();
});