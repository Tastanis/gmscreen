(function () {
    const JUMPSCARE_DELAY = 60000;
    const scriptElement = document.currentScript;
    const assetBase = scriptElement ? scriptElement.src.replace(/[^/]+$/, '') : '';
    const JUMPSCARE_IMAGE_SRC = assetBase ? `${assetBase}images/jumpscare.png` : 'images/jumpscare.png';
    let scareTimer = null;
    let preloadedImage = null;
    let activeOverlay = null;

    function isHalloweenActive(body) {
        return !!body && body.classList.contains('halloween-theme-active');
    }

    function clearOverlay() {
        if (activeOverlay && activeOverlay.parentNode) {
            activeOverlay.parentNode.removeChild(activeOverlay);
        }
        activeOverlay = null;
    }

    function cancelJumpscare() {
        if (scareTimer) {
            clearTimeout(scareTimer);
            scareTimer = null;
        }
        clearOverlay();
    }

    function showJumpscare() {
        const body = document.body;
        if (!isHalloweenActive(body)) {
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'halloween-jumpscare-overlay';

        const image = document.createElement('img');
        image.src = JUMPSCARE_IMAGE_SRC;
        image.alt = 'Halloween jumpscare';
        overlay.appendChild(image);

        body.appendChild(overlay);
        activeOverlay = overlay;

        let frames = 0;
        function removeOnNextFrame() {
            frames += 1;
            if (frames >= 2) {
                clearOverlay();
                return;
            }
            requestAnimationFrame(removeOnNextFrame);
        }

        requestAnimationFrame(removeOnNextFrame);
    }

    function scheduleJumpscare(body) {
        cancelJumpscare();
        if (!isHalloweenActive(body)) {
            return;
        }

        if (!preloadedImage) {
            preloadedImage = new Image();
            preloadedImage.src = JUMPSCARE_IMAGE_SRC;
        }

        scareTimer = window.setTimeout(showJumpscare, JUMPSCARE_DELAY);
    }

    function applyActiveState(themeName) {
        const body = document.body;
        if (!body) {
            return;
        }
        if (themeName === 'halloween') {
            body.classList.add('halloween-theme-active');
            scheduleJumpscare(body);
        } else {
            body.classList.remove('halloween-theme-active');
            cancelJumpscare();
        }
    }

    document.addEventListener('themechange', function (event) {
        if (!event || !event.detail) {
            return;
        }
        applyActiveState(event.detail.themeName);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            applyActiveState(document.body.dataset.activeTheme);
        });
    } else {
        applyActiveState(document.body.dataset.activeTheme);
    }
})();
