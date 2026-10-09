// The lit ground for one viewpoint, worked out a little at a time.
//
// Working out what a viewer can see of the ground takes some ten thousand lines of sight. Done in
// one go on the frame a token lands, the board stops answering for that long. Here it is a job
// that can be advanced for a few milliseconds a frame: the token moves at once, and the lit ground
// follows a moment later. The answer is the same one, from the same code (adaptive-fog.mjs and
// obstacle-reveal.mjs, whose all-at-once forms run these very steps to the end).
import {adaptiveFogSteps} from './adaptive-fog.mjs';
import {obstacleRevealSteps} from './obstacle-reveal.mjs';

/** Every piece of the lit ground, passed to `emit` as it is found. Returns the counts the old pass reported. */
export function* groundShapeSteps({left,top,right,bottom,visible,walls,origin,groundAt,emit}){
 const polygons=[];
 const fog=yield* adaptiveFogSteps({left,top,right,bottom,visible,emit:polygon=>{polygons.push(polygon);emit(polygon);}});
 yield;
 const reveal=yield* obstacleRevealSteps({polygons,walls,origin,groundAt,visible,emit});
 return {checks:fog.checks+reveal.checks,polygons:fog.polygons};
}

/** A job: the steps to run, and what the caller wants kept with them (the shape being built, what it is for). */
export function createJob(key,run,extra={}){return {...extra,key,run,done:false,result:null,spent:0,slices:0};}

/** Runs a job for about `budget` milliseconds. True once it has finished; a finished job is left alone. */
export function advance(job,budget,now=()=>performance.now()){
 if(job.done)return true;
 const start=now(),end=start+budget;
 for(;;){
  const step=job.run.next();
  if(step.done){job.done=true;job.result=step.value;break;}
  if(now()>=end)break;
 }
 job.spent+=now()-start;job.slices++;
 return job.done;
}

/** Runs a job to its end, now. */
export function finish(job,now=()=>performance.now()){return advance(job,Infinity,now);}

/**
 * Which picture to work on. Only the newest place asked for is worked out for the screen: a job for
 * a place the viewer has already left is set aside the moment a newer one is asked for, and never
 * shown. A job set aside is kept (up to `limit` of them, oldest dropped first) when what was seen
 * from there should still be remembered, and finished later, when nothing is waiting for the screen.
 */
export function createSightQueue({limit=32}={}){
 let current=null,superseded=0;const passed=[];
 return {
  get current(){return current;},
  get passed(){return passed;},
  get superseded(){return superseded;},
  /** Makes `job` the one for the screen. The job it replaces is kept for memory when `keep` says so. */
  ask(job,keep=()=>false){this.setAside(keep);current=job;return job;},
  /** Drops the job for the screen, keeping it for memory when `keep` says so. */
  setAside(keep=()=>false){
   if(!current)return;
   const old=current;current=null;superseded++;
   if(keep(old)){passed.push(old);if(passed.length>limit)passed.shift();}
  },
  /** The job for the screen is done with (shown, or no longer wanted). */
  clear(){const old=current;current=null;return old;},
  /** Forgets every job set aside: the scene, the walls or the viewer changed, and they no longer apply. */
  forget(){passed.length=0;},
 };
}
