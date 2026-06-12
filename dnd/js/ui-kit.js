/**
 * GM Screen shared UI kit (window.UIKit)
 *
 * Replaces native alert()/confirm()/prompt() with themed, non-blocking UI:
 *   UIKit.toast(message, type, opts)          -> toast element
 *   UIKit.confirm(opts)                       -> Promise<boolean>
 *   UIKit.prompt(opts)                        -> Promise<string|null>
 *   UIKit.openModal(el, opts) / closeModal(el)-> Esc handling, focus trap,
 *                                                focus restore for existing modals
 *   UIKit.setLoading(button, isLoading, text) -> disabled + spinner state
 *
 * Requires css/ui-kit.css (and css/theme.css for tokens). No dependencies.
 */
(function () {
    'use strict';

    if (window.UIKit) {
        return;
    }

    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    /* ---------------------------------------------------------------------
       Toasts
       --------------------------------------------------------------------- */
    var TOAST_ICONS = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };

    function getToastContainer() {
        var container = document.querySelector('.uik-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'uik-toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * @param {string} message
     * @param {string} [type] success | error | warning | info
     * @param {{duration?: number}} [opts] duration in ms (0 = sticky until clicked)
     */
    function toast(message, type, opts) {
        type = TOAST_ICONS.hasOwnProperty(type) ? type : 'info';
        opts = opts || {};
        var duration = typeof opts.duration === 'number' ? opts.duration
            : (type === 'error' ? 6000 : 3500);

        var el = document.createElement('div');
        el.className = 'uik-toast uik-toast--' + type;
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');

        var icon = document.createElement('span');
        icon.className = 'uik-toast__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = TOAST_ICONS[type];

        var text = document.createElement('span');
        text.className = 'uik-toast__message';
        text.textContent = message;

        el.appendChild(icon);
        el.appendChild(text);
        getToastContainer().appendChild(el);

        var removed = false;
        function remove() {
            if (removed) { return; }
            removed = true;
            el.classList.add('uik-toast--leaving');
            setTimeout(function () {
                if (el.parentNode) { el.parentNode.removeChild(el); }
            }, 250);
        }

        el.addEventListener('click', remove);
        if (duration > 0) {
            setTimeout(remove, duration);
        }
        return el;
    }

    /* ---------------------------------------------------------------------
       Focus trap helpers
       --------------------------------------------------------------------- */
    function trapFocus(modal, event) {
        var focusable = modal.querySelectorAll(FOCUSABLE);
        if (!focusable.length) {
            event.preventDefault();
            return;
        }
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    /* ---------------------------------------------------------------------
       Dialog factory (confirm / prompt)
       --------------------------------------------------------------------- */
    function buildDialog(opts, withInput) {
        var overlay = document.createElement('div');
        overlay.className = 'uik-overlay';

        var modal = document.createElement('div');
        modal.className = 'uik-modal';
        modal.setAttribute('role', withInput ? 'dialog' : 'alertdialog');
        modal.setAttribute('aria-modal', 'true');

        var titleId = 'uik-title-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        modal.setAttribute('aria-labelledby', titleId);

        var header = document.createElement('div');
        header.className = 'uik-modal__header';
        var title = document.createElement('h2');
        title.className = 'uik-modal__title';
        title.id = titleId;
        title.textContent = opts.title || (withInput ? 'Input needed' : 'Are you sure?');
        header.appendChild(title);

        var body = document.createElement('div');
        body.className = 'uik-modal__body';
        if (opts.message) {
            var msg = document.createElement('div');
            msg.textContent = opts.message;
            body.appendChild(msg);
        }

        var input = null;
        if (withInput) {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'uik-modal__input';
            input.value = opts.defaultValue || '';
            if (opts.placeholder) { input.placeholder = opts.placeholder; }
            body.appendChild(input);
        }

        var footer = document.createElement('div');
        footer.className = 'uik-modal__footer';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'uik-btn';
        cancelBtn.textContent = opts.cancelText || 'Cancel';

        var confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'uik-btn ' + (opts.danger ? 'uik-btn--danger' : 'uik-btn--primary');
        confirmBtn.textContent = opts.confirmText || 'OK';

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        return {
            overlay: overlay,
            modal: modal,
            input: input,
            cancelBtn: cancelBtn,
            confirmBtn: confirmBtn
        };
    }

    function showDialog(opts, withInput) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var parts = buildDialog(opts, withInput);
            var previousFocus = document.activeElement;
            var settled = false;
            // Join the modal stack so Esc/Tab handlers of modals underneath
            // see this dialog as topmost and stay inert while it is open.
            var stackRecord = { el: parts.overlay, onClose: null, previousFocus: null, keyHandler: null };

            function settle(value) {
                if (settled) { return; }
                settled = true;
                var idx = openModals.indexOf(stackRecord);
                if (idx !== -1) { openModals.splice(idx, 1); }
                document.removeEventListener('keydown', onKeyDown, true);
                parts.overlay.classList.add('uik-overlay--leaving');
                setTimeout(function () {
                    if (parts.overlay.parentNode) {
                        parts.overlay.parentNode.removeChild(parts.overlay);
                    }
                }, 130);
                if (previousFocus && typeof previousFocus.focus === 'function') {
                    previousFocus.focus();
                }
                resolve(value);
            }

            function onKeyDown(event) {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    settle(withInput ? null : false);
                } else if (event.key === 'Enter' && withInput &&
                           document.activeElement === parts.input) {
                    event.preventDefault();
                    settle(parts.input.value);
                } else if (event.key === 'Tab') {
                    trapFocus(parts.modal, event);
                }
            }

            parts.cancelBtn.addEventListener('click', function () {
                settle(withInput ? null : false);
            });
            parts.confirmBtn.addEventListener('click', function () {
                settle(withInput ? parts.input.value : true);
            });
            parts.overlay.addEventListener('mousedown', function (event) {
                if (event.target === parts.overlay) {
                    settle(withInput ? null : false);
                }
            });
            document.addEventListener('keydown', onKeyDown, true);
            openModals.push(stackRecord);

            document.body.appendChild(parts.overlay);
            if (withInput) {
                parts.input.focus();
                parts.input.select();
            } else if (opts.danger) {
                parts.cancelBtn.focus();
            } else {
                parts.confirmBtn.focus();
            }
        });
    }

    /**
     * Themed replacement for confirm().
     * @param {{title?, message?, confirmText?, cancelText?, danger?}|string} opts
     * @returns {Promise<boolean>}
     */
    function confirmDialog(opts) {
        if (typeof opts === 'string') { opts = { message: opts }; }
        return showDialog(opts, false);
    }

    /**
     * Themed replacement for prompt(). Resolves to the string or null on cancel.
     * @param {{title?, message?, defaultValue?, placeholder?, confirmText?, cancelText?}|string} opts
     * @returns {Promise<string|null>}
     */
    function promptDialog(opts) {
        if (typeof opts === 'string') { opts = { message: opts }; }
        return showDialog(opts, true);
    }

    /* ---------------------------------------------------------------------
       Helpers for EXISTING modals (Esc close, focus trap, focus restore)
       --------------------------------------------------------------------- */
    var openModals = [];

    /**
     * Attach standard modal behavior to an already-visible element.
     * @param {HTMLElement} el modal root (should contain focusable elements)
     * @param {{onClose?: Function, initialFocus?: HTMLElement}} [opts]
     */
    function openModal(el, opts) {
        opts = opts || {};
        if (!el || openModals.some(function (m) { return m.el === el; })) {
            return;
        }

        var record = {
            el: el,
            onClose: opts.onClose || null,
            previousFocus: document.activeElement,
            keyHandler: function (event) {
                var top = openModals[openModals.length - 1];
                if (!top || top.el !== el) { return; }
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    closeModal(el);
                } else if (event.key === 'Tab') {
                    trapFocus(el, event);
                }
            }
        };

        if (!el.hasAttribute('role')) { el.setAttribute('role', 'dialog'); }
        el.setAttribute('aria-modal', 'true');

        document.addEventListener('keydown', record.keyHandler, true);
        openModals.push(record);

        var target = opts.initialFocus || el.querySelector(FOCUSABLE);
        if (target) { target.focus(); }
    }

    /**
     * Detach behavior added by openModal and restore focus.
     * Calls onClose (which should do the actual hiding) exactly once.
     */
    function closeModal(el) {
        for (var i = openModals.length - 1; i >= 0; i--) {
            if (openModals[i].el === el) {
                var record = openModals.splice(i, 1)[0];
                document.removeEventListener('keydown', record.keyHandler, true);
                if (record.onClose) { record.onClose(); }
                if (record.previousFocus &&
                    typeof record.previousFocus.focus === 'function' &&
                    document.contains(record.previousFocus)) {
                    record.previousFocus.focus();
                }
                return;
            }
        }
    }

    /* ---------------------------------------------------------------------
       Button loading state (fix #6)
       --------------------------------------------------------------------- */
    /**
     * @param {HTMLButtonElement} button
     * @param {boolean} isLoading
     * @param {string} [loadingText] optional label while loading
     */
    function setLoading(button, isLoading, loadingText) {
        if (!button) { return; }
        if (isLoading) {
            if (!button.dataset.uikLabel) {
                button.dataset.uikLabel = button.textContent;
            }
            if (loadingText) { button.textContent = loadingText; }
            button.classList.add('uik-loading');
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
        } else {
            if (button.dataset.uikLabel) {
                button.textContent = button.dataset.uikLabel;
                delete button.dataset.uikLabel;
            }
            button.classList.remove('uik-loading');
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    }

    window.UIKit = {
        toast: toast,
        confirm: confirmDialog,
        prompt: promptDialog,
        openModal: openModal,
        closeModal: closeModal,
        trapFocus: trapFocus,
        setLoading: setLoading
    };
})();
