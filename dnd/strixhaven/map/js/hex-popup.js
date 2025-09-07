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
                player: { images: [], notes: '' },
                editing: { user: '', timestamp: '', section: '' }
            };
            if (isGM) {
                currentHexData.gm = { images: [], notes: '' };
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
    
    // Populate GM section if user is GM
    if (isGM) {
        // Ensure GM data exists
        if (!currentHexData.gm) {
            currentHexData.gm = { images: [], notes: '' };
        }
        populateImages('gm', currentHexData.gm.images || []);
        document.getElementById('gm-notes').value = currentHexData.gm.notes || '';
    }
    
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

/**
 * Trigger image upload
 */
function uploadHexImage(section) {
    document.getElementById(`${section}-image-upload`).click();
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
    // Save player notes
    await saveNotes('player');
    
    // Save GM notes if GM
    if (isGM) {
        await saveNotes('gm');
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