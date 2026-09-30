import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {heroTokenConfirmationPosition, showHeroTokenConfirmation} from '../hero-token-confirmation.js';

test('hero-token popup flips from either screen edge and stays above the bottom', () => {
 const size = {width:188,height:100}, viewport = {width:320,height:240};
 assert.deepEqual(heroTokenConfirmationPosition({left:5,right:25,top:10,bottom:30},size,viewport),{left:33,top:10});
 assert.deepEqual(heroTokenConfirmationPosition({left:290,right:310,top:210,bottom:230},size,viewport),{left:94,top:130});
});

test('hero-token confirmation settles replacement, cancel, yes and detached anchors', async () => {
 const dom = new JSDOM('<body><div id="vtt-character-summary-panel"><button id="anchor"></button></div></body>');
 const saved = {window:globalThis.window,document:globalThis.document,MutationObserver:globalThis.MutationObserver};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,MutationObserver:dom.window.MutationObserver});
 try {
  const anchor=document.getElementById('anchor');
  const first=showHeroTokenConfirmation(anchor),second=showHeroTokenConfirmation(anchor);
  assert.equal(await first,false,'Superseded confirmation never leaves an awaited action hanging');
  document.querySelector('[data-cancel-hero-token]').click(); assert.equal(await second,false);
  const yes=showHeroTokenConfirmation(anchor);document.querySelector('[data-confirm-hero-token]').click();assert.equal(await yes,true);
  const removed=showHeroTokenConfirmation(anchor);anchor.remove();assert.equal(await removed,false);
  assert.equal(document.querySelector('.vtt-character-token-confirmation'),null);
 } finally { Object.assign(globalThis,saved);dom.window.close(); }
});
