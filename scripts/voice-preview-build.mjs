// Temporary diagnostics branch only: never probes from production or other branches.
import {spawnSync} from 'node:child_process';
if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_COMMIT_REF === 'codex/voice-source-check') {
  const python = ['python3.13', 'python3.12', 'python3.11', 'python3'].find(bin => {
    const check = spawnSync(bin, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)'], {timeout: 2000});
    return check.status === 0;
  });
  const result = python ? spawnSync(python, ['scripts/voice-source-probe.py'], {
    timeout: 85000, encoding: 'utf8', maxBuffer: 65536,
    env: {PATH: process.env.PATH, LANG: 'C.UTF-8', VERCEL: '1'},
  }) : {};
  const report = result.stdout?.split('\n').find(line => line.startsWith('VOICE_SOURCE_PROBE '));
  console.log(report || 'VOICE_SOURCE_PROBE {"status":"launcher_failed","live_activation":false}');
}
const build = spawnSync('npm', ['run', 'build'], {stdio: 'inherit'});
process.exit(build.status ?? 1);
