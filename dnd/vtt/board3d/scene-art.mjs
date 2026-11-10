import {readGlb} from './glb-reader.mjs';
import {applySwampWaterAnimation} from './swamp-water.mjs';
import {applyLilyBob} from './lily-bob.mjs';
import {attachPieces} from './breakable-art.mjs';

// Maps that come with their own 3D art as a .glb (assets/scenes/index.json): which scene is which map, and which of
// the art's top nodes belongs to which floor. A scene is that map when its height grid has the map's size and most of
// the map's floors are on it (as the Orchard art is matched), whatever the scene is called. The art is drawn over the
// map that plays: walls, floors, stairs and heights stay the scene's own.
// An entry may also say (Thornbriar, November 2026):
//   "materials"         settings for materials named in the art: envMapIntensity, roughness, and
//                       "animation": "swamp-ripples" with its ripple sources (swamp-water.mjs);
//   "lilyBob"           a file of lily pads that rock gently on the water (lily-bob.mjs);
//   "terrainZoneFills"  {"<zone tag>": false} where the art paints that ground itself, so the zone's coloured fill
//                       is left off (its outline, name and rules stay);
//   "pieces"            a file of the art's breakable pieces and their rubble (breakable-art.mjs).
const url=name=>new URL(`./assets/scenes/${name}${new URL(import.meta.url).search}`,import.meta.url).href;
let indexLoad=null;const loaded=new Map();

export function sceneArtFor(context){
 // A list that could not be read is not remembered: the next board built asks again (a hiccup must not leave a
 // page on plain floor shapes until it is reloaded).
 indexLoad??=fetch(url('index.json')).then(r=>{if(!r.ok)throw Error(`index.json: ${r.status}`);return r.json();}).catch(error=>{console.warn('[3D board] map art list not read',error);indexLoad=null;return [];});
 return indexLoad.then(list=>{const terrain=context.environment?.terrain?.value,roofs=new Set((context.environment?.walls?.value?.roofs||[]).map(r=>r.id));
  return (list||[]).find(entry=>{const m=entry.match||{};if(m.terrain&&(terrain?.n!==m.terrain[0]||terrain?.m!==m.terrain[1]))return false;
   const ids=m.roofs||[];return !ids.length||ids.filter(id=>roofs.has(id)).length>=ids.length*.8;})||null;});
}
// Per-map art controls affect only explicitly named materials; the scene's other lighting stays unchanged.
export function applySceneArtMaterialOptions(material,entry){
 const option=entry.materials?.[material.name];if(!option)return;
 if(Number.isFinite(option.envMapIntensity))material.envMapIntensity=Math.max(0,Math.min(8,option.envMapIntensity));
 if(Number.isFinite(option.roughness)&&'roughness' in material)material.roughness=Math.max(0,Math.min(1,option.roughness));
 if(option.animation==='swamp-ripples')applySwampWaterAnimation(material,option);
 material.needsUpdate=true;
}
// A side file of an entry. One that cannot be read is said in the console and the art is drawn without it: a map
// is never left without its art for want of its lilies' rocking or its rubble.
const sideFile=(entry,name)=>entry[name]?fetch(url(entry[name])).then(r=>{if(!r.ok)throw Error(`${entry[name]}: ${r.status}`);return r.json();}).catch(error=>{console.warn(`[3D board] map art "${entry.id}": ${name} not read`,error);return null;}):Promise.resolve(null);
/** The art of an entry, read once and kept (its parts are moved from one board to the next, not copied). */
export function loadSceneArt(entry){
 if(!loaded.has(entry.id))loaded.set(entry.id,Promise.all([readGlb(url(entry.glb)),sideFile(entry,'lilyBob'),sideFile(entry,'pieces')]).then(([{scene},lilies,pieces])=>{
  const named=new Map();
  scene.traverse(o=>{if(!o.isMesh)return;
   for(const material of [o.material].flat())applySceneArtMaterialOptions(material,entry);
   if(lilies)try{applyLilyBob(o,lilies);}catch(error){console.warn(`[3D board] map art "${entry.id}": lilies left still`,error);}
   const see=o.material.transparent,moving=[o.material].flat().some(m=>m.userData?.swampWaterMotion);
   o.castShadow=!see&&!o.material.userData.additive&&!moving;o.receiveShadow=!o.material.userData.additive;
   if(o.geometry?.index&&!named.has(o.name||o.material.name))named.set(o.name||o.material.name,o.geometry);});
  // Each part carries its map's lighting (index.json "light"): the board takes it when the part is added.
  if(entry.light)for(const part of scene.children)part.userData.sceneLight=entry.light;
  // Breakable pieces: rubble is hidden from the start; the board shows what is broken (integration.mjs).
  if(pieces){scene.userData.pieces=attachPieces(named,pieces);for(const line of scene.userData.pieces.problems.slice(0,8))console.warn(`[3D board] map art "${entry.id}": ${line}`);}
  return scene;}).catch(error=>{loaded.delete(entry.id);throw error;})); // a failed read is tried again next time
 return loaded.get(entry.id);
}
