(function () {
    const MIN_INTERVAL = 30000;
    const MAX_INTERVAL = 45000;
    const MAX_FLAKES = 3;
    const FIRST_SPAWN_DELAY = 2000;
    const FIRST_MIN_FLAKES = 4;
    const FIRST_MAX_FLAKES = 7;
    let spawnTimer = null;
    let active = false;
    let lastSpawnTime = 0;
    let firstBurstPending = false;

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

    function spawnSnowfall() {
        if (!active) {
            return;
        }
        const now = Date.now();
        if (!firstBurstPending && now - lastSpawnTime < MIN_INTERVAL) {
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
            setTimeout(createSnowflake, i * 250);
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
    }

    function scheduleNext(delayOverride) {
        if (!active) {
            return;
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
        scheduleNext(FIRST_SPAWN_DELAY);
    }

    function disableSnowfall() {
        if (!active) {
            return;
        }
        active = false;
        firstBurstPending = false;
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
