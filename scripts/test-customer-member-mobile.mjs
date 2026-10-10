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
const mobile=html.slice(html.indexOf('mt-3 flex flex-col gap-1.5 xl:hidden'));
assert.ok(mobile.includes('검증고객'));
// Regression: the complete financial/contact summary used to share a clipped line.
assert.doesNotMatch(mobile,/<div class="[^"]*truncate[^"]*">[^<]*누적 결제/,'mobile payment/contact summary must not be ellipsized');
for(const label of ['연락처','마지막 주문','누적 결제','주문 수']) assert.ok(mobile.includes(label),label+' remains identifiable');
assert.ok(mobile.includes('119,000원'));
assert.ok(mobile.includes('010-0000-0000'));
assert.ok(mobile.includes('차단'));
assert.ok(mobile.includes('상세'));
console.log('PASS real member list renders labeled mobile payment and contact information without one-line truncation');
