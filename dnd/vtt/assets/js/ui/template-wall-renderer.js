import {createTemplateGeometry} from './template-geometry.js';
import {wallSquareKey,wallMaterial,wallCubeBase,projectWallCube,wallTerrainAt} from './wall-cubes.js';
const {clampWallSquares,getMapGridBounds}=createTemplateGeometry();
const ns='http://www.w3.org/2000/svg';
let patternSequence=0;

// Explicit geometry inputs keep active and passive previews on the same projection.
export function paintWallTemplate(shape,view={},options={}) {
 const squares=clampWallSquares(shape.squares,view),bounds=getMapGridBounds(view);
 const root=shape.elements.root;
 if(!view.mapLoaded||!bounds||(!squares.length&&!shape.hoverSquare)){root.hidden=true;root.setAttribute('aria-hidden','true');return;}
 shape.squares=squares;
 const config=options.config||{},groundAt=options.groundAt||((x,y)=>wallTerrainAt(config,view,x,y));
 const cubes=[...squares.map(square=>({square,ghost:false})),...(shape.hoverSquare?[{square:shape.hoverSquare,ghost:true}]:[])].map(cube=>({...cube,faces:projectWallCube(cube.square,wallCubeBase(shape,cube.square,config,groundAt),bounds.gridSize,bounds.offsetLeft,bounds.offsetTop)}));
 const points=cubes.flatMap(c=>Object.values(c.faces).flat());
 const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
 const width=Math.max(...points.map(p=>p.x))-left,height=Math.max(...points.map(p=>p.y))-top;
 root.hidden=false;root.setAttribute('aria-hidden','false');
 Object.assign(root.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
 root.style.setProperty('--vtt-wall-grid',bounds.gridSize+'px');
 const container=shape.elements.tileContainer;if(!container)return;
 const tiles=shape.elements.tiles??new Map();shape.elements.tiles=tiles;
 const keys=new Set();
 cubes.sort((a,b)=>a.square.row-b.square.row||(a.square.elevation??0)-(b.square.elevation??0));
 for(const {square,ghost,faces} of cubes){
  const key=(ghost?'preview:':'')+wallSquareKey(square);keys.add(key);
  let svg=tiles.get(key);
  if(!svg){svg=document.createElementNS(ns,'svg');svg.dataset.patternId='vtt-wall-material-'+(++patternSequence);tiles.set(key,svg);}
  svg.classList.add('vtt-wall__cube');svg.classList.toggle('is-ghost',ghost);svg.classList.toggle('is-selected-cube',!ghost&&shape.selectedSquareKey===wallSquareKey(square));
  svg.dataset.wallSquare=wallSquareKey(square);svg.dataset.wallColumn=square.column;svg.dataset.wallRow=square.row;svg.dataset.wallElevation=square.elevation??0;
  svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const defs=document.createElementNS(ns,'defs'),pattern=document.createElementNS(ns,'pattern'),image=document.createElementNS(ns,'image');
  pattern.id=svg.dataset.patternId;pattern.setAttribute('patternUnits','userSpaceOnUse');pattern.setAttribute('width',bounds.gridSize);pattern.setAttribute('height',bounds.gridSize);
  image.setAttribute('href',`/dnd/vtt/assets/images/wall-${wallMaterial(shape.wallColor)}.png`);image.setAttribute('width',bounds.gridSize);image.setAttribute('height',bounds.gridSize);image.setAttribute('preserveAspectRatio','xMidYMid slice');pattern.append(image);defs.append(pattern);
  svg.replaceChildren(defs);
  for(const side of ['west','south','top']){
   const polygon=document.createElementNS(ns,'polygon');polygon.dataset.cubeFace=side;polygon.setAttribute('points',faces[side].map(p=>`${p.x-left},${p.y-top}`).join(' '));polygon.setAttribute('fill',`url(#${pattern.id})`);svg.append(polygon);
   if(side!=='top'){const shade=polygon.cloneNode();shade.removeAttribute('data-cube-face');shade.setAttribute('fill','#000');shade.setAttribute('opacity',side==='west'?'.35':'.18');shade.style.pointerEvents='none';svg.append(shade);}
  }
  container.append(svg);
 }
 for(const [key,tile] of tiles)if(!keys.has(key)){tile.remove();tiles.delete(key);}
 for(const connector of shape.elements.connectors?.values()||[])connector.remove();shape.elements.connectors?.clear();
 if(shape.elements.label)shape.elements.label.textContent=`${squares.length} square${squares.length===1?'':'s'}`;
}
