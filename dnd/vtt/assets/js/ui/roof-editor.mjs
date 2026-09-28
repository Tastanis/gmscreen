import {wallRooms} from './roof-geometry.mjs';import {wallHeights} from './wall-properties.mjs';import {putRoofImage} from './roof-images.mjs';
export function createRoofEditor({fields,selected,model,context,groundAt,change,copyWalls}){
 const wrap=document.createElement('div');wrap.innerHTML='<label><span>Roof</span><input type="checkbox" data-roof-enabled /></label><label data-roof-control hidden><span>Roof height</span><input type="number" min="0" max="1000000" step="1" aria-label="Roof height" data-roof-height /></label><label data-roof-control hidden><span>Roof image</span><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Roof image" data-roof-image /></label>';fields.append(wrap);
 const enabled=wrap.querySelector('[data-roof-enabled]'),height=wrap.querySelector('[data-roof-height]'),image=wrap.querySelector('[data-roof-image]');
 // Imported point outlines are independent surfaces, not editable wall selections.
 function matching(){const ids=new Set(selected().flatMap(e=>[e.a,e.b]));return (model().roofs||[]).filter(r=>Array.isArray(r.nodes)&&r.nodes.length>=3&&r.nodes.every(id=>ids.has(id)));}
 enabled.onchange=()=>{if(!context()?.isGM)return;const m=model(),before=copyWalls(m),existing=matching();
  if(!enabled.checked)m.roofs=(m.roofs||[]).filter(r=>!existing.includes(r));
  else{const rooms=wallRooms(m,selected());if(!rooms.length){enabled.checked=false;alert('Select a closed outline of connected walls and doors.');return;}m.roofs??=[];
   for(const nodes of rooms){if(m.roofs.some(r=>Array.isArray(r.nodes)&&r.nodes.length===nodes.length&&r.nodes.every(id=>nodes.includes(id))))continue;
    const edges=selected().filter(e=>nodes.includes(e.a)&&nodes.includes(e.b)),map=new Map(m.nodes.map(n=>[n.id,n]));
    const top=Math.max(...edges.map(e=>{const a=map.get(e.a),b=map.get(e.b);return wallHeights(e,a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},groundAt).top;}));
    m.roofs.push({id:crypto.randomUUID(),nodes,height:top,imageId:null});
   }
  }change(before);refresh();
 };
 height.onchange=()=>{if(!context()?.isGM)return;const value=Number(height.value);if(!Number.isFinite(value)||value<0||value>1000000){refresh();return;}const before=copyWalls(model());for(const r of matching())r.height=value;change(before);};
 image.onchange=async()=>{if(!context()?.isGM||!image.files[0])return;const m=model(),targets=matching().map(r=>r.id),file=image.files[0];image.disabled=true;
  try{const bitmap=await createImageBitmap(file),base=document.querySelector('#vtt-map-image');if(bitmap.width!==base.naturalWidth||bitmap.height!==base.naturalHeight){bitmap.close();throw Error('Use a roof export with the same image dimensions and map bounds as the base map.');}bitmap.close();const id=await putRoofImage(file);if(model()!==m)return;const before=copyWalls(m);for(const r of m.roofs||[])if(targets.includes(r.id))r.imageId=id;change(before);}catch(e){alert(e.message);}finally{image.disabled=false;image.value='';}
 };
 function refresh(){const roofs=matching();enabled.checked=roofs.length>0;for(const l of wrap.querySelectorAll('[data-roof-control]'))l.hidden=!roofs.length;if(document.activeElement!==height)height.value=roofs.length&&roofs.every(r=>r.height===roofs[0].height)?roofs[0].height:'';}
 return {refresh};
}
