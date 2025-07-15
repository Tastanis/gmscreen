// Global functions for inventory management

// Load inventory data from server
function loadInventoryData() {
    showStatus('Loading inventory...', 'loading');
    
    fetch('save_inventory.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'action=load'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            inventoryData = data.data;
            renderAllTabs();
            hideStatus();
        } else {
            showStatus('Error loading inventory: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showStatus('Network error loading inventory', 'error');
    });
}

// Render all tabs
function renderAllTabs() {
    visibleTabs.forEach(tab => {
        renderInventoryGrid(tab);
    });
}

// Render inventory grid for a specific tab
function renderInventoryGrid(tab) {
    const grid = document.getElementById(`grid-${tab}`);
    const countElement = document.getElementById(`item-count-${tab}`);
    
    if (!grid || !inventoryData[tab]) return;
    
    const items = inventoryData[tab].items || [];
    grid.innerHTML = '';
    
    let visibleCount = 0;
    
    items.forEach((item, index) => {
        const card = createItemCard(item, index, tab);
        grid.appendChild(card);
        
        // Count visible items (for non-GM users, only count visible items)
        if (isGM || item.visible) {
            visibleCount++;
        }
    });
    
    // Update item count (show visible count for non-GM, total count for GM)
    if (countElement) {
        if (isGM) {
            const hiddenCount = items.filter(item => !item.visible).length;
            const totalCount = items.length;
            if (hiddenCount > 0) {
                countElement.textContent = `${totalCount} item${totalCount !== 1 ? 's' : ''} (${hiddenCount} hidden)`;
            } else {
                countElement.textContent = `${totalCount} item${totalCount !== 1 ? 's' : ''}`;
            }
        } else {
            countElement.textContent = `${visibleCount} item${visibleCount !== 1 ? 's' : ''}`;
        }
    }
    
    updatePermissions();
}

// Create an item card element
function createItemCard(item, index, tab) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.setAttribute('data-item-id', item.id);
    card.setAttribute('data-index', index);
    card.setAttribute('data-tab', tab);
    
    // Handle visibility for non-GM users - hide completely
    if (!isGM && !item.visible) {
        card.style.display = 'none';
        return card;
    }
    
    // Add hidden styling for GM when item is hidden
    if (isGM && !item.visible) {
        card.classList.add('item-hidden');
    }
    
    card.innerHTML = `
        <div class="item-card-header">
            <div class="item-name">${escapeHtml(item.name || 'Unnamed Item')}</div>
            ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" class="item-image-small">` : ''}
        </div>
        
        <div class="item-details">
            ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" class="item-image-large">` : ''}
            
            <div class="item-field">
                <label>Name:</label>
                ${canEditTab(tab) ? 
                    `<input type="text" value="${escapeHtml(item.name || '')}" onchange="updateItemField('${tab}', ${index}, 'name', this.value)">` :
                    `<div class="readonly-field">${escapeHtml(item.name || '')}</div>`
                }
            </div>
            
            <div class="item-field">
                <label>Description:</label>
                ${canEditTab(tab) ? 
                    `<textarea onchange="updateItemField('${tab}', ${index}, 'description', this.value)">${escapeHtml(item.description || '')}</textarea>` :
                    `<div class="readonly-field readonly-textarea">${escapeHtml(item.description || '')}</div>`
                }
            </div>
            
            <div class="item-field">
                <label>Keywords:</label>
                ${canEditTab(tab) ? 
                    `<input type="text" value="${escapeHtml(item.keywords || '')}" onchange="updateItemField('${tab}', ${index}, 'keywords', this.value)">` :
                    `<div class="readonly-field">${escapeHtml(item.keywords || '')}</div>`
                }
            </div>
            
            <div class="item-field">
                <label>Effect:</label>
                ${canEditTab(tab) ? 
                    `<textarea onchange="updateItemField('${tab}', ${index}, 'effect', this.value)">${escapeHtml(item.effect || '')}</textarea>` :
                    `<div class="readonly-field readonly-textarea">${escapeHtml(item.effect || '')}</div>`
                }
            </div>
            
            <div class="card-actions">
                ${canEditTab(tab) ? `
                    <button class="btn-upload" onclick="uploadImage('${item.id}')">
                        ${item.image ? 'Change Image' : 'Add Image'}
                    </button>
                    ${isGM ? `
                        <button class="btn-visibility" onclick="toggleItemVisibility('${tab}', ${index})">
                            ${item.visible ? 'Hide' : 'Show'}
                        </button>
                    ` : ''}
                    ${(tab === currentUser) ? `
                        <button class="btn-share" onclick="shareItem('${tab}', ${index})">
                            ${isGM ? 'Share to GM' : 'Share'}
                        </button>
                    ` : ''}
                    <button class="btn-delete" onclick="deleteItem('${tab}', ${index})">Delete</button>
                ` : ''}
                ${!isGM && (tab === 'gm' || tab === 'shared') ? `
                    <button class="btn-take" onclick="takeItem('${tab}', ${index})">Take Item</button>
                ` : ''}
                <button class="btn-close" onclick="collapseCard(this)">Collapse</button>
            </div>
        </div>
    `;
    
    // Add click handler to expand card
    card.addEventListener('click', function(e) {
        // Don't expand if clicking on an input/button
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') {
            return;
        }
        expandCard(this);
    });
    
    return card;
}

// Check if user can edit a specific tab
function canEditTab(tab) {
    if (isGM) return true;
    if (tab === currentUser) return true;
    if (tab === 'shared') return true;
    return false; // GM tab is read-only for players
}

// Expand a card to show details
function expandCard(card) {
    // Collapse any currently expanded card
    if (expandedCard && expandedCard !== card) {
        expandedCard.classList.remove('expanded');
    }
    
    card.classList.add('expanded');
    expandedCard = card;
    
    // Scroll the card into view
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Collapse a card
function collapseCard(button) {
    const card = button.closest('.item-card');
    card.classList.remove('expanded');
    if (expandedCard === card) {
        expandedCard = null;
    }
}

// Switch between tabs
function switchTab(tab) {
    currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.inventory-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.inventory-tab[data-tab="${tab}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    // Collapse any expanded card when switching tabs
    if (expandedCard) {
        expandedCard.classList.remove('expanded');
        expandedCard = null;
    }
    
    updatePermissions();
}

// Add a new item
function addNewItem(tab) {
    if (!canEditTab(tab)) {
        showStatus('Permission denied', 'error');
        return;
    }
    
    const newItem = {
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: 'New Item',
        description: '',
        keywords: '',
        effect: '',
        image: '',
        grid_x: 0,
        grid_y: 0,
        visible: true
    };
    
    // Ensure tab structure exists
    if (!inventoryData[tab]) {
        inventoryData[tab] = { items: [] };
    }
    if (!inventoryData[tab].items) {
        inventoryData[tab].items = [];
    }
    
    inventoryData[tab].items.push(newItem);
    
    // Save to server
    const index = inventoryData[tab].items.length - 1;
    saveItem(tab, index, newItem, function() {
        renderInventoryGrid(tab);
        
        // Find and expand the new card
        setTimeout(() => {
            const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
            if (newCard) {
                expandCard(newCard);
            }
        }, 100);
    });
}

// Update a specific field of an item
function updateItemField(tab, index, field, value) {
    if (!canEditTab(tab)) {
        showStatus('Permission denied', 'error');
        return;
    }
    
    // Clear any existing timeout
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    // Update local data
    if (inventoryData[tab] && inventoryData[tab].items[index]) {
        inventoryData[tab].items[index][field] = value;
        
        // Auto-save after a short delay
        saveTimeout = setTimeout(() => {
            updateItemFieldOnServer(tab, index, field, value);
        }, 1000);
    }
}

// Save item field to server
function updateItemFieldOnServer(tab, index, field, value) {
    fetch('save_inventory.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=update_item_field&tab=${encodeURIComponent(tab)}&index=${index}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            showStatus('Error saving: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showStatus('Network error saving field', 'error');
    });
}

// Save entire item to server
function saveItem(tab, index, itemData, callback) {
    showStatus('Saving item...', 'loading');
    
    fetch('save_inventory.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=save_item&tab=${encodeURIComponent(tab)}&index=${index}&item_data=${encodeURIComponent(JSON.stringify(itemData))}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus('Item saved successfully', 'success');
            if (callback) callback();
        } else {
            showStatus('Error saving item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showStatus('Network error saving item', 'error');
    });
}

// Delete an item
function deleteItem(tab, index) {
    if (!canEditTab(tab)) {
        showStatus('Permission denied', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }
    
    showStatus('Deleting item...', 'loading');
    
    fetch('save_inventory.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=delete_item&tab=${encodeURIComponent(tab)}&index=${index}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus('Item deleted successfully', 'success');
            
            // Remove from local data
            if (inventoryData[tab] && inventoryData[tab].items) {
                inventoryData[tab].items.splice(index, 1);
            }
            
            // Re-render the grid
            renderInventoryGrid(tab);
            
            // Clear expanded card if it was the deleted one
            if (expandedCard) {
                expandedCard = null;
            }
        } else {
            showStatus('Error deleting item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showStatus('Network error deleting item', 'error');
    });
}

// Share an item from player's inventory to shared folder (or GM folder for GM)
function shareItem(fromTab, index) {
    if (fromTab !== currentUser) return; // Only from player's own inventory
    
    const item = inventoryData[fromTab].items[index];
    if (!item) {
        showStatus('Item not found', 'error');
        return;
    }
    
    const targetFolder = isGM ? 'GM folder' : 'shared folder';
    const targetTab = isGM ? 'gm' : 'shared';
    
    if (!confirm(`Share "${item.name}" to ${targetFolder}?`)) {
        return;
    }
    
    showStatus('Sharing item...', 'loading');
    
    // Use the new share_item server action
    fetch('save_inventory.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=share_item&from_tab=${encodeURIComponent(fromTab)}&index=${index}&to_tab=${encodeURIComponent(targetTab)}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(`"${item.name}" shared to ${targetFolder}`, 'success');
            
            // Update local data - remove from source
            if (inventoryData[fromTab] && inventoryData[fromTab].items) {
                inventoryData[fromTab].items.splice(index, 1);
            }
            
            // Add to target folder in local data
            const newItem = data.new_item;
            const toTab = data.to_tab;
            if (!inventoryData[toTab]) {
                inventoryData[toTab] = { items: [] };
            }
            if (!inventoryData[toTab].items) {
                inventoryData[toTab].items = [];
            }
            inventoryData[toTab].items.push(newItem);
            
            // Re-render both tabs
            renderInventoryGrid(fromTab);
            renderInventoryGrid(toTab);
            
            // Switch to target tab to show the shared item
            if (currentTab !== toTab) {
                setTimeout(() => {
                    switchTab(toTab);
                    // Find and expand the new item
                    setTimeout(() => {
                        const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                        if (newCard) {
                            expandCard(newCard);
                        }
                    }, 100);
                }, 500);
            } else {
                // If already on target tab, just expand the new item
                setTimeout(() => {
                    const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                    if (newCard) {
                        expandCard(newCard);
                    }
                }, 100);
            }
            
            // Clear expanded card if it was the shared item
            if (expandedCard) {
                expandedCard = null;
            }
        } else {
            showStatus('Error sharing item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showStatus('Network error sharing item', 'error');
    });
}

// Take an item from GM or shared section to player's inventory
function takeItem(fromTab, index) {
    if (isGM) return; // GM doesn't need to take items
    if (fromTab !== 'gm' && fromTab !== 'shared') return; // Only from GM or shared
    
    const item = inventoryData[fromTab].items[index];
    if (!item) {
        showStatus('Item not found', 'error');
        return;
    }
    
    if (!confirm(`Take "${item.name}" to your inventory?`)) {
        return;
    }
    
    showStatus('Taking item...', 'loading');
    
    // Use the new take_item server action
    fetch('save_inventory.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=take_item&from_tab=${encodeURIComponent(fromTab)}&index=${index}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(`"${item.name}" taken to your inventory`, 'success');
            
            // Update local data - remove from source
            if (inventoryData[fromTab] && inventoryData[fromTab].items) {
                inventoryData[fromTab].items.splice(index, 1);
            }
            
            // Add to player's inventory in local data
            const newItem = data.new_item;
            if (!inventoryData[currentUser]) {
                inventoryData[currentUser] = { items: [] };
            }
            if (!inventoryData[currentUser].items) {
                inventoryData[currentUser].items = [];
            }
            inventoryData[currentUser].items.push(newItem);
            
            // Re-render both tabs
            renderInventoryGrid(fromTab);
            renderInventoryGrid(currentUser);
            
            // Switch to player's tab to show the new item
            if (currentTab !== currentUser) {
                setTimeout(() => {
                    switchTab(currentUser);
                    // Find and expand the new item
                    setTimeout(() => {
                        const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                        if (newCard) {
                            expandCard(newCard);
                        }
                    }, 100);
                }, 500);
            } else {
                // If already on player's tab, just expand the new item
                setTimeout(() => {
                    const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                    if (newCard) {
                        expandCard(newCard);
                    }
                }, 100);
            }
            
            // Clear expanded card if it was the taken item
            if (expandedCard) {
                expandedCard = null;
            }
        } else {
            showStatus('Error taking item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showStatus('Network error taking item', 'error');
    });
}
function toggleItemVisibility(tab, index) {
    if (!isGM) return;
    
    const item = inventoryData[tab].items[index];
    const newVisibility = !item.visible;
    
    showStatus(newVisibility ? 'Hiding item...' : 'Showing item...', 'loading');
    
    // Update local data immediately
    inventoryData[tab].items[index].visible = newVisibility;
    
    // Save to server
    fetch('save_inventory.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=update_item_field&tab=${encodeURIComponent(tab)}&index=${index}&field=visible&value=${newVisibility ? 'true' : 'false'}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(newVisibility ? 'Item hidden successfully' : 'Item shown successfully', 'success');
            
            // Find the current card and update it
            const currentCard = document.querySelector(`[data-item-id="${item.id}"]`);
            const wasExpanded = currentCard && currentCard.classList.contains('expanded');
            
            // Re-render the grid to update all cards
            renderInventoryGrid(tab);
            
            // If the card was expanded, expand it again after re-rendering
            if (wasExpanded) {
                setTimeout(() => {
                    const newCard = document.querySelector(`[data-item-id="${item.id}"]`);
                    if (newCard && newCard.style.display !== 'none') {
                        expandCard(newCard);
                    }
                }, 50);
            }
        } else {
            // Revert local change if save failed
            inventoryData[tab].items[index].visible = !newVisibility;
            showStatus('Error updating visibility: ' + data.error, 'error');
        }
    })
    .catch(error => {
        // Revert local change if save failed
        inventoryData[tab].items[index].visible = !newVisibility;
        console.error('Error:', error);
        showStatus('Network error updating visibility', 'error');
    });
}

// Upload image for an item
function uploadImage(itemId) {
    currentUploadItemId = itemId;
    document.getElementById('image-upload').click();
}

// Handle image upload
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showStatus('Invalid file type. Please select a JPG, PNG, GIF, BMP, or WebP image.', 'error');
        return;
    }
    
    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showStatus('File too large. Maximum size is 5MB.', 'error');
        return;
    }
    
    showStatus('Uploading image...', 'loading');
    
    const formData = new FormData();
    formData.append('action', 'upload_image');
    formData.append('item_id', currentUploadItemId);
    formData.append('image', file);
    
    fetch('upload_item_image.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus('Image uploaded successfully', 'success');
            
            // Update local data
            const tab = data.tab;
            const itemIndex = inventoryData[tab].items.findIndex(item => item.id === currentUploadItemId);
            if (itemIndex !== -1) {
                inventoryData[tab].items[itemIndex].image = data.image_path;
                renderInventoryGrid(tab);
            }
        } else {
            showStatus('Error uploading image: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showStatus('Network error uploading image', 'error');
    });
    
    // Clear the file input
    event.target.value = '';
}

// Update permissions based on current tab
function updatePermissions() {
    visibleTabs.forEach(tab => {
        const addBtn = document.getElementById(`add-btn-${tab}`);
        if (addBtn) {
            addBtn.disabled = !canEditTab(tab);
        }
    });
}

// Auto-save setup
function setupAutoSave() {
    // Auto-save is handled by individual field updates
    // This function can be extended if needed
}

// Show status message
function showStatus(message, type) {
    // Remove any existing status messages
    hideStatus();
    
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
    statusDiv.id = 'current-status';
    
    document.body.appendChild(statusDiv);
    
    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
        setTimeout(hideStatus, 3000);
    }
}

// Hide status message
function hideStatus() {
    const existing = document.getElementById('current-status');
    if (existing) {
        existing.remove();
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}