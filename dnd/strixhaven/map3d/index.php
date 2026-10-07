<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';

// Include navigation bar
require_once '../../includes/strix-nav.php';

// The 3D Strixhaven map. Everything it shows about a hex (image, GM information, players' notes),
// the pings and the travel path come from the flat map's own endpoints under ../map/, which decide
// what each user may see. This page holds no GM material itself.
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Strixhaven Map</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #0d0f13; font-family: system-ui, Segoe UI, sans-serif; color: #e8e6e0; }
  canvas#c { display: block; width: 100vw; height: 100vh; }
  #hud { display: none; position: fixed; left: 12px; top: 12px; background: rgba(14,16,20,.78); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.5; max-width: 250px; backdrop-filter: blur(4px); }
  #hud h1 { font-size: 14px; margin: 0 0 4px; }
  #hud .stat { font-variant-numeric: tabular-nums; color: #ffd98a; }
  #hud button { background: #2a2f3a; color: #e8e6e0; border: 1px solid #454c5c; border-radius: 5px; padding: 3px 7px; margin: 2px 2px 2px 0; font-size: 11px; cursor: pointer; }
  #hud button.on { background: #55633a; border-color: #8ea05a; }
  #hud .help { color: #a9adb6; margin-top: 6px; }
  #panel { position: fixed; right: 16px; top: 32px; width: 360px; max-height: calc(100vh - 48px); overflow-y: auto; box-sizing: border-box; padding: 16px 18px 14px; display: none; z-index: 6; color: #b8b0a2; font: 13px/1.5 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
    background: linear-gradient(180deg, #2a251e 0%, #1b1712 40%, #100d0a 100%); border-radius: 2px; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #6e5a33, inset 0 0 0 3px #241d12, inset 0 1px 0 3px rgba(255,255,255,.06), 0 14px 45px rgba(0,0,0,.9); }
  #panel h2 { font: 700 19px/1.2 'Cinzel', 'Palatino Linotype', serif; color: #f0d68a; margin: 0 28px 2px 0; letter-spacing: .04em; text-shadow: 0 0 12px rgba(200,169,94,.35), 0 2px 2px #000; }
  #panel h3 { font: 600 11px 'Cinzel', 'Palatino Linotype', serif; color: #c8a95e; letter-spacing: .14em; text-transform: uppercase; margin: 13px 0 5px; padding-bottom: 4px; border-bottom: 1px solid #3c3122; }
  #panel .muted { color: #8d8474; font-size: 12px; }
  #panel button, #panel .btn { display: inline-block; font: 600 11px 'Cinzel', 'Palatino Linotype', serif; letter-spacing: .08em; text-transform: uppercase; color: #c8a95e; background: linear-gradient(180deg, #3a352d 0%, #262119 45%, #16120d 100%); border: 0; border-radius: 1px; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #6e5a33; padding: 8px 12px; cursor: pointer; }
  #panel button:hover, #panel .btn:hover { color: #f0d68a; background: linear-gradient(180deg, #4a4335 0%, #322a1f 45%, #1d1811 100%); box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #a8853e; }
  #panel #pClose { position: absolute; right: 12px; top: 12px; padding: 2px 9px; font-size: 15px; }
  #pImgWrap { margin: 10px 0 8px; background: #0b0907; min-height: 96px; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #3c3122; padding: 3px; }
  #pImg { display: none; width: 100%; height: auto; max-height: 270px; object-fit: contain; cursor: zoom-in; }
  #imgBig { position: fixed; inset: 0; z-index: 100000; display: none; align-items: center; justify-content: center; background: rgba(6, 5, 4, .9); cursor: zoom-out; }
  #imgBig.on { display: flex; }
  #imgBig img { max-width: 94vw; max-height: 92vh; object-fit: contain; box-shadow: 0 0 0 1px #000, 0 0 0 3px #6e5a33, 0 0 0 4px #000, 0 20px 80px rgba(0,0,0,.9); background: #0b0907; }
  #imgBig .nav { position: absolute; top: 50%; transform: translateY(-50%); font: 600 44px 'Cinzel', Georgia, serif; color: #c8a95e; background: none; border: 0; padding: 20px 26px; cursor: pointer; text-shadow: 0 2px 8px #000; }
  #imgBig .nav:hover { color: #f0d68a; } #imgBigPrev { left: 8px; } #imgBigNext { right: 8px; }
  #imgBigCount { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; color: #b8b0a2; font: 13px 'Palatino Linotype', Georgia, serif; text-shadow: 0 1px 4px #000; }
  #pNoImg { color: #665f51; font-style: italic; padding: 28px 10px; text-align: center; }
  #panel textarea, #panel input[type=text] { width: 100%; box-sizing: border-box; background: #0d0b08; color: #cfc6b4; border: 1px solid #3c3122; font: 13px/1.5 'Palatino Linotype', 'Book Antiqua', Georgia, serif; padding: 7px 8px; resize: vertical; outline: none; }
  #panel textarea:focus, #panel input[type=text]:focus { border-color: #a8853e; }
  #panel input[type=text] { margin-bottom: 5px; }
  .gm-only { display: none; } body.is-gm div.gm-only { display: block; }
  #pRow { display: flex; gap: 8px; align-items: center; margin-top: 12px; } #pStatus { margin-left: auto; color: #8d8474; font-size: 12px; }
  #pShown { display: block; margin-top: 6px; }
  body.is-gm button.gm-only { display: inline-block; }
  #pNav { display: none; align-items: center; gap: 8px; margin: -2px 0 8px; } #pNav button { padding: 3px 10px; font-size: 14px; } #pCount { color: #8d8474; font-size: 12px; min-width: 44px; text-align: center; } #pDel { margin-left: auto; padding: 5px 9px !important; font-size: 10px !important; }
  #pathBar { position: fixed; left: 16px; bottom: 16px; z-index: 6; max-width: calc(100vw - 420px); display: flex; flex-direction: column; gap: 6px; align-items: flex-start; font: 13px/1.4 'Palatino Linotype', 'Book Antiqua', Georgia, serif; color: #b8b0a2; }
  #pathBar button { font: 600 11px 'Cinzel', 'Palatino Linotype', serif; letter-spacing: .08em; text-transform: uppercase; color: #c8a95e; background: linear-gradient(180deg, #3a352d 0%, #262119 45%, #16120d 100%); border: 0; border-radius: 1px; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #6e5a33; padding: 8px 11px; cursor: pointer; }
  #barRow { display: flex; gap: 6px; }
  #pathBar button:hover { color: #f0d68a; } #pathBar button.on { color: #f0d68a; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #d4b46a; background: linear-gradient(180deg, #5a4a2a 0%, #3a2e18 45%, #221a0e 100%); }
  #pathTools, #pathNoteRow, #pathDiff { display: none; flex-wrap: wrap; gap: 5px; align-items: center; }
  #pathTools, #pathNoteRow { padding: 8px 10px; background: linear-gradient(180deg, #2a251e 0%, #1b1712 40%, #100d0a 100%); box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #6e5a33, 0 8px 24px rgba(0,0,0,.8); }
  #pathTotal { color: #f0d68a; margin-left: 8px; font-variant-numeric: tabular-nums; } #pathMsg { color: #cfc6b4; text-shadow: 0 1px 3px #000, 0 0 6px #000; min-height: 18px; }
  #pathNote { width: 220px; background: #0d0b08; color: #cfc6b4; border: 1px solid #3c3122; font: inherit; padding: 6px 8px; outline: none; }
  #pathDiff .sep { margin: 0 2px 0 10px; color: #8d8474; } #pathDiff button[data-diff=fast].on { color: #7dffac; } #pathDiff button[data-diff=yellow].on { color: #ffe86a; } #pathDiff button[data-diff=red].on { color: #ff7a6a; }
  body.touring .strix-mini-nav, body.touring #pathBar, body.touring #panel, body.touring #tip, body.touring #imgBig { display: none !important; }
  #tip { position: fixed; left: 0; top: 0; display: none; pointer-events: none; background: rgba(14,16,20,.9); border: 1px solid #d8c48a; border-radius: 5px; padding: 3px 8px; font-size: 12px; white-space: nowrap; z-index: 5; }
  #labels { display: none; position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
  .lbl { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); text-align: center; pointer-events: auto; cursor: pointer; white-space: nowrap; transition: opacity .25s; text-shadow: 0 1px 3px #000, 0 0 6px #000; font-size: 12px; font-weight: 600; }
  .lbl .ico { display: block; margin: 0 auto 2px; width: 30px; height: 30px; line-height: 30px; font-size: 17px; border-radius: 50%; background: rgba(16,18,24,.82); border: 2px solid #d8c48a; box-shadow: 0 2px 6px rgba(0,0,0,.6); }
  #labels.near .lbl .ico { display: none; }
  #labels.near .lbl { font-size: 11px; font-weight: 500; }
  #loading { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #0d0f13; font-size: 16px; z-index: 10; text-align: center; padding: 20px; }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&display=swap">
<script type="importmap">
{ "imports": {
  "three": "./lib/three/build/three.module.js",
  "three/addons/": "./lib/three/examples/jsm/",
<?php $sxu = dirname($_SERVER['SCRIPT_NAME']) . '/lib/three/examples/jsm/controls/OrbitControls.js'; echo '  ' . json_encode($sxu, JSON_UNESCAPED_SLASHES) . ': ' . json_encode($sxu . '?v=' . @filemtime(__DIR__ . '/lib/three/examples/jsm/controls/OrbitControls.js'), JSON_UNESCAPED_SLASHES) . "
"; ?>
} }
</script>
</head>
<body>
<?php renderStrixNav('map'); ?>
<canvas id="c"></canvas>
<div id="labels"></div>
<div id="hud">
  <h1>Strixhaven 3D sandbox</h1>
  <div><span class="stat" id="fps">-- fps</span> &middot; <span id="tris">--</span> tris &middot; <span id="calls">--</span> draws</div>
  <div id="gen" style="color:#a9adb6"></div>
  <div style="margin-top:6px">
    <button id="bGrid" class="on">Hex grid (G)</button>
    <button id="bBloom" class="on">Lava glow</button>
    <button id="bShadow" class="on">Shadows</button>
    <button id="bLabels" class="on">Labels</button>
  </div>
  <div style="margin-top:4px">
    <button id="bOver">Overview</button>
    <button id="bVolc">Volcanoes</button>
    <button id="bPris">Furygale</button>
    <button id="bConj">Conjurot Hall</button>
    <button id="bCen">Central campus</button>
  </div>
  <div class="help">
    <b>Right-drag</b>: move the map<br>
    <b>Middle-drag</b>: rotate / tilt camera<br>
    <b>Wheel</b>: zoom toward cursor<br>
    <b>Click</b>: open a hex or a thing<br>
    Double-click: fly to it &middot; WASD: fly
  </div>
</div>
<div id="panel">
  <button id="pClose" title="Close">&times;</button>
  <h2 id="pTitle">Hex</h2>
  <div id="pSub" class="muted"></div>
  <div id="pImgWrap"><img id="pImg" alt=""><div id="pNoImg"></div></div>
  <div id="pNav"><button id="pPrev" title="Previous image">&lsaquo;</button><span id="pCount"></span><button id="pNext" title="Next image">&rsaquo;</button><button id="pDel" class="gm-only">Delete image</button></div>
  <div class="gm-only"><button id="pReveal"></button> <label class="btn" for="pFile">Add image</label><input type="file" id="pFile" accept="image/*" hidden><span id="pShown" class="muted"></span></div>
  <div class="gm-only"><h3>GM information</h3><input type="text" id="pGmTitle" placeholder="Name (GM only)"><textarea id="pGmNotes" rows="7" placeholder="Only the GM ever sees this"></textarea></div>
  <h3>Players' notes</h3>
  <div class="gm-only"><input type="text" id="pPlTitle" placeholder="Name the players see"></div>
  <textarea id="pNotes" rows="5"></textarea>
  <div id="pRow"><button id="pSave">Save</button><button id="pFly">Fly here</button><span id="pStatus"></span></div>
</div>
<div id="pathBar">
  <div id="pathMsg"></div>
  <div id="pathNoteRow"><span id="pathNoteAt"></span><input type="text" id="pathNote" maxlength="80" placeholder="Where to?"><button id="pathSet">Set</button><button id="pathRemove">Remove</button></div>
  <div id="pathTools"><button data-tool="marker">Destination</button><button data-tool="draw">Draw</button><button id="pathNew">New line</button><button data-tool="delete">Delete</button><button data-tool="terrain" class="gm-only">Terrain</button>
    <span id="pathDiff"><button data-diff="normal">Normal</button><button data-diff="fast">Easy</button><button data-diff="yellow">Yellow</button><button data-diff="red">Red</button><span class="sep">Brush</span><button data-brush="0">Small</button><button data-brush="1">Medium</button><button data-brush="2">Large</button></span>
    <button id="pathUndo">Undo</button><button id="pathClear">Clear all</button><span id="pathTotal"></span></div>
  <div id="barRow"><button id="pathToggle">Player path</button><button id="tpToggle" title="Show the teleportation circles">Circles</button></div>
</div>
<div id="imgBig"><button class="nav" id="imgBigPrev" title="Previous image">&lsaquo;</button><img id="imgBigImg" alt=""><button class="nav" id="imgBigNext" title="Next image">&rsaquo;</button><div id="imgBigCount"></div></div>
<div id="tip"></div>
<div id="loading">Loading 3D engine&hellip;</div>

<script>
  window.addEventListener('error', e => {
    const l = document.getElementById('loading');
    l.style.display = 'flex';
    l.textContent = 'Error: ' + (e.message || 'failed to load a script (needs internet for the 3D library)');
  });
</script>
<script type="module">
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ------------------------------------------------------------------ constants
const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';
const S = 1.4;                                                  // world scale: bigger hexes, same hex count
const DR = 50, HEX_R = DR * S, COLS = 36, ROWS = 36, SQ3 = Math.sqrt(3);
const DW = COLS * 1.5 * DR, DD = ROWS * SQ3 * DR;                // design space: layout and sculpting are authored here
const MAP_W = DW * S, MAP_D = DD * S;                            // world space: same 36x36 hex footprint as the live map image
const NX = LOW ? 480 : 880, NZ = Math.round(NX * MAP_D / MAP_W);
const DX = MAP_W / (NX - 1), DZ = MAP_D / (NZ - 1);
// live map: image origin sits at hexToPixel(0,20); keep that so hex ids match
const OFFX = MAP_W / 2, OFFZ = MAP_D / 2 + 20 * SQ3 * HEX_R;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
const X = u => (u - 0.5) * DW, Z = v => (v - 0.5) * DD;            // map fraction -> design units
const uvs = a => a.map(([u, v]) => [X(u), Z(v)]);
const Wp = p => [p[0] * S, p[1] * S];                             // design -> world
// snap a design point to the nearest hex centre / hex corner, so buildings sit cleanly on 1, 3 or 7 hexes
const snapC = (u, v) => { const h = worldToHex(X(u) * S, Z(v) * S); return [h.x / S, h.z / S]; };
const hexD = (q, r) => { const h = hexAt(q, r); return [h.x / S, h.z / S]; };     // a live-map hex id -> design position
const snapV = (u, v) => { const h = worldToHex(X(u) * S - HEX_R, Z(v) * S); return [(h.x + HEX_R) / S, h.z / S]; };
const C3 = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261003);

// Each campus gets its own light: a low-res tint map over the whole board, multiplied into every lit material.
// It rides on the engine's shared fog code, so trees, buildings, water and terrain all pick it up without per-material work.
const GRADE = new THREE.DataTexture(new Uint8Array(128 * 128 * 4).fill(127), 128, 128, THREE.RGBAFormat);
GRADE.magFilter = GRADE.minFilter = THREE.LinearFilter; GRADE.needsUpdate = true;
{ const gu = { uSxGrade: { value: GRADE }, uSxMap: { value: new THREE.Vector2(MAP_W, MAP_D) } };
  for (const k of ['basic', 'lambert', 'phong', 'standard', 'physical', 'toon', 'points']) Object.assign(THREE.ShaderLib[k].uniforms, gu);
  THREE.ShaderChunk.fog_pars_vertex += '\n#ifdef USE_FOG\nvarying vec3 vSxW;\n#endif\n';
  THREE.ShaderChunk.fog_vertex += '\n#ifdef USE_FOG\n{ vec4 sxp = vec4( transformed, 1.0 );\n#ifdef USE_INSTANCING\nsxp = instanceMatrix * sxp;\n#endif\nvSxW = ( modelMatrix * sxp ).xyz; }\n#endif\n';
  THREE.ShaderChunk.fog_pars_fragment += '\n#ifdef USE_FOG\nvarying vec3 vSxW; uniform sampler2D uSxGrade; uniform vec2 uSxMap;\n#endif\n';
  THREE.ShaderChunk.fog_fragment = '#ifdef USE_FOG\ngl_FragColor.rgb *= texture2D( uSxGrade, vec2( vSxW.x / uSxMap.x + 0.5, vSxW.z / uSxMap.y + 0.5 ) ).rgb * 2.0;\n#endif\n' + THREE.ShaderChunk.fog_fragment; }

// ------------------------------------------------------------------ noise
function makeNoise(seed) {
  const r = mulberry32(seed), p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
  const g = [1,1, -1,1, 1,-1, -1,-1, 1,0, -1,0, 1,0, -1,0, 0,1, 0,-1, 0,1, 0,-1];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (x, y) => {
    const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const gi = pm[ii + perm[jj]] * 2; t0 *= t0; n += t0 * t0 * (g[gi] * x0 + g[gi + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const gi = pm[ii + i1 + perm[jj + j1]] * 2; t1 *= t1; n += t1 * t1 * (g[gi] * x1 + g[gi + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const gi = pm[ii + 1 + perm[jj + 1]] * 2; t2 *= t2; n += t2 * t2 * (g[gi] * x2 + g[gi + 1] * y2); }
    return 70 * n;
  };
}
const nz = makeNoise(7);
function fbm(x, y, o) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * nz(x, y); n += a; x = x * 2.03 + 19.1; y = y * 2.03 - 7.7; a *= 0.5; } return s / n; }
function ridged(x, y, o) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { let v = 1 - Math.abs(nz(x, y)); v *= v; s += a * v; n += a; x = x * 2.07 + 31.3; y = y * 2.07 + 11.9; a *= 0.5; } return s / n; }

// ------------------------------------------------------------------ layout (u,v = 0..1 across the map, like the old image)
const CENTRAL = 0, QUAN = 1, SILV = 2, DUNE = 3, BOG = 4, WITH = 5, PRIS = 6, VOLCB = 7, LORE = 8;
const BIOME_NAMES = ['Central Campus', 'Quandrix', 'Silverquill', 'Silverquill Dunes', 'Detention Bog', 'Witherbloom', 'Prismari', 'Prismari Volcanoes', 'Lorehold'];
const SEED_UV = [
  [[.50,.44],[.50,.34],[.50,.54],[.47,.62],[.52,.26],[.60,.545]],
  [[.50,.10],[.36,.06],[.64,.06],[.42,.17],[.58,.17],[.50,.02],[.28,.05],[.29,.15],[.25,.02],[.34,.15],[.19,.04],[.17,.09],[.23,.11]],   // Quandrix now runs on west across the top of the map
  [[.75,.30],[.86,.12],[.74,.14],[.90,.30],[.80,.42],[.94,.44],[.75,.42],[.74,.53]],
  [[.86,.60],[.95,.60]],                                                                                                      // the dunes: a small corner in the east
  [[.84,.72],[.94,.80],[.76,.78],[.88,.90],[.95,.68]],
  [[.58,.74],[.55,.88],[.70,.94],[.45,.92],[.64,.84],[.50,.78],[.60,.98],[.60,.66],[.675,.655]],                                           // Witherbloom reaches north past the Greenward
  [[.30,.76],[.14,.80],[.06,.90],[.22,.90],[.34,.92],[.38,.68],[.06,.72],[.28,.73],[.05,.65]],
  [[.04,.54],[.12,.54],[.21,.53],[.30,.55],[.15,.61],[.26,.61],[.21,.66]],
  [[.25,.30],[.08,.13],[.16,.21],[.10,.30],[.20,.42],[.06,.45],[.24,.44],[.18,.22]],
];
const SEEDS = SEED_UV.map(l => l.map(([u, v]) => [X(u), Z(v)]));
const WT = new Float64Array(9), DT = new Float64Array(9);
function weights(x, z) {
  const wx = x + 110 * fbm(x / 520, z / 520, 3), wz = z + 110 * fbm(x / 520 + 31.7, z / 520 - 17.3, 3);
  let dmin = 1e9;
  for (let b = 0; b < 9; b++) {
    let d = 1e18; const s = SEEDS[b];
    for (let k = 0; k < s.length; k++) { const ex = wx - s[k][0], ez = wz - s[k][1], e = ex * ex + ez * ez; if (e < d) d = e; }
    d = Math.sqrt(d); DT[b] = d; if (d < dmin) dmin = d;
  }
  let sum = 0;
  for (let b = 0; b < 9; b++) { const w = Math.exp(-(DT[b] - dmin) / 60); WT[b] = w; sum += w; }
  for (let b = 0; b < 9; b++) WT[b] /= sum;
}

// paths
function makePath(dp, smooth, pad) {
  let pts = dp.map(([x, z]) => new THREE.Vector3(x, 0, z));
  if (smooth) pts = new THREE.CatmullRomCurve3(pts).getPoints(smooth);
  const a = new Float64Array(pts.length * 2), cum = new Float64Array(pts.length);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  pts.forEach((p, i) => { a[2 * i] = p.x; a[2 * i + 1] = p.z; if (i) cum[i] = cum[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
  return { pts: a, cum, len: cum[pts.length - 1], x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}
let PD_T = 0;
function polyDist(p, x, z) {
  if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return 1e9;
  const a = p.pts, n = a.length / 2; let best = 1e18, bt = 0;
  for (let i = 0; i < n - 1; i++) {
    const ax = a[2 * i], az = a[2 * i + 1], dx = a[2 * i + 2] - ax, dz = a[2 * i + 3] - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz); t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x, pz = az + dz * t - z, d = px * px + pz * pz;
    if (d < best) { best = d; bt = (p.cum[i] + t * (p.cum[i + 1] - p.cum[i])) / p.len; }
  }
  PD_T = bt; return Math.sqrt(best);
}

// landmarks (design units)
const CEN = snapC(.50, .44);
const TORUS = snapC(.50, .095);
const CITY = snapC(.80, .33);
const WIDD = hexD(24, 33);
const PRISHALL = (() => { const a = hexD(10, 41), b = hexD(11, 40), c = hexD(11, 41); return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]; })();   // the corner shared by its three live-map hexes
const STADIUM = snapC(.50, .585);
const KOLL = snapV(.10, .30);
const WILT = snapC(.555, .745), CULT = snapV(.60, .105), ARITH = snapC(.405, .105), ROSE = snapC(.695, .437), DRAMA = snapV(.655, .335), BLOOM = snapC(.4167, .024);
const GORCH = hexD(8, 49), BRINE = hexD(8, 51), COLD = hexD(12, 48);                                   // Gravity Orchard, Brinewhale Oathpool
const LAKE = [X(.225), Z(.625)], LAKE_Y = 23;
// lava lake: one big basin, plus a bay pushing north between the two rim volcanoes and up into the mountains
const LAKE_LOBES = [[X(.225), Z(.625), 310, 195], [X(.229), Z(.560), 70, 125]];
function lakeE0(x, z) { let e = 1e9; for (const l of LAKE_LOBES) { const v = Math.hypot((x - l[0]) / l[2], (z - l[1]) / l[3]); if (v < e) e = v; } return e; }
const FURY = [X(.066), Z(.655)];                                    // Furygale: where almost all the spires stand
const FOREST = [[X(.958), Z(.170), 100, 150], [X(.83), Z(.478), 520, 160]];   // [x, z, radius x, radius z]: Scarwood, and the broad belt of dark wood above the dunes
const CONE_EXP = 1.55;
const WIND_A = 0.5, WIND = [Math.cos(WIND_A), Math.sin(WIND_A)];   // prevailing wind over Prismari
const VOLC = [  // two on the northern rim of the lake, two rising out of the lake itself
  { u: .1389, v: .5694, H: 285, r: 230, rc: 34, s: 1.3, flow: [[.1389,.5694],[.158,.602],[.177,.624]] },   // the great volcano, big enough to carry the fire giants' works; centred on the Cinder Halo's hex
  { u: .2778, v: .5278, H: 265, r: 165, rc: 26, s: 5.1, flow: [[.2778,.5278],[.270,.565],[.262,.594]] },   // Valthrex's mountain, on live-map hex 10,34
  { u: .185, v: .634, H: 170, r: 115, rc: 19, s: 9.7, flow: [[.185,.634],[.178,.655],[.172,.669]] },
  { u: .268, v: .612, H: 145, r: 100, rc: 17, s: 3.9, flow: [[.268,.612],[.280,.630],[.288,.643]] },
];
for (const v of VOLC) {
  v.x = X(v.u); v.z = Z(v.v); v.tRim = 1 - v.rc / v.r;
  v.rimH = 40 + v.H * Math.pow(v.tRim, CONE_EXP); v.lavaLvl = v.rimH - 15;
  if (v.flow) v.path = makePath(uvs(v.flow), 14, 60);
}
const OUTLETS = [makePath(uvs([[.152,.686],[.130,.742],[.113,.806]]), 14, 60), makePath(uvs([[.180,.682],[.177,.722],[.188,.762],[.206,.801]]), 18, 60)];
const RIVERS = [
  { p: makePath(uvs([[-.02,.776],[.056,.778],[.115,.797],[.22,.80],[.33,.76],[.42,.71],[.475,.735],[.505,.79]]), 60, 90), w: 17 },
  { p: makePath(uvs([[.102,.951],[.128,.938],[.155,.905],[.175,.86],[.20,.803]]), 30, 80), w: 11 },   // runs to the foot of the south-west cliff, where it climbs (Penta Falls)
  { p: makePath(uvs([[.34,.553],[.365,.578],[.386,.598],[.405,.635],[.415,.675],[.42,.71]]), 40, 80), w: 12 },   // runs up to the mountains along the edge of Prismari
];
// named mountains: [u, v, radius, height, kind]  kind 0 = dark volcanic rock, 1 = Prismari stone
const MOUNTS = [
  [.030,.530,105,200,0], [.068,.565,95,170,0], [.022,.588,85,140,0],                                   // west of the last volcano
  [.0556,.818,170,340,1],                                   // the big south-west massif
  [.170,.948,105,190,1], [.245,.968,135,290,1], [.212,1.005,110,210,1], [.2222,.9507,70,75,1],                                          // southern range: the peaks round the Oathpool village, and the Gravity Orchard's hill
  [.305,.918,100,190,1], [.345,.962,125,245,1], [.305,.998,95,170,1], [.372,.928,90,160,1], [.395,.975,105,190,1], [.428,.992,85,130,1], [.028,.640,78,115,1], [.380,.542,120,235,0],   // last two: the hill behind the Archive door, and the mountain Losheal is building on   // ...scattered on east into Witherbloom
].map(([u, v, r, H, kind], i) => ({ x: X(u), z: Z(v), r, H, kind, s: i * 3.7 + 1 }));
// the raised south-west corner and the river that runs across its top
const PLAT_Y = 110, PEARL = hexD(2, 54), STAR = hexD(8, 41), LOSH = [X(.380), Z(.542)];
const THORN = (() => { const h = [[15, 45], [16, 44], [16, 45], [15, 46], [16, 46]].map(([q, r]) => hexD(q, r)); return [h.reduce((a, p) => a + p[0], 0) / 5, h.reduce((a, p) => a + p[1], 0) / 5]; })();
const PLATRIV = makePath(uvs([[.089,.958],[.075,.965],[.0556,.972],[.03,.985],[-.012,1.0]]), 20, 40);
const CLIFF = [X(.094), Z(.955), .8, -.6];                       // a point on the cliff line at the falls, and the direction the cliff faces
const DCOIL = hexD(2, 41), ELOW = hexD(5, 52), ARCHV = hexD(2, 42);
// Tidal Bell Mouths: each is cut into the river bank, facing the water. Lip position, the direction toward the river, and how far the lip stands from the river's centre line
const BELLS = [[4, 47], [5, 47], [6, 46], [6, 47], [6, 48], [7, 46]].map(([q, r]) => { const p = hexD(q, r); let b = 1e9, bi = 0, bR = RIVERS[0];
  for (const Rv of [RIVERS[0], RIVERS[1]]) { const a = Rv.p.pts; for (let i = 0; i < a.length; i += 2) { const d = Math.hypot(a[i] - p[0], a[i + 1] - p[1]); if (d < b) { b = d; bi = i; bR = Rv; } } }
  const a = bR.p.pts, i0 = Math.max(bi - 2, 0), i1 = Math.min(bi + 2, a.length - 2), tx = a[i1] - a[i0], tz = a[i1 + 1] - a[i0 + 1], tl = Math.hypot(tx, tz), nx = -tz / tl, nz = tx / tl;
  const sd = (p[0] - a[bi]) * nx + (p[1] - a[bi + 1]) * nz < 0 ? -1 : 1, ld = bR.w * 1.8;
  return { x: a[bi] + nx * sd * ld, z: a[bi + 1] + nz * sd * ld, ux: -nx * sd, uz: -nz * sd, ld }; });
// streams that run off the Rainspires' mountain and down into the river
const STREAMS = [[[.0556,.813],[.060,.803],[.055,.793],[.060,.7805]], [[.060,.816],[.074,.810],[.086,.800],[.101,.7935]], [[.051,.815],[.040,.806],[.028,.795],[.016,.7775]]].map(p => makePath(uvs(p), 30, 16));
const platQ = (x, z) => { const dF = Math.hypot(x - CLIFF[0], z - CLIFF[1]); return -((x - CLIFF[0]) * CLIFF[2] + (z - CLIFF[1]) * CLIFF[3]) + 20 * fbm(x / 120, z / 120, 2) * sstep(35, 130, dF) + 5 * fbm(x / 28, z / 28, 2) * sstep(20, 60, dF); };
const FXSCALE = { value: 1000 };
// Lorehold locations (live-map hexes)
const KEYW = hexD(2, 28), MONU = hexD(2, 30), SCRIP = hexD(3, 31), VAULT = hexD(5, 26), BKF = hexD(5, 34), BKF2 = hexD(4, 34), MILL = hexD(6, 24), BONE1 = hexD(7, 23), BONE2 = hexD(6, 23), P492 = hexD(11, 25), HEAP = hexD(8, 34), COFD = hexD(12, 31), COLDL = hexD(3, 23);
const PHX = hexD(7, 26);                                              // the Phalanx Crucible, moved off the road onto the hill north-east of the hall
const WSCAR = makePath(uvs([[.228,.226],[.25,.236],[.278,.25],[.306,.264],[.333,.25],[.361,.236],[.380,.224]]), 40, 60);   // the White Scar: an old river bed
const BRKL = [(hexD(2, 34)[0] + hexD(3, 37)[0]) / 2, (hexD(2, 34)[1] + hexD(3, 37)[1]) / 2];
const THUMP = [[11, 28], [15, 31], [19, 21], [22, 23], [22, 28]];   // the Large Pillars, one beside each road
// Quandrix locations (live-map hexes). Several are given more than their one hex so there is room to build them
const hexC = (...hx) => { const p = hx.map(([q, r]) => hexD(q, r)); return [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length]; };
const CHALK = hexD(13, 15), ORIG = hexD(13, 18), BEAST = hexC([11, 18], [11, 17], [10, 18]), SNARL = hexC([8, 19], [7, 20], [8, 20]), VICE = hexD(25, 11), MENAG = hexD(23, 11), MOBI = hexD(17, 18);
const MESA = [CHALK[0], Z(.012)];                                    // the chalk mesa stands north of its hex, against the edge of the map
const GORGE = makePath(uvs([[.386,.128],[.375,.126],[.361,.125],[.340,.132],[.318,.146],[.296,.158],[.272,.170],[.255,.184]]), 50, 60);   // Origami Gorge: a winding cut that shallows away to nothing at both ends
// Silverquill. The city is every hex that holds one of its places, plus the hexes touching those, less the hexes of places that stand outside it. The wall follows the edge of that, whatever shape it comes to
const SQ_SEED = [[29, 17], [28, 15], [28, 16], [28, 17], [27, 16], [27, 15], [28, 14], [28, 13], [29, 13], [29, 14], [29, 15], [32, 15], [31, 16], [30, 17], [29, 18], [31, 15], [33, 15], [32, 14], [32, 16]];
const SQ_GAP = [[30, 10], [31, 9], [31, 10], [30, 11], [30, 9], [29, 10], [28, 11], [29, 11], [28, 10], [27, 11], [27, 12], [28, 12], [31, 8], [32, 8], [32, 7], [29, 12]];   // kept clear of the city, so the wall stays a full hex short of the ink quarter
const SQ_INK = [...SQ_GAP, [30, 8], [31, 7], [29, 9], [28, 9], [27, 10], [32, 6]];   // the ink quarter: outside the wall, north of it, on bare black marble
const SQ_OUT = [[28, 21], [28, 22], [29, 21], [26, 21], [26, 22], [27, 21], [26, 19], [34, 16], [25, 17], [24, 17], [25, 16], [24, 16], [34, 6], [27, 19], [30, 19], ...SQ_INK];
const SQ_HEX = (() => { const st = new Set(), out = new Set(SQ_OUT.map(([q, r]) => q * 100 + r)); for (const [q, r] of SQ_SEED) for (const [dq, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) { const k = (q + dq) * 100 + r + dr; if (!out.has(k) && q + dq <= 35) st.add(k); } return st; })();
const hexOutline = (HS, off) => { const ed = new Map(), key = p => Math.round(p[0] * 4) + ',' + Math.round(p[1] * 4), NB = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];   // neighbour i shares the edge that starts at corner i
  for (const k of HS) { const q = Math.floor(k / 100), r = k - q * 100, c = hexD(q, r); NB.forEach(([dq, dr], ci) => { if (HS.has((q + dq) * 100 + r + dr)) return; const a0 = ci * Math.PI / 3, a1 = a0 + Math.PI / 3, A = [c[0] + Math.cos(a0) * DR, c[1] + Math.sin(a0) * DR], B = [c[0] + Math.cos(a1) * DR, c[1] + Math.sin(a1) * DR]; ed.set(key(A), [A, B]); }); }
  let best = []; const seen = new Set(); for (const [k0, e0] of ed) { if (seen.has(k0)) continue; const loop = []; let e = e0, k = k0; while (e && !seen.has(k)) { seen.add(k); loop.push([(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2]); k = key(e[1]); e = ed.get(k); } if (loop.length > best.length) best = loop; }   // the middles of the edges: a zigzag of hex sides becomes a straight run
  for (let it = 0; it < 2; it++) { const o = []; best.forEach((p, i) => { const q = best[(i + 1) % best.length]; o.push([p[0] * .75 + q[0] * .25, p[1] * .75 + q[1] * .25], [p[0] * .25 + q[0] * .75, p[1] * .25 + q[1] * .75]); }); best = o; }   // and the corners rounded off
  let ar = 0; best.forEach((p, i) => { const q = best[(i + 1) % best.length]; ar += p[0] * q[1] - q[0] * p[1]; }); const sg = ar > 0 ? 1 : -1;
  return best.map((p, i) => { const a = best[(i - 1 + best.length) % best.length], b = best[(i + 1) % best.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [p[0] + dz / l * sg * off, p[1] - dx / l * sg * off, dz / l * sg, -dx / l * sg]; }); };   // [x, z, outward normal x, z]
const SQWALL = hexOutline(SQ_HEX, 6);
const SQPATH = makePath([...SQWALL, SQWALL[0]].map(p => [p[0], p[1]]), 0, 30);
const sqInside = (x, z) => { if (x < SQPATH.x0 || x > SQPATH.x1 || z < SQPATH.z0 || z > SQPATH.z1) return false; let ins = false; for (let i = 0, j = SQWALL.length - 1; i < SQWALL.length; j = i++) { const a = SQWALL[i], b = SQWALL[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; };
const IQWALL = hexOutline(new Set(SQ_INK.map(([q, r]) => q * 100 + r)), 10), IQPATH = makePath([...IQWALL, IQWALL[0]].map(p => [p[0], p[1]]), 0, 30);
const inkQ = (x, z) => { if (Math.hypot(x - FOUNT[0], z - FOUNT[1]) < 116 || Math.hypot(x - HATCH[0], z - HATCH[1]) < 72) return true; if (x < IQPATH.x0 || x > IQPATH.x1 || z < IQPATH.z0 || z > IQPATH.z1) return false; let ins = false; for (let i = 0, j = IQWALL.length - 1; i < IQWALL.length; j = i++) { const a = IQWALL[i], b = IQWALL[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; } return ins; };
const SQGATE = (() => { const a = hexD(28, 18), b = hexD(27, 19), g = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let bp = null, bd = 1e9; const n = SQWALL.length;   // the gate stands where the wall crosses the line from the hall through hex 28,18
  for (let i = 0; i < n; i++) { const p = SQWALL[i], q = SQWALL[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], t = clamp(((g[0] - p[0]) * dx + (g[1] - p[1]) * dz) / (dx * dx + dz * dz), 0, 1), x = p[0] + dx * t, z = p[1] + dz * t, d = Math.hypot(x - g[0], z - g[1]); if (d < bd) { bd = d; bp = [x, z, Math.atan2(p[3] + q[3], p[2] + q[2])]; } } return bp; })();   // [x, z, the angle that points out of the city]
const FOUNT = hexC([30, 9], [31, 8], [31, 9], [30, 10], [30, 8]), INKLAKE = [[29, 9], [28, 10], [29, 10], [28, 9], [27, 10], [27, 11], [28, 11]].map(([q, r]) => hexD(q, r)), HATCH = (() => { const p = hexC([31, 7], [32, 7], [32, 6]); return [p[0] + 11, p[1] - 26]; })();   // nudged north-east, clear of the fountain plaza's kerb
// Witherbloom
const GREENW = hexD(22, 32), SPOREW = hexD(22, 35), WILLOW = hexD(21, 38), SALLOW = hexD(23, 37), BITTER = hexD(24, 37), SLEECH = hexD(22, 39), APIARY = hexC([18, 40], [19, 40], [18, 41]), BBBOG = hexD(26, 37), CADAV = hexD(28, 37), KREGAN = hexD(17, 43), COLDW = hexD(20, 44);
const MYC = hexD(28, 35), MYC_P = [0, 21.5], MYC_T = [[-50, 84, 13, 13], [-62, 112, 8, 12], [-44, 138, 4, 11]];   // the spore network's tree; its shaft, from the tree's hex centre (design units); and its lotus pools as [x, z, height, radius] in world units from that centre
const SINK = hexD(26, 39), CAD_T = [[-8, -40, 30, 17], [9, -22, 23, 15.5], [-7, -4, 16.5, 14], [8, 13, 10.5, 12.5], [-4, 30, 5, 11]];   // the sinkhole (not on the live map); the lotus pools as [x, z, height, radius] in world units from the hex centre
const SINKF = a => (1 + .2 * Math.sin(2 * a + .6) + .13 * Math.sin(3 * a + 2.1) + .07 * Math.sin(5 * a + .4)) / 1.017;   // how far out the sinkhole's edge lies on each bearing, as a multiple of its mean radius (1 due south, where the platform is)
const SINKB = [[0, 0, 33], [-26, -12, 23], [20, 18, 19], [-8, 27, 15]];   // the sinkhole is several collapses that have run together: [x, z, radius] from its centre
// how far a point is from the sinkhole's edge: under 1 is inside it, 1 is the brink. The hollows are blended like drops of water meeting, then the edge is roughened at two scales
const sinkD = (x, z) => { const px = x - SINK[0], pz = z - SINK[1]; if (Math.abs(px) > 130 || Math.abs(pz) > 130) return 9; let m = 0; for (const b of SINKB) { const q = Math.hypot(px - b[0], pz - b[1]) / b[2]; m += Math.exp(-3.2 * q * q); }
  return Math.sqrt(-Math.log(Math.max(m, 1e-9)) / 3.2) + .2 * fbm(x / 19, z / 19, 3) + .07 * fbm(x / 6, z / 6, 2); };
// small hills, and (with a negative height) hollows where water stands, set where they crowd nothing: [x, z, radius, height]
const WHILLS = [[.535, .70, 45, 9], [.46, .775, 45, 9], [.575, .865, 55, 11], [.665, .875, 52, 10], [.50, .905, 42, 9], [.62, .93, 50, 10], [.70, .775, 40, 8], [.56, .625, 40, 8], [.69, .62, 40, 8], [.585, .905, 40, -4.5], [.44, .845, 36, -4]].map(([u, v, r, hh]) => [X(u), Z(v), r, hh]);
// the Sanguine Sluice: not one canal but a net of them - a main channel down the chain of hexes, a second running beside it inland and a third to seaward, and cross-cuts joining them
const SLUICE = (() => { const A = [[33, 34], [32, 35], [32, 36], [31, 37], [30, 38], [29, 39], [28, 40], [27, 41], [26, 42], [25, 42]].map(([q, r]) => hexD(q, r)), n = A.length, nrm = A.map((p, i) => { const a = A[Math.max(i - 1, 0)], b = A[Math.min(i + 1, n - 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); let nx = -dz / l, nz = dx / l; if (nx + nz > 0) { nx = -nx; nz = -nz; } return [nx, nz]; });   // normals point inland (north-west)
  const off = (i, k) => [A[i][0] + nrm[i][0] * k, A[i][1] + nrm[i][1] * k], mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const B = A.map((p, i) => off(i, 46)), C = [1, 2, 3, 4, 5, 6].map(i => off(i, -32)), D = [2, 3, 4, 5, 6, 7, 8].map(i => off(i, 92));
  const lines = [A, B, C, D]; for (let i = 0; i < n; i++) { const L = []; if (i >= 1 && i <= 6) L.push(C[i - 1]); L.push(A[i], B[i]); if (i >= 2 && i <= 8) L.push(D[i - 2]); lines.push(L); if (i + 1 < n) lines.push([mid(A[i], A[i + 1]), mid(B[i], B[i + 1])]); if (i >= 2 && i < 8) lines.push([mid(B[i], B[i + 1]), mid(D[i - 2], D[i - 1])]); }
  for (const i of [1, 9]) lines.push([B[i], off(i, 84)]);                                                                                                 // feeders coming in from the swamp
  const basins = [B[1], B[3], B[5], B[7], D[1], D[4], A[9], A[0]], segs = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const L of lines) for (let i = 0; i + 1 < L.length; i++) { segs.push([L[i][0], L[i][1], L[i + 1][0] - L[i][0], L[i + 1][1] - L[i][1]]); for (const p of [L[i], L[i + 1]]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } }
  const dist = (x, z) => { if (x < x0 - 36 || x > x1 + 36 || z < z0 - 36 || z > z1 + 36) return 1e9; let b = 1e18; for (const g of segs) { let t = ((x - g[0]) * g[2] + (z - g[1]) * g[3]) / (g[2] * g[2] + g[3] * g[3]); t = t < 0 ? 0 : t > 1 ? 1 : t; const px = g[0] + g[2] * t - x, pz = g[1] + g[3] * t - z, d = px * px + pz * pz; if (d < b) b = d; }
    let dd = Math.sqrt(b); for (const p of basins) dd = Math.min(dd, Math.max(Math.hypot(x - p[0], z - p[1]) - 11, 0)); return dd; };
  return { A, B, C, D, lines, dist, basins }; })();
const ARBIT = hexC([26, 21], [26, 22], [27, 21]), SEALW = hexD(31, 19), METER = hexD(34, 17), ASHG = hexC([28, 21], [28, 22], [29, 21]), CLAR = hexD(24, 16), EWF = (() => { const p = hexC([25, 17], [24, 17], [25, 16]); return [p[0] - 30, p[1]]; })(), STAR2 = (() => { const p = hexD(26, 19); return [p[0] - 14, p[1] + 4]; })(), COLDS = hexD(35, 4);
const MAZE = (() => { const p = hexC([16, 16], [17, 16], [16, 17]); return [p[0] - 7, p[1] + 7]; })();
// the players' workshop (1,39 2,39 1,40), in the hills behind the Draftfire House: where its gate stands, where the dome beside it stands, and the way the gate faces (at that house)
const WKG = [-1738 / S, 318 / S], WKD = [-1694 / S, 296 / S], WKO = [.784, .622];
// the Wanderer's round of Prismari: east of the Draftfire House, over the hills behind it, south through Furygale, out to the mountains in the south-east and back along the lake
const WANDER = [[.064,.718],[.098,.745],[.150,.755],[.200,.762],[.232,.80],[.228,.85],[.255,.888],[.290,.900],[.283,.845],[.272,.787],[.243,.768],[.205,.735],[.16,.715],[.118,.69],[.109,.642],[.096,.622],[.081,.588],[.078,.553],[.064,.528],[.040,.540],[.024,.566],[.010,.600],[.012,.650],[.024,.705]];
const WPATH = makePath(uvs([...WANDER, WANDER[0]]), 160, 60);
const CHASM = makePath(uvs([[.265,.285],[.245,.32],[.215,.365],[.19,.40],[.17,.425]]), 24, 110);
// bridge across the Pillardrop (Effigy Row)
const BR_P = [X(.215), Z(.365)], BR_N = (() => { const dx = X(.19) - X(.245), dz = Z(.40) - Z(.32), l = Math.hypot(dx, dz); return [dz / l, -dx / l]; })();
const BR_HALF = 78;
const BR_E = [BR_P[0] + BR_N[0] * BR_HALF, BR_P[1] + BR_N[1] * BR_HALF], BR_W = [BR_P[0] - BR_N[0] * BR_HALF, BR_P[1] - BR_N[1] * BR_HALF];
// Kollema massif. KF points downhill from the hall toward the bridge, KL is sideways; kpt(a, b) = a along KF, b along KL
const KF = (() => { const dx = BR_W[0] - KOLL[0], dz = BR_W[1] - KOLL[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; })(), KL = [-KF[1], KF[0]];
const kpt = (a, b) => [KOLL[0] + KF[0] * a + KL[0] * b, KOLL[1] + KF[1] * a + KL[1] * b];
const KY = 235;                                                    // height of the hall's middle terrace
const KPEAKS = [[-40, 0, 300, 330], [25, -128, 160, 300], [25, 128, 160, 300], [-190, -130, 180, 260], [-215, 90, 185, 275], [-90, 265, 150, 200], [-70, -270, 150, 190], [-175, -85, 120, 250], [-180, 90, 125, 262], [110, -235, 130, 170], [120, 225, 130, 165], [-320, -30, 130, 150]]
  .map(([a, b, r, H], i) => { const p = kpt(a, b); return { x: p[0], z: p[1], r, H, s: i * 2.3 + .7 }; });
{ const r = mulberry32(555), c = kpt(-40, 0);                       // a broken ring of small foothill peaks, left open toward the bridge
  for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + r() * .4, d = 330 + 100 * r(), ca = Math.cos(a), sa = Math.sin(a), rr = 60 + 55 * r(), H = 60 + 90 * r();
    if (ca * KF[0] + sa * KF[1] > .72) continue; KPEAKS.push({ x: c[0] + ca * d, z: c[1] + sa * d, r: rr, H, s: 40 + i }); } }
// the road up to the hall: uneven legs and rounded hairpins, the way a real mountain road picks its line
const KSWITCH = (() => { const ctl = [[262, 0], [226, -74], [204, -138], [186, -40], [171, 74], [158, 122], [139, 30], [124, -52], [112, -96], [98, -20], [92, 44], [82, 4]]
    .map(([a, b]) => { const p = kpt(a, b); return new THREE.Vector3(p[0], 0, p[1]); });
  return new THREE.CatmullRomCurve3(ctl, false, 'centripetal').getPoints(36).map(p => [p.x, p.z]); })();
const KROAD = makePath(KSWITCH, 0, 30);
const TB_R = 132, TB_D = 50, TB_F = 95;                                       // Torus Hall sits in a stepped basin this wide and this deep
const WALKS = [
  makePath([CEN, TORUS], 0, 20),
  makePath([CEN, [lerp(CEN[0], CITY[0] - 150, .8), lerp(CEN[1], CITY[1] + 30, .8)], [SQGATE[0], SQGATE[1]]], 0, 20),   // to the city gate
  makePath([CEN, WIDD], 0, 20),
  makePath([CEN, PRISHALL], 0, 20),
  makePath([CEN, BR_E, BR_W, ...KSWITCH], 0, 20),
];
// straight walkway segments (world units), handed to the shader so path edges stay crisp at any zoom
const WALK_SEGS = [];
const seg4 = (p, i) => new THREE.Vector4(p.pts[2 * i], p.pts[2 * i + 1], p.pts[2 * i + 2], p.pts[2 * i + 3]).multiplyScalar(S);
WALKS.forEach((p, wi) => { const n = wi === 4 ? 3 : p.pts.length / 2 - 1; for (let i = 0; i < n; i++) WALK_SEGS.push(seg4(p, i)); });
// the curving mountain road has many short segments, so the shader only tests them inside this box
const ROAD_SEGS = []; for (let i = 0; i < KROAD.pts.length / 2 - 1; i++) ROAD_SEGS.push(seg4(KROAD, i));
const ROAD_BOX = new THREE.Vector4(KROAD.x0 * S, KROAD.z0 * S, KROAD.x1 * S, KROAD.z1 * S);
const WALK_ANG = WALKS.map(p => Math.atan2(p.pts[3] - CEN[1], p.pts[2] - CEN[0])).sort((a, b) => a - b);
const POOLS = WALK_ANG.map((a0, i) => { let a1 = WALK_ANG[(i + 1) % 5]; if (a1 < a0) a1 += Math.PI * 2; return { mid: (a0 + a1) / 2, half: (a1 - a0) / 2 - 0.13 }; });
const POOL_IN = 235, POOL_OUT = 300;
const BR2 = (() => { const w = WALKS[3].pts, R = RIVERS[2].p; let best = 1e9, bx = 0, bz = 0;
  for (let i = 0; i <= 600; i++) { const t = i / 600, x = lerp(w[0], w[2], t), z = lerp(w[1], w[3], t), d = polyDist(R, x, z); if (d < best) { best = d; bx = x; bz = z; } }
  const l = Math.hypot(w[2] - w[0], w[3] - w[1]); return { p: [bx, bz], dir: [(w[2] - w[0]) / l, (w[3] - w[1]) / l] }; })();
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------------------------------------------ palette
const P = {
  grassA: C3(0x5e7040), grassB: C3(0x7f8650), rockGrey: C3(0x77746a),
  quanA: C3(0x486f3c), quanB: C3(0x638a4b), volcAsh: C3(0x4a4541),
  silvA: C3(0xa99a6b), silvB: C3(0xc7b88b), silvRock: C3(0x8d8166),
  duneA: C3(0xc8a672), duneB: C3(0xe0c697),
  bogA: C3(0x33263a), bogB: C3(0x4a3a47), bogMoss: C3(0x474b36),
  withA: C3(0x34492b), withB: C3(0x54683a), withMud: C3(0x38382a), withBrA: C3(0x4f3a22), withBrB: C3(0x2c2216),
  prisA: C3(0x2a2236), prisB: C3(0x56406a), prisRock: C3(0x1c1823),
  court: C3(0x9a93b0), ice: C3(0xcfe2ea), snow: C3(0xe9eff5), prisMtA: C3(0x2c2437), prisMtB: C3(0x64527a), prisMtR: C3(0x15111b),
  volcA: C3(0x282422), volcB: C3(0x3c3532), volcOx: C3(0x4f2e24), volcRock: C3(0x181615),
  loreA: C3(0xa5663b), loreB: C3(0xd4a76f), loreLine: C3(0x7a4330), loreRock: C3(0x8a5a3c),
  obsidian: C3(0x0c0b0f), scorch: C3(0x070606),
  path: C3(0xc9bb9b), stone: C3(0xcfc8b8), paved: C3(0xb7b3a9), wet: C3(0x3a3a34), forestFloor: C3(0x4b4734),
};

// ------------------------------------------------------------------ per-biome height + colour
const T = { h: 0, r: 0, g: 0, b: 0, kr: 0, kg: 0, kb: 0, ka: 0, rough: 1 };
const setC = (a, b, t) => { T.r = lerp(a[0], b[0], t); T.g = lerp(a[1], b[1], t); T.b = lerp(a[2], b[2], t); };
const setK = (a, amt) => { T.kr = a[0]; T.kg = a[1]; T.kb = a[2]; T.ka = amt; };
function biome(b, x, z) {
  switch (b) {
    case CENTRAL: { const n = fbm(x / 380, z / 380, 3), m = fbm(x / 110 + 7, z / 110, 3);
      T.h = 14 + 9 * n + 2.5 * m; setC(P.grassA, P.grassB, 0.5 + 0.5 * m); setK(P.rockGrey, .9); T.rough = .95; break; }
    case QUAN: { const n = fbm(x / 420 + 3, z / 420, 3);
      T.h = 16 + 5 * n + sstep(X(.43), X(.35), x) * (9 + 15 * fbm(x / 270 + 5, z / 270 - 2, 4) + 5 * fbm(x / 95, z / 95 + 3, 3)); setC(P.quanA, P.quanB, 0.5 + 0.5 * fbm(x / 200, z / 200 + 9, 2)); setK(P.rockGrey, .9); T.rough = .95; break; }
    case SILV: { const n = fbm(x / 360 + 11, z / 360, 4), m = fbm(x / 170 - 5, z / 170 + 2, 3);
      T.h = 14 + 6 * n + 9 * sstep(.25, .5, m) + 1.5 * fbm(x / 40, z / 40, 2); setC(P.silvA, P.silvB, 0.5 + 0.5 * n); setK(P.silvRock, .8); T.rough = .95; break; }
    case DUNE: { const ca = Math.cos(.35), sa = Math.sin(.35), along = x * ca + z * sa, perp = -x * sa + z * ca;
      const s = along / 95 + 1.7 * fbm(x / 420, z / 420, 2) + 0.35 * Math.sin(perp / 130 + 2 * fbm(x / 300 + 5, z / 300, 2));
      const f = s - Math.floor(s); let pr = f < .72 ? f / .72 : (1 - f) / .28; pr = pr * pr * (3 - 2 * pr);
      const amp = 17 * (0.55 + 0.45 * fbm(x / 600 + 2, z / 600, 2));
      T.h = 8 + amp * pr + 1.0 * fbm(x / 22, z / 22, 2); setC(P.duneA, P.duneB, pr); setK(P.duneA, 0); T.rough = 1; break; }
    case BOG: { const n = fbm(x / 70, z / 70, 3), m = fbm(x / 18, z / 18, 2);
      T.h = Math.min(-0.9 + 4.5 * n + 0.8 * m, 3.6 + .5 * m); setC(P.bogA, P.bogB, 0.5 + 0.5 * m);   // mostly water, with low islands
      const k = sstep(.2, 1.2, T.h); T.r = lerp(T.r, P.bogMoss[0], k * .6); T.g = lerp(T.g, P.bogMoss[1], k * .6); T.b = lerp(T.b, P.bogMoss[2], k * .6);
      setK(P.bogA, .3); T.rough = .55; break; }
    case WITH: { const n = fbm(x / 130 + 4, z / 130, 3), m = fbm(x / 30, z / 30, 2);
      T.h = 0.6 + 3.5 * n + 1.2 * m; setC(P.withA, P.withB, 0.5 + 0.5 * n);
      { const e = sstep(X(.64), X(.725), x + 40 * n) * .92, d = .5 + .5 * m; T.r = lerp(T.r, lerp(P.withBrA[0], P.withBrB[0], d), e); T.g = lerp(T.g, lerp(P.withBrA[1], P.withBrB[1], d), e); T.b = lerp(T.b, lerp(P.withBrA[2], P.withBrB[2], d), e); }   // eastward the green swamp browns and darkens on its way to the Detention Bog
      const k = sstep(.8, -.6, T.h); T.r = lerp(T.r, P.withMud[0], k); T.g = lerp(T.g, P.withMud[1], k); T.b = lerp(T.b, P.withMud[2], k);
      setK(P.withMud, .5); T.rough = .8; break; }
    case PRIS: { const rg = ridged(x / 190 + 2, z / 190 + 8, 4);
      const wl = x * WIND[0] + z * WIND[1], wp = -x * WIND[1] + z * WIND[0];
      T.h = 17 + 10 * rg + 7 * ridged(wl / 260 + 3, wp / 55, 3) + 3 * fbm(x / 45, z / 45, 3); setC(P.prisA, P.prisB, sstep(.2, .75, rg)); setK(P.prisRock, .9); T.rough = .52; break; }
    case VOLCB: { const damp = sstep(1.0, 1.8, lakeE0(x, z));
      const rg = ridged(x / 300, z / 300, 5);
      T.h = 34 + damp * (18 + 125 * Math.pow(rg, 1.4)) + 5 * fbm(x / 60, z / 60, 3);
      setC(P.volcA, P.volcB, 0.5 + 0.5 * fbm(x / 90, z / 90, 2)); setK(P.volcRock, 1); T.rough = .92; break; }
    case LORE: { const n = fbm(x / 300 + 9, z / 300 + 4, 4), m = sstep(0, .22, n);
      T.h = 24 + 30 * m + 12 * sstep(.38, .55, n) + 7 * ridged(x / 80, z / 80, 3) * (1 - m) + 1.5 * fbm(x / 25, z / 25, 2);
      setC(P.loreA, P.loreB, .6); setK(P.loreRock, .6); T.rough = .97; break; }
  }
}

// full terrain sample: blended biomes + sculpted features
const O = { h: 0, r: 0, g: 0, b: 0, kr: 0, kg: 0, kb: 0, ka: 0, rough: 1, quan: 0, lava: 0 };
function sample(x, z) {
  weights(x, z);
  let h = 0, r = 0, g = 0, b = 0, kr = 0, kg = 0, kb = 0, ka = 0, rough = 0, ws = 0;
  for (let i = 0; i < 9; i++) { const w = WT[i]; if (w < 0.004) continue; biome(i, x, z); ws += w;
    h += w * T.h; r += w * T.r; g += w * T.g; b += w * T.b; kr += w * T.kr; kg += w * T.kg; kb += w * T.kb; ka += w * T.ka; rough += w * T.rough; }
  h /= ws; r /= ws; g /= ws; b /= ws; kr /= ws; kg /= ws; kb /= ws; ka /= ws; rough /= ws;
  let lava = 0, quan = WT[QUAN];
  const mixTo = (c, t) => { r = lerp(r, c[0], t); g = lerp(g, c[1], t); b = lerp(b, c[2], t); };

  // --- lava lake basin first, so volcanoes can rise out of it as islands
  const eL = lakeE0(x, z) + .16 * fbm(x / 90, z / 90, 3);
  if (eL < 1.4) h = lerp(h, LAKE_Y, sstep(1.4, .95, eL));
  // --- volcano cones (the detailed piece)
  let coneK = 0, coneTop = 0, coneAsh = 0;
  for (const v of VOLC) {
    const dx = x - v.x, dz = z - v.z, d0 = Math.hypot(dx, dz); if (d0 >= v.r * 1.25) continue;
    const ang = Math.atan2(dz, dx), ca = Math.cos(ang), sa = Math.sin(ang);
    // lopsided footprint, but a clean circular crater
    const wob = 1 + .2 * nz(ca * 1.3 + v.s, sa * 1.3 + v.s * 2) * sstep(v.rc, v.rc * 3, d0), d = d0 * wob; if (d >= v.r) continue;
    const t = 1 - d / v.r, tt = Math.min(t, v.tRim);
    // radial spines and gullies: ridged noise sampled around the cone, drifting with radius so they wander
    const tw = d0 / 260, g1 = 1 - Math.abs(nz(ca * 4 + v.s + tw, sa * 4 - tw)), g2 = 1 - Math.abs(nz(ca * 11 - tw, sa * 11 + v.s + tw));
    const gul = .6 * g1 * g1 + .4 * g2 * g2;
    const gf = sstep(0, .25, tt) * sstep(v.tRim, v.tRim - .22, tt);
    let ch = 40 + v.H * Math.pow(tt, CONE_EXP) * (1 - .42 * (1 - gul) * gf) + (16 * ridged(x / 62 + v.s, z / 62, 4) - 6) * gf + 12 * gul * gf;
    if (d0 < v.rc) { const q = d0 / v.rc; ch -= 26 * (1 - q * q); if (ch < v.lavaLvl) ch = v.lavaLvl; lava = Math.max(lava, sstep(v.lavaLvl + 3.5, v.lavaLvl + .3, ch)); }
    const k = sstep(0, .35, t); h = lerp(h, ch, k);
    if (k > coneK) { coneK = k; coneTop = sstep(.55, .98, tt / v.tRim) * (0.4 + 0.6 * fbm(x / 30, z / 30, 2) * .5 + .3); coneAsh = gul; }
  }
  // --- named mountains
  let mtK = 0, mtKind = 0, mtT = 0;
  for (const m of MOUNTS) { const mdx = x - m.x, mdz = z - m.z, d0 = Math.hypot(mdx, mdz); if (d0 >= m.r * 1.3) continue; const ma = Math.atan2(mdz, mdx);
    const d = d0 * (1 + .24 * nz(Math.cos(ma) * 1.5 + m.s, Math.sin(ma) * 1.5 - m.s)); if (d >= m.r) continue; const t = 1 - d / m.r, f = m.r * .8;   // uneven footprints, so the range does not read as a row of cones
    const mh = 20 + m.H * Math.pow(t, 1.25) * (.68 + .4 * ridged(x / f + m.s, z / f - m.s, 3)) + 7 * fbm(x / 40, z / 40, 3) * sstep(0, .2, t);
    h = smax(h, mh, 14); const k = sstep(0, .22, t); if (k > mtK) { mtK = k; mtKind = m.kind; mtT = t; } }
  // --- the streams that run off the Rainspires' mountain cut their own gullies down it
  let strK = 0; for (const p of STREAMS) { const d = polyDist(p, x, z); if (d < 12) { const k = sstep(12, 4, d); h -= 7 * k * sstep(0, .05, PD_T); strK = Math.max(strK, k); } }
  // --- the south-west corner is high ground behind an escarpment that faces the river; the river runs on across the top, widening into the Pearl Whorl Pool
  let plat = 0;
  { const q = platQ(x, z);
    plat = sstep(-9, 15, q);
    if (plat > 0) { const ph = PLAT_Y + 3 + 13 * (.5 + .5 * fbm(x / 130 + 3, z / 130, 3)) * sstep(0, 60, q) + 2 * fbm(x / 35, z / 35, 2) + 7 * ridged(x / 45, z / 45, 2) * (1 - sstep(10, 50, q)); h = lerp(h, Math.max(h, ph), plat);
      if (plat > .5) { const wx2 = x + 13 * fbm(x / 60, z / 60, 2), wz2 = z + 13 * fbm(x / 60 + 7, z / 60, 2), dr = polyDist(PLATRIV, wx2, wz2); if (dr < 36) h = lerp(PLAT_Y - 12, h, sstep(8, 32, dr));
        const dp = Math.hypot(wx2 - PEARL[0], wz2 - PEARL[1]); if (dp < 62) h = lerp(PLAT_Y - 13, h, sstep(32, 60, dp)); } } }
  // --- Losheal's mountain: the top is being cut flat, and one piece has already been lifted out of it
  { const d = Math.hypot(x - LOSH[0], z - LOSH[1]); if (d < 72) h = Math.min(h, 176 + 2.5 * fbm(x / 14, z / 14, 2) + 30 * sstep(42, 72, d));
    const d2 = Math.hypot(x - LOSH[0] - 34, z - LOSH[1] - 22); if (d2 < 30) h = Math.min(h, 150 + 16 * sstep(20, 30, d2)); }
  // --- Gravity Orchard: a shaft sunk straight down into level ground
  let gorK = 0; { const d = Math.hypot(x - GORCH[0], z - GORCH[1]) + 5 * fbm(x / 16, z / 16, 2); if (d < 50) { gorK = sstep(48, 31, d); h -= 175 * gorK - 30 * gorK * (1 - gorK) * ridged(x / 14, z / 14, 2); } }
  // --- Kollema massif: a cluster of jagged peaks; the hall sits on terraces cut into the summit and a road zig-zags up to it
  let kolM = 0, phxK = 0;
  { let mh = 0, any = false;
    for (const p of KPEAKS) { const dx = x - p.x, dz = z - p.z, d0 = Math.hypot(dx, dz); if (d0 >= p.r * 1.3) continue;
      const ang = Math.atan2(dz, dx), d = d0 * (1 + .22 * nz(Math.cos(ang) * 1.6 + p.s, Math.sin(ang) * 1.6 - p.s)); if (d >= p.r) continue;
      const t = 1 - d / p.r, ph = 30 + p.H * Math.pow(t, 1.2) * (.74 + .33 * ridged(x / 170 + p.s, z / 170, 3));
      mh = any ? smax(mh, ph, 16) : ph; any = true; }
    if (any) { mh += (12 * ridged(x / 105 + 3, z / 105 + 7, 3) - 5) * sstep(32, 95, mh); h = smax(h, mh, 14); }
    const dx = x - KOLL[0], dz = z - KOLL[1], a = dx * KF[0] + dz * KF[1], b = Math.abs(dx * KL[0] + dz * KL[1]);
    if (a > -100 && a < 90 && b < 86) { kolM = sstep(-96, -80, a) * sstep(86, 72, a) * sstep(82, 66, b);   // cut far enough back that the whole hall stands clear of the rock
      h = lerp(h, KY - 14 + 26 * sstep(36, 28, a) + 18 * sstep(-4, -12, a), kolM); }
    { const d = Math.hypot(x - PHX[0], z - PHX[1]); if (d < 66) { phxK = sstep(66, 44, d); h = lerp(h, 96, phxK); if (d < 30) { const q = clamp((d - 12) / 16, 0, 1) * 3, fl = Math.floor(q); h = Math.min(h, 80 + (fl + sstep(.7, 1, q - fl)) * 5.33); } } }   // the Phalanx Crucible: the hill is cut level for the ring of statues, with a small arena sunk in tiers at its middle
    const dr = polyDist(KROAD, x, z); if (dr < 22) { const ramp = 46 + (KY - 60) * Math.pow(PD_T, 1.6); h = lerp(h, lerp(h, ramp, sstep(0, .1, PD_T)), sstep(20, 9, dr)); } }
  // --- Lorehold: courts cut into the massif, a shaft, a scrap pit, a slot canyon, an old river bed and a battlefield
  let cutK = 0, scarK = 0, brkK = 0, brkT = 0;
  const notch = (c, ux, uz, a0, a1, hw, F) => { const dx = x - c[0], dz = z - c[1], a = dx * ux + dz * uz, b = Math.abs(dz * ux - dx * uz); if (a < a0 - 30 || a > a1 + 4 || b > hw + 8) return; const k = sstep(hw + 6, hw, b) * sstep(a1 + 2.5, a1, a) * sstep(a0 - 30, a0, a); if (k > 0) h = lerp(h, Math.min(h, F), k); };
  notch(KEYW, .89, .45, -40, 44, 56, 132);                              // the court before the Keystone Wall, a sheer face behind it
  notch(SCRIP, .61, -.79, -50, 3, 34, 121);                             // the yard before the Scriptorium door
  { const d = Math.hypot(x - P492[0], z - P492[1]) + 3 * fbm(x / 12, z / 12, 2); if (d < 42) { const k = sstep(40, 31, d); h -= 265 * k; cutK = Math.max(cutK, k); } }
  { const e = Math.hypot((x - HEAP[0]) / 44, (z - HEAP[1]) / 36) + .12 * fbm(x / 30, z / 30, 2); if (e < 1.25) { const q = clamp((1.2 - e) / .7, 0, 1) * 3, fl = Math.floor(q), k = sstep(1.25, 1.1, e); h = lerp(h, Math.min(h, 60 - (fl + sstep(.6, 1, q - fl)) * 12), k); cutK = Math.max(cutK, k * .5); } }
  { const dx = x - COFD[0], dz = z - COFD[1], a = dx * .5 + dz * .866, b = dz * .5 - dx * .866; if (Math.abs(a) < 62 && Math.abs(b + 4) < 28) { const k = sstep(26, 21, Math.abs(b + 4)) * sstep(60, 54, Math.abs(a)); h = lerp(h, Math.min(h, 7 + 34 * sstep(18, 52, a)), k); cutK = Math.max(cutK, k * .5); } }
  { const wx = x + 14 * fbm(x / 70, z / 70, 2), wz = z + 14 * fbm(x / 70 + 5, z / 70, 2), d = polyDist(WSCAR, wx, wz); if (d < 46) { const wd = 24 + 8 * Math.sin(PD_T * 19); scarK = sstep(wd + 12, wd, d) * sstep(0, .06, PD_T) * sstep(1, .94, PD_T); h -= 8 * scarK * (.7 + .3 * sstep(wd, 0, d)) - 2.2 * scarK * ridged(x / 16, z / 16, 2); } }
  { const e = Math.hypot((x - BRKL[0]) / 92, (z - BRKL[1]) / 200) + .16 * fbm(x / 80, z / 80, 2); if (e < 1.15) { brkK = sstep(1.15, .8, e); const rg = ridged(x / 60 + 2, z / 85, 2); brkT = sstep(.80, .93, rg); h = lerp(h, 46 + 6 * fbm(x / 45, z / 45, 2) - 9 * brkT + 3.5 * sstep(.6, .8, rg) * (1 - brkT), brkK * .9); } }
  // --- Pillardrop chasm
  let chF = 0;
  { const d = polyDist(CHASM, x, z); if (d < 110) { const hw = 14 + 34 * Math.pow(Math.sin(Math.PI * PD_T), .7) + 8 * fbm(x / 60, z / 60, 2);
      chF = .3 * sstep(hw + 16, hw + 6, d) + .35 * sstep(hw - 2, hw - 12, d) + .35 * sstep(hw - 20, hw - 30, d); h -= 150 * chF; } }
  // --- lava flows: crater -> lake, lake -> river
  const flow = (p, hA, hB, w) => { const d = polyDist(p, x, z); if (d > 60) return; const t = PD_T;
    const ww = w + 4 * fbm(x / 50, z / 50, 2) + 5 * t;
    const m = sstep(ww * 2.3, ww * .9, d); if (m <= 0) return;
    h = lerp(h, Math.min(h - 2.5, lerp(hA, hB, t)), m);
    lava = Math.max(lava, sstep(ww * 1.2, ww * .65, d + 4 * fbm(x / 16, z / 16, 2))); };
  for (const v of VOLC) if (v.path) flow(v.path, v.lavaLvl - 1, LAKE_Y + 1.5, 6);
  for (const p of OUTLETS) flow(p, LAKE_Y - 1, 0.6, 5.5);
  // --- lava fills the basin wherever nothing has risen above it
  if (eL < 1.05) lava = Math.max(lava, sstep(1.03, .92, eL) * sstep(LAKE_Y + 3.2, LAKE_Y + .8, h));
  // --- obsidian: a rim round the lake, a small field to the south, and crusts beside the two outflows
  let obs = sstep(1.5, 1.12, eL);
  { const e2 = Math.hypot((x - X(.19)) / 190, (z - Z(.722)) / 95) + .25 * fbm(x / 140 + 3, z / 140, 3); obs = Math.max(obs, sstep(1.05, .7, e2)); }
  for (const p of OUTLETS) { const d = polyDist(p, x, z); if (d < 60) obs = Math.max(obs, sstep(46, 18, d)); }
  obs *= (1 - coneK) * (1 - mtK);
  // --- rivers
  let riv = 0;
  for (const R of RIVERS) { const wx = x + 16 * fbm(x / 110, z / 110, 2), wz = z + 16 * fbm(x / 110 + 9, z / 110, 2);
    const d = polyDist(R.p, wx, wz); if (d < R.w * 3.2) { h = lerp(-5, h, Math.max(sstep(R.w, R.w * 3.2, d), plat)); riv = Math.max(riv, sstep(R.w * 2.2, R.w, d) * (1 - plat)); } }
  { const e = Math.hypot((x - X(.405)) / 52, (z - Z(.633)) / 100) + .2 * fbm(x / 60, z / 60, 2); if (e < 1.3) { h = lerp(-11, h, sstep(.75, 1.3, e)); riv = Math.max(riv, sstep(1.2, .9, e)); } }   // the lake over the Black Coral Copper Reef
  for (const B of BELLS) { const dx = x - B.x, dz = z - B.z, a = -(dx * B.ux + dz * B.uz), bb = Math.abs(dz * B.ux - dx * B.uz);   // the river runs on into each Tidal Bell Mouth
    if (a > -B.ld - 4 && a < 30 && bb < 15) { const k = sstep(15, 8, bb) * sstep(30, 23, a); h = lerp(h, Math.min(h, -4.5), k); riv = Math.max(riv, k * .8); } }
  // --- central campus core + pools
  const dC = Math.hypot(x - CEN[0], z - CEN[1]); let poolRim = 0;
  if (dC < 490) { h = lerp(h, 15, sstep(490, 365, dC));
    if (dC > POOL_IN - 12 && dC < POOL_OUT + 12) { const ang = Math.atan2(z - CEN[1], x - CEN[0]);
      for (const pl of POOLS) { const e = Math.min((pl.half - Math.abs(angDiff(ang, pl.mid))) * dC, dC - POOL_IN, POOL_OUT - dC);
        if (e > -8) { h -= 3.2 * sstep(0, 5, e); poolRim = Math.max(poolRim, sstep(-7, -3.5, e) * sstep(1.5, -.5, e)); } } } }
  // --- flattened building sites
  const site = (c, rad, y) => { const d = Math.hypot(x - c[0], z - c[1]); if (d < rad * 1.6) h = lerp(h, y, sstep(rad * 1.6, rad, d)); };
  // Torus Hall: a wide basin stepping down in rings, with a smooth ramp where the walkway comes in
  let torusB = 0;
  { const d = Math.hypot(x - TORUS[0], z - TORUS[1]); if (d < TB_R + 70) { h = lerp(h, 17, sstep(TB_R + 70, TB_R + 10, d));
      const f = sstep(TB_R, TB_F, d), st = f * 5, fl = Math.floor(st), terr = (fl + sstep(.72, 1, st - fl)) / 5;
      h -= TB_D * lerp(terr, f, sstep(24, 12, polyDist(WALKS[0], x, z))); torusB = f; } }
  site(WILT, 46, 2.8); site(CULT, 78, 17); site(ARITH, 44, 17); site(ROSE, 50, 15); site(DRAMA, 78, 15); site(BLOOM, 40, 17);
  site(DCOIL, 52, 30); site(ELOW, 30, 38); site(STADIUM, 125, 15);
  site(MONU, 30, 205); site(VAULT, 26, 139); site(MILL, 22, 98); site(BKF, 40, 38); site(BKF2, 30, 40); site(COLDL, 24, 26); site(BONE1, 34, 28); site(BONE2, 34, 34);
  // --- Quandrix: a stepped hill of paddocks, ground twisted round the Great Snarl, a chalk plateau and its cliff, a gorge, and a quarry floor
  let chalkK = 0, snarlK = 0, snarlS = 0;
  { const d = Math.hypot(x - BEAST[0], z - BEAST[1]); if (d < 86) { const q = clamp((80 - d) / 64, 0, 1) * 5, fl = Math.floor(q); h = lerp(h, 22 + (fl + sstep(.75, 1, q - fl)) * 9.5, sstep(86, 79, d)); } }
  { const dx = x - SNARL[0], dz = z - SNARL[1], d = Math.hypot(dx, dz); if (d < 100) { const k = sstep(100, 55, d), a = Math.atan2(dz, dx); snarlS = Math.sin(a * 5 + Math.log(d + 8) * 6); h += k * (8 * snarlS + 4 * Math.sin(a * 11 - d * .12)); snarlK = k; if (d < 36) h = lerp(h, 30, sstep(36, 26, d)); } }
  { const dx = x - MESA[0], dz = z - MESA[1], d = Math.hypot(dx, dz); if (d < 190) { const a = Math.atan2(dz, dx), tri = v => Math.abs((((v / 6.283) % 1) + 1) % 1 * 2 - 1) * 2 - 1, rr = 92 + 15 * tri(a * 3 + .6) + 8 * tri(a * 9 + 1.3) + 4 * tri(a * 27), pk = sstep(rr + 4, rr - 4, d);   // a mesa with a snowflake's outline, not a square's
      if (pk > 0) { h = lerp(h, 74 + 6 * sstep(60, 20, d) + 3 * fbm(x / 50, z / 50, 2), pk); const dr = Math.abs(dx - 7 * Math.sin(dz / 26)); if (dr < 15 && dz > -20) { const k = sstep(15, 7, dr) * pk; h -= 4 * k; chalkK = k; } }
      const df = Math.hypot(dx / 84, (dz - 142) / 62); if (df < 1.2 && pk < .5) chalkK = Math.max(chalkK, sstep(1.2, .25, df) * (.6 + .4 * Math.sin(Math.atan2(dz - 96, dx) * 7 + df * 13))); } }
  { const wx = x + 9 * fbm(x / 60, z / 60, 2), wz = z + 9 * fbm(x / 60 + 4, z / 60, 2), d = polyDist(GORGE, wx, wz); if (d < 50) { const pf = sstep(0, .2, PD_T) * sstep(1, .8, PD_T), wd = 8 + 18 * pf; h = lerp(h, Math.min(h, lerp(h - 1.5, -5, pf)), sstep(wd + 12, wd, d)); } }
  { const dx = x - VICE[0], dz = z - VICE[1]; if (Math.abs(dx) < 90 && dz > -92 && dz < -36) h += 30 * sstep(90, 62, Math.abs(dx)) * sstep(-36, -50, dz) * sstep(-92, -74, dz) * (.7 + .3 * fbm(x / 25, z / 25, 2)); }   // the quarry face behind the Vice Foundry
  site(VICE, 44, 13); site(MENAG, 34, 17); site(MOBI, 30, 17); site(MAZE, 64, 17);
  let starK = 0; { const e = Math.hypot(x - STAR[0], z - STAR[1]) / 76 + .22 * fbm(x / 50, z / 50, 2); if (e < 1.1) { starK = sstep(1.08, .8, e); h = lerp(h, 22, starK); } }   // an uneven-edged flat of mirror obsidian, wider than its hex
  site(PRISHALL, 78, 24); site(WIDD, 112, 2.6);
  const dWl = polyDist(SQPATH, x, z), inC = dWl < 1e8 && sqInside(x, z), dFn = Math.hypot(x - FOUNT[0], z - FOUNT[1]), inQ = !inC && inkQ(x, z);
  const cityM = inC || inQ ? 1 : Math.max(sstep(16, 0, dWl), sstep(16, 0, polyDist(IQPATH, x, z)), sstep(132, 116, dFn), sstep(88, 72, Math.hypot(x - HATCH[0], z - HATCH[1])));
  if (cityM > 0) h = lerp(h, 16, cityM);
  let marb = 0, mTone = 0, inkK = 0;                                      // marble paving, perfectly level: tone 0 is black marble, 1 white; in the city the two meet along a swirling line, like ink in milk
  if (inC) { marb = 1; mTone = sstep(-9, 9, (x - X(.83)) * .8 + (z - Z(.305)) * .6 + 34 * fbm(x / 75, z / 75, 3)); }
  else if (inQ) { marb = 1; mTone = dFn < 107 ? .94 : 0; }                // the ink quarter is bare black marble, but for the white round of the fountain plaza
  site(GREENW, 40, 3.4); site(SPOREW, 36, 3.4); site(WILLOW, 34, 3.6); site(SALLOW, 24, 3.2); site(SLEECH, 40, 1.0); site(APIARY, 60, 3.6); site(BBBOG, 44, -.5); site(KREGAN, 32, -1.3);
  for (const q of WHILLS) { const d = Math.hypot(x - q[0], z - q[1]) + 8 * fbm(x / 28 + q[2], z / 28, 2); if (d < q[2]) h += q[3] * sstep(q[2], q[2] * .12, d); }
  { const dx = x - CADAV[0], dz = z - CADAV[1], dh = Math.hypot(dx, dz + 14) + 8 * fbm(x / 22, z / 22, 2); if (dh < 74) { h = lerp(h, 3.4, sstep(74, 60, dh)); h += 21 * sstep(58, 6, dh) * (.75 + .25 * sstep(30, -34, dz));             // the lotus terraces: a hill that falls away southward,
      for (const t of CAD_T) { const d = Math.hypot(dx - t[0] / S, dz - t[1] / S), r = t[3] / S; if (d < r + 7) h = lerp(h, 3.4 + t[2] / S, sstep(r + 7, r + 1.5, d)); } } }                                                                // with a level shelf cut in it for each pool
  { const dx = x - MYC[0], dz = z - MYC[1], dm = Math.hypot(dx, dz + 10) + 6 * fbm(x / 20 + 5, z / 20, 2);
    if (dm < 90) { h = lerp(h, 3.4, sstep(90, 72, dm)); h += 10.5 * sstep(66, 16, dm); }                                                                 // the spore network's tree stands on a mound of its own roots,
    for (const t of MYC_T) { const d = Math.hypot(dx - t[0] / S, dz - t[1] / S), r = t[3] / S; if (d < r + 7) h = lerp(h, t[2] / S, sstep(r + 7, r + 1.5, d)); }   // with a level shelf for each of the pools below it,
    const dp = Math.hypot(dx - MYC_P[0], dz - MYC_P[1]); if (dp < 48) { h = lerp(h, 12.5, sstep(48, 35, dp));                                               // a level round the mouth of the shaft,
      const de = dp + 1.2 * fbm(x / 9, z / 9, 2); if (de < 26.5) { const k = sstep(26.5, 22.5, de); h -= 80 * k; cutK = Math.max(cutK, k); } } }             // and the shaft, going straight down
  let sinkK = 0, sinkR = 0; { const d = sinkD(x, z); if (d < 1.8) { const px = x - SINK[0], pz = z - SINK[1], pl = Math.hypot(px, pz) + 1e-6;
      h = lerp(h, -.9, sstep(1.8, 1.45, d));                                                                                              // round it the swamp lies just under water, so the water reaches the brink
      h += 3.4 * Math.max(sstep(-.05, .3, fbm(x / 21 + 3, z / 21, 2)), sstep(.82, .96, pz / pl)) * sstep(1.3, 1.08, d);                    // a lip of rock stands out of that water in places; where it does not, the water goes over
      sinkK = sstep(1.03, lerp(.76, .3, sstep(.3, .8, px / pl)), d); sinkR = sstep(1.34, 1.1, d);                                        // sheer on most sides; on the east the wall has slumped into a slope
      h -= 95 * sinkK - 16 * sinkK * (1 - sinkK) * ridged(x / 13, z / 13, 2); } }   // the sinkhole
  { const d = Math.hypot(x - BITTER[0], z - BITTER[1]); if (d < 52) h = lerp(h, 4, sstep(52, 40, d)) + 15 * sstep(44, 4, d); }                                              // Bitterroot Knowl is a knoll
  const sluD = SLUICE.dist(x, z); if (sluD < 32) { h = lerp(h, 5.5, sstep(32, 18, sluD)); h -= 4.2 * sstep(8.5, 6, sluD); }                                                  // the sluice is cut down into a stone-paved flat
  site(HATCH, 70, 16); site(ARBIT, 70, 16); site(SEALW, 62, 16); site(METER, 40, 14); site(ASHG, 76, 15); site(CLAR, 26, 15); site(EWF, 78, 15); site(STAR2, 30, 15);
  notch(WKG, -WKO[0], -WKO[1], -24, 10, 15, 83); site(WKD, 9, 101.5);   // the workshop's forecourt, cut back to a sheer face for the gate; and the dome's shelf
  // --- walkways
  let walk = 0;
  for (const p of WALKS) { const d = polyDist(p, x, z); if (d < 10) walk = Math.max(walk, sstep(8.5, 5.5, d)); }
  walk *= 1 - sstep(.02, .1, chF);
  if (walk > 0) h = lerp(h, Math.max(h, 1.8), walk * (1 - riv) * (torusB > 0 ? 0 : 1));   // causeway over wet ground, but never a dam across a river

  // ---------------- colours that depend on the final height
  const wl = WT[LORE];
  if (wl > .02) { const band = .5 + .5 * Math.sin(h * .21 + 2.2 * fbm(x / 260, z / 260, 2)), thin = sstep(.75, .95, Math.sin(h * .83 + x * .004));
    let sr = lerp(P.loreA[0], P.loreB[0], band), sg = lerp(P.loreA[1], P.loreB[1], band), sb = lerp(P.loreA[2], P.loreB[2], band);
    sr = lerp(sr, P.loreLine[0], thin * .7); sg = lerp(sg, P.loreLine[1], thin * .7); sb = lerp(sb, P.loreLine[2], thin * .7);
    const k = wl * .9; r = lerp(r, sr, k); g = lerp(g, sg, k); b = lerp(b, sb, k);
    kr = lerp(kr, sr * .72, k); kg = lerp(kg, sg * .72, k); kb = lerp(kb, sb * .72, k); }
  if (chF > 0) { const dk = 1 - .6 * sstep(.3, 1, chF); r *= dk; g *= dk; b *= dk; }
  if (coneK > 0) { const as = sstep(.25, .8, coneAsh);
    const cr = lerp(lerp(P.volcA[0], P.volcAsh[0], as), P.volcOx[0], coneTop), cg = lerp(lerp(P.volcA[1], P.volcAsh[1], as), P.volcOx[1], coneTop), cb = lerp(lerp(P.volcA[2], P.volcAsh[2], as), P.volcOx[2], coneTop);
    r = lerp(r, cr, coneK); g = lerp(g, cg, coneK); b = lerp(b, cb, coneK); kr = lerp(kr, P.volcRock[0], coneK); kg = lerp(kg, P.volcRock[1], coneK); kb = lerp(kb, P.volcRock[2], coneK); ka = lerp(ka, 1, coneK); rough = lerp(rough, .92, coneK); }
  if (mtK > 0) { const A = mtKind ? P.prisMtA : P.volcA, B = mtKind ? P.prisMtB : P.volcAsh, R = mtKind ? P.prisMtR : P.volcRock;
    const f = clamp(sstep(.1, .95, mtT) * (.55 + .45 * fbm(x / 70 + 4, z / 70, 2)) + .25 * fbm(x / 25, z / 25, 2), 0, 1);
    r = lerp(r, lerp(A[0], B[0], f), mtK); g = lerp(g, lerp(A[1], B[1], f), mtK); b = lerp(b, lerp(A[2], B[2], f), mtK);
    kr = lerp(kr, R[0], mtK); kg = lerp(kg, R[1], mtK); kb = lerp(kb, R[2], mtK); ka = lerp(ka, 1, mtK); rough = lerp(rough, .85, mtK); }
  if (obs > 0) { mixTo(P.obsidian, obs * .92); rough = lerp(rough, .42, obs); kr = lerp(kr, P.obsidian[0], obs); kg = lerp(kg, P.obsidian[1], obs); kb = lerp(kb, P.obsidian[2], obs);
    lava = Math.max(lava, obs * .36 * sstep(.55, .8, ridged(x / 55, z / 55, 2))); }
  if (chalkK > 0) { mixTo([.88, .88, .84], chalkK * .92); rough = lerp(rough, .7, chalkK); }
  if (snarlK > 0) { const t2 = .5 + .5 * snarlS; mixTo([lerp(.10, .46, t2), lerp(.42, .16, t2), lerp(.46, .52, t2)], snarlK * .75); }
  if (scarK > 0) { const cr = .5 + .5 * ridged(x / 9, z / 9, 2); mixTo([.80 + .1 * cr, .79 + .1 * cr, .74 + .08 * cr], scarK * .92); rough = lerp(rough, .5, scarK); ka *= 1 - scarK * .7; }   // salt
  if (brkK > 0) { mixTo([.36, .30, .22], brkK * .55); mixTo([.15, .12, .09], brkK * brkT * .6); }
  if (cutK > 0) { const dk = 1 - .4 * cutK; r *= dk; g *= dk; b *= dk; ka = lerp(ka, 1, cutK); }
  if (gorK > 0) { mixTo(P.prisRock, gorK * .7); ka = lerp(ka, 1, gorK); const dk = 1 - .4 * gorK; r *= dk; g *= dk; b *= dk; }
  if (strK > 0) { mixTo(P.wet, strK * .55); rough = lerp(rough, .45, strK); }
  { const d = Math.hypot(x - ARCHV[0], z - ARCHV[1]); if (d < 74) mixTo(P.court, sstep(74, 36, d) * .6 * (1 - .6 * mtK)); }   // a pale paved court before the Archive door
  if (riv > 0) { mixTo(P.wet, riv * .7); rough = lerp(rough, .5, riv); }
  for (const f of FOREST) { const e = Math.hypot((x - f[0]) / f[2], (z - f[1]) / f[3]) + .12 * fbm(x / 120, z / 120, 2); if (e < 1.3) mixTo(P.forestFloor, sstep(1.3, .75, e) * .8); }
  { const sn = sstep(Z(.865), Z(.925), z + 40 * fbm(x / 160, z / 160, 2)) * sstep(X(.47), X(.40), x) * sstep(20, 46, h) * (.62 + .38 * fbm(x / 34 + 2, z / 34, 2)) * (1 - obs) * (1 - WT[WITH]);   // the southern mountains are cold
    if (sn > 0) { mixTo(P.snow, clamp(sn * 1.25, 0, .96)); rough = lerp(rough, .6, sn); kr = lerp(kr, P.prisMtR[0], sn); kg = lerp(kg, P.prisMtR[1], sn); kb = lerp(kb, P.prisMtR[2], sn); ka = Math.max(ka, .95 * sn); } }
  if (starK > 0) { mixTo(P.obsidian, starK); rough = lerp(rough, .04, starK); lava *= 1 - starK; }
  { const d = Math.hypot(x - THORN[0], z - THORN[1]); if (d < 175) mixTo(P.scorch, sstep(175, 90, d) * .7); }
  if (torusB > 0) { const fl = sstep(.93, 1, torusB); mixTo(P.paved, fl * .8); rough = lerp(rough, .6, fl); quan *= 1 - fl; }
  if (kolM > 0) { mixTo(P.loreB, kolM * .55); ka *= 1 - kolM * .6; }
  if (cityM > 0) { mixTo(P.paved, cityM * .9); rough = lerp(rough, .6, cityM); quan = 0; }
  if (sinkR > 0) { const bnd = .5 + .5 * Math.sin(h * .42 + 3 * fbm(x / 30, z / 30, 2)), dk = 1 - .55 * sstep(-15, -95, h); mixTo([lerp(.12, .25, bnd) * dk, lerp(.11, .22, bnd) * dk, lerp(.095, .18, bnd) * dk], sinkR * .92); rough = lerp(rough, .9, sinkR); }   // bare rock, banded as it goes down, darker with depth
  if (sluD < 20) { const k = sstep(20, 14, sluD); mixTo([.27, .25, .22], k * .85); rough = lerp(rough, .8, k); if (sluD < 6.5) mixTo([.1, .008, .01], .9); }
  if (inkK > 0) { mixTo([.02, .02, .03], inkK * .9); rough = lerp(rough, .35, inkK); }
  if (walk > 0) { rough = lerp(rough, .85, walk); lava *= 1 - walk; }   // path colour itself is drawn crisply in the shader
  lava *= sstep(-.6, 1.2, h);
  if (lava > .5) ka = 0;
  O.walkOk = (1 - sstep(.02, .1, chF)) * (1 - sstep(.15, .5, riv));
  O.h = h; O.r = r; O.g = g; O.b = b; O.kr = kr; O.kg = kg; O.kb = kb; O.ka = ka; O.rough = rough; O.quan = starK > 0 ? -starK : marb ? 2 + mTone : quan * (1 - walk) * (1 - riv); O.lava = lava;
}

// ------------------------------------------------------------------ renderer / scene
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.info.autoReset = false;
canvas.addEventListener('webglcontextrestored', () => location.reload());   // the page lets go of its copies of the ground once the card has them, so a card that has lost everything is answered by loading again
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 5, 90000);
const HOME_POS = new THREE.Vector3(0, 3300 * S, 3000 * S), HOME_TGT = new THREE.Vector3(0, 15 * S, -80 * S);
camera.position.copy(HOME_POS);

const SUN = new THREE.Vector3(-0.55, 0.62, -0.42).normalize();
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: SUN }, disc: { value: 1 } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec3 vDir; uniform vec3 sunDir; uniform float disc;
    void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
      vec3 c = mix(vec3(0.70,0.79,0.88), vec3(0.16,0.34,0.70), pow(h, 0.45));
      if (d.y < 0.0) c = mix(vec3(0.70,0.79,0.88), vec3(0.30,0.31,0.33), min(-d.y * 5.0, 1.0));
      float s = max(dot(d, sunDir), 0.0);
      c += vec3(1.0,0.82,0.58) * pow(s, 10.0) * 0.22 + disc * vec3(1.0,0.9,0.7) * pow(s, 500.0) * 6.0;
      gl_FragColor = vec4(c, 1.0); }` });
{ // environment map for reflections (water, obsidian)
  const envScene = new THREE.Scene(); const em = skyMat.clone(); em.uniforms = { sunDir: { value: SUN }, disc: { value: 0 } };
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), em));
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0, 1, 200).texture; pm.dispose();
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), skyMat); sky.renderOrder = -10; scene.add(sky);
scene.fog = new THREE.Fog(0xb9c7d6, 2000, 12000);
const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b5a48, 0.35); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
sun.position.copy(SUN).multiplyScalar(6500); sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -3300, right: 3300, top: 3300, bottom: -3300, near: 1200, far: 13000 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 4.5;
scene.add(sun, sun.target);

// ------------------------------------------------------------------ terrain material (custom shader bits on a standard PBR material)
const NOISE = (() => {
  const N = 256, h = new Float32Array(N * N), r = mulberry32(99);
  for (let o = 0, amp = .5, per = 8; o < 5; o++, amp *= .5, per *= 2) {
    const lat = new Float32Array(per * per); for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const fx = x / N * per, fy = y / N * per, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = lat[iy % per * per + ix % per], b = lat[iy % per * per + (ix + 1) % per], c = lat[(iy + 1) % per * per + ix % per], d = lat[(iy + 1) % per * per + (ix + 1) % per];
      h[y * N + x] += amp * lerp(lerp(a, b, tx), lerp(c, d, tx), ty); } }
  let lo = 1e9, hi = -1e9; for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) / (hi - lo);
  const gx = new Float32Array(N * N), gy = new Float32Array(N * N); let gmax = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = y * N + x;
    gx[k] = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * N / 2; gy[k] = (h[(y + 1) % N * N + x] - h[(y + N - 1) % N * N + x]) * N / 2;
    gmax = Math.max(gmax, Math.abs(gx[k]), Math.abs(gy[k])); }
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) { data[k * 4] = h[k] * 255; data[k * 4 + 1] = (.5 + .5 * gx[k] / gmax) * 255; data[k * 4 + 2] = (.5 + .5 * gy[k] / gmax) * 255; data[k * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true; return { tex, gscale: 2 * gmax };
})();
const NH = 40;   // most hexes one highlighted thing can cover
const farList = () => Array.from({ length: NH }, () => new THREE.Vector2(1e9, 1e9));
const U = {
  uTime: { value: 0 }, uR: { value: HEX_R }, uS: { value: S }, uGrid: { value: 0.4 }, uBump: { value: 0.9 },
  uOff: { value: new THREE.Vector2(OFFX, OFFZ) },
  uHov: { value: farList() }, uHovN: { value: 0 }, uSelA: { value: farList() }, uSelN: { value: 0 },
  uTorus: { value: new THREE.Vector2(TORUS[0] * S, TORUS[1] * S) },
  uRoad: { value: ROAD_SEGS }, uRoadBox: { value: ROAD_BOX }, uSeg: { value: WALK_SEGS }, uCen: { value: new THREE.Vector2(CEN[0] * S, CEN[1] * S) },
  uPool: { value: POOLS.map(p => new THREE.Vector2(p.mid, p.half)) }, uPoolR: { value: new THREE.Vector2(POOL_IN * S, POOL_OUT * S) },
  uNoise: { value: NOISE.tex }, uNG: { value: NOISE.gscale },
  uTerr: { value: null }, uTerrOn: { value: 0 },   // travel difficulty per hex (see the path tools), shown only while the path panel is open
};
const FRAG_HEAD = `
uniform float uTime, uR, uS, uGrid, uBump; uniform vec2 uOff, uTorus, uCen, uPoolR;
uniform vec2 uHov[${NH}], uSelA[${NH}]; uniform int uHovN, uSelN;
uniform vec4 uSeg[${WALK_SEGS.length}], uRoad[${ROAD_SEGS.length}], uRoadBox; uniform vec2 uPool[5]; uniform sampler2D uNoise; uniform float uNG; uniform sampler2D uTerr; uniform float uTerrOn;
varying vec4 vMat; varying vec3 vWPos; varying vec3 vWN;
float sxSeg(vec2 p, vec4 s){ vec2 d = s.zw - s.xy; float t = clamp(dot(p - s.xy, d) / dot(d, d), 0.0, 1.0); return length(p - s.xy - d * t); }
float sxT(vec2 uv){ return texture2D(uNoise, uv).r; }
float sxHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sxNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(sxHash(i), sxHash(i+vec2(1,0)), f.x), mix(sxHash(i+vec2(0,1)), sxHash(i+vec2(1,1)), f.x), f.y); }
float sxFbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * sxNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.875; }
float sxLavaN(vec2 p){ float a = sxFbm(p * 1.3 + uTime * 0.013); return sxFbm(p * 2.6 + a * 1.7); }
vec2 sxHexCenter(vec2 p){
  float q = (2.0/3.0 * p.x) / uR, r = (-1.0/3.0 * p.x + 0.57735027 * p.y) / uR, s = -q - r;
  float rq = floor(q + 0.5), rr = floor(r + 0.5), rs = floor(s + 0.5);
  float dq = abs(rq - q), dr = abs(rr - r), ds = abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return vec2(uR * 1.5 * rq, uR * 1.7320508 * (rq * 0.5 + rr)); }
// nested-circle (Apollonian) fractal: returns distance-ish to the pattern lines and an iteration tone
vec2 sxFractal(vec2 p){ float s = 1.0, tone = 0.0;
  for (int i = 0; i < 6; i++){ p = -1.0 + 2.0 * fract(0.5 * p + 0.5); float r2 = max(dot(p, p), 1e-4); float k = 1.22 / r2; p *= k; s *= k; tone += r2; }
  return vec2(0.25 * abs(p.y) / s, tone / 6.0); }
`;
const FRAG_COLOR = `
vec3 sxLava = vec3(0.0); float sxRough = vMat.z;
{
  vec2 wp = vWPos.xz; float camD = length(vViewPosition);
  float dn = sxT(wp / 700.0) * 0.6 + sxT(wp / 90.0) * 0.4;
  diffuseColor.rgb *= 0.80 + 0.40 * dn;
  if (vMat.y > 1.5) {   // polished marble: one smooth floor, black or white, faintly veined
    float tone = clamp(vMat.y - 2.0, 0.0, 1.0); vec2 mp = wp / uS;
    float v1 = sxT(mp / 190.0 + 0.13), v2 = sxT(mp / 47.0 + 0.71);
    float vein = pow(1.0 - abs(sin(mp.x * 0.05 + mp.y * 0.031 + v1 * 9.0 + v2 * 2.0)), 14.0) + 0.6 * pow(1.0 - abs(sin(mp.x * 0.021 - mp.y * 0.043 + v2 * 7.0)), 18.0);
    vec3 col = mix(vec3(0.03, 0.03, 0.04), vec3(0.82, 0.81, 0.78), tone);
    diffuseColor.rgb = mix(col, mix(vec3(0.42), vec3(0.74, 0.6, 0.3), tone), clamp(vein, 0.0, 1.0) * 0.26); sxRough = 0.1;
  } else if (vMat.y > 0.01) {
    vec2 q = wp - uTorus; float rad = length(q) / uS, ang = atan(q.y, q.x);
    // nested circles
    vec2 fr = sxFractal(q / (430.0 * uS) + vec2(0.5, 0.31));
    float ln = smoothstep(0.0, 0.0035 + fwidth(fr.x) * 1.5, fr.x);
    float pat = (0.84 + 0.34 * smoothstep(0.25, 0.75, fr.y)) * mix(0.52, 1.0, ln);
    // squares within squares (Sierpinski carpet), in large patches between the circle fields
    vec2 c = wp / (520.0 * uS) + 0.37; float hole = 0.0, cw = fwidth(c.x);
    for (int i = 0; i < 4; i++) { vec2 t3 = fract(c) * 3.0, m3 = abs(t3 - 1.5); cw *= 3.0; if (cw > 0.5) break; if (max(m3.x, m3.y) < 0.5) hole = max(hole, 1.0 - float(i) * 0.18); c = t3; }
    pat = mix(pat, 1.08 - 0.36 * hole, smoothstep(0.46, 0.56, sxT(wp / (2600.0 * uS) + 0.3)));
    // spiral arms sweeping out from the hall
    float sp = sin(ang * 8.0 - log(max(rad, 1.0)) * 11.0), sa = fwidth(sp);
    float spK = smoothstep(190.0, 215.0, rad) * (1.0 - smoothstep(430.0, 580.0, rad));
    pat = mix(pat, mix(0.64, 1.14, smoothstep(-sa - 0.04, sa + 0.04, sp)), spK);
    diffuseColor.rgb *= mix(1.0, pat, vMat.y);
  }
  if (vMat.y < -0.01) {   // starglass: constellations cracked into the mirror-black obsidian itself
    float sk = -vMat.y; vec2 cp = wp / 30.0, ci = floor(cp); float star = 0.0, lin = 0.0;
    for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) { vec2 c0 = ci + vec2(float(a), float(b)), s0 = c0 + 0.2 + 0.6 * vec2(sxHash(c0), sxHash(c0 + 7.3));
      star = max(star, (0.45 + 0.55 * sxHash(c0 + 3.1)) * smoothstep(0.085, 0.0, distance(cp, s0)));
      vec2 c1 = c0 + vec2(1.0, 0.0), s1 = c1 + 0.2 + 0.6 * vec2(sxHash(c1), sxHash(c1 + 7.3)); if (sxHash(c0 + 11.7) > 0.45) lin = max(lin, smoothstep(0.022, 0.0, sxSeg(cp, vec4(s0, s1))));
      vec2 c2 = c0 + vec2(0.0, 1.0), s2 = c2 + 0.2 + 0.6 * vec2(sxHash(c2), sxHash(c2 + 7.3)); if (sxHash(c0 + 19.3) > 0.6) lin = max(lin, smoothstep(0.022, 0.0, sxSeg(cp, vec4(s0, s2)))); }
    sxLava += vec3(0.55, 0.72, 1.0) * (star * 2.6 + lin * 0.75) * sk; sxRough = mix(sxRough, 0.03, sk);
  }
  // paved walkways and pool surrounds (analytic, so edges stay sharp)
  {
    float wd = 1e9; for (int i = 0; i < ${WALK_SEGS.length}; i++) wd = min(wd, sxSeg(wp, uSeg[i]));
    if (wp.x > uRoadBox.x && wp.y > uRoadBox.y && wp.x < uRoadBox.z && wp.y < uRoadBox.w) for (int i = 0; i < ${ROAD_SEGS.length}; i++) wd = min(wd, sxSeg(wp, uRoad[i]));
    float wj = (sxT(wp / 40.0) - 0.5) * 2.4, waa = fwidth(wd) + 0.15;
    float wk = (1.0 - smoothstep(7.5 - waa, 7.5 + waa, wd + wj)) * vMat.w;
    float curb = (1.0 - smoothstep(9.2 - waa, 9.2 + waa, wd + wj)) * vMat.w;
    vec3 pave = vec3(0.44, 0.31, 0.17) * (0.82 + 0.36 * sxT(wp / 23.0)) * (0.9 + 0.1 * step(0.5, fract(wd * 0.5)));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, curb);
    diffuseColor.rgb = mix(diffuseColor.rgb, pave, wk);
    float dC = distance(wp, uCen);
    if (dC > uPoolR.x - 18.0 && dC < uPoolR.y + 18.0) {
      float ang = atan(wp.y - uCen.y, wp.x - uCen.x), rim = 0.0, paa = fwidth(dC) + 0.1;
      for (int i = 0; i < 5; i++) { float da = ang - uPool[i].x; da = abs(atan(sin(da), cos(da)));
        float e = min((uPool[i].y - da) * dC, min(dC - uPoolR.x, uPoolR.y - dC));
        rim = max(rim, smoothstep(-9.0 - paa, -9.0 + paa, e) * (1.0 - smoothstep(1.4 - paa, 1.4 + paa, e))); }
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.40, 0.35) * (0.85 + 0.3 * sxT(wp / 15.0)), rim);
    }
  }
  float lv = vMat.x;
  if (lv > 0.02) {
    vec2 lp = wp * 0.03, fl = vWN.xz * 9.0;
    float ph = fract(uTime * 0.06), ph2 = fract(uTime * 0.06 + 0.5);
    float n = mix(sxLavaN(lp - fl * ph), sxLavaN(lp - fl * ph2 + 7.3), abs(1.0 - 2.0 * ph));
    float edge = smoothstep(0.30, 0.52, lv + (n - 0.5) * 0.35);
    float heat = smoothstep(0.55, 1.0, lv);                                 // hottest down the middle of a flow
    float crack = 1.0 - smoothstep(0.0, 0.03, abs(n - 0.5));                // glowing fracture lines in the crust
    float steep = smoothstep(0.03, 0.3, length(vWN.xz)) * heat;             // moving lava on a slope stays molten
    float pool = smoothstep(0.43, 0.27, n - steep * 0.15 + 0.02);           // open molten patches
    float glow = clamp(pool + crack * 0.7, 0.0, 1.0) * (1.0 + 0.5 * steep);
    vec3 hot = mix(vec3(0.80, 0.07, 0.003), vec3(1.0, 0.30, 0.025), pool * pool);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.024, 0.022) * (0.6 + 0.8 * sxT(wp / 30.0)), edge);
    sxLava = hot * glow * edge * 1.25;
    sxRough = mix(sxRough, 0.85, edge);
  }
  // hex grid, hover and selection (a thing can light up several hexes at once)
  vec2 hp = wp + uOff, hc = sxHexCenter(hp), hl = abs(hp - hc);
  float ed = uR * 0.8660254 - max(hl.y, hl.x * 0.8660254 + hl.y * 0.5);
  float aa = fwidth(ed);
  float line = 1.0 - smoothstep(aa * 0.5, aa * 1.6 + 0.2, ed);
  float fade = 1.0 - smoothstep(uR * 0.05, uR * 0.22, aa);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03), line * uGrid * fade);
  if (uTerrOn > 0.5) { float tq = floor(hc.x / (uR * 1.5) + 0.5), tr = floor(hc.y / (uR * 1.7320508) - tq * 0.5 + 0.5); vec4 tc = texture2D(uTerr, (vec2(tq, tr) + 0.5) / 64.0);
    float rimT = 1.0 - smoothstep(uR * 0.03, uR * 0.11, ed); diffuseColor.rgb = mix(diffuseColor.rgb, tc.rgb, tc.a * (0.4 + 0.35 * rimT)); sxLava += tc.rgb * tc.a * 0.06; }
  float hov = 0.0, sel = 0.0;
  for (int i = 0; i < ${NH}; i++) { if (i >= uHovN) break; if (distance(hc, uHov[i]) < 1.0) hov = 1.0; }
  for (int i = 0; i < ${NH}; i++) { if (i >= uSelN) break; if (distance(hc, uSelA[i]) < 1.0) sel = 1.0; }
  float thick = 1.0 - smoothstep(max(aa * 1.5, uR * 0.035), max(aa * 3.0, uR * 0.06) + 0.4, ed);
  if (sel > 0.5) { diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.70, 0.12), 0.22 + 0.78 * thick); sxLava += vec3(1.0, 0.55, 0.08) * (0.05 + 0.75 * thick); }
  else if (hov > 0.5) { diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.75), 0.20 + 0.75 * thick); sxLava += vec3(1.0, 0.92, 0.6) * (0.04 + 0.45 * thick); }
}
`;
const FRAG_BUMP = `
{
  // fine surface relief from the noise texture's stored gradient (two scales); mip-mapping fades it with distance
  float amt = uBump * (vMat.y > 1.5 ? 0.0 : 1.0) * (1.0 - smoothstep(0.3, 0.5, vMat.x)) * smoothstep(0.1, 0.6, vMat.z) * (1.0 - smoothstep(900.0, 2200.0, length(vViewPosition)));
  if (amt > 0.0) {
    vec2 p = vWPos.xz;
    vec2 g2 = (texture2D(uNoise, p / 260.0).gb - 0.5) * (uNG * 6.0 / 260.0) + (texture2D(uNoise, p / 60.0).gb - 0.5) * (uNG * 1.5 / 60.0);
    vec3 g = vec3(g2.x, 0.0, g2.y), nW = normalize(vWN);
    nW = normalize(nW - (g - dot(g, nW) * nW) * amt);
    normal = normalize(mat3(viewMatrix) * nW);
  }
}
`;
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.4 });
terrainMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aMat; varying vec4 vMat; varying vec3 vWPos; varying vec3 vWN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vWPos = position; vWN = normal;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(sxRough, 0.05, 1.0);')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_BUMP)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sxLava;');
};

// ------------------------------------------------------------------ build terrain (world units = design units x S)
let H, HMAX = 0, terrainMesh;   // height grid, and the ground itself
const SKIRT = -40 * S;
function heightAt(x, z) {
  const fx = (x + MAP_W / 2) / DX, fz = (z + MAP_D / 2) / DZ;
  if (fx < 0 || fz < 0 || fx > NX - 1 || fz > NZ - 1) return SKIRT;
  const i = Math.min(Math.floor(fx), NX - 2), j = Math.min(Math.floor(fz), NZ - 2), tx = fx - i, tz = fz - j, k = j * NX + i;
  return lerp(lerp(H[k], H[k + 1], tx), lerp(H[k + NX], H[k + NX + 1], tx), tz);
}
const weightsW = (x, z) => weights(x / S, z / S);
const terrainCache = { key: null, db: null, fresh: null,
  open() { return new Promise(res => { try { const rq = indexedDB.open('strixhaven3d', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('terrain'); rq.onsuccess = () => res(rq.result); rq.onerror = rq.onblocked = () => res(null); } catch (e) { res(null); } }); },
  async get() { try { const all = [...document.scripts].map(sc => sc.textContent).join(''), sec = (a, b) => { const i = all.search(a), j = all.search(b); return i >= 0 && j > i ? all.slice(i, j) : all; };
      // the key is a fingerprint of the parts of the code the ground is made from (the sculpting, the hex arithmetic it leans on, and the building of it here), so a change to anything else leaves the kept ground good
      const src = sec(/\/\/ -{20,} constants/, /\/\/ -{20,} renderer \/ scene/) + sec(/\/\/ -{20,} build terrain/, /\/\/ -{20,} water/) + sec(/\/\/ -{20,} hex helpers/, /\/\/ -{20,} things:/);
      let h = 2166136261; for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); } this.key = 'w' + (h >>> 0) + '-' + src.length + '-' + NX;
      this.db = await this.open(); if (!this.db) return null; const hit = await new Promise(res => { const rq = this.db.transaction('terrain').objectStore('terrain').get(this.key); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); }); return hit && hit.H && hit.H.length === NX * NZ ? hit : null; } catch (e) { return null; } },
  put() { try { if (!this.db || !this.fresh) return; const st = this.db.transaction('terrain', 'readwrite').objectStore('terrain'); st.clear(); st.put(this.fresh, this.key); this.fresh = null; } catch (e) {} } };
function buildTerrain(cache) {
  const N = NX * NZ;
  // a kept ground is tried against the sculpting at a scatter of points before it is trusted: if anything has moved, it is made again
  if (cache) check: for (let j = 5; j < NZ; j += 16) for (let i = 5; i < NX; i += 16) { const x = -MAP_W / 2 + i * DX, z = -MAP_D / 2 + j * DZ; sample(x / S, z / S); if (Math.abs(O.h * S + 1.2 * O.ka * fbm(x / 22, z / 22, 2) - cache.H[j * NX + i]) > .002) { cache = null; break check; } }
  H = cache ? cache.H : new Float32Array(N);
  const pos = new Float32Array(N * 3), col = cache ? cache.col : new Float32Array(N * 3), rock = new Float32Array(cache ? 4 : N * 4), mat = cache ? cache.mat : new Float32Array(N * 4), nor = cache ? cache.nor : new Float32Array(N * 3);
  if (cache) { HMAX = cache.hmax; for (let j = 0, k = 0; j < NZ; j++) for (let i = 0; i < NX; i++, k++) { pos[k * 3] = -MAP_W / 2 + i * DX; pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = -MAP_D / 2 + j * DZ; } } else {
  for (let j = 0, k = 0; j < NZ; j++) for (let i = 0; i < NX; i++, k++) {
    const x = -MAP_W / 2 + i * DX, z = -MAP_D / 2 + j * DZ; sample(x / S, z / S);
    const h = O.h * S + 1.2 * O.ka * fbm(x / 22, z / 22, 2);          // extra fine relief in world units
    H[k] = h; if (h > HMAX) HMAX = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    col[k * 3] = O.r; col[k * 3 + 1] = O.g; col[k * 3 + 2] = O.b;
    rock[k * 4] = O.kr; rock[k * 4 + 1] = O.kg; rock[k * 4 + 2] = O.kb; rock[k * 4 + 3] = O.ka;
    mat[k * 4] = O.lava; mat[k * 4 + 1] = O.quan; mat[k * 4 + 2] = O.rough; mat[k * 4 + 3] = O.walkOk;
  }
  for (let j = 0, k = 0; j < NZ; j++) for (let i = 0; i < NX; i++, k++) {
    const l = H[i > 0 ? k - 1 : k], r = H[i < NX - 1 ? k + 1 : k], u = H[j > 0 ? k - NX : k], d = H[j < NZ - 1 ? k + NX : k];
    const sx = (r - l) / (2 * DX), sz = (d - u) / (2 * DZ), sl = Math.hypot(sx, sz), il = 1 / Math.hypot(sx, 1, sz);
    nor[k * 3] = -sx * il; nor[k * 3 + 1] = il; nor[k * 3 + 2] = -sz * il;
    const rk = sstep(.55, 1.15, sl) * rock[k * 4 + 3];
    const cv = clamp(1 - (l + r + u + d - 4 * H[k]) * 0.05, 0.72, 1.18);
    for (let c = 0; c < 3; c++) col[k * 3 + c] = lerp(col[k * 3 + c], rock[k * 4 + c], rk) * cv;
    mat[k * 4 + 2] = lerp(mat[k * 4 + 2], Math.max(mat[k * 4 + 2], .8), rk * .5);
  }
  terrainCache.fresh = { H, col, mat, nor, hmax: HMAX }; }
  // The ground is one sheet of points cut into square tiles, so that the tiles out of sight are not drawn at all. Every tile is always drawn in full: nothing is made coarser
  // with distance and nothing is loaded while moving about. The page's own copies are let go once the card has them (heightAt and the picking ray read the height grid, not these)
  const CH = 160, TXN = Math.ceil((NX - 1) / CH), TZN = Math.ceil((NZ - 1) / CH), idx = new Uint32Array((NX - 1) * (NZ - 1) * 6), spans = []; let q = 0;
  for (let tz = 0; tz < TZN; tz++) for (let tx = 0; tx < TXN; tx++) { const i0 = tx * CH, i1 = Math.min(i0 + CH, NX - 1), j0 = tz * CH, j1 = Math.min(j0 + CH, NZ - 1), start = q; let lo = 1e9, hi = -1e9;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const h = H[j * NX + i]; if (h < lo) lo = h; if (h > hi) hi = h; }
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    spans.push({ start, count: q - start, box: new THREE.Box3(new THREE.Vector3(-MAP_W / 2 + i0 * DX, lo, -MAP_D / 2 + j0 * DZ), new THREE.Vector3(-MAP_W / 2 + i1 * DX, hi, -MAP_D / 2 + j1 * DZ)) }); }
  const once = (arr, n) => new THREE.BufferAttribute(arr, n).onUpload(function () { this.array = null; }), aP = once(pos, 3), aN = once(nor, 3), aC = once(col, 3), aM = once(mat, 4), aI = once(idx, 1);
  terrainMesh = new THREE.Group();
  for (const sp of spans) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', aP); geo.setAttribute('normal', aN); geo.setAttribute('color', aC); geo.setAttribute('aMat', aM); geo.setIndex(aI); geo.setDrawRange(sp.start, sp.count);
    geo.boundingBox = sp.box; geo.boundingSphere = sp.box.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(geo, terrainMat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.raycast = () => {}; terrainMesh.add(m); }
  scene.add(terrainMesh);

  // slab sides so the map reads as a physical model sitting on a table
  const sv = []; const push = (x, z, y) => sv.push(x, y, z);
  const edge = (get, n) => { for (let s = 0; s < n - 1; s++) { const a = get(s), b = get(s + 1); push(a[0], a[1], a[2]); push(b[0], b[1], b[2]); push(a[0], a[1], SKIRT); push(b[0], b[1], b[2]); push(b[0], b[1], SKIRT); push(a[0], a[1], SKIRT); } };
  const vx = i => -MAP_W / 2 + i * DX, vz = j => -MAP_D / 2 + j * DZ;
  edge(i => [vx(i), vz(0), H[i]], NX); edge(i => [vx(i), vz(NZ - 1), H[(NZ - 1) * NX + i]], NX);
  edge(j => [vx(0), vz(j), H[j * NX]], NZ); edge(j => [vx(NX - 1), vz(j), H[j * NX + NX - 1]], NZ);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); sg.computeVertexNormals();
  scene.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1, side: THREE.DoubleSide })));
  const shape = new THREE.Shape(); const B = 60000; shape.moveTo(-B, -B); shape.lineTo(B, -B); shape.lineTo(B, B); shape.lineTo(-B, B); shape.closePath();
  const hole = new THREE.Path(); hole.moveTo(-MAP_W / 2, -MAP_D / 2); hole.lineTo(-MAP_W / 2, MAP_D / 2); hole.lineTo(MAP_W / 2, MAP_D / 2); hole.lineTo(MAP_W / 2, -MAP_D / 2); hole.closePath(); shape.holes.push(hole);
  const table = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: .9, side: THREE.DoubleSide }));
  table.rotation.x = -Math.PI / 2; table.position.y = SKIRT; table.receiveShadow = true; scene.add(table);
  return !!cache;
}

// ------------------------------------------------------------------ water
function buildWater() {
  const N = 512, data = new Uint8Array(N * N * 4);
  const WC = [0x23545f, 0x23545f, 0x2c5961, 0x2c5961, 0x241a33, 0x2c3a22, 0x1c4a52, 0x1c4a52, 0x000000].map(h => new THREE.Color(h).convertLinearToSRGB());
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + .5) / N * MAP_W - MAP_W / 2, z = MAP_D / 2 - (j + .5) / N * MAP_D; weightsW(x, z);
    let r = 0, g = 0, b = 0; for (let k = 0; k < 9; k++) { r += WT[k] * WC[k].r; g += WT[k] * WC[k].g; b += WT[k] * WC[k].b; }
    const o = (j * N + i) * 4; data[o] = r * 255; data[o + 1] = g * 255; data[o + 2] = b * 255; data[o + 3] = (WT[LORE] > .5 || Math.hypot(x - TORUS[0] * S, z - TORUS[1] * S) < (TB_R + 30) * S || Math.hypot(x - GORCH[0] * S, z - GORCH[1] * S) < 80 * S || Math.hypot(x - P492[0] * S, z - P492[1] * S) < 60 * S || sinkD(x / S, z / S) < 1.04 || Math.hypot(x - MYC[0] * S, z - (MYC[1] + MYC_P[1]) * S) < 52) ? 0 : 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  // moving ripples: two drifting layers of the noise texture bend the surface normal and break up the colour
  const ripple = (m, amt, scale) => { m.onBeforeCompile = sh => { sh.uniforms.uNoise = U.uNoise; sh.uniforms.uTime = U.uTime; sh.uniforms.uNG = U.uNG;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; uniform float uTime, uNG;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ vec2 p = vSxW.xz / ' + scale.toFixed(1) + '; float c = texture2D(uNoise, p * 1.3 + uTime * 0.016).r * texture2D(uNoise, p * 0.9 - uTime * 0.012).r; diffuseColor.rgb *= 0.86 + 0.75 * c; }')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 p = vSxW.xz / ' + scale.toFixed(1) + '; vec2 gr = (texture2D(uNoise, p + uTime * vec2(0.011, 0.007)).gb - 0.5) + (texture2D(uNoise, p * 2.7 - uTime * vec2(0.013, 0.019)).gb - 0.5) * 0.6; gr *= uNG * ' + amt.toFixed(4) + '; normal = normalize(mat3(viewMatrix) * normalize(vec3(-gr.x, 1.0, -gr.y))); }'); }; return m; };
  const wm = ripple(new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: .9, roughness: .2, metalness: 0, envMapIntensity: 1.1 }), .006, 130);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_D), wm); water.rotation.x = -Math.PI / 2; water.receiveShadow = true; scene.add(water);
  // the river and pool on top of the south-west plateau: a water surface laid only where the ground has been cut below it, so its shore follows the land
  { const wy = (PLAT_Y - 5) * S, st = 7, v = [], x1 = X(.24) * S, z0 = Z(.83) * S;
    const top = ripple(new THREE.MeshStandardMaterial({ color: 0x245f78, transparent: true, opacity: .92, roughness: .16, envMapIntensity: 1.2, side: THREE.DoubleSide }), .006, 70);
    for (let x = -MAP_W / 2; x < x1; x += st) for (let z = z0; z < MAP_D / 2; z += st) { const lo = Math.min(heightAt(x, z), heightAt(x + st, z), heightAt(x, z + st), heightAt(x + st, z + st));
      if (lo > wy + .5 || platQ((x + st / 2) / S, (z + st / 2) / S) < 13) continue;   // only on the plateau top proper, never on the cliff face
      v.push(x, wy, z, x, wy, z + st, x + st, wy, z, x + st, wy, z, x, wy, z + st, x + st, wy, z + st); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, top); m.receiveShadow = true; scene.add(m); }
  // the five campus pools
  const pms = [0x2e7f96, 0x2f8f8a, 0x2a70a6, 0x24566e, 0x3589a8].map(c => ripple(new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: .92, roughness: .2, envMapIntensity: 1.2, side: THREE.DoubleSide }), .0028, 70));
  const cx = CEN[0] * S, cz = CEN[1] * S, rIn = (POOL_IN - 3) * S, rOut = (POOL_OUT + 3) * S;
  POOLS.forEach((pl, pi) => { const pm = pms[pi], v = [], seg = 48;
    for (let s = 0; s < seg; s++) { const a0 = pl.mid - pl.half - .02 + (2 * pl.half + .04) * s / seg, a1 = pl.mid - pl.half - .02 + (2 * pl.half + .04) * (s + 1) / seg;
      const p = (rr, a) => [cx + rr * Math.cos(a), 13.6 * S, cz + rr * Math.sin(a)];
      const A = p(rIn, a0), B = p(rOut, a0), C = p(rIn, a1), D = p(rOut, a1); v.push(...A, ...C, ...B, ...B, ...C, ...D); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, pm); m.receiveShadow = true; scene.add(m); });
}

// ------------------------------------------------------------------ hex helpers (same axial maths + ids as the live map)
function worldToHex(x, z) {
  const px = x + OFFX, py = z + OFFZ; const q = (2 / 3 * px) / HEX_R, r = (-1 / 3 * px + SQ3 / 3 * py) / HEX_R, s = -q - r;
  let rq = Math.round(q), rr = Math.round(r); const rs = Math.round(s), dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return hexAt(rq, rr);
}
function hexAt(q, r) { const sx = HEX_R * 1.5 * q, sy = HEX_R * SQ3 * (q / 2 + r); return { q, r, sx, sy, x: sx - OFFX, z: sy - OFFZ }; }
const hexKey = (q, r) => q + ',' + r;

// ------------------------------------------------------------------ things: map objects that own one or more hexes
let thingSeq = 0;
const movers = [];   // things that walk or fly: { o, target() } - clicked through the box round them, and answering as the place they belong to
const things = [], thingRoots = [], hexOwner = new Map(), spin = [], lanternPts = [], anim = [], chimneys = [];
const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
const M = (g, geo, mat, x, y, z, o = {}) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1); g.add(m); return m; };
function mergeKids(g) { const groups = new Map();
  for (const m of [...g.children]) { if (!m.isMesh || m.isInstancedMesh || m.userData.keepSep) continue; const key = m.material.uuid; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m); }
  for (const [, list] of groups) { if (list.length < 2) continue; const geos = list.map(m => { m.updateMatrix(); const ge = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); for (const k of Object.keys(ge.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') ge.deleteAttribute(k); return ge; });
    if (geos.some(ge => !ge.attributes.uv)) continue; for (const m of list) g.remove(m); g.add(new THREE.Mesh(mergeGeometries(geos), list[0].material)); } }
function addThing(name, icon, at, k, foot, build, o = {}) {
  const g = new THREE.Group(); g.position.set(at[0], o.y ?? heightAt(at[0], at[1]), at[1]); g.scale.setScalar(k); if (o.ry) g.rotation.y = o.ry;
  build(g);
  { const groups = new Map(); for (const sp of spin) sp.o.userData.keepSep = 1;
    for (const m of [...g.children]) { if (!m.isMesh || m.isInstancedMesh || m.userData.keepSep || m.raycast !== THREE.Mesh.prototype.raycast) continue;
      const key = m.userData.noShadow ? m.material.uuid + 'n' : m.material.uuid; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m); }
    for (const [, list] of groups) { if (list.length < 2) continue; const mat = list[0].material, ns = !!list[0].userData.noShadow;
      const geos = list.map(m => { m.updateMatrix(); const ge = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); for (const k of Object.keys(ge.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') ge.deleteAttribute(k); return ge; });
      if (geos.some(ge => !ge.attributes.uv)) continue;
      for (const m of list) g.remove(m); const mm = new THREE.Mesh(mergeGeometries(geos), mat); mm.userData.noShadow = ns; g.add(mm); } }
  weights(at[0] / S, at[1] / S); texRegion = 0; for (let i = 1; i < 9; i++) if (WT[i] > WT[texRegion]) texRegion = i;
  const t = { id: thingSeq++, name, icon, group: g, x: at[0], z: at[1], labelY: (o.y ?? g.position.y) + (o.top ?? 40) * k, hexes: [], mats: [], view: o.view ?? 520 };
  g.traverse(m => { if (m.isMesh) { m.material = texAuto(m.material.clone()); m.material.userData.e0 = m.material.emissive ? m.material.emissive.clone() : null; t.mats.push(m.material); m.castShadow = !m.userData.noShadow; m.receiveShadow = true; } });
  // every hex whose centre falls inside the footprint is linked to this thing
  if (o.hexes) { for (const [q, r] of o.hexes) { const key = hexKey(q, r); if (!hexOwner.has(key) && t.hexes.length < NH) { hexOwner.set(key, t); t.hexes.push(hexAt(q, r)); } }
    g.userData.thing = t; scene.add(g); things.push(t); thingRoots.push(g); return t; }
  const c = worldToHex(at[0], at[1]);
  const dist = o.seg ? (x, z) => { const [ax, az, bx, bz] = o.seg, dx = bx - ax, dz = bz - az, u = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(ax + dx * u - x, az + dz * u - z); }
                     : (x, z) => Math.hypot(x - at[0], z - at[1]);
  for (let dq = -4; dq <= 4; dq++) for (let dr = -4; dr <= 4; dr++) { const h = hexAt(c.q + dq, c.r + dr);
    if ((!o.seg && !dq && !dr) || dist(h.x, h.z) <= foot + .5) { const key = hexKey(h.q, h.r); if (!hexOwner.has(key) && t.hexes.length < NH) { hexOwner.set(key, t); t.hexes.push(h); } } }
  g.userData.thing = t; scene.add(g); things.push(t); thingRoots.push(g); return t;
}

function part(g, hex, o = {}) {
  let gg = g.index ? g.toNonIndexed() : g.clone();
  dummy.position.set(o.x || 0, o.y || 0, o.z || 0); dummy.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); dummy.scale.set(o.sx || 1, o.sy || 1, o.sz || 1); dummy.updateMatrix();
  gg.applyMatrix4(dummy.matrix);
  const c = new THREE.Color(hex), n = gg.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  gg.setAttribute('color', new THREE.BufferAttribute(a, 3)); gg.deleteAttribute('uv'); return gg;
}
function fillInstanced(m, list) {
  list.forEach((it, i) => { dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    dummy.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    const t = it.tint || [1, 1, 1]; m.setColorAt(i, tmpC.setRGB(t[0], t[1], t[2])); });
  m.instanceMatrix.needsUpdate = true; return m;
}
function instanced(geo, mat, list) {
  if (!list.length) return null;
  const m = fillInstanced(new THREE.InstancedMesh(geo, mat, list.length), list);
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m;
}
const solid = (hex, rough = .8, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, ...extra });
// Surface texture for plain-coloured materials, worked out in the shader from where each point is (in the thing's own frame for stone, in the world for foliage),
// so merged and instanced geometry get it with no UVs. tx() only marks a material; addThing puts the shader on each thing's own copy (a copied material loses its hook)
const TEX_VERT = ['varying vec3 vSxL; varying vec3 vSxLN;', 'vSxL = position * length(modelMatrix[0].xyz); vSxLN = normal;'];
const TEX_HEAD = [
  'uniform sampler2D uNoise; varying vec3 vSxL; varying vec3 vSxLN; vec3 sxBump = vec3(0.0);',
  'float sxTH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float sxTri(vec3 p, vec3 w, float s){ return texture2D(uNoise, p.zy / s).r * w.x + texture2D(uNoise, p.xz / s + 0.37).r * w.y + texture2D(uNoise, p.xy / s + 0.71).r * w.z; }'].join('\n');
const TEXGL = {
  // coursed stonework: staggered blocks each a shade of its own, dark joints, blotches of warm and cool, streaks where rain has run. On a curved face only the courses show
  masonry: [
    '{ vec3 n = normalize(vSxLN), an = abs(n), w = pow(an, vec3(4.0)); w /= (w.x + w.y + w.z);',
    '  float big = sxTri(vSxL, w, 170.0), mid = sxTri(vSxL, w, 37.0), fine = sxTri(vSxL, w, 6.1), tone = 0.74 + 0.18 * mid + 0.1 * fine;',
    '  vec3 tint = mix(vec3(1.03, 0.99, 0.94), vec3(0.95, 0.98, 1.01), smoothstep(0.3, 0.7, big)); vec2 f, cs;',
    '  if (an.y > 0.7) { f = vSxL.xz; cs = vec2(4.2, 4.2); } else { vec2 hz = n.xz; f = vec2(dot(vSxL.xz, vec2(-hz.y, hz.x) / max(length(hz), 1e-4)), vSxL.y); cs = vec2(4.8, 2.3); }',
    '  float row = floor(f.y / cs.y); vec2 b = vec2(f.x / cs.x + 0.5 * mod(row, 2.0) + 0.3 * sxTH(vec2(row, 3.7)), f.y / cs.y), id = floor(b), fr = fract(b);',
    '  float curv = length(fwidth(n)) / max(length(fwidth(vSxL)), 1e-4), flat1 = 1.0 - smoothstep(0.004, 0.012, curv), aa = fwidth(f.x) + fwidth(f.y), nr = 1.0 - smoothstep(0.45, 1.5, aa);',
    '  float eh = min(fr.y, 1.0 - fr.y) * cs.y, e = mix(eh, min(eh, min(fr.x, 1.0 - fr.x) * cs.x), flat1);',
    '  float joint = (1.0 - smoothstep(0.08 + aa * 0.5, 0.3 + aa * 1.5, e)) * nr;',
    '  tone *= mix(1.0, 0.93 + 0.14 * sxTH(id + 0.5), flat1 * nr) * (0.95 + 0.1 * texture2D(uNoise, vec2(f.x / 9.0, f.y / 140.0)).r);',
    '  diffuseColor.rgb *= tone * tint * mix(1.0, 0.74, joint); sxBump = (texture2D(uNoise, f / 3.1).gbr - 0.5) * 0.12 * nr; }'].join('\n'),
  // one piece of stone - a statue, a monolith: mottled, grained, with a few hairline veins
  rock: [
    '{ vec3 n = normalize(vSxLN), w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);',
    '  float big = sxTri(vSxL, w, 90.0), mid = sxTri(vSxL, w, 19.0), sm = sxTri(vSxL + 11.3, w, 7.5), fine = sxTri(vSxL, w, 3.7), vn = sxTri(vSxL + 31.7, w, 28.0), aa = length(fwidth(vSxL)), nr = 1.0 - smoothstep(0.5, 2.0, aa);',
    '  float crack = (1.0 - smoothstep(0.004, 0.011 + aa * 0.004, abs(vn - 0.5))) * nr;',
    '  vec3 tint = mix(vec3(1.03, 0.99, 0.94), vec3(0.95, 0.98, 1.01), smoothstep(0.3, 0.7, big));',
    '  diffuseColor.rgb *= (0.68 + 0.14 * mid + 0.16 * smoothstep(0.25, 0.75, sm) + 0.08 * fine) * tint * (1.0 - 0.28 * crack) * (1.0 - 0.12 * smoothstep(0.3, 0.9, n.y));',
    '  sxBump = (vec3(texture2D(uNoise, vSxL.xy / 2.3 + vSxL.z * 0.29).gb, texture2D(uNoise, vSxL.zy / 2.9).g) - 0.5) * 0.14 * nr; }'].join('\n'),
  // foliage: clumps of lighter and darker leaf, a drift of yellower and bluer green, and a surface broken up so a blob stops reading as a ball
  leaf: [
    '{ vec3 p = vSxW; float a = texture2D(uNoise, p.xz / 9.0 + p.y * 0.11).r, b = texture2D(uNoise, p.xy / 3.4 + p.z * 0.23).r, c = texture2D(uNoise, p.zy / 23.0 + p.x * 0.05).r;',
    '  float clump = smoothstep(0.26, 0.74, a * 0.62 + b * 0.38);',
    '  diffuseColor.rgb *= (0.5 + 0.9 * clump) * mix(vec3(0.88, 1.0, 1.06), vec3(1.16, 1.05, 0.8), c);',
    '  sxBump = (texture2D(uNoise, p.xz / 5.0 + p.y * 0.17).gbr - 0.5) * 0.6; }'].join('\n'),
  // paper: faint fibres and the ghost of old folds
  paper: [
    '{ float f1 = texture2D(uNoise, vec2(vSxL.x / 2.1, vSxL.z / 17.0) + vSxL.y * 0.31).r, f2 = texture2D(uNoise, vSxL.zx / 6.3 + 0.4).r; vec2 gq = abs(fract(vSxL.xz / 8.0) - 0.5) * 8.0;',
    '  float cr = 1.0 - smoothstep(0.08, 0.5, min(gq.x, gq.y)); diffuseColor.rgb *= (0.78 + 0.16 * f1 + 0.14 * f2) * (1.0 - 0.3 * cr); }'].join('\n'),
  // plain built surfaces. plain3 (Prismari): strong mottling, a lift so near-black stone still shows it, and faint courses on upright faces, each a shade of its own
  plain3: [
    '{ vec3 n = normalize(vSxLN), an = abs(n), w = pow(an, vec3(4.0)); w /= (w.x + w.y + w.z);',
    '  float big = sxTri(vSxL, w, 70.0), mid = sxTri(vSxL, w, 17.0), fine = sxTri(vSxL, w, 3.6), aa = length(fwidth(vSxL)), nr = 1.0 - smoothstep(0.5, 2.0, aa);',
    '  float wall = 1.0 - smoothstep(0.55, 0.8, an.y), row = floor(vSxL.y / 3.4), ln = abs(fract(vSxL.y / 3.4) - 0.5) * 3.4, seam = smoothstep(1.46, 1.66, ln) * wall * nr;',
    '  float tone = (0.74 + 0.32 * mid + 0.2 * (big - 0.5) + 0.12 * fine * nr) * (1.0 + (sxTH(vec2(row, 7.1)) - 0.5) * 0.16 * wall);',
    '  diffuseColor.rgb = diffuseColor.rgb * tone * mix(vec3(1.05, 1.0, 0.94), vec3(0.94, 0.99, 1.06), smoothstep(0.3, 0.7, big)) * (1.0 - 0.24 * seam) + vec3(0.03, 0.026, 0.032) * (mid * 0.6 + fine * 0.6) * (1.0 - seam);',
    '  sxBump = (texture2D(uNoise, vSxL.xy / 2.7 + vSxL.z * 0.31).gbr - 0.5) * 0.16 * nr; }'].join('\n'),
  // plain2 (Quandrix, and anything smooth or metal): only a little unevenness of tone and a fine grain
  plain2: [
    '{ vec3 n = normalize(vSxLN), w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);',
    '  float mid = sxTri(vSxL, w, 21.0), fine = sxTri(vSxL, w, 4.3), nr = 1.0 - smoothstep(0.5, 2.0, length(fwidth(vSxL)));',
    '  diffuseColor.rgb = diffuseColor.rgb * (0.86 + 0.22 * mid + 0.08 * fine * nr) + vec3(0.012) * fine;',
    '  sxBump = (texture2D(uNoise, vSxL.xy / 2.7 + vSxL.z * 0.31).gbr - 0.5) * 0.07 * nr; }'].join('\n'),
  // marble (Silverquill's great buildings): clouded stone with two sets of veins and the faint lines of its courses. Light stone takes darker marks and dark stone paler ones, so white stays white and black stays black
  marble: [
    '{ vec3 n = normalize(vSxLN), an = abs(n), w = pow(an, vec3(4.0)); w /= (w.x + w.y + w.z);',
    '  float a = sxTri(vSxL, w, 44.0), b = sxTri(vSxL + 17.3, w, 13.0), c = sxTri(vSxL + 5.1, w, 4.6), nr = 1.0 - smoothstep(0.6, 2.4, length(fwidth(vSxL)));',
    '  float v1 = pow(1.0 - abs(sin((vSxL.x + vSxL.y * 0.7 + vSxL.z * 0.45) * 0.21 + a * 9.0 + b * 3.0)), 9.0), v2 = 0.6 * pow(1.0 - abs(sin((vSxL.x * 0.6 - vSxL.y + vSxL.z * 0.8) * 0.33 + b * 7.0)), 14.0), vein = max(v1, v2) * nr;',
    '  float cy = fract(vSxL.y / 4.6), joint = (1.0 - smoothstep(0.0, 0.03, min(cy, 1.0 - cy))) * (1.0 - smoothstep(0.55, 0.8, an.y)) * nr, lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));',
    '  diffuseColor.rgb *= 0.91 + 0.16 * b + 0.06 * (c - 0.5) * nr;',
    '  diffuseColor.rgb = lum > 0.3 ? diffuseColor.rgb * (1.0 - 0.2 * vein) * (1.0 - 0.1 * joint) : diffuseColor.rgb + vec3(0.085) * vein + vec3(0.03) * joint; }'].join('\n'),
  // the same for the small houses, which are many copies of one box set out across the town. Veins and clouding come from where each point is in the world, so no two houses match;
  // and from where it is on the box itself come a plinth, a cornice under the roof, quoins up the corners and a string course at each floor
  marbleW: [
    '{ vec3 p = vSxW, q = vSxL; float a = texture2D(uNoise, p.xz / 44.0 + p.y * 0.031).r, b = texture2D(uNoise, p.xy / 13.0 + p.z * 0.07).r, c = texture2D(uNoise, p.zy / 4.1 + p.x * 0.13).r, nr = 1.0 - smoothstep(0.6, 2.4, length(fwidth(p)));',
    '  float vein = pow(1.0 - abs(sin((p.x + p.y * 0.7 + p.z * 0.45) * 0.21 + a * 9.0 + b * 3.0)), 9.0) * nr, lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));',
    '  float plinth = 1.0 - smoothstep(-0.44, -0.425, q.y), cornice = smoothstep(0.45, 0.465, q.y), fl = fract(p.y / 8.5), course = (1.0 - smoothstep(0.0, 0.035, min(fl, 1.0 - fl))) * nr;',
    '  float quoin = smoothstep(0.43, 0.445, min(abs(q.x), abs(q.z))) * step(0.5, fract(p.y / 3.4)) * nr, mark = max(max(plinth, cornice), max(quoin * 0.7, course * 0.8));',
    '  diffuseColor.rgb *= 0.9 + 0.2 * b + 0.07 * (c - 0.5) * nr;',
    '  diffuseColor.rgb = lum > 0.3 ? diffuseColor.rgb * (1.0 - 0.2 * vein) * (1.0 - 0.17 * mark) : diffuseColor.rgb + vec3(0.075) * vein + vec3(0.04) * mark; }'].join('\n'),
  // a tiled roof on a built thing, worked in the thing's own frame: rows up the slope, the tiles of one row breaking joint with the next, each a shade of its own, its lower lip catching the light
  tiles: [
    '{ vec3 n = normalize(vSxLN); vec2 hz = n.xz; float hl = length(hz), on = smoothstep(0.08, 0.2, hl);',
    '  float u = dot(vSxL.xz, vec2(-hz.y, hz.x) / max(hl, 1e-3)), sl = vSxL.y / max(hl, 0.2), row = floor(sl / 1.8), fy = fract(sl / 1.8), bx = u / 2.4 + 0.5 * mod(row, 2.0), fx = fract(bx);',
    '  float aa = fwidth(u) + fwidth(sl), nr = (1.0 - smoothstep(0.4, 1.4, aa)) * on, e = min(min(fx, 1.0 - fx) * 2.4, min(fy, 1.0 - fy) * 1.8), joint = (1.0 - smoothstep(0.05 + aa * 0.5, 0.2 + aa * 1.4, e)) * nr;',
    '  float h1 = sxTH(vec2(floor(bx), row)), tone = 1.0 + (h1 - 0.5) * 0.22 * nr + 0.12 * (1.0 - fy) * nr, lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));',
    '  diffuseColor.rgb = lum > 0.06 ? diffuseColor.rgb * tone * (1.0 - 0.32 * joint) : diffuseColor.rgb * tone + vec3(0.02, 0.02, 0.028) * (1.0 - joint) * (0.4 + h1) * nr; }'].join('\n'),
  // their roofs: slates in rows, unevenly weathered
  slateW: [
    '{ vec3 p = vSxW; float b = texture2D(uNoise, p.xz / 9.0 + p.y * 0.11).r, c = texture2D(uNoise, p.xz / 2.3 + p.y * 0.4).r, nr = 1.0 - smoothstep(0.5, 2.0, length(fwidth(p)));',
    '  float row = fract(p.y / 1.9), ln = (1.0 - smoothstep(0.0, 0.14, row)) * nr, lum = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));',
    '  diffuseColor.rgb = lum > 0.05 ? diffuseColor.rgb * (0.8 + 0.3 * b + 0.1 * (c - 0.5) * nr) * (1.0 - 0.24 * ln) : diffuseColor.rgb * (0.8 + 0.5 * b) + vec3(0.012, 0.012, 0.017) * (b + c * nr + ln * 1.6); }'].join('\n'),
  // a folded paper dart or boat, in its own frame: the crease runs down the middle (z = 0) and each side shades away from it
  fold: [
    '{ float f1 = texture2D(uNoise, vec2(vSxL.x / 2.1, vSxL.z / 9.0) + vSxL.y * 0.31).r, az = abs(vSxL.z);',
    '  diffuseColor.rgb *= (0.8 + 0.2 * f1) * (1.0 - 0.55 * (1.0 - smoothstep(0.1, 0.55, az))) * (0.78 + 0.22 * smoothstep(0.0, 3.5, az)); }'].join('\n'),
};
const applyTex = (m, kind) => { if (!m.isMeshStandardMaterial || m.fog === false || !TEXGL[kind]) return m; m.userData.tex = kind;
  m.onBeforeCompile = sh => { sh.uniforms.uNoise = U.uNoise;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TEX_VERT[0]).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + TEX_VERT[1]);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TEX_HEAD).replace('#include <color_fragment>', '#include <color_fragment>\n' + TEXGL[kind]).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + sxBump);'); };
  m.customProgramCacheKey = () => 'sxtex-' + kind; m.needsUpdate = true; return m; };
const tx = (m, kind) => { m.userData.tex = kind; return m; };
// anything plain, matt and green is foliage or moss, and gets the leaf texture without being asked
let texRegion = 0;   // the college whose ground the thing being built stands on: addThing sets it
const texAuto = m => { if (m.userData.tex) return applyTex(m, m.userData.tex); if (!m.isMeshStandardMaterial || m.transparent || m.name || m.fog === false) return m;
  const c = m.color, glow = m.emissiveIntensity >= .5 && m.emissive.getHex() !== 0;
  if (!m.map && !glow && m.metalness < .05 && m.roughness >= .9 && c.g > c.r * 1.12 && c.g > c.b * 1.12) return applyTex(m, 'leaf');   // anything plain, matt and green is foliage or moss
  if (glow) return m;
  if (texRegion === SILV) return m.map || c.r + c.g + c.b > 1.5 ? applyTex(m, 'marble') : m;
  if (m.map) return m;
  if (texRegion === PRIS || texRegion === VOLCB) return applyTex(m, m.metalness > .3 || m.roughness < .4 ? 'plain2' : 'plain3');
  if (texRegion === QUAN) return applyTex(m, 'plain2');
  return m; };
const nearWalk = (x, z, r) => { for (const p of WALKS) if (polyDist(p, x / S, z / S) < r / S) return true; return false; };

// Prismari spire: the ground itself swept up by the wind and frozen - flared foot, arcing over downwind to a point
function spireGeo(arc, seed) {
  const r = mulberry32(seed), seg = 18, sides = 7, pos = [], col = [], idx = [];
  const base = new THREE.Color(0x4a3a5e), mid = new THREE.Color(0x2a2236), tip = new THREE.Color(0x0e0c13), c = new THREE.Color();
  const jit = Array.from({ length: sides }, () => 1 + .3 * (r() - .5));
  for (let i = 0; i <= seg; i++) { const t = i / seg, th = t * arc, Rb = 1 / arc;
    const cx = Rb * (1 - Math.cos(th)), cy = Rb * Math.sin(th);
    const rad = .1 * Math.pow(1 - t, .9) * (1 + 2.2 * Math.pow(1 - t, 7)) + .003;        // wide foot that melts into the ground, needle tip
    for (let k = 0; k < sides; k++) { const a = k / sides * Math.PI * 2 + t * 1.1, w = jit[k] * (1 + .12 * (r() - .5));
      const e1 = Math.cos(a) * rad * w, e2 = Math.sin(a) * rad * .62 * w;                 // thinner across the wind: a fin, not a cone
      pos.push(cx + e1 * Math.cos(th), cy - e1 * Math.sin(th), e2);
      if (t < .3) c.lerpColors(base, mid, t / .3); else c.lerpColors(mid, tip, sstep(.3, .9, t));
      const v = .88 + .24 * r(); col.push(c.r * v, c.g * v, c.b * v); } }
  for (let i = 0; i < seg; i++) for (let k = 0; k < sides; k++) { const a = i * sides + k, b = i * sides + (k + 1) % sides, d = a + sides, e = b + sides; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

function buildProps() {
  // trees are tiny on screen and there are thousands, so they are low-poly with shared vertices
  const treeMat = applyTex(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), 'leaf');
  const tree = parts => mergeVertices(mergeGeometries(parts));
  const conifer = tree([
    part(new THREE.CylinderGeometry(.35, .5, 2.4, 5, 1, true), 0x4a3524, { y: 1.2 }),
    part(new THREE.ConeGeometry(2.5, 5, 7, 1, true), 0x2c5529, { y: 4.4 }), part(new THREE.ConeGeometry(1.9, 4.2, 7, 1, true), 0x356330, { y: 7 }), part(new THREE.ConeGeometry(1.2, 3.2, 7, 1, true), 0x3d6f36, { y: 9.3 })]);
  const broad = tree([
    part(new THREE.CylinderGeometry(.4, .6, 3.2, 5, 1, true), 0x4a3524, { y: 1.6 }),
    part(new THREE.SphereGeometry(3.3, 8, 6), 0x466d33, { y: 5.3, sy: .8 }), part(new THREE.SphereGeometry(2.3, 7, 5), 0x577f3d, { x: 1.6, y: 6.4, z: .9 })]);
  const mangParts = [part(new THREE.CylinderGeometry(.5, .65, 3.4, 5, 1, true), 0x3b2f24, { y: 4.4 }),
    part(new THREE.SphereGeometry(4, 8, 5), 0x2c4627, { y: 7.4, sx: 1.35, sy: .55, sz: 1.35 }), part(new THREE.SphereGeometry(2.8, 6, 4), 0x385530, { x: 2.2, y: 8.6, z: -1.2, sy: .6 })];
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mangParts.push(part(new THREE.CylinderGeometry(.16, .24, 3.8, 3, 1, true), 0x3b2f24, { x: Math.cos(a) * 1.25, y: 1.6, z: Math.sin(a) * 1.25, rz: Math.cos(a) * .5, rx: -Math.sin(a) * .5 })); }
  const mangrove = tree(mangParts);
  // Detention Bog trees: black, clawed, with ragged violet and sickly green rags of foliage and hanging strands
  const bogTree = tree((() => { const K = 0x17111c, out = [
      part(new THREE.CylinderGeometry(.55, 1.0, 4.4, 5, 1, true), K, { y: 2.2, rz: .12 }),
      part(new THREE.CylinderGeometry(.36, .55, 4.2, 5, 1, true), K, { x: -.9, y: 6, rz: .38 }),
      part(new THREE.CylinderGeometry(.2, .36, 3.8, 5, 1, true), K, { x: -1.2, y: 9.6, rz: -.3 })];
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + .4, y = 5.5 + i * .95, l = 5.2 - i * .35, ca = Math.cos(a), sa = Math.sin(a), bx = -1 + ca * l * .42, bz = sa * l * .42;
      out.push(part(new THREE.CylinderGeometry(.05, .26, l, 4, 1, true), K, { x: bx, y: y + l * .2, z: bz, rz: -ca * 1.15, rx: sa * 1.15 }));                 // long limb
      out.push(part(new THREE.CylinderGeometry(.02, .09, l * .5, 3, 1, true), K, { x: bx + ca * l * .5, y: y + l * .62, z: bz + sa * l * .5, rz: -ca * .25, rx: sa * .25 }));   // hooked tip
      if (i % 2) out.push(part(new THREE.SphereGeometry(.95, 5, 4), i % 4 === 1 ? 0x4a2458 : 0x2c5a4e, { x: bx + ca * l * .46, y: y + l * .5, z: bz + sa * l * .46, sy: .4 }));
      out.push(part(new THREE.CylinderGeometry(.03, .03, 2.6 + i * .3, 3, 1, true), 0x4a3058, { x: bx + ca * l * .3, y: y - .6, z: bz + sa * l * .3 })); }       // hanging strand
    return out; })());
  const dead = tree([
    part(new THREE.CylinderGeometry(.14, .5, 8.5, 4, 1, true), 0x24201d, { y: 4.25 }),
    part(new THREE.CylinderGeometry(.05, .2, 4, 3, 1, true), 0x24201d, { x: 1.3, y: 6, rz: -.9 }), part(new THREE.CylinderGeometry(.05, .18, 3.4, 3, 1, true), 0x24201d, { x: -1.1, y: 7, rz: .85 }),
    part(new THREE.CylinderGeometry(.04, .15, 3, 3, 1, true), 0x24201d, { z: 1, y: 5, rx: .9 })]);

  const gable = (w, hgt, len) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, hgt); sh.closePath();
    const ge = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); ge.translate(0, 0, -len / 2); return ge; };
  const stone = solid(0xd8d1c0, .7), teal = solid(0x2f6f73, .4), sand = solid(0xa9825a, .9), roofRed = solid(0x7a3b2c, .8);
  const CENW = Wp(CEN);

  // ================= things (clickable, each linked to the hexes it covers) =================
  // ================= shared building kit =================
  const kit = g => ({
    B: (w, hh, d, m, x, y, z, o) => M(g, new THREE.BoxGeometry(w, hh, d), m, x, y, z, o),
    C: (r0, r1, hh, n, m, x, y, z, o) => M(g, new THREE.CylinderGeometry(r0, r1, hh, n), m, x, y, z, o),
    K: (r, hh, n, m, x, y, z, o) => M(g, new THREE.ConeGeometry(r, hh, n), m, x, y, z, o),
    S: (r, m, x, y, z, o) => M(g, new THREE.SphereGeometry(r, 14, 10), m, x, y, z, o),
    D: (r, m, x, y, z, o) => M(g, new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, x, y, z, o),
    T: (R, t, m, x, y, z, o, arc) => M(g, new THREE.TorusGeometry(R, t, 6, 40, arc ?? Math.PI * 2), m, x, y, z, o) });
  const cream = solid(0xe6dfcc, .75), slate = solid(0x3e5f73, .5), wood = solid(0x5a3d28, .85), darkRoof = solid(0x2f2622, .8), lawn = solid(0x4f7a35, 1);
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a64e, roughness: .3, metalness: .5 });
  const glowM = (hex, k = 2.5) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: k, roughness: .5 });
  const glassM = (hex, op = .55) => new THREE.MeshStandardMaterial({ color: hex, roughness: .05, transparent: true, opacity: op, envMapIntensity: 2, side: THREE.DoubleSide });
  const canvasTex = (w, hgt, draw, rx = 1, ry = 1) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt; draw(cv.getContext('2d'), w, hgt);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
  // a wall with rows of windows, a few of them lit
  const wallMat = (cols, rows, wall = '#e3dccb', win = '#31465a', lit = '#ffdf9a', rough = .75) => new THREE.MeshStandardMaterial({ roughness: rough, map: canvasTex(256, 128, (c, w, hgt) => {
    c.fillStyle = wall; c.fillRect(0, 0, w, hgt); const cw = w / cols, ch = hgt / rows; let k = 7;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { k = (k * 16807 + 11) % 2147483647; c.fillStyle = k % 5 === 0 ? lit : win; c.fillRect(i * cw + cw * .3, j * ch + ch * .22, cw * .4, ch * .56); }
    c.fillStyle = 'rgba(0,0,0,.12)'; for (let j = 1; j < rows; j++) c.fillRect(0, j * ch - 1, w, 2); }) });
  const starGeo = (R, r, depth) => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + Math.PI / 2, d = i % 2 ? r : R; i ? sh.lineTo(Math.cos(a) * d, Math.sin(a) * d) : sh.moveTo(Math.cos(a) * d, Math.sin(a) * d); }
    sh.closePath(); const ge = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); ge.translate(0, 0, -depth / 2); return ge; };
  const face = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);   // rotation that turns a building's front (+z) toward a point
  const wht2 = solid(0xe9e2d0, .8);
  const noShadow = o => o.traverse(m => { m.userData.noShadow = true; m.raycast = () => {}; });

  // a strand of elemental energy winding upward (jag > 0 makes it a crackling bolt)
  const strand = (r0, r1, y0, y1, turns, phase, tube, mat, jag) => { const pts = [], n = jag ? 70 : 90;
    for (let i = 0; i <= n; i++) { const t = i / n, a = phase + t * turns * 6.283, r = lerp(r0, r1, t) * (1 + .12 * Math.sin(t * 9 + phase)) + (jag ? (rng() - .5) * jag : 0);
      pts.push(new THREE.Vector3(Math.cos(a) * r, lerp(y0, y1, t) + (jag ? (rng() - .5) * jag : 0), Math.sin(a) * r)); }
    let curve; if (jag) { curve = new THREE.CurvePath(); for (let i = 0; i < n; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1])); } else curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, jag ? n * 2 : 220, tube, 6, false), mat); };
  const EL = {
    fire: new THREE.MeshStandardMaterial({ color: 0x2a0800, emissive: 0xff4a08, emissiveIntensity: 2.6, roughness: .6 }),
    bolt: new THREE.MeshStandardMaterial({ color: 0x101830, emissive: 0x9ccaff, emissiveIntensity: 3.2, roughness: .4 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1c7fb0, emissive: 0x0a3a66, emissiveIntensity: 1, roughness: .08, envMapIntensity: 1.6 }),
    wind: new THREE.MeshStandardMaterial({ color: 0xeaf4ff, emissive: 0x8aa4b8, emissiveIntensity: .45, roughness: .5, transparent: true, opacity: .34, depthWrite: false }),
    ice: new THREE.MeshStandardMaterial({ color: 0xbfe8f4, emissive: 0x3a8aa0, emissiveIntensity: .8, roughness: .15, transparent: true, opacity: .6, depthWrite: false }),
  };

  const NS = m => { m.userData.noShadow = true; return m; };
  // a sheet of something streaming upward (or along): streaky texture whose offset is animated
  const flowMat = (c1, c2, emis, op, speed) => { const tex = canvasTex(64, 256, (c, w, hgt) => { c.fillStyle = c1; c.fillRect(0, 0, w, hgt); let k = 3;
      for (let i = 0; i < 90; i++) { k = (k * 16807 + 7) % 2147483647; const x = k % w, y = (k >> 8) % hgt, l = 20 + (k >> 4) % 60; c.fillStyle = c2; c.globalAlpha = .25 + ((k >> 12) % 60) / 100; c.fillRect(x, y, 1 + (k % 3), l); c.fillRect(x, y - hgt, 1 + (k % 3), l); } }, 1, 2);
    anim.push(t => { tex.offset.y = -t * speed; });   // positive speed streams upward
    return new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: op, roughness: .3, emissive: emis || 0x000000, emissiveIntensity: emis ? 1.6 : 0, emissiveMap: emis ? tex : null, side: THREE.DoubleSide, depthWrite: false }); };
  // falling water that thins away to nothing at its foot (the mist it turns into is added separately)
  const fadeTex = canvasTex(8, 64, (c, w, hgt) => { const gr = c.createLinearGradient(0, 0, 0, hgt); gr.addColorStop(0, '#fff'); gr.addColorStop(.45, '#fff'); gr.addColorStop(1, '#000'); c.fillStyle = gr; c.fillRect(0, 0, w, hgt); });
  const fallMat = (c1, c2, emis, op, speed) => { const m = flowMat(c1, c2, emis, op, speed); m.alphaMap = fadeTex; return m; };
  // weathered stone, drawn once: speckle, stains and cracks (and flutes and drum joints, for columns)
  const stoneTex = (base, dark, light, flutes, rx = 1, ry = 1) => canvasTex(256, 256, (c, w, hgt) => { const r = mulberry32(flutes * 7 + 3); c.fillStyle = base; c.fillRect(0, 0, w, hgt);
      for (let i = 0; i < 2600; i++) { c.fillStyle = r() < .5 ? dark : light; c.globalAlpha = .05 + .16 * r(); const q = 1 + r() * 3; c.fillRect(r() * w, r() * hgt, q, q); }
      for (let i = 0; i < 26; i++) { c.fillStyle = r() < .7 ? dark : light; c.globalAlpha = .05 + .09 * r(); c.beginPath(); c.ellipse(r() * w, r() * hgt, 10 + r() * 34, 6 + r() * 22, r() * 3, 0, 6.283); c.fill(); }
      if (flutes) { const fw = w / flutes; c.globalAlpha = 1; for (let i = 0; i < flutes; i++) { const gr = c.createLinearGradient(i * fw, 0, (i + 1) * fw, 0); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(.3, 'rgba(0,0,0,0)'); gr.addColorStop(.75, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(0,0,0,.32)'); c.fillStyle = gr; c.fillRect(i * fw, 0, fw + 1, hgt); }
        c.fillStyle = 'rgba(0,0,0,.4)'; for (let j = 1; j < 4; j++) c.fillRect(0, j * hgt / 4 - 1, w, 2); }
      c.strokeStyle = dark; c.lineWidth = 1; for (let i = 0; i < 9; i++) { c.globalAlpha = .35 + .3 * r(); c.beginPath(); let x = r() * w, y = r() * hgt; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - .5) * 26; y += 6 + r() * 16; c.lineTo(x, y); } c.stroke(); }
      c.globalAlpha = 1; }, rx, ry);
  // swirling mist: soft puffs the shader carries round an axis - a funnel, a slow ring, or a plume that spreads as it drifts
  const mist = o => { const n = o.n || 160, r = mulberry32(o.seed || 7), aP = new Float32Array(n * 4), aQ = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { aP[4 * i] = r(); aP[4 * i + 1] = o.arms ? Math.floor(r() * o.arms) * 6.283 / o.arms + (r() - .5) * (o.jit ?? .55) : r() * 6.283; aP[4 * i + 2] = r(); aP[4 * i + 3] = (o.size || 24) * (.55 + .9 * r()); aQ[2 * i] = .75 + .5 * r(); aQ[2 * i + 1] = .45 + .55 * r(); }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); ge.setAttribute('aP', new THREE.BufferAttribute(aP, 4)); ge.setAttribute('aQ', new THREE.BufferAttribute(aQ, 2));
    const c = o.col || [.82, .88, .95];
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTime: U.uTime, uScale: FXSCALE, uA: { value: new THREE.Vector4(o.r0 ?? 10, o.r1 ?? 40, o.y0 ?? 0, o.y1 ?? 100) }, uB: { value: new THREE.Vector4(o.spin ?? .5, o.rise ?? 0, o.twist ?? 0, o.pow ?? 1) }, uCol: { value: new THREE.Vector4(c[0], c[1], c[2], o.alpha ?? .16) } },
      vertexShader: 'attribute vec4 aP; attribute vec2 aQ; uniform float uTime, uScale; uniform vec4 uA, uB; varying float vA;' +
        'void main(){ float h = fract(aP.x + uTime * uB.y * aQ.x); float r = mix(uA.x, uA.y, pow(h, uB.w)) * (0.7 + 0.6 * aP.z); float an = aP.y + uTime * uB.x * aQ.x + h * uB.z;' +
        ' vec4 mv = modelViewMatrix * vec4(cos(an) * r, mix(uA.z, uA.w, h), sin(an) * r, 1.0); gl_Position = projectionMatrix * mv;' +
        ' float sz = aP.w * (0.6 + 1.1 * h) * uScale / -mv.z; gl_PointSize = clamp(sz, 1.0, 420.0); vA = aQ.y * smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.6, h) * min(1.0, sz / 3.0) * (0.35 + 0.65 * smoothstep(60.0, 420.0, -mv.z)); }',
      fragmentShader: 'uniform vec4 uCol; varying float vA; void main(){ float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(uCol.rgb, a * a * vA * uCol.a); }' });
    const p = new THREE.Points(ge, m); p.frustumCulled = false; p.raycast = () => {}; return p; };

  // a carved figure on its feet, facing along its own +x: robe, shoulders, head and whatever it carries. kind 0 staff, 1 sword grounded before it, 2 an arm raised with a brand, 3 armoured with spear and shield
  const statue = (g, mat, x, y, z, H, ry, kind) => { const c = Math.cos(ry), sn = Math.sin(ry), P = (geo, dx, yy, dz, o) => M(g, geo, mat, x + dx * c + dz * sn, y + yy, z - dx * sn + dz * c, { ry, ...(o || {}) });
    P(new THREE.CylinderGeometry(H * .1, H * .19, H * .6, 7), 0, H * .3, 0); P(new THREE.CylinderGeometry(H * .15, H * .1, H * .2, 7), 0, H * .7, 0); P(new THREE.BoxGeometry(H * .13, H * .07, H * .4), 0, H * .8, 0); P(new THREE.SphereGeometry(H * .075, 8, 6), 0, H * .9, 0);
    if (kind === 0) { P(new THREE.CylinderGeometry(H * .012, H * .012, H * .98, 5), H * .1, H * .49, H * .22); P(new THREE.SphereGeometry(H * .035, 6, 5), H * .1, H, H * .22); }
    else if (kind === 1) { P(new THREE.BoxGeometry(H * .02, H * .52, H * .06), H * .17, H * .3, 0); P(new THREE.BoxGeometry(H * .03, H * .03, H * .2), H * .17, H * .55, 0); }
    else if (kind === 2) { P(new THREE.BoxGeometry(H * .06, H * .3, H * .06), H * .04, H * .93, H * .2); P(new THREE.ConeGeometry(H * .04, H * .1, 5), H * .04, H * 1.12, H * .2); P(new THREE.ConeGeometry(H * .07, H * .1, 6), 0, H * .98, 0); }
    else { P(new THREE.CylinderGeometry(H * .014, H * .014, H * 1.15, 5), H * .12, H * .58, H * .24); P(new THREE.ConeGeometry(H * .03, H * .1, 4), H * .12, H * 1.2, H * .24); P(new THREE.CylinderGeometry(H * .16, H * .16, H * .03, 8), H * .16, H * .5, -H * .2, { rz: Math.PI / 2 });
      P(new THREE.BoxGeometry(H * .2, H * .09, H * .2), 0, H * .82, H * .2); P(new THREE.BoxGeometry(H * .2, H * .09, H * .2), 0, H * .82, -H * .2); P(new THREE.ConeGeometry(H * .05, H * .14, 4), 0, H * 1.0, 0); } };
  // a shell of force seen edge-on: bright at the rim and banded, almost nothing face-on. Where it meets the ground it draws its own ring
  const fieldShell = (col, k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uCol: { value: new THREE.Vector3(col[0], col[1], col[2]) }, uK: { value: k } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uTime, uK; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); float band = 0.55 + 0.45 * sin(vY * 34.0 - uTime * 1.4); gl_FragColor = vec4(uCol * uK * (f * band + 0.025), 1.0); }' })); m.raycast = () => {}; m.frustumCulled = false; return m; };
  // the field round a Cold Anchor Stone: magic dies for a hex around it and slows for two. A cold shell marks the inner field, a fainter one the outer, and frost sifts down inside
  const coldField = (x, y, z) => { const a = fieldShell([.35, .75, 1.3], .5), b = fieldShell([.3, .5, 1.1], .2); a.position.set(x, y, z); a.scale.setScalar(112); b.position.set(x, y, z); b.scale.setScalar(235); scene.add(a, b);
    for (const [r0, n, sd] of [[34, 70, 90], [78, 110, 91]]) { const sn = mist({ n, seed: sd, r0, r1: r0 * .8, y0: 100, y1: 2, spin: .1, rise: .05, size: 3, alpha: .7, col: [.85, .95, 1.1], add: true }); sn.position.set(x, y, z); scene.add(sn); }
    anim.push(t => { a.material.uniforms.uK.value = .42 + .14 * Math.sin(t * .8); }); };
  // Silverquill marble: black veined with white, white veined with gold
  const marbleTex = (base, vein, seed) => canvasTex(256, 256, (c, w, hgt) => { const r = mulberry32(seed); c.fillStyle = base; c.fillRect(0, 0, w, hgt); for (let i = 0; i < 26; i++) { c.strokeStyle = vein; c.globalAlpha = .12 + .5 * r() * r(); c.lineWidth = .6 + 2 * r() * r(); c.beginPath(); let x = r() * w, y = r() * hgt; c.moveTo(x, y); for (let k = 0; k < 9; k++) { x += (r() - .3) * 44; y += (r() - .5) * 36; c.lineTo(x, y); } c.stroke(); } c.globalAlpha = 1; }, 2, 2);
  const sqST = new THREE.MeshStandardMaterial({ roughness: .2, envMapIntensity: 1.1, map: canvasTex(256, 256, (c, w, hgt) => { const r = mulberry32(21); for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#17171c' : '#ecebe4'; c.fillRect(0, i * 32, w, 32); } c.globalAlpha = .3; for (let i = 0; i < 40; i++) { c.strokeStyle = r() < .5 ? '#fff' : '#000'; c.lineWidth = .6 + r(); c.beginPath(); let x = r() * w, y = r() * hgt; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - .3) * 40; y += (r() - .5) * 20; c.lineTo(x, y); } c.stroke(); } c.globalAlpha = 1; }, 1, 2) });   // courses of black and white marble
  const sqBM = new THREE.MeshStandardMaterial({ map: marbleTex('#15151a', '#d8d8e0', 3), roughness: .16, envMapIntensity: 1.2 }), sqWM = new THREE.MeshStandardMaterial({ map: marbleTex('#ecebe4', '#b89a55', 4), roughness: .22 }), sqGD = solid(0xc9a64e, .3, { metalness: .6 });
  let anchorStone = null;

  let reefThing = null, reefTips = [];
  // ================= central campus =================
  // Bow's End Tavern stands out west at the foot of the Dawnbow, so find its hex first: the great arch is aimed at it
  const TAV = worldToHex(CENW[0] + 500 * Math.cos(3.07), CENW[1] + 500 * Math.sin(3.07));

  // Biblioplex: 7 hexes. Windowed drum and upper drum, ribbed dome, a lantern holding the snarl-light, four reading-hall wings and four slim towers
  addThing('Biblioplex', '🏛️', CENW, 2.8, 129, g => { const k = kit(g), wall = wallMat(40, 2), wall2 = wallMat(28, 1), wingW = wallMat(4, 2);
    k.C(50, 52, 3, 48, stone, 0, 1.5, 0); k.C(42, 46, 18, 48, wall, 0, 12, 0); k.C(47.5, 47.5, 1.6, 48, stone, 0, 21.8, 0);
    for (let i = 0; i < 20; i++) { const a = i / 20 * 6.283; k.C(1.5, 1.5, 17, 8, stone, Math.cos(a) * 48.2, 11.5, Math.sin(a) * 48.2); }
    k.C(31, 34, 9, 32, wall2, 0, 27, 0); k.C(32.5, 32.5, 1.2, 32, gold, 0, 31.6, 0);
    k.D(31, teal, 0, 32, 0, { sy: .9 });
    for (let i = 0; i < 12; i++) M(g, new THREE.TorusGeometry(31.3, .5, 4, 14, Math.PI / 2), gold, 0, 32, 0, { ry: i / 12 * 6.283, sy: .9 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; k.C(.5, .5, 7, 6, gold, Math.cos(a) * 4.4, 63, Math.sin(a) * 4.4); }
    k.S(3.2, glowM(0xfff2c4, 4.5), 0, 63, 0); k.D(5.4, teal, 0, 66.4, 0); k.K(1.1, 15, 8, gold, 0, 78.5, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s2 = Math.sin(a), ry = Math.PI / 2 - a;
      k.B(15, 15, 16, wingW, c * 45, 10.5, s2 * 45, { ry }); M(g, gable(16.5, 6, 17), teal, c * 45, 18, s2 * 45, { ry }); k.C(7.5, 7.5, 15, 12, stone, c * 53, 10.5, s2 * 53); k.D(7.5, teal, c * 53, 18, s2 * 53);
      const b = i * Math.PI / 2, cb = Math.cos(b), sb = Math.sin(b); k.C(3.2, 3.7, 44, 10, stone, cb * 47.5, 25, sb * 47.5); k.C(4.2, 4.2, 1.4, 10, gold, cb * 47.5, 44, sb * 47.5); k.D(3.7, teal, cb * 47.5, 47, sb * 47.5); k.K(.7, 8, 6, gold, cb * 47.5, 54.6, sb * 47.5); }
  }, { top: 92, view: 820 });

  // the Dawnbow: not a hoop but a great arc of separate slabs of pale stone hanging in the air over the library, each set like a stroke on a dial - long ones and short ones, a little out of true -
  // with one enormous shard hanging point-down from the crown of it. Its western foot is at Bow's End. The whole of it rides very slowly up and down
  { const dx = TAV.x - CENW[0], dz = TAV.z - CENW[1], dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl, RD = dl - 58, by = heightAt(CENW[0], CENW[1]) - 8, br = mulberry32(1107), geos = [], bowG = new THREE.Group();
    const bowM = applyTex(new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: .8, emissive: 0x9aa0a8, emissiveIntensity: .24 }), 'rock');
    const slab = (t, L, w, off, th) => { const ge = new THREE.CylinderGeometry(w * .62, w * .42, L, 4, 1); ge.rotateY(Math.PI / 4); ge.scale(1, 1, th); ge.rotateZ(t - Math.PI / 2 + (br() - .5) * .07); const r = RD + off; ge.translate(Math.cos(t) * r, Math.sin(t) * r, (br() - .5) * 12); geos.push(ge); };   // wider at its outer end, thin, its length along the spoke
    for (let t = .17; t < Math.PI - .17;) { const big = br() < .3; if (Math.abs(t - Math.PI / 2) > .085) slab(t, big ? 70 + br() * 55 : 20 + br() * 26, big ? 22 + br() * 10 : 11 + br() * 9, (br() - .5) * 26 + (big ? 14 : 0), .3 + br() * .15); t += (big ? .075 : .045) + br() * .02; }
    { const L = 200, top = RD + 74, sq = ge => { ge.scale(1, 1, .62); return ge; }; geos.push(sq(new THREE.CylinderGeometry(21, 12, L, 6, 3)).translate(0, top - L / 2, 0), sq(new THREE.ConeGeometry(12, 34, 6).rotateX(Math.PI)).translate(0, top - L - 17, 0), sq(new THREE.ConeGeometry(21, 26, 6)).translate(0, top + 13, 0));
      for (const f of [.2, .45, .7]) geos.push(sq(new THREE.CylinderGeometry(lerp(21, 12, f) + 1.7, lerp(21, 12, f) + 1.3, 5, 6)).translate(0, top - L * f, 0)); }                                                                    // the great shard at the crown, banded, its point just clear of the library's spire
    const bow = new THREE.Mesh(mergeGeometries(geos), bowM); bow.castShadow = true; bow.raycast = () => {}; bow.frustumCulled = false; bowG.add(bow); bowG.position.set(CENW[0], by, CENW[1]); bowG.rotation.y = -Math.atan2(uz, ux); scene.add(bowG);
    anim.push(t => { bowG.position.y = by + 3.5 * Math.sin(t * .3); });
    for (let i = 1; i < 20; i++) { const t = i / 20 * Math.PI; lanternPts.push([CENW[0] + ux * RD * Math.cos(t), by + RD * Math.sin(t) + 5, CENW[1] + uz * RD * Math.cos(t), { c: [2.2, 2.2, 2], size: 8 + (i % 3) * 3, drift: 3, speed: .8 }]); } }

  // Bow's End Tavern: 1 hex. Squat and comfortable, its walls carved with overlapping star motifs
  addThing("Bow's End Tavern", '🍺', [TAV.x, TAV.z], 1.9, 30, g => { const k = kit(g), timber = solid(0x6a4a30, .9), stoneD = solid(0x6f675c, .9), starM = new THREE.MeshStandardMaterial({ color: 0xcaa24a, emissive: 0x6a4a10, emissiveIntensity: .6, roughness: .4, metalness: .4 });
    k.C(27, 29, 2, 8, stoneD, 0, 1, 0); k.C(25, 26.5, 11, 8, timber, 0, 7.5, 0); k.K(33, 13, 8, darkRoof, 0, 19.5, 0); k.C(6.5, 6.5, 4, 8, timber, 0, 25, 0); k.K(9, 6.5, 8, darkRoof, 0, 30.2, 0);
    k.B(4.6, 18, 4.6, stoneD, 13, 21, -9);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + Math.PI / 8, c = Math.cos(a), s2 = Math.sin(a), ry = Math.PI / 2 - a;
      if (i % 2) { M(g, starGeo(3.6, 1.5, .6), starM, c * 24.2, 8.4, s2 * 24.2, { ry }); M(g, starGeo(2.2, .9, .6), starM, c * 24.4 - s2 * 4.5, 6.2, s2 * 24.4 + c * 4.5, { ry }); M(g, starGeo(2.2, .9, .6), starM, c * 24.4 + s2 * 4.5, 6.2, s2 * 24.4 - c * 4.5, { ry }); }
      else { k.B(5, 4.5, .6, glowM(0xffb860, 2.2), c * 24.1, 7.5, s2 * 24.1, { ry }); } }
    k.B(13, 9, 7, timber, 0, 6.5, 26); M(g, gable(15, 5, 8), darkRoof, 0, 11, 26); k.B(5, 7, .5, glowM(0xffb860, 1.6), 0, 5.5, 29.6);
    for (const [x, z] of [[9, 27], [11.5, 25], [-10, 27]]) k.C(1.7, 1.7, 3.4, 10, wood, x, 3.7, z);
    k.C(.35, .35, 12, 6, wood, -15, 8, 26); k.B(6, 4, .5, wood, -15, 12, 26);
  }, { ry: face([TAV.x, TAV.z], CENW), top: 44, view: 420 });
  chimneys.push([TAV.x, heightAt(TAV.x, TAV.z) + 60, TAV.z]);

  // First Year Dorms: 3 hexes. A U-shaped residence round a courtyard, with corner towers and a clock tower
  { const p = [CENW[0] + 236 * Math.cos(POOLS[1].mid), CENW[1] + 236 * Math.sin(POOLS[1].mid)];
    addThing('First Year Dorms', '🛏️', p, 1.5, 72, g => { const k = kit(g), wall = wallMat(16, 4), wallS = wallMat(10, 4);
      k.B(76, 24, 15, wall, 0, 12, -24); M(g, gable(17, 7, 78), slate, 0, 24, -24, { ry: Math.PI / 2 });
      for (const sx of [-1, 1]) { k.B(15, 24, 46, wallS, sx * 30.5, 12, 3); M(g, gable(17, 7, 48), slate, sx * 30.5, 24, 3);
        for (const z of [27, -31]) { k.C(5.5, 6, 36, 10, cream, sx * 38, 18, z); k.C(6.6, 6.6, 1.2, 10, stone, sx * 38, 30, z); k.K(7, 13, 10, slate, sx * 38, 42.5, z); } }
      k.B(11, 46, 11, cream, 0, 23, -24); M(g, new THREE.CircleGeometry(3.8, 24), glowM(0xfff1c0, 1.5), 0, 38, -18.3); k.K(8.6, 15, 4, slate, 0, 53.5, -24, { ry: Math.PI / 4 });
      k.B(46, 3.2, 5, cream, 0, 16, 22); k.B(46, .8, 6, slate, 0, 18, 22);                                   // skybridge between the wings
      k.C(6, 6.6, 1.6, 16, stone, 0, .8, 4); k.C(5, 5, .5, 16, glassM(0x2e7f96, .85), 0, 1.6, 4); k.C(.8, 1, 5, 8, stone, 0, 3.5, 4);   // courtyard fountain
      for (const [x, z] of [[-13, -6], [13, -6], [-13, 14], [13, 14]]) { k.C(.5, .7, 4, 6, wood, x, 2, z); k.S(3.2, lawn, x, 6, z, { sy: .85 }); }
    }, { ry: face(p, CENW), top: 66, view: 560 }); }

  // Archway Commons: 3 hexes, just south of the Biblioplex. A formal garden on a low terrace. At its head the founder stands hooded, staff in hand, on a pedestal in a round fountain, a ring of small stone slabs hanging in the air behind -
  // the Dawnbow in little. Pale paved walks edged in red stone cross it; a square hedge maze lies either side of the main walk, a long planted bed between them; cypresses line the walk down to the steps at the south
  { const CK = .68, h0 = worldToHex(CENW[0], CENW[1] + 242), p = [h0.x, h0.z], gy = heightAt(p[0], p[1]), FZ = -22, lamps = [];
    addThing('Archway Commons', '🌳', p, CK, 30, g => { const k = kit(g), pathM = solid(0xcfc5ac, .9), inlay = solid(0x9a6a52, .9), hedge = solid(0x2f5a2c, 1), hedgeL = solid(0x44783a, 1), cyp = solid(0x1d4024, 1), soil = solid(0xb7ab90, .95), beds = [0x9c6876, 0xa89250, 0x77698c, 0x9c6e4c].map(c => solid(c, .9)), ar = mulberry32(77);
      const stat = tx(solid(0x8d9399, .8), 'rock'), shard = tx(new THREE.MeshStandardMaterial({ color: 0xe4e7ea, roughness: .8, emissive: 0x9aa0a8, emissiveIntensity: .26 }), 'rock');
      k.C(88, 90, 1, 44, lawn, 0, .5, 0); k.T(88.4, 1, cream, 0, 1, 0, { rx: Math.PI / 2 });                                                                                              // the terrace: lawn, kerbed in stone
      // the walks: the long one from the steps to the fountain, one across, the round before the fountain; each edged with a line of red stone, and a diamond let into the long walk
      k.B(16, .4, 152, pathM, 0, 1.2, 8); k.B(156, .4, 12, pathM, 0, 1.2, FZ); k.C(31, 31, .4, 40, pathM, 0, 1.22, FZ); for (const sx of [-1, 1]) { k.B(.8, .14, 152, inlay, sx * 7, 1.46, 8); k.B(11, .4, 56, pathM, sx * 58, 1.2, 14); }
      for (const sz of [-1, 1]) k.B(156, .14, .8, inlay, 0, 1.46, FZ + sz * 5.2); k.T(30, .5, inlay, 0, 1.45, FZ, { rx: Math.PI / 2 }); k.T(18.5, .4, inlay, 0, 1.45, FZ, { rx: Math.PI / 2 });
      for (const [x, z, r] of [[5.5, 56, .785], [-5.5, 56, -.785], [5.5, 67, -.785], [-5.5, 67, .785]]) k.B(.8, .14, 15.5, inlay, x, 1.47, z, { ry: r });
      // the fountain and the founder
      k.C(15.5, 16.5, 2.8, 30, cream, 0, 2.5, FZ); k.T(15.6, .7, cream, 0, 3.9, FZ, { rx: Math.PI / 2 }); k.C(14, 14, .5, 30, glassM(0x2e7f96, .85), 0, 3.6, FZ); k.C(5.4, 6.4, 5, 12, cream, 0, 4.8, FZ); k.C(6.8, 6.8, .8, 12, stat, 0, 7.6, FZ); k.C(3.8, 4.6, 3.4, 10, stat, 0, 9.6, FZ);
      statue(g, stat, 0, 11.2, FZ, 30, -Math.PI / 2, 0);
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + .5; NS(k.C(.25, .25, 2.2, 5, glassM(0xcfeaf4, .7), Math.cos(a) * 10, 4.8, FZ + Math.sin(a) * 10)); }                           // jets
      // the halo: small slabs of the same pale stone standing in the air in a ring behind the statue, open at the foot
      for (let i = 0; i < 26; i++) { const t = -.45 + i / 25 * (Math.PI + .9), big = i % 3 === 0, L = big ? 10 + ar() * 5 : 4.5 + ar() * 3, r = 31 + (big ? 2.5 : 0) + (ar() - .5) * 2; k.B(big ? 4 : 2.6, L, 1.3, shard, Math.cos(t) * r, 25 + Math.sin(t) * r, FZ - 5 + (ar() - .5) * 1.5, { rz: t - Math.PI / 2 + (ar() - .5) * .08 }); }
      // curved hedges and beds either side of the fountain
      for (const sx of [-1, 1]) { M(g, new THREE.TorusGeometry(43, 2.3, 5, 18, 1.0), hedge, 0, 2.2, FZ, { rx: Math.PI / 2, rz: sx > 0 ? -.5 : Math.PI - .5 }); M(g, new THREE.TorusGeometry(50, 5, 4, 18, .8), lawn, 0, 1.2, FZ, { rx: Math.PI / 2, rz: sx > 0 ? -.4 : Math.PI - .4, sz: .2 }); }
      // the two hedge mazes: square within square, each ring with one gap, a block of clipped hedge at the heart
      const maze = (cx, cz, sz) => { k.B(sz + 4, .3, sz + 4, soil, cx, 1.15, cz); const wall = (w, d, x, z, m) => k.B(w, 3.2, d, m, cx + x, 2.8, cz + z), h2 = sz / 2, m2 = h2 - 5.5;
        wall(sz, 2.4, 0, -h2, hedge); wall(2.4, sz, -h2, 0, hedge); wall(2.4, sz, h2, 0, hedge); wall(sz * .36, 2.4, -sz * .32, h2, hedge); wall(sz * .36, 2.4, sz * .32, h2, hedge);
        wall(m2 * 2, 2.2, 0, m2, hedgeL); wall(2.2, m2 * 2, -m2, 0, hedgeL); wall(2.2, m2 * 2, m2, 0, hedgeL); wall(m2 * .7, 2.2, -m2 * .65, -m2, hedgeL); wall(m2 * .7, 2.2, m2 * .65, -m2, hedgeL);
        wall(h2 - 9, h2 - 9, 0, 0, hedge); k.B(h2 - 9.4, .4, h2 - 9.4, hedgeL, cx, 4.5, cz); };
      maze(-34, 30, 34); maze(34, 30, 34);
      // down the middle of the long walk: a long planted bed in a stone kerb, a round shrub before and after it
      k.C(8, 8.6, 1.3, 26, cream, 0, 1.7, 30, { sz: 1.9 }); k.S(7.2, hedgeL, 0, 2.2, 30, { sz: 1.9, sy: .34 }); for (const z of [9, 51]) { k.C(3.4, 3.7, 1, 14, cream, 0, 1.6, z); k.S(3, hedge, 0, 2.6, z, { sy: .7 }); }
      // cypresses down both sides of the walk to the steps, and the steps themselves between two low walls
      for (const sx of [-1, 1]) { for (let i = 0; i < 6; i++) { const z = 54 + i * 5.4; k.C(.35, .45, 2.4, 5, wood, sx * 11.5, 2.2, z); k.K(2.3, 13 + (i % 2) * 1.5, 8, cyp, sx * 11.5, 9.5, z); k.S(2, cyp, sx * 11.5, 4.6, z, { sy: 1.5 }); }
        k.B(26, 2.6, 2, stone, sx * 24, 2.3, 86.5); k.B(27, .6, 2.8, cream, sx * 24, 3.9, 86.5); k.C(1.6, 1.9, 4.6, 8, cream, sx * 10.2, 3.3, 86.5); NS(k.S(1.3, glowM(0xffd890, 3), sx * 10.2, 6.6, 86.5)); lamps.push([sx * 10.2, 6.6, 86.5]); }
      for (let i = 0; i < 4; i++) k.B(19, .5, 2.6, cream, 0, 1.15 - i * .32, 86 + i * 2.5);
      // flower beds, benches and lamps
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283, x = Math.cos(a) * 70, z = Math.sin(a) * 70; k.C(6.4, 6.9, 1.2, 14, cream, x, 1.5, z); k.S(5.6, beds[i % 4], x, 2, z, { sy: .32 }); k.S(2.4, hedgeL, x, 2.6, z, { sy: .8 }); }   // each a low mound of one colour in a stone kerb, a clipped bush at its middle
      for (const [x, z, r] of [[-22, FZ + 26, .6], [22, FZ + 26, -.6], [-12, 44, 1.5708], [12, 44, 1.5708], [-12, 14, 1.5708], [12, 14, 1.5708]]) k.B(6.5, 1.5, 2, wood, x, 1.9, z, { ry: r });
      for (const [x, z] of [[-10.5, -2], [10.5, -2], [-10.5, 22], [10.5, 22], [-10.5, 44], [10.5, 44], [-40, FZ - 8], [40, FZ - 8]]) { k.C(.4, .5, 11, 6, darkRoof, x, 6.5, z); NS(k.S(1.3, glowM(0xffd890, 3), x, 12.6, z)); lamps.push([x, 12.6, z]); }
      // the trees round the edge, clear of the walks
      const list = []; for (let i = 0; i < 30; i++) { const a = i * 2.39996, d = 60 + (i * 17) % 26, x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(x) < 13 || Math.abs(z - FZ) < 10 || (Math.abs(Math.abs(x) - 34) < 22 && Math.abs(z - 30) < 22) || nearWalk(p[0] + x * CK, p[1] + z * CK, 12)) continue; list.push({ x, y: 1, z, s: 1.6 + (i % 4) * .25, ry: i, tint: [.95 + (i % 3) * .1, 1.05, .9] }); }
      g.add(fillInstanced(new THREE.InstancedMesh(broad, treeMat, list.length), list));
    }, { y: gy, top: 100, view: 560 });
    for (const [x, y, z] of lamps) lanternPts.push([p[0] + x * CK, gy + y * CK, p[1] + z * CK, { size: 5, drift: .1, speed: .3 }]);
    for (let i = 0; i < 9; i++) { const t = -.3 + i / 8 * (Math.PI + .6); lanternPts.push([p[0] + 31 * CK * Math.cos(t), gy + (25 + 31 * Math.sin(t)) * CK, p[1] + (FZ - 5) * CK, { c: [2.2, 2.2, 2], size: 5, drift: 1.2, speed: .9 }]); } }

  // Firejolt Cafe: 1 hex, on the edge of the Commons. Bright and clean, with a striped awning, a terrace of tables and a lightning-bolt sign
  { const hx = worldToHex(CENW[0] + 225 * Math.cos(.7), CENW[1] + 225 * Math.sin(.7));
    if (!hexOwner.has(hexKey(hx.q, hx.r))) addThing('Firejolt Cafe', '☕', [hx.x, hx.z], 1.8, 20, g => { const k = kit(g), wall = wallMat(6, 2, '#ded4bf', '#3d4f5c', '#f2dca8'), deck = solid(0x9a6d45, .9);
      const stripe = new THREE.MeshStandardMaterial({ roughness: .8, map: canvasTex(64, 8, (c, w, hgt) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#e6dfd0' : '#8f4a3e'; c.fillRect(i * 8, 0, 8, hgt); } }, 2, 1) });
      k.B(30, 14, 20, wall, 0, 7, -5); k.B(32, 1.6, 22, cream, 0, 14.8, -5); k.B(30, .8, 8, stripe, 0, 8.6, 8.6, { rx: .3 }); k.B(5, 8, .6, glowM(0xffe2a0, 1.4), 0, 4, 5.2);
      k.B(36, .7, 14, deck, 0, .35, 14);
      const um = [0x8f4a3e, 0x4a6680, 0xa89250, 0x5a7558, 0x8c6a78];
      for (let i = -2; i <= 2; i++) { const x = i * 6.6, z = 14 + (i % 2) * 2.5; k.C(2, 2, .35, 12, cream, x, 2.6, z); k.C(.2, .2, 6.5, 6, darkRoof, x, 3.3, z); k.K(3.5, 2, 12, solid(um[i + 2], .8), x, 7.4, z); }
      k.C(4, 3.1, 6, 18, solid(0xf6f3ec, .4), -7, 18.6, -5); k.C(3.5, 3.5, .3, 18, solid(0x4a2c18, .5), -7, 21.5, -5); k.T(2.3, .6, solid(0xf6f3ec, .4), -11.4, 18.6, -5);          // the cup
      const bolt = glowM(0xe8c458, 1.9); k.B(1.6, 6.5, 1, bolt, 6.8, 23, -5, { rz: -.5 }); k.B(4.4, 1.5, 1, bolt, 6, 20.3, -5); k.B(1.6, 6.5, 1, bolt, 5.2, 17.6, -5, { rz: -.5 });     // the firejolt
    }, { ry: face([hx.x, hx.z], CENW), top: 44, view: 400 }); }

  // Strixhaven Stadium: 7 hexes. Tiered seating in college colours, a ring of pillars, a gatehouse, two mage towers on the field and six flag spires
  addThing('Strixhaven Stadium', '🏟️', Wp(STADIUM), 1.8, 147, g => { const k = kit(g);
    const COLS = ['#a8322c', '#2b5fa8', '#2f8a5a', '#d8d4cc', '#46703a', '#c9a23c'];
    const seats = canvasTex(1024, 256, (c, w, hgt) => { c.fillStyle = '#c9c1ae'; c.fillRect(0, 0, w, hgt);
      for (let r = 0; r < 8; r++) { c.fillStyle = r % 2 ? '#8f887a' : '#9c9586'; c.fillRect(0, 128 + r * 8, w, 8);
        for (let i = 0; i < 96; i++) { if (i % 8 === 0) continue; c.fillStyle = COLS[Math.floor(i / 16) % 6]; c.fillRect(i * w / 96 + 1.5, 129.5 + r * 8, w / 96 - 3, 5); } }
      c.fillStyle = '#8a8272'; for (let i = 0; i < 48; i++) { c.beginPath(); c.arc(i * w / 48 + w / 96, 40, 7.5, Math.PI, 0); c.rect(i * w / 48 + w / 96 - 7.5, 40, 15, 22); c.fill(); } });
    const pr = [[36, 0], [38, 3], [58, 22], [63, 22], [63, 0]].map(p => new THREE.Vector2(p[0], p[1]));
    M(g, new THREE.LatheGeometry(pr, 96), new THREE.MeshStandardMaterial({ map: seats, roughness: .8, side: THREE.DoubleSide }), 0, 0, 0, { sx: 1.3 });
    M(g, new THREE.CircleGeometry(36, 64), lawn, 0, .5, 0, { rx: -Math.PI / 2, sx: 1.3 });
    for (const [x, z, r] of [[-14, 10, 7], [10, -12, 6], [22, 14, 5], [-26, -10, 5], [0, 20, 4]]) k.S(r, lawn, x, .3, z, { sy: .22 });                    // the small hills on the field
    for (let i = 0; i < 44; i++) { const a = i / 44 * 6.283; if (Math.abs(Math.sin(a) + 1) < .03) continue; k.C(1.5, 1.7, 22, 8, cream, Math.cos(a) * 86, 11, Math.sin(a) * 66.5); }   // outer colonnade
    M(g, new THREE.TorusGeometry(66, 1.3, 6, 96), cream, 0, 22.6, 0, { rx: Math.PI / 2, sx: 1.3 });
    for (const sx of [-1, 1]) { k.B(9, 34, 9, cream, sx * 12, 17, -67); k.K(7.4, 12, 4, slate, sx * 12, 40, -67, { ry: Math.PI / 4 }); }               // gatehouse on the campus side
    k.B(15, 10, 9, cream, 0, 27, -67); M(g, gable(34, 8, 10), slate, 0, 32, -67); k.B(13, 20, 3, solid(0x1d1a17, 1), 0, 10, -65.5); M(g, starGeo(4, 1.7, .8), gold, 0, 27, -62.2);
    const cry = [glowM(0x62b8ff, 3), glowM(0xff6a4a, 3)];
    for (const sx of [-1, 1]) { const x = sx * 39; k.C(5.5, 7, 6, 8, cream, x, 3, 0); k.C(3.4, 4.6, 40, 8, cream, x, 26, 0); for (const y of [16, 28, 40]) k.C(5.2, 5.2, 1.3, 8, gold, x, y, 0);          // the two mage towers
      k.C(6, 3.6, 5, 8, cream, x, 48.5, 0); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; k.C(.5, .5, 8, 6, gold, x + Math.cos(a) * 4.6, 55, Math.sin(a) * 4.6); }
      M(g, new THREE.OctahedronGeometry(3.4), cry[sx > 0 ? 1 : 0], x, 55.5, 0, { sy: 1.5 }); k.C(7.4, 6.6, 2.4, 8, cream, x, 60.2, 0); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; k.B(1.6, 1.8, 1.6, cream, x + Math.cos(a) * 6.3, 62.3, Math.sin(a) * 6.3, { ry: -a }); }
      const cr = new THREE.Group(); cr.position.set(x, 64.6, 0);
      if (sx < 0) { const ink = solid(0x0b0b10, .18); M(cr, new THREE.SphereGeometry(2.3, 12, 10), ink, 0, 0, 0, { sy: 1.25 }); M(cr, new THREE.ConeGeometry(1.5, 3, 8), ink, 0, 3.2, 0); for (const e of [-1, 1]) M(cr, new THREE.SphereGeometry(.55, 8, 6), glowM(0xffffff, 1.6), .9 * e, .7, 2); }   // an inkling
      else { const fa = solid(0x3fae8a, .4, { flatShading: true }), fb = solid(0x3a78c8, .4, { flatShading: true }); M(cr, new THREE.OctahedronGeometry(2.2), fa, 0, 0, 0);                                         // a fractal: a shape made of smaller copies of itself
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { M(cr, new THREE.OctahedronGeometry(1), fb, dx * 3, dy * 3, dz * 3); for (const [ex, ey, ez] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (ex !== -dx || ey !== -dy || ez !== -dz) M(cr, new THREE.OctahedronGeometry(.42), fa, dx * 3 + ex * 1.35, dy * 3 + ey * 1.35, dz * 3 + ez * 1.35); } }
      mergeKids(cr); noShadow(cr); g.add(cr); const ph = sx; anim.push(t => { cr.position.y = 65.6 + Math.sin(t * 1.3 + ph) * .9; cr.rotation.y = t * (sx < 0 ? .5 : .9); }); }
    const FL = [[0xa8322c, 0xf0ece0], [0x2b5fa8, 0xd84a3a], [0x2f8a5a, 0x3a6ad8], [0xf0ece0, 0x18181c], [0x46703a, 0x18181c], [0xc9a23c, 0xf0ece0]];
    FL.forEach(([c1, c2], i) => { const a = i / 6 * 6.283 + .52, x = Math.cos(a) * 80, z = Math.sin(a) * 61.5; k.C(.5, .7, 30, 6, cream, x, 37, z); k.S(1, gold, x, 52.5, z);                              // five college flags and the Strixhaven star
      k.B(9, 5.5, .3, solid(c1, .8, { side: THREE.DoubleSide }), x + 4.8, 48, z); k.B(9, 2, .34, solid(c2, .8, { side: THREE.DoubleSide }), x + 4.8, 48, z); });
    // someone on a broom, looping round the stadium
    const fl = new THREE.Group(), robe = solid(0x5a3a8a, .8); fl.rotation.order = 'YXZ'; fl.scale.setScalar(1.5);
    M(fl, new THREE.CylinderGeometry(.22, .22, 9, 6), wood, 0, 0, 0, { rx: Math.PI / 2 }); M(fl, new THREE.ConeGeometry(1.2, 3.4, 8), solid(0xc9a45a, 1), 0, 0, -5.8, { rx: Math.PI / 2 });
    M(fl, new THREE.CylinderGeometry(.8, 1.3, 3.2, 8), robe, 0, 1.8, .4, { rx: .25 }); M(fl, new THREE.SphereGeometry(.85, 10, 8), solid(0xe0b48a, .8), 0, 3.9, 1); M(fl, new THREE.ConeGeometry(.95, 1.9, 8), robe, 0, 5.1, .9, { rx: -.2 });
    M(fl, new THREE.BoxGeometry(2.4, 3.4, .25), solid(0x8a2a3a, .8, { side: THREE.DoubleSide }), 0, 2.2, -1.6, { rx: -.7 });
    noShadow(fl); g.add(fl);
    anim.push(t => { const a = t * .42, x = Math.sin(a * 1.3 + 1) * 66 + Math.sin(a * 2.9) * 18, z = Math.cos(a * .9) * 46 + Math.sin(a * 3.7 + 2) * 13, y = 44 + Math.sin(a * 2.1) * 13 + Math.sin(a * 5.3) * 4;
      const px = fl.position.x, py = fl.position.y, pz = fl.position.z, dx = x - px, dy = y - py, dz = z - pz; fl.position.set(x, y, z);
      if (dx * dx + dz * dz > 1e-6) { fl.rotation.y = Math.atan2(dx, dz); fl.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)); fl.rotation.z = Math.sin(a * 2.9) * .5; } });
    // spells going off on the field
    const SC = [[4, 1.2, .6], [.7, 1.6, 4], [.8, 3.6, 1.2], [3.4, 3.4, 3.8], [3.2, 2.6, .6]], flashes = [];
    for (let i = 0; i < 6; i++) { const m = M(g, new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 2, 0); m.userData.noShadow = true; m.raycast = () => {}; flashes.push(m); }
    anim.push(t => flashes.forEach((m, i) => { const ph = t / (1.7 + i * .53) + i * .37, n = Math.floor(ph), f = ph - n, r1 = Math.sin(n * 12.9898 + i * 78.233) * 43758.5453, r2 = Math.sin(n * 39.346 + i * 11.135) * 24634.6345;
      m.position.set((r1 - Math.floor(r1) - .5) * 78, 2.4, (r2 - Math.floor(r2) - .5) * 52); const kk = Math.exp(-f * 5.5), c = SC[(n + i) % 5]; m.scale.setScalar(.8 + 9 * f * (1.25 - f)); m.material.color.setRGB(c[0] * kk, c[1] * kk, c[2] * kk); }));
  }, { top: 76, view: 760 });
  // Torus Hall: 7 hexes, set down in its basin. A ribbed ring around a needle spire, with shifting geometry turning above it
  addThing('Torus Hall', '🌀', Wp(TORUS), 2.6, 130, g => {
    const shellTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
      const gr = c.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#ecebe2'); gr.addColorStop(.5, '#d6e4de'); gr.addColorStop(1, '#ecebe2'); c.fillStyle = gr; c.fillRect(0, 0, 512, 512);
      const tri = (ax, ay, bx, by, qx, qy, d) => { c.lineWidth = .8 + d * .35; c.strokeStyle = 'rgba(38,112,118,' + (.14 + .07 * d) + ')'; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(qx, qy); c.closePath(); c.stroke();
        if (d > 0) { const abx = (ax + bx) / 2, aby = (ay + by) / 2, bqx = (bx + qx) / 2, bqy = (by + qy) / 2, qax = (qx + ax) / 2, qay = (qy + ay) / 2; tri(ax, ay, abx, aby, qax, qay, d - 1); tri(abx, aby, bx, by, bqx, bqy, d - 1); tri(qax, qay, bqx, bqy, qx, qy, d - 1); } };
      tri(10, 498, 502, 498, 256, 14, 5);
      c.strokeStyle = 'rgba(160,138,78,.5)'; c.lineWidth = 4; c.strokeRect(2, 2, 508, 508);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 3); t.anisotropy = 4; return t; })();
    const shell = new THREE.MeshStandardMaterial({ color: 0xf2efe6, map: shellTex, roughness: .45 }), rib = solid(0x2f7f86, .4), dark = solid(0x1d4254, .45, { flatShading: true });
    const lit = new THREE.MeshStandardMaterial({ color: 0x0c3a40, emissive: 0x35e0c8, emissiveIntensity: 1.7, roughness: .4 });
    M(g, new THREE.CylinderGeometry(51, 51, 1.6, 72), stone, 0, .8, 0);
    for (const r of [14, 24, 36, 48]) M(g, new THREE.TorusGeometry(r, .45, 6, 72), lit, 0, 1.7, 0, { rx: Math.PI / 2 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; M(g, new THREE.BoxGeometry(34, .5, .7), lit, Math.cos(a) * 31, 1.7, Math.sin(a) * 31, { ry: -a }); }
    M(g, new THREE.TorusGeometry(40, 10, 28, 96), shell, 0, 11.6, 0, { rx: Math.PI / 2 });
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; M(g, new THREE.TorusGeometry(10.5, .75, 6, 22), rib, Math.cos(a) * 40, 11.6, Math.sin(a) * 40, { ry: -a }); }
    for (const [r, y] of [[50.3, 11.6], [29.7, 11.6], [40, 21.9]]) M(g, new THREE.TorusGeometry(r, .5, 6, 96), lit, 0, y, 0, { rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + .52; M(g, new THREE.BoxGeometry(24, 1.6, 6), shell, Math.cos(a) * 61, 9.6, Math.sin(a) * 61, { ry: -a }); }   // bridges out to the terraces
    M(g, new THREE.CylinderGeometry(9, 12, 8, 6), dark, 0, 5.6, 0);
    M(g, new THREE.ConeGeometry(7.5, 112, 6), dark, 0, 65, 0);
    for (const y of [30, 52, 74]) M(g, new THREE.TorusGeometry(8.6 - y * .06, .5, 6, 24), lit, 0, y, 0, { rx: Math.PI / 2 });
    // the hall's shifting geometry: solids and tilted rings turning round the spire
    const orb = new THREE.Group(), gy1 = new THREE.Group(), gy2 = new THREE.Group();
    [new THREE.IcosahedronGeometry(4.2), new THREE.OctahedronGeometry(4.8), new THREE.TetrahedronGeometry(5.4), new THREE.DodecahedronGeometry(4), new THREE.BoxGeometry(5.5, 5.5, 5.5), new THREE.OctahedronGeometry(3.4)]
      .forEach((ge, i) => { const a = i / 6 * 6.283; M(orb, ge, i % 2 ? rib : shell, Math.cos(a) * (19 + i * 1.5), 42 + i * 9, Math.sin(a) * (19 + i * 1.5), { rx: i, rz: i * .7 }); });
    M(gy1, new THREE.TorusGeometry(24, .7, 6, 64), lit, 0, 0, 0, { rx: 1.15 }); gy1.position.y = 62;
    M(gy2, new THREE.TorusGeometry(30, .6, 6, 64), rib, 0, 0, 0, { rx: 1.9, ry: .6 }); gy2.position.y = 62;
    for (const [o, speed] of [[orb, .22], [gy1, .5], [gy2, -.35]]) { o.traverse(m => { m.userData.noShadow = true; }); g.add(o); spin.push({ o, speed, bolt: false }); }
  }, { top: 128, view: 900 });
  // Grandloft Hall: the great church of the city, in courses of black and white marble, facing the gate. A long nave with aisles and a clerestory, buttressed and pinnacled down both sides; a transept with a rose window in each end;
  // a ribbed dome on a windowed drum over the crossing, carrying a lantern and a spire; an apse ringed with chapels; and a west front of three portals between twin towers with open belfries and spires. The city's roads start from its plaza
  { const CWp = Wp(CITY);
    addThing('Grandloft Hall', '🖋️', CWp, 1.6, 150, g => {
      const wm = sqWM, bm = sqBM, gd = sqGD, st = sqST, rf = solid(0x1a1c26, .35, { flatShading: true });
      const lit = new THREE.MeshStandardMaterial({ color: 0x2a2010, emissive: 0xffd9a0, emissiveIntensity: 3.2, roughness: .5 });
      const beam = new THREE.MeshBasicMaterial({ color: 0xfff0cc, transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const B = (w, hh, d, m, x, y, z, o) => M(g, new THREE.BoxGeometry(w, hh, d), m, x, y, z, o), C = (r0, r1, hh, n, m, x, y, z, o) => M(g, new THREE.CylinderGeometry(r0, r1, hh, n), m, x, y, z, o), pin = (x, y, z, sz, m) => M(g, new THREE.ConeGeometry(sz, sz * 5, 4), m, x, y + sz * 2.5, z, { ry: Math.PI / 4 }), Y = 6;
      // the plaza, longer than it is wide, ringed with obelisks and statues; and the podium the hall stands on
      C(54, 55.5, 1.4, 64, bm, 0, .7, 0, { sz: 1.315 }); C(49, 50, 1.6, 64, wm, 0, 2.2, 0, { sz: 1.35 });
      for (let i = 0; i < 20; i++) { const a = i / 20 * 6.283 + .157, x = Math.cos(a) * 45, z = Math.sin(a) * 61; if (Math.abs(x) < 16 && z > 0) continue; if (i % 2) pin(x, 3, z, 1.9, i % 4 === 1 ? bm : wm); else { B(4, 3, 4, bm, x, 4.5, z); statue(g, wm, x, 6, z, 9, Math.PI - a, i >> 1 & 3); } }
      B(60, 3, 98, wm, 0, 4.5, 1); B(80, 3, 28, wm, 0, 4.5, -14); C(23, 23, 3, 28, wm, 0, 4.5, -46); for (let i = 0; i < 6; i++) B(54, .5 * (6 - i), 1.7, wm, 0, 3 + .25 * (6 - i), 50.85 + i * 1.7);
      // nave, aisles, clerestory
      B(22, 50, 82, st, 0, Y + 25, -3); M(g, gable(24.6, 14, 84), rf, 0, Y + 50, -3); B(.7, 1.6, 82, gd, 0, Y + 64.6, -3);
      for (const sx of [-1, 1]) { B(11, 26, 78, st, sx * 16.5, Y + 13, -3); B(12.4, 1.2, 79, rf, sx * 16.6, Y + 28, -3, { rz: -sx * .36 });
        for (let i = 0; i < 8; i++) { const z = 30 - i * 9.4; B(.5, 13, 3.6, lit, sx * 11.2, Y + 39, z); B(.5, 13, 3.6, lit, sx * 22.1, Y + 13, z); }
        for (let i = 0; i < 9; i++) { const z = 34.7 - i * 9.4; B(2.6, 34, 3.2, bm, sx * 26.4, Y + 17, z); pin(sx * 26.4, Y + 34, z, 1.3, wm); B(17, 1.4, 1.6, bm, sx * 18.6, Y + 36, z, { rz: -sx * .5 }); pin(sx * 11.4, Y + 50, z, .9, bm); } }                                    // buttresses, flyers and pinnacles
      // transept, with a rose in each end and a turret at each corner
      B(72, 46, 20, st, 0, Y + 23, -14); M(g, gable(22.6, 13, 74), rf, 0, Y + 46, -14, { ry: Math.PI / 2 });
      for (const sx of [-1, 1]) { M(g, new THREE.CircleGeometry(6.4, 28), lit, sx * 36.15, Y + 30, -14, { ry: sx * Math.PI / 2 }); M(g, new THREE.TorusGeometry(6.8, .8, 6, 28), gd, sx * 36.2, Y + 30, -14, { ry: Math.PI / 2 }); B(.5, 14, 4, lit, sx * 36.15, Y + 10, -14);
        for (const sz of [-1, 1]) { C(2.6, 3, 58, 8, bm, sx * 34.6, Y + 29, -14 + sz * 10.6); M(g, new THREE.ConeGeometry(3.4, 17, 8), wm, sx * 34.6, Y + 66.5, -14 + sz * 10.6); } }
      // apse and its ring of chapels
      C(12.5, 12.5, 50, 18, st, 0, Y + 25, -46); M(g, new THREE.SphereGeometry(12.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), rf, 0, Y + 50, -46, { sy: .85 });
      for (let i = 0; i < 5; i++) { const a = (i - 2) * .62, sn = Math.sin(a), cs = Math.cos(a); C(5.2, 5.2, 22, 10, st, sn * 15.5, Y + 11, -46 - cs * 15.5); M(g, new THREE.ConeGeometry(5.8, 9, 10), rf, sn * 15.5, Y + 26.5, -46 - cs * 15.5); B(1.6, 9, .5, lit, sn * 20.6, Y + 11, -46 - cs * 20.6, { ry: a }); B(1.8, 14, .5, lit, sn * 12.7, Y + 38, -46 - cs * 12.7, { ry: a }); }
      // the crossing: drum, ribbed dome, lantern, spire
      C(14.5, 15.5, 16, 16, bm, 0, Y + 58, -14); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; B(1.7, 11, .5, lit, Math.cos(a) * 15.3, Y + 58, -14 + Math.sin(a) * 15.3, { ry: -a + Math.PI / 2 }); } C(16, 16, 1.4, 16, gd, 0, Y + 66.6, -14);
      M(g, new THREE.SphereGeometry(15, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), wm, 0, Y + 67, -14, { sy: 1.3 }); for (let i = 0; i < 8; i++) M(g, new THREE.TorusGeometry(15.2, .5, 5, 16, Math.PI), gd, 0, Y + 67, -14, { ry: i * .3927, sy: 1.3 });
      C(3.6, 4.2, 10, 10, bm, 0, Y + 91, -14); for (let i = 0; i < 6; i++) { const a = i * 1.047; B(1, 6, .4, lit, Math.cos(a) * 4, Y + 91, -14 + Math.sin(a) * 4, { ry: -a + Math.PI / 2 }); } M(g, new THREE.ConeGeometry(4.4, 48, 10), bm, 0, Y + 120, -14); M(g, new THREE.SphereGeometry(1.5, 10, 8), gd, 0, Y + 145, -14);
      // the west front
      for (const sx of [-1, 1]) { B(14, 62, 14, st, sx * 15.5, Y + 31, 41); B(15.6, 2, 15.6, gd, sx * 15.5, Y + 63, 41); B(12, 24, 12, bm, sx * 15.5, Y + 76, 41); B(13.6, 2, 13.6, gd, sx * 15.5, Y + 89, 41);
        for (const [dx, dz, ry] of [[0, 6.1, 0], [0, -6.1, 0], [6.1, 0, Math.PI / 2], [-6.1, 0, Math.PI / 2]]) { B(3.4, 16, .5, lit, sx * 15.5 + dx, Y + 76, 41 + dz, { ry }); for (const of of [-4, 4]) B(1.6, 12, .5, lit, sx * 15.5 + dx * 1.16 + (ry ? 0 : of), Y + 40, 41 + dz * 1.16 + (ry ? of : 0), { ry }); }
        M(g, new THREE.ConeGeometry(8.2, 50, 8), sx > 0 ? wm : bm, sx * 15.5, Y + 115, 41); for (const a of [-1, 1]) for (const b of [-1, 1]) pin(sx * 15.5 + a * 6, Y + 90, 41 + b * 6, 1.5, sx > 0 ? bm : wm); M(g, new THREE.SphereGeometry(1.3, 8, 6), gd, sx * 15.5, Y + 141, 41); }
      B(17, 60, 7, st, 0, Y + 30, 42); M(g, gable(19, 11, 7), rf, 0, Y + 60, 42); pin(0, Y + 70, 42, 1.4, gd);
      M(g, new THREE.CircleGeometry(7.6, 32), lit, 0, Y + 43, 45.7); M(g, new THREE.TorusGeometry(8, .9, 6, 32), gd, 0, Y + 43, 45.7); M(g, new THREE.TorusGeometry(4, .45, 5, 24), bm, 0, Y + 43, 45.9); for (let i = 0; i < 8; i++) B(.5, 15.4, .5, bm, 0, Y + 43, 45.9, { rz: i * .3927 });                              // the rose
      for (const px of [-15.5, 0, 15.5]) { const w = px ? 7 : 9, hh = px ? 13 : 17, z = px ? 48.2 : 45.8; B(w, hh, 1.4, bm, px, Y + hh / 2, z); B(w - 2.6, hh - 3, .5, lit, px, Y + hh / 2 - 1, z + .8); M(g, gable(w + 2, w * .7, 2.4), bm, px, Y + hh, z + .1); }                                    // three portals
      for (let i = 0; i < 9; i++) B(1.2, 5, 1, wm, -6.4 + i * 1.6, Y + 26, 45.9);                                                                                                                                              // a gallery of small figures over the door
      for (const [x, z] of [[0, -14], [-15.5, 41], [15.5, 41]]) { const m = M(g, new THREE.CylinderGeometry(7, 2, 120, 16, 1, true), beam, x, Y + 205, z); m.userData.noShadow = true; m.raycast = () => {}; }
      const ink = new THREE.Group(); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, d = 22 + (i % 4) * 4; M(ink, new THREE.SphereGeometry(1.5 + (i % 3) * .5, 8, 6), bm, Math.cos(a) * d, 90 + (i * 7) % 40, Math.sin(a) * d, { sx: 1.6 }); }
      ink.traverse(m => { m.userData.noShadow = true; }); ink.position.z = -14; g.add(ink); spin.push({ o: ink, speed: .6, bolt: false });
    }, { ry: Math.atan2(SQGATE[0] * S - CWp[0], SQGATE[1] * S - CWp[1]), hexes: [[29, 17]], top: 165, view: 1000 }); }
  // Kollema Hall: 3 hexes. A square rampart fortress stepping up three terraces: curtain walls, four great corner towers, a gatehouse and a three-tier keep - all flat-topped and crenellated
  addThing('Kollema Hall', '🏰', Wp(KOLL), 2.4, 95, g => {
    const st = tx(solid(0xb89164, .85), 'masonry'), dk = tx(solid(0x8a6845, .9), 'masonry'), red = solid(0xa01c1c, .8), wht = solid(0xe9e2d0, .8), wst = tx(solid(0xe9e2d0, .8), 'rock'), shade = solid(0x2a2018, 1), fire = glowM(0xff9a3a, 3);
    const B = (w, hh, d, m, x, y, z, o) => M(g, new THREE.BoxGeometry(w, hh, d), m, x, y, z, o);
    const Y1 = -8.2, Y2 = 7, Y3 = 17.5, HW = 36, ZF = 42, ZB = -38;
    const crenX = (x0, x1, y, z) => { for (let x = x0 + 1.5; x < x1; x += 4.4) B(2.4, 2.6, 3.4, st, x, y, z); };      // battlements along a wall top
    const crenZ = (z0, z1, y, x) => { for (let z = z0 + 1.5; z < z1; z += 4.4) B(3.4, 2.6, 2.4, st, x, y, z); };
    const tower = (x, z, base, hgt, w) => { B(w, hgt + 6, w, st, x, base + hgt / 2 - 3, z); B(w + 2.4, 2.2, w + 2.4, dk, x, base + hgt + .2, z);   // square, flat-topped, battlements all round
      for (const sx of [-1, 1]) for (let i = -1; i <= 1; i++) { B(2.4, 3, 2.4, st, x + sx * (w / 2 + .1), base + hgt + 2.8, z + i * (w / 2 - 1.2)); B(2.4, 3, 2.4, st, x + i * (w / 2 - 1.2), base + hgt + 2.8, z + sx * (w / 2 + .1)); }
      const f = M(g, new THREE.SphereGeometry(1.5, 8, 6), fire, x, base + hgt + 2.6, z); f.userData.keepSep = 1; };
    B(2 * HW, 18, 3.4, st, 0, Y1 + 5, ZF); crenX(-HW + 6, -8, Y1 + 15.3, ZF); crenX(8, HW - 6, Y1 + 15.3, ZF);                      // front wall
    B(2 * HW, 20, 3.4, st, 0, Y3 + 6, ZB); crenX(-HW + 6, HW - 6, Y3 + 17.3, ZB);                                                  // back wall
    for (const sx of [-1, 1]) { const x = sx * HW;                                                                                // side walls, stepping up with the terraces
      B(3.4, 18, 22, st, x, Y1 + 5, 31); crenZ(20, 40, Y1 + 15.3, x); B(3.4, 18, 26, st, x, Y2 + 5, 7); crenZ(-6, 20, Y2 + 15.3, x); B(3.4, 20, 32, st, x, Y3 + 6, -22); crenZ(-38, -6, Y3 + 17.3, x); }
    tower(-HW, ZF, Y1, 34, 12); tower(HW, ZF, Y1, 34, 12); tower(-HW, ZB, Y3, 40, 13); tower(HW, ZB, Y3, 40, 13);                 // the four corner towers
    B(16, 26, 9, st, 0, Y1 + 9, ZF); B(18.4, 2.2, 11.4, dk, 0, Y1 + 22.6, ZF); crenX(-9, 9, Y1 + 25, ZF + 4.5); crenX(-9, 9, Y1 + 25, ZF - 4.5); B(7, 12, 9.6, shade, 0, Y1 + 2, ZF);   // gatehouse
    B(3.2, 16, .4, red, -5.6, Y1 + 13, ZF + 4.8); B(3.2, 16, .4, wht, 5.6, Y1 + 13, ZF + 4.8);
    B(6, 3, 6, dk, 0, Y1 + 1.5, 30); M(g, new THREE.CylinderGeometry(1.5, 2.6, 13, 8), wst, 0, Y1 + 9.5, 30); M(g, new THREE.SphereGeometry(2.1, 10, 8), wst, 0, Y1 + 17.5, 30);       // statue of Kollema
    for (let i = 0; i < 6; i++) B(24 - i * 1.2, 2.6, 2.2, st, 0, Y1 + 1.3 + i * 2.5, 24.5 - i * 1.9);                              // stair up to the keep
    B(50, 28, 24, st, 0, Y2 + 10, 3); B(52.4, 2, 26.4, dk, 0, Y2 + 24, 3); crenX(-25, 25, Y2 + 26.3, 15); crenX(-25, 25, Y2 + 26.3, -9); crenZ(-9, 15, Y2 + 26.3, -25); crenZ(-9, 15, Y2 + 26.3, 25);   // keep, lower tier
    for (let i = -4; i <= 4; i++) B(1.6, 12, 1.6, wst, i * 5.4, Y2 + 6, 15.8); B(48, 2, 2.4, wst, 0, Y2 + 13, 15.8);
    B(36, 30, 26, st, 0, Y3 + 11, -19); B(38.4, 2, 28.4, dk, 0, Y3 + 26, -19); crenX(-18, 18, Y3 + 28.3, -6); crenX(-18, 18, Y3 + 28.3, -32); crenZ(-32, -6, Y3 + 28.3, -18); crenZ(-32, -6, Y3 + 28.3, 18);   // middle tier
    B(20, 20, 16, st, 0, Y3 + 36, -19); B(22.4, 2, 18.4, dk, 0, Y3 + 46, -19); crenX(-10, 10, Y3 + 48.3, -11); crenX(-10, 10, Y3 + 48.3, -27); crenZ(-27, -11, Y3 + 48.3, -10); crenZ(-27, -11, Y3 + 48.3, 10);   // top tier
    M(g, new THREE.SphereGeometry(2.2, 8, 6), fire, 0, Y3 + 49, -19);
    for (let i = -2; i <= 2; i++) B(3.4, 20, .4, i % 2 ? wht : red, i * 7, Y3 + 13, -5.8);                                          // banners
    for (const [x, c] of [[-18, red], [-6, wht], [6, red], [18, wht]]) B(3.4, 16, .4, c, x, Y2 + 16, 15.3);
  }, { y: KY * S, ry: Math.atan2(KF[0], KF[1]), top: 100, view: 820 });
  // Widdershins Hall: 7 hexes. A living grove of colossal swamp trees - classrooms carved into the trunks, roots arching over the paths, lanterns in the boughs.
  // The canopy is left open on the south side so you can look down into the lit heart of the grove.
  { const Wc = Wp(WIDD), Wy = heightAt(Wc[0], Wc[1]), bark = [], lits = [], litsG = [];
    const open = a => Math.cos(a - Math.PI / 2) > .45;                                    // true for directions facing south (+z)
    const q0 = new THREE.Quaternion(), up0 = new THREE.Vector3(0, 1, 0);
    const seg = (a, b, r0, r1, hex) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(), ge = new THREE.CylinderGeometry(r1, r0, L, 6, 1, true); ge.applyQuaternion(q0.setFromUnitVectors(up0, d.normalize())); ge.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return part(ge, hex); };   // a tapering limb from a to b
    const big = (x, z, hgt, r, gap) => { const hr = mulberry32(Math.round(x * 7 + z * 13 + hgt)), cols = [0x26402a, 0x2f4d2f, 0x1f3626, 0x35553a, 0x3d5c34];
      bark.push(part(new THREE.CylinderGeometry(r * .55, r, hgt * .62, 12, 4), 0x3a2e22, { x, y: hgt * .31, z }));
      bark.push(part(new THREE.CylinderGeometry(r, r * 1.7, hgt * .1, 12, 1, true), 0x33281e, { x, y: hgt * .045, z }));
      // roots: buttresses that leave the trunk well up, snake outward and go to ground; every other one arches clear of it first, high enough to walk under
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + hr() * .5, ca = Math.cos(a), sa = Math.sin(a), arch = i % 2, w = (hr() - .5) * r * 1.2, L = r * (3.2 + 1.6 * hr());
        const P = [[r * .8, r * 1.7], [r * 1.5, arch ? r * 1.25 : r * .7], [L * .62, arch ? r * .95 : r * .28], [L, -r * .2]].map(([d, y], j) => { const k = j === 2 ? 1 : j === 3 ? .4 : 0; return [x + ca * d - sa * w * k, y, z + sa * d + ca * w * k]; });
        for (let j = 0; j < 3; j++) bark.push(seg(P[j], P[j + 1], r * (.36 - j * .09), r * (.27 - j * .09), j % 2 ? 0x33281e : 0x3a2e22));
        if (!arch) bark.push(seg(P[1], [x + ca * r * 2.4 + sa * r * .9, -r * .1, z + sa * r * 2.4 - ca * r * .9], r * .14, r * .05, 0x33281e)); }
      // boughs that fork, each fork carrying a spread of foliage in clumps of different sizes, with moss hanging under it. The south side is left open where asked
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + z * .01, ca = Math.cos(a), sa = Math.sin(a), y0 = hgt * (.5 + .05 * (i % 3)), bl = r * (2.6 + .9 * hr()), e = [x + ca * bl, hgt * (.72 + .08 * hr()), z + sa * bl], skip = gap && open(a);
        bark.push(seg([x + ca * r * .5, y0, z + sa * r * .5], e, r * .26, r * .13, 0x3a2e22));
        for (const sd of [-1, 1]) { const a2 = a + sd * (.5 + .3 * hr()), e2 = [e[0] + Math.cos(a2) * r * 1.5, e[1] + r * (.5 + .6 * hr()), e[2] + Math.sin(a2) * r * 1.5]; bark.push(seg(e, e2, r * .13, r * .05, 0x3a2e22)); if (skip) continue;
          for (let c = 0; c < 3; c++) { const cr = r * (.75 + .75 * hr()), cx = e2[0] + (hr() - .5) * r * 1.6, cz = e2[2] + (hr() - .5) * r * 1.6, cy = e2[1] + (hr() - .2) * r * .7;
            bark.push(part(new THREE.IcosahedronGeometry(cr, 1), cols[Math.floor(hr() * 5)], { x: cx, y: cy, z: cz, sy: .55 + .2 * hr() }));
            if (!c) for (let m = 0; m < 3; m++) bark.push(part(new THREE.ConeGeometry(r * .07, r * (1.2 + 1.4 * hr()), 4), 0x52603a, { x: cx + (hr() - .5) * cr * 1.4, y: cy - cr * .5 - r * .6, z: cz + (hr() - .5) * cr * 1.4, rx: Math.PI })); } } }
      if (!(gap > 1)) for (let c = 0; c < 6; c++) { const a = c * 1.05 + hr(), d = c ? r * 1.5 : 0; bark.push(part(new THREE.IcosahedronGeometry(r * (1.2 + .6 * hr()), 1), cols[c % 5], { x: x + Math.cos(a) * d, y: hgt * (.86 + .06 * hr()), z: z + Math.sin(a) * d, sy: .6 })); }   // the crown
      bark.push(part(new THREE.TorusGeometry(r * 1.25, r * .1, 5, 16), 0x5a4630, { x, y: hgt * .3, z, rx: Math.PI / 2 }));                          // gallery
      for (let i = 0; i < 14; i++) { const a = i * 2.4 + x, yy = hgt * (.07 + .038 * i), rr = r * (1 - .45 * yy / (hgt * .62)) + .5;                // lit windows and doors; every third one is on the green circuit
        (i % 3 === 1 ? litsG : lits).push(part(new THREE.BoxGeometry(r * .17, r * .32, 1), 0xffffff, { x: x + Math.cos(a) * rr, y: yy, z: z + Math.sin(a) * rr, ry: -a + Math.PI / 2 })); }
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + z, d = r * 2.6; lanternPts.push([Wc[0] + x + Math.cos(a) * d, Wy + hgt * (.44 + .06 * i), Wc[1] + z + Math.sin(a) * d]); }
    };
    big(0, 0, 340, 34, 2);
    // the heart tree goes on up above its boughs: a tapering leader that carries the top of the lit spiral, boughs on its north side, and a crown of its own
    bark.push(part(new THREE.CylinderGeometry(9.5, 18.7, 132, 12, 3), 0x3a2e22, { y: 277 }));
    { const hr = mulberry32(88), cols = [0x26402a, 0x2f4d2f, 0x1f3626, 0x35553a, 0x3d5c34]; for (let i = 0; i < 7; i++) { const a = Math.PI + .25 + i * .44, y0 = 236 + i * 13, e = [Math.cos(a) * (46 + 16 * hr()), y0 + 30, Math.sin(a) * (46 + 16 * hr())]; bark.push(seg([Math.cos(a) * 12, y0, Math.sin(a) * 12], e, 5.5, 2, 0x3a2e22)); for (let c = 0; c < 3; c++) bark.push(part(new THREE.IcosahedronGeometry(13 + 9 * hr(), 1), cols[Math.floor(hr() * 5)], { x: e[0] + (hr() - .5) * 22, y: e[1] + 4 + (hr() - .3) * 10, z: e[2] + (hr() - .5) * 22, sy: .6 })); }
      for (let c = 0; c < 8; c++) { const a = c * .9, d = c ? 20 : 0; bark.push(part(new THREE.IcosahedronGeometry(17 + 9 * hr(), 1), cols[c % 5], { x: Math.cos(a) * d, y: 346 + 10 * hr(), z: Math.sin(a) * d - 5, sy: .62 })); } }
    // inside the heart tree's opened crown: a spiral of lit landings up the trunk, platforms, and strings of lanterns
    for (let i = 0; i < 26; i++) { const a = i * .62, y = 120 + i * 7.2, rr = 34 * (1 - .45 * y / 211) + 1.2; lits.push(part(new THREE.BoxGeometry(5, 3.2, 1.6), 0xffffff, { x: Math.cos(a) * rr, y, z: Math.sin(a) * rr, ry: -a + Math.PI / 2 })); }
    for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + (i - 2) * .5, d = 46 + (i % 2) * 22, y = 150 + i * 22; bark.push(part(new THREE.CylinderGeometry(13, 11, 2.4, 10), 0x5a4630, { x: Math.cos(a) * d, y, z: Math.sin(a) * d }));
      bark.push(part(new THREE.CylinderGeometry(1.2, 1.2, d, 5), 0x4a3828, { x: Math.cos(a) * d / 2, y: y - 2, z: Math.sin(a) * d / 2, rz: Math.PI / 2, ry: -a }));
      lits.push(part(new THREE.CylinderGeometry(3.2, 3.2, 5, 8), 0xffffff, { x: Math.cos(a) * d, y: y + 4, z: Math.sin(a) * d }));
      for (let j = 0; j < 5; j++) lanternPts.push([Wc[0] + Math.cos(a + j * 1.26) * (d + 9) * .9, Wy + y + 8 + j * 3, Wc[1] + Math.sin(a + j * 1.26) * 9 + Math.sin(a) * d, { size: 8 }]); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + .3, d = 104, x = Math.cos(a) * d, z = Math.sin(a) * d; big(x, z, (open(a) ? 150 : 190) + (i % 3) * 26, 17 + (i % 2) * 3, open(a) ? 1 : 0);
      bark.push(part(new THREE.BoxGeometry(d - 44, 1.8, 6), 0x5a4630, { x: x * .58, y: 62, z: z * .58, ry: -a }));                                  // rope-bridge walkways to the heart tree
      lanternPts.push([Wc[0] + x * .58, Wy + 70, Wc[1] + z * .58]); }
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + .9, d = 150 + (i % 2) * 14; if (open(a)) continue; big(Math.cos(a) * d, Math.sin(a) * d, 120 + (i % 3) * 18, 11, 0); }
    // a scatter of drifting lights high in and above the crown
    for (let i = 0; i < 46; i++) { const a = i * 2.39996, d = 30 + (i * 29) % 95; lanternPts.push([Wc[0] + Math.cos(a) * d, Wy + 215 + (i * 37) % 150, Wc[1] + Math.sin(a) * d, { c: i % 4 ? [2.4, 1.7, .6] : [.9, 2.4, 1.1], size: 6 + i % 4, drift: 5, speed: .35 }]); }
    const flashG = litsG.filter((_, i) => i % 3 === 0); lits.push(...litsG.filter((_, i) => i % 3));
    const barkGeo = mergeVertices(mergeGeometries(bark)), litGeo = mergeGeometries(lits);
    const warm = new THREE.Color(0xffb45a), green = new THREE.Color(0x3dff7a), flashers = [];
    addThing('Widdershins Hall', '🌿', Wc, 1, 152, g => {
      g.add(new THREE.Mesh(barkGeo, tx(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92 }), 'leaf')));
      g.add(new THREE.Mesh(litGeo, new THREE.MeshStandardMaterial({ color: 0x241606, emissive: 0xffb45a, emissiveIntensity: 5, roughness: .6 })));
      for (const ge of flashG) { const m = new THREE.Mesh(ge, new THREE.MeshStandardMaterial({ color: 0x241606, emissive: 0xffb45a, emissiveIntensity: 5, roughness: .6 })); g.add(m); flashers.push(m); }
    }, { y: Wy, top: 380, view: 980 });
    // every few seconds one window somewhere in the grove flares green for a moment, and never the same one twice running
    anim.push(t => { const c = t / 3.4, n = Math.floor(c), f = c - n, hh = Math.sin(n * 12.9898) * 43758.5453, pick = Math.floor((hh - Math.floor(hh)) * flashers.length), k = f < .42 ? Math.sin(f / .42 * Math.PI) * (.7 + .3 * Math.sin(t * 23)) : 0;
      flashers.forEach((m, i) => { const q = i === pick ? k : 0; if (q > 0 || m.userData.on) { m.material.emissive.copy(warm).lerp(green, clamp(q * 1.5, 0, 1)); m.material.emissiveIntensity = 5 + 6 * q; m.userData.on = q > 0; } }); }); }
  // Effigy Row: a broad two-tier arched bridge lined with statues, with gate towers at each end; linked to every hex it crosses
  { const E = Wp(BR_E), Wd = Wp(BR_W), Pm = Wp(BR_P), y = Math.max(heightAt(E[0], E[1]), heightAt(Wd[0], Wd[1])) + 2;
    const ry = -Math.atan2(BR_N[1], BR_N[0]), len = BR_HALF * 2 * S + 60, W = 40, yb = y - 6;
    const groundAt = lx => heightAt(Pm[0] + BR_N[0] * lx, Pm[1] + BR_N[1] * lx);
    addThing('Effigy Row', '🌉', Pm, 1, HEX_R * .78, g => {
      const st = tx(solid(0xb48d60, .85), 'masonry'), dk = tx(solid(0x8f6e4a, .9), 'masonry'), wht = tx(solid(0xe6dcc6, .8), 'rock'), fire = glowM(0xff9a3a, 3);
      const B = (w, hh, d, m, x, yy, z) => M(g, new THREE.BoxGeometry(w, hh, d), m, x, yy, z);
      B(len, 6, W, st, 0, y - 3, 0);
      for (const sd of [-1, 1]) B(len, 4.5, 2.6, st, 0, y + 2.2, sd * (W / 2 - 1.3));
      B(len, 5, W - 4, dk, 0, yb - 33.5, 0);
      const nU = 8, sU = len / nU, rU = sU / 2 - 3.2;                                   // upper arcade: eight small arches under the deck
      for (let i = 0; i <= nU; i++) { const x = -len / 2 + i * sU; B(6.4, 31, W - 6, st, x, yb - 15.5, 0);
        for (const sd of [-1, 1]) { const z = sd * (W / 2 + 1.5); B(6, 7, 6, dk, x, y + 3.5, z); statue(g, wht, x, y + 7, z, 26, sd > 0 ? Math.PI / 2 : -Math.PI / 2, (i + (sd > 0 ? 1 : 2)) % 4); } }
      for (let i = 0; i < nU; i++) M(g, new THREE.TorusGeometry(rU, 2.6, 6, 14, Math.PI), dk, -len / 2 + (i + .5) * sU, yb - 3.6 - rU, 0, { sz: (W - 6) / 5.2 });
      const nL = 4, sL = len / nL, rL = sL / 2 - 6;                                     // lower arcade: four great arches on piers down to the chasm floor
      for (let i = 0; i <= nL; i++) { const x = -len / 2 + i * sL, gr = groundAt(x), top = yb - 36, hh = top - gr + 6; if (hh > 4) { B(11, hh, W - 8, st, x, top - hh / 2, 0); B(15, hh * .45, W - 2, dk, x, gr - 6 + hh * .225, 0); } }
      for (let i = 0; i < nL; i++) M(g, new THREE.TorusGeometry(rL, 3.6, 6, 18, Math.PI), dk, -len / 2 + (i + .5) * sL, yb - 40.6 - rL, 0, { sz: (W - 8) / 7.2 });
      for (const e of [-1, 1]) { const x = e * (len / 2 - 7);                              // gate towers
        for (const sd of [-1, 1]) { const z = sd * (W / 2 + 4); B(13, 58, 13, st, x, y + 23, z); B(15.6, 2.4, 15.6, dk, x, y + 53.2, z);                                // square and flat-topped, battlements all round, a beacon on each
          for (const sx of [-1, 1]) for (let i = -1; i <= 1; i++) { B(2.7, 3.4, 2.7, st, x + sx * 6.5, y + 56.1, z + i * 5.2); B(2.7, 3.4, 2.7, st, x + i * 5.2, y + 56.1, z + sx * 6.5); }
          const f = M(g, new THREE.SphereGeometry(1.7, 8, 6), fire, x, y + 56, z); f.userData.keepSep = 1; }
        B(13, 9, W - 5, st, x, y + 40, 0); }
    }, { y: 0, ry, top: y + 85, hexes: [[7, 29], [8, 28], [8, 29], [9, 28], [9, 29]], view: 640 }); }

  // ================= other campus landmarks =================
  const waterGlass = (hex = 0x4aa8d8, op = .5) => new THREE.MeshStandardMaterial({ color: hex, roughness: .04, transparent: true, opacity: op, envMapIntensity: 2.2, emissive: 0x0a3050, emissiveIntensity: .5 });

  // Arithmodrome (Quandrix): 1 hex. From outside, a cube of water - with cube fountains, unsupported arcs of water and solid columns of water around it
  addThing('Arithmodrome', '🧊', Wp(ARITH), 1, 30, g => { const k = kit(g), wg = waterGlass(), wg2 = waterGlass(0x7fd8e8, .42);
    k.C(46, 48, 3, 6, stone, 0, 1.5, 0); k.C(40, 40, .6, 6, wg, 0, 3.2, 0);
    const cube = new THREE.Group(); M(cube, new THREE.BoxGeometry(30, 30, 30), wg, 0, 0, 0); M(cube, new THREE.BoxGeometry(31, 31, 31), new THREE.MeshBasicMaterial({ color: 0xaef0ff, wireframe: true, transparent: true, opacity: .5 }), 0, 0, 0);
    cube.position.y = 36; cube.rotation.set(.6, 0, .62); noShadow(cube); g.add(cube); spin.push({ o: cube, speed: .25, bolt: false });
    const orb = new THREE.Group(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283, sz = 5 + (i % 3) * 2.2; M(orb, new THREE.BoxGeometry(sz, sz, sz), wg2, Math.cos(a) * 34, 22 + (i % 3) * 14, Math.sin(a) * 34, { rx: i, ry: i * .7 }); }
    noShadow(orb); g.add(orb); spin.push({ o: orb, speed: -.4, bolt: false });
    for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283 + .5; const m = M(g, new THREE.TorusGeometry(19, 1.5, 6, 30, Math.PI), wg2, Math.cos(a) * 19, 3, Math.sin(a) * 19, { ry: -a }); m.userData.noShadow = true; }   // arcs of water leaping to the cube
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; const m = k.C(2.2, 2.2, 30 + (i % 2) * 16, 10, wg, Math.cos(a) * 38, 18 + (i % 2) * 8, Math.sin(a) * 38); m.userData.noShadow = true; }                 // columns of water
  }, { top: 80, view: 420 });

  // Cultivarium (Quandrix): 3 hexes. A sun-drenched walled garden of spiralling plants round a glasshouse dome
  { const pts = []; const GR = [0x4f9a3a, 0x6fb84a, 0x3f8a4a, 0x8ac85a];
    const romanesco = (x, z, sc) => { pts.push(part(new THREE.ConeGeometry(9 * sc, 20 * sc, 12), 0x5aa040, { x, y: 10 * sc, z }));               // cone of cones, set on the golden angle
      for (let i = 0; i < 46; i++) { const t = i / 46, a = i * 2.39996, r = 9.4 * sc * (1 - t), y = 20 * sc * t, s2 = sc * (2.6 - 1.7 * t);
        pts.push(part(new THREE.ConeGeometry(s2, s2 * 2.2, 6), GR[i % 4], { x: x + Math.cos(a) * r, y: y + s2 * .6, z: z + Math.sin(a) * r, rz: -Math.cos(a) * .5, rx: Math.sin(a) * .5 })); } };
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + .3; romanesco(Math.cos(a) * 56, Math.sin(a) * 56, 1 + (i % 2) * .35); }
    // fiddlehead: a stalk that rises and then curls in on itself
    const fern = (x, z, hgt, ph) => { const cp = [], R0 = hgt * .22, cx = Math.cos(ph), cz = Math.sin(ph);
      for (let i = 0; i <= 10; i++) cp.push(new THREE.Vector3(x, hgt * i / 10, z));
      for (let i = 1; i <= 30; i++) { const t = i / 30, a = Math.PI - t * 9.4, r = R0 * (1 - t * .88), f = R0 + r * Math.cos(a); cp.push(new THREE.Vector3(x + cx * f, hgt + r * Math.sin(a), z + cz * f)); }
      pts.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 70, hgt * .035, 6), 0x3f8a4a, {})); };
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 1; fern(Math.cos(a) * 34, Math.sin(a) * 34, 34 + (i % 3) * 9, a + 1.6); }
    { const cp = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * 14, r = 14 + 60 * t; cp.push(new THREE.Vector3(Math.cos(a) * r, 1.6, Math.sin(a) * r)); }                       // spiral hedge
      pts.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 240, 2.2, 5), 0x2f6a34, {})); }
    const plants = mergeVertices(mergeGeometries(pts));
    addThing('Cultivarium', '🌱', Wp(CULT), 1, 92, g => { const k = kit(g), gl = glassM(0xbfeee0, .32);
      k.T(84, 3, cream, 0, 3, 0, { rx: Math.PI / 2 }); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; k.C(3, 3.4, 9, 8, cream, Math.cos(a) * 84, 4.5, Math.sin(a) * 84); k.S(2.2, gold, Math.cos(a) * 84, 10.4, Math.sin(a) * 84); }
      g.add(new THREE.Mesh(plants, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 })));
      k.C(22, 23, 7, 16, cream, 0, 3.5, 0); const dm = k.D(22, gl, 0, 7, 0); dm.userData.noShadow = true; for (let i = 0; i < 8; i++) M(g, new THREE.TorusGeometry(22.2, .4, 4, 14, Math.PI / 2), gold, 0, 7, 0, { ry: i / 8 * 6.283 });
      k.S(2, gold, 0, 30, 0);
    }, { top: 70, view: 540 }); }

  // Esix Fractal Bloom (Quandrix): 1 hex. One enormous flower, its petals set in a perfect spiral
  { const pts = [part(new THREE.CylinderGeometry(3, 5, 26, 8), 0x3f7a3a, { y: 13 })];
    for (let i = 0; i < 110; i++) { const t = i / 110, a = i * 2.39996, r = 4 + 40 * Math.sqrt(t), sz = 3 + 9 * t, c = new THREE.Color().setHSL(.86 - .42 * t, .7, .5 - .12 * t);
      pts.push(part(new THREE.SphereGeometry(sz, 7, 5), c.getHex(), { x: Math.cos(a) * r, y: 30 + 16 * (1 - t) * (1 - t) - 6 * t, z: Math.sin(a) * r, sy: .22, rz: -Math.cos(a) * (.9 - .7 * t), rx: Math.sin(a) * (.9 - .7 * t) })); }
    const bloom = mergeVertices(mergeGeometries(pts));
    addThing('Esix Fractal Bloom', '🌸', Wp(BLOOM), 1, 30, g => { g.add(new THREE.Mesh(bloom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 }))); kit(g).S(5, glowM(0xffe27a, 2.4), 0, 47, 0);
    }, { top: 70, view: 400 }); }

  // Rose Stage (Silverquill): 1 hex. A slowly turning circular stage before a curved wall of ink roses, with tiers of seats
  addThing('Rose Stage', '🌹', Wp(ROSE), 1, 30, g => { const k = kit(g), wm = sqWM, bm = sqBM, ink = solid(0x2a0a14, .3), ink2 = solid(0x0c0a10, .25);
    k.C(52, 54, 2, 40, bm, 0, 1, 0);
    const stage = new THREE.Group(); M(stage, new THREE.CylinderGeometry(26, 27, 4, 40), wm, 0, 4, 0); M(stage, new THREE.TorusGeometry(19, .7, 6, 48), bm, 0, 6.1, 0, { rx: Math.PI / 2 }); M(stage, starGeo(12, 5, .5), bm, 0, 6.1, 0, { rx: -Math.PI / 2 });
    M(stage, new THREE.BoxGeometry(3, 6, 2), bm, 0, 9, -6); g.add(stage); spin.push({ o: stage, speed: .12, bolt: false });
    M(g, new THREE.CylinderGeometry(38, 38, 34, 40, 1, true, Math.PI * .55, Math.PI * .9), solid(0x131317, .2, { side: THREE.DoubleSide }), 0, 19, 0);          // backdrop wall, behind the stage
    for (let i = 0; i < 80; i++) { const a = Math.PI * .55 + ((i * 7) % 40 + .5) / 40 * Math.PI * .9 + Math.PI / 2 * 0, y = 6 + ((i * 13) % 28), th = a, r = 36.6;             // the roses
      const m = k.S(1.6 + (i % 3) * .5, i % 4 ? ink : ink2, Math.sin(th) * r, y, Math.cos(th) * r, { sy: .6 }); m.userData.noShadow = true; }
    for (let j = 0; j < 3; j++) M(g, new THREE.CylinderGeometry(34 + j * 6, 34 + j * 6, 1.6 + j * 1.6, 40, 1, false, Math.PI * 1.6, Math.PI * .8), j % 2 ? wm : bm, 0, 2 + .8 + j * .8, 0);   // seats, facing the stage
    for (const sx of [-1, 1]) { k.C(1.6, 2, 30, 8, wm, sx * 40, 17, 0); k.S(2.4, glowM(0xfff0d0, 2.5), sx * 40, 33, 0); }
  }, { ry: -1.2, top: 48, view: 420 });

  // Dramarium (Silverquill): 3 hexes. A domed training hall with two lesser domes, glass-walled studios and a colonnade
  addThing('Dramatorium', '🎭', Wp(DRAMA), 2, 92, g => { const k = kit(g), wm = sqWM, bm = sqBM, st = sqST, gd = sqGD, lit = glowM(0xffe0a8, 2.6), mir = glassM(0xbcd0e0, .7), dome = solid(0x16161c, .25, { metalness: .4 }), drape = solid(0x4a1460, .7), gray = solid(0x8a8a90, .5);
    // an opera house in courses of black and white marble: a round auditorium under a gold-ribbed dome, a fly tower behind it, the Gray Room behind that, a columned portico with two masks in its pediment, and a mirrored pavilion to each side
    k.C(47, 48, 1.2, 40, bm, 0, .6, 0); k.C(43, 44, 1.2, 40, wm, 0, 1.8, 0);
    k.C(22, 22, 26, 28, st, 0, 15.4, 0); k.C(23.4, 23.4, 1.6, 28, gd, 0, 29, 0); k.D(21.5, dome, 0, 29.6, 0, { sy: .8 }); for (let i = 0; i < 8; i++) M(g, new THREE.TorusGeometry(21.7, .45, 5, 16, Math.PI), gd, 0, 29.6, 0, { ry: i * .3927, sy: .8 }); k.C(2.4, 3, 6, 10, wm, 0, 49.5, 0); k.K(2.2, 9, 8, gd, 0, 57, 0);
    for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283, cs = Math.cos(a), sn = Math.sin(a); k.C(.9, .9, 20, 8, wm, cs * 23.2, 12.4, sn * 23.2); NS(k.B(2.4, 9, .5, lit, cs * 22.3, 17, sn * 22.3, { ry: -a + Math.PI / 2 })); }
    k.B(30, 40, 16, st, 0, 22.4, -24); M(g, gable(32, 8, 17), dome, 0, 42.4, -24); k.B(30, 12, 12, gray, 0, 8.4, -38); M(g, gable(32, 5, 13), dome, 0, 14.4, -38);                                             // fly tower, and the Gray Room at the back
    k.B(34, 20, 12, st, 0, 12.4, 25); for (let i = 0; i < 8; i++) k.C(1.2, 1.3, 18, 10, wm, -15.4 + i * 4.4, 11.4, 33); k.B(36, 2.4, 6, bm, 0, 21.6, 32); M(g, gable(36, 8, 6), wm, 0, 22.8, 32);              // the portico
    NS(M(g, new THREE.CircleGeometry(2.3, 20), bm, -2.6, 25.3, 35.1)); NS(M(g, new THREE.CircleGeometry(2.3, 20), gd, 2.6, 25.3, 35.1)); for (const x of [-8, 0, 8]) NS(k.B(5, 9, .5, lit, x, 6.9, 31.2)); for (const sx of [-1, 1]) k.B(4, 14, .4, drape, sx * 13.4, 13, 31.3);
    for (let i = 0; i < 5; i++) k.B(38, .5 * (5 - i), 1.6, wm, 0, 2.4 + .25 * (5 - i), 36.8 + i * 1.6);
    for (const sx of [-1, 1]) { k.B(14, 12, 10, st, sx * 21, 8.4, 4); k.C(11, 12, 16, 18, sx > 0 ? bm : wm, sx * 32, 10.4, 4); k.D(11, sx > 0 ? wm : bm, sx * 32, 18.4, 4, { sy: .8 }); k.K(1, 6, 6, gd, sx * 32, 30, 4); NS(k.B(.6, 9, 12, mir, sx * 43.4, 9, 4)); statue(g, wm, sx * 22, 2.4, 38, 9, 0, sx > 0 ? 0 : 2); }
  }, { ry: 1.3, top: 70, view: 560 });

  // Wiltroot Hall (Witherbloom): 1 hex. The colossal trunk of a long-dead tree, hollowed into halls, with doors and windows cut into the bark
  { const WL = Wp(WILT), wy = heightAt(WL[0], WL[1]), bark = [], lits = [], BK = 0x4a4038, BK2 = 0x3a322c;
    bark.push(part(new THREE.CylinderGeometry(24, 34, 150, 12, 5), BK, { y: 75 })); bark.push(part(new THREE.CylinderGeometry(34, 52, 16, 12, 1, true), BK2, { y: 7 }));
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, hh = 16 + ((i * 37) % 46); bark.push(part(new THREE.ConeGeometry(8.6, hh, 5), i % 2 ? BK : BK2, { x: Math.cos(a) * 17, y: 150 + hh / 2 - 3, z: Math.sin(a) * 17, rz: -Math.cos(a) * .12, rx: Math.sin(a) * .12 })); }   // the splintered crown
    bark.push(part(new THREE.CylinderGeometry(20, 20, 2, 12), 0x0c0a09, { y: 148 }));
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + .4, l = 44 - i * 6, y = 96 + i * 13; bark.push(part(new THREE.CylinderGeometry(2.5, 7, l, 6), BK, { x: Math.cos(a) * (22 + l * .4), y: y + l * .22, z: Math.sin(a) * (22 + l * .4), rz: -Math.cos(a) * 1.1, rx: Math.sin(a) * 1.1 })); }   // broken limbs
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + .2, R = 20 + (i % 3) * 5; bark.push(part(new THREE.TorusGeometry(R, 5.5, 5, 10, Math.PI), BK2, { x: Math.cos(a) * (30 + R), y: -3, z: Math.sin(a) * (30 + R), ry: -a })); }
    for (let i = 0; i < 7; i++) { const a = i * 2.1, y = 40 + i * 14; bark.push(part(new THREE.CylinderGeometry(9, 7, 1.6, 10), 0xc8b89a, { x: Math.cos(a) * 31, y, z: Math.sin(a) * 31 })); }                                 // shelf fungus
    for (let i = 0; i < 18; i++) { const a = i * 2.4, y = 14 + i * 7.2, rr = 34 - 10 * (y / 150) + .6; lits.push(part(new THREE.BoxGeometry(i % 5 ? 4.5 : 8, i % 5 ? 7.5 : 13, 1.4), 0xffffff, { x: Math.cos(a) * rr, y: i % 5 ? y : 8, z: Math.sin(a) * rr, ry: -a + Math.PI / 2 })); }
    const barkGeo = mergeVertices(mergeGeometries(bark)), litGeo = mergeGeometries(lits);
    addThing('Wiltroot Hall', '🪵', WL, 1, 60, g => { g.add(new THREE.Mesh(barkGeo, tx(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true }), 'leaf')));
      g.add(new THREE.Mesh(litGeo, glowM(0xc8ff8a, 4.5)));
    }, { y: wy, top: 215, view: 560 });
    for (let i = 0; i < 9; i++) { const a = i * 1.3; lanternPts.push([WL[0] + Math.cos(a) * 46, wy + 30 + i * 15, WL[1] + Math.sin(a) * 46, { c: [1.2, 2.4, .8], size: 7, drift: 4, speed: .5 }]); } }

  // Gravity Orchard (Prismari, live-map hex 8,49): 1 hex. A crater where mossy boulders hang in the air like fruit and stack into columns; falls run down its walls to a glowing pool
  { const GW = Wp(GORCH); let gy = 1e9; for (let i = 0; i < 8; i++) gy = Math.min(gy, heightAt(GW[0] + Math.cos(i * .785) * 84, GW[1] + Math.sin(i * .785) * 84)); const fy = heightAt(GW[0], GW[1]) - gy;   // gy: the ground round the rim; fy: how far below it the floor of the shaft lies
    addThing('Gravity Orchard', '🪨', GW, 1, 30, g => { const k = kit(g), rock = solid(0x5d544b, .95, { flatShading: true }), moss = solid(0x4f7d36, 1), glow = glowM(0x5fffd0, 2.4);
      k.C(44, 44, .8, 28, waterGlass(0x35c8ac, .85), 0, fy + 3, 0); for (const r of [9, 20, 31]) NS(k.T(r, .7, glow, 0, fy + 4, 0, { rx: Math.PI / 2 }));                                  // the glowing pool on the floor of the shaft
      g.add(mist({ n: 170, seed: 41, arms: 4, jit: 1.2, r0: 12, r1: 50, y0: fy + 8, y1: 26, spin: .2, rise: .045, twist: 2.4, pow: 1.3, size: 30, alpha: .2, col: [.22, 1.15, .95], add: true }));   // glowing blue-green mist winding slowly up the shaft
      g.add(mist({ n: 70, seed: 42, r0: 6, r1: 40, y0: fy + 6, y1: fy + 40, spin: -.15, rise: 0, size: 34, alpha: .22, col: [.2, .9, 1.2], add: true }));                                                   // and lying thick on the pool at the bottom
      for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + 1.1, x = Math.cos(a) * 82, z = Math.sin(a) * 82, y = heightAt(GW[0] + x, GW[1] + z) - gy; k.B(6, 22, 6, rock, x, y + 9, z, { ry: a }); k.B(.7, 14, 6.4, glow, x, y + 10, z, { ry: a }); }   // standing stones round the rim
      const boulder = (grp, x, y, z, r, i) => { M(grp, new THREE.DodecahedronGeometry(r, 0), rock, x, y, z, { rx: i, rz: i * 1.7, sy: 1.15 }); M(grp, new THREE.SphereGeometry(r * .82, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), moss, x, y + r * .45, z, { sy: .5 }); };
      for (let gi = 0; gi < 3; gi++) { const grp = new THREE.Group();
        for (let i = gi; i < 26; i += 3) { const a = i * 2.39996, d = 5 + (i * 13) % 32; boulder(grp, Math.cos(a) * d, fy + 30 + (i * 37) % Math.round(-fy + 95), Math.sin(a) * d, 4.5 + (i * 7) % 7, i); }   // boulders drifting up out of the dark
        const ca = gi * 2.1 + .6, cx = Math.cos(ca) * 25, cz = Math.sin(ca) * 25; for (let j = 0; j < 7; j++) boulder(grp, cx, fy + 24 + j * (-fy + 60) / 7, cz, 6.5 - j * .5, j + gi);    // rocks stacked in mid-air like columns, rising from the floor
        mergeKids(grp); grp.traverse(m => { m.userData.noShadow = true; }); g.add(grp); anim.push(t => { grp.position.y = Math.sin(t * .45 + gi * 2.1) * 5; grp.rotation.y = Math.sin(t * .12 + gi) * .12; }); }
    }, { y: gy, top: 110, view: 430 });
    for (let i = 0; i < 7; i++) lanternPts.push([GW[0] + Math.cos(i * 2.4) * (i ? 24 : 0), gy + fy * (1 - i / 7) + 12, GW[1] + Math.sin(i * 2.4) * (i ? 24 : 0), { c: [.9, 2.6, 2], size: i ? 9 : 34, drift: i ? 3 : .3, speed: .3 }]); }

  // Cold Anchor Stones (Prismari, live-map hex 12,48): 1 hex. A great standing stone threaded with glowing blue runes, set into the mountainside, the rock round it cracked with violet light
  { const CW2 = Wp(COLD), cy = heightAt(CW2[0], CW2[1]), gh = (x, z) => heightAt(CW2[0] + x, CW2[1] + z) - cy;
    anchorStone = (g, gh) => { const k = kit(g), rk = solid(0x2a3550, .35, { flatShading: true }), rune = glowM(0x6fc8ff, 3.2), crack = glowM(0xa070ff, 2.2), frost = solid(0xd8e6f2, .8);
      k.C(7.5, 13, 74, 5, rk, 0, 22, 0, { rz: .05 }); k.K(7.5, 13, 5, rk, 1.2, 65, 0, { rz: -.25 });
      k.C(3, 7, 30, 4, rk, -11, gh(-11, 5) + 6, 5, { rz: .32 }); k.C(2.6, 6, 26, 4, rk, 10, gh(10, -6) + 5, -6, { rz: -.36, ry: .6 }); k.C(2, 5, 20, 4, rk, 2, gh(2, 12) + 3, 12, { rx: .3 });
      for (let i = 0; i < 16; i++) { const t = i / 16, a = t * 9, r = 13 - 5.5 * t + .4, m = k.B(2.4, 3, .6, rune, Math.cos(a) * r * .8, 8 + t * 50, Math.sin(a) * r * .8, { ry: -a + Math.PI / 2 }); m.userData.noShadow = true; }
      for (let i = 0; i < 26; i++) { const a = i * 2.39996, d = 13 + (i * 7) % 34, x = Math.cos(a) * d, z = Math.sin(a) * d, m = k.B(6 + i % 6, .6, .9, crack, x, gh(x, z) + .5, z, { ry: -a + (i % 3 - 1) * .5 }); m.userData.noShadow = true; }   // cracks follow the slope
      for (const [x, z, r] of [[-20, -14, 8], [18, 16, 7], [-6, 26, 6]]) k.S(r, frost, x, gh(x, z) + .3, z, { sy: .14 });
    };
    addThing('Cold Anchor Stones', '🗿', CW2, 1, 30, g => anchorStone(g, gh), { y: cy, top: 84, view: 360 }); coldField(CW2[0], cy, CW2[1]);
    lanternPts.push([CW2[0], cy + 36, CW2[1], { c: [.9, 1.8, 2.8], size: 30, drift: .2, speed: .5 }]); }

  // Brinewhale Oathpool (Prismari, live-map hex 8,51): 1 hex. The pool lies under the mountain. Above it is the village of the frost giants who keep it:
  // giant-scale halls driven into the mountainside so only their gable fronts stand clear of the rock, a colossal stair, an ice palisade below and the great gate above. Nothing is levelled.
  { const hA = hexAt(8, 51), hB = hexAt(7, 51), BW = [(hA.x + hB.x) / 2, (hA.z + hB.z) / 2], by = heightAt(BW[0], BW[1]), pk = [X(.245) * S, Z(.968) * S], ul = Math.hypot(pk[0] - BW[0], pk[1] - BW[1]), ux = (pk[0] - BW[0]) / ul, uz = (pk[1] - BW[1]) / ul;   // (ux, uz) points uphill
    const xz = (u, v) => [ux * u - uz * v, uz * u + ux * v], gh = (u, v) => { const p = xz(u, v); return heightAt(BW[0] + p[0], BW[1] + p[1]) - by; }, ry = -Math.atan2(uz, ux);
    const lamp = (u, v, y, size) => { const p = xz(u, v); lanternPts.push([BW[0] + p[0], by + y, BW[1] + p[1], { c: [2.6, 1.3, .4], size, drift: .5, speed: 1.5 }]); };
    addThing('Brinewhale Oathpool', '🐋', BW, 1, 30, g => { const k = kit(g), timber = solid(0x3b2e27, .9), snowM = solid(0xe8eff4, .85), rockM = solid(0x322c3a, .92, { flatShading: true }), bone = solid(0xe8e0cf, .55), fire = glowM(0xff8a2a, 3.4), cold = glowM(0x7fd6ff, 2.8), rune = glowM(0x6fc8ff, 2.6);
      const ice = new THREE.MeshStandardMaterial({ color: 0xbfe6f6, roughness: .12, transparent: true, opacity: .82, envMapIntensity: 1.8 });
      const put = (geo, mat, u, v, y, o) => { const p = xz(u, v); return M(g, geo, mat, p[0], y, p[1], { ry, ...(o || {}) }); };   // local x = uphill, local z = across the slope
      // a giant's hall: floor set at the ground a quarter of the way back, so the front stands out on a rock footing and the rear is buried in the mountain
      const hall = (u, v, w, hgt, l) => { const top = gh(u - l * .25, v), lo = Math.min(gh(u - l / 2 - 2, v - w * .4), gh(u - l / 2 - 2, v + w * .4)), fu = u - l / 2;
        put(new THREE.BoxGeometry(l * .55, top - lo + 10, w + 5), rockM, u - l * .26, v, (top + lo - 10) / 2);
        put(new THREE.BoxGeometry(l, hgt * .5, w), timber, u, v, top + hgt * .25); M(g, gable(w + 6, hgt * .62, l + 4), snowM, xz(u, v)[0], top + hgt * .5, xz(u, v)[1], { ry: ry + Math.PI / 2 });
        put(new THREE.BoxGeometry(1, hgt * .44, w * .3), fire, fu - .4, v, top + hgt * .22).userData.noShadow = true;                                               // the firelit doorway
        for (const sd of [-1, 1]) { put(new THREE.ConeGeometry(hgt * .055, hgt * .62, 7), bone, fu - 2, v + sd * w * .24, top + hgt * .31); put(new THREE.BoxGeometry(2.4, hgt * .5, 2.4), timber, fu - .2, v + sd * (w / 2 - 1.2), top + hgt * .25); }   // tusks by the door, corner posts
        put(new THREE.BoxGeometry(2, 2.4, w + 7), timber, fu - 1, v, top + hgt * .5); lamp(fu - 4, v, top + hgt * .25, 12); };
      hall(22, -30, 30, 34, 40); hall(20, 30, 22, 27, 32); hall(-22, -29, 20, 24, 30); hall(-24, 28, 20, 24, 30);
      for (let u = -50; u <= 46; u += 8) put(new THREE.BoxGeometry(8.6, 6, 15), rockM, u, 0, gh(u, 0) - 1.4);                                                   // the giants' stair
      { const y = gh(-2, 0); put(new THREE.CylinderGeometry(8.5, 10, 4, 12), rockM, -2, 0, y + 1); const f = put(new THREE.SphereGeometry(4.6, 12, 8), fire, -2, 0, y + 5.5, { sy: 1.4 }); f.userData.noShadow = true; lamp(-2, 0, y + 10, 24); }   // the great hearth on the stair landing
      // the ice palisade and its tusk gateway at the foot of the village
      for (let v = -52; v <= 52; v += 5.5) { if (Math.abs(v) < 10) continue; const hh = 16 + ((v * 7 + 300) % 13); put(new THREE.ConeGeometry(3.4, hh, 5), ice, -56 + Math.abs(v) * .12, v, gh(-56 + Math.abs(v) * .12, v) + hh / 2 - 3); }
      for (const sd of [-1, 1]) { const y = gh(-56, sd * 11); put(new THREE.ConeGeometry(2.6, 34, 8), bone, -56, sd * 11, y + 15); put(new THREE.CylinderGeometry(3.4, 4, 5, 8), rockM, -56, sd * 11, y + 1); }
      // rune stones along the stair
      for (const [u, v] of [[-40, 13], [-40, -13], [38, 13], [38, -13]]) { const y = gh(u, v); put(new THREE.CylinderGeometry(2.6, 4.2, 26, 5), rockM, u, v, y + 10); for (let i = 0; i < 4; i++) put(new THREE.BoxGeometry(.6, 2.6, 2.2), rune, u - 3.4 + i * .2, v, y + 5 + i * 5).userData.noShadow = true; }
      // the great gate into the mountain: giant posts cut with runes, a lintel hung with icicles and set with tusks, cold light from below
      { const y = gh(56, 0);
        for (const sd of [-1, 1]) { put(new THREE.BoxGeometry(10, 70, 10), rockM, 56, sd * 17, y + 22); for (let i = 0; i < 6; i++) put(new THREE.BoxGeometry(.6, 4.4, 3.4), rune, 50.8, sd * 17, y + 6 + i * 8).userData.noShadow = true; put(new THREE.ConeGeometry(2.6, 22, 7), bone, 56, sd * 14, y + 74); }
        put(new THREE.BoxGeometry(11, 11, 48), rockM, 56, 0, y + 55); const gl = put(new THREE.BoxGeometry(1.4, 46, 24), cold, 57, 0, y + 26); gl.userData.noShadow = true;
        for (let i = -4; i <= 4; i++) { const hh = 9 + ((i + 4) * 5) % 9; put(new THREE.ConeGeometry(1.6 + (i & 1) * .6, hh, 6), ice, 52, i * 4.4, y + 49.5 - hh / 2, { rx: Math.PI }); } }
      // brine cauldrons below the gate, and the whale-fluke totem at the foot of the stair
      for (let i = 0; i < 3; i++) { const u = 44 - i * 2, v = 24 + i * 9, y = gh(u, v); put(new THREE.CylinderGeometry(6, 4.6, 7, 12), rockM, u, v, y + 3); put(new THREE.CylinderGeometry(5.3, 5.3, .4, 12), glassM(0xd8f0f4, .9), u, v, y + 6.6); }
      { const y = gh(-48, 22), p = xz(-48, 22); put(new THREE.CylinderGeometry(1.4, 1.8, 30, 7), timber, -48, 22, y + 13); k.S(6.4, rockM, p[0] - 4.6, y + 30, p[1], { sx: 1.5, sy: .32, rz: .5 }); k.S(6.4, rockM, p[0] + 4.6, y + 30, p[1], { sx: 1.5, sy: .32, rz: -.5 }); }
    }, { y: by, hexes: [[8, 51], [7, 51]], top: 150, view: 480 }); }

  // ================= Prismari locations from the live map (each linked to its real hex ids) =================
  // helper for places built onto a slope: u runs uphill, v across the slope. Nothing is levelled - footings and steps meet the ground where it is
  const slope = (c, upx, upz) => { const l = Math.hypot(upx, upz) || 1, ux = upx / l, uz = upz / l, cy = heightAt(c[0], c[1]);
    const xz = (u, v) => [ux * u - uz * v, uz * u + ux * v], gh = (u, v) => { const p = xz(u, v); return heightAt(c[0] + p[0], c[1] + p[1]) - cy; }, ry = -Math.atan2(uz, ux);
    return { cy, xz, gh, ry, ux, uz, put: (g, geo, mat, u, v, y, o) => { const p = xz(u, v); return M(g, geo, mat, p[0], y, p[1], { ry, ...(o || {}) }); },
      lamp: (u, v, y, st) => { const p = xz(u, v); lanternPts.push([c[0] + p[0], cy + y, c[1] + p[1], st]); } }; };
  const hexW = (q, r) => { const h = hexAt(q, r); return [h.x, h.z]; };
  const ARCW = hexW(2, 42), DCW = hexW(2, 41);
  const basalt = solid(0x221b1a, .85, { flatShading: true }), lavaG = glowM(0xff5512, 3.2), fireG = glowM(0xffa030, 3.4), copper = new THREE.MeshStandardMaterial({ color: 0xb8683a, roughness: .35, metalness: .7 });
  const emberSt = size => ({ c: [2.8, 1.1, .3], size, drift: 1.2, speed: 1.6 });
  const VW = [VOLC[0].x * S, VOLC[0].z * S];
  // gears, for the clockwork and the construction site
  const gearGeo = (R, teeth, th) => { const parts = [new THREE.CylinderGeometry(R, R, th, 24).toNonIndexed(), new THREE.CylinderGeometry(R * .3, R * .3, th * 1.6, 12).toNonIndexed()];
    for (let i = 0; i < teeth; i++) { const a = i / teeth * 6.283, b = new THREE.BoxGeometry(R * .22, th, R * .2).toNonIndexed(); b.rotateY(-a); b.translate(Math.cos(a) * R * 1.08, 0, Math.sin(a) * R * 1.08); parts.push(b); }
    return mergeGeometries(parts); };
  // lightning: a jagged bolt that stabs down onto one of the given points every so often, with a flash where it lands
  const boltGeo = seed => { const r = mulberry32(seed), pts = [new THREE.Vector3(0, 0, 0)]; for (let i = 1; i <= 14; i++) pts.push(new THREE.Vector3((r() - .5) * .13, i / 14, (r() - .5) * .13));
    const cp = new THREE.CurvePath(); for (let i = 0; i < 14; i++) cp.add(new THREE.LineCurve3(pts[i], pts[i + 1])); return new THREE.TubeGeometry(cp, 28, .0055, 4, false); };
  const BOLTS = [boltGeo(3), boltGeo(8), boltGeo(21)], boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.6, 4.6), fog: false });
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 2.4, 3.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const lightning = (targets, period, phase, hgt = 640) => { const ms = BOLTS.map(ge => { const m = new THREE.Mesh(ge, boltMat); m.visible = false; m.frustumCulled = false; m.raycast = () => {}; scene.add(m); return m; });
    const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), flashMat); fl.visible = false; fl.raycast = () => {}; scene.add(fl);
    anim.push(t => { const c = (t + phase) / period, n = Math.floor(c), f = (c - n) * period, on = f < .09 || (f > .14 && f < .21), h1 = Math.sin(n * 12.9898 + phase) * 43758.5453, rr = h1 - Math.floor(h1), tg = targets[Math.floor(rr * targets.length)];
      ms.forEach((m, i) => { m.visible = on && i === n % 3; if (m.visible) { m.position.set(tg[0], tg[1], tg[2]); m.scale.setScalar(hgt); m.rotation.y = rr * 6.283; } });
      fl.visible = f < .3; if (fl.visible) { fl.position.set(tg[0], tg[1], tg[2]); fl.scale.setScalar(30 * (1 - f / .3) + 5); } }); };

  // ---------- the fire giants' works on the great volcano ----------
  // Cinder Halo (5,38): a massive ring of fire hanging over the caldera, turning slowly; every so often fire flares across the inside of it
  { const v0 = VOLC[0], rimY = v0.rimH * S, R = v0.rc * S * 1.75;
    let ringG = null;
    addThing('Cinder Halo', '🔥', VW, 1, 30, g => { const ring = ringG = new THREE.Group(); ring.position.y = rimY + 78;
      M(ring, new THREE.TorusGeometry(R, 1.8, 8, 96), glowM(0xffc060, 3.8), 0, 0, 0, { rx: Math.PI / 2 });                                                     // the white-hot thread the fire burns from
      const flare = M(ring, new THREE.CircleGeometry(R - 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, .8, .12), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 0, 0, 0, { rx: -Math.PI / 2 });
      ring.traverse(m => { m.userData.noShadow = true; }); flare.raycast = () => {}; g.add(ring); spin.push({ o: ring, speed: .16, bolt: false });
      anim.push(t => { const c = t % 8.5, k = c < 1.6 ? Math.sin(c / 1.6 * Math.PI) * (.55 + .45 * Math.sin(t * 31)) : 0; flare.material.opacity = k * .75; });
      M(g, new THREE.CylinderGeometry(v0.rc * S * .9, v0.rc * S * .9, 6, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, v0.lavaLvl * S, 0).userData.noShadow = true;   // click target over the crater
    }, { y: 0, hexes: [[5, 38]], top: rimY + 130, view: 760 });
    // the fire itself: sheets of flame standing round the ring and a band of it lying flat (so it reads from above as well), all drawn from the drifting noise so the flames lick upward and run round the circle.
    // They are put on after the thing is made, because a thing copies its materials and these have to keep the one clock
    { const fireMat = (k, flat) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uNoise: U.uNoise, uTime: U.uTime, uK: { value: k }, uFlat: { value: flat } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
          'uniform sampler2D uNoise; uniform float uTime, uK, uFlat; varying vec2 vUv;',
          'void main(){ float u = vUv.x, v = mix(vUv.y, abs(vUv.y - 0.5) * 2.0, uFlat);',
          '  float n1 = texture2D(uNoise, vec2(u * 9.0 - uTime * 0.11, v * 0.9 - uTime * 0.42)).r, n2 = texture2D(uNoise, vec2(u * 23.0 - uTime * 0.19, v * 2.1 - uTime * 0.8)).r;',   // big tongues, and small ones racing over them
          '  float f = clamp((n1 * 0.65 + n2 * 0.5 - v * 0.95 + 0.1) * 2.2, 0.0, 1.0);',
          '  vec3 col = mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.62, 0.1), smoothstep(0.2, 0.6, f)); col = mix(col, vec3(1.0, 0.95, 0.7), smoothstep(0.7, 1.0, f));',               // red at the tips, orange, near white at the root
          '  gl_FragColor = vec4(col * f * f * uK * smoothstep(0.0, 0.05, v + uFlat), 1.0); }'].join('\n') });
      const put = m => { m.raycast = () => {}; m.frustumCulled = false; m.renderOrder = 40; ringG.add(m); };
      for (const [r0, r1, hh, k] of [[R, R + 4, 48, .7], [R + 8, R + 16, 34, .42], [R - 8, R - 15, 34, .42]]) { const ge = new THREE.CylinderGeometry(r1, r0, hh, 128, 1, true); ge.translate(0, hh / 2 - 3, 0); put(new THREE.Mesh(ge, fireMat(k, 0))); }
      { const TS = 128, fg = new THREE.RingGeometry(R - 18, R + 18, TS, 1), fu = fg.attributes.uv; for (let i = 0; i < fu.count; i++) fu.setXY(i, (i % (TS + 1)) / TS, i > TS ? 1 : 0); const m = new THREE.Mesh(fg, fireMat(.45, 1)); m.rotation.x = -Math.PI / 2; m.position.y = 1; put(m); }
      const em = mist({ n: 240, seed: 55, r0: R - 4, r1: R + 8, y0: -4, y1: 64, spin: .55, rise: .2, pow: 1, size: 5, alpha: .9, col: [2.4, .9, .16], add: true }); em.position.set(VW[0], rimY + 78, VW[1]); scene.add(em); }   // sparks carried round and up
    for (let i = 0; i < 22; i++) { const a = i / 22 * 6.283; lanternPts.push([VW[0] + Math.cos(a) * R, rimY + 82 + (i % 3) * 6, VW[1] + Math.sin(a) * R, emberSt(12 + (i % 3) * 5)]); } }

  // Emberstamp Mint (5,37): a fire giant gateway into the side of the volcano, magma dripping across it, with the stamping block outside
  { const c = hexW(5, 37), sl = slope(c, VW[0] - c[0], VW[1] - c[1]);
    addThing('Emberstamp Mint', '🪙', c, 1, 30, g => { const P2 = (geo, mat, u, v, y, o) => sl.put(g, geo, mat, u, v, y, o), y0 = sl.gh(14, 0);
      for (const sd of [-1, 1]) { P2(new THREE.BoxGeometry(14, 92, 14), basalt, 14, sd * 23, y0 + 28); P2(new THREE.ConeGeometry(5.5, 28, 5), basalt, 14, sd * 23, y0 + 88); for (let i = 0; i < 5; i++) NS(P2(new THREE.BoxGeometry(.8, 7, 4), lavaG, 6.8, sd * 23, y0 + 6 + i * 12)); }
      P2(new THREE.BoxGeometry(16, 15, 66), basalt, 14, 0, y0 + 66); NS(P2(new THREE.BoxGeometry(2, 58, 32), fireG, 16, 0, y0 + 29));
      for (let i = -3; i <= 3; i++) { const l = 14 + ((i + 3) * 7) % 22; NS(P2(new THREE.CylinderGeometry(.5, .9, l, 6), lavaG, 9, i * 4.2, y0 + 58 - l / 2)); NS(P2(new THREE.SphereGeometry(1.3, 8, 6), lavaG, 9, i * 4.2, y0 + 57 - l)); }
      const yb = sl.gh(-26, 0), lo = sl.gh(-40, 0); P2(new THREE.BoxGeometry(28, yb - lo + 12, 32), basalt, -28, 0, (yb + lo - 12) / 2); P2(new THREE.BoxGeometry(14, 7, 14), basalt, -26, 0, yb + 3.5);
      P2(new THREE.SphereGeometry(6, 10, 6), gold, -26, 0, yb + 7.5, { sy: .35 }); P2(new THREE.CylinderGeometry(3, 3, 16, 8), basalt, -26, -12, yb + 8); P2(new THREE.BoxGeometry(8, 6, 8), basalt, -26, -12, yb + 18);
      for (let u = -12; u <= 8; u += 9) P2(new THREE.BoxGeometry(9.6, 6, 24), basalt, u, 0, sl.gh(u, 0) - 1.5);
    }, { y: sl.cy, hexes: [[5, 37]], top: 120, view: 460 });
    sl.lamp(8, 0, sl.gh(14, 0) + 30, emberSt(26)); }

  // Oathiron Foundry (4,38): furnaces stepping up the mountainside, lava spilling from one to the next, and the giants' anvil at the bottom
  { const c = hexW(4, 38), sl = slope(c, VW[0] - c[0], VW[1] - c[1]);
    addThing('Oathiron Foundry', '⚒️', c, 1, 30, g => { const P2 = (geo, mat, u, v, y, o) => sl.put(g, geo, mat, u, v, y, o); const F = [[-36, -18], [-12, 16], [12, -14], [38, 14]], tops = [];
      F.forEach(([u, v], i) => { const top = sl.gh(u - 4, v), lo = Math.min(sl.gh(u - 14, v - 9), sl.gh(u - 14, v + 9)); P2(new THREE.BoxGeometry(26, top - lo + 12, 26), basalt, u - 2, v, (top + lo - 12) / 2);
        P2(new THREE.BoxGeometry(22, 22, 22), basalt, u, v, top + 11); P2(new THREE.BoxGeometry(24.4, 3, 24.4), basalt, u, v, top + 23); NS(P2(new THREE.BoxGeometry(1.2, 11, 10), fireG, u - 11.2, v, top + 7));
        P2(new THREE.CylinderGeometry(3.6, 5, 30, 8), basalt, u + 4, v + (i % 2 ? -5 : 5), top + 38); tops.push([u, v, top]); const p = sl.xz(u + 4, v + (i % 2 ? -5 : 5)); chimneys.push([c[0] + p[0], sl.cy + top + 56, c[1] + p[1]]); sl.lamp(u - 13, v, top + 7, emberSt(16)); });
      for (let i = 0; i < 3; i++) { const a = tops[i], b = tops[i + 1], du = b[0] - a[0] - 22, dy = (b[2] + 4) - (a[2] + 22), len = Math.hypot(du, dy);   // lava spilling down from each furnace into the one below
        NS(P2(new THREE.BoxGeometry(len, 1.4, 4.4), lavaG, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + 22 + b[2] + 4) / 2, { rz: Math.atan2(dy, du) })); }
      const ya = sl.gh(-58, 4), la = sl.gh(-70, 4); P2(new THREE.BoxGeometry(26, ya - la + 12, 30), basalt, -60, 4, (ya + la - 12) / 2); P2(new THREE.BoxGeometry(16, 8, 9), basalt, -58, 4, ya + 4); P2(new THREE.BoxGeometry(22, 4, 11), basalt, -58, 4, ya + 10); P2(new THREE.ConeGeometry(4, 12, 6), basalt, -58, 17, ya + 10, { rx: Math.PI / 2 });
      NS(P2(new THREE.BoxGeometry(8, 1.2, 5), lavaG, -58, 2, ya + 12.4));
    }, { y: sl.cy, hexes: [[4, 38]], top: 130, view: 480 }); }

  // Kiln-Cathedral (4,39): the fire giants' great hall of trade - black, gothic, towers crowned with fire and strung with chains, lava running down its steps
  { const c = hexW(4, 39), sl = slope(c, VW[0] - c[0], VW[1] - c[1]);
    addThing('Kiln-Cathedral', '⛪', c, 1, 30, g => { const P2 = (geo, mat, u, v, y, o) => sl.put(g, geo, mat, u, v, y, o), blk = solid(0x171213, .55, { flatShading: true }), top = sl.gh(-6, 0), lo = Math.min(sl.gh(-26, -16), sl.gh(-26, 16));
      P2(new THREE.BoxGeometry(34, top - lo + 14, 46), basalt, -8, 0, (top + lo - 14) / 2);                                                             // plinth standing out of the slope
      P2(new THREE.BoxGeometry(44, 46, 28), blk, 12, 0, top + 23); M(g, gable(31, 20, 46), blk, sl.xz(12, 0)[0], top + 46, sl.xz(12, 0)[1], { ry: sl.ry + Math.PI / 2 });   // nave, running back into the mountain
      for (const sd of [-1, 1]) { P2(new THREE.BoxGeometry(11, 92, 11), blk, -8, sd * 17, top + 46); P2(new THREE.BoxGeometry(13, 3, 13), gold, -8, sd * 17, top + 93); P2(new THREE.ConeGeometry(7.6, 26, 4), blk, -8, sd * 17, top + 107, { ry: sl.ry + Math.PI / 4 });
        NS(P2(new THREE.ConeGeometry(4.4, 16, 6), fireG, -8, sd * 17, top + 127)); sl.lamp(-8, sd * 17, top + 130, emberSt(30)); for (const yy of [26, 50, 72]) NS(P2(new THREE.BoxGeometry(.6, 13, 3.6), fireG, -13.8, sd * 17, top + yy));
        for (let i = 0; i < 3; i++) { P2(new THREE.BoxGeometry(4, 40 + i * 6, 4), blk, 6 + i * 13, sd * 21, top + 20 + i * 3); P2(new THREE.ConeGeometry(3, 12, 4), blk, 6 + i * 13, sd * 21, top + 46 + i * 6, { ry: sl.ry + Math.PI / 4 }); } }
      P2(new THREE.ConeGeometry(7, 60, 6), blk, 10, 0, top + 92); NS(P2(new THREE.ConeGeometry(3, 12, 6), fireG, 10, 0, top + 127));                 // central spire
      NS(P2(new THREE.BoxGeometry(.8, 30, 13), fireG, -10.4, 0, top + 15)); NS(P2(new THREE.CylinderGeometry(6.5, 6.5, .8, 20), fireG, -10.4, 0, top + 46, { rz: Math.PI / 2 })); P2(new THREE.TorusGeometry(7, 1, 6, 20), blk, -10.8, 0, top + 46, { ry: sl.ry + Math.PI / 2 });   // doorway and rose window
      for (let i = 0; i < 5; i++) { const sag = [0, -7, -10, -7, 0][i]; P2(new THREE.BoxGeometry(1.2, 1.2, 8), blk, -8, -14 + i * 7, top + 84 + sag, { rx: (i - 2) * .22 }); }      // chains slung between the towers
      for (let u = -16; u >= -44; u -= 7) { const y = sl.gh(u, 0); P2(new THREE.BoxGeometry(7.4, 5, 30), basalt, u, 0, y - 1); NS(P2(new THREE.BoxGeometry(7.6, .8, 7), lavaG, u, 0, y + 1.7)); }   // steps, lava running down the middle
    }, { y: sl.cy, hexes: [[4, 39]], top: 150, view: 520 }); }

  // The players' workshop (1,39 2,39 1,40). For now only what shows from outside: a gateway cut back into the hillside, looking at the Draftfire House, and on a small shelf beside it to the east
  // a carved stone dome whose one round window looks down on that house. Golden light comes out of the dome, and a drift of fungal spores
  { const G = Wp(WKG), D0 = Wp(WKD), dx = WKO[0], dz = WKO[1], gy = 83 * S, py = 101.5 * S, ry = -Math.atan2(dz, dx), toL = (wx, wz) => [(wx - G[0]) * dx + (wz - G[1]) * dz, -(wx - G[0]) * dz + (wz - G[1]) * dx], toW = (lx, lz) => [G[0] + lx * dx - lz * dz, G[1] + lx * dz + lz * dx];
    const dh = hexW(2, 40), wl = Math.hypot(dh[0] - D0[0], dh[1] - D0[1]), wdx = (dh[0] - D0[0]) / wl, wdz = (dh[1] - D0[1]) / wl, FX = -13;   // the way the dome's window looks; and where the cut face stands, in the gate's own frame (x out of the hill)
    addThing("Players' Workshop", '🚪', G, 1, 30, g => { const k = kit(g), st = tx(solid(0x4f4c55, .9), 'plain2'), tr = tx(solid(0x64606b, .88), 'plain2'), rk = tx(solid(0x6a676c, .92), 'plain2'), dark = solid(0x0b090d, 1), bronze = new THREE.MeshStandardMaterial({ color: 0x7c5a34, roughness: .45, metalness: .75 }), iron = new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: .5, metalness: .7 }), gold = glowM(0xffa030, 2.6);
      // the gateway: two great piers and a lintel standing proud of the rock, a stepped crown over them, a second frame set back inside, and the dark of the way in
      for (const sd of [-1, 1]) { k.B(7, 34, 7, st, FX + 2.5, 17, sd * 12.5); k.B(8, 2, 8, tr, FX + 2.5, 1, sd * 12.5); k.B(8, 1.6, 8, tr, FX + 2.5, 33.4, sd * 12.5); k.B(3.4, 30, 3, tr, FX + .6, 15, sd * 8); NS(k.B(.3, 18, 1.1, gold, FX + 6.05, 17, sd * 12.5)); }
      k.B(8, 6, 34, st, FX + 3, 37.2, 0); k.B(9.6, 1.6, 36, tr, FX + 3.2, 41, 0); k.B(6.4, 4, 23, st, FX + 2.6, 43.8, 0); k.B(5, 3.2, 12, st, FX + 2.2, 47.4, 0); k.B(3.4, 3, 19, tr, FX + .6, 31.5, 0);
      NS(M(g, new THREE.OctahedronGeometry(2.3, 0), gold, FX + 7.4, 37.2, 0)); k.B(1.2, 30, 16, dark, FX - .4, 15, 0); NS(k.B(.3, 15, 4.5, glowM(0xffb060, 1.1), FX + .3, 8.5, 0));                                    // a warm light a long way in
      for (const [zz, th] of [[8, 1.833], [-8, 1.309]]) { const sg = zz > 0 ? -1 : 1, cx = FX + 1.6 + 3.86, cz = zz + sg * 1.04; k.B(.9, 28, 8, bronze, cx, 14, cz, { ry: th }); for (const yy of [5, 14, 23]) k.B(1.2, 1.4, 8.2, iron, cx, yy, cz, { ry: th }); }   // its two doors standing open
      k.B(13, 1.2, 30, tr, FX + 7.5, .6, 0); k.B(5, .6, 26, tr, FX + 16, .3, 0);                                                                                                                                   // threshold and a step
      for (const sd of [-1, 1]) { k.B(27, 11, 2.6, st, FX + 15.5, 5.5, sd * 20); k.B(28, 1.1, 3.6, tr, FX + 15.5, 11.5, sd * 20); k.C(2, 2.7, 8, 8, tr, FX + 30.5, 4, sd * 20); k.C(2.6, 2, 1.4, 8, iron, FX + 30.5, 8.7, sd * 20); const f = M(g, new THREE.SphereGeometry(1.7, 8, 6), fireG, FX + 30.5, 10.2, sd * 20); f.userData.keepSep = 1; f.userData.noShadow = true; }   // low walls holding the cut back, a brazier at the end of each
      // the dome, on its shelf: a low drum and a smooth cap of plain cut stone, a round window in a stone sleeve, toadstools round its foot and bracket-fungus up its side
      const dm = new THREE.Group(), kd = kit(dm), dl = toL(D0[0], D0[1]), wloc = [wdx * dx + wdz * dz, -wdx * dz + wdz * dx], capG = new THREE.MeshStandardMaterial({ color: 0xc9772e, emissive: 0xff8a1e, emissiveIntensity: .9, roughness: .6 }), stem = solid(0xe8dcc0, .8);
      kd.C(10.6, 11.2, 6, 24, rk, 0, 3, 0); kd.D(10.4, rk, 0, 6, 0);                                                                                       // plain cut stone, nothing carved on it
      kd.C(3.5, 3.5, 3, 14, rk, 10, 7, 0, { rz: Math.PI / 2 }); kd.T(3.3, .45, rk, 11.5, 7, 0, { ry: Math.PI / 2 }); NS(kd.C(2.8, 2.8, .4, 16, gold, 11.3, 7, 0, { rz: Math.PI / 2 })); NS(kd.B(.3, 5.6, .35, dark, 11.6, 7, 0)); NS(kd.B(.3, .35, 5.6, dark, 11.6, 7, 0));
      { const cone = M(dm, new THREE.ConeGeometry(15, 62, 18, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }', fragmentShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ float rim = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vec3(1.0, 0.55, 0.16) * rim * rim * vUv.y * vUv.y * 0.42, 1.0); }' }), 11.5 + .819 * 31, 7 - .574 * 31, 0, { rz: .96 }); cone.userData.noShadow = true; cone.raycast = () => {}; }   // the light it throws down toward the house
      for (let i = 0; i < 12; i++) { const a = .75 + i * .43, r = 11.9 + (i % 3) * 1.5, hh = 1.5 + (i % 4) * .7, x = Math.cos(a) * r, z = Math.sin(a) * r; kd.C(.28, .36, hh, 6, stem, x, hh / 2, z); kd.S(.9 + .26 * (i % 3), capG, x, hh, z, { sy: .5 }); }
      for (let i = 0; i < 6; i++) { const az = 1 + i * .95, el = .3 + .13 * i; kd.S(1.25 - .1 * i, capG, Math.cos(el) * Math.cos(az) * 10.3, 6 + Math.sin(el) * 10.3, Math.cos(el) * Math.sin(az) * 10.3, { sy: .34 }); }
      dm.position.set(dl[0], py - gy, dl[1]); dm.rotation.y = -Math.atan2(wloc[1], wloc[0]); dm.updateMatrix(); for (const m of [...dm.children]) { m.applyMatrix4(dm.matrix); g.add(m); }
    }, { y: gy, ry, hexes: [[1, 39], [2, 39], [1, 40]], top: 62, view: 420 });
    for (const [n, col, sd] of [[110, [1.7, 1.05, .32], 91], [60, [.75, 1.35, .5], 92]]) { const sp = mist({ n, seed: sd, r0: 3, r1: 48, y0: 5, y1: 90, spin: .09, rise: .04, pow: .8, size: 4.2, alpha: .6, col, add: true }); sp.position.set(D0[0] + wdx * 9, py, D0[1] + wdz * 9); scene.add(sp); }   // spores: gold out of the window, and a paler green among them, rising and spreading
    lanternPts.push([D0[0] + wdx * 12.5, py + 7, D0[1] + wdz * 12.5, { c: [2.8, 1.5, .4], size: 18, drift: .15, speed: .5 }]);
    for (const sd of [-1, 1]) { const p = toW(FX + 30.5, sd * 20); lanternPts.push([p[0], gy + 11, p[1], { c: [2.6, 1.4, .45], size: 10, drift: .4, speed: .5 }]); } }

  // Draftfire House (2,40): a house set back into the mountainside on a rock shelf, elemental smoke of every colour rising from its chimneys, ice hanging from the shelf below
  { const c = hexW(2, 40), mk = MOUNTS[1], sl = slope(c, mk.x * S - c[0], mk.z * S - c[1]);
    addThing('Draftfire House', '🏠', c, 1, 30, g => { const P2 = (geo, mat, u, v, y, o) => sl.put(g, geo, mat, u, v, y, o), top = sl.gh(-8, 0), lo = Math.min(sl.gh(-24, -12), sl.gh(-24, 12)), tm = solid(0x4a3524, .9), rf = solid(0x3a2a4a, .8), win = glowM(0xffc060, 2.4);
      const ice = new THREE.MeshStandardMaterial({ color: 0x7fc8f0, roughness: .1, transparent: true, opacity: .85, envMapIntensity: 1.8, emissive: 0x10405a, emissiveIntensity: .6 });
      P2(new THREE.BoxGeometry(22, top - lo + 10, 34), basalt, -12, 0, (top + lo - 10) / 2); P2(new THREE.BoxGeometry(24, 2.4, 37), basalt, -12, 0, top);                    // the shelf it stands on; the back of the house runs into the slope
      for (let i = 0; i < 11; i++) { const hh = 9 + (i * 5) % 14; P2(new THREE.ConeGeometry(2.2, hh, 6), ice, -22.5 + (i % 2) * 3, -16 + i * 3.2, top - 2 - hh / 2, { rx: Math.PI }); }
      P2(new THREE.BoxGeometry(28, 13, 26), tm, 2, 0, top + 7.5); M(g, gable(30, 11, 30), rf, sl.xz(2, 0)[0], top + 14, sl.xz(2, 0)[1], { ry: sl.ry + Math.PI / 2 });
      P2(new THREE.BoxGeometry(12, 9, 12), tm, -6, 13, top + 5.5); M(g, gable(14, 6, 14), rf, sl.xz(-6, 13)[0], top + 10, sl.xz(-6, 13)[1], { ry: sl.ry + Math.PI / 2 });                 // porch wing
      for (const v of [-8, -1, 6]) NS(P2(new THREE.BoxGeometry(.6, 4.4, 3.6), win, -12.2, v, top + 7)); NS(P2(new THREE.BoxGeometry(.6, 6, 3), win, -12.2, 13, top + 4.5));
      [[4, -8, 0xff5a3a], [0, 0, 0x5ae87a], [5, 8, 0x6a7aff]].forEach(([u, v, col]) => { P2(new THREE.BoxGeometry(3, 13, 3), basalt, u, v, top + 22); const p = sl.xz(u, v); chimneys.push([c[0] + p[0], sl.cy + top + 31, c[1] + p[1], col]); });
    }, { y: sl.cy, hexes: [[2, 40]], top: 76, view: 360 }); }

  // ---------- Furygale ----------
  // Ring of the DraftCoil (2,41): a ring-shaped glacier cut with glowing runes, black ruins standing round it
  { const c = hexW(2, 41), cy = heightAt(c[0], c[1]), gh = (x, z) => heightAt(c[0] + x, c[1] + z) - cy;
    addThing('Ring of the DraftCoil', '❄️', c, 1, 30, g => { const k = kit(g), iceM = new THREE.MeshStandardMaterial({ color: 0xcfe6f2, roughness: .22, envMapIntensity: 1.5 }), blackM = solid(0x121016, .5, { flatShading: true }), rune = glowM(0x6fc8ff, 3), frost = solid(0xf2f7fa, .95);
      k.T(40, 10, iceM, 0, 1, 0, { rx: Math.PI / 2, sz: .5 }); k.C(30, 30, 1, 32, new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: .05, envMapIntensity: 2 }), 0, 1.2, 0);
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; NS(k.B(3.4, .6, 5.5, rune, Math.cos(a) * 40, 6.2, Math.sin(a) * 40, { ry: -a })); }
      NS(k.S(3, rune, 0, 3, 0));
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + .3, d = 58 + (i % 3) * 5, x = Math.cos(a) * d, z = Math.sin(a) * d, hh = 12 + (i * 11) % 26; k.B(6, hh, 6, blackM, x, gh(x, z) + hh / 2 - 3, z, { ry: a, rz: i % 3 === 0 ? .5 : 0 }); if (i % 2) k.B(9, 4, 5, blackM, x + 8, gh(x + 8, z) + 1, z, { ry: a * 2 });
        if (i % 3) { k.B(7.2, 1.4, 7.2, blackM, x, gh(x, z) + hh - 2.6, z, { ry: a }); k.B(6.6, .7, 6.6, frost, x, gh(x, z) + hh - 1.6, z, { ry: a }); }                                                   // a capstone on those still standing, snow lying on it
        if (i === 1 || i === 5) { const a2 = a + .21, x2 = Math.cos(a2) * d, z2 = Math.sin(a2) * d; k.B(5, hh - 4, 5, blackM, x2, gh(x2, z2) + hh / 2 - 5, z2, { ry: a2 }); k.B(5, 3.4, 17, blackM, (x + x2) / 2, gh(x, z) + hh - 5.5, (z + z2) / 2, { ry: -(a + a2) / 2 }); } }   // two pairs still carry a lintel between them
      const iceD = new THREE.MeshStandardMaterial({ color: 0x9fc8e2, roughness: .16, envMapIntensity: 1.6, flatShading: true }), ir = mulberry32(241);
      for (let i = 0; i < 36; i++) { const a = ir() * 6.283, rr = 33 + ir() * 15, hh = 5 + ir() * 13, lean = .2 + ir() * .5; k.K(1.5 + ir() * 2.2, hh, 5, i % 3 ? iceD : iceM, Math.cos(a) * rr, 4 + hh * .4, Math.sin(a) * rr, { rz: -Math.cos(a) * lean, rx: Math.sin(a) * lean }); }   // shards standing out of the glacier
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + .2; k.S(4.2 + (i % 3), frost, Math.cos(a) * 40, 5.7, Math.sin(a) * 40, { sy: .2, sx: 1.4, ry: -a }); }                                              // snow lying along its back
      NS(k.T(32.6, .32, rune, 0, 3.4, 0, { rx: Math.PI / 2 })); NS(k.T(47.4, .32, rune, 0, 2.8, 0, { rx: Math.PI / 2 }));                                                                                        // a channel of rune-light round its inner and its outer edge,
      for (let i = 0; i < 16; i++) { const a = (i + .5) / 16 * 6.283; NS(k.B(.5, .3, 9, rune, Math.cos(a) * 40, 5.95, Math.sin(a) * 40, { ry: -a + Math.PI / 2 })); }                                              // spokes of it between the tablets,
      for (let i = 0; i < 10; i++) { const a = ir() * 6.283, L = 9 + ir() * 16; NS(k.B(L, .25, .34, rune, Math.cos(a) * (4 + L * .5), 1.85, Math.sin(a) * (4 + L * .5), { ry: -a + (ir() - .5) * .5 })); }         // and cracks of it in the black ice within
      { const coil = new THREE.Group(), pts = [], pg = []; for (let i = 0; i <= 90; i++) { const t = i / 90, an = t * 6.283 * 3.5, rr = lerp(13, 2.5, t), y = 4 + t * 36; pts.push(new THREE.Vector3(Math.cos(an) * rr, y, Math.sin(an) * rr)); pg.push(new THREE.Vector3(Math.cos(an) * (rr + 1.5), y, Math.sin(an) * (rr + 1.5))); }
        M(coil, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 150, 1.35, 7, false), iceD, 0, 0, 0); NS(M(coil, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pg), 150, .3, 5, false), rune, 0, 0, 0)); NS(M(coil, new THREE.OctahedronGeometry(2.4, 0), rune, 0, 43.5, 0));
        coil.traverse(m => { m.userData.noShadow = true; }); g.add(coil); spin.push({ o: coil, speed: .22, bolt: false }); }                                                                                    // the coil itself: a spiral of ice wound up out of the middle, a line of rune-light along it, turning
      for (let i = 0; i < 16; i++) { const a = ir() * 6.283, d2 = 52 + ir() * 22, x = Math.cos(a) * d2, z = Math.sin(a) * d2, q = 1.6 + ir() * 2.6; M(g, new THREE.DodecahedronGeometry(q, 0), blackM, x, gh(x, z) + q * .3, z, { rx: i, ry: i * 2, sy: .7 }); }   // fallen stone
    }, { y: cy, hexes: [[2, 41]], top: 56, view: 380 });
    { const fm = mist({ n: 120, seed: 77, r0: 18, r1: 54, y0: 2, y1: 16, spin: .2, rise: .05, size: 20, alpha: .11, col: [.8, .92, 1] }); fm.position.set(c[0], cy, c[1]); scene.add(fm); }                      // cold air turning slowly over it
    lanternPts.push([c[0], cy + 8, c[1], { c: [.9, 1.8, 2.8], size: 24, drift: .2, speed: .5 }]); }

  // Archive of Unfinished Spells (2,42): only its door shows - a sealed, chained gothic doorway set into the hill, lit by violet lanterns
  { const c = hexW(2, 42), hl = MOUNTS[MOUNTS.length - 2], sl = slope(c, hl.x * S - c[0], hl.z * S - c[1]);
    addThing('Archive of Unfinished Spells', '📜', c, 1, 30, g => { const P2 = (geo, mat, u, v, y, o) => sl.put(g, geo, mat, u, v, y, o), blk = solid(0x14131c, .45, { flatShading: true }), seal = glowM(0x5aa8ff, 2.8), vio = glowM(0xa070ff, 3), y0 = sl.gh(14, 0);
      for (const sd of [-1, 1]) { P2(new THREE.BoxGeometry(8, 44, 8), blk, 14, sd * 15, y0 + 16); P2(new THREE.ConeGeometry(4, 16, 4), blk, 14, sd * 15, y0 + 46, { ry: sl.ry + Math.PI / 4 }); NS(P2(new THREE.SphereGeometry(2, 8, 6), vio, 9, sd * 15, y0 + 24)); NS(P2(new THREE.SphereGeometry(2, 8, 6), vio, 9, sd * 21, y0 + 8)); sl.lamp(8, sd * 15, y0 + 24, { c: [1.6, .9, 2.8], size: 12, drift: .3, speed: .6 }); }
      M(g, gable(38, 22, 9), blk, sl.xz(14, 0)[0], y0 + 36, sl.xz(14, 0)[1], { ry: sl.ry + Math.PI / 2 });                                               // pointed arch
      P2(new THREE.BoxGeometry(3, 40, 22), solid(0x1c2238, .4), 15, 0, y0 + 18); NS(P2(new THREE.TorusGeometry(6, .7, 6, 24), seal, 13.2, 0, y0 + 22, { ry: sl.ry + Math.PI / 2 })); NS(P2(new THREE.BoxGeometry(.6, 30, .8), seal, 13.2, 0, y0 + 20));
      for (const sd of [-1, 1]) for (const yy of [10, 28]) P2(new THREE.BoxGeometry(1.4, 1.4, 30), blk, 12.4, 0, y0 + yy, { rx: sd * .5 });                // chains across the door
      for (let u = 6; u >= -18; u -= 6) P2(new THREE.BoxGeometry(6.4, 4, 26), blk, u, 0, sl.gh(u, 0) - 1);
      for (const [u, v] of [[-14, 24], [-14, -24], [-40, 16], [-40, -16]]) { const yy = sl.gh(u, v); P2(new THREE.BoxGeometry(1.8, 16, 1.8), blk, u, v, yy + 7); NS(P2(new THREE.SphereGeometry(2.4, 8, 6), vio, u, v, yy + 17)); sl.lamp(u, v, yy + 17, { c: [1.6, .9, 2.8], size: 14, drift: .3, speed: .6 }); }   // lamp posts round the court
    }, { y: sl.cy, hexes: [[2, 42]], top: 76, view: 360 });
    { const p = sl.xz(-24, 0), pl = new THREE.PointLight(0xcdbcff, 3200, 520, 1.6); pl.position.set(c[0] + p[0], sl.cy + 70, c[1] + p[1]); scene.add(pl); } }   // the hill keeps the sun off this hollow, so the Archive's own lamps light it

  // Starglass Fields (8,41): not a separate object - the obsidian ground itself, levelled and mirror-bright with constellations cracked into it (drawn by the terrain). Lightning strikes it now and then
  { const c = hexW(8, 41), cy = heightAt(c[0], c[1]);
    addThing('Starglass Fields', '✨', c, 1, 30, g => {}, { y: cy, hexes: [[8, 41]], top: 40, view: 420 });
    const tg = []; for (let i = 0; i < 16; i++) { const a = i * 2.39996, d = 8 + (i * 13) % 70; tg.push([c[0] + Math.cos(a) * d, cy + 1, c[1] + Math.sin(a) * d]); } lightning(tg, 6.5, 1.3); }

  // Theo's workshop (2,46): a golden clockwork fortress - gears turning on its towers and walls, brass domes, and an automaton on watch
  { const c = hexW(2, 46), cy = heightAt(c[0], c[1]), turrets = [];
    addThing("Theo's Workshop", '⚙️', c, 1, 30, g => { const k = kit(g), brass = new THREE.MeshStandardMaterial({ color: 0xc89a3a, roughness: .32, metalness: .75 }), dark = new THREE.MeshStandardMaterial({ color: 0x6a4a1c, roughness: .45, metalness: .6 }), lit = glowM(0xffd070, 2.6);
      k.C(46, 50, 5, 8, dark, 0, 1, 0); k.B(34, 30, 34, brass, 0, 18, 0); k.B(37, 3, 37, dark, 0, 34, 0); k.C(15, 17, 12, 12, brass, 0, 41, 0); k.D(15, brass, 0, 47, 0); k.C(2, 2.6, 16, 8, dark, 0, 68, 0);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 30, z = Math.sin(a) * 30; k.C(7.5, 8.5, 44, 10, brass, x, 22, z); k.C(9, 9, 2, 10, dark, x, 45, z); const gw = M(g, gearGeo(11, 12, 3), dark, x, 49, z); NS(gw); spin.push({ o: gw, speed: i % 2 ? .7 : -.7, bolt: false }); k.D(5, brass, x, 51, z);
        const b = i * Math.PI / 2, hx = Math.cos(b) * 17.6, hz = Math.sin(b) * 17.6, hold = new THREE.Group(); hold.position.set(hx, 19, hz); hold.rotation.set(0, -b, Math.PI / 2); g.add(hold);      // a great gear turning on each wall
        const g1 = M(hold, gearGeo(12, 14, 2.4), dark, 0, 0, 0), g2 = M(hold, gearGeo(6, 9, 2.4), brass, 0, 1.2, 15.4); NS(g1); NS(g2); spin.push({ o: g1, speed: .5, bolt: false }, { o: g2, speed: -1, bolt: false });
        NS(k.B(.6, 6, 4, lit, Math.cos(b) * 17.3 - Math.sin(b) * 10, 28, Math.sin(b) * 17.3 + Math.cos(b) * 10, { ry: -b })); }
      const big = M(g, gearGeo(24, 20, 2.6), dark, 0, 36.4, 0); NS(big); spin.push({ o: big, speed: .18, bolt: false });
      k.B(5, 9, 4, dark, 40, 8, 0); k.B(3.4, 3.4, 3.4, brass, 40, 14.4, 0); k.C(.4, .4, 18, 6, brass, 43.5, 10, 0);                                         // the automaton sentinel
      // more to look at: riveted bands round the block, lit slits up the towers, pipes from the towers into the dome, a walk between the towers, rings and a lamp on the mast, tanks and steps at the foot
      const pipe = (p, q, r, m) => { const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = d.length(), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 7), m); o.position.set((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(o); return o; };
      for (const y of [6.5, 31.4]) { k.B(35.2, 1.3, 35.2, dark, 0, y, 0); for (let q = 0; q < 28; q++) { const sd = q % 4, u = -15 + Math.floor(q / 4) * 5; k.S(.5, brass, sd < 2 ? u : (sd === 2 ? 17.7 : -17.7), y, sd < 2 ? (sd ? 17.7 : -17.7) : u); } }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 30, z = Math.sin(a) * 30, a2 = a + Math.PI / 2, x2 = Math.cos(a2) * 30, z2 = Math.sin(a2) * 30;
        for (const y of [11, 29]) k.C(8.2, 8.2, 1.2, 10, dark, x, y, z); for (let q = 0; q < 6; q++) { const wa = a + (q % 3 - 1) * .75; NS(k.B(.5, 3.4, 1.3, lit, x + Math.cos(wa) * 7.95, 15 + q * 4.6, z + Math.sin(wa) * 7.95, { ry: -wa })); }
        for (let q = 0; q < 8; q++) { const ca = q * .785; k.B(2.2, 2, 1.2, dark, x + Math.cos(ca) * 8.6, 47, z + Math.sin(ca) * 8.6, { ry: -ca + Math.PI / 2 }); }                                                    // battlements round each tower's head
        pipe([x * .86, 40, z * .86], [x * .5, 44, z * .5], .9, brass); pipe([x * .86, 40, z * .86], [x * .86, 46, z * .86], .9, brass); pipe([x * .74, 24, z * .74], [x * .74, 34.5, z * .74], .7, dark);
        k.B(27, .8, 3.6, dark, (x + x2) / 2, 38.4, (z + z2) / 2, { ry: -a + Math.PI / 4 }); for (let q = 0; q <= 6; q++) { const u = q / 6; k.B(.3, 2.6, .3, brass, lerp(x, x2, .2 + u * .6) + Math.cos(a + Math.PI / 4) * 1.6, 40, lerp(z, z2, .2 + u * .6) + Math.sin(a + Math.PI / 4) * 1.6); }
        const hd = new THREE.Group(); hd.position.set(x + Math.cos(a) * 8.6, 34, z + Math.sin(a) * 8.6); hd.rotation.set(0, -a, Math.PI / 2); g.add(hd); const gs = M(hd, gearGeo(3.4, 8, 1), brass, 0, 0, 0); NS(gs); spin.push({ o: gs, speed: i % 2 ? 1.6 : -1.6, bolt: false }); }
      for (const y of [62, 66.5, 71]) k.T(4.2 - (y - 62) * .2, .35, brass, 0, y, 0, { rx: Math.PI / 2 }); NS(k.S(1.9, lit, 0, 77.4, 0)); k.C(.5, .5, 3, 6, dark, 0, 79.6, 0);
      for (const sz of [-1, 1]) { k.C(4.4, 4.4, 12, 12, brass, -36, 7.4, sz * 14, { rx: Math.PI / 2 }); for (const e of [-1, 1]) k.S(4.4, brass, -36, 7.4, sz * 14 + e * 6, { sz: .5 }); for (const e of [-3.4, 0, 3.4]) k.T(4.5, .3, dark, -36, 7.4, sz * 14 + e); k.B(1, 3, 10, dark, -36, 2.4, sz * 14); pipe([-36, 11.8, sz * 14], [-36, 15, sz * 14], .6, dark); pipe([-36, 15, sz * 14], [-17.5, 15, sz * 12], .6, dark); }
      for (let q = 0; q < 5; q++) k.B(16 - q * 1.2, 1, 3, dark, 0, .5 + q, 52 - q * 2.6);
      // a gun turret out on a bracket from each wall: a drum that swings round and a barrel that lifts. Every so often each lobs a firework shell at the ground round the workshop
      for (let i = 0; i < 4; i++) { const b = i * Math.PI / 2, ux = Math.cos(b), uz = Math.sin(b), px = ux * 27, pz = uz * 27;
        k.B(13, 1.4, 13, dark, px, 29.3, pz, { ry: -b }); k.T(5.4, .4, brass, px, 30.1, pz, { rx: Math.PI / 2 }); for (const sd of [-1, 1]) k.B(11, 1, 1, dark, ux * 22.4 - uz * sd * 5, 25.2, uz * 22.4 + ux * sd * 5, { ry: -b, rz: .72 });
        const tur = new THREE.Group(), gun = new THREE.Group(); tur.position.set(px, 30, pz); tur.rotation.y = -b; gun.position.set(0, 4.4, 0); tur.add(gun); g.add(tur);
        NS(M(tur, new THREE.CylinderGeometry(4.6, 5.2, 2, 12), dark, 0, 1, 0)); NS(M(tur, new THREE.SphereGeometry(4.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0, 2, 0)); NS(M(tur, new THREE.BoxGeometry(2.4, 3, 6.6), dark, -2.6, 3.4, 0));
        NS(M(gun, new THREE.BoxGeometry(4.4, 3.2, 3.6), brass, 0, 0, 0)); NS(M(gun, new THREE.CylinderGeometry(1.15, 1.6, 12, 10), dark, 7, 0, 0, { rz: -Math.PI / 2 })); NS(M(gun, new THREE.CylinderGeometry(1.9, 1.9, 1.5, 10), brass, 12.6, 0, 0, { rz: -Math.PI / 2 })); NS(M(gun, new THREE.CylinderGeometry(1.5, 1.5, 1, 10), brass, 5, 0, 0, { rz: -Math.PI / 2 }));
        NS(M(gun, new THREE.CylinderGeometry(1.7, 1.7, 2.6, 10), dark, -.4, 0, 2.6, { rx: Math.PI / 2 })); NS(M(gun, new THREE.BoxGeometry(.5, 1.6, .5), lit, 2, 2, 0));
        turrets.push({ tur, gun, b, x: c[0] + px, y: cy + 34.4, z: c[1] + pz }); }
    }, { y: cy, hexes: [[2, 46]], top: 90, view: 400 }); chimneys.push([c[0], cy + 80, c[1], 0xe8e2d2]); lanternPts.push([c[0], cy + 77.4, c[1], { c: [2.6, 1.8, .7], size: 12, drift: 0, speed: .8 }]);
    // the turrets at work: each swings idly, then picks a spot on the ground on its own side, lays on it, and lobs a shell that bursts there in a shower of one bright colour
    { const PAL = [0xff4fa0, 0x4fd8ff, 0xffd24a, 0x8cff5a, 0xff7a30, 0xb47aff, 0xff4a4a], tr = mulberry32(246), N = 140;
      const bursts = [0, 1, 2, 3].map(() => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); const pt = new THREE.Points(ge, new THREE.PointsMaterial({ size: 13, map: moteTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); for (const o of [pt, fl]) { o.frustumCulled = false; o.visible = false; o.raycast = () => {}; scene.add(o); } return { pt, fl, vel: new Float32Array(N * 3), t: 0, on: false }; });
      const shells = turrets.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); m.visible = false; m.frustumCulled = false; m.raycast = () => {}; scene.add(m); return m; });
      turrets.forEach((T, i) => { T.next = 4 + i * 2.3 + tr() * 4; T.state = 0; T.phi = T.b; T.pitch = .25; T.kick = 0; });
      const boom = (x, y, z, col) => { const B = bursts.find(q => !q.on) || bursts[0], p = B.pt.geometry.attributes.position.array;
        for (let q = 0; q < N; q++) { const a = tr() * 6.283, e = tr() * 1.45, sp = 20 + 54 * tr(); p[q * 3] = x; p[q * 3 + 1] = y + 1; p[q * 3 + 2] = z; B.vel[q * 3] = Math.cos(a) * Math.cos(e) * sp; B.vel[q * 3 + 1] = Math.sin(e) * sp * 1.1 + 6; B.vel[q * 3 + 2] = Math.sin(a) * Math.cos(e) * sp; }
        B.pt.material.color.setHex(col); B.fl.material.color.setHex(col); B.fl.position.set(x, y + 2, z); B.t = 0; B.on = true; B.pt.visible = B.fl.visible = true; };
      anim.push((t, dt) => {
        turrets.forEach((T, i) => { const sh = shells[i], k = Math.min(1, dt * 4);
          if (T.state === 0) { T.phi += (T.b + Math.sin(t * .3 + i * 1.7) * .8 - T.phi) * Math.min(1, dt * 1.5); T.pitch += (.2 - T.pitch) * k;
            if (t > T.next) { const a = T.b + (tr() - .5) * 1.8, d = 64 + 80 * tr(); T.tx = c[0] + Math.cos(a) * d; T.tz = c[1] + Math.sin(a) * d; T.ty = Math.max(heightAt(T.tx, T.tz), 0); T.aim = Math.atan2(T.tz - T.z, T.tx - T.x); if (T.aim - T.b > Math.PI) T.aim -= 6.2832; if (T.aim - T.b < -Math.PI) T.aim += 6.2832; T.col = PAL[Math.floor(tr() * PAL.length)]; T.state = 1; T.t0 = t; } }
          else if (T.state === 1) { T.phi += (T.aim - T.phi) * k; T.pitch += (.8 - T.pitch) * k;                                             // laying the gun
            if (t - T.t0 > 1) { const cp = Math.cos(T.pitch); T.mx = T.x + Math.cos(T.phi) * cp * 13; T.my = T.y + Math.sin(T.pitch) * 13; T.mz = T.z + Math.sin(T.phi) * cp * 13; const d = Math.hypot(T.tx - T.mx, T.tz - T.mz); T.fly = .9 + d / 170; T.arc = 16 + d * .16; sh.material.color.setHex(T.col); sh.visible = true; T.kick = 1; T.state = 2; T.t0 = t; } }
          else { const f = (t - T.t0) / T.fly; if (f >= 1) { sh.visible = false; boom(T.tx, T.ty, T.tz, T.col); T.state = 0; T.next = t + 5 + 7 * tr(); } else sh.position.set(lerp(T.mx, T.tx, f), lerp(T.my, T.ty, f) + T.arc * 4 * f * (1 - f), lerp(T.mz, T.tz, f)); }
          T.kick = Math.max(0, T.kick - dt * 3); T.tur.rotation.y = -T.phi; T.gun.rotation.z = T.pitch; T.gun.position.x = -T.kick * 1.4; });
        for (const B of bursts) { if (!B.on) continue; B.t += dt; if (B.t > 2) { B.on = false; B.pt.visible = B.fl.visible = false; continue; }
          const p = B.pt.geometry.attributes.position.array, drag = Math.exp(-1.6 * dt); for (let q = 0; q < N * 3; q += 3) { B.vel[q] *= drag; B.vel[q + 1] = B.vel[q + 1] * drag - 26 * dt; B.vel[q + 2] *= drag; p[q] += B.vel[q] * dt; p[q + 1] += B.vel[q + 1] * dt; p[q + 2] += B.vel[q + 2] * dt; }
          B.pt.geometry.attributes.position.needsUpdate = true; const f = B.t / 2; B.pt.material.opacity = Math.pow(1 - f, 1.5); B.pt.material.size = 13 * (1 - .5 * f); B.fl.scale.setScalar(3 + 38 * Math.min(B.t / .25, 1)); B.fl.material.opacity = .7 * Math.max(1 - B.t / .3, 0); B.fl.visible = B.t < .3; } }); } }

  // ---------- the south-west: the great mountain, the raised corner and the river that climbs it ----------
  // the run-off from the Rainspires: three streams that follow gullies cut down the mountain and pour into the river, with spray where they land
  { const strM = flowMat('#5b9cc6', '#ffffff', 0x1a425e, .9, 1.1);
    STREAMS.forEach((p, si) => { const a = p.pts, n = a.length / 2, C = [];
      for (let i = 0; i < n - 1; i++) for (let q = 0; q < 3; q++) C.push([lerp(a[2 * i], a[2 * i + 2], q / 3) * S, lerp(a[2 * i + 1], a[2 * i + 3], q / 3) * S]);
      const pos = [], uv = [], idx = []; let len = 0, end = C[C.length - 1];
      for (let i = 0; i < C.length; i++) { const pt = C[i], nb = C[Math.min(i + 1, C.length - 1)], pv = C[Math.max(i - 1, 0)], tx = nb[0] - pv[0], tz = nb[1] - pv[1], tl = Math.hypot(tx, tz) || 1, hw = 3 + 5 * i / C.length, nx = -tz / tl * hw, nz = tx / tl * hw, hc = heightAt(pt[0], pt[1]);
        if (i) len += Math.hypot(pt[0] - pv[0], pt[1] - pv[1], hc - heightAt(pv[0], pv[1]));
        const y = hc + 1.5; pos.push(pt[0] - nx, Math.max(y, heightAt(pt[0] - nx, pt[1] - nz) + .6), pt[1] - nz, pt[0] + nx, Math.max(y, heightAt(pt[0] + nx, pt[1] + nz) + .6), pt[1] + nz); uv.push(0, len / 120, 1, len / 120);
        if (i) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
        if (hc < -1) { end = pt; break; } }                                                                                                  // it has reached the river
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals();
      const m = new THREE.Mesh(ge, strM); m.raycast = () => {}; m.receiveShadow = true; scene.add(m);
      const sp2 = mist({ n: 70, seed: 5 + si, r0: 5, r1: 28, y0: 2, y1: 50, spin: .25, rise: .22, size: 28, alpha: .22 }); sp2.position.set(end[0], 0, end[1]); scene.add(sp2); }); }

  // Rainspires (2,48): five dark spires rooted in the summit of the great mountain, under a standing storm. Rain runs down their sides and gathers into the streams above
  { const c = hexW(2, 48), pkW = [MOUNTS[3].x * S, MOUNTS[3].z * S], cy = heightAt(c[0], c[1]), tips = [];
    const spTex = canvasTex(128, 256, (cx, w, hgt) => { const r = mulberry32(91); cx.fillStyle = '#262b3c'; cx.fillRect(0, 0, w, hgt);
        for (let i = 0; i < 240; i++) { cx.fillStyle = r() < .55 ? '#0e1018' : '#4d5670'; cx.globalAlpha = .12 + .3 * r(); cx.fillRect(r() * w, r() * hgt, 1 + r() * 2.5, 12 + r() * 70); }      // weathered, rain-streaked stone
        for (let i = 0; i < 14; i++) { cx.fillStyle = '#0a0b10'; cx.globalAlpha = .5; cx.fillRect(0, r() * hgt, w, 1 + r() * 2); } cx.globalAlpha = 1; }, 3, 1);
    const veinTex = canvasTex(128, 256, (cx, w, hgt) => { const r = mulberry32(17); cx.fillStyle = '#000'; cx.fillRect(0, 0, w, hgt); cx.strokeStyle = '#9fd0ff'; cx.lineWidth = 1.6;
        for (let i = 0; i < 7; i++) { let x = r() * w, y = 0; cx.globalAlpha = .5 + .5 * r(); cx.beginPath(); cx.moveTo(x, y); while (y < hgt) { x += (r() - .5) * 14; y += 8 + r() * 18; cx.lineTo(x, y); } cx.stroke(); } cx.globalAlpha = 1; }, 3, 1);
    const sp = new THREE.MeshStandardMaterial({ map: spTex, roughness: .38, metalness: .1, flatShading: true, emissive: 0x6fb8ff, emissiveMap: veinTex, emissiveIntensity: .8 });
    // a spire: seven-sided and slightly twisted, with a root that flares wide and runs on down into the rock, so the mountain closes round it wherever the ground happens to be
    const spireG = (hh, r, seed) => { const rr = mulberry32(seed), N = 7, rows = [[-90, 3.4], [-40, 2.5], [-8, 1.75], [10, 1.25], [26, 1], [hh * .3, .78], [hh * .55, .5], [hh * .78, .26], [hh * .93, .09], [hh, .004]], pos = [], uv = [], idx = [], jit = Array.from({ length: N }, () => .82 + .36 * rr());
      rows.forEach(([y, f], j) => { const jr = jit.map(v => v * (j > 4 ? 1 : .9 + .2 * rr())); for (let q = 0; q <= N; q++) { const a = q / N * 6.283 + y * .0035, w = jr[q % N]; pos.push(Math.cos(a) * r * f * w, y, Math.sin(a) * r * f * w); uv.push(q / N, y / 110); } });
      for (let j = 0; j < rows.length - 1; j++) for (let q = 0; q < N; q++) { const a = j * (N + 1) + q, b = a + 1, d = a + N + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals(); return ge; };
    addThing('Rainspires', '⛈️', c, 1, 30, g => { const k = kit(g), tipM = glowM(0x8fc8ff, 3), run = flowMat('#4a8fbe', '#eaf7ff', 0x1c4a6e, .5, -.6);
      [[0, 0, 260, 17], [-34, 12, 185, 13], [30, 18, 175, 12], [-16, -34, 150, 11], [26, -26, 135, 10]].forEach(([dx, dz, hh, r], i) => { const wx = pkW[0] + dx, wz = pkW[1] + dz, x = wx - c[0], z = wz - c[1]; let lo = heightAt(wx, wz);
        for (let j = 0; j < 6; j++) lo = Math.min(lo, heightAt(wx + Math.cos(j * 1.047) * r * 1.3, wz + Math.sin(j * 1.047) * r * 1.3)); const y = lo - cy + 4;
        M(g, spireG(hh, r, 40 + i * 13), sp, x, y, z, { ry: i * 1.3 });
        NS(k.K(r * .1, hh * .1, 6, tipM, x, y + hh * .97, z)); for (const [f, q] of [[.55, .5], [.7, .34], [.82, .22]]) NS(k.T(r * q + 1.2, .6, tipM, x, y + hh * f, z, { rx: Math.PI / 2 }));
        for (let j = 0; j < 4; j++) { const a = i + j * 1.57 + .5, d = r * 1.9, sx2 = wx + Math.cos(a) * d, sz2 = wz + Math.sin(a) * d, hs = hh * (.16 + .05 * (j % 3)); M(g, new THREE.ConeGeometry(r * .5, hs * 2, 5), sp, sx2 - c[0], heightAt(sx2, sz2) - cy + hs * .45, sz2 - c[1], { rx: Math.sin(a) * .3, rz: -Math.cos(a) * .3 }); }   // shards leaning out round the foot
        for (let j = 0; j < (i < 3 ? 3 : 2); j++) NS(M(g, new THREE.CylinderGeometry(r * .62, r * 1.22, hh * .55 - 26, 3, 1, true, j * 2.2 + i, .3), run, x, y + (hh * .55 + 26) / 2, z));   // rain running down the spire
        tips.push([wx, cy + y + hh, wz]); });
    }, { y: cy, hexes: [[2, 48]], top: 340, view: 760 });
    lightning(tips, 4.2, .7, 420);
    // the storm that sits on the spires
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.6, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const ct = new THREE.CanvasTexture(cv); for (let i = 0; i < 22; i++) { const a = i * 2.39996, d = 20 + (i * 37) % 190, spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, color: i % 3 ? 0x2c303a : 0x424854, transparent: true, opacity: .8, depthWrite: false, fog: false }));
      spr.position.set(pkW[0] + Math.cos(a) * d, cy + 420 + (i % 4) * 22, pkW[1] + Math.sin(a) * d * .8); spr.scale.set(230 + (i % 5) * 40, 120 + (i % 3) * 30, 1); scene.add(spr); } }

  // Zephyr Columns (1,50): floating islands crowned with weathered, fluted columns and overgrown with shrubs and hanging vines. Thin falls spill off them and blow away to mist, and mist wheels slowly round the whole cluster
  { const c = hexW(1, 50), cy = heightAt(c[0], c[1]);
    addThing('Zephyr Columns', '🌬️', c, 1, 30, g => { const r0 = mulberry32(150);
      const rock = new THREE.MeshStandardMaterial({ map: stoneTex('#5a544c', '#2e2a26', '#8a8274', 0, 2, 2), roughness: .95, flatShading: true }), grass = solid(0x27481f, 1);
      const colM = new THREE.MeshStandardMaterial({ map: stoneTex('#8d8676', '#4f4a40', '#b9b2a0', 10, 1, 1), roughness: .8 }), trimM = new THREE.MeshStandardMaterial({ map: stoneTex('#857e6e', '#4a453c', '#aaa392', 0, 1, 1), roughness: .85 });
      const leaf = [solid(0x2f5d2a, 1, { flatShading: true }), solid(0x3f7434, 1, { flatShading: true }), solid(0x1f4426, 1, { flatShading: true })], bark = solid(0x4a3626, .9), bloom = solid(0xe8e2c0, .7), wa = waterGlass(0x7fc4e0, .8);
      const fall = fallMat('#8fc4e6', '#ffffff', 0x3a6a8a, .85, -.7);
      // a fluted column on a moulded base, with a scrolled capital - or snapped off short
      const column = (grp, x, y, z, R, H, broken) => { M(grp, new THREE.BoxGeometry(R * 3, R * .5, R * 3), trimM, x, y + R * .25, z); M(grp, new THREE.TorusGeometry(R * 1.12, R * .22, 6, 16), trimM, x, y + R * .62, z, { rx: Math.PI / 2 });
        M(grp, new THREE.CylinderGeometry(R * .84, R, H, 14), colM, x, y + R * .7 + H / 2, z, { ry: x });
        if (broken) { M(grp, new THREE.CylinderGeometry(R * .45, R * .84, R * .9, 7), colM, x, y + R * .7 + H + R * .3, z, { rz: .25, ry: z }); return; }
        const t = y + R * .7 + H; M(grp, new THREE.TorusGeometry(R * .92, R * .2, 6, 16), trimM, x, t + R * .1, z, { rx: Math.PI / 2 }); M(grp, new THREE.CylinderGeometry(R * 1.25, R * .9, R * .5, 14), trimM, x, t + R * .5, z); M(grp, new THREE.BoxGeometry(R * 2.9, R * .42, R * 2.9), trimM, x, t + R * .95, z);
        for (const sd of [-1, 1]) M(grp, new THREE.CylinderGeometry(R * .42, R * .42, R * 2.7, 10), trimM, x + sd * R * 1.3, t + R * .5, z, { rx: Math.PI / 2 }); };
      [[0, 270, 0, 36, 0], [-44, 222, 36, 23, 1.2], [44, 240, -30, 25, 2.4], [10, 196, 54, 17, 3.5], [-30, 300, -46, 13, 4.4], [58, 190, 30, 11, 5.2]].forEach(([x, y, z, r, ph], ii) => { const isl = new THREE.Group(); isl.position.set(x, y, z);
        const top = d => 1.5 - .07 * r + .193 * r * Math.sqrt(Math.max(0, 1 - Math.pow(d / (1.073 * r), 2)));                                         // height of the turf at a distance from the middle
        // the rock: a ragged inverted peak, smaller teeth hanging beside it, and a broken rim
        M(isl, new THREE.ConeGeometry(r, r * 1.7, 8), rock, 0, -r * .85, 0, { rx: Math.PI, ry: ph });
        for (let j = 0; j < 5; j++) { const a = j * 1.257 + ph, d = r * (.45 + .25 * r0()), rr = r * (.28 + .2 * r0()); M(isl, new THREE.ConeGeometry(rr, rr * (2.2 + 2 * r0()), 6), rock, Math.cos(a) * d, -rr * 1.3, Math.sin(a) * d, { rx: Math.PI, ry: j }); }
        for (let j = 0; j < 7; j++) { const a = j * .9 + ph; M(isl, new THREE.DodecahedronGeometry(r * (.16 + .1 * r0()), 0), rock, Math.cos(a) * r * .93, -r * .08, Math.sin(a) * r * .93, { rx: j, ry: j * 2 }); }
        M(isl, new THREE.CylinderGeometry(r, r * .96, 3, 12), rock, 0, .2, 0); M(isl, new THREE.SphereGeometry(r * 1.073, 14, 5, 0, 6.283, 0, 1.2), grass, 0, 1.5 - r * .07, 0, { sy: .18 });
        // columns, and lengths of architrave still spanning some of them
        const cols = [[6, 2.7, 30], [2, 2.2, 24], [3, 2.3, 26], [1, 2, 22], [1, 1.7, 15], [0, 0, 0]][ii], nC = cols[0], R = cols[1], tops = [];
        for (let j = 0; j < nC; j++) { const a = j / Math.max(nC, 1) * 6.283 + ph + .4, d = nC > 1 ? r * .56 : 0, px = Math.cos(a) * d, pz = Math.sin(a) * d, brk = (ii === 0 && (j === 2 || j === 4)) || (ii === 1 && j === 1) || ii === 4, H = brk ? cols[2] * (.35 + .3 * r0()) : cols[2];
          column(isl, px, top(d) - .6, pz, R, H, brk); if (!brk) tops.push([px, top(d) - .6 + R * .7 + H + R * 1.16, pz]); }
        for (let j = 0; j + 1 < tops.length; j += (ii ? 1 : 2)) { const A = tops[j], B = tops[j + 1], L = Math.hypot(B[0] - A[0], B[2] - A[2]); if (L > r * 1.05) continue; M(isl, new THREE.BoxGeometry(L + R * 2.6, R * 1.1, R * 2.2), trimM, (A[0] + B[0]) / 2, A[1] + R * .55, (A[2] + B[2]) / 2, { ry: -Math.atan2(B[2] - A[2], B[0] - A[0]) }); }
        if (!ii) M(isl, new THREE.CylinderGeometry(2.4, 2.6, 16, 14), colM, r * .2, top(r * .36) + 2.2, -r * .3, { rz: Math.PI / 2, ry: .7 });                 // a fallen drum
        // shrubs, a tree or two, and vines trailing over the edge
        const nB = Math.round(4 + r * .32); for (let j = 0; j < nB; j++) { const a = j * 2.39996 + ph, d = r * (.25 + .7 * r0()), bx = Math.cos(a) * d, bz = Math.sin(a) * d, sz = r * .05 + 1.6 + 1.8 * r0(), by = top(d);
          for (let q = 0; q < 3; q++) M(isl, new THREE.IcosahedronGeometry(sz * (1 - q * .22), 0), leaf[(j + q) % 3], bx + (q - 1) * sz * .7, by + sz * (.45 + q * .3), bz + (q % 2 ? .6 : -.4) * sz, { ry: j + q, sy: .8 });
          if (!ii && j % 3 === 0) M(isl, new THREE.SphereGeometry(.6, 5, 4), bloom, bx + sz * .5, by + sz * 1.3, bz); }
        if (ii < 3) for (let j = 0; j < (ii ? 1 : 2); j++) { const a = ph + 2.6 + j * 2.9, d = r * .78, tx = Math.cos(a) * d, tz = Math.sin(a) * d, ty = top(d), th = 9 + 4 * r0(); M(isl, new THREE.CylinderGeometry(.5, .9, th, 5), bark, tx, ty + th / 2, tz, { rz: .15 });
          for (let q = 0; q < 3; q++) M(isl, new THREE.IcosahedronGeometry(4.2 - q * .8, 0), leaf[q], tx + (q - 1) * 2.4, ty + th + q * 1.6, tz + (q % 2) * 2, { ry: q }); }
        for (let j = 0; j < Math.round(r * .5); j++) { const a = j * 1.9 + ph, L = r * (.25 + .6 * r0()); M(isl, new THREE.BoxGeometry(.5 + r0(), L, .5), leaf[2], Math.cos(a) * r, 1 - L / 2, Math.sin(a) * r, { ry: -a }); if (j % 2) M(isl, new THREE.IcosahedronGeometry(1.1, 0), leaf[j % 3], Math.cos(a) * r, 1 - L, Math.sin(a) * r); }
        // a spring, a rill running to the edge, and a fall that thins away into mist before it reaches the ground
        if (ii < 4) { const a = ph + 1.2, ca = Math.cos(a), sa = Math.sin(a), fx = ca * r * 1.02, fz = sa * r * 1.02, L = r * 2.6 + 30;
          M(isl, new THREE.CylinderGeometry(r * .13, r * .13, .5, 12), wa, ca * r * .4, top(r * .4) + .2, sa * r * .4); M(isl, new THREE.BoxGeometry(r * .66, .5, r * .07 + 1.2), wa, ca * r * .71, (top(r * .4) + 1.5) / 2 + .2, sa * r * .71, { ry: -a, rz: -Math.atan((top(r * .4) - 1.5) / (r * .62)) });
          const fm = M(isl, new THREE.CylinderGeometry(r * .07 + .8, r * .16 + 2, L, 5, 6, true, Math.PI / 2 - a - .9, 1.8), fall, fx, 1 - L / 2, fz); fm.userData.noShadow = true;
          const fmist = mist({ n: 40, seed: 20 + ii, r0: 2, r1: r * .5 + 9, y0: 1 - L * .5, y1: 1 - L * 1.3, spin: .3, rise: .16, pow: 1.4, size: 16 + r * .3, alpha: .22 }); fmist.position.set(fx, 0, fz); isl.add(fmist); }
        mergeKids(isl); g.add(isl); anim.push(t => { isl.position.y = y + Math.sin(t * .4 + ph) * 5; }); });
      g.add(mist({ n: 260, seed: 31, arms: 3, r0: 64, r1: 98, y0: 168, y1: 340, spin: .22, rise: .035, twist: 5.5, size: 19, alpha: .12 }));                         // three broad bands of mist winding up round the cluster
      g.add(mist({ n: 120, seed: 32, r0: 30, r1: 125, y0: 176, y1: 214, spin: -.12, rise: 0, size: 30, alpha: .07 }));                                             // a slow skirt of cloud beneath the islands
      g.add(mist({ n: 150, seed: 33, arms: 5, r0: 40, r1: 80, y0: 190, y1: 332, spin: .9, rise: .12, twist: 3, size: 3.5, alpha: .55, col: [.95, .97, 1] }));             // quick bright flecks: the wind itself
    }, { y: cy, hexes: [[1, 50]], top: 350, view: 560 }); }

  // Tidal Bell Mouths (six hexes along the river): hollow bell-shaped mouths of rock bound in double copper rings, set half under the water so the river runs on into them
  { const HX = [[4, 47], [5, 47], [6, 46], [6, 47], [6, 48], [7, 46]], P = BELLS.map(b => [b.x * S, b.z * S]), cen = [P.reduce((a, p) => a + p[0], 0) / 6, P.reduce((a, p) => a + p[1], 0) / 6];
    const V2 = a => a.map(p => new THREE.Vector2(p[0], p[1]));
    addThing('Tidal Bell Mouths', '🔔', cen, 1, 30, g => { const rock = solid(0x3a3340, .95, { flatShading: true }), inner = glowM(0x2ad8c8, 1.8), throat = new THREE.MeshStandardMaterial({ color: 0x0b1c20, roughness: .85, side: THREE.DoubleSide, emissive: 0x0c5a56, emissiveIntensity: .3 });
      const shell = new THREE.LatheGeometry(V2([[.2, -66], [16, -58], [27, -44], [31, -25], [27.5, -10], [22, -2], [20, 1.5]]), 9), bore = new THREE.LatheGeometry(V2([[19.5, 1.5], [17.4, -3], [14.6, -12], [10.5, -26], [6.5, -42], [.2, -50]]), 20);
      BELLS.forEach((b, i) => { const ux = b.ux, uz = b.uz, x = P[i][0] - cen[0], z = P[i][1] - cen[1], ry = -Math.atan2(uz, ux), at = d => [x + ux * d, z + uz * d], o = { rz: -Math.PI / 2, ry };
        M(g, shell, rock, x, 0, z, { ...o, sx: 1.02 + .08 * Math.sin(i * 2.3), sz: 1.05 + .12 * Math.cos(i * 1.7) });                                             // the rock bell, its back buried in the bank
        M(g, bore, throat, x, 0, z, o);                                                                                                                      // the hollow running back into it
        for (const [d, Rr, t] of [[1.5, 20, 2.9], [-6, 16.4, 1.7]]) { const p = at(d); M(g, new THREE.TorusGeometry(Rr, t, 8, 30), copper, p[0], 0, p[1], { ry: ry + Math.PI / 2 }); }   // two copper rings, the inner one set back inside the mouth
        for (const [d, Rr] of [[-20, 11.6], [-36, 7.2]]) { const p = at(d); NS(M(g, new THREE.TorusGeometry(Rr, .7, 5, 24), inner, p[0], 0, p[1], { ry: ry + Math.PI / 2 })); }
        for (let j = 0; j < 4; j++) { const sd = j % 2 ? 1 : -1, p = at(-8 - (j >> 1) * 22); M(g, new THREE.DodecahedronGeometry(9 + j * 2, 0), rock, p[0] - uz * sd * (27 + j), 2, p[1] + ux * sd * (27 + j), { rx: j, ry: i }); }   // boulders bedding it into the bank
        const lp = at(-16); lanternPts.push([cen[0] + lp[0], 3, cen[1] + lp[1], { c: [.4, 1.9, 1.7], size: 15, drift: .3, speed: .7 }]); });
    }, { y: 0, hexes: HX, top: 44, view: 620 }); }

  // Penta Falls (3,53): the river does not fall here - it climbs. Five streams (water, ice, steam, mud, lightning) fan out at the foot, run UP the escarpment bouncing from ledge to ledge,
  // and draw together at the lip into one river. Droplets stream up with them
  { const c = hexW(3, 53), H = (PLAT_Y - 4) * S, F = [CLIFF[0] * S, CLIFF[1] * S], nx = CLIFF[2], nz = CLIFF[3], tx = -nz, tz = nx;
    const ribbon = (pts, w) => { const pos = [], uv = [], idx = [], NR = 8, T = new THREE.Vector3(), Nn = new THREE.Vector3(), Sd = new THREE.Vector3(tx, 0, tz); let len = 0;   // a stream: a tube, wider than it is deep, tapering as it climbs
      pts.forEach((p, i) => { if (i) len += p.distanceTo(pts[i - 1]); const ww = w * (1 - .45 * i / (pts.length - 1)) * .5, th = ww * .6; T.copy(pts[Math.min(i + 1, pts.length - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize(); Nn.crossVectors(T, Sd).normalize();
        for (let q = 0; q <= NR; q++) { const a = q / NR * 6.283, cs = Math.cos(a) * ww, sn = Math.sin(a) * th; pos.push(p.x + Sd.x * cs + Nn.x * sn, p.y + Nn.y * sn, p.z + Sd.z * cs + Nn.z * sn); uv.push(q / NR * 2, len / 70); }
        if (i) { const a0 = (i - 1) * (NR + 1), b0 = i * (NR + 1); for (let q = 0; q < NR; q++) idx.push(a0 + q, a0 + q + 1, b0 + q, a0 + q + 1, b0 + q + 1, b0 + q); } });
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals(); return ge; };
    const W3 = (sOut, a, y) => new THREE.Vector3(F[0] + nx * sOut + tx * a, y, F[1] + nz * sOut + tz * a);
    const dS = [], dE = [], dC = [], dP = [], COLS = [[.5, 1.3, 2.6], [1.8, 2.3, 2.6], [2.2, 2.2, 2.2], [1.1, .8, .45], [2.2, 1.4, 3.2]];
    addThing('Penta Falls', '🌊', c, 1, 30, g => { const rock = solid(0x2c2733, .95, { flatShading: true }), spray = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, transparent: true, opacity: .14, depthWrite: false }), puffs = [];
      const mats = [flowMat('#2f6fb0', '#cfe8ff', 0, .5, .55), flowMat('#bfe4f4', '#ffffff', 0, .55, .16), flowMat('#e9eef2', '#ffffff', 0, .3, .32), flowMat('#5a4028', '#9a7a52', 0, .62, .22), flowMat('#2a1a4a', '#e8dcff', 0xb090ff, .55, 1.6)];
      const L = (v3) => new THREE.Vector3(v3.x - c[0], v3.y, v3.z - c[1]);
      mats.forEach((m, i) => { const a0 = (i - 2) * 30, h1 = (.30 + .05 * ((i * 3) % 4 - 1.5)) * H, h2 = (.64 + .04 * ((i * 5) % 3 - 1)) * H;
        for (let st = 0; st < 3; st++) { const off = (st - 1) * 8, lift = st * .025 * H, conv = y => (a0 + off) * (1 - .93 * Math.pow(clamp(y / H, 0, 1), 1.7));          // wide at the foot, meeting at the lip
          const ctl = [W3(38 + st * 3, conv(0), 1), W3(15, conv(h1 - 8), h1 - 8 + lift), W3(21 + st * 2, conv(h1 + 5), h1 + 5 + lift), W3(6, conv(h2 - 8), h2 - 8 + lift), W3(11 + st, conv(h2 + 6), h2 + 6 + lift), W3(-6, conv(H), H + 4), W3(-26, 0, H - 1)].map(L);
          NS(M(g, ribbon(new THREE.CatmullRomCurve3(ctl, false, 'centripetal').getPoints(40), [14, 6, 3.4][st]), m, 0, 0, 0)); }
        for (const [sOut, y, r] of [[19, h1 - 6, 9], [9, h2 - 6, 8]]) { const a = a0 * (1 - .93 * Math.pow(y / H, 1.7)), p = L(W3(sOut, a, y)); M(g, new THREE.DodecahedronGeometry(r + (i % 2) * 2, 0), rock, p.x - nx * 6, p.y - 2, p.z - nz * 6, { rx: i, sy: .6 }); puffs.push(NS(M(g, new THREE.SphereGeometry(6, 8, 6), spray, p.x + nx * 5, p.y + 6, p.z + nz * 5, { sy: .7 }))); }
        const b = L(W3(38, a0, 3)); puffs.push(NS(M(g, new THREE.SphereGeometry(8, 8, 6), spray, b.x, b.y, b.z, { sy: .5 })));
        for (let k = 0; k < 110; k++) { const sp = W3(34 + rng() * 8, a0 + (rng() - .5) * 18, 2), ep = W3(-8 - rng() * 10, (rng() - .5) * 8, H + 3); dS.push(sp.x, sp.y, sp.z); dE.push(ep.x, ep.y, ep.z); dC.push(...COLS[i]); dP.push(rng(), .1 + rng() * .14 + (i === 4 ? .25 : 0), 2 + rng() * 2.4); } });
      const tp = L(W3(-10, 0, H + 8)); puffs.push(NS(M(g, new THREE.SphereGeometry(14, 8, 6), spray, tp.x, tp.y, tp.z, { sy: .5 })));
      puffs.forEach((p, i) => { p.userData.keepSep = 1; anim.push(t => { const k = 1 + .28 * Math.sin(t * 2.2 + i * 1.7); p.scale.set(k, k * .6, k); }); });
      for (let i = 0; i < 11; i++) { const p = W3(44 + (i * 13) % 30, (i - 5) * 17, 0); M(g, new THREE.DodecahedronGeometry(5 + (i * 7) % 6, 0), rock, p.x - c[0], heightAt(p.x, p.z) + 1, p.z - c[1], { rx: i, ry: i * 2, sy: .7 }); }
    }, { y: 0, hexes: [[3, 53]], top: H + 60, view: 560 });
    // droplets climbing the falls
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dS, 3)); dg.setAttribute('aEnd', new THREE.Float32BufferAttribute(dE, 3)); dg.setAttribute('aCol', new THREE.Float32BufferAttribute(dC, 3)); dg.setAttribute('aPh', new THREE.Float32BufferAttribute(dP, 3));
    const dm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uScale: FXSCALE, uN: { value: new THREE.Vector2(nx, nz) } },
      vertexShader: 'attribute vec3 aEnd, aCol, aPh; uniform float uTime, uScale; uniform vec2 uN; varying vec3 vCol; varying float vA;' +
        'void main(){ float f = fract(aPh.x + uTime * aPh.y); vec3 p = mix(position, aEnd, f); float out1 = (1.0 - f) * (10.0 + 9.0 * abs(sin(f * 8.0 + aPh.x * 6.0))); p.xz += uN * out1 * (1.0 - smoothstep(0.75, 1.0, f));' +
        ' vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float sz = aPh.z * uScale / -mv.z; vA = sin(f * 3.14159) * min(1.0, sz / 1.5); gl_PointSize = max(sz, 1.5); vCol = aCol; }',
      fragmentShader: 'varying vec3 vCol; varying float vA; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vCol * a * a * vA, 1.0); }' });
    const dpts = new THREE.Points(dg, dm); dpts.frustumCulled = false; scene.add(dpts);
    chimneys.push([F[0] + nx * 40, 10, F[1] + nz * 40, 0xeef4f8], [F[0] - nx * 14, H + 14, F[1] - nz * 14, 0xeef4f8]); }

  // Pearl Whorl Pool (2,54): the river at the top of the falls, turning in whirlpools, each with a white pearl floating above its centre
  { const c = hexW(2, 54), wy = (PLAT_Y - 5) * S + .3;
    const swirl = canvasTex(256, 256, (cx, w) => { cx.clearRect(0, 0, w, w); cx.translate(w / 2, w / 2); for (let arm = 0; arm < 4; arm++) { cx.beginPath(); for (let i = 0; i < 120; i++) { const t = i / 120, a = arm * 1.5708 + t * 7.5, r = t * w * .48; cx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        cx.strokeStyle = 'rgba(235,245,255,.75)'; cx.lineWidth = 7; cx.stroke(); } const gr = cx.createRadialGradient(0, 0, 0, 0, 0, w * .5); gr.addColorStop(0, 'rgba(10,20,40,.9)'); gr.addColorStop(.25, 'rgba(40,90,130,.35)'); gr.addColorStop(1, 'rgba(40,90,130,0)'); cx.fillStyle = gr; cx.fillRect(-w / 2, -w / 2, w, w); });
    addThing('Pearl Whorl Pool', '🦪', c, 1, 30, g => { const sw = new THREE.MeshStandardMaterial({ map: swirl, transparent: true, roughness: .15, depthWrite: false }), pearl = glowM(0xf4f7ff, 3.2);
      [[0, 0, 24], [-30, 12, 15], [26, -14, 16], [8, 30, 12]].forEach(([x, z, r], i) => { const d = M(g, new THREE.CircleGeometry(r, 32), sw, x, .6, z, { rx: -Math.PI / 2 }); NS(d); spin.push({ o: d, speed: 0, bolt: false }); anim.push((t, dt) => { d.rotation.z -= dt * (1.1 + i * .3); });
        const p = M(g, new THREE.SphereGeometry(r * .16, 14, 10), pearl, x, 9, z); NS(p); p.userData.keepSep = 1; anim.push(t => { p.position.y = 8 + r * .1 + Math.sin(t * .9 + i) * 1.6; }); lanternPts.push([c[0] + x, wy + 12, c[1] + z, { c: [2.4, 2.5, 2.8], size: 9 + r * .3, drift: .3, speed: .7 }]); });
    }, { y: wy, hexes: [[2, 54]], top: 50, view: 420 }); }

  // Elowin's bathhouse (5,52): set into the foot of the mountain, with a hot-spring pool on a small terrace in front of it, steaming gently
  { const c = hexW(5, 52), pk = MOUNTS[4], sl = slope(c, pk.x * S - c[0], pk.z * S - c[1]);
    addThing("Elowin's Bathhouse", '♨️', c, 1, 30, g => { const P2 = (geo, mat, u, v, y, o) => sl.put(g, geo, mat, u, v, y, o), stn = solid(0x8f8a82, .9), tm = solid(0x6a4a30, .85), snowM = solid(0xe8eff4, .85), warm = glowM(0xffc66a, 2.6), hot = waterGlass(0x8fd8d8, .85), y0 = sl.gh(-6, 0);
      P2(new THREE.BoxGeometry(32, 13, 44), stn, 36, 0, y0 + 6.5); P2(new THREE.BoxGeometry(28, 11, 38), tm, 38, 0, y0 + 18); M(g, gable(42, 12, 32), snowM, sl.xz(37, 0)[0], y0 + 23.5, sl.xz(37, 0)[1], { ry: sl.ry + Math.PI / 2 });   // the house, its back in the mountain
      for (const v of [-14, -5, 5, 14]) { NS(P2(new THREE.BoxGeometry(.6, 5, 4.4), warm, 19.6, v, y0 + 7)); NS(P2(new THREE.BoxGeometry(.6, 4.5, 4), warm, 23.6, v, y0 + 18)); }
      P2(new THREE.BoxGeometry(6, 9, 1), tm, 19.4, 0, y0 + 4.5, { ry: sl.ry + Math.PI / 2 });
      P2(new THREE.CylinderGeometry(17, 18, 3, 22), stn, -10, 0, y0 + 1); P2(new THREE.CylinderGeometry(14.5, 14.5, .6, 22), hot, -10, 0, y0 + 2.6);                                    // the hot-spring pool
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; P2(new THREE.DodecahedronGeometry(2.6 + (i % 3), 0), stn, -10 + Math.cos(a) * 18, Math.sin(a) * 18, y0 + 1.5, { rx: i }); }
      NS(P2(new THREE.BoxGeometry(.8, 44, 5), flowMat('#9fd8dc', '#ffffff', 0, .7, -.5), 50, -18, y0 + 30, { rz: .12 })); P2(new THREE.BoxGeometry(28, 1.2, 3), stn, 4, -9, y0 + .6);        // the spring, and its channel to the pool
      for (const v of [-20, 20]) { P2(new THREE.CylinderGeometry(.4, .5, 9, 6), tm, 8, v, y0 + 4.5); NS(P2(new THREE.SphereGeometry(1.3, 8, 6), warm, 8, v, y0 + 9.6)); sl.lamp(8, v, y0 + 10, { size: 7, drift: .2, speed: .4 }); }
    }, { y: sl.cy, hexes: [[5, 52]], top: 56, view: 380 });
    const pp = sl.xz(-10, 0); chimneys.push([c[0] + pp[0] - 5, sl.cy + sl.gh(-6, 0) + 6, c[1] + pp[1], 0xf2f6f8], [c[0] + pp[0] + 5, sl.cy + sl.gh(-6, 0) + 6, c[1] + pp[1] + 4, 0xf2f6f8]); }

  // Valthrex (10,34): the dragon's mountain. No building here - the dragon himself, a thing of shields, swords and scrap metal with a furnace burning in his chest, circles above the crater and breathes fire now and then
  { const v1 = VOLC[1], VB = [v1.x * S, v1.z * S], topY = v1.rimH * S;
    addThing('Valthrex', '🐉', VB, 1, 30, g => { const met = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: true, envMapIntensity: 1.4 });
      const steel = met(0xaab3bd, .28, .9), iron = met(0x34373e, .5, .75), bronze = met(0x9a6f38, .36, .85), brass = met(0xc9a03c, .3, .9), rust = met(0x6e3a22, .78, .35), verd = met(0x3f7a68, .6, .5), red = met(0x5a2420, .6, .45), blue = met(0x2a3a55, .6, .45), dull = met(0x6f7780, .45, .85);
      const cloth = new THREE.MeshStandardMaterial({ color: 0x6a2a20, roughness: .9, side: THREE.DoubleSide }), eye = glowM(0xff8a1a, 5), core = glowM(0xff5a10, 3.2), PL = [steel, iron, bronze, dull, steel, rust, dull, brass, iron, steel, bronze, dull, red, steel, iron, verd, dull, bronze, steel, blue];
      const SC = 1.4, FR = 210, RL = FR / SC, d = new THREE.Group(); d.rotation.order = 'YXZ'; d.scale.setScalar(SC);
      // the line of the body, bent to the circle he flies. s runs from the tip of the tail (-62) to the base of the skull (38)
      const sp = s => [s, 7 * sstep(12, 36, s) - 3 * sstep(-25, -52, s), s * s / (2 * RL)];
      const rad = s => s < -30 ? lerp(1, 4, (s + 52) / 22) : s < -6 ? lerp(4, 8.8, (s + 30) / 24) : s < 6 ? lerp(8.8, 9.8, (s + 6) / 12) : s < 18 ? lerp(9.8, 5.2, (s - 6) / 12) : lerp(5.2, 4.3, (s - 18) / 20);
      const shield = (grp, mat, r, x, y, z, o) => { M(grp, new THREE.CylinderGeometry(r, r * .92, r * .16, 8), mat, x, y, z, o); M(grp, new THREE.SphereGeometry(r * .26, 6, 4), brass, x, y, z, o).translateY(r * .12); };   // a round shield with its boss
      const blade = (grp, mat, L, w, x, y, z, o) => M(grp, new THREE.ConeGeometry(w, L, 4), mat, x, y, z, { ...o, sz: .22 });                                         // a sword blade: flat, tapering to its point
      const seg = (grp, piv, s, i) => { const p = sp(s), r = rad(s), x = p[0] - piv[0], y = p[1] - piv[1], z = p[2] - piv[2], yaw = -Math.atan(s / RL);
        if (s > -4 && s < 12) { for (const q of [-1.4, 1.4]) M(grp, new THREE.TorusGeometry(r * .95, .7, 5, 12), iron, x + q, y, z, { ry: yaw + Math.PI / 2 }); }       // ribs here: the furnace shows between them
        else M(grp, new THREE.DodecahedronGeometry(r, 0), iron, x, y, z, { rx: i, ry: yaw, sx: 1.25 });
        for (const [q, phi] of [[0, -1.25], [1, -.45], [2, .45], [3, 1.25]]) shield(grp, PL[(i * 3 + q) % PL.length], r * .68, x, y + Math.cos(phi) * r * .9, z + Math.sin(phi) * r * .9, { rx: phi, rz: .28 });   // overlapping shields for scales
        if (i % 2 === 0) blade(grp, i % 4 ? steel : bronze, r * 2.1 + 3, .9 + r * .12, x - 1, y + r * 1.25 + 1, z, { rz: .75 }); };                                   // a ridge of sword blades down the spine
      const tail = new THREE.Group(), torso = new THREE.Group(), neck = new THREE.Group(), pT = sp(-22), pN = sp(14); tail.position.set(pT[0], pT[1], pT[2]); neck.position.set(pN[0], pN[1], pN[2]); d.add(tail, torso, neck);
      { let i = 0; for (let s = -50; s <= 36; s += 4.3, i++) { if (s < -22) seg(tail, pT, s, i); else if (s <= 14) seg(torso, [0, 0, 0], s, i); else seg(neck, pN, s, i); } }
      const heart = M(torso, new THREE.SphereGeometry(7.4, 10, 8), core, 4, 0, sp(4)[2], { sx: 1.5 });                                                              // the furnace in his chest
      for (const [s, sd] of [[9, 1], [9, -1], [-14, 1], [-14, -1]]) { const p = sp(s), r = rad(s), lz = p[2] + sd * r * .7;                                          // legs tucked back, sickle claws
        M(torso, new THREE.BoxGeometry(3.4, 10, 3.4), iron, p[0] - 2, p[1] - r - 2, lz, { rz: -.7 }); shield(torso, sd > 0 ? bronze : steel, 3.2, p[0] - 1, p[1] - r * .7, lz + sd * 2, { rx: sd * 1.57 });
        M(torso, new THREE.BoxGeometry(2.4, 9, 2.4), iron, p[0] - 7.5, p[1] - r - 6.5, lz, { rz: .9 }); for (let q = -1; q <= 1; q++) blade(torso, steel, 5, .7, p[0] - 12, p[1] - r - 9.5, lz + q * 1.3, { rz: 2.2 }); }
      { const p = sp(-52), x = p[0] - pT[0], y = p[1] - pT[1], z = p[2] - pT[2]; M(tail, new THREE.IcosahedronGeometry(3, 0), iron, x, y, z); for (let q = 0; q < 6; q++) blade(tail, q % 2 ? steel : rust, 10, 1.1, x - 2, y, z, { rx: q * 1.047, rz: 1.2 }); }   // a flail of blades at the tip of the tail
      // head: a great helm for a skull, a wedge for the snout, swords for horns, daggers for teeth
      const head = new THREE.Group(), pH = sp(38); head.position.set(pH[0] - pN[0], pH[1] - pN[1] + 1, pH[2] - pN[2]); head.rotation.y = -Math.atan(38 / RL); head.scale.setScalar(1.3); neck.add(head);
      M(head, new THREE.BoxGeometry(9, 6.4, 7.4), steel, 2.5, 1.6, 0); M(head, new THREE.CylinderGeometry(1.7, 3.6, 11, 4), steel, 12, 1, 0, { rz: -Math.PI / 2, rx: .785 }); M(head, new THREE.BoxGeometry(4, 1.2, 8.6), bronze, 4.5, 4.6, 0, { rz: -.2 });
      for (const sd of [-1, 1]) { M(head, new THREE.SphereGeometry(1, 8, 6), eye, 6.2, 3, sd * 3.5); shield(head, sd > 0 ? red : blue, 3.4, .5, 1.6, sd * 3.9, { rx: sd * 1.57 });
        blade(head, steel, 17, 1.2, -6, 7.5, sd * 3.2, { rz: 1.05, rx: sd * .3 }); blade(head, bronze, 11, 1, -4.5, 3.6, sd * 4.6, { rz: 1.35, rx: sd * .55 });
        for (let q = 0; q < 5; q++) blade(head, steel, 2.6, .5, 8 + q * 1.9, -1.4, sd * (2.4 - q * .3), { rx: Math.PI }); }
      for (let q = 0; q < 3; q++) blade(head, brass, 6 - q, .8, 1 - q * 3, 5.6, 0, { rz: .9 });
      const jaw = new THREE.Group(); jaw.position.set(1, -1.6, 0); head.add(jaw); M(jaw, new THREE.BoxGeometry(13, 1.6, 5.6), bronze, 7, -.6, 0); M(jaw, new THREE.BoxGeometry(4, 3, 6.2), iron, 1, -.2, 0);
      for (const sd of [-1, 1]) for (let q = 0; q < 5; q++) blade(jaw, steel, 2.4, .5, 5 + q * 1.9, 1.2, sd * (2.3 - q * .25), {});
      const maw = M(head, new THREE.SphereGeometry(2.2, 8, 6), core, 5, -.6, 0);                                                                                    // the glow in his throat
      // wings in two joints: an arm, a fan of swords for fingers, shields along the bones, and sails of patched banner between
      const wings = [-1, 1].map(sd => { const p = sp(6), wi = new THREE.Group(), wo = new THREE.Group(); wi.position.set(p[0], p[1] + 7, p[2] + sd * 6); wo.position.set(5, 3, sd * 24); wi.add(wo); d.add(wi);
        const sail = (grp, pts) => { const sh = new THREE.Shape(); pts.forEach((q, j) => j ? sh.lineTo(q[0], q[1] * sd) : sh.moveTo(q[0], q[1] * sd)); M(grp, new THREE.ShapeGeometry(sh), cloth, 0, -.4, 0, { rx: Math.PI / 2 }); };
        M(wi, new THREE.CylinderGeometry(.8, 1.3, 25, 6), iron, 2.5, 1.5, sd * 12, { rx: sd * 1.45, rz: -.2 });
        sail(wi, [[1, 0], [6, 24], [-9, 26], [-21, 21], [-16, 14], [-25, 9], [-19, 4], [-23, 0], [-7, -1]]);
        for (let q = 0; q < 5; q++) { const t = .15 + q * .2, L = 20 + q * 2; blade(wi, q % 2 ? steel : rust, L, 1.5, 5 * t - L / 2, 3 * t + .5, sd * 24 * t, { rz: 1.5, rx: sd * Math.PI / 2 }); if (q % 2 === 0) shield(wi, PL[q + 1], 3.2, 5 * t + 1, 3 * t + 1.2, sd * 24 * t, {}); }
        const W = [-3, 1, 22], FB = [.05, .42, .8, 1.2, 1.6], FL = [38, 40, 36, 30, 24], out = [[0, 0], [W[0] + 1.5, W[2]]];
        M(wo, new THREE.CylinderGeometry(.6, .9, 22.5, 6), iron, -1.5, .5, sd * 11, { rx: sd * 1.52, rz: .13 });
        FB.forEach((be, j) => { const L = FL[j], tx = W[0] - Math.sin(be) * L, tz = W[2] + Math.cos(be) * L; blade(wo, j % 2 ? bronze : steel, L, 1.7, (W[0] + tx) / 2, W[1], sd * (W[2] + tz) / 2, { rz: be, rx: sd * Math.PI / 2 });
          out.push([tx, tz]); if (j < 4) { const b2 = (be + FB[j + 1]) / 2, l2 = (L + FL[j + 1]) / 2 * .7; out.push([W[0] - Math.sin(b2) * l2, W[2] + Math.cos(b2) * l2]); }
          shield(wo, PL[(j * 2 + (sd > 0 ? 0 : 3)) % PL.length], 2.6, W[0] - Math.sin(be) * L * .3, W[1] + .9, sd * (W[2] + Math.cos(be) * L * .3), {}); });
        out.push([-12, 3]); sail(wo, out); mergeKids(wi); mergeKids(wo); return [wi, wo]; });
      // his fire: a jet of burning motes thrown from the mouth
      const fN = 200, fA = new Float32Array(fN * 4), fr = mulberry32(9); for (let q = 0; q < fN * 4; q++) fA[q] = fr();
      const fge = new THREE.BufferGeometry(); fge.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fN * 3), 3)); fge.setAttribute('aS', new THREE.BufferAttribute(fA, 4));
      const fmat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uScale: FXSCALE, uK: { value: 0 } },
        vertexShader: 'attribute vec4 aS; uniform float uTime, uScale, uK; varying vec3 vC; void main(){ float l = fract(aS.x + uTime * 1.5); float sp = (0.03 + 0.2 * l) * 62.0 * (0.3 + 0.7 * aS.z);' +
          ' vec3 p = vec3(l * 62.0, -0.1 * l * 62.0 + 0.07 * l * l * 62.0 + cos(aS.y * 6.283) * sp, sin(aS.y * 6.283) * sp); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;' +
          ' gl_PointSize = clamp((6.0 + 30.0 * l) * (0.6 + 0.8 * aS.w) * uScale / -mv.z, 1.0, 300.0); float a = uK * smoothstep(0.0, 0.06, l) * pow(1.0 - l, 1.3); vC = mix(vec3(2.8, 1.5, 0.3), vec3(1.7, 0.26, 0.02), smoothstep(0.0, 0.5, l)) * a; }',
        fragmentShader: 'varying vec3 vC; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vC * a * a * 0.34, 1.0); }' });
      const fire = new THREE.Points(fge, fmat); fire.position.set(17, -.5, 0); fire.frustumCulled = false; fire.raycast = () => {}; fire.visible = false; head.add(fire);
      heart.userData.keepSep = 1; maw.userData.keepSep = 1; [tail, torso, neck, head, jaw].forEach(mergeKids);
      d.traverse(m => { if (m.isMesh) m.userData.noShadow = true; }); g.add(d); movers.push({ o: d, target: () => { const th = things.find(x => x.name === 'Valthrex'); return th ? { thing: th } : null; } });
      anim.push(t => { const th = t * .26, fl = Math.sin(t * 2.5); d.position.set(Math.cos(th) * FR, topY + 165 + Math.sin(t * .5) * 18 - 3 * fl, Math.sin(th) * FR); d.rotation.y = -(th + Math.PI / 2); d.rotation.x = .3 + .05 * Math.sin(t * .9); d.rotation.z = .05 * Math.sin(t * .5 + 1.5);
        wings.forEach((w, i) => { const sd = i ? 1 : -1; w[0].rotation.x = -sd * (.02 + .34 * fl); w[1].rotation.x = -sd * (.05 + .3 * Math.sin(t * 2.5 - .9)); });
        tail.rotation.y = .16 * Math.sin(t * 1.3); tail.rotation.z = .1 * Math.sin(t * 1.7 + 1); neck.rotation.z = .07 * Math.sin(t * 1.1); neck.rotation.y = .1 * Math.sin(t * .7);
        const c = t % 11, k = c < 2.6 ? Math.sin(c / 2.6 * Math.PI) : 0; fire.visible = k > .01; fmat.uniforms.uK.value = k; jaw.rotation.z = -(.1 + .5 * k); head.rotation.z = -.12 * k;
        maw.material.emissiveIntensity = 2 + 7 * k; heart.material.emissiveIntensity = 2.6 + .9 * Math.sin(t * 2.2) + 3 * k; });
    }, { y: 0, hexes: [[10, 34]], top: topY + 60, view: 800 }); }

  // ---------- the east edge of Prismari ----------
  // Black Coral Copper Reef (14,35 15,35 15,36): a lightning farm under the lake - black coral grown like tuning forks, bound in copper; lightning strikes the forks and the bridge
  { const HX = [[14, 35], [15, 35], [15, 36]], P = HX.map(([q, r]) => hexW(q, r)), cen = [P.reduce((a, p) => a + p[0], 0) / 3, P.reduce((a, p) => a + p[1], 0) / 3], tips = [];
    const reef = addThing('Black Coral Copper Reef', '⚡', cen, 1, 30, g => { const coral = solid(0x0e0d13, .5, { flatShading: true }), k = kit(g);
      for (let i = 0; i < 13; i++) { const a = i * 2.39996, e = Math.sqrt((i + .6) / 13), x = Math.cos(a) * e * 48 + 14, z = Math.sin(a) * e * 96 + 6, bed = heightAt(cen[0] + x, cen[1] + z); if (bed > -3) continue;
        const up = 2.5 + (i * 13) % 5, hh = up - bed, w = 5 + (i % 3) * 1.5; k.C(2.2, 4.4, hh * .55, 6, coral, x, bed + hh * .275, z); k.B(w * 2 + 3, 3, 3, coral, x, bed + hh * .55, z, { ry: i });                         // stem and yoke
        for (const sd of [-1, 1]) { const px = x + Math.cos(i) * sd * w, pz = z - Math.sin(i) * sd * w; k.C(1.1, 1.7, hh * .45, 6, coral, px, bed + hh * .775, pz); k.T(1.9, .5, copper, px, up - 1.5, pz, { rx: Math.PI / 2 }); tips.push([cen[0] + px, up, cen[1] + pz]); }
        k.T(3.6, .7, copper, x, bed + hh * .3, z, { rx: Math.PI / 2 }); lanternPts.push([cen[0] + x, 1.5, cen[1] + z, { c: [.6, 1.6, 3], size: 9, drift: 1, speed: .8 }]); }
    }, { y: 0, hexes: HX, top: 40, view: 560 });
    reefThing = reef; reefTips = tips; }   // the bridge shares one of these hexes; it joins this record, and the lightning is set going, once the bridge is built

  // Losheal's Construction Site (three hexes): a mountain being turned into a floating city. Its top is being cut flat, a piece of it already hangs in the air on glowing levitation rigs,
  // more rigs are being set round the mountain, and a gear is hauled up a cable to the works
  { const HX = [[13, 33], [14, 32], [14, 33]], MW = [LOSH[0] * S, LOSH[1] * S], my = heightAt(MW[0], MW[1]), gy = (x, z) => heightAt(MW[0] + x, MW[1] + z);
    addThing("Losheal's Construction Site", '🏗️', MW, 1, 30, g => { const k = kit(g), rock = solid(0x2b2625, .9, { flatShading: true }), timber = solid(0x7a5a3a, .9), iron = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: .5, metalness: .6 }), lev = glowM(0x4ae8ff, 3), brass = new THREE.MeshStandardMaterial({ color: 0xc89a3a, roughness: .35, metalness: .7 });
      // 1. the summit works: scaffold towers and a slewing crane on the levelled top
      for (const [x, z] of [[-30, -18], [-8, 30], [22, -34]]) { const lo = Math.min(gy(x - 7, z - 7), gy(x + 7, z - 7), gy(x - 7, z + 7), gy(x + 7, z + 7)), b = gy(x, z);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const f = gy(x + sx * 7, z + sz * 7) - 4; k.B(1.4, b + 40 - f, 1.4, timber, x + sx * 7, (b + 40 + f) / 2, z + sz * 7); }
        for (const yy of [12, 24, 36]) k.B(16, 1.2, 16, timber, x, Math.max(b, lo) + yy, z); k.B(20, 1.2, 1.2, timber, x, b + 18, z, { rz: .9, ry: .78 }); }
      const crane = new THREE.Group(); crane.position.set(4, my, -4); M(crane, new THREE.BoxGeometry(4, 56, 4), iron, 0, 28, 0); M(crane, new THREE.BoxGeometry(64, 3, 3), iron, 16, 56, 0); M(crane, new THREE.BoxGeometry(.6, 30, .6), iron, 44, 41, 0); M(crane, new THREE.BoxGeometry(9, 7, 9), rock, 44, 23, 0); M(crane, new THREE.BoxGeometry(9, 8, 8), iron, -12, 53, 0);
      crane.traverse(m => { m.castShadow = true; }); g.add(crane); anim.push(t => { crane.rotation.y = Math.sin(t * .15) * 1.3; });
      // 2. the lifted piece of the mountain, hanging over the hole it came from on its levitation rigs
      const chunk = new THREE.Group(), cx0 = 34 * S, cz0 = 22 * S, baseY = gy(cx0, cz0) + 44; chunk.position.set(cx0, baseY, cz0);
      M(chunk, new THREE.DodecahedronGeometry(30, 1), rock, 0, 0, 0, { sy: .5 }); M(chunk, new THREE.CylinderGeometry(27, 30, 5, 9), rock, 0, 12, 0);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .6, x = Math.cos(a) * 19, z = Math.sin(a) * 19; M(chunk, new THREE.CylinderGeometry(3.4, 2.2, 6, 10), iron, x, -15, z); NS(M(chunk, new THREE.TorusGeometry(5, .8, 6, 20), lev, x, -19, z, { rx: Math.PI / 2 })); NS(M(chunk, new THREE.ConeGeometry(4, 20, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 2.2, 2.6), transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), x, -30, z)); }
      chunk.traverse(m => { if (!m.userData.noShadow) m.castShadow = true; }); g.add(chunk); anim.push(t => { chunk.position.y = baseY + Math.sin(t * .5) * 3; chunk.rotation.y = Math.sin(t * .11) * .08; });
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .6, x = cx0 + Math.cos(a) * 26, z = cz0 + Math.sin(a) * 26; k.B(.7, 46, .7, iron, x, gy(x, z) + 20, z, { rz: Math.cos(a) * .12, rx: -Math.sin(a) * .12 }); }   // tethers
      for (let i = 0; i < 4; i++) lanternPts.push([MW[0] + cx0 + Math.cos(i * 1.57 + .6) * 19, baseY - 20, MW[1] + cz0 + Math.sin(i * 1.57 + .6) * 19, { c: [.6, 2.4, 2.8], size: 16, drift: .3, speed: 1 }]);
      // 3. levitation rigs being set into the mountainside, ready for the next lift
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + .2, d = 96 + (i % 2) * 18, x = Math.cos(a) * d, z = Math.sin(a) * d, y = gy(x, z); k.C(4.6, 6, 12, 10, iron, x, y + 4, z); NS(k.T(6.4, .9, i % 3 ? lev : iron, x, y + 11, z, { rx: Math.PI / 2 })); k.B(1, 14, 1, timber, x + 7, y + 6, z); k.B(1, 14, 1, timber, x - 7, y + 6, z); k.B(16, 1, 1, timber, x, y + 13, z); }
      // 4. the haulage: a cable from the foot of the mountain to the summit, with a great gear riding up it; spare gears and crates stacked below
      const a0 = [-150, -40], a1 = [-34, -10], y0 = gy(a0[0], a0[1]) + 26, y1 = my + 30, len = Math.hypot(a1[0] - a0[0], y1 - y0, a1[1] - a0[1]);
      for (const [p, y] of [[a0, y0], [a1, y1]]) { k.B(3, 30, 3, iron, p[0], y - 15, p[1]); k.B(9, 3, 9, iron, p[0], y + 1, p[1]); }
      const cab = k.C(.5, .5, len, 6, iron, (a0[0] + a1[0]) / 2, (y0 + y1) / 2, (a0[1] + a1[1]) / 2); cab.lookAt(new THREE.Vector3(MW[0] + a1[0], y1, MW[1] + a1[1])); cab.rotateX(Math.PI / 2);
      const load = new THREE.Group(); M(load, gearGeo(13, 14, 3), brass, 0, -18, 0, { rx: Math.PI / 2 }); M(load, new THREE.BoxGeometry(.5, 18, .5), iron, 0, -9, 0); load.traverse(m => { m.castShadow = true; }); g.add(load);
      anim.push(t => { const f = .5 - .5 * Math.cos(t * .12); load.position.set(lerp(a0[0], a1[0], f), lerp(y0, y1, f), lerp(a0[1], a1[1], f)); load.children[0].rotation.y = t * .6; });
      const gy0 = gy(a0[0] - 14, a0[1] + 20); for (let i = 0; i < 3; i++) M(g, gearGeo(11 - i * 2, 12, 3), i % 2 ? brass : iron, a0[0] - 14, gy0 + 2 + i * 3.4, a0[1] + 20); for (const [x, z] of [[-128, -66], [-138, -60], [-131, -74]]) k.B(8, 8, 8, timber, x, gy(x, z) + 4, z, { ry: x });
    }, { y: 0, hexes: HX, top: my + 110, view: 700 }); }

  // The Thornbriar (five hexes in the south-west corner of Witherbloom): one enormous thorn briar, black and barbed. The Thornbriar Den - an old lecture hall the briar has swallowed - is inside it
  { const HX = [[15, 45], [16, 44], [16, 45], [15, 46], [16, 46]], P = HX.map(([q, r]) => hexW(q, r)), cen = [P.reduce((a, p) => a + p[0], 0) / 5, P.reduce((a, p) => a + p[1], 0) / 5], r2 = mulberry32(4545), parts = [];
    // It is grown the way a briar grows. From sixteen crowns in the ground rise great canes, thick as tree trunks at the root and tapering to a whip: each climbs, arches over and comes down again.
    // Lesser canes break from them and do the same, and runners creep along the ground. The canes are round and lumpy, swelling at the joints, ridged along their length, darker at the root and redder toward the tip.
    // The thorns are set in a spiral up every cane, the way a rose carries them: each a single curved horn seated in the bark, hooked back toward the root, dark where it leaves the cane and pale as bone at the point,
    // big on a thick cane and small on a whip, with a scatter of small prickles between the large ones
    const V = THREE.Vector3, CANE = [[0x2a161c, 0x4c232b], [0x33191f, 0x58282d], [0x241418, 0x42202b]].map(p => p.map(h => new THREE.Color(h))), TH0 = new THREE.Color(0x3e1217), TH1 = new THREE.Color(0xdccdac), cM = new THREE.Color();
    const hall = P[0], hallY = Math.max(heightAt(hall[0], hall[1]), 0), radAt = (r0, t) => r0 * Math.pow(1 - t, .85) + .1;
    const cane = (pts, r0, sides) => { const curve = new THREE.CatmullRomCurve3(pts), seg = pts.length * 6, ge = new THREE.TubeGeometry(curve, seg, 1, sides, false), pa = ge.attributes.position, c = new V(), v = new V(), col = new Float32Array((seg + 1) * (sides + 1) * 3), cc = CANE[Math.floor(r2() * 3)], ph = r2() * 6.283, lob = 2 + Math.floor(r2() * 3);
      for (let i = 0; i <= seg; i++) { const t = i / seg, rr = radAt(r0, t) * (1 + .09 * Math.sin(t * 23 + ph) + .16 * Math.pow(Math.max(0, Math.sin(t * 31 + ph * 2)), 8)); curve.getPointAt(t, c); cM.copy(cc[0]).lerp(cc[1], t * t);   // a tube of radius one, drawn in ring by ring to the cane's own girth: tapering, uneven, swollen at the joints
        for (let j = 0; j <= sides; j++) { const k = i * (sides + 1) + j, a = j / sides * 6.283, rdg = Math.sin(a * lob + t * 9 + ph), f = 1 + .1 * rdg + .05 * Math.sin(a * 5 + ph), sh = .86 + .14 * (1 + rdg);                           // and never quite round - ridged, the ridges winding slowly round it
          v.fromBufferAttribute(pa, k).sub(c).multiplyScalar(rr * f).add(c); pa.setXYZ(k, v.x, v.y, v.z); col[k * 3] = cM.r * sh; col[k * 3 + 1] = cM.g * sh; col[k * 3 + 2] = cM.b * sh; } }
      ge.setAttribute('color', new THREE.BufferAttribute(col, 3)); ge.deleteAttribute('uv'); ge.computeVertexNormals(); parts.push(ge); return curve; };
    const tA = new V(), tB = new V(), tC = new V(), tT = new V(), tD = new V(), tU = new V(), tW = new V(), tX = new V(), b1 = new V(), b2 = new V(), tg = new V(), REF = new V(0, 1, 0), REF2 = new V(1, 0, 0);
    const thorn = (curve, t, r0, ang, sc, sides = 6) => { const q = curve.getPointAt(t); curve.getTangentAt(t, tg); b1.crossVectors(tg, Math.abs(tg.y) > .95 ? REF2 : REF).normalize(); b2.crossVectors(tg, b1); tD.copy(b1).multiplyScalar(Math.cos(ang)).addScaledVector(b2, Math.sin(ang));   // straight out from the cane, at this turn of the spiral
      const rr = radAt(r0, t), len = (2.4 + rr * 2.0) * sc, rb = (.3 + rr * .3) * sc, RINGS = 3, pos = [], col = [], idx = [];
      tA.copy(q).addScaledVector(tD, rr * .7); tC.copy(tA).addScaledVector(tD, len * .7).addScaledVector(tg, -len * .1); tT.copy(tA).addScaledVector(tD, len * .82).addScaledVector(tg, -len * .62);                                              // its root (sunk a little into the bark), the bend, and the point, swept back
      for (let i = 0; i < RINGS; i++) { const u = i / RINGS, o = 1 - u, r = rb * Math.pow(o, .8); tB.copy(tA).multiplyScalar(o * o).addScaledVector(tC, 2 * o * u).addScaledVector(tT, u * u);
        tW.copy(tC).sub(tA).multiplyScalar(o).addScaledVector(tX.copy(tT).sub(tC), u).normalize(); tU.crossVectors(tW, tg).normalize(); tX.crossVectors(tW, tU); cM.copy(TH0).lerp(TH1, sstep(.1, .75, u));
        for (let j = 0; j < sides; j++) { const a = j / sides * 6.283, cx = Math.cos(a) * r, sx = Math.sin(a) * r * .8; pos.push(tB.x + tU.x * cx + tX.x * sx, tB.y + tU.y * cx + tX.y * sx, tB.z + tU.z * cx + tX.z * sx); col.push(cM.r, cM.g, cM.b); } }
      pos.push(tT.x, tT.y, tT.z); col.push(TH1.r, TH1.g, TH1.b); const tip = RINGS * sides;
      for (let i = 0; i + 1 < RINGS; i++) for (let j = 0; j < sides; j++) { const a = i * sides + j, b = i * sides + (j + 1) % sides; idx.push(a, a + sides, b, b, a + sides, b + sides); }
      for (let j = 0; j < sides; j++) idx.push((RINGS - 1) * sides + j, tip, (RINGS - 1) * sides + (j + 1) % sides);
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); ge.setIndex(idx); ge.computeVertexNormals(); parts.push(ge); };
    const dress = (c, r0, nb, np, sc) => { const a0 = r2() * 6.283; for (let i = 0; i < nb; i++) thorn(c, .05 + .9 * (i + .5) / nb, r0, a0 + i * 2.4, sc); for (let i = 0; i < np; i++) thorn(c, .04 + .9 * (i + .25) / np, r0, a0 + 1.2 + i * 2.4, sc * .42, 5); };   // evenly up the cane, each a little over a third of a turn on from the last
    const walk = (x, z, y0, yaw, pitch, n, step, turn, droop) => { const pts = []; let px = x, pz = z, py = y0 ?? Math.max(heightAt(x, z), 0) - 2; pts.push(new V(px - cen[0], py, pz - cen[1]));
      for (let i = 0; i < n; i++) { yaw += (r2() - .5) * turn; pitch -= droop * (.7 + .6 * r2()); const cp = Math.cos(pitch), st = step * (.8 + .4 * r2()); px += Math.cos(yaw) * cp * st; pz += Math.sin(yaw) * cp * st; py += Math.sin(pitch) * st;
        const gy = Math.max(heightAt(px, pz), 0); if (py < gy + 1) { py = gy + 1 + r2() * 2; pitch = Math.abs(pitch) * .3; }                                                    // it does not dig in: where it meets the ground it runs along it
        if (Math.abs(px - hall[0]) < 27 && Math.abs(pz - hall[1]) < 21 && py < hallY + 27) py = hallY + 28 + r2() * 10;                                                         // and it goes over the old lecture hall, not through it
        pts.push(new V(px - cen[0], py, pz - cen[1])); } return pts; };
    const open = pts => pts.every(p => !(Math.abs(p.x + cen[0] - hall[0]) < 25 && p.z + cen[1] - hall[1] > -6 && p.z + cen[1] - hall[1] < 64 && p.y < hallY + 48));   // nothing grows across the way in from the south, so the hall can be seen from there
    const grow = (x, z, yaw, r0, n, step, droop) => { const mp = walk(x, z, undefined, yaw, 1.0 + r2() * .35, n, step, .9, droop); if (!open(mp)) return; const c = cane(mp, r0, 12); dress(c, r0, 18, 14, 1);
      for (let b = 0, nb = 2 + Math.floor(r2() * 3); b < nb; b++) { const t = .22 + r2() * .5, q = c.getPointAt(t), rb = radAt(r0, t) * .6, bp = walk(q.x + cen[0], q.z + cen[1], q.y, r2() * 6.283, .3 + r2() * .8, 4, 11 + r2() * 7, 1.3, .42); if (!open(bp)) continue; dress(cane(bp, rb, 9), rb, 8, 5, .95); } };
    for (let i = 0; i < 16; i++) { const hp = P[i % 5]; let x, z; do { const a = r2() * 6.283, d = 8 + r2() * 46; x = hp[0] + Math.cos(a) * d; z = hp[1] + Math.sin(a) * d; } while (Math.hypot(x - hall[0], z - hall[1]) < 38);
      for (let j = 0, nj = 3 + Math.floor(r2() * 3), a0 = r2() * 6.283; j < nj; j++) grow(x + (r2() - .5) * 8, z + (r2() - .5) * 8, a0 + j * 6.283 / nj + (r2() - .5) * .7, 4.2 + r2() * 3.4, 6, 19 + r2() * 11, .3 + r2() * .18); }
    for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) grow(hall[0] + sd * (48 + i * 6), hall[1] - 16 - i * 12, (sd > 0 ? Math.PI : 0) + (r2() - .5) * .3, 6 + r2() * 2, 6, 21, .44);   // four of the greatest go right over the back of the hall
    for (let i = 0; i < 18; i++) { const hp = P[i % 5], a = r2() * 6.283, d = r2() * 58, rp = walk(hp[0] + Math.cos(a) * d, hp[1] + Math.sin(a) * d, undefined, r2() * 6.283, .12, 5, 13, 1.4, .08); if (!open(rp)) continue; dress(cane(rp, .9 + r2() * .7, 7), 1.2, 6, 0, .8); }   // runners along the ground
    const briar = mergeVertices(mergeGeometries(parts));
    addThing('The Thornbriar', '🥀', cen, 1, 30, g => { const k = kit(g), ruin = solid(0xa39c88, .95, { flatShading: true }), red = glowM(0xff3528, 3), wood = solid(0x6a4a30, .9), warm = glowM(0xffc878, 2.8), d = [P[0][0] - cen[0], P[0][1] - cen[1]], y = Math.max(heightAt(P[0][0], P[0][1]), 0);
      g.add(new THREE.Mesh(briar, tx(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, side: THREE.DoubleSide }), 'plain2')));
      k.B(40, 16, 3, ruin, d[0], y + 8, d[1] - 14); k.B(3, 12, 28, ruin, d[0] - 20, y + 6, d[1]); k.B(3, 20, 18, ruin, d[0] + 20, y + 10, d[1] - 5); k.B(18, 9, 3, ruin, d[0] - 10, y + 4.5, d[1] + 14); M(g, gable(44, 12, 4), ruin, d[0], y + 16, d[1] - 14);   // the swallowed lecture hall
      k.B(46, 1.2, 34, ruin, d[0], y + .6, d[1] + 2); for (let i = 0; i < 4; i++) { k.B(30 - i * 2, 1.6 + i * 1.5, 3, wood, d[0], y + 1.4 + i * .75, d[1] + 2 + i * 3.6); }                                    // its floor, and four tiers of benches rising to the south
      k.B(5, 4.4, 2.4, wood, d[0], y + 3.4, d[1] - 8); k.B(22, 8, .6, solid(0x1c2a22, .7), d[0], y + 9, d[1] - 12.2); for (const sx of [-1, 1]) { k.C(1.4, 1.6, 15, 8, ruin, d[0] + sx * 15, y + 8.5, d[1] - 10); NS(k.S(1.5, warm, d[0] + sx * 15, y + 17, d[1] - 10)); lanternPts.push([P[0][0] + sx * 15, y + 17.5, P[0][1] - 10, { c: [2.6, 1.7, .7], size: 15, drift: .2, speed: .6 }]); }   // lectern, blackboard, and two lamp columns
      k.C(1.5, 1.5, 16, 8, ruin, d[0] + 12, y + 2.4, d[1] + 12, { rz: 1.45, ry: .6 }); for (let i = 0; i < 5; i++) NS(k.S(.8, warm, d[0] - 12 + i * 6, y + 5.4 + i * .75, d[1] + 3.2 + (i % 4) * 3.6));
      for (const [x, z] of [[-8, 0], [8, 4], [0, -8]]) { NS(k.S(1.6, red, d[0] + x, y + 7, d[1] + z)); lanternPts.push([P[0][0] + x, y + 8, P[0][1] + z, { c: [2.8, .5, .4], size: 10, drift: .6, speed: .5 }]); }
    }, { y: 0, hexes: HX, top: 110, view: 620 });
    for (let i = 0; i < 26; i++) { const hp = P[i % 5], a = i * 2.4, d = (i * 17) % 60; lanternPts.push([hp[0] + Math.cos(a) * d, Math.max(heightAt(hp[0], hp[1]), 0) + 6 + (i * 7) % 30, hp[1] + Math.sin(a) * d, { c: i % 3 ? [2.4, .35, .3] : [2.4, 1.5, .6], size: i % 3 ? 5 : 8, drift: 3, speed: .3 }]); } }

  // ================= Lorehold locations from the live map (each linked to its real hex ids) =================
  { const LST = tx(solid(0xb48d60, .85), 'masonry'), LDK = tx(solid(0x8f6e4a, .9), 'masonry'), LWH = tx(solid(0xe6dcc6, .8), 'rock'), LRK = tx(solid(0x7a5236, .95, { flatShading: true }), 'rock'), timber = solid(0x4a3524, .9), ironM = new THREE.MeshStandardMaterial({ color: 0x3c3a3a, roughness: .55, metalness: .7 }), brassM = new THREE.MeshStandardMaterial({ color: 0xb8923c, roughness: .35, metalness: .8 });
    const boneM = tx(solid(0xd8d2bc, .8), 'rock'), darkM = solid(0x120e0a, 1), rustM = new THREE.MeshStandardMaterial({ color: 0x5a3626, roughness: .8, metalness: .4, flatShading: true });
    const warm = { c: [2.6, 1.5, .5], size: 9, drift: .4, speed: .5 }, lr = mulberry32(2028), gAt = (c, x, z) => heightAt(c[0] + x, c[1] + z);
    const toW = (c, ry, x, z) => [c[0] + x * Math.cos(ry) + z * Math.sin(ry), c[1] - x * Math.sin(ry) + z * Math.cos(ry)];                                    // a point in a turned thing's own frame, out in the world
    const bake = (g, sub) => { sub.updateMatrix(); for (const m of [...sub.children]) { m.applyMatrix4(sub.matrix); g.add(m); } };                           // fold a positioned sub-assembly into its parent so the parts can merge
    const scaf = (g, x, y, z, w, hh, levels) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) M(g, new THREE.BoxGeometry(.8, hh, .8), timber, x + sx * w / 2, y + hh / 2, z + sz * w / 2);
      for (let i = 1; i <= levels; i++) { const yy = y + hh * i / levels, st = hh / levels; M(g, new THREE.BoxGeometry(w + 1.4, .5, w + 1.4), timber, x, yy, z); M(g, new THREE.BoxGeometry(.5, Math.hypot(st, w), .5), timber, x + w / 2, yy - st / 2, z, { rx: (i % 2 ? 1 : -1) * Math.atan2(w, st) }); } };
    const ghostSh = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
      vertexShader: 'uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vH; void main(){ vec3 p = position; float ph = modelMatrix[3].x * 0.13 + modelMatrix[3].z * 0.07; float lo = 1.0 - uv.y; p.x += sin(uTime * 1.7 + p.y * 0.5 + ph) * lo * lo * 2.2; p.z += cos(uTime * 1.3 + p.y * 0.6 + ph) * lo * lo * 1.8; vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vH = uv.y; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vH; void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5); float a = (0.16 + 0.95 * fr) * smoothstep(0.0, 0.4, vH) * (0.85 + 0.15 * sin(uTime * 3.0 + vH * 22.0)); gl_FragColor = vec4(mix(vec3(0.2, 1.0, 0.8), vec3(0.75, 1.0, 1.0), fr) * a, 1.0); }' });
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 3, 2.8), fog: false }), eyeGeo = new THREE.SphereGeometry(.34, 6, 5), armGeo = new THREE.ConeGeometry(.7, 5.4, 6, 3, true);
    const ghostGeo = new THREE.LatheGeometry([[.3, 0], [1.6, 1.5], [2.9, 4], [3.1, 6.5], [2.4, 9], [1.5, 10.4], [1.9, 11.4], [2.1, 12.6], [1.6, 13.8], [.1, 14.4]].map(p => new THREE.Vector2(p[0], p[1])), 12);
    const tick = function (r2, s2, c2, g2, mat) { if (mat.uniforms && mat.uniforms.uTime) mat.uniforms.uTime.value = U.uTime.value; };                              // things copy their materials, so each ghost keeps its own clock in step
    const ghost = (g, x, y, z, sc) => { const gp = new THREE.Group(); gp.position.set(x, y, z); gp.scale.setScalar(sc * .85); const b = new THREE.Mesh(ghostGeo, ghostSh); b.onBeforeRender = tick; gp.add(b);
      for (const sd of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeM); e.position.set(1.75, 12.5, sd * .8); gp.add(e); const arm = new THREE.Mesh(armGeo, ghostSh); arm.onBeforeRender = tick; arm.position.set(2.4, 8.4, sd * 2.5); arm.rotation.set(0, 0, -1.15); gp.add(arm); }
      gp.traverse(m => { m.userData.noShadow = true; m.raycast = () => {}; m.frustumCulled = false; }); g.add(gp); const ph = lr() * 6.3, rr = 6 + 14 * lr(), sp = .12 + .2 * lr();
      anim.push(t => { const a = t * sp + ph; gp.position.set(x + Math.cos(a) * rr, y + 2 + Math.sin(t * .7 + ph) * 1.6, z + Math.sin(a * 1.3) * rr); gp.rotation.y = Math.atan2(-Math.cos(a * 1.3) * 1.3, -Math.sin(a)); }); };

    // Keystone Wall (2,28): cut into the back of the mountain - a sheer wall of seven painted panels with a keystone socket over each, the first three keystones set and glowing
    { const c = Wp(KEYW), y0 = 132 * S, ry0 = Math.atan2(.45, -.89);
      const mural = canvasTex(1024, 320, (cx, w, hgt) => { cx.fillStyle = '#6b5238'; cx.fillRect(0, 0, w, hgt); const pw = w / 7, sky = [['#3a0d08', '#e0621c'], ['#7fb6dc', '#2a7f9a'], ['#f0d48a', '#d09a4a'], ['#9fc48a', '#2f5a2c'], ['#cfe2f0', '#8fa8c0'], ['#b8a8e0', '#e8c8d8'], ['#f0a050', '#f8e0a0']];
          for (let i = 0; i < 7; i++) { const x0 = i * pw + 8, ww = pw - 16, gr = cx.createLinearGradient(0, 12, 0, hgt - 12); gr.addColorStop(0, sky[i][0]); gr.addColorStop(1, sky[i][1]); cx.save(); cx.beginPath(); cx.rect(x0, 12, ww, hgt - 24); cx.clip(); cx.fillStyle = gr; cx.fillRect(x0, 12, ww, hgt - 24);
            const tri = (px, py, bw, bh, col) => { cx.fillStyle = col; cx.beginPath(); cx.moveTo(x0 + px * ww - bw * ww / 2, hgt - 12 - py * hgt); cx.lineTo(x0 + px * ww, hgt - 12 - (py + bh) * hgt); cx.lineTo(x0 + px * ww + bw * ww / 2, hgt - 12 - py * hgt); cx.closePath(); cx.fill(); };
            if (i === 0) { tri(.5, 0, .9, .62, '#140a08'); tri(.5, .45, .16, .2, '#ff7a1a'); cx.fillStyle = '#ff5a10'; cx.fillRect(x0 + ww * .47, hgt * .42, ww * .06, hgt * .5); }
            if (i === 1) { cx.fillStyle = '#1f6a80'; cx.fillRect(x0, hgt * .62, ww, hgt * .34); cx.fillStyle = '#f2ead8'; cx.fillRect(x0 + ww * .44, hgt * .22, ww * .12, hgt * .42); cx.fillStyle = '#ffd86a'; cx.fillRect(x0 + ww * .42, hgt * .18, ww * .16, hgt * .06); }
            if (i === 2) { tri(.36, 0, .6, .5, '#b8823a'); tri(.72, 0, .44, .36, '#8f6228'); }
            if (i === 3) { for (let q = 0; q < 7; q++) tri(.1 + q * .135, 0, .22, .4 + .25 * ((q * 7) % 3) / 2, q % 2 ? '#16361c' : '#244f26'); }
            if (i === 4) { tri(.3, 0, .7, .6, '#5f7890'); tri(.3, .38, .26, .22, '#ffffff'); tri(.74, 0, .56, .45, '#4f6680'); tri(.74, .28, .2, .17, '#ffffff'); }
            if (i === 5) { cx.fillStyle = '#5a5068'; cx.beginPath(); cx.ellipse(x0 + ww / 2, hgt * .52, ww * .36, hgt * .1, 0, 0, 6.283); cx.fill(); tri(.5, .26, .5, -.2, '#3f384c'); for (let q = 0; q < 3; q++) { cx.fillStyle = '#efe6d2'; cx.fillRect(x0 + ww * (.36 + q * .11), hgt * (.26 - (q === 1 ? .1 : 0)), ww * .06, hgt * (.2 + (q === 1 ? .1 : 0))); } }
            if (i === 6) { cx.strokeStyle = '#fff4c8'; cx.lineWidth = 3; for (let q = 0; q < 12; q++) { cx.beginPath(); cx.moveTo(x0 + ww / 2, hgt * .42); cx.lineTo(x0 + ww / 2 + Math.cos(q * .5236) * ww, hgt * .42 + Math.sin(q * .5236) * ww); cx.stroke(); } cx.fillStyle = '#fff8dc'; cx.beginPath(); cx.arc(x0 + ww / 2, hgt * .42, ww * .16, 0, 6.283); cx.fill(); tri(.5, 0, .9, .16, '#7a4a2a'); }
            cx.restore(); } });
      const gems = [0xff3a2a, 0x3a8aff, 0xffa02a];
      addThing('Keystone Wall', '🧱', c, 1, 30, g => { const k = kit(g);
        k.B(10, 92, 160, LST, -64, 44, 0); k.B(12, 7, 166, LDK, -63, 91, 0); k.B(14, 5, 166, LDK, -61, 2.5, 0); for (const sd of [-1, 1]) k.B(13, 92, 9, LDK, -62, 44, sd * 80);
        M(g, new THREE.PlaneGeometry(146, 46), new THREE.MeshStandardMaterial({ map: mural, roughness: .8 }), -58.6, 33, 0, { ry: Math.PI / 2 });
        for (let i = 0; i < 7; i++) { const z = -(i - 3) * 20.8; k.C(6, 6, 2.4, 6, LDK, -58.2, 68, z, { rz: Math.PI / 2 }); if (i < 3) NS(M(g, new THREE.OctahedronGeometry(3.4, 0), glowM(gems[i], 3), -56.6, 68, z)); else k.C(3.4, 3.4, 1, 6, darkM, -56.8, 68, z, { rz: Math.PI / 2 }); }
        for (let i = 0; i < 14; i++) M(g, new THREE.DodecahedronGeometry(3 + 4 * lr(), 0), LRK, -50 + 14 * lr(), 2, (lr() - .5) * 150, { rx: i, ry: i * 2 });                       // fallen stone along the foot of the wall
        for (const sd of [-1, 1]) { k.C(2.4, 3.2, 9, 8, LDK, -40, 4.5, sd * 60); NS(k.S(2.2, fireG, -40, 10.5, sd * 60)); }
      }, { y: y0, ry: ry0, hexes: [[2, 28]], top: 104, view: 520 });
      for (let i = 0; i < 3; i++) { const p = toW(c, ry0, -55, -(i - 3) * 20.8); lanternPts.push([p[0], y0 + 68, p[1], { c: [[2.6, .4, .3], [.4, 1, 2.6], [2.6, 1.3, .3]][i], size: 12, drift: .2, speed: .5 }]); } }

    // Monument Heart (2,30): a levelled yard beside Kollema Hall - a street of heroic statues, some finished and some still rough blocks in scaffolding, each plinth ringed by the binding set into the road
    { const c = Wp(MONU), y0 = 205 * S, ry0 = Math.atan2(.58, .81), bind = [glowM(0x4aa8ff, 2.6), glowM(0x4affd0, 2.6), glowM(0xffa040, 2.6)];
      addThing('Monument Heart', '🗽', c, 1, 30, g => { const k = kit(g); k.B(92, .8, 13, LDK, 0, .4, 0);
        for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { const x = -33 + i * 22, z = sd * 15, n = i * 2 + (sd > 0 ? 1 : 0), stage = n % 3;
          k.B(10, 6, 10, LST, x, 3, z); NS(k.T(7.4, .5, bind[n % 3], x, .9, z, { rx: Math.PI / 2 }));
          if (stage === 1) { k.B(8, 17, 7, LWH, x, 14.5, z, { ry: .3 }); k.B(5, 6, 5, LWH, x + .6, 25, z, { ry: .7 }); } else statue(g, LWH, x, 6, z, 26, sd > 0 ? Math.PI / 2 : -Math.PI / 2, n % 4);
          if (stage !== 0) scaf(g, x, 0, z, 13, 30, 3); }
        k.B(1.6, 34, 1.6, timber, 46, 17, -4); k.B(26, 1.4, 1.4, timber, 38, 33, -4, { rz: .25 }); k.B(.4, 16, .4, ironM, 27, 22, -4); k.B(7, 5, 6, LWH, 27, 12, -4);                 // a crane, a block in its sling
        for (let i = 0; i < 6; i++) k.B(6 + 4 * lr(), 4 + 3 * lr(), 5 + 3 * lr(), LWH, -46 + 6 * lr(), 2.5, -8 + i * 4, { ry: lr() });                                               // blocks waiting to be carved
      }, { y: y0, ry: ry0, hexes: [[2, 30]], top: 60, view: 420 });
      for (let i = 0; i < 8; i++) { const p = toW(c, ry0, -33 + (i >> 1) * 22, (i % 2 ? 1 : -1) * 15); lanternPts.push([p[0], y0 + 3, p[1], { c: [[.5, 1.2, 2.6], [.5, 2.4, 1.8], [2.6, 1.3, .4]][i % 3], size: 10, drift: .2, speed: .6 }]); } }

    // Cronoline Scriptorium (3,31): the works are inside the mountain. What shows is the door - built of blocks only giants could set - and the brass line that carries stone plates out to be stamped and stacked
    { const c = Wp(SCRIP), y0 = 121 * S, ry0 = Math.atan2(-.79, -.61);
      addThing('Cronoline Scriptorium', '📚', c, 1, 30, g => { const k = kit(g), blk = tx(solid(0xa98862, .9, { flatShading: true }), 'rock');
        for (const sd of [-1, 1]) { k.B(18, 66, 17, blk, -4, 33, sd * 25, { ry: sd * .04 }); k.B(22, 30, 20, blk, -8, 15, sd * 46, { ry: sd * .1 }); k.B(20, 18, 16, blk, -9, 39, sd * 45, { ry: -sd * .08 }); k.B(16, 12, 14, blk, -11, 54, sd * 44); }
        k.B(22, 16, 78, blk, -4, 74, 0); k.B(18, 9, 52, blk, -6, 86.5, 0); k.B(3, 60, 33, darkM, -9, 30, 0); NS(k.B(1, 40, 22, glowM(0xffb060, 1.1), -10.4, 22, 0));
        for (const sd of [-1, 1]) k.B(74, .9, .9, brassM, 29, 1.2, sd * 5); for (let i = 0; i < 10; i++) k.B(2, .6, 14, timber, -4 + i * 8, .5, 0);                               // brass rails running out of the door
        k.B(12, 3, 9, timber, 26, 3.4, 0); k.B(11, 2.4, 8, LWH, 26, 6, 0); for (const [x, z] of [[22, 4.6], [30, 4.6], [22, -4.6], [30, -4.6]]) k.C(1.8, 1.8, .8, 10, ironM, x, 2, z, { rx: Math.PI / 2 });   // a cart carrying a stone plate
        for (const sd of [-1, 1]) k.B(2, 30, 2, brassM, 52, 15, sd * 12); k.B(3, 2.4, 28, brassM, 52, 30, 0); k.B(.6, 12, .6, ironM, 52, 23, 0); k.B(8, 5, 8, ironM, 52, 15, 0);                                     // a stamping gantry over the line
        for (let q = 0; q < 3; q++) for (let i = 0; i < 6 - q; i++) k.B(12, 1.6, 9, LWH, 34 + q * 2, 1 + i * 1.7, 22 + q * 10, { ry: (lr() - .5) * .2 });                                                         // finished plates, stacked
      }, { y: y0, ry: ry0, hexes: [[3, 31]], top: 104, view: 480 });
      for (const sd of [-1, 1]) { const p = toW(c, ry0, 8, sd * 22); lanternPts.push([p[0], y0 + 16, p[1], warm]); } }

    // Stasis Vault (5,26): a great glazed case let into the ground, coffers lying under the glass, with a short stone frontage behind
    { const c = Wp(VAULT), y0 = 139 * S, ry0 = Math.atan2(.86, -.5);
      addThing('Stasis Vault', '🧊', c, 1, 30, g => { const k = kit(g), glass = glassM(0xbfe8f0, .28), gold = new THREE.MeshStandardMaterial({ color: 0xd8a83a, roughness: .35, metalness: .7 });
        k.B(64, .6, 44, darkM, 0, .3, 0); for (const sd of [-1, 1]) { k.B(66, 6, 2.4, LST, 0, 3, sd * 22); k.B(2.4, 6, 46, LST, sd * 32, 3, 0); }
        for (let i = 0; i < 16; i++) { const x = -26 + (i % 6) * 10.4 + 2 * lr(), z = -14 + Math.floor(i / 6) * 13 + 3 * lr(), ry = lr(); k.B(6, 3.4, 4, i % 3 ? timber : gold, x, 2.2, z, { ry }); k.B(6.2, .8, 4.2, brassM, x, 4.2, z, { ry }); }
        NS(k.B(62, .5, 42, glass, 0, 6.2, 0)); for (const sd of [-1, 1]) k.B(1, 1, 42, brassM, sd * 10.4, 6.4, 0); k.B(62, 1, 1, brassM, 0, 6.4, 0);
        k.B(8, 26, 60, LST, -44, 13, 0); for (let i = -1; i <= 1; i++) k.B(1.2, 17, 10, darkM, -39.6, 8.5, i * 18); k.B(10, 3, 64, LDK, -44, 27.5, 0);
        for (const sd of [-1, 1]) statue(g, LWH, -36, 0, sd * 27, 20, 0, sd > 0 ? 1 : 0);
      }, { y: y0, ry: ry0, hexes: [[5, 26]], top: 50, view: 380 });
      lanternPts.push([c[0], y0 + 5, c[1], { c: [2.4, 1.9, .8], size: 26, drift: .2, speed: .4 }]); }

    // Breach-knuckle Foundry (5,34 and the hex west of it): where blasting charges are made for the digs - a long works with tall stacks, powder kegs in the yard, earth-banked magazines and a proving ground that goes off now and then
    { const c = Wp(BKF), y0 = 38 * S, gy = (x, z) => gAt(c, x, z) - y0;
      addThing('Breach-knuckle Foundry', '💥', c, 1, 30, g => { const k = kit(g), roofM = solid(0x3a302a, .8);
        k.B(72, 22, 34, LST, 0, 11, 0); M(g, gable(38, 13, 74), roofM, 0, 22, 0, { ry: Math.PI / 2 }); k.B(30, 16, 22, LDK, 20, 8, 27); M(g, gable(26, 9, 31), roofM, 20, 16, 27, { ry: Math.PI / 2 });
        for (const [x, z, hh] of [[-24, -8, 52], [0, -8, 60], [24, -8, 48]]) { k.C(3.2, 4.6, hh, 8, LDK, x, hh / 2, z); k.C(4, 4, 2, 8, ironM, x, hh - 6, z); chimneys.push([c[0] + x, y0 + hh + 4, c[1] + z]); }
        for (const x of [-20, 4]) { k.B(11, 13, 1, darkM, x, 6.5, 17.2); NS(k.B(8, 9, .6, fireG, x, 5.5, 17.6)); }
        for (let i = 0; i < 14; i++) { const x = -34 + 5 * (i % 7) + lr(), z = 26 + 5 * Math.floor(i / 7); k.C(1.8, 1.8, 4.4, 8, timber, x, 2.2, z); if (i < 5) k.C(1.8, 1.8, 4.4, 8, timber, x + 2.5, 6.4, z + .5); }       // powder kegs
        for (let i = 0; i < 6; i++) k.B(5, 4, 5, timber, 44 + (i % 2) * 6, 2 + Math.floor(i / 2) * 4, -10 + (i % 3) * 2, { ry: lr() * .4 });
        for (let i = 0; i < 3; i++) { const x = -78 - i * 24, z = -72 + i * 10, yy = gy(x, z); k.D(11, LRK, x, yy - 1, z, { sy: .75 }); k.B(3, 9, 9, LST, x + 8.6, yy + 4, z); k.B(1, 7, 6, ironM, x + 10.2, yy + 3.5, z); }   // magazines
        k.B(46, 9, 3, LST, -66, gy(-66, -34) + 4.5, -34, { ry: .15 });                                                                                              // blast wall
      }, { y: y0, hexes: [[5, 34], [4, 34]], top: 70, view: 520 });
      const PG = [c[0] - 120, c[1] - 20], py = heightAt(PG[0], PG[1]); chimneys.push([PG[0], py + 4, PG[1], 0x5a5048]);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, .5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); fl.position.set(PG[0], py + 4, PG[1]); fl.raycast = () => {}; fl.visible = false; scene.add(fl);
      anim.push(t => { const q = (t + 3) % 13; fl.visible = q < .7; if (fl.visible) { fl.scale.setScalar(4 + 34 * Math.sqrt(q / .7)); fl.material.opacity = 1 - q / .7; } }); }

    // Bone Sorter Mill (6,24, and the two hexes below it): a mill whose great wheel is turned by a stream of spirits instead of water, bells in its tower and a wall of ossuary niches behind. Below, the stream forks into two sorting yards:
    // each has a basin where the stream ends, a bell frame over it, and bays heaped with one kind of bone apiece - skulls, long bones, ribs - with more bones lying everywhere waiting their turn
    { const c = Wp(MILL), y0 = 98 * S, ry0 = Math.atan2(.84, .54), cr = Math.cos(ry0), sr = Math.sin(ry0), spiritM = flowMat('#5fb8e8', '#f0fbff', 0x3aa0e0, .8, .9), pool = glowM(0x5fc8ff, 2.2), H1 = Wp(BONE1), H2 = Wp(BONE2), E = toW(c, ry0, 85, 19);
      const toL = (wx, wz) => { const dx = wx - c[0], dz = wz - c[1]; return [dx * cr - dz * sr, dx * sr + dz * cr]; };
      addThing('Bone Sorter Mill', '🦴', c, 1, 30, g => { const k = kit(g), roofM = solid(0x4a3a30, .8);
        k.B(36, 26, 26, LST, 0, 13, 0); M(g, gable(30, 12, 38), roofM, 0, 26, 0, { ry: Math.PI / 2 }); k.B(11, 46, 11, LST, -12, 23, -14); for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) k.B(1.6, 9, 1.6, LDK, -12 + dx, 50.5, -14 + dz); M(g, new THREE.ConeGeometry(9, 10, 4), roofM, -12, 60, -14, { ry: Math.PI / 4 });
        for (let i = 0; i < 3; i++) M(g, new THREE.ConeGeometry(2.2, 4.4, 8, 1, true), brassM, -12 + (i - 1) * 3, 50 - (i % 2), -14);                                          // bells
        const wh = new THREE.Group(); wh.position.set(4, 15, 17); for (const dz of [-2.2, 2.2]) M(wh, new THREE.TorusGeometry(20, 1.4, 6, 28), timber, 0, 0, dz);
        for (let i = 0; i < 16; i++) { const a = i * .3927; if (i < 4) M(wh, new THREE.BoxGeometry(40, 1.2, 1.2), timber, 0, 0, 0, { rz: i * .785 }); M(wh, new THREE.BoxGeometry(1, 5, 6), timber, Math.cos(a) * 20, Math.sin(a) * 20, 0, { rz: a }); }
        M(wh, new THREE.CylinderGeometry(2, 2, 9, 8), ironM, 0, 0, 0, { rx: Math.PI / 2 }); mergeKids(wh); g.add(wh); anim.push(t => { wh.rotation.z = -t * .5; });
        k.B(5, 20, 80, LDK, -30, 10, 0); for (let i = 0; i < 11; i++) for (let j = 0; j < 3; j++) k.B(.8, 4, 4.6, darkM, -27.2, 4 + j * 6, -33 + i * 6.6); for (let i = 0; i < 40; i++) k.B(1.4 + lr(), .7, .7, boneM, -24 + 8 * lr(), .5, -30 + 60 * lr(), { ry: lr() * 3 });
        ghost(g, 14, 2, 26, .9); ghost(g, -6, 2, 30, .8); ghost(g, -20, 2, 12, .8);
        [H1, H2].forEach((H, yi) => { const o = toL(H[0], H[1]), by = heightAt(H[0], H[1]) - y0, yr = mulberry32(700 + yi), hAt = (u, v) => { const w = toW(c, ry0, o[0] + u, o[1] + v); return heightAt(w[0], w[1]) - y0; };
          k.C(11, 12, 3, 16, LDK, o[0], by + 1.5, o[1]); NS(k.C(9.6, 9.6, .6, 16, pool, o[0], by + 3, o[1]));                                                              // the basin the spirit stream ends in
          for (const [u, v] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) k.B(1.4, 20, 1.4, timber, o[0] + u, by + 10, o[1] + v); for (const v of [-8, 8]) k.B(19, 1.4, 1.4, timber, o[0], by + 20, o[1] + v); k.B(1.4, 1.4, 19, timber, o[0], by + 20.6, o[1]);
          for (let i = 0; i < 3; i++) M(g, new THREE.ConeGeometry(1.8, 3.6, 8, 1, true), brassM, o[0] + (i - 1) * 4, by + 17.6, o[1]);                                         // the sorting bells
          for (let i = 0; i < 5; i++) { const a = i * 1.2566 + yi * .6, ca = Math.cos(a), sa = Math.sin(a), u = ca * 36, v = sa * 36, hy = hAt(u, v), ry = -a, bx = (du, dv) => [o[0] + u + du * ca - dv * sa, o[1] + v + du * sa + dv * ca];
            let p = bx(10, 0); k.B(2, 8, 22, LST, p[0], hy + 4, p[1], { ry }); for (const sd of [-1, 1]) { p = bx(0, sd * 11); k.B(20, 8, 2, LST, p[0], hy + 4, p[1], { ry }); }                  // a stone bay, open toward the basin
            M(g, new THREE.SphereGeometry(9, 10, 5, 0, 6.283, 0, 1.4), boneM, o[0] + u, hy - 1.5, o[1] + v, { sy: .6 });
            for (let j = 0; j < 22; j++) { const aa = yr() * 6.283, rr = 8 * Math.sqrt(yr()), px = o[0] + u + Math.cos(aa) * rr, pz = o[1] + v + Math.sin(aa) * rr, py = hy + 4.6 * Math.sqrt(Math.max(0, 1 - rr * rr / 81)) + .6, kind = i % 3;
              if (kind === 0) M(g, new THREE.SphereGeometry(1.1 + .5 * yr(), 6, 5), boneM, px, py, pz); else if (kind === 1) M(g, new THREE.CylinderGeometry(.35, .45, 4 + 3 * yr(), 5), boneM, px, py, pz, { rx: yr() * 3, rz: yr() * 3 }); else M(g, new THREE.TorusGeometry(1.6 + yr(), .3, 4, 8, 2.6), boneM, px, py, pz, { rx: yr() * 3, ry: yr() * 3 }); }
            k.B(24, .6, 2.6, timber, o[0] + u * .42, by + 12, o[1] + v * .42, { ry, rz: -.42 }); }                                                                         // a chute from the frame down into the bay
          for (let j = 0; j < 7; j++) { const aa = j * .8976 + .5 + yi, rr = 54 + 8 * yr(), u = Math.cos(aa) * rr, v = Math.sin(aa) * rr, q = 7 + 5 * yr(); M(g, new THREE.SphereGeometry(q, 9, 5, 0, 6.283, 0, 1.4), boneM, o[0] + u, hAt(u, v) - q * .25, o[1] + v, { sy: .5, ry: j });                 // unsorted drifts out toward the edge of the hex
            for (let q2 = 0; q2 < 7; q2++) { const a2 = yr() * 6.283, r2 = q * .8 * Math.sqrt(yr()); M(g, q2 % 2 ? new THREE.SphereGeometry(1.1, 6, 5) : new THREE.CylinderGeometry(.35, .45, 5, 5), boneM, o[0] + u + Math.cos(a2) * r2, hAt(u, v) + q * .32, o[1] + v + Math.sin(a2) * r2, { rx: yr() * 3, rz: yr() * 3 }); } }
          for (let j = 0; j < 190; j++) { const aa = yr() * 6.283, rr = 12 + 54 * Math.sqrt(yr()), u = Math.cos(aa) * rr, v = Math.sin(aa) * rr; k.B(1.2 + 2.6 * yr(), .7, .7, boneM, o[0] + u, hAt(u, v) + .4, o[1] + v, { ry: yr() * 3 }); }
          for (let j = 0; j < 3; j++) { const aa = j * 2.1 + yi; ghost(g, o[0] + Math.cos(aa) * 22, by + 1, o[1] + Math.sin(aa) * 22, .9); } });
      }, { y: y0, ry: ry0, hexes: [[6, 24], [7, 23], [6, 23]], top: 72, view: 520 });
      const ribbon = (P, hw) => { const C = []; for (let i = 0; i < P.length - 1; i++) { const n = Math.ceil(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) / 5); for (let j = 0; j < n; j++) C.push([lerp(P[i][0], P[i + 1][0], j / n), lerp(P[i][1], P[i + 1][1], j / n)]); } C.push(P[P.length - 1]);
        const pos = [], uv = [], idx = []; C.forEach((p, i) => { const a = C[Math.max(i - 1, 0)], b = C[Math.min(i + 1, C.length - 1)], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl * hw, nz = tx / tl * hw, yy = Math.max(heightAt(p[0] - nx, p[1] - nz), heightAt(p[0] + nx, p[1] + nz), heightAt(p[0], p[1])) + 1.2;
          pos.push(p[0] - nx, yy, p[1] - nz, p[0] + nx, yy, p[1] + nz); uv.push(0, i / 5, 1, i / 5); if (i) { const q = i * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); } });
        const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals(); const m = new THREE.Mesh(ge, spiritM); m.raycast = () => {}; scene.add(m); };
      ribbon([toW(c, ry0, -80, 19), E], 3.4); ribbon([E, H1], 3); ribbon([E, H2], 3);                                                                                   // the spirit stream: past the wheel, then forking to the two yards
      const wp = toW(c, ry0, 4, 19), sm = mist({ n: 50, seed: 55, r0: 4, r1: 16, y0: 0, y1: 34, spin: .5, rise: .18, size: 9, alpha: .3, col: [.4, .9, 1.5], add: true }); sm.position.set(wp[0], y0, wp[1]); scene.add(sm);
      for (const H of [H1, H2]) lanternPts.push([H[0], heightAt(H[0], H[1]) + 6, H[1], { c: [.5, 1.5, 2.6], size: 26, drift: .2, speed: .5 }]); }

    // Phalanx Crucible (now standing on hex 7,26): the hill is cut level for it - a ring of colossal armoured statues on even ground, facing in over a small sunken arena
    { const c = Wp(PHX), y0 = 80 * S, top = 16 * S, armor = tx(new THREE.MeshStandardMaterial({ color: 0x77705f, roughness: .5, metalness: .45 }), 'rock'), rune = glowM(0xffb040, 2.4);
      addThing('Phalanx Crucible', '🛡️', c, 1, 30, g => { const k = kit(g); k.C(16, 16, .6, 24, LDK, 0, .3, 0); NS(k.T(11, .45, rune, 0, .8, 0, { rx: Math.PI / 2 })); NS(k.T(5.5, .35, rune, 0, .8, 0, { rx: Math.PI / 2 }));
        for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + .3, x = Math.cos(a) * 50, z = Math.sin(a) * 50; k.B(12, 6, 12, LST, x, top + 3, z, { ry: -a }); statue(g, armor, x, top + 6, z, 40, Math.PI - a, 3); }
        for (let i = 0; i < 4; i++) { const a = i * 1.571 + .8; k.C(2, 2.8, 6, 8, LDK, Math.cos(a) * 14, 3, Math.sin(a) * 14); NS(k.S(1.9, fireG, Math.cos(a) * 14, 7, Math.sin(a) * 14)); }
      }, { y: y0, hexes: [[7, 26]], top: 90, view: 460 });
      for (let i = 0; i < 4; i++) { const a = i * 1.571 + .8; lanternPts.push([c[0] + Math.cos(a) * 14, y0 + 8, c[1] + Math.sin(a) * 14, warm]); } }

    // Pillardrop 492 (now on hex 11,25): the deepest place there is - a round shaft going down for miles, abandoned soon after it was made. Ring under ring of stone gallery runs round it, each carried on a row of
    // columns standing on the one below, most of them broken. Dark towers hang into it point-down from great arms of rock at the rim, their windows still lit. Torches burn on the ledges, and a very long way down there is a pale green light
    { const c = Wp(P492); let gy = 1e9; for (let i = 0; i < 8; i++) gy = Math.min(gy, gAt(c, Math.cos(i * .785) * 64, Math.sin(i * .785) * 64)); const fy = heightAt(c[0], c[1]) - gy, RW = 42, NL = 8, pr = mulberry32(492), torches = [];
      addThing('Pillardrop 492', '⛏️', c, 1, 30, g => { const k = kit(g), st = tx(solid(0x7a6753, .9), 'rock'), stD = tx(solid(0x4a3c31, .95), 'rock'), twr = tx(solid(0x2b2522, .9), 'rock'), rk = tx(solid(0x6e4a32, .95, { flatShading: true }), 'rock'), band = new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: .5, metalness: .6 }), win = glowM(0xff9a30, 2.6), dark = solid(0x07080b, 1), V2 = (x, y) => new THREE.Vector2(x, y);
        const gap = (-fy - 76) / (NL - 1), lev = j => -20 - j * gap;
        for (let j = 0; j < NL; j++) { const y = lev(j), a0 = pr() * 6.283, L = 4.3 + pr() * 1.7, nc = Math.round(L / .27), hh = (j < NL - 1 ? gap : 34) - 4.4;
          M(g, new THREE.LatheGeometry([V2(RW - 11.5, 0), V2(RW + 2, 0), V2(RW + 2, -2.4), V2(RW - 11.5, -2.4), V2(RW - 11.5, 0)], 44, a0, L), j % 2 ? st : stD, 0, y, 0);                                    // the ledge
          M(g, new THREE.LatheGeometry([V2(RW - 10.8, -2.4), V2(RW - 8.4, -2.4), V2(RW - 8.4, -4.4), V2(RW - 10.8, -4.4), V2(RW - 10.8, -2.4)], 44, a0, L), st, 0, y, 0);                                   // the beam its columns carry
          M(g, new THREE.LatheGeometry([V2(RW - 11.6, 0), V2(RW - 11, 0), V2(RW - 11, 1.5), V2(RW - 11.6, 1.5), V2(RW - 11.6, 0)], 44, a0 + .05, L - .1), stD, 0, y, 0);                                      // a low kerb along its edge
          for (let i = 0; i < nc; i++) { const ph = a0 + (i + .5) / nc * L, sx = Math.sin(ph), cz = Math.cos(ph); if (pr() < .14) continue;                                                              // a column gone here and there
            k.C(.85, 1.05, hh, 6, st, sx * (RW - 9.6), y - 4.4 - hh / 2, cz * (RW - 9.6)); k.B(2.4, .7, 2.4, st, sx * (RW - 9.6), y - 4.4 - hh + .35, cz * (RW - 9.6), { ry: ph });
            if (i % 3 === 1) { k.B(3.2, 7.4, 1.4, dark, sx * (RW + 1.6), y + 3.7, cz * (RW + 1.6), { ry: ph }); k.B(4.2, .8, 1.8, st, sx * (RW + 1.4), y + 7.8, cz * (RW + 1.4), { ry: ph });                 // a doorway into the rock behind,
              if (pr() < .55) { NS(k.S(.5, win, sx * (RW - 1.5), y + 3.4, cz * (RW - 1.5))); k.C(.14, .14, 3, 4, band, sx * (RW - 1.5), y + 1.6, cz * (RW - 1.5)); torches.push([c[0] + sx * (RW - 1.5), gy + y + 3.6, c[1] + cz * (RW - 1.5)]); } } } }   // a torch still burning by some of them
        // the hanging towers: each a great spire turned point-down, banded, windows alight. What is left of the cavern's roof is three ribs of living rock arching across the mouth of the shaft from rim to rim,
        // and one tower hangs from the middle of each, with stalactites along the rib beside it. The south side is left open to look in by
        const tower = (ang, dist, H, R) => { const sx = Math.sin(ang), cz = Math.cos(ang), x = sx * dist, z = cz * dist, dl = Math.acos(dist / (RW + 17)), end = a => { const ex = Math.sin(a) * (RW + 17), ez = Math.cos(a) * (RW + 17); return new THREE.Vector3(ex, gAt(c, ex, ez) - gy - 4, ez); };
          const A = end(ang - dl), B = end(ang + dl), crv = new THREE.QuadraticBezierCurve3(A, new THREE.Vector3(x, 34, z), B), SG = 20, tg = new THREE.TubeGeometry(crv, SG, 1, 7, false), pa = tg.attributes.position, cc = new THREE.Vector3(), vv = new THREE.Vector3();
          for (let i = 0; i <= SG; i++) { crv.getPointAt(i / SG, cc); const rr = (4 + 3.4 * Math.abs(i / SG - .5) * 2) * (.8 + .45 * pr()); for (let j = 0; j <= 7; j++) { const q = i * 8 + j; vv.fromBufferAttribute(pa, q).sub(cc).multiplyScalar(rr).add(cc); pa.setXYZ(q, vv.x, vv.y, vv.z); } }   // thick where it springs from the rim, thinner and lumpy over the drop
          tg.computeVertexNormals(); M(g, tg, rk, 0, 0, 0); const y0 = crv.getPointAt(.5).y - 4;
          M(g, new THREE.LatheGeometry([[.01, -H], [R * .16, -H * .93], [R * .34, -H * .78], [R * .5, -H * .6], [R * .72, -H * .38], [R * .9, -H * .16], [R, 0], [R * .8, 3], [R * .45, 6], [.01, 9]].map(p => V2(p[0], p[1])), 14), twr, x, y0, z);
          for (const f of [.07, .26, .47, .68]) { const rr = R * (1 - f * .9) + .25; k.T(rr + .3, .5, band, x, y0 - H * f, z, { rx: Math.PI / 2 }); k.T(rr + .3, .3, band, x, y0 - H * (f + .14), z, { rx: Math.PI / 2 });
            for (let i = 0; i < 8; i++) { const a = i * .785 + f * 3, r2 = R * (1 - (f + .07) * .9) + .3; NS(k.B(1.1, H * .05, .5, win, x + Math.sin(a) * r2, y0 - H * (f + .07), z + Math.cos(a) * r2, { ry: a })); } }
          for (let i = 0; i < 9; i++) { const t = .1 + pr() * .8; if (Math.abs(t - .5) < .1) continue; const p = crv.getPointAt(t), hh = 6 + pr() * 18; k.K(1.1 + pr() * 1.5, hh, 5, rk, p.x, p.y - 3 - hh / 2, p.z, { rx: Math.PI }); }
          torches.push([c[0] + x, gy + y0 - H * .3, c[1] + z]); };
        tower(Math.PI + .2, 20, 170, 10); tower(2.0, 25, 120, 8); tower(-2.15, 24, 134, 8.5);
        // the rim: a broken kerb of cut stone, and a slab standing out over the drop on the south-west with a pair of torches on it
        for (let i = 0; i < 34; i++) { const a = i / 34 * 6.283, x = Math.sin(a) * (RW + 16), z = Math.cos(a) * (RW + 16), hh = 2 + pr() * 3; if (pr() < .3) continue; k.B(5.4, hh, 3.6, i % 2 ? st : stD, x, gAt(c, x, z) - gy + hh / 2 - .6, z, { ry: a, rz: (pr() - .5) * .16 }); }
        { const a = -.62, sx = Math.sin(a), cz = Math.cos(a); const sy = gAt(c, sx * (RW + 14), cz * (RW + 14)) - gy; k.B(18, 3, 22, st, sx * (RW + 4), sy - 1, cz * (RW + 4), { ry: a }); for (const o of [-6.5, 6.5]) { const x = sx * (RW - 4) + cz * o, z = cz * (RW - 4) - sx * o; k.C(.2, .2, 4.4, 4, band, x, sy + 2.7, z); NS(k.S(.7, win, x, sy + 5.3, z)); torches.push([c[0] + x, gy + sy + 5.5, c[1] + z]); } }
        // far below: the light, and two faint rings of it on the walls above
        NS(k.C(24, 24, 1, 28, glowM(0xd6ffe4, 3.4), 0, fy + 5, 0)); for (const [yy, kq] of [[fy + 40, 1.2], [fy + 86, .6]]) NS(k.T(RW - 1, 1.2, glowM(0x9fffd0, kq), 0, yy, 0, { rx: Math.PI / 2 }));
      }, { y: gy, hexes: [[11, 25]], top: 46, view: 560 });
      for (const [n, y0, y1, al] of [[110, fy + 8, fy + 150, .16], [60, fy + 120, -30, .07]]) { const m9 = mist({ n, seed: 49 + n, r0: 6, r1: 34, y0, y1, spin: .12, rise: .035, size: 34, alpha: al, col: [.6, .95, .8], add: true }); m9.position.set(c[0], gy, c[1]); scene.add(m9); }
      { const m = new THREE.Mesh(new THREE.CylinderGeometry(20, 9, 330, 18, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
          vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ float rim = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * rim * rim * smoothstep(0.0, 0.5, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y)) * 0.28, 1.0); }' }));
        m.position.set(c[0], gy - 50, c[1]); m.raycast = () => {}; m.frustumCulled = false; scene.add(m); }                                                                                       // cold daylight falling in from above
      { const pl = new THREE.PointLight(0xa8ffd6, 9000, 460, 1.5); pl.position.set(c[0], gy + fy + 70, c[1]); scene.add(pl); }                                                              // the light below reaches a long way up the walls
      torches.forEach((p, i) => lanternPts.push([p[0], p[1], p[2], { c: [2.7, 1.3, .35], size: i % 4 ? 6 : 10, drift: .25, speed: .6 }]));
      lanternPts.push([c[0], gy + fy + 14, c[1], { c: [1.6, 2.6, 1.9], size: 46, drift: .2, speed: .3 }]); }

    // Heapworks (8,34): a quarried pit heaped with clockwork gears, half-cut stone and broken timber, cranes standing over it on the rim
    { const c = Wp(HEAP), fl = 24 * S;
      addThing('Heapworks', '⚙️', c, 1, 30, g => { const k = kit(g), hr = mulberry32(88), dullBrass = new THREE.MeshStandardMaterial({ color: 0x8a6a34, roughness: .65, metalness: .5 });
        M(g, new THREE.SphereGeometry(46, 16, 8, 0, 6.283, 0, 1.3), rustM, 0, fl - 20, 0, { sy: .9, sz: .8 });
        for (let i = 0; i < 70; i++) { const a = i * 2.39996, rr = 44 * Math.sqrt((i + .5) / 70), x = Math.cos(a) * rr, z = Math.sin(a) * rr * .8, yy = fl - 20 + 41 * Math.sqrt(Math.max(0, 1 - (rr / 47) * (rr / 47))) + 1, q = hr();
          if (q < .4) M(g, gearGeo(4 + 9 * hr(), 10 + (i % 5) * 2, 2 + 2 * hr()), i % 6 === 0 ? dullBrass : i % 2 ? ironM : rustM, x, yy, z, { rx: (hr() - .5) * 1.8, rz: (hr() - .5) * 1.8 });
          else if (q < .7) k.B(6 + 8 * hr(), 5 + 5 * hr(), 5 + 6 * hr(), i % 2 ? LDK : LST, x, yy, z, { rx: hr(), ry: hr() * 3, rz: hr() });
          else if (q < .85) k.C(2.6, 2.6, 12 + 10 * hr(), 8, LST, x, yy, z, { rx: 1.2 + hr(), ry: hr() * 3 });
          else k.B(18 + 10 * hr(), 1.6, 1.6, timber, x, yy + 1, z, { ry: hr() * 3, rz: hr() - .5 }); }
        [[.6, 1], [2.7, 0], [4.6, 1]].forEach(([a, swing], i) => { const x = Math.cos(a) * 70, z = Math.sin(a) * 56, yy = gAt(c, x, z), base = Math.atan2(z, -x); k.B(2.4, 40, 2.4, timber, x, yy + 20, z); k.B(9, 2, 9, timber, x, yy + 1, z);
          const jib = new THREE.Group(); jib.position.set(x, yy + 38, z); M(jib, new THREE.BoxGeometry(46, 1.8, 1.8), timber, 16, 5, 0, { rz: .22 }); M(jib, new THREE.BoxGeometry(1.2, 22, 1.2), timber, 0, 8, 0); M(jib, new THREE.BoxGeometry(.4, 26, .4), ironM, 37, -3.5, 0); M(jib, new THREE.BoxGeometry(6, 5, 6), ironM, 37, -18, 0); M(jib, new THREE.BoxGeometry(8, 6, 6), LDK, -6, 2, 0);
          mergeKids(jib); jib.rotation.y = base; g.add(jib); if (swing) anim.push(t => { jib.rotation.y = base + .5 * Math.sin(t * .25 + i * 2); }); });
      }, { y: 0, hexes: [[8, 34]], top: 130, view: 480 }); }

    // White Scar (five hexes): an old river bed gone to salt, crags standing in it - and a swarm pouring down it, thousands of small pale things running all one way
    { const HX = [[9, 24], [10, 24], [11, 24], [12, 23], [13, 22]], c = hexW(11, 24), a = WSCAR.pts, n = a.length / 2, NP = 40, PTS = [];
      for (let i = 0; i < NP; i++) { const f = i / (NP - 1) * (n - 1), i0 = Math.min(Math.floor(f), n - 2), fr = f - i0, x = lerp(a[2 * i0], a[2 * i0 + 2], fr) * S, z = lerp(a[2 * i0 + 1], a[2 * i0 + 3], fr) * S; PTS.push(new THREE.Vector3(x, heightAt(x, z) + .6, z)); }
      addThing('White Scar', '💀', c, 1, 30, g => { const pale = solid(0xcfcabb, .8, { flatShading: true });
        for (let i = 0; i < 46; i++) { const j = 2 + Math.floor(lr() * (NP - 4)), p = PTS[j], q = PTS[j + 1], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, lat = (lr() < .5 ? -1 : 1) * (14 + 22 * lr()), x = p.x - dz / l * lat - c[0], z = p.z + dx / l * lat - c[1], hh = 6 + 16 * lr() * lr();
          M(g, new THREE.ConeGeometry(2 + 3 * lr(), hh, 5), pale, x, heightAt(c[0] + x, c[1] + z) + hh * .4, z, { rx: (lr() - .5) * .6, rz: (lr() - .5) * .6 }); }
      }, { y: 0, hexes: HX, top: 46, view: 620 });
      const NSW = 750, body = mergeGeometries([new THREE.BoxGeometry(2.6, 1, 1.2).translate(0, 1.1, 0), new THREE.BoxGeometry(1, .9, 1).translate(1.7, 1.5, 0), new THREE.BoxGeometry(.4, 1.1, 1.8).translate(.8, .5, 0), new THREE.BoxGeometry(.4, 1.1, 1.8).translate(-.8, .5, 0)]);
      const ig = new THREE.InstancedBufferGeometry(); ig.index = body.index; ig.setAttribute('position', body.attributes.position); ig.setAttribute('normal', body.attributes.normal); const ai = new Float32Array(NSW * 4), aj = new Float32Array(NSW * 3), sr = mulberry32(313);
      let sLen = 0; for (let i = 1; i < NP; i++) sLen += PTS[i].distanceTo(PTS[i - 1]);
      for (let i = 0; i < NSW; i++) { ai[4 * i] = sr(); ai[4 * i + 1] = sr(); ai[4 * i + 2] = (sr() * 2 - 1) * 16; ai[4 * i + 3] = (sr() < .5 ? 0 : Math.PI) + (sr() - .5) * 2.6; aj[3 * i] = 9 + 8 * sr(); aj[3 * i + 1] = 4 + 5 * sr(); aj[3 * i + 2] = .8 + .8 * sr(); }
      ig.setAttribute('aI', new THREE.InstancedBufferAttribute(ai, 4)); ig.setAttribute('aJ', new THREE.InstancedBufferAttribute(aj, 3)); ig.instanceCount = NSW;
      // each one appears somewhere along the bed, runs off on its own heading, and shrinks away as it nears a bank or the end of its run; then it appears again somewhere else
      const swM = new THREE.ShaderMaterial({ fog: false, uniforms: { uTime: U.uTime, uP: { value: PTS }, uLen: { value: sLen }, uCol: { value: new THREE.Vector3(.2, .24, .17) } },
        vertexShader: 'attribute vec4 aI; attribute vec3 aJ; uniform vec3 uP[40]; uniform float uTime, uLen; varying float vL;' +
          'void main(){ float tt = aI.x + uTime / aJ.y; float life = fract(tt); float cyc = floor(tt); float ang = aI.w + cyc * 2.4; float ca = cos(ang), sa = sin(ang); float dist = life * aJ.x * aJ.y;' +
          ' float sE = fract(aI.y + cyc * 0.371) + ca * dist / uLen; float lat = aI.z * cos(cyc * 1.9 + aI.x * 7.0) + sa * dist; float f = clamp(sE, 0.0, 1.0) * 39.0; int i = int(min(floor(f), 38.0)); float fr = f - float(i); vec3 a = uP[i]; vec3 b = uP[i + 1]; vec3 c = mix(a, b, fr);' +
          ' vec2 dir = normalize(b.xz - a.xz + vec2(1e-4)); vec2 nr = vec2(-dir.y, dir.x); vec2 hd = dir * ca + nr * sa; float hop = abs(sin(uTime * (5.0 + aJ.x * 0.5) + aI.x * 60.0)) * 0.8;' +
          ' float sc = aJ.z * smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.82, life) * (1.0 - smoothstep(17.0, 29.0, abs(lat))) * smoothstep(0.0, 0.04, sE) * smoothstep(1.0, 0.96, sE); vec3 p = position * sc;' +
          ' vec3 w = vec3(c.x + nr.x * lat + hd.x * p.x - hd.y * p.z, c.y + hop * step(0.01, sc) + p.y, c.z + nr.y * lat + hd.y * p.x + hd.x * p.z); vec3 nn = vec3(hd.x * normal.x - hd.y * normal.z, normal.y, hd.y * normal.x + hd.x * normal.z);' +
          ' vL = 0.5 + 0.7 * max(dot(nn, vec3(-0.59, 0.66, -0.45)), 0.0); gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }',
        fragmentShader: 'uniform vec3 uCol; varying float vL; void main(){ gl_FragColor = vec4(uCol * vL, 1.0); }' });
      const sw = new THREE.Mesh(ig, swM); sw.frustumCulled = false; sw.raycast = () => {}; scene.add(sw); }

    // Glass Cofferdam (12,31): a short slot canyon. One wall of it is glass in a brass frame, holding back a drowned river with ruins standing in it; a winch and crane on the floor work the dive bell
    { const c = Wp(COFD), y0 = 7 * S, ry0 = -Math.PI / 3;
      addThing('Glass Cofferdam', '🫧', c, 1, 30, g => { const k = kit(g), glass = glassM(0x9fe0f0, .26), deep = new THREE.MeshStandardMaterial({ color: 0x0e4a6a, emissive: 0x0a4a70, emissiveIntensity: .9, roughness: .2 }), cap = solid(0xa2764e, .95, { flatShading: true });
        k.B(92, 46, 18, deep, -25, 23, -26); for (let i = 0; i < 7; i++) { k.C(2, 2.4, 22 + (i * 7) % 14, 8, LWH, -62 + i * 12.5, 11 + ((i * 7) % 14) / 2, -15.5); if (i % 3 === 0) k.B(11, 3, 4, LWH, -58 + i * 12.5, 30, -15.5, { rz: .3 }); }
        NS(M(g, new THREE.PlaneGeometry(92, 46), glass, -25, 23, -11.4)); for (let i = 0; i <= 6; i++) k.B(1.2, 46, 1.4, brassM, -71 + i * 15.33, 23, -11); for (const yy of [.6, 23, 45.6]) k.B(93, 1.2, 1.4, brassM, -25, yy, -11);
        for (let i = 0; i < 9; i++) M(g, new THREE.DodecahedronGeometry(17 + 5 * lr(), 0), cap, -68 + i * 11, 49 + 2 * lr(), -27 + 6 * lr(), { sy: .32, ry: i, rx: (lr() - .5) * .2 });
        k.B(10, 8, 12, timber, -30, 4, 12); k.C(3, 3, 12, 10, timber, -30, 10, 12, { rx: Math.PI / 2 }); k.T(8, .8, ironM, -30, 10, 19.4); for (let i = 0; i < 4; i++) k.B(15, .8, .8, ironM, -30, 10, 19.4, { rz: i * .785 });
        k.B(2, 50, 2, timber, -30, 25, 3); k.B(2, 2, 14, timber, -30, 49, -2); k.B(.5, 18, .5, ironM, -30, 40, -4); k.S(6.5, brassM, -30, 25, -4); k.T(6.6, .7, ironM, -30, 25, -4, { rx: Math.PI / 2 }); k.C(1.6, 1.6, .8, 10, darkM, -30, 25.5, 2.4, { rx: Math.PI / 2 }); k.T(1.6, .5, ironM, -30, 32.4, -4);
        for (let i = 0; i < 5; i++) k.B(5, 4, 5, timber, 6 + (i % 3) * 6, 2 + Math.floor(i / 3) * 4, 14, { ry: lr() * .5 });
      }, { y: y0, ry: ry0, hexes: [[12, 31]], top: 78, view: 420 });
      for (const [x, z] of [[-60, 8], [-10, 8], [-30, -4]]) { const p = toW(c, ry0, x, z); lanternPts.push([p[0], y0 + 14, p[1], x === -30 ? { c: [.5, 1.6, 2.4], size: 22, drift: .2, speed: .4 } : warm]); } }

    // Breakline Trenches (eight hexes): an old battlefield where giants fought. Their skeletons lie in the trenches with their weapons driven into the ground, siege engines rot where they fell, bones are everywhere, and the dead still drift about
    { const HX = [[2, 34], [2, 35], [2, 36], [2, 37], [3, 34], [3, 35], [3, 36], [3, 37]], c = Wp(BRKL), br = mulberry32(1066), gy = (x, z) => gAt(c, x, z);
      addThing('Breakline Trenches', '⚔️', c, 1, 30, g => { const sub = () => new THREE.Group(), place = (sg, x, z, ry, tilt) => { sg.position.set(x, gy(x, z), z); sg.rotation.set(tilt || 0, ry, 0); bake(g, sg); };
        for (const [x, z, ry, sc] of [[-40, -210, .4, 1], [55, -120, 2.2, 1.25], [-70, -20, 4.1, .9], [40, 70, 1.2, 1.1], [-30, 150, 5.3, 1.3], [80, 175, 3, .8]]) { const sg = sub();
          for (let i = 0; i < 9; i++) M(sg, new THREE.BoxGeometry(3.4 * sc, 3 * sc, 4.4 * sc), boneM, (i - 4) * 5 * sc, 2 * sc, 0, { rz: (i % 2) * .1 });
          for (let i = 0; i < 7; i++) { const r = (9 - Math.abs(i - 2.5) * 1.3) * sc; for (const sd of [-1, 1]) M(sg, new THREE.TorusGeometry(r, .8 * sc, 5, 10, 2.5), boneM, (i - 5) * 4.6 * sc, 2 * sc, 0, { ry: sd * Math.PI / 2 }); }
          M(sg, new THREE.SphereGeometry(7.5 * sc, 10, 8), boneM, 27 * sc, 5 * sc, 2 * sc, { sx: 1.25, rz: .3 }); M(sg, new THREE.BoxGeometry(8 * sc, 3 * sc, 7 * sc), boneM, 33 * sc, .6 * sc, 3 * sc, { ry: .3 }); for (const sd of [-1, 1]) M(sg, new THREE.SphereGeometry(2 * sc, 6, 5), darkM, 32.5 * sc, 6.5 * sc, (2 + sd * 3.2) * sc);
          for (const sd of [-1, 1]) { M(sg, new THREE.CylinderGeometry(1.5 * sc, 1.9 * sc, 30 * sc, 6), boneM, -34 * sc, 1.6 * sc, sd * 9 * sc, { rz: Math.PI / 2, ry: sd * .35 }); M(sg, new THREE.CylinderGeometry(1.2 * sc, 1.5 * sc, 24 * sc, 6), boneM, 8 * sc, 1.4 * sc, sd * 17 * sc, { rz: Math.PI / 2, ry: sd * 1.1 }); }
          place(sg, x, z, ry); }
        for (const [x, z, ry, tl, L] of [[-10, -160, 0, .35, 70], [70, -60, 1.3, -.5, 56], [-60, 60, 2.5, .25, 84], [20, 140, .7, -.3, 60], [-80, -100, 4, .6, 50], [60, 150, 5, .45, 66]]) { const sg = sub(); M(sg, new THREE.BoxGeometry(1.6, L, 8), rustM, 0, L * .42, 0); M(sg, new THREE.BoxGeometry(2.4, 3, 24), rustM, 0, L * .9, 0); M(sg, new THREE.CylinderGeometry(1.4, 1.4, 14, 6), timber, 0, L * .9 + 8, 0); M(sg, new THREE.SphereGeometry(2.6, 6, 5), rustM, 0, L * .9 + 16, 0); place(sg, x, z, ry, tl); }
        for (const [x, z, ry] of [[10, -250, .5], [-55, -75, 2.4], [70, 20, 4.4], [-25, 205, 1.1]]) { const sg = sub(); for (const sd of [-1, 1]) { M(sg, new THREE.BoxGeometry(46, 2.4, 2.4), timber, 0, 1.2, sd * 9); M(sg, new THREE.BoxGeometry(2.2, 34, 2.2), timber, -7, 16, sd * 9, { rz: -.42 }); M(sg, new THREE.BoxGeometry(2.2, 34, 2.2), timber, 7, 16, sd * 9, { rz: .42 }); M(sg, new THREE.TorusGeometry(5, 1, 5, 10), timber, sd * 18, 5, sd * 12); }
          M(sg, new THREE.CylinderGeometry(1.2, 1.2, 22, 6), ironM, 0, 31, 0, { rx: Math.PI / 2 }); M(sg, new THREE.BoxGeometry(62, 2.4, 2.4), timber, 12, 17, 0, { rz: -.5 }); M(sg, new THREE.BoxGeometry(10, 9, 9), rustM, -19, 4.5, 3, { ry: .4, rz: .2 }); place(sg, x, z, ry, (br() - .5) * .25); }
        for (const [x, z, ry] of [[-75, 130, .3], [75, -180, 2]]) { const sg = sub(); for (const u of [-7, 7]) for (const v of [-7, 7]) M(sg, new THREE.BoxGeometry(1.8, 60, 1.8), timber, u, 30, v); for (let j = 1; j <= 4; j++) { M(sg, new THREE.BoxGeometry(16, 1, 16), timber, 0, j * 14, 0); if (j % 2) M(sg, new THREE.BoxGeometry(.8, 13, 15), timber, 7.4, j * 14 - 7, 0); } M(sg, new THREE.BoxGeometry(16, 10, .8), rustM, 0, 52, 7.6); sg.position.set(x, gy(x, z) + 6, z); sg.rotation.set(0, ry, 1.25); bake(g, sg); }
        for (let i = 0; i < 150; i++) { const x = (br() - .5) * 190, z = (br() - .5) * 560; M(g, new THREE.BoxGeometry(1.2 + 3 * br(), .8, .8), boneM, x, gy(x, z) + .5, z, { ry: br() * 3 }); }
        for (let i = 0; i < 14; i++) { const x = (br() - .5) * 170, z = (br() - .5) * 520; ghost(g, x, gy(x, z), z, 1.2 + .8 * br()); }
      }, { y: 0, hexes: HX, top: 90, view: 900 });
      for (let i = 0; i < 3; i++) { const z = (i - 1) * 180, mm = mist({ n: 90, seed: 60 + i, r0: 10, r1: 95, y0: 3, y1: 16, spin: .05, rise: 0, size: 36, alpha: .1, col: [.45, 1, .9], add: true }); mm.position.set(c[0], heightAt(c[0], c[1] + z), c[1] + z); scene.add(mm); }
      for (let i = 0; i < 22; i++) { const x = c[0] + (br() - .5) * 180, z = c[1] + (br() - .5) * 540; lanternPts.push([x, heightAt(x, z) + 5 + 8 * br(), z, { c: [.5, 2.2, 1.8], size: 6, drift: 4, speed: .3 }]); } }

    // The Pillardrop (seven hexes): timber scaffolding climbs the chasm's ledges from the floor to the rim, with lit huts on the walkways, hoists on the rim running carts up and down, and small figures going about their work
    { const HX = [[6, 31], [6, 32], [7, 30], [7, 31], [8, 27], [9, 26], [9, 27]], a = CHASM.pts, n = a.length / 2, mi = n >> 1, mid = Wp([a[2 * mi], a[2 * mi + 1]]), BW = Wp(BR_P), decks = [], lifts = [], lit = glowM(0xffc878, 2.6);
      addThing('The Pillardrop', '🕳️', mid, 1, 30, g => {
        for (let i = 2; i < n - 2; i += 1) { const px = a[2 * i] * S, pz = a[2 * i + 1] * S, tx0 = a[2 * i + 2] - a[2 * i - 2], tz0 = a[2 * i + 3] - a[2 * i - 1], tl = Math.hypot(tx0, tz0), tx = tx0 / tl, tz = tz0 / tl, ry = -Math.atan2(tz, tx); if (Math.hypot(px - BW[0], pz - BW[1]) < 90) continue;
          for (const sd of [-1, 1]) { const nx = -tz * sd, nz = tx * sd, hs = []; for (let d = 0; d <= 130; d += 2) hs.push(heightAt(px + nx * d, pz + nz * d));
            const runs = []; let st = 0; for (let j = 1; j < hs.length; j++) if (Math.abs(hs[j] - hs[j - 1]) > 5) { if (j - 1 - st >= 3) runs.push([st, j - 1]); st = j; } if (hs.length - 1 - st >= 3) runs.push([st, hs.length - 1]);   // the level runs along this line: the floor, each ledge, and the ground above
            if (runs.length < 3) continue;
            for (let q = 1; q < runs.length; q++) { const lo = runs[q - 1], up = runs[q], dT = lo[1] * 2 - 1, x = px + nx * dT - mid[0], z = pz + nz * dT - mid[1], yl = hs[lo[1]], yu = hs[up[0]], hh = yu - yl; if (hh < 12 || hh > 130) continue;
              const lv = Math.max(2, Math.round(hh / 16)), st2 = hh / lv; for (const u of [-4, 4]) for (const v of [-2.6, 2.6]) M(g, new THREE.BoxGeometry(.9, hh + 3, .9), timber, x + tx * u + nx * v, yl + hh / 2, z + tz * u + nz * v);                       // a scaffold tower up the sheer run
              for (let j = 1; j <= lv; j++) { const yy = yl + st2 * j; M(g, new THREE.BoxGeometry(10, .5, 6.6), timber, x, yy, z, { ry }); M(g, new THREE.BoxGeometry(Math.hypot(st2, 8), .5, .5), timber, x - nx * 2.8, yy - st2 / 2, z - nz * 2.8, { ry, rz: (j % 2 ? 1 : -1) * Math.atan2(st2, 8) }); }
              if (q < runs.length - 1) { const dM = up[0] + Math.min(up[1], up[0] + 5), dx2 = px + nx * dM - mid[0], dz2 = pz + nz * dM - mid[1];                                                    // a walkway and a hut on the ledge above
                M(g, new THREE.BoxGeometry(26, .7, 8), timber, dx2, yu + .5, dz2, { ry }); M(g, new THREE.BoxGeometry(26, .5, .5), timber, dx2 - nx * 3.8, yu + 3, dz2 - nz * 3.8, { ry }); M(g, new THREE.BoxGeometry(7, 6, 6), LST, dx2 + tx * 8, yu + 3.4, dz2 + tz * 8, { ry });
                NS(M(g, new THREE.BoxGeometry(2.2, 2.4, 6.3), lit, dx2 + tx * 8, yu + 3.6, dz2 + tz * 8, { ry })); decks.push([mid[0] + dx2, yu + 1, mid[1] + dz2, tx, tz]); } }
            if (sd > 0 && (i % 4) === 2) { const top = runs[runs.length - 1], dR = top[0] * 2 + 4, x = px + nx * dR - mid[0], z = pz + nz * dR - mid[1], yR = hs[top[0] + 2], wx = px + nx * (dR - 17), wz = pz + nz * (dR - 17);                          // a hoist on the rim
              M(g, new THREE.BoxGeometry(1.6, 16, 1.6), timber, x, yR + 8, z); M(g, new THREE.BoxGeometry(20, 1.4, 1.4), timber, x - nx * 8, yR + 15, z - nz * 8, { ry: -Math.atan2(nz, nx) }); lifts.push([wx, wz, heightAt(wx, wz) + 2.5, yR + 13]); } } }
        // more on every ledge: a second stone front with its lit door, a cloth canopy over the hut, rail posts along the walkway, a ladder up to the next, a torch at each end
        { const cloth = [solid(0xb8a888, .95), solid(0x9a3a2c, .9)], tor = glowM(0xffa040, 2.8);
          decks.forEach(([wx, yy, wz, tx, tz], i) => { const x = wx - mid[0], z = wz - mid[1], ry = -Math.atan2(tz, tx), nx = -tz, nz = tx;
            M(g, new THREE.BoxGeometry(6.4, 5.2, 5.6), LDK, x - tx * 8.5, yy + 2.6, z - tz * 8.5, { ry }); NS(M(g, new THREE.BoxGeometry(1.8, 3, 5.9), lit, x - tx * 8.5, yy + 1.9, z - tz * 8.5, { ry })); M(g, new THREE.BoxGeometry(7.2, .7, 6.4), LST, x - tx * 8.5, yy + 5.5, z - tz * 8.5, { ry });
            M(g, new THREE.BoxGeometry(8.6, .3, 9.4), cloth[i % 2], x + tx * 8, yy + 7.3, z + tz * 8, { ry, rx: .12 });
            for (let u = -12; u <= 12; u += 4) for (const sd of [-1, 1]) M(g, new THREE.BoxGeometry(.45, 3, .45), timber, x + tx * u + nx * sd * 3.8, yy + 1.5, z + tz * u + nz * sd * 3.8);
            for (const sd of [-.5, .5]) M(g, new THREE.BoxGeometry(.3, 15, .3), timber, x + tx * (1 + sd * 2.4), yy + 7.5, z + tz * (1 + sd * 2.4)); for (let q = 0; q < 7; q++) M(g, new THREE.BoxGeometry(1.5, .25, .25), timber, x + tx, yy + 1.5 + q * 2, z + tz, { ry });
            for (const e of [-12.5, 12.5]) { M(g, new THREE.BoxGeometry(.3, 4, .3), timber, x + tx * e, yy + 2, z + tz * e); NS(M(g, new THREE.SphereGeometry(.55, 6, 5), tor, x + tx * e, yy + 4.4, z + tz * e)); lanternPts.push([wx + tx * e, yy + 4.6, wz + tz * e, { c: [2.7, 1.4, .4], size: 6, drift: .3, speed: .6 }]); } }); }
        // the lookout: a timber deck standing out over the drop from the rim, braced back to the cliff, railed on three sides; robed figures on it, and two ghosts - one the colour of flame, one of ice
        { const tx0 = a[2 * mi + 2] - a[2 * mi - 2], tz0 = a[2 * mi + 3] - a[2 * mi - 1], tl = Math.hypot(tx0, tz0), tx = tx0 / tl, tz = tz0 / tl, nx = -tz, nz = tx, ry = -Math.atan2(tz, tx), hAt = d => heightAt(mid[0] + nx * d, mid[1] + nz * d), top = hAt(150); let dR = 150; while (dR > 20 && hAt(dR - 2) > top - 4) dR -= 2;
          const px = nx * (dR - 9), pz = nz * (dR - 9), yD = top + 1; M(g, new THREE.BoxGeometry(30, .8, 22), timber, px, yD, pz, { ry });
          for (let u = -14; u <= 14; u += 4) M(g, new THREE.BoxGeometry(.35, .2, 22), LDK, px + tx * u, yD + .5, pz + tz * u, { ry });                                                                                       // its planking
          for (const u of [-13, 0, 13]) { M(g, new THREE.BoxGeometry(1.1, 34, 1.1), timber, px + tx * u - nx * 9, yD - 17, pz + tz * u - nz * 9); M(g, new THREE.BoxGeometry(1, 30, 1), timber, px + tx * u - nx * 1.5, yD - 12, pz + tz * u - nz * 1.5, { ry, rx: -.62 }); M(g, new THREE.BoxGeometry(1, 1, 20), timber, px + tx * u, yD - 1, pz + tz * u, { ry }); }
          for (let u = -14; u <= 14; u += 4) { M(g, new THREE.BoxGeometry(.6, 4.2, .6), timber, px + tx * u - nx * 10.6, yD + 2.3, pz + tz * u - nz * 10.6); } for (const u of [-14.6, 14.6]) for (let v = -10; v <= 6; v += 4) M(g, new THREE.BoxGeometry(.6, 4.2, .6), timber, px + tx * u + nx * v, yD + 2.3, pz + tz * u + nz * v);
          M(g, new THREE.BoxGeometry(30, .5, .5), timber, px - nx * 10.6, yD + 4.2, pz - nz * 10.6, { ry }); for (const u of [-14.6, 14.6]) M(g, new THREE.BoxGeometry(.5, .5, 18), timber, px + tx * u - nx * 2, yD + 4.2, pz + tz * u - nz * 2, { ry });
          const robe = solid(0x2b2630, .9); for (let i = 0; i < 8; i++) { const u = -11 + lr() * 22, v = -6 + lr() * 12; M(g, new THREE.CylinderGeometry(.25, 1.25, 4.6, 7), robe, px + tx * u + nx * v, yD + 2.7, pz + tz * u + nz * v); M(g, new THREE.SphereGeometry(.62, 7, 5), robe, px + tx * u + nx * v, yD + 5.4, pz + tz * u + nz * v); }
          for (const [u, v, col] of [[-3, -5, [1.7, .7, .12]], [5, -6, [.45, .85, 1.7]]]) { const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(col[0], col[1], col[2]), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }), gh = M(g, ghostGeo, gm, px + tx * u + nx * v, yD + .6, pz + tz * u + nz * v, { sx: .6, sy: .6, sz: .6 }); gh.userData.keepSep = 1; gh.userData.noShadow = true; gh.raycast = () => {};
            lanternPts.push([mid[0] + px + tx * u + nx * v, yD + 6, mid[1] + pz + tz * u + nz * v, { c: col.map(q => q * 1.5), size: 16, drift: .2, speed: .5 }]); } }
      }, { y: 0, hexes: HX, top: 90, view: 900 });
      // shafts of light slanting down into it, mist lying in the depths, and something blue glimmering a long way down
      { const rayM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
          vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ float rim = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vec3(1.0, 0.88, 0.62) * rim * rim * smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * 0.16, 1.0); }' });
        for (let q = 1; q <= 5; q++) { const i = Math.round(n * q / 6), x = a[2 * i] * S, z = a[2 * i + 1] * S, fl = heightAt(x, z); const m = new THREE.Mesh(new THREE.CylinderGeometry(16, 34, 520, 16, 1, true), rayM); m.position.set(x - 70, fl + 230, z - 30); m.rotation.set(.12, 0, -.3); m.raycast = () => {}; m.frustumCulled = false; scene.add(m);
          const mm = mist({ n: 90, seed: 300 + q, r0: 10, r1: 64, y0: 2, y1: 46, spin: .05, rise: .03, size: 36, alpha: .1, col: [.78, .8, .88] }); mm.position.set(x, fl, z); scene.add(mm);
          if (q === 3) lanternPts.push([x, fl + 6, z, { c: [.5, 1.2, 2.8], size: 26, drift: 3, speed: .25 }]); } }
      const cartG = new THREE.BoxGeometry(5, 3.4, 4), carts = lifts.map(([x, z, yA, yB]) => { const m = new THREE.Mesh(cartG, timber); m.raycast = () => {}; scene.add(m); const rope = new THREE.Mesh(new THREE.BoxGeometry(.3, yB - yA, .3), ironM); rope.position.set(x, (yA + yB) / 2, z); rope.raycast = () => {}; scene.add(rope); return m; });
      anim.push(t => { lifts.forEach(([x, z, yA, yB], i) => { carts[i].position.set(x, lerp(yA, yB - 3, .5 - .5 * Math.cos(t * .35 + i * 1.7)), z); }); });
      if (decks.length) { const NF = Math.min(90, decks.length * 2), fig = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 3, 1.1), solid(0x3a2c22, .9), NF); fig.frustumCulled = false; fig.raycast = () => {}; scene.add(fig);
        const fp = Array.from({ length: NF }, (_, i) => ({ d: decks[i % decks.length], ph: lr() * 6.3, sp: .25 + .3 * lr() }));
        anim.push(t => { fp.forEach((f, i) => { const u = 11 * Math.sin(t * f.sp + f.ph); dummy.position.set(f.d[0] + f.d[3] * u, f.d[1] + 1.5, f.d[2] + f.d[4] * u); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); fig.setMatrixAt(i, dummy.matrix); }); fig.instanceMatrix.needsUpdate = true; }); }
      window.__pd = { decks: decks.length, lifts: lifts.length }; }

    // Cold Anchor Stones (3,23): Lorehold's own stone, standing in the open
    { const c = Wp(COLDL), cy = heightAt(c[0], c[1]), gh = (x, z) => heightAt(c[0] + x, c[1] + z) - cy;
      addThing('Cold Anchor Stones', '🗿', c, 1, 30, g => anchorStone(g, gh), { y: cy, hexes: [[3, 23]], top: 84, view: 360 }); coldField(c[0], cy, c[1]);
      lanternPts.push([c[0], cy + 36, c[1], { c: [.9, 1.8, 2.8], size: 30, drift: .2, speed: .5 }]); }

    // the Large Pillars: one beside each road. Every thirty seconds, all together, the hammer drops and a wave of force rolls out from each for a hex or two
    for (const [q, r] of THUMP) { const c = hexW(q, r), y0 = heightAt(c[0], c[1]), col = glowM(0x9fb4ff, 2.6); let ham;
      addThing('Large Pillar', '🗼', c, 1, 30, g => { const k = kit(g); k.C(13, 17, 10, 8, LDK, 0, 5, 0); for (let i = 0; i < 3; i++) { const a = i * 2.094 + .4; k.B(3, 40, 3, ironM, Math.cos(a) * 15, 16, Math.sin(a) * 15, { rz: Math.cos(a) * .5, rx: -Math.sin(a) * .5 }); }
        k.C(5.4, 7.4, 160, 8, LST, 0, 90, 0); for (let j = 0; j < 6; j++) k.T(7.6 - j * .3, 1, brassM, 0, 30 + j * 26, 0, { rx: Math.PI / 2 }); for (let i = 0; i < 4; i++) NS(k.B(.8, 120, .8, col, Math.cos(i * 1.571) * 6.6, 95, Math.sin(i * 1.571) * 6.6));
        k.C(9, 6, 8, 8, brassM, 0, 172, 0); NS(M(g, new THREE.OctahedronGeometry(7, 0), col, 0, 186, 0)); for (let i = 0; i < 4; i++) { const a = i * 1.571 + .78; k.B(1, 20, 1, brassM, Math.cos(a) * 7, 184, Math.sin(a) * 7, { rz: Math.cos(a) * .3, rx: -Math.sin(a) * .3 }); }
        ham = M(g, new THREE.CylinderGeometry(13, 13, 15, 8), ironM, 0, 130, 0); ham.userData.keepSep = 1;
      }, { y: y0, hexes: [[q, r]], top: 200, view: 520 });
      const sh = fieldShell([.55, .65, 1.4], 0); sh.position.set(c[0], y0 + 4, c[1]); sh.visible = false; scene.add(sh);
      anim.push(t => { const cc = t % 30, k2 = cc < 3.2 ? cc / 3.2 : 1; sh.visible = cc < 3.2; if (sh.visible) { sh.scale.setScalar(14 + 250 * Math.pow(k2, .75)); sh.material.uniforms.uK.value = 1.3 * Math.pow(1 - k2, 1.4); }
        const pre = cc > 29.75 ? (cc - 29.75) / .25 : 0, u = Math.min(cc / 4, 1); ham.position.y = cc < 4 ? 28 + 102 * u * u * (3 - 2 * u) : 130 - 102 * pre * pre; });
      lanternPts.push([c[0], y0 + 186, c[1], { c: [1.2, 1.5, 2.8], size: 22, drift: .2, speed: .6 }]); }
  }

  // ================= Quandrix locations from the live map =================
  { const QST = solid(0xdad6c8, .7), QDK = solid(0x3a5f66, .5), tealG = glowM(0x35e0c8, 2.2), hedge = solid(0x1f4a2a, 1, { flatShading: true }), qr = mulberry32(3141);
    const crystal = new THREE.MeshStandardMaterial({ color: 0x9fe8e0, emissive: 0x2a9a90, emissiveIntensity: .9, roughness: .1, transparent: true, opacity: .82, flatShading: true });
    const cenW = hx => { const p = hx.map(([q, r]) => hexW(q, r)); return [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length]; };
    const qTick = function (r2, s2, c2, g2, mat) { if (mat.uniforms && mat.uniforms.uTime) mat.uniforms.uTime.value = U.uTime.value; };
    const qbake = (g, sub) => { sub.updateMatrix(); for (const m of [...sub.children]) { m.applyMatrix4(sub.matrix); g.add(m); } };
    const terrainRibbon = (P, hw, mat) => { const C = []; for (let i = 0; i < P.length - 1; i++) { const n = Math.ceil(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) / 5); for (let j = 0; j < n; j++) C.push([lerp(P[i][0], P[i + 1][0], j / n), lerp(P[i][1], P[i + 1][1], j / n)]); } C.push(P[P.length - 1]);
      const pos = [], uv = [], idx = []; C.forEach((p, i) => { const a = C[Math.max(i - 1, 0)], b = C[Math.min(i + 1, C.length - 1)], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl * hw, nz = tx / tl * hw, yy = Math.max(heightAt(p[0] - nx, p[1] - nz), heightAt(p[0] + nx, p[1] + nz), heightAt(p[0], p[1])) + 1.2;
        pos.push(p[0] - nx, yy, p[1] - nz, p[0] + nx, yy, p[1] + nz); uv.push(0, i / 5, 1, i / 5); if (i) { const q = i * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); } });
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals(); const m = new THREE.Mesh(ge, mat); m.raycast = () => {}; scene.add(m); };
    // ready-made animated animals: the horse and birds from three.js's examples (models by Mirada, from ro.me), kept beside this page in models/ and scaled up; if one is missing the map simply goes without it
    const GL = new GLTFLoader(), GLB = 'models/';
    const beast = (file, size, dur, place) => GL.load(GLB + file, gltf => { const m = gltf.scene.children[0] || gltf.scene, sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()), holder = new THREE.Group(); m.scale.multiplyScalar(size / Math.max(sz.x, sz.y, sz.z)); holder.add(m);
        holder.traverse(o => { if (o.isMesh) { o.castShadow = false; o.raycast = () => {}; o.frustumCulled = false; } }); scene.add(holder); const mixer = new THREE.AnimationMixer(m); if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).setDuration(dur).play();
        anim.push((t, dt) => { mixer.update(Math.min(dt || 0, .1)); place(holder, t); }); (window.__beasts = window.__beasts || []).push(file); }, undefined, () => console.warn('animal model not loaded: ' + file));
    // small animals that move as a herd round a ring: every one keeps its place in the herd while the herd wanders on
    const critterGeo = mergeGeometries([new THREE.BoxGeometry(2.6, 1, 1.2).translate(0, 1.1, 0), new THREE.BoxGeometry(1, .9, 1).translate(1.7, 1.5, 0), new THREE.BoxGeometry(.4, 1.1, 1.8).translate(.8, .5, 0), new THREE.BoxGeometry(.4, 1.1, 1.8).translate(-.8, .5, 0)]);
    const herds = (c, list, col) => { const tot = list.reduce((a, v) => a + v.n, 0), aH = new Float32Array(tot * 4), aG = new Float32Array(tot * 3), hr = mulberry32(77); let o = 0;
      list.forEach((hd, hi) => { for (let i = 0; i < hd.n; i++, o++) { aH[4 * o] = hd.R + (hr() - .5) * hd.w; aH[4 * o + 1] = hd.a0 + (hr() - .5) * hd.spread; aH[4 * o + 2] = hd.speed; aH[4 * o + 3] = hd.y; aG[3 * o] = hd.size * (.7 + .6 * hr()); aG[3 * o + 1] = hr() * 6.3; aG[3 * o + 2] = hi * 2.3; } });
      const ig = new THREE.InstancedBufferGeometry(); ig.index = critterGeo.index; ig.setAttribute('position', critterGeo.attributes.position); ig.setAttribute('normal', critterGeo.attributes.normal); ig.setAttribute('aH', new THREE.InstancedBufferAttribute(aH, 4)); ig.setAttribute('aG', new THREE.InstancedBufferAttribute(aG, 3)); ig.instanceCount = tot;
      const m = new THREE.Mesh(ig, new THREE.ShaderMaterial({ fog: false, uniforms: { uTime: U.uTime, uC: { value: new THREE.Vector3(c[0], 0, c[1]) }, uCol: { value: new THREE.Vector3(col[0], col[1], col[2]) } },
        vertexShader: 'attribute vec4 aH; attribute vec3 aG; uniform vec3 uC; uniform float uTime; varying float vL; void main(){ float th = aH.y + uTime * aH.z + 0.3 * sin(uTime * 0.21 + aG.z); vec2 rd = vec2(cos(th), sin(th)); vec2 hd = vec2(-rd.y, rd.x) * sign(aH.z); float rr = aH.x + 2.5 * sin(uTime * 0.4 + aG.y); vec3 p = position * aG.x;' +
          ' vec3 w = vec3(uC.x + rd.x * rr + hd.x * p.x - hd.y * p.z, aH.w + abs(sin(uTime * 6.0 + aG.y)) * 0.5 + p.y, uC.z + rd.y * rr + hd.y * p.x + hd.x * p.z); vec3 nn = vec3(hd.x * normal.x - hd.y * normal.z, normal.y, hd.y * normal.x + hd.x * normal.z); vL = 0.5 + 0.7 * max(dot(nn, vec3(-0.59, 0.66, -0.45)), 0.0); gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }',
        fragmentShader: 'uniform vec3 uCol; varying float vL; void main(){ gl_FragColor = vec4(uCol * vL, 1.0); }' })); m.frustumCulled = false; m.raycast = () => {}; scene.add(m); };

    // Deathfall (three hexes): rune-cut cubes hang in the air round a tall pillar, each burning with a different figure, set out like a platformer's course - each a jump from the last.
    // Every ten seconds two of them trade places; every minute the whole course flies apart and reforms as a different one
    { const HX = [[9, 16], [10, 16], [9, 17]], c = cenW(HX), y0 = heightAt(c[0], c[1]), cubes = [], grn = glowM(0x58ffa8, 2.6), NC = 16;
      const pats = [(cx, w) => { cx.font = 'bold 44px monospace'; const r = mulberry32(5); for (let i = 0; i < 9; i++) cx.fillText(String(Math.floor(r() * 90 + 2)), 34 + (i % 3) * 68, 78 + Math.floor(i / 3) * 62); },
        (cx, w) => { for (const r of [28, 58, 88]) { cx.beginPath(); cx.arc(w / 2, w / 2, r, 0, 6.283); cx.stroke(); } cx.beginPath(); cx.moveTo(w / 2, 30); cx.lineTo(w / 2, w - 30); cx.moveTo(30, w / 2); cx.lineTo(w - 30, w / 2); cx.stroke(); },
        (cx, w) => { const tri = (ax, ay, bx, by, qx, qy, d) => { cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(bx, by); cx.lineTo(qx, qy); cx.closePath(); cx.stroke(); if (d) { const abx = (ax + bx) / 2, aby = (ay + by) / 2, bqx = (bx + qx) / 2, bqy = (by + qy) / 2, qax = (qx + ax) / 2, qay = (qy + ay) / 2; tri(ax, ay, abx, aby, qax, qay, d - 1); tri(abx, aby, bx, by, bqx, bqy, d - 1); tri(qax, qay, bqx, bqy, qx, qy, d - 1); } }; cx.lineWidth = 3; tri(34, 214, 222, 214, 128, 44, 3); },
        (cx, w) => { cx.beginPath(); for (let a = 0; a < 19; a += .1) { const r = 4 + a * 5.2; cx.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } cx.stroke(); },
        (cx, w) => { const r = mulberry32(8); for (let i = 0; i < 36; i++) { cx.beginPath(); cx.arc(48 + (i % 6) * 32, 48 + Math.floor(i / 6) * 32, 9, 0, 6.283); if (r() < .5) cx.fill(); else cx.stroke(); } },
        (cx, w) => { for (let q = 0; q < 3; q++) { cx.beginPath(); for (let x = 30; x <= w - 30; x += 4) cx.lineTo(x, w / 2 + Math.sin(x * (.035 + q * .02) + q) * (60 - q * 16)); cx.stroke(); } cx.lineWidth = 2; cx.beginPath(); cx.moveTo(30, w / 2); cx.lineTo(w - 30, w / 2); cx.stroke(); }];
      const mats = pats.map((draw, i) => new THREE.MeshStandardMaterial({ color: 0x2c363c, roughness: .55, emissive: [0x58ffa8, 0x58ffa8, 0x7dffd8, 0x9dff70, 0x58ffa8, 0x7dffd8][i], emissiveIntensity: 1.7, emissiveMap: canvasTex(256, 256, (cx, w, hgt) => { cx.fillStyle = '#000'; cx.fillRect(0, 0, w, hgt); cx.strokeStyle = '#fff'; cx.fillStyle = '#fff'; cx.lineWidth = 4; cx.strokeRect(12, 12, w - 24, hgt - 24); draw(cx, w); }) }));
      // five formations of the sixteen cubes, every one still a course you could jump along: a climbing spiral, one level ring, two level rings at different heights, two flights of a switchback stair, and a double helix
      const FORM = [
        (() => { const P = []; let a = 0; for (let i = 0; i < NC; i++) { const r = 132 - i * 5.8; P.push([Math.cos(a) * r, 26 + i * 13.6, Math.sin(a) * r]); a += 41 / Math.max(r, 30); } return P; })(),
        Array.from({ length: NC }, (_, i) => { const a = i / NC * 6.283; return [Math.cos(a) * 96, 150, Math.sin(a) * 96]; }),
        Array.from({ length: NC }, (_, i) => { const up = i >= 8, j = i % 8, a = up ? j / 8 * 6.283 + .4 : j * .37 + 2.2, r = up ? 54 : 112; return [Math.cos(a) * r, up ? 198 : 96, Math.sin(a) * r]; }),
        Array.from({ length: NC }, (_, i) => { const up = i >= 8, j = i % 8; return [up ? 124 - j * 35 : -121 + j * 35, 34 + i * 13.4, up ? -58 : 58]; }),
        Array.from({ length: NC }, (_, i) => { const st = i % 2, j = i >> 1, a = j * .62 + st * Math.PI; return [Math.cos(a) * 84, 44 + j * 26 + st * 6, Math.sin(a) * 84]; })];
      const swapsOf = kk => [1, 2, 3, 4, 5].map(j => { const a = (((kk * 7 + j * 5) % NC) + NC) % NC; return [a, (a + 3 + (((kk + j) % 9) + 9) % 9) % NC]; });           // which two places trade cubes at each ten-second mark of a given minute
      const slotOf = new Int32Array(NC), prevSlot = new Int32Array(NC);
      addThing('Deathfall', '🎲', c, 1, 30, g => { const k = kit(g); k.C(8, 12, 250, 8, QDK, 0, 125, 0); for (let j = 0; j < 7; j++) NS(k.T(11.4 - j * .5, .8, grn, 0, 20 + j * 36, 0, { rx: Math.PI / 2 })); k.C(22, 10, 8, 8, QDK, 0, 252, 0); NS(M(g, new THREE.OctahedronGeometry(9, 0), grn, 0, 272, 0));
        for (let i = 0; i < NC; i++) { const m = M(g, new THREE.BoxGeometry(24, 24, 24), mats[i % 6], 0, 100, 0); m.userData.keepSep = 1; m.userData.noShadow = true; cubes.push(m); }
      }, { y: y0, hexes: HX, top: 290, view: 760 });
      anim.push(t => { const kk = Math.floor(t / 60), tc = t - kk * 60, F1 = FORM[kk % 5], F0 = FORM[(kk + 4) % 5];
        for (let i = 0; i < NC; i++) { slotOf[i] = i; prevSlot[i] = i; } for (const [a, b] of swapsOf(kk - 1)) { const ia = prevSlot.indexOf(a), ib = prevSlot.indexOf(b); prevSlot[ia] = b; prevSlot[ib] = a; }                                     // where each cube ended the last minute
        let mA = -1, mB = -1, me = 0; const sw = swapsOf(kk); for (let j = 1; j <= 5; j++) { const [a, b] = sw[j - 1], ia = slotOf.indexOf(a), ib = slotOf.indexOf(b); if (tc >= j * 10 + 3) { slotOf[ia] = b; slotOf[ib] = a; } else { if (tc >= j * 10) { mA = ia; mB = ib; me = sstep(j * 10, j * 10 + 3, tc); } break; } }
        cubes.forEach((m, i) => { let p = F1[slotOf[i]], x = p[0], y = p[1], z = p[2];
          if (i === mA || i === mB) { const q = F1[slotOf[i === mA ? mB : mA]]; x = lerp(x, q[0], me); z = lerp(z, q[2], me); y = lerp(y, q[1], me) + 34 * Math.sin(Math.PI * me) * (i === mA ? 1 : -1); }                                   // the two that are trading places pass over and under one another
          const e = sstep(i * .15, i * .15 + 3.4, tc); if (e < 1) { const o = F0[prevSlot[i]]; x = lerp(o[0], x, e); z = lerp(o[2], z, e); y = lerp(o[1], y, e) + 30 * Math.sin(Math.PI * e) * (i % 2 ? 1 : -.4); }                                  // the minute turns: every cube flies to its place in the new formation
          m.position.set(x, y + Math.sin(t * .8 + i * 1.7) * 1.8, z); m.rotation.y = -Math.atan2(z, x); }); });
      lanternPts.push([c[0], y0 + 272, c[1], { c: [.6, 2.6, 1.4], size: 30, drift: .2, speed: .5 }]); }

    // Great Refractory (18,12): a great faceted mirror in a spoked frame between two pylons, lesser mirrors on arms beside it. Stairs come down from its middle to a landing, and from the landing a long ramp on piers runs down to the roof of Torus Hall
    { const c = hexW(18, 12), y0 = heightAt(c[0], c[1]), TC = Wp(TORUS), MR = 44, MY = 64, zL = 70, yL = 16, zH = TC[1] - c[1] - 104, yH = heightAt(TC[0], TC[1]) + 21.6 * 2.6 - y0, gy = z => heightAt(c[0], c[1] + z) - y0;
      const mirM = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, side: THREE.DoubleSide, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec2 vUv; uniform float uTime; vec2 h2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }' +
          ' void main(){ vec2 p = (vUv - 0.5) * 12.0; vec2 ip = floor(p); vec2 fp = fract(p); float md = 9.0; vec2 id = vec2(0.0); for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 gg = vec2(float(i), float(j)); vec2 o = h2(ip + gg); float d = length(gg + o - fp); if (d < md) { md = d; id = ip + gg; } }' +
          ' vec2 hh = h2(id + 3.7); float ph = uTime * (0.12 + 0.25 * hh.x) + hh.y * 7.0; vec2 sc = h2(id + floor(ph)); vec3 sky = 0.5 + 0.5 * cos(6.283 * (sc.x + vec3(0.0, 0.33, 0.67))); float hz = smoothstep(0.4, 0.6, fract(vUv.y * 2.0 + sc.y));' +
          ' vec3 col = mix(sky * 0.3, sky, hz) * (0.7 + 0.6 * md) * smoothstep(0.0, 0.12, fract(ph)); gl_FragColor = vec4(mix(vec3(0.62, 0.68, 0.74) * (0.7 + 0.5 * md), col, 0.55) * 1.15, 1.0); }' });
      addThing('Great Refractory', '🪞', c, 1, 30, g => { const k = kit(g), mir = M(g, new THREE.CircleGeometry(MR, 64), mirM, 0, MY, 0); mir.onBeforeRender = qTick; mir.userData.noShadow = true; mir.userData.keepSep = 1;
        k.T(MR + .8, 2.2, gold, 0, MY, 0); k.T(MR + 7, 1, QDK, 0, MY, -.8); for (let i = 0; i < 12; i++) { const a = i * .5236; k.B(1, 7, 1, gold, Math.cos(a) * (MR + 4), MY + Math.sin(a) * (MR + 4), -.8, { rz: a - Math.PI / 2 }); M(g, new THREE.OctahedronGeometry(2.4, 0), crystal, Math.cos(a) * (MR + 10.5), MY + Math.sin(a) * (MR + 10.5), -.8, { sy: 1.8, rz: a - Math.PI / 2 }); }
        for (const sd of [-1, 1]) { k.C(3, 6, MY + MR + 22, 6, QDK, sd * (MR + 9), (MY + MR + 22) / 2, -12); NS(M(g, new THREE.OctahedronGeometry(4.4, 0), tealG, sd * (MR + 9), MY + MR + 28, -12)); k.B(6, 4, 14, QDK, sd * (MR + 5), MY, -6); k.B(3, MY * 1.1, 3, QDK, sd * (MR * .55), MY * .5, -17, { rx: -.28 });
          const sm = M(g, new THREE.CircleGeometry(13, 32), mirM, sd * (MR + 30), 34, 8, { ry: -sd * .5 }); sm.onBeforeRender = qTick; sm.userData.keepSep = 1; sm.userData.noShadow = true; k.T(13.6, 1.2, gold, sd * (MR + 30), 34, 8, { ry: -sd * .5 }); k.C(1.6, 2.8, 22, 6, QDK, sd * (MR + 30), 11, 7); }
        k.B(MR * 2 + 34, 4, 28, QST, 0, 2, -8); k.B(MR * 2 + 20, 4, 20, QST, 0, 6, -8);
        // stairs from the middle of the mirror down to the landing
        const NS2 = 22; for (let i = 0; i < NS2; i++) { const f = (i + .5) / NS2; k.B(9, 1.4, (zL - 6) / NS2 + .5, QST, 0, lerp(MY, yL, f), lerp(6, zL, f)); } const sa = Math.atan2(MY - yL, zL - 6), sl = Math.hypot(MY - yL, zL - 6); for (const sd of [-1, 1]) k.B(.6, .6, sl, gold, sd * 4.4, (MY + yL) / 2 + 3.4, (6 + zL) / 2, { rx: sa });
        for (const z of [26, 48]) { const top = lerp(MY, yL, (z - 6) / (zL - 6)) - 1, lo = gy(z); k.B(3, top - lo, 3, QDK, 0, (top + lo) / 2, z); }
        k.C(6, 6, 1.2, 12, QST, 0, MY - .2, 4); k.C(10, 10, 1.6, 12, QST, 0, yL, zL + 8); { const lo = gy(zL + 8); k.C(4, 6, yL - lo, 8, QDK, 0, (yL + lo) / 2, zL + 8); }
        // the ramp on from the landing to the hall
        const z0 = zL + 16, ra = Math.atan2(yL - yH, zH - z0), rl = Math.hypot(yL - yH, zH - z0); k.B(8, 1.2, rl, QST, 0, (yL + yH) / 2, (z0 + zH) / 2, { rx: ra }); for (const sd of [-1, 1]) k.B(.6, .6, rl, gold, sd * 4, (yL + yH) / 2 + 3.2, (z0 + zH) / 2, { rx: ra });
        for (let i = 1; i < 4; i++) { const z = lerp(z0, zH, i / 4), top = lerp(yL, yH, i / 4) - 1, lo = gy(z); if (top - lo > 3) { k.B(2.6, top - lo, 2.6, QDK, 0, (top + lo) / 2, z); M(g, new THREE.TorusGeometry(5, .7, 5, 10, Math.PI), QDK, 0, top - 5.4, z, { ry: Math.PI / 2 }); } }
        k.C(7, 7, 1.4, 12, QST, 0, yH, zH + 4); for (const sd of [-1, 1]) k.B(1.4, 9, 1.4, gold, sd * 5, yH + 4.5, zH + 6); k.B(11.4, 1.4, 1.4, gold, 0, yH + 9, zH + 6);                         // where it lands on the hall's roof: a small gold gate
      }, { y: y0, hexes: [[18, 12]], top: MY + MR + 40, view: 520 }); }

    // Cold Anchor Stones (26,8): Quandrix's own stone
    { const c = hexW(26, 8), cy = heightAt(c[0], c[1]), gh = (x, z) => heightAt(c[0] + x, c[1] + z) - cy; addThing('Cold Anchor Stones', '🗿', c, 1, 30, g => anchorStone(g, gh), { y: cy, hexes: [[26, 8]], top: 84, view: 360 }); coldField(c[0], cy, c[1]);
      lanternPts.push([c[0], cy + 36, c[1], { c: [.9, 1.8, 2.8], size: 30, drift: .2, speed: .5 }]); }

    // Chalkfall Cliffs (13,15): a mesa with a snowflake's outline stands against the north edge; a river of chalk runs across its top and pours off the southern point, and the dust settles below in a fan of swirls
    { const c = hexW(13, 15), mx = MESA[0] * S, mz = MESA[1] * S, topY = heightAt(mx, mz + 60), chalkF = fallMat('#dcdacf', '#ffffff', 0x55554e, .95, -.45), chalkR = flowMat('#dcdacf', '#ffffff', 0x3a3a34, .95, .3);
      let lipZ = mz + 60; while (lipZ < mz + 230 && heightAt(mx, lipZ) > topY - 25) lipZ += 3; const botY = heightAt(mx, lipZ + 40);
      addThing('Chalkfall Cliffs', '🏔️', c, 1, 30, g => { for (const [dx, w, zo, lo] of [[0, 13, 0, .3], [-9, 7, 3, .46], [10, 6, -2, .54], [3, 5, 1.5, .62]]) { const ge = new THREE.PlaneGeometry(w, 1, 2, 12), p = ge.attributes.position;                                   // each sheet stops short of the ground, and narrows and frays as it goes
          for (let j = 0; j < p.count; j++) { const v0 = p.getY(j) + .5, v = lerp(lo, 1, v0), thin = .45 + .55 * v0; p.setXYZ(j, mx - c[0] + p.getX(j) * thin + dx + Math.sin(v0 * 5 + dx) * 1.4 * (1 - v0), lerp(botY, topY - 2, v), lipZ - c[1] + 2 + zo + 24 * (1 - v) * (1 - v)); } ge.computeVertexNormals(); NS(M(g, ge, chalkF, 0, 0, 0)); }
        const k = kit(g); for (let i = 0; i < 9; i++) { const a = -1.2 + i * .3, x = Math.sin(a) * 100, z = lipZ - c[1] + 54 + Math.cos(a) * 82; k.B(3, 6, 3, QST, x, heightAt(c[0] + x, c[1] + z) + 3, z); }
      }, { y: 0, hexes: [[13, 15]], top: topY + 30, view: 560 });
      const dm = mist({ n: 170, seed: 81, r0: 8, r1: 78, y0: 2, y1: 74, spin: .12, rise: .07, pow: .8, size: 32, alpha: .24, col: [.95, .95, .92] }); dm.position.set(mx, botY, lipZ + 34); scene.add(dm);
      { const n = 560, r = mulberry32(815), aP = new Float32Array(n * 4); for (let i = 0; i < n; i++) { aP[4 * i] = (r() - .5) * 2; aP[4 * i + 1] = r(); aP[4 * i + 2] = .06 + .06 * r(); aP[4 * i + 3] = 4 + 8 * r(); }
        const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); ge.setAttribute('aP', new THREE.BufferAttribute(aP, 4));
        const dust = new THREE.Points(ge, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uTime: U.uTime, uScale: FXSCALE, uO: { value: new THREE.Vector3(mx, topY - 2, lipZ + 2) }, uH: { value: topY - 2 - botY } },
          vertexShader: 'attribute vec4 aP; uniform float uTime, uScale, uH; uniform vec3 uO; varying float vA;' +
            'void main(){ float f = fract(aP.y + uTime * aP.z), fall = f * (0.3 + 0.7 * f);' +                                                              // slow off the lip, then dropping away
            ' vec3 p = uO + vec3(aP.x * (6.5 + 34.0 * f * f) + sin(uTime * 0.6 + aP.y * 40.0) * 7.0 * f, -uH * fall, 2.0 + 30.0 * f + aP.x * aP.x * 16.0 * f);' +   // widening and drifting out as it falls
            ' vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float sz = aP.w * (1.0 + 4.5 * f) * uScale / -mv.z; gl_PointSize = clamp(sz, 1.0, 300.0);' +
            ' vA = smoothstep(0.0, 0.05, f) * pow(1.0 - f, 1.25) * min(1.0, sz / 2.0); }',
          fragmentShader: 'varying float vA; void main(){ float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(0.96, 0.95, 0.91, a * vA * 0.55); }' }));
        dust.frustumCulled = false; dust.raycast = () => {}; scene.add(dust); }
      terrainRibbon([[mx, mz - 14], [mx - 9, mz + 36], [mx + 9, lipZ - 44], [mx, lipZ]], 8, chalkR); }

    // Origami Gorge (13,18): a long winding gorge with a river in it, shallowing away to nothing at both ends. A bridge folded out of paper crosses it; paper darts fly its length and paper boats ride the water
    { const c = hexW(13, 18), A = [.984, -.179], B = [.179, .984], paper = tx(new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: .9, side: THREE.DoubleSide, flatShading: true }), 'paper'), fold = applyTex(new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: .9, side: THREE.DoubleSide, flatShading: true }), 'fold'), by = Math.max(heightAt(c[0] + B[0] * 62, c[1] + B[1] * 62), heightAt(c[0] - B[0] * 62, c[1] - B[1] * 62)) + 3, fliers = [], boats = [];
      const ga = GORGE.pts, gn = ga.length / 2, GP = u => { const f = clamp(u, 0, 1) * (gn - 1), i = Math.min(Math.floor(f), gn - 2), fr = f - i, tx = ga[2 * i + 2] - ga[2 * i], tz = ga[2 * i + 3] - ga[2 * i + 1], tl = Math.hypot(tx, tz) || 1; return [lerp(ga[2 * i], ga[2 * i + 2], fr) * S, lerp(ga[2 * i + 1], ga[2 * i + 3], fr) * S, tx / tl, tz / tl]; };
      const dart = (() => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute([6, 0, 0, -5, 0, 4.4, -5, 1.2, 0, 6, 0, 0, -5, 1.2, 0, -5, 0, -4.4, 6, 0, 0, -5, 1.2, 0, -5, -2.2, 0], 3)); ge.computeVertexNormals(); return ge; })();
      addThing('Origami Gorge', '🕊️', c, 1, 30, g => { const ry = -Math.atan2(B[1], B[0]);
        for (let i = 0; i < 12; i++) { const u = -55 + i * 10; M(g, new THREE.BoxGeometry(11, .5, 16), paper, B[0] * u, by + (i % 2 ? 1.6 : 0) + 7 * (1 - (u / 60) * (u / 60)), B[1] * u, { ry, rz: (i % 2 ? 1 : -1) * .3 }); }
        for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const u = -50 + i * 20; M(g, new THREE.ConeGeometry(4, 9, 3), paper, B[0] * u + A[0] * sd * 9, by + 9 + 7 * (1 - (u / 60) * (u / 60)), B[1] * u + A[1] * sd * 9, { ry: ry + i }); }
      }, { y: 0, hexes: [[13, 18]], top: by + 40, view: 620 });
      for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(dart, fold); m.scale.setScalar(1.3 + (i % 3) * .5); m.raycast = () => {}; m.frustumCulled = false; scene.add(m); fliers.push(m); }
      for (let i = 0; i < 4; i++) { const b = new THREE.Group(); M(b, new THREE.ConeGeometry(3, 9, 4), fold, 0, 1, 0, { rz: Math.PI / 2, sz: .5 }); M(b, new THREE.ConeGeometry(2.2, 5, 3), fold, 0, 3.6, 0); b.traverse(m => { m.raycast = () => {}; }); scene.add(b); boats.push(b); }
      anim.push(t => { fliers.forEach((m, i) => { const w = .05 + .012 * (i % 4), ph = t * w + i * 1.3, p = GP(.5 + .42 * Math.sin(ph)), sg = Math.cos(ph) > 0 ? 1 : -1, lat = 10 * Math.sin(t * .6 + i * 2); m.position.set(p[0] - p[3] * lat, 16 + (i % 6) * 5 + 6 * Math.sin(t * .5 + i), p[1] + p[2] * lat); m.rotation.set(0, Math.atan2(-p[3] * sg, p[2] * sg), .2 * Math.cos(t * .6 + i * 2), 'YXZ'); });
        boats.forEach((b, i) => { const ph = t * .03 + i * 1.6, p = GP(.5 + .24 * Math.sin(ph)), sg = Math.cos(ph) > 0 ? 1 : -1, lat = (i - 1.5) * 4; b.position.set(p[0] - p[3] * lat, .6 + .3 * Math.sin(t + i), p[1] + p[2] * lat); b.rotation.y = Math.atan2(-p[3] * sg, p[2] * sg); }); }); }

    // Terraced Beastward (three hexes): a hill cut into fenced terraces, each with its own weather kept by standing stones. A giant horse paces one terrace and a giant bird circles overhead; on the others, herds of very small animals drift round together
    { const HX = [[11, 18], [11, 17], [10, 18]], c = Wp(BEAST), lvl = j => (22 + 9.5 * j) * S, rad = j => (80 - 12.8 * (j + .5)) * S;
      addThing('Terraced Beastward', '🦬', c, 1, 30, g => { const k = kit(g), fence = solid(0x6a5238, .9);
        for (let j = 1; j <= 5; j++) { const Rr = (80 - 12.8 * j) * S - 2.5, yy = lvl(j); M(g, new THREE.TorusGeometry(Rr, .35, 4, 72), fence, 0, yy + 3.2, 0, { rx: Math.PI / 2 }); const n = Math.round(Rr * 6.283 / 10); for (let i = 0; i < n; i++) { const a = i / n * 6.283; k.B(.8, 4, .8, fence, Math.cos(a) * Rr, yy + 2, Math.sin(a) * Rr); } }
        for (let j = 0; j < 5; j++) for (let q = 0; q < 3; q++) { const a = j * 1.3 + q * 2.094, Rr = rad(j); k.B(3, 11, 2.4, QST, Math.cos(a) * Rr, lvl(j) + 5, Math.sin(a) * Rr, { ry: a }); }
        k.C(10, 12, 3, 12, QST, 0, lvl(5) + 1.5, 0);
        // and on the very top, a cat the size of a house: sitting, watching, its tail never quite still
        { const fur = new THREE.MeshStandardMaterial({ roughness: .95, map: canvasTex(256, 256, (cx, w, hgt) => { cx.fillStyle = '#8f887a'; cx.fillRect(0, 0, w, hgt); const r = mulberry32(12); cx.strokeStyle = '#3d382f'; cx.lineCap = 'round'; for (let i = 0; i < 22; i++) { cx.lineWidth = 5 + 7 * r(); cx.globalAlpha = .55 + .4 * r(); cx.beginPath(); let x = i * 12 + 4, y = 0; cx.moveTo(x, y); while (y < hgt) { x += (r() - .5) * 14; y += 26; cx.lineTo(x, y); } cx.stroke(); } cx.globalAlpha = 1; }) });
          const pale = solid(0xd9d2c2, .95), pink = solid(0xd98a8a, .8), eyeG = glowM(0xb8ff4a, 2.6), pupil = solid(0x08080a, .4), cat = new THREE.Group(), E = (grp, r, mat, x, y, z, sx, sy, sz) => M(grp, new THREE.SphereGeometry(r, 16, 12), mat, x, y, z, { sx, sy, sz });
          cat.position.set(0, lvl(5) + 3, 0); cat.rotation.y = -.9; cat.scale.setScalar(1.45); g.add(cat); const bodyG = new THREE.Group(); cat.add(bodyG);
          E(bodyG, 12, fur, -2, 13, 0, 1.05, 1.25, 1.2); E(bodyG, 9, fur, 5, 21, 0, 1, 1.3, 1); E(bodyG, 6.4, pale, 9.6, 19, 0, .7, 1.2, .8); E(bodyG, 6.6, fur, 7.5, 30, 0, 1, 1, 1);                                              // haunches, chest, bib, neck
          for (const sd of [-1, 1]) { E(bodyG, 7, fur, -1, 6.4, sd * 9, 1.3, 1, .8); E(bodyG, 3.2, pale, 8.5, 1.8, sd * 9.4, 1.8, .6, 1); M(bodyG, new THREE.CylinderGeometry(2.7, 2.2, 20, 10), fur, 10.5, 11, sd * 4.6); E(bodyG, 3, pale, 11.6, 1.7, sd * 4.6, 1.3, .6, 1); }   // thighs, hind paws, forelegs, forepaws
          mergeKids(bodyG);
          const head = new THREE.Group(); head.position.set(9.5, 37, 0); cat.add(head); E(head, 8, fur, 0, 0, 0, 1, .92, 1.08); E(head, 3.7, pale, 6.4, -2.2, 0, 1, .7, 1.25); E(head, .9, pink, 9.6, -1.2, 0, 1, .8, 1.2);
          const ears = [-1, 1].map(sd => { const ear = new THREE.Group(); ear.position.set(-.5, 6.2, sd * 4.8); M(ear, new THREE.ConeGeometry(3.3, 6.6, 4), fur, 0, 3, 0, { ry: .785, rx: sd * .18 }); M(ear, new THREE.ConeGeometry(2, 4.4, 4), pink, .9, 2.6, 0, { ry: .785, rx: sd * .18 }); head.add(ear); return ear; });
          const eyes = [-1, 1].map(sd => { const ey = new THREE.Group(); ey.position.set(6.3, 1.5, sd * 3.3); M(ey, new THREE.SphereGeometry(1.7, 10, 8), eyeG, 0, 0, 0); M(ey, new THREE.BoxGeometry(.5, 2.6, .5), pupil, 1.5, 0, 0); head.add(ey); return ey; });
          for (const sd of [-1, 1]) for (let q = 0; q < 3; q++) M(head, new THREE.BoxGeometry(.18, .18, 8), pale, 7.6, -2.4 + (q - 1) * .9, sd * 6.6, { rx: (q - 1) * sd * .16, ry: -sd * .25 });                              // whiskers
          const tail = []; let par = cat; for (let i = 0; i < 8; i++) { const sg = new THREE.Group(); sg.position.set(i ? -5.6 : -12, i ? 0 : 3.4, 0); M(sg, new THREE.CylinderGeometry(2.3 - i * .14, 2.4 - i * .14, 6.4, 8), fur, -2.8, 0, 0, { rz: Math.PI / 2 }); E(sg, 2.3 - i * .14, i === 7 ? pale : fur, -5.6, 0, 0, 1, 1, 1); par.add(sg); par = sg; tail.push(sg); }
          cat.traverse(m => { if (m.isMesh) m.userData.noShadow = true; });
          anim.push(t => { head.rotation.y = .55 * Math.sin(t * .23) + .12 * Math.sin(t * .9); head.rotation.z = .06 * Math.sin(t * .31); const bl = (t % 5.3) < .16 ? .12 : 1; eyes.forEach(e => e.scale.y = bl);
            ears.forEach((e, i) => { e.rotation.z = (t * .37 + i * 1.9) % 4 < .25 ? .35 : 0; }); tail.forEach((sg, i) => { sg.rotation.y = (i ? .34 : .9) + .3 * Math.sin(t * 1.3 - i * .55); sg.rotation.z = i ? .05 * Math.sin(t * .8 - i) : -.1; }); }); }
      }, { y: 0, hexes: HX, top: lvl(5) + 110, view: 620 });
      for (const [j, a, col] of [[0, 1.2, [.9, .93, .98]], [2, 3.6, [.9, .93, .98]], [3, 5.3, [1, .95, .8]]]) { const mm = mist({ n: 46, seed: 20 + j, r0: 5, r1: 24, y0: 2, y1: 15, spin: .2, rise: 0, size: 20, alpha: .13, col }); mm.position.set(c[0] + Math.cos(a) * rad(j), lvl(j), c[1] + Math.sin(a) * rad(j)); scene.add(mm); }
      herds(c, [{ n: 46, R: rad(0), w: 12, a0: .4, spread: .5, speed: .05, y: lvl(0), size: .9 }, { n: 40, R: rad(0), w: 12, a0: 3.4, spread: .45, speed: .05, y: lvl(0), size: .9 }, { n: 34, R: rad(2), w: 10, a0: 2.2, spread: .6, speed: -.07, y: lvl(2), size: .8 }, { n: 28, R: rad(3), w: 9, a0: 5, spread: .7, speed: .09, y: lvl(3), size: .7 }, { n: 18, R: rad(4), w: 7, a0: 1, spread: .9, speed: -.12, y: lvl(4), size: .7 }], [.45, .36, .26]);
      beast('Horse.glb', 60, 1.8, (o, t) => { const a = t * .045 + 1; o.position.set(c[0] + Math.cos(a) * rad(1), lvl(1), c[1] + Math.sin(a) * rad(1)); o.rotation.y = -a; });
      beast('Stork.glb', 46, 1.4, (o, t) => { const a = -t * .12; o.position.set(c[0] + Math.cos(a) * 70, lvl(5) + 90 + 10 * Math.sin(t * .3), c[1] + Math.sin(a) * 70); o.rotation.y = -a + Math.PI; }); }

    // Bone-Glass Menagerie (23,11): a great pale dome of bone-ribbed glass, pools and perches inside, and bright birds wheeling under the roof
    { const c = Wp(MENAG), y0 = 17 * S, bone = solid(0xe9e4d4, .6), domeG = new THREE.MeshStandardMaterial({ color: 0xe8f0ea, roughness: .08, transparent: true, opacity: .28, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false });
      addThing('Bone-Glass Menagerie', '🏛️', c, 1, 30, g => { const k = kit(g); k.C(41, 42, 3.4, 32, bone, 0, 1.7, 0); NS(k.D(40, domeG, 0, 3, 0)); for (let i = 0; i < 12; i++) M(g, new THREE.TorusGeometry(40.3, .9, 5, 20, Math.PI), bone, 0, 3, 0, { ry: i * .2618 });
        k.T(35.2, .8, bone, 0, 22, 0, { rx: Math.PI / 2 }); k.T(21, .8, bone, 0, 37, 0, { rx: Math.PI / 2 }); k.S(3, bone, 0, 43.5, 0);
        for (const [x, z, r] of [[-14, 8, 9], [16, -6, 7], [2, 20, 6]]) NS(k.C(r, r, .5, 16, waterGlass(0x4ab8d0, .8), x, 3.7, z));
        for (let i = 0; i < 5; i++) { const a = i * 1.257; k.C(.6, .9, 14 + i * 2, 6, bone, Math.cos(a) * 24, 10 + i, Math.sin(a) * 24); k.B(8, .6, 1.2, bone, Math.cos(a) * 24, 17 + i * 2, Math.sin(a) * 24, { ry: a }); }                                     // perches
        for (let i = 0; i < 7; i++) NS(M(g, new THREE.OctahedronGeometry(1.6 + (i % 3) * .5, 0), tealG, Math.cos(i * 2.4) * (8 + i * 3), 8 + (i * 5) % 16, Math.sin(i * 2.4) * (8 + i * 3)));                                                                         // the shimmering geometric creatures it keeps
        for (const sd of [-1, 1]) k.B(3, 14, 3, bone, sd * 6, 9, 40); k.B(15, 3, 3, bone, 0, 16, 40);
      }, { y: y0, hexes: [[23, 11]], top: 60, view: 420 });
      beast('Parrot.glb', 12, 1, (o, t) => { const a = t * .5; o.position.set(c[0] + Math.cos(a) * 20, y0 + 22 + 3 * Math.sin(t), c[1] + Math.sin(a) * 20); o.rotation.y = -a + Math.PI; });
      beast('Flamingo.glb', 15, 1.2, (o, t) => { const a = -t * .35 + 2; o.position.set(c[0] + Math.cos(a) * 26, y0 + 14 + 2 * Math.sin(t * .7), c[1] + Math.sin(a) * 26); o.rotation.y = -a; });
      herds(c, [{ n: 26, R: 28, w: 8, a0: 0, spread: 1.4, speed: .1, y: y0 + 3.6, size: .5 }], [.75, .8, .7]); }

    // Tesseract Commons (20,13): glass cubes in stone frames stacked at angles over a round pool, a lit doorway in each; lights leap from cube to cube as people step between them
    { const c = hexW(20, 13), y0 = heightAt(c[0], c[1]), cg = glassM(0xa8e6e0, .28), portal = glowM(0x7df0ff, 2.6), CP = [], orbs = [];
      addThing('Tesseract Commons', '🧊', c, 1, 30, g => { const k = kit(g); k.C(20, 20, .8, 28, QST, 0, .4, 0); NS(k.C(17, 17, .5, 28, waterGlass(0x3aa0c8, .8), 0, .9, 0));
        [[-26, 14, -6, 26, .2], [22, 12, -16, 24, .6], [4, 15, 28, 28, -.3], [-10, 40, 6, 22, .9], [16, 38, 10, 20, .4], [2, 62, -4, 18, 1.2], [-30, 44, -22, 16, .1]].forEach(([x, y, z, sz, r]) => { const sub = new THREE.Group(), hf = sz / 2;
          NS(M(sub, new THREE.BoxGeometry(sz, sz, sz), cg, 0, 0, 0)); NS(M(sub, new THREE.BoxGeometry(sz * .26, sz * .5, sz * .26), portal, 0, -sz * .22, 0));
          for (const a of [-1, 1]) for (const b of [-1, 1]) { M(sub, new THREE.BoxGeometry(1.5, sz + 1.5, 1.5), QST, a * hf, 0, b * hf); M(sub, new THREE.BoxGeometry(sz + 1.5, 1.5, 1.5), QST, 0, a * hf, b * hf); M(sub, new THREE.BoxGeometry(1.5, 1.5, sz + 1.5), QST, a * hf, b * hf, 0); }
          sub.position.set(x, y, z); sub.rotation.set(r * .25, r, 0); qbake(g, sub); CP.push([x, y, z]); });
      }, { y: y0, hexes: [[20, 13]], top: 90, view: 420 });
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3, 3.2), fog: false })); m.raycast = () => {}; scene.add(m); orbs.push(m); }
      anim.push(t => { orbs.forEach((m, i) => { const cyc = t * .45 + i * .77, k2 = Math.floor(cyc), f = cyc - k2, a = CP[(k2 * 3 + i) % CP.length], b = CP[(k2 * 3 + i + 3) % CP.length], e = Math.min(f / .35, 1); m.visible = f < .4; m.position.set(c[0] + lerp(a[0], b[0], e), y0 + lerp(a[1], b[1], e) + 14 * Math.sin(Math.PI * e), c[1] + lerp(a[2], b[2], e)); m.scale.setScalar(1 + 1.5 * Math.sin(Math.PI * e)); }); }); }

    // Ebenhollow - the Great Snarl (three hexes): colours wind up out of a ringed platform into a knot in the air; the ground for a hex around is wrung into spiral ridges, and gantries have been built up toward it
    { const HX = [[8, 19], [7, 20], [8, 20]], c = Wp(SNARL), y0 = 30 * S, tim = solid(0x5a4634, .9);
      addThing('Ebenhollow - The Great Snarl', '🌀', c, 1, 30, g => { const k = kit(g); k.C(32, 34, 3, 24, QDK, 0, 0, 0); for (const r of [12, 22, 31]) NS(k.T(r, .5, tealG, 0, 1.8, 0, { rx: Math.PI / 2 }));
        for (let i = 0; i < 6; i++) { const a = i * 1.047; M(g, new THREE.OctahedronGeometry(4, 0), crystal, Math.cos(a) * 27, 6, Math.sin(a) * 27, { sy: 1.8 }); }
        for (let i = 0; i < 3; i++) { const a = i * 2.094 + .5, ca = Math.cos(a), sa = Math.sin(a), x = ca * 66, z = sa * 66, yy = heightAt(c[0] + x, c[1] + z) - y0, hh = 64 + i * 18;
          for (const u of [-5, 5]) for (const v of [-5, 5]) k.B(1.4, hh, 1.4, tim, x + u, yy + hh / 2, z + v); for (let j = 1; j <= 4; j++) k.B(13, .7, 13, tim, x, yy + hh * j / 4, z); k.B(34, 1, 4, tim, x - ca * 20, yy + hh + .5, z - sa * 20, { ry: -a }); k.B(.6, 4, .6, tim, x - ca * 36, yy + hh + 2.5, z - sa * 36); }                // a gantry, its walkway reaching in toward the knot
      }, { y: y0, hexes: HX, top: 190, view: 620 });
      for (const [col, r0, r1, sp, arms, sd] of [[[1.6, .3, 1.4], 6, 80, .9, 3, 11], [[.2, 1.4, 1.3], 10, 100, -.6, 4, 12], [[1.6, 1.1, .2], 4, 60, 1.3, 2, 13], [[.6, .4, 1.6], 14, 115, .4, 5, 14]]) { const m = mist({ n: 220, seed: sd, arms, jit: .5, r0, r1, y0: 20, y1: 170, spin: sp, rise: .08, twist: 6 * Math.sign(sp), pow: .7, size: 16, alpha: .1, col, add: true }); m.position.set(c[0], y0, c[1]); scene.add(m); }
      const core = fieldShell([.9, .5, 1.4], .5); core.position.set(c[0], y0 + 100, c[1]); scene.add(core); anim.push(t => { core.scale.setScalar(24 + 5 * Math.sin(t * 1.3)); }); }

    // Vice Foundry (25,11): a quarry floor under a rock face, set out with screw-vices the size of cottages and crank wheels as tall as an ogre
    { const c = Wp(VICE), y0 = 13 * S, iron = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: .5, metalness: .7 }), steel = new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: .35, metalness: .8 }), brs = new THREE.MeshStandardMaterial({ color: 0xa8843c, roughness: .4, metalness: .7 });
      const vice = (g, x, z, ry, sc, held) => { const v = new THREE.Group(), P = (geo, mat, px, py, pz, o) => M(v, geo, mat, px, py, pz, o);
        P(new THREE.BoxGeometry(30, 4, 14), iron, 0, 2, 0); P(new THREE.BoxGeometry(5, 18, 14), iron, -11, 13, 0); P(new THREE.BoxGeometry(5, 18, 14), iron, 3, 13, 0); P(new THREE.BoxGeometry(18, 5, 9), QST, 6, 6.5, 0);
        P(new THREE.CylinderGeometry(1.7, 1.7, 22, 8), steel, 14, 12, 0, { rz: Math.PI / 2 }); P(new THREE.TorusGeometry(7, .9, 5, 16), steel, 25, 12, 0, { ry: Math.PI / 2 }); for (let i = 0; i < 4; i++) P(new THREE.BoxGeometry(.8, 14, .8), steel, 25, 12, 0, { rx: i * .785 });
        for (let i = 0; i < 7; i++) P(new THREE.TorusGeometry(1.9, .3, 4, 8), steel, 6 + i * 2.6, 12, 0, { ry: Math.PI / 2 });
        if (held === 0) P(gearGeo(7, 12, 3), brs, -4, 16, 0, { rx: Math.PI / 2 }); else if (held === 1) P(new THREE.BoxGeometry(8, 10, 9), QST, -4, 17, 0); else P(new THREE.CylinderGeometry(3, 3, 16, 8), brs, -4, 18, 0);
        v.scale.setScalar(sc); v.position.set(x, 0, z); v.rotation.y = ry; qbake(g, v); };
      addThing('Vice Foundry', '🗜️', c, 1, 30, g => { const k = kit(g); [[-54, -16, .2, 1.2, 0], [0, -22, -.1, 1.45, 1], [54, -14, .3, 1.15, 2], [-30, 34, 2.9, 1.25, 1], [30, 36, 3.3, 1.3, 0]].forEach(([x, z, ry, sc, held]) => vice(g, x, z, ry, sc, held));
        for (const [x, z] of [[-70, 22], [70, 24]]) { k.B(2, 16, 2, iron, x - 4, 8, z, { rz: -.3 }); k.B(2, 16, 2, iron, x + 4, 8, z, { rz: .3 }); k.T(12, 1.2, steel, x, 18, z); for (let i = 0; i < 4; i++) k.B(24, 1, 1, steel, x, 18, z, { rz: i * .785 }); }                 // crank wheels on stands
        for (let i = 0; i < 8; i++) k.B(6 + 5 * qr(), 4 + 4 * qr(), 5 + 4 * qr(), QST, -50 + 14 * i + 4 * qr(), 3, -34 + 4 * qr(), { ry: qr() });                                                                                                         // cut stone waiting along the quarry face
      }, { y: y0, hexes: [[25, 11]], top: 60, view: 460 }); }

    // Crystal Pavilion Hedgemaze (three hexes): one round maze of ringed hedges on pale gravel, topiary along the hedge tops, lamps and statues in its turnings, flower beds, three pillared crystal gates, and at its heart a stepped crystal pavilion over a fountain
    { const HX = [[16, 16], [17, 16], [16, 17]], c = Wp(MAZE), y0 = 17 * S + .6, lampG = glowM(0xffe2a0, 2.6), lamps = [];
      addThing('Crystal Pavilion Hedgemaze', '🌿', c, 1, 30, g => { const k = kit(g), mr = mulberry32(64), gravel = solid(0xd9cfb4, .95), bloomM = [solid(0xe86a8a, .8), solid(0xf2d05a, .8), solid(0xb07af0, .8)];
        k.C(87, 87, .6, 56, gravel, 0, .1, 0);
        for (let j = 0; j < 6; j++) { const Rr = 24 + j * 11.5, n = Math.round(Rr * 6.283 / 9), gapA = mr() * 6.283, gapB = gapA + 2 + mr() * 2.2, da = (a, a2) => Math.abs(Math.atan2(Math.sin(a - a2), Math.cos(a - a2)));
          for (let i = 0; i < n; i++) { const a = i / n * 6.283, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr; if (da(a, gapA) < 6 / Rr || da(a, gapB) < 6 / Rr) continue; k.B(3.4, 8, Rr * 6.283 / n + .6, hedge, x, 4.3, z, { ry: -a }); if (i % 7 === 3) M(g, i % 14 === 3 ? new THREE.ConeGeometry(2.2, 5, 6) : new THREE.IcosahedronGeometry(2.3, 0), hedge, x, i % 14 === 3 ? 10.6 : 10, z); }   // topiary cones and balls along the tops
          for (const ga of [gapA, gapB]) for (const sd of [-1, 1]) { const a = ga + sd * 8.5 / Rr, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr; k.B(.7, 10, .7, QDK, x, 5, z); NS(k.S(1.1, lampG, x, 10.8, z)); lamps.push([x, z]); }                                         // a lamp post either side of each opening
          if (j < 5) for (let q = 0; q < 3; q++) { const a = gapA + 1 + q * 2.05 + mr(), x = Math.cos(a) * (Rr + 5.75), z = Math.sin(a) * (Rr + 5.75); k.B(11.5, 8, 3.4, hedge, x, 4.3, z, { ry: -a }); if (q === 0) statue(g, QST, Math.cos(a + .1) * (Rr + 5.75), .4, Math.sin(a + .1) * (Rr + 5.75), 9, -a + Math.PI / 2, (j + q) % 4); } }   // spokes make the dead ends; a statue waits in some
        for (let i = 0; i < 40; i++) { const a = mr() * 6.283, rr = 15 + mr() * 6; M(g, new THREE.SphereGeometry(.8 + .5 * mr(), 6, 5), bloomM[i % 3], Math.cos(a) * rr, 1, Math.sin(a) * rr); }                                                                       // flower beds round the pavilion
        k.C(15, 16, 1.4, 8, QST, 0, .9, 0); k.C(12.5, 13.5, 1.4, 8, QST, 0, 2.3, 0); for (let i = 0; i < 8; i++) { const a = i * .785; M(g, new THREE.CylinderGeometry(.8, 1, 16, 6), crystal, Math.cos(a) * 10.5, 11, Math.sin(a) * 10.5); M(g, new THREE.OctahedronGeometry(1.2, 0), crystal, Math.cos(a) * 10.5, 20, Math.sin(a) * 10.5); }
        M(g, new THREE.ConeGeometry(14, 11, 8), crystal, 0, 25, 0); NS(M(g, new THREE.OctahedronGeometry(2.2, 0), tealG, 0, 33, 0, { sy: 1.6 })); k.C(4.6, 5.4, 2.6, 10, QST, 0, 4.2, 0); NS(k.K(1.4, 9, 8, waterGlass(0xd8f2ff, .5), 0, 9.6, 0));
        for (let i = 0; i < 6; i++) { const a = i * 1.047; NS(M(g, new THREE.TorusGeometry(2.4, .25, 4, 8, Math.PI), waterGlass(0xd8f2ff, .5), Math.cos(a) * 2.4, 6, Math.sin(a) * 2.4, { ry: -a })); }
        for (let i = 0; i < 3; i++) { const a = i * 2.094 + .4, Rr = 24 + 5 * 11.5 + 5, ca = Math.cos(a), sa = Math.sin(a); for (const sd of [-1, 1]) { M(g, new THREE.CylinderGeometry(1.2, 1.5, 13, 6), crystal, ca * Rr - sa * sd * 6, 6.5, sa * Rr + ca * sd * 6); M(g, new THREE.OctahedronGeometry(1.8, 0), crystal, ca * Rr - sa * sd * 6, 15, sa * Rr + ca * sd * 6, { sy: 1.6 }); }
          M(g, new THREE.TorusGeometry(6, 1, 6, 14, Math.PI), crystal, ca * Rr, 13, sa * Rr, { ry: -a + Math.PI / 2 }); }                                                                                              // the three gates
      }, { y: y0, hexes: HX, top: 50, view: 560 });
      lamps.forEach((p, i) => { if (i % 2 === 0) lanternPts.push([c[0] + p[0], y0 + 11, c[1] + p[1], { c: [2.6, 2, .9], size: 6, drift: .2, speed: .5 }]); }); }

    // Crystalized Thought Echo (20,14): a grove of paler, bluer trees round one great tree with a glowing blue geode cradled in its roots
    { const c = hexW(20, 14), y0 = heightAt(c[0], c[1]), bark = solid(0x5a4634, .9), leafA = solid(0x4f8f7a, 1, { flatShading: true }), leafB = solid(0x7fc8b0, 1, { flatShading: true }), geo = glowM(0x4aa8ff, 2.4);
      addThing('Crystalized Thought Echo', '💠', c, 1, 30, g => { const k = kit(g);
        k.C(4, 7, 34, 8, bark, 0, 17, 0); for (let i = 0; i < 5; i++) { const a = i * 1.257; k.C(1.2, 2.6, 16, 6, bark, Math.cos(a) * 7, 2, Math.sin(a) * 7, { rz: Math.cos(a) * 1.0, rx: -Math.sin(a) * 1.0 }); }
        for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 8 + (i % 3) * 5; M(g, new THREE.IcosahedronGeometry(11 - (i % 3) * 2, 0), i % 2 ? leafA : leafB, Math.cos(a) * r, 36 + (i % 4) * 5, Math.sin(a) * r, { ry: i }); }
        NS(M(g, new THREE.IcosahedronGeometry(6.5, 0), geo, 6, 5, 4, { sy: 1.2 })); for (let i = 0; i < 5; i++) NS(M(g, new THREE.OctahedronGeometry(2, 0), geo, 6 + Math.cos(i * 1.3) * 7, 3, 4 + Math.sin(i * 1.3) * 7, { sy: 1.6 }));
        for (let i = 0; i < 14; i++) { const a = i * 2.39996, r = 26 + (i * 11) % 30, x = Math.cos(a) * r, z = Math.sin(a) * r, s2 = .7 + (i % 4) * .15, yy = heightAt(c[0] + x, c[1] + z) - y0; k.C(.8 * s2, 1.3 * s2, 12 * s2, 5, bark, x, yy + 6 * s2, z); M(g, new THREE.IcosahedronGeometry(6.5 * s2, 0), i % 2 ? leafB : leafA, x, yy + 14 * s2, z, { ry: i, sy: 1.15 }); }
      }, { y: y0, hexes: [[20, 14]], top: 70, view: 380 });
      lanternPts.push([c[0] + 6, y0 + 8, c[1] + 4, { c: [.5, 1.4, 2.8], size: 26, drift: .2, speed: .9 }]); }

    // Glassleaf Orchard (four hexes): taller, silver-barked trees set seven to a hex, their leaves panes of glass; loose leaves drift between them and the whole orchard glitters
    { const HX = [[20, 16], [19, 17], [21, 16], [20, 17]], c = cenW(HX), trunkM = solid(0xb9c2c4, .5), leafG = new THREE.MeshStandardMaterial({ color: 0xbff4ea, emissive: 0x2aa89a, emissiveIntensity: .7, roughness: .05, transparent: true, opacity: .7, flatShading: true, envMapIntensity: 2 }), floaters = [], or = mulberry32(206);
      addThing('Glassleaf Orchard', '🍃', c, 1, 30, g => { const k = kit(g);
        for (const [q, r] of HX) { const h = hexW(q, r); for (let i = 0; i < 7; i++) { const a = i ? (i - 1) * 1.047 + .52 : 0, d = i ? 40 : 0, x = h[0] + Math.cos(a) * d - c[0], z = h[1] + Math.sin(a) * d - c[1], yy = heightAt(c[0] + x, c[1] + z), s2 = 1.5 + .5 * or();
            k.C(1.1 * s2, 2 * s2, 20 * s2, 6, trunkM, x, yy + 10 * s2, z); for (let b = 0; b < 3; b++) { const ba = b * 2.094 + i; k.C(.5 * s2, .8 * s2, 10 * s2, 5, trunkM, x + Math.cos(ba) * 3.4 * s2, yy + 19 * s2, z + Math.sin(ba) * 3.4 * s2, { rz: -Math.cos(ba) * .8, rx: Math.sin(ba) * .8 }); }
            for (let l = 0; l < 9; l++) { const la = l * 2.4 + i, lr2 = (3 + (l % 3) * 3.2) * s2; M(g, new THREE.OctahedronGeometry(2.6 * s2, 0), leafG, x + Math.cos(la) * lr2, yy + (21 + (l % 4) * 2.6) * s2, z + Math.sin(la) * lr2, { sy: .35, rx: or() * 1.2, rz: or() * 1.2, ry: la }); } } }
        for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(2, 0), leafG); m.scale.set(1, .3, 1.4); m.userData.keepSep = 1; m.userData.noShadow = true; m.raycast = () => {}; g.add(m); const x = (or() - .5) * 260, z = (or() - .5) * 260; floaters.push([m, x, z, or() * 6.3, heightAt(c[0] + x, c[1] + z)]); }
      }, { y: 0, hexes: HX, top: 90, view: 620 });
      anim.push(t => { for (const [m, x, z, ph, hy] of floaters) { m.position.set(x + Math.sin(t * .2 + ph) * 16, hy + 26 + Math.sin(t * .5 + ph * 2) * 10, z + Math.cos(t * .17 + ph) * 16); m.rotation.set(t * .4 + ph, t * .3, ph); } });
      const gl = mist({ n: 150, seed: 96, r0: 10, r1: 170, y0: 14, y1: 56, spin: .04, rise: 0, size: 3, alpha: .8, col: [1.2, 1.8, 1.7], add: true }); gl.position.set(c[0], heightAt(c[0], c[1]), c[1]); scene.add(gl); }

    // Mobius Cloister (now on 17,18): a cloister that cannot make up its mind which way is down. One wing - arcade, windowed wall, roofed tower and a flight of stairs - is built four times round a great arched cube:
    // once upright, once standing out from the west wall, once from the north wall, and once hanging upside down over the roof. A gold one-sided ribbon, edged in teal, turns slowly above it all
    { const c = Wp(MOBI), y0 = 17 * S, dk = solid(0x24424a, .6), roofM = solid(0x2f7f86, .45, { flatShading: true }), shade = solid(0x101a20, 1, { side: THREE.DoubleSide }), rib = new THREE.MeshStandardMaterial({ color: 0xd6ae4a, roughness: .3, metalness: .6, side: THREE.DoubleSide });
      const mob = (() => { const pos = [], idx = [], NU = 110, NV = 4, Rr = 32, w = 6.5; for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { const u = i / NU * 6.283, v = (j / NV * 2 - 1) * w, r2 = Rr + v * Math.cos(u / 2); pos.push(r2 * Math.cos(u), v * Math.sin(u / 2), r2 * Math.sin(u)); }
        for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); } const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); ge.setIndex(idx); ge.computeVertexNormals(); return ge; })();
      const edge = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 120 }, (_, i) => { const u = i / 120 * 12.566, r2 = 32 + 6.5 * Math.cos(u / 2); return new THREE.Vector3(r2 * Math.cos(u), 6.5 * Math.sin(u / 2), r2 * Math.sin(u)); }), true), 240, .7, 5, true);   // the ribbon has only one edge: this follows it twice round
      const wing = () => { const w = new THREE.Group(), P = (geo, mat, x, y, z, o) => M(w, geo, mat, x, y, z, o);
        P(new THREE.BoxGeometry(44, 2, 18), QST, 0, 1, 0); P(new THREE.BoxGeometry(44, 20, 2), QST, 0, 12, -8);
        for (let i = 0; i < 5; i++) { P(new THREE.BoxGeometry(3.4, 6, .5), shade, -16 + i * 8, 11, -6.9); P(new THREE.CircleGeometry(1.7, 12, 0, Math.PI), shade, -16 + i * 8, 14, -6.9); }                                                       // arched windows
        for (let i = 0; i < 6; i++) { P(new THREE.CylinderGeometry(.9, 1.1, 14, 8), QST, -20 + i * 8, 9, 7); P(new THREE.BoxGeometry(2.6, 1, 2.6), QST, -20 + i * 8, 16.5, 7); P(new THREE.BoxGeometry(2.8, 1.2, 2.8), dk, -20 + i * 8, 2.6, 7); if (i < 5) P(new THREE.TorusGeometry(4, .8, 5, 10, Math.PI), QST, -16 + i * 8, 16.5, 7); }   // the arcade
        P(new THREE.BoxGeometry(44, 2.4, 18), QST, 0, 22.4, 0); P(new THREE.BoxGeometry(46, 1, 20), dk, 0, 24, 0); for (let i = 0; i < 12; i++) P(new THREE.BoxGeometry(1.6, 1.6, 1.6), QST, -20.6 + i * 3.74, 25.2, 9);                                                // roof, trim and a row of merlons
        for (let i = 0; i < 9; i++) { P(new THREE.BoxGeometry(2.4, 1.2, 7), QST, 23.2 + i * 2.4, 1.6 + i * 2.4, 3); P(new THREE.BoxGeometry(.5, 3.4, .5), dk, 23.2 + i * 2.4, 4.4 + i * 2.4, 6.2); }                                                    // stairs up the end, with balusters
        P(new THREE.BoxGeometry(31, .6, .6), dk, 33, 14.6, 6.2, { rz: .785 }); P(new THREE.BoxGeometry(6, 1.2, 8), QST, 46, 23, 3);
        P(new THREE.BoxGeometry(10, 30, 10), QST, -26, 15, -3); P(new THREE.BoxGeometry(11.4, 1.2, 11.4), dk, -26, 30, -3); P(new THREE.ConeGeometry(8.4, 12, 4), roofM, -26, 36.6, -3, { ry: Math.PI / 4 }); P(new THREE.SphereGeometry(1, 8, 6), gold, -26, 43.4, -3);
        P(new THREE.BoxGeometry(2.6, 5, .5), shade, -26, 22, 2.1); P(new THREE.CircleGeometry(1.3, 10, 0, Math.PI), shade, -26, 24.5, 2.1); P(new THREE.BoxGeometry(3, 7, .5), shade, -26, 5, 2.1); return w; };
      addThing('Mobius Cloister', '♾️', c, 1, 30, g => { const k = kit(g);
        k.B(42, 13, 42, QST, 0, 6.5, 0); for (let i = 0; i < 4; i++) k.B(46 - i * 1.4, 1.2, 46 - i * 1.4, dk, 0, .6 + i * 1.2, 0);                                                                  // a stepped plinth
        k.B(34, 34, 34, QST, 0, 30, 0); k.B(37, 1.6, 37, dk, 0, 47.6, 0); k.B(37, 1.6, 37, dk, 0, 13.6, 0);
        for (const [x, z, ry] of [[17.2, 0, Math.PI / 2], [-17.2, 0, Math.PI / 2], [0, 17.2, 0], [0, -17.2, 0]]) { k.B(12, 14, .5, shade, x, 24, z, { ry }); M(g, new THREE.CircleGeometry(6, 16, 0, Math.PI), shade, x, 31, z, { ry }); for (const sd of [-1, 1]) k.C(.9, 1.1, 16, 8, QST, x + (ry ? 0 : sd * 7.4), 24, z + (ry ? sd * 7.4 : 0)); }   // a great arch in each face
        const place = (px, py, pz, rx, ry, rz) => { const w = wing(); w.position.set(px, py, pz); w.rotation.set(rx, ry, rz); qbake(g, w); };
        place(40, 0, 0, 0, 0, 0);                              // the wing that agrees with the ground
        place(-17, 30, 0, 0, 0, Math.PI / 2);                  // one whose floor is the west wall
        place(0, 30, -17, -Math.PI / 2, 0, 0);                 // one whose floor is the north wall
        place(0, 74, 0, Math.PI, Math.PI / 2, 0);              // and one hanging upside down above the roof
        for (let i = 0; i < 14; i++) k.B(6, 1, 2.2, QST, 14 - i * 2.2, 48.6 + (i < 7 ? i : 13 - i) * 1.5, 14, { ry: 0 });                                                                           // a stair on the roof that climbs and comes back to where it began
        const mb = M(g, mob, rib, 0, 108, 0, { rx: .35 }); mb.userData.noShadow = true; spin.push({ o: mb, speed: .3, bolt: false }); const ed = M(mb, edge, roofM, 0, 0, 0); ed.userData.noShadow = true;
      }, { y: y0, hexes: [[17, 18]], top: 150, view: 480 }); }

    // Axiom Pylons (23,14): seven teal obelisks standing in two rings, beams of light strung from tip to tip
    { const c = hexW(23, 14), y0 = heightAt(c[0], c[1]), beam = new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 1.6, 1.5), transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), tips = [], beams = [], tipsM = [], UPV = new THREE.Vector3(0, 1, 0);
      addThing('Axiom Pylons', '🔷', c, 1, 30, g => { const k = kit(g);
        for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283, Rr = i % 2 ? 44 : 30, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr, hh = 46 + (i * 13) % 30, yy = heightAt(c[0] + x, c[1] + z) - y0; M(g, new THREE.CylinderGeometry(1, 5, hh, 4), crystal, x, yy + hh / 2, z, { ry: a }); { const tm = NS(M(g, new THREE.OctahedronGeometry(3.4, 0), tealG, x, yy + hh + 3, z)); tm.userData.keepSep = 1; tipsM.push(tm); } tips.push([x, yy + hh + 3, z]); k.C(6.5, 7.5, 2.5, 4, QST, x, yy + 1.2, z, { ry: a }); }
        for (let i = 0; i < 7; i++) for (const st of [1, 3]) { const A2 = tips[i], B2 = tips[(i + st) % 7], dx = B2[0] - A2[0], dy = B2[1] - A2[1], dz = B2[2] - A2[2], L = Math.hypot(dx, dy, dz), m = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, L, 5), beam); m.position.set((A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2, (A2[2] + B2[2]) / 2); m.quaternion.setFromUnitVectors(UPV, new THREE.Vector3(dx / L, dy / L, dz / L)); m.userData.noShadow = true; m.raycast = () => {}; g.add(m); beams.push(m); }
      }, { y: y0, hexes: [[23, 14]], top: 90, view: 420 });
      // Every three minutes by the clock (so everybody at the table sees the same thing at the same moment) the pylons fire. A dome of force comes up over the Beastward, the Chalkfall and the Snarl,
      // a giant eagle appears inside it, and for some ten seconds it flies from wall to wall, flaring and wheeling away each time it strikes. Then both are gone. Between times the beams keep their own hours
      const EC = [-810, -1870], ER = 540, EH = 520, EY = 20, V3 = THREE.Vector3, SPEED = 190, LIM = .82, FLOOR = 335, BIG = 1.5, DT = 1 / 30;   // FLOOR keeps it clear of the Deathfall's top, the tallest thing under the dome
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2 + .12), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uTime: U.uTime, uK: { value: 0 }, uRise: { value: 0 }, uHit: { value: new V3(0, 1, 0) }, uHitT: { value: 99 } },
        vertexShader: 'varying vec3 vP, vN, vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = position; vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
        fragmentShader: [
          'uniform float uTime, uK, uRise, uHitT; uniform vec3 uHit; varying vec3 vP, vN, vV;',
          // the same nested circles that are cut into Quandrix's ground, laid over the dome from its crown
          'vec2 sxFr(vec2 p){ float s = 1.0, tone = 0.0; for (int i = 0; i < 6; i++){ p = -1.0 + 2.0 * fract(0.5 * p + 0.5); float r2 = max(dot(p, p), 1e-4); float k = 1.22 / r2; p *= k; s *= k; tone += r2; } return vec2(0.25 * abs(p.y) / s, tone / 6.0); }',
          'void main(){ vec3 d = normalize(vP); if (d.y > uRise) discard;',
          '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0), an = uTime * 0.012; vec2 q = d.xz / (1.0 + max(d.y, 0.0)); q = mat2(cos(an), -sin(an), sin(an), cos(an)) * q;',
          '  vec2 fr = sxFr(q * 1.35 + vec2(0.5, 0.31)); float ln = 1.0 - smoothstep(0.0, 0.0022 + fwidth(fr.x) * 1.5, fr.x), tone = smoothstep(0.25, 0.8, fr.y);',
          '  float lip = smoothstep(uRise - 0.05, uRise, d.y) * step(uRise, 1.03);',                                                                                  // the bright edge as it climbs
          '  float hd = acos(clamp(dot(d, uHit), -1.0, 1.0)), ring = exp(-pow((hd - uHitT * 0.55) / 0.04, 2.0)) * exp(-uHitT * 1.1) + 2.0 * exp(-hd * hd / 0.006) * exp(-uHitT * 5.0);',   // where the eagle struck: a flash, and a ring running out from it
          '  float foot = 1.0 - smoothstep(0.0, 0.022, abs(d.y));',
          '  float a = 0.012 + 0.03 * tone + 0.3 * f * f + ln * (0.07 + 0.3 * f) + lip * 1.2 + ring * 1.4 + foot * 0.6;',
          '  gl_FragColor = vec4(mix(mix(vec3(0.2, 1.25, 1.1), vec3(0.5, 0.8, 1.6), tone), vec3(1.0), clamp(ln * 0.25 + ring, 0.0, 1.0)) * a * uK, 1.0); }'].join('\n') }));
      dome.position.set(EC[0], EY, EC[1]); dome.scale.set(ER, EH, ER); dome.visible = false; dome.raycast = () => {}; dome.frustumCulled = false; dome.renderOrder = 60; scene.add(dome);
      // the line of force from the pylons to the crown of the dome: an arc of energy thrown high over the land between. A bright core with no hard edge, a wide faint glow round it,
      // two thin strands wound about it, and pulses running along the whole of it toward the dome. It shoots out from the pylons before the dome rises
      const linkU = { uTime: U.uTime, uA: { value: 0 }, uGrow: { value: 0 } };
      const linkMat = k => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: linkU.uTime, uA: linkU.uA, uGrow: linkU.uGrow, uK: { value: k } },
        vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
        fragmentShader: [
          'uniform float uTime, uA, uGrow, uK; varying vec2 vUv; varying vec3 vN, vV;',
          'void main(){ float rim = abs(dot(normalize(vN), normalize(vV))), soft = rim * rim * rim;',                                                              // brightest through the middle, nothing at the edge: light, not a pipe
          '  float pulse = 0.62 + 0.38 * sin(vUv.x * 110.0 - uTime * 16.0) * sin(vUv.x * 27.0 - uTime * 6.0 + 1.3) + 0.5 * pow(0.5 + 0.5 * sin(vUv.x * 9.0 - uTime * 7.0), 8.0);',   // fast ripples, and now and then a surge
          '  float head = 1.0 - smoothstep(uGrow - 0.05, uGrow, vUv.x), tip = exp(-pow((vUv.x - uGrow) / 0.03, 2.0)) * step(uGrow, 1.02);',                               // its leading end, bright as it travels
          '  float ends = smoothstep(0.0, 0.025, vUv.x) * (1.0 - smoothstep(0.985, 1.0, vUv.x));',
          '  gl_FragColor = vec4(mix(vec3(0.22, 1.35, 1.2), vec3(0.85, 1.0, 1.0), soft * soft) * (soft * pulse * head + tip * soft * 2.0) * ends * uA * uK, 1.0); }'].join('\n') });
      const link = (() => { const a = new V3(c[0], y0 + 96, c[1]), b = new V3(EC[0], EY + EH, EC[1]), mid = a.clone().add(b).multiplyScalar(.5); mid.y += 520; const arc = new THREE.QuadraticBezierCurve3(a, mid, b), grp = new THREE.Group(), N = 220, fr = arc.computeFrenetFrames(N, false), P = arc.getSpacedPoints(N);
        const tube = (curve, r, k, seg) => { const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 10, false), linkMat(k)); m.raycast = () => {}; m.frustumCulled = false; m.renderOrder = 61; grp.add(m); };
        tube(arc, 2.6, 1.5, 160); tube(arc, 9, .32, 120);
        for (const ph of [0, Math.PI]) { const pts = P.map((p, i) => { const t = i / N, an = t * 6.283 * 9 + ph, rr = 12 * Math.sin(Math.PI * t); return p.clone().addScaledVector(fr.normals[i], Math.cos(an) * rr).addScaledVector(fr.binormals[i], Math.sin(an) * rr); }); tube(new THREE.CatmullRomCurve3(pts), .9, .9, 420); }   // the strands part from the core in the middle and close on it again at each end
        grp.visible = false; scene.add(grp); return grp; })();
      // ---- the eagle: built feather by feather. Forward is +x, the right wing +z
      const eagle = new THREE.Group(), inner = new THREE.Group(), L = 46, W = 60, C = 21, cM = new THREE.Color(), K = h => new THREE.Color(h);
      const K1 = K(0x3e2b1c), K2 = K(0x23170f), K3 = K(0x5e4630), K4 = K(0x80633f), WH = K(0xf4f1e8), WH2 = K(0xcfc9b8);
      const fm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, side: THREE.DoubleSide });
      // one feather: a pointed vane laid from its root along a direction, drooping a little toward the tip, ridged along its shaft, one side of the shaft a shade darker than the other
      const feather = (pos, cl, root, dir, len, wid, lift, c0, c1) => { const dl = Math.hypot(dir[0], dir[1]) || 1, dx = dir[0] / dl, dz = dir[1] / dl, sx = -dz, sz = dx,
          P = [[0, 0], [.5, .2], [.48, .6], [.3, .9], [0, 1], [-.3, .9], [-.48, .6], [-.5, .2]].map(([a, b]) => [root[0] + sx * a * wid + dx * b * len, root[1] + lift - b * b * len * .06 + (1 - Math.abs(a) * 2) * wid * .1, root[2] + sz * a * wid + dz * b * len, b]);
        for (let i = 1; i + 1 < P.length; i++) { const sh = i < 4 ? 1 : .8; for (const p of [P[0], P[i], P[i + 1]]) { pos.push(p[0], p[1], p[2]); cM.copy(c0).lerp(c1, p[3]).multiplyScalar(sh); cl.push(cM.r, cM.g, cM.b); } } };
      const fmesh = (pos, cl) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); ge.computeVertexNormals(); return new THREE.Mesh(ge, fm); };
      const limb = (g, a, b, r0, r1) => { const dv = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), me = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, dv.length(), 7), new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: .8 })); me.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); me.quaternion.setFromUnitVectors(UPV, dv.normalize()); g.add(me); };
      { const P2 = Math.PI / 2, bits = [
          part(new THREE.SphereGeometry(1, 18, 12), 0x3e2b1c, { sx: L * .34, sy: L * .15, sz: L * .16 }),                                                          // body
          part(new THREE.SphereGeometry(1, 14, 10), 0x4a3423, { x: L * .1, y: -L * .03, sx: L * .2, sy: L * .12, sz: L * .13 }),                                      // breast
          part(new THREE.CylinderGeometry(L * .085, L * .135, L * .2, 12), 0xf4f1e8, { x: L * .27, y: L * .035, rz: -P2 + .12 }),                                      // neck, white
          part(new THREE.SphereGeometry(1, 14, 10), 0xf4f1e8, { x: L * .385, y: L * .06, sx: L * .115, sy: L * .09, sz: L * .088 }),                                   // head
          part(new THREE.CylinderGeometry(L * .024, L * .052, L * .11, 8), 0xe9b21e, { x: L * .5, y: L * .042, rz: -P2 - .12 }),                                       // beak: deep at the root...
          part(new THREE.ConeGeometry(L * .026, L * .075, 7), 0xd49a12, { x: L * .553, y: L * .008, rz: Math.PI - .5 })];                                               // ...and hooked over at the tip
        for (const sd of [-1, 1]) { bits.push(part(new THREE.SphereGeometry(L * .017, 8, 6), 0x140e06, { x: L * .43, y: L * .072, z: sd * L * .072 }),                // eye
            part(new THREE.BoxGeometry(L * .1, L * .016, L * .034), 0xd8d2c2, { x: L * .425, y: L * .097, z: sd * L * .062, rz: -.3, ry: -sd * .28 }),                 // the heavy brow that gives an eagle its glare
            part(new THREE.ConeGeometry(L * .062, L * .2, 8), 0x3e2b1c, { x: -L * .1, y: -L * .12, z: sd * L * .065, rz: P2 + .55 }),                                 // feathered thigh
            part(new THREE.CylinderGeometry(L * .014, L * .018, L * .13, 6), 0xe2ac1c, { x: -L * .21, y: -L * .175, z: sd * L * .065, rz: P2 + .25 }),                // leg, trailing
            part(new THREE.SphereGeometry(L * .028, 8, 6), 0xe2ac1c, { x: -L * .28, y: -L * .192, z: sd * L * .065 }));                                               // foot, clenched
          for (let i = 0; i < 4; i++) { const a = i < 3 ? (i - 1) * .7 : Math.PI; bits.push(part(new THREE.ConeGeometry(L * .011, L * .075, 5), 0x15100c, { x: -L * .28 - Math.cos(a) * L * .035, y: -L * .215, z: sd * L * .065 + Math.sin(a) * L * .035, rz: P2 + 1.25 * Math.cos(a), rx: Math.sin(a) * .9 })); } }   // talons
        inner.add(new THREE.Mesh(mergeGeometries(bits), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7 }))); }
      { const bp = [], bc = [];
        for (let r = 0; r < 5; r++) for (let j = -2; j <= 2; j++) { const x = L * (.17 - r * .095), z = j * L * .052 * (1 - .12 * Math.abs(r - 2)), yt = L * .15 * Math.sqrt(Math.max(1 - Math.pow(x / (L * .34), 2) - Math.pow(z / (L * .16), 2), .05)) + .3; feather(bp, bc, [x, yt, z], [-1, j * .08], L * .15, L * .09, 0, K3, K4); }   // the mantle: rows of pale-edged feathers down the back
        for (let j = -3; j <= 3; j++) feather(bp, bc, [L * .275, L * .135 - Math.abs(j) * L * .014, j * L * .036], [-1, j * .12], L * .15, L * .062, 0, WH, WH2);                                                // white hackles lapping back from the head
        for (let i = 0; i < 11; i++) { const a = (i - 5) / 5 * .62; feather(bp, bc, [-L * .28, L * .01 - Math.abs(i - 5) * .12, Math.sin(a) * L * .03], [-Math.cos(a), Math.sin(a)], L * .44, L * .086, 0, WH2, WH); }   // the tail, a white fan
        for (let i = 0; i < 7; i++) { const a = (i - 3) / 3 * .5; feather(bp, bc, [-L * .2, L * .065, Math.sin(a) * L * .04], [-Math.cos(a), Math.sin(a)], L * .21, L * .078, 0, K1, K3); }                         // brown coverts over its root
        inner.add(fmesh(bp, bc)); }
      const wings = [-1, 1].map(sd => { const arm = new THREE.Group(), hand = new THREE.Group(), E = [C * .22, 0, W * .44 * sd], T = [-C * .32, 0, W * .56 * sd], ap = [], ac = [], hp = [], hc = [];   // E: the wrist, from the shoulder; T: the wingtip, from the wrist
        for (let i = 0; i < 3; i++) { const a = -.5 + i * .14; feather(ap, ac, [-C * .12 * i, -.15, sd * W * .015], [-Math.cos(a), Math.sin(a) * sd], C * (1.02 - i * .1), W * .09, 0, K1, K3); }                                                                       // tertials, closing the wing to the body
        for (let i = 0; i < 11; i++) { const f = i / 10, a = (-6 + 20 * f) * Math.PI / 180; feather(ap, ac, [E[0] * f, 0, E[2] * f], [-Math.cos(a), Math.sin(a) * sd], C * (1.02 + .1 * f), W * .084, 0, K1, K2); }                                                     // secondaries
        for (let i = 0; i < 13; i++) { const f = i / 12, a = (-4 + 18 * f) * Math.PI / 180; feather(ap, ac, [E[0] * f + C * .04, 0, E[2] * f], [-Math.cos(a), Math.sin(a) * sd], C * .56, W * .064, C * .03, K3, K1); }                                                 // greater coverts over their roots
        for (let i = 0; i < 14; i++) { const f = i / 13; feather(ap, ac, [E[0] * f + C * .09, 0, E[2] * f], [-1, .08 * sd], C * .34, W * .055, C * .055, K3, K4); }                                                                                                     // median coverts
        for (let i = 0; i < 15; i++) { const f = i / 14; feather(ap, ac, [E[0] * f + C * .14, 0, E[2] * f], [-1, .05 * sd], C * .21, W * .05, C * .075, K4, K3); }                                                                                                      // lesser coverts, along the leading edge
        for (let i = 0; i < 10; i++) { const f = i / 9, a = (20 + 62 * f) * Math.PI / 180, fing = sstep(.35, .8, f); feather(hp, hc, [T[0] * f, 0, T[2] * f], [-Math.cos(a), Math.sin(a) * sd], C * (1.1 + .55 * Math.sin(f * 2.3)), W * lerp(.08, .046, fing), 0, K1, K2); }   // primaries: the outer ones narrow and spread apart - the "fingers" of a soaring eagle
        for (let i = 0; i < 9; i++) { const f = i / 8, a = (14 + 46 * f) * Math.PI / 180; feather(hp, hc, [T[0] * f + C * .03, 0, T[2] * f], [-Math.cos(a), Math.sin(a) * sd], C * .52, W * .056, C * .03, K3, K1); }                                                       // primary coverts
        feather(hp, hc, [C * .04, C * .04, 0], [.22, sd], C * .4, W * .04, 0, K1, K2);                                                                                                                                                                                 // the alula, at the wrist
        arm.add(fmesh(ap, ac)); hand.add(fmesh(hp, hc)); limb(arm, [0, C * .03, 0], [E[0] + C * .14, C * .03, E[2]], C * .075, C * .05); limb(hand, [C * .12, C * .03, 0], [T[0] * .8 + C * .1, C * .03, T[2] * .8], C * .05, C * .016);
        hand.position.set(E[0], 0, E[2]); arm.add(hand); arm.position.set(L * .08, L * .09, sd * L * .1); inner.add(arm); return { arm, hand, sd }; });
      eagle.add(inner); eagle.traverse(m => { if (m.isMesh) { m.castShadow = true; m.raycast = () => {}; m.frustumCulled = false; } }); eagle.visible = false; scene.add(eagle);
      // its flight is worked out in fixed steps from a seed, so the same event is the same flight on every screen
      const ev = { idx: -1, t: 0, hitAt: -9, turnAt: -9, pos: new V3(), prev: new V3(), dir: new V3(1, 0, 0), tgt: new V3(1, 0, 0), hitDir: new V3(0, 1, 0), rng: null }, face = new V3(1, 0, 0), rp = new V3(), nV = new V3(); let yawPrev = 0, bank = 0;
      const reset = idx => { ev.idx = idx; ev.rng = mulberry32(idx * 7919 + 13); ev.t = 0; ev.hitAt = -9; ev.turnAt = -9; ev.pos.set(120, 395, 60); ev.prev.copy(ev.pos); const a = ev.rng() * 6.283; ev.dir.set(Math.cos(a), 0, Math.sin(a)); ev.tgt.copy(ev.dir); face.copy(ev.dir); ev.hitDir.set(0, 1, 0); };
      const step = () => { ev.prev.copy(ev.pos); ev.dir.lerp(ev.tgt, 1 - Math.exp(-DT * 2.2)).normalize(); ev.pos.addScaledVector(ev.dir, SPEED * DT);
        const m = Math.hypot(ev.pos.x / ER, ev.pos.y / EH, ev.pos.z / ER), wall = m > LIM, low = ev.pos.y < FLOOR, ox = ev.pos.x + 100, oz = ev.pos.z + 191, tower = Math.hypot(ox, oz) < 150;   // the Deathfall's column stands as high as the eagle flies, so it steers round that too
        if ((wall || low || tower) && ev.t - ev.turnAt > .6) { ev.turnAt = ev.t; if (wall) { nV.set(-ev.pos.x / (ER * ER), -ev.pos.y / (EH * EH), -ev.pos.z / (ER * ER)).normalize(); ev.hitDir.set(ev.pos.x / ER, ev.pos.y / EH, ev.pos.z / ER).normalize(); ev.hitAt = ev.t; } else if (tower) nV.set(ox, 0, oz).normalize(); else nV.set(0, 1, 0);
          const dn = ev.dir.dot(nV); if (dn < 0) ev.dir.addScaledVector(nV, -2 * dn);                                                                       // thrown back off the wall...
          const a = ev.rng() * 6.283; ev.tgt.set(Math.cos(a), (ev.rng() - .5) * .5, Math.sin(a)).addScaledVector(nV, .9).normalize(); if (ev.tgt.dot(nV) < .3) ev.tgt.addScaledVector(nV, .6).normalize(); }   // ...and away on some new heading
        if (low) { ev.dir.y = Math.abs(ev.dir.y); ev.tgt.y = Math.abs(ev.tgt.y) + .15; ev.tgt.normalize(); }                                                 // it keeps above the hilltops
        ev.t += DT; };
      anim.push((t, dt) => { const now = (window.__clock ? window.__clock() : Date.now() / 1000) + (window.__eagleOff || 0), idx = Math.floor(now / 180), e = now - idx * 180, on = e < 13, hold = sstep(0, .9, e) * (1 - sstep(11, 13, e)), flash = Math.exp(-Math.pow((e - 1.1) / .3, 2));
        beams.forEach((m, i) => { const sg = Math.sin(t * (.23 + .05 * (i % 5)) + i * 1.9) + Math.sin(t * (.61 + .03 * (i % 7)) + i * .7), own = sstep(.2, .45, sg), lit = Math.max(own, hold);
          const fl = lit > .02 && lit < .98 ? .45 + .55 * Math.abs(Math.sin(t * 31 + i * 2.3)) : 1, th = 1 + 2.2 * flash + .5 * hold; m.visible = lit > .02; m.material.opacity = Math.min(1, lit * fl * (.5 + .3 * hold + .5 * flash)); m.scale.set(th, 1, th); });
        tipsM.forEach((m, i) => { m.material.emissiveIntensity = 2.2 + 1.6 * hold + 6 * flash + .5 * Math.sin(t * 3 + i); m.scale.setScalar(1 + .18 * hold + .55 * flash); });
        link.visible = hold > .01; linkU.uA.value = Math.min(1.8, .85 * hold + 1.1 * flash) * (.9 + .1 * Math.sin(t * 9)); linkU.uGrow.value = sstep(.25, 1.25, e) * 1.08; if (dome.visible && !on) Q.nudge(); dome.visible = on; eagle.visible = on && e > 1.5; if (!on) return;
        const du = dome.material.uniforms, ts = clamp(e - 1.5, 0, 11); du.uRise.value = sstep(0, 2, e) * 1.12; du.uK.value = (1 - sstep(11, 13, e)) * (.85 + .08 * Math.sin(t * 2.1));
        if (idx !== ev.idx || ts < ev.t - .2) reset(idx); let guard = 0; while (ev.t + DT <= ts && guard++ < 1600) step();
        const since = Math.max(ts - ev.hitAt, 0), flare = Math.exp(-Math.pow(since / .45, 2)); du.uHit.value.copy(ev.hitDir); du.uHitT.value = since;
        rp.copy(ev.prev).lerp(ev.pos, clamp((ts - ev.t) / DT, 0, 1)); const fdt = Math.min(dt || .016, .1); face.lerp(ev.dir, 1 - Math.exp(-fdt * 4)).normalize();
        const yaw = Math.atan2(-face.z, face.x); let dyw = yaw - yawPrev; dyw = Math.atan2(Math.sin(dyw), Math.cos(dyw)); yawPrev = yaw; bank = lerp(bank, clamp(dyw / Math.max(fdt, .004) * .45, -1, 1), .08);
        const sc = sstep(1.5, 2.5, e) * (1 - sstep(10, 11.5, e)); eagle.position.set(EC[0] + rp.x, EY + rp.y, EC[1] + rp.z); eagle.scale.setScalar(Math.max(sc * BIG, .001)); eagle.rotation.set(-bank, yaw, Math.asin(clamp(face.y, -1, 1)) * .8 + .5 * flare, 'YZX');   // banking into each turn, rearing as it strikes
        const glide = sstep(-.2, .5, Math.sin(ts * .55 + idx)), w = ts * 5.2, amp = .25 + .75 * glide, f1 = .1 + .5 * amp * Math.sin(w) + .55 * flare, f2 = .12 + .45 * amp * Math.sin(w - .9) + .3 * flare;                                                         // a few deep beats, then a glide; the hand trails the arm
        for (const wg of wings) { wg.arm.rotation.x = -wg.sd * f1; wg.hand.rotation.x = -wg.sd * f2; } inner.position.y = -Math.sin(w) * 1.6 * amp; }); }
  }

  // ================= Silverquill locations from the live map =================
  { const bm = sqBM, wm = sqWM, gd = sqGD, roofD = tx(solid(0x0b0b10, .4, { flatShading: true }), 'tiles'), roofG = tx(solid(0xc9a64e, .35, { metalness: .5, flatShading: true }), 'tiles'), litW = glowM(0xffe2a8, 2.6), litP = glowM(0xa860ff, 2.4), litR = glowM(0xff3a22, 2.6), inkM = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: .05, envMapIntensity: 1.8 });
    const bmL = new THREE.MeshStandardMaterial({ map: marbleTex('#5e5e6e', '#ececf4', 5), roughness: .18, envMapIntensity: 1.3 }), roofL = tx(solid(0x464656, .4, { flatShading: true }), 'tiles'), hDoor = solid(0x2b2531, .6);   // the dark district's places: charcoal, where its ordinary houses are black
    // ink that moves: the same drifting noise the water uses, as slow violet currents and a restless surface. addThing clones materials and a clone loses its shader hook, so inkify puts it back on a finished thing
    const inkSh = white => sh => { sh.uniforms.uNoise = U.uNoise; sh.uniforms.uTime = U.uTime; sh.uniforms.uNG = U.uNG; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; uniform float uTime, uNG;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ vec2 p = vSxW.xz / 44.0; vec2 w = texture2D(uNoise, p * 0.6 + uTime * 0.011).gb - 0.5; float c = texture2D(uNoise, p * 1.4 + w * 0.6 + uTime * vec2(0.021, 0.013)).r * texture2D(uNoise, p * 0.8 - w * 0.5 - uTime * vec2(0.015, 0.018)).r; ' + (white ? 'diffuseColor.rgb *= 0.7 + 0.7 * c;' : 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.05, 0.3), smoothstep(0.14, 0.42, c) * 0.85) + vec3(0.45, 0.4, 0.7) * pow(c, 3.0) * 1.2;') + ' }')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 p = vSxW.xz / 22.0; vec2 gr = (texture2D(uNoise, p + uTime * vec2(0.021, 0.014)).gb - 0.5) + (texture2D(uNoise, p * 2.7 - uTime * vec2(0.026, 0.033)).gb - 0.5) * 0.6; gr *= uNG * 0.012; normal = normalize(mat3(viewMatrix) * normalize(vec3(-gr.x, 1.0, -gr.y))); }'); };
    const inkF = inkM.clone(); inkF.name = 'ink'; const inkFall = flowMat('#07060c', '#7a4ad0', 0x5a2ab0, .95, -.5);
    const inkify = t => t.group.traverse(m => { if (m.isMesh && (m.material.name === 'ink' || m.material.name === 'inkw')) { const w = m.material.name === 'inkw'; m.material.onBeforeCompile = inkSh(w); m.material.customProgramCacheKey = () => w ? 'sxinkw' : 'sxink'; m.material.needsUpdate = true; } });
    const rod = (g, mat, a, b, r0, seg = 6) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, L, seg), mat); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m); return m; };
    const sr = mulberry32(777), GY = 16 * S, cenW = hx => { const p = hx.map(([q, r]) => hexW(q, r)); return [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length]; };
    const sbake = (g, sub) => { sub.updateMatrix(); for (const m of [...sub.children]) { m.applyMatrix4(sub.matrix); g.add(m); } };
    // a gothic house: body, steep roof, lancet windows on both gable ends, and now and then a spire. Its gable ends face along its own z
    const house = (g, x, y, z, ry, w, d, h, wall, roof, lit, spire) => { const hs = new THREE.Group(), nw = Math.max(1, Math.round(w / 6)), nr = Math.max(1, Math.floor(h / 11)); M(hs, new THREE.BoxGeometry(w, h, d), wall, 0, h / 2, 0); M(hs, gable(w + 1.2, w * .7, d + 1.2), roof, 0, h, 0);
      for (let i = 0; i < nw; i++) for (const sd of [-1, 1]) for (let j = 0; j < nr; j++) M(hs, new THREE.BoxGeometry(1.6, 5, .4), lit, (i + .5) / nw * w - w / 2, 5 + j * 10, sd * (d / 2 + .1));
      M(hs, new THREE.BoxGeometry(w + .7, 1.5, d + .7), wall, 0, .75, 0); M(hs, new THREE.BoxGeometry(w + 1, .7, d + 1), wall, 0, h - .35, 0);                                                              // a plinth to stand on and a cornice under the eaves
      for (let i = 0; i < nw; i++) for (const sd of [-1, 1]) for (let j = 0; j < nr; j++) M(hs, new THREE.BoxGeometry(2.3, .35, .7), wall, (i + .5) / nw * w - w / 2, 2.3 + j * 10, sd * (d / 2 + .2));     // a sill under every window
      for (const sd of [-1, 1]) { M(hs, new THREE.BoxGeometry(2.3, 4.3, .3), hDoor, 0, 3.6, sd * (d / 2 + .32)); M(hs, new THREE.BoxGeometry(3.1, .5, .6), wall, 0, 6, sd * (d / 2 + .3)); M(hs, new THREE.BoxGeometry(3.4, .5, 1.4), wall, 0, 1.2, sd * (d / 2 + .7)); }   // a door front and back, its lintel and its step
      M(hs, new THREE.BoxGeometry(1.5, w * .42, 1.5), wall, w * .2, h + w * .5, -d * .24);                                                                                                                 // a chimney
      for (const sx of [-1, 1]) { const dx = sx * w * .27, dy = h + w * .34; M(hs, new THREE.BoxGeometry(2.4, 2.2, 2.6), wall, dx, dy, d * .14); M(hs, new THREE.BoxGeometry(.3, 1.4, 1.5), lit, dx + sx * 1.25, dy + .1, d * .14); M(hs, new THREE.BoxGeometry(3, .35, 3.1), roof, dx, dy + 1.25, d * .14); }   // a lit dormer on each slope
      if (spire) M(hs, new THREE.ConeGeometry(w * .22, h * .9, 4), roof, 0, h + w * .5 + h * .3, 0, { ry: Math.PI / 4 }); hs.position.set(x, y, z); hs.rotation.y = ry; sbake(g, hs); };
    // lantern lights carried up and down a street by people we do not draw
    const walkers = (A, B, n, col, lat, yy, seed) => { const r = mulberry32(seed), a = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) a[i] = r(); const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); ge.setAttribute('aW', new THREE.BufferAttribute(a, 4));
      const m = new THREE.Points(ge, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uScale: FXSCALE, uA: { value: new THREE.Vector3(A[0], yy, A[1]) }, uB: { value: new THREE.Vector3(B[0], yy, B[1]) }, uCol: { value: new THREE.Vector4(col[0], col[1], col[2], lat) } },
        vertexShader: 'attribute vec4 aW; uniform float uTime, uScale; uniform vec3 uA, uB; uniform vec4 uCol; void main(){ float ph = aW.x + uTime * (0.012 + 0.02 * aW.y) * (aW.z > 0.5 ? 1.0 : -1.0); float f = abs(fract(ph) * 2.0 - 1.0); vec3 d = normalize(uB - uA); vec3 p = mix(uA, uB, f) + vec3(-d.z, 0.0, d.x) * (aW.w - 0.5) * uCol.w; p.y += 0.6 * sin(uTime * 3.0 + aW.x * 40.0); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(7.0 * uScale / -mv.z, 1.5, 60.0); }',
        fragmentShader: 'uniform vec4 uCol; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(uCol.rgb * a * a, 1.0); }' })); m.frustumCulled = false; m.raycast = () => {}; scene.add(m); };
    // sagging strands strung between rooftops, like webs of settled ink or drifting vellum
    const webs = (strands, col, op) => { const pos = []; for (const [a, b, w] of strands) { const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w, sag = l * .12, P = f => [lerp(a[0], b[0], f), lerp(a[1], b[1], f) - sag * 4 * f * (1 - f), lerp(a[2], b[2], f)];
        for (let i = 0; i < 6; i++) { const p0 = P(i / 6), p1 = P((i + 1) / 6); pos.push(p0[0] - nx, p0[1], p0[2] - nz, p0[0] + nx, p0[1], p0[2] + nz, p1[0] - nx, p1[1], p1[2] - nz, p1[0] - nx, p1[1], p1[2] - nz, p0[0] + nx, p0[1], p0[2] + nz, p1[0] + nx, p1[1], p1[2] + nz); } }
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); const m = new THREE.Mesh(ge, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })); m.raycast = () => {}; scene.add(m); };
    const rndWebs = (c, R0, n, y0, y1, col, op, seed) => { const r = mulberry32(seed), st = []; for (let i = 0; i < n; i++) { const a = r() * 6.283, d = R0 * Math.sqrt(r()), a2 = a + (r() - .5) * 2, l = 14 + 30 * r(), x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d, ya = y0 + (y1 - y0) * r(), yb = y0 + (y1 - y0) * r(), wd = .35 + .9 * r() * r(); if (Math.hypot(x + Math.cos(a2) * l - c[0], z + Math.sin(a2) * l - c[1]) > R0 + 4) continue; st.push([[x, ya, z], [x + Math.cos(a2) * l, yb, z + Math.sin(a2) * l], wd]); } webs(st, col, op); };   // no strand may end outside the circle, so none trails over the place next door

    // a street: paving, lamps and a row of houses down each side, laid along a line of world points, in the frame of the thing it belongs to
    const street = (g, c, pts, o) => { for (let i = 0; i + 1 < pts.length; i++) { const A = pts[i], B = pts[i + 1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux, ry = -Math.atan2(uz, ux), mx = (A[0] + B[0]) / 2 - c[0], mz = (A[1] + B[1]) / 2 - c[1];
        M(g, new THREE.BoxGeometry(L + o.w * .4, .5, o.w), o.road, mx, .3, mz, { ry }); if (o.edge) for (const sd of [-1, 1]) M(g, new THREE.BoxGeometry(L + o.w * .4, .7, 1.4), o.edge, mx + nx * sd * (o.w / 2 + .3), .4, mz + nz * sd * (o.w / 2 + .3), { ry });
        if (o.h0) for (let d0 = 6, kk = 0; d0 < L - 6; kk++) { const d = 12 + 4 * sr(); for (const sd of [-1, 1]) { const w = 12 + 4 * sr(), h = o.h0 + o.h1 * sr() * sr(), sp = sr() < .18, lt = sr() < .75 ? o.lit : o.lit2; if ((kk + (sd > 0 ? 2 : 0)) % 5 === 4) continue; const x = A[0] + ux * (d0 + d / 2) + nx * sd * (o.w / 2 + 2 + w / 2), z = A[1] + uz * (d0 + d / 2) + nz * sd * (o.w / 2 + 2 + w / 2); if (o.skip && o.skip(x, z)) continue; house(g, x - c[0], 0, z - c[1], Math.atan2(nx, nz), d - 1, w, h, o.wall, o.roof, lt, sp); }
          d0 += d + (kk % 5 === 4 ? 5 : .5); }
        for (let d0 = 10; d0 < L; d0 += o.gap || 24) for (const sd of [-1, 1]) { const x = A[0] + ux * d0 + nx * sd * (o.w / 2 - 1.4), z = A[1] + uz * d0 + nz * sd * (o.w / 2 - 1.4); M(g, new THREE.CylinderGeometry(.35, .5, 10, 6), o.post, x - c[0], 5, z - c[1]); NS(M(g, new THREE.SphereGeometry(1.05, 8, 6), o.lit, x - c[0], 10.6, z - c[1])); if (o.lamps) o.lamps.push([x, z]); } } };

    // Vellum Gargoyle Gate (28,18 27,19 28,19): the one way through the wall - two towers and a pointed arch - and beside it, crouched on a plinth and never leaving, a gargoyle of layered, rune-covered parchment
    { const GW = [SQGATE[0] * S, SQGATE[1] * S], out = [Math.cos(SQGATE[2]), Math.sin(SQGATE[2])], ry0 = -Math.atan2(out[1], out[0]);
      const parch = new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true, map: canvasTex(256, 256, (c, w, hgt) => { const r = mulberry32(31); c.fillStyle = '#d8c9a0'; c.fillRect(0, 0, w, hgt); c.strokeStyle = '#5a4630'; for (let i = 0; i < 40; i++) { c.globalAlpha = .35 + .4 * r(); c.lineWidth = 1 + r(); c.beginPath(); let x = r() * w, y = r() * hgt; c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - .5) * 26; y += (r() - .5) * 14; c.lineTo(x, y); } c.stroke(); } c.globalAlpha = 1; }) });
      const E = (grp, r, mat, x, y, z, sx, sy, sz) => M(grp, new THREE.SphereGeometry(r, 12, 9), mat, x, y, z, { sx, sy, sz }); let head = null, wings = [];
      addThing('Vellum Gargoyle Gate', '🦇', GW, 1, 30, g => { const k = kit(g);
        for (const sd of [-1, 1]) { k.B(24, 78, 24, bm, 0, 39, sd * 30); k.B(27, 4, 27, gd, 0, 79, sd * 30); M(g, new THREE.ConeGeometry(17, 30, 4), roofD, 0, 96, sd * 30, { ry: Math.PI / 4 }); for (const yy of [30, 54]) NS(k.B(.5, 9, 3, litP, 12.2, yy, sd * 30)); }   // gate towers
        k.B(16, 16, 40, bm, 0, 62, 0); M(g, gable(40, 16, 16), bm, 0, 70, 0, { ry: Math.PI / 2 }); NS(M(g, new THREE.PlaneGeometry(36, 50), new THREE.MeshBasicMaterial({ color: 0x7a40d0, transparent: true, opacity: .18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 27, 0, { ry: Math.PI / 2 }));       // the arch, and the shimmer of the ward across it
        // the gargoyle, on its plinth outside the wall
        const gp = new THREE.Group(); gp.position.set(46, 0, 62); gp.rotation.y = -.5; gp.scale.setScalar(2.1); g.add(gp); M(gp, new THREE.BoxGeometry(26, 7, 20), bm, 0, 3.5, 0); const bd = new THREE.Group(); gp.add(bd);
        E(bd, 9, parch, -3, 15, 0, 1.3, 1, 1.05); E(bd, 7.5, parch, 6, 19, 0, 1, 1.15, 1); for (const sd of [-1, 1]) { E(bd, 5.4, parch, -5, 11, sd * 7, 1.3, 1, .8); M(bd, new THREE.CylinderGeometry(1.9, 1.6, 15, 7), parch, 9, 13, sd * 4.2); E(bd, 2.2, parch, 10.4, 7.6, sd * 4.2, 1.6, .6, 1); E(bd, 2.4, parch, 1, 7.6, sd * 8, 1.7, .6, 1); }
        for (let i = 0; i < 7; i++) { const a = i * .5; M(bd, new THREE.CylinderGeometry(1.5 - i * .15, 1.6 - i * .15, 5, 6), parch, -14 - Math.sin(a) * 9, 9 + (1 - Math.cos(a)) * 5, Math.cos(a) * 5 - 5, { rz: Math.PI / 2, ry: a }); }                                                                 // tail, curled round
        mergeKids(bd); head = new THREE.Group(); head.position.set(11, 27, 0); gp.add(head); E(head, 5.6, parch, 0, 0, 0, 1.15, .9, 1); M(head, new THREE.BoxGeometry(7, 3.4, 4.6), parch, 5.5, -1.6, 0); for (const sd of [-1, 1]) { M(head, new THREE.ConeGeometry(1.2, 8, 5), parch, -2.5, 5.5, sd * 3, { rz: .7, rx: sd * .4 }); M(head, new THREE.SphereGeometry(.9, 8, 6), litP, 3.6, 1.2, sd * 3.2); }
        wings = [-1, 1].map(sd => { const w = new THREE.Group(); w.position.set(2, 23, sd * 5); for (let i = 0; i < 9; i++) M(w, new THREE.BoxGeometry(22 - i * 1.2, .5, 7), parch, -8 - i * 1.2, 4 + i * 2.2, sd * (3 + i * 1.5), { rz: -.5 - i * .06, rx: sd * (.5 - i * .03) }); mergeKids(w); gp.add(w); return w; });
        k.C(30, 30, .7, 28, wm, -34, .35, 0);                                                                                                                         // a white forecourt just inside, where the Ray Promenade begins
      }, { y: GY, ry: ry0, hexes: [[28, 18], [27, 19], [28, 19]], top: 120, view: 560 });
      anim.push(t => { if (head) { head.rotation.y = .5 * Math.sin(t * .17) + .12 * Math.sin(t * .6); head.rotation.z = .08 * Math.sin(t * .23); wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * .06 * Math.sin(t * .5 + i); }); } }); }

    // Inkfall Streets (27,16): a knot of streets where black-purple ink dust gathers in every crevice and hangs between the roofs like cobweb
    { const bm = bmL, roofD = roofL, c = hexW(27, 16);
      addThing('Inkfall Streets', '🕸️', c, 1, 30, g => { const k = kit(g); k.B(100, .6, 12, solid(0x0c0c10, .5), 0, .3, 0); k.B(12, .6, 100, solid(0x0c0c10, .5), 0, .3, 0);
        for (const qx of [-1, 1]) for (const qz of [-1, 1]) for (let i = 0; i < 3; i++) { house(g, qx * (15 + i * 15), 0, qz * 15, 0, 13, 14 + 4 * sr(), 20 + 24 * sr(), bm, roofD, litP, i === 1 && sr() < .6); if (i) house(g, qx * 15, 0, qz * (15 + i * 15), Math.PI / 2, 13, 14, 18 + 20 * sr(), bm, roofD, sr() < .5 ? litP : litW, false); }
      }, { y: GY, hexes: [[27, 16]], top: 64, view: 420 });
      rndWebs(c, 54, 170, GY + 6, GY + 44, 0x2a0f3e, .62, 53); rndWebs(c, 54, 66, GY + 10, GY + 40, 0x7a3ac0, .3, 54);
      const pm = mist({ n: 90, seed: 55, r0: 6, r1: 60, y0: 3, y1: 16, spin: .06, rise: 0, size: 20, alpha: .12, col: [.4, .14, .6] }); pm.position.set(c[0], GY, c[1]); scene.add(pm);
      walkers([c[0] - 50, c[1]], [c[0] + 50, c[1]], 12, [1.8, .5, 2.2], 6, GY + 4, 56); walkers([c[0], c[1] - 50], [c[0], c[1] + 50], 12, [1.8, .5, 2.2], 6, GY + 4, 57); }

    // Hecklebox Balcony (27,15): shown open to the sky and cut away at the front - one figure at a lectern on a dais in the middle, under a shaft of light; three rings of boxes rising round them, each box with its own bench and lamp;
    // roof ribs meeting at a gilded oculus; and the hexes thrown from the boxes streaming in
    { const bm = bmL, c = hexW(27, 15), TS = Math.PI / 6, TL = Math.PI * 5 / 3;   // the rings leave a sixth of the circle open, towards the viewer
      addThing('Hecklebox Balcony', '🎭', c, 1, 30, g => { const k = kit(g), bmD = bm.clone(), wmD = wm.clone(), hexP = glowM(0xa860ff, 2.4), hexG = glowM(0x58e890, 2.2); bmD.side = wmD.side = THREE.DoubleSide;
        k.C(41, 42, 1.4, 40, bm, 0, .7, 0); k.C(15.5, 15.5, .4, 32, wm, 0, 1.6, 0); for (const r of [15.6, 10.5]) k.T(r, .32, gd, 0, 1.8, 0, { rx: Math.PI / 2 }); for (let i = 0; i < 12; i++) k.B(.4, .3, 5, gd, Math.sin(i * .5236) * 13, 1.75, Math.cos(i * .5236) * 13, { ry: i * .5236 });
        k.C(7, 7.6, 1.2, 20, wm, 0, 2.2, 0); k.C(5, 5.4, 1.2, 20, bm, 0, 3.4, 0); statue(g, wm, 0, 4, 0, 9, 0, 2); k.B(2.6, 3.2, 1.2, gd, 0, 5.6, 3.2); k.B(3.2, .4, 1.8, gd, 0, 7.3, 3.2, { rx: .35 });                                              // the dais, the speaker and their lectern
        NS(M(g, new THREE.CylinderGeometry(1.2, 6.5, 40, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 0, 24, 0)).raycast = () => {};   // the light they stand in
        for (let j = 0; j < 3; j++) { const Rr = 17 + j * 7.5, yy = 7 + j * 8.5, A = j % 2 ? wm : bm, AD = j % 2 ? wmD : bmD, Bm = j % 2 ? bm : wm;
          M(g, new THREE.RingGeometry(Rr, Rr + 7, 44, 1, -Math.PI / 3, TL), A, 0, yy, 0, { rx: -Math.PI / 2 }); M(g, new THREE.CylinderGeometry(Rr, Rr, 3.2, 44, 1, true, TS, TL), AD, 0, yy + .4, 0); M(g, new THREE.CylinderGeometry(Rr + 7, Rr + 7, 9.5, 44, 1, true, TS, TL), AD, 0, yy + 3.5, 0);     // the floor of the ring, its parapet and its back wall
          M(g, new THREE.TorusGeometry(Rr, .34, 5, 44, TL), gd, 0, yy + 2.1, 0, { rx: Math.PI / 2, rz: Math.PI * 2 / 3 }); M(g, new THREE.TorusGeometry(Rr + 7, .4, 5, 44, TL), gd, 0, yy + 8.4, 0, { rx: Math.PI / 2, rz: Math.PI * 2 / 3 });
          const nb = 9 + j * 3; for (let i = 0; i <= nb; i++) { const th = TS + TL * i / nb, sn = Math.sin(th), cs = Math.cos(th); k.B(.5, 5.5, 7, Bm, sn * (Rr + 3.5), yy + 2.7, cs * (Rr + 3.5), { ry: th }); k.C(.7, .8, yy, 6, Bm, sn * (Rr + .6), yy / 2, cs * (Rr + .6));
            if (i < nb) { const tm = th + TL / nb / 2; NS(k.S(.75, (i + j) % 2 ? hexP : hexG, Math.sin(tm) * (Rr + 5.6), yy + 5.6, Math.cos(tm) * (Rr + 5.6))); k.B(3.4, .9, 1.4, Bm, Math.sin(tm) * (Rr + 4.4), yy + .5, Math.cos(tm) * (Rr + 4.4), { ry: tm }); } } }                                    // partitions between the boxes, the columns under them, a lamp and a bench in each
        for (let i = 0; i < 8; i++) { const th = TS + TL * (i + .5) / 8, sn = Math.sin(th), cs = Math.cos(th); rod(g, bm, [sn * 39, 33.5, cs * 39], [sn * 7, 47, cs * 7], .55); rod(g, wm, [sn * 17, 9, cs * 17], [sn * 6.5, 2.4, cs * 6.5], .4); }                                                  // roof ribs up to the oculus, and the white speaking tubes running down to the floor
        k.T(7, .7, gd, 0, 47, 0, { rx: Math.PI / 2 }); rod(g, gd, [0, 47, -7], [0, 47, 7], .3); rod(g, gd, [-7, 47, 0], [7, 47, 0], .3); rod(g, gd, [0, 47, 0], [0, 41, 0], .2); NS(k.S(1.8, litW, 0, 40, 0));
        for (const sd of [-1, 1]) { const th = sd * TS, sn = Math.sin(th), cs = Math.cos(th); k.B(4, 32, 4, bm, sn * 38, 16, cs * 38, { ry: th }); k.B(5, 1.2, 5, gd, sn * 38, 32.6, cs * 38, { ry: th }); M(g, new THREE.ConeGeometry(3, 8, 4), bm, sn * 38, 37, cs * 38, { ry: th + .785 }); }                 // the two piers where the rings are cut
      }, { y: GY, hexes: [[27, 15]], top: 58, view: 380 });
      for (const [col, sd] of [[[1.6, .5, 2.4], 61], [[.5, 2, .9], 62]]) { const m = mist({ n: 110, seed: sd, arms: 6, jit: .3, r0: 36, r1: 2, y0: 24, y1: 9, spin: .25, rise: .3, twist: 1.5, size: 4.5, alpha: .85, col, add: true }); m.position.set(c[0], GY, c[1]); scene.add(m); }
      lanternPts.push([c[0], GY + 16, c[1], { c: [2.4, 2, 1.6], size: 16, drift: .1, speed: .4 }]); }

    // Annex of Addenda (28,14 28,13 29,13): where devils keep their contracts - a long black archive with four spires, red light in its windows, and on its doors a seal as tall as a house
    { const bm = bmL, roofD = roofL, HX = [[28, 14], [28, 13], [29, 13]], c = cenW(HX);
      const sealTex = canvasTex(256, 256, (cx, w, hgt) => { cx.fillStyle = '#000'; cx.fillRect(0, 0, w, hgt); cx.strokeStyle = '#fff'; cx.lineWidth = 7; for (const r of [116, 96]) { cx.beginPath(); cx.arc(128, 128, r, 0, 6.283); cx.stroke(); } cx.lineWidth = 6; cx.beginPath(); for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * 2.5133; cx.lineTo(128 + Math.cos(a) * 92, 128 - Math.sin(a) * 92); } cx.stroke(); cx.lineWidth = 3; for (let i = 0; i < 18; i++) { const a = i * .349; cx.beginPath(); cx.moveTo(128 + Math.cos(a) * 99, 128 + Math.sin(a) * 99); cx.lineTo(128 + Math.cos(a + .1) * 113, 128 + Math.sin(a + .1) * 113); cx.stroke(); } });
      const sealM = new THREE.MeshStandardMaterial({ color: 0x3a0806, roughness: .35, emissive: 0xff2a14, emissiveMap: sealTex, emissiveIntensity: 2.6 });
      addThing('Annex of Addenda', '📜', c, 1, 30, g => { const k = kit(g); k.B(104, 3, 70, bm, 0, 1.5, 0); for (let i = 0; i < 5; i++) k.B(40 - i * 3, .7, 5, wm, 0, .4 + i * .6, 40 + (4 - i) * 3);                    // podium and steps
        k.B(84, 50, 44, bm, 0, 28, -4); M(g, gable(48, 22, 86), roofD, 0, 53, -4, { ry: Math.PI / 2 }); for (const sx of [-1, 1]) { k.B(26, 36, 56, bm, sx * 50, 21, -4); M(g, gable(28, 14, 58), roofD, sx * 50, 39, -4); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.B(11, 78, 11, bm, sx * 39, 42, -4 + sz * 22); M(g, new THREE.ConeGeometry(8, 34, 4), roofD, sx * 39, 98, -4 + sz * 22, { ry: Math.PI / 4 }); NS(k.S(1.4, litR, sx * 39, 116, -4 + sz * 22)); }
        for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) { NS(k.B(3, 16, .5, litR, sx * (10 + i * 5.6), 30, 18.2)); if (i < 4) NS(k.B(.5, 14, 3, litR, sx * 63.2, 22, -22 + i * 12)); }
        k.B(22, 34, 2, solid(0x1a0606, .5), 0, 20, 18.6); NS(M(g, new THREE.CircleGeometry(13, 40), sealM, 0, 22, 19.8)); k.T(13.4, 1.2, gd, 0, 22, 19.8); for (const sd of [-1, 1]) k.B(30, 1.4, 1.4, solid(0x202024, .4, { metalness: .7 }), 0, 22 + sd * 9, 20.4, { rz: sd * .3 });           // the doors, the seal, and chains across it
        for (const sx of [-1, 1]) { k.C(2.4, 3.2, 10, 8, bm, sx * 24, 8, 34); NS(k.S(2.4, litR, sx * 24, 14.6, 34)); }
      }, { y: GY, hexes: HX, top: 130, view: 620 });
      lanternPts.push([c[0], GY + 24, c[1] + 22, { c: [2.6, .4, .2], size: 26, drift: .1, speed: .5 }]); for (const sx of [-1, 1]) lanternPts.push([c[0] + sx * 24, GY + 15, c[1] + 34, { c: [2.6, .5, .2], size: 10, drift: .5, speed: 1.4 }]); }

    // Umbral Blade Loom (29,14): a black loom as tall as a tower. Its warp of ten thousand threads spreads down from the beam like a skirt; heddle frames rise and fall in it and a gold shuttle flies across; the cloth of woven shadow comes off the front
    // and runs out over the steps; great wheels turn on its sides, bobbins as tall as a man feed it from all round, and the blades it has made stand point-down in a ring about its foot
    { const bm = bmL, roofD = roofL, c = hexW(29, 14), thread = canvasTex(256, 16, (cx, w, hgt) => { cx.fillStyle = '#000'; cx.fillRect(0, 0, w, hgt); const r = mulberry32(9); for (let i = 0; i < 70; i++) { cx.fillStyle = r() < .2 ? '#fff' : '#9a9a9a'; cx.fillRect(r() * w, 0, 1 + (r() < .15 ? 1 : 0), hgt); } }, 5, 1);
      const skirt = new THREE.MeshStandardMaterial({ color: 0x0c0a12, emissive: 0x6a2ad0, emissiveIntensity: .7, alphaMap: thread, emissiveMap: thread, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: .6 }), cloth = flowMat('#0b0916', '#8a4ae0', 0x6a2ad0, .96, -.06), hed = [], wheels = []; let shut = null;
      addThing('Umbral Blade Loom', '🧵', c, 1, 30, g => { const k = kit(g), iron = solid(0x3a3a48, .35, { metalness: .6 }), blade = new THREE.MeshStandardMaterial({ color: 0x0c0a16, roughness: .15, metalness: .7, emissive: 0x7a3ae0, emissiveIntensity: .55 }), spool = solid(0x4a3470, .7), hexThread = glowM(0x7a3ae0, 1.2);
        M(g, new THREE.CylinderGeometry(62, 64, 2, 8), bm, 0, 1, 0, { ry: .3927 }); M(g, new THREE.CylinderGeometry(52, 54, 2, 8), sqBM, 0, 3, 0, { ry: .3927 }); M(g, new THREE.CylinderGeometry(42, 44, 2, 8), bm, 0, 5, 0, { ry: .3927 }); k.T(47, .5, gd, 0, 4.2, 0, { rx: Math.PI / 2 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.B(5, 164, 5, bm, sx * 17, 88, sz * 17); k.B(10, 12, 10, bm, sx * 17, 12, sz * 17); k.B(11.4, 1.4, 11.4, gd, sx * 17, 18.6, sz * 17); rod(g, bm, [sx * 34, 6, sz * 34], [sx * 18, 58, sz * 18], 1.6); }                  // the four posts, their feet and their raking shores
        for (const yy of [56, 112, 166]) { for (const sz of [-1, 1]) k.B(38, 3.4, 3.4, bm, 0, yy, sz * 17); for (const sx of [-1, 1]) k.B(3.4, 3.4, 38, bm, sx * 17, yy, 0); }
        for (const sx of [-1, 1]) for (const [ya, yb] of [[58, 110], [114, 164]]) { rod(g, iron, [sx * 17, ya, -17], [sx * 17, yb, 17], .8); rod(g, iron, [sx * 17, ya, 17], [sx * 17, yb, -17], .8); }                                                                                // cross-bracing up the sides
        k.B(46, 9, 46, bm, 0, 174, 0); k.B(48, 1.4, 48, gd, 0, 179.2, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) M(g, new THREE.ConeGeometry(4, 16, 4), roofD, sx * 19, 188, sz * 19, { ry: Math.PI / 4 }); M(g, new THREE.ConeGeometry(11, 40, 4), roofD, 0, 200, 0, { ry: Math.PI / 4 }); NS(k.S(2.2, litP, 0, 222, 0));   // the castle at its head
        k.C(6, 6, 44, 14, gd, 0, 150, 0, { rz: Math.PI / 2 }); for (const sx of [-1, 1]) k.C(8.5, 8.5, 1.6, 16, gd, sx * 21.5, 150, 0, { rz: Math.PI / 2 });                                                                                                                         // the warp beam
        NS(M(g, new THREE.CylinderGeometry(7, 56, 140, 64, 1, true), skirt, 0, 78, 0)); NS(M(g, new THREE.CylinderGeometry(5, 40, 130, 48, 1, true), skirt, 0, 80, 0, { ry: .4 }));
        k.C(4.6, 4.6, 40, 14, gd, 0, 14, 25, { rz: Math.PI / 2 }); NS(M(g, new THREE.PlaneGeometry(30, 50), cloth, 0, 37, 13.5, { rx: -.42 })); NS(M(g, new THREE.PlaneGeometry(30, 15), cloth, 0, 6.25, 33.5, { rx: -Math.PI / 2 })); NS(M(g, new THREE.PlaneGeometry(30, 21.4), cloth, 0, 4.3, 51.5, { rx: -1.383 }));   // the cloth: off the fell, round the cloth beam, and out across the steps
        for (let i = 0; i < 2; i++) { const h = new THREE.Group(); M(h, new THREE.BoxGeometry(30, 1.2, 1.2), gd, 0, 8, 0); M(h, new THREE.BoxGeometry(30, 1.2, 1.2), gd, 0, -8, 0); for (let w = 0; w < 13; w++) M(h, new THREE.BoxGeometry(.3, 16, .3), iron, -13.2 + w * 2.2, 0, 0); mergeKids(h); h.position.set(0, 104, i ? 4 : -4); g.add(h); hed.push(h); }   // heddle frames
        shut = new THREE.Group(); M(shut, new THREE.OctahedronGeometry(1.6, 0), gd, 0, 0, 0, { sx: 3.4 }); NS(M(shut, new THREE.SphereGeometry(.8, 8, 6), litP, 0, 0, 0)); shut.position.set(0, 88, 0); g.add(shut);                                                                           // the shuttle
        for (const sx of [-1, 1]) { const w = new THREE.Group(); M(w, new THREE.TorusGeometry(13, 1.3, 6, 28), iron, 0, 0, 0); for (let i = 0; i < 4; i++) M(w, new THREE.BoxGeometry(26, 1.2, 1.2), iron, 0, 0, 0, { rz: i * .785 }); M(w, new THREE.CylinderGeometry(2.4, 2.4, 3, 12), gd, 0, 0, 0, { rx: Math.PI / 2 }); mergeKids(w);
          const hold = new THREE.Group(); hold.position.set(sx * 22.5, 36, 0); hold.rotation.y = Math.PI / 2; hold.add(w); g.add(hold); wheels.push(w); }                                                                                                                           // the wheels on its sides
        for (let i = 0; i < 8; i++) { const a = i * .785 + .39, x = Math.cos(a) * 47, z = Math.sin(a) * 47; if (z > 35) continue; k.C(5, 5, .8, 14, gd, x, 4.6, z); k.C(3.8, 3.8, 10, 14, spool, x, 10, z); k.C(5, 5, .8, 14, gd, x, 15.4, z); NS(rod(g, hexThread, [x, 15.8, z], [Math.cos(a) * 6, 150, Math.sin(a) * 6], .22, 4)); }   // bobbins, each with its thread running up to the beam
        for (let i = 0; i < 16; i++) { const a = i * .3927 + .196, x = Math.cos(a) * 57, z = Math.sin(a) * 57; if (Math.abs(x) < 18 && z > 0) continue; M(g, new THREE.ConeGeometry(1.4, 18, 4), blade, x, 11, z, { rx: Math.PI, ry: a, sz: .3 }); k.B(5, .8, 1.2, gd, x, 20.4, z, { ry: -a + Math.PI / 2 }); k.C(.45, .45, 4, 6, bm, x, 22.8, z); k.S(.8, gd, x, 25.2, z); }   // the blades
        for (let i = 0; i < 12; i++) { const a = i * .5236; NS(k.S(1.3, litP, Math.cos(a) * 20, 30 + (i * 37) % 130, Math.sin(a) * 20)); }
      }, { y: GY, hexes: [[29, 14]], top: 232, view: 560 });
      anim.push(t => { hed.forEach((h, i) => { h.position.y = 104 + (i ? -7 : 7) * Math.sin(t * 1.1); }); if (shut) shut.position.x = 13 * Math.sin(t * 1.9); wheels.forEach((w, i) => { w.rotation.z = t * (i ? -.5 : .5); }); });
      const sh = mist({ n: 80, seed: 71, r0: 8, r1: 50, y0: 146, y1: 12, spin: .5, rise: .12, twist: 3, size: 4, alpha: .8, col: [1.4, .6, 2.6], add: true }); sh.position.set(c[0], GY, c[1]); scene.add(sh); }

    // Whispertube Tenements (29,15): a tenement block built round a court, and filling the court's back wall, floor to roof, the brass horns people speak their mail into
    { const bm = bmL, roofD = roofL, c = hexW(29, 15), brass = new THREE.MeshStandardMaterial({ color: 0xb8923c, roughness: .3, metalness: .8 });
      addThing('Whispertube Tenements', '📯', c, 1, 30, g => { const k = kit(g), win = wallMat(10, 4, '#585868', '#0a0a10', '#c890ff', .3);
        k.B(70, 46, 16, win, 0, 23, -22); for (const sx of [-1, 1]) { k.B(16, 46, 44, win, sx * 27, 23, 8); M(g, gable(18, 9, 46), roofD, sx * 27, 46, 8); } M(g, gable(18, 9, 72), roofD, 0, 46, -22, { ry: Math.PI / 2 });
        k.B(38, 44, 2, bm, 0, 22, -13); for (let i = 0; i < 11; i++) for (let j = 0; j < 12; j++) M(g, new THREE.ConeGeometry(1.25, 2.8, 8, 1, true), brass, -16.5 + i * 3.3, 3.6 + j * 3.5, -10.6, { rx: -Math.PI / 2 });                                 // the wall of horns
        for (let i = 0; i < 6; i++) k.C(.5, .5, 44, 6, brass, -18 + i * 7.2, 22, -11.6); for (const yy of [15, 30]) k.B(38, .6, 5, bm, 0, yy, -9);
      }, { y: GY, hexes: [[29, 15]], top: 70, view: 420 }); }

    // Spotlight Lance Plaza (31,15): a round plaza with a spire at its middle throwing a lance of white light straight up, to be seen from anywhere on the map
    { const c = hexW(31, 15), beamM = (op) => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.4), transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      addThing('Spotlight Lance Plaza', '🔦', c, 1, 30, g => { const k = kit(g); k.C(44, 45, 1.2, 36, wm, 0, .6, 0); for (const r of [14, 28, 42]) k.T(r, .5, gd, 0, 1.3, 0, { rx: Math.PI / 2 }); k.C(8, 11, 8, 12, wm, 0, 5, 0); M(g, new THREE.ConeGeometry(6, 62, 8), wm, 0, 40, 0); k.T(4.4, .8, gd, 0, 44, 0, { rx: Math.PI / 2 }); NS(k.S(3, litW, 0, 72, 0));
        for (let i = 0; i < 8; i++) { const a = i * .785; k.C(1, 1.3, 12, 6, gd, Math.cos(a) * 36, 6, Math.sin(a) * 36); NS(k.S(1.6, litW, Math.cos(a) * 36, 13, Math.sin(a) * 36)); }
        // more to it: a lower step round the rim, gold rays inlaid from the spire to the edge and a dark ring among them
        k.C(48.5, 49.5, .6, 36, wm, 0, .3, 0); k.T(21, .8, bm, 0, 1.05, 0, { rx: Math.PI / 2 }); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; k.B(30, .16, .6, gd, Math.cos(a) * 27, 1.28, Math.sin(a) * 27, { ry: -a }); }
        // the spire: stepped drums under it, eight struts leaning on it each with a gilded foot, gold collars up its length, and a cage of prongs round the light
        k.C(13, 14, 2, 16, wm, 0, 2.2, 0); k.C(10.4, 11.4, 2, 16, wm, 0, 4.2, 0); k.T(9.3, .5, gd, 0, 9.3, 0, { rx: Math.PI / 2 });
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8, ca = Math.cos(a), sa = Math.sin(a); rod(g, wm, [ca * 11.5, 3, sa * 11.5], [ca * 3.4, 31, sa * 3.4], 1.0, 4); k.K(1.3, 4.6, 6, gd, ca * 11.5, 6.6, sa * 11.5); }
        for (const y of [22, 34, 54, 64]) k.T(6 * (71 - y) / 62 + .55, .42, gd, 0, y, 0, { rx: Math.PI / 2 });
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; rod(g, gd, [Math.cos(a) * 1.3, 66, Math.sin(a) * 1.3], [Math.cos(a) * 4.4, 75, Math.sin(a) * 4.4], .28, 5); } k.T(4.4, .34, gd, 0, 75, 0, { rx: Math.PI / 2 });
        // a ring of gold-framed mirrors turned up at the point of the spire, statues at the four quarters, curved benches between them
        { const mir = new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: .03, metalness: 1, envMapIntensity: 2.4 });
          for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8, x = Math.cos(a) * 23, z = Math.sin(a) * 23; k.C(.5, .8, 4.4, 6, gd, x, 3.4, z); k.B(.7, 8.6, 6.6, gd, x, 8.6, z, { ry: -a, rz: -.5 }); k.B(.5, 7.6, 5.6, mir, x - Math.cos(a) * .3, 8.75, z - Math.sin(a) * .3, { ry: -a, rz: -.5 }); } }
        for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12 + .13; NS(k.C(.6, .6, .2, 8, litW, Math.cos(a) * 45.4, 1.3, Math.sin(a) * 45.4)); if (i % 3 === 0) NS(k.C(.5, .5, .2, 8, litW, Math.cos(a) * 17.6, 1.3, Math.sin(a) * 17.6)); }   // lights let into the paving round the rim and round the spire
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; NS(k.C(4.4, 4.4, .16, 20, waterGlass(0xbfe6f2, .85), Math.cos(a) * 33, 1.32, Math.sin(a) * 33)); k.T(4.5, .35, gd, Math.cos(a) * 33, 1.4, Math.sin(a) * 33, { rx: Math.PI / 2 }); }      // four shallow mirror pools between the statues
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; k.B(.7, 5.6, 1.1, wm, Math.cos(a) * 9.6, 6.2, Math.sin(a) * 9.6, { ry: -a }); }                                                                                                                 // flutes round the drum the spire stands on
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, x = Math.cos(a) * 38, z = Math.sin(a) * 38; k.B(5.4, 4, 5.4, wm, x, 3.2, z, { ry: -a }); k.B(6.2, .7, 6.2, gd, x, 5.5, z, { ry: -a }); statue(g, wm, x, 5.8, z, 13, -a, i);
          M(g, new THREE.TorusGeometry(31, 1.1, 4, 10, .62), wm, 0, 2.3, 0, { rx: Math.PI / 2, rz: a + .46 }); }
      }, { y: GY, hexes: [[31, 15]], top: 100, view: 460 });
      for (const [r0, r1, op] of [[3, 6, .34], [9, 30, .07]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1700, 20, 1, true), beamM(op)); m.position.set(c[0], GY + 72 + 850, c[1]); m.raycast = () => {}; m.frustumCulled = false; scene.add(m); }
      lanternPts.push([c[0], GY + 72, c[1], { c: [2.8, 2.7, 2.4], size: 40, drift: .1, speed: .4 }]); }

    // Illumination Hall (33,15): a white cathedral, light pouring out of every tall window and up through its roof
    { const c = hexW(33, 15), shaft = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.4, 1.1), transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      addThing('Illumination Hall', '⛪', c, 1, 30, g => { const k = kit(g); k.B(34, 3, 78, wm, 0, 1.5, 0); k.B(26, 44, 62, wm, 0, 24, -4); M(g, gable(29, 16, 64), roofG, 0, 46, -4); k.B(50, 34, 16, wm, 0, 19, -10); M(g, gable(18, 10, 52), roofG, 0, 36, -10, { ry: Math.PI / 2 });
        for (const sx of [-1, 1]) { k.B(10, 70, 10, wm, sx * 11, 37, 28); M(g, new THREE.ConeGeometry(7.4, 30, 4), roofG, sx * 11, 87, 28, { ry: Math.PI / 4 }); for (let i = 0; i < 5; i++) NS(k.B(.5, 26, 5, litW, sx * 13.2, 26, 16 - i * 10)); }
        NS(M(g, new THREE.CircleGeometry(6.5, 24), litW, 0, 34, 33.2)); k.T(6.8, .8, gd, 0, 34, 33.2); NS(k.B(7, 14, .5, litW, 0, 10, 33.2));
        for (const [x, z, r] of [[0, 46, 7], [-14, 52, 4.5], [14, 52, 4.5]]) NS(k.T(r, .5, litW, x, 1, z, { rx: Math.PI / 2 }));                                                                              // circles of light on the paving before the doors
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const m = M(g, new THREE.PlaneGeometry(9, 60), shaft, sx * 30, 24, 10 - i * 14, { rz: sx * .9 }); m.userData.noShadow = true; m.raycast = () => {}; }
        // a front between the towers for the door and the rose to sit in, gabled, a light on its point; a row of small lit niches over the door; gold string courses across it
        k.B(12.4, 56, 2, wm, 0, 30, 32); M(g, gable(12.4, 8, 2), wm, 0, 58, 32); k.K(.9, 4, 6, gd, 0, 68, 32); NS(k.S(.9, litW, 0, 70.6, 32)); for (const y of [20, 44]) k.B(12.6, .5, .5, gd, 0, y, 33.2);
        for (let i = 0; i < 5; i++) { NS(k.B(1.1, 4.2, .4, litW, -4.6 + i * 2.3, 23.2, 33.15)); k.B(1.5, .4, .5, gd, -4.6 + i * 2.3, 25.6, 33.2); }
        for (const sx of [-1, 1]) { for (const cx of [-5.2, 5.2]) for (const cz of [-5.2, 5.2]) k.B(1.5, 70, 1.5, wm, sx * 11 + cx, 37, 28 + cz);                                    // the towers: a buttress up each corner,
          for (const y of [16, 42]) { k.B(11.2, .5, 11.2, gd, sx * 11, y, 28); NS(k.B(1.7, 12, .4, litW, sx * 11, y + 8, 33.15)); NS(k.B(.4, 12, 1.7, litW, sx * 16.15, y + 8, 28)); k.B(2.5, .5, .6, gd, sx * 11, y + 14.4, 33.2); }   // string courses, and a lancet in front and at the side on two levels
          for (let i = 0; i < 5; i++) { const z = 16 - i * 10; NS(M(g, new THREE.CylinderGeometry(1.5, 1.5, .4, 12), litW, sx * 13.2, 42.6, z, { rz: Math.PI / 2 })); M(g, new THREE.TorusGeometry(1.7, .25, 4, 12), gd, sx * 13.4, 42.6, z, { ry: Math.PI / 2 }); }   // a round clerestory window over each tall one
          for (const dz of [-4.4, 0, 4.4]) NS(k.B(.4, 16, 2.2, litW, sx * 25.15, 19, -10 + dz)); NS(M(g, new THREE.CylinderGeometry(2.4, 2.4, .4, 14), litW, sx * 25.15, 31.5, -10, { rz: Math.PI / 2 })); for (const dz of [-7.2, 7.2]) k.K(1.2, 6, 4, gd, sx * 24.2, 39, -10 + dz, { ry: Math.PI / 4 });   // three lancets and a rose in each transept end
          for (const z of [39, 46]) { k.C(.4, .6, 9, 6, gd, sx * 17, 4.5, z); NS(k.S(1.1, litW, sx * 17, 9.7, z)); } k.B(1, 2.2, 12, wm, sx * 18.5, 1.1, 42); }                                                                                               // lamps and a low wall either side of the steps
        // more to it. Buttresses down both sides, each with a gilded pinnacle; gold frames to the tall windows; a gold crest along the ridge
        for (const sx of [-1, 1]) { for (let i = 0; i < 6; i++) { const z = 21 - i * 10; if (Math.abs(z + 10) < 9) continue; k.B(3, 30, 2.4, wm, sx * 15.3, 17, z); k.B(2.2, 6, 2, wm, sx * 14.9, 35, z); k.K(1.5, 6, 4, gd, sx * 15.3, 41, z, { ry: Math.PI / 4 }); }
          for (let i = 0; i < 5; i++) { const z = 16 - i * 10; for (const dz of [-2.9, 2.9]) k.B(.5, 27, .5, gd, sx * 13.4, 26, z + dz); for (const y of [12.6, 39.6]) k.B(.5, .5, 6.3, gd, sx * 13.4, y, z); } }
        k.B(.5, 1.6, 62, gd, 0, 62.6, -4);
        // the towers: gold bands, a lit belfry, a pinnacle at each corner, a light at the very top
        for (const sx of [-1, 1]) { for (const y of [30, 52, 71.4]) k.B(10.9, 1, 10.9, gd, sx * 11, y, 28); NS(k.B(10.3, 9, 4, litW, sx * 11, 61, 28)); NS(k.B(4, 9, 10.3, litW, sx * 11, 61, 28)); NS(k.S(1.1, litW, sx * 11, 102.8, 28));
          for (const cx of [-4.4, 4.4]) for (const cz of [-4.4, 4.4]) k.K(1.1, 7, 4, gd, sx * 11 + cx, 75.4, 28 + cz, { ry: Math.PI / 4 }); }
        // the west front: steps, a gilded arch and jambs to the door, a statue either side, spokes to the rose window
        k.B(26, 1, 3, wm, 0, 2.5, 40.5); k.B(30, 1, 3, wm, 0, 1.5, 43.5); k.B(34, 1, 3, wm, 0, .5, 46.5); M(g, new THREE.TorusGeometry(4.6, .7, 5, 12, Math.PI), gd, 0, 16.8, 33.5); for (const sx of [-1, 1]) { k.B(.9, 14, .9, gd, sx * 4.6, 10, 33.5); statue(g, wm, sx * 8.6, 3, 36, 11, -Math.PI / 2, sx > 0 ? 0 : 2); }
        for (let i = 0; i < 6; i++) k.B(13, .35, .3, gd, 0, 34, 33.6, { rz: i * Math.PI / 6 });
        // over the crossing a lantern - an eight-sided drum with lit slits, a gilded dome on it - and at the east end a round apse with its own windows
        k.C(6, 6.4, 8, 8, wm, 0, 62, -10); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; NS(k.B(.4, 5, 1.6, litW, Math.cos(a) * 5.95, 62, -10 + Math.sin(a) * 5.95, { ry: -a })); } k.T(6.5, .5, gd, 0, 66.2, -10, { rx: Math.PI / 2 }); k.D(6.2, roofG, 0, 66.3, -10); NS(k.S(1, litW, 0, 73.4, -10));
        M(g, new THREE.CylinderGeometry(11, 11, 34, 14, 1, false, 0, Math.PI), wm, 0, 19, -35, { ry: Math.PI / 2 }); M(g, new THREE.SphereGeometry(11, 14, 8, 0, Math.PI, 0, Math.PI / 2), roofG, 0, 36, -35, { ry: Math.PI }); k.T(11.2, .5, gd, 0, 36, -35, { rx: Math.PI / 2 });
        for (const a of [-.75, 0, .75]) NS(k.B(1.6, 18, .5, litW, Math.sin(a) * 11.15, 20, -35 - Math.cos(a) * 11.15, { ry: a }));
      }, { y: GY, ry: -1.2, hexes: [[33, 15]], top: 110, view: 460 });
      { const m = new THREE.Mesh(new THREE.CylinderGeometry(11, 4, 520, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.4, 1.1), transparent: true, opacity: .09, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false })); m.position.set(c[0] + 9.3, GY + 74 + 260, c[1] - 3.6); m.raycast = () => {}; m.frustumCulled = false; scene.add(m); }   // the light going up through the roof, out of the lantern
      lanternPts.push([c[0], GY + 30, c[1], { c: [2.6, 2.4, 1.8], size: 34, drift: .1, speed: .3 }]); }

    // Vainglory (32,14): a glasshouse trimmed in gold; through the roof you can see the garden - a pool, silver flowers, and a tree whose leaves are mirrors
    { const c = hexW(32, 14), glass = new THREE.MeshStandardMaterial({ color: 0xe8f4f0, roughness: .05, transparent: true, opacity: .2, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false }), mirror = new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: .03, metalness: 1, envMapIntensity: 2.4, flatShading: true }), silver = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: .25, metalness: .8 });
      addThing('Vainglory', '🪞', c, 1, 30, g => { const k = kit(g); k.B(64, 2, 44, wm, 0, 1, 0); for (const sz of [-1, 1]) { k.B(60, 7, 1.6, wm, 0, 5.5, sz * 20); NS(k.B(60, 18, .5, glass, 0, 18, sz * 20)); } for (const sx of [-1, 1]) { k.B(1.6, 7, 40, wm, sx * 30, 5.5, 0); NS(k.B(.5, 18, 40, glass, sx * 30, 18, 0)); }
        NS(M(g, new THREE.CylinderGeometry(20, 20, 60, 18, 1, true, 0, Math.PI), glass, 0, 27, 0, { rz: Math.PI / 2 })); for (let i = 0; i < 7; i++) M(g, new THREE.TorusGeometry(20.2, .6, 5, 16, Math.PI), gd, -30 + i * 10, 27, 0, { ry: Math.PI / 2 }); k.B(60.6, .8, .8, gd, 0, 47, 0); for (const sz of [-1, 1]) k.B(60.6, .8, .8, gd, 0, 27, sz * 20.2);
        NS(k.C(9, 9, .5, 20, waterGlass(0x9fd8e8, .8), 12, 2.4, 0)); k.C(1.6, 2.6, 16, 7, silver, -10, 10, 0); for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 3 + (i % 4) * 2.4; M(g, new THREE.OctahedronGeometry(2.4, 0), mirror, -10 + Math.cos(a) * r, 18 + (i % 5) * 2, Math.sin(a) * r, { sy: .35, rx: sr() * 1.2, rz: sr() * 1.2 }); }
        for (let i = 0; i < 40; i++) { const x = -27 + sr() * 54, z = -17 + sr() * 34; k.S(.7 + .4 * sr(), i % 3 ? silver : wm, x, 2.6, z); }
        // more to it. A wider step under the whole house; gold glazing bars up every wall and a rail where the vault springs; a pier at each corner with a light on it
        k.B(70, 1, 50, wm, 0, .5, 0); for (let i = 0; i <= 12; i++) for (const sz of [-1, 1]) k.B(.5, 18, .7, gd, -30 + i * 5, 18, sz * 20.3); for (let i = 0; i <= 8; i++) for (const sx of [-1, 1]) k.B(.7, 18, .5, gd, sx * 30.3, 18, -20 + i * 5);
        for (const sz of [-1, 1]) k.B(60.6, .6, .8, gd, 0, 9.2, sz * 20.3); for (const sx of [-1, 1]) { k.B(.8, .6, 40.6, gd, sx * 30.3, 9.2, 0); k.B(.8, .8, 40.6, gd, sx * 30.3, 27, 0); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.B(2.6, 25, 2.6, wm, sx * 30.3, 14.5, sz * 20.3); k.B(3.4, 1, 3.4, gd, sx * 30.3, 27.5, sz * 20.3); NS(k.S(1.3, litW, sx * 30.3, 29.4, sz * 20.3)); }
        // the two glass ends under the vault, each a fan of gold bars
        for (const sx of [-1, 1]) { NS(M(g, new THREE.CircleGeometry(20, 20, 0, Math.PI), glass, sx * 30.2, 27, 0, { ry: Math.PI / 2 })); for (let i = 1; i < 6; i++) { const a = i * Math.PI / 6; rod(g, gd, [sx * 30.45, 27, 0], [sx * 30.45, 27 + Math.sin(a) * 20, Math.cos(a) * 20], .28, 5); } M(g, new THREE.TorusGeometry(10, .3, 4, 14, Math.PI), gd, sx * 30.45, 27, 0, { ry: Math.PI / 2 }); }
        // a lantern on the ridge with a light in it, finials along the ridge
        k.C(5, 5, .7, 8, gd, 0, 47.8, 0); NS(k.C(4.4, 4.4, 5, 8, glass, 0, 50.6, 0)); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; k.B(.4, 5, .4, gd, Math.cos(a) * 4.5, 50.6, Math.sin(a) * 4.5); } k.K(5.4, 5, 8, gd, 0, 55.6, 0); NS(k.S(.9, litW, 0, 58.7, 0)); for (const x of [-25, -12.5, 12.5, 25]) k.K(.7, 3.2, 6, gd, x, 49, 0);
        // the door in the south wall: gold posts, lintel and pediment, steps down, an urn of silver either side
        for (const sx of [-1, 1]) { k.B(.9, 14, 1.2, gd, sx * 4.4, 9, 20.7); k.C(1.8, 1.2, 3.2, 10, wm, sx * 8.4, 3.6, 24); k.S(1.7, silver, sx * 8.4, 6, 24, { sy: .7 }); } k.B(9.8, 1, 1.4, gd, 0, 16.4, 20.7); M(g, gable(11, 3.4, 1.6), gd, 0, 16.9, 20.7); k.B(16, 1, 5, wm, 0, 1.5, 24.5); k.B(20, 1, 4, wm, 0, .5, 28.5);
        // inside: marble walks crossing, a gold rim and a jet to the pool, four beds of silver flowers on their stems, two benches, and more limbs and mirror leaves to the tree
        k.B(56, .2, 4, wm, 0, 2.1, 0); k.B(4, .2, 36, wm, 0, 2.1, 0); k.T(9.3, .6, gd, 12, 2.5, 0, { rx: Math.PI / 2 }); k.C(.5, .8, 5, 8, silver, 12, 4.8, 0); NS(k.S(.9, litW, 12, 7.7, 0)); for (const sz of [-1, 1]) k.B(7, 1.1, 2.2, wm, 12, 2.9, sz * 13);
        { const soil = solid(0x2a2622, 1); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const bx = sx * 19 - 1, bz = sz * 12; if (sx > 0) continue; k.B(16, .8, 9, soil, bx, 2.4, bz); for (let i = 0; i < 12; i++) { const x = bx - 7 + sr() * 14, z = bz - 3.6 + sr() * 7.2, hh = 2 + sr() * 1.6; k.C(.09, .09, hh, 4, silver, x, 2.8 + hh / 2, z); M(g, new THREE.OctahedronGeometry(.75, 0), i % 3 ? silver : mirror, x, 3 + hh, z, { sy: .6, ry: sr() * 3 }); } }
          for (const sz of [-1, 1]) { k.B(13, .8, 6, soil, 23, 2.4, sz * 15.5); for (let i = 0; i < 9; i++) { const x = 17.5 + sr() * 11, z = sz * 15.5 - 2.4 + sr() * 4.8, hh = 2 + sr() * 1.6; k.C(.09, .09, hh, 4, silver, x, 2.8 + hh / 2, z); M(g, new THREE.OctahedronGeometry(.75, 0), i % 3 ? silver : mirror, x, 3 + hh, z, { sy: .6, ry: sr() * 3 }); } } }
        for (let i = 0; i < 5; i++) { const a = i * 1.257 + .3, ex = -10 + Math.cos(a) * 7, ez = Math.sin(a) * 7; rod(g, silver, [-10, 13 + i, 0], [ex, 21 + (i % 2) * 2, ez], .55, 5); for (let j = 0; j < 5; j++) M(g, new THREE.OctahedronGeometry(1.7, 0), mirror, ex + (sr() - .5) * 5, 17 + sr() * 7, ez + (sr() - .5) * 5, { sy: .32, rx: sr() * 1.2, rz: sr() * 1.2 }); }
        for (const sz of [-1, 1]) for (let i = 0; i < 6; i++) { const x = -27.5 + i * 11; if (sz > 0 && Math.abs(x) < 9) continue; k.C(1.5, 1, 2.6, 8, wm, x, 2.3, sz * 23.4); k.C(.25, .25, 3, 5, silver, x, 5, sz * 23.4); M(g, new THREE.IcosahedronGeometry(1.9, 0), silver, x, 7.6, sz * 23.4); M(g, new THREE.IcosahedronGeometry(1.2, 0), mirror, x, 10.2, sz * 23.4); }   // silver topiary in urns along both long sides
        for (const sx of [-1, 1]) { k.B(.4, 1.6, 48, gd, sx * 34.4, 1.9, 0); for (let i = 0; i < 7; i++) k.B(.5, 2.2, .5, gd, sx * 34.4, 2.1, -24 + i * 8); } for (const sz of [-1, 1]) for (const sx of [-1, 1]) k.B(22, .4, .4, gd, sx * 23.2, 2.7, sz * 24.6);                                                         // a low gilded rail round the terrace
        k.C(.14, .14, 4, 5, gd, 0, 60.6, 0); k.B(3.4, .16, .16, gd, 0, 61.6, 0); k.K(.5, 1.4, 4, gd, 1.9, 61.6, 0, { rz: -Math.PI / 2 }); k.B(.16, .16, 2.4, gd, 0, 60.4, 0);                                                                                                                              // a weathervane on the lantern
      }, { y: GY, ry: .3, hexes: [[32, 14]], top: 64, view: 420 }); }

    // Clause Net Driftways (32,16): white streets and a bridge between the houses, all hung with drifting threads of vellum, and brightly lit
    { const c = hexW(32, 16);
      addThing('Clause Net Driftways', '🕸️', c, 1, 30, g => { const k = kit(g); k.B(104, .6, 12, wm, 0, .3, 0);
        for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) house(g, -40 + i * 20, 0, sd * 17, 0, 15, 14, 20 + 20 * sr(), wm, roofG, litW, i === 2);
        k.B(10, 2, 40, wm, 10, 22, 0); M(g, new THREE.TorusGeometry(6, 1.4, 5, 12, Math.PI), wm, 10, 15.5, 0, { ry: Math.PI / 2 }); for (const sd of [-1, 1]) k.B(10, 3, 1, gd, 10, 24, sd * 5);                           // a bridge from roof to roof across the street
        // more to it. Gold kerbs and lamps down the street, a gilded awning over every door, two more bridges overhead
        for (const sd of [-1, 1]) { k.B(104, .5, .8, gd, 0, .55, sd * 6.2); for (let i = 0; i < 6; i++) { const x = -50 + i * 20; k.C(.35, .5, 9, 6, gd, x, 4.5, sd * 7.6); NS(k.S(1.1, litW, x, 9.7, sd * 7.6)); } for (let i = 0; i < 5; i++) k.B(5.4, .4, 2.6, gd, -40 + i * 20, 6.2, sd * 9, { rx: sd * .32 }); }
        k.B(8, 1.6, 40, wm, -30, 16.4, 0); M(g, new THREE.TorusGeometry(5, 1.1, 5, 12, Math.PI), wm, -30, 10.6, 0, { ry: Math.PI / 2 }); k.B(6, 1.2, 40, wm, 31, 28, 0); for (const sd of [-1, 1]) { k.B(8, 2.4, .8, gd, -30, 18.2, sd * 4); k.B(6, 2.2, .7, gd, 31, 29.6, sd * 3); }
        // and what the place is named for: lines strung from house to house across the street, a row of written vellum sheets pegged along each, and loose sheets drifting above
        { const vel = new THREE.MeshStandardMaterial({ map: canvasTex(64, 96, (cx, w, hh) => { cx.fillStyle = '#f6f0dc'; cx.fillRect(0, 0, w, hh); cx.fillStyle = '#3a3340'; for (let j = 0; j < 11; j++) cx.fillRect(7, 9 + j * 7.4, 30 + ((j * 37) % 20), 1.6); }), roughness: .9, side: THREE.DoubleSide });
          for (let i = 0; i < 8; i++) { const x = -45 + i * 12.6, y = 12.5 + (i % 3) * 4.5; rod(g, gd, [x, y, -10.2], [x, y, 10.2], .12, 4); for (let j = 0; j < 5; j++) NS(M(g, new THREE.PlaneGeometry(2.6, 4.2), vel, x, y - 2.3, -8 + j * 4, { ry: Math.PI / 2 + (sr() - .5) * .6, rz: (sr() - .5) * .16 })); }
          for (let i = 0; i < 9; i++) { const m = NS(M(g, new THREE.PlaneGeometry(2.8, 4.4), vel, -44 + i * 11 + sr() * 4, 0, (sr() - .5) * 9, { rx: -1.1 })), y0 = 24 + sr() * 16, ph = sr() * 6.283; m.userData.keepSep = 1; anim.push(t => { m.position.y = y0 + 2.4 * Math.sin(t * .45 + ph); m.rotation.y = .6 * Math.sin(t * .31 + ph); m.rotation.z = .35 * Math.sin(t * .52 + ph * 2); }); } }
        for (const sx of [-1, 1]) { k.C(1.7, 2, 8, 8, wm, sx * 55, 4, 0); k.C(2.3, 2.3, .7, 8, gd, sx * 55, 8.3, 0); NS(k.S(1.4, litW, sx * 55, 10, 0)); }   // a lit pillar at each end of the street
      }, { y: GY, ry: -.4, hexes: [[32, 16]], top: 60, view: 420 });
      rndWebs(c, 56, 80, GY + 9, GY + 44, 0xf4f1e6, .45, 63); walkers([c[0] - 46, c[1] + 18], [c[0] + 46, c[1] - 18], 12, [2.6, 2.4, 2], 6, GY + 4, 64);
      for (let i = 0; i < 6; i++) lanternPts.push([c[0] + Math.cos(i * 1.05) * 30, GY + 20, c[1] + Math.sin(i * 1.05) * 30, { c: [2.6, 2.4, 1.9], size: 9, drift: 2, speed: .4 }]); }

    // ---------------- outside the wall ----------------
    // Strixhaven Star (26,19): the newspaper. A three-storey office in pale stone with a slated roof and dormers, its name in gold across the front over an arcade of lit shop windows; a clock tower on the corner with a gilt cupola and a gold star turning on top;
    // behind it the press hall under a saw-tooth roof of skylights, with its chimney; and at the side a loading dock stacked with bundled papers, reels of newsprint and ink casks, and a cart waiting
    { const c = Wp(STAR2), y0 = 15 * S, K = 1.4, starTop = new THREE.Group();
      const sign = canvasTex(1024, 128, (cx, w, hgt) => { cx.fillStyle = '#16161c'; cx.fillRect(0, 0, w, hgt); cx.strokeStyle = '#d8b25a'; cx.lineWidth = 5; cx.strokeRect(8, 8, w - 16, hgt - 16); cx.fillStyle = '#ffd97a'; cx.font = 'bold 74px Georgia, serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('THE STRIXHAVEN STAR', w / 2, hgt / 2 + 4); });
      addThing('Strixhaven Star', '⭐', c, K, 30, g => { const k = kit(g), win = wallMat(8, 3, '#e9e6dc', '#20222a', '#ffdf9a', .5), brick = wallMat(7, 1, '#5a4038', '#1a1616', '#ffb060', .8), slate = solid(0x33343e, .5, { flatShading: true }), paper = solid(0xf2efe4, .9), star = glowM(0xffd86a, 2.6), signM = new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: .9, roughness: .5 }), glassL = glowM(0xffe2a8, 1.6);
        k.B(48, 1.2, 40, wm, 0, .6, 0); for (let i = 0; i < 3; i++) k.B(14 - i * 1.6, .5, 1.6, wm, -2, 1 - i * .4, 20.6 + i * 1.5);
        // the office
        k.B(30, 26, 18, win, -2, 14.2, 3); k.B(31.4, 1.2, 19.4, wm, -2, 9.8, 3); k.B(31.4, 1.4, 19.4, gd, -2, 27.6, 3); M(g, gable(20.4, 7, 31.4), slate, -2, 28.2, 3, { ry: Math.PI / 2 }); k.B(31.6, .6, .8, gd, -2, 35.2, 3);
        for (const x of [-11, -2, 7]) { k.B(4, 3.6, 3.6, wm, x, 30.6, 10.4); M(g, gable(4.8, 2.2, 4.2), slate, x, 32.4, 10.4); NS(k.B(2.2, 2.4, .3, glassL, x, 30.6, 12.3)); }                                                                  // dormers
        for (let i = 0; i < 6; i++) { const x = -15.5 + i * 5.4; k.B(1.5, 8.6, 1.5, wm, x, 5.5, 12.6); if (i < 5) { M(g, new THREE.TorusGeometry(2.1, .5, 5, 10, Math.PI), wm, x + 2.7, 7.6, 12.6); if (i !== 2) NS(k.B(3.6, 5.6, .3, glassL, x + 2.7, 4.4, 12.1)); } }             // the arcade
        k.B(4, 7, .5, bm, -2, 4.7, 12.2); NS(M(g, starGeo(2.6, 1.1, .6), star, -2, 11.4, 13.4)); NS(k.B(26, 3.2, .5, signM, -2, 19.6, 12.3)); k.B(27, .5, .9, gd, -2, 21.5, 12.3); k.B(27, .5, .9, gd, -2, 17.7, 12.3);                                              // the door, the star over it, and the name
        // the clock tower on the corner
        k.B(10, 42, 10, wm, 16.5, 21.6, 8); k.B(11.4, 1.4, 11.4, gd, 16.5, 31, 8); for (const [dx, dz, ry] of [[0, 5.1, 0], [5.1, 0, Math.PI / 2], [0, -5.1, Math.PI], [-5.1, 0, -Math.PI / 2]]) { NS(M(g, new THREE.CircleGeometry(3.2, 24), glassL, 16.5 + dx, 37, 8 + dz, { ry })); M(g, new THREE.TorusGeometry(3.4, .4, 5, 24), gd, 16.5 + dx, 37, 8 + dz, { ry }); k.B(.4, 2.6, .3, bm, 16.5 + dx * 1.03, 38, 8 + dz * 1.03, { ry }); k.B(1.9, .4, .3, bm, 16.5 + dx * 1.03 + (ry % Math.PI ? 0 : .8), 37, 8 + dz * 1.03 + (ry % Math.PI ? .8 : 0), { ry }); NS(k.B(1.6, 6, .3, glassL, 16.5 + dx, 12 + 8, 8 + dz, { ry })); }
        k.B(11.6, 1.4, 11.6, gd, 16.5, 43.2, 8); for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.C(.7, .7, 7, 8, wm, 16.5 + sx * 4, 47.4, 8 + sz * 4); k.B(10.4, 1, 10.4, wm, 16.5, 51.4, 8); k.D(5.4, gd, 16.5, 51.8, 8, { sy: 1.1 }); k.C(.3, .3, 6, 6, gd, 16.5, 60.6, 8); NS(k.S(1, glassL, 16.5, 47.6, 8));
        M(starTop, starGeo(3.4, 1.4, .8), star, 0, 0, -.4); starTop.position.set(16.5, 66, 8); starTop.traverse(m => { m.userData.noShadow = true; }); g.add(starTop); spin.push({ o: starTop, speed: .8, bolt: false });
        // the press hall, and its chimney
        k.B(26, 13, 18, brick, -9, 7.7, -14); for (let i = 0; i < 4; i++) { M(g, gable(6.5, 4.4, 18), slate, -18.75 + i * 6.5, 14.2, -14, { sx: 1 }); NS(k.B(.3, 3, 16, glassL, -18.75 + i * 6.5 + 1.75, 16.2, -14, { rz: .98 })); } k.C(1.9, 2.6, 34, 10, brick, 7.4, 18.2, -17); k.C(2.5, 2.5, 1.4, 10, gd, 7.4, 33, -17); k.C(2.2, 2.2, 1, 10, bm, 7.4, 35.4, -17);
        k.B(7, 9, .5, bm, -9, 5.7, -4.8); for (const x of [-18, 0]) NS(k.B(5, 5, .4, glowM(0xffb060, 1.4), x, 7, -4.9));
        // the loading dock at the side: papers in bundles, reels of newsprint, ink, a cart
        k.B(12, 2.4, 16, wm, -23.6, 1.8, 4); for (let i = 0; i < 9; i++) { const x = -27 + (i % 3) * 3.2, z = -1 + Math.floor(i / 3) * 3.4, n = 1 + (i * 7) % 3; for (let q = 0; q < n; q++) { k.B(2.6, 1.3, 2, paper, x, 3.7 + q * 1.35, z, { ry: (i + q) * .2 }); k.B(2.7, .2, .3, bm, x, 4.4 + q * 1.35, z, { ry: (i + q) * .2 }); } }
        for (let i = 0; i < 3; i++) k.C(2, 2, 4.4, 14, paper, -21 - i * 4.3, 5, 9.6, { rz: Math.PI / 2 }); k.C(2, 2, 4.4, 14, paper, -23.2, 8.6, 9.6, { rz: Math.PI / 2 }); for (let i = 0; i < 3; i++) { k.C(1.5, 1.3, 3.4, 10, bm, -19.4, 4.7, -1 + i * 3.4); k.T(1.5, .14, gd, -19.4, 5.2, -1 + i * 3.4, { rx: Math.PI / 2 }); }
        k.B(9, .7, 5.4, solid(0x5a3d28, .85), -25, 3, 17.6); k.B(9, 2.2, .5, solid(0x5a3d28, .85), -25, 4.4, 15); k.B(9, 2.2, .5, solid(0x5a3d28, .85), -25, 4.4, 20.2); for (const sx of [-1, 1]) for (const sz of [-1, 1]) M(g, new THREE.TorusGeometry(1.7, .35, 5, 14), bm, -25 + sx * 2.8, 2.2, 17.6 + sz * 3, {}); for (let i = 0; i < 4; i++) k.B(2.4, 1.2, 1.9, paper, -27.4 + i * 1.7, 4 + (i % 2) * 1.2, 17.6, { ry: i * .3 }); rod(g, solid(0x5a3d28, .85), [-20.4, 3, 16.4], [-14, 2, 15.6], .25, 4); rod(g, solid(0x5a3d28, .85), [-20.4, 3, 18.8], [-14, 2, 19.6], .25, 4);
        // out front: lamps, a notice board with the day's pages pinned up, a flag
        for (const x of [-13, 9]) { k.C(.35, .5, 9, 6, bm, x, 5.6, 17); k.B(1.6, 2, 1.6, bm, x, 10.6, 17); NS(k.S(.9, glassL, x, 10.6, 17)); } k.B(.5, 6, .5, bm, 6, 4, 19.4); k.B(.5, 6, .5, bm, 12, 4, 19.4); k.B(7, 4.4, .4, solid(0x5a3d28, .85), 9, 5.4, 19.4); for (let i = 0; i < 6; i++) k.B(1.5, 1.9, .1, paper, 6.8 + (i % 3) * 2.1, 4.5 + Math.floor(i / 3) * 2, 19.7, { rz: (i % 2 ? .08 : -.06) });
        rod(g, gd, [-16.6, 27, 11.8], [-19.6, 37, 13.4], .2, 5); k.B(.2, 4.4, 6, solid(0x4a1460, .8, { side: THREE.DoubleSide }), -19.4, 33.4, 16.4, { rz: -.28, ry: .25 });
      }, { y: y0, hexes: [[26, 19]], top: 72, view: 420 }); chimneys.push([c[0] + 7.4 * K, y0 + 37 * K, c[1] - 17 * K]);
      for (const x of [-13, 9]) lanternPts.push([c[0] + x * K, y0 + 10.8 * K, c[1] + 17 * K, { c: [2.6, 2, 1.2], size: 8, drift: .1, speed: .5 }]); lanternPts.push([c[0] + 16.5 * K, y0 + 66 * K, c[1] + 8 * K, { c: [2.8, 2.2, .8], size: 16, drift: .1, speed: .6 }]); }

    // Arbitration Steps (three hexes): outside the city, where devils do their business - ten tiers of black marble with a white stair up the front, horned figures down both sides of it, red fire burning on the tiers, and a canopied seat under a crescent at the top
    { const HX = [[26, 21], [26, 22], [27, 21]], c = Wp(ARBIT), y0 = 16 * S, ry0 = 2.62, dev = solid(0x2a0a0c, .4), fires = [];
      addThing('Arbitration Steps', '⚖️', c, 1, 30, g => { const k = kit(g), bm2 = solid(0x1c1c22, .25);
        for (let i = 0; i < 10; i++) M(g, new THREE.CylinderGeometry(92 - i * 7.4, 96 - i * 7.4, 6.4, 8), i % 2 ? bm : bm2, 0, 3.2 + i * 6.4, 0, { ry: .3927 });
        for (let i = 0; i < 22; i++) k.B(26, 1.6, 4.6, wm, 0, 1.4 + i * 2.9, 96 - i * 3.3);
        for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { const z = 86 - i * 14.6, y = 4 + (96 - z) / 3.3 * 2.9; k.B(6, 5, 6, bm2, sd * 18, y, z); statue(g, dev, sd * 18, y + 2.5, z, 15, -Math.PI / 2, 3); for (const hx of [-1, 1]) M(g, new THREE.ConeGeometry(.7, 4, 5), dev, sd * 18 + hx * 1.4, y + 18.6, z, { rz: -hx * .5 }); }   // horned figures flanking the stair
        for (let j = 0; j < 3; j++) for (let i = 0; i < 8; i++) { const a = i * .785 + .39, Rr = 88 - (1 + j * 3) * 7.4, y = 6.4 * (2 + j * 3); if (Math.abs(Math.sin(a)) > .9 && Math.cos(a) < .5 && Math.sin(a) > 0) continue; k.C(2.4, 3.2, 6, 8, bm2, Math.cos(a) * Rr, y + 3, Math.sin(a) * Rr); NS(k.S(2.4, litR, Math.cos(a) * Rr, y + 7.4, Math.sin(a) * Rr)); fires.push([Math.cos(a) * Rr, y + 8, Math.sin(a) * Rr]); }
        k.C(22, 24, 3, 8, wm, 0, 65.5, 0, { ry: .3927 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.C(1.6, 1.9, 22, 8, bm, sx * 13, 78, sz * 13); k.B(32, 2.6, 32, bm, 0, 90.3, 0); M(g, new THREE.TorusGeometry(9, 1.4, 6, 22, 4.4), gd, 0, 103, 0, { rz: -.65 });
        k.B(9, 16, 7, bm, 0, 75, -6); k.B(12, 3, 9, bm2, 0, 68.5, -4); NS(k.S(2.6, litR, 0, 86, 0)); for (let i = 0; i < 6; i++) k.B(4, 2.4, 3, wm, -30 + i * 12, 34, 54, { ry: .2 * i });                                                             // the seat of judgement, and desks where the contracts are signed
      }, { y: y0, ry: ry0, hexes: HX, top: 130, view: 680 });
      fires.forEach((p, i) => { if (i % 2 === 0) { const cs = Math.cos(ry0), sn = Math.sin(ry0); lanternPts.push([c[0] + p[0] * cs + p[2] * sn, y0 + p[1], c[1] - p[0] * sn + p[2] * cs, { c: [2.8, .5, .2], size: 12, drift: .8, speed: 1.6 }]); } }); }

    // Sealwright Foundry (30,19): a massive black works, four stacks smoking, red banners down its front and above the doors a red wax seal the height of three storeys
    { const c = Wp(SEALW), y0 = 16 * S;
      addThing('Sealwright Foundry', '🔴', c, 1, 30, g => { const k = kit(g), wax = new THREE.MeshStandardMaterial({ color: 0xa01812, roughness: .22, emissive: 0x4a0806, emissiveIntensity: .7 }), cloth = solid(0x8a1410, .8);
        k.B(92, 44, 50, bm, 0, 22, -6); M(g, gable(54, 20, 94), roofD, 0, 44, -6, { ry: Math.PI / 2 }); k.B(36, 22, 18, bm, 0, 11, 26); M(g, gable(38, 9, 19), roofD, 0, 22, 26);
        for (const [x, z, hh] of [[-34, -20, 82], [-12, -24, 92], [12, -24, 88], [34, -20, 78]]) { k.C(3.4, 5.2, hh, 8, bm, x, hh / 2, z); k.C(4.4, 4.4, 2.4, 8, gd, x, hh - 5, z); chimneys.push([c[0] + x, y0 + hh + 4, c[1] + z]); }
        M(g, new THREE.CylinderGeometry(15, 15, 3, 36), wax, 0, 46, 19.6, { rx: Math.PI / 2 }); k.T(11.6, 1.2, wax, 0, 46, 21.2); k.B(1.4, 16, 1, gd, 0, 46, 21.6, { rz: .6 }); k.S(2, gd, -4.4, 52.4, 21.4, { sz: .5 });                                                    // the seal, with a gilt quill pressed into it
        for (const sx of [-1, 1]) for (const xx of [26, 38]) { k.B(7, 28, .6, cloth, sx * xx, 26, 19.6); k.B(7, 1.4, .8, gd, sx * xx, 40.4, 19.7); } NS(k.B(14, 15, .5, glowM(0xff8a2a, 2.6), 0, 7.5, 35.2));
        for (let i = 0; i < 5; i++) { k.B(8, 6, 8, bm, -54 + i * 4, 3, 30 + i * 9, { ry: i * .4 }); k.C(3, 3, 1.4, 16, wax, -54 + i * 4, 6.7, 30 + i * 9); }                                                                                             // seal presses and fresh seals in the yard
      }, { y: y0, hexes: [[31, 19]], top: 110, view: 520 });
      lanternPts.push([c[0], y0 + 8, c[1] + 37, { c: [2.6, 1.1, .3], size: 18, drift: .2, speed: .9 }]); }

    // Meterworks Stage (34,16): an open-air stage outside the city - a glowing glass-tiled runway thrust out among the seats, a gilded arch behind it carrying a winged emblem, purple and gold lamps
    { const c = Wp(METER), y0 = 14 * S, tiles = canvasTex(128, 512, (cx, w, hgt) => { const r = mulberry32(44); for (let j = 0; j < 16; j++) for (let i = 0; i < 4; i++) { cx.fillStyle = r() < .5 ? '#b070ff' : r() < .6 ? '#ffd070' : '#5a3a90'; cx.fillRect(i * 32 + 2, j * 32 + 2, 28, 28); } });
      addThing('Meterworks Stage', '🎼', c, 1, 30, g => { const k = kit(g), runM = new THREE.MeshStandardMaterial({ color: 0x1a1024, roughness: .15, emissive: 0xffffff, emissiveMap: tiles, emissiveIntensity: 1.5 });
        k.C(48, 50, 2, 32, bm, 0, 1, 0); k.B(48, 5, 22, wm, 0, 4.5, -22); k.B(13, 5, 46, bm, 0, 4.5, 10); NS(k.B(10.6, .5, 44, runM, 0, 7.2, 10));
        for (const sd of [-1, 1]) { k.B(5, 36, 5, bm, sd * 21, 20, -31); k.B(7, 2, 7, gd, sd * 21, 38.6, -31); for (let i = 0; i < 6; i++) k.B(15 - i * 1.4, .6, 3.4, wm, sd * (9 + i * 2.2), 56 + i * 1.6, -31, { rz: sd * (.5 + i * .09) }); }                           // pillars, and the wings of the emblem
        M(g, new THREE.TorusGeometry(21, 2.4, 6, 22, Math.PI), gd, 0, 38, -31); k.C(4.6, 4.6, 1.4, 20, gd, 0, 58, -31, { rx: Math.PI / 2 }); k.B(44, 26, 1.4, solid(0x3a1050, .6), 0, 20, -33);
        for (let j = 0; j < 4; j++) M(g, new THREE.TorusGeometry(30 + j * 5.6, 2.2, 5, 26, Math.PI), j % 2 ? wm : bm, 0, 2.4 + j * 2.2, 12, { rx: Math.PI / 2 });                                                                                          // seats curving round the runway
        for (let i = 0; i < 8; i++) { const a = i * .45 - .25, col = i % 2 ? litP : litW; k.C(.5, .7, 13, 6, bm, Math.cos(a) * 46, 8, 12 + Math.sin(a) * 46); NS(k.S(1.4, col, Math.cos(a) * 46, 15, 12 + Math.sin(a) * 46)); }
      }, { y: y0, hexes: [[34, 17]], top: 84, view: 440 });
      lanternPts.push([c[0], y0 + 12, c[1], { c: [1.8, .8, 2.6], size: 26, drift: .2, speed: .6 }]); }

    // Ashgrave Mannor (three hexes): a devil's house - black, many-towered, every roof horned, sick green light in the windows, gargoyles down the drive, iron railings round the grounds and a storm that never leaves it
    { const HX = [[28, 21], [28, 22], [29, 21]], c = Wp(ASHG), y0 = 15 * S, tips = [];
      addThing('Ashgrave Mannor', '🏚️', c, 1, 30, g => { const k = kit(g), win = wallMat(9, 3, '#101014', '#060608', '#c8ff70', .3), iron = solid(0x0a0a0c, .4, { metalness: .6 });
        k.B(66, 38, 34, win, 0, 19, 10); M(g, gable(38, 18, 68), roofD, 0, 38, 10, { ry: Math.PI / 2 }); for (const sx of [-1, 1]) { k.B(28, 30, 30, win, sx * 46, 15, -4); M(g, gable(30, 13, 32), roofD, sx * 46, 30, -4); }
        for (const [x, z, hh] of [[-22, 10, 80], [22, 10, 80], [0, 24, 100], [-58, -10, 58], [58, -10, 58]]) { k.B(11, hh, 11, bm, x, hh / 2, z); M(g, new THREE.ConeGeometry(8, 26, 4), roofD, x, hh + 13, z, { ry: Math.PI / 4 }); for (const sd of [-1, 1]) M(g, new THREE.ConeGeometry(1.4, 13, 5), roofD, x + sd * 6.5, hh + 20, z, { rz: -sd * .6 }); NS(k.B(.5, 8, 3, glowM(0xc8ff70, 2.2), x, hh - 8, z - 5.7, { ry: Math.PI / 2 })); tips.push([x, hh + 26, z]); }
        k.B(12, 16, 2, bm, 0, 8, -7.6); for (let i = 0; i < 4; i++) k.B(18 - i * 1.5, 1, 3, bm, 0, .5 + i, -16 + i * 2.4);
        for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const z = -26 - i * 16; k.B(5, 6, 5, bm, sx * 11, 3, z); M(g, new THREE.SphereGeometry(2.8, 8, 6), bm, sx * 11, 8, z, { sx: 1.2 }); for (const w of [-1, 1]) M(g, new THREE.ConeGeometry(1.6, 6, 3), bm, sx * 11 + w * 2.6, 11, z + 1, { rz: -w * .7 }); }                 // gargoyles down the drive
        for (let i = 0; i < 62; i++) { const t = i / 62, px = t < .25 ? -80 + t * 4 * 160 : t < .5 ? 80 : t < .75 ? 80 - (t - .5) * 4 * 160 : -80, pz = t < .25 ? -92 : t < .5 ? -92 + (t - .25) * 4 * 142 : t < .75 ? 50 : 50 - (t - .75) * 4 * 142; if (Math.abs(px) < 9 && pz < -90) continue; k.B(.7, 9, .7, iron, px, 4.5, pz); }
        for (const [x, z, w, d] of [[0, -92, 160, .5], [0, 50, 160, .5], [-80, -21, .5, 142], [80, -21, .5, 142]]) k.B(w, .5, d, iron, x, 7, z); for (const sx of [-1, 1]) { k.B(3, 13, 3, bm, sx * 9, 6.5, -92); M(g, new THREE.ConeGeometry(2.2, 5, 4), roofD, sx * 9, 15.5, -92, { ry: .785 }); }
      }, { y: y0, ry: Math.PI, hexes: HX, top: 140, view: 620 });
      lightning(tips.map(p => [c[0] - p[0], y0 + p[1], c[1] - p[2]]), 6.5, 2.4, 300);
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.6, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
      const ct = new THREE.CanvasTexture(cv); for (let i = 0; i < 14; i++) { const a = i * 2.39996, d = 16 + (i * 37) % 120, spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, color: i % 3 ? 0x4e525e : 0x646a78, transparent: true, opacity: .38, depthWrite: false, fog: false })); spr.position.set(c[0] + Math.cos(a) * d, y0 + 400 + (i % 4) * 18, c[1] + Math.sin(a) * d * .8); spr.scale.set(200 + (i % 5) * 34, 100 + (i % 3) * 26, 1); scene.add(spr); } }

    // Clarentine's House (24,16): a small stone cottage with a steep slate roof, out on its own in a garden of flowers behind a white fence
    { const c = Wp(CLAR), y0 = 15 * S;
      addThing("Clarentine's House", '🏡', c, 1, 30, g => { const k = kit(g), wl = solid(0xd8d2c4, .8), rf = solid(0x4a3a5e, .6, { flatShading: true }), fl = [solid(0xe86a8a, .8), solid(0xf2d05a, .8), solid(0xb07af0, .8)], wd = solid(0x5a3d28, .85);
        k.B(16, 9, 12, wl, 0, 4.5, 0); M(g, gable(18, 12, 14), rf, 0, 9, 0); M(g, new THREE.ConeGeometry(2.4, 9, 6), rf, 5, 21, 0); k.C(1.1, 1.3, 8, 6, wl, -4.5, 16, -2); k.B(3.2, 5.6, .4, wd, 0, 2.8, 6.1); for (const sx of [-1, 1]) NS(k.B(2.6, 2.8, .3, litW, sx * 5, 5, 6.1));
        for (let i = 0; i < 44; i++) { const a = sr() * 6.283, r = 9 + sr() * 12, x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r; if (Math.abs(x) < 9 && Math.abs(z) < 7) continue; M(g, new THREE.SphereGeometry(.7 + .5 * sr(), 6, 5), fl[i % 3], x, .9, z); }
        for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283; if (Math.abs(a - 1.571) < .14) continue; k.B(.5, 3, .5, wm, Math.cos(a) * 26, 1.5, Math.sin(a) * 22); } for (let i = 0; i < 6; i++) k.C(1.3, 1.3, .3, 8, wl, Math.sin(i * .8) * 2.4, .2, 8 + i * 2.6);
        for (const sx of [-1, 1]) { k.C(.3, .4, 6, 6, wd, sx * 4, 3, 21); NS(k.S(.8, litW, sx * 4, 6.4, 21)); }
      }, { y: y0, ry: .6, hexes: [[24, 16]], top: 30, view: 260 }); chimneys.push([c[0] - 4, y0 + 22, c[1] - 4]); }

    // Ewfall Guardens (three hexes): a formal garden - four rings of clipped hedge on white gravel, cut by two crossing walks, dark topiary cones at every opening, flower borders, statues on the walks and a fountain at the middle
    { const HX = [[25, 17], [24, 17], [25, 16]], c = Wp(EWF), y0 = 15 * S;
      addThing('Ewfall Guardens', '🌳', c, 1, 30, g => { const k = kit(g), hg = solid(0x16381f, 1, { flatShading: true }), gravel = solid(0xe6e0d0, .95), fl = [solid(0xe86a8a, .8), solid(0xf2f0e6, .8), solid(0xb07af0, .8)];
        k.C(94, 94, .6, 56, gravel, 0, .3, 0);
        for (let j = 0; j < 4; j++) { const Rr = 24 + j * 20, n = Math.round(Rr * 6.283 / 8); for (let i = 0; i < n; i++) { const a = i / n * 6.283, da = Math.abs(((a + .785) % 1.5708) - .785); if (da < 7 / Rr) continue; k.B(3, 4.6, Rr * 6.283 / n + .5, hg, Math.cos(a) * Rr, 2.6, Math.sin(a) * Rr, { ry: -a }); if (i % 3 === 0) M(g, new THREE.SphereGeometry(.9, 6, 5), fl[(i + j) % 3], Math.cos(a) * (Rr - 3.4), 1, Math.sin(a) * (Rr - 3.4)); }
          for (let q = 0; q < 4; q++) for (const sd of [-1, 1]) { const a = q * 1.5708 + sd * 10.5 / Rr; M(g, new THREE.ConeGeometry(2.6, 10, 6), hg, Math.cos(a) * Rr, 5.4, Math.sin(a) * Rr); } }
        k.C(12, 13, 2.4, 20, wm, 0, 1.2, 0); NS(k.C(10.6, 10.6, .4, 20, waterGlass(0x8fd0e8, .8), 0, 2.5, 0)); k.C(1.6, 2.4, 9, 8, wm, 0, 6, 0); k.C(5, 2, 1.4, 12, wm, 0, 11, 0); NS(k.K(1.2, 8, 8, waterGlass(0xd8f2ff, .5), 0, 15.6, 0));
        for (let q = 0; q < 4; q++) { const a = q * 1.5708; k.B(5, 4, 5, wm, Math.cos(a) * 54, 2, Math.sin(a) * 54); statue(g, wm, Math.cos(a) * 54, 4, Math.sin(a) * 54, 13, Math.PI - a, q); }
      }, { y: y0, hexes: HX, top: 40, view: 560 }); }

    // ---------------- the ink quarter, north of the wall ----------------
    // Inkling Hatchery Vats (three hexes): shown without its roof and with the front of its wall cut low, so that you look in. A round hall, buttressed and lit with violet slits; a gallery running round inside the wall;
    // sixteen vats of warm, moving black ink with pale cocoons at their rims and more hung on hoops above them; a brass alembic over the middle vat feeding the rest through pipes; steam rising; and inklings hopping from vat to vat
    { const HX = [[31, 7], [32, 7], [32, 6]], c = Wp(HATCH), y0 = 16 * S, vats = [[0, 0]], blobs = [], pups = []; for (let i = 0; i < 6; i++) vats.push([Math.cos(i * 1.047) * 34, Math.sin(i * 1.047) * 34]); for (let i = 0; i < 9; i++) vats.push([Math.cos(i * .698 + .3) * 62, Math.sin(i * .698 + .3) * 62]);
      addThing('Inkling Hatchery Vats', '🥚', c, 1, 30, g => { const k = kit(g), cocoon = solid(0xe6e2d6, .6), brass = new THREE.MeshStandardMaterial({ color: 0xb8923c, roughness: .3, metalness: .8 }), wallM = solid(0x26262e, .3, { side: THREE.DoubleSide }), TS = Math.PI / 3, TL = Math.PI * 4 / 3;
        k.C(88, 88, .6, 48, solid(0x1a1a20, .5), 0, .3, 0); for (const r of [22, 48, 76]) k.T(r, .3, gd, 0, .7, 0, { rx: Math.PI / 2 });
        M(g, new THREE.CylinderGeometry(89, 89, 32, 48, 1, true, TS, TL), wallM, 0, 16, 0); M(g, new THREE.CylinderGeometry(89, 89, 7, 24, 1, true, -TS, TS * 2), wallM, 0, 3.5, 0); M(g, new THREE.TorusGeometry(89, 1.2, 5, 48, TL), wm, 0, 32, 0, { rx: Math.PI / 2, rz: Math.PI * 5 / 6 }); M(g, new THREE.TorusGeometry(89, 1, 5, 24, TS * 2), wm, 0, 7, 0, { rx: Math.PI / 2, rz: Math.PI / 6 });   // the wall: full height round the back, low at the front
        for (let i = 0; i <= 12; i++) { const th = TS + TL * i / 12, sn = Math.sin(th), cs = Math.cos(th); k.B(5, 36, 6, bm, sn * 91, 18, cs * 91, { ry: th }); M(g, new THREE.ConeGeometry(3.2, 9, 4), roofD, sn * 91, 40.5, cs * 91, { ry: th + .785 }); if (i < 12) { const tm = th + TL / 24; NS(k.B(3, 11, .5, litP, Math.sin(tm) * 88.3, 21, Math.cos(tm) * 88.3, { ry: tm })); } }     // buttresses with pinnacles, and a lit slit between each pair
        M(g, new THREE.RingGeometry(77, 88.5, 48, 1, -Math.PI / 6, TL), bm, 0, 15, 0, { rx: -Math.PI / 2 }); M(g, new THREE.TorusGeometry(77, .35, 5, 48, TL), gd, 0, 18, 0, { rx: Math.PI / 2, rz: Math.PI * 5 / 6 });
        for (let i = 0; i <= 16; i++) { const th = TS + TL * i / 16, sn = Math.sin(th), cs = Math.cos(th); k.C(.8, 1, 15, 6, wm, sn * 78, 7.5, cs * 78); k.C(.3, .3, 3, 5, gd, sn * 77, 16.5, cs * 77); if (i % 2) { const p = new THREE.Group(); M(p, new THREE.SphereGeometry(1.5, 8, 6), inkM, 0, 1.5, 0, { sy: 1.15 }); for (const sd of [-1, 1]) M(p, new THREE.SphereGeometry(.4, 5, 4), solid(0xffffff, .3), -1.1, 2, sd * .6); p.rotation.y = th + Math.PI / 2; p.position.set(sn * 83, 15, cs * 83); p.traverse(m => { m.userData.noShadow = true; }); g.add(p); pups.push(p); } }   // the gallery: floor, rail, posts - and young inklings watching from it
        for (let i = 0; i < 3; i++) { const a = i * 2.094 + .5; rod(g, brass, [Math.cos(a) * 17, .6, Math.sin(a) * 17], [Math.cos(a) * 5, 30, Math.sin(a) * 5], .9); } k.S(9, brass, 0, 34, 0); k.T(9.2, .5, gd, 0, 34, 0, { rx: Math.PI / 2 }); k.C(3, 5, 6, 12, brass, 0, 44, 0); k.C(1, 1, 8, 8, brass, 0, 50, 0); NS(M(g, new THREE.CylinderGeometry(.7, .7, 21, 8), inkFall, 0, 14.6, 0));   // the alembic, and the ink running out of it
        k.T(46, .7, brass, 0, 1.3, 0, { rx: Math.PI / 2 });
        vats.forEach(([x, z], i) => { const r = i ? 11 : 15, d = Math.hypot(x, z) || 1, a = Math.atan2(z, x); k.C(r, r + 1, 4, 22, i % 2 ? wm : bm, x, 2, z); k.T(r - .3, .45, gd, x, 4.1, z, { rx: Math.PI / 2 }); NS(k.C(r - 1.4, r - 1.4, .5, 22, inkF, x, 4.1, z));
          for (let q = 0; q < 4; q++) { const b = q * 1.7 + i; M(g, new THREE.SphereGeometry(1.5, 8, 6), cocoon, x + Math.cos(b) * (r - 2.6), 4.8, z + Math.sin(b) * (r - 2.6), { sy: 1.7, rz: .3 * Math.cos(b) }); }
          if (i > 0 && i < 7) rod(g, brass, [x * .2, 29, z * .2], [x * .74, 5, z * .74], .6);
          if (i > 6) { rod(g, brass, [x / d * 46, 1.3, z / d * 46], [x / d * 51, 1.3, z / d * 51], .7); k.T(1.7, .3, gd, x / d * 48.5, 3, z / d * 48.5, { rx: Math.PI / 2 }); k.C(.3, .3, 1.8, 5, gd, x / d * 48.5, 2.1, z / d * 48.5);
            M(g, new THREE.TorusGeometry(10, .4, 5, 16, Math.PI), brass, x, 4, z, { ry: -a }); for (const al of [.9, 1.571, 2.24]) { const px = x + Math.cos(a) * 10 * Math.cos(al), pz = z + Math.sin(a) * 10 * Math.cos(al), py = 4 + 10 * Math.sin(al); rod(g, wm, [px, py, pz], [px, py - 2.4, pz], .12, 4); M(g, new THREE.SphereGeometry(1.2, 8, 6), cocoon, px, py - 4, pz, { sy: 1.7 }); } } });   // pipes and valves; cocoons hung on a hoop over each outer vat
        for (let i = 0; i < 8; i++) { const a = i * .785 + .2; k.C(.4, .6, 9, 6, bm, Math.cos(a) * 48, 4.5, Math.sin(a) * 48); NS(k.S(1.1, litP, Math.cos(a) * 48, 9.6, Math.sin(a) * 48)); }
        for (const sd of [-1, 1]) { const th = sd * TS, sn = Math.sin(th), cs = Math.cos(th); k.B(6, 40, 6, bm, sn * 89, 20, cs * 89, { ry: th }); M(g, new THREE.ConeGeometry(4.4, 12, 4), roofD, sn * 89, 46, cs * 89, { ry: th + .785 }); }
        for (let i = 0; i < 10; i++) { const b = new THREE.Group(); M(b, new THREE.SphereGeometry(2.2, 10, 8), inkM, 0, 2, 0, { sy: 1.15 }); for (const sd of [-1, 1]) M(b, new THREE.SphereGeometry(.55, 6, 5), solid(0xffffff, .3), 1.6, 2.8, sd * .9); b.traverse(m => { m.userData.noShadow = true; }); g.add(b); blobs.push(b); }
      }, { y: y0, hexes: HX, top: 60, view: 520 });
      for (const i of [0, 3, 8, 12]) chimneys.push([c[0] + vats[i][0], y0 + 6, c[1] + vats[i][1], 0xd8d8e0]);
      for (let i = 0; i < 6; i++) lanternPts.push([c[0] + Math.cos(i * 1.047 + .5) * 48, y0 + 10, c[1] + Math.sin(i * 1.047 + .5) * 48, { c: [1.5, .6, 2.6], size: 9, drift: .4, speed: .5 }]);
      anim.push(t => { blobs.forEach((b, i) => { const cyc = t * (.22 + .05 * (i % 3)) + i * .37, kk = Math.floor(cyc), f = cyc - kk, A = vats[(kk * 5 + i * 3) % vats.length], B2 = vats[((kk + 1) * 5 + i * 3) % vats.length], e = Math.min(f / .6, 1); b.position.set(lerp(A[0], B2[0], e), 4 + 16 * Math.sin(Math.PI * e), lerp(A[1], B2[1], e)); b.rotation.y = -Math.atan2(B2[1] - A[1], B2[0] - A[0]); b.scale.set(1, 1 - .25 * Math.sin(Math.PI * Math.max(0, (f - .6) / .4)), 1); });
        pups.forEach((p, i) => { p.position.y = 15 + 1.8 * Math.abs(Math.sin(t * (1.6 + .3 * (i % 3)) + i * 1.3)); }); }); }

    // Damatha Inkfountains (five hexes): a great round plaza of white marble on the black, a kerb about it, and on it five tiered fountains playing - black ink in the white ones, white in the black. Each throws one jet high into the air, a ring of jets arching out from its top bowl down into the basin, a second ring from its middle bowl, and a curtain falling from each bowl
    { const HX = [[30, 9], [31, 8], [31, 9], [30, 10], [30, 8]], c = Wp(FOUNT), y0 = 16 * S, whiteInk = solid(0xf4f2ea, .12), jets = []; whiteInk.name = 'inkw';
      addThing('Damatha Inkfountains', '⛲', c, 1, 30, g => { const k = kit(g); k.T(150, 2.4, bm, 0, 1.4, 0, { rx: Math.PI / 2 }); k.T(118, .8, gd, 0, .5, 0, { rx: Math.PI / 2 }); k.T(60, .8, gd, 0, .5, 0, { rx: Math.PI / 2 });
        const fountain = (x, z, sc, dark) => { const A = dark ? bm : wm, I = dark ? whiteInk : inkF; k.C(16 * sc, 17 * sc, 3 * sc, 24, A, x, 1.5 * sc, z); NS(k.C(14.4 * sc, 14.4 * sc, .5, 24, I, x, 3.1 * sc, z)); k.C(2 * sc, 3 * sc, 16 * sc, 10, A, x, 9 * sc, z); k.C(8 * sc, 3 * sc, 2 * sc, 16, A, x, 17 * sc, z); NS(k.C(7 * sc, 7 * sc, .5, 16, I, x, 18.2 * sc, z));
          k.C(1.2 * sc, 1.8 * sc, 9 * sc, 8, A, x, 22 * sc, z); k.C(4 * sc, 1.6 * sc, 1.4 * sc, 12, A, x, 27 * sc, z); k.S(1.1 * sc, gd, x, 28.3 * sc, z); for (let i = 0; i < 12; i++) { const a = i * .5236; k.S(.45 * sc, gd, x + Math.cos(a) * 6.4 * sc, 18.6 * sc, z + Math.sin(a) * 6.4 * sc); } jets.push([x, z, sc, dark]); };
        fountain(0, 0, 1.8, true); for (let i = 0; i < 4; i++) { const a = i * 1.571 + .785; fountain(Math.cos(a) * 92, Math.sin(a) * 92, 1.15, i % 2 === 1); }
        for (let i = 0; i < 16; i++) { const a = i * .3927; k.C(.6, .9, 12, 6, i % 2 ? bm : wm, Math.cos(a) * 138, 6, Math.sin(a) * 138); NS(k.S(1.5, litW, Math.cos(a) * 138, 12.8, Math.sin(a) * 138)); }
      }, { y: y0, hexes: HX, top: 150, view: 680 });
      // the ink itself: drops thrown on ballistic paths and recycled, all worked out in the shader. Each drop has a start, a velocity, a time of flight and a place in the cycle
      for (const white of [true, false]) { const pos = [], vel = [], par = [], G = 46, r = mulberry32(white ? 91 : 92);
        const drop = (x, y, z, vx, vy, vz, yEnd, size) => { const disc = vy * vy + 2 * G * (y - yEnd); if (disc < 0) return; pos.push(c[0] + x, y0 + y, c[1] + z); vel.push(vx, vy, vz); par.push(r(), (vy + Math.sqrt(disc)) / G, size, r()); };
        for (const [fx, fz, sc, dark] of jets) { if (dark !== white) continue;
          for (let i = 0; i < 1500; i++) { const a = r() * 6.283, sp = r() * r() * 1.1 * sc; drop(fx, 28.6 * sc, fz, Math.cos(a) * sp, Math.sqrt(2 * G * 46 * sc) * (.9 + .1 * r()), Math.sin(a) * sp, 18.4 * sc, 1.15 * sc); }                                                    // the great jet, falling back into the middle bowl
          for (let j = 0; j < 12; j++) { const a = j * .5236, ca = Math.cos(a), sa = Math.sin(a); for (let i = 0; i < 100; i++) { const vy = Math.sqrt(2 * G * 11 * sc) * (.985 + .03 * r()), T = (vy + Math.sqrt(vy * vy + 2 * G * 15.4 * sc)) / G, vh = 4.4 * sc / T * (.96 + .08 * r()), jt = (r() - .5) * .22 * sc; drop(fx + ca * 6.4 * sc, 18.8 * sc, fz + sa * 6.4 * sc, ca * vh - sa * jt, vy, sa * vh + ca * jt, 3.3 * sc, .8 * sc); } }      // arching out from the middle bowl into the basin
          for (let j = 0; j < 16; j++) { const a = j * .3927 + .2, ca = Math.cos(a), sa = Math.sin(a); for (let i = 0; i < 90; i++) { const vy = Math.sqrt(2 * G * 9 * sc) * (.99 + .02 * r()), T = (vy + Math.sqrt(vy * vy + 2 * G * 24.1 * sc)) / G, vh = 10.2 * sc / T * (.97 + .06 * r()), jt = (r() - .5) * .18 * sc; drop(fx + ca * 3.6 * sc, 27.4 * sc, fz + sa * 3.6 * sc, ca * vh - sa * jt, vy, sa * vh + ca * jt, 3.3 * sc, .75 * sc); } }   // arching out from the top bowl, over the middle one, and down into the basin
          for (let i = 0; i < 1100; i++) { const a = r() * 6.283, up = i < 340, rr = (up ? 4 : 8) * sc, vo = (up ? .5 : .8) * sc * (.5 + r()); drop(fx + Math.cos(a) * rr, (up ? 26.4 : 16.4) * sc, fz + Math.sin(a) * rr, Math.cos(a) * vo, 0, Math.sin(a) * vo, (up ? 18.4 : 3.3) * sc, .9 * sc); } }                               // and a curtain off the lip of each bowl
        const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('aV', new THREE.Float32BufferAttribute(vel, 3)); ge.setAttribute('aP', new THREE.Float32BufferAttribute(par, 4));
        const m = new THREE.Points(ge, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uTime: U.uTime, uScale: FXSCALE, uCol: { value: white ? new THREE.Vector3(.74, .73, .7) : new THREE.Vector3(.012, .01, .03) } },
          vertexShader: 'attribute vec3 aV; attribute vec4 aP; uniform float uTime, uScale; varying float vA; void main(){ float f = fract(uTime / aP.y + aP.x), t = f * aP.y; vec3 p = position + aV * t; p.y -= 23.0 * t * t; vA = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.93, 1.0, f)); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aP.z * (0.8 + 0.4 * aP.w) * uScale / -mv.z, 1.0, 30.0); }',
          fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(uCol, a * vA * 0.8); }' })); m.frustumCulled = false; m.raycast = () => {}; scene.add(m); }
      for (let i = 0; i < 16; i += 2) lanternPts.push([c[0] + Math.cos(i * .3927) * 138, y0 + 13.4, c[1] + Math.sin(i * .3927) * 138, { c: [2.4, 2.1, 1.5], size: 8, drift: .1, speed: .4 }]); }

    // Inkwell Lake (seven hexes): not a lake at all but a great bath-hall, shown without its roof. Three ranges stand round a court, a spired tower at each outer corner; each range has rectangular pools of slow-moving black ink sunk in a white marble floor,
    // a blind buttressed wall outside, ink running from gilt spouts in that wall down channels to the pools, a colonnade and gallery to each side with bridges across between the pools, lamps at the corners of every pool, and only the ribs of its roof left on so that you can see in.
    // A fourth pool lies open in the court, with obelisks at its corners and cypresses down both sides
    { const HX = [[29, 9], [28, 10], [29, 10], [28, 9], [27, 10], [27, 11], [28, 11]], P = INKLAKE.map(Wp), c = [P.reduce((a, p) => a + p[0], 0) / 7 - 41, P.reduce((a, p) => a + p[1], 0) / 7];
      addThing('Inkwell Lake', '🖋️', c, 1, 30, g => { const k = kit(g), yew = solid(0x10201a, 1, { flatShading: true });
        const range = (x, z, ry, Lr, Wr, np) => { const rg = new THREE.Group(), Q = (geo, mat, px, py, pz, o) => M(rg, geo, mat, px, py, pz, o), pl = (Lr - 24) / np - 8, pw = Wr * .46, zw = Wr / 2 - 1.2;
          Q(new THREE.BoxGeometry(Lr, 1, Wr), wm, 0, .5, 0); Q(new THREE.BoxGeometry(Lr, 24, 2.4), bm, 0, 12, -zw); Q(new THREE.BoxGeometry(Lr + 1, 1.2, 3.4), gd, 0, 24.6, -zw); for (let i = 0; i < Math.floor(Lr / 12); i++) NS(Q(new THREE.BoxGeometry(3, 10, .5), litP, -Lr / 2 + 8 + i * 12, 14, -(Wr / 2 + .1))); for (const sd of [-1, 1]) Q(new THREE.BoxGeometry(2.4, 24, Wr), bm, sd * (Lr / 2 - 1.2), 12, 0);
          for (let i = 0; i <= Math.floor((Lr - 4) / 24); i++) { Q(new THREE.BoxGeometry(3.4, 27, 4.4), bm, -Lr / 2 + 2 + i * 24, 13.5, -(Wr / 2 + 1.8)); Q(new THREE.ConeGeometry(2.4, 7, 4), bm, -Lr / 2 + 2 + i * 24, 30.5, -(Wr / 2 + 1.8), { ry: Math.PI / 4 }); }                                                                 // buttresses along the blind wall
          for (let i = 0; i <= Math.floor((Lr - 8) / 13); i++) Q(new THREE.CylinderGeometry(1.3, 1.5, 23, 10), bm, -Lr / 2 + 4 + i * 13, 12.5, Wr / 2 - 1.6); Q(new THREE.BoxGeometry(Lr, 2, 3.4), bm, 0, 25, Wr / 2 - 1.6);                                                                                                // the court side is an open colonnade
          for (let i = 0; i < np; i++) { const px = -Lr / 2 + 16 + pl / 2 + i * (pl + 8); NS(Q(new THREE.BoxGeometry(pl, .5, pw), inkF, px, 1.15, 0)); for (const sd of [-1, 1]) { Q(new THREE.BoxGeometry(pl + 2.4, 1.4, 1.2), bm, px, 1.2, sd * (pw / 2 + .6)); Q(new THREE.BoxGeometry(1.2, 1.4, pw), bm, px + sd * (pl / 2 + .6), 1.2, 0);
              for (const se of [-1, 1]) { Q(new THREE.CylinderGeometry(.3, .4, 7, 6), gd, px + se * (pl / 2 + .6), 5, sd * (pw / 2 + .6)); NS(Q(new THREE.SphereGeometry(.9, 8, 6), litP, px + se * (pl / 2 + .6), 8.9, sd * (pw / 2 + .6))); } }                                                                              // a pool in its kerb, a lamp at each corner
            Q(new THREE.BoxGeometry(2.4, .9, pw * .5), wm, px - pl / 2 + 1.2, 1.2, 0); Q(new THREE.BoxGeometry(2.4, .5, pw * .5), wm, px - pl / 2 + 3.6, 1.2, 0);                                                                                                                                                      // steps down into it
            for (const sp of [-.28, .28]) { const sxp = px + sp * pl, zc = -(zw + pw / 2) / 2, lc = zw - pw / 2 - 1.2; Q(new THREE.BoxGeometry(2.4, .5, lc), gd, sxp, 1.2, zc); NS(Q(new THREE.BoxGeometry(1.3, .3, lc), inkF, sxp, 1.4, zc)); Q(new THREE.BoxGeometry(3.2, 3.2, 2.2), gd, sxp, 11, -(zw - 2.2)); NS(Q(new THREE.PlaneGeometry(1.5, 9), inkFall, sxp, 5.6, -(zw - 2.4))); }   // spouts in the wall and the channels they feed
            Q(new THREE.BoxGeometry(4.4, 1, pw + 12), bm, px + pl / 2 + 4, 15, 0); for (const sd of [-1, 1]) Q(new THREE.BoxGeometry(4.4, .4, .4), gd, px + pl / 2 + 4 + sd * 2, 17.4, 0, { ry: Math.PI / 2, sx: (pw + 12) / 4.4 }); for (let j = 0; j < 4; j++) Q(new THREE.BoxGeometry(3.2, .2, 2.4), wm, px + (sr() - .5) * pl * .8, 1.5, (sr() - .5) * pw * .8, { ry: sr() * 3 }); }   // a bridge between the galleries past its end, and pages adrift on the ink
          for (const sd of [-1, 1]) { Q(new THREE.BoxGeometry(Lr - 8, 1, 5.4), bm, 0, 15, sd * (pw / 2 + 6)); Q(new THREE.BoxGeometry(Lr - 8, .5, .5), gd, 0, 18, sd * (pw / 2 + 3.6)); for (let i = 0; i <= Math.floor((Lr - 16) / 11); i++) Q(new THREE.CylinderGeometry(.8, .95, 14, 8), wm, -Lr / 2 + 8 + i * 11, 8, sd * (pw / 2 + 4)); }                     // colonnades carrying the galleries
          for (let i = 0; i <= Math.floor((Lr - 12) / 20); i++) for (const sd of [-1, 1]) Q(new THREE.BoxGeometry(1.2, 1.2, Wr * .6), bm, -Lr / 2 + 6 + i * 20, 26 + Wr * .15, sd * Wr * .25, { rx: sd * .56 }); Q(new THREE.BoxGeometry(Lr, 1.4, 1.4), gd, 0, 26 + Wr * .31, 0);                                 // the ribs of the roof, and its ridge
          rg.position.set(x, 0, z); rg.rotation.y = ry; sbake(g, rg); };
        range(0, -112, 0, 256, 72, 3); range(-92, 26, Math.PI / 2, 204, 72, 2); range(92, 26, -Math.PI / 2, 204, 72, 2);
        for (const [x, z] of [[-128, -148], [128, -148], [-128, 128], [128, 128]]) { k.B(18, 52, 18, bm, x, 26, z); k.B(20, 1.6, 20, gd, x, 52.8, z); M(g, new THREE.ConeGeometry(12.5, 34, 4), roofD, x, 70.6, z, { ry: Math.PI / 4 }); NS(k.S(1.4, litP, x, 89, z)); for (const sd of [-1, 1]) { NS(k.B(2.4, 12, .5, litP, x, 34, z + sd * 9.1)); NS(k.B(.5, 12, 2.4, litP, x + sd * 9.1, 34, z)); } }   // the corner towers
        k.B(112, 1, 204, wm, 0, .5, 26); NS(k.B(64, .5, 120, inkF, 0, 1.15, 22)); for (const sd of [-1, 1]) { k.B(66.4, 1.4, 1.2, bm, 0, 1.2, 22 + sd * 60.6); k.B(1.2, 1.4, 120, bm, sd * 32.6, 1.2, 22); }                                                                             // the court pool
        for (const sx of [-1, 1]) { for (const sz of [-1, 1]) { k.B(4, 3, 4, bm, sx * 38, 2.5, 22 + sz * 66); M(g, new THREE.ConeGeometry(2, 22, 4), bm, sx * 38, 15, 22 + sz * 66, { ry: Math.PI / 4 }); k.S(.9, gd, sx * 38, 26.4, 22 + sz * 66); }
          for (let i = 0; i < 6; i++) { const z = -28 + i * 20; k.C(2.2, 1.6, 2.6, 10, wm, sx * 45, 2.3, z); M(g, new THREE.ConeGeometry(2.6, 13, 7), yew, sx * 45, 10, z); } k.B(3, 1.6, 14, wm, sx * 51, 1.8, 22); }                                                                 // obelisks, cypresses in urns, a bench
        for (const sd of [-1, 1]) { k.B(8, 50, 8, bm, sd * 17, 25, 130); for (let i = 0; i < 3; i++) k.C(1.3, 1.5, 23, 10, bm, sd * (26 + i * 12), 12.5, 130); k.B(34, 2, 3.4, bm, sd * 38, 25, 130); } M(g, gable(42, 24, 8), bm, 0, 50, 130); k.B(44, 1.4, 9, gd, 0, 50, 130);
        NS(k.B(26, 38, .5, new THREE.MeshBasicMaterial({ color: 0x6a30c0, transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 22, 130));                                                                                                         // the arch you come in by
      }, { y: GY, hexes: HX, top: 96, view: 760 });
      for (const [x, z] of [[-85, -112], [0, -112], [85, -112], [-92, -20], [-92, 72], [92, -20], [92, 72], [0, 22]]) lanternPts.push([c[0] + x, GY + 20, c[1] + z, { c: [1.4, .6, 2.6], size: 10, drift: 3, speed: .3 }]); }

    // Cold Anchor Stones (35,4; on the live map 34,6, moved out so its field stands clear of the Hatchery): Silverquill's own stone
    { const c = Wp(COLDS), cy = heightAt(c[0], c[1]), gh = (x, z) => heightAt(c[0] + x, c[1] + z) - cy; addThing('Cold Anchor Stones', '🗿', c, 1, 30, g => anchorStone(g, gh), { y: cy, hexes: [[35, 4]], top: 84, view: 360 }); coldField(c[0], cy, c[1]);
      lanternPts.push([c[0], cy + 36, c[1], { c: [.9, 1.8, 2.8], size: 30, drift: .2, speed: .5 }]); }

    // a pegasus on the wing over Ewfall Guardens, south of Clarentine's house: the horse from three.js's examples (by Mirada, kept beside this page in models/), turned white and given wings, going round and round. If the model is missing the map goes without.
    // Each wing is built the way a bird's is: an arm and a hand, jointed at the wrist; long primaries fanning from the hand, secondaries along the arm, and two rows of shorter coverts lapping over their roots. The hand trails the arm a little on each beat
    { const ew = Wp(EWF), cx = ew[0], cz = ew[1], RR = 78, FY = 15 * S + 112;
      new GLTFLoader().load('models/Horse.glb', gltf => { const m = gltf.scene.children[0] || gltf.scene, holder = new THREE.Group(), inner = new THREE.Group(), sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()); m.scale.multiplyScalar(24 / Math.max(sz.x, sz.y, sz.z)); inner.add(m); holder.add(inner); holder.updateMatrixWorld(true);
          const bx = new THREE.Box3().setFromObject(m), cen = bx.getCenter(new THREE.Vector3()), s2 = bx.getSize(new THREE.Vector3()), alongX = s2.x > s2.z, L = Math.max(s2.x, s2.z), top = new THREE.Vector3(0, -1e9, 0), v = new THREE.Vector3();
          m.traverse(o => { if (!o.isMesh) return; o.material = o.material.clone(); o.material.vertexColors = false; o.material.color.set(0xf4f2ec); o.material.roughness = .6; o.castShadow = true; o.raycast = () => {}; o.frustumCulled = false; const pa = o.geometry.attributes.position; for (let i = 0; i < pa.count; i += 3) { v.fromBufferAttribute(pa, i); o.localToWorld(v); if (v.y > top.y) top.copy(v); } });   // the highest point of a standing horse is its head: that tells which way it faces
          const sign = (alongX ? top.x - cen.x : top.z - cen.z) > 0 ? 1 : -1; m.position.x -= cen.x; m.position.z -= cen.z; m.position.y -= bx.min.y; inner.rotation.y = alongX ? (sign > 0 ? 0 : Math.PI) : (sign > 0 ? Math.PI / 2 : -Math.PI / 2);                 // so that it faces along the holder's own x
          const featherM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75, side: THREE.DoubleSide }), boneM = new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: .7 }), W = L * .52, C = L * .23, cQ = new THREE.Color(0xcfc8ba), cT = new THREE.Color(0xffffff), cM = new THREE.Color();
          // one feather: a vane with a pointed tip, laid from its root along a direction in the wing's plane, sagging a little toward the tip; paler toward the tip
          const feather = (pos, col, root, dir, len, wid, lift) => { const dx = dir[0], dz = dir[1], sx = -dz, sz2 = dx, P = [[0, 0], [.5, .22], [.46, .62], [.26, .9], [0, 1], [-.26, .9], [-.46, .62], [-.5, .22]].map(([a, b]) => [root[0] + sx * a * wid + dx * b * len, root[1] + lift - b * b * len * .07 + (1 - Math.abs(a) * 2) * wid * .08, root[2] + sz2 * a * wid + dz * b * len, b]);
            for (let i = 1; i + 1 < P.length; i++) for (const p of [P[0], P[i], P[i + 1]]) { pos.push(p[0], p[1], p[2]); cM.copy(cQ).lerp(cT, .25 + .75 * p[3]); col.push(cM.r, cM.g, cM.b); } };
          const mesh = (pos, col) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); ge.computeVertexNormals(); const me = new THREE.Mesh(ge, featherM); me.castShadow = true; me.raycast = () => {}; me.frustumCulled = false; return me; };
          const limb = (g, a, b, r0, r1) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), me = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 7), boneM); me.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); me.castShadow = true; me.raycast = () => {}; me.frustumCulled = false; g.add(me); };
          const wings = [-1, 1].map(sd => { const arm = new THREE.Group(), hand = new THREE.Group(), E = [C * .16, 0, W * .42 * sd], T = [-C * .22, 0, W * .58 * sd], ap = [], ac = [], hp = [], hc = [];   // E: the wrist, from the shoulder; T: the wingtip, from the wrist
              for (let i = 0; i < 9; i++) { const f = i / 8, r = [E[0] * f, 0, E[2] * f], a = (-8 + 26 * f) * Math.PI / 180; feather(ap, ac, r, [-Math.cos(a), Math.sin(a) * sd], C * (.92 + .16 * f), W * .075, 0); }                                      // secondaries
              for (let i = 0; i < 11; i++) { const f = i / 10, r = [E[0] * f, 0, E[2] * f], a = (-4 + 22 * f) * Math.PI / 180; feather(ap, ac, [r[0] + C * .03, 0, r[2]], [-Math.cos(a), Math.sin(a) * sd], C * .5, W * .06, C * .035); }                  // greater coverts over them
              for (let i = 0; i < 12; i++) { const f = i / 11, r = [E[0] * f, 0, E[2] * f]; feather(ap, ac, [r[0] + C * .06, 0, r[2]], [-1, .1 * sd], C * .26, W * .05, C * .06); }                                                                  // lesser coverts along the arm
              for (let i = 0; i < 10; i++) { const f = i / 9, r = [T[0] * f, 0, T[2] * f], a = (22 + 58 * f) * Math.PI / 180; feather(hp, hc, r, [-Math.cos(a), Math.sin(a) * sd], C * (1.08 + .5 * Math.sin(f * 2.2)), W * .07, 0); }                       // primaries, fanning round to the tip
              for (let i = 0; i < 9; i++) { const f = i / 8, r = [T[0] * f, 0, T[2] * f], a = (16 + 44 * f) * Math.PI / 180; feather(hp, hc, [r[0] + C * .03, 0, r[2]], [-Math.cos(a), Math.sin(a) * sd], C * .5, W * .055, C * .035); }                 // primary coverts
              arm.add(mesh(ap, ac)); hand.add(mesh(hp, hc)); limb(arm, [0, C * .04, 0], [E[0], C * .04, E[2]], C * .07, C * .045); limb(hand, [0, C * .04, 0], [T[0] * .8, C * .04, T[2] * .8], C * .045, C * .015);
              hand.position.set(E[0], 0, E[2]); arm.add(hand); arm.position.set(L * .1, s2.y * .64, sd * L * .06); holder.add(arm); return { arm, hand, sd }; });
          scene.add(holder); const mixer = new THREE.AnimationMixer(m); if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).setDuration(1.3).play(); window.__pegasus = holder;
          anim.push((t, dt) => { mixer.update(Math.min(dt || 0, .1)); const a = t * .2; holder.position.set(cx + Math.cos(a) * RR, FY + 8 * Math.sin(t * .45), cz + Math.sin(a) * RR); holder.rotation.set(.2, Math.atan2(-Math.cos(a), -Math.sin(a)), .06 * Math.sin(t * .45 + 1.5), 'YXZ');
            const f1 = .12 + .5 * Math.sin(t * 3.1), f2 = .1 + .42 * Math.sin(t * 3.1 - 1); for (const w of wings) { w.arm.rotation.x = -w.sd * f1; w.hand.rotation.x = -w.sd * f2; } }); (window.__beasts = window.__beasts || []).push('pegasus');
        }, undefined, () => console.warn('animal model not loaded: Horse.glb')); }

    for (const t of things) if (t.name === 'Inkwell Lake' || t.name === 'Inkling Hatchery Vats' || t.name === 'Damatha Inkfountains') inkify(t);

    // ---------------- the roads, which all start from the hall's plaza ----------------
    const HALL = Wp(CITY), GTW = [SQGATE[0] * S, SQGATE[1] * S], GOUT = [Math.cos(SQGATE[2]), Math.sin(SQGATE[2])], HRY = Math.atan2(GTW[0] - HALL[0], GTW[1] - HALL[1]), HF = [Math.sin(HRY), Math.cos(HRY)], HR = [HF[1], -HF[0]], PA = 86, PB = 114;   // the plaza is an ellipse, PB long down the hall's axis and PA across
    const inPlaza = (x, z, m) => { const px = x - HALL[0], pz = z - HALL[1]; return ((px * HR[0] + pz * HR[1]) / (PA + m)) ** 2 + ((px * HF[0] + pz * HF[1]) / (PB + m)) ** 2 < 1; };
    const from = to => { const dx = to[0] - HALL[0], dz = to[1] - HALL[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, rr = 1 / Math.hypot((ux * HR[0] + uz * HR[1]) / PA, (ux * HF[0] + uz * HF[1]) / PB) - 5; return [HALL[0] + ux * rr, HALL[1] + uz * rr]; };   // the point on the plaza's edge that faces a place
    const LMH = new Set([[27, 15], [27, 16], [28, 14], [28, 13], [29, 13], [29, 14], [29, 15], [31, 15], [33, 15], [32, 14], [32, 16], [28, 18], [28, 19], [27, 19]].map(([q, r]) => hexKey(q, r)));
    const owned = (x, z) => { const h = worldToHex(x, z); return LMH.has(hexKey(h.q, h.r)) || inPlaza(x, z, 8) || !sqInside(x / S, z / S) || polyDist(SQPATH, x / S, z / S) * S < 18; }, roadD = solid(0x0c0c10, .3), postD = solid(0x0b0b10, .4);
    const cA = cenW([[28, 14], [28, 13], [29, 13]]);
    const DUSK = [from(hexW(28, 16)), hexW(28, 16), hexW(28, 15), [cA[0], cA[1] + 60]], RAY = [from(hexW(30, 17)), hexW(30, 17), hexW(31, 16), hexW(32, 15), [hexW(32, 15)[0] + 52, hexW(32, 15)[1] - 30]], RAY2 = [from(hexW(29, 18)), hexW(29, 18), [hexW(29, 18)[0] + 14, hexW(29, 18)[1] + 56]];
    const ROADS = [[from(GTW), [GTW[0] - GOUT[0] * 14, GTW[1] - GOUT[1] * 14]]];
    // Duskwalk (28,15 28,16 28,17): the dark road, running out from the hall's north side through the shadow district to the steps of the Annex; close-built with narrow black houses and the alleys between them, purple lamps, a little ink-dust webbing, lanterns moving along it
    { const bm = bmL, roofD = roofL, c = hexW(28, 16);
      addThing('Duskwalk', '🌑', c, 1, 30, g => { street(g, c, DUSK, { w: 18, road: roadD, wall: bm, roof: roofD, lit: litP, lit2: litW, post: postD, h0: 20, h1: 26, skip: owned }); }, { y: GY, hexes: [[28, 15], [28, 16], [28, 17]], top: 70, view: 620 });
      for (let i = 0; i + 1 < DUSK.length; i++) walkers(DUSK[i], DUSK[i + 1], 12, [1.5, .6, 2.6], 9, GY + 4, 51 + i); { const wr = mulberry32(52), st = []; for (let i = 0; i + 1 < DUSK.length; i++) { const A = DUSK[i], B = DUSK[i + 1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L; for (let d = 14; d < L - 10; d += 12 + 14 * wr()) { const d2 = d + (wr() - .5) * 16, p = [A[0] + dx / L * d, A[1] + dz / L * d], q = [A[0] + dx / L * d2, A[1] + dz / L * d2]; if (owned(p[0], p[1]) || owned(q[0], q[1])) continue; st.push([[p[0] + nx * 13, GY + 22 + 12 * wr(), p[1] + nz * 13], [q[0] - nx * 13, GY + 22 + 12 * wr(), q[1] - nz * 13], .35 + .7 * wr() * wr()]); } } webs(st, 0x08080c, .5); } }
    // Ray Promenade (four hexes): the bright road, white marble edged in gold, lamps both sides, white houses with gilded roofs - running out from the hall's east side through the bright district, with a second, short arm south
    { const c = hexW(31, 16), lamps = [];
      addThing('Ray Promenade', '✨', c, 1, 30, g => { const o = { w: 22, road: wm, edge: gd, wall: wm, roof: roofG, lit: litW, lit2: litW, post: gd, h0: 18, h1: 18, gap: 20, skip: owned, lamps }; street(g, c, RAY, o); street(g, c, RAY2, o); }, { y: GY, hexes: [[32, 15], [31, 16], [30, 17], [29, 18]], top: 60, view: 760 });
      lamps.forEach((p, i) => { if (i % 3 === 0) lanternPts.push([p[0], GY + 11, p[1], { c: [2.6, 2.2, 1.5], size: 9, drift: .1, speed: .4 }]); }); for (let i = 0; i + 1 < RAY.length; i++) walkers(RAY[i], RAY[i + 1], 9, [2.6, 2.3, 1.6], 12, GY + 4, 58 + i); }
    // the only other road is the short one from the hall's doors to the gate; it is part of the city rather than a place of its own
    const cityG = new THREE.Group(); cityG.position.set(0, GY, 0); const ZERO = [0, 0];
    street(cityG, ZERO, ROADS[0], { w: 24, road: wm, edge: gd, post: gd, lit: litW, gap: 18 });
    mergeKids(cityG); cityG.traverse(m => { if (m.isMesh) { m.raycast = () => {}; m.receiveShadow = true; } }); scene.add(cityG);

    // ---------------- the city: small houses, block after block, everywhere inside the wall that is not a place or a road. Black with violet windows on the dark side, white with gilded roofs on the bright ----------------
    { const segD = (x, z, P) => { let b = 1e9; for (let i = 0; i + 1 < P.length; i++) { const ax = P[i][0], az = P[i][1], dx = P[i + 1][0] - ax, dz = P[i + 1][1] - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); b = Math.min(b, Math.hypot(ax + dx * t - x, az + dz * t - z)); } return b; };
      const EX = [[hexW(27, 15), 62], [hexW(27, 16), 80], [cA, 104], [hexW(29, 14), 86], [hexW(29, 15), 72], [hexW(31, 15), 70], [hexW(33, 15), 78], [hexW(32, 14), 68], [hexW(32, 16), 80], [GTW, 62], [[GTW[0] - GOUT[0] * 34, GTW[1] - GOUT[1] * 34], 38]];
      const bodies = [], roofs = [], spires = [], winP = [], winW = [], hr = mulberry32(4242), x0 = SQPATH.x0 * S, x1 = SQPATH.x1 * S, z0 = SQPATH.z0 * S, z1 = SQPATH.z1 * S, ST = 18.5;
      for (let ix = 0, x = x0; x < x1; ix++, x += ST) for (let iz = 0, z = z0; z < z1; iz++, z += ST) { const jx = hr(), jz = hr(), jh = hr(), jw = hr(); if (ix % 5 === 0 || iz % 4 === 0) continue;                                         // streets between the blocks
          if (!sqInside(x / S, z / S) || polyDist(SQPATH, x / S, z / S) * S < 22 || inPlaza(x, z, 14)) continue; if (EX.some(([p, r]) => Math.hypot(x - p[0], z - p[1]) < r)) continue;
          if (segD(x, z, DUSK) < 37 || segD(x, z, RAY) < 39 || segD(x, z, RAY2) < 39 || segD(x, z, ROADS[0]) < 22) continue;
          const dark = (x / S - X(.83)) * .8 + (z / S - Z(.305)) * .6 + 34 * fbm(x / S / 75, z / S / 75, 3) < 0, w = 12.5 + 2.5 * jw, d = 13 + 2 * jx, h = 17 + 17 * jh * jh, px = x + (jx - .5) * 2, pz = z + (jz - .5) * 2, v = .85 + .3 * jz, ry = (Math.floor(ix / 5) + Math.floor(iz / 4)) % 2 ? Math.PI / 2 : 0, rt = dark ? [.006, .006, .01] : [.3 * v, .32 * v, .38 * v];
          bodies.push({ x: px, y: GY + h / 2, z: pz, sx: w, sy: h, sz: d, ry, tint: dark ? [.013 * v, .013 * v, .018 * v] : [.6 * v, .585 * v, .54 * v] }); roofs.push({ x: px, y: GY + h, z: pz, sx: w + 1.2, sy: w * .7, sz: d + 1.2, ry, tint: rt });
          if (jw > .88) spires.push({ x: px, y: GY + h + w * .5 + h * .3, z: pz, sx: w * .22, sy: h * .9, sz: w * .22, ry: ry + Math.PI / 4, tint: rt }); (dark ? (jz < .8 ? winP : winW) : winW).push({ x: px, y: GY, z: pz, sx: w, sy: h, sz: d, ry }); }
      const plain = applyTex(new THREE.MeshStandardMaterial({ roughness: .35 }), 'marbleW'), roofM = applyTex(new THREE.MeshStandardMaterial({ roughness: .35 }), 'slateW'), wq = []; for (const sd of [-1, 1]) for (const wx of [-.26, .26]) for (const wy of [.3, .66]) { const q = new THREE.PlaneGeometry(.13, .2); if (sd < 0) q.rotateY(Math.PI); q.translate(wx, wy, sd * .504); wq.push(q); }
      const winGeo = mergeGeometries(wq), mk = (geo, mat, list, sh) => { const m = instanced(geo, mat, list); if (m) { m.castShadow = sh; m.raycast = () => {}; } };
      mk(new THREE.BoxGeometry(1, 1, 1), plain, bodies, true); mk(gable(1, 1, 1), roofM, roofs, true); mk(new THREE.ConeGeometry(1, 1, 4), roofM, spires, true); mk(winGeo, glowM(0xa860ff, 2.2), winP, false); mk(winGeo, glowM(0xffe2a8, 1.5), winW, false); window.__cityHouses = bodies.length; }

    // ---------------- and round all of it, the wall: black marble, towers along it, a line of violet light running round its top; open only at the gate ----------------
    { const segs = [], tw = [], cones = [], glowS = [], W = SQWALL.map(p => [p[0] * S, p[1] * S]), n = W.length;
      for (let i = 0; i < n; i++) { const p0 = W[i], p1 = W[(i + 1) % n], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ry = -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, dg = Math.hypot(mx - GTW[0], mz - GTW[1]);
        if (dg > 22) { segs.push({ x: mx, y: GY + 15, z: mz, sx: L + 2.4, sy: 34, sz: 9, ry, tint: [.9, .9, .95] }); glowS.push({ x: mx, y: GY + 31, z: mz, sx: L + 2.4, sy: .8, sz: 9.6, ry }); }
        if (i % 6 === 0 && Math.hypot(p0[0] - GTW[0], p0[1] - GTW[1]) > 70) { tw.push({ x: p0[0], y: GY + 24, z: p0[1], sx: 16, sy: 52, sz: 16, ry, tint: [.9, .9, .95] }); cones.push({ x: p0[0], y: GY + 60, z: p0[1], sx: 12.4, sy: 22, sz: 12.4, ry: ry + .785, tint: [.9, .9, .95] }); } }
      instanced(new THREE.BoxGeometry(1, 1, 1), bm, segs); instanced(new THREE.BoxGeometry(1, 1, 1), bm, tw); instanced(new THREE.ConeGeometry(1, 1, 4), bm, cones); const gl = instanced(new THREE.BoxGeometry(1, 1, 1), glowM(0x9a60ff, 2.2), glowS); if (gl) gl.castShadow = false; }
  }

  // ================= Witherbloom locations from the live map =================
  { const wr = mulberry32(3131), plank = solid(0x7a6040, .9), plankD = solid(0x54402a, .95), timber = solid(0x3a2c20, .95), rope = solid(0x8a7a5a, 1), moss = solid(0x4a6a2e, 1, { flatShading: true }), mossD = solid(0x2c4424, 1, { flatShading: true }), barkM = solid(0x3a2e22, .95, { flatShading: true }), boneM = tx(solid(0xd8d2bc, .8), 'rock'), stoneM = solid(0x6c6a60, .95, { flatShading: true }), thatch = solid(0x8a7440, 1, { flatShading: true });
    const glassW = new THREE.MeshStandardMaterial({ color: 0xcfe8d8, roughness: .06, transparent: true, opacity: .2, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false }), litG = glowM(0x9dff5a, 2.6), litY = glowM(0xe6ff6a, 2.2), litA = glowM(0xffb030, 2.6), litO = glowM(0xffd9a0, 2.6), leaf = [solid(0x26402a, 1, { flatShading: true }), solid(0x35553a, 1, { flatShading: true }), solid(0x1f3626, 1, { flatShading: true })];
    const rod = (g, mat, a, b, r0, r1 = r0, seg = 6) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, L, seg), mat); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m); return m; };
    const fold = (g, sub) => { sub.updateMatrix(); for (const m of [...sub.children]) { m.applyMatrix4(sub.matrix); g.add(m); } }, cenW = hx => { const p = hx.map(([q, r]) => hexW(q, r)); return [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length]; };
    const clump = (g, x, y, z, r, n) => { for (let i = 0; i < n; i++) M(g, new THREE.IcosahedronGeometry(r * (.6 + .6 * wr()), 1), leaf[i % 3], x + (wr() - .5) * r * 1.6, y + (wr() - .3) * r * .7, z + (wr() - .5) * r * 1.6, { sy: .6 }); };
    const reeds = (g, x, y, z, R0, n) => { for (let i = 0; i < n; i++) { const a = wr() * 6.283, d = R0 * Math.sqrt(wr()), hh = 5 + 6 * wr(), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; rod(g, mossD, [px, y, pz], [px + (wr() - .5) * 2, y + hh, pz + (wr() - .5) * 2], .22, .1, 4); if (i % 3 === 0) M(g, new THREE.CylinderGeometry(.5, .5, 2.2, 5), plankD, px, y + hh, pz); } };
    const grassM = solid(0x587a32, 1, { flatShading: true }), padM = solid(0x3f7038, .8, { side: THREE.DoubleSide }), pinkM = new THREE.MeshStandardMaterial({ color: 0xe889b0, roughness: .7, emissive: 0x7a2a4a, emissiveIntensity: .35, flatShading: true }), capR = solid(0xb8402a, .7), stemM = solid(0xe6dcc0, .8), terra = solid(0xa85a3a, .9);
    const tuft = (g, x, y, z, s = 1) => { for (let q = 0; q < 5; q++) { const a = q * 1.26 + wr() * .6; M(g, new THREE.ConeGeometry(.35 * s, (3 + 2 * wr()) * s, 3), grassM, x + Math.cos(a) * .6 * s, y + 1.4 * s, z + Math.sin(a) * .6 * s, { rz: -Math.cos(a) * .4, rx: Math.sin(a) * .4 }); } };
    const fern = (g, x, y, z, s = 1) => { for (let q = 0; q < 6; q++) { const a = q * 1.05 + wr(); M(g, new THREE.ConeGeometry(.9 * s, (7 + 3 * wr()) * s, 3), leaf[q % 3], x + Math.cos(a) * 1.8 * s, y + 2.6 * s, z + Math.sin(a) * 1.8 * s, { rz: -Math.cos(a) * .75, rx: Math.sin(a) * .75 }); } };
    const shroom = (g, x, y, z, hh, r, capM) => { rod(g, stemM, [x, y, z], [x + (wr() - .5) * hh * .2, y + hh, z + (wr() - .5) * hh * .2], r * .28, r * .2); M(g, new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capM, x, y + hh - r * .1, z, { sy: .65 }); };
    const rock = (g, x, y, z, r, mat) => M(g, new THREE.IcosahedronGeometry(r, 0), mat || stoneM, x, y, z, { sy: .5 + .4 * wr(), ry: wr() * 3, sx: .8 + .5 * wr() });
    const pad = (g, x, y, z, r) => M(g, new THREE.CircleGeometry(r, 9, .4, 5.6), padM, x, y, z, { rx: -Math.PI / 2, rz: wr() * 6 });
    // a boardwalk laid along a line of world points: stringers, planks no two alike, stilts down into the water, rope rails, and whatever stands on the taller posts
    const deck = (g, c, pts, o) => { const y = o.y; for (let i = 0; i + 1 < pts.length; i++) { const A = pts[i], B = pts[i + 1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux, ry = -Math.atan2(uz, ux);
        for (const sd of [-1, 1]) M(g, new THREE.BoxGeometry(L + 2, 1, 1.2), timber, (A[0] + B[0]) / 2 - c[0] + nx * sd * o.w * .32, y - .9, (A[1] + B[1]) / 2 - c[1] + nz * sd * o.w * .32, { ry });
        for (let d = 0; d < L; d += 2.3) { if (wr() < (o.miss || 0)) continue; const w = o.w * (.86 + .28 * wr()), of = (wr() - .5) * 1.6; M(g, new THREE.BoxGeometry(2, .5, w), wr() < .3 ? plankD : plank, A[0] + ux * d + nx * of - c[0], y + (wr() - .5) * .3, A[1] + uz * d + nz * of - c[1], { ry: ry + (wr() - .5) * .12 }); }
        for (let d = 3, k = 0; d < L; d += 13, k++) for (const sd of [-1, 1]) { const x = A[0] + ux * d + nx * sd * (o.w / 2 - .4), z = A[1] + uz * d + nz * sd * (o.w / 2 - .4), tall = (k + (sd > 0 ? 1 : 0)) % 2 === 0;
          rod(g, timber, [x - c[0], Math.min(heightAt(x, z), 0) - 5, z - c[1]], [x - c[0] + (wr() - .5) * 1.2, y + (tall ? o.post : 3.2), z - c[1] + (wr() - .5) * 1.2], .7, .5); if (tall && o.lamp) o.lamp(g, x - c[0], y + o.post, z - c[1], x, z, sd, ux, uz); }
        if (o.rope) for (const sd of [-1, 1]) for (let d = 3; d + 13 < L; d += 13) { const p = t => [A[0] + ux * (d + 13 * t) + nx * sd * (o.w / 2 - .4) - c[0], y + 3 - 1.2 * Math.sin(Math.PI * t), A[1] + uz * (d + 13 * t) + nz * sd * (o.w / 2 - .4) - c[1]]; for (let q = 0; q < 3; q++) rod(g, rope, p(q / 3), p((q + 1) / 3), .16, .16, 4); } } };

    // Greenward Conservatory (22,32): a glasshouse whose frame is grown, not built - living trunks down both sides, their boughs trained over into arches, glass between them, leaf breaking out along the ridge and ivy creeping over the panes.
    // Mossy beds, a pool, a small tree and hanging baskets inside; outside, a planted border, cold frames, urns by the door and stacked pots
    { const c = Wp(GREENW), y0 = 3.4 * S;
      addThing('Greenward Conservatory', '🌱', c, 1, 30, g => { const k = kit(g); k.B(74, 7, 50, stoneM, 0, -1.9, 0); k.B(70, .4, 46, mossD, 0, 1.7, 0); for (let i = 0; i < 3; i++) k.B(12 - i * 1.5, 1.2, 2, stoneM, 0, 1 - i * .9, 26 + i * 2);
        for (let i = 0; i < 6; i++) { const x = -30 + i * 12; M(g, new THREE.TorusGeometry(20, 1.3, 6, 18, Math.PI), barkM, x, 2, 0, { ry: Math.PI / 2 }); for (const sz of [-1, 1]) { rod(g, barkM, [x + (wr() - .5) * 3, 0, sz * 22.5], [x, 9, sz * 19.6], 2.6, 1.4); for (let q = 0; q < 3; q++) rod(g, barkM, [x + (q - 1) * 5, -1, sz * (24 + 3 * wr())], [x, 3.5, sz * 20.5], .5, 1); rod(g, barkM, [x, 12, sz * 17], [x + (wr() - .5) * 6, 17, sz * 23], .7, .25, 5); clump(g, x, 17.6, sz * 23.4, 2.2, 2); }
          clump(g, x, 23.5, 0, 4.4, 3); if (i % 2) { rod(g, mossD, [x, 21.5, 3], [x, 10 + 4 * wr(), 3], .16, .1, 4); NS(k.S(1, litO, x, 13, -4)); rod(g, timber, [x, 21.6, -4], [x, 13.6, -4], .1, .1, 4); } else { rod(g, timber, [x, 21, 8], [x, 15, 8], .1, .1, 4); M(g, new THREE.SphereGeometry(1.8, 8, 6), moss, x, 14, 8, { sy: .8 }); for (let q = 0; q < 3; q++) rod(g, mossD, [x + (q - 1) * .8, 13, 8], [x + (q - 1) * 1.4, 9 + wr() * 2, 8.4], .14, .08, 4); } }
        rod(g, barkM, [-32, 22, 0], [32, 22, 0], 1.2, 1.2); NS(M(g, new THREE.CylinderGeometry(19.6, 19.6, 60, 20, 1, true, 0, Math.PI), glassW, 0, 2, 0, { rz: Math.PI / 2 })); for (const sx of [-1, 1]) NS(M(g, new THREE.CircleGeometry(19.6, 18, 0, Math.PI), glassW, sx * 30, 2, 0, { ry: Math.PI / 2 }));
        for (let i = 0; i < 18; i++) { const ph = (wr() - .5) * 2.5, x = (wr() - .5) * 56; M(g, new THREE.IcosahedronGeometry(1.4 + 1.5 * wr(), 0), leaf[i % 3], x, 2 + Math.cos(ph) * 19.9, Math.sin(ph) * 19.9, { sy: .35 }); }                                         // ivy on the glass
        for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) { k.B(14, 2.4, 6, timber, -18 + i * 18, 2.8, sz * 9); k.B(13.2, .5, 5.2, mossD, -18 + i * 18, 4.1, sz * 9); clump(g, -18 + i * 18, 5.6, sz * 9, 2.6, 4); fern(g, -22 + i * 18, 4.2, sz * 9, .5); M(g, new THREE.IcosahedronGeometry(.7, 0), pinkM, -14 + i * 18, 6, sz * 10); }
        NS(k.C(5, 5, .4, 16, waterGlass(0x6fc8a8, .7), 0, 1.9, 0)); k.T(5.2, .5, stoneM, 0, 1.9, 0, { rx: Math.PI / 2 }); pad(g, 1.5, 2.2, 1, 1.4); pad(g, -2, 2.2, -1.5, 1.1); rod(g, barkM, [24, 1.6, -10], [24.6, 10, -9.4], .9, .5, 5); clump(g, 24.6, 11.4, -9.4, 3, 4); k.B(10, 3.4, 3, plank, -24, 3.3, -13); for (let i = 0; i < 4; i++) k.C(.8, .6, 1.4, 8, terra, -27.6 + i * 2.4, 5.7, -13);
        for (const sx of [-1, 1]) { rod(g, barkM, [sx * 5, 1.6, 21], [sx * 1.2, 13, 20], 1.3, .8); k.C(2.2, 1.5, 3.6, 10, terra, sx * 9, 3.4, 22.6); clump(g, sx * 9, 6.2, 22.6, 1.8, 3); } clump(g, 0, 13.6, 20, 2.4, 3); k.B(6.4, 9, .6, plankD, 0, 6.1, 19.9); NS(k.B(2.4, 3, .3, litO, 0, 8, 20.3));       // the door, on the south side, between two urns
        for (let i = 0; i < 22; i++) { const x = -36 + i * 3.4, z = (i % 2 ? 1 : -1) * (27 + 3 * wr()); if (Math.abs(x) < 9 && z > 0) continue; (i % 3 === 0 ? tuft : i % 3 === 1 ? fern : (gg, a, b, d) => { M(gg, new THREE.SphereGeometry(1.8 + wr(), 7, 5), leaf[i % 3], a, b + 1.2, d, { sy: .7 }); M(gg, new THREE.IcosahedronGeometry(.6, 0), pinkM, a + .8, b + 2.6, d); })(g, x, 0, z, .7); }   // the border
        for (let i = 0; i < 3; i++) { const z = -14 + i * 12; k.B(9, 1.8, 6, timber, 43, .9, z); NS(k.B(8.4, .3, 5.6, glassW, 43, 2.5, z, { rz: -.18 })); clump(g, 43, 1.8, z, 1.6, 3); } for (let i = 0; i < 6; i++) k.C(1.3 - (i > 3 ? .3 : 0), 1, 2, 8, terra, -41 - (i % 2) * 2.6, 1 + Math.floor(i / 4) * 2, 6 + (i % 4) * 2.8); k.C(2.4, 2.2, 5, 10, plankD, -40, 2.5, -14);
      }, { y: y0, hexes: [[22, 32]], top: 44, view: 420 });
      for (const x of [-18, 6, 30]) lanternPts.push([c[0] + x, y0 + 13, c[1] - 4, { c: [2.6, 1.7, .7], size: 9, drift: .3, speed: .5 }]); }

    // Boneroot Causeway (21,33 21,34 21,35): the raised path from the Greenward down to the Sporewind - packed bone laid on a bed of roots, with the ribcages of four enormous dead things arching over it
    { const HX = [[21, 33], [21, 34], [21, 35]], c = hexW(21, 34), gA = Wp(GREENW), sA = Wp(SPOREW), pts = [[gA[0] - 14, gA[1] + 30], hexW(21, 33), hexW(21, 34), hexW(21, 35), [sA[0] - 22, sA[1] - 26]], Y = 11;
      addThing('Boneroot Causeway', '🦴', c, 1, 30, g => { const bA = tx(solid(0xddd6c0, .75), 'rock'), bB = tx(solid(0xc4ba9e, .8), 'rock'), bC = tx(solid(0x9f9577, .85), 'rock'), pit = solid(0x14110c, 1), bm = [bA, bB, bA, bC, bB], P = (p, y) => [p[0] - c[0], y, p[1] - c[1]];
        // a long bone: a shaft with a pair of knuckles at each end
        const bone = (mat, a, b, r) => { rod(g, mat, a, b, r * .72, r * .72, 6); let px = -(b[2] - a[2]), pz = b[0] - a[0]; const pl = Math.hypot(px, pz); if (pl < 1e-3) { px = 1; pz = 0; } else { px /= pl; pz /= pl; }
          for (const e of [a, b]) for (const sd of [-1, 1]) M(g, new THREE.SphereGeometry(r * 1.05, 6, 4), mat, e[0] + px * sd * r * .6, e[1], e[2] + pz * sd * r * .6); };
        // the skull of some horned beast, facing along its own +x
        const skull = (x, y, z, sz, ry) => { const sk = new THREE.Group(); M(sk, new THREE.SphereGeometry(1, 9, 7), bA, 0, .95 * sz, 0, { sx: 1.15 * sz, sy: .95 * sz, sz: .95 * sz }); M(sk, new THREE.BoxGeometry(1.25 * sz, .62 * sz, .78 * sz), bA, 1.15 * sz, .62 * sz, 0); M(sk, new THREE.BoxGeometry(1.0 * sz, .16 * sz, .6 * sz), bB, 1.1 * sz, .12 * sz, 0, { rz: -.12 });
          for (const sd of [-1, 1]) { M(sk, new THREE.SphereGeometry(.3 * sz, 7, 5), pit, .72 * sz, 1.02 * sz, sd * .52 * sz); M(sk, new THREE.ConeGeometry(.2 * sz, 1.5 * sz, 5), bB, -.5 * sz, 1.75 * sz, sd * .6 * sz, { rz: .5, rx: sd * .5 }); for (let i = 0; i < 5; i++) M(sk, new THREE.ConeGeometry(.08 * sz, .3 * sz, 4), bA, (.75 + i * .22) * sz, .26 * sz, sd * .3 * sz, { rz: Math.PI }); }
          sk.position.set(x, y, z); sk.rotation.y = ry; fold(g, sk); };
        const prevTop = [null, null]; let posts = 0;
        for (let i = 0; i + 1 < pts.length; i++) { const A = pts[i], B = pts[i + 1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux, ry = -Math.atan2(uz, ux), at = (d, o) => [A[0] + ux * d + nx * o, A[1] + uz * d + nz * o];
          for (let d = 0; d < L; d += 2.25) { const hw = 6.3 + 1.1 * wr() + (wr() < .12 ? 2.2 : 0), skw = (wr() - .5) * 1.6, yy = Y + (wr() - .5) * .5; bone(bm[Math.floor(wr() * 5)], P(at(d + skw, -hw), yy), P(at(d - skw, hw), yy), 1.05 + .2 * wr()); }      // the deck: long bones laid side by side across the way, their knuckles out at both edges
          for (const o of [-4.4, 4.4]) for (let d = 0; d < L; d += 30) bone(bC, P(at(d, o), Y - 2.5), P(at(Math.min(d + 30, L), o), Y - 2.5), 2.3);                                                                                                     // carried on two runs of thigh-bones from something vast
          for (let d = 8; d < L; d += 30) for (const sd of [-1, 1]) { const top = at(d, sd * 4.6), ft = at(d + (wr() - .5) * 8, sd * (11 + 5 * wr())), gy = Math.min(heightAt(ft[0], ft[1]), 0) - 3; bone(bB, P(top, Y - 3.4), P(ft, gy), 1.9);                 // and standing on splayed leg-bones sunk in the mire,
            const rt = at(d + (wr() - .5) * 14, sd * (17 + 6 * wr())); rod(g, barkM, [(top[0] + ft[0]) / 2 - c[0], (Y - 3.4 + gy) / 2, (top[1] + ft[1]) / 2 - c[1]], [rt[0] - c[0], Math.min(heightAt(rt[0], rt[1]), 0) - 4, rt[1] - c[1]], 1.1, .4, 5); }   // each with a root grown round it
          for (let d = 3; d < L; d += 7.5) { for (const sd of [-1, 1]) { const b0 = P(at(d, sd * 7.2), Y + .4), tp = P(at(d, sd * 7.5), Y + 6.2), k2 = sd > 0 ? 1 : 0; bone(bB, b0, tp, .55); if (prevTop[k2]) bone(bA, prevTop[k2], tp, .4); prevTop[k2] = tp;            // a rail of thin bones lashed from post to post,
              if (posts % 4 === (sd > 0 ? 0 : 2)) skull(tp[0], tp[1] + .2, tp[2], 1.5, ry + (sd > 0 ? -Math.PI / 2 : Math.PI / 2)); } posts++; } }                                                                                                       // a small skull set on every few
        for (const [pt, nb, sd] of [[pts[0], pts[1], 1], [pts[4], pts[3], -1]]) { const a = Math.atan2(nb[1] - pt[1], nb[0] - pt[0]), ox = -Math.sin(a) * 15 * sd, oz = Math.cos(a) * 15 * sd; skull(pt[0] + ox - c[0], Math.max(heightAt(pt[0] + ox, pt[1] + oz), 0) + .5, pt[1] + oz - c[1], 5.5, -a + Math.PI); }   // and a great one at each end, looking out along the way
        for (let i = 0; i < 4; i++) { const f = (i + .5) / 4 * 3, j = Math.min(Math.floor(f) + 0, 3), A = pts[j === 0 ? 1 : j], B = pts[(j === 0 ? 1 : j) + 1] || pts[4], t = f - Math.floor(f), mx = lerp(A[0], B[0], t) - c[0], mz = lerp(A[1], B[1], t) - c[1], ry = -Math.atan2(B[1] - A[1], B[0] - A[0]), Rr = 24 + (i % 2) * 7, cage = new THREE.Group();
          for (let q = 0; q < 8; q++) { const xx = (q - 3.5) * 5.6, sc2 = 1 - .07 * Math.abs(q - 3.5); M(cage, new THREE.TorusGeometry(Rr * sc2, 1.3, 5, 16, Math.PI), boneM, xx, 0, 0, { ry: Math.PI / 2, rz: 0 }); M(cage, new THREE.SphereGeometry(2.6, 7, 5), boneM, xx, Rr * sc2 + .6, 0, { sx: 1.25 }); }
          M(cage, new THREE.CylinderGeometry(1.8, 1.8, 46, 7), boneM, 0, Rr + .4, 0, { rz: Math.PI / 2 }); cage.position.set(mx, Y - 6, mz); cage.rotation.y = ry; fold(g, cage); }
      }, { y: 0, hexes: HX, top: 60, view: 620 });
      for (const [f, sd] of [[.3, 81], [.7, 82]]) { const m = mist({ n: 90, seed: sd, r0: 8, r1: 70, y0: 4, y1: 18, spin: .04, rise: 0, size: 24, alpha: .1, col: [.55, .7, .55] }); m.position.set(lerp(pts[1][0], pts[3][0], f), 0, lerp(pts[1][1], pts[3][1], f)); scene.add(m); } }

    // Sporewind Conservatory (22,35): a glass dome on a buttressed stone ring, with a vine-tree far too big for it grown up through the roof - glass broken round the trunk, creeper wound up it, vines let down over the dome.
    // Giant mushrooms glow under the glass and have spread outside it too; spores drift out of the top
    { const c = Wp(SPOREW), y0 = 3.4 * S, cap = [glowM(0xff8a3a, 1.1), glowM(0xb070ff, 1.1), glowM(0x7affc0, 1.0)], gill = solid(0x3a2a22, 1);
      addThing('Sporewind Conservatory', '🍄', c, 1, 30, g => { const k = kit(g), brass = new THREE.MeshStandardMaterial({ color: 0x7a8a4a, roughness: .4, metalness: .6 });
        k.C(32, 34, 7, 28, stoneM, 0, .5, 0); k.C(30, 30, .5, 28, mossD, 0, 4.1, 0); for (let i = 0; i < 12; i++) { const a = i * .5236 + .26; if (Math.abs(a - 1.571) < .3) continue; k.B(3.4, 9, 4.4, stoneM, Math.cos(a) * 33.4, 2.5, Math.sin(a) * 33.4, { ry: -a }); M(g, new THREE.SphereGeometry(2.4, 7, 5), moss, Math.cos(a) * 33.4, 7, Math.sin(a) * 33.4, { sy: .5 }); }
        NS(M(g, new THREE.SphereGeometry(30, 28, 12, 0, Math.PI * 2, 0, 1.25), glassW, 0, 4, 0)); for (let i = 0; i < 8; i++) M(g, new THREE.TorusGeometry(30.2, .45, 5, 16, Math.PI), brass, 0, 4, 0, { ry: i * .3927 }); for (const [pa, rr] of [[.5, 0], [.9, 0]]) k.T(30.2 * Math.sin(pa + .35), .35, brass, 0, 4 + 30.2 * Math.cos(pa + .35), 0, { rx: Math.PI / 2 }); k.T(9.6, .7, brass, 0, 32.6, 0, { rx: Math.PI / 2 });
        for (let i = 0; i < 9; i++) { const a = i * .7; M(g, new THREE.ConeGeometry(1.6, 5 + 3 * wr(), 3), glassW, Math.cos(a) * (9 + wr() * 2), 34 + wr() * 2, Math.sin(a) * (9 + wr() * 2), { rz: -Math.cos(a) * .7, rx: Math.sin(a) * .7 }); }                                               // broken panes round the trunk
        rod(g, barkM, [0, 4, 0], [2, 40, 1], 6, 3.4, 9); rod(g, barkM, [2, 40, 1], [-1, 66, -1], 3.4, 2, 8); for (let i = 0; i < 7; i++) { const a = i * .9; rod(g, barkM, [Math.cos(a) * 12, 3.6, Math.sin(a) * 12], [Math.cos(a) * 3.4, 12, Math.sin(a) * 3.4], 1, 2.2, 5); }
        for (let i = 0; i < 26; i++) { const a = i * .55, y = 6 + i * 2.2, rr = 6.4 - i * .12, p = [Math.cos(a) * rr + y * .05, y, Math.sin(a) * rr], q = [Math.cos(a + .55) * (rr - .12) + (y + 2.2) * .05, y + 2.2, Math.sin(a + .55) * (rr - .12)]; rod(g, mossD, p, q, .45, .45, 4); if (i % 2) M(g, new THREE.IcosahedronGeometry(1.1, 0), leaf[i % 3], p[0] * 1.15, y, p[2] * 1.15, { sy: .5 }); if (i % 7 === 3) M(g, new THREE.CylinderGeometry(3, 2, .8, 8), solid(0xc8b89a, .9), p[0] * 1.3, y + 20, p[2] * 1.3); }   // creeper wound up the trunk, and shelf fungus above
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + .3, e = [Math.cos(a) * 20, 62 + 8 * wr(), Math.sin(a) * 20]; rod(g, barkM, [0, 50 + i * 2, 0], e, 1.5, .6, 5); clump(g, e[0], e[1] + 2, e[2], 7, 4); for (let q = 0; q < 5; q++) { const vx = e[0] + (wr() - .5) * 10, vz = e[2] + (wr() - .5) * 10, vr = Math.hypot(vx, vz), yd = 4 + Math.sqrt(Math.max(900 - vr * vr, 0)) + 1; rod(g, mossD, [vx, e[1], vz], [vx * 1.04, Math.max(yd, e[1] - 34), vz * 1.04], .2, .1, 4); } } clump(g, 0, 72, 0, 8, 5);
        for (let i = 0; i < 11; i++) { const a = i * .57 + .2, d = 11 + (i % 3) * 6, hh = 6 + (i * 5) % 10, x = Math.cos(a) * d, z = Math.sin(a) * d, r = 3.2 + (i % 3); rod(g, stemM, [x, 4, z], [x + (wr() - .5) * 2, 4 + hh, z + (wr() - .5) * 2], 1.3, .9); NS(M(g, new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap[i % 3], x, 4 + hh - .4, z, { sy: .6 })); M(g, new THREE.CylinderGeometry(r * .96, r * .4, .5, 12), gill, x, 4 + hh - .6, z); if (i % 2) shroom(g, x + 2.4, 4, z + 1.6, 2.4, 1.2, cap[(i + 1) % 3]); }
        for (let i = 0; i < 7; i++) { const a = [.4, .9, 2.3, 2.9, 3.6, 4.6, 5.6][i], d = 38 + (i % 3) * 4; shroom(g, Math.cos(a) * d, -.6, Math.sin(a) * d, 5 + (i * 3) % 6, 3 + (i % 3), cap[i % 3]); shroom(g, Math.cos(a) * d + 3, -.6, Math.sin(a) * d - 2, 2.6, 1.3, cap[(i + 2) % 3]); fern(g, Math.cos(a + .2) * (d + 4), -.6, Math.sin(a + .2) * (d + 4), .6); }
        for (const sx of [-1, 1]) k.B(2.6, 13, 3.4, stoneM, sx * 5.6, 4.5, 32.4); M(g, new THREE.TorusGeometry(5.6, 1.3, 5, 12, Math.PI), stoneM, 0, 11, 32.4); k.B(8.6, 11, .7, plankD, 0, 5.5, 31.6); NS(M(g, new THREE.CircleGeometry(1.5, 12), litG, 0, 8.6, 32.1)); k.T(1.6, .25, timber, 0, 8.6, 32.1); for (let i = 0; i < 3; i++) k.B(11 - i * 1.4, 1.2, 2.2, stoneM, 0, 1.4 - i * 1.1, 35 + i * 2);     // an arched stone porch and a plank door with a port in it
      }, { y: y0, hexes: [[22, 35]], top: 96, view: 460 });
      const sp = mist({ n: 120, seed: 83, r0: 4, r1: 46, y0: 34, y1: 96, spin: .12, rise: .25, twist: 1.2, size: 3.6, alpha: .7, col: [1.5, 2, .6], add: true }); sp.position.set(c[0], y0, c[1]); scene.add(sp);
      lanternPts.push([c[0], y0 + 14, c[1], { c: [1.6, 2.2, 1], size: 26, drift: .3, speed: .4 }]); }

    // Central boardwalk (24,35 23,36 22,37 21,37): rickety planking on stilts over the dark water, from under Widdershins Hall out to the island Willowdusk stands on; green lanterns on its taller posts, a few boards gone
    { const HX = [[24, 35], [23, 36], [22, 37], [21, 37]], c = hexW(23, 36), wd = Wp(WIDD), wl = Wp(WILLOW), pts = [[wd[0] + 20, wd[1] + 150], hexW(24, 35), hexW(23, 36), hexW(22, 37), hexW(21, 37), [wl[0] + 16, wl[1] - 30]];
      addThing('Central boardwalk', '🪵', c, 1, 30, g => { deck(g, c, pts, { y: 10, w: 9, post: 9, rope: true, miss: .07, lamp: (gg, x, y, z, wx, wz) => { M(gg, new THREE.BoxGeometry(2.2, 2.8, 2.2), timber, x, y + .6, z); NS(M(gg, new THREE.SphereGeometry(1.1, 8, 6), litG, x, y + .6, z)); lanternPts.push([wx, y + .8, wz, { c: [1.2, 2.4, .8], size: 9, drift: .3, speed: .8 }]); } });
        for (let i = 0; i + 1 < pts.length; i++) { const A = pts[i], B = pts[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L; for (let d = 4; d < L; d += 5.5) { const sd = wr() < .5 ? -1 : 1, of = 7 + 11 * wr(), x = A[0] + ux * d - uz * sd * of, z = A[1] + uz * d + ux * sd * of, gy = heightAt(x, z), kd = wr();
            if (gy < -.4) { if (kd < .55) pad(g, x - c[0], .3, z - c[1], 1.2 + wr()); else if (kd < .7) M(g, new THREE.IcosahedronGeometry(.7, 0), pinkM, x - c[0], .7, z - c[1]); else reeds(g, x - c[0], 0, z - c[1], 2, 4); } else if (kd < .4) reeds(g, x - c[0], Math.max(gy, 0), z - c[1], 2.6, 5); else if (kd < .7) fern(g, x - c[0], Math.max(gy, 0), z - c[1], .7); else tuft(g, x - c[0], Math.max(gy, 0), z - c[1]);
            if (d % 22 < 5.5) { const px = A[0] + ux * d - uz * sd * 4.2 - c[0], pz = A[1] + uz * d + ux * sd * 4.2 - c[1]; M(g, new THREE.SphereGeometry(1.1, 6, 5), moss, px, 9.6, pz, { sy: .5 }); NS(M(g, new THREE.ConeGeometry(.35, 2.6, 4), mossD, px, 7.6, pz, { rx: Math.PI })); } } }                    // pads and reeds in the water beside it, growth where it crosses land, moss on the boards
        { const p = pts[2], x = p[0] - c[0], z = p[1] - c[1]; rod(g, timber, [x + 3, 10.4, z + 3], [x + 15, 19, z + 9], .22, .1, 4); rod(g, rope, [x + 15, 19, z + 9], [x + 15.4, 1, z + 9.4], .05, .05, 3); rod(g, timber, [x - 2, 10.4, z + 3.4], [x - 9, 20, z + 12], .22, .1, 4); M(g, new THREE.BoxGeometry(3.4, 2.6, 3.4), plankD, x + 1.6, 11.6, z - 2.6, { ry: .3 }); M(g, new THREE.BoxGeometry(2.6, 2, 2.6), plank, x + 1.4, 13.9, z - 2.4, { ry: -.2 }); M(g, new THREE.CylinderGeometry(1.5, 1.2, 2.4, 9, 1, true), rope, x - 2.6, 11.5, z - 2.6); }   // fishing rods left propped, crates, a basket
        for (const [i, sd] of [[1, 1], [3, -1]]) { const p = pts[i], q = pts[i + 1], ux = (q[0] - p[0]), uz = (q[1] - p[1]), l = Math.hypot(ux, uz), nx = -uz / l * sd, nz = ux / l * sd, x = (p[0] + q[0]) / 2 + nx * 9 - c[0], z = (p[1] + q[1]) / 2 + nz * 9 - c[1], ry = -Math.atan2(uz, ux); M(g, new THREE.BoxGeometry(14, .5, 10), plank, x, 10, z, { ry }); M(g, new THREE.BoxGeometry(5, 2.2, 2.2), plankD, x + nx * 2, 11.4, z + nz * 2, { ry }); M(g, new THREE.CylinderGeometry(1.6, 1.6, 3, 8), plankD, x - nx, 11.8, z - nz + 3); }   // two landings with a bench and a barrel
      }, { y: 0, hexes: HX, top: 30, view: 620 }); }

    // Tallowmoss Lantern Walk (18,37 18,38 19,38 20,38): a low boardwalk through thick growth, lit by crook-necked lamp posts with caged lanterns and by the waxy moss itself, which glows yellow-green in clumps along the boards and under them
    { const HX = [[18, 37], [18, 38], [19, 38], [20, 38]], c = hexW(19, 38), wt = Wp(WILT), pts = [[hexW(18, 37)[0], hexW(18, 37)[1] - 50], hexW(18, 37), hexW(18, 38), hexW(19, 38), hexW(20, 38), [wt[0] + 30, wt[1] + 60]], cage = solid(0x8a7030, .5, { metalness: .6 }), mossG = new THREE.MeshStandardMaterial({ color: 0x56682c, emissive: 0xa6cc40, emissiveIntensity: .42, roughness: 1 });
      addThing('Tallowmoss Lantern Walk', '🏮', c, 1, 30, g => { deck(g, c, pts, { y: 8, w: 8, post: 15, lamp: (gg, x, y, z, wx, wz, sd, ux, uz) => { const ix = -uz * sd * -3, iz = ux * sd * -3; M(gg, new THREE.TorusGeometry(2, .35, 5, 10, Math.PI), timber, x + ix * .66, y, z + iz * .66, { ry: -Math.atan2(iz, ix) }); rod(gg, cage, [x + ix * 1.33, y, z + iz * 1.33], [x + ix * 1.33, y - 2, z + iz * 1.33], .1, .1, 4);
            M(gg, new THREE.CylinderGeometry(1, 1.3, 2.8, 6, 1, true), cage, x + ix * 1.33, y - 3.4, z + iz * 1.33); M(gg, new THREE.ConeGeometry(1.5, 1.2, 6), cage, x + ix * 1.33, y - 1.6, z + iz * 1.33); NS(M(gg, new THREE.SphereGeometry(.85, 8, 6), litY, x + ix * 1.33, y - 3.4, z + iz * 1.33)); lanternPts.push([wx + ix * 1.33, y - 3.2, wz + iz * 1.33, { c: [2.2, 2.4, .7], size: 10, drift: .25, speed: 1.1 }]); } });
          for (let i = 0; i + 1 < pts.length; i++) { const A = pts[i], B = pts[i + 1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
            for (let d = 0; d < L; d += 1.25) { const sd = wr() < .5 ? -1 : 1, of = 4.6 + 15 * wr() * wr(), x = A[0] + ux * d + nx * sd * of, z = A[1] + uz * d + nz * sd * of, gy = Math.max(heightAt(x, z), 0), lx = x - c[0], lz = z - c[1], kind = wr(), near = of < 6.2;
              if (kind < .26) { for (let q = 0; q < 3; q++) NS(M(g, new THREE.IcosahedronGeometry(.6 + .8 * wr(), 1), mossG, lx + (wr() - .5) * 2.4, (near ? 8.2 : gy + .4) + wr() * .4, lz + (wr() - .5) * 2.4, { sy: .45 })); if (near) for (let q = 0; q < 2; q++) NS(M(g, new THREE.ConeGeometry(.3, 2.4 + 3.4 * wr(), 4), mossG, lx + (wr() - .5) * 1.6, 6.2, lz + (wr() - .5) * 1.6, { rx: Math.PI })); }                 // waxy moss in cushions, some of it hanging in tags under the boards
              else if (kind < .5) fern(g, lx, gy, lz, .7 + .5 * wr());
              else if (kind < .66) reeds(g, lx, gy, lz, 2.4, 5);
              else if (kind < .78) { M(g, new THREE.SphereGeometry(2.2 + 1.8 * wr(), 7, 5), leaf[Math.floor(wr() * 3)], lx, gy + 1.6, lz, { sy: .7 }); if (wr() < .5) M(g, new THREE.IcosahedronGeometry(.6, 0), pinkM, lx + 1, gy + 3.6, lz + .6); }
              else if (kind < .88) { const hh = 4 + 4 * wr(); for (let q = 0; q < 3; q++) { const a = q * 2.1 + wr(), e = [lx + Math.cos(a) * 2.6, gy + hh * (.7 + .3 * wr()), lz + Math.sin(a) * 2.6]; rod(g, mossD, [lx, gy, lz], e, .3, .2, 4); M(g, new THREE.CircleGeometry(2.6 + wr(), 8), padM, e[0], e[1], e[2], { rx: -Math.PI / 2 + Math.sin(a) * .4, rz: a }); } }                                              // umbrella-leaves
              else if (kind < .94) tuft(g, lx, gy, lz, 1.3);
              else { const hh = 10 + 9 * wr(); rod(g, barkM, [lx, gy - 1, lz], [lx + (wr() - .5) * 2, gy + hh, lz + (wr() - .5) * 2], .9, .5, 5); for (let q = 0; q < 7; q++) { const a = q * .9; M(g, new THREE.ConeGeometry(1.1, 10, 3), leaf[q % 3], lx + Math.cos(a) * 3.8, gy + hh - .6, lz + Math.sin(a) * 3.8, { rz: -Math.cos(a) * 1.25, rx: Math.sin(a) * 1.25 }); } } } }                    // tree-ferns
      }, { y: 0, hexes: HX, top: 34, view: 620 }); }

    // Willowdusk (21,38)      }, { y: 0, hexes: HX, top: 34, view: 620 }); }

    // Willowdusk (21,38): an ancient willow on its own island, smaller than Wiltroot but old as the swamp - a face in its trunk looking south, roots sprawling into the water, and its whole crown hanging down round it in curtains
    { const barkM = solid(0x7a644a, .95, { flatShading: true }), c = Wp(WILLOW), y0 = 3.6 * S, frond = solid(0x7a9a4a, 1, { flatShading: true }), frondD = solid(0x56783a, 1, { flatShading: true }), hollow = solid(0x0c0a08, 1);
      addThing('Willowdusk', '🌳', c, 1, 30, g => { const k = kit(g); rod(g, barkM, [0, 0, 0], [1, 34, 0], 15, 11, 12); rod(g, barkM, [1, 34, 0], [-1, 70, 1], 11, 6.5, 10); k.C(15, 23, 9, 12, barkM, 0, 3.5, 0);
        for (let i = 0; i < 10; i++) { const a = i * .628 + .2, L = 30 + 16 * wr(), w = (wr() - .5) * 14, P = [[10, 12], [18, 5], [L * .65, 2.4], [L, -3]].map(([d, y], j) => [Math.cos(a) * d - Math.sin(a) * w * (j > 1 ? 1 : 0), y, Math.sin(a) * d + Math.cos(a) * w * (j > 1 ? 1 : 0)]); for (let j = 0; j < 3; j++) rod(g, barkM, P[j], P[j + 1], 4 - j * 1.1, 3 - j * 1.1, 6); }                                // roots
        for (const sx of [-1, 1]) { M(g, new THREE.SphereGeometry(3.8, 12, 8), hollow, sx * 6, 41, 11.2, { sy: 1.2, sz: .5, rz: -sx * .25 }); NS(M(g, new THREE.SphereGeometry(1.8, 10, 8), glowM(0xffe6a0, 2.2), sx * 6, 40.6, 12.3)); M(g, new THREE.SphereGeometry(4.6, 8, 6), barkM, sx * 6.4, 47, 11.2, { sy: .3, sz: .8, rz: -sx * .16 }); M(g, new THREE.SphereGeometry(3.4, 8, 6), barkM, sx * 7.4, 35.4, 11, { sy: .5, sz: .6 }); }   // eyes, under heavy brows
        M(g, new THREE.SphereGeometry(3, 8, 6), barkM, 0, 34, 13.4, { sy: 2.1, sz: .9 }); k.T(6.4, .6, hollow, 0, 30.4, 12.6, { rz: -Math.PI / 2 - .95 }, 1.9); for (const sx of [-1, 1]) M(g, new THREE.SphereGeometry(2.6, 8, 6), barkM, sx * 7.6, 28.6, 11.2, { sy: .8, sz: .5 }); for (let i = 0; i < 7; i++) rod(g, mossD, [-6 + i * 2, 21.4, 14], [-6.4 + i * 2.2, 10 + (i * 5) % 7, 15.4], .22, .08, 4); for (const sx of [-1, 1]) rod(g, barkM, [sx * 5.6, 26, 12.6], [sx * 9, 31, 10], 1, .6, 5);                                   // nose, mouth, and the creases beside it
        for (let i = 0; i < 9; i++) { const a = i * .698 + .1, bl = 26 + 14 * wr(), e = [Math.cos(a) * bl, 74 + 10 * wr(), Math.sin(a) * bl], e2 = [e[0] * 1.55, e[1] - 9, e[2] * 1.55]; rod(g, barkM, [Math.cos(a) * 4, 58 + (i % 3) * 5, Math.sin(a) * 4], e, 3, 1.5, 6); rod(g, barkM, e, e2, 1.5, .6, 5); clump(g, e[0], e[1] + 3, e[2], 7, 3);
          const front = Math.sin(a) > .1, hang = (top, hh, q) => { rod(g, frondD, [top[0] + (wr() - .5) * 1.6, top[1] - hh, top[2] + (wr() - .5) * 1.6], top, .1, .3, 4); for (let v = 1; v <= 4; v++) M(g, new THREE.ConeGeometry(.7 + .6 * wr(), hh * (.22 + .1 * wr()), 4), (q + v) % 2 ? frond : frondD, top[0] + (wr() - .5), top[1] - hh * (v / 4.3) - hh * .07, top[2] + (wr() - .5), { rx: Math.PI }); };
          for (let q = 0; q < 10; q++) { const f = q / 9; hang([lerp(e[0], e2[0], f), lerp(e[1], e2[1], f) - lerp(1.3, .5, f), lerp(e[2], e2[2], f)], front ? 9 + 12 * wr() : 40 + 22 * wr(), q); }
          for (let q = 0; q < 6; q++) { const f = .1 + q * .17, sd = q % 2 ? 1 : -1, len = 5 + 5 * wr(), b0 = [lerp(e[0], e2[0], f), lerp(e[1], e2[1], f), lerp(e[2], e2[2], f)], tw = [b0[0] - Math.sin(a) * sd * len, b0[1] - 1 - 2 * wr(), b0[2] + Math.cos(a) * sd * len]; rod(g, barkM, b0, tw, .75, .25, 4); for (const u of [.55, 1]) hang([lerp(b0[0], tw[0], u), lerp(b0[1], tw[1], u) - .2, lerp(b0[2], tw[2], u)], front ? 8 + 10 * wr() : 34 + 24 * wr(), q); } }   // boughs, and the hanging curtains - shorter in front, so the face shows
        clump(g, 0, 80, 0, 11, 6);
        for (let i = 0; i < 16; i++) { const a = i * .393 + .1, r0 = 14.6 + (i % 3) * .3; if (Math.abs(Math.cos(a)) < .5 && Math.sin(a) > 0) continue; rod(g, barkM, [Math.cos(a) * r0, 2, Math.sin(a) * r0], [Math.cos(a + .08) * (r0 - 4.6), 40 + 14 * wr(), Math.sin(a + .08) * (r0 - 4.6)], 1.1, .5, 4); }                     // ridges of bark up the trunk (not across the face)
        for (let i = 0; i < 12; i++) { const a = 2.2 + i * .42, y = 6 + wr() * 50, r0 = 14.6 - y * .12; M(g, new THREE.SphereGeometry(2.4 + 2.6 * wr(), 6, 4), i % 2 ? moss : mossD, Math.cos(a) * r0, y, Math.sin(a) * r0, { sy: .9, sx: .7 }); }                                                                     // moss on the shaded side
        for (let i = 0; i < 7; i++) { const a = 3.4 + i * .5, y = 10 + i * 5.5, r0 = 14.4 - y * .12, r = 2.2 + 2 * wr(); M(g, new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), stemM, Math.cos(a) * (r0 + r * .3), y, Math.sin(a) * (r0 + r * .3), { sy: .3 }); }                               // shelf fungus stepping up one flank
        for (let i = 0; i < 5; i++) { const a = 2.4 + i * .9; M(g, new THREE.SphereGeometry(1.5 + wr(), 7, 5), barkM, Math.cos(a) * (12.4 - i), 16 + i * 8, Math.sin(a) * (12.4 - i), { sy: 1.2 }); }                                                                                                     // knots
        for (let i = 0; i < 14; i++) { const a = i * .45, d = 20 + 12 * wr(), x = Math.cos(a) * d, z = Math.sin(a) * d; if (i % 2) { M(g, new THREE.IcosahedronGeometry(.8, 0), pinkM, x, 2.4, z); M(g, new THREE.SphereGeometry(1.4, 6, 4), leaf[i % 3], x, 1.2, z, { sy: .5 }); } else tuft(g, x, .6, z, .8); }                   // flowers and tufts between the roots
        M(g, new THREE.CylinderGeometry(3.2, 2.4, 1.6, 9), thatch, -3, 71.5, 2); for (let i = 0; i < 3; i++) M(g, new THREE.SphereGeometry(.8, 6, 5), stemM, -3 + (i - 1) * 1.1, 72.5, 2 + (i % 2) * .8, { sy: 1.2 });                                                                                   // a nest in the fork, with eggs in it
      }, { y: y0, hexes: [[21, 38]], top: 104, view: 520 });
      for (let i = 0; i < 6; i++) lanternPts.push([c[0] + Math.cos(i * 1.05) * 38, y0 + 26 + (i * 13) % 34, c[1] + Math.sin(i * 1.05) * 38, { c: [1.2, 2.3, .9], size: 7, drift: 4, speed: .4 }]); for (const sx of [-1, 1]) lanternPts.push([c[0] + sx * 6, y0 + 40.6, c[1] + 13.4, { c: [2.3, 1.9, 1.1], size: 6, drift: 0, speed: .5 }]); }

    // Sallowfen Hollow (23,37): somebody's home, made in the hollow stump of a tree that must once have rivalled Wiltroot. A flared, ridged stump with a splintered rim; a round-topped door under a little shingled hood; framed round windows;
    // a crooked stovepipe; roots running off into the fen; moss, shelf fungus and red toadstools all over it; a woodpile, a bench and stepping stones up to the door
    { const c = Wp(SALLOW), y0 = 3.2 * S, rot = solid(0x8a7250, 1, { side: THREE.DoubleSide }), rotD = solid(0x644e36, 1, { flatShading: true }), win = glowM(0xffd9a0, 1.5), shelf = solid(0xc8b89a, .9);
      addThing('Sallowfen Hollow', '🕳️', c, 1, 30, g => { const k = kit(g), prof = [[21, 0], [17.5, 3], [15.4, 8], [14.4, 16], [13.6, 24], [13, 27]].map(p => new THREE.Vector2(p[0], p[1])); M(g, new THREE.LatheGeometry(prof, 20), rot, 0, 0, 0); k.C(12.6, 12.6, .5, 18, solid(0x15110c, 1), 0, 25.4, 0);
        for (let i = 0; i < 18; i++) { const a = i * .349 + wr() * .1, r0 = 17.2, r1 = 13.4; if (Math.abs(a - 1.571) > .34) rod(g, rotD, [Math.cos(a) * r0, 2, Math.sin(a) * r0], [Math.cos(a + .08) * r1, 24, Math.sin(a + .08) * r1], .9, .6, 4); const hh = 3 + ((i * 37) % 11) + (i % 5 === 0 ? 7 : 0); M(g, new THREE.ConeGeometry(2.4, hh, 4), rotD, Math.cos(a) * 13, 27 + hh / 2 - 1, Math.sin(a) * 13, { rz: -Math.cos(a) * .12, rx: Math.sin(a) * .12 }); }      // bark ridges, and the splintered rim
        for (let i = 0; i < 9; i++) { const a = i * .7 + .3, L = 26 + 12 * wr(), w = (wr() - .5) * 10, P = [[15, 6], [21, 1.6], [L, -3]].map(([d, y], j) => [Math.cos(a) * d - Math.sin(a) * w * (j === 2 ? 1 : 0), y, Math.sin(a) * d + Math.cos(a) * w * (j === 2 ? 1 : 0)]); if (Math.abs(a - 1.571) < .5) continue; rod(g, rotD, P[0], P[1], 3, 2.2, 5); rod(g, rotD, P[1], P[2], 2.2, .7, 5); }
        for (const sx of [-1, 1]) k.B(1.2, 11, 1.4, timber, sx * 3.6, 5.5, 17.6); M(g, new THREE.TorusGeometry(3.6, .7, 5, 10, Math.PI), timber, 0, 11, 17.6); k.B(6, 10, .6, plankD, .6, 5.4, 17.2, { ry: -.3 }); M(g, new THREE.CylinderGeometry(3.1, 3.1, .6, 10, 1, false, 0, Math.PI), plankD, .6, 10.4, 17.2, { rx: Math.PI / 2, rz: Math.PI / 2, ry: 0 }); NS(k.B(3, 9, .3, win, -1.4, 5, 16.6)); NS(k.S(.45, litO, 2.8, 5.6, 18.2));
        k.B(11, .7, 6, plankD, 0, 14.2, 19.4, { rx: .5 }); for (const sx of [-1, 1]) rod(g, timber, [sx * 5, 9.4, 17.6], [sx * 5, 13, 21.4], .3, .3, 4); NS(k.S(.8, litO, -5.2, 9.6, 19.6)); rod(g, timber, [-5.2, 12.4, 19.6], [-5.2, 10.2, 19.6], .08, .08, 4);                               // a hood over the door, and a lamp hung from it
        for (const [th, yy] of [[.75, 12], [2.55, 15], [4.9, 11]]) { const x = Math.cos(th) * 15.2, z = Math.sin(th) * 15.2; NS(M(g, new THREE.CircleGeometry(1.9, 12), win, x, yy, z, { ry: -th + Math.PI / 2 })); M(g, new THREE.TorusGeometry(2, .4, 5, 12), timber, x, yy, z, { ry: -th + Math.PI / 2 }); k.B(4.2, .3, .3, timber, x, yy, z, { ry: -th }); }
        rod(g, stoneM, [-6, 24, -5], [-8, 33, -6], 1, .9, 6); rod(g, stoneM, [-8, 33, -6], [-7, 38, -6], .9, .9, 6); M(g, new THREE.ConeGeometry(1.8, 1.6, 8), stoneM, -7, 39, -6);
        for (let i = 0; i < 7; i++) { const a = i * .9 + .6, yy = 5 + (i * 5) % 16, rr = 16.6 - yy * .12; if (Math.abs(a % 6.283 - 1.571) < .45) continue; M(g, new THREE.CylinderGeometry(3.6 - (i % 3) * .7, 2.2, .9, 8), shelf, Math.cos(a) * rr, yy, Math.sin(a) * rr); M(g, new THREE.SphereGeometry(3 + wr() * 2, 7, 5), moss, Math.cos(a + .4) * (rr - 1), yy + 6, Math.sin(a + .4) * (rr - 1), { sy: .5 }); }
        for (let i = 0; i < 5; i++) M(g, new THREE.SphereGeometry(3 + wr() * 2, 7, 5), i % 2 ? moss : mossD, Math.cos(i * 1.3) * 9, 26, Math.sin(i * 1.3) * 9, { sy: .45 });
        for (let i = 0; i < 9; i++) { const a = i * .7 + .2, d = 21 + (i % 3) * 5; if (Math.abs(a - 1.571) < .35) continue; (i % 3 ? shroom(g, Math.cos(a) * d, 0, Math.sin(a) * d, 2 + wr() * 2.4, 1 + wr(), capR) : fern(g, Math.cos(a) * d, 0, Math.sin(a) * d, .7)); tuft(g, Math.cos(a + .3) * (d + 3), 0, Math.sin(a + .3) * (d + 3)); }
        for (let i = 0; i < 4; i++) k.C(1.6, 1.8, .5, 7, stoneM, Math.sin(i * .7) * 2, .3, 22 + i * 4); k.B(7, .6, 2, plank, 10, 2.4, 20, { ry: .5 }); for (const sx of [-1, 1]) k.B(.6, 2.2, 1.6, timber, 10 + sx * 2.6, 1.1, 20 - sx * 1.4, { ry: .5 }); for (let i = 0; i < 9; i++) k.C(.7, .7, 5, 6, rotD, -12 - (i % 3) * 1.5 + Math.floor(i / 3) * .75, .8 + Math.floor(i / 3) * 1.3, 19, { rx: Math.PI / 2 });
      }, { y: y0, hexes: [[23, 37]], top: 48, view: 340 }); chimneys.push([c[0] - 7, y0 + 40, c[1] - 6]);
      lanternPts.push([c[0] - 5.2, y0 + 9.6, c[1] + 19.6, { c: [2.6, 1.6, .6], size: 8, drift: .2, speed: .7 }]); }

    // Bitterroot Knowl (24,37): a grassy knoll crowned by a wind-bent dead tree inside a ring of leaning, mossed stones. The bitterroot grows all over it - low rosettes with pink flowers hugging the turf - and its pale roots break the surface here and there and run along it
    { const c = Wp(BITTER), y0 = heightAt(c[0], c[1]), root = solid(0xc2b592, .9), rosette = solid(0x4a5a3a, 1, { flatShading: true }), gh = (x, z) => heightAt(c[0] + x, c[1] + z) - y0;
      addThing('Bitterroot Knowl', '🌿', c, 1, 30, g => { rod(g, barkM, [0, -1, 0], [4, 15, -1], 3, 2, 7); rod(g, barkM, [4, 15, -1], [10, 27, 1], 2, 1, 6); rod(g, barkM, [10, 27, 1], [19, 33, 4], 1, .25, 5); for (const [a, b, r] of [[[3, 12, -1], [-7, 22, -4], 1.3], [[-7, 22, -4], [-13, 25, -2], .6], [[-7, 22, -4], [-8, 30, -8], .5], [[7, 21, 0], [6, 31, -5], .8], [[10, 27, 1], [14, 36, -2], .5], [[14, 30, 2.4], [20, 29, 9], .4], [[2, 8, 0], [9, 12, 6], .7]]) rod(g, barkM, a, b, r, r * .35, 5); for (let i = 0; i < 5; i++) rod(g, barkM, [Math.cos(i * 1.3) * 2, 1, Math.sin(i * 1.3) * 2], [Math.cos(i * 1.3) * 9, gh(Math.cos(i * 1.3) * 9, Math.sin(i * 1.3) * 9) - .6, Math.sin(i * 1.3) * 9], 1.3, .4, 5);
        for (let i = 0; i < 7; i++) { const a = i * .9 + .3, d = 15 + (i % 2) * 2, x = Math.cos(a) * d, z = Math.sin(a) * d, hh = 7 + (i * 5) % 7; M(g, new THREE.BoxGeometry(3.4, hh, 2.2), stoneM, x, gh(x, z) + hh / 2 - 1, z, { ry: -a, rz: (wr() - .5) * .4, rx: (wr() - .5) * .3 }); M(g, new THREE.SphereGeometry(2, 7, 5), moss, x, gh(x, z) + hh - .6, z, { sy: .4 }); }
        for (let i = 0; i < 46; i++) { const a = i * 2.4, d = 6 + (i * 11) % 44, x = Math.cos(a) * d, z = Math.sin(a) * d, y = gh(x, z); for (let q = 0; q < 6; q++) { const b = q * 1.05 + i; M(g, new THREE.ConeGeometry(.35, 2.6, 3), rosette, x + Math.cos(b) * 1.1, y + .5, z + Math.sin(b) * 1.1, { rz: -Math.cos(b) * 1.25, rx: Math.sin(b) * 1.25 }); } for (let q = 0; q < 1 + i % 3; q++) { M(g, new THREE.IcosahedronGeometry(.75, 0), pinkM, x + (q - 1) * .9, y + 1.1, z + (q % 2) * .8, { sy: .6 }); } }
        for (let i = 0; i < 12; i++) { const a = i * .55 + .2, d = 10 + (i * 7) % 26; let p = [Math.cos(a) * d, 0, Math.sin(a) * d]; p[1] = gh(p[0], p[2]) - .5; for (let q = 0; q < 4; q++) { const a2 = a + (wr() - .5) * 1.6, n2 = [p[0] + Math.cos(a2) * 5, 0, p[2] + Math.sin(a2) * 5]; n2[1] = gh(n2[0], n2[2]) + (q === 3 ? -.8 : .5 + wr() * .7); rod(g, root, p, n2, .8 - q * .16, .65 - q * .16, 5); p = n2; } }
        for (let i = 0; i < 34; i++) { const a = wr() * 6.283, d = 6 + wr() * 44, x = Math.cos(a) * d, z = Math.sin(a) * d; if (i % 5) tuft(g, x, gh(x, z) - .2, z, .8 + wr() * .5); else rock(g, x, gh(x, z), z, 1.4 + wr() * 1.8); }
      }, { y: y0, hexes: [[24, 37]], top: 44, view: 340 }); }

    // Silverleech Pools (22,39): a patch of marsh pocked with still pools, no two the same shape, each with a skin on it like quicksilver. Tussocks and stones at their edges, reeds, lily pads, a rotten log across one - and the leeches, silver and arm-long, working slowly round
    { const c = Wp(SLEECH), y0 = 1.0 * S, silver = new THREE.MeshStandardMaterial({ color: 0x6a7278, roughness: .16, metalness: .9, envMapIntensity: 1 }), mudM = solid(0x2a2a20, 1), pools = [[0, 0, 15], [-27, 9, 10], [25, -13, 11], [7, 29, 9], [-13, -27, 8], [31, 18, 6], [-34, -14, 5]], lee = [];
      addThing('Silverleech Pools', '🪱', c, 1, 30, g => { pools.forEach(([x, z, r], pi) => { const rad = a => r * (1 + .22 * Math.sin(a * 2 + pi) + .14 * Math.sin(a * 3 + pi * 2.3) + .08 * Math.sin(a * 5 + pi)), sh = new THREE.Shape(), sh2 = new THREE.Shape(); for (let i = 0; i <= 28; i++) { const a = i / 28 * 6.283; (i ? sh.lineTo : sh.moveTo).call(sh, Math.cos(a) * rad(a), Math.sin(a) * rad(a)); (i ? sh2.lineTo : sh2.moveTo).call(sh2, Math.cos(a) * (rad(a) + 1.6), Math.sin(a) * (rad(a) + 1.6)); }
          M(g, new THREE.ShapeGeometry(sh2), mudM, x, .12, z, { rx: -Math.PI / 2 }); NS(M(g, new THREE.ShapeGeometry(sh), silver, x, .24, z, { rx: -Math.PI / 2 }));
          for (let i = 0; i < 12; i++) { const a = i * .52 + wr() * .3, rr = rad(a) + 1.6 + wr() * 1.4, px = x + Math.cos(a) * rr, pz = z - Math.sin(a) * rr; if (i % 4 === 0) rock(g, px, .4, pz, .9 + wr()); else if (i % 4 === 1) reeds(g, px, 0, pz, 1.6, 4); else if (i % 4 === 2) M(g, new THREE.SphereGeometry(1.4 + wr(), 7, 5), i % 8 === 2 ? moss : grassM, px, .3, pz, { sy: .5 }); else tuft(g, px, 0, pz, .8); }
          for (let i = 0; i < 2 + (r > 9 ? 2 : 0); i++) { const a = wr() * 6.283, d = r * .55 * wr(); pad(g, x + Math.cos(a) * d, .34, z + Math.sin(a) * d, 1 + wr() * .8); }
          for (let i = 0; i < (r > 7 ? 3 : 1); i++) { const l = new THREE.Group(); M(l, new THREE.SphereGeometry(1, 8, 6), silver, 0, 0, 0, { sx: 3, sy: .5, sz: .8 }); M(l, new THREE.SphereGeometry(.7, 6, 5), silver, 2.6, 0, 0, { sy: .6 }); l.traverse(m => { m.userData.noShadow = true; }); g.add(l); lee.push([l, x, z, r * (.25 + .16 * i), i * 2.1 + x, (i % 2 ? -1 : 1) * (.16 + .05 * i)]); } });
        rod(g, barkM, [-10, .6, 6], [9, 2, -5], 1.8, 1.3, 7); rod(g, barkM, [2, 1.6, -1], [4, 6, 3], .5, .15, 4); M(g, new THREE.SphereGeometry(2, 7, 5), moss, -2, 2.2, 1.4, { sy: .4 }); rod(g, timber, [-20, 0, 28], [-19, 9, 28], .5, .4, 5); M(g, new THREE.BoxGeometry(7, 3, .5), plank, -19, 8, 28.3, { rz: .12 });
      }, { y: y0, hexes: [[22, 39]], top: 24, view: 380 });
      anim.push(t => { for (const [l, x, z, rr, ph, sp] of lee) { const a = t * sp + ph; l.position.set(x + Math.cos(a) * rr, .5 + .1 * Math.sin(t * 2 + ph), z + Math.sin(a) * rr); l.rotation.y = -a - Math.sign(sp) * Math.PI / 2; l.scale.x = 1 + .25 * Math.sin(t * 3 + ph); } }); }

    // Apiary Towers (18,40 19,40 18,41): three spires of honeycomb built up round old stone obelisks, lit amber from inside, honey running down them, and bees the size of dogs going round and round
    { const HX = [[18, 40], [19, 40], [18, 41]], c = Wp(APIARY), y0 = 3.6 * S, bees = [], comb = canvasTex(256, 256, (cx, w, hgt) => { cx.fillStyle = '#5a3206'; cx.fillRect(0, 0, w, hgt); const R0 = 16; for (let j = -1; j < 12; j++) for (let i = -1; i < 12; i++) { const x = i * R0 * 1.5, y = j * R0 * 1.732 + (i % 2 ? R0 * .866 : 0); cx.beginPath(); for (let q = 0; q < 6; q++) cx.lineTo(x + Math.cos(q * 1.047) * R0 * .82, y + Math.sin(q * 1.047) * R0 * .82); cx.closePath(); cx.fillStyle = (i * 7 + j * 13) % 5 ? '#ffb020' : '#ffe07a'; cx.fill(); } }, 3, 4);
      const combM = new THREE.MeshStandardMaterial({ color: 0x6a4410, roughness: .5, map: comb, emissive: 0xffa010, emissiveMap: comb, emissiveIntensity: .9 }), honey = flowMat('#b86a08', '#ffd040', 0xffa010, .92, -.05), beeY = solid(0xf0b020, .6), beeB = solid(0x15120e, .6), wingM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false });
      const towers = HX.map(([q, r], i) => { const p = hexW(q, r); return [p[0] - c[0], p[1] - c[1], [104, 84, 122][i]]; });
      addThing('Apiary Towers', '🐝', c, 1, 30, g => { const k = kit(g); for (const [x, z, hh] of towers) { M(g, new THREE.CylinderGeometry(2, 9, hh, 4), stoneM, x, hh / 2, z, { ry: .785 }); M(g, new THREE.ConeGeometry(2.8, 9, 4), stoneM, x, hh + 4.5, z, { ry: .785 });
          const prof = []; for (let j = 0; j <= 12; j++) { const f = j / 12; prof.push(new THREE.Vector2((15 - 9 * f) * (1 + .22 * Math.sin(f * 15 + x)) * (j === 12 ? .5 : 1), f * hh * .88)); } M(g, new THREE.LatheGeometry(prof, 16), combM, x, 2, z);
          for (let i = 0; i < 6; i++) { const a = i * 1.05 + x, f = .2 + .1 * i, rr = (15 - 9 * f) * 1.12; NS(M(g, new THREE.CylinderGeometry(.5, .9, hh * .3, 6), honey, x + Math.cos(a) * rr, hh * .88 * f - hh * .1, z + Math.sin(a) * rr)); NS(M(g, new THREE.SphereGeometry(1.2, 8, 6), litA, x + Math.cos(a) * rr, hh * .88 * f - hh * .26, z + Math.sin(a) * rr, { sy: 1.6 })); }
          NS(k.C(19, 20, .5, 20, new THREE.MeshStandardMaterial({ color: 0xc87a10, roughness: .1, emissive: 0x8a4a00, emissiveIntensity: .5 }), x, .5, z)); }
        for (let i = 0; i < 110; i++) { const a = wr() * 6.283, d = 24 + wr() * 76, x = Math.cos(a) * d * 1.2, z = Math.sin(a) * d, gy = heightAt(c[0] + x, c[1] + z) - y0; if (gy < -4) continue; const kd = i % 5; if (kd === 0) tuft(g, x, gy, z, 1.1); else { rod(g, mossD, [x, gy, z], [x + (wr() - .5), gy + 2 + wr() * 2, z + (wr() - .5)], .12, .08, 3); M(g, new THREE.IcosahedronGeometry(.7 + wr() * .4, 0), kd === 1 ? pinkM : kd === 2 ? litY : kd === 3 ? solid(0xf2f0e6, .8) : solid(0xb07af0, .8), x, gy + 3 + wr() * 2, z, { sy: .6 }); } }      // flowers for the bees
        for (const [x, z, hh] of towers) { for (let i = 0; i < 9; i++) { const a = i * .7 + z, f = .1 + .09 * i, rr = (15 - 9 * f) * 1.1; M(g, new THREE.ConeGeometry(1.1, 5 + (i % 3) * 3, 5), combM, x + Math.cos(a) * rr, hh * .88 * f - 2, z + Math.sin(a) * rr, { rx: Math.PI }); } for (let i = 0; i < 3; i++) { const a = i * 2.1 + x, d = 25 + i * 3; M(g, new THREE.SphereGeometry(3.4, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), thatch, x + Math.cos(a) * d, .4, z + Math.sin(a) * d, { sy: 1.3 }); M(g, new THREE.CylinderGeometry(4, 4, .8, 10), plankD, x + Math.cos(a) * d, .4, z + Math.sin(a) * d); } }
        for (let i = 0; i < 13; i++) { const b = new THREE.Group(), body = new THREE.Group(); M(body, new THREE.SphereGeometry(1.5, 10, 8), beeY, 0, 0, 0, { sx: 1.7 }); for (const xx of [-.9, .5]) M(body, new THREE.TorusGeometry(1.36, .34, 5, 12), beeB, xx, 0, 0, { ry: Math.PI / 2 }); M(body, new THREE.SphereGeometry(1.05, 8, 6), beeB, 2.7, .1, 0); M(body, new THREE.ConeGeometry(.3, 1.4, 5), beeB, -2.9, 0, 0, { rz: Math.PI / 2 }); mergeKids(body); b.add(body);
          const wings = [-1, 1].map(sd => { const w = new THREE.Group(), m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 10), wingM); m.scale.set(.6, 1.5, 1); m.position.y = 1.9; w.add(m); w.position.set(.4, .9, sd * .5); w.rotation.x = sd * 1.1; b.add(w); return w; });
          b.traverse(m => { m.userData.noShadow = true; }); b.scale.setScalar(1.5 + (i % 3) * .35); g.add(b); const tw = towers[i % 3]; bees.push([b, wings, tw[0], tw[1], 22 + (i * 7) % 26, tw[2] * (.25 + .6 * ((i * 37) % 10) / 10), i * 1.7, (i % 2 ? -1 : 1) * (.5 + .1 * (i % 4))]); }
      }, { y: y0, hexes: HX, top: 140, view: 620 });
      anim.push(t => { for (const [b, wings, x, z, rr, yy, ph, sp] of bees) { const a = t * sp + ph, R2 = rr * (1 + .25 * Math.sin(t * .31 + ph)); b.position.set(x + Math.cos(a) * R2, yy + 9 * Math.sin(t * .7 + ph * 2), z + Math.sin(a) * R2 * .8); b.rotation.y = -a - Math.sign(sp) * Math.PI / 2; b.rotation.z = .15 * Math.sin(t * 1.3 + ph); const f = .5 + 1.1 * Math.abs(Math.sin(t * 34 + ph)); wings[0].rotation.x = -f; wings[1].rotation.x = f; } });
      for (const [x, z, hh] of towers) for (let i = 0; i < 3; i++) lanternPts.push([c[0] + x, y0 + hh * (.25 + .25 * i), c[1] + z, { c: [2.6, 1.5, .3], size: 30, drift: .3, speed: .4 }]); }

    // Borrowed Breath Bog (26,37): open murk with nothing built in it - only reeds, and pale breath rising out of the water in slow columns as though something under it were sighing
    { const c = Wp(BBBOG);
      addThing('Borrowed Breath Bog', '🌫️', c, 1, 30, g => { for (let i = 0; i < 9; i++) { const a = i * 2.4, d = 14 + (i * 13) % 36; reeds(g, Math.cos(a) * d, Math.max(heightAt(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d), 0), Math.sin(a) * d, 5, 7); } for (const [x, z, hh, ln] of [[-20, 8, 16, .4], [16, -14, 22, -.3], [30, 12, 13, .5], [-6, -30, 19, .2], [8, 26, 11, -.5]]) { const tp = [x + ln * hh * .5, hh, z + ln * 3]; rod(g, barkM, [x, -3, z], tp, 1.7, .6, 5); for (let q = 0; q < 3; q++) { const a = q * 2.1 + x; rod(g, barkM, [lerp(x, tp[0], .5 + q * .15), hh * (.5 + q * .15), lerp(z, tp[2], .5 + q * .15)], [tp[0] + Math.cos(a) * 7, hh * (.7 + q * .16) + 2, tp[2] + Math.sin(a) * 7], .6, .12, 4); } M(g, new THREE.SphereGeometry(1.6, 6, 5), mossD, x, .6, z, { sy: .5 }); }
        for (let i = 0; i < 9; i++) { const a = i * .7 + .3, d = 10 + (i * 11) % 34; rock(g, Math.cos(a) * d, .1, Math.sin(a) * d, 1.4 + wr() * 2, solid(0x4a4c46, .9, { flatShading: true })); if (i % 2) pad(g, Math.cos(a + .5) * d, .3, Math.sin(a + .5) * d, 1.3); } }, { y: 0, hexes: [[26, 37]], top: 40, view: 380 });
      { const fog = mist({ n: 70, seed: 99, r0: 6, r1: 62, y0: 1.5, y1: 7, spin: .03, rise: 0, size: 22, alpha: .028, col: [.6, .7, .75] }); fog.position.set(c[0], 0, c[1]); scene.add(fog); for (let i = 0; i < 9; i++) lanternPts.push([c[0] + Math.cos(i * .7) * (8 + (i * 9) % 30), 6 + (i * 7) % 26, c[1] + Math.sin(i * .7) * (8 + (i * 9) % 30), { c: [1.5, 1.9, 2.1], size: 8, drift: 5, speed: .25 }]); }
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + .4, d = i ? 26 : 0, m = mist({ n: 46, seed: 90 + i, r0: 2, r1: 9, y0: 1, y1: 44 + i * 6, spin: .15, rise: .16 + .03 * i, twist: 1, size: 4.5, alpha: .06, col: [.7, .85, .9], add: true }); m.position.set(c[0] + Math.cos(a) * d, 0, c[1] + Math.sin(a) * d); scene.add(m); } }

    // Cadaver-lotus Terraces (28,37): five round stone pools stepping down the slope toward the south, water falling from each to the next, and in every one a pale lotus as wide as a cart with a light at its heart
    { const c = Wp(CADAV), y0 = 3.4 * S, petal = new THREE.MeshStandardMaterial({ color: 0xe8dcd6, roughness: .6, emissive: 0x6a4a58, emissiveIntensity: .45, flatShading: true }), fall = flowMat('#7fb8c0', '#ffffff', 0, .85, -.6), tiers = CAD_T;
      addThing('Cadaver-lotus Terraces', '🪷', c, 1, 30, g => { const k = kit(g); tiers.forEach(([x, z, hh, r], i) => { k.C(r, r + 1.6, 5, 18, stoneM, x, hh - 2, z); k.T(r - .4, 1, stoneM, x, hh, z, { rx: Math.PI / 2 }); NS(k.C(r - 1, r - 1, .4, 18, waterGlass(0x3a6a6a, .8), x, hh - .3, z)); M(g, new THREE.SphereGeometry(r * .5, 7, 5), moss, x - r * 1.05, hh - 1, z + 2, { sy: .5 }); fern(g, x + r + 2, hh - 1.5, z - 3, .8); tuft(g, x - r - 1, hh - 1, z - 5); for (let q = 0; q < 14; q++) { const a = q * .449 + i; M(g, new THREE.BoxGeometry(r * .42, 1.6, 2.6), q % 2 ? stoneM : solid(0x84827a, .95, { flatShading: true }), x + Math.cos(a) * (r + .2), hh + .2, z + Math.sin(a) * (r + .2), { ry: -a + Math.PI / 2 }); if (q % 3 === 0) { M(g, new THREE.SphereGeometry(1.6 + wr() * 1.4, 6, 5), q % 2 ? moss : mossD, x + Math.cos(a) * (r + 1.6), hh - 1 - wr() * hh * .4, z + Math.sin(a) * (r + 1.6), { sy: .7 }); rod(g, barkM, [x + Math.cos(a) * (r + .6), hh + .4, z + Math.sin(a) * (r + .6)], [x + Math.cos(a + .25) * (r + 2.6), 0, z + Math.sin(a + .25) * (r + 2.6)], .5, .2, 4); } }
          for (let q = 0; q < 4; q++) { const a = q * 1.6 + i * 2, d = r * (.55 + .2 * (q % 2)); pad(g, x + Math.cos(a) * d, hh - .02, z + Math.sin(a) * d, 1 + wr() * .7); } if (i === 4) { reeds(g, x - r - 4, 0, z + 6, 4, 7); reeds(g, x + r + 3, 0, z + 2, 4, 6); }
          for (const [n2, len, tilt, rr] of [[9, r * .5, .25, r * .12], [7, r * .36, .8, r * .06], [5, r * .24, 1.25, 0]]) for (let q = 0; q < n2; q++) { const hd = new THREE.Group(); M(hd, new THREE.SphereGeometry(1, 7, 5), petal, 0, len * .5 * Math.sin(tilt) + .4, rr + len * .5 * Math.cos(tilt), { sx: len * .32, sy: .35, sz: len * .55, rx: -tilt }); hd.rotation.y = q / n2 * 6.283 + tilt; hd.position.set(x, hh, z); fold(g, hd); }
          NS(k.S(r * .12, litY, x, hh + r * .14, z)); if (i < 4) { const nx = tiers[i + 1], dx = nx[0] - x, dz = nx[1] - z, l = Math.hypot(dx, dz); const a = [x + dx / l * (r + .6), hh + .4, z + dz / l * (r + .6)], b = [nx[0] - dx / l * (nx[3] - 1), nx[2] + .5, nx[1] - dz / l * (nx[3] - 1)], m2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.6, (a[2] + b[2]) / 2], px = -dz / l * 2.2, pz = dx / l * 2.2, ge = new THREE.BufferGeometry(), P = [a, m2, b];
            ge.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(p => [p[0] - px, p[1], p[2] - pz, p[0] + px, p[1], p[2] + pz]), 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, .5, 1, .5, 0, 0, 1, 0], 2)); ge.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]); ge.computeVertexNormals(); NS(M(g, ge, fall, 0, 0, 0)); } });
      }, { y: y0, hexes: [[28, 37]], top: 56, view: 420 });
      tiers.forEach(([x, z, hh, r]) => lanternPts.push([c[0] + x, y0 + hh + r * .2, c[1] + z, { c: [2.4, 2.3, 1.4], size: 12, drift: .1, speed: .5 }])); }

    // Spore Network entrance (28,36 28,35 28,34): a tree bigger than any other in the swamp, hollow, standing on a mound of its own roots. In its south face the roots part in a tall pointed arch, traced
    // with veins of yellow-green light; through it are galleries ringed with lamps, one above another. Before the arch, and running back under the tree, a round shaft goes straight down: a stair winds
    // down its wall past more galleries, roots hang into it, and spores rise out of it. Mossy steps with lanterns come up to it from the south, past lotus pools that step down beside them; shelf fungus
    // climbs the trunk; and from every bough hang long curtains of vine
    { const c = Wp(MYC), K = 12.5 * S, TZ = -22, PZ = MYC_P[1] * S, RP = 30, FL = K - 80 * S, yb = K - 6, AH = 94, TH = 236, HX = [[28, 35], [28, 36], [28, 34]], sr = mulberry32(2835), V2 = (x, y) => new THREE.Vector2(x, y);
      const gH = (x, z) => heightAt(c[0] + x, c[1] + z), glows = [];
      const bark = tx(solid(0x76604a, 1, { flatShading: true }), 'rock'), barkD = solid(0x41332a, 1, { flatShading: true }), earth = tx(solid(0x3b2f24, 1, { side: THREE.DoubleSide, flatShading: true }), 'rock'), deep = solid(0x120f0b, 1, { side: THREE.DoubleSide });
      const hollowM = new THREE.MeshStandardMaterial({ color: 0x1c1a10, roughness: 1, emissive: 0x6c7e1e, emissiveIntensity: 1.1, flatShading: true, side: THREE.DoubleSide }), dark = solid(0x040503, 1);
      const capM = solid(0xcdb890, .8, { flatShading: true }), gill = solid(0x8a7658, .9, { flatShading: true }), vein = glowM(0xd8ff4a, 3), vine = solid(0x6a8a3a, 1, { flatShading: true }), vineD = solid(0x48682c, 1, { flatShading: true }), mossL = solid(0x6f8f3a, 1, { flatShading: true }), iron = solid(0x1c1a16, .6, { metalness: .5 });
      const petal = new THREE.MeshStandardMaterial({ color: 0xe8dcd6, roughness: .6, emissive: 0x6a4a58, emissiveIntensity: .45, flatShading: true }), fall = flowMat('#7fb8c0', '#ffffff', 0, .85, -.6), pond = waterGlass(0x3a6a6a, .8);
      // how far out the trunk's bark stands, on a bearing (0 is due south) at a height above its foot: buttressed and flaring at the ground, ridged all the way up
      const rad = (a, y) => { const fl = (1 - Math.min(y / 70, 1)) ** 2; return lerp(46, 19, Math.pow(clamp(y / TH, 0, 1), .8)) * (1 + fl * (.22 + .5 * Math.max(0, Math.cos(a * 4 + .6)) ** 2 + .22 * Math.max(0, Math.cos(a * 9 + 2)) ** 2)) + 2.2 * Math.sin(a * 13 + y * .06) + 1.5 * Math.sin(a * 23 - y * .11); };
      const aw = y => y >= AH ? 0 : .64 * Math.sqrt(1 - y / AH);                                       // half the width of the arch, as an angle, at a height: wide at the ground, drawn in to a point
      const P = (a, y, off = 0) => { const r = rad(a, y) + off; return [Math.sin(a) * r, yb + y, TZ + Math.cos(a) * r]; };
      const shell = (k, top) => { const NA = 96, NY = Math.round(top / 4), pos = [], idx = [];
        for (let j = 0; j <= NY; j++) for (let i = 0; i <= NA; i++) { const a = -Math.PI + i / NA * Math.PI * 2, y = j / NY * top, r = rad(a, y) * k; pos.push(Math.sin(a) * r, yb + y, TZ + Math.cos(a) * r); }
        for (let j = 0; j < NY; j++) for (let i = 0; i < NA; i++) { const a = -Math.PI + (i + .5) / NA * Math.PI * 2, y = (j + .5) / NY * top; if (Math.abs(a) < aw(y)) continue; const p = j * (NA + 1) + i, q = p + NA + 1; idx.push(p, p + 1, q, p + 1, q + 1, q); }
        const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); ge.setIndex(idx); ge.computeVertexNormals(); return ge; };
      const lamp = (g, x, y, z, hgt) => { rod(g, iron, [x, y - 1, z], [x, y + hgt, z], .32, .26, 5); M(g, new THREE.CylinderGeometry(.75, .75, .2, 6), iron, x, y + hgt, z); NS(M(g, new THREE.BoxGeometry(1.1, 1.7, 1.1), litY, x, y + hgt + 1, z)); M(g, new THREE.ConeGeometry(1.05, 1, 4), iron, x, y + hgt + 2.3, z, { ry: .785 }); glows.push([x, y + hgt + 1, z, 7]); };
      const strand = (g, top, len, i) => { const e = [top[0] + (sr() - .5) * len * .08, top[1] - len, top[2] + (sr() - .5) * len * .08]; rod(g, i % 2 ? vine : vineD, e, top, .08, .3, 4);
        for (let q = 1; q <= 4; q++) { const f = q / 4.4 + sr() * .08; M(g, new THREE.ConeGeometry(.4 + sr() * .4, len * (.16 + .1 * sr()), 4), i % 3 ? vineD : vine, lerp(top[0], e[0], f) + (sr() - .5), lerp(top[1], e[1], f) - len * .08, lerp(top[2], e[2], f) + (sr() - .5), { rx: Math.PI }); } };
      addThing('Spore Network Entrance', '🍄', c, 1, 30, g => { const k = kit(g);
        // the trunk: bark outside, a lit hollow inside, the arch left open in both
        M(g, shell(1, TH), bark, 0, 0, 0); M(g, shell(.84, 118), hollowM, 0, 0, 0); M(g, new THREE.SphereGeometry(30, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), hollowM, 0, yb + 116, TZ, { sy: .5 }); k.S(21, bark, 0, yb + TH - 4, TZ, { sy: .6 });
        // great roots running off down the mound on every side but the shaft's
        for (let i = 0; i < 15; i++) { const a = -Math.PI + (i + .5) / 15 * Math.PI * 2 + (sr() - .5) * .2; if (Math.abs(a) < .8) continue; const L = 78 + 40 * sr(), w = (sr() - .5) * .5; let p0 = P(a, 30 + 14 * sr(), -4);
          for (let j = 1; j <= 4; j++) { const d = lerp(rad(a, 0) * .8, L, j / 4), aa = a + w * (j / 4) ** 2, x = Math.sin(aa) * d, z = TZ + Math.cos(aa) * d, p1 = [x, gH(x, z) + (j < 4 ? 5.5 - j * 1.4 : -2), z]; rod(g, bark, p0, p1, 9.5 - j * 1.7, 7.8 - j * 1.7, 7);
            if (j === 2 && i % 2) { const b = aa + (i % 4 ? .5 : -.5), bx = Math.sin(b) * (d + 26), bz = TZ + Math.cos(b) * (d + 26); rod(g, bark, p1, [bx, gH(bx, bz) - 1.5, bz], 3.6, 1.4, 6); } p0 = p1; } }
        // the arch: a root up either side to the point, another outside it, and the veins of light that trace it and climb the trunk above
        for (const sd of [-1, 1]) { let p0 = null, p2 = null, p4 = null; for (let j = 0; j <= 12; j++) { const y = j / 12 * AH, p1 = P(sd * (aw(y) + .05), y, 1.5), p3 = P(sd * Math.max(aw(Math.min(y, AH - 2)) - .075, 0), Math.min(y, AH - 2), 3.6), p5 = P(sd * (aw(y) + .2 + .1 * Math.sin(j)), y * 1.1 + 2, 1);
            if (p0) { rod(g, bark, p0, p1, 6 - j * .28, 5.7 - j * .28, 7); NS(rod(g, vein, p2, p3, .6, .6, 4)); rod(g, barkD, p4, p5, 3.6 - j * .2, 3.4 - j * .2, 6); } p0 = p1; p2 = p3; p4 = p5; } }
        k.S(7.4, bark, ...P(0, AH + 2, 1), { sy: 1.3, sz: .6 });
        for (let v = 0; v < 10; v++) { let a = (sr() - .5) * .5, y = AH - 8 + sr() * 12, p0 = P(a, y, 1); for (let j = 0; j < 7; j++) { a += (sr() - .5) * .34 + Math.sign(a || 1) * .06; y += 7 + 9 * sr(); const p1 = P(a, y, 1); NS(rod(g, vein, p0, p1, .44 - j * .04, .4 - j * .04, 4)); p0 = p1; } }
        // shelf fungus stepping up the trunk beside the arch and scattered round the rest of it, with moss on top and threads hanging under
        const shelf = (a, y, r) => { const p = P(a, y, r * .25); M(g, new THREE.SphereGeometry(r, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), capM, p[0], p[1], p[2], { sy: .3 }); M(g, new THREE.CylinderGeometry(r * .96, r * .45, r * .24, 9), gill, p[0], p[1] - r * .12, p[2]);
          if (sr() < .5) M(g, new THREE.SphereGeometry(r * .5, 6, 4), sr() < .5 ? moss : mossD, p[0], p[1] + r * .2, p[2], { sy: .35 }); if (sr() < .6) for (let q = 0; q < 3; q++) { const o = P(a + (q - 1) * r * .012, y, r * (.7 + .25 * sr())); rod(g, vine, [o[0], o[1] - 5 - 9 * sr(), o[2]], [o[0], o[1] - .3, o[2]], .06, .2, 4); } };
        for (const sd of [-1, 1]) for (let j = 0; j < 22; j++) { const y = 14 + j * 7 + sr() * 5; shelf(sd * (aw(Math.min(y, AH - 1)) + .22 + sr() * .55), y, 4 + 7 * sr() * (1 - j / 30)); }
        for (let j = 0; j < 26; j++) shelf(1.2 + sr() * 3.9, 12 + sr() * 120, 3 + 5 * sr());
        for (let j = 0; j < 70; j++) { const a = (sr() - .5) * 6.283, y = sr() * sr() * 190, p = P(a, y, -.8); if (Math.abs(a) < aw(y) + .16) continue; M(g, new THREE.SphereGeometry(4 + 6 * sr(), 6, 4), j % 3 === 0 ? mossL : j % 3 === 1 ? moss : mossD, p[0], p[1], p[2], { sy: .9, sx: .7 + .5 * sr() }); }
        for (let j = 0; j < 9; j++) { const a = (j - 4) * .13, o = P(a, AH + 2 - Math.abs(j - 4) * 3.4, 3); strand(g, o, 9 + 13 * sr(), j); }                       // vines hanging across the top of the arch
        // inside: three galleries round the back of the hollow, each a ring of posts and lamps; lit doorways behind them; two root bridges across; lamps hanging on long threads
        for (let l = 0; l < 3; l++) { const hy = 26 + l * 26, y = yb + hy, r1 = rad(Math.PI, hy) * .84 - 1.4; M(g, new THREE.LatheGeometry([V2(r1 - 8, 0), V2(r1, 0), V2(r1, -1.8), V2(r1 - 8, -1.8), V2(r1 - 8, 0)], 28, Math.PI - 1.8, 3.6), barkD, 0, y, TZ);
          for (let q = 0; q <= 12; q++) { const ph = Math.PI - 1.75 + q * 3.5 / 12, x = Math.sin(ph) * (r1 - 7.4), z = TZ + Math.cos(ph) * (r1 - 7.4); rod(g, bark, [x, y, z], [x, y + 11, z], .7, .5, 5); if (q < 12) { const pm = ph + 3.5 / 24, mx = Math.sin(pm) * (r1 - 7.4), mz = TZ + Math.cos(pm) * (r1 - 7.4); NS(k.S(1.5, litY, mx, y + 8.2, mz)); k.T(3.6, .35, bark, mx, y + 11, mz, { ry: pm }, Math.PI); if (q % 3 === 1) glows.push([mx, y + 8.4, mz, 8]);
              NS(k.B(2.2, 4.6, .5, litY, Math.sin(pm) * (r1 - .7), y + 3.4, TZ + Math.cos(pm) * (r1 - .7), { ry: pm })); } } }
        for (const [y, z, tilt] of [[yb + 38, TZ - 2, .05], [yb + 66, TZ + 6, -.07]]) { const hw = rad(Math.PI / 2, y - yb) * .8; k.B(hw * 2, 1, 4.6, barkD, 0, y, z, { rz: tilt }); for (let q = -3; q <= 3; q++) for (const sz of [-1, 1]) rod(g, bark, [q * hw / 3.4, y + q * hw / 3.4 * Math.tan(tilt), z + sz * 2.1], [q * hw / 3.4, y + q * hw / 3.4 * Math.tan(tilt) + 3.4, z + sz * 2.1], .3, .25, 4); }
        for (let q = 0; q < 14; q++) { const a = sr() * 6.283, d = 4 + 17 * sr(), x = Math.sin(a) * d, z = TZ + Math.cos(a) * d, len = 22 + 62 * sr(); rod(g, vineD, [x, yb + 112 - len, z], [x, yb + 114, z], .1, .16, 4); NS(k.S(1.1, litY, x, yb + 111 - len, z)); if (q % 3 === 0) glows.push([x, yb + 111 - len, z, 9]); }
        // the shaft: its wall, a kerb of root and stone round the mouth, the dark at the bottom with a glow in it
        M(g, new THREE.CylinderGeometry(RP, RP - 3, K + 1 - FL, 44, 8, true), earth, 0, (K + 1 + FL) / 2, PZ); M(g, new THREE.CylinderGeometry(RP - 1.4, RP - 3.4, K - 46 - FL, 44, 4, true), deep, 0, (K - 46 + FL) / 2, PZ);
        k.C(RP - 3, RP - 3, .5, 30, dark, 0, FL + 3, PZ); NS(k.C(10, 10, .3, 20, glowM(0x9dff5a, 1.3), 0, FL + 3.5, PZ)); k.T(RP + 1.4, 1.9, bark, 0, K + .2, PZ, { rx: Math.PI / 2 });
        for (let q = 0; q < 30; q++) { const ph = q / 30 * 6.283 + .1; if (Math.abs(ph - .1) < .3 || ph > 5.95) continue; M(g, new THREE.BoxGeometry(5.6, 2.2 + sr(), 3.8), q % 2 ? stoneM : solid(0x84827a, .95, { flatShading: true }), Math.sin(ph) * (RP + 3.4), K + .9, PZ + Math.cos(ph) * (RP + 3.4), { ry: ph, rz: (sr() - .5) * .1 }); if (q % 4 === 0) M(g, new THREE.SphereGeometry(2.2 + sr(), 6, 4), moss, Math.sin(ph + .1) * (RP + 4.6), K + 1.6, PZ + Math.cos(ph + .1) * (RP + 4.6), { sy: .6 }); }
        for (let q = 0; q < 22; q++) { const ph = Math.PI + (sr() - .5) * (q < 14 ? 3 : 6.2), x = Math.sin(ph) * (RP - .8), z = PZ + Math.cos(ph) * (RP - .8), len = 22 + 70 * sr(), ix = Math.sin(ph) * (RP - 3 - 3 * sr()), iz = PZ + Math.cos(ph) * (RP - 3 - 3 * sr()); rod(g, q % 3 ? bark : barkD, [ix, K - len, iz], [x, K + 1.4, z], .5, 2.4 - (q % 3) * .5, 6); }                // roots hanging down into it
        // the stair winding down its wall: treads on brackets, a rope rail, a lamp every so often
        for (let i = 0; i < 74; i++) { const ph = .35 + i * .135, y = K - .6 - i * 1.08, r = RP - 3.6, x = Math.sin(ph) * r, z = PZ + Math.cos(ph) * r, ix = Math.sin(ph) * (r - 3), iz = PZ + Math.cos(ph) * (r - 3); M(g, new THREE.BoxGeometry(6.4, .5, 2.9), i % 5 ? plank : plankD, x, y, z, { ry: ph - Math.PI / 2 });
          if (i % 3 === 0) rod(g, barkD, [Math.sin(ph) * (RP - .6), y - 4.4, PZ + Math.cos(ph) * (RP - .6)], [ix, y - .3, iz], .4, .3, 4); if (i % 6 === 0) { rod(g, plankD, [ix, y, iz], [ix, y + 4, iz], .28, .22, 4); if (i % 12 === 6) { NS(k.S(.8, litY, ix, y + 4.8, iz)); glows.push([ix, y + 4.8, iz, 7]); } }
          if (i % 6 === 0 && i + 6 < 74) { const p2 = .35 + (i + 6) * .135; rod(g, rope, [ix, y + 3.7, iz], [Math.sin(p2) * (r - 3), y + 3.7 - 6.48, PZ + Math.cos(p2) * (r - 3)], .14, .14, 4); } }
        // two galleries part-way down, each broken where the stair comes through, with lit doorways in the wall behind and glowing fungus between
        for (const dn of [30, 58]) { const y = K - dn, st = .35 + (dn - .6) / 1.08 * .135; M(g, new THREE.LatheGeometry([V2(RP - 9.5, 0), V2(RP - .5, 0), V2(RP - .5, -2), V2(RP - 9.5, -2), V2(RP - 9.5, 0)], 30, st + .55, 6.283 - 1.1), barkD, 0, y, PZ);
          for (let q = 0; q < 9; q++) { const ph = st + .9 + q * .56, x = Math.sin(ph) * (RP - 1), z = PZ + Math.cos(ph) * (RP - 1); k.B(4.2, 6.4, .9, dark, x, y + 3.2, z, { ry: ph }); k.T(2.1, .4, bark, x, y + 6.2, z, { ry: ph }, Math.PI); NS(k.B(1.3, 1.7, .5, litY, Math.sin(ph + .22) * (RP - 1), y + 4, PZ + Math.cos(ph + .22) * (RP - 1), { ry: ph + .22 })); const rx = Math.sin(ph + .28) * (RP - 9), rz = PZ + Math.cos(ph + .28) * (RP - 9); rod(g, plankD, [rx, y, rz], [rx, y + 3.4, rz], .26, .22, 4); if (q % 3 === 1) glows.push([Math.sin(ph + .22) * (RP - 3), y + 4, PZ + Math.cos(ph + .22) * (RP - 3), 8]); } }
        for (let q = 0; q < 90; q++) { const ph = sr() * 6.283, y = K - 4 - sr() * 96, r = RP - .9 - (K - y) * .028; NS(M(g, new THREE.SphereGeometry(.8 + 1.6 * sr(), 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), q % 3 ? litG : vein, Math.sin(ph) * r, y, PZ + Math.cos(ph) * r, { sy: .5 })); }
        for (let v = 0; v < 10; v++) { let ph = Math.PI + (sr() - .5) * 4.4, y = K - 1; const at = () => { const r = RP - .7 - (K - y) * .028; return [Math.sin(ph) * r, y, PZ + Math.cos(ph) * r]; }; let p0 = at(); for (let j = 0; j < 9; j++) { ph += (sr() - .5) * .22; y -= 6 + 7 * sr(); const p1 = at(); NS(rod(g, vein, p1, p0, .3, .42, 4)); p0 = p1; } }
        // the steps up from the south: mossy stone, a lantern on a post either side every few treads
        { const A = [22, 152], B = [7, PZ + RP + 7], N = 30, ux = (B[0] - A[0]) / Math.hypot(B[0] - A[0], B[1] - A[1]), uz = (B[1] - A[1]) / Math.hypot(B[0] - A[0], B[1] - A[1]), nx = -uz, nz = ux, ry = Math.atan2(-nz, nx), st2 = solid(0x7c7a70, .95, { flatShading: true });
          for (let i = 0; i <= N; i++) { const x = lerp(A[0], B[0], i / N), z = lerp(A[1], B[1], i / N), y = Math.max(gH(x, z), .2); M(g, new THREE.BoxGeometry(17 + (i % 3) * .8, 1.5, 3.6), i % 2 ? stoneM : st2, x, y + .25, z, { ry });
            for (const sd of [-1, 1]) { if (i % 3 === 0) M(g, new THREE.SphereGeometry(1.6 + sr() * 1.4, 6, 4), i % 2 ? moss : mossD, x + nx * sd * 8.6, y + .7, z + nz * sd * 8.6, { sy: .6 }); if (i % 6 === 2) lamp(g, x + nx * sd * 10.4, y, z + nz * sd * 10.4, 5.5); if (i % 5 === 1) fern(g, x + nx * sd * 12.5, y - .4, z + nz * sd * 12.5, .7); } } }
        // the lotus pools beside the steps, each spilling into the next and the last into the swamp
        MYC_T.forEach(([x, z, hh, r], i) => { k.C(r, r + 1.6, 5, 18, stoneM, x, hh - 2, z); k.T(r - .4, 1, stoneM, x, hh, z, { rx: Math.PI / 2 }); NS(k.C(r - 1, r - 1, .4, 18, pond, x, hh - .3, z));
          for (let q = 0; q < 14; q++) { const a = q * .449 + i; M(g, new THREE.BoxGeometry(r * .42, 1.6, 2.6), q % 2 ? stoneM : solid(0x84827a, .95, { flatShading: true }), x + Math.cos(a) * (r + .2), hh + .2, z + Math.sin(a) * (r + .2), { ry: -a + Math.PI / 2 }); if (q % 3 === 0) M(g, new THREE.SphereGeometry(1.6 + sr() * 1.4, 6, 5), q % 2 ? moss : mossD, x + Math.cos(a) * (r + 1.6), hh - 1 - sr() * hh * .3, z + Math.sin(a) * (r + 1.6), { sy: .7 }); }
          for (let q = 0; q < 4; q++) { const a = q * 1.6 + i * 2, d = r * (.55 + .2 * (q % 2)); pad(g, x + Math.cos(a) * d, hh - .02, z + Math.sin(a) * d, 1 + sr() * .7); } fern(g, x + r + 2, hh - 1.5, z - 3, .8); tuft(g, x - r - 1, hh - 1, z - 5);
          for (const [n2, len, tilt, rr] of [[9, r * .5, .25, r * .12], [7, r * .36, .8, r * .06], [5, r * .24, 1.25, 0]]) for (let q = 0; q < n2; q++) { const hd = new THREE.Group(); M(hd, new THREE.SphereGeometry(1, 7, 5), petal, 0, len * .5 * Math.sin(tilt) + .4, rr + len * .5 * Math.cos(tilt), { sx: len * .32, sy: .35, sz: len * .55, rx: -tilt }); hd.rotation.y = q / n2 * 6.283 + tilt; hd.position.set(x, hh, z); fold(g, hd); }
          NS(k.S(r * .12, litY, x, hh + r * .14, z)); glows.push([x, hh + r * .2, z, 11]);
          const nx2 = MYC_T[i + 1] || [x + 8, z + r + 16, 0, 3], dx = nx2[0] - x, dz = nx2[1] - z, l = Math.hypot(dx, dz), a = [x + dx / l * (r + .6), hh + .4, z + dz / l * (r + .6)], b = [nx2[0] - dx / l * (nx2[3] - 1), nx2[2] + .5, nx2[1] - dz / l * (nx2[3] - 1)], m2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.6, (a[2] + b[2]) / 2], px = -dz / l * 2.2, pz = dx / l * 2.2, ge = new THREE.BufferGeometry(), Q = [a, m2, b];
          ge.setAttribute('position', new THREE.Float32BufferAttribute(Q.flatMap(p => [p[0] - px, p[1], p[2] - pz, p[0] + px, p[1], p[2] + pz]), 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, .5, 1, .5, 0, 0, 1, 0], 2)); ge.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]); ge.computeVertexNormals(); NS(M(g, ge, fall, 0, 0, 0)); });
        reeds(g, -30, 0, 160, 6, 9); reeds(g, -66, 0, 150, 5, 7); for (let q = 0; q < 7; q++) { const a = 2 + q * .5, d = 100 + 22 * sr(), x = Math.sin(a) * d, z = TZ + Math.cos(a) * d; shroom(g, x, Math.max(gH(x, z), 0) - .5, z, 5 + 7 * sr(), 3 + 3 * sr(), capM); }
        // the crown: boughs reaching out all round (shorter over the entrance, so it can be seen), heavy with leaf and moss, and from each of them the vines hanging in curtains
        for (let i = 0; i < 12; i++) { const a = -Math.PI + (i + .5) / 12 * Math.PI * 2 + (sr() - .5) * .3, front = Math.abs(a) < 1, L = (front ? 68 : 104) + 44 * sr(), hy = 165 + 60 * sr(), rise = 30 + 30 * sr(), pts = [P(a, hy, -6)];
          for (let j = 1; j <= 4; j++) { const f = j / 4, d = rad(a, hy) + L * f, aa = a + (sr() - .5) * .25 * f; pts.push([Math.sin(aa) * d, yb + hy + rise * Math.sin(f * 2.2) - 14 * f * f, TZ + Math.cos(aa) * d]); }
          for (let j = 0; j < 4; j++) rod(g, bark, pts[j], pts[j + 1], 8.5 - j * 1.9, 6.6 - j * 1.9, 7);
          const at = f => { const q = Math.min(Math.floor(f * 4), 3), u = f * 4 - q; return [lerp(pts[q][0], pts[q + 1][0], u), lerp(pts[q][1], pts[q + 1][1], u), lerp(pts[q][2], pts[q + 1][2], u), 8.5 - (q + u) * 1.9]; };
          for (let q = 0; q < 6; q++) { const p = at(.35 + q * .13); M(g, new THREE.IcosahedronGeometry(13 + 8 * sr(), 1), leaf[(i + q) % 3], p[0] + (sr() - .5) * 14, p[1] + 5 + 6 * sr(), p[2] + (sr() - .5) * 14, { sy: .5 }); if (q % 2) M(g, new THREE.SphereGeometry(5 + 4 * sr(), 6, 4), q % 4 === 1 ? moss : mossD, p[0], p[1] + p[3] * .5, p[2], { sy: .5 }); }
          // twigs off the bough to either side, and the vines hung from the bough and from them: every one starts on wood
          for (let q = 0; q < 5; q++) { const p = at(.3 + q * .16), sd = q % 2 ? 1 : -1, tw = [p[0] + Math.cos(a) * sd * (9 + 6 * sr()), p[1] - 2 - 3 * sr(), p[2] - Math.sin(a) * sd * (9 + 6 * sr())]; rod(g, bark, [p[0], p[1], p[2]], tw, 1.5, .5, 5); for (let v = 0; v < 2; v++) { const u = .45 + .5 * v; strand(g, [lerp(p[0], tw[0], u), lerp(p[1], tw[1], u) - .6, lerp(p[2], tw[2], u)], front ? 14 + 24 * sr() : 36 + 80 * sr(), q + v); } }
          for (let q = 0; q < 8; q++) { const p = at(.25 + q * .095 + sr() * .03); strand(g, [p[0], p[1] - p[3] * .8, p[2]], front ? 12 + 22 * sr() : 34 + 76 * sr(), q); } }
        for (let q = 0; q < 9; q++) { const a = q * .7, d = 8 + 16 * sr(); M(g, new THREE.IcosahedronGeometry(15 + 9 * sr(), 1), leaf[q % 3], Math.sin(a) * d, yb + TH + 4 + 10 * sr(), TZ + Math.cos(a) * d, { sy: .55 }); }
      }, { y: 0, hexes: HX, top: 300, view: 640 });
      for (const [x, y, z, size] of glows) lanternPts.push([c[0] + x, y, c[1] + z, { c: [1.9, 2.4, .7], size, drift: .15, speed: .6 }]);
      for (let i = 0; i < 16; i++) { const a = i * 2.4, d = 30 + (i * 17) % 70; lanternPts.push([c[0] + Math.sin(a) * d, K + 8 + (i * 13) % 70, c[1] + 20 + Math.cos(a) * d, { c: [1.6, 2.4, .6], size: 6, drift: 6, speed: .35 }]); }              // fireflies
      { const sp = mist({ n: 90, seed: 2835, r0: 6, r1: RP - 5, y0: 4, y1: K - FL + 46, spin: .1, rise: .22, twist: .8, size: 2.6, alpha: .55, col: [1.5, 2, .5], add: true }); sp.position.set(c[0], FL, c[1] + PZ); scene.add(sp);        // spores rising out of the shaft
        const gl = mist({ n: 46, seed: 2837, r0: 3, r1: 20, y0: 6, y1: 104, spin: .08, rise: .05, size: 7, alpha: .5, col: [1.5, 1.9, .45], add: true }); gl.position.set(c[0], yb, c[1] + TZ); scene.add(gl);
        const fg = mist({ n: 40, seed: 2836, r0: 8, r1: 54, y0: 1, y1: 9, spin: .03, rise: 0, size: 20, alpha: .03, col: [.7, .8, .75] }); fg.position.set(c[0] - 40, 2, c[1] + 120); scene.add(fg); } }

    // Sanguine Sluice (twelve hexes down the south-east edge): a whole works of channels cut down into a stone-paved flat and running with blood that moves like the rivers do - long cuts and the cross-cuts between them, basins where they meet with stone heads
    // spouting into them, slab bridges, sluice-gates, iron grates, raised settling tanks, valve towers with their wheels, steps down to the flow, red lamps along the main cut, and at the bottom end a drain the whole of it turns round
    { const HX = [[33, 34], [32, 35], [33, 35], [32, 36], [31, 37], [30, 38], [29, 39], [28, 40], [27, 41], [26, 41], [26, 42], [25, 42]], c = Wp(SLUICE.A[4]), y0 = 5.5 * S, yb = -2.6, blood = new THREE.MeshStandardMaterial({ color: 0x8c0a10, roughness: .1, envMapIntensity: 1.3, side: THREE.DoubleSide }); blood.name = 'blood';
      const bloodSh = sh => { sh.uniforms.uNoise = U.uNoise; sh.uniforms.uTime = U.uTime; sh.uniforms.uNG = U.uNG; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; uniform float uTime, uNG;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n{ vec2 p = vSxW.xz / 70.0; float c = texture2D(uNoise, p * 1.3 + uTime * 0.016).r * texture2D(uNoise, p * 0.9 - uTime * 0.012).r; diffuseColor.rgb *= 0.5 + 1.5 * c; }')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec2 p = vSxW.xz / 70.0; vec2 gr = (texture2D(uNoise, p + uTime * vec2(0.011, 0.007)).gb - 0.5) + (texture2D(uNoise, p * 2.7 - uTime * vec2(0.013, 0.019)).gb - 0.5) * 0.6; gr *= uNG * 0.008; normal = normalize(mat3(viewMatrix) * normalize(vec3(-gr.x, 1.0, -gr.y))); }'); };   // the river's own moving surface, in red
      const bfall = flowMat('#4a0306', '#d21c26', 0x5a0508, .96, -.55), ironM = solid(0x26242a, .5, { metalness: .7 }), stoneL = solid(0x8a877c, .95, { flatShading: true }), stoneD = solid(0x55534c, .95, { flatShading: true }), redL = glowM(0xff2a1a, 2.2), kerbs = [], flags = [], sr2 = mulberry32(606), lamps = [];
      const swirl = canvasTex(256, 256, (cx, w, hgt) => { cx.fillStyle = '#3a0306'; cx.fillRect(0, 0, w, hgt); cx.strokeStyle = '#b8141c'; for (let arm = 0; arm < 5; arm++) { cx.lineWidth = 5; cx.beginPath(); for (let i = 0; i < 60; i++) { const a = arm * 1.2566 + i * .11, rr = 6 + i * 2; cx.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); } cx.stroke(); } cx.fillStyle = '#080002'; cx.beginPath(); cx.arc(128, 128, 14, 0, 6.283); cx.fill(); });
      const st = addThing('Sanguine Sluice', '🩸', c, 1, 30, g => { const k = kit(g), B2 = (w, hh, d, m, x, y, z, ry) => M(g, new THREE.BoxGeometry(w, hh, d), m, x, y, z, { ry });
        SLUICE.lines.forEach((L0, li) => { const L = L0.map(Wp), hw = li < 2 ? 10.5 : 8, pos = [], uv = [], idx = []; let d = 0; L.forEach((p, i) => { const a = L[Math.max(i - 1, 0)], b = L[Math.min(i + 1, L.length - 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l; if (i) d += Math.hypot(p[0] - L[i - 1][0], p[1] - L[i - 1][1]);
            pos.push(p[0] + nx * hw - c[0], yb, p[1] + nz * hw - c[1], p[0] - nx * hw - c[0], yb, p[1] - nz * hw - c[1]); uv.push(0, d / 70, 1, d / 70); if (i) { const q = i * 2; idx.push(q - 2, q - 1, q, q, q - 1, q + 1); }
            if (i) { const A = L[i - 1], sl = Math.hypot(p[0] - A[0], p[1] - A[1]), ux = (p[0] - A[0]) / sl, uz = (p[1] - A[1]) / sl, ry = -Math.atan2(uz, ux); for (let e = 14; e < sl - 14;) { const bl = 5 + 4.5 * sr2(); for (const sd of [-1, 1]) { const q = sr2(); if (q < .1) continue;      // kerbstones: no two the same length, a few gone, a few standing proud as bollards, the damp ones green
                  kerbs.push({ x: A[0] + ux * (e + bl / 2) - uz * sd * (hw + 3), y: y0 + .4 + (q > .92 ? 1.3 : 0), z: A[1] + uz * (e + bl / 2) + ux * sd * (hw + 3), sx: bl - .5, sy: 2.4 + sr2() * 1.2 + (q > .92 ? 2.6 : 0), sz: 3 + sr2(), ry: ry + (sr2() - .5) * .06, tint: q < .3 ? [.62, .8, .55] : [.8 + .3 * sr2(), .8 + .25 * sr2(), .78 + .2 * sr2()] });
                  if (sr2() < .55) { const of = hw + 8 + sr2() * 13; flags.push({ x: A[0] + ux * (e + sr2() * bl) - uz * sd * of, y: y0 + .15, z: A[1] + uz * (e + sr2() * bl) + ux * sd * of, sx: 5 + 4 * sr2(), sy: .5, sz: 4 + 3 * sr2(), ry: ry + (sr2() - .5) * .5, tint: [.7 + .35 * sr2(), .7 + .3 * sr2(), .68 + .3 * sr2()] }); } } e += bl; } } });
          const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals(); NS(M(g, ge, blood, 0, 0, 0)); });
        SLUICE.basins.forEach((b, bi) => { const p = Wp(b), x = p[0] - c[0], z = p[1] - c[1]; NS(k.C(22, 22, .4, 28, blood, x, yb + .1, z)); for (let i = 0; i < 20; i++) { const a = i * .314; B2(7.2, 2.4 + (i % 3) * .5, 3.4, i % 4 ? stoneM : stoneL, x + Math.cos(a) * 25.4, 1.2, z + Math.sin(a) * 25.4, -a + Math.PI / 2); }
          for (let i = 0; i < 3; i++) { const a = i * 2.094 + bi; B2(3.6, 4.6, 5.4, stoneD, x + Math.cos(a) * 24.4, 3.6, z + Math.sin(a) * 24.4, -a); M(g, new THREE.ConeGeometry(.8, 2.4, 4), stoneD, x + Math.cos(a + .08) * 25, 6.6, z + Math.sin(a + .08) * 25); M(g, new THREE.ConeGeometry(.8, 2.4, 4), stoneD, x + Math.cos(a - .08) * 25, 6.6, z + Math.sin(a - .08) * 25); NS(M(g, new THREE.PlaneGeometry(1.7, 3.4 - yb), bfall, x + Math.cos(a) * 21.2, (3.4 + yb) / 2, z + Math.sin(a) * 21.2, { ry: Math.PI / 2 - a })); }   // horned stone heads spouting into it
          for (let i = 0; i < 4; i++) B2(8, 1, 2.6, stoneL, x + Math.cos(bi + 1) * (27.6 - i * 2.4), .8 - i * .9, z + Math.sin(bi + 1) * (27.6 - i * 2.4), -(bi + 1) + Math.PI / 2);                                                                 // steps down to the flow
          if (bi === 6) { const wh = new THREE.Group(); M(wh, new THREE.CircleGeometry(19, 32), new THREE.MeshStandardMaterial({ map: swirl, roughness: .15, emissive: 0x3a0306, emissiveIntensity: .5 }), 0, 0, 0, { rx: -Math.PI / 2 }); wh.position.set(x, yb + .4, z); wh.traverse(m => { m.userData.noShadow = true; }); g.add(wh); spin.push({ o: wh, speed: -.7, bolt: false }); for (let i = 0; i < 8; i++) B2(1, .8, 9, ironM, x + (i - 3.5) * 1.1, yb + 1, z, 0); }
          else { k.C(2.6, 3.4, 9, 8, stoneM, x, yb + 4.5, z); NS(k.S(1.6, redL, x, yb + 10, z)); } });
        const A = SLUICE.A.map(Wp), Bq = SLUICE.B.map(Wp), Dq = SLUICE.D.map(Wp);
        A.forEach((p, i) => { if (!i || i === A.length - 1) return; const q = A[i + 1], ux = q[0] - p[0], uz = q[1] - p[1], l = Math.hypot(ux, uz), ry = -Math.atan2(uz, ux), x = p[0] + ux * .28 - c[0], z = p[1] + uz * .28 - c[1], gx = p[0] + ux * .72 - c[0], gz = p[1] + uz * .72 - c[1];
          B2(11, 2, 34, stoneM, x, 2, z, ry); M(g, new THREE.TorusGeometry(10, 1.6, 5, 12, Math.PI), stoneD, x, -5, z, { ry: ry + Math.PI / 2 }); for (const sd of [-1, 1]) for (const e of [-1, 1]) B2(1.4, 3, 1.4, stoneL, x + (ux / l) * e * 4.6 - (uz / l) * sd * 15, 4.4, z + (uz / l) * e * 4.6 + (ux / l) * sd * 15, ry);                               // a slab bridge on an arch, with parapet stubs
          if (i % 2) { for (const sd of [-1, 1]) B2(3, 17, 3, stoneM, gx - uz / l * sd * 13, 6.5, gz + ux / l * sd * 13, ry); B2(3.4, 2.6, 32, stoneD, gx, 15.6, gz, ry); B2(1.2, 9.6, 22, plankD, gx, 6.4, gz, ry); M(g, new THREE.TorusGeometry(2.6, .4, 5, 12), ironM, gx, 19.6, gz, { ry: ry + Math.PI / 2 }); rod(g, ironM, [gx, 17, gz], [gx, 12, gz], .3, .3, 5); }   // a sluice-gate, half raised, with its wheel
          for (const sd of [-1, 1]) { const lx = p[0] - uz / l * sd * 18, lz = p[1] + ux / l * sd * 18; rod(g, ironM, [lx - c[0], 0, lz - c[1]], [lx - c[0], 12, lz - c[1]], .45, .3, 5); M(g, new THREE.BoxGeometry(2, 2.6, 2), ironM, lx - c[0], 13, lz - c[1]); NS(k.S(1, redL, lx - c[0], 13, lz - c[1])); if (sd > 0) lamps.push([lx, lz]); } });
        Bq.forEach((p, i) => { if (i + 1 >= Bq.length) return; const q = Bq[i + 1], ux = q[0] - p[0], uz = q[1] - p[1], l = Math.hypot(ux, uz), ry = -Math.atan2(uz, ux), x = p[0] + ux * .3 - c[0], z = p[1] + uz * .3 - c[1];
          if (i % 2 === 0) { for (let e = -2; e <= 2; e++) B2(.9, .8, 25, ironM, x + ux / l * e * 2.2, .9, z + uz / l * e * 2.2, ry); for (const sd of [-1, 1]) B2(11, .9, .9, ironM, x - uz / l * sd * 11, 1, z + ux / l * sd * 11, ry); }                                                                                                      // an iron grate over the cut
          if (i === 2 || i === 6) { const tx = p[0] + ux / l * 26 + uz / l * 26 - c[0], tz = p[1] + uz / l * 26 - ux / l * 26 - c[1]; B2(11, 26, 11, stoneL, tx, 13, tz, ry); B2(12.6, 1.6, 12.6, stoneD, tx, 26.4, tz, ry); M(g, new THREE.ConeGeometry(9, 9, 4), stoneD, tx, 31.6, tz, { ry: ry + Math.PI / 4 }); for (const e of [-1, 1]) NS(B2(1.4, 6, .5, redL, tx + ux / l * e * 2.6 - uz / l * 5.7, 17, tz + uz / l * e * 2.6 + ux / l * 5.7, ry));
            const wx = tx - uz / l * 6.2, wz = tz + ux / l * 6.2; M(g, new THREE.TorusGeometry(4.4, .5, 5, 16), ironM, wx, 8, wz, { ry }); for (let e = 0; e < 3; e++) M(g, new THREE.BoxGeometry(8.6, .5, .5), ironM, wx, 8, wz, { ry, rz: e * 1.047 }); rod(g, ironM, [tx, 3, tz], [x + ux / l * 6, 0, z + uz / l * 6], 1.1, 1.1, 7); } });                                           // a valve tower, wheel on its wall and a pipe to the cut
        Dq.forEach((p, i) => { if (i % 2 || i + 1 >= Dq.length) return; const q = Dq[i + 1], ux = q[0] - p[0], uz = q[1] - p[1], l = Math.hypot(ux, uz), ry = -Math.atan2(uz, ux); let nx = -uz / l, nz = ux / l; if (nx + nz > 0) { nx = -nx; nz = -nz; } const tx = p[0] + ux * .5 + nx * 34 - c[0], tz = p[1] + uz * .5 + nz * 34 - c[1];
          B2(34, 6, 22, stoneD, tx, 3, tz, ry); NS(B2(29.6, .4, 17.6, blood, tx, 6.1, tz, ry)); for (let e = 0; e < 3; e++) B2(8, 2 * (3 - e), 2.4, stoneL, tx - nx * (12.2 + e * 2.4) + ux / l * 9, 3 - e, tz - nz * (12.2 + e * 2.4) + uz / l * 9, ry + Math.PI / 2 * 0);
          B2(3, 2.4, 9, stoneL, tx - nx * 15, 5, tz - nz * 15, ry + Math.PI / 2); NS(M(g, new THREE.PlaneGeometry(1.8, 6.4 - yb), bfall, tx - nx * 20.6, (5.6 + yb) / 2, tz - nz * 20.6, { ry: Math.atan2(-nx, -nz) })); });                                                                           // a raised settling tank, brim-full, overflowing by a lip back into the cut
      }, { y: y0, hexes: HX, top: 40, view: 900 });
      st.group.traverse(m => { if (m.isMesh && m.material.name === 'blood') { m.material.onBeforeCompile = bloodSh; m.material.customProgramCacheKey = () => 'sxblood'; m.material.needsUpdate = true; } });
      for (const list of [kerbs, flags]) { const km = instanced(new THREE.BoxGeometry(1, 1, 1), stoneM, list); if (km) km.raycast = () => {}; }
      lamps.forEach((p, i) => { if (i % 2 === 0) lanternPts.push([p[0], y0 + 13, p[1], { c: [2.6, .3, .2], size: 9, drift: .2, speed: .5 }]); }); SLUICE.basins.forEach(b => { const p = Wp(b); lanternPts.push([p[0], y0 + 8, p[1], { c: [2.6, .3, .2], size: 12, drift: .2, speed: .5 }]); }); }

    // The Sinkhole (26,39; not on the live map): where the swamp's water goes. Several collapses run into one ragged hole, sheer on most sides and slumped to a slope on the east. The swamp stands in water right up to it;
    // a broken lip of rock keeps the water back in places, and wherever the lip is missing the water simply goes over - thin where the gap is narrow, a broad curtain where it is wide - and is mist long before it lands.
    // Boulders along the dry stretches of the brink, outcrops down the walls with things growing on them, roots and creepers let down from the edge, bats turning in the shaft, a faint light far below,
    // and on the south side a railed platform with a winch and a rope ladder
    { const c = Wp(SINK), DEP = 126, NA = 120, rockD = solid(0x3a3a34, 1, { flatShading: true }), rockM = solid(0x565850, 1, { flatShading: true }), batM = solid(0x0e0c10, 1, { side: THREE.DoubleSide }), bats = [], sheet = fallMat('#b4d2ce', '#ffffff', 0x000000, .72, -1.1);
      const rim = a => { let lo = 4, hi = 110; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (sinkD(SINK[0] + Math.cos(a) * m, SINK[1] + Math.sin(a) * m) < 1) lo = m; else hi = m; } return lo * S; };   // how far out the brink lies on a bearing
      const RM = [], WET = [], gh = (x, z) => heightAt(c[0] + x, c[1] + z); for (let i = 0; i < NA; i++) { const a = i / NA * 6.283, r = rim(a), ca = Math.cos(a), sa = Math.sin(a); RM.push([ca * r, sa * r, a, r]); WET.push(gh(ca * (r + 8), sa * (r + 8)) < -.3 && gh(ca * (r + 3), sa * (r + 3)) < .2); }
      const dpos = [], dvel = [], dpar = [], G = 46, dr = mulberry32(515);
      addThing('The Sinkhole', '🕳️', c, 1, 30, g => { const k = kit(g), pos = [], uv = [], idx = [];
        // the falls: wherever two neighbouring points of the brink are both under water, a curtain between them following the water's own arc, and drops thrown off it
        for (let i = 0; i < NA; i++) { const j = (i + 1) % NA; if (!WET[i]) continue; const A = RM[i], ca = Math.cos(A[2]), sa = Math.sin(A[2]);
          for (let q = 0; q < 60; q++) { const B = RM[j], f = dr(), x = lerp(A[0], B[0], f), z = lerp(A[1], B[1], f), vin = 4 + 6 * dr(), vy = dr() * 2.4, tg = (dr() - .5) * 2.4; dpos.push(c[0] + x - ca * dr() * 3, -.2, c[1] + z - sa * dr() * 3); dvel.push(-ca * vin - sa * tg, vy, -sa * vin + ca * tg); dpar.push(dr(), (vy + Math.sqrt(vy * vy + 2 * G * (DEP - 10))) / G, 1.5 + 2.2 * dr() * dr(), dr()); }
          if (!WET[j]) continue; const base = pos.length / 3; for (const P of [A, RM[j]]) { const pa = Math.cos(P[2]), pb = Math.sin(P[2]); for (let q = 0; q <= 9; q++) { const t = q * .27, rr = P[3] + 1 - 5.5 * t; pos.push(pa * rr, -.3 - 23 * t * t, pb * rr); uv.push(P === A ? i * .37 : (i + 1) * .37, 1 - q / 9); } }
          for (let q = 0; q < 9; q++) idx.push(base + q, base + q + 1, base + 10 + q, base + 10 + q, base + q + 1, base + 11 + q); }
        if (pos.length) { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals(); NS(M(g, ge, sheet, 0, 0, 0)); }
        // the brink: boulders along the dry stretches, moss and fern among them
        for (let i = 0; i < NA; i++) { if (WET[i] || wr() < .35) continue; const P = RM[i], ca = Math.cos(P[2]), sa = Math.sin(P[2]), d = P[3] + 1 + wr() * 9, x = ca * d, z = sa * d, r = 2.4 + wr() * wr() * 7, gy = gh(x, z); if (Math.abs(P[2] - 1.571) < .16) continue;
          M(g, new THREE.IcosahedronGeometry(r, 1), i % 3 ? rockD : rockM, x, gy + r * .15, z, { sx: .8 + wr() * .7, sy: .45 + wr() * .35, sz: .8 + wr() * .7, ry: wr() * 6, rz: (wr() - .5) * .5 }); if (wr() < .5) M(g, new THREE.SphereGeometry(r * .5, 6, 5), wr() < .5 ? moss : mossD, x + (wr() - .5) * r, gy + r * .45, z + (wr() - .5) * r, { sy: .4 }); if (wr() < .3) fern(g, x + r * .8, gy, z + r * .4, .7); }
        // outcrops on the walls, sitting on the rock that is actually there
        for (let i = 0; i < 16; i++) { const P = RM[(i * 23 + 5) % NA], f = .72 + wr() * .2, x = Math.cos(P[2]) * P[3] * f, z = Math.sin(P[2]) * P[3] * f, gy = gh(x, z); if (gy > -8 || gy < -DEP + 26) continue; const r = 4 + wr() * 4; M(g, new THREE.IcosahedronGeometry(r, 1), i % 2 ? rockD : rockM, x, gy + 1, z, { sx: 1.3, sy: .4, sz: 1.1, ry: wr() * 6 }); M(g, new THREE.SphereGeometry(r * .6, 6, 5), moss, x, gy + r * .4, z, { sy: .3 });
          if (i % 3 === 0) { fern(g, x, gy + r * .4, z, .8); NS(k.S(.7, litG, x * .94, gy + r * .4 + 2, z * .94)); } else if (i % 3 === 1) { shroom(g, x * .96, gy + r * .4, z * .96, 3.2, 1.8, glowM(0x7affc0, 1.1)); shroom(g, x * .96 + 1.8, gy + r * .4, z * .96 + 1.4, 1.8, 1, glowM(0x7affc0, 1.1)); } else { rod(g, barkM, [x, gy + 1, z], [x * .86, gy + 13, z * .86], .9, .3, 5); clump(g, x * .86, gy + 14, z * .86, 3.4, 3); } }
        // roots and creepers let down from the brink
        for (let i = 0; i < 30; i++) { const P = RM[(i * 4 + 1) % NA], ca = Math.cos(P[2]), sa = Math.sin(P[2]), r = P[3], dp = 12 + wr() * 44, vine = i % 3 === 0, y0 = Math.max(gh(ca * (r + 2), sa * (r + 2)), -1) + .6, m = vine ? mossD : barkM;
          rod(g, m, [ca * (r + 2), y0, sa * (r + 2)], [ca * r * .95, -dp * .45, sa * r * .95], vine ? .3 : .7, vine ? .25 : .45, 4); rod(g, m, [ca * r * .95, -dp * .45, sa * r * .95], [ca * r * .92 + (wr() - .5) * 4, -dp, sa * r * .92 + (wr() - .5) * 4], vine ? .25 : .45, .1, 4); if (vine) for (let q = 0; q < 3; q++) M(g, new THREE.IcosahedronGeometry(1 + wr(), 0), leaf[q % 3], ca * r * .945, -dp * (.2 + q * .22), sa * r * .945, { sy: .5 }); }
        // trees standing back from the edge, not over it, on whatever dry ground there is; reeds and tussocks in the shallows
        for (let i = 0, n = 0; i < 40 && n < 6; i++) { const P = RM[(i * 17 + 9) % NA], ca = Math.cos(P[2]), sa = Math.sin(P[2]), d = P[3] + 16 + wr() * 26, x = ca * d, z = sa * d, gy = Math.max(gh(x, z), 0); if (Math.abs(P[2] - 1.571) < .5) continue; const hh = 26 + wr() * 16, tp = [x + ca * 3, gy + hh, z + sa * 3]; n++;
          rod(g, barkM, [x, gy - 2, z], tp, 2.6, 1.2, 6); for (let q = 0; q < 5; q++) { const b = q * 1.26 + wr(); rod(g, barkM, [x, gy + 4, z], [x + Math.cos(b) * 9, gy - 1.5, z + Math.sin(b) * 9], 1.1, .35, 5); } clump(g, tp[0], tp[1] + 3, tp[2], 9, 5); for (let q = 0; q < 4; q++) rod(g, mossD, [tp[0] + (wr() - .5) * 10, tp[1], tp[2] + (wr() - .5) * 10], [tp[0] + (wr() - .5) * 12, tp[1] - 10 - wr() * 12, tp[2] + (wr() - .5) * 12], .2, .08, 4); }
        for (let i = 0; i < 46; i++) { const P = RM[Math.floor(wr() * NA)], d = P[3] + 8 + wr() * 44, x = Math.cos(P[2]) * d, z = Math.sin(P[2]) * d, gy = gh(x, z); if (Math.abs(P[2] - 1.571) < .3 && d < P[3] + 24) continue; if (gy < -.2) { if (i % 3) reeds(g, x, 0, z, 3, 6); else pad(g, x, .2, z, 1.2 + wr()); } else if (i % 3 === 0) fern(g, x, gy, z, .7 + wr() * .4); else if (i % 3 === 1) tuft(g, x, gy, z, 1.1); else shroom(g, x, gy, z, 2 + wr() * 2, 1 + wr() * .6, i % 2 ? capR : glowM(0x7affc0, .8)); }
        // the platform, on the rock of the south side: decking on posts, a rail, a lamp, a winch with its rope down the hole, crates, and the ladder
        { const z0 = rim(Math.PI / 2) + 7, py = Math.max(gh(0, z0), 0) + .4, B = (w, hh, d, m, x, y, z, o) => k.B(w, hh, d, m, x, py + y, z0 + z, o);
          B(22, .7, 16, plank, 2, 0, 0); for (let i = 0; i < 9; i++) B(2.2, .25, 16, i % 2 ? plankD : plank, -7.8 + i * 2.45, .5, 0, { ry: (wr() - .5) * .03 }); for (let i = 0; i < 8; i++) B(.8, i < 4 ? 8 : 6, .8, timber, -8.4 + (i % 4) * 6.9, i < 4 ? 0 : -1, i < 4 ? -7.4 : 7.4);
          for (const [x0, x1] of [[-8.4, -1.5], [5.4, 12.3]]) rod(g, rope, [x0, py + 3.6, z0 - 7.4], [x1, py + 3.6, z0 - 7.4], .14, .14, 4); for (const x of [-8.4, 12.3]) rod(g, rope, [x, py + 3.6, z0 - 7.4], [x, py + 2.6, z0 + 7.4], .14, .14, 4);
          B(.7, 9, .7, timber, 12.3, 4.5, -1); B(2.2, 2.6, 2.2, timber, 12.3, 9.6, -1); NS(k.S(1.1, litO, 12.3, py + 9.6, z0 - 1)); for (const sx of [-1, 1]) B(.8, 7, .8, timber, -4 + sx * 3, 4, -4.6); k.C(1.3, 1.3, 6.6, 10, plankD, -4, py + 6.6, z0 - 4.6, { rz: Math.PI / 2 }); k.T(1.7, .25, timber, -8, py + 6.6, z0 - 4.6, { ry: Math.PI / 2 });
          rod(g, rope, [-4, py + 5.4, z0 - 4.6], [-4, -86, z0 - 14], .16, .16, 4); k.C(1.6, 1.2, 2.6, 8, plankD, -4, -87, z0 - 14); B(3.6, 2.8, 3.6, plankD, 8, 2.4, 4, { ry: .3 }); B(2.8, 2.2, 2.8, plank, 7.6, 4.9, 4.2, { ry: -.2 }); k.C(1.5, 1.3, 3, 9, plankD, 3.4, py + 2.5, z0 + 5);
          for (const sx of [-1, 1]) rod(g, rope, [2 + sx * 2, py + .4, z0 - 7], [2 + sx * 2, -72, z0 - 15], .14, .14, 4); for (let i = 0; i < 17; i++) k.B(4.4, .4, .5, timber, 2, py - 4 - i * 4.2, z0 - 7.4 - i * .45); lanternPts.push([c[0] + 12.3, py + 10, c[1] + z0 - 1, { c: [2.6, 1.6, .6], size: 10, drift: .2, speed: .6 }]); }
        NS(k.C(95, 95, .4, 32, waterGlass(0x16403e, .9), 0, -DEP + 4, 0));
        for (let i = 0; i < 9; i++) { const b = new THREE.Group(); for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -.8, 0, sd * 2.6, 1.2, 0, sd * 1.4], 3)), batM); w.geometry.computeVertexNormals(); b.add(w); } b.traverse(m => { m.userData.noShadow = true; m.frustumCulled = false; }); g.add(b); bats.push([b, 6 + (i * 5) % 12, -14 - (i * 13) % 70, i * .9, (i % 2 ? -1 : 1) * (.7 + .15 * (i % 3))]); }
      }, { y: 0, hexes: [[26, 39]], top: 48, view: 520 });
      // the falling water itself: drops on their own arcs, recycled, worked out in the shader
      { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3)); ge.setAttribute('aV', new THREE.Float32BufferAttribute(dvel, 3)); ge.setAttribute('aP', new THREE.Float32BufferAttribute(dpar, 4));
        const m = new THREE.Points(ge, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uTime: U.uTime, uScale: FXSCALE, uCol: { value: new THREE.Vector3(.74, .86, .86) } },
          vertexShader: 'attribute vec3 aV; attribute vec4 aP; uniform float uTime, uScale; varying float vA; void main(){ float f = fract(uTime / aP.y + aP.x), t = f * aP.y; vec3 p = position + aV * t; p.y -= 23.0 * t * t; vA = smoothstep(0.03, 0.22, f) * (1.0 - smoothstep(0.55, 1.0, f)); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aP.z * (0.8 + 0.4 * aP.w) * (0.6 + 2.8 * f) * uScale / -mv.z, 1.0, 40.0); }',
          fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(uCol, a * vA * 0.5); }' })); m.frustumCulled = false; m.raycast = () => {}; scene.add(m); }
      anim.push(t => { for (const [b, rr, yy, ph, sp] of bats) { const a = t * sp + ph; b.position.set(Math.cos(a) * rr, yy + 6 * Math.sin(t * .6 + ph), Math.sin(a) * rr * .85); b.rotation.y = -a - Math.sign(sp) * Math.PI / 2; const f = Math.sin(t * 14 + ph) * .7; b.children[0].rotation.x = f; b.children[1].rotation.x = -f; } });
      for (const o of [{ n: 170, seed: 111, r0: 6, r1: 44, y0: -DEP + 8, y1: -34, spin: .1, rise: .1, twist: .6, size: 20, alpha: .08, col: [.75, .9, .9] }, { n: 70, seed: 113, r0: 20, r1: 44, y0: -DEP + 6, y1: -DEP + 30, spin: .3, rise: .3, twist: .3, size: 14, alpha: .1, col: [.8, .95, .95] }]) { const m = mist(o); m.position.set(c[0], 0, c[1]); scene.add(m); }
      for (let i = 0; i < 7; i++) lanternPts.push([c[0] + Math.cos(i * .9) * 18, -44 - i * 12, c[1] + Math.sin(i * .9) * 18, { c: [.6, 2.2, 1.9], size: 10, drift: 3, speed: .3 }]); lanternPts.push([c[0], -DEP + 12, c[1], { c: [.5, 2.2, 1.8], size: 46, drift: 1, speed: .2 }]); }

    // Kregan's House (17,43): a round timber-framed hut on stilts in its own pond, under a two-tiered thatch with a smoke-cap; a railed porch, a plank jetty with a punt tied to it, a herb rack and eel-baskets; lily pads and reeds on the water, pines behind, green wisps over it
    { const c = Wp(KREGAN), wall = solid(0xb8a888, .9), thatchD = solid(0x6e5c34, 1, { flatShading: true });
      addThing("Kregan's House", '🛖', c, 1, 30, g => { const k = kit(g); for (let i = 0; i < 8; i++) { const a = i * .785; rod(g, timber, [Math.cos(a) * 12, -6, Math.sin(a) * 12], [Math.cos(a) * 10.4, 5, Math.sin(a) * 10.4], .8, .6); if (i % 2) rod(g, timber, [Math.cos(a) * 11.6, -2, Math.sin(a) * 11.6], [Math.cos(a + .785) * 10.6, 4, Math.sin(a + .785) * 10.6], .3, .3, 4); }
        k.C(14, 14, 1, 16, plank, 0, 5.5, 0); k.C(9, 9.4, 9, 16, wall, 0, 10.5, 0); for (let i = 0; i < 12; i++) { const a = i * .5236; rod(g, timber, [Math.cos(a) * 9.5, 6, Math.sin(a) * 9.5], [Math.cos(a) * 9.1, 15, Math.sin(a) * 9.1], .4, .4, 4); } k.T(9.4, .4, timber, 0, 10.6, 0, { rx: Math.PI / 2 });
        M(g, new THREE.ConeGeometry(14.5, 9, 16), thatch, 0, 19, 0); M(g, new THREE.ConeGeometry(10, 11, 14), thatchD, 0, 24.5, 0); M(g, new THREE.ConeGeometry(3.4, 4, 8), thatch, .6, 31.6, 0, { rz: -.2 }); for (let i = 0; i < 20; i++) { const a = i * .314; M(g, new THREE.ConeGeometry(.8, 3.4, 4), thatchD, Math.cos(a) * 14, 14.2, Math.sin(a) * 14, { rx: Math.PI }); }                           // two tiers of thatch with a ragged eave
        for (const sx of [-1, 1]) k.B(.7, 7, .7, timber, sx * 2.4, 9.4, 9.5); k.B(5.4, .7, .7, timber, 0, 13, 9.5); k.B(4, 6.4, .5, plankD, 0, 9.2, 9.3); NS(k.S(.5, litG, 3.4, 11, 10)); for (const a of [.75, 2.4, 4.3]) { NS(M(g, new THREE.CircleGeometry(1.3, 10), litG, Math.cos(a) * 9.5, 11.4, Math.sin(a) * 9.5, { ry: -a + Math.PI / 2 })); M(g, new THREE.TorusGeometry(1.4, .28, 5, 10), timber, Math.cos(a) * 9.55, 11.4, Math.sin(a) * 9.55, { ry: -a + Math.PI / 2 }); }
        for (let i = 0; i < 14; i++) { const a = i * .449; if (Math.abs(a - 1.571) < .3) continue; rod(g, timber, [Math.cos(a) * 13.4, 6, Math.sin(a) * 13.4], [Math.cos(a) * 13.4, 9, Math.sin(a) * 13.4], .22, .22, 4); } k.T(13.4, .16, rope, 0, 8.8, 0, { rx: Math.PI / 2 }); rod(g, stoneM, [-4, 19, -3], [-5, 29, -3.6], 1.1, .9);
        rod(g, timber, [-12, 6, 4], [-12, 12, 4], .2, .2, 4); rod(g, timber, [-12, 6, -4], [-12, 12, -4], .2, .2, 4); rod(g, timber, [-12, 11.6, 4.6], [-12, 11.6, -4.6], .15, .15, 4); for (let i = 0; i < 6; i++) M(g, new THREE.ConeGeometry(.5, 2.4, 5), i % 2 ? mossD : pinkM, -12, 10.2, 3.4 - i * 1.4, { rx: Math.PI }); for (let i = 0; i < 3; i++) M(g, new THREE.CylinderGeometry(1, .5, 3.4, 8, 1, true), rope, 9 + i * 1.2, 7.4, -8 + i * 2.2, { rz: Math.PI / 2 + .2, ry: i });                   // herbs drying, and eel-baskets
        deck(g, [0, 0], [[0, 13], [3, 46]], { y: 5.4, w: 6, post: 7, rope: true, lamp: (gg, x, y, z) => NS(M(gg, new THREE.SphereGeometry(.9, 8, 6), litG, x, y + .6, z)) });
        M(g, new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), plankD, 10, 1.3, 32, { sx: 6.4, sy: 1.6, sz: 2.4, ry: .4 }); k.B(1, .4, 3.6, plank, 10, 1, 32, { ry: .4 }); rod(g, timber, [6, 1.4, 34], [14, 1.2, 30], .14, .14, 4); rod(g, rope, [5.4, 1.2, 30], [3.4, 5.6, 34], .1, .1, 4);                    // the punt, its pole across it, and its painter
        for (let i = 0; i < 16; i++) { const a = i * 1.9, d = 16 + (i * 7) % 20; pad(g, Math.cos(a) * d, .25, Math.sin(a) * d, 1.2 + (i % 3) * .5); if (i % 5 === 0) M(g, new THREE.IcosahedronGeometry(.7, 0), pinkM, Math.cos(a) * d, .7, Math.sin(a) * d); }
        for (let i = 0; i < 7; i++) { const a = 3.5 + i * .42, d = 46 + (i % 3) * 7, hh = 26 + (i * 7) % 16, x = Math.cos(a) * d, z = Math.sin(a) * d, gy = Math.max(heightAt(c[0] + x, c[1] + z), 0); rod(g, barkM, [x, gy - 1, z], [x, gy + hh * .5, z], 1.4, .8, 5); for (let q = 0; q < 4; q++) M(g, new THREE.ConeGeometry(7.4 - q * 1.6, hh * .34, 7), leaf[q % 3], x, gy + hh * (.4 + q * .2), z); }
        for (const [x, z] of [[-18, 20], [22, 10], [-24, -6], [16, -22], [30, 26]]) reeds(g, x, 0, z, 7, 11);
      }, { y: 0, hexes: [[17, 43]], top: 46, view: 380 }); chimneys.push([c[0] - 5, 30, c[1] - 3.6]);
      for (let i = 0; i < 7; i++) lanternPts.push([c[0] + Math.cos(i * .9) * 26, 5 + (i * 5) % 9, c[1] + Math.sin(i * .9) * 26, { c: [.9, 2.4, 1.1], size: 7, drift: 6, speed: .3 }]); }

    // Cold Anchor Stones (20,44): Witherbloom's own stone
    { const c = Wp(COLDW), cy = heightAt(c[0], c[1]), gh = (x, z) => heightAt(c[0] + x, c[1] + z) - cy; addThing('Cold Anchor Stones', '🗿', c, 1, 30, g => anchorStone(g, gh), { y: cy, hexes: [[20, 44]], top: 84, view: 360 }); coldField(c[0], cy, c[1]);
      lanternPts.push([c[0], cy + 36, c[1], { c: [.9, 1.8, 2.8], size: 30, drift: .2, speed: .5 }]); }

    // ---------------- the last two places on the central campus ----------------
    // Condemned building (22,27): a domed hall shut up and left. A third of the dome has come in - jagged at the break, beams sticking out of the hole, the rubble lying where it fell; ivy up one side, scaffolding somebody started and gave up on up the other,
    // a column down, the door and windows boarded, a paling round it and a warning board on the gate
    { const c = hexW(22, 27), y0 = heightAt(c[0], c[1]), old = solid(0xa39c8c, .95, { flatShading: true }), oldD = solid(0x7c766a, .95, { flatShading: true }), domeM = solid(0x5a6a62, .7, { flatShading: true, side: THREE.DoubleSide }), dark = solid(0x16140f, 1), GAP = 2.3, G0 = .5;
      addThing('Condemned building', '🏚️', c, 1, 30, g => { const k = kit(g); k.C(27, 28, 2, 20, old, 0, 1, 0); k.C(22, 22, 20, 20, old, 0, 12, 0); k.C(23.4, 23.4, 1.6, 20, oldD, 0, 22.4, 0); k.C(23, 23, 1, 20, oldD, 0, 2.6, 0);
        M(g, new THREE.SphereGeometry(21.5, 22, 10, G0 + GAP, Math.PI * 2 - GAP, 0, Math.PI / 2), domeM, 0, 23, 0, { sy: .85 }); M(g, new THREE.SphereGeometry(21.5, 16, 5, 0, Math.PI * 2, 1.05, Math.PI / 2 - 1.05), domeM, 0, 23, 0, { sy: .85 }); k.C(20.6, 20.6, .4, 20, dark, 0, 23.2, 0);
        for (let i = 0; i < 9; i++) { const ph = G0 + GAP * i / 8, th = .25 + .8 * Math.abs(Math.sin(i * 2.1)), rr = 21.5 * Math.sin(th), x = Math.sin(ph) * rr, z = Math.cos(ph) * rr, y = 23 + 21.5 * Math.cos(th) * .85; if (i % 2) M(g, new THREE.ConeGeometry(1.6, 5 + 3 * wr(), 3), domeM, x, y, z, { rz: wr() - .5, rx: wr() - .5 }); else rod(g, timber, [x * .5, 23.6, z * .5], [x * 1.05, y + 3, z * 1.05], .6, .5, 5); }      // the broken edge, and rafters left hanging over the hole
        for (let i = 0; i < 12; i++) { const a = G0 + GAP / 2 - Math.PI / 2, d = 24 + wr() * 12, b = -a + (wr() - .5) * 1.3 + Math.PI / 2; rock(g, Math.sin(b) * d, y0 * 0 + 1 + wr(), Math.cos(b) * d, 1.6 + wr() * 2.4, i % 2 ? old : oldD); } for (let i = 0; i < 6; i++) rock(g, (wr() - .5) * 16 + 6, 24, (wr() - .5) * 16 + 6, 2 + wr() * 2, i % 2 ? domeM : old);
        for (let i = 0; i < 12; i++) { const a = i * .5236, th = a; k.C(1.2, 1.4, 19, 8, old, Math.cos(a) * 23, 11.5, Math.sin(a) * 23); k.B(3, 1.4, 3, oldD, Math.cos(a) * 23, 21, Math.sin(a) * 23, { ry: -a }); if (i % 3 !== 0) { k.B(5, 8, .5, dark, Math.sin(th) * 22.2, 13, Math.cos(th) * 22.2, { ry: th }); M(g, new THREE.CylinderGeometry(2.5, 2.5, .5, 10, 1, false, 0, Math.PI), dark, Math.sin(th) * 22.2, 17, Math.cos(th) * 22.2, { rx: Math.PI / 2, rz: Math.PI / 2 - th }); for (const rz of [-.5, .5]) k.B(7, 1, .5, plankD, Math.sin(th) * 22.6, 13, Math.cos(th) * 22.6, { ry: th, rz }); } }
        for (let i = 0; i < 34; i++) { const th = 3.6 + wr() * 1.5, y = 3 + wr() * wr() * 30, rr = y < 22 ? 22.6 : 21.8 * Math.sqrt(Math.max(1 - ((y - 23) / 18.3) ** 2, 0)) + .4; M(g, new THREE.IcosahedronGeometry(1.2 + 1.4 * wr(), 0), leaf[i % 3], Math.sin(th) * rr, y, Math.cos(th) * rr, { sy: .6 }); if (i % 6 === 0) rod(g, mossD, [Math.sin(th) * 23, 0, Math.cos(th) * 23], [Math.sin(th + .2) * 22.7, 20, Math.cos(th + .2) * 22.7], .25, .15, 4); }           // ivy
        for (const [x0, lv] of [[25.6, 3]]) { for (const sz of [-1, 1]) for (const sx of [0, 1]) rod(g, timber, [x0 + sx * 6, 0, sz * 7], [x0 + sx * 6, lv * 7.4, sz * 7], .35, .35, 4); for (let l = 1; l <= lv; l++) { k.B(7.4, .4, 15.4, plank, x0 + 3, l * 7, 0); rod(g, timber, [x0, (l - 1) * 7, -7], [x0, l * 7, 7], .22, .22, 4); rod(g, timber, [x0 + 6, (l - 1) * 7, 7], [x0 + 6, l * 7, -7], .22, .22, 4); } rod(g, timber, [x0 + 8, 0, 9], [x0 + 5, 14, 7.4], .25, .25, 4); }       // scaffolding
        k.B(8, 12, 1, dark, 0, 8, 22); for (let i = 0; i < 4; i++) k.B(10, 1.4, .6, plank, 0, 4 + i * 2.8, 22.7, { rz: (i % 2 ? -1 : 1) * .12 }); for (let i = 0; i < 5; i++) k.B(18 - i * 1.5, .8, 2.4, old, 0, 2 - i * .4, 25 + i * 2.2); k.C(1.3, 1.5, 17, 8, old, -14, 1.6, 31, { rz: Math.PI / 2, ry: .5 }); k.C(2, 2, 2, 8, oldD, -24, 1, 27);
        for (let i = 0; i < 30; i++) { const a = i / 30 * 6.283; if (Math.abs(a - 1.571) < .16) continue; k.B(.8, 6 + (i % 3), .8, plankD, Math.cos(a) * 38, 3, Math.sin(a) * 38, { rz: (wr() - .5) * .25 }); if (i % 2) tuft(g, Math.cos(a + .1) * (33 + wr() * 3), 0, Math.sin(a + .1) * (33 + wr() * 3)); } k.T(38, .35, plankD, 0, 4.4, 0, { rx: Math.PI / 2 }); for (const rz of [-.4, .4]) k.B(13, 1.2, .5, plank, 0, 4, 38, { rz });
        k.B(.6, 9, .6, timber, 9, 4.5, 39); k.B(7, 4.4, .5, solid(0xd8c8a0, .9), 9, 8, 39.3); for (const rz of [-.6, .6]) k.B(4.4, .6, .2, solid(0xa82018, .8), 9, 8, 39.6, { rz });
      }, { y: y0, hexes: [[22, 27]], top: 56, view: 420 }); }
    // Verdant Elixirs (20,29): a crooked little two-storey cottage shop set back from the path - rough stone below, a timber-framed storey jettied out above and leaning, a sagging mossy roof with a dormer, a flask on a bracket for a sign.
    // A herb garden behind a wattle fence, barrels by the door, a cauldron on the simmer, and under a striped awning a table of green bottles
    { const c0 = hexW(20, 29), c = [c0[0] + 34, c0[1] + 4], y0 = heightAt(c[0], c[1]), daub = solid(0xdcd0b2, .9), quoin = solid(0x8a887c, .95, { flatShading: true }), bottle = glowM(0x5aff7a, 1.6), bottle2 = glowM(0x2ad0a0, 1.4), cloth = [solid(0x3a7a44, .9, { side: THREE.DoubleSide }), solid(0xe6dcc0, .9, { side: THREE.DoubleSide })];
      addThing('Verdant Elixirs', '🧪', c, 1, 30, g => { const k = kit(g); k.B(18, 9, 14, stoneM, 0, 4.5, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) k.B(2.4, 1.8, 2.4, quoin, sx * 8.2, 1.2 + i * 2.2, sz * 6.2, { ry: i % 2 ? .1 : -.08 }); for (let i = 0; i < 14; i++) k.B(1.6 + wr(), 1 + wr() * .5, .4, quoin, -7 + (i * 5) % 15, 1 + (i * 3) % 7, 7.1);
        const up = new THREE.Group(), U = (w, hh, d, m, x, y, z, o) => M(up, new THREE.BoxGeometry(w, hh, d), m, x, y, z, o); U(20, 8, 16, daub, 0, 4, 0); for (const x of [-9.8, -4, 4, 9.8]) for (const sz of [-1, 1]) U(.8, 8, .5, timber, x, 4, sz * 8.1); for (const sx of [-1, 1]) { for (const z of [-7.8, 0, 7.8]) U(.5, 8, .8, timber, sx * 10.1, 4, z); U(.5, .7, 16, timber, sx * 10.1, 4, 0); } for (const sz of [-1, 1]) { U(20.4, .8, .5, timber, 0, .4, sz * 8.1); U(20.4, .8, .5, timber, 0, 7.6, sz * 8.1); for (const sx of [-1, 1]) U(.6, 6.8, .5, timber, sx * 7, 4, sz * 8.15, { rz: sx * .62 }); }
        M(up, gable(22.4, 11, 18.6), moss, 0, 8, 0); M(up, new THREE.BoxGeometry(.9, .9, 19), mossD, 0, 18.8, 0, { rx: .03 }); for (let i = 0; i < 7; i++) M(up, new THREE.SphereGeometry(1.6 + wr() * 1.6, 7, 5), mossD, (wr() - .5) * 14, 11 + wr() * 5, (wr() - .5) * 14, { sy: .35 }); M(up, new THREE.BoxGeometry(4.4, 4, 4), daub, 4, 12.4, 6.6); M(up, gable(5.4, 2.6, 5), moss, 4, 14.4, 6.6); NS(M(up, new THREE.BoxGeometry(2.4, 2.4, .3), glowM(0xffd9a0, 2.2), 4, 12.4, 8.7));
        NS(M(up, new THREE.BoxGeometry(3.4, 3.4, .3), litG, -4, 4.4, 8.2)); NS(M(up, new THREE.BoxGeometry(3.4, 3.4, .3), litO, 4.6, 4.2, 8.2)); for (const x of [-4, 4.6]) { M(up, new THREE.BoxGeometry(.3, 3.4, .4), timber, x, 4.3, 8.4); M(up, new THREE.BoxGeometry(3.4, .3, .4), timber, x, 4.3, 8.4); M(up, new THREE.BoxGeometry(4.4, .9, 1.2), plankD, x, 2.2, 8.8); for (let q = 0; q < 3; q++) M(up, new THREE.IcosahedronGeometry(.6, 0), q % 2 ? pinkM : leaf[0], x - 1.2 + q * 1.2, 3, 8.9); }
        up.position.set(.6, 9, .6); up.rotation.z = -.05; up.rotation.y = .04; fold(g, up);                                                                                                                                                  // the upper storey, built as a piece and set on askew
        k.B(4, 6.8, .6, plankD, -3, 3.4, 7.2); for (const sx of [-1, 1]) k.B(.7, 7.4, .9, timber, -3 + sx * 2.3, 3.7, 7.3); k.B(5.6, .8, 1, timber, -3, 7.6, 7.3); NS(k.S(.6, litO, -.2, 6.4, 7.9)); NS(k.B(4.4, 3.6, .4, litO, 4.5, 5, 7.2)); k.B(5.2, .6, 1.2, timber, 4.5, 3, 7.5); k.B(.4, 3.6, .5, timber, 4.5, 5, 7.5);
        rod(g, stoneM, [7.4, 16, -3], [8.4, 31, -3.4], 1.5, 1.2); k.C(.9, 1.1, 1.6, 8, terra, 8.4, 31.8, -3.4); rod(g, timber, [-9, 12, 7.6], [-9, 12, 13.4], .3, .3, 4); rod(g, timber, [-9, 9.4, 7.6], [-9, 12, 11], .2, .2, 4); NS(k.S(1.3, bottle, -9, 9.4, 12.4)); NS(k.C(.4, .5, 1.6, 6, bottle, -9, 11, 12.4));                                             // chimney, and the flask that hangs for a sign
        for (const [x, z] of [[-7.6, 9.2], [-10, 8.4]]) { k.C(1.5, 1.3, 3.4, 10, plankD, x, 1.7, z); k.T(1.5, .12, timber, x, 2.4, z, { rx: Math.PI / 2 }); } k.B(3, 2.4, 2.4, plank, -12.6, 1.2, 6);
        k.B(10, .6, 4.6, plank, 9, 4, 15); for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.B(.6, 4, .6, timber, 9 + sx * 4.4, 2, 15 + sz * 1.9); for (let i = 0; i < 13; i++) { const x = 4.8 + (i % 7) * 1.35, z = 14 + Math.floor(i / 7) * 1.6, hh = 1.2 + (i % 3) * .6; NS(i % 4 === 1 ? k.S(.6, bottle2, x, 4.9, z) : k.C(.4, .55, hh, 6, i % 2 ? bottle : bottle2, x, 4.3 + hh / 2, z)); }
        for (const sx of [-1, 1]) { rod(g, timber, [9 + sx * 5.6, 0, 18], [9 + sx * 5.6, 9.4, 17.6], .25, .25, 4); rod(g, timber, [9 + sx * 5.6, 0, 12], [9 + sx * 5.6, 11, 12], .25, .25, 4); } for (let i = 0; i < 6; i++) M(g, new THREE.BoxGeometry(2, .25, 6.8), cloth[i % 2], 4 + i * 2, 10.2, 14.9, { rx: .24 });                                           // the stall and its striped awning
        k.S(2.2, solid(0x15151a, .5, { metalness: .5 }), -6, 2.2, 15, { sy: .85 }); NS(k.C(1.7, 1.7, .3, 10, bottle, -6, 3.3, 15)); for (let i = 0; i < 3; i++) rod(g, timber, [-6 + Math.cos(i * 2.1) * 3.4, 0, 15 + Math.sin(i * 2.1) * 3.4], [-6, 6.4, 15], .2, .2, 4);                                                                                     // the cauldron under its tripod
        for (let r2 = 0; r2 < 3; r2++) for (let i = 0; i < 6; i++) { const x = 14 + r2 * 3.4, z = -6 + i * 2.6; M(g, new THREE.SphereGeometry(.9 + wr() * .5, 6, 5), leaf[(i + r2) % 3], x, .8, z, { sy: .8 }); if ((i + r2) % 3 === 0) M(g, new THREE.IcosahedronGeometry(.5, 0), pinkM, x, 1.8, z); } for (let i = 0; i < 16; i++) { const t = i / 16, x = t < .5 ? 12.2 + t * 2 * 11 : 23.2, z = t < .5 ? 9 : 9 - (t - .5) * 2 * 17; k.B(.4, 3, .4, timber, x, 1.5, z); } k.B(11.4, .3, .3, timber, 17.7, 2.4, 9); k.B(.3, .3, 17, timber, 23.2, 2.4, .5);       // the herb garden
        for (let i = 0; i < 7; i++) k.C(1.7, 1.9, .4, 7, quoin, -3 - i * 4.4 + Math.sin(i) * 1.2, .2, 10 + Math.sin(i * 1.7) * 1.4); for (let i = 0; i < 9; i++) M(g, new THREE.IcosahedronGeometry(1 + wr(), 0), leaf[i % 3], -9.2 + (wr() - .5), 2 + i * 1.5, -6 + (wr() - .5) * 5, { sx: .4 });                                       // stepping stones out to the path, and ivy up the west wall
        // Nora and Friends Goods, on the grass in front of the shop, beside the path: a painted food cart on four spoked wheels under a striped awning, its counter crowded with trays of buns and pastries,
        // loaves in a basket, a board with its name above; and beside it a great barrel of Urzmaktok's brew on a cradle, tapped, with tankards on a crate
        { const cart = new THREE.Group(), kc = kit(cart), paint = solid(0x2f7a78, .8), trim = solid(0xf0e6c8, .85), iron = solid(0x2a2a2e, .5, { metalness: .6 }), stripe = [solid(0xc2452e, .9, { side: THREE.DoubleSide }), solid(0xf3e9cf, .9, { side: THREE.DoubleSide })];
          const bun = solid(0xc98b3e, .8), crust = solid(0xa9682a, .85), choc = solid(0x4a2c1a, .7), creamM = solid(0xf4e8c6, .8), berry = solid(0x9a2040, .6), tray = solid(0xd9d2c0, .5, { metalness: .3 });
          const board = (text, sub, w, hgt, bg, fg) => new THREE.MeshStandardMaterial({ roughness: .8, map: canvasTex(512, Math.round(512 * hgt / w), (cx, W, H) => { cx.fillStyle = bg; cx.fillRect(0, 0, W, H); cx.strokeStyle = fg; cx.lineWidth = 6; cx.strokeRect(7, 7, W - 14, H - 14); cx.fillStyle = fg; cx.textAlign = 'center'; cx.textBaseline = 'middle';
            cx.font = 'bold ' + Math.round(H * (sub ? .4 : .5)) + 'px Georgia, serif'; cx.fillText(text, W / 2, H * (sub ? .36 : .52), W - 40); if (sub) { cx.font = 'italic ' + Math.round(H * .26) + 'px Georgia, serif'; cx.fillText(sub, W / 2, H * .74, W - 40); } }) });
          for (const sx of [-3.4, 3.4]) for (const sz of [-2.6, 2.6]) { kc.T(1.9, .26, timber, sx, 1.9, sz); kc.T(1.9, .1, iron, sx, 1.9, sz + Math.sign(sz) * .22); kc.C(.42, .42, .8, 8, iron, sx, 1.9, sz, { rx: Math.PI / 2 }); for (let q = 0; q < 4; q++) kc.B(3.5, .22, .22, timber, sx, 1.9, sz, { rz: q * .785 }); }   // wheels: rim, tyre, hub, spokes
          for (const sx of [-3.4, 3.4]) kc.C(.2, .2, 5.6, 6, iron, sx, 1.9, 0, { rx: Math.PI / 2 });                                                                                                                                                        // axles
          kc.B(10.6, .5, 4.6, timber, 0, 3.3, 0); kc.B(10, 2.7, 4.2, paint, 0, 4.9, 0); for (const x of [-3.3, 0, 3.3]) kc.B(2.7, 1.9, .2, trim, x, 4.9, 2.12); kc.B(10.2, .3, 4.4, trim, 0, 3.7, 0);                                                              // the body, panelled along its front
          kc.B(11.4, .35, 5.6, plank, 0, 6.45, .4); kc.B(11.4, .5, .3, timber, 0, 6.2, 3.1);                                                                                                                                                               // the counter, overhanging toward the customer
          for (const sx of [-5.1, 5.1]) for (const sz of [-1.9, 2.9]) kc.B(.36, 6.2, .36, timber, sx, 9.6, sz); kc.B(10.4, 5.2, .3, plankD, 0, 9.2, -1.95); for (const y of [8.4, 10.3]) kc.B(9.8, .25, 1.3, plank, 0, y, -1.3);                                // posts, a boarded back, two shelves
          for (let i = 0; i < 8; i++) { M(cart, new THREE.BoxGeometry(1.5, .16, 7.2), stripe[i % 2], -5.25 + i * 1.5, 12.9, .7, { rx: .2 }); M(cart, new THREE.ConeGeometry(.75, 1.1, 3), stripe[i % 2], -5.25 + i * 1.5, 11.75, 4.2, { rx: Math.PI, ry: Math.PI / 6, sz: .2 }); }      // the awning, striped, with a pointed edge
          kc.B(9.4, 2.3, .3, board('NORA & FRIENDS', 'goods', 9.4, 2.3, '#f3e9cf', '#7a2418'), 0, 14.9, 3.4); for (const sx of [-4.2, 4.2]) kc.B(.3, 2.4, .3, timber, sx, 13.9, 3.2);                                                                         // its name, on a board above the awning
          // the counter: trays of buns, iced and plain, a row of pies, a tiered stand, a basket of long loaves
          for (const [tx, kind] of [[-4.2, 0], [-1.9, 1], [.5, 2]]) { kc.B(2, .12, 2.6, tray, tx, 6.7, .9); for (let i = 0; i < 6; i++) { const x = tx - .5 + (i % 2), z = .1 + Math.floor(i / 2) * .85;
              if (kind === 0) kc.S(.42, i % 3 ? bun : crust, x, 6.98, z, { sy: .7 }); else if (kind === 1) { kc.S(.4, bun, x, 6.95, z, { sy: .6 }); kc.S(.3, i % 2 ? pinkM : creamM, x, 7.12, z, { sy: .45 }); } else { kc.C(.42, .46, .34, 10, crust, x, 6.93, z); kc.C(.32, .32, .08, 10, i % 2 ? berry : choc, x, 7.12, z); } } }
          kc.C(.9, .9, .1, 12, tray, 3.2, 7.0, 1); kc.C(.1, .1, 1.5, 6, iron, 3.2, 7.4, 1); kc.C(.62, .62, .1, 12, tray, 3.2, 7.9, 1); for (let i = 0; i < 7; i++) { const a = i * .9, top = i > 4; kc.S(.26, i % 2 ? pinkM : choc, 3.2 + Math.cos(a) * (top ? .3 : .6), top ? 8.14 : 7.24, 1 + Math.sin(a) * (top ? .3 : .6), { sy: .8 }); }
          kc.C(.85, .65, 1.3, 9, terra, 4.6, 7.25, -.6); for (let i = 0; i < 5; i++) rod(cart, i % 2 ? bun : crust, [4.6 + (i - 2) * .22, 7, -.6], [4.3 + (i - 2) * .5, 9.6, -.9 - (i % 2) * .3], .2, .16, 6);
          for (let i = 0; i < 9; i++) kc.S(.45, i % 3 ? crust : bun, -4 + i, i % 2 ? 8.85 : 10.75, -1.3, { sy: .7, sx: 1.4 });                                                                                                                              // loaves along the shelves
          NS(kc.S(.42, litO, 5.1, 11.2, 3.6)); kc.C(.06, .06, 1, 4, iron, 5.1, 11.9, 3.6); kc.C(.5, .3, .25, 6, iron, 5.1, 11.6, 3.6);                                                                                                                          // a lantern at the corner
          // the barrel of Urzmaktok's brew, on its side in a cradle at the east end of the cart
          { const bar = new THREE.Group(), kb = kit(bar); kb.C(2.05, 2.7, 3.3, 16, plankD, 0, 1.65, 0); kb.C(2.7, 2.05, 3.3, 16, plankD, 0, -1.65, 0); for (const y of [-2.9, -1.2, 1.2, 2.9]) kb.T(Math.abs(y) > 2 ? 2.2 : 2.62, .14, iron, 0, y, 0, { rx: Math.PI / 2 }); kb.C(1.95, 1.95, .12, 16, plank, 0, 3.3, 0);
            kb.C(.16, .16, 1.1, 6, iron, 0, 3.7, 1.2); kb.C(.1, .1, .9, 6, iron, 0, 4.1, 1.5, { rx: Math.PI / 2 }); kb.B(.9, .12, .3, timber, 0, 4.25, 1.2);                                                                                                // the tap, low on its face
            bar.rotation.x = Math.PI / 2; bar.position.set(10.2, 3.7, .2); fold(cart, bar); }
          for (const sz of [-1.6, 2]) { for (const rz of [-.55, .55]) kc.B(.5, 5.4, .5, timber, 10.2, 1.9, sz, { rz }); kc.B(5.6, .4, .5, timber, 10.2, .25, sz); } kc.B(4.6, 1.5, .25, board("URZMAKTOK'S", 'brew', 4.6, 1.5, '#2c1c12', '#f0d68a'), 10.2, 7.2, .2, { rx: -.12 }); for (const sx of [-1.9, 1.9]) kc.B(.25, 1.6, .25, timber, 10.2 + sx, 6.5, .2);
          kc.B(2.4, 1.6, 2, plank, 10.6, .8, 5.6, { ry: .3 }); for (const [x, z] of [[10.2, 5.3], [11.1, 5.9]]) { kc.C(.38, .32, .8, 8, timber, x, 2, z); kc.S(.34, creamM, x, 2.45, z, { sy: .5 }); kc.T(.24, .06, iron, x + .4, 2, z, { ry: Math.PI / 2 }); }               // tankards on a crate, heads on
          // and round about: a board out front with the day's prices, two stools, sacks of flour
          for (const rx of [-.28, .28]) kc.B(2.2, 3.6, .14, solid(0x1c2420, .9), -7.6, 1.75, 5.2 + rx * 2.4, { rx }); kc.B(2.4, .2, .9, timber, -7.6, 3.5, 5.2);
          for (const [x, z] of [[-2, 6.4], [2.6, 6.8]]) { kc.C(.9, .9, .25, 10, plank, x, 2.3, z); for (let q = 0; q < 3; q++) rod(cart, timber, [x + Math.cos(q * 2.1) * .9, 0, z + Math.sin(q * 2.1) * .9], [x + Math.cos(q * 2.1) * .5, 2.2, z + Math.sin(q * 2.1) * .5], .12, .12, 5); }
          for (const [x, z, r] of [[-7.4, -1.6, 1.2], [-8.6, .2, 1.05], [-7.8, -.4, .9]]) kc.S(r, trim, x, r * .7 + (r < 1 ? 1.3 : 0), z, { sy: .72 });
          const cx0 = 3, cz0 = 30; cart.scale.setScalar(.8); cart.rotation.y = .16; cart.position.set(cx0, heightAt(c[0] + cx0, c[1] + cz0) - y0, cz0); fold(g, cart);
          lanternPts.push([c[0] + cx0 + 4.5, y0 + 9.2, c[1] + cz0 + 2.2, { c: [1.7, 1.15, .5], size: 5, drift: .1, speed: .6 }]); }
      }, { y: y0, hexes: [[20, 29]], top: 40, view: 300 }); chimneys.push([c[0] + 8.4, y0 + 33, c[1] - 3.4]);
      lanternPts.push([c[0] + 9, y0 + 6.4, c[1] + 15, { c: [.9, 2.5, 1], size: 12, drift: .2, speed: .7 }]); const cm = mist({ n: 26, seed: 97, r0: .5, r1: 3, y0: 3.4, y1: 14, spin: .3, rise: .5, size: 2.6, alpha: .5, col: [.6, 2, .8], add: true }); cm.position.set(c[0] - 6, y0, c[1] + 15); scene.add(cm); }

    // ---------------- Nanny Sugarmire: no hex of her own. Her house goes on four stout timber legs, knees out to the sides like a crab's, round and round the Detention Bog north of the sluice, and never stops ----------------
    { const N = 96, P = []; for (let i = 0; i < N; i++) { const a = i / N * 6.283, rr = 1 + .12 * Math.sin(a * 3 + 1) + .08 * Math.sin(a * 5); P.push([(X(.85) + Math.cos(a) * 200 * rr) * S, (Z(.745) + Math.sin(a) * 195 * rr) * S]); }
      const cum = [0]; for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(P[i % N][0] - P[i - 1][0], P[i % N][1] - P[i - 1][1])); const LEN = cum[N];
      const at = d => { d = ((d % LEN) + LEN) % LEN; let i = 0; while (i < N - 1 && cum[i + 1] < d) i++; const f = (d - cum[i]) / (cum[i + 1] - cum[i]), a = P[i], b = P[(i + 1) % N]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])]; }, gnd = (x, z) => Math.max(heightAt(x, z), 0);
      const HIP = 15.5, A1 = 8, A2 = 8.8, STEP = 24, BETA = .7, WID = 11, FWD = 10, walker = new THREE.Group(), hut = new THREE.Group(), legM = solid(0x5a4630, .9, { flatShading: true }), ironL = solid(0x2c2a2e, .5, { metalness: .6 }), wall = solid(0xc8b898, .9), thatchD = solid(0x6e5c34, 1, { flatShading: true }), slate = solid(0x4a4658, .7, { flatShading: true });
      { const hs = new THREE.Group(), k = kit(hs); hs.scale.setScalar(1.35);
        k.B(24, 1.4, 20, timber, 0, .7, 0); for (const x of [-9, 0, 9]) k.B(1.4, 1.6, 22, timber, x, -.6, 0); for (const z of [-8, 8]) k.B(26, 1.6, 1.4, timber, 0, -.8, z); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.B(3, 3, 3, ironL, sx * 8, -1.2, sz * 8); rod(hs, timber, [sx * 8, -.6, sz * 8], [sx * 3, -.6, sz * 3], .5, .5, 4); }                         // the frame she is built on, iron-shod where the legs take hold
        k.C(9.6, 10, 10, 14, wall, 0, 6.4, 0); for (let i = 0; i < 10; i++) { const a = i * .628; rod(hs, timber, [Math.cos(a) * 10.2, 1.4, Math.sin(a) * 10.2], [Math.cos(a) * 9.8, 11.4, Math.sin(a) * 9.8], .4, .4, 4); } k.T(10, .4, timber, 0, 6.8, 0, { rx: Math.PI / 2 });
        M(hs, new THREE.ConeGeometry(14.6, 9, 14), thatch, 0, 15.6, 0); M(hs, new THREE.ConeGeometry(10, 11, 12), thatchD, 0, 21.4, 0); M(hs, new THREE.ConeGeometry(3.4, 6, 8), thatch, 1.6, 29, .6, { rz: -.4 }); for (let i = 0; i < 20; i++) { const a = i * .314; M(hs, new THREE.ConeGeometry(.8, 3.6, 4), thatchD, Math.cos(a) * 14, 10.6, Math.sin(a) * 14, { rx: Math.PI }); }
        k.B(9, 7.4, 8, wall, -11, 5.1, 2); for (const sz of [-1, 1]) k.B(.6, 7.4, .6, timber, -15.4, 5.1, 2 + sz * 3.9); M(hs, gable(10.4, 4.6, 9.4), slate, -11, 8.8, 2); NS(k.B(.4, 2.6, 2.6, litG, -15.6, 5.6, 2)); k.B(.5, .4, 3.4, timber, -15.7, 4, 2);                                                               // a lean-to room on the back, slated
        k.B(3.4, 3.4, 3, wall, 4, 17, 8.4); M(hs, gable(4.4, 2.2, 4), thatchD, 4, 18.7, 8.4); NS(k.B(1.8, 1.8, .3, litG, 4, 17, 10));                                                                                                                                                                                   // a dormer
        k.B(.6, 6.6, 3.8, plankD, 9.9, 5, 0); for (const sz of [-1, 1]) k.B(.8, 7, .7, timber, 10.1, 5, sz * 2.3); k.B(.9, .8, 5.4, timber, 10.1, 8.6, 0); k.B(5, .6, 7, plank, 13, 1.6, 0); for (const sz of [-1, 1]) { k.B(.5, 3.4, .5, timber, 15.2, 3.2, sz * 3.2); rod(hs, rope, [15.2, 4.8, sz * 3.2], [10.4, 4.8, sz * 3.2], .1, .1, 4); } NS(k.S(.6, litO, 10.6, 9.8, 2.8));   // the door, a railed stoop, a lamp
        for (let i = 0; i < 5; i++) { rod(hs, rope, [15.6, 1.4, -1.6], [15.9, -11, -1.6], .12, .12, 4); rod(hs, rope, [15.6, 1.4, 1.6], [15.9, -11, 1.6], .12, .12, 4); k.B(.4, .4, 3.4, timber, 15.75, -1 - i * 2.2, 0); }
        for (const a of [.9, 2.2, 4, 5.3]) { const ca = Math.cos(a), sa = Math.sin(a); NS(M(hs, new THREE.CircleGeometry(1.5, 10), litG, ca * 10.05, 7.4, sa * 10.05, { ry: -a + Math.PI / 2 })); M(hs, new THREE.TorusGeometry(1.6, .3, 5, 10), timber, ca * 10.1, 7.4, sa * 10.1, { ry: -a + Math.PI / 2 }); k.B(.3, 3.4, 1.4, plankD, ca * 10.3 - sa * 2.4, 7.4, sa * 10.3 + ca * 2.4, { ry: -a }); k.B(.3, 3.4, 1.4, plankD, ca * 10.3 + sa * 2.4, 7.4, sa * 10.3 - ca * 2.4, { ry: -a }); k.B(1.2, 1, 3.6, plankD, ca * 10.8, 5.2, sa * 10.8, { ry: -a }); for (let q = 0; q < 3; q++) M(hs, new THREE.IcosahedronGeometry(.6, 0), q % 2 ? pinkM : leaf[0], ca * 10.9 - sa * (q - 1) * 1.1, 6, sa * 10.9 + ca * (q - 1) * 1.1); }   // shuttered windows with flower boxes
        rod(hs, stoneM, [-4, 15, 3], [-6, 27, 4], 1.3, 1); M(hs, new THREE.ConeGeometry(1.8, 1.6, 8), stoneM, -6, 28, 4); rod(hs, ironL, [1.6, 31.6, .6], [1.6, 36, .6], .12, .12, 4); k.B(3, .3, .3, ironL, 1.6, 34.6, .6); M(hs, new THREE.ConeGeometry(.9, 2.4, 3), ironL, 2.6, 35.6, .6, { rz: -Math.PI / 2 });                                                        // chimney and weathervane
        rod(hs, rope, [-9.6, 9, -8], [5, 10, -12.6], .08, .08, 3); for (let i = 0; i < 4; i++) k.B(1.8, 2.4, .15, i % 2 ? solid(0xd8d2c0, .9) : solid(0x7a8aa0, .9), -7 + i * 3, 8.2 + i * .08, -9.2 - i * 1.1, { ry: -.3 });                                                                                             // washing on a line
        for (let i = 0; i < 9; i++) { const a = i * .7; rod(hs, rope, [Math.cos(a) * 8.6, -.8, Math.sin(a) * 8.6], [Math.cos(a) * 9.2, -4 - (i % 3) * 1.6, Math.sin(a) * 9.2], .12, .12, 4); M(hs, i % 3 === 0 ? new THREE.IcosahedronGeometry(.9, 0) : i % 3 === 1 ? new THREE.CylinderGeometry(.3, .3, 2.2, 5) : new THREE.SphereGeometry(1.1, 6, 5), i % 3 === 2 ? rope : boneM, Math.cos(a) * 9.2, -4.8 - (i % 3) * 1.6, Math.sin(a) * 9.2); }
        k.C(2, 1.7, 4, 9, plankD, -3, -3.2, 0, { rz: Math.PI / 2 }); rod(hs, timber, [0, -1, 0], [0, -6, 0], .15, .15, 4); k.B(2.6, 2.6, 2.6, timber, 0, -7, 0, { ry: .785 }); NS(k.S(1.3, litG, 0, -7, 0));                                                                                                              // a cask slung beneath, and the lantern
        mergeKids(hs); hut.add(hs); }
      walker.add(hut); movers.push({ o: hut, target: () => ({ hex: hexAt(33, 31), label: 'Nanny Sugarmire' }) }); const unit = new THREE.CylinderGeometry(1, 1, 1, 7), upV = new THREE.Vector3(0, 1, 0), dV = new THREE.Vector3(), HW = WID * 1.35 * .58, HF = FWD * 1.35 * .62;
      const legs = [[1, 1, 0], [1, -1, .5], [-1, 1, .5], [-1, -1, 0]].map(([fo, sd, ph]) => { const th = new THREE.Mesh(unit, legM), sh = new THREE.Mesh(unit, legM), kn = new THREE.Mesh(new THREE.SphereGeometry(2.1, 8, 6), ironL), hp = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), ironL), ft = new THREE.Group(); M(ft, new THREE.CylinderGeometry(3, 4, 2.4, 9), legM, 0, 1.2, 0); M(ft, new THREE.CylinderGeometry(3.3, 3.3, .7, 9), ironL, 0, 2.2, 0); mergeKids(ft); walker.add(th, sh, kn, hp, ft); return { th, sh, kn, hp, ft, fo, sd, ph }; });
      walker.traverse(m => { if (m.isMesh) { m.castShadow = !m.userData.noShadow; m.raycast = () => {}; m.frustumCulled = false; } }); scene.add(walker);
      const place = (m, a, b, r) => { dV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = dV.length(); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.scale.set(r, L, r); m.quaternion.setFromUnitVectors(upV, dV.normalize()); };
      anim.push(t => { const s = t * 6, [bx, bz, ha] = at(s), fx = Math.cos(ha), fz = Math.sin(ha), nx = -fz, nz = fx; let gs = 0; for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) gs += gnd(bx + fx * a * HF + nx * b * HW, bz + fz * a * HF + nz * b * HW); const by = gs / 4 + HIP + .3 * Math.sin(s / STEP * 12.566);
        hut.position.set(bx, by, bz); hut.rotation.set(.01 * Math.sin(s / STEP * 12.566 + 1), -ha, .016 * Math.sin(s / STEP * 6.283), 'YXZ');
        for (const lg of legs) { const { fo, sd, ph } = lg, cyc = s / STEP + ph, kk = Math.floor(cyc), f = cyc - kk, plant = q => { const p = at((q - ph + BETA / 2) * STEP + fo * (HF + 2)), x = p[0] - Math.sin(p[2]) * sd * (HW + 1.2), z = p[1] + Math.cos(p[2]) * sd * (HW + 1.2); return [x, gnd(x, z), z]; };
          let Ft = plant(kk); if (f > BETA) { const u = (f - BETA) / (1 - BETA), e = u * u * (3 - 2 * u), G2 = plant(kk + 1); Ft = [lerp(Ft[0], G2[0], e), lerp(Ft[1], G2[1], e) + 4 * Math.sin(Math.PI * u), lerp(Ft[2], G2[2], e)]; }
          const H = [bx + fx * fo * HF + nx * sd * HW, by - 1.4, bz + fz * fo * HF + nz * sd * HW]; let dx = Ft[0] - H[0], dy = Ft[1] + 2.4 - H[1], dz = Ft[2] - H[2], d = Math.hypot(dx, dy, dz); const mx = (A1 + A2) * .985; if (d > mx) { const q = mx / d; dx *= q; dy *= q; dz *= q; d = mx; }
          const A = [H[0] + dx, H[1] + dy, H[2] + dz], a = (A1 * A1 - A2 * A2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(A1 * A1 - a * a, 0)), ux = dx / d, uy = dy / d, uz = dz / d, b0 = [-fx * fo + nx * sd * .15, .2, -fz * fo + nz * sd * .15], dot = b0[0] * ux + b0[1] * uy + b0[2] * uz; let px = b0[0] - ux * dot, py = b0[1] - uy * dot, pz = b0[2] - uz * dot; const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
          const K = [H[0] + ux * a + px * hh, H[1] + uy * a + py * hh, H[2] + uz * a + pz * hh]; place(lg.th, H, K, 2.2); place(lg.sh, K, A, 1.7); lg.kn.position.set(K[0], K[1], K[2]); lg.hp.position.set(H[0], H[1], H[2]); lg.ft.position.set(A[0], A[1] - 2.4, A[2]); lg.ft.rotation.y = -ha; } }); }
  }

  // ================= scenery =================
  const L = { conifer: [], broad: [], mangrove: [], dead: [], bog: [], box: [], spire: [], sp: [[], [], []] };
  const sc = () => .8 + rng() * .7, tintv = () => { const v = .8 + rng() * .4; return [v, v, v * (.9 + rng() * .2)]; };
  const rnd = () => [(rng() - .5) * MAP_W * .98, (rng() - .5) * MAP_D * .98];
  // the Sanguine Sluice takes every hex its channels run through that nothing else has claimed
  { const st = things.find(t => t.name === 'Sanguine Sluice'); if (st) for (let q = 20; q <= 36; q++) for (let r = 28; r <= 48; r++) { const d = hexD(q, r), key = hexKey(q, r); if (!hexOwner.has(key) && st.hexes.length < NH && SLUICE.dist(d[0], d[1]) < 32) { hexOwner.set(key, st); st.hexes.push(hexAt(q, r)); } } }
  const free = (x, z) => { const h = worldToHex(x, z); return !hexOwner.has(hexKey(h.q, h.r)) && !sqInside(x / S, z / S) && !inkQ(x / S, z / S) && SLUICE.dist(x / S, z / S) > 24; };

  // Quandrix: trees planted in exact mathematical figures
  const TW = Wp(TORUS);
  const plant = (x, z, sz = 1.15) => { if (Math.abs(x) > MAP_W / 2 - 6 || Math.abs(z) > MAP_D / 2 - 6 || !free(x, z) || nearWalk(x, z, 14) || Math.hypot(x - TW[0], z - TW[1]) < (TB_R + 12) * S || heightAt(x, z) < 4) return;
    L.conifer.push({ x, y: heightAt(x, z) - .2, z, s: sz, ry: 0, tint: [.9, 1.1, .95] }); };
  const flake = (cx, cz, rad, depth, out) => { if (!depth) { out.push([cx, cz]); return; } flake(cx, cz, rad / 3, depth - 1, out);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; flake(cx + Math.cos(a) * rad * 2 / 3, cz + Math.sin(a) * rad * 2 / 3, rad / 3, depth - 1, out); } };
  let qS = 1;
  [[.40, .155, 1.0], [.60, .155, 1.7], [.44, .225, .75], [.56, .225, 1.35]].forEach(([u, v, sz]) => { const pts = []; flake(X(u) * S, Z(v) * S, 112 * S, 3, pts); for (const [x, z] of pts) plant(x, z, sz); });   // hexaflakes
  [[.225, .165, 2.0, 90], [.655, .085, .7, 300]].forEach(([u, v, sz, n]) => { for (let i = 1; i <= n; i++) { const r = (sz > 1 ? 11 : 8.6) * Math.sqrt(i), a = i * 2.399963; plant(X(u) * S + Math.cos(a) * r, Z(v) * S + Math.sin(a) * r, sz); } });   // golden-angle spirals
  const sier = (ax, az, bx, bz, cx, cz, depth) => { if (!depth) { plant(ax, az, qS); plant(bx, bz, qS); plant(cx, cz, qS); return; }
    const abx = (ax + bx) / 2, abz = (az + bz) / 2, bcx = (bx + cx) / 2, bcz = (bz + cz) / 2, cax = (cx + ax) / 2, caz = (cz + az) / 2;
    sier(ax, az, abx, abz, cax, caz, depth - 1); sier(abx, abz, bx, bz, bcx, bcz, depth - 1); sier(cax, caz, bcx, bcz, cx, cz, depth - 1); };
  [[.185, .040, 2.3, 126], [.625, .045, 1.2, 150]].forEach(([u, v, sz, R]) => { qS = sz; const cx = X(u) * S, cz = Z(v) * S; sier(cx, cz - R, cx - R * .866, cz + R * .5, cx + R * .866, cz + R * .5, sz > 2 ? 3 : 4); });   // Sierpinski triangles
  // central campus: scattered broadleaf clumps
  for (let n = 0; n < 5200; n++) { const [x, z] = rnd(); weightsW(x, z); if (WT[CENTRAL] < .7) continue;
    if (fbm(x / 220, z / 220, 2) < .12 || Math.hypot(x - CENW[0], z - CENW[1]) < 400 * S || !free(x, z) || nearWalk(x, z, 20)) continue;
    L.broad.push({ x, y: heightAt(x, z) - .2, z, s: sc(), ry: rng() * 6.3, tint: tintv() }); }
  // Silverquill: two dark forests; the southern one is a broad belt of big trees above the dunes
  FOREST.forEach((f, fi) => { for (let n = 0; n < (fi ? 4200 : 1300); n++) { const a = rng() * 6.283, d = Math.sqrt(rng()) * (.8 + .25 * rng()), x = (f[0] + Math.cos(a) * d * f[2]) * S, z = (f[1] + Math.sin(a) * d * f[3]) * S;
      if (Math.abs(x) > MAP_W / 2 - 8 || Math.abs(z) > MAP_D / 2 - 8 || !free(x, z) || fbm(x / 260, z / 260, 2) < -.4) continue;
      const it = { x, y: heightAt(x, z) - .2, z, s: (fi ? 1.6 : 1) + rng() * 1.2, ry: rng() * 6.3, rz: (rng() - .5) * .25 };
      if (rng() < .5) L.dead.push(it); else L.conifer.push({ ...it, rz: 0, tint: [.28, .3, .3] }); } });
  // Witherbloom mangrove swamp + Detention Bog snags
  for (let n = 0; n < 32000; n++) { const [x, z] = rnd(); const h = heightAt(x, z); weightsW(x, z);
    if (WT[WITH] > .55 && h > -1.6 * S && h < 3.4 * S && fbm(x / 170 + 3, z / 170, 2) > -.25 && L.mangrove.length < 5000 && free(x, z) && !nearWalk(x, z, 14))
      { const e = sstep(X(.64) * S, X(.725) * S, x), t = tintv(); L.mangrove.push({ x, y: h - .6, z, s: rng() < .03 ? 3.3 + rng() * 1.5 : rng() < .1 ? 1.9 + rng() * 1.4 : .7 + rng() * .9, ry: rng() * 6.3, tint: [t[0], t[1] * (1 - .25 * e), t[2] * (1 - .5 * e)] }); }
    else if (WT[BOG] > .55 && h > -2.4 * S && rng() < .42 && free(x, z)) L.bog.push({ x, y: h - .5, z, s: 1.3 + rng() * 1.7, ry: rng() * 6.3, rz: (rng() - .5) * .45, rx: (rng() - .5) * .3, tint: tintv() }); }
  // Prismari spires: the purple stone itself swept up by the wind. Nearly all stand in Furygale, with only a handful elsewhere.
  const rngS = mulberry32(20261003); for (let i = 0; i < 129989; i++) rngS();   // the spires draw from their own stream, wound on to where it stood when this field was approved
  const tintvS = () => { const v = .8 + rngS() * .4; return [v, v, v * (.9 + rngS() * .2)]; }, rndS = () => [(rngS() - .5) * MAP_W * .98, (rngS() - .5) * MAP_D * .98];
  const PH = Wp(PRISHALL), FW = Wp(FURY), FR = 165 * S;
  const lavaNear = (x, z) => { for (const p of OUTLETS) if (polyDist(p, x / S, z / S) < 24) return true; for (const v of VOLC) if (v.path && polyDist(v.path, x / S, z / S) < 24) return true; return false; };
  const REACH = [.514, .673, .357];                                                             // how far each spire shape leans downwind, per unit of size
  const pushSpire = (x, z, s) => { const gi = Math.floor(rngS() * 3), h = heightAt(x, z), sy = s * (.85 + .5 * rngS()), sz = s * (.8 + .5 * rngS()), ry = -WIND_A + (rngS() - .5) * 1.7, tint = tintvS();
    let lo = h, hi = h; for (let j = 0; j < 6; j++) { const hh = heightAt(x + Math.cos(j * 1.047) * s * .27, z + Math.sin(j * 1.047) * s * .27); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
    if (polyDist(WPATH, x / S, z / S) < 34) return;                                             // the Wanderer's road is kept clear
    if (hi - lo > s * .5) return;                                                               // too steep to root a spire: it would hang in the air on the downhill side
    for (const f of [0, .5, 1]) if (lavaNear(x + Math.cos(ry) * REACH[gi] * s * f, z - Math.sin(ry) * REACH[gi] * s * f)) return;   // never rooted in, or leaning out over, a lava flow
    L.sp[gi].push({ x, y: Math.min(h - s * .035, lo - s * .01), z, sx: s, sy, sz, ry, tint }); };
  for (let n = 0; n < 150; n++) { const a = rngS() * 6.283, d = FR * Math.pow(rngS(), .7), x = FW[0] + Math.cos(a) * d * 1.05, z = FW[1] + Math.sin(a) * d * .9;
    if (Math.abs(x) > MAP_W / 2 - 20 || !free(x, z) || Math.hypot(x - ARCW[0], z - ARCW[1]) < 120 || Math.hypot(x - DCW[0], z - DCW[1]) < 100) continue; /* keeps the Archive door and the DraftCoil clear */ const big = rngS(); pushSpire(x, z, 26 + 70 * big + 210 * Math.pow(big, 6) * (1 - d / FR * .6)); }
  for (let n = 0, c = 0; n < 8000 && c < 14; n++) { const [x, z] = rndS(); weightsW(x, z); if (WT[PRIS] < .7 || heightAt(x, z) < 9 * S || nearWalk(x, z, 30) || z > Z(.86) * S) continue;
    if (Math.hypot(x - FW[0], z - FW[1]) < FR * 1.4 || Math.hypot(x - PH[0], z - PH[1]) < 170 || !free(x, z)) continue; pushSpire(x, z, 40 + 110 * rngS()); c++; }

  instanced(conifer, treeMat, L.conifer); instanced(broad, treeMat, L.broad); instanced(mangrove, treeMat, L.mangrove); instanced(dead, treeMat, L.dead); instanced(bogTree, treeMat, L.bog);
  const marble = new THREE.MeshStandardMaterial({ roughness: .22, metalness: 0, envMapIntensity: 1 });
  instanced(new THREE.BoxGeometry(1, 1, 1), marble, L.box); instanced(new THREE.ConeGeometry(1, 1, 4), marble, L.spire);
  const spireMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .42, metalness: 0, flatShading: true, envMapIntensity: .9, side: THREE.DoubleSide });
  const spires = [spireGeo(1.15, 11), spireGeo(1.75, 23), spireGeo(.75, 37)];
  spires.forEach((g, i) => instanced(g, spireMat, L.sp[i]));

  // Conjurot Hall (3 hexes): a towering structure with a glassed-in observation level, circled by strands of elemental energy
  addThing('Conjurot Hall', '🎨', PH, 2.2, 95, g => {
    const stoneP = solid(0x3d2c52, .45, { flatShading: true }), trim = solid(0x8a6aa8, .4, { flatShading: true });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fe6e0, emissive: 0x2a8a84, emissiveIntensity: .9, roughness: .05, transparent: true, opacity: .72, envMapIntensity: 2 });
    M(g, new THREE.CylinderGeometry(27, 31, 6, 10), stoneP, 0, 3, 0);
    const prof = [[19, 6], [15, 22], [11.5, 46], [9.5, 70], [10.5, 78], [14.5, 84], [14.5, 86]].map(p => new THREE.Vector2(p[0], p[1]));
    M(g, new THREE.LatheGeometry(prof, 10), stoneP, 0, 0, 0);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; M(g, new THREE.BoxGeometry(3, 34, 9), trim, Math.cos(a) * 17, 17, Math.sin(a) * 17, { ry: -a + Math.PI / 2 }); }
    M(g, new THREE.CylinderGeometry(13.5, 13.5, 13, 10), glass, 0, 92.5, 0);
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; M(g, new THREE.BoxGeometry(.9, 13, .9), trim, Math.cos(a) * 13.6, 92.5, Math.sin(a) * 13.6); }
    M(g, new THREE.CylinderGeometry(15.5, 14.5, 2, 10), trim, 0, 100, 0);
    M(g, new THREE.ConeGeometry(15, 20, 10), solid(0x6a3a7a, .35, { flatShading: true }), 0, 111, 0);
    M(g, new THREE.ConeGeometry(1.2, 14, 6), trim, 0, 127, 0);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + .6, sz = 78 + (i % 3) * 20; M(g, spires[i % 3], spireMat, Math.cos(a) * 40, -3, Math.sin(a) * 40, { ry: -(a + 1.25), sx: sz, sy: sz, sz }); }
  }, { hexes: [[10, 41], [11, 40], [11, 41]], top: 140, view: 640 });
  { const py = heightAt(PH[0], PH[1]);
    for (const o of [{ n: 280, seed: 201, arms: 2, jit: .2, r0: 70, r1: 30, y0: 14, y1: 255, spin: .55, rise: .2, twist: 5, size: 4.6, alpha: .85, col: [2.6, 1.0, .25], add: true },      // fire: two ropes of embers winding up it
                     { n: 90, seed: 202, arms: 2, jit: .5, r0: 66, r1: 32, y0: 18, y1: 245, spin: .55, rise: .26, twist: 5, size: 12, alpha: .14, col: [2.4, .6, .1], add: true },          // and the glow that goes with them
                     { n: 260, seed: 203, arms: 2, jit: .2, r0: 44, r1: 80, y0: 236, y1: 16, spin: -.4, rise: .18, twist: 4, size: 4, alpha: .8, col: [.5, 1.3, 2.6], add: true },         // water: spray winding down the other way and flaring out at the foot
                     { n: 140, seed: 204, arms: 3, jit: .5, r0: 92, r1: 50, y0: 10, y1: 275, spin: .8, rise: .3, twist: 3, size: 17, alpha: .09, col: [.85, .9, 1] }]) { const m = mist(o); m.position.set(PH[0], py, PH[1]); scene.add(m); }   // wind: pale streamers round all of it
    lightning([[PH[0], py + 127 * 2.2, PH[1]]], 8, 1.3, 420); }                                                                                                                             // and now and then a bolt to the spire

  // the black bridge where the Prismari walkway crosses the mountain river: an arched span of obsidian, with the same wind-swept spires as the rest of Prismari growing from its flanks and its abutments
  { const mid = Wp(BR2.p), dir = BR2.dir, len = 150, half = len / 2, ry = -Math.atan2(dir[1], dir[0]), br = mulberry32(77), HL = half + 16;
    const eA = [mid[0] - dir[0] * half, mid[1] - dir[1] * half], eB = [mid[0] + dir[0] * half, mid[1] + dir[1] * half];
    const y = Math.max(heightAt(eA[0], eA[1]), heightAt(eB[0], eB[1]), 4) + 2, obsM = solid(0x16121c, .32, { flatShading: true });
    const deckY = x => y + 8 * (1 - (x / HL) * (x / HL)), toW = (x, z) => [mid[0] + x * dir[0] - z * dir[1], mid[1] + x * dir[1] + z * dir[0]];                 // the deck rises gently to the middle
    const brT = addThing('Prismari Bridge', '🌉', mid, 1, HEX_R * .78, g => { const paveM = solid(0x4a4258, .6), seam = glowM(0xb070ff, 2.2);
      const side = new THREE.Shape(); side.moveTo(-HL, y - 40); side.lineTo(-HL, y); side.quadraticCurveTo(0, y + 16, HL, y); side.lineTo(HL, y - 40); side.lineTo(HL - 24, y - 40); side.quadraticCurveTo(0, y + 26, -HL + 24, y - 40); side.closePath();
      M(g, new THREE.ExtrudeGeometry(side, { depth: 22, bevelEnabled: false, curveSegments: 20 }), obsM, 0, 0, -11);                                             // the span and its arch, cut from one piece
      for (let i = -8; i < 8; i++) { const x0 = i * HL / 8, x1 = (i + 1) * HL / 8, xm = (x0 + x1) / 2, ym = (deckY(x0) + deckY(x1)) / 2, sl2 = Math.atan2(deckY(x1) - deckY(x0), x1 - x0), L = Math.hypot(x1 - x0, deckY(x1) - deckY(x0)) + .5;
        M(g, new THREE.BoxGeometry(L, .7, 12), paveM, xm, ym + .25, 0, { rz: sl2 });                                                                              // paving
        for (const sd of [-1, 1]) { M(g, new THREE.BoxGeometry(L, 3.4, 2), obsM, xm, ym + 1.6, sd * 10, { rz: sl2 }); NS(M(g, new THREE.BoxGeometry(L, .5, .5), seam, xm, ym + .4, sd * 11.2, { rz: sl2 })); } }   // parapets, and a seam of light along each flank
      for (const sx of [-1, 1]) { M(g, new THREE.BoxGeometry(28, 46, 34), obsM, sx * (HL - 12), y - 22.5, 0); M(g, new THREE.CylinderGeometry(9, 15, 44, 6), obsM, sx * (HL - 30), y - 24, 0, { sz: 1.5 });   // abutments and cutwaters
        for (const sd of [-1, 1]) { const px = sx * (HL - 16), py = deckY(px), w = toW(px, sd * 14); M(g, new THREE.CylinderGeometry(1.8, 3.2, 15, 4), obsM, px, py + 7, sd * 14, { ry: .785 }); NS(M(g, new THREE.OctahedronGeometry(2.2, 0), seam, px, py + 17.5, sd * 14));
          lanternPts.push([w[0], py + 17.5, w[1], { c: [1.6, .8, 2.6], size: 10, drift: .3, speed: .6 }]); } }
      // spires: small ones sweeping up from the flanks of the span, great ones rooted in the banks at each end, all leaning with the wind
      const sg = [], windL = -WIND_A - ry, addSp = (q, x, yy, z, ryy, sz, sy2) => { const ge = spires[q].clone(); dummy.position.set(x, yy, z); dummy.rotation.set(0, ryy, 0); dummy.scale.set(sz, sy2, sz * .8); dummy.updateMatrix(); ge.applyMatrix4(dummy.matrix); sg.push(ge); };
      for (let i = -5; i <= 5; i++) for (const sd of [-1, 1]) { if ((i + sd + 12) % 3 === 0) continue; const x = i * HL / 5.6, sz = 20 + 9 * Math.abs(i) + 12 * br();
        addSp((i + 6 + (sd > 0 ? 1 : 0)) % 3, x, deckY(x) - sz * .25, sd * (11 + sz * .1), windL + (br() - .5) * 1.2, sz, sz * (.9 + .5 * br())); }
      for (const sx of [-1, 1]) for (const sd of [-1, 1]) { const x = sx * (HL + 6 + 10 * br()), z = sd * (24 + 8 * br()), w = toW(x, z), sz = 70 + 40 * br(); addSp((sx + sd + 2) % 3, x, heightAt(w[0], w[1]) - sz * .04, z, windL + (br() - .5) * .9, sz, sz * (1 + .3 * br())); }
      g.add(new THREE.Mesh(mergeGeometries(sg), spireMat));
    }, { y: 0, ry, top: y + 60, seg: [eA[0], eA[1], eB[0], eB[1]], view: 480 });
    if (reefThing) { for (const h of brT.hexes) hexOwner.delete(hexKey(h.q, h.r)); brT.group.userData.thing = reefThing; things.splice(things.indexOf(brT), 1);
      for (const d of [-50, 0, 50]) reefTips.push([mid[0] + dir[0] * d, y + 40, mid[1] + dir[1] * d]); lightning(reefTips, 4.6, 2.2); lightning(reefTips, 7.3, 5.1); } }

  // Furygale: gales of wind, fire and ice turning among the spires - funnels of whirling mist, not drawn lines
  for (const [dx, dz, kinds, sc2, sd] of [[-40, 30, ['wind', 'ice'], 1.5, 61], [70, -60, ['wind', 'fire'], 1.3, 62], [55, 75, ['ice', 'wind'], 1.1, 63]]) {
    const gg = new THREE.Group(), x = FW[0] + dx * S, z = FW[1] + dz * S, H = 150 * sc2; gg.position.set(x, heightAt(x, z), z); scene.add(gg);
    kinds.forEach((kd, i) => { const fire = kd === 'fire', ice = kd === 'ice', col = fire ? [1.5, .42, .07] : ice ? [.6, .85, 1.05] : [.8, .84, .92];
      gg.add(mist({ n: 300, seed: sd + i * 7, arms: 3, r0: 4 + 4 * i, r1: (24 + 9 * i) * sc2, y0: 2, y1: H, spin: 1.5 - .5 * i, rise: .2, twist: 7, pow: 1.5, size: (fire ? 12 : 14) * sc2, alpha: fire ? .09 : ice ? .15 : .13, col, add: fire }));
      if (ice || fire) gg.add(mist({ n: 60, seed: sd + i * 7 + 3, arms: 3, r0: 6, r1: 30 * sc2, y0: 2, y1: H, spin: 1.9, rise: .3, twist: 7, pow: 1.5, size: 3.5, alpha: .6, col: fire ? [2.2, 1, .2] : [.9, 1.3, 1.7], add: true })); });   // sparks, or glittering ice
    gg.add(mist({ n: 60, seed: sd + 5, r0: 12 * sc2, r1: 40 * sc2, y0: 3, y1: 16, spin: .8, rise: 0, size: 18, alpha: .1, col: [.5, .45, .6] })); }                // dust dragged round the foot

  // ================= the Wanderer: a vast, long-legged beast of stone plate and old metal with elemental fire in its seams, walking a slow round of Prismari =================
  // Its feet are planted on the ground where they fall and stay there until they lift; the body rides level above them, so on a slope the uphill legs fold and step higher instead of the whole beast tipping
  { const ctl = WANDER.map(([u, v]) => new THREE.Vector3(X(u) * S, 0, Z(v) * S)), curve = new THREE.CatmullRomCurve3(ctl, true, 'centripetal'), LEN = curve.getLength(), N = Math.round(LEN / 4), sp = curve.getSpacedPoints(N);
    const L1 = 90, L2 = 90, RM = L1 + L2 - 2, HN = 158, SPD = 20, TC = 3.8, BETA = .72;               // leg bones, standing hip height, pace, seconds per stride, share of the stride each foot spends planted
    const PX = new Float32Array(N), PZ = new Float32Array(N), FX = new Float32Array(N), FZ = new Float32Array(N), raw = new Float32Array(N), bel = new Float32Array(N), pr = new Float32Array(N);
    for (let i = 0; i < N; i++) { PX[i] = sp[i].x; PZ[i] = sp[i].z; const a = sp[(i + 6) % N], b = sp[(i - 6 + N) % N], dx = a.x - b.x, dz = a.z - b.z, l = Math.hypot(dx, dz); FX[i] = dx / l; FZ[i] = dz / l; }
    for (let i = 0; i < N; i++) { const x = PX[i], z = PZ[i], fx = FX[i], fz = FZ[i], hAt = (a, b) => heightAt(x + fx * a - fz * b, z + fz * a + fx * b);
      let m = 0; for (const [a, b] of [[0, 0], [38, 24], [38, -24], [-38, 24], [-38, -24], [38, 0], [-38, 0]]) m += hAt(a, b); m /= 7;
      let bm = -1e9; for (const a of [-48, -24, 0, 24, 48, 74]) for (const b of [-15, 15]) bm = Math.max(bm, hAt(a, b));
      raw[i] = Math.max(m + HN, bm + 58); bel[i] = bm; pr[i] = clamp(.6 * Math.atan2(hAt(42, 0) - hAt(-42, 0), 84), -.3, .3); }
    const blur = (src, rad) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) { let q = 0; for (let j = -rad; j <= rad; j++) q += src[(i + j + N) % N]; o[i] = q / (2 * rad + 1); } return o; };
    let GY = blur(blur(raw, 12), 12); for (let i = 0; i < N; i++) GY[i] = Math.max(GY[i], bel[i] + 44); GY = blur(GY, 4); const PT = blur(blur(pr, 12), 8);
    const pose = (dist, o) => { const q = ((dist % LEN) + LEN) % LEN / LEN * N, i0 = Math.floor(q) % N, i1 = (i0 + 1) % N, f = q - Math.floor(q); o.x = lerp(PX[i0], PX[i1], f); o.z = lerp(PZ[i0], PZ[i1], f);
      const fx = lerp(FX[i0], FX[i1], f), fz = lerp(FZ[i0], FZ[i1], f), l = Math.hypot(fx, fz); o.fx = fx / l; o.fz = fz / l; o.y = lerp(GY[i0], GY[i1], f); o.p = lerp(PT[i0], PT[i1], f); };

    // ---- the beast itself
    const stoneW = new THREE.MeshStandardMaterial({ map: stoneTex('#5d6672', '#2a2f39', '#8d97a6', 0, 1, 1), roughness: .82, flatShading: true }), darkW = solid(0x14171d, .9, { flatShading: true });
    const steelW = new THREE.MeshStandardMaterial({ color: 0x4d5560, roughness: .38, metalness: .85, flatShading: true }), bronzeW = new THREE.MeshStandardMaterial({ color: 0x7c5a34, roughness: .42, metalness: .8, flatShading: true });
    const glowB = glowM(0x3fb4ff, 1.7), glowO = glowM(0xff6a1a, 1.9), mossW = solid(0x2b4a2c, 1, { flatShading: true }), wr = mulberry32(404), UP = new THREE.Vector3(0, 1, 0), nv = new THREE.Vector3();
    const root = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(1.15); root.add(body); scene.add(root); movers.push({ o: body, target: () => ({ hex: hexAt(59, 59), label: 'The Wanderer' }) });   // no hex of its own on the map: its notes live on one off the edge
    // a mass of overlapping plates laid over an ellipsoid, with gaps left for the light inside to show through
    const plates = (grp, cx, cy, cz, a, b, c, n, sz) => { for (let i = 0; i < n; i++) { const yy = 1 - 2 * (i + .5) / n, rr = Math.sqrt(1 - yy * yy), th = i * 2.39996 + cx, x = Math.cos(th) * rr, z = Math.sin(th) * rr; if (wr() < .13) continue;
        const pick = wr(), mat = pick < .68 ? stoneW : pick < .88 ? steelW : bronzeW, q = sz * (.75 + .6 * wr()), m = M(grp, new THREE.CylinderGeometry(q, q * .8, 2.6 + 2.6 * wr(), 5 + (i % 2)), mat, cx + x * a * 1.03, cy + yy * b * 1.03, cz + z * c * 1.03);
        m.quaternion.setFromUnitVectors(UP, nv.set(x / a, yy / b, z / c).normalize()); m.rotateY(wr() * 6.283); } };
    for (const [cx, cy, sx, sy, sz, mat] of [[24, 4, 31, 22, 20, glowB], [-26, -1, 29, 18.5, 18.5, glowO], [-1, 1, 27, 17.5, 17, darkW]]) M(body, new THREE.SphereGeometry(1, 14, 10), mat, cx, cy, 0, { sx, sy, sz });   // the light inside: cold blue in the chest, ember-orange in the haunches
    plates(body, 24, 5, 0, 34, 25, 23, 52, 9.5); plates(body, -26, 0, 0, 32, 21, 21, 44, 9); plates(body, -1, 2, 0, 30, 20, 19, 30, 9);
    for (let i = 0; i < 11; i++) { const x = -48 + i * 9 + 3 * wr(), top = x > 0 ? 28 + 2 * Math.sin(x / 14) : 20 + x * .04, hh = 9 + 15 * wr(); M(body, new THREE.ConeGeometry(2.6 + 3 * wr(), hh, 5), i % 4 === 3 ? steelW : stoneW, x, top + hh * .3, (wr() - .5) * 12, { rz: .25 + .3 * wr(), rx: (wr() - .5) * .5 }); }   // crags along the spine
    for (let i = 0; i < 30; i++) { const x = -50 + i * 3.6 + wr() * 3, len = 8 + 22 * wr() * wr(); M(body, new THREE.ConeGeometry(.5 + .7 * wr(), len, 4), i % 3 ? mossW : darkW, x, -19 - len / 2 + 6 * Math.abs(x) / 50, (wr() - .5) * 26, { rx: Math.PI }); }                           // roots and moss hanging under the belly
    for (const a of [34, -34]) for (const b of [20, -20]) { M(body, new THREE.DodecahedronGeometry(12.5, 0), stoneW, a * .87, 0, b * .82, { ry: a + b }); M(body, new THREE.TorusGeometry(9.5, 2.2, 6, 14), steelW, a * .87, 0, b * 1.1); M(body, new THREE.CylinderGeometry(4.5, 4.5, 4, 8), bronzeW, a * .87, 0, b * 1.22, { rx: Math.PI / 2 }); }   // the great joints of shoulder and hip, bound in iron
    // neck and head: the neck arches forward and the long slab of a head hangs from it
    const neck = new THREE.Group(); neck.position.set(50, 10, 0); body.add(neck);
    [[4, 2, 14], [15, 0, 12.5], [25, -6, 11], [32, -14, 9.5], [36, -23, 8.5]].forEach(([x, y, r], i) => { M(neck, new THREE.DodecahedronGeometry(r, 0), stoneW, x, y, 0, { rx: i, rz: i * .7 }); M(neck, new THREE.BoxGeometry(r * 1.5, 3, r * 1.9), i % 2 ? steelW : stoneW, x + 2, y + r * .82, 0, { rz: -.25 - i * .22 });
      if (i < 4) M(neck, new THREE.SphereGeometry(r * .62, 8, 6), glowB, x + 5, y - 2, 0); for (let q = 0; q < 2; q++) { const len = 7 + 12 * wr(); M(neck, new THREE.ConeGeometry(.6, len, 4), mossW, x + q * 4, y - r * .8 - len / 2, (wr() - .5) * r, { rx: Math.PI }); } });
    const head = new THREE.Group(); head.position.set(37, -27, 0); head.rotation.z = -1.0; neck.add(head);
    M(head, new THREE.CylinderGeometry(4.6, 10.5, 40, 6), stoneW, 19, 0, 0, { rz: -Math.PI / 2, sz: .82 }); M(head, new THREE.BoxGeometry(36, 3, 15.5), steelW, 17, 8.6, 0, { rz: -.13 }); M(head, new THREE.BoxGeometry(15, 3.4, 18), stoneW, 4, 10.5, 0, { rz: .12 });
    M(head, new THREE.BoxGeometry(24, 4.2, 9), stoneW, 17, -8.6, 0, { rz: .1 }); M(head, new THREE.BoxGeometry(5, 9, 11), bronzeW, 37, -1, 0, { rz: .2 });
    for (const sd of [-1, 1]) { M(head, new THREE.SphereGeometry(2.4, 8, 6), glowO, 9, 2.4, sd * 8.1); M(head, new THREE.BoxGeometry(13, 1.1, .8), glowB, 21, -2.5, sd * 6.9, { rz: -.2 }); M(head, new THREE.ConeGeometry(2.6, 16, 5), stoneW, -3, 12, sd * 6, { rz: .9, rx: sd * .35 });
      for (let q = 0; q < 3; q++) { const len = 6 + 9 * wr(); M(head, new THREE.ConeGeometry(.5, len, 4), mossW, 8 + q * 9, -11 - len / 2, sd * 3, { rx: Math.PI }); } }
    { const em = mist({ n: 40, seed: 72, r0: 10, r1: 28, y0: -8, y1: 50, spin: .3, rise: .2, size: 4.5, alpha: .8, col: [2.2, .8, .15], add: true }); em.position.set(-26, 0, 0); body.add(em); }
    const wis = mist({ n: 46, seed: 71, r0: 14, r1: 32, y0: -16, y1: 36, spin: .5, rise: .12, size: 13, alpha: .2, col: [.25, .7, 1.3], add: true }); wis.position.set(24, 0, 0); body.add(wis);
    // legs: thigh and shin on a knee bound in iron, ending in a broad stone hoof
    const LEGS = [[34, 20, .75, 1], [34, -20, .25, 1], [-34, 20, 0, -1], [-34, -20, .5, -1]].map(([a, b, ph, kn]) => { const up = new THREE.Group(), lo = new THREE.Group(), gl = kn > 0 ? glowB : glowO; root.add(up, lo);
      M(up, new THREE.CylinderGeometry(9.5, 5.6, L1, 7), stoneW, 0, -L1 / 2, 0, { ry: a }); for (let q = 0; q < 4; q++) M(up, new THREE.BoxGeometry(11 - q * 1.6, 15, 3), q % 2 ? steelW : stoneW, 0, -9 - q * 13, Math.sign(b) * (8.6 - q * .9), { rx: Math.sign(b) * -.06, ry: q * .5 - .7 });
      for (const [f, mt] of [[.36, steelW], [.7, bronzeW]]) M(up, new THREE.TorusGeometry(lerp(9.5, 5.6, f) + .6, 1.3, 5, 12), mt, 0, -L1 * f, 0, { rx: Math.PI / 2 });
      M(up, new THREE.BoxGeometry(1.2, L1 * .5, 1.2), gl, kn * 7.9, -L1 * .46, 0, { rz: kn * .042 }); M(up, new THREE.DodecahedronGeometry(8.6, 0), steelW, 0, -L1, 0, { rx: a }); M(up, new THREE.TorusGeometry(8.2, 1, 5, 14), gl, 0, -L1, 0, { ry: Math.PI / 2 });
      for (let q = 0; q < 4; q++) { const len = 8 + 16 * wr(); M(up, new THREE.ConeGeometry(.6, len, 4), mossW, (wr() - .5) * 12, -12 - q * 8 - len / 2, (wr() - .5) * 12, { rx: Math.PI }); }
      M(lo, new THREE.CylinderGeometry(5.6, 3.8, L2 - 10, 6), stoneW, 0, -(L2 - 10) / 2, 0, { ry: b }); for (const [f, mt] of [[.3, bronzeW], [.58, steelW]]) M(lo, new THREE.TorusGeometry(lerp(5.6, 3.8, f) + .5, 1, 5, 10), mt, 0, -L2 * f, 0, { rx: Math.PI / 2 });
      M(lo, new THREE.BoxGeometry(1, L2 * .4, 1), gl, kn * 4.4, -L2 * .5, 0); M(lo, new THREE.CylinderGeometry(5.4, 5.4, 6, 7), steelW, 0, -L2 + 15, 0); M(lo, new THREE.CylinderGeometry(4.8, 9, 12, 7), stoneW, 0, -L2 + 6, 0); M(lo, new THREE.TorusGeometry(6.2, .8, 5, 12), gl, 0, -L2 + 11.5, 0, { rx: Math.PI / 2 });
      mergeKids(up); mergeKids(lo); return { a, b, ph, kn, up, lo, k: null, F0: [0, 0, 0], F1: [0, 0, 0], f: [0, 0, 0], lift: 0 }; });
    mergeKids(head); mergeKids(neck); mergeKids(body);
    root.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.raycast = () => {}; m.frustumCulled = false; } });

    // ---- the walk
    const PB = {}, PF = {}, H = new THREE.Vector3(), Fp = new THREE.Vector3(), K = new THREE.Vector3(), dir = new THREE.Vector3(), perp = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), tmp = new THREE.Vector3(), mtx = new THREE.Matrix4(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3();
    const footfall = (leg, k, out) => { pose(SPD * (k - leg.ph + BETA / 2) * TC, PF); const x = PF.x + PF.fx * leg.a - PF.fz * leg.b * 1.2, z = PF.z + PF.fz * leg.a + PF.fx * leg.b * 1.2; out[0] = x; out[1] = heightAt(x, z) - 2; out[2] = z; };   // where the foot comes down: under its own hip as the body will stand at mid-stride
    const aim = (grp, along) => { vy.copy(along).negate(); vx.set(PB.fx, 0, PB.fz); vx.addScaledVector(vy, -vx.dot(vy)).normalize(); vz.crossVectors(vx, vy); mtx.makeBasis(vx, vy, vz); grp.quaternion.setFromRotationMatrix(mtx); };   // point a leg bone down its line, keeping its front toward the way the beast is heading
    const step = t0 => { const t = window.__wanderT ?? t0, c = t / TC; pose(SPD * t, PB);
      for (const leg of LEGS) { const cp = c + leg.ph, k = Math.floor(cp), p = cp - k;
        if (leg.k !== k) { leg.k = k; footfall(leg, k, leg.F0); footfall(leg, k + 1, leg.F1); let need = 0;                                             // a new stride: find the next footfall, and how high the foot must lift to clear the ground between
          for (const f of [.2, .4, .6, .8]) { const e = f * f * (3 - 2 * f); need = Math.max(need, (heightAt(lerp(leg.F0[0], leg.F1[0], e), lerp(leg.F0[2], leg.F1[2], e)) + 9 - lerp(leg.F0[1], leg.F1[1], e)) / Math.sin(Math.PI * f)); }
          leg.lift = 16 + .3 * Math.abs(leg.F1[1] - leg.F0[1]) + Math.max(0, need); }
        if (p < BETA) { leg.f[0] = leg.F0[0]; leg.f[1] = leg.F0[1]; leg.f[2] = leg.F0[2]; }
        else { const u = (p - BETA) / (1 - BETA), e = u * u * (3 - 2 * u); leg.f[0] = lerp(leg.F0[0], leg.F1[0], e); leg.f[2] = lerp(leg.F0[2], leg.F1[2], e); leg.f[1] = lerp(leg.F0[1], leg.F1[1], e) + leg.lift * Math.sin(Math.PI * u); } }
      const sw = Math.sin(c * 6.283), cs = Math.cos(PB.p), sn = Math.sin(PB.p), lx = -PB.fz, lz = PB.fx, bx = PB.x + lx * 3 * sw, bz = PB.z + lz * 3 * sw; let yb = PB.y + 2.2 * Math.sin(c * 12.566);
      const hip = (leg, y) => H.set(bx + PB.fx * leg.a * cs + lx * leg.b, y + leg.a * sn, bz + PB.fz * leg.a * cs + lz * leg.b);
      for (let it = 0; it < 2; it++) for (const leg of LEGS) { hip(leg, yb); const hd = Math.hypot(leg.f[0] - H.x, leg.f[2] - H.z), dy = H.y - leg.f[1]; if (hd * hd + dy * dy > RM * RM) yb -= dy - Math.sqrt(Math.max(RM * RM - hd * hd, 400)); }   // never higher than the longest leg can reach
      for (const leg of LEGS) { hip(leg, yb); if (H.y - leg.f[1] < 34) yb += 34 - (H.y - leg.f[1]); }                                                       // and never so low a foot comes up past its own hip
      vx.set(PB.fx * cs, sn, PB.fz * cs); vy.set(-PB.fx * sn, cs, -PB.fz * sn); vz.set(lx, 0, lz); mtx.makeBasis(vx, vy, vz); body.quaternion.setFromRotationMatrix(mtx); body.position.set(bx, yb, bz); body.rotateX(.03 * sw);
      neck.rotation.z = .05 * Math.sin(c * 12.566 + 1); head.rotation.z = -1.0 + .07 * Math.sin(c * 6.283 + .5); head.rotation.y = .1 * Math.sin(c * 3.1416);
      for (const leg of LEGS) { hip(leg, yb); Fp.set(leg.f[0], leg.f[1], leg.f[2]); dir.subVectors(Fp, H); const dist = dir.length(), d = clamp(dist, 30, RM); dir.multiplyScalar(1 / dist);
        const ca = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
        perp.set(PB.fx * leg.kn + lx * leg.b * .008, 0, PB.fz * leg.kn + lz * leg.b * .008); perp.addScaledVector(dir, -perp.dot(dir)).normalize();
        K.copy(H).addScaledVector(dir, L1 * ca).addScaledVector(perp, L1 * sa);                                                                           // the knee: forward on the forelegs, back on the hind legs
        leg.up.position.copy(H); aim(leg.up, tmp.subVectors(K, H).normalize());
        tmp.copy(H).addScaledVector(dir, d).sub(K).normalize(); leg.lo.position.copy(K); aim(leg.lo, tmp); } };
    anim.push(step); step(0); window.__wander = { step, body, LEGS, LEN, SPD, RM, heightAt }; }

  // ================= the five campus pools: formal, man-made, each a little different =================
  { const pd = new THREE.Group(); scene.add(pd); const k = kit(pd), WLv = 13.6 * S, GY = 15 * S, rM = (POOL_IN + POOL_OUT) / 2 * S, bw = (POOL_OUT - POOL_IN) / 2 * S;
    const PP = (r, a) => [CENW[0] + r * Math.cos(a), CENW[1] + r * Math.sin(a)], jet = waterGlass(0xd8f2ff, .42), marble = solid(0xf0ede4, .35);
    // a low balustrade of posts round every pool
    const posts = []; for (const pl of POOLS) { const a0 = pl.mid - pl.half, a1 = pl.mid + pl.half;
      for (const r of [POOL_IN * S - 7, POOL_OUT * S + 7]) { const n = Math.round((a1 - a0) * r / 15); for (let i = 0; i <= n; i++) { const p = PP(r, a0 + (a1 - a0) * i / n); posts.push({ x: p[0], y: GY + 2, z: p[1], sx: 1.7, sy: 4.4, sz: 1.7 }); } }
      for (const a of [a0 - 7 / rM, a1 + 7 / rM]) for (let i = 1; i < 6; i++) { const p = PP(POOL_IN * S - 7 + (bw * 2 + 14) * i / 6, a); posts.push({ x: p[0], y: GY + 2, z: p[1], sx: 1.7, sy: 4.4, sz: 1.7 }); } }
    instanced(new THREE.BoxGeometry(1, 1, 1), cream, posts);

    // north-west pool: three tiered fountains
    { const pl = POOLS[0]; for (const f of [-.55, 0, .55]) { const p = PP(rM, pl.mid + pl.half * f), b = f === 0 ? 1.35 : 1;
        k.C(8 * b, 9 * b, 3, 16, marble, p[0], WLv + 1, p[1]); k.C(1.5 * b, 2 * b, 11 * b, 10, marble, p[0], WLv + 6 * b, p[1]); k.C(5 * b, 2.6 * b, 1.6, 14, marble, p[0], WLv + 11 * b, p[1]);
        k.K(1.8 * b, 13 * b, 10, jet, p[0], WLv + 18 * b, p[1]);
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; M(pd, new THREE.TorusGeometry(4 * b, .35, 5, 12, Math.PI), jet, p[0] + Math.cos(a) * 4 * b, WLv + 11 * b, p[1] + Math.sin(a) * 4 * b, { ry: -a }); } } }

    // north-east pool: a low arched footbridge, statues on plinths, and stepping stones
    { const pl = POOLS[1], c = PP(rM, pl.mid);
      M(pd, new THREE.TorusGeometry(bw + 9, 1.8, 6, 30, Math.PI), marble, c[0], GY - 1, c[1], { ry: -pl.mid, sy: .26, sz: 4.6 });
      for (let i = -3; i <= 3; i++) for (const sd of [-1, 1]) { const rr = rM + i * (bw + 6) / 3.4, q = PP(rr, pl.mid + sd * 7.4 / rM), y = GY - 1 + Math.sqrt(Math.max(0, 1 - Math.pow(i / 3.6, 2))) * (bw + 9) * .26; k.C(.5, .5, 4.4, 6, marble, q[0], y + 2, q[1]); }
      for (const f of [-.78, -.4, .4, .78]) { const p = PP(rM, pl.mid + pl.half * f); k.C(3, 3.5, 5, 10, marble, p[0], WLv + 2, p[1]); k.C(1.3, 2.3, 11, 8, marble, p[0], WLv + 10, p[1]); k.S(1.8, marble, p[0], WLv + 17, p[1]); }
      for (let i = 0; i < 9; i++) { const p = PP(rM + Math.sin(i * 1.3) * 10, pl.mid - pl.half * (.12 + .028 * i) * 1); k.C(3, 3.2, .9, 9, marble, p[0], WLv + .3, p[1]); } }

    // south-east pool: lily pads, a pier and a small rowing boat
    { const pl = POOLS[2], pads = [], flowers = [], ba = pl.mid - pl.half * .3;
      for (let i = 0; i < 130; i++) { const a = pl.mid + (rng() * 2 - 1) * pl.half * .93, r = rM + (rng() * 2 - 1) * (bw - 8), p = PP(r, a), s2 = 2 + rng() * 3.2; if (Math.abs(a - ba) < .075) continue;
        pads.push({ x: p[0], y: WLv + .25, z: p[1], sx: s2, sy: 1, sz: s2, ry: rng() * 6.3, tint: [.7 + rng() * .5, 1, .7 + rng() * .4] });
        if (rng() < .28) flowers.push({ x: p[0] + s2 * .3, y: WLv + 1, z: p[1], s: 1 + rng() * .6, tint: rng() < .5 ? [1, .5, .72] : [1, .95, .9] }); }
      instanced(new THREE.CylinderGeometry(1, 1, .18, 12, 1, false, .5, 5.6), solid(0x3f8a3f, .7), pads); instanced(new THREE.SphereGeometry(.9, 7, 5), solid(0xffffff, .6), flowers);
      const bp = PP(rM - 6, ba), boat = new THREE.Group(); boat.position.set(bp[0], WLv + .2, bp[1]); boat.rotation.y = -ba + .5; pd.add(boat);
      M(boat, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), solid(0x7a4a2a, .8, { side: THREE.DoubleSide }), 0, 2.2, 0, { sx: 3, sy: 2.4, sz: 8 });
      for (const z of [-2.5, 2]) M(boat, new THREE.BoxGeometry(5, .4, 1.3), wood, 0, 1.6, z); for (const sx of [-1, 1]) M(boat, new THREE.CylinderGeometry(.14, .14, 8, 5), wood, sx * 3.6, 1.8, 0, { rz: sx * 1.15, rx: .2 });
      const pr = PP(POOL_IN * S + 10, ba + .12); k.B(26, .8, 5, wood, pr[0], GY - .2, pr[1], { ry: -(ba + .12) }); for (const d of [4, 16]) { const q = PP(POOL_IN * S + d, ba + .12); k.C(.5, .5, 7, 6, wood, q[0], GY - 2, q[1]); } }

    // south pool: a still reflecting pool with floating lanterns and three marble obelisks
    { const pl = POOLS[3], la = glowM(0xffd27a, 3), lb = glowM(0xff9a5a, 3);
      for (let i = 0; i < 16; i++) { const p = PP(rM + ((i * 37) % 50 - 25) * .9, pl.mid + ((i + .5) / 16 * 2 - 1) * pl.half * .88);
        k.C(1.8, 1.8, .4, 10, wood, p[0], WLv + .3, p[1]); k.S(1.3, i % 3 ? la : lb, p[0], WLv + 1.7, p[1]); lanternPts.push([p[0], WLv + 2.4, p[1], { size: 5, drift: .4, speed: .5 }]); }
      for (const f of [-.6, 0, .6]) { const p = PP(rM, pl.mid + pl.half * f); k.C(2.8, 3.2, 3, 4, marble, p[0], WLv + 1, p[1], { ry: .78 }); k.K(2.1, 24, 4, marble, p[0], WLv + 14.5, p[1], { ry: .78 }); } }

    // west pool: an island pavilion reached by a little bridge
    { const pl = POOLS[4], c = PP(rM, pl.mid); k.C(17, 18, 4, 20, marble, c[0], WLv + .5, c[1]);
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; k.C(.9, .9, 12, 8, marble, c[0] + Math.cos(a) * 12, WLv + 8.5, c[1] + Math.sin(a) * 12); }
      k.C(14, 14, 1.2, 20, marble, c[0], WLv + 15, c[1]); k.D(13, teal, c[0], WLv + 15.6, c[1], { sy: .7 }); k.S(1.2, gold, c[0], WLv + 26, c[1]);
      const b = PP(POOL_IN * S + (bw - 14) / 2 - 3, pl.mid); k.B(bw - 8, 1.2, 7, marble, b[0], GY + .1, b[1], { ry: -pl.mid }); }
    pd.traverse(m => { if (m.isMesh) { m.castShadow = m.material !== jet; m.receiveShadow = true; } }); }

  return { trees: L.conifer.length + L.broad.length + L.mangrove.length + L.dead.length, spires: L.sp[0].length + L.sp[1].length + L.sp[2].length, things: things.length };
}

// ------------------------------------------------------------------ per-campus light, and the little lights that live in the dark ones
function buildGrade() {
  const N = 128, d = GRADE.image.data;   // order: central, Quandrix, Silverquill (dusk), dunes (dusk), Detention Bog, Witherbloom, Prismari, volcanoes, Lorehold
  const G = [[1, 1, 1], [1, 1.03, .98], [.50, .36, .42], [.80, .55, .50], [.36, .36, .50], [.46, .58, .50], [1, .96, 1.02], [1, .96, .94], [1.05, 1, .95]];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { weightsW(((i + .5) / N - .5) * MAP_W, ((j + .5) / N - .5) * MAP_D);
    let r = 0, g = 0, b = 0; for (let k = 0; k < 9; k++) { r += WT[k] * G[k][0]; g += WT[k] * G[k][1]; b += WT[k] * G[k][2]; }
    { const x = ((i + .5) / N - .5) * MAP_W / S, z = ((j + .5) / N - .5) * MAP_D / S, kb = sstep(200, 70, Math.hypot(x - X(.872), z - Z(.312))), kd = sstep(175, 60, Math.hypot(x - X(.772), z - Z(.248)));
      r = lerp(r, 1.6, kb * .9); g = lerp(g, 1.5, kb * .9); b = lerp(b, 1.25, kb * .9); r *= 1 - .5 * kd; g *= 1 - .6 * kd; b *= 1 - .32 * kd; }
    const o = (j * N + i) * 4; d[o] = Math.min(255, r * 127.5); d[o + 1] = Math.min(255, g * 127.5); d[o + 2] = Math.min(255, b * 127.5); d[o + 3] = 255; }
  GRADE.needsUpdate = true;
}
let fxMat;
function buildFx() {
  const pos = [], col = [], fx = [];
  const add = (x, y, z, c, size, drift, speed) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); fx.push(size, rng() * 6.283, drift, speed); };
  const spot = () => [(rng() - .5) * MAP_W * .98, (rng() - .5) * MAP_D * .98];
  for (let n = 0, c = 0; n < 60000 && c < 950; n++) { const [x, z] = spot(); weightsW(x, z); if (WT[WITH] < .55) continue;                 // fireflies over the Witherbloom swamp
    const k = rng(), dr = k < .3 ? 16 + rng() * 24 : k < .62 ? .5 + rng() * 2 : 5 + rng() * 7, blink = rng() < .4;                                                    // a negative drift marks one that blinks
    add(x, Math.max(heightAt(x, z), 0) + 2 + rng() * 13, z, [1.9, 2.2, .7], 2.6 + rng() * 2.4, blink ? -dr : dr, k < .3 ? .2 + rng() * .35 : .4 + rng()); c++; }
  for (let n = 0, c = 0; n < 60000 && c < 115; n++) { const [x, z] = spot(); weightsW(x, z); if (WT[BOG] < .6) continue;                    // cold wisps over the Detention Bog: few, and no two alike - some wander far and fast, some hang still, some gutter out and come back
    const k = rng(), dr = k < .3 ? 20 + rng() * 26 : k < .6 ? 1 + rng() * 2.5 : 8 + rng() * 8, blink = rng() < .45;
    add(x, Math.max(heightAt(x, z), 0) + 5 + rng() * 16, z, rng() < .6 ? [.5, 2.2, 1.6] : [1.5, .7, 2.4], 4 + rng() * 10, blink ? -dr : dr, k < .3 ? .5 + rng() * .5 : .08 + rng() * .3); c++; }
  for (let n = 0, c = 0; n < 60000 && c < 85; n++) { const [x, z] = spot(); weightsW(x, z); if (WT[BOG] < .6) continue;                     // and eyes: pairs of lights that open in the dark, hold a moment, blink, and are gone. A negative size marks them
    const y = Math.max(heightAt(x, z), 0) + 3 + rng() * 12, a = rng() * 6.283, ph = rng() * 6.283, gap = 1.7 + rng() * 1.6, ec = rng() < .5 ? [2.6, 2.1, .4] : rng() < .5 ? [2.6, .45, .25] : [1.2, 2.6, .9], sz = 2.4 + rng() * 1.5;
    for (const sd of [-1, 1]) { pos.push(x + Math.cos(a) * gap * sd, y, z + Math.sin(a) * gap * sd); col.push(ec[0], ec[1], ec[2]); fx.push(-sz, ph, 0, 0); } c++; }
  for (const p of lanternPts) { const st = p[3] || {}; add(p[0], p[1], p[2], st.c || [2.6, 1.5, .5], st.size || 11, st.drift ?? .6, st.speed ?? .4); }                                                            // lanterns in Widdershins Hall
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aFx', new THREE.Float32BufferAttribute(fx, 4));
  fxMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uScale: FXSCALE },
    vertexShader: 'attribute vec3 aCol; attribute vec4 aFx; uniform float uTime, uScale; varying vec3 vCol; varying float vA;' +
      'void main(){ vec3 p = position; float t = uTime * aFx.w + aFx.y;' +
      ' float dz = abs(aFx.z), bl = aFx.z < 0.0 ? smoothstep(0.15, 0.6, sin(uTime * (0.25 + 0.6 * fract(aFx.y * 3.7)) + aFx.y * 9.0)) : 1.0;' +
      ' p.x += sin(t * 0.7 + aFx.y * 3.0) * dz; p.z += cos(t * 0.53 + aFx.y * 5.0) * dz; p.y += sin(t * 1.1) * dz * 0.4;' +
      ' vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float sz = abs(aFx.x) * uScale / -mv.z;' +
      ' float cy = fract(uTime / (9.0 + 16.0 * fract(aFx.y * 1.7)) + aFx.y), eye = smoothstep(0.0, 0.012, cy) * (1.0 - smoothstep(0.09, 0.1, cy)) * (1.0 - smoothstep(0.044, 0.049, cy) * (1.0 - smoothstep(0.054, 0.059, cy)));' +
      ' vA = aFx.x < 0.0 ? eye * min(1.0, sz / 1.2) : bl * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * 2.3), 2.0)) * min(1.0, sz / 1.5); gl_PointSize = max(sz, 1.5); vCol = aCol; }',
    fragmentShader: 'varying vec3 vCol; varying float vA; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vCol * a * a * vA, 1.0); }' });
  const pts = new THREE.Points(g, fxMat); pts.frustumCulled = false; scene.add(pts);
}

// ------------------------------------------------------------------ smoke / steam
const puffs = [];
function buildSmoke() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d');
  const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const add = (x, y, z, n, color, rise, size, alpha) => { for (let i = 0; i < n; i++) { const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m); scene.add(s); puffs.push({ s, x, y, z, ph: i / n, rise, size, alpha, j: rng() * 6.3 }); } };
  for (const v of VOLC) add(v.x * S, (v.lavaLvl + 6) * S, v.z * S, 9, 0x4a4542, 190 * S, v.rc * 2.2 * S, v.flow ? .5 : .32);
  for (const p of OUTLETS) { const n = p.pts.length; for (const [i, q, sz, al] of [[1, 8, 25, .3], [2, 7, 22, .28], [3, 5, 16, .22]]) add(p.pts[n - 2 * i] * S + (i - 2) * 9, 4, p.pts[n - 2 * i + 1] * S, q, 0xe4ebee, 105, sz, al); }   // thick steam where the lava runs into the river
  for (const c of chimneys) add(c[0], c[1], c[2], 5, c[3] || 0xa39c92, 70, 9, c[3] ? .42 : .3);
}
function updateSmoke(dt) {
  for (const p of puffs) { p.ph = (p.ph + dt * .045) % 1; const t = p.ph, sz = p.size * (.6 + 2.6 * t);
    p.s.position.set(p.x + t * t * 170 + Math.sin(p.j + t * 5) * 10, p.y + t * p.rise, p.z + t * t * 90 + Math.cos(p.j + t * 4) * 10);
    p.s.scale.set(sz, sz, 1); p.s.material.opacity = p.alpha * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * .5); }
}

// ------------------------------------------------------------------ controls: right-drag pans, middle-drag rotates, wheel zooms
const controls = new MapControls(camera, canvas);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };   // the right button pans, but by the handlers below, not by the controls' own
controls.enableDamping = true; controls.dampingFactor = .09; controls.screenSpacePanning = false; controls.zoomToCursor = true;
controls.minDistance = 90; controls.maxDistance = 6500 * S; controls.maxPolarAngle = 1.42; controls.zoomSpeed = 1.3;
controls.target.copy(HOME_TGT);
// Dragging with the right button takes hold of the ground: the spot that was under the cursor when the button went down stays under it as the mouse moves, however far the view is tilted.
// (The controls' own pan moves the same distance for a given drag whatever the tilt, so looking along the ground the map slid away under the cursor and a full drag went almost nowhere.)
const grab = { on: false, id: -1, y: 0, p: new THREE.Vector3() }, grabRay = new THREE.Raycaster();
const groundUnder = (cx, cy, y, out) => { grabRay.setFromCamera({ x: cx / innerWidth * 2 - 1, y: -(cy / innerHeight) * 2 + 1 }, camera); const o = grabRay.ray.origin, d = grabRay.ray.direction;
  const t = Math.min((y - o.y) / Math.min(d.y, -.045), 60000); return out.set(o.x + d.x * t, y, o.z + d.z * t); };   // a ray at or above the horizon is taken as one just below it, so there is always a spot
canvas.addEventListener('pointerdown', e => { if (e.button !== 2 || e.altKey || !controls.enabled) return; camera.updateMatrixWorld(); const p = pick(e.clientX, e.clientY); grab.y = p ? heightAt(p.x, p.z) : controls.target.y;
  if (p) grab.p.set(p.x, grab.y, p.z); else groundUnder(e.clientX, e.clientY, grab.y, grab.p); grab.on = true; grab.id = e.pointerId; });
const grabV = new THREE.Vector3();
addEventListener('pointermove', e => { if (!grab.on || e.pointerId !== grab.id) return; if (!(e.buttons & 2) || !controls.enabled) { grab.on = false; return; }
  groundUnder(e.clientX, e.clientY, grab.y, grabV); const far = camera.position.distanceTo(controls.target) * 4;
  let dx = clamp(grab.p.x - grabV.x, -far, far), dz = clamp(grab.p.z - grabV.z, -far, far);
  dx = clamp(controls.target.x + dx, -MAP_W / 2, MAP_W / 2) - controls.target.x; dz = clamp(controls.target.z + dz, -MAP_D / 2, MAP_D / 2) - controls.target.z;   // the view stops at the map's edge
  camera.position.x += dx; camera.position.z += dz; controls.target.x += dx; controls.target.z += dz; camera.updateMatrixWorld(); });
addEventListener('pointerup', e => { if (e.pointerId === grab.id) grab.on = false; });
addEventListener('pointercancel', e => { if (e.pointerId === grab.id) grab.on = false; });
canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });   // stop the browser's middle-click auto-scroll
canvas.addEventListener('auxclick', e => e.preventDefault());

// ------------------------------------------------------------------ picking: exact ray vs terrain, then things in front of it
const ray = new THREE.Raycaster();
function pick(cx, cy) {
  ray.setFromCamera({ x: cx / innerWidth * 2 - 1, y: -(cy / innerHeight) * 2 + 1 }, camera);
  const o = ray.ray.origin, d = ray.ray.direction; let t = 0, pt = 0;
  if (o.y > HMAX && d.y < 0) t = pt = (HMAX - o.y) / d.y;                      // skip the empty air above the highest peak
  for (let i = 0; i < 4000 && t < 90000; i++) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < -300 * S) break;
    const ox = Math.abs(x) - MAP_W / 2, oz = Math.abs(z) - MAP_D / 2;
    if (ox <= 0 && oz <= 0) { const h = heightAt(x, z);
      if (y <= h) { let a = pt, b = t; for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (o.y + d.y * m <= heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        return { x: o.x + d.x * b, z: o.z + d.z * b, dist: b }; }
      pt = t; t += clamp((y - h) * .22, 1, 90);                                // small, slope-safe steps near the surface
    } else { pt = t; t += Math.max(8, Math.max(ox, oz) * .5); }
  }
  return null;
}
// what is under the cursor: a thing (its model, or any hex linked to it), else a plain hex
function targetAt(cx, cy) {
  const p = pick(cx, cy), hits = ray.intersectObjects(thingRoots, true); let best = p ? p.dist : 1e9, res = null;
  if (hits.length && hits[0].distance < best) { let o = hits[0].object; while (o && !o.userData.thing) o = o.parent; if (o) { best = hits[0].distance; res = { thing: o.userData.thing }; } }
  const now = performance.now(); for (const mv of movers) { if (!mv.box || now - mv.at > 150) { mv.box = (mv.box || new THREE.Box3()).setFromObject(mv.o); mv.at = now; }                // a moving thing is taken by the box round it, refreshed a few times a second
    const hp = ray.ray.intersectBox(mv.box, moverV); if (hp) { const dd = hp.distanceTo(ray.ray.origin); if (dd < best) { const tg = mv.target(); if (tg) { if (!tg.thing) tg.mover = mv.o; best = dd; res = tg; } } } }
  if (res) return res;
  if (!p) return null;
  const hx = worldToHex(p.x, p.z), own = hexOwner.get(hexKey(hx.q, hx.r));
  return own ? { thing: own } : { hex: hx };
}
const moverV = new THREE.Vector3();
const keyOf = t => !t ? '' : t.thing ? 't' + t.thing.id : 'h' + hexKey(t.hex.q, t.hex.r);
const hexesOf = t => t.thing ? t.thing.hexes : [t.hex];
const setList = (arr, n, list) => { const c = Math.min(list.length, NH); for (let i = 0; i < c; i++) arr.value[i].set(list[i].sx, list[i].sy); n.value = c; };
const HL = new THREE.Color(0x3a2a0a);
const glow = (th, on) => th.mats.forEach(m => { if (!m.userData.e0) return; m.emissive.copy(m.userData.e0); if (on) m.emissive.add(HL); });
const tip = document.getElementById('tip');
let hover = null, hoverKey = '', selected = null;
function setHover(t) {
  const k = keyOf(t); if (k === hoverKey) return;
  if (hover && hover.thing) glow(hover.thing, false);
  hover = t; hoverKey = k;
  if (!t) { U.uHovN.value = 0; tip.style.display = 'none'; canvas.style.cursor = ''; return; }
  setList(U.uHov, U.uHovN, hexesOf(t)); if (t.thing) glow(t.thing, true);
  tip.textContent = t.thing ? (role.gm ? t.thing.name : `Hex ${t.thing.hexes[0].q},${t.thing.hexes[0].r}`) : t.label && (role.gm || t.hex.q > 50) ? (role.gm ? t.label : '') : `Hex ${t.hex.q},${t.hex.r}`; tip.style.visibility = tip.textContent ? '' : 'hidden';
  tip.style.display = 'block'; canvas.style.cursor = 'pointer';
}
let fly = null;
function flyTo(x, z, dist = 320 * S, polarDeg = 60) {
  const tgt = new THREE.Vector3(x, Math.max(heightAt(x, z), 0), z), off = camera.position.clone().sub(controls.target), az = Math.atan2(off.x, off.z), pol = THREE.MathUtils.degToRad(polarDeg);
  const p1 = tgt.clone().add(new THREE.Vector3(Math.sin(az) * Math.sin(pol), Math.cos(pol), Math.cos(az) * Math.sin(pol)).multiplyScalar(dist));
  fly = { t: 0, dur: 1.6, p0: camera.position.clone(), p1, t0: controls.target.clone(), t1: tgt }; controls.enabled = false;
}
const flyTarget = t => t.thing ? flyTo(t.thing.x, t.thing.z, t.thing.view, 62) : t.mover ? (t.mover.getWorldPosition(moverV), flyTo(moverV.x, moverV.z, 420, 62)) : flyTo(t.hex.x, t.hex.z);   // a walker is flown to where it is now, not to its notes' hex

// the hex popup: image, GM information, players' notes - read from and saved to the live map's own records through its own endpoints. Who may see what is decided there, on the server: a player's browser is never sent the GM's material at all
const API = '/dnd/strixhaven/map/', role = { gm: false, ok: false };
const hexApi = (action, f = {}) => { const fd = new FormData(); fd.append('action', action); for (const k in f) fd.append(k, f[k]); return fetch(API + 'hex-data-handler.php', { method: 'POST', body: fd, credentials: 'same-origin' }).then(r => r.json()); };
hexApi('load', { q: 0, r: 0 }).then(d => { role.ok = !!d.success; role.gm = !!(d.data && d.data.gm); document.body.classList.toggle('is-gm', role.gm); }).catch(() => {});   // the server answers with a GM section only for the GM
// places that stand on a different hex here than on the flat map keep their record where it has always been
const DATA_HEX = { 'Inkwell Lake': [[29, 10], [28, 11], [29, 11]], 'Damatha Inkfountains': [[30, 10]], 'Inkling Hatchery Vats': [[30, 9]], 'Sealwright Foundry': [[30, 19]], 'Meterworks Stage': [[34, 16]], 'Widdershins Hall': [[22, 34]],
  'Terraced Beastward': [[12, 17]], 'Ebenhollow - The Great Snarl': [[11, 18]], 'Phalanx Crucible': [[6, 28]], 'Pillardrop 492': [[7, 26]], 'Mobius Cloister': [[17, 17]], "Elowin's Bathhouse": [[4, 53]] };   // checked against every note on the live map, 2026-10-04
const DATA_AT = { '35,4': [34, 6], '11,28': [11, 27] };   // the same, for things that share a name (Cold Anchor Stones, Large Pillar): keyed by the hex the 3D one stands on
const panel = document.getElementById('panel'), $ = id => document.getElementById(id), pNotes = $('pNotes'), pGm = $('pGmNotes'); let cur = null;
const filled = d => !!d && ['player', 'gm'].some(k => d[k] && (d[k].title || d[k].notes || (d[k].images || []).length)), last = a => (a && a.length ? a[a.length - 1] : null);
const candidates = t => { const list = []; if (t.thing) { for (const h of DATA_HEX[t.thing.name] || []) list.push(h); for (const h of t.thing.hexes) { const m = DATA_AT[h.q + ',' + h.r]; if (m) list.push(m); } for (const h of t.thing.hexes) list.push([h.q, h.r]); } else list.push([t.hex.q, t.hex.r]); return list; };
const FIELDS = ['pNotes', 'pGmNotes', 'pGmTitle', 'pPlTitle'];
const imgList = () => { const d = (cur && cur.data) || {}, pl = (d.player || {}).images || [], gm = (d.gm || {}).images || []; return role.gm ? [...gm.map(x => ({ f: x.filename, sec: 'gm' })), ...pl.filter(x => x.shared_from !== 'gm').map(x => ({ f: x.filename, sec: 'player' }))] : pl.map(x => ({ f: x.filename, sec: 'player' })); };
function render() { const d = cur.data || {}, pl = d.player || {}, gm = d.gm || {}, list = imgList(), where = cur.q > 50 ? '' : `Hex ${cur.q},${cur.r}`; cur.i = clamp(cur.i == null ? list.length - 1 : cur.i, 0, Math.max(list.length - 1, 0)); const img = list[cur.i];
  $('pTitle').textContent = role.gm ? (gm.title || pl.title || (cur.t.thing ? cur.t.thing.name : cur.t.label || where)) : (pl.title || where || '\u2014');
  $('pSub').textContent = where + (role.gm && cur.t.thing && cur.t.thing.hexes.length > 1 ? ' · ' + cur.t.thing.hexes.length + ' hexes' : '');
  const im = $('pImg'); if (img && img.f) { im.src = API + 'hex-images/' + encodeURIComponent(img.f); im.style.display = 'block'; $('pNoImg').style.display = 'none'; } else { im.removeAttribute('src'); im.style.display = 'none'; $('pNoImg').style.display = 'block'; $('pNoImg').textContent = role.gm ? 'No image yet' : 'Nothing has been revealed here'; }
  $('pNav').style.display = list.length > 1 || (role.gm && img) ? 'flex' : 'none'; $('pCount').textContent = list.length > 1 ? (cur.i + 1) + ' / ' + list.length : ''; $('pPrev').style.visibility = $('pNext').style.visibility = list.length > 1 ? 'visible' : 'hidden';
  const gi = gm.images || [], shared = gi.length > 0 && gi.every(g => (pl.images || []).some(p => p.filename === g.filename)), many = gi.length > 1; $('pReveal').style.display = gi.length ? '' : 'none'; $('pReveal').textContent = (shared ? 'Hide ' : 'Reveal ') + (many ? 'images' : 'image') + (shared ? ' from players' : ' to players'); $('pReveal').dataset.shared = shared ? '1' : '';
  $('pShown').textContent = gi.length ? (shared ? 'The players can see ' + (many ? 'these images.' : 'this image.') : 'The players cannot see ' + (many ? 'these images.' : 'this image.')) : '';
  if (!cur.dirty) { pGm.value = gm.notes || ''; pNotes.value = pl.notes || ''; $('pGmTitle').value = gm.title || ''; $('pPlTitle').value = pl.title || ''; }
  for (const id of FIELDS) $(id).readOnly = !!cur.blocked;
  if (!role.ok) $('pStatus').textContent = 'Not signed in: nothing can be loaded or saved'; }
// one person edits a hex at a time: the lock is taken when you start typing and given back when you save or close. It also lapses by itself after five minutes
const release = c => { if (c && c.lock) { c.lock = false; hexApi('unlock_edit', { q: c.q, r: c.r }).catch(() => {}); } };
const claim = async () => { if (!cur || cur.lock || cur.blocked || cur.claiming || !role.ok) return; const mine = cur; mine.claiming = true; try { const d = await hexApi('lock_edit', { q: mine.q, r: mine.r, section: role.gm ? 'gm' : 'player' }); mine.claiming = false;
    if (cur !== mine) { if (d.success) hexApi('unlock_edit', { q: mine.q, r: mine.r }).catch(() => {}); return; } if (d.success) mine.lock = true; else { mine.blocked = true; mine.dirty = false; $('pStatus').textContent = d.error || 'Somebody else is editing this'; render(); } } catch (e) { mine.claiming = false; } };
async function select(t) { release(cur); selected = t; setList(U.uSelA, U.uSelN, hexesOf(t)); const list = candidates(t), mine = cur = { t, q: list[0][0], r: list[0][1], data: null, dirty: false, i: null }; $('pStatus').textContent = ''; render(); panel.style.display = 'block';
  try { const res = await Promise.all(list.slice(0, 16).map(([q, r]) => hexApi('load', { q, r }).catch(() => null))); if (cur !== mine) return; let k = res.findIndex(x => x && x.success && filled(x.data)); if (k < 0) k = 0; if (res[k] && res[k].success) { cur.q = list[k][0]; cur.r = list[k][1]; cur.data = res[k].data; cur.i = null; role.ok = true; } render(); } catch (e) {} }
const reload = async (mine = cur) => { if (!mine || cur !== mine) return; const request = mine.reloadRequest = (mine.reloadRequest || 0) + 1; const d = await hexApi('load', { q: mine.q, r: mine.r }); if (cur !== mine || mine.reloadRequest !== request) return; if (d.success) mine.data = d.data; render(); };
for (const id of FIELDS) { $(id).addEventListener('focus', claim); $(id).addEventListener('input', () => { if (cur && !cur.blocked) { cur.editRevision = (cur.editRevision || 0) + 1; cur.dirty = true; $('pStatus').textContent = 'Not saved yet'; claim(); } }); }
$('pSave').onclick = async () => { const mine = cur; if (!mine || !mine.data || mine.saving) return; if (mine.blocked) { $('pStatus').textContent = 'Somebody else is editing this'; return; } const revision = mine.editRevision || 0; mine.saving = true; mine.reloadRequest = (mine.reloadRequest || 0) + 1; $('pStatus').textContent = 'Saving…'; const f = { q: mine.q, r: mine.r, player_notes: pNotes.value }; if (role.gm) { f.gm_notes = pGm.value; f.gm_title = $('pGmTitle').value; f.player_title = $('pPlTitle').value; }
  try { const d = await hexApi('save_all', f); if (cur !== mine) return; if (d.success) { if (d.data) mine.data = d.data; if ((mine.editRevision || 0) === revision) { mine.dirty = false; release(mine); render(); $('pStatus').textContent = 'Saved'; } else $('pStatus').textContent = 'Not saved yet'; } else $('pStatus').textContent = d.error || 'Not saved'; } catch (e) { if (cur === mine) $('pStatus').textContent = 'Not saved'; } finally { mine.saving = false; } };
$('pReveal').onclick = async () => { const mine = cur; if (!mine || !role.gm || !mine.data) return; try { await hexApi($('pReveal').dataset.shared ? 'unshare_gm_images' : 'share_gm_images', { q: mine.q, r: mine.r }); await reload(mine); } catch (e) { if (cur === mine) $('pStatus').textContent = 'Could not change that'; } };
// the image, large: clicking the picture in the panel fills the window with it; a click anywhere or Esc puts it away. With more than one image the arrows (or the arrow keys) step through them
const bigShow = () => { const list = imgList(), big = $('imgBig'); if (!cur || !list.length || !$('pImg').getAttribute('src')) return; $('imgBigImg').src = $('pImg').src; const many = list.length > 1; $('imgBigPrev').style.display = $('imgBigNext').style.display = many ? '' : 'none'; $('imgBigCount').textContent = many ? (cur.i + 1) + ' / ' + list.length : ''; big.classList.add('on'); };
const bigHide = () => $('imgBig').classList.remove('on'), bigStep = d => { if (!cur) return; const n = imgList().length; if (n < 2) return; cur.i = (cur.i + d + n) % n; render(); bigShow(); };
$('pImg').onclick = bigShow; $('imgBig').onclick = bigHide; $('imgBigPrev').onclick = e => { e.stopPropagation(); bigStep(-1); }; $('imgBigNext').onclick = e => { e.stopPropagation(); bigStep(1); };
addEventListener('keydown', e => { if (!$('imgBig').classList.contains('on')) return; if (e.key === 'Escape') bigHide(); else if (e.key === 'ArrowLeft') bigStep(-1); else if (e.key === 'ArrowRight') bigStep(1); else return; e.stopImmediatePropagation(); e.preventDefault(); }, true);
$('pPrev').onclick = () => { if (cur) { const n = imgList().length; cur.i = (cur.i - 1 + n) % Math.max(n, 1); render(); } };
$('pNext').onclick = () => { if (cur) { const n = imgList().length; cur.i = (cur.i + 1) % Math.max(n, 1); render(); } };
$('pDel').onclick = async () => { const mine = cur; if (!mine || !role.gm) return; const img = imgList()[mine.i]; if (!img || !confirm('Delete this image for good?')) return; try { const d = await hexApi('delete_image', { q: mine.q, r: mine.r, section: img.sec, filename: img.f }); if (cur !== mine) return; $('pStatus').textContent = d.success ? 'Image deleted' : (d.error || 'Not deleted'); mine.i = null; await reload(mine); } catch (e) { if (cur === mine) $('pStatus').textContent = 'Not deleted'; } };
$('pFile').onchange = async e => { const mine = cur, file = e.target.files[0]; if (!file || !mine) return; const fd = new FormData(); fd.append('action', 'upload_image'); fd.append('q', mine.q); fd.append('r', mine.r); fd.append('section', 'gm'); fd.append('image', file); e.target.value = ''; $('pStatus').textContent = 'Uploading…';
  try { const d = await fetch(API + 'hex-data-handler.php', { method: 'POST', body: fd, credentials: 'same-origin' }).then(r => r.json()); if (cur !== mine) return; $('pStatus').textContent = d.success ? 'Image added' : (d.error || 'Upload failed'); mine.i = null; await reload(mine); } catch (x) { if (cur === mine) $('pStatus').textContent = 'Upload failed'; } };
$('pFly').onclick = () => selected && flyTarget(selected);
$('pClose').onclick = () => { release(cur); panel.style.display = 'none'; selected = null; cur = null; U.uSelN.value = 0; };
addEventListener('pagehide', () => release(cur));

// the players' travel overlay, shared with the flat map (same endpoint, same hexes): destinations, a route drawn hex to hex, and how hard the going is in each hex. Everybody always sees it; the tools to change it open from the button
const PATHAPI = API + 'api/player-path-api.php', COST = { normal: 1 / 3, fast: 1 / 26, yellow: .5, red: 1 }, TCOL = { fast: 0x46d17a, yellow: 0xf2d24a, red: 0xe0483a };
const PS = { on: false, tool: 'none', drawing: false, drawn: false, diff: 'red', sections: [], markers: {}, terrain: {}, lock: null, mine: false, curId: null, sig: null, hex: null, pending: new Map(), brush: 0, painting: false }, pathG = new THREE.Group(); scene.add(pathG);
// terrain difficulty: what the server holds, overlaid with whatever the GM has painted and not yet saved
const TRGB = { fast: [70, 209, 122], yellow: [242, 210, 74], red: [224, 72, 58] }, terrData = new Uint8Array(64 * 64 * 4), terrTex = new THREE.DataTexture(terrData, 64, 64, THREE.RGBAFormat); terrTex.magFilter = terrTex.minFilter = THREE.NearestFilter; terrTex.needsUpdate = true; U.uTerr.value = terrTex;
const seaG = new THREE.Group(); seaG.visible = false; scene.add(seaG);
const terrOf = key => PS.pending.has(key) ? PS.pending.get(key) : ((PS.terrain[key] || {}).difficulty || 'normal');
function terrPaint() { terrData.fill(0); const sea = { fast: [], yellow: [], red: [] };
  const put = (q, r, d) => { const c = TRGB[d]; if (!c || q < 0 || r < 0 || q > 63 || r > 63) return; const o = (r * 64 + q) * 4; terrData[o] = c[0]; terrData[o + 1] = c[1]; terrData[o + 2] = c[2]; terrData[o + 3] = 255;
    const h = hexAt(q, r); if (heightAt(h.x, h.z) < .5) { const RR = HEX_R * .97; for (let i = 0; i < 6; i++) { const a0 = i * Math.PI / 3, a1 = a0 + Math.PI / 3; sea[d].push(h.x, 1.2, h.z, h.x + Math.cos(a1) * RR, 1.2, h.z + Math.sin(a1) * RR, h.x + Math.cos(a0) * RR, 1.2, h.z + Math.sin(a0) * RR); } } };   // open water is its own surface, so a hex out there gets a flat tile on it
  for (const k in PS.terrain) if (!PS.pending.has(k)) put(PS.terrain[k].q, PS.terrain[k].r, PS.terrain[k].difficulty);
  for (const [k, d] of PS.pending) { const [q, r] = k.split(',').map(Number); put(q, r, d); }
  terrTex.needsUpdate = true;
  for (const o of [...seaG.children]) { seaG.remove(o); o.geometry.dispose(); o.material.dispose(); }
  for (const d in sea) if (sea[d].length) { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(sea[d], 3)); const c = TRGB[d], m = new THREE.Mesh(ge, new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), transparent: true, opacity: .4, depthWrite: false, fog: false })); m.raycast = () => {}; m.frustumCulled = false; seaG.add(m); } }
let terrainSave = null;
const terrainInFlight = new Map();
function saveTerrain() { if (terrainSave) return terrainSave;
  terrainSave = (async () => { while (PS.pending.size) {
    const batch = [...PS.pending].slice(0, 1500);
    for (const [key, difficulty] of batch) terrainInFlight.set(key, difficulty);
    const cells = batch.map(([key, difficulty]) => { const [q, r] = key.split(',').map(Number); return { q, r, difficulty }; });
    const d = await pathApi('save_terrain_patch', { cells });
    terrainInFlight.clear();
    if (!d || !d.success) { pathSay('The terrain did not save - it is still held here; click Terrain to try again'); return false; }
    // Acknowledgment owns only the submitted values. New painting remains queued.
    for (const [key, difficulty] of batch) if (PS.pending.get(key) === difficulty) PS.pending.delete(key);
    PS.sig = null; terrPaint(); drawPath();
  } return true; })().finally(() => { terrainSave = null; terrainInFlight.clear(); });
  return terrainSave; }
const pathSay = t => { $('pathMsg').textContent = t || ''; }, gY = (x, z) => Math.max(heightAt(x, z), 0), blocks = v => { const b = Math.round(v * 2) / 2; return b + ' block' + (b === 1 ? '' : 's'); };
const pathApi = (action, body = {}) => fetch(PATHAPI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action, ...body }) }).then(r => r.json()).then(d => { if (d && d.success && d.data) applyPath(d.data); else if (d && d.error) pathSay(d.error); return d; }).catch(() => null);
const textSprite = txt => { const cv = document.createElement('canvas'), cx = cv.getContext('2d'); cx.font = '600 30px Georgia'; const w = Math.ceil(cx.measureText(txt).width) + 28; cv.width = w; cv.height = 46; cx.font = '600 30px Georgia'; cx.fillStyle = 'rgba(21,36,12,.9)'; cx.strokeStyle = '#d8ff3f'; cx.lineWidth = 3; cx.beginPath(); cx.roundRect(2, 2, w - 4, 42, 9); cx.fill(); cx.stroke(); cx.fillStyle = '#f6ffd3'; cx.textBaseline = 'middle'; cx.fillText(txt, 14, 24);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true, fog: false })); sp.scale.set(w * .6, 46 * .6, 1); sp.renderOrder = 8000; sp.raycast = () => {}; return sp; };
function drawPath() { for (const o of [...pathG.children]) { pathG.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
  const flat = (pos, idx, col, op, order = 0) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (idx) ge.setIndex(idx); const m = new THREE.Mesh(ge, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.renderOrder = order; m.raycast = () => {}; m.frustumCulled = false; pathG.add(m); return m; };
  terrPaint();
  const strip = (pts, hw, col, op, dy, order) => { const pos = [], idx = []; pts.forEach((p, i) => { const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, nx = -dz / l * hw, nz = dx / l * hw;
      for (const e of [1, 0, -1]) { const x = p[0] + nx * e, z = p[2] + nz * e; pos.push(x, gY(x, z) + dy, z); }                                                                          // both edges and the middle each sit on their own bit of ground, so the band tilts with a slope instead of cutting into it
      if (i) { const q = i * 3; for (const c of [0, 1]) idx.push(q - 3 + c, q - 2 + c, q + c, q + c, q - 2 + c, q + 1 + c); } }); flat(pos, idx, col, op, order); };
  let hexes = 0, total = 0; for (const sc of PS.sections) { const r = sc.route || []; if (!r.length) continue; const pts = []; let cost = 0; if (r.length === 1) { const h = hexAt(r[0].q, r[0].r); const m = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd8ff3f, fog: false })); m.position.set(h.x, gY(h.x, h.z) + 8, h.z); m.raycast = () => {}; pathG.add(m); continue; }
    for (let i = 0; i + 1 < r.length; i++) { const a = hexAt(r[i].q, r[i].r), b = hexAt(r[i + 1].q, r[i + 1].r); for (let k = i ? 1 : 0; k <= 18; k++) { const x = lerp(a.x, b.x, k / 18), z = lerp(a.z, b.z, k / 18); pts.push([x, gY(x, z), z]); } cost += COST[terrOf(r[i + 1].q + ',' + r[i + 1].r)]; }                  // the hex you enter is the one you pay for
    strip(pts, 10, 0x14240c, .8, 3, 1); strip(pts, 5.5, 0xd8ff3f, .96, 3.7, 2); hexes += r.length - 1; total += cost; const e = pts[pts.length - 1], sp = textSprite(blocks(cost)); sp.position.set(e[0], e[1] + 36, e[2]); pathG.add(sp); }
  for (const k in PS.markers) { const mk = PS.markers[k], h = hexAt(mk.q, mk.r), y = gY(h.x, h.z), pin = new THREE.Mesh(new THREE.ConeGeometry(9, 36, 6), new THREE.MeshBasicMaterial({ color: 0xc7ff2e, fog: false })); pin.rotation.x = Math.PI; pin.position.set(h.x, y + 20, h.z); pin.raycast = () => {}; pathG.add(pin); const sp = textSprite(mk.note || 'Destination'); sp.position.set(h.x, y + 66, h.z); pathG.add(sp); }
  $('pathTotal').textContent = hexes ? hexes + ' hex' + (hexes === 1 ? '' : 'es') + ' / ' + blocks(total) : ''; }
function applyPath(st) { PS.lock = st.drawLock || null; if (PS.drawing) return; /* a line being dragged is not swapped for the older one the server holds */ const obj = v => (v && !Array.isArray(v) ? v : {}), sig = JSON.stringify([st.markers, st.path && st.path.sections, st.terrain]); if (sig === PS.sig) return; PS.sig = sig; PS.markers = obj(st.markers); PS.sections = (st.path && st.path.sections) || []; PS.terrain = obj(st.terrain); if (window.__sx) drawPath(); else PS.sig = null; }
setInterval(() => { if (document.hidden || !window.__sx) return; fetch(PATHAPI + '?action=get_state', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => { if (d && d.success && d.data) applyPath(d.data); }).catch(() => {}); }, 1500);
setInterval(() => { if (PS.mine) pathApi('heartbeat_lock'); }, 30000);
const hexLine = (a, b) => { const n = Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)), out = []; for (let i = 1; i <= n; i++) { const t = i / n, q = a.q + (b.q - a.q) * t + 1e-6, r = a.r + (b.r - a.r) * t + 1e-6, sv = -q - r; let rq = Math.round(q), rr = Math.round(r); const rs = Math.round(sv), dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - sv); if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs; out.push({ q: rq, r: rr }); } return out; };   // every hex on the straight line between two
function pathClick(cx, cy) { if (!PS.on || PS.tool === 'none') return false; const p = pick(cx, cy); if (!p) return true; const h = worldToHex(p.x, p.z), key = h.q + ',' + h.r;
  if (PS.tool === 'marker') { PS.hex = { q: h.q, r: h.r }; $('pathNoteRow').style.display = 'flex'; $('pathNoteAt').textContent = 'Hex ' + key; $('pathNote').value = (PS.markers[key] || {}).note || ''; $('pathNote').focus(); }
  else if (PS.tool === 'delete') { if (PS.markers[key]) pathApi('delete_marker', { q: h.q, r: h.r }); else for (const sc of PS.sections) { const i = sc.route.findIndex(x => x.q === h.q && x.r === h.r); if (i >= 0) { if (sc.route.length < 2) { PS.sections = PS.sections.filter(x => x !== sc); pathApi('acquire_lock').then(d => d && d.success && pathApi('save_path', { sections: PS.sections }).then(() => pathApi('release_lock'))); } else pathApi('delete_path_segment', { sectionId: sc.id, segmentIndex: clamp(i, 0, sc.route.length - 2) }); break; } } }
  return true; }
const setTool = async tool => { if (PS.tool === 'terrain' && tool !== 'terrain' && !(await saveTerrain())) return;                    // leaving the terrain tool is what saves it
  if (PS.mine && tool !== 'draw') { PS.mine = false; pathApi('release_lock'); } PS.tool = tool; PS.curId = null; $('pathNoteRow').style.display = 'none'; for (const b of document.querySelectorAll('#pathBar [data-tool]')) b.classList.toggle('on', b.dataset.tool === tool); $('pathDiff').style.display = tool === 'terrain' ? 'flex' : 'none';
  pathSay({ none: 'Pick a tool', marker: 'Click a hex to set a destination there', draw: 'Click a hex, then click the next to join them - or hold and drag to lay it as you go. Esc, or Draw again, stops', delete: 'Click a destination, or any hex of a route, to remove it', terrain: 'Pick a type, then click or drag across hexes. Click Terrain again to save and close' }[tool]);
  if (tool === 'draw' && !PS.mine) { const d = await pathApi('acquire_lock'); PS.mine = !!(d && d.success) && PS.tool === 'draw' && PS.on; if (!(d && d.success)) pathSay((d && d.error) || 'Somebody else is drawing the route'); } };
const setPathMode = on => { PS.on = on; U.uTerrOn.value = on ? 1 : 0; seaG.visible = on; if (!on && PS.tool === 'terrain') saveTerrain(); if (!on) PS.tool = 'none'; $('pathTools').style.display = on ? 'flex' : 'none'; $('pathToggle').classList.toggle('on', on); if (on) setTool('none'); else { if (PS.mine) { PS.mine = false; pathApi('release_lock'); } $('pathNoteRow').style.display = 'none'; pathSay(''); } };
$('pathToggle').onclick = () => setPathMode(!PS.on);
for (const b of document.querySelectorAll('#pathBar [data-tool]')) b.onclick = () => setTool(b.dataset.tool === PS.tool ? 'none' : b.dataset.tool);   // a tool's button a second time turns it off (and for Terrain, saves)
addEventListener('keydown', e => { if (e.key === 'Escape' && PS.on && PS.tool !== 'none') setTool('none'); });
// drawing the route: with Draw on, the left button lays route instead of dragging the map. Click a hex to set a node, click another and the two are joined; or hold and drag, and it is laid hex by hex under the cursor until the button comes up
const drawTo = h => { if (!PS.mine) { pathSay(PS.lock && PS.lock.user ? PS.lock.user + ' is drawing the route' : 'Still fetching the pen - try again in a moment'); return false; } let sc = PS.sections.find(x => x.id === PS.curId);
  if (!sc) { sc = { id: 'section:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8), route: [{ q: h.q, r: h.r }], createdAt: Date.now() }; PS.sections = [...PS.sections, sc]; PS.curId = sc.id; }
  else { const last = sc.route[sc.route.length - 1]; if (last.q === h.q && last.r === h.r) return false; sc.route = [...sc.route, ...hexLine(last, h)]; }
  PS.sig = null; drawPath(); return true; };
const drawAt = e => { const p = pick(e.clientX, e.clientY); if (p && drawTo(worldToHex(p.x, p.z))) PS.drawn = true; };
canvas.addEventListener('pointerdown', e => { if (!PS.on || PS.tool !== 'draw' || e.button !== 0 || e.altKey) return; e.preventDefault(); e.stopImmediatePropagation(); PS.drawing = true; PS.drawn = false; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} drawAt(e); }, true);
canvas.addEventListener('pointermove', e => { if (PS.drawing) drawAt(e); });
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { if (!PS.drawing) return; PS.drawing = false; if (PS.drawn) pathApi('save_path', { sections: PS.sections }); PS.drawn = false; });
for (const b of document.querySelectorAll('#pathBar [data-brush]')) { b.classList.toggle('on', +b.dataset.brush === PS.brush); b.onclick = () => { PS.brush = +b.dataset.brush; for (const o of document.querySelectorAll('#pathBar [data-brush]')) o.classList.toggle('on', o === b); }; }
// painting: with the terrain tool up, the left button paints instead of dragging the map (right-drag, the wheel and the keys still move it)
let paintLast = null;
const paintAt = (cx, cy) => { const p = pick(cx, cy); if (!p) return; const h = worldToHex(p.x, p.z); if (paintLast && paintLast.q === h.q && paintLast.r === h.r) return;
  const B = PS.brush, line = paintLast ? hexLine(paintLast, h) : [h];                                                    // every hex between this and the last one, so a fast drag leaves no gaps
  for (const c of line) for (let dq = -B; dq <= B; dq++) for (let dr = Math.max(-B, -dq - B); dr <= Math.min(B, -dq + B); dr++) { const q = c.q + dq, r = c.r + dr, hh = hexAt(q, r); if (Math.abs(hh.x) > MAP_W / 2 || Math.abs(hh.z) > MAP_D / 2) continue;
    const key = q + ',' + r, baseline = terrainInFlight.has(key) ? terrainInFlight.get(key) : ((PS.terrain[key] || {}).difficulty || 'normal'); if (baseline === PS.diff && !terrainInFlight.has(key)) PS.pending.delete(key); else PS.pending.set(key, PS.diff); }
  paintLast = { q: h.q, r: h.r }; terrPaint(); pathSay(PS.pending.size + ' hex' + (PS.pending.size === 1 ? '' : 'es') + ' changed - click Terrain again to save and close'); };
canvas.addEventListener('pointerdown', e => { if (!PS.on || PS.tool !== 'terrain' || !role.gm || e.button !== 0 || e.altKey) return; e.preventDefault(); e.stopImmediatePropagation(); PS.painting = true; paintLast = null; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} paintAt(e.clientX, e.clientY); }, true);
canvas.addEventListener('pointermove', e => { if (PS.painting) paintAt(e.clientX, e.clientY); });
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { if (PS.painting) { PS.painting = false; paintLast = null; drawPath(); } });
for (const b of document.querySelectorAll('#pathBar [data-diff]')) { b.classList.toggle('on', b.dataset.diff === PS.diff); b.onclick = () => { PS.diff = b.dataset.diff; for (const o of document.querySelectorAll('#pathBar [data-diff]')) o.classList.toggle('on', o === b); }; }
$('pathNew').onclick = () => { PS.curId = null; if (PS.tool !== 'draw') setTool('draw'); else pathSay('Click a hex to start a new line'); };
$('pathUndo').onclick = () => pathApi('undo'); $('pathClear').onclick = () => { if (confirm('Clear every destination and the whole route?')) pathApi('clear_all'); };
$('pathSet').onclick = () => { if (PS.hex) { pathApi('save_marker', { q: PS.hex.q, r: PS.hex.r, note: $('pathNote').value.trim() || 'Destination' }); $('pathNoteRow').style.display = 'none'; } };
$('pathRemove').onclick = () => { if (PS.hex) { pathApi('delete_marker', { q: PS.hex.q, r: PS.hex.r }); $('pathNoteRow').style.display = 'none'; } };
$('pathNote').addEventListener('keydown', e => { if (e.key === 'Enter') $('pathSet').click(); });
addEventListener('pagehide', () => { if (PS.pending.size && navigator.sendBeacon) navigator.sendBeacon(PATHAPI, new Blob([JSON.stringify({ action: 'save_terrain_patch', cells: [...PS.pending].map(([k, d]) => { const [q, r] = k.split(',').map(Number); return { q, r, difficulty: d }; }) })], { type: 'application/json' }));
  if (PS.mine) navigator.sendBeacon && navigator.sendBeacon(PATHAPI, new Blob([JSON.stringify({ action: 'release_lock' })], { type: 'application/json' })); });

// pings, shared with the flat map (same endpoint, same 0-1 map coordinates). Alt + left click: a ping everyone sees. Alt + right click, GM only: a ping that also puts every player's camera exactly where the GM's is
const PING = API + 'api/ping-api.php', seenPings = new Map(), localPings = [];
// a ping is a shaft of light let down from the sky onto the place: it descends, a real lamp lights the ground where it lands, dust drifts in it, and it fades after a while
const BEAM_L = 2600, BEAM_DIR = new THREE.Vector3(0, 1, 0).addScaledVector(SUN, .42).normalize(), BEAM_Q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), BEAM_DIR);
const beamGeo = new THREE.CylinderGeometry(.5, 1, 1, 48, 1, true).translate(0, .5, 0);
const moteTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cx = cv.getContext('2d'), g = cx.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = g; cx.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(cv); })();
const beamMat = (col, k, seed) => new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(col) }, uA: { value: 0 }, uR: { value: 1.2 }, uT: U.uTime, uK: { value: k }, uS: { value: seed } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  vertexShader: 'varying vec2 vUv; varying vec3 vN, vV, vAx; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalMatrix * normal; vV = -mv.xyz; vAx = (modelViewMatrix * vec4(0., 1., 0., 0.)).xyz; gl_Position = projectionMatrix * mv; }',
  fragmentShader: [
    'uniform vec3 uC; uniform float uA, uR, uT, uK, uS; varying vec2 vUv; varying vec3 vN, vV, vAx;',
    'void main() { vec3 ax = normalize(vAx), n = vN - ax * dot(vN, ax), w = normalize(vV); w -= ax * dot(w, ax); float wl = length(w);',
    '  float rim = abs(dot(normalize(n), w / max(wl, 1e-4))), soft = rim * rim * (3. - 2. * rim); soft *= soft * smoothstep(.04, .3, wl);          // bright through the middle, nothing at the edge: a shaft, not a tube',
    '  float a = vUv.x * 6.2832 + uS, ray = .6 + .22 * sin(a * 7. + uT * .21) + .18 * sin(a * 17. - uT * .33 + sin(a * 3. + uT * .1) * 2.);     // slow uneven streaks, as light through cloud has',
    '  float v = (1. - smoothstep(.3, 1., vUv.y)) * smoothstep(0., .012, vUv.y) * smoothstep(uR - .16, uR, vUv.y);                                // lost in the sky above; uR falls as it descends',
    '  gl_FragColor = vec4(uC * (uA * uK * soft * ray * v), 1.); }'].join('\n') });
let pingDim = 0; anim.push(() => { sun.intensity = 3.1 * (1 - .45 * pingDim); hemi.intensity = .35 * (1 - .45 * pingDim); pingDim = 0; });   // while a beam is down the daylight eases back, so the lit place stands out
const pingLamps = [0, 1].map(() => { const l = new THREE.SpotLight(0xffffff, 0, 0, .08, .75, 0); l.userData.free = true; scene.add(l, l.target); return l; });   // always in the scene (dark until wanted), so a ping never makes the materials recompile
function showPing(x, z, focus) { const col = focus ? 0x86c4ff : 0xffc566, T = focus ? 11 : 9, t0 = performance.now(); pace.busy = t0 + (T + 1) * 1000; const g = new THREE.Vector3(x, Math.max(heightAt(x, z), 0), z), grp = new THREE.Group(); grp.position.copy(g); grp.quaternion.copy(BEAM_Q);
  const mk = (k, seed) => { const m = new THREE.Mesh(beamGeo, beamMat(col, k, seed)); m.renderOrder = 9000; m.raycast = () => {}; m.frustumCulled = false; grp.add(m); return m; }, outer = mk(.5, 0), core = mk(1.3, 2.1);
  const mp = [], mr = mulberry32((x * 13 + z * 7) | 0); for (let i = 0; i < 110; i++) { const a = mr() * 6.2832, r = Math.sqrt(mr()), y = mr(); mp.push(Math.cos(a) * r, y, Math.sin(a) * r); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: col, map: moteTex, size: 9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); motes.raycast = () => {}; motes.frustumCulled = false; motes.renderOrder = 9001; grp.add(motes);
  const lamp = pingLamps.find(l => l.userData.free); if (lamp) { lamp.userData.free = false; lamp.color.set(col); lamp.position.copy(g).addScaledVector(BEAM_DIR, 1900); lamp.target.position.copy(g); lamp.target.updateMatrixWorld(); }
  scene.add(grp);
  const step = (t, dt) => { const e = (performance.now() - t0) / 1000;
    if (e > T) { scene.remove(grp); grp.traverse(o => { if (o.material) o.material.dispose(); }); mg.dispose(); if (lamp) { lamp.intensity = 0; lamp.userData.free = true; } Q.nudge(); const i = anim.indexOf(step); if (i >= 0) anim.splice(i, 1); return; }
    const k = clamp(camera.position.distanceTo(g) / 1500, 1, 2.4), R = HEX_R * 1.05 * k, env = (1 - sstep(T - 2.8, T, e)) * (.9 + .1 * Math.sin(e * 1.3)), land = sstep(.9, 2.2, e);   // wider from far off, so it still reads across the whole map
    outer.scale.set(R, BEAM_L, R); core.scale.set(R * .2, BEAM_L, R * .2); const rev = lerp(1.2, -.2, sstep(0, 1.5, e));
    for (const m of [outer, core]) { m.material.uniforms.uA.value = env; m.material.uniforms.uR.value = rev; }
    motes.scale.set(R * .8, 520, R * .8); motes.rotation.y += dt * .12; motes.position.y = 20 + Math.sin(e * .5) * 14; motes.material.opacity = .75 * env * land; motes.material.size = 9 * k;
    if (lamp) { lamp.angle = Math.atan(R * 1.5 / 1900); lamp.intensity = (focus ? 11 : 10) * env * land; } pingDim = Math.max(pingDim, env * land); };
  anim.push(step); }
const sendPing = (p, focus) => { const x = clamp(p.x / MAP_W + .5, 0, 1), y = clamp(p.z / MAP_D + .5, 0, 1), body = { action: 'add_ping', x, y, type: focus ? 'focus' : 'ping' }; if (focus) body.view = [camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z];
  localPings.push([x, y, Date.now()]); if (localPings.length > 20) localPings.shift(); showPing(p.x, p.z, focus);
  fetch(PING, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }).then(r => r.json()).then(d => { if (d && d.success && d.data && d.data.ping) seenPings.set(d.data.ping.id, Date.now()); }).catch(() => {}); };
const pollPings = () => { if (document.hidden || !window.__sx) return; fetch(PING + '?action=get_pings', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => { if (!d || !d.success || !d.data || !Array.isArray(d.data.pings)) return; const now = Date.now(); for (const [k, v] of seenPings) if (now - v > 60000) seenPings.delete(k);
    for (const pg of d.data.pings) { if (!pg || !pg.id || seenPings.has(pg.id)) continue; seenPings.set(pg.id, now); if (localPings.some(l => Math.abs(l[0] - pg.x) < 1e-6 && Math.abs(l[1] - pg.y) < 1e-6 && now - l[2] < 12000)) continue;            // my own, already shown
      const wx = (pg.x - .5) * MAP_W, wz = (pg.y - .5) * MAP_D, focus = pg.type === 'focus'; showPing(wx, wz, focus);
      if (focus && pg.authorId === 'GM') { if (Array.isArray(pg.view) && pg.view.length === 6) glide(new THREE.Vector3(pg.view[0], pg.view[1], pg.view[2]), new THREE.Vector3(pg.view[3], pg.view[4], pg.view[5]), 2.8); else flyTo(wx, wz); } } }).catch(() => {}); };
setInterval(pollPings, 500);
canvas.addEventListener('pointerdown', e => { if (!e.altKey || (e.button !== 0 && e.button !== 2)) return; e.preventDefault(); e.stopImmediatePropagation(); const p = pick(e.clientX, e.clientY); if (p) sendPing(p, e.button === 2 && role.gm); }, true);
canvas.addEventListener('contextmenu', e => { if (e.altKey) e.preventDefault(); });
window.__ping = { showPing, sendPing, role };

// The party's teleportation circles: at the Biblioplex, Kollema Hall, their own workshop and Wiltroot Hall. Nothing of them shows until the Circles button is on;
// then over each place a magic circle floats, turning, on a beam of light. Everyone has the button, and each browser remembers how it was left
const TP_AT = ['Biblioplex', 'Kollema Hall', "Players' Workshop", 'Wiltroot Hall'], TP_COL = 0xb59cff, tp = { on: false, grp: null, list: [] };
const tpTex = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 512; const cx = cv.getContext('2d'), r = mulberry32(77), ring = (rad, w) => { cx.lineWidth = w; cx.beginPath(); cx.arc(256, 256, rad, 0, 6.2832); cx.stroke(); };
  cx.strokeStyle = cx.fillStyle = '#fff'; cx.shadowColor = '#fff'; cx.shadowBlur = 10; cx.lineCap = 'round'; ring(246, 5); ring(232, 2); ring(196, 3); ring(112, 3); ring(100, 1.5);
  for (let i = 0; i < 48; i++) { const a = i / 48 * 6.2832; cx.lineWidth = i % 4 ? 1.5 : 3; cx.beginPath(); cx.moveTo(256 + Math.cos(a) * 232, 256 + Math.sin(a) * 232); cx.lineTo(256 + Math.cos(a) * (i % 4 ? 239 : 246), 256 + Math.sin(a) * (i % 4 ? 239 : 246)); cx.stroke(); }
  for (let i = 0; i < 26; i++) { const a = i / 26 * 6.2832; cx.save(); cx.translate(256 + Math.cos(a) * 214, 256 + Math.sin(a) * 214); cx.rotate(a + Math.PI / 2); cx.lineWidth = 2.6; cx.beginPath();          // a band of made-up letters
    for (let q = 0; q < 3; q++) { const x0 = (r() - .5) * 14, y0 = (r() - .5) * 20; cx.moveTo(x0, y0); if (r() < .4) cx.arc(x0, y0, 3 + r() * 5, r() * 6, r() * 6 + 2 + r() * 3); else cx.lineTo((r() - .5) * 14, (r() - .5) * 20); } cx.stroke(); cx.restore(); }
  for (const off of [0, Math.PI]) { cx.lineWidth = 3; cx.beginPath(); for (let i = 0; i <= 3; i++) { const a = off + i * 2.0944 - Math.PI / 2, x = 256 + Math.cos(a) * 196, y = 256 + Math.sin(a) * 196; if (i) cx.lineTo(x, y); else cx.moveTo(x, y); } cx.stroke(); }    // two triangles, a star of six points
  for (let i = 0; i < 6; i++) { const a = i * 1.0472; cx.lineWidth = 2; cx.beginPath(); cx.arc(256 + Math.cos(a) * 154, 256 + Math.sin(a) * 154, 20, 0, 6.2832); cx.stroke(); cx.beginPath(); cx.arc(256 + Math.cos(a) * 154, 256 + Math.sin(a) * 154, 5, 0, 6.2832); cx.fill(); }
  for (let i = 0; i < 8; i++) { const a = i * .7854; cx.lineWidth = 2.4; cx.beginPath(); cx.moveTo(256 + Math.cos(a) * 30, 256 + Math.sin(a) * 30); cx.lineTo(256 + Math.cos(a) * 100, 256 + Math.sin(a) * 100); cx.stroke(); } ring(30, 3); cx.beginPath(); cx.arc(256, 256, 9, 0, 6.2832); cx.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
function buildCircles() { const tex = tpTex(), g = tp.grp = new THREE.Group(), flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const disc = op => { const m = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ map: tex, color: TP_COL, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); m.raycast = () => {}; m.frustumCulled = false; m.renderOrder = 8990; return m; };
  for (const name of TP_AT) { const t = things.find(q => q.name === name); if (!t) continue; const gy = Math.max(heightAt(t.x, t.z), 0), o = new THREE.Group(), big = disc(1), small = disc(.8), beams = [.45, 1.2].map((k, i) => { const m = new THREE.Mesh(beamGeo, beamMat(TP_COL, k, i * 2.1)); m.material.uniforms.uA.value = 1; m.material.uniforms.uR.value = -.2; m.raycast = () => {}; m.frustumCulled = false; m.renderOrder = 8980; o.add(m); return m; });
    o.position.set(t.x, gy, t.z); o.add(big, small); g.add(o); tp.list.push({ o, big, small, beams, top: t.labelY - gy + 8, ph: tp.list.length * 1.7 }); }
  g.visible = false; scene.add(g); }
const setCircles = on => { if (on && !tp.grp) buildCircles(); tp.on = on; if (tp.grp) tp.grp.visible = on; $('tpToggle').classList.toggle('on', on); try { localStorage.setItem('sxCircles', on ? '1' : '0'); } catch (e) {} };
$('tpToggle').onclick = () => setCircles(!tp.on);
anim.push(t => { if (!tp.init && things.length) { tp.init = true; let was = false; try { was = localStorage.getItem('sxCircles') === '1'; } catch (e) {} if (was) setCircles(true); } if (!tp.on) return;
  for (const c of tp.list) { const k = clamp(camera.position.distanceTo(c.o.position) / 1300, 1, 3), R = 40 * k, y = c.top + 6 * k + Math.sin(t * .8 + c.ph) * 4;       // larger from far off, so they read across the whole map
    c.big.position.y = y; c.big.scale.setScalar(R); c.big.rotation.y = t * .35 + c.ph; c.small.position.y = y + 9 * k; c.small.scale.setScalar(R * .56); c.small.rotation.y = -t * .6;
    c.beams[0].scale.set(R * .3, y + 520, R * .3); c.beams[1].scale.set(R * .09, y + 520, R * .09); const a = .8 + .2 * Math.sin(t * 1.7 + c.ph); c.beams[0].material.uniforms.uA.value = a; c.beams[1].material.uniforms.uA.value = a; } });

const mouse = { x: 0, y: 0, inside: false, buttons: 0 }; let downAt = null;
// how often a frame is drawn. Never more than about sixty times a second; ten while this window is not the one in use; thirty once nobody has touched it for two minutes.
// Coming back to the window, or a ping or a pull arriving, brings full speed back at once
const pace = { last: 0, busy: 0, touch: performance.now(), full: true };
for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) addEventListener(ev, () => { pace.touch = performance.now(); }, { capture: true, passive: true });
canvas.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; mouse.buttons = e.buttons; tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 18}px)`; });
canvas.addEventListener('pointerleave', () => { mouse.inside = false; });
canvas.addEventListener('pointerdown', e => { mouse.buttons = e.buttons; if (e.button === 0) downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => { mouse.buttons = e.buttons; if (e.button !== 0 || !downAt) return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 5 && !pathClick(e.clientX, e.clientY)) { const t = targetAt(e.clientX, e.clientY); if (t) select(t); } downAt = null; });
canvas.addEventListener('dblclick', e => { if (PS.on) return; const t = targetAt(e.clientX, e.clientY); if (t) { select(t); flyTarget(t); } });
const keys = new Set(), typing = e => /^(TEXTAREA|INPUT)$/.test(e.target.tagName);
addEventListener('keydown', e => { if (typing(e)) return; keys.add(e.key.toLowerCase()); if (e.key.toLowerCase() === 'g') document.getElementById('bGrid').click(); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// ------------------------------------------------------------------ labels (far-zoom icons, near-zoom names)
const labelRoot = document.getElementById('labels'), labels = [];
function buildLabels() { return;   // labels are switched off: places are named in the popup instead
  const mk = (name, ico, x, y, z, onclick) => { const el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = `<span class="ico">${ico}</span>${name}`;
    el.onclick = onclick; labelRoot.appendChild(el); labels.push({ el, v: new THREE.Vector3(x, y, z) }); };
  for (const t of things) mk(t.name, t.icon, t.x, t.labelY, t.z, () => { select({ thing: t }); flyTarget({ thing: t }); });
  const regions = [['Lava Lake', '🔥', [X(.225), Z(.665)], 30], ['Furygale', '🌪️', FURY, 70], ['Prismari Volcanoes', '🌋', [VOLC[0].x, VOLC[0].z], 60],
    ['Scarwood', '🌲', FOREST[0], 40], ['The Dunes', '🏜️', [X(.74), Z(.575)], 40], ['Detention Bog', '☠️', [X(.86), Z(.77)], 30]];
  for (const [name, ico, p, up] of regions) { const x = p[0] * S, z = p[1] * S; mk(name, ico, x, Math.max(heightAt(x, z), 0) + up * S, z, () => flyTo(x, z, 620, 62)); }
}
const pv = new THREE.Vector3();
function updateLabels(camDist) { return;
  const far = camDist > 1300; labelRoot.classList.toggle('near', !far);
  for (const l of labels) { pv.copy(l.v).project(camera); const d = camera.position.distanceTo(l.v);
    const vis = pv.z < 1 && Math.abs(pv.x) < 1.1 && Math.abs(pv.y) < 1.1 && (far || d < 2300);
    l.el.style.opacity = vis ? (far ? 1 : .85) : 0; l.el.style.pointerEvents = vis ? 'auto' : 'none';
    if (vis) l.el.style.transform = `translate(-50%,-100%) translate(${((pv.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - pv.y) / 2 * innerHeight).toFixed(1)}px)`; }
}

// ------------------------------------------------------------------ post-processing
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.5, 1.15); composer.addPass(bloom);
composer.addPass(new OutputPass());
// automatic quality, in three steps of drawing resolution (the browser scales the picture back up). It drops a step when the map runs slow, and climbs back the moment it runs freely again:
// after a second of smooth frames it tries the step above. If that proves too much it comes straight back down and waits a little longer before the next try (never long), and a change of view clears the wait
const BASE_PR = renderer.getPixelRatio(), TIERS = [1, .75, .55], TNAME = ['normal', 'medium', 'low']; let rscale = 1;
function setScale(v) { rscale = v; renderer.setPixelRatio(BASE_PR * v); composer.setPixelRatio(BASE_PR * v); }
const Q = { tier: 0, sum: 0, n: 0, skip: 0, wait: 1, upAt: -99, downAt: -99, refresh: 1 / 60, cam: new THREE.Vector3(),
  nudge() { this.wait = 1; },                                                                                                                    // something heavy has just ended (a ping's beam, the eagle's dome, the tab coming back): try again without waiting
  set(t) { this.tier = t; setScale(TIERS[t]); this.sum = this.n = 0; this.skip = 4; document.body.dataset.quality = TNAME[t]; },                    // the few frames after a change are not counted: resizing the buffers costs one of its own
  feed(raw, now) { if (this.skip > 0) { this.skip--; return; } this.sum += raw; this.n++; const trying = now - this.upAt < 3; if (this.n < (trying ? 16 : 24)) return;
    const avg = this.sum / this.n; this.sum = this.n = 0; if (avg < this.refresh && avg > 1 / 250) this.refresh = avg;                               // the quickest the screen has ever gone: its own refresh rate
    if (avg > 1 / 38) { if (this.tier < TIERS.length - 1) { if (trying) this.wait = Math.min(this.wait * 2, 8); this.cam.copy(camera.position); this.downAt = now; this.set(this.tier + 1); } return; }   // under 38 frames a second: down a step
    if (this.downAt < this.upAt && now - this.upAt > 6) this.wait = 1;                                                                                                // the last climb held
    if (this.tier > 0) { if (camera.position.distanceTo(this.cam) > camera.position.distanceTo(controls.target) * .2) this.wait = 1;                 // looking somewhere else now: worth trying at once
      if (avg < Math.max(1 / 52, this.refresh * 1.15) && now - this.downAt >= this.wait) { this.upAt = now; this.set(this.tier - 1); } } } };
document.addEventListener('visibilitychange', () => { if (!document.hidden) Q.nudge(); });
addEventListener('resize', () => { Q.nudge(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// ------------------------------------------------------------------ HUD
const toggle = (id, fn) => { const b = document.getElementById(id); b.onclick = () => { b.classList.toggle('on'); fn(b.classList.contains('on')); }; };
toggle('bGrid', on => U.uGrid.value = on ? .4 : 0);
toggle('bBloom', on => bloom.enabled = on);
toggle('bShadow', on => { sun.castShadow = on; renderer.shadowMap.needsUpdate = true; });
toggle('bLabels', on => labelRoot.style.display = on ? '' : 'none');
const glide = (p1, t1, dur = 1.8) => { fly = { t: 0, dur, p0: camera.position.clone(), p1, t0: controls.target.clone(), t1 }; controls.enabled = false; };
document.getElementById('bOver').onclick = () => glide(HOME_POS.clone(), HOME_TGT.clone());
document.getElementById('bVolc').onclick = () => glide(new THREE.Vector3((LAKE[0] + 190) * S, 330 * S, (LAKE[1] + 640) * S), new THREE.Vector3((LAKE[0] - 20) * S, 60 * S, (LAKE[1] - 120) * S), 2);
document.getElementById('bVolc').onclick = () => glide(new THREE.Vector3((LAKE[0] + 150) * S, 420 * S, (LAKE[1] + 760) * S), new THREE.Vector3(LAKE[0] * S, 50 * S, (LAKE[1] - 60) * S), 2);
document.getElementById('bPris').onclick = () => glide(new THREE.Vector3((FURY[0] + 330) * S, 190 * S, (FURY[1] + 360) * S), new THREE.Vector3(FURY[0] * S, 40 * S, FURY[1] * S), 2);
document.getElementById('bCen').onclick = () => glide(new THREE.Vector3(CEN[0] * S + 120, 760, CEN[1] * S + 1150), new THREE.Vector3(CEN[0] * S, 30, CEN[1] * S + 120), 2);
document.getElementById('bConj').onclick = () => glide(new THREE.Vector3((PRISHALL[0] + 260) * S, 190 * S, (PRISHALL[1] + 330) * S), new THREE.Vector3(PRISHALL[0] * S, 90 * S, PRISHALL[1] * S), 2);

// ------------------------------------------------------------------ go
const loading = document.getElementById('loading');
loading.textContent = 'Sculpting terrain…';
setTimeout(async () => {
  const cache = await terrainCache.get(); if (cache) loading.textContent = 'Raising the campus…';
  const t0 = performance.now();
  buildGrade(); const kept = buildTerrain(cache); const t1 = performance.now();
  buildWater(); const t1b = performance.now(); const stats = buildProps(); const t1c = performance.now(); buildFx(); buildSmoke(); buildLabels();
  const t2 = performance.now(); window.__times = { terrain: Math.round(t1 - t0), water: Math.round(t1b - t1), props: Math.round(t1c - t1b), rest: Math.round(t2 - t1c), frames: [] };
  renderer.shadowMap.needsUpdate = true;
  document.getElementById('gen').textContent = `${NX}×${NZ} grid · ${kept ? "terrain from cache · " : ""}built in ${((t2 - t0) / 1000).toFixed(1)}s · ${stats.trees} trees · ${stats.spires} spires · ${stats.things} things`;
  // every material's shader is compiled before the first frame is shown, off the main thread where the browser allows it, so the map does not stutter into view
  loading.textContent = 'Lighting the lamps…'; try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) {}
  // and it is uncovered from the middle outward, from under a bank of cloud
  { const veil = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * 5, MAP_D * 5), new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: { uR: { value: 0 }, uTime: U.uTime, uNoise: U.uNoise, uC: { value: new THREE.Vector2(CEN[0] * S, CEN[1] * S) } },
      vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform float uR, uTime; uniform vec2 uC; uniform sampler2D uNoise; varying vec2 vP; void main(){ float n = texture2D(uNoise, vP / 2100.0 + uTime * 0.012).r + 0.5 * texture2D(uNoise, vP / 640.0 - uTime * 0.02).r; float d = length(vP - uC) + (n - 0.75) * 620.0; float a = smoothstep(uR - 300.0, uR + 300.0, d); vec3 c = mix(vec3(0.07, 0.08, 0.12), vec3(0.36, 0.40, 0.48), clamp(n * 0.7, 0.0, 1.0)); gl_FragColor = vec4(c, a * 0.99); }' }));
    veil.rotation.x = -Math.PI / 2; veil.position.y = 40; veil.renderOrder = 9999; veil.frustumCulled = false; veil.raycast = () => {}; scene.add(veil); const lb = document.getElementById('labels'); if (lb) lb.style.opacity = 0;
    const tv = performance.now(), DUR = 3200; anim.push(() => { if (!veil.parent) return; const f = Math.min((performance.now() - tv) / DUR, 1); veil.material.uniforms.uR.value = -400 + 6400 * f * f * (3 - 2 * f); if (f >= 1) { scene.remove(veil); veil.geometry.dispose(); veil.material.dispose(); if (lb) { lb.style.transition = 'opacity .6s'; lb.style.opacity = 1; } } }); }
  loading.style.display = 'none'; terrainCache.put();
  window.__sx = { THREE, camera, controls, flyTo, heightAt, renderer, scene, U, stats, things, movers, quality: Q, pick, targetAt, terrainMesh, pace, ray, hexOwner, select, setHover, composer, updateLabels };
  const clock = new THREE.Clock(); let acc = 0, frames = 0;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), mv = new THREE.Vector3(), hvP = new THREE.Vector3(), hvQ = new THREE.Quaternion(); let hvX = -1, hvY = -1, hvAt = 0;
  // the solid, unlit parts of things, which may be left out of a frame when too small to see. Lights and glowing things stay in always (a glint shows however small it is), and so does anything that walks or flies
  const tiny = [], roam = new Set(); for (const mv2 of movers) mv2.o.traverse(o => roam.add(o));
  for (const g of thingRoots) g.traverse(o => { const m = o.material; if (!o.isMesh || o.isInstancedMesh || roam.has(o) || !o.frustumCulled || !m || !m.isMeshStandardMaterial || m.transparent || (m.emissiveIntensity > 0 && m.emissive.getHex() !== 0)) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const bs = o.geometry.boundingSphere; tiny.push({ o, c: bs.center, r2: bs.radius * bs.radius }); }); window.__sx.tiny = tiny;
  // ---- the tour: a slow flight past every place on the map in turn, each seen from the south as the camera swings across its front. Adding ?tour to the address plays it;
  // ?tour=record also films it and saves the film when it ends. Esc stops it. The route goes each time to the nearest place not yet seen
  const tour = { on: false, t: 0, i: 0, dur: 0, keys: null, order: null }; let rec = null;
  const buildTour = () => { const left = new Set(things), order = []; let cur = things.find(t => t.name === 'Biblioplex') || things[0];
    while (cur) { order.push(cur); left.delete(cur); let best = null, bd = 1e18; for (const t of left) { const d = (t.x - cur.x) ** 2 + (t.z - cur.z) ** 2; if (d < bd) { bd = d; best = t; } } cur = best; }
    const K = [], el = .5, key = (time, p, g, name) => K.push({ time, p, g, name }); let time = 0; key(0, HOME_POS.clone(), HOME_TGT.clone()); time += 3.5; key(time, HOME_POS.clone().multiplyScalar(.8), HOME_TGT.clone());
    order.forEach((t, i) => { const gy = Math.max(heightAt(t.x, t.z), 0), hgt = clamp(t.labelY - gy, 20, 260), g = new THREE.Vector3(t.x, gy + hgt * .32, t.z), ext = t.hexes.reduce((m, h) => Math.max(m, Math.hypot(h.x - t.x, h.z - t.z)), 0);
      const d = Math.max(clamp(t.view * .6, 170, 540) + hgt * .5, ext * 1.5 + 150), dir = i % 2 ? 1 : -1, last = K[K.length - 1]; let el = /Pillardrop 492|Sinkhole/.test(t.name) ? 1.05 : .5;   // far enough back to take in a place that covers several hexes; a hole in the ground is looked into from higher up
      const raw = az => new THREE.Vector3(g.x + Math.sin(az) * Math.cos(el) * d, g.y + Math.sin(el) * d, g.z + Math.cos(az) * Math.cos(el) * d);
      const clear = p => { for (let q = 1; q < 12; q++) { const f = q / 14; if (lerp(p.y, g.y, f) < heightAt(lerp(p.x, g.x, f), lerp(p.z, g.z, f)) + 8) return false; } return true; };
      while (el < 1.2 && ![-.42, 0, .42].every(a => clear(raw(a * dir)))) el += .1;                                                                                       // and lifted until no hill stands between the camera and the place
      const at = az => { const p = raw(az); p.y = Math.max(p.y, heightAt(p.x, p.z) + 30); return p; };
      const p0 = at(-.42 * dir), hop = last.p.distanceTo(p0);
      if (hop > 260) { const mid = last.p.clone().lerp(p0, .5), mg = last.g.clone().lerp(g, .5), tt = clamp(hop / 680, .8, 2.4); mid.y = Math.max(last.p.y, p0.y, heightAt(mid.x, mid.z) + 60) + clamp(hop * .22, 40, 240); time += tt; key(time, mid, mg); time += tt; }   // a long hop goes up and over, not through what lies between
      else time += clamp(hop / 340, 1.1, 4.5);
      key(time, p0, g, t.name); time += 1.7; key(time, at(0), g); time += 1.7; key(time, at(.42 * dir), g); });
    time += 4; key(time, HOME_POS.clone(), HOME_TGT.clone());
    for (let i = 0; i < K.length; i++) { const a = K[Math.max(i - 1, 0)], b = K[Math.min(i + 1, K.length - 1)], dt = Math.max(b.time - a.time, 1e-3); K[i].mp = b.p.clone().sub(a.p).divideScalar(dt); K[i].mg = b.g.clone().sub(a.g).divideScalar(dt); }   // the speed through each point, so the flight never stops and starts
    tour.keys = K; tour.dur = time; tour.order = order; };
  const hm = (a, ma, b, mb, dt, u, out) => { const u2 = u * u, u3 = u2 * u; return out.copy(a).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(ma, (u3 - 2 * u2 + u) * dt).addScaledVector(b, -2 * u3 + 3 * u2).addScaledVector(mb, (u3 - u2) * dt); };
  const tourAt = time => { const K = tour.keys; let i = tour.i; if (i >= K.length - 1 || K[i].time > time) i = 0; while (i + 2 < K.length && K[i + 1].time <= time) i++; tour.i = i;
    const a = K[i], b = K[i + 1], dt = b.time - a.time, u = clamp((time - a.time) / dt, 0, 1); hm(a.p, a.mp, b.p, b.mp, dt, u, camera.position); hm(a.g, a.mg, b.g, b.mg, dt, u, controls.target);
    const fl = heightAt(camera.position.x, camera.position.z) + 24; if (camera.position.y < fl) camera.position.y = fl; camera.lookAt(controls.target); };
  const endTour = () => { if (!tour.on) return; tour.on = false; controls.enabled = true; document.body.classList.remove('touring'); if (rec && rec.state !== 'inactive') rec.stop(); glide(HOME_POS.clone(), HOME_TGT.clone(), 2); };
  const startTour = record => { if (!tour.keys) buildTour(); tour.t = 0; tour.i = 0; tour.on = true; fly = null; controls.enabled = false; setHover(null); document.body.classList.add('touring');
    if (record && window.MediaRecorder) { const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)), chunks = []; rec = new MediaRecorder(canvas.captureStream(60), { mimeType: type, videoBitsPerSecond: 16e6 });
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; rec.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = 'strixhaven-flythrough.webm'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); rec = null; }; rec.start(1000); } };
  addEventListener('keydown', e => { if (e.key === 'Escape' && tour.on) endTour(); });
  if (params.has('tour')) setTimeout(() => startTour(params.get('tour') === 'record'), 4500);   // once the map has opened
  window.__tour = { tour, build: buildTour, at: tourAt, start: startTour, end: endTour };
  const step = fixed => {
    const raw = fixed ?? clock.getDelta(), dt = Math.min(raw, .1); U.uTime.value += dt; if (window.__times.frames.length < 60) window.__times.frames.push(Math.round(raw * 1000));
    if (fixed === undefined && !tour.on && !document.hidden && raw < .25 && U.uTime.value > 7 && pace.full) Q.feed(raw, performance.now() / 1000);   // only frames drawn at full speed say anything about how the map is running
    if (tour.on) { tour.t += dt; tourAt(tour.t); if (tour.t >= tour.dur) endTour(); }
    else if (fly) { fly.t = Math.min(1, fly.t + dt / fly.dur); const k = fly.t < .5 ? 4 * fly.t ** 3 : 1 - Math.pow(-2 * fly.t + 2, 3) / 2;
      camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k); camera.lookAt(controls.target);
      if (fly.t >= 1) { fly = null; controls.enabled = true; } }
    else {
      const dist = camera.position.distanceTo(controls.target);
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.set(-fwd.z, 0, fwd.x); mv.set(0, 0, 0);
      if (keys.has('w') || keys.has('arrowup')) mv.add(fwd); if (keys.has('s') || keys.has('arrowdown')) mv.sub(fwd);
      if (keys.has('d') || keys.has('arrowright')) mv.add(right); if (keys.has('a') || keys.has('arrowleft')) mv.sub(right);
      if (mv.lengthSq()) { mv.normalize().multiplyScalar(dist * .9 * dt); camera.position.add(mv); controls.target.add(mv); }
      const turn = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
      if (turn) { const o = camera.position.clone().sub(controls.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, turn * dt * 1.2); camera.position.copy(controls.target).add(o); }
      controls.target.x = clamp(controls.target.x, -MAP_W / 2, MAP_W / 2); controls.target.z = clamp(controls.target.z, -MAP_D / 2, MAP_D / 2);
      const dy = (Math.max(heightAt(controls.target.x, controls.target.z), 0) - controls.target.y) * Math.min(1, dt * 5); controls.target.y += dy; camera.position.y += dy;
      controls.update();
    }
    const floor = heightAt(camera.position.x, camera.position.z) + 12; if (camera.position.y < floor) camera.position.y = floor;
    camera.updateMatrixWorld();
    // hover follows the cursor every frame, so it stays right while the camera moves under a still mouse
    if (!mouse.inside) { setHover(null); hvX = -1; } else if (!mouse.buttons && !fly && !tour.on) { const nowH = performance.now();
      if (mouse.x !== hvX || mouse.y !== hvY || nowH - hvAt > 250 || !hvP.equals(camera.position) || !hvQ.equals(camera.quaternion)) { hvX = mouse.x; hvY = mouse.y; hvAt = nowH; hvP.copy(camera.position); hvQ.copy(camera.quaternion); setHover(targetAt(mouse.x, mouse.y)); } }   // looked up again when the mouse or the view has moved, and a few times a second besides for things that walk
    const cd = camera.position.distanceTo(controls.target);
    scene.fog.near = cd * .9 + 1200; scene.fog.far = scene.fog.near + 15000;
    sky.position.copy(camera.position);
    for (const f of anim) f(U.uTime.value, dt);
    for (const sp of spin) { sp.o.rotation.y += sp.speed * dt; if (sp.bolt) { const t = U.uTime.value; sp.o.material.emissiveIntensity = Math.sin(t * 37) + Math.sin(t * 61.7) > .7 ? 5 : 1.8; } }
    FXSCALE.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    updateSmoke(dt); updateLabels(cd);
    { const casting = renderer.shadowMap.needsUpdate, k2 = FXSCALE.value * FXSCALE.value, cp = camera.position;
      // parts of things too small to see from here are left out of the frame: anything whose whole bulk would cover less than a pixel and a half (never while shadows are being cast)
      for (const c of tiny) { const e = c.o.matrixWorld.elements, v = c.c, x = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12] - cp.x, y = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13] - cp.y, z = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14] - cp.z;
        const sc = Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]), m = casting || c.r2 * sc * k2 >= .5625 * (x * x + y * y + z * z) ? 1 : 2; if (c.o.layers.mask !== m) c.o.layers.mask = m; } }
    renderer.info.reset(); composer.render();
    acc += dt; frames++;
    if (acc >= .5) { document.getElementById('fps').textContent = (frames / acc).toFixed(0) + ' fps' + (rscale < 1 ? ' @ ' + Math.round(rscale * 100) + '% res' : ''); document.getElementById('tris').textContent = (renderer.info.render.triangles / 1e6).toFixed(2) + 'M'; document.getElementById('calls').textContent = renderer.info.render.calls; acc = 0; frames = 0; }
  };
  window.__step = step;   // __capture and __step let the map be advanced a frame at a time, for filming it
  (function loop(now = performance.now()) { requestAnimationFrame(loop); if (window.__capture) return;
    const active = document.hasFocus() || now < pace.busy || !!fly || tour.on, gap = !active ? 100 : now - pace.touch > 120000 ? 1000 / 30 : 1000 / 60;
    if (now - pace.last < gap - 3) return; const full = gap < 20; if (full && !pace.full) clock.getDelta(); pace.full = full; pace.last = now; step(); })();   // the first frame back at full speed is not held against the map's running
}, 60);
</script>
</body>
</html>
