let chatInitialized = false;

export function initializeChatBridge({ chatEndpoint, panel, user = {}, participants = [] }) {
  if (!panel) {
    console.warn('[VTT] Chat bridge missing requirements');
    return;
  }

  if (chatEndpoint) {
    try {
      window.chatHandlerUrl = chatEndpoint;
    } catch (error) {
      // Ignore attempts to write to window in non-browser contexts.
    }
    panel.dataset.chatEndpoint = chatEndpoint;
  }

  if (Array.isArray(participants) && participants.length) {
    try {
      window.chatParticipants = participants;
    } catch (error) {
      // Ignore when window is not available.
    }
  }

  if (chatInitialized) {
    return;
  }

  const isGM = Boolean(user?.isGM);
  const currentUser = typeof user?.name === 'string' ? user.name : '';

  const startChatPanel = () => {
    if (typeof window === 'undefined') {
      return true;
    }
    if (typeof window.initChatPanel !== 'function') {
      return false;
    }
    window.initChatPanel(isGM, currentUser);
    chatInitialized = true;
    panel.dataset.chatInitialized = 'true';
    return true;
  };

  if (startChatPanel()) {
    return;
  }

  if (typeof window === 'undefined' || typeof window.setInterval !== 'function') {
    return;
  }

  let attempts = 0;
  const maxAttempts = 40;
  const interval = window.setInterval(() => {
    attempts += 1;
    if (startChatPanel() || attempts >= maxAttempts) {
      window.clearInterval(interval);
    }
  }, 100);
}
