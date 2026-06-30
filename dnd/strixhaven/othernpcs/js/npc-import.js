document.addEventListener('DOMContentLoaded', function() {
    const jsonInput = document.getElementById('json-input');
    const previewBtn = document.getElementById('preview-btn');
    const importBtn = document.getElementById('import-btn');
    const clearBtn = document.getElementById('clear-btn');
    const previewSection = document.getElementById('preview-section');
    const previewData = document.getElementById('preview-data');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const warningMessage = document.getElementById('warning-message');

    const validWantTags = ['Legacy', 'Recognition', 'Freedom', 'Power', 'Knowledge', 'Connection', 'Survival', 'Justice', 'Creation', 'Redemption'];

    jsonInput.addEventListener('input', function() {
        hideMessages();
        previewSection.style.display = 'none';
        updateButtonStates();
    });

    previewBtn.addEventListener('click', function() {
        if (!validateJSON()) return;

        try {
            const jsonData = JSON.parse(jsonInput.value.trim());
            const preview = generatePreview(jsonData);

            previewData.textContent = preview.text;
            previewSection.style.display = 'block';
            hideMessages();

            if (preview.warnings.length > 0) {
                showWarning('Validation warnings: ' + preview.warnings.join('; '));
            }

            importBtn.disabled = false;
        } catch (error) {
            showError('Invalid JSON format: ' + error.message);
            previewSection.style.display = 'none';
            importBtn.disabled = true;
        }
    });

    importBtn.addEventListener('click', function() {
        if (!validateJSON()) return;

        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';

        fetch('import_npc.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                json_data: jsonInput.value.trim()
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                let successMsg = `${data.imported_count} NPC record${data.imported_count === 1 ? '' : 's'} imported successfully.`;

                if (data.npc_names && data.npc_names.length > 0) {
                    successMsg += '\n\nImported:\n' + data.npc_names.map(name => `- ${name}`).join('\n');
                }

                if (data.skipped_count && data.skipped_count > 0) {
                    successMsg += `\n\nSkipped records: ${data.skipped_count}`;
                }

                if (data.warnings && data.warnings.length > 0) {
                    successMsg += '\n\nWarnings:\n' + data.warnings.join('\n');
                }

                showSuccess(successMsg);
                clearForm(false);

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
            importBtn.disabled = false;
            importBtn.textContent = 'Import NPCs';
        });
    });

    clearBtn.addEventListener('click', function() {
        clearForm(true);
    });

    function validateJSON() {
        const jsonValue = jsonInput.value.trim();
        if (!jsonValue) {
            showError('Please enter JSON data to import.');
            return false;
        }

        try {
            const data = JSON.parse(jsonValue);
            const records = getNpcRecords(data);

            if (records.length === 0) {
                showError('NPC JSON must be one NPC object or an object with an npcs array.');
                return false;
            }

            const namedRecords = records.filter(record => record && typeof record === 'object' && !Array.isArray(record) && typeof record.name === 'string' && record.name.trim() !== '');
            if (namedRecords.length === 0) {
                showError('At least one NPC record must include a name.');
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
        if (!hasJson) {
            importBtn.disabled = true;
        }
    }

    function getNpcRecords(jsonData) {
        if (jsonData && Array.isArray(jsonData.npcs)) {
            return jsonData.npcs;
        }
        if (jsonData && Array.isArray(jsonData.other_npcs)) {
            return jsonData.other_npcs;
        }
        if (jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
            return [jsonData];
        }
        return [];
    }

    function generatePreview(jsonData) {
        const records = getNpcRecords(jsonData);
        let preview = `NPC Import Preview:\n\nRecords found: ${records.length}\n`;
        const warnings = [];

        records.forEach((record, index) => {
            preview += `\n${index + 1}. `;

            if (!record || typeof record !== 'object' || Array.isArray(record)) {
                preview += 'Invalid record\n';
                warnings.push(`Record ${index + 1} is not an object and will be skipped`);
                return;
            }

            if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
                preview += 'Unnamed record\n';
                warnings.push(`Record ${index + 1} has no name and will be skipped`);
                return;
            }

            preview += `${record.name}\n`;
            if (record.age) preview += `   Age: ${record.age}\n`;
            if (record.race) preview += `   Race: ${record.race}\n`;
            if (record.school) preview += `   School: ${record.school}\n`;
            if (record.college) preview += `   College: ${record.college}\n`;
            if (record.character_description) preview += '   Description: yes\n';
            if (record.general_info) preview += '   General Information: yes\n';

            if (record.conflict_engine) {
                preview += '   Conflict Engine:\n';
                const ce = record.conflict_engine;
                if (ce.want) preview += `      Want: ${ce.want}\n`;
                if (ce.want_tag) {
                    preview += `      Want Tag: ${ce.want_tag}\n`;
                    if (!validWantTags.includes(ce.want_tag)) {
                        warnings.push(`Custom want tag '${ce.want_tag}' on ${record.name}`);
                    }
                }
                if (ce.obstacle) preview += `      Obstacle: ${ce.obstacle}\n`;
                if (ce.action) preview += `      Action: ${ce.action}\n`;
                if (ce.consequence) preview += `      Consequence: ${ce.consequence}\n`;
            }

            if (Array.isArray(record.tension_web) && record.tension_web.length > 0) {
                preview += `   Tension Web: ${record.tension_web.length} entr${record.tension_web.length === 1 ? 'y' : 'ies'}\n`;
            }

            if (record.pressure_point) preview += '   Pressure Point: yes\n';
            if (record.trajectory) preview += '   Trajectory: yes\n';
            if (record.directors_notes) preview += '   Director\'s Notes: yes\n';
            if (record.images && Array.isArray(record.images) && record.images.length > 0) preview += `   Images: ${record.images.length} existing path${record.images.length === 1 ? '' : 's'}\n`;
        });

        preview += '\n---\n';
        preview += 'This will create new Other NPC records.\n';
        preview += 'New NPC IDs will be generated.\n';
        preview += 'Portrait files can be uploaded separately after import.';

        return {
            text: preview,
            warnings: warnings
        };
    }

    function clearForm(resetInput) {
        if (resetInput) {
            jsonInput.value = '';
        }
        previewSection.style.display = 'none';
        hideMessages();
        updateButtonStates();
    }

    function showError(message) {
        hideMessages();
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function showSuccess(message) {
        hideMessages();
        successMessage.textContent = message;
        successMessage.style.display = 'block';
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

    updateButtonStates();
});
