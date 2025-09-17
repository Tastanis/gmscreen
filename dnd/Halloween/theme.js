(function () {
    const THEME_KEY = 'dnd-dashboard-theme';
    const HALLOWEEN_VALUE = 'halloween';
    const THEME_LINK_ID = 'halloween-theme';
    const BUTTON_ID = 'theme-toggle-btn';

    function applyTheme(isActive) {
        const link = document.getElementById(THEME_LINK_ID);
        const button = document.getElementById(BUTTON_ID);
        document.body.classList.toggle('halloween-theme', isActive);

        if (link) {
            link.disabled = !isActive;
        }

        if (button) {
            button.classList.toggle('theme-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            button.title = isActive ? 'Disable the Halloween theme' : 'Enable the Halloween theme';
        }
    }

    function initThemeToggle() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }

        const storedValue = window.localStorage.getItem(THEME_KEY);
        const shouldEnable = storedValue === HALLOWEEN_VALUE;
        applyTheme(shouldEnable);

        button.addEventListener('click', function () {
            const nextState = !document.body.classList.contains('halloween-theme');
            applyTheme(nextState);
            try {
                if (nextState) {
                    window.localStorage.setItem(THEME_KEY, HALLOWEEN_VALUE);
                } else {
                    window.localStorage.removeItem(THEME_KEY);
                }
            } catch (error) {
                console.warn('Unable to persist theme preference:', error);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
})();
