// Zones and auras are board layers now: layers/persistent-zones.mjs, layers/terrain-zones.mjs and
// layers/auras.mjs. This keeps the integration's `effects` hook and reports what those layers draw
// (vtt3dRenderer.metrics().effects).
export function createEffectOverlays(){
 const summary=()=>{const l=window.vtt3dLayers||{};return {zones:l.persistentZones?.summary().zones??0,terrainZones:l.terrainZones?.summary().zones??0,auras:l.auras?.summary().auras??0,unsupported:[]};};
 return {update(){},summary,dispose(){}};
}
