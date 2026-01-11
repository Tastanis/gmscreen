/**
 * Map Ping System
 * Handles cross-user pings on the Strixhaven map
 *
 * Alt + Left Click: Regular ping (orange) - visible to all users
 * Alt + Right Click: Focus ping (blue) - centers all users' screens on that location
 */

class MapPingManager {
    constructor(mapInterface) {
        this.mapInterface = mapInterface;
        this.pingLayer = null;
        this.processedPings = new Map();
        this.pollInterval = null;

        // Constants
        this.PING_RETENTION_MS = 10000;         // 10 seconds
        this.PING_ANIMATION_DURATION_MS = 900;  // Animation duration
        this.POLL_INTERVAL_MS = 500;            // Poll every 500ms
        this.PROCESSED_PING_RETENTION_MS = 60000; // Track processed pings for 60s

        // API endpoint
        this.apiEndpoint = 'api/ping-api.php';

        // Initialize
        this.initialize();
    }

    /**
     * Initialize the ping system
     */
    initialize() {
        // Create ping layer if it doesn't exist
        this.createPingLayer();

        // Set up event listeners
        this.setupEventListeners();

        // Start polling for pings
        this.startPolling();

        console.log('Map ping system initialized');
    }

    /**
     * Create the ping layer element
     */
    createPingLayer() {
        // Check if ping layer already exists
        this.pingLayer = document.getElementById('ping-layer');
        if (!this.pingLayer) {
            // Create ping layer
            this.pingLayer = document.createElement('div');
            this.pingLayer.id = 'ping-layer';
            this.pingLayer.className = 'map-ping-layer';

            // Insert after canvas
            const mapContainer = document.querySelector('.map-container');
            if (mapContainer) {
                mapContainer.appendChild(this.pingLayer);
            }
        }
    }

    /**
     * Set up event listeners for ping triggers
     */
    setupEventListeners() {
        const canvas = this.mapInterface.canvas;
        if (!canvas) return;

        // Handle Alt + Click for pings
        canvas.addEventListener('mousedown', (e) => {
            if (e.altKey) {
                e.preventDefault();
                e.stopPropagation();

                if (e.button === 0) {
                    // Alt + Left Click: Regular ping
                    this.handlePingClick(e, false);
                } else if (e.button === 2) {
                    // Alt + Right Click: Focus ping (centers all screens)
                    this.handlePingClick(e, true);
                }
            }
        });

        // Prevent context menu on Alt + Right Click
        canvas.addEventListener('contextmenu', (e) => {
            if (e.altKey) {
                e.preventDefault();
            }
        });

        // Update ping positions when viewport changes
        // This is handled by re-rendering pings at correct positions
    }

    /**
     * Handle ping click event
     */
    handlePingClick(event, isFocus) {
        const rect = this.mapInterface.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        // Convert canvas coordinates to world coordinates
        const viewport = this.mapInterface.viewport;
        const worldX = (canvasX - viewport.offsetX) / viewport.scale;
        const worldY = (canvasY - viewport.offsetY) / viewport.scale;

        // Check if within map bounds
        const hexGrid = this.mapInterface.hexGrid;
        if (hexGrid && hexGrid.imageBounds) {
            const bounds = hexGrid.imageBounds;
            if (worldX < bounds.left || worldX > bounds.right ||
                worldY < bounds.top || worldY > bounds.bottom) {
                // Click is outside map bounds
                return;
            }
        }

        // Calculate normalized coordinates (0-1 range based on image bounds)
        let normalizedX = 0;
        let normalizedY = 0;

        if (hexGrid && hexGrid.imageBounds) {
            const bounds = hexGrid.imageBounds;
            const mapWidth = bounds.right - bounds.left;
            const mapHeight = bounds.bottom - bounds.top;
            normalizedX = (worldX - bounds.left) / mapWidth;
            normalizedY = (worldY - bounds.top) / mapHeight;
        }

        // Clamp to 0-1 range
        normalizedX = Math.max(0, Math.min(1, normalizedX));
        normalizedY = Math.max(0, Math.min(1, normalizedY));

        // Create and send ping
        this.createPing(normalizedX, normalizedY, isFocus);
    }

    /**
     * Create a ping at the specified normalized coordinates
     */
    async createPing(x, y, isFocus) {
        const type = isFocus ? 'focus' : 'ping';

        // Generate local ping ID for immediate display
        const now = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 10);
        const localId = `local:${now}:${randomSuffix}`;

        // Create ping entry
        const pingEntry = {
            id: localId,
            x: x,
            y: y,
            type: type,
            createdAt: now,
            authorId: window.USER_DATA?.username || 'unknown'
        };

        // For focus pings, center view FIRST before rendering
        // This ensures the ping appears at the correct screen position after the viewport moves
        if (isFocus) {
            this.centerViewOnPing(pingEntry);
        }

        // Render ping after viewport is in final position
        this.renderPing(pingEntry);
        this.recordProcessedPing(pingEntry);

        // Send ping to server
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'add_ping',
                    x: x,
                    y: y,
                    type: type
                })
            });

            const data = await response.json();
            if (data.success && data.data.ping) {
                // Record the server-assigned ID to prevent duplicate rendering
                this.recordProcessedPing(data.data.ping);
            }
        } catch (error) {
            console.error('Failed to send ping to server:', error);
        }
    }

    /**
     * Render a ping on the map
     */
    renderPing(pingEntry) {
        if (!this.pingLayer) return;

        // Get the map bounds
        const hexGrid = this.mapInterface.hexGrid;
        if (!hexGrid || !hexGrid.imageBounds) return;

        const bounds = hexGrid.imageBounds;
        const mapWidth = bounds.right - bounds.left;
        const mapHeight = bounds.bottom - bounds.top;

        // Calculate world coordinates from normalized
        const worldX = bounds.left + pingEntry.x * mapWidth;
        const worldY = bounds.top + pingEntry.y * mapHeight;

        // Convert world coordinates to screen coordinates
        const viewport = this.mapInterface.viewport;
        const screenX = worldX * viewport.scale + viewport.offsetX;
        const screenY = worldY * viewport.scale + viewport.offsetY;

        // Create ping element
        this.spawnPingPulse(screenX, screenY, pingEntry.type, 0);
    }

    /**
     * Spawn a ping pulse animation
     */
    spawnPingPulse(screenX, screenY, type, delayMs) {
        if (!this.pingLayer) return;

        const element = document.createElement('div');
        element.className = 'map-ping';
        if (type === 'focus') {
            element.classList.add('map-ping--focus');
        }

        element.style.left = `${screenX}px`;
        element.style.top = `${screenY}px`;
        element.style.setProperty('--ping-delay', `${delayMs}ms`);

        // Scale ping size based on zoom
        const scale = this.mapInterface.viewport.scale;
        const baseSize = 120;
        const size = baseSize / scale;
        element.style.setProperty('--ping-size', `${size}px`);

        this.pingLayer.appendChild(element);

        // Remove element after animation completes
        const cleanupDelay = this.PING_ANIMATION_DURATION_MS + delayMs + 160;
        setTimeout(() => {
            element.remove();
        }, cleanupDelay);
    }

    /**
     * Center the view on a ping location
     */
    centerViewOnPing(pingEntry) {
        const hexGrid = this.mapInterface.hexGrid;
        if (!hexGrid || !hexGrid.imageBounds) return;

        const bounds = hexGrid.imageBounds;
        const mapWidth = bounds.right - bounds.left;
        const mapHeight = bounds.bottom - bounds.top;

        // Calculate world coordinates from normalized
        const worldX = bounds.left + pingEntry.x * mapWidth;
        const worldY = bounds.top + pingEntry.y * mapHeight;

        // Get canvas dimensions
        const canvas = this.mapInterface.canvas;
        const canvasCenterX = canvas.width / 2;
        const canvasCenterY = canvas.height / 2;

        // Calculate new offset to center on ping
        const viewport = this.mapInterface.viewport;
        const newOffsetX = canvasCenterX - worldX * viewport.scale;
        const newOffsetY = canvasCenterY - worldY * viewport.scale;

        // Update viewport
        viewport.offsetX = newOffsetX;
        viewport.offsetY = newOffsetY;

        // Apply to hex grid
        hexGrid.setViewport(viewport.scale, viewport.offsetX, viewport.offsetY);
    }

    /**
     * Record a processed ping to prevent duplicate rendering
     */
    recordProcessedPing(pingEntry) {
        if (!pingEntry || !pingEntry.id) return;

        const timestamp = pingEntry.createdAt || Date.now();
        this.processedPings.set(pingEntry.id, timestamp);
        this.pruneProcessedPings();
    }

    /**
     * Remove old processed ping records
     */
    pruneProcessedPings() {
        const now = Date.now();
        this.processedPings.forEach((timestamp, id) => {
            if (now - timestamp > this.PROCESSED_PING_RETENTION_MS) {
                this.processedPings.delete(id);
            }
        });
    }

    /**
     * Start polling for pings from other users
     */
    startPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        this.pollInterval = setInterval(() => {
            this.pollPings();
        }, this.POLL_INTERVAL_MS);

        // Initial poll
        this.pollPings();
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Poll for pings from server
     */
    async pollPings() {
        // Don't poll if tab is hidden
        if (document.hidden) return;

        try {
            const response = await fetch(`${this.apiEndpoint}?action=get_pings`, {
                method: 'GET',
                cache: 'no-store'
            });

            const data = await response.json();
            if (data.success && data.data.pings) {
                this.processIncomingPings(data.data.pings);
            }
        } catch (error) {
            // Silently handle polling errors
            console.debug('Ping poll failed:', error);
        }
    }

    /**
     * Process incoming pings from server
     */
    processIncomingPings(pings) {
        if (!Array.isArray(pings)) return;

        const now = Date.now();
        this.pruneProcessedPings();

        const retentionThreshold = now - this.PING_RETENTION_MS;

        pings.forEach(ping => {
            // Skip invalid pings
            if (!ping || !ping.id) return;

            // Skip expired pings
            if (ping.createdAt < retentionThreshold) return;

            // Skip already processed pings
            if (this.processedPings.has(ping.id)) return;

            // Record as processed
            this.recordProcessedPing(ping);

            // For focus pings, center view FIRST before rendering
            // This ensures the ping appears at the correct screen position after the viewport moves
            if (ping.type === 'focus') {
                this.centerViewOnPing(ping);
            }

            // Render ping after viewport is in final position
            this.renderPing(ping);
        });
    }

    /**
     * Cleanup when destroying the manager
     */
    destroy() {
        this.stopPolling();
        if (this.pingLayer) {
            this.pingLayer.remove();
        }
        this.processedPings.clear();
    }
}

// Export for use
window.MapPingManager = MapPingManager;
