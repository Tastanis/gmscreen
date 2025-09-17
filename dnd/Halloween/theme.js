(function () {
    const THEME_KEY = 'dnd-dashboard-theme';
    const BUTTON_ID = 'theme-toggle-btn';
    const DEFAULT_THEME = 'default';
    const CLASSIC_LABEL = 'Return to the classic theme';
    const CLASSIC_TITLE = 'Return to the classic theme';
    const CANDIDATE_THEMES = [
        {
            name: 'halloween',
            className: 'halloween-theme',
            linkId: 'halloween-theme',
            buttonLabel: 'Enable the Halloween theme',
            buttonTitle: 'Enable the Halloween theme'
        },
        {
            name: 'christmas',
            className: 'christmas-theme',
            linkId: 'christmas-theme',
            buttonLabel: 'Enable the Christmas theme',
            buttonTitle: 'Enable the Christmas theme'
        },
        {
            name: 'pride',
            className: 'pride-theme',
            linkId: 'pride-theme',
            buttonLabel: 'Enable the Pride theme',
            buttonTitle: 'Enable the Pride theme'
        }
    ];

    function getThemeConfig(themeName) {
        if (themeName === DEFAULT_THEME) {
            return {
                name: DEFAULT_THEME,
                className: '',
                linkId: '',
                buttonLabel: CLASSIC_LABEL,
                buttonTitle: CLASSIC_TITLE
            };
        }

        return CANDIDATE_THEMES.find(function (theme) {
            return theme.name === themeName;
        }) || null;
    }

    function getNextTheme(currentTheme, themeCycle) {
        if (!Array.isArray(themeCycle) || themeCycle.length === 0) {
            return DEFAULT_THEME;
        }

        var index = themeCycle.indexOf(currentTheme);
        if (index === -1) {
            return themeCycle[0];
        }

        return themeCycle[(index + 1) % themeCycle.length];
    }

    function persistTheme(themeName) {
        try {
            if (themeName === DEFAULT_THEME) {
                window.localStorage.removeItem(THEME_KEY);
            } else {
                window.localStorage.setItem(THEME_KEY, themeName);
            }
        } catch (error) {
            console.warn('Unable to persist theme preference:', error);
        }
    }

    function updateButtonState(button, currentTheme, themeCycle, isDisabled) {
        if (!button) {
            return;
        }

        var nextTheme = getNextTheme(currentTheme, themeCycle);
        var nextConfig = getThemeConfig(nextTheme);
        var isActiveTheme = currentTheme !== DEFAULT_THEME;
        var label;
        var title;

        button.disabled = Boolean(isDisabled);
        if (isDisabled) {
            label = 'Theme options unavailable';
            title = 'No alternate themes are currently loaded';
            button.textContent = label;
            button.title = title;
            button.setAttribute('aria-label', title);
            button.setAttribute('aria-disabled', 'true');
            button.setAttribute('aria-pressed', 'false');
            button.classList.remove('theme-active');
            return;
        }

        button.removeAttribute('aria-disabled');
        button.classList.toggle('theme-active', isActiveTheme);
        button.setAttribute('aria-pressed', isActiveTheme ? 'true' : 'false');

        if (!nextConfig || nextTheme === DEFAULT_THEME) {
            label = CLASSIC_LABEL;
            title = CLASSIC_TITLE;
        } else {
            label = nextConfig.buttonLabel;
            title = nextConfig.buttonTitle || nextConfig.buttonLabel;
        }

        button.textContent = label;
        button.title = title;
        button.setAttribute('aria-label', title);
    }

    function applyTheme(themeName, options) {
        var settings = options || {};
        var button = settings.button;
        var themeCycle = settings.themeCycle || [];
        var isButtonDisabled = Boolean(settings.isButtonDisabled);
        var config = getThemeConfig(themeName) || getThemeConfig(DEFAULT_THEME);
        var activeThemeName = config ? config.name : DEFAULT_THEME;
        var themeClassNames = CANDIDATE_THEMES.map(function (theme) {
            return theme.className;
        }).filter(Boolean);

        themeClassNames.forEach(function (className) {
            document.body.classList.remove(className);
        });

        if (config && config.className) {
            document.body.classList.add(config.className);
        }

        CANDIDATE_THEMES.forEach(function (theme) {
            var link = document.getElementById(theme.linkId);
            if (link) {
                link.disabled = !(config && config.linkId === theme.linkId);
            }
        });

        document.body.dataset.activeTheme = activeThemeName;

        if (button) {
            updateButtonState(button, activeThemeName, themeCycle, isButtonDisabled);
        }
    }

    function getThemeFromStorage(themeCycle) {
        if (!Array.isArray(themeCycle) || themeCycle.length === 0) {
            return DEFAULT_THEME;
        }

        try {
            var storedValue = window.localStorage.getItem(THEME_KEY);
            if (storedValue && themeCycle.indexOf(storedValue) !== -1) {
                return storedValue;
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

        var themeCycle = context.themeCycle || [];
        var button = context.button;
        if (!Array.isArray(themeCycle) || themeCycle.length <= 1) {
            return;
        }

        var currentTheme = document.body.dataset.activeTheme || DEFAULT_THEME;
        var nextTheme = getNextTheme(currentTheme, themeCycle);

        applyTheme(nextTheme, {
            button: button,
            themeCycle: themeCycle
        });
        persistTheme(nextTheme);
    }

    function initThemeToggle() {
        var button = document.getElementById(BUTTON_ID);
        if (!button) {
            return;
        }

        var detectedThemes = CANDIDATE_THEMES.filter(function (theme) {
            return Boolean(document.getElementById(theme.linkId));
        }).map(function (theme) {
            return theme.name;
        });

        var themeCycle = [DEFAULT_THEME].concat(detectedThemes);
        var storedTheme = getThemeFromStorage(themeCycle);
        var hasAlternates = themeCycle.length > 1;

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
