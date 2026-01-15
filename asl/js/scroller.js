const WORDS = [
  'apple','banana','cherry','dragon','eagle','forest','garden','harbor','island','jungle',
  'kitten','lemon','mountain','nebula','ocean','puzzle','quantum','rocket','sunrise','turtle',
  'unicorn','voyage','whisper','xylophone','yonder','zephyr','amber','breeze','crystal','dawn',
  'ember','flame','goblin','horizon','illusion','jewel','kingdom','legend','meteor','nectar',
  'oracle','phoenix','quiver','raven','saber','thunder','utopia','victory','wizard','yolk'
];

let currentWords = [];
let lastWordElement = null;

function updateDisplay(id, value) {
  document.getElementById(id).textContent = value;
}

function getRandomWords(count) {
  const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function startGame(speed, count) {
  currentWords = getRandomWords(count);
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

function init() {
  const speedInput = document.getElementById('speed');
  const countInput = document.getElementById('count');
  const speedInput2 = document.getElementById('speed2');
  const countInput2 = document.getElementById('count2');

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
