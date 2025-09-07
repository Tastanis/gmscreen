/**
 * Simple Coordinate System for 60x60 Hexagonal Grid
 * Clean implementation without any background image dependencies
 */

class CoordinateSystemV2 {
    constructor(hexSize = 20) {
        this.hexSize = hexSize;
        
        // Grid configuration - 60x60 hexes
        this.gridWidth = 60;
        this.gridHeight = 60;
        
        // Grid origin - where hex (0,0) appears on canvas
        this.originX = 0;
        this.originY = 0;
    }
    
    /**
     * Convert axial hex coordinates to pixel coordinates
     * Uses flat-topped hexagon orientation
     */
    hexToPixel(q, r) {
        const x = this.originX + this.hexSize * (3/2 * q);
        const y = this.originY + this.hexSize * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
        return { x, y };
    }
    
    /**
     * Convert pixel coordinates to axial hex coordinates
     */
    pixelToHex(x, y) {
        // Adjust for origin
        const px = x - this.originX;
        const py = y - this.originY;
        
        // Convert to fractional hex coordinates
        const q = (2/3 * px) / this.hexSize;
        const r = (-1/3 * px + Math.sqrt(3)/3 * py) / this.hexSize;
        
        // Round to nearest hex
        return this.hexRound(q, r);
    }
    
    /**
     * Round fractional hex coordinates to nearest integer hex
     */
    hexRound(q, r) {
        const s = -q - r;
        
        let rq = Math.round(q);
        let rr = Math.round(r);
        let rs = Math.round(s);
        
        const qDiff = Math.abs(rq - q);
        const rDiff = Math.abs(rr - r);
        const sDiff = Math.abs(rs - s);
        
        if (qDiff > rDiff && qDiff > sDiff) {
            rq = -rr - rs;
        } else if (rDiff > sDiff) {
            rr = -rq - rs;
        }
        
        return { q: rq, r: rr };
    }
    
    /**
     * Get the 6 vertices of a hexagon
     */
    getHexVertices(q, r) {
        const center = this.hexToPixel(q, r);
        const vertices = [];
        
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i);
            vertices.push({
                x: center.x + this.hexSize * Math.cos(angle),
                y: center.y + this.hexSize * Math.sin(angle)
            });
        }
        
        return vertices;
    }
    
    /**
     * Check if a point is inside a hexagon
     */
    isPointInHex(point, q, r) {
        const vertices = this.getHexVertices(q, r);
        let inside = false;
        
        for (let i = 0, j = 5; i < 6; j = i++) {
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
     * Get all hexes in the 60x60 grid
     */
    getAllHexes() {
        const hexes = [];
        
        // Generate 60x60 grid in offset coordinates
        for (let row = 0; row < this.gridHeight; row++) {
            for (let col = 0; col < this.gridWidth; col++) {
                // Convert offset to axial
                const q = col - Math.floor(row / 2);
                const r = row;
                hexes.push({ q, r });
            }
        }
        
        return hexes;
    }
    
    /**
     * Check if hex is within grid bounds
     */
    isValidHex(q, r) {
        // Convert to offset coordinates
        const col = q + Math.floor(r / 2);
        const row = r;
        
        return col >= 0 && col < this.gridWidth && 
               row >= 0 && row < this.gridHeight;
    }
    
    /**
     * Get hex ID string
     */
    hexToId(q, r) {
        return `${q},${r}`;
    }
}

// Export for use
window.CoordinateSystem = CoordinateSystemV2;