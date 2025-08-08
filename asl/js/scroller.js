// Mulberry32 PRNG for deterministic shuffling
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffleWords(array, seed) {
  const rand = mulberry32(seed);
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

const FALLBACK_WORDS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
let sessionCode = getQueryParam('session') || getQueryParam('session_code');
let sessionWords = [];
let sessionSeed = null;

let currentWords = [];
let lastWordElement = null;

function updateDisplay(id, value) {
  document.getElementById(id).textContent = value;
}

async function fetchSessionWords() {
  if (!sessionCode) return;
  try {
    const res = await fetch(`get_session_words.php?session_code=${sessionCode}`);
    const data = await res.json();
    sessionWords = Array.isArray(data.words) ? data.words : [];
    sessionSeed = data.seed || null;
  } catch (e) {
    console.error('Error loading session words:', e);
  }
}

function startGame(speed, count) {
  let words = sessionWords.length ? [...sessionWords] : [...FALLBACK_WORDS];
  const seed = sessionSeed || Date.now();
  words = shuffleWords(words, seed).slice(0, count);
  currentWords = words;
  const scroller = document.getElementById('scroller');
  scroller.innerHTML = '';

  currentWords.forEach((word, i) => {
    const el = document.createElement('div');
    el.className = 'scroll-word';
    el.textContent = word;
    el.style.animationDuration = `${speed}ms`;
    el.style.animationDelay = `${i * speed}ms`;
    scroller.appendChild(el);
    if (i === currentWords.length - 1) {
      lastWordElement = el;
    }
  });

  if (lastWordElement) {
    lastWordElement.addEventListener('animationend', onFinish, { once: true });
  }

  document.getElementById('setup').classList.add('hidden');
  document.getElementById('summary').classList.add('hidden');
  scroller.classList.remove('hidden');
}

function onFinish() {
  launchConfetti();
  showSummary();
}

function launchConfetti() {
  const duration = 3000;
  const end = Date.now() + duration;

  (function frame() {
    confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 } });
    confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 } });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}

function showSummary() {
  const list = document.getElementById('summaryList');
  list.innerHTML = '';
  currentWords.forEach(w => {
    const li = document.createElement('li');
    li.textContent = w;
    list.appendChild(li);
  });

  const scroller = document.getElementById('scroller');
  scroller.classList.add('hidden');
  document.getElementById('summary').classList.remove('hidden');
}

async function init() {
  const speedInput = document.getElementById('speed');
  const countInput = document.getElementById('count');
  const speedInput2 = document.getElementById('speed2');
  const countInput2 = document.getElementById('count2');

  await fetchSessionWords();

  speedInput.addEventListener('input', () => updateDisplay('speedVal', speedInput.value));
  countInput.addEventListener('input', () => updateDisplay('countVal', countInput.value));
  speedInput2.addEventListener('input', () => updateDisplay('speedVal2', speedInput2.value));
  countInput2.addEventListener('input', () => updateDisplay('countVal2', countInput2.value));

  document.getElementById('playBtn').addEventListener('click', () => {
    speedInput2.value = speedInput.value;
    countInput2.value = countInput.value;
    updateDisplay('speedVal2', speedInput2.value);
    updateDisplay('countVal2', countInput2.value);
    startGame(Number(speedInput.value), Number(countInput.value));
  });

  document.getElementById('playAgainBtn').addEventListener('click', () => {
    startGame(Number(speedInput2.value), Number(countInput2.value));
  });
}

document.addEventListener('DOMContentLoaded', init);
