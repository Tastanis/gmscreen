import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateMapBundle, uploadMapBundle, remapImages } from '../scene-map-bundle.mjs';
const image=Buffer.from('ffd8ffe000104a46494600010100000100010000','hex');
function fixture() {
  const packageData={format:'gmscreen-scene/v1',scene:{id:'source',name:'Map',mapUrl:'/old/map.jpg'},domains:{sceneConfig:{environment:{walls:{value:{roofs:[{id:'roof-id',imageId:'/old/roof.jpg',height:3}]}}}},placements:{token:{id:'token',tokenId:'/old/map.jpg'}}}};
  return {format:'gmscreen-map/v1',package:packageData,assets:['/old/map.jpg','/old/roof.jpg'].map(reference=>({reference,mime:'image/jpeg',base64:image.toString('base64'),sha256:createHash('sha256').update(image).digest('hex')}))};
}
test('complete bundle verifies images and remaps only documented image fields',async()=>{
  const source=fixture();const bundle=await validateMapBundle(source);
  const urls=new Map([['/old/map.jpg','/new/map.jpg'],['/old/roof.jpg','/new/roof.jpg']]);
  const mapped=remapImages(bundle.package,urls);
  assert.equal(mapped.scene.mapUrl,'/new/map.jpg');
  assert.equal(mapped.domains.sceneConfig.environment.walls.value.roofs[0].imageId,'/new/roof.jpg');
  assert.equal(mapped.domains.placements.token.tokenId,'/old/map.jpg');
  assert.equal(source.package.scene.mapUrl,'/old/map.jpg');
  assert.deepEqual(mapped.assetReferences,['/new/map.jpg','/new/roof.jpg']);
});
test('reject missing, duplicate, unexpected, corrupt and misleading images before upload',async()=>{
  const mutations=[b=>b.assets.pop(),b=>b.assets.push(b.assets[0]),b=>b.assets[0].reference='/extra',b=>b.assets[0].sha256='0'.repeat(64),b=>b.assets[0].base64='abc?',b=>b.assets[0].mime='image/svg+xml',b=>b.assets[0].mime='image/png'];
  for(const mutate of mutations){const bundle=fixture();mutate(bundle);await assert.rejects(validateMapBundle(bundle));}
});
test('large valid base64 does not overflow the regular expression stack',async()=>{
  const source=fixture();const bytes=Buffer.alloc(7500000);image.copy(bytes);
  source.assets[0].base64=bytes.toString('base64');source.assets[0].sha256=createHash('sha256').update(bytes).digest('hex');
  const validated=await validateMapBundle(source);assert.equal(validated.assets.get('/old/map.jpg').size,7500000);
});
test('upload uses GM image endpoint without any temporary scene and retry retains accepted images',async()=>{
  const bundle=await validateMapBundle(fixture());const accepted=new Map();let calls=0;
  const fetcher=async(url,options)=>{
    assert.equal(url,'/dnd/vtt/api/uploads.php');assert.equal(options.credentials,'same-origin');
    assert.ok(options.body.get('map') instanceof Blob);calls++;
    return {ok:calls!==2,json:async()=>calls===2?{success:false,error:'Interrupted'}:{success:true,data:{url:`/dnd/vtt/storage/uploads/image${calls}.jpg`}}};
  };
  await assert.rejects(uploadMapBundle(bundle,accepted,fetcher),/Interrupted/);
  assert.equal(accepted.size,1);
  const mapped=await uploadMapBundle(bundle,accepted,fetcher);
  assert.equal(calls,3);assert.equal(mapped.scene.mapUrl,'/dnd/vtt/storage/uploads/image1.jpg');
  assert.equal(mapped.domains.sceneConfig.environment.walls.value.roofs[0].imageId,'/dnd/vtt/storage/uploads/image3.jpg');
});
test('untrusted upload response cannot install external or arbitrary asset URLs',async()=>{
  const bundle=await validateMapBundle(fixture());
  for(const url of ['https://elsewhere/image.jpg','/dnd/vtt/storage/uploads/../../x','javascript:x']) {
    await assert.rejects(uploadMapBundle(bundle,new Map(),async()=>({ok:true,json:async()=>({success:true,data:{url}})})));
  }
});

test('one package UI previews before upload and imports with an immutable idempotent retry',async()=>{
  const {createRequire}=await import('node:module');
  const {JSDOM}=createRequire(import.meta.url)('jsdom');
  const dom=new JSDOM('<details><input type="file"><p data-scene-import-status></p><div data-scene-import-result></div></details>');
  const previousDocument=globalThis.document, previousFetch=globalThis.fetch;
  globalThis.document=dom.window.document;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const calls=[];let importCount=0;
  globalThis.fetch=async(url,options)=>{
    calls.push({url,body:options?.body});
    if(url.endsWith('scene-import-preview.php')) return {ok:true,json:async()=>({success:true,preview:{name:'Map',counts:{placements:0,floors:1,drawings:0,templates:0},warnings:[],assetReferences:['/old/map.jpg','/old/roof.jpg'],importable:true}})};
    if(url.endsWith('uploads.php')) return {ok:true,json:async()=>({success:true,data:{url:`/dnd/vtt/storage/uploads/image${calls.length}.jpg`}})};
    if(url.endsWith('scene-import.php')) {importCount++;return {ok:importCount>1,json:async()=>importCount===1?{success:false,error:'Try again'}:{success:true,scene:{id:'scn-test',name:'Map'}}};}
    return {ok:true,json:async()=>({success:true,data:{items:[{id:'scn-test'}]}})};
  };
  const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('UI did not settle');};
  try {
    const {mountSceneImportPreview}=await import('../scene-import-preview.js');
    const root=dom.window.document.querySelector('details');let confirmed=0;
    mountSceneImportPreview(root,{confirmImportedScene:async()=>confirmed++,updateState:()=>{}});
    const text=JSON.stringify(fixture()),input=root.querySelector('input');
    Object.defineProperty(input,'files',{value:[{size:text.length,text:async()=>text}]});
    input.dispatchEvent(new dom.window.Event('change'));
    assert.equal(input.disabled,true,'file read and validation lock controls immediately');
    await waitFor(()=>root.querySelector('button'));
    assert.equal(calls.length,1,'preview must not upload assets');
    const check=root.querySelector('input[type=checkbox]');check.checked=true;check.dispatchEvent(new dom.window.Event('change'));
    const button=root.querySelector('button');button.click();
    await waitFor(()=>button.textContent==='Retry import');
    assert.equal(calls.filter(call=>call.url.endsWith('uploads.php')).length,2);
    button.click();await waitFor(()=>confirmed===1);
    const imports=calls.filter(call=>call.url.endsWith('scene-import.php'));
    assert.equal(imports.length,2);assert.equal(imports[0].body,imports[1].body);
    assert.equal(calls.filter(call=>call.url.endsWith('uploads.php')).length,2);
    const submitted=JSON.parse(imports[1].body);assert.equal(submitted.allowPlayerBrowsing,true);
    assert.match(submitted.package.scene.mapUrl,/^\/dnd\/vtt\/storage\/uploads\//);
  } finally {globalThis.document=previousDocument;globalThis.fetch=previousFetch;dom.window.close();}
});
