import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'voice-build-test-'));
try {
  // Replace only subprocess boundaries: running the real preview wrapper must
  // never invoke even this harmless Python stub from production/other branches.
  writeFileSync(join(dir,'python3.13'), '#!/bin/sh\nif [ "$1" = "-c" ]; then exit 0; fi\nprintf \'VOICE_SOURCE_PROBE {"status":"stub"}\\n\'\n', {mode:0o700});
  writeFileSync(join(dir,'npm'), '#!/bin/sh\nprintf \'BUILD_RAN\\n\'\nexit 0\n', {mode:0o700});
  for(const [env,branch,expected] of [
    ['production','codex/voice-source-check',false],
    ['preview','main',false],
    ['preview','codex/voice-source-check',true],
    ['development','codex/voice-source-check',false],
  ]) {
    const result=spawnSync(process.execPath,[resolve('scripts/voice-preview-build.mjs')],{
      env:{PATH:dir,VERCEL_ENV:env,VERCEL_GIT_COMMIT_REF:branch},encoding:'utf8',timeout:5000,
    });
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.includes('VOICE_SOURCE_PROBE'),expected,`${env}/${branch}`);
    assert.ok(result.stdout.includes('BUILD_RAN'));
  }
  console.log('PASS: preview-only probe gating; normal build preserved (4 scenarios)');
} finally { rmSync(dir,{recursive:true,force:true}); }
