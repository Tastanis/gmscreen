import * as THREE from 'three';
import {MeshoptDecoder} from './lib/meshopt_decoder.module.js';
import {shrinkBitmap} from './quality.mjs';

// A small reader for plain .glb files (glTF 2.0 binary): meshes with POSITION, NORMAL, COLOR_0, TEXCOORD_0 and
// indices, the node tree with its transforms, PNG/JPEG images stored in the file, metallic-roughness materials,
// KHR_materials_unlit, alphaMode BLEND (alpha may come from a 4-part COLOR_0) with extras.blending "additive", and
// extras.ghost (see-through, still writing depth, drawn in one pass). Packed files read too: geometry compressed with
// meshoptimizer (EXT_/KHR_meshopt_compression, as gltfpack writes), smaller number types (KHR_mesh_quantization),
// WebP pictures (EXT_texture_webp) and KHR_texture_transform. No Draco, KTX2, skins or animation: what the board's
// hero minis and map art use. Returns {scene, extras} (the root node's extras).
const COMPONENT={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};

export async function readGlb(url){
 const buffer=await fetch(url).then(r=>{if(!r.ok)throw Error(`${url}: ${r.status}`);return r.arrayBuffer();});
 const view=new DataView(buffer);if(view.getUint32(0,true)!==0x46546c67)throw Error(`${url} is not a .glb`);
 let offset=12,json=null,bin=null;
 while(offset<buffer.byteLength){const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);
  if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset+8,length)));else if(type===0x004e4942)bin=buffer.slice(offset+8,offset+8+length);
  offset+=8+length;}
 if(!json)throw Error(`${url} has no glTF JSON`);
 // A view packed with meshoptimizer is unpacked once into a buffer of its own; every other view is read from the file's binary chunk.
 const unpacked=new Map(),packed=(json.bufferViews||[]).map((v,i)=>[i,v.extensions?.EXT_meshopt_compression||v.extensions?.KHR_meshopt_compression]).filter(([,e])=>e);
 if(packed.length){await MeshoptDecoder.ready;for(const [i,e] of packed){if((e.buffer||0)!==0)throw Error(`${url}: packed data outside the file`);
  const out=new Uint8Array(e.count*e.byteStride),src=new Uint8Array(bin,e.byteOffset||0,e.byteLength);MeshoptDecoder.decodeGltfBuffer(out,e.count,e.byteStride,src,e.mode,e.filter||'NONE');unpacked.set(i,out.buffer);}}
 const source=index=>unpacked.has(index)?{buf:unpacked.get(index),at:0}:{buf:bin,at:json.bufferViews[index].byteOffset||0};
 const bytes=index=>{const v=json.bufferViews[index],{buf,at}=source(index);return buf.slice(at,at+v.byteLength);};
 // An accessor as a buffer attribute (copied out of the file, so strides and alignment never matter).
 const attribute=index=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView],T=COMPONENT[a.componentType],n=SIZE[a.type],stride=v.byteStride||T.BYTES_PER_ELEMENT*n,{buf,at}=source(a.bufferView),base=at+(a.byteOffset||0);
  const out=new T(a.count*n),src=new DataView(buf);
  const read={1:(p)=>T===Int8Array?src.getInt8(p):src.getUint8(p),2:(p)=>T===Int16Array?src.getInt16(p,true):src.getUint16(p,true),4:(p)=>T===Float32Array?src.getFloat32(p,true):src.getUint32(p,true)}[T.BYTES_PER_ELEMENT];
  for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)out[i*n+k]=read(base+i*stride+k*T.BYTES_PER_ELEMENT);
  return new THREE.BufferAttribute(out,n,!!a.normalized);};
 const images=await Promise.all((json.images||[]).map(async img=>{
  if(img.bufferView===undefined)return null;const blob=new Blob([bytes(img.bufferView)],{type:img.mimeType||'image/png'});
  // No picture larger than the map quality allows (quality.mjs).
  return shrinkBitmap(await createImageBitmap(blob,{imageOrientation:'none',premultiplyAlpha:'none'}));}));
 const textures=new Map();
 const texture=(ref,srgb)=>{if(!ref)return null;const key=ref.index+':'+srgb+':'+JSON.stringify(ref.extensions?.KHR_texture_transform||0);if(textures.has(key))return textures.get(key);const t=json.textures[ref.index],image=images[t.extensions?.EXT_texture_webp?.source??t.source];if(!image)return null;
  const tex=new THREE.Texture(image);tex.flipY=false;const tt=ref.extensions?.KHR_texture_transform;if(tt){if(tt.offset)tex.offset.fromArray(tt.offset);if(tt.scale)tex.repeat.fromArray(tt.scale);if(tt.rotation)tex.rotation=tt.rotation;}tex.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;const sm=json.samplers?.[t.sampler]||{},wrap=c=>c===33071?THREE.ClampToEdgeWrapping:c===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;tex.wrapS=wrap(sm.wrapS);tex.wrapT=wrap(sm.wrapT);tex.anisotropy=4;tex.needsUpdate=true;textures.set(key,tex);return tex;};
 const materials=new Map();
 const material=(index,colored)=>{const key=index+':'+colored;if(materials.has(key))return materials.get(key);const m=json.materials?.[index]||{},pbr=m.pbrMetallicRoughness||{},f=pbr.baseColorFactor||[1,1,1,1];
  const common={color:new THREE.Color().setRGB(f[0],f[1],f[2]),map:texture(pbr.baseColorTexture,true),vertexColors:colored,side:m.doubleSided?THREE.DoubleSide:THREE.FrontSide,opacity:f[3]};
  let out;
  if(m.alphaMode==='BLEND'&&m.extras?.blending==='additive')out=new THREE.MeshBasicMaterial({...common,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,forceSinglePass:true,toneMapped:false});
  else if(m.extensions?.KHR_materials_unlit)out=new THREE.MeshBasicMaterial({...common,transparent:m.alphaMode==='BLEND',toneMapped:false});
  else{out=new THREE.MeshStandardMaterial({...common,metalness:pbr.metallicFactor??1,roughness:pbr.roughnessFactor??1,transparent:m.alphaMode==='BLEND',alphaTest:m.alphaMode==='MASK'?(m.alphaCutoff??.5):0,
   emissive:new THREE.Color().setRGB(...(m.emissiveFactor||[0,0,0])),emissiveMap:texture(m.emissiveTexture,true),normalMap:texture(m.normalTexture,false)});
   // glTF packs roughness in green and metalness in blue of one texture; three.js reads them from the same channels.
   const mr=texture(pbr.metallicRoughnessTexture,false);if(mr){out.roughnessMap=mr;out.metalnessMap=mr;}
   if(out.normalMap&&m.normalTexture?.scale)out.normalScale.set(m.normalTexture.scale,m.normalTexture.scale);
   if(m.extensions?.KHR_materials_emissive_strength)out.emissiveIntensity=m.extensions.KHR_materials_emissive_strength.emissiveStrength;
   if(m.alphaMode==='BLEND'){out.forceSinglePass=true;out.depthWrite=m.extras?.depthWrite??true;}}
  if(m.extras?.ghost)out.userData.ghost=true;
  out.name=m.name||'';out.userData.additive=out.blending===THREE.AdditiveBlending;materials.set(key,out);return out;};
 const meshes=(json.meshes||[]).map(mesh=>mesh.primitives.map(p=>{const g=new THREE.BufferGeometry();
  for(const [name,target] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv'],['COLOR_0','color']])if(p.attributes[name]!==undefined)g.setAttribute(target,attribute(p.attributes[name]));
  if(p.indices!==undefined)g.setIndex(attribute(p.indices));if(!g.attributes.normal)g.computeVertexNormals();g.computeBoundingSphere();
  const m=new THREE.Mesh(g,material(p.material,p.attributes.COLOR_0!==undefined));m.name=mesh.name||'';return m;}));
 // A mesh used by several nodes (a map's repeated props: barrels, mushrooms, stones) is drawn once per top part as an
 // InstancedMesh, one copy at each node. (One three.js object can have only one parent: sharing it left every copy but the last empty.)
 const uses=new Map();(json.nodes||[]).forEach(n=>{if(n.mesh!==undefined)uses.set(n.mesh,(uses.get(n.mesh)||0)+1);});
 const nodes=(json.nodes||[]).map(n=>{const o=n.mesh===undefined?new THREE.Group():uses.get(n.mesh)>1&&!n.children?.length?Object.assign(new THREE.Object3D(),{userData:{repeat:n.mesh}}):meshes[n.mesh].length===1?meshes[n.mesh][0]:new THREE.Group().add(...meshes[n.mesh]);o.name=n.name||o.name;
  if(n.matrix)o.applyMatrix4(new THREE.Matrix4().fromArray(n.matrix));else{if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);}
  o.userData.extras=n.extras||null;return o;});
 (json.nodes||[]).forEach((n,i)=>{for(const c of n.children||[])nodes[i].add(nodes[c]);});
 const scene=new THREE.Group(),roots=json.scenes?.[json.scene??0]?.nodes||[];for(const r of roots)scene.add(nodes[r]);
 scene.updateMatrixWorld(true);
 for(const part of [...scene.children]){const spots=new Map(),inv=part.matrixWorld.clone().invert();
  part.traverse(o=>{if(o.userData.repeat===undefined)return;if(!spots.has(o.userData.repeat))spots.set(o.userData.repeat,[]);spots.get(o.userData.repeat).push(inv.clone().multiply(o.matrixWorld));});
  for(const [i,list] of spots)for(const m of meshes[i]){const im=new THREE.InstancedMesh(m.geometry,m.material,list.length);im.name=m.name;list.forEach((x,k)=>im.setMatrixAt(k,x));im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();im.computeBoundingBox?.();part.add(im);}
  const gone=[];part.traverse(o=>{if(o.userData.repeat!==undefined)gone.push(o);});for(const o of gone)o.removeFromParent();}
 return {scene,extras:roots.length===1?nodes[roots[0]].userData.extras:null};
}
