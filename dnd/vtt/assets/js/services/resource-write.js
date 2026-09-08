import {confirmCharacterWrite} from './character-write.js';

export function confirmResourceWrite(endpoint, fields, options={}) {
  return confirmCharacterWrite(endpoint, 'sync-resource', fields, options);
}
