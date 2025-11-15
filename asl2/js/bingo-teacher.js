class BingoTeacherApp {
    constructor(config = {}) {
        this.config = config;
        this.wordlistContainer = document.getElementById('wordlist-options');
        this.customForm = document.getElementById('custom-list-form');
        this.customFeedback = document.getElementById('custom-list-feedback');
        this.sessionMetaEl = document.getElementById('session-meta');
        this.drawHistoryEl = document.getElementById('draw-history');
        this.claimsListEl = document.getElementById('claims-list');
        this.drawWordBtn = document.getElementById('draw-word-btn');
        this.startBtn = document.getElementById('start-game-btn');
        this.stopBtn = document.getElementById('stop-game-btn');
        this.claimModal = document.getElementById('claim-review-modal');
        this.claimTitle = document.getElementById('claim-modal-title');
        this.claimMeta = document.getElementById('claim-modal-meta');
        this.claimGrid = document.getElementById('claim-card-grid');
        this.claimMatched = document.getElementById('claim-matched-list');
        this.claimUnmatched = document.getElementById('claim-unmatched-list');
        this.acceptBtn = document.getElementById('accept-claim-btn');
        this.rejectBtn = document.getElementById('reject-claim-btn');
        this.closeModalBtn = document.getElementById('close-claim-modal');

        this.selectedLists = new Set();
        this.wordlists = { scroller: [], custom: [] };
        this.sessionState = null;
        this.currentClaims = [];
        this.activeClaim = null;
        this.pollHandle = null;

        this.bindEvents();
        this.fetchWordLists();
        this.startPolling();
    }

    bindEvents() {
        if (this.customForm) {
            this.customForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.saveCustomList();
            });
        }

        if (this.startBtn) {
            this.startBtn.addEventListener('click', () => this.startGame());
        }

        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => this.stopGame());
        }

        if (this.drawWordBtn) {
            this.drawWordBtn.addEventListener('click', () => this.drawWord());
        }

        if (this.acceptBtn) {
            this.acceptBtn.addEventListener('click', () => this.resolveClaim('accept'));
        }

        if (this.rejectBtn) {
            this.rejectBtn.addEventListener('click', () => this.resolveClaim('continue'));
        }

        if (this.closeModalBtn) {
            this.closeModalBtn.addEventListener('click', () => this.hideClaimModal());
        }

        if (this.claimModal) {
            this.claimModal.addEventListener('click', (event) => {
                if (event.target === this.claimModal) {
                    this.hideClaimModal();
                }
            });
        }
    }

    async fetchWordLists() {
        if (!this.config.wordlistsEndpoint) {
            return;
        }

        try {
            const response = await fetch(this.config.wordlistsEndpoint, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error('Unable to load lists');
            }
            const payload = await response.json();
            this.wordlists = {
                scroller: payload.scroller || [],
                custom: payload.custom || [],
            };
            this.renderWordlists();
        } catch (error) {
            console.error('Word list error:', error);
            if (this.wordlistContainer) {
                this.wordlistContainer.textContent = 'Unable to load word lists right now.';
            }
        }
    }

    renderWordlists() {
        if (!this.wordlistContainer) {
            return;
        }

        this.wordlistContainer.innerHTML = '';
        const sections = [
            { title: 'Scroller Lists', items: this.wordlists.scroller },
            { title: 'Custom Lists', items: this.wordlists.custom },
        ];

        sections.forEach((section) => {
            const title = document.createElement('h3');
            title.textContent = section.title;
            title.style.marginBottom = '4px';
            this.wordlistContainer.appendChild(title);

            if (!section.items.length) {
                const empty = document.createElement('p');
                empty.textContent = 'No lists yet.';
                empty.style.fontSize = '0.9rem';
                empty.style.color = '#64748b';
                this.wordlistContainer.appendChild(empty);
                return;
            }

            section.items.forEach((item) => {
                const label = document.createElement('label');
                label.className = 'wordlist-chip';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = item.id;
                checkbox.checked = this.selectedLists.has(item.id);
                checkbox.addEventListener('change', (event) => {
                    if (event.target.checked) {
                        this.selectedLists.add(item.id);
                    } else {
                        this.selectedLists.delete(item.id);
                    }
                });

                const span = document.createElement('div');
                span.style.flex = '1';
                span.style.display = 'flex';
                span.style.justifyContent = 'space-between';
                span.style.alignItems = 'center';

                const name = document.createElement('strong');
                name.textContent = item.name;
                const count = document.createElement('small');
                const total = Array.isArray(item.words) ? item.words.length : 0;
                count.textContent = `${total} words`;

                span.appendChild(name);
                span.appendChild(count);
                label.appendChild(checkbox);
                label.appendChild(span);
                this.wordlistContainer.appendChild(label);
            });
        });
    }

    async saveCustomList() {
        if (!this.config.saveListEndpoint || !this.customForm) {
            return;
        }

        const formData = new FormData(this.customForm);
        const payload = {
            name: formData.get('name'),
            words: formData.get('words'),
        };

        try {
            this.toggleCustomFeedback('Saving list...', 'info');
            const response = await fetch(this.config.saveListEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Unable to save list');
            }

            this.toggleCustomFeedback('List saved and ready to use!', 'success');
            this.customForm.reset();
            this.wordlists.custom.unshift(data.list);
            this.renderWordlists();
        } catch (error) {
            console.error('Save list error:', error);
            this.toggleCustomFeedback(error.message || 'Could not save list.', 'error');
        }
    }

    toggleCustomFeedback(message, type = 'info') {
        if (!this.customFeedback) {
            return;
        }
        this.customFeedback.style.display = 'block';
        this.customFeedback.textContent = message;
        this.customFeedback.style.color = type === 'error' ? '#e53e3e' : '#0f172a';
    }

    async startGame() {
        if (!this.config.startGameEndpoint) {
            return;
        }
        const lists = Array.from(this.selectedLists);
        if (!lists.length) {
            alert('Select at least one list to start a game.');
            return;
        }
        try {
            const response = await fetch(this.config.startGameEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ lists }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Unable to start game');
            }
            this.sessionState = data.session;
            this.renderSession();
        } catch (error) {
            alert(error.message || 'Unable to start the game right now.');
        }
    }

    async stopGame() {
        if (!this.config.startGameEndpoint) {
            return;
        }
        try {
            const response = await fetch(this.config.startGameEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'stop' }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Unable to stop session');
            }
            this.sessionState = data.session;
            this.renderSession();
        } catch (error) {
            alert(error.message || 'Unable to stop the session.');
        }
    }

    async drawWord() {
        if (!this.config.drawWordEndpoint) {
            return;
        }
        try {
            this.drawWordBtn.disabled = true;
            const response = await fetch(this.config.drawWordEndpoint, {
                method: 'POST',
                credentials: 'same-origin',
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Unable to draw word');
            }
            this.sessionState = this.sessionState || {};
            this.sessionState.calledWords = data.calledWords;
            this.sessionState.remainingCount = data.remainingCount;
            this.renderSession();
        } catch (error) {
            alert(error.message || 'Unable to draw the next word.');
        } finally {
            this.drawWordBtn.disabled = false;
        }
    }

    startPolling() {
        const interval = Number(this.config.pollInterval) || 4000;
        if (interval < 2000) {
            return;
        }
        this.pollHandle = window.setInterval(() => this.fetchSessionState(), interval);
        this.fetchSessionState();
    }

    async fetchSessionState() {
        if (!this.config.teacherStateEndpoint) {
            return;
        }
        try {
            const response = await fetch(this.config.teacherStateEndpoint, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error('Unable to load session data');
            }
            const data = await response.json();
            this.sessionState = data.session || null;
            this.currentClaims = (this.sessionState && this.sessionState.claims) || [];
            this.renderSession();
            this.syncClaimModal();
        } catch (error) {
            console.error('Teacher state error:', error);
        }
    }

    renderSession() {
        const session = this.sessionState || {};
        if (!('totalWords' in session) && Array.isArray(session.wordPool)) {
            session.totalWords = session.wordPool.length;
        }
        if (!('remainingCount' in session) && Array.isArray(session.remainingWords)) {
            session.remainingCount = session.remainingWords.length;
        }
        if (!('calledWords' in session) && Array.isArray(session.wordPool)) {
            session.calledWords = [];
        }
        this.updateSessionMeta(session);
        this.renderHistory(session.calledWords || []);
        this.renderClaims(session.claims || []);
        if (this.drawWordBtn) {
            this.drawWordBtn.disabled = !session.totalWords || (session.remainingCount || 0) <= 0;
        }
    }

    updateSessionMeta(session) {
        if (!this.sessionMetaEl) {
            return;
        }
        const status = session.status || 'idle';
        const remaining = session.remainingCount ?? (Array.isArray(session.remainingWords) ? session.remainingWords.length : 0);
        const total = session.totalWords ?? (Array.isArray(session.wordPool) ? session.wordPool.length : 0);
        const last = session.lastDrawnWord ? `Last word: ${session.lastDrawnWord}` : 'No words drawn yet.';
        const activeLists = Array.isArray(session.activeLists) && session.activeLists.length
            ? session.activeLists.map((list) => `${list.name} (${list.count})`).join(', ')
            : 'No lists selected.';
        const started = session.startedAt ? new Date(session.startedAt * 1000).toLocaleTimeString() : '—';

        this.sessionMetaEl.innerHTML = `
            <div>Status: <strong>${status}</strong></div>
            <div>Words: ${total - remaining}/${total} drawn</div>
            <div>${last}</div>
            <div>Lists: ${activeLists}</div>
            <div>Started: ${started}</div>
        `;
    }

    renderHistory(calledWords) {
        if (!this.drawHistoryEl) {
            return;
        }
        this.drawHistoryEl.innerHTML = '';
        if (!calledWords.length) {
            const empty = document.createElement('li');
            empty.textContent = 'No words drawn yet.';
            this.drawHistoryEl.appendChild(empty);
            return;
        }
        calledWords.forEach((word) => {
            const li = document.createElement('li');
            li.textContent = word;
            this.drawHistoryEl.appendChild(li);
        });
    }

    renderClaims(claims) {
        if (!this.claimsListEl) {
            return;
        }
        this.claimsListEl.innerHTML = '';
        if (!claims.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No pending claims.';
            empty.style.color = '#64748b';
            this.claimsListEl.appendChild(empty);
            return;
        }
        claims.forEach((claim) => {
            const btn = document.createElement('button');
            btn.className = 'form-button';
            btn.type = 'button';
            btn.textContent = `${claim.studentName} • ${new Date((claim.submittedAt || Date.now()) * 1000).toLocaleTimeString()}`;
            btn.addEventListener('click', () => this.showClaimModal(claim));
            this.claimsListEl.appendChild(btn);
        });
    }

    showClaimModal(claim) {
        this.activeClaim = claim;
        if (!this.claimModal) {
            return;
        }
        this.claimModal.classList.remove('hidden');
        this.claimTitle.textContent = `${claim.studentName}'s Card`;
        this.claimMeta.textContent = `Submitted ${new Date((claim.submittedAt || Date.now()) * 1000).toLocaleString()}`;
        this.renderClaimCard(claim);
    }

    hideClaimModal() {
        if (this.claimModal) {
            this.claimModal.classList.add('hidden');
        }
        this.activeClaim = null;
    }

    renderClaimCard(claim) {
        if (!this.claimGrid) {
            return;
        }
        this.claimGrid.innerHTML = '';
        this.claimMatched.innerHTML = '';
        this.claimUnmatched.innerHTML = '';

        const card = claim.card || [];
        const marks = new Set((claim.marks || []).map((mark) => Number(mark)));
        const review = claim.review || {};
        const matched = new Set(((review.matchedWords) || []).map((word) => (word || '').toLowerCase()));
        const unmatched = new Set(((review.unmatchedWords) || []).map((word) => (word || '').toLowerCase()));

        card.forEach((word, index) => {
            const cell = document.createElement('div');
            cell.className = 'claim-card-cell';
            cell.textContent = word;
            if (marks.has(index)) {
                const lower = (word || '').toLowerCase();
                if (matched.has(lower)) {
                    cell.classList.add('marked-called');
                } else {
                    cell.classList.add('marked-only');
                }
            }
            this.claimGrid.appendChild(cell);
        });

        (review.matchedWords || []).forEach((word) => {
            const li = document.createElement('li');
            li.textContent = word;
            this.claimMatched.appendChild(li);
        });

        (review.unmatchedWords || []).forEach((word) => {
            const li = document.createElement('li');
            li.textContent = word;
            this.claimUnmatched.appendChild(li);
        });
    }

    async resolveClaim(action) {
        if (!this.activeClaim || !this.config.resolveClaimEndpoint) {
            return;
        }
        try {
            this.acceptBtn.disabled = true;
            this.rejectBtn.disabled = true;
            const response = await fetch(this.config.resolveClaimEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ claimId: this.activeClaim.id, action }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Unable to resolve claim');
            }
            alert(data.message || 'Claim updated.');
            this.hideClaimModal();
            this.fetchSessionState();
        } catch (error) {
            alert(error.message || 'Unable to resolve claim.');
        } finally {
            this.acceptBtn.disabled = false;
            this.rejectBtn.disabled = false;
        }
    }

    syncClaimModal() {
        if (!this.activeClaim) {
            return;
        }
        const refreshed = this.currentClaims.find((claim) => claim.id === this.activeClaim.id);
        if (!refreshed) {
            this.hideClaimModal();
            return;
        }
        this.showClaimModal(refreshed);
    }
}

if (!window.bingoTeacherInstance) {
    window.bingoTeacherInstance = new BingoTeacherApp(window.bingoTeacherConfig || {});
}
