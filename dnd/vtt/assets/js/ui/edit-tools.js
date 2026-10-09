import {panelLeft} from './edits-place.mjs';
const $=s=>document.querySelector(s);
function mount(){
 const height=$('[data-action="terrain-height"]'),walls=$('[data-action="terrain-walls"]'),board=$('#vtt-board-canvas');
 if(!height||!walls||!board){requestAnimationFrame(mount);return;}
 const button=document.createElement('button');button.className='btn';button.type='button';button.textContent='Edits';button.dataset.action='map-edits';button.setAttribute('aria-expanded','false');height.before(button);
 const panel=document.createElement('aside');panel.id='edits-panel';panel.hidden=true;panel.innerHTML='<header><strong>Edits</strong><button class="btn" aria-label="Close edits">×</button></header><div class="edit-tools"></div><div id="edits-levels" hidden></div>';board.parentElement.append(panel);
 const tools=panel.querySelector('.edit-tools');tools.append(walls);
 const stairs=document.createElement('button');stairs.className='btn';stairs.textContent='Stairs';stairs.type='button';stairs.onclick=()=>{close();$('[data-settings-launch="stairs"]')?.click();};tools.append(stairs,height);
 const levels=document.createElement('button');levels.className='btn';levels.textContent='Levels';levels.type='button';levels.setAttribute('aria-expanded','false');tools.append(levels);
 const content=$('#edits-levels');levels.onclick=()=>{content.hidden=!content.hidden;levels.setAttribute('aria-expanded',String(!content.hidden));};
 function close(){panel.hidden=true;button.setAttribute('aria-expanded','false');}
 button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));};panel.querySelector('header button').onclick=close;
 for(const b of [walls,height])b.addEventListener('click',close);
 const style=document.createElement('style');style.textContent=`
 html:has(body.vtt-body),body.vtt-body{height:100%;overflow:hidden!important;overscroll-behavior:none}
 body.vtt-body .vtt-app{box-sizing:border-box;min-height:0;height:calc(100dvh - var(--sandbox-nav-height,0px));overflow:hidden}
 .vtt-board__actions [data-action="map-edits"]{grid-column:2;grid-row:4}
 #edits-panel{position:absolute;left:58px;top:12px;width:300px;max-height:calc(100% - 24px);overflow:auto;padding:14px;box-sizing:border-box;z-index:95;border:1px solid #777;border-radius:8px;background:var(--panel-bg,#24252b);color:var(--text-color,#eee);box-shadow:0 6px 24px #0007}
 #edits-panel[hidden],#edits-levels[hidden]{display:none}
 #edits-panel header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
 #edits-panel .edit-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}
 #edits-panel .edit-tools>.btn{grid-column:auto;grid-row:auto}
 .scene-item__content>.scene-item__levels{display:none}
 [data-settings-launch="stairs"]{display:none!important}
 #edits-levels{margin-top:12px}#edits-levels .scene-item__levels{display:block}
 `;document.head.append(style);
 let current=null;
 function update(){
  const c=window.terrainContext?.();button.hidden=!c?.isGM;if(!c?.isGM)close();
  const source=$('.scene-item.is-active .scene-item__levels');if(source){content.replaceChildren(source);current=c?.state.boardState.activeSceneId;}
  else if(current&&current!==c?.state.boardState.activeSceneId){content.replaceChildren();current=null;}
  // A selected token's card slides in over these panels; one it would cover moves beside it.
  const card=$('.vtt-character-summary--open,.vtt-monster-summary--open')?.getBoundingClientRect()??null,host=board.parentElement.getBoundingClientRect();
  for(const id of ['edits-panel','wall-panel','terrain-panel']){const el=document.getElementById(id);if(!el||el.hidden)continue;
   const left=panelLeft({card,host,width:el.offsetWidth||300}),value=left===null?'':left+'px';if(el.style.left!==value)el.style.left=value;}
  const app=$('#vtt-app');if(app){const top=app.getBoundingClientRect().top+window.scrollY;document.documentElement.style.setProperty('--sandbox-nav-height',Math.max(0,top)+'px');}
  requestAnimationFrame(update);
 }
 window.scrollTo(0,0);update();
}
requestAnimationFrame(mount);
