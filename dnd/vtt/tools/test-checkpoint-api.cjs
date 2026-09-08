const { request } = require('playwright');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.equal(manifest.test_fixture, 'floor-regression');
  const gm = await request.newContext({ baseURL: origin });
  const player = await request.newContext({ baseURL: origin });
  const anonymous = await request.newContext({ baseURL: origin });
  try {
    const endpoint = '/dnd/vtt/api/v2/checkpoints.php';
    assert.equal((await anonymous.get(endpoint)).status(), 401);
    await gm.get('/test-login.php?user=GM');
    await player.get('/test-login.php?user=cal');
    const before = (await (await gm.get('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const data = { id: randomUUID(), name: 'API regression checkpoint', sceneId: manifest.test_scene_id };
    for (const method of ['get', 'post', 'delete']) {
      assert.equal((await player[method](endpoint, { data })).status(), 403);
    }
    const created = await gm.post(endpoint, { data });
    assert.equal(created.status(), 200);
    const checkpoint = (await created.json()).checkpoint;
    assert.equal(checkpoint.revision, before.revision);
    assert.deepEqual(checkpoint.data.domains.placements, before.state.placements[data.sceneId]);
    assert.equal((await (await gm.get(endpoint + '?sceneId=' + data.sceneId)).json()).checkpoints.length, 1);
    assert.deepEqual((await (await gm.post(endpoint, { data })).json()).checkpoint, checkpoint);
    assert.deepEqual((await (await gm.get(endpoint + '?id=' + data.id)).json()).checkpoint, checkpoint);
    assert.equal((await (await gm.delete(endpoint, { data: { id: data.id } })).json()).removed, true);
    assert.equal((await gm.get(endpoint + '?id=' + data.id)).status(), 404);
    const after = (await (await gm.get('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    assert.deepEqual(after, before, 'Archive operations must not change board state or revision.');
    console.log('PASS: checkpoint API authentication, GM capture/list/read/delete, retries, and unchanged canonical board.');
  } finally { await Promise.all([gm.dispose(), player.dispose(), anonymous.dispose()]); }
})().catch(error => { console.error(error); process.exitCode = 1; });
