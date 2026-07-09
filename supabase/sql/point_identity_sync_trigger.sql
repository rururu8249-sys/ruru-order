-- ============================================================
-- [근본 수정] 전화번호가 바뀌어도 포인트·차단이 고객을 따라가게 하는 DB 트리거
-- 위치: supabase/sql/point_identity_sync_trigger.sql
-- 작성: 2026-07-09
--
-- [원칙] 고객의 정체성 = 카카오 계정(customers row). 전화번호는 바뀔 수 있는 연락처일 뿐.
--
-- [무엇을 고치나]
--   지금까지는 customers.customer_phone 이 바뀌면
--     - customer_point_balances / customer_point_ledger 는 옛 번호에 그대로 남아 고아가 됐고
--     - customer_phone_blocks(차단)도 옛 번호에 남아 차단이 풀렸다.
--   이 트리거가 붙으면 번호가 바뀌는 순간 위 세 테이블이 자동으로 따라간다.
--
-- [설계]
--   1) trg_sync_identity_on_phone_change (customers AFTER UPDATE OF customer_phone)
--      - 포인트 이력: 번호 + customer_id 갱신
--      - 포인트 잔액: 새 번호 행이 있으면 합산 후 옛 행 삭제, 없으면 번호만 갈아끼움
--      - 차단(customer_phone_blocks): 새 번호에 이미 행이 없으면 번호 갱신 → 차단 우회 차단
--   2) trg_fill_point_customer_id_* (포인트 테이블 BEFORE INSERT)
--      - 앞으로 새로 생기는 포인트 행에 customer_id 를 자동으로 채움
--
-- [안전성]
--   * 트리거 본문은 exception 을 삼키고 WARNING 만 남긴다(return new).
--     → 트리거가 실패해도 customers 저장(=주문 제출 경로)을 절대 막지 않는다.
--       (기존 customers_address_sync_trigger.sql 과 동일한 방침)
--   * 잔액은 삭제가 아니라 합산. 이력은 지우지 않고 번호만 갱신 → 기록 보존.
--   * 멱등: 같은 번호면 아무 일도 안 함.
--   * 앱 코드 변경 없이 DB에서만 동작 (기존 지급/차감/적립/취소 RPC 무변경).
--
-- ⚠️ 선행조건: supabase/sql/point_customer_id_step1.sql 을 먼저 실행해야 함
--    (customer_id 컬럼이 있어야 이 트리거가 그 칸을 채운다)
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) 번호가 바뀌면 포인트·차단이 따라간다
-- ────────────────────────────────────────────────────────────
create or replace function public.ruru_sync_identity_on_phone_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_old text;
  v_new text;
  v_old_bal public.customer_point_balances%rowtype;
  v_new_exists boolean;
  v_stamp text := to_char(now(), 'YYYY-MM-DD');
begin
  v_old := regexp_replace(coalesce(old.customer_phone, ''), '[^0-9]', '', 'g');
  v_new := regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g');

  -- 번호가 실제로 바뀐 경우에만 동작
  if v_old = v_new or v_old = '' or v_new = '' then
    return new;
  end if;

  ---------------------------------------------------------------
  -- (a) 포인트 이력: 번호 + 주인(customer_id) 갱신 (기록은 보존)
  ---------------------------------------------------------------
  update public.customer_point_ledger
     set customer_phone = v_new,
         customer_id    = new.id
   where customer_phone = v_old;

  ---------------------------------------------------------------
  -- (b) 포인트 잔액
  ---------------------------------------------------------------
  select * into v_old_bal
    from public.customer_point_balances
   where customer_phone = v_old;

  if found then
    select exists(
      select 1 from public.customer_point_balances where customer_phone = v_new
    ) into v_new_exists;

    if v_new_exists then
      -- 새 번호에 이미 잔액이 있으면 합산 (덮어쓰기 아님)
      update public.customer_point_balances b
         set current_points        = b.current_points        + v_old_bal.current_points,
             total_granted_points  = b.total_granted_points  + v_old_bal.total_granted_points,
             total_used_points     = b.total_used_points     + v_old_bal.total_used_points,
             total_canceled_points = b.total_canceled_points + v_old_bal.total_canceled_points,
             total_adjusted_points = b.total_adjusted_points + v_old_bal.total_adjusted_points,
             customer_id           = new.id,
             updated_at            = now(),
             admin_memo            = coalesce(b.admin_memo, '')
                                     || ' [' || v_old || ' 잔액 ' || v_old_bal.current_points || 'P 합산(번호변경) ' || v_stamp || ']'
       where b.customer_phone = v_new;

      delete from public.customer_point_balances where customer_phone = v_old;
    else
      -- 새 번호에 잔액이 없으면 번호만 갈아끼움
      update public.customer_point_balances
         set customer_phone = v_new,
             customer_id    = new.id,
             updated_at     = now(),
             admin_memo     = coalesce(admin_memo, '')
                              || ' [' || v_old || ' 에서 번호변경 이관 ' || v_stamp || ']'
       where customer_phone = v_old;
    end if;
  end if;

  ---------------------------------------------------------------
  -- (c) 차단도 따라간다 → 번호만 바꿔서 차단 푸는 우회 차단
  --     새 번호에 이미 차단행이 있으면 옛 행은 그대로 둠(중복 방지)
  ---------------------------------------------------------------
  update public.customer_phone_blocks
     set phone      = v_new,
         updated_at = now()
   where phone = v_old
     and not exists (
       select 1 from public.customer_phone_blocks where phone = v_new
     );

  ---------------------------------------------------------------
  -- (d) 옛 번호로 된 주문에 kakao_id 를 찍어둔다(정체성 스탬프).
  --     * 주문의 전화번호·금액·상태는 절대 건드리지 않는다(정산/입금 이력 보존).
  --     * kakao_id 가 비어있는 주문에만 채운다.
  --     → 이 덕분에 ①1인당 구매제한이 번호 바꿔도 누적되고
  --                ②주문취소 시 옛 주문에서 현재 고객을 찾아 포인트를 복구할 수 있다.
  ---------------------------------------------------------------
  if coalesce(nullif(trim(coalesce(new.kakao_id, '')), ''), '') <> '' then
    update public.orders
       set kakao_id = new.kakao_id
     where kakao_id is null
       and regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old;
  end if;

  return new;

exception when others then
  -- 트리거 실패가 고객 저장(주문 제출)을 막으면 안 된다. 경고만 남기고 통과.
  raise warning 'ruru_sync_identity_on_phone_change 실패(고객 저장은 계속): %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_sync_identity_on_phone_change on public.customers;

create trigger trg_sync_identity_on_phone_change
after update of customer_phone on public.customers
for each row
when (old.customer_phone is distinct from new.customer_phone)
execute function public.ruru_sync_identity_on_phone_change();


-- ────────────────────────────────────────────────────────────
-- 2) 새로 생기는 포인트 행에 customer_id 자동 채우기
--    (앞으로 customer_id 가 비는 행이 안 생기게)
-- ────────────────────────────────────────────────────────────
create or replace function public.ruru_fill_point_customer_id()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.customer_id is null then
    select c.id
      into new.customer_id
      from public.customers c
     where c.customer_phone = regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g')
     limit 1;
  end if;
  return new;
exception when others then
  return new; -- 못 채워도 포인트 저장은 계속
end;
$$;

drop trigger if exists trg_fill_point_customer_id_balances on public.customer_point_balances;
create trigger trg_fill_point_customer_id_balances
before insert on public.customer_point_balances
for each row execute function public.ruru_fill_point_customer_id();

drop trigger if exists trg_fill_point_customer_id_ledger on public.customer_point_ledger;
create trigger trg_fill_point_customer_id_ledger
before insert on public.customer_point_ledger
for each row execute function public.ruru_fill_point_customer_id();


-- ────────────────────────────────────────────────────────────
-- 3) 검증 (읽기 전용) — 트리거가 붙었는지 확인
-- ────────────────────────────────────────────────────────────
select tgname as 트리거,
       relname as 테이블
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where tgname in (
   'trg_sync_identity_on_phone_change',
   'trg_fill_point_customer_id_balances',
   'trg_fill_point_customer_id_ledger'
 )
 order by relname, tgname;
