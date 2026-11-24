import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Brandon, November 17, 2026: "When i press a button on the left toolbar like Projects, or students. and I have
// students pinned already to the side bar, it should extend the side bar for me" and "chat shows pippa as 'player 6'".
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a rail button for a window pinned in a shut side drawer slides the drawer out', () => {
  const table = read('../../../../../table/table.js');
  assert.match(table, /if \(windows\.has\(id\)\) \{ const w = windows\.get\(id\); if \(w\.state\.min\) restore\(w\); if \(w\.state\.dock && !w\.state\.open\) setOpen\(w, true\); focusWin\(w\);/);
});

test('a chat line names its sender by the players page, not the login id', () => {
  const chat = read('../../../../../js/chat-panel.js');
  assert.match(chat, /userSpan\.textContent = getParticipantLabel\(message\.user\) \|\| 'Unknown';/);
  assert.doesNotMatch(chat, /userSpan\.textContent = message\.user \|\|/);
});
