export function initializeChatBridge({ chatEndpoint, panel }) {
  if (!chatEndpoint || !panel) {
    console.warn('[VTT] Chat bridge missing requirements');
    return;
  }

  // Placeholder for shared poller hookup.
  panel.dataset.chatEndpoint = chatEndpoint;
}
