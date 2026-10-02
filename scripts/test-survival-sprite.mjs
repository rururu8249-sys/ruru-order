import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const art=load('components/event-shared/SurvivalDisaster.tsx');
const tree=art.default({fx:{type:'wind',key:0,streaks:[]},ageMs:350});
function find(n){if(!n||typeof n!=='object')return null;if(n.props?.['data-disaster-sprite'])return n;for(const c of [n.props?.children].flat(Infinity)){const r=find(c);if(r)return r;}return null;}
assert(find(tree),'wind must use image sprite, not a cone SVG');
const api=load('components/event-shared/SurvivalDisasterSprite.tsx');
for(const [age,frame] of [[-1,0],[0,0],[99,0],[100,1],[350,3],[700,7],[850,7],[NaN,0]])assert.equal(api.default({kind:'tornado',ageMs:age}).props['data-sprite-frame'],frame);
console.log('PASS clock-selected disaster image frames');
