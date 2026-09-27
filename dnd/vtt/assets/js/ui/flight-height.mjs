// Retained flight elevation for the disposable terrain sandbox.
export function advanceFlight(previous,token,ground){
 const x=token.column+(token.width||1)/2,y=token.row+(token.height||1)/2;
 if(!previous)return {x,y,z:ground(x,y)+1};
 let z=previous.z;
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(x-previous.x),Math.abs(y-previous.y))*8));
 for(let i=1;i<=steps;i++)z=Math.max(z,ground(previous.x+(x-previous.x)*i/steps,previous.y+(y-previous.y)*i/steps));
 return {x,y,z};
}
export function createFlightState(storage){
 let key='',records={},revision=0;
 const save=()=>storage.setItem(key,JSON.stringify(records));
 return {
  select(next){if(next===key)return;key=next;try{records=JSON.parse(storage.getItem(key)||'{}');}catch{records={};}revision++;},
  update(tokens,ground){let changed=false;for(const token of tokens){const id=token.id;if(!['fly','hover'].includes(token.movementMode)){if(records[id]){delete records[id];changed=true;}continue;}
   const next=Number.isFinite(token.flightHeight)?{x:token.column+(token.width||1)/2,y:token.row+(token.height||1)/2,z:Math.max(token.flightHeight,ground(token.column+(token.width||1)/2,token.row+(token.height||1)/2,token))}:advanceFlight(records[id],token,(x,y)=>ground(x,y,token));if(JSON.stringify(next)!==JSON.stringify(records[id])){records[id]=next;changed=true;}}
   if(changed){revision++;save();}
  },
  height(token,ground){return Math.max(token.flightHeight??records[token.id]?.z??ground(token.column+(token.width||1)/2,token.row+(token.height||1)/2)+1,ground(token.column+(token.width||1)/2,token.row+(token.height||1)/2));},
  set(token,z,ground){if(!Number.isFinite(z)||z<0||z>1000000)throw Error('Height must be between 0 and 1000000.');const x=token.column+(token.width||1)/2,y=token.row+(token.height||1)/2;records[token.id]={x,y,z:Math.max(z,ground(x,y))};revision++;save();},
  get revision(){return revision;}
 };
}
