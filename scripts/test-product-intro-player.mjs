import assert from 'node:assert/strict';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const realNow = Date.now;
let now = 1800000000000, id = 0, current;
Date.now = () => now;
const listeners = new Set(), timers = new Map(), intervals = new Map(), commands = [];
globalThis.window = {
  addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
  setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key),
  setInterval: fn => { intervals.set(++id, fn); return id; }, clearInterval: key => intervals.delete(key),
};
const videoId = 'abcdefghijk';
const frame = {current: {contentWindow: {postMessage: data => commands.push(JSON.parse(data))}}};
const {useProductIntroPlayer} = createUiLoader()('lib/useProductIntroPlayer.ts');
const action = () => {};
function Probe({request = null, playerKey = 0}) {
  current = useProductIntroPlayer(frame, videoId, playerKey, request, action);
  return null;
}
async function info(packet, origin = 'https://www.youtube.com', source = frame.current.contentWindow) {
  await act(async () => { for (const fn of listeners) fn({origin, source, data: JSON.stringify({event: 'infoDelivery', info: packet})}); });
}
let tree;
try {
  await act(async () => { tree = Renderer.create(React.createElement(Probe)); });
  await info({currentTime: 240, duration: 1000, playerState: 2, videoData: {video_id: videoId, isLive: false}});
  now += 60000;
  const saved = await current.capture();
  assert.equal(saved.seconds, 235, 'paused recording uses duration when seekable range is absent');
  await info({currentTime: 800}, 'https://untrusted.example');
  await info({currentTime: 800}, 'https://www.youtube.com', {});
  await info({currentTime: 800, videoData: {video_id: '12345678901'}});
  assert.equal((await current.capture()).seconds, 235, 'foreign source/video cannot replace the position');
  await info({currentTime: 500, playerState: 2});
  assert.equal((await current.capture()).seconds, 495, 'seek while paused changes the captured position');
  const request = {...saved, key: 1, name: 'product', recordedAt: new Date(now).toISOString()};
  await act(async () => tree.update(React.createElement(Probe, {request})));
  assert(commands.some(c => c.func === 'seekTo' && c.args[0] === 235), 'paused player starts replay without periodic packets');
  assert.equal(current.status, 'loading', 'command alone is not confirmed arrival');
  await info({currentTime: 235, playerState: 1});
  assert.equal(current.status, 'playing');
  now += 6000;
  const refreshed = current.capture();
  assert.equal(timers.size, 1, 'stale playing sample waits for fresh telemetry');
  await info({currentTime: 600, playerState: 1});
  assert.equal((await refreshed).seconds, 595);
  assert.equal(timers.size, 0);
  now += 6000;
  const unavailable = current.capture();
  for (const fn of [...timers.values()]) fn();
  assert.equal(await unavailable, null, 'no fabricated time on timeout');
  const canceled = current.capture();
  await act(async () => tree.update(React.createElement(Probe, {playerKey: 1})));
  assert.equal(await canceled, null, 'player replacement cancels pending capture');
  const reset = current.capture();
  for (const fn of [...timers.values()]) fn();
  assert.equal(await reset, null, 'replacement does not reuse old video position');
  await act(async () => tree.unmount());
  assert.equal(timers.size + intervals.size + listeners.size, 0);
  console.log('PASS paused VOD/duration fallback, paused seek, trusted player, replay arrival, stale refresh, timeout and cleanup');
} finally { Date.now = realNow; }
