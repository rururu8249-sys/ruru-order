import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
import {readFileSync} from 'node:fs';
const T=createUiLoader()('lib/liveAutomationTiming.ts');
const expected={cart:[27,7.2197],bank:[48,69.2087],card:[21,66.4256]};
const sql=readFileSync('supabase/migrations/20261113121100_live_automation_measured_journey_timing.sql','utf8');
for(const [kind,[count,mean]] of Object.entries(expected)){
 const samples=T.JOURNEY_SECONDS[kind];assert.equal(samples.length,count);
 const delays=samples.map((_,i)=>T.journeyDelayMs(kind,()=>(i+.5)/count));
 assert.ok(Math.abs(delays.reduce((s,x)=>s+x,0)/count/60000-mean)<.001,'empirical sampling preserves arithmetic mean');
 assert.ok(delays.some(v=>v>30*60000),'retain late confirmations instead of truncating them');
 assert.equal(T.journeyDelayMs(kind,()=>0),Math.round(samples[0]*1000));
 assert.equal(T.journeyDelayMs(kind,()=>1),Math.round(samples.at(-1)*1000));
 const array=sql.match(new RegExp("when '"+kind+"' then samples:=array\\[([^\\]]+)\\]"))[1].split(',').map(Number);
 assert.deepEqual(array,Array.from(samples),'server and planning use the same calibration');
}
console.log('PASS measured cart/bank/card samples, exact empirical mean, retained long tails and SQL/TS agreement');
