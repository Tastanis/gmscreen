class ScrollerGame {
    constructor() {
        this.wordLists = [];
        this.selectedWords = [];
        this.gameWords = [];
        this.currentSettings = {
            speed: 1,
            wordCount: 10
        };
        this.particleSystem = null;
        this.starField = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadWordLists();
    }

    setupEventListeners() {
        // Custom words checkbox
        document.getElementById('use-custom-words').addEventListener('change', (e) => {
            document.getElementById('custom-words').disabled = !e.target.checked;
        });

        // Word count slider
        document.getElementById('word-count').addEventListener('input', (e) => {
            document.getElementById('word-count-display').textContent = e.target.value;
        });

        // Start button
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());

        // Results screen buttons
        document.getElementById('play-again-btn').addEventListener('click', () => this.playAgain());
        document.getElementById('adjust-settings-btn').addEventListener('click', () => this.adjustSettings());
        document.getElementById('main-menu-btn').addEventListener('click', () => this.mainMenu());
    }

    async loadWordLists() {
        try {
            const response = await fetch('get_wordlists.php');
            const data = await response.json();
            
            if (data.wordlists && data.wordlists.length > 0) {
                this.wordLists = data.wordlists;
                this.displayWordLists();
            } else {
                this.displayNoWordLists();
            }
        } catch (error) {
            console.error('Error loading word lists:', error);
            this.displayNoWordLists();
        }
    }

    displayWordLists() {
        const container = document.getElementById('wordlist-container');
        container.innerHTML = '';
        
        this.wordLists.forEach((list, index) => {
            const item = document.createElement('div');
            item.className = 'wordlist-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `wordlist-${index}`;
            checkbox.value = index;
            
            const label = document.createElement('label');
            label.htmlFor = `wordlist-${index}`;
            label.textContent = `${list.wordlist_name} (${list.words.length} words)`;
            
            item.appendChild(checkbox);
            item.appendChild(label);
            container.appendChild(item);
        });
    }

    displayNoWordLists() {
        const container = document.getElementById('wordlist-container');
        container.innerHTML = '<div class="loading">No word lists available. Please use custom words.</div>';
        
        // Auto-enable custom words if no lists
        document.getElementById('use-custom-words').checked = true;
        document.getElementById('custom-words').disabled = false;
    }

    collectSelectedWords() {
        this.selectedWords = [];
        
        // Collect words from selected word lists
        const checkboxes = document.querySelectorAll('#wordlist-container input[type="checkbox"]:checked');
        checkboxes.forEach(checkbox => {
            const index = parseInt(checkbox.value);
            if (this.wordLists[index] && this.wordLists[index].words) {
                this.selectedWords.push(...this.wordLists[index].words);
            }
        });
        
        // Add custom words if enabled
        if (document.getElementById('use-custom-words').checked) {
            const customText = document.getElementById('custom-words').value;
            if (customText.trim()) {
                const customWords = customText.split(',').map(word => word.trim()).filter(word => word);
                this.selectedWords.push(...customWords);
            }
        }
        
        // Remove duplicates
        this.selectedWords = [...new Set(this.selectedWords)];
        
        return this.selectedWords.length > 0;
    }

    startGame() {
        if (!this.collectSelectedWords()) {
            alert('Please select at least one word list or enter custom words.');
            return;
        }
        
        // Get settings
        this.currentSettings.speed = parseFloat(document.getElementById('speed-select').value);
        this.currentSettings.wordCount = parseInt(document.getElementById('word-count').value);
        
        // Select random words for the game
        this.gameWords = this.getRandomWords(this.currentSettings.wordCount);
        
        // Switch to game screen
        this.showScreen('game-screen');
        
        // Initialize game components
        this.initGameScreen();
        
        // Start countdown
        this.startCountdown();
    }

    getRandomWords(count) {
        const shuffled = [...this.selectedWords].sort(() => Math.random() - 0.5);
        const wordsNeeded = Math.min(count, shuffled.length);
        return shuffled.slice(0, wordsNeeded);
    }

    initGameScreen() {
        // Initialize star field
        const starsCanvas = document.getElementById('stars-canvas');
        this.starField = new StarField(starsCanvas);
        this.starField.animate();
        
        // Initialize particle system
        const particlesCanvas = document.getElementById('particles-canvas');
        this.particleSystem = new ParticleSystem(particlesCanvas);
        
        // Clear game area
        document.getElementById('game-area').innerHTML = '';
    }

    startCountdown() {
        const countdownEl = document.getElementById('countdown');
        let count = 5;
        
        const countInterval = setInterval(() => {
            if (count > 0) {
                countdownEl.textContent = count;
                countdownEl.style.display = 'block';
                countdownEl.style.animation = 'none';
                setTimeout(() => {
                    countdownEl.style.animation = 'pulse 1s ease-in-out';
                }, 10);
                count--;
            } else {
                clearInterval(countInterval);
                countdownEl.style.display = 'none';
                this.startScrolling();
            }
        }, 1000);
    }

    startScrolling() {
        const gameArea = document.getElementById('game-area');
        const screenHeight = window.innerHeight;
        
        // Calculate timing based on speed (doubled base duration for slower default speed)
        const baseDuration = 10000 / this.currentSettings.speed; // Base time for word to travel full screen
        const wordDelay = baseDuration / 3; // Start next word when previous is 1/3 up
        
        this.gameWords.forEach((word, index) => {
            setTimeout(() => {
                this.createScrollingWord(word, baseDuration, index === this.gameWords.length - 1);
            }, index * wordDelay);
        });
    }

    createScrollingWord(word, duration, isLast) {
        const wordEl = document.createElement('div');
        wordEl.className = 'scroll-word';
        wordEl.textContent = word;
        wordEl.style.bottom = '0px';
        
        const gameArea = document.getElementById('game-area');
        gameArea.appendChild(wordEl);
        
        // Initial flash
        wordEl.classList.add('flashing');
        setTimeout(() => wordEl.classList.remove('flashing'), 300);
        
        // Animate scrolling
        const startTime = Date.now();
        const screenHeight = window.innerHeight;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;
            
            if (progress < 1) {
                const currentY = screenHeight * progress;
                wordEl.style.bottom = `${currentY}px`;
                requestAnimationFrame(animate);
            } else {
                // Word reached the top
                wordEl.style.bottom = `${screenHeight}px`;
                
                // Double flash
                wordEl.classList.add('double-flash');
                
                // Create explosion
                const rect = wordEl.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                
                if (isLast) {
                    // Grand finale
                    setTimeout(() => {
                        this.particleSystem.createFinalExplosion();
                        this.particleSystem.update();
                        
                        // Show results after 3 seconds
                        setTimeout(() => this.showResults(), 3000);
                    }, 600);
                } else {
                    // Small explosion
                    this.particleSystem.createExplosion(x, y, 'small');
                    this.particleSystem.update();
                }
                
                // Remove word after animation
                setTimeout(() => wordEl.remove(), 1000);
            }
        };
        
        requestAnimationFrame(animate);
    }

    showResults() {
        // Stop star field
        if (this.starField) {
            this.starField.stop();
        }
        
        // Clear particles
        if (this.particleSystem) {
            this.particleSystem.clear();
        }
        
        // Display words list with numbering
        const wordsList = document.getElementById('words-list');
        wordsList.innerHTML = '';
        
        this.gameWords.forEach((word, index) => {
            const wordItem = document.createElement('div');
            wordItem.className = 'word-item';
            wordItem.textContent = `${index + 1}) ${word}`;
            wordsList.appendChild(wordItem);
        });
        
        // Show results screen
        this.showScreen('results-screen');
    }

    playAgain() {
        // Use same settings and words
        this.showScreen('game-screen');
        this.initGameScreen();
        this.startCountdown();
    }

    adjustSettings() {
        // Keep same word selection, go back to menu
        this.showScreen('menu-screen');
    }

    mainMenu() {
        // Full reset to menu
        this.showScreen('menu-screen');
        
        // Clear selections
        document.querySelectorAll('#wordlist-container input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        document.getElementById('use-custom-words').checked = false;
        document.getElementById('custom-words').disabled = true;
        document.getElementById('custom-words').value = '';
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ScrollerGame();
});