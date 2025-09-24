class DashboardDiceRoller {
    constructor(buttonId) {
        this.triggerButton = document.getElementById(buttonId);
        if (!this.triggerButton) {
            console.warn(`Dice roller trigger button with id "${buttonId}" not found.`);
            return;
        }

        this.currentRollQueue = [];
        this.lastPosition = null;
        this.hasCustomPosition = false;
        this.dragState = {
            active: false,
            offsetX: 0,
            offsetY: 0
        };

        this.rollButton = null;
        this.projectRollButton = null;
        this.clearButton = null;
        this.advantageToggleButton = null;
        this.advantageEnabled = false;

        this.projectPromptState = {
            active: false,
            container: null,
            nameInput: null,
            message: null,
            selectedIndex: null,
            selectedName: '',
            hasCustomPosition: false,
            drag: {
                active: false,
                offsetX: 0,
                offsetY: 0
            },
            confirmButton: null,
            manualEntryActive: false,
            manualInput: null,
            manualEntryContainer: null,
            manualToggleButton: null
        };

        this.handleProjectSelection = (event) => this.onProjectSelected(event);
        this.handleProjectPromptPointerMove = (event) => this.onProjectPromptPointerMove(event);
        this.handleProjectPromptPointerUp = () => this.onProjectPromptPointerUp();

        this.buildUI();
        this.attachEvents();

        this.handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                this.close();
            }
        };

        this.handlePointerMove = (event) => this.onPointerMove(event);
        this.handlePointerUp = (event) => this.onPointerUp(event);
        this.handleResize = () => {
            this.keepModalInBounds();
            this.repositionProjectPrompt();
        };

        window.addEventListener('resize', this.handleResize);
    }

    buildUI() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'dice-modal-overlay hidden';

        this.modal = document.createElement('div');
        this.modal.className = 'dice-modal';
        this.modal.setAttribute('role', 'dialog');
        this.modal.setAttribute('aria-modal', 'true');
        this.modal.setAttribute('aria-labelledby', 'dice-roller-title');
        this.modal.tabIndex = -1;

        const header = document.createElement('div');
        header.className = 'dice-modal-header';
        header.addEventListener('pointerdown', (event) => this.startDrag(event));

        const title = document.createElement('h2');
        title.className = 'dice-modal-title';
        title.id = 'dice-roller-title';
        title.textContent = 'Dice Roller';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'dice-modal-close';
        closeBtn.setAttribute('aria-label', 'Close dice roller');
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(title);
        header.appendChild(closeBtn);

        const content = document.createElement('div');
        content.className = 'dice-modal-content';

        content.appendChild(this.createDiceButtonsSection());
        content.appendChild(this.createQueueSection());
        content.appendChild(this.createActionsSection());

        this.modal.appendChild(header);
        this.modal.appendChild(content);
        this.overlay.appendChild(this.modal);
        document.body.appendChild(this.overlay);

    }

    attachEvents() {
        this.triggerButton.addEventListener('click', () => this.open());
    }

    createDiceButtonsSection() {
        const section = document.createElement('div');
        section.className = 'dice-buttons-section';

        const firstRow = document.createElement('div');
        firstRow.className = 'dice-buttons-row';
        [
            { text: 'D2', dice: '1d2' },
            { text: 'D4', dice: '1d4' },
            { text: 'D8', dice: '1d8' },
            { text: 'D10', dice: '1d10' },
            { text: 'D20', dice: '1d20' }
        ].forEach(({ text, dice }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dice-btn';
            btn.textContent = text;
            btn.addEventListener('click', () => this.addToQueue(dice));
            firstRow.appendChild(btn);
        });

        const secondRow = document.createElement('div');
        secondRow.className = 'dice-buttons-row';
        [
            { text: 'Power Roll', value: '2d10' },
            { text: 'Edge', value: '+2' },
            { text: 'Bane', value: '-2' },
            { text: '+1', value: '+1' }
        ].forEach(({ text, value }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dice-btn special';
            btn.textContent = text;
            btn.addEventListener('click', () => this.addToQueue(value));
            secondRow.appendChild(btn);
        });

        section.appendChild(firstRow);
        section.appendChild(secondRow);
        return section;
    }

    createQueueSection() {
        const queueSection = document.createElement('div');
        queueSection.className = 'dice-queue-section';

        const label = document.createElement('div');
        label.className = 'dice-queue-label';
        label.textContent = 'Current Roll:';

        this.queueDisplay = document.createElement('div');
        this.queueDisplay.className = 'dice-queue empty';
        this.queueDisplay.textContent = '(nothing queued)';

        queueSection.appendChild(label);
        queueSection.appendChild(this.queueDisplay);
        return queueSection;
    }

    createActionsSection() {
        const actions = document.createElement('div');
        actions.className = 'dice-actions';

        const advantageToggle = document.createElement('button');
        advantageToggle.type = 'button';
        advantageToggle.className = 'dice-advantage-toggle';
        advantageToggle.textContent = 'Advantage: Off';
        advantageToggle.setAttribute('aria-pressed', 'false');
        advantageToggle.addEventListener('click', () => this.toggleAdvantage());

        const rollBtn = document.createElement('button');
        rollBtn.type = 'button';
        rollBtn.className = 'dice-roll-btn';
        rollBtn.textContent = 'Roll!';
        rollBtn.addEventListener('click', () => this.calculateRoll());

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'dice-clear-btn';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => this.clearQueue());

        const projectBtn = document.createElement('button');
        projectBtn.type = 'button';
        projectBtn.className = 'dice-project-btn';
        projectBtn.textContent = 'Project Roll';
        projectBtn.addEventListener('click', () => this.startProjectRollFlow());

        this.rollButton = rollBtn;
        this.clearButton = clearBtn;
        this.projectRollButton = projectBtn;
        this.advantageToggleButton = advantageToggle;

        this.resultLabel = document.createElement('div');
        this.resultLabel.className = 'dice-result';

        this.resultTotal = document.createElement('div');
        this.resultTotal.className = 'dice-result-total';
        this.resultTotal.textContent = 'Result: -';

        this.resultDetail = document.createElement('div');
        this.resultDetail.className = 'dice-result-detail';
        this.resultDetail.style.display = 'none';

        this.resultLabel.appendChild(this.resultTotal);
        this.resultLabel.appendChild(this.resultDetail);

        actions.appendChild(advantageToggle);
        actions.appendChild(rollBtn);
        actions.appendChild(clearBtn);
        actions.appendChild(projectBtn);
        actions.appendChild(this.resultLabel);
        return actions;
    }

    toggleAdvantage() {
        this.advantageEnabled = !this.advantageEnabled;

        if (!this.advantageToggleButton) {
            return;
        }

        if (this.advantageEnabled) {
            this.advantageToggleButton.classList.add('dice-advantage-toggle--active');
            this.advantageToggleButton.textContent = 'Advantage: On';
            this.advantageToggleButton.setAttribute('aria-pressed', 'true');
        } else {
            this.advantageToggleButton.classList.remove('dice-advantage-toggle--active');
            this.advantageToggleButton.textContent = 'Advantage: Off';
            this.advantageToggleButton.setAttribute('aria-pressed', 'false');
        }
    }

    setStandardRollControlsVisible(shouldShow) {
        const displayValue = shouldShow ? '' : 'none';

        if (this.rollButton) {
            this.rollButton.style.display = displayValue;
        }

        if (this.projectRollButton) {
            this.projectRollButton.style.display = displayValue;
        }

        if (this.clearButton) {
            this.clearButton.disabled = false;
        }
    }

    open() {
        if (this.overlay) {
            this.overlay.classList.remove('hidden');
            document.addEventListener('keydown', this.handleKeyDown);
            requestAnimationFrame(() => {
                if (!this.modal) {
                    return;
                }

                if (this.hasCustomPosition && this.lastPosition) {
                    this.applyLastPosition();
                } else {
                    this.centerModal();
                }

                this.modal.focus();
            });
        }
    }

    close() {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
            document.removeEventListener('keydown', this.handleKeyDown);
            this.onPointerUp();
            this.closeProjectPrompt();
            this.setStandardRollControlsVisible(true);
        }
    }

    addToQueue(item) {
        this.currentRollQueue.push(item);
        this.updateQueueDisplay();
        this.updateProjectPromptStatusMessage();
    }

    updateQueueDisplay() {
        if (!this.queueDisplay) {
            return;
        }

        if (this.currentRollQueue.length === 0) {
            this.queueDisplay.textContent = '(nothing queued)';
            this.queueDisplay.classList.add('empty');
        } else {
            this.queueDisplay.textContent = this.currentRollQueue.join(' ');
            this.queueDisplay.classList.remove('empty');
        }
    }

    clearQueue() {
        this.currentRollQueue = [];
        this.updateQueueDisplay();
        if (this.resultTotal && this.resultDetail) {
            this.resultTotal.textContent = 'Result: -';
            this.resultDetail.textContent = '';
            this.resultDetail.style.display = 'none';
        }
        this.updateProjectPromptStatusMessage();
    }

    updateProjectPromptStatusMessage(customMessage = null) {
        if (!this.projectPromptState.active || !this.projectPromptState.message) {
            return;
        }

        if (typeof customMessage === 'string') {
            this.projectPromptState.message.textContent = customMessage;
            return;
        }

        const nameInputValue = this.projectPromptState.nameInput && typeof this.projectPromptState.nameInput.value === 'string'
            ? this.projectPromptState.nameInput.value.trim()
            : '';
        const manualValue = this.projectPromptState.manualInput && typeof this.projectPromptState.manualInput.value === 'string'
            ? this.projectPromptState.manualInput.value.trim()
            : '';
        const projectName = nameInputValue || this.projectPromptState.selectedName;

        if (this.projectPromptState.manualEntryActive) {
            if (manualValue === '') {
                this.projectPromptState.message.textContent = 'Enter the result value you want to submit.';
            } else if (projectName) {
                this.projectPromptState.message.textContent = `Manual result ready for ${projectName}.`;
            } else {
                this.projectPromptState.message.textContent = 'Manual result ready. Select a project to attach it to.';
            }
            return;
        }

        if (projectName) {
            if (this.currentRollQueue.length === 0) {
                this.projectPromptState.message.textContent = `Project selected (${projectName}). Add dice to the queue to roll.`;
            } else {
                this.projectPromptState.message.textContent = `Project selected (${projectName}). Ready to roll!`;
            }
            return;
        }

        if (this.currentRollQueue.length === 0) {
            this.projectPromptState.message.textContent = 'Add dice to the queue, then click a project to select it.';
        } else {
            this.projectPromptState.message.textContent = 'Click a project to fill its name automatically.';
        }
    }

    performRoll() {
        if (this.currentRollQueue.length === 0) {
            return null;
        }

        const components = [...this.currentRollQueue];
        const breakdown = [];
        let totalResult = 0;

        for (const item of components) {
            if (typeof item !== 'string' || item.trim() === '') {
                continue;
            }

            if (/^[+-]\d+$/.test(item.trim())) {
                const modifierValue = parseInt(item, 10);
                totalResult += modifierValue;
                breakdown.push({
                    type: 'modifier',
                    notation: item.trim(),
                    value: modifierValue
                });
            } else {
                const { result, detail } = this.parseAndRollDice(item.trim());
                const rolls = Array.isArray(detail) ? detail.map((roll) => parseInt(roll, 10)) : [];
                totalResult += result;
                breakdown.push({
                    type: 'dice',
                    notation: item.trim(),
                    rolls,
                    total: result
                });
            }
        }

        return {
            total: totalResult,
            components,
            breakdown,
            expression: components.join(' ')
        };
    }

    resolveCurrentRollResult() {
        const baseRoll = this.performRoll();
        if (!baseRoll) {
            return null;
        }

        if (!this.advantageEnabled) {
            baseRoll.advantage = { active: false };
            return baseRoll;
        }

        const secondRoll = this.performRoll();
        if (!secondRoll) {
            baseRoll.advantage = { active: false };
            return baseRoll;
        }

        const attempts = [baseRoll, secondRoll];
        const keptIndex = attempts[0].total >= attempts[1].total ? 0 : 1;
        const keptRoll = {
            ...attempts[keptIndex],
            components: Array.isArray(attempts[keptIndex].components)
                ? [...attempts[keptIndex].components]
                : attempts[keptIndex].components,
            breakdown: Array.isArray(attempts[keptIndex].breakdown)
                ? attempts[keptIndex].breakdown.map((entry) => {
                    if (!entry || typeof entry !== 'object') {
                        return entry;
                    }

                    const cloned = { ...entry };
                    if (Array.isArray(entry.rolls)) {
                        cloned.rolls = [...entry.rolls];
                    }
                    return cloned;
                })
                : attempts[keptIndex].breakdown
        };

        keptRoll.advantage = {
            active: true,
            keptIndex,
            attempts: attempts.map((roll, index) => ({
                index,
                total: roll.total,
                expression: roll.expression
            }))
        };

        return keptRoll;
    }

    updateResultDisplay(rollResult) {
        if (!this.resultTotal || !this.resultDetail || !rollResult) {
            return;
        }

        const isManual = rollResult.manualEntry && rollResult.manualEntry.active;
        const hasAdvantage = rollResult.advantage && rollResult.advantage.active;
        const resultLabel = isManual
            ? 'Manual Result'
            : hasAdvantage
                ? 'Result (Advantage)'
                : 'Result';

        this.resultTotal.textContent = `${resultLabel}: ${rollResult.total}`;

        const detailParts = [];
        if (hasAdvantage) {
            const attempts = Array.isArray(rollResult.advantage.attempts)
                ? rollResult.advantage.attempts
                : [];
            const keptIndex = typeof rollResult.advantage.keptIndex === 'number'
                ? rollResult.advantage.keptIndex
                : 0;

            if (attempts.length > 0) {
                const attemptSummary = attempts
                    .map((attempt, index) => {
                        const total = typeof attempt.total === 'number' ? attempt.total : '?';
                        return `#${index + 1}: ${total}`;
                    })
                    .join(', ');
                const keptAttempt = attempts[keptIndex];
                const keptTotal = keptAttempt && typeof keptAttempt.total === 'number'
                    ? keptAttempt.total
                    : rollResult.total;
                detailParts.push(`Advantage applied (kept #${keptIndex + 1}: ${keptTotal}). Rolls ${attemptSummary}.`);
            } else {
                detailParts.push('Advantage applied: best of two rolls kept.');
            }
        }

        if (isManual) {
            const manualValue = rollResult.manualEntry && typeof rollResult.manualEntry.value !== 'undefined'
                ? rollResult.manualEntry.value
                : rollResult.total;
            detailParts.push(`Manual result entered (${manualValue}).`);
        }

        if (Array.isArray(rollResult.breakdown)) {
            rollResult.breakdown.forEach((entry) => {
                if (!entry) {
                    return;
                }
                if (entry.type === 'dice') {
                    const notation = entry.notation || '';
                    const rolls = Array.isArray(entry.rolls) ? entry.rolls.join(', ') : '';
                    detailParts.push(`${notation}: ${rolls}`.trim());
                } else if (entry.type === 'modifier') {
                    detailParts.push(entry.notation || `${entry.value >= 0 ? '+' : ''}${entry.value}`);
                }
            });
        }

        if (detailParts.length > 0) {
            this.resultDetail.textContent = detailParts.join(' | ');
            this.resultDetail.style.display = 'block';
        } else {
            this.resultDetail.textContent = '';
            this.resultDetail.style.display = 'none';
        }
    }

    publishRollToChat(type, rollResult, extraPayload = {}) {
        if (!rollResult || !window.dashboardChat || typeof window.dashboardChat.sendMessage !== 'function') {
            return;
        }

        const payload = Object.assign({}, rollResult, extraPayload);
        if (type === 'project_roll' && !payload.status) {
            payload.status = 'pending';
        }

        const expression = rollResult.expression || (Array.isArray(rollResult.components) ? rollResult.components.join(' ') : '');
        const descriptor = rollResult.manualEntry && rollResult.manualEntry.active
            ? ' (Manual)'
            : rollResult.advantage && rollResult.advantage.active
                ? ' (Advantage)'
                : '';
        const fallbackMessage = type === 'project_roll' && payload.projectName
            ? `Project roll for ${payload.projectName}${descriptor}: ${rollResult.total}`
            : `Dice roll${descriptor} (${expression}): ${rollResult.total}`;

        const maybePromise = window.dashboardChat.sendMessage({
            message: fallbackMessage,
            type,
            payload
        });

        if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.catch(() => {});
        }
    }

    calculateRoll() {
        if (this.currentRollQueue.length === 0) {
            if (this.resultTotal && this.resultDetail) {
                this.resultTotal.textContent = 'Nothing to roll!';
                this.resultDetail.textContent = '';
                this.resultDetail.style.display = 'none';
            }
            return;
        }

        try {
            const rollResult = this.resolveCurrentRollResult();
            if (!rollResult) {
                return;
            }

            this.updateResultDisplay(rollResult);
            this.currentRollQueue = [];
            this.updateQueueDisplay();
            this.publishRollToChat('dice_roll', rollResult);
        } catch (error) {
            if (this.resultTotal && this.resultDetail) {
                this.resultTotal.textContent = `Error: ${error.message}`;
                this.resultDetail.textContent = '';
                this.resultDetail.style.display = 'none';
            }
        }
    }

    startProjectRollFlow() {
        this.focusProjectsSection();
        this.positionDiceModalForProjectRoll();

        this.setStandardRollControlsVisible(false);

        if (this.projectPromptState.active) {
            this.projectPromptState.hasCustomPosition = false;
            this.positionProjectPrompt(true);
            this.updateProjectPromptStatusMessage();
        } else {
            this.openProjectPrompt();
        }
    }

    focusProjectsSection() {
        if (typeof window.switchSection === 'function') {
            const maybePromise = window.switchSection('projects');
            if (maybePromise && typeof maybePromise.catch === 'function') {
                maybePromise.catch((error) => {
                    console.error('Failed to switch to projects section:', error);
                });
            }
        }

        const projectsSection = document.getElementById('projects-section');
        if (projectsSection && typeof projectsSection.scrollIntoView === 'function') {
            projectsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    positionDiceModalForProjectRoll() {
        if (!this.modal) {
            return;
        }

        const modalWidth = this.modal.offsetWidth || 0;
        const modalHeight = this.modal.offsetHeight || 0;
        const targetLeft = Math.min(
            Math.max(window.innerWidth * (2 / 3), 0),
            Math.max(window.innerWidth - modalWidth, 0)
        );
        const verticalCenter = (window.innerHeight - modalHeight) / 2;
        const targetTop = Math.min(
            Math.max(Number.isFinite(verticalCenter) ? verticalCenter : 0, 20),
            Math.max(window.innerHeight - modalHeight, 0)
        );

        const constrained = this.constrainPosition(targetLeft, targetTop);
        this.modal.style.left = `${constrained.left}px`;
        this.modal.style.top = `${constrained.top}px`;
        this.lastPosition = { left: constrained.left, top: constrained.top };
        this.hasCustomPosition = true;
    }

    positionProjectPrompt(force = false) {
        if (!this.projectPromptState.active || !this.projectPromptState.container) {
            return;
        }

        if (this.projectPromptState.hasCustomPosition && !force) {
            return;
        }

        const prompt = this.projectPromptState.container;
        const promptWidth = prompt.offsetWidth || 0;
        const promptHeight = prompt.offsetHeight || 0;
        const baseLeft = Math.min(
            Math.max(window.innerWidth * (2 / 3), 0),
            Math.max(window.innerWidth - promptWidth, 0)
        );

        let baseTop = (window.innerHeight - promptHeight) / 2;
        if (this.modal) {
            const modalRect = this.modal.getBoundingClientRect();
            baseTop = modalRect.bottom + 16;
            if (baseTop + promptHeight > window.innerHeight) {
                baseTop = modalRect.top - promptHeight - 16;
            }
            if (baseTop < 0) {
                baseTop = modalRect.top;
            }
        }

        const { left, top } = this.constrainPromptPosition(baseLeft, baseTop);
        prompt.style.left = `${left}px`;
        prompt.style.top = `${top}px`;
    }

    repositionProjectPrompt(force = false) {
        if (!this.projectPromptState.active || !this.projectPromptState.container) {
            return;
        }

        if (this.projectPromptState.hasCustomPosition && !force) {
            const currentLeft = parseFloat(this.projectPromptState.container.style.left) || 0;
            const currentTop = parseFloat(this.projectPromptState.container.style.top) || 0;
            const { left, top } = this.constrainPromptPosition(currentLeft, currentTop);
            this.projectPromptState.container.style.left = `${left}px`;
            this.projectPromptState.container.style.top = `${top}px`;
            return;
        }

        this.positionProjectPrompt(force);
    }

    openProjectPrompt() {
        if (this.projectPromptState.active) {
            return;
        }

        const prompt = this.createProjectPrompt();
        document.body.appendChild(prompt);

        this.projectPromptState.active = true;
        this.projectPromptState.container = prompt;
        this.projectPromptState.selectedIndex = null;
        this.projectPromptState.selectedName = '';
        this.projectPromptState.hasCustomPosition = false;

        const nameInput = prompt.querySelector('.project-roll-prompt__input:not(.project-roll-prompt__input--manual)');
        const manualInput = prompt.querySelector('.project-roll-prompt__input--manual');
        const manualEntryContainer = prompt.querySelector('.project-roll-prompt__manual-entry');
        const manualToggleButton = prompt.querySelector('.project-roll-prompt__btn--manual');
        const confirmButton = prompt.querySelector('.project-roll-prompt__btn--confirm');
        const message = prompt.querySelector('.project-roll-prompt__message');
        this.projectPromptState.nameInput = nameInput;
        this.projectPromptState.message = message;
        this.projectPromptState.manualInput = manualInput;
        this.projectPromptState.manualEntryContainer = manualEntryContainer;
        this.projectPromptState.manualToggleButton = manualToggleButton;
        this.projectPromptState.confirmButton = confirmButton;
        this.projectPromptState.manualEntryActive = false;

        if (manualEntryContainer) {
            manualEntryContainer.style.display = 'none';
        }

        if (manualInput) {
            manualInput.value = '';
        }

        if (manualToggleButton) {
            manualToggleButton.classList.remove('project-roll-prompt__btn--manual-active');
            manualToggleButton.setAttribute('aria-pressed', 'false');
            manualToggleButton.textContent = 'Manual Result';
        }

        if (confirmButton) {
            confirmButton.textContent = 'Roll Project';
        }

        document.addEventListener('click', this.handleProjectSelection, true);

        requestAnimationFrame(() => {
            if (!this.projectPromptState.active || this.projectPromptState.container !== prompt) {
                return;
            }
            this.positionProjectPrompt(true);
            this.updateProjectPromptStatusMessage();
        });

        this.setStandardRollControlsVisible(false);

        if (nameInput) {
            nameInput.focus();
        }
    }

    closeProjectPrompt() {
        if (!this.projectPromptState.active) {
            return;
        }

        this.onProjectPromptPointerUp();

        document.removeEventListener('click', this.handleProjectSelection, true);
        document.removeEventListener('pointermove', this.handleProjectPromptPointerMove);
        document.removeEventListener('pointerup', this.handleProjectPromptPointerUp);

        if (this.projectPromptState.container && this.projectPromptState.container.parentElement) {
            this.projectPromptState.container.parentElement.removeChild(this.projectPromptState.container);
        }

        this.projectPromptState.active = false;
        this.projectPromptState.container = null;
        this.projectPromptState.nameInput = null;
        this.projectPromptState.message = null;
        this.projectPromptState.selectedIndex = null;
        this.projectPromptState.selectedName = '';
        this.projectPromptState.hasCustomPosition = false;
        this.projectPromptState.manualEntryActive = false;
        this.projectPromptState.manualInput = null;
        this.projectPromptState.manualEntryContainer = null;
        this.projectPromptState.manualToggleButton = null;
        this.projectPromptState.confirmButton = null;
        this.projectPromptState.drag.active = false;

        this.setStandardRollControlsVisible(true);
    }

    createProjectPrompt() {
        const prompt = document.createElement('div');
        prompt.className = 'project-roll-prompt';
        prompt.setAttribute('role', 'dialog');
        prompt.setAttribute('aria-modal', 'true');
        prompt.tabIndex = -1;

        const header = document.createElement('div');
        header.className = 'project-roll-prompt__header';
        header.textContent = 'Project Roll';
        header.addEventListener('pointerdown', (event) => this.startProjectPromptDrag(event));

        const instructions = document.createElement('p');
        instructions.className = 'project-roll-prompt__instructions';
        instructions.textContent = 'Click on the project you want to roll for.';

        const nameLabel = document.createElement('label');
        nameLabel.className = 'project-roll-prompt__label';
        nameLabel.textContent = 'Project Name';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'project-roll-prompt__input';
        nameInput.placeholder = 'Select a project...';
        nameInput.addEventListener('input', () => this.updateProjectPromptStatusMessage());

        const message = document.createElement('div');
        message.className = 'project-roll-prompt__message';
        message.textContent = 'Click a project to fill its name automatically.';

        const manualEntryContainer = document.createElement('div');
        manualEntryContainer.className = 'project-roll-prompt__manual-entry';
        manualEntryContainer.style.display = 'none';

        const manualLabel = document.createElement('label');
        manualLabel.className = 'project-roll-prompt__label project-roll-prompt__label--manual';
        manualLabel.textContent = 'Manual Result';

        const manualInputId = `project-roll-manual-result-${Date.now()}`;

        const manualInput = document.createElement('input');
        manualInput.type = 'number';
        manualInput.className = 'project-roll-prompt__input project-roll-prompt__input--manual';
        manualInput.placeholder = 'Enter a result (e.g. 12)';
        manualInput.id = manualInputId;
        manualInput.addEventListener('input', () => this.updateProjectPromptStatusMessage());

        manualLabel.setAttribute('for', manualInputId);

        manualEntryContainer.appendChild(manualLabel);
        manualEntryContainer.appendChild(manualInput);

        const actions = document.createElement('div');
        actions.className = 'project-roll-prompt__actions';

        const manualBtn = document.createElement('button');
        manualBtn.type = 'button';
        manualBtn.className = 'project-roll-prompt__btn project-roll-prompt__btn--manual';
        manualBtn.textContent = 'Manual Result';
        manualBtn.setAttribute('aria-pressed', 'false');
        manualBtn.addEventListener('click', () => this.toggleManualProjectResult());

        const rollBtn = document.createElement('button');
        rollBtn.type = 'button';
        rollBtn.className = 'project-roll-prompt__btn project-roll-prompt__btn--confirm';
        rollBtn.textContent = 'Roll Project';
        rollBtn.addEventListener('click', () => this.completeProjectRoll());

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'project-roll-prompt__btn project-roll-prompt__btn--cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this.closeProjectPrompt());

        actions.appendChild(manualBtn);
        actions.appendChild(rollBtn);
        actions.appendChild(cancelBtn);

        prompt.appendChild(header);
        prompt.appendChild(instructions);
        prompt.appendChild(nameLabel);
        prompt.appendChild(nameInput);
        prompt.appendChild(message);
        prompt.appendChild(manualEntryContainer);
        prompt.appendChild(actions);

        return prompt;
    }

    toggleManualProjectResult() {
        if (!this.projectPromptState.active) {
            return;
        }

        const nextState = !this.projectPromptState.manualEntryActive;
        this.projectPromptState.manualEntryActive = nextState;

        const { manualEntryContainer, manualToggleButton, manualInput, confirmButton } = this.projectPromptState;

        if (manualEntryContainer) {
            manualEntryContainer.style.display = nextState ? '' : 'none';
        }

        if (manualToggleButton) {
            manualToggleButton.classList.toggle('project-roll-prompt__btn--manual-active', nextState);
            manualToggleButton.setAttribute('aria-pressed', nextState ? 'true' : 'false');
            manualToggleButton.textContent = nextState ? 'Manual Result On' : 'Manual Result';
        }

        if (confirmButton) {
            confirmButton.textContent = nextState ? 'Submit Result' : 'Roll Project';
        }

        if (!nextState && manualInput) {
            manualInput.value = '';
        }

        this.updateProjectPromptStatusMessage();

        if (nextState && manualInput) {
            manualInput.focus();
        }
    }

    onProjectSelected(event) {
        if (!this.projectPromptState.active) {
            return;
        }

        const projectItem = event.target.closest('#projects-list .project-item');
        if (!projectItem) {
            return;
        }

        const indexAttr = projectItem.getAttribute('data-project-index');
        if (indexAttr === null) {
            return;
        }

        const parsedIndex = parseInt(indexAttr, 10);
        if (Number.isNaN(parsedIndex)) {
            return;
        }

        const titleElement = projectItem.querySelector('.project-header h3');
        const name = titleElement ? titleElement.textContent.trim() : '';

        this.projectPromptState.selectedIndex = parsedIndex;
        this.projectPromptState.selectedName = name;

        if (this.projectPromptState.nameInput) {
            this.projectPromptState.nameInput.value = name;
        }

        this.updateProjectPromptStatusMessage();
    }

    findProjectIndexByName(name) {
        if (!name) {
            return null;
        }

        const normalized = name.trim().toLowerCase();
        if (normalized === '') {
            return null;
        }

        const projectItems = document.querySelectorAll('#projects-list .project-item');
        for (const item of projectItems) {
            const header = item.querySelector('.project-header h3');
            if (!header) {
                continue;
            }
            const text = header.textContent.trim().toLowerCase();
            if (text === normalized) {
                const indexAttr = item.getAttribute('data-project-index');
                const parsedIndex = indexAttr !== null ? parseInt(indexAttr, 10) : NaN;
                if (!Number.isNaN(parsedIndex)) {
                    return parsedIndex;
                }
            }
        }

        return null;
    }

    completeProjectRoll() {
        if (!this.projectPromptState.active) {
            return;
        }

        const nameInput = this.projectPromptState.nameInput;
        const providedName = nameInput ? nameInput.value.trim() : '';
        let projectIndex = this.projectPromptState.selectedIndex;

        if ((projectIndex === null || Number.isNaN(projectIndex)) && providedName !== '') {
            const foundIndex = this.findProjectIndexByName(providedName);
            if (foundIndex !== null) {
                projectIndex = foundIndex;
                this.projectPromptState.selectedIndex = foundIndex;
            }
        }

        if (projectIndex === null || Number.isNaN(projectIndex)) {
            if (this.projectPromptState.message) {
                this.projectPromptState.message.textContent = 'Please select a project before rolling.';
            }
            return;
        }

        const manualActive = this.projectPromptState.manualEntryActive;
        const manualInput = this.projectPromptState.manualInput;
        const manualValueRaw = manualActive && manualInput && typeof manualInput.value === 'string'
            ? manualInput.value.trim()
            : '';

        if (manualActive) {
            if (manualValueRaw === '') {
                this.updateProjectPromptStatusMessage('Enter the result value you want to submit.');
                return;
            }

            const manualValue = Number(manualValueRaw);
            if (!Number.isFinite(manualValue)) {
                this.updateProjectPromptStatusMessage('Please enter a valid number for the manual result.');
                return;
            }

            const manualRollResult = {
                total: manualValue,
                components: [],
                breakdown: [],
                expression: `Manual: ${manualValue}`,
                manualEntry: {
                    active: true,
                    value: manualValue
                },
                advantage: { active: false }
            };

            this.updateResultDisplay(manualRollResult);
            this.currentRollQueue = [];
            this.updateQueueDisplay();

            const projectName = providedName || this.projectPromptState.selectedName || `Project ${projectIndex + 1}`;
            const characterId = typeof window.currentCharacter === 'string' ? window.currentCharacter : '';

            this.publishRollToChat('project_roll', manualRollResult, {
                projectName,
                projectIndex,
                characterId,
                status: 'pending'
            });

            this.closeProjectPrompt();
            return;
        }

        if (this.currentRollQueue.length === 0) {
            this.updateProjectPromptStatusMessage('Please add dice to the roll before continuing.');
            return;
        }

        try {
            const rollResult = this.resolveCurrentRollResult();
            if (!rollResult) {
                this.updateProjectPromptStatusMessage('Please add dice to the roll before continuing.');
                return;
            }

            this.updateResultDisplay(rollResult);
            this.currentRollQueue = [];
            this.updateQueueDisplay();

            const projectName = providedName || this.projectPromptState.selectedName || `Project ${projectIndex + 1}`;
            const characterId = typeof window.currentCharacter === 'string' ? window.currentCharacter : '';

            this.publishRollToChat('project_roll', rollResult, {
                projectName,
                projectIndex,
                characterId,
                status: 'pending'
            });

            this.closeProjectPrompt();
        } catch (error) {
            if (this.resultTotal && this.resultDetail) {
                this.resultTotal.textContent = `Error: ${error.message}`;
                this.resultDetail.textContent = '';
                this.resultDetail.style.display = 'none';
            }
            this.updateProjectPromptStatusMessage('There was a problem rolling the dice. Please try again.');
        }
    }

    startProjectPromptDrag(event) {
        if (!this.projectPromptState.active || !this.projectPromptState.container) {
            return;
        }

        if (event.button !== undefined && event.button !== 0) {
            return;
        }

        const rect = this.projectPromptState.container.getBoundingClientRect();
        this.projectPromptState.drag.active = true;
        this.projectPromptState.drag.offsetX = event.clientX - rect.left;
        this.projectPromptState.drag.offsetY = event.clientY - rect.top;
        this.projectPromptState.hasCustomPosition = true;

        this.projectPromptState.container.classList.add('project-roll-prompt--dragging');

        document.addEventListener('pointermove', this.handleProjectPromptPointerMove);
        document.addEventListener('pointerup', this.handleProjectPromptPointerUp);

        event.preventDefault();
    }

    onProjectPromptPointerMove(event) {
        if (!this.projectPromptState.active || !this.projectPromptState.drag.active || !this.projectPromptState.container) {
            return;
        }

        const proposedLeft = event.clientX - this.projectPromptState.drag.offsetX;
        const proposedTop = event.clientY - this.projectPromptState.drag.offsetY;
        const { left, top } = this.constrainPromptPosition(proposedLeft, proposedTop);

        this.projectPromptState.container.style.left = `${left}px`;
        this.projectPromptState.container.style.top = `${top}px`;
    }

    onProjectPromptPointerUp() {
        if (!this.projectPromptState.drag.active) {
            return;
        }

        this.projectPromptState.drag.active = false;
        if (this.projectPromptState.container) {
            this.projectPromptState.container.classList.remove('project-roll-prompt--dragging');
        }

        this.repositionProjectPrompt();

        document.removeEventListener('pointermove', this.handleProjectPromptPointerMove);
        document.removeEventListener('pointerup', this.handleProjectPromptPointerUp);
    }

    constrainPromptPosition(left, top) {
        const prompt = this.projectPromptState.container;
        if (!prompt) {
            return { left, top };
        }

        const width = prompt.offsetWidth;
        const height = prompt.offsetHeight;

        const maxLeft = Math.max(window.innerWidth - width, 0);
        const maxTop = Math.max(window.innerHeight - height, 0);

        return {
            left: Math.min(Math.max(left, 0), maxLeft),
            top: Math.min(Math.max(top, 0), maxTop)
        };
    }

    parseAndRollDice(diceNotation) {
        const pattern = /^(\d+)d(\d+)$/;
        const match = diceNotation.match(pattern);

        if (!match) {
            throw new Error(`Invalid dice notation: ${diceNotation}`);
        }

        const numDice = parseInt(match[1], 10);
        const dieSize = parseInt(match[2], 10);

        const rolls = [];
        for (let i = 0; i < numDice; i += 1) {
            rolls.push(Math.floor(Math.random() * dieSize) + 1);
        }

        const total = rolls.reduce((sum, roll) => sum + roll, 0);
        return { result: total, detail: rolls };
    }

    centerModal() {
        if (!this.modal) {
            return;
        }

        const rect = this.modal.getBoundingClientRect();
        const desiredLeft = (window.innerWidth - rect.width) / 2;
        const desiredTop = (window.innerHeight - rect.height) / 2;
        const { left, top } = this.constrainPosition(desiredLeft, desiredTop);

        this.modal.style.left = `${left}px`;
        this.modal.style.top = `${top}px`;
        this.lastPosition = { left, top };
    }

    applyLastPosition() {
        if (!this.modal || !this.lastPosition) {
            return;
        }

        const { left, top } = this.constrainPosition(this.lastPosition.left, this.lastPosition.top);
        this.modal.style.left = `${left}px`;
        this.modal.style.top = `${top}px`;
        this.lastPosition = { left, top };
    }

    startDrag(event) {
        if (!this.modal || (event.button !== undefined && event.button !== 0)) {
            return;
        }

        if (event.target.closest('.dice-modal-close')) {
            return;
        }

        const rect = this.modal.getBoundingClientRect();
        this.dragState.active = true;
        this.dragState.offsetX = event.clientX - rect.left;
        this.dragState.offsetY = event.clientY - rect.top;

        this.modal.classList.add('dragging');

        document.addEventListener('pointermove', this.handlePointerMove);
        document.addEventListener('pointerup', this.handlePointerUp);

        event.preventDefault();
    }

    onPointerMove(event) {
        if (!this.modal || !this.dragState.active) {
            return;
        }

        const proposedLeft = event.clientX - this.dragState.offsetX;
        const proposedTop = event.clientY - this.dragState.offsetY;
        const { left, top } = this.constrainPosition(proposedLeft, proposedTop);

        this.modal.style.left = `${left}px`;
        this.modal.style.top = `${top}px`;
        this.lastPosition = { left, top };
        this.hasCustomPosition = true;
    }

    onPointerUp() {
        if (!this.dragState.active) {
            return;
        }

        this.dragState.active = false;
        if (this.modal) {
            this.modal.classList.remove('dragging');
        }

        document.removeEventListener('pointermove', this.handlePointerMove);
        document.removeEventListener('pointerup', this.handlePointerUp);
    }

    keepModalInBounds() {
        if (!this.modal) {
            return;
        }

        const currentLeft = parseFloat(this.modal.style.left) || 0;
        const currentTop = parseFloat(this.modal.style.top) || 0;
        const { left, top } = this.constrainPosition(currentLeft, currentTop);

        this.modal.style.left = `${left}px`;
        this.modal.style.top = `${top}px`;
        this.lastPosition = { left, top };
    }

    constrainPosition(left, top) {
        if (!this.modal) {
            return { left, top };
        }

        const modalWidth = this.modal.offsetWidth;
        const modalHeight = this.modal.offsetHeight;

        const maxLeft = Math.max(window.innerWidth - modalWidth, 0);
        const maxTop = Math.max(window.innerHeight - modalHeight, 0);

        return {
            left: Math.min(Math.max(left, 0), maxLeft),
            top: Math.min(Math.max(top, 0), maxTop)
        };
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new DashboardDiceRoller('dice-roller-btn');
});
