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

const seedContent = Array.isArray(window.SEED_CONTENT) && window.SEED_CONTENT.length
  ? window.SEED_CONTENT.map(normalizeContent)
  : [
      normalizeContent({
        paragraph:
          "Reading is a skill strengthened by practice. In this exercise, each word appears for a brief moment in its original position, training your eyes to track naturally across the page.",
        question: {
          prompt: "What skill does the exercise support?",
          choices: [
            "Memorization",
            "Rhythmic chanting",
            "Tracking words smoothly",
            "Taking handwritten notes",
          ],
          answerIndex: 2,
        },
      }),
    ];

let contentSets = seedContent.slice();

const readerEl = document.querySelector(".reader");
const paragraphEl = document.getElementById("reader-paragraph");
const playBtn = document.getElementById("reader-play");
const playLabel = playBtn.querySelector(".reader__play-label");
const speedSlider = document.getElementById("reader-speed");
const speedOutput = document.getElementById("reader-speed-output");
const changeBtn = document.getElementById("reader-change");
const phoneToggleBtn = document.getElementById("reader-phone-toggle");
const addBtn = document.getElementById("reader-add");
const tokenTemplate = document.getElementById("reader-token-template");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const comprehensionSection = document.getElementById("reader-comprehension");
const questionPromptEl = document.getElementById("reader-question");
const answersListEl = document.getElementById("reader-answers");
const feedbackEl = document.getElementById("reader-feedback");
const uploaderSection = document.getElementById("reader-uploader");
const uploaderTextarea = document.getElementById("reader-uploader-textarea");
const uploaderSubmitBtn = document.getElementById("reader-uploader-submit");
const uploaderFeedbackEl = document.getElementById("reader-uploader-feedback");
const uploaderCloseBtn = document.getElementById("reader-uploader-close");
const AUTO_CLOSE_DELAY_MS = 1200;

const DEFAULT_UPLOADER_JSON = JSON.stringify(
  [
    {
      id: "unique-id-1",
      paragraph: "Your paragraph text goes here as a single string.",
      question: {
        prompt: "Ask one comprehension question about the paragraph.",
        choices: ["Answer A", "Answer B", "Answer C", "Answer D"],
        answerIndex: 1,
      },
    },
    {
      id: "unique-id-2",
      paragraph: "Add another paragraph to upload more than one entry at a time.",
      question: {
        prompt: "Provide a second comprehension question.",
        choices: ["Choice 1", "Choice 2", "Choice 3", "Choice 4"],
        answerIndex: 0,
      },
    },
  ],
  null,
  2,
);

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
  currentQuestion: null,
  phoneMode: false,
};

let uploaderAutoCloseTimer = null;

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
  state.paragraphIndex = ((storedParagraphIndex % contentSets.length) + contentSets.length) % contentSets.length;
}

speedSlider.value = String(state.wpm);
updateSpeedOutput(state.wpm);

loadContent(state.paragraphIndex);
setState("idle");
playBtn.dataset.playing = "false";
readerEl.dataset.layout = "desktop";
phoneToggleBtn.setAttribute("aria-pressed", "false");

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

phoneToggleBtn.addEventListener("click", () => {
  state.phoneMode = !state.phoneMode;
  document.body.classList.toggle("reader-phone-mode", state.phoneMode);
  if (state.phoneMode) {
    readerEl.dataset.layout = "mobile";
    phoneToggleBtn.textContent = "Desktop layout";
    phoneToggleBtn.setAttribute("aria-pressed", "true");
  } else {
    readerEl.dataset.layout = "desktop";
    phoneToggleBtn.textContent = "Phone layout";
    phoneToggleBtn.setAttribute("aria-pressed", "false");
  }
});

addBtn.addEventListener("click", () => {
  uploaderSection.hidden = false;
  if (uploaderAutoCloseTimer) {
    clearTimeout(uploaderAutoCloseTimer);
    uploaderAutoCloseTimer = null;
  }
  uploaderFeedbackEl.textContent = "";
  if (!uploaderTextarea.value.trim()) {
    uploaderTextarea.value = DEFAULT_UPLOADER_JSON;
  }
  uploaderTextarea.focus();
  uploaderTextarea.select();
});

uploaderCloseBtn.addEventListener("click", closeUploader);

uploaderSection.addEventListener("click", (event) => {
  if (event.target === uploaderSection) {
    closeUploader();
  }
});

uploaderSubmitBtn.addEventListener("click", () => {
  const text = uploaderTextarea.value.trim();
  if (!text) {
    uploaderFeedbackEl.textContent = "Please provide JSON content to add.";
    return;
  }

  try {
    const parsedEntries = parseUploadedContent(text);
    if (!parsedEntries.length) {
      uploaderFeedbackEl.textContent = "No valid entries found in the provided JSON.";
      return;
    }
    contentSets = contentSets.concat(parsedEntries);
    uploaderFeedbackEl.textContent = `${parsedEntries.length} new paragraph${parsedEntries.length > 1 ? "s" : ""} added.`;
    if (uploaderAutoCloseTimer) {
      clearTimeout(uploaderAutoCloseTimer);
    }
    uploaderAutoCloseTimer = window.setTimeout(() => {
      closeUploader();
      uploaderAutoCloseTimer = null;
    }, AUTO_CLOSE_DELAY_MS);
  } catch (error) {
    uploaderFeedbackEl.textContent = `Unable to add content: ${error.message}`;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !uploaderSection.hidden) {
    closeUploader();
  }
});

function handlePlayToggle() {
  if (state.playing) {
    pause();
  } else {
    resetQuestion();
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
    const extraDelay = isLineWrapTransition(tokenIndex, nextTokenIndex) ? onMs : 0;
    state.timers.show = window.setTimeout(scheduleShow, offMs + extraDelay);
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
  state.paragraphIndex = (state.paragraphIndex + step + contentSets.length) % contentSets.length;
  localStorage.setItem(STORAGE_KEYS.paragraphIndex, String(state.paragraphIndex));
  loadContent(state.paragraphIndex);
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

function loadContent(index) {
  const content = contentSets[index];
  renderParagraph(content.paragraph);
  state.currentQuestion = content.question || null;
  resetQuestion();
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
    showQuestion();
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

uploaderTextarea.value = DEFAULT_UPLOADER_JSON;

function showQuestion() {
  if (!state.currentQuestion) return;
  const { prompt, choices } = state.currentQuestion;
  questionPromptEl.textContent = prompt;
  feedbackEl.textContent = "";
  answersListEl.innerHTML = "";

  choices.forEach((choice, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reader__choice";
    button.textContent = choice;
    button.dataset.index = String(index);
    button.addEventListener("click", handleChoiceSelection);
    item.appendChild(button);
    answersListEl.appendChild(item);
  });

  comprehensionSection.hidden = false;
}

function resetQuestion() {
  comprehensionSection.hidden = true;
  questionPromptEl.textContent = "";
  answersListEl.innerHTML = "";
  feedbackEl.textContent = "";
}

function handleChoiceSelection(event) {
  if (!state.currentQuestion) return;
  const target = event.currentTarget;
  const selectedIndex = Number.parseInt(target.dataset.index || "", 10);
  const { answerIndex } = state.currentQuestion;
  const buttons = answersListEl.querySelectorAll(".reader__choice");
  buttons.forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  });

  if (selectedIndex === answerIndex) {
    target.dataset.result = "correct";
    feedbackEl.textContent = "Correct!";
  } else {
    target.dataset.result = "incorrect";
    const correctButton = buttons[answerIndex];
    if (correctButton) {
      correctButton.dataset.result = "correct";
    }
    feedbackEl.textContent = "Not quite. Review the paragraph and try again.";
  }
}

function isLineWrapTransition(currentIndex, nextIndex) {
  const currentEl = state.tokenElements[currentIndex];
  const nextEl = state.tokenElements[nextIndex];
  if (!currentEl || !nextEl) return false;
  const currentRect = currentEl.getBoundingClientRect();
  const nextRect = nextEl.getBoundingClientRect();
  if (!currentRect || !nextRect) return false;
  return nextRect.top - currentRect.top > currentRect.height * 0.6;
}

function parseUploadedContent(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    parsed = null;
  }

  let entries;
  if (parsed !== null) {
    entries = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    entries = parseJsonFragments(text);
    if (!entries.length) {
      throw new Error(
        "Invalid JSON. Provide an array, a single object, or multiple JSON objects separated by blank lines.",
      );
    }
  }

  const flattenedEntries = entries.reduce((list, entry) => {
    if (Array.isArray(entry)) {
      list.push(...entry);
    } else {
      list.push(entry);
    }
    return list;
  }, []);

  const normalized = flattenedEntries
    .map((entry) => {
      try {
        return normalizeContent(entry);
      } catch (error) {
        console.warn("Skipping invalid entry", error);
        return null;
      }
    })
    .filter(Boolean);
  return normalized;
}

function parseJsonFragments(text) {
  const fragments = [];
  const input = String(text);
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let startIndex = -1;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (startIndex === -1) {
      if (char === "{" || char === "[") {
        startIndex = index;
        depth = 1;
        inString = false;
        escapeNext = false;
      }
      continue;
    }

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]") {
      depth -= 1;
      if (depth < 0) {
        throw new Error("Invalid JSON fragment detected");
      }
      if (depth === 0) {
        fragments.push(input.slice(startIndex, index + 1));
        startIndex = -1;
      }
      continue;
    }
  }

  if (depth !== 0) {
    throw new Error("Invalid JSON fragment detected");
  }

  return fragments
    .map((fragment) => {
      const trimmed = fragment.trim();
      if (!trimmed) {
        return null;
      }
      try {
        return JSON.parse(trimmed);
      } catch (error) {
        throw new Error("Invalid JSON fragment detected");
      }
    })
    .filter(Boolean);
}

function normalizeContent(entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Content entry must be an object");
  }
  const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : cryptoRandomId();
  const paragraph = typeof entry.paragraph === "string" && entry.paragraph.trim()
    ? entry.paragraph.trim()
    : null;
  if (!paragraph) {
    throw new Error("Paragraph text is required");
  }
  const question = entry.question && typeof entry.question === "object" ? entry.question : null;
  if (!question) {
    throw new Error("Question is required for each entry");
  }
  const prompt = typeof question.prompt === "string" && question.prompt.trim() ? question.prompt.trim() : null;
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => String(choice).trim())
    : null;
  const answerIndex = Number.isInteger(question.answerIndex) ? question.answerIndex : null;
  const hasEmptyChoice = choices ? choices.some((choice) => !choice) : true;
  if (
    !prompt ||
    !choices ||
    choices.length < 2 ||
    hasEmptyChoice ||
    answerIndex === null ||
    answerIndex < 0 ||
    answerIndex >= choices.length
  ) {
    throw new Error("Question must include a prompt, at least two choices, and a valid answerIndex");
  }

  return {
    id,
    paragraph,
    question: {
      prompt,
      choices,
      answerIndex,
    },
  };
}

function closeUploader(options = {}) {
  if (typeof Event !== "undefined" && options instanceof Event) {
    options = {};
  }
  if (uploaderAutoCloseTimer) {
    clearTimeout(uploaderAutoCloseTimer);
    uploaderAutoCloseTimer = null;
  }
  uploaderSection.hidden = true;
  uploaderFeedbackEl.textContent = "";
  uploaderTextarea.value = DEFAULT_UPLOADER_JSON;
  const restoreFocus = options.restoreFocus !== false;
  if (restoreFocus) {
    addBtn.focus();
  }
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
