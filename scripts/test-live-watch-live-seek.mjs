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
  playerInfo, youtubeCommand, liveResume: {onAction(){}}, introPlayer: {cancel(){}}, props: {},
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

// Reproduce the reported -0:19 case through the real telemetry listener.
let listener;
function findListener(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'onMsg') listener = node.initializer;
  ts.forEachChild(node, findListener);
}
findListener(ast);
assert.ok(listener);
let behind = false;
const liveModule = createUiLoader()('lib/liveWatch.ts');
const onMsg = vm.runInNewContext(ts.transpile(`const handle = ${listener.getText(ast)}; handle;`, {target: ts.ScriptTarget.ES2022}), {
  iframeRef: {current: null}, liveResume: {onInfo(){}},
  playerInfo, lastTick: {current: {}}, pausedRef: {current: false},
  ccOffAt: {current: Date.now()}, captionsOff() {},
  LIVE_EDGE_TOLERANCE_SECONDS: liveModule.LIVE_EDGE_TOLERANCE_SECONDS,
  setBehindLive: update => { behind = update(behind); },
});
function telemetry(t, d, live = true, state = 1) {
  playerInfo.current = {t: 0, d: 0, live: false, state: -1, d0: 0, d0at: 0, seekableEnd: null, atLiveHead: null};
  onMsg({origin: 'https://www.youtube.com', data: {event: 'infoDelivery', info: {
    currentTime: t, duration: d, playerState: state, videoData: {isLive: live},
  }}});
  return behind;
}
assert.equal(telemetry(1189, 1208), true, '19 seconds behind must show the live-return button');
assert.equal(telemetry(1189, 1204), true, '15-second boundary must show the button');
assert.equal(telemetry(1189, 1203.9), false, 'Within live tolerance hides the button');
assert.equal(telemetry(0, 1208), true, 'Rewinding to the very beginning must allow return');
assert.equal(telemetry(1189, 1208, false), false, 'Recorded video must not show live return');
assert.equal(telemetry(1189, 1208, true, 0), false, 'Ended playback must not show live return');
console.log('PASS live-return visibility at 19s/15s/14.9s, timeline start, recorded video and ended state');

// Captured from the real live iframe: metadata duration 5767s, playable edge 2170s.
telemetry(2170, 5767);
onMsg({origin: 'https://www.youtube.com', data: {event: 'infoDelivery', info: {
  progressState: {seekableEnd: 2170, isAtLiveHead: true},
}}});
assert.equal(behind, false, 'Real live-head confirmation must override inflated metadata duration');
onMsg({origin: 'https://www.youtube.com', data: {event: 'infoDelivery', info: {
  currentTime: 2165, progressState: {seekableEnd: 2172, isAtLiveHead: false},
}}});
assert.equal(behind, true, '7s behind is still DVR when YouTube says it is not live');
calls.length = 0;
jump();
assert.equal(calls[0].args[0], 2172, 'Seek exact playable edge, not metadata duration or edge minus one');
onMsg({origin: 'https://www.youtube.com', data: {event: 'infoDelivery', info: {duration: 5770}}});
calls.length = 0;
jump();
assert.equal(calls[0].args[0], 2172, 'Duration-only update must not overwrite the playable edge');
onMsg({origin: 'https://www.youtube.com', data: {event: 'infoDelivery', info: {playerState: 2}}});
assert.equal(behind, true, 'Paused DVR must keep its return button');
onMsg({origin: 'https://www.youtube.com', data: {event: 'infoDelivery', info: {
  currentTime: 2174, playerState: 1, progressState: {seekableEnd: 2174, isAtLiveHead: true},
}}});
assert.equal(behind, false, 'Only real live-head confirmation clears the button');
console.log('PASS captured live telemetry: inflated/stale duration, exact edge, 7s DVR, paused return and real arrival');
