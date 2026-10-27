-- [읽기 전용] 2026-10-27(화) 오전 주문 상품 수정 찾기 — 데이터 안 바뀜
-- 범위: 한국 시간 08:00~12:00 (기억이 흐린 경우 대비해 9~11시보다 넓게)

-- ① 상품·옵션·수량·금액 수정 — 주문 줄에 남은 「바꾸기 전 → 바꾼 뒤」
select
  to_char((h->>'changed_at')::timestamptz at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') as 수정시각,
  o.youtube_nickname as 닉네임,
  o.customer_name    as 이름,
  o.order_lookup_code as 주문번호,
  o.id               as 줄번호,
  concat_ws(' / ', h->'before'->>'product_name', nullif(h->'before'->>'color',''), nullif(h->'before'->>'size',''),
            (h->'before'->>'qty') || '개', (h->'before'->>'product_price') || '원') as 바꾸기전,
  concat_ws(' / ', h->'after'->>'product_name',  nullif(h->'after'->>'color',''),  nullif(h->'after'->>'size',''),
            (h->'after'->>'qty')  || '개', (h->'after'->>'product_price')  || '원') as 바꾼뒤
from public.orders o
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(o.item_change_history) = 'array' then o.item_change_history else '[]'::jsonb end
) h
where h->>'changed_at' ~ '^\d{4}-\d{2}-\d{2}'
  and (h->>'changed_at')::timestamptz >= timestamptz '2026-10-27 08:00:00+09'
  and (h->>'changed_at')::timestamptz <  timestamptz '2026-10-27 12:00:00+09'
order by 1;

-- ② 주문 상품 «추가·삭제»(삭제한 줄은 ①에 안 남아서 재고 기록으로 찾음)
select
  to_char(l.created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') as 시각,
  case l.reason
    when 'admin_order_item_add_deduct'     then '상품 추가'
    when 'admin_order_item_delete_restore' then '상품 삭제'
    else l.reason end as 한일,
  l.product_id as 상품번호, l.color as 색상, l.size as 사이즈, abs(l.change_qty) as 수량,
  (select o.youtube_nickname  from public.orders o where o.order_group_id = l.order_group_id limit 1) as 닉네임,
  (select o.customer_name     from public.orders o where o.order_group_id = l.order_group_id limit 1) as 이름,
  (select o.order_lookup_code from public.orders o where o.order_group_id = l.order_group_id limit 1) as 주문번호
from public.inventory_ledger l
where l.reason in ('admin_order_item_add_deduct', 'admin_order_item_delete_restore')
  and l.created_at >= timestamptz '2026-10-27 08:00:00+09'
  and l.created_at <  timestamptz '2026-10-27 12:00:00+09'
order by l.created_at;
