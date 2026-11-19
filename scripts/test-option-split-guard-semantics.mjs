import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ruru-option-guard-'));
const files=['liveAutomationDirector.ts','liveAutomationLines.ts','liveChatBot.ts'];
try {
  fs.mkdirSync(path.join(temp,'scripts'));
  fs.mkdirSync(path.join(temp,'lib'));
  fs.copyFileSync('scripts/guard-option-split.js',path.join(temp,'scripts/guard-option-split.js'));
  const originals=Object.fromEntries(files.map(file=>[file,fs.readFileSync(path.join('lib',file),'utf8')]));
  const run=overrides=>{
    for(const file of files)fs.writeFileSync(path.join(temp,'lib',file),overrides[file]??originals[file]);
    return spawnSync(process.execPath,[path.join(temp,'scripts/guard-option-split.js')],{encoding:'utf8'});
  };
  const valid=run({});
  assert.equal(valid.status,0,valid.stdout+valid.stderr);
  const cases=[
    ['nearby option split','liveAutomationLines.ts',originals['liveAutomationLines.ts'].replace('z=cleanOpt(r.size)',String.raw`z=String(r.size).split(/[\s/·,]+/)`)],
    ['another split on the same line','liveAutomationLines.ts',originals['liveAutomationLines.ts'].replace(String.raw`.split(/[\s/·,]+/)`,String.raw`.split(/[\s/·,]+/).concat(String(r.size).split(/[\s/·,]+/))`)],
    ['another split in the same chain','liveChatBot.ts',originals['liveChatBot.ts'].replace(String.raw`.split(/[\s,.!?~·/]+/)`,String.raw`.split(/[\s,.!?~·/]+/).concat(String(sizeOptions).split(/[\s,.!?~·/]+/))`)],
  ];
  for(const [name,file,source] of cases){
    assert.notEqual(source,originals[file],'fixture mutation applied: '+name);
    const result=run({[file]:source});
    assert.equal(result.status,1,name+' must remain a violation:\n'+result.stdout+result.stderr);
    assert.match(result.stderr,/코드 1건/,name);
  }
  console.log('PASS option guard: only the three reviewed text-tokenization expressions are exempt; nearby and same-line option splits still fail');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
