/**
 * Coordinate System for Hexagonal Grid
 * Uses axial coordinates (q, r) for mathematical efficiency
 * Provides conversion between pixel coordinates and hex coordinates
 */

class CoordinateSystem {
    constructor(hexSize = 30) {
        this.hexSize = hexSize;
        
        // Hexagon geometry constants
        this.hexWidth = hexSize * 2;
        this.hexHeight = hexSize * Math.sqrt(3);
        this.hexHorizontalSpacing = hexSize * 3/2;
        this.hexVerticalSpacing = this.hexHeight;
        
        // Grid configuration
        this.gridConfig = {
            imageWidth: 2048,        // Background image width
            imageHeight: 1536,       // Background image height
            gridOriginX: 100,        // Where hex (0,0) appears on image
            gridOriginY: 200,        // Where hex (0,0) appears on image
            gridWidth: 40,           // Number of hexes horizontally
            gridHeight: 35,          // Number of hexes vertically
            hexSize: hexSize
        };
    }
    
    /**
     * Convert axial coordinates to pixel coordinates
     * @param {number} q - Axial coordinate q
     * @param {number} r - Axial coordinate r
     * @returns {Object} {x, y} pixel coordinates
     */
    axialToPixel(q, r) {
        const x = this.hexSize * (3/2 * q);
        const y = this.hexSize * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
        return { x, y };
    }
    
    /**
     * Convert pixel coordinates to axial coordinates
     * @param {number} x - Pixel x coordinate
     * @param {number} y - Pixel y coordinate
     * @returns {Object} {q, r} axial coordinates
     */
    pixelToAxial(x, y) {
        const q = (2/3 * x) / this.hexSize;
        const r = (-1/3 * x + Math.sqrt(3)/3 * y) / this.hexSize;
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
        // Convert to offset coordinates for bounds checking
        const offsetCoord = this.axialToOffset(hex.q, hex.r);
        
        return offsetCoord.col >= 0 && 
               offsetCoord.col < this.gridConfig.gridWidth &&
               offsetCoord.row >= 0 && 
               offsetCoord.row < this.gridConfig.gridHeight;
    }
    
    /**
     * Convert axial coordinates to offset coordinates (for bounds checking)
     * @param {number} q - Axial q coordinate
     * @param {number} r - Axial r coordinate
     * @returns {Object} {col, row} offset coordinates
     */
    axialToOffset(q, r) {
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
        const q = col - (row - (row & 1)) / 2;
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
        
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
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
     * Generate all hex coordinates for the grid
     * @returns {Array} Array of all valid hex coordinates
     */
    generateAllHexes() {
        const hexes = [];
        
        for (let row = 0; row < this.gridConfig.gridHeight; row++) {
            for (let col = 0; col < this.gridConfig.gridWidth; col++) {
                const axial = this.offsetToAxial(col, row);
                if (this.isValidHex(axial)) {
                    hexes.push(axial);
                }
            }
        }
        
        return hexes;
    }
    
    /**
     * Get hexes visible in a rectangular viewport
     * @param {Object} viewport - Viewport bounds {left, top, right, bottom}
     * @returns {Array} Array of hex coordinates visible in viewport
     */
    getVisibleHexes(viewport) {
        const visibleHexes = [];
        
        // Convert viewport corners to hex coordinates
        const topLeft = this.pixelToAxial(viewport.left, viewport.top);
        const bottomRight = this.pixelToAxial(viewport.right, viewport.bottom);
        
        // Add some padding to ensure we catch hexes on the edge
        const padding = 2;
        const minQ = topLeft.q - padding;
        const maxQ = bottomRight.q + padding;
        const minR = topLeft.r - padding;
        const maxR = bottomRight.r + padding;
        
        for (let q = minQ; q <= maxQ; q++) {
            for (let r = minR; r <= maxR; r++) {
                const hex = { q, r };
                if (this.isValidHex(hex)) {
                    const pixel = this.axialToPixel(q, r);
                    
                    // Check if hex center is reasonably close to viewport
                    if (pixel.x >= viewport.left - this.hexSize &&
                        pixel.x <= viewport.right + this.hexSize &&
                        pixel.y >= viewport.top - this.hexSize &&
                        pixel.y <= viewport.bottom + this.hexSize) {
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