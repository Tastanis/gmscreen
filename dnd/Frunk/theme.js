(function () {
    const MIN_RAGE_INTERVAL = 15000;
    const MAX_RAGE_INTERVAL = 28000;
    let rageTimer = null;
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

    function enableRage() {
        if (active) {
            return;
        }
        active = true;
        scheduleNextRage();
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
        removeRageClass(document.querySelector('.nav-title'));
        removeRageClass(document.getElementById('theme-toggle-btn'));
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
