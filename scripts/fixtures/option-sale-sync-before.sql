CREATE OR REPLACE FUNCTION public.ruru_sync_product_stock_note_from_variants(p_product_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_stock integer := 0;
  v_product_note jsonb;
begin
  if p_product_id is null then
    raise exception '상품번호가 없습니다.';
  end if;

  select public.ruru_try_parse_jsonb(product_note)
    into v_product_note
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception '상품 정보를 찾을 수 없습니다. 상품번호: %', p_product_id;
  end if;

  select coalesce(sum(stock)::integer, 0)
    into v_total_stock
  from public.product_inventory_variants
  where product_id = p_product_id;

  update public.products
    set
      stock = v_total_stock,
      is_soldout = v_total_stock <= 0,
      product_note = jsonb_set(
        coalesce(v_product_note, '{}'::jsonb),
        '{stock_variants}',
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'color', color,
              'size', size,
              'stock', stock
            )
            order by color, size
          )
          from public.product_inventory_variants
          where product_id = p_product_id
        ), '[]'::jsonb),
        true
      )::text
  where id = p_product_id;
end;
$function$
;
