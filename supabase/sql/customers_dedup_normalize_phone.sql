-- customers_dedup_normalize_phone.sql
-- 목적(주소 버그 근본 해결 Phase 1):
--   같은 사람의 중복 customers row(전화번호 포맷 차이로 발생)를 1개로 병합하고
--   customer_phone 을 숫자만(digits-only)으로 통일한다.
--
-- 안전 근거(2026-06-16 실측):
--   - customers 883건 / 중복(같은사람) 205그룹·410row / flat주소만 789건
--   - orders.customer_id(채움 226), deposits.match_customer_id(채움 1) FK = NO ACTION
--     => cascade 삭제 없음. 삭제 전 canonical 로 repoint 하므로 주문/입금 보존.
--   - is_blocked 는 text('true'/'false'/'N'), customer_name 은 NOT NULL.
--
-- 절대 변경 안 함:
--   orders 의 금액/상태/주소 스냅샷, deposits 금액/매칭값(참조 id만 canonical 로 이동),
--   point/정산/Bankda 관련 테이블, 주문제출 RPC.
--
-- 실행 순서:
--   STAGE 0 (백업, 1회)  →  STAGE 1 (미리보기·읽기전용)  →  STAGE 2 (DO 블록, 원자적 병합)
--   →  (코드 Phase 2 배포 후) STAGE 3 (unique 제약)
--
-- ※ Supabase SQL 에디터는 문장마다 자동 커밋 → on-commit-drop temp 테이블이 사라지므로
--   STAGE 2 는 반드시 "하나의 DO 블록"으로 실행한다(한 트랜잭션 = 원자적, 실패 시 전체 롤백).
-- ============================================================================


-- ============ STAGE 0: 백업 (필수, 1회만) ============
create table if not exists customers_backup_20260616 as select * from customers;


-- ============ STAGE 1: 미리보기 (읽기전용 / 데이터 변경 없음) ============
-- 1-A) 병합/삭제 규모
with c as (
  select id, regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g') as d from customers
),
g as (select d from c where length(d) >= 10 group by d having count(*) > 1)
select
  (select count(*) from g)                                as 병합대상_그룹수,
  (select count(*) from c where d in (select d from g))   as 관련_row수,
  (select count(*) from c where d in (select d from g))
    - (select count(*) from g)                            as 삭제예정_row수;

-- 1-B) repoint 대상(삭제될 row를 참조하는 주문/입금)
with c as (select *, regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g') as d from customers),
canon as (
  select distinct on (d) d, id as canonical_id from c where length(d) >= 10
  order by d, (kakao_id is not null) desc, (btrim(coalesce(address,'')) <> '') desc,
    (case when jsonb_typeof(shipping_addresses::jsonb)='array' and jsonb_array_length(shipping_addresses::jsonb) > 0 then 1 else 0 end) desc,
    last_order_at desc nulls last, created_at asc nulls last, id asc),
victims as (select c.id from c join canon ca on ca.d = c.d where length(c.d) >= 10 and c.id <> ca.canonical_id)
select
  (select count(*) from orders   where customer_id       in (select id from victims)) as repoint_주문수,
  (select count(*) from deposits where match_customer_id in (select id from victims)) as repoint_입금수;


-- ============ STAGE 2: 실제 병합 (원자적 DO 블록 — 통째로 실행) ============
do $$
declare v_before int; v_after int; v_dup int;
begin
  select count(*) into v_before from customers;

  -- (1) 정규화 작업 스냅샷 (canonical 을 mutate 전에 미리 동결)
  create temp table _c on commit drop as
  select id, regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g') as digits,
         kakao_id, kakao_nickname, kakao_profile_image, customer_name,
         address, detail_address, zipcode, shipping_addresses, is_blocked,
         customer_memo, last_order_at, created_at
  from customers
  where length(regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')) >= 10;

  -- (2) 그룹별 살릴 row(canonical)
  create temp table _canon on commit drop as
  select distinct on (digits) digits, id as canonical_id from _c
  order by digits, (kakao_id is not null) desc, (btrim(coalesce(address,'')) <> '') desc,
    (case when jsonb_typeof(shipping_addresses::jsonb)='array' and jsonb_array_length(shipping_addresses::jsonb) > 0 then 1 else 0 end) desc,
    last_order_at desc nulls last, created_at asc nulls last, id asc;

  -- (3) 그룹별 보충 스칼라값
  create temp table _merged on commit drop as
  select digits,
    max(kakao_id) filter (where kakao_id is not null) as kakao_id,
    max(kakao_nickname) filter (where nullif(btrim(coalesce(kakao_nickname,'')),'') is not null) as kakao_nickname,
    max(kakao_profile_image) filter (where nullif(btrim(coalesce(kakao_profile_image,'')),'') is not null) as kakao_profile_image,
    max(customer_name) filter (where nullif(btrim(coalesce(customer_name,'')),'') is not null) as customer_name,
    max(customer_memo) filter (where nullif(btrim(coalesce(customer_memo,'')),'') is not null) as customer_memo,
    bool_or(lower(coalesce(is_blocked::text,'')) = 'true') as blocked_any,
    max(last_order_at) as last_order_at
  from _c group by digits;

  -- (4) 그룹별 주소 한 벌(섞임 방지)
  create temp table _addr on commit drop as
  select distinct on (digits) digits, address, detail_address, zipcode from _c
  where btrim(coalesce(address,'')) <> ''
  order by digits, last_order_at desc nulls last, created_at desc nulls last, id desc;

  -- (5) 그룹별 가장 충실한 JSON 배송지
  create temp table _ship on commit drop as
  select distinct on (digits) digits, shipping_addresses from _c
  where jsonb_typeof(shipping_addresses::jsonb)='array' and jsonb_array_length(shipping_addresses::jsonb) > 0
  order by digits, jsonb_array_length(shipping_addresses::jsonb) desc, last_order_at desc nulls last, id desc;

  -- (6) canonical 보충 (빈 칸만 / non-null 보존)
  update customers cu set
    kakao_id = coalesce(cu.kakao_id, m.kakao_id),
    kakao_nickname = coalesce(nullif(btrim(coalesce(cu.kakao_nickname,'')),''), m.kakao_nickname, cu.kakao_nickname),
    kakao_profile_image = coalesce(nullif(btrim(coalesce(cu.kakao_profile_image,'')),''), m.kakao_profile_image, cu.kakao_profile_image),
    customer_name = coalesce(nullif(btrim(coalesce(cu.customer_name,'')),''), m.customer_name, cu.customer_name),
    customer_memo = coalesce(nullif(btrim(coalesce(cu.customer_memo,'')),''), m.customer_memo, cu.customer_memo),
    is_blocked = case when m.blocked_any then 'true' else cu.is_blocked end,
    last_order_at = greatest(cu.last_order_at, m.last_order_at),
    address = case when btrim(coalesce(cu.address,'')) = '' then coalesce(a.address, cu.address) else cu.address end,
    detail_address = case when btrim(coalesce(cu.address,'')) = '' then coalesce(a.detail_address, cu.detail_address) else cu.detail_address end,
    zipcode = case when btrim(coalesce(cu.address,'')) = '' then coalesce(a.zipcode, cu.zipcode) else cu.zipcode end,
    shipping_addresses = case when jsonb_typeof(cu.shipping_addresses::jsonb)='array' and jsonb_array_length(cu.shipping_addresses::jsonb) > 0 then cu.shipping_addresses else coalesce(s.shipping_addresses, cu.shipping_addresses) end
  from _canon ca join _merged m on m.digits = ca.digits
  left join _addr a on a.digits = ca.digits left join _ship s on s.digits = ca.digits
  where cu.id = ca.canonical_id;

  -- (7) 참조 이동
  update orders o set customer_id = ca.canonical_id
  from _c c join _canon ca on ca.digits = c.digits
  where o.customer_id = c.id and c.id <> ca.canonical_id;

  update deposits d set match_customer_id = ca.canonical_id
  from _c c join _canon ca on ca.digits = c.digits
  where d.match_customer_id = c.id and c.id <> ca.canonical_id;

  -- (8) 중복 삭제
  delete from customers cu using _c c join _canon ca on ca.digits = c.digits
  where cu.id = c.id and c.id <> ca.canonical_id;

  -- (9) 전화번호 숫자만 통일
  update customers set customer_phone = regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')
  where customer_phone is distinct from regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g');

  -- (10) 검증 — 남은 중복 있으면 전체 롤백
  select count(*) into v_after from customers;
  select count(*) into v_dup from (select customer_phone from customers group by customer_phone having count(*) > 1) z;
  raise notice 'customers % -> % / 남은 중복 그룹 %', v_before, v_after, v_dup;
  if v_dup > 0 then
    raise exception '남은 중복 %건 — 전체 롤백', v_dup;
  end if;
end $$;


-- ============ STAGE 2 사후 확인 (읽기전용, 별도 실행) ============
-- select count(*) as 총customers from customers;
-- select customer_phone, count(*) from customers group by customer_phone having count(*) > 1;  -- 0행이어야 정상


-- ============ STAGE 3: unique 제약 (★ 코드 Phase 2 배포 후에만) ============
-- 주의: 제약만으로는 "하이픈 vs 숫자" 재중복을 못 막는다(문자열이 다르므로).
--       클라이언트가 숫자만으로 쓰도록 고친(Phase 2) 다음에 추가해야 재발 방지가 완성됨.
--   select customer_phone, count(*) from customers group by customer_phone having count(*)>1;  -- 0행 확인 후
-- alter table customers add constraint customers_customer_phone_key unique (customer_phone);
