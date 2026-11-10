import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createUiLoader} from './admin-ui-test-loader.mjs';

// Execute the actual component handler against a player double. No live broadcast writes.
const source = fs.readFileSync('components/customer/LiveWatchView.tsx', 'utf8');
const ast = ts.createSourceFile('LiveWatchView.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'backToLive') handler = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler);
const playerInfo = {current: {t: 564, d: 3599, live: true, state: 1}};
const calls = [];
const {youtubeCommand} = createUiLoader()('lib/liveWatch.ts');
const jump = vm.runInNewContext(`(${handler.getText(ast)})`, {
  playerInfo, youtubeCommand,
  sendToPlayer: text => calls.push(JSON.parse(text)),
  lastTick: {current: {t: 564}},
  setBehindLive: () => calls.push('premature-live-label'),
  setMuted: () => calls.push('changed-sound'),
  setReloadKey: () => calls.push('reloaded-player'),
});
jump();
assert.deepEqual(calls, [
  {event: 'command', func: 'seekTo', args: [3598, true]},
  {event: 'command', func: 'playVideo', args: []},
], 'Live button must seek like dragging to the end, without reloading, muting or claiming success');
assert.equal(playerInfo.current.t, 564, 'Playback position must come from player confirmation');
calls.length = 0;
playerInfo.current.d = 3610;
jump();
assert.equal(calls[0].args[0], 3609, 'Use latest duration at click time');
for (const duration of [0, NaN, Infinity, -1]) {
  calls.length = 0;
  playerInfo.current.d = duration;
  jump();
  assert.equal(calls.length, 0, 'Ignore missing/invalid duration');
}
calls.length = 0;
playerInfo.current.d = 100;
playerInfo.current.live = false;
jump();
assert.equal(calls.length, 0, 'Do not jump recorded video to its end');
console.log('PASS live seek commands, latest duration, preserved sound/player, confirmed position and invalid/VOD guards');
