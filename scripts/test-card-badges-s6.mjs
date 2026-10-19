// [㊴] 상품 카드 배지 — 최대 2개, 특가 > 바로구매 > 신상 > 그 외
import assert from 'node:assert/strict';
import { pickCardBadgesS6 } from '../lib/productBadgePriority.ts';
assert.deepEqual(pickCardBadgesS6(['new', 'direct', 'special', 'hot']), ['special', 'direct']);
assert.deepEqual(pickCardBadgesS6(['hot', 'new']), ['new', 'hot']);
assert.deepEqual(pickCardBadgesS6(['direct']), ['direct']);
assert.deepEqual(pickCardBadgesS6(['low', 'new']), ['new'], '「N개 남음」은 배지가 아니라 가격 근처 글씨');
assert.deepEqual(pickCardBadgesS6([]), []);
assert.equal(pickCardBadgesS6(['overseas', 'company', 'hot', 'pick', 'free']).length, 2);
// [㊺-1] 해외배송·업체배송은 항상 먼저(2개 제한에 밀려 사라지지 않게)
assert.deepEqual(pickCardBadgesS6(['overseas', 'special', 'direct']), ['overseas', 'special']);
assert.deepEqual(pickCardBadgesS6(['company', 'special']), ['company', 'special']);
console.log('card badges s6 passed');
