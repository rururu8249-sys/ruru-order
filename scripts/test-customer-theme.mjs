import assert from 'node:assert/strict';
import { parseCustomerTheme, resolveCustomerThemeAttr } from '../lib/customerTheme.ts';
assert.equal(parseCustomerTheme(null), 'basic');
assert.equal(parseCustomerTheme(' winter '), 'winter');
assert.equal(parseCustomerTheme('xx'), 'basic');
// 직접 고른 적 없는 손님 = 설정 따라감
assert.equal(resolveCustomerThemeAttr('basic', false, true, false), 'b');
assert.equal(resolveCustomerThemeAttr('winter', false, true, false), 'winter');
// ?preview 로 직접 고른 브라우저는 그 값
assert.equal(resolveCustomerThemeAttr('basic', true, false, true), 'winter');
assert.equal(resolveCustomerThemeAttr('winter', true, true, false), 'b');
assert.equal(resolveCustomerThemeAttr('winter', true, false, false), '');
console.log('customer theme passed');
