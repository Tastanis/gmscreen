/**
 * Coordinate System for Hexagonal Grid
 * Uses axial coordinates (q, r) for mathematical efficiency
 * Provides conversion between pixel coordinates and hex coordinates
 */

class CoordinateSystem {
    constructor(hexSize = 23) {
        this.hexSize = hexSize;
        
        // Hexagon geometry constants
        this.hexWidth = hexSize * 2;
        this.hexHeight = hexSize * Math.sqrt(3);
        this.hexHorizontalSpacing = hexSize * 3/2;
        this.hexVerticalSpacing = this.hexHeight;
        
        // Grid configuration for 38x38 hexes
        this.gridConfig = {
            imageWidth: 2048,        // Background image width
            imageHeight: 1536,       // Background image height
            gridOriginX: 100,        // Where hex (0,0) appears on image
            gridOriginY: 100,        // Where hex (0,0) appears on image
            gridWidth: 38,           // Number of hexes horizontally
            gridHeight: 38,          // Number of hexes vertically
            hexSize: hexSize,
            scalingMode: 'fitImageToGrid' // 'fitImageToGrid' or 'fitGridToImage'
        };
        
        // Calculate optimal sizing based on scaling mode
        this.updateOptimalSizing();
    }
    
    /**
     * Update optimal sizing calculations based on scaling mode
     */
    updateOptimalSizing() {
        if (this.gridConfig.scalingMode === 'fitImageToGrid') {
            // Scale background image to fit the hex grid area
            this.calculateGridDimensions();
        } else if (this.gridConfig.scalingMode === 'fitGridToImage') {
            // Adjust hex size to fit within image bounds
            this.calculateOptimalHexSize();
        }
    }
    
    /**
     * Calculate total grid dimensions for current hex size
     */
    calculateGridDimensions() {
        const { gridWidth, gridHeight, hexSize } = this.gridConfig;
        
        // Calculate total area needed for the hex grid
        const totalWidth = (gridWidth - 0.5) * hexSize * 1.5 + hexSize; // Account for hex spacing
        const totalHeight = gridHeight * hexSize * Math.sqrt(3) * 0.75 + hexSize * Math.sqrt(3) * 0.5; // Account for row offset
        
        // Store calculated dimensions
        this.gridConfig.calculatedWidth = totalWidth;
        this.gridConfig.calculatedHeight = totalHeight;
        
        console.log(`Grid dimensions: ${totalWidth.toFixed(1)} x ${totalHeight.toFixed(1)}`);
    }
    
    /**
     * Calculate optimal hex size to fit grid within image bounds
     */
    calculateOptimalHexSize() {
        const { gridWidth, gridHeight, imageWidth, imageHeight } = this.gridConfig;
        
        // Calculate hex size needed to fit grid within image
        const maxWidthHexSize = (imageWidth - 200) / ((gridWidth - 0.5) * 1.5 + 1); // 200px margin
        const maxHeightHexSize = (imageHeight - 200) / (gridHeight * Math.sqrt(3) * 0.75 + Math.sqrt(3) * 0.5);
        
        // Use the smaller size to ensure both dimensions fit
        const optimalHexSize = Math.min(maxWidthHexSize, maxHeightHexSize);
        
        // Update hex size and recalculate geometry
        this.hexSize = Math.floor(optimalHexSize);
        this.gridConfig.hexSize = this.hexSize;
        this.hexWidth = this.hexSize * 2;
        this.hexHeight = this.hexSize * Math.sqrt(3);
        this.hexHorizontalSpacing = this.hexSize * 3/2;
        this.hexVerticalSpacing = this.hexHeight;
        
        console.log(`Calculated optimal hex size: ${this.hexSize}px`);
    }
    
    /**
     * Get background scaling parameters
     */
    getBackgroundScaling() {
        if (this.gridConfig.scalingMode === 'fitImageToGrid') {
            // Scale image to match grid dimensions
            return {
                scaleX: this.gridConfig.calculatedWidth / this.gridConfig.imageWidth,
                scaleY: this.gridConfig.calculatedHeight / this.gridConfig.imageHeight,
                width: this.gridConfig.calculatedWidth,
                height: this.gridConfig.calculatedHeight
            };
        } else {
            // Use image at original size
            return {
                scaleX: 1,
                scaleY: 1,
                width: this.gridConfig.imageWidth,
                height: this.gridConfig.imageHeight
            };
        }
    }
    
    /**
     * Convert axial coordinates to pixel coordinates (Red Blob Games standard)
     * @param {number} q - Axial coordinate q
     * @param {number} r - Axial coordinate r
     * @returns {Object} {x, y} pixel coordinates
     */
    axialToPixel(q, r) {
        // Standard flat-topped hexagon conversion
        const x = this.gridConfig.gridOriginX + this.hexSize * (3/2 * q);
        const y = this.gridConfig.gridOriginY + this.hexSize * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
        return { x, y };
    }
    
    /**
     * Convert pixel coordinates to axial coordinates
     * @param {number} x - Pixel x coordinate
     * @param {number} y - Pixel y coordinate
     * @returns {Object} {q, r} axial coordinates
     */
    pixelToAxial(x, y) {
        // Adjust for grid origin
        const adjustedX = x - this.gridConfig.gridOriginX;
        const adjustedY = y - this.gridConfig.gridOriginY;
        
        const q = (2/3 * adjustedX) / this.hexSize;
        const r = (-1/3 * adjustedX + Math.sqrt(3)/3 * adjustedY) / this.hexSize;
        return this.axialRound(q, r);
    }
    
    /**
     * Round fractional axial coordinates to the nearest hex
     * @param {number} q - Fractional q coordinate
     * @param {number} r - Fractional r coordinate
     * @returns {Object} {q, r} rounded axial coordinates
     */
    axialRound(q, r) {
        const s = -q - r;
        
        const roundQ = Math.round(q);
        const roundR = Math.round(r);
        const roundS = Math.round(s);
        
        const qDiff = Math.abs(roundQ - q);
        const rDiff = Math.abs(roundR - r);
        const sDiff = Math.abs(roundS - s);
        
        if (qDiff > rDiff && qDiff > sDiff) {
            return { q: -roundR - roundS, r: roundR };
        } else if (rDiff > sDiff) {
            return { q: roundQ, r: -roundQ - roundS };
        } else {
            return { q: roundQ, r: roundR };
        }
    }
    
    /**
     * Convert axial coordinates to cube coordinates
     * @param {number} q - Axial q coordinate
     * @param {number} r - Axial r coordinate
     * @returns {Object} {x, y, z} cube coordinates
     */
    axialToCube(q, r) {
        const x = q;
        const z = r;
        const y = -x - z;
        return { x, y, z };
    }
    
    /**
     * Convert cube coordinates to axial coordinates
     * @param {number} x - Cube x coordinate
     * @param {number} y - Cube y coordinate
     * @param {number} z - Cube z coordinate
     * @returns {Object} {q, r} axial coordinates
     */
    cubeToAxial(x, y, z) {
        const q = x;
        const r = z;
        return { q, r };
    }
    
    /**
     * Calculate distance between two hexes in axial coordinates
     * @param {Object} hex1 - First hex {q, r}
     * @param {Object} hex2 - Second hex {q, r}
     * @returns {number} Distance in hexes
     */
    hexDistance(hex1, hex2) {
        const cube1 = this.axialToCube(hex1.q, hex1.r);
        const cube2 = this.axialToCube(hex2.q, hex2.r);
        
        return Math.max(
            Math.abs(cube1.x - cube2.x),
            Math.abs(cube1.y - cube2.y),
            Math.abs(cube1.z - cube2.z)
        );
    }
    
    /**
     * Get all neighbors of a hex
     * @param {Object} hex - Center hex {q, r}
     * @returns {Array} Array of neighboring hex coordinates
     */
    getHexNeighbors(hex) {
        const directions = [
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
        ];
        
        return directions.map(dir => ({
            q: hex.q + dir.q,
            r: hex.r + dir.r
        }));
    }
    
    /**
     * Get all hexes within a certain range
     * @param {Object} center - Center hex {q, r}
     * @param {number} range - Range in hexes
     * @returns {Array} Array of hex coordinates within range
     */
    getHexesInRange(center, range) {
        const results = [];
        
        for (let q = -range; q <= range; q++) {
            const r1 = Math.max(-range, -q - range);
            const r2 = Math.min(range, -q + range);
            
            for (let r = r1; r <= r2; r++) {
                results.push({
                    q: center.q + q,
                    r: center.r + r
                });
            }
        }
        
        return results;
    }
    
    /**
     * Check if a hex coordinate is within the grid bounds
     * @param {Object} hex - Hex coordinate {q, r}
     * @returns {boolean} True if within bounds
     */
    isValidHex(hex) {
        // For a fixed grid size, just check if it's within reasonable axial coordinate range
        // This is much more permissive than pixel bounds checking
        return Math.abs(hex.q) <= 50 && Math.abs(hex.r) <= 50;
    }
    
    /**
     * Check if hex is within rectangular pixel bounds on the image
     * @param {Object} hex - Hex coordinate {q, r}
     * @returns {boolean} True if within bounds
     */
    isWithinRectangularBounds(hex) {
        const pixel = this.axialToPixel(hex.q, hex.r);
        
        // Check if hex center is within image bounds with some margin
        const margin = this.hexSize;
        return pixel.x >= margin && 
               pixel.x <= this.gridConfig.imageWidth - margin &&
               pixel.y >= margin && 
               pixel.y <= this.gridConfig.imageHeight - margin;
    }
    
    /**
     * Convert axial coordinates to offset coordinates (for bounds checking)
     * @param {number} q - Axial q coordinate
     * @param {number} r - Axial r coordinate
     * @returns {Object} {col, row} offset coordinates
     */
    axialToOffset(q, r) {
        // For flat-topped hexes with odd-row offset
        const col = q + (r - (r & 1)) / 2;
        const row = r;
        return { col, row };
    }
    
    /**
     * Convert offset coordinates to axial coordinates
     * @param {number} col - Column in offset system
     * @param {number} row - Row in offset system
     * @returns {Object} {q, r} axial coordinates
     */
    offsetToAxial(col, row) {
        // For flat-topped hexes with odd-row offset (matches generateAllHexes)
        const q = col - Math.floor((row + (row & 1)) / 2);
        const r = row;
        return { q, r };
    }
    
    /**
     * Get the vertices of a hexagon at given axial coordinates
     * @param {number} q - Axial q coordinate
     * @param {number} r - Axial r coordinate
     * @returns {Array} Array of {x, y} vertex coordinates
     */
    getHexVertices(q, r) {
        const center = this.axialToPixel(q, r);
        const vertices = [];
        
        // For flat-topped hexagons, start at angle 0° (pointing right)
        // This creates hexes with flat sides on top and bottom for proper tessellation
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i);  // Start at 0°, increment by 60°
            const x = center.x + this.hexSize * Math.cos(angle);
            const y = center.y + this.hexSize * Math.sin(angle);
            vertices.push({ x, y });
        }
        
        return vertices;
    }
    
    /**
     * Check if a point is inside a hexagon
     * @param {Object} point - Point {x, y}
     * @param {number} q - Hex axial q coordinate
     * @param {number} r - Hex axial r coordinate
     * @returns {boolean} True if point is inside hex
     */
    isPointInHex(point, q, r) {
        const hexCenter = this.axialToPixel(q, r);
        const dx = Math.abs(point.x - hexCenter.x);
        const dy = Math.abs(point.y - hexCenter.y);
        
        // Quick bounding box check first
        if (dx > this.hexSize || dy > this.hexSize * Math.sqrt(3) / 2) {
            return false;
        }
        
        // More precise hexagon check
        const vertices = this.getHexVertices(q, r);
        return this.isPointInPolygon(point, vertices);
    }
    
    /**
     * Check if a point is inside a polygon using ray casting
     * @param {Object} point - Point {x, y}
     * @param {Array} vertices - Array of vertex {x, y} coordinates
     * @returns {boolean} True if point is inside polygon
     */
    isPointInPolygon(point, vertices) {
        let inside = false;
        
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            
            if (((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        return inside;
    }
    
    /**
     * Convert hex coordinate to a unique string identifier
     * @param {number} q - Axial q coordinate
     * @param {number} r - Axial r coordinate
     * @returns {string} Unique hex identifier
     */
    hexToId(q, r) {
        return `${q}_${r}`;
    }
    
    /**
     * Parse hex identifier back to coordinates
     * @param {string} hexId - Hex identifier string
     * @returns {Object} {q, r} axial coordinates
     */
    idToHex(hexId) {
        const [q, r] = hexId.split('_').map(Number);
        return { q, r };
    }
    
    /**
     * Generate all hex coordinates for the grid - creates a rectangular 38x38 grid
     * @returns {Array} Array of all valid hex coordinates
     */
    generateAllHexes() {
        const hexes = [];
        
        // Generate a rectangular grid using offset coordinates for proper honeycomb tessellation
        // Each even row is aligned, each odd row is offset by half a hex width to the right
        for (let row = 0; row < this.gridConfig.gridHeight; row++) {
            for (let col = 0; col < this.gridConfig.gridWidth; col++) {
                // Convert offset coordinates to axial coordinates
                // For flat-topped hexes with odd-row offset (standard Red Blob Games formula)
                const q = col - Math.floor((row + (row & 1)) / 2);
                const r = row;
                
                // Always include all hexes in the defined grid area
                hexes.push({ q, r });
            }
        }
        
        console.log(`Generated ${hexes.length} hexes in ${this.gridConfig.gridWidth}x${this.gridConfig.gridHeight} rectangular grid`);
        return hexes;
    }
    
    /**
     * Get hexes visible in a rectangular viewport
     * @param {Object} viewport - Viewport bounds {left, top, right, bottom}
     * @returns {Array} Array of hex coordinates visible in viewport
     */
    getVisibleHexes(viewport) {
        const visibleHexes = [];
        
        // Convert all four viewport corners to hex coordinates to get proper bounds
        // This fixes the diagonal band issue by ensuring we check the full rectangular area
        const topLeft = this.pixelToAxial(viewport.left, viewport.top);
        const topRight = this.pixelToAxial(viewport.right, viewport.top);
        const bottomLeft = this.pixelToAxial(viewport.left, viewport.bottom);
        const bottomRight = this.pixelToAxial(viewport.right, viewport.bottom);
        
        // Find the actual bounding box in axial coordinates by checking all corners
        const allCorners = [topLeft, topRight, bottomLeft, bottomRight];
        const minQ = Math.floor(Math.min(...allCorners.map(c => c.q)));
        const maxQ = Math.ceil(Math.max(...allCorners.map(c => c.q)));
        const minR = Math.floor(Math.min(...allCorners.map(c => c.r)));
        const maxR = Math.ceil(Math.max(...allCorners.map(c => c.r)));
        
        // Large padding to ensure we catch all edge cases
        const padding = 5;
        
        // Calculate hex dimensions for proper margins
        const hexWidth = this.hexSize * 2;
        const hexHeight = this.hexSize * Math.sqrt(3);
        const marginX = hexWidth * 0.75;
        const marginY = hexHeight * 0.75;
        
        // Iterate through the expanded axial coordinate range
        for (let q = minQ - padding; q <= maxQ + padding; q++) {
            for (let r = minR - padding; r <= maxR + padding; r++) {
                const hex = { q, r };
                if (this.isValidHex(hex)) {
                    const pixel = this.axialToPixel(q, r);
                    
                    // More generous visibility check to prevent disappearing hexes
                    if (pixel.x >= viewport.left - marginX &&
                        pixel.x <= viewport.right + marginX &&
                        pixel.y >= viewport.top - marginY &&
                        pixel.y <= viewport.bottom + marginY) {
                        visibleHexes.push(hex);
                    }
                }
            }
        }
        
        return visibleHexes;
    }
    
    /**
     * Update grid configuration
     * @param {Object} newConfig - New configuration object
     */
    updateConfig(newConfig) {
        this.gridConfig = { ...this.gridConfig, ...newConfig };
        
        if (newConfig.hexSize) {
            this.hexSize = newConfig.hexSize;
            this.hexWidth = this.hexSize * 2;
            this.hexHeight = this.hexSize * Math.sqrt(3);
            this.hexHorizontalSpacing = this.hexSize * 3/2;
            this.hexVerticalSpacing = this.hexHeight;
        }
    }
}

// Export for use in other modules
window.CoordinateSystem = CoordinateSystem;