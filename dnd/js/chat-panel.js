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

        function showChatToast(message, type = 'error') {
            const existing = document.querySelector('.chat-toast');
            if (existing) {
                existing.parentElement.removeChild(existing);
            }

            const toast = document.createElement('div');
            toast.className = `chat-toast chat-toast--${type}`;
            toast.textContent = message;

            document.body.appendChild(toast);

            window.setTimeout(() => {
                toast.classList.add('chat-toast--hide');
                window.setTimeout(() => {
                    if (toast.parentElement) {
                        toast.parentElement.removeChild(toast);
                    }
                }, 220);
            }, 3200);
        }

        function getAbsoluteUrl(value) {
            if (!value) {
                return '';
            }

            try {
                const absolute = new URL(value, window.location.href);
                return absolute.toString();
            } catch (error) {
                return value;
            }
        }

        function isSupportedImageUrl(url) {
            if (!url) {
                return false;
            }

            try {
                const absolute = new URL(url, window.location.href);
                const path = absolute.pathname ? absolute.pathname.toLowerCase() : '';
                return /(\.png|\.jpe?g|\.gif|\.webp|\.bmp|\.svg)$/i.test(path);
            } catch (error) {
                return /(\.png|\.jpe?g|\.gif|\.webp|\.bmp|\.svg)$/i.test(url.toLowerCase());
            }
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

            if (message.imageUrl) {
                body.classList.add('chat-message__text--image');

                const imageLink = document.createElement('a');
                imageLink.href = message.imageUrl;
                imageLink.target = '_blank';
                imageLink.rel = 'noopener noreferrer';

                const image = document.createElement('img');
                image.className = 'chat-message__image';
                image.src = message.imageUrl;
                image.alt = message.message || 'Shared image';
                image.loading = 'lazy';

                imageLink.appendChild(image);
                body.appendChild(imageLink);

                if (message.message) {
                    const caption = document.createElement('div');
                    caption.className = 'chat-message__caption';
                    caption.textContent = message.message;
                    body.appendChild(caption);
                }
            } else {
                body.textContent = message.message || '';
            }

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

            textarea.value = '';
            sendButton.disabled = true;

            try {
                await sendChatMessage({ message: text });
            } finally {
                sendButton.disabled = false;
                textarea.focus();
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

        async function sendChatMessage({ message = '', imageUrl = '' }) {
            const text = typeof message === 'string' ? message.trim() : '';
            const image = typeof imageUrl === 'string' ? imageUrl.trim() : '';

            if (text === '' && image === '') {
                return false;
            }

            const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const optimisticMessage = {
                id: tempId,
                timestamp: new Date().toISOString(),
                user: currentUser || 'You',
                message: text,
                pending: true,
                error: false
            };

            if (image) {
                optimisticMessage.imageUrl = image;
            }

            messages.push(optimisticMessage);
            trimMessages();
            renderMessages();

            try {
                const params = new URLSearchParams();
                params.append('action', 'chat_send');
                if (text !== '') {
                    params.append('message', text);
                }
                if (image !== '') {
                    params.append('imageUrl', image);
                }

                const response = await fetch('chat_handler.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: params.toString()
                });

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                const data = await response.json();
                if (data && data.success && data.message) {
                    resolvePendingMessage(tempId, data.message);
                    updateLatestTimestamp(data.message.timestamp);
                    return true;
                }

                markMessageError(tempId);
                showChatToast(data && data.error ? data.error : 'Failed to send message', 'error');
            } catch (error) {
                markMessageError(tempId);
                showChatToast('Failed to send message', 'error');
            }

            return false;
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
            return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain');
        }

        function isImageFile(file) {
            if (!file) {
                return false;
            }

            if (file.type && file.type.startsWith('image/')) {
                return true;
            }

            const name = file.name || '';
            return /(\.png|\.jpe?g|\.gif|\.webp|\.bmp|\.svg)$/i.test(name);
        }

        async function uploadFileForChat(file) {
            const formData = new FormData();
            formData.append('action', 'chat_upload');
            formData.append('file', file);

            const response = await fetch('chat_handler.php', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to upload file');
            }

            const data = await response.json();
            if (data && data.success && data.url) {
                await sendChatMessage({ message: file.name || '', imageUrl: data.url });
                return;
            }

            throw new Error(data && data.error ? data.error : 'Failed to upload file');
        }

        async function handleFileDrop(fileList) {
            const files = Array.from(fileList || []);
            if (files.length === 0) {
                return;
            }

            for (const file of files) {
                if (!isImageFile(file)) {
                    showChatToast('Only image files can be dropped into chat.', 'error');
                    continue;
                }

                try {
                    await uploadFileForChat(file);
                } catch (error) {
                    showChatToast(error.message || 'Failed to upload file', 'error');
                }
            }
        }

        async function processDroppedUrl(rawData) {
            if (!rawData) {
                showChatToast('Only image URLs can be dropped into chat.', 'error');
                return;
            }

            const cleaned = rawData.trim().split('\n')[0];
            if (cleaned === '') {
                showChatToast('Only image URLs can be dropped into chat.', 'error');
                return;
            }

            const absolute = getAbsoluteUrl(cleaned);
            if (!isSupportedImageUrl(absolute)) {
                showChatToast('Only image URLs can be dropped into chat.', 'error');
                return;
            }

            await sendChatMessage({ imageUrl: absolute });
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
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'copy';
                }
            }
        });

        document.addEventListener('dragleave', (event) => {
            if (event.target === dropTarget || !event.relatedTarget) {
                hideDropTarget();
            }
        });

        document.addEventListener('drop', async (event) => {
            hideDropTarget();
            if (!event.dataTransfer) {
                return;
            }

            if (!shouldHandleDrag(event)) {
                return;
            }

            event.preventDefault();

            if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
                await handleFileDrop(event.dataTransfer.files);
                return;
            }

            const uriData = event.dataTransfer.getData('text/uri-list');
            const textData = event.dataTransfer.getData('text/plain');
            if (uriData || textData) {
                await processDroppedUrl(uriData || textData);
                return;
            }

            showChatToast('Only image files or image links can be dropped into chat.', 'error');
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
