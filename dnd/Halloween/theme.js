(function () {
    const JUMPSCARE_INITIAL_DELAY = 60000;
    const JUMPSCARE_REPEAT_INTERVAL = 300000;
    const JUMPSCARE_DISPLAY_DURATION = 500;
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

    function scheduleNextJumpscare(delay) {
        if (scareTimer) {
            clearTimeout(scareTimer);
        }
        const body = document.body;
        if (!isHalloweenActive(body)) {
            scareTimer = null;
            return;
        }
        scareTimer = window.setTimeout(showJumpscare, delay);
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
        const scheduleRemoval = function () {
            window.setTimeout(function () {
                if (activeOverlay === overlay) {
                    clearOverlay();
                }
            }, JUMPSCARE_DISPLAY_DURATION);
        };

        image.addEventListener('load', scheduleRemoval, { once: true });
        image.addEventListener('error', scheduleRemoval, { once: true });
        overlay.appendChild(image);

        body.appendChild(overlay);
        activeOverlay = overlay;

        if (image.complete) {
            scheduleRemoval();
        }

        scheduleNextJumpscare(JUMPSCARE_REPEAT_INTERVAL);
    }

    function scheduleJumpscare(body) {
        cancelJumpscare();
        if (!isHalloweenActive(body)) {
            return;
        }

        if (!preloadedImage) {
            preloadedImage = new Image();
            preloadedImage.src = JUMPSCARE_IMAGE_SRC;
            if (typeof preloadedImage.decode === 'function') {
                preloadedImage.decode().catch(function () {
                    /* Ignore decode errors; the load event handler will handle fallback timing. */
                });
            }
        }

        scheduleNextJumpscare(JUMPSCARE_INITIAL_DELAY);
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
