// [㉟ 2026-10-18] supabase/sql/hotfix/piv_alias_guard_v2_20261018.sql 를 메모리 PostgreSQL(PGlite)에서 그대로 실행해 검증.
//   라이브와 같은 모양의 products / product_inventory_variants + products→PIV 재구성 트리거 + 08-13 가드(v1)를 만든 뒤
//   실제 데이터 모양(616·699·766)과 경계 사례로 시드 → 파일 실행 → 결과·재고 총합·RPC 흐름 확인. 실 DB 는 건드리지 않음.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;

await db.exec(`
create table public.products (id bigint primary key, product_name text, status text, product_note text, stock integer, is_soldout boolean);
create table public.product_inventory_variants (
  id bigserial primary key, product_id bigint not null, color text not null default '', size text not null default '',
  stock integer not null default 0 check (stock >= 0), updated_at timestamptz default now(),
  unique (product_id, color, size));
create or replace function public.ruru_try_parse_jsonb(p_text text) returns jsonb language plpgsql immutable as $$
begin
  if p_text is null or trim(p_text) = '' then return '{}'::jsonb; end if;
  return p_text::jsonb;
exception when others then return '{}'::jsonb;
end; $$;
`);
// 라이브와 같은 products→PIV 재구성 트리거(inventory_auto_deduct_rpc.sql 106~172 그대로)
const auto = fs.readFileSync("supabase/sql/inventory_auto_deduct_rpc.sql", "utf8");
const syncFn = auto.slice(auto.indexOf("create or replace function public.ruru_sync_product_inventory_variants()"), auto.indexOf("drop trigger if exists ruru_products_inventory_variants_sync_trg"));
await db.exec(syncFn);
await db.exec(`create trigger ruru_products_inventory_variants_sync_trg after insert or update of product_note on public.products
  for each row execute function public.ruru_sync_product_inventory_variants();`);
// 08-13 가드(v1) 함수·트리거만 설치(그 파일의 [2] 블록)
const v1 = fs.readFileSync("supabase/sql/hotfix/fix_ghost_variant_alias_20260813.sql", "utf8");
await db.exec(v1.slice(v1.indexOf("create or replace function public.ruru_piv_none_alias_guard()"), v1.indexOf("-- ── [3] 실행 결과 확인")));

const note = (rows) => JSON.stringify({ stock_management_enabled: true, stock_mode: "option", stock_variants: rows });
const seed = [
  // 616 종이방향제 — 실데이터 모양(그룹1 둘 다 재고 → 보존, 그룹2 '' 0 → 삭제)
  [616, note([
    { size: "", color: "딥티크 종이방향제7종1세트(랜덤향)", stock: 1 },
    { size: "없음", color: "딥티크 종이방향제7종1세트(랜덤향)", stock: 9998 },
    { size: "", color: "딥티크 종이방향제7종1세트(랜덤향) / 없음", stock: 0 },
    { size: "없음", color: "딥티크 종이방향제7종1세트(랜덤향) / 없음", stock: 9997 },
  ])],
  // 699 나이키 바람막이 — 정리 전 모양('' M 0 유령이 맨 앞)
  [699, note([
    { size: "M", color: "", stock: 0, manual_soldout: false },
    { size: "M", color: "없음", stock: 10, manual_soldout: false },
    { size: "S", color: "없음", stock: 1, manual_soldout: false },
  ])],
  // 766 알로 부츠컷팬츠 — 중복 없음(무변경이어야)
  [766, note([
    { size: "L", color: "없음", stock: 1, manual_soldout: false },
    { size: "S", color: "없음", stock: 0, manual_soldout: true },
  ])],
  // 900 전부 0 중복 → 하나('없음' 이름)만 남김
  [900, note([{ size: "M", color: "", stock: 0 }, { size: "M", color: "없음", stock: 0 }])],
  // 901 지울 0줄이 manual_soldout=true → 보류(무변경)
  [901, note([{ size: "M", color: "", stock: 0, manual_soldout: true }, { size: "M", color: "없음", stock: 5 }])],
  // 902 실값 두 축(향수 세부상품) — 무변경
  [902, note([{ size: "50ml", color: "블랑쉬", stock: 3 }, { size: "100ml", color: "블랑쉬", stock: 2 }])],
];
for (const [id, n] of seed) await q(`insert into public.products (id, product_name, status, product_note) values ($1, $2, '판매중', $3)`, [id, `상품${id}`, n]);

const sv = async (id) => JSON.parse((await q(`select product_note from public.products where id = $1`, [id]))[0].product_note).stock_variants;
const piv = async (id) => q(`select color, size, stock from public.product_inventory_variants where product_id = $1 order by color, size`, [id]);
const sumPiv = async () => Number((await q(`select coalesce(sum(stock),0) s from public.product_inventory_variants`))[0].s);

// 시드 직후: v1 가드는 한 축만 없음인 699 를 못 막아 PIV 에도 '' M 0 이 따로 있다
assert.equal((await piv(699)).length, 3, "before: 699 PIV has ghost row");
const totalBefore = await sumPiv();

// 파일 그대로 실행
const sql = fs.readFileSync("supabase/sql/hotfix/piv_alias_guard_v2_20261018.sql", "utf8");
const notices = [];
const results = await db.exec(sql, { onNotice: (n) => notices.push(n.message) });
const flatRows = results.flatMap((r) => r.rows || []);

// 1) 재고 총합 불변
assert.equal(await sumPiv(), totalBefore, "PIV total stock unchanged");

// 2) 699: '' M 0 줄만 사라짐
assert.deepEqual((await sv(699)).map((r) => [r.color, r.size, r.stock]), [["없음", "M", 10], ["없음", "S", 1]]);
assert.deepEqual((await piv(699)).map((r) => [r.color, r.size, r.stock]), [["없음", "M", 10], ["없음", "S", 1]]);

// 3) 616: 그룹1(둘 다 재고) 보존, 그룹2 '' 0 줄만 삭제
assert.deepEqual((await sv(616)).map((r) => [r.color, r.size, r.stock]), [
  ["딥티크 종이방향제7종1세트(랜덤향)", "", 1],
  ["딥티크 종이방향제7종1세트(랜덤향)", "없음", 9998],
  ["딥티크 종이방향제7종1세트(랜덤향) / 없음", "없음", 9997],
]);
assert.equal((await piv(616)).length, 3);

// 4) 766·902 무변경, 900 은 '없음' 이름 하나만, 901 은 manual_soldout 보류
assert.equal((await sv(766)).length, 2);
assert.equal((await sv(766))[1].manual_soldout, true);
assert.equal((await sv(902)).length, 2);
assert.deepEqual((await sv(900)).map((r) => [r.color, r.size, r.stock]), [["없음", "M", 0]]);
assert.equal((await sv(901)).length, 2, "manual_soldout group left alone");

// 5) 남은 중복 목록에 616 그룹1·901 이 보고됨
const remaining = flatRows.filter((r) => r["항목"] === "note 남은 중복(손대지 않음)").map((r) => Number(r.product_id));
assert.ok(remaining.includes(616) && remaining.includes(901), `remaining list ${remaining}`);

// 6) 백업 테이블에 note 원문·지운 PIV 행이 남음
assert.ok(Number((await q(`select count(*) c from public.ruru_alias_cleanup_backup_20261018 where kind = 'note'`))[0].c) >= 3);

// 7) 가드 v2 설치·자가 시뮬레이션 PASS(파일의 [6], rollback 이라 데이터 무변경)
const fn = (await q(`select prosrc from pg_proc where proname = 'ruru_piv_none_alias_guard'`))[0].prosrc;
assert.ok(fn.includes("ruru_piv_alias_guard_v2"));
assert.ok(notices.some((m) => String(m).startsWith("PASS")), `self-simulation PASS notice: ${JSON.stringify(notices)}`);
assert.equal(await sumPiv(), totalBefore, "simulation rolled back");

// 8) RPC 흐름 재현(관리자 재고연동 상품수정·취소복구와 같은 문장): '' M 0 insert → 새 행 없음, 정확일치 조회로 진짜 재고 행
await db.exec(`insert into public.product_inventory_variants (product_id, color, size, stock) values (699, '', 'M', 0) on conflict (product_id, color, size) do nothing;`);
let rows699 = await piv(699);
assert.equal(rows699.length, 2, "no ghost row created");
const exact = await q(`select stock from public.product_inventory_variants where product_id = 699 and color = '' and size = 'M'`);
assert.deepEqual(exact.map((r) => r.stock), [10], "exact lookup finds the real stock row");

// 9) 유령(0) 위에 실재고가 들어오면 교체(총합 = 들어온 값), 둘 다 재고면 지금처럼 새 행
await q(`insert into public.products (id, product_name, status, product_note) values (903, 'x', '판매중', $1)`, [note([{ size: "M", color: "없음", stock: 0 }])]);
await db.exec(`insert into public.product_inventory_variants (product_id, color, size, stock) values (903, '', 'M', 4) on conflict do nothing;`);
assert.deepEqual((await piv(903)).map((r) => [r.color, r.size, r.stock]), [["", "M", 4]]);
await db.exec(`insert into public.product_inventory_variants (product_id, color, size, stock) values (903, '없음', 'M', 2) on conflict do nothing;`);
assert.equal((await piv(903)).length, 2, "both positive → unchanged behavior (new row)");

// 10) 08-13 규칙(두 축 다 빈값) 그대로: 이름 맞추고 재고 더함
await q(`insert into public.products (id, product_name, status, product_note) values (904, 'y', '판매중', $1)`, [note([{ size: "없음", color: "없음", stock: 7 }])]);
await db.exec(`insert into public.product_inventory_variants (product_id, color, size, stock) values (904, '', '', 0) on conflict do nothing;`);
assert.deepEqual((await piv(904)).map((r) => [r.color, r.size, r.stock]), [["", "", 7]]);

// 11) 원복 파일: v1 함수로 돌아가고 699 note 가 백업 원문으로 복원됨
const rb = fs.readFileSync("supabase/sql/hotfix/piv_alias_guard_v2_rollback_20261018.sql", "utf8");
// 기본은 데이터 되살리기 꺼짐 — 테스트에서는 켜서 [2]까지 검증
assert.ok(rb.includes("restore_data boolean := false;"));
const rbOn = rb.replace("restore_data boolean := false;", "restore_data boolean := true;");
await db.exec(rbOn);
const fnAfter = (await q(`select prosrc from pg_proc where proname = 'ruru_piv_none_alias_guard'`))[0].prosrc;
assert.ok(!fnAfter.includes("ruru_piv_alias_guard_v2"), "rollback restores v1 function");
assert.equal((await sv(699)).length, 3, "rollback restores 699 note from backup");

await db.close();
console.log("piv alias guard v2 sql passed");
