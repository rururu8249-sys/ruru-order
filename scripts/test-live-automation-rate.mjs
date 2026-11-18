import assert from 'node:assert/strict';
import {legacyPercent,ratePercent,percentValid,chatRateConfig,admitTestOrderPercent} from '../lib/liveAutomationRate.ts';
assert.equal(legacyPercent('low'),20);
assert.equal(legacyPercent('normal'),50);
assert.equal(legacyPercent('high'),80);
for(let pct=0;pct<=100;pct++){
 assert.equal(ratePercent(String(pct),'low'),pct);
 assert.ok(percentValid(pct));
}
for(const invalid of [-1,101,1.2,'49',null,NaN,Infinity])assert.equal(percentValid(invalid),false);
assert.equal(ratePercent(null,'high'),80);
assert.equal(ratePercent('broken','normal'),50);
assert.equal(ratePercent('10000','normal'),50);
assert.equal(chatRateConfig(0).chance,0);
for(let p=2;p<=100;p++){
 const a=chatRateConfig(p-1),b=chatRateConfig(p);
 assert.ok(a.gapMin>=b.gapMin,`chat gap should shrink ${p}`);
 assert.ok(a.gapMax>=b.gapMax,`chat gap max should shrink ${p}`);
 assert.ok(a.chance<=b.chance,`chat chance should rise ${p}`);
}
assert.ok(!admitTestOrderPercent(0,'wave',0));
assert.ok(admitTestOrderPercent(100,'wave',0));
let prev=0;
const ids=Array.from({length:5000},(_,i)=>`wave${i}`);
for(const p of [1,20,35,50,80,99]){
 const admitted=ids.filter(id=>admitTestOrderPercent(p,id,0)).length;
 assert.ok(admitted>=prev,`order percentage ${p} cannot reduce admitted wave set`);
 prev=admitted;
 assert.ok(Math.abs(admitted/ids.length*100-p)<3,`order rate ${p} measured ${admitted}`);
}
assert.equal(admitTestOrderPercent(43,'wave-fixed',2),admitTestOrderPercent(43,'wave-fixed',2));
console.log('PASS percentage slider math, 101 points, 0/100 boundaries, monotone chat pace & deterministic test-order intensity');
