(function () {
    const MIN_INTERVAL = 30000;
    const MAX_INTERVAL = 45000;
    const MAX_FLAKES = 4;
    const FIRST_SPAWN_DELAY = 1500;
    const FIRST_MIN_FLAKES = 5;
    const FIRST_MAX_FLAKES = 8;
    const MOUSE_TRAIL_SPEED_THRESHOLD = 900;
    const MOUSE_TRAIL_THROTTLE = 80;
    const MAX_MOUSE_FLAKES = 24;
    let spawnTimer = null;
    let active = false;
    let lastSpawnTime = 0;
    let firstBurstPending = false;
    let lastMouseTrailTime = 0;
    let lastMousePosition = null;
    let mouseMoveListener = null;

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function createSnowflake() {
        if (!active) {
            return;
        }
        const snowflake = document.createElement('div');
        snowflake.className = 'christmas-snowflake';
        snowflake.style.left = `${randomBetween(0, 100)}vw`;
        snowflake.style.animationDelay = `${randomBetween(0, 2000) / 1000}s`;
        snowflake.style.transform = `scale(${randomBetween(75, 110) / 100})`;
        document.body.appendChild(snowflake);
        snowflake.addEventListener('animationend', function () {
            if (snowflake.parentNode) {
                snowflake.parentNode.removeChild(snowflake);
            }
        });
    }

    function createMouseFlake(x, y) {
        if (!active) {
            return;
        }

        const flake = document.createElement('div');
        flake.className = 'christmas-mouseflake';
        flake.style.left = `${Math.round(x)}px`;
        flake.style.top = `${Math.round(y)}px`;
        flake.style.setProperty('--drift-x', `${randomBetween(-30, 30)}px`);
        flake.style.setProperty('--drift-y', `${randomBetween(-80, -45)}px`);
        document.body.appendChild(flake);

        const handleAnimationEnd = function () {
            flake.removeEventListener('animationend', handleAnimationEnd);
            if (flake.parentNode) {
                flake.parentNode.removeChild(flake);
            }
        };

        flake.addEventListener('animationend', handleAnimationEnd);

        const mouseFlakes = document.querySelectorAll('.christmas-mouseflake');
        if (mouseFlakes.length > MAX_MOUSE_FLAKES) {
            const overflow = mouseFlakes.length - MAX_MOUSE_FLAKES;
            for (let index = 0; index < overflow; index += 1) {
                const node = mouseFlakes[index];
                if (node && node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            }
        }
    }

    function handleMouseMove(event) {
        if (!active) {
            return;
        }

        const now = performance.now();
        if (lastMousePosition) {
            const deltaX = event.clientX - lastMousePosition.x;
            const deltaY = event.clientY - lastMousePosition.y;
            const deltaTime = now - lastMousePosition.time;
            if (deltaTime > 0) {
                const distance = Math.hypot(deltaX, deltaY);
                const speed = (distance / deltaTime) * 1000;
                if (speed >= MOUSE_TRAIL_SPEED_THRESHOLD && now - lastMouseTrailTime >= MOUSE_TRAIL_THROTTLE) {
                    lastMouseTrailTime = now;
                    createMouseFlake(event.clientX, event.clientY);
                }
            }
        }
        lastMousePosition = {
            x: event.clientX,
            y: event.clientY,
            time: now
        };
    }

    function enableMouseTrail() {
        if (mouseMoveListener) {
            return;
        }
        lastMousePosition = null;
        lastMouseTrailTime = 0;
        mouseMoveListener = handleMouseMove;
        document.addEventListener('mousemove', mouseMoveListener, { passive: true });
    }

    function disableMouseTrail() {
        if (!mouseMoveListener) {
            return;
        }
        document.removeEventListener('mousemove', mouseMoveListener);
        mouseMoveListener = null;
        lastMousePosition = null;
        lastMouseTrailTime = 0;
    }

    function clearMouseTrail() {
        const trailFlakes = document.querySelectorAll('.christmas-mouseflake');
        trailFlakes.forEach(flake => {
            if (flake && flake.parentNode) {
                flake.parentNode.removeChild(flake);
            }
        });
    }

    function spawnSnowfall(force = false) {
        if (!active) {
            return;
        }
        const now = Date.now();
        if (!force && !firstBurstPending && now - lastSpawnTime < MIN_INTERVAL) {
            scheduleNext();
            return;
        }
        lastSpawnTime = now;
        let flakeCount;
        if (firstBurstPending) {
            flakeCount = randomBetween(FIRST_MIN_FLAKES, FIRST_MAX_FLAKES);
            firstBurstPending = false;
        } else {
            flakeCount = randomBetween(1, MAX_FLAKES);
        }
        for (let i = 0; i < flakeCount; i += 1) {
            setTimeout(createSnowflake, i * 200);
        }
        scheduleNext();
    }

    function clearSnowfall() {
        if (spawnTimer) {
            clearTimeout(spawnTimer);
            spawnTimer = null;
        }
        const flakes = document.querySelectorAll('.christmas-snowflake');
        flakes.forEach(flake => {
            if (flake && flake.parentNode) {
                flake.parentNode.removeChild(flake);
            }
        });
        clearMouseTrail();
    }

    function scheduleNext(delayOverride) {
        if (!active) {
            return;
        }
        if (spawnTimer) {
            clearTimeout(spawnTimer);
            spawnTimer = null;
        }
        const delay = typeof delayOverride === 'number'
            ? delayOverride
            : randomBetween(MIN_INTERVAL, MAX_INTERVAL);
        spawnTimer = window.setTimeout(spawnSnowfall, delay);
    }

    function enableSnowfall() {
        if (active) {
            return;
        }
        active = true;
        lastSpawnTime = Date.now() - MIN_INTERVAL;
        firstBurstPending = true;
        enableMouseTrail();
        spawnSnowfall(true);
        scheduleNext(randomBetween(FIRST_SPAWN_DELAY, FIRST_SPAWN_DELAY + 1200));
    }

    function disableSnowfall() {
        if (!active) {
            return;
        }
        active = false;
        firstBurstPending = false;
        disableMouseTrail();
        clearSnowfall();
    }

    function handleThemeChange(themeName) {
        if (themeName === 'christmas') {
            enableSnowfall();
        } else {
            disableSnowfall();
        }
    }

    document.addEventListener('themechange', function (event) {
        if (!event || !event.detail) {
            return;
        }
        handleThemeChange(event.detail.themeName);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            handleThemeChange(document.body.dataset.activeTheme);
        });
    } else {
        handleThemeChange(document.body.dataset.activeTheme);
    }
})();
