import { initializeChatBridge } from '../services/chat-service.js';

export function mountChatPanel(routes, userContext = {}, participants = []) {
  const panel = document.getElementById('chat-panel');
  if (!panel) {
    return;
  }

  const chatEndpoint = routes?.chat ?? null;
  const user = {
    isGM: Boolean(userContext?.isGM),
    name: typeof userContext?.name === 'string' ? userContext.name : '',
  };

  initializeChatBridge({
    chatEndpoint,
    panel,
    user,
    participants,
  });
}
