-- ============================================================================
-- products / broadcasts / broadcast_products — RLS 잠금 (2026-07-08)
-- ============================================================================
-- 목적(보안): anon(공개) 키로 이 3개 테이블을 쓰기/삭제하던 취약점(rls_disabled_in_public) 차단.
--   - 쓰기(insert/update/delete/upsert)는 이미 서버로 이전됨:
--       /api/admin-live/catalog-write  (관리자 인증 + service_role)
--   - 읽기(SELECT)는 고객/관리자 브라우저가 계속 anon 으로 하므로 SELECT 정책만 허용.
--   - service_role(서버)은 RLS 를 우회하므로 관리자 상품/방송 관리는 정상 동작.
--
-- ▶ ⚠️ 실행 순서(중요): 반드시 아래를 먼저 끝낸 뒤 이 SQL 을 실행하세요.
--     1) 코드 배포(쓰기 서버 이전분) 완료
--     2) 관리자 상품/방송 관리 기능 테스트 통과(등록·수정·재고·삭제·방송시작/종료·방송상품·고정 등)
--   순서를 어기면 상품/방송 관리가 잠깐 막힐 수 있음.
--
-- ▶ 돈/입금/정산/포인트/재고/주문 로직과 무관 — 상품·방송 카탈로그 접근 제어 전용.
-- ▶ 재실행 안전(정책은 drop-if-exists 후 재생성).
-- ============================================================================

alter table public.products            enable row level security;
alter table public.broadcasts          enable row level security;
alter table public.broadcast_products  enable row level security;

-- 읽기만 공개(상품/방송은 고객이 보는 공개 카탈로그). 쓰기 정책은 만들지 않음 = anon 쓰기 차단.
drop policy if exists "public read products"           on public.products;
drop policy if exists "public read broadcasts"         on public.broadcasts;
drop policy if exists "public read broadcast_products" on public.broadcast_products;

create policy "public read products"           on public.products           for select using (true);
create policy "public read broadcasts"         on public.broadcasts         for select using (true);
create policy "public read broadcast_products" on public.broadcast_products for select using (true);

-- 확인용(선택): 정책·RLS 상태
-- select tablename, rowsecurity from pg_tables where schemaname='public'
--   and tablename in ('products','broadcasts','broadcast_products');
