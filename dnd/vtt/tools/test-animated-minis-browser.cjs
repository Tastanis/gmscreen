const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const repo=path.resolve(__dirname,'../../..');
// The revised asset keeps side motes but never restores the removed facial jet.
const asset=fs.readFileSync(path.join(repo,'dnd/vtt/board3d/assets/minis/ink-devourer.glb'));
const gltf=JSON.parse(asset.subarray(20,20+asset.readUInt32LE(12)));
assert(!gltf.nodes.some(n=>/Ink_plume|Centered_siphon/.test(n.name||'')));
assert.equal(gltf.nodes.filter(n=>/Ink_droplet_/.test(n.name||'')).length,36);
const html=`<!doctype html><script type="importmap">{"imports":{"three":"/dnd/vtt/board3d/lib/three.module.js"}}</script><script type="module">
import * as THREE from 'three';import {createMinis} from '/dnd/vtt/board3d/minis.mjs';
const scene=new THREE.Scene();scene.background=new THREE.Color('#172236');const camera=new THREE.PerspectiveCamera(38,1.5,.01,100);camera.position.set(0,2.6,5);camera.lookAt(0,.6,0);
scene.add(new THREE.HemisphereLight(0xffffff,0x667799,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,5,3);scene.add(light);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1050,700);document.body.append(renderer.domElement);
const minis=createMinis(scene),records=[{id:'one',x:-.8,y:0,z:0,width:1,height:1},{id:'two',x:.8,y:0,z:0,width:1,height:1}],profiles=new Map([['one',{monster:'ink-devourer-level-4-retainer'}],['two',{mini:{model:'ink-devourer',scale:.6,noBase:true}}]]);let hidden=new Set();
const step=(dt=0)=>{const state=minis.update(records,profiles,r=>!hidden.has(r.id),camera,dt);scene.updateMatrixWorld(true);renderer.render(scene,camera);return state};
Object.assign(window,{THREE,scene,camera,renderer,minis,records,profiles,hidden,step});window.ready=true;step();
</script>`;
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});const page=await b.newPage({viewport:{width:1080,height:740}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await page.route('http://mini-test.local/**',async r=>{const url=new URL(r.request().url());if(url.pathname==='/')return r.fulfill({contentType:'text/html',body:html});const name=path.join(repo,url.pathname);try{await r.fulfill({contentType:name.endsWith('.json')?'application/json':name.endsWith('.glb')?'model/gltf-binary':'application/javascript',body:fs.readFileSync(name)})}catch{await r.fulfill({status:404,body:'Not found'})}});await page.goto('http://mini-test.local/');await page.waitForFunction(()=>window.ready&&step().ids.size===2);
const result=await page.evaluate(()=>{
 const root=scene.getObjectByName('vtt-hero-minis');const [a,b]=root.children;const bones=[];a.traverse(o=>{if(o.isBone)bones.push(o)});const other=[];b.traverse(o=>{if(o.isBone)other.push(o)});const same=bones.some(x=>other.includes(x));const before=bones.map(x=>x.quaternion.toArray());let state;for(let i=0;i<30;i++)state=step(1/30);const moved=bones.some((x,i)=>x.quaternion.toArray().some((n,k)=>Math.abs(n-before[i][k])>.001));const h=scene.getObjectByName('L0_Hover');const frozen=other.map(x=>x.quaternion.toArray());hidden.add('two');for(let i=0;i<15;i++)step(1/30);const frozenOk=other.every((x,i)=>x.quaternion.toArray().every((n,k)=>n===frozen[i][k]));hidden.clear();step();return {count:root.children.length,same,moved,frozenOk,noBase:[...state.noBase],tops:[...state.tops],scales:root.children.map(o=>o.scale.x),shadowRedraw:state.redraw};
});assert.equal(result.count,2);assert.equal(result.same,false);assert.equal(result.moved,true);assert.equal(result.frozenOk,true);assert.deepEqual(result.noBase,['one','two']);assert(result.tops.every(([,h])=>h>.7&&h<1.3));assert(result.scales.every(x=>x===.6));assert(result.shadowRedraw);
await page.evaluate(()=>{records.push({id:'static',x:0,y:1,z:0,width:1,height:1});profiles.set('static',{monster:'sluice-ghoul-level-4-minion'});step()});await page.waitForFunction(()=>step().ids.size===3);
const cleanup=await page.evaluate(()=>{records.splice(0,1);step();const remaining=scene.getObjectByName('vtt-hero-minis').children.length;minis.dispose();return {remaining,disposed:!scene.getObjectByName('vtt-hero-minis')}});assert.equal(cleanup.remaining,2);assert(cleanup.disposed);assert.deepEqual(errors,[]);console.log(JSON.stringify({result,cleanup,errors}));await b.close();})();
