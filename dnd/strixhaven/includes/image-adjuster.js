/**
 * Image Adjuster - Pan & Zoom tool for adjusting image crop position
 * Used in both Students and Staff sections
 */

const ImageAdjuster = (function() {
    let overlay = null;
    let currentImagePath = '';
    let currentItemId = '';
    let currentItemType = '';
    let currentSaveEndpoint = '';
    let onSaveCallback = null;

    // Drag state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;
    let scale = 1;
    let imgNaturalWidth = 0;
    let imgNaturalHeight = 0;

    function open(imagePath, itemId, itemType, saveEndpoint, existingAdjustment, saveCallback) {
        currentImagePath = imagePath;
        currentItemId = itemId;
        currentItemType = itemType;
        currentSaveEndpoint = saveEndpoint;
        onSaveCallback = saveCallback;

        // Load existing adjustment
        if (existingAdjustment) {
            offsetX = existingAdjustment.offsetX || 0;
            offsetY = existingAdjustment.offsetY || 0;
            scale = existingAdjustment.scale || 1;
        } else {
            offsetX = 0;
            offsetY = 0;
            scale = 1;
        }

        createModal();
        loadImage();
    }

    function createModal() {
        // Remove existing
        close();

        overlay = document.createElement('div');
        overlay.className = 'image-adjuster-overlay';
        overlay.innerHTML = `
            <div class="image-adjuster-modal">
                <div class="image-adjuster-header">
                    <h3>Adjust Image Position</h3>
                    <button class="image-adjuster-close" onclick="ImageAdjuster.close()">&times;</button>
                </div>
                <div class="image-adjuster-body">
                    <div class="image-adjuster-viewport" id="ia-viewport">
                        <img id="ia-image" src="" alt="Adjust image" draggable="false">
                    </div>
                    <div class="image-adjuster-controls">
                        <div class="image-adjuster-zoom-row">
                            <label>Zoom:</label>
                            <button class="image-adjuster-zoom-btn" onclick="ImageAdjuster.zoomOut()">-</button>
                            <input type="range" class="image-adjuster-zoom-slider" id="ia-zoom-slider"
                                   min="50" max="300" value="100" step="5">
                            <button class="image-adjuster-zoom-btn" onclick="ImageAdjuster.zoomIn()">+</button>
                            <span class="image-adjuster-zoom-value" id="ia-zoom-value">100%</span>
                        </div>
                        <div class="image-adjuster-hint">Drag the image to reposition. Use zoom to scale.</div>
                    </div>
                    <div class="image-adjuster-actions">
                        <button class="image-adjuster-btn image-adjuster-btn-reset" onclick="ImageAdjuster.reset()">Reset</button>
                        <button class="image-adjuster-btn image-adjuster-btn-cancel" onclick="ImageAdjuster.close()">Cancel</button>
                        <button class="image-adjuster-btn image-adjuster-btn-save" onclick="ImageAdjuster.save()">Save</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Prevent closing when clicking the modal itself
        overlay.addEventListener('mousedown', function(e) {
            if (e.target === overlay) {
                close();
            }
        });

        // Setup zoom slider
        const slider = document.getElementById('ia-zoom-slider');
        slider.value = Math.round(scale * 100);
        slider.addEventListener('input', function() {
            scale = parseInt(this.value) / 100;
            updateImagePosition();
            updateZoomDisplay();
        });

        // Setup viewport drag
        const viewport = document.getElementById('ia-viewport');
        viewport.addEventListener('mousedown', onDragStart);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);

        // Touch support
        viewport.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);

        // Mouse wheel zoom
        viewport.addEventListener('wheel', onWheel, { passive: false });

        updateZoomDisplay();
    }

    function loadImage() {
        const img = document.getElementById('ia-image');
        img.onload = function() {
            imgNaturalWidth = img.naturalWidth;
            imgNaturalHeight = img.naturalHeight;
            updateImagePosition();
        };
        img.src = currentImagePath + '?t=' + Date.now();
    }

    function updateImagePosition() {
        const img = document.getElementById('ia-image');
        if (!img || !imgNaturalWidth) return;

        const viewportSize = 300;

        // Calculate the image dimensions to fit properly
        // "cover" behavior: scale image so it fills the viewport at scale=1
        let fitScale;
        const aspectRatio = imgNaturalWidth / imgNaturalHeight;
        if (aspectRatio > 1) {
            // Landscape: fit by height
            fitScale = viewportSize / imgNaturalHeight;
        } else {
            // Portrait or square: fit by width
            fitScale = viewportSize / imgNaturalWidth;
        }

        const displayWidth = imgNaturalWidth * fitScale * scale;
        const displayHeight = imgNaturalHeight * fitScale * scale;

        img.style.width = displayWidth + 'px';
        img.style.height = displayHeight + 'px';
        img.style.transform = 'translate(' + (-(displayWidth / 2) + offsetX) + 'px, ' + (-(displayHeight / 2) + offsetY) + 'px)';
    }

    function onDragStart(e) {
        if (e.target.closest('.image-adjuster-zoom-btn') || e.target.closest('.image-adjuster-zoom-slider')) return;
        e.preventDefault();
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startOffsetX = offsetX;
        startOffsetY = offsetY;
        const viewport = document.getElementById('ia-viewport');
        if (viewport) viewport.style.cursor = 'grabbing';
    }

    function onDragMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        offsetX = startOffsetX + dx;
        offsetY = startOffsetY + dy;
        updateImagePosition();
    }

    function onDragEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        const viewport = document.getElementById('ia-viewport');
        if (viewport) viewport.style.cursor = 'grab';
    }

    function onTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            startOffsetX = offsetX;
            startOffsetY = offsetY;
        }
    }

    function onTouchMove(e) {
        if (!isDragging || e.touches.length !== 1) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - dragStartX;
        const dy = e.touches[0].clientY - dragStartY;
        offsetX = startOffsetX + dx;
        offsetY = startOffsetY + dy;
        updateImagePosition();
    }

    function onTouchEnd(e) {
        isDragging = false;
    }

    function onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5;
        const newScale = Math.max(50, Math.min(300, Math.round(scale * 100) + delta));
        scale = newScale / 100;
        const slider = document.getElementById('ia-zoom-slider');
        if (slider) slider.value = newScale;
        updateImagePosition();
        updateZoomDisplay();
    }

    function updateZoomDisplay() {
        const display = document.getElementById('ia-zoom-value');
        if (display) display.textContent = Math.round(scale * 100) + '%';
    }

    function zoomIn() {
        const newScale = Math.min(300, Math.round(scale * 100) + 10);
        scale = newScale / 100;
        const slider = document.getElementById('ia-zoom-slider');
        if (slider) slider.value = newScale;
        updateImagePosition();
        updateZoomDisplay();
    }

    function zoomOut() {
        const newScale = Math.max(50, Math.round(scale * 100) - 10);
        scale = newScale / 100;
        const slider = document.getElementById('ia-zoom-slider');
        if (slider) slider.value = newScale;
        updateImagePosition();
        updateZoomDisplay();
    }

    function reset() {
        offsetX = 0;
        offsetY = 0;
        scale = 1;
        const slider = document.getElementById('ia-zoom-slider');
        if (slider) slider.value = 100;
        updateImagePosition();
        updateZoomDisplay();
    }

    function save() {
        const adjustment = {
            offsetX: offsetX,
            offsetY: offsetY,
            scale: scale
        };

        const formData = new FormData();
        formData.append('action', 'save_image_adjust');
        formData.append(currentItemType === 'student' ? 'student_id' : 'staff_id', currentItemId);
        formData.append('image_path', currentImagePath);
        formData.append('adjustment', JSON.stringify(adjustment));

        const saveBtn = overlay.querySelector('.image-adjuster-btn-save');
        if (saveBtn) {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
        }

        fetch(currentSaveEndpoint, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (onSaveCallback) {
                    onSaveCallback(currentImagePath, adjustment);
                }
                close();
            } else {
                alert('Failed to save adjustment: ' + (data.error || 'Unknown error'));
                if (saveBtn) {
                    saveBtn.textContent = 'Save';
                    saveBtn.disabled = false;
                }
            }
        })
        .catch(error => {
            console.error('Error saving image adjustment:', error);
            alert('Error saving image adjustment');
            if (saveBtn) {
                saveBtn.textContent = 'Save';
                saveBtn.disabled = false;
            }
        });
    }

    function close() {
        if (overlay) {
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
            overlay.remove();
            overlay = null;
        }
        isDragging = false;
    }

    /**
     * Apply saved image adjustment to a thumbnail element.
     * Call this to create a positioned image inside a wrapper.
     *
     * @param {string} imageSrc - Image path
     * @param {object} adjustment - {offsetX, offsetY, scale}
     * @param {number} containerSize - The square container size in px
     * @param {number} naturalWidth - Image natural width
     * @param {number} naturalHeight - Image natural height
     * @returns {object} CSS styles {width, height, transform}
     */
    function calcImageStyles(naturalWidth, naturalHeight, adjustment, containerSize) {
        const adj = adjustment || { offsetX: 0, offsetY: 0, scale: 1 };
        const scl = adj.scale || 1;
        const oX = adj.offsetX || 0;
        const oY = adj.offsetY || 0;

        // Same logic as the adjuster modal: fit to cover at scale=1
        let fitScale;
        const aspectRatio = naturalWidth / naturalHeight;
        if (aspectRatio > 1) {
            fitScale = containerSize / naturalHeight;
        } else {
            fitScale = containerSize / naturalWidth;
        }

        // Scale relative to the adjuster viewport (300px), then adapt to the actual container
        const ratio = containerSize / 300;
        const displayWidth = naturalWidth * fitScale * scl;
        const displayHeight = naturalHeight * fitScale * scl;

        return {
            width: displayWidth + 'px',
            height: displayHeight + 'px',
            transform: 'translate(' + (-(displayWidth / 2) + (oX * ratio)) + 'px, ' + (-(displayHeight / 2) + (oY * ratio)) + 'px)',
            top: '50%',
            left: '50%',
            position: 'absolute'
        };
    }

    /**
     * Create an adjusted image HTML string for use in thumbnails.
     *
     * @param {string} src - Image source path
     * @param {string} alt - Alt text
     * @param {object|null} adjustment - Saved adjustment or null
     * @param {string} extraClasses - Additional CSS classes for the wrapper
     * @param {string} onclickAttr - onclick attribute string
     * @returns {string} HTML string
     */
    function createAdjustedImageHtml(src, alt, adjustment, extraClasses, onclickAttr, extraAttrs) {
        if (!adjustment || (adjustment.offsetX === 0 && adjustment.offsetY === 0 && (adjustment.scale === 1 || !adjustment.scale))) {
            // No adjustment - return standard img
            return null;
        }

        const clickAttr = onclickAttr ? ' onclick="' + onclickAttr + '"' : '';
        // We use a data attribute to apply the adjustment after the image loads
        const adjData = encodeURIComponent(JSON.stringify(adjustment));
        return `<div class="adjusted-image-wrapper ${extraClasses || ''}"${clickAttr}>
            <img src="${src}" alt="${alt}" draggable="false"
                 ${extraAttrs || ''}
                 data-adjustment="${adjData}"
                 onload="ImageAdjuster.applyAdjustmentToImg(this)">
        </div>`;
    }

    /**
     * Called by onload on adjusted images to apply the transform
     */
    function applyAdjustmentToImg(img) {
        const adjStr = img.getAttribute('data-adjustment');
        if (!adjStr) return;

        try {
            const adjustment = JSON.parse(decodeURIComponent(adjStr));
            const wrapper = img.parentElement;
            const containerSize = wrapper.offsetWidth || wrapper.clientWidth || 80;

            const styles = calcImageStyles(img.naturalWidth, img.naturalHeight, adjustment, containerSize);
            img.style.width = styles.width;
            img.style.height = styles.height;
            img.style.transform = styles.transform;
            img.style.top = styles.top;
            img.style.left = styles.left;
            img.style.position = styles.position;
        } catch (e) {
            console.warn('Failed to apply image adjustment:', e);
        }
    }

    return {
        open: open,
        close: close,
        zoomIn: zoomIn,
        zoomOut: zoomOut,
        reset: reset,
        save: save,
        calcImageStyles: calcImageStyles,
        createAdjustedImageHtml: createAdjustedImageHtml,
        applyAdjustmentToImg: applyAdjustmentToImg
    };
})();
