import * as THREE from 'three';
import {compassDegrees} from '../compass-math.mjs';

// A very small compass at the bottom right of the board (Brandon, November 25, 2026: "add a very small compass at the
// bottom right of the map. That always points north. Don't really care which direction that is we just need to be
// able to tell directions."). North is the top of the map picture (rows going down). The needle turns as the camera
// does, in first person too. It sits above the distance readout shown while a token is held, and moves in from the
// right with whatever covers that side of the board (board-free-area.js --vtt-free-right).

const MARKUP = '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
  + '<circle class="vtt3d-compass__face" cx="24" cy="24" r="22"/>'
  + '<g class="vtt3d-compass__needle">'
  + '<path class="vtt3d-compass__north" d="M24 5 L29 24 L19 24 Z"/>'
  + '<path class="vtt3d-compass__south" d="M24 43 L29 24 L19 24 Z"/>'
  + '<text class="vtt3d-compass__n" x="24" y="19.5" text-anchor="middle">N</text>'
  + '</g><circle class="vtt3d-compass__pin" cx="24" cy="24" r="2"/></svg>';

export function createCompassLayer({ view, overlayHost }) {
  const el = document.createElement('div');
  el.className = 'vtt3d-compass';
  el.setAttribute('role', 'img');
  el.title = 'North';
  el.innerHTML = MARKUP;
  overlayHost.append(el);
  const needle = el.querySelector('.vtt3d-compass__needle');
  const forward = new THREE.Vector3(), up = new THREE.Vector3();
  let shown = null;

  // What covers the right of the page is measured from the page's edge; the board's own edge may already be inside it.
  function place() {
    const covered = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vtt-free-right')) || 0;
    const page = document.documentElement.clientWidth || window.innerWidth || 0;
    const edge = overlayHost.getBoundingClientRect().right;
    el.style.setProperty('--vtt3d-compass-in', `${Math.max(0, Math.round(covered - Math.max(0, page - edge)))}px`);
  }
  document.addEventListener('vtt:free-area', place);
  window.addEventListener('resize', place);
  place();

  const api = {
    update() {
      const camera = view?.camera;
      if (!camera) return;
      camera.getWorldDirection(forward);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const degrees = Math.round(compassDegrees(forward, up) * 2) / 2;
      if (degrees === shown) return;
      shown = degrees;
      needle.setAttribute('transform', `rotate(${degrees} 24 24)`);
      el.dataset.north = String(degrees);
      el.setAttribute('aria-label', `North is ${Math.round(degrees)} degrees clockwise from the top of the screen`);
    },
    summary: () => ({ north: shown }),
    dispose() {
      document.removeEventListener('vtt:free-area', place);
      window.removeEventListener('resize', place);
      el.remove();
      if (window.vtt3dLayers?.compass === api) delete window.vtt3dLayers.compass;
    },
  };
  (window.vtt3dLayers ??= {}).compass = api;
  return api;
}
