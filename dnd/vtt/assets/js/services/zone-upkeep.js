import {confirmResourceWrite} from './resource-write.js';

export async function spendZoneUpkeep(endpoint, {character,cost,resourceName}, options={}) {
  const result=await confirmResourceWrite(endpoint,{character,spend:String(cost),resourceName:resourceName || ''},options);
  if(typeof result.paid!=='boolean')throw new Error('Zone upkeep payment was not confirmed.');
  return result;
}
