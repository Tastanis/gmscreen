(function () {
    const JUMPSCARE_INITIAL_DELAY = 60000;
    const JUMPSCARE_REPEAT_INTERVAL = 300000;
    const JUMPSCARE_DISPLAY_DURATION = 500;
    const BAT_INITIAL_DELAY = 3000;
    const BAT_REPEAT_INTERVAL = 180000;
    const BAT_FLIGHT_DURATION = 6000;
    const BAT_FLAP_INTERVAL = 140;
    const scriptElement = document.currentScript;
    const assetBase = scriptElement ? scriptElement.src.replace(/[^/]+$/, '') : '';
    const JUMPSCARE_IMAGE_SRC = assetBase ? `${assetBase}images/jumpscare.png` : 'images/jumpscare.png';
    const BAT_IMAGE_SOURCES = assetBase
        ? [`${assetBase}images/Flap%201.png`, `${assetBase}images/Flap%202.png`]
        : ['images/Flap%201.png', 'images/Flap%202.png'];
    let scareTimer = null;
    let preloadedImage = null;
    let activeOverlay = null;
    const batTimeouts = new Set();
    const preloadedBatFrames = [];
    let batFramesPreloaded = false;
    let activeBatElement = null;

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

    function clearBatTimeouts() {
        batTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        batTimeouts.clear();
    }

    function managedBatTimeout(callback, delay) {
        const timeoutId = window.setTimeout(() => {
            batTimeouts.delete(timeoutId);
            callback();
        }, delay);
        batTimeouts.add(timeoutId);
    }

    function preloadBatFrames() {
        if (batFramesPreloaded) {
            return;
        }
        BAT_IMAGE_SOURCES.forEach(src => {
            const image = new Image();
            image.src = src;
            preloadedBatFrames.push(image);
        });
        batFramesPreloaded = true;
    }

    function cleanupBatElement(element) {
        if (!element) {
            return;
        }
        if (element.__flapIntervalId) {
            clearInterval(element.__flapIntervalId);
            element.__flapIntervalId = null;
        }
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }

    function removeActiveBat() {
        if (activeBatElement) {
            cleanupBatElement(activeBatElement);
            activeBatElement = null;
        }
    }

    function launchBat() {
        const body = document.body;
        if (!isHalloweenActive(body)) {
            return;
        }

        removeActiveBat();

        const bat = document.createElement('div');
        bat.className = 'halloween-bat';
        bat.style.setProperty('--bat-flight-duration', `${BAT_FLIGHT_DURATION}ms`);
        const fromLeft = Math.random() < 0.5;
        bat.classList.add(fromLeft ? 'from-left' : 'from-right');

        const batImage = document.createElement('img');
        const initialSource = preloadedBatFrames[0] ? preloadedBatFrames[0].src : BAT_IMAGE_SOURCES[0];
        batImage.src = initialSource;
        batImage.alt = 'Flying bat';
        batImage.decoding = 'async';
        bat.appendChild(batImage);

        let frameIndex = 0;
        const flapIntervalId = window.setInterval(() => {
            frameIndex = (frameIndex + 1) % BAT_IMAGE_SOURCES.length;
            const nextFrame = preloadedBatFrames[frameIndex]
                ? preloadedBatFrames[frameIndex].src
                : BAT_IMAGE_SOURCES[frameIndex];
            batImage.src = nextFrame;
        }, BAT_FLAP_INTERVAL);
        bat.__flapIntervalId = flapIntervalId;

        bat.addEventListener('animationend', () => {
            if (bat === activeBatElement) {
                activeBatElement = null;
            }
            cleanupBatElement(bat);
        }, { once: true });

        body.appendChild(bat);
        activeBatElement = bat;
    }

    function scheduleBatFlight(delay) {
        if (!isHalloweenActive(document.body)) {
            return;
        }
        managedBatTimeout(() => {
            if (!isHalloweenActive(document.body)) {
                return;
            }
            launchBat();
            scheduleBatFlight(BAT_REPEAT_INTERVAL);
        }, delay);
    }

    function cancelBatFlight() {
        clearBatTimeouts();
        removeActiveBat();
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
            cancelBatFlight();
            preloadBatFrames();
            scheduleBatFlight(BAT_INITIAL_DELAY);
        } else {
            body.classList.remove('halloween-theme-active');
            cancelJumpscare();
            cancelBatFlight();
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
