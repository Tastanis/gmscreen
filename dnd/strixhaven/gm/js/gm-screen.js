// =============================================================================
// GM Screen JavaScript with Popup Tabs and Dice Roller - Updated
// =============================================================================

class GMScreen {
    constructor() {
        this.currentTab = null;
        this.autoSaveInterval = null;
        this.tabs = {
            'left-1': [],
            'left-2': [],
            'right-1': [],
            'right-2': []
        };
        this.panelTitles = {
            'left-panel-1': 'Notes',
            'left-panel-2': 'References', 
            'right-panel-1': 'Rules',
            'right-panel-2': 'Campaign'
        };
        this.unsavedChanges = false;
        this.richTextEditor = null;
        this.diceRoller = null;
        this.currentPopup = null;
        this.localStorageKey = 'gmscreen_unsaved_tabs';
        this.recoveryCheckInterval = null;
    }

    // Initialize the GM Screen
    async init() {
        console.log('Initializing GM Screen with Popup Tabs and Dice Roller...');
        
        try {
            // Wait for DOM to be fully loaded
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            // Initialize character lookup first
            if (window.characterLookup) {
                try {
                    await window.characterLookup.init();
                } catch (error) {
                    console.warn('Character lookup initialization failed:', error);
                }
            }
            
            await this.loadTabs();
            await this.loadPanelTitles();
            this.setupEventListeners();
            this.updateSessionInfo();
            this.setupAutoSave();
            this.initializeDiceRoller();
            this.checkForRecoverableData();
            this.setupRecoveryCheck();
            
            console.log('GM Screen initialized successfully');
        } catch (error) {
            console.error('Error initializing GM Screen:', error);
        }
    }

    // Load tabs configuration from server
    async loadTabs() {
        try {
            console.log('Loading tabs from server...');
            
            const formData = new FormData();
            formData.append('action', 'load_tabs');
            
            const response = await fetch('index.php', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.tabs) {
                this.tabs = data.tabs;
                console.log('Loaded tabs successfully:', this.tabs);
            } else {
                console.error('Failed to load tabs:', data.error || 'Unknown error');
                this.tabs = this.getDefaultTabs();
            }
        } catch (error) {
            console.error('Error loading tabs:', error);
            this.tabs = this.getDefaultTabs();
        }
        
        this.renderTabs();
    }

    // Load panel titles from server
    async loadPanelTitles() {
        try {
            const formData = new FormData();
            formData.append('action', 'load_panel_titles');
            
            const response = await fetch('index.php', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.panelTitles) {
                this.panelTitles = { ...this.panelTitles, ...data.panelTitles };
                this.updatePanelTitlesUI();
            }
        } catch (error) {
            console.error('Error loading panel titles:', error);
        }
    }

    // Update panel titles in the UI
    updatePanelTitlesUI() {
        Object.entries(this.panelTitles).forEach(([panelId, title]) => {
            const titleElement = document.querySelector(`#${panelId} .panel-title`);
            if (titleElement) {
                titleElement.textContent = title;
            }
            
            // Also update the h3 in panel header
            const headerElement = document.querySelector(`#${panelId} .panel-header h3`);
            if (headerElement) {
                headerElement.textContent = title;
            }
        });
    }

    // Get default tab configuration
    getDefaultTabs() {
        const panels = ['left-1', 'left-2', 'right-1', 'right-2'];
        const panelNames = ['Note', 'Reference', 'Rule', 'Campaign'];
        const result = {};
        
        panels.forEach((panel, panelIndex) => {
            result[panel] = [];
            for (let i = 1; i <= 20; i++) {
                result[panel].push({
                    id: `${panel}-${i}`,
                    name: `${panelNames[panelIndex]} ${i}`,
                    content: '',
                    lastModified: new Date().toISOString(),
                    created: new Date().toISOString()
                });
            }
        });
        
        return result;
    }

    // Render tabs in the UI
    renderTabs() {
        console.log('Rendering all tabs...');
        const panels = ['left-1', 'left-2', 'right-1', 'right-2'];
        
        panels.forEach(panel => {
            if (this.tabs[panel] && Array.isArray(this.tabs[panel])) {
                this.renderTabSet(panel, this.tabs[panel]);
            } else {
                console.warn(`No valid tabs data for panel: ${panel}`);
                // Create empty tabs for this panel
                this.tabs[panel] = [];
                this.renderTabSet(panel, []);
            }
        });
    }

    renderTabSet(panel, tabs) {
        console.log(`Rendering tabs for panel: ${panel}`, tabs);
        const container = document.getElementById(`${panel}-tabs`);
        if (!container) {
            console.error(`Container not found: ${panel}-tabs`);
            return;
        }
        
        container.innerHTML = '';
        
        if (!tabs || !Array.isArray(tabs)) {
            console.error(`Invalid tabs data for panel ${panel}:`, tabs);
            return;
        }
        
        // Sort tabs by ID to ensure consistent order
        const sortedTabs = tabs.sort((a, b) => {
            const aNum = parseInt(a.id.split('-').pop());
            const bNum = parseInt(b.id.split('-').pop());
            return aNum - bNum;
        });
        
        sortedTabs.forEach((tab, index) => {
            if (tab && tab.id && tab.name) {
                const tabElement = this.createTabElement(tab, panel, index);
                container.appendChild(tabElement);
            } else {
                console.warn(`Invalid tab data:`, tab);
            }
        });
        
        console.log(`Successfully rendered ${sortedTabs.length} tabs for panel ${panel}`);
    }

    createTabElement(tab, panel, index) {
        const div = document.createElement('div');
        div.className = 'tab-item';
        div.dataset.tabId = tab.id;
        div.dataset.panel = panel;
        div.dataset.index = index;
        
        // Add content indicator
        const hasContent = tab.content && tab.content.trim() !== '';
        const contentIndicator = hasContent ? ' ✓' : '';
        
        div.innerHTML = `
            <span class="tab-name">${this.escapeHtml(tab.name)}${contentIndicator}</span>
            <div class="tab-actions">
                <button class="tab-action-btn" title="Open in Popup">📝</button>
            </div>
        `;
        
        // Add click handler for the tab - OPEN IN POPUP
        div.addEventListener('click', (e) => {
            // Don't open if clicking on action button
            if (!e.target.classList.contains('tab-action-btn')) {
                this.openTabInPopup(tab.id);
            }
        });
        
        // Add action button click handler
        const actionBtn = div.querySelector('.tab-action-btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openTabInPopup(tab.id);
            });
        }
        
        return div;
    }

    // Open tab in popup instead of new window
    openTabInPopup(tabId) {
        console.log('Opening tab in popup:', tabId);
        
        const tab = this.findTabById(tabId);
        if (!tab) {
            console.error('Tab not found:', tabId);
            return;
        }
        
        // Close existing popup if any
        this.closeTabPopup();
        
        // Create popup
        this.createTabPopup(tab);
    }

    // Create tab popup
    createTabPopup(tab) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'tab-popup-overlay';
        overlay.addEventListener('click', () => this.closeTabPopup());
        
        // Create popup
        const popup = document.createElement('div');
        popup.className = 'tab-popup';
        
        // Determine panel name for the tab
        let panelName = 'Note';
        if (tab.id.includes('left-1')) panelName = this.panelTitles['left-panel-1'] || 'Notes';
        else if (tab.id.includes('left-2')) panelName = this.panelTitles['left-panel-2'] || 'References';
        else if (tab.id.includes('right-1')) panelName = this.panelTitles['right-panel-1'] || 'Rules';
        else if (tab.id.includes('right-2')) panelName = this.panelTitles['right-panel-2'] || 'Campaign';
        
        popup.innerHTML = `
            <div class="tab-popup-header">
                <input type="text" class="tab-popup-title" value="${this.escapeHtml(tab.name)}" placeholder="Tab Name">
                <div class="tab-popup-controls">
                    <div id="popup-save-status" class="save-status" style="margin-right: 10px;"></div>
                    <button class="popup-to-tab-btn" title="Open in New Tab">Open in Tab</button>
                    <button class="tab-popup-close">&times;</button>
                </div>
            </div>
            <div class="tab-popup-body">
                <div id="popup-rich-text-container" class="rich-text-container">
                    <!-- Rich text editor will be initialized here -->
                </div>
            </div>
        `;
        
        // Add character autocomplete container to the popup
        const autocompleteContainer = document.createElement('div');
        autocompleteContainer.id = 'popup-character-autocomplete';
        autocompleteContainer.className = 'character-autocomplete';
        autocompleteContainer.style.display = 'none';
        popup.appendChild(autocompleteContainer);
        
        // Add to DOM
        document.body.appendChild(overlay);
        document.body.appendChild(popup);
        
        // Setup event listeners
        const closeBtn = popup.querySelector('.tab-popup-close');
        closeBtn.addEventListener('click', () => this.closeTabPopup());
        
        const toTabBtn = popup.querySelector('.popup-to-tab-btn');
        toTabBtn.addEventListener('click', () => this.convertPopupToTab(tab, panelName));
        
        // Initialize rich text editor
        this.initializePopupEditor(tab, popup);
        
        // Store current popup reference
        this.currentPopup = { popup, overlay, tab };
        
        // Reset unsaved changes flag when popup opens
        this.unsavedChanges = false;
        
        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closeTabPopup();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    // Initialize rich text editor in popup - FIXED VERSION
    async initializePopupEditor(tab, popup) {
        try {
            console.log('Initializing popup editor for tab:', tab.id);
            
            const container = popup.querySelector('#popup-rich-text-container');
            if (!container) {
                throw new Error('Rich text container not found in popup');
            }
            
            // Make sure RichTextEditor is available
            if (typeof RichTextEditor === 'undefined') {
                throw new Error('RichTextEditor not loaded');
            }
            
            // Wait a bit for popup to be fully rendered
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const richTextEditor = new RichTextEditor(container, {
                placeholder: 'Enter your notes here... Type [[character name]] to link to characters'
            });
            
            richTextEditor.init();
            richTextEditor.setContent(tab.content || '');
            
            // FIXED: Store editor reference properly
            if (!this.currentPopup) {
                this.currentPopup = { tab, popup };
            }
            this.currentPopup.richTextEditor = richTextEditor;
            
            // Setup change detection with debounce
            let saveTimeout;
            richTextEditor.onChange(() => {
                this.unsavedChanges = true;
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    // Simple delay to allow any quick operations to complete
                    setTimeout(() => {
                        this.saveTabFromPopup(tab, popup, richTextEditor);
                    }, 100);
                }, 1000); // Reduced back to 1000ms
            });
            
            // Setup character lookup if available
            if (window.characterLookup && window.characterLookup.isInitialized) {
                const editor = richTextEditor.getEditor();
                if (editor) {
                    console.log('Setting up character lookup for popup editor...');
                    window.characterLookup.setupEditorListeners(editor);
                    console.log('Character lookup connected to popup editor');
                } else {
                    console.warn('Could not get editor element for character lookup');
                }
            } else {
                console.warn('Character lookup not ready for popup editor');
                
                // Try to initialize character lookup if it hasn't been done
                if (window.characterLookup && !window.characterLookup.isInitialized) {
                    try {
                        await window.characterLookup.init();
                        const editor = richTextEditor.getEditor();
                        if (editor && window.characterLookup.isInitialized) {
                            window.characterLookup.setupEditorListeners(editor);
                            console.log('Character lookup initialized and connected to popup editor');
                        }
                    } catch (error) {
                        console.warn('Failed to initialize character lookup:', error);
                    }
                }
            }
            
            // Setup title change detection
            const titleInput = popup.querySelector('.tab-popup-title');
            if (titleInput) {
                titleInput.addEventListener('input', () => {
                    this.unsavedChanges = true;
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        // Simple delay to allow any quick operations to complete
                        setTimeout(() => {
                            this.saveTabFromPopup(tab, popup, richTextEditor);
                        }, 100);
                    }, 1000); // Reduced back to 1000ms
                });
            }
            
            console.log('Popup editor initialized successfully');
            
        } catch (error) {
            console.error('Error initializing popup editor:', error);
            
            // FIXED: Fallback to simple textarea if rich editor fails
            const container = popup.querySelector('#popup-rich-text-container');
            if (container) {
                container.innerHTML = `
                    <div style="padding: 10px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 10px;">
                        <strong>Rich text editor failed to load.</strong> Using fallback editor.
                    </div>
                    <textarea style="width: 100%; height: 400px; padding: 15px; border: 1px solid #ddd; border-radius: 6px; font-family: inherit; font-size: 14px; resize: vertical;" placeholder="Enter your notes here...">${tab.content || ''}</textarea>
                `;
                
                // Setup basic save functionality
                const textarea = container.querySelector('textarea');
                if (textarea) {
                    textarea.addEventListener('input', () => {
                        this.unsavedChanges = true;
                    });
                    
                    // Store a simple editor interface
                    this.currentPopup.richTextEditor = {
                        getContent: () => textarea.value,
                        destroy: () => {}
                    };
                }
            }
        }
    }

    // Save tab from popup with retry logic
    async saveTabFromPopup(tab, popup, richTextEditor, retryCount = 0) {
        const maxRetries = 3;
        
        try {
            console.log(`Saving tab ${tab.id} (attempt ${retryCount + 1})`);
            this.updatePopupSaveStatus('Saving...', 'saving');
            
            const titleInput = popup.querySelector('.tab-popup-title');
            
            const updatedTabData = {
                ...tab,
                name: titleInput.value || tab.name,
                content: richTextEditor.getContent(),
                lastModified: new Date().toISOString()
            };
            
            // Save to localStorage as backup
            this.saveToLocalStorage(updatedTabData);
            
            const formData = new FormData();
            formData.append('action', 'save_tab');
            formData.append('tab_data', JSON.stringify(updatedTabData));
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch('index.php', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                // Update local tab data
                Object.assign(tab, updatedTabData);
                
                // Update tab display in sidebar
                this.refreshTabDisplay(tab.id);
                
                // Clear from localStorage since save was successful
                this.removeFromLocalStorage(tab.id);
                
                this.unsavedChanges = false;
                this.updatePopupSaveStatus('Saved!', 'success');
                console.log(`Tab ${tab.id} saved from popup successfully`);
                
                return true; // Success
            } else {
                throw new Error(result.error || 'Save failed');
            }
            
        } catch (error) {
            console.error(`Error saving tab ${tab.id} from popup:`, error);
            
            if (retryCount < maxRetries && error.name !== 'AbortError') {
                console.log(`Retrying save for tab ${tab.id}... attempt ${retryCount + 1} of ${maxRetries}`);
                this.updatePopupSaveStatus(`Retrying save... (${retryCount + 1}/${maxRetries})`, 'saving');
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                return this.saveTabFromPopup(tab, popup, richTextEditor, retryCount + 1);
            } else {
                this.updatePopupSaveStatus('Save failed!', 'error');
                // Keep in localStorage for recovery
                console.log('Tab data saved to localStorage for recovery');
                throw error; // Re-throw to be handled by caller
            }
        }
    }

    // Convert popup to new tab
    convertPopupToTab(tab, panelName) {
        const url = `note-editor.php?tab=${encodeURIComponent(tab.id)}&panel=${encodeURIComponent(panelName)}`;
        const windowFeatures = 'width=1200,height=800,scrollbars=yes,resizable=yes,status=yes,location=yes,menubar=yes,toolbar=yes';
        
        try {
            window.open(url, `note_${tab.id}`, windowFeatures);
            this.closeTabPopup();
        } catch (error) {
            console.error('Error opening new tab:', error);
            // Fallback: open in same tab
            window.location.href = url;
        }
    }

    // Close tab popup with improved error handling
    async closeTabPopup() {
        if (this.currentPopup) {
            try {
                console.log('Closing tab popup...');
                
                // Force reset character lookup state before closing
                if (window.characterLookup) {
                    console.log('Clearing character lookup state before close');
                    window.characterLookup.clearProcessingState();
                }
                
                // Check for unsaved changes before closing
                if (this.unsavedChanges) {
                    this.updatePopupSaveStatus('Checking for unsaved changes...', 'info');
                    const result = await this.showUnsavedChangesDialog();
                    
                    if (result === 'cancel') {
                        this.updatePopupSaveStatus('', '');
                        return; // Don't close if user cancels
                    } else if (result === 'save') {
                        // Save changes before closing with timeout
                        this.updatePopupSaveStatus('Saving before close...', 'saving');
                        try {
                            await Promise.race([
                                this.saveTabFromPopup(this.currentPopup.tab, this.currentPopup.popup, this.currentPopup.richTextEditor),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Save timeout')), 10000))
                            ]);
                            this.updatePopupSaveStatus('Saved successfully', 'success');
                        } catch (error) {
                            console.error('Error saving before close:', error);
                            this.updatePopupSaveStatus('Save failed - changes may be lost', 'error');
                            // Ask user if they want to try again or continue closing
                            const continueClose = await this.showSaveErrorDialog();
                            if (!continueClose) {
                                return; // Don't close if user wants to retry
                            }
                        }
                    }
                    // If result is 'discard', continue with closing
                }
                
                // Clean up rich text editor
                if (this.currentPopup.richTextEditor) {
                    try {
                        this.currentPopup.richTextEditor.destroy();
                    } catch (error) {
                        console.warn('Error destroying rich text editor:', error);
                    }
                }
                
                // Remove from DOM
                if (this.currentPopup.overlay && this.currentPopup.overlay.parentNode) {
                    this.currentPopup.overlay.parentNode.removeChild(this.currentPopup.overlay);
                }
                if (this.currentPopup.popup && this.currentPopup.popup.parentNode) {
                    this.currentPopup.popup.parentNode.removeChild(this.currentPopup.popup);
                }
                
                this.currentPopup = null;
                this.unsavedChanges = false; // Reset unsaved changes flag
                
                console.log('Tab popup closed successfully');
                
            } catch (error) {
                console.error('Error closing tab popup:', error);
                // Force close even if there's an error
                this.forceClosePopup();
            }
        }
    }

    // Show unsaved changes dialog with save/discard/cancel options
    showUnsavedChangesDialog() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'unsaved-changes-dialog';
            dialog.innerHTML = `
                <div class="dialog-overlay"></div>
                <div class="dialog-content">
                    <h3>Unsaved Changes</h3>
                    <p>You have unsaved changes. What would you like to do?</p>
                    <div class="dialog-buttons">
                        <button class="dialog-btn dialog-btn-save">Save & Close</button>
                        <button class="dialog-btn dialog-btn-discard">Discard Changes</button>
                        <button class="dialog-btn dialog-btn-cancel">Keep Editing</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            const cleanup = () => {
                if (dialog.parentNode) {
                    dialog.parentNode.removeChild(dialog);
                }
            };
            
            dialog.querySelector('.dialog-btn-save').addEventListener('click', () => {
                cleanup();
                resolve('save');
            });
            
            dialog.querySelector('.dialog-btn-discard').addEventListener('click', () => {
                cleanup();
                resolve('discard');
            });
            
            dialog.querySelector('.dialog-btn-cancel').addEventListener('click', () => {
                cleanup();
                resolve('cancel');
            });
            
            // Close on overlay click defaults to cancel
            dialog.querySelector('.dialog-overlay').addEventListener('click', () => {
                cleanup();
                resolve('cancel');
            });
            
            // Handle ESC key
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve('cancel');
                    document.removeEventListener('keydown', handleEsc);
                }
            };
            document.addEventListener('keydown', handleEsc);
        });
    }

    // Show save error dialog
    showSaveErrorDialog() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'save-error-dialog';
            dialog.innerHTML = `
                <div class="dialog-overlay"></div>
                <div class="dialog-content">
                    <h3>Save Error</h3>
                    <p>Failed to save changes. Would you like to try again or close anyway?</p>
                    <div class="dialog-buttons">
                        <button class="dialog-btn dialog-btn-retry">Try Again</button>
                        <button class="dialog-btn dialog-btn-force-close">Close Anyway</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            const cleanup = () => {
                if (dialog.parentNode) {
                    dialog.parentNode.removeChild(dialog);
                }
            };
            
            dialog.querySelector('.dialog-btn-retry').addEventListener('click', () => {
                cleanup();
                resolve(false); // Don't continue closing
            });
            
            dialog.querySelector('.dialog-btn-force-close').addEventListener('click', () => {
                cleanup();
                resolve(true); // Continue closing
            });
            
            // Close on overlay click defaults to retry
            dialog.querySelector('.dialog-overlay').addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
        });
    }

    // Force close popup - used when normal close fails
    forceClosePopup() {
        console.log('Force closing popup...');
        
        try {
            // Force reset character lookup state
            if (window.characterLookup) {
                window.characterLookup.forceResetState();
            }
            
            // Clean up rich text editor
            if (this.currentPopup && this.currentPopup.richTextEditor) {
                try {
                    this.currentPopup.richTextEditor.destroy();
                } catch (error) {
                    console.warn('Error destroying rich text editor during force close:', error);
                }
            }
            
            // Remove all popup elements from DOM
            const popupElements = document.querySelectorAll('.tab-popup, .tab-popup-overlay, .save-error-dialog, .unsaved-changes-dialog');
            popupElements.forEach(el => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
            
            // Reset state
            this.currentPopup = null;
            this.unsavedChanges = false;
            
            console.log('Popup force closed');
            
        } catch (error) {
            console.error('Error during force close:', error);
            // Last resort - reload page
            if (confirm('Error closing popup. Reload page? (Unsaved changes will be lost)')) {
                window.location.reload();
            }
        }
    }

    // Add global recovery function for GM screen
    static addGlobalRecovery() {
        window.gmScreenRecovery = {
            forceClosePopup: () => {
                if (window.gmScreen) {
                    window.gmScreen.forceClosePopup();
                    console.log('GM screen popup force closed via global recovery');
                }
            },
            resetState: () => {
                if (window.gmScreen) {
                    window.gmScreen.currentPopup = null;
                    window.gmScreen.unsavedChanges = false;
                    console.log('GM screen state reset via global recovery');
                }
                if (window.characterLookup) {
                    window.characterLookup.forceResetState();
                    console.log('Character lookup state reset via global recovery');
                }
            },
            status: () => {
                return {
                    hasCurrentPopup: window.gmScreen ? !!window.gmScreen.currentPopup : false,
                    hasUnsavedChanges: window.gmScreen ? window.gmScreen.unsavedChanges : false,
                    characterLookupStatus: window.characterLookupRecovery ? window.characterLookupRecovery.status() : null
                };
            }
        };
        
        console.log('Global GM screen recovery functions added to window.gmScreenRecovery');
    }

    // Update save status display in popup
    updatePopupSaveStatus(message, type = 'info') {
        const statusElement = document.getElementById('popup-save-status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `save-status ${type}`;
            
            // Auto-clear success/error messages after 3 seconds
            if (type === 'success' || type === 'error') {
                setTimeout(() => {
                    if (statusElement.className.includes(type)) {
                        statusElement.textContent = '';
                        statusElement.className = 'save-status';
                    }
                }, 3000);
            }
        }
    }

    // Refresh tab display in sidebar
    refreshTabDisplay(tabId) {
        const tab = this.findTabById(tabId);
        if (!tab) return;
        
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            const hasContent = tab.content && tab.content.trim() !== '';
            const contentIndicator = hasContent ? ' ✓' : '';
            const nameElement = tabElement.querySelector('.tab-name');
            if (nameElement) {
                nameElement.textContent = tab.name + contentIndicator;
            }
        }
    }

    // Initialize dice roller
    initializeDiceRoller() {
        this.diceRoller = new DiceRoller();
        console.log('Dice roller initialized');
    }

    findTabById(tabId) {
        const panels = ['left-1', 'left-2', 'right-1', 'right-2'];
        for (const panel of panels) {
            if (this.tabs[panel] && Array.isArray(this.tabs[panel])) {
                for (const tab of this.tabs[panel]) {
                    if (tab && tab.id === tabId) return tab;
                }
            }
        }
        return null;
    }

    // Make panel title editable
    makePanelTitleEditable(panelId) {
        const titleElement = document.querySelector(`#${panelId} .panel-title`);
        if (!titleElement) return;
        
        const currentTitle = titleElement.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'panel-title-edit';
        input.style.cssText = `
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #007bff;
            border-radius: 3px;
            padding: 2px 6px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #2c3e50;
            text-align: center;
            width: 100px;
            max-width: 100px;
        `;
        
        // Replace title with input
        titleElement.style.display = 'none';
        titleElement.parentNode.insertBefore(input, titleElement);
        input.focus();
        input.select();
        
        // Handle save/cancel
        const saveTitle = async () => {
            const newTitle = input.value.trim() || currentTitle;
            
            try {
                // Update in memory
                this.panelTitles[panelId] = newTitle;
                
                // Save to server
                await this.savePanelTitle(panelId, newTitle);
                
                // Update UI
                titleElement.textContent = newTitle;
                titleElement.style.display = '';
                input.remove();
                
                // Also update the h3 in panel header
                const headerElement = document.querySelector(`#${panelId} .panel-header h3`);
                if (headerElement) {
                    headerElement.textContent = newTitle;
                }
                
            } catch (error) {
                console.error('Error saving panel title:', error);
                // Restore original title on error
                titleElement.style.display = '';
                input.remove();
            }
        };
        
        const cancelEdit = () => {
            titleElement.style.display = '';
            input.remove();
        };
        
        input.addEventListener('blur', saveTitle);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveTitle();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
    }

    // Save panel title to server
    async savePanelTitle(panelId, title) {
        try {
            const formData = new FormData();
            formData.append('action', 'save_panel_title');
            formData.append('panel_id', panelId);
            formData.append('title', title);
            
            const response = await fetch('index.php', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                console.log('Panel title saved successfully:', panelId, title);
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error saving panel title:', error);
            throw error;
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Panel hover effects for all 4 panels
        const panels = ['left-panel-1', 'left-panel-2', 'right-panel-1', 'right-panel-2'];
        
        panels.forEach(panelId => {
            const panel = document.getElementById(panelId);
            if (panel) {
                panel.addEventListener('mouseenter', () => panel.classList.add('expanded'));
                panel.addEventListener('mouseleave', () => panel.classList.remove('expanded'));
                
                // Make panel titles editable on click
                const titleElement = panel.querySelector('.panel-title');
                if (titleElement) {
                    titleElement.style.cursor = 'pointer';
                    titleElement.title = 'Click to edit panel name';
                    titleElement.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.makePanelTitleEditable(panelId);
                    });
                }
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'Escape') {
                    this.closeTabPopup();
                }
            }
        });

        // Refresh tabs when window regains focus (in case tabs were edited in other windows)
        window.addEventListener('focus', () => {
            console.log('Window focused, refreshing tabs...');
            this.loadTabs();
        });
    }

    // Auto-save functionality
    setupAutoSave() {
        this.autoSaveInterval = setInterval(() => {
            console.log('Auto-save check...');
        }, 30000); // Check every 30 seconds
        
        console.log('Auto-save enabled');
    }

    // Update session info
    updateSessionInfo() {
        const dateElement = document.getElementById('session-date');
        if (dateElement) {
            dateElement.textContent = new Date().toLocaleDateString();
        }
    }

    // Utility function to escape HTML
    escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Refresh tabs data
    async refreshTabs() {
        console.log('Refreshing tabs...');
        await this.loadTabs();
    }

    // Save tab data to localStorage
    saveToLocalStorage(tabData) {
        try {
            const savedData = this.getLocalStorageData();
            savedData[tabData.id] = {
                ...tabData,
                savedAt: new Date().toISOString()
            };
            localStorage.setItem(this.localStorageKey, JSON.stringify(savedData));
            console.log(`Tab ${tabData.id} saved to localStorage`);
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }
    
    // Remove tab data from localStorage
    removeFromLocalStorage(tabId) {
        try {
            const savedData = this.getLocalStorageData();
            delete savedData[tabId];
            localStorage.setItem(this.localStorageKey, JSON.stringify(savedData));
            console.log(`Tab ${tabId} removed from localStorage`);
        } catch (error) {
            console.error('Failed to remove from localStorage:', error);
        }
    }
    
    // Get all saved data from localStorage
    getLocalStorageData() {
        try {
            const data = localStorage.getItem(this.localStorageKey);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Failed to read from localStorage:', error);
            return {};
        }
    }
    
    // Check for recoverable data on startup
    checkForRecoverableData() {
        const savedData = this.getLocalStorageData();
        const tabCount = Object.keys(savedData).length;
        
        if (tabCount > 0) {
            console.log(`Found ${tabCount} unsaved tabs in localStorage`);
            
            // Show recovery notification
            this.showRecoveryNotification(savedData);
        }
    }
    
    // Show recovery notification
    showRecoveryNotification(savedData) {
        const notification = document.createElement('div');
        notification.className = 'recovery-notification';
        notification.innerHTML = `
            <div class="recovery-content">
                <h4>Unsaved Data Found</h4>
                <p>Found ${Object.keys(savedData).length} tabs with unsaved changes from a previous session.</p>
                <div class="recovery-actions">
                    <button class="btn-recover">Recover Data</button>
                    <button class="btn-discard">Discard</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Handle recovery
        notification.querySelector('.btn-recover').addEventListener('click', async () => {
            await this.recoverFromLocalStorage(savedData);
            notification.remove();
        });
        
        // Handle discard
        notification.querySelector('.btn-discard').addEventListener('click', () => {
            localStorage.removeItem(this.localStorageKey);
            notification.remove();
            console.log('Discarded recovery data');
        });
    }
    
    // Recover tabs from localStorage
    async recoverFromLocalStorage(savedData) {
        let recovered = 0;
        let failed = 0;
        
        for (const [tabId, tabData] of Object.entries(savedData)) {
            try {
                console.log(`Recovering tab ${tabId}...`);
                
                const formData = new FormData();
                formData.append('action', 'save_tab');
                formData.append('tab_data', JSON.stringify(tabData));
                
                const response = await fetch('index.php', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    recovered++;
                    this.removeFromLocalStorage(tabId);
                    console.log(`Tab ${tabId} recovered successfully`);
                } else {
                    failed++;
                    console.error(`Failed to recover tab ${tabId}:`, result.error);
                }
            } catch (error) {
                failed++;
                console.error(`Error recovering tab ${tabId}:`, error);
            }
        }
        
        // Show result
        const message = `Recovery complete: ${recovered} tabs recovered` + 
                       (failed > 0 ? `, ${failed} failed` : '');
        alert(message);
        
        // Reload tabs to show recovered data
        await this.loadTabs();
    }
    
    // Setup periodic check for unsaved data
    setupRecoveryCheck() {
        // Check every 5 minutes for tabs that might have failed to save
        this.recoveryCheckInterval = setInterval(() => {
            const savedData = this.getLocalStorageData();
            const oldUnsavedTabs = [];
            
            for (const [tabId, tabData] of Object.entries(savedData)) {
                const savedAt = new Date(tabData.savedAt);
                const ageMinutes = (new Date() - savedAt) / 1000 / 60;
                
                if (ageMinutes > 10) { // More than 10 minutes old
                    oldUnsavedTabs.push(tabId);
                }
            }
            
            if (oldUnsavedTabs.length > 0) {
                console.warn(`Found ${oldUnsavedTabs.length} tabs with old unsaved data`);
                // Could show a notification here
            }
        }, 300000); // 5 minutes
    }
    
    // Static method for global access
    static init() {
        if (!window.gmScreen) {
            window.gmScreen = new GMScreen();
        }
        return window.gmScreen.init();
    }
}

// =============================================================================
// Dice Roller Class - Converted from Python tkinter to JavaScript
// =============================================================================

class DiceRoller {
    constructor() {
        this.currentRollQueue = [];
        this.isExpanded = false;
        this.hoverDisabled = false;
        
        this.createDiceUI();
    }
    
    createDiceUI() {
        // Create main dice roller container
        this.diceFrame = document.createElement('div');
        this.diceFrame.className = 'dice-roller collapsed';
        
        // Create header with toggle
        const header = document.createElement('div');
        header.className = 'dice-roller-header';
        
        const title = document.createElement('div');
        title.className = 'dice-roller-title';
        title.textContent = 'Dice Roller';
        title.style.cursor = 'pointer';
        title.addEventListener('click', () => this.toggleCollapse());
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'dice-toggle-btn';
        toggleBtn.innerHTML = '🎲';
        toggleBtn.addEventListener('click', () => this.toggleCollapse());
        
        header.appendChild(title);
        header.appendChild(toggleBtn);
        this.diceFrame.appendChild(header);
        
        // Create expanded content
        this.createExpandedContent();
        
        // Add to page
        document.body.appendChild(this.diceFrame);
        
        // Setup hover events
        this.diceFrame.addEventListener('mouseenter', () => this.onEnter());
    }
    
    createExpandedContent() {
        this.expandedFrame = document.createElement('div');
        this.expandedFrame.className = 'dice-content';
        
        // First row of dice buttons
        const firstRow = document.createElement('div');
        firstRow.className = 'dice-buttons-row';
        
        const diceRow1 = [
            { text: 'D2', dice: '1d2' },
            { text: 'D4', dice: '1d4' },
            { text: 'D8', dice: '1d8' },
            { text: 'D10', dice: '1d10' },
            { text: 'D20', dice: '1d20' }
        ];
        
        diceRow1.forEach(({ text, dice }) => {
            const btn = document.createElement('button');
            btn.className = 'dice-btn';
            btn.textContent = text;
            btn.addEventListener('click', () => this.addToQueue(dice));
            firstRow.appendChild(btn);
        });
        
        // Second row - special buttons
        const secondRow = document.createElement('div');
        secondRow.className = 'dice-buttons-row';
        
        const specialButtons = [
            { text: 'Power Roll', value: '2d10' },
            { text: 'Edge', value: '+2' },
            { text: 'Bane', value: '-2' },
            { text: '+1', value: '+1' }
        ];
        
        specialButtons.forEach(({ text, value }) => {
            const btn = document.createElement('button');
            btn.className = 'dice-btn special';
            btn.textContent = text;
            btn.addEventListener('click', () => this.addToQueue(value));
            secondRow.appendChild(btn);
        });
        
        // Queue display
        const queueLabel = document.createElement('div');
        queueLabel.textContent = 'Current Roll:';
        queueLabel.style.marginBottom = '5px';
        queueLabel.style.fontSize = '14px';
        queueLabel.style.fontWeight = 'bold';
        
        this.queueDisplay = document.createElement('div');
        this.queueDisplay.className = 'dice-queue empty';
        this.queueDisplay.textContent = '(nothing queued)';
        
        // Action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'dice-actions';
        
        const rollBtn = document.createElement('button');
        rollBtn.className = 'dice-roll-btn';
        rollBtn.textContent = 'ROLL';
        rollBtn.addEventListener('click', () => this.calculateRoll());
        
        const clearBtn = document.createElement('button');
        clearBtn.className = 'dice-clear-btn';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => this.clearQueue());
        
        this.resultLabel = document.createElement('div');
        this.resultLabel.className = 'dice-result';
        this.resultLabel.textContent = 'Result: -';
        
        actionsDiv.appendChild(rollBtn);
        actionsDiv.appendChild(clearBtn);
        actionsDiv.appendChild(this.resultLabel);
        
        // Assemble expanded content
        this.expandedFrame.appendChild(firstRow);
        this.expandedFrame.appendChild(secondRow);
        this.expandedFrame.appendChild(queueLabel);
        this.expandedFrame.appendChild(this.queueDisplay);
        this.expandedFrame.appendChild(actionsDiv);
        
        this.diceFrame.appendChild(this.expandedFrame);
    }
    
    onEnter() {
        if (!this.isExpanded && !this.hoverDisabled) {
            this.isExpanded = true;
            this.diceFrame.classList.remove('collapsed');
            this.expandedFrame.classList.add('expanded');
        }
    }
    
    toggleCollapse() {
        if (this.isExpanded) {
            // Collapse
            this.isExpanded = false;
            this.diceFrame.classList.add('collapsed');
            this.expandedFrame.classList.remove('expanded');
            
            // Disable hover for 0.5 seconds
            this.hoverDisabled = true;
            setTimeout(() => { this.hoverDisabled = false; }, 500);
        } else {
            // Expand
            this.isExpanded = true;
            this.diceFrame.classList.remove('collapsed');
            this.expandedFrame.classList.add('expanded');
        }
    }
    
    addToQueue(item) {
        this.currentRollQueue.push(item);
        this.updateQueueDisplay();
    }
    
    updateQueueDisplay() {
        if (this.currentRollQueue.length === 0) {
            this.queueDisplay.textContent = '(nothing queued)';
            this.queueDisplay.classList.add('empty');
        } else {
            this.queueDisplay.textContent = this.currentRollQueue.join(' ');
            this.queueDisplay.classList.remove('empty');
        }
    }
    
    clearQueue() {
        this.currentRollQueue = [];
        this.updateQueueDisplay();
        this.resultLabel.textContent = 'Result: -';
    }
    
    calculateRoll() {
        if (this.currentRollQueue.length === 0) {
            this.resultLabel.textContent = 'Nothing to roll!';
            return;
        }
        
        try {
            let totalResult = 0;
            let rollDetails = [];
            
            for (const item of this.currentRollQueue) {
                if (item.startsWith('+')) {
                    const modifier = parseInt(item.substring(1));
                    totalResult += modifier;
                    rollDetails.push(`+${modifier}`);
                } else if (item.startsWith('-')) {
                    const modifier = parseInt(item.substring(1));
                    totalResult -= modifier;
                    rollDetails.push(`-${modifier}`);
                } else {
                    const { result, detail } = this.parseAndRollDice(item);
                    totalResult += result;
                    rollDetails.push(detail);
                }
            }
            
            this.resultLabel.textContent = `Result: ${totalResult}`;
            
            // Clear queue
            this.currentRollQueue = [];
            this.updateQueueDisplay();
            
        } catch (error) {
            this.resultLabel.textContent = `Error: ${error.message}`;
        }
    }
    
    parseAndRollDice(diceNotation) {
        const pattern = /^(\d+)d(\d+)$/;
        const match = diceNotation.match(pattern);
        
        if (!match) {
            throw new Error(`Invalid dice notation: ${diceNotation}`);
        }
        
        const numDice = parseInt(match[1]);
        const dieSize = parseInt(match[2]);
        
        // Roll the dice
        const rolls = [];
        for (let i = 0; i < numDice; i++) {
            rolls.push(Math.floor(Math.random() * dieSize) + 1);
        }
        
        const total = rolls.reduce((sum, roll) => sum + roll, 0);
        
        // Create detail string
        let detail;
        if (numDice === 1) {
            detail = `${total}`;
        } else {
            const rollsStr = rolls.join('+');
            detail = `[${rollsStr}]=${total}`;
        }
        
        return { result: total, detail };
    }
}

// Global functions for HTML onclick handlers
function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
        panel.classList.toggle('expanded');
    }
}

function exportNotes() {
    alert('Export notes coming soon!');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, initializing GM Screen...');
        GMScreen.init();
    });
} else {
    console.log('DOM already loaded, initializing GM Screen...');
    GMScreen.init();
}

// Export for module usage
window.GMScreen = GMScreen;

// Add global recovery functions
GMScreen.addGlobalRecovery();