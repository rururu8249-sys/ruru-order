create or replace function public.claim_cart_hold(p_session_key text, p_phone text default null::text, p_nickname text default null::text, p_customer_name text default null::text, p_items jsonb default '[]'::jsonb, p_hold_minutes integer default 15)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_now timestamptz := now(); v_minutes integer := least(43200,greatest(10,coalesce(p_hold_minutes,15))); v_expires timestamptz;
  v_item jsonb; v_pid text; v_color text; v_size text; v_qty integer; v_note_text text; v_note jsonb; v_variants jsonb; v_variant jsonb;
  v_idx integer; v_stock integer; v_others integer; v_available integer; v_managed boolean; v_matched boolean; v_results jsonb := '[]'::jsonb;
  v_all_ok boolean := true; v_norm_req_color text; v_norm_req_size text; v_parent_name text; v_snapshot_name text; v_detail_name text; v_snapshot_price integer;
begin
  if p_session_key is null or length(trim(p_session_key)) < 6 or length(trim(p_session_key)) > 80 then return jsonb_build_object('ok',false,'error','sessionKey 없음'); end if;
  v_expires := v_now + make_interval(mins=>v_minutes);
  delete from public.cart_reservations where session_key=p_session_key;
  for v_pid in select distinct (i->>'productId') from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i where coalesce(trim(i->>'productId'),'')<>'' order by 1 loop
    select p.product_note,p.product_name into v_note_text,v_parent_name from public.products p where p.id::text=v_pid for update;
    v_managed:=false; v_variants:=null;
    if found and v_note_text is not null then
      begin v_note:=v_note_text::jsonb; exception when others then v_note:=null; end;
      if v_note is not null and lower(coalesce(v_note->>'stock_management_enabled','false')) in ('true','t','1','yes','y') and jsonb_typeof(v_note->'stock_variants')='array' then v_managed:=true; v_variants:=v_note->'stock_variants'; end if;
    end if;
    for v_item in select i from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i where coalesce(trim(i->>'productId'),'')=v_pid loop
      v_color:=left(coalesce(trim(v_item->>'color'),''),60); v_size:=left(coalesce(trim(v_item->>'size'),''),60); if v_color='없음' then v_color:=''; end if; if v_size='없음' then v_size:=''; end if;
      v_qty:=least(99,greatest(0,coalesce((v_item->>'qty')::integer,0))); if v_qty<=0 then continue; end if;
      v_snapshot_name:=nullif(left(coalesce(trim(v_item->>'productName'),''),180),'');
      v_detail_name:=case when v_snapshot_name is not null and coalesce(trim(v_parent_name),'')<>'' and v_snapshot_name<>trim(v_parent_name) then v_snapshot_name else null end;
      if v_item ? 'unitPrice' and jsonb_typeof(v_item->'unitPrice') <> 'null' and coalesce(trim(v_item->>'unitPrice'),'') <> '' then
        begin v_snapshot_price:=least(100000000,greatest(0,coalesce(nullif(regexp_replace(coalesce(v_item->>'unitPrice',''),'[^0-9]','','g'),'')::bigint,0)::integer)); exception when others then v_snapshot_price:=null; end;
      else v_snapshot_price:=null; end if;
      v_available:=null;
      if v_managed then
        v_matched:=false;
        for v_idx in 0..jsonb_array_length(v_variants)-1 loop
          v_variant:=v_variants->v_idx;
          v_norm_req_color:=case when coalesce(trim(v_variant->>'color'),'')='없음' then '' else coalesce(trim(v_variant->>'color'),'') end;
          v_norm_req_size:=case when coalesce(trim(v_variant->>'size'),'')='없음' then '' else coalesce(trim(v_variant->>'size'),'') end;
          if v_norm_req_color=v_color and v_norm_req_size=v_size then v_stock:=coalesce((v_variant->>'stock')::integer,0); v_matched:=true; exit; end if;
        end loop;
        if v_matched then
          select coalesce(sum(r.qty),0) into v_others from public.cart_reservations r where r.product_id=v_pid and r.session_key<>p_session_key and r.expires_at>v_now and (case when coalesce(trim(r.color),'')='없음' then '' else coalesce(trim(r.color),'') end)=v_color and (case when coalesce(trim(r.size),'')='없음' then '' else coalesce(trim(r.size),'') end)=v_size;
          v_available:=greatest(0,v_stock-v_others);
          if v_qty>v_available then v_all_ok:=false; v_results:=v_results||jsonb_build_object('productId',v_pid,'color',v_color,'size',v_size,'requested',v_qty,'ok',false,'available',v_available); continue; end if;
        end if;
      end if;
      insert into public.cart_reservations(session_key,customer_phone,nickname,customer_name,product_id,product_name,detail_name,unit_price,color,size,qty,expires_at)
      values(p_session_key,nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),''),nullif(left(coalesce(trim(p_nickname),''),40),''),nullif(left(coalesce(trim(p_customer_name),''),40),''),v_pid,v_snapshot_name,v_detail_name,v_snapshot_price,v_color,v_size,v_qty,v_expires);
      v_results:=v_results||jsonb_build_object('productId',v_pid,'color',v_color,'size',v_size,'requested',v_qty,'ok',true,'available',v_available);
    end loop;
  end loop;
  return jsonb_build_object('ok',true,'allOk',v_all_ok,'holdMinutes',v_minutes,'results',v_results);
end;$function$;
