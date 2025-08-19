/**
 * Arcane Construction Grid System
 * Manages a 12x19 interactive grid for construction planning
 */

// Grid configuration
const GRID_CONFIG = {
    columns: 12,
    rows: 19,
    totalTiles: 12 * 19
};

// Grid state management
let gridState = {
    tiles: new Map(),
    selectedTiles: new Set(),
    activeTile: null
};

/**
 * Initialize the construction grid
 */
function initializeGrid() {
    const gridContainer = document.getElementById('construction-grid');
    if (!gridContainer) {
        console.error('Grid container not found');
        return;
    }

    // Clear existing content
    gridContainer.innerHTML = '';

    // Generate grid tiles
    for (let row = 0; row < GRID_CONFIG.rows; row++) {
        for (let col = 0; col < GRID_CONFIG.columns; col++) {
            const tile = createGridTile(row, col);
            gridContainer.appendChild(tile);
        }
    }

    console.log(`Initialized ${GRID_CONFIG.totalTiles} grid tiles (${GRID_CONFIG.columns}x${GRID_CONFIG.rows})`);
}

/**
 * Create a single grid tile
 * @param {number} row - Row index (0-18)
 * @param {number} col - Column index (0-11)
 * @returns {HTMLElement} - The created tile element
 */
function createGridTile(row, col) {
    const tile = document.createElement('div');
    const tileId = `tile-${row}-${col}`;
    
    tile.className = 'grid-tile';
    tile.id = tileId;
    tile.dataset.row = row;
    tile.dataset.col = col;
    tile.dataset.coord = `${col + 1},${row + 1}`;
    
    // Add coordinate display for easier reference
    tile.textContent = `${col + 1},${row + 1}`;
    
    // Add click event listener
    tile.addEventListener('click', handleTileClick);
    
    // Add hover effects for better UX
    tile.addEventListener('mouseenter', handleTileHover);
    tile.addEventListener('mouseleave', handleTileLeave);
    
    // Initialize tile state
    gridState.tiles.set(tileId, {
        id: tileId,
        row: row,
        col: col,
        state: 'empty',
        data: {}
    });
    
    return tile;
}

/**
 * Handle tile click events
 * @param {Event} event - Click event
 */
function handleTileClick(event) {
    const tile = event.currentTarget;
    const tileId = tile.id;
    const tileData = gridState.tiles.get(tileId);
    
    if (!tileData) return;

    // Toggle tile selection
    if (gridState.selectedTiles.has(tileId)) {
        // Deselect tile
        gridState.selectedTiles.delete(tileId);
        tile.classList.remove('selected');
        tileData.state = 'empty';
    } else {
        // Select tile
        gridState.selectedTiles.add(tileId);
        tile.classList.add('selected');
        tileData.state = 'selected';
    }

    // Update active tile
    gridState.activeTile = tileId;
    
    // Remove active class from all tiles
    document.querySelectorAll('.grid-tile.active').forEach(t => {
        t.classList.remove('active');
    });
    
    // Add active class to clicked tile
    tile.classList.add('active');
    
    // Log tile interaction for debugging
    console.log(`Tile clicked: ${tileData.col + 1},${tileData.row + 1} (${tileId})`);
    console.log(`Selected tiles: ${gridState.selectedTiles.size}`);
    
    // Update grid info display
    updateGridInfo();
}

/**
 * Handle tile hover events
 * @param {Event} event - Mouseenter event
 */
function handleTileHover(event) {
    const tile = event.currentTarget;
    
    // Add visual feedback on hover
    if (!tile.classList.contains('selected')) {
        tile.style.transform = 'scale(1.02)';
    }
}

/**
 * Handle tile leave events
 * @param {Event} event - Mouseleave event
 */
function handleTileLeave(event) {
    const tile = event.currentTarget;
    
    // Reset transform if not selected
    if (!tile.classList.contains('selected')) {
        tile.style.transform = '';
    }
}

/**
 * Update grid information display
 */
function updateGridInfo() {
    const gridInfo = document.querySelector('.grid-info');
    if (!gridInfo) return;

    const selectedCount = gridState.selectedTiles.size;
    const activeTileData = gridState.activeTile ? gridState.tiles.get(gridState.activeTile) : null;
    
    // Update the info text
    const infoHtml = `
        <p>12 x 19 Construction Grid</p>
        <p>Selected tiles: ${selectedCount}</p>
        ${activeTileData ? `<p>Active tile: ${activeTileData.col + 1},${activeTileData.row + 1}</p>` : '<p>Click on tiles to interact</p>'}
    `;
    
    gridInfo.innerHTML = infoHtml;
}

/**
 * Clear all selections
 */
function clearSelections() {
    // Remove selected class from all tiles
    document.querySelectorAll('.grid-tile.selected').forEach(tile => {
        tile.classList.remove('selected');
    });
    
    // Remove active class from all tiles
    document.querySelectorAll('.grid-tile.active').forEach(tile => {
        tile.classList.remove('active');
    });
    
    // Clear state
    gridState.selectedTiles.clear();
    gridState.activeTile = null;
    
    // Reset all tile states
    gridState.tiles.forEach(tileData => {
        tileData.state = 'empty';
    });
    
    // Update display
    updateGridInfo();
    
    console.log('All selections cleared');
}

/**
 * Get selected tiles data
 * @returns {Array} Array of selected tile data
 */
function getSelectedTiles() {
    const selected = [];
    gridState.selectedTiles.forEach(tileId => {
        const tileData = gridState.tiles.get(tileId);
        if (tileData) {
            selected.push({
                id: tileId,
                row: tileData.row + 1, // 1-based indexing for display
                col: tileData.col + 1, // 1-based indexing for display
                coord: `${tileData.col + 1},${tileData.row + 1}`
            });
        }
    });
    return selected;
}

/**
 * Select tiles by coordinates
 * @param {Array} coordinates - Array of {row, col} objects (1-based)
 */
function selectTilesByCoordinates(coordinates) {
    clearSelections();
    
    coordinates.forEach(coord => {
        const row = coord.row - 1; // Convert to 0-based
        const col = coord.col - 1; // Convert to 0-based
        const tileId = `tile-${row}-${col}`;
        const tile = document.getElementById(tileId);
        const tileData = gridState.tiles.get(tileId);
        
        if (tile && tileData && row >= 0 && row < GRID_CONFIG.rows && col >= 0 && col < GRID_CONFIG.columns) {
            gridState.selectedTiles.add(tileId);
            tile.classList.add('selected');
            tileData.state = 'selected';
        }
    });
    
    updateGridInfo();
}

/**
 * Export grid state as JSON
 * @returns {Object} Grid state object
 */
function exportGridState() {
    const selectedTiles = getSelectedTiles();
    return {
        gridConfig: GRID_CONFIG,
        selectedTiles: selectedTiles,
        activeTile: gridState.activeTile,
        timestamp: new Date().toISOString(),
        totalSelected: selectedTiles.length
    };
}

/**
 * Import grid state from JSON
 * @param {Object} stateData - Grid state object
 */
function importGridState(stateData) {
    if (!stateData || !stateData.selectedTiles) {
        console.error('Invalid grid state data');
        return;
    }
    
    // Convert coordinates back to the expected format
    const coordinates = stateData.selectedTiles.map(tile => ({
        row: tile.row,
        col: tile.col
    }));
    
    selectTilesByCoordinates(coordinates);
    
    console.log(`Imported grid state with ${coordinates.length} selected tiles`);
}

// Utility functions for external access
window.arcaneGrid = {
    clearSelections,
    getSelectedTiles,
    selectTilesByCoordinates,
    exportGridState,
    importGridState,
    
    // Keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Escape key to clear selections
            if (event.key === 'Escape') {
                clearSelections();
            }
            
            // Ctrl+A to select all (prevent default browser behavior)
            if (event.ctrlKey && event.key === 'a') {
                event.preventDefault();
                // Select all tiles
                const allCoords = [];
                for (let row = 1; row <= GRID_CONFIG.rows; row++) {
                    for (let col = 1; col <= GRID_CONFIG.columns; col++) {
                        allCoords.push({row, col});
                    }
                }
                selectTilesByCoordinates(allCoords);
            }
        });
        
        console.log('Keyboard shortcuts enabled: ESC (clear), Ctrl+A (select all)');
    }
};

// Initialize keyboard shortcuts when the script loads
document.addEventListener('DOMContentLoaded', () => {
    window.arcaneGrid.setupKeyboardShortcuts();
});