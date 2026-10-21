// [a2-3 2026-10-21] supabase/sql/orders_cost_snapshot_trigger_20261021.sql 를 메모리 PostgreSQL(PGlite)에서 그대로 실행해 검증.
//   단품 / 연결 세부상품 / 옛 방식 세부상품 / 원가 없음 / 직접입력 / 깨진 note / 호출 쪽이 넣은 값 보존. 실 DB 는 건드리지 않음.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;

await db.exec(`
create table public.products (id bigint primary key, product_name text, product_note text);
create table public.product_brand_links (source_id bigint primary key, parent_id bigint not null, detail_name text not null);
create table public.orders (id bigserial primary key, product_id bigint, product_name text, qty integer, total_price integer, final_amount integer);
create or replace function public.ruru_try_parse_jsonb(p_text text) returns jsonb language plpgsql immutable as $$
begin
  if p_text is null or trim(p_text) = '' then return '{}'::jsonb; end if;
  return p_text::jsonb;
exception when others then return '{}'::jsonb;
end; $$;
`);

const sql = fs.readFileSync("supabase/sql/orders_cost_snapshot_trigger_20261021.sql", "utf8");
// STAGE 3 확인 SELECT(information_schema 등)는 빼고 STAGE 1·2 만 실행
await db.exec(sql.slice(0, sql.indexOf("-- ============ STAGE 3")));

await db.exec(`
insert into public.products values
 (1,'단품 A','{"cost_price":12000}'),
 (2,'단품 B 원가없음','{"stock_mode":"total"}'),
 (3,'브랜드 부모','{"brand_group":{"enabled":true},"cost_by_detail":{"옛 세부":7000}}'),
 (4,'연결 원래상품','{"cost_price":5500}'),
 (5,'깨진 note','{not json'),
 (6,'문자 원가','{"cost_price":"abc"}');
insert into public.product_brand_links values (4,3,'연결 세부');
insert into public.orders (product_id, product_name, qty, total_price, final_amount) values
 (1,'단품 A',2,30000,30000),
 (2,'단품 B 원가없음',1,10000,10000),
 (3,'연결 세부',1,40000,40000),
 (3,'옛 세부',3,60000,60000),
 (3,'없는 세부',1,1000,1000),
 (null,'직접입력 상품',1,5000,5000),
 (5,'깨진 note',1,1,1),
 (6,'문자 원가',1,1,1);
insert into public.orders (product_id, product_name, qty, total_price, final_amount, cost_price_snapshot) values (1,'단품 A',1,15000,15000,999);
`);
const rows = await q("select product_name, qty, total_price, final_amount, cost_price_snapshot from public.orders order by id");
const snap = Object.fromEntries(rows.map((r) => [r.product_name + "#" + r.qty, r.cost_price_snapshot]));
assert.equal(snap["단품 A#2"], 12000, "단품 원가 복사");
assert.equal(snap["단품 B 원가없음#1"], null, "원가 없으면 null");
assert.equal(snap["연결 세부#1"], 5500, "연결 세부상품 → 원래 상품 원가");
assert.equal(snap["옛 세부#3"], 7000, "옛 방식 세부상품 → cost_by_detail");
assert.equal(snap["없는 세부#1"], null, "모르는 세부상품은 null");
assert.equal(snap["직접입력 상품#1"], null, "직접입력(product_id null) null");
assert.equal(snap["깨진 note#1"], null, "깨진 note 는 삼키고 null");
assert.equal(snap["문자 원가#1"], null, "숫자 아닌 원가는 무시");
assert.equal(snap["단품 A#1"], 999, "호출 쪽이 넣은 값은 보존");
// 돈 컬럼은 손대지 않음
for (const r of rows) assert.equal(r.total_price, r.final_amount, "돈 컬럼 무변경");
// 원가를 나중에 바꿔도 과거 스냅샷 불변
await db.exec(`update public.products set product_note='{"cost_price":99999}' where id=1`);
assert.equal((await q("select cost_price_snapshot from public.orders where id=1"))[0].cost_price_snapshot, 12000, "스냅샷 불변");
// 정산 계산(앱과 같은 식): Σ qty × snapshot, 없는 줄은 제외·건수만
const cost = rows.filter((r) => r.cost_price_snapshot != null).reduce((s, r) => s + r.qty * r.cost_price_snapshot, 0);
assert.equal(cost, 2 * 12000 + 5500 + 3 * 7000 + 999);
assert.equal(rows.filter((r) => r.cost_price_snapshot == null).length, 5);
console.log("PASS order cost snapshot trigger: 단품·연결 세부·옛 세부·없음·직접입력·깨진 note·보존·불변");
