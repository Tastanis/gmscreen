import {confirmCharacterWrite} from './character-write.js';

export async function spendCharacterRecoveries(endpoint, character, cost, options={}) {
  const result=await confirmCharacterWrite(endpoint,'sync-vitals',{character,spendRecoveries:String(cost)},options);
  if(!Number.isInteger(result.spent))throw new Error('Recovery spending was not confirmed.');
  return result;
}
