// Locations Management JavaScript

// Store rich text editor instances
let modalRichTextEditors = new Map();

// Initialize character lookup when ready
function initializeCharacterLookup() {
    if (window.characterLookup && !window.characterLookup.isReady()) {
        window.characterLookup.init().then(() => {
            console.log('Character lookup initialized for locations section');
            setupExistingTextAreasAutocomplete();
        }).catch(error => {
            console.warn('Character lookup initialization failed:', error);
        });
    } else if (window.characterLookup && window.characterLookup.isReady()) {
        setupExistingTextAreasAutocomplete();
    }
}

// Setup autocomplete for any existing text areas
function setupExistingTextAreasAutocomplete() {
    const modal = document.getElementById('location-modal');
    if (modal) {
        setupModalTextAreasAutocomplete(modal);
    }
}

// Setup rich text editors for modal
function setupModalRichTextEditors(container, locationData) {
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
            
            // Set content from location data
            const fieldValue = getNestedFieldValue(locationData, field);
            if (fieldValue) {
                editor.setContent(fieldValue);
            }
            
            // Setup auto-save
            editor.onChange((content) => {
                saveLocationField(locationData.location_id, field, content);
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
    
    console.log('Set up', modalRichTextEditors.size, 'rich text editors for location modal');
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

// Get nested field value from location data
function getNestedFieldValue(locationData, field) {
    const parts = field.split('.');
    let value = locationData;
    
    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            return '';
        }
    }
    
    return value || '';
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
            field.includes('world_wound') || 
            field.includes('origin') ||
            field.includes('desire') ||
            field.includes('fear') ||
            field.includes('connection') ||
            field.includes('impact') ||
            field.includes('change') ||
            field.includes('other')
        )) {
            window.characterLookup.setupTextAreaListeners(textarea);
        }
    });
    
    console.log('Set up autocomplete for location modal text areas');
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
            loadLocations();
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
            loadLocations();
        });
    });
    
    // Filter selects
    const collegeFilter = document.getElementById('filter-college');
    if (collegeFilter) {
        collegeFilter.addEventListener('change', function() {
            currentFilters.college = this.value;
            loadLocations();
        });
    }
    
    const hexColorFilter = document.getElementById('filter-hex-color');
    if (hexColorFilter) {
        hexColorFilter.addEventListener('change', function() {
            currentFilters.hex_color = this.value;
            loadLocations();
        });
    }
    
    // Favorites toggle
    const favoritesToggle = document.getElementById('favorites-toggle');
    if (favoritesToggle) {
        favoritesToggle.addEventListener('click', function() {
            currentFilters.favorites = !currentFilters.favorites;
            this.classList.toggle('active', currentFilters.favorites);
            loadLocations();
        });
    }
    
    // Add location button (GM only)
    if (isGM) {
        const addLocationBtn = document.getElementById('add-location-btn');
        if (addLocationBtn) {
            addLocationBtn.addEventListener('click', addLocation);
        }
        
        // Delete button (GM only)
        const modalDeleteBtn = document.getElementById('modal-delete-btn');
        if (modalDeleteBtn) {
            modalDeleteBtn.addEventListener('click', deleteLocation);
        }
    }
    
    // Modal controls (available to all users)
    const modalFavoriteBtn = document.getElementById('modal-favorite-btn');
    if (modalFavoriteBtn) {
        modalFavoriteBtn.addEventListener('click', toggleLocationFavorite);
    }
    
    // Expand button (available to all users)
    const modalExpandBtn = document.getElementById('modal-expand-btn');
    if (modalExpandBtn) {
        modalExpandBtn.addEventListener('click', expandLocationToNewTab);
    }
    
    // Modal close on background click
    const modal = document.getElementById('location-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeLocationModal();
            }
        });
    }
    
    // Image modal close on background click
    const imageModal = document.getElementById('image-modal');
    if (imageModal) {
        imageModal.addEventListener('click', function(e) {
            if (e.target === imageModal) {
                closeImageModal();
            }
        });
    }
}

// Load locations from server
function loadLocations() {
    showLoading(true);
    
    const formData = new FormData();
    formData.append('action', 'load_locations');
    formData.append('sort_by', currentSort);
    formData.append('filter_college', currentFilters.college);
    formData.append('filter_hex_color', currentFilters.hex_color);
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
            displayLocations(data.locations);
            // Store locations globally for auto-open functionality
            window.allLocations = data.locations;
            window.locationsLoaded = true;
        } else {
            console.error('Failed to load locations:', data.error);
            showError('Failed to load locations');
        }
    })
    .catch(error => {
        showLoading(false);
        console.error('Error loading locations:', error);
        showError('Error loading locations');
    });
}

// Display locations in grid
function displayLocations(locations) {
    const grid = document.getElementById('locations-grid');
    
    if (locations.length === 0) {
        grid.innerHTML = `
            <div class="no-locations">
                <div class="no-locations-icon">📍</div>
                <p>No locations found matching your criteria.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = locations.map(location => createLocationCard(location)).join('');
    
    // Add click event listeners to cards
    grid.querySelectorAll('.location-card').forEach(card => {
        card.addEventListener('click', function() {
            const locationId = this.getAttribute('data-location-id');
            const location = locations.find(l => l.location_id === locationId);
            if (location) {
                openLocationModal(location);
            }
        });
    });
}

// Create location card HTML
function createLocationCard(location) {
    const isFavorite = location.favorites && location.favorites[currentUser];
    const favoriteIcon = isFavorite ? '<div class="location-favorite">★</div>' : '';
    
    // Handle images array
    let thumbnailImage = '';
    if (location.images && location.images.length > 0) {
        thumbnailImage = location.images[0];
    }
    
    const imageHtml = thumbnailImage ? 
        `<img src="${escapeHtml(thumbnailImage)}" alt="${escapeHtml(location.name)}" class="location-thumbnail">` :
        `<div class="location-placeholder">No Photo</div>`;
    
    const visibilityIndicator = (!location.visible_to_players && isGM) ? 
        '<div class="visibility-indicator" title="Hidden from players">👁️‍🗨️</div>' : '';
    
    const hexColorDisplay = location.hex_color ? 
        `<div class="hex-color-indicator" style="background-color: ${getHexColorCode(location.hex_color)}" title="${location.hex_color}"></div>` : '';
    
    return `
        <div class="location-card" data-location-id="${escapeHtml(location.location_id)}">
            ${favoriteIcon}
            ${visibilityIndicator}
            ${imageHtml}
            <div class="location-name">${escapeHtml(location.name)}</div>
            <div class="location-info">
                <div class="location-college">${escapeHtml(location.college || 'No College')}</div>
                <div class="hex-info">
                    ${hexColorDisplay}
                    <span class="hex-number">${escapeHtml(location.hex_number || 'No Hex')}</span>
                </div>
            </div>
        </div>
    `;
}

// Get hex color code for display
function getHexColorCode(colorName) {
    const colorMap = {
        'Black': '#000000',
        'Grey': '#808080',
        'White': '#ffffff',
        'Yellow': '#ffff00',
        'Orange': '#ffa500',
        'Red': '#ff0000',
        'Green': '#008000',
        'Blue': '#0000ff',
        'Purple': '#800080'
    };
    return colorMap[colorName] || '#cccccc';
}


// Open location detail modal
function openLocationModal(location) {
    selectedLocation = location;
    
    const modal = document.getElementById('location-modal');
    const modalName = document.getElementById('modal-location-name');
    const modalBody = modal.querySelector('.location-details');
    
    modalName.textContent = location.name;
    
    // Update favorite button (available to all users)
    const favoriteBtn = document.getElementById('modal-favorite-btn');
    if (favoriteBtn) {
        const isFavorite = location.favorites && location.favorites[currentUser];
        favoriteBtn.classList.toggle('active', isFavorite);
        favoriteBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
    }
    
    // Build modal content
    modalBody.innerHTML = createLocationDetailForm(location);
    
    // Add event listeners for form inputs (GM only) - only input and select, rich text editors handle themselves
    if (isGM) {
        modalBody.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', function() {
                const field = this.getAttribute('data-field');
                const value = this.type === 'checkbox' ? this.checked : this.value;
                
                if (field) {
                    saveLocationField(location.location_id, field, value);
                }
            });
        });
    }
    
    // Setup rich text editors
    setupModalRichTextEditors(modalBody, location);
    
    modal.style.display = 'block';
}

// Create location detail form HTML
function createLocationDetailForm(location) {
    const imageHtml = (location.images && location.images.length > 0) ? 
        createImageGallery(location.images, location.location_id, 'location') :
        `<div class="location-portrait-placeholder">No Photo</div>`;
    
    const uploadButton = isGM ? 
        `<button class="upload-image-btn" onclick="uploadLocationImage('${location.location_id}')">Upload Image</button>` : '';
    
    const visibilityControl = isGM ? `
        <div class="form-group">
            <label>
                <input type="checkbox" 
                       ${location.visible_to_players ? 'checked' : ''} 
                       data-field="visible_to_players">
                Visible to Players
            </label>
        </div>
    ` : '';
    
    return `
        <div class="location-form">
            <!-- Image Section -->
            <div class="location-image-section">
                ${imageHtml}
                ${uploadButton}
            </div>
            
            <!-- Basic Information -->
            <div class="form-section">
                <h3>Basic Information</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label>Name:</label>
                        ${isGM ? 
                            `<input type="text" value="${escapeHtml(location.name)}" data-field="name">` :
                            `<div class="readonly-field">${escapeHtml(location.name)}</div>`
                        }
                    </div>
                    <div class="form-group">
                        <label>College:</label>
                        ${isGM ? 
                            `<select data-field="college">
                                <option value="" ${!location.college ? 'selected' : ''}>Select College</option>
                                <option value="Central Campus" ${location.college === 'Central Campus' ? 'selected' : ''}>Central Campus</option>
                                <option value="Silverquill" ${location.college === 'Silverquill' ? 'selected' : ''}>Silverquill</option>
                                <option value="Prismari" ${location.college === 'Prismari' ? 'selected' : ''}>Prismari</option>
                                <option value="Witherbloom" ${location.college === 'Witherbloom' ? 'selected' : ''}>Witherbloom</option>
                                <option value="Lorehold" ${location.college === 'Lorehold' ? 'selected' : ''}>Lorehold</option>
                                <option value="Quandrix" ${location.college === 'Quandrix' ? 'selected' : ''}>Quandrix</option>
                            </select>` :
                            `<div class="readonly-field">${escapeHtml(location.college || 'No College')}</div>`
                        }
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>Hex Color:</label>
                        ${isGM ? 
                            `<select data-field="hex_color">
                                <option value="" ${!location.hex_color ? 'selected' : ''}>Select Color</option>
                                <option value="Black" ${location.hex_color === 'Black' ? 'selected' : ''}>Black</option>
                                <option value="Grey" ${location.hex_color === 'Grey' ? 'selected' : ''}>Grey</option>
                                <option value="White" ${location.hex_color === 'White' ? 'selected' : ''}>White</option>
                                <option value="Yellow" ${location.hex_color === 'Yellow' ? 'selected' : ''}>Yellow</option>
                                <option value="Orange" ${location.hex_color === 'Orange' ? 'selected' : ''}>Orange</option>
                                <option value="Red" ${location.hex_color === 'Red' ? 'selected' : ''}>Red</option>
                                <option value="Green" ${location.hex_color === 'Green' ? 'selected' : ''}>Green</option>
                                <option value="Blue" ${location.hex_color === 'Blue' ? 'selected' : ''}>Blue</option>
                                <option value="Purple" ${location.hex_color === 'Purple' ? 'selected' : ''}>Purple</option>
                            </select>` :
                            `<div class="readonly-field">${escapeHtml(location.hex_color || 'No Color')}</div>`
                        }
                    </div>
                    <div class="form-group">
                        <label>Hex Number:</label>
                        ${isGM ? 
                            `<input type="text" value="${escapeHtml(location.hex_number || '')}" data-field="hex_number" placeholder="Enter hex number">` :
                            `<div class="readonly-field">${escapeHtml(location.hex_number || 'No Hex Number')}</div>`
                        }
                    </div>
                </div>
                
                ${visibilityControl}
            </div>
            
            <!-- Location Information (GM Only) -->
            ${isGM ? `
                <div class="form-section">
                    <h3>Location Information (GM Only)</h3>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>World Wound:</label>
                            <div class="rich-text-container medium" data-field="location_info.world_wound" data-placeholder="World Wound details..."></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Origin:</label>
                            <div class="rich-text-container medium" data-field="location_info.origin" data-placeholder="Origin details..."></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Desire:</label>
                            <div class="rich-text-container medium" data-field="location_info.desire" data-placeholder="Desire details..."></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Fear:</label>
                            <div class="rich-text-container medium" data-field="location_info.fear" data-placeholder="Fear details..."></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Connection:</label>
                            <div class="rich-text-container medium" data-field="location_info.connection" data-placeholder="Connection details..."></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Impact:</label>
                            <div class="rich-text-container medium" data-field="location_info.impact" data-placeholder="Impact details..."></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Change:</label>
                            <div class="rich-text-container medium" data-field="location_info.change" data-placeholder="Change details..."></div>
                        </div>
                    </div>
                </div>
                
                <!-- Other Section -->
                <div class="form-section">
                    <h3>Other</h3>
                    <div class="form-row">
                        <div class="form-group full-width">
                            <label>Other Information:</label>
                            <div class="rich-text-container medium" data-field="other" data-placeholder="Additional information..."></div>
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Create image gallery for locations
function createImageGallery(images, itemId, itemType) {
    if (!images || images.length === 0) {
        return `<div class="${itemType}-portrait-placeholder">No Photo</div>`;
    }
    
    const currentImageIndex = 0;
    const hasMultipleImages = images.length > 1;
    
    return `
        <div class="image-gallery" data-item-id="${itemId}" data-item-type="${itemType}">
            <div class="image-container">
                <img src="${escapeHtml(images[currentImageIndex])}" 
                     alt="${itemType} image" 
                     class="${itemType}-portrait gallery-image"
                     onclick="openImageModal('${escapeHtml(images[currentImageIndex])}')"
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

// Navigate image gallery
function navigateGallery(itemId, direction) {
    const gallery = document.querySelector(`[data-item-id="${itemId}"] .image-container img`);
    if (!gallery) return;
    
    const currentIndex = parseInt(gallery.getAttribute('data-current-index'));
    let images = [];
    
    // Get images array based on selected item
    if (selectedLocation && selectedLocation.location_id === itemId) {
        images = selectedLocation.images || [];
    }
    
    if (images.length <= 1) return;
    
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
    
    // Update image
    gallery.src = images[newIndex];
    gallery.setAttribute('data-current-index', newIndex);
    gallery.setAttribute('onclick', `openImageModal('${escapeHtml(images[newIndex])}')`);
    
    // Update indicator
    const indicator = gallery.parentElement.querySelector('.gallery-indicator');
    if (indicator) {
        indicator.textContent = `${newIndex + 1} / ${images.length}`;
    }
    
    // Update delete button
    const deleteBtn = gallery.parentElement.querySelector('.delete-image-btn');
    if (deleteBtn) {
        deleteBtn.setAttribute('onclick', `deleteImage('${itemId}', '${escapeHtml(images[newIndex])}', 'location')`);
    }
}

// Open image modal for full-size viewing
function openImageModal(imagePath) {
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    
    modalImage.src = imagePath;
    modal.style.display = 'block';
}

// Close image modal
function closeImageModal() {
    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Delete image (GM only)
function deleteImage(itemId, imagePath, itemType) {
    if (!isGM) return;
    
    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete_image');
    formData.append('location_id', itemId);
    formData.append('image_path', imagePath);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update local data
            if (selectedLocation && selectedLocation.location_id === itemId) {
                if (selectedLocation.images) {
                    const imageIndex = selectedLocation.images.indexOf(imagePath);
                    if (imageIndex !== -1) {
                        selectedLocation.images.splice(imageIndex, 1);
                    }
                }
                
                // Refresh the modal content
                const modalBody = document.querySelector('#location-modal .location-details');
                if (modalBody) {
                    modalBody.innerHTML = createLocationDetailForm(selectedLocation);
                    
                    // Re-add event listeners for input and select only
                    modalBody.querySelectorAll('input, select').forEach(input => {
                        input.addEventListener('change', function() {
                            const field = this.getAttribute('data-field');
                            const value = this.type === 'checkbox' ? this.checked : this.value;
                            
                            if (field) {
                                saveLocationField(selectedLocation.location_id, field, value);
                            }
                        });
                    });
                    
                    // Setup rich text editors
                    setupModalRichTextEditors(modalBody, selectedLocation);
                }
            }
            
            // Refresh the main grid
            loadLocations();
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

// Close location modal
function closeLocationModal() {
    // Clean up rich text editors
    cleanupModalRichTextEditors();
    
    const modal = document.getElementById('location-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    selectedLocation = null;
}

// Add new location (GM only)
function addLocation() {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'add_location');
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadLocations();
            openLocationModal(data.location);
        } else {
            console.error('Failed to add location:', data.error);
            showError('Failed to add location');
        }
    })
    .catch(error => {
        console.error('Error adding location:', error);
        showError('Error adding location');
    });
}

// Delete location (GM only)
function deleteLocation() {
    if (!isGM || !selectedLocation) return;
    
    if (!confirm(`Are you sure you want to delete "${selectedLocation.name}"? This action cannot be undone.`)) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete_location');
    formData.append('location_id', selectedLocation.location_id);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            closeLocationModal();
            loadLocations();
            showSuccess('Location deleted successfully');
        } else {
            console.error('Failed to delete location:', data.error);
            showError('Failed to delete location');
        }
    })
    .catch(error => {
        console.error('Error deleting location:', error);
        showError('Error deleting location');
    });
}

// Toggle location favorite
function toggleLocationFavorite() {
    if (!selectedLocation) return;
    
    const formData = new FormData();
    formData.append('action', 'toggle_favorite');
    formData.append('location_id', selectedLocation.location_id);
    
    fetch('index.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update local data
            if (!selectedLocation.favorites) {
                selectedLocation.favorites = {};
            }
            selectedLocation.favorites[currentUser] = data.is_favorite;
            
            // Update button state
            const favoriteBtn = document.getElementById('modal-favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.classList.toggle('active', data.is_favorite);
                favoriteBtn.title = data.is_favorite ? 'Remove from Favorites' : 'Add to Favorites';
            }
            
            // Refresh grid if showing favorites only
            if (currentFilters.favorites) {
                loadLocations();
            }
        } else {
            console.error('Failed to toggle favorite:', data.error);
            showError('Failed to update favorite status');
        }
    })
    .catch(error => {
        console.error('Error toggling favorite:', error);
        showError('Error updating favorite status');
    });
}

// Expand location to new tab
function expandLocationToNewTab() {
    if (!selectedLocation) return;
    
    const newWindow = window.open('', '_blank');
    const location = selectedLocation;
    
    newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(location.name)} - Location Details</title>
            <link rel="stylesheet" href="../../../css/style.css">
            <link rel="stylesheet" href="css/locations.css">
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
                .form-group textarea {
                    width: 100%;
                    min-height: 100px;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    resize: vertical;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="save-indicator" id="save-indicator">Saved!</div>
            <div class="standalone-header">
                <h1>${escapeHtml(location.name)} - Location Details</h1>
                <p>${escapeHtml(location.college || 'No College')} • ${escapeHtml(location.hex_color || 'No Color')} ${escapeHtml(location.hex_number || '')}</p>
                ${!location.visible_to_players && isGM ? '<p><strong>Visibility:</strong> Hidden from players</p>' : ''}
                ${isGM ? '<p><small>Character autocomplete available - use [[character name]] syntax</small></p>' : ''}
            </div>
            
            <div class="standalone-content">
                ${location.images && location.images.length > 0 ? 
                    location.images.map(img => `<img src="${escapeHtml(img)}" alt="Location image" style="max-width: 300px; height: auto; border-radius: 8px; margin-bottom: 15px;">`).join('') : 
                    ''
                }
                
                ${isGM && location.location_info ? `
                    <div class="form-section">
                        <h3>Location Information</h3>
                        ${location.location_info.world_wound ? `
                            <div class="form-group">
                                <label>World Wound:</label>
                                <div class="rich-text-container medium" data-field="location_info.world_wound" data-placeholder="World Wound details..."></div>
                            </div>
                        ` : ''}
                        ${location.location_info.origin ? `
                            <div class="form-group">
                                <label>Origin:</label>
                                <div class="rich-text-container medium" data-field="location_info.origin" data-placeholder="Origin details..."></div>
                            </div>
                        ` : ''}
                        ${location.location_info.desire ? `
                            <div class="form-group">
                                <label>Desire:</label>
                                <div class="rich-text-container medium" data-field="location_info.desire" data-placeholder="Desire details..."></div>
                            </div>
                        ` : ''}
                        ${location.location_info.fear ? `
                            <div class="form-group">
                                <label>Fear:</label>
                                <div class="rich-text-container medium" data-field="location_info.fear" data-placeholder="Fear details..."></div>
                            </div>
                        ` : ''}
                        ${location.location_info.connection ? `
                            <div class="form-group">
                                <label>Connection:</label>
                                <div class="rich-text-container medium" data-field="location_info.connection" data-placeholder="Connection details..."></div>
                            </div>
                        ` : ''}
                        ${location.location_info.impact ? `
                            <div class="form-group">
                                <label>Impact:</label>
                                <div class="rich-text-container medium" data-field="location_info.impact" data-placeholder="Impact details..."></div>
                            </div>
                        ` : ''}
                        ${location.location_info.change ? `
                            <div class="form-group">
                                <label>Change:</label>
                                <div class="rich-text-container medium" data-field="location_info.change" data-placeholder="Change details..."></div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                
                ${location.other && isGM ? `
                    <div class="form-section">
                        <h3>Other Information</h3>
                        <div class="form-group">
                            <label>Other:</label>
                            <div class="rich-text-container medium" data-field="other" data-placeholder="Additional information..."></div>
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <script src="../gm/js/character-lookup.js"></script>
            <script src="../gm/js/rich-text-editor.js"></script>
            <script>
                // Copy necessary variables and functions to the popout
                const isGM = ${isGM};
                const currentUser = '${currentUser}';
                const locationData = ${JSON.stringify(location)};
                
                // Save function for popout window (GM only)
                function saveLocationField(locationId, field, value) {
                    if (!isGM) return;
                    
                    const formData = new FormData();
                    formData.append('action', 'save_location');
                    formData.append('location_id', locationId);
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
                            // Update local location data
                            if (field.startsWith('location_info.')) {
                                const infoField = field.split('.')[1];
                                if (!locationData.location_info) locationData.location_info = {};
                                locationData.location_info[infoField] = value;
                            } else {
                                locationData[field] = value;
                            }
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
                
                // Setup character lookup for standalone window
                function setupStandaloneCharacterLookup() {
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
                                        field.includes('world_wound') || 
                                        field.includes('origin') ||
                                        field.includes('desire') ||
                                        field.includes('fear') ||
                                        field.includes('connection') ||
                                        field.includes('impact') ||
                                        field.includes('change') ||
                                        field.includes('other')
                                    )) {
                                        // Create rich text editor
                                        const editor = new RichTextEditor(container, {
                                            placeholder: container.getAttribute('data-placeholder') + ' Type [[character name]] to link to characters'
                                        });
                                        editor.init();
                                        
                                        // Set initial content if available
                                        const fieldValue = getNestedFieldValue(locationData, field);
                                        if (fieldValue) {
                                            editor.setContent(fieldValue);
                                        }
                                        
                                        // Connect to character lookup
                                        const editorElement = editor.getEditor();
                                        if (editorElement) {
                                            lookup.setupEditorListeners(editorElement);
                                        }
                                        
                                        // Setup auto-save
                                        editor.onChange((content) => {
                                            const fieldName = container.getAttribute('data-field');
                                            saveLocationField('${location.location_id}', fieldName, content);
                                        });
                                    }
                                });
                            }
                            
                            // Setup for remaining textareas
                            textAreas.forEach(textarea => {
                                const field = textarea.getAttribute('data-field');
                                if (field && (
                                    field.includes('world_wound') || 
                                    field.includes('origin') ||
                                    field.includes('desire') ||
                                    field.includes('fear') ||
                                    field.includes('connection') ||
                                    field.includes('impact') ||
                                    field.includes('change') ||
                                    field.includes('other')
                                )) {
                                    lookup.setupTextAreaListeners(textarea);
                                }
                            });
                            console.log('Character lookup setup complete for standalone location window');
                        }).catch(error => {
                            console.warn('Character lookup initialization failed in standalone window:', error);
                        });
                    } else {
                        console.warn('CharacterLookup not available in standalone window');
                    }
                }
                
                // Helper function for standalone window
                function getNestedFieldValue(locationData, field) {
                    const parts = field.split('.');
                    let value = locationData;
                    
                    for (const part of parts) {
                        if (value && typeof value === 'object' && part in value) {
                            value = value[part];
                        } else {
                            return '';
                        }
                    }
                    
                    return value || '';
                }
                
                // Set up event listeners for auto-save (GM only)
                if (isGM) {
                    document.addEventListener('DOMContentLoaded', function() {
                        // Rich text editors handle their own auto-save through the setupStandaloneCharacterLookup function
                        // Just setup any remaining input/select elements
                        document.querySelectorAll('input, select').forEach(input => {
                            if (input.hasAttribute('data-field')) {
                                const debouncedSave = debounce(function() {
                                    const field = input.getAttribute('data-field');
                                    const value = input.type === 'checkbox' ? input.checked : input.value;
                                    saveLocationField('${location.location_id}', field, value);
                                }, 1000);
                                
                                input.addEventListener('input', debouncedSave);
                                input.addEventListener('change', debouncedSave);
                            }
                        });
                        
                        // Setup character lookup for standalone window
                        setupStandaloneCharacterLookup();
                    });
                }
            </script>
        </body>
        </html>
    `);
    
    newWindow.document.close();
}

// Save location field (GM only)
function saveLocationField(locationId, field, value) {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'save_location');
    formData.append('location_id', locationId);
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

// Upload location image (GM only)
function uploadLocationImage(locationId) {
    if (!isGM) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            showError('File too large. Maximum size is 5MB.');
            return;
        }
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            showError('Please select an image file.');
            return;
        }
        
        const formData = new FormData();
        formData.append('action', 'upload_image');
        formData.append('location_id', locationId);
        formData.append('image', file);
        
        // Show loading indicator
        showLoading(true);
        
        fetch('index.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            showLoading(false);
            if (data.success) {
                // Update local data
                if (selectedLocation && selectedLocation.location_id === locationId) {
                    if (!selectedLocation.images) {
                        selectedLocation.images = [];
                    }
                    selectedLocation.images.push(data.image_path);
                    
                    // Refresh the modal content
                    const modalBody = document.querySelector('#location-modal .location-details');
                    if (modalBody) {
                        modalBody.innerHTML = createLocationDetailForm(selectedLocation);
                        
                        // Re-add event listeners for input and select only
                        modalBody.querySelectorAll('input, select').forEach(input => {
                            input.addEventListener('change', function() {
                                const field = this.getAttribute('data-field');
                                const value = this.type === 'checkbox' ? this.checked : this.value;
                                
                                if (field) {
                                    saveLocationField(locationId, field, value);
                                }
                            });
                        });
                        
                        // Setup rich text editors
                        setupModalRichTextEditors(modalBody, selectedLocation);
                    }
                }
                
                // Refresh the main grid
                loadLocations();
                showSuccess('Image uploaded successfully');
            } else {
                console.error('Failed to upload image:', data.error);
                showError('Failed to upload image: ' + data.error);
            }
        })
        .catch(error => {
            showLoading(false);
            console.error('Error uploading image:', error);
            showError('Error uploading image');
        });
    };
    
    input.click();
}

// Utility functions
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = show ? 'block' : 'none';
    }
}

function showError(message) {
    alert('Error: ' + message);
}

function showSuccess(message) {
    alert('Success: ' + message);
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