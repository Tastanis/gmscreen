// =============================================================================
// Character Lookup System for Rich Text Editor - FIXED VERSION WITH BETTER ERROR HANDLING
// =============================================================================

class CharacterLookup {
    constructor() {
        this.allCharacters = [];
        this.autocompleteVisible = false;
        this.selectedCharacter = null;
        this.currentEditor = null;
        this.currentTextArea = null;
        this.editorType = null; // 'rich' or 'plain'
        this.searchStart = null;
        this.searchTerm = '';
        this.currentRange = null;
        this.currentCursorPosition = null;
        this.isInitialized = false;
        this.textAreaOverlays = new Map(); // Track overlay containers for each textarea
        this.observerMap = new Map(); // Track mutation observers for each textarea
        this.editorReferences = new Set(); // Track all rich text editors
        this.documentClickListenerSetup = false; // Prevent duplicate document listeners
        this.isProcessingCharacter = false; // Track character processing state
        this.processingTimeout = null; // Track processing timeout
        this.processingStartTime = null; // Track when processing started
        this.maxProcessingTime = 5000; // Maximum processing time (5 seconds)
    }

    async init() {
        console.log('Initializing Character Lookup v4.0 (FIXED VERSION)...');
        
        try {
            await this.loadAllCharacters();
            this.isInitialized = true;
            console.log('Character Lookup v4.0 initialized successfully with', this.allCharacters.length, 'characters');
            
            // Set up periodic state validation
            this.startStateValidation();
            
        } catch (error) {
            console.error('Error initializing Character Lookup:', error);
            // Set minimal initialization state to prevent total failure
            this.isInitialized = true; // Allow system to continue
            this.allCharacters = []; // Empty fallback
            console.warn('Character Lookup initialized with empty character list due to errors');
        }
    }

    async loadAllCharacters() {
        try {
            console.log('Loading all characters from server...');
            
            const formData = new FormData();
            formData.append('action', 'get_all_characters');
            
            // Try current page first, then fallback to dashboard.php
            let response;
            try {
                response = await fetch(window.location.pathname, {
                    method: 'POST',
                    body: formData
                });
            } catch (error) {
                console.log('Failed to fetch from current page, trying dashboard.php...');
                try {
                    response = await fetch('../../dashboard.php', {
                        method: 'POST',
                        body: formData
                    });
                } catch (dashboardError) {
                    console.log('Failed to fetch from dashboard.php, trying index.php...');
                    response = await fetch('index.php', {
                        method: 'POST',
                        body: formData
                    });
                }
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseText = await response.text();
            console.log('Raw response received:', responseText.substring(0, 200) + '...');
            
            let data;
            try {
                // Check if response looks like JSON before parsing
                if (!responseText.trim() || responseText.trim().charAt(0) !== '{' && responseText.trim().charAt(0) !== '[') {
                    console.warn('Response does not appear to be JSON:', responseText.substring(0, 100));
                    // Set empty fallback data instead of throwing
                    this.allCharacters = [];
                    return;
                }
                
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Failed to parse JSON response:', parseError);
                console.error('Response text (first 200 chars):', responseText.substring(0, 200));
                // Set empty fallback data instead of throwing
                this.allCharacters = [];
                return;
            }
            
            if (data.success && data.characters) {
                this.allCharacters = data.characters;
                console.log('Loaded characters successfully:', this.allCharacters.length, 'total');
                
                // Log first few characters for debugging
                if (this.allCharacters.length > 0) {
                    console.log('Sample characters:', this.allCharacters.slice(0, 3));
                }
            } else {
                console.error('Failed to load characters:', data.error || 'Unknown error');
                console.error('Response data:', data);
                throw new Error(data.error || 'Failed to load characters from server');
            }
        } catch (error) {
            console.error('Error loading characters:', error);
            // Set empty array so the system doesn't crash
            this.allCharacters = [];
            // Don't throw error to prevent cascade failures
            console.warn('Character lookup will continue with empty character list');
        }
    }

    setupEditorListeners(editor) {
        if (!editor) {
            console.warn('No editor provided to setupEditorListeners');
            return;
        }
        
        console.log('Setting up rich text editor listeners for character lookup');
        
        // Store editor reference for this specific editor
        if (!this.editorReferences) {
            this.editorReferences = new Set();
        }
        this.editorReferences.add(editor);
        
        // Listen for typing with editor-specific context
        editor.addEventListener('input', (e) => this.handleInputForEditor(e, editor));
        editor.addEventListener('keydown', (e) => this.handleKeydownForEditor(e, editor));
        editor.addEventListener('click', (e) => this.handleClickForEditor(e, editor));
        
        // Focus tracking for this editor
        editor.addEventListener('focus', (e) => {
            this.currentEditor = editor;
            this.currentTextArea = null;
            this.editorType = 'rich';
        });
        
        // Hide autocomplete when clicking outside (only set up once)
        if (!this.documentClickListenerSetup) {
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.character-autocomplete') && 
                    !e.target.closest('.rich-text-editor')) {
                    this.hideAutocomplete();
                }
            });
            this.documentClickListenerSetup = true;
        }
        
        // Process existing content when editor is loaded
        setTimeout(() => this.processExistingContent(editor), 100);
    }

    setupTextAreaListeners(textArea) {
        if (!textArea) {
            console.warn('No textarea provided to setupTextAreaListeners');
            return;
        }
        
        console.log('Setting up plain text area listeners for character lookup');
        this.currentTextArea = textArea;
        this.currentEditor = null;
        this.editorType = 'plain';
        
        // Create autocomplete container if it doesn't exist
        this.ensureAutocompleteContainer();
        
        // Create overlay system for this textarea
        this.createTextAreaOverlay(textArea);
        
        // Listen for typing
        textArea.addEventListener('input', (e) => this.handlePlainTextInput(e));
        textArea.addEventListener('keydown', (e) => this.handleKeydown(e));
        textArea.addEventListener('click', (e) => this.handlePlainTextClick(e));
        textArea.addEventListener('focus', (e) => this.handlePlainTextFocus(e));
        
        // Update overlays when content changes
        textArea.addEventListener('input', () => this.updateTextAreaOverlays(textArea));
        textArea.addEventListener('scroll', () => this.updateTextAreaOverlays(textArea));
        
        // Handle window resize
        const resizeHandler = () => this.updateTextAreaOverlays(textArea);
        window.addEventListener('resize', resizeHandler);
        
        // Store resize handler for cleanup
        textArea._characterLookupResizeHandler = resizeHandler;
        
        // Hide autocomplete when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.character-autocomplete') && 
                e.target !== textArea) {
                this.hideAutocomplete();
            }
        });
        
        // Initial overlay update
        setTimeout(() => this.updateTextAreaOverlays(textArea), 100);
        
        console.log('Plain text area listeners setup complete');
    }

    ensureAutocompleteContainer() {
        // Create a universal autocomplete container if it doesn't exist
        let container = document.getElementById('universal-character-autocomplete');
        if (!container) {
            container = document.createElement('div');
            container.id = 'universal-character-autocomplete';
            container.className = 'character-autocomplete';
            container.style.display = 'none';
            document.body.appendChild(container);
            console.log('Created universal autocomplete container');
        }
        return container;
    }

    processExistingContent(editor) {
        // Convert any existing [[character]] text to clickable links
        this.convertPlainTextReferencesToLinks();
    }

    handleInputForEditor(e, editor) {
        // Set context for this specific editor
        this.currentEditor = editor;
        this.editorType = 'rich';
        
        console.log('Input detected in editor, checking for character typing...');
        
        // Small delay to let the DOM update
        setTimeout(() => {
            this.checkForCharacterTyping();
            this.convertPlainTextReferencesToLinks();
        }, 10);
    }

    handleInput(e) {
        // Legacy method for backwards compatibility
        this.handleInputForEditor(e, this.currentEditor);
    }

    handleKeydownForEditor(e, editor) {
        // Set context for this specific editor
        this.currentEditor = editor;
        this.editorType = 'rich';
        
        // Handle autocomplete navigation
        this.handleKeydown(e);
    }

    handleClickForEditor(e, editor) {
        // Set context for this specific editor  
        this.currentEditor = editor;
        this.editorType = 'rich';
        
        // Handle character link clicks
        this.handleClick(e);
    }

    handlePlainTextInput(e) {
        // Small delay to let the DOM update
        setTimeout(() => {
            this.checkForCharacterTyping();
        }, 10);
    }

    handlePlainTextClick(e) {
        // Handle clicks in plain text areas
        setTimeout(() => {
            this.hideAutocomplete();
        }, 10);
    }

    handlePlainTextFocus(e) {
        // Store reference when textarea gets focus
        this.currentTextArea = e.target;
        this.editorType = 'plain';
    }

    checkForCharacterTyping() {
        if (!this.isInitialized) {
            console.log('Character lookup not initialized yet');
            return;
        }
        
        if (this.editorType === 'rich') {
            this.checkRichTextTyping();
        } else {
            this.checkPlainTextTyping();
        }
    }

    checkRichTextTyping() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const textBefore = this.getTextBeforeCursor(range);
        
        // Look for [[ pattern
        const lastBrackets = textBefore.lastIndexOf('[[');
        if (lastBrackets !== -1) {
            const afterBrackets = textBefore.substring(lastBrackets);
            const closingBrackets = afterBrackets.indexOf(']]');
            
            if (closingBrackets === -1) {
                // We're typing inside [[
                this.searchTerm = afterBrackets.substring(2);
                this.currentRange = range.cloneRange();
                
                console.log('Character search triggered with term:', this.searchTerm);
                
                if (this.searchTerm.length >= 0) {
                    this.showAutocomplete(this.searchTerm);
                }
            } else {
                this.hideAutocomplete();
            }
        } else {
            this.hideAutocomplete();
        }
    }

    checkPlainTextTyping() {
        if (!this.currentTextArea) return;
        
        const textarea = this.currentTextArea;
        const cursorPos = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, cursorPos);
        
        // Look for [[ pattern
        const lastBrackets = textBefore.lastIndexOf('[[');
        if (lastBrackets !== -1) {
            const afterBrackets = textBefore.substring(lastBrackets);
            const closingBrackets = afterBrackets.indexOf(']]');
            
            if (closingBrackets === -1) {
                // We're typing inside [[
                this.searchTerm = afterBrackets.substring(2);
                this.currentCursorPosition = cursorPos;
                
                console.log('Plain text character search triggered with term:', this.searchTerm);
                
                if (this.searchTerm.length >= 0) {
                    this.showAutocomplete(this.searchTerm);
                }
            } else {
                this.hideAutocomplete();
            }
        } else {
            this.hideAutocomplete();
        }
    }

    getTextBeforeCursor(range) {
        const tempRange = range.cloneRange();
        tempRange.selectNodeContents(this.currentEditor);
        tempRange.setEnd(range.startContainer, range.startOffset);
        return tempRange.toString();
    }

    handleKeydown(e) {
        if (!this.autocompleteVisible) return;
        
        const autocomplete = this.getAutocompleteContainer();
        if (!autocomplete) return;
        
        const items = autocomplete.querySelectorAll('.autocomplete-item');
        let selected = autocomplete.querySelector('.autocomplete-item.selected');
        let selectedIndex = selected ? Array.from(items).indexOf(selected) : -1;
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
                this.updateSelection(items, selectedIndex);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1;
                this.updateSelection(items, selectedIndex);
                break;
                
            case 'Enter':
            case 'Tab':
                e.preventDefault();
                if (selected) {
                    this.selectCharacter(selected.dataset.characterName);
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                this.hideAutocomplete();
                break;
        }
    }

    handleClick(e) {
        const charLink = e.target.closest('.character-link');
        if (charLink) {
            e.preventDefault();
            const characterId = charLink.getAttribute('data-character-id');
            const characterType = charLink.getAttribute('data-character-type');
            
            if (characterId && characterType) {
                // Open character details in new tab
                this.openCharacterInNewTab(characterId, characterType);
            }
        }
    }

    openCharacterInNewTab(characterId, characterType) {
        // Fetch character details and open in standalone window
        this.openCharacterInStandaloneWindow(characterId, characterType);
    }

    async openCharacterInStandaloneWindow(characterId, characterType) {
        try {
            // Fetch character details from backend
            const formData = new FormData();
            formData.append('action', 'get_character_details');
            formData.append('character_id', characterId);
            formData.append('character_type', characterType);
            
            const response = await fetch(window.location.pathname, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success && data.character) {
                // Call the appropriate expand function based on type
                if (characterType === 'student') {
                    this.expandStudentToStandaloneWindow(data.character);
                } else if (characterType === 'staff') {
                    this.expandStaffToStandaloneWindow(data.character);
                } else if (characterType === 'location') {
                    this.expandLocationToStandaloneWindow(data.character);
                }
            } else {
                console.error('Failed to fetch character details:', data.error);
                // Fallback to old behavior
                const url = `character-details.php?id=${encodeURIComponent(characterId)}&type=${encodeURIComponent(characterType)}`;
                window.open(url, '_blank');
            }
        } catch (error) {
            console.error('Error fetching character details:', error);
            // Fallback to old behavior
            const url = `character-details.php?id=${encodeURIComponent(characterId)}&type=${encodeURIComponent(characterType)}`;
            window.open(url, '_blank');
        }
    }

    expandStudentToStandaloneWindow(student) {
        const newWindow = window.open('', '_blank');
        
        newWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this.escapeHtml(student.name)} - Student Details</title>
                <link rel="stylesheet" href="/dnd/css/style.css">
                <link rel="stylesheet" href="/dnd/strixhaven/students/css/students.css">
                <style>
                    body { margin: 20px; background: #f8f9fa; }
                    .standalone-header { 
                        background: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        margin-bottom: 20px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    .standalone-content {
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .student-details { grid-template-columns: 200px 1fr; }
                </style>
            </head>
            <body>
                <div class="standalone-header">
                    <h1>${this.escapeHtml(student.name)} - Student Details</h1>
                    <p>${this.escapeHtml(student.grade_level || 'Unknown Grade')} • ${this.escapeHtml(student.college || 'No College')}</p>
                </div>
                <div class="standalone-content">
                    <div class="student-details">
                        ${this.createStudentDetailContent(student)}
                    </div>
                </div>
            </body>
            </html>
        `);
        
        newWindow.document.close();
    }

    expandStaffToStandaloneWindow(staff) {
        const newWindow = window.open('', '_blank');
        
        newWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this.escapeHtml(staff.name)} - Staff Details</title>
                <link rel="stylesheet" href="/dnd/css/style.css">
                <link rel="stylesheet" href="/dnd/strixhaven/staff/css/staff.css">
                <style>
                    body { margin: 20px; background: #f8f9fa; }
                    .standalone-header { 
                        background: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        margin-bottom: 20px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    .standalone-content {
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .staff-details { grid-template-columns: 200px 1fr; }
                </style>
            </head>
            <body>
                <div class="standalone-header">
                    <h1>${this.escapeHtml(staff.name)} - Staff Details</h1>
                    <p>${this.escapeHtml(staff.college || 'No College')}</p>
                </div>
                <div class="standalone-content">
                    <div class="staff-details">
                        ${this.createStaffDetailContent(staff)}
                    </div>
                </div>
            </body>
            </html>
        `);
        
        newWindow.document.close();
    }

    expandLocationToStandaloneWindow(location) {
        const newWindow = window.open('', '_blank');
        
        newWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this.escapeHtml(location.name)} - Location Details</title>
                <link rel="stylesheet" href="/dnd/css/style.css">
                <link rel="stylesheet" href="/dnd/strixhaven/locations/css/locations.css">
                <style>
                    body { margin: 20px; background: #f8f9fa; }
                    .standalone-header { 
                        background: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        margin-bottom: 20px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    .standalone-content {
                        background: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .location-details { grid-template-columns: 200px 1fr; }
                </style>
            </head>
            <body>
                <div class="standalone-header">
                    <h1>${this.escapeHtml(location.name)} - Location Details</h1>
                    <p>${this.escapeHtml(location.college || 'No College')} • ${this.escapeHtml(location.hex_color || 'No Color')}</p>
                </div>
                <div class="standalone-content">
                    <div class="location-details">
                        ${this.createLocationDetailContent(location)}
                    </div>
                </div>
            </body>
            </html>
        `);
        
        newWindow.document.close();
    }

    createStudentDetailContent(student) {
        const imagePath = student.image_path ? `../students/${student.image_path}?t=${Date.now()}` : '';
        return `
            <div class="character-portrait-section">
                ${imagePath ? 
                    `<img src="${imagePath}" alt="${this.escapeHtml(student.name)}" class="character-portrait">` : 
                    '<div class="character-portrait-placeholder">No Photo</div>'
                }
            </div>
            <div class="character-info-section">
                <div class="info-block">
                    <h3>Basic Information</h3>
                    <p><strong>Name:</strong> ${this.escapeHtml(student.name)}</p>
                    <p><strong>Grade:</strong> ${this.escapeHtml(student.grade_level || 'Unknown')}</p>
                    <p><strong>College:</strong> ${this.escapeHtml(student.college || 'No College')}</p>
                    <p><strong>Race:</strong> ${this.escapeHtml(student.race || 'Unknown')}</p>
                    ${student.age ? `<p><strong>Age:</strong> ${this.escapeHtml(student.age)}</p>` : ''}
                    ${student.job ? `<p><strong>Job:</strong> ${this.escapeHtml(student.job)}</p>` : ''}
                </div>
                
                ${student.edge || student.bane ? `
                <div class="info-block">
                    <h3>Edge & Bane</h3>
                    ${student.edge ? `<p><strong>Edge:</strong> ${this.escapeHtml(student.edge)}</p>` : ''}
                    ${student.bane ? `<p><strong>Bane:</strong> ${this.escapeHtml(student.bane)}</p>` : ''}
                </div>
                ` : ''}
                
                ${student.skills && student.skills.length > 0 ? `
                <div class="info-block">
                    <h3>Skills</h3>
                    <div class="skills-list">
                        ${student.skills.map(skill => `<span class="skill-tag">${this.escapeHtml(skill)}</span>`).join('')}
                    </div>
                </div>
                ` : ''}
                
                ${student.clubs && student.clubs.length > 0 ? `
                <div class="info-block">
                    <h3>Clubs</h3>
                    <div class="clubs-list">
                        ${student.clubs.map(club => `<span class="club-tag">${this.escapeHtml(club)}</span>`).join('')}
                    </div>
                </div>
                ` : ''}
                
                ${student.details && student.details.backstory ? `
                <div class="info-block">
                    <h3>Backstory</h3>
                    <p>${this.escapeHtml(student.details.backstory).replace(/\\r\\n/g, '<br>').replace(/\\n/g, '<br>')}</p>
                </div>
                ` : ''}
                
                ${student.details && student.details.core_want ? `
                <div class="info-block">
                    <h3>Core Want</h3>
                    <p>${this.escapeHtml(student.details.core_want).replace(/\\r\\n/g, '<br>').replace(/\\n/g, '<br>')}</p>
                </div>
                ` : ''}
                
                ${student.details && student.details.core_fear ? `
                <div class="info-block">
                    <h3>Core Fear</h3>
                    <p>${this.escapeHtml(student.details.core_fear).replace(/\\r\\n/g, '<br>').replace(/\\n/g, '<br>')}</p>
                </div>
                ` : ''}
                
                ${student.details && student.details.other ? `
                <div class="info-block">
                    <h3>Other Notes</h3>
                    <p>${this.escapeHtml(student.details.other).replace(/\\r\\n/g, '<br>').replace(/\\n/g, '<br>')}</p>
                </div>
                ` : ''}
                
                <!-- Character Information Section (GM Only) -->
                <div class="info-block gm-info-block">
                    <h3>Character Information</h3>
                    <p><strong>Origin:</strong> ${this.escapeHtml((student.character_info && student.character_info.origin) || 'Not set')}</p>
                    <p><strong>Desire:</strong> ${this.escapeHtml((student.character_info && student.character_info.desire) || 'Not set')}</p>
                    <p><strong>Fear:</strong> ${this.escapeHtml((student.character_info && student.character_info.fear) || 'Not set')}</p>
                    <p><strong>Connection:</strong> ${this.escapeHtml((student.character_info && student.character_info.connection) || 'Not set')}</p>
                    <p><strong>Impact:</strong> ${this.escapeHtml((student.character_info && student.character_info.impact) || 'Not set')}</p>
                    <p><strong>Change:</strong> ${this.escapeHtml((student.character_info && student.character_info.change) || 'Not set')}</p>
                </div>
                
                ${student.relationships ? `
                <div class="info-block">
                    <h3>PC Relationships</h3>
                    ${student.relationships.frunk_points || student.relationships.frunk_notes ? `<p><strong>Frunk:</strong> ${this.escapeHtml(student.relationships.frunk_points || '')} ${this.escapeHtml(student.relationships.frunk_notes || '')}</p>` : ''}
                    ${student.relationships.zepha_points || student.relationships.zepha_notes ? `<p><strong>Zepha:</strong> ${this.escapeHtml(student.relationships.zepha_points || '')} ${this.escapeHtml(student.relationships.zepha_notes || '')}</p>` : ''}
                    ${student.relationships.sharon_points || student.relationships.sharon_notes ? `<p><strong>Sharon:</strong> ${this.escapeHtml(student.relationships.sharon_points || '')} ${this.escapeHtml(student.relationships.sharon_notes || '')}</p>` : ''}
                    ${student.relationships.indigo_points || student.relationships.indigo_notes ? `<p><strong>Indigo:</strong> ${this.escapeHtml(student.relationships.indigo_points || '')} ${this.escapeHtml(student.relationships.indigo_notes || '')}</p>` : ''}
                </div>
                ` : ''}
            </div>
        `;
    }

    createStaffDetailContent(staff) {
        const imagePath = staff.image_path ? `../staff/${staff.image_path}?t=${Date.now()}` : '';
        return `
            <div class="character-portrait-section">
                ${imagePath ? 
                    `<img src="${imagePath}" alt="${this.escapeHtml(staff.name)}" class="character-portrait">` : 
                    '<div class="character-portrait-placeholder">No Photo</div>'
                }
            </div>
            <div class="character-info-section">
                <div class="info-block">
                    <h3>Basic Information</h3>
                    <p><strong>Name:</strong> ${this.escapeHtml(staff.name)}</p>
                    <p><strong>College:</strong> ${this.escapeHtml(staff.college || 'No College')}</p>
                </div>
                ${staff.character_description ? `
                <div class="info-block">
                    <h3>Description</h3>
                    <p>${this.escapeHtml(staff.character_description).replace(/\\n/g, '<br>')}</p>
                </div>
                ` : ''}
                ${staff.general_info ? `
                <div class="info-block">
                    <h3>General Information</h3>
                    <p>${this.escapeHtml(staff.general_info).replace(/\\n/g, '<br>')}</p>
                </div>
                ` : ''}
                ${staff.gm_only && (staff.gm_only.personality || staff.gm_only.other) ? `
                <div class="info-block gm-info-block">
                    <h3>GM Notes</h3>
                    ${staff.gm_only.personality ? `<p><strong>Personality:</strong> ${this.escapeHtml(staff.gm_only.personality).replace(/\\n/g, '<br>')}</p>` : ''}
                    ${staff.gm_only.other ? `<p><strong>Other:</strong> ${this.escapeHtml(staff.gm_only.other).replace(/\\n/g, '<br>')}</p>` : ''}
                </div>
                ` : ''}
            </div>
        `;
    }

    createLocationDetailContent(location) {
        const imagePath = location.image_path ? `../locations/${location.image_path}?t=${Date.now()}` : '';
        return `
            <div class="character-portrait-section">
                ${imagePath ? 
                    `<img src="${imagePath}" alt="${this.escapeHtml(location.name)}" class="character-portrait">` : 
                    '<div class="character-portrait-placeholder">📍</div>'
                }
            </div>
            <div class="character-info-section">
                <div class="info-block">
                    <h3>Basic Information</h3>
                    <p><strong>Name:</strong> ${this.escapeHtml(location.name)}</p>
                    <p><strong>College:</strong> ${this.escapeHtml(location.college || 'No College')}</p>
                    <p><strong>Hex Color:</strong> ${this.escapeHtml(location.hex_color || 'No Color')}</p>
                    <p><strong>Hex Number:</strong> ${this.escapeHtml(location.hex_number || 'No Number')}</p>
                </div>
                <div class="info-block">
                    <h3>Location Information</h3>
                    <p><strong>World Wound:</strong> ${this.escapeHtml((location.location_info && location.location_info.world_wound) || 'Not set')}</p>
                    <p><strong>Origin:</strong> ${this.escapeHtml((location.location_info && location.location_info.origin) || 'Not set')}</p>
                    <p><strong>Desire:</strong> ${this.escapeHtml((location.location_info && location.location_info.desire) || 'Not set')}</p>
                    <p><strong>Fear:</strong> ${this.escapeHtml((location.location_info && location.location_info.fear) || 'Not set')}</p>
                    <p><strong>Connection:</strong> ${this.escapeHtml((location.location_info && location.location_info.connection) || 'Not set')}</p>
                    <p><strong>Impact:</strong> ${this.escapeHtml((location.location_info && location.location_info.impact) || 'Not set')}</p>
                    <p><strong>Change:</strong> ${this.escapeHtml((location.location_info && location.location_info.change) || 'Not set')}</p>
                </div>
            </div>
        `;
    }

    showAutocomplete(searchTerm) {
        const matches = this.findMatches(searchTerm);
        
        console.log('Found', matches.length, 'matches for term:', searchTerm);
        
        if (matches.length === 0) {
            this.hideAutocomplete();
            return;
        }
        
        // Get appropriate autocomplete container
        let autocomplete = this.getAutocompleteContainer();
        
        if (!autocomplete) {
            console.error('No character autocomplete container found');
            return;
        }
        
        autocomplete.innerHTML = '';
        
        matches.forEach((character, index) => {
            const item = this.createAutocompleteItem(character, index === 0);
            autocomplete.appendChild(item);
        });
        
        this.positionAutocompleteAtCursor();
        autocomplete.style.display = 'block';
        this.autocompleteVisible = true;
        
        console.log('Autocomplete shown with', matches.length, 'items');
    }

    getAutocompleteContainer() {
        // Try to find autocomplete container based on context
        if (this.editorType === 'rich') {
            // For rich text, try popup version first, then regular
            let autocomplete = document.getElementById('popup-character-autocomplete');
            if (!autocomplete) {
                autocomplete = document.getElementById('character-autocomplete');
            }
            return autocomplete;
        } else {
            // For plain text, use universal container
            return this.ensureAutocompleteContainer();
        }
    }

    positionAutocompleteAtCursor() {
        let autocomplete = this.getAutocompleteContainer();
        if (!autocomplete) return;
        
        try {
            let rect;
            
            if (this.editorType === 'rich' && this.currentRange) {
                rect = this.currentRange.getBoundingClientRect();
            } else if (this.editorType === 'plain' && this.currentTextArea) {
                rect = this.getTextAreaCursorRect();
            } else {
                return;
            }
            
            autocomplete.style.position = 'fixed';
            autocomplete.style.left = Math.max(10, rect.left) + 'px';
            autocomplete.style.top = (rect.bottom + 5) + 'px';
            autocomplete.style.zIndex = '2500';
            
            // Keep it on screen
            const autocompleteRect = autocomplete.getBoundingClientRect();
            if (autocompleteRect.right > window.innerWidth) {
                autocomplete.style.left = (window.innerWidth - autocompleteRect.width - 10) + 'px';
            }
            if (autocompleteRect.bottom > window.innerHeight) {
                autocomplete.style.top = (rect.top - autocompleteRect.height - 5) + 'px';
            }
            
        } catch (error) {
            console.error('Error positioning autocomplete:', error);
        }
    }

    getTextAreaCursorRect() {
        if (!this.currentTextArea) return { left: 0, top: 0, bottom: 0 };
        
        const textarea = this.currentTextArea;
        const cursorPos = textarea.selectionStart;
        
        // Create a temporary div to measure text position
        const div = document.createElement('div');
        const style = getComputedStyle(textarea);
        
        div.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: pre-wrap;
            word-wrap: break-word;
            top: 0;
            left: 0;
            font-family: ${style.fontFamily};
            font-size: ${style.fontSize};
            font-weight: ${style.fontWeight};
            line-height: ${style.lineHeight};
            letter-spacing: ${style.letterSpacing};
            padding: ${style.padding};
            border: ${style.border};
            box-sizing: ${style.boxSizing};
            width: ${textarea.clientWidth}px;
        `;
        
        const textBeforeCursor = textarea.value.substring(0, cursorPos);
        div.textContent = textBeforeCursor;
        
        document.body.appendChild(div);
        
        // Add a span at the cursor position
        const span = document.createElement('span');
        span.textContent = '|';
        div.appendChild(span);
        
        const spanRect = span.getBoundingClientRect();
        const textareaRect = textarea.getBoundingClientRect();
        
        document.body.removeChild(div);
        
        return {
            left: textareaRect.left + spanRect.left - div.getBoundingClientRect().left,
            top: textareaRect.top + spanRect.top - div.getBoundingClientRect().top,
            bottom: textareaRect.top + spanRect.bottom - div.getBoundingClientRect().top
        };
    }

    hideAutocomplete() {
        // Hide all possible autocomplete containers
        const autocomplete1 = document.getElementById('character-autocomplete');
        const autocomplete2 = document.getElementById('popup-character-autocomplete');
        const autocomplete3 = document.getElementById('universal-character-autocomplete');
        
        if (autocomplete1) {
            autocomplete1.style.display = 'none';
        }
        if (autocomplete2) {
            autocomplete2.style.display = 'none';
        }
        if (autocomplete3) {
            autocomplete3.style.display = 'none';
        }
        
        this.autocompleteVisible = false;
    }

    findMatches(searchTerm) {
        if (!this.allCharacters || this.allCharacters.length === 0) {
            console.warn('No characters loaded for matching');
            return [];
        }
        
        if (!searchTerm || searchTerm.trim() === '') {
            return this.allCharacters.slice(0, 10);
        }
        
        const term = searchTerm.toLowerCase();
        const matches = this.allCharacters.filter(character => 
            character.name.toLowerCase().includes(term)
        ).slice(0, 10);
        
        console.log('Filtered', this.allCharacters.length, 'characters to', matches.length, 'matches');
        
        return matches;
    }

    createAutocompleteItem(character, selected = false) {
        const item = document.createElement('div');
        item.className = `autocomplete-item ${selected ? 'selected' : ''}`;
        item.dataset.characterId = character.id;
        item.dataset.characterName = character.name;
        item.dataset.characterType = character.type;
        
        let typeLabel = '';
        let placeholder = '👤';
        
        if (character.type === 'student') {
            typeLabel = `Student${character.grade ? ' - ' + character.grade : ''}`;
            placeholder = '👤';
        } else if (character.type === 'staff') {
            typeLabel = 'Staff';
            placeholder = '👤';
        } else if (character.type === 'location') {
            typeLabel = 'Location';
            placeholder = '📍';
        }
        
        // Handle image_path from character data
        let imagePath = character.image_path || '';
        
        if (imagePath) {
            const timestamp = Date.now();
            if (character.type === 'student') {
                // Student image_path already includes 'portraits/' subdirectory
                imagePath = `../students/${imagePath}?t=${timestamp}`;
            } else if (character.type === 'staff') {
                // Staff image_path already includes 'portraits/' subdirectory  
                imagePath = `../staff/${imagePath}?t=${timestamp}`;
            } else if (character.type === 'location') {
                imagePath = `../locations/${imagePath}?t=${timestamp}`;
            }
        }
        
        item.innerHTML = `
            ${imagePath ? 
                `<img src="${imagePath}" alt="${this.escapeHtml(character.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                 <div class="autocomplete-placeholder" style="display:none;">${placeholder}</div>` : 
                `<div class="autocomplete-placeholder">${placeholder}</div>`
            }
            <div class="autocomplete-item-info">
                <div class="autocomplete-item-name">${this.escapeHtml(character.name)}</div>
                <div class="autocomplete-item-details">${typeLabel}${character.college ? ' - ' + character.college : ''}${character.hex_color ? ' - ' + character.hex_color : ''}</div>
            </div>
        `;
        
        item.addEventListener('click', () => {
            this.selectCharacter(character.name);
        });
        
        return item;
    }

    updateSelection(items, selectedIndex) {
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });
    }

    selectCharacter(characterName) {
        const character = this.findCharacterByName(characterName);
        if (!character) {
            console.error('Character not found for selection:', characterName);
            return;
        }
        
        console.log('Selecting character:', character.name);
        
        // Set character processing state with timeout protection
        if (!this.setProcessingState(true, `selecting character: ${character.name}`)) {
            console.warn('Could not start character processing, already in progress');
            return;
        }
        
        try {
            if (this.editorType === 'rich') {
                this.replaceTextWithCharacterLink(character);
            } else {
                this.replaceTextWithPlainCharacterReference(character);
            }
            
            this.hideAutocomplete();
            
            // Clear processing state immediately after successful completion
            this.clearProcessingState();
            
            // Mark as unsaved after processing is complete
            if (window.gmScreen) {
                window.gmScreen.unsavedChanges = true;
                console.log('Character selection complete, marked as unsaved');
            }
            
        } catch (error) {
            console.error('Error during character selection:', error);
            this.clearProcessingState();
        }
    }

    replaceTextWithPlainCharacterReference(character) {
        if (!this.currentTextArea) {
            console.warn('No current textarea available for character reference replacement');
            return;
        }
        
        try {
            const textarea = this.currentTextArea;
            const cursorPos = this.currentCursorPosition;
            const text = textarea.value;
            
            // Find the [[ pattern before cursor
            const textBefore = text.substring(0, cursorPos);
            const lastBrackets = textBefore.lastIndexOf('[[');
            
            if (lastBrackets === -1) {
                console.warn('No [[ pattern found before cursor in textarea');
                return;
            }
            
            // Replace [[searchTerm with [Character Name]
            const beforePattern = text.substring(0, lastBrackets);
            const afterCursor = text.substring(cursorPos);
            const characterReference = `[${character.name}]`;
            
            const newText = beforePattern + characterReference + ' ' + afterCursor;
            const newCursorPos = beforePattern.length + characterReference.length + 1;
            
            textarea.value = newText;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            
            // Trigger change event for auto-save
            const event = new Event('input', { bubbles: true });
            textarea.dispatchEvent(event);
            
            console.log('Replaced plain text with character reference:', characterReference);
            
        } catch (error) {
            console.error('Error replacing text with character reference:', error);
            throw error; // Re-throw to be handled by selectCharacter
        }
    }

    replaceTextWithCharacterLink(character) {
        try {
            const selection = window.getSelection();
            if (!selection.rangeCount) {
                console.warn('No selection available for character link replacement');
                return;
            }
            
            const range = selection.getRangeAt(0);
            const textBefore = this.getTextBeforeCursor(range);
            const lastBrackets = textBefore.lastIndexOf('[[');
            
            if (lastBrackets === -1) {
                console.warn('No [[ pattern found before cursor');
                return;
            }
            
            // Use the improved replacement method
            const searchPattern = '[[' + this.searchTerm;
            const linkHtml = this.createCharacterLinkHtml(character);
            
            this.replaceTextInEditorFixed(searchPattern, linkHtml);
            
            console.log('Replaced text with character link for:', character.name);
            
        } catch (error) {
            console.error('Error replacing text with character link:', error);
            throw error; // Re-throw to be handled by selectCharacter
        }
    }

    createCharacterLinkHtml(character) {
        let borderColor = '#007bff';
        if (character.type === 'student') {
            borderColor = '#28a745'; // Green for students
        } else if (character.type === 'staff') {
            borderColor = '#dc3545'; // Red for staff
        } else if (character.type === 'location') {
            borderColor = '#6610f2'; // Purple for locations
        }
        
        return `<span class="character-link ${character.type}" 
                      data-character-id="${character.id}" 
                      data-character-type="${character.type}"
                      contenteditable="false"
                      title="Click to open ${character.name} in new tab"
                      style="color: #007bff; background-color: rgba(0, 123, 255, 0.1); padding: 2px 4px; border-radius: 3px; cursor: pointer; font-weight: 500; border-left: 3px solid ${borderColor}; display: inline;">${character.name}</span>`;
    }

    // FIXED VERSION - This preserves existing HTML formatting
    replaceTextInEditorFixed(searchText, replaceHtml) {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        
        // Find the text node that contains our search text
        const walker = document.createTreeWalker(
            this.currentEditor,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let textNode;
        let searchIndex = -1;
        
        // Find the text node containing our search pattern
        while (textNode = walker.nextNode()) {
            const index = textNode.textContent.indexOf(searchText);
            if (index !== -1) {
                searchIndex = index;
                break;
            }
        }
        
        if (!textNode || searchIndex === -1) {
            console.warn('Could not find search text:', searchText);
            return;
        }
        
        // Create a range for the text to replace
        const replaceRange = document.createRange();
        replaceRange.setStart(textNode, searchIndex);
        replaceRange.setEnd(textNode, searchIndex + searchText.length);
        
        // Delete the old text
        replaceRange.deleteContents();
        
        // Create the new link element
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = replaceHtml;
        const linkElement = tempDiv.firstChild;
        
        // Insert the new link
        replaceRange.insertNode(linkElement);
        
        // Position cursor after the link and add a space
        const newRange = document.createRange();
        newRange.setStartAfter(linkElement);
        newRange.collapse(true);
        
        // Add a space after the link
        const spaceNode = document.createTextNode(' ');
        newRange.insertNode(spaceNode);
        newRange.setStartAfter(spaceNode);
        
        // Set the selection to after the space
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        console.log('Successfully replaced text with character link:', searchText);
    }

    convertPlainTextReferencesToLinks() {
        if (!this.currentEditor || !this.isInitialized) return;
        
        try {
            // Look for [[character]] patterns that aren't already links
            const regex = /\[\[([^\]]+)\]\]/g;
            
            // First, find all text nodes and check for patterns
            const walker = document.createTreeWalker(
                this.currentEditor,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
                if (regex.test(node.textContent)) {
                    textNodes.push(node);
                }
            }
            
            // Process each text node that contains patterns
            textNodes.forEach(textNode => {
                try {
                    const text = textNode.textContent;
                    const matches = [];
                    
                    // Reset regex
                    regex.lastIndex = 0;
                    let match;
                    while ((match = regex.exec(text)) !== null) {
                        const characterName = match[1];
                        const character = this.findCharacterByName(characterName);
                        
                        if (character) {
                            matches.push({
                                index: match.index,
                                length: match[0].length,
                                text: match[0],
                                character: character
                            });
                        } else {
                            console.warn(`Character not found for conversion: ${characterName}`);
                        }
                    }
                    
                    // Replace matches from right to left to preserve indices
                    matches.reverse().forEach(match => {
                        try {
                            const range = document.createRange();
                            range.setStart(textNode, match.index);
                            range.setEnd(textNode, match.index + match.length);
                            
                            range.deleteContents();
                            
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = this.createCharacterLinkHtml(match.character);
                            const linkElement = tempDiv.firstChild;
                            
                            range.insertNode(linkElement);
                        } catch (error) {
                            console.error('Error replacing character link:', error);
                        }
                    });
                } catch (error) {
                    console.error('Error processing text node for character links:', error);
                }
            });
            
            console.log('Character link conversion completed');
            
        } catch (error) {
            console.error('Error converting plain text references to links:', error);
        }
    }

    findCharacterByName(name) {
        if (!this.allCharacters || this.allCharacters.length === 0) {
            console.warn('No characters available for name lookup');
            return null;
        }
        
        return this.allCharacters.find(char => 
            char.name.toLowerCase() === name.toLowerCase()
        );
    }

    findCharacterById(id, type) {
        if (!this.allCharacters || this.allCharacters.length === 0) {
            console.warn('No characters available for ID lookup');
            return null;
        }
        
        return this.allCharacters.find(char => 
            char.id === id && char.type === type
        );
    }

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

    // Public method to check if system is ready
    isReady() {
        return this.isInitialized && this.allCharacters.length > 0;
    }

    // Public method to check if character processing is in progress
    isProcessing() {
        // Check if processing has timed out
        if (this.isProcessingCharacter && this.processingStartTime) {
            const elapsed = Date.now() - this.processingStartTime;
            if (elapsed > this.maxProcessingTime) {
                console.warn('Character processing timed out, auto-clearing state');
                this.clearProcessingState();
                return false;
            }
        }
        return this.isProcessingCharacter;
    }

    // Set character processing state with timeout protection
    setProcessingState(isProcessing, reason = '') {
        if (isProcessing) {
            if (this.isProcessingCharacter) {
                console.warn('Character processing already in progress, ignoring new request');
                return false;
            }
            
            console.log(`Starting character processing: ${reason}`);
            this.isProcessingCharacter = true;
            this.processingStartTime = Date.now();
            
            // Set maximum timeout
            this.processingTimeout = setTimeout(() => {
                console.warn('Character processing timeout reached, auto-clearing state');
                this.clearProcessingState();
            }, this.maxProcessingTime);
            
            return true;
        } else {
            this.clearProcessingState();
            return true;
        }
    }

    // Clear character processing state
    clearProcessingState() {
        if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
            this.processingTimeout = null;
        }
        
        if (this.isProcessingCharacter) {
            const elapsed = this.processingStartTime ? Date.now() - this.processingStartTime : 0;
            console.log(`Clearing character processing state (elapsed: ${elapsed}ms)`);
        }
        
        this.isProcessingCharacter = false;
        this.processingStartTime = null;
    }

    // Force reset state (for debugging/recovery)
    forceResetState() {
        console.log('Force resetting character lookup state');
        this.clearProcessingState();
        this.hideAutocomplete();
        this.autocompleteVisible = false;
        this.selectedCharacter = null;
        this.searchTerm = '';
        this.currentRange = null;
        this.currentCursorPosition = null;
    }

    // Start periodic state validation
    startStateValidation() {
        // Validate state every 10 seconds
        setInterval(() => {
            this.validateState();
        }, 10000);
        
        console.log('Character lookup state validation started');
    }

    // Validate current state and auto-correct if needed
    validateState() {
        // Check for stuck processing state
        if (this.isProcessingCharacter && this.processingStartTime) {
            const elapsed = Date.now() - this.processingStartTime;
            if (elapsed > this.maxProcessingTime) {
                console.warn('State validation: Processing state stuck, auto-clearing');
                this.clearProcessingState();
            }
        }
        
        // Check for orphaned timeouts
        if (this.processingTimeout && !this.isProcessingCharacter) {
            console.warn('State validation: Orphaned timeout detected, clearing');
            clearTimeout(this.processingTimeout);
            this.processingTimeout = null;
        }
        
        // Check for stuck autocomplete
        if (this.autocompleteVisible) {
            const autocompleteElements = document.querySelectorAll('.character-autocomplete');
            let visibleCount = 0;
            autocompleteElements.forEach(el => {
                if (el.style.display !== 'none') {
                    visibleCount++;
                }
            });
            
            if (visibleCount === 0) {
                console.warn('State validation: Autocomplete state inconsistent, correcting');
                this.autocompleteVisible = false;
            }
        }
    }

    // Add global recovery function
    static addGlobalRecovery() {
        // Add to window for debugging
        window.characterLookupRecovery = {
            reset: () => {
                if (window.characterLookup) {
                    window.characterLookup.forceResetState();
                    console.log('Character lookup state reset via global recovery');
                }
            },
            status: () => {
                if (window.characterLookup) {
                    return {
                        isProcessing: window.characterLookup.isProcessing(),
                        processingStartTime: window.characterLookup.processingStartTime,
                        autocompleteVisible: window.characterLookup.autocompleteVisible,
                        isInitialized: window.characterLookup.isInitialized,
                        characterCount: window.characterLookup.allCharacters.length
                    };
                }
                return { error: 'Character lookup not available' };
            }
        };
        
        console.log('Global character lookup recovery functions added to window.characterLookupRecovery');
    }

    // Public method to get character count
    getCharacterCount() {
        return this.allCharacters.length;
    }

    // Public method to setup autocomplete for multiple text areas
    setupTextAreasAutocomplete(textAreas) {
        if (!Array.isArray(textAreas)) {
            textAreas = [textAreas];
        }
        
        textAreas.forEach(textArea => {
            if (textArea && (textArea.tagName === 'TEXTAREA' || textArea.tagName === 'INPUT')) {
                this.setupTextAreaListeners(textArea);
            }
        });
        
        console.log('Set up autocomplete for', textAreas.length, 'text areas');
    }

    // Public method to setup autocomplete for all text areas in a container
    setupContainerAutocomplete(container) {
        if (!container) return;
        
        const textAreas = container.querySelectorAll('textarea, input[type="text"]');
        this.setupTextAreasAutocomplete(Array.from(textAreas));
        
        console.log('Set up autocomplete for container with', textAreas.length, 'text areas');
    }

    // Create overlay system for a textarea
    createTextAreaOverlay(textArea) {
        if (this.textAreaOverlays.has(textArea)) {
            return; // Already has overlay
        }
        
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.className = 'textarea-link-overlay';
        overlay.style.cssText = `
            position: absolute;
            pointer-events: none;
            z-index: 10;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            padding: inherit;
            border: inherit;
            box-sizing: border-box;
            overflow: hidden;
            white-space: pre-wrap;
            word-wrap: break-word;
        `;
        
        // Position overlay relative to textarea
        const textAreaRect = textArea.getBoundingClientRect();
        const textAreaStyle = getComputedStyle(textArea);
        
        // Make textarea container position relative if it isn't already
        const container = textArea.parentElement;
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        
        // Insert overlay after textarea
        textArea.parentElement.insertBefore(overlay, textArea.nextSibling);
        
        // Store overlay reference
        this.textAreaOverlays.set(textArea, overlay);
        
        console.log('Created overlay for textarea');
    }

    // Update overlays for a textarea to show character links
    updateTextAreaOverlays(textArea) {
        if (!this.isInitialized || !this.textAreaOverlays.has(textArea)) {
            return;
        }
        
        const overlay = this.textAreaOverlays.get(textArea);
        const text = textArea.value;
        
        // Clear existing overlays
        overlay.innerHTML = '';
        
        // Find all character references [character name]
        const characterPattern = /\[([^\]]+)\]/g;
        const matches = [];
        let match;
        
        while ((match = characterPattern.exec(text)) !== null) {
            const characterName = match[1];
            const character = this.findCharacterByName(characterName);
            
            if (character) {
                matches.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    text: match[0],
                    characterName: characterName,
                    character: character
                });
            }
        }
        
        if (matches.length === 0) {
            return;
        }
        
        // Create invisible text container to measure positions
        const measurer = this.createTextMeasurer(textArea);
        
        // Create clickable overlays for each character reference
        matches.forEach(match => {
            const linkElement = this.createCharacterLinkOverlay(match, textArea, measurer);
            if (linkElement) {
                overlay.appendChild(linkElement);
            }
        });
        
        // Clean up measurer
        document.body.removeChild(measurer);
        
        console.log('Updated overlays for', matches.length, 'character references');
    }

    // Create a text measurer element that matches the textarea styling
    createTextMeasurer(textArea) {
        const measurer = document.createElement('div');
        const style = getComputedStyle(textArea);
        
        measurer.style.cssText = `
            position: absolute;
            visibility: hidden;
            top: -9999px;
            left: -9999px;
            width: ${textArea.clientWidth}px;
            height: auto;
            font-family: ${style.fontFamily};
            font-size: ${style.fontSize};
            font-weight: ${style.fontWeight};
            line-height: ${style.lineHeight};
            letter-spacing: ${style.letterSpacing};
            padding: ${style.padding};
            border: ${style.border};
            box-sizing: ${style.boxSizing};
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-wrap: break-word;
        `;
        
        document.body.appendChild(measurer);
        return measurer;
    }

    // Create a clickable overlay for a character reference
    createCharacterLinkOverlay(match, textArea, measurer) {
        try {
            const text = textArea.value;
            const beforeText = text.substring(0, match.start);
            const matchText = match.text;
            
            // Measure position of the character reference
            measurer.innerHTML = beforeText + '<span id="measure-point"></span>' + 
                                matchText + '<span id="measure-end"></span>';
            
            const measurePoint = measurer.querySelector('#measure-point');
            const measureEnd = measurer.querySelector('#measure-end');
            
            if (!measurePoint || !measureEnd) {
                return null;
            }
            
            const startPos = {
                x: measurePoint.offsetLeft,
                y: measurePoint.offsetTop
            };
            
            const endPos = {
                x: measureEnd.offsetLeft,
                y: measureEnd.offsetTop
            };
            
            // Create link overlay element
            const linkElement = document.createElement('span');
            linkElement.className = `character-link-overlay ${match.character.type}`;
            linkElement.textContent = matchText;
            linkElement.dataset.characterId = match.character.id;
            linkElement.dataset.characterType = match.character.type;
            linkElement.dataset.characterName = match.character.name;
            linkElement.title = `Click to open ${match.character.name} (${match.character.type})`;
            
            // Position the overlay
            linkElement.style.cssText = `
                position: absolute;
                left: ${startPos.x}px;
                top: ${startPos.y}px;
                pointer-events: auto;
                cursor: pointer;
                z-index: 15;
            `;
            
            // Hover effects are now handled by CSS
            
            // Add click handler
            linkElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleCharacterLinkClick(match.character);
            });
            
            return linkElement;
            
        } catch (error) {
            console.error('Error creating character link overlay:', error);
            return null;
        }
    }

    // Get color for character type
    getCharacterTypeColor(type) {
        switch (type) {
            case 'student': return '#28a745'; // Green
            case 'staff': return '#dc3545';   // Red  
            case 'location': return '#6610f2'; // Purple
            default: return '#007bff';        // Blue
        }
    }

    // Handle click on character link overlay
    handleCharacterLinkClick(character) {
        console.log('Character link clicked:', character.name, character.type);
        
        // Determine URL based on character type
        let url;
        switch (character.type) {
            case 'student':
                url = `../students/index.php?open=${encodeURIComponent(character.id)}`;
                break;
            case 'staff':
                url = `../staff/index.php?open=${encodeURIComponent(character.id)}`;
                break;
            case 'location':
                url = `../locations/index.php?open=${encodeURIComponent(character.id)}`;
                break;
            default:
                console.warn('Unknown character type:', character.type);
                return;
        }
        
        // Open in new tab
        window.open(url, '_blank');
    }

    // Clean up overlay for a textarea
    cleanupTextAreaOverlay(textArea) {
        if (this.textAreaOverlays.has(textArea)) {
            const overlay = this.textAreaOverlays.get(textArea);
            if (overlay.parentElement) {
                overlay.parentElement.removeChild(overlay);
            }
            this.textAreaOverlays.delete(textArea);
        }
        
        if (this.observerMap.has(textArea)) {
            const observer = this.observerMap.get(textArea);
            observer.disconnect();
            this.observerMap.delete(textArea);
        }
        
        // Clean up resize handler
        if (textArea._characterLookupResizeHandler) {
            window.removeEventListener('resize', textArea._characterLookupResizeHandler);
            delete textArea._characterLookupResizeHandler;
        }
    }
}

// Remove old modal functions since we're not using modals anymore
function closeCharacterModal() {
    // Deprecated - keeping for compatibility
}

function openCharacterInNewTab() {
    // Deprecated - keeping for compatibility
}

// Initialize
window.characterLookup = new CharacterLookup();
window.CharacterLookup = CharacterLookup;

// Add global recovery functions
CharacterLookup.addGlobalRecovery();

// Helper function to quickly set up autocomplete for elements
window.setupCharacterAutocomplete = function(elements) {
    if (!window.characterLookup.isReady()) {
        console.warn('Character lookup not ready yet. Trying again in 1 second...');
        setTimeout(() => {
            window.setupCharacterAutocomplete(elements);
        }, 1000);
        return;
    }
    
    if (elements) {
        if (typeof elements === 'string') {
            // Query selector
            const selected = document.querySelectorAll(elements);
            window.characterLookup.setupTextAreasAutocomplete(Array.from(selected));
        } else if (elements.nodeType) {
            // Single element
            window.characterLookup.setupTextAreasAutocomplete([elements]);
        } else if (Array.isArray(elements) || elements.length !== undefined) {
            // Array or NodeList
            window.characterLookup.setupTextAreasAutocomplete(Array.from(elements));
        }
    }
};

// Auto-setup for common containers when ready
window.addEventListener('DOMContentLoaded', () => {
    // Auto-setup will be handled by individual section JavaScript files
    console.log('Character lookup DOM ready - waiting for initialization');
});