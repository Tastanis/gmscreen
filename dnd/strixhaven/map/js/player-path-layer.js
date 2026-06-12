/**
 * Shared player destination markers and travel path overlay.
 */

class PlayerPathLayer {
    constructor(mapInterface) {
        this.mapInterface = mapInterface;
        this.hexGrid = mapInterface.hexGrid;
        this.apiEndpoint = 'api/player-path-api.php';

        this.modeActive = false;
        this.tool = 'marker';
        this.markers = new Map();
        this.terrain = new Map();
        this.pathSections = [];
        this.drawLock = null;
        this.canUndo = false;
        this.activeSectionId = null;
        this.isDraggingPath = false;
        this.drawUndoStack = [];
        this.terrainVisible = false;
        this.terrainDifficulty = 'yellow';
        this.isPaintingTerrain = false;
        this.pendingTerrainCells = new Map();
        this.lastSavedPathJson = '';
        this.pathSaveRequestId = 0;
        this.pollInterval = null;
        this.heartbeatInterval = null;
        this.selectedHex = null;
        this.syncState = null;

        this.elements = {};

        this.colors = {
            markerStroke: '#c7ff2e',
            markerFill: 'rgba(199, 255, 46, 0.12)',
            markerGlow: 'rgba(199, 255, 46, 0.72)',
            pathStroke: '#d8ff3f',
            pathHalo: 'rgba(216, 255, 63, 0.28)',
            pathText: '#f6ffd3',
            terrain: {
                fast: 'rgba(51, 214, 106, 0.42)',
                yellow: 'rgba(255, 217, 64, 0.44)',
                red: 'rgba(255, 66, 66, 0.46)'
            },
            terrainStroke: {
                fast: 'rgba(108, 255, 155, 0.9)',
                yellow: 'rgba(255, 237, 110, 0.92)',
                red: 'rgba(255, 113, 113, 0.95)'
            }
        };

        this.travelCosts = {
            normal: 1 / 3,
            fast: 1 / 26,
            yellow: 0.5,
            red: 1
        };
    }

    initialize() {
        this.cacheElements();
        this.setupEvents();
        this.loadState();
        this.startPolling();
        this.updateUi();
    }

    cacheElements() {
        this.elements.panel = document.getElementById('player-path-panel');
        this.elements.toggle = document.getElementById('player-path-toggle');
        this.elements.markerTool = document.getElementById('player-path-marker-tool');
        this.elements.drawTool = document.getElementById('player-path-draw-tool');
        this.elements.deleteTool = document.getElementById('player-path-delete-tool');
        this.elements.newSection = document.getElementById('player-path-new-section');
        this.elements.undo = document.getElementById('player-path-undo');
        this.elements.clear = document.getElementById('player-path-clear');
        this.elements.total = document.getElementById('player-path-total');
        this.elements.status = document.getElementById('player-path-status');
        this.elements.sync = document.getElementById('player-path-sync');
        this.elements.terrainPanel = document.getElementById('player-terrain-panel');
        this.elements.terrainToggle = document.getElementById('player-terrain-toggle');
        this.elements.terrainButtons = Array.from(document.querySelectorAll('[data-terrain-difficulty]'));

        this.elements.modal = document.getElementById('player-marker-modal');
        this.elements.modalTitle = document.getElementById('player-marker-title');
        this.elements.note = document.getElementById('player-marker-note');
        this.elements.save = document.getElementById('player-marker-save');
        this.elements.delete = document.getElementById('player-marker-delete');
        this.elements.cancel = document.getElementById('player-marker-cancel');
        this.elements.close = document.getElementById('player-marker-close');
    }

    setupEvents() {
        this.elements.toggle?.addEventListener('click', () => this.toggleMode());
        this.elements.markerTool?.addEventListener('click', () => this.setTool('marker'));
        this.elements.drawTool?.addEventListener('click', () => this.setTool('draw'));
        this.elements.deleteTool?.addEventListener('click', () => this.setTool('delete'));
        this.elements.newSection?.addEventListener('click', () => this.startNewSection());
        this.elements.undo?.addEventListener('click', () => this.undo());
        this.elements.clear?.addEventListener('click', () => this.clearAll());
        this.elements.terrainToggle?.addEventListener('click', () => this.toggleTerrainMode());
        this.elements.terrainButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.terrainDifficulty = button.dataset.terrainDifficulty || 'yellow';
                this.updateUi();
            });
        });

        this.elements.save?.addEventListener('click', () => this.saveMarkerFromModal());
        this.elements.delete?.addEventListener('click', () => this.deleteMarkerFromModal());
        this.elements.cancel?.addEventListener('click', () => this.closeMarkerModal());
        this.elements.close?.addEventListener('click', () => this.closeMarkerModal());

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Shift' && !event.repeat && !this.isTypingTarget(event.target)) {
                event.preventDefault();
                this.toggleMode();
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && this.modeActive && !this.isTypingTarget(event.target)) {
                event.preventDefault();
                this.undo();
            }

            if (event.key === 'Escape') {
                if (this.elements.modal?.style.display === 'flex') {
                    this.closeMarkerModal();
                } else if (this.modeActive && this.tool === 'draw') {
                    this.setTool('marker');
                }
            }
        });

        this.hexGrid.canvas.addEventListener('mousedown', (event) => {
            if (this.modeActive && this.tool === 'terrain' && this.canPaintTerrain()) {
                if (event.button !== 0) {
                    return;
                }
                event.preventDefault();
                this.isPaintingTerrain = true;
                this.paintTerrainFromClient(event.clientX, event.clientY);
                return;
            }

            if (!this.modeActive || this.tool !== 'draw' || !this.hasOwnDrawLock()) {
                return;
            }
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            this.isDraggingPath = true;
            this.addRouteHexFromClient(event.clientX, event.clientY);
        });

        this.hexGrid.canvas.addEventListener('mousemove', (event) => {
            if (this.isPaintingTerrain && this.modeActive && this.tool === 'terrain' && this.canPaintTerrain()) {
                this.paintTerrainFromClient(event.clientX, event.clientY);
                return;
            }

            if (!this.isDraggingPath || !this.modeActive || this.tool !== 'draw' || !this.hasOwnDrawLock()) {
                return;
            }
            this.addRouteHexFromClient(event.clientX, event.clientY);
        });

        document.addEventListener('mouseup', () => {
            if (this.isDraggingPath) {
                this.isDraggingPath = false;
                this.savePathSoon();
            }
            if (this.isPaintingTerrain) {
                this.isPaintingTerrain = false;
                this.flushTerrainPatch();
            }
        });

        window.addEventListener('beforeunload', () => {
            if (this.hasOwnDrawLock()) {
                navigator.sendBeacon?.(this.apiEndpoint, JSON.stringify({ action: 'release_lock' }));
            }
        });
    }

    isTypingTarget(target) {
        if (!target) return false;
        const tagName = target.tagName ? target.tagName.toLowerCase() : '';
        return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
    }

    setSyncStatus(state) {
        if (this.syncState === state) {
            return;
        }
        this.syncState = state;

        const dot = this.elements.sync;
        if (!dot) {
            return;
        }
        dot.classList.remove('player-path-sync--synced', 'player-path-sync--syncing', 'player-path-sync--error');
        dot.classList.add(`player-path-sync--${state}`);
        dot.title = state === 'synced' ? 'Synced'
            : state === 'syncing' ? 'Syncing...'
            : 'Sync error - retrying';
    }

    async request(action, payload = {}, options = {}) {
        this.setSyncStatus('syncing');
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...payload })
            });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Player path request failed');
            }
            if (options.applyState !== false) {
                this.applyState(data.data, {
                    forcePathUpdate: options.forcePathUpdate ?? ['undo', 'save_path', 'delete_path_segment', 'release_lock'].includes(action)
                });
            }
            this.setSyncStatus('synced');
            return data.data;
        } catch (error) {
            this.setSyncStatus('error');
            throw error;
        }
    }

    async loadState() {
        try {
            const response = await fetch(`${this.apiEndpoint}?action=get_state`, {
                method: 'GET',
                cache: 'no-store'
            });
            const data = await response.json();
            if (data.success) {
                this.applyState(data.data);
                this.setSyncStatus('synced');
            } else {
                this.setSyncStatus('error');
            }
        } catch (error) {
            this.setSyncStatus('error');
            console.debug('Player path state load failed:', error);
        }
    }

    startPolling() {
        this.pollInterval = setInterval(() => {
            if (!document.hidden) {
                this.loadState();
            }
        }, 1500);
    }

    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.heartbeatInterval = setInterval(() => {
            if (this.hasOwnDrawLock()) {
                this.request('heartbeat_lock').catch(() => {});
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    applyState(state, options = {}) {
        if (!state) return;
        const preserveLocalPath = !options.forcePathUpdate && this.hasOwnDrawLock() && this.tool === 'draw';

        this.markers.clear();
        for (const [coords, marker] of Object.entries(state.markers || {})) {
            this.markers.set(coords, marker);
        }

        this.terrain.clear();
        for (const [coords, terrain] of Object.entries(state.terrain || {})) {
            this.terrain.set(coords, terrain);
        }

        if (!preserveLocalPath) {
            this.pathSections = Array.isArray(state.path?.sections) ? state.path.sections : [];
        }
        this.drawLock = state.drawLock || null;
        this.canUndo = !!state.canUndo;

        if (!this.hasOwnDrawLock() && this.tool === 'draw') {
            this.tool = 'marker';
            this.stopHeartbeat();
        }

        this.updateUi();
        this.hexGrid.render();
    }

    async toggleMode(forceState = null) {
        const nextState = typeof forceState === 'boolean' ? forceState : !this.modeActive;
        this.modeActive = nextState;

        if (!this.modeActive) {
            this.closeMarkerModal();
            if (this.hasOwnDrawLock()) {
                await this.releaseOwnDrawLock(true);
            }
            this.tool = 'marker';
            this.isDraggingPath = false;
            this.drawUndoStack = [];
            this.isPaintingTerrain = false;
            this.terrainVisible = false;
        }

        this.updateUi();
        this.hexGrid.render();
    }

    async setTool(tool) {
        const previousTool = this.tool;
        if (!this.modeActive) {
            this.toggleMode(true);
        }

        if (tool === 'terrain' && !this.canPaintTerrain()) {
            return;
        }

        if (tool === 'draw') {
            if (!this.hasOwnDrawLock()) {
                try {
                    await this.request('acquire_lock');
                    this.startHeartbeat();
                } catch (error) {
                    UIKit.toast(error.message, 'error');
                    return;
                }
            }
        } else if (this.tool === 'draw' && this.hasOwnDrawLock()) {
            await this.releaseOwnDrawLock(true);
        }

        this.tool = tool;
        if (tool === 'terrain') {
            this.terrainVisible = true;
        }
        if (tool === 'draw' && previousTool !== 'draw') {
            this.drawUndoStack = [];
            this.captureDrawUndoState();
        }
        this.updateUi();
    }

    async releaseOwnDrawLock(saveFirst) {
        clearTimeout(this.savePathTimer);
        if (saveFirst) {
            await this.savePath();
        }
        await this.request('release_lock').catch(() => {});
        this.stopHeartbeat();
        this.activeSectionId = null;
        this.drawUndoStack = [];
    }

    hasOwnDrawLock() {
        return !!this.drawLock
            && this.drawLock.user === window.USER_DATA?.username
            && this.drawLock.sessionId === window.USER_DATA?.sessionId;
    }

    isLockedByOther() {
        return !!this.drawLock && !this.hasOwnDrawLock();
    }

    updateUi() {
        this.elements.panel?.classList.toggle('player-path-panel--active', this.modeActive);
        this.elements.toggle?.classList.toggle('active', this.modeActive);
        this.elements.markerTool?.classList.toggle('active', this.tool === 'marker');
        this.elements.drawTool?.classList.toggle('active', this.tool === 'draw');
        this.elements.deleteTool?.classList.toggle('active', this.tool === 'delete');
        this.elements.terrainPanel?.classList.toggle('player-terrain-panel--active', this.modeActive && this.canUseTerrainUi() && this.terrainVisible);
        this.elements.terrainToggle?.classList.toggle('active', this.modeActive && this.terrainVisible);
        this.elements.terrainToggle?.classList.toggle('player-path-hidden', !this.canUseTerrainUi());
        this.elements.terrainButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.terrainDifficulty === this.terrainDifficulty);
        });

        if (this.elements.undo) {
            this.elements.undo.disabled = !this.canUndo && !this.canUndoDrawLocally();
        }
        if (this.elements.drawTool) {
            this.elements.drawTool.disabled = this.isLockedByOther();
        }
        if (this.elements.newSection) {
            this.elements.newSection.disabled = !this.hasOwnDrawLock() || this.tool !== 'draw';
        }

        const total = this.getTotalDistance();
        const blocks = this.getTotalTimeBlocks();
        if (this.elements.total) {
            this.elements.total.textContent = `${total} hex${total === 1 ? '' : 'es'} / ${this.formatBlocks(blocks)}`;
        }

        if (this.elements.status) {
            if (!this.modeActive) {
                this.elements.status.textContent = 'Press Shift for player path mode.';
            } else if (this.isLockedByOther()) {
                this.elements.status.textContent = `${this.drawLock.user} is drawing a path.`;
            } else if (this.hasOwnDrawLock()) {
                this.elements.status.textContent = 'Drawing locked to you. Esc exits draw mode.';
            } else if (this.tool === 'terrain') {
                this.elements.status.textContent = 'Hold click and drag to paint travel difficulty.';
            } else if (this.tool === 'delete') {
                this.elements.status.textContent = 'Click a destination or path segment to delete it.';
            } else {
                this.elements.status.textContent = 'Click a hex to add or edit a destination note.';
            }
        }
    }

    canUseTerrainUi() {
        return !!window.USER_DATA?.isGM;
    }

    canPaintTerrain() {
        return this.canUseTerrainUi() && this.terrainVisible;
    }

    async toggleTerrainMode() {
        if (!this.canUseTerrainUi()) {
            return;
        }

        if (!this.modeActive) {
            await this.toggleMode(true);
        }

        this.terrainVisible = !this.terrainVisible;
        if (this.terrainVisible) {
            await this.setTool('terrain');
        } else if (this.tool === 'terrain') {
            await this.setTool('marker');
        }
        this.updateUi();
        this.hexGrid.render();
    }

    getTotalDistance() {
        return this.pathSections.reduce((total, section) => {
            const route = Array.isArray(section.route) ? section.route : [];
            return total + Math.max(0, route.length - 1);
        }, 0);
    }

    getTotalTimeBlocks() {
        const total = this.pathSections.reduce((sum, section) => {
            const route = Array.isArray(section.route) ? section.route : [];
            return sum + this.getRouteTimeBlocks(route);
        }, 0);
        return this.roundBlocks(total);
    }

    getRouteTimeBlocks(route, endIndex = null) {
        if (!Array.isArray(route) || route.length < 2) {
            return 0;
        }

        const finalIndex = Number.isInteger(endIndex)
            ? Math.max(1, Math.min(endIndex, route.length - 1))
            : route.length - 1;
        let total = 0;

        // Count entered hexes only. The starting hex is where travel begins.
        for (let i = 1; i <= finalIndex; i++) {
            total += this.getTerrainCost(route[i]);
        }

        return total;
    }

    getTerrainCost(hex) {
        const terrain = this.terrain.get(`${hex.q},${hex.r}`);
        return this.travelCosts[terrain?.difficulty || 'normal'] || this.travelCosts.normal;
    }

    roundBlocks(value) {
        return Math.round(value * 2) / 2;
    }

    formatBlocks(value) {
        const rounded = this.roundBlocks(value);
        return `${rounded} block${rounded === 1 ? '' : 's'}`;
    }

    handleHexClick(hex, clientX, clientY) {
        if (!this.modeActive) {
            return false;
        }

        if (this.tool === 'draw') {
            if (!this.hasOwnDrawLock()) {
                return true;
            }
            this.addRouteHex(hex);
            this.savePathSoon();
            return true;
        }

        if (this.tool === 'terrain') {
            return true;
        }

        if (this.tool === 'delete') {
            const segment = this.findSegmentAtClient(clientX, clientY);
            if (segment) {
                if (this.isLockedByOther()) {
                    UIKit.toast(`${this.drawLock.user} is still drawing this path.`, 'warning');
                    return true;
                }
                this.deletePathSegment(segment);
                return true;
            }
            const marker = this.markers.get(`${hex.q},${hex.r}`);
            if (marker) {
                UIKit.confirm({
                    title: 'Delete destination',
                    message: 'Delete this destination marker?',
                    confirmText: 'Delete',
                    danger: true
                }).then(confirmed => {
                    if (confirmed) {
                        this.request('delete_marker', { q: hex.q, r: hex.r })
                            .catch(error => UIKit.toast(error.message, 'error'));
                    }
                });
            }
            return true;
        }

        const endpoint = this.findEndpointAtClient(clientX, clientY);
        if (endpoint) {
            this.showEndpointTime(endpoint);
            return true;
        }

        this.openMarkerModal(hex);
        return true;
    }

    addRouteHexFromClient(clientX, clientY) {
        const hex = this.hexGrid.getHexAtClientPosition(clientX, clientY);
        if (!hex) {
            return;
        }
        this.addRouteHex(hex);
    }

    paintTerrainFromClient(clientX, clientY) {
        const hex = this.hexGrid.getHexAtClientPosition(clientX, clientY);
        if (!hex) {
            return;
        }

        const key = `${hex.q},${hex.r}`;
        const existing = this.terrain.get(key);
        if (existing?.difficulty === this.terrainDifficulty) {
            return;
        }
        if (!existing && this.terrainDifficulty === 'normal') {
            return;
        }

        if (this.terrainDifficulty === 'normal') {
            this.terrain.delete(key);
        } else {
            this.terrain.set(key, {
                q: hex.q,
                r: hex.r,
                difficulty: this.terrainDifficulty,
                updatedBy: window.USER_DATA?.username || 'GM',
                updatedAt: Date.now()
            });
        }

        this.pendingTerrainCells.set(key, {
            q: hex.q,
            r: hex.r,
            difficulty: this.terrainDifficulty
        });
        this.flushTerrainPatchSoon();
        this.updateUi();
        this.hexGrid.render();
    }

    flushTerrainPatchSoon() {
        clearTimeout(this.terrainSaveTimer);
        this.terrainSaveTimer = setTimeout(() => this.flushTerrainPatch(), 250);
    }

    async flushTerrainPatch() {
        clearTimeout(this.terrainSaveTimer);
        if (!this.canUseTerrainUi() || this.pendingTerrainCells.size === 0) {
            return;
        }

        const cells = Array.from(this.pendingTerrainCells.values());
        this.pendingTerrainCells.clear();

        try {
            await this.request('save_terrain_patch', { cells });
        } catch (error) {
            UIKit.toast(error.message, 'error');
        }
    }

    addRouteHex(hex) {
        let section = this.getActiveSection();
        if (!section) {
            this.captureDrawUndoState();
            section = this.createSection();
            this.pathSections.push(section);
        }

        const route = section.route;
        const last = route[route.length - 1];
        if (last && last.q === hex.q && last.r === hex.r) {
            return;
        }

        this.captureDrawUndoState();

        if (!last) {
            route.push({ q: hex.q, r: hex.r });
            this.hexGrid.render();
            return;
        }

        const line = this.hexLine(last, hex);
        line.slice(1).forEach(step => {
            const currentLast = route[route.length - 1];
            if (!currentLast || currentLast.q !== step.q || currentLast.r !== step.r) {
                route.push(step);
            }
        });

        this.hexGrid.render();
    }

    createSection() {
        const id = `section:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
        this.activeSectionId = id;
        return {
            id,
            route: [],
            createdBy: window.USER_DATA?.username || 'unknown',
            createdAt: Date.now()
        };
    }

    captureDrawUndoState() {
        if (!this.hasOwnDrawLock() || this.tool !== 'draw') {
            return;
        }

        const snapshot = JSON.stringify({
            pathSections: this.pathSections,
            activeSectionId: this.activeSectionId
        });
        const lastSnapshot = this.drawUndoStack[this.drawUndoStack.length - 1];
        if (snapshot === lastSnapshot) {
            return;
        }

        this.drawUndoStack.push(snapshot);
        if (this.drawUndoStack.length > 30) {
            this.drawUndoStack.shift();
        }
        this.updateUi();
    }

    canUndoDrawLocally() {
        return this.hasOwnDrawLock() && this.tool === 'draw' && this.drawUndoStack.length > 0;
    }

    async undoDrawLocally() {
        if (!this.canUndoDrawLocally()) {
            return false;
        }

        clearTimeout(this.savePathTimer);
        const snapshot = this.drawUndoStack.pop();
        const state = JSON.parse(snapshot);
        this.pathSections = Array.isArray(state.pathSections) ? state.pathSections : [];
        this.activeSectionId = state.activeSectionId || null;
        this.lastSavedPathJson = '';
        this.updateUi();
        this.hexGrid.render();
        await this.savePath();
        return true;
    }

    getActiveSection() {
        return this.pathSections.find(section => section.id === this.activeSectionId) || null;
    }

    startNewSection() {
        if (!this.hasOwnDrawLock()) {
            return;
        }
        this.captureDrawUndoState();
        this.activeSectionId = null;
        this.updateUi();
    }

    savePathSoon() {
        clearTimeout(this.savePathTimer);
        this.savePathTimer = setTimeout(() => this.savePath(), 180);
    }

    async savePath() {
        if (!this.hasOwnDrawLock()) {
            return;
        }

        const sections = this.pathSections
            .map(section => ({
                ...section,
                route: this.normalizeRoute(section.route)
            }))
            .filter(section => section.route.length > 0);

        const pathJson = JSON.stringify(sections);
        if (pathJson === this.lastSavedPathJson) {
            return;
        }
        this.lastSavedPathJson = pathJson;
        const requestId = ++this.pathSaveRequestId;

        try {
            const state = await this.request('save_path', { sections }, { applyState: false });
            if (requestId === this.pathSaveRequestId) {
                this.applyState(state, { forcePathUpdate: true });
            }
        } catch (error) {
            UIKit.toast(error.message, 'error');
        }
    }

    normalizeRoute(route) {
        if (!Array.isArray(route)) {
            return [];
        }

        const normalized = [];
        route.forEach(hex => {
            if (!hex || !Number.isFinite(hex.q) || !Number.isFinite(hex.r)) {
                return;
            }
            const last = normalized[normalized.length - 1];
            if (!last || last.q !== hex.q || last.r !== hex.r) {
                normalized.push({ q: hex.q, r: hex.r });
            }
        });
        return normalized;
    }

    openMarkerModal(hex) {
        this.selectedHex = hex;
        const coords = `${hex.q},${hex.r}`;
        const existing = this.markers.get(coords);
        if (this.elements.modalTitle) {
            this.elements.modalTitle.textContent = `Destination (${hex.q}, ${hex.r})`;
        }
        if (this.elements.note) {
            this.elements.note.value = existing?.note || '';
        }
        if (this.elements.delete) {
            this.elements.delete.style.display = existing ? 'inline-block' : 'none';
        }
        if (this.elements.modal) {
            this.elements.modal.style.display = 'flex';
            if (window.UIKit) {
                UIKit.openModal(this.elements.modal, {
                    onClose: () => this.hideMarkerModal(),
                    initialFocus: this.elements.note
                });
            }
        }
        this.elements.note?.focus();
    }

    hideMarkerModal() {
        if (this.elements.modal) {
            this.elements.modal.style.display = 'none';
        }
        this.selectedHex = null;
    }

    closeMarkerModal() {
        const modal = this.elements.modal;
        if (window.UIKit && modal) {
            UIKit.closeModal(modal); // runs hideMarkerModal via onClose
        }
        if (modal && modal.style.display !== 'none') {
            this.hideMarkerModal();
        }
    }

    async saveMarkerFromModal() {
        if (!this.selectedHex) {
            return;
        }
        try {
            await this.request('save_marker', {
                q: this.selectedHex.q,
                r: this.selectedHex.r,
                note: this.elements.note?.value || ''
            });
            this.closeMarkerModal();
        } catch (error) {
            UIKit.toast(error.message, 'error');
        }
    }

    async deleteMarkerFromModal() {
        if (!this.selectedHex) {
            return;
        }
        try {
            await this.request('delete_marker', {
                q: this.selectedHex.q,
                r: this.selectedHex.r
            });
            this.closeMarkerModal();
        } catch (error) {
            UIKit.toast(error.message, 'error');
        }
    }

    async clearAll() {
        const confirmed = await UIKit.confirm({
            title: 'Clear player path',
            message: 'Clear all player destinations and path lines? This will not change normal map data.',
            confirmText: 'Clear All',
            danger: true
        });
        if (!confirmed) {
            return;
        }
        try {
            await this.request('clear_all');
        } catch (error) {
            UIKit.toast(error.message, 'error');
        }
    }

    async undo() {
        if (await this.undoDrawLocally()) {
            return;
        }

        if (!this.canUndo) {
            return;
        }
        try {
            await this.request('undo');
        } catch (error) {
            UIKit.toast(error.message, 'error');
        }
    }

    async deletePathSegment(segment) {
        try {
            await this.request('delete_path_segment', {
                sectionId: segment.sectionId,
                segmentIndex: segment.segmentIndex
            });
        } catch (error) {
            UIKit.toast(error.message, 'error');
        }
    }

    getMarkerForHex(q, r) {
        return this.markers.get(`${q},${r}`) || null;
    }

    draw(ctx) {
        if (this.modeActive && this.canUseTerrainUi() && this.terrainVisible) {
            this.drawTerrain(ctx);
        }
        this.drawPath(ctx);
        this.drawMarkers(ctx);
    }

    drawTerrain(ctx) {
        this.terrain.forEach(cell => {
            const difficulty = cell.difficulty;
            const fill = this.colors.terrain[difficulty];
            if (!fill) {
                return;
            }

            const vertices = this.hexGrid.coordSystem.getHexVertices(cell.q, cell.r);
            ctx.save();
            ctx.fillStyle = fill;
            ctx.strokeStyle = this.colors.terrainStroke[difficulty];
            ctx.lineWidth = 1.75 / this.hexGrid.viewport.scale;
            ctx.beginPath();
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });
    }

    drawMarkers(ctx) {
        this.markers.forEach(marker => {
            const vertices = this.hexGrid.coordSystem.getHexVertices(marker.q, marker.r);
            ctx.save();
            ctx.shadowColor = this.colors.markerGlow;
            ctx.shadowBlur = 10;
            ctx.fillStyle = this.colors.markerFill;
            ctx.strokeStyle = this.colors.markerStroke;
            ctx.lineWidth = 3.5 / this.hexGrid.viewport.scale;
            ctx.beginPath();
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });
    }

    drawPath(ctx) {
        this.pathSections.forEach((section, sectionIndex) => {
            const route = Array.isArray(section.route) ? section.route : [];
            if (route.length < 1) {
                return;
            }

            if (route.length === 1) {
                this.drawSectionNumber(ctx, route[0], sectionIndex + 1);
                return;
            }

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = this.colors.pathHalo;
            ctx.lineWidth = 9 / this.hexGrid.viewport.scale;
            this.strokeRoute(ctx, route);

            ctx.strokeStyle = this.colors.pathStroke;
            ctx.lineWidth = 3.25 / this.hexGrid.viewport.scale;
            this.strokeRoute(ctx, route);

            this.drawDirectionArrows(ctx, route);
            this.drawSectionNumber(ctx, route[0], sectionIndex + 1);
            this.drawEndpointBadge(ctx, route);
            ctx.restore();
        });
    }

    strokeRoute(ctx, route) {
        const first = this.hexGrid.coordSystem.hexToPixel(route[0].q, route[0].r);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < route.length; i++) {
            const point = this.hexGrid.coordSystem.hexToPixel(route[i].q, route[i].r);
            ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
    }

    drawDirectionArrows(ctx, route) {
        const stride = Math.max(2, Math.ceil(route.length / 8));
        for (let i = 0; i < route.length - 1; i += stride) {
            const from = this.hexGrid.coordSystem.hexToPixel(route[i].q, route[i].r);
            const to = this.hexGrid.coordSystem.hexToPixel(route[i + 1].q, route[i + 1].r);
            this.drawArrowHead(ctx, from, to);
        }
    }

    drawArrowHead(ctx, from, to) {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const size = 7 / this.hexGrid.viewport.scale;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        ctx.save();
        ctx.fillStyle = this.colors.pathStroke;
        ctx.beginPath();
        ctx.moveTo(midX + Math.cos(angle) * size, midY + Math.sin(angle) * size);
        ctx.lineTo(midX + Math.cos(angle + 2.45) * size, midY + Math.sin(angle + 2.45) * size);
        ctx.lineTo(midX + Math.cos(angle - 2.45) * size, midY + Math.sin(angle - 2.45) * size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawSectionNumber(ctx, hex, number) {
        const point = this.hexGrid.coordSystem.hexToPixel(hex.q, hex.r);
        const radius = 8 / this.hexGrid.viewport.scale;
        ctx.save();
        ctx.fillStyle = 'rgba(21, 36, 12, 0.88)';
        ctx.strokeStyle = this.colors.pathStroke;
        ctx.lineWidth = 2 / this.hexGrid.viewport.scale;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = this.colors.pathText;
        ctx.font = `${11 / this.hexGrid.viewport.scale}px Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(number), point.x, point.y + (0.5 / this.hexGrid.viewport.scale));
        ctx.restore();
    }

    drawEndpointBadge(ctx, route) {
        const endpoint = route[route.length - 1];
        const point = this.hexGrid.coordSystem.hexToPixel(endpoint.q, endpoint.r);
        const blocks = this.roundBlocks(this.getRouteTimeBlocks(route));
        const label = this.formatBlocks(blocks).replace(' blocks', 'b').replace(' block', 'b');
        const scale = this.hexGrid.viewport.scale;
        const fontSize = 10 / scale;
        const paddingX = 5 / scale;
        const height = 16 / scale;

        ctx.save();
        ctx.font = `${fontSize}px Segoe UI, sans-serif`;
        const width = ctx.measureText(label).width + paddingX * 2;
        const x = point.x - width / 2;
        const y = point.y - 28 / scale;

        ctx.fillStyle = 'rgba(21, 36, 12, 0.9)';
        ctx.strokeStyle = this.colors.pathStroke;
        ctx.lineWidth = 1.5 / scale;
        this.roundRect(ctx, x, y, width, height, 4 / scale);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = this.colors.pathText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, point.x, y + height / 2 + 0.5 / scale);
        ctx.restore();
    }

    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    findSegmentAtClient(clientX, clientY) {
        const rect = this.hexGrid.canvas.getBoundingClientRect();
        const point = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
        const threshold = 10;

        for (const section of this.pathSections) {
            const route = Array.isArray(section.route) ? section.route : [];
            for (let i = 0; i < route.length - 1; i++) {
                const a = this.worldToScreen(this.hexGrid.coordSystem.hexToPixel(route[i].q, route[i].r));
                const b = this.worldToScreen(this.hexGrid.coordSystem.hexToPixel(route[i + 1].q, route[i + 1].r));
                if (this.distanceToSegment(point, a, b) <= threshold) {
                    return { sectionId: section.id, segmentIndex: i };
                }
            }
        }

        return null;
    }

    findEndpointAtClient(clientX, clientY) {
        const rect = this.hexGrid.canvas.getBoundingClientRect();
        const point = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
        const threshold = 12;

        for (const section of this.pathSections) {
            const route = Array.isArray(section.route) ? section.route : [];
            if (route.length < 2) {
                continue;
            }
            const endpointIndex = route.length - 1;
            const endpoint = this.worldToScreen(this.hexGrid.coordSystem.hexToPixel(route[endpointIndex].q, route[endpointIndex].r));
            if (Math.hypot(point.x - endpoint.x, point.y - endpoint.y) <= threshold) {
                return {
                    sectionId: section.id,
                    section,
                    route,
                    endIndex: endpointIndex
                };
            }
        }

        return null;
    }

    showEndpointTime(endpoint) {
        const sectionNumber = this.pathSections.findIndex(section => section.id === endpoint.sectionId) + 1;
        const hexes = Math.max(0, endpoint.endIndex);
        const blocks = this.roundBlocks(this.getRouteTimeBlocks(endpoint.route, endpoint.endIndex));
        UIKit.toast(`Line ${sectionNumber}: ${hexes} hex${hexes === 1 ? '' : 'es'} / ${this.formatBlocks(blocks)}`, 'info');
    }

    worldToScreen(point) {
        const viewport = this.hexGrid.viewport;
        return {
            x: point.x * viewport.scale + viewport.offsetX,
            y: point.y * viewport.scale + viewport.offsetY
        };
    }

    distanceToSegment(point, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx === 0 && dy === 0) {
            return Math.hypot(point.x - a.x, point.y - a.y);
        }

        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
        const projection = {
            x: a.x + t * dx,
            y: a.y + t * dy
        };
        return Math.hypot(point.x - projection.x, point.y - projection.y);
    }

    hexDistance(a, b) {
        return (Math.abs(a.q - b.q)
            + Math.abs(a.r - b.r)
            + Math.abs((-a.q - a.r) - (-b.q - b.r))) / 2;
    }

    hexLine(a, b) {
        const distance = this.hexDistance(a, b);
        if (distance === 0) {
            return [{ q: a.q, r: a.r }];
        }

        const results = [];
        const aCube = this.axialToCube(a);
        const bCube = this.axialToCube(b);
        for (let i = 0; i <= distance; i++) {
            const t = distance === 0 ? 0 : i / distance;
            results.push(this.cubeToAxial(this.cubeRound({
                x: this.lerp(aCube.x, bCube.x, t),
                y: this.lerp(aCube.y, bCube.y, t),
                z: this.lerp(aCube.z, bCube.z, t)
            })));
        }
        return results;
    }

    axialToCube(hex) {
        const x = hex.q;
        const z = hex.r;
        const y = -x - z;
        return { x, y, z };
    }

    cubeToAxial(cube) {
        return { q: cube.x, r: cube.z };
    }

    cubeRound(cube) {
        let rx = Math.round(cube.x);
        let ry = Math.round(cube.y);
        let rz = Math.round(cube.z);

        const xDiff = Math.abs(rx - cube.x);
        const yDiff = Math.abs(ry - cube.y);
        const zDiff = Math.abs(rz - cube.z);

        if (xDiff > yDiff && xDiff > zDiff) {
            rx = -ry - rz;
        } else if (yDiff > zDiff) {
            ry = -rx - rz;
        } else {
            rz = -rx - ry;
        }

        return { x: rx, y: ry, z: rz };
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }
}

window.PlayerPathLayer = PlayerPathLayer;
