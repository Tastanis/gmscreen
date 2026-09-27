import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('map runtime import graph is self-contained and contains no prototype map fixtures',()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const seen=new Set();
 function visit(file){
  if(seen.has(file))return;seen.add(file);
  assert.ok(fs.existsSync(file),`Missing packaged module: ${file}`);
  const text=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(text,/\.playwright-mcp|observatory-test|elfsong-test|rennet-import|stairs-test|prison-test/);
  for(const match of text.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.[^'"]+)['"]/g))visit(path.resolve(path.dirname(file),match[1].split('?')[0]));
 }
 visit(path.join(root,'ui/terrain-prototype.js'));
 assert.ok(seen.size>=30,'Checks transitive imports as well as the entrypoint');
});
