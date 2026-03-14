// Staff Import JavaScript Logic
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
        fetch('import_staff.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(importData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                let successMsg = `Staff member "${data.staff_name}" imported successfully!`;

                if (data.warnings && data.warnings.length > 0) {
                    successMsg += '\n\nWarnings:\n' + data.warnings.join('\n');
                }

                showSuccess(successMsg);

                // Clear form after successful import
                clearForm();

                // Redirect to staff list after a delay
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
            importBtn.textContent = 'Import Staff';
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
                showError('Staff member name is required in the JSON data.');
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
        let preview = 'Staff Import Preview:\n\n';
        let warnings = [];

        // Basic information
        if (jsonData.name) {
            preview += `Name: ${jsonData.name}\n`;
        } else {
            warnings.push('Name is required');
        }

        if (jsonData.title) {
            preview += `Title: ${jsonData.title}\n`;
        }

        if (jsonData.role) {
            preview += `Role: ${jsonData.role}\n`;
        }

        if (jsonData.pronouns) {
            preview += `Pronouns: ${jsonData.pronouns}\n`;
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

        if (jsonData.character_description) {
            preview += `\nCharacter Description: ${jsonData.character_description}\n`;
        }

        if (jsonData.general_info) {
            preview += `General Info: ${jsonData.general_info}\n`;
        }

        // Conflict Engine
        if (jsonData.conflict_engine) {
            preview += '\nConflict Engine:\n';
            const ce = jsonData.conflict_engine;
            if (ce.want) preview += `  Want: ${ce.want}\n`;
            if (ce.want_tag) preview += `  Want Tag: ${ce.want_tag}\n`;
            if (ce.obstacle) preview += `  Obstacle: ${ce.obstacle}\n`;
            if (ce.action) preview += `  Action: ${ce.action}\n`;
            if (ce.consequence) preview += `  Consequence: ${ce.consequence}\n`;
        }

        // Tension Web
        if (jsonData.tension_web && Array.isArray(jsonData.tension_web) && jsonData.tension_web.length > 0) {
            preview += '\nTension Web:\n';
            jsonData.tension_web.forEach((entry, i) => {
                preview += `  ${i + 1}. ${entry.name || 'Unnamed'}`;
                if (entry.role) preview += ` (${entry.role})`;
                preview += '\n';
                if (entry.description) preview += `     ${entry.description}\n`;
            });
        }

        // Pressure Point
        if (jsonData.pressure_point) {
            preview += `\nPressure Point: ${jsonData.pressure_point}\n`;
        }

        // Trajectory
        if (jsonData.trajectory) {
            preview += `\nTrajectory: ${jsonData.trajectory}\n`;
        }

        // Director's Notes
        if (jsonData.directors_notes) {
            preview += `\nDirector's Notes: ${jsonData.directors_notes}\n`;
        }

        // Character information
        if (jsonData.character_info) {
            preview += '\nCharacter Information:\n';
            const charInfo = jsonData.character_info;
            if (charInfo.origin) preview += `  Origin: ${charInfo.origin}\n`;
            if (charInfo.motivation) preview += `  Motivation: ${charInfo.motivation}\n`;
            if (charInfo.secrets) preview += `  Secrets: ${charInfo.secrets}\n`;
            if (charInfo.relationships) preview += `  Relationships: ${charInfo.relationships}\n`;
        }

        // GM Notes
        if (jsonData.gm_notes) {
            preview += '\nGM Notes:\n';
            const gmNotes = jsonData.gm_notes;
            if (gmNotes.plot_hooks) preview += `  Plot Hooks: ${gmNotes.plot_hooks}\n`;
            if (gmNotes.secrets) preview += `  Secrets: ${gmNotes.secrets}\n`;
            if (gmNotes.notes) preview += `  Notes: ${gmNotes.notes}\n`;
        }

        preview += '\n---\n';
        preview += 'This data will be imported as a new staff entry.\n';
        preview += 'A unique staff ID will be generated.\n';
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