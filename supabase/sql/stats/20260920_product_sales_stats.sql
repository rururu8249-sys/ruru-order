-- ============================================================
-- 상품별 «누적 판매 수량» 집계  (2026-09-20)
-- 목적: 손님 상품카드에 「🏆 N개 판매」 배지를 자동으로 붙이기
--
-- 안전 설계
--  · products 에 ADD COLUMN 만. 기존 컬럼·데이터 변경 0
--  · orders 는 «읽기만» 한다. 주문·입금·정산·배송 데이터를 바꾸지 않는다
--  · 고객 페이지는 products 를 select("*") 로 이미 읽고 있어 «추가 쿼리 0»
--    (화면에서 orders 를 집계하지 않는다 — 그게 예전 과부하의 원인이었다)
--  · 「판매」 판정은 새로 만들지 않고, 재구매율·회원상세에서 쓰는 «검증된 기준» 그대로 사용
--      판매로 셈 : 입금확인 / 자동입금확인 / 수동입금확인 / 카드결제완료 / 결제완료 /
--                  출고대기 / 출고완료 / 킵 / 픽업
--      제외      : 취소 / 환불 / 테스트 / is_test_order / is_deleted
--  · 상태 컬럼은 to_jsonb 로 읽는다 → 없는 컬럼이 섞여 있어도 에러 없이 건너뛴다
-- ============================================================

-- ① 집계 컬럼 (ADD COLUMN only)
alter table products add column if not exists sold_qty_total integer not null default 0;
alter table products add column if not exists sold_qty_30d   integer not null default 0;
alter table products add column if not exists sold_stat_at   timestamptz;

-- ② 집계가 빨라지도록 인덱스 (없으면 생성, 있으면 통과)
create index if not exists idx_orders_product_id on orders (product_id);

-- ③ 집계 함수 — 이 함수만 돌리면 숫자가 갱신된다
create or replace function refresh_product_sales_stats()
returns table (updated_products integer, sum_qty bigint)
language plpgsql
set search_path = public
as $$
declare
  v_updated integer;
  v_total   bigint;
begin
  update products p
     set sold_qty_total = coalesce(j.total, 0)::int,
         sold_qty_30d   = coalesce(j.d30,   0)::int,
         sold_stat_at   = now()
    from (
      -- 모든 상품 × 집계값 (판매 이력이 없으면 0으로 되돌린다 — 환불·취소 반영)
      select
        p2.id      as pid,
        a.total    as total,
        a.d30      as d30
      from products p2
      left join (
        select
          s.pid,
          sum(s.qty)                                                 as total,
          sum(s.qty) filter (where s.at >= now() - interval '30 days') as d30
        from (
          select
            o.product_id::text                   as pid,
            greatest(coalesce(o.qty, 0)::int, 0) as qty,
            o.created_at                         as at,
            concat_ws(' ',
              to_jsonb(o) ->> 'order_manage_status',
              to_jsonb(o) ->> 'order_status',
              to_jsonb(o) ->> 'admin_order_status_v2',
              to_jsonb(o) ->> 'shipping_status'
            )                                    as st,
            coalesce((to_jsonb(o) ->> 'is_test_order')::boolean, false) as is_test,
            coalesce((to_jsonb(o) ->> 'is_deleted')::boolean,    false) as is_del
          from orders o
          where o.product_id is not null
        ) s
        where s.is_test = false
          and s.is_del  = false
          and s.st ~* '입금확인|자동입금확인|수동입금확인|카드결제완료|결제완료|출고대기|출고완료|킵|픽업'
          and s.st !~* '취소|환불|cancel|refund|테스트'
        group by s.pid
      ) a on a.pid = p2.id::text
    ) j
   where p.id = j.pid;

  get diagnostics v_updated = row_count;
  select coalesce(sum(sold_qty_total), 0) into v_total from products;
  return query select v_updated, v_total;
end;
$$;

-- ④ 지금 한 번 돌린다  (갱신된 상품 수 / 누적 판매 합계가 나온다)
select * from refresh_product_sales_stats();

-- ============================================================
-- ⑤ 결과 확인 — 배지 기준선을 정하기 위한 «판매 분포»
--    아래 두 표를 그대로 복사해서 알려주시면
--    「🏆 N개 판매」를 몇 개부터 붙일지 숫자로 정합니다.
--    (지금은 임시로 10개 이상에서 붙게 해 뒀습니다)
-- ============================================================

-- (가) 많이 팔린 상품 상위 20개
select product_name, sold_qty_total as "누적판매", sold_qty_30d as "최근30일"
from products
where sold_qty_total > 0
order by sold_qty_total desc
limit 20;

-- (나) 기준선별로 배지가 붙는 상품이 몇 개인지
select
  count(*)                                     as "전체상품",
  count(*) filter (where sold_qty_total >= 1)  as "1개이상",
  count(*) filter (where sold_qty_total >= 5)  as "5개이상",
  count(*) filter (where sold_qty_total >= 10) as "10개이상",
  count(*) filter (where sold_qty_total >= 20) as "20개이상",
  count(*) filter (where sold_qty_total >= 50) as "50개이상"
from products;
