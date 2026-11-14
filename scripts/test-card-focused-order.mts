import assert from 'node:assert/strict';
import {pickCardFocusedLines} from '../lib/autoTestOrder';
const C=(id:string,n:string)=>({productId:id,productName:n,color:'블랙',size:'M',unitPrice:1000,group:'normal' as never});
const card=[C('1','MC-1')],rot=[C('1','MC-1'),C('2','MC-2')];
for(let i=0;i<500;i++){const l=pickCardFocusedLines(card,rot);assert.equal(l[0].productName,'MC-1');assert.ok(l.length<=2);if(l[1])assert.equal(l[1].productName,'MC-2');}
assert.deepEqual(pickCardFocusedLines([],rot),[]);
assert.equal(pickCardFocusedLines(card,[]).length,1);
console.log('ok card-focused');
