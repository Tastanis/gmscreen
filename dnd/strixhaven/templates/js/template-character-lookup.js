// =============================================================================
// Character Lookup System for Template Rich Text Editor
// =============================================================================

class TemplateCharacterLookup {
    constructor() {
        this.allCharacters = [];
        this.autocompleteVisible = false;
        this.currentEditor = null;
        this.searchStart = null;
        this.searchTerm = '';
        this.currentRange = null;
        this.isInitialized = false;
        this.autocompleteContainer = null;
        this.selectedIndex = -1;
        this.characterPopup = null;
    }

    async init() {
        console.log('Initializing Template Character Lookup...');
        
        try {
            await this.loadAllCharacters();
            this.isInitialized = true;
            this.setupGlobalListeners();
            console.log('Template Character Lookup initialized with', this.allCharacters.length, 'characters');
        } catch (error) {
            console.error('Error initializing Template Character Lookup:', error);
            this.isInitialized = true;
            this.allCharacters = [];
        }
    }

    async loadAllCharacters() {
        try {
            const response = await fetch('../../dashboard.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=get_all_characters'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseText = await response.text();
            
            if (!responseText.trim() || !responseText.trim().startsWith('{')) {
                console.warn('Invalid response from server');
                this.allCharacters = [];
                return;
            }
            
            const data = JSON.parse(responseText);
            
            if (data.success && data.characters) {
                this.allCharacters = data.characters;
            } else {
                console.warn('No character data received');
                this.allCharacters = [];
            }
            
        } catch (error) {
            console.error('Failed to load characters:', error);
            this.allCharacters = [];
        }
    }

    setupGlobalListeners() {
        // Listen for keydown on rich text editors
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });

        // Listen for input on rich text editors
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('rich-text-editor')) {
                this.handleInput(e);
            }
        });

        // Click outside to close autocomplete
        document.addEventListener('click', (e) => {
            if (this.autocompleteVisible && 
                !e.target.closest('.character-autocomplete') &&
                !e.target.classList.contains('rich-text-editor')) {
                this.hideAutocomplete();
            }
            
            if (this.characterPopup && 
                !e.target.closest('.character-popup') &&
                !e.target.classList.contains('character-ref')) {
                this.hideCharacterPopup();
            }
        });

        // Click on character references
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('character-ref')) {
                const characterName = e.target.textContent.replace(/[\[\]]/g, '');
                this.showCharacterPopup(characterName, e.pageX, e.pageY);
            }
        });
    }

    handleKeyDown(e) {
        if (!this.autocompleteVisible) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.moveSelection(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.moveSelection(-1);
                break;
            case 'Enter':
                e.preventDefault();
                this.selectCurrentItem();
                break;
            case 'Escape':
                e.preventDefault();
                this.hideAutocomplete();
                break;
        }
    }

    handleInput(e) {
        const editor = e.target;
        this.currentEditor = editor;
        
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const textNode = range.startContainer;
        
        if (textNode.nodeType !== Node.TEXT_NODE) return;
        
        const textContent = textNode.textContent;
        const cursorPos = range.startOffset;
        
        // Look for [[ pattern
        const beforeCursor = textContent.substring(0, cursorPos);
        const match = beforeCursor.match(/\[\[([^\]]*?)$/);
        
        if (match) {
            this.searchStart = cursorPos - match[1].length;
            this.searchTerm = match[1];
            this.currentRange = range.cloneRange();
            this.currentRange.setStart(textNode, this.searchStart - 2); // Include [[
            this.showAutocomplete();
        } else {
            this.hideAutocomplete();
        }
    }

    showAutocomplete() {
        if (!this.isInitialized) return;
        
        const matches = this.searchCharacters(this.searchTerm);
        
        if (matches.length === 0) {
            this.hideAutocomplete();
            return;
        }
        
        if (!this.autocompleteContainer) {
            this.createAutocompleteContainer();
        }
        
        this.populateAutocomplete(matches);
        this.positionAutocomplete();
        this.autocompleteVisible = true;
        this.selectedIndex = 0;
        this.updateSelection();
    }

    createAutocompleteContainer() {
        this.autocompleteContainer = document.createElement('div');
        this.autocompleteContainer.className = 'character-autocomplete';
        document.body.appendChild(this.autocompleteContainer);
    }

    populateAutocomplete(matches) {
        this.autocompleteContainer.innerHTML = '';
        
        matches.forEach((character, index) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.dataset.index = index;
            
            const img = document.createElement('img');
            img.src = character.image_path || '';
            img.alt = character.name;
            img.onerror = () => {
                img.style.display = 'none';
            };
            
            const info = document.createElement('div');
            info.className = 'autocomplete-item-info';
            
            const name = document.createElement('div');
            name.className = 'autocomplete-item-name';
            name.textContent = character.name;
            
            const type = document.createElement('div');
            type.className = 'autocomplete-item-type';
            type.textContent = character.type;
            
            info.appendChild(name);
            info.appendChild(type);
            
            item.appendChild(img);
            item.appendChild(info);
            
            item.addEventListener('click', () => {
                this.selectCharacter(character);
            });
            
            this.autocompleteContainer.appendChild(item);
        });
    }

    positionAutocomplete() {
        if (!this.currentRange || !this.autocompleteContainer) return;
        
        const rect = this.currentRange.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        this.autocompleteContainer.style.position = 'absolute';
        this.autocompleteContainer.style.left = (rect.left + scrollLeft) + 'px';
        this.autocompleteContainer.style.top = (rect.bottom + scrollTop + 5) + 'px';
        this.autocompleteContainer.style.display = 'block';
    }

    hideAutocomplete() {
        if (this.autocompleteContainer) {
            this.autocompleteContainer.style.display = 'none';
        }
        this.autocompleteVisible = false;
        this.selectedIndex = -1;
    }

    moveSelection(direction) {
        const items = this.autocompleteContainer.querySelectorAll('.autocomplete-item');
        if (items.length === 0) return;
        
        this.selectedIndex += direction;
        
        if (this.selectedIndex < 0) {
            this.selectedIndex = items.length - 1;
        } else if (this.selectedIndex >= items.length) {
            this.selectedIndex = 0;
        }
        
        this.updateSelection();
    }

    updateSelection() {
        const items = this.autocompleteContainer.querySelectorAll('.autocomplete-item');
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });
        
        // Scroll selected item into view
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
            items[this.selectedIndex].scrollIntoView({
                block: 'nearest'
            });
        }
    }

    selectCurrentItem() {
        const items = this.autocompleteContainer.querySelectorAll('.autocomplete-item');
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
            const matches = this.searchCharacters(this.searchTerm);
            if (matches[this.selectedIndex]) {
                this.selectCharacter(matches[this.selectedIndex]);
            }
        }
    }

    selectCharacter(character) {
        if (!this.currentRange || !this.currentEditor) return;
        
        // Extend range to include the search term and [[
        this.currentRange.setEnd(this.currentRange.startContainer, this.searchStart + this.searchTerm.length);
        
        // Create character reference element
        const charRef = document.createElement('span');
        charRef.className = 'character-ref';
        charRef.textContent = character.name;
        charRef.dataset.characterId = character.id;
        
        // Replace the selected text
        this.currentRange.deleteContents();
        this.currentRange.insertNode(charRef);
        
        // Add closing ]] after the reference
        const closingBrackets = document.createTextNode(']] ');
        this.currentRange.setStartAfter(charRef);
        this.currentRange.insertNode(closingBrackets);
        
        // Position cursor after the closing brackets
        const newRange = document.createRange();
        newRange.setStartAfter(closingBrackets);
        newRange.collapse(true);
        
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        this.hideAutocomplete();
        
        // Trigger content change
        if (typeof window.onRichTextChange === 'function') {
            const fieldName = this.currentEditor.closest('.rich-text-container').id.replace('-container', '');
            window.onRichTextChange(fieldName, this.currentEditor.innerHTML);
        }
    }

    searchCharacters(term) {
        if (!term) return this.allCharacters.slice(0, 10);
        
        const lowercaseTerm = term.toLowerCase();
        
        return this.allCharacters.filter(character => 
            character.name.toLowerCase().includes(lowercaseTerm)
        ).slice(0, 10);
    }

    showCharacterPopup(characterName, x, y) {
        const character = this.allCharacters.find(c => 
            c.name.toLowerCase() === characterName.toLowerCase()
        );
        
        if (!character) return;
        
        this.hideCharacterPopup();
        
        this.characterPopup = document.createElement('div');
        this.characterPopup.className = 'character-popup';
        
        const header = document.createElement('div');
        header.className = 'character-popup-header';
        
        if (character.image_path) {
            const img = document.createElement('img');
            img.className = 'character-popup-image';
            img.src = character.image_path;
            img.alt = character.name;
            header.appendChild(img);
        }
        
        const title = document.createElement('div');
        title.className = 'character-popup-title';
        
        const name = document.createElement('h3');
        name.className = 'character-popup-name';
        name.textContent = character.name;
        
        const type = document.createElement('div');
        type.className = 'character-popup-type';
        type.textContent = character.type;
        
        title.appendChild(name);
        title.appendChild(type);
        header.appendChild(title);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'character-popup-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => this.hideCharacterPopup();
        
        const content = document.createElement('div');
        content.className = 'character-popup-content';
        
        // Add relevant character fields based on type
        const fields = this.getCharacterFields(character);
        fields.forEach(field => {
            if (character[field.key]) {
                const fieldDiv = document.createElement('div');
                fieldDiv.className = 'character-popup-field';
                
                const label = document.createElement('div');
                label.className = 'character-popup-label';
                label.textContent = field.label;
                
                const value = document.createElement('div');
                value.className = 'character-popup-value';
                value.textContent = character[field.key];
                
                fieldDiv.appendChild(label);
                fieldDiv.appendChild(value);
                content.appendChild(fieldDiv);
            }
        });
        
        this.characterPopup.appendChild(closeBtn);
        this.characterPopup.appendChild(header);
        this.characterPopup.appendChild(content);
        
        document.body.appendChild(this.characterPopup);
        
        // Position popup
        this.characterPopup.style.left = Math.min(x, window.innerWidth - 420) + 'px';
        this.characterPopup.style.top = Math.min(y, window.innerHeight - 300) + 'px';
    }

    hideCharacterPopup() {
        if (this.characterPopup) {
            this.characterPopup.remove();
            this.characterPopup = null;
        }
    }

    getCharacterFields(character) {
        const commonFields = [
            { key: 'grade', label: 'Grade' },
            { key: 'college', label: 'College' },
            { key: 'role', label: 'Role' }
        ];
        
        if (character.type === 'student') {
            return [
                ...commonFields,
                { key: 'hex_number', label: 'Hex Number' }
            ];
        } else if (character.type === 'staff') {
            return [
                ...commonFields,
                { key: 'department', label: 'Department' }
            ];
        } else if (character.type === 'location') {
            return [
                { key: 'college', label: 'College' },
                { key: 'hex_number', label: 'Hex Number' },
                { key: 'description', label: 'Description' }
            ];
        }
        
        return commonFields;
    }
}

// Initialize character lookup when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.templateCharacterLookup = new TemplateCharacterLookup();
    window.templateCharacterLookup.init();
});

// Export for use
window.TemplateCharacterLookup = TemplateCharacterLookup;