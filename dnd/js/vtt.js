(function () {
    const SCENE_POLL_INTERVAL_MS = 5000;

    function initVtt() {
        const config = window.vttConfig || {};
        const isGM = Boolean(config.isGM);
        const currentUser = typeof config.currentUser === 'string' ? config.currentUser : '';
        const scenes = Array.isArray(config.scenes) ? config.scenes : [];
        const sceneEndpoint = typeof config.sceneEndpoint === 'string' && config.sceneEndpoint.trim() !== ''
            ? config.sceneEndpoint
            : 'scenes_handler.php';
        const initialSceneId = typeof config.activeSceneId === 'string' ? config.activeSceneId : null;
        const initialScene = (config.activeScene && typeof config.activeScene === 'object') ? config.activeScene : null;

        if (typeof initChatPanel === 'function') {
            initChatPanel(isGM, currentUser);
        }

        initSettingsPanel({
            isGM,
            scenes,
            sceneEndpoint,
            initialSceneId,
            initialScene,
        });
    }

    function initSettingsPanel(options) {
        const config = Object.assign({
            isGM: false,
            scenes: [],
            sceneEndpoint: 'scenes_handler.php',
            initialSceneId: null,
            initialScene: null,
        }, options || {});

        const panel = document.getElementById('settings-panel');
        const toggleButton = document.getElementById('settings-panel-toggle');
        const closeButton = document.getElementById('settings-panel-close');
        const scenesToggle = document.getElementById('settings-scenes-toggle');
        const scenesList = document.getElementById('settings-scenes-list');
        const statusElement = document.getElementById('settings-scenes-status');
        const sceneDisplay = document.getElementById('scene-display');
        const sceneName = document.getElementById('scene-display-name');
        const sceneDescription = document.getElementById('scene-display-description');

        if (!panel || !toggleButton || !sceneDisplay || !sceneName || !sceneDescription) {
            return;
        }

        const sceneButtons = scenesList ? Array.from(scenesList.querySelectorAll('[data-scene-id]')) : [];
        const state = {
            isGM: Boolean(config.isGM),
            scenes: config.scenes.slice(),
            activeSceneId: config.initialSceneId,
            sceneEndpoint: config.sceneEndpoint,
            pendingRequest: null,
            pollingTimer: null,
            isFetching: false,
            initialSceneStyles: {
                background: sceneDisplay.style.background || '',
                borderColor: sceneDisplay.style.borderColor || '',
                boxShadow: sceneDisplay.style.boxShadow || '',
            },
        };

        let isPanelOpen = false;
        applySceneToDisplay(config.initialScene || getSceneById(state.scenes, state.activeSceneId), true);
        updateSceneButtons(state.activeSceneId);

        toggleButton.addEventListener('click', function () {
            if (isPanelOpen) {
                closePanel();
            } else {
                openPanel();
            }
        });

        if (closeButton) {
            closeButton.addEventListener('click', function () {
                closePanel();
                toggleButton.focus();
            });
        }

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && isPanelOpen) {
                closePanel();
                toggleButton.focus();
            }
        });

        if (scenesToggle && scenesList) {
            scenesToggle.addEventListener('click', function () {
                const expanded = scenesToggle.getAttribute('aria-expanded') === 'true';
                if (expanded) {
                    scenesToggle.setAttribute('aria-expanded', 'false');
                    scenesList.hidden = true;
                } else {
                    scenesToggle.setAttribute('aria-expanded', 'true');
                    scenesList.hidden = false;
                }
            });
        }

        if (state.isGM && sceneButtons.length > 0) {
            sceneButtons.forEach(function (button) {
                button.addEventListener('click', function () {
                    const sceneId = button.getAttribute('data-scene-id') || '';
                    if (!sceneId) {
                        return;
                    }

                    if (state.activeSceneId === sceneId) {
                        setStatus('Scene already active.', 'info');
                        return;
                    }

                    activateScene(sceneId);
                });
            });
        }

        startScenePolling();

        function openPanel() {
            panel.classList.add('settings-panel--open');
            panel.classList.remove('settings-panel--closed');
            panel.setAttribute('aria-hidden', 'false');
            toggleButton.setAttribute('aria-expanded', 'true');
            isPanelOpen = true;
        }

        function closePanel() {
            panel.classList.remove('settings-panel--open');
            panel.classList.add('settings-panel--closed');
            panel.setAttribute('aria-hidden', 'true');
            toggleButton.setAttribute('aria-expanded', 'false');
            isPanelOpen = false;
        }

        function setStatus(message, type) {
            if (!statusElement) {
                return;
            }

            statusElement.textContent = message || '';
            statusElement.dataset.state = type || '';
            statusElement.classList.toggle('settings-panel__status--error', type === 'error');
            statusElement.classList.toggle('settings-panel__status--success', type === 'success');
        }

        function activateScene(sceneId) {
            if (state.pendingRequest) {
                return;
            }

            const scene = getSceneById(state.scenes, sceneId);
            setStatus(scene ? `Activating “${scene.name}”…` : 'Activating scene…', 'info');

            state.pendingRequest = true;

            const body = new URLSearchParams({
                action: 'activate',
                scene_id: sceneId,
            });

            fetch(state.sceneEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json',
                },
                body,
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Server error');
                    }
                    return response.json();
                })
                .then((data) => {
                    if (!data || data.success !== true || !data.active_scene_id) {
                        throw new Error((data && data.error) || 'Unable to activate scene.');
                    }
                    state.activeSceneId = data.active_scene_id;
                    applySceneToDisplay(data.scene || getSceneById(state.scenes, data.active_scene_id));
                    updateSceneButtons(state.activeSceneId);
                    setStatus(data.scene && data.scene.name ? `Activated “${data.scene.name}.”` : 'Scene activated.', 'success');
                })
                .catch((error) => {
                    console.error(error);
                    setStatus('Unable to update the scene. Please try again.', 'error');
                })
                .finally(() => {
                    state.pendingRequest = false;
                });
        }

        function updateSceneButtons(activeSceneId) {
            if (!state.isGM || sceneButtons.length === 0) {
                return;
            }

            sceneButtons.forEach(function (button) {
                const buttonSceneId = button.getAttribute('data-scene-id');
                const isActive = buttonSceneId && buttonSceneId === activeSceneId;
                button.classList.toggle('scene-option--active', Boolean(isActive));
            });
        }

        function applySceneToDisplay(scene, skipStatus) {
            const fallbackDescription = 'When the GM activates a scene it will appear here for everyone at the table.';

            if (scene && typeof scene === 'object') {
                if (sceneName) {
                    sceneName.textContent = scene.name || 'Untitled Scene';
                }
                if (sceneDescription) {
                    sceneDescription.textContent = scene.description || fallbackDescription;
                }
                if (sceneDisplay) {
                    sceneDisplay.setAttribute('data-scene-id', scene.id || '');
                    if (scene.accent) {
                        applySceneAccent(scene.accent);
                        sceneDisplay.setAttribute('data-scene-accent', scene.accent);
                    } else {
                        resetSceneAccent();
                        sceneDisplay.removeAttribute('data-scene-accent');
                    }
                }
            } else {
                if (sceneName) {
                    sceneName.textContent = 'Waiting for the GM to pick a scene';
                }
                if (sceneDescription) {
                    sceneDescription.textContent = fallbackDescription;
                }
                resetSceneAccent();
                if (sceneDisplay) {
                    sceneDisplay.removeAttribute('data-scene-accent');
                    sceneDisplay.setAttribute('data-scene-id', '');
                }
            }

            if (!skipStatus) {
                setStatus('', '');
            }
        }

        function applySceneAccent(accentHex) {
            if (!sceneDisplay) {
                return;
            }

            const accent = typeof accentHex === 'string' ? accentHex.trim() : '';
            if (!accent) {
                resetSceneAccent();
                return;
            }

            sceneDisplay.style.borderColor = accent;
            sceneDisplay.style.boxShadow = `0 32px 88px ${hexToRgba(accent, 0.35)}`;
            sceneDisplay.style.background = `linear-gradient(135deg, ${hexToRgba(accent, 0.22)}, rgba(15, 23, 42, 0.92))`;
        }

        function resetSceneAccent() {
            if (!sceneDisplay) {
                return;
            }
            sceneDisplay.style.background = state.initialSceneStyles.background;
            sceneDisplay.style.borderColor = state.initialSceneStyles.borderColor;
            sceneDisplay.style.boxShadow = state.initialSceneStyles.boxShadow;
        }

        function startScenePolling() {
            if (state.pollingTimer !== null) {
                window.clearInterval(state.pollingTimer);
            }
            state.pollingTimer = window.setInterval(fetchActiveScene, SCENE_POLL_INTERVAL_MS);
            fetchActiveScene();
        }

        function fetchActiveScene() {
            if (state.isGM && state.pendingRequest) {
                return;
            }
            if (state.isFetching) {
                return;
            }
            state.isFetching = true;

            const requestUrl = buildSceneEndpointUrl(state.sceneEndpoint);

            fetch(requestUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch scene.');
                    }
                    return response.json();
                })
                .then((data) => {
                    if (!data || data.success !== true) {
                        throw new Error('Invalid scene response.');
                    }
                    if (typeof data.active_scene_id !== 'string') {
                        return;
                    }
                    if (state.activeSceneId !== data.active_scene_id) {
                        state.activeSceneId = data.active_scene_id;
                        applySceneToDisplay(data.scene || getSceneById(state.scenes, state.activeSceneId));
                        updateSceneButtons(state.activeSceneId);
                        if (statusElement && !state.isGM) {
                            statusElement.textContent = '';
                        }
                    } else if (data.scene) {
                        applySceneToDisplay(data.scene, true);
                    }
                })
                .catch((error) => {
                    if (statusElement && !state.isGM) {
                        statusElement.textContent = '';
                    }
                    if (window.console && typeof window.console.warn === 'function') {
                        console.warn('Scene polling error:', error);
                    }
                })
                .finally(() => {
                    state.isFetching = false;
                });
        }

        function buildSceneEndpointUrl(endpoint) {
            const baseEndpoint = typeof endpoint === 'string' && endpoint.trim() !== ''
                ? endpoint
                : 'scenes_handler.php';

            if (typeof URL === 'function') {
                try {
                    const url = new URL(baseEndpoint, window.location.href);
                    url.searchParams.set('action', 'get_active');
                    return url.toString();
                } catch (error) {
                    // fall back to manual concatenation below
                }
            }

            const separator = baseEndpoint.indexOf('?') >= 0 ? '&' : '?';
            return `${baseEndpoint}${separator}action=get_active`;
        }
    }

    function getSceneById(scenes, sceneId) {
        if (!Array.isArray(scenes) || !sceneId) {
            return null;
        }
        return scenes.find(function (scene) {
            return scene && typeof scene === 'object' && scene.id === sceneId;
        }) || null;
    }

    function hexToRgba(hex, alpha) {
        const trimmed = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : '';
        if (trimmed.length === 3) {
            const r = trimmed[0];
            const g = trimmed[1];
            const b = trimmed[2];
            return `rgba(${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}, ${typeof alpha === 'number' ? alpha : 1})`;
        }
        if (trimmed.length === 6) {
            const r = parseInt(trimmed.slice(0, 2), 16);
            const g = parseInt(trimmed.slice(2, 4), 16);
            const b = parseInt(trimmed.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${typeof alpha === 'number' ? alpha : 1})`;
        }
        return `rgba(56, 189, 248, ${typeof alpha === 'number' ? alpha : 1})`;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVtt);
    } else {
        initVtt();
    }
})();
