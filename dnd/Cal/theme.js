(function () {
    const MIN_SPORE_INTERVAL = 12000;
    const MAX_SPORE_INTERVAL = 24000;
    const MUSHROOM_INTERVAL_MIN = 125000;
    const MUSHROOM_INTERVAL_MAX = 155000;
    const INITIAL_MUSHROOM_WINDOW = 5200;
    const INITIAL_MUSHROOM_COUNT_MIN = 4;
    const INITIAL_MUSHROOM_COUNT_MAX = 6;
    const RECURRING_MUSHROOM_COUNT_MIN = 1;
    const RECURRING_MUSHROOM_COUNT_MAX = 3;
    const MUSHROOM_WAVE_SPREAD = 1500;
    const MUSHROOM_BOTTOM_MIN_REM = -1.2;
    const MUSHROOM_BOTTOM_MAX_REM = 1.2;
    const MUSHROOM_SIZE_MIN_REM = 5.5;
    const MUSHROOM_SIZE_MAX_REM = 12.5;
    const MUSHROOM_DURATION_MIN_MS = 6200;
    const MUSHROOM_DURATION_MAX_MS = 9200;

    let sporeTimer = null;
    const mushroomTimers = new Set();
    let active = false;

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomBetweenFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    function managedTimeout(callback, delay) {
        const timerId = window.setTimeout(() => {
            mushroomTimers.delete(timerId);
            callback();
        }, delay);
        mushroomTimers.add(timerId);
    }

    function removeSporeClass(target) {
        if (!target) {
            return;
        }
        target.classList.remove('spore-ripple');
    }

    function triggerSporePulse() {
        if (!active) {
            return;
        }

        const targets = [
            document.querySelector('.nav-title'),
            document.getElementById('theme-toggle-btn')
        ];

        targets.forEach(target => {
            if (!target) {
                return;
            }
            target.classList.add('spore-ripple');
            window.setTimeout(() => removeSporeClass(target), 750);
        });

        scheduleNextSporePulse();
    }

    function scheduleNextSporePulse() {
        if (!active) {
            return;
        }
        const delay = randomBetween(MIN_SPORE_INTERVAL, MAX_SPORE_INTERVAL);
        sporeTimer = window.setTimeout(triggerSporePulse, delay);
    }

    function removeMushroomElements() {
        document.querySelectorAll('.cal-mushroom-growth').forEach(element => {
            element.remove();
        });
    }

    function scheduleMushroomWave(count) {
        for (let index = 0; index < count; index += 1) {
            const offset = Math.floor(Math.random() * Math.max(1, MUSHROOM_WAVE_SPREAD));
            managedTimeout(spawnMushroom, offset);
        }
    }

    function spawnMushroom() {
        if (!active) {
            return;
        }

        const mushroom = document.createElement('div');
        mushroom.className = 'cal-mushroom-growth';
        mushroom.style.setProperty('--mushroom-left', `${randomBetweenFloat(6, 94).toFixed(2)}vw`);
        mushroom.style.setProperty('--mushroom-bottom', `${randomBetweenFloat(MUSHROOM_BOTTOM_MIN_REM, MUSHROOM_BOTTOM_MAX_REM).toFixed(2)}rem`);
        mushroom.style.setProperty('--mushroom-size', `${randomBetweenFloat(MUSHROOM_SIZE_MIN_REM, MUSHROOM_SIZE_MAX_REM).toFixed(2)}rem`);
        mushroom.style.setProperty('--mushroom-drift', `${randomBetweenFloat(-1.2, 1.2).toFixed(2)}rem`);
        mushroom.style.setProperty('--mushroom-duration', `${randomBetween(MUSHROOM_DURATION_MIN_MS, MUSHROOM_DURATION_MAX_MS)}ms`);
        document.body.appendChild(mushroom);

        const handleAnimationEnd = event => {
            if (event.animationName !== 'cal-mushroom-grow') {
                return;
            }
            mushroom.removeEventListener('animationend', handleAnimationEnd);
            mushroom.remove();
        };

        mushroom.addEventListener('animationend', handleAnimationEnd);
    }

    function scheduleRecurringMushrooms() {
        if (!active) {
            return;
        }

        const delay = randomBetween(MUSHROOM_INTERVAL_MIN, MUSHROOM_INTERVAL_MAX);
        managedTimeout(() => {
            if (!active) {
                return;
            }
            const count = randomBetween(RECURRING_MUSHROOM_COUNT_MIN, RECURRING_MUSHROOM_COUNT_MAX);
            scheduleMushroomWave(count);
            scheduleRecurringMushrooms();
        }, delay);
    }

    function scheduleInitialMushrooms() {
        if (!active) {
            return;
        }

        const mushroomCount = randomBetween(INITIAL_MUSHROOM_COUNT_MIN, INITIAL_MUSHROOM_COUNT_MAX);
        const baseSpacing = INITIAL_MUSHROOM_WINDOW / Math.max(1, mushroomCount);

        for (let index = 0; index < mushroomCount; index += 1) {
            const jitter = Math.floor(Math.random() * (baseSpacing / 2));
            const delay = Math.floor(index * baseSpacing + jitter);
            managedTimeout(spawnMushroom, delay);
        }
    }

    function enableMushroomTheme() {
        if (active) {
            return;
        }
        active = true;
        scheduleNextSporePulse();
        scheduleInitialMushrooms();
        scheduleRecurringMushrooms();
    }

    function disableMushroomTheme() {
        if (!active) {
            return;
        }
        active = false;
        if (sporeTimer) {
            clearTimeout(sporeTimer);
            sporeTimer = null;
        }
        mushroomTimers.forEach(timerId => {
            clearTimeout(timerId);
        });
        mushroomTimers.clear();
        removeSporeClass(document.querySelector('.nav-title'));
        removeSporeClass(document.getElementById('theme-toggle-btn'));
        removeMushroomElements();
    }

    function handleThemeChange(themeName) {
        if (themeName === 'cal') {
            enableMushroomTheme();
        } else {
            disableMushroomTheme();
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
