// Other NPCs Management JavaScript (GM-only)

const npcsEndpoint = (typeof NPCS_ENDPOINT !== 'undefined' && NPCS_ENDPOINT)
    ? NPCS_ENDPOINT
    : 'index.php';

let modalRichTextEditors = new Map();

function initializeCharacterLookup() {
    if (window.characterLookup && !window.characterLookup.isReady()) {
        window.characterLookup.init().then(() => {
            console.log('Character lookup initialized for NPCs section');
        }).catch(error => {
            console.warn('Character lookup initialization failed:', error);
        });
    }
}

function setupModalRichTextEditors(container, npcData) {
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

            const fieldValue = getNestedFieldValue(npcData, field);
            if (fieldValue) {
                editor.setContent(fieldValue);
            }

            editor.onChange((content) => {
                saveNpcField(npcData.npc_id, field, content);
            });

            if (window.characterLookup && window.characterLookup.isReady()) {
                const editorElement = editor.getEditor();
                if (editorElement) {
                    window.characterLookup.setupEditorListeners(editorElement);
                }
            } else {
                setTimeout(() => {
                    if (window.characterLookup && window.characterLookup.isReady()) {
                        const editorElement = editor.getEditor();
                        if (editorElement) {
                            window.characterLookup.setupEditorListeners(editorElement);
                        }
                    }
                }, 500);
            }

            modalRichTextEditors.set(field, editor);
        }
    });
}

function cleanupModalRichTextEditors() {
    modalRichTextEditors.forEach((editor) => {
        if (editor && editor.destroy) {
            editor.destroy();
        }
    });
    modalRichTextEditors.clear();
}

function getNestedFieldValue(npcData, field) {
    const parts = field.split('.');
    let value = npcData;

    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            return '';
        }
    }

    return value || '';
}

function setupEventListeners() {
    setTimeout(initializeCharacterLookup, 500);

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function() {
            currentFilters.search = this.value.trim();
            loadNpcs();
        }, 300));
    }

    document.querySelectorAll('[data-sort]').forEach(btn => {
        btn.addEventListener('click', function() {
            const sortType = this.getAttribute('data-sort');
            document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentSort = sortType;
            loadNpcs();
        });
    });

    const collegeFilter = document.getElementById('filter-college');
    if (collegeFilter) {
        collegeFilter.addEventListener('change', function() {
            currentFilters.college = this.value;
            loadNpcs();
        });
    }

    const favoritesToggle = document.getElementById('favorites-toggle');
    if (favoritesToggle) {
        favoritesToggle.addEventListener('click', function() {
            currentFilters.favorites = !currentFilters.favorites;
            this.classList.toggle('active', currentFilters.favorites);
            loadNpcs();
        });
    }

    const addNpcBtn = document.getElementById('add-npc-btn');
    if (addNpcBtn) {
        addNpcBtn.addEventListener('click', addNpc);
    }

    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    if (modalDeleteBtn) {
        modalDeleteBtn.addEventListener('click', deleteNpc);
    }

    const modalFavoriteBtn = document.getElementById('modal-favorite-btn');
    if (modalFavoriteBtn) {
        modalFavoriteBtn.addEventListener('click', toggleNpcFavorite);
    }

    const modal = document.getElementById('npc-modal');
    if (modal) {
        let backgroundPointerDown = false;
        modal.addEventListener('mousedown', function(e) {
            backgroundPointerDown = e.target === modal;
        });
        modal.addEventListener('mouseup', function(e) {
            if (backgroundPointerDown && e.target === modal) {
                closeNpcModal();
            }
            backgroundPointerDown = false;
        });
    }
}

function loadNpcs() {
    showLoading(true);

    const formData = new FormData();
    formData.append('action', 'load_npcs');
    formData.append('sort_by', currentSort);
    formData.append('filter_college', currentFilters.college);
    formData.append('show_favorites', currentFilters.favorites.toString());
    formData.append('search_term', currentFilters.search);

    fetch(npcsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        if (data.success) {
            displayNpcs(data.npcs);
            window.allNpcs = data.npcs;
        } else {
            console.error('Failed to load NPCs:', data.error);
            showError('Failed to load NPCs');
        }
    })
    .catch(error => {
        showLoading(false);
        console.error('Error loading NPCs:', error);
        showError('Error loading NPCs');
    });
}

function displayNpcs(npcs) {
    const grid = document.getElementById('npcs-grid');

    if (npcs.length === 0) {
        grid.innerHTML = `
            <div class="no-npcs">
                <div class="no-npcs-icon">👥</div>
                <p>No NPCs found matching your criteria.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = npcs.map(npc => createNpcCard(npc)).join('');

    grid.querySelectorAll('.npc-card').forEach(card => {
        card.addEventListener('click', function() {
            const npcId = this.getAttribute('data-npc-id');
            const npc = npcs.find(n => n.npc_id === npcId);
            if (npc) {
                openNpcModal(npc);
            }
        });
    });
}

function createNpcCard(npc) {
    const isFavorite = npc.favorites && npc.favorites[currentUser];
    const favoriteIcon = isFavorite ? '<div class="npc-favorite">★</div>' : '';

    let thumbnailImage = '';
    if (npc.images && npc.images.length > 0) {
        thumbnailImage = npc.images[0];
    } else if (npc.image_path) {
        thumbnailImage = npc.image_path;
    }

    let imageHtml;
    if (thumbnailImage) {
        const thumbSrc = npc.thumbnails && npc.thumbnails[thumbnailImage];
        const cardSrc = thumbSrc || escapeHtml(thumbnailImage);

        const adj = npc.image_adjustments && npc.image_adjustments[thumbnailImage];
        const adjustedHtml = adj && typeof ImageAdjuster !== 'undefined' ?
            ImageAdjuster.createAdjustedImageHtml(
                cardSrc,
                escapeHtml(npc.name), adj, '', '', 'loading="lazy"'
            ) : null;
        imageHtml = adjustedHtml ||
            `<img src="${cardSrc}" alt="${escapeHtml(npc.name)}" class="npc-thumbnail" loading="lazy">`;
    } else {
        imageHtml = `<div class="npc-placeholder">No Photo</div>`;
    }

    return `
        <div class="npc-card" data-npc-id="${escapeHtml(npc.npc_id)}">
            ${favoriteIcon}
            ${imageHtml}
            <div class="npc-name">${escapeHtml(npc.name)}</div>
            <div class="npc-info">
                <div class="npc-race">${escapeHtml(npc.race || 'Unknown Race')}</div>
                <div class="npc-college">${escapeHtml(npc.college || 'No College')}</div>
            </div>
        </div>
    `;
}

function openNpcModal(npc) {
    selectedNpc = npc;

    const modal = document.getElementById('npc-modal');
    const modalName = document.getElementById('modal-npc-name');
    const modalBody = modal.querySelector('.npc-details');

    modalName.textContent = npc.name;

    const favoriteBtn = document.getElementById('modal-favorite-btn');
    if (favoriteBtn) {
        const isFavorite = npc.favorites && npc.favorites[currentUser];
        favoriteBtn.classList.toggle('active', isFavorite);
        favoriteBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
    }

    modalBody.innerHTML = createNpcDetailForm(npc);

    modalBody.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('change', function() {
            const field = this.getAttribute('data-field');
            const value = this.value;
            saveNpcField(npc.npc_id, field, value);
        });
    });

    setupModalRichTextEditors(modalBody, npc);

    modal.style.display = 'block';
}

function createNpcDetailForm(npc) {
    const conflictEngine = npc.conflict_engine || {};
    const tensionWeb = npc.tension_web || [];

    let images = [];
    if (npc.images && npc.images.length > 0) {
        images = npc.images;
    } else if (npc.image_path) {
        images = [npc.image_path];
    }

    const imageHtml = images.length > 0 ?
        createImageGallery(images, npc.npc_id, 'npc', npc.image_adjustments) :
        `<div class="npc-portrait-placeholder">No Photo</div>`;

    const uploadButton = `<button class="upload-portrait-btn" onclick="uploadNpcPortrait('${npc.npc_id}')">Upload Photo</button>`;

    const tensionWebHtml = tensionWeb.map((entry, index) => `
        <div class="tension-web-entry" data-index="${index}">
            <div class="tension-web-entry-header">
                <strong class="tension-web-name">${escapeHtml(entry.name || '')}</strong>
                <span class="tension-web-role">(${escapeHtml(entry.role || '')})</span>
                <button class="btn-remove-tension" onclick="removeTensionWebEntry('${npc.npc_id}', ${index})" title="Remove entry">&times;</button>
            </div>
            <div class="tension-web-description">${entry.description || ''}</div>
        </div>
    `).join('');

    const wantTagOptions = ['Legacy', 'Recognition', 'Freedom', 'Power', 'Knowledge', 'Connection', 'Survival', 'Justice', 'Creation', 'Redemption'];
    const currentWantTag = conflictEngine.want_tag || '';

    return `
        <div class="npc-form student-form">
            <!-- Portrait Section -->
            <div class="npc-portrait-section student-portrait-section">
                ${imageHtml}
                ${uploadButton}
            </div>

            <!-- Basic Information: name, race, college only -->
            <div class="form-section">
                <h3>Basic Information</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label>Name:</label>
                        <input type="text" value="${escapeHtml(npc.name)}" data-field="name">
                    </div>
                    <div class="form-group">
                        <label>Race:</label>
                        <input type="text" value="${escapeHtml(npc.race || '')}" data-field="race" placeholder="Enter race">
                    </div>
                    <div class="form-group">
                        <label>College:</label>
                        <select data-field="college">
                            <option value="">No College</option>
                            <option value="Silverquill" ${npc.college === 'Silverquill' ? 'selected' : ''}>Silverquill</option>
                            <option value="Prismari" ${npc.college === 'Prismari' ? 'selected' : ''}>Prismari</option>
                            <option value="Witherbloom" ${npc.college === 'Witherbloom' ? 'selected' : ''}>Witherbloom</option>
                            <option value="Lorehold" ${npc.college === 'Lorehold' ? 'selected' : ''}>Lorehold</option>
                            <option value="Quandrix" ${npc.college === 'Quandrix' ? 'selected' : ''}>Quandrix</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Conflict Engine Section -->
            <div class="form-section gm-only conflict-engine-section">
                <h3><span class="ce-icon">&#9881;</span> Conflict Engine</h3>

                <div class="ce-block ce-want">
                    <div class="ce-block-header">
                        <span class="ce-badge ce-badge-want">W</span>
                        <span class="ce-block-title">Want</span>
                        <select class="ce-want-tag-select" data-field="conflict_engine.want_tag">
                            <option value="">No tag</option>
                            ${wantTagOptions.map(tag => `<option value="${tag}" ${currentWantTag === tag ? 'selected' : ''}>${tag}</option>`).join('')}
                        </select>
                        ${currentWantTag ? `<span class="ce-want-tag">${escapeHtml(currentWantTag)}</span>` : ''}
                    </div>
                    <div class="ce-block-body">
                        <div class="rich-text-container" data-field="conflict_engine.want" data-placeholder="What does this character want most?"></div>
                    </div>
                </div>

                <div class="ce-block ce-obstacle">
                    <div class="ce-block-header">
                        <span class="ce-badge ce-badge-obstacle">O</span>
                        <span class="ce-block-title">Obstacle</span>
                    </div>
                    <div class="ce-block-body">
                        <div class="rich-text-container" data-field="conflict_engine.obstacle" data-placeholder="What stands in the way of what they want?"></div>
                    </div>
                </div>

                <div class="ce-block ce-action">
                    <div class="ce-block-header">
                        <span class="ce-badge ce-badge-action">A</span>
                        <span class="ce-block-title">Action</span>
                    </div>
                    <div class="ce-block-body">
                        <div class="rich-text-container" data-field="conflict_engine.action" data-placeholder="What is this character actively doing about it?"></div>
                    </div>
                </div>

                <div class="ce-block ce-consequence">
                    <div class="ce-block-header">
                        <span class="ce-badge ce-badge-consequence">C</span>
                        <span class="ce-block-title">Consequence</span>
                    </div>
                    <div class="ce-block-body">
                        <div class="rich-text-container" data-field="conflict_engine.consequence" data-placeholder="What happens if they fail or succeed? What's at stake?"></div>
                    </div>
                </div>
            </div>

            <!-- Tension Web Section -->
            <div class="form-section gm-only tension-web-section">
                <h3>Tension Web</h3>
                <div class="tension-web-list" id="tension-web-${npc.npc_id}">
                    ${tensionWebHtml || '<p class="tension-web-empty">No tension web entries yet.</p>'}
                </div>
                <div class="tension-web-add">
                    <div class="tension-web-add-row">
                        <input type="text" id="tw-name-${npc.npc_id}" placeholder="Name..." class="tw-input tw-name-input">
                        <input type="text" id="tw-role-${npc.npc_id}" placeholder="Role (e.g. mentor, rival)..." class="tw-input tw-role-input">
                    </div>
                    <div class="tension-web-add-row">
                        <input type="text" id="tw-desc-${npc.npc_id}" placeholder="Describe the tension/friction..." class="tw-input tw-desc-input">
                        <button class="btn-add-tension" onclick="addTensionWebEntry('${npc.npc_id}')">+ Add</button>
                    </div>
                </div>
            </div>

            <!-- Pressure Point Section -->
            <div class="form-section gm-only pressure-point-section">
                <h3>Pressure Point</h3>
                <div class="rich-text-container" data-field="pressure_point" data-placeholder="When [trigger], they [behavior]... What pushes this character's buttons?"></div>
            </div>

            <!-- Trajectory Section -->
            <div class="form-section gm-only trajectory-section">
                <h3>Trajectory</h3>
                <div class="rich-text-container" data-field="trajectory" data-placeholder="Without intervention, what happens to this character? (single sentence arc)"></div>
            </div>

            <!-- Director's Notes Section (collapsed by default) -->
            <div class="form-section gm-only directors-notes-section">
                <h3 class="directors-notes-toggle" onclick="toggleDirectorsNotes(this)">Director's Notes <span class="toggle-arrow">&#9660;</span></h3>
                <div class="directors-notes-content" style="display: none;">
                    <div class="rich-text-container large" data-field="directors_notes" data-placeholder="Origin, background, and other GM notes..."></div>
                </div>
            </div>
        </div>
    `;
}

function closeNpcModal() {
    cleanupModalRichTextEditors();
    const modal = document.getElementById('npc-modal');
    modal.style.display = 'none';
    selectedNpc = null;
}

function toggleDirectorsNotes(header) {
    const content = header.nextElementSibling;
    const arrow = header.querySelector('.toggle-arrow');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.innerHTML = '&#9650;';
        const containers = content.querySelectorAll('.rich-text-container');
        containers.forEach(container => {
            if (!container.querySelector('.rich-text-editor') && typeof RichTextEditor !== 'undefined') {
                const field = container.getAttribute('data-field');
                const placeholder = container.getAttribute('data-placeholder') || 'Enter text...';
                const editor = new RichTextEditor(container, {
                    placeholder: placeholder + ' Type [[character name]] to link to characters'
                });
                editor.init();
                if (selectedNpc && field) {
                    const value = selectedNpc[field] || '';
                    if (value) editor.setContent(value);
                }
                editor.onChange((editorContent) => {
                    if (selectedNpc) {
                        saveNpcField(selectedNpc.npc_id, field, editorContent);
                    }
                });
                modalRichTextEditors.set(field, editor);
            }
        });
    } else {
        content.style.display = 'none';
        arrow.innerHTML = '&#9660;';
    }
}

function addTensionWebEntry(npcId) {
    const nameInput = document.getElementById(`tw-name-${npcId}`);
    const roleInput = document.getElementById(`tw-role-${npcId}`);
    const descInput = document.getElementById(`tw-desc-${npcId}`);

    const name = nameInput.value.trim();
    const role = roleInput.value.trim();
    const description = descInput.value.trim();

    if (!name) {
        nameInput.focus();
        return;
    }

    const npc = window.allNpcs ? window.allNpcs.find(n => n.npc_id === npcId) : selectedNpc;
    if (!npc) return;

    if (!npc.tension_web) npc.tension_web = [];
    npc.tension_web.push({ name, role, description });

    saveNpcField(npcId, 'tension_web', JSON.stringify(npc.tension_web));

    nameInput.value = '';
    roleInput.value = '';
    descInput.value = '';

    renderTensionWebList(npcId, npc.tension_web);
}

function removeTensionWebEntry(npcId, index) {
    const npc = window.allNpcs ? window.allNpcs.find(n => n.npc_id === npcId) : selectedNpc;
    if (!npc || !npc.tension_web) return;

    npc.tension_web.splice(index, 1);
    saveNpcField(npcId, 'tension_web', JSON.stringify(npc.tension_web));
    renderTensionWebList(npcId, npc.tension_web);
}

function renderTensionWebList(npcId, entries) {
    const list = document.getElementById(`tension-web-${npcId}`);
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
                <button class="btn-remove-tension" onclick="removeTensionWebEntry('${npcId}', ${index})" title="Remove entry">&times;</button>
            </div>
            <div class="tension-web-description">${escapeHtml(entry.description || '')}</div>
        </div>
    `).join('');
}

function saveNpcField(npcId, field, value) {
    const formData = new FormData();
    formData.append('action', 'save_npc');
    formData.append('npc_id', npcId);
    formData.append('field', field);
    formData.append('value', Array.isArray(value) ? JSON.stringify(value) : value);

    fetch(npcsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('Failed to save field:', data.error);
            showError('Failed to save changes');
        } else if (selectedNpc && selectedNpc.npc_id === npcId) {
            // keep local selectedNpc in sync for simple top-level fields
            if (field.indexOf('.') === -1 && field !== 'tension_web') {
                selectedNpc[field] = value;
            }
        }
    })
    .catch(error => {
        console.error('Error saving field:', error);
        showError('Error saving changes');
    });
}

function addNpc() {
    const formData = new FormData();
    formData.append('action', 'add_npc');

    fetch(npcsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadNpcs();
            showSuccess('NPC added successfully');
        } else {
            showError('Failed to add NPC');
        }
    })
    .catch(error => {
        console.error('Error adding NPC:', error);
        showError('Error adding NPC');
    });
}

function toggleNpcFavorite() {
    if (!selectedNpc) return;

    const formData = new FormData();
    formData.append('action', 'toggle_favorite');
    formData.append('npc_id', selectedNpc.npc_id);

    fetch(npcsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (!selectedNpc.favorites) {
                selectedNpc.favorites = {};
            }
            selectedNpc.favorites[currentUser] = data.is_favorite;

            const favoriteBtn = document.getElementById('modal-favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.classList.toggle('active', data.is_favorite);
                favoriteBtn.title = data.is_favorite ? 'Remove from Favorites' : 'Add to Favorites';
            }

            loadNpcs();
        } else {
            showError('Failed to update favorite status');
        }
    })
    .catch(error => {
        console.error('Error toggling favorite:', error);
        showError('Error updating favorite');
    });
}

function deleteNpc() {
    if (!selectedNpc) return;

    if (!confirm(`Are you sure you want to delete ${selectedNpc.name}? This action cannot be undone.`)) {
        return;
    }

    const formData = new FormData();
    formData.append('action', 'delete_npc');
    formData.append('npc_id', selectedNpc.npc_id);

    fetch(npcsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            closeNpcModal();
            loadNpcs();
            showSuccess('NPC deleted successfully');
        } else {
            showError('Failed to delete NPC');
        }
    })
    .catch(error => {
        console.error('Error deleting NPC:', error);
        showError('Error deleting NPC');
    });
}

function uploadNpcPortrait(npcId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.webp';
    input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showError('Image file must be smaller than 5MB');
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showError('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
            return;
        }

        const formData = new FormData();
        formData.append('action', 'upload_portrait');
        formData.append('npc_id', npcId);
        formData.append('portrait', file);

        fetch(npcsEndpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (selectedNpc && selectedNpc.npc_id === npcId) {
                    if (!selectedNpc.images) {
                        selectedNpc.images = [];
                    }
                    selectedNpc.images.push(data.image_path);

                    const modalBody = document.querySelector('#npc-modal .npc-details');
                    if (modalBody) {
                        modalBody.innerHTML = createNpcDetailForm(selectedNpc);
                        setupFormEventListeners(modalBody);
                        setupModalRichTextEditors(modalBody, selectedNpc);
                    }
                }
                loadNpcs();
            } else {
                alert('Failed to upload image: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error uploading image:', error);
            alert('Error uploading image');
        });
    };
    input.click();
}

function setupFormEventListeners(container) {
    container.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', function() {
            const field = this.getAttribute('data-field');
            const value = this.value;
            if (selectedNpc) {
                saveNpcField(selectedNpc.npc_id, field, value);
            }
        });
    });
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

    let imageElement;
    const adjustedHtml = adj && typeof ImageAdjuster !== 'undefined' ?
        ImageAdjuster.createAdjustedImageHtml(
            escapeHtml(currentImage),
            itemType + ' image', adj, '',
            "openImagePopup('" + escapeHtml(currentImage) + "')"
        ) : null;

    if (adjustedHtml) {
        imageElement = adjustedHtml;
    } else {
        imageElement = `<img src="${escapeHtml(currentImage)}"
                     alt="${itemType} image"
                     class="${itemType}-portrait gallery-image"
                     onclick="openImagePopup('${escapeHtml(currentImage)}')"
                     data-current-index="${currentImageIndex}">`;
    }

    return `
        <div class="image-gallery" data-item-id="${itemId}" data-item-type="${itemType}">
            <div class="image-container">
                ${imageElement}

                ${hasMultipleImages ? `
                    <button class="gallery-nav prev" onclick="navigateGallery('${itemId}', -1)">‹</button>
                    <button class="gallery-nav next" onclick="navigateGallery('${itemId}', 1)">›</button>
                    <div class="gallery-indicator">${currentImageIndex + 1} / ${images.length}</div>
                ` : ''}

                <button class="delete-image-btn" onclick="deleteImage('${itemId}', '${escapeHtml(currentImage)}', '${itemType}')">×</button>
            </div>
            <button class="adjust-image-btn" onclick="openImageAdjuster('${itemId}', '${escapeHtml(currentImage)}', '${itemType}')">Adjust Image</button>
        </div>
    `;
}

function navigateGallery(itemId, direction) {
    if (!selectedNpc || selectedNpc.npc_id !== itemId) return;

    const images = selectedNpc.images || [];
    if (images.length <= 1) return;

    const galleryEl = document.querySelector(`[data-item-id="${itemId}"]`);
    if (!galleryEl) return;

    const imgEl = galleryEl.querySelector('.image-container img, .image-container .adjusted-image-wrapper img');
    const currentIndex = imgEl ? parseInt(imgEl.getAttribute('data-current-index') || '0') : 0;

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;

    const newImage = images[newIndex];
    const adj = selectedNpc.image_adjustments && selectedNpc.image_adjustments[newImage];
    const container = galleryEl.querySelector('.image-container');

    let newImageHtml;
    const adjustedHtml = adj && typeof ImageAdjuster !== 'undefined' ?
        ImageAdjuster.createAdjustedImageHtml(
            escapeHtml(newImage),
            'npc image', adj, '',
            "openImagePopup('" + escapeHtml(newImage) + "')"
        ) : null;

    if (adjustedHtml) {
        newImageHtml = adjustedHtml;
    } else {
        newImageHtml = `<img src="${escapeHtml(newImage)}"
             alt="npc image"
             class="npc-portrait gallery-image"
             onclick="openImagePopup('${escapeHtml(newImage)}')"
             data-current-index="${newIndex}">`;
    }

    container.innerHTML = `
        ${newImageHtml}
        <button class="gallery-nav prev" onclick="navigateGallery('${itemId}', -1)">&#8249;</button>
        <button class="gallery-nav next" onclick="navigateGallery('${itemId}', 1)">&#8250;</button>
        <div class="gallery-indicator">${newIndex + 1} / ${images.length}</div>
        <button class="delete-image-btn" onclick="deleteImage('${itemId}', '${escapeHtml(newImage)}', 'npc')">×</button>
    `;

    const adjustBtn = galleryEl.querySelector('.adjust-image-btn');
    if (adjustBtn) {
        adjustBtn.setAttribute('onclick', `openImageAdjuster('${itemId}', '${escapeHtml(newImage)}', 'npc')`);
    }

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
            <div class="image-popup-title">NPC Image</div>
            <button class="image-popup-close" onclick="closeImagePopup()">×</button>
        </div>
        <div class="image-popup-content">
            <img src="" alt="NPC image">
        </div>
    `;
    document.body.appendChild(popup);
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

function deleteImage(itemId, imagePath) {
    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }

    const formData = new FormData();
    formData.append('action', 'delete_image');
    formData.append('npc_id', itemId);
    formData.append('image_path', imagePath);

    fetch(npcsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (selectedNpc && selectedNpc.npc_id === itemId) {
                if (selectedNpc.images) {
                    const imageIndex = selectedNpc.images.indexOf(imagePath);
                    if (imageIndex !== -1) {
                        selectedNpc.images.splice(imageIndex, 1);
                    }
                }

                const modalBody = document.querySelector('#npc-modal .npc-details');
                if (modalBody) {
                    modalBody.innerHTML = createNpcDetailForm(selectedNpc);
                    setupFormEventListeners(modalBody);
                    setupModalRichTextEditors(modalBody, selectedNpc);
                }
            }
            loadNpcs();
        } else {
            alert('Failed to delete image: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error deleting image:', error);
        alert('Error deleting image');
    });
}

function openImageAdjuster(itemId, imagePath, itemType) {
    if (typeof ImageAdjuster === 'undefined') return;

    const npc = selectedNpc && selectedNpc.npc_id === itemId ? selectedNpc : null;
    const existingAdj = npc && npc.image_adjustments ? npc.image_adjustments[imagePath] : null;

    ImageAdjuster.open(imagePath, itemId, itemType, npcsEndpoint, existingAdj, function(imgPath, adjustment) {
        if (selectedNpc && selectedNpc.npc_id === itemId) {
            if (!selectedNpc.image_adjustments) {
                selectedNpc.image_adjustments = {};
            }
            selectedNpc.image_adjustments[imgPath] = adjustment;

            const modalBody = document.querySelector('#npc-modal .npc-details');
            if (modalBody) {
                modalBody.innerHTML = createNpcDetailForm(selectedNpc);
                setupFormEventListeners(modalBody);
                setupModalRichTextEditors(modalBody, selectedNpc);
            }
        }
        loadNpcs();
    });
}

// Utility functions
function showLoading(show) {
    const loading = document.getElementById('loading');
    const grid = document.getElementById('npcs-grid');

    if (show) {
        loading.style.display = 'flex';
        grid.style.opacity = '0.5';
    } else {
        loading.style.display = 'none';
        grid.style.opacity = '1';
    }
}

function showError(message) {
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
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
}

function showSuccess(message) {
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
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
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
