export function mountPlayerRosterEditor(root) {
  if (!root) return;
  const input = root.querySelector('[data-roster-players]');
  const save = root.querySelector('[data-roster-save]');
  const load = root.querySelector('[data-roster-load]');
  const status = root.querySelector('[data-roster-status]');
  const reload = root.querySelector('[data-roster-reload]');
  let revision = null, busy = false;
  function controls() {
    input.disabled = busy;
    save.disabled = busy || !revision;
    load.disabled = busy;
  }
  async function request(options) {
    const response = await fetch('/dnd/vtt/api/v2/player-roster.php', {
      credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...options,
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw Error(data.error || `Roster request failed (${response.status}).`);
    return data;
  }
  async function perform(action) {
    if (busy) return;
    busy = true; controls();
    try { await action(); } catch (error) { status.textContent = error.message || 'Roster save could not be confirmed. Your draft is still here.'; }
    finally { busy = false; controls(); }
  }
  const refresh = () => perform(async () => {
    status.textContent = 'Loading roster…';
    const data = await request(); revision = data.revision;
    input.value = data.players.join('\n'); status.textContent = 'Current roster loaded.';
  });
  load.addEventListener('click', refresh);
  save.addEventListener('click', () => perform(async () => {
    const players = input.value.split(/[\s,]+/).map(id => id.trim()).filter(Boolean);
    status.textContent = 'Saving roster…';
    const data = await request({method:'POST',body:JSON.stringify({players,revision})});
    revision = data.revision; input.value = data.players.join('\n');
    status.textContent = 'Roster saved. Reload every open VTT tab to use the updated player list.';
    reload.hidden = false;
  }));
  reload.addEventListener('click', () => window.location.reload());
  root.addEventListener('toggle', () => { if (root.open && !revision) refresh(); });
  controls();
}
