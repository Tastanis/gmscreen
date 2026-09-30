import { wallHeights } from './wall-properties.mjs';
const EPS = 1e-7;
export function wallOccupiesHeight(range, height) {
  return Number.isFinite(height) && range.top > range.base + EPS && height >= range.base - EPS && height < range.top - EPS;
}
// The renderer samples terrain-following walls at quarter-cell intervals. Keep
// crossings within those same intervals precise, rather than showing whole edges.
export function wallHeightIntervals(edge, a, b, height, groundAt) {
  if (!Number.isFinite(height)) return [[0, 1]];
  const point = t => ({ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t });
  const inside = t => wallOccupiesHeight(wallHeights(edge, a, b, point(t), groundAt), height);
  if (edge.baseMode === 'fixed') return inside(.5) ? [[0, 1]] : [];
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x-a.x, b.y-a.y)*4));
  const intervals = []; let start = inside(0) ? 0 : null, previous = start !== null;
  for (let i=1; i<=steps; i++) {
    const t=i/steps, current=inside(t);
    if (current !== previous) {
      let lo=(i-1)/steps, hi=t;
      for(let j=0;j<26;j++){const mid=(lo+hi)/2;if(inside(mid)===previous)lo=mid;else hi=mid;}
      const crossing=(lo+hi)/2;
      if(current)start=crossing;else{intervals.push([start,crossing]);start=null;}
    }
    previous=current;
  }
  if(start!==null)intervals.push([start,1]);
  return intervals;
}
export function sliceWallModel(model, height, groundAt) {
  const nodes=new Map(model.nodes.map(n=>[n.id,n])), segments=[], nodeIds=new Set();
  for(const edge of model.segments){
    const a=nodes.get(edge.a),b=nodes.get(edge.b);if(!a||!b)continue;
    const intervals=wallHeightIntervals(edge,a,b,height,groundAt);
    if(!intervals.length)continue;
    segments.push({edge,a,b,intervals});
    if(intervals.some(([lo])=>lo<=EPS))nodeIds.add(a.id);
    if(intervals.some(([,hi])=>hi>=1-EPS))nodeIds.add(b.id);
  }
  return {segments,nodeIds};
}
export function inspectionPlanePoint(point, height, project) {
  const offset=project(0,0,height);
  return {x:point.x-offset.x,y:point.y-offset.y};
}
