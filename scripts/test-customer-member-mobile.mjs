import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';
// SSR executes the actual list and aggregation without running database effects.
const Panel=createUiLoader({'@/lib/supabase':{supabase:{}}})('components/admin-live/AdminLiveCustomersPanel.tsx').default;
const html=renderToStaticMarkup(React.createElement(Panel,{embedded:true,orders:[{
  id:1,nickname:'검증고객',name:'가상고객',phone:'01000000000',
  totalAmount:119000,paymentStatus:'paid',created_at:'2026-10-10T00:00:00Z',
}]}));
const mobileStart=html.indexOf('data-member-cards');
assert.ok(mobileStart>=0,'mobile member list exists');
const mobile=html.slice(mobileStart);
assert.ok(mobile.includes('검증고객'));
// Regression: the complete financial/contact summary used to share a clipped line.
assert.doesNotMatch(mobile,/<div class="[^"]*truncate[^"]*">[^<]*누적 결제/,'mobile payment/contact summary must not be ellipsized');
for(const label of ['연락처','마지막 주문','누적 결제','주문 수']) assert.ok(mobile.includes(label),label+' remains identifiable');
assert.ok(mobile.includes('…'),'pending full-history stats are never mislabeled as 119,000 won');
assert.ok(mobile.includes('010-0000-0000'));
assert.ok(mobile.includes('role="button"'),'member mobile card remains actionable');
const blocked=renderToStaticMarkup(React.createElement(Panel,{embedded:true,orders:[{id:2,nickname:'차단검증',name:'가상고객',phone:'01022223333',totalAmount:39000,paymentStatus:'paid',created_at:'2026-10-10T00:00:00Z',is_blocked:true}]}));
assert.ok(blocked.includes('차단검증')&&blocked.includes('차단'),'blocked member status remains visible');
console.log('PASS real member list renders labeled mobile payment and contact information without one-line truncation');
