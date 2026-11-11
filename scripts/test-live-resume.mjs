import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {createLiveResume}=createUiLoader()('lib/liveResume.ts');
let now,calls,blocked,player;
function reset(){now=1000;calls=[];blocked=false;player=createLiveResume({now:()=>now,send:(func,args)=>calls.push({func,args}),listen:()=>calls.push({func:'listen'}),onBlocked:v=>blocked=v});}
const info=(t,end,head=true,state=1,live=true)=>player.info({currentTime:t,playerState:state,videoData:{isLive:live},progressState:{seekableEnd:end,isAtLiveHead:head}});
reset();info(100,100);player.leave();now+=60000;info(100,160,false,2);player.return();assert.deepEqual(calls,[{func:'listen'},{func:'playVideo',args:[]}],'return requests telemetry, never stale seek');info(100,162,false,2);assert.deepEqual(calls.slice(2),[{func:'seekTo',args:[162,true]},{func:'playVideo',args:[]}]);info(162,162,true);now+=3000;info(163,163,true);assert.equal(calls.length,4);assert.equal(blocked,false);
reset();info(100,100);player.action('seekTo',[70,true]);player.leave();now+=60000;player.return();info(70,160,false);assert.equal(calls.length,0,'manual seek before telemetry is preserved');
reset();info(100,100);player.action('pauseVideo');player.leave();now+=60000;player.return();info(100,160,false,2);assert.equal(calls.length,0,'explicit pause retained');
reset();info(100,100);info(100,100,true,2);player.leave();now+=60000;player.return();info(100,160,false,2);assert.equal(calls.filter(c=>c.func==='seekTo').length,1,'browser pause arriving before visibility does not erase live intent');
reset();info(70,100,false);player.leave();now+=60000;player.return();assert.equal(calls.length,0,'already watching history stays there');
reset();info(100,100,true,1,false);player.leave();now+=60000;player.return();assert.equal(calls.length,0,'VOD never autoseeks');
reset();info(100,100);player.leave();now+=60000;player.return();player.return();player.info({duration:9999});assert.equal(calls.length,2,'duplicate return and stale duration cannot seek');info(100,100,true);assert.equal(calls.length,2,'old live-head packet after a long absence cannot confirm arrival');info(100,165,false);assert.equal(calls[2].args[0],165);
player.action('seekTo',[50,true]);now+=2000;info(50,166,false);assert.equal(calls.length,4,'user interaction cancels pending recovery');
reset();info(100,100);player.leave();now+=60000;player.return();for(let i=0;i<8;i++){now+=1500;info(100,160+i,false,2);player.tick();}now+=15000;player.tick();assert.equal(calls.filter(c=>c.func==='seekTo').length,3);assert.equal(blocked,true,'blocked autoplay becomes a manual fallback');
player.action('live');info(180,180,true,1);assert.equal(blocked,false,'manual success clears fallback');
reset();info(100,100);player.leave();now+=60000;player.return();info(100,160,false,0);assert.equal(calls.length,2,'ended event cancels recovery');
reset();info(100,100);player.leave();now+=60000;player.return();player.dispose();info(100,160,false);assert.equal(calls.length,2,'disposed controller cannot send');


reset();info(100,100);player.leave();now+=60000;player.return();player.info({currentTime:100,playerState:1,progressState:{seekableEnd:160}});assert.equal(calls.filter(c=>c.func==='seekTo').length,1,'partial fresh edge cannot reuse old head flag');
reset();info(100,100);player.action('seekTo',[30,true]);now+=3000;player.info({currentTime:31,playerState:1});player.leave();now+=60000;player.return();info(31,164,false);assert.equal(calls.length,0,'partial telemetry cannot erase manual rewind');
reset();info(100,100);player.action('seekTo',[90,true]);now+=3000;player.info({currentTime:91,playerState:1,progressState:{seekableEnd:103}});player.leave();now+=60000;player.return();assert.equal(calls.length,0,'short deliberate rewind remains manual without head confirmation');

reset();info(100,100);player.leave();now+=60000;info(100,160,false,0);player.return();assert.equal(calls.length,0,'stream ending while hidden must not restart');
reset();info(100,100);player.leave();now+=60000;info(100,160,false,2,false);player.return();assert.equal(calls.length,0,'non-live update while hidden must not restart');
console.log('PASS live resume: fresh edge, hidden telemetry, manual rewind/pause/VOD, stale packets, duplicate lifecycle, bounded retry, cancellation, fallback and cleanup');
