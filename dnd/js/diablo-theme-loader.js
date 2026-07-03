/**
 * Diablo theme loader for satellite pages (students, staff, other NPCs,
 * character sheets, VTT). The dashboard owns the theme toggle and persists
 * the choice in localStorage; this script applies the Diablo skin on pages
 * that have no toggle of their own.
 *
 * Include in <head> AFTER the page's normal stylesheets, alongside a
 * <link> to the Diablo skin CSS. Runs synchronously so the <html> class
 * lands before first paint (no parchment flash).
 *
 * Also mirrors the dashboard theme-manager contract (body.dataset.activeTheme
 * + 'themechange' events) so effect scripts like Diablo/theme.js work here.
 */
(function () {
    var THEME_KEY = 'dnd-dashboard-theme';
    var THEME_CLASS = 'diablo-theme';

    function isDiabloStored() {
        try {
            return window.localStorage.getItem(THEME_KEY) === 'diablo';
        } catch (error) {
            return false;
        }
    }

    function setTheme(enabled) {
        document.documentElement.classList.toggle(THEME_CLASS, enabled);
        if (!document.body) {
            return;
        }
        var previousTheme = document.body.dataset.activeTheme || 'classic';
        var nextTheme = enabled ? 'diablo' : 'classic';
        document.body.classList.toggle(THEME_CLASS, enabled);
        document.body.dataset.activeTheme = nextTheme;
        if (previousTheme !== nextTheme) {
            document.dispatchEvent(new CustomEvent('themechange', {
                detail: {
                    themeName: nextTheme,
                    previousTheme: previousTheme
                }
            }));
        }
    }

    if (isDiabloStored()) {
        document.documentElement.classList.add(THEME_CLASS);
    }

    function applyStored() {
        setTheme(isDiabloStored());
    }

    if (document.body) {
        applyStored();
    } else {
        document.addEventListener('DOMContentLoaded', applyStored);
    }

    // Live-sync with the dashboard: toggling the theme there updates
    // already-open satellite tabs immediately.
    window.addEventListener('storage', function (event) {
        if (event.key === THEME_KEY || event.key === null) {
            setTheme(isDiabloStored());
        }
    });
})();
