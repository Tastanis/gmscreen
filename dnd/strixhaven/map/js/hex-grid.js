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
        
        // Hex status data (which hexes have data)
        this.hexStatus = new Map();
        
        // All hex data for tooltips
        this.allHexData = new Map();
        
        // Current highlighted hex
        this.hoveredHex = null;
        
        // Tooltip state
        this.tooltipState = {
            currentHex: null,
            hoverTimer: null,
            tooltipElement: null,
            imageRequestId: 0
        };
        
        // Copy mode state
        this.copyMode = {
            active: false,
            sourceHex: null,
            targetHex: null
        };
        
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
            hoverStroke: 'rgba(255, 255, 100, 0.8)',
            dataOutline: 'rgba(128, 128, 128, 0.8)',   // Grey outline for data
            copySource: 'rgba(46, 204, 113, 0.6)',     // Green for copy source
            copyTarget: 'rgba(241, 196, 15, 0.6)'      // Yellow for copy target preview
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
        
        // Load hex status data
        this.loadHexStatus();
        
        // Load all hex data for tooltips
        this.loadAllHexData();
        
        // Initialize tooltip element
        this.tooltipState.tooltipElement = document.getElementById('hex-tooltip');
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
     * Load hex status data from server
     */
    async loadHexStatus() {
        try {
            const response = await fetch('hex-data-handler.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=get_hex_status'
            });
            
            const data = await response.json();
            if (data.success) {
                this.hexStatus.clear();
                for (const [coords, status] of Object.entries(data.hexStatus)) {
                    this.hexStatus.set(coords, status);
                }
                console.log(`Loaded status for ${this.hexStatus.size} hexes`);
                this.render(); // Re-render to show indicators
            } else {
                console.error('Failed to load hex status:', data.error);
            }
        } catch (error) {
            console.error('Error loading hex status:', error);
        }
    }
    
    /**
     * Load all hex data for tooltips
     */
    async loadAllHexData() {
        try {
            const response = await fetch('hex-data-handler.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=get_all_hex_data'
            });
            
            const data = await response.json();
            if (data.success) {
                this.allHexData.clear();
                for (const [coords, hexData] of Object.entries(data.hexData)) {
                    this.allHexData.set(coords, hexData);
                }
                console.log(`Loaded data for ${this.allHexData.size} hexes for tooltips`);
            } else {
                console.error('Failed to load hex data for tooltips:', data.error);
            }
        } catch (error) {
            console.error('Error loading hex data for tooltips:', error);
        }
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
        
        // Draw border overlay to cover hexes outside the image area
        this.drawBorderOverlay();
        
        // Draw copy mode highlights
        if (this.copyMode.active) {
            this.drawCopyModeHighlights();
        }
        
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
     * Draw border overlay around the map image
     * Creates a thick border that covers hexes outside the image area
     */
    drawBorderOverlay() {
        const hexSize = this.coordSystem.hexSize;
        const borderThickness = 1000; // Thick border as requested
        
        // Calculate image boundaries (36x36 hexes starting at hex 0,20)
        const imageStartPos = this.coordSystem.hexToPixel(0, 20);
        const imageWidth = 36 * 1.5 * hexSize;
        const imageHeight = 36 * Math.sqrt(3) * hexSize;
        
        // Store image bounds for click detection
        this.imageBounds = {
            left: imageStartPos.x,
            top: imageStartPos.y,
            right: imageStartPos.x + imageWidth,
            bottom: imageStartPos.y + imageHeight
        };
        
        // Set border color to match page background
        this.ctx.fillStyle = '#1a1a2e';
        
        // Calculate canvas bounds in world coordinates
        const canvasLeft = -this.viewport.offsetX / this.viewport.scale - borderThickness;
        const canvasTop = -this.viewport.offsetY / this.viewport.scale - borderThickness;
        const canvasRight = (this.canvas.width - this.viewport.offsetX) / this.viewport.scale + borderThickness;
        const canvasBottom = (this.canvas.height - this.viewport.offsetY) / this.viewport.scale + borderThickness;
        
        // Draw four rectangles forming the border
        // Top border
        this.ctx.fillRect(
            canvasLeft,
            canvasTop,
            canvasRight - canvasLeft,
            imageStartPos.y - canvasTop
        );
        
        // Bottom border
        this.ctx.fillRect(
            canvasLeft,
            imageStartPos.y + imageHeight,
            canvasRight - canvasLeft,
            canvasBottom - (imageStartPos.y + imageHeight)
        );
        
        // Left border
        this.ctx.fillRect(
            canvasLeft,
            imageStartPos.y,
            imageStartPos.x - canvasLeft,
            imageHeight
        );
        
        // Right border
        this.ctx.fillRect(
            imageStartPos.x + imageWidth,
            imageStartPos.y,
            canvasRight - (imageStartPos.x + imageWidth),
            imageHeight
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
            
            // Draw data indicator if hex has data
            this.drawDataIndicator(hex.q, hex.r);
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
     * Draw data indicator outline for hex if it has data
     */
    drawDataIndicator(q, r) {
        const coords = `${q},${r}`;
        const status = this.hexStatus.get(coords);
        
        if (!status) return; // No data for this hex
        
        // Check if we should show the indicator
        // Show if there's player data (everyone sees it)
        // OR if there's GM data and user is GM (only GM sees it)
        const shouldShowIndicator = status.hasPlayerData || 
                                   (status.hasGMData && window.USER_DATA && window.USER_DATA.isGM);
        
        if (!shouldShowIndicator) return;
        
        // Save the current context state before modifying it
        this.ctx.save();
        
        // Get hex vertices for drawing the outline
        const vertices = this.coordSystem.getHexVertices(q, r);
        
        // Draw hex outline with thicker grey border
        this.ctx.strokeStyle = this.colors.dataOutline;
        this.ctx.lineWidth = 2.5;  // Thicker than normal grid lines
        
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        this.ctx.closePath();
        this.ctx.stroke();
        
        // Restore the original context state
        this.ctx.restore();
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
        
        // Check if mouse is within the image bounds (not in the border area)
        if (this.imageBounds) {
            if (worldX < this.imageBounds.left || worldX > this.imageBounds.right ||
                worldY < this.imageBounds.top || worldY > this.imageBounds.bottom) {
                // Mouse is in the border area, clear any hover
                if (this.hoveredHex) {
                    this.hoveredHex = null;
                    this.render();
                    this.hideTooltip();
                }
                return;
            }
        }
        
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
                
                // Handle tooltip
                this.handleTooltipHover(hex.q, hex.r, clientX, clientY);
            }
            
            // Update tooltip position if showing
            if (this.tooltipState.tooltipElement && this.tooltipState.tooltipElement.classList.contains('visible')) {
                this.updateTooltipPosition(clientX, clientY);
            }
        } else {
            // Clear hover if outside grid
            if (this.hoveredHex) {
                this.hoveredHex = null;
                this.render();
                this.hideTooltip();
            }
        }
    }
    
    /**
     * Handle mouse click
     */
    handleMouseClick(clientX, clientY) {
        // Hide tooltip when clicking
        this.hideTooltip();
        
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;
        
        // Convert to world coordinates
        const worldX = (canvasX - this.viewport.offsetX) / this.viewport.scale;
        const worldY = (canvasY - this.viewport.offsetY) / this.viewport.scale;
        
        // Check if click is within the image bounds (not in the border area)
        if (this.imageBounds) {
            if (worldX < this.imageBounds.left || worldX > this.imageBounds.right ||
                worldY < this.imageBounds.top || worldY > this.imageBounds.bottom) {
                // Click is in the border area, ignore it
                return;
            }
        }
        
        // Get hex at position
        const hex = this.coordSystem.pixelToHex(worldX, worldY);
        
        if (this.coordSystem.isValidHex(hex.q, hex.r)) {
            // Handle copy mode clicks
            if (this.copyMode.active) {
                this.handleCopyModeClick(hex.q, hex.r);
            } else {
                this.showHexPopup(hex.q, hex.r);
            }
        }
    }
    
    /**
     * Show hex details popup
     */
    showHexPopup(q, r) {
        const popup = document.getElementById('hex-popup');
        const hexCoords = document.getElementById('hex-coords');
        
        if (popup && hexCoords) {
            // Set current hex coordinates globally
            currentHex = { q, r };
            
            // Update popup title
            hexCoords.textContent = `Hex (${q}, ${r})`;
            
            // Load hex data
            loadHexData(q, r);
            
            // Show the popup
            popup.style.display = 'block';
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
    
    /**
     * Refresh hex status data and re-render
     */
    refreshHexStatus() {
        this.loadHexStatus();
    }
    
    /**
     * Start copy mode - first click selects source hex
     */
    startCopyMode() {
        this.copyMode.active = true;
        this.copyMode.sourceHex = null;
        this.copyMode.targetHex = null;
        this.render();
        console.log('Copy mode started - click source hex');
    }
    
    /**
     * End copy mode
     */
    endCopyMode() {
        this.copyMode.active = false;
        this.copyMode.sourceHex = null;
        this.copyMode.targetHex = null;
        this.render();
    }
    
    /**
     * Handle clicks during copy mode
     */
    handleCopyModeClick(q, r) {
        if (!this.copyMode.sourceHex) {
            // First click - select source hex
            this.copyMode.sourceHex = { q, r };
            this.render();
            console.log(`Source hex selected: (${q}, ${r}) - now click target hex`);
        } else if (this.copyMode.sourceHex.q === q && this.copyMode.sourceHex.r === r) {
            // Clicking same hex - cancel copy mode
            this.endCopyMode();
            console.log('Copy mode cancelled');
        } else {
            // Second click - select target hex and show copy options
            this.copyMode.targetHex = { q, r };
            this.showCopyOptionsDialog();
        }
    }
    
    /**
     * Show copy options dialog
     */
    showCopyOptionsDialog() {
        const source = this.copyMode.sourceHex;
        const target = this.copyMode.targetHex;
        
        // Trigger the copy dialog from the popup system
        if (window.showCopyDialog) {
            window.showCopyDialog(source.q, source.r, target.q, target.r);
        }
    }
    
    /**
     * Draw copy mode highlights
     */
    drawCopyModeHighlights() {
        // Draw source hex highlight
        if (this.copyMode.sourceHex) {
            const vertices = this.coordSystem.getHexVertices(
                this.copyMode.sourceHex.q,
                this.copyMode.sourceHex.r
            );
            
            this.ctx.fillStyle = this.colors.copySource;
            this.ctx.beginPath();
            this.ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
                this.ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();
            
            this.ctx.strokeStyle = 'rgba(46, 204, 113, 1)';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
        
        // Draw target hex highlight
        if (this.copyMode.targetHex) {
            const vertices = this.coordSystem.getHexVertices(
                this.copyMode.targetHex.q,
                this.copyMode.targetHex.r
            );
            
            this.ctx.fillStyle = this.colors.copyTarget;
            this.ctx.beginPath();
            this.ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
                this.ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();
            
            this.ctx.strokeStyle = 'rgba(241, 196, 15, 1)';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
    }
    
    /**
     * Handle tooltip hover
     */
    handleTooltipHover(q, r, mouseX, mouseY) {
        const coords = `${q},${r}`;
        
        // Clear existing timer
        if (this.tooltipState.hoverTimer) {
            clearTimeout(this.tooltipState.hoverTimer);
        }
        
        // Check if hex has data
        const hexData = this.allHexData.get(coords);
        if (!hexData) {
            this.hideTooltip();
            return;
        }
        
        // Set new timer for 0.25 second delay
        this.tooltipState.hoverTimer = setTimeout(() => {
            this.showTooltip(hexData, mouseX, mouseY);
        }, 250);
    }
    
    /**
     * Show tooltip
     */
    showTooltip(hexData, mouseX, mouseY) {
        if (!this.tooltipState.tooltipElement) return;
        
        // Determine which data to show
        let dataToShow = null;
        let title = '';
        let image = null;
        
        // For players: only show player data
        // For GM: show player data if available, otherwise GM data
        if (hexData.player) {
            dataToShow = hexData.player;
            title = dataToShow.title || 'Location';
            image = dataToShow.firstImage;
        } else if (hexData.gm && window.USER_DATA && window.USER_DATA.isGM) {
            dataToShow = hexData.gm;
            title = dataToShow.title || 'GM Location';
            image = dataToShow.firstImage;
        }
        
        if (!dataToShow) {
            this.hideTooltip();
            return;
        }
        
        // Update tooltip content
        const titleElement = this.tooltipState.tooltipElement.querySelector('.tooltip-title');
        const imageElement = this.tooltipState.tooltipElement.querySelector('.tooltip-image');
        
        // Set title
        if (title) {
            titleElement.textContent = title;
            titleElement.style.display = 'block';
        } else {
            titleElement.style.display = 'none';
        }
        
        // Set image
        if (image) {
            const requestedImage = `hex-images/${image}`;

            // If the requested image is already loaded, show it immediately
            if (imageElement.dataset.currentImage === image) {
                imageElement.style.display = 'block';
            } else {
                // Hide the current image while the new one loads
                imageElement.style.display = 'none';
                imageElement.removeAttribute('src');

                const requestId = ++this.tooltipState.imageRequestId;
                const loader = new Image();

                loader.onload = () => {
                    // Only show if this is still the most recent request
                    if (this.tooltipState.imageRequestId !== requestId) {
                        return;
                    }
                    imageElement.src = requestedImage;
                    imageElement.dataset.currentImage = image;
                    imageElement.style.display = 'block';
                };

                loader.onerror = () => {
                    if (this.tooltipState.imageRequestId !== requestId) {
                        return;
                    }
                    imageElement.style.display = 'none';
                    delete imageElement.dataset.currentImage;
                    imageElement.removeAttribute('src');
                };

                loader.src = requestedImage;
            }
        } else {
            imageElement.style.display = 'none';
            delete imageElement.dataset.currentImage;
            imageElement.removeAttribute('src');
        }
        
        // Only show if there's content
        if (title || image) {
            this.tooltipState.tooltipElement.classList.add('visible');
            this.updateTooltipPosition(mouseX, mouseY);
        }
    }
    
    /**
     * Update tooltip position
     */
    updateTooltipPosition(mouseX, mouseY) {
        if (!this.tooltipState.tooltipElement) return;
        
        const tooltip = this.tooltipState.tooltipElement;
        const offsetX = 15;
        const offsetY = 15;
        
        // Position tooltip near cursor
        tooltip.style.left = (mouseX + offsetX) + 'px';
        tooltip.style.top = (mouseY + offsetY) + 'px';
        
        // Adjust if tooltip goes off screen
        const rect = tooltip.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            tooltip.style.left = (mouseX - rect.width - offsetX) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            tooltip.style.top = (mouseY - rect.height - offsetY) + 'px';
        }
    }
    
    /**
     * Hide tooltip
     */
    hideTooltip() {
        if (this.tooltipState.hoverTimer) {
            clearTimeout(this.tooltipState.hoverTimer);
            this.tooltipState.hoverTimer = null;
        }

        // Cancel any pending image load for the tooltip
        if (this.tooltipState) {
            this.tooltipState.imageRequestId++;
        }

        if (this.tooltipState.tooltipElement) {
            this.tooltipState.tooltipElement.classList.remove('visible');
        }
    }
}

// Export for use
window.HexGrid = HexGridV2;