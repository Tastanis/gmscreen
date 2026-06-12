// Staff Management JavaScript
// Shared behavior lives in ../templates/js/character-sheet-base.js; this file
// supplies the staff-specific configuration, detail form, and autocomplete logic.

const staffEndpoint = 'index.php';

CharacterSheetBase.init({
    type: 'staff',
    plural: 'staff',
    entityLabel: 'staff member',
    endpoint: staffEndpoint,
    idField: 'staff_id',
    actions: {
        load: 'load_staff',
        save: 'save_staff',
        add: 'add_staff',
        remove: 'delete_staff',
        export: 'export_staff'
    },
    gridId: 'staff-grid',
    modalId: 'staff-modal',
    modalNameId: 'modal-staff-name',
    detailsSelector: '.staff-details',
    addBtnId: 'add-staff-btn',
    exportBtnId: 'export-staff-btn',
    exportSelectedBtnId: 'export-selected-staff-btn',
    exportButtonLabel: '📤 Export Staff',
    modalOpenInputSelector: 'input, select',
    filterParams: [
        { param: 'filter_college', key: 'college' }
    ],
    filterSelects: [
        { id: 'filter-college', key: 'college' }
    ],
    getSelected: () => selectedStaff,
    setSelected: value => { selectedStaff = value; },
    getAll: () => window.allStaff,
    setAll: list => {
        window.allStaff = list;
        window.staffLoaded = true;
    },
    cardInfoHtml: member => `
        <div class="staff-college">${escapeHtml(member.college || 'No College')}</div>
    `,
    createDetailForm: member => createStaffDetailForm(member),
    cleanExportRecord: member => cleanStaffExportSections(member),
    expand: () => expandStaffToNewTab(),
    onLookupReady: () => setupExistingTextAreasAutocomplete(),
    globalNames: {
        loadCharacters: 'loadStaff',
        displayCharacters: 'displayStaff',
        createCharacterCard: 'createStaffCard',
        openCharacterModal: 'openStaffModal',
        closeCharacterModal: 'closeStaffModal',
        saveCharacterField: 'saveStaffField',
        addCharacter: 'addStaffMember',
        deleteCharacter: 'deleteStaffMember',
        toggleFavorite: 'toggleStaffFavorite',
        uploadPortrait: 'uploadStaffPortrait',
        exportSelectedCharacters: 'exportSelectedStaff',
        toggleExportSelection: 'toggleStaffExportSelection'
    }
});

// Setup autocomplete for any existing text areas
function setupExistingTextAreasAutocomplete() {
    const modal = document.getElementById('staff-modal');
    if (modal) {
        setupModalTextAreasAutocomplete(modal);
    }
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
            field.includes('character_description') ||
            field.includes('general_info') ||
            field.includes('personality') ||
            field.includes('other') ||
            field.includes('origin') ||
            field.includes('desire') ||
            field.includes('fear') ||
            field.includes('connection') ||
            field.includes('impact') ||
            field.includes('change')
        )) {
            window.characterLookup.setupTextAreaListeners(textarea);
        }
    });

    console.log('Set up autocomplete for staff modal text areas');
}

// Create staff detail form
function createStaffDetailForm(member) {
    const conflictEngine = member.conflict_engine || {};
    const tensionWeb = member.tension_web || [];

    // Handle both old image_path and new images array for backward compatibility
    let images = [];
    if (member.images && member.images.length > 0) {
        images = member.images;
    } else if (member.image_path) {
        images = [member.image_path];
    }

    const imageHtml = images.length > 0 ?
        createImageGallery(images, member.staff_id, 'staff', member.image_adjustments) :
        `<div class="staff-portrait-placeholder">No Photo</div>`;

    const uploadButton = isGM ?
        `<button class="upload-portrait-btn" onclick="uploadStaffPortrait('${member.staff_id}')">Upload Photo</button>` : '';

    // Build tension web entries HTML
    const tensionWebHtml = tensionWeb.map((entry, index) => `
        <div class="tension-web-entry" data-index="${index}">
            <div class="tension-web-entry-header">
                <strong class="tension-web-name">${escapeHtml(entry.name || '')}</strong>
                <span class="tension-web-role">(${escapeHtml(entry.role || '')})</span>
                ${isGM ? `<button class="btn-remove-tension" onclick="removeTensionWebEntry('${member.staff_id}', ${index})" title="Remove entry" aria-label="Remove entry">&times;</button>` : ''}
            </div>
            <div class="tension-web-description">${escapeHtml(entry.description || '')}</div>
        </div>
    `).join('');

    // Want tag options
    const wantTagOptions = ['Legacy', 'Recognition', 'Freedom', 'Power', 'Knowledge', 'Connection', 'Survival', 'Justice', 'Creation', 'Redemption'];
    const currentWantTag = conflictEngine.want_tag || '';

    return `
        <div class="staff-form">
            <!-- Portrait Section -->
            <div class="staff-portrait-section">
                ${imageHtml}
                ${uploadButton}
            </div>

            <!-- Basic Information -->
            <div class="form-section">
                <h3>Basic Information</h3>
                <div class="form-group">
                    <label>Name:</label>
                    ${isGM ?
                        `<input type="text" value="${escapeHtml(member.name)}" data-field="name">` :
                        `<div class="readonly-field">${escapeHtml(member.name)}</div>`
                    }
                </div>
                <div class="form-group">
                    <label>College:</label>
                    ${isGM ?
                        `<select data-field="college">
                            <option value="">No College</option>
                            <option value="Silverquill" ${member.college === 'Silverquill' ? 'selected' : ''}>Silverquill</option>
                            <option value="Prismari" ${member.college === 'Prismari' ? 'selected' : ''}>Prismari</option>
                            <option value="Witherbloom" ${member.college === 'Witherbloom' ? 'selected' : ''}>Witherbloom</option>
                            <option value="Lorehold" ${member.college === 'Lorehold' ? 'selected' : ''}>Lorehold</option>
                            <option value="Quandrix" ${member.college === 'Quandrix' ? 'selected' : ''}>Quandrix</option>
                        </select>` :
                        `<div class="readonly-field">${escapeHtml(member.college || 'No College')}</div>`
                    }
                </div>
                <div class="form-group">
                    <label>Character Description:</label>
                    ${isGM ?
                        `<div class="rich-text-container medium" data-field="character_description" data-placeholder="Brief character description..."></div>` :
                        `<div class="readonly-field readonly-textarea">${escapeHtml(member.character_description || 'No description available')}</div>`
                    }
                </div>
                <div class="form-group">
                    <label>General Information:</label>
                    ${isGM ?
                        `<div class="rich-text-container large" data-field="general_info" data-placeholder="General information about this staff member..."></div>` :
                        `<div class="readonly-field readonly-textarea">${escapeHtml(member.general_info || 'No general information available')}</div>`
                    }
                </div>
            </div>

            <!-- Conflict Engine Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only conflict-engine-section">
                <h3><span class="ce-icon">&#9881;</span> Conflict Engine</h3>

                <!-- Want -->
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

                <!-- Obstacle -->
                <div class="ce-block ce-obstacle">
                    <div class="ce-block-header">
                        <span class="ce-badge ce-badge-obstacle">O</span>
                        <span class="ce-block-title">Obstacle</span>
                    </div>
                    <div class="ce-block-body">
                        <div class="rich-text-container" data-field="conflict_engine.obstacle" data-placeholder="What stands in the way?"></div>
                    </div>
                </div>

                <!-- Action -->
                <div class="ce-block ce-action">
                    <div class="ce-block-header">
                        <span class="ce-badge ce-badge-action">A</span>
                        <span class="ce-block-title">Action</span>
                    </div>
                    <div class="ce-block-body">
                        <div class="rich-text-container" data-field="conflict_engine.action" data-placeholder="What is this character actively doing about it?"></div>
                    </div>
                </div>

                <!-- Consequence -->
                <div class="ce-block ce-consequence">
                    <div class="ce-block-header">
                        <span class="ce-badge ce-badge-consequence">C</span>
                        <span class="ce-block-title">Consequence</span>
                    </div>
                    <div class="ce-block-body">
                        <div class="rich-text-container" data-field="conflict_engine.consequence" data-placeholder="What happens if they fail or succeed?"></div>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- Tension Web Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only tension-web-section">
                <h3>Tension Web</h3>
                <div class="tension-web-list" id="tension-web-${member.staff_id}">
                    ${tensionWebHtml || '<p class="tension-web-empty">No tension web entries yet.</p>'}
                </div>
                <div class="tension-web-add">
                    <div class="tension-web-add-row">
                        <input type="text" id="tw-name-${member.staff_id}" placeholder="Name..." class="tw-input tw-name-input">
                        <input type="text" id="tw-role-${member.staff_id}" placeholder="Role (e.g. mentor, rival)..." class="tw-input tw-role-input">
                    </div>
                    <div class="tension-web-add-row">
                        <input type="text" id="tw-desc-${member.staff_id}" placeholder="Describe the tension/friction..." class="tw-input tw-desc-input">
                        <button class="btn-add-tension" onclick="addTensionWebEntry('${member.staff_id}')">+ Add</button>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- Pressure Point Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only pressure-point-section">
                <h3>Pressure Point</h3>
                <div class="rich-text-container" data-field="pressure_point" data-placeholder="When [trigger], they [behavior]..."></div>
            </div>
            ` : ''}

            <!-- Trajectory Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only trajectory-section">
                <h3>Trajectory</h3>
                <div class="rich-text-container" data-field="trajectory" data-placeholder="Without intervention, what happens to this character?"></div>
            </div>
            ` : ''}

            <!-- Director's Notes Section (GM Only, collapsed by default) -->
            ${isGM ? `
            <div class="form-section gm-only directors-notes-section">
                <h3 class="directors-notes-toggle" onclick="toggleDirectorsNotes(this)">Director's Notes <span class="toggle-arrow">&#9660;</span></h3>
                <div class="directors-notes-content" style="display: none;">
                    <div class="rich-text-container large" data-field="directors_notes" data-placeholder="Origin, background, personality, and other GM notes..."></div>
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

// Expand staff to new tab
function expandStaffToNewTab() {
    if (!selectedStaff) return;

    const newWindow = window.open('', '_blank');
    const member = selectedStaff;

    newWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(member.name)} - Staff Details</title>
            <link rel="stylesheet" href="../../../css/style.css">
            <link rel="stylesheet" href="../../css/theme.css">
            <link rel="stylesheet" href="../../css/ui-kit.css">
            <link rel="stylesheet" href="../templates/css/character-sheet-base.css">
            <link rel="stylesheet" href="css/staff.css">
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
                .staff-details { grid-template-columns: 200px 1fr; }
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
            </style>
        </head>
        <body>
            <div class="save-indicator" id="save-indicator">Saved!</div>
            <div class="standalone-header">
                <h1>${escapeHtml(member.name)} - Staff Details</h1>
                <p>${escapeHtml(member.college || 'No College')}</p>
                ${isGM ? '<p><small>Changes auto-save as you type</small></p>' : ''}
            </div>
            <div class="standalone-content">
                <div class="staff-details">
                    ${createStaffDetailForm(member)}
                </div>
            </div>

            <script src="../../js/ui-kit.js"></script>
            <script src="../gm/js/character-lookup.js"></script>
            <script src="../gm/js/rich-text-editor.js"></script>
            <script>
                // Copy necessary variables and functions to the popout
                const isGM = ${isGM};
                const currentUser = '${currentUser}';
                const staffData = ${JSON.stringify(member)};
                const staffEndpoint = 'index.php';

                // Save function for popout window (GM only)
                function saveStaffField(staffId, field, value) {
                    if (!isGM) return;

                    // Handle nested GM-only fields
                    if (field.startsWith('gm_only.')) {
                        const gmField = field.split('.')[1];
                        const formData = new FormData();
                        formData.append('action', 'save_staff');
                        formData.append('staff_id', staffId);
                        formData.append('field', 'gm_only.' + gmField);
                        formData.append('value', value);

                        fetch(staffEndpoint, {
                            method: 'POST',
                            body: formData
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                if (!staffData.gm_only) staffData.gm_only = {};
                                staffData.gm_only[gmField] = value;
                                showSaveIndicator();
                            } else {
                                console.error('Failed to save GM field:', data.error);
                            }
                        })
                        .catch(error => {
                            console.error('Error saving GM field:', error);
                        });
                        return;
                    }

                    const formData = new FormData();
                    formData.append('action', 'save_staff');
                    formData.append('staff_id', staffId);
                    formData.append('field', field);
                    formData.append('value', value);

                    fetch(staffEndpoint, {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showSaveIndicator();
                            // Update local staff data
                            staffData[field] = value;
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

                // Set up event listeners for auto-save (GM only)
                if (isGM) {
                    document.addEventListener('DOMContentLoaded', function() {
                        document.querySelectorAll('input, select, textarea').forEach(input => {
                            if (input.hasAttribute('data-field')) {
                                const debouncedSave = debounce(function() {
                                    const field = input.getAttribute('data-field');
                                    const value = input.value;
                                    saveStaffField('${member.staff_id}', field, value);
                                }, 1000);

                                input.addEventListener('input', debouncedSave);
                                input.addEventListener('change', debouncedSave);
                            }
                        });

                        // Setup character lookup for standalone window
                        setupStandaloneCharacterLookup();
                    });
                }

                // Setup character lookup for standalone window
                function setupStandaloneCharacterLookup() {
                    // Wait for character lookup to be available
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
                                        field.includes('character_description') ||
                                        field.includes('general_info') ||
                                        field.includes('personality') ||
                                        field.includes('other') ||
                                        field.includes('origin') ||
                                        field.includes('desire') ||
                                        field.includes('fear') ||
                                        field.includes('connection') ||
                                        field.includes('impact') ||
                                        field.includes('change')
                                    )) {
                                        // Create rich text editor
                                        const editor = new RichTextEditor(container, {
                                            placeholder: 'Enter text... Type [[character name]] to link to characters'
                                        });
                                        editor.init();

                                        // Connect to character lookup
                                        const editorElement = editor.getEditor();
                                        if (editorElement) {
                                            lookup.setupEditorListeners(editorElement);
                                        }

                                        // Setup auto-save
                                        editor.onChange((content) => {
                                            const fieldName = container.getAttribute('data-field');
                                            saveStaffField('${member.staff_id}', fieldName, content);
                                        });
                                    }
                                });
                            }

                            // Setup for remaining textareas
                            textAreas.forEach(textarea => {
                                const field = textarea.getAttribute('data-field');
                                if (field && (
                                    field.includes('character_description') ||
                                    field.includes('general_info') ||
                                    field.includes('personality') ||
                                    field.includes('other') ||
                                    field.includes('origin') ||
                                    field.includes('desire') ||
                                    field.includes('fear') ||
                                    field.includes('connection') ||
                                    field.includes('impact') ||
                                    field.includes('change')
                                )) {
                                    lookup.setupTextAreaListeners(textarea);
                                }
                            });
                            console.log('Character lookup setup complete for standalone staff window');
                        }).catch(error => {
                            console.warn('Character lookup initialization failed in standalone window:', error);
                        });
                    } else {
                        console.warn('CharacterLookup not available in standalone window');
                    }
                }
            </script>
        </body>
        </html>
    `);

    newWindow.document.close();
}

// Export cleanup: only include important visible fields
function cleanStaffExportSections(member) {
    const cleanedMember = {};

    // Basic Information
    if (member.name) cleanedMember.name = member.name;
    if (member.college) cleanedMember.college = member.college;
    if (member.character_description && !isValueEmpty(member.character_description)) {
        cleanedMember.character_description = member.character_description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }
    if (member.general_info && !isValueEmpty(member.general_info)) {
        cleanedMember.general_info = member.general_info.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }

    // Character Information (origin, desire, fear, connection, impact, change)
    if (member.character_info) {
        const charInfo = {};
        ['origin', 'desire', 'fear', 'connection', 'impact', 'change'].forEach(key => {
            if (member.character_info[key] && !isValueEmpty(member.character_info[key])) {
                // Strip HTML tags for cleaner export
                charInfo[key] = member.character_info[key].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            }
        });
        if (Object.keys(charInfo).length > 0) {
            cleanedMember.character_info = charInfo;
        }
    }

    // GM Only notes (personality, other)
    if (member.gm_only) {
        const gmNotes = {};
        ['personality', 'other'].forEach(key => {
            if (member.gm_only[key] && !isValueEmpty(member.gm_only[key])) {
                // Strip HTML tags for cleaner export
                gmNotes[key] = member.gm_only[key].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            }
        });
        if (Object.keys(gmNotes).length > 0) {
            cleanedMember.gm_notes = gmNotes;
        }
    }

    return cleanedMember;
}
