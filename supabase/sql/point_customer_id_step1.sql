-- ============================================================
-- [식별 STEP 1] 포인트 테이블에 customer_id(카카오 계정 = customers.id) 기반 만들기
-- 위치: supabase/sql/point_customer_id_step1.sql
-- 작성: 2026-07-09
--
-- [목적]
--   포인트가 지금은 customer_phone(바뀔 수 있는 값)으로만 고객과 연결돼 있다.
--   고객이 번호를 바꾸면 포인트가 고아가 된다. (실제 피해 확인: 1,395P / 295P)
--   → 진짜 주인인 customers.id 로 연결할 "칸"을 먼저 만든다.
--
-- [이 파일이 하는 일]
--   1. customer_point_balances / customer_point_ledger 에 customer_id 컬럼 추가
--      (타입은 customers.id 를 직접 읽어서 맞춤 — 추정으로 박지 않음)
--   2. 지금 전화번호가 일치하는 고객으로 customer_id 채우기(백필)
--   3. 조회용 인덱스 생성
--
-- [이 파일이 하지 않는 일 — 중요]
--   * 기존 코드/RPC/트리거는 여전히 customer_phone 으로 읽고 쓴다.
--   * 따라서 실행해도 **동작이 하나도 바뀌지 않는다**. 지급·차감·적립·취소 전부 그대로.
--   * 읽기 전환은 STEP 3에서(방송 없는 날, 시뮬 검증 후).
--
-- [안전성]
--   * ADD COLUMN only + UPDATE(백필) + CREATE INDEX. 삭제·제약 변경 없음.
--   * nullable 이라 채워지지 않은 행이 있어도 아무 문제 없음.
--   * 재실행 안전(멱등): if not exists / customer_id is null 조건.
--
-- ⚠️ 실행 순서: point_phone_migration_20260709.sql (고아 2건 복구) 를 **먼저** 실행할 것.
--    그래야 백필에서 그 두 사람도 제대로 연결된다.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- [1] customer_id 컬럼 추가 (customers.id 타입을 읽어서 동일 타입으로)
-- ────────────────────────────────────────────────────────────
do $$
declare
  v_type text;
begin
  select data_type
    into v_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name  = 'customers'
     and column_name = 'id';

  if v_type is null then
    raise exception 'customers.id 컬럼을 찾을 수 없습니다. 테이블명을 확인하세요.';
  end if;

  -- information_schema 의 data_type 을 실제 선언 타입으로 변환
  v_type := case v_type
              when 'bigint'  then 'bigint'
              when 'integer' then 'integer'
              when 'smallint' then 'smallint'
              when 'uuid'    then 'uuid'
              else v_type
            end;

  execute format(
    'alter table public.customer_point_balances add column if not exists customer_id %s', v_type);
  execute format(
    'alter table public.customer_point_ledger  add column if not exists customer_id %s', v_type);

  raise notice '✅ customer_id 컬럼 추가 완료 (customers.id 타입 = %)', v_type;
end $$;


-- ────────────────────────────────────────────────────────────
-- [2] 백필 — 지금 전화번호가 일치하는 고객으로 연결
--     (이미 채워진 행은 건드리지 않음 = 멱등)
-- ────────────────────────────────────────────────────────────
update public.customer_point_balances b
   set customer_id = c.id
  from public.customers c
 where c.customer_phone = b.customer_phone
   and b.customer_id is null;

update public.customer_point_ledger l
   set customer_id = c.id
  from public.customers c
 where c.customer_phone = l.customer_phone
   and l.customer_id is null;


-- ────────────────────────────────────────────────────────────
-- [3] 인덱스 (앞으로 customer_id 로 조회할 것이므로)
-- ────────────────────────────────────────────────────────────
create index if not exists customer_point_balances_customer_id_idx
  on public.customer_point_balances (customer_id);

create index if not exists customer_point_ledger_customer_id_idx
  on public.customer_point_ledger (customer_id, created_at desc);


-- ────────────────────────────────────────────────────────────
-- [4] 검증 (읽기 전용)
--   * 아래 "미연결" 이 0 이면 완벽.
--   * 0 이 아니면: 그 행들은 지금 customers 에 없는 전화번호를 갖고 있다(=고아).
--     → point_phone_migration 으로 복구하거나, 개별 확인 필요.
-- ────────────────────────────────────────────────────────────
select '잔액' as 구분,
       count(*)                                as 전체행,
       count(customer_id)                      as 연결됨,
       count(*) - count(customer_id)           as 미연결
  from public.customer_point_balances
union all
select '이력',
       count(*),
       count(customer_id),
       count(*) - count(customer_id)
  from public.customer_point_ledger;

-- 미연결(고아) 잔액 상세 — 0줄이면 깨끗
select customer_phone, current_points, youtube_nickname, customer_name, updated_at
  from public.customer_point_balances
 where customer_id is null
   and current_points > 0
 order by current_points desc;
