import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const{default:Disaster}=createUiLoader()('components/event-shared/SurvivalDisaster.tsx');
const walk=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(walk)];
for(const[ageMs,visible]of[[0,true],[80,true],[250,true],[350,true],[700,true],[820,false]]){
 const tree=Disaster({fx:{type:'lightning',key:2800,accent:'#fff',streaks:[{id:1,pts:'40,0 42,30 50,60',br:[]}]},ageMs});
 const bolt=walk(tree).find(n=>n.props?.['data-lightning-bolts']!==undefined);
 assert(bolt,'bolt must render at the strike');
 assert.equal(Number(bolt.props.style.opacity)>0,visible,'server impact age must control bolt visibility, independent of CSS mount');
}
console.log('PASS lightning visible at impact/reconnect and ends on server age');
