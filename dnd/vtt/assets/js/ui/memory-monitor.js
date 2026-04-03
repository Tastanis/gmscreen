/**
 * [REMOVABLE] Memory Monitor Widget
 *
 * This entire file can be safely deleted to remove the memory monitor feature.
 * Also remove the import/mount call in bootstrap.js when deleting this file.
 *
 * Shows a small badge in the bottom-left corner (GM-only) displaying total
 * memory usage. Clicking it opens a breakdown panel showing estimated memory
 * usage per category (tokens, canvas, state, chat, etc.).
 */

const UPDATE_INTERVAL_MS = 5000;

let badgeEl = null;
let panelEl = null;
let intervalId = null;
let isOpen = false;
let getStateFn = null;

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

function getTotalMemoryMB() {
  // performance.memory is Chrome/Edge only
  if (performance && performance.memory) {
    return (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
  }
  return null;
}

function getHeapLimitMB() {
  if (performance && performance.memory) {
    return (performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
  }
  return null;
}

function estimateJsonSize(obj) {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return 0;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function estimateCanvasMemory() {
  const canvases = document.querySelectorAll('canvas');
  let total = 0;
  canvases.forEach((c) => {
    // Each pixel = 4 bytes (RGBA)
    total += c.width * c.height * 4;
  });
  return total;
}

function estimateImageMemory() {
  const images = document.querySelectorAll('img');
  let total = 0;
  let count = 0;
  images.forEach((img) => {
    if (img.naturalWidth && img.naturalHeight) {
      // Decoded image in memory = width * height * 4 bytes
      total += img.naturalWidth * img.naturalHeight * 4;
      count++;
    }
  });
  return { total, count };
}

function estimateSvgMemory() {
  const drawingLayer = document.getElementById('vtt-drawing-layer');
  if (!drawingLayer) return { total: 0, count: 0 };
  const paths = drawingLayer.querySelectorAll('path, line, circle, rect, polygon, polyline');
  // Rough estimate: serialize SVG content
  let total = 0;
  try {
    total = new Blob([drawingLayer.innerHTML]).size;
  } catch {
    total = paths.length * 200; // fallback rough estimate
  }
  return { total, count: paths.length };
}

function collectBreakdown() {
  const state = getStateFn ? getStateFn() : null;
  const breakdown = [];

  // 1. Images/Tokens
  const imgInfo = estimateImageMemory();
  breakdown.push({
    label: 'Images / Tokens',
    detail: `${imgInfo.count} images loaded`,
    bytes: imgInfo.total,
  });

  // 2. Canvas layers
  const canvasBytes = estimateCanvasMemory();
  const canvasCount = document.querySelectorAll('canvas').length;
  breakdown.push({
    label: 'Canvas Layers',
    detail: `${canvasCount} canvases`,
    bytes: canvasBytes,
  });

  // 3. Board state
  if (state && state.boardState) {
    const boardBytes = estimateJsonSize(state.boardState);
    breakdown.push({
      label: 'Board State',
      detail: 'placements, fog, templates',
      bytes: boardBytes,
    });
  }

  // 4. Scenes
  if (state && state.scenes) {
    const scenesBytes = estimateJsonSize(state.scenes);
    breakdown.push({
      label: 'Scenes',
      detail: `${(state.scenes.items || []).length} scenes`,
      bytes: scenesBytes,
    });
  }

  // 5. Tokens data (not images, the metadata)
  if (state && state.tokens) {
    const tokensBytes = estimateJsonSize(state.tokens);
    breakdown.push({
      label: 'Token Data',
      detail: `${(state.tokens.items || []).length} token definitions`,
      bytes: tokensBytes,
    });
  }

  // 6. Drawings (SVG)
  const svgInfo = estimateSvgMemory();
  breakdown.push({
    label: 'Drawings (SVG)',
    detail: `${svgInfo.count} elements`,
    bytes: svgInfo.total,
  });

  // 7. Chat messages
  const chatContainer = document.getElementById('chat-messages');
  if (chatContainer) {
    let chatBytes = 0;
    try {
      chatBytes = new Blob([chatContainer.innerHTML]).size;
    } catch {
      chatBytes = 0;
    }
    const messageCount = chatContainer.querySelectorAll('.chat-message, .message, [class*="message"]').length;
    breakdown.push({
      label: 'Chat',
      detail: `~${messageCount} messages in DOM`,
      bytes: chatBytes,
    });
  }

  // 8. DOM node count
  const domCount = document.querySelectorAll('*').length;
  // Very rough: ~1KB per DOM node on average
  breakdown.push({
    label: 'DOM Nodes',
    detail: `${domCount} elements`,
    bytes: domCount * 1024,
  });

  return breakdown;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function createStyles() {
  const style = document.createElement('style');
  style.setAttribute('data-memory-monitor', 'true'); // [REMOVABLE]
  style.textContent = `
    /* [REMOVABLE] Memory Monitor Styles */
    .mem-badge {
      position: fixed;
      bottom: 12px;
      left: 12px;
      z-index: 10000;
      background: rgba(30, 30, 30, 0.85);
      color: #8f8;
      font-family: monospace;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      border: 1px solid rgba(100, 255, 100, 0.25);
      backdrop-filter: blur(4px);
      transition: background 0.2s;
    }
    .mem-badge:hover {
      background: rgba(40, 40, 40, 0.95);
      border-color: rgba(100, 255, 100, 0.5);
    }
    .mem-badge.mem-badge--warn {
      color: #ff8;
      border-color: rgba(255, 255, 100, 0.3);
    }
    .mem-badge.mem-badge--danger {
      color: #f88;
      border-color: rgba(255, 100, 100, 0.3);
    }

    .mem-panel {
      position: fixed;
      bottom: 40px;
      left: 12px;
      z-index: 10001;
      background: rgba(25, 25, 25, 0.95);
      color: #ccc;
      font-family: monospace;
      font-size: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(100, 255, 100, 0.2);
      backdrop-filter: blur(8px);
      min-width: 320px;
      max-width: 400px;
      max-height: 60vh;
      overflow-y: auto;
      display: none;
    }
    .mem-panel.mem-panel--open {
      display: block;
    }
    .mem-panel__title {
      color: #8f8;
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(100, 255, 100, 0.15);
    }
    .mem-panel__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
    }
    .mem-panel__row-label {
      flex: 1;
      color: #ddd;
    }
    .mem-panel__row-detail {
      flex: 1;
      color: #888;
      font-size: 10px;
      text-align: center;
    }
    .mem-panel__row-size {
      min-width: 70px;
      text-align: right;
      color: #8f8;
      font-weight: bold;
    }
    .mem-panel__row-bar {
      width: 100%;
      height: 4px;
      background: rgba(255,255,255,0.07);
      border-radius: 2px;
      margin-top: 2px;
    }
    .mem-panel__row-bar-fill {
      height: 100%;
      background: #8f8;
      border-radius: 2px;
      transition: width 0.3s;
    }
    .mem-panel__total {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid rgba(100, 255, 100, 0.15);
      display: flex;
      justify-content: space-between;
      color: #8f8;
      font-weight: bold;
    }
    .mem-panel__heap {
      margin-top: 6px;
      color: #888;
      font-size: 10px;
    }
    .mem-panel__note {
      margin-top: 8px;
      color: #666;
      font-size: 10px;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

function createBadge() {
  badgeEl = document.createElement('div');
  badgeEl.className = 'mem-badge';
  badgeEl.setAttribute('data-memory-monitor', 'true'); // [REMOVABLE]
  badgeEl.title = 'Click to view memory breakdown';
  badgeEl.textContent = '-- MB';
  badgeEl.addEventListener('click', togglePanel);
  document.body.appendChild(badgeEl);
}

function createPanel() {
  panelEl = document.createElement('div');
  panelEl.className = 'mem-panel';
  panelEl.setAttribute('data-memory-monitor', 'true'); // [REMOVABLE]
  panelEl.innerHTML = '<div class="mem-panel__title">Memory Usage Breakdown</div><div class="mem-panel__body"></div>';
  document.body.appendChild(panelEl);

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (isOpen && !panelEl.contains(e.target) && !badgeEl.contains(e.target)) {
      closePanel();
    }
  });
}

function togglePanel() {
  if (isOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

function openPanel() {
  isOpen = true;
  panelEl.classList.add('mem-panel--open');
  updatePanel();
}

function closePanel() {
  isOpen = false;
  panelEl.classList.remove('mem-panel--open');
}

function updateBadge() {
  if (!badgeEl) return;
  const mb = getTotalMemoryMB();
  if (mb !== null) {
    badgeEl.textContent = mb + ' MB';
    const val = parseFloat(mb);
    badgeEl.classList.toggle('mem-badge--warn', val > 200 && val <= 500);
    badgeEl.classList.toggle('mem-badge--danger', val > 500);
  } else {
    // Fallback: show estimated total from breakdown
    const breakdown = collectBreakdown();
    const estimatedTotal = breakdown.reduce((sum, item) => sum + item.bytes, 0);
    badgeEl.textContent = '~' + formatBytes(estimatedTotal);
  }
}

function updatePanel() {
  if (!panelEl || !isOpen) return;
  const body = panelEl.querySelector('.mem-panel__body');
  if (!body) return;

  const breakdown = collectBreakdown();
  const totalEstimated = breakdown.reduce((sum, item) => sum + item.bytes, 0);
  const maxBytes = Math.max(...breakdown.map((b) => b.bytes), 1);

  // Sort by size descending
  breakdown.sort((a, b) => b.bytes - a.bytes);

  let html = '';
  breakdown.forEach((item) => {
    const pct = totalEstimated > 0 ? ((item.bytes / totalEstimated) * 100).toFixed(1) : '0';
    const barWidth = ((item.bytes / maxBytes) * 100).toFixed(1);
    html += `
      <div class="mem-panel__row">
        <span class="mem-panel__row-label">${item.label}</span>
        <span class="mem-panel__row-detail">${item.detail}</span>
        <span class="mem-panel__row-size">${formatBytes(item.bytes)} (${pct}%)</span>
      </div>
      <div class="mem-panel__row-bar"><div class="mem-panel__row-bar-fill" style="width:${barWidth}%"></div></div>
    `;
  });

  html += `<div class="mem-panel__total"><span>Estimated Total</span><span>${formatBytes(totalEstimated)}</span></div>`;

  const heapMB = getTotalMemoryMB();
  const limitMB = getHeapLimitMB();
  if (heapMB !== null) {
    html += `<div class="mem-panel__heap">JS Heap: ${heapMB} MB${limitMB ? ' / ' + limitMB + ' MB limit' : ''}</div>`;
  }

  html += `<div class="mem-panel__note">Estimates based on serialized data sizes and decoded image dimensions. Actual memory may differ.</div>`;

  body.innerHTML = html;
}

function tick() {
  updateBadge();
  if (isOpen) {
    updatePanel();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * [REMOVABLE] Mount the memory monitor widget.
 *
 * To remove this feature entirely:
 * 1. Delete this file (memory-monitor.js)
 * 2. Remove the import and mountMemoryMonitor() call from bootstrap.js
 */
export function mountMemoryMonitor({ getState } = {}) {
  // Only show for GM
  const config = window.vttConfig ?? {};
  if (!config.isGM) return;

  getStateFn = getState || null;

  createStyles();
  createBadge();
  createPanel();

  // Initial update
  tick();

  // Periodic updates
  intervalId = setInterval(tick, UPDATE_INTERVAL_MS);
}
