-- [2026-11-14 사장님 「특정 상품만 수량 1개」] 재고관리 꺼진 상품에서 옵션 줄마다 «판매 가능 수량»(limit_qty)을 둘 수 있게.
--   비워 두면 지금과 같은 무제한. 남은 수량 = limit_qty − 취소·삭제·테스트 아닌 주문 수 − 다른 손님 장바구니.
--   재고관리 켠 상품·금액·포인트·입금은 그대로. 원래 함수 본문에 검사만 끼워 넣음(바뀐 함수면 중단).
create or replace function public.ruru_option_limit_qty(p_note jsonb, p_color text, p_size text, p_detail text default null)
returns integer language plpgsql immutable set search_path = public as $fn$
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
      if jsonb_typeof(v_row->'limit_qty') = 'number' and (v_row->>'limit_qty')::numeric >= 0 then
        return floor((v_row->>'limit_qty')::numeric)::integer;
      end if;
      return null;
    end if;
  end loop;
  return null;
end; $fn$;

create or replace function public.ruru_option_limit_remaining(p_product_id bigint, p_note jsonb, p_detail text, p_color text, p_size text, p_session text, p_phone text)
returns integer language plpgsql stable security definer set search_path = public as $fn$
declare
  v_limit integer := public.ruru_option_limit_qty(p_note, p_color, p_size, p_detail);
  v_color text := coalesce(nullif(trim(p_color),'없음'),'');
  v_size text := coalesce(nullif(trim(p_size),'없음'),'');
  v_detail text := coalesce(trim(p_detail),'');
  v_brand boolean; v_sold integer; v_held integer;
begin
  if v_limit is null then return null; end if;
  v_brand := jsonb_typeof(p_note->'brand_group'->'detail_options') = 'object' and (p_note->'brand_group'->'detail_options') ? v_detail;
  select coalesce(sum(greatest(1,coalesce(o.qty,1))),0) into v_sold from public.orders o
   where o.product_id = p_product_id and coalesce(o.is_deleted,false) = false and coalesce(o.is_test_order,false) = false
     and not ((coalesce(o.order_status,'')||' '||coalesce(o.order_manage_status,'')||' '||coalesce(o.admin_order_status_v2,'')) ~* '취소|환불|cancel|refund')
     and coalesce(nullif(trim(o.size),'없음'),'') = v_size and coalesce(nullif(trim(o.color),'없음'),'') = v_color
     and (not v_brand or coalesce(trim(o.product_name),'') = v_detail);
  select coalesce(sum(r.qty),0) into v_held from public.cart_reservations r
   where r.product_id = p_product_id::text and r.expires_at > now()
     and not ((p_session is not null and r.session_key = p_session) or (coalesce(p_phone,'') <> '' and r.customer_phone = p_phone))
     and coalesce(nullif(trim(r.size),'없음'),'') = v_size and coalesce(nullif(trim(r.color),'없음'),'') = v_color
     and (not v_brand or coalesce(trim(r.product_name),'') = v_detail);
  return v_limit - v_sold - v_held;
end; $fn$;
revoke all on function public.ruru_option_limit_remaining(bigint,jsonb,text,text,text,text,text) from public, anon, authenticated;

do $patch$
declare v_oid oid; v_def text; v_anchor text; v_n integer;
begin
  -- ① 장바구니 담기: 재고관리 꺼진 상품이면 판매 가능 수량 확인
  v_oid := 'public.claim_cart_hold(text,text,text,text,jsonb,integer)'::regprocedure;
  if (select md5(prosrc) from pg_proc where oid=v_oid) <> '4e7c2f8d8e2da51fcd1f7152d4b4acc2' then raise exception 'claim_cart_hold source changed; inspect before applying'; end if;
  v_def := pg_get_functiondef(v_oid); v_anchor := 'v_available:=null;';
  v_n := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_n <> 1 then raise exception 'claim anchor count %', v_n; end if;
  v_def := replace(v_def, v_anchor, $g$if not v_managed and v_note is not null and v_pid ~ '^[0-9]+$' then
        v_available := public.ruru_option_limit_remaining(v_pid::bigint, v_note, v_snapshot_name, v_color, v_size, p_session_key, nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),''));
        if v_available is not null and v_qty > greatest(0,v_available) then
          v_all_ok := false;
          v_results := v_results || jsonb_build_object('productId',v_pid,'color',v_color,'size',v_size,'requested',v_qty,'ok',false,'soldout',greatest(0,v_available)=0,'available',greatest(0,v_available));
          continue;
        end if;
      end if;
      $g$ || v_anchor);
  execute v_def;

  -- ② 주문 저장: 이 주문까지 넣은 뒤 남은 수량이 0 밑이면 거부(전체 롤백)
  v_oid := 'public.submit_customer_order_with_points(jsonb,integer,text,text,text,text)'::regprocedure;
  if (select md5(prosrc) from pg_proc where oid=v_oid) <> '2e140e4acce1ab4f7c3b51fccf8e15fd' then raise exception 'submit source changed; inspect before applying'; end if;
  v_def := pg_get_functiondef(v_oid);
  v_anchor := 'IF ((v_product_note::jsonb)->>''stock_management_enabled'')::boolean IS NOT TRUE THEN';
  v_n := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_n <> 1 then raise exception 'submit anchor count %', v_n; end if;
  v_def := replace(v_def, v_anchor, $g$IF ((v_product_note::jsonb)->>'stock_management_enabled')::boolean IS NOT TRUE
       AND coalesce(public.ruru_option_limit_remaining(v_inv_row.product_id, v_product_note::jsonb, v_inv_row.product_name, v_inv_row.color, v_inv_row.size, p_session_key, v_phone), 0) < 0 THEN
      RAISE EXCEPTION '선택한 옵션이 품절되었습니다. (상품: %, 색상: %, 사이즈: %)', v_inv_row.product_name, coalesce(v_inv_row.color, ''), coalesce(v_inv_row.size, '');
    END IF;
    $g$ || v_anchor);
  execute v_def;

  -- ③ 재고표→메모 다시 만들 때 판매 가능 수량을 잃지 않게
  v_oid := 'public.ruru_sync_product_stock_note_from_variants(bigint)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_anchor := '''manual_soldout'', public.ruru_option_manual_soldout(v_product_note, color, size, null)';
  v_n := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_n <> 1 then raise exception 'sync anchor count %', v_n; end if;
  v_def := replace(v_def, v_anchor, v_anchor || ', ''limit_qty'', public.ruru_option_limit_qty(v_product_note, color, size, null)');
  execute v_def;
end; $patch$;
