function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0s';
  }
  const totalMilliseconds = Math.max(0, Math.round(ms));
  const totalSeconds = totalMilliseconds / 1000;
  if (totalSeconds < 1) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const wholeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const remainingMs = totalMilliseconds % 1000;
  if (hours > 0) {
    const minutePart = minutes > 0 ? `${minutes}m` : '';
    const secondPart = seconds > 0 ? `${seconds}s` : remainingMs ? `${(seconds + remainingMs / 1000).toFixed(1)}s` : '';
    return `${hours}h${minutePart ? ` ${minutePart}` : ''}${secondPart ? ` ${secondPart}` : ''}`.trim();
  }
  if (minutes > 0) {
    const secValue = seconds + remainingMs / 1000;
    return `${minutes}m ${secValue >= 10 ? Math.round(secValue) : secValue.toFixed(1)}s`;
  }
  const fractional = seconds + remainingMs / 1000;
  return `${fractional >= 10 ? fractional.toFixed(0) : fractional.toFixed(1)}s`;
}

function createBarRow(documentRef, {
  label,
  value,
  max,
  color = 'default',
  subtitle = '',
  tooltip = '',
}) {
  const row = documentRef.createElement('div');
  row.className = 'vtt-combat-report__bar-row';

  const labelEl = documentRef.createElement('div');
  labelEl.className = 'vtt-combat-report__bar-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const barWrapper = documentRef.createElement('div');
  barWrapper.className = 'vtt-combat-report__bar';
  const fill = documentRef.createElement('div');
  fill.className = `vtt-combat-report__bar-fill vtt-combat-report__bar-fill--${color}`;
  const ratio = max > 0 ? value / max : 0;
  const widthPercent = ratio > 0 ? Math.max(4, Math.round(ratio * 100)) : 0;
  fill.style.width = `${Math.min(100, widthPercent)}%`;
  if (tooltip) {
    fill.title = tooltip;
  }
  barWrapper.appendChild(fill);

  const valueEl = documentRef.createElement('div');
  valueEl.className = 'vtt-combat-report__bar-value';
  valueEl.textContent = formatDuration(value);
  barWrapper.appendChild(valueEl);

  row.appendChild(barWrapper);
  if (subtitle) {
    const subtitleEl = documentRef.createElement('div');
    subtitleEl.className = 'vtt-combat-report__bar-subtitle';
    subtitleEl.textContent = subtitle;
    row.appendChild(subtitleEl);
  }
  return row;
}

function renderSummaryGrid(documentRef, container, summary) {
  const stats = [
    { label: 'Total Duration', value: formatDuration(summary.totalDurationMs) },
    { label: 'Rounds', value: summary.highestRound || 1 },
    { label: 'Decision Time', value: formatDuration(summary.totals.decisionMs) },
    { label: 'Player Turns', value: formatDuration(summary.totals.playerMs) },
    { label: 'GM Turns', value: formatDuration(summary.totals.gmMs) },
  ];
  stats.forEach((stat) => {
    const item = documentRef.createElement('div');
    item.className = 'vtt-combat-report__summary-item';
    const label = documentRef.createElement('span');
    label.className = 'vtt-combat-report__summary-label';
    label.textContent = stat.label;
    const value = documentRef.createElement('span');
    value.className = 'vtt-combat-report__summary-value';
    value.textContent = stat.value;
    item.appendChild(label);
    item.appendChild(value);
    container.appendChild(item);
  });
}

function renderWaitingSection(documentRef, panel, summary) {
  if (!summary.waitingByRound.length) {
    return;
  }
  const section = documentRef.createElement('section');
  section.className = 'vtt-combat-report__section';
  const heading = documentRef.createElement('h3');
  heading.className = 'vtt-combat-report__section-title';
  heading.textContent = 'Decision Time by Round';
  section.appendChild(heading);

  const chart = documentRef.createElement('div');
  chart.className = 'vtt-combat-report__bar-group';
  const maxDuration = Math.max(...summary.waitingByRound.map((entry) => entry.durationMs));
  summary.waitingByRound.forEach((entry) => {
    chart.appendChild(
      createBarRow(documentRef, {
        label: `Round ${entry.round}`,
        value: entry.durationMs,
        max: maxDuration,
        color: 'waiting',
      })
    );
  });
  section.appendChild(chart);
  panel.appendChild(section);
}

function renderParticipantCard(documentRef, participant) {
  const card = documentRef.createElement('section');
  card.className = 'vtt-combat-report__card';

  const header = documentRef.createElement('header');
  header.className = 'vtt-combat-report__card-header';
  const title = documentRef.createElement('h4');
  title.className = 'vtt-combat-report__card-title';
  title.textContent = participant.name;
  header.appendChild(title);

  const total = documentRef.createElement('div');
  total.className = 'vtt-combat-report__card-total';
  const pct = `${participant.percentage.toFixed(1)}% of combat`;
  total.textContent = `${formatDuration(participant.totalMs)} • ${pct}`;
  header.appendChild(total);

  if (participant.longestTurnMs > 0) {
    const longest = documentRef.createElement('div');
    longest.className = 'vtt-combat-report__card-meta';
    const round = participant.longestTurnRound ? `Round ${participant.longestTurnRound}` : '—';
    longest.textContent = `Longest turn: ${formatDuration(participant.longestTurnMs)} (${round})`;
    header.appendChild(longest);
  }

  card.appendChild(header);

  if (participant.perRound.length) {
    const chart = documentRef.createElement('div');
    chart.className = 'vtt-combat-report__bar-group';
    const maxRoundDuration = Math.max(...participant.perRound.map((entry) => entry.totalMs));
    participant.perRound.forEach((entry) => {
      const tooltip = entry.turns.length > 1
        ? `${entry.turns.length} turns in this round`
        : 'Single turn';
      chart.appendChild(
        createBarRow(documentRef, {
          label: `Round ${entry.round}`,
          value: entry.totalMs,
          max: maxRoundDuration,
          color: participant.role === 'gm' ? 'gm' : 'player',
          subtitle:
            entry.turns.length > 1
              ? `${entry.turns.length} turns`
              : '1 turn',
          tooltip,
        })
      );
    });
    card.appendChild(chart);
  }

  return card;
}

export function showCombatTimerReport(summary, { documentRef = typeof document !== 'undefined' ? document : null } = {}) {
  if (!summary || !documentRef || !documentRef.body) {
    return;
  }

  const existing = documentRef.querySelector('.vtt-combat-report');
  if (existing) {
    existing.remove();
  }

  const overlay = documentRef.createElement('div');
  overlay.className = 'vtt-combat-report';

  const backdrop = documentRef.createElement('div');
  backdrop.className = 'vtt-combat-report__backdrop';
  overlay.appendChild(backdrop);

  const panel = documentRef.createElement('div');
  panel.className = 'vtt-combat-report__panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'combat-report-title');
  panel.tabIndex = -1;

  const header = documentRef.createElement('header');
  header.className = 'vtt-combat-report__header';
  const title = documentRef.createElement('h2');
  title.className = 'vtt-combat-report__title';
  title.id = 'combat-report-title';
  title.textContent = 'Combat Summary';
  header.appendChild(title);

  const closeButton = documentRef.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'vtt-combat-report__close';
  closeButton.setAttribute('aria-label', 'Close combat summary');
  closeButton.innerHTML = '&times;';
  header.appendChild(closeButton);

  panel.appendChild(header);

  const summaryGrid = documentRef.createElement('section');
  summaryGrid.className = 'vtt-combat-report__summary-grid';
  renderSummaryGrid(documentRef, summaryGrid, summary);
  panel.appendChild(summaryGrid);

  renderWaitingSection(documentRef, panel, summary);

  if (summary.participants.players.length) {
    const playersSection = documentRef.createElement('section');
    playersSection.className = 'vtt-combat-report__section';
    const playersHeading = documentRef.createElement('h3');
    playersHeading.className = 'vtt-combat-report__section-title';
    playersHeading.textContent = 'Player Turns';
    playersSection.appendChild(playersHeading);

    const grid = documentRef.createElement('div');
    grid.className = 'vtt-combat-report__card-grid';
    summary.participants.players.forEach((participant) => {
      grid.appendChild(renderParticipantCard(documentRef, participant));
    });
    playersSection.appendChild(grid);
    panel.appendChild(playersSection);
  }

  if (summary.participants.gm) {
    const gmSection = documentRef.createElement('section');
    gmSection.className = 'vtt-combat-report__section';
    const gmHeading = documentRef.createElement('h3');
    gmHeading.className = 'vtt-combat-report__section-title';
    gmHeading.textContent = 'GM Turns';
    gmSection.appendChild(gmHeading);
    gmSection.appendChild(renderParticipantCard(documentRef, summary.participants.gm));

    if (summary.enemyWaitingByRound.length) {
      const gmWaiting = documentRef.createElement('div');
      gmWaiting.className = 'vtt-combat-report__bar-group';
      const maxEnemyWaiting = Math.max(
        ...summary.enemyWaitingByRound.map((entry) => entry.durationMs)
      );
      summary.enemyWaitingByRound.forEach((entry) => {
        gmWaiting.appendChild(
          createBarRow(documentRef, {
            label: `Round ${entry.round}`,
            value: entry.durationMs,
            max: maxEnemyWaiting,
            color: 'gm',
          })
        );
      });
      const gmWaitingTitle = documentRef.createElement('h4');
      gmWaitingTitle.className = 'vtt-combat-report__subheading';
      gmWaitingTitle.textContent = 'GM Decision Time';
      gmSection.appendChild(gmWaitingTitle);
      gmSection.appendChild(gmWaiting);
    }

    panel.appendChild(gmSection);
  }

  overlay.appendChild(panel);
  documentRef.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    documentRef.removeEventListener('keydown', handleKeydown);
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  backdrop.addEventListener('click', close);
  closeButton.addEventListener('click', close);
  documentRef.addEventListener('keydown', handleKeydown);

  setTimeout(() => {
    panel.focus();
  }, 0);
}

export default showCombatTimerReport;
