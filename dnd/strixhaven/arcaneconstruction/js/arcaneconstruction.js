/**
 * Arcane Construction Grid System
 * Full-screen zoomable 12x19 grid with role-based interactions
 */

// Configuration
const GRID_CONFIG = {
    columns: 12,
    rows: 19,
    cellSize: 60, // Base cell size in pixels
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

    // Create all 228 cells (12x19)
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
    // Enchanting zone (2-2 to 5-2)
    const enchantingCell = document.getElementById('cell-2-2');
    if (enchantingCell) {
        enchantingCell.className = 'grid-cell label merged enchanting-zone';
        enchantingCell.textContent = 'Enchanting';
        // Hide overlapped cells
        for (let col = 3; col <= 5; col++) {
            const cell = document.getElementById(`cell-2-${col}`);
            if (cell) cell.style.display = 'none';
        }
    }

    // Constructs zone (8-2 to 11-2)
    const constructsCell = document.getElementById('cell-2-8');
    if (constructsCell) {
        constructsCell.className = 'grid-cell label merged constructs-zone';
        constructsCell.textContent = 'Constructs';
        // Hide overlapped cells
        for (let col = 9; col <= 11; col++) {
            const cell = document.getElementById(`cell-2-${col}`);
            if (cell) cell.style.display = 'none';
        }
    }

    // Tier header and labels (2-3 to 2-9)
    const tierHeader = document.getElementById('cell-3-2');
    if (tierHeader) {
        tierHeader.className = 'grid-cell label tier-header';
        tierHeader.textContent = 'Tier';
    }

    // Tier 1-6 labels
    for (let i = 1; i <= 6; i++) {
        const tierCell = document.getElementById(`cell-${3 + i}-2`);
        if (tierCell) {
            tierCell.className = 'grid-cell label';
            tierCell.textContent = `Tier ${i}`;
        }
    }

    // Special labels
    const runeCarving = document.getElementById('cell-3-3');
    if (runeCarving) {
        runeCarving.className = 'grid-cell label rune-carving';
        runeCarving.textContent = 'Rune Carving';
    }

    const inlayLabel = document.getElementById('cell-4-3');
    if (inlayLabel) {
        inlayLabel.className = 'grid-cell label inlay-label';
        inlayLabel.textContent = 'Inlay';
    }

    const focusedArcanum = document.getElementById('cell-5-3');
    if (focusedArcanum) {
        focusedArcanum.className = 'grid-cell label focused-arcanum';
        focusedArcanum.textContent = 'Focused Arcanum';
    }

    // Interactive button grid (3-4 to 5-9, columns 4-9)
    setupInteractiveGrid();
}

/**
 * Setup the interactive button grid (3-4 to 5-9)
 */
function setupInteractiveGrid() {
    for (let row = 4; row <= 9; row++) {
        for (let col = 3; col <= 5; col++) {
            const cell = document.getElementById(`cell-${row}-${col}`);
            if (cell) {
                if (gridState.isGM) {
                    // GM can edit these cells
                    cell.className = 'grid-cell editable';
                    cell.addEventListener('click', handleGMEdit);
                } else {
                    // Zepha can click/highlight these cells
                    cell.className = 'grid-cell clickable';
                    cell.addEventListener('click', handleZephaClick);
                }
                
                // Load saved content
                const cellKey = `${row}-${col}`;
                const savedContent = gridState.editableCells.get(cellKey);
                if (savedContent) {
                    cell.textContent = savedContent;
                }
            }
        }
    }
}

/**
 * Handle GM editing functionality
 */
function handleGMEdit(event) {
    const cell = event.currentTarget;
    const row = cell.dataset.row;
    const col = cell.dataset.col;
    const currentText = cell.textContent;
    
    showEditModal(row, col, currentText);
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
 * Show edit modal for GM
 */
function showEditModal(row, col, currentText) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('edit-modal');
    if (!modal) {
        modal = createEditModal();
        document.body.appendChild(modal);
    }
    
    const input = modal.querySelector('#edit-input');
    const title = modal.querySelector('#edit-title');
    
    title.textContent = `Edit Cell ${row}-${col}`;
    input.value = currentText;
    modal.classList.add('show');
    input.focus();
    input.select();
    
    // Store current cell being edited
    modal.dataset.row = row;
    modal.dataset.col = col;
}

/**
 * Create edit modal
 */
function createEditModal() {
    const modal = document.createElement('div');
    modal.id = 'edit-modal';
    modal.className = 'edit-modal';
    
    modal.innerHTML = `
        <div class="edit-modal-content">
            <h3 id="edit-title">Edit Cell</h3>
            <input type="text" id="edit-input" placeholder="Enter text...">
            <div class="edit-modal-buttons">
                <button class="save-btn" onclick="saveEdit()">Save</button>
                <button class="cancel-btn" onclick="cancelEdit()">Cancel</button>
            </div>
        </div>
    `;
    
    return modal;
}

/**
 * Save GM edit
 */
function saveEdit() {
    const modal = document.getElementById('edit-modal');
    const input = document.getElementById('edit-input');
    const row = modal.dataset.row;
    const col = modal.dataset.col;
    const newText = input.value.trim();
    
    const cell = document.getElementById(`cell-${row}-${col}`);
    if (cell) {
        cell.textContent = newText;
        
        // Save to state
        const cellKey = `${row}-${col}`;
        gridState.editableCells.set(cellKey, newText);
        
        // Save to server
        saveGridData();
    }
    
    modal.classList.remove('show');
}

/**
 * Cancel GM edit
 */
function cancelEdit() {
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('show');
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
            • Click blue cells: Edit text
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

// Global functions for modal
window.saveEdit = saveEdit;
window.cancelEdit = cancelEdit;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Add zoom indicator on load
    updateZoomIndicator();
});