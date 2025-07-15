// Student Import JavaScript Logic
document.addEventListener('DOMContentLoaded', function() {
    // Form elements
    const jsonInput = document.getElementById('json-input');
    const previewBtn = document.getElementById('preview-btn');
    const importBtn = document.getElementById('import-btn');
    const clearBtn = document.getElementById('clear-btn');
    const previewSection = document.getElementById('preview-section');
    const previewData = document.getElementById('preview-data');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const warningMessage = document.getElementById('warning-message');
    
    // Validation constants
    const validColleges = ['Silverquill', 'Prismari', 'Witherbloom', 'Lorehold', 'Quandrix'];
    const validYears = ['1st', '2nd', '3rd', '4th'];
    const validSkills = [
        // Crafting Skills
        'Alchemy', 'Architecture', 'Blacksmithing', 'Carpentry', 'Cooking', 'Fletching', 
        'Forgery', 'Jewelry', 'Mechanics', 'Tailoring',
        
        // Exploration Skills  
        'Climb', 'Drive', 'Endurance', 'Gymnastics', 'Heal', 'Jump', 'Lift', 'Navigate', 
        'Ride', 'Swim', 'Track',
        
        // Interpersonal Skills
        'Brag', 'Empathize', 'Flirt', 'Gamble', 'Handle Animals', 'Interrogate', 
        'Intimidate', 'Lead', 'Lie', 'Music', 'Perform', 'Persuade', 'Read Person',
        
        // Intrigue Skills
        'Alertness', 'Conceal Object', 'Disguise', 'Eavesdrop', 'Escape Artist', 'Hide', 
        'Pick Lock', 'Pick Pocket', 'Sabotage', 'Search',
        
        // Lore Skills
        'Culture', 'Criminal Underworld', 'History', 'Magic', 'Monsters', 'Nature', 
        'Psionics', 'Religion', 'Rumors', 'Society', 'Strategy', 'Timescape'
    ];
    
    // JSON input handling
    jsonInput.addEventListener('input', function() {
        hideMessages();
        previewSection.style.display = 'none';
        updateButtonStates();
    });
    
    // Preview button handling
    previewBtn.addEventListener('click', function() {
        if (!validateJSON()) return;
        
        try {
            const jsonData = JSON.parse(jsonInput.value.trim());
            const preview = generatePreview(jsonData);
            
            previewData.textContent = preview.text;
            previewSection.style.display = 'block';
            hideMessages();
            
            // Show warnings if any
            if (preview.warnings.length > 0) {
                showWarning('Validation warnings: ' + preview.warnings.join('; '));
            }
            
            // Enable import button after successful preview
            importBtn.disabled = false;
            
        } catch (error) {
            showError('Invalid JSON format: ' + error.message);
            previewSection.style.display = 'none';
            importBtn.disabled = true;
        }
    });
    
    // Import button handling
    importBtn.addEventListener('click', function() {
        if (!validateJSON()) return;
        
        // Show loading state
        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';
        
        // Prepare data for import
        const importData = {
            json_data: jsonInput.value.trim()
        };
        
        // Send import request
        fetch('import_student.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(importData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                let successMsg = `Student "${data.student_name}" imported successfully!`;
                
                if (data.warnings && data.warnings.length > 0) {
                    successMsg += '\n\nWarnings:\n' + data.warnings.join('\n');
                }
                
                showSuccess(successMsg);
                
                // Clear form after successful import
                clearForm();
                
                // Optionally redirect to students list after a delay
                setTimeout(() => {
                    window.location.href = 'index.php';
                }, 3000);
                
            } else {
                showError('Import failed: ' + data.error);
            }
        })
        .catch(error => {
            showError('Network error: ' + error.message);
        })
        .finally(() => {
            // Reset button state
            importBtn.disabled = false;
            importBtn.textContent = 'Import Student';
        });
    });
    
    // Clear button handling
    clearBtn.addEventListener('click', function() {
        clearForm();
    });
    
    // Helper functions
    function validateJSON() {
        const jsonValue = jsonInput.value.trim();
        if (!jsonValue) {
            showError('Please enter JSON data to import.');
            return false;
        }
        
        try {
            const data = JSON.parse(jsonValue);
            
            // Check for required name field
            if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
                showError('Student name is required in the JSON data.');
                return false;
            }
            
            return true;
        } catch (error) {
            showError('Invalid JSON format: ' + error.message);
            return false;
        }
    }
    
    function updateButtonStates() {
        const hasJson = jsonInput.value.trim().length > 0;
        
        previewBtn.disabled = !hasJson;
        
        // Import button is only enabled after successful preview
        if (!hasJson) {
            importBtn.disabled = true;
        }
    }
    
    function generatePreview(jsonData) {
        let preview = 'Student Import Preview:\n\n';
        let warnings = [];
        
        // Basic information
        if (jsonData.name) {
            preview += `Name: ${jsonData.name}\n`;
        } else {
            warnings.push('Name is required');
        }
        
        if (jsonData.race) {
            preview += `Race: ${jsonData.race}\n`;
        }
        
        if (jsonData.age) {
            preview += `Age: ${jsonData.age}\n`;
        }
        
        // Year validation and conversion
        if (jsonData.year) {
            const year = jsonData.year.toString().replace(/[^0-9]/g, '');
            const yearSuffix = year + (year === '1' ? 'st' : year === '2' ? 'nd' : year === '3' ? 'rd' : 'th');
            
            if (validYears.includes(yearSuffix)) {
                preview += `Year: ${yearSuffix} Year\n`;
            } else {
                preview += `Year: 1st Year (defaulted from invalid '${jsonData.year}')\n`;
                warnings.push(`Invalid year '${jsonData.year}', will default to '1st Year'`);
            }
        } else {
            preview += `Year: 1st Year (default)\n`;
        }
        
        // College validation
        if (jsonData.college) {
            if (validColleges.includes(jsonData.college)) {
                preview += `College: ${jsonData.college}\n`;
            } else {
                preview += `College: (invalid '${jsonData.college}')\n`;
                warnings.push(`Invalid college '${jsonData.college}', must be one of: ${validColleges.join(', ')}`);
            }
        }
        
        if (jsonData.job) {
            preview += `Job: ${jsonData.job}\n`;
        }
        
        if (jsonData.edge) {
            preview += `Edge: ${jsonData.edge}\n`;
        }
        
        if (jsonData.bane) {
            preview += `Bane: ${jsonData.bane}\n`;
        }
        
        // Clubs
        if (jsonData.clubs && Array.isArray(jsonData.clubs) && jsonData.clubs.length > 0) {
            preview += `Clubs: ${jsonData.clubs.join(', ')}\n`;
        }
        
        // Skills with validation
        if (jsonData.skills && Array.isArray(jsonData.skills) && jsonData.skills.length > 0) {
            const validSkillsList = [];
            const customSkillsList = [];
            
            jsonData.skills.forEach(skill => {
                if (validSkills.includes(skill)) {
                    validSkillsList.push(skill);
                } else {
                    customSkillsList.push(skill);
                }
            });
            
            if (validSkillsList.length > 0) {
                preview += `Skills: ${validSkillsList.join(', ')}`;
                if (customSkillsList.length > 0) {
                    preview += ` + ${customSkillsList.length} custom skill(s)`;
                }
                preview += '\n';
            } else if (customSkillsList.length > 0) {
                preview += `Skills: ${customSkillsList.length} custom skill(s)\n`;
            }
            
            if (customSkillsList.length > 0) {
                preview += `Custom Skills: ${customSkillsList.join(', ')}\n`;
                warnings.push(`Custom skills will be added: ${customSkillsList.join(', ')}`);
            }
        }
        
        // Character information
        if (jsonData.character_information) {
            preview += '\nCharacter Information:\n';
            const charInfo = jsonData.character_information;
            
            if (charInfo.origin) {
                preview += `Origin: ${charInfo.origin}\n`;
            }
            
            if (charInfo.desire) {
                preview += `Desire: ${charInfo.desire}\n`;
            }
            
            if (charInfo.fear) {
                preview += `Fear: ${charInfo.fear}\n`;
            }
            
            if (charInfo.connection) {
                preview += `Connection: ${charInfo.connection}\n`;
            }
            
            if (charInfo.impact) {
                preview += `Impact: ${charInfo.impact}\n`;
            }
            
            if (charInfo.change) {
                preview += `Change: ${charInfo.change}\n`;
            }
        }
        
        // Other notes
        if (jsonData.other_notes) {
            preview += `\nOther Notes: ${jsonData.other_notes}\n`;
        }
        
        preview += '\n---\n';
        preview += 'This data will be imported as a new student entry.\n';
        preview += 'A unique student ID will be generated.\n';
        preview += 'Relationships will be initialized as empty.\n';
        preview += 'Images can be uploaded separately after import.';
        
        return {
            text: preview,
            warnings: warnings
        };
    }
    
    function clearForm() {
        // Clear JSON input
        jsonInput.value = '';
        
        // Hide preview and messages
        previewSection.style.display = 'none';
        hideMessages();
        
        // Reset button states
        updateButtonStates();
    }
    
    function showError(message) {
        hideMessages();
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Scroll to error message
        errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    function showSuccess(message) {
        hideMessages();
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        
        // Scroll to success message
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    function showWarning(message) {
        warningMessage.textContent = message;
        warningMessage.style.display = 'block';
    }
    
    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
        warningMessage.style.display = 'none';
    }
    
    // Initialize button states
    updateButtonStates();
});