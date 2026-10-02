// Catches replacing the specifically requested people/casts with generic animals.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {survivalCharacter,SURVIVAL_CHARACTER_COUNT,survivalCharacterSize}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
assert.equal(typeof survivalCharacterSize,'function','alive-count sizing must be shared by actor and reaction');
assert.equal(survivalCharacterSize(12),'clamp(44px,18cqw,120px)','remaining small cast gets a visibly larger body');
assert.notEqual(survivalCharacterSize(12),survivalCharacterSize(100));
const cast=Array.from({length:SURVIVAL_CHARACTER_COUNT},(_,i)=>survivalCharacter(i));
const Character=createUiLoader()('components/event-shared/SurvivalCharacter.tsx').default;
for(let index=0;index<16;index++){
 const running=Character({index,total:16,moving:true,pose:'run'}).props.children;
 assert(running.props.style.backgroundImage.includes('survival-known-run-v1.png'),'requested cast needs the running pose');
 assert.equal(running.props.style.animation,'none','movement is a real path, not stationary bouncing');
 assert.equal(running.props['aria-label'],cast[index].name,'run pose must preserve character identity');
}
assert(existsSync('public/event-art/survival-known-run-v1.png'));
for(const name of ['짱구','철수','유리','훈이','맹구','봉미선','신형만','짱아','흰둥이','키티','둘리','또치','희동이','고길동','도우너','마이콜'])assert(cast.some(c=>c.name===name),'requested character missing: '+name);
assert.deepEqual(cast.slice(0,16).map(c=>c.name),['짱구','키티','둘리','흰둥이','철수','유리','훈이','맹구','봉미선','신형만','짱아','또치','희동이','고길동','도우너','마이콜']);
assert(new Set(cast.map(c=>c.name)).size>=100,'100 distinct named characters required');
for(const c of cast){assert(existsSync('public'+c.asset),'missing asset '+c.asset);assert.deepEqual(survivalCharacter(c.index),c,'reload must not change the assigned character');}
for(const id of [-1,NaN,Infinity,100000])assert(survivalCharacter(id).asset);
console.log('PASS requested cast present, 100+ identities, assets exist, stable assignment, invalid indices');
const Disaster=createUiLoader()('components/event-shared/SurvivalDisaster.tsx').default;
const serialize=node=>node==null||typeof node!=='object'?node:Array.isArray(node)?node.map(serialize):{type:node.type,props:{...node.props,children:serialize(node.props.children)}};
for(const type of ['lightning','wave','wind','hail','meteor']){
 const fx={type,key:1000,accent:'#fff',streaks:Array.from({length:100},(_,id)=>({id,pts:'0,0 50,50',br:['10,10 20,20']}))};
 const tree=serialize(Disaster({fx}));assert.deepEqual(tree,serialize(Disaster({fx})),'visual replay must be deterministic');
 assert.equal(tree.props.style.pointerEvents,'none','effects cannot block controls');
 const count=(n,t)=>Array.isArray(n)?n.reduce((s,c)=>s+count(c,t),0):n&&typeof n==='object'?(n.type===t?1:0)+count(n.props.children,t):0;
 assert(count(tree,'polyline')<=96,'bounded bolt layers');assert(count(tree,'i')<=36,'bounded particles');
}
console.log('PASS all five deterministic disaster layers, bounded particles, nonblocking overlays');
const Reaction=createUiLoader()('components/event-shared/SurvivalReaction.tsx').default;
const animations=new Set();
for(const type of ['lightning','wave','wind','hail','meteor']){
 const tree=serialize(Reaction({type,index:0,total:100,x:50,y:50}));
 assert.equal(tree.props['data-survival-reaction'],type);
 assert.equal(tree.props.style.pointerEvents,'none');
 const body=[tree.props.children].flat().find(c=>c?.type==='div');
 animations.add(body.props.style.animation);
 assert(body.props.children.some(c=>typeof c?.type==='function'&&c.props.index===0),'reaction must retain the assigned character');
}
assert.equal(animations.size,5,'each disaster needs its own body response');
assert(cast.slice(31).every(c=>c.asset.includes('survival-human-cast')),'additional cast must be human characters');
console.log('PASS five distinct character reactions, 100-person sizing, nonblocking controls, original human cast');
