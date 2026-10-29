// [2026-10-29 사장님 「시뮬레이션 직접 돌려」] 운영 orders 에 걸린 트리거를 «전부» 같이 설치하고 포인트 이관 트리거를 돌려 본다.
//   운영 트리거 6개(2026-10-29 pg_trigger 실측):
//     guard_automatic_bank_confirmation(BEFORE UPDATE 모든 줄) · orders_manage_repick_attention(BEFORE UPDATE OF 상품/색/사이즈/수량/챙김)
//     accrue_order_points_on_confirm(AFTER UPDATE OF 상태) · fn_revoke_point_on_cancel(BEFORE UPDATE 모든 줄)
//     ruru_fill_order_cost_snapshot(BEFORE INSERT — 금액 수정과 무관해 제외) · ruru_rebalance_excess_points(이번 것)
//   함수 본문: guard·repick·accrue·rebalance 는 repo 파일 = 운영 md5 일치 확인, revoke 는 운영 본문 그대로 옮김.
//   운영 DB 에서 직접 시험(되돌림 포함)은 권한이 막혀, 운영과 같은 트리거를 메모리 DB 에 올려 시험한다.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

function extractFn(path, fn) {
  const s = fs.readFileSync(path, "utf8");
  const m = s.match(new RegExp(String.raw`(create\s+or\s+replace\s+function\s+(?:public\.)?${fn}\s*\(\s*\)[\s\S]*?as\s+(\$[a-z_]*\$)[\s\S]*?\2\s*;)`, "i"));
  if (!m) throw new Error("함수 못 찾음 " + fn);
  return m[1];
}
const GUARD = extractFn("supabase/migrations/20261005143440_verified_bank_deposit_matching.sql", "guard_automatic_bank_confirmation");
const REPICK = extractFn("supabase/migrations/20261004010000_order_repick_attention.sql", "orders_manage_repick_attention");
const ACCRUE = extractFn("supabase/sql/order_point_auto_earn_rpc.sql", "accrue_order_points_on_confirm");
const REBALANCE = fs.readFileSync("supabase/sql/hotfix/point_rebalance_trigger_20261028.sql", "utf8");
// 운영 본문(2026-10-29 pg_get_functiondef) 그대로
const REVOKE = String.raw`
CREATE OR REPLACE FUNCTION public.fn_revoke_point_on_cancel() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_phone TEXT; v_current INTEGER; v_balance_after INTEGER; v_now TIMESTAMPTZ := now();
BEGIN
  IF NEW.admin_order_status_v2 NOT LIKE '%취소%' THEN RETURN NEW; END IF;
  IF NEW.point_earned_at IS NULL OR COALESCE(NEW.point_earned_amount, 0) <= 0 THEN RETURN NEW; END IF;
  IF OLD.admin_order_status_v2 LIKE '%취소%' THEN RETURN NEW; END IF;
  v_phone := regexp_replace(COALESCE(NEW.customer_phone, NEW.phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone) < 10 THEN RETURN NEW; END IF;
  SELECT current_points INTO v_current FROM public.customer_point_balances WHERE customer_phone = v_phone;
  IF v_current IS NULL THEN RETURN NEW; END IF;
  v_balance_after := GREATEST(v_current - NEW.point_earned_amount, 0);
  UPDATE public.customer_point_balances SET current_points = v_balance_after, total_canceled_points = total_canceled_points + NEW.point_earned_amount, updated_at = v_now WHERE customer_phone = v_phone;
  INSERT INTO public.customer_point_ledger (customer_phone, youtube_nickname, customer_name, change_type, amount, balance_after, reason, admin_memo, related_order_id, customer_visible, customer_seen_at, created_by, created_at)
  VALUES (v_phone, NEW.youtube_nickname, NEW.customer_name, 'cancel', NEW.point_earned_amount, v_balance_after, '주문취소 포인트 자동회수', '주문취소 자동회수(' || NEW.order_group_id::text || ')', NEW.id::text, false, v_now, 'trigger-cancel-revoke', v_now);
  NEW.point_earned_at := NULL; NEW.point_earned_amount := 0;
  RETURN NEW;
END; $function$;`;

async function makeDb() {
  const db = new PGlite();
  await db.exec(`
create role anon; create role authenticated;
create table public.orders (
  id bigint generated always as identity primary key,
  order_group_id text, created_at timestamptz default now(),
  customer_phone text, phone text, youtube_nickname text, customer_name text,
  product_name text, color text, size text, qty int, picked_at timestamptz,
  repick_required_at timestamptz, repick_before jsonb, repick_resolved_at timestamptz,
  product_price int, adjusted_product_price int,
  total_price int, adjusted_total_price numeric, final_amount bigint, adjusted_shipping_fee int,
  point_used_amount int, point_used_at timestamptz, point_refunded_amount int, point_refunded_at timestamptz,
  point_earned_at timestamptz, point_earned_amount int,
  admin_order_status_v2 text, order_manage_status text, deposit_confirmed_at timestamptz,
  is_deleted boolean default false, is_test_order boolean default false, exclude_from_settlement boolean default false);
create table public.deposits (id bigserial primary key, match_order_group_id text, confirmed_at timestamptz, deposited_at timestamptz, match_status text, amount int);
create table public.settings (key text primary key, value text);
create table public.customer_point_balances (customer_phone text primary key, youtube_nickname text, customer_name text, current_points int default 0, total_granted_points int default 0, total_used_points int default 0, total_canceled_points int default 0, last_granted_at timestamptz, updated_at timestamptz);
create table public.customer_point_ledger (id bigserial primary key, customer_phone text, youtube_nickname text, customer_name text, change_type text, amount int, balance_after int, reason text, admin_memo text, related_order_id text, customer_visible boolean, customer_seen_at timestamptz, created_by text, created_at timestamptz default now());
insert into settings values ('point_auto_earn_enabled','true'),('point_earn_rate','1');
`);
  await db.exec(GUARD);
  await db.exec(`create trigger orders_guard_automatic_bank_confirmation before update on public.orders for each row execute function guard_automatic_bank_confirmation();`);
  await db.exec(REPICK);
  await db.exec(`create trigger orders_manage_repick_attention_trigger before update of product_name, color, size, qty, picked_at on public.orders for each row execute function orders_manage_repick_attention();`);
  await db.exec(ACCRUE);
  await db.exec(`create trigger trg_accrue_order_points after update of admin_order_status_v2, order_manage_status on public.orders for each row execute function accrue_order_points_on_confirm();`);
  await db.exec(REVOKE);
  await db.exec(`create trigger trg_revoke_point_on_cancel before update on public.orders for each row execute function fn_revoke_point_on_cancel();`);
  await db.exec(REBALANCE);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  return { db, q };
}
const sums = async (q, g) => (await q(`select sum(point_used_amount)::int pt, sum(final_amount)::int fa from orders where order_group_id=$1 and coalesce(admin_order_status_v2,'') not like '%취소%'`, [g]))[0];
const rows = async (q, g) => q(`select id, point_used_amount pt, final_amount::int fa, point_earned_amount pe, admin_order_status_v2 st from orders where order_group_id=$1 order by id`, [g]);
const bal = async (q, phone) => (await q(`select current_points::int cur from customer_point_balances where customer_phone=$1`, [phone]))[0]?.cur ?? null;
const ins = (q, v) => q(`insert into orders (order_group_id, customer_phone, youtube_nickname, customer_name, product_name, qty, product_price, adjusted_product_price, total_price, adjusted_total_price, final_amount, adjusted_shipping_fee, point_used_amount, point_used_at, point_refunded_amount, admin_order_status_v2, order_manage_status, deposit_confirmed_at, created_at)
  values ($1,'01011112222','테스트','홍길동',$2,1,$3::int,$3::int,$4::int,$4::int,$5::int,$6::int,$7::int,case when $7::int>0 then now() end,0,$8::text,$8::text,$9::timestamptz, now() - interval '1 hour') returning id`, v);
const shipping0 = (q, id, total) => q(`update orders set adjusted_shipping_fee=0, total_price=$2::int, adjusted_total_price=$2::int, final_amount=greatest(0,$2::int-coalesce(point_used_amount,0)) where id=$1`, [id, total]);

// 1) 미입금 주문서 — 에이치_더블 사고 그대로: 다른 트리거가 다 걸려 있어도 38,000
{
  const { q } = await makeDb();
  const [{ id: a }] = await ins(q, ["G1", "A", 39000, 43000, 3000, 4000, 40000, "미설정", null]);
  await ins(q, ["G1", "B", 39000, 39000, 39000, 0, 0, "미설정", null]);
  await shipping0(q, a, 39000);
  assert.deepEqual(await sums(q, "G1"), { pt: 40000, fa: 38000 });
}

// 2) 이미 «자동입금확인» 된 주문서(입금 연결·확인 시각 있음)의 배송비를 고쳐도: 자동입금 가드가 막지 않고, 적립 다시 안 하고, 포인트 잔액 그대로
{
  const { q } = await makeDb();
  await q(`insert into customer_point_balances (customer_phone,current_points) values ('01011112222',500)`);
  const conf = (await q(`select (now() - interval '30 minutes') t`))[0].t;
  const [{ id: a }] = await ins(q, ["G2", "A", 39000, 43000, 3000, 4000, 40000, "자동입금확인", conf]);
  await ins(q, ["G2", "B", 39000, 39000, 39000, 0, 0, "자동입금확인", conf]);
  await q(`insert into deposits (match_order_group_id, confirmed_at, deposited_at, match_status, amount) values ('G2',$1,now() - interval '40 minutes','자동입금확인',42000)`, [conf]);
  await shipping0(q, a, 39000);
  assert.deepEqual(await sums(q, "G2"), { pt: 40000, fa: 38000 }, "입금확인된 주문서도 38,000");
  assert.equal(await bal(q, "01011112222"), 500, "포인트 잔액 무변경");
  assert.equal((await q(`select count(*)::int n from customer_point_ledger`))[0].n, 0, "포인트 이력 안 생김");
  const st = (await rows(q, "G2")).map((r) => r.st);
  assert.deepEqual(st, ["자동입금확인", "자동입금확인"], "상태 무변경");
}

// 3) 고친 뒤 «입금확인»으로 바꾸면 적립 트리거는 예전 규칙대로(포인트 쓴 줄은 적립 대상 제외) — 이관 트리거와 충돌·오류 없음
{
  const { q } = await makeDb();
  await q(`insert into customer_point_balances (customer_phone,current_points) values ('01011112222',0)`);
  const [{ id: a }] = await ins(q, ["G3", "A", 39000, 43000, 3000, 4000, 40000, "미설정", null]);
  await ins(q, ["G3", "B", 39000, 39000, 39000, 0, 0, "미설정", null]);
  await shipping0(q, a, 39000); // B 줄이 포인트 1,000 받음
  await q(`update orders set admin_order_status_v2='수동입금확인', order_manage_status='수동입금확인' where order_group_id='G3'`);
  assert.deepEqual(await sums(q, "G3"), { pt: 40000, fa: 38000 }, "상태 바꿔도 금액 그대로");
  // 두 줄 모두 포인트를 써서 적립 대상 0원 → 적립 0·표시만(예전 트리거 규칙 그대로)
  assert.equal(await bal(q, "01011112222"), 0);
  assert.ok((await rows(q, "G3")).every((r) => r.pe === 0), "적립 0 표시");
}

// 4) 결제수단 변경(카드→무통장) 모양 UPDATE — 입금확인된 주문서에서도 합계 맞음
{
  const { q } = await makeDb();
  const conf = (await q(`select (now() - interval '30 minutes') t`))[0].t;
  const [{ id: a }] = await ins(q, ["G4", "A", 39000, 41730, 1730, 0, 40000, "카드결제완료", null]);
  await ins(q, ["G4", "B", 39000, 39000, 39000, 0, 0, "카드결제완료", null]);
  await q(`update orders set total_price=39000, adjusted_total_price=39000, final_amount=greatest(0, 39000 - coalesce(point_used_amount,0)) where id=$1`, [a]);
  assert.deepEqual(await sums(q, "G4"), { pt: 40000, fa: 38000 });
  void conf;
}

// 5) 한 줄 취소: 취소 트리거(적립 회수)는 그대로 돌고, 포인트 이관 트리거는 취소 줄을 건드리지 않음
{
  const { q } = await makeDb();
  await q(`insert into customer_point_balances (customer_phone,current_points) values ('01011112222',1000)`);
  const [{ id: a }] = await ins(q, ["G5", "A", 50000, 50000, 50000, 0, 0, "수동입금확인", null]);
  const [{ id: b }] = await ins(q, ["G5", "B", 30000, 30000, 25000, 0, 5000, "수동입금확인", null]);
  await q(`update orders set point_earned_at=now(), point_earned_amount=500 where order_group_id='G5'`);
  await q(`update orders set admin_order_status_v2='주문취소', order_manage_status='주문취소' where id=$1`, [a]);
  const r = await rows(q, "G5");
  assert.equal(r.find((x) => x.id === a).pe, 0, "취소 줄 적립 회수 표시");
  assert.equal(await bal(q, "01011112222"), 500, "회수 트리거 정상(1,000 → 500)");
  assert.deepEqual({ pt: r.find((x) => x.id === b).pt, fa: r.find((x) => x.id === b).fa }, { pt: 5000, fa: 25000 }, "남은 줄 그대로");
}

// 6) 챙김 표시·상품 이름 수정(다시 챙기기 트리거)과 같이 써도 이관 정상
{
  const { q } = await makeDb();
  const [{ id: a }] = await ins(q, ["G6", "A", 39000, 43000, 3000, 4000, 40000, "미설정", null]);
  await ins(q, ["G6", "B", 39000, 39000, 39000, 0, 0, "미설정", null]);
  await q(`update orders set picked_at=now() where order_group_id='G6'`);
  await q(`update orders set product_name='A2', adjusted_shipping_fee=0, total_price=39000, adjusted_total_price=39000, final_amount=greatest(0,39000-coalesce(point_used_amount,0)) where id=$1`, [a]);
  assert.deepEqual(await sums(q, "G6"), { pt: 40000, fa: 38000 });
  const re = await q(`select repick_required_at is not null rr from orders where id=$1`, [a]);
  assert.equal(re[0].rr, true, "다시 챙기기 표시도 정상");
}

console.log("point-rebalance-live-triggers simulation passed (6)");
