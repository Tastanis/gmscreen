const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  assert.equal((await fetch(origin + '/diagnostic-manifest.json').then(r=>r.json())).test_fixture, 'floor-regression');
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const errors = [];
  try {
    const endpoint = origin + '/dnd/vtt/api/v2/player-roster.php';
    assert.equal((await fetch(endpoint)).status, 401);
    async function client(user) {
      const page = await browser.newPage({viewport:{width:1280,height:720}});
      page.setDefaultTimeout(15000);
      page.on('pageerror', error=>errors.push(error.message));
      await page.route('**/*', route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await page.goto(origin + '/test-login.php?user=' + user);
      await page.locator('[data-settings-launch="tokens"]').click();
      return page;
    }
    const gm = await client('GM'), older = await client('GM'), pc = await client('cal');
    assert.equal(await pc.locator('[data-player-roster-editor]').count(), 0);
    assert.equal((await pc.request.get(endpoint)).status(), 403);
    assert.equal((await pc.request.post(endpoint,{data:{players:['cal'],revision:'no'}})).status(), 403);
    const state = async ()=>(await (await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const originalState = await state();
    for (const page of [gm,older]) {
      await page.locator('[data-player-roster-editor] summary').click();
      await page.waitForFunction(()=>document.querySelector('[data-roster-status]')?.textContent==='Current roster loaded.');
    }
    const field = gm.locator('[data-roster-players]');
    const original = await field.inputValue();
    await field.fill(original+'\nrowan');
    await gm.getByRole('button',{name:'Save roster',exact:true}).click();
    await gm.waitForFunction(()=>document.querySelector('[data-roster-status]')?.textContent.startsWith('Roster saved.'));
    assert.equal((await state()).revision, originalState.revision, 'Roster save does not write board state.');
    await older.locator('[data-roster-players]').fill(original+'\nstale-player');
    await older.getByRole('button',{name:'Save roster',exact:true}).click();
    await older.waitForFunction(()=>document.querySelector('[data-roster-status]')?.textContent.includes('changed in another session'));
    assert.ok((await older.locator('[data-roster-players]').inputValue()).includes('stale-player'), 'Conflict preserves the draft.');
    const saved = await (await gm.request.get(endpoint)).json();
    assert.ok(saved.players.includes('rowan')); assert.ok(!saved.players.includes('stale-player'));
    await field.fill('../invalid');
    await gm.getByRole('button',{name:'Save roster',exact:true}).click();
    await gm.waitForFunction(()=>document.querySelector('[data-roster-status]')?.textContent.includes('invalid profile'));
    assert.deepEqual((await (await gm.request.get(endpoint)).json()).players,saved.players);
    await gm.getByRole('button',{name:'Reload this VTT',exact:true}).click();
    await gm.waitForFunction(()=>window.vttConfig?.playerRoster?.includes('rowan'));
    await gm.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    await gm.locator('[data-settings-launch="tokens"]').click();
    await gm.locator('[data-player-roster-editor] summary').click();
    await gm.waitForFunction(()=>document.querySelector('[data-roster-status]')?.textContent==='Current roster loaded.');
    await gm.locator('[data-roster-save]').scrollIntoViewIfNeeded();
    await gm.screenshot({path:'.playwright-mcp/roster-editor.png'});
    await gm.locator('[data-roster-players]').fill(original);
    await gm.getByRole('button',{name:'Save roster',exact:true}).click();
    await gm.waitForFunction(()=>document.querySelector('[data-roster-status]')?.textContent.startsWith('Roster saved.'));
    assert.deepEqual(await state(),originalState,'Roster editing preserves canonical campaign board state.');
    assert.deepEqual(errors,[]);
    console.log('PASS: GM roster editor, player/anonymous denial, stale draft protection, validation, reload, and unchanged board state.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
