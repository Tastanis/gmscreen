import * as THREE from 'three';
import {readGlb} from './glb-reader.mjs';
import {createParticles,HERO_FX} from './hero-fx.mjs';

// Hero minis: 3D figures for the player characters, standing on their token's base (assets/minis). minis.json says
// which character sheet (a placement's characterProfileId) gets which hero model, and which monster (its monsterId)
// gets which monster model (true size; a monster may have no base, its model floating at the token's height), and
// "names" does the same for a creature with no monster id, by its token's name; a model is fetched only when a
// token of that character is on the board. A mini turns to face the camera, as the flat tokens do, and is hidden
// with its floor above the Height cut. The token's portrait is hidden while its mini stands (class vtt3d-mini);
// its badges, bars and clicks stay on the token, whose box then covers the mini from its base to its head (tops).
const BASE_TOP=.17;
const url=name=>new URL(`./assets/minis/${name}${new URL(import.meta.url).search}`,import.meta.url).href;

// A model with several detail levels (top nodes named *_lod0, *_lod1, ...) is drawn as one, switching by camera
// distance: the finest close up, the lightest far off.
function detailLevels(s){const levels=s.children.filter(c=>/_lod\d+$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name));if(levels.length<2)return s;
 const lod=new THREE.LOD();levels.forEach((c,i)=>{s.remove(c);lod.addLevel(c,[0,4,10,20][i]??i*10);});s.add(lod);return s;}

// How tall a model stands, from its meshes only (particles and glows reach past it). Its detail levels are the same size.
function modelHeight(s){s.updateMatrixWorld(true);const box=new THREE.Box3();s.traverse(o=>{if(o.isMesh&&!/-glow|-fx|-ghost/.test(o.name))box.expandByObject(o);});return box.isEmpty()?1:Math.max(.2,box.max.y);}

export function createMinis(scene){
 const root=new THREE.Group();root.name='vtt-hero-minis';scene.add(root);
 const models=new Map(),standing=new Map();let config=null,configLoad=null,changed=false,time=0;
 const loadConfig=()=>configLoad??=fetch(url('minis.json')).then(r=>r.ok?r.json():null).catch(()=>null).then(c=>{config=c;changed=true;return c;});
 const model=name=>{if(models.has(name))return models.get(name);const entry={template:null,extras:null,failed:false};models.set(name,entry);
  readGlb(url(name+'.glb')).then(({scene:s,extras})=>{s.traverse(o=>{if(!o.isMesh)return;const fx=o.material.userData.additive||o.material.type==='MeshBasicMaterial';const see=o.material.transparent&&!o.material.userData.additive;o.castShadow=!fx&&!see&&!/-glow|-fx|-ghost/.test(o.name);o.receiveShadow=!o.material.userData.additive&&!see;o.renderOrder=o.material.userData.additive?5:see?4:0;});entry.template=detailLevels(s);entry.height=modelHeight(s);for(const fx of HERO_FX[name]||[])entry.template.add(createParticles({...fx,clock:()=>time}));entry.extras=extras;changed=true;})
   .catch(error=>{entry.failed=true;console.warn('[3D board] hero mini not loaded:',name,error);});
  return entry;};
 /**
  * records: board tokens {id,x,y,z,width,height,level}; profiles: id -> {hero: characterProfileId, monster: monsterId}; visible(record) whether
  * its floor is shown; camera: to face. Returns the ids with a mini standing, and whether shadows need redrawing.
  */
 function update(records,profiles,visible,camera,dt=0){
  loadConfig();time+=dt;const seen=new Set();
  const noBase=new Set(),tops=new Map();
  // Most hero tokens carry only their name ("Cal"); like the 2D board, a hero's sheet id as a whole word of it is that hero.
  const heroByName=n=>String(n||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').find(w=>Object.hasOwn(config.heroes||{},w));
  if(config)for(const r of records){const who=profiles.get(r.id)||{},monster=who.mini||config.monsters?.[who.monster]||config.names?.[String(who.name||'').trim().toLowerCase()],name=monster?.model||config.heroes?.[who.hero]||config.heroes?.[heroByName(who.name)];if(!name)continue;if(monster?.noBase)noBase.add(r.id);const entry=model(name);if(!entry.template)continue;
   let mini=standing.get(r.id);if(!mini||mini.userData.model!==name){if(mini)root.remove(mini);mini=entry.template.clone();mini.userData={model:name,extras:entry.extras};standing.set(r.id,mini);root.add(mini);changed=true;}
   const scale=monster?(monster.scale??1):(config.scale||1)*Math.max(r.width,r.height),x=r.x,z=r.y,y=r.z+(monster?.noBase?0:BASE_TOP),yaw=Math.atan2(camera.position.x-x,camera.position.z-z),show=visible(r);
   if(mini.position.x!==x||mini.position.y!==y||mini.position.z!==z||mini.scale.x!==scale||mini.visible!==show)changed=true;
   mini.position.set(x,y,z);mini.scale.setScalar(scale);mini.rotation.y=yaw;mini.visible=show;seen.add(r.id);tops.set(r.id,y+(entry.height||1)*scale);
   // A falling token's model shakes (r.shake, 1 at the start of the fall down to 0), as the flat token's picture did.
   const shake=Number(r.shake)||0;if(shake>0){mini.rotation.z=Math.sin(time*38)*.22*shake;mini.position.x+=Math.sin(time*31)*.05*shake;changed=true;}else if(mini.rotation.z){mini.rotation.z=0;changed=true;}
   // Idle motion from the model's own hint: its glow and effects breathe and turn a little.
   mini.traverse(o=>{if(o.isMesh&&/-fx$/.test(o.name)){o.rotation.y=Math.sin(time*.8)*.25;o.material.opacity=.75+.25*Math.sin(time*5.3+x);}});
  }
  for(const [id,mini] of standing)if(!seen.has(id)){root.remove(mini);standing.delete(id);changed=true;}
  const redraw=changed;changed=false;return {ids:new Set(standing.keys()),noBase,tops,redraw};
 }
 return {update,dispose(){scene.remove(root);for(const e of models.values())e.template?.traverse(o=>{if(o.isPoints){o.geometry.dispose();o.material.dispose();}if(o.isMesh){o.geometry.dispose();o.material.map?.dispose();o.material.emissiveMap?.dispose();o.material.dispose();}});}};
}
