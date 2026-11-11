import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let Card;try {Card=createUiLoader()('components/admin-live/VoiceBudgetPanel.tsx').VoiceBudgetCard;}catch{}
assert.ok(Card,'budget panel must exist');
const base={budget:{cap_krw:40000,committed_krw:32000,stopped_at:'2026-11-11T09:00:00Z'},ready:true,state:'warning'};
const render=data=>renderToStaticMarkup(React.createElement(Card,{data,busy:false,error:'',onAction(){},onProducts(){}}));
assert.match(render(base),/한도가 얼마 남지 않았어요/);
assert.match(render({...base,state:'budget_stopped'}),/자동 상품 전환이 중단됐어요/);
assert.match(render({...base,state:'offline'}),/연결이 끊겼어요/);
const missing=render({budget:null,ready:false,state:'not_ready'});
assert.match(missing,/API·음성 서버 연결 전/);
assert.doesNotMatch(missing,/>작동 중</);
assert.match(render(base),/안전여유 포함/);
console.log('PASS real panel rendering: readiness, persistent budget/connection warning, cost semantics');
