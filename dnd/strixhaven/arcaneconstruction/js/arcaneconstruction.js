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
    currentUser: '' // Will be set from PHP
};

/**
 * Initialize the grid system
 */
function initializeGrid() {
    console.log('Initializing Arcane Construction Grid...');
    
    // Get user info from global scope (set by PHP)
    if (typeof window.userRole !== 'undefined') {
        gridState.isGM = window.userRole === 'GM';
        gridState.currentUser = window.userName || '';
    }
    
    createGridStructure();
    setupZoomControls();
    setupEventListeners();
    loadGridData();
    
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
    }
}

/**
 * Handle GM editing functionality
 */
function handleGMEdit(event) {
    event.stopPropagation();
    const cell = event.currentTarget;
    
    // Don't start editing if already editing
    if (cell.classList.contains('editing')) {
        return;
    }
    
    startInlineEdit(cell);
}

/**
 * Handle Zepha clicking functionality
 */
function handleZephaClick(event) {
    const cell = event.currentTarget;
    const cellId = cell.id;
    
    // Toggle selection
    if (gridState.selectedCells.has(cellId)) {
        gridState.selectedCells.delete(cellId);
        cell.classList.remove('selected');
    } else {
        gridState.selectedCells.add(cellId);
        cell.classList.add('selected');
    }
    
    console.log(`Cell ${cell.dataset.row}-${cell.dataset.col} selected by Zepha`);
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
        
        // Save to server
        saveGridData();
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
    
    container.style.transform = `translate(calc(-50% + ${gridState.panX}px), calc(-50% + ${gridState.panY}px)) scale(${gridState.zoom})`;
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
 * Clear all selections (Zepha only)
 */
function clearSelections() {
    gridState.selectedCells.forEach(cellId => {
        const cell = document.getElementById(cellId);
        if (cell) {
            cell.classList.remove('selected');
        }
    });
    gridState.selectedCells.clear();
}

/**
 * Save grid data to server
 */
async function saveGridData() {
    const data = {
        editableCells: Object.fromEntries(gridState.editableCells),
        timestamp: new Date().toISOString()
    };
    
    try {
        const response = await fetch('save_grid_data.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            console.log('Grid data saved successfully');
        } else {
            console.error('Failed to save grid data');
        }
    } catch (error) {
        console.error('Error saving grid data:', error);
        // Fallback to localStorage
        localStorage.setItem('arcaneGridData', JSON.stringify(data));
    }
}

/**
 * Load grid data from server
 */
async function loadGridData() {
    try {
        const response = await fetch('load_grid_data.php');
        
        if (response.ok) {
            const data = await response.json();
            if (data.editableCells) {
                gridState.editableCells = new Map(Object.entries(data.editableCells));
                console.log('Grid data loaded from server');
                return;
            }
        }
    } catch (error) {
        console.error('Error loading grid data:', error);
    }
    
    // Fallback to localStorage
    const savedData = localStorage.getItem('arcaneGridData');
    if (savedData) {
        const data = JSON.parse(savedData);
        if (data.editableCells) {
            gridState.editableCells = new Map(Object.entries(data.editableCells));
            console.log('Grid data loaded from localStorage');
        }
    }
}

// Global functions (none needed for inline editing)

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Add zoom indicator on load
    updateZoomIndicator();
});