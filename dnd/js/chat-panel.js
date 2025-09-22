(function () {
    const FETCH_INTERVAL_MS = 2500;
    const MAX_MESSAGES = 100;
    let escapeListenerAttached = false;

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
        let lightboxElements = null;
        let lastFocusedBeforeLightbox = null;

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

        function closeImageLightbox() {
            if (!lightboxElements) {
                return;
            }

            const { overlay, image, caption } = lightboxElements;
            if (!overlay.classList.contains('chat-image-lightbox--visible')) {
                return;
            }

            overlay.classList.remove('chat-image-lightbox--visible');
            overlay.setAttribute('aria-hidden', 'true');
            image.src = '';
            image.alt = '';
            caption.textContent = '';
            caption.hidden = true;

            if (lastFocusedBeforeLightbox && typeof lastFocusedBeforeLightbox.focus === 'function') {
                lastFocusedBeforeLightbox.focus();
            }

            lastFocusedBeforeLightbox = null;
        }

        function ensureImageLightbox() {
            if (lightboxElements) {
                return lightboxElements;
            }

            const overlay = document.createElement('div');
            overlay.className = 'chat-image-lightbox';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');

            const backdrop = document.createElement('div');
            backdrop.className = 'chat-image-lightbox__backdrop';

            const body = document.createElement('div');
            body.className = 'chat-image-lightbox__body';

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'chat-image-lightbox__close';
            closeButton.setAttribute('aria-label', 'Close image preview');
            closeButton.innerHTML = '&times;';

            const image = document.createElement('img');
            image.className = 'chat-image-lightbox__image';
            image.alt = '';

            const caption = document.createElement('div');
            caption.className = 'chat-image-lightbox__caption';

            body.appendChild(closeButton);
            body.appendChild(image);
            body.appendChild(caption);

            overlay.appendChild(backdrop);
            overlay.appendChild(body);

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) {
                    closeImageLightbox();
                }
            });

            backdrop.addEventListener('click', closeImageLightbox);
            closeButton.addEventListener('click', closeImageLightbox);

            document.body.appendChild(overlay);

            lightboxElements = { overlay, image, caption, closeButton };
            return lightboxElements;
        }

        function openImageLightbox(src, altText, captionText) {
            if (!src) {
                return;
            }

            const elements = ensureImageLightbox();
            const { overlay, image, caption, closeButton } = elements;

            image.src = src;
            image.alt = altText || '';

            if (captionText) {
                caption.textContent = captionText;
                caption.hidden = false;
            } else {
                caption.textContent = '';
                caption.hidden = true;
            }

            overlay.classList.add('chat-image-lightbox--visible');
            overlay.setAttribute('aria-hidden', 'false');

            lastFocusedBeforeLightbox = document.activeElement;
            closeButton.focus();
        }

        if (!escapeListenerAttached) {
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeImageLightbox();
                }
            });
            escapeListenerAttached = true;
        }

        function normalizeMessageType(rawType) {
            if (!rawType) {
                return 'text';
            }
            return typeof rawType === 'string' ? rawType : 'text';
        }

        function createRollBreakdownList(payload) {
            const breakdown = Array.isArray(payload.breakdown) ? payload.breakdown : [];
            if (breakdown.length === 0) {
                return null;
            }

            const list = document.createElement('ul');
            list.className = 'chat-roll-card__breakdown';

            breakdown.forEach((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return;
                }

                const item = document.createElement('li');
                if (entry.type === 'dice') {
                    const notation = entry.notation || 'Dice';
                    const rolls = Array.isArray(entry.rolls) ? entry.rolls.map((roll) => parseInt(roll, 10)).join(', ') : '';
                    const total = Number.isFinite(entry.total) ? entry.total : parseInt(entry.total, 10);
                    const totalText = Number.isFinite(total) ? ` = ${total}` : '';
                    item.textContent = `${notation}: [${rolls}]${totalText}`;
                } else if (entry.type === 'modifier') {
                    const value = Number.isFinite(entry.value) ? entry.value : parseInt(entry.value, 10) || 0;
                    const label = entry.notation || (value >= 0 ? `+${value}` : `${value}`);
                    item.textContent = `${label} modifier`;
                } else {
                    item.textContent = '';
                }
                list.appendChild(item);
            });

            return list.childElementCount > 0 ? list : null;
        }

        function appendRollSummary(card, payload) {
            if (!payload) {
                return;
            }

            const expression = payload.expression || (Array.isArray(payload.components) ? payload.components.filter(Boolean).join(' ') : '');
            const totalValue = Number.isFinite(payload.total) ? payload.total : parseInt(payload.total, 10);

            const headerRow = document.createElement('div');
            headerRow.className = 'chat-roll-card__row';

            const expressionSpan = document.createElement('span');
            expressionSpan.className = 'chat-roll-card__expression';
            expressionSpan.textContent = expression || 'Roll';

            const totalSpan = document.createElement('span');
            totalSpan.className = 'chat-roll-card__total';
            totalSpan.textContent = Number.isFinite(totalValue) ? `Total: ${totalValue}` : 'Total: -';

            headerRow.appendChild(expressionSpan);
            headerRow.appendChild(totalSpan);
            card.appendChild(headerRow);

            const breakdownList = createRollBreakdownList(payload);
            if (breakdownList) {
                card.appendChild(breakdownList);
            }
        }

        function createDiceRollCard(message) {
            const payload = message && message.payload ? message.payload : {};
            const card = document.createElement('div');
            card.className = 'chat-roll-card';
            appendRollSummary(card, payload);

            return card;
        }

        function createProjectRollCard(message) {
            const payload = message && message.payload ? message.payload : {};
            const status = (payload.status || 'pending').toLowerCase();
            const card = document.createElement('div');
            card.className = 'chat-roll-card chat-roll-card--project';

            const name = document.createElement('div');
            name.className = 'chat-roll-card__project-name';
            name.textContent = payload.projectName || 'Project Roll';
            card.appendChild(name);

            appendRollSummary(card, payload);

            const statusLabel = document.createElement('div');
            statusLabel.className = `chat-roll-card__status chat-roll-card__status--${status}`;
            if (status === 'accepted') {
                statusLabel.textContent = 'Accepted';
            } else if (status === 'denied') {
                statusLabel.textContent = 'Denied';
            } else {
                statusLabel.textContent = isGM ? 'Awaiting decision' : 'Pending GM review';
            }

            if (isGM && status === 'pending' && !message.pending && !message.error) {
                const actions = document.createElement('div');
                actions.className = 'chat-roll-card__actions';

                const acceptBtn = document.createElement('button');
                acceptBtn.type = 'button';
                acceptBtn.className = 'chat-roll-card__btn chat-roll-card__btn--accept';
                acceptBtn.textContent = 'Accept';

                const denyBtn = document.createElement('button');
                denyBtn.type = 'button';
                denyBtn.className = 'chat-roll-card__btn chat-roll-card__btn--deny';
                denyBtn.textContent = 'Deny';

                const buttons = [acceptBtn, denyBtn];

                acceptBtn.addEventListener('click', () => {
                    handleProjectRollDecision(message, 'accepted', buttons);
                });

                denyBtn.addEventListener('click', () => {
                    handleProjectRollDecision(message, 'denied', buttons);
                });

                actions.appendChild(acceptBtn);
                actions.appendChild(denyBtn);
                card.appendChild(actions);
            } else {
                card.appendChild(statusLabel);
            }

            return card;
        }

        function createMessageElement(message) {
            const wrapper = document.createElement('div');
            wrapper.className = 'chat-message';

            const messageType = normalizeMessageType(message.type);

            if (message.user === currentUser && messageType !== 'project_roll') {
                wrapper.classList.add('chat-message--self');
            }

            if (message.pending) {
                wrapper.classList.add('chat-message--pending');
            }

            if (message.error) {
                wrapper.classList.add('chat-message--error');
            }

            if (messageType === 'dice_roll') {
                wrapper.classList.add('chat-message--dice-roll');
            }

            if (messageType === 'project_roll') {
                const status = (message.payload && message.payload.status) ? message.payload.status.toLowerCase() : 'pending';
                wrapper.classList.add('chat-message--project-roll');
                wrapper.classList.add(`chat-message--project-roll-${status}`);
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

            if (messageType === 'dice_roll') {
                body.appendChild(createDiceRollCard(message));
            } else if (messageType === 'project_roll') {
                body.appendChild(createProjectRollCard(message));
            } else if (message.imageUrl) {
                body.classList.add('chat-message__text--image');

                const imageLink = document.createElement('a');
                imageLink.href = message.imageUrl;
                imageLink.target = '_blank';
                imageLink.rel = 'noopener noreferrer';
                imageLink.className = 'chat-message__image-link';

                const image = document.createElement('img');
                image.className = 'chat-message__image';
                image.src = message.imageUrl;
                image.alt = message.message || 'Shared image';
                image.loading = 'eager';

                const handleImageInteraction = (event) => {
                    event.preventDefault();
                    openImageLightbox(message.imageUrl, image.alt, message.message);
                };

                image.addEventListener('click', handleImageInteraction);
                imageLink.addEventListener('click', handleImageInteraction);

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

        function updateMessageFromServer(serverMessage) {
            if (!serverMessage || !serverMessage.id) {
                return;
            }

            const index = messages.findIndex((msg) => msg.id === serverMessage.id);
            if (index !== -1) {
                const existing = messages[index] || {};
                messages[index] = Object.assign({}, existing, serverMessage, { pending: false, error: false });
            } else {
                messages.push(Object.assign({ pending: false, error: false }, serverMessage));
            }

            trimMessages();
            renderMessages();
        }

        async function handleProjectRollDecision(message, status, buttons) {
            if (!message || !message.id) {
                return;
            }

            const previousStatus = message.payload && message.payload.status ? message.payload.status : 'pending';
            if (previousStatus === status) {
                return;
            }

            const controls = Array.isArray(buttons) ? buttons : [];
            controls.forEach((btn) => {
                if (btn) {
                    btn.disabled = true;
                }
            });

            const deriveAwardFromPayload = (payload) => {
                if (!payload || typeof payload !== 'object') {
                    return null;
                }

                const characterId = typeof payload.characterId === 'string' ? payload.characterId : '';
                const projectIndexRaw = payload.projectIndex;
                const totalRaw = payload.total;
                const projectIndex = Number.isInteger(projectIndexRaw) ? projectIndexRaw : parseInt(projectIndexRaw, 10);
                const delta = Number.isInteger(totalRaw) ? totalRaw : parseInt(totalRaw, 10);

                if (!characterId || Number.isNaN(projectIndex) || Number.isNaN(delta)) {
                    return null;
                }

                let newPoints = delta;
                if (typeof window.currentCharacter === 'string'
                    && characterId === window.currentCharacter
                    && window.characterData
                    && Array.isArray(window.characterData.projects)
                    && window.characterData.projects[projectIndex]) {
                    const project = window.characterData.projects[projectIndex];
                    const currentValue = parseInt(project.points_earned, 10) || 0;
                    newPoints = currentValue + delta;
                }

                return {
                    character: characterId,
                    projectIndex,
                    delta,
                    newPoints
                };
            };

            try {
                const params = new URLSearchParams();
                params.append('action', 'chat_update_roll');
                params.append('messageId', message.id);
                params.append('status', status);

                const response = await fetch('chat_handler.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: params.toString()
                });

                if (!response.ok) {
                    throw new Error('Failed to update roll');
                }

                const data = await response.json();
                if (!data || !data.success || !data.message) {
                    throw new Error(data && data.error ? data.error : 'Failed to update roll');
                }

                updateMessageFromServer(data.message);

                if (status === 'accepted' && typeof window.handleAcceptedProjectRoll === 'function') {
                    let awardPayload = null;
                    if (data.award && typeof data.award === 'object') {
                        awardPayload = data.award;
                    } else if (data.message && data.message.payload) {
                        awardPayload = deriveAwardFromPayload(data.message.payload);
                    }

                    if (awardPayload) {
                        window.handleAcceptedProjectRoll(awardPayload);
                    }
                }

                const toastMessage = status === 'accepted' ? 'Project roll accepted' : status === 'denied' ? 'Project roll denied' : 'Project roll updated';
                showChatToast(toastMessage, 'success');
            } catch (error) {
                controls.forEach((btn) => {
                    if (btn) {
                        btn.disabled = false;
                    }
                });
                showChatToast(error.message || 'Failed to update roll', 'error');
            }
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
                messages.splice(index, 1);
            }

            updateMessageFromServer(serverMessage);
        }

        function markMessageError(tempId) {
            const index = messages.findIndex((message) => message.id === tempId);
            if (index !== -1) {
                messages[index].pending = false;
                messages[index].error = true;
                renderMessages();
            }
        }

        async function sendChatMessage({ message = '', imageUrl = '', type = 'text', payload = null }) {
            const text = typeof message === 'string' ? message.trim() : '';
            const image = typeof imageUrl === 'string' ? imageUrl.trim() : '';
            const normalizedType = typeof type === 'string' && type.trim() !== '' ? type.trim() : 'text';
            const payloadObject = payload && typeof payload === 'object' ? payload : null;

            if (text === '' && image === '' && !payloadObject) {
                return false;
            }

            const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const optimisticMessage = {
                id: tempId,
                timestamp: new Date().toISOString(),
                user: currentUser || 'You',
                message: text,
                type: normalizedType,
                pending: true,
                error: false
            };

            if (image) {
                optimisticMessage.imageUrl = image;
            }

            if (payloadObject) {
                try {
                    optimisticMessage.payload = JSON.parse(JSON.stringify(payloadObject));
                } catch (error) {
                    optimisticMessage.payload = payloadObject;
                }
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
                if (normalizedType !== 'text' || payloadObject) {
                    params.append('type', normalizedType);
                }
                if (payloadObject) {
                    try {
                        params.append('payload', JSON.stringify(payloadObject));
                    } catch (error) {
                        // Ignore serialization error
                    }
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

        window.dashboardChat = {
            sendMessage: sendChatMessage,
            updateFromServer: updateMessageFromServer,
            isGM,
            getMessages() {
                return [...messages];
            }
        };
    }

    window.initChatPanel = initChatPanel;
})();
