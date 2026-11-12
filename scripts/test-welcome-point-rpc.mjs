// [2026-11-12] 방송 시청 선물 — 실제 지급 RPC(admin_change_customer_points 마이그레이션 파일 그대로)를
//   메모리 PostgreSQL 에서 돌려 «선물 지급이 보내는 값» 그대로 들어가는지·같은 키 두 번은 한 번만 들어가는지 확인.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table public.customer_point_balances (
  customer_phone text primary key, current_points integer not null default 0,
  total_granted_points integer not null default 0, total_used_points integer not null default 0,
  total_canceled_points integer not null default 0, total_adjusted_points integer not null default 0,
  youtube_nickname text, customer_name text, admin_memo text, last_granted_at timestamptz, updated_at timestamptz default now());
create table public.customer_point_ledger (
  id uuid primary key, customer_phone text not null, youtube_nickname text, customer_name text,
  change_type text not null, amount integer not null, balance_after integer not null, reason text, admin_memo text,
  customer_visible boolean default true, customer_seen_at timestamptz, created_by text, source_key text, created_at timestamptz default now());
create unique index customer_point_ledger_source_key_uidx on public.customer_point_ledger(source_key) where source_key is not null;
`);
await db.exec(readFileSync("supabase/migrations/20261002032503_admin_points_atomic.sql", "utf8"));

// 선물 지급과 똑같은 인자(lib/welcomePointServer claimWelcome)
const call = async (phone, amount, key) => (await db.query(
  "select public.admin_change_customer_points($1,'grant',$2,'처음 오신 선물','방송 시청 선물 자동 지급','새손님','이새봄',true,$3) as r",
  [phone, amount, key])).rows[0].r;

// 잔액 줄이 없던 손님도 들어감
await db.exec("insert into public.customer_point_balances(customer_phone,current_points) values('01070007000',500)");
const r1 = await call("01050005000", 2000, "welcome_first:n1");
assert.equal(r1.ok, true); assert.equal(r1.current_points_after, 2000);
// 같은 키 다시 → 중복(잔액 그대로)
const r2 = await call("01050005000", 2000, "welcome_first:n1");
assert.equal(r2.ok, true); assert.equal(r2.duplicate, true);
const bal = (await db.query("select current_points, total_granted_points from public.customer_point_balances where customer_phone='01050005000'")).rows[0];
assert.equal(bal.current_points, 2000); assert.equal(bal.total_granted_points, 2000);
// 기존 잔액에 더해짐
const r3 = await call("01070007000", 1000, "welcome_back:r1:G1");
assert.equal(r3.current_points_after, 1500);
// 손님 화면 선물 카드가 읽는 조건(보이기·안 본 것·양수) 그대로 들어감
const g = (await db.query("select customer_visible, customer_seen_at, amount, reason, change_type from public.customer_point_ledger where source_key='welcome_first:n1'")).rows[0];
assert.deepEqual(g, { customer_visible: true, customer_seen_at: null, amount: 2000, reason: "처음 오신 선물", change_type: "grant" });
assert.equal((await db.query("select count(*)::int c from public.customer_point_ledger")).rows[0].c, 2);
console.log("welcome-point-rpc OK");
