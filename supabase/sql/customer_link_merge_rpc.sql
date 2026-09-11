-- ============================================================
-- [2026-09-09] 계정 연결 «2단계» — [합치기] 한 번으로 병합하는 함수
--   ★ 운영 DB 실행 완료 (함수생김 1 · 백업표생김 1)
--   ★ 미리보기 검수 완료 — 용서린(id 91)으로 dry_run:
--       미리보기 주문 6 = 실제 6 · 미리보기 포인트 3,450 = 실제 3,450 · 백업줄수 0(아무것도 안 씀)
--     검수용 가짜 요청은 지웠다(요청줄수 0).
--
--   왜 함수(RPC)로 만드나
--     병합은 단계가 7개다. PostgREST 로 7번 나눠 쏘면 «중간에 실패»했을 때
--     반쪽만 옮겨진 채로 남는다 — 그게 돈 사고다.
--     함수 안이면 전부 «한 트랜잭션»이라 실패하면 통째로 되돌아간다.
--
--   순서가 왜 이런가 (2026-09-09 용서린 병합에서 실제로 돌려 검증한 순서)
--     트리거 ruru_sync_identity_on_phone_change 는 customers.customer_phone 이 바뀔 때 돌면서
--       · customer_point_ledger   → 새 번호 + customer_id 갱신   ✅ 확인함
--       · customer_point_balances → 새 번호로 이관(있으면 합산)   ✅ 확인함
--       · customer_phone_blocks   → 새 번호                      ✅ 확인함
--       · orders.kakao_id         → new.kakao_id 가 «이미» 있을 때만 도장  ✅ 확인함
--     트리거가 «안» 하는 것 (2026-09-09 pg_get_functiondef 로 직접 확인)
--       · orders.customer_phone / orders.phone      ❌ → [5] 에서 직접
--       · orders.recipient_phone                    ❌ → [6] 에서 직접
--       · customers.shipping_addresses(jsonb) 안 번호 ❌ → [7] 에서 직접
--     ★ 그래서 카톡ID 를 [2]에서 «먼저» 심어야 [4]에서 주문에 도장이 찍힌다.
--
--   ⚠ 안전 경계 — «새 계정 쪽에 돈이 있으면 자동 병합을 거부한다»
--     새 카톡으로 이미 주문했거나 포인트가 있으면 양쪽 돈을 합치는 계산이 필요하다.
--     그 경우는 자동으로 하지 않고 사장님께 알린다(관리자 화면에서 SQL 복사 → 사람이 판단).
--     계정 연결 요청은 «새 카톡으로 아직 못 산» 손님이 보내는 것이라 대부분 0건이다.
--
--   dry_run = true  → 아무것도 바꾸지 않고 «무슨 일이 일어날지»만 돌려준다 (미리보기)
--   dry_run = false → 백업을 남기고 실제로 병합한다
--
--   [2026-09-11 v2] «카톡 → 카톡» 갈아탄 손님(자동 감지 건)도 제대로 잇는다
--     예전 [2]는 옛 줄 카톡ID가 «비어 있을 때만» 채웠다(용서린 = 카톡 없던 옛 회원).
--     자동 감지 건은 옛 줄에도 카톡이 «이미» 있다(지니키키 1771=5004669160 / 2871=5083950427).
--     그대로 두면 합친 뒤에도 옛 주문엔 옛 카톡이 찍혀 있어
--       · 합배송(assertShippingFeeNotSkipped)이 «다른 카톡 주문»으로 보고 제외 → 배송비 또 붙음
--       · 구매제한(assertPurchaseLimit)이 옛 구매를 못 셈 → 제한 우회
--       · 재구매 통계·이벤트 인원이 두 사람으로 갈라짐
--     → [2] 에서 옛 줄 카톡ID를 새 카톡으로 «바꾸고», 그 줄의 주문(옛번호·새번호)에 찍힌 옛 카톡도 새 카톡으로 바꾼다.
--       금액·상태·입금·정산 값은 하나도 안 건드린다(kakao_id 한 칸만). 백업(old_customer)에 옛 카톡이 남아 되돌릴 수 있다.
--     그리고 병합 중엔 set_config('ruru.merging') 깃발을 세워, 자동 감지 트리거가 «합치는 중인 줄»로 헛요청을 만들지 않게 한다.
-- ============================================================

-- 되돌리기용 백업 표 (병합 직전 두 줄을 통째로 떠 둔다)
create table if not exists public.customer_link_merge_backup (
  id bigserial primary key,
  request_id uuid,
  merged_at timestamptz not null default now(),
  old_customer jsonb,
  new_customer jsonb,
  order_ids bigint[],
  note text
);
alter table public.customer_link_merge_backup enable row level security;
-- 정책 없음 = anon 접근 불가 (서버 service_role 전용)

create or replace function public.ruru_merge_customer_link_request(
  p_request_id uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r            customer_link_requests%rowtype;
  v_old        customers%rowtype;
  v_new        customers%rowtype;
  v_old_phone  text;
  v_new_phone  text;
  v_old_orders int := 0;
  v_new_orders int := 0;
  v_old_points int := 0;
  v_new_points int := 0;
  v_order_ids  bigint[];
  v_moved      int := 0;
  v_old_kakao  text;
  v_new_kakao  text;
  v_restamped  int := 0;
begin
  select * into r from customer_link_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'request_not_found');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', r.status);
  end if;

  v_old_phone := regexp_replace(coalesce(r.target_customer_phone, ''), '[^0-9]', '', 'g');
  v_new_phone := regexp_replace(coalesce(r.new_customer_phone, ''), '[^0-9]', '', 'g');
  v_new_kakao := coalesce(trim(r.new_kakao_id), '');

  -- 옛 줄 (합칠 대상) — 번호로 찾는다
  select * into v_old from customers
   where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old_phone
     and v_old_phone <> ''
   order by id
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'old_not_found', 'old_phone', v_old_phone);
  end if;
  v_old_kakao := coalesce(trim(v_old.kakao_id), '');

  -- 새 줄 (지금 쓰는 카톡) — 카톡ID로 찾는다. 없을 수도 있다(정보 저장 전 손님)
  if coalesce(trim(r.new_kakao_id), '') <> '' then
    select * into v_new from customers
     where coalesce(trim(kakao_id), '') = trim(r.new_kakao_id)
     order by created_at desc nulls last, id desc
     limit 1;
    if found and v_new_phone = '' then
      v_new_phone := regexp_replace(coalesce(v_new.customer_phone, ''), '[^0-9]', '', 'g');
    end if;
  end if;

  -- 같은 줄이면 합칠 게 없다
  if v_new.id is not null and v_new.id = v_old.id then
    return jsonb_build_object('ok', false, 'reason', 'same_row');
  end if;

  -- 숫자 모으기 (판단 자료 · 미리보기용)
  select count(*) into v_old_orders from orders
   where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old_phone
     and is_deleted is not true;
  select coalesce(sum(current_points), 0) into v_old_points from customer_point_balances
   where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old_phone;

  if v_new_phone <> '' and v_new_phone <> v_old_phone then
    select count(*) into v_new_orders from orders
     where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_new_phone
       and is_deleted is not true;
    select coalesce(sum(current_points), 0) into v_new_points from customer_point_balances
     where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_new_phone;
  end if;

  -- ⚠ 안전 경계: 새 쪽에 «돈»이 있으면 자동으로 합치지 않는다
  if v_new_orders > 0 or v_new_points > 0 then
    return jsonb_build_object(
      'ok', false, 'reason', 'new_side_has_money',
      'new_orders', v_new_orders, 'new_points', v_new_points,
      'message', '새 계정에도 주문·포인트가 있어 자동 합치기를 멈췄습니다. 사람이 확인해 주세요.'
    );
  end if;

  -- ── 미리보기 ──────────────────────────────────────────────
  if p_dry_run then
    return jsonb_build_object(
      'ok', true, 'dry_run', true,
      'old_id', v_old.id, 'old_phone', v_old_phone,
      'old_name', coalesce(v_old.customer_name, ''), 'old_nickname', coalesce(v_old.youtube_nickname, ''),
      'old_orders', v_old_orders, 'old_points', v_old_points,
      'new_id', v_new.id, 'new_phone', v_new_phone,
      'new_kakao_id', coalesce(r.new_kakao_id, ''),
      'old_kakao_id', v_old_kakao,
      'will_change_phone', (v_new_phone <> '' and v_new_phone <> v_old_phone),
      'will_change_kakao', (v_new_kakao <> '' and v_old_kakao <> '' and v_old_kakao <> v_new_kakao),
      'will_delete_new_row', (v_new.id is not null),
      'source', coalesce(r.source, 'customer'),
      'match_reasons', to_jsonb(coalesce(r.match_reasons, '{}'::text[]))
    );
  end if;

  -- ── 실제 병합 ─────────────────────────────────────────────
  -- [v2] 병합 중 깃발 — 자동 감지 트리거(ruru_detect_split_account)가 이 트랜잭션 안에서는 쉰다
  perform set_config('ruru.merging', '1', true);

  select array_agg(id) into v_order_ids from orders
   where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old_phone;

  insert into customer_link_merge_backup(request_id, old_customer, new_customer, order_ids, note)
  values (
    p_request_id,
    to_jsonb(v_old),
    case when v_new.id is not null then to_jsonb(v_new) else null end,
    v_order_ids,
    format('닉네임 %s · 옛번호 %s → 새번호 %s · 옛카톡 %s → 새카톡 %s · %s',
           coalesce(r.nickname, ''), v_old_phone, v_new_phone, v_old_kakao, v_new_kakao, coalesce(r.source, 'customer'))
  );

  -- [2] 옛 줄에 카톡ID «먼저» (번호는 아직 그대로라 번호변경 트리거는 안 돈다)
  --   v1: 비어 있을 때만 채움(카톡 없던 옛 회원).  v2: 다른 카톡이 있으면 새 카톡으로 «바꾼다»(카톡 갈아탄 손님).
  if v_new_kakao <> '' and v_old_kakao <> v_new_kakao then
    update customers set kakao_id = v_new_kakao where id = v_old.id;

    -- 옛 카톡이 찍힌 «이 줄의» 주문만 새 카톡으로 (옛번호·새번호 주문에 한정 — 남의 주문 무접촉)
    if v_old_kakao <> '' then
      update orders set kakao_id = v_new_kakao
       where coalesce(trim(kakao_id), '') = v_old_kakao
         and regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') in (v_old_phone, v_new_phone);
      get diagnostics v_restamped = row_count;
    end if;
  end if;

  -- [3] 새 줄 삭제 — 번호를 비워줘야 [4]에서 옛 줄이 그 번호를 가져갈 수 있다
  if v_new.id is not null then
    delete from customers where id = v_new.id;
  end if;

  -- [4] 옛 줄 번호 → 새 번호. 여기서 트리거가 포인트·차단·orders.kakao_id 를 옮긴다
  if v_new_phone <> '' and v_new_phone <> v_old_phone then
    update customers set customer_phone = v_new_phone where id = v_old.id;

    -- [5] 주문의 전화번호 (트리거가 «안» 바꾼다)
    update orders set customer_phone = v_new_phone
     where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old_phone;
    get diagnostics v_moved = row_count;

    update orders set phone = v_new_phone
     where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_old_phone;

    -- [6] 받는사람 번호는 «주문자와 같았던 것»만 (선물 배송지 보호)
    update orders set recipient_phone = v_new_phone
     where regexp_replace(coalesce(recipient_phone, ''), '[^0-9]', '', 'g') = v_old_phone;

    -- [7] 배송지 목록(jsonb) 안에 박혀 있는 옛 번호도 새 번호로
    update customers
       set shipping_addresses = replace(shipping_addresses::text, v_old_phone, v_new_phone)::jsonb
     where id = v_old.id
       and shipping_addresses is not null
       and shipping_addresses::text like '%' || v_old_phone || '%';
  end if;

  update customer_link_requests
     set status = 'done', handled_at = now(), updated_at = now()
   where id = p_request_id;

  return jsonb_build_object(
    'ok', true, 'dry_run', false,
    'merged_into_id', v_old.id,
    'final_phone', case when v_new_phone <> '' then v_new_phone else v_old_phone end,
    'orders_moved', v_moved,
    'orders_restamped', v_restamped,
    'final_kakao_id', case when v_new_kakao <> '' then v_new_kakao else v_old_kakao end,
    'kept_orders', v_old_orders, 'kept_points', v_old_points,
    'deleted_new_row', (v_new.id is not null)
  );
end;
$$;

-- 손님 브라우저(anon)는 이 함수를 부를 수 없어야 한다
revoke all on function public.ruru_merge_customer_link_request(uuid, boolean) from public, anon, authenticated;

-- 확인
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='ruru_merge_customer_link_request') as "함수생김",
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='customer_link_merge_backup') as "백업표생김";
