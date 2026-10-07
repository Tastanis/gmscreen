/**
 * Arcane Construction: four skill trees on one board.
 *
 * The board is a 12x20 grid of cells with ids `cell-<row>-<col>`. Those ids are what the saved data is keyed on
 * (skill text, the GM's connections, Zepha's learned skills), so the grid itself never changes shape.
 * The GM writes the skills and connects them; Zepha marks the ones she has learned.
 */

// Configuration
const GRID_CONFIG = {
    columns: 12,
    rows: 20,
    minZoom: 0.3,
    maxZoom: 3.0,
    zoomStep: 0.1
};

// What one skill of each tier costs, in project points
const TIER_COST = [150, 200, 250, 300, 400, 500];

// The four trees: where each sits on the grid, and the three paths within it
const SECTIONS = [
    { key: 'enchanting', name: 'Enchanting', zoneClass: 'enchanting-zone', titleRow: 2, tierCol: 2, cols: [3, 5], rows: [4, 9],
      headers: [['rune-carving', 'Rune Carving'], ['inlay-label', 'Inlay'], ['focused-arcanum', 'Focused Arcanum']] },
    { key: 'constructs', name: 'Constructs', zoneClass: 'constructs-zone', titleRow: 2, tierCol: 8, cols: [9, 11], rows: [4, 9],
      headers: [['animation-label', 'Animation'], ['form-label', 'Form'], ['sentience-label', 'Sentience']] },
    { key: 'colossal', name: 'Colossal Construction', zoneClass: 'colossal-zone', titleRow: 12, tierCol: 2, cols: [3, 5], rows: [14, 19],
      headers: [['planning-label', 'Planning'], ['size-label', 'Size'], ['efficiency-label', 'Efficiency']] },
    { key: 'arcane', name: 'Arcane Mastery', zoneClass: 'arcane-zone', titleRow: 12, tierCol: 8, cols: [9, 11], rows: [14, 19],
      headers: [['spells-label', 'Spells'], ['elemental-label', 'Elemental Sculpting'], ['raw-arcane-label', 'Raw Arcane']] }
];

// Global state
let gridState = {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    selectedCells: new Set(),
    editableCells: new Map(), // skill text by "<row>-<col>", exactly as the GM saved it
    isGM: false, // Will be set from PHP
    currentUser: '', // Will be set from PHP
    connectionMode: false, // Whether GM is in connection mode
    connectionSource: null, // Source cell for connection
    customConnections: new Map(), // The GM's connections
    autoConnections: new Map(), // Each tier to the one below it in its own path
    learningMode: false, // Whether Zepha is in learning mode
    learnedSkills: new Set(), // Zepha's learned skills
    isSaving: false, // Save operation in progress
    lastSaveTime: 0, // Timestamp of last save
    refreshInterval: null,
    hasUnsavedChanges: false, // Track if user has made changes
    hovered: null, // the skill under the mouse
    pinned: null, // the skill Zepha has clicked
    showLinks: false, // every connection drawn at once
    viewMode: false, // the GM looking rather than editing: clicks select, as they do for Zepha
    showAllBenefits: false // the benefits list showing every line, not only those that name a number
};

/* ------------------------------------------------------------------ small helpers */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function parseCellId(id) {
    const m = /^cell-(\d+)-(\d+)$/.exec(id || '');
    return m ? { row: parseInt(m[1]), col: parseInt(m[2]) } : null;
}

function sectionAt(row, col) {
    return SECTIONS.find(s => row >= s.rows[0] && row <= s.rows[1] && col >= s.cols[0] && col <= s.cols[1]) || null;
}

function skillCells() {
    return document.querySelectorAll('.grid-cell.skill');
}

const ICONS = {
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" fill="currentColor"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    ready: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/></svg>'
};

/**
 * A skill's saved text is a line of title followed by whatever else the GM wrote (usually a bullet list).
 * This splits the two for display; the saved text itself is never altered.
 */
function splitSkill(html) {
    const lines = skillLines(html);
    const title = lines.length ? lines[0].text : '';
    const rest = lines.slice(1);

    // The description is put back together from its lines: runs of bullets as a list, anything else as plain lines
    let body = '', inList = false;
    rest.forEach(line => {
        if (line.bullet !== inList) { body += line.bullet ? '<ul>' : '</ul>'; inList = line.bullet; }
        body += line.bullet ? `<li>${line.html}</li>` : `<div>${line.html}</div>`;
    });
    if (inList) body += '</ul>';

    return { title, body, bodyText: rest.map(line => line.text).join(' '), lines: rest };
}

/**
 * The saved text as a list of lines, however it happens to be wrapped: each bullet is a line, and so is each run of text
 * between line breaks. Bold, italic and underline are kept; sizes and any other wrapping are dropped, so an old
 * "make this text smaller" wrapped round a whole skill does not swallow its title and bullets into one line.
 */
function skillLines(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html || '';
    const lines = [];
    let cur = null;
    const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const walk = (node, bullet, open, close) => {
        node.childNodes.forEach(n => {
            if (n.nodeType === Node.TEXT_NODE) {
                if (!n.textContent) return;
                if (!cur) { cur = { bullet, html: '', text: '' }; lines.push(cur); }
                cur.text += n.textContent;
                cur.html += open + esc(n.textContent) + close;
            } else if (n.nodeType === Node.ELEMENT_NODE) {
                const tag = n.tagName;
                if (tag === 'BR') cur = null;
                else if (tag === 'LI') { cur = null; walk(n, true, open, close); cur = null; }
                else if (/^(UL|OL|DIV|P)$/.test(tag)) { cur = null; walk(n, bullet, open, close); cur = null; }
                else if (/^(B|STRONG|I|EM|U)$/.test(tag)) { const t = tag.toLowerCase(); walk(n, bullet, `${open}<${t}>`, `</${t}>${close}`); }
                else walk(n, bullet, open, close);
            }
        });
    };
    walk(temp, false, '', '');

    return lines.map(line => {
        // a line typed with its own bullet mark counts as a bullet
        const typed = /^\s*[•*]\s+/.test(line.text);
        return {
            bullet: line.bullet || typed,
            text: line.text.replace(/^\s*[•*]\s+/, '').replace(/\s+/g, ' ').trim(),
            html: typed ? line.html.replace(/^((?:<[^>]+>)*)\s*[•*]\s+/, '$1') : line.html
        };
    }).filter(line => line.text);
}

function skillInfo(id) {
    const p = parseCellId(id);
    if (!p) return null;
    const section = sectionAt(p.row, p.col);
    if (!section) return null;
    const raw = gridState.editableCells.get(`${p.row}-${p.col}`) || '';
    const parts = splitSkill(raw);
    const tier = p.row - section.rows[0] + 1;
    return {
        id, row: p.row, col: p.col, section, tier, cost: TIER_COST[tier - 1],
        path: section.headers[p.col - section.cols[0]][1],
        raw, title: parts.title, body: parts.body, lines: parts.lines,
        blank: !parts.title && !parts.bodyText
    };
}

function isBlank(id) {
    const info = skillInfo(id);
    return !info || info.blank;
}

function skillName(id) {
    const info = skillInfo(id);
    if (!info) return id;
    return info.title || `${info.path}, tier ${info.tier}`;
}

function allConnections() {
    const list = [];
    gridState.autoConnections.forEach((c, id) => list.push({ id, source: c.source, target: c.target, type: 'auto' }));
    gridState.customConnections.forEach((c, id) => list.push({ id, source: c.source, target: c.target, type: 'custom' }));
    return list;
}

// What a skill needs directly, and what it opens directly. Empty cells are not skills and are skipped
function directSources(id) {
    return allConnections().filter(c => c.target === id && !isBlank(c.source));
}

function directTargets(id) {
    return allConnections().filter(c => c.source === id && !isBlank(c.target));
}

/**
 * Initialize the grid system
 */
async function initializeGrid() {
    // Get user info from global scope (set by PHP)
    if (typeof window.userRole !== 'undefined') {
        gridState.isGM = window.userRole === 'GM';
        gridState.currentUser = window.userName || '';
    }

    // Load the saved data first, then build the board, then put the data on it
    await loadGridData(false);

    createGridStructure();
    setupZoomControls();
    setupEventListeners();
    setupConnectionSystem();
    setupLearningSystem();
    setupSaveSystem();
    createAutoConnections();

    renderAllSkills();
    renderSectionTabs();
    setupViewMode();
    updateModeBanner();

    // The board's size depends on its text, so the connections are laid out once it has settled, and again if it changes
    const grid = document.getElementById('construction-grid');
    if (window.ResizeObserver && grid) new ResizeObserver(() => redrawAllArrows()).observe(grid);
    redrawAllArrows();
    fitWidth(false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => redrawAllArrows());

    console.log(`Grid initialized for user: ${gridState.currentUser} (GM: ${gridState.isGM})`);
    diagnoseGridState();
}

/**
 * Create the complete grid structure with all zones
 */
function createGridStructure() {
    const gridContainer = document.getElementById('construction-grid');
    if (!gridContainer) {
        console.error('Grid container not found');
        return;
    }

    gridContainer.innerHTML = '';

    // Create all 240 cells (12x20)
    for (let row = 1; row <= GRID_CONFIG.rows; row++) {
        for (let col = 1; col <= GRID_CONFIG.columns; col++) {
            gridContainer.appendChild(createGridCell(row, col));
        }
    }

    setupSpecialZones();
    buildSectionSlabs();
}

/**
 * Create individual grid cell
 */
function createGridCell(row, col) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell empty';
    cell.id = `cell-${row}-${col}`;
    cell.dataset.row = row;
    cell.dataset.col = col;
    cell.style.gridColumn = col;
    cell.style.gridRow = row;
    return cell;
}

/**
 * Titles, path names and tier labels for the four trees
 */
function setupSpecialZones() {
    SECTIONS.forEach(section => {
        const headerRow = section.titleRow + 1;

        // The tree's name, across its four columns
        const titleCell = document.getElementById(`cell-${section.titleRow}-${section.tierCol}`);
        if (titleCell) {
            titleCell.className = `grid-cell label merged ${section.zoneClass}`;
            titleCell.textContent = section.name;
            titleCell.dataset.section = section.key;
            titleCell.style.gridColumn = `${section.tierCol} / ${section.cols[1] + 1}`;
            titleCell.style.gridRow = `${section.titleRow} / ${section.titleRow + 1}`;
            for (let col = section.tierCol + 1; col <= section.cols[1]; col++) {
                const covered = document.getElementById(`cell-${section.titleRow}-${col}`);
                if (covered) covered.style.display = 'none';
            }
        }

        const tierHeader = document.getElementById(`cell-${headerRow}-${section.tierCol}`);
        if (tierHeader) {
            tierHeader.className = 'grid-cell label tier-header';
            tierHeader.textContent = 'Tier';
            tierHeader.dataset.section = section.key;
        }

        // The three paths
        section.headers.forEach(([className, name], i) => {
            const cell = document.getElementById(`cell-${headerRow}-${section.cols[0] + i}`);
            if (cell) {
                cell.className = `grid-cell label path-label ${className}`;
                cell.textContent = name;
                cell.dataset.section = section.key;
            }
        });

        // Tier labels, each with what a skill of that tier costs
        for (let i = 1; i <= 6; i++) {
            const tierCell = document.getElementById(`cell-${section.rows[0] + i - 1}-${section.tierCol}`);
            if (tierCell) {
                tierCell.className = 'grid-cell label tier-label';
                tierCell.dataset.section = section.key;
                tierCell.title = `Each tier ${i} skill costs ${TIER_COST[i - 1]} PP`;
                tierCell.textContent = '';
                tierCell.appendChild(el('span', 'tier-name', `Tier ${i}`));
                tierCell.appendChild(el('span', 'tier-cost', `${TIER_COST[i - 1]} PP`));
            }
        }
    });

    setupInteractiveGrid();
}

/**
 * The slab of stone each tree is cut into, laid behind its cells
 */
function buildSectionSlabs() {
    const grid = document.getElementById('construction-grid');
    SECTIONS.forEach(section => {
        const slab = el('div', 'section-slab');
        slab.dataset.section = section.key;
        slab.id = `slab-${section.key}`;
        slab.style.gridColumn = `${section.tierCol} / ${section.cols[1] + 1}`;
        slab.style.gridRow = `${section.titleRow} / ${section.rows[1] + 1}`;
        grid.insertBefore(slab, grid.firstChild);
    });
}

/**
 * Setup the skill cells of all four trees
 */
function setupInteractiveGrid() {
    SECTIONS.forEach(section => {
        for (let row = section.rows[0]; row <= section.rows[1]; row++) {
            for (let col = section.cols[0]; col <= section.cols[1]; col++) {
                const cell = document.getElementById(`cell-${row}-${col}`);
                if (cell) setupInteractiveCell(cell, row, col);
            }
        }
    });
}

/**
 * Setup individual skill cell
 */
function setupInteractiveCell(cell, row, col) {
    const section = sectionAt(row, col);

    if (gridState.isGM) {
        // GM can edit these cells
        cell.className = 'grid-cell skill editable';
        cell.addEventListener('click', handleGMEdit);
    } else {
        // Zepha can click these cells
        cell.className = 'grid-cell skill clickable';
        cell.addEventListener('click', handleZephaClick);
    }

    if (section) cell.setAttribute('data-section', section.key);

    // Pointing at a skill shows what it needs and what it opens
    cell.addEventListener('mouseenter', () => setHovered(cell.id));
    cell.addEventListener('mouseleave', () => setHovered(null));
}

/* ------------------------------------------------------------------ drawing the skills */

/**
 * Draw one skill from its saved text: title, description, and the skills from other paths it needs
 */
function renderSkillCell(cell) {
    if (!cell || cell.classList.contains('editing')) return;
    const info = skillInfo(cell.id);
    if (!info) return;

    cell._raw = info.raw;
    cell.textContent = '';
    cell.classList.toggle('blank', info.blank);
    cell.appendChild(el('span', 'skill-mark'));

    if (info.blank) {
        cell.appendChild(el('div', 'skill-empty', gridState.isGM && !gridState.viewMode ? 'Click to write a skill' : 'Nothing here yet'));
        return;
    }

    if (info.title) cell.appendChild(el('div', 'skill-title', info.title));
    if (info.body) {
        const body = el('div', 'skill-body');
        body.innerHTML = info.body;
        cell.appendChild(body);
    }

    // The GM's connections are named on the skill itself, so nobody has to follow a line to read them
    const needs = directSources(cell.id).filter(c => c.type === 'custom');
    const opens = directTargets(cell.id).filter(c => c.type === 'custom');
    if (needs.length || opens.length) {
        const links = el('div', 'skill-links');
        needs.forEach(c => {
            const chip = el('span', 'link-chip needs', skillName(c.source));
            chip.dataset.id = c.source;
            chip.dataset.section = skillInfo(c.source).section.key;
            chip.title = `Needs ${skillName(c.source)} (${skillInfo(c.source).section.name})`;
            links.appendChild(chip);
        });
        if (opens.length) {
            const chip = el('span', 'link-chip opens', `Opens ${opens.length}`);
            chip.title = 'Opens: ' + opens.map(c => skillName(c.target)).join(', ');
            links.appendChild(chip);
        }
        cell.appendChild(links);
    }
}

function renderAllSkills() {
    skillCells().forEach(cell => renderSkillCell(cell));
    refreshSkillStates();
}

/**
 * Learned, ready to learn, or still locked: worked out from Zepha's learned skills and the connections
 */
function refreshSkillStates() {
    skillCells().forEach(cell => {
        const learned = gridState.learnedSkills.has(cell.id);
        const blank = cell.classList.contains('blank');
        const ready = !learned && !blank && directSources(cell.id).every(c => gridState.learnedSkills.has(c.source));
        cell.classList.toggle('learned-skill', learned);
        cell.classList.toggle('is-ready', ready);
        cell.classList.toggle('is-locked', !learned && !ready && !blank);
        const mark = cell.querySelector('.skill-mark');
        if (mark) mark.innerHTML = learned ? ICONS.check : blank ? '' : ready ? ICONS.ready : ICONS.lock;
        cell.querySelectorAll('.link-chip.needs').forEach(chip => chip.classList.toggle('met', gridState.learnedSkills.has(chip.dataset.id)));
    });

    const svg = document.getElementById('arrow-overlay');
    if (svg) {
        svg.querySelectorAll('[data-connection]').forEach(path => {
            path.classList.toggle('lit', gridState.learnedSkills.has(path.dataset.source));
        });
    }

    renderProgress();
    renderBenefits();
    applyFocus();
}

/**
 * How much of each tree is learned
 */
function renderProgress() {
    const box = document.getElementById('progress');
    if (!box) return;
    box.textContent = '';
    box.appendChild(el('h2', 'side-heading', 'Learned so far'));

    let total = 0, spent = 0;
    SECTIONS.forEach(section => {
        let count = 0, filled = 0;
        for (let row = section.rows[0]; row <= section.rows[1]; row++) {
            for (let col = section.cols[0]; col <= section.cols[1]; col++) {
                const id = `cell-${row}-${col}`;
                if (!isBlank(id)) filled++;
                if (gridState.learnedSkills.has(id)) { count++; spent += TIER_COST[row - section.rows[0]]; }
            }
        }
        total += count;
        const row = el('button', 'progress-row');
        row.type = 'button';
        row.dataset.section = section.key;
        row.title = `Go to ${section.name}`;
        row.addEventListener('click', () => fitSection(section.key));
        row.appendChild(el('span', 'progress-name', section.name));
        row.appendChild(el('span', 'progress-count', `${count} / ${filled || 18}`));
        const bar = el('span', 'progress-bar');
        const fill = el('span', 'progress-fill');
        fill.style.width = `${filled ? Math.round(count / filled * 100) : 0}%`;
        bar.appendChild(fill);
        row.appendChild(bar);
        box.appendChild(row);
    });
    box.appendChild(el('p', 'progress-total', `${total} skill${total === 1 ? '' : 's'} learned, worth ${spent.toLocaleString()} PP`));
}

/**
 * Everything the learned skills give, gathered in one list under each tree, with the skill each line comes from.
 * A line that names a number (+1, -5, 10%, "max projects 5") is a bonus and is always listed. The other lines of a
 * learned skill (what it lets you do, or just what it is) are kept one click away, since not all of them are benefits.
 * Clicking a line shows its skill.
 */
function isBonus(text) {
    return /\d/.test(text);
}

function renderBenefits() {
    const box = document.getElementById('benefits');
    if (!box) return;
    box.textContent = '';

    const groups = [];
    let bonuses = 0, others = 0, learned = 0;
    SECTIONS.forEach(section => {
        const lines = [];
        for (let row = section.rows[0]; row <= section.rows[1]; row++) {
            for (let col = section.cols[0]; col <= section.cols[1]; col++) {
                const id = `cell-${row}-${col}`;
                if (!gridState.learnedSkills.has(id)) continue;
                const info = skillInfo(id);
                if (!info || info.blank) continue;
                learned++;
                info.lines.forEach(line => {
                    const bonus = isBonus(line.text);
                    if (bonus) bonuses++; else others++;
                    lines.push({ id, text: line.text, bonus, from: info.title || info.path, tier: info.tier });
                });
            }
        }
        if (lines.length) groups.push({ section, lines });
    });

    const showAll = gridState.showAllBenefits;
    box.appendChild(el('h2', 'side-heading', `Benefits so far (${showAll ? bonuses + others : bonuses})`));

    if (!learned) {
        box.appendChild(el('p', 'side-hint', 'Nothing yet. What each learned skill gives will be listed here.'));
        return;
    }
    if (!bonuses && !showAll) {
        box.appendChild(el('p', 'side-hint', 'None of the learned skills names a number.'));
    }

    groups.forEach(group => {
        const shown = group.lines.filter(line => showAll || line.bonus);
        if (!shown.length) return;
        const block = el('div', 'benefit-group');
        block.dataset.section = group.section.key;
        block.appendChild(el('h3', 'benefit-tree', group.section.name));
        const ul = el('ul', 'benefit-list');
        shown.forEach(line => {
            const li = el('li', 'benefit-item' + (line.bonus ? '' : ' plain'));
            li.appendChild(el('span', 'benefit-text', line.text));
            li.appendChild(el('span', 'benefit-from', `${line.from} · tier ${line.tier}`));
            li.title = 'Show this skill';
            li.addEventListener('click', event => { event.stopPropagation(); panToCell(line.id); });
            ul.appendChild(li);
        });
        block.appendChild(ul);
        box.appendChild(block);
    });

    if (others) {
        const more = el('button', 'benefit-more', showAll ? 'Only the numbered bonuses' : `Also show the ${others} other line${others === 1 ? '' : 's'}`);
        more.type = 'button';
        more.addEventListener('click', event => {
            event.stopPropagation();
            gridState.showAllBenefits = !gridState.showAllBenefits;
            renderBenefits();
        });
        box.appendChild(more);
    }
}

/* ------------------------------------------------------------------ what a skill needs, shown on request */

let hoverTimer = null;
function setHovered(id) {
    clearTimeout(hoverTimer);
    if (gridState.isDragging) return;
    hoverTimer = setTimeout(() => {
        if (gridState.hovered === id) return;
        gridState.hovered = id;
        applyFocus();
    }, id ? 60 : 140);
}

function setPinned(id) {
    gridState.pinned = id;
    applyFocus();
}

/**
 * Light up the skill in question, everything it rests on and what it opens, and quieten the rest
 */
function applyFocus() {
    const id = gridState.hovered && !isBlank(gridState.hovered) ? gridState.hovered : gridState.pinned;
    const svg = document.getElementById('arrow-overlay');

    document.querySelectorAll('.grid-cell.in-focus').forEach(cell => cell.classList.remove('in-focus', 'focus-self', 'focus-req', 'focus-open'));
    if (svg) svg.querySelectorAll('.focus-req, .focus-open').forEach(path => path.classList.remove('focus-req', 'focus-open'));

    const info = id ? skillInfo(id) : null;
    if (!info || info.blank) {
        document.body.classList.remove('has-focus');
        renderInspector(null);
        return;
    }

    const requires = findAllSourceCells(id).filter(src => !isBlank(src));
    const chain = new Set([id, ...requires]);
    const opens = directTargets(id).map(c => c.target);

    document.body.classList.add('has-focus');
    document.getElementById(id).classList.add('in-focus', 'focus-self');
    requires.forEach(src => { const cell = document.getElementById(src); if (cell) cell.classList.add('in-focus', 'focus-req'); });
    opens.forEach(tgt => { const cell = document.getElementById(tgt); if (cell && !chain.has(tgt)) cell.classList.add('in-focus', 'focus-open'); });

    if (svg) {
        allConnections().forEach(c => {
            const path = svg.querySelector(`[data-connection="${c.id}"]`);
            if (!path) return;
            if (chain.has(c.source) && chain.has(c.target)) path.classList.add('focus-req');
            else if (c.source === id && !isBlank(c.target)) path.classList.add('focus-open');
        });
    }

    renderInspector(id);
}

/**
 * The side panel: the whole of one skill, what it needs and what it opens
 */
function renderInspector(id) {
    const box = document.getElementById('inspector');
    if (!box) return;
    box.textContent = '';
    box.removeAttribute('data-section');

    const info = id ? skillInfo(id) : null;
    if (!info) {
        box.appendChild(el('h2', 'side-heading', 'Skill'));
        box.appendChild(el('p', 'side-hint', 'Point at a skill to see what it needs and what it opens.'));
        const legend = el('ul', 'legend');
        [['learned', ICONS.check, 'Learned'], ['ready', ICONS.ready, 'Ready to learn'], ['locked', ICONS.lock, 'Locked: needs something not learned yet']].forEach(([cls, icon, text]) => {
            const li = el('li', `legend-item ${cls}`);
            const mark = el('span', 'legend-mark');
            mark.innerHTML = icon;
            li.appendChild(mark);
            li.appendChild(el('span', '', text));
            legend.appendChild(li);
        });
        box.appendChild(legend);
        return;
    }

    box.dataset.section = info.section.key;
    const learned = gridState.learnedSkills.has(id);
    const needs = directSources(id);
    const missing = needs.filter(c => !gridState.learnedSkills.has(c.source));

    box.appendChild(el('div', 'insp-where', `${info.section.name} · ${info.path}`));
    box.appendChild(el('h2', 'insp-title', info.title || 'Untitled skill'));

    const facts = el('div', 'insp-facts');
    facts.appendChild(el('span', 'fact tier', `Tier ${info.tier}`));
    facts.appendChild(el('span', 'fact cost', `${info.cost} PP`));
    facts.appendChild(el('span', `fact state ${learned ? 'learned' : missing.length ? 'locked' : 'ready'}`, learned ? 'Learned' : missing.length ? 'Locked' : 'Ready to learn'));
    box.appendChild(facts);

    if (info.body) {
        const body = el('div', 'insp-body');
        body.innerHTML = info.body;
        box.appendChild(body);
    }

    const list = (heading, items, emptyText) => {
        box.appendChild(el('h3', 'insp-heading', heading));
        if (!items.length) { box.appendChild(el('p', 'side-hint', emptyText)); return; }
        const ul = el('ul', 'insp-list');
        items.forEach(otherId => {
            const other = skillInfo(otherId);
            const li = el('li', 'insp-item' + (gridState.learnedSkills.has(otherId) ? ' met' : ''));
            li.dataset.section = other.section.key;
            const mark = el('span', 'insp-mark');
            mark.innerHTML = gridState.learnedSkills.has(otherId) ? ICONS.check : '';
            li.appendChild(mark);
            const text = el('span', 'insp-text');
            text.appendChild(el('span', 'insp-name', skillName(otherId)));
            text.appendChild(el('span', 'insp-sub', `${other.section.name} · ${other.path} · tier ${other.tier} · ${other.cost} PP`));
            li.appendChild(text);
            li.title = 'Show this skill';
            li.addEventListener('click', event => { event.stopPropagation(); panToCell(otherId); });
            ul.appendChild(li);
        });
        box.appendChild(ul);
    };

    list('Needs', needs.map(c => c.source), 'Nothing: this can be learned straight away.');

    // The whole road to it: everything further back that is still unlearned
    if (!learned) {
        const road = findAllSourceCells(id).filter(src => !isBlank(src) && !gridState.learnedSkills.has(src));
        const cost = road.reduce((sum, src) => sum + skillInfo(src).cost, info.cost);
        box.appendChild(el('p', 'insp-road', road.length
            ? `To reach this: ${road.length} more skill${road.length === 1 ? '' : 's'} first, ${cost.toLocaleString()} PP in all.`
            : `Everything it needs is learned. It costs ${info.cost} PP.`));
    }

    list('Opens', directTargets(id).map(c => c.target), 'Nothing further.');
}

/* ------------------------------------------------------------------ clicking */

/**
 * Handle GM editing functionality
 */
function handleGMEdit(event) {
    event.stopPropagation();
    const cell = event.currentTarget;

    // If in connection mode, handle connection
    if (gridState.connectionMode) {
        handleConnectionClick(cell);
        return;
    }

    // Looking, not editing: a click does what it does for Zepha
    if (gridState.viewMode) {
        pinSkill(cell);
        return;
    }

    // Don't start editing if already editing
    if (cell.classList.contains('editing')) {
        return;
    }

    startInlineEdit(cell);
}

/**
 * The GM's switch between editing the board and looking at it as Zepha sees it (clicks select, nothing is edited).
 * The choice is remembered on this computer.
 */
function setupViewMode() {
    if (!gridState.isGM) return;
    try { gridState.viewMode = localStorage.getItem('arcaneGMViewOnly') === '1'; } catch (error) { gridState.viewMode = false; }
    const btn = document.getElementById('view-btn');
    if (btn) btn.addEventListener('click', () => setViewMode(!gridState.viewMode));
    setViewMode(gridState.viewMode);
}

function setViewMode(on) {
    gridState.viewMode = on;
    try { localStorage.setItem('arcaneGMViewOnly', on ? '1' : '0'); } catch (error) { /* remembered only if the browser allows it */ }
    const btn = document.getElementById('view-btn');
    if (btn) {
        btn.classList.toggle('active', on);
        btn.textContent = on ? 'Mode: Viewing' : 'Mode: Editing';
        btn.title = on ? 'Clicks select skills, as they do for Zepha. Nothing can be edited.' : 'Clicks open a skill for editing.';
    }
    document.body.classList.toggle('gm-viewing', on);
    if (!on) clearChainHighlighting();
    renderAllSkills();
    updateModeBanner();
}

/**
 * Keep a skill in view: it, everything it rests on and what it opens stay lit until something else is clicked
 */
function pinSkill(cell) {
    const cellId = cell.id;

    // Clear any existing chain highlighting
    clearChainHighlighting();

    // Highlight the clicked cell as target
    cell.classList.add('chain-target');

    // Find and highlight all cells that lead to this cell
    const sourceCells = findAllSourceCells(cellId);
    sourceCells.forEach(sourceId => {
        const sourceCell = document.getElementById(sourceId);
        if (sourceCell && sourceCell !== cell) {
            sourceCell.classList.add('chain-source');
        }
    });

    // Highlight arrows in the back-propagation chain
    highlightChainArrows(cellId, sourceCells);

    // And keep it in the side panel until something else is clicked
    setPinned(cellId);
}

/**
 * Handle Zepha clicking functionality with back-propagation and learning
 */
function handleZephaClick(event) {
    const cell = event.currentTarget;
    const cellId = cell.id;

    // If in learning mode, toggle learned skill
    if (gridState.learningMode) {
        toggleLearnedSkill(cell, cellId);
        return;
    }

    pinSkill(cell);
}

/**
 * Highlight arrows involved in the back-propagation chain
 */
function highlightChainArrows(targetId, sourceCells) {
    const svg = document.getElementById('arrow-overlay');
    if (!svg) return;

    // Collect all cell IDs involved in the chain (target + all sources)
    const allChainCells = [targetId, ...sourceCells];

    allConnections().forEach(connection => {
        if (allChainCells.includes(connection.source) && allChainCells.includes(connection.target)) {
            const arrowElement = svg.querySelector(`[data-connection="${connection.id}"]`);
            if (arrowElement) arrowElement.classList.add('chain-arrow-highlighted');
        }
    });
}

/* ------------------------------------------------------------------ the GM's editor */

/**
 * Start inline editing for a cell with rich text editor
 */
function startInlineEdit(cell) {
    const cellKey = `${cell.dataset.row}-${cell.dataset.col}`;
    const currentText = gridState.editableCells.get(cellKey) || ''; // the saved text, formatting and all

    // Mark cell as editing
    cell.classList.add('editing');

    // Create contenteditable div for rich text editing
    const editor = document.createElement('div');
    editor.className = 'rich-text-editor';
    editor.contentEditable = true;
    editor.innerHTML = currentText;

    // Store original content for cancel
    editor.dataset.originalContent = currentText;

    // Clear cell and add editor
    cell.innerHTML = '';
    cell.appendChild(editor);

    // Create and show formatting toolbar
    const toolbar = createFormattingToolbar(cell, editor);
    cell.appendChild(toolbar);
    cell.appendChild(el('div', 'editor-hint', 'First line is the title. Enter saves, Esc cancels, Shift+Enter for a new line.'));

    // Focus editor and select all content
    editor.focus();
    selectAllContent(editor);

    // Add event listeners
    editor.addEventListener('blur', (e) => {
        // Don't blur if clicking on toolbar
        if (!e.relatedTarget || !e.relatedTarget.closest('.formatting-toolbar')) {
            finishRichTextEdit(cell, editor, true);
        }
    });

    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            finishRichTextEdit(cell, editor, true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishRichTextEdit(cell, editor, false);
        } else if (e.key === 'b' && e.ctrlKey) {
            e.preventDefault();
            toggleBold(editor);
        }
    });

    // Prevent default drag behavior on the editor
    editor.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });
}

/**
 * Finish rich text editing
 */
function finishRichTextEdit(cell, editor, save) {
    if (!cell || !cell.classList.contains('editing')) return; // already finished (Enter is followed by a blur)
    const cellKey = `${cell.dataset.row}-${cell.dataset.col}`;

    if (save) {
        try {
            // Get HTML content from editor and clean it
            const formattedText = cleanRichTextHtml(editor.innerHTML.trim());

            if (formattedText !== editor.dataset.originalContent) {
                // Save to state
                gridState.editableCells.set(cellKey, formattedText);
                gridState.hasUnsavedChanges = true;
                updateSaveButtonState();
            }
        } catch (error) {
            console.error(`[RICH-EDIT-FINISH] Error saving cell ${cellKey}:`, error);
        }
    }

    // Remove editing state and draw the skill again (its name may also appear on other skills)
    cell.classList.remove('editing');
    renderAllSkills();
}

/**
 * Legacy function for compatibility - redirects to rich text version
 */
function finishInlineEdit(cell, editor, save) {
    finishRichTextEdit(cell, editor, save);
}

/**
 * Convert HTML to plain text with newlines
 */
function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Convert <br> to newlines
    temp.innerHTML = temp.innerHTML.replace(/<br\s*\/?>/gi, '\n');

    // Convert list items to bullet points
    temp.innerHTML = temp.innerHTML.replace(/<li>/gi, '• ').replace(/<\/li>/gi, '\n');
    temp.innerHTML = temp.innerHTML.replace(/<\/?ul>/gi, '');

    return temp.textContent || temp.innerText || '';
}

/**
 * Convert plain text to HTML with formatting
 */
function textToHtml(text) {
    if (!text) return '';

    const processedLines = [];
    for (let line of text.split('\n')) {
        line = line.trim();
        if (!line) continue;

        // Convert bullet points
        if (line.startsWith('• ') || line.startsWith('* ')) {
            line = '<li>' + line.substring(2) + '</li>';
        }

        processedLines.push(line);
    }

    // Group consecutive list items
    let result = '';
    let inList = false;

    for (let line of processedLines) {
        if (line.startsWith('<li>')) {
            if (!inList) {
                result += '<ul>';
                inList = true;
            }
            result += line;
        } else {
            if (inList) {
                result += '</ul>';
                inList = false;
            }
            if (result) result += '<br>';
            result += line;
        }
    }

    if (inList) {
        result += '</ul>';
    }

    return result;
}

/**
 * Create formatting toolbar for rich text editing
 */
function createFormattingToolbar(cell, editor) {
    const toolbar = document.createElement('div');
    toolbar.className = 'formatting-toolbar';

    const button = (className, html, title, action) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `toolbar-btn ${className}`;
        btn.innerHTML = html;
        btn.title = title;
        btn.addEventListener('mousedown', (e) => e.preventDefault()); // Prevent blur
        btn.addEventListener('click', (e) => { e.stopPropagation(); action(editor); });
        toolbar.appendChild(btn);
    };

    button('bold-btn', '<strong>B</strong>', 'Bold (Ctrl+B)', toggleBold);
    button('bullet-btn', '•', 'Bullet List', toggleBulletList);
    button('font-inc-btn', 'A+', 'Increase Font Size', increaseFontSize);
    button('font-dec-btn', 'A-', 'Decrease Font Size', decreaseFontSize);

    return toolbar;
}

/**
 * Toggle bold formatting for selected text
 */
function toggleBold(editor) {
    document.execCommand('bold', false, null);
    editor.focus();
}

/**
 * Toggle bullet list formatting
 */
function toggleBulletList(editor) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
        // No selection, create a bullet list
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    document.execCommand('insertUnorderedList', false, null);
    editor.focus();
}

/**
 * Increase font size
 */
function increaseFontSize(editor) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        document.execCommand('fontSize', false, '4'); // Larger size
    } else {
        // Apply to entire editor if no selection
        editor.style.fontSize = 'larger';
    }
    editor.focus();
}

/**
 * Decrease font size
 */
function decreaseFontSize(editor) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        document.execCommand('fontSize', false, '2'); // Smaller size
    } else {
        // Apply to entire editor if no selection
        editor.style.fontSize = 'smaller';
    }
    editor.focus();
}

/**
 * Select all content in contenteditable element
 */
function selectAllContent(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Clean and sanitize rich text HTML
 */
function cleanRichTextHtml(html) {
    if (!html) return '';

    // Create a temporary div to manipulate the HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove unwanted attributes and elements
    const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'ul', 'li', 'br', 'span', 'div'];
    const allowedAttributes = ['style'];

    // Clean all elements recursively
    function cleanElement(element) {
        if (element.nodeType === Node.TEXT_NODE) {
            return; // Text nodes are fine
        }

        if (element.nodeType === Node.ELEMENT_NODE) {
            const tagName = element.tagName.toLowerCase();

            // Remove disallowed tags
            if (!allowedTags.includes(tagName)) {
                // Replace with its contents
                while (element.firstChild) {
                    element.parentNode.insertBefore(element.firstChild, element);
                }
                element.parentNode.removeChild(element);
                return;
            }

            // Clean attributes
            const attrs = Array.from(element.attributes);
            attrs.forEach(attr => {
                if (!allowedAttributes.includes(attr.name)) {
                    element.removeAttribute(attr.name);
                }
            });

            // Clean children
            const children = Array.from(element.children);
            children.forEach(child => cleanElement(child));
        }
    }

    cleanElement(temp);

    // Convert div elements to br for line breaks
    const divs = temp.querySelectorAll('div');
    divs.forEach(div => {
        const br = document.createElement('br');
        div.parentNode.insertBefore(br, div);
        while (div.firstChild) {
            div.parentNode.insertBefore(div.firstChild, div);
        }
        div.parentNode.removeChild(div);
    });

    return temp.innerHTML;
}

/* ------------------------------------------------------------------ connections */

/**
 * Find all cells that have arrows pointing to the target cell (recursive back-propagation)
 */
function findAllSourceCells(targetId, visited = new Set()) {
    if (visited.has(targetId)) {
        return []; // Prevent infinite loops
    }
    visited.add(targetId);

    const sources = new Set();

    const follow = connection => {
        if (connection.target === targetId) {
            sources.add(connection.source);
            // Recursively find sources of this source
            findAllSourceCells(connection.source, visited).forEach(id => sources.add(id));
        }
    };

    gridState.autoConnections.forEach(follow); // tier connections
    gridState.customConnections.forEach(follow); // the GM's connections

    return Array.from(sources);
}

/**
 * Clear all chain highlighting (cells and arrows)
 */
function clearChainHighlighting() {
    document.querySelectorAll('.grid-cell.chain-target').forEach(cell => cell.classList.remove('chain-target'));
    document.querySelectorAll('.grid-cell.chain-source').forEach(cell => cell.classList.remove('chain-source'));

    // Clear arrow highlighting
    const svg = document.getElementById('arrow-overlay');
    if (svg) {
        svg.querySelectorAll('.chain-arrow-highlighted').forEach(arrow => arrow.classList.remove('chain-arrow-highlighted'));
    }

    if (gridState.pinned) setPinned(null);
}

/**
 * Setup connection system for GM
 */
function setupConnectionSystem() {
    const linksBtn = document.getElementById('links-btn');
    if (linksBtn) linksBtn.addEventListener('click', toggleShowLinks);

    if (!gridState.isGM) return;

    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', toggleConnectionMode);
    }
}

/**
 * Draw every connection at once, or go back to showing only those of the skill pointed at
 */
function toggleShowLinks() {
    gridState.showLinks = !gridState.showLinks;
    document.body.classList.toggle('show-links', gridState.showLinks);
    const btn = document.getElementById('links-btn');
    if (btn) {
        btn.classList.toggle('active', gridState.showLinks);
        btn.textContent = gridState.showLinks ? 'Hide links' : 'Show all links';
    }
}

/**
 * Setup learning system for Zepha
 */
function setupLearningSystem() {
    if (gridState.isGM) return;

    const learnBtn = document.getElementById('learn-skill-btn');
    if (learnBtn) {
        learnBtn.addEventListener('click', toggleLearningMode);
    }
}

/**
 * Setup save system for both users
 */
function setupSaveSystem() {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSave);
    }
    // The page does not refresh itself: reload it to see the other person's changes
}

/**
 * The line under the header saying which mode is on and what a click does in it
 */
function updateModeBanner() {
    const banner = document.getElementById('mode-banner');
    if (!banner) return;
    let text = '';
    if (gridState.connectionMode) {
        text = gridState.connectionSource
            ? `Connecting from “${skillName(gridState.connectionSource)}”. Now click the skill that needs it. Click the same skill again to cancel.`
            : 'Connect mode. Click the skill that is needed first, then the skill that needs it. Doing the same pair again removes the connection.';
    } else if (gridState.learningMode) {
        text = 'Learning mode. Click a skill to mark it learned; click it again to unmark it. Remember to save.';
    } else if (gridState.viewMode) {
        text = 'Viewing, as Zepha sees it. Click a skill to keep it in view; nothing can be edited until you switch back.';
    }
    banner.textContent = text;
    banner.classList.toggle('on', !!text);
    document.body.classList.toggle('connect-mode', gridState.connectionMode);
    document.body.classList.toggle('learning-on', gridState.learningMode);
}

/**
 * Toggle learning mode for Zepha
 */
function toggleLearningMode() {
    gridState.learningMode = !gridState.learningMode;
    const learnBtn = document.getElementById('learn-skill-btn');

    if (gridState.learningMode) {
        learnBtn.classList.add('active');
        learnBtn.textContent = 'Exit Learning';

        // Add learning mode indicator to all clickable cells
        document.querySelectorAll('.grid-cell.clickable').forEach(cell => {
            if (!cell.classList.contains('learned-skill')) {
                cell.classList.add('learning-mode');
            }
        });
    } else {
        learnBtn.classList.remove('active');
        learnBtn.textContent = 'Learn Skill';

        // Remove learning mode indicators
        document.querySelectorAll('.grid-cell.learning-mode').forEach(cell => {
            cell.classList.remove('learning-mode');
        });
    }
    updateModeBanner();
}

/**
 * Toggle learned skill for Zepha
 */
function toggleLearnedSkill(cell, cellId) {
    const wasLearned = gridState.learnedSkills.has(cellId);

    if (wasLearned) {
        // Remove learned skill
        gridState.learnedSkills.delete(cellId);
        cell.classList.remove('learned-skill');
        cell.classList.add('learning-mode');
    } else {
        // Add learned skill
        gridState.learnedSkills.add(cellId);
        cell.classList.add('learned-skill');
        cell.classList.remove('learning-mode');
    }

    gridState.hasUnsavedChanges = true;
    updateSaveButtonState();
    refreshSkillStates();
}

/**
 * Update save button state to show unsaved changes
 */
function updateSaveButtonState() {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        const dirty = gridState.hasUnsavedChanges && !gridState.isSaving;
        saveBtn.classList.toggle('dirty', dirty);
        saveBtn.textContent = dirty ? 'Save Changes*' : (gridState.isGM ? 'Save Grid' : 'Save Skills');
    }
}

/**
 * Handle save button click
 */
async function handleSave() {
    if (gridState.isSaving) {
        return; // Prevent double-clicking
    }

    gridState.isSaving = true;
    const saveBtn = document.getElementById('save-btn');
    const saveStatus = document.getElementById('save-status');

    saveBtn.disabled = true;
    saveBtn.classList.remove('dirty');
    saveBtn.textContent = 'Saving...';
    saveStatus.textContent = 'Saving... (DO NOT REFRESH PAGE)';
    saveStatus.className = 'save-status busy';

    try {
        let success = false;
        if (gridState.isGM) {
            success = await saveGMDataReliably();
        } else {
            success = await saveZephaDataReliably();
        }

        if (success) {
            saveStatus.textContent = 'Saved! Safe to refresh page.';
            saveStatus.className = 'save-status ok';
            gridState.hasUnsavedChanges = false;
            setTimeout(() => {
                if (saveStatus) {
                    saveStatus.textContent = '';
                    saveStatus.className = 'save-status';
                }
            }, 5000);
        } else {
            throw new Error('Save operation returned false');
        }

    } catch (error) {
        console.error('Save failed:', error);
        saveStatus.textContent = 'Save failed! Try again.';
        saveStatus.className = 'save-status bad';
        setTimeout(() => {
            if (saveStatus) {
                saveStatus.textContent = '';
                saveStatus.className = 'save-status';
            }
        }, 5000);
    } finally {
        gridState.isSaving = false;
        if (saveBtn) {
            saveBtn.disabled = false;
        }
        gridState.lastSaveTime = Date.now();
        updateSaveButtonState();
    }
}

/**
 * Toggle connection mode
 */
function toggleConnectionMode() {
    gridState.connectionMode = !gridState.connectionMode;
    const connectBtn = document.getElementById('connect-btn');

    if (gridState.connectionMode) {
        connectBtn.classList.add('active');
        connectBtn.textContent = 'Exit Connect';
    } else {
        connectBtn.classList.remove('active');
        connectBtn.textContent = 'Connect';
    }
    clearConnectionSource();
    updateModeBanner();
}

/**
 * Handle connection click
 */
function handleConnectionClick(cell) {
    const cellId = cell.id;

    if (!gridState.connectionSource) {
        // First click - set source
        gridState.connectionSource = cellId;
        cell.classList.add('connect-source');
    } else if (gridState.connectionSource === cellId) {
        // Clicking same cell - cancel
        clearConnectionSource();
    } else {
        // Second click - create connection
        createCustomConnection(gridState.connectionSource, cellId);
        clearConnectionSource();
    }
    updateModeBanner();
}

/**
 * Clear connection source
 */
function clearConnectionSource() {
    if (gridState.connectionSource) {
        const sourceCell = document.getElementById(gridState.connectionSource);
        if (sourceCell) {
            sourceCell.classList.remove('connect-source');
        }
        gridState.connectionSource = null;
    }
}

/**
 * Create custom connection between two cells (or remove if duplicate)
 */
function createCustomConnection(sourceId, targetId) {
    const connectionId = `${sourceId}-to-${targetId}`;

    // Check if connection already exists
    if (gridState.customConnections.has(connectionId)) {
        // Remove existing connection
        removeCustomConnection(sourceId, targetId);
    } else {
        // Create new connection
        gridState.customConnections.set(connectionId, {
            source: sourceId,
            target: targetId,
            type: 'custom'
        });

        drawArrow(sourceId, targetId, 'arrow-line');
    }

    // Either way there is now something to save, and the two skills name each other differently
    gridState.hasUnsavedChanges = true;
    updateSaveButtonState();
    renderAllSkills();
}

/**
 * Remove custom connection between two cells
 */
function removeCustomConnection(sourceId, targetId) {
    const connectionId = `${sourceId}-to-${targetId}`;

    // Remove from state
    gridState.customConnections.delete(connectionId);

    // Remove visual arrow
    const svg = document.getElementById('arrow-overlay');
    if (svg) {
        const line = svg.querySelector(`[data-connection="${connectionId}"]`);
        if (line) {
            line.remove();
        }
    }
}

/**
 * Create automatic tier connections
 */
function createAutoConnections() {
    SECTIONS.forEach(section => createTierConnections(section.cols[0], section.cols[1], section.rows[0], section.rows[1]));
}

/**
 * Create tier connections for a section
 */
function createTierConnections(startCol, endCol, startRow, endRow) {
    for (let col = startCol; col <= endCol; col++) {
        for (let row = startRow; row < endRow; row++) {
            const sourceId = `cell-${row}-${col}`;
            const targetId = `cell-${row + 1}-${col}`;

            gridState.autoConnections.set(`${sourceId}-to-${targetId}`, {
                source: sourceId,
                target: targetId,
                type: 'auto'
            });

            drawArrow(sourceId, targetId, 'auto-arrow-line');
        }
    }
}

/**
 * Draw the connection between two skills, from where they actually sit on the board.
 * A tier connection is a short link in the gap between the two cards; one of the GM's is a curve from edge to edge.
 */
function drawArrow(sourceId, targetId, className) {
    const svg = document.getElementById('arrow-overlay');
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (!svg || !source || !target) return;

    const a = { x: source.offsetLeft, y: source.offsetTop, w: source.offsetWidth, h: source.offsetHeight };
    const b = { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight };
    if (!a.w || !b.w) return; // the board is not laid out yet

    let d;
    if (className === 'auto-arrow-line') {
        const x = a.x + a.w / 2;
        d = `M${x},${a.y + a.h + 3} L${x},${b.y - 5}`;
    } else {
        const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
        const dx = bx - ax, dy = by - ay;
        // each connection arrives at its own spot along the edge, so several into one skill do not pile up
        let spread = 0;
        for (const ch of sourceId) spread = (spread * 31 + ch.charCodeAt(0)) % 7;
        spread = (spread - 3) * 5;
        if (Math.abs(dx) >= Math.abs(dy) * 0.6) {
            const dir = dx > 0 ? 1 : -1;
            const sx = dir > 0 ? a.x + a.w : a.x, sy = ay;
            const ex = dir > 0 ? b.x - 7 : b.x + b.w + 7, ey = by + spread;
            const c = Math.max(46, Math.abs(ex - sx) * 0.45);
            d = `M${sx},${sy} C${sx + dir * c},${sy} ${ex - dir * c},${ey} ${ex},${ey}`;
        } else {
            const dir = dy > 0 ? 1 : -1;
            const sx = ax, sy = dir > 0 ? a.y + a.h : a.y;
            const ex = bx + spread * 2, ey = dir > 0 ? b.y - 7 : b.y + b.h + 7;
            const c = Math.max(40, Math.abs(ey - sy) * 0.45);
            d = `M${sx},${sy} C${sx},${sy + dir * c} ${ex},${ey - dir * c} ${ex},${ey}`;
        }
    }

    const connectionId = `${sourceId}-to-${targetId}`;
    let path = svg.querySelector(`[data-connection="${connectionId}"]`);
    if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('data-connection', connectionId);
        path.setAttribute('data-source', sourceId);
        svg.appendChild(path);
    }
    path.setAttribute('d', d);
    path.classList.add(className);
    path.classList.toggle('lit', gridState.learnedSkills.has(sourceId));
    path.classList.toggle('unused', isBlank(sourceId) || isBlank(targetId));
}

/**
 * Lay every connection out again (the board's size follows its text)
 */
function redrawAllArrows() {
    const svg = document.getElementById('arrow-overlay');
    const grid = document.getElementById('construction-grid');
    if (!svg || !grid) return;

    // a description too long for its tablet fades out at the foot; the side panel has all of it
    grid.querySelectorAll('.skill-body').forEach(body => body.classList.toggle('clipped', body.scrollHeight > body.clientHeight + 1));

    svg.setAttribute('width', grid.offsetWidth);
    svg.setAttribute('height', grid.offsetHeight);

    // Drop connections that no longer exist, then place the rest
    svg.querySelectorAll('[data-connection]').forEach(path => {
        const id = path.getAttribute('data-connection');
        if (!gridState.customConnections.has(id) && !gridState.autoConnections.has(id)) path.remove();
    });
    gridState.autoConnections.forEach(connection => drawArrow(connection.source, connection.target, 'auto-arrow-line'));
    gridState.customConnections.forEach(connection => drawArrow(connection.source, connection.target, 'arrow-line'));
}

/* ------------------------------------------------------------------ moving about the board */

function viewportSize() {
    const viewport = document.querySelector('.grid-viewport');
    return { w: viewport.clientWidth, h: viewport.clientHeight };
}

function clampZoom(z) {
    return Math.max(GRID_CONFIG.minZoom, Math.min(GRID_CONFIG.maxZoom, z));
}

function glide() {
    const container = document.querySelector('.grid-container');
    if (!container) return;
    container.classList.add('gliding');
    clearTimeout(glide.timer);
    glide.timer = setTimeout(() => container.classList.remove('gliding'), 420);
}

// Show a rectangle of the board (in the board's own pixels) as large as will fit
function fitRect(x, y, w, h, maxZoom, animate) {
    const view = viewportSize();
    const pad = 28;
    gridState.zoom = clampZoom(Math.min((view.w - pad * 2) / w, (view.h - pad * 2) / h, maxZoom));
    gridState.panX = (view.w - w * gridState.zoom) / 2 - x * gridState.zoom;
    gridState.panY = Math.max(pad, (view.h - h * gridState.zoom) / 2) - y * gridState.zoom;
    if (animate !== false) glide();
    updateGridTransform();
    updateZoomIndicator();
}

function fitAll(animate) {
    const grid = document.getElementById('construction-grid');
    fitRect(0, 0, grid.offsetWidth, grid.offsetHeight, 1.2, animate);
}

// The board as wide as the window, starting from its top
function fitWidth(animate) {
    const grid = document.getElementById('construction-grid');
    const view = viewportSize();
    gridState.zoom = clampZoom(Math.min((view.w - 24) / grid.offsetWidth, 1.15));
    gridState.panX = (view.w - grid.offsetWidth * gridState.zoom) / 2;
    gridState.panY = 12;
    if (animate !== false) glide();
    updateGridTransform();
    updateZoomIndicator();
}

function fitSection(key) {
    const slab = document.getElementById(`slab-${key}`);
    if (!slab) return;
    fitRect(slab.offsetLeft - 24, slab.offsetTop - 24, slab.offsetWidth + 48, slab.offsetHeight + 48, 1.5);
}

// Bring one skill to the middle of the view and show it in the side panel
function panToCell(id) {
    const cell = document.getElementById(id);
    if (!cell) return;
    const view = viewportSize();
    gridState.zoom = clampZoom(Math.max(gridState.zoom, 0.9));
    gridState.panX = view.w / 2 - (cell.offsetLeft + cell.offsetWidth / 2) * gridState.zoom;
    gridState.panY = view.h / 2 - (cell.offsetTop + cell.offsetHeight / 2) * gridState.zoom;
    glide();
    updateGridTransform();
    updateZoomIndicator();
    cell.classList.remove('flash');
    void cell.offsetWidth;
    cell.classList.add('flash');
    if (!gridState.isGM || gridState.viewMode) {
        clearChainHighlighting();
        cell.classList.add('chain-target');
    }
    gridState.hovered = null;
    setPinned(id);
}

function zoomAt(clientX, clientY, newZoom) {
    const viewport = document.querySelector('.grid-viewport');
    const rect = viewport.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    newZoom = clampZoom(newZoom);
    if (newZoom === gridState.zoom) return;
    // the point under the cursor stays under the cursor
    const bx = (px - gridState.panX) / gridState.zoom, by = (py - gridState.panY) / gridState.zoom;
    gridState.zoom = newZoom;
    gridState.panX = px - bx * newZoom;
    gridState.panY = py - by * newZoom;
    updateGridTransform();
    updateZoomIndicator();
}

/**
 * Tabs in the header that jump to each tree
 */
function renderSectionTabs() {
    const nav = document.getElementById('section-tabs');
    if (!nav) return;
    nav.textContent = '';
    const tab = (label, key, action) => {
        const btn = el('button', 'section-tab', label);
        btn.type = 'button';
        if (key) btn.dataset.section = key;
        btn.addEventListener('click', action);
        nav.appendChild(btn);
    };
    tab('Whole board', '', () => fitAll());
    SECTIONS.forEach(section => tab(section.name, section.key, () => fitSection(section.key)));
}

/**
 * Setup zoom and pan controls
 */
function setupZoomControls() {
    const viewport = document.querySelector('.grid-viewport');
    const container = document.querySelector('.grid-container');

    if (!viewport || !container) return;

    // Mouse wheel zoom, about the cursor
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, gridState.zoom * (e.deltaY > 0 ? 1 / (1 + GRID_CONFIG.zoomStep) : 1 + GRID_CONFIG.zoomStep));
    }, { passive: false });

    // Dragging pans: with the right button anywhere, or with the left button on the board's background
    viewport.addEventListener('mousedown', (e) => {
        const onBackground = e.button === 0 && !e.target.closest('.grid-cell.skill, button, .zoom-controls, .grid-instructions');
        if (e.button === 2 || e.button === 1 || onBackground) {
            // a left press is left to do what it normally does, so an open editor still closes and saves
            if (e.button !== 0) e.preventDefault();
            else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            gridState.isDragging = true;
            gridState.lastMouseX = e.clientX;
            gridState.lastMouseY = e.clientY;
            viewport.classList.add('dragging');
        }
    });

    // Prevent context menu on right-click
    viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    window.addEventListener('mousemove', (e) => {
        if (!gridState.isDragging) return;

        gridState.panX += e.clientX - gridState.lastMouseX;
        gridState.panY += e.clientY - gridState.lastMouseY;
        gridState.lastMouseX = e.clientX;
        gridState.lastMouseY = e.clientY;

        updateGridTransform();
    });

    const stop = () => {
        gridState.isDragging = false;
        viewport.classList.remove('dragging');
    };
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);

    // Zoom buttons
    const controls = el('div', 'zoom-controls');
    const zoomBtn = (label, title, action) => {
        const btn = el('button', 'zoom-btn', label);
        btn.type = 'button';
        btn.title = title;
        btn.addEventListener('click', action);
        controls.appendChild(btn);
    };
    const centre = () => { const r = viewport.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    zoomBtn('−', 'Zoom out', () => { glide(); zoomAt(...centre(), gridState.zoom / 1.25); });
    controls.appendChild(el('span', 'zoom-indicator'));
    zoomBtn('+', 'Zoom in', () => { glide(); zoomAt(...centre(), gridState.zoom * 1.25); });
    zoomBtn('Fit', 'Show the whole board', () => fitAll());
    document.querySelector('.board-wrap').appendChild(controls);
}

/**
 * Update grid transform for zoom and pan
 */
function updateGridTransform() {
    const container = document.querySelector('.grid-container');
    if (!container) return;

    container.style.transform = `translate(${gridState.panX}px, ${gridState.panY}px) scale(${gridState.zoom})`;
    // The connections are inside the container, so they move and scale with it
}

/**
 * Update zoom indicator
 */
function updateZoomIndicator() {
    const indicator = document.querySelector('.zoom-indicator');
    if (indicator) indicator.textContent = `${Math.round(gridState.zoom * 100)}%`;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Escape key to clear selections (Zepha only)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (!gridState.isGM || gridState.viewMode)) {
            clearSelections();
        }
    });

    // Left-click on empty areas to clear highlighting (Zepha only) - ignore right-clicks
    document.addEventListener('click', (e) => {
        if ((!gridState.isGM || gridState.viewMode) && e.button !== 2 && !e.target.closest('.grid-cell.skill') && !e.target.closest('.side-panel, .arcane-header, .zoom-controls')) {
            clearChainHighlighting();
        }
    });

    // Add instructions
    addInstructions();
}

/**
 * Add instructions, opened from the ? in the header
 */
function addInstructions() {
    const instructions = document.createElement('div');
    instructions.className = 'grid-instructions';

    if (gridState.isGM) {
        instructions.innerHTML = `
            <strong>GM controls</strong>
            <ul>
                <li>Mouse wheel: zoom in and out</li>
                <li>Drag the background (or right-drag anywhere): move the board</li>
                <li>Point at a skill: see what it needs and what it opens</li>
                <li>Every skill needs the one above it in its own path; anything it needs from another path is named on the skill</li>
                <li>Click a skill: edit it. Enter saves, Esc cancels</li>
                <li>The Editing / Viewing switch at the top right: look at skills the way Zepha does, without editing</li>
                <li>Connect: click the skill needed first, then the skill that needs it</li>
                <li>Save Grid keeps your text and connections</li>
            </ul>
        `;
    } else {
        instructions.innerHTML = `
            <strong>Controls</strong>
            <ul>
                <li>Mouse wheel: zoom in and out</li>
                <li>Drag the background (or right-drag anywhere): move the board</li>
                <li>Point at a skill: see what it needs and what it opens</li>
                <li>Every skill needs the one above it in its own path; anything it needs from another path is named on the skill</li>
                <li>Click a skill: keep it in view. Esc lets go</li>
                <li>Learn Skill: then click skills to mark them learned</li>
                <li>Save Skills keeps what you have marked</li>
            </ul>
        `;
    }

    document.querySelector('.board-wrap').appendChild(instructions);

    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            instructions.classList.toggle('open');
            helpBtn.classList.toggle('active', instructions.classList.contains('open'));
        });
    }
}

/**
 * Clear all selections and chain highlighting (Zepha only)
 */
function clearSelections() {
    gridState.selectedCells.forEach(cellId => {
        const cell = document.getElementById(cellId);
        if (cell) {
            cell.classList.remove('selected');
        }
    });
    gridState.selectedCells.clear();
    clearChainHighlighting();
}

/* ------------------------------------------------------------------ saving and loading */

/**
 * Save GM data (text and arrows) - Legacy function kept for compatibility
 */
async function saveGMData() {
    return await saveGMDataReliably();
}

/**
 * Save GM data with enhanced reliability and error handling
 */
async function saveGMDataReliably() {
    // Create a snapshot of data to save to prevent race conditions
    const cellsSnapshot = new Map(gridState.editableCells);
    const connectionsSnapshot = new Map(gridState.customConnections);

    const data = {
        editableCells: Object.fromEntries(cellsSnapshot),
        customConnections: Object.fromEntries(connectionsSnapshot),
        timestamp: new Date().toISOString(),
        user: 'GM'
    };

    console.log(`[SAVE] GM data: ${cellsSnapshot.size} cells, ${connectionsSnapshot.size} connections`);

    try {
        const response = await fetch('save_gm_data.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            console.log('[SAVE] GM data saved successfully to server');
            return true;
        } else {
            console.error('[SAVE] Server rejected GM data save:', result.error || 'Unknown error');
            throw new Error(result.error || 'Server rejected save');
        }

    } catch (error) {
        console.error('[SAVE] Error saving GM data to server:', error);

        // Fallback to localStorage as backup
        try {
            localStorage.setItem('arcaneGMData_backup', JSON.stringify(data));
            console.log('[SAVE] GM data backed up to localStorage');
        } catch (storageError) {
            console.error('[SAVE] Failed to backup to localStorage:', storageError);
        }

        return false; // Save failed
    }
}

/**
 * Save Zepha data (learned skills) - Legacy function kept for compatibility
 */
async function saveZephaData() {
    return await saveZephaDataReliably();
}

/**
 * Save Zepha data with enhanced reliability and error handling
 */
async function saveZephaDataReliably() {
    // Capture the learned skills at save time to prevent race conditions
    const learnedSkillsSnapshot = Array.from(gridState.learnedSkills);

    const data = {
        learnedSkills: learnedSkillsSnapshot,
        timestamp: new Date().toISOString(),
        user: 'zepha'
    };

    console.log('[SAVE] Zepha data being sent to server:', data);

    try {
        const response = await fetch('save_zepha_data.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            console.log('[SAVE] Zepha data saved successfully to server');
            return true;
        } else {
            console.error('[SAVE] Server rejected Zepha data save:', result.error || 'Unknown error');
            throw new Error(result.error || 'Server rejected save');
        }

    } catch (error) {
        console.error('[SAVE] Error saving Zepha data to server:', error);

        // Fallback to localStorage as backup
        try {
            localStorage.setItem('arcaneZephaData_backup', JSON.stringify(data));
            console.log('[SAVE] Zepha data backed up to localStorage');
        } catch (storageError) {
            console.error('[SAVE] Failed to backup to localStorage:', storageError);
        }

        return false; // Save failed
    }
}

/**
 * Wait for save lock to be released
 */
async function waitForSaveLock() {
    let attempts = 0;
    while (attempts < 10) { // Max 5 seconds wait
        try {
            const response = await fetch('check_save_lock.php');
            const result = await response.json();

            if (!result.locked || (Date.now() - result.timestamp) > 10000) {
                // No lock or expired lock
                return;
            }

            // Wait 500ms and try again
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        } catch (error) {
            console.error('Error checking save lock:', error);
            return; // Proceed anyway if check fails
        }
    }
}

/**
 * Load shared data from server (both GM and Zepha data)
 * @param {boolean} applyToDOM - Whether to draw it straight away (only once the board exists)
 */
async function loadGridData(applyToDOM = false) {
    await loadSharedData(applyToDOM);
}

/**
 * The page does not refresh itself: an automatic refresh used to wipe connections the GM was in the middle of drawing.
 * Reload the page to see the other person's changes.
 */
function startSmartRefresh() {
    if (gridState.refreshInterval) {
        clearInterval(gridState.refreshInterval);
        gridState.refreshInterval = null;
    }
}

/**
 * Load shared data
 * @param {boolean} applyToDOM - Whether to draw it straight away
 */
async function loadSharedData(applyToDOM = true) {
    if (gridState.isSaving) {
        console.log('[LOAD] Skipping data reload - save operation in progress');
        return;
    }

    let loaded = false;

    try {
        const response = await fetch('load_shared_data.php');

        if (response.ok) {
            const data = await response.json();

            // Load GM data (visible to both users)
            if (data.gm_data) {
                if (data.gm_data.editableCells) {
                    const serverCells = new Map(Object.entries(data.gm_data.editableCells));
                    const timeSinceLastSave = Date.now() - gridState.lastSaveTime;

                    if (gridState.hasUnsavedChanges && timeSinceLastSave > 3000) {
                        // Keep local changes, take from the server only the cells not touched here
                        for (const [key, value] of serverCells) {
                            if (!gridState.editableCells.has(key)) {
                                gridState.editableCells.set(key, value);
                            }
                        }
                    } else {
                        gridState.editableCells = serverCells;
                    }
                }
                if (data.gm_data.customConnections) {
                    gridState.customConnections = new Map(Object.entries(data.gm_data.customConnections));
                }
            }

            // Load Zepha data (visible to both users)
            if (data.zepha_data && data.zepha_data.learnedSkills) {
                const serverSkills = new Set(data.zepha_data.learnedSkills);
                const timeSinceLastSave = Date.now() - gridState.lastSaveTime;

                // Don't overwrite local changes if:
                // 1. We have unsaved local skills AND haven't saved recently (more than 3 seconds ago)
                // 2. OR we just saved recently (less than 30 seconds ago) and have local skills
                const hasUnsavedChanges = gridState.learnedSkills.size > 0 &&
                    (gridState.lastSaveTime === 0 || timeSinceLastSave > 3000);
                const justSaved = gridState.lastSaveTime > 0 && timeSinceLastSave < 30000;

                if (!(hasUnsavedChanges && !justSaved) && !(justSaved && gridState.learnedSkills.size > 0)) {
                    gridState.learnedSkills = serverSkills;
                }
            }

            console.log('Shared data loaded from server');
            loaded = true;
        }
    } catch (error) {
        console.error('Error loading shared data:', error);
    }

    if (!loaded) {
        // Fallback to localStorage
        const gmData = localStorage.getItem('arcaneGMData');
        const zephaData = localStorage.getItem('arcaneZephaData');

        if (gmData) {
            const data = JSON.parse(gmData);
            if (data.editableCells) {
                gridState.editableCells = new Map(Object.entries(data.editableCells));
            }
            if (data.customConnections) {
                gridState.customConnections = new Map(Object.entries(data.customConnections));
            }
        }

        if (zephaData) {
            const data = JSON.parse(zephaData);
            if (data.learnedSkills) {
                gridState.learnedSkills = new Set(data.learnedSkills);
            }
        }

        console.log('Shared data loaded from localStorage');
    }

    if (applyToDOM) {
        renderAllSkills();
        redrawAllArrows();
    }
}

/**
 * Helper function to compare two Sets for equality
 */
function setsEqual(set1, set2) {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
        if (!set2.has(item)) return false;
    }
    return true;
}

/**
 * Diagnostic function: is every saved skill on the board, showing the text that was saved?
 */
function diagnoseGridState() {
    let found = 0, matching = 0, mismatched = 0, missing = 0;

    gridState.editableCells.forEach((stateContent, cellKey) => {
        const cellElement = document.getElementById(`cell-${cellKey}`);
        if (!cellElement || !cellElement.classList.contains('skill')) {
            missing++;
            console.warn(`[DIAGNOSE] Saved cell ${cellKey} is not a skill cell on the board`);
            return;
        }
        found++;
        if (cellElement._raw === stateContent) matching++;
        else {
            mismatched++;
            console.warn(`[DIAGNOSE] Cell ${cellKey} is not showing its saved text`);
        }
    });

    console.log(`[DIAGNOSE] ${gridState.editableCells.size} saved cells: ${matching} shown correctly, ${mismatched} mismatched, ${missing} not on the board`);

    return {
        totalCells: gridState.editableCells.size,
        domFound: found,
        matching: matching,
        mismatched: mismatched,
        missing: missing
    };
}

// Make diagnosis function available globally for debugging
window.diagnoseGridState = diagnoseGridState;

/**
 * Add page protection to prevent data loss during saves or with unsaved changes
 */
function addPageProtection() {
    window.addEventListener('beforeunload', function(e) {
        // Prevent page close/refresh during active save operations
        if (gridState.isSaving) {
            e.preventDefault();
            e.returnValue = 'Save operation in progress. Leaving now may cause data loss. Really leave?';
            return e.returnValue;
        }

        // Warn about unsaved changes
        if (gridState.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes that will be lost. Really leave?';
            return e.returnValue;
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    updateZoomIndicator();

    // Add page protection to prevent data loss
    addPageProtection();
});
