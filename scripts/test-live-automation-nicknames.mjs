import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
let N;
try { N=load('lib/liveAutomationNicknames.ts'); } catch {}
assert.ok(N,'the reviewed nickname pool and normalization must exist');
const pool=N.NICKNAME_CANDIDATES;
assert.ok(pool.length>=2000,'후보 '+pool.length);
assert.equal(new Set(pool.map(x=>N.nicknameCollisionKey(x.nickname))).size,pool.length);
assert.ok(pool.every(x=>!/[0-9]/.test(x.nickname)),'숫자 없음');
{const en=pool.filter(x=>/[a-z]/i.test(x.nickname)).length;assert.ok(en>=100&&en<=300,'영어 닉네임 '+en);}
assert.ok(pool.every(x=>x.nickname.length>=2 && x.nickname.length<=10));
assert.ok(pool.every(x=>!/(test|admin|official|테스트|관리자|루루|\[|\])/i.test(x.nickname) && !/AI/.test(x.nickname)));
assert.ok(!pool.some(x=>['매실다락방','보리한줌','서리정류장'].includes(x.nickname)),'예전 이어붙인 이름 없음');
assert.equal(N.nicknameCollisionKey('  Jo Y  '),'joy');
assert.equal(N.nicknameCollisionKey('\u1100\u1161 \u1102\u1161'),'\uac00\ub098');
const fresh=N.availableNicknameCandidates(['  MOMO ',pool[0].nickname],new Set([N.nicknameCollisionKey(pool[1].nickname)]));
{const deny=new Set(['momo',N.nicknameCollisionKey(pool[0].nickname),N.nicknameCollisionKey(pool[1].nickname)]);assert.equal(fresh.length,pool.filter(x=>!deny.has(N.nicknameCollisionKey(x.nickname))).length);}
assert.ok(!fresh.some(x=>N.nicknameCollisionKey(x.nickname)==='momo'));
assert.equal(N.availableNicknameCandidates(pool.map(x=>x.nickname),new Set()).length,0);
console.log('PASS member-style unique candidates, no digits, low English ratio, collision normalization and exclusions');
