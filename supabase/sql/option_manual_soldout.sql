-- Independent manual availability. No quantities, prices or historic orders are rewritten.
-- Apply as one migration transaction. Source guards prevent replacing a changed live RPC.
create or replace function public.ruru_option_manual_soldout(
  p_note jsonb, p_color text, p_size text, p_detail text default null
) returns boolean language plpgsql immutable security invoker set search_path = public as $fn$
declare
  v_color text := coalesce(nullif(trim(p_color),'없음'),'');
  v_size text := coalesce(nullif(trim(p_size),'없음'),'');
  v_detail text := coalesce(trim(p_detail),'');
  v_joined text;
  v_row jsonb;
begin
  if jsonb_typeof(p_note->'stock_variants') is distinct from 'array' then return false; end if;
  if jsonb_typeof(p_note->'brand_group'->'detail_options') = 'object'
     and (p_note->'brand_group'->'detail_options') ? v_detail then
    v_joined := v_detail || ' / ' || coalesce(nullif(v_color,''),'없음');
  end if;
  for v_row in select value from jsonb_array_elements(p_note->'stock_variants') loop
    if v_row->'manual_soldout' = 'true'::jsonb
       and coalesce(nullif(trim(v_row->>'size'),'없음'),'') = v_size
       and (coalesce(nullif(trim(v_row->>'color'),'없음'),'') = v_color
            or coalesce(trim(v_row->>'color'),'') = v_joined) then
      return true;
    end if;
  end loop;
  return false;
end;
$fn$;

do $patch$
declare
  v_oid oid;
  v_def text;
  v_anchor text;
begin
  v_oid := 'public.submit_customer_order_with_points(jsonb,integer,text,text,text,text)'::regprocedure;
  if (select md5(prosrc) from pg_proc where oid=v_oid) <> '3ac5e0e3f97fc1479bd5c9823e57b722' then
    raise exception 'submit_customer_order_with_points source changed; inspect before applying';
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_anchor := '    IF ((v_product_note::jsonb)->>''stock_management_enabled'')::boolean IS NOT TRUE THEN';
  if strpos(v_def,v_anchor)=0 then raise exception 'order guard anchor missing'; end if;
  v_def := replace(v_def,v_anchor,$guard$
    IF public.ruru_option_manual_soldout(v_product_note::jsonb, v_inv_row.color, v_inv_row.size, v_inv_row.product_name) THEN
      RAISE EXCEPTION '선택한 옵션이 품절되었습니다. (상품: %, 색상: %, 사이즈: %)',
        v_inv_row.product_name, coalesce(v_inv_row.color, ''), coalesce(v_inv_row.size, '');
    END IF;
$guard$ || v_anchor);
  execute v_def;

  v_oid := 'public.claim_cart_hold(text,text,text,text,jsonb,integer)'::regprocedure;
  if (select md5(prosrc) from pg_proc where oid=v_oid) <> '4839862622e0986f6d53340cab265d9e' then
    raise exception 'claim_cart_hold source changed; inspect before applying';
  end if;
  v_def := pg_get_functiondef(v_oid);
  -- Clear each product's note even when the next product lookup is missing.
  v_def := replace(v_def,'v_managed:=false; v_variants:=null;', 'v_managed:=false; v_variants:=null; v_note:=null;');
  v_anchor := '      v_available:=null;';
  if strpos(v_def,v_anchor)=0 then raise exception 'reservation guard anchor missing'; end if;
  v_def := replace(v_def,v_anchor,$guard$
      if public.ruru_option_manual_soldout(v_note, v_color, v_size, v_snapshot_name) then
        v_all_ok := false;
        v_results := v_results || jsonb_build_object('productId',v_pid,'color',v_color,'size',v_size,'requested',v_qty,'ok',false,'soldout',true,'available',0);
        continue;
      end if;
$guard$ || v_anchor);
  execute v_def;

  -- Cancellation / administrator stock adjustments rebuild the JSON from the inventory table.
  -- Carry sale state from the locked old note rather than losing it in that projection.
  v_oid := 'public.ruru_sync_product_stock_note_from_variants(bigint)'::regprocedure;
  if (select md5(prosrc) from pg_proc where oid=v_oid) <> 'b6ac102a3a86400a022b453e9dc74b1f' then
    raise exception 'ruru_sync_product_stock_note_from_variants source changed; inspect before applying';
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_anchor := '''stock'', stock';
  if strpos(v_def,v_anchor)=0 then raise exception 'stock sync guard anchor missing'; end if;
  v_def := replace(v_def,v_anchor, v_anchor || ', ''manual_soldout'', public.ruru_option_manual_soldout(v_product_note, color, size, null)');
  execute v_def;
end;
$patch$;
