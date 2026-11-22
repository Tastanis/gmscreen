import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const smooth=T.MathUtils.smoothstep, tau=Math.PI*2;
const flightTime=15;
const path=new T.CatmullRomCurve3([
  [0,0,0],[0,52,14],[-8,117,78],[-91,174,165],[-201,190,156],
  [-261,179,66],[-235,155,-24],[-144,126,-54],[-69,83,-16],[-27,39,1],[0,0,0]
].map(p=>new T.Vector3(...p)));
const up=new T.Vector3(0,1,0);

function makeLeg(upper,bend,claw,hind,side,anchor){
  const thigh=bend.position.clone(),shin=claw.position.clone();
  const thighDir=thigh.clone().normalize(),shinDir=shin.clone().normalize();
  const thighLen=thigh.length(),shinLen=shin.length();
  const knee=new T.Vector3(),axis=new T.Vector3(),pole=new T.Vector3(),direction=new T.Vector3();
  const inverse=new T.Quaternion(),shoulderQ=new T.Quaternion(),elbowQ=new T.Quaternion(),wristQ=new T.Quaternion();
  const feather=new T.Euler();
  // A fixed world-space claw anchors the compression and the extension before toe-off.
  // In the air solve from the vertical so a bank swings the feet under the torso.
  return (s,flap,drive,bank,levelToChest,worldToChest)=>{
    direction.copy(anchor);
    if(s>13 && s<flightTime)direction.y+=12*(1-smooth(s,14.25,flightTime));
    direction.applyMatrix4(worldToChest).sub(upper.position);
    const distance=T.MathUtils.clamp(direction.length(),Math.abs(thighLen-shinLen)+.00001,thighLen+shinLen-.00001);
    axis.copy(direction).normalize();pole.copy(thigh).addScaledVector(axis,-thigh.dot(axis)).normalize();
    const along=(thighLen*thighLen-shinLen*shinLen+distance*distance)/(2*distance);
    knee.copy(axis).multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,thighLen*thighLen-along*along)));
    upper.quaternion.setFromUnitVectors(thighDir,knee.normalize());
    direction.copy(axis).multiplyScalar(distance).addScaledVector(knee,-thighLen);
    bend.quaternion.setFromUnitVectors(shinDir,direction.normalize().applyQuaternion(inverse.copy(upper.quaternion).invert()));
    claw.quaternion.copy(upper.quaternion).multiply(bend.quaternion).invert().multiply(levelToChest);

    const released=smooth(s,hind?.10:0,hind?.45:.31)*(1-smooth(s,hind?13.86:13.96,hind?14.64:14.72));
    if(!released)return;
    const trail=smooth(s,.30,1.30),reach=smooth(s,12.65,14.48);
    const swing=2.03*s+(hind?1.28:0)+side*(hind?.67:.49);
    const catchAir=Math.sin(flap-(hind?1.48:.82)-side*.19)*drive;
    const kick=Math.sin(Math.PI*smooth(s,.30,1.80));
    const upperSwing=(hind?-.38:-.08)+(hind?.37:.43)*Math.sin(swing)+.21*catchAir;
    const lowerSwing=(hind?-.54:.04)+.47*Math.sin(swing-.76)+.26*Math.sin(flap-1.75)*drive;
    const upperPitch=T.MathUtils.lerp(T.MathUtils.lerp(hind?-.54:.47,upperSwing,trail)-(hind?.64:.22)*kick,hind?.17:.67,reach);
    const lowerPitch=T.MathUtils.lerp(T.MathUtils.lerp(hind?-.74:.22,lowerSwing,trail)-(hind?.30:.51)*kick,hind?.20:.39,reach);
    const lateral=side*(hind?.32:.16)+.14*Math.sin(swing-.34)+bank*.30;
    direction.set(lateral,-Math.cos(upperPitch),Math.sin(upperPitch)).normalize().applyQuaternion(levelToChest);
    shoulderQ.setFromUnitVectors(thighDir,direction);
    direction.set(side*.06+.13*Math.sin(swing-.92)+bank*.38,-Math.cos(lowerPitch),Math.sin(lowerPitch)).normalize().applyQuaternion(levelToChest);
    elbowQ.setFromUnitVectors(shinDir,direction.applyQuaternion(inverse.copy(shoulderQ).invert()));
    wristQ.setFromEuler(feather.set(.56+.22*Math.sin(swing-1.18)-.69*reach,side*.09*Math.sin(swing),side*.13));
    wristQ.premultiply(levelToChest).premultiply(inverse.copy(shoulderQ).multiply(elbowQ).invert());
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
    const flying=smooth(s,.15,1.48)*(1-smooth(s,13.25,14.94));
    const crouch=smooth(s,-1.53,-.47)*(1-smooth(s,-.40,.07))+.87*smooth(s,14.88,15.25)*(1-smooth(s,15.25,16.38));
    const push=smooth(s,-.35,.09)*(1-smooth(s,.09,.58));
    const idle=1-open,w=Math.sin(t*.65)+.32*Math.sin(t*1.14);
    const recoil=Math.sin(flap-.73)*drive, sway=Math.sin(1.77*s);
    offset.set(.013*w*idle+.031*sway*flying,
      -.215*crouch+.082*push+.007*Math.sin(t*1.64)*idle+.048*recoil*flying,
      .047*crouch+.008*w*idle+.033*Math.cos(flap-.45)*flying*drive);
    chest.position.copy(rest).add(offset);
    chest.rotation.set(.17*crouch-.085*push+(.51+.135*recoil+.045*sway)*flying,
      .016*w*idle+.080*Math.sin(1.59*s+.4)*flying,
      .023*w*idle+(.09*sway+.048*beat)*flying);
    head.rotation.set(-.13*crouch-.30*flying-.081*recoil*flying,.10*Math.sin(t*.39)*idle+.15*bank,-.035*w);
    chest.updateWorldMatrix(true,false);
    worldToChest.copy(chest.matrixWorld).invert();
    chest.getWorldQuaternion(levelToChest).invert().multiply(heading.setFromAxisAngle(up,actorYaw));
    const shrug=smooth(Math.sin(t*.47),.73,1)*idle;
    for(const {sign,upper,fan} of wings){
      const localShrug=shrug*(sign<0?.80:1);
      const shoulder=-.83+.52*beat,outer=.88+.46*tipBeat;
      upper.rotation.order='YXZ';fan.rotation.order='YXZ';
      upper.rotation.set(-.08*open,sign*(.10*open+.04*bank),sign*(shoulder*open-.095*localShrug));
      fan.rotation.set(.06*open,sign*(-.18*open),sign*((outer-shoulder)*open+.14*localShrug));
    }
    for(const leg of legs)leg(s,flap,drive,bank,levelToChest,worldToChest);
  };
}

export function installVellumGuard(thing,gate,ground,camera,renderer,anim){
  const root=thing.group,home=root.position.clone(),yaw=Math.atan2(home.x-gate[0],home.z-gate[1]);
  const actor=new T.Group();actor.name='Vellum guard patrol';root.add(actor);thing.focusObject=actor;
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const tiers={},pending=new Set(),retry={},point=new T.Vector3(),tangent=new T.Vector3(),world=new T.Vector3();
  let initialOffset=32,shadowTime=-1,lastFlight=false,active=null,start=null;
  function load(tier){
    if(tiers[tier]||pending.has(tier)||performance.now()<(retry[tier]||0))return;
    pending.add(tier);
    loader.loadAsync('models/halls/vellum-guard'+(tier==='far'?'-lo':'')+'.glb').then(({scene:model})=>{
      const mesh=model.getObjectByName('Vellum');
      mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox,sz=b.getSize(new T.Vector3());
      const center=b.getCenter(new T.Vector3()),scale=130/Math.max(sz.x,sz.z);
      model.scale.setScalar(scale);model.position.set(-center.x*scale,-b.min.y*scale,-center.z*scale);
      mesh.castShadow=mesh.receiveShadow=true;mesh.material.metalness=0;mesh.material.envMapIntensity=.8;
      mesh.material.userData.e0=mesh.material.emissive.clone();thing.mats.push(mesh.material);
      // Include unfolded wing tips in culling and picking at both LODs.
      mesh.boundingSphere=new T.Sphere(new T.Vector3(0,.24,0),2.5);
      mesh.boundingBox=new T.Box3(new T.Vector3(-2.5,-1.2,-1.6),new T.Vector3(2.5,2.2,1.6));
      tiers[tier]={model,pose:bindGuard(model,thing,ground,yaw,scale,home.y)};
      model.visible=false;actor.add(model);
    }).catch(e=>{retry[tier]=performance.now()+10000;console.warn('Vellum guard '+tier,e);}).finally(()=>pending.delete(tier));
  }
  load('far');
  anim.push(t=>{
    if(!tiers.far)load('far');
    if(!tiers.far&&!tiers.close){if(!pending.has('far'))load('close');return;}
    if(start===null){start=t;initialOffset=location.hash==='#vellum-gargoyle'?54:32;}
    const s=(t-start+initialOffset)%78-61;
    const air=s>0&&s<flightTime, u=T.MathUtils.clamp(s/flightTime,0,1);
    const open=smooth(s,-1.22,.36)*(1-smooth(s,14.95,16.25));
    const flap=tau*(s*.82+.078*Math.sin(s*1.22));
    const glide=1-.95*smooth(s,5.4,7.0)*(1-smooth(s,9.9,11.0));
    const stroking=smooth(s,0,.44)*(1-smooth(s,13.85,14.75));
    const beat=T.MathUtils.lerp(1,Math.cos(flap)*glide,stroking);
    const tipBeat=T.MathUtils.lerp(1,Math.cos(flap-.49)*glide,stroking);
    let bank=0;actor.position.set(0,0,0);actor.rotation.set(0,yaw,0,'YXZ');
    if(air){
      const p=.74*u*u*(3-2*u)+.26*u;path.getPointAt(p,point);path.getTangentAt(p,tangent);
      const facing=Math.atan2(tangent.x,tangent.z),steer=smooth(s,.25,1.6)*(1-smooth(s,12.5,14.95));
      // Keep full heading through the back of the circuit and turn into the
      // guard stance during the landing flare.
      actor.position.copy(point).applyAxisAngle(up,yaw);
      const lift=11*Math.sin(Math.PI*u)*(1-smooth(s,2.2,4))+7.8*Math.sin(flap-.72)*glide*open*Math.sin(Math.PI*u);
      actor.position.y+=lift+26*(1-Math.exp(-3*s))*Math.exp(-.75*s)*(1-smooth(s,1.8,3.2));
      actor.rotation.y=yaw+facing*steer;
      bank=-.52*smooth(s,2,5)*(1-smooth(s,10.5,12.8));
      actor.rotation.z=bank;actor.rotation.x=-.36*smooth(s,0,.8)*(1-smooth(s,1.3,4))+.16*smooth(s,10,12)*(1-smooth(s,13,14.8));
    }
    const d=camera.position.distanceTo(world.copy(home).add(actor.position));
    if(d<1050&&!tiers.close)load('close');
    const choice=tiers.close&&(!tiers.far||d<(active===tiers.close?890:780))?tiers.close:tiers.far;
    if(choice!==active){
      if(active)active.model.visible=false;
      active=choice;active.model.visible=true;renderer.shadowMap.needsUpdate=true;
    }
    active.pose(t,s,open,beat,tipBeat,bank,flap,glide,actor.rotation.y);
    if((air!==lastFlight||(air&&t-shadowTime>.28))&&d<1200){renderer.shadowMap.needsUpdate=true;shadowTime=t;}
    lastFlight=air;
  });
}
