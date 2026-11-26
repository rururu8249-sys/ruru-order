// [2026-11-26 사장님 긴급] 판매 가능 수량 — 입력 시각 뒤 주문만 · 장바구니는 먼저 담은 순서. 운영에 넣는 SQL 함수를 PGlite 로 그대로 돌림.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`create table products(id bigint primary key, product_note text);
create table orders(id serial, product_id bigint, product_name text, color text, size text, qty int, is_deleted boolean, is_test_order boolean, order_status text, order_manage_status text, admin_order_status_v2 text, created_at timestamptz default now());
create table cart_reservations(session_key text, customer_phone text, product_id text, product_name text, color text, size text, qty int, expires_at timestamptz, created_at timestamptz default now());
create role anon; create role authenticated;`);
const old=fs.readFileSync('supabase/sql/hotfix/option_limit_qty_20261114.sql','utf8');
await db.exec(old.slice(0,old.indexOf('do $patch$')));
const neu=fs.readFileSync('supabase/sql/hotfix/option_limit_fifo_20261126.sql','utf8');
await db.exec(neu.slice(0,neu.indexOf('do $patch$')));
const setNote=async(at)=>{const row={color:'블랙',size:'M',stock:0,limit_qty:4};if(at)row.limit_qty_at=at;await db.query('delete from products');await db.query('insert into products values(1,$1)',[JSON.stringify({stock_variants:[row]})]);};
const rem=async(session,phone='',before)=>(await db.query(before===undefined?`select public.ruru_option_limit_remaining(1,(select product_note::jsonb from products where id=1),'','블랙','M',$1,$2) r`:`select public.ruru_option_limit_remaining(1,(select product_note::jsonb from products where id=1),'','블랙','M',$1,$2,$3::timestamptz) r`,before===undefined?[session,phone]:[session,phone,before])).rows[0].r;
const order=async(when)=>db.query(`insert into orders(product_id,product_name,color,size,qty,order_manage_status,created_at) values(1,'x','블랙','M',1,'주문확인전',$1::timestamptz)`,[when]);
const hold=async(s,phone,when)=>db.query(`insert into cart_reservations values($1,$2,'1','x','블랙','M',1,now()+interval '1 day',$3::timestamptz)`,[s,phone,when]);

// ① 예전 주문 3개가 있는 옵션에 오늘 4개 입력 → 입력 시각 뒤 주문만 셈
await order('2026-11-01T00:00:00Z');await order('2026-11-02T00:00:00Z');await order('2026-11-03T00:00:00Z');
await setNote(null);
assert.equal(await rem('NEW'),1,'(옛 방식 유지) 시각 없으면 전부 셈');
await setNote('2026-11-26T10:00:00Z');
assert.equal(await rem('NEW'),4,'입력 뒤 주문 0개 → 4개 남음');

// ② 사장님 예시: 입력 뒤 주문서 2 + 장바구니 2(C 먼저, D 나중)
await order('2026-11-26T10:05:00Z');await order('2026-11-26T10:06:00Z');
await hold('C','01011112222','2026-11-26T10:07:00Z');await hold('D','01033334444','2026-11-26T10:08:00Z');
assert.equal(await rem('NEW'),0,'새 손님은 못 담음(4 = 2 + 2)');
// C 제출: 주문이 먼저 들어간 뒤 검사(제출 함수와 같은 순서) → 0 이상이면 통과
await order('2026-11-26T10:10:00Z');
assert.ok(await rem('C','01011112222')>=0,'C 제출 통과');
await db.query(`delete from cart_reservations where session_key='C'`);
await order('2026-11-26T10:11:00Z');
assert.ok(await rem('D','010-3333-4444')>=0,'D 제출 통과(전화 하이픈 있어도 본인으로 봄)');
await db.query(`delete from cart_reservations where session_key='D'`);
await order('2026-11-26T10:12:00Z');
assert.ok(await rem('E')<0,'5번째는 품절');

// ③ 담은 사람이 남은 수량보다 많을 때 — 먼저 담은 순서대로
await db.exec('delete from orders; delete from cart_reservations');
await setNote('2026-11-26T11:00:00Z');
await order('2026-11-26T11:01:00Z');await order('2026-11-26T11:02:00Z');
await hold('P','010','2026-11-26T10:30:00Z');await hold('Q','011','2026-11-26T10:40:00Z');await hold('R','012','2026-11-26T10:50:00Z');
// 담기 다시 확인(자기 줄은 지운 뒤 처음 담은 시각으로 검사)
assert.equal(await rem('P','010','2026-11-26T10:30:00Z'),2,'P(1등) 담기 유지');
assert.equal(await rem('Q','011','2026-11-26T10:40:00Z'),1,'Q(2등) 담기 유지');
assert.equal(await rem('R','012','2026-11-26T10:50:00Z'),0,'R(3등)은 0 → 1개 담기 불가');
// 예전 계산이면 P 도 4-2-2=0 으로 빠졌음
await order('2026-11-26T11:10:00Z');
assert.ok(await rem('P','010')>=0,'P 제출 통과');
await db.query(`delete from cart_reservations where session_key='P'`); // 제출 뒤 장바구니 비움(제출 라우트와 같음)
await order('2026-11-26T11:11:00Z');
assert.ok(await rem('Q','011')>=0,'Q 제출 통과');
await db.query(`delete from cart_reservations where session_key='Q'`);
assert.equal(await rem('R','012'),0,'R 은 남은 0 → 담기·제출 불가');
// 만료된 장바구니는 안 셈
await db.query(`update cart_reservations set expires_at=now()-interval '1 minute' where session_key='R'`);
assert.equal(await rem('NEW'),0,'만료 장바구니 빼고 4-4=0');
console.log('option-limit-fifo OK');
