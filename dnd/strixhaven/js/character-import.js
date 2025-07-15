// Character Import JavaScript Logic
document.addEventListener('DOMContentLoaded', function() {
    let selectedCharacter = null;
    
    // Character selection elements
    const characterOptions = document.querySelectorAll('.character-option');
    const jsonInput = document.getElementById('json-input');
    const previewBtn = document.getElementById('preview-btn');
    const importBtn = document.getElementById('import-btn');
    const clearBtn = document.getElementById('clear-btn');
    const previewSection = document.getElementById('preview-section');
    const previewData = document.getElementById('preview-data');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    
    // Character selection handling
    characterOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove selected class from all options
            characterOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selected class to clicked option
            this.classList.add('selected');
            
            // Store selected character
            selectedCharacter = this.getAttribute('data-character');
            
            // Update UI state
            updateButtonStates();
        });
    });
    
    // JSON input handling
    jsonInput.addEventListener('input', function() {
        hideMessages();
        previewSection.style.display = 'none';
        updateButtonStates();
    });
    
    // Preview button handling
    previewBtn.addEventListener('click', function() {
        if (!validateInputs()) return;
        
        try {
            const jsonData = JSON.parse(jsonInput.value.trim());
            const preview = generatePreview(jsonData);
            
            previewData.textContent = preview;
            previewSection.style.display = 'block';
            hideMessages();
            
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
        if (!validateInputs()) return;
        
        // Show loading state
        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';
        
        // Prepare data for import
        const importData = {
            character_slot: selectedCharacter,
            json_data: jsonInput.value.trim()
        };
        
        // Send import request
        fetch('import_character.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(importData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showSuccess(`Character "${data.character_name}" imported successfully to ${selectedCharacter} slot!`);
                
                // Clear form after successful import
                clearForm();
                
                // Optionally redirect to dashboard after a delay
                setTimeout(() => {
                    window.location.href = '../dashboard.php';
                }, 2000);
                
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
            importBtn.textContent = 'Import Character';
        });
    });
    
    // Clear button handling
    clearBtn.addEventListener('click', function() {
        clearForm();
    });
    
    // Helper functions
    function validateInputs() {
        if (!selectedCharacter) {
            showError('Please select a character slot first.');
            return false;
        }
        
        const jsonValue = jsonInput.value.trim();
        if (!jsonValue) {
            showError('Please enter JSON data to import.');
            return false;
        }
        
        try {
            JSON.parse(jsonValue);
        } catch (error) {
            showError('Invalid JSON format: ' + error.message);
            return false;
        }
        
        return true;
    }
    
    function updateButtonStates() {
        const hasCharacter = selectedCharacter !== null;
        const hasJson = jsonInput.value.trim().length > 0;
        
        previewBtn.disabled = !(hasCharacter && hasJson);
        
        // Import button is only enabled after successful preview
        if (!hasCharacter || !hasJson) {
            importBtn.disabled = true;
        }
    }
    
    function generatePreview(jsonData) {
        let preview = 'Character Import Preview:\n\n';
        
        // Basic information
        if (jsonData.name) {
            preview += `Name: ${jsonData.name}\n`;
        }
        
        if (jsonData.race) {
            preview += `Race: ${jsonData.race}\n`;
        }
        
        if (jsonData.age) {
            preview += `Age: ${jsonData.age}\n`;
        }
        
        if (jsonData.year) {
            preview += `Year: ${jsonData.year}\n`;
        }
        
        if (jsonData.college) {
            preview += `College: ${jsonData.college}\n`;
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
        
        // Skills
        if (jsonData.skills && Array.isArray(jsonData.skills) && jsonData.skills.length > 0) {
            preview += `Skills: ${jsonData.skills.join(', ')}\n`;
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
        
        preview += `\nThis data will be imported to the "${selectedCharacter}" character slot.`;
        preview += '\nExisting data will be preserved where possible.';
        preview += '\nNote: Portrait image must be uploaded separately.';
        
        return preview;
    }
    
    function clearForm() {
        // Clear character selection
        characterOptions.forEach(option => option.classList.remove('selected'));
        selectedCharacter = null;
        
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
    
    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }
    
    // Initialize button states
    updateButtonStates();
});