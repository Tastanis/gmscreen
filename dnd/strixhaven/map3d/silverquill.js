import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { prepareEffects } from './silverquill-effects.js';

// Placement from the approved district study, in campus units. Bounds also reserve
// the enlarged lots before network assets arrive.
const sites = {
  "Grandloft Hall": { slug: 'grandloft-hall', scale: 11.298499, bounds: [-134.38, -132.19, 134.38, 167.81], height: 181.45 },
  "Rose Stage": { slug: 'rose-stage', scale: 7.21831, bounds: [-102.5, -102.5, 102.5, 102.5], height: 100.51 },
  "Dramatorium": { slug: 'dramatorium', scale: 4.013834, bounds: [-32.152, -55.0, 32.152, 55.0], height: 51.54 },
  "Vellum Gargoyle Gate": { slug: 'vellum-gargoyle-gate', scale: 6.906579, bounds: [-95, -31.69, 95, 33.21], height: 130.26 },
  "Inkfall Streets": { slug: 'inkfall-streets', scale: 6.854839, bounds: [-37.68, -42.5, 37.68, 42.5], height: 53.21 },
  "Hecklebox Balcony": { slug: 'hecklebox-balcony', scale: 4.327273, bounds: [-35.7, -35.7, 35.7, 35.7], height: 23.76 },
  "Annex of Addenda": { slug: 'annex-of-addenda', scale: 5.509554, bounds: [-77.07, -89.81, 77.07, 83.19], height: 78.04 },
  "Umbral Blade Loom": { slug: 'umbral-blade-loom', scale: 13.094162, bounds: [-59.97, -59.97, 59.97, 59.97], height: 112.74 },
  "Whispertube Tenements": { slug: 'whispertube-tenements', scale: 5.459057, bounds: [-55, -50.86, 55, 50.77], height: 60.16 },
  "Spotlight Lance Plaza": { slug: 'spotlight-lance-plaza', scale: 0.85, bounds: [-42.08, -42.08, 42.08, 42.08], height: 65.5 },
  "Illumination Hall": { slug: 'illumination-hall', scale: 5.439331, bounds: [-59.29, -67.18, 59.29, 62.82], height: 84.42 },
  "Vainglory": { slug: 'vainglory', scale: 5.243446, bounds: [-52.43, -56, 52.43, 56], height: 54.07 },
  "Strixhaven Star": { slug: 'strixhaven-star', scale: 3.709609, bounds: [-33.2, -25.51, 33.2, 30.92], height: 54.57 },
  "Arbitration Steps": { slug: 'arbitration-steps', scale: 6.2, bounds: [-26.04, -86.65, 26.04, 83.08], height: 77.07 },
  "Sealwright Foundry": { slug: 'sealwright-foundry', scale: 4.207326, bounds: [-35.76, -44.18, 35.76, 45.07], height: 50.57 },
  "Meterworks Stage": { slug: 'meterworks-stage', scale: 5.322714, bounds: [-46.11, -78, 46.11, 78], height: 71.85 },
  "Ashgrave Mannor": { slug: 'ashgrave-mannor', scale: 9.097236, bounds: [-66.77, -66.77, 66.77, 69.82], height: 139.97 },
  "Clarentine's House": { slug: 'clarentine-s-house', scale: 6.121368, bounds: [-18.5, -18.5, 18.5, 18.5], height: 29.64 },
  "Inkling Hatchery Vats": { slug: 'inkling-hatchery-vats', scale: 2.333333, bounds: [-28.957, -37.333, 27.497, 37.333], height: 29.213 },
  "Inkwell Lake": { slug: 'inkwell-lake', scale: 0.85, bounds: [-117.3, -134.3, 117.3, 117.3], height: 76.84 },
};
// Local Z of the first tread and the center of the crowned summit landing.
export function configureArbitrationSteps(foot, summit){
  const first=13.4, last=-10.75;
  const dx=foot[0]-summit[0], dz=foot[1]-summit[1], length=Math.hypot(dx,dz);
  const site=sites['Arbitration Steps'], depthScale=length/(first-last);
  site.depthScale=depthScale;
  site.bounds=[-26.04,-13.9748*depthScale,26.04,first*depthScale];
  return {center:[foot[0]-dx*first/(first-last),foot[1]-dz*first/(first-last)],angle:Math.atan2(dx,dz)};
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const assets = new Map();
function asset(slug, far) {
  const url = 'models/silverquill-v3/' + slug + (far ? '-far' : '') + '.glb?city=4';
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
  pad.position.set((x1+x0)/2/group.scale.x,.27,(z1+z0)/2/group.scale.x);
  group.add(pad);
}

export function reserveSilverquill(things) {
  return things.flatMap(t => {
    const s = sites[t.name];
    if (!s) return [];
    const angle = t.group.rotation.y, c = Math.cos(angle), n = Math.sin(angle);
    return [{ x:t.x, z:t.z, bounds:s.bounds, c,n }];
  });
}
// Reroute the diagonal parcel grid around these two open-ended street models.
// Work in each model's local axes so the court and its two entrances stay aligned.
export function courtyardRoads(things) {
  const ground = .405;
  const vertices = [], cuts = [];
  for (const [name, deckHeight, deckDepth, entranceWidth, verge, width] of [
    ['Whispertube Tenements', .33, 18.6, 16, 1.5, 6], ['Inkfall Streets', .36, 12.4, 18, .9, 4.5],
  ]) {
    const t = things.find(t => t.name === name);
    if (!t) continue;
    const site = sites[name], [xmin,zmin,xmax,zmax] = site.bounds;
    const c = Math.cos(t.group.rotation.y), s = Math.sin(t.group.rotation.y);
    const world = (x,z) => [t.x+c*x+s*z,t.z-s*x+c*z];
    const left=xmin-verge-width, right=xmax+verge+width;
    const back=zmin-verge-width, front=zmax+verge+width;
    const bevel=1.5*width; // Leave the diagonal neighboring parcels clear at the corners.
    const corners=[world(left+bevel,back),world(right-bevel,back),world(right,back+width),world(right,front-width),
      world(right-bevel,front),world(left+bevel,front),world(left,front-width),world(left,back+width)];
    cuts.push({corners,xmin:Math.min(...corners.map(p=>p[0])),xmax:Math.max(...corners.map(p=>p[0])),
      zmin:Math.min(...corners.map(p=>p[1])),zmax:Math.max(...corners.map(p=>p[1]))});

    function face(points,y0=ground,y1=ground) {
      const quad=points.map(([x,z])=>world(x,z));
      for(const i of [0,2,1,0,3,2])vertices.push(quad[i][0],i<2?y0:y1,quad[i][1]);
    }
    function strip(x0,x1,z0,z1,y0,y1) {
      face([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],y0,y1);
    }
    strip(left,left+width,back+width,front-width);
    strip(right-width,right,back+width,front-width);
    const half=entranceWidth/2, top=deckHeight*site.scale;
    face([[left+bevel,back],[-half,back],[-half,back+width],[left,back+width]]);
    face([[half,back],[right-bevel,back],[right,back+width],[half,back+width]]);
    face([[left,front-width],[-half,front-width],[-half,front],[left+bevel,front]]);
    face([[half,front-width],[right,front-width],[right-bevel,front],[half,front]]);
    // The centre of each frontage rises from the curb to the model's own pavement.
    strip(-half,half,back,back+width/2);
    strip(-half,half,back+width/2,-deckDepth*site.scale/2,ground,top);
    strip(-half,half,deckDepth*site.scale/2,front-width/2,top,ground);
    strip(-half,half,front-width/2,front);
  }
  function clip(quad) {
    let pieces=[quad];
    for(const cut of cuts) {
      if(quad.every(p=>p[0]<=cut.xmin)||quad.every(p=>p[0]>=cut.xmax)||
         quad.every(p=>p[1]<=cut.zmin)||quad.every(p=>p[1]>=cut.zmax))continue;
      const outside=[];
      for(let polygon of pieces) {
        // Peel off the part outside each curb. Only the final interior is discarded.
        for(let i=0;i<cut.corners.length&&polygon.length;i++){
          const a=cut.corners[i],b=cut.corners[(i+1)%cut.corners.length],inside=[],off=[];
          const side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
          let prev=polygon[polygon.length-1],d0=side(prev);
          for(const p of polygon){
            const d1=side(p);
            if((d0<0)!==(d1<0)){
              const u=d0/(d0-d1),hit=[prev[0]+u*(p[0]-prev[0]),prev[1]+u*(p[1]-prev[1])];
              inside.push(hit);off.push(hit);
            }
            (d1<0?off:inside).push(p);prev=p;d0=d1;
          }
          if(off.length>=3)outside.push(off);
          polygon=inside;
        }
      }
      pieces=outside;
    }
    return pieces;
  }
  return {vertices,clip};
}

export function isReserved(lots, x, z) {
  return lots.some(lot => {
    const dx=x-lot.x, dz=z-lot.z;
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
  const view=new THREE.Frustum(), projection=new THREE.Matrix4();
  anim.push(()=>view.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)));
  for (const t of things) {
    const site=sites[t.name], street=t.group.userData.silverquillStreet;
    if (!site && !street) continue;
    const slug=site?.slug || street.slug;
    const base=t.group, fallback=[...base.children], pieces=street?streetPieces(t):null;
    const state={ far:null, close:null, loading:new Set(), retry:{}, effects:[], lastNear:0, closeMaterials:new Set() };
    const range=site?Math.max(680,Math.min(1400,Math.max(site.bounds[2]-site.bounds[0],site.bounds[3]-site.bounds[1])*5.5)):850;
    const center=new THREE.Vector3(t.x,base.position.y+(site?.height||40)*.35,t.z);
    const vicinity=site && !street ? new THREE.Sphere(center,Math.hypot(
      Math.max(Math.abs(site.bounds[0]),site.bounds[2]),Math.max(Math.abs(site.bounds[1]),site.bounds[3]),site.height)+35) : null;
    async function mount(far) {
      const tier=far?'far':'close';
      if(state[tier]||state.loading.has(tier)||performance.now()<(state.retry[tier]||0))return;
      state.loading.add(tier);
      try {
        const owned=site && !street && !far;
        const gltf=owned ? await loader.loadAsync('models/silverquill-v3/'+slug+'.glb?city=4') : await asset(slug,far), root=new THREE.Group(), effects=[];
        const placements=pieces||[{x:0,z:0,angle:0,sx:site.scale/base.scale.x,sz:(site.depthScale??site.scale)/base.scale.x}];
        for(const [i,p] of placements.entries()) {
          const pivot=new THREE.Group(), model=owned?gltf.scene:gltf.scene.clone(true);
          pivot.position.set(p.x,0,p.z);pivot.rotation.y=p.angle;pivot.scale.set(p.sx,p.sx,p.sz);
          pivot.add(model);root.add(pivot);model.animations=gltf.animations;
          model.traverse(o=>{
            if(o.isMesh){o.receiveShadow=true;o.castShadow=!o.material.transparent;}
            if(o.isLight){o.visible=!far;o.distance*=p.sx;o.intensity*=p.sx*p.sx;}
          });
          if(!far){
            const fx=await prepareEffects(slug,model,renderer,p.sx);
            if(owned||fx.moving)effects.push({fx,phase:i*2.31});
          }
        }
        root.name='Silverquill '+tier+' '+slug;
        const first=!state.far&&!state.close;
        if(first){for(const o of fallback)base.remove(o);fallback.length=0;t.mats.length=0;}
        base.add(root);state[tier]=root;
        base.updateWorldMatrix(true,true);
        root.userData.pickBounds=new THREE.Box3().setFromObject(root).expandByScalar(18);
        if(!far){state.effects=effects;state.lastNear=performance.now();}
        root.traverse(o=>{if(o.material?.emissive){o.material.userData.e0=o.material.emissive.clone();t.mats.push(o.material);if(owned)state.closeMaterials.add(o.material);}});
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
      base.userData.pickTier=near?state.close:state.far;
    }
    function releaseClose() {
      const root=state.close;
      base.remove(root);
      t.mats=t.mats.filter(m=>!state.closeMaterials.has(m));
      state.closeMaterials.clear();
      for(const {fx} of state.effects)fx.dispose();
      state.effects=[];
      const geometry=new Set(),materials=new Set(),textures=new Set();
      root.traverse(o=>{
        if(o.geometry)geometry.add(o.geometry);
        if(o.material)for(const m of [].concat(o.material))materials.add(m);
      });
      for(const m of materials){for(const x of Object.values(m))if(x?.isTexture)textures.add(x);m.dispose();}
      for(const g of geometry)g.dispose();
      for(const tex of textures)tex.dispose();
      state.close=null;
    }
    mount(true);
    anim.push(time=>{
      const d=camera.position.distanceTo(center);
      if(!state.far)mount(true);
      if(d<range*1.2&&!state.close&&base.layers.test(camera.layers)&&(!vicinity||view.intersectsSphere(vicinity)))mount(false);
      switchTier(d);
      if(site&&!street&&state.close&&state.far){
        if(d<range*2)state.lastNear=performance.now();
        else if(performance.now()-state.lastNear>60000)releaseClose();
      }
      if(state.close?.visible && base.visible)for(const {fx,phase} of state.effects)fx.update(time+phase);
    });
  }
}

const houseTypes=['violetspire-tower','obsidian-manor','angelic-tower','angelic-cathedral'];
// Shared authoring origin and span keep both LODs and roof attachments in register.
const houseFrames=[
  {x:-.341285,z:.27605,width:6.98530},
  {x:.195785,z:.56588,width:6.64547},
  {x:0,z:.650715,width:5.79597},
  {x:.00203,z:.40838,width:7.76064}
];
export function installSilverquillHouses(houses, boxes, ground, scene, camera, renderer, anim, driftways) {
  const group=new THREE.Group();group.name='Silverquill neighborhoods';scene.add(group);
  const lots=houseTypes.map((_,i)=>houses.filter(h=>(h.dark?0:2)+(h.tall?0:1)===i));
  const tiers=houseTypes.map(()=>({})), pending=new Set(), retry=new Map();
  const projection=new THREE.Matrix4(),frustum=new THREE.Frustum(),ball=new THREE.Sphere(),matrix=new THREE.Matrix4();
  const previous=new THREE.Vector3(Infinity,0,0),rotation=new THREE.Quaternion();
  let dirty=true,ready=false;
  async function load(i,tier) {
    const key=i+tier;
    if(tiers[i][tier]||pending.has(key)||performance.now()<(retry.get(key)||0))return;
    pending.add(key);
    try{
      const template=(await asset(houseTypes[i]+(tier==='distant'?'-distant':''),tier==='far')).scene;
      template.updateMatrixWorld(true);
      const frame=houseFrames[i];
      const unit=new THREE.Matrix4().makeTranslation(-frame.x,0,-frame.z);
      const parts=[];
      template.traverse(o=>{if(o.isMesh){
        const batch=new THREE.InstancedMesh(o.geometry,o.material,lots[i].length);
        batch.count=0;batch.castShadow=batch.receiveShadow=true;batch.raycast=()=>{};batch.frustumCulled=false;
        batch.name=houseTypes[i]+' '+tier;group.add(batch);parts.push({batch,local:unit.clone().multiply(o.matrixWorld)});
      }});
      tiers[i][tier]={parts,width:frame.width};dirty=true;
      if(!ready&&tiers.every(v=>v.distant||v.far)){
        for(const box of boxes){scene.remove(box);box.dispose();}
        ready=true;window.__sqHouses=houses.length;
        if(driftways)installDriftways(driftways,houses,ground,renderer).catch(error=>console.warn('Silverquill Driftways',error));
      }
    }catch(e){retry.set(key,performance.now()+30000);console.warn('Silverquill houses '+houseTypes[i],e);if(tier==='distant')load(i,'far');}
    finally{pending.delete(key);}
  }
  houseTypes.forEach((_,i)=>load(i,'distant'));
  let prevHeight=0,prevZoom=0;
  const pose=new THREE.Object3D(),origin=new THREE.Vector3();
  const memberships=lots.map(list=>new Uint8Array(list.length));
  anim.push(()=>{
    if(!ready){houseTypes.forEach((_,i)=>load(i,'distant'));return;}
    if(!dirty&&prevHeight===renderer.domElement.clientHeight&&prevZoom===camera.zoom&&camera.position.distanceToSquared(previous)<2&&rotation.angleTo(camera.quaternion)<.008)return;
    prevHeight=renderer.domElement.clientHeight;prevZoom=camera.zoom;
    previous.copy(camera.position);rotation.copy(camera.quaternion);dirty=false;
    camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const midDistance=1650*Math.max(1,renderer.domElement.clientHeight/900)*camera.zoom;
    let changed=false;
    lots.forEach((list,i)=>{
      const members=memberships[i];let rebuild=false;
      for(let j=0;j<list.length;j++){
        const lot=list[j];origin.set(lot.x,ground,lot.z);ball.center.copy(origin);ball.center.y+=19;ball.radius=44;
        let level=0;
        if(frustum.intersectsSphere(ball)){
          const distance=camera.position.distanceToSquared(ball.center),near=distance<780*780;
          const midRange=midDistance*(members[j]>=2?1.12:1);
          if(near&&!tiers[i].close)load(i,'close');
          if(distance<(midDistance*1.15)**2&&!tiers[i].far)load(i,'far');
          level=near&&tiers[i].close?3:tiers[i].far&&(distance<midRange*midRange||!tiers[i].distant)?2:1;
        }
        if(level!==members[j]){members[j]=level;rebuild=true;}
      }
      if(!rebuild)return;
      changed=true;
      const counts={distant:0,far:0,close:0};
      for(let j=0;j<list.length;j++){
        if(!members[j])continue;
        const lot=list[j],key=['','distant','far','close'][members[j]],tier=tiers[i][key];
        origin.set(lot.x,ground,lot.z);
        const scale=houseSpan(lot)/tier.width;
        pose.position.copy(origin);pose.rotation.y=lot.face;pose.scale.setScalar(scale);pose.updateMatrix();
        for(const part of tier.parts)part.batch.setMatrixAt(counts[key],matrix.multiplyMatrices(pose.matrix,part.local));counts[key]++;
      }
      for(const [key,tier] of Object.entries(tiers[i]))for(const {batch} of tier.parts){batch.count=counts[key];batch.instanceMatrix.needsUpdate=true;}
    });
    if(changed)renderer.shadowMap.needsUpdate=true;
  });
}

// Spin the Driftways between the roofs of the occupied street lots.
async function installDriftways(thing, houses, ground, renderer) {
  const lots = houses.filter(h => !h.dark && Math.hypot(h.x-thing.x,h.z-thing.z)<106)
    .sort((a,b)=>Math.hypot(a.x-thing.x,a.z-thing.z)-Math.hypot(b.x-thing.x,b.z-thing.z)).slice(0,19);
  // Roof-space attachment points measured on the city=4 close meshes,
  // with the same off-center downward ray used to lay out these strands.
  const roofHits=[[.5463867192,4.5420590863,1.11437744],[.811765136,6.033203125,1.02930664]];
  const anchors = lots.map(lot => {
    const frame=houseFrames[lot.tall?2:3], scale=houseSpan(lot)/frame.width;
    const v=new THREE.Vector3().fromArray(roofHits[lot.tall?0:1]).sub(new THREE.Vector3(frame.x,0,frame.z)).multiplyScalar(scale);
    v.applyAxisAngle(new THREE.Vector3(0,1,0),lot.face);
    return {lot, point:v.add(new THREE.Vector3(lot.x-thing.x,ground-thing.group.position.y,lot.z-thing.z))};
  }).filter(Boolean);
  const strands=[], ties=[];
  function cord(a,b,sag,width){
    const path=new THREE.QuadraticBezierCurve3(a,a.clone().lerp(b,.5).add(new THREE.Vector3(0,-2*sag,0)),b);
    strands.push(new THREE.TubeGeometry(path,10,width,4,false));
    return path;
  }
  const edges=[];
  anchors.forEach(({point:a,lot},i)=>{
    const nearest=anchors.slice(0,i).map(({point:b},j)=>({b,j,d:a.distanceTo(b)})).filter(n=>n.d<79).sort((m,n)=>m.d-n.d).slice(0,2);
    nearest.forEach(({b,j,d},k)=>{
      const strand=cord(a,b,d*.085,.17);
      const lower=cord(a,b,d*.16,.11);
      for(let n=1;n<5;n++)cord(strand.getPoint(n/5),lower.getPoint((n-.45)/5),.38,.082);
      if(edges[j]&&k===0)cord(strand.getPoint(.39),edges[j].getPoint(.55),1.3,.105);
      edges[i]=strand;
    });
    if(i%4===0){
      const x=lot.x-thing.x+Math.sin(lot.face)*(houseSpan(lot)*.54+1.2),z=lot.z-thing.z+Math.cos(lot.face)*(houseSpan(lot)*.54+1.2);
      const pin=new THREE.Vector3(x,ground-thing.group.position.y+.55,z);cord(a,pin,1.5,.14);
      ties.push(new THREE.CylinderGeometry(.4,.72,.95,6).translate(pin.x,pin.y-.24,pin.z));
    }
  });
  const add=(parts,mat,name)=>{if(!parts.length)return;const mesh=new THREE.Mesh(mergeGeometries(parts),mat);mesh.name=name;thing.group.add(mesh);parts.forEach(g=>g.dispose());};
  add(strands,new THREE.MeshStandardMaterial({color:0xe1d2ff,emissive:0x8c66b5,emissiveIntensity:.64,roughness:.47}),'Roof and street filaments');
  add(ties,new THREE.MeshStandardMaterial({color:0x816846,roughness:.65}),'Pavement anchors');
  thing.group.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;
}
function houseSpan(lot){return (lot.tall?21:27.5)*(lot.k||1)*(lot.street?1.15:1);}


// Convex footprints and flat-topped hexes intersect if they overlap on every edge normal.
export function footprintHexes(name,at,angle,radius,hexAt,worldToHex){
  const [x0,z0,x1,z1]=sites[name].bounds, c=Math.cos(angle),s=Math.sin(angle);
  const corners=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>[c*x+s*z,-s*x+c*z]);
  const hex=Array.from({length:6},(_,i)=>[radius*Math.cos(i*Math.PI/3),radius*Math.sin(i*Math.PI/3)]);
  const axes=[[c,-s],[s,c],...[0,1,2].map(i=>[Math.cos((i+.5)*Math.PI/3),Math.sin((i+.5)*Math.PI/3)])];
  const center=worldToHex(...at),result=[];
  for(let q=center.q-2;q<=center.q+2;q++)for(let r=center.r-2;r<=center.r+2;r++){
    const tile=hexAt(q,r), dx=tile.x-at[0],dz=tile.z-at[1];
    if(axes.every(([a,b])=>{
      const lo=corners.map(([x,z])=>a*x+b*z), hi=hex.map(([x,z])=>a*(x+dx)+b*(z+dz));
      return Math.max(...lo)>Math.min(...hi)+.01&&Math.max(...hi)>Math.min(...lo)+.01;
    }))result.push([q,r]);
  }
  return result;
}
