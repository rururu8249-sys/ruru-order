// [2026-10-25] 숫자 띠 — 옮겨 온 주문 금액은 합계에 포함되고 괄호로 따로 보인다
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createUiLoader } from './admin-ui-test-loader.mjs';
const { default: Stats } = createUiLoader({ '@/lib/adminToast': { showAdminToast() {} } })('components/admin-live/LiveStatsCards.tsx');
const o = (id, totalAmount, paymentStatus = 'auto_paid', paymentMethod = '무통장입금') => ({ id, totalAmount, paymentStatus, paymentMethod, items: [], productAmount: totalAmount });
const orders = [o('A', 45360), o('B', 38000), o('C', 20000, 'unpaid')];
const html = renderToStaticMarkup(React.createElement(Stats, { orders, movedInIds: new Set(['A', 'C']) }));
const text = html.replace(/<[^>]+>/g, '');
assert.match(text, /실제 받은 돈\(결제완료만 · 현재 조회범위\) 83,360원\(옮겨 온 주문 45,360원 포함\)/, '받은 돈 합계는 그대로 + 옮겨 온 금액 괄호');
assert.match(text, /미결제 합계 20,000원\(옮겨 온 주문 20,000원 포함\)/);
const none = renderToStaticMarkup(React.createElement(Stats, { orders })).replace(/<[^>]+>/g, '');
assert.doesNotMatch(none, /옮겨 온 주문/, '옮겨 온 주문 없으면 괄호 없음');
console.log('test-stats-moved-in: ok');
