const STORAGE_KEYS = {
  wpm: "reader:wpm",
  paragraphIndex: "reader:paragraph-index",
};

const DEFAULTS = {
  wpm: 240,
  dutyCycle: 0.4,
  wpmMin: 60,
  wpmMax: 420,
  minOn: 80,
  minOff: 60,
};

const paragraphs = Array.isArray(window.SEED_PARAGRAPHS) && window.SEED_PARAGRAPHS.length
  ? window.SEED_PARAGRAPHS.slice()
  : [
      "Reading is a skill strengthened by practice. In this exercise, each word appears for a brief moment in its original position, training your eyes to track naturally across the page.",
    ];

const readerEl = document.querySelector(".reader");
const paragraphEl = document.getElementById("reader-paragraph");
const playBtn = document.getElementById("reader-play");
const playLabel = playBtn.querySelector(".reader__play-label");
const speedSlider = document.getElementById("reader-speed");
const speedOutput = document.getElementById("reader-speed-output");
const changeBtn = document.getElementById("reader-change");
const tokenTemplate = document.getElementById("reader-token-template");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

let state = {
  tokens: [],
  tokenElements: [],
  readableIndexes: [],
  index: 0,
  wpm: DEFAULTS.wpm,
  timers: { show: null, hide: null },
  playing: false,
  reducedMotion: reducedMotionQuery.matches,
  paragraphIndex: 0,
};

if (state.reducedMotion) {
  readerEl.dataset.mode = "reduced-motion";
}

const handleReducedMotionChange = (event) => {
  state.reducedMotion = event.matches;
  if (state.reducedMotion) {
    readerEl.dataset.mode = "reduced-motion";
    revealAllTokens();
    if (state.playing && state.readableIndexes.length) {
      const currentTokenIndex = state.timers.hide
        ? state.readableIndexes[state.index]
        : state.readableIndexes[Math.min(state.index, state.readableIndexes.length - 1)];
      if (typeof currentTokenIndex === "number") {
        highlightToken(currentTokenIndex);
      }
    }
  } else {
    delete readerEl.dataset.mode;
    hideAllTokens();
    if (state.playing && state.timers.hide) {
      const currentTokenIndex = state.readableIndexes[state.index];
      if (typeof currentTokenIndex === "number") {
        showToken(currentTokenIndex);
      }
    }
  }
};

if (typeof reducedMotionQuery.addEventListener === "function") {
  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
} else if (typeof reducedMotionQuery.addListener === "function") {
  reducedMotionQuery.addListener(handleReducedMotionChange);
}

const storedWpm = Number.parseInt(localStorage.getItem(STORAGE_KEYS.wpm), 10);
if (!Number.isNaN(storedWpm)) {
  state.wpm = clamp(storedWpm, DEFAULTS.wpmMin, DEFAULTS.wpmMax);
}

const storedParagraphIndex = Number.parseInt(localStorage.getItem(STORAGE_KEYS.paragraphIndex), 10);
if (!Number.isNaN(storedParagraphIndex)) {
  state.paragraphIndex = ((storedParagraphIndex % paragraphs.length) + paragraphs.length) % paragraphs.length;
}

speedSlider.value = String(state.wpm);
updateSpeedOutput(state.wpm);

renderParagraph(paragraphs[state.paragraphIndex]);
setState("idle");
playBtn.dataset.playing = "false";

playBtn.addEventListener("click", handlePlayToggle);
playBtn.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    handlePlayToggle();
  }
});

speedSlider.addEventListener("input", (event) => {
  const nextWpm = clamp(Number.parseInt(event.target.value, 10), DEFAULTS.wpmMin, DEFAULTS.wpmMax);
  state.wpm = nextWpm;
  updateSpeedOutput(nextWpm);
  localStorage.setItem(STORAGE_KEYS.wpm, String(nextWpm));
});

changeBtn.addEventListener("click", () => {
  cycleParagraph(1);
});

function handlePlayToggle() {
  if (state.playing) {
    pause();
  } else {
    play();
  }
}

function play() {
  if (state.playing || !state.readableIndexes.length) return;

  state.playing = true;
  playBtn.dataset.playing = "true";
  playBtn.setAttribute("aria-pressed", "true");
  setState("playing");

  if (state.index >= state.readableIndexes.length) {
    state.index = 0;
    hideAllTokens();
  }

  scheduleShow();
}

function pause({ completed = false } = {}) {
  if (!state.playing && !completed) return;

  state.playing = false;
  playBtn.dataset.playing = "false";
  playBtn.setAttribute("aria-pressed", "false");

  clearTimers();

  if (completed) {
    setState("completed");
    if (state.reducedMotion && state.readableIndexes.length) {
      const lastReadable = state.readableIndexes[Math.max(0, Math.min(state.index - 1, state.readableIndexes.length - 1))];
      if (typeof lastReadable === "number") {
        highlightToken(lastReadable);
      }
    }
  } else {
    setState("paused");
  }
}

function scheduleShow() {
  state.timers.show = null;
  const tokenIndex = state.readableIndexes[state.index];
  const token = state.tokens[tokenIndex];
  const { onMs } = computeTiming(state.wpm, token);
  showToken(tokenIndex);

  state.timers.hide = window.setTimeout(() => {
    state.timers.hide = null;
    hideToken(tokenIndex);
    state.index += 1;

    if (state.index >= state.readableIndexes.length) {
      pause({ completed: true });
      revealAllTokens();
      return;
    }

    const nextTokenIndex = state.readableIndexes[state.index];
    const { offMs } = computeTiming(state.wpm, state.tokens[nextTokenIndex]);
    state.timers.show = window.setTimeout(scheduleShow, offMs);
  }, onMs);
}

function computeTiming(wpm, token) {
  let periodMs = 60000 / clamp(wpm, DEFAULTS.wpmMin, DEFAULTS.wpmMax);
  if (isPausingToken(token)) {
    periodMs *= token.pauseMultiplier;
  }
  let onMs = Math.max(DEFAULTS.minOn, periodMs * DEFAULTS.dutyCycle);
  let offMs = Math.max(DEFAULTS.minOff, periodMs - onMs);

  const minPeriod = DEFAULTS.minOn + DEFAULTS.minOff;
  if (onMs + offMs > periodMs) {
    offMs = Math.max(DEFAULTS.minOff, periodMs - onMs);
    if (offMs + onMs < minPeriod) {
      offMs = DEFAULTS.minOff;
      onMs = Math.max(DEFAULTS.minOn, periodMs - offMs);
    }
  }

  return { onMs, offMs };
}

function isPausingToken(token) {
  if (!token) return false;
  return Boolean(token.pauseMultiplier);
}

function showToken(index) {
  const el = state.tokenElements[index];
  if (!el) return;

  if (state.reducedMotion) {
    highlightToken(index);
  } else {
    el.classList.add("visible");
  }
}

function hideToken(index) {
  const el = state.tokenElements[index];
  if (!el) return;

  if (state.reducedMotion) {
    el.classList.remove("highlight");
  } else {
    el.classList.remove("visible");
  }
}

function highlightToken(tokenIndex) {
  state.tokenElements.forEach((tokenEl, idx) => {
    if (idx === tokenIndex) {
      tokenEl.classList.add("highlight");
    } else {
      tokenEl.classList.remove("highlight");
    }
  });
}

function hideAllTokens() {
  state.tokenElements.forEach((tokenEl) => {
    tokenEl.classList.remove("highlight");
    if (!state.reducedMotion) {
      tokenEl.classList.remove("visible");
    }
  });
}

function revealAllTokens() {
  state.tokenElements.forEach((tokenEl) => {
    tokenEl.classList.add("visible");
  });
}

function clearTimers() {
  if (state.timers.show) {
    clearTimeout(state.timers.show);
    state.timers.show = null;
  }
  if (state.timers.hide) {
    clearTimeout(state.timers.hide);
    state.timers.hide = null;
  }
}

function cycleParagraph(step) {
  pause();
  state.index = 0;
  hideAllTokens();
  state.paragraphIndex = (state.paragraphIndex + step + paragraphs.length) % paragraphs.length;
  localStorage.setItem(STORAGE_KEYS.paragraphIndex, String(state.paragraphIndex));
  renderParagraph(paragraphs[state.paragraphIndex]);
  setState("idle");
}

function tokenize(text) {
  const tokens = [];
  const re = /(\s+|—|–|[.,!?;:()"“”‘’]|[^\s.,!?;:()"“”‘’—–]+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const value = match[0];
    const isWhitespace = /^\s+$/.test(value);
    const pauseMultiplier = value === "." || value === "!" || value === "?"
      ? 2
      : value === "," || value === ";" || value === ":"
      ? 1.5
      : 1;
    tokens.push({
      value,
      isWhitespace,
      pauseMultiplier: pauseMultiplier > 1 ? pauseMultiplier : 0,
    });
  }
  return tokens;
}

function renderParagraph(text) {
  paragraphEl.innerHTML = "";
  state.tokens = tokenize(text);
  state.tokenElements = state.tokens.map((token) => {
    const node = tokenTemplate.content.firstElementChild.cloneNode(true);
    node.textContent = token.value;
    if (state.reducedMotion) {
      node.classList.add("visible");
    }
    paragraphEl.appendChild(node);
    return node;
  });
  state.readableIndexes = state.tokens
    .map((token, index) => (token.isWhitespace ? null : index))
    .filter((index) => index !== null);
  state.index = 0;
}

function setState(nextState) {
  readerEl.dataset.state = nextState;
  if (nextState === "idle") {
    playLabel.textContent = "Play";
  } else if (nextState === "playing") {
    playLabel.textContent = "Pause";
  } else if (nextState === "paused") {
    playLabel.textContent = "Resume";
  } else if (nextState === "completed") {
    playLabel.textContent = "Replay";
  }
}

function updateSpeedOutput(wpm) {
  speedOutput.textContent = `${wpm} WPM`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

window.addEventListener("beforeunload", () => {
  if (state.playing) {
    pause();
  }
});
