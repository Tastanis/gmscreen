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
    try {
        const formData = new FormData();
        formData.append('action', 'load');
        formData.append('q', q);
        formData.append('r', r);
        
        const response = await fetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.success) {
            currentHexData = result.data;
            populateHexData();
        } else {
            console.error('Failed to load hex data:', result.error);
            // Initialize with empty data
            currentHexData = {
                player: { title: '', images: [], notes: '' },
                editing: { user: '', timestamp: '', section: '' }
            };
            if (isGM) {
                currentHexData.gm = { title: '', images: [], notes: '' };
            }
            populateHexData();
        }
    } catch (error) {
        console.error('Error loading hex data:', error);
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
        gallery.innerHTML = '<div style="color: #aaa; text-align: center; padding: 20px;">No images uploaded</div>';
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
        alert('Only the GM can share images with the players.');
        return;
    }

    const gmImages = (currentHexData && currentHexData.gm && Array.isArray(currentHexData.gm.images))
        ? currentHexData.gm.images
        : [];

    if (gmImages.length === 0) {
        alert('Upload a GM image before sharing it with the players.');
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
        const response = await fetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            await loadHexData(currentHex.q, currentHex.r);

            if (window.mapInterface && window.mapInterface.hexGrid) {
                window.mapInterface.hexGrid.refreshHexStatus();
            }
        } else {
            const errorMessage = result.error ? `Failed to share image: ${result.error}` : 'Failed to share image.';
            alert(errorMessage);
        }
    } catch (error) {
        console.error('Error sharing GM image:', error);
        alert('Error sharing GM image with players.');
    } finally {
        updateShareButtonState();
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
        const response = await fetch('hex-data-handler.php', {
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
            alert('Failed to upload image: ' + result.error);
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        alert('Error uploading image');
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
}

/**
 * Close image lightbox
 */
function closeLightbox() {
    document.getElementById('image-lightbox').style.display = 'none';
    currentImageForDelete = null;
}

/**
 * Delete current image in lightbox
 */
async function deleteCurrentImage() {
    if (!currentImageForDelete) return;
    
    if (!confirm('Are you sure you want to delete this image?')) return;
    
    const formData = new FormData();
    formData.append('action', 'delete_image');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);
    formData.append('section', currentImageForDelete.section);
    formData.append('filename', currentImageForDelete.filename);
    
    try {
        const response = await fetch('hex-data-handler.php', {
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
        } else {
            alert('Failed to delete image: ' + result.error);
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        alert('Error deleting image');
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
            const response = await fetch('hex-data-handler.php', {
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
        const response = await fetch('hex-data-handler.php', {
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
    // Save player notes and title
    await saveNotes('player');
    await saveTitle('player');
    
    // Save GM notes and title if GM
    if (isGM) {
        await saveNotes('gm');
        await saveTitle('gm');
    }
    
    // Refresh hex visual indicators
    if (window.mapInterface && window.mapInterface.hexGrid) {
        window.mapInterface.hexGrid.refreshHexStatus();
        window.mapInterface.hexGrid.loadAllHexData(); // Refresh tooltip data
    }
    
    alert('Hex data saved!');
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
        const response = await fetch('hex-data-handler.php', {
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
        const response = await fetch('hex-data-handler.php', {
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
        alert('Only GM can reset hex data');
        return;
    }
    
    // Create custom confirmation dialog
    const confirmationHTML = `
        <div id="reset-confirmation" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 3000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
            <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3); max-width: 500px; text-align: center; color: #2c3e50;">
                <h3 style="color: #e74c3c; margin-top: 0;">⚠️ Warning: Reset Hex Data</h3>
                <p style="margin: 20px 0; font-size: 16px; line-height: 1.5;">
                    This will permanently delete <strong>ALL data</strong> for hex (${currentHex.q}, ${currentHex.r}), including:
                </p>
                <ul style="text-align: left; margin: 20px 0; padding-left: 20px;">
                    <li>All player notes and images</li>
                    <li>All GM notes and images</li>
                    <li>All uploaded files</li>
                </ul>
                <p style="color: #e74c3c; font-weight: bold; margin: 20px 0;">
                    This action cannot be undone!
                </p>
                <div style="margin-top: 30px;">
                    <button onclick="confirmReset()" style="background: #e74c3c; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 0 10px; font-weight: 500; font-size: 16px;">
                        Yes, Reset Everything
                    </button>
                    <button onclick="cancelReset()" style="background: #95a5a6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 0 10px; font-weight: 500; font-size: 16px;">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add confirmation dialog to page
    document.body.insertAdjacentHTML('beforeend', confirmationHTML);
}

/**
 * Confirm hex reset
 */
async function confirmReset() {
    const formData = new FormData();
    formData.append('action', 'reset_hex');
    formData.append('q', currentHex.q);
    formData.append('r', currentHex.r);
    
    try {
        const response = await fetch('hex-data-handler.php', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.success) {
            // Remove confirmation dialog
            document.getElementById('reset-confirmation').remove();
            
            // Close hex popup
            closeHexPopup();
            
            // Refresh hex visual indicators
            if (window.mapInterface && window.mapInterface.hexGrid) {
                window.mapInterface.hexGrid.refreshHexStatus();
            }
            
            alert('Hex data has been reset successfully!');
        } else {
            alert('Failed to reset hex data: ' + result.error);
        }
    } catch (error) {
        console.error('Error resetting hex data:', error);
        alert('Error resetting hex data');
    }
}

/**
 * Cancel hex reset
 */
function cancelReset() {
    document.getElementById('reset-confirmation').remove();
}

/**
 * Start copy mode
 */
function startCopyMode() {
    if (!isGM) {
        alert('Only GM can copy hex data');
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
        <div id="copy-instructions" style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(46, 204, 113, 0.95); color: white; padding: 15px 25px; border-radius: 10px; z-index: 2500; font-weight: 500; text-align: center; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);">
            <div style="font-size: 16px; margin-bottom: 8px;">📋 Copy Mode Active</div>
            <div style="font-size: 14px;">1. Click source hex with data to copy</div>
            <div style="font-size: 14px;">2. Click target hex to receive the data</div>
            <div style="margin-top: 10px;">
                <button onclick="cancelCopyMode()" style="background: rgba(255, 255, 255, 0.2); border: 1px solid white; color: white; padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 12px;">
                    Cancel (ESC)
                </button>
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
        <div id="copy-dialog" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 3000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
            <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3); max-width: 500px; text-align: center; color: #2c3e50;">
                <h3 style="color: #2ecc71; margin-top: 0;">📋 Copy Hex Data</h3>
                <p style="margin: 20px 0; font-size: 16px;">
                    Copy data from <strong>Hex (${sourceQ}, ${sourceR})</strong> to <strong>Hex (${targetQ}, ${targetR})</strong>
                </p>
                
                <div style="text-align: left; margin: 25px 0;">
                    <h4 style="margin-bottom: 15px;">What to copy:</h4>
                    
                    <label style="display: block; margin-bottom: 12px; font-size: 14px;">
                        <input type="checkbox" id="copy-player-data" checked style="margin-right: 8px;">
                        Player Data (visible to all players)
                    </label>
                    
                    <div style="margin-left: 20px; margin-bottom: 12px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #666;">
                            <input type="checkbox" id="copy-player-notes" checked style="margin-right: 8px;">
                            Player Notes
                        </label>
                        <label style="display: block; font-size: 13px; color: #666;">
                            <input type="checkbox" id="copy-player-images" checked style="margin-right: 8px;">
                            Player Images
                        </label>
                    </div>
                    
                    <label style="display: block; margin-bottom: 12px; font-size: 14px;">
                        <input type="checkbox" id="copy-gm-data" checked style="margin-right: 8px;">
                        GM Data (visible only to GM)
                    </label>
                    
                    <div style="margin-left: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 13px; color: #666;">
                            <input type="checkbox" id="copy-gm-notes" checked style="margin-right: 8px;">
                            GM Notes
                        </label>
                        <label style="display: block; font-size: 13px; color: #666;">
                            <input type="checkbox" id="copy-gm-images" checked style="margin-right: 8px;">
                            GM Images
                        </label>
                    </div>
                </div>
                
                <div style="margin-top: 30px;">
                    <button onclick="executeCopy(${sourceQ}, ${sourceR}, ${targetQ}, ${targetR})" style="background: #2ecc71; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 0 10px; font-weight: 500; font-size: 16px;">
                        Copy Data
                    </button>
                    <button onclick="cancelCopy()" style="background: #95a5a6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 0 10px; font-weight: 500; font-size: 16px;">
                        Cancel
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
    formData.append('copy_gm_data', copyGMData);
    formData.append('copy_notes', copyPlayerNotes || copyGMNotes);
    formData.append('copy_images', copyPlayerImages || copyGMImages);
    
    try {
        const response = await fetch('hex-data-handler.php', {
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
            
            alert(`Data successfully copied from hex (${sourceQ}, ${sourceR}) to hex (${targetQ}, ${targetR})!`);
        } else {
            alert('Failed to copy hex data: ' + result.error);
        }
    } catch (error) {
        console.error('Error copying hex data:', error);
        alert('Error copying hex data');
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
 * Close hex popup and cleanup
 */
function closeHexPopup() {
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

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHexPopup);
} else {
    initHexPopup();
}