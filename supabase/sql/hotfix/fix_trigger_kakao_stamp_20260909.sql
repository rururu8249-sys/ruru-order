-- ============================================================
-- [2026-09-09] 트리거 버그 수정 — 번호 변경 시 옛 주문에 «카톡ID 도장»이 안 찍히던 문제
--
--   실측(용서린 병합 중 발견):
--     번호를 바꿨는데 orders.kakao_id 가 한 건도 안 찍혔다.
--     원인 = 함수 마지막 블록의 조건  `where kakao_id is null`
--       그런데 orders.kakao_id 는 NULL 이 아니라 «빈 문자열('')» 로 들어 있었다.
--       (실측: id 240·255·740·1783·2332·2333 전부 length(kakao_id)=0, NULL 아님)
--     ⇒ 조건이 안 맞아 0건 업데이트. 게다가 함수 끝에 exception 블록이 있어 조용히 넘어갔다.
--     ⇒ 그동안 「📞 번호 변경」을 쓸 때마다 옛 주문의 카톡ID가 계속 비어 있었다.
--
--   고친 것: 딱 한 줄
--     where kakao_id is null            →   where coalesce(trim(kakao_id), '') = ''
--   나머지 본문은 원본 그대로다(포인트 이력·잔액 이관, 차단번호 이관 로직 무변경).
--
--   함수 속성(실측): RETURNS trigger · LANGUAGE plpgsql · SECURITY DEFINER · proconfig 없음
--   실행: Supabase SQL Editor → Run
--
--   ⚠ 되돌리려면 아래 `coalesce(trim(kakao_id), '') = ''` 를 `kakao_id is null` 로 바꿔 다시 실행.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ruru_sync_identity_on_phone_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_old text;
  v_new text;
  v_old_bal public.customer_point_balances%rowtype;
  v_new_exists boolean;
  v_stamp text := to_char(now(), 'YYYY-MM-DD');
begin
  v_old := regexp_replace(coalesce(old.customer_phone, ''), '[^0-9]', '', 'g');
  v_new := regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g');

  if v_old = v_new or v_old = '' or v_new = '' then
    return new;
  end if;

  update public.customer_point_ledger
     set customer_phone = v_new, customer_id = new.id
   where customer_phone = v_old;

  select * into v_old_bal
    from public.customer_point_balances where customer_phone = v_old;

  if found then
    select exists(select 1 from public.customer_point_balances where customer_phone = v_new)
      into v_new_exists;

    if v_new_exists then
      update public.customer_point_balances b
         set current_points        = b.current_points        + v_old_bal.current_points,
             total_granted_points  = b.total_granted_points  + v_old_bal.total_granted_points,
             total_used_points     = b.total_used_points     + v_old_bal.total_used_points,
             total_canceled_points = b.total_canceled_points + v_old_bal.total_canceled_points,
             total_adjusted_points = b.total_adjusted_points + v_old_bal.total_adjusted_points,
             customer_id           = new.id,
             updated_at            = now(),
             admin_memo            = coalesce(b.admin_memo,'') || ' [' || v_old || ' 합산(번호변경) ' || v_stamp || ']'
       where b.customer_phone = v_new;
      delete from public.customer_point_balances where customer_phone = v_old;
    else
      update public.customer_point_balances
         set customer_phone = v_new, customer_id = new.id, updated_at = now(),
             admin_memo = coalesce(admin_memo,'') || ' [' || v_old || ' 에서 번호변경 이관 ' || v_stamp || ']'
       where customer_phone = v_old;
    end if;
  end if;

  update public.customer_phone_blocks
     set phone = v_new, updated_at = now()
   where phone = v_old
     and not exists (select 1 from public.customer_phone_blocks where phone = v_new);

  -- 신규: 옛 주문에 카톡ID 스탬프 (번호·금액·상태는 안 건드림)
  -- [2026-09-09 수정] kakao_id 가 NULL 이 아니라 빈 문자열('')로 저장돼 있어 예전 조건이 0건이었다.
  if coalesce(nullif(trim(coalesce(new.kakao_id, '')), ''), '') <> '' then
    update public.orders
       set kakao_id = new.kakao_id
     where coalesce(trim(kakao_id), '') = ''
       and regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old;
  end if;

  return new;

exception when others then
  raise warning 'ruru_sync_identity_on_phone_change 실패(고객 저장은 계속): %', sqlerrm;
  return new;
end;
$function$;
