import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Character,survivalCharacter}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
const assigned=seed=>Array.from({length:77},(_,i)=>survivalCharacter(i,seed).name);
const a=assigned(42),b=assigned(98765);
assert.notDeepEqual(a.slice(0,35),b.slice(0,35),'event seed must shuffle known cast');
assert.deepEqual(a,assigned(42),'reconnect must preserve assignment');
assert.equal(new Set(a).size,77);
assert(a.slice(0,35).every(n=>!n.startsWith('창작 ')));
assert(a.slice(35).every(n=>n.startsWith('창작 ')));
const firstNames=new Set(Array.from({length:200},(_,seed)=>assigned(seed)[0]));
assert(firstNames.has('한교동'));assert(firstNames.has('꺼먹살이'));
for(let i=0;i<1000;i++){
 assert.equal(survivalCharacter(i,42).name,a[i%77]);
 const small=Character({index:i,total:2,castSeed:42}).props.children.props;
 const large=Character({index:i,total:1000,castSeed:42,moving:true,pose:'run',elapsedMs:80}).props.children.props;
 assert.equal(small['aria-label'],large['aria-label']);
}
console.log('PASS event-seeded known-cast shuffle, creative fallback, reconnect, survivor identity and overflow');
