-- ============================================================================
-- ㉞ 2026-10-18 상품 699 「나이키 바람막이」 유령 재고줄 1줄 제거
--   대상: product_note.stock_variants 의 {color:"", size:"M", stock:0} 한 줄만.
--   남기는 줄: {color:"없음", size:"M", stock:10}, {color:"없음", size:"S", stock:1} (그대로).
--   다른 상품·다른 줄은 건드리지 않는다.
--
--   생긴 경로(inventory_ledger 실측): 2026-10-18 22:09 KST 주문 5812 「재고연동 상품수정」
--   (admin_update_inventory_linked_order_item RPC) 가 "없음"→'' 로 바꾼 뒤
--   product_inventory_variants 에 ('', 'M') 행을 insert ... on conflict do nothing 으로 새로 만들고
--   복구 +1 / 차감 -1 을 그 행에 했다(순변화 0). 그 PIV 행이 note 로 역동기화되어 맨 앞(0번)에 들어감.
--
--   Supabase SQL Editor 에서 ①만 먼저 실행해 현재값 확인 → ②~③ 실행.
-- ============================================================================

-- ① 실행 전 확인 (읽기만)
select id, product_name,
       product_note::jsonb->'stock_variants' as stock_variants,
       stock, is_soldout
from public.products
where id = 699;

select id, product_id, color, size, stock, updated_at
from public.product_inventory_variants
where product_id = 699
order by id;

-- ② 한 줄만 제거 — 안전 조건:
--    · 상품 699 만
--    · 지금 배열이 3줄이고, 색상 '' + 사이즈 'M' + 재고 0 인 줄이 «정확히 1줄»일 때만 (값이 바뀌었으면 0행 갱신 = 아무것도 안 바뀜)
--    · 나머지 줄은 순서·내용(manual_soldout 포함) 그대로
begin;

update public.products p
set product_note = jsonb_set(
      p.product_note::jsonb,
      '{stock_variants}',
      (
        select jsonb_agg(t.e order by t.ord)
        from jsonb_array_elements(p.product_note::jsonb->'stock_variants') with ordinality as t(e, ord)
        where not (
          coalesce(t.e->>'color', '') = ''
          and coalesce(t.e->>'size', '') = 'M'
          and coalesce(nullif(t.e->>'stock', ''), '0')::numeric = 0
        )
      )
    )::text
where p.id = 699
  and jsonb_array_length(p.product_note::jsonb->'stock_variants') = 3
  and (
    select count(*)
    from jsonb_array_elements(p.product_note::jsonb->'stock_variants') as e
    where coalesce(e->>'color', '') = ''
      and coalesce(e->>'size', '') = 'M'
      and coalesce(nullif(e->>'stock', ''), '0')::numeric = 0
  ) = 1;
-- 기대: UPDATE 1  (0 이면 값이 이미 바뀐 것 → rollback; 하고 ①부터 다시 확인)

-- ③ 실행 후 확인
select id,
       product_note::jsonb->'stock_variants' as stock_variants,
       stock, is_soldout
from public.products
where id = 699;
-- 기대: [{"size":"M","color":"없음","stock":10,...},{"size":"S","color":"없음","stock":1,...}]

select id, product_id, color, size, stock
from public.product_inventory_variants
where product_id = 699
order by id;
-- 참고: products 갱신 트리거(ruru_products_inventory_variants_sync_trg)가 켜져 있으면
--       PIV 도 note 기준으로 다시 만들어져 ('', 'M') 행이 사라진다.
--       ('', 'M', 0) 행이 그대로 남아 있으면 ↓ ④ 를 실행(이 한 행만 지움, 재고 0 이라 수량 영향 없음).

commit;

-- ④ (필요할 때만) PIV 유령 행 한 줄 제거 — 위 ③에서 ('', 'M', 0) 이 남아 있을 때만 실행
-- delete from public.product_inventory_variants
-- where product_id = 699 and color = '' and size = 'M' and stock = 0;
-- -- 기대: DELETE 1
