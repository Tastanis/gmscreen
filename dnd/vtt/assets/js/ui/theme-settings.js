const STORAGE_KEY = 'vtt.theme';
const THEMES = new Set(['light', 'dark']);

function normalizeTheme(value) {
  return THEMES.has(value) ? value : 'dark';
}

function readStoredTheme() {
  try {
    return normalizeTheme(window.localStorage?.getItem(STORAGE_KEY));
  } catch (error) {
    return 'dark';
  }
}

function persistTheme(theme) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, theme);
  } catch (error) {
    // Theme preference is cosmetic; ignore storage failures.
  }
}

function applyTheme(theme, options = {}) {
  const normalized = normalizeTheme(theme);
  document.documentElement.setAttribute('data-vtt-theme', normalized);
  document.body?.setAttribute('data-vtt-theme', normalized);
  if (options.persist !== false) {
    persistTheme(normalized);
  }
  return normalized;
}

function syncOptions(options, activeTheme) {
  options.forEach((option) => {
    const theme = normalizeTheme(option.getAttribute('data-vtt-theme-option'));
    const isActive = theme === activeTheme;
    option.classList.toggle('is-active', isActive);
    option.setAttribute('aria-checked', String(isActive));
  });
}

export function mountThemeSettings() {
  const root = document.querySelector('[data-vtt-theme-settings]');
  if (!root) return;

  const toggle = root.querySelector('[data-vtt-theme-settings-toggle]');
  const menu = root.querySelector('[data-vtt-theme-settings-menu]');
  const options = Array.from(root.querySelectorAll('[data-vtt-theme-option]'));
  if (!toggle || !menu || options.length === 0) return;

  let open = false;
  let activeTheme = applyTheme(
    normalizeTheme(document.documentElement.getAttribute('data-vtt-theme') || readStoredTheme()),
    { persist: false }
  );
  syncOptions(options, activeTheme);

  const setOpen = (nextOpen) => {
    open = Boolean(nextOpen);
    menu.hidden = !open;
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => setOpen(!open));

  options.forEach((option) => {
    option.addEventListener('click', () => {
      activeTheme = applyTheme(option.getAttribute('data-vtt-theme-option'));
      syncOptions(options, activeTheme);
      setOpen(false);
    });
  });

  document.addEventListener('click', (event) => {
    if (!open || root.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      toggle.focus();
    }
  });
}

mountThemeSettings();
