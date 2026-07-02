(function () {
    const EMBER_SPAWN_MIN_MS = 350;
    const EMBER_SPAWN_MAX_MS = 1400;
    const EMBER_SIZE_MIN_PX = 3;
    const EMBER_SIZE_MAX_PX = 7;
    const EMBER_DURATION_MIN_MS = 7000;
    const EMBER_DURATION_MAX_MS = 13000;
    const EMBER_MAX_COUNT = 18;

    let spawnTimer = null;
    let active = false;

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomBetweenFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    function spawnEmber() {
        if (!active) {
            return;
        }

        if (document.querySelectorAll('.diablo-ember').length < EMBER_MAX_COUNT) {
            const ember = document.createElement('div');
            ember.className = 'diablo-ember';
            ember.style.setProperty('--ember-left', `${randomBetweenFloat(2, 98).toFixed(2)}vw`);
            ember.style.setProperty('--ember-size', `${randomBetween(EMBER_SIZE_MIN_PX, EMBER_SIZE_MAX_PX)}px`);
            ember.style.setProperty('--ember-drift', `${randomBetweenFloat(-4, 4).toFixed(2)}rem`);
            ember.style.setProperty('--ember-opacity', randomBetweenFloat(0.5, 0.95).toFixed(2));
            ember.style.setProperty('--ember-duration', `${randomBetween(EMBER_DURATION_MIN_MS, EMBER_DURATION_MAX_MS)}ms`);
            document.body.appendChild(ember);

            ember.addEventListener('animationend', () => {
                ember.remove();
            });
        }

        scheduleNextEmber();
    }

    function scheduleNextEmber() {
        if (!active) {
            return;
        }
        spawnTimer = window.setTimeout(spawnEmber, randomBetween(EMBER_SPAWN_MIN_MS, EMBER_SPAWN_MAX_MS));
    }

    function removeEmberElements() {
        document.querySelectorAll('.diablo-ember').forEach(element => {
            element.remove();
        });
    }

    function enableDiabloTheme() {
        if (active) {
            return;
        }
        active = true;
        scheduleNextEmber();
    }

    function disableDiabloTheme() {
        if (!active) {
            return;
        }
        active = false;
        if (spawnTimer) {
            clearTimeout(spawnTimer);
            spawnTimer = null;
        }
        removeEmberElements();
    }

    function handleThemeChange(themeName) {
        if (themeName === 'diablo') {
            enableDiabloTheme();
        } else {
            disableDiabloTheme();
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
