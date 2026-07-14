// Fetch session data and start the scroller once loaded
document.addEventListener('DOMContentLoaded', () => {
    fetch('scroller_game.php?action=data')
        .then(resp => resp.json())
        .then(startScroller)
        .catch(err => console.error('Failed to load session data', err));
});

function startScroller(config) {
    const { words, seed, wordCount, speed } = config;
    const container = document.getElementById('scroller-container');
    if (!container) return;

    const sequence = shuffleWords(words, seed).slice(0, wordCount);
    let index = 0;
    const baseSpawn = 2000; // ms
    const baseRise = 8000; // ms
    const spawnInterval = baseSpawn / speed;
    const riseDuration = baseRise / speed;

    function spawn() {
        if (index >= sequence.length) return;
        const word = sequence[index++];
        const el = document.createElement('div');
        el.className = 'scroller-word rise';
        el.textContent = word;
        el.style.animationDuration = riseDuration + 'ms';
        container.appendChild(el);

        el.addEventListener('animationend', () => {
            el.classList.remove('rise');
            el.classList.add('blink');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }, { once: true });

        setTimeout(spawn, spawnInterval);
    }

    spawn();
}

// Shuffle words with seeded RNG
function shuffleWords(list, seed) {
    const rng = mulberry32(seed);
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Mulberry32 PRNG for deterministic shuffling
function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
