#!/usr/bin/env node
// Code-level regression checks. These do not replace an authenticated browser/DB E2E test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path,'utf8');
const targets = {
  page: read('app/order/page.tsx'),
  submit: read('app/api/customer-orders/submit/route.ts'),
  clientApi: read('app/api/subscribe-verify/route.ts'),
  adminApi: read('app/api/admin-live/subscribe-verify/route.ts'),
  lib: read('lib/subscribeFreeShipServer.ts'),
  settings: read('components/admin-live/AdminLiveSettingsPanel.tsx'),
  log: read('components/admin-live/SubscribeFreeShipSettingsCard.tsx'),
  sql: read('supabase/migrations/20261122_subscribe_once_point_rate.sql')
};
const cases = [
  ['eligibility is NOT the same as approved screenshot', targets.page.includes('subscribeAvailable') && targets.page.includes('subscribeEverVerified')],
  ['promotional shipping limited by real difference', targets.page.includes('subscribeWaivedAmount > 0')],
  ['guest purchase passes explicit redemption marker', targets.page.includes('ruru_subscribe_waiver_requested: subscribeWaivedAmount > 0')],
  ['backend checks available eligibility', targets.submit.includes('promoClaimed && !(await activeSubscribeWaiverFor')],
  ['backend does not mark all certified orders', !targets.submit.includes('구독 인증 무료배송 표시 — 혜택 켠 시간')],
  ['post-certification banner hidden', targets.page.includes('subscribeShouldShow') && targets.page.includes('!subscribeEverVerified')],
  ['client GET provides entitlement', targets.clientApi.includes('readSubscribeBenefitStatus')],
  ['certificate freezes eligibility window', targets.clientApi.includes('benefit_window_start_at')],
  ['client distinguishes redeemed/available', targets.lib.includes('type SubscribeBenefitStatus') && targets.lib.includes('used: boolean')],
  ['server performs one-use SQL check', targets.lib.includes('ruru_subscribe_free_ship_eligible')],
  ['regular point rate remains adjustable', targets.settings.includes('point_earn_rate')],
  ['promo point rate independently adjustable', targets.settings.includes('subscribe_free_ship_point_earn_rate')],
  ['promo point rate used by order preview', targets.page.includes('subscribePromoEarnRate')],
  ['point rate at submission stored by RPC', targets.sql.includes('point_earn_rate_snapshot=v_promo_rate') && targets.sql.includes('point_earn_rate_snapshot=v_earn_rate')],
  ['payment trigger uses saved rate', targets.sql.includes('NEW.point_earn_rate_snapshot')],
  ['no automatic reward when global fee is already zero', targets.page.includes('ruru_subscribe_waiver_requested: subscribeWaivedAmount > 0')],
  ['promo-waived first order IS eligible for same-window combined shipping',
    targets.page.includes('const paidShippingOrders = activeCombineShippingOrders.filter') &&
    targets.submit.includes('const withinCurrentCombine = sameAddressOrders.filter') &&
    !targets.page.includes('if (order?.subscribe_promo_redemption === true) return false;') &&
    !targets.submit.includes('if (row?.subscribe_promo_redemption === true) return false;')],
  ['server rechecks combine time and categories', targets.submit.includes('withinCurrentCombine') && targets.submit.includes('stillDueMinimum')],
  ['promo redemption metadata does NOT disable normal combine shipping',
    targets.sql.includes('subscribe_promo_redemption=true') &&
    !targets.page.includes('order?.subscribe_promo_redemption === true') &&
    !targets.submit.includes('row?.subscribe_promo_redemption === true')],
  ['no historical order falsely stamped as confirmed promo',
    !targets.sql.includes('UPDATE public.orders o SET subscribe_promo_redemption=true')],
  ['one redemption per kakao account', targets.sql.includes('kakao_id text PRIMARY KEY')],
  ['atomic redemption with order creation', targets.sql.includes('INSERT INTO public.subscribe_free_ship_redemptions') && targets.sql.includes('IF NOT FOUND THEN')],
  ['legacy markers are treated conservatively', targets.sql.includes('historical redeemers are conservatively blocked')],
  ['cancel does not undo prior benefit', !targets.adminApi.includes('DELETE FROM public.subscribe_free_ship_redemptions')],
  ['verification log initially closed', targets.log.includes('useState(false)') && targets.log.includes('listOpen')],
  ['verification log is paginated server-side', targets.adminApi.includes('.range(page * limit, (page + 1) * limit - 1)')],
  ['log page size 10', targets.adminApi.includes('const limit = 10')],
  ['admin log requires session', targets.adminApi.includes('verifyAdminSessionFromRequest(request)')],
  ['existing bank-routing RPC is preserved', targets.sql.includes('pg_get_functiondef') && targets.sql.includes('payment_bank_assignment_source') === false],
  ['new redemption table protected by RLS', targets.sql.includes('ENABLE ROW LEVEL SECURITY')],
];
for (const [name, result] of cases) assert.ok(result, 'FAIL: '+name);
console.log(`RURU_POLICY_STATIC_CHECKS: PASS (${cases.length})`);
console.log('LIMIT: Static checks do NOT prove live checkout success; continue with tsc, build, sandbox DB tests, and genuine device E2E.');
