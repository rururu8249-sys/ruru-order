-- [2026-11-26 사장님 긴급 「수량 4개 = 주문서 2 + 장바구니 2 인데 장바구니 손님이 품절로 제출 안 될 때가 있다」]
-- 원인 2가지(운영 함수 본문 확인):
--   ① 팔린 수를 «처음부터 전부» 셌음 → 예전에 팔렸던 옵션에 수량을 새로 적으면 바로 0 밑 → 품절.
--   ② 장바구니는 «나 빼고 전부»를 뺐음 → 담은 사람이 남은 수량보다 많으면 먼저 담은 사람도 품절·장바구니에서 빠짐.
-- ③ 단품(브랜드 묶음 아님)은 계산식 한 줄이 null 이 되어 주문·장바구니를 0개로 셌음(수량 제한이 사실상 안 걸림).
-- 고침:
--   ① 수량 옆에 입력 시각(limit_qty_at)을 저장 — 그 뒤 주문만 셈(시각 없는 예전 줄은 예전처럼 전부 셈).
--   ② 장바구니는 «나보다 먼저 담은 사람»만 뺌(먼저 담은 순서대로 수량을 가져감).
--   ③ 단품도 주문·장바구니를 제대로 셈.
-- 재고관리 켠 상품·금액·포인트·입금·주문 저장 순서 무변경. 담기(claim_cart_hold)는 부르는 줄 하나만 바꿈(바뀐 함수면 중단).

-- 수량 입력 시각(없으면 null)
create or replace function public.ruru_option_limit_at(p_note jsonb, p_color text, p_size text, p_detail text default null)
returns timestamptz language plpgsql immutable set search_path = public as $fn$
declare
  v_color text := coalesce(nullif(trim(p_color),'없음'),'');
  v_size text := coalesce(nullif(trim(p_size),'없음'),'');
  v_detail text := coalesce(trim(p_detail),'');
  v_joined text; v_row jsonb;
begin
  if p_note is null or jsonb_typeof(p_note->'stock_variants') is distinct from 'array' then return null; end if;
  if jsonb_typeof(p_note->'brand_group'->'detail_options') = 'object' and (p_note->'brand_group'->'detail_options') ? v_detail then
    v_joined := v_detail || ' / ' || coalesce(nullif(v_color,''),'없음');
  end if;
  for v_row in select value from jsonb_array_elements(p_note->'stock_variants') loop
    if coalesce(nullif(trim(v_row->>'size'),'없음'),'') = v_size
       and (coalesce(nullif(trim(v_row->>'color'),'없음'),'') = v_color or coalesce(trim(v_row->>'color'),'') = v_joined) then
      if jsonb_typeof(v_row->'limit_qty_at') = 'string' then
        begin return (v_row->>'limit_qty_at')::timestamptz; exception when others then return null; end;
      end if;
      return null;
    end if;
  end loop;
  return null;
end; $fn$;

-- 남은 수량(먼저 담은 순서). p_before = 이 손님이 처음 담은 시각(그보다 먼저 담은 다른 손님만 뺌).
create or replace function public.ruru_option_limit_remaining(p_product_id bigint, p_note jsonb, p_detail text, p_color text, p_size text, p_session text, p_phone text, p_before timestamptz)
returns integer language plpgsql stable security definer set search_path = public as $fn$
declare
  v_limit integer := public.ruru_option_limit_qty(p_note, p_color, p_size, p_detail);
  v_at timestamptz := public.ruru_option_limit_at(p_note, p_color, p_size, p_detail);
  v_color text := coalesce(nullif(trim(p_color),'없음'),'');
  v_size text := coalesce(nullif(trim(p_size),'없음'),'');
  v_detail text := coalesce(trim(p_detail),'');
  v_phone text := nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'');
  v_brand boolean; v_sold integer; v_held integer;
begin
  if v_limit is null then return null; end if;
  -- 단품(브랜드 묶음 아님)이면 null 이 되어 주문·장바구니를 0개로 셌음 → coalesce(…, false)
  v_brand := coalesce(jsonb_typeof(p_note->'brand_group'->'detail_options') = 'object' and (p_note->'brand_group'->'detail_options') ? v_detail, false);
  select coalesce(sum(greatest(1,coalesce(o.qty,1))),0) into v_sold from public.orders o
   where o.product_id = p_product_id and coalesce(o.is_deleted,false) = false and coalesce(o.is_test_order,false) = false
     and not ((coalesce(o.order_status,'')||' '||coalesce(o.order_manage_status,'')||' '||coalesce(o.admin_order_status_v2,'')) ~* '취소|환불|cancel|refund')
     and (v_at is null or o.created_at >= v_at)
     and coalesce(nullif(trim(o.size),'없음'),'') = v_size and coalesce(nullif(trim(o.color),'없음'),'') = v_color
     and (not v_brand or coalesce(trim(o.product_name),'') = v_detail);
  select coalesce(sum(r.qty),0) into v_held from public.cart_reservations r
   where r.product_id = p_product_id::text and r.expires_at > now()
     and not ((p_session is not null and r.session_key = p_session) or (v_phone is not null and regexp_replace(coalesce(r.customer_phone,''),'[^0-9]','','g') = v_phone))
     and (p_before is null or r.created_at < p_before)
     and coalesce(nullif(trim(r.size),'없음'),'') = v_size and coalesce(nullif(trim(r.color),'없음'),'') = v_color
     and (not v_brand or coalesce(trim(r.product_name),'') = v_detail);
  return v_limit - v_sold - v_held;
end; $fn$;
revoke all on function public.ruru_option_limit_remaining(bigint,jsonb,text,text,text,text,text,timestamptz) from public, anon, authenticated;

-- 예전 7칸(주문 저장·화면 표시가 부름): 이 손님의 장바구니 처음 담은 시각을 찾아 8칸으로 넘김(없으면 지금 = 다른 사람 전부)
create or replace function public.ruru_option_limit_remaining(p_product_id bigint, p_note jsonb, p_detail text, p_color text, p_size text, p_session text, p_phone text)
returns integer language plpgsql stable security definer set search_path = public as $fn$
declare
  v_color text := coalesce(nullif(trim(p_color),'없음'),'');
  v_size text := coalesce(nullif(trim(p_size),'없음'),'');
  v_detail text := coalesce(trim(p_detail),'');
  v_phone text := nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'');
  v_brand boolean; v_mine timestamptz;
begin
  -- 단품(브랜드 묶음 아님)이면 null 이 되어 주문·장바구니를 0개로 셌음 → coalesce(…, false)
  v_brand := coalesce(jsonb_typeof(p_note->'brand_group'->'detail_options') = 'object' and (p_note->'brand_group'->'detail_options') ? v_detail, false);
  select min(r.created_at) into v_mine from public.cart_reservations r
   where r.product_id = p_product_id::text and r.expires_at > now()
     and ((p_session is not null and r.session_key = p_session) or (v_phone is not null and regexp_replace(coalesce(r.customer_phone,''),'[^0-9]','','g') = v_phone))
     and coalesce(nullif(trim(r.size),'없음'),'') = v_size and coalesce(nullif(trim(r.color),'없음'),'') = v_color
     and (not v_brand or coalesce(trim(r.product_name),'') = v_detail);
  return public.ruru_option_limit_remaining(p_product_id, p_note, p_detail, p_color, p_size, p_session, p_phone, coalesce(v_mine, now()));
end; $fn$;
revoke all on function public.ruru_option_limit_remaining(bigint,jsonb,text,text,text,text,text) from public, anon, authenticated;

do $patch$
declare v_oid oid; v_def text; v_old text; v_n integer;
begin
  -- ① 담기: 자기 줄을 지운 뒤 검사하므로, 보존해 둔 «처음 담은 시각»(v_first)을 넘김
  v_oid := 'public.claim_cart_hold(text,text,text,text,jsonb,integer)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_old := $o$public.ruru_option_limit_remaining(v_pid::bigint, v_note, v_snapshot_name, v_color, v_size, p_session_key, nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),''))$o$;
  v_n := (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  if v_n <> 1 then raise exception 'claim call count %', v_n; end if;
  v_def := replace(v_def, v_old, $o$public.ruru_option_limit_remaining(v_pid::bigint, v_note, v_snapshot_name, v_color, v_size, p_session_key, nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),''), v_first)$o$);
  execute v_def;

  -- ② 재고표→메모 다시 만들 때 입력 시각도 잃지 않게
  v_oid := 'public.ruru_sync_product_stock_note_from_variants(bigint)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_old := '''limit_qty'', public.ruru_option_limit_qty(v_product_note, color, size, null)';
  v_n := (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old);
  if v_n <> 1 then raise exception 'sync anchor count %', v_n; end if;
  if position('limit_qty_at' in v_def) = 0 then
    v_def := replace(v_def, v_old, v_old || ', ''limit_qty_at'', public.ruru_option_limit_at(v_product_note, color, size, null)');
    execute v_def;
  end if;
end; $patch$;
