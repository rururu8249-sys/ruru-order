-- supabase/sql/order_removed_items.sql
-- [2026-11-07 사장님 「카드 재결제로 뺀 상품이 완전히 사라짐 — 얼마에 샀는지 기록은 있어야」]
-- 주문상품 삭제(admin_delete_order_item)는 orders 행을 지운다. 지우기 «직전»에 그 줄 사본을 여기에 남긴다.
--   · 기록 전용 — 주문 금액·입금매칭·정산·포인트·재고 계산은 이 표를 읽지 않는다.
--   · RLS on, 정책 없음 = 손님(anon) 못 읽음. 관리자 서버(service_role)만 읽고 쓴다.
--   · kind: 'card_repay'(일부 취소·카드 다시 결제) / 'delete'(주문상세 삭제 버튼)
-- 적용: Supabase SQL Editor 에 붙여넣고 Run (temp table 없음).

create table if not exists public.order_removed_items (
  id bigserial primary key,
  order_id bigint not null,
  order_group_id text,
  order_lookup_code text,
  kind text not null default 'delete',
  snapshot jsonb not null,
  card_total_before numeric,
  memo text,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists order_removed_items_code_idx on public.order_removed_items (order_lookup_code);
create index if not exists order_removed_items_group_idx on public.order_removed_items (order_group_id);

alter table public.order_removed_items enable row level security;

-- 또요(RURU-MUWROBT1) 11/1 「일부 취소 · 카드 다시 결제」로 지워진 줄 #5381 복원 기록.
--   근거: 고객이슈·환불 기록 product_snapshot(lineId 5381·특가상품·CH -213·1개),
--         처음 카드결제 243,960 = (남은 72,000 + 뺀 156,000) × 1.07, 남은 줄 77,040.
--   지운 정확한 시각은 기록이 없어 removed_at 비움.
insert into public.order_removed_items (order_id, order_group_id, order_lookup_code, kind, snapshot, card_total_before, memo, removed_at)
select 5381, '26e24757-d254-4ebf-8ca6-a62351dd6a1f', 'RURU-MUWROBT1', 'card_repay',
  jsonb_build_object(
    'product_name', '특가상품', 'color', 'CH -213', 'size', '', 'qty', 1,
    'product_price', 156000, 'vat_amount', 10920, 'total_price', 166920, 'final_amount', 166920,
    'shipping_fee', 0, 'point_used_amount', 0, 'product_id', 754, 'payment_method', '카드결제'
  ),
  243960, '기록 복원(고객이슈·처음 카드결제 금액에서 계산)', null
where not exists (select 1 from public.order_removed_items where order_id = 5381);

select id, order_id, order_lookup_code, kind, snapshot->>'product_name' as name, snapshot->>'color' as opt,
       snapshot->>'total_price' as total, card_total_before
from public.order_removed_items order by id desc limit 5;
