import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const smooth=T.MathUtils.smoothstep, tau=Math.PI*2;
const flightTime=39, watchTime=98;
const up=new T.Vector3(0,1,0);
const leapTime=.72;

// Offsets from the gate watchpost, in campus axes. The long arc passes outside
// the western wall, the ink quarter, the east towers, and the southern approach.
function guardRoute(heading){
  const forward=new T.Vector3(Math.sin(heading),0,Math.cos(heading));
  const keys=[
    [leapTime,0,0,0], [1.55,forward.x*268-5,201,forward.z*268-12],
    [2.7,-337,239,134], [4.05,-399,253,43], [6.15,-402,267,-222], [9.3,-246,283,-640],
    [12.3,-38,293,-916], [15.9,389,289,-960], [19.1,744,270,-766],
    [22.4,953,257,-426], [25.6,957,240,-57], [28.3,769,226,183],
    [30.9,490,213,275], [33,241,169,209], [34.65,84,117,99], [35.55,52,95,61],
    [36.55,40,74,21], [37.5,28,50,1], [38.2,15,29,-4], [flightTime,0,0,0]
  ].map(([time,x,y,z])=>({time,p:new T.Vector3(x,y,z),v:new T.Vector3()}));
  function leap(t,p,v){
    p.copy(forward).multiplyScalar(222*t-24*t*t);p.y=281*t-103*t*t;
    v.copy(forward).multiplyScalar(222-48*t);v.y=281-206*t;
  }
  leap(leapTime,keys[0].p,keys[0].v);
  for(let i=1;i<keys.length-1;i++){
    const a=keys[i-1],b=keys[i+1];
    keys[i].v.subVectors(b.p,a.p).divideScalar(b.time-a.time);
  }
  keys.at(-1).v.copy(forward).multiplyScalar(35);
  keys.at(-1).v.y=-32;
  // Use one continuous horizontal arc for the launch turn and another for
  // the landing flare. The intervening height keys only shape the climb.
  function fairTurn(first,last,startVelocity,endVelocity){
    const a=keys[first],b=keys[last],duration=b.time-a.time;
    for(const axis of ['x','z']){
      const p0=a.p[axis],p1=b.p[axis],v0=startVelocity[axis],v1=endVelocity[axis];
      for(let k=first;k<=last;k++){
        const key=keys[k],t=(key.time-a.time)/duration,t2=t*t,t3=t2*t;
        key.p[axis]=(2*t3-3*t2+1)*p0+(t3-2*t2+t)*duration*v0+(-2*t3+3*t2)*p1+(t3-t2)*duration*v1;
        key.v[axis]=(6*t2-6*t)*(p0-p1)/duration+(3*t2-4*t+1)*v0+(3*t2-2*t)*v1;
      }
    }
  }
  const departureEnd=keys.findIndex(k=>k.time===6.15);
  const approachStart=keys.findIndex(k=>k.time===33);
  fairTurn(0,departureEnd,keys[0].v,keys[departureEnd].v);
  fairTurn(approachStart,keys.length-1,new T.Vector3(-100,0,-55),keys.at(-1).v);
  // Time Hermite interpolation preserves the velocity at the handoff from
  // the ballistic leap to the first powered stroke.
  return (time,p,v)=>{
    if(time<=leapTime){leap(Math.max(time,0),p,v);return;}
    let i=1;while(i<keys.length-1&&keys[i].time<time)i++;
    const a=keys[i-1],b=keys[i],dt=b.time-a.time,t=Math.min(1,(time-a.time)/dt);
    const t2=t*t,t3=t2*t;
    p.copy(a.p).multiplyScalar(2*t3-3*t2+1).addScaledVector(a.v,dt*(t3-2*t2+t))
      .addScaledVector(b.p,-2*t3+3*t2).addScaledVector(b.v,dt*(t3-t2));
    v.copy(a.p).multiplyScalar((6*t2-6*t)/dt).addScaledVector(a.v,3*t2-4*t+1)
      .addScaledVector(b.p,(6*t-6*t2)/dt).addScaledVector(b.v,3*t2-2*t);
  };
}

function makeLeg(upper,bend,claw,hind,side,anchor){
  const thigh=bend.position.clone(),shin=claw.position.clone();
  const thighDir=thigh.clone().normalize(),shinDir=shin.clone().normalize();
  const thighLen=thigh.length(),shinLen=shin.length();
  const knee=new T.Vector3(),axis=new T.Vector3(),pole=new T.Vector3(),direction=new T.Vector3();
  const inverse=new T.Quaternion(),shoulderQ=new T.Quaternion(),elbowQ=new T.Quaternion(),wristQ=new T.Quaternion();
  const feather=new T.Euler(),carry=new T.Quaternion();
  // A fixed world-space claw anchors the compression and the extension before toe-off.
  // Release each limb separately into the attack pose.
  return (s,stroke,levelToChest,worldToChest)=>{
    direction.copy(anchor);
    if(s>flightTime-2 && s<flightTime)direction.y+=12*(1-smooth(s,flightTime-.75,flightTime));
    direction.applyMatrix4(worldToChest).sub(upper.position);
    const distance=T.MathUtils.clamp(direction.length(),Math.abs(thighLen-shinLen)+.00001,thighLen+shinLen-.00001);
    axis.copy(direction).normalize();pole.copy(thigh).addScaledVector(axis,-thigh.dot(axis)).normalize();
    const along=(thighLen*thighLen-shinLen*shinLen+distance*distance)/(2*distance);
    knee.copy(axis).multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,thighLen*thighLen-along*along)));
    upper.quaternion.setFromUnitVectors(thighDir,knee.normalize());
    direction.copy(axis).multiplyScalar(distance).addScaledVector(knee,-thighLen);
    bend.quaternion.setFromUnitVectors(shinDir,direction.normalize().applyQuaternion(inverse.copy(upper.quaternion).invert()));
    claw.quaternion.copy(upper.quaternion).multiply(bend.quaternion).invert().multiply(levelToChest);

    const released=smooth(s,hind?0:-.17,hind?.19:.24)*(1-smooth(s,flightTime-1.48,flightTime-.28));
    if(!released)return;
    const gather=smooth(s,.64,1.86);
    const flare=smooth(s,flightTime-2.85,flightTime-.65);
    const fold=smooth(s,1.28,2.68);
    let upperPitch,lowerPitch,elbowSide,pawSide,wristPitch,wristYaw,wristRoll;
    if(hind){
      // Keep the knees under the hips, with the shin and talons trailing
      // behind the rump. Let the hock yield a little on each wing stroke.
      upperPitch=T.MathUtils.lerp(-.91,-.64,gather);
      lowerPitch=T.MathUtils.lerp(-1.08,-1.12+.08*stroke,gather);
      elbowSide=side*T.MathUtils.lerp(.47,-.38,gather);
      pawSide=side*T.MathUtils.lerp(.23,.16,gather);
      wristPitch=.34+.08*stroke*gather;
      wristYaw=T.MathUtils.lerp(.12,1.06,gather);
      wristRoll=T.MathUtils.lerp(.16,-.42,gather);
    }else{
      const lift=smooth(s,-.13,.40);
      // After the display, lower the elbows outside the ribs. Carry the
      // forearms forward of the sternum so the claws remain in silhouette.
      upperPitch=T.MathUtils.lerp(.75+1.46*lift,.08,fold)+.095*stroke;
      lowerPitch=T.MathUtils.lerp(1.06+1.08*lift,2.09,fold)+.11*stroke;
      elbowSide=side*T.MathUtils.lerp(.77,.68,fold);
      pawSide=side*T.MathUtils.lerp(-.04,.11,fold);
      wristPitch=T.MathUtils.lerp(-2.06,-.70,fold)+.06*stroke;
      wristYaw=T.MathUtils.lerp(.35,.23,fold);wristRoll=T.MathUtils.lerp(.23,-.18,fold);
    }
    upperPitch=T.MathUtils.lerp(upperPitch,hind?.27:.69,flare);
    lowerPitch=T.MathUtils.lerp(lowerPitch,hind?.19:.38,flare);
    wristPitch=T.MathUtils.lerp(wristPitch,-.12,flare);
    // Carry the limbs with the banking chest. A little gravity compensation
    // keeps the palm presentation readable through a bank.
    carry.identity().slerp(levelToChest,.24+.54*flare);
    direction.set(elbowSide,-Math.cos(upperPitch),Math.sin(upperPitch)).normalize().applyQuaternion(carry);
    shoulderQ.setFromUnitVectors(thighDir,direction);
    direction.set(pawSide,-Math.cos(lowerPitch),Math.sin(lowerPitch)).normalize().applyQuaternion(carry);
    elbowQ.setFromUnitVectors(shinDir,direction.applyQuaternion(inverse.copy(shoulderQ).invert()));
    wristQ.setFromEuler(feather.set(wristPitch,side*wristYaw*(1-flare),side*wristRoll*(1-flare),'YXZ'));
    wristQ.premultiply(carry).premultiply(inverse.copy(shoulderQ).multiply(elbowQ).invert());
    upper.quaternion.slerp(shoulderQ,released);
    bend.quaternion.slerp(elbowQ,released);
    claw.quaternion.slerp(wristQ,released);
  };
}

function bindGuard(model,thing,ground,yaw,scale,restY){
  const bone=n=>model.getObjectByName(n),chest=bone('Chest'),head=bone('Head');
  const rest=chest.position.clone(),offset=new T.Vector3(),wings=[],legs=[];
  const worldToChest=new T.Matrix4(),levelToChest=new T.Quaternion(),heading=new T.Quaternion();
  const homeYaw=new T.Quaternion().setFromAxisAngle(up,yaw);
  for(const [side,sign] of [['L',-1],['R',1]]){
    wings.push({sign,upper:bone('Wing_'+side),fan:bone('WingFan_'+side)});
    for(const name of ['Arm','Haunch']){
      const hind=name==='Haunch',upper=bone(name+'_'+side),bend=bone(name+'Bend_'+side),claw=bone(name+'Claw_'+side);
      const local=rest.clone().add(upper.position).add(bend.position).add(claw.position);
      const anchor=local.multiplyScalar(scale).add(model.position).applyQuaternion(homeYaw).add(thing.group.position);
      const toeX=sign*(hind?34:14),toeZ=hind?-29:37;
      const wx=thing.x+toeX*Math.cos(yaw)+toeZ*Math.sin(yaw),wz=thing.z-toeX*Math.sin(yaw)+toeZ*Math.cos(yaw);
      anchor.y+=ground(wx,wz)-restY+.55;
      legs.push(makeLeg(upper,bend,claw,hind,sign,anchor));
    }
  }
  return (t,s,open,beat,tipBeat,bank,flap,drive,actorYaw)=>{
    const flying=smooth(s,.15,1.48)*(1-smooth(s,flightTime-1.8,flightTime-.06));
    const crouch=smooth(s,-1.12,-.35)*(1-smooth(s,-.23,.035))+.90*smooth(s,flightTime-.10,flightTime+.24)*(1-smooth(s,flightTime+.24,flightTime+1.35));
    const push=smooth(s,-.23,.035)*(1-smooth(s,.035,.43));
    const idle=1-open,w=Math.sin(t*.65)+.32*Math.sin(t*1.14);
    // In flight the wings and torso share a bank. The small vertical load
    // follows the power stroke; all lateral weight shifting is ground-only.
    const lift=Math.sin(flap-.73)*drive*flying;
    offset.set(.013*w*idle,
      -.245*crouch+.14*push+.007*Math.sin(t*1.64)*idle+.018*lift,
      .047*crouch+.008*w*idle);
    chest.position.copy(rest).add(offset);
    chest.rotation.set(.17*crouch-.085*push+.34*flying,.016*w*idle,.023*w*idle);
    head.rotation.set(-.13*crouch-.22*flying,.10*Math.sin(t*.39)*idle,-.035*w*idle);
    chest.updateWorldMatrix(true,false);
    worldToChest.copy(chest.matrixWorld).invert();
    chest.getWorldQuaternion(levelToChest).invert().multiply(heading.setFromAxisAngle(up,actorYaw));
    const shrug=smooth(Math.sin(t*.47),.73,1)*idle;
    for(const {sign,upper,fan} of wings){
      const localShrug=shrug*(sign<0?.80:1);
      const inside=-sign*bank;
      const shoulder=-.83+.52*beat-.12*inside,outer=.88+.46*tipBeat-.21*inside;
      upper.rotation.order='YXZ';fan.rotation.order='YXZ';
      upper.rotation.set(-.08*open,sign*(.10*open+.04*bank),sign*(shoulder*open-.095*localShrug));
      fan.rotation.set(.06*open,sign*(-.18*open),sign*((outer-shoulder)*open+.14*localShrug));
    }
    const armStroke=Math.sin(flap-.46)*drive*open;
    for(const leg of legs)leg(s,armStroke,levelToChest,worldToChest);
  };
}

export function installVellumGuard(thing,gate,ground,camera,renderer,anim,sun){
  const root=thing.group,home=root.position.clone(),yaw=Math.atan2(home.x-gate[0],home.z-gate[1]);
  const actor=new T.Group();actor.name='Vellum guard patrol';root.add(actor);thing.focusObject=actor;
  const route=guardRoute(yaw);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const tiers={},pending=new Set(),retry={},world=new T.Vector3();
  const before=new T.Vector3(),after=new T.Vector3(),scratch=new T.Vector3(),velocity=new T.Vector3();
  const view=new T.Frustum(),viewMatrix=new T.Matrix4(),shadowRegion=new T.Sphere();
  const lightDirection=new T.Vector3();
  let initialOffset=32,active=null,start=null,trackingShadow=false;

  // Include the ground down-sun of the flyer: its silhouette can still be
  // visible after its wings have passed out of the camera frame.
  function shadowInView(){
    if(!sun.castShadow || !renderer.shadowMap.enabled || !camera.layers.test(actor.layers))return false;
    lightDirection.subVectors(sun.position,sun.target.position).normalize();
    shadowRegion.center.copy(world);shadowRegion.center.y+=55;
    const drop=Math.max(0,shadowRegion.center.y-ground(world.x,world.z));
    const rayLength=drop/Math.max(.1,lightDirection.y);
    shadowRegion.center.addScaledVector(lightDirection,-.5*rayLength);
    shadowRegion.radius=200+.5*rayLength;
    view.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    return view.intersectsSphere(shadowRegion);
  }
  function load(tier){
    if(tiers[tier]||pending.has(tier)||performance.now()<(retry[tier]||0))return;
    pending.add(tier);
    loader.loadAsync('models/halls/vellum-guard'+(tier==='far'?'-lo':'')+'.glb?patrol=4').then(({scene:model})=>{
      const mesh=model.getObjectByName('Vellum');
      mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox,sz=b.getSize(new T.Vector3());
      const center=b.getCenter(new T.Vector3()),scale=130/Math.max(sz.x,sz.z);
      model.scale.setScalar(scale);model.position.set(-center.x*scale,-b.min.y*scale,-center.z*scale);
      mesh.castShadow=mesh.receiveShadow=true;mesh.material.metalness=0;mesh.material.envMapIntensity=.8;
      for(const tex of [mesh.material.map,mesh.material.normalMap]){
        if(tex){tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());tex.needsUpdate=true;}
      }
      mesh.material.userData.e0=mesh.material.emissive.clone();thing.mats.push(mesh.material);
      // Include unfolded wing tips in culling and picking at both LODs.
      mesh.boundingSphere=new T.Sphere(new T.Vector3(0,.24,0),2.5);
      mesh.boundingBox=new T.Box3(new T.Vector3(-2.5,-1.2,-1.6),new T.Vector3(2.5,2.2,1.6));
      tiers[tier]={model,mesh,pose:bindGuard(model,thing,ground,yaw,scale,home.y)};
      model.visible=false;actor.add(model);
    }).catch(e=>{retry[tier]=performance.now()+10000;console.warn('Vellum guard '+tier,e);}).finally(()=>pending.delete(tier));
  }
  load('far');
  anim.push(t=>{
    if(!tiers.far)load('far');
    if(!tiers.far&&!tiers.close){if(!pending.has('far'))load('close');return;}
    if(start===null){start=t;initialOffset=watchTime-(['#vellum-gargoyle','#silverquill-patrol'].includes(location.hash)?7:29);}
    const phase=(t-start+initialOffset)%(watchTime+flightTime);
    // Continue the landing pose across the clock wrap before returning to idle.
    const s=phase<2?flightTime+phase:phase-watchTime;
    const air=s>0&&s<flightTime;
    const open=smooth(s,-.62,.13)*(1-smooth(s,flightTime-.05,flightTime+1.24));
    const cruise=smooth(s,1.6,3.8)*(1-smooth(s,flightTime-4,flightTime-2));
    const drive=1-.87*cruise*smooth(Math.sin(s*.72-.7),-.48,.71);
    // The legs supply the impulse; the wings catch it on the next downstroke.
    const flap=tau*(.80*s+.16*(1-Math.exp(-2*Math.max(0,s)))+.052*Math.sin(1.24*s));
    const stroking=smooth(s,.06,.34)*(1-smooth(s,flightTime-1.4,flightTime-.45));
    const beat=T.MathUtils.lerp(1,Math.cos(flap)*drive,stroking);
    const tipBeat=T.MathUtils.lerp(1,Math.cos(flap-.51)*drive,stroking);
    let bank=0;actor.position.set(0,0,0);actor.rotation.set(0,yaw,0,'YXZ');
    if(air){
      route(s,actor.position,velocity);
      route(s-.78,scratch,before);route(s+.78,scratch,after);
      const speed=Math.hypot(velocity.x,velocity.z),heading=Math.atan2(velocity.x,velocity.z);
      const yawRate=Math.atan2(before.z*after.x-before.x*after.z,before.x*after.x+before.z*after.z)/1.56;
      const inFlight=smooth(s,.24,1.04)*(1-smooth(s,flightTime-1.20,flightTime));
      // +Z is the nose. Positive yaw turns right, so the right wing goes down
      // (negative local Z roll). Lift consequently points into the turn.
      bank=-T.MathUtils.clamp(Math.atan2(speed*yawRate,235),-.60,.60)*inFlight;
      const approach=smooth(s,flightTime-1.14,flightTime);
      actor.rotation.y=heading;
      actor.rotation.z=bank;
      const climb=Math.atan2(before.y+after.y,Math.hypot(before.x+after.x,before.z+after.z));
      actor.rotation.x=-T.MathUtils.clamp(climb,-.32,.74)*smooth(s,0,.17)*(1-approach)
        -.24*smooth(s,flightTime-2.0,flightTime-.76)*(1-approach);
    }
    const d=camera.position.distanceTo(world.copy(home).add(actor.position));
    if(d<2450&&!tiers.close)load('close');
    const choice=tiers.close&&(!tiers.far||d<(active===tiers.close?2300:1960))?tiers.close:tiers.far;
    if(choice!==active){
      if(active)active.model.visible=false;
      active=choice;active.model.visible=true;renderer.shadowMap.needsUpdate=true;
    }
    active.pose(t,s,open,beat,tipBeat,bank,flap,drive,actor.rotation.y);
    if(!sun)return;
    const visible=shadowInView();
    const moving=(s>=-1.12 && s<=flightTime+1.4) || Math.sin(t*.47)>.73;
    const track=visible && moving;
    // The campus caches its sunlight depth map. Recast the current skinned
    // pose before this frame is drawn, including one last refresh on exit.
    if(track || trackingShadow || active.mesh.castShadow!==visible)renderer.shadowMap.needsUpdate=true;
    active.mesh.castShadow=visible;
    trackingShadow=track;
  });
}
