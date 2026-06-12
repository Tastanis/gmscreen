// Students Management JavaScript
// Shared behavior lives in ../templates/js/character-sheet-base.js; this file
// supplies the student-specific configuration, detail form, and skills logic.

const studentsEndpoint = (typeof STUDENTS_ENDPOINT !== 'undefined' && STUDENTS_ENDPOINT)
    ? STUDENTS_ENDPOINT
    : 'index.php';

// Skills list for dropdown
const SKILLS_LIST = {
    'Crafting Skills': [
        'Alchemy', 'Architecture', 'Blacksmithing', 'Carpentry', 'Cooking',
        'Fletching', 'Forgery', 'Jewelry', 'Mechanics', 'Tailoring'
    ],
    'Exploration Skills': [
        'Climb', 'Drive', 'Endurance', 'Gymnastics', 'Heal', 'Jump',
        'Lift', 'Navigate', 'Ride', 'Swim', 'Track'
    ],
    'Interpersonal Skills': [
        'Brag', 'Empathize', 'Flirt', 'Gamble', 'Handle Animals', 'Interrogate',
        'Intimidate', 'Lead', 'Lie', 'Music', 'Perform', 'Persuade', 'Read Person'
    ],
    'Intrigue Skills': [
        'Alertness', 'Conceal Object', 'Disguise', 'Eavesdrop', 'Escape Artist',
        'Hide', 'Pick Lock', 'Pick Pocket', 'Sabotage', 'Search'
    ],
    'Lore Skills': [
        'Culture', 'Criminal Underworld', 'History', 'Magic', 'Monsters',
        'Nature', 'Psionics', 'Religion', 'Rumors', 'Society', 'Strategy', 'Timescape'
    ]
};

CharacterSheetBase.init({
    type: 'student',
    plural: 'students',
    entityLabel: 'student',
    endpoint: studentsEndpoint,
    idField: 'student_id',
    actions: {
        load: 'load_students',
        save: 'save_student',
        add: 'add_student',
        remove: 'delete_student',
        export: 'export_students'
    },
    gridId: 'students-grid',
    modalId: 'student-modal',
    modalNameId: 'modal-student-name',
    detailsSelector: '.student-details',
    addBtnId: 'add-student-btn',
    exportBtnId: 'export-students-btn',
    exportSelectedBtnId: 'export-selected-students-btn',
    exportButtonLabel: '📤 Export Students',
    modalOpenInputSelector: 'input, select, textarea',
    filterParams: [
        { param: 'filter_grade', key: 'grade' },
        { param: 'filter_college', key: 'college' },
        { param: 'filter_club', key: 'club' }
    ],
    filterSelects: [
        { id: 'filter-grade', key: 'grade' },
        { id: 'filter-college', key: 'college' }
    ],
    getSelected: () => selectedStudent,
    setSelected: value => { selectedStudent = value; },
    getAll: () => window.allStudents,
    setAll: list => {
        window.allStudents = list;
        window.studentsLoaded = true;
    },
    cardInfoHtml: student => `
        <div class="student-grade">${escapeHtml(student.grade_level || 'Unknown Grade')}</div>
        <div class="student-college">${escapeHtml(student.college || 'No College')}</div>
    `,
    createDetailForm: student => createStudentDetailForm(student),
    cleanExportRecord: student => cleanStudentExportSections(student),
    prepareFieldValue: prepareStudentFieldValue,
    expand: () => expandStudentToNewTab(),
    globalNames: {
        loadCharacters: 'loadStudents',
        displayCharacters: 'displayStudents',
        createCharacterCard: 'createStudentCard',
        openCharacterModal: 'openStudentModal',
        closeCharacterModal: 'closeStudentModal',
        saveCharacterField: 'saveStudentField',
        addCharacter: 'addStudent',
        deleteCharacter: 'deleteStudent',
        toggleFavorite: 'toggleStudentFavorite',
        uploadPortrait: 'uploadStudentPortrait',
        exportSelectedCharacters: 'exportSelectedStudents',
        toggleExportSelection: 'toggleStudentExportSelection'
    }
});

// Student-specific save handling: clubs become arrays, relationship subfields
// are merged into the full relationships object before saving
function prepareStudentFieldValue(field, value) {
    if (field === 'clubs') {
        value = value.split(',').map(club => club.trim()).filter(club => club);
    }

    if (field.startsWith('relationships.')) {
        const relationshipField = field.split('.')[1];
        const student = selectedStudent;
        if (!student) return null;

        if (!student.relationships) {
            student.relationships = {};
        }
        student.relationships[relationshipField] = value;

        return {
            field: 'relationships',
            debounceKey: 'relationships',
            getValue: () => JSON.stringify(student.relationships)
        };
    }

    return { field: field, value: value };
}

// Create student detail form
function createStudentDetailForm(student) {
    const relationships = student.relationships || {};
    const conflictEngine = student.conflict_engine || {};
    const tensionWeb = student.tension_web || [];

    // Handle both old image_path and new images array for backward compatibility
    let images = [];
    if (student.images && student.images.length > 0) {
        images = student.images;
    } else if (student.image_path) {
        images = [student.image_path];
    }

    const imageHtml = images.length > 0 ?
        createImageGallery(images, student.student_id, 'student', student.image_adjustments) :
        `<div class="student-portrait-placeholder">No Photo</div>`;

    const uploadButton = isGM ?
        `<button class="upload-portrait-btn" onclick="uploadStudentPortrait('${student.student_id}')">Upload Photo</button>` : '';

    // Create skills options HTML
    const skillsOptionsHtml = Object.keys(SKILLS_LIST).map(category => {
        return `<optgroup label="${category}">` +
            SKILLS_LIST[category].map(skill =>
                `<option value="${skill}">${skill}</option>`
            ).join('') +
            `</optgroup>`;
    }).join('');

    // Create selected skills display
    const selectedSkills = student.skills || [];
    const skillsDisplayHtml = selectedSkills.map(skill =>
        `<span class="skill-tag">${escapeHtml(skill)} ${isGM ? `<span class="remove-skill" onclick="removeSkill('${student.student_id}', '${escapeHtml(skill)}')" role="button" aria-label="Remove skill">×</span>` : ''}</span>`
    ).join('');

    // Build tension web entries HTML
    const tensionWebHtml = tensionWeb.map((entry, index) => `
        <div class="tension-web-entry" data-index="${index}">
            <div class="tension-web-entry-header">
                <strong class="tension-web-name">${escapeHtml(entry.name || '')}</strong>
                <span class="tension-web-role">(${escapeHtml(entry.role || '')})</span>
                ${isGM ? `<button class="btn-remove-tension" onclick="removeTensionWebEntry('${student.student_id}', ${index})" title="Remove entry" aria-label="Remove entry">&times;</button>` : ''}
            </div>
            <div class="tension-web-description">${entry.description || ''}</div>
        </div>
    `).join('');

    // Want tag options
    const wantTagOptions = ['Legacy', 'Recognition', 'Freedom', 'Power', 'Knowledge', 'Connection', 'Survival', 'Justice', 'Creation', 'Redemption'];
    const currentWantTag = conflictEngine.want_tag || '';

    return `
        <div class="student-form">
            <!-- Portrait Section -->
            <div class="student-portrait-section">
                ${imageHtml}
                ${uploadButton}
            </div>

            <!-- Basic Information -->
            <div class="form-section">
                <h3>Basic Information</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label>Name:</label>
                        ${isGM ?
                            `<input type="text" value="${escapeHtml(student.name)}" data-field="name">` :
                            `<div class="readonly-field">${escapeHtml(student.name)}</div>`
                        }
                    </div>
                    <div class="form-group">
                        <label>Race:</label>
                        ${isGM ?
                            `<input type="text" value="${escapeHtml(student.race || '')}" data-field="race" placeholder="Enter race">` :
                            `<div class="readonly-field">${escapeHtml(student.race || 'Unknown')}</div>`
                        }
                    </div>
                    <div class="form-group form-group-half">
                        <label>Age:</label>
                        ${isGM ?
                            `<input type="text" value="${escapeHtml(student.age || '')}" data-field="age" placeholder="Enter age">` :
                            `<div class="readonly-field">${escapeHtml(student.age || 'Unknown')}</div>`
                        }
                    </div>
                    <div class="form-group form-group-half">
                        <label>Job:</label>
                        ${isGM ?
                            `<input type="text" value="${escapeHtml(student.job || '')}" data-field="job" placeholder="Enter job/position">` :
                            `<div class="readonly-field">${escapeHtml(student.job || 'None')}</div>`
                        }
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Grade Level:</label>
                        ${isGM ?
                            `<select data-field="grade_level">
                                <option value="1st Year" ${student.grade_level === '1st Year' ? 'selected' : ''}>1st Year</option>
                                <option value="2nd Year" ${student.grade_level === '2nd Year' ? 'selected' : ''}>2nd Year</option>
                                <option value="3rd Year" ${student.grade_level === '3rd Year' ? 'selected' : ''}>3rd Year</option>
                                <option value="4th Year" ${student.grade_level === '4th Year' ? 'selected' : ''}>4th Year</option>
                            </select>` :
                            `<div class="readonly-field">${escapeHtml(student.grade_level || 'Unknown')}</div>`
                        }
                    </div>
                    <div class="form-group">
                        <label>College:</label>
                        ${isGM ?
                            `<select data-field="college">
                                <option value="">No College</option>
                                <option value="Silverquill" ${student.college === 'Silverquill' ? 'selected' : ''}>Silverquill</option>
                                <option value="Prismari" ${student.college === 'Prismari' ? 'selected' : ''}>Prismari</option>
                                <option value="Witherbloom" ${student.college === 'Witherbloom' ? 'selected' : ''}>Witherbloom</option>
                                <option value="Lorehold" ${student.college === 'Lorehold' ? 'selected' : ''}>Lorehold</option>
                                <option value="Quandrix" ${student.college === 'Quandrix' ? 'selected' : ''}>Quandrix</option>
                            </select>` :
                            `<div class="readonly-field">${escapeHtml(student.college || 'No College')}</div>`
                        }
                    </div>
                    <div class="form-group">
                        <label>Clubs:</label>
                        ${isGM ?
                            `<input type="text" value="${escapeHtml((student.clubs || []).join(', '))}" data-field="clubs" placeholder="Comma-separated list">` :
                            `<div class="readonly-field">
                                <div class="clubs-container">
                                    ${(student.clubs || []).map(club => `<span class="club-tag">${escapeHtml(club)}</span>`).join('')}
                                </div>
                             </div>`
                        }
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Edge:</label>
                        ${isGM ?
                            `<input type="text" value="${escapeHtml(student.edge || '')}" data-field="edge" placeholder="Character edge/advantage">` :
                            `<div class="readonly-field">${escapeHtml(student.edge || 'None')}</div>`
                        }
                    </div>
                    <div class="form-group">
                        <label>Bane:</label>
                        ${isGM ?
                            `<input type="text" value="${escapeHtml(student.bane || '')}" data-field="bane" placeholder="Character bane/weakness">` :
                            `<div class="readonly-field">${escapeHtml(student.bane || 'None')}</div>`
                        }
                    </div>
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
                        ${isGM ? `
                        <select class="ce-want-tag-select" data-field="conflict_engine.want_tag">
                            <option value="">No tag</option>
                            ${wantTagOptions.map(tag => `<option value="${tag}" ${currentWantTag === tag ? 'selected' : ''}>${tag}</option>`).join('')}
                        </select>` : ''}
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
                        <div class="rich-text-container" data-field="conflict_engine.obstacle" data-placeholder="What stands in the way of what they want?"></div>
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
                        <div class="rich-text-container" data-field="conflict_engine.consequence" data-placeholder="What happens if they fail or succeed? What's at stake?"></div>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- Tension Web Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only tension-web-section">
                <h3>Tension Web</h3>
                <div class="tension-web-list" id="tension-web-${student.student_id}">
                    ${tensionWebHtml || '<p class="tension-web-empty">No tension web entries yet.</p>'}
                </div>
                <div class="tension-web-add">
                    <div class="tension-web-add-row">
                        <input type="text" id="tw-name-${student.student_id}" placeholder="Name..." class="tw-input tw-name-input">
                        <input type="text" id="tw-role-${student.student_id}" placeholder="Role (e.g. mentor, rival)..." class="tw-input tw-role-input">
                    </div>
                    <div class="tension-web-add-row">
                        <input type="text" id="tw-desc-${student.student_id}" placeholder="Describe the tension/friction..." class="tw-input tw-desc-input">
                        <button class="btn-add-tension" onclick="addTensionWebEntry('${student.student_id}')">+ Add</button>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- Pressure Point Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only pressure-point-section">
                <h3>Pressure Point</h3>
                <div class="rich-text-container" data-field="pressure_point" data-placeholder="When [trigger], they [behavior]... What pushes this character's buttons?"></div>
            </div>
            ` : ''}

            <!-- Trajectory Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only trajectory-section">
                <h3>Trajectory</h3>
                <div class="rich-text-container" data-field="trajectory" data-placeholder="Without intervention, what happens to this character? (single sentence arc)"></div>
            </div>
            ` : ''}

            <!-- Skills Section -->
            <div class="form-section">
                <h3>Skills</h3>
                <div class="skills-container">
                    <div class="selected-skills">
                        ${skillsDisplayHtml}
                    </div>
                    ${isGM ? `
                        <div class="skills-controls">
                            <select id="skills-dropdown-${student.student_id}" class="skills-dropdown">
                                <option value="">Select a skill...</option>
                                ${skillsOptionsHtml}
                            </select>
                            <button type="button" onclick="addSkillFromDropdown('${student.student_id}')">Add</button>
                            <input type="text" id="custom-skill-${student.student_id}" placeholder="Or type custom skill..." class="custom-skill-input">
                            <button type="button" onclick="addCustomSkill('${student.student_id}')">Add Custom</button>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- Relationships Section -->
            <div class="form-section">
                <h3>PC Relationships</h3>
                <div class="pc-relationships-list">
                    <div class="pc-relationship">
                        <div class="pc-relationship-header">
                            <label>Cal:</label>
                            ${isGM ?
                                `<input type="text" value="${escapeHtml(relationships.cal_points || '')}" data-field="relationships.cal_points" placeholder="Points" class="relationship-points">` :
                                `<span class="readonly-points">${escapeHtml(relationships.cal_points || '0')}</span>`
                            }
                        </div>
                        ${isGM ?
                            `<div class="rich-text-container small" data-field="relationships.cal_notes" data-placeholder="Relationship notes..."></div>` :
                            `<div class="readonly-field readonly-textarea">${escapeHtml(relationships.cal_notes || 'No relationship notes')}</div>`
                        }
                    </div>

                    <div class="pc-relationship">
                        <div class="pc-relationship-header">
                            <label>Zepha:</label>
                            ${isGM ?
                                `<input type="text" value="${escapeHtml(relationships.zepha_points || '')}" data-field="relationships.zepha_points" placeholder="Points" class="relationship-points">` :
                                `<span class="readonly-points">${escapeHtml(relationships.zepha_points || '0')}</span>`
                            }
                        </div>
                        ${isGM ?
                            `<div class="rich-text-container small" data-field="relationships.zepha_notes" data-placeholder="Relationship notes..."></div>` :
                            `<div class="readonly-field readonly-textarea">${escapeHtml(relationships.zepha_notes || 'No relationship notes')}</div>`
                        }
                    </div>

                    <div class="pc-relationship">
                        <div class="pc-relationship-header">
                            <label>Sharon:</label>
                            ${isGM ?
                                `<input type="text" value="${escapeHtml(relationships.sharon_points || '')}" data-field="relationships.sharon_points" placeholder="Points" class="relationship-points">` :
                                `<span class="readonly-points">${escapeHtml(relationships.sharon_points || '0')}</span>`
                            }
                        </div>
                        ${isGM ?
                            `<div class="rich-text-container small" data-field="relationships.sharon_notes" data-placeholder="Relationship notes..."></div>` :
                            `<div class="readonly-field readonly-textarea">${escapeHtml(relationships.sharon_notes || 'No relationship notes')}</div>`
                        }
                    </div>

                    <div class="pc-relationship">
                        <div class="pc-relationship-header">
                            <label>Indigo:</label>
                            ${isGM ?
                                `<input type="text" value="${escapeHtml(relationships.indigo_points || '')}" data-field="relationships.indigo_points" placeholder="Points" class="relationship-points">` :
                                `<span class="readonly-points">${escapeHtml(relationships.indigo_points || '0')}</span>`
                            }
                        </div>
                        ${isGM ?
                            `<div class="rich-text-container small" data-field="relationships.indigo_notes" data-placeholder="Relationship notes..."></div>` :
                            `<div class="readonly-field readonly-textarea">${escapeHtml(relationships.indigo_notes || 'No relationship notes')}</div>`
                        }
                    </div>
                </div>
            </div>

            <!-- Director's Notes Section (GM Only, collapsed by default) -->
            ${isGM ? `
            <div class="form-section gm-only directors-notes-section">
                <h3 class="directors-notes-toggle" onclick="toggleDirectorsNotes(this)">Director's Notes <span class="toggle-arrow">&#9660;</span></h3>
                <div class="directors-notes-content" style="display: none;">
                    <div class="rich-text-container large" data-field="directors_notes" data-placeholder="Origin, background, and other GM notes..."></div>
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

// Skills management functions
function addSkillFromDropdown(studentId) {
    const dropdown = document.getElementById(`skills-dropdown-${studentId}`);
    const skill = dropdown.value;

    if (skill && skill.trim() !== '') {
        addSkillToStudent(studentId, skill);
        dropdown.value = ''; // Reset dropdown
    }
}

function addCustomSkill(studentId) {
    const input = document.getElementById(`custom-skill-${studentId}`);
    const skill = input.value.trim();

    if (skill !== '') {
        addSkillToStudent(studentId, skill);
        input.value = ''; // Clear input
    }
}

function addSkillToStudent(studentId, skill) {
    if (!selectedStudent || selectedStudent.student_id !== studentId) return;

    // Check if skill already exists
    const currentSkills = selectedStudent.skills || [];
    if (currentSkills.includes(skill)) {
        UIKit.toast('Skill already added', 'warning');
        return;
    }

    // Add skill to local data
    const newSkills = [...currentSkills, skill];
    selectedStudent.skills = newSkills;

    // Save to server
    const formData = new FormData();
    formData.append('action', 'save_student');
    formData.append('student_id', studentId);
    formData.append('field', 'skills');
    formData.append('value', JSON.stringify(newSkills));

    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the skills display
            updateSkillsDisplay(studentId);
        } else {
            // Revert local change
            selectedStudent.skills = currentSkills;
            showError('Failed to add skill');
        }
    })
    .catch(error => {
        // Revert local change
        selectedStudent.skills = currentSkills;
        console.error('Error adding skill:', error);
        showError('Error adding skill');
    });
}

function removeSkill(studentId, skill) {
    if (!selectedStudent || selectedStudent.student_id !== studentId) return;

    const currentSkills = selectedStudent.skills || [];
    const newSkills = currentSkills.filter(s => s !== skill);
    selectedStudent.skills = newSkills;

    // Save to server
    const formData = new FormData();
    formData.append('action', 'save_student');
    formData.append('student_id', studentId);
    formData.append('field', 'skills');
    formData.append('value', JSON.stringify(newSkills));

    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the skills display
            updateSkillsDisplay(studentId);
        } else {
            // Revert local change
            selectedStudent.skills = currentSkills;
            showError('Failed to remove skill');
        }
    })
    .catch(error => {
        // Revert local change
        selectedStudent.skills = currentSkills;
        console.error('Error removing skill:', error);
        showError('Error removing skill');
    });
}

function updateSkillsDisplay(studentId) {
    const skillsContainer = document.querySelector('.selected-skills');
    if (!skillsContainer || !selectedStudent) return;

    const skills = selectedStudent.skills || [];
    skillsContainer.innerHTML = skills.map(skill =>
        `<span class="skill-tag">${escapeHtml(skill)} ${isGM ? `<span class="remove-skill" onclick="removeSkill('${studentId}', '${escapeHtml(skill)}')" role="button" aria-label="Remove skill">×</span>` : ''}</span>`
    ).join('');
}

// Expand student to new tab
function expandStudentToNewTab() {
    if (!selectedStudent) return;

    const newWindow = window.open('', '_blank');
    const student = selectedStudent;
    const endpoint = studentsEndpoint;

    newWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(student.name)} - Student Details</title>
            <link rel="stylesheet" href="../../../css/style.css">
            <link rel="stylesheet" href="../../css/theme.css">
            <link rel="stylesheet" href="../../css/ui-kit.css">
            <link rel="stylesheet" href="../templates/css/character-sheet-base.css">
            <link rel="stylesheet" href="css/students.css">
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
                .student-details { grid-template-columns: 200px 1fr; }
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
                <h1>${escapeHtml(student.name)} - Student Details</h1>
                <p>${escapeHtml(student.grade_level || 'Unknown Grade')} • ${escapeHtml(student.college || 'No College')}</p>
                <p><small>Changes auto-save as you type</small></p>
            </div>
            <div class="standalone-content">
                <div class="student-details">
                    ${createStudentDetailForm(student)}
                </div>
            </div>

            <script src="../../js/ui-kit.js"></script>
            <script src="../gm/js/character-lookup.js"></script>
            <script src="../gm/js/rich-text-editor.js"></script>
            <script>
                // Copy necessary variables and functions to the popout
                const isGM = ${isGM};
                const currentUser = '${currentUser}';
                const studentData = ${JSON.stringify(student)};
                const studentsEndpoint = '${endpoint}';

                // Save function for popout window (GM only)
                function saveStudentField(studentId, field, value) {
                    if (!isGM) return;

                    // Handle clubs as array
                    if (field === 'clubs') {
                        value = value.split(',').map(club => club.trim()).filter(club => club);
                    }

                    // Handle nested relationship fields
                    if (field.startsWith('relationships.')) {
                        const relationshipField = field.split('.')[1];
                        const formData = new FormData();
                        formData.append('action', 'save_student');
                        formData.append('student_id', studentId);
                        formData.append('field', 'relationships');

                        // Get current relationships and update the specific field
                        const currentRelationships = studentData.relationships || {};
                        currentRelationships[relationshipField] = value;
                        formData.append('value', JSON.stringify(currentRelationships));

                        fetch(studentsEndpoint, {
                            method: 'POST',
                            body: formData
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                studentData.relationships = currentRelationships;
                                showSaveIndicator();
                            } else {
                                console.error('Failed to save relationship:', data.error);
                            }
                        })
                        .catch(error => {
                            console.error('Error saving relationship:', error);
                        });
                        return;
                    }

                    const formData = new FormData();
                    formData.append('action', 'save_student');
                    formData.append('student_id', studentId);
                    formData.append('field', field);
                    formData.append('value', Array.isArray(value) ? JSON.stringify(value) : value);

                    fetch(studentsEndpoint, {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showSaveIndicator();
                            // Update local student data
                            if (field.startsWith('details.')) {
                                const detailField = field.split('.')[1];
                                if (!studentData.details) studentData.details = {};
                                studentData.details[detailField] = value;
                            } else {
                                studentData[field] = value;
                            }
                        } else {
                            console.error('Failed to save field:', data.error);
                        }
                    })
                    .catch(error => {
                        console.error('Error saving field:', error);
                    });
                }

                function notify(message, type) {
                    if (window.UIKit) {
                        UIKit.toast(message, type);
                    } else {
                        console.warn(message);
                    }
                }

                // Skills management for popout
                function addSkillFromDropdown(studentId) {
                    const dropdown = document.getElementById('skills-dropdown-' + studentId);
                    const skill = dropdown.value;

                    if (skill && skill.trim() !== '') {
                        addSkillToStudent(studentId, skill);
                        dropdown.value = '';
                    }
                }

                function addCustomSkill(studentId) {
                    const input = document.getElementById('custom-skill-' + studentId);
                    const skill = input.value.trim();

                    if (skill !== '') {
                        addSkillToStudent(studentId, skill);
                        input.value = '';
                    }
                }

                function addSkillToStudent(studentId, skill) {
                    const currentSkills = studentData.skills || [];
                    if (currentSkills.includes(skill)) {
                        notify('Skill already added', 'warning');
                        return;
                    }

                    const newSkills = [...currentSkills, skill];
                    studentData.skills = newSkills;

                    const formData = new FormData();
                    formData.append('action', 'save_student');
                    formData.append('student_id', studentId);
                    formData.append('field', 'skills');
                    formData.append('value', JSON.stringify(newSkills));

                    fetch(studentsEndpoint, {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            updateSkillsDisplay(studentId);
                            showSaveIndicator();
                        } else {
                            studentData.skills = currentSkills;
                            notify('Failed to add skill', 'error');
                        }
                    })
                    .catch(error => {
                        studentData.skills = currentSkills;
                        console.error('Error adding skill:', error);
                    });
                }

                function removeSkill(studentId, skill) {
                    const currentSkills = studentData.skills || [];
                    const newSkills = currentSkills.filter(s => s !== skill);
                    studentData.skills = newSkills;

                    const formData = new FormData();
                    formData.append('action', 'save_student');
                    formData.append('student_id', studentId);
                    formData.append('field', 'skills');
                    formData.append('value', JSON.stringify(newSkills));

                    fetch(studentsEndpoint, {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            updateSkillsDisplay(studentId);
                            showSaveIndicator();
                        } else {
                            studentData.skills = currentSkills;
                            notify('Failed to remove skill', 'error');
                        }
                    })
                    .catch(error => {
                        studentData.skills = currentSkills;
                        console.error('Error removing skill:', error);
                    });
                }

                function updateSkillsDisplay(studentId) {
                    const skillsContainer = document.querySelector('.selected-skills');
                    if (!skillsContainer) return;

                    const skills = studentData.skills || [];
                    skillsContainer.innerHTML = skills.map(skill =>
                        '<span class="skill-tag">' + escapeHtml(skill) +
                        (isGM ? ' <span class="remove-skill" onclick="removeSkill(\\'' + studentId + '\\', \\'' + escapeHtml(skill) + '\\')">×</span>' : '') +
                        '</span>'
                    ).join('');
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
                                    saveStudentField('${student.student_id}', field, value);
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
                                        field.includes('backstory') ||
                                        field.includes('core_want') ||
                                        field.includes('core_fear') ||
                                        field.includes('other') ||
                                        field.includes('notes') ||
                                        field.includes('personality') ||
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
                                            saveStudentField('${student.student_id}', fieldName, content);
                                        });
                                    }
                                });
                            }

                            // Setup for remaining textareas
                            textAreas.forEach(textarea => {
                                const field = textarea.getAttribute('data-field');
                                if (field && (
                                    field.includes('backstory') ||
                                    field.includes('core_want') ||
                                    field.includes('core_fear') ||
                                    field.includes('other') ||
                                    field.includes('notes') ||
                                    field.includes('personality') ||
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
                            console.log('Character lookup setup complete for standalone student window');
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
function cleanStudentExportSections(student) {
    const cleanedStudent = {};

    // Basic Information
    if (student.name) cleanedStudent.name = student.name;
    if (student.race) cleanedStudent.race = student.race;
    if (student.age) cleanedStudent.age = student.age;
    if (student.job) cleanedStudent.job = student.job;
    if (student.grade_level) cleanedStudent.grade_level = student.grade_level;
    if (student.college) cleanedStudent.college = student.college;
    if (student.clubs && student.clubs.length > 0) cleanedStudent.clubs = student.clubs;
    if (student.edge) cleanedStudent.edge = student.edge;
    if (student.bane) cleanedStudent.bane = student.bane;

    // Skills
    if (student.skills && student.skills.length > 0) cleanedStudent.skills = student.skills;

    // Conflict Engine
    if (student.conflict_engine) {
        const ce = {};
        ['want', 'want_tag', 'obstacle', 'action', 'consequence'].forEach(key => {
            if (student.conflict_engine[key] && !isValueEmpty(student.conflict_engine[key])) {
                ce[key] = student.conflict_engine[key].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            }
        });
        if (Object.keys(ce).length > 0) {
            cleanedStudent.conflict_engine = ce;
        }
    }

    // Tension Web
    if (student.tension_web && Array.isArray(student.tension_web) && student.tension_web.length > 0) {
        const tw = student.tension_web.map(entry => {
            const clean = {};
            if (entry.name) clean.name = entry.name.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            if (entry.role) clean.role = entry.role.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            if (entry.description) clean.description = entry.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            return clean;
        }).filter(entry => entry.name || entry.role || entry.description);
        if (tw.length > 0) {
            cleanedStudent.tension_web = tw;
        }
    }

    // Pressure Point
    if (student.pressure_point && !isValueEmpty(student.pressure_point)) {
        cleanedStudent.pressure_point = student.pressure_point.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }

    // Trajectory
    if (student.trajectory && !isValueEmpty(student.trajectory)) {
        cleanedStudent.trajectory = student.trajectory.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }

    // Director's Notes
    if (student.directors_notes && !isValueEmpty(student.directors_notes)) {
        cleanedStudent.directors_notes = student.directors_notes.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }

    // Legacy Character Information (origin, desire, fear, connection, impact, change)
    if (student.character_info) {
        const charInfo = {};
        ['origin', 'desire', 'fear', 'connection', 'impact', 'change'].forEach(key => {
            if (student.character_info[key] && !isValueEmpty(student.character_info[key])) {
                charInfo[key] = student.character_info[key].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            }
        });
        if (Object.keys(charInfo).length > 0) {
            cleanedStudent.character_info = charInfo;
        }
    }

    // Other Notes (from details.other)
    if (student.details && student.details.other && !isValueEmpty(student.details.other)) {
        cleanedStudent.other_notes = student.details.other.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }

    return cleanedStudent;
}
