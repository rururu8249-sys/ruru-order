import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const art=load('components/event-shared/SurvivalDisaster.tsx');
const tree=art.default({fx:{type:'wind',key:0,streaks:[]},ageMs:350});
function find(n){if(!n||typeof n!=='object')return null;if(n.props?.['data-disaster-sprite'])return n;for(const c of [n.props?.children].flat(Infinity)){const r=find(c);if(r)return r;}return null;}
assert(find(tree),'wind must use image sprite, not a cone SVG');
const api=load('components/event-shared/SurvivalDisasterSprite.tsx');
for(const [age,frame] of [[-1,0],[0,0],[99,0],[100,1],[350,3],[700,7],[850,7],[NaN,0]])assert.equal(api.default({kind:'tornado',ageMs:age}).props['data-sprite-frame'],frame);
for(const [age,from,to,mix] of [[0,0,1,0],[240,1,2,.5],[1120,7,7,0],[1280,6,7,0],[2240,0,1,0]]){
 const props=api.default({kind:'tsunami',ageMs:age}).props;
 assert.equal(props['data-sprite-frame'],from,'wave diagnostics must describe the actually rendered source frame');
 assert.equal(props['data-sprite-next-frame'],to);
 assert.equal(props['data-sprite-blend'],mix);
}
console.log('PASS clock-selected disaster image frames');
