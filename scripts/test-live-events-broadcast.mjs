// [2026-11-09] supabase/sql/live_events_broadcast.sql 를 메모리 PostgreSQL(PGlite)에서 그대로 실행해 검증.
//   ① 주문 저장·상태 변경 때 소식(order)이 가고, 전화·주소·이름·금액이 안 들어가는지
//   ② realtime.send 가 실패해도 주문 저장·변경이 막히지 않는지
//   ③ 상품·방송 상품·방송 변경은 «문장 하나에 소식 하나»인지
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SQL = fs.readFileSync("supabase/sql/live_events_broadcast.sql", "utf8");

async function makeDb({ failSend = false } = {}) {
  const db = new PGlite();
  await db.exec(`
create schema realtime;
create table realtime.sent (payload jsonb, event text, topic text, private boolean);
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language plpgsql as $$ begin
  ${failSend ? "raise exception 'realtime down';" : "insert into realtime.sent values (payload, event, topic, private);"}
end $$;
create table public.orders (id bigint primary key, order_group_id text, broadcast_id text, youtube_nickname text, customer_name text,
  customer_phone text, address text, product_name text, color text, size text, qty int, product_price int, final_amount int,
  admin_order_status_v2 text, order_manage_status text, is_test_order boolean, is_deleted boolean, kakao_id text);
create table public.products (id bigint primary key, stock int);
create table public.broadcast_products (id bigint primary key, product_id bigint);
create table public.broadcasts (id bigint primary key, status text);
`);
  await db.exec(SQL);
  const q = async (s, p) => (await db.query(s, p)).rows;
  return { db, q };
}

// ① 소식 내용
{
  const { q } = await makeDb();
  await q(`insert into orders values (1,'G1','B1','핑크링','홍길동','01012345678','서울 어딘가','MC-321 패딩','블랙','1',1,89000,92000,'주문확인전','주문확인전',false,false,'k1')`);
  let sent = await q(`select * from realtime.sent`);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].event, "order");
  assert.equal(sent[0].topic, "ruru-live");
  assert.equal(sent[0].private, false);
  const p = sent[0].payload;
  assert.equal(p.type, "INSERT");
  assert.equal(p.new.youtube_nickname, "핑크링");
  assert.equal(p.new.order_group_id, "G1");
  assert.equal(p.new.color, "블랙");
  const text = JSON.stringify(p);
  for (const secret of ["홍길동", "01012345678", "서울", "92000", "k1"]) assert.ok(!text.includes(secret), `소식에 ${secret} 들어감`);

  await q(`update orders set admin_order_status_v2='자동입금확인' where id=1`);
  sent = await q(`select * from realtime.sent order by 1`);
  const up = sent.map((r) => r.payload).find((x) => x.type === "UPDATE");
  assert.equal(up.new.admin_order_status_v2, "자동입금확인");
  assert.equal(up.old.admin_order_status_v2, "주문확인전");
  console.log("① 주문 소식 · 개인정보·금액 빠짐 · 상태 전/후 OK");
}

// ② 소식 실패해도 주문은 그대로
{
  const { q } = await makeDb({ failSend: true });
  await q(`insert into orders(id, order_group_id, youtube_nickname, admin_order_status_v2) values (2,'G2','또요','주문확인전')`);
  await q(`update orders set admin_order_status_v2='수동입금확인' where id=2`);
  const r = await q(`select admin_order_status_v2 from orders where id=2`);
  assert.equal(r[0].admin_order_status_v2, "수동입금확인");
  await q(`update products set stock=stock-1 where id=999`);
  console.log("② realtime 실패해도 주문 저장·변경 정상 OK");
}

// ③ 상품·방송: 문장 하나에 소식 하나
{
  const { q } = await makeDb();
  await q(`insert into products values (1,5),(2,5),(3,5)`);
  await q(`update products set stock=stock-1`); // 3줄 바뀜
  await q(`insert into broadcasts values (1,'ON')`);
  await q(`insert into broadcast_products values (1,1)`);
  const sent = await q(`select payload from realtime.sent`);
  const tables = sent.map((r) => r.payload.table);
  assert.deepEqual(tables, ["products", "products", "broadcasts", "broadcast_products"]);
  console.log("③ 상품·방송 변경 = 문장당 소식 1개 OK");
}

console.log("live-events-broadcast: 전부 통과");
