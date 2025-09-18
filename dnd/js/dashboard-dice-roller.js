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

        this.buildUI();
        this.attachEvents();

        this.handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                this.close();
            }
        };

        this.handlePointerMove = (event) => this.onPointerMove(event);
        this.handlePointerUp = (event) => this.onPointerUp(event);
        this.handleResize = () => this.keepModalInBounds();

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

        this.overlay.addEventListener('click', (event) => {
            if (event.target === this.overlay) {
                this.close();
            }
        });
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

        actions.appendChild(rollBtn);
        actions.appendChild(clearBtn);
        actions.appendChild(this.resultLabel);
        return actions;
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
        }
    }

    addToQueue(item) {
        this.currentRollQueue.push(item);
        this.updateQueueDisplay();
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
            let totalResult = 0;
            const detailParts = [];

            for (const item of this.currentRollQueue) {
                if (item.startsWith('+')) {
                    totalResult += parseInt(item.substring(1), 10);
                    detailParts.push(item);
                } else if (item.startsWith('-')) {
                    totalResult -= parseInt(item.substring(1), 10);
                    detailParts.push(item);
                } else {
                    const { result, detail } = this.parseAndRollDice(item);
                    totalResult += result;
                    detailParts.push(...detail.map((roll) => roll.toString()));
                }
            }

            if (this.resultTotal && this.resultDetail) {
                this.resultTotal.textContent = `Result: ${totalResult}`;
                if (detailParts.length > 0) {
                    this.resultDetail.textContent = detailParts.join(' ');
                    this.resultDetail.style.display = 'block';
                } else {
                    this.resultDetail.textContent = '';
                    this.resultDetail.style.display = 'none';
                }
            }

            this.currentRollQueue = [];
            this.updateQueueDisplay();
        } catch (error) {
            if (this.resultTotal && this.resultDetail) {
                this.resultTotal.textContent = `Error: ${error.message}`;
                this.resultDetail.textContent = '';
                this.resultDetail.style.display = 'none';
            }
        }
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
