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

function makeLeg(upper,bend,claw,hind,correction){
  const thigh=bend.position.clone(),shin=claw.position.clone();
  const thighDir=thigh.clone().normalize(),shinDir=shin.clone().normalize();
  const ankle=thigh.clone().add(shin),target=new T.Vector3(),axis=new T.Vector3(),pole=new T.Vector3();
  const knee=new T.Vector3(),lower=new T.Vector3(),parentInv=new T.Quaternion(),flight=new T.Quaternion();
  const thighLen=thigh.length(),shinLen=shin.length();
  const rotation=new T.Euler();
  // The planted solution uses the bend plane of the original sculpt. During flight
  // it releases the ankle into a trailing pose and then draws the claws forward.
  return (offset,chestQ,tuck,stretch,reach,beat)=>{
    parentInv.copy(chestQ).invert();
    target.copy(upper.position).add(ankle).sub(offset);target.y+=correction;
    target.applyQuaternion(parentInv).sub(upper.position);
    const distance=Math.min(thighLen+shinLen-.00001,Math.max(Math.abs(thighLen-shinLen)+.00001,target.length()));
    axis.copy(target).normalize();pole.copy(thigh).addScaledVector(axis,-thigh.dot(axis)).normalize();
    const along=(thighLen*thighLen-shinLen*shinLen+distance*distance)/(2*distance);
    knee.copy(axis).multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,thighLen*thighLen-along*along)));
    upper.quaternion.setFromUnitVectors(thighDir,knee.normalize());
    lower.copy(axis).multiplyScalar(distance).addScaledVector(knee,-thighLen);
    bend.quaternion.setFromUnitVectors(shinDir,lower.normalize().applyQuaternion(parentInv.copy(upper.quaternion).invert()));
    claw.quaternion.copy(chestQ).multiply(upper.quaternion).multiply(bend.quaternion).invert();
    const airborne=Math.max(tuck,stretch,reach);
    flight.setFromEuler(rotation.set((hind?1.12:.84)*tuck+(hind?.56:.20)*stretch-(hind?.22:.42)*reach+.035*beat*tuck,0,0));
    upper.quaternion.slerp(flight,airborne);
    flight.setFromEuler(rotation.set((hind?-.65:-1.05)*tuck+.13*stretch+.15*reach,0,0));
    bend.quaternion.slerp(flight,airborne);
    flight.setFromEuler(rotation.set(.48*tuck+.30*stretch-.24*reach,0,0));claw.quaternion.slerp(flight,airborne);
  };
}

function bindGuard(model,thing,ground,yaw,scale,restY){
  const bone=n=>model.getObjectByName(n),chest=bone('Chest'),head=bone('Head');
  const rest=chest.position.clone(),offset=new T.Vector3(),wings=[],legs=[];
  for(const [side,sign] of [['L',-1],['R',1]]){
    wings.push({sign,upper:bone('Wing_'+side),fan:bone('WingFan_'+side)});
    for(const name of ['Arm','Haunch']){
      const hind=name==='Haunch',x=sign*(hind?34:14),z=hind?-29:37;
      const wx=thing.x+x*Math.cos(yaw)+z*Math.sin(yaw),wz=thing.z-x*Math.sin(yaw)+z*Math.cos(yaw);
      const correction=(ground(wx,wz)-restY+.55)/scale;
      legs.push(makeLeg(bone(name+'_'+side),bone(name+'Bend_'+side),bone(name+'Claw_'+side),hind,correction));
    }
  }
  return (t,s,open,beat,tipBeat,bank)=>{
    const tuck=smooth(s,.3,1.8)*(1-smooth(s,11.8,14.25));
    const stretch=smooth(s,.06,.36)*(1-smooth(s,.30,1.30));
    const reach=smooth(s,11.9,14.1)*(1-smooth(s,14.5,15.00));
    const crouch=smooth(s,-1.45,-.40)*(1-smooth(s,-.36,.15))+.72*smooth(s,14.90,15.20)*(1-smooth(s,15.22,16.28));
    const idle=1-open,w=Math.sin(t*.65)+.32*Math.sin(t*1.14);
    offset.set(.013*w*idle,-.107*crouch+.007*Math.sin(t*1.64)*idle,.027*crouch+.008*w*idle);
    chest.position.copy(rest).add(offset);
    chest.rotation.set(.083*crouch+.43*tuck+.045*beat*open,.016*w*idle,.023*w*idle);
    head.rotation.set(-.07*crouch-.096*open-.21*tuck-.026*beat*open,.10*Math.sin(t*.39)*idle+.15*bank,-.022*w);
    const shrug=smooth(Math.sin(t*.47),.73,1)*idle;
    for(const {sign,upper,fan} of wings){
      const localShrug=shrug*(sign<0?.80:1);
      const shoulder=-.83+.52*beat,outer=.88+.46*tipBeat;
      upper.rotation.order='YXZ';fan.rotation.order='YXZ';
      upper.rotation.set(-.08*open,sign*(.10*open+.04*bank),sign*(shoulder*open-.095*localShrug));
      fan.rotation.set(.06*open,sign*(-.18*open),sign*((outer-shoulder)*open+.14*localShrug));
    }
    for(const leg of legs)leg(offset,chest.quaternion,tuck,stretch,reach,beat);
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
    const beat=Math.cos(flap)*glide,tipBeat=Math.cos(flap-.49)*glide;
    let bank=0;actor.position.set(0,0,0);actor.rotation.set(0,yaw,0,'YXZ');
    if(air){
      const p=.74*u*u*(3-2*u)+.26*u;path.getPointAt(p,point);path.getTangentAt(p,tangent);
      const facing=Math.atan2(tangent.x,tangent.z),steer=smooth(s,.25,1.6)*(1-smooth(s,12.5,14.95));
      // Keep full heading through the back of the circuit and turn into the
      // guard stance during the landing flare.
      actor.position.copy(point).applyAxisAngle(up,yaw);
      const lift=11*Math.sin(Math.PI*u)*(1-smooth(s,2.2,4))+2.4*beat*open*Math.sin(Math.PI*u);
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
    active.pose(t,s,open,beat,tipBeat,bank);
    if((air!==lastFlight||(air&&t-shadowTime>.28))&&d<1200){renderer.shadowMap.needsUpdate=true;shadowTime=t;}
    lastFlight=air;
  });
}
