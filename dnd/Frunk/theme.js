(function () {
    const MIN_RAGE_INTERVAL = 15000;
    const MAX_RAGE_INTERVAL = 28000;
    const BUNNY_INTERVAL_MIN = 170000;
    const BUNNY_INTERVAL_MAX = 190000;
    const INITIAL_BUNNY_WINDOW = 5000;
    const INITIAL_BUNNY_COUNT_MIN = 4;
    const INITIAL_BUNNY_COUNT_MAX = 5;
    const RECURRING_BUNNY_COUNT_MIN = 1;
    const RECURRING_BUNNY_COUNT_MAX = 2;
    const BUNNY_WAVE_SPREAD = 900;
    const BUNNY_BOTTOM_MIN_REM = 1.5;
    const BUNNY_BOTTOM_MAX_REM = 6.5;

    let rageTimer = null;
    const bunnyTimers = new Set();
    let active = false;

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randomBetweenFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    function managedTimeout(callback, delay) {
        const timerId = window.setTimeout(() => {
            bunnyTimers.delete(timerId);
            callback();
        }, delay);
        bunnyTimers.add(timerId);
    }

    function removeRageClass(target) {
        if (!target) {
            return;
        }
        target.classList.remove('rage-ripple');
    }

    function triggerRage() {
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
            target.classList.add('rage-ripple');
            setTimeout(() => removeRageClass(target), 650);
        });
        scheduleNextRage();
    }

    function scheduleNextRage() {
        if (!active) {
            return;
        }
        const delay = randomBetween(MIN_RAGE_INTERVAL, MAX_RAGE_INTERVAL);
        rageTimer = window.setTimeout(triggerRage, delay);
    }

    function removeBunnyElements() {
        document.querySelectorAll('.frunk-bunny').forEach(element => {
            element.remove();
        });
    }

    function scheduleBunnyWave(count) {
        for (let index = 0; index < count; index += 1) {
            const offset = Math.floor(Math.random() * Math.max(1, BUNNY_WAVE_SPREAD));
            managedTimeout(spawnBunny, offset);
        }
    }

    function spawnBunny() {
        if (!active) {
            return;
        }

        const bunny = document.createElement('div');
        bunny.className = 'frunk-bunny';
        const randomBottom = randomBetweenFloat(BUNNY_BOTTOM_MIN_REM, BUNNY_BOTTOM_MAX_REM);
        bunny.style.bottom = `${randomBottom.toFixed(2)}rem`;
        document.body.appendChild(bunny);

        const handleAnimationEnd = () => {
            bunny.removeEventListener('animationend', handleAnimationEnd);
            bunny.remove();
        };

        bunny.addEventListener('animationend', handleAnimationEnd);
    }

    function scheduleRecurringBunnies() {
        if (!active) {
            return;
        }

        const delay = randomBetween(BUNNY_INTERVAL_MIN, BUNNY_INTERVAL_MAX);
        managedTimeout(() => {
            if (!active) {
                return;
            }
            const count = randomBetween(RECURRING_BUNNY_COUNT_MIN, RECURRING_BUNNY_COUNT_MAX);
            scheduleBunnyWave(count);
            scheduleRecurringBunnies();
        }, delay);
    }

    function scheduleInitialBunnies() {
        if (!active) {
            return;
        }

        const bunnyCount = randomBetween(INITIAL_BUNNY_COUNT_MIN, INITIAL_BUNNY_COUNT_MAX);
        const baseSpacing = INITIAL_BUNNY_WINDOW / Math.max(1, bunnyCount);

        for (let index = 0; index < bunnyCount; index += 1) {
            const jitter = Math.floor(Math.random() * (baseSpacing / 2));
            const delay = Math.floor(index * baseSpacing + jitter);
            managedTimeout(spawnBunny, delay);
        }
    }

    function enableRage() {
        if (active) {
            return;
        }
        active = true;
        scheduleNextRage();
        scheduleInitialBunnies();
        scheduleRecurringBunnies();
    }

    function disableRage() {
        if (!active) {
            return;
        }
        active = false;
        if (rageTimer) {
            clearTimeout(rageTimer);
            rageTimer = null;
        }
        bunnyTimers.forEach(timerId => {
            clearTimeout(timerId);
        });
        bunnyTimers.clear();
        removeRageClass(document.querySelector('.nav-title'));
        removeRageClass(document.getElementById('theme-toggle-btn'));
        removeBunnyElements();
    }

    function handleThemeChange(themeName) {
        if (themeName === 'frunk') {
            enableRage();
        } else {
            disableRage();
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
