import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { prepareEffects } from './silverquill-effects.js';

// Placement from the approved district study, in campus units. Bounds also reserve
// the enlarged lots before network assets arrive.
const sites = {
  "Grandloft Hall": { slug: 'grandloft-hall', scale: 11.298499, bounds: [-134.38, -132.19, 134.38, 167.81], height: 181.45 },
  "Rose Stage": { slug: 'rose-stage', scale: 7.21831, bounds: [-102.5, -102.5, 102.5, 102.5], height: 100.51 },
  "Dramatorium": { slug: 'dramatorium', scale: 10.034586, bounds: [-80.38, -137.5, 80.38, 137.5], height: 128.85 },
  "Vellum Gargoyle Gate": { slug: 'vellum-gargoyle-gate', scale: 6.906579, bounds: [-95, -31.69, 95, 33.21], height: 130.26 },
  "Inkfall Streets": { slug: 'inkfall-streets', scale: 6.854839, bounds: [-37.68, -42.5, 37.68, 42.5], height: 53.21 },
  "Hecklebox Balcony": { slug: 'hecklebox-balcony', scale: 4.327273, bounds: [-35.7, -35.7, 35.7, 35.7], height: 23.76 },
  "Annex of Addenda": { slug: 'annex-of-addenda', scale: 5.509554, bounds: [-77.07, -89.81, 77.07, 83.19], height: 78.04 },
  "Umbral Blade Loom": { slug: 'umbral-blade-loom', scale: 13.094162, bounds: [-59.97, -59.97, 59.97, 59.97], height: 112.74 },
  "Whispertube Tenements": { slug: 'whispertube-tenements', scale: 5.459057, bounds: [-55, -50.86, 55, 50.77], height: 60.16 },
  "Spotlight Lance Plaza": { slug: 'spotlight-lance-plaza', scale: 0.85, bounds: [-42.08, -42.08, 42.08, 42.08], height: 65.5 },
  "Illumination Hall": { slug: 'illumination-hall', scale: 5.439331, bounds: [-59.29, -67.18, 59.29, 62.82], height: 84.42 },
  "Vainglory": { slug: 'vainglory', scale: 5.243446, bounds: [-52.43, -56, 52.43, 56], height: 54.07 },
  "Clause Net Driftways": { slug: 'clause-net-driftways', scale: 6.205241, bounds: [-64.5, -61.25, 64.5, 61.25], height: 55.21 },
  "Strixhaven Star": { slug: 'strixhaven-star', scale: 3.709609, bounds: [-33.2, -25.51, 33.2, 30.92], height: 54.57 },
  "Arbitration Steps": { slug: 'arbitration-steps', scale: 10, bounds: [-36.8, -442.15, 36.8, 398], height: 236.7 },
  "Sealwright Foundry": { slug: 'sealwright-foundry', scale: 4.207326, bounds: [-35.76, -44.18, 35.76, 45.07], height: 50.57 },
  "Meterworks Stage": { slug: 'meterworks-stage', scale: 5.322714, bounds: [-46.11, -78, 46.11, 78], height: 71.85 },
  "Ashgrave Mannor": { slug: 'ashgrave-mannor', scale: 9.097236, bounds: [-66.77, -66.77, 66.77, 69.82], height: 139.97 },
  "Clarentine's House": { slug: 'clarentine-s-house', scale: 6.121368, bounds: [-18.5, -18.5, 18.5, 18.5], height: 29.64 },
  "Ewfall Guardens": { slug: 'ewfall-guardens', scale: 5.822785, bounds: [-103.35, -103.5, 103.35, 103.5], height: 30.05 },
  "Inkling Hatchery Vats": { slug: 'inkling-hatchery-vats', scale: 7, bounds: [-86.87, -112, 82.49, 112], height: 87.64 },
  "Inkwell Lake": { slug: 'inkwell-lake', scale: 0.85, bounds: [-117.3, -134.3, 117.3, 117.3], height: 76.84 },
};
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const assets = new Map();
function asset(slug, far) {
  const url = 'models/silverquill-v3/' + slug + (far ? '-far' : '') + '.glb';
  if (!assets.has(url)) assets.set(url, loader.loadAsync(url).catch(error => {
    assets.delete(url);
    throw error;
  }));
  return assets.get(url);
}

export function markSilverquillLot(group, name) {
  const site = sites[name], [x0,z0,x1,z1] = site.bounds;
  const pad = new THREE.Mesh(new THREE.BoxGeometry((x1-x0)/group.scale.x, .55, (z1-z0)/group.scale.x),
    new THREE.MeshStandardMaterial({ color: 0x48424c, roughness: .82 }));
  pad.position.set((x1+x0)/2/group.scale.x,.27,((z1+z0)/2-(name==='Arbitration Steps'?398:0))/group.scale.x);
  group.add(pad);
}

export function reserveSilverquill(things) {
  return things.flatMap(t => {
    const s = sites[t.name];
    if (!s) return [];
    const angle = t.group.rotation.y, c = Math.cos(angle), n = Math.sin(angle);
    return [{ x:t.x, z:t.z, bounds:s.bounds, c,n, offset:t.name==='Arbitration Steps'?398:0 }];
  });
}
export function isReserved(lots, x, z) {
  return lots.some(lot => {
    const dx=x-lot.x, dz=z-lot.z-lot.offset;
    const a=lot.c*dx-lot.n*dz, b=lot.n*dx+lot.c*dz, [x0,z0,x1,z1]=lot.bounds;
    return a>x0-5 && a<x1+5 && b>z0-5 && b<z1+5;
  });
}

// Fit repeatable street sections along the surveyed routes. Neighborhood houses
// are instanced separately, so bends and intersections retain their original lots.
function streetPieces(t) {
  const { paths,width } = t.group.userData.silverquillStreet;
  const pieces=[], scale=width/3.74;
  for (const path of paths) for (let i=1;i<path.length;i++) {
    const [x,z]=path[i-1], dx=path[i][0]-x, dz=path[i][1]-z;
    const length=Math.hypot(dx,dz), count=Math.max(1,Math.round(length/(12.4*scale)));
    for(let k=0;k<count;k++) {
      const u=(k+.5)/count;
      pieces.push({x:x+dx*u-t.x,z:z+dz*u-t.z,angle:Math.atan2(dx,dz),sx:scale,sz:length/(12.4*count)});
    }
  }
  return pieces;
}

export function installSilverquill(things, camera, renderer, anim) {
  for (const t of things) {
    const site=sites[t.name], street=t.group.userData.silverquillStreet;
    if (!site && !street) continue;
    const slug=site?.slug || street.slug;
    const base=t.group, fallback=[...base.children], pieces=street?streetPieces(t):null;
    const state={ far:null, close:null, loading:new Set(), retry:{}, effects:[] };
    const range=site?Math.max(175,Math.min(640,Math.max(site.bounds[2]-site.bounds[0],site.bounds[3]-site.bounds[1])*3.1)):490;
    const center=new THREE.Vector3(t.x,base.position.y+(site?.height||40)*.35,t.z);
    if (slug==='arbitration-steps') center.z+=398;
    async function mount(far) {
      const tier=far?'far':'close';
      if(state[tier]||state.loading.has(tier)||performance.now()<(state.retry[tier]||0))return;
      state.loading.add(tier);
      try {
        const gltf=await asset(slug,far), root=new THREE.Group(), effects=[];
        const placements=pieces||[{x:0,z:slug==='arbitration-steps'?-398:0,angle:0,sx:site.scale/base.scale.x,sz:site.scale/base.scale.x}];
        for(const [i,p] of placements.entries()) {
          const pivot=new THREE.Group(), model=gltf.scene.clone(true);
          pivot.position.set(p.x,0,p.z);pivot.rotation.y=p.angle;pivot.scale.set(p.sx,p.sx,p.sz);
          pivot.add(model);root.add(pivot);model.animations=gltf.animations;
          model.traverse(o=>{
            if(o.isMesh){o.receiveShadow=true;o.castShadow=!o.material.transparent;}
            if(o.isLight){o.visible=!far;o.distance*=p.sx;o.intensity*=p.sx*p.sx;}
          });
          if(!far){
            const fx=await prepareEffects(slug,model,renderer,p.sx);
            if(fx.moving)effects.push({fx,phase:i*2.31});
          }
        }
        root.name='Silverquill '+tier+' '+slug;
        const first=!state.far&&!state.close;
        if(first){for(const o of fallback)base.remove(o);t.mats.length=0;}
        base.add(root);state[tier]=root;
        if(!far)state.effects=effects;
        root.traverse(o=>{if(o.material?.emissive){o.material.userData.e0=o.material.emissive.clone();t.mats.push(o.material);}});
        switchTier(camera.position.distanceTo(center));
        base.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;
      }catch(e){state.retry[tier]=performance.now()+30000;console.warn('Silverquill '+slug+' '+tier,e);}
      finally{state.loading.delete(tier);}
    }
    function switchTier(distance) {
      const near=!!state.close && (!state.far || distance < range*(state.close.visible?1.14:1));
      if(state.close&&state.close.visible!==near)renderer.shadowMap.needsUpdate=true;
      if(state.close)state.close.visible=near;
      if(state.far)state.far.visible=!near;
    }
    mount(true);
    anim.push(time=>{
      const d=camera.position.distanceTo(center);
      if(!state.far)mount(true);
      if(d<range*1.2&&!state.close)mount(false);
      switchTier(d);
      if(state.close?.visible && base.visible)for(const {fx,phase} of state.effects)fx.update(time+phase);
    });
  }
}

const houseTypes=['violetspire-tower','obsidian-manor','angelic-tower','angelic-cathedral'];
export function installSilverquillHouses(houses, boxes, ground, scene, camera, renderer, anim) {
  const group=new THREE.Group();group.name='Silverquill neighborhoods';scene.add(group);
  const lots=houseTypes.map((_,i)=>houses.filter(h=>(h.dark?0:2)+(h.tall?0:1)===i));
  const tiers=houseTypes.map(()=>({})), pending=new Set(), retry=new Map();
  const projection=new THREE.Matrix4(),frustum=new THREE.Frustum(),ball=new THREE.Sphere(),matrix=new THREE.Matrix4();
  const previous=new THREE.Vector3(Infinity,0,0),rotation=new THREE.Quaternion();
  let dirty=true,ready=false;
  async function load(i,far) {
    const tier=far?'far':'close',key=i+tier;
    if(tiers[i][tier]||pending.has(key)||performance.now()<(retry.get(key)||0))return;
    pending.add(key);
    try{
      const template=(await asset(houseTypes[i],far)).scene;
      template.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(template), size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      const unit=new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z);
      const parts=[];
      template.traverse(o=>{if(o.isMesh){
        const batch=new THREE.InstancedMesh(o.geometry,o.material,lots[i].length);
        batch.count=0;batch.castShadow=batch.receiveShadow=true;batch.raycast=()=>{};batch.frustumCulled=false;
        group.add(batch);parts.push({batch,local:unit.clone().multiply(o.matrixWorld)});
      }});
      tiers[i][tier]={parts,width:Math.max(size.x,size.z)};dirty=true;
      if(!ready&&tiers.every(v=>v.far)){
        for(const box of boxes){scene.remove(box);box.dispose();}
        ready=true;window.__sqHouses=houses.length;
      }
    }catch(e){retry.set(key,performance.now()+30000);console.warn('Silverquill houses '+houseTypes[i],e);}
    finally{pending.delete(key);}
  }
  houseTypes.forEach((_,i)=>load(i,true));
  const pose=new THREE.Object3D(),origin=new THREE.Vector3();
  anim.push(()=>{
    if(!ready){houseTypes.forEach((_,i)=>load(i,true));return;}
    if(!dirty&&camera.position.distanceToSquared(previous)<2&&rotation.angleTo(camera.quaternion)<.008)return;
    previous.copy(camera.position);rotation.copy(camera.quaternion);dirty=false;
    camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    lots.forEach((list,i)=>{
      const counts={far:0,close:0};
      for(const lot of list){
        origin.set(lot.x,ground,lot.z);ball.center.copy(origin);ball.center.y+=19;ball.radius=44;
        if(!frustum.intersectsSphere(ball))continue;
        const near=camera.position.distanceToSquared(ball.center)<210*210;
        if(near&&!tiers[i].close)load(i,false);
        const key=near&&tiers[i].close?'close':'far',tier=tiers[i][key];
        const scale=(i%2?27.5:21)*(lot.k||1)*(lot.street?1.15:1)/tier.width;
        pose.position.copy(origin);pose.rotation.y=lot.face;pose.scale.setScalar(scale);pose.updateMatrix();
        for(const part of tier.parts)part.batch.setMatrixAt(counts[key],matrix.multiplyMatrices(pose.matrix,part.local));counts[key]++;
      }
      for(const [key,tier] of Object.entries(tiers[i]))for(const {batch} of tier.parts){batch.count=counts[key];batch.instanceMatrix.needsUpdate=true;}
    });
    renderer.shadowMap.needsUpdate=true;
  });
}
