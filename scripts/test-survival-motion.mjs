import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader(),s=load('lib/eventSurvivalScene.ts');
const input={id:'motion',kind:'survival',status:'result',startedAt:'2030-01-01',durationMs:80000,participants:Array.from({length:100},(_,i)=>'P'+i),winners:['P0']};
const scene=s.buildSurvivalScene(input,42),impact=scene.rounds[0].at;
const first=s.sampleSurvivalScene(scene,1000),second=s.sampleSurvivalScene(scene,2500);
assert(first.players.some((p,i)=>Math.abs(p.x-second.players[i].x)>7&&Math.abs(p.y-second.players[i].y)>3),'visible diagonal movement, not tiny stationary rocking');
const warning=s.sampleSurvivalScene(scene,impact-500);
assert.equal(warning.beat,'warning','hazard warning must precede impact');
assert.equal(warning.message?.dead.length||0,0,'warning must not expose elimination names');
assert(warning.players.some((p,i)=>p.x!==scene.players[i].x||p.y!==scene.players[i].y),'characters must move before impact');
assert(warning.players.some(p=>p.pose==='run'),'warning triggers escape motion');
assert(warning.camera,'camera framing must be provided');
assert.equal(warning.camera.scale,1,'do not zoom onto predetermined victims before impact');
const impactFrame=s.sampleSurvivalScene(scene,impact+200);
assert(impactFrame.camera.scale>1,'dense cast needs a close-up after the hazard strikes');
for(const id of scene.rounds[0].victims){
 const actor=impactFrame.players[id];
 assert(actor.x>=impactFrame.camera.left&&actor.x<=impactFrame.camera.right,'close-up cannot crop an affected actor');
 assert(actor.y>=impactFrame.camera.top&&actor.y<=impactFrame.camera.bottom,'close-up cannot crop an affected actor');
}
for(let t=0;t<=scene.durationMs;t+=83){
 const frame=s.sampleSurvivalScene(scene,t);
 for(const p of frame.players){assert(p.x>=3&&p.x<=97);assert(p.y>=24&&p.y<=90);}
 assert(frame.camera.left>=0&&frame.camera.right<=100&&frame.camera.top>=0&&frame.camera.bottom<=100,'camera stays in the stage');
 assert.deepEqual(frame,s.sampleSurvivalScene(scene,t),'separate screens share deterministic motion');
 if(t<scene.durationMs)assert.equal(frame.winners.length,0);
}
assert.deepEqual(s.sampleSurvivalScene(scene,scene.durationMs).winners.map(p=>p.name),['P0']);
console.log('PASS warning, escape motion, bounds, deterministic screens, no premature winner');
