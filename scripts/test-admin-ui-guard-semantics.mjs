import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruru-ui-guard-'));
try {
  fs.mkdirSync(path.join(temp, 'scripts'));
  fs.mkdirSync(path.join(temp, 'components/admin-live'), {recursive: true});
  for (const name of ['guard-admin-ui.js', 'admin-ui-guard-rules.cjs']) {
    if (fs.existsSync(`scripts/${name}`)) fs.copyFileSync(`scripts/${name}`, path.join(temp, 'scripts', name));
  }
  const run = source => {
    fs.writeFileSync(path.join(temp, 'components/admin-live/Fixture.tsx'), source);
    return spawnSync(process.execPath, [path.join(temp, 'scripts/guard-admin-ui.js')], {
      encoding: 'utf8', env: {...process.env, NODE_PATH: path.resolve('node_modules')},
    });
  };
  const valid = run(`export default function Fixture({selected}) { return <>
    <button className={\`hover:bg-surface-2 \${selected ? 'bg-surface-2' : ''}\`}>회원</button>
    <div className="bg-surface-2"><button className="hover:bg-surface-2">열기</button></div>
    <button className={['hover:bg-surface-2', selected ? 'bg-surface-2' : ''].join(' ')}>열기</button>
    <p className="text-center">해당하는 사람이 없어요. 다른 칩을 눌러 보세요.</p>
    <p className="text-center">기록이 없어요. 조건을 변경해 보세요.</p>
    <p className="text-center">기록이 없어요. 개발자에게 알려 주세요.</p>
  </>; }`);
  assert.equal(valid.status, 0, 'state-specific background, separate elements and a real short next step are valid:\n' + valid.stdout + valid.stderr);
  const invalid = run(`export default function Fixture() { return <>
    <button className="bg-surface-2 hover:bg-surface-2">회원</button>
    <button className={\`bg-surface hover:bg-surface \${sizeClass}\`}>회원</button>
    <button className={on ? 'bg-surface hover:bg-surface' : 'bg-ink hover:bg-ink'}>회원</button>
    <button className={['bg-surface hover:bg-surface', sizeClass].join(' ')}>회원</button>
    <button className={['bg-surface', 'hover:bg-surface'].filter(Boolean).join(' ')}>회원</button>
    <button className={on ? 'bg-surface hover:bg-surface' : 'opacity-50'}>회원</button>
    <p className="text-center">기록이 없습니다.</p>
    <p className="text-center">기록이 없어요. 등록일순.</p>
    <p className="text-[15px]">제목</p>
  </>; }`);
  assert.equal(invalid.status, 1, 'real violations still fail the whole guard');
  for (const rule of ['hover', '안내 없음', '글씨 크기']) assert.ok((invalid.stdout + invalid.stderr).includes(rule), rule);
  assert.match(invalid.stderr, /hover \(배경과 같은 색\)】 6건/);
  assert.match(invalid.stderr, /안내 없음】 2건/);
  console.log('PASS UI guard: semantic false positives removed; dead hover, missing next step and invalid font still rejected');
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
