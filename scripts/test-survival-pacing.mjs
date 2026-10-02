import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader(),p=load('lib/eventPlayback.ts'),s=load('lib/eventSurvivalScene.ts');
for(const n of [2,3,5,16,30,100,200]){
 const names=Array.from({length:n},(_,i)=>'P'+i),winners=['P0'];
 const duration=p.calculateEventDurationMs('survival',names,winners,42);
 assert(duration>=30000,'minimum suspense time is 30 seconds');
 const input={id:'x',kind:'survival',status:'result',startedAt:'2030-01-01',durationMs:duration,participants:names,winners};
 const scene=s.buildSurvivalScene(input,42);
 assert(scene.rounds[0].at>=5000,'opening needs anticipation');
 assert.equal(scene.durationMs,duration);
 assert.equal(s.sampleSurvivalScene(scene,duration-1).phase,'running');
 assert.deepEqual(s.sampleSurvivalScene(scene,duration).winners.map(x=>x.name),winners);
 const legacy=p.survivalPace(n-1,true).durationMs;
 const old={...input,durationMs:legacy};
 assert.equal(p.makePlayback(old).durationMs,legacy,'historical timeline remains playable');
 assert.equal(s.buildSurvivalScene(old,42).durationMs,legacy);
 for(const player of scene.players){assert(player.x>0&&player.x<100);assert(player.y>25&&player.y<88);}
}
console.log('PASS suspense minimum, opening, exact shared completion, unchanged winners');
