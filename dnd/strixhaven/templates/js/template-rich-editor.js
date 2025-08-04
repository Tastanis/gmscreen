// =============================================================================
// Rich Text Editor for Template System
// =============================================================================

class TemplateRichEditor {
    constructor(container, fieldName, options = {}) {
        this.container = container;
        this.fieldName = fieldName;
        this.options = {
            placeholder: 'Enter text here...',
            readOnly: false,
            minHeight: 60,
            maxHeight: 300,
            tools: ['bold', 'italic', 'underline', 'bulletList', 'indent', 'outdent'],
            ...options
        };
        this.editor = null;
        this.toolbar = null;
        this.content = '';
        this.isReadOnly = this.options.readOnly;
        
        this.init();
    }

    init() {
        this.createToolbar();
        this.createEditor();
        this.setupEventListeners();
    }

    createToolbar() {
        if (this.isReadOnly) return;
        
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'rich-text-toolbar';
        
        const tools = [
            { name: 'bold', icon: 'B', title: 'Bold (Ctrl+B)', command: 'bold' },
            { name: 'italic', icon: 'I', title: 'Italic (Ctrl+I)', command: 'italic' },
            { name: 'underline', icon: 'U', title: 'Underline (Ctrl+U)', command: 'underline' },
            { name: 'bulletList', icon: '•', title: 'Bullet List', command: 'insertUnorderedList' },
            { name: 'indent', icon: '→', title: 'Indent', command: 'indent' },
            { name: 'outdent', icon: '←', title: 'Outdent', command: 'outdent' }
        ];

        tools.forEach(tool => {
            if (this.options.tools.includes(tool.name)) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'toolbar-button';
                button.textContent = tool.icon;
                button.title = tool.title;
                button.dataset.command = tool.command;
                
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.executeCommand(tool.command);
                });
                
                this.toolbar.appendChild(button);
            }
        });

        this.container.appendChild(this.toolbar);
    }

    createEditor() {
        this.editor = document.createElement('div');
        this.editor.className = 'rich-text-editor';
        this.editor.contentEditable = !this.isReadOnly;
        this.editor.style.minHeight = this.options.minHeight + 'px';
        this.editor.style.maxHeight = this.options.maxHeight + 'px';
        
        if (!this.content) {
            this.editor.innerHTML = `<p>${this.options.placeholder}</p>`;
        } else {
            this.editor.innerHTML = this.content;
        }
        
        this.container.appendChild(this.editor);
    }

    setupEventListeners() {
        if (this.isReadOnly) return;
        
        // Focus and blur events for placeholder
        this.editor.addEventListener('focus', () => {
            if (this.editor.textContent.trim() === this.options.placeholder) {
                this.editor.innerHTML = '<p><br></p>';
                this.placeCursorAtStart();
            }
        });

        this.editor.addEventListener('blur', () => {
            if (this.editor.textContent.trim() === '') {
                this.editor.innerHTML = `<p>${this.options.placeholder}</p>`;
            }
        });

        // Input event for content changes
        this.editor.addEventListener('input', () => {
            this.content = this.getContent();
            this.updateToolbarState();
            
            // Trigger change event for auto-save
            if (typeof window.onRichTextChange === 'function') {
                window.onRichTextChange(this.fieldName, this.content);
            }
            
            // Mark as having unsaved changes
            if (typeof window.hasUnsavedChanges !== 'undefined') {
                window.hasUnsavedChanges = true;
            }
        });

        // Keyboard shortcuts
        this.editor.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        this.executeCommand('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        this.executeCommand('italic');
                        break;
                    case 'u':
                        e.preventDefault();
                        this.executeCommand('underline');
                        break;
                }
            }
            
            // Handle Tab for indentation
            if (e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.executeCommand('outdent');
                } else {
                    this.executeCommand('indent');
                }
            }
        });

        // Update toolbar state on selection change
        this.editor.addEventListener('selectionchange', () => {
            this.updateToolbarState();
        });

        document.addEventListener('selectionchange', () => {
            if (document.activeElement === this.editor) {
                this.updateToolbarState();
            }
        });
    }

    executeCommand(command) {
        this.editor.focus();
        
        try {
            document.execCommand(command, false, null);
        } catch (error) {
            console.warn('Command execution failed:', command, error);
        }
        
        this.editor.focus();
        this.updateToolbarState();
        
        // Trigger content change
        this.content = this.getContent();
        if (typeof window.onRichTextChange === 'function') {
            window.onRichTextChange(this.fieldName, this.content);
        }
    }

    updateToolbarState() {
        if (!this.toolbar) return;
        
        const buttons = this.toolbar.querySelectorAll('.toolbar-button');
        buttons.forEach(button => {
            const command = button.dataset.command;
            try {
                if (['bold', 'italic', 'underline', 'insertUnorderedList'].includes(command)) {
                    if (document.queryCommandState(command)) {
                        button.classList.add('active');
                    } else {
                        button.classList.remove('active');
                    }
                }
            } catch (error) {
                // Ignore command state errors
            }
        });
    }

    placeCursorAtStart() {
        const range = document.createRange();
        const selection = window.getSelection();
        
        if (this.editor.firstChild) {
            range.setStart(this.editor.firstChild, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    getContent() {
        if (!this.editor) return '';
        
        // Don't return placeholder text
        if (this.editor.textContent.trim() === this.options.placeholder) {
            return '';
        }
        
        return this.editor.innerHTML;
    }

    setContent(content) {
        if (!this.editor) return;
        
        this.content = content || '';
        
        if (this.content) {
            this.editor.innerHTML = this.content;
        } else {
            this.editor.innerHTML = `<p>${this.options.placeholder}</p>`;
        }
    }

    focus() {
        if (this.editor && !this.isReadOnly) {
            this.editor.focus();
        }
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    setReadOnly(readOnly) {
        this.isReadOnly = readOnly;
        if (this.editor) {
            this.editor.contentEditable = !readOnly;
        }
        if (this.toolbar) {
            this.toolbar.style.display = readOnly ? 'none' : 'flex';
        }
    }
}

// Global function to handle rich text changes
window.onRichTextChange = function(fieldName, content) {
    // Mark as having unsaved changes
    if (typeof window.hasUnsavedChanges !== 'undefined') {
        window.hasUnsavedChanges = true;
    }
    
    // Auto-save after 2 seconds of inactivity
    if (window.autoSaveTimer) {
        clearTimeout(window.autoSaveTimer);
    }
    
    window.autoSaveTimer = setTimeout(() => {
        if (typeof window.saveTemplateData === 'function' && window.hasUnsavedChanges) {
            window.saveTemplateData('auto');
        }
    }, 2000);
};

// Export for use
window.TemplateRichEditor = TemplateRichEditor;