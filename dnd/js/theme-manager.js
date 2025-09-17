(function () {
    const STORAGE_KEY = 'dnd-dashboard-theme';
    const BUTTON_ID = 'theme-toggle-btn';
    const DEFAULT_THEME = 'classic';
    const LEGACY_DEFAULT = 'default';
    const THEMES = [
        {
            name: 'halloween',
            className: 'halloween-theme',
            linkId: 'halloween-theme',
            label: 'Halloween'
        },
        {
            name: 'christmas',
            className: 'christmas-theme',
            linkId: 'christmas-theme',
            label: 'Christmas'
        },
        {
            name: 'frunk',
            className: 'frunk-theme',
            linkId: 'frunk-theme',
            label: 'Frunk'
        }
    ];

    let activeTheme = DEFAULT_THEME;

    function normalizeThemeName(themeName) {
        if (themeName === null || typeof themeName === 'undefined') {
            return DEFAULT_THEME;
        }
        const value = String(themeName).toLowerCase();
        if (!value) {
            return DEFAULT_THEME;
        }
        if (value === LEGACY_DEFAULT) {
            return DEFAULT_THEME;
        }
        return value;
    }

    function formatLabel(themeName) {
        if (!themeName) {
            return '';
        }
        return themeName.charAt(0).toUpperCase() + themeName.slice(1);
    }

    function getThemeConfig(themeName) {
        const normalized = normalizeThemeName(themeName);
        if (normalized === DEFAULT_THEME) {
            return {
                name: DEFAULT_THEME,
                className: '',
                linkId: '',
                label: 'Classic'
            };
        }
        return THEMES.find(theme => theme.name === normalized) || null;
    }

    function getNextTheme(currentTheme, themeCycle) {
        if (!Array.isArray(themeCycle) || themeCycle.length === 0) {
            return DEFAULT_THEME;
        }
        const normalized = normalizeThemeName(currentTheme);
        const index = themeCycle.indexOf(normalized);
        if (index === -1) {
            return themeCycle[0];
        }
        const nextIndex = (index + 1) % themeCycle.length;
        return themeCycle[nextIndex];
    }

    function persistTheme(themeName) {
        const normalized = normalizeThemeName(themeName);
        try {
            if (normalized === DEFAULT_THEME) {
                window.localStorage.removeItem(STORAGE_KEY);
            } else {
                window.localStorage.setItem(STORAGE_KEY, normalized);
            }
        } catch (error) {
            console.warn('Unable to persist theme preference:', error);
        }
    }

    function updateButtonState(button, currentTheme, themeCycle, disabled) {
        if (!button) {
            return;
        }

        const isDisabled = Boolean(disabled);
        button.disabled = isDisabled;

        if (isDisabled) {
            button.textContent = 'Theme: Unavailable';
            button.title = 'No alternate themes are currently loaded';
            button.setAttribute('aria-label', button.title);
            button.setAttribute('aria-disabled', 'true');
            button.classList.remove('theme-active');
            button.setAttribute('aria-pressed', 'false');
            return;
        }

        button.removeAttribute('aria-disabled');

        const nextTheme = getNextTheme(currentTheme, themeCycle);
        const nextConfig = getThemeConfig(nextTheme);
        const label = nextConfig ? nextConfig.label : formatLabel(nextTheme);
        const isAlternateTheme = normalizeThemeName(currentTheme) !== DEFAULT_THEME;

        button.classList.toggle('theme-active', isAlternateTheme);
        button.setAttribute('aria-pressed', isAlternateTheme ? 'true' : 'false');

        const buttonLabel = label ? `Theme: ${label}` : 'Theme';
        const buttonTitle = label ? `Switch to the ${label} theme` : 'Switch theme';

        button.textContent = buttonLabel;
        button.title = buttonTitle;
        button.setAttribute('aria-label', buttonTitle);
    }

    function applyTheme(themeName, options) {
        const settings = options || {};
        const button = settings.button;
        const themeCycle = settings.themeCycle || [];
        const isButtonDisabled = Boolean(settings.isButtonDisabled);
        const normalized = getThemeConfig(themeName) ? normalizeThemeName(themeName) : DEFAULT_THEME;
        const config = getThemeConfig(normalized) || getThemeConfig(DEFAULT_THEME);
        const themeClassNames = THEMES.map(theme => theme.className).filter(Boolean);
        const previousTheme = activeTheme;

        themeClassNames.forEach(className => {
            document.body.classList.remove(className);
        });

        if (config && config.className) {
            document.body.classList.add(config.className);
        }

        THEMES.forEach(theme => {
            const link = document.getElementById(theme.linkId);
            if (link) {
                link.disabled = !(config && config.linkId === theme.linkId);
            }
        });

        activeTheme = config ? config.name : DEFAULT_THEME;
        document.body.dataset.activeTheme = activeTheme;

        if (button) {
            updateButtonState(button, activeTheme, themeCycle, isButtonDisabled);
        }

        if (previousTheme !== activeTheme) {
            const event = new CustomEvent('themechange', {
                detail: {
                    themeName: activeTheme,
                    previousTheme: previousTheme
                }
            });
            document.dispatchEvent(event);
        }
    }

    function getThemeFromStorage(themeCycle) {
        if (!Array.isArray(themeCycle) || themeCycle.length === 0) {
            return DEFAULT_THEME;
        }
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const normalized = normalizeThemeName(stored);
                if (themeCycle.indexOf(normalized) !== -1) {
                    return normalized;
                }
            }
        } catch (error) {
            console.warn('Unable to load theme preference:', error);
        }
        return DEFAULT_THEME;
    }

    function handleThemeToggle(context) {
        if (!context) {
            return;
        }
        const themeCycle = context.themeCycle || [];
        if (!Array.isArray(themeCycle) || themeCycle.length <= 1) {
            return;
        }
        const currentTheme = document.body.dataset.activeTheme || DEFAULT_THEME;
        const nextTheme = getNextTheme(currentTheme, themeCycle);
        applyTheme(nextTheme, {
            button: context.button,
            themeCycle: themeCycle
        });
        persistTheme(nextTheme);
    }

    function initThemeToggle() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }

        const detectedThemes = THEMES.filter(theme => {
            return Boolean(document.getElementById(theme.linkId));
        }).map(theme => theme.name);

        const themeCycle = [DEFAULT_THEME].concat(detectedThemes);
        const storedTheme = getThemeFromStorage(themeCycle);
        const hasAlternates = themeCycle.length > 1;

        applyTheme(storedTheme, {
            button: button,
            themeCycle: themeCycle,
            isButtonDisabled: !hasAlternates
        });

        if (hasAlternates) {
            button.addEventListener('click', function () {
                handleThemeToggle({
                    themeCycle: themeCycle,
                    button: button
                });
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
})();
