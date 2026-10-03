alter table public.orders
  add column if not exists repick_required_at timestamptz,
  add column if not exists repick_before jsonb,
  add column if not exists repick_resolved_at timestamptz;

create or replace function public.orders_manage_repick_attention()
returns trigger
language plpgsql
as $$
declare
  physical_changed boolean;
begin
  physical_changed :=
    new.product_name is distinct from old.product_name or
    new.color is distinct from old.color or
    new.size is distinct from old.size or
    new.qty is distinct from old.qty;

  if physical_changed and old.picked_at is not null then
    new.repick_required_at := clock_timestamp();
    new.repick_before := jsonb_build_object(
      'product_name', old.product_name,
      'color', old.color,
      'size', old.size,
      'qty', old.qty
    );
    new.repick_resolved_at := null;
    new.picked_at := null;
  elsif new.picked_at is not null
    and new.picked_at is distinct from old.picked_at
    and new.repick_required_at is not null
    and (new.repick_resolved_at is null or new.repick_resolved_at < new.repick_required_at)
  then
    new.repick_resolved_at := new.picked_at;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_manage_repick_attention_trigger on public.orders;
create trigger orders_manage_repick_attention_trigger
before update of product_name, color, size, qty, picked_at on public.orders
for each row execute function public.orders_manage_repick_attention();

comment on column public.orders.repick_required_at is '챙김 완료 후 상품명/색상/사이즈/수량 변경으로 재챙김이 열린 시각';
comment on column public.orders.repick_before is '재챙김 전 최초 챙김 완료 상태의 상품 스냅샷';
comment on column public.orders.repick_resolved_at is '재챙김을 상품별로 다시 확인한 시각';
