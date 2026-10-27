// [2026-10-27] supabase/sql/hotfix/option_rename_guard_20261027.sql 를 메모리 PostgreSQL(PGlite)에서 그대로 실행해 검증.
//   repo 의 재고 RPC 3개(수정·삭제·취소복구) + products→PIV 재구성 트리거 + PIV→note 역동기화(스텁)를 만들고
//   꼼데 가디건(차콜 핑크셔츠 → 차콜 핑크하트) 상황을 재현: 패치 전엔 유령 줄이 생기고, 패치 후엔 안 생기는지.
//   옵션이 있는 주문(정상 경로)은 패치 전후 결과가 같은지도 확인. 실 DB 무접촉.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function makeDb() {
  const db = new PGlite();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  await db.exec(`
create role anon; create role authenticated;
create table public.products (id bigint primary key, product_name text, status text, product_note text, stock integer, is_soldout boolean);
create table public.product_inventory_variants (
  id bigserial primary key, product_id bigint not null, color text not null default '', size text not null default '',
  stock integer not null default 0 check (stock >= 0), updated_at timestamptz default now(), unique (product_id, color, size));
create table public.inventory_ledger (id uuid primary key default gen_random_uuid(), product_id bigint, color text, size text, change_qty int,
  reason text, order_id bigint, order_group_id text, before_stock int, after_stock int, memo text, created_at timestamptz default now());
create table public.orders (
  id bigint primary key, order_group_id text, product_id bigint, product_name text, color text, size text, qty int,
  product_price int, adjusted_product_price int, shipping_fee int, adjusted_shipping_fee int, vat_amount int,
  total_price int, adjusted_total_price int, final_amount int, memo text, item_change_history jsonb,
  order_manage_status text, admin_order_status_v2 text, order_status text, admin_status text,
  inventory_deduction_status text, inventory_deducted_at timestamptz, inventory_ledger_id uuid, inventory_deduction_memo text,
  inventory_restored_at timestamptz, inventory_restore_ledger_id uuid, inventory_restore_status text, inventory_restore_memo text,
  point_used_amount int, point_used_at timestamptz, point_balance_before int, point_balance_after int, point_original_amount int,
  point_refund_ledger_id uuid, point_refunded_amount int, point_refunded_at timestamptz, updated_at timestamptz,
  customer_phone text, kakao_id text, is_deleted boolean);
create or replace function public.ruru_try_parse_jsonb(p_text text) returns jsonb language plpgsql immutable as $$
begin if p_text is null or trim(p_text) = '' then return '{}'::jsonb; end if; return p_text::jsonb;
exception when others then return '{}'::jsonb; end; $$;
create or replace function public.ruru_norm_option(p text) returns text language sql immutable as $n$
  select case when btrim(coalesce(p, '')) in ('', '없음') then '' else regexp_replace(btrim(coalesce(p, '')), '\\s*/\\s*없음\\s*$', '') end $n$;
-- 라이브 역동기화 함수 스텁: PIV 숫자를 note 로 옮기고, note 에 없는 PIV 줄은 뒤에 붙인다(10/26 실제 증상과 같음)
create or replace function public.ruru_sync_product_stock_note_from_variants(p_product_id bigint) returns void language plpgsql as $$
declare v_note jsonb; v_arr jsonb := '[]'::jsonb; e jsonb; r record;
begin
  select public.ruru_try_parse_jsonb(product_note) into v_note from public.products where id = p_product_id;
  for e in select * from jsonb_array_elements(coalesce(v_note->'stock_variants', '[]'::jsonb)) loop
    select stock into r from public.product_inventory_variants where product_id = p_product_id and color = coalesce(e->>'color','') and size = coalesce(e->>'size','');
    v_arr := v_arr || jsonb_build_array(e || jsonb_build_object('stock', coalesce(r.stock, (e->>'stock')::int)));
  end loop;
  for r in select color, size, stock from public.product_inventory_variants v where product_id = p_product_id
      and not exists (select 1 from jsonb_array_elements(coalesce(v_note->'stock_variants','[]'::jsonb)) x where coalesce(x->>'color','') = v.color and coalesce(x->>'size','') = v.size) loop
    v_arr := v_arr || jsonb_build_array(jsonb_build_object('color', r.color, 'size', r.size, 'stock', r.stock));
  end loop;
  update public.products set product_note = (v_note || jsonb_build_object('stock_variants', v_arr))::text where id = p_product_id;
end; $$;
`);
  const auto = fs.readFileSync("supabase/sql/inventory_auto_deduct_rpc.sql", "utf8");
  await db.exec(auto.slice(auto.indexOf("create or replace function public.ruru_sync_product_inventory_variants()"), auto.indexOf("drop trigger if exists ruru_products_inventory_variants_sync_trg")));
  await db.exec(`create trigger ruru_products_inventory_variants_sync_trg after insert or update of product_note on public.products
    for each row execute function public.ruru_sync_product_inventory_variants();`);
  const body = (file, start) => { const t = fs.readFileSync(file, "utf8"); const i = t.indexOf(start); return t.slice(i, t.indexOf("$function$;", i) + "$function$;".length); };
  await db.exec(body("supabase/sql/admin_update_inventory_linked_order_item_rpc.sql", "CREATE OR REPLACE FUNCTION public.admin_update_inventory_linked_order_item"));
  await db.exec(body("supabase/sql/admin_delete_order_item_rpc.sql", "create or replace function public.admin_delete_order_item("));
  await db.exec(body("supabase/sql/order_inventory_restore_on_cancel.sql", "create or replace function public.restore_order_inventory("));
  return { db, q };
}

const NOTE = (variants, extra = {}) => JSON.stringify({ stock_management_enabled: true, stock_mode: "option", stock_variants: variants, ...extra });
// 이름 바꾼 뒤 상태: 셔츠는 상품에 없음, 핑크하트 M 2 / S 2
const HEART = [
  { color: "블랙 핑크하트", size: "M", stock: 3 },
  { color: "차콜 핑크하트", size: "M", stock: 2 },
  { color: "차콜 핑크하트", size: "S", stock: 2 },
];

async function seed(q, noteExtra = {}) {
  await q(`insert into public.products (id, product_name, status, product_note) values (793, '꼼데 가디건', '판매중', $1)`, [NOTE(HEART, noteExtra)]);
  const order = (id, group, color, size) => q(`insert into public.orders (id, order_group_id, product_id, product_name, color, size, qty, product_price,
     adjusted_product_price, shipping_fee, vat_amount, total_price, adjusted_total_price, final_amount, inventory_deduction_status, inventory_deducted_at)
     values ($1, $2, 793, '꼼데 가디건', $3, $4, 1, 55000, 55000, 0, 0, 55000, 55000, 55000, 'deducted_option', now())`, [id, group, color, size]);
  await order(1, "G1", "차콜 핑크셔츠", "M"); // 옛 이름 주문
  await order(2, "G1", "블랙 핑크하트", "M"); // 같은 묶음 정상 주문
  await order(3, "G3", "차콜 핑크셔츠", "S"); // 옛 이름 주문(취소용)
  await order(4, "G3", "차콜 핑크하트", "S"); // 정상 주문(취소용)
}
const ghosts = async (q) => (await q(`select color, size, stock from public.product_inventory_variants where color like '%셔츠%'`));
const noteGhosts = async (q) => JSON.parse((await q(`select product_note from public.products where id = 793`))[0].product_note).stock_variants.filter((v) => v.color.includes("셔츠"));
const stock = async (q, color, size) => Number((await q(`select stock from public.product_inventory_variants where product_id = 793 and color = $1 and size = $2`, [color, size]))[0]?.stock ?? -1);
const edit = (q, id, color, size) => q(`select public.admin_update_inventory_linked_order_item($1, '꼼데 가디건', $2, $3, 1, 55000) r`, [id, color, size]);

// ── 패치 전: 10/26 증상 재현 ──
{
  const { q } = await makeDb();
  await seed(q);
  await edit(q, 1, "차콜 핑크하트", "M");
  assert.deepEqual((await ghosts(q)).map((g) => [g.color, g.size, g.stock]), [["차콜 핑크셔츠", "M", 1]], "패치 전: 유령 줄 생김");
  assert.equal((await noteGhosts(q)).length, 1, "패치 전: 손님 화면(note)에도 셔츠 칩");
  console.log("패치 전 재현 OK");
}

// ── 패치 후 ──
const sql = fs.readFileSync("supabase/sql/hotfix/option_rename_guard_20261027.sql", "utf8");
{
  const { db, q } = await makeDb();
  await seed(q);
  const res = await db.exec(sql);
  const applied = res.flatMap((r) => r.rows || []).filter((r) => "applied" in r);
  assert.deepEqual(applied.map((r) => r.applied), [true, true, true], "세 함수 모두 적용");
  assert.equal((await q(`select count(*)::int c from public.ruru_fn_backup_20261027`))[0].c, 3, "원문 백업 3개");

  // 1) 셔츠 주문 → 핑크하트로 수정: 유령 줄 없음, 핑크하트 M 재고 그대로(같은 물건 이름만 바뀜)
  const before = await stock(q, "차콜 핑크하트", "M");
  await edit(q, 1, "차콜 핑크하트", "M");
  assert.deepEqual(await ghosts(q), [], "수정해도 유령 줄 없음");
  assert.equal((await noteGhosts(q)).length, 0, "손님 화면 셔츠 칩 없음");
  assert.equal(await stock(q, "차콜 핑크하트", "M"), before, "핑크하트 M 재고 그대로");
  const o1 = (await q(`select color, size, inventory_deduction_status from public.orders where id = 1`))[0];
  assert.deepEqual([o1.color, o1.size, o1.inventory_deduction_status], ["차콜 핑크하트", "M", "deducted_option"]);

  // 2) 정상 주문 옵션 변경(블랙 M → 차콜 S): 지금과 같은 결과(블랙 +1, 차콜 S −1)
  const bM = await stock(q, "블랙 핑크하트", "M"); const cS = await stock(q, "차콜 핑크하트", "S");
  await edit(q, 2, "차콜 핑크하트", "S");
  assert.equal(await stock(q, "블랙 핑크하트", "M"), bM + 1);
  assert.equal(await stock(q, "차콜 핑크하트", "S"), cS - 1);

  // 3) 없는 옵션으로 바꾸기 → 거절, 아무것도 안 바뀜
  await assert.rejects(edit(q, 2, "차콜 핑크셔츠", "S"), /새 옵션 재고를 찾을 수 없습니다|지금 상품에 없어요/);
  assert.deepEqual(await ghosts(q), []);

  // 4) 주문서 취소: 셔츠 줄은 건너뜀(유령 없음), 같은 묶음 핑크하트 줄은 정상 복구
  const cS2 = await stock(q, "차콜 핑크하트", "S");
  const r = (await q(`select public.restore_order_inventory(array[3,4]::bigint[], 'restore') r`))[0].r;
  assert.equal(r.restored_count, 1); assert.equal(r.skipped_count, 1);
  assert.equal(await stock(q, "차콜 핑크하트", "S"), cS2 + 1, "정상 줄 복구");
  assert.deepEqual(await ghosts(q), [], "취소해도 유령 줄 없음");
  // 취소해제 재차감도 같은 규칙(정상 줄만)
  const r2 = (await q(`select public.restore_order_inventory(array[3,4]::bigint[], 'deduct') r`))[0].r;
  assert.equal(r2.rededucted_count, 1);
  assert.equal(await stock(q, "차콜 핑크하트", "S"), cS2);
  assert.deepEqual(await ghosts(q), []);

  // 5) 주문상품 삭제: 셔츠 줄은 거절(안내) + 유령 없음
  await q(`update public.orders set color = '차콜 핑크셔츠', size = 'M' where id = 2`);
  await assert.rejects(q(`select public.admin_delete_order_item(2)`), /지금 상품에 없어요/);
  assert.deepEqual(await ghosts(q), []);

  // 6) 다시 실행해도 안전(이미 적용 → 건너뜀)
  await db.exec(sql);
  console.log("패치 후 OK");
}

// ── 이름 바꿈 기록(option_renames)이 있으면 옛 이름 주문도 지금 이름 줄로 정상 처리 ──
{
  const { db, q } = await makeDb();
  await seed(q, { option_renames: [
    { from_color: "차콜 핑크셔츠", from_size: "M", to_color: "차콜 핑크하트", to_size: "M" },
    { from_color: "차콜 핑크셔츠", from_size: "S", to_color: "차콜 핑크하트", to_size: "S" },
  ] });
  await db.exec(sql);
  // 취소: 셔츠 S 주문 재고가 핑크하트 S 로 돌아감
  const s = await stock(q, "차콜 핑크하트", "S");
  const r = (await q(`select public.restore_order_inventory(array[3]::bigint[], 'restore') r`))[0].r;
  assert.equal(r.restored_count, 1);
  assert.equal(await stock(q, "차콜 핑크하트", "S"), s + 1);
  assert.deepEqual(await ghosts(q), []);
  // 삭제: 셔츠 M 주문 → 핑크하트 M 으로 복구 후 삭제
  const m = await stock(q, "차콜 핑크하트", "M");
  await q(`select public.admin_delete_order_item(1)`);
  assert.equal(await stock(q, "차콜 핑크하트", "M"), m + 1);
  assert.deepEqual(await ghosts(q), []);
  // 수정: 셔츠 S(취소 복구된 줄은 수정 불가라 새 주문으로) → 핑크하트 S: 재고 그대로
  await q(`insert into public.orders (id, order_group_id, product_id, product_name, color, size, qty, product_price, adjusted_product_price, shipping_fee, vat_amount, total_price, adjusted_total_price, final_amount, inventory_deduction_status, inventory_deducted_at)
    values (5, 'G5', 793, '꼼데 가디건', '차콜 핑크셔츠', 'S', 1, 55000, 55000, 0, 0, 55000, 55000, 55000, 'deducted_option', now()), (6, 'G5', 793, '꼼데 가디건', '블랙 핑크하트', 'M', 1, 55000, 55000, 0, 0, 55000, 55000, 55000, 'deducted_option', now())`);
  const s2 = await stock(q, "차콜 핑크하트", "S");
  await edit(q, 5, "차콜 핑크하트", "S");
  assert.equal(await stock(q, "차콜 핑크하트", "S"), s2);
  assert.deepEqual(await ghosts(q), []);
  console.log("이름 바꿈 기록 OK");
}

// ── 되돌리기 ──
{
  const { db, q } = await makeDb();
  await seed(q);
  await db.exec(sql);
  await db.exec(fs.readFileSync("supabase/sql/hotfix/option_rename_guard_rollback_20261027.sql", "utf8"));
  await edit(q, 1, "차콜 핑크하트", "M");
  assert.equal((await ghosts(q)).length, 1, "되돌리면 예전 동작");
  console.log("되돌리기 OK");
}

// ── 꼼데 정리 SQL: 패치 전 유령 줄 생긴 상태 → 가드 패치 → 합치기 ──
{
  const { db, q } = await makeDb();
  await seed(q);
  await edit(q, 1, "차콜 핑크하트", "M"); // 패치 전: 셔츠 M 유령 +1, 하트 M −1
  assert.equal((await noteGhosts(q)).length, 1);
  const total = Number((await q(`select sum(stock)::int s from public.product_inventory_variants where product_id = 793`))[0].s);
  const heartM = await stock(q, "차콜 핑크하트", "M");
  await db.exec(sql);
  await db.exec(fs.readFileSync("supabase/sql/hotfix/comme_cardigan_merge_shirt_20261027.sql", "utf8"));
  assert.deepEqual(await ghosts(q), [], "합친 뒤 셔츠 줄 없음");
  assert.equal((await noteGhosts(q)).length, 0);
  assert.equal(await stock(q, "차콜 핑크하트", "M"), heartM + 1, "셔츠 재고가 하트로");
  assert.equal(Number((await q(`select sum(stock)::int s from public.product_inventory_variants where product_id = 793`))[0].s), total, "총합 그대로");
  const ren = JSON.parse((await q(`select product_note from public.products where id = 793`))[0].product_note).option_renames;
  assert.deepEqual(ren.map((r) => [r.from_color, r.from_size, r.to_color]).sort(), [["차콜 핑크셔츠", "M", "차콜 핑크하트"], ["차콜 핑크셔츠", "S", "차콜 핑크하트"]]);
  // 남은 셔츠 S 주문 취소 → 하트 S 로 복구, 유령 없음
  const s = await stock(q, "차콜 핑크하트", "S");
  await q(`select public.restore_order_inventory(array[3]::bigint[], 'restore')`);
  assert.equal(await stock(q, "차콜 핑크하트", "S"), s + 1);
  assert.deepEqual(await ghosts(q), []);
  // 다시 돌려도 할 일 없음
  await db.exec(fs.readFileSync("supabase/sql/hotfix/comme_cardigan_merge_shirt_20261027.sql", "utf8"));
  console.log("꼼데 정리 OK");
}
console.log("test-option-rename-guard OK");
