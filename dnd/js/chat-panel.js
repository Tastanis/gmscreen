(function () {
    const FETCH_INTERVAL_MS = 2500;
    const MAX_MESSAGES = 100;
    let escapeListenerAttached = false;
    const CHAT_ENDPOINT = (typeof window !== 'undefined' && window.chatHandlerUrl)
        ? window.chatHandlerUrl
        : 'chat_handler.php';

    function initChatPanel(isGM, currentUser) {
        const panel = document.getElementById('chat-panel');
        const toggleButton = document.getElementById('chat-panel-toggle');
        const closeButton = document.getElementById('chat-panel-close');
        const messageList = document.getElementById('chat-message-list');
        const form = document.getElementById('chat-input-form');
        const textarea = document.getElementById('chat-input');
        const sendButton = document.getElementById('chat-send-btn');
        const clearButton = document.getElementById('chat-clear-btn');
        const dropTarget = document.getElementById('chat-drop-target');
        const whisperContainer = document.getElementById('chat-whisper-targets');
        const whisperPopoutHost = document.getElementById('chat-whisper-popouts');
        const whisperAlertHost = document.getElementById('chat-whisper-alerts');
        const sceneDisplay = document.getElementById('scene-display');
        const sceneMap = document.getElementById('scene-map');

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
        const participants = Array.isArray(window.chatParticipants) ? window.chatParticipants.filter(Boolean) : [];
        const participantLookup = new Map();
        participants.forEach((participant) => {
            if (!participant || typeof participant.id !== 'string') {
                return;
            }
            const id = participant.id;
            const label = typeof participant.label === 'string' && participant.label.trim() !== ''
                ? participant.label
                : id;
            participantLookup.set(id, label);
        });
        const MAX_WHISPER_MESSAGES = 5;
        const whisperPopouts = new Map();
        const whisperMessages = new Map();
        const whisperButtons = new Map();
        const unreadWhispers = new Set();
        let whisperAudioContext = null;
        let hasCompletedInitialFetch = false;
        let whisperPopoutZIndex = 1600;
        let whisperPopoutStackOffset = 0;
        let activeWhisperDrag = null;

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

        function getParticipantLabel(id) {
            return participantLookup.get(id) || id || '';
        }

        function getWhisperTargets() {
            return participants.filter((participant) => {
                if (!participant || typeof participant.id !== 'string') {
                    return false;
                }
                return participant.id !== currentUser;
            });
        }

        function ensureWhisperStore(targetId) {
            if (!whisperMessages.has(targetId)) {
                whisperMessages.set(targetId, []);
            }
            return whisperMessages.get(targetId);
        }

        function isWhisperPopoutOpen(targetId) {
            const popout = whisperPopouts.get(targetId);
            return Boolean(popout && popout.element && popout.element.classList.contains('chat-whisper-popout--open'));
        }

        function setWhisperButtonUnread(targetId, state) {
            const button = whisperButtons.get(targetId);
            if (!button) {
                if (!state) {
                    unreadWhispers.delete(targetId);
                } else {
                    unreadWhispers.add(targetId);
                }
                return;
            }

            if (state) {
                unreadWhispers.add(targetId);
                button.classList.add('chat-whisper-btn--unread');
                button.setAttribute('data-unread', 'true');
            } else {
                unreadWhispers.delete(targetId);
                button.classList.remove('chat-whisper-btn--unread');
                button.removeAttribute('data-unread');
            }
        }

        function renderWhisperButtons() {
            if (!whisperContainer) {
                return;
            }

            const targets = getWhisperTargets();
            whisperContainer.innerHTML = '';
            whisperButtons.clear();

            if (targets.length === 0) {
                whisperContainer.hidden = true;
                return;
            }

            whisperContainer.hidden = false;

            targets.forEach((participant) => {
                if (!participant || typeof participant.id !== 'string') {
                    return;
                }

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'chat-whisper-btn';
                button.textContent = getParticipantLabel(participant.id);
                button.addEventListener('click', () => {
                    openWhisperPopout(participant.id);
                });
                whisperButtons.set(participant.id, button);
                if (unreadWhispers.has(participant.id)) {
                    button.classList.add('chat-whisper-btn--unread');
                    button.setAttribute('data-unread', 'true');
                }
                whisperContainer.appendChild(button);
            });
        }

        function bringWhisperPopoutToFront(popoutData) {
            if (!popoutData || !popoutData.element) {
                return;
            }
            whisperPopoutZIndex += 1;
            popoutData.element.style.zIndex = String(whisperPopoutZIndex);
        }

        function setWhisperPopoutPosition(popoutData, left, top) {
            if (!popoutData || !popoutData.element) {
                return;
            }

            const element = popoutData.element;
            const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);
            const clampedLeft = Math.min(Math.max(left, 0), maxLeft);
            const clampedTop = Math.min(Math.max(top, 0), maxTop);

            element.style.left = `${clampedLeft}px`;
            element.style.top = `${clampedTop}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
            popoutData.position = { left: clampedLeft, top: clampedTop };
        }

        function initializeWhisperPopoutPosition(popoutData) {
            if (!popoutData || !popoutData.element) {
                return;
            }

            window.requestAnimationFrame(() => {
                if (!popoutData || !popoutData.element) {
                    return;
                }

                const existing = popoutData.position;
                if (existing) {
                    setWhisperPopoutPosition(popoutData, existing.left, existing.top);
                    return;
                }

                const element = popoutData.element;
                const defaultLeft = 24 + (whisperPopoutStackOffset % 3) * 24;
                const defaultTop = Math.max(
                    24,
                    window.innerHeight - element.offsetHeight - 24 - whisperPopoutStackOffset
                );
                whisperPopoutStackOffset = (whisperPopoutStackOffset + 48) % 240;
                setWhisperPopoutPosition(popoutData, defaultLeft, defaultTop);
            });
        }

        function initializeWhisperPopoutDrag(popoutData, dragHandle) {
            if (!popoutData || !popoutData.element || !dragHandle) {
                return;
            }

            dragHandle.addEventListener('pointerdown', (event) => {
                if (event.button !== undefined && event.button !== 0) {
                    return;
                }
                if (event.target && event.target.closest('.chat-whisper-popout__close')) {
                    return;
                }
                event.preventDefault();
                if (typeof dragHandle.setPointerCapture === 'function') {
                    dragHandle.setPointerCapture(event.pointerId);
                }
                const rect = popoutData.element.getBoundingClientRect();
                activeWhisperDrag = {
                    popoutData,
                    pointerId: event.pointerId,
                    offsetX: event.clientX - rect.left,
                    offsetY: event.clientY - rect.top
                };
                bringWhisperPopoutToFront(popoutData);
            });

            dragHandle.addEventListener('pointermove', (event) => {
                if (!activeWhisperDrag || event.pointerId !== activeWhisperDrag.pointerId) {
                    return;
                }
                event.preventDefault();
                const left = event.clientX - activeWhisperDrag.offsetX;
                const top = event.clientY - activeWhisperDrag.offsetY;
                setWhisperPopoutPosition(activeWhisperDrag.popoutData, left, top);
            });

            function endDrag(event) {
                if (!activeWhisperDrag || event.pointerId !== activeWhisperDrag.pointerId) {
                    return;
                }
                if (typeof dragHandle.releasePointerCapture === 'function') {
                    try {
                        dragHandle.releasePointerCapture(event.pointerId);
                    } catch (error) {
                        // Ignore failures when the pointer was not captured.
                    }
                }
                activeWhisperDrag = null;
            }

            dragHandle.addEventListener('pointerup', endDrag);
            dragHandle.addEventListener('pointercancel', endDrag);
            dragHandle.addEventListener('lostpointercapture', () => {
                activeWhisperDrag = null;
            });
        }

        window.addEventListener('resize', () => {
            whisperPopouts.forEach((popoutData) => {
                if (!popoutData || !popoutData.element || !popoutData.position) {
                    return;
                }
                setWhisperPopoutPosition(popoutData, popoutData.position.left, popoutData.position.top);
            });
        });

        function createWhisperPopout(targetId) {
            if (!whisperPopoutHost) {
                return null;
            }

            const popout = document.createElement('div');
            popout.className = 'chat-whisper-popout';
            popout.setAttribute('role', 'dialog');
            popout.setAttribute('aria-live', 'polite');
            popout.setAttribute('aria-modal', 'false');
            popout.setAttribute('aria-hidden', 'true');
            popout.dataset.target = targetId;

            const header = document.createElement('div');
            header.className = 'chat-whisper-popout__header';

            const title = document.createElement('h4');
            title.className = 'chat-whisper-popout__title';
            title.textContent = `Whisper with ${getParticipantLabel(targetId)}`;

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'chat-whisper-popout__close';
            closeBtn.setAttribute('aria-label', 'Close whisper window');
            closeBtn.innerHTML = '&times;';

            header.appendChild(title);
            header.appendChild(closeBtn);

            const messagesContainer = document.createElement('div');
            messagesContainer.className = 'chat-whisper-popout__messages';

            const formElement = document.createElement('form');
            formElement.className = 'chat-whisper-popout__form';
            formElement.noValidate = true;

            const textareaElement = document.createElement('textarea');
            textareaElement.className = 'chat-whisper-popout__textarea';
            textareaElement.rows = 3;
            textareaElement.placeholder = `Send a whisper to ${getParticipantLabel(targetId)}...`;

            const controls = document.createElement('div');
            controls.className = 'chat-whisper-popout__controls';

            const imageBtn = document.createElement('button');
            imageBtn.type = 'button';
            imageBtn.className = 'chat-whisper-popout__attach';
            imageBtn.textContent = 'Add Image';
            imageBtn.setAttribute('aria-label', 'Attach image to whisper');

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.hidden = true;
            fileInput.setAttribute('aria-hidden', 'true');
            fileInput.tabIndex = -1;

            const sendBtn = document.createElement('button');
            sendBtn.type = 'submit';
            sendBtn.className = 'chat-whisper-popout__send';
            sendBtn.textContent = 'Send Whisper';

            imageBtn.addEventListener('click', () => {
                fileInput.value = '';
                fileInput.click();
            });

            fileInput.addEventListener('change', async () => {
                const [file] = fileInput.files || [];
                if (!file) {
                    return;
                }
                const popoutData = whisperPopouts.get(targetId);
                await handleWhisperImageUpload(targetId, file, popoutData);
                fileInput.value = '';
            });

            controls.appendChild(imageBtn);
            controls.appendChild(sendBtn);
            formElement.appendChild(textareaElement);
            formElement.appendChild(controls);
            formElement.appendChild(fileInput);

            formElement.addEventListener('submit', (event) => {
                event.preventDefault();
                handleWhisperSubmit(targetId, textareaElement, sendBtn);
            });

            textareaElement.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    formElement.requestSubmit();
                }
            });

            closeBtn.addEventListener('click', () => {
                closeWhisperPopout(targetId);
            });

            popout.appendChild(header);
            popout.appendChild(messagesContainer);
            popout.appendChild(formElement);

            whisperPopoutHost.appendChild(popout);

            const popoutData = {
                element: popout,
                messageContainer: messagesContainer,
                textarea: textareaElement,
                sendButton: sendBtn,
                imageButton: imageBtn,
                fileInput,
                position: null
            };
            whisperPopouts.set(targetId, popoutData);
            initializeWhisperPopoutDrag(popoutData, header);
            initializeWhisperPopoutPosition(popoutData);
            popout.addEventListener('pointerdown', () => {
                bringWhisperPopoutToFront(popoutData);
            });
            popout.addEventListener('focusin', () => {
                bringWhisperPopoutToFront(popoutData);
            });
            return popoutData;
        }

        function openWhisperPopout(targetId) {
            let popout = whisperPopouts.get(targetId);
            if (!popout) {
                popout = createWhisperPopout(targetId);
            }

            if (!popout || !popout.element) {
                return;
            }

            popout.element.classList.add('chat-whisper-popout--open');
            popout.element.setAttribute('aria-hidden', 'false');
            initializeWhisperPopoutPosition(popout);
            bringWhisperPopoutToFront(popout);
            setWhisperButtonUnread(targetId, false);
            renderWhisperMessages(targetId);
            window.setTimeout(() => {
                popout.textarea.focus();
            }, 10);
        }

        function closeWhisperPopout(targetId) {
            const popout = whisperPopouts.get(targetId);
            if (!popout || !popout.element) {
                return;
            }

            popout.element.classList.remove('chat-whisper-popout--open');
            popout.element.setAttribute('aria-hidden', 'true');
        }

        function normalizeWhisperMessage(message, overrides = {}) {
            if (!message || typeof message !== 'object') {
                return null;
            }

            const sender = typeof message.user === 'string' ? message.user : '';
            const target = typeof message.target === 'string' ? message.target : '';
            const direction = sender === currentUser ? 'outgoing' : 'incoming';

            return {
                id: typeof message.id === 'string' ? message.id : '',
                timestamp: typeof message.timestamp === 'string' && message.timestamp !== ''
                    ? message.timestamp
                    : new Date().toISOString(),
                message: typeof message.message === 'string' ? message.message : '',
                imageUrl: typeof message.imageUrl === 'string' ? message.imageUrl : '',
                user: sender,
                target,
                direction,
                pending: overrides.pending !== undefined ? overrides.pending : Boolean(message.pending),
                error: overrides.error !== undefined ? overrides.error : Boolean(message.error)
            };
        }

        function deriveWhisperPartner(message) {
            if (!message || typeof message !== 'object') {
                return '';
            }

            const sender = typeof message.user === 'string' ? message.user : '';
            const target = typeof message.target === 'string' ? message.target : '';

            if (sender === currentUser && target !== '') {
                return target;
            }

            if (target === currentUser && sender !== '') {
                return sender;
            }

            return '';
        }

        function renderWhisperMessages(targetId) {
            const popout = whisperPopouts.get(targetId);
            if (!popout || !popout.messageContainer) {
                return;
            }

            const store = ensureWhisperStore(targetId);
            const sorted = [...store].sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeA - timeB;
            });

            popout.messageContainer.innerHTML = '';

            sorted.forEach((message) => {
                const item = document.createElement('div');
                item.className = 'chat-whisper-popout__message';
                if (message.direction === 'outgoing') {
                    item.classList.add('chat-whisper-popout__message--outgoing');
                }
                if (message.pending) {
                    item.classList.add('chat-whisper-popout__message--pending');
                }
                if (message.error) {
                    item.classList.add('chat-whisper-popout__message--error');
                }

                const meta = document.createElement('div');
                meta.className = 'chat-whisper-popout__meta';

                const author = document.createElement('span');
                author.textContent = message.direction === 'outgoing' ? 'You' : getParticipantLabel(message.user);

                const timestamp = document.createElement('span');
                if (message.pending) {
                    timestamp.textContent = 'Sending…';
                } else if (message.error) {
                    timestamp.textContent = 'Failed';
                } else {
                    timestamp.textContent = formatTimestamp(message.timestamp);
                }

                meta.appendChild(author);
                meta.appendChild(timestamp);

                const body = document.createElement('div');
                body.className = 'chat-whisper-popout__body';

                if (message.message) {
                    const text = document.createElement('div');
                    text.className = 'chat-whisper-popout__text';
                    text.textContent = message.message;
                    body.appendChild(text);
                }

                if (message.imageUrl) {
                    const imageWrapper = document.createElement('div');
                    imageWrapper.className = 'chat-whisper-popout__image';

                    const imageButton = document.createElement('button');
                    imageButton.type = 'button';
                    imageButton.className = 'chat-whisper-popout__thumbnail-button';

                    const image = document.createElement('img');
                    image.className = 'chat-whisper-popout__thumbnail';
                    image.src = message.imageUrl;
                    image.alt = message.message || 'Shared image';
                    image.loading = 'lazy';

                    const handlePreview = (event) => {
                        event.preventDefault();
                        openImageLightbox(message.imageUrl, image.alt, message.message);
                    };

                    imageButton.addEventListener('click', handlePreview);
                    image.addEventListener('click', handlePreview);

                    imageButton.appendChild(image);
                    imageWrapper.appendChild(imageButton);
                    body.appendChild(imageWrapper);
                }

                if (!message.message && !message.imageUrl) {
                    const text = document.createElement('div');
                    text.className = 'chat-whisper-popout__text';
                    text.textContent = '';
                    body.appendChild(text);
                }

                item.appendChild(meta);
                item.appendChild(body);

                popout.messageContainer.appendChild(item);
            });

            popout.messageContainer.scrollTop = popout.messageContainer.scrollHeight;
        }

        function addOptimisticWhisper(targetId, message) {
            const normalized = normalizeWhisperMessage(message, { pending: true, error: false });
            if (!normalized) {
                return;
            }

            const store = ensureWhisperStore(targetId);
            store.push(normalized);
            if (store.length > MAX_WHISPER_MESSAGES) {
                store.splice(0, store.length - MAX_WHISPER_MESSAGES);
            }
            renderWhisperMessages(targetId);
        }

        function resolveWhisperMessage(targetId, tempId, serverMessage) {
            const normalized = normalizeWhisperMessage(serverMessage, { pending: false, error: false });
            if (!normalized) {
                return;
            }

            const store = ensureWhisperStore(targetId);
            const index = store.findIndex((entry) => entry.id === tempId);
            if (index !== -1) {
                store[index] = normalized;
            } else {
                store.push(normalized);
            }

            store.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
            if (store.length > MAX_WHISPER_MESSAGES) {
                store.splice(0, store.length - MAX_WHISPER_MESSAGES);
            }

            renderWhisperMessages(targetId);
        }

        function markWhisperMessageError(targetId, tempId) {
            const store = ensureWhisperStore(targetId);
            const index = store.findIndex((entry) => entry.id === tempId);
            if (index === -1) {
                return;
            }

            store[index] = Object.assign({}, store[index], {
                pending: false,
                error: true
            });
            renderWhisperMessages(targetId);
        }

        function playWhisperSound() {
            try {
                if (!whisperAudioContext) {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    if (!AudioContextClass) {
                        return;
                    }
                    whisperAudioContext = new AudioContextClass();
                }

                if (whisperAudioContext.state === 'suspended') {
                    whisperAudioContext.resume().catch(() => {});
                }

                const context = whisperAudioContext;
                const oscillator = context.createOscillator();
                const gain = context.createGain();

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(880, context.currentTime);

                gain.gain.setValueAtTime(0.0001, context.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);

                oscillator.connect(gain);
                gain.connect(context.destination);

                oscillator.start();
                oscillator.stop(context.currentTime + 0.45);
            } catch (error) {
                // Ignore audio errors silently
            }
        }

        function showWhisperAlert(message) {
            if (!whisperAlertHost) {
                return;
            }

            const alert = document.createElement('div');
            alert.className = 'chat-whisper-alert';

            const title = document.createElement('div');
            title.className = 'chat-whisper-alert__title';
            title.textContent = `Whisper from ${getParticipantLabel(message.user)}`;

            const body = document.createElement('div');
            body.className = 'chat-whisper-alert__body';
            const alertText = message.message
                ? message.message
                : (message.imageUrl ? 'Sent an image' : '');
            body.textContent = alertText;

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'chat-whisper-alert__close';
            closeBtn.setAttribute('aria-label', 'Dismiss whisper alert');
            closeBtn.innerHTML = '&times;';

            const removeAlert = () => {
                if (!alert.parentElement) {
                    return;
                }
                alert.parentElement.removeChild(alert);
            };

            closeBtn.addEventListener('click', removeAlert);

            alert.appendChild(closeBtn);
            alert.appendChild(title);
            alert.appendChild(body);

            whisperAlertHost.appendChild(alert);

            window.setTimeout(removeAlert, 6500);
        }

        function handleIncomingWhisper(serverMessage, { notify = true } = {}) {
            const partnerId = deriveWhisperPartner(serverMessage);
            if (!partnerId) {
                return;
            }

            const normalized = normalizeWhisperMessage(serverMessage, { pending: false, error: false });
            if (!normalized) {
                return;
            }

            const store = ensureWhisperStore(partnerId);
            const existingIndex = normalized.id ? store.findIndex((entry) => entry.id === normalized.id) : -1;
            const wasPending = existingIndex !== -1 ? Boolean(store[existingIndex].pending) : false;

            if (existingIndex !== -1) {
                store[existingIndex] = normalized;
            } else {
                store.push(normalized);
            }

            store.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
            if (store.length > MAX_WHISPER_MESSAGES) {
                store.splice(0, store.length - MAX_WHISPER_MESSAGES);
            }

            if (normalized.direction === 'incoming' && notify) {
                const isNewMessage = existingIndex === -1 || wasPending;
                if (isNewMessage) {
                    openWhisperPopout(partnerId);
                    if (!isWhisperPopoutOpen(partnerId)) {
                        setWhisperButtonUnread(partnerId, true);
                    }
                    showWhisperAlert(normalized);
                    playWhisperSound();
                } else if (!isWhisperPopoutOpen(partnerId)) {
                    setWhisperButtonUnread(partnerId, true);
                }
            }

            renderWhisperMessages(partnerId);
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
            const messageType = normalizeMessageType(message.type);

            if (messageType === 'whisper') {
                return null;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'chat-message';

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

            const messageType = normalizeMessageType(serverMessage.type);
            if (messageType === 'whisper') {
                handleIncomingWhisper(serverMessage, { notify: serverMessage.user !== currentUser });
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

                const response = await fetch(CHAT_ENDPOINT, {
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
                const element = createMessageElement(message);
                if (element) {
                    messageList.appendChild(element);
                }
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
                hasCompletedInitialFetch = true;
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

                const messageType = normalizeMessageType(message.type);
                if (messageType === 'whisper') {
                    const shouldNotify = hasCompletedInitialFetch && message.user !== currentUser;
                    handleIncomingWhisper(message, { notify: shouldNotify });
                    continue;
                }

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

            hasCompletedInitialFetch = true;
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

                const response = await fetch(CHAT_ENDPOINT, {
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

        async function requestChatClear() {
            if (!isGM) {
                throw new Error('Only the GM can clear the chat.');
            }

            const params = new URLSearchParams();
            params.append('action', 'chat_clear');

            const response = await fetch(CHAT_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            if (!response.ok) {
                throw new Error('Failed to clear chat history.');
            }

            const data = await response.json();
            if (!data || !data.success) {
                throw new Error((data && data.error) || 'Failed to clear chat history.');
            }

            messages = [];
            latestServerTimestamp = '';
            if (messageList && messageList.dataset) {
                messageList.dataset.initialMessages = '[]';
            }

            renderMessages();
            showChatToast('Chat history cleared.', 'success');
            return true;
        }

        async function handleWhisperSubmit(targetId, textareaElement, sendBtn) {
            if (!textareaElement) {
                return;
            }

            const text = textareaElement.value.trim();
            if (text === '') {
                return;
            }

            textareaElement.value = '';
            if (sendBtn) {
                sendBtn.disabled = true;
            }

            let tempId = null;

            try {
                const result = await sendChatMessage({
                    message: text,
                    type: 'whisper',
                    target: targetId,
                    onOptimistic: (optimisticMessage) => {
                        tempId = optimisticMessage && optimisticMessage.id ? optimisticMessage.id : null;
                        addOptimisticWhisper(targetId, optimisticMessage);
                    },
                    onSuccess: (serverMessage) => {
                        if (tempId) {
                            resolveWhisperMessage(targetId, tempId, serverMessage);
                        } else {
                            handleIncomingWhisper(serverMessage, { notify: false });
                        }
                    },
                    onError: () => {
                        if (tempId) {
                            markWhisperMessageError(targetId, tempId);
                        }
                    }
                });

                if (!result && tempId) {
                    markWhisperMessageError(targetId, tempId);
                }
            } catch (error) {
                if (tempId) {
                    markWhisperMessageError(targetId, tempId);
                }
                showChatToast('Failed to send whisper', 'error');
            } finally {
                if (sendBtn) {
                    sendBtn.disabled = false;
                }
                textareaElement.focus();
            }
        }

        async function handleWhisperImageUpload(targetId, file, popoutData = null) {
            if (!file) {
                return;
            }

            if (!targetId || typeof targetId !== 'string') {
                showChatToast('Invalid whisper target', 'error');
                return;
            }

            if (!isImageFile(file)) {
                showChatToast('Only image files can be sent via whisper.', 'error');
                return;
            }

            const textareaElement = popoutData && popoutData.textarea ? popoutData.textarea : null;
            const sendBtn = popoutData && popoutData.sendButton ? popoutData.sendButton : null;
            const imageBtn = popoutData && popoutData.imageButton ? popoutData.imageButton : null;

            const previousSendDisabled = sendBtn ? sendBtn.disabled : false;
            const previousImageDisabled = imageBtn ? imageBtn.disabled : false;

            if (sendBtn) {
                sendBtn.disabled = true;
            }
            if (imageBtn) {
                imageBtn.disabled = true;
            }

            const caption = textareaElement ? textareaElement.value.trim() : '';

            try {
                await uploadFileForChat(file, { type: 'whisper', target: targetId, caption });
                if (textareaElement) {
                    textareaElement.value = '';
                }
            } catch (error) {
                const errorMessage = error && error.message ? error.message : 'Failed to send image';
                showChatToast(errorMessage, 'error');
            } finally {
                if (sendBtn) {
                    sendBtn.disabled = previousSendDisabled;
                }
                if (imageBtn) {
                    imageBtn.disabled = previousImageDisabled;
                }
                if (textareaElement) {
                    textareaElement.focus();
                }
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

        async function sendChatMessage({ message = '', imageUrl = '', type = 'text', payload = null, target = '', onOptimistic = null, onSuccess = null, onError = null }) {
            const text = typeof message === 'string' ? message.trim() : '';
            const image = typeof imageUrl === 'string' ? imageUrl.trim() : '';
            const normalizedType = typeof type === 'string' && type.trim() !== '' ? type.trim() : 'text';
            const payloadObject = payload && typeof payload === 'object' ? payload : null;
            const normalizedTarget = typeof target === 'string' ? target.trim() : '';
            const isWhisper = normalizedType === 'whisper';

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

            if (isWhisper) {
                if (normalizedTarget === '') {
                    return false;
                }
                optimisticMessage.target = normalizedTarget;
                if (typeof onOptimistic === 'function') {
                    onOptimistic(optimisticMessage);
                } else {
                    addOptimisticWhisper(normalizedTarget, optimisticMessage);
                }
            } else {
                messages.push(optimisticMessage);
                trimMessages();
                renderMessages();
            }

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
                if (isWhisper && normalizedTarget !== '') {
                    params.append('target', normalizedTarget);
                }

                const response = await fetch(CHAT_ENDPOINT, {
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
                    updateLatestTimestamp(data.message.timestamp);
                    if (isWhisper) {
                        if (typeof onSuccess === 'function') {
                            onSuccess(data.message);
                        } else {
                            resolveWhisperMessage(normalizedTarget, tempId, data.message);
                        }
                    } else {
                        resolvePendingMessage(tempId, data.message);
                    }
                    return true;
                }

                if (isWhisper) {
                    if (typeof onError === 'function') {
                        onError(data && data.error ? data.error : null);
                    }
                    markWhisperMessageError(normalizedTarget, tempId);
                } else {
                    markMessageError(tempId);
                }
                showChatToast(data && data.error ? data.error : 'Failed to send message', 'error');
            } catch (error) {
                if (isWhisper) {
                    if (typeof onError === 'function') {
                        onError(error);
                    }
                    markWhisperMessageError(normalizedTarget, tempId);
                } else {
                    markMessageError(tempId);
                }
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
            const hasSupportedType = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain');
            if (!hasSupportedType) {
                return false;
            }
            if (isDragOverScene(event)) {
                return false;
            }
            return true;
        }

        function isDragOverScene(event) {
            if (isEventWithinElement(event, sceneMap)) {
                return true;
            }
            if (!sceneMap && isEventWithinElement(event, sceneDisplay)) {
                return true;
            }
            return false;
        }

        function isEventWithinElement(event, element) {
            if (!event || !element) {
                return false;
            }

            if (event.target instanceof Node && element.contains(event.target)) {
                return true;
            }

            if (typeof event.composedPath === 'function') {
                const path = event.composedPath();
                if (Array.isArray(path) && path.includes(element)) {
                    return true;
                }
            }

            if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
                const rect = element.getBoundingClientRect();
                const x = event.clientX;
                const y = event.clientY;
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return true;
                }
            }

            return false;
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

        async function uploadFileForChat(file, { type = 'text', target = '', caption = '' } = {}) {
            const formData = new FormData();
            formData.append('action', 'chat_upload');
            formData.append('file', file);

            const response = await fetch(CHAT_ENDPOINT, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to upload file');
            }

            const data = await response.json();
            if (data && data.success && data.url) {
                const normalizedType = typeof type === 'string' && type.trim() !== '' ? type.trim() : 'text';
                const normalizedTarget = typeof target === 'string' ? target.trim() : '';
                const normalizedCaption = typeof caption === 'string' ? caption.trim() : '';

                const payload = {
                    message: normalizedCaption !== '' ? normalizedCaption : (file.name || ''),
                    imageUrl: data.url
                };

                if (normalizedType !== 'text') {
                    payload.type = normalizedType;
                }

                if (normalizedType === 'whisper' && normalizedTarget !== '') {
                    payload.target = normalizedTarget;
                }

                const result = await sendChatMessage(payload);
                if (!result) {
                    throw new Error('Failed to send image');
                }
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
            } else {
                hideDropTarget();
            }
        });

        document.addEventListener('dragover', (event) => {
            if (shouldHandleDrag(event)) {
                event.preventDefault();
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'copy';
                }
            } else {
                hideDropTarget();
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

        if (isGM && clearButton) {
            clearButton.addEventListener('click', async () => {
                const confirmed = window.confirm('Are you sure you want to clear the entire chat history? This cannot be undone.');
                if (!confirmed) {
                    return;
                }

                clearButton.disabled = true;
                try {
                    await requestChatClear();
                } catch (error) {
                    showChatToast(error.message || 'Failed to clear chat history.', 'error');
                } finally {
                    clearButton.disabled = false;
                }
            });
        }

        renderWhisperButtons();

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
            clearHistory: requestChatClear,
            getMessages() {
                return [...messages];
            }
        };
    }

    window.initChatPanel = initChatPanel;
})();
