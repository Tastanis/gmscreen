// Relationship Autocomplete System
// Based on character-lookup.js but simplified for relationship name inputs

class RelationshipAutocomplete {
    constructor() {
        this.students = [];
        this.autocompleteVisible = false;
        this.currentInput = null;
        this.selectedIndex = -1;
    }

    async init() {
        console.log('Initializing Relationship Autocomplete...');
        
        try {
            await this.loadStudents();
            this.setupInputListeners();
            console.log('Relationship Autocomplete initialized with', this.students.length, 'students');
        } catch (error) {
            console.error('Error initializing Relationship Autocomplete:', error);
        }
    }

    async loadStudents() {
        try {
            const formData = new FormData();
            formData.append('action', 'get_students_for_autocomplete');
            
            const response = await fetch('dashboard.php', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.students) {
                this.students = data.students;
                console.log('Loaded', this.students.length, 'students for autocomplete');
            } else {
                console.error('Failed to load students:', data.error);
            }
        } catch (error) {
            console.error('Error loading students:', error);
            this.students = [];
        }
    }

    setupInputListeners() {
        // Listen for any new relationship inputs being added
        document.addEventListener('input', (e) => {
            // Check if this is a relationship name input
            if (e.target.matches('input[onchange*="updateRelationshipField"][onchange*="npc_name"]')) {
                this.handleInput(e);
            }
        });

        document.addEventListener('focusin', (e) => {
            if (e.target.matches('input[onchange*="updateRelationshipField"][onchange*="npc_name"]')) {
                this.currentInput = e.target;
                // Show autocomplete if there's already text
                if (e.target.value.trim()) {
                    this.showAutocomplete(e.target.value.trim());
                }
            }
        });

        document.addEventListener('focusout', (e) => {
            // Hide autocomplete when focus leaves the input (with a small delay for clicks)
            setTimeout(() => {
                if (this.currentInput === e.target && 
                    !e.relatedTarget?.closest('.character-autocomplete')) {
                    this.hideAutocomplete();
                }
            }, 200);
        });

        // Handle keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.autocompleteVisible && this.currentInput) {
                this.handleKeydown(e);
            }
        });

        // Hide autocomplete when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.character-autocomplete') && 
                !e.target.matches('input[onchange*="updateRelationshipField"][onchange*="npc_name"]')) {
                this.hideAutocomplete();
            }
        });
    }

    handleInput(e) {
        const searchTerm = e.target.value.trim();
        this.currentInput = e.target;
        
        if (searchTerm.length > 0) {
            this.showAutocomplete(searchTerm);
        } else {
            this.hideAutocomplete();
        }
    }

    showAutocomplete(searchTerm) {
        const matches = this.findMatches(searchTerm);
        
        if (matches.length === 0) {
            this.hideAutocomplete();
            return;
        }
        
        const autocomplete = document.getElementById('relationship-autocomplete');
        if (!autocomplete) return;
        
        autocomplete.innerHTML = '';
        this.selectedIndex = -1;
        
        matches.forEach((student, index) => {
            const item = this.createAutocompleteItem(student, index === 0);
            autocomplete.appendChild(item);
        });
        
        this.positionAutocomplete();
        autocomplete.style.display = 'block';
        this.autocompleteVisible = true;
    }

    positionAutocomplete() {
        const autocomplete = document.getElementById('relationship-autocomplete');
        if (!autocomplete || !this.currentInput) return;
        
        const rect = this.currentInput.getBoundingClientRect();
        
        autocomplete.style.position = 'fixed';
        autocomplete.style.left = rect.left + 'px';
        autocomplete.style.top = (rect.bottom + 2) + 'px';
        autocomplete.style.width = Math.max(rect.width, 300) + 'px';
        autocomplete.style.zIndex = '1001';
        
        // Keep it on screen
        const autocompleteRect = autocomplete.getBoundingClientRect();
        if (autocompleteRect.right > window.innerWidth) {
            autocomplete.style.left = (window.innerWidth - autocompleteRect.width - 10) + 'px';
        }
        if (autocompleteRect.bottom > window.innerHeight) {
            autocomplete.style.top = (rect.top - autocompleteRect.height - 2) + 'px';
        }
    }

    hideAutocomplete() {
        const autocomplete = document.getElementById('relationship-autocomplete');
        if (autocomplete) {
            autocomplete.style.display = 'none';
        }
        this.autocompleteVisible = false;
        this.selectedIndex = -1;
    }

    findMatches(searchTerm) {
        if (!this.students || this.students.length === 0) {
            return [];
        }
        
        const term = searchTerm.toLowerCase();
        return this.students.filter(student => 
            student.name.toLowerCase().includes(term)
        ).slice(0, 10);
    }

    createAutocompleteItem(student, selected = false) {
        const item = document.createElement('div');
        item.className = `autocomplete-item ${selected ? 'selected' : ''}`;
        item.dataset.studentId = student.id;
        item.dataset.studentName = student.name;
        
        const typeLabel = `Student${student.grade ? ' - ' + student.grade : ''}`;
        
        let imagePath = student.image_path || (student.images && student.images.length > 0 ? student.images[0] : '');
        if (imagePath && !imagePath.startsWith('http')) {
            imagePath = `strixhaven/students/${imagePath}?t=${Date.now()}`;
        }
        
        item.innerHTML = `
            ${imagePath ? 
                `<img src="${imagePath}" alt="${this.escapeHtml(student.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                 <div class="autocomplete-placeholder" style="display:none;">👤</div>` : 
                '<div class="autocomplete-placeholder">👤</div>'
            }
            <div class="autocomplete-item-info">
                <div class="autocomplete-item-name">${this.escapeHtml(student.name)}</div>
                <div class="autocomplete-item-details">${typeLabel}${student.college ? ' - ' + student.college : ''}</div>
            </div>
        `;
        
        item.addEventListener('click', () => {
            this.selectStudent(student);
        });
        
        return item;
    }

    handleKeydown(e) {
        const autocomplete = document.getElementById('relationship-autocomplete');
        if (!autocomplete) return;
        
        const items = autocomplete.querySelectorAll('.autocomplete-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
                this.updateSelection(items);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection(items);
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
                    const item = items[this.selectedIndex];
                    const student = this.students.find(s => s.id === item.dataset.studentId);
                    if (student) {
                        this.selectStudent(student);
                    }
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                this.hideAutocomplete();
                break;
        }
    }

    updateSelection(items) {
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });
    }

    selectStudent(student) {
        if (!this.currentInput) return;
        
        // Update the input value
        this.currentInput.value = student.name;
        
        // Store the student ID in a data attribute
        this.currentInput.dataset.studentId = student.id;
        
        // Get the relationship index from the onchange attribute
        const onchangeAttr = this.currentInput.getAttribute('onchange');
        const match = onchangeAttr.match(/updateRelationshipField\((\d+),/);
        
        if (match) {
            const index = parseInt(match[1]);
            
            // Update the relationship field with both name and ID
            updateRelationshipField(index, 'npc_name', student.name);
            updateRelationshipField(index, 'student_id', student.id);
        }
        
        this.hideAutocomplete();
    }

    escapeHtml(text) {
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (typeof isGM !== 'undefined' && isGM) {
        window.relationshipAutocomplete = new RelationshipAutocomplete();
        window.relationshipAutocomplete.init();
    }
});