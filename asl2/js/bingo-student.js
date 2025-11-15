class BingoStudentApp {
    constructor(config = {}) {
        this.config = config;
        this.boardEl = document.getElementById('bingo-board');
        this.statusBanner = document.getElementById('bingo-status');
        this.feedbackEl = document.getElementById('bingo-feedback');
        this.calledListEl = document.getElementById('called-words-list');
        this.callButton = document.getElementById('call-bingo-button');
        this.overlay = document.getElementById('bingo-review-overlay');
        this.overlayMessage = document.getElementById('bingo-review-message');
        this.overlayMatched = document.getElementById('bingo-review-matched');
        this.overlayUnmatched = document.getElementById('bingo-review-unmatched');
        this.overlayClose = document.getElementById('close-review-overlay');

        if (!this.boardEl) {
            return;
        }

        this.cardWords = this.generatePlaceholderCard();
        this.markedCells = new Set();
        this.drawnWords = [];
        this.drawnWordSet = new Set();
        this.sessionStatus = 'waiting';
        this.reviewState = null;
        this.lastSavedPayload = '';
        this.pollHandle = null;
        this.feedbackTimeout = null;

        this.bindEvents();
        this.renderBoard();
        this.loadState();
        this.startPolling();
    }

    bindEvents() {
        this.boardEl.addEventListener('click', (event) => {
            const cell = event.target.closest('.bingo-cell');
            if (!cell) {
                return;
            }
            const index = Number(cell.dataset.index);
            if (Number.isNaN(index)) {
                return;
            }
            this.toggleCell(index);
        });

        if (this.callButton) {
            this.callButton.addEventListener('click', () => this.requestBingo());
        }

        if (this.overlayClose) {
            this.overlayClose.addEventListener('click', () => this.hideReviewOverlay());
        }

        if (this.overlay) {
            this.overlay.addEventListener('click', (event) => {
                if (event.target === this.overlay) {
                    this.hideReviewOverlay();
                }
            });
        }
    }

    startPolling() {
        const interval = Number(this.config.pollInterval) || 5000;
        if (interval < 2500) {
            return;
        }
        this.pollHandle = window.setInterval(() => {
            this.loadState(true);
        }, interval);
    }

    async loadState(isPoll = false) {
        if (!this.config.studentStateEndpoint) {
            if (!isPoll) {
                this.setFeedback('Bingo services are not configured yet.', 'warning');
            }
            return;
        }

        try {
            const response = await fetch(this.config.studentStateEndpoint, {
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Unable to reach bingo service');
            }

            const payload = await response.json();
            const data = payload?.data || payload;

            this.sessionStatus = data.sessionStatus || data.status || 'waiting';
            this.updateStatusBanner();

            this.updateCardWords(data);
            this.updateMarks(data);
            this.updateCalledWords(data);
            this.renderBoard();
            this.renderCalledWords();
            this.evaluateCallButton();
            this.handleReviewState(data.review || data.claimReview || data.overlay || null);

            if (!isPoll && data?.message) {
                this.setFeedback(data.message, 'info');
            }
        } catch (error) {
            console.error('Bingo state error:', error);
            this.updateStatusBanner('disconnected');
            if (!isPoll) {
                this.setFeedback('Unable to sync with your teacher right now. We will keep trying...', 'error');
            }
        }
    }

    updateCardWords(data) {
        const cardData = data.card || data.layout || data.words;
        if (Array.isArray(cardData) && cardData.length === 25) {
            this.cardWords = cardData.map((word, idx) => this.normalizeWord(word, idx));
            return;
        }

        if (cardData?.words && Array.isArray(cardData.words) && cardData.words.length === 25) {
            this.cardWords = cardData.words.map((word, idx) => this.normalizeWord(word, idx));
            return;
        }

        if (!this.cardWords.length) {
            this.cardWords = this.generatePlaceholderCard();
        }
    }

    updateMarks(data) {
        const incomingMarks = data.marks || data.selected || data.card?.marks || [];
        this.markedCells = this.normalizeMarks(incomingMarks);
    }

    updateCalledWords(data) {
        const called = data.calledWords || data.drawnWords || data.wordsCalled || [];
        this.drawnWords = Array.isArray(called) ? called.map((word) => this.normalizeWord(word)) : [];
        this.drawnWordSet = new Set(this.drawnWords.map((word) => word.toLowerCase()));
    }

    normalizeWord(word, index = 0) {
        if (typeof word !== 'string') {
            return `Word ${index + 1}`;
        }
        return word.trim() || `Word ${index + 1}`;
    }

    generatePlaceholderCard() {
        return Array.from({ length: 25 }, (_, index) => `Word ${index + 1}`);
    }

    normalizeMarks(marks) {
        const normalized = new Set();
        if (!Array.isArray(marks)) {
            return normalized;
        }

        const lowerWords = this.cardWords.map((word) => word.toLowerCase());

        marks.forEach((mark) => {
            if (typeof mark === 'number' && mark >= 0 && mark < 25) {
                normalized.add(mark);
                return;
            }

            const parsed = Number(mark);
            if (!Number.isNaN(parsed) && parsed >= 0 && parsed < 25) {
                normalized.add(parsed);
                return;
            }

            if (typeof mark === 'string') {
                const idx = lowerWords.indexOf(mark.toLowerCase());
                if (idx >= 0) {
                    normalized.add(idx);
                }
            }
        });

        return normalized;
    }

    renderBoard() {
        if (!this.boardEl) {
            return;
        }

        const fragment = document.createDocumentFragment();
        this.cardWords.forEach((word, index) => {
            const isMarked = this.markedCells.has(index);
            const isCalled = this.drawnWordSet.has(word.toLowerCase());
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'bingo-cell';
            button.setAttribute('aria-label', word);
            if (isMarked) {
                button.classList.add('cell-marked');
            }
            if (isCalled) {
                button.classList.add('cell-called');
            }
            if (isMarked && isCalled) {
                button.classList.add('cell-marked-called');
            }
            button.dataset.index = index;
            button.setAttribute('role', 'gridcell');
            button.setAttribute('aria-pressed', isMarked ? 'true' : 'false');
            const wordSpan = document.createElement('span');
            wordSpan.className = 'cell-word';
            wordSpan.textContent = word;
            button.appendChild(wordSpan);
            fragment.appendChild(button);
        });

        this.boardEl.innerHTML = '';
        this.boardEl.appendChild(fragment);
    }

    renderCalledWords() {
        if (!this.calledListEl) {
            return;
        }

        if (!this.drawnWords.length) {
            this.calledListEl.innerHTML = '<p class="empty-called">No words have been called yet.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        this.drawnWords.forEach((word, index) => {
            const item = document.createElement('div');
            item.className = 'called-word-item';
            if (this.isWordMarked(word)) {
                item.classList.add('called-word-marked');
            }
            item.textContent = `${index + 1}. ${word}`;
            fragment.appendChild(item);
        });

        this.calledListEl.innerHTML = '';
        this.calledListEl.appendChild(fragment);
    }

    isWordMarked(word) {
        const normalized = word?.toLowerCase();
        if (!normalized) {
            return false;
        }
        return this.cardWords.some((cardWord, index) => {
            return cardWord.toLowerCase() === normalized && this.markedCells.has(index);
        });
    }

    toggleCell(index) {
        if (!this.cardWords[index]) {
            return;
        }

        if (this.markedCells.has(index)) {
            this.markedCells.delete(index);
        } else {
            this.markedCells.add(index);
        }

        this.renderBoard();
        this.renderCalledWords();
        this.evaluateCallButton();
        this.saveMarks();
    }

    evaluateCallButton() {
        if (!this.callButton) {
            return;
        }
        const hasPattern = this.hasWinningPattern();
        const canCall = hasPattern && this.sessionStatus === 'connected';
        this.callButton.disabled = !canCall;
        this.callButton.classList.toggle('ready', canCall);
    }

    hasWinningPattern() {
        if (this.cardWords.length !== 25 || this.markedCells.size < 5) {
            return false;
        }

        const hasIndex = (row, col) => this.markedCells.has(row * 5 + col);

        for (let row = 0; row < 5; row += 1) {
            let rowComplete = true;
            for (let col = 0; col < 5; col += 1) {
                if (!hasIndex(row, col)) {
                    rowComplete = false;
                    break;
                }
            }
            if (rowComplete) {
                return true;
            }
        }

        for (let col = 0; col < 5; col += 1) {
            let colComplete = true;
            for (let row = 0; row < 5; row += 1) {
                if (!hasIndex(row, col)) {
                    colComplete = false;
                    break;
                }
            }
            if (colComplete) {
                return true;
            }
        }

        const diagonal1 = [0, 6, 12, 18, 24].every((idx) => this.markedCells.has(idx));
        const diagonal2 = [4, 8, 12, 16, 20].every((idx) => this.markedCells.has(idx));
        return diagonal1 || diagonal2;
    }

    async saveMarks() {
        if (!this.config.updateCardEndpoint) {
            return;
        }

        const payload = {
            marks: Array.from(this.markedCells),
            words: this.cardWords
        };
        const serialized = JSON.stringify(payload);
        if (serialized === this.lastSavedPayload) {
            return;
        }

        this.lastSavedPayload = serialized;

        try {
            await fetch(this.config.updateCardEndpoint, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: serialized
            });
        } catch (error) {
            console.warn('Unable to persist marks right now.', error);
        }
    }

    async requestBingo() {
        if (!this.callButton || this.callButton.disabled || !this.config.requestBingoEndpoint) {
            return;
        }

        this.callButton.disabled = true;
        this.callButton.classList.add('submitting');
        this.setFeedback('Sending your bingo claim to the teacher...', 'info');

        try {
            const response = await fetch(this.config.requestBingoEndpoint, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    marks: Array.from(this.markedCells),
                    words: this.cardWords
                })
            });

            if (!response.ok) {
                throw new Error('Unable to send claim');
            }

            const payload = await response.json();
            const success = payload?.success ?? payload?.status === 'ok';
            if (success) {
                this.sessionStatus = 'review';
                this.updateStatusBanner();
                this.setFeedback('Claim sent! Wait for your teacher to approve it.', 'success');
            } else {
                throw new Error(payload?.message || 'Claim rejected');
            }
        } catch (error) {
            console.error('Bingo claim error:', error);
            this.setFeedback('We could not send your bingo claim. Please try again.', 'error');
        } finally {
            this.callButton.classList.remove('submitting');
            this.evaluateCallButton();
        }
    }

    handleReviewState(review) {
        if (!review) {
            this.hideReviewOverlay();
            return;
        }

        const status = (review.status || review.state || '').toLowerCase();

        if (status === 'approved' || review.approved === true) {
            this.showReviewOverlay(review);
            return;
        }

        if (status === 'rejected') {
            this.hideReviewOverlay();
            this.setFeedback('Your teacher asked you to keep playing. Your marks are still saved.', 'warning');
            return;
        }

        if (status === 'review' || status === 'pending') {
            this.sessionStatus = 'review';
            this.updateStatusBanner();
            this.hideReviewOverlay(false);
        }
    }

    showReviewOverlay(review) {
        if (!this.overlay) {
            return;
        }

        const matched = review.matchedWords || review.calledAndMarked || this.getMatchedWords();
        const unmatched = review.unmatchedWords || review.markedOnly || this.getUnmatchedWords();
        const message = review.message || 'Your teacher confirmed this bingo. Great job!';

        this.populateOverlayList(this.overlayMatched, matched);
        this.populateOverlayList(this.overlayUnmatched, unmatched);
        if (this.overlayMessage) {
            this.overlayMessage.textContent = message;
        }

        this.overlay.classList.remove('hidden');
        this.reviewState = 'visible';
    }

    hideReviewOverlay(clearMessage = true) {
        if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
        if (clearMessage && this.overlayMessage) {
            this.overlayMessage.textContent = '';
        }
        this.reviewState = null;
    }

    populateOverlayList(container, items) {
        if (!container) {
            return;
        }

        const list = Array.isArray(items) && items.length
            ? items
            : ['Nothing yet'];

        container.innerHTML = '';
        list.forEach((item) => {
            const li = document.createElement('li');
            li.textContent = item;
            container.appendChild(li);
        });
    }

    getMatchedWords() {
        const matched = [];
        this.cardWords.forEach((word, index) => {
            if (this.markedCells.has(index) && this.drawnWordSet.has(word.toLowerCase())) {
                matched.push(word);
            }
        });
        return matched;
    }

    getUnmatchedWords() {
        const unmatched = [];
        this.cardWords.forEach((word, index) => {
            if (this.markedCells.has(index) && !this.drawnWordSet.has(word.toLowerCase())) {
                unmatched.push(word);
            }
        });
        return unmatched;
    }

    updateStatusBanner(forcedState) {
        if (!this.statusBanner) {
            return;
        }

        const state = forcedState || this.sessionStatus;
        this.statusBanner.dataset.state = state;
        let text = 'Waiting for your teacher...';
        if (state === 'connected') {
            text = 'Connected! Watch for new signs from your teacher.';
        } else if (state === 'review') {
            text = 'Bingo claim sent. Waiting for teacher review...';
        } else if (state === 'disconnected') {
            text = 'Disconnected. Trying to reconnect...';
        }
        this.statusBanner.textContent = text;
    }

    setFeedback(message, type = 'info') {
        if (!this.feedbackEl) {
            return;
        }

        if (this.feedbackTimeout) {
            clearTimeout(this.feedbackTimeout);
        }

        if (!message) {
            this.feedbackEl.textContent = '';
            this.feedbackEl.dataset.type = '';
            this.feedbackEl.classList.remove('visible');
            return;
        }

        this.feedbackEl.textContent = message;
        this.feedbackEl.dataset.type = type;
        this.feedbackEl.classList.add('visible');

        this.feedbackTimeout = window.setTimeout(() => {
            this.feedbackEl.classList.remove('visible');
            this.feedbackEl.textContent = '';
            this.feedbackEl.dataset.type = '';
        }, 6000);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (!window.bingoStudentInstance) {
        window.bingoStudentInstance = new BingoStudentApp(window.bingoStudentConfig || {});
    }
});
