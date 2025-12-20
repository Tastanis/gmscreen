// Staff Management JavaScript

// Store rich text editor instances
let modalRichTextEditors = new Map();

// Initialize character lookup when ready
function initializeCharacterLookup() {
    if (window.characterLookup && !window.characterLookup.isReady()) {
        window.characterLookup.init().then(() => {
            console.log('Character lookup initialized for staff section');
            setupExistingTextAreasAutocomplete();
        }).catch(error => {
            console.warn('Character lookup initialization failed:', error);
        });
    } else if (window.characterLookup && window.characterLookup.isReady()) {
        setupExistingTextAreasAutocomplete();
    }
}

// Setup rich text editors for modal
function setupModalRichTextEditors(container, staffData) {
    if (typeof RichTextEditor === 'undefined') {
        console.warn('RichTextEditor not available');
        return;
    }
    
    // Clean up existing editors
    cleanupModalRichTextEditors();
    
    const containers = container.querySelectorAll('.rich-text-container');
    containers.forEach(richContainer => {
        const field = richContainer.getAttribute('data-field');
        const placeholder = richContainer.getAttribute('data-placeholder') || 'Enter text...';
        
        if (field) {
            // Create rich text editor
            const editor = new RichTextEditor(richContainer, {
                placeholder: placeholder + ' Type [[character name]] to link to characters'
            });
            
            editor.init();
            
            // Set content from staff data
            const fieldValue = getNestedFieldValue(staffData, field);
            if (fieldValue) {
                editor.setContent(fieldValue);
            }
            
            // Setup auto-save
            editor.onChange((content) => {
                saveStaffField(staffData.staff_id, field, content);
            });
            
            // Connect to character lookup system
            if (window.characterLookup && window.characterLookup.isReady()) {
                const editorElement = editor.getEditor();
                if (editorElement) {
                    console.log('Connecting rich text editor to character lookup for field:', field);
                    window.characterLookup.setupEditorListeners(editorElement);
                }
            } else {
                // Try to initialize character lookup if not ready
                setTimeout(() => {
                    if (window.characterLookup && window.characterLookup.isReady()) {
                        const editorElement = editor.getEditor();
                        if (editorElement) {
                            console.log('Delayed connection of rich text editor to character lookup for field:', field);
                            window.characterLookup.setupEditorListeners(editorElement);
                        }
                    }
                }, 500);
            }
            
            // Store editor reference
            modalRichTextEditors.set(field, editor);
        }
    });
    
    console.log('Set up', modalRichTextEditors.size, 'rich text editors for staff modal');
}

// Clean up rich text editors
function cleanupModalRichTextEditors() {
    modalRichTextEditors.forEach((editor, field) => {
        if (editor && editor.destroy) {
            editor.destroy();
        }
    });
    modalRichTextEditors.clear();
}

// Get nested field value from staff data
function getNestedFieldValue(staffData, field) {
    const parts = field.split('.');
    let value = staffData;
    
    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            return '';
        }
    }
    
    return value || '';
}

// Setup autocomplete for any existing text areas
function setupExistingTextAreasAutocomplete() {
    const modal = document.getElementById('staff-modal');
    if (modal) {
        setupModalTextAreasAutocomplete(modal);
    }
}

// Setup autocomplete for text areas in modal
function setupModalTextAreasAutocomplete(container) {
    if (!window.characterLookup || !window.characterLookup.isReady()) {
        return;
    }
    
    const textAreas = container.querySelectorAll('textarea');
    textAreas.forEach(textarea => {
        // Only setup for specific fields that make sense for character linking
        const field = textarea.getAttribute('data-field');
        if (field && (
            field.includes('character_description') || 
            field.includes('general_info') ||
            field.includes('personality') ||
            field.includes('other') ||
            field.includes('origin') ||
            field.includes('desire') ||
            field.includes('fear') ||
            field.includes('connection') ||
            field.includes('impact') ||
            field.includes('change')
        )) {
            window.characterLookup.setupTextAreaListeners(textarea);
        }
    });
    
    console.log('Set up autocomplete for staff modal text areas');
}

// Setup event listeners
function setupEventListeners() {
    // Initialize character lookup
    setTimeout(initializeCharacterLookup, 500);
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function() {
            currentFilters.search = this.value.trim();
            loadStaff();
        }, 300));
    }
    
    // Sort buttons
    document.querySelectorAll('[data-sort]').forEach(btn => {
        btn.addEventListener('click', function() {
            const sortType = this.getAttribute('data-sort');
            
            // Update active state
            document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            currentSort = sortType;
            loadStaff();
        });
    });
    
    // Filter selects
    const collegeFilter = document.getElementById('filter-college');
    if (collegeFilter) {
        collegeFilter.addEventListener('change', function() {
            currentFilters.college = this.value;
            loadStaff();
        });
    }
    
    // Favorites toggle
    const favoritesToggle = document.getElementById('favorites-toggle');
    if (favoritesToggle) {
        favoritesToggle.addEventListener('click', function() {
            currentFilters.favorites = !currentFilters.favorites;
            this.classList.toggle('active', currentFilters.favorites);
            loadStaff();
        });
    }
    
    // Add staff button (GM only)
    if (isGM) {
        const addStaffBtn = document.getElementById('add-staff-btn');
        if (addStaffBtn) {
            addStaffBtn.addEventListener('click', addStaffMember);
        }
        
        // Export button (GM only)
        const exportBtn = document.getElementById('export-staff-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportStaff);
        }
        
        // Delete button (GM only)
        const modalDeleteBtn = document.getElementById('modal-delete-btn');
        if (modalDeleteBtn) {
            modalDeleteBtn.addEventListener('click', deleteStaffMember);
        }
    }
    
    // Modal controls (available to all users)
    const modalFavoriteBtn = document.getElementById('modal-favorite-btn');
    if (modalFavoriteBtn) {
        modalFavoriteBtn.addEventListener('click', toggleStaffFavorite);
    }
    
    // Expand button (available to all users)
    const modalExpandBtn = document.getElementById('modal-expand-btn');
    if (modalExpandBtn) {
        modalExpandBtn.addEventListener('click', expandStaffToNewTab);
    }
    
    // Modal close on background click
    const modal = document.getElementById('staff-modal');
    if (modal) {
        let backgroundPointerDown = false;

        modal.addEventListener('mousedown', function(e) {
            backgroundPointerDown = e.target === modal;
        });

        modal.addEventListener('mouseup', function(e) {
            if (backgroundPointerDown && e.target === modal) {
                closeStaffModal();
            }
            backgroundPointerDown = false;
        });
    }
}

// Load staff from server
function loadStaff() {
    showLoading(true);
    
    const formData = new FormData();
    formData.append('action', 'load_staff');
    formData.append('sort_by', currentSort);
    formData.append('filter_college', currentFilters.college);
    formData.append('show_favorites', currentFilters.favorites.toString());
    formData.append('search_term', currentFilters.search);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        if (data.success) {
            displayStaff(data.staff);
            // Store staff globally for auto-open functionality
            window.allStaff = data.staff;
            window.staffLoaded = true;
        } else {
            console.error('Failed to load staff:', data.error);
            showError('Failed to load staff');
        }
    })
    .catch(error => {
        showLoading(false);
        console.error('Error loading staff:', error);
        showError('Error loading staff');
    });
}

// Display staff in grid
function displayStaff(staff) {
    const grid = document.getElementById('staff-grid');
    
    if (staff.length === 0) {
        grid.innerHTML = `
            <div class="no-staff">
                <div class="no-staff-icon">👥</div>
                <p>No staff found matching your criteria.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = staff.map(member => createStaffCard(member)).join('');
    
    // Add click event listeners to cards
    grid.querySelectorAll('.staff-card').forEach(card => {
        card.addEventListener('click', function() {
            const staffId = this.getAttribute('data-staff-id');
            const member = staff.find(s => s.staff_id === staffId);
            if (member) {
                openStaffModal(member);
            }
        });
    });
}

// Create staff card HTML
function createStaffCard(member) {
    const isFavorite = member.favorites && member.favorites[currentUser];
    const favoriteIcon = isFavorite ? '<div class="staff-favorite">★</div>' : '';
    
    // Handle both old image_path and new images array for backward compatibility
    let thumbnailImage = '';
    if (member.images && member.images.length > 0) {
        thumbnailImage = member.images[0];
    } else if (member.image_path) {
        thumbnailImage = member.image_path;
    }
    
    const imageHtml = thumbnailImage ? 
        `<img src="${escapeHtml(thumbnailImage)}?t=${Date.now()}" alt="${escapeHtml(member.name)}" class="staff-thumbnail">` :
        `<div class="staff-placeholder">No Photo</div>`;
    
    return `
        <div class="staff-card" data-staff-id="${escapeHtml(member.staff_id)}">
            ${favoriteIcon}
            ${imageHtml}
            <div class="staff-name">${escapeHtml(member.name)}</div>
            <div class="staff-info">
                <div class="staff-college">${escapeHtml(member.college || 'No College')}</div>
            </div>
        </div>
    `;
}


// Open staff detail modal
function openStaffModal(member) {
    selectedStaff = member;
    
    const modal = document.getElementById('staff-modal');
    const modalName = document.getElementById('modal-staff-name');
    const modalBody = modal.querySelector('.staff-details');
    
    modalName.textContent = member.name;
    
    // Update favorite button (available to all users)
    const favoriteBtn = document.getElementById('modal-favorite-btn');
    if (favoriteBtn) {
        const isFavorite = member.favorites && member.favorites[currentUser];
        favoriteBtn.classList.toggle('active', isFavorite);
        favoriteBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
    }
    
    // Build modal content
    modalBody.innerHTML = createStaffDetailForm(member);
    
    // Add event listeners for form inputs (GM only) - only input and select, rich text editors handle themselves
    if (isGM) {
        modalBody.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', function() {
                const field = this.getAttribute('data-field');
                const value = this.value;
                saveStaffField(member.staff_id, field, value);
            });
        });
    }
    
    // Setup rich text editors
    setupModalRichTextEditors(modalBody, member);
    
    modal.style.display = 'block';
}

// Create staff detail form
function createStaffDetailForm(member) {
    const gmOnly = member.gm_only || {};
    const characterInfo = member.character_info || {};
    
    // Handle both old image_path and new images array for backward compatibility
    let images = [];
    if (member.images && member.images.length > 0) {
        images = member.images;
    } else if (member.image_path) {
        images = [member.image_path];
    }
    
    const imageHtml = images.length > 0 ? 
        createImageGallery(images, member.staff_id, 'staff') :
        `<div class="staff-portrait-placeholder">No Photo</div>`;
    
    const uploadButton = isGM ? 
        `<button class="upload-portrait-btn" onclick="uploadStaffPortrait('${member.staff_id}')">Upload Photo</button>` : '';
    
    return `
        <div class="staff-form">
            <!-- Portrait Section -->
            <div class="staff-portrait-section">
                ${imageHtml}
                ${uploadButton}
            </div>
            
            <!-- Basic Information -->
            <div class="form-section">
                <h3>Basic Information</h3>
                <div class="form-group">
                    <label>Name:</label>
                    ${isGM ? 
                        `<input type="text" value="${escapeHtml(member.name)}" data-field="name">` :
                        `<div class="readonly-field">${escapeHtml(member.name)}</div>`
                    }
                </div>
                <div class="form-group">
                    <label>College:</label>
                    ${isGM ? 
                        `<select data-field="college">
                            <option value="">No College</option>
                            <option value="Silverquill" ${member.college === 'Silverquill' ? 'selected' : ''}>Silverquill</option>
                            <option value="Prismari" ${member.college === 'Prismari' ? 'selected' : ''}>Prismari</option>
                            <option value="Witherbloom" ${member.college === 'Witherbloom' ? 'selected' : ''}>Witherbloom</option>
                            <option value="Lorehold" ${member.college === 'Lorehold' ? 'selected' : ''}>Lorehold</option>
                            <option value="Quandrix" ${member.college === 'Quandrix' ? 'selected' : ''}>Quandrix</option>
                        </select>` :
                        `<div class="readonly-field">${escapeHtml(member.college || 'No College')}</div>`
                    }
                </div>
                <div class="form-group">
                    <label>Character Description:</label>
                    ${isGM ? 
                        `<div class="rich-text-container medium" data-field="character_description" data-placeholder="Brief character description..."></div>` :
                        `<div class="readonly-field readonly-textarea">${escapeHtml(member.character_description || 'No description available')}</div>`
                    }
                </div>
                <div class="form-group">
                    <label>General Information:</label>
                    ${isGM ? 
                        `<div class="rich-text-container large" data-field="general_info" data-placeholder="General information about this staff member..."></div>` :
                        `<div class="readonly-field readonly-textarea">${escapeHtml(member.general_info || 'No general information available')}</div>`
                    }
                </div>
            </div>

            <!-- Character Information Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only character-info">
                <h3>Character Information</h3>
                <div class="form-group">
                    <label>Origin:</label>
                    <div class="rich-text-container" data-field="character_info.origin" data-placeholder="Character's origin and background..."></div>
                </div>
                <div class="form-group">
                    <label>Desire:</label>
                    <div class="rich-text-container" data-field="character_info.desire" data-placeholder="What the character desires most..."></div>
                </div>
                <div class="form-group">
                    <label>Fear:</label>
                    <div class="rich-text-container" data-field="character_info.fear" data-placeholder="Character's fears and anxieties..."></div>
                </div>
                <div class="form-group">
                    <label>Connection:</label>
                    <div class="rich-text-container" data-field="character_info.connection" data-placeholder="Important connections to people, places, or things..."></div>
                </div>
                <div class="form-group">
                    <label>Impact:</label>
                    <div class="rich-text-container" data-field="character_info.impact" data-placeholder="How this character affects others..."></div>
                </div>
                <div class="form-group">
                    <label>Change:</label>
                    <div class="rich-text-container" data-field="character_info.change" data-placeholder="How the character grows or changes..."></div>
                </div>
            </div>
            ` : ''}

            <!-- GM Only Section -->
            ${isGM ? `
            <div class="form-section gm-only">
                <h3>GM Only Information</h3>
                <div class="form-group">
                    <label>Personality:</label>
                    <div class="rich-text-container medium" data-field="gm_only.personality" data-placeholder="Personality notes for GM..."></div>
                </div>
                <div class="form-group">
                    <label>Other:</label>
                    <div class="rich-text-container medium" data-field="gm_only.other" data-placeholder="Other GM notes..."></div>
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

// Close staff modal
function closeStaffModal() {
    // Clean up rich text editors
    cleanupModalRichTextEditors();
    
    const modal = document.getElementById('staff-modal');
    modal.style.display = 'none';
    selectedStaff = null;
}

// Expand staff to new tab
function expandStaffToNewTab() {
    if (!selectedStaff) return;
    
    const newWindow = window.open('', '_blank');
    const member = selectedStaff;
    
    newWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(member.name)} - Staff Details</title>
            <link rel="stylesheet" href="../../../css/style.css">
            <link rel="stylesheet" href="css/staff.css">
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
                .save-indicator {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 10px 15px;
                    background: #27ae60;
                    color: white;
                    border-radius: 6px;
                    z-index: 1000;
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="save-indicator" id="save-indicator">Saved!</div>
            <div class="standalone-header">
                <h1>${escapeHtml(member.name)} - Staff Details</h1>
                <p>${escapeHtml(member.college || 'No College')}</p>
                ${isGM ? '<p><small>Changes auto-save as you type</small></p>' : ''}
            </div>
            <div class="standalone-content">
                <div class="staff-details">
                    ${createStaffDetailForm(member)}
                </div>
            </div>
            
            <script src="../gm/js/character-lookup.js"></script>
            <script src="../gm/js/rich-text-editor.js"></script>
            <script>
                // Copy necessary variables and functions to the popout
                const isGM = ${isGM};
                const currentUser = '${currentUser}';
                const staffData = ${JSON.stringify(member)};
                
                // Save function for popout window (GM only)
                function saveStaffField(staffId, field, value) {
                    if (!isGM) return;
                    
                    // Handle nested GM-only fields
                    if (field.startsWith('gm_only.')) {
                        const gmField = field.split('.')[1];
                        const formData = new FormData();
                        formData.append('action', 'save_staff');
                        formData.append('staff_id', staffId);
                        formData.append('field', 'gm_only.' + gmField);
                        formData.append('value', value);
                        
                        fetch('index.php', {
                            method: 'POST',
                            body: formData
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                if (!staffData.gm_only) staffData.gm_only = {};
                                staffData.gm_only[gmField] = value;
                                showSaveIndicator();
                            } else {
                                console.error('Failed to save GM field:', data.error);
                            }
                        })
                        .catch(error => {
                            console.error('Error saving GM field:', error);
                        });
                        return;
                    }
                    
                    const formData = new FormData();
                    formData.append('action', 'save_staff');
                    formData.append('staff_id', staffId);
                    formData.append('field', field);
                    formData.append('value', value);
                    
                    fetch('index.php', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showSaveIndicator();
                            // Update local staff data
                            staffData[field] = value;
                        } else {
                            console.error('Failed to save field:', data.error);
                        }
                    })
                    .catch(error => {
                        console.error('Error saving field:', error);
                    });
                }
                
                function showSaveIndicator() {
                    const indicator = document.getElementById('save-indicator');
                    indicator.style.display = 'block';
                    setTimeout(() => {
                        indicator.style.display = 'none';
                    }, 2000);
                }
                
                function escapeHtml(text) {
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
                
                function debounce(func, wait) {
                    let timeout;
                    return function executedFunction(...args) {
                        const later = () => {
                            clearTimeout(timeout);
                            func.apply(this, args);
                        };
                        clearTimeout(timeout);
                        timeout = setTimeout(later, wait);
                    };
                }
                
                // Set up event listeners for auto-save (GM only)
                if (isGM) {
                    document.addEventListener('DOMContentLoaded', function() {
                        document.querySelectorAll('input, select, textarea').forEach(input => {
                            if (input.hasAttribute('data-field')) {
                                const debouncedSave = debounce(function() {
                                    const field = input.getAttribute('data-field');
                                    const value = input.value;
                                    saveStaffField('${member.staff_id}', field, value);
                                }, 1000);
                                
                                input.addEventListener('input', debouncedSave);
                                input.addEventListener('change', debouncedSave);
                            }
                        });
                        
                        // Setup character lookup for standalone window
                        setupStandaloneCharacterLookup();
                    });
                }
                
                // Setup character lookup for standalone window
                function setupStandaloneCharacterLookup() {
                    // Wait for character lookup to be available
                    if (typeof CharacterLookup !== 'undefined') {
                        const lookup = new CharacterLookup();
                        lookup.init().then(() => {
                            // Setup for both rich text editors and textareas
                            const richTextContainers = document.querySelectorAll('.rich-text-container');
                            const textAreas = document.querySelectorAll('textarea');
                            
                            // Setup rich text editors first
                            if (typeof RichTextEditor !== 'undefined') {
                                richTextContainers.forEach(container => {
                                    const field = container.getAttribute('data-field');
                                    if (field && (
                                        field.includes('character_description') || 
                                        field.includes('general_info') ||
                                        field.includes('personality') ||
                                        field.includes('other') ||
                                        field.includes('origin') ||
                                        field.includes('desire') ||
                                        field.includes('fear') ||
                                        field.includes('connection') ||
                                        field.includes('impact') ||
                                        field.includes('change')
                                    )) {
                                        // Create rich text editor
                                        const editor = new RichTextEditor(container, {
                                            placeholder: 'Enter text... Type [[character name]] to link to characters'
                                        });
                                        editor.init();
                                        
                                        // Connect to character lookup
                                        const editorElement = editor.getEditor();
                                        if (editorElement) {
                                            lookup.setupEditorListeners(editorElement);
                                        }
                                        
                                        // Setup auto-save
                                        editor.onChange((content) => {
                                            const fieldName = container.getAttribute('data-field');
                                            saveStaffField('${member.staff_id}', fieldName, content);
                                        });
                                    }
                                });
                            }
                            
                            // Setup for remaining textareas
                            textAreas.forEach(textarea => {
                                const field = textarea.getAttribute('data-field');
                                if (field && (
                                    field.includes('character_description') || 
                                    field.includes('general_info') ||
                                    field.includes('personality') ||
                                    field.includes('other') ||
                                    field.includes('origin') ||
                                    field.includes('desire') ||
                                    field.includes('fear') ||
                                    field.includes('connection') ||
                                    field.includes('impact') ||
                                    field.includes('change')
                                )) {
                                    lookup.setupTextAreaListeners(textarea);
                                }
                            });
                            console.log('Character lookup setup complete for standalone staff window');
                        }).catch(error => {
                            console.warn('Character lookup initialization failed in standalone window:', error);
                        });
                    } else {
                        console.warn('CharacterLookup not available in standalone window');
                    }
                }
            </script>
        </body>
        </html>
    `);
    
    newWindow.document.close();
}

// Save staff field (GM only)
function saveStaffField(staffId, field, value) {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'save_staff');
    formData.append('staff_id', staffId);
    formData.append('field', field);
    formData.append('value', value);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('Failed to save field:', data.error);
            showError('Failed to save changes');
        }
    })
    .catch(error => {
        console.error('Error saving field:', error);
        showError('Error saving changes');
    });
}

// Add new staff member (GM only)
function addStaffMember() {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'add_staff');
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadStaff();
            showSuccess('Staff member added successfully');
        } else {
            showError('Failed to add staff member');
        }
    })
    .catch(error => {
        console.error('Error adding staff member:', error);
        showError('Error adding staff member');
    });
}

// Toggle staff favorite (available to all users)
function toggleStaffFavorite() {
    if (!selectedStaff) return;
    
    const formData = new FormData();
    formData.append('action', 'toggle_favorite');
    formData.append('staff_id', selectedStaff.staff_id);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update local staff data
            if (!selectedStaff.favorites) {
                selectedStaff.favorites = {};
            }
            selectedStaff.favorites[currentUser] = data.is_favorite;
            
            // Update button appearance
            const favoriteBtn = document.getElementById('modal-favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.classList.toggle('active', data.is_favorite);
                favoriteBtn.title = data.is_favorite ? 'Remove from Favorites' : 'Add to Favorites';
            }
            
            // Refresh grid to show/hide favorite star
            loadStaff();
        } else {
            showError('Failed to update favorite status');
        }
    })
    .catch(error => {
        console.error('Error toggling favorite:', error);
        showError('Error updating favorite');
    });
}

// Delete staff member (GM only)
function deleteStaffMember() {
    if (!isGM || !selectedStaff) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedStaff.name}? This action cannot be undone.`)) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete_staff');
    formData.append('staff_id', selectedStaff.staff_id);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            closeStaffModal();
            loadStaff();
            showSuccess('Staff member deleted successfully');
        } else {
            showError('Failed to delete staff member');
        }
    })
    .catch(error => {
        console.error('Error deleting staff member:', error);
        showError('Error deleting staff member');
    });
}

// Upload staff portrait (GM only)
function uploadStaffPortrait(staffId) {
    if (!isGM) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.webp';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showError('Image file must be smaller than 5MB');
                return;
            }
            
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                showError('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
                return;
            }
            
            uploadImageFile(staffId, file);
        }
    };
    input.click();
}

// Handle the actual file upload
function uploadImageFile(staffId, file) {
    const formData = new FormData();
    formData.append('action', 'upload_portrait');
    formData.append('staff_id', staffId);
    formData.append('portrait', file);
    
    // Show upload progress
    showUploadProgress(true);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        showUploadProgress(false);
        if (data.success) {
            // Update the selected staff data with new images array
            if (selectedStaff && selectedStaff.staff_id === staffId) {
                if (!selectedStaff.images) {
                    selectedStaff.images = [];
                }
                selectedStaff.images.push(data.image_path);
                
                // Refresh the modal content
                const modalBody = document.querySelector('#staff-modal .staff-details');
                if (modalBody) {
                    modalBody.innerHTML = createStaffDetailForm(selectedStaff);
                    
                    // Re-add event listeners for input and select only
                    modalBody.querySelectorAll('input, select').forEach(input => {
                        input.addEventListener('change', function() {
                            const field = this.getAttribute('data-field');
                            const value = this.value;
                            saveStaffField(selectedStaff.staff_id, field, value);
                        });
                    });
                    
                    // Setup rich text editors
                    setupModalRichTextEditors(modalBody, selectedStaff);
                }
            }
            
            // Refresh the grid to show new portrait
            loadStaff();
            
            showSuccess('Image uploaded successfully');
        } else {
            showError('Failed to upload image: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        showUploadProgress(false);
        console.error('Error uploading portrait:', error);
        showError('Error uploading portrait');
    });
}

// Update portrait in modal
function updatePortraitInModal(portraitPath) {
    const portraitSection = document.querySelector('.staff-portrait-section');
    if (portraitSection && selectedStaff) {
        const imageHtml = portraitPath ? 
            `<img src="${escapeHtml(portraitPath)}?t=${Date.now()}" alt="${escapeHtml(selectedStaff.name)}" class="staff-portrait">` :
            `<div class="staff-portrait-placeholder">No Photo</div>`;
        
        const uploadButton = isGM ? 
            `<button class="upload-portrait-btn" onclick="uploadStaffPortrait('${selectedStaff.staff_id}')">Upload Photo</button>` : '';
        
        portraitSection.innerHTML = imageHtml + uploadButton;
    }
}

// Show/hide upload progress
function showUploadProgress(show) {
    const uploadBtns = document.querySelectorAll('.upload-portrait-btn');
    uploadBtns.forEach(btn => {
        if (show) {
            btn.disabled = true;
            btn.textContent = 'Uploading...';
        } else {
            btn.disabled = false;
            btn.textContent = 'Upload Photo';
        }
    });
}

// Utility functions
function showLoading(show) {
    const loading = document.getElementById('loading');
    const staffGrid = document.getElementById('staff-grid');
    
    if (show) {
        loading.style.display = 'flex';
        staffGrid.style.opacity = '0.5';
    } else {
        loading.style.display = 'none';
        staffGrid.style.opacity = '1';
    }
}

function showError(message) {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #e74c3c;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

function showSuccess(message) {
    // Create a simple toast notification
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function escapeHtml(text) {
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            try {
                func.apply(this, args);
            } catch (error) {
                console.error('Error in debounced function:', error);
            }
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Image Gallery Functions
function createImageGallery(images, itemId, itemType) {
    if (!images || images.length === 0) {
        return `<div class="${itemType}-portrait-placeholder">No Photo</div>`;
    }
    
    const currentImageIndex = 0;
    const hasMultipleImages = images.length > 1;
    
    return `
        <div class="image-gallery" data-item-id="${itemId}" data-item-type="${itemType}">
            <div class="image-container">
                <img src="${escapeHtml(images[currentImageIndex])}?t=${Date.now()}" 
                     alt="${itemType} image" 
                     class="${itemType}-portrait gallery-image"
                     onclick="openImagePopup('${escapeHtml(images[currentImageIndex])}')"
                     data-current-index="${currentImageIndex}">
                
                ${hasMultipleImages ? `
                    <button class="gallery-nav prev" onclick="navigateGallery('${itemId}', -1)">‹</button>
                    <button class="gallery-nav next" onclick="navigateGallery('${itemId}', 1)">›</button>
                    <div class="gallery-indicator">${currentImageIndex + 1} / ${images.length}</div>
                ` : ''}
                
                ${isGM ? `
                    <button class="delete-image-btn" onclick="deleteImage('${itemId}', '${escapeHtml(images[currentImageIndex])}', '${itemType}')">×</button>
                ` : ''}
            </div>
        </div>
    `;
}

function navigateGallery(itemId, direction) {
    const gallery = document.querySelector(`[data-item-id="${itemId}"] .image-container img`);
    if (!gallery) return;
    
    const currentIndex = parseInt(gallery.getAttribute('data-current-index'));
    let images = [];
    
    // Get images array based on selected item
    if (selectedStaff && selectedStaff.staff_id === itemId) {
        images = selectedStaff.images || (selectedStaff.image_path ? [selectedStaff.image_path] : []);
    }
    
    if (images.length <= 1) return;
    
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
    
    // Update image
    gallery.src = images[newIndex];
    gallery.setAttribute('data-current-index', newIndex);
    gallery.setAttribute('onclick', `openImagePopup('${escapeHtml(images[newIndex])}')`);
    
    // Update indicator
    const indicator = gallery.parentElement.querySelector('.gallery-indicator');
    if (indicator) {
        indicator.textContent = `${newIndex + 1} / ${images.length}`;
    }
    
    // Update delete button
    const deleteBtn = gallery.parentElement.querySelector('.delete-image-btn');
    if (deleteBtn) {
        deleteBtn.setAttribute('onclick', `deleteImage('${itemId}', '${escapeHtml(images[newIndex])}', 'staff')`);
    }
}

function openImagePopup(imagePath) {
    let popup = document.getElementById('image-popup');
    if (!popup) {
        popup = createImagePopup();
    }
    const popupImage = popup.querySelector('.image-popup-content img');
    
    popupImage.src = imagePath + '?t=' + Date.now();
    popup.style.display = 'block';
}

function closeImagePopup() {
    const popup = document.getElementById('image-popup');
    if (popup) {
        popup.style.display = 'none';
    }
}

function createImagePopup() {
    const popup = document.createElement('div');
    popup.id = 'image-popup';
    popup.className = 'image-popup';
    popup.innerHTML = `
        <div class="image-popup-header">
            <div class="image-popup-title">Staff Image</div>
            <button class="image-popup-close" onclick="closeImagePopup()">×</button>
        </div>
        <div class="image-popup-content">
            <img src="" alt="Staff image">
        </div>
    `;
    document.body.appendChild(popup);
    
    // Make popup draggable
    makeDraggable(popup);
    
    return popup;
}

function makeDraggable(popup) {
    const header = popup.querySelector('.image-popup-header');
    let isDragging = false;
    let currentX, currentY, initialX, initialY;
    let xOffset = 0, yOffset = 0;

    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', drag);

    function dragStart(e) {
        if (e.target.classList.contains('image-popup-close')) return;
        
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === header || header.contains(e.target)) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            popup.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }
}

function deleteImage(itemId, imagePath, itemType) {
    if (!isGM) return;
    
    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete_image');
    formData.append('staff_id', itemId);
    formData.append('image_path', imagePath);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update local data
            if (selectedStaff && selectedStaff.staff_id === itemId) {
                if (selectedStaff.images) {
                    const imageIndex = selectedStaff.images.indexOf(imagePath);
                    if (imageIndex !== -1) {
                        selectedStaff.images.splice(imageIndex, 1);
                    }
                }
                
                // Refresh the modal content
                const modalBody = document.querySelector('#staff-modal .staff-details');
                if (modalBody) {
                    modalBody.innerHTML = createStaffDetailForm(selectedStaff);
                    
                    // Re-add event listeners for input and select only
                    modalBody.querySelectorAll('input, select').forEach(input => {
                        input.addEventListener('change', function() {
                            const field = this.getAttribute('data-field');
                            const value = this.value;
                            saveStaffField(selectedStaff.staff_id, field, value);
                        });
                    });
                    
                    // Setup rich text editors
                    setupModalRichTextEditors(modalBody, selectedStaff);
                }
            }
            
            // Refresh the main grid
            loadStaff();
            showSuccess('Image deleted successfully');
        } else {
            console.error('Failed to delete image:', data.error);
            showError('Failed to delete image');
        }
    })
    .catch(error => {
        console.error('Error deleting image:', error);
        showError('Error deleting image');
    });
}

// Export functionality
function exportStaff() {
    const formData = new FormData();
    formData.append('action', 'export_staff');
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showExportModal(data.data);
        } else {
            alert('Failed to export data: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error exporting data:', error);
        alert('Error exporting data');
    });
}

function showExportModal(data) {
    const modal = document.getElementById('export-modal');
    const textarea = document.getElementById('export-data');
    
    // Format JSON with proper indentation
    textarea.value = JSON.stringify(data, null, 2);
    
    modal.style.display = 'block';
}

function closeExportModal() {
    const modal = document.getElementById('export-modal');
    modal.style.display = 'none';
    
    // Reset copy feedback
    const feedback = document.getElementById('copy-feedback');
    if (feedback) {
        feedback.style.display = 'none';
    }
}

function copyExportData() {
    const textarea = document.getElementById('export-data');
    textarea.select();
    
    try {
        document.execCommand('copy');
        
        // Show feedback
        const feedback = document.getElementById('copy-feedback');
        if (feedback) {
            feedback.style.display = 'inline';
            setTimeout(() => {
                feedback.style.display = 'none';
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    }
}