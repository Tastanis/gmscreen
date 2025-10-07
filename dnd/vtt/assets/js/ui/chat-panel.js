import { initializeChatBridge } from '../services/chat-service.js';

export function mountChatPanel(routes) {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;

  const toggle = document.getElementById('chat-panel-toggle');
  const closeButton = panel.querySelector('[data-action="close-chat"]');

  let isOpen = false;

  const setOpen = (open) => {
    if (isOpen === open) return;
    isOpen = open;

    panel.classList.toggle('chat-panel--open', open);
    panel.classList.toggle('chat-panel--closed', !open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');

    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
    }
  };

  const togglePanel = () => {
    setOpen(!isOpen);
  };

  if (toggle) {
    toggle.addEventListener('click', togglePanel);
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => setOpen(false));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      setOpen(false);
    }
  });

  setOpen(false);

  initializeChatBridge({ chatEndpoint: routes.chat, panel });
}
