(function () {
    const MIN_RAGE_INTERVAL = 15000;
    const MAX_RAGE_INTERVAL = 28000;
    const BUNNY_INTERVAL = 30000;
    const INITIAL_BUNNY_MIN_DELAY = 1500;
    const INITIAL_BUNNY_MAX_DELAY = 5000;

    let rageTimer = null;
    let bunnyTimer = null;
    let active = false;

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
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

    function spawnBunny() {
        if (!active) {
            return;
        }

        const bunny = document.createElement('div');
        bunny.className = 'frunk-bunny';
        document.body.appendChild(bunny);

        const handleAnimationEnd = () => {
            bunny.removeEventListener('animationend', handleAnimationEnd);
            bunny.remove();
        };

        bunny.addEventListener('animationend', handleAnimationEnd);

        scheduleNextBunny();
    }

    function scheduleNextBunny(initial = false) {
        if (!active) {
            return;
        }

        const delay = initial
            ? randomBetween(INITIAL_BUNNY_MIN_DELAY, INITIAL_BUNNY_MAX_DELAY)
            : BUNNY_INTERVAL;

        bunnyTimer = window.setTimeout(spawnBunny, delay);
    }

    function enableRage() {
        if (active) {
            return;
        }
        active = true;
        scheduleNextRage();
        scheduleNextBunny(true);
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
        if (bunnyTimer) {
            clearTimeout(bunnyTimer);
            bunnyTimer = null;
        }
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
