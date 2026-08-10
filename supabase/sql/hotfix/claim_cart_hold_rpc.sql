-- ============================================================================
-- [2026-08-11] 담기 선착순 확정 RPC — claim_cart_hold
-- 목적: "장바구니 담는 순간이 임자" — 서버가 원자적으로 가용재고를 검증·선점.
--   · 같은 상품에 동시 담기 → products 행 잠금(FOR UPDATE)이 도착 순서대로 줄 세움
--   · 가용재고 = 상품 재고(product_note.stock_variants) − 다른 세션의 유효 선점 합
--   · 부족하면 그 옵션은 거부(available 반환) → 화면에서 "방금 품절" 안내
--   · 선점 만료(expires_at 경과)는 그 순간부터 계산에서 자동 제외 = 즉시 재고 복귀
--   · 재고 숫자 자체는 건드리지 않음(실차감은 제출 RPC 단일 소유 — 기존 원칙 유지)
-- 주의: 돈/입금/정산/포인트 로직 없음. cart_reservations + products 읽기/잠금만.
-- ============================================================================

create or replace function public.claim_cart_hold(
  p_session_key text,
  p_phone text default null,
  p_nickname text default null,
  p_customer_name text default null,
  p_items jsonb default '[]'::jsonb,
  p_hold_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $claim$
declare
  v_now timestamptz := now();
  v_minutes integer := least(43200, greatest(10, coalesce(p_hold_minutes, 15)));
  v_expires timestamptz;
  v_item jsonb;
  v_pid text;
  v_color text;
  v_size text;
  v_qty integer;
  v_note_text text;
  v_note jsonb;
  v_variants jsonb;
  v_variant jsonb;
  v_idx integer;
  v_stock integer;
  v_others integer;
  v_available integer;
  v_managed boolean;
  v_matched boolean;
  v_results jsonb := '[]'::jsonb;
  v_all_ok boolean := true;
  v_norm_req_color text;
  v_norm_req_size text;
begin
  if p_session_key is null or length(trim(p_session_key)) < 6 or length(trim(p_session_key)) > 80 then
    return jsonb_build_object('ok', false, 'error', 'sessionKey 없음');
  end if;

  v_expires := v_now + make_interval(mins => v_minutes);

  -- 교체 방식(멱등): 이 세션의 기존 선점 제거 후 현재 주문서 내용으로 다시 선점
  delete from public.cart_reservations where session_key = p_session_key;

  -- 상품 잠금 순서 고정(작은 id부터) → 교착 방지. 같은 상품 동시 담기는 여기서 도착순 직렬화됨.
  for v_pid in
    select distinct (i->>'productId')
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
    where coalesce(trim(i->>'productId'), '') <> ''
    order by 1
  loop
    -- 상품 행 잠금 (id 타입 무관하게 text 비교)
    select p.product_note into v_note_text
    from public.products p
    where p.id::text = v_pid
    for update;

    v_managed := false;
    v_variants := null;
    if found and v_note_text is not null then
      begin
        v_note := v_note_text::jsonb;
      exception when others then
        v_note := null;
      end;
      if v_note is not null
         and lower(coalesce(v_note->>'stock_management_enabled','false')) in ('true','t','1','yes','y')
         and jsonb_typeof(v_note->'stock_variants') = 'array' then
        v_managed := true;
        v_variants := v_note->'stock_variants';
      end if;
    end if;

    -- 이 상품의 요청 항목들 처리
    for v_item in
      select i from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
      where coalesce(trim(i->>'productId'), '') = v_pid
    loop
      v_color := left(coalesce(trim(v_item->>'color'), ''), 60);
      v_size  := left(coalesce(trim(v_item->>'size'), ''), 60);
      if v_color = '없음' then v_color := ''; end if;
      if v_size  = '없음' then v_size  := ''; end if;
      v_qty := least(99, greatest(0, coalesce((v_item->>'qty')::integer, 0)));
      if v_qty <= 0 then continue; end if;

      v_available := null;

      if v_managed then
        -- 옵션 재고 찾기 (제출 RPC와 동일한 '없음'/'' 동치 규칙)
        v_matched := false;
        for v_idx in 0..jsonb_array_length(v_variants)-1
        loop
          v_variant := v_variants->v_idx;
          v_norm_req_color := case when coalesce(trim(v_variant->>'color'),'') = '없음' then '' else coalesce(trim(v_variant->>'color'),'') end;
          v_norm_req_size  := case when coalesce(trim(v_variant->>'size'),'')  = '없음' then '' else coalesce(trim(v_variant->>'size'),'')  end;
          if v_norm_req_color = v_color and v_norm_req_size = v_size then
            v_stock := coalesce((v_variant->>'stock')::integer, 0);
            v_matched := true;
            exit;
          end if;
        end loop;

        if v_matched then
          -- 다른 세션(=다른 손님)의 유효 선점 합계. 만료된 선점은 자동 제외 = 즉시 복귀
          select coalesce(sum(r.qty), 0) into v_others
          from public.cart_reservations r
          where r.product_id = v_pid
            and r.session_key <> p_session_key
            and r.expires_at > v_now
            and (case when coalesce(trim(r.color),'') = '없음' then '' else coalesce(trim(r.color),'') end) = v_color
            and (case when coalesce(trim(r.size),'')  = '없음' then '' else coalesce(trim(r.size),'')  end) = v_size;

          v_available := greatest(0, v_stock - v_others);

          if v_qty > v_available then
            -- ❌ 선착순에서 밀림 — 담기 거부 (남은 수량 안내)
            v_all_ok := false;
            v_results := v_results || jsonb_build_object(
              'productId', v_pid, 'color', v_color, 'size', v_size,
              'requested', v_qty, 'ok', false, 'available', v_available);
            continue;
          end if;
        end if;
      end if;

      -- ✅ 선점 확정
      insert into public.cart_reservations
        (session_key, customer_phone, nickname, customer_name, product_id, color, size, qty, expires_at)
      values
        (p_session_key,
         nullif(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), ''),
         nullif(left(coalesce(trim(p_nickname),''),40), ''),
         nullif(left(coalesce(trim(p_customer_name),''),40), ''),
         v_pid, v_color, v_size, v_qty, v_expires);

      v_results := v_results || jsonb_build_object(
        'productId', v_pid, 'color', v_color, 'size', v_size,
        'requested', v_qty, 'ok', true, 'available', v_available);
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'allOk', v_all_ok, 'holdMinutes', v_minutes, 'results', v_results);
end;
$claim$;

comment on function public.claim_cart_hold(text, text, text, text, jsonb, integer) is
'담기 선착순 확정: products 행잠금으로 동시 담기를 도착순 직렬화, 가용재고(재고-타인선점) 검증 후 선점. 재고 숫자는 불변(실차감=제출 RPC). 2026-08-11';
