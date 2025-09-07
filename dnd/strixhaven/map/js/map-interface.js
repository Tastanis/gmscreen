/**
 * Simple Map Interface
 * Minimal implementation for hex grid interaction
 */

class MapInterfaceV2 {
    constructor() {
        this.canvas = null;
        this.hexGrid = null;
        this.isPanning = false;
        this.lastPanX = 0;
        this.lastPanY = 0;
        
        // Current viewport
        this.viewport = {
            scale: 1,
            offsetX: 0,
            offsetY: 0
        };
    }
    
    /**
     * Initialize the map interface
     */
    initialize() {
        // Get canvas element
        this.canvas = document.getElementById('hex-canvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }
        
        // Create hex grid
        this.hexGrid = new HexGrid(this.canvas);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Center on hex (18,27) by default
        const centerOffset = this.getCenterOffsetForHex(18, 27);
        this.viewport.offsetX = centerOffset.offsetX;
        this.viewport.offsetY = centerOffset.offsetY;
        this.hexGrid.setViewport(
            this.viewport.scale,
            this.viewport.offsetX,
            this.viewport.offsetY
        );
        
        // Initial render
        this.hexGrid.render();
        
        console.log('Map interface initialized, centered on hex (18,27)');
    }
    
    /**
     * Calculate offset needed to center a specific hex on screen
     */
    getCenterOffsetForHex(q, r) {
        // Get pixel position of the target hex
        const hexPixelPos = this.hexGrid.coordSystem.hexToPixel(q, r);
        
        // Get screen center
        const screenCenterX = this.canvas.width / 2;
        const screenCenterY = this.canvas.height / 2;
        
        // Calculate offset needed to center the hex
        const offsetX = screenCenterX - hexPixelPos.x;
        const offsetY = screenCenterY - hexPixelPos.y;
        
        return { offsetX, offsetY };
    }
    
    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Mouse move for hover
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.handlePan(e.clientX, e.clientY);
            } else {
                this.hexGrid.handleMouseMove(e.clientX, e.clientY);
            }
        });
        
        // Mouse click
        this.canvas.addEventListener('click', (e) => {
            this.hexGrid.handleMouseClick(e.clientX, e.clientY);
        });
        
        // Mouse wheel for zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.handleZoom(e.deltaY, e.clientX, e.clientY);
        });
        
        // Mouse down for pan start
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 2) { // Right click
                this.startPan(e.clientX, e.clientY);
            }
        });
        
        // Mouse up for pan end
        document.addEventListener('mouseup', () => {
            this.endPan();
        });
        
        // Mouse leave to clear hover
        this.canvas.addEventListener('mouseleave', () => {
            if (this.hexGrid.hoveredHex) {
                this.hexGrid.hoveredHex = null;
                this.hexGrid.render();
            }
        });
        
        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    /**
     * Handle zoom
     */
    handleZoom(delta, clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;
        
        // Calculate zoom
        const zoomSpeed = 0.1;
        const scaleFactor = delta > 0 ? (1 - zoomSpeed) : (1 + zoomSpeed);
        const newScale = this.viewport.scale * scaleFactor;
        
        // Limit zoom
        if (newScale < 0.5 || newScale > 3) return;
        
        // Zoom towards mouse position
        const worldX = (canvasX - this.viewport.offsetX) / this.viewport.scale;
        const worldY = (canvasY - this.viewport.offsetY) / this.viewport.scale;
        
        this.viewport.scale = newScale;
        
        const newScreenX = worldX * this.viewport.scale + this.viewport.offsetX;
        const newScreenY = worldY * this.viewport.scale + this.viewport.offsetY;
        
        this.viewport.offsetX += canvasX - newScreenX;
        this.viewport.offsetY += canvasY - newScreenY;
        
        // Update hex grid
        this.hexGrid.setViewport(
            this.viewport.scale,
            this.viewport.offsetX,
            this.viewport.offsetY
        );
    }
    
    /**
     * Start panning
     */
    startPan(x, y) {
        this.isPanning = true;
        this.lastPanX = x;
        this.lastPanY = y;
        this.canvas.style.cursor = 'grabbing';
    }
    
    /**
     * Handle panning
     */
    handlePan(x, y) {
        if (!this.isPanning) return;
        
        const dx = x - this.lastPanX;
        const dy = y - this.lastPanY;
        
        this.viewport.offsetX += dx;
        this.viewport.offsetY += dy;
        
        this.lastPanX = x;
        this.lastPanY = y;
        
        // Update hex grid
        this.hexGrid.setViewport(
            this.viewport.scale,
            this.viewport.offsetX,
            this.viewport.offsetY
        );
    }
    
    /**
     * End panning
     */
    endPan() {
        this.isPanning = false;
        this.canvas.style.cursor = 'default';
    }
}

// Export for use
window.MapInterface = MapInterfaceV2;