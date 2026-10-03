import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Reaction}=createUiLoader()('components/event-shared/SurvivalReaction.tsx');
const walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
for(const type of ['lightning','wave','wind','hail','meteor']){
 const tree=Reaction({type,index:9,total:100,x:43,y:61,ageMs:80});
 const contact=walk(tree).find(n=>n.props?.['data-hazard-contact']===type);
 assert(contact,'victim must show a distinct physical '+type+' contact, not just zoom');
 assert.equal(tree.props.style.left,'43%');assert.equal(tree.props.style.top,'61%');
 assert(Number(contact.props.style.opacity)>0);
 assert.equal(walk(Reaction({type,index:9,total:100,x:43,y:61,ageMs:900})).find(n=>n.props?.['data-hazard-contact']===type).props.style.opacity,0);
}
console.log('PASS five victim-local physical contacts and completed fade');
for(const type of ['lightning','wave','wind','hail','meteor']){
 assert(!walk(Reaction({type,index:9,total:100,x:43,y:61,ageMs:300})).some(n=>typeof n.props?.['data-survival-character']==='number'),'eliminated '+type+' effect cannot add a character beyond the remaining-person count');
}
const waveContact=walk(Reaction({type:'wave',index:9,total:100,x:43,y:61,ageMs:100})).find(n=>n.props?.['data-hazard-contact']==='wave');
assert(!walk(waveContact).some(n=>n.type==='path'&&n.props.fill==='#1683ba'),'local water contact must not paste opaque clipped wave panels over the scene');
