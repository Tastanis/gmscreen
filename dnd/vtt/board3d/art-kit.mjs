import * as THREE from 'three';

// The board's CC0 art kit (assets/kit): models from Quaternius' Stylized Nature MegaKit packed into kit.json +
// kit.bin, and small WebP textures (Quaternius, Poly Haven). See assets/kit/CREDITS.md. Missing files leave the
// board on its plain shapes: loadArtKit then returns null.
const KIT=new URL('./assets/kit/',import.meta.url);
export const kitUrl=name=>new URL(name+new URL(import.meta.url).search,KIT).href;

export async function loadArtKit(renderer){
 try{
  const [json,bin]=await Promise.all([fetch(kitUrl('kit.json')).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}),fetch(kitUrl('kit.bin')).then(r=>{if(!r.ok)throw Error(r.status);return r.arrayBuffer();})]);
  const loader=new THREE.TextureLoader(),textures=new Map(),anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const texture=(file,{srgb=true,repeat=false}={})=>{const key=file+srgb+repeat;if(textures.has(key))return textures.get(key);
   const t=loader.load(kitUrl('textures/'+file));t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=anisotropy;t.flipY=false;
   if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.flipY=true;}textures.set(key,t);return t;};
  // The models' own colour maps (glTF: not flipped), cut out where the leaves are.
  const kitTextures={Bark_NormalTree:'kit-bark.webp',Leaves_NormalTree:'kit-leaves-tree.webp',Bark_TwistedTree:'kit-bark-twisted.webp',Leaves_TwistedTree:'kit-leaves-twisted.webp',Leaves:'kit-leaves.webp',Grass:'kit-grass.webp',Flowers:'kit-flowers.webp',Mushrooms:'kit-mushrooms.webp',Rocks:'kit-rocks.webp',PathRocks:'kit-pathrocks.webp'};
  const materials=new Map();
  const material=(name,colored)=>{const key=name+'|'+colored;if(materials.has(key))return materials.get(key);const spec=json.materials[name]||{};
   const m=new THREE.MeshStandardMaterial({map:kitTextures[name]?texture(kitTextures[name]):null,alphaTest:spec.alphaTest||0,side:THREE.DoubleSide,vertexColors:colored,roughness:.86,metalness:0});
   m.name='kit:'+name;materials.set(key,m);return m;};
  const geometries=new Map();
  // One part of a model as geometry, the model standing on y = 0 at its middle.
  const geometry=(model,index)=>{const key=model+'#'+index;if(geometries.has(key))return geometries.get(key);const m=json.models[model],p=m?.parts[index];if(!p)return null;
   const g=new THREE.BufferGeometry();
   g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(bin,p.position,p.vertices*3),3));
   g.setAttribute('normal',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin,p.normal,p.vertices*4),4),3,0,true));
   if(p.uv!==null)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(bin,p.uv,p.vertices*2),2));
   if(p.color!==null)g.setAttribute('color',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Uint8Array(bin,p.color,p.vertices*4),4),3,0,true));
   g.setIndex(new THREE.BufferAttribute(p.index32?new Uint32Array(bin,p.index,p.indices):new Uint16Array(bin,p.index,p.indices),1));
   g.translate(-(m.min[0]+m.max[0])/2,-m.min[1],-(m.min[2]+m.max[2])/2);g.computeBoundingSphere();geometries.set(key,g);return g;};
  return {
   models:Object.keys(json.models),
   size(model){const m=json.models[model];return m&&{x:m.max[0]-m.min[0],y:m.max[1]-m.min[1],z:m.max[2]-m.min[2]};},
   parts(model){const m=json.models[model];return m?m.parts.map((p,i)=>({geometry:geometry(model,i),material:material(p.material,p.color!==null),name:p.material})):[];},
   texture,
   dispose(){for(const g of geometries.values())g.dispose();for(const m of materials.values())m.dispose();for(const t of textures.values())t.dispose();},
  };
 }catch(error){console.warn('[3D board] art kit not loaded; plain shapes are drawn',error);return null;}
}
