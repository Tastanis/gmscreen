(function () {
    const FETCH_INTERVAL_MS = 2500;
    const MAX_MESSAGES = 100;

    function initChatPanel(isGM, currentUser) {
        const panel = document.getElementById('chat-panel');
        const toggleButton = document.getElementById('chat-panel-toggle');
        const closeButton = document.getElementById('chat-panel-close');
        const messageList = document.getElementById('chat-message-list');
        const form = document.getElementById('chat-input-form');
        const textarea = document.getElementById('chat-input');
        const sendButton = document.getElementById('chat-send-btn');
        const dropTarget = document.getElementById('chat-drop-target');

        if (!panel || !toggleButton || !messageList || !form || !textarea || !sendButton) {
            return;
        }

        let isOpen = false;
        let fetchTimer = null;
        let fetchInProgress = false;
        let latestServerTimestamp = '';
        let messages = [];

        const existingMessages = messageList.dataset.initialMessages;
        if (existingMessages) {
            try {
                messages = JSON.parse(existingMessages);
            } catch (error) {
                messages = [];
            }
        }

        function trimMessages() {
            if (messages.length > MAX_MESSAGES) {
                messages = messages.slice(-MAX_MESSAGES);
            }
        }

        function formatTimestamp(timestamp) {
            if (!timestamp) {
                return '';
            }

            const parsed = new Date(timestamp);
            if (Number.isNaN(parsed.getTime())) {
                return '';
            }

            return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        function createMessageElement(message) {
            const wrapper = document.createElement('div');
            wrapper.className = 'chat-message';

            if (message.user === currentUser) {
                wrapper.classList.add('chat-message--self');
            }

            if (message.pending) {
                wrapper.classList.add('chat-message--pending');
            }

            if (message.error) {
                wrapper.classList.add('chat-message--error');
            }

            const meta = document.createElement('div');
            meta.className = 'chat-message__meta';

            const userSpan = document.createElement('span');
            userSpan.textContent = message.user || 'Unknown';
            meta.appendChild(userSpan);

            const timeSpan = document.createElement('span');
            timeSpan.textContent = formatTimestamp(message.timestamp);
            meta.appendChild(timeSpan);

            const body = document.createElement('div');
            body.className = 'chat-message__text';
            body.textContent = message.message || '';

            wrapper.appendChild(meta);
            wrapper.appendChild(body);

            return wrapper;
        }

        function renderMessages() {
            messageList.innerHTML = '';

            const sorted = [...messages].sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeA - timeB;
            });

            for (const message of sorted) {
                messageList.appendChild(createMessageElement(message));
            }

            messageList.scrollTop = messageList.scrollHeight;
        }

        function setOpen(state) {
            isOpen = state;
            panel.classList.toggle('chat-panel--open', state);
            panel.classList.toggle('chat-panel--closed', !state);
            panel.setAttribute('aria-hidden', state ? 'false' : 'true');
            toggleButton.setAttribute('aria-expanded', state ? 'true' : 'false');
            toggleButton.textContent = state ? 'Close Chat' : 'Open Chat';

            if (state) {
                textarea.focus();
            }
        }

        function ensureInterval() {
            if (fetchTimer === null) {
                fetchTimer = window.setInterval(fetchMessages, FETCH_INTERVAL_MS);
            }
        }

        function updateLatestTimestamp(candidate) {
            if (!candidate) {
                return;
            }

            if (!latestServerTimestamp) {
                latestServerTimestamp = candidate;
                return;
            }

            const currentTime = new Date(latestServerTimestamp).getTime();
            const candidateTime = new Date(candidate).getTime();
            if (!Number.isNaN(candidateTime) && candidateTime > currentTime) {
                latestServerTimestamp = candidate;
            }
        }

        function mergeMessages(incoming) {
            if (!Array.isArray(incoming) || incoming.length === 0) {
                return;
            }

            const idToIndex = new Map();
            messages.forEach((msg, index) => {
                if (msg && msg.id) {
                    idToIndex.set(msg.id, index);
                }
            });

            let hasChanges = false;
            for (const message of incoming) {
                if (!message || !message.id) {
                    continue;
                }

                updateLatestTimestamp(message.timestamp);

                if (idToIndex.has(message.id)) {
                    const idx = idToIndex.get(message.id);
                    messages[idx] = Object.assign({}, messages[idx], message, { pending: false, error: false });
                } else {
                    messages.push(Object.assign({}, message, { pending: false, error: false }));
                }

                hasChanges = true;
            }

            if (hasChanges) {
                trimMessages();
                renderMessages();
            }
        }

        async function fetchMessages() {
            if (fetchInProgress) {
                return;
            }

            fetchInProgress = true;
            try {
                const params = new URLSearchParams();
                params.append('action', 'chat_fetch');
                if (latestServerTimestamp) {
                    params.append('since', latestServerTimestamp);
                }

                const response = await fetch('chat_handler.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: params.toString()
                });

                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                if (data && data.success) {
                    mergeMessages(data.messages || []);
                    updateLatestTimestamp(data.latest);
                }
            } catch (error) {
                // Swallow errors to keep polling running
            } finally {
                fetchInProgress = false;
            }
        }

        async function handleSend(event) {
            event.preventDefault();
            const text = textarea.value.trim();
            if (text === '') {
                return;
            }

            const tempId = `temp-${Date.now()}`;
            const optimisticMessage = {
                id: tempId,
                timestamp: new Date().toISOString(),
                user: currentUser || 'You',
                message: text,
                pending: true,
                error: false
            };

            messages.push(optimisticMessage);
            trimMessages();
            renderMessages();

            textarea.value = '';
            textarea.focus();
            sendButton.disabled = true;

            try {
                const params = new URLSearchParams();
                params.append('action', 'chat_send');
                params.append('message', text);

                const response = await fetch('chat_handler.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: params.toString()
                });

                const data = await response.json();
                if (data && data.success && data.message) {
                    resolvePendingMessage(tempId, data.message);
                    updateLatestTimestamp(data.message.timestamp);
                } else {
                    markMessageError(tempId);
                }
            } catch (error) {
                markMessageError(tempId);
            } finally {
                sendButton.disabled = false;
            }
        }

        function resolvePendingMessage(tempId, serverMessage) {
            const index = messages.findIndex((message) => message.id === tempId);
            if (index !== -1) {
                messages[index] = Object.assign({}, serverMessage, { pending: false, error: false });
            } else {
                messages.push(Object.assign({}, serverMessage, { pending: false, error: false }));
            }

            trimMessages();
            renderMessages();
        }

        function markMessageError(tempId) {
            const index = messages.findIndex((message) => message.id === tempId);
            if (index !== -1) {
                messages[index].pending = false;
                messages[index].error = true;
                renderMessages();
            }
        }

        function handleTextareaKeydown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                form.requestSubmit();
            }
        }

        function shouldHandleDrag(event) {
            if (!event.dataTransfer) {
                return false;
            }
            const types = Array.from(event.dataTransfer.types || []);
            return types.includes('Files');
        }

        function showDropTarget() {
            if (!dropTarget) {
                return;
            }
            dropTarget.hidden = false;
            dropTarget.setAttribute('aria-hidden', 'false');
        }

        function hideDropTarget() {
            if (!dropTarget) {
                return;
            }
            dropTarget.hidden = true;
            dropTarget.setAttribute('aria-hidden', 'true');
        }

        document.addEventListener('dragenter', (event) => {
            if (shouldHandleDrag(event)) {
                event.preventDefault();
                showDropTarget();
            }
        });

        document.addEventListener('dragover', (event) => {
            if (shouldHandleDrag(event)) {
                event.preventDefault();
            }
        });

        document.addEventListener('dragleave', (event) => {
            if (event.target === dropTarget || !event.relatedTarget) {
                hideDropTarget();
            }
        });

        document.addEventListener('drop', (event) => {
            if (shouldHandleDrag(event)) {
                event.preventDefault();
                hideDropTarget();
            }
        });

        toggleButton.addEventListener('click', () => {
            setOpen(!isOpen);
        });

        if (closeButton) {
            closeButton.addEventListener('click', () => setOpen(false));
        }

        form.addEventListener('submit', handleSend);
        textarea.addEventListener('keydown', handleTextareaKeydown);

        setOpen(false);
        renderMessages();
        ensureInterval();
        fetchMessages();
    }

    window.initChatPanel = initChatPanel;
})();
