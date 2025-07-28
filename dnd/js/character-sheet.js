// Enhanced Character Sheet JavaScript - Strixhaven Functionality with Read-Only Player Mode

// Setup save on navigation functionality (GM only)
function setupAutoSave() {
    if (!isGM) return; // Only GM gets navigation saves
    
    // NO MORE AUTO-SAVE INTERVAL - Removed to prevent 503 errors
    
    // Save before window/tab close
    window.addEventListener('beforeunload', function(e) {
        if (hasPendingChanges()) {
            // Use synchronous XMLHttpRequest for beforeunload (async doesn't work reliably)
            const updates = collectAllFormData();
            if (updates.length > 0) {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'dashboard.php', false); // false = synchronous
                xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
                const params = 'action=batch_save&character=' + encodeURIComponent(currentCharacter) + 
                              '&updates=' + encodeURIComponent(JSON.stringify(updates));
                xhr.send(params);
            }
            
            // Most browsers will show their own message, but we set one just in case
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
    
    // Save before navigating away from the page
    document.addEventListener('click', function(e) {
        // Check if clicking a link that will navigate away
        const link = e.target.closest('a');
        if (link && link.href && !link.href.startsWith('#') && link.href !== window.location.href) {
            if (hasPendingChanges()) {
                batchSaveAllData(); // Use batch save
            }
        }
    });
}

// Track pending saves to avoid multiple saves of the same field
const pendingSaves = new Map();

// Save queue to prevent server overload
const saveQueue = [];
let isProcessingQueue = false;

// Debounce timers for different operations
const debounceTimers = new Map();

// Global save mutex to prevent concurrent saves
let activeSavePromise = null;
let pendingSaveCount = 0;

// Process save queue sequentially
async function processSaveQueue() {
    if (isProcessingQueue || saveQueue.length === 0) {
        return;
    }
    
    // Wait for any active save to complete
    if (activeSavePromise) {
        await activeSavePromise;
    }
    
    isProcessingQueue = true;
    
    // Create a new promise for this batch of saves
    activeSavePromise = (async () => {
        while (saveQueue.length > 0 && !isSwitchingCharacter) {
            const saveRequest = saveQueue.shift();
            pendingSaveCount++;
            
            try {
                await performSave(saveRequest);
                // Small delay between saves to prevent server overload
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('Error processing save:', error);
                // Continue processing queue even if one save fails
            } finally {
                pendingSaveCount--;
            }
        }
    })();
    
    try {
        await activeSavePromise;
    } finally {
        isProcessingQueue = false;
        activeSavePromise = null;
    }
}

// Generate unique request ID
function generateRequestId() {
    return `save_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Perform individual save with retry logic
async function performSave(saveRequest, retryCount = 0) {
    const { character, section, field, value, index, requestId = generateRequestId() } = saveRequest;
    
    const formData = new FormData();
    formData.append('action', 'save');
    formData.append('character', character);
    formData.append('section', section);
    formData.append('field', field);
    formData.append('value', value);
    formData.append('request_id', requestId);
    
    if (index !== null) {
        formData.append('index', index);
    }
    
    try {
        const response = await fetch('dashboard.php', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            // Don't retry on 4xx errors (client errors)
            if (response.status >= 400 && response.status < 500) {
                console.error('Client error saving field:', field, 'Status:', response.status);
                throw new Error(`HTTP ${response.status} - Client Error`);
            }
            
            // Special handling for 508 Loop Detected
            if (response.status === 508) {
                console.error('508 Loop Detected for field:', field, 'in section:', saveRequest.section);
                // Don't retry 508 errors - they indicate a logic problem
                throw new Error('Loop detected - possible recursive save');
            }
            
            // Retry on other 5xx errors (server errors)
            if (response.status >= 500 && retryCount < 3) {
                console.warn(`Server error ${response.status}, retrying... (attempt ${retryCount + 1}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount))); // Exponential backoff
                return performSave(saveRequest, retryCount + 1);
            }
            
            throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Invalid JSON response:', text);
            throw new Error('Server returned invalid JSON');
        }
        
        if (!data.success) {
            console.error('Failed to save field:', field, 'Error:', data.error);
            throw new Error(data.error || 'Save failed');
        }
        
        console.log(`Successfully saved ${field} (${requestId})`);
        return data;
        
    } catch (error) {
        if (retryCount < 3 && !error.message.includes('Client Error')) {
            console.warn(`Error saving field ${field}, retrying... (attempt ${retryCount + 1}/3)`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount))); // Exponential backoff
            return performSave(saveRequest, retryCount + 1);
        }
        throw error;
    }
}

// Track changes for manual save (GM only)
function setupEventListeners() {
    if (!isGM) return; // Only GM tracks changes
    
    // Track when fields are modified but not saved
    document.addEventListener('input', function(event) {
        try {
            const target = event.target;
            
            // Only handle input/textarea elements with data-field attributes
            if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && 
                target.hasAttribute && target.hasAttribute('data-field')) {
                
                // Mark that we have unsaved changes
                markAsModified();
                
                // Update local data immediately for UI consistency
                const field = target.getAttribute('data-field');
                const section = target.getAttribute('data-section');
                const value = target.value;
                
                if (field && section && value !== undefined && value !== null && !isSwitchingCharacter) {
                    // Update local characterData object
                    if (section === 'character' || section === 'current_classes' || section === 'job') {
                        if (!characterData[section]) characterData[section] = {};
                        characterData[section][field] = value;
                    }
                    
                    // Special handling for relationships/projects
                    const index = target.getAttribute('data-index');
                    if (index !== null && (section === 'relationships' || section === 'projects')) {
                        const idx = parseInt(index);
                        if (!characterData[section]) characterData[section] = [];
                        if (!characterData[section][idx]) characterData[section][idx] = {};
                        characterData[section][idx][field] = value;
                    }
                    
                    // Special handling for clubs
                    if (section === 'clubs') {
                        if (!characterData.clubs) characterData.clubs = [];
                        if (!characterData.clubs[currentClubIndex]) characterData.clubs[currentClubIndex] = {};
                        characterData.clubs[currentClubIndex][field] = value;
                    }
                }
            }
        } catch (error) {
            console.error('Error in change tracking:', error);
        }
    });
}

// Remove the separate debouncedSave function since we're handling it inline now

// Switch between characters (GM only) - WITH SAFE CHARACTER ISOLATION
async function switchCharacter(character) {
    if (!isGM) return;
    
    // Set flag to prevent new saves during switch
    isSwitchingCharacter = true;
    
    // Cancel all pending debounced saves
    debounceTimers.forEach((timerId, key) => {
        clearTimeout(timerId);
    });
    debounceTimers.clear();
    
    // Clear the save queue
    saveQueue.length = 0;
    
    // CRITICAL FIX: Store the character we're saving FROM before switching
    const characterToSaveFrom = currentCharacter;
    
    // Wait for any active saves to complete
    if (activeSavePromise) {
        try {
            await activeSavePromise;
        } catch (error) {
            console.error('Error waiting for saves to complete:', error);
        }
    }
    
    // Check if there are unsaved changes and save them
    if (hasPendingChanges()) {
        saveAllDataForCharacter(characterToSaveFrom, true);
        clearModifiedFlag();
        
        // Wait a bit for the save to process
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Update current character AFTER saving the previous one
    currentCharacter = character;
    
    // Update tab appearance
    document.querySelectorAll('.character-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-character="${character}"]`).classList.add('active');
    
    // Clear all form data before loading new character
    clearAllFormData();
    
    // Load new character data
    await loadCharacterData(character);
    
    // Re-enable saves after character data is loaded
    setTimeout(function() {
        isSwitchingCharacter = false;
    }, 200);
}

// Switch between sections
function switchSection(section) {
    // No automatic save on section switch to prevent server overload
    // Users should use the manual save button or rely on save-on-close
    
    // Hide all sections
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(section + '-section').classList.add('active');
    
    // Update tab appearance
    document.querySelectorAll('.section-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`).classList.add('active');
    
    // Special handling for inventory section
    if (section === 'inventory') {
        // Make sure inventory data is loaded
        if (typeof inventoryData !== 'undefined' && Object.keys(inventoryData).length === 0) {
            loadInventoryData();
        }
        // Collapse any expanded inventory card when switching to inventory
        if (typeof expandedInventoryCard !== 'undefined' && expandedInventoryCard) {
            expandedInventoryCard.classList.remove('expanded');
            expandedInventoryCard = null;
        }
    } else {
        // Collapse any expanded inventory card when switching away from inventory
        if (typeof expandedInventoryCard !== 'undefined' && expandedInventoryCard) {
            expandedInventoryCard.classList.remove('expanded');
            expandedInventoryCard = null;
        }
    }
    
    // Load section-specific data
    loadSectionData(section);
}

// Auto-calculate overall grade (GM only)
function calculateOverallGrade() {
    if (!isGM) return; // Only GM can calculate grades
    
    const test1Element = document.getElementById('test_1_grade');
    const test2Element = document.getElementById('test_2_grade');
    const project1Element = document.getElementById('project_1_grade');
    const project2Element = document.getElementById('project_2_grade');
    const overallElement = document.getElementById('overall_grade');
    
    if (!test1Element || !test2Element || !project1Element || !project2Element || !overallElement) {
        return; // Elements don't exist
    }
    
    const test1 = test1Element.value ? test1Element.value.trim() : '';
    const test2 = test2Element.value ? test2Element.value.trim() : '';
    const project1 = project1Element.value ? project1Element.value.trim() : '';
    const project2 = project2Element.value ? project2Element.value.trim() : '';
    
    const grades = [test1, test2, project1, project2].filter(grade => grade !== '');
    
    if (grades.length > 0) {
        let totalGradePoints = 0;
        let validGrades = 0;
        
        grades.forEach(grade => {
            const gpaPoints = letterToGPA(grade);
            if (gpaPoints !== null) {
                totalGradePoints += gpaPoints;
                validGrades++;
            }
        });
        
        if (validGrades > 0) {
            const averageGPA = totalGradePoints / validGrades;
            const roundedGPA = Math.round(averageGPA * 100) / 100;
            const letterGrade = gpaToLetter(averageGPA);
            
            const displayGrade = `${letterGrade} (${roundedGPA})`;
            overallElement.value = displayGrade;
            
            // Save the calculated grade with shorter debounce
            saveFieldData(currentCharacter, 'current_classes', 'overall_grade', displayGrade, null, 500);
        } else {
            overallElement.value = '';
            saveFieldData(currentCharacter, 'current_classes', 'overall_grade', '', null, 500);
        }
    } else {
        overallElement.value = '';
        saveFieldData(currentCharacter, 'current_classes', 'overall_grade', '');
    }
}

// Convert letter grade to GPA points
function letterToGPA(letterGrade) {
    const grade = letterGrade.toUpperCase().trim();
    
    // Handle letter grades
    switch(grade) {
        case 'A+': case 'A': return 4.0;
        case 'A-': return 3.7;
        case 'B+': return 3.3;
        case 'B': return 3.0;
        case 'B-': return 2.7;
        case 'C+': return 2.3;
        case 'C': return 2.0;
        case 'C-': return 1.7;
        case 'D+': return 1.3;
        case 'D': return 1.0;
        case 'D-': return 0.7;
        case 'F': return 0.0;
        default:
            // Handle numeric grades (assume 0-100 scale)
            const numericGrade = parseFloat(grade);
            if (!isNaN(numericGrade)) {
                if (numericGrade >= 97) return 4.0;  // A+
                if (numericGrade >= 93) return 4.0;  // A
                if (numericGrade >= 90) return 3.7;  // A-
                if (numericGrade >= 87) return 3.3;  // B+
                if (numericGrade >= 83) return 3.0;  // B
                if (numericGrade >= 80) return 2.7;  // B-
                if (numericGrade >= 77) return 2.3;  // C+
                if (numericGrade >= 73) return 2.0;  // C
                if (numericGrade >= 70) return 1.7;  // C-
                if (numericGrade >= 67) return 1.3;  // D+
                if (numericGrade >= 65) return 1.0;  // D
                if (numericGrade >= 60) return 0.7;  // D-
                return 0.0;  // F
            }
            return null; // Invalid grade
    }
}

// Convert GPA points back to letter grade
function gpaToLetter(gpa) {
    if (gpa >= 3.85) return 'A';
    if (gpa >= 3.5) return 'A-';
    if (gpa >= 3.15) return 'B+';
    if (gpa >= 2.85) return 'B';
    if (gpa >= 2.5) return 'B-';
    if (gpa >= 2.15) return 'C+';
    if (gpa >= 1.85) return 'C';
    if (gpa >= 1.5) return 'C-';
    if (gpa >= 1.15) return 'D+';
    if (gpa >= 0.85) return 'D';
    if (gpa >= 0.5) return 'D-';
    return 'F';
}

// Load character data from server
function loadCharacterData(character) {
    showSaveStatus('Loading...', 'loading');
    
    const formData = new FormData();
    formData.append('action', 'load');
    formData.append('character', character);
    
    fetch('dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        // Log response status for debugging
        if (!response.ok) {
            console.error('HTTP Error loading character:', character, 'Status:', response.status, response.statusText);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            characterData = data.data;
            populateCharacterData();
            showSaveStatus('Data loaded', 'success');
        } else {
            showSaveStatus('Failed to load data', 'error');
            console.error('Server error loading character:', data.error);
        }
    })
    .catch(error => {
        console.error('Error loading data:', error);
        showSaveStatus('Error loading data', 'error');
        // Log additional details for network errors
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            console.error('Network error loading character - server may be overloaded');
        }
    });
}

// Populate form fields with character data - UPDATED FOR READ-ONLY MODE
function populateCharacterData() {
    // Character info
    if (characterData.character) {
        Object.keys(characterData.character).forEach(field => {
            const element = document.getElementById(field);
            if (element) {
                const value = characterData.character[field] || '';
                if (isGM) {
                    // GM gets input fields
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                        element.value = value;
                    }
                } else {
                    // Players get readonly divs
                    element.textContent = value || '-';
                }
            }
        });
        
        // Handle portrait
        if (characterData.character.portrait && characterData.character.portrait.trim() !== '') {
            loadPortrait(characterData.character.portrait);
        } else {
            // No portrait - make sure placeholder is shown
            const img = document.getElementById('character-portrait');
            const placeholder = document.getElementById('portrait-placeholder');
            if (img && placeholder) {
                img.style.display = 'none';
                img.src = '';
                placeholder.style.display = 'flex';
            }
        }
    }
    
    // Current classes
    if (characterData.current_classes) {
        Object.keys(characterData.current_classes).forEach(field => {
            const element = document.getElementById(field);
            if (element) {
                const value = characterData.current_classes[field] || '';
                if (isGM) {
                    // GM gets input fields
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                        element.value = value;
                    }
                } else {
                    // Players get readonly divs
                    element.textContent = value || '-';
                }
            }
        });
        // Recalculate overall grade after loading data (GM only)
        if (isGM) {
            setTimeout(calculateOverallGrade, 100);
        }
    }
    
    // Job info
    if (characterData.job) {
        Object.keys(characterData.job).forEach(field => {
            const element = document.getElementById(field);
            if (element) {
                const value = characterData.job[field] || '';
                if (isGM) {
                    // GM gets input fields
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                        element.value = value;
                    }
                } else {
                    // Players get readonly divs
                    element.textContent = value || '-';
                }
            }
        });
    }
    
    // Load complex sections
    loadPastClasses();
    loadRelationships();
    loadProjects();
    loadClubs();
}

// Load section-specific data
function loadSectionData(section) {
    switch(section) {
        case 'past-classes':
            loadPastClasses();
            break;
        case 'relationships':
            loadRelationships();
            break;
        case 'projects':
            loadProjects();
            break;
        case 'clubs':
            loadClubs();
            break;
    }
}

// Load past classes
function loadPastClasses() {
    const container = document.getElementById('past-classes-list');
    container.innerHTML = '';
    
    if (characterData.past_classes && characterData.past_classes.length > 0) {
        characterData.past_classes.forEach((classData, index) => {
            const classElement = createPastClassElement(classData, index);
            container.appendChild(classElement);
        });
    } else {
        container.innerHTML = '<p class="no-data">No past classes</p>';
    }
}

// Create past class element
function createPastClassElement(classData, index) {
    const div = document.createElement('div');
    div.className = 'past-class-item';
    div.onclick = () => showPastClassModal(index);
    
    const className = classData.class_name || 'Unnamed Class';
    const grade = classData.overall_grade || 'No Grade';
    
    div.innerHTML = `
        <h3>${className}</h3>
        <p>Final Grade: ${grade}</p>
    `;
    
    return div;
}

// Show past class modal
function showPastClassModal(index) {
    currentPastClassIndex = index;
    const classData = characterData.past_classes[index];
    
    document.getElementById('past-class-title').textContent = classData.class_name || 'Unnamed Class';
    
    const detailsContainer = document.getElementById('past-class-details');
    detailsContainer.innerHTML = '';
    
    // Create details display
    const fields = [
        { key: 'class_name', label: 'Class Name' },
        { key: 'test_1_grade', label: 'Test 1 Grade' },
        { key: 'test_2_grade', label: 'Test 2 Grade' },
        { key: 'project_1_grade', label: 'Project 1 Grade' },
        { key: 'project_2_grade', label: 'Project 2 Grade' },
        { key: 'overall_grade', label: 'Overall Grade' },
        { key: 'test_buffs', label: 'Test Buffs' }
    ];
    
    fields.forEach(field => {
        const div = document.createElement('div');
        div.className = 'detail-row';
        div.innerHTML = `
            <strong>${field.label}:</strong>
            <span>${classData[field.key] || 'Not set'}</span>
        `;
        detailsContainer.appendChild(div);
    });
    
    document.getElementById('past-class-modal').style.display = 'block';
}

// Close past class modal
function closePastClassModal() {
    document.getElementById('past-class-modal').style.display = 'none';
    currentPastClassIndex = -1;
}

// Delete past class (GM only)
function deletePastClass() {
    if (!isGM || currentPastClassIndex === -1) return;
    
    if (confirm('Are you sure you want to delete this class?')) {
        const formData = new FormData();
        formData.append('action', 'delete_item');
        formData.append('character', currentCharacter);
        formData.append('section', 'past_classes');
        formData.append('index', currentPastClassIndex);
        
        fetch('dashboard.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                characterData.past_classes.splice(currentPastClassIndex, 1);
                loadPastClasses();
                closePastClassModal();
                showSaveStatus('Class deleted', 'success');
            } else {
                showSaveStatus('Failed to delete class', 'error');
            }
        });
    }
}

// Load relationships - UPDATED FOR READ-ONLY MODE
function loadRelationships() {
    const container = document.getElementById('relationships-list');
    container.innerHTML = '';
    
    if (characterData.relationships && characterData.relationships.length > 0) {
        characterData.relationships.forEach((relationship, index) => {
            const relationshipElement = createRelationshipElement(relationship, index);
            container.appendChild(relationshipElement);
        });
    } else {
        container.innerHTML = '<p class="no-data">No relationships</p>';
    }
}

// Create relationship element (expandable) - UPDATED FOR READ-ONLY MODE
function createRelationshipElement(relationship, index) {
    const div = document.createElement('div');
    div.className = 'relationship-item';
    
    const npcName = relationship.npc_name || 'Unnamed NPC';
    const points = relationship.points || '0';
    
    if (isGM) {
        // GM gets editable form
        div.innerHTML = `
            <div class="relationship-header" onclick="toggleRelationship(${index})">
                <h3>${npcName}</h3>
                <span class="relationship-points">Points: ${points}</span>
                <span class="expand-icon">▼</span>
            </div>
            <div class="relationship-details" id="relationship-details-${index}" style="display: none;">
                <div class="form-group">
                    <label>NPC Name:</label>
                    <input type="text" class="npc-name-input" value="${relationship.npc_name || ''}"
                           onchange="updateRelationshipField(${index}, 'npc_name', this.value)">
                </div>
                <div class="form-group">
                    <label>Points:</label>
                    <input type="text" class="relationship-points-input" value="${relationship.points || ''}"
                           onchange="updateRelationshipField(${index}, 'points', this.value)">
                </div>
                <div class="form-group">
                    <label>Boon:</label>
                    <input type="text" value="${relationship.boon || ''}"
                           onchange="updateRelationshipField(${index}, 'boon', this.value)">
                </div>
                <div class="form-group">
                    <label>Bane:</label>
                    <input type="text" value="${relationship.bane || ''}"
                           onchange="updateRelationshipField(${index}, 'bane', this.value)">
                </div>
                <div class="form-group">
                    <label>Extra:</label>
                    <textarea rows="3" onchange="updateRelationshipField(${index}, 'extra', this.value)">${relationship.extra || ''}</textarea>
                </div>
                <button class="btn-danger" onclick="deleteRelationship(${index})">Delete</button>
            </div>
        `;
    } else {
        // Players get read-only display
        div.innerHTML = `
            <div class="relationship-header" onclick="toggleRelationship(${index})">
                <h3>${npcName}</h3>
                <span class="relationship-points">Points: ${points}</span>
                <span class="expand-icon">▼</span>
            </div>
            <div class="relationship-details" id="relationship-details-${index}" style="display: none;">
                <div class="form-group">
                    <label>NPC Name:</label>
                    <div class="readonly-field">${relationship.npc_name || '-'}</div>
                </div>
                <div class="form-group">
                    <label>Points:</label>
                    <div class="readonly-field">${relationship.points || '-'}</div>
                </div>
                <div class="form-group">
                    <label>Boon:</label>
                    <div class="readonly-field">${relationship.boon || '-'}</div>
                </div>
                <div class="form-group">
                    <label>Bane:</label>
                    <div class="readonly-field">${relationship.bane || '-'}</div>
                </div>
                <div class="form-group">
                    <label>Extra:</label>
                    <div class="readonly-field readonly-textarea">${relationship.extra || '-'}</div>
                </div>
            </div>
        `;
    }

    if (isGM) {
        const nameInput = div.querySelector('.npc-name-input');
        if (nameInput) {
            attachNameAutocomplete(nameInput, index);
        }
    }

    return div;
}

// Toggle relationship details
function toggleRelationship(index) {
    const details = document.getElementById(`relationship-details-${index}`);
    const icon = document.querySelector(`#relationships-list .relationship-item:nth-child(${index + 1}) .expand-icon`);
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        icon.textContent = '▲';
    } else {
        details.style.display = 'none';
        icon.textContent = '▼';
    }
}

// Update relationship field (GM only)
function updateRelationshipField(index, field, value) {
    if (!isGM) return;
    
    if (!characterData.relationships[index]) {
        characterData.relationships[index] = {};
    }
    
    characterData.relationships[index][field] = value;
    
    // Mark as modified
    markAsModified();
    
    // Save this specific field to server with longer debounce
    saveFieldData(currentCharacter, 'relationships', field, value, index, 2000);
    
    // If we have a student_id and are updating points or extra, sync with student card
    if (characterData.relationships[index].student_id && 
        (field === 'points' || field === 'extra')) {
        syncRelationshipToStudentCard(index);
    }
    
    // Update header if name or points changed
    if (field === 'npc_name' || field === 'points') {
        // Delay the reload to allow save to process
        setTimeout(() => {
            loadRelationships();
        }, 100);
    }
}

// Sync relationship data to student card
function syncRelationshipToStudentCard(relationshipIndex) {
    const relationship = characterData.relationships[relationshipIndex];
    if (!relationship || !relationship.student_id) return;
    
    const formData = new FormData();
    formData.append('action', 'sync_relationship_to_student');
    formData.append('student_id', relationship.student_id);
    formData.append('pc_name', currentCharacter);
    formData.append('points', relationship.points || '');
    formData.append('notes', relationship.extra || '');
    
    fetch('dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            console.error('Failed to sync relationship to student card:', data.error);
        }
    })
    .catch(error => {
        console.error('Error syncing relationship:', error);
    });
}

// Add new relationship (GM only)
function addRelationship() {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'add_item');
    formData.append('character', currentCharacter);
    formData.append('section', 'relationships');
    
    fetch('dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (!characterData.relationships) {
                characterData.relationships = [];
            }
            // Add new relationship with proper default values
            const newRelationship = {
                npc_name: 'New Relationship',
                points: '0',
                boon: '',
                bane: '',
                extra: '',
                student_id: ''
            };
            characterData.relationships.push(newRelationship);
            loadRelationships();
            showSaveStatus('Relationship added', 'success');
            markAsModified();
        }
    })
    .catch(error => {
        console.error('Error adding relationship:', error);
        showSaveStatus('Failed to add relationship', 'error');
    });
}

// Delete relationship (GM only)
function deleteRelationship(index) {
    if (!isGM) return;
    
    if (confirm('Are you sure you want to delete this relationship?')) {
        const formData = new FormData();
        formData.append('action', 'delete_item');
        formData.append('character', currentCharacter);
        formData.append('section', 'relationships');
        formData.append('index', index);
        
        fetch('dashboard.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                characterData.relationships.splice(index, 1);
                loadRelationships();
                showSaveStatus('Relationship deleted', 'success');
            }
        });
    }
}

// Load projects - UPDATED FOR READ-ONLY MODE
function loadProjects() {
    const container = document.getElementById('projects-list');
    container.innerHTML = '';
    
    if (characterData.projects && characterData.projects.length > 0) {
        characterData.projects.forEach((project, index) => {
            const projectElement = createProjectElement(project, index);
            container.appendChild(projectElement);
        });
    } else {
        container.innerHTML = '<p class="no-data">No projects</p>';
    }
}

// Create project element with progress bar - UPDATED FOR READ-ONLY MODE
function createProjectElement(project, index) {
    const div = document.createElement('div');
    div.className = 'project-item';
    
    const projectName = project.project_name || 'Unnamed Project';
    const pointsEarned = parseInt(project.points_earned) || 0;
    const totalPoints = parseInt(project.total_points) || 1;
    const percentage = Math.min((pointsEarned / totalPoints) * 100, 100);
    
    // Get points history for display
    const pointsHistory = project.points_history || [];
    const historyDisplay = pointsHistory.length > 0 ? 
        `<div class="points-history">History: ${pointsHistory.slice(-3).join(' → ')}</div>` : 
        '<div class="points-history">No history yet</div>';
    
    if (isGM) {
        // GM gets editable form
        div.innerHTML = `
            <div class="project-header" onclick="toggleProject(${index})">
                <h3>${projectName}</h3>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="progress-text">${pointsEarned}/${totalPoints} (${Math.round(percentage)}%)</span>
                </div>
                <span class="expand-icon">▼</span>
            </div>
            <div class="project-details" id="project-details-${index}" style="display: none;">
                <div class="form-group">
                    <label>Project Name:</label>
                    <input type="text" value="${project.project_name || ''}"
                           onchange="updateProjectField(${index}, 'project_name', this.value)">
                </div>
                <div class="form-group">
                    <label>Source:</label>
                    <input type="text" value="${project.source || ''}"
                           onchange="updateProjectField(${index}, 'source', this.value)">
                </div>
                <div class="form-group">
                    <label>Points Earned:</label>
                    ${historyDisplay}
                    <input type="text" class="no-spinner" value="${project.points_earned || ''}"
                           onchange="updateProjectPoints(${index}, this.value)"
                           placeholder="Enter points or +# to add"
                           id="points-earned-${index}">
                </div>
                <div class="form-group">
                    <label>Total Points:</label>
                    <input type="number" class="no-spinner" value="${project.total_points || ''}"
                           onchange="updateProjectField(${index}, 'total_points', this.value)">
                </div>
                <div class="form-group">
                    <label>Extra:</label>
                    <textarea rows="3" onchange="updateProjectField(${index}, 'extra', this.value)">${project.extra || ''}</textarea>
                </div>
                <button class="btn-danger" onclick="deleteProject(${index})">Delete</button>
            </div>
        `;
    } else {
        // Players get read-only display
        div.innerHTML = `
            <div class="project-header" onclick="toggleProject(${index})">
                <h3>${projectName}</h3>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="progress-text">${pointsEarned}/${totalPoints} (${Math.round(percentage)}%)</span>
                </div>
                <span class="expand-icon">▼</span>
            </div>
            <div class="project-details" id="project-details-${index}" style="display: none;">
                <div class="form-group">
                    <label>Project Name:</label>
                    <div class="readonly-field">${project.project_name || '-'}</div>
                </div>
                <div class="form-group">
                    <label>Source:</label>
                    <div class="readonly-field">${project.source || '-'}</div>
                </div>
                <div class="form-group">
                    <label>Points Earned:</label>
                    ${historyDisplay}
                    <div class="readonly-field">${project.points_earned || '-'}</div>
                </div>
                <div class="form-group">
                    <label>Total Points:</label>
                    <div class="readonly-field">${project.total_points || '-'}</div>
                </div>
                <div class="form-group">
                    <label>Extra:</label>
                    <div class="readonly-field readonly-textarea">${project.extra || '-'}</div>
                </div>
            </div>
        `;
    }
    
    return div;
}

// Toggle project details
function toggleProject(index) {
    const details = document.getElementById(`project-details-${index}`);
    const icon = document.querySelector(`#projects-list .project-item:nth-child(${index + 1}) .expand-icon`);
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        icon.textContent = '▲';
    } else {
        details.style.display = 'none';
        icon.textContent = '▼';
    }
}

// Update project points with +# support and history tracking (GM only)
function updateProjectPoints(index, value) {
    if (!isGM) return;
    
    if (!characterData.projects[index]) {
        characterData.projects[index] = {};
    }
    
    const project = characterData.projects[index];
    
    // Initialize points history if it doesn't exist
    if (!project.points_history) {
        project.points_history = [];
    }
    
    let newPoints;
    
    // Check if input starts with + (addition mode)
    if (value.toString().startsWith('+')) {
        console.log(`Addition mode: ${value}`);
        const addPoints = parseInt(value.substring(1)) || 0;
        
        // Get the base value for addition
        let basePoints;
        if (project.points_history.length > 0) {
            basePoints = project.points_history[project.points_history.length - 1];
        } else {
            basePoints = parseInt(project.points_earned) || 0;
            if (basePoints > 0) {
                project.points_history.push(basePoints);
            }
        }
        
        newPoints = basePoints + addPoints;
        console.log(`${basePoints} + ${addPoints} = ${newPoints}`);
        
    } else {
        console.log(`Direct mode: ${value}`);
        newPoints = parseInt(value) || 0;
    }
    
    // Update the points in data
    project.points_earned = newPoints.toString();
    
    // Add to history
    project.points_history.push(newPoints);
    if (project.points_history.length > 10) {
        project.points_history = project.points_history.slice(-10);
    }
    
    // Update the input field
    const pointsInput = document.getElementById(`points-earned-${index}`);
    if (pointsInput) {
        pointsInput.value = newPoints;
    }
    
    // Save to server
    saveProjectData(index);
    
    // Update progress bar and history display
    updateProjectProgressBar(index);
    updateProjectHistory(index);
}

// Save entire project data (GM only)
function saveProjectData(index) {
    if (!isGM) return;
    
    const project = characterData.projects[index];
    
    // Save all project fields
    Object.keys(project).forEach(field => {
        let value = project[field];
        
        // Convert arrays to JSON strings for transmission
        if (Array.isArray(value)) {
            value = JSON.stringify(value);
        }
        
        // Save each field with debounce
        saveFieldData(currentCharacter, 'projects', field, value, index, 2000);
    });
    
    markAsModified();
}

// Update project history display
function updateProjectHistory(index) {
    const project = characterData.projects[index];
    const pointsHistory = project.points_history || [];
    
    const historyElement = document.querySelector(`#projects-list .project-item:nth-child(${index + 1}) .points-history`);
    
    if (historyElement) {
        if (pointsHistory.length > 0) {
            historyElement.textContent = `History: ${pointsHistory.slice(-3).join(' → ')}`;
        } else {
            historyElement.textContent = 'No history yet';
        }
    }
}

// Update project field (GM only)
function updateProjectField(index, field, value) {
    if (!isGM) return;
    
    if (!characterData.projects[index]) {
        characterData.projects[index] = {};
    }
    
    characterData.projects[index][field] = value;
    
    // Mark as modified
    markAsModified();
    
    // Save this specific field to server with longer debounce
    saveFieldData(currentCharacter, 'projects', field, value, index, 2000);
    
    // Only update progress bar if total points changed
    if (field === 'total_points') {
        updateProjectProgressBar(index);
    }
    
    // Only update project name in header if name changed
    if (field === 'project_name') {
        updateProjectHeader(index);
    }
}

// Update just the progress bar for a specific project
function updateProjectProgressBar(index) {
    const project = characterData.projects[index];
    const pointsEarned = parseInt(project.points_earned) || 0;
    const totalPoints = parseInt(project.total_points) || 1;
    const percentage = Math.min((pointsEarned / totalPoints) * 100, 100);
    
    const progressFill = document.querySelector(`#projects-list .project-item:nth-child(${index + 1}) .progress-fill`);
    const progressText = document.querySelector(`#projects-list .project-item:nth-child(${index + 1}) .progress-text`);
    
    if (progressFill) {
        progressFill.style.width = percentage + '%';
    }
    if (progressText) {
        progressText.textContent = `${pointsEarned}/${totalPoints} (${Math.round(percentage)}%)`;
    }
}

// Update just the project name in the header
function updateProjectHeader(index) {
    const project = characterData.projects[index];
    const projectName = project.project_name || 'Unnamed Project';
    
    const headerTitle = document.querySelector(`#projects-list .project-item:nth-child(${index + 1}) .project-header h3`);
    if (headerTitle) {
        headerTitle.textContent = projectName;
    }
}

// Add new project (GM only)
function addProject() {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'add_item');
    formData.append('character', currentCharacter);
    formData.append('section', 'projects');
    
    fetch('dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (!characterData.projects) {
                characterData.projects = [];
            }
            // Add new project with proper default values
            const newProject = {
                project_name: 'New Project',
                source: '',
                points_earned: '0',
                total_points: '10',
                extra: '',
                points_history: []
            };
            characterData.projects.push(newProject);
            loadProjects();
            showSaveStatus('Project added', 'success');
            markAsModified();
        }
    })
    .catch(error => {
        console.error('Error adding project:', error);
        showSaveStatus('Failed to add project', 'error');
    });
}

// Delete project (GM only)
function deleteProject(index) {
    if (!isGM) return;
    
    if (confirm('Are you sure you want to delete this project?')) {
        const formData = new FormData();
        formData.append('action', 'delete_item');
        formData.append('character', currentCharacter);
        formData.append('section', 'projects');
        formData.append('index', index);
        
        fetch('dashboard.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                characterData.projects.splice(index, 1);
                loadProjects();
                showSaveStatus('Project deleted', 'success');
            }
        });
    }
}

// Update club field (GM only) - maintains local data consistency
function updateClubField(index, field, value, character) {
    if (!isGM) return;
    
    // Use the passed character parameter, fallback to currentCharacter if not provided
    const targetCharacter = character || currentCharacter;
    
    // Ensure clubs array exists
    if (!characterData.clubs) {
        characterData.clubs = [];
    }
    
    // Ensure the club object exists
    if (!characterData.clubs[index]) {
        characterData.clubs[index] = {};
    }
    
    // 1. Update local data immediately
    characterData.clubs[index][field] = value;
    
    // 2. Mark as modified instead of auto-saving
    markAsModified();
}

// Load clubs - UPDATED FOR READ-ONLY MODE
function loadClubs() {
    if (!characterData.clubs || characterData.clubs.length === 0) {
        characterData.clubs = [{ name: '', people: '', bonuses: '', other: '' }];
    }
    
    currentClubIndex = Math.min(currentClubIndex, characterData.clubs.length - 1);
    loadCurrentClub();
    updateClubNavigation();
}

// Load current club data into form - UPDATED FOR READ-ONLY MODE
function loadCurrentClub() {
    if (!characterData.clubs || currentClubIndex >= characterData.clubs.length) {
        return;
    }
    
    const club = characterData.clubs[currentClubIndex];
    
    const clubNameElement = document.getElementById('club_name');
    const clubPeopleElement = document.getElementById('club_people');
    const clubBonusesElement = document.getElementById('club_bonuses');
    const clubOtherElement = document.getElementById('club_other');
    
    if (isGM) {
        // GM gets input fields
        if (clubNameElement && (clubNameElement.tagName === 'INPUT' || clubNameElement.tagName === 'TEXTAREA')) {
            clubNameElement.value = club.name || '';
        }
        if (clubPeopleElement && (clubPeopleElement.tagName === 'INPUT' || clubPeopleElement.tagName === 'TEXTAREA')) {
            clubPeopleElement.value = club.people || '';
        }
        if (clubBonusesElement && (clubBonusesElement.tagName === 'INPUT' || clubBonusesElement.tagName === 'TEXTAREA')) {
            clubBonusesElement.value = club.bonuses || '';
        }
        if (clubOtherElement && (clubOtherElement.tagName === 'INPUT' || clubOtherElement.tagName === 'TEXTAREA')) {
            clubOtherElement.value = club.other || '';
        }
    } else {
        // Players get readonly divs
        if (clubNameElement) clubNameElement.textContent = club.name || '-';
        if (clubPeopleElement) clubPeopleElement.textContent = club.people || '-';
        if (clubBonusesElement) clubBonusesElement.textContent = club.bonuses || '-';
        if (clubOtherElement) clubOtherElement.textContent = club.other || '-';
    }
}

// Navigate between clubs - WITH AUTO-SAVE for GM only
function navigateClub(direction) {
    // Save current club data before navigating (GM only)
    if (isGM && !isSwitchingCharacter) {
        saveAllData(true);
    }
    
    setTimeout(function() {
        const newIndex = currentClubIndex + direction;
        
        if (newIndex >= 0 && newIndex < characterData.clubs.length) {
            currentClubIndex = newIndex;
            loadCurrentClub();
            updateClubNavigation();
        }
    }, isGM ? 200 : 0);
}

// Update club navigation buttons
function updateClubNavigation() {
    const clubCount = characterData.clubs ? characterData.clubs.length : 1;
    
    document.getElementById('club-indicator').textContent = `Club ${currentClubIndex + 1}/${clubCount}`;
    
    document.getElementById('prev-club').disabled = currentClubIndex === 0;
    document.getElementById('next-club').disabled = currentClubIndex >= clubCount - 1;
    
    const deleteBtn = document.getElementById('delete-club-btn');
    if (deleteBtn) {
        deleteBtn.disabled = clubCount <= 1;
    }
}

// Add new club (GM only)
function addClub() {
    if (!isGM) return;
    
    const formData = new FormData();
    formData.append('action', 'add_item');
    formData.append('character', currentCharacter);
    formData.append('section', 'clubs');
    
    fetch('dashboard.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (!characterData.clubs) {
                characterData.clubs = [];
            }
            characterData.clubs.push({
                name: '',
                people: '',
                bonuses: '',
                other: ''
            });
            currentClubIndex = characterData.clubs.length - 1;
            loadCurrentClub();
            updateClubNavigation();
            showSaveStatus('Club added', 'success');
        }
    });
}

// Delete current club (GM only)
function deleteClub() {
    if (!isGM) return;
    
    if (characterData.clubs.length <= 1) {
        alert('Cannot delete the last club.');
        return;
    }
    
    if (confirm('Are you sure you want to delete this club?')) {
        const formData = new FormData();
        formData.append('action', 'delete_item');
        formData.append('character', currentCharacter);
        formData.append('section', 'clubs');
        formData.append('index', currentClubIndex);
        
        fetch('dashboard.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                characterData.clubs.splice(currentClubIndex, 1);
                currentClubIndex = Math.min(currentClubIndex, characterData.clubs.length - 1);
                loadCurrentClub();
                updateClubNavigation();
                showSaveStatus('Club deleted', 'success');
            }
        });
    }
}

// Save individual field data (GM only) - Now uses queue with debouncing
function saveFieldData(character, section, field, value, index = null, debounceDelay = 1000) {
    if (!isGM) return; // Only GM can save
    
    // Don't save empty or undefined values
    if (value === undefined || value === null) {
        return;
    }
    
    // Prevent saving if currently switching characters
    if (isSwitchingCharacter) {
        console.log('Skipping save during character switch');
        return;
    }
    
    // Create a unique key for this field
    const fieldKey = `${character}-${section}-${field}-${index || 'none'}`;
    
    // Check if this exact save is already pending
    const pendingSave = pendingSaves.get(fieldKey);
    if (pendingSave && pendingSave === value) {
        console.log('Skipping duplicate save for:', fieldKey);
        return;
    }
    
    // Mark this save as pending
    pendingSaves.set(fieldKey, value);
    
    // Clear any existing timer for this field
    if (debounceTimers.has(fieldKey)) {
        clearTimeout(debounceTimers.get(fieldKey));
    }
    
    // Set a new timer to save after delay
    const timerId = setTimeout(() => {
        // Add to queue with unique request ID
        saveQueue.push({
            character,
            section,
            field,
            value,
            index,
            requestId: generateRequestId()
        });
        
        // Process queue
        processSaveQueue();
        
        // Remove timer from map
        debounceTimers.delete(fieldKey);
        // Clear pending save
        pendingSaves.delete(fieldKey);
    }, debounceDelay);
    
    debounceTimers.set(fieldKey, timerId);
}

// Save all data for a specific character (GM only) - FIXED VERSION
function saveAllDataForCharacter(targetCharacter, silent = false) {
    if (!isGM) return; // Only GM can save
    
    // Validate character parameter
    if (!targetCharacter || !['frunk', 'sharon', 'indigo', 'zepha'].includes(targetCharacter)) {
        console.error('Invalid character specified for save:', targetCharacter);
        return;
    }
    
    if (!silent) {
        showSaveStatus('Saving...', 'loading');
    }
    
    // Helper function to safely save from an element to specific character
    function safelySaveFromElement(element, section, index = null) {
        if (!element) return;
        
        const field = element.getAttribute('data-field');
        if (!field) return;
        
        // Only save from actual input/textarea elements that have a value property
        if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && 
            element.value !== undefined && element.value !== null) {
            
            if (index !== null) {
                saveFieldData(targetCharacter, section, field, element.value, index);
            } else {
                saveFieldData(targetCharacter, section, field, element.value);
            }
        }
    }
    
    // Character data
    const characterInputs = document.querySelectorAll('input[data-section="character"], textarea[data-section="character"]');
    characterInputs.forEach(input => safelySaveFromElement(input, 'character'));
    
    // Current classes data
    const classInputs = document.querySelectorAll('input[data-section="current_classes"], textarea[data-section="current_classes"]');
    classInputs.forEach(input => safelySaveFromElement(input, 'current_classes'));
    
    // Job data
    const jobInputs = document.querySelectorAll('input[data-section="job"], textarea[data-section="job"]');
    jobInputs.forEach(input => safelySaveFromElement(input, 'job'));
    
    // Club data
    const clubInputs = document.querySelectorAll('input[data-section="clubs"], textarea[data-section="clubs"]');
    clubInputs.forEach(input => safelySaveFromElement(input, 'clubs', currentClubIndex));
    
    // NOTE: Relationships and Projects are NOT saved here because they use dynamic inputs
    // They are saved through updateRelationshipField and updateProjectField functions
    
    if (!silent) {
        showSaveStatus(`Data saved for ${targetCharacter}`, 'success');
    }
}

// Save all data (GM only) - WRAPPER FOR BACKWARD COMPATIBILITY
function saveAllData(silent = false) {
    saveAllDataForCharacter(currentCharacter, silent);
    // Clear the modified flag after successful save
    clearModifiedFlag();
}

// Collect all form data for saving
function collectAllFormData() {
    const updates = [];
    
    // Character data
    document.querySelectorAll('input[data-section="character"], textarea[data-section="character"]').forEach(input => {
        if (input.value !== undefined && input.value !== null && input.value !== '') {
            updates.push({
                section: 'character',
                field: input.getAttribute('data-field'),
                value: input.value
            });
        }
    });
    
    // Current classes data
    document.querySelectorAll('input[data-section="current_classes"], textarea[data-section="current_classes"]').forEach(input => {
        if (input.value !== undefined && input.value !== null) {
            updates.push({
                section: 'current_classes',
                field: input.getAttribute('data-field'),
                value: input.value
            });
        }
    });
    
    // Job data
    document.querySelectorAll('input[data-section="job"], textarea[data-section="job"]').forEach(input => {
        if (input.value !== undefined && input.value !== null) {
            updates.push({
                section: 'job',
                field: input.getAttribute('data-field'),
                value: input.value
            });
        }
    });
    
    // Clubs data
    document.querySelectorAll('input[data-section="clubs"], textarea[data-section="clubs"]').forEach(input => {
        if (input.value !== undefined && input.value !== null) {
            updates.push({
                section: 'clubs',
                field: input.getAttribute('data-field'),
                value: input.value,
                index: currentClubIndex
            });
        }
    });
    
    return updates;
}

// Batch save all pending changes
async function batchSaveAllData() {
    if (!isGM) return;
    
    showSaveStatus('Saving all data...', 'loading');
    
    // Collect all current form data
    const updates = collectAllFormData();
    
    // Also collect relationships and projects data
    if (characterData.relationships && characterData.relationships.length > 0) {
        characterData.relationships.forEach((rel, index) => {
            Object.keys(rel).forEach(field => {
                if (rel[field] !== undefined && rel[field] !== null) {
                    updates.push({
                        section: 'relationships',
                        field: field,
                        value: rel[field],
                        index: index
                    });
                }
            });
        });
    }
    
    if (characterData.projects && characterData.projects.length > 0) {
        characterData.projects.forEach((proj, index) => {
            Object.keys(proj).forEach(field => {
                if (proj[field] !== undefined && proj[field] !== null) {
                    let value = proj[field];
                    // Convert arrays to JSON for transmission
                    if (Array.isArray(value)) {
                        value = JSON.stringify(value);
                    }
                    updates.push({
                        section: 'projects',
                        field: field,
                        value: value,
                        index: index
                    });
                }
            });
        });
    }
    
    if (updates.length === 0) {
        showSaveStatus('No changes to save', 'info');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('action', 'batch_save');
        formData.append('character', currentCharacter);
        formData.append('updates', JSON.stringify(updates));
        
        const response = await fetch('dashboard.php', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            // Handle 508 error specifically
            if (response.status === 508) {
                console.error('508 Loop Detected - Possible recursive save issue');
                showSaveStatus('Save failed - Loop detected', 'error');
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showSaveStatus(`Saved ${data.saved} fields successfully`, 'success');
            clearModifiedFlag();
        } else {
            showSaveStatus('Failed to save data', 'error');
        }
    } catch (error) {
        console.error('Error saving data:', error);
        showSaveStatus('Error saving data', 'error');
    }
}

// Clear all form data to prevent contamination
function clearAllFormData() {
    if (!isGM) return;
    
    // Clear all input and textarea elements
    const allInputs = document.querySelectorAll('input[data-section], textarea[data-section]');
    allInputs.forEach(input => {
        if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
            input.value = '';
        }
    });
    
    // Clear any dynamically populated elements
    const portraitImg = document.getElementById('character-portrait');
    if (portraitImg) {
        portraitImg.src = 'portraits/default.png';
    }
}

// Finalize current class (GM only)
function finalizeClass() {
    if (!isGM) return;
    
    const classNameElement = document.getElementById('class_name');
    if (!classNameElement || !classNameElement.value) {
        alert('Please enter a class name before finalizing.');
        return;
    }
    
    const className = classNameElement.value;
    
    if (confirm(`Are you sure you want to finalize the class "${className}"?`)) {
        const formData = new FormData();
        formData.append('action', 'save');
        formData.append('character', currentCharacter);
        formData.append('section', 'past_classes');
        formData.append('field', 'finalize');
        formData.append('value', '1');
        
        fetch('dashboard.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Clear current class fields
                document.querySelectorAll('input[data-section="current_classes"], textarea[data-section="current_classes"]').forEach(input => {
                    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
                        input.value = '';
                    }
                });
                
                // Reload character data to get updated past classes
                loadCharacterData(currentCharacter);
                
                showSaveStatus('Class finalized', 'success');
            } else {
                showSaveStatus('Failed to finalize class', 'error');
            }
        });
    }
}

// Portrait handling (GM only)
function uploadPortrait() {
    if (!isGM) return;
    document.getElementById('portrait-input').click();
}

function handlePortraitUpload(event) {
    if (!isGM) return;
    
    const file = event.target.files[0];
    if (file) {
        const formData = new FormData();
        formData.append('action', 'upload_portrait');
        formData.append('character', currentCharacter);
        formData.append('portrait', file);
        
        fetch('upload_portrait.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadPortrait(data.portrait_path);
                showSaveStatus('Portrait uploaded', 'success');
            } else {
                showSaveStatus('Failed to upload portrait', 'error');
            }
        })
        .catch(error => {
            console.error('Error uploading portrait:', error);
            showSaveStatus('Error uploading portrait', 'error');
        });
    }
}

function loadPortrait(portraitPath) {
    const img = document.getElementById('character-portrait');
    const placeholder = document.getElementById('portrait-placeholder');
    
    if (portraitPath && portraitPath.trim() !== '') {
        img.src = portraitPath;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        img.src = '';
        placeholder.style.display = 'flex';
    }
}

// Show save status (GM only shows save messages)
function showSaveStatus(message, type) {
    if (!isGM) return; // Only GM sees save status
    
    const statusElement = document.getElementById('save-status');
    if (!statusElement) return;
    
    statusElement.textContent = message;
    statusElement.className = `save-status ${type}`;
    
    // Log save attempts for debugging
    if (type === 'error') {
        console.log('Save error:', message);
    }
    
    if (type !== 'loading') {
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = 'save-status';
        }, 3000);
    }
}

// Function to manually trigger save (for backward compatibility)
function restartAutoSave() {
    // This function is kept for backward compatibility but does nothing
    // since we no longer have auto-save intervals
    console.log('Auto-save intervals have been removed. Use manual save button.');
}

// Navigation functions for external sections
function openRulesSection(section) {
    const url = `rules/${section}/index.html`;
    window.open(url, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
}

function openStrixhavenSection(section) {
    // Check if GM section and user is not GM
    if (section === 'gm' && !isGM) {
        // Do nothing - GM section is restricted
        return false;
    }
    
    const url = `strixhaven/${section}/index.php`;
    window.open(url, '_blank');
}

function openCombatTracker() {
    const url = `combat/index.php`;
    window.open(url, '_blank');
}

function openSchedule() {
    const url = `schedule/index.php`;
    window.open(url, '_blank');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            try {
                func.apply(this, args);
            } catch (error) {
                console.error('Error in debounced function:', error);
            }
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===========================
// NPC Name Autocomplete
// ===========================
let npcCharacters = [];
let autocompleteBox = null;
let autocompleteItems = [];
let autocompleteIndex = 0;
let autocompleteInput = null;

async function initRelationshipAutocomplete() {
    autocompleteBox = document.getElementById('character-autocomplete');
    if (window.characterLookup && autocompleteBox) {
        try {
            await window.characterLookup.init();
            npcCharacters = window.characterLookup.allCharacters || [];
        } catch (err) {
            console.error('Failed to init character lookup', err);
        }
    }

    document.addEventListener('click', function(e) {
        if (autocompleteBox && autocompleteBox.style.display === 'block' &&
            !autocompleteBox.contains(e.target) && e.target !== autocompleteInput) {
            hideNameAutocomplete();
        }
    });
}

// Check if there are pending changes
function hasPendingChanges() {
    const saveBtn = document.getElementById('save-all-btn');
    return saveBtn && saveBtn.classList.contains('has-changes');
}

// Mark that we have unsaved changes
function markAsModified() {
    const saveBtn = document.getElementById('save-all-btn');
    if (saveBtn && !saveBtn.classList.contains('has-changes')) {
        saveBtn.classList.add('has-changes');
        saveBtn.textContent = 'Save All Data *';
    }
}

// Clear the modified flag after saving
function clearModifiedFlag() {
    const saveBtn = document.getElementById('save-all-btn');
    if (saveBtn) {
        saveBtn.classList.remove('has-changes');
        saveBtn.textContent = 'Save All Data';
    }
}

function attachNameAutocomplete(input, index) {
    if (!input) return;
    input.dataset.relIndex = index;
    input.addEventListener('input', () => showNameAutocomplete(input));
    input.addEventListener('keydown', handleAutocompleteKey);
}

function showNameAutocomplete(input) {
    if (!autocompleteBox || npcCharacters.length === 0) return;
    autocompleteInput = input;
    const term = input.value.toLowerCase();
    const matches = npcCharacters.filter(c => c.name.toLowerCase().includes(term)).slice(0, 10);

    if (matches.length === 0) {
        hideNameAutocomplete();
        return;
    }

    autocompleteBox.innerHTML = '';
    autocompleteItems = matches.map((c, i) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = c.name;
        item.addEventListener('click', () => selectNameSuggestion(i));
        autocompleteBox.appendChild(item);
        return item;
    });

    autocompleteIndex = 0;
    updateAutocompleteSelection();

    const rect = input.getBoundingClientRect();
    autocompleteBox.style.left = (rect.left + window.scrollX) + 'px';
    autocompleteBox.style.top = (rect.bottom + window.scrollY) + 'px';
    autocompleteBox.style.display = 'block';
}

function hideNameAutocomplete() {
    if (autocompleteBox) {
        autocompleteBox.style.display = 'none';
    }
}

function updateAutocompleteSelection() {
    autocompleteItems.forEach((item, idx) => {
        item.classList.toggle('selected', idx === autocompleteIndex);
    });
}

function selectNameSuggestion(idx) {
    if (!autocompleteInput) return;
    const item = autocompleteItems[idx];
    if (item) {
        autocompleteInput.value = item.textContent;
        const relIdx = parseInt(autocompleteInput.dataset.relIndex);
        updateRelationshipField(relIdx, 'npc_name', item.textContent);
    }
    hideNameAutocomplete();
}

function handleAutocompleteKey(e) {
    if (!autocompleteBox || autocompleteBox.style.display !== 'block') return;
    const items = autocompleteItems;
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteIndex = (autocompleteIndex + 1) % items.length;
        updateAutocompleteSelection();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteIndex = (autocompleteIndex - 1 + items.length) % items.length;
        updateAutocompleteSelection();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectNameSuggestion(autocompleteIndex);
    } else if (e.key === 'Escape') {
        hideNameAutocomplete();
    }
}