/**
 * Hex Grid Rendering System
 * Handles drawing hexagons on HTML5 Canvas with viewport culling
 */

class HexGrid {
    constructor(canvas, backgroundImagePath) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.backgroundImagePath = backgroundImagePath;
        this.backgroundImage = null;
        
        // Initialize coordinate system
        this.coordSystem = new CoordinateSystem(25); // Hex size 25px
        
        // Grid state
        this.hexes = new Map(); // Store hex data: hexId -> hexData
        this.activeHexes = new Set(); // Hexes that have been clicked/modified
        this.highlightedHex = null;
        this.selectedHex = null;
        
        // Rendering state
        this.showGrid = true;
        this.showLabels = false;
        this.debugMode = false;
        
        // Colors and styling
        this.colors = {
            background: '#2a2a3e',
            gridLine: '#4a4a6a',
            gridLineActive: '#6a6aaa',
            hexFill: 'rgba(106, 106, 170, 0.1)',
            hexFillActive: 'rgba(106, 106, 170, 0.3)',
            hexFillHighlight: 'rgba(170, 106, 106, 0.4)',
            hexStroke: '#6a6aaa',
            hexStrokeActive: '#8a8aca',
            hexStrokeHighlight: '#ca8a8a',
            text: '#eee',
            textShadow: '#000'
        };
        
        // Performance tracking
        this.lastRenderTime = 0;
        this.renderCount = 0;
        this.visibleHexCount = 0;
        
        this.initialize();
    }
    
    async initialize() {
        // Load background image if provided
        if (this.backgroundImagePath) {
            try {
                this.backgroundImage = await this.loadImage(this.backgroundImagePath);
            } catch (error) {
                console.warn('Failed to load background image:', error);
            }
        }
        
        // Generate initial hex grid
        this.generateGrid();
        
        // Set up resize observer
        this.setupResizeObserver();
        
        console.log(`HexGrid initialized with ${this.coordSystem.gridConfig.gridWidth}x${this.coordSystem.gridConfig.gridHeight} grid`);
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
    
    setupResizeObserver() {
        const resizeObserver = new ResizeObserver(() => {
            this.resizeCanvas();
        });
        resizeObserver.observe(this.canvas.parentElement);
    }
    
    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Set canvas size accounting for device pixel ratio
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Scale context for high DPI displays
        this.ctx.scale(dpr, dpr);
        
        // Update coordinate system with new canvas dimensions
        this.updateViewport();
    }
    
    generateGrid() {
        const allHexes = this.coordSystem.generateAllHexes();
        console.log(`Generated ${allHexes.length} hex coordinates`);
        
        // Initialize hex data for all hexes
        allHexes.forEach(hex => {
            const hexId = this.coordSystem.hexToId(hex.q, hex.r);
            this.hexes.set(hexId, {
                q: hex.q,
                r: hex.r,
                id: hexId,
                data: null, // Will be populated when hex is edited
                hasData: false,
                isActive: false,
                lastModified: null
            });
        });
    }
    
    /**
     * Main rendering function
     * @param {Object} viewport - Current viewport transformation
     */
    render(viewport = { scale: 1, offsetX: 0, offsetY: 0 }) {
        const startTime = performance.now();
        
        // Clear canvas
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
        // Apply viewport transformation
        this.ctx.save();
        this.ctx.translate(viewport.offsetX, viewport.offsetY);
        this.ctx.scale(viewport.scale, viewport.scale);
        
        // Draw background image
        if (this.backgroundImage) {
            this.drawBackground();
        }
        
        // Get visible hexes for viewport culling
        const visibleBounds = this.getVisibleBounds(viewport);
        const visibleHexes = this.coordSystem.getVisibleHexes(visibleBounds);
        this.visibleHexCount = visibleHexes.length;
        
        // Draw grid if enabled
        if (this.showGrid) {
            this.drawGrid(visibleHexes);
        }
        
        // Draw hex highlights and selections
        this.drawHexStates(visibleHexes);
        
        // Draw labels if enabled
        if (this.showLabels || this.debugMode) {
            this.drawLabels(visibleHexes);
        }
        
        this.ctx.restore();
        
        // Update performance metrics
        this.lastRenderTime = performance.now() - startTime;
        this.renderCount++;
        
        // Draw debug info if enabled
        if (this.debugMode) {
            this.drawDebugInfo(viewport);
        }
    }
    
    drawBackground() {
        if (!this.backgroundImage) return;
        
        const config = this.coordSystem.gridConfig;
        this.ctx.drawImage(
            this.backgroundImage,
            0, 0, config.imageWidth, config.imageHeight
        );
    }
    
    drawGrid(visibleHexes) {
        this.ctx.strokeStyle = this.colors.gridLine;
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.5;
        
        visibleHexes.forEach(hex => {
            const vertices = this.coordSystem.getHexVertices(hex.q, hex.r);
            this.drawHexagon(vertices, false, true);
        });
        
        this.ctx.globalAlpha = 1;
    }
    
    drawHexStates(visibleHexes) {
        visibleHexes.forEach(hex => {
            const hexId = this.coordSystem.hexToId(hex.q, hex.r);
            const hexData = this.hexes.get(hexId);
            
            if (!hexData) return;
            
            const vertices = this.coordSystem.getHexVertices(hex.q, hex.r);
            let fillColor = null;
            let strokeColor = null;
            let strokeWidth = 1;
            
            // Determine hex appearance based on state
            if (this.selectedHex && this.selectedHex.q === hex.q && this.selectedHex.r === hex.r) {
                fillColor = this.colors.hexFillActive;
                strokeColor = this.colors.hexStrokeActive;
                strokeWidth = 3;
            } else if (this.highlightedHex && this.highlightedHex.q === hex.q && this.highlightedHex.r === hex.r) {
                fillColor = this.colors.hexFillHighlight;
                strokeColor = this.colors.hexStrokeHighlight;
                strokeWidth = 2;
            } else if (hexData.hasData || hexData.isActive) {
                fillColor = this.colors.hexFillActive;
                strokeColor = this.colors.hexStrokeActive;
                strokeWidth = 1.5;
            }
            
            // Draw filled hex if it has a color
            if (fillColor) {
                this.ctx.fillStyle = fillColor;
                this.ctx.globalAlpha = 0.7;
                this.drawHexagon(vertices, true, false);
                this.ctx.globalAlpha = 1;
            }
            
            // Draw hex outline if it has a stroke color
            if (strokeColor) {
                this.ctx.strokeStyle = strokeColor;
                this.ctx.lineWidth = strokeWidth;
                this.drawHexagon(vertices, false, true);
            }
        });
    }
    
    drawHexagon(vertices, fill = false, stroke = false) {
        if (vertices.length < 6) return;
        
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        
        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        
        this.ctx.closePath();
        
        if (fill) {
            this.ctx.fill();
        }
        
        if (stroke) {
            this.ctx.stroke();
        }
    }
    
    drawLabels(visibleHexes) {
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        visibleHexes.forEach(hex => {
            const center = this.coordSystem.axialToPixel(hex.q, hex.r);
            const hexId = this.coordSystem.hexToId(hex.q, hex.r);
            const hexData = this.hexes.get(hexId);
            
            // Choose label text
            let labelText = '';
            if (this.debugMode) {
                labelText = `${hex.q},${hex.r}`;
            } else if (hexData && hexData.data && hexData.data.hex_name) {
                labelText = hexData.data.hex_name;
            }
            
            if (labelText) {
                // Draw text shadow
                this.ctx.fillStyle = this.colors.textShadow;
                this.ctx.fillText(labelText, center.x + 1, center.y + 1);
                
                // Draw text
                this.ctx.fillStyle = this.colors.text;
                this.ctx.fillText(labelText, center.x, center.y);
            }
        });
    }
    
    drawDebugInfo(viewport) {
        // Reset transformation for UI elements
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        const debugText = [
            `Render Time: ${this.lastRenderTime.toFixed(2)}ms`,
            `Visible Hexes: ${this.visibleHexCount}`,
            `Total Hexes: ${this.hexes.size}`,
            `Active Hexes: ${this.activeHexes.size}`,
            `Scale: ${viewport.scale.toFixed(2)}x`,
            `Offset: ${Math.round(viewport.offsetX)}, ${Math.round(viewport.offsetY)}`,
            `Canvas: ${this.canvas.width}x${this.canvas.height}`,
            `FPS: ${(1000 / this.lastRenderTime).toFixed(1)}`
        ];
        
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        // Draw debug background
        const padding = 10;
        const lineHeight = 16;
        const width = 200;
        const height = debugText.length * lineHeight + padding * 2;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(10, 10, width, height);
        
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(10, 10, width, height);
        
        // Draw debug text
        this.ctx.fillStyle = '#eee';
        debugText.forEach((text, index) => {
            this.ctx.fillText(text, 20, 20 + index * lineHeight);
        });
    }
    
    /**
     * Get hex at pixel coordinates
     * @param {number} x - Pixel x coordinate (canvas space)
     * @param {number} y - Pixel y coordinate (canvas space)
     * @param {Object} viewport - Current viewport transformation
     * @returns {Object|null} Hex coordinates {q, r} or null if not found
     */
    getHexAtPoint(x, y, viewport) {
        // Transform screen coordinates to world coordinates
        const worldX = (x - viewport.offsetX) / viewport.scale;
        const worldY = (y - viewport.offsetY) / viewport.scale;
        
        // Convert to hex coordinates
        const hex = this.coordSystem.pixelToAxial(worldX, worldY);
        
        // Validate hex is within grid bounds and actually contains the point
        if (this.coordSystem.isValidHex(hex)) {
            // Double-check with precise point-in-hex test
            if (this.coordSystem.isPointInHex({ x: worldX, y: worldY }, hex.q, hex.r)) {
                return hex;
            }
        }
        
        return null;
    }
    
    /**
     * Get visible bounds in world coordinates
     */
    getVisibleBounds(viewport) {
        const canvasRect = this.canvas.getBoundingClientRect();
        
        return {
            left: -viewport.offsetX / viewport.scale,
            top: -viewport.offsetY / viewport.scale,
            right: (canvasRect.width - viewport.offsetX) / viewport.scale,
            bottom: (canvasRect.height - viewport.offsetY) / viewport.scale
        };
    }
    
    /**
     * Set hex data and mark as active
     */
    setHexData(hexId, data) {
        if (this.hexes.has(hexId)) {
            const hex = this.hexes.get(hexId);
            hex.data = data;
            hex.hasData = data != null && Object.keys(data).some(key => 
                data[key] && data[key].toString().trim() !== ''
            );
            hex.isActive = true;
            hex.lastModified = Date.now();
            
            if (hex.hasData) {
                this.activeHexes.add(hexId);
            }
        }
    }
    
    /**
     * Get hex data
     */
    getHexData(hexId) {
        return this.hexes.has(hexId) ? this.hexes.get(hexId) : null;
    }
    
    /**
     * Set highlighted hex
     */
    setHighlightedHex(hex) {
        this.highlightedHex = hex;
    }
    
    /**
     * Set selected hex
     */
    setSelectedHex(hex) {
        this.selectedHex = hex;
    }
    
    /**
     * Toggle grid visibility
     */
    toggleGrid() {
        this.showGrid = !this.showGrid;
        return this.showGrid;
    }
    
    /**
     * Toggle label visibility
     */
    toggleLabels() {
        this.showLabels = !this.showLabels;
        return this.showLabels;
    }
    
    /**
     * Toggle debug mode
     */
    toggleDebug() {
        this.debugMode = !this.debugMode;
        return this.debugMode;
    }
    
    /**
     * Update viewport (called on resize)
     */
    updateViewport() {
        // Force a re-render to update visible hexes
        this.render();
    }
    
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            lastRenderTime: this.lastRenderTime,
            renderCount: this.renderCount,
            visibleHexCount: this.visibleHexCount,
            totalHexCount: this.hexes.size,
            activeHexCount: this.activeHexes.size,
            averageRenderTime: this.renderCount > 0 ? this.lastRenderTime : 0
        };
    }
    
    /**
     * Bulk update hex data (for loading from server)
     */
    bulkUpdateHexData(hexDataArray) {
        hexDataArray.forEach(hexData => {
            const hexId = hexData.hex_id || this.coordSystem.hexToId(hexData.q, hexData.r);
            this.setHexData(hexId, hexData);
        });
        
        console.log(`Bulk updated ${hexDataArray.length} hexes`);
    }
    
    /**
     * Export current hex data
     */
    exportHexData() {
        const activeData = [];
        
        this.activeHexes.forEach(hexId => {
            const hex = this.hexes.get(hexId);
            if (hex && hex.data) {
                activeData.push({
                    hex_id: hexId,
                    q: hex.q,
                    r: hex.r,
                    ...hex.data
                });
            }
        });
        
        return activeData;
    }
    
    /**
     * Clear all hex data
     */
    clearAllData() {
        this.hexes.forEach(hex => {
            hex.data = null;
            hex.hasData = false;
            hex.isActive = false;
            hex.lastModified = null;
        });
        
        this.activeHexes.clear();
        this.selectedHex = null;
        this.highlightedHex = null;
    }
    
    /**
     * Update coordinate system configuration
     */
    updateConfig(config) {
        this.coordSystem.updateConfig(config);
        this.generateGrid(); // Regenerate grid with new config
    }
}

// Export for use in other modules
window.HexGrid = HexGrid;