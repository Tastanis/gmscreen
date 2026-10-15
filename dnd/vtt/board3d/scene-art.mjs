import {readGlb} from './glb-reader.mjs';

// Maps that come with their own 3D art as a .glb (assets/scenes/index.json): which scene is which map, and which of
// the art's top nodes belongs to which floor. A scene is that map when its height grid has the map's size and most of
// the map's floors are on it (as the Orchard art is matched), whatever the scene is called. The art is drawn over the
// map that plays: walls, floors, stairs and heights stay the scene's own.
const url=name=>new URL(`./assets/scenes/${name}${new URL(import.meta.url).search}`,import.meta.url).href;
let indexLoad=null;const loaded=new Map();

export function sceneArtFor(context){
 indexLoad??=fetch(url('index.json')).then(r=>r.ok?r.json():[]).catch(()=>[]);
 return indexLoad.then(list=>{const terrain=context.environment?.terrain?.value,roofs=new Set((context.environment?.walls?.value?.roofs||[]).map(r=>r.id));
  return (list||[]).find(entry=>{const m=entry.match||{};if(m.terrain&&(terrain?.n!==m.terrain[0]||terrain?.m!==m.terrain[1]))return false;
   const ids=m.roofs||[];return !ids.length||ids.filter(id=>roofs.has(id)).length>=ids.length*.8;})||null;});
}
/** The art of an entry, read once and kept (its parts are moved from one board to the next, not copied). */
export function loadSceneArt(entry){
 if(!loaded.has(entry.id))loaded.set(entry.id,readGlb(url(entry.glb)).then(({scene})=>{
  scene.traverse(o=>{if(!o.isMesh)return;const see=o.material.transparent;o.castShadow=!see&&!o.material.userData.additive;o.receiveShadow=!o.material.userData.additive;});
  return scene;}));
 return loaded.get(entry.id);
}
