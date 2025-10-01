(function () {
    const SCENE_POLL_INTERVAL_MS = 5000;

    function initVtt() {
        const config = window.vttConfig || {};
        const isGM = Boolean(config.isGM);
        const currentUser = typeof config.currentUser === 'string' ? config.currentUser : '';
        const scenes = Array.isArray(config.scenes) ? config.scenes : [];
        const sceneData = isPlainObject(config.sceneData) ? config.sceneData : { folders: [], rootScenes: [] };
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
            sceneData,
            sceneEndpoint,
            initialSceneId,
            initialScene,
        });
    }

    function initSettingsPanel(options) {
        const config = Object.assign({
            isGM: false,
            scenes: [],
            sceneData: { folders: [], rootScenes: [] },
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
        const sceneMap = document.getElementById('scene-map');
        const sceneMapInner = document.getElementById('scene-map-inner');
        const sceneMapContent = document.getElementById('scene-map-content');
        const sceneMapImage = document.getElementById('scene-map-image');
        const sceneMapGrid = document.getElementById('scene-map-grid');
        const sceneMapEmpty = document.getElementById('scene-map-empty');
        const folderBar = document.getElementById('scene-folder-bar');
        const sceneListElement = document.getElementById('scene-list');
        const addFolderButton = document.getElementById('scene-add-folder');
        const addSceneButton = document.getElementById('scene-add');
        if (!panel || !toggleButton || !sceneDisplay || !sceneName || !sceneDescription) {
            return;
        }

        const initialSceneData = normalizeSceneDataForClient(config.sceneData);
        const MAP_MIN_SCALE = 0.5;
        const MAP_ABSOLUTE_MIN_SCALE = 0.05;
        const MAP_MAX_SCALE = 4;
        const MAP_WHEEL_SENSITIVITY = 0.002;
        const MAP_DRAG_BUFFER_MIN_PX = 220;
        const MAP_DRAG_BUFFER_SCALE = 0.5;

        const state = {
            isGM: Boolean(config.isGM),
            sceneData: initialSceneData,
            scenes: flattenScenesForClient(initialSceneData),
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
            selectedFolderId: determineInitialFolderId(initialSceneData, config.initialSceneId),
            selectedSceneId: config.initialSceneId,
            mapUpdateTimer: null,
            openSceneMenuId: null,
            mapAspectRatio: null,
            skipNextDocumentClick: false,
            mapTransform: {
                scale: 1,
                translateX: 0,
                translateY: 0,
            },
            mapMinScale: MAP_MIN_SCALE,
            mapDragState: {
                pointerId: null,
                active: false,
                lastX: 0,
                lastY: 0,
            },
            mapImageSrc: sceneMapImage ? (sceneMapImage.getAttribute('src') || '') : '',
            mapHasImage: Boolean(sceneMapImage && !sceneMapImage.classList.contains('scene-display__map-image--hidden')),
        };

        let isPanelOpen = false;
        if (state.selectedFolderId === null && state.sceneData.rootScenes.length === 0 && state.sceneData.folders.length > 0) {
            state.selectedFolderId = state.sceneData.folders[0].id || null;
        }
        applySceneToDisplay(config.initialScene || getSceneById(state.scenes, state.activeSceneId), true);
        renderFolderBar();
        renderSceneList();
        initMapInteractions();

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

        if (state.isGM) {
            if (addFolderButton) {
                addFolderButton.addEventListener('click', onCreateFolder);
            }

            if (addSceneButton) {
                addSceneButton.addEventListener('click', onCreateScene);
            }

            if (folderBar) {
                folderBar.addEventListener('click', onFolderBarClick);
            }

            if (sceneListElement) {
                sceneListElement.addEventListener('click', onSceneListClick);
                sceneListElement.addEventListener('contextmenu', onSceneListContextMenu);
                sceneListElement.addEventListener('change', onSceneListChange);
                sceneListElement.addEventListener('input', onSceneListInput);
            }

            if (sceneMapImage) {
                sceneMapImage.addEventListener('load', onSceneMapImageLoad);
                sceneMapImage.addEventListener('error', onSceneMapImageError);
            }

            document.addEventListener('click', onDocumentClick);
            document.addEventListener('keydown', onDocumentKeyDown);
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

        function onFolderBarClick(event) {
            const button = event.target.closest('[data-folder-id]');
            if (!button) {
                return;
            }
            const folderId = button.getAttribute('data-folder-id');
            const normalizedId = folderId === '' ? null : folderId;
            if (state.selectedFolderId === normalizedId) {
                return;
            }
            state.selectedFolderId = normalizedId;
            state.selectedSceneId = null;
            cancelScheduledMapUpdate();
            renderFolderBar();
            renderSceneList();
        }

        function onSceneListClick(event) {
            const menuToggle = event.target.closest('[data-scene-menu-toggle]');
            if (menuToggle) {
                event.preventDefault();
                const sceneId = menuToggle.getAttribute('data-scene-menu-toggle');
                if (!sceneId) {
                    return;
                }
                if (state.openSceneMenuId === sceneId) {
                    closeSceneMenu();
                } else {
                    openSceneMenu(sceneId);
                }
                return;
            }

            const addSceneButton = event.target.closest('[data-scene-create-after]');
            if (addSceneButton) {
                const sceneId = addSceneButton.getAttribute('data-scene-create-after');
                if (sceneId) {
                    closeSceneMenu();
                    createSceneRelativeTo(sceneId);
                }
                return;
            }

            const renameButton = event.target.closest('[data-scene-rename]');
            if (renameButton) {
                const sceneId = renameButton.getAttribute('data-scene-rename');
                if (sceneId) {
                    closeSceneMenu();
                    renameScene(sceneId);
                }
                return;
            }

            const activateButton = event.target.closest('[data-scene-activate]');
            if (activateButton) {
                const sceneId = activateButton.getAttribute('data-scene-activate');
                if (sceneId && sceneId !== state.activeSceneId) {
                    closeSceneMenu();
                    activateScene(sceneId);
                }
                return;
            }

            const deleteButton = event.target.closest('[data-scene-delete]');
            if (deleteButton) {
                const sceneId = deleteButton.getAttribute('data-scene-delete');
                if (sceneId) {
                    closeSceneMenu();
                    deleteScene(sceneId);
                }
                return;
            }

            const menu = event.target.closest('[data-scene-menu]');
            if (menu) {
                return;
            }

            const card = event.target.closest('[data-scene-card]');
            if (card) {
                const sceneId = card.getAttribute('data-scene-card');
                if (sceneId && state.selectedSceneId !== sceneId) {
                    cancelScheduledMapUpdate();
                    state.selectedSceneId = sceneId;
                    closeSceneMenu(false);
                    renderSceneList();
                }
            }
        }

        function onSceneListContextMenu(event) {
            const card = event.target.closest('[data-scene-card]');
            if (!card) {
                return;
            }

            event.preventDefault();
            const sceneId = card.getAttribute('data-scene-card');
            if (!sceneId) {
                return;
            }

            if (state.openSceneMenuId === sceneId) {
                return;
            }

            if (state.selectedSceneId !== sceneId) {
                cancelScheduledMapUpdate();
                state.selectedSceneId = sceneId;
            }

            openSceneMenu(sceneId);
        }

        function onSceneListChange(event) {
            const fileInput = event.target.closest('input[type="file"][data-scene-map-upload]');
            if (!fileInput) {
                return;
            }

            const sceneId = fileInput.getAttribute('data-scene-map-upload');
            if (!sceneId) {
                return;
            }

            onMapImageSelected(event, sceneId);
        }

        function onSceneListInput(event) {
            const rangeInput = event.target.closest('input[data-scene-grid-range]');
            if (rangeInput) {
                const sceneId = rangeInput.getAttribute('data-scene-grid-range');
                if (sceneId) {
                    syncGridScaleInputs(sceneId, 'range');
                    scheduleGridScaleUpdate(sceneId);
                }
                return;
            }

            const numberInput = event.target.closest('input[data-scene-grid-value]');
            if (numberInput) {
                const sceneId = numberInput.getAttribute('data-scene-grid-value');
                if (sceneId) {
                    syncGridScaleInputs(sceneId, 'number');
                    scheduleGridScaleUpdate(sceneId);
                }
            }
        }

        function onCreateFolder() {
            const name = window.prompt('Folder name?');
            if (name === null) {
                return;
            }
            const trimmed = name.trim();
            if (trimmed === '') {
                setStatus('Folder name cannot be empty.', 'error');
                return;
            }

            const body = new URLSearchParams({
                action: 'create_folder',
                name: trimmed,
            });

            setStatus('Creating folder…', 'info');
            fetch(state.sceneEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json',
                },
                body,
            })
                .then(handleJsonResponse)
                .then((data) => {
                    if (!data || data.success !== true || !data.sceneData) {
                        throw new Error((data && data.error) || 'Unable to create folder.');
                    }
                    applySceneStateFromServer(data);
                    if (data.folder && data.folder.id) {
                        state.selectedFolderId = data.folder.id;
                    }
                    setStatus('Folder created.', 'success');
                    renderFolderBar();
                    renderSceneList();
                })
                .catch((error) => {
                    console.error(error);
                    setStatus('Unable to create folder.', 'error');
                });
        }

        function onCreateScene() {
            const name = promptForSceneName('Name your new scene:', 'New Scene');
            if (name === null) {
                return;
            }
            createSceneRequest(state.selectedFolderId, name);
        }

        function createSceneRelativeTo(sceneId) {
            const scene = getSceneById(state.scenes, sceneId);
            const folderId = scene ? scene.folderId : state.selectedFolderId;
            const name = promptForSceneName('Name your new scene:', 'New Scene');
            if (name === null) {
                return;
            }
            if ((folderId || null) !== state.selectedFolderId) {
                state.selectedFolderId = folderId || null;
                renderFolderBar();
            }
            createSceneRequest(folderId, name);
        }

        function createSceneRequest(folderId, name) {
            const normalizedFolderId = typeof folderId === 'string' && folderId.trim() !== ''
                ? folderId.trim()
                : null;
            const trimmedName = typeof name === 'string' ? name.trim() : '';
            if (trimmedName === '') {
                setStatus('Scene name cannot be empty.', 'error');
                return;
            }

            const body = new URLSearchParams({
                action: 'create_scene',
                name: trimmedName,
            });
            if (normalizedFolderId !== null) {
                body.set('folder_id', normalizedFolderId);
            }

            state.selectedFolderId = normalizedFolderId;

            setStatus('Creating new scene…', 'info');
            fetch(state.sceneEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json',
                },
                body,
            })
                .then(handleJsonResponse)
                .then((data) => {
                    if (!data || data.success !== true || !data.scene || !data.sceneData) {
                        throw new Error((data && data.error) || 'Unable to create scene.');
                    }
                    applySceneStateFromServer(data);
                    state.selectedSceneId = data.scene.id;
                    state.activeSceneId = data.active_scene_id || state.activeSceneId;
                    renderFolderBar();
                    renderSceneList();
                    setStatus('Scene created. Upload a map to get started.', 'success');
                })
                .catch((error) => {
                    console.error(error);
                    setStatus('Unable to create scene.', 'error');
                });
        }

        function renameScene(sceneId) {
            const scene = getSceneById(state.scenes, sceneId);
            const fallbackName = scene && scene.name ? scene.name : 'Scene';
            if (!scene) {
                setStatus('Scene not found.', 'error');
                return;
            }

            const name = promptForSceneName('Rename scene:', fallbackName);
            if (name === null) {
                return;
            }

            const body = new URLSearchParams({
                action: 'rename_scene',
                scene_id: sceneId,
                name,
            });

            setStatus('Renaming scene…', 'info');
            fetch(state.sceneEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json',
                },
                body,
            })
                .then(handleJsonResponse)
                .then((data) => {
                    if (!data || data.success !== true || !data.sceneData) {
                        throw new Error((data && data.error) || 'Unable to rename scene.');
                    }
                    applySceneStateFromServer(data);
                    state.selectedSceneId = sceneId;
                    if (typeof data.active_scene_id === 'string') {
                        state.activeSceneId = data.active_scene_id;
                    }
                    renderFolderBar();
                    renderSceneList();
                    setStatus('Scene renamed.', 'success');
                })
                .catch((error) => {
                    console.error(error);
                    setStatus('Unable to rename scene.', 'error');
                });
        }

        function promptForSceneName(message, defaultValue) {
            const promptMessage = typeof message === 'string' && message.trim() !== ''
                ? message
                : 'Scene name?';
            const fallback = typeof defaultValue === 'string' && defaultValue !== ''
                ? defaultValue
                : 'New Scene';

            if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
                return fallback.trim();
            }

            const response = window.prompt(promptMessage, fallback);
            if (response === null) {
                return null;
            }

            const trimmed = response.trim();
            if (trimmed === '') {
                setStatus('Scene name cannot be empty.', 'error');
                return null;
            }

            return trimmed;
        }

        function onSceneMapImageLoad() {
            applyMapAspectRatioFromImage();
            resetMapTransform();
        }

        function onSceneMapImageError() {
            clearMapAspectRatio();
            resetMapTransform();
        }

        function clearMapContentSizing() {
            if (!sceneMapContent) {
                return;
            }
            sceneMapContent.style.removeProperty('width');
            sceneMapContent.style.removeProperty('height');
            sceneMapContent.style.removeProperty('flex');
        }

        function applyMapContentIntrinsicSize() {
            if (!sceneMapContent || !sceneMapImage) {
                return;
            }

            const width = sceneMapImage.naturalWidth;
            const height = sceneMapImage.naturalHeight;
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                return;
            }

            sceneMapContent.style.width = `${width}px`;
            sceneMapContent.style.height = `${height}px`;
            sceneMapContent.style.flex = '0 0 auto';
        }

        function applyMapAspectRatioFromImage() {
            if (!sceneMapInner || !sceneMapImage) {
                return;
            }
            const width = sceneMapImage.naturalWidth;
            const height = sceneMapImage.naturalHeight;
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                return;
            }
            sceneMapInner.style.removeProperty('aspect-ratio');
            state.mapAspectRatio = width / height;
            applyMapContentIntrinsicSize();
            const fitScale = calculateFitScale();
            const minScale = Math.min(fitScale, MAP_MIN_SCALE);
            state.mapMinScale = clampNumber(minScale, MAP_ABSOLUTE_MIN_SCALE, MAP_MAX_SCALE);
        }

        function clearMapAspectRatio() {
            if (sceneMapInner) {
                sceneMapInner.style.removeProperty('aspect-ratio');
            }
            state.mapAspectRatio = null;
            clearMapContentSizing();
            state.mapMinScale = MAP_MIN_SCALE;
        }

        function initMapInteractions() {
            if (!sceneMapInner || !sceneMapContent) {
                return;
            }
            try {
                sceneMapInner.addEventListener('wheel', onMapWheel, { passive: false });
            } catch (error) {
                sceneMapInner.addEventListener('wheel', onMapWheel, false);
            }
            sceneMapInner.addEventListener('contextmenu', onMapContextMenu);
            sceneMapInner.addEventListener('pointerdown', onMapPointerDown);
            sceneMapInner.addEventListener('pointermove', onMapPointerMove);
            sceneMapInner.addEventListener('pointerup', onMapPointerUp);
            sceneMapInner.addEventListener('pointercancel', onMapPointerCancel);
            sceneMapInner.addEventListener('dblclick', onMapDoubleClick);
            window.addEventListener('resize', onMapViewportResize);
            updateMapInteractionState();
            applyMapTransform();
        }

        function updateMapInteractionState() {
            if (!sceneMapContent) {
                return;
            }
            sceneMapContent.classList.toggle('scene-display__map-content--inactive', !state.mapHasImage);
            sceneMapContent.classList.toggle('scene-display__map-content--dragging', state.mapDragState.active);
        }

        function getMapMinScale() {
            const minScale = typeof state.mapMinScale === 'number' ? state.mapMinScale : MAP_MIN_SCALE;
            return clampNumber(minScale, MAP_ABSOLUTE_MIN_SCALE, MAP_MAX_SCALE);
        }

        function applyMapTransform() {
            if (!sceneMapContent || !sceneMapInner) {
                return;
            }
            const clamped = clampMapTranslation(
                state.mapTransform.scale,
                state.mapTransform.translateX,
                state.mapTransform.translateY
            );
            state.mapTransform.translateX = clamped.translateX;
            state.mapTransform.translateY = clamped.translateY;

            if (!state.mapHasImage && state.mapTransform.scale === 1 && clamped.translateX === 0 && clamped.translateY === 0) {
                sceneMapContent.style.transform = '';
            } else {
                sceneMapContent.style.transform = `translate3d(${clamped.translateX}px, ${clamped.translateY}px, 0) scale(${state.mapTransform.scale})`;
            }

            updateMapInteractionState();
        }

        function resetMapTransform() {
            const fitScale = state.mapHasImage ? calculateFitScale() : 1;
            const minScale = state.mapHasImage ? Math.min(fitScale, MAP_MIN_SCALE) : MAP_MIN_SCALE;
            state.mapMinScale = clampNumber(minScale, MAP_ABSOLUTE_MIN_SCALE, MAP_MAX_SCALE);
            state.mapTransform.scale = clampNumber(fitScale, getMapMinScale(), MAP_MAX_SCALE);
            const bounds = getMapTranslationBounds(state.mapTransform.scale);
            state.mapTransform.translateX = clampNumber((bounds.minX + bounds.maxX) / 2, bounds.minX, bounds.maxX);
            state.mapTransform.translateY = clampNumber((bounds.minY + bounds.maxY) / 2, bounds.minY, bounds.maxY);
            state.mapDragState.active = false;
            state.mapDragState.pointerId = null;
            applyMapTransform();
        }

        function calculateFitScale() {
            if (!sceneMapInner || !sceneMapContent) {
                return 1;
            }

            const viewportWidth = sceneMapInner.clientWidth;
            const viewportHeight = sceneMapInner.clientHeight;
            if (viewportWidth <= 0 || viewportHeight <= 0) {
                return 1;
            }

            const contentWidth = sceneMapContent.offsetWidth || viewportWidth;
            const contentHeight = sceneMapContent.offsetHeight || viewportHeight;
            if (contentWidth <= 0 || contentHeight <= 0) {
                return 1;
            }

            const scaleX = viewportWidth / contentWidth;
            const scaleY = viewportHeight / contentHeight;
            const fitScale = Math.min(scaleX, scaleY, 1);
            return clampNumber(fitScale, MAP_ABSOLUTE_MIN_SCALE, MAP_MAX_SCALE);
        }

        function updateMapScale(nextScale, focalX, focalY) {
            if (!sceneMapInner) {
                return;
            }
            const currentScale = state.mapTransform.scale;
            const clampedScale = clampNumber(nextScale, getMapMinScale(), MAP_MAX_SCALE);
            if (!Number.isFinite(clampedScale) || clampedScale === currentScale) {
                return;
            }
            const rect = sceneMapInner.getBoundingClientRect();
            const originX = typeof focalX === 'number' ? focalX : rect.width / 2;
            const originY = typeof focalY === 'number' ? focalY : rect.height / 2;

            const contentX = originX - state.mapTransform.translateX;
            const contentY = originY - state.mapTransform.translateY;
            const scaleRatio = clampedScale / currentScale;

            state.mapTransform.scale = clampedScale;
            updateMapTranslation(originX - contentX * scaleRatio, originY - contentY * scaleRatio);
        }

        function updateMapTranslation(nextX, nextY) {
            const clamped = clampMapTranslation(state.mapTransform.scale, nextX, nextY);
            state.mapTransform.translateX = clamped.translateX;
            state.mapTransform.translateY = clamped.translateY;
            applyMapTransform();
        }

        function getMapTranslationBounds(scale) {
            if (!sceneMapInner || !sceneMapContent) {
                return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
            }
            const viewportWidth = sceneMapInner.clientWidth;
            const viewportHeight = sceneMapInner.clientHeight;
            if (viewportWidth === 0 || viewportHeight === 0) {
                return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
            }

            const contentWidth = sceneMapContent.offsetWidth || viewportWidth;
            const contentHeight = sceneMapContent.offsetHeight || viewportHeight;
            const scaledWidth = contentWidth * scale;
            const scaledHeight = contentHeight * scale;

            const bufferX = state.mapHasImage
                ? Math.max(MAP_DRAG_BUFFER_MIN_PX, scaledWidth * MAP_DRAG_BUFFER_SCALE)
                : 0;
            const bufferY = state.mapHasImage
                ? Math.max(MAP_DRAG_BUFFER_MIN_PX, scaledHeight * MAP_DRAG_BUFFER_SCALE)
                : 0;

            let minX;
            let maxX;
            if (scaledWidth <= viewportWidth) {
                const centerX = (viewportWidth - scaledWidth) / 2;
                minX = centerX - bufferX;
                maxX = centerX + bufferX;
            } else {
                const edgeOffset = viewportWidth - scaledWidth;
                minX = edgeOffset - bufferX;
                maxX = bufferX;
            }

            let minY;
            let maxY;
            if (scaledHeight <= viewportHeight) {
                const centerY = (viewportHeight - scaledHeight) / 2;
                minY = centerY - bufferY;
                maxY = centerY + bufferY;
            } else {
                const edgeOffsetY = viewportHeight - scaledHeight;
                minY = edgeOffsetY - bufferY;
                maxY = bufferY;
            }

            return { minX, maxX, minY, maxY };
        }

        function clampMapTranslation(scale, translateX, translateY) {
            const bounds = getMapTranslationBounds(scale);
            return {
                translateX: clampNumber(translateX, bounds.minX, bounds.maxX),
                translateY: clampNumber(translateY, bounds.minY, bounds.maxY),
            };
        }

        function onMapWheel(event) {
            if (!state.mapHasImage) {
                return;
            }
            if (typeof event.preventDefault === 'function') {
                event.preventDefault();
            }
            const rect = sceneMapInner.getBoundingClientRect();
            const pointerX = event.clientX - rect.left;
            const pointerY = event.clientY - rect.top;
            const delta = clampNumber(event.deltaY, -1000, 1000);
            const zoomFactor = Math.exp(-delta * MAP_WHEEL_SENSITIVITY);
            const nextScale = clampNumber(state.mapTransform.scale * zoomFactor, getMapMinScale(), MAP_MAX_SCALE);
            updateMapScale(nextScale, pointerX, pointerY);
        }

        function onMapPointerDown(event) {
            if (!state.mapHasImage) {
                return;
            }
            if (!event.isPrimary) {
                return;
            }
            if (event.pointerType === 'mouse') {
                if (event.button !== 2) {
                    return;
                }
                if (typeof event.preventDefault === 'function') {
                    event.preventDefault();
                }
            }
            state.mapDragState.pointerId = event.pointerId;
            state.mapDragState.active = true;
            state.mapDragState.lastX = event.clientX;
            state.mapDragState.lastY = event.clientY;
            if (sceneMapInner && typeof sceneMapInner.setPointerCapture === 'function') {
                try {
                    sceneMapInner.setPointerCapture(event.pointerId);
                } catch (error) {
                    // ignore
                }
            }
            updateMapInteractionState();
        }

        function onMapPointerMove(event) {
            if (!state.mapDragState.active || event.pointerId !== state.mapDragState.pointerId) {
                return;
            }
            if (event.pointerType === 'mouse' && event.buttons !== 2) {
                endMapDrag();
                return;
            }
            const dx = event.clientX - state.mapDragState.lastX;
            const dy = event.clientY - state.mapDragState.lastY;
            state.mapDragState.lastX = event.clientX;
            state.mapDragState.lastY = event.clientY;
            updateMapTranslation(state.mapTransform.translateX + dx, state.mapTransform.translateY + dy);
        }

        function onMapPointerUp(event) {
            if (event.pointerId !== state.mapDragState.pointerId) {
                return;
            }
            endMapDrag();
        }

        function onMapPointerCancel(event) {
            if (event.pointerId !== state.mapDragState.pointerId) {
                return;
            }
            endMapDrag();
        }

        function endMapDrag() {
            if (!state.mapDragState.active) {
                return;
            }
            if (sceneMapInner && typeof sceneMapInner.releasePointerCapture === 'function' && state.mapDragState.pointerId !== null) {
                try {
                    sceneMapInner.releasePointerCapture(state.mapDragState.pointerId);
                } catch (error) {
                    // ignore
                }
            }
            state.mapDragState.active = false;
            state.mapDragState.pointerId = null;
            updateMapInteractionState();
            applyMapTransform();
        }

        function onMapDoubleClick(event) {
            if (!state.mapHasImage) {
                return;
            }
            if (typeof event.preventDefault === 'function') {
                event.preventDefault();
            }
            resetMapTransform();
        }

        function onMapContextMenu(event) {
            if (!sceneMapInner) {
                return;
            }
            if (!state.mapHasImage) {
                return;
            }
            event.preventDefault();
        }

        function onMapViewportResize() {
            applyMapTransform();
        }

        function onMapImageSelected(event, sceneId) {
            const input = event.target;
            if (!input || !input.files || input.files.length === 0) {
                return;
            }

            const file = input.files[0];
            const targetSceneId = sceneId || input.getAttribute('data-scene-map-upload') || state.selectedSceneId;
            if (!file || !targetSceneId) {
                return;
            }

            if (file.name) {
                updateMapImageName(targetSceneId, `Uploading ${file.name}…`);
            }

            uploadSceneMap(targetSceneId, file);
        }

        function syncGridScaleInputs(sceneId, source) {
            const card = getSceneCard(sceneId);
            if (!card) {
                return;
            }

            const gridScaleRange = card.querySelector('[data-scene-grid-range]');
            const gridScaleValue = card.querySelector('[data-scene-grid-value]');
            if (!gridScaleRange || !gridScaleValue) {
                return;
            }

            if (source === 'range') {
                gridScaleValue.value = gridScaleRange.value;
            } else {
                const numeric = clampGridScale(parseInt(gridScaleValue.value, 10));
                gridScaleValue.value = numeric;
                gridScaleRange.value = numeric;
            }
        }

        function scheduleGridScaleUpdate(sceneId) {
            if (!sceneId) {
                return;
            }

            if (state.mapUpdateTimer !== null) {
                window.clearTimeout(state.mapUpdateTimer);
            }

            state.mapUpdateTimer = window.setTimeout(function () {
                submitGridScaleUpdate(sceneId);
            }, 400);
        }

        function submitGridScaleUpdate(sceneId) {
            state.mapUpdateTimer = null;
            if (!sceneId) {
                return;
            }

            const card = getSceneCard(sceneId);
            if (!card) {
                return;
            }

            const gridScaleRange = card.querySelector('[data-scene-grid-range]');
            const gridScaleValue = card.querySelector('[data-scene-grid-value]');
            if (!gridScaleRange) {
                return;
            }

            const value = clampGridScale(parseInt(gridScaleRange.value, 10));
            gridScaleRange.value = value;
            if (gridScaleValue) {
                gridScaleValue.value = value;
            }

            const body = new URLSearchParams({
                action: 'update_scene_map',
                scene_id: sceneId,
                grid_scale: String(value),
            });

            setStatus('Updating grid…', 'info');
            fetch(state.sceneEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json',
                },
                body,
            })
                .then(handleJsonResponse)
                .then((data) => {
                    if (!data || data.success !== true || !data.sceneData) {
                        throw new Error((data && data.error) || 'Unable to update grid.');
                    }
                    applySceneStateFromServer(data);
                    setStatus('Grid updated.', 'success');
                    if (state.activeSceneId === sceneId) {
                        const updatedScene = getSceneById(state.scenes, sceneId);
                        applySceneToDisplay(updatedScene, true);
                    }
                    renderSceneList();
                })
                .catch((error) => {
                    console.error(error);
                    setStatus('Unable to update grid scale.', 'error');
                });
        }

        function cancelScheduledMapUpdate() {
            if (state.mapUpdateTimer !== null) {
                window.clearTimeout(state.mapUpdateTimer);
                state.mapUpdateTimer = null;
            }
        }

        function uploadSceneMap(sceneId, file) {
            const formData = new FormData();
            formData.append('action', 'update_scene_map');
            formData.append('scene_id', sceneId);
            formData.append('map_image', file);
            const card = getSceneCard(sceneId);
            if (card) {
                const gridScaleRange = card.querySelector('[data-scene-grid-range]');
                if (gridScaleRange) {
                    formData.append('grid_scale', String(clampGridScale(parseInt(gridScaleRange.value, 10))));
                }
            }

            setStatus('Uploading map…', 'info');
            fetch(state.sceneEndpoint, {
                method: 'POST',
                body: formData,
            })
                .then(handleJsonResponse)
                .then((data) => {
                    if (!data || data.success !== true || !data.sceneData) {
                        throw new Error((data && data.error) || 'Unable to upload map.');
                    }
                    applySceneStateFromServer(data);
                    setStatus('Map updated.', 'success');
                    if (state.activeSceneId === sceneId) {
                        const updatedScene = getSceneById(state.scenes, sceneId);
                        applySceneToDisplay(updatedScene, true);
                    }
                    renderSceneList();
                })
                .catch((error) => {
                    console.error(error);
                    setStatus('Unable to upload map.', 'error');
                })
                .finally(() => {
                    resetSceneMapInput(sceneId);
                });
        }

        function deleteScene(sceneId) {
            const confirmed = window.confirm('Delete this scene? This cannot be undone.');
            if (!confirmed) {
                return;
            }

            const body = new URLSearchParams({
                action: 'delete_scene',
                scene_id: sceneId,
            });

            setStatus('Removing scene…', 'info');
            fetch(state.sceneEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': 'application/json',
                },
                body,
            })
                .then(handleJsonResponse)
                .then((data) => {
                    if (!data || data.success !== true || !data.sceneData) {
                        throw new Error((data && data.error) || 'Unable to remove scene.');
                    }
                    const deletedActive = state.activeSceneId === sceneId;
                    applySceneStateFromServer(data);
                    if (deletedActive) {
                        state.activeSceneId = data.active_scene_id || null;
                        applySceneToDisplay(getSceneById(state.scenes, state.activeSceneId));
                    }
                    if (state.selectedSceneId === sceneId) {
                        state.selectedSceneId = null;
                    }
                    renderFolderBar();
                    renderSceneList();
                    setStatus('Scene deleted.', 'success');
                })
                .catch((error) => {
                    console.error(error);
                    setStatus('Unable to delete scene.', 'error');
                });
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
                .then(handleJsonResponse)
                .then((data) => {
                    if (!data || data.success !== true || !data.active_scene_id) {
                        throw new Error((data && data.error) || 'Unable to activate scene.');
                    }
                    state.activeSceneId = data.active_scene_id;
                    applySceneToDisplay(data.scene || getSceneById(state.scenes, data.active_scene_id));
                    setStatus(data.scene && data.scene.name ? `Activated “${data.scene.name}.”` : 'Scene activated.', 'success');
                    renderSceneList();
                    refreshScenesFromServer(false);
                })
                .catch((error) => {
                    console.error(error);
                    setStatus('Unable to update the scene. Please try again.', 'error');
                })
                .finally(() => {
                    state.pendingRequest = false;
                });
        }

        function refreshScenesFromServer(showStatus) {
            if (!state.isGM) {
                return;
            }
            const requestUrl = buildSceneActionUrl(state.sceneEndpoint, 'list');
            fetch(requestUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            })
                .then(handleJsonResponse)
                .then((data) => {
                    if (!data || data.success !== true || !data.sceneData) {
                        throw new Error((data && data.error) || 'Unable to load scenes.');
                    }
                    applySceneStateFromServer(data);
                    renderFolderBar();
                    renderSceneList();
                    if (showStatus) {
                        setStatus('Scenes refreshed.', 'success');
                    }
                })
                .catch((error) => {
                    console.error(error);
                    if (showStatus) {
                        setStatus('Unable to refresh scenes.', 'error');
                    }
                });
        }

        function renderFolderBar() {
            if (!folderBar) {
                return;
            }
            folderBar.innerHTML = '';

            const rootButton = document.createElement('button');
            rootButton.type = 'button';
            rootButton.textContent = 'Unsorted';
            rootButton.className = 'scene-folder__button';
            rootButton.setAttribute('data-folder-id', '');
            if (state.selectedFolderId === null) {
                rootButton.classList.add('scene-folder__button--active');
            }
            folderBar.appendChild(rootButton);

            const folders = Array.isArray(state.sceneData.folders) ? state.sceneData.folders : [];
            folders.forEach((folder) => {
                if (!folder || typeof folder !== 'object') {
                    return;
                }
                const id = folder.id || '';
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = folder.name || 'Folder';
                button.className = 'scene-folder__button';
                button.setAttribute('data-folder-id', id);
                if (state.selectedFolderId === id) {
                    button.classList.add('scene-folder__button--active');
                }
                folderBar.appendChild(button);
            });
        }

        function renderSceneList() {
            if (!sceneListElement) {
                return;
            }

            sceneListElement.innerHTML = '';
            const scenes = getScenesForFolder(state.sceneData, state.selectedFolderId);
            if (!scenes.length) {
                const empty = document.createElement('p');
                empty.className = 'scene-management__empty';
                empty.textContent = 'No scenes yet. Create one to get started.';
                sceneListElement.appendChild(empty);
                return;
            }

            const previousSelection = state.selectedSceneId;
            const selectedExists = scenes.some((scene) => scene.id === state.selectedSceneId);
            if (!selectedExists) {
                state.selectedSceneId = scenes[0].id;
            }
            if (state.selectedSceneId !== previousSelection) {
                cancelScheduledMapUpdate();
            }

            scenes.forEach((scene) => {
                const card = buildSceneCard(scene);
                sceneListElement.appendChild(card);
            });
        }

        function buildSceneCard(scene) {
            const isSelected = state.selectedSceneId === scene.id;
            const isActive = state.activeSceneId === scene.id;
            const isMenuOpen = state.openSceneMenuId === scene.id;

            const wrapper = document.createElement('article');
            wrapper.className = 'scene-card';
            wrapper.setAttribute('data-scene-card', scene.id);
            if (isSelected) {
                wrapper.classList.add('scene-card--selected');
            }
            if (isActive) {
                wrapper.classList.add('scene-card--active');
            }
            if (isMenuOpen) {
                wrapper.classList.add('scene-card--menu-open');
            }

            const previewButton = document.createElement('button');
            previewButton.type = 'button';
            previewButton.className = 'scene-card__preview';
            previewButton.setAttribute('data-scene-card', scene.id);
            previewButton.setAttribute('aria-label', `Select ${scene.name || 'scene'}`);

            const previewMedia = document.createElement('div');
            previewMedia.className = 'scene-card__preview-media';
            const mapImage = scene.map && typeof scene.map.image === 'string' ? scene.map.image.trim() : '';
            if (mapImage !== '') {
                const image = document.createElement('img');
                image.className = 'scene-card__image';
                image.src = mapImage;
                image.alt = '';
                previewMedia.appendChild(image);
            } else {
                previewMedia.classList.add('scene-card__preview-media--empty');
            }

            const details = document.createElement('div');
            details.className = 'scene-card__details';

            const name = document.createElement('span');
            name.className = 'scene-card__name';
            name.textContent = scene.name || 'Untitled Scene';
            details.appendChild(name);

            if (isActive) {
                const badge = document.createElement('span');
                badge.className = 'scene-card__badge';
                badge.textContent = 'Active';
                details.appendChild(badge);
            }

            previewMedia.appendChild(details);
            previewButton.appendChild(previewMedia);
            wrapper.appendChild(previewButton);

            const menuContainer = document.createElement('div');
            menuContainer.className = 'scene-card__menu';

            const menuToggle = document.createElement('button');
            menuToggle.type = 'button';
            menuToggle.className = 'scene-card__menu-trigger';
            menuToggle.setAttribute('data-scene-menu-toggle', scene.id);
            menuToggle.setAttribute('aria-haspopup', 'true');
            menuToggle.setAttribute('aria-expanded', isMenuOpen ? 'true' : 'false');
            menuToggle.setAttribute('title', 'Scene options');

            const menuToggleLabel = document.createElement('span');
            menuToggleLabel.className = 'sr-only';
            menuToggleLabel.textContent = 'Scene options';
            menuToggle.appendChild(menuToggleLabel);

            const menuToggleIcon = document.createElement('span');
            menuToggleIcon.setAttribute('aria-hidden', 'true');
            menuToggleIcon.className = 'scene-card__menu-icon';
            menuToggleIcon.textContent = '⋯';
            menuToggle.appendChild(menuToggleIcon);

            menuContainer.appendChild(menuToggle);

            const menu = document.createElement('div');
            menu.className = 'scene-card__menu-popover';
            menu.setAttribute('data-scene-menu', scene.id);
            menu.hidden = !isMenuOpen;

            const addSibling = document.createElement('button');
            addSibling.type = 'button';
            addSibling.className = 'scene-card__menu-item';
            addSibling.textContent = 'Add Scene';
            addSibling.setAttribute('data-scene-create-after', scene.id);

            const rename = document.createElement('button');
            rename.type = 'button';
            rename.className = 'scene-card__menu-item';
            rename.textContent = 'Rename Scene';
            rename.setAttribute('data-scene-rename', scene.id);

            const activate = document.createElement('button');
            activate.type = 'button';
            activate.className = 'scene-card__menu-item';
            activate.textContent = isActive ? 'Active Scene' : 'Set Active';
            activate.disabled = isActive;
            activate.setAttribute('data-scene-activate', scene.id);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'scene-card__menu-item scene-card__menu-item--danger';
            remove.textContent = 'Delete Scene';
            remove.setAttribute('data-scene-delete', scene.id);

            menu.appendChild(addSibling);
            menu.appendChild(rename);
            menu.appendChild(activate);
            menu.appendChild(remove);
            menuContainer.appendChild(menu);
            wrapper.appendChild(menuContainer);

            if (isSelected && state.isGM) {
                const mapSettings = buildSceneMapSettings(scene);
                if (mapSettings) {
                    wrapper.appendChild(mapSettings);
                }
            }

            return wrapper;
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
                updateMapDisplay(scene.map || {});
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
                updateMapDisplay(null);
            }

            if (!skipStatus) {
                setStatus('', '');
            }
        }

        function openSceneMenu(sceneId) {
            state.openSceneMenuId = sceneId;
            state.skipNextDocumentClick = true;
            renderSceneList();
            if (!sceneListElement) {
                return;
            }
            const scheduleFocus = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
                ? window.requestAnimationFrame.bind(window)
                : function (callback) {
                    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
                        window.setTimeout(callback, 0);
                    }
                };
            scheduleFocus(() => {
                const menu = sceneListElement.querySelector(`[data-scene-menu="${sceneId}"]`);
                if (!menu || menu.hidden) {
                    return;
                }
                const focusTarget = menu.querySelector('button:not(:disabled)');
                if (focusTarget) {
                    focusTarget.focus();
                }
            });
        }

        function closeSceneMenu(shouldRender = true) {
            if (state.openSceneMenuId === null) {
                return;
            }
            state.openSceneMenuId = null;
            state.skipNextDocumentClick = false;
            if (shouldRender) {
                renderSceneList();
            }
        }

        function onDocumentClick(event) {
            if (state.skipNextDocumentClick) {
                state.skipNextDocumentClick = false;
                return;
            }
            if (state.openSceneMenuId === null) {
                return;
            }
            if (!sceneListElement) {
                closeSceneMenu();
                return;
            }
            const selector = `[data-scene-card="${state.openSceneMenuId}"]`;
            const currentCard = sceneListElement.querySelector(selector);
            if (!currentCard) {
                closeSceneMenu();
                return;
            }
            if (currentCard.contains(event.target)) {
                const toggle = event.target.closest('[data-scene-menu-toggle]');
                const menu = event.target.closest('[data-scene-menu]');
                if (toggle || menu) {
                    return;
                }
            }
            closeSceneMenu();
        }

        function onDocumentKeyDown(event) {
            if (event.key === 'Escape' && state.openSceneMenuId !== null) {
                closeSceneMenu();
            }
        }

        function updateMapDisplay(map) {
            if (!sceneMap || !sceneMapImage || !sceneMapGrid || !sceneMapEmpty) {
                return;
            }
            const hasImage = Boolean(map && typeof map.image === 'string' && map.image.trim() !== '');
            const imagePath = hasImage ? map.image.trim() : '';
            const gridScale = clampGridScale(parseInt(map && map.gridScale, 10));
            const imageChanged = state.mapImageSrc !== imagePath;

            if (hasImage) {
                if (imageChanged) {
                    clearMapContentSizing();
                    state.mapMinScale = MAP_MIN_SCALE;
                }
                if (imageChanged || !sceneMapImage.hasAttribute('src')) {
                    sceneMapImage.src = imagePath;
                }
                sceneMapImage.classList.remove('scene-display__map-image--hidden');
                sceneMapEmpty.hidden = true;
                sceneMap.classList.remove('scene-display__map--empty');
                if (sceneMapImage.complete) {
                    applyMapAspectRatioFromImage();
                }
            } else {
                if (sceneMapImage.hasAttribute('src')) {
                    sceneMapImage.removeAttribute('src');
                }
                sceneMapImage.classList.add('scene-display__map-image--hidden');
                sceneMapEmpty.hidden = false;
                sceneMap.classList.add('scene-display__map--empty');
                clearMapAspectRatio();
            }

            sceneMap.setAttribute('data-grid-scale', String(gridScale));
            sceneMap.style.setProperty('--grid-size', `${gridScale}px`);
            sceneMapGrid.style.backgroundSize = `${gridScale}px ${gridScale}px`;

            state.mapHasImage = hasImage;
            state.mapImageSrc = imagePath;
            updateMapInteractionState();

            if (!hasImage || imageChanged) {
                resetMapTransform();
            } else {
                applyMapTransform();
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
                .then(handleJsonResponse)
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
                        renderSceneList();
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
            return buildSceneActionUrl(endpoint, 'get_active');
        }

        function applySceneStateFromServer(payload) {
            if (!payload || !payload.sceneData) {
                return;
            }
            state.sceneData = normalizeSceneDataForClient(payload.sceneData);
            state.scenes = flattenScenesForClient(state.sceneData);
            state.openSceneMenuId = null;
            if (typeof payload.active_scene_id === 'string') {
                state.activeSceneId = payload.active_scene_id;
            }
            if (state.selectedFolderId && !state.sceneData.folders.some((folder) => folder.id === state.selectedFolderId)) {
                state.selectedFolderId = null;
            }
            if (state.selectedSceneId && !getSceneById(state.scenes, state.selectedSceneId)) {
                state.selectedSceneId = null;
                cancelScheduledMapUpdate();
            }
        }
    }

    function normalizeSceneDataForClient(data) {
        const normalized = { folders: [], rootScenes: [] };
        if (!isPlainObject(data)) {
            return normalized;
        }

        if (Array.isArray(data.rootScenes)) {
            normalized.rootScenes = data.rootScenes
                .map(normalizeSceneRecord)
                .filter(Boolean);
        }

        if (Array.isArray(data.folders)) {
            normalized.folders = data.folders
                .map((folder) => {
                    if (!isPlainObject(folder)) {
                        return null;
                    }
                    const folderId = typeof folder.id === 'string' ? folder.id : '';
                    const folderName = typeof folder.name === 'string' ? folder.name : 'Folder';
                    const scenes = Array.isArray(folder.scenes)
                        ? folder.scenes.map(normalizeSceneRecord).filter(Boolean)
                        : [];
                    return {
                        id: folderId,
                        name: folderName,
                        scenes,
                    };
                })
                .filter(Boolean);
        }

        return normalized;
    }

    function normalizeSceneRecord(scene) {
        if (!isPlainObject(scene)) {
            return null;
        }
        const id = typeof scene.id === 'string' ? scene.id : '';
        const map = isPlainObject(scene.map) ? scene.map : {};
        const gridScale = clampGridScale(parseInt(map.gridScale, 10));
        return {
            id,
            name: typeof scene.name === 'string' && scene.name.trim() !== '' ? scene.name : 'New Scene',
            description: typeof scene.description === 'string' ? scene.description : '',
            accent: typeof scene.accent === 'string' ? scene.accent : '',
            map: {
                image: typeof map.image === 'string' ? map.image : '',
                gridScale,
            },
        };
    }

    function flattenScenesForClient(sceneData) {
        const normalized = normalizeSceneDataForClient(sceneData);
        const collection = [];

        normalized.rootScenes.forEach((scene) => {
            collection.push(Object.assign({}, scene, { folderId: null }));
        });

        normalized.folders.forEach((folder) => {
            folder.scenes.forEach((scene) => {
                collection.push(Object.assign({}, scene, { folderId: folder.id || null }));
            });
        });

        return collection;
    }

    function getSceneCard(sceneId) {
        const list = document.getElementById('scene-list');
        if (!list || !sceneId) {
            return null;
        }
        return list.querySelector(`[data-scene-card="${sceneId}"]`);
    }

    function resetSceneMapInput(sceneId) {
        const card = getSceneCard(sceneId);
        if (!card) {
            return;
        }
        const input = card.querySelector('input[type="file"][data-scene-map-upload]');
        if (input) {
            input.value = '';
        }
    }

    function updateMapImageName(sceneId, message) {
        const card = getSceneCard(sceneId);
        if (!card) {
            return;
        }
        const nameElement = card.querySelector('[data-scene-map-name]');
        if (nameElement) {
            nameElement.textContent = message;
        }
    }

    function buildSceneMapSettings(scene) {
        if (!scene || typeof scene !== 'object') {
            return null;
        }

        const container = document.createElement('div');
        container.className = 'scene-card__map-settings scene-management__map-settings';
        container.setAttribute('data-scene-map-settings', scene.id);

        const title = document.createElement('h4');
        title.className = 'scene-management__map-title';
        title.textContent = 'Map Settings';
        container.appendChild(title);

        const imageField = document.createElement('div');
        imageField.className = 'scene-management__field';

        const imageLabel = document.createElement('label');
        imageLabel.className = 'scene-management__label';
        imageLabel.textContent = 'Scene Image';
        imageField.appendChild(imageLabel);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.className = 'scene-management__file';
        fileInput.setAttribute('data-scene-map-upload', scene.id);
        imageField.appendChild(fileInput);

        const fileName = document.createElement('p');
        fileName.className = 'scene-management__file-name';
        fileName.setAttribute('data-scene-map-name', scene.id);
        if (scene.map && typeof scene.map.image === 'string' && scene.map.image.trim() !== '') {
            fileName.textContent = `Current image: ${extractFileName(scene.map.image)}`;
        } else {
            fileName.textContent = 'No image uploaded yet.';
        }
        imageField.appendChild(fileName);

        container.appendChild(imageField);

        const gridField = document.createElement('div');
        gridField.className = 'scene-management__field';

        const gridLabel = document.createElement('label');
        gridLabel.className = 'scene-management__label';
        gridLabel.textContent = 'Grid Scale';
        gridField.appendChild(gridLabel);

        const gridControls = document.createElement('div');
        gridControls.className = 'scene-management__grid-controls';

        const range = document.createElement('input');
        range.type = 'range';
        range.min = '10';
        range.max = '300';
        range.step = '5';
        range.className = 'scene-management__grid-range';
        range.setAttribute('data-scene-grid-range', scene.id);
        range.value = String(clampGridScale(parseInt(scene.map && scene.map.gridScale, 10)));
        gridControls.appendChild(range);

        const number = document.createElement('input');
        number.type = 'number';
        number.min = '10';
        number.max = '300';
        number.step = '5';
        number.className = 'scene-management__grid-value';
        number.setAttribute('data-scene-grid-value', scene.id);
        number.value = String(clampGridScale(parseInt(scene.map && scene.map.gridScale, 10)));
        gridControls.appendChild(number);

        const unit = document.createElement('span');
        unit.className = 'scene-management__grid-unit';
        unit.textContent = 'px';
        gridControls.appendChild(unit);

        gridField.appendChild(gridControls);
        container.appendChild(gridField);

        return container;
    }

    function determineInitialFolderId(sceneData, sceneId) {
        if (!sceneId) {
            return null;
        }
        const normalized = normalizeSceneDataForClient(sceneData);
        const folder = normalized.folders.find((item) => {
            return item.scenes.some((scene) => scene.id === sceneId);
        });
        return folder ? folder.id || null : null;
    }

    function getScenesForFolder(sceneData, folderId) {
        const normalized = normalizeSceneDataForClient(sceneData);
        if (folderId === null) {
            return normalized.rootScenes.slice();
        }
        const folder = normalized.folders.find((item) => item.id === folderId);
        return folder ? folder.scenes.slice() : [];
    }

    function clampNumber(value, min, max) {
        let numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            numeric = 0;
        }
        if (numeric < min) {
            return min;
        }
        if (numeric > max) {
            return max;
        }
        return numeric;
    }

    function clampGridScale(value) {
        if (!Number.isFinite(value)) {
            return 50;
        }
        if (value < 10) {
            return 10;
        }
        if (value > 300) {
            return 300;
        }
        return value;
    }

    function extractFileName(path) {
        if (typeof path !== 'string' || path.trim() === '') {
            return '';
        }
        const segments = path.split(/[\/]/);
        return segments[segments.length - 1] || path;
    }

    function buildSceneActionUrl(endpoint, action) {
        const baseEndpoint = typeof endpoint === 'string' && endpoint.trim() !== ''
            ? endpoint
            : 'scenes_handler.php';

        if (typeof URL === 'function') {
            try {
                const url = new URL(baseEndpoint, window.location.href);
                url.searchParams.set('action', action);
                return url.toString();
            } catch (error) {
                // fall back to manual concatenation below
            }
        }

        const separator = baseEndpoint.indexOf('?') >= 0 ? '&' : '?';
        return `${baseEndpoint}${separator}action=${encodeURIComponent(action)}`;
    }

    function handleJsonResponse(response) {
        if (typeof Response !== 'undefined' && response instanceof Response) {
            if (!response.ok) {
                throw new Error('Network error');
            }
            return response.json();
        }
        return response;
    }

    function isPlainObject(value) {
        if (value === null || typeof value !== 'object') {
            return false;
        }
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
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
