// Students Management JavaScript

const studentsEndpoint = (typeof STUDENTS_ENDPOINT !== 'undefined' && STUDENTS_ENDPOINT)
    ? STUDENTS_ENDPOINT
    : 'index.php';

// Store rich text editor instances
let modalRichTextEditors = new Map();

// Initialize character lookup when ready
function initializeCharacterLookup() {
    if (window.characterLookup && !window.characterLookup.isReady()) {
        window.characterLookup.init().then(() => {
            console.log('Character lookup initialized for students section');
        }).catch(error => {
            console.warn('Character lookup initialization failed:', error);
        });
    }
}

// Setup rich text editors for modal
function setupModalRichTextEditors(container, studentData) {
    if (typeof RichTextEditor === 'undefined') {
        console.warn('RichTextEditor not available');
        return;
    }
    
    // Clean up existing editors
    cleanupModalRichTextEditors();
    
    const containers = container.querySelectorAll('.rich-text-container');
    containers.forEach(richContainer => {
        const field = richContainer.getAttribute('data-field');
        const placeholder = richContainer.getAttribute('data-placeholder') || 'Enter text...';
        
        if (field) {
            // Create rich text editor
            const editor = new RichTextEditor(richContainer, {
                placeholder: placeholder + ' Type [[character name]] to link to characters'
            });
            
            editor.init();
            
            // Set content from student data
            const fieldValue = getNestedFieldValue(studentData, field);
            if (fieldValue) {
                editor.setContent(fieldValue);
            }
            
            // Setup auto-save
            editor.onChange((content) => {
                saveStudentField(studentData.student_id, field, content);
            });
            
            // Connect to character lookup system
            if (window.characterLookup && window.characterLookup.isReady()) {
                const editorElement = editor.getEditor();
                if (editorElement) {
                    console.log('Connecting rich text editor to character lookup for field:', field);
                    window.characterLookup.setupEditorListeners(editorElement);
                }
            } else {
                // Try to initialize character lookup if not ready
                setTimeout(() => {
                    if (window.characterLookup && window.characterLookup.isReady()) {
                        const editorElement = editor.getEditor();
                        if (editorElement) {
                            console.log('Delayed connection of rich text editor to character lookup for field:', field);
                            window.characterLookup.setupEditorListeners(editorElement);
                        }
                    }
                }, 500);
            }
            
            // Store editor reference
            modalRichTextEditors.set(field, editor);
        }
    });
    
    console.log('Set up', modalRichTextEditors.size, 'rich text editors for student modal');
}

// Clean up rich text editors
function cleanupModalRichTextEditors() {
    modalRichTextEditors.forEach((editor, field) => {
        if (editor && editor.destroy) {
            editor.destroy();
        }
    });
    modalRichTextEditors.clear();
}

// Get nested field value from student data
function getNestedFieldValue(studentData, field) {
    const parts = field.split('.');
    let value = studentData;
    
    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            return '';
        }
    }
    
    return value || '';
}

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

// Setup event listeners
function setupEventListeners() {
    // Initialize character lookup
    setTimeout(initializeCharacterLookup, 500);
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function() {
            currentFilters.search = this.value.trim();
            loadStudents();
        }, 300));
    }
    
    // Sort buttons
    document.querySelectorAll('[data-sort]').forEach(btn => {
        btn.addEventListener('click', function() {
            const sortType = this.getAttribute('data-sort');
            
            // Update active state
            document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            currentSort = sortType;
            loadStudents();
        });
    });
    
    // Filter selects
    const gradeFilter = document.getElementById('filter-grade');
    if (gradeFilter) {
        gradeFilter.addEventListener('change', function() {
            currentFilters.grade = this.value;
            loadStudents();
        });
    }
    
    const collegeFilter = document.getElementById('filter-college');
    if (collegeFilter) {
        collegeFilter.addEventListener('change', function() {
            currentFilters.college = this.value;
            loadStudents();
        });
    }
    
    // Favorites toggle
    const favoritesToggle = document.getElementById('favorites-toggle');
    if (favoritesToggle) {
        favoritesToggle.addEventListener('click', function() {
            currentFilters.favorites = !currentFilters.favorites;
            this.classList.toggle('active', currentFilters.favorites);
            loadStudents();
        });
    }
    
    // Add student button (GM only)
    if (isGM) {
        const addStudentBtn = document.getElementById('add-student-btn');
        if (addStudentBtn) {
            addStudentBtn.addEventListener('click', addStudent);
        }
        
        // Export button (GM only)
        const exportBtn = document.getElementById('export-students-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportStudents);
        }
        
        // Delete button (GM only)
        const modalDeleteBtn = document.getElementById('modal-delete-btn');
        if (modalDeleteBtn) {
            modalDeleteBtn.addEventListener('click', deleteStudent);
        }
    }
    
    // Modal controls (available to all users)
    const modalFavoriteBtn = document.getElementById('modal-favorite-btn');
    if (modalFavoriteBtn) {
        modalFavoriteBtn.addEventListener('click', toggleStudentFavorite);
    }
    
    // Expand button (available to all users)
    const modalExpandBtn = document.getElementById('modal-expand-btn');
    if (modalExpandBtn) {
        modalExpandBtn.addEventListener('click', expandStudentToNewTab);
    }
    
    // Modal close on background click
    const modal = document.getElementById('student-modal');
    if (modal) {
        let backgroundPointerDown = false;

        modal.addEventListener('mousedown', function(e) {
            backgroundPointerDown = e.target === modal;
        });

        modal.addEventListener('mouseup', function(e) {
            if (backgroundPointerDown && e.target === modal) {
                closeStudentModal();
            }
            backgroundPointerDown = false;
        });
    }
}

// Load students from server
function loadStudents() {
    showLoading(true);
    
    const formData = new FormData();
    formData.append('action', 'load_students');
    formData.append('sort_by', currentSort);
    formData.append('filter_grade', currentFilters.grade);
    formData.append('filter_college', currentFilters.college);
    formData.append('filter_club', currentFilters.club);
    formData.append('show_favorites', currentFilters.favorites.toString());
    formData.append('search_term', currentFilters.search);
    
    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        if (data.success) {
            displayStudents(data.students);
            // Store students globally for auto-open functionality
            window.allStudents = data.students;
            window.studentsLoaded = true;
        } else {
            console.error('Failed to load students:', data.error);
            showError('Failed to load students');
        }
    })
    .catch(error => {
        showLoading(false);
        console.error('Error loading students:', error);
        showError('Error loading students');
    });
}

// Display students in grid
function displayStudents(students) {
    const grid = document.getElementById('students-grid');
    
    if (students.length === 0) {
        grid.innerHTML = `
            <div class="no-students">
                <div class="no-students-icon">👥</div>
                <p>No students found matching your criteria.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = students.map(student => createStudentCard(student)).join('');
    
    // Add click event listeners to cards
    grid.querySelectorAll('.student-card').forEach(card => {
        card.addEventListener('click', function() {
            const studentId = this.getAttribute('data-student-id');
            const student = students.find(s => s.student_id === studentId);
            if (student) {
                openStudentModal(student);
            }
        });
    });
}

// Create student card HTML
function createStudentCard(student) {
    const isFavorite = student.favorites && student.favorites[currentUser];
    const favoriteIcon = isFavorite ? '<div class="student-favorite">★</div>' : '';
    
    // Handle both old image_path and new images array for backward compatibility
    let thumbnailImage = '';
    if (student.images && student.images.length > 0) {
        thumbnailImage = student.images[0];
    } else if (student.image_path) {
        thumbnailImage = student.image_path;
    }
    
    const imageHtml = thumbnailImage ? 
        `<img src="${escapeHtml(thumbnailImage)}?t=${Date.now()}" alt="${escapeHtml(student.name)}" class="student-thumbnail">` :
        `<div class="student-placeholder">No Photo</div>`;
    
    return `
        <div class="student-card" data-student-id="${escapeHtml(student.student_id)}">
            ${favoriteIcon}
            ${imageHtml}
            <div class="student-name">${escapeHtml(student.name)}</div>
            <div class="student-info">
                <div class="student-grade">${escapeHtml(student.grade_level || 'Unknown Grade')}</div>
                <div class="student-college">${escapeHtml(student.college || 'No College')}</div>
            </div>
        </div>
    `;
}


// Open student detail modal
function openStudentModal(student) {
    selectedStudent = student;
    
    const modal = document.getElementById('student-modal');
    const modalName = document.getElementById('modal-student-name');
    const modalBody = modal.querySelector('.student-details');
    
    modalName.textContent = student.name;
    
    // Update favorite button (available to all users)
    const favoriteBtn = document.getElementById('modal-favorite-btn');
    if (favoriteBtn) {
        const isFavorite = student.favorites && student.favorites[currentUser];
        favoriteBtn.classList.toggle('active', isFavorite);
        favoriteBtn.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
    }
    
    // Build modal content
    modalBody.innerHTML = createStudentDetailForm(student);
    
    // Add event listeners for form inputs (GM only)
    if (isGM) {
        modalBody.querySelectorAll('input, select, textarea').forEach(input => {
            input.addEventListener('change', function() {
                const field = this.getAttribute('data-field');
                const value = this.value;
                saveStudentField(student.student_id, field, value);
            });
        });
    }
    
    // Setup rich text editors
    setupModalRichTextEditors(modalBody, student);
    
    modal.style.display = 'block';
}

// Create student detail form
function createStudentDetailForm(student) {
    const details = student.details || {};
    const relationships = student.relationships || {};
    
    // Handle both old image_path and new images array for backward compatibility
    let images = [];
    if (student.images && student.images.length > 0) {
        images = student.images;
    } else if (student.image_path) {
        images = [student.image_path];
    }
    
    const imageHtml = images.length > 0 ? 
        createImageGallery(images, student.student_id, 'student') :
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
        `<span class="skill-tag">${escapeHtml(skill)} ${isGM ? `<span class="remove-skill" onclick="removeSkill('${student.student_id}', '${escapeHtml(skill)}')">×</span>` : ''}</span>`
    ).join('');
    
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

            <!-- Character Information Section (GM Only) -->
            ${isGM ? `
            <div class="form-section gm-only character-info">
                <h3>Character Information</h3>
                <div class="form-group">
                    <label>Origin:</label>
                    <div class="rich-text-container" data-field="character_info.origin" data-placeholder="Character's origin and background..."></div>
                </div>
                <div class="form-group">
                    <label>Desire:</label>
                    <div class="rich-text-container" data-field="character_info.desire" data-placeholder="What the character desires most..."></div>
                </div>
                <div class="form-group">
                    <label>Fear:</label>
                    <div class="rich-text-container" data-field="character_info.fear" data-placeholder="Character's fears and anxieties..."></div>
                </div>
                <div class="form-group">
                    <label>Connection:</label>
                    <div class="rich-text-container" data-field="character_info.connection" data-placeholder="Important connections to people, places, or things..."></div>
                </div>
                <div class="form-group">
                    <label>Impact:</label>
                    <div class="rich-text-container" data-field="character_info.impact" data-placeholder="How this character affects others..."></div>
                </div>
                <div class="form-group">
                    <label>Change:</label>
                    <div class="rich-text-container" data-field="character_info.change" data-placeholder="How the character grows or changes..."></div>
                </div>
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
                            <label>Frunk:</label>
                            ${isGM ? 
                                `<input type="text" value="${escapeHtml(relationships.frunk_points || '')}" data-field="relationships.frunk_points" placeholder="Points" class="relationship-points">` :
                                `<span class="readonly-points">${escapeHtml(relationships.frunk_points || '0')}</span>`
                            }
                        </div>
                        ${isGM ? 
                            `<div class="rich-text-container small" data-field="relationships.frunk_notes" data-placeholder="Relationship notes..."></div>` :
                            `<div class="readonly-field readonly-textarea">${escapeHtml(relationships.frunk_notes || 'No relationship notes')}</div>`
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

            <!-- Detailed Information -->
            ${isGM ? `
            <div class="form-section">
                <h3>Character Details</h3>
                <div class="form-group">
                    <label>Backstory:</label>
                    <div class="rich-text-container large" data-field="details.backstory" data-placeholder="Character backstory..."></div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Core Want:</label>
                        <div class="rich-text-container medium" data-field="details.core_want" data-placeholder="What does this character want most?"></div>
                    </div>
                    <div class="form-group">
                        <label>Core Fear:</label>
                        <div class="rich-text-container medium" data-field="details.core_fear" data-placeholder="What does this character fear most?"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Other Notes:</label>
                    <div class="rich-text-container medium" data-field="details.other" data-placeholder="Additional notes..."></div>
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

// Close student modal
function closeStudentModal() {
    // Clean up rich text editors
    cleanupModalRichTextEditors();
    
    const modal = document.getElementById('student-modal');
    modal.style.display = 'none';
    selectedStudent = null;
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
                        alert('Skill already added');
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
                            alert('Failed to add skill');
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
                            alert('Failed to remove skill');
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

// Save student field (GM only)
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
        const currentRelationships = selectedStudent.relationships || {};
        currentRelationships[relationshipField] = value;
        formData.append('value', JSON.stringify(currentRelationships));
        
        fetch(studentsEndpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                selectedStudent.relationships = currentRelationships;
            } else {
                console.error('Failed to save relationship:', data.error);
                showError('Failed to save changes');
            }
        })
        .catch(error => {
            console.error('Error saving relationship:', error);
            showError('Error saving changes');
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
        if (!data.success) {
            console.error('Failed to save field:', data.error);
            showError('Failed to save changes');
        }
    })
    .catch(error => {
        console.error('Error saving field:', error);
        showError('Error saving changes');
    });
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
        showError('Skill already added');
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
        `<span class="skill-tag">${escapeHtml(skill)} ${isGM ? `<span class="remove-skill" onclick="removeSkill('${studentId}', '${escapeHtml(skill)}')">×</span>` : ''}</span>`
    ).join('');
}

// Add new student (GM only)
function addStudent() {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'add_student');
    
    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadStudents();
            showSuccess('Student added successfully');
        } else {
            showError('Failed to add student');
        }
    })
    .catch(error => {
        console.error('Error adding student:', error);
        showError('Error adding student');
    });
}

// Toggle student favorite (available to all users)
function toggleStudentFavorite() {
    if (!selectedStudent) return;
    
    const formData = new FormData();
    formData.append('action', 'toggle_favorite');
    formData.append('student_id', selectedStudent.student_id);
    
    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update local student data
            if (!selectedStudent.favorites) {
                selectedStudent.favorites = {};
            }
            selectedStudent.favorites[currentUser] = data.is_favorite;
            
            // Update button appearance
            const favoriteBtn = document.getElementById('modal-favorite-btn');
            if (favoriteBtn) {
                favoriteBtn.classList.toggle('active', data.is_favorite);
                favoriteBtn.title = data.is_favorite ? 'Remove from Favorites' : 'Add to Favorites';
            }
            
            // Refresh grid to show/hide favorite star
            loadStudents();
        } else {
            showError('Failed to update favorite status');
        }
    })
    .catch(error => {
        console.error('Error toggling favorite:', error);
        showError('Error updating favorite');
    });
}

// Delete student (GM only)
function deleteStudent() {
    if (!isGM || !selectedStudent) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedStudent.name}? This action cannot be undone.`)) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete_student');
    formData.append('student_id', selectedStudent.student_id);
    
    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            closeStudentModal();
            loadStudents();
            showSuccess('Student deleted successfully');
        } else {
            showError('Failed to delete student');
        }
    })
    .catch(error => {
        console.error('Error deleting student:', error);
        showError('Error deleting student');
    });
}

// Upload student portrait (GM only)
function uploadStudentPortrait(studentId) {
    if (!isGM) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.webp';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showError('Image file must be smaller than 5MB');
                return;
            }
            
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                showError('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
                return;
            }
            
            uploadImageFile(studentId, file);
        }
    };
    input.click();
}

// Handle the actual file upload
function uploadImageFile(studentId, file) {
    const formData = new FormData();
    formData.append('action', 'upload_portrait');
    formData.append('student_id', studentId);
    formData.append('portrait', file);
    
    // Show upload progress
    showUploadProgress(true);
    
    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        showUploadProgress(false);
        if (data.success) {
            // Update the portrait in the modal
            updatePortraitInModal(data.portrait_path);
            
            // Update the selected student data
            if (selectedStudent) {
                selectedStudent.image_path = data.portrait_path;
            }
            
            // Refresh the grid to show new portrait
            loadStudents();
            
            showSuccess('Portrait uploaded successfully');
        } else {
            showError('Failed to upload portrait: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        showUploadProgress(false);
        console.error('Error uploading portrait:', error);
        showError('Error uploading portrait');
    });
}

// Update portrait in modal
function updatePortraitInModal(portraitPath) {
    const portraitSection = document.querySelector('.student-portrait-section');
    if (portraitSection && selectedStudent) {
        const imageHtml = portraitPath ? 
            `<img src="${escapeHtml(portraitPath)}?t=${Date.now()}" alt="${escapeHtml(selectedStudent.name)}" class="student-portrait">` :
            `<div class="student-portrait-placeholder">No Photo</div>`;
        
        const uploadButton = isGM ? 
            `<button class="upload-portrait-btn" onclick="uploadStudentPortrait('${selectedStudent.student_id}')">Upload Photo</button>` : '';
        
        portraitSection.innerHTML = imageHtml + uploadButton;
    }
}

// Show/hide upload progress
function showUploadProgress(show) {
    const uploadBtns = document.querySelectorAll('.upload-portrait-btn');
    uploadBtns.forEach(btn => {
        if (show) {
            btn.disabled = true;
            btn.textContent = 'Uploading...';
        } else {
            btn.disabled = false;
            btn.textContent = 'Upload Photo';
        }
    });
}

// Utility functions
function showLoading(show) {
    const loading = document.getElementById('loading');
    const studentsGrid = document.getElementById('students-grid');
    
    if (show) {
        loading.style.display = 'flex';
        studentsGrid.style.opacity = '0.5';
    } else {
        loading.style.display = 'none';
        studentsGrid.style.opacity = '1';
    }
}

function showError(message) {
    // Create a simple toast notification
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
        animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

function showSuccess(message) {
    // Create a simple toast notification
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
        animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
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

// Image Gallery Functions
function createImageGallery(images, itemId, itemType) {
    if (!images || images.length === 0) {
        return `<div class="${itemType}-portrait-placeholder">No Photo</div>`;
    }
    
    const currentImageIndex = 0;
    const hasMultipleImages = images.length > 1;
    
    return `
        <div class="image-gallery" data-item-id="${itemId}" data-item-type="${itemType}">
            <div class="image-container">
                <img src="${escapeHtml(images[currentImageIndex])}?t=${Date.now()}" 
                     alt="${itemType} image" 
                     class="${itemType}-portrait gallery-image"
                     onclick="openImagePopup('${escapeHtml(images[currentImageIndex])}')"
                     data-current-index="${currentImageIndex}">
                
                ${hasMultipleImages ? `
                    <button class="gallery-nav prev" onclick="navigateGallery('${itemId}', -1)">‹</button>
                    <button class="gallery-nav next" onclick="navigateGallery('${itemId}', 1)">›</button>
                    <div class="gallery-indicator">${currentImageIndex + 1} / ${images.length}</div>
                ` : ''}
                
                ${isGM ? `
                    <button class="delete-image-btn" onclick="deleteImage('${itemId}', '${escapeHtml(images[currentImageIndex])}', '${itemType}')">×</button>
                ` : ''}
            </div>
        </div>
    `;
}

function navigateGallery(itemId, direction) {
    const gallery = document.querySelector(`[data-item-id="${itemId}"] .image-container img`);
    if (!gallery) return;
    
    const currentIndex = parseInt(gallery.getAttribute('data-current-index'));
    let images = [];
    
    // Get images array based on selected item
    if (selectedStudent && selectedStudent.student_id === itemId) {
        images = selectedStudent.images || (selectedStudent.image_path ? [selectedStudent.image_path] : []);
    }
    
    if (images.length <= 1) return;
    
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
    
    // Update image
    gallery.src = images[newIndex];
    gallery.setAttribute('data-current-index', newIndex);
    gallery.setAttribute('onclick', `openImagePopup('${escapeHtml(images[newIndex])}')`);
    
    // Update indicator
    const indicator = gallery.parentElement.querySelector('.gallery-indicator');
    if (indicator) {
        indicator.textContent = `${newIndex + 1} / ${images.length}`;
    }
    
    // Update delete button
    const deleteBtn = gallery.parentElement.querySelector('.delete-image-btn');
    if (deleteBtn) {
        deleteBtn.setAttribute('onclick', `deleteImage('${itemId}', '${escapeHtml(images[newIndex])}', 'student')`);
    }
}

function openImagePopup(imagePath) {
    let popup = document.getElementById('image-popup');
    if (!popup) {
        popup = createImagePopup();
    }
    const popupImage = popup.querySelector('.image-popup-content img');
    
    popupImage.src = imagePath + '?t=' + Date.now();
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
            <div class="image-popup-title">Student Image</div>
            <button class="image-popup-close" onclick="closeImagePopup()">×</button>
        </div>
        <div class="image-popup-content">
            <img src="" alt="Student image">
        </div>
    `;
    document.body.appendChild(popup);
    
    // Make popup draggable
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

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }
}

function deleteImage(itemId, imagePath, itemType) {
    if (!isGM) return;
    
    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete_image');
    formData.append('student_id', itemId);
    formData.append('image_path', imagePath);
    
    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update local data
            if (selectedStudent && selectedStudent.student_id === itemId) {
                if (selectedStudent.images) {
                    const imageIndex = selectedStudent.images.indexOf(imagePath);
                    if (imageIndex !== -1) {
                        selectedStudent.images.splice(imageIndex, 1);
                    }
                }
                
                // Refresh the modal content
                const modalBody = document.querySelector('#student-modal .student-details');
                if (modalBody) {
                    modalBody.innerHTML = createStudentDetailForm(selectedStudent);
                    setupFormEventListeners(modalBody);
                    setupModalRichTextEditors(modalBody, selectedStudent);
                }
            }
            
            // Refresh the main grid
            loadStudents();
        } else {
            alert('Failed to delete image: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error deleting image:', error);
        alert('Error deleting image');
    });
}

// Update the upload function to handle multiple images
function uploadStudentPortrait(studentId) {
    if (!isGM) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.webp';
    input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('action', 'upload_portrait');
        formData.append('student_id', studentId);
        formData.append('portrait', file);
        
        fetch(studentsEndpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update local data
                if (selectedStudent && selectedStudent.student_id === studentId) {
                    if (!selectedStudent.images) {
                        selectedStudent.images = [];
                    }
                    selectedStudent.images.push(data.image_path);
                    
                    // Refresh the modal content
                    const modalBody = document.querySelector('#student-modal .student-details');
                    if (modalBody) {
                        modalBody.innerHTML = createStudentDetailForm(selectedStudent);
                        setupFormEventListeners(modalBody);
                        setupModalRichTextEditors(modalBody, selectedStudent);
                    }
                }
                
                // Refresh the main grid
                loadStudents();
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
    if (!isGM) return;
    
    // Only handle input and select elements - rich text editors handle their own auto-save
    container.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', function() {
            const field = this.getAttribute('data-field');
            const value = this.value;
            if (selectedStudent) {
                saveStudentField(selectedStudent.student_id, field, value);
            }
        });
    });
}

// Export functionality
function exportStudents() {
    const formData = new FormData();
    formData.append('action', 'export_students');
    
    fetch(studentsEndpoint, {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showExportModal(data.data);
        } else {
            alert('Failed to export data: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error exporting data:', error);
        alert('Error exporting data');
    });
}

function showExportModal(data) {
    const modal = document.getElementById('export-modal');
    const textarea = document.getElementById('export-data');
    
    // Format JSON with proper indentation
    textarea.value = JSON.stringify(data, null, 2);
    
    modal.style.display = 'block';
}

function closeExportModal() {
    const modal = document.getElementById('export-modal');
    modal.style.display = 'none';
    
    // Reset copy feedback
    const feedback = document.getElementById('copy-feedback');
    if (feedback) {
        feedback.style.display = 'none';
    }
}

function copyExportData() {
    const textarea = document.getElementById('export-data');
    textarea.select();
    
    try {
        document.execCommand('copy');
        
        // Show feedback
        const feedback = document.getElementById('copy-feedback');
        if (feedback) {
            feedback.style.display = 'inline';
            setTimeout(() => {
                feedback.style.display = 'none';
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    }
}