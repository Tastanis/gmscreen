(function () {
    const THEME_KEY = 'dnd-dashboard-theme';
    const BUTTON_ID = 'theme-toggle-btn';

    const DEFAULT_THEME = 'default';
    const THEMES = [DEFAULT_THEME, 'halloween', 'christmas'];

    const THEME_CONFIG = {
        [DEFAULT_THEME]: {
            className: null,
            linkId: null,
            storageValue: null,
            buttonTitle: 'Enable the Halloween theme',
            ariaLabel: 'Enable the Halloween theme'
        },
        halloween: {
            className: 'halloween-theme',
            linkId: 'halloween-theme',
            storageValue: 'halloween',
            buttonTitle: 'Enable the Christmas theme',
            ariaLabel: 'Switch to the Christmas theme'
        },
        christmas: {
            className: 'christmas-theme',
            linkId: 'christmas-theme',
            storageValue: 'christmas',
            buttonTitle: 'Return to the classic theme',
            ariaLabel: 'Return to the classic theme'
        }
    };

    let activeTheme = DEFAULT_THEME;

    function getThemeFromStorage() {
        try {
            const storedValue = window.localStorage.getItem(THEME_KEY);
            const match = THEMES.find(theme => THEME_CONFIG[theme].storageValue === storedValue);
            return match || DEFAULT_THEME;
        } catch (error) {
            console.warn('Unable to read stored theme preference:', error);
            return DEFAULT_THEME;
        }
    }

    function persistTheme(theme) {
        try {
            const config = THEME_CONFIG[theme];
            if (config && config.storageValue) {
                window.localStorage.setItem(THEME_KEY, config.storageValue);
            } else {
                window.localStorage.removeItem(THEME_KEY);
            }
        } catch (error) {
            console.warn('Unable to persist theme preference:', error);
        }
    }

    function applyTheme(theme) {
        const nextTheme = THEMES.includes(theme) ? theme : DEFAULT_THEME;
        activeTheme = nextTheme;

        const body = document.body;
        THEMES.forEach(currentTheme => {
            const className = THEME_CONFIG[currentTheme].className;
            if (className) {
                body.classList.toggle(className, currentTheme === nextTheme);
            }
        });

        THEMES.forEach(currentTheme => {
            const linkId = THEME_CONFIG[currentTheme].linkId;
            if (!linkId) {
                return;
            }

            const link = document.getElementById(linkId);
            if (link) {
                link.disabled = THEME_CONFIG[nextTheme].linkId !== linkId;
            }
        });

        const button = document.getElementById(BUTTON_ID);
        if (button) {
            const config = THEME_CONFIG[nextTheme];
            const isDefault = nextTheme === DEFAULT_THEME;
            button.classList.toggle('theme-active', !isDefault);
            button.setAttribute('aria-pressed', isDefault ? 'false' : 'true');
            button.title = config.buttonTitle;
            button.setAttribute('aria-label', config.ariaLabel);
        }

        persistTheme(nextTheme);
    }

    function handleThemeToggle() {
        const currentIndex = THEMES.indexOf(activeTheme);
        const nextIndex = currentIndex === -1 ? 1 : (currentIndex + 1) % THEMES.length;
        const nextTheme = THEMES[nextIndex];
        applyTheme(nextTheme);
    }

    function initThemeToggle() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }

        applyTheme(getThemeFromStorage());
        button.addEventListener('click', handleThemeToggle);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
})();
