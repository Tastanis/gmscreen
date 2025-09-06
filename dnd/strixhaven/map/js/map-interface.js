/**
 * Map Interface Controller
 * Main controller that coordinates all map components
 */

class MapInterface {
    constructor() {
        this.canvas = null;
        this.hexGrid = null;
        this.zoomPan = null;
        this.dataManager = null;
        
        // UI elements
        this.loadingOverlay = null;
        this.hexModal = null;
        this.coordinateDisplay = null;
        this.zoomDisplay = null;
        
        // State
        this.isInitialized = false;
        this.currentHex = null;
        this.lastMouseHex = null;
        this.backgroundImagePath = 'images/strixhaven-map.jpg'; // Default background
        
        // User data from PHP
        this.userData = window.USER_DATA || {
            username: 'unknown',
            isGM: false,
            sessionId: 'default'
        };
        
        // Performance monitoring
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        this.fps = 0;
    }
    
    async initialize() {
        try {
            console.log('Initializing Map Interface...');
            
            // Get DOM elements
            this.getUIElements();
            
            // Initialize canvas
            this.initializeCanvas();
            
            // Initialize data manager
            this.dataManager = new HexDataManager();
            this.setupDataManagerCallbacks();
            
            // Initialize hex grid
            await this.initializeHexGrid();
            
            // Initialize zoom and pan
            this.initializeZoomPan();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Load existing hex data
            await this.loadExistingData();
            
            // Hide loading overlay
            this.hideLoading();
            
            // Start render loop
            this.startRenderLoop();
            
            this.isInitialized = true;
            console.log('Map Interface initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize Map Interface:', error);
            this.showError('Failed to initialize map: ' + error.message);
        }
    }
    
    getUIElements() {
        this.canvas = document.getElementById('hex-canvas');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.coordinateDisplay = {
            mouse: document.getElementById('mouse-coords'),
            hex: document.getElementById('hex-coords')
        };
        this.zoomDisplay = document.getElementById('zoom-level');
        
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }
    }
    
    initializeCanvas() {
        // Set canvas to fill container
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Make canvas focusable for keyboard events
        this.canvas.tabIndex = 0;
    }
    
    async initializeHexGrid() {
        console.log('Initializing hex grid...');
        
        // Try to load background image, but don't fail if it doesn't exist
        const imagePath = await this.findBackgroundImage();
        
        this.hexGrid = new HexGrid(this.canvas, imagePath);
        await this.hexGrid.initialize();
        
        // Make hexGrid globally accessible for zoom constraints
        window.hexGrid = this.hexGrid;
        
        console.log('Hex grid initialized');
    }
    
    async findBackgroundImage() {
        // Try different possible background image paths
        const possiblePaths = [
            'images/Strixhavenmap.png',  // Actual file name
            'images/strixhaven-map.jpg',
            'images/strixhaven-map.png',
            'images/background.jpg',
            'images/background.png',
            '../images/strixhaven-map.jpg',
            '../images/background.jpg'
        ];
        
        for (const path of possiblePaths) {
            try {
                const response = await fetch(path, { method: 'HEAD' });
                if (response.ok) {
                    console.log('Found background image:', path);
                    return path;
                }
            } catch (e) {
                // Continue to next path
            }
        }
        
        console.log('No background image found, using solid background');
        return null;
    }
    
    initializeZoomPan() {
        console.log('Initializing zoom and pan...');
        
        this.zoomPan = new ZoomPanController(this.canvas);
        
        // Set up callbacks
        this.zoomPan.onViewportChange = (viewport) => {
            this.handleViewportChange(viewport);
        };
        
        this.zoomPan.onZoomChange = (scale) => {
            this.updateZoomDisplay(scale);
        };
        
        console.log('Zoom and pan initialized');
    }
    
    setupDataManagerCallbacks() {
        this.dataManager.onDataChange = (hexId, data) => {
            this.handleHexDataChange(hexId, data);
        };
        
        this.dataManager.onSaveStatusChange = (status, message) => {
            this.handleSaveStatusChange(status, message);
        };
        
        this.dataManager.onLockStatusChange = (status, hexId) => {
            this.handleLockStatusChange(status, hexId);
        };
        
        this.dataManager.onError = (type, message) => {
            this.showError(`${type} error: ${message}`);
        };
    }
    
    setupEventListeners() {
        // Canvas interaction events - left-click for hex interaction
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        this.canvas.addEventListener('mousemove', this.handleCanvasMouseMove.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleCanvasMouseLeave.bind(this));
        
        // Prevent context menu on right-click but allow right-click dragging
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // UI button events
        this.setupUIButtonEvents();
        
        // Keyboard shortcuts
        this.canvas.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Window resize
        window.addEventListener('resize', this.handleWindowResize.bind(this));
    }
    
    setupUIButtonEvents() {
        // Reset view button
        const resetBtn = document.getElementById('reset-view');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.zoomPan.resetView();
            });
        }
        
        // Toggle grid button
        const gridBtn = document.getElementById('toggle-grid');
        if (gridBtn) {
            gridBtn.addEventListener('click', () => {
                const showGrid = this.hexGrid.toggleGrid();
                gridBtn.textContent = showGrid ? 'Hide Grid' : 'Show Grid';
            });
        }
        
        // GM mode button
        const gmBtn = document.getElementById('admin-mode');
        if (gmBtn && this.userData.isGM) {
            gmBtn.addEventListener('click', () => {
                const debugMode = this.hexGrid.toggleDebug();
                gmBtn.textContent = debugMode ? 'Hide Debug' : 'GM Mode';
            });
        }
        
        // Zoom buttons
        const zoomInBtn = document.getElementById('zoom-in');
        const zoomOutBtn = document.getElementById('zoom-out');
        
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                this.zoomPan.zoomIn();
            });
        }
        
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                this.zoomPan.zoomOut();
            });
        }
    }
    
    handleCanvasClick(event) {
        if (!this.isInitialized) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const viewport = this.zoomPan.getViewport();
        const hex = this.hexGrid.getHexAtPoint(x, y, viewport);
        
        if (hex) {
            console.log(`Left-clicked hex: ${hex.q}, ${hex.r}`);
            this.handleHexClick(hex);
        }
    }
    
    handleCanvasMouseMove(event) {
        if (!this.isInitialized) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Update mouse coordinates display
        this.updateCoordinateDisplay(x, y);
        
        const viewport = this.zoomPan.getViewport();
        const hex = this.hexGrid.getHexAtPoint(x, y, viewport);
        
        // Debug logging for mouse events when debug mode is enabled
        if (this.hexGrid.debugMode && hex) {
            console.log(`Mouse hover detected hex: (${hex.q}, ${hex.r})`);
        } else if (this.hexGrid.debugMode && !hex && this.lastMouseHex) {
            console.log('Mouse left hex area - clearing highlight');
        }
        
        // Update hex highlight
        if (hex && (!this.lastMouseHex || hex.q !== this.lastMouseHex.q || hex.r !== this.lastMouseHex.r)) {
            this.hexGrid.setHighlightedHex(hex);
            this.lastMouseHex = hex;
        } else if (!hex && this.lastMouseHex) {
            this.hexGrid.setHighlightedHex(null);
            this.lastMouseHex = null;
        }
    }
    
    handleCanvasMouseLeave() {
        // Clear highlight when mouse leaves canvas
        this.hexGrid.setHighlightedHex(null);
        this.lastMouseHex = null;
        
        if (this.coordinateDisplay.mouse) {
            this.coordinateDisplay.mouse.textContent = '-';
        }
        if (this.coordinateDisplay.hex) {
            this.coordinateDisplay.hex.textContent = '-';
        }
    }
    
    async handleHexClick(hex) {
        try {
            const hexId = this.hexGrid.coordSystem.hexToId(hex.q, hex.r);
            
            // Load hex data
            const hexData = await this.dataManager.loadHexData(hexId);
            
            // Try to acquire edit lock
            const lockResult = await this.dataManager.acquireLock(hexId);
            
            if (!lockResult.success) {
                if (lockResult.conflict) {
                    this.showLockConflictDialog(lockResult);
                    return;
                }
                throw new Error(lockResult.error);
            }
            
            // Set current hex and show modal
            this.currentHex = { ...hex, id: hexId, data: hexData };
            this.hexGrid.setSelectedHex(hex);
            
            this.showHexEditModal(hexData);
            
        } catch (error) {
            console.error('Failed to handle hex click:', error);
            this.showError('Failed to open hex: ' + error.message);
        }
    }
    
    handleViewportChange(viewport) {
        // Update hex grid rendering
        if (this.hexGrid) {
            this.hexGrid.render(viewport);
        }
    }
    
    updateZoomDisplay(scale) {
        if (this.zoomDisplay) {
            this.zoomDisplay.textContent = `${Math.round(scale * 100)}%`;
        }
    }
    
    updateCoordinateDisplay(mouseX, mouseY) {
        if (this.coordinateDisplay.mouse) {
            this.coordinateDisplay.mouse.textContent = `${Math.round(mouseX)}, ${Math.round(mouseY)}`;
        }
        
        const viewport = this.zoomPan.getViewport();
        const worldPoint = this.zoomPan.screenToWorld(mouseX, mouseY);
        const hex = this.hexGrid.coordSystem.pixelToAxial(worldPoint.x, worldPoint.y);
        
        if (this.coordinateDisplay.hex) {
            this.coordinateDisplay.hex.textContent = `${hex.q}, ${hex.r}`;
        }
    }
    
    handleKeyDown(event) {
        switch (event.key) {
            case 'Escape':
                this.closeHexEditModal();
                event.preventDefault();
                break;
            case 'g':
            case 'G':
                if (!event.ctrlKey && !event.altKey) {
                    this.hexGrid.toggleGrid();
                    event.preventDefault();
                }
                break;
            case 'd':
            case 'D':
                if (this.userData.isGM && !event.ctrlKey && !event.altKey) {
                    this.hexGrid.toggleDebug();
                    event.preventDefault();
                }
                break;
        }
    }
    
    handleWindowResize() {
        if (this.hexGrid) {
            this.hexGrid.resizeCanvas();
        }
    }
    
    showHexEditModal(hexData) {
        // Create modal if it doesn't exist
        if (!this.hexModal) {
            this.createHexEditModal();
        }
        
        // Populate modal with data
        this.populateHexModal(hexData);
        
        // Show modal
        this.hexModal.style.display = 'block';
        
        // Focus first input
        const firstInput = this.hexModal.querySelector('input, textarea');
        if (firstInput) {
            firstInput.focus();
        }
    }
    
    createHexEditModal() {
        this.hexModal = document.createElement('div');
        this.hexModal.className = 'hex-modal';
        this.hexModal.innerHTML = `
            <div class="hex-modal-content">
                <div class="hex-modal-header">
                    <h2>Edit Hex</h2>
                    <button class="close-modal" type="button">&times;</button>
                </div>
                
                <div class="lock-status" id="lock-status" style="display: none;">
                    <span class="lock-message"></span>
                </div>
                
                <form id="hex-edit-form">
                    <div class="hex-form-group">
                        <label for="hex-name">Hex Name</label>
                        <input type="text" id="hex-name" name="hex_name" maxlength="255">
                    </div>
                    
                    <div class="hex-form-group image-upload" id="image-upload-area">
                        <div class="image-upload-text">
                            <p>Drop an image here or click to upload</p>
                            <div class="file-input-wrapper">
                                <label for="hex-image" class="file-input-button">Choose Image</label>
                                <input type="file" id="hex-image" accept="image/*">
                            </div>
                        </div>
                        <img id="image-preview" class="image-preview" style="display: none;">
                    </div>
                    
                    <div class="hex-form-group">
                        <label for="custom-field-1">Custom Field 1</label>
                        <textarea id="custom-field-1" name="custom_field_1" rows="3"></textarea>
                    </div>
                    
                    <div class="hex-form-group">
                        <label for="custom-field-2">Custom Field 2</label>
                        <textarea id="custom-field-2" name="custom_field_2" rows="3"></textarea>
                    </div>
                    
                    <div class="hex-form-group">
                        <label for="custom-field-3">Custom Field 3</label>
                        <textarea id="custom-field-3" name="custom_field_3" rows="3"></textarea>
                    </div>
                    
                    <div class="hex-notes-section player-notes">
                        <div class="hex-notes-header">Player Notes (Shared)</div>
                        <div class="hex-notes-content">
                            <textarea id="player-notes" name="player_notes" rows="4" placeholder="Notes visible to all players..."></textarea>
                        </div>
                    </div>
                    
                    ${this.userData.isGM ? `
                        <div class="hex-notes-section gm-notes">
                            <div class="hex-notes-header">GM Notes (Private)</div>
                            <div class="hex-notes-content">
                                <textarea id="gm-notes" name="gm_notes" rows="4" placeholder="Private GM notes..."></textarea>
                            </div>
                        </div>
                    ` : ''}
                </form>
                
                <div class="hex-modal-actions">
                    <div class="secondary-actions">
                        <div class="save-status" id="save-status">
                            <div class="save-indicator"></div>
                            <span class="save-message">Ready</span>
                        </div>
                    </div>
                    <div class="primary-actions">
                        <button type="button" class="hex-btn hex-btn-secondary" id="cancel-hex">Cancel</button>
                        <button type="button" class="hex-btn hex-btn-primary" id="save-hex">Save</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.hexModal);
        
        // Set up modal event listeners
        this.setupModalEventListeners();
    }
    
    setupModalEventListeners() {
        // Close button
        this.hexModal.querySelector('.close-modal').addEventListener('click', () => {
            this.closeHexEditModal();
        });
        
        // Cancel button
        this.hexModal.querySelector('#cancel-hex').addEventListener('click', () => {
            this.closeHexEditModal();
        });
        
        // Save button
        this.hexModal.querySelector('#save-hex').addEventListener('click', () => {
            this.saveCurrentHex();
        });
        
        // Click outside to close
        this.hexModal.addEventListener('click', (event) => {
            if (event.target === this.hexModal) {
                this.closeHexEditModal();
            }
        });
        
        // Image upload handling
        this.setupImageUpload();
        
        // Form change tracking
        this.setupFormChangeTracking();
    }
    
    setupImageUpload() {
        const uploadArea = this.hexModal.querySelector('#image-upload-area');
        const fileInput = this.hexModal.querySelector('#hex-image');
        const preview = this.hexModal.querySelector('#image-preview');
        
        // File input change
        fileInput.addEventListener('change', (event) => {
            this.handleImageSelection(event.target.files[0]);
        });
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (event) => {
            event.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        
        uploadArea.addEventListener('drop', (event) => {
            event.preventDefault();
            uploadArea.classList.remove('drag-over');
            
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                this.handleImageSelection(files[0]);
            }
        });
        
        // Click to upload
        uploadArea.addEventListener('click', (event) => {
            if (!event.target.closest('.file-input-wrapper')) {
                fileInput.click();
            }
        });
    }
    
    async handleImageSelection(file) {
        if (!file || !this.currentHex) return;
        
        try {
            // Show preview
            const preview = this.hexModal.querySelector('#image-preview');
            const uploadText = this.hexModal.querySelector('.image-upload-text');
            
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'block';
                uploadText.style.display = 'none';
            };
            reader.readAsDataURL(file);
            
            // Upload to server
            const result = await this.dataManager.uploadImage(this.currentHex.id, file);
            
            // Update form data
            this.currentHex.data.image_path = result.image_path;
            
        } catch (error) {
            console.error('Image upload failed:', error);
            this.showError('Image upload failed: ' + error.message);
        }
    }
    
    setupFormChangeTracking() {
        const form = this.hexModal.querySelector('#hex-edit-form');
        const inputs = form.querySelectorAll('input, textarea');
        
        inputs.forEach(input => {
            input.addEventListener('input', (event) => {
                if (this.currentHex) {
                    this.dataManager.queueChange(
                        this.currentHex.id,
                        event.target.name,
                        event.target.value
                    );
                }
            });
        });
    }
    
    populateHexModal(hexData) {
        const form = this.hexModal.querySelector('#hex-edit-form');
        
        // Populate form fields
        form.querySelector('#hex-name').value = hexData.hex_name || '';
        form.querySelector('#custom-field-1').value = hexData.custom_field_1 || '';
        form.querySelector('#custom-field-2').value = hexData.custom_field_2 || '';
        form.querySelector('#custom-field-3').value = hexData.custom_field_3 || '';
        form.querySelector('#player-notes').value = hexData.player_notes || '';
        
        if (this.userData.isGM) {
            form.querySelector('#gm-notes').value = hexData.gm_notes || '';
        }
        
        // Show existing image if present
        if (hexData.image_path) {
            const preview = this.hexModal.querySelector('#image-preview');
            const uploadText = this.hexModal.querySelector('.image-upload-text');
            
            preview.src = hexData.image_path;
            preview.style.display = 'block';
            uploadText.style.display = 'none';
        }
        
        // Update modal title
        const title = this.hexModal.querySelector('.hex-modal-header h2');
        if (this.currentHex) {
            title.textContent = `Edit Hex (${this.currentHex.q}, ${this.currentHex.r})`;
        }
    }
    
    async saveCurrentHex() {
        if (!this.currentHex) return;
        
        try {
            const form = this.hexModal.querySelector('#hex-edit-form');
            const formData = new FormData(form);
            
            const data = {};
            for (const [key, value] of formData.entries()) {
                data[key] = value;
            }
            
            // Add image path if set
            if (this.currentHex.data.image_path) {
                data.image_path = this.currentHex.data.image_path;
            }
            
            const expectedVersion = this.currentHex.data.version_number;
            const result = await this.dataManager.saveHexData(this.currentHex.id, data, expectedVersion);
            
            if (result.success || result.version_number) {
                // Update hex grid
                this.hexGrid.setHexData(this.currentHex.id, data);
                
                // Close modal
                this.closeHexEditModal();
            }
            
        } catch (error) {
            console.error('Failed to save hex:', error);
            this.showError('Failed to save hex: ' + error.message);
        }
    }
    
    async closeHexEditModal() {
        if (!this.hexModal || !this.currentHex) return;
        
        // Release edit lock
        await this.dataManager.releaseLock(this.currentHex.id);
        
        // Clear selection
        this.hexGrid.setSelectedHex(null);
        this.currentHex = null;
        
        // Hide modal
        this.hexModal.style.display = 'none';
    }
    
    showLockConflictDialog(lockResult) {
        const message = `This hex is currently being edited by ${lockResult.lockedBy}.\nLock expires at ${lockResult.expiresAt}.\nTry again later.`;
        alert(message);
    }
    
    handleHexDataChange(hexId, data) {
        // Update hex grid display
        this.hexGrid.setHexData(hexId, data);
    }
    
    handleSaveStatusChange(status, message) {
        const statusElement = this.hexModal?.querySelector('#save-status');
        if (!statusElement) return;
        
        const messageElement = statusElement.querySelector('.save-message');
        statusElement.className = `save-status ${status}`;
        
        if (messageElement) {
            messageElement.textContent = message;
        }
    }
    
    handleLockStatusChange(status, hexId) {
        const lockStatus = this.hexModal?.querySelector('#lock-status');
        if (!lockStatus) return;
        
        const lockMessage = lockStatus.querySelector('.lock-message');
        
        if (status === 'acquired') {
            lockStatus.style.display = 'block';
            lockMessage.textContent = 'Edit lock acquired';
            lockStatus.className = 'lock-status acquired';
        } else if (status === 'released') {
            lockStatus.style.display = 'none';
        }
    }
    
    async loadExistingData() {
        try {
            console.log('Loading existing hex data...');
            
            // Load all hexes with data
            const hexData = await this.dataManager.loadAllHexData({ hasData: true });
            
            if (hexData.length > 0) {
                console.log(`Loaded ${hexData.length} hexes with data`);
                this.hexGrid.bulkUpdateHexData(hexData);
            }
            
        } catch (error) {
            console.error('Failed to load existing data:', error);
        }
    }
    
    startRenderLoop() {
        const render = (timestamp) => {
            // Calculate FPS
            this.frameCount++;
            if (timestamp - this.lastFpsUpdate >= 1000) {
                this.fps = Math.round((this.frameCount * 1000) / (timestamp - this.lastFpsUpdate));
                this.frameCount = 0;
                this.lastFpsUpdate = timestamp;
            }
            
            // Render hex grid
            const viewport = this.zoomPan.getViewport();
            this.hexGrid.render(viewport);
            
            requestAnimationFrame(render);
        };
        
        requestAnimationFrame(render);
    }
    
    hideLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('hidden');
        }
    }
    
    showError(message) {
        console.error('Map Interface Error:', message);
        
        // For now, use alert - could be enhanced with a better notification system
        alert('Error: ' + message);
    }
    
    // Public API methods
    
    getPerformanceMetrics() {
        return {
            fps: this.fps,
            hexGrid: this.hexGrid ? this.hexGrid.getPerformanceMetrics() : null,
            dataManager: {
                pendingChanges: this.dataManager ? this.dataManager.getPendingChangesCount() : 0,
                isOnline: this.dataManager ? this.dataManager.isOnlineStatus() : false
            }
        };
    }
    
    exportHexData() {
        return this.hexGrid ? this.hexGrid.exportHexData() : [];
    }
    
    clearAllData() {
        if (this.hexGrid) {
            this.hexGrid.clearAllData();
        }
        if (this.dataManager) {
            this.dataManager.clearAllCache();
        }
    }
    
    destroy() {
        // Clean up all components
        if (this.dataManager) {
            this.dataManager.destroy();
        }
        
        if (this.zoomPan) {
            this.zoomPan.destroy();
        }
        
        if (this.hexModal) {
            this.hexModal.remove();
        }
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleWindowResize);
    }
}

// Export for use in other modules
window.MapInterface = MapInterface;