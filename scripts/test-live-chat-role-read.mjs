import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';

const {chatRoleOfKakao} = createUiLoader()('lib/liveChatServer.ts');
const phone = '01012345678';
let releasePhone;
let started = [];
let setting = {};
let ops = [];
let customerPhone = phone;
const sb = {from(table) {
  const q = {
    select() { return q; }, eq() { return q; }, order() { return q; },
    limit() { return q; }, maybeSingle() { return q; },
    then(resolve, reject) {
      started.push(table);
      if (table === 'customers') return new Promise(r => {
        releasePhone = () => r({data: customerPhone ? {customer_phone: customerPhone} : null});
      }).then(resolve, reject);
      return Promise.resolve({data: table === 'settings' ? {value: JSON.stringify(setting)} : ops}).then(resolve, reject);
    },
  };
  return q;
}};

async function role() {
  started = [];
  const pending = chatRoleOfKakao(sb, 'fixture');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(started.sort(), ['customers', 'operator_test_accounts', 'settings'],
    'Independent role reads must start before the customer lookup finishes');
  releasePhone();
  return pending;
}
let r = await role();
assert.equal(r.badge, null); assert.equal(r.isMod, false); assert.equal(r.isOwner, false);
setting = {owners: [{phone, badge: 'crown_pink'}], mods: [phone]};
ops = [{customer_phone: phone}];
r = await role();
assert.equal(r.badge, 'crown_pink'); assert.equal(r.isMod, true); assert.equal(r.isOwner, true);
setting = {mods: [phone]}; ops = [];
r = await role();
assert.equal(r.badge, 'mod'); assert.equal(r.isMod, true); assert.equal(r.isOwner, false);
setting = {}; ops = [{customer_phone: '010-1234-5678'}];
customerPhone = '010-1234-5678';
r = await role();
assert.equal(r.phone, phone); assert.equal(r.badge, 'mod'); assert.equal(r.isMod, true);
customerPhone = '';
r = await role();
assert.equal(r.phone, ''); assert.equal(r.badge, null); assert.equal(r.isMod, false); assert.equal(r.isOwner, false);
console.log('PASS concurrent role reads; owner priority, moderator, active operator, ordinary/missing customer roles preserved');
