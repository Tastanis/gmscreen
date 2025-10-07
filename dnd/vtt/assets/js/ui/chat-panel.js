import { initializeChatBridge } from '../services/chat-service.js';

export function mountChatPanel(routes) {
  const panel = document.querySelector('[data-module="vtt-chat"]');
  if (!panel) return;

  const toggle = panel.querySelector('[data-action="toggle-chat"]');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      panel.classList.toggle('is-collapsed');
    });
  }

  initializeChatBridge({ chatEndpoint: routes.chat, panel });
}
