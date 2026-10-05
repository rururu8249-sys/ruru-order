create or replace function public.ruru_sync_product_inventory_variants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note jsonb;
  v_total_stock integer := 0;
begin
  v_note := public.ruru_try_parse_jsonb(new.product_note);

  delete from public.product_inventory_variants
  where product_id = new.id::bigint;

  if jsonb_typeof(v_note->'stock_variants') = 'array' then
    insert into public.product_inventory_variants (
      product_id,
      color,
      size,
      stock
    )
    select
      new.id::bigint,
      trim(coalesce(variant_row.value->>'color', '')),
      trim(coalesce(variant_row.value->>'size', '')),
      greatest(
        0,
        case
          when coalesce(variant_row.value->>'stock', '') ~ '^[0-9]+$'
            then (variant_row.value->>'stock')::integer
          else 0
        end
      )
    from jsonb_array_elements(v_note->'stock_variants') as variant_row(value)
    where trim(coalesce(variant_row.value->>'color', '')) <> ''
       or trim(coalesce(variant_row.value->>'size', '')) <> ''
       or coalesce(variant_row.value->>'stock', '') ~ '^[0-9]+$';
  end if;

  select coalesce(sum(stock), 0)::integer
    into v_total_stock
  from public.product_inventory_variants
  where product_id = new.id::bigint;

  if lower(coalesce(v_note->>'stock_management_enabled', 'true')) not in ('false', 'f', '0', 'no', 'n')
     and jsonb_typeof(v_note->'stock_variants') = 'array'
     and jsonb_array_length(v_note->'stock_variants') > 0 then
    update public.products
      set
        stock = v_total_stock,
        is_soldout = v_total_stock <= 0
    where id = new.id
      and (
        coalesce(stock, 0) is distinct from v_total_stock
        or coalesce(is_soldout, false) is distinct from (v_total_stock <= 0)
      );
  end if;

  return new;
end;
$$;

