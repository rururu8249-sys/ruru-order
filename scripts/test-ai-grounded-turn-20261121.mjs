import assert from 'node:assert/strict';
import {run} from './test-ai-product-director-20261120.mjs';
const now=Date.parse('2026-11-21T06:16:00Z');
const visible=[{id:6054,body:'버땡507 블랙은 디자인이 깔끔해서 데일리로 입기 좋겠어요',automation_actor_id:'other',created_at:new Date(now-7*60000).toISOString()},{id:6052,body:'CP-1 올리브는 사이즈가 다양해서 고르기 편하겠네요',automation_actor_id:'another',created_at:new Date(now-10*60000).toISOString()}];
const card={productId:'823',name:'CP-1 올리브',detailName:'',colors:[],sizes:['S','M']};
const ordered={productId:'822',name:'HR-7 블랙',detailName:'HR-7 블랙',colors:[],sizes:['38','40','42','44']};
for(const mode of ['live','paused','replay']){
 const args={mode,clockNow:now,visible,hidden:visible,cardOverride:card,orderedCards:[ordered]};
 assert.equal((await run({...args,text:'HR-7 블랙은 기장감이 어느 정도인지 궁금하네요.'})).sent.length,1,'verified new product AND interest can follow old independent messages: '+mode);
 assert.equal((await run({...args,text:'HR-7 블랙은 디자인이 깔끔하네요.'})).sent.length,0,'changing only the product cannot repeat the same interest');
 assert.equal((await run({...args,text:'HR-7 블랙은 기장감이 어느 정도인지 궁금하네요.',visible:[{...visible[0],created_at:new Date(now-30000).toISOString()},visible[1]]})).sent.length,0,'new grounded topic cannot bypass resting gap');
 assert.equal((await run({...args,text:'HR-7 블랙은 기장감이 어느 정도인지 궁금하네요.',orderedRemoved:true})).sent.length,0,'source must remain valid at send');
}
console.log('PASS production third-turn regression: verified distinct product/interest, slider-aware minimum gaps and catalog recheck');
