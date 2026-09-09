const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
function walk(folder) {
  return fs.readdirSync(folder, {withFileTypes:true}).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(folder,entry.name)) : [path.join(folder,entry.name)]);
}
const files = ['dnd/vtt/assets/js','dnd/character_sheet/ability-automation','dnd/character_sheet/inventory']
  .flatMap(folder => walk(path.join(root,folder))).filter(file => file.endsWith('.test.mjs')).sort();
let passed = 0, failed = 0;
const failedFiles = [];
for (const file of files) {
  const result = cp.spawnSync(process.execPath, ['--test',file], {cwd:root,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
  passed += Number(result.stdout?.match(/# pass (\d+)/)?.[1] || 0);
  failed += Number(result.stdout?.match(/# fail (\d+)/)?.[1] || 0);
  if (result.status !== 0) {
    failedFiles.push(path.relative(root,file));
    process.stderr.write(`${path.relative(root,file)}\n${result.stdout || ''}${result.stderr || ''}${result.error?.message || ''}\n`);
  }
}
console.log(JSON.stringify({files:files.length,pass:passed,fail:failed,failedFiles}));
process.exitCode = failedFiles.length || failed ? 1 : 0;
