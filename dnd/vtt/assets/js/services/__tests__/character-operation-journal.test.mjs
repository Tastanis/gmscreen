import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterOperationJournal} from '../character-operation-journal.js';

test('pending writes survive reopening and separate users and simultaneous tabs',()=>{
 const entries=new Map();
 const storage={get length(){return entries.size;},key:i=>[...entries.keys()][i],getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
 const a=createCharacterOperationJournal(storage,'cal'),b=createCharacterOperationJournal(storage,'cal'),other=createCharacterOperationJournal(storage,'sharon');
 a.begin({operationId:'first-op',fields:{character:'cal'},action:'sync-surges'});
 b.begin({operationId:'second-op',fields:{character:'cal'},action:'sync-resource'});
 a.fail('first-op','Lost acknowledgement');
 const reopened=createCharacterOperationJournal(storage,'cal');
 assert.equal(reopened.list().length,2);assert.equal(other.list().length,0);
 assert.equal(reopened.list().find(e=>e.operationId==='first-op').reason,'Lost acknowledgement');
 reopened.complete('first-op');assert.equal(b.list().length,1);assert.equal(b.list()[0].operationId,'second-op');
});

test('unavailable local storage fails before recording an attempt',()=>{
 const journal=createCharacterOperationJournal({getItem(){throw Error('Storage unavailable');}},'cal');
 assert.throws(()=>journal.begin({operationId:'first-op'}),/Storage unavailable/);
});
