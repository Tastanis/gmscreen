/**
 * Hex Popup Functionality
 * Handles image uploads, collaborative editing, and data management
 */

// Global variables for popup state
let currentHex = { q: 0, r: 0 };
let currentHexData = {};
let currentEditLock = null;
let currentImageForDelete = null;
let isGM = false;
let currentUser = '';
let gmShareButton = null;

const HEX_FETCH_TIMEOUT_MS = 8000;

/**
 * Fetch with a timeout via AbortController
 */
async function hexFetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEX_FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Enable/disable the popup save button (disabled when hex data failed to
 * load, so a blank form can't overwrite existing data)
 */
function setSaveEnabled(enabled) {
    const saveBtn = document.getElementById('hex-save-btn');
    if (saveBtn) {
        saveBtn.disabled = !enabled;
        saveBtn.title = enabled ? '' : 'Saving disabled: hex data failed to load.';
    }
}

/**
 * Initialize hex popup system
 */
function initHexPopup() {
    // Get user data from global variables
    if (window.USER_DATA) {
        isGM = window.USER_DATA.isGM;
        currentUser = window.USER_DATA.username;
    }
    
    // Set up file input handlers
    document.getElementById('player-image-upload').addEventListener('change', (e) => {
        handleImageUpload(e, 'player');
    });

    document.getElementById('gm-image-upload').addEventListener('change', (e) => {
        handleImageUpload(e, 'gm');
    });

    gmShareButton = document.getElementById('player-use-gm-image');
    if (gmShareButton) {
        if (!isGM) {
            gmShareButton.style.display = 'none';
        } else {
            gmShareButton.disabled = true;
            gmShareButton.classList.add('upload-btn--disabled');
        }
    }

    // Initialize section visibility
    initializeSectionVisibility();
}

/**
 * Initialize section visibility based on user role
 */
function initializeSectionVisibility() {
    // GM section is only visible for GM users
    const gmSection = document.getElementById('gm-section');
    if (isGM) {
        gmSection.style.display = 'block';
    } else {
        gmSection.style.display = 'none';
    }
    
    // Player section is always visible
    document.getElementById('player-section').style.display = 'block';
}

/**
 * Load hex data from server
 */
async function loadHexData(q, r) {
    setSaveEnabled(false);
    try {
        const formData = new FormData();
        formData.append('action', 'load');
        formData.append('q', q);
        formData.append('r', r);

        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            currentHexData = result.data;
            populateHexData();
            setSaveEnabled(true);
        } else {
            console.error('Failed to load hex data:', result.error);
            // Initialize with empty data, but keep saving disabled so the
            // blank form can't overwrite whatever is on the server
            currentHexData = {
                player: { title: '', images: [], notes: '' },
                editing: { user: '', timestamp: '', section: '' }
            };
            if (isGM) {
                currentHexData.gm = { title: '', images: [], notes: '' };
            }
            populateHexData();
            UIKit.toast('Failed to load hex data: ' + (result.error || 'unknown error') + '. Saving is disabled.', 'error');
        }
    } catch (error) {
        console.error('Error loading hex data:', error);
        UIKit.toast('Could not load hex data from the server. Saving is disabled to protect existing notes.', 'error');
    }
}

/**
 * Populate popup with hex data
 */
function populateHexData() {
    // Populate player section
    populateImages('player', currentHexData.player.images || []);
    document.getElementById('player-notes').value = currentHexData.player.notes || '';
    document.getElementById('player-title').value = currentHexData.player.title || '';
    
    // Populate GM section if user is GM
    if (isGM) {
        // Ensure GM data exists
        if (!currentHexData.gm) {
            currentHexData.gm = { title: '', images: [], notes: '' };
        }
        populateImages('gm', currentHexData.gm.images || []);
        document.getElementById('gm-notes').value = currentHexData.gm.notes || '';
        document.getElementById('gm-title').value = currentHexData.gm.title || '';
    }

    updateShareButtonState();

    // Initialize section visibility
    initializeSectionVisibility();

    // Update edit lock status
    updateEditLockStatus();
}

/**
 * Populate images for a section
 */
function populateImages(section, images) {
    const gallery = document.getElementById(`${section}-images`);
    gallery.innerHTML = '';

    if (images.length === 0) {
        gallery.innerHTML = '<div style="color: var(--text-faint); text-align: center; padding: 20px;">No images uploaded</div>';
        gallery.classList.remove('single-image');
        return;
    }
    
    // Add single-image class if only one image
    if (images.length === 1) {
        gallery.classList.add('single-image');
    } else {
        gallery.classList.remove('single-image');
    }
    
    images.forEach((image, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'hex-image-thumb';
        thumb.innerHTML = `
            <img src="hex-images/${image.filename}" alt="${image.original_name}" 
                 onclick="openLightbox('${image.filename}', '${section}', ${index})">
        `;
        gallery.appendChild(thumb);
    });
}

function updateShareButtonState() {
    if (!gmShareButton) {
        return;
    }

    if (!isGM) {
        gmShareButton.style.display = 'none';
        return;
    }

    const gmImages = (currentHexData && currentHexData.gm && Array.isArray(currentHexData.gm.images))
        ? currentHexData.gm.images
        : [];
    const hasImages = gmImages.length > 0;

    gmShareButton.disabled = !hasImages;
    gmShareButton.classList.toggle('upload-btn--disabled', !hasImages);
    if (!hasImages) {
        gmShareButton.title = 'Upload a GM image before sharing it with players.';
    } else {
        gmShareButton.title = 'Share the GM image with players.';
    }
}

/**
 * Trigger image upload
 */
function uploadHexImage(section) {
    document.getElementById(`${section}-image-upload`).click();
}

/**
 * Share GM images with players without reuploading
 */
async function useGmImagesForPlayers() {
    if (!isGM) {
        UIKit.toast('Only the GM can share images with the players.', 'warning');
        return;
    }

    const gmImages = (currentHexData && currentHexData.gm && Array.isArray(currentHexData.gm.images))
        ? currentHexData.gm.images
        : [];

    if (gmImages.length === 0) {
        UIKit.toast('Upload a GM image before sharing it with the players.', 'warning');
        return;
    }

    if (gmShareButton) {
        gmShareButton.disabled = true;
        gmShareButton.classList.add('upload-btn--disabled');
    }

    const formData = new FormData();
    formData.append('action', 'share_gm_images');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);

    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            await loadHexData(currentHex.q, currentHex.r);

            if (window.mapInterface && window.mapInterface.hexGrid) {
                window.mapInterface.hexGrid.refreshHexStatus();
            }
            UIKit.toast('GM image shared with players.', 'success');
        } else {
            const errorMessage = result.error ? `Failed to share image: ${result.error}` : 'Failed to share image.';
            UIKit.toast(errorMessage, 'error');
        }
    } catch (error) {
        console.error('Error sharing GM image:', error);
        UIKit.toast('Error sharing GM image with players.', 'error');
    } finally {
        updateShareButtonState();
    }
}

/**
 * Copy GM title and images into the player section
 */
async function showPlayersFromGm() {
    if (!isGM) {
        UIKit.toast('Only the GM can share details with the players.', 'warning');
        return;
    }

    const gmTitleInput = document.getElementById('gm-title');
    const playerTitleInput = document.getElementById('player-title');
    const gmTitle = gmTitleInput ? gmTitleInput.value : '';

    if (playerTitleInput) {
        playerTitleInput.value = gmTitle;
    }

    if (!currentHexData.player) {
        currentHexData.player = { title: '', images: [], notes: '' };
    }
    currentHexData.player.title = gmTitle;

    await saveTitle('player');

    const gmImages = (currentHexData && currentHexData.gm && Array.isArray(currentHexData.gm.images))
        ? currentHexData.gm.images
        : [];

    if (gmImages.length > 0) {
        await useGmImagesForPlayers();
    }
}

/**
 * Handle image upload
 */
async function handleImageUpload(event, section) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('action', 'upload_image');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);
    formData.append('section', section);
    formData.append('image', file);
    
    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            // Reload hex data to show new image
            await loadHexData(currentHex.q, currentHex.r);

            // Refresh hex visual indicators
            if (window.mapInterface && window.mapInterface.hexGrid) {
                window.mapInterface.hexGrid.refreshHexStatus();
            }
        } else {
            UIKit.toast('Failed to upload image: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        UIKit.toast('Error uploading image', 'error');
    }

    // Clear the file input
    event.target.value = '';
}

/**
 * Open image lightbox
 */
function openLightbox(filename, section, index) {
    const lightbox = document.getElementById('image-lightbox');
    const image = document.getElementById('lightbox-image');

    image.src = `hex-images/${filename}`;
    lightbox.style.display = 'flex';

    // Store current image info for deletion
    currentImageForDelete = { filename, section, index };

    if (window.UIKit) {
        UIKit.openModal(lightbox, {
            onClose: () => {
                lightbox.style.display = 'none';
                currentImageForDelete = null;
            }
        });
    }
}

/**
 * Close image lightbox
 */
function closeLightbox() {
    const lightbox = document.getElementById('image-lightbox');
    if (window.UIKit) {
        UIKit.closeModal(lightbox);
    }
    if (lightbox && lightbox.style.display !== 'none') {
        lightbox.style.display = 'none';
        currentImageForDelete = null;
    }
}

/**
 * Delete current image in lightbox
 */
async function deleteCurrentImage() {
    if (!currentImageForDelete) return;

    const confirmed = await UIKit.confirm({
        title: 'Delete image',
        message: 'Are you sure you want to delete this image?',
        confirmText: 'Delete',
        danger: true
    });
    if (!confirmed || !currentImageForDelete) return;

    const formData = new FormData();
    formData.append('action', 'delete_image');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);
    formData.append('section', currentImageForDelete.section);
    formData.append('filename', currentImageForDelete.filename);

    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            closeLightbox();
            // Reload hex data to reflect deletion
            await loadHexData(currentHex.q, currentHex.r);

            // Refresh hex visual indicators
            if (window.mapInterface && window.mapInterface.hexGrid) {
                window.mapInterface.hexGrid.refreshHexStatus();
            }
            UIKit.toast('Image deleted.', 'success');
        } else {
            UIKit.toast('Failed to delete image: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        UIKit.toast('Error deleting image', 'error');
    }
}

/**
 * Toggle edit mode for player notes
 */
async function toggleEdit(section) {
    const editBtn = document.getElementById(`${section}-edit-btn`);
    const textarea = document.getElementById(`${section}-notes`);
    const status = document.getElementById(`${section}-edit-status`);
    
    if (textarea.hasAttribute('readonly')) {
        // Try to acquire edit lock
        const formData = new FormData();
        formData.append('action', 'lock_edit');
        formData.append('q', currentHex.q);
        formData.append('r', currentHex.r);
        formData.append('section', section);

        try {
            const response = await hexFetch('hex-data-handler.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.success) {
                // Enable editing
                textarea.removeAttribute('readonly');
                editBtn.textContent = 'Stop Editing';
                editBtn.classList.add('editing');
                status.textContent = 'You are editing';
                currentEditLock = section;
            } else {
                status.textContent = result.error;
                setTimeout(() => {
                    updateEditLockStatus();
                }, 3000);
            }
        } catch (error) {
            console.error('Error acquiring edit lock:', error);
        }
    } else {
        // Release edit lock
        await releaseEditLock();
    }
}

/**
 * Release edit lock
 */
async function releaseEditLock() {
    if (!currentEditLock) return;
    
    const formData = new FormData();
    formData.append('action', 'unlock_edit');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);

    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            // Disable editing
            const textarea = document.getElementById(`${currentEditLock}-notes`);
            const editBtn = document.getElementById(`${currentEditLock}-edit-btn`);
            
            textarea.setAttribute('readonly', true);
            editBtn.textContent = 'Edit';
            editBtn.classList.remove('editing');
            
            currentEditLock = null;
            updateEditLockStatus();
        }
    } catch (error) {
        console.error('Error releasing edit lock:', error);
    }
}

/**
 * Update edit lock status display
 */
function updateEditLockStatus() {
    const status = document.getElementById('player-edit-status');
    const editingInfo = currentHexData.editing;
    
    if (editingInfo && editingInfo.user && editingInfo.user !== currentUser) {
        status.textContent = `${editingInfo.user} is editing`;
    } else {
        status.textContent = '';
    }
}

/**
 * Save hex data
 */
async function saveHexData() {
    // Save everything in a single atomic request to prevent race conditions
    const saveBtn = document.getElementById('hex-save-btn');
    const formData = new FormData();
    formData.append('action', 'save_all');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);
    formData.append('player_title', document.getElementById('player-title').value);
    formData.append('player_notes', document.getElementById('player-notes').value);

    if (isGM) {
        formData.append('gm_title', document.getElementById('gm-title').value);
        formData.append('gm_notes', document.getElementById('gm-notes').value);
    }

    UIKit.setLoading(saveBtn, true, 'Saving...');
    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (!result.success) {
            console.error('Failed to save hex data:', result.error);
            UIKit.toast('Failed to save hex data: ' + (result.error || 'Unknown error'), 'error');
            return;
        }
    } catch (error) {
        console.error('Error saving hex data:', error);
        UIKit.toast('Error saving hex data', 'error');
        return;
    } finally {
        UIKit.setLoading(saveBtn, false);
    }

    // Refresh hex visual indicators
    if (window.mapInterface && window.mapInterface.hexGrid) {
        window.mapInterface.hexGrid.refreshHexStatus();
        window.mapInterface.hexGrid.loadAllHexData(); // Refresh tooltip data
    }

    UIKit.toast('Hex data saved!', 'success');
}

/**
 * Save notes for a section
 */
async function saveNotes(section) {
    const textarea = document.getElementById(`${section}-notes`);
    const notes = textarea.value;

    const formData = new FormData();
    formData.append('action', 'save_notes');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);
    formData.append('section', section);
    formData.append('notes', notes);

    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (!result.success) {
            console.error('Failed to save notes:', result.error);
        }
    } catch (error) {
        console.error('Error saving notes:', error);
    }
}

/**
 * Save title for a section
 */
async function saveTitle(section) {
    const titleInput = document.getElementById(`${section}-title`);
    const title = titleInput.value;
    
    const formData = new FormData();
    formData.append('action', 'save_title');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);
    formData.append('section', section);
    formData.append('title', title);

    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (!result.success) {
            console.error('Failed to save title:', result.error);
        }
    } catch (error) {
        console.error('Error saving title:', error);
    }
}

/**
 * Reset hex data (GM only)
 */
async function resetHexData() {
    if (!isGM) {
        UIKit.toast('Only GM can reset hex data', 'warning');
        return;
    }

    const confirmed = await UIKit.confirm({
        title: 'Reset Hex Data',
        message: `This permanently deletes ALL data for hex (${currentHex.q}, ${currentHex.r}): ` +
            'all player notes and images, all GM notes and images, and all uploaded files. ' +
            'This action cannot be undone.',
        confirmText: 'Reset Everything',
        danger: true
    });
    if (!confirmed) return;

    const formData = new FormData();
    formData.append('action', 'reset_hex');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);

    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            // Close hex popup
            closeHexPopup();

            // Refresh hex visual indicators
            if (window.mapInterface && window.mapInterface.hexGrid) {
                window.mapInterface.hexGrid.refreshHexStatus();
            }

            UIKit.toast('Hex data has been reset successfully!', 'success');
        } else {
            UIKit.toast('Failed to reset hex data: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error resetting hex data:', error);
        UIKit.toast('Error resetting hex data', 'error');
    }
}

/**
 * Start copy mode
 */
function startCopyMode() {
    if (!isGM) {
        UIKit.toast('Only GM can copy hex data', 'warning');
        return;
    }
    
    // Close current popup
    closeHexPopup();
    
    // Start copy mode on hex grid
    if (window.mapInterface && window.mapInterface.hexGrid) {
        window.mapInterface.hexGrid.startCopyMode();
        
        // Show instructions
        showCopyInstructions();
    }
}

/**
 * Show copy instructions overlay
 */
function showCopyInstructions() {
    const instructionsHTML = `
        <div id="copy-instructions" class="map-copy-banner">
            <div class="map-copy-banner-title">Copy Mode Active</div>
            <div class="map-copy-banner-step">1. Click source hex with data to copy</div>
            <div class="map-copy-banner-step">2. Click target hex to receive the data</div>
            <div class="map-copy-banner-cancel">
                <button onclick="cancelCopyMode()" class="uik-btn">Cancel (ESC)</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', instructionsHTML);

    // Listen for ESC key
    document.addEventListener('keydown', handleCopyModeEscape);
}

/**
 * Handle ESC key during copy mode
 */
function handleCopyModeEscape(event) {
    if (event.key === 'Escape') {
        cancelCopyMode();
    }
}

/**
 * Cancel copy mode
 */
function cancelCopyMode() {
    // Remove instructions
    const instructions = document.getElementById('copy-instructions');
    if (instructions) {
        instructions.remove();
    }
    
    // Remove ESC key listener
    document.removeEventListener('keydown', handleCopyModeEscape);
    
    // End copy mode on hex grid
    if (window.mapInterface && window.mapInterface.hexGrid) {
        window.mapInterface.hexGrid.endCopyMode();
    }
}

/**
 * Show copy dialog (called from hex grid)
 */
function showCopyDialog(sourceQ, sourceR, targetQ, targetR) {
    // Remove instructions
    const instructions = document.getElementById('copy-instructions');
    if (instructions) {
        instructions.remove();
    }
    
    const copyDialogHTML = `
        <div id="copy-dialog" class="map-dialog-overlay">
            <div class="map-dialog">
                <h3>Copy Hex Data</h3>
                <p>
                    Copy data from <strong>Hex (${sourceQ}, ${sourceR})</strong> to <strong>Hex (${targetQ}, ${targetR})</strong>
                </p>

                <div class="map-dialog-options">
                    <h4>What to copy:</h4>

                    <label>
                        <input type="checkbox" id="copy-player-data" checked>
                        Player Data (visible to all players)
                    </label>

                    <div class="map-dialog-suboptions">
                        <label>
                            <input type="checkbox" id="copy-player-notes" checked>
                            Player Notes
                        </label>
                        <label>
                            <input type="checkbox" id="copy-player-images" checked>
                            Player Images
                        </label>
                    </div>

                    <label>
                        <input type="checkbox" id="copy-gm-data" checked>
                        GM Data (visible only to GM)
                    </label>

                    <div class="map-dialog-suboptions">
                        <label>
                            <input type="checkbox" id="copy-gm-notes" checked>
                            GM Notes
                        </label>
                        <label>
                            <input type="checkbox" id="copy-gm-images" checked>
                            GM Images
                        </label>
                    </div>
                </div>

                <div class="map-dialog-buttons">
                    <button onclick="cancelCopy()" class="uik-btn">Cancel</button>
                    <button onclick="executeCopy(${sourceQ}, ${sourceR}, ${targetQ}, ${targetR})" class="uik-btn uik-btn--primary">
                        Copy Data
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', copyDialogHTML);
    
    // Update checkbox dependencies
    const playerDataCheck = document.getElementById('copy-player-data');
    const playerNotesCheck = document.getElementById('copy-player-notes');
    const playerImagesCheck = document.getElementById('copy-player-images');
    const gmDataCheck = document.getElementById('copy-gm-data');
    const gmNotesCheck = document.getElementById('copy-gm-notes');
    const gmImagesCheck = document.getElementById('copy-gm-images');
    
    playerDataCheck.addEventListener('change', function() {
        playerNotesCheck.disabled = !this.checked;
        playerImagesCheck.disabled = !this.checked;
        if (!this.checked) {
            playerNotesCheck.checked = false;
            playerImagesCheck.checked = false;
        } else {
            playerNotesCheck.checked = true;
            playerImagesCheck.checked = true;
        }
    });
    
    gmDataCheck.addEventListener('change', function() {
        gmNotesCheck.disabled = !this.checked;
        gmImagesCheck.disabled = !this.checked;
        if (!this.checked) {
            gmNotesCheck.checked = false;
            gmImagesCheck.checked = false;
        } else {
            gmNotesCheck.checked = true;
            gmImagesCheck.checked = true;
        }
    });
}

/**
 * Execute the copy operation
 */
async function executeCopy(sourceQ, sourceR, targetQ, targetR) {
    const copyPlayerData = document.getElementById('copy-player-data').checked;
    const copyPlayerNotes = document.getElementById('copy-player-notes').checked;
    const copyPlayerImages = document.getElementById('copy-player-images').checked;
    const copyGMData = document.getElementById('copy-gm-data').checked;
    const copyGMNotes = document.getElementById('copy-gm-notes').checked;
    const copyGMImages = document.getElementById('copy-gm-images').checked;
    
    const formData = new FormData();
    formData.append('action', 'duplicate_hex');
    formData.append('source_q', sourceQ);
    formData.append('source_r', sourceR);
    formData.append('q', targetQ);
    formData.append('r', targetR);
    formData.append('copy_player_data', copyPlayerData);
    formData.append('copy_player_notes', copyPlayerNotes);
    formData.append('copy_player_images', copyPlayerImages);
    formData.append('copy_gm_data', copyGMData);
    formData.append('copy_gm_notes', copyGMNotes);
    formData.append('copy_gm_images', copyGMImages);

    try {
        const response = await hexFetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            // Remove copy dialog
            document.getElementById('copy-dialog').remove();

            // End copy mode
            if (window.mapInterface && window.mapInterface.hexGrid) {
                window.mapInterface.hexGrid.endCopyMode();
                window.mapInterface.hexGrid.refreshHexStatus();
            }

            UIKit.toast(`Data copied from hex (${sourceQ}, ${sourceR}) to hex (${targetQ}, ${targetR})!`, 'success');
        } else {
            UIKit.toast('Failed to copy hex data: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error copying hex data:', error);
        UIKit.toast('Error copying hex data', 'error');
    }
}

/**
 * Cancel copy dialog
 */
function cancelCopy() {
    document.getElementById('copy-dialog').remove();
    
    // End copy mode
    if (window.mapInterface && window.mapInterface.hexGrid) {
        window.mapInterface.hexGrid.endCopyMode();
    }
}

// Make showCopyDialog globally available
window.showCopyDialog = showCopyDialog;

/**
 * Hide the hex popup and reset its state.
 * Used as the UIKit.openModal onClose handler; call closeHexPopup()
 * instead so focus restore and Esc handling are torn down too.
 */
function hexPopupCleanup() {
    // Release any edit locks
    if (currentEditLock) {
        releaseEditLock();
    }

    // Hide popup
    document.getElementById('hex-popup').style.display = 'none';

    // Reset state
    currentHex = { q: 0, r: 0 };
    currentHexData = {};
    currentEditLock = null;
}

/**
 * Close hex popup and cleanup
 */
function closeHexPopup() {
    const popup = document.getElementById('hex-popup');
    if (window.UIKit) {
        UIKit.closeModal(popup); // runs hexPopupCleanup via onClose
    }
    if (popup && popup.style.display !== 'none') {
        hexPopupCleanup();
    }
}

window.hexPopupCleanup = hexPopupCleanup;

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHexPopup);
} else {
    initHexPopup();
}
