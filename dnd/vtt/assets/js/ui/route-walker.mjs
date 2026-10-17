// Heights along a previewed walk. The ruler used to ask "how high is the ground at this square?"
// one square at a time, which cannot know that a walker who steps onto a bridge stays on it: the
// preview dropped to the canal bed under the bridge and climbed out at the far bank. This walks a
// ghost of the token along the route and steps onto decks, bridges and cubes by the same contact
// rule the move itself uses (floor-support.js, paired with FloorSupport.php).
//
// The same went for ramps. A walker who comes down a ramp between two upper floors arrives on the
// floor at its foot; asked square by square, the ruler thought that last step went to the ground
// far below and priced it as a long drop. So the ghost also uses stairs and ramps by the rule the
// move uses (stair-walk.mjs, paired with FloorGeometry.php): it is carried along a ramp and is on
// the other floor once it walks off the far end.
import { walkFloorContact, cubeStepDown, createFloorContactWalker, floorSupported, intersectsFloor, terrainFloorContact, PLATE_REACH } from './floor-support.js';
import { stairStep, nearStair, stairCrossing, stairLane, stairPerimeter } from './stair-walk.mjs';
import {floorElevations} from '../state/normalize/floor-elevation.js';

/**
 * The ground's height just beyond one end of a stair: the middle of its edges of that colour ('red' foot of an up
 * stair, 'green' its head), half a square outside the stair; null when it has none. Paired with
 * FloorGeometry::stairEndHeight.
 */
export function stairEndHeight(stair, colour, terrain) {
  const edges = stairPerimeter(stair?.corners);
  if (!edges.length) return null;
  let sx = 0, sy = 0, n = 0, cx = 0, cy = 0;
  for (const corner of stair.corners) { cx += Number(corner.column) / 4; cy += Number(corner.row) / 4; }
  for (const edge of edges) {
    if ((stair.edgeColors?.[edge.id] ?? 'barrier') !== colour) continue;
    sx += (edge.from.x + edge.to.x) / 2; sy += (edge.from.y + edge.to.y) / 2; n++;
  }
  if (!n) return null;
  let x = sx / n, y = sy / n; const dx = x - cx, dy = y - cy, length = Math.hypot(dx, dy);
  if (length > 1e-9) { x += dx / length * .5; y += dy / length * .5; }
  const height = Number(terrain({ column: x - .5, row: y - .5, width: 1, height: 1 }));
  return Number.isFinite(height) ? height : null;
}

/** True when the scene has any stair or ramp to follow. */
export const hasStairs = (mapLevels) => !!(mapLevels?.baseStairs?.length || mapLevels?.levels?.some((level) => level?.stairs?.length));

/**
 * One step of the ghost onto the next square. Returns the ghost as it stands there and the height
 * it stands at: a plate's height when the contact rule puts it on one, the plain height otherwise.
 *
 * `standing` is (placement) => the height a token stands at, given its floor and its progress on
 * a stair. When it is given, the ghost follows stairs and ramps too; `_viaStair` then marks a
 * ghost whose floor or footing has come from a stair, so its height is asked of `standing`.
 */
export function stepGhost({ ghost, column, row, actor, surfaces = [], mapLevels = null, terrain = () => 0, plainHeight = () => 0, standing = null }) {
  if (standing && (ghost._floorTraversal || nearStair(ghost, { column, row }, mapLevels))) {
    const stair = stairStep(ghost, { column, row }, mapLevels);
    if (stair?.fired) {
      // Off the far end: on the other floor now.
      const landed = { ...ghost, column, row, levelId: stair.levelId, _floorTraversal: null, _supportSurfaceId: null, _viaStair: true };
      return { ghost: landed, height: standing(landed) };
    }
    if (stair) {
      const on = { ...ghost, column, row, _floorTraversal: stair.traversal, _viaStair: true };
      return { ghost: on, height: standing(on) };
    }
    if (ghost._floorTraversal) {
      // Stepped off the side of a stair: no plate is acquired on such a step, as in the move itself.
      const off = { ...ghost, column, row, _floorTraversal: null, _supportSurfaceId: null, _viaStair: true };
      return { ghost: off, height: standing(off) };
    }
  }
  const to = { ...ghost, column, row };
  const surface = walkFloorContact(ghost, to, [], surfaces, mapLevels, terrain) || cubeStepDown(ghost, to, surfaces, mapLevels);
  if (surface) return { ghost: { ...to, levelId: surface.levelId, _supportSurfaceId: surface.id }, height: surface.height };
  const off = { ...to, _supportSurfaceId: null };
  return { ghost: off, height: standing && ghost._viaStair ? standing(off) : plainHeight(column, row, { ...actor, _supportSurfaceId: null }) };
}

/**
 * Whether the preview should walk this token: a grounded token on a scene that has floor plates,
 * or (`stairs`) one whose stairs and ramps the preview follows. A token part-way along a stair is
 * walked only in the second case.
 */
export const walksPlates = (actor, surfaces, stairs = false) => !!actor && (!actor.movementMode || actor.movementMode === 'ground')
  && (stairs || (!actor._floorTraversal && (surfaces?.length ?? 0) > 0));

/**
 * @param actor       the token being moved (null for a plain measurement)
 * @param surfaces    the scene's floor plates, with points resolved
 * @param mapLevels   the scene's floors
 * @param terrain     (placement) => ground height under the placement's centre
 * @param plainHeight (column, row, actor) => the height the ruler used before: ground, ramps, or a
 *                    plate the actor is already standing on
 * @param carried     the ghost left by the previous leg of the same route, when this leg starts
 *                    where that one ended
 * @param standing    (placement) => the height a token stands at, given its floor and stair
 *                    progress. Pass it on scenes with ramps, so the walk follows them.
 * Call `height(column, row)` for each square of the leg in order, starting with its first square.
 */
export function createRouteWalker({ actor = null, surfaces = [], mapLevels = null, terrain = () => 0, plainHeight = () => 0, carried = null, standing = null } = {}) {
  const follow = standing && hasStairs(mapLevels) ? standing : null;
  const walks = walksPlates(actor, surfaces, !!follow);
  const heightOf = (id) => surfaces.find((surface) => surface.id === id)?.height;
  let ghost = null;
  return {
    height(column, row) {
      if (!walks) return plainHeight(column, row, actor);
      if (!ghost) {
        // First square of the leg: where the token stands, or where the last leg left its ghost.
        ghost = carried && carried.column === column && carried.row === row ? carried : { ...actor, column, row };
        if (follow && ghost === carried && ghost._viaStair) return follow(ghost);
        const held = ghost === carried && ghost._supportSurfaceId ? heightOf(ghost._supportSurfaceId) : undefined;
        return Number.isFinite(held) ? held : plainHeight(column, row, ghost === carried ? { ...actor, _supportSurfaceId: ghost._supportSurfaceId ?? null } : actor);
      }
      const stepped = stepGhost({ ghost, column, row, actor, surfaces, mapLevels, terrain, plainHeight, standing: follow });
      ghost = stepped.ghost;
      return stepped.height;
    },
    /** Where the ghost stands now; hand it to the next leg as `carried`. */
    get ghost() { return ghost; },
  };
}

/** A single submitted straight leg, sampled in its real direction. This opt-in
 * sandbox trajectory shares native contact/stair rules; sample points never
 * become separate moves that can reacquire an old floor after a drop. */
export function traceSurfaceLeg({actor,end,surfaces=[],mapLevels=null,terrain=()=>0,standing=()=>0}={}){
 const start={column:actor.column,row:actor.row},dx=end.column-start.column,dy=end.row-start.row;
 const distance=Math.max(Math.abs(dx),Math.abs(dy)),count=Math.max(1,Math.ceil(distance)),steps=Math.min(8192,count*8);
 // This private flag is carried only by preview ghosts between waypoints.
 // Accepted placement data never receives it; the next command starts fresh.
 // FloorGeometry gives a whole-command stair transition priority over ordinary
 // box/cube contact, including later legs across the destination island.
 let ghost={...actor},changedFloor=actor._trajectoryStairTransition===true,firedThisLeg=false;
 // Stepped off the floor plate it started on onto ground level with it: the ground's stairs are its own from there
 // (paired with FloorGeometry::move; Medpilis's hall floor over the chapel beside the hall's stairs).
 const startPlate=actor._supportSurfaceId?surfaces.find(s=>s.id===actor._supportSurfaceId&&s.kind==='floor'):null;let steppedOffLevel=false;
 const contactSurfaces=()=>changedFloor?surfaces.filter(s=>!s.boxTop&&!s.templateCube):surfaces;
 const contactFor=p=>createFloorContactWalker(p,contactSurfaces(),mapLevels,terrain);
 let contact=contactFor(ghost);
 const cuts=id=>(mapLevels?.levels||[]).find(l=>l.id===id)?.cutouts||[],heights=floorElevations(mapLevels);
 const plateAt=p=>surfaces.find(s=>s.kind==='floor'&&s.levelId===(p.levelId||'level-0')&&Math.abs(s.height-(heights.get(s.levelId)||0))<=.125+1e-6&&!(mapLevels?.levels||[]).find(l=>l.id===s.levelId)?.hidden&&intersectsFloor(p,s,cuts(s.levelId)));
 let height=standing(ghost),samples=[{...start,height,placement:{...ghost}}];
 if(distance<1e-9)return {samples,placement:ghost,height,stairExit:false};
 for(let i=1;i<=steps;i++){
  const point={column:start.column+dx*i/steps,row:start.row+dy*i/steps},before=ghost;
  const onOwnFloor=(ghost.levelId||'level-0')===(actor.levelId||'level-0')||(steppedOffLevel&&(ghost.levelId||'level-0')==='level-0');
  const stair=!changedFloor&&onOwnFloor&&(ghost._floorTraversal||nearStair(ghost,point,mapLevels))?stairStep(ghost,point,mapLevels):null;
  if(stair){
   ghost={...ghost,...point,_floorTraversal:stair.fired?null:stair.traversal,_viaStair:true,...(stair.fired?{levelId:stair.levelId,_supportSurfaceId:null}:{})};
   if(stair.fired){
    changedFloor=true;firedThisLeg=true;ghost._trajectoryStairTransition=true;
    const plate=plateAt(ghost);
    if(plate)ghost._supportSurfaceId=plate.id;
    contact=contactFor(ghost);
   }else contact=null;
   height=standing(ghost);
  }else{
   if(before._floorTraversal){
    // Reversing through an entry may land on its original plate. A side exit
    // does not gain a disconnected floor merely from its old level identity.
    ghost={...before,...point,_floorTraversal:null,_supportSurfaceId:null};
    const oldStair=(before.levelId==='level-0'?mapLevels?.baseStairs:(mapLevels?.levels||[]).find(l=>l.id===before.levelId)?.stairs)?.find(s=>s.id===before._floorTraversal.stairId);
    const validEntry=oldStair&&before._floorTraversal.entry===(oldStair.direction==='down'?'green':'red');
    const candidate=validEntry?plateAt(ghost):null;
    const plate=candidate&&Math.abs(candidate.height-standing(before))<=PLATE_REACH+1e-6?candidate:null;
    if(plate)ghost._supportSurfaceId=plate.id;
    else ghost.levelId='level-0';
    contact=contactFor(ghost);
   }else ghost={...before,...point};
   const surface=contact?.step(ghost)||(!changedFloor&&cubeStepDown(before,ghost,surfaces,mapLevels));
   if(surface){ghost={...ghost,levelId:surface.levelId,_supportSurfaceId:surface.id};height=surface.height;}
   else{
    // The trajectory is physically unsupported. Its former floor is not a
    // license to stand on an overhead plate encountered later in this leg.
    ghost={...ghost,levelId:'level-0',_supportSurfaceId:null,_floorTraversal:null};height=terrain(ghost);
    if(startPlate&&!changedFloor&&Math.abs(height-startPlate.height)<=.55)steppedOffLevel=true;
   }
  }
  samples.push({...point,height,placement:{...ghost}});
 }
 return {samples,placement:ghost,height,stairExit:firedThisLeg};
}

/** Read-only endpoint compatibility check for the imported-floor sandbox.
 * Mirrors FloorGeometry::move ordering: source-floor stairs over the WHOLE
 * command first, whole-path native contact second, endpoint falling last.
 * Unknown implicit legacy-floor support fails closed, never grants a move. */
export function commandSurfaceEnding({actor,points,surfaces=[],mapLevels,terrain,standing,kind}){
 const levels=[{id:'level-0',cutouts:[]},...(mapLevels?.levels||[]).filter(l=>l.id!=='level-0').map((l,i)=>({...l,_index:i})).sort((a,b)=>(a.zIndex??a._index)-(b.zIndex??b._index)||a._index-b._index)];
 const byId=new Map(levels.map(l=>[l.id,l])),heights=floorElevations(mapLevels),source=actor.levelId||'level-0',end=points.at(-1);
 const width=actor.width||1,height=actor.height||1,path=points.map(p=>({x:p.column+width/2,y:p.row+height/2}));
 let ghost={...actor,...end,levelId:source,_floorTraversal:null,_supportSurfaceId:null},changed=false,carried=false,fell=false,fired=null;
 const stairs=source==='level-0'?mapLevels?.baseStairs:byId.get(source)?.stairs;
 if(!byId.get(source)?.hidden)for(const stair of stairs||[]){
  if(!byId.has(stair.linkedLevelId)||stair.linkedLevelId===source||byId.get(stair.linkedLevelId)?.hidden)continue;
  const crossing=stairCrossing(stairLane(path,stair,width,height),stair,actor._floorTraversal?.stairId===stair.id?actor._floorTraversal.entry:null);
  if(crossing.fired){ghost.levelId=stair.linkedLevelId;changed=true;fired=stair;break;}
  if(crossing.endsInside){ghost._floorTraversal={stairId:stair.id,entry:crossing.entry};carried=crossing.entry===(stair.direction==='down'?'green':'red');break;}
 }
 // On a floor plate level with the ground at a ground stair's foot: that stair is taken in the same move (paired with
 // FloorGeometry::move).
 if(!changed&&!ghost._floorTraversal&&source!=='level-0'&&terrain&&['walk','shift',undefined].includes(kind)){
  const plate=actor._supportSurfaceId?surfaces.find(s=>s.id===actor._supportSurfaceId&&s.kind==='floor'&&intersectsFloor(actor,s,byId.get(s.levelId)?.cutouts||[])):null;
  if(plate)for(const stair of mapLevels?.baseStairs||[]){
   if(!byId.has(stair.linkedLevelId)||stair.linkedLevelId==='level-0'||byId.get(stair.linkedLevelId)?.hidden)continue;
   const foot=stairEndHeight(stair,stair.direction==='down'?'green':'red',terrain);
   if(foot===null||Math.abs(foot-plate.height)>.55)continue;
   const crossing=stairCrossing(stairLane(path,stair,width,height),stair,null);
   if(crossing.fired){ghost.levelId=stair.linkedLevelId;changed=true;fired=stair;break;}
   if(crossing.endsInside){ghost.levelId='level-0';ghost._floorTraversal={stairId:stair.id,entry:crossing.entry};carried=crossing.entry===(stair.direction==='down'?'green':'red');break;}
  }
 }
 const contactResult=surface=>({known:true,placement:{...ghost,levelId:surface.levelId,_supportSurfaceId:surface.id,_floorTraversal:null},height:surface.height});
 if(changed){
  const landing=surfaces.filter(s=>s.kind==='floor'&&s.levelId===ghost.levelId&&!byId.get(s.levelId)?.hidden&&Math.abs(s.height-(heights.get(s.levelId)||0))<=.125+1e-6&&intersectsFloor(ghost,s,byId.get(s.levelId)?.cutouts||[])).sort((a,b)=>b.height-a.height)[0];
  if(landing)return contactResult(landing);
  // Down a stair to the ground and on: a floor plate level with the stair's foot is stood on (FloorGeometry::move).
  if(ghost.levelId==='level-0'&&fired&&terrain){
   const exit=stairEndHeight(fired,fired.direction==='down'?'red':'green',terrain);
   const plate=exit===null?null:surfaces.filter(s=>s.kind==='floor'&&!s.boxTop&&!s.templateCube&&byId.has(s.levelId)&&!byId.get(s.levelId)?.hidden&&Math.abs(s.height-exit)<=.55&&intersectsFloor(ghost,s,byId.get(s.levelId)?.cutouts||[])).sort((a,b)=>Math.abs(a.height-exit)-Math.abs(b.height-exit))[0];
   if(plate)return contactResult(plate);
  }
 }
 if(!changed&&!carried&&!ghost._floorTraversal){
  const contact=walkFloorContact(actor,{...actor,...end},points.slice(1,-1),surfaces,mapLevels,terrain)||cubeStepDown(actor,{...actor,...end},surfaces,mapLevels);
  if(contact)return contactResult(contact);
 }
 if(!carried){
  let index=levels.findIndex(l=>l.id===ghost.levelId);
  if(index<0)return {known:false};
  const original=index;
  while(index>0){
   const level=levels[index],supported=floorSupported({...ghost,levelId:level.id},surfaces,level.cutouts||[]);
   if(supported===null)return {known:false};
   if(!level.hidden&&supported)break;
   index--;
  }
  if(index!==original){ghost.levelId=levels[index].id;ghost._floorTraversal=null;fell=true;}
 }
 if(ghost.levelId==='level-0'&&(!changed||fell)&&!carried&&!ghost._floorTraversal){
  const contact=terrainFloorContact({...actor,...end},surfaces,mapLevels,terrain({...actor,...end}));
  if(contact)return contactResult(contact);
 }
 return {known:true,placement:ghost,height:standing(ghost)};
}
