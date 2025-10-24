class DashboardDiceRoller {
    constructor(buttonId) {
        this.triggerButton = document.getElementById(buttonId);
        if (!this.triggerButton) {
            console.warn(`Dice roller trigger button with id "${buttonId}" not found.`);
            return;
        }

        this.overlay = null;
        this.modal = null;
        this.standardView = null;
        this.projectSelectView = null;
        this.projectReadyView = null;

        this.queueDisplays = [];
        this.resultDisplays = [];
        this.advantageToggleButtons = [];

        this.rollButton = null;
        this.clearButton = null;
        this.projectRollButton = null;
        this.projectReadyRollButton = null;
        this.projectManualButton = null;
        this.projectManualInput = null;
        this.projectStatusMessage = null;
        this.projectSelectedLabel = null;
        this.projectCancelButtons = [];

        this.currentRollQueue = [];
        this.advantageEnabled = false;

        this.projectState = {
            mode: 'inactive',
            selectedIndex: null,
            selectedName: '',
            manualActive: false
        };

        this.lastPosition = null;
        this.hasCustomPosition = false;
        this.dragState = {
            active: false,
            offsetX: 0,
            offsetY: 0
        };

        this.handleProjectSelection = (event) => this.onProjectSelected(event);
        this.handlePointerMove = (event) => this.onPointerMove(event);
        this.handlePointerUp = () => this.onPointerUp();
        this.handleKeyDown = (event) => {
            if (!this.overlay || this.overlay.classList.contains('hidden')) {
                return;
            }

            if (event.key === 'Escape') {
                this.close();
                return;
            }

            if (event.key === 'Enter') {
                const target = event.target;
                const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
                const isButtonLike = tagName === 'button' || (tagName === 'a' && target.hasAttribute('href'));

                if (isButtonLike) {
                    return;
                }

                if (this.projectState.mode === 'ready') {
                    this.completeProjectRoll();
                } else if (this.projectState.mode !== 'selecting') {
                    this.calculateRoll();
                }

                event.preventDefault();
            }
        };
        this.handleResize = () => this.keepModalInBounds();

        this.buildUI();
        this.attachEvents();

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
        title.id = 'dice-roller-title';
        title.className = 'dice-modal-title';
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

        this.standardView = this.createStandardView();
        this.projectSelectView = this.createProjectSelectView();
        this.projectReadyView = this.createProjectReadyView();

        content.appendChild(this.standardView);
        content.appendChild(this.projectSelectView);
        content.appendChild(this.projectReadyView);

        this.modal.appendChild(header);
        this.modal.appendChild(content);
        this.overlay.appendChild(this.modal);
        document.body.appendChild(this.overlay);

        this.setProjectMode('inactive');
        this.updateQueueDisplay();
        this.resetResultDisplays();
    }

    createDivider() {
        const divider = document.createElement('div');
        divider.className = 'dice-divider';
        return divider;
    }

    createQuickButton(text, value, extraClass = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `dice-btn ${extraClass}`.trim();
        button.textContent = text;
        button.addEventListener('click', () => this.addToQueue(value));
        return button;
    }

    createStandardView() {
        const container = document.createElement('div');
        container.className = 'dice-view dice-view--standard';

        const powerRow = document.createElement('div');
        powerRow.className = 'dice-row dice-row--quick dice-row--quick-primary';
        powerRow.appendChild(this.createQuickButton('Power Roll', '2d10', 'dice-btn--accent dice-btn--power'));
        container.appendChild(powerRow);

        const modifierRow = document.createElement('div');
        modifierRow.className = 'dice-row dice-row--quick dice-row--quick-secondary';
        modifierRow.appendChild(this.createQuickButton('Edge', '+2'));
        modifierRow.appendChild(this.createQuickButton('Bane', '-2'));
        modifierRow.appendChild(this.createQuickButton('+1', '+1'));
        modifierRow.appendChild(this.createQuickButton('+2', '+2'));
        container.appendChild(modifierRow);

        container.appendChild(this.createDivider());

        const diceRow = document.createElement('div');
        diceRow.className = 'dice-row dice-row--grid';
        [
            { label: 'D2', value: '1d2' },
            { label: 'D4', value: '1d4' },
            { label: 'D6', value: '1d6' },
            { label: 'D8', value: '1d8' },
            { label: 'D10', value: '1d10' }
        ].forEach(({ label, value }) => {
            const btn = this.createQuickButton(label, value);
            diceRow.appendChild(btn);
        });
        container.appendChild(diceRow);

        container.appendChild(this.createDivider());

        const queueSection = document.createElement('div');
        queueSection.className = 'dice-queue-section';
        const queueLabel = document.createElement('div');
        queueLabel.className = 'dice-queue-label';
        queueLabel.textContent = 'Current Roll';
        const queueDisplay = document.createElement('div');
        queueDisplay.className = 'dice-queue-display';
        queueSection.appendChild(queueLabel);
        queueSection.appendChild(queueDisplay);
        container.appendChild(queueSection);
        this.queueDisplays.push(queueDisplay);

        const actionRow = document.createElement('div');
        actionRow.className = 'dice-actions';

        const controls = document.createElement('div');
        controls.className = 'dice-actions__controls';

        const rollBtn = document.createElement('button');
        rollBtn.type = 'button';
        rollBtn.className = 'dice-roll-btn';
        rollBtn.textContent = 'Roll';
        rollBtn.addEventListener('click', () => this.calculateRoll());
        controls.appendChild(rollBtn);
        this.rollButton = rollBtn;

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'dice-clear-btn';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => this.clearQueue());
        controls.appendChild(clearBtn);
        this.clearButton = clearBtn;

        const resultContainer = document.createElement('div');
        resultContainer.className = 'dice-result';
        const resultTotal = document.createElement('div');
        resultTotal.className = 'dice-result-total';
        const resultDetail = document.createElement('div');
        resultDetail.className = 'dice-result-detail';
        resultContainer.appendChild(resultTotal);
        resultContainer.appendChild(resultDetail);
        controls.appendChild(resultContainer);
        this.resultDisplays.push({ total: resultTotal, detail: resultDetail });

        actionRow.appendChild(controls);

        const bottomRow = document.createElement('div');
        bottomRow.className = 'dice-actions__footer';

        const projectBtn = document.createElement('button');
        projectBtn.type = 'button';
        projectBtn.className = 'dice-project-btn';
        projectBtn.textContent = 'Project Roll';
        projectBtn.addEventListener('click', () => this.startProjectRollFlow());
        bottomRow.appendChild(projectBtn);
        this.projectRollButton = projectBtn;

        const advantageToggle = document.createElement('button');
        advantageToggle.type = 'button';
        advantageToggle.className = 'dice-advantage-toggle';
        advantageToggle.textContent = 'Advantage: Off';
        advantageToggle.setAttribute('aria-pressed', 'false');
        advantageToggle.addEventListener('click', () => this.toggleAdvantage());
        bottomRow.appendChild(advantageToggle);
        this.advantageToggleButtons.push(advantageToggle);

        actionRow.appendChild(bottomRow);
        container.appendChild(actionRow);

        return container;
    }

    createProjectSelectView() {
        const container = document.createElement('div');
        container.className = 'dice-view dice-view--project-select';

        const message = document.createElement('p');
        message.className = 'dice-project-message';
        message.textContent = 'Pick a project to start a project roll.';
        container.appendChild(message);

        const hint = document.createElement('p');
        hint.className = 'dice-project-hint';
        hint.textContent = 'Click a project from the Projects list. You can cancel to return to normal dice rolling.';
        container.appendChild(hint);

        const actions = document.createElement('div');
        actions.className = 'dice-project-select-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'dice-project-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this.cancelProjectRoll());
        actions.appendChild(cancelBtn);
        this.projectCancelButtons.push(cancelBtn);

        container.appendChild(actions);
        return container;
    }

    createProjectReadyView() {
        const container = document.createElement('div');
        container.className = 'dice-view dice-view--project-ready';

        const header = document.createElement('div');
        header.className = 'dice-project-header';

        const title = document.createElement('div');
        title.className = 'dice-project-title';
        title.innerHTML = 'Rolling for: <span class="dice-project-name">(none)</span>';
        header.appendChild(title);
        this.projectSelectedLabel = title.querySelector('.dice-project-name');

        const changeBtn = document.createElement('button');
        changeBtn.type = 'button';
        changeBtn.className = 'dice-project-change';
        changeBtn.textContent = 'Change Project';
        changeBtn.addEventListener('click', () => this.restartProjectSelection());
        header.appendChild(changeBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'dice-project-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this.cancelProjectRoll());
        header.appendChild(cancelBtn);
        this.projectCancelButtons.push(cancelBtn);

        container.appendChild(header);

        const projectPowerRow = document.createElement('div');
        projectPowerRow.className = 'dice-row dice-row--quick dice-row--quick-primary';

        const powerBtn = document.createElement('button');
        powerBtn.type = 'button';
        powerBtn.className = 'dice-btn dice-btn--accent dice-btn--power';
        powerBtn.textContent = 'Power Roll';
        powerBtn.addEventListener('click', () => this.addProjectBaseRoll('2d10'));
        projectPowerRow.appendChild(powerBtn);

        const eveningBtn = document.createElement('button');
        eveningBtn.type = 'button';
        eveningBtn.className = 'dice-btn dice-btn--accent dice-btn--evening';
        eveningBtn.textContent = 'Evening Project Roll';
        eveningBtn.addEventListener('click', () => this.addProjectBaseRoll('1d10'));
        projectPowerRow.appendChild(eveningBtn);
        container.appendChild(projectPowerRow);

        const projectModifierRow = document.createElement('div');
        projectModifierRow.className = 'dice-row dice-row--quick dice-row--quick-secondary';
        projectModifierRow.appendChild(this.createQuickButton('Edge', '+2'));
        projectModifierRow.appendChild(this.createQuickButton('Bane', '-2'));
        projectModifierRow.appendChild(this.createQuickButton('+1', '+1'));
        projectModifierRow.appendChild(this.createQuickButton('+2', '+2'));
        container.appendChild(projectModifierRow);

        container.appendChild(this.createDivider());

        const queueSection = document.createElement('div');
        queueSection.className = 'dice-queue-section dice-queue-section--project';
        const queueLabel = document.createElement('div');
        queueLabel.className = 'dice-queue-label';
        queueLabel.textContent = 'Project Roll';
        const queueDisplay = document.createElement('div');
        queueDisplay.className = 'dice-queue-display';
        queueSection.appendChild(queueLabel);
        queueSection.appendChild(queueDisplay);
        container.appendChild(queueSection);
        this.queueDisplays.push(queueDisplay);

        const manualRow = document.createElement('div');
        manualRow.className = 'dice-project-manual';

        const manualBtn = document.createElement('button');
        manualBtn.type = 'button';
        manualBtn.className = 'dice-project-manual-btn';
        manualBtn.textContent = 'Manual Result';
        manualBtn.setAttribute('aria-pressed', 'false');
        manualBtn.addEventListener('click', () => this.toggleProjectManual());
        manualRow.appendChild(manualBtn);
        this.projectManualButton = manualBtn;

        const manualInput = document.createElement('input');
        manualInput.type = 'number';
        manualInput.className = 'dice-project-manual-input';
        manualInput.placeholder = 'Enter a result';
        manualInput.addEventListener('input', () => this.updateProjectStatusMessage());
        manualRow.appendChild(manualInput);
        this.projectManualInput = manualInput;
        if (this.projectManualInput) {
            this.projectManualInput.disabled = true;
        }

        container.appendChild(manualRow);

        const actions = document.createElement('div');
        actions.className = 'dice-project-actions';

        const rollBtn = document.createElement('button');
        rollBtn.type = 'button';
        rollBtn.className = 'dice-project-roll-btn';
        rollBtn.textContent = 'Roll Project';
        rollBtn.addEventListener('click', () => this.completeProjectRoll());
        actions.appendChild(rollBtn);
        this.projectReadyRollButton = rollBtn;

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'dice-clear-btn';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            this.clearQueue();
            if (!this.projectState.manualActive) {
                this.updateProjectStatusMessage('Add dice for the project roll.');
            }
        });
        actions.appendChild(clearBtn);

        const advantageToggle = document.createElement('button');
        advantageToggle.type = 'button';
        advantageToggle.className = 'dice-advantage-toggle dice-advantage-toggle--project';
        advantageToggle.textContent = 'Advantage: Off';
        advantageToggle.setAttribute('aria-pressed', 'false');
        advantageToggle.addEventListener('click', () => this.toggleAdvantage());
        actions.appendChild(advantageToggle);
        this.advantageToggleButtons.push(advantageToggle);

        const resultContainer = document.createElement('div');
        resultContainer.className = 'dice-result';
        const resultTotal = document.createElement('div');
        resultTotal.className = 'dice-result-total';
        const resultDetail = document.createElement('div');
        resultDetail.className = 'dice-result-detail';
        resultContainer.appendChild(resultTotal);
        resultContainer.appendChild(resultDetail);
        actions.appendChild(resultContainer);
        this.resultDisplays.push({ total: resultTotal, detail: resultDetail });

        container.appendChild(actions);

        const status = document.createElement('div');
        status.className = 'dice-project-status';
        container.appendChild(status);
        this.projectStatusMessage = status;

        return container;
    }

    attachEvents() {
        this.triggerButton.addEventListener('click', () => this.open());
    }

    open() {
        if (!this.overlay || !this.modal) {
            return;
        }

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

    close() {
        if (!this.overlay) {
            return;
        }

        this.overlay.classList.add('hidden');
        document.removeEventListener('keydown', this.handleKeyDown);
        this.onPointerUp();
        this.cancelProjectRoll();
    }

    setProjectMode(mode) {
        this.projectState.mode = mode;

        if (this.standardView) {
            this.standardView.style.display = mode === 'inactive' ? '' : 'none';
        }
        if (this.projectSelectView) {
            this.projectSelectView.style.display = mode === 'selecting' ? '' : 'none';
        }
        if (this.projectReadyView) {
            this.projectReadyView.style.display = mode === 'ready' ? '' : 'none';
        }

        this.updateOverlayAppearance();

        if (mode === 'inactive') {
            document.removeEventListener('click', this.handleProjectSelection, true);
            this.projectState.selectedIndex = null;
            this.projectState.selectedName = '';
            this.disableProjectManualEntry();
            this.updateProjectStatusMessage('');
        }
    }

    updateOverlayAppearance() {
        if (!this.overlay) {
            return;
        }

        const selecting = this.projectState.mode === 'selecting';
        this.overlay.classList.toggle('dice-modal-overlay--project-select', selecting);
    }

    startProjectRollFlow() {
        this.focusProjectsSection();
        this.positionDiceModalForProjectRoll();
        this.clearQueue();
        this.setProjectMode('selecting');
        document.addEventListener('click', this.handleProjectSelection, true);
    }

    restartProjectSelection() {
        this.clearQueue();
        this.projectState.selectedIndex = null;
        this.projectState.selectedName = '';
        this.disableProjectManualEntry();
        this.updateProjectStatusMessage('Pick a project to continue.');
        this.setProjectMode('selecting');
        document.addEventListener('click', this.handleProjectSelection, true);
    }

    cancelProjectRoll() {
        if (this.projectState.mode === 'inactive') {
            return;
        }

        document.removeEventListener('click', this.handleProjectSelection, true);
        this.setProjectMode('inactive');
        this.clearQueue();
    }

    onProjectSelected(event) {
        const projectItem = event.target.closest('#projects-list .project-item');
        if (!projectItem) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const header = projectItem.querySelector('.project-header h3');
        const name = header ? header.textContent.trim() : 'Project';
        const indexAttr = projectItem.getAttribute('data-project-index');
        const index = indexAttr ? parseInt(indexAttr, 10) : null;

        if (index === null || Number.isNaN(index)) {
            this.updateProjectStatusMessage('Could not determine which project was selected.');
            return;
        }

        this.applyProjectSelection(index, name);
    }

    applyProjectSelection(index, name) {
        document.removeEventListener('click', this.handleProjectSelection, true);

        this.projectState.selectedIndex = index;
        this.projectState.selectedName = name;
        if (this.projectSelectedLabel) {
            this.projectSelectedLabel.textContent = name;
        }

        this.clearQueue();
        if (this.projectManualInput) {
            this.projectManualInput.value = '';
            this.projectManualInput.disabled = true;
        }
        this.projectState.manualActive = false;
        if (this.projectManualButton) {
            this.projectManualButton.setAttribute('aria-pressed', 'false');
            this.projectManualButton.classList.remove('dice-project-manual-btn--active');
            this.projectManualButton.textContent = 'Manual Result';
        }

        this.setProjectMode('ready');
        this.updateProjectStatusMessage('Add dice or enter a manual result, then roll the project.');
    }

    toggleProjectManual() {
        if (this.projectState.mode !== 'ready') {
            return;
        }

        const nextState = !this.projectState.manualActive;
        this.projectState.manualActive = nextState;

        if (this.projectManualButton) {
            this.projectManualButton.setAttribute('aria-pressed', nextState ? 'true' : 'false');
            this.projectManualButton.classList.toggle('dice-project-manual-btn--active', nextState);
            this.projectManualButton.textContent = nextState ? 'Manual Result On' : 'Manual Result';
        }

        if (this.projectManualInput) {
            this.projectManualInput.disabled = !nextState;
            if (!nextState) {
                this.projectManualInput.value = '';
            } else {
                this.projectManualInput.focus();
            }
        }

        if (nextState) {
            this.clearQueue();
            this.updateProjectStatusMessage('Enter the manual result you want to submit.');
        } else {
            this.updateProjectStatusMessage('Add dice for the project roll.');
        }
    }

    disableProjectManualEntry() {
        if (!this.projectState.manualActive) {
            return;
        }

        this.projectState.manualActive = false;

        if (this.projectManualButton) {
            this.projectManualButton.setAttribute('aria-pressed', 'false');
            this.projectManualButton.classList.remove('dice-project-manual-btn--active');
            this.projectManualButton.textContent = 'Manual Result';
        }

        if (this.projectManualInput) {
            this.projectManualInput.value = '';
            this.projectManualInput.disabled = true;
        }
    }

    updateProjectStatusMessage(message = '') {
        if (this.projectStatusMessage) {
            this.projectStatusMessage.textContent = message || '';
        }
    }

    addProjectBaseRoll(diceNotation) {
        if (this.projectState.mode === 'selecting') {
            return;
        }

        this.disableProjectManualEntry();

        const modifiers = this.currentRollQueue.filter((item) => {
            if (typeof item !== 'string') {
                return false;
            }

            const trimmed = item.trim();
            return /^[+-]\d+$/.test(trimmed);
        });

        this.currentRollQueue = [diceNotation, ...modifiers];
        this.updateQueueDisplay();
    }

    completeProjectRoll() {
        if (this.projectState.mode !== 'ready') {
            this.updateProjectStatusMessage('Pick a project first.');
            return;
        }

        const projectIndex = this.projectState.selectedIndex;
        const projectName = this.projectState.selectedName || `Project ${typeof projectIndex === 'number' ? projectIndex + 1 : ''}`;
        const characterId = typeof window.currentCharacter === 'string' ? window.currentCharacter : '';

        if (this.projectState.manualActive) {
            const manualValueRaw = this.projectManualInput ? this.projectManualInput.value.trim() : '';
            if (manualValueRaw === '') {
                this.updateProjectStatusMessage('Enter the result value you want to submit.');
                return;
            }

            const manualValue = Number(manualValueRaw);
            if (!Number.isFinite(manualValue)) {
                this.updateProjectStatusMessage('Please enter a valid number for the manual result.');
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
            this.publishRollToChat('project_roll', manualRollResult, {
                projectName,
                projectIndex,
                characterId,
                status: 'pending'
            });
            this.updateProjectStatusMessage('Manual result submitted to chat.');
            this.currentRollQueue = [];
            this.updateQueueDisplay();
            this.setProjectMode('inactive');
            return;
        }

        if (this.currentRollQueue.length === 0) {
            this.updateProjectStatusMessage('Add dice to the roll before continuing.');
            return;
        }

        try {
            const rollResult = this.resolveCurrentRollResult();
            if (!rollResult) {
                this.updateProjectStatusMessage('Unable to roll. Please try again.');
                return;
            }

            this.updateResultDisplay(rollResult);
            this.publishRollToChat('project_roll', rollResult, {
                projectName,
                projectIndex,
                characterId,
                status: 'pending'
            });
            this.updateProjectStatusMessage('Project roll sent to chat for approval.');
            this.currentRollQueue = [];
            this.updateQueueDisplay();
            this.setProjectMode('inactive');
        } catch (error) {
            console.error('Error completing project roll:', error);
            this.updateProjectStatusMessage('There was a problem rolling the dice. Please try again.');
        }
    }

    addToQueue(item) {
        if (this.projectState.mode === 'selecting') {
            return;
        }

        this.disableProjectManualEntry();

        this.currentRollQueue.push(item);
        this.updateQueueDisplay();
    }

    updateQueueDisplay() {
        const displayText = this.currentRollQueue.length === 0
            ? '(nothing queued)'
            : this.currentRollQueue.join(' ');

        this.queueDisplays.forEach((element) => {
            if (!element) {
                return;
            }
            element.textContent = displayText;
            element.classList.toggle('dice-queue-display--empty', this.currentRollQueue.length === 0);
        });
    }

    resetResultDisplays() {
        this.resultDisplays.forEach(({ total, detail }) => {
            if (total) {
                total.textContent = 'Result: -';
            }
            if (detail) {
                detail.textContent = '';
                detail.style.display = 'none';
            }
        });
    }

    clearQueue() {
        this.currentRollQueue = [];
        this.updateQueueDisplay();
        this.resetResultDisplays();
    }

    toggleAdvantage() {
        this.advantageEnabled = !this.advantageEnabled;

        this.advantageToggleButtons.forEach((button) => {
            if (!button) {
                return;
            }
            button.classList.toggle('dice-advantage-toggle--active', this.advantageEnabled);
            button.textContent = this.advantageEnabled ? 'Advantage: On' : 'Advantage: Off';
            button.setAttribute('aria-pressed', this.advantageEnabled ? 'true' : 'false');
        });
    }

    calculateRoll() {
        if (this.currentRollQueue.length === 0) {
            this.resetResultDisplays();
            this.resultDisplays.forEach(({ total, detail }) => {
                if (total) {
                    total.textContent = 'Result: -';
                }
                if (detail) {
                    detail.textContent = 'Add dice to the queue before rolling.';
                    detail.style.display = 'block';
                }
            });
            return;
        }

        try {
            const rollResult = this.resolveCurrentRollResult();
            if (!rollResult) {
                return;
            }

            this.updateResultDisplay(rollResult);
            this.publishRollToChat('dice_roll', rollResult);
            this.currentRollQueue = [];
            this.updateQueueDisplay();
        } catch (error) {
            console.error('Error rolling dice:', error);
            this.resetResultDisplays();
        }
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

    updateResultDisplay(rollResult) {
        if (!rollResult) {
            return;
        }

        const isManual = rollResult.manualEntry && rollResult.manualEntry.active;
        const hasAdvantage = rollResult.advantage && rollResult.advantage.active;
        const resultLabel = isManual
            ? 'Manual Result'
            : hasAdvantage
                ? 'Result (Advantage)'
                : 'Result';

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

        this.resultDisplays.forEach(({ total, detail }) => {
            if (total) {
                total.textContent = `${resultLabel}: ${rollResult.total}`;
            }
            if (detail) {
                if (detailParts.length > 0) {
                    detail.textContent = detailParts.join(' | ');
                    detail.style.display = 'block';
                } else {
                    detail.textContent = '';
                    detail.style.display = 'none';
                }
            }
        });
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

    focusProjectsSection() {
        if (typeof window.switchSection === 'function') {
            const maybePromise = window.switchSection('projects');
            if (maybePromise && typeof maybePromise.catch === 'function') {
                maybePromise.catch((error) => {
                    console.error('Failed to switch to projects section:', error);
                });
            }
        }
    }

    positionDiceModalForProjectRoll() {
        if (!this.modal) {
            return;
        }

        const projectsSection = document.getElementById('projects-section');
        if (!projectsSection) {
            return;
        }

        const projectsRect = projectsSection.getBoundingClientRect();
        const modalRect = this.modal.getBoundingClientRect();

        const desiredLeft = Math.max(projectsRect.right + 16, 0);
        const desiredTop = Math.max(projectsRect.top, 16);

        const { left, top } = this.constrainPosition(desiredLeft, desiredTop, modalRect.width, modalRect.height);
        this.modal.style.left = `${left}px`;
        this.modal.style.top = `${top}px`;
        this.lastPosition = { left, top };
        this.hasCustomPosition = true;
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

        this.modal.classList.add('dice-modal--dragging');

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
            this.modal.classList.remove('dice-modal--dragging');
        }

        document.removeEventListener('pointermove', this.handlePointerMove);
        document.removeEventListener('pointerup', this.handlePointerUp);
    }

    centerModal() {
        if (!this.modal) {
            return;
        }

        const rect = this.modal.getBoundingClientRect();
        const desiredLeft = (window.innerWidth - rect.width) / 2;
        const desiredTop = (window.innerHeight - rect.height) / 2;
        const { left, top } = this.constrainPosition(desiredLeft, desiredTop, rect.width, rect.height);

        this.modal.style.left = `${left}px`;
        this.modal.style.top = `${top}px`;
        this.lastPosition = { left, top };
        this.hasCustomPosition = false;
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

    constrainPosition(left, top, widthOverride = null, heightOverride = null) {
        if (!this.modal) {
            return { left, top };
        }

        const modalWidth = widthOverride || this.modal.offsetWidth;
        const modalHeight = heightOverride || this.modal.offsetHeight;

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
