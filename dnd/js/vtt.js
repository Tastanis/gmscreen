(function () {
    'use strict';

    const GRID_OPACITY_STORAGE_KEY = 'vtt-grid-opacity';
    const GRID_OPACITY_DEFAULT = 0.7;
    const MAP_MIN_SCALE = 0.5;
    const MAP_MAX_SCALE = 4;
    const MAP_ABSOLUTE_MIN_SCALE = 0.05;
    const MAP_WHEEL_SENSITIVITY = 0.0015;
    const TOKEN_KEY_MOVE_INCREMENT = 0.25;

    onReady(initVtt);

    function onReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function initVtt() {
        const config = window.vttConfig || {};
        const state = createInitialState(config);
        const elements = queryElements();

        if (!elements.sceneDisplay || !elements.sceneMapContent || !elements.sceneMapGrid || !elements.tokenLayer) {
            return;
        }

        if (typeof window.initChatPanel === 'function') {
            window.initChatPanel(state.isGM, state.currentUser);
        }

        initSettingsPanel(state, elements);
        initMap(state, elements);
        initTokenLibraryInteractions(state, elements);

        const initialSceneId = state.activeSceneId || (state.scenes.length > 0 ? state.scenes[0].id : null);
        setActiveScene(state, elements, initialSceneId);
        renderTokenFilters(state, elements);
        renderTokenLibrary(state, elements);
    }

    function createInitialState(config) {
        const sceneData = isPlainObject(config.sceneData)
            ? normalizeSceneData(config.sceneData)
            : { folders: [], rootScenes: [] };
        const scenes = flattenScenes(sceneData);
        const activeSceneId = determineInitialSceneId(config.activeSceneId, scenes);
        const tokenLibrary = Array.isArray(config.tokenLibrary)
            ? config.tokenLibrary.map(normalizeLibraryToken).filter(Boolean)
            : [];
        const tokenLibraryById = new Map();
        tokenLibrary.forEach((token) => {
            tokenLibraryById.set(token.id, token);
        });

        const sceneTokensByScene = new Map();
        const initialSceneTokens = Array.isArray(config.activeSceneTokens)
            ? config.activeSceneTokens.map(normalizeSceneToken).filter(Boolean)
            : [];
        if (activeSceneId) {
            sceneTokensByScene.set(activeSceneId, initialSceneTokens);
        }

        return {
            isGM: Boolean(config.isGM),
            currentUser: typeof config.currentUser === 'string' ? config.currentUser : '',
            scenes,
            sceneData,
            activeSceneId,
            sceneTokensByScene,
            tokenLibrary,
            tokenLibraryById,
            selectedTokenId: null,
            activeGridScale: 50,
            mapTransform: { scale: 1, translateX: 0, translateY: 0 },
            mapBounds: { width: 0, height: 0 },
            pendingImageSceneId: null,
            gridOpacity: GRID_OPACITY_DEFAULT,
            tokenFilters: {
                folder: 'all',
                school: 'all',
            },
            activeTokenDrag: null,
            mapDrag: null,
        };
    }

    function queryElements() {
        return {
            sceneDisplay: document.getElementById('scene-display'),
            sceneName: document.getElementById('scene-display-name'),
            sceneDescription: document.getElementById('scene-display-description'),
            sceneMap: document.getElementById('scene-map'),
            sceneMapInner: document.getElementById('scene-map-inner'),
            sceneMapContent: document.getElementById('scene-map-content'),
            sceneMapImage: document.getElementById('scene-map-image'),
            sceneMapGrid: document.getElementById('scene-map-grid'),
            sceneMapEmpty: document.getElementById('scene-map-empty'),
            tokenLayer: document.getElementById('scene-token-layer'),
            gridOpacityControls: document.getElementById('scene-grid-controls'),
            gridOpacityInput: document.getElementById('scene-grid-opacity'),
            gridOpacityValue: document.getElementById('scene-grid-opacity-value'),
            settingsPanel: document.getElementById('settings-panel'),
            settingsToggle: document.getElementById('settings-panel-toggle'),
            settingsClose: document.getElementById('settings-panel-close'),
            settingsTabButtons: Array.from(document.querySelectorAll('.settings-panel__tab')),
            settingsTabPanels: Array.from(document.querySelectorAll('.settings-panel__tabpanel')),
            sceneSelector: document.getElementById('scene-selector'),
            tokenFolderList: document.getElementById('token-folder-list'),
            tokenGrid: document.getElementById('token-grid'),
            tokenSchoolFilters: document.getElementById('token-school-filters'),
        };
    }

    function initSettingsPanel(state, elements) {
        const { settingsPanel, settingsToggle, settingsClose, settingsTabButtons, settingsTabPanels, sceneSelector } = elements;
        if (!settingsPanel || !settingsToggle) {
            return;
        }

        let isOpen = false;
        closePanel();

        settingsToggle.addEventListener('click', function () {
            if (isOpen) {
                closePanel();
            } else {
                openPanel();
            }
        });

        if (settingsClose) {
            settingsClose.addEventListener('click', function () {
                closePanel();
                settingsToggle.focus();
            });
        }

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && isOpen) {
                closePanel();
                settingsToggle.focus();
            }
        });

        if (settingsTabButtons.length && settingsTabPanels.length) {
            const activateTab = function (button) {
                const targetId = button.getAttribute('data-tab-target');
                settingsTabButtons.forEach((tabButton) => {
                    const isActive = tabButton === button;
                    tabButton.classList.toggle('settings-panel__tab--active', isActive);
                    tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });
                settingsTabPanels.forEach((panel) => {
                    const isActive = panel.id === targetId;
                    panel.hidden = !isActive;
                    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
                });
            };

            settingsTabButtons.forEach((button) => {
                button.addEventListener('click', function () {
                    activateTab(button);
                });
            });

            activateTab(settingsTabButtons[0]);
        }

        if (sceneSelector) {
            sceneSelector.addEventListener('click', function (event) {
                if (!state.isGM) {
                    return;
                }
                const button = event.target.closest('[data-scene-id]');
                if (!button) {
                    return;
                }
                const sceneId = button.getAttribute('data-scene-id');
                setActiveScene(state, elements, sceneId);
            });
            sceneSelector.addEventListener('keydown', function (event) {
                if (!state.isGM) {
                    return;
                }
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                const button = event.target.closest('[data-scene-id]');
                if (!button) {
                    return;
                }
                event.preventDefault();
                const sceneId = button.getAttribute('data-scene-id');
                setActiveScene(state, elements, sceneId);
            });
        }

        function openPanel() {
            isOpen = true;
            settingsPanel.classList.add('settings-panel--open');
            settingsPanel.classList.remove('settings-panel--closed');
            settingsPanel.setAttribute('aria-hidden', 'false');
            settingsToggle.setAttribute('aria-expanded', 'true');
        }

        function closePanel() {
            isOpen = false;
            settingsPanel.classList.add('settings-panel--closed');
            settingsPanel.classList.remove('settings-panel--open');
            settingsPanel.setAttribute('aria-hidden', 'true');
            settingsToggle.setAttribute('aria-expanded', 'false');
        }
    }

    function initMap(state, elements) {
        const { sceneMapContent, sceneMapGrid, gridOpacityInput, gridOpacityValue, sceneMapImage } = elements;
        if (!sceneMapContent || !sceneMapGrid) {
            return;
        }

        const storedOpacity = loadStoredGridOpacity();
        state.gridOpacity = storedOpacity;
        applyGridOpacity(state, elements, storedOpacity, false);

        if (gridOpacityInput) {
            gridOpacityInput.value = String(Math.round(state.gridOpacity * 100));
            gridOpacityInput.addEventListener('input', function () {
                const value = clamp(Number(gridOpacityInput.value) / 100, 0, 1);
                applyGridOpacity(state, elements, value, true);
            });
        }
        if (gridOpacityValue) {
            gridOpacityValue.textContent = `${Math.round(state.gridOpacity * 100)}%`;
        }

        sceneMapContent.addEventListener('pointerdown', function (event) {
            if (event.button !== 0) {
                return;
            }
            if (event.target && event.target.closest('.scene-token')) {
                return;
            }
            if (typeof sceneMapContent.setPointerCapture === 'function') {
                try {
                    sceneMapContent.setPointerCapture(event.pointerId);
                } catch (error) {
                    // ignore
                }
            }
            state.mapDrag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originX: state.mapTransform.translateX,
                originY: state.mapTransform.translateY,
            };
            sceneMapContent.classList.add('scene-display__map-content--dragging');
        });

        sceneMapContent.addEventListener('pointermove', function (event) {
            const drag = state.mapDrag;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            const deltaX = event.clientX - drag.startX;
            const deltaY = event.clientY - drag.startY;
            state.mapTransform.translateX = drag.originX + deltaX;
            state.mapTransform.translateY = drag.originY + deltaY;
            applyMapTransform(state, elements);
        });

        const endDrag = function (event) {
            const drag = state.mapDrag;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            state.mapDrag = null;
            if (typeof sceneMapContent.releasePointerCapture === 'function') {
                try {
                    sceneMapContent.releasePointerCapture(event.pointerId);
                } catch (error) {
                    // ignore
                }
            }
            sceneMapContent.classList.remove('scene-display__map-content--dragging');
        };

        sceneMapContent.addEventListener('pointerup', endDrag);
        sceneMapContent.addEventListener('pointercancel', endDrag);

        sceneMapContent.addEventListener('wheel', function (event) {
            if (event.ctrlKey) {
                return;
            }
            event.preventDefault();
            const currentScale = state.mapTransform.scale;
            const factor = Math.exp(-event.deltaY * MAP_WHEEL_SENSITIVITY);
            let nextScale = clamp(currentScale * factor, MAP_ABSOLUTE_MIN_SCALE, MAP_MAX_SCALE);
            if (nextScale < MAP_MIN_SCALE && nextScale > currentScale) {
                nextScale = MAP_MIN_SCALE;
            }
            const rect = sceneMapContent.getBoundingClientRect();
            const focusX = event.clientX - rect.left;
            const focusY = event.clientY - rect.top;
            const ratio = nextScale / currentScale;
            state.mapTransform.translateX = focusX - ((focusX - state.mapTransform.translateX) * ratio);
            state.mapTransform.translateY = focusY - ((focusY - state.mapTransform.translateY) * ratio);
            state.mapTransform.scale = nextScale;
            applyMapTransform(state, elements);
            updateGridSize(state, elements);
        }, { passive: false });

        sceneMapContent.addEventListener('pointerdown', function (event) {
            if (event.button !== 0) {
                return;
            }
            if (event.target && event.target.closest('.scene-token')) {
                return;
            }
            deselectToken(state, elements);
        });

        if (sceneMapImage) {
            sceneMapImage.addEventListener('load', function () {
                if (state.pendingImageSceneId !== state.activeSceneId) {
                    return;
                }
                const naturalWidth = sceneMapImage.naturalWidth || 0;
                const naturalHeight = sceneMapImage.naturalHeight || 0;
                if (naturalWidth > 0 && naturalHeight > 0) {
                    state.mapBounds = {
                        width: naturalWidth / state.activeGridScale,
                        height: naturalHeight / state.activeGridScale,
                    };
                } else {
                    state.mapBounds = getFallbackMapBounds(sceneMapContent, state.activeGridScale);
                }
                renderSceneTokens(state, elements);
            });
            sceneMapImage.addEventListener('error', function () {
                if (state.pendingImageSceneId !== state.activeSceneId) {
                    return;
                }
                state.mapBounds = getFallbackMapBounds(sceneMapContent, state.activeGridScale);
                renderSceneTokens(state, elements);
            });
        }

        document.addEventListener('keydown', function (event) {
            if (!state.isGM) {
                return;
            }
            if (!state.selectedTokenId) {
                return;
            }
            if (isTypingIntoInput()) {
                return;
            }
            switch (event.key) {
                case 'Backspace':
                case 'Delete':
                    event.preventDefault();
                    removeSelectedToken(state, elements);
                    break;
                case 'Escape':
                    deselectToken(state, elements);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    moveSelectedToken(state, elements, 0, -(event.shiftKey ? 1 : TOKEN_KEY_MOVE_INCREMENT));
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    moveSelectedToken(state, elements, 0, (event.shiftKey ? 1 : TOKEN_KEY_MOVE_INCREMENT));
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    moveSelectedToken(state, elements, -(event.shiftKey ? 1 : TOKEN_KEY_MOVE_INCREMENT), 0);
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    moveSelectedToken(state, elements, (event.shiftKey ? 1 : TOKEN_KEY_MOVE_INCREMENT), 0);
                    break;
                default:
                    break;
            }
        });
    }

    function initTokenLibraryInteractions(state, elements) {
        const { tokenFolderList, tokenGrid, tokenSchoolFilters } = elements;
        if (tokenFolderList) {
            tokenFolderList.addEventListener('click', function (event) {
                const button = event.target.closest('[data-token-folder]');
                if (!button) {
                    return;
                }
                const folderId = button.getAttribute('data-token-folder') || 'all';
                state.tokenFilters.folder = folderId;
                renderTokenFilters(state, elements);
                renderTokenLibrary(state, elements);
            });
        }
        if (tokenSchoolFilters) {
            tokenSchoolFilters.addEventListener('click', function (event) {
                const button = event.target.closest('[data-token-school]');
                if (!button) {
                    return;
                }
                const schoolId = button.getAttribute('data-token-school') || 'all';
                state.tokenFilters.school = schoolId;
                renderTokenFilters(state, elements);
                renderTokenLibrary(state, elements);
            });
        }
        if (tokenGrid) {
            tokenGrid.addEventListener('click', function (event) {
                if (!state.isGM) {
                    return;
                }
                const card = event.target.closest('[data-token-library-id]');
                if (!card) {
                    return;
                }
                const tokenId = card.getAttribute('data-token-library-id');
                const libraryToken = state.tokenLibraryById.get(tokenId);
                if (!libraryToken) {
                    return;
                }
                spawnTokenFromLibrary(state, elements, libraryToken);
            });
            tokenGrid.addEventListener('keydown', function (event) {
                if (!state.isGM) {
                    return;
                }
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                const card = event.target.closest('[data-token-library-id]');
                if (!card) {
                    return;
                }
                event.preventDefault();
                const tokenId = card.getAttribute('data-token-library-id');
                const libraryToken = state.tokenLibraryById.get(tokenId);
                if (!libraryToken) {
                    return;
                }
                spawnTokenFromLibrary(state, elements, libraryToken);
            });
        }
    }

    function setActiveScene(state, elements, sceneId) {
        const scene = typeof sceneId === 'string'
            ? state.scenes.find((entry) => entry.id === sceneId)
            : null;
        state.activeSceneId = scene ? scene.id : null;

        if (state.activeSceneId && !state.sceneTokensByScene.has(state.activeSceneId)) {
            state.sceneTokensByScene.set(state.activeSceneId, []);
        }

        applySceneDisplay(state, elements, scene);
        renderSceneTokens(state, elements);
        updateGridSize(state, elements);
    }

    function applySceneDisplay(state, elements, scene) {
        const { sceneDisplay, sceneName, sceneDescription, sceneMap, sceneMapContent, sceneMapImage, sceneMapGrid, sceneMapEmpty } = elements;

        const accent = scene && typeof scene.accent === 'string' ? scene.accent : '';
        if (sceneDisplay) {
            sceneDisplay.setAttribute('data-scene-id', scene ? scene.id : '');
            sceneDisplay.setAttribute('data-scene-accent', accent);
        }

        if (sceneName) {
            sceneName.textContent = scene ? (scene.name || 'Untitled Scene') : 'Waiting for the GM to pick a scene';
        }

        if (sceneDescription) {
            const description = scene && typeof scene.description === 'string' && scene.description.trim() !== ''
                ? scene.description
                : 'When the GM activates a scene it will appear here for everyone at the table.';
            sceneDescription.textContent = description;
        }

        const mapImage = scene && scene.map ? scene.map.image : '';
        const gridScale = scene && scene.map ? clampGridScale(scene.map.gridScale) : 50;
        state.activeGridScale = gridScale;
        state.mapTransform = { scale: 1, translateX: 0, translateY: 0 };
        applyMapTransform(state, elements);
        state.mapBounds = { width: 0, height: 0 };
        state.pendingImageSceneId = scene ? scene.id : null;

        if (sceneMap) {
            sceneMap.setAttribute('data-grid-scale', String(gridScale));
            sceneMap.classList.toggle('scene-display__map--empty', !mapImage);
        }

        if (sceneMapContent) {
            sceneMapContent.classList.toggle('scene-display__map-content--inactive', !mapImage);
        }

        if (sceneMapGrid) {
            sceneMapGrid.style.setProperty('--grid-size', `${gridScale}px`);
        }

        if (sceneMapEmpty) {
            sceneMapEmpty.hidden = Boolean(mapImage);
        }

        if (sceneMapImage) {
            if (mapImage) {
                const currentSrc = sceneMapImage.getAttribute('src');
                if (currentSrc !== mapImage) {
                    sceneMapImage.src = mapImage;
                } else if (sceneMapImage.complete && sceneMapImage.naturalWidth > 0) {
                    state.mapBounds = {
                        width: sceneMapImage.naturalWidth / gridScale,
                        height: sceneMapImage.naturalHeight / gridScale,
                    };
                } else {
                    state.mapBounds = getFallbackMapBounds(sceneMapContent, gridScale);
                }
                sceneMapImage.classList.remove('scene-display__map-image--hidden');
            } else {
                sceneMapImage.classList.add('scene-display__map-image--hidden');
                sceneMapImage.removeAttribute('src');
                state.mapBounds = getFallbackMapBounds(sceneMapContent, gridScale);
            }
        }

        deselectToken(state, elements);
        renderSceneSelector(state, elements);
    }

    function renderSceneSelector(state, elements) {
        const { sceneSelector } = elements;
        if (!sceneSelector) {
            return;
        }
        if (!state.isGM) {
            sceneSelector.replaceChildren();
            return;
        }

        const fragment = document.createDocumentFragment();

        const addSceneButton = function (scene, groupLabel) {
            if (!scene) {
                return;
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'scene-selector__option';
            button.setAttribute('data-scene-id', scene.id);
            const optionId = `scene-option-${scene.id}`;
            button.id = optionId;
            button.setAttribute('role', 'option');
            button.textContent = scene.name || 'Untitled Scene';
            if (groupLabel) {
                button.setAttribute('data-scene-group', groupLabel);
            }
            const isActive = scene.id === state.activeSceneId;
            button.classList.toggle('scene-selector__option--active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            fragment.appendChild(button);
        };

        const rootScenes = Array.isArray(state.sceneData.rootScenes) ? state.sceneData.rootScenes : [];
        rootScenes.forEach((scene) => addSceneButton(scene, 'Scenes'));

        const folders = Array.isArray(state.sceneData.folders) ? state.sceneData.folders : [];
        folders.forEach((folder) => {
            if (!folder || !Array.isArray(folder.scenes)) {
                return;
            }
            const label = folder.name || 'Folder';
            folder.scenes.forEach((scene) => addSceneButton(scene, label));
        });

        if (!fragment.children.length) {
            const empty = document.createElement('p');
            empty.className = 'scene-selector__empty';
            empty.textContent = 'No scenes are available.';
            sceneSelector.replaceChildren(empty);
            sceneSelector.removeAttribute('aria-activedescendant');
            return;
        }

        sceneSelector.replaceChildren(fragment);
        if (state.activeSceneId) {
            sceneSelector.setAttribute('aria-activedescendant', `scene-option-${state.activeSceneId}`);
        } else {
            sceneSelector.removeAttribute('aria-activedescendant');
        }
    }

    function renderTokenFilters(state, elements) {
        const { tokenFolderList, tokenSchoolFilters } = elements;
        const folderLabels = {
            all: 'All',
            pcs: 'PCs',
            npcs: 'NPCs',
            monsters: 'Monsters',
        };
        const schoolLabels = {
            all: 'All',
            lorehold: 'Lorehold',
            prismari: 'Prismari',
            quandrix: 'Quandrix',
            silverquill: 'Silverquill',
            witherbloom: 'Witherbloom',
            other: 'Other',
        };

        if (tokenFolderList) {
            const folders = new Set(['all']);
            state.tokenLibrary.forEach((token) => {
                if (token.folderId) {
                    folders.add(token.folderId);
                }
            });
            const fragment = document.createDocumentFragment();
            folders.forEach((folderId) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'token-folder-button';
                button.setAttribute('data-token-folder', folderId);
                button.textContent = folderLabels[folderId] || folderId;
                if (folderId === state.tokenFilters.folder) {
                    button.classList.add('token-folder-button--active');
                }
                fragment.appendChild(button);
            });
            tokenFolderList.replaceChildren(fragment);
        }

        if (tokenSchoolFilters) {
            const schools = new Set(['all']);
            state.tokenLibrary.forEach((token) => {
                if (token.schoolId) {
                    schools.add(token.schoolId);
                }
            });
            const fragment = document.createDocumentFragment();
            schools.forEach((schoolId) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'token-filter-button';
                button.setAttribute('data-token-school', schoolId);
                button.textContent = schoolLabels[schoolId] || schoolId;
                if (schoolId === state.tokenFilters.school) {
                    button.classList.add('token-filter-button--active');
                }
                fragment.appendChild(button);
            });
            tokenSchoolFilters.replaceChildren(fragment);
        }
    }

    function renderTokenLibrary(state, elements) {
        const { tokenGrid } = elements;
        if (!tokenGrid) {
            return;
        }

        const tokens = state.tokenLibrary.filter((token) => {
            if (!token) {
                return false;
            }
            if (state.tokenFilters.folder !== 'all' && token.folderId !== state.tokenFilters.folder) {
                return false;
            }
            if (state.tokenFilters.school !== 'all' && token.schoolId !== state.tokenFilters.school) {
                return false;
            }
            return true;
        });

        if (!tokens.length) {
            const message = document.createElement('div');
            message.className = 'token-browser__list token-browser__list--empty';
            message.textContent = 'No tokens match the selected filters.';
            tokenGrid.replaceChildren(message);
            return;
        }

        const list = document.createElement('div');
        list.className = 'token-browser__list';

        tokens.forEach((token) => {
            const card = document.createElement('div');
            card.className = 'token-card';
            card.setAttribute('data-token-library-id', token.id);
            if (state.isGM) {
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');
                card.setAttribute('aria-label', `Add ${token.name} to the scene`);
            } else {
                card.setAttribute('role', 'listitem');
            }

            const portrait = document.createElement('div');
            portrait.className = 'token-card__portrait';
            const image = document.createElement('img');
            image.className = 'token-card__portrait-image';
            image.alt = `${token.name} token`;
            image.src = token.imageData;
            portrait.appendChild(image);
            card.appendChild(portrait);

            const name = document.createElement('h4');
            name.className = 'token-card__name';
            name.textContent = token.name;
            card.appendChild(name);

            const meta = document.createElement('div');
            meta.className = 'token-card__meta';
            const details = document.createElement('div');
            details.className = 'token-card__details';

            const size = document.createElement('span');
            size.className = 'token-pill token-pill--size';
            size.textContent = `${token.size.width} × ${token.size.height}`;
            details.appendChild(size);

            if (typeof token.stamina === 'number' && token.stamina > 0) {
                const stamina = document.createElement('span');
                stamina.className = 'token-pill token-pill--stamina';
                stamina.textContent = `${token.stamina} HP`;
                details.appendChild(stamina);
            }

            const school = document.createElement('span');
            school.className = `token-pill token-pill--school-${token.schoolId}`;
            school.textContent = token.schoolId.charAt(0).toUpperCase() + token.schoolId.slice(1);
            details.appendChild(school);

            meta.appendChild(details);
            card.appendChild(meta);

            list.appendChild(card);
        });

        tokenGrid.replaceChildren(list);
    }

    function renderSceneTokens(state, elements) {
        const { tokenLayer } = elements;
        if (!tokenLayer) {
            return;
        }
        tokenLayer.innerHTML = '';
        if (!state.activeSceneId) {
            return;
        }
        const tokens = getActiveSceneTokens(state);
        if (!tokens.length) {
            return;
        }
        const gridScale = state.activeGridScale || 50;
        const bounds = state.mapBounds;
        const fragment = document.createDocumentFragment();

        tokens.forEach((token) => {
            clampTokenPosition(token, bounds);
            const element = document.createElement('div');
            element.className = 'scene-token';
            element.setAttribute('data-scene-token-id', token.id);
            if (token.name) {
                element.title = token.name;
                element.setAttribute('aria-label', state.isGM ? token.name : `${token.name} token`);
            }
            element.style.width = `${token.size.width * gridScale}px`;
            element.style.height = `${token.size.height * gridScale}px`;
            element.style.left = `${token.position.x * gridScale}px`;
            element.style.top = `${token.position.y * gridScale}px`;
            element.style.backgroundImage = `url(${token.imageData})`;

            if (state.isGM) {
                element.setAttribute('role', 'button');
                element.tabIndex = 0;
                element.addEventListener('click', function (event) {
                    event.preventDefault();
                    selectToken(state, elements, token.id);
                });
                element.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectToken(state, elements, token.id);
                    }
                });
                element.addEventListener('pointerdown', function (event) {
                    if (event.button !== 0) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    selectToken(state, elements, token.id);
                    if (typeof element.setPointerCapture === 'function') {
                        try {
                            element.setPointerCapture(event.pointerId);
                        } catch (error) {
                            // ignore
                        }
                    }
                    state.activeTokenDrag = {
                        pointerId: event.pointerId,
                        element,
                        token,
                        startX: event.clientX,
                        startY: event.clientY,
                        originX: token.position.x,
                        originY: token.position.y,
                    };
                });
                element.addEventListener('pointermove', function (event) {
                    const drag = state.activeTokenDrag;
                    if (!drag || drag.pointerId !== event.pointerId) {
                        return;
                    }
                    event.preventDefault();
                    const scale = state.mapTransform.scale || 1;
                    const deltaX = (event.clientX - drag.startX) / (gridScale * scale);
                    const deltaY = (event.clientY - drag.startY) / (gridScale * scale);
                    const nextPosition = {
                        x: drag.originX + deltaX,
                        y: drag.originY + deltaY,
                    };
                    clampTokenPositionWithSize(nextPosition, drag.token.size, state.mapBounds);
                    drag.token.position = nextPosition;
                    element.style.left = `${nextPosition.x * gridScale}px`;
                    element.style.top = `${nextPosition.y * gridScale}px`;
                });
                const endDrag = function (event) {
                    const drag = state.activeTokenDrag;
                    if (!drag || drag.pointerId !== event.pointerId) {
                        return;
                    }
                    state.activeTokenDrag = null;
                    if (typeof element.releasePointerCapture === 'function') {
                        try {
                            element.releasePointerCapture(event.pointerId);
                        } catch (error) {
                            // ignore
                        }
                    }
                };
                element.addEventListener('pointerup', endDrag);
                element.addEventListener('pointercancel', endDrag);
            } else {
                element.setAttribute('role', 'img');
            }

            if (token.id === state.selectedTokenId) {
                element.classList.add('scene-token--selected');
            }

            fragment.appendChild(element);
        });

        tokenLayer.appendChild(fragment);
        updateTokenSelection(state, elements);
    }

    function selectToken(state, elements, tokenId) {
        if (!tokenId) {
            return;
        }
        state.selectedTokenId = tokenId;
        updateTokenSelection(state, elements);
        focusTokenElement(elements, tokenId);
    }

    function deselectToken(state, elements) {
        if (!state.selectedTokenId) {
            return;
        }
        state.selectedTokenId = null;
        updateTokenSelection(state, elements);
    }

    function updateTokenSelection(state, elements) {
        const { tokenLayer } = elements;
        if (!tokenLayer) {
            return;
        }
        const tokens = tokenLayer.querySelectorAll('.scene-token');
        tokens.forEach((element) => {
            const tokenId = element.getAttribute('data-scene-token-id');
            const isSelected = tokenId === state.selectedTokenId;
            element.classList.toggle('scene-token--selected', isSelected);
            if (state.isGM) {
                element.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            }
        });
    }

    function moveSelectedToken(state, elements, deltaX, deltaY) {
        if (!state.selectedTokenId) {
            return;
        }
        const tokens = getActiveSceneTokens(state);
        const token = tokens.find((entry) => entry && entry.id === state.selectedTokenId);
        if (!token) {
            return;
        }
        token.position.x += deltaX;
        token.position.y += deltaY;
        clampTokenPosition(token, state.mapBounds);
        renderSceneTokens(state, elements);
        focusTokenElement(elements, token.id);
    }

    function removeSelectedToken(state, elements) {
        if (!state.selectedTokenId) {
            return;
        }
        const tokens = getActiveSceneTokens(state);
        const index = tokens.findIndex((entry) => entry && entry.id === state.selectedTokenId);
        if (index === -1) {
            return;
        }
        tokens.splice(index, 1);
        state.selectedTokenId = null;
        renderSceneTokens(state, elements);
    }

    function getActiveSceneTokens(state) {
        if (!state.activeSceneId) {
            return [];
        }
        let tokens = state.sceneTokensByScene.get(state.activeSceneId);
        if (!tokens) {
            tokens = [];
            state.sceneTokensByScene.set(state.activeSceneId, tokens);
        }
        return tokens;
    }

    function spawnTokenFromLibrary(state, elements, libraryToken) {
        if (!state.activeSceneId) {
            return;
        }
        const tokens = getActiveSceneTokens(state);
        const token = {
            id: createTokenId(),
            libraryId: libraryToken.id,
            name: libraryToken.name,
            imageData: libraryToken.imageData,
            size: {
                width: libraryToken.size.width,
                height: libraryToken.size.height,
            },
            position: { x: 0, y: 0 },
        };
        const bounds = state.mapBounds;
        if (Number.isFinite(bounds.width) && bounds.width > 0) {
            token.position.x = Math.max(0, (bounds.width - token.size.width) / 2);
        }
        if (Number.isFinite(bounds.height) && bounds.height > 0) {
            token.position.y = Math.max(0, (bounds.height - token.size.height) / 2);
        }
        tokens.push(token);
        state.selectedTokenId = token.id;
        renderSceneTokens(state, elements);
        focusTokenElement(elements, token.id);
    }

    function clampTokenPosition(token, bounds) {
        if (!token) {
            return;
        }
        clampTokenPositionWithSize(token.position, token.size, bounds);
    }

    function clampTokenPositionWithSize(position, size, bounds) {
        if (!position || !size) {
            return;
        }
        position.x = sanitizeNumber(position.x);
        position.y = sanitizeNumber(position.y);
        const maxX = Number.isFinite(bounds.width) && bounds.width > 0
            ? Math.max(0, bounds.width - size.width)
            : null;
        const maxY = Number.isFinite(bounds.height) && bounds.height > 0
            ? Math.max(0, bounds.height - size.height)
            : null;
        if (position.x < 0) {
            position.x = 0;
        }
        if (position.y < 0) {
            position.y = 0;
        }
        if (maxX !== null && position.x > maxX) {
            position.x = maxX;
        }
        if (maxY !== null && position.y > maxY) {
            position.y = maxY;
        }
    }

    function sanitizeNumber(value) {
        return Number.isFinite(value) ? value : 0;
    }

    function applyMapTransform(state, elements) {
        const { sceneMapContent } = elements;
        if (!sceneMapContent) {
            return;
        }
        const transform = `translate(${state.mapTransform.translateX}px, ${state.mapTransform.translateY}px) scale(${state.mapTransform.scale})`;
        sceneMapContent.style.transform = transform;
    }

    function updateGridSize(state, elements) {
        const { sceneMapGrid } = elements;
        if (!sceneMapGrid) {
            return;
        }
        sceneMapGrid.style.setProperty('--grid-size', `${state.activeGridScale}px`);
    }

    function focusTokenElement(elements, tokenId) {
        if (!elements.tokenLayer || !tokenId) {
            return;
        }
        const selector = `[data-scene-token-id="${escapeCss(tokenId)}"]`;
        const element = elements.tokenLayer.querySelector(selector);
        if (element && typeof element.focus === 'function') {
            element.focus({ preventScroll: true });
        }
    }

    function escapeCss(value) {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(value);
        }
        return String(value).replace(/"/g, '\"');
    }

    function getFallbackMapBounds(sceneMapContent, gridScale) {
        if (!sceneMapContent || !(gridScale > 0)) {
            return { width: 0, height: 0 };
        }
        const rect = sceneMapContent.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            return {
                width: rect.width / gridScale,
                height: rect.height / gridScale,
            };
        }
        return { width: 0, height: 0 };
    }

    function loadStoredGridOpacity() {
        try {
            const stored = window.localStorage.getItem(GRID_OPACITY_STORAGE_KEY);
            if (stored !== null) {
                const parsed = Number.parseFloat(stored);
                if (Number.isFinite(parsed)) {
                    return clamp(parsed, 0, 1);
                }
            }
        } catch (error) {
            // ignore storage errors
        }
        return GRID_OPACITY_DEFAULT;
    }

    function applyGridOpacity(state, elements, value, persist) {
        const opacity = clamp(value, 0, 1);
        state.gridOpacity = opacity;
        const percent = Math.round(opacity * 100);
        if (elements.gridOpacityInput) {
            elements.gridOpacityInput.value = String(percent);
        }
        if (elements.gridOpacityValue) {
            elements.gridOpacityValue.textContent = `${percent}%`;
        }
        if (elements.sceneMapGrid) {
            elements.sceneMapGrid.style.setProperty('--grid-opacity', String(opacity));
        }
        if (persist) {
            try {
                window.localStorage.setItem(GRID_OPACITY_STORAGE_KEY, String(opacity));
            } catch (error) {
                // ignore storage errors
            }
        }
    }

    function normalizeSceneData(data) {
        const normalizeScene = function (scene) {
            if (!isPlainObject(scene)) {
                return null;
            }
            const id = typeof scene.id === 'string' ? scene.id : '';
            const name = typeof scene.name === 'string' ? scene.name : 'Untitled Scene';
            const description = typeof scene.description === 'string' ? scene.description : '';
            const accent = typeof scene.accent === 'string' ? scene.accent : '';
            const map = isPlainObject(scene.map) ? scene.map : {};
            const image = typeof map.image === 'string' ? map.image : '';
            const gridScale = clampGridScale(map.gridScale);
            return {
                id,
                name,
                description,
                accent,
                map: {
                    image,
                    gridScale,
                },
            };
        };

        const folders = Array.isArray(data.folders) ? data.folders : [];
        const normalizedFolders = folders.map((folder) => {
            if (!isPlainObject(folder)) {
                return null;
            }
            const id = typeof folder.id === 'string' ? folder.id : '';
            const name = typeof folder.name === 'string' ? folder.name : 'Folder';
            const scenes = Array.isArray(folder.scenes)
                ? folder.scenes.map(normalizeScene).filter(Boolean)
                : [];
            return { id, name, scenes };
        }).filter(Boolean);

        const rootScenes = Array.isArray(data.rootScenes)
            ? data.rootScenes.map(normalizeScene).filter(Boolean)
            : [];

        return { folders: normalizedFolders, rootScenes };
    }

    function flattenScenes(data) {
        const scenes = [];
        if (Array.isArray(data.rootScenes)) {
            data.rootScenes.forEach((scene) => {
                if (scene) {
                    scenes.push(scene);
                }
            });
        }
        if (Array.isArray(data.folders)) {
            data.folders.forEach((folder) => {
                if (!folder || !Array.isArray(folder.scenes)) {
                    return;
                }
                folder.scenes.forEach((scene) => {
                    if (scene) {
                        scenes.push(scene);
                    }
                });
            });
        }
        return scenes;
    }

    function normalizeLibraryToken(entry) {
        if (!isPlainObject(entry)) {
            return null;
        }
        const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : null;
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        const imageData = typeof entry.imageData === 'string' ? entry.imageData : '';
        if (!id || !name || !imageData) {
            return null;
        }
        const folderId = typeof entry.folderId === 'string' ? entry.folderId : 'pcs';
        const schoolId = typeof entry.schoolId === 'string' ? entry.schoolId : 'other';
        const size = isPlainObject(entry.size) ? entry.size : {};
        const width = clamp(Number(size.width) || 1, 1, 12);
        const height = clamp(Number(size.height) || 1, 1, 12);
        const staminaValue = Number(entry.stamina);
        const stamina = Number.isFinite(staminaValue) ? Math.max(0, Math.round(staminaValue)) : 0;

        return {
            id,
            name,
            imageData,
            folderId,
            schoolId,
            size: { width, height },
            stamina,
        };
    }

    function normalizeSceneToken(entry) {
        if (!isPlainObject(entry)) {
            return null;
        }
        const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : null;
        const imageData = typeof entry.imageData === 'string' ? entry.imageData : '';
        if (!id || !imageData) {
            return null;
        }
        const libraryId = typeof entry.libraryId === 'string' ? entry.libraryId : '';
        const name = typeof entry.name === 'string' ? entry.name : '';
        const sizeData = isPlainObject(entry.size) ? entry.size : {};
        const width = clamp(Number(sizeData.width) || 1, 1, 12);
        const height = clamp(Number(sizeData.height) || 1, 1, 12);
        const positionData = isPlainObject(entry.position) ? entry.position : {};
        const x = Number(positionData.x);
        const y = Number(positionData.y);

        return {
            id,
            libraryId,
            name,
            imageData,
            size: { width, height },
            position: {
                x: Number.isFinite(x) ? x : 0,
                y: Number.isFinite(y) ? y : 0,
            },
        };
    }

    function determineInitialSceneId(initialSceneId, scenes) {
        if (typeof initialSceneId === 'string' && scenes.some((scene) => scene && scene.id === initialSceneId)) {
            return initialSceneId;
        }
        return scenes.length > 0 ? scenes[0].id : null;
    }

    function clampGridScale(value) {
        const scale = Number(value);
        if (!Number.isFinite(scale)) {
            return 50;
        }
        return clamp(scale, 10, 300);
    }

    function clamp(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return typeof min === 'number' ? min : 0;
        }
        let result = number;
        if (typeof min === 'number' && result < min) {
            result = min;
        }
        if (typeof max === 'number' && result > max) {
            result = max;
        }
        return result;
    }

    function createTokenId() {
        return `scene-token-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function isPlainObject(value) {
        return Object.prototype.toString.call(value) === '[object Object]';
    }

    function isTypingIntoInput() {
        const active = document.activeElement;
        if (!active) {
            return false;
        }
        if (active.isContentEditable) {
            return true;
        }
        const tag = active.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }
})();
