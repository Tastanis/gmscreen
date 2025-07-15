// =============================================================================
// Rich Text Editor for GM Screen - FIXED VERSION
// =============================================================================

class RichTextEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            placeholder: 'Enter your notes here...',
            tools: ['bold', 'italic', 'underline', 'bulletList', 'image'],
            ...options
        };
        this.editor = null;
        this.toolbar = null;
        this.content = '';
        this.changeCallback = null;
        this.imagePreview = null;
    }

    // Initialize the rich text editor
    init() {
        console.log('Initializing Rich Text Editor (FIXED VERSION)...');
        this.createToolbar();
        this.createEditor();
        this.setupEventListeners();
        this.createImagePreview();
        console.log('Rich text editor initialized successfully');
    }

    // Create the image preview element
    createImagePreview() {
        this.imagePreview = document.createElement('div');
        this.imagePreview.id = 'image-hover-preview';
        this.imagePreview.style.cssText = `
            position: fixed;
            z-index: 10000;
            background: white;
            border: 2px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            padding: 8px;
            display: none;
            pointer-events: none;
            max-width: 300px;
            max-height: 300px;
        `;
        
        document.body.appendChild(this.imagePreview);
    }

    // Create the toolbar with formatting options
    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'rich-text-toolbar';
        
        // Add formatting buttons - FIXED WITH BULLET POINTS
        const tools = [
            { name: 'bold', icon: 'B', title: 'Bold (Ctrl+B)', command: 'bold' },
            { name: 'italic', icon: 'I', title: 'Italic (Ctrl+I)', command: 'italic' },
            { name: 'underline', icon: 'U', title: 'Underline (Ctrl+U)', command: 'underline' },
            { name: 'separator', type: 'separator' },
            { name: 'bulletList', icon: '•', title: 'Bullet List', command: 'insertUnorderedList' },
            { name: 'separator', type: 'separator' },
            { name: 'image', icon: '📷', title: 'Link Image to Selected Text', command: 'insertImage' }
        ];

        tools.forEach(tool => {
            if (tool.type === 'separator') {
                const separator = document.createElement('div');
                separator.className = 'toolbar-separator';
                this.toolbar.appendChild(separator);
            } else {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'toolbar-btn';
                button.dataset.command = tool.command;
                button.innerHTML = tool.icon;
                button.title = tool.title;
                button.addEventListener('click', (e) => this.handleToolbarClick(e, tool.command));
                this.toolbar.appendChild(button);
            }
        });

        this.container.appendChild(this.toolbar);
    }

    // Create the main editor area
    createEditor() {
        this.editor = document.createElement('div');
        this.editor.className = 'rich-text-editor';
        this.editor.contentEditable = 'true';
        this.editor.innerHTML = `<p>${this.options.placeholder}</p>`;
        
        // Add data attributes for styling
        this.editor.dataset.placeholder = this.options.placeholder;
        
        this.container.appendChild(this.editor);
    }

    // Setup event listeners
    setupEventListeners() {
        // Handle input changes
        this.editor.addEventListener('input', () => {
            this.handleChange();
            this.setupImageHoverListeners(); // Re-setup listeners after content changes
        });

        // Handle paste events
        this.editor.addEventListener('paste', (e) => {
            this.handlePaste(e);
        });

        // Handle focus/blur for placeholder
        this.editor.addEventListener('focus', () => {
            if (this.editor.textContent.trim() === this.options.placeholder) {
                this.editor.innerHTML = '<p><br></p>';
            }
            this.editor.classList.add('focused');
        });

        this.editor.addEventListener('blur', () => {
            if (this.editor.textContent.trim() === '') {
                this.editor.innerHTML = `<p>${this.options.placeholder}</p>`;
            }
            this.editor.classList.remove('focused');
            this.updateToolbarState();
        });

        // Handle selection changes
        this.editor.addEventListener('keyup', () => {
            this.updateToolbarState();
        });

        this.editor.addEventListener('mouseup', () => {
            this.updateToolbarState();
        });

        // Prevent default behavior for some keys
        this.editor.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });

        // Handle clicks on image links - OPEN IN NEW TAB
        this.editor.addEventListener('click', (e) => {
            const imageLink = e.target.closest('.image-link');
            if (imageLink) {
                e.preventDefault();
                this.openImageInNewTab(imageLink);
            }
        });

        // Setup initial image hover listeners
        this.setupImageHoverListeners();
    }

    // Setup hover listeners for image links
    setupImageHoverListeners() {
        const imageLinks = this.editor.querySelectorAll('.image-link');
        
        imageLinks.forEach(imageLink => {
            // Remove existing listeners to avoid duplicates
            imageLink.removeEventListener('mouseenter', this.showImagePreview);
            imageLink.removeEventListener('mouseleave', this.hideImagePreview);
            imageLink.removeEventListener('mousemove', this.updateImagePreviewPosition);
            
            // Add new listeners
            imageLink.addEventListener('mouseenter', (e) => this.showImagePreview(e));
            imageLink.addEventListener('mouseleave', (e) => this.hideImagePreview(e));
            imageLink.addEventListener('mousemove', (e) => this.updateImagePreviewPosition(e));
        });
    }

    // Show image preview on hover
    showImagePreview(e) {
        const imageLink = e.target.closest('.image-link');
        if (!imageLink || !this.imagePreview) return;
        
        const imageUrl = imageLink.getAttribute('data-image-url');
        const imageTitle = imageLink.getAttribute('data-image-title') || 'Image';
        
        if (!imageUrl) return;
        
        // Clear previous content
        this.imagePreview.innerHTML = '';
        
        // Create image element
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = imageTitle;
        img.style.cssText = `
            max-width: 100%;
            max-height: 100%;
            display: block;
            border-radius: 4px;
        `;
        
        // Create title element
        const title = document.createElement('div');
        title.textContent = imageTitle;
        title.style.cssText = `
            font-size: 12px;
            color: #666;
            margin-top: 4px;
            text-align: center;
            font-weight: 500;
        `;
        
        // Add loading indicator
        const loading = document.createElement('div');
        loading.textContent = 'Loading...';
        loading.style.cssText = `
            padding: 20px;
            text-align: center;
            color: #888;
            font-size: 14px;
        `;
        
        this.imagePreview.appendChild(loading);
        this.imagePreview.appendChild(title);
        
        // Handle image load
        img.onload = () => {
            this.imagePreview.removeChild(loading);
            this.imagePreview.insertBefore(img, title);
            this.updateImagePreviewPosition(e);
        };
        
        img.onerror = () => {
            loading.textContent = 'Failed to load image';
            loading.style.color = '#dc3545';
        };
        
        // Position and show preview
        this.updateImagePreviewPosition(e);
        this.imagePreview.style.display = 'block';
        
        console.log('Showing image preview for:', imageTitle, imageUrl);
    }

    // Hide image preview
    hideImagePreview(e) {
        if (this.imagePreview) {
            this.imagePreview.style.display = 'none';
        }
    }

    // Update image preview position based on mouse
    updateImagePreviewPosition(e) {
        if (!this.imagePreview || this.imagePreview.style.display === 'none') return;
        
        const padding = 15;
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        // Get preview dimensions (may be 0 if not loaded yet)
        const previewRect = this.imagePreview.getBoundingClientRect();
        const previewWidth = previewRect.width || 300;
        const previewHeight = previewRect.height || 300;
        
        // Calculate position
        let left = mouseX + padding;
        let top = mouseY + padding;
        
        // Adjust if preview would go off screen
        if (left + previewWidth > window.innerWidth) {
            left = mouseX - previewWidth - padding;
        }
        
        if (top + previewHeight > window.innerHeight) {
            top = mouseY - previewHeight - padding;
        }
        
        // Ensure preview doesn't go off left or top edge
        left = Math.max(padding, left);
        top = Math.max(padding, top);
        
        this.imagePreview.style.left = left + 'px';
        this.imagePreview.style.top = top + 'px';
    }

    // Handle toolbar button clicks
    handleToolbarClick(e, command) {
        e.preventDefault();
        
        switch (command) {
            case 'bold':
            case 'italic':
            case 'underline':
            case 'insertUnorderedList':
                document.execCommand(command, false, null);
                break;
            case 'insertImage':
                this.handleImageLink();
                break;
        }
        
        // Refocus editor after toolbar action
        this.editor.focus();
        this.updateToolbarState();
    }

    // Handle image link creation
    handleImageLink() {
        const selection = window.getSelection();
        
        if (!selection.rangeCount) {
            alert('Please select some text first, then click the image button to link an image to that text.');
            return;
        }
        
        const selectedText = selection.toString().trim();
        
        if (!selectedText) {
            alert('Please select some text first, then click the image button to link an image to that text.');
            return;
        }
        
        // Show file picker
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.webp';
        input.style.display = 'none';
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.uploadAndLinkImage(file, selectedText, selection.getRangeAt(0));
            }
        });
        
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    }

    // Upload image and create link
    async uploadAndLinkImage(file, selectedText, range) {
        try {
            // Show loading
            const loadingEl = this.showLoading('Uploading image...');
            
            const formData = new FormData();
            formData.append('image', file);
            
            const response = await fetch('image-upload.php', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Create image link
                this.createImageLink(selectedText, result.url, result.originalName, range);
                console.log('Image uploaded successfully:', result);
            } else {
                console.error('Image upload failed:', result.error);
                alert('Failed to upload image: ' + result.error);
            }
            
        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Error uploading image: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // Create image link in editor
    createImageLink(text, imageUrl, originalName, range) {
        try {
            // Create the image link element
            const link = document.createElement('span');
            link.className = 'image-link';
            link.textContent = text;
            link.setAttribute('data-image-url', imageUrl);
            link.setAttribute('data-image-title', originalName);
            link.contentEditable = 'false';
            
            // Style the link
            link.style.color = '#ff6b35';
            link.style.backgroundColor = 'rgba(255, 107, 53, 0.1)';
            link.style.padding = '2px 4px';
            link.style.borderRadius = '3px';
            link.style.cursor = 'pointer';
            link.style.fontWeight = '500';
            link.style.borderLeft = '3px solid #ff6b35';
            link.style.display = 'inline';
            link.title = `Click to open image in new tab: ${originalName} (Hover to preview)`;
            
            // Replace selected text with link
            range.deleteContents();
            range.insertNode(link);
            
            // Add space after link and position cursor
            const spaceNode = document.createTextNode(' ');
            range.setStartAfter(link);
            range.insertNode(spaceNode);
            range.setStartAfter(spaceNode);
            range.collapse(true);
            
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Setup hover listeners for the new link
            this.setupImageHoverListeners();
            
            this.handleChange();
            
        } catch (error) {
            console.error('Error creating image link:', error);
        }
    }

    // Open image in new tab instead of modal
    openImageInNewTab(imageLink) {
        const imageUrl = imageLink.getAttribute('data-image-url');
        const imageTitle = imageLink.getAttribute('data-image-title') || 'Image';
        
        if (imageUrl) {
            // Open image directly in new tab
            window.open(imageUrl, '_blank');
            console.log('Opened image in new tab:', imageTitle, imageUrl);
        }
    }

    // Show loading indicator
    showLoading(message = 'Loading...') {
        const loading = document.createElement('div');
        loading.id = 'image-upload-loading';
        loading.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1002;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        loading.innerHTML = `
            <div style="width: 20px; height: 20px; border: 2px solid #ffffff3a; border-top: 2px solid #fff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <span>${message}</span>
        `;
        
        document.body.appendChild(loading);
        return loading;
    }

    // Hide loading indicator
    hideLoading() {
        const loading = document.getElementById('image-upload-loading');
        if (loading) {
            loading.remove();
        }
    }

    // Handle paste events
    handlePaste(e) {
        e.preventDefault();
        
        // Get plain text from clipboard
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        
        // Insert as plain text to avoid formatting issues
        document.execCommand('insertText', false, text);
    }

    // Handle key events
    handleKeyDown(e) {
        // Handle Ctrl+shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    document.execCommand('bold');
                    this.updateToolbarState();
                    break;
                case 'i':
                    e.preventDefault();
                    document.execCommand('italic');
                    this.updateToolbarState();
                    break;
                case 'u':
                    e.preventDefault();
                    document.execCommand('underline');
                    this.updateToolbarState();
                    break;
            }
        }
        
        // Handle Enter key to ensure proper paragraph structure
        if (e.key === 'Enter' && !e.shiftKey) {
            // Let default behavior handle this for now
        }
    }

    // Update toolbar button states based on current selection
    updateToolbarState() {
        const buttons = this.toolbar.querySelectorAll('.toolbar-btn');
        buttons.forEach(button => {
            const command = button.dataset.command;
            if (['bold', 'italic', 'underline', 'insertUnorderedList'].includes(command)) {
                if (document.queryCommandState(command)) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
            }
        });
    }

    // Handle content changes
    handleChange() {
        this.content = this.getContent();
        if (this.changeCallback) {
            this.changeCallback(this.content);
        }
    }

    // Get current content
    getContent() {
        let content = this.editor.innerHTML;
        
        // Remove placeholder content
        if (content === `<p>${this.options.placeholder}</p>`) {
            return '';
        }
        
        return content;
    }

    // Set content
    setContent(content) {
        if (!content || content.trim() === '') {
            this.editor.innerHTML = `<p>${this.options.placeholder}</p>`;
        } else {
            this.editor.innerHTML = content;
        }
        this.content = content;
        
        // Setup hover listeners for any existing image links
        setTimeout(() => {
            this.setupImageHoverListeners();
        }, 100);
        
        // Update toolbar state
        setTimeout(() => {
            this.updateToolbarState();
        }, 100);
    }

    // Get plain text content
    getPlainText() {
        return this.editor.textContent || '';
    }

    // Set change callback
    onChange(callback) {
        this.changeCallback = callback;
    }

    // Focus the editor
    focus() {
        this.editor.focus();
    }

    // Check if editor has focus
    hasFocus() {
        return document.activeElement === this.editor;
    }

    // Destroy the editor
    destroy() {
        if (this.imagePreview && this.imagePreview.parentNode) {
            this.imagePreview.parentNode.removeChild(this.imagePreview);
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    // Get the editor element (for external integrations)
    getEditor() {
        return this.editor;
    }

    // Insert text at cursor (useful for character integration)
    insertText(text) {
        if (this.editor.textContent.trim() === this.options.placeholder) {
            this.editor.innerHTML = '<p><br></p>';
        }
        
        document.execCommand('insertText', false, text);
        this.handleChange();
    }

    // Get cursor position info (for character autocomplete)
    getCursorInfo() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return null;
        
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        return {
            range: range,
            rect: rect,
            text: this.getTextBeforeCursor()
        };
    }

    // Get text before cursor (for character autocomplete)
    getTextBeforeCursor() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return '';
        
        const range = selection.getRangeAt(0);
        const tempRange = range.cloneRange();
        tempRange.selectNodeContents(this.editor);
        tempRange.setEnd(range.startContainer, range.startOffset);
        
        return tempRange.toString();
    }
}

// Add CSS animation for loading spinner
if (!document.querySelector('#spinner-styles')) {
    const style = document.createElement('style');
    style.id = 'spinner-styles';
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// Add CSS for character link overlays
if (!document.querySelector('#character-link-overlay-styles')) {
    const style = document.createElement('style');
    style.id = 'character-link-overlay-styles';
    style.textContent = `
        .textarea-link-overlay {
            pointer-events: none;
        }
        
        .character-link-overlay {
            display: inline;
            pointer-events: auto;
            cursor: pointer;
            background-color: rgba(0, 123, 255, 0.1);
            color: #007bff;
            border-radius: 3px;
            padding: 1px 2px;
            margin: -1px -2px;
            font-weight: 500;
            transition: background-color 0.2s, transform 0.1s;
            text-decoration: none;
            border-left: 3px solid #007bff;
        }
        
        .character-link-overlay:hover {
            background-color: rgba(0, 123, 255, 0.2);
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0, 123, 255, 0.3);
        }
        
        .character-link-overlay.student {
            border-left-color: #28a745;
        }
        
        .character-link-overlay.staff {
            border-left-color: #dc3545;
        }
        
        .character-link-overlay.location {
            border-left-color: #6610f2;
        }
        
        /* Ensure overlays work well with different textarea sizes */
        .textarea-link-overlay {
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
        }
    `;
    document.head.appendChild(style);
}

// Export for use
window.RichTextEditor = RichTextEditor;