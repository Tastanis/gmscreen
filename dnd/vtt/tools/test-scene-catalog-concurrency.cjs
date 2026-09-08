const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
(async()=>{
  const root=path.resolve('.playwright-mcp/floor-regression/runtime');
  const app=path.resolve(JSON.parse(await fs.readFile(path.join(root,'current-vtt-app.json'),'utf8')).path);
  assert.ok(app.startsWith(root+path.sep),'Only a workspace disposable app may be tested');
  await fs.access(path.join(app,'.gmscreen-test-app'));
  const manifest=JSON.parse(await fs.readFile(path.join(app,'diagnostic-manifest.json'),'utf8'));
  assert.equal(manifest.test_fixture,'floor-regression');
  const catalogPath=path.join(app,'dnd/vtt/storage/scenes.json');
  const before=JSON.parse(await fs.readFile(catalogPath,'utf8'));
  const beforeItems=before.scenes||before.items;
  const php=spawnSync('php',['-r','echo PHP_BINARY;'],{encoding:'utf8'}).stdout.trim();
  assert.ok(php);
  const args=['-d',`extension_dir=${path.join(path.dirname(php),'ext')}`,'-d','extension=php_pdo_sqlite.dll'];
  const workerCode=`define('VTT_SCENES_API_INCLUDE_ONLY',true); require $argv[1]; echo "ready\\n"; $p=json_decode($argv[3],true); $r=match($argv[2]) {'folder'=>createFolder($p),'scene'=>createScene($p),'grid'=>updateSceneGrid($p),'visibility'=>updateSceneVisibility($p)}; echo json_encode($r);`;
  function child(code, values) {
    const process=spawn(php,[...args,'-r',code,...values],{stdio:['pipe','pipe','pipe']});
    let output='',error='',done=false;
    let readyResolve,readyReject;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    const completion=new Promise((resolve,reject)=>{
      process.stdout.on('data',chunk=>{output+=chunk; if(output.includes('ready')||output.includes('locked')) readyResolve();});
      process.stderr.on('data',chunk=>error+=chunk);
      process.on('error',e=>{readyReject(e);reject(e);});
      process.on('exit',code=>{done=true; if(code!==0){const e=Error(error||output||`PHP exited ${code}`);readyReject(e);reject(e);} else resolve(output);});
    });
    return {process,ready,completion,isDone:()=>done};
  }
  const holder=child('$f=fopen($argv[1],"c");flock($f,LOCK_EX);echo "locked\\n";fgets(STDIN);flock($f,LOCK_UN);fclose($f);',[path.join(app,'dnd/vtt/storage/board-state.lock')]);
  const workers=[];
  try {
    await holder.ready;
    const operations=[];
    for(let i=0;i<8;i++) operations.push(['scene',{name:`Concurrent scene ${i}`,mapUrl:'/fixture-map.png',playerVisible:false}],['folder',{name:`Concurrent folder ${i}`}]);
    operations.push(['grid',{sceneId:manifest.test_scene_id,grid:{size:73}}],['visibility',{sceneId:manifest.test_scene_id,playerVisible:false}]);
    for(const [action,payload] of operations) workers.push(child(workerCode,[path.join(app,'dnd/vtt/api/scenes.php'),action,JSON.stringify(payload)]));
    await Promise.all(workers.map(w=>w.ready));
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.ok(workers.every(w=>!w.isDone()),'Every catalog mutation must wait for the existing deletion lock.');
    assert.deepEqual(JSON.parse(await fs.readFile(catalogPath,'utf8')),before,'Blocked writers cannot modify catalog state.');
    holder.process.stdin.end('\n');
    await holder.completion; await Promise.all(workers.map(w=>w.completion));
    const after=JSON.parse(await fs.readFile(catalogPath,'utf8'));
    const items=after.scenes||after.items;
    assert.equal(items.length,beforeItems.length+8);
    assert.equal(after.folders.length,before.folders.length+8);
    for(let i=0;i<8;i++) {assert.equal(items.filter(s=>s.name===`Concurrent scene ${i}`).length,1);assert.equal(after.folders.filter(s=>s.name===`Concurrent folder ${i}`).length,1);}
    const updated=items.find(s=>s.id===manifest.test_scene_id);
    assert.equal(updated.grid.size,73);assert.equal(updated.playerVisible,false,'Concurrent grid and visibility saves preserve both fields.');
    for(const old of beforeItems) if(old.id!==manifest.test_scene_id) assert.deepEqual(items.find(s=>s.id===old.id),old);
    console.log('PASS: 18 real PHP writers wait for the deletion lock, preserve every created scene/folder, and merge independent scene edits.');
  } finally {
    holder.process.stdin.end('\n');
    for(const worker of workers) if(!worker.isDone()) worker.process.kill();
    if(!holder.isDone()) holder.process.kill();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
