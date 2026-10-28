// [2026-10-28] supabase/sql/hotfix/point_rebalance_trigger_20261028.sql 를 메모리 PostgreSQL(PGlite)에서 그대로 실행해 검증.
//   에이치_더블 사고(배송비 4,000→0 뒤 남는 포인트 1,000 이 사라져 39,000 으로 잡힘) 재현 → 패치 후 38,000.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const PATCH = fs.readFileSync("supabase/sql/hotfix/point_rebalance_trigger_20261028.sql", "utf8");
const ROLLBACK = fs.readFileSync("supabase/sql/hotfix/point_rebalance_trigger_20261028_rollback.sql", "utf8");

async function makeDb() {
  const db = new PGlite();
  await db.exec(`
create role anon; create role authenticated;
create table public.orders (
  id bigint primary key, order_group_id text, total_price int, adjusted_total_price int, final_amount int,
  point_used_amount int, point_used_at timestamptz, point_refunded_amount int, point_refunded_at timestamptz,
  admin_order_status_v2 text, order_manage_status text, is_deleted boolean, adjusted_shipping_fee int);
`);
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  return { db, q };
}
const sums = async (q, g) => (await q(`select sum(point_used_amount)::int pt, sum(final_amount)::int fa from orders where order_group_id=$1 and coalesce(admin_order_status_v2,'') not like '%취소%'`, [g]))[0];
const row = async (q, id) => (await q(`select point_used_amount pt, final_amount fa from orders where id=$1`, [id]))[0];

// 클라이언트 배송비 수정과 같은 UPDATE (줄 총액 재계산 + final = greatest(0, 총액 − 그 줄 포인트))
const shippingEdit = (q, id, newTotal) =>
  q(`update orders set adjusted_shipping_fee=0, adjusted_total_price=$2, total_price=$2, final_amount=greatest(0,$2-coalesce(point_used_amount,0)) where id=$1`, [id, newTotal]);

async function seedHdouble(q) {
  await q(`insert into orders values
    (6200,'G',43000,43000,3000,40000,now(),0,null,'미설정',null,false,4000),
    (6201,'G',39000,39000,39000,0,null,0,null,'미설정',null,false,0)`);
}

// 1) 패치 전: 사고 재현 — 합계 39,000
{
  const { q } = await makeDb();
  await seedHdouble(q);
  await shippingEdit(q, 6200, 39000);
  assert.deepEqual(await sums(q, "G"), { pt: 40000, fa: 39000 }, "패치 전엔 39,000 으로 잡혀야(사고 재현)");
}

// 2) 패치 후: 38,000, 포인트 합 40,000 그대로
{
  const { db, q } = await makeDb();
  await db.exec(PATCH);
  await seedHdouble(q);
  await shippingEdit(q, 6200, 39000);
  assert.deepEqual(await sums(q, "G"), { pt: 40000, fa: 38000 });
  assert.deepEqual(await row(q, 6200), { pt: 39000, fa: 0 });
  assert.deepEqual(await row(q, 6201), { pt: 1000, fa: 38000 });

  // 3) 이미 어긋난 주문(운영 데이터 모양)도 포인트 칸을 한 번 건드리면 바로잡힘
  const t = await makeDb();
  await t.db.exec(PATCH);
  await t.q(`insert into orders values
    (1,'H',39000,39000,0,40000,now(),0,null,'미설정',null,false,0),
    (2,'H',39000,39000,39000,0,null,0,null,'미설정',null,false,0)`);
  await t.q(`update orders set point_used_amount = point_used_amount where id=1`);
  assert.deepEqual(await sums(t.q, "H"), { pt: 40000, fa: 38000 });
}

// 4) 포인트가 줄 금액보다 작으면 아무 일 없음(정상 경로 동일)
{
  const { db, q } = await makeDb();
  await db.exec(PATCH);
  await q(`insert into orders values
    (1,'A',43000,43000,23000,20000,now(),0,null,'입금확인',null,false,4000),
    (2,'A',39000,39000,39000,0,null,0,null,'입금확인',null,false,0)`);
  await shippingEdit(q, 1, 39000);
  assert.deepEqual(await row(q, 1), { pt: 20000, fa: 19000 });
  assert.deepEqual(await row(q, 2), { pt: 0, fa: 39000 });
}

// 5) 주문서 전체 금액보다 포인트가 많으면 옮길 수 있는 만큼만, 나머지는 원래 줄에 남김(포인트 합 불변)
{
  const { db, q } = await makeDb();
  await db.exec(PATCH);
  await q(`insert into orders values
    (1,'B',24000,24000,4000,20000,now(),0,null,'미설정',null,false,4000),
    (2,'B',5000,5000,5000,0,null,0,null,'미설정',null,false,0)`);
  await shippingEdit(q, 1, 10000);
  assert.deepEqual(await row(q, 2), { pt: 5000, fa: 0 });
  assert.deepEqual(await row(q, 1), { pt: 15000, fa: 0 });
  assert.equal((await sums(q, "B")).pt, 20000);
}

// 6) 취소·환불·삭제·포인트 돌려준 줄은 받지 않음, final null 줄은 null 유지, 여유 큰 줄부터
{
  const { db, q } = await makeDb();
  await db.exec(PATCH);
  await q(`insert into orders values
    (1,'C',30000,30000,0,30000,now(),0,null,'미설정',null,false,0),
    (2,'C',50000,50000,50000,0,null,0,null,'주문취소',null,false,0),
    (3,'C',50000,50000,50000,0,null,0,null,'미설정',null,true,0),
    (4,'C',50000,50000,50000,0,null,5000,now(),'미설정',null,false,0),
    (5,'C',10000,10000,null,0,null,0,null,'미설정',null,false,0),
    (6,'C',20000,20000,20000,0,null,0,null,'미설정',null,false,0)`);
  await shippingEdit(q, 1, 22000);
  assert.deepEqual(await row(q, 6), { pt: 8000, fa: 12000 }, "여유 큰 줄(6)이 먼저 받음");
  assert.deepEqual(await row(q, 5), { pt: 0, fa: null });
  for (const id of [2, 3, 4]) assert.deepEqual(await row(q, id), { pt: 0, fa: 50000 }, `줄 ${id} 은 안 받음`);
  assert.deepEqual(await row(q, 1), { pt: 22000, fa: 0 });
}

// 7) 넣기(INSERT)·상태만 바꾸기는 안 건드림
{
  const { db, q } = await makeDb();
  await db.exec(PATCH);
  await q(`insert into orders values
    (1,'D',10000,10000,0,15000,now(),0,null,'미설정',null,false,0),
    (2,'D',20000,20000,20000,0,null,0,null,'미설정',null,false,0)`);
  assert.deepEqual(await row(q, 1), { pt: 15000, fa: 0 }, "INSERT 엔 안 돎");
  await q(`update orders set admin_order_status_v2='입금확인' where id=1`);
  assert.deepEqual(await row(q, 2), { pt: 0, fa: 20000 }, "상태만 바꾸면 안 돎");
}

// 8) 되돌리기
{
  const { db, q } = await makeDb();
  await db.exec(PATCH);
  await db.exec(ROLLBACK);
  await seedHdouble(q);
  await shippingEdit(q, 6200, 39000);
  assert.deepEqual(await sums(q, "G"), { pt: 40000, fa: 39000 }, "되돌리면 예전 동작");
}

console.log("point-rebalance-trigger tests passed");
