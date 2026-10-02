import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const load=createUiLoader();
const Result=load('components/event-shared/SurvivalWinnerLineup.tsx').default;
for(const count of [1,2,3,5,6,10,20,50,100,200]){
 const winners=Array.from({length:count},(_,i)=>({id:i*2,name:i===0?'긴닉네임'.repeat(8):'당첨자'+i}));
 for(const gift of ['포인트 1,000원','머리끈 이벤트','']){
  let tree;await act(async()=>{tree=Renderer.create(React.createElement(Result,{winners,castSeed:42,gift}));});
  const rows=tree.root.findAll(n=>n.props['data-winner-row']!==undefined);
  assert.equal(rows.length,Math.ceil(count/5));
  const slots=tree.root.findAll(n=>n.props['data-winner-slot']!==undefined);
  assert.deepEqual(slots.map(n=>n.props['data-winner-slot']),winners.map(w=>w.id));
  assert(slots.every(n=>n.props.style.minWidth===0),'long names must not force overlap');
  if(count<=3)assert(slots.every(n=>n.findAllByType('span').some(s=>s.props.style.fontSize==='clamp(22px,5cqw,40px)')),'small winner groups need phone-readable large labels');
  assert.equal(tree.root.findAll(n=>typeof n.props['data-survival-character']==='number').length,count);
  const prizes=tree.root.findAll(n=>n.props['data-winner-gift']!==undefined);
  assert.equal(prizes.length,gift?1:0);
  if(gift)assert.equal(prizes[0].children.join(''),gift);
  await act(async()=>tree.unmount());
 }
}
console.log('PASS winner lineups 1–200; 3 in one row, 10 in two; saved gifts and long names');
