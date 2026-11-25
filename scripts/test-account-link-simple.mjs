// 계정 잇기 단순화 SQL 시뮬레이션 (PGlite) — 운영 RPC 원문 + 번호변경 트리거 위에 hotfix 실행
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create table customers(id bigserial primary key, customer_phone text, customer_name text, youtube_nickname text, kakao_id text, address text, detail_address text, shipping_addresses jsonb, created_at timestamptz default now());
create table orders(id bigserial primary key, customer_phone text, phone text, recipient_phone text, kakao_id text, is_deleted boolean default false);
create table customer_point_balances(id bigserial primary key, customer_phone text unique, current_points int default 0, total_granted_points int default 0, total_used_points int default 0, total_canceled_points int default 0, total_adjusted_points int default 0, admin_memo text, customer_id bigint, updated_at timestamptz);
create table customer_point_ledger(id bigserial primary key, customer_phone text, amount int, customer_id bigint);
create table customer_phone_blocks(phone text primary key, updated_at timestamptz);
`);
const strip = (s) => s.replace(/^-- 확인[\s\S]*$/m, "");
await db.exec(fs.readFileSync("supabase/sql/customer_link_requests.sql", "utf8").replace(/^select[\s\S]*?;\s*$/gm, ""));
await db.exec(`alter table customer_link_requests add column if not exists source text not null default 'customer';
alter table customer_link_requests add column if not exists match_reasons text[] not null default '{}';
alter table customer_link_requests add column if not exists new_customer_id bigint;
create or replace function ruru_detect_split_account() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger ruru_detect_split_account_trg after insert on customers for each row execute function ruru_detect_split_account();`);
await db.exec(strip(fs.readFileSync("supabase/sql/customer_link_merge_rpc.sql", "utf8")));
const idt = fs.readFileSync("supabase/sql/point_identity_sync_trigger.sql", "utf8");
await db.exec(idt.slice(0, idt.indexOf("-- 2) 새로 생기는")).replace(/drop trigger[\s\S]*?create trigger trg_sync_identity_on_phone_change[\s\S]*?;\s*/m, (m) => m));
// 시나리오: 엄마(old, 010-1111-1111, 포인트 275, 주문1) · 새 카톡(new, 010-2222-2222, 처음선물 1000P, 주문0)
await db.exec(`
insert into customers(id,customer_phone,customer_name,kakao_id) values (1,'01011111111','옛손님','K_OLD'),(2,'01022222222','옛손님','K_NEW');
insert into orders(customer_phone,kakao_id) values ('01011111111','K_OLD');
insert into customer_point_balances(customer_phone,current_points,customer_id) values ('01011111111',275,1),('01022222222',1000,2);
insert into customer_point_ledger(customer_phone,amount,customer_id) values ('01011111111',275,1),('01022222222',1000,2);
insert into customer_link_requests(id,nickname,claimed_phone,target_customer_id,target_customer_phone,new_kakao_id,new_customer_phone,source,status)
 values ('00000000-0000-0000-0000-000000000001','손님','01011111111',1,'01011111111','K_NEW','01022222222','customer','pending'),
        ('00000000-0000-0000-0000-000000000002','가족','01033333333',null,'01033333333','K_X','01044444444','auto','pending');
`);
const call = async (dry) => (await db.query(`select ruru_merge_customer_link_request('00000000-0000-0000-0000-000000000001', $1) r`, [dry])).rows[0].r;
const before = await call(true);
assert.equal(before.reason, "new_side_has_money", "패치 전: 포인트만 있어도 멈춤(재현)");
await db.exec(fs.readFileSync("supabase/sql/hotfix/account_link_simple_20261126.sql", "utf8"));
const trg = (await db.query(`select count(*)::int n from pg_trigger where tgname='ruru_detect_split_account_trg'`)).rows[0].n;
assert.equal(trg, 0, "자동감지 트리거 꺼짐");
const auto = (await db.query(`select status from customer_link_requests where source='auto'`)).rows[0].status;
assert.equal(auto, "rejected", "자동 대기 요청 정리");
const prev = await call(true);
assert.equal(prev.ok, true); assert.equal(prev.new_points, 1000); assert.equal(prev.old_points, 275);
const done = await call(false);
assert.equal(done.ok, true);
const bal = (await db.query(`select customer_phone, current_points, customer_id from customer_point_balances`)).rows;
assert.deepEqual(bal.map((r) => [r.customer_phone, r.current_points, Number(r.customer_id)]), [["01022222222", 1275, 1]], "포인트 합산 1275·남긴 계정 id");
const led = (await db.query(`select customer_phone, customer_id from customer_point_ledger order by id`)).rows;
assert.ok(led.every((r) => r.customer_phone === "01022222222" && Number(r.customer_id) === 1), "이력 전부 새 번호·남긴 계정");
const cust = (await db.query(`select id, customer_phone, kakao_id from customers`)).rows;
assert.deepEqual(cust.map((r) => [Number(r.id), r.customer_phone, r.kakao_id]), [[1, "01022222222", "K_NEW"]]);
// 새 계정에 주문이 있으면 여전히 멈춤
await db.exec(`insert into customers(id,customer_phone,kakao_id) values (3,'01055555555','K_A'),(4,'01066666666','K_B');
insert into orders(customer_phone) values ('01066666666');
insert into customer_link_requests(id,nickname,claimed_phone,target_customer_phone,new_kakao_id,new_customer_phone,status) values ('00000000-0000-0000-0000-000000000003','x','01055555555','01055555555','K_B','01066666666','pending');`);
const stop = (await db.query(`select ruru_merge_customer_link_request('00000000-0000-0000-0000-000000000003', true) r`)).rows[0].r;
assert.equal(stop.reason, "new_side_has_money", "새 계정 주문 있으면 멈춤 유지");
console.log("✅ account-link-simple 7가지 통과");
