// The Director's Break tool (Brandon, November 10, 2026: "in the map edits tools, i need a new button ... that allows
// me to break or unbreak a square. So i can see breakable squares outlined, and i can click to break one or unbreak
// one"). Pure: what can be broken on a map, where it is, and what a click does to it. Drawn and clicked by
// wall-prototype.js, which owns the walls and saves them.
import {isBreakable,isBroken,MATERIALS} from './wall-properties.mjs';
import {intersectsFloor,resolveSupportSurfaces} from './floor-support.js';

// ---- Breakable floor plates (plan part 4, Brandon, November 8 and 11, 2026; FloorSupport.php). A `kind: floor` plate
// with a `material` breaks one grid square at a time; `broken` lists the broken squares "col,row". A square is named
// "<plate id>@<col>,<row>", as its piece in the art is.
const PLATES_MAX=20000;
export const plateSquareId=(plate,col,row)=>`${plate}@${col},${row}`;
export const isBreakablePlate=(s)=>s?.kind==='floor'&&!s.boxTop&&!s.templateCube&&MATERIALS.includes(s.material)&&typeof s.id==='string';
/** Every grid square [col,row] a plate covers by a positive area (broken squares included). Paired with FloorSupport::plateSquares. */
export function plateSquares(plate,cuts=[]){
 const points=plate?.points||[];if(points.length<3)return [];
 const whole={...plate,holes:plate.holes||[]},xs=points.map(p=>p.x),ys=points.map(p=>p.y),out=[];
 for(let r=Math.floor(Math.min(...ys));r<Math.ceil(Math.max(...ys));r++)for(let c=Math.floor(Math.min(...xs));c<Math.ceil(Math.max(...xs));c++){
  if(out.length>=PLATES_MAX)return out;
  if(intersectsFloor({column:c,row:r,width:1,height:1},whole,cuts))out.push([c,r]);
 }
 return out;
}
/** The breakable plates of a walls design, their outlines resolved and their own holes only (not the broken squares). */
function breakablePlates(model){
 const plates=(model?.roofs||[]).filter(isBreakablePlate);if(!plates.length)return [];
 return resolveSupportSurfaces({nodes:model.nodes,roofs:plates.map(({broken,...p})=>p)}).map((p,i)=>({...p,broken:plates[i].broken||[],source:plates[i]}));
}
/**
 * Floor squares held up by the objects of a design (an object's `holds`, Brandon, November 12, 2026: "if any one of the
 * pillars breaks, that whole side should collapse"): object id -> ["<plate>@<col>,<row>", ...].
 */
export function heldSquares(model){
 const out=new Map();
 for(const object of model?.objects||[])if(Array.isArray(object?.holds)){
  const list=[];for(const held of object.holds)for(const key of held?.squares||[])if(typeof held?.roof==='string'&&/^-?\d{1,6},-?\d{1,6}$/.test(key))list.push(`${held.roof}@${key}`);
  if(list.length)out.set(object.id,list);
 }
 return out;
}
/** Breaks (or mends) plate squares by name in a design, in place. Only a breakable plate's own squares change. */
export function markPlateSquares(model,names,breakIt){
 const want=new Map();for(const name of names){const m=/^([A-Za-z0-9_.:-]{1,128})@(-?\d{1,6}),(-?\d{1,6})$/.exec(name);if(m){if(!want.has(m[1]))want.set(m[1],new Set());want.get(m[1]).add(`${m[2]},${m[3]}`);}}
 if(!want.size)return false;let changed=false;
 for(const plate of breakablePlates(model)){
  const keys=want.get(plate.id);if(!keys)continue;
  const roof=plate.source,broken=[...(roof.broken||[])];
  if(breakIt){const own=new Set(plateSquares(plate).map(([c,r])=>`${c},${r}`));for(const key of keys)if(own.has(key)&&!broken.includes(key)){broken.push(key);changed=true;}}
  else{const left=broken.filter(key=>!keys.has(key));if(left.length!==broken.length)changed=true;broken.splice(0,broken.length,...left);}
  if(broken.length)roof.broken=broken;else delete roof.broken;
 }
 return changed;
}
/**
 * After any edit of the walls: an object that went from standing to broken breaks the squares it holds up, and one
 * that was mended mends them (the Break tool, the Broken box, Undo all come through here). Returns the squares broken.
 */
export function syncHeldSquares(before,model){
 const held=heldSquares(model);if(!held.size)return [];
 const state=(m)=>{const out=new Map();for(const e of m?.segments||[])if(typeof e?.object==='string'&&held.has(e.object))out.set(e.object,(out.get(e.object)??true)&&e.broken===true);return out;};
 const was=state(before),now=state(model),broke=[],mended=[];
 for(const [id,broken] of now){if(broken&&!was.get(id))broke.push(...held.get(id));else if(!broken&&was.get(id))mended.push(...held.get(id));}
 if(mended.length)markPlateSquares(model,mended,false);
 if(broke.length)markPlateSquares(model,broke,true);
 return broke;
}

/**
 * The breakable things of a walls design: an object (its walls share `object` or `group`) is one thing, a wall piece
 * of its own is one thing. Each: {key, edges, broken (every piece broken), material, box {left,top,right,bottom},
 * lines [[a,b],...] in squares}. Walls with no material are never listed.
 */
export function breakableThings(model) {
  const nodes = new Map((model?.nodes || []).map((n) => [n.id, n])), things = new Map();
  for (const edge of model?.segments || []) {
    if (!isBreakable(edge)) continue;
    const a = nodes.get(edge.a), b = nodes.get(edge.b);
    if (!a || !b) continue;
    const key = typeof edge.object === 'string' ? 'object:' + edge.object : typeof edge.group === 'string' ? 'group:' + edge.group : 'wall:' + edge.id;
    const thing = things.get(key) || { key, edges: [], lines: [], material: edge.material, box: { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity } };
    thing.edges.push(edge); thing.lines.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
    thing.box = { left: Math.min(thing.box.left, a.x, b.x), top: Math.min(thing.box.top, a.y, b.y), right: Math.max(thing.box.right, a.x, b.x), bottom: Math.max(thing.box.bottom, a.y, b.y) };
    things.set(key, thing);
  }
  for (const thing of things.values()) {
    thing.broken = thing.edges.every(isBroken);
    // An object closes round on itself; a lone wall piece does not.
    thing.closed = thing.key !== 'wall:' + thing.edges[0].id && thing.edges.length >= 3;
  }
  // Each square of a breakable floor plate is a thing of its own, at the plate's height.
  for (const plate of breakablePlates(model)) {
    const broken = new Set(plate.broken);
    for (const [c, r] of plateSquares(plate)) {
      const corners = [{ x: c, y: r }, { x: c + 1, y: r }, { x: c + 1, y: r + 1 }, { x: c, y: r + 1 }];
      things.set('square:' + plateSquareId(plate.id, c, r), { key: 'square:' + plateSquareId(plate.id, c, r), plate: plate.id, square: `${c},${r}`, height: Number(plate.height) || 0,
        edges: [], lines: corners.map((p, i) => [p, corners[(i + 1) % 4]]), material: plate.material, box: { left: c, top: r, right: c + 1, bottom: r + 1 }, broken: broken.has(`${c},${r}`), closed: true });
    }
  }
  return [...things.values()];
}

function distanceToLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** The thing at a point (in squares): an object whose outline holds it, else the wall piece nearest it within `reach`. */
export function thingAt(things, p, reach = 0.4) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  // A plate square only counts with the pointer inside it (squares touch), and where plates stack the one nearest the
  // height picked (`p.z`, the 3D board) wins.
  const inside = things.filter((t) => t.closed && (t.plate ? p.x >= t.box.left && p.x < t.box.right && p.y >= t.box.top && p.y < t.box.bottom : p.x >= t.box.left - 0.05 && p.x <= t.box.right + 0.05 && p.y >= t.box.top - 0.05 && p.y <= t.box.bottom + 0.05));
  const area = (t) => (t.box.right - t.box.left) * (t.box.bottom - t.box.top);
  const off = (t) => (Number.isFinite(p.z) && t.plate ? Math.abs(t.height - p.z) : 0);
  if (inside.length) return inside.sort((a, b) => (Number.isFinite(p.z) ? off(a) - off(b) : 0) || area(a) - area(b))[0];
  let best = null, nearest = reach;
  for (const thing of things) for (const [a, b] of thing.lines) { const d = distanceToLine(p, a, b); if (d < nearest) { nearest = d; best = thing; } }
  return best;
}

/** A click on a thing: a standing one (or one part broken) breaks whole; a broken one is mended. Changes the model's walls in place. */
export function toggleBreak(model, thing) {
  const breakIt = !thing.broken;
  if (thing.plate) { markPlateSquares(model, [plateSquareId(thing.plate, ...thing.square.split(',').map(Number))], breakIt); return breakIt; }
  const ids = new Set(thing.edges.map((e) => e.id));
  for (const edge of model.segments) if (ids.has(edge.id)) { if (breakIt) edge.broken = true; else delete edge.broken; }
  return breakIt;
}

/** The plate squares broken by an edit ("<plate>@<col>,<row>"): broken in `model` and not in `before`. */
export function newlyBrokenSquares(before, model) {
  const was = new Map((before?.roofs || []).map((r) => [r.id, new Set(r.broken || [])])), out = [];
  for (const roof of model?.roofs || []) for (const key of roof.broken || []) if (!was.get(roof.id)?.has(key)) out.push(`${roof.id}@${key}`);
  return out;
}
