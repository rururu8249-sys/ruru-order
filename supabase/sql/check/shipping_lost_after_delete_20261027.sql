-- [읽기 전용] 상품 삭제로 배송비가 사라졌을 수 있는 주문서 후보 (10/01 이후) — 데이터 안 바뀜
--   재고 있는 상품을 지운 기록(admin_order_item_delete_restore)이 있는데 지금 주문서 배송비 합계가 0원인 것.
--   ※ 재고 없는 상품(직접입력 등)을 지운 건 기록이 안 남아 여기 안 나옴. 무료배송 주문도 섞여 있을 수 있으니 하나씩 확인.
select o.order_lookup_code as 주문번호, max(o.youtube_nickname) as 닉네임, max(o.customer_name) as 이름,
  to_char(min(l.created_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as 삭제시각,
  sum(coalesce(o.adjusted_shipping_fee, o.shipping_fee, 0)) as 지금_배송비,
  sum(coalesce(o.adjusted_total_price, o.total_price, 0)) as 지금_총액,
  max(o.admin_order_status_v2) as 상태
from public.inventory_ledger l
join public.orders o on o.order_group_id = l.order_group_id
where l.reason = 'admin_order_item_delete_restore'
  and l.created_at >= timestamptz '2026-10-01 00:00:00+09'
group by o.order_lookup_code
having sum(coalesce(o.adjusted_shipping_fee, o.shipping_fee, 0)) = 0
order by min(l.created_at) desc;
