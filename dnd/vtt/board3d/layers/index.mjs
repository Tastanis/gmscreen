// Board layers registered with the 3D board (see integration.mjs `window.vtt3d.addLayer`).
// Each layer module exports a factory; register it here by name.
import {createDrawingsLayer} from './drawings.mjs';
import {createTemplatesLayer} from './templates.mjs';
import {createPersistentZonesLayer} from './persistent-zones.mjs';
import {createTerrainZonesLayer} from './terrain-zones.mjs';
import {createAurasLayer} from './auras.mjs';
import {createPingsLayer} from './pings.mjs';
import {createSlopeArrowsLayer} from './slope-arrows.mjs';

export function register(vtt3d){
 vtt3d.addLayer('drawings',createDrawingsLayer);
 vtt3d.addLayer('templates',createTemplatesLayer);
 vtt3d.addLayer('persistent-zones',createPersistentZonesLayer);
 vtt3d.addLayer('terrain-zones',createTerrainZonesLayer);
 vtt3d.addLayer('auras',createAurasLayer);
 vtt3d.addLayer('pings',createPingsLayer);
 vtt3d.addLayer('slope-arrows',createSlopeArrowsLayer);
}
