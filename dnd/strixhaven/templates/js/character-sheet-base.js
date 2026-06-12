// Shared character sheet logic for the Strixhaven students and staff sections.
// Each area calls CharacterSheetBase.init(config) with the pieces that genuinely
// differ (endpoint, actions, labels, detail form builder, field save rules) and
// gets the common behavior: loading, cards, modal, saving, gallery, export.
//
// Expects page globals: isGM, currentUser, currentSort, currentFilters, and the
// per-area selected-character variable exposed through config.getSelected/setSelected.
// Requires js/ui-kit.js (window.UIKit) to be loaded first.

const CharacterSheetBase = (function () {
    let config = null;

    // Rich text editor instances for the currently open modal
    const modalRichTextEditors = new Map();

    // Export selection state
    let exportSelectionActive = false;
    const selectedExportIds = new Set();

    // Debounce timers for per-field saves (key: id::field)
    const pendingFieldSaves = new Map();

    let detailModalManaged = false;
    let exportModalManaged = false;

    function capitalize(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function getSelected() {
        return config.getSelected();
    }

    function setSelected(value) {
        config.setSelected(value);
    }

    function findCharacter(characterId) {
        const all = config.getAll ? config.getAll() : null;
        if (Array.isArray(all)) {
            const match = all.find(item => item[config.idField] === characterId);
            if (match) return match;
        }
        return getSelected();
    }

    // Initialize character lookup when ready
    function initializeCharacterLookup() {
        if (window.characterLookup && !window.characterLookup.isReady()) {
            window.characterLookup.init().then(() => {
                console.log(`Character lookup initialized for ${config.plural} section`);
                if (config.onLookupReady) config.onLookupReady();
            }).catch(error => {
                console.warn('Character lookup initialization failed:', error);
            });
        } else if (window.characterLookup && window.characterLookup.isReady()) {
            if (config.onLookupReady) config.onLookupReady();
        }
    }

    // Setup rich text editors for modal
    function setupModalRichTextEditors(container, characterData) {
        if (typeof RichTextEditor === 'undefined') {
            console.warn('RichTextEditor not available');
            return;
        }

        cleanupModalRichTextEditors();

        const containers = container.querySelectorAll('.rich-text-container');
        containers.forEach(richContainer => {
            const field = richContainer.getAttribute('data-field');
            const placeholder = richContainer.getAttribute('data-placeholder') || 'Enter text...';

            if (field) {
                const editor = new RichTextEditor(richContainer, {
                    placeholder: placeholder + ' Type [[character name]] to link to characters'
                });

                editor.init();

                const fieldValue = getNestedFieldValue(characterData, field);
                if (fieldValue) {
                    editor.setContent(fieldValue);
                }

                editor.onChange((content) => {
                    saveCharacterField(characterData[config.idField], field, content);
                });

                // Connect to character lookup system
                if (window.characterLookup && window.characterLookup.isReady()) {
                    const editorElement = editor.getEditor();
                    if (editorElement) {
                        console.log('Connecting rich text editor to character lookup for field:', field);
                        window.characterLookup.setupEditorListeners(editorElement);
                    }
                } else {
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

                modalRichTextEditors.set(field, editor);
            }
        });

        console.log('Set up', modalRichTextEditors.size, 'rich text editors for ' + config.type + ' modal');
    }

    function cleanupModalRichTextEditors() {
        modalRichTextEditors.forEach((editor) => {
            if (editor && editor.destroy) {
                editor.destroy();
            }
        });
        modalRichTextEditors.clear();
    }

    // Get nested field value from character data
    function getNestedFieldValue(characterData, field) {
        const parts = field.split('.');
        let value = characterData;

        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return '';
            }
        }

        return value || '';
    }

    // Setup event listeners
    function setupEventListeners() {
        setTimeout(initializeCharacterLookup, 500);

        // Search input
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(function () {
                currentFilters.search = this.value.trim();
                loadCharacters();
            }, 300));
        }

        // Sort buttons
        document.querySelectorAll('[data-sort]').forEach(btn => {
            btn.addEventListener('click', function () {
                const sortType = this.getAttribute('data-sort');

                document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                currentSort = sortType;
                loadCharacters();
            });
        });

        // Filter selects
        config.filterSelects.forEach(filter => {
            const select = document.getElementById(filter.id);
            if (select) {
                select.addEventListener('change', function () {
                    currentFilters[filter.key] = this.value;
                    loadCharacters();
                });
            }
        });

        // Favorites toggle
        const favoritesToggle = document.getElementById('favorites-toggle');
        if (favoritesToggle) {
            favoritesToggle.addEventListener('click', function () {
                currentFilters.favorites = !currentFilters.favorites;
                this.classList.toggle('active', currentFilters.favorites);
                loadCharacters();
            });
        }

        // Admin controls (GM only)
        if (isGM) {
            const addBtn = document.getElementById(config.addBtnId);
            if (addBtn) {
                addBtn.addEventListener('click', addCharacter);
            }

            const exportBtn = document.getElementById(config.exportBtnId);
            if (exportBtn) {
                exportBtn.addEventListener('click', () => toggleExportSelectionMode());
            }

            const exportSelectedBtn = document.getElementById(config.exportSelectedBtnId);
            if (exportSelectedBtn) {
                exportSelectedBtn.addEventListener('click', exportSelectedCharacters);
            }

            const cancelExportBtn = document.getElementById('cancel-export-selection-btn');
            if (cancelExportBtn) {
                cancelExportBtn.addEventListener('click', () => toggleExportSelectionMode(false));
            }

            const modalDeleteBtn = document.getElementById('modal-delete-btn');
            if (modalDeleteBtn) {
                modalDeleteBtn.addEventListener('click', deleteCharacter);
            }
        }

        // Modal controls (available to all users)
        const modalFavoriteBtn = document.getElementById('modal-favorite-btn');
        if (modalFavoriteBtn) {
            modalFavoriteBtn.addEventListener('click', toggleFavorite);
        }

        const modalExpandBtn = document.getElementById('modal-expand-btn');
        if (modalExpandBtn && config.expand) {
            modalExpandBtn.addEventListener('click', config.expand);
        }

        // Modal close on background click
        const modal = document.getElementById(config.modalId);
        if (modal) {
            let backgroundPointerDown = false;

            modal.addEventListener('mousedown', function (e) {
                backgroundPointerDown = e.target === modal;
            });

            modal.addEventListener('mouseup', function (e) {
                if (backgroundPointerDown && e.target === modal) {
                    closeCharacterModal();
                }
                backgroundPointerDown = false;
            });
        }

        // Keyboard support for the "x" close controls (role="button" spans)
        document.querySelectorAll('.modal .close').forEach(closeBtn => {
            closeBtn.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.click();
                }
            });
        });
    }

    // Load characters from server
    function loadCharacters() {
        showLoading(true);

        const formData = new FormData();
        formData.append('action', config.actions.load);
        formData.append('sort_by', currentSort);
        config.filterParams.forEach(filter => {
            formData.append(filter.param, currentFilters[filter.key]);
        });
        formData.append('show_favorites', currentFilters.favorites.toString());
        formData.append('search_term', currentFilters.search);

        fetch(config.endpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            showLoading(false);
            if (data.success) {
                displayCharacters(data[config.plural]);
                // Store characters globally for auto-open functionality
                config.setAll(data[config.plural]);
            } else {
                console.error(`Failed to load ${config.plural}:`, data.error);
                showError(`Failed to load ${config.plural}`);
            }
        })
        .catch(error => {
            showLoading(false);
            console.error(`Error loading ${config.plural}:`, error);
            showError(`Error loading ${config.plural}`);
        });
    }

    // Display characters in grid
    function displayCharacters(items) {
        const grid = document.getElementById(config.gridId);
        const t = config.type;

        if (items.length === 0) {
            grid.innerHTML = `
                <div class="no-${config.plural}">
                    <div class="no-${config.plural}-icon">👥</div>
                    <p>No ${config.plural} found matching your criteria.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = items.map(item => createCharacterCard(item)).join('');

        grid.querySelectorAll(`.${t}-card`).forEach(card => {
            const open = function () {
                const characterId = card.getAttribute(`data-${t}-id`);
                const item = items.find(entry => entry[config.idField] === characterId);
                if (!item) {
                    return;
                }

                if (exportSelectionActive) {
                    toggleExportSelection(characterId);
                    return;
                }

                openCharacterModal(item);
            };

            card.addEventListener('click', open);
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                }
            });
        });
    }

    // Create character card HTML
    function createCharacterCard(item) {
        const t = config.type;
        const isFavorite = item.favorites && item.favorites[currentUser];
        const favoriteIcon = isFavorite ? `<div class="${t}-favorite">★</div>` : '';
        const isSelectedForExport = selectedExportIds.has(item[config.idField]);
        const exportClass = isSelectedForExport ? ' is-selected' : '';

        // Handle both old image_path and new images array for backward compatibility
        let thumbnailImage = '';
        if (item.images && item.images.length > 0) {
            thumbnailImage = item.images[0];
        } else if (item.image_path) {
            thumbnailImage = item.image_path;
        }

        let imageHtml;
        if (thumbnailImage) {
            // Use thumbnail for card grid if available, fall back to full image
            const thumbSrc = item.thumbnails && item.thumbnails[thumbnailImage];
            const cardSrc = thumbSrc || escapeHtml(thumbnailImage);

            const adj = item.image_adjustments && item.image_adjustments[thumbnailImage];
            const adjustedHtml = adj && typeof ImageAdjuster !== 'undefined' ?
                ImageAdjuster.createAdjustedImageHtml(
                    cardSrc,
                    escapeHtml(item.name), adj, '', '', 'loading="lazy"'
                ) : null;
            imageHtml = adjustedHtml ||
                `<img src="${cardSrc}" alt="${escapeHtml(item.name)}" class="${t}-thumbnail" loading="lazy">`;
        } else {
            imageHtml = `<div class="${t}-placeholder">No Photo</div>`;
        }

        return `
            <div class="${t}-card${exportClass}" data-${t}-id="${escapeHtml(item[config.idField])}" tabindex="0">
                ${favoriteIcon}
                <div class="export-select-indicator" aria-hidden="true">✓</div>
                ${imageHtml}
                <div class="${t}-name">${escapeHtml(item.name)}</div>
                <div class="${t}-info">
                    ${config.cardInfoHtml(item)}
                </div>
            </div>
        `;
    }

    // Open character detail modal
    function openCharacterModal(item) {
        setSelected(item);

        const modal = document.getElementById(config.modalId);
        const modalName = document.getElementById(config.modalNameId);
        const modalBody = modal.querySelector(config.detailsSelector);

        modalName.textContent = item.name;

        // Update favorite button (available to all users)
        const favoriteBtn = document.getElementById('modal-favorite-btn');
        if (favoriteBtn) {
            const isFavorite = item.favorites && item.favorites[currentUser];
            favoriteBtn.classList.toggle('active', isFavorite);
            favoriteBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
        }

        // Build modal content
        modalBody.innerHTML = config.createDetailForm(item);

        // Add event listeners for form inputs (GM only)
        if (isGM) {
            modalBody.querySelectorAll(config.modalOpenInputSelector).forEach(input => {
                input.addEventListener('change', function () {
                    const field = this.getAttribute('data-field');
                    const value = this.value;
                    saveCharacterField(item[config.idField], field, value);
                });
            });
        }

        // Setup rich text editors
        setupModalRichTextEditors(modalBody, item);

        modal.style.display = 'block';

        if (window.UIKit) {
            detailModalManaged = true;
            UIKit.openModal(modal, {
                onClose: hideCharacterModal,
                initialFocus: modal.querySelector('.modal-controls .close') || undefined
            });
        }
    }

    // Actually hide the modal (called by UIKit.closeModal via onClose)
    function hideCharacterModal() {
        detailModalManaged = false;
        cleanupModalRichTextEditors();

        const modal = document.getElementById(config.modalId);
        modal.style.display = 'none';
        setSelected(null);
    }

    // Close character modal (Esc, x button, background click, after delete)
    function closeCharacterModal() {
        if (detailModalManaged && window.UIKit) {
            UIKit.closeModal(document.getElementById(config.modalId));
        } else {
            hideCharacterModal();
        }
    }

    // Toggle Director's Notes collapsed/expanded
    function toggleDirectorsNotes(header) {
        const content = header.nextElementSibling;
        const arrow = header.querySelector('.toggle-arrow');
        if (content.style.display === 'none') {
            content.style.display = 'block';
            arrow.innerHTML = '&#9650;';
            // Initialize rich text editors inside if not already done
            const containers = content.querySelectorAll('.rich-text-container');
            containers.forEach(container => {
                if (!container.querySelector('.rich-text-editor') && typeof RichTextEditor !== 'undefined') {
                    const field = container.getAttribute('data-field');
                    const placeholder = container.getAttribute('data-placeholder') || 'Enter text...';
                    const editor = new RichTextEditor(container, {
                        placeholder: placeholder + ' Type [[character name]] to link to characters'
                    });
                    editor.init();
                    const selected = getSelected();
                    if (selected && field) {
                        const value = selected[field] || '';
                        if (value) editor.setContent(value);
                    }
                    editor.onChange((editorContent) => {
                        const current = getSelected();
                        if (current) {
                            saveCharacterField(current[config.idField], field, editorContent);
                        }
                    });
                    if (!isGM) editor.setReadOnly(true);
                    modalRichTextEditors.set(field, editor);
                }
            });
        } else {
            content.style.display = 'none';
            arrow.innerHTML = '&#9660;';
        }
    }

    // Add a tension web entry
    function addTensionWebEntry(characterId) {
        const nameInput = document.getElementById(`tw-name-${characterId}`);
        const roleInput = document.getElementById(`tw-role-${characterId}`);
        const descInput = document.getElementById(`tw-desc-${characterId}`);

        const name = nameInput.value.trim();
        const role = roleInput.value.trim();
        const description = descInput.value.trim();

        if (!name) {
            nameInput.focus();
            return;
        }

        const item = findCharacter(characterId);
        if (!item) return;

        if (!item.tension_web) item.tension_web = [];
        item.tension_web.push({ name, role, description });

        saveCharacterField(characterId, 'tension_web', JSON.stringify(item.tension_web));

        nameInput.value = '';
        roleInput.value = '';
        descInput.value = '';

        renderTensionWebList(characterId, item.tension_web);
    }

    // Remove a tension web entry
    function removeTensionWebEntry(characterId, index) {
        const item = findCharacter(characterId);
        if (!item || !item.tension_web) return;

        item.tension_web.splice(index, 1);
        saveCharacterField(characterId, 'tension_web', JSON.stringify(item.tension_web));
        renderTensionWebList(characterId, item.tension_web);
    }

    // Render tension web list
    function renderTensionWebList(characterId, entries) {
        const list = document.getElementById(`tension-web-${characterId}`);
        if (!list) return;

        if (!entries || entries.length === 0) {
            list.innerHTML = '<p class="tension-web-empty">No tension web entries yet.</p>';
            return;
        }

        list.innerHTML = entries.map((entry, index) => `
            <div class="tension-web-entry" data-index="${index}">
                <div class="tension-web-entry-header">
                    <strong class="tension-web-name">${escapeHtml(entry.name || '')}</strong>
                    <span class="tension-web-role">(${escapeHtml(entry.role || '')})</span>
                    ${isGM ? `<button class="btn-remove-tension" onclick="removeTensionWebEntry('${characterId}', ${index})" title="Remove entry" aria-label="Remove entry">&times;</button>` : ''}
                </div>
                <div class="tension-web-description">${escapeHtml(entry.description || '')}</div>
            </div>
        `).join('');
    }

    // Save character field (GM only), debounced per field so rapid edits and
    // tabbing through inputs don't fire parallel racing requests
    function saveCharacterField(characterId, field, value) {
        if (!isGM) return;

        const prepared = config.prepareFieldValue
            ? config.prepareFieldValue(field, value)
            : { field: field, value: value };
        if (!prepared) return;

        const key = characterId + '::' + (prepared.debounceKey || prepared.field);
        if (pendingFieldSaves.has(key)) {
            clearTimeout(pendingFieldSaves.get(key));
        }
        pendingFieldSaves.set(key, setTimeout(() => {
            pendingFieldSaves.delete(key);
            sendFieldSave(characterId, prepared);
        }, 400));
    }

    function sendFieldSave(characterId, prepared) {
        const value = prepared.getValue ? prepared.getValue() : prepared.value;

        const formData = new FormData();
        formData.append('action', config.actions.save);
        formData.append(config.idField, characterId);
        formData.append('field', prepared.field);
        formData.append('value', Array.isArray(value) ? JSON.stringify(value) : value);

        fetch(config.endpoint, {
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

    // Add new character (GM only)
    function addCharacter() {
        if (!isGM) return;

        const formData = new FormData();
        formData.append('action', config.actions.add);

        fetch(config.endpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadCharacters();
                showSuccess(capitalize(config.entityLabel) + ' added successfully');
            } else {
                showError('Failed to add ' + config.entityLabel);
            }
        })
        .catch(error => {
            console.error('Error adding ' + config.entityLabel + ':', error);
            showError('Error adding ' + config.entityLabel);
        });
    }

    // Toggle favorite (available to all users)
    function toggleFavorite() {
        const selected = getSelected();
        if (!selected) return;

        const characterId = selected[config.idField];
        const formData = new FormData();
        formData.append('action', 'toggle_favorite');
        formData.append(config.idField, characterId);

        fetch(config.endpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update local character data
                if (!selected.favorites) {
                    selected.favorites = {};
                }
                selected.favorites[currentUser] = data.is_favorite;

                // Update button appearance
                const favoriteBtn = document.getElementById('modal-favorite-btn');
                if (favoriteBtn) {
                    favoriteBtn.classList.toggle('active', data.is_favorite);
                    favoriteBtn.title = data.is_favorite ? 'Remove from Favorites' : 'Add to Favorites';
                }

                // Sync the card in the grid immediately, then refresh
                updateCardFavorite(characterId, data.is_favorite);
                loadCharacters();
            } else {
                showError('Failed to update favorite status');
            }
        })
        .catch(error => {
            console.error('Error toggling favorite:', error);
            showError('Error updating favorite');
        });
    }

    // Immediately reflect favorite state on the matching grid card
    function updateCardFavorite(characterId, isFavorite) {
        const t = config.type;
        const card = document.querySelector(`.${t}-card[data-${t}-id="${CSS.escape(characterId)}"]`);
        if (!card) return;

        let star = card.querySelector(`.${t}-favorite`);
        if (isFavorite && !star) {
            star = document.createElement('div');
            star.className = `${t}-favorite`;
            star.textContent = '★';
            card.insertBefore(star, card.firstChild);
        } else if (!isFavorite && star) {
            star.remove();
        }
    }

    // Delete character (GM only)
    async function deleteCharacter() {
        if (!isGM) return;
        const selected = getSelected();
        if (!selected) return;

        const confirmed = await UIKit.confirm({
            title: 'Delete ' + capitalize(config.entityLabel) + '?',
            message: `Are you sure you want to delete ${selected.name}? This action cannot be undone.`,
            confirmText: 'Delete',
            danger: true
        });
        if (!confirmed) return;

        const formData = new FormData();
        formData.append('action', config.actions.remove);
        formData.append(config.idField, selected[config.idField]);

        fetch(config.endpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeCharacterModal();
                loadCharacters();
                showSuccess(capitalize(config.entityLabel) + ' deleted successfully');
            } else {
                showError('Failed to delete ' + config.entityLabel);
            }
        })
        .catch(error => {
            console.error('Error deleting ' + config.entityLabel + ':', error);
            showError('Error deleting ' + config.entityLabel);
        });
    }

    // Upload portrait (GM only)
    function uploadPortrait(characterId) {
        if (!isGM) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.webp';
        input.onchange = function (e) {
            const file = e.target.files[0];
            if (!file) return;

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

            uploadImageFile(characterId, file);
        };
        input.click();
    }

    function setUploadButtonsLoading(isLoading) {
        document.querySelectorAll('.upload-portrait-btn').forEach(btn => {
            UIKit.setLoading(btn, isLoading, 'Uploading…');
        });
    }

    // Handle the actual file upload
    function uploadImageFile(characterId, file) {
        const formData = new FormData();
        formData.append('action', 'upload_portrait');
        formData.append(config.idField, characterId);
        formData.append('portrait', file);

        setUploadButtonsLoading(true);

        fetch(config.endpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            setUploadButtonsLoading(false);
            if (data.success) {
                const selected = getSelected();
                if (selected && selected[config.idField] === characterId) {
                    if (!selected.images) {
                        selected.images = [];
                    }
                    selected.images.push(data.image_path);
                    refreshModalBody();
                }

                loadCharacters();
                showSuccess('Image uploaded successfully');
            } else {
                showError('Failed to upload image: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            setUploadButtonsLoading(false);
            console.error('Error uploading portrait:', error);
            showError('Error uploading portrait');
        });
    }

    // Rebuild the modal body from the selected character and rewire listeners
    function refreshModalBody() {
        const selected = getSelected();
        const modalBody = document.querySelector(`#${config.modalId} ${config.detailsSelector}`);
        if (modalBody && selected) {
            modalBody.innerHTML = config.createDetailForm(selected);
            setupFormEventListeners(modalBody);
            setupModalRichTextEditors(modalBody, selected);
        }
    }

    function setupFormEventListeners(container) {
        if (!isGM) return;

        // Only handle input and select elements - rich text editors handle their own auto-save
        container.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', function () {
                const field = this.getAttribute('data-field');
                const value = this.value;
                const selected = getSelected();
                if (selected) {
                    saveCharacterField(selected[config.idField], field, value);
                }
            });
        });
    }

    // Utility functions
    function showLoading(show) {
        const loading = document.getElementById('loading');
        const grid = document.getElementById(config.gridId);

        if (show) {
            loading.style.display = 'flex';
            grid.style.opacity = '0.5';
        } else {
            loading.style.display = 'none';
            grid.style.opacity = '1';
        }
    }

    function showError(message) {
        if (window.UIKit) {
            UIKit.toast(message, 'error');
        } else {
            console.error(message);
        }
    }

    function showSuccess(message) {
        if (window.UIKit) {
            UIKit.toast(message, 'success');
        } else {
            console.log(message);
        }
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
        return text.toString().replace(/[&<>"']/g, function (m) { return map[m]; });
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

    // Alt text for gallery images: the character's name when we know it
    function galleryAltFor(itemId) {
        const owner = findCharacter(itemId);
        return owner && owner.name ? owner.name : config.type + ' image';
    }

    // Image Gallery Functions
    function createImageGallery(images, itemId, itemType, imageAdjustments) {
        if (!images || images.length === 0) {
            return `<div class="${itemType}-portrait-placeholder">No Photo</div>`;
        }

        const currentImageIndex = 0;
        const hasMultipleImages = images.length > 1;
        const currentImage = images[currentImageIndex];
        const adj = imageAdjustments && imageAdjustments[currentImage];
        const altText = escapeHtml(galleryAltFor(itemId));

        // Build the image element - adjusted or standard
        let imageElement;
        const adjustedHtml = adj && typeof ImageAdjuster !== 'undefined' ?
            ImageAdjuster.createAdjustedImageHtml(
                escapeHtml(currentImage),
                altText, adj, '',
                "openImagePopup('" + escapeHtml(currentImage) + "')"
            ) : null;

        if (adjustedHtml) {
            imageElement = adjustedHtml;
        } else {
            imageElement = `<img src="${escapeHtml(currentImage)}"
                         alt="${altText}"
                         class="${itemType}-portrait gallery-image"
                         onclick="openImagePopup('${escapeHtml(currentImage)}')"
                         data-current-index="${currentImageIndex}">`;
        }

        return `
            <div class="image-gallery" data-item-id="${itemId}" data-item-type="${itemType}">
                <div class="image-container">
                    ${imageElement}

                    ${hasMultipleImages ? `
                        <button class="gallery-nav prev" onclick="navigateGallery('${itemId}', -1)" aria-label="Previous image">‹</button>
                        <button class="gallery-nav next" onclick="navigateGallery('${itemId}', 1)" aria-label="Next image">›</button>
                        <div class="gallery-indicator">${currentImageIndex + 1} / ${images.length}</div>
                    ` : ''}

                    ${isGM ? `
                        <button class="delete-image-btn" onclick="deleteImage('${itemId}', '${escapeHtml(currentImage)}', '${itemType}')" aria-label="Delete image">×</button>
                    ` : ''}
                </div>
                ${isGM ? `
                    <button class="adjust-image-btn" onclick="openImageAdjuster('${itemId}', '${escapeHtml(currentImage)}', '${itemType}')">Adjust Image</button>
                ` : ''}
            </div>
        `;
    }

    function navigateGallery(itemId, direction) {
        const selected = getSelected();
        if (!selected || selected[config.idField] !== itemId) return;

        const images = selected.images || (selected.image_path ? [selected.image_path] : []);
        if (images.length <= 1) return;

        const galleryEl = document.querySelector(`[data-item-id="${itemId}"]`);
        if (!galleryEl) return;

        const imgEl = galleryEl.querySelector('.image-container img, .image-container .adjusted-image-wrapper img');
        const currentIndex = imgEl ? parseInt(imgEl.getAttribute('data-current-index') || '0') : 0;

        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = images.length - 1;
        if (newIndex >= images.length) newIndex = 0;

        const newImage = images[newIndex];
        const adj = selected.image_adjustments && selected.image_adjustments[newImage];
        const container = galleryEl.querySelector('.image-container');
        const altText = escapeHtml(galleryAltFor(itemId));

        // Build new image element
        let newImageHtml;
        const adjustedHtml = adj && typeof ImageAdjuster !== 'undefined' ?
            ImageAdjuster.createAdjustedImageHtml(
                escapeHtml(newImage),
                altText, adj, '',
                "openImagePopup('" + escapeHtml(newImage) + "')"
            ) : null;

        if (adjustedHtml) {
            newImageHtml = adjustedHtml;
        } else {
            newImageHtml = `<img src="${escapeHtml(newImage)}"
                 alt="${altText}"
                 class="${config.type}-portrait gallery-image"
                 onclick="openImagePopup('${escapeHtml(newImage)}')"
                 data-current-index="${newIndex}">`;
        }

        // Rebuild container content
        container.innerHTML = `
            ${newImageHtml}
            <button class="gallery-nav prev" onclick="navigateGallery('${itemId}', -1)" aria-label="Previous image">&#8249;</button>
            <button class="gallery-nav next" onclick="navigateGallery('${itemId}', 1)" aria-label="Next image">&#8250;</button>
            <div class="gallery-indicator">${newIndex + 1} / ${images.length}</div>
            ${isGM ? `<button class="delete-image-btn" onclick="deleteImage('${itemId}', '${escapeHtml(newImage)}', '${config.type}')" aria-label="Delete image">×</button>` : ''}
        `;

        // Update the adjust button
        const adjustBtn = galleryEl.querySelector('.adjust-image-btn');
        if (adjustBtn) {
            adjustBtn.setAttribute('onclick', `openImageAdjuster('${itemId}', '${escapeHtml(newImage)}', '${config.type}')`);
        }

        // Store current index on the new img element
        const newImgEl = container.querySelector('img');
        if (newImgEl) newImgEl.setAttribute('data-current-index', newIndex);
    }

    function openImagePopup(imagePath) {
        let popup = document.getElementById('image-popup');
        if (!popup) {
            popup = createImagePopup();
        }
        const popupImage = popup.querySelector('.image-popup-content img');

        popupImage.src = imagePath;
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
                <div class="image-popup-title">${capitalize(config.type)} Image</div>
                <button class="image-popup-close" onclick="closeImagePopup()" aria-label="Close image">×</button>
            </div>
            <div class="image-popup-content">
                <img src="" alt="${capitalize(config.type)} image">
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

        function dragEnd() {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        }
    }

    async function deleteImage(itemId, imagePath, itemType) {
        if (!isGM) return;

        const confirmed = await UIKit.confirm({
            title: 'Delete Image?',
            message: 'Are you sure you want to delete this image?',
            confirmText: 'Delete',
            danger: true
        });
        if (!confirmed) return;

        const formData = new FormData();
        formData.append('action', 'delete_image');
        formData.append(config.idField, itemId);
        formData.append('image_path', imagePath);

        fetch(config.endpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update local data
                const selected = getSelected();
                if (selected && selected[config.idField] === itemId) {
                    if (selected.images) {
                        const imageIndex = selected.images.indexOf(imagePath);
                        if (imageIndex !== -1) {
                            selected.images.splice(imageIndex, 1);
                        }
                    }
                    refreshModalBody();
                }

                // Refresh the main grid
                loadCharacters();
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

    // Open image adjuster for a character's image
    function openImageAdjuster(itemId, imagePath, itemType) {
        if (!isGM || typeof ImageAdjuster === 'undefined') return;

        const selected = getSelected();
        const item = selected && selected[config.idField] === itemId ? selected : null;
        const existingAdj = item && item.image_adjustments ? item.image_adjustments[imagePath] : null;

        ImageAdjuster.open(imagePath, itemId, itemType, config.endpoint, existingAdj, function (imgPath, adjustment) {
            // Update local data with the new adjustment
            const current = getSelected();
            if (current && current[config.idField] === itemId) {
                if (!current.image_adjustments) {
                    current.image_adjustments = {};
                }
                current.image_adjustments[imgPath] = adjustment;
                refreshModalBody();
            }

            // Refresh the main grid to show updated thumbnails
            loadCharacters();
        });
    }

    // Export functionality
    function exportSelectedCharacters() {
        if (selectedExportIds.size === 0) {
            if (window.UIKit) {
                UIKit.toast(`Select at least one ${config.entityLabel} to export.`, 'warning');
            }
            return;
        }

        const formData = new FormData();
        formData.append('action', config.actions.export);

        fetch(config.endpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const selectedData = Array.isArray(data.data[config.plural])
                    ? data.data[config.plural].filter(item => selectedExportIds.has(item[config.idField]))
                    : [];
                const exportPayload = {};
                exportPayload[config.plural] = selectedData.map(config.cleanExportRecord);

                showExportModal(exportPayload);
            } else {
                showError('Failed to export data: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error exporting data:', error);
            showError('Error exporting data');
        });
    }

    function isValueEmpty(value) {
        if (value === null || value === undefined) {
            return true;
        }
        if (typeof value === 'string') {
            const normalized = value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            return normalized === '';
        }
        if (Array.isArray(value)) {
            return value.length === 0;
        }
        return false;
    }

    function toggleExportSelectionMode(forceState) {
        const nextState = typeof forceState === 'boolean' ? forceState : !exportSelectionActive;
        exportSelectionActive = nextState;
        document.body.classList.toggle('export-selection-active', exportSelectionActive);

        const selectionActions = document.getElementById('export-selection-actions');
        if (selectionActions) {
            selectionActions.style.display = exportSelectionActive ? 'flex' : 'none';
        }

        const exportBtn = document.getElementById(config.exportBtnId);
        if (exportBtn) {
            exportBtn.textContent = exportSelectionActive ? '✖ Cancel Export' : config.exportButtonLabel;
        }

        if (!exportSelectionActive) {
            selectedExportIds.clear();
            updateExportSelectionCount();
            loadCharacters();
        } else {
            updateExportSelectionCount();
        }
    }

    function toggleExportSelection(characterId) {
        if (!exportSelectionActive) {
            return;
        }

        if (selectedExportIds.has(characterId)) {
            selectedExportIds.delete(characterId);
        } else {
            selectedExportIds.add(characterId);
        }

        const t = config.type;
        const card = document.querySelector(`.${t}-card[data-${t}-id="${CSS.escape(characterId)}"]`);
        if (card) {
            card.classList.toggle('is-selected', selectedExportIds.has(characterId));
        }

        updateExportSelectionCount();
    }

    function updateExportSelectionCount() {
        const count = selectedExportIds.size;
        const countLabel = document.getElementById('export-selection-count');
        if (countLabel) {
            countLabel.textContent = `${count} selected`;
        }

        const exportSelectedBtn = document.getElementById(config.exportSelectedBtnId);
        if (exportSelectedBtn) {
            exportSelectedBtn.disabled = count === 0;
        }
    }

    function showExportModal(data) {
        const modal = document.getElementById('export-modal');
        const textarea = document.getElementById('export-data');

        // Format JSON with proper indentation
        textarea.value = JSON.stringify(data, null, 2);

        modal.style.display = 'block';

        if (window.UIKit) {
            exportModalManaged = true;
            UIKit.openModal(modal, { onClose: hideExportModal });
        }
    }

    function hideExportModal() {
        exportModalManaged = false;

        const modal = document.getElementById('export-modal');
        modal.style.display = 'none';

        // Reset copy feedback
        const feedback = document.getElementById('copy-feedback');
        if (feedback) {
            feedback.style.display = 'none';
        }
    }

    function closeExportModal() {
        if (exportModalManaged && window.UIKit) {
            UIKit.closeModal(document.getElementById('export-modal'));
        } else {
            hideExportModal();
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
            showError('Failed to copy to clipboard');
        }
    }

    // Globals shared verbatim between both sections (inline onclick handlers
    // in generated markup rely on these names)
    const sharedGlobals = {
        initializeCharacterLookup,
        setupModalRichTextEditors,
        cleanupModalRichTextEditors,
        getNestedFieldValue,
        setupEventListeners,
        toggleDirectorsNotes,
        addTensionWebEntry,
        removeTensionWebEntry,
        renderTensionWebList,
        setupFormEventListeners,
        showLoading,
        showError,
        showSuccess,
        escapeHtml,
        debounce,
        createImageGallery,
        navigateGallery,
        openImagePopup,
        closeImagePopup,
        createImagePopup,
        makeDraggable,
        deleteImage,
        openImageAdjuster,
        uploadImageFile,
        toggleExportSelectionMode,
        updateExportSelectionCount,
        showExportModal,
        closeExportModal,
        copyExportData,
        isValueEmpty
    };

    // Base functions that areas expose under their legacy names via
    // config.globalNames (e.g. loadCharacters -> loadStudents)
    const aliasableFunctions = {
        loadCharacters,
        displayCharacters,
        createCharacterCard,
        openCharacterModal,
        closeCharacterModal,
        saveCharacterField,
        addCharacter,
        deleteCharacter,
        toggleFavorite,
        uploadPortrait,
        exportSelectedCharacters,
        toggleExportSelection
    };

    function init(options) {
        config = options;

        Object.keys(sharedGlobals).forEach(name => {
            window[name] = sharedGlobals[name];
        });

        Object.keys(config.globalNames || {}).forEach(baseName => {
            window[config.globalNames[baseName]] = aliasableFunctions[baseName];
        });

        return aliasableFunctions;
    }

    return { init };
})();
