/**
 * Hex Data Manager - Client Side
 * Handles data operations and API communication for hex data
 */

class HexDataManager {
    constructor() {
        this.apiBaseUrl = 'api/hex-api.php';
        this.currentHex = null;
        this.editLock = null;
        this.autoSaveInterval = null;
        this.changeQueue = new Map();
        this.isOnline = navigator.onLine;
        
        // Cache for hex data
        this.hexCache = new Map();
        
        // Event callbacks
        this.onDataChange = null;
        this.onLockStatusChange = null;
        this.onSaveStatusChange = null;
        this.onError = null;
        
        this.initialize();
    }
    
    initialize() {
        // Set up auto-save
        this.startAutoSave();
        
        // Handle page unload
        window.addEventListener('beforeunload', this.handlePageUnload.bind(this));
        
        // Monitor network status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.syncPendingChanges();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
        
        console.log('HexDataManager initialized');
    }
    
    /**
     * Load hex data from server
     * @param {string} hexId - Hex identifier
     * @returns {Promise<Object>} Hex data
     */
    async loadHexData(hexId) {
        try {
            // Check cache first
            if (this.hexCache.has(hexId)) {
                return this.hexCache.get(hexId);
            }
            
            const response = await fetch(`${this.apiBaseUrl}?action=get_hex&hex_id=${encodeURIComponent(hexId)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to load hex data');
            }
            
            // Cache the data
            this.hexCache.set(hexId, result.data);
            
            return result.data;
            
        } catch (error) {
            console.error('Failed to load hex data:', error);
            
            if (this.onError) {
                this.onError('load', error.message);
            }
            
            // Return default data structure if load fails
            return {
                hex_id: hexId,
                hex_name: null,
                image_path: null,
                custom_field_1: null,
                custom_field_2: null,
                custom_field_3: null,
                gm_notes: null,
                player_notes: null,
                version_number: 0,
                has_data: false
            };
        }
    }
    
    /**
     * Save hex data to server
     * @param {string} hexId - Hex identifier
     * @param {Object} data - Hex data to save
     * @param {number} expectedVersion - Expected version for conflict detection
     * @returns {Promise<Object>} Save result
     */
    async saveHexData(hexId, data, expectedVersion = null) {
        try {
            this.triggerSaveStatusChange('saving', 'Saving changes...');
            
            const payload = {
                action: 'save_hex',
                hex_id: hexId,
                data: data,
                expected_version: expectedVersion
            };
            
            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (response.status === 409) {
                // Conflict detected
                this.triggerSaveStatusChange('conflict', 'Data conflict detected');
                return {
                    success: false,
                    conflict: true,
                    error: result.error,
                    currentData: result.details?.current_data
                };
            }
            
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to save hex data');
            }
            
            // Update cache
            const updatedData = { ...data, version_number: result.data.version_number };
            this.hexCache.set(hexId, updatedData);
            
            this.triggerSaveStatusChange('saved', 'Changes saved successfully');
            
            if (this.onDataChange) {
                this.onDataChange(hexId, updatedData);
            }
            
            return result.data;
            
        } catch (error) {
            console.error('Failed to save hex data:', error);
            this.triggerSaveStatusChange('error', 'Save failed: ' + error.message);
            
            if (this.onError) {
                this.onError('save', error.message);
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Acquire edit lock for a hex
     * @param {string} hexId - Hex identifier
     * @returns {Promise<Object>} Lock result
     */
    async acquireLock(hexId) {
        try {
            const payload = {
                action: 'acquire_lock',
                hex_id: hexId
            };
            
            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (response.status === 409) {
                // Lock conflict
                return {
                    success: false,
                    conflict: true,
                    error: result.error,
                    lockedBy: result.details?.locked_by,
                    expiresAt: result.details?.expires_at
                };
            }
            
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to acquire lock');
            }
            
            this.editLock = {
                hexId: hexId,
                expiresAt: result.data.expires_at
            };
            
            this.triggerLockStatusChange('acquired', hexId);
            
            // Set up lock renewal
            this.scheduleLockRenewal(hexId);
            
            return result.data;
            
        } catch (error) {
            console.error('Failed to acquire lock:', error);
            
            if (this.onError) {
                this.onError('lock', error.message);
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Release edit lock for a hex
     * @param {string} hexId - Hex identifier
     * @returns {Promise<boolean>} Success status
     */
    async releaseLock(hexId) {
        try {
            const payload = {
                action: 'release_lock',
                hex_id: hexId
            };
            
            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.editLock = null;
                this.triggerLockStatusChange('released', hexId);
                return true;
            } else {
                console.warn('Failed to release lock:', result.error);
                return false;
            }
            
        } catch (error) {
            console.error('Failed to release lock:', error);
            return false;
        }
    }
    
    /**
     * Upload image for a hex
     * @param {string} hexId - Hex identifier  
     * @param {File} file - Image file to upload
     * @returns {Promise<Object>} Upload result
     */
    async uploadImage(hexId, file) {
        try {
            // Validate file
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                throw new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
            }
            
            if (file.size > 5 * 1024 * 1024) {
                throw new Error('File too large. Maximum size is 5MB.');
            }
            
            this.triggerSaveStatusChange('uploading', 'Uploading image...');
            
            const formData = new FormData();
            formData.append('action', 'upload_image');
            formData.append('hex_id', hexId);
            formData.append('image', file);
            
            const response = await fetch(this.apiBaseUrl, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to upload image');
            }
            
            this.triggerSaveStatusChange('saved', 'Image uploaded successfully');
            
            return result.data;
            
        } catch (error) {
            console.error('Failed to upload image:', error);
            this.triggerSaveStatusChange('error', 'Upload failed: ' + error.message);
            
            if (this.onError) {
                this.onError('upload', error.message);
            }
            
            throw error;
        }
    }
    
    /**
     * Load all hex data with filters
     * @param {Object} filters - Optional filters
     * @returns {Promise<Array>} Array of hex data
     */
    async loadAllHexData(filters = {}) {
        try {
            const params = new URLSearchParams({ action: 'get_all_hexes' });
            
            if (filters.hasData) {
                params.append('has_data', 'true');
            }
            
            if (filters.updatedAfter) {
                params.append('updated_after', filters.updatedAfter);
            }
            
            const response = await fetch(`${this.apiBaseUrl}?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to load hex data');
            }
            
            // Update cache with loaded data
            result.data.forEach(hex => {
                this.hexCache.set(hex.hex_id, hex);
            });
            
            return result.data;
            
        } catch (error) {
            console.error('Failed to load all hex data:', error);
            
            if (this.onError) {
                this.onError('load_all', error.message);
            }
            
            return [];
        }
    }
    
    /**
     * Queue changes for auto-save
     * @param {string} hexId - Hex identifier
     * @param {string} fieldName - Field that changed
     * @param {*} newValue - New field value
     */
    queueChange(hexId, fieldName, newValue) {
        if (!this.changeQueue.has(hexId)) {
            this.changeQueue.set(hexId, {});
        }
        
        const hexChanges = this.changeQueue.get(hexId);
        hexChanges[fieldName] = {
            value: newValue,
            timestamp: Date.now()
        };
        
        // Trigger save status change
        this.triggerSaveStatusChange('pending', 'Changes pending...');
    }
    
    /**
     * Process pending changes (auto-save)
     */
    async processPendingChanges() {
        if (this.changeQueue.size === 0 || !this.isOnline) {
            return;
        }
        
        for (const [hexId, changes] of this.changeQueue.entries()) {
            try {
                // Build data object from queued changes
                const data = {};
                for (const [field, change] of Object.entries(changes)) {
                    data[field] = change.value;
                }
                
                // Get current hex data for version info
                const currentData = this.hexCache.get(hexId) || {};
                const expectedVersion = currentData.version_number;
                
                const result = await this.saveHexData(hexId, data, expectedVersion);
                
                if (result.success) {
                    // Remove successfully saved changes
                    this.changeQueue.delete(hexId);
                } else if (result.conflict) {
                    // Handle conflict - for now, just log it
                    console.warn(`Conflict detected for hex ${hexId}:`, result);
                }
                
            } catch (error) {
                console.error(`Failed to auto-save hex ${hexId}:`, error);
            }
        }
    }
    
    /**
     * Start auto-save timer
     */
    startAutoSave() {
        this.autoSaveInterval = setInterval(() => {
            this.processPendingChanges();
        }, 30000); // 30 seconds
    }
    
    /**
     * Stop auto-save timer
     */
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }
    
    /**
     * Schedule lock renewal
     */
    scheduleLockRenewal(hexId) {
        // Renew lock after 4 minutes (before 5 minute expiry)
        setTimeout(() => {
            if (this.editLock && this.editLock.hexId === hexId) {
                this.renewLock(hexId);
            }
        }, 4 * 60 * 1000);
    }
    
    /**
     * Renew edit lock
     */
    async renewLock(hexId) {
        try {
            const result = await this.acquireLock(hexId);
            if (result.success) {
                console.log(`Lock renewed for hex ${hexId}`);
            }
        } catch (error) {
            console.error('Failed to renew lock:', error);
        }
    }
    
    /**
     * Handle page unload - save pending changes and release locks
     */
    handlePageUnload(event) {
        // Try to save pending changes
        if (this.changeQueue.size > 0) {
            // Browser will show generic message
            event.preventDefault();
            event.returnValue = '';
            
            // Use sendBeacon for final save attempt
            const payload = JSON.stringify({
                action: 'emergency_save',
                changes: Object.fromEntries(this.changeQueue)
            });
            
            navigator.sendBeacon(this.apiBaseUrl, payload);
        }
        
        // Release lock
        if (this.editLock) {
            const payload = JSON.stringify({
                action: 'release_lock',
                hex_id: this.editLock.hexId
            });
            
            navigator.sendBeacon(this.apiBaseUrl, payload);
        }
    }
    
    /**
     * Sync pending changes when coming back online
     */
    async syncPendingChanges() {
        console.log('Back online - syncing pending changes');
        await this.processPendingChanges();
    }
    
    /**
     * Trigger save status change callback
     */
    triggerSaveStatusChange(status, message) {
        if (this.onSaveStatusChange) {
            this.onSaveStatusChange(status, message);
        }
    }
    
    /**
     * Trigger lock status change callback
     */
    triggerLockStatusChange(status, hexId) {
        if (this.onLockStatusChange) {
            this.onLockStatusChange(status, hexId);
        }
    }
    
    /**
     * Get cached hex data
     */
    getCachedHexData(hexId) {
        return this.hexCache.get(hexId);
    }
    
    /**
     * Clear cache for specific hex
     */
    clearHexCache(hexId) {
        this.hexCache.delete(hexId);
    }
    
    /**
     * Clear entire cache
     */
    clearAllCache() {
        this.hexCache.clear();
    }
    
    /**
     * Get pending changes count
     */
    getPendingChangesCount() {
        return this.changeQueue.size;
    }
    
    /**
     * Check if hex has pending changes
     */
    hasPendingChanges(hexId) {
        return this.changeQueue.has(hexId);
    }
    
    /**
     * Get current edit lock info
     */
    getCurrentLock() {
        return this.editLock;
    }
    
    /**
     * Check if online
     */
    isOnlineStatus() {
        return this.isOnline;
    }
    
    /**
     * Manual save of all pending changes
     */
    async saveAllPendingChanges() {
        await this.processPendingChanges();
    }
    
    /**
     * Destroy the data manager
     */
    destroy() {
        this.stopAutoSave();
        
        // Remove event listeners
        window.removeEventListener('beforeunload', this.handlePageUnload);
        
        // Clear caches
        this.clearAllCache();
        this.changeQueue.clear();
        
        // Release any locks
        if (this.editLock) {
            this.releaseLock(this.editLock.hexId);
        }
    }
}

// Export for use in other modules
window.HexDataManager = HexDataManager;