// Template System JavaScript

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadTemplates();
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
    
    // Track changes
    document.querySelectorAll('.template-field, #template-title').forEach(field => {
        field.addEventListener('input', () => {
            hasUnsavedChanges = true;
        });
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

// Load and display templates
function loadTemplates() {
    const tabsContainer = document.getElementById('template-tabs');
    const noTemplateMessage = document.getElementById('no-template-message');
    const templateForm = document.getElementById('template-form');
    
    tabsContainer.innerHTML = '';
    
    if (!templatesData.templates || templatesData.templates.length === 0) {
        noTemplateMessage.style.display = 'block';
        templateForm.style.display = 'none';
        return;
    }
    
    noTemplateMessage.style.display = 'none';
    
    // Create tabs
    templatesData.templates.forEach((template, index) => {
        const tab = createTemplateTab(template, index);
        tabsContainer.appendChild(tab);
    });
    
    // Select first template if none selected
    if (currentTemplateId === null && templatesData.templates.length > 0) {
        selectTemplate(templatesData.templates[0].id);
    }
}

// Create a template tab
function createTemplateTab(template, index) {
    const tab = document.createElement('div');
    tab.className = 'template-tab';
    tab.dataset.templateId = template.id;
    
    if (template.id === currentTemplateId) {
        tab.classList.add('active');
    }
    
    // Image or placeholder
    if (template.image) {
        const img = document.createElement('img');
        img.className = 'template-tab-image';
        img.src = template.image;
        img.alt = template.title || 'Template';
        tab.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'template-tab-placeholder';
        placeholder.textContent = (index + 1).toString();
        tab.appendChild(placeholder);
    }
    
    // Title
    const title = document.createElement('span');
    title.textContent = template.title || `Template ${index + 1}`;
    tab.appendChild(title);
    
    // Click handler
    tab.addEventListener('click', () => selectTemplate(template.id));
    
    return tab;
}

// Select a template
function selectTemplate(templateId) {
    // Save current template if switching
    if (currentTemplateId && hasUnsavedChanges && isGM) {
        saveTemplateData('auto');
    }
    
    currentTemplateId = templateId;
    const template = templatesData.templates.find(t => t.id === templateId);
    
    if (!template) return;
    
    // Update active tab
    document.querySelectorAll('.template-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.templateId === templateId);
    });
    
    // Show form
    document.getElementById('template-form').style.display = 'block';
    
    // Load template data
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
    
    // Load fields
    for (let i = 1; i <= 6; i++) {
        const field = document.getElementById(`section${i}`);
        if (field) {
            field.value = template[`section${i}`] || '';
        }
    }
    
    hasUnsavedChanges = false;
}

// Add new template
function addNewTemplate() {
    if (!isGM) return;
    
    const newTemplate = {
        id: generateId(),
        title: 'New Template',
        image: '',
        section1: '',
        section2: '',
        section3: '',
        section4: '',
        section5: '',
        section6: '',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
    };
    
    templatesData.templates.push(newTemplate);
    loadTemplates();
    selectTemplate(newTemplate.id);
    hasUnsavedChanges = true;
    
    // Focus on title input
    setTimeout(() => {
        document.getElementById('template-title').focus();
        document.getElementById('template-title').select();
    }, 100);
}

// Delete current template
function deleteCurrentTemplate() {
    if (!isGM || !currentTemplateId) return;
    
    document.getElementById('delete-modal').style.display = 'block';
}

// Confirm delete
function confirmDelete() {
    if (!isGM || !currentTemplateId) return;
    
    const index = templatesData.templates.findIndex(t => t.id === currentTemplateId);
    if (index !== -1) {
        templatesData.templates.splice(index, 1);
        currentTemplateId = null;
        hasUnsavedChanges = true;
        saveTemplateData('auto');
        loadTemplates();
    }
    
    document.getElementById('delete-modal').style.display = 'none';
}

// Cancel delete
function cancelDelete() {
    document.getElementById('delete-modal').style.display = 'none';
}

// Save template data
function saveTemplateData(backupType = 'auto') {
    if (!isGM) return;
    
    // Update current template data
    if (currentTemplateId) {
        const template = templatesData.templates.find(t => t.id === currentTemplateId);
        if (template) {
            template.title = document.getElementById('template-title').value;
            template.section1 = document.getElementById('section1').value;
            template.section2 = document.getElementById('section2').value;
            template.section3 = document.getElementById('section3').value;
            template.section4 = document.getElementById('section4').value;
            template.section5 = document.getElementById('section5').value;
            template.section6 = document.getElementById('section6').value;
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
            loadTemplates(); // Refresh tabs in case title changed
        } else {
            showStatus('Failed to save templates: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Save error:', error);
        showStatus('Failed to save templates', 'error');
    });
}

// Create manual backup
function createManualBackup() {
    if (!isGM) return;
    
    fetch('save-template.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'action=backup'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus('Backup created successfully', 'success');
        } else {
            showStatus('Failed to create backup: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Backup error:', error);
        showStatus('Failed to create backup', 'error');
    });
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
            // Update template
            const template = templatesData.templates.find(t => t.id === currentTemplateId);
            if (template) {
                template.image = data.image_path;
                hasUnsavedChanges = true;
                selectTemplate(currentTemplateId); // Refresh display
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
    return 'template_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}