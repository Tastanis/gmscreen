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

function formatPercentage(value, total) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(total) || total <= 0) {
    return '0%';
  }
  const ratio = value / total;
  const precision = ratio >= 0.995 ? 0 : 1;
  return `${(ratio * 100).toFixed(precision)}%`;
}

function createBarRow(documentRef, {
  label,
  value,
  max,
  color = 'default',
  subtitle = '',
  tooltip = '',
  valueLabel,
  segments = [],
}) {
  const row = documentRef.createElement('div');
  row.className = 'vtt-combat-report__bar-row';

  const labelEl = documentRef.createElement('div');
  labelEl.className = 'vtt-combat-report__bar-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const barWrapper = documentRef.createElement('div');
  barWrapper.className = 'vtt-combat-report__bar';
  const track = documentRef.createElement('div');
  track.className = 'vtt-combat-report__bar-track';
  if (tooltip) {
    track.title = tooltip;
  }

  const normalizedSegments = Array.isArray(segments)
    ? segments
        .map((segment) => ({
          label: segment.label || '',
          value: Math.max(0, Number(segment.value) || 0),
          tooltip: segment.tooltip || '',
          color: segment.color || color,
        }))
        .filter((segment) => segment.value > 0)
    : [];

  const normalizedMax = Number.isFinite(max) && max > 0 ? max : 0;
  const fallbackTotal = normalizedSegments.reduce((sum, segment) => sum + segment.value, 0);
  const totalForWidth = normalizedMax > 0 ? normalizedMax : Math.max(value || 0, fallbackTotal);

  if (normalizedSegments.length) {
    normalizedSegments.forEach((segment, index) => {
      const segmentEl = documentRef.createElement('div');
      segmentEl.className = `vtt-combat-report__bar-segment vtt-combat-report__bar-segment--${segment.color}`;
      if (segment.tooltip) {
        segmentEl.title = segment.tooltip;
      } else if (segment.label) {
        segmentEl.title = segment.label;
      }
      const percent = totalForWidth > 0 ? (segment.value / totalForWidth) * 100 : 0;
      const clamped = Math.min(100, Math.max(0.75, percent));
      segmentEl.style.flexBasis = `${clamped}%`;
      segmentEl.style.width = segmentEl.style.flexBasis;
      if (index < normalizedSegments.length - 1) {
        segmentEl.classList.add('vtt-combat-report__bar-segment--delimited');
      }
      track.appendChild(segmentEl);
    });
  } else {
    const fill = documentRef.createElement('div');
    fill.className = `vtt-combat-report__bar-fill vtt-combat-report__bar-fill--${color}`;
    const ratio = totalForWidth > 0 ? value / totalForWidth : 0;
    const widthPercent = ratio > 0 ? Math.max(2, Math.round(ratio * 100)) : 0;
    fill.style.width = `${Math.min(100, widthPercent)}%`;
    if (tooltip) {
      fill.title = tooltip;
    }
    track.appendChild(fill);
  }

  barWrapper.appendChild(track);

  const valueEl = documentRef.createElement('div');
  valueEl.className = 'vtt-combat-report__bar-value';
  valueEl.textContent = valueLabel || formatDuration(value);
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
  const totalDuration = summary.totalDurationMs || 0;
  const gmDecisionTotal = summary.enemyWaitingByRound.reduce(
    (sum, entry) => sum + entry.durationMs,
    0
  );
  const stats = [
    { label: 'Total Duration', value: formatDuration(summary.totalDurationMs) },
    { label: 'Rounds', value: summary.highestRound || 1 },
    {
      label: 'PC Decision',
      value: `${formatDuration(summary.totals.decisionMs)} (${formatPercentage(
        summary.totals.decisionMs,
        totalDuration
      )})`,
    },
    {
      label: 'PC Turns',
      value: `${formatDuration(summary.totals.playerMs)} (${formatPercentage(
        summary.totals.playerMs,
        totalDuration
      )})`,
    },
    {
      label: 'Allies',
      value: `${formatDuration(summary.totals.allyMs)} (${formatPercentage(
        summary.totals.allyMs,
        totalDuration
      )})`,
    },
    {
      label: 'GM Turns',
      value: `${formatDuration(summary.totals.gmMs)} (${formatPercentage(
        summary.totals.gmMs,
        totalDuration
      )})`,
    },
    {
      label: 'GM Decision',
      value: `${formatDuration(gmDecisionTotal)} (${formatPercentage(
        gmDecisionTotal,
        totalDuration
      )})`,
    },
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
  const rounds = summary.waitingByRound.filter((entry) => entry.durationMs > 0);
  const totalWaiting = rounds.reduce((sum, entry) => sum + entry.durationMs, 0);
  if (!rounds.length && totalWaiting <= 0) {
    return;
  }
  const section = documentRef.createElement('section');
  section.className = 'vtt-combat-report__section';
  const heading = documentRef.createElement('h3');
  heading.className = 'vtt-combat-report__section-title';
  heading.textContent = 'PC Decision Making';
  section.appendChild(heading);

  const chart = documentRef.createElement('div');
  chart.className = 'vtt-combat-report__bar-group';
  const longest = rounds.reduce(
    (current, entry) => (!current || entry.durationMs > current.durationMs ? entry : current),
    null
  );
  const subtitleParts = [];
  if (rounds.length) {
    subtitleParts.push(
      rounds
        .map((entry) => `Round ${entry.round}: ${formatDuration(entry.durationMs)}`)
        .join(' • ')
    );
  }
  if (longest && longest.durationMs > 0) {
    subtitleParts.push(
      `Longest delay: Round ${longest.round} – ${formatDuration(longest.durationMs)}`
    );
  }
  chart.appendChild(
    createBarRow(documentRef, {
      label: 'PC Decision',
      value: totalWaiting,
      valueLabel: `${formatDuration(totalWaiting)} • ${formatPercentage(
        totalWaiting,
        summary.totalDurationMs
      )}`,
      max: summary.totalDurationMs,
      color: 'waiting',
      segments: rounds.map((entry) => ({
        label: `Round ${entry.round}`,
        value: entry.durationMs,
        tooltip: `Round ${entry.round}: ${formatDuration(entry.durationMs)}`,
        color: 'waiting',
      })),
      subtitle: subtitleParts.filter(Boolean).join(' • '),
    })
  );
  section.appendChild(chart);
  panel.appendChild(section);
}

function aggregateParticipants(participants, { label, role }) {
  const perRoundMap = new Map();
  let totalMs = 0;
  let longestTurnMs = 0;
  let longestTurnRound = null;

  participants.forEach((participant) => {
    totalMs += participant.totalMs;
    if (participant.longestTurnMs > longestTurnMs) {
      longestTurnMs = participant.longestTurnMs;
      longestTurnRound = participant.longestTurnRound;
    }

    participant.perRound.forEach((round) => {
      const existing = perRoundMap.get(round.round) || {
        totalMs: 0,
        longestTurnMs: 0,
        turns: [],
      };
      existing.totalMs += round.totalMs;
      existing.longestTurnMs = Math.max(existing.longestTurnMs, round.longestTurnMs);
      existing.turns = existing.turns.concat(round.turns);
      perRoundMap.set(round.round, existing);
    });
  });

  return {
    id: `aggregate-${role}-${label}`,
    name: label,
    role,
    totalMs,
    longestTurnMs,
    longestTurnRound,
    perRound: Array.from(perRoundMap.entries())
      .map(([round, entry]) => ({
        round: Number(round),
        totalMs: entry.totalMs,
        longestTurnMs: entry.longestTurnMs,
        turns: entry.turns.slice(),
      }))
      .sort((a, b) => a.round - b.round),
  };
}

function createParticipantRow(documentRef, participant, totalDurationMs) {
  const rounds = participant.perRound.filter((entry) => entry.totalMs > 0);
  const roundSummary = rounds
    .map((entry) => {
      const turnCount = entry.turns.length;
      const turnLabel = turnCount > 1 ? `${turnCount} turns` : turnCount === 1 ? '1 turn' : '0 turns';
      return `Round ${entry.round}: ${formatDuration(entry.totalMs)} (${turnLabel})`;
    })
    .join(' • ');
  const subtitleParts = [];
  if (roundSummary) {
    subtitleParts.push(roundSummary);
  }
  if (participant.longestTurnMs > 0) {
    const roundLabel = participant.longestTurnRound ? `Round ${participant.longestTurnRound}` : '—';
    subtitleParts.push(
      `Longest turn: ${formatDuration(participant.longestTurnMs)} (${roundLabel})`
    );
  }

  return createBarRow(documentRef, {
    label: participant.name,
    value: participant.totalMs,
    valueLabel: `${formatDuration(participant.totalMs)} • ${formatPercentage(
      participant.totalMs,
      totalDurationMs
    )}`,
    max: totalDurationMs,
    color: participant.role === 'gm' ? 'gm' : 'player',
    segments: rounds.map((entry) => ({
      label: `Round ${entry.round}`,
      value: entry.totalMs,
      tooltip:
        entry.turns.length > 1
          ? `Round ${entry.round}: ${formatDuration(entry.totalMs)} across ${entry.turns.length} turns`
          : `Round ${entry.round}: ${formatDuration(entry.totalMs)}`,
      color: participant.role === 'gm' ? 'gm' : 'player',
    })),
    subtitle: subtitleParts.join(' • '),
  });
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

  if (summary.participants.pcs.length) {
    const playersSection = documentRef.createElement('section');
    playersSection.className = 'vtt-combat-report__section';
    const playersHeading = documentRef.createElement('h3');
    playersHeading.className = 'vtt-combat-report__section-title';
    playersHeading.textContent = 'Player Turns';
    playersSection.appendChild(playersHeading);

    const group = documentRef.createElement('div');
    group.className = 'vtt-combat-report__bar-group';
    summary.participants.pcs.forEach((participant) => {
      group.appendChild(
        createParticipantRow(documentRef, participant, summary.totalDurationMs)
      );
    });
    playersSection.appendChild(group);
    panel.appendChild(playersSection);
  }

  if (summary.participants.allies.length) {
    const alliesSection = documentRef.createElement('section');
    alliesSection.className = 'vtt-combat-report__section';
    const alliesHeading = documentRef.createElement('h3');
    alliesHeading.className = 'vtt-combat-report__section-title';
    alliesHeading.textContent = 'Allied NPC Turns';
    alliesSection.appendChild(alliesHeading);

    const group = documentRef.createElement('div');
    group.className = 'vtt-combat-report__bar-group';

    const aggregate = aggregateParticipants(summary.participants.allies, {
      label: 'Allies',
      role: 'ally',
    });

    group.appendChild(
      createParticipantRow(documentRef, aggregate, summary.totalDurationMs)
    );

    alliesSection.appendChild(group);
    panel.appendChild(alliesSection);
  }

  if (summary.participants.gm) {
    const gmSection = documentRef.createElement('section');
    gmSection.className = 'vtt-combat-report__section';
    const gmHeading = documentRef.createElement('h3');
    gmHeading.className = 'vtt-combat-report__section-title';
    gmHeading.textContent = 'GM Turns';
    gmSection.appendChild(gmHeading);
    const gmGroup = documentRef.createElement('div');
    gmGroup.className = 'vtt-combat-report__bar-group';
    gmGroup.appendChild(
      createParticipantRow(documentRef, summary.participants.gm, summary.totalDurationMs)
    );

    const enemyRounds = summary.enemyWaitingByRound.filter((entry) => entry.durationMs > 0);
    if (enemyRounds.length) {
      const totalEnemyWaiting = enemyRounds.reduce(
        (sum, entry) => sum + entry.durationMs,
        0
      );
      const longestEnemy = enemyRounds.reduce(
        (current, entry) =>
          !current || entry.durationMs > current.durationMs ? entry : current,
        null
      );
      const subtitleParts = [
        enemyRounds
          .map((entry) => `Round ${entry.round}: ${formatDuration(entry.durationMs)}`)
          .join(' • '),
      ];
      if (longestEnemy && longestEnemy.durationMs > 0) {
        subtitleParts.push(
          `Longest delay: Round ${longestEnemy.round} – ${formatDuration(longestEnemy.durationMs)}`
        );
      }
      gmGroup.appendChild(
        createBarRow(documentRef, {
          label: 'GM Decision',
          value: totalEnemyWaiting,
          valueLabel: `${formatDuration(totalEnemyWaiting)} • ${formatPercentage(
            totalEnemyWaiting,
            summary.totalDurationMs
          )}`,
          max: summary.totalDurationMs,
          color: 'gm',
          segments: enemyRounds.map((entry) => ({
            label: `Round ${entry.round}`,
            value: entry.durationMs,
            tooltip: `Round ${entry.round}: ${formatDuration(entry.durationMs)}`,
            color: 'gm',
          })),
          subtitle: subtitleParts.filter(Boolean).join(' • '),
        })
      );
    }

    gmSection.appendChild(gmGroup);

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
