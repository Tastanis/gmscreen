import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVisionToken,isAlwaysVisibleAlly} from '../vision-ownership.js';
const tokens=[{id:'pc',profileId:'cal'},{id:'summon',visionOwners:['cal']},{id:'enemy',team:'enemy'}];
test('player selection grants sight only through their owned or linked token',()=>{
 const c={userId:'cal',followId:'pc'};
 assert.equal(resolveVisionToken(tokens,{...c,selectedIds:['summon']}).id,'summon');
 assert.equal(resolveVisionToken(tokens,{...c,selectedIds:['enemy']}).id,'pc');
 assert.equal(resolveVisionToken(tokens,{userId:'cal'}).id,'summon');
 assert.equal(resolveVisionToken(tokens,{userId:'nobody'}),null);
});
test('GM has an unrestricted overview without a single selected token',()=>{
 assert.equal(resolveVisionToken(tokens,{isGM:true}),null);
 assert.equal(resolveVisionToken(tokens,{isGM:true,selectedIds:['enemy']}).id,'enemy');
});
test('owned tokens and allies remain visible without granting every player their sight',()=>{
 assert.equal(isAlwaysVisibleAlly(tokens[0]),true);assert.equal(isAlwaysVisibleAlly(tokens[1]),true);
 assert.equal(isAlwaysVisibleAlly(tokens[2]),false);
 assert.equal(isAlwaysVisibleAlly({team:'ally'}),false);
 assert.equal(resolveVisionToken(tokens,{userId:'sharon',selectedIds:['summon']}),null);
});

test('player retains the last owned viewpoint after deselection, but not after ownership revocation',()=>{
 assert.equal(resolveVisionToken(tokens,{userId:'cal',followId:'pc',lastId:'summon'}).id,'summon');
 assert.equal(resolveVisionToken(tokens,{userId:'sharon',followId:'pc',lastId:'summon'}).id,'pc');
});
