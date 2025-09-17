(function () {
    const THEME_KEY = 'dnd-dashboard-theme';
    const BUTTON_ID = 'theme-toggle-btn';

    const DEFAULT_THEME = Object.freeze({
        key: 'default',
        displayName: 'classic',
        className: null,
        linkId: null,
        storageValue: null
    });

    const CANDIDATE_THEMES = [
        Object.freeze({
            key: 'halloween',
            displayName: 'Halloween',
            className: 'halloween-theme',
            linkId: 'halloween-theme',
            storageValue: 'halloween'
        }),
        Object.freeze({
            key: 'christmas',
            displayName: 'Christmas',
            className: 'christmas-theme',
            linkId: 'christmas-theme',
            storageValue: 'christmas'
        })
    ];

    let themeCycle = [DEFAULT_THEME];
    let activeThemeKey = DEFAULT_THEME.key;

    function getThemeConfig(themeKey) {
        return themeCycle.find(theme => theme.key === themeKey) || DEFAULT_THEME;
    }

    function getNextTheme(theme) {
        const index = themeCycle.findIndex(item => item.key === theme.key);
        if (index === -1) {
            return DEFAULT_THEME;
        }
        return themeCycle[(index + 1) % themeCycle.length];
    }

    function persistTheme(theme) {
        try {
            if (theme.storageValue) {
                window.localStorage.setItem(THEME_KEY, theme.storageValue);
            } else {
                window.localStorage.removeItem(THEME_KEY);
            }
        } catch (error) {
            console.warn('Unable to persist theme preference:', error);
        }
    }

    function updateButtonState(theme) {
        const button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }

        if (themeCycle.length <= 1) {
            button.disabled = true;
            button.classList.remove('theme-active');
            button.setAttribute('aria-pressed', 'false');
            button.title = 'Seasonal theme unavailable';
            button.setAttribute('aria-label', 'Seasonal theme unavailable');
            return;
        }

        const nextTheme = getNextTheme(theme);
        const isDefault = theme.key === DEFAULT_THEME.key;
        button.disabled = false;
        button.classList.toggle('theme-active', !isDefault);
        button.setAttribute('aria-pressed', isDefault ? 'false' : 'true');

        if (nextTheme.key === DEFAULT_THEME.key) {
            button.title = 'Return to the classic theme';
            button.setAttribute('aria-label', 'Return to the classic theme');
        } else {
            button.title = `Enable the ${nextTheme.displayName} theme`;
            button.setAttribute('aria-label', `Switch to the ${nextTheme.displayName} theme`);
        }
    }

    function applyTheme(themeKey) {
        const theme = getThemeConfig(themeKey);
        activeThemeKey = theme.key;

        const body = document.body;
        themeCycle.forEach(config => {
            if (config.className) {
                body.classList.toggle(config.className, config.key === theme.key);
            }
        });

        themeCycle.forEach(config => {
            if (!config.linkId) {
                return;
            }

            const link = document.getElementById(config.linkId);
            if (link) {
                link.disabled = config.key !== theme.key;
            }
        });

        updateButtonState(theme);
        persistTheme(theme);
    }

    function getThemeFromStorage() {
        try {
            const storedValue = window.localStorage.getItem(THEME_KEY);
            const match = themeCycle.find(theme => theme.storageValue === storedValue);
            return (match || DEFAULT_THEME).key;
        } catch (error) {
            console.warn('Unable to read stored theme preference:', error);
            return DEFAULT_THEME.key;
        }
    }

    function handleThemeToggle() {
        if (themeCycle.length <= 1) {
            return;
        }

        const currentIndex = themeCycle.findIndex(theme => theme.key === activeThemeKey);
        const nextIndex = currentIndex === -1 ? 1 : (currentIndex + 1) % themeCycle.length;
        const nextTheme = themeCycle[nextIndex] || DEFAULT_THEME;
        applyTheme(nextTheme.key);
    }

    function initThemeToggle() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }

        const detectedThemes = CANDIDATE_THEMES.filter(theme => {
            return !!document.getElementById(theme.linkId);
        });

        themeCycle = [DEFAULT_THEME, ...detectedThemes];

        applyTheme(getThemeFromStorage());

        if (themeCycle.length > 1) {
            button.addEventListener('click', handleThemeToggle);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
})();
