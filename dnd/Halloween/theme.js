(function () {
    function applyActiveState(themeName) {
        const body = document.body;
        if (!body) {
            return;
        }
        if (themeName === 'halloween') {
            body.classList.add('halloween-theme-active');
        } else {
            body.classList.remove('halloween-theme-active');
        }
    }

    document.addEventListener('themechange', function (event) {
        if (!event || !event.detail) {
            return;
        }
        applyActiveState(event.detail.themeName);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            applyActiveState(document.body.dataset.activeTheme);
        });
    } else {
        applyActiveState(document.body.dataset.activeTheme);
    }
})();
