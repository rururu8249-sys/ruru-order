// Catch a small roster using secondary cast instead of the requested lead characters,
// and a reordered identity accidentally picking the wrong running sprite cell.
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Character,survivalCharacter,SURVIVAL_CHARACTER_COUNT}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
const leads=['짱구','키티','둘리','흰둥이','철수','유리'];
for(const total of [1,2,3,4,5,6]){
 const shown=Array.from({length:total},(_,index)=>Character({index,total}).props.children.props['aria-label']);
 assert.deepEqual(shown,leads.slice(0,total),'small roster must begin with the requested lead cast');
}
for(const [index,cell] of [[0,0],[1,9],[2,10],[3,8],[4,1],[5,2]]){
 const avatar=survivalCharacter(index);
 const rest=Character({index,total:6}).props.children;
 const run=Character({index,total:6,moving:true,pose:'run'}).props.children;
 assert.equal(run.props['aria-label'],rest.props['aria-label'],'running cannot replace identity');
 assert.equal(avatar.runCell,cell,'priority mapping must retain the source atlas cell');
 assert.equal(run.props.style.backgroundPosition,`${cell%4*100/3}% ${[0,332,675,960][Math.floor(cell/4)]*100/(1275-([332,675,960,1275][Math.floor(cell/4)]-[0,332,675,960][Math.floor(cell/4)]))}%`);
}
const cast=Array.from({length:SURVIVAL_CHARACTER_COUNT},(_,i)=>survivalCharacter(i));
assert.equal(new Set(cast.map(c=>c.name)).size,105,'priority must not duplicate or drop a cast identity');
for(let index=0;index<100;index++){
 const small=Character({index,total:6}).props.children;
 const large=Character({index,total:100}).props.children;
 assert.equal(small.props['aria-label'],large.props['aria-label'],'shrinking the survivor count cannot reassign identity');
 assert.deepEqual(survivalCharacter(index),cast[index],'reload remains stable');
}
console.log('PASS small-roster lead priority, matching run cells, 105 unique identities, no mid-event reassignment');
