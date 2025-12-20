// Integrated Inventory Management Functions for Dashboard

// Utility function to escape HTML to prevent XSS attacks
function escapeHtml(text) {
    if (typeof text !== 'string') {
        return '';
    }
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Load inventory data from server
function loadInventoryData() {
    showInventoryStatus('Loading inventory...', 'loading');
    
    fetch('dashboard.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'action=inventory_load'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            inventoryData = data.data;
            renderAllInventoryTabs();
            hideInventoryStatus();
        } else {
            showInventoryStatus('Error loading inventory: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showInventoryStatus('Network error loading inventory', 'error');
    });
}

// Render all inventory tabs
function renderAllInventoryTabs() {
    visibleInventoryTabs.forEach(tab => {
        renderInventoryGrid(tab);
    });
}

// Render inventory grid for a specific tab
function renderInventoryGrid(tab) {
    const grid = document.getElementById(`inventory-grid-${tab}`);
    const countElement = document.getElementById(`inventory-item-count-${tab}`);
    
    if (!grid || !inventoryData[tab]) return;
    
    const items = inventoryData[tab].items || [];
    grid.innerHTML = '';
    
    let visibleCount = 0;
    
    items.forEach((item, index) => {
        const card = createInventoryItemCard(item, index, tab);
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
    
    updateInventoryPermissions();
}

// Create an inventory item card element
function createInventoryItemCard(item, index, tab) {
    const card = document.createElement('div');
    card.className = 'inventory-item-card';
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
        <div class="inventory-item-card-header">
            <div class="inventory-item-name">${escapeHtml(item.name || 'Unnamed Item')}</div>
            ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" class="inventory-item-image-small" draggable="true">` : ''}
        </div>

        <div class="inventory-item-details">
            <div class="inventory-item-content">
                ${item.image ? `<div class="inventory-item-image-wrapper"><img src="${item.image}" alt="${escapeHtml(item.name)}" class="inventory-item-image-large" draggable="true"></div>` : ''}
                <div class="inventory-item-main">
                    <div class="inventory-item-field">
                        <label>Name:</label>
                        ${canEditInventoryTab(tab) ?
                            `<input type="text" value="${escapeHtml(item.name || '')}" onchange="updateInventoryItemField('${tab}', ${index}, 'name', this.value)">` :
                            `<div class="inventory-readonly-field">${escapeHtml(item.name || '')}</div>`
                        }
                    </div>

                    <div class="inventory-item-field description-field">
                        <label>Description:</label>
                        ${canEditInventoryTab(tab) ?
                            `<textarea onchange="updateInventoryItemField('${tab}', ${index}, 'description', this.value)">${escapeHtml(item.description || '')}</textarea>` :
                            `<div class="inventory-readonly-field readonly-textarea">${escapeHtml(item.description || '')}</div>`
                        }
                    </div>
                </div>
            </div>

            <div class="inventory-item-meta">
                <div class="inventory-item-field">
                    <label>Keywords:</label>
                    ${canEditInventoryTab(tab) ?
                        `<input type="text" value="${escapeHtml(item.keywords || '')}" onchange="updateInventoryItemField('${tab}', ${index}, 'keywords', this.value)">` :
                        `<div class="inventory-readonly-field">${escapeHtml(item.keywords || '')}</div>`
                    }
                </div>

                <div class="inventory-item-field">
                    <label>Effect:</label>
                    ${canEditInventoryTab(tab) ?
                        `<textarea onchange="updateInventoryItemField('${tab}', ${index}, 'effect', this.value)">${escapeHtml(item.effect || '')}</textarea>` :
                        `<div class="inventory-readonly-field readonly-textarea">${escapeHtml(item.effect || '')}</div>`
                    }
                </div>
            </div>

            <div class="inventory-card-actions">
                ${canEditInventoryTab(tab) ? `
                    <button class="btn-inventory-upload" onclick="uploadInventoryImage('${item.id}')">
                        ${item.image ? 'Change Image' : 'Add Image'}
                    </button>
                    ${isGM ? `
                        <button class="btn-inventory-visibility" onclick="toggleInventoryItemVisibility('${tab}', ${index})">
                            ${item.visible ? 'Hide' : 'Show'}
                        </button>
                        <button class="btn-inventory-duplicate" onclick="duplicateInventoryItem('${tab}', ${index})">Copy Item</button>
                    ` : ''}
                    ${(tab === currentUser) ? `
                        <button class="btn-inventory-share" onclick="shareInventoryItem('${tab}', ${index})">
                            ${isGM ? 'Share to GM' : 'Share'}
                        </button>
                    ` : ''}
                    <button class="btn-inventory-delete" onclick="deleteInventoryItem('${tab}', ${index})">Delete</button>
                ` : ''}
                ${!isGM && (tab === 'gm' || tab === 'shared') ? `
                    <button class="btn-inventory-take" onclick="takeInventoryItem('${tab}', ${index})">Take Item</button>
                ` : ''}
            </div>
        </div>
    `;
    
    // Add click handler to expand card
    card.addEventListener('click', function(e) {
        // Don't expand if clicking on an input/button
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL') {
            return;
        }
        if (!this.classList.contains('expanded')) {
            expandInventoryCard(this);
        }
    });

    const header = card.querySelector('.inventory-item-card-header');
    if (header) {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            if (card.classList.contains('expanded')) {
                collapseInventoryCard(card);
            } else {
                expandInventoryCard(card);
            }
        });
    }

    const dragImages = card.querySelectorAll('.inventory-item-image-small, .inventory-item-image-large');
    dragImages.forEach((img) => {
        if (!img || !img.getAttribute('src')) {
            return;
        }

        const url = img.getAttribute('src');
        if (typeof window.makeImageDraggable === 'function') {
            window.makeImageDraggable(img, url);
            return;
        }

        const absoluteUrl = (() => {
            try {
                return new URL(url, window.location.href).toString();
            } catch (error) {
                return url;
            }
        })();

        img.addEventListener('dragstart', (event) => {
            if (!event.dataTransfer) {
                return;
            }
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('text/uri-list', absoluteUrl);
            event.dataTransfer.setData('text/plain', absoluteUrl);
        });
    });

    return card;
}

// Check if user can edit a specific inventory tab
function canEditInventoryTab(tab) {
    if (isGM) return true;
    if (tab === currentUser) return true;
    if (tab === 'shared') return true;
    return false; // GM tab is read-only for players
}

// Expand an inventory card (and its row) to show details
function expandInventoryCard(card) {
    const targetRowTop = card.offsetTop;

    // Collapse any currently expanded row if it's different
    if (expandedInventoryCard && expandedInventoryCard !== card && expandedInventoryRowTop !== targetRowTop) {
        document.querySelectorAll('.inventory-item-card').forEach(rowCard => {
            if (expandedInventoryRowTop !== null && Math.abs(rowCard.offsetTop - expandedInventoryRowTop) < 2) {
                rowCard.classList.remove('expanded');
            }
        });
    }

    document.querySelectorAll('.inventory-item-card').forEach(rowCard => {
        if (Math.abs(rowCard.offsetTop - targetRowTop) < 2) {
            rowCard.classList.add('expanded');
        } else {
            rowCard.classList.remove('expanded');
        }
    });

    expandedInventoryCard = card;
    expandedInventoryRowTop = targetRowTop;

    // Scroll the card into view
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Collapse an inventory card row
function collapseInventoryCard(element) {
    const card = element.classList.contains('inventory-item-card') ? element : element.closest('.inventory-item-card');
    if (!card) return;

    const targetRowTop = card.offsetTop;
    document.querySelectorAll('.inventory-item-card').forEach(rowCard => {
        if (Math.abs(rowCard.offsetTop - targetRowTop) < 2) {
            rowCard.classList.remove('expanded');
        }
    });

    if (expandedInventoryCard && Math.abs(expandedInventoryCard.offsetTop - targetRowTop) < 2) {
        expandedInventoryCard = null;
        expandedInventoryRowTop = null;
    }
}

function clearExpandedInventoryState() {
    expandedInventoryCard = null;
    expandedInventoryRowTop = null;
    document.querySelectorAll('.inventory-item-card.expanded').forEach(card => card.classList.remove('expanded'));
}

// Switch between inventory tabs
function switchInventoryTab(tab) {
    currentInventoryTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.inventory-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.inventory-tab[data-tab="${tab}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.inventory-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`inventory-tab-${tab}`).classList.add('active');

    // Collapse any expanded card when switching tabs
    clearExpandedInventoryState();
    
    updateInventoryPermissions();
}

// Add a new inventory item
function addNewInventoryItem(tab) {
    if (!canEditInventoryTab(tab)) {
        showInventoryStatus('Permission denied', 'error');
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
    saveInventoryItem(tab, index, newItem, function() {
        renderInventoryGrid(tab);
        
        // Find and expand the new card
        setTimeout(() => {
            const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
            if (newCard) {
                expandInventoryCard(newCard);
            }
        }, 100);
    });
}

// Update a specific field of an inventory item
function updateInventoryItemField(tab, index, field, value) {
    if (!canEditInventoryTab(tab)) {
        showInventoryStatus('Permission denied', 'error');
        return;
    }
    
    // Clear any existing timeout
    if (inventorySaveTimeout) {
        clearTimeout(inventorySaveTimeout);
    }
    
    // Update local data
    if (inventoryData[tab] && inventoryData[tab].items[index]) {
        inventoryData[tab].items[index][field] = value;
        
        // Auto-save after a short delay
        inventorySaveTimeout = setTimeout(() => {
            updateInventoryItemFieldOnServer(tab, index, field, value);
        }, 1000);
    }
}

// Save inventory item field to server
function updateInventoryItemFieldOnServer(tab, index, field, value) {
    fetch('dashboard.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=inventory_update_item_field&tab=${encodeURIComponent(tab)}&index=${index}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            showInventoryStatus('Error saving: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showInventoryStatus('Network error saving field', 'error');
    });
}

// Save entire inventory item to server
function saveInventoryItem(tab, index, itemData, callback) {
    showInventoryStatus('Saving item...', 'loading');
    
    fetch('dashboard.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=inventory_save_item&tab=${encodeURIComponent(tab)}&index=${index}&item_data=${encodeURIComponent(JSON.stringify(itemData))}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showInventoryStatus('Item saved successfully', 'success');
            if (callback) callback();
        } else {
            showInventoryStatus('Error saving item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showInventoryStatus('Network error saving item', 'error');
    });
}

// Delete an inventory item
function deleteInventoryItem(tab, index) {
    if (!canEditInventoryTab(tab)) {
        showInventoryStatus('Permission denied', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }
    
    showInventoryStatus('Deleting item...', 'loading');
    
    fetch('dashboard.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=inventory_delete_item&tab=${encodeURIComponent(tab)}&index=${index}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showInventoryStatus('Item deleted successfully', 'success');
            
            // Remove from local data
            if (inventoryData[tab] && inventoryData[tab].items) {
                inventoryData[tab].items.splice(index, 1);
            }
            
            // Re-render the grid
            renderInventoryGrid(tab);
            
            // Clear expanded card if it was the deleted one
            if (expandedInventoryCard) {
                clearExpandedInventoryState();
            }
        } else {
            showInventoryStatus('Error deleting item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showInventoryStatus('Network error deleting item', 'error');
    });
}

// Duplicate an inventory item (GM only)
function duplicateInventoryItem(tab, index) {
    if (!isGM) {
        showInventoryStatus('Only the GM can duplicate items', 'error');
        return;
    }

    showInventoryStatus('Duplicating item...', 'loading');

    fetch('dashboard.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=inventory_duplicate_item&tab=${encodeURIComponent(tab)}&index=${index}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const newItem = data.new_item;
            if (!inventoryData[tab]) {
                inventoryData[tab] = { items: [] };
            }
            if (!inventoryData[tab].items) {
                inventoryData[tab].items = [];
            }

            inventoryData[tab].items.push(newItem);

            showInventoryStatus('Item duplicated successfully', 'success');
            renderInventoryGrid(tab);

            setTimeout(() => {
                const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                if (newCard) {
                    expandInventoryCard(newCard);
                }
            }, 100);
        } else {
            showInventoryStatus('Error duplicating item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showInventoryStatus('Network error duplicating item', 'error');
    });
}

// Share an inventory item from player's inventory to shared folder (or GM folder for GM)
function shareInventoryItem(fromTab, index) {
    if (fromTab !== currentUser) return; // Only from player's own inventory
    
    const item = inventoryData[fromTab].items[index];
    if (!item) {
        showInventoryStatus('Item not found', 'error');
        return;
    }
    
    const targetFolder = isGM ? 'GM folder' : 'shared folder';
    const targetTab = isGM ? 'gm' : 'shared';
    
    if (!confirm(`Share "${item.name}" to ${targetFolder}?`)) {
        return;
    }
    
    showInventoryStatus('Sharing item...', 'loading');
    
    // Use the share_item server action
    fetch('dashboard.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=inventory_share_item&from_tab=${encodeURIComponent(fromTab)}&index=${index}&to_tab=${encodeURIComponent(targetTab)}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showInventoryStatus(`"${item.name}" shared to ${targetFolder}`, 'success');
            
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
            if (currentInventoryTab !== toTab) {
                setTimeout(() => {
                    switchInventoryTab(toTab);
                    // Find and expand the new item
                    setTimeout(() => {
                        const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                        if (newCard) {
                            expandInventoryCard(newCard);
                        }
                    }, 100);
                }, 500);
            } else {
                // If already on target tab, just expand the new item
                setTimeout(() => {
                    const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                    if (newCard) {
                        expandInventoryCard(newCard);
                    }
                }, 100);
            }
            
            // Clear expanded card if it was the shared item
            if (expandedInventoryCard) {
                clearExpandedInventoryState();
            }
        } else {
            showInventoryStatus('Error sharing item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showInventoryStatus('Network error sharing item', 'error');
    });
}

// Take an inventory item from GM or shared section to player's inventory
function takeInventoryItem(fromTab, index) {
    if (isGM) return; // GM doesn't need to take items
    if (fromTab !== 'gm' && fromTab !== 'shared') return; // Only from GM or shared
    
    const item = inventoryData[fromTab].items[index];
    if (!item) {
        showInventoryStatus('Item not found', 'error');
        return;
    }
    
    if (!confirm(`Take "${item.name}" to your inventory?`)) {
        return;
    }
    
    showInventoryStatus('Taking item...', 'loading');
    
    // Use the take_item server action
    fetch('dashboard.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=inventory_take_item&from_tab=${encodeURIComponent(fromTab)}&index=${index}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showInventoryStatus(`"${item.name}" taken to your inventory`, 'success');
            
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
            if (currentInventoryTab !== currentUser) {
                setTimeout(() => {
                    switchInventoryTab(currentUser);
                    // Find and expand the new item
                    setTimeout(() => {
                        const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                        if (newCard) {
                            expandInventoryCard(newCard);
                        }
                    }, 100);
                }, 500);
            } else {
                // If already on player's tab, just expand the new item
                setTimeout(() => {
                    const newCard = document.querySelector(`[data-item-id="${newItem.id}"]`);
                    if (newCard) {
                        expandInventoryCard(newCard);
                    }
                }, 100);
            }
            
            // Clear expanded card if it was the taken item
            if (expandedInventoryCard) {
                clearExpandedInventoryState();
            }
        } else {
            showInventoryStatus('Error taking item: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showInventoryStatus('Network error taking item', 'error');
    });
}

// Toggle inventory item visibility (GM only)
function toggleInventoryItemVisibility(tab, index) {
    if (!isGM) return;
    
    const item = inventoryData[tab].items[index];
    const newVisibility = !item.visible;
    
    showInventoryStatus(newVisibility ? 'Hiding item...' : 'Showing item...', 'loading');
    
    // Update local data immediately
    inventoryData[tab].items[index].visible = newVisibility;
    
    // Save to server
    fetch('dashboard.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=inventory_update_item_field&tab=${encodeURIComponent(tab)}&index=${index}&field=visible&value=${newVisibility ? 'true' : 'false'}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showInventoryStatus(newVisibility ? 'Item hidden successfully' : 'Item shown successfully', 'success');
            
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
                        expandInventoryCard(newCard);
                    }
                }, 50);
            }
        } else {
            // Revert local change if save failed
            inventoryData[tab].items[index].visible = !newVisibility;
            showInventoryStatus('Error updating visibility: ' + data.error, 'error');
        }
    })
    .catch(error => {
        // Revert local change if save failed
        inventoryData[tab].items[index].visible = !newVisibility;
        console.error('Error:', error);
        showInventoryStatus('Network error updating visibility', 'error');
    });
}

// Upload image for an inventory item
function uploadInventoryImage(itemId) {
    currentUploadItemId = itemId;
    document.getElementById('inventory-image-upload').click();
}

// Handle inventory image upload
function handleInventoryImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showInventoryStatus('Invalid file type. Please select a JPG, PNG, GIF, BMP, or WebP image.', 'error');
        return;
    }
    
    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showInventoryStatus('File too large. Maximum size is 5MB.', 'error');
        return;
    }
    
    showInventoryStatus('Uploading image...', 'loading');
    
    const formData = new FormData();
    formData.append('action', 'inventory_upload_image');
    formData.append('item_id', currentUploadItemId);
    formData.append('image', file);
    
    fetch('dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showInventoryStatus('Image uploaded successfully', 'success');
            
            // Update local data
            const tab = data.tab;
            const itemIndex = inventoryData[tab].items.findIndex(item => item.id === currentUploadItemId);
            if (itemIndex !== -1) {
                inventoryData[tab].items[itemIndex].image = data.image_path;
                renderInventoryGrid(tab);
            }
        } else {
            showInventoryStatus('Error uploading image: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showInventoryStatus('Network error uploading image', 'error');
    });
    
    // Clear the file input
    event.target.value = '';
}

// Update inventory permissions based on current tab
function updateInventoryPermissions() {
    visibleInventoryTabs.forEach(tab => {
        const addBtn = document.getElementById(`inventory-add-btn-${tab}`);
        if (addBtn) {
            addBtn.disabled = !canEditInventoryTab(tab);
        }
    });
}

// Auto-save setup for inventory
function setupInventoryAutoSave() {
    // Auto-save is handled by individual field updates
    // This function can be extended if needed
}

// Show inventory status message
function showInventoryStatus(message, type) {
    // Remove any existing status messages
    hideInventoryStatus();
    
    const statusDiv = document.createElement('div');
    statusDiv.className = `inventory-status-message ${type}`;
    statusDiv.textContent = message;
    statusDiv.id = 'current-inventory-status';
    
    document.body.appendChild(statusDiv);
    
    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
        setTimeout(hideInventoryStatus, 3000);
    }
}

// Hide inventory status message
function hideInventoryStatus() {
    const existing = document.getElementById('current-inventory-status');
    if (existing) {
        existing.remove();
    }
}