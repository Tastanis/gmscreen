// Template System JavaScript - Version 2.0 with 3-Tier Navigation

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadFolderTree();
    setupEventListeners();
    setupAutoSave();
    
    // Create session backup on load
    if (isGM) {
        saveTemplateData('session');
    }
});

// Setup event listeners
function setupEventListeners() {
    if (!isGM) return;
    
    // Track changes in title input
    document.getElementById('template-title').addEventListener('input', () => {
        hasUnsavedChanges = true;
    });
    
    // Context menu
    document.addEventListener('contextmenu', handleContextMenu);
    
    // Hide context menu on click
    document.addEventListener('click', () => {
        document.getElementById('context-menu').style.display = 'none';
    });
    
    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges && isGM) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// Setup auto-save
function setupAutoSave() {
    if (!isGM) return;
    
    // Auto-save every 30 seconds if there are changes
    setInterval(() => {
        if (hasUnsavedChanges) {
            saveTemplateData('auto');
        }
    }, 30000);
    
    // Session backup every 10 minutes
    setInterval(() => {
        const now = Date.now();
        if (now - lastBackupTime > 600000) { // 10 minutes
            saveTemplateData('session');
            lastBackupTime = now;
        }
    }, 60000); // Check every minute
}

// Load and display folder tree
function loadFolderTree() {
    const folderTree = document.getElementById('folder-tree');
    folderTree.innerHTML = '';
    
    if (!templatesData.folders || templatesData.folders.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.style.padding = '20px';
        emptyMessage.style.textAlign = 'center';
        emptyMessage.style.color = '#666';
        emptyMessage.textContent = 'No folders yet. Click "Add Folder" to create one.';
        folderTree.appendChild(emptyMessage);
        return;
    }
    
    templatesData.folders.forEach(folder => {
        const folderElement = createFolderElement(folder);
        folderTree.appendChild(folderElement);
    });
}

// Create folder element
function createFolderElement(folder) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder-item';
    folderDiv.dataset.folderId = folder.id;
    
    // Folder header
    const folderHeader = document.createElement('div');
    folderHeader.className = 'folder-header';
    if (currentFolderId === folder.id) {
        folderHeader.classList.add('active');
        folderDiv.classList.add('expanded');
    }
    
    const folderIcon = document.createElement('div');
    folderIcon.className = 'folder-icon';
    
    const folderName = document.createElement('div');
    folderName.className = 'folder-name';
    folderName.textContent = folder.name;
    
    folderHeader.appendChild(folderIcon);
    folderHeader.appendChild(folderName);
    
    // Folder content (subfolders)
    const folderContent = document.createElement('div');
    folderContent.className = 'folder-content';
    
    if (folder.subfolders && folder.subfolders.length > 0) {
        folder.subfolders.forEach(subfolder => {
            const subfolderElement = createSubfolderElement(subfolder);
            folderContent.appendChild(subfolderElement);
        });
    }
    
    // Add subfolder button (GM only)
    if (isGM) {
        const addSubfolderBtn = document.createElement('div');
        addSubfolderBtn.className = 'subfolder-item';
        addSubfolderBtn.innerHTML = '<div class="subfolder-header" style="font-style: italic; color: #888;">+ Add Subfolder</div>';
        addSubfolderBtn.onclick = () => addNewSubfolder(folder.id);
        folderContent.appendChild(addSubfolderBtn);
    }
    
    folderDiv.appendChild(folderHeader);
    folderDiv.appendChild(folderContent);
    
    // Click handlers
    folderHeader.addEventListener('click', () => toggleFolder(folder.id));
    
    if (isGM) {
        folderHeader.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, 'folder', folder.id);
        });
    }
    
    return folderDiv;
}

// Create subfolder element
function createSubfolderElement(subfolder) {
    const subfolderDiv = document.createElement('div');
    subfolderDiv.className = 'subfolder-item';
    subfolderDiv.dataset.subfolderId = subfolder.id;
    
    const subfolderHeader = document.createElement('div');
    subfolderHeader.className = 'subfolder-header';
    if (currentSubfolderId === subfolder.id) {
        subfolderHeader.classList.add('active');
    }
    
    const subfolderIcon = document.createElement('div');
    subfolderIcon.className = 'subfolder-icon';
    
    const subfolderName = document.createElement('div');
    subfolderName.textContent = subfolder.name;
    
    subfolderHeader.appendChild(subfolderIcon);
    subfolderHeader.appendChild(subfolderName);
    subfolderDiv.appendChild(subfolderHeader);
    
    // Click handlers
    subfolderHeader.addEventListener('click', () => selectSubfolder(subfolder.id));
    
    if (isGM) {
        subfolderHeader.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, 'subfolder', subfolder.id);
        });
    }
    
    return subfolderDiv;
}

// Toggle folder expansion
function toggleFolder(folderId) {
    const folderElement = document.querySelector(`[data-folder-id="${folderId}"]`);
    const folderHeader = folderElement.querySelector('.folder-header');
    
    if (folderElement.classList.contains('expanded')) {
        folderElement.classList.remove('expanded');
        folderHeader.classList.remove('active');
        if (currentFolderId === folderId) {
            currentFolderId = null;
            hideTemplateStrip();
        }
    } else {
        // Close other folders
        document.querySelectorAll('.folder-item').forEach(f => {
            f.classList.remove('expanded');
            f.querySelector('.folder-header').classList.remove('active');
        });
        
        folderElement.classList.add('expanded');
        folderHeader.classList.add('active');
        currentFolderId = folderId;
        currentSubfolderId = null;
        hideTemplateStrip();
    }
}

// Select subfolder
function selectSubfolder(subfolderId) {
    // Update active states
    document.querySelectorAll('.subfolder-header').forEach(s => {
        s.classList.remove('active');
    });
    
    const subfolderElement = document.querySelector(`[data-subfolder-id="${subfolderId}"]`);
    subfolderElement.querySelector('.subfolder-header').classList.add('active');
    
    currentSubfolderId = subfolderId;
    showTemplateStrip();
    loadTemplatesInStrip();
    
    // Hide template form until template is selected
    document.getElementById('template-form').style.display = 'none';
    document.getElementById('no-template-message').textContent = 'Select a template from the strip above';
}

// Show template strip
function showTemplateStrip() {
    document.getElementById('template-strip-container').style.display = 'flex';
    document.getElementById('no-template-message').style.display = 'none';
}

// Hide template strip
function hideTemplateStrip() {
    document.getElementById('template-strip-container').style.display = 'none';
    document.getElementById('template-form').style.display = 'none';
    document.getElementById('no-template-message').style.display = 'block';
    document.getElementById('no-template-message').textContent = 'Select a folder and subfolder to view templates';
}

// Load templates in strip
function loadTemplatesInStrip() {
    const templateStrip = document.getElementById('template-strip');
    templateStrip.innerHTML = '';
    
    const templates = getTemplatesInSubfolder(currentSubfolderId);
    
    templates.forEach(template => {
        const thumbnail = createTemplateThumbnail(template);
        templateStrip.appendChild(thumbnail);
    });
}

// Get templates in subfolder
function getTemplatesInSubfolder(subfolderId) {
    for (const folder of templatesData.folders) {
        for (const subfolder of folder.subfolders || []) {
            if (subfolder.id === subfolderId) {
                return subfolder.templates || [];
            }
        }
    }
    return [];
}

// Create template thumbnail
function createTemplateThumbnail(template) {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'template-thumbnail';
    thumbnail.dataset.templateId = template.id;
    
    if (currentTemplateId === template.id) {
        thumbnail.classList.add('active');
    }
    
    // Image or placeholder
    if (template.image) {
        const img = document.createElement('img');
        img.className = 'template-thumb-image';
        img.src = template.image;
        img.alt = template.title || 'Template';
        thumbnail.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'template-thumb-image';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.fontSize = '12px';
        placeholder.style.color = '#666';
        placeholder.textContent = 'No Image';
        thumbnail.appendChild(placeholder);
    }
    
    // Title
    const title = document.createElement('div');
    title.className = 'template-thumb-title';
    title.textContent = template.title || 'Untitled';
    thumbnail.appendChild(title);
    
    // Click handler
    thumbnail.addEventListener('click', () => selectTemplate(template.id));
    
    return thumbnail;
}

// Select template
function selectTemplate(templateId) {
    // Save current template if switching
    if (currentTemplateId && hasUnsavedChanges && isGM) {
        saveTemplateData('auto');
    }
    
    currentTemplateId = templateId;
    const template = getTemplateById(templateId);
    
    if (!template) return;
    
    // Update active thumbnail
    document.querySelectorAll('.template-thumbnail').forEach(t => {
        t.classList.toggle('active', t.dataset.templateId === templateId);
    });
    
    // Show and load template form
    loadTemplateForm(template);
    hasUnsavedChanges = false;
}

// Get template by ID
function getTemplateById(templateId) {
    for (const folder of templatesData.folders) {
        for (const subfolder of folder.subfolders || []) {
            for (const template of subfolder.templates || []) {
                if (template.id === templateId) {
                    return template;
                }
            }
        }
    }
    return null;
}

// Load template form
function loadTemplateForm(template) {
    document.getElementById('template-form').style.display = 'block';
    document.getElementById('no-template-message').style.display = 'none';
    
    // Load basic data
    document.getElementById('template-title').value = template.title || '';
    
    // Load image
    const templateImage = document.getElementById('template-image');
    const imagePlaceholder = document.getElementById('image-placeholder');
    
    if (template.image) {
        templateImage.src = template.image;
        templateImage.style.display = 'block';
        imagePlaceholder.style.display = 'none';
    } else {
        templateImage.style.display = 'none';
        imagePlaceholder.style.display = 'flex';
    }
    
    // Load color circle
    const colorCircle = document.getElementById('color-circle');
    const colorIndex = colors.indexOf(template.color || colors[0]);
    currentColorIndex = colorIndex >= 0 ? colorIndex : 0;
    colorCircle.style.backgroundColor = colors[currentColorIndex];
    
    // Load rich text fields
    const fields = ['origin', 'motive', 'fear', 'connections', 'change', 'impact-positive', 'impact-negative', 'story'];
    
    fields.forEach(fieldName => {
        const container = document.getElementById(`${fieldName}-container`);
        container.innerHTML = '';
        
        const editor = new TemplateRichEditor(container, fieldName, {
            placeholder: 'Enter text here...',
            readOnly: !isGM,
            minHeight: fieldName === 'story' ? 200 : 60
        });
        
        const fieldKey = fieldName.replace('-', '_');
        editor.setContent(template[fieldKey] || '');
        richTextEditors[fieldName] = editor;
    });
}

// Add new folder
function addNewFolder() {
    if (!isGM) return;
    
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;
    
    const newFolder = {
        id: generateId(),
        name: folderName,
        subfolders: []
    };
    
    templatesData.folders.push(newFolder);
    loadFolderTree();
    hasUnsavedChanges = true;
}

// Add new subfolder
function addNewSubfolder(folderId) {
    if (!isGM) return;
    
    const subfolderName = prompt('Enter subfolder name:');
    if (!subfolderName) return;
    
    const folder = templatesData.folders.find(f => f.id === folderId);
    if (!folder) return;
    
    if (!folder.subfolders) {
        folder.subfolders = [];
    }
    
    const newSubfolder = {
        id: generateId(),
        name: subfolderName,
        templates: []
    };
    
    folder.subfolders.push(newSubfolder);
    loadFolderTree();
    hasUnsavedChanges = true;
}

// Add new template
function addNewTemplate() {
    if (!isGM || !currentSubfolderId) return;
    
    const subfolder = getSubfolderById(currentSubfolderId);
    if (!subfolder) return;
    
    const newTemplate = {
        id: generateId(),
        title: 'New Template',
        image: '',
        color: colors[0], // Default green
        origin: '',
        motive: '',
        fear: '',
        connections: '',
        change: '',
        impact_positive: '',
        impact_negative: '',
        story: '',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
    };
    
    if (!subfolder.templates) {
        subfolder.templates = [];
    }
    
    subfolder.templates.push(newTemplate);
    loadTemplatesInStrip();
    selectTemplate(newTemplate.id);
    hasUnsavedChanges = true;
    
    // Focus on title input
    setTimeout(() => {
        document.getElementById('template-title').focus();
        document.getElementById('template-title').select();
    }, 100);
}

// Get subfolder by ID
function getSubfolderById(subfolderId) {
    for (const folder of templatesData.folders) {
        for (const subfolder of folder.subfolders || []) {
            if (subfolder.id === subfolderId) {
                return subfolder;
            }
        }
    }
    return null;
}

// Context menu handling
function handleContextMenu(e) {
    if (!isGM) return;
    
    const folderHeader = e.target.closest('.folder-header');
    const subfolderHeader = e.target.closest('.subfolder-header');
    
    if (folderHeader) {
        e.preventDefault();
        const folderId = folderHeader.closest('.folder-item').dataset.folderId;
        showContextMenu(e, 'folder', folderId);
    } else if (subfolderHeader) {
        e.preventDefault();
        const subfolderId = subfolderHeader.closest('.subfolder-item').dataset.subfolderId;
        showContextMenu(e, 'subfolder', subfolderId);
    }
}

// Show context menu
function showContextMenu(e, type, id) {
    const contextMenu = document.getElementById('context-menu');
    contextMenuTarget = id;
    contextMenuType = type;
    
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';
}

// Rename item
function renameItem() {
    if (!isGM || !contextMenuTarget || !contextMenuType) return;
    
    const currentName = getCurrentItemName(contextMenuType, contextMenuTarget);
    const newName = prompt('Enter new name:', currentName);
    
    if (!newName || newName === currentName) return;
    
    if (contextMenuType === 'folder') {
        const folder = templatesData.folders.find(f => f.id === contextMenuTarget);
        if (folder) {
            folder.name = newName;
            loadFolderTree();
            hasUnsavedChanges = true;
        }
    } else if (contextMenuType === 'subfolder') {
        const subfolder = getSubfolderById(contextMenuTarget);
        if (subfolder) {
            subfolder.name = newName;
            loadFolderTree();
            hasUnsavedChanges = true;
        }
    }
    
    document.getElementById('context-menu').style.display = 'none';
}

// Delete item
function deleteItem() {
    if (!isGM || !contextMenuTarget || !contextMenuType) return;
    
    const itemName = getCurrentItemName(contextMenuType, contextMenuTarget);
    const confirmMessage = `Are you sure you want to delete "${itemName}"? This action cannot be undone.`;
    
    document.getElementById('delete-message').textContent = confirmMessage;
    document.getElementById('delete-modal').style.display = 'block';
    document.getElementById('context-menu').style.display = 'none';
}

// Get current item name
function getCurrentItemName(type, id) {
    if (type === 'folder') {
        const folder = templatesData.folders.find(f => f.id === id);
        return folder ? folder.name : '';
    } else if (type === 'subfolder') {
        const subfolder = getSubfolderById(id);
        return subfolder ? subfolder.name : '';
    }
    return '';
}

// Confirm delete
function confirmDelete() {
    if (!contextMenuTarget || !contextMenuType) return;
    
    if (contextMenuType === 'folder') {
        const index = templatesData.folders.findIndex(f => f.id === contextMenuTarget);
        if (index >= 0) {
            templatesData.folders.splice(index, 1);
            if (currentFolderId === contextMenuTarget) {
                currentFolderId = null;
                currentSubfolderId = null;
                currentTemplateId = null;
                hideTemplateStrip();
            }
            loadFolderTree();
            hasUnsavedChanges = true;
        }
    } else if (contextMenuType === 'subfolder') {
        for (const folder of templatesData.folders) {
            const index = (folder.subfolders || []).findIndex(s => s.id === contextMenuTarget);
            if (index >= 0) {
                folder.subfolders.splice(index, 1);
                if (currentSubfolderId === contextMenuTarget) {
                    currentSubfolderId = null;
                    currentTemplateId = null;
                    hideTemplateStrip();
                }
                loadFolderTree();
                hasUnsavedChanges = true;
                break;
            }
        }
    }
    
    cancelDelete();
}

// Cancel delete
function cancelDelete() {
    document.getElementById('delete-modal').style.display = 'none';
    contextMenuTarget = null;
    contextMenuType = null;
}

// Delete current template
function deleteCurrentTemplate() {
    if (!isGM || !currentTemplateId) return;
    
    const template = getTemplateById(currentTemplateId);
    if (!template) return;
    
    const confirmMessage = `Are you sure you want to delete "${template.title || 'Untitled'}"? This action cannot be undone.`;
    document.getElementById('delete-message').textContent = confirmMessage;
    document.getElementById('delete-modal').style.display = 'block';
    
    // Override confirm delete for template
    window.confirmDelete = function() {
        const subfolder = getSubfolderById(currentSubfolderId);
        if (subfolder && subfolder.templates) {
            const index = subfolder.templates.findIndex(t => t.id === currentTemplateId);
            if (index >= 0) {
                subfolder.templates.splice(index, 1);
                currentTemplateId = null;
                loadTemplatesInStrip();
                document.getElementById('template-form').style.display = 'none';
                document.getElementById('no-template-message').style.display = 'block';
                document.getElementById('no-template-message').textContent = 'Select a template from the strip above';
                hasUnsavedChanges = true;
            }
        }
        cancelDelete();
        
        // Restore original confirm delete
        window.confirmDelete = confirmDelete;
    };
}

// Scroll template strip
function scrollTemplateStrip(direction) {
    const strip = document.getElementById('template-strip');
    const scrollAmount = 200;
    
    if (direction === 'left') {
        strip.scrollLeft -= scrollAmount;
    } else {
        strip.scrollLeft += scrollAmount;
    }
}

// Change color
function changeColor() {
    if (!isGM) return;
    
    currentColorIndex = (currentColorIndex + 1) % colors.length;
    const colorCircle = document.getElementById('color-circle');
    colorCircle.style.backgroundColor = colors[currentColorIndex];
    
    // Update current template
    const template = getTemplateById(currentTemplateId);
    if (template) {
        template.color = colors[currentColorIndex];
        hasUnsavedChanges = true;
    }
}

// Upload image
function uploadImage() {
    if (!isGM) return;
    document.getElementById('image-upload').click();
}

// Handle image upload
function handleImageUpload(event) {
    if (!isGM) return;
    
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('template_id', currentTemplateId);
    
    showStatus('Uploading image...', 'info');
    
    fetch('upload-image.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const template = getTemplateById(currentTemplateId);
            if (template) {
                template.image = data.image_path;
                hasUnsavedChanges = true;
                
                // Update display
                const templateImage = document.getElementById('template-image');
                const imagePlaceholder = document.getElementById('image-placeholder');
                
                templateImage.src = data.image_path;
                templateImage.style.display = 'block';
                imagePlaceholder.style.display = 'none';
                
                // Update thumbnail
                loadTemplatesInStrip();
                
                saveTemplateData('auto');
            }
            showStatus('Image uploaded successfully', 'success');
        } else {
            showStatus('Failed to upload image: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
        showStatus('Failed to upload image', 'error');
    });
}

// Save template data
function saveTemplateData(backupType = 'auto') {
    if (!isGM) return;
    
    // Update current template data from form
    if (currentTemplateId) {
        const template = getTemplateById(currentTemplateId);
        if (template) {
            template.title = document.getElementById('template-title').value;
            template.color = colors[currentColorIndex];
            
            // Get content from rich text editors
            Object.keys(richTextEditors).forEach(fieldName => {
                const editor = richTextEditors[fieldName];
                const fieldKey = fieldName.replace('-', '_');
                template[fieldKey] = editor.getContent();
            });
            
            template.modified = new Date().toISOString();
        }
    }
    
    // Update metadata
    templatesData.metadata.last_updated = new Date().toISOString();
    
    // Send to server
    fetch('save-template.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `action=save&data=${encodeURIComponent(JSON.stringify(templatesData))}&backup_type=${backupType}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            hasUnsavedChanges = false;
            if (backupType !== 'session') {
                showStatus('Templates saved successfully', 'success');
            }
            loadTemplatesInStrip(); // Refresh thumbnails in case title changed
        } else {
            showStatus('Failed to save templates: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Save error:', error);
        showStatus('Failed to save templates', 'error');
    });
}

// Print template
function printTemplate() {
    window.print();
}

// Show status message
function showStatus(message, type) {
    const status = document.getElementById('save-status');
    status.textContent = message;
    status.className = 'save-status show ' + type;
    
    setTimeout(() => {
        status.classList.remove('show');
    }, 3000);
}

// Generate unique ID
function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}