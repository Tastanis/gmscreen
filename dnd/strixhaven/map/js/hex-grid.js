/**
 * Simple Hex Grid Renderer for 60x60 Grid
 * Clean implementation with minimal features
 */

class HexGridV2 {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Initialize coordinate system
        this.coordSystem = new CoordinateSystem(20); // 20px hex size
        
        // All hexes in the grid
        this.hexes = new Map();
        
        // Current highlighted hex
        this.hoveredHex = null;
        
        // Viewport for panning/zooming
        this.viewport = {
            scale: 1,
            offsetX: 0,
            offsetY: 0
        };
        
        // Colors
        this.colors = {
            grid: 'rgba(100, 100, 150, 0.3)',
            hover: 'rgba(255, 255, 100, 0.4)',
            hoverStroke: 'rgba(255, 255, 100, 0.8)'
        };
        
        // Background image
        this.backgroundImage = null;
        this.imageLoaded = false;
        
        // Load background image
        this.loadBackgroundImage();
        
        // Initialize grid
        this.initializeGrid();
        
        // Set up canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    /**
     * Load the background image
     */
    loadBackgroundImage() {
        this.backgroundImage = new Image();
        this.backgroundImage.onload = () => {
            this.imageLoaded = true;
            this.render();
        };
        this.backgroundImage.onerror = () => {
            console.error('Failed to load background image');
        };
        this.backgroundImage.src = 'images/Strixhavenmap.png';
    }
    
    /**
     * Initialize the hex grid
     */
    initializeGrid() {
        const allHexes = this.coordSystem.getAllHexes();
        
        for (const hex of allHexes) {
            const id = this.coordSystem.hexToId(hex.q, hex.r);
            this.hexes.set(id, {
                q: hex.q,
                r: hex.r,
                data: null
            });
        }
        
        console.log(`Initialized ${this.hexes.size} hexes`);
    }
    
    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }
    
    /**
     * Main render function
     */
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Save context
        this.ctx.save();
        
        // Apply viewport transformation
        this.ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
        this.ctx.scale(this.viewport.scale, this.viewport.scale);
        
        // Draw background image if loaded
        if (this.imageLoaded && this.backgroundImage) {
            this.drawBackgroundImage();
        }
        
        // Draw all hexes
        this.drawHexGrid();
        
        // Draw hovered hex if any
        if (this.hoveredHex) {
            this.drawHoveredHex();
        }
        
        // Restore context
        this.ctx.restore();
    }
    
    /**
     * Draw the background image sized for 36x36 hexes
     */
    drawBackgroundImage() {
        // Calculate dimensions for 36x36 hexes
        const hexSize = this.coordSystem.hexSize;
        
        // Width: 36 hexes * 1.5 * hexSize (accounting for hex overlap)
        const imageWidth = 36 * 1.5 * hexSize;
        
        // Height: 36 hexes * sqrt(3) * hexSize
        const imageHeight = 36 * Math.sqrt(3) * hexSize;
        
        // Get pixel position of hex (0,20) - where image should start
        const imagePosition = this.coordSystem.hexToPixel(0, 20);
        
        // Draw image at hex (0,20) position
        this.ctx.drawImage(
            this.backgroundImage,
            imagePosition.x, imagePosition.y,  // Position at hex (0,20)
            imageWidth, imageHeight  // Scale to cover 36x36 hexes
        );
    }
    
    /**
     * Draw the hex grid
     */
    drawHexGrid() {
        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.lineWidth = 1;
        
        for (const hex of this.hexes.values()) {
            const vertices = this.coordSystem.getHexVertices(hex.q, hex.r);
            this.drawHexagon(vertices);
        }
    }
    
    /**
     * Draw the hovered hex
     */
    drawHoveredHex() {
        if (!this.hoveredHex) return;
        
        const vertices = this.coordSystem.getHexVertices(
            this.hoveredHex.q, 
            this.hoveredHex.r
        );
        
        // Fill
        this.ctx.fillStyle = this.colors.hover;
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        this.ctx.closePath();
        this.ctx.fill();
        
        // Stroke
        this.ctx.strokeStyle = this.colors.hoverStroke;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    /**
     * Draw a single hexagon
     */
    drawHexagon(vertices) {
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        this.ctx.closePath();
        this.ctx.stroke();
    }
    
    /**
     * Handle mouse move for hover
     */
    handleMouseMove(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;
        
        // Convert canvas coordinates to world coordinates
        const worldX = (canvasX - this.viewport.offsetX) / this.viewport.scale;
        const worldY = (canvasY - this.viewport.offsetY) / this.viewport.scale;
        
        // Get hex at position
        const hex = this.coordSystem.pixelToHex(worldX, worldY);
        
        // Check if it's a valid hex
        if (this.coordSystem.isValidHex(hex.q, hex.r)) {
            // Update hovered hex if changed
            if (!this.hoveredHex || 
                this.hoveredHex.q !== hex.q || 
                this.hoveredHex.r !== hex.r) {
                this.hoveredHex = hex;
                this.render();
            }
        } else {
            // Clear hover if outside grid
            if (this.hoveredHex) {
                this.hoveredHex = null;
                this.render();
            }
        }
    }
    
    /**
     * Handle mouse click
     */
    handleMouseClick(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;
        
        // Convert to world coordinates
        const worldX = (canvasX - this.viewport.offsetX) / this.viewport.scale;
        const worldY = (canvasY - this.viewport.offsetY) / this.viewport.scale;
        
        // Get hex at position
        const hex = this.coordSystem.pixelToHex(worldX, worldY);
        
        if (this.coordSystem.isValidHex(hex.q, hex.r)) {
            console.log(`Clicked hex: (${hex.q}, ${hex.r})`);
        }
    }
    
    /**
     * Set viewport for panning/zooming
     */
    setViewport(scale, offsetX, offsetY) {
        this.viewport.scale = scale;
        this.viewport.offsetX = offsetX;
        this.viewport.offsetY = offsetY;
        this.render();
    }
}

// Export for use
window.HexGrid = HexGridV2;