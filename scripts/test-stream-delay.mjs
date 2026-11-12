import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader({'./supabase':{supabase:{}},'./liveEvents':{subscribeLiveEvents:()=>()=>{}}});
const {streamDelayFromIngestion,ENCODER_EXTRA_MS}=load('lib/useLiveFeaturedProducts.ts');
const {rotationIndex}=load('lib/widgetRotationClock.ts');
const now=1794442691233;
// 실측(11/12 방송): 지금 − 장면 들어온 시각 ≈ 2.2초
assert.equal(streamDelayFromIngestion(1794442689.047046,now),Math.round(2186+ENCODER_EXTRA_MS));
assert.equal(streamDelayFromIngestion(undefined,now),null);
assert.equal(streamDelayFromIngestion(0,now),null);
assert.equal(streamDelayFromIngestion(now/1000-3600,now),0,'다시보기(한 시간 전 장면)는 늦춤 없음');
// 5초 순환: 영상이 3.2초 늦으면 카드도 영상 속 위젯과 같은 상품
const cfg={mode:'all',paused:false,targets:[],startedAt:now-11000};
assert.equal(rotationIndex(cfg,4,now),2,'지금 시각이면 3번째');
assert.equal(rotationIndex(cfg,4,now-3200),1,'영상 속 위젯(3.2초 전)은 2번째 — 카드도 그만큼 늦춤');
console.log('stream delay: ingestion→delay, replay 0, rotation offset OK');
