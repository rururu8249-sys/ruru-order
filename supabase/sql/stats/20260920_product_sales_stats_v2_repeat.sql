-- ============================================================
-- 상품 통계 자동 배지 2단계 — «재구매» 집계 추가  (2026-09-20)
-- 사장님 요청: «매번 배지 선택 등록하기 귀찮으니 알아서 통계적으로 붙었으면»
--
-- ⚠ 랜덤 배지는 만들지 않았습니다.
--    실제로 마감이 아닌데 「마감임박」이 뜨면 거짓 표시(표시광고법 위험)이고,
--    손님이 한 번 알아채면 나머지 진짜 배지까지 안 믿게 됩니다.
--    대신 «사실인 통계»만 자동으로 붙입니다.
--
-- 1단계 SQL(20260920_product_sales_stats.sql)을 먼저 실행하셨어야 합니다.
--
-- 안전 설계 (1단계와 동일)
--  · products 에 ADD COLUMN 만. orders 는 읽기만
--  · 고객 페이지는 products 를 select("*") 로 읽으므로 «추가 쿼리 0»
--  · 재구매 판정은 재구매율 리포트와 «같은» 기준:
--      고객 식별 = kakao_id 우선, 없으면 전화번호(숫자만)
--      구매 1건  = order_group_id 1개
--      2건 이상 산 고객 = 재구매 고객
-- ============================================================

alter table products add column if not exists repeat_buyer_count integer not null default 0;

create or replace function refresh_product_sales_stats()
returns table (updated_products integer, sum_qty bigint, sum_repeat bigint)
language plpgsql
set search_path = public
as $$
declare
  v_updated integer;
  v_total   bigint;
  v_repeat  bigint;
begin
  update products p
     set sold_qty_total     = coalesce(j.total,  0)::int,
         sold_qty_30d       = coalesce(j.d30,    0)::int,
         repeat_buyer_count = coalesce(j.repeats, 0)::int,
         sold_stat_at       = now()
    from (
      select
        p2.id       as pid,
        a.total     as total,
        a.d30       as d30,
        r.repeats   as repeats
      from products p2
      -- 판매 수량 집계
      left join (
        select s.pid,
               sum(s.qty)                                                   as total,
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
        where s.is_test = false and s.is_del = false
          and s.st ~* '입금확인|자동입금확인|수동입금확인|카드결제완료|결제완료|출고대기|출고완료|킵|픽업'
          and s.st !~* '취소|환불|cancel|refund|테스트'
        group by s.pid
      ) a on a.pid = p2.id::text
      -- 재구매 고객 수 집계 (2번 이상 산 사람이 몇 명인가)
      left join (
        select b.pid, count(*)::bigint as repeats
        from (
          select s.pid, s.buyer
          from (
            select
              o.product_id::text as pid,
              coalesce(
                nullif(trim(to_jsonb(o) ->> 'kakao_id'), ''),
                'p:' || regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g')
              )                                              as buyer,
              coalesce(nullif(trim(to_jsonb(o) ->> 'order_group_id'), ''), o.id::text) as grp,
              concat_ws(' ',
                to_jsonb(o) ->> 'order_manage_status',
                to_jsonb(o) ->> 'order_status',
                to_jsonb(o) ->> 'admin_order_status_v2',
                to_jsonb(o) ->> 'shipping_status'
              )                                              as st,
              coalesce((to_jsonb(o) ->> 'is_test_order')::boolean, false) as is_test,
              coalesce((to_jsonb(o) ->> 'is_deleted')::boolean,    false) as is_del
            from orders o
            where o.product_id is not null
          ) s
          where s.is_test = false and s.is_del = false
            and s.buyer <> 'p:'
            and s.st ~* '입금확인|자동입금확인|수동입금확인|카드결제완료|결제완료|출고대기|출고완료|킵|픽업'
            and s.st !~* '취소|환불|cancel|refund|테스트'
          group by s.pid, s.buyer
          having count(distinct s.grp) >= 2
        ) b
        group by b.pid
      ) r on r.pid = p2.id::text
    ) j
   where p.id = j.pid;

  get diagnostics v_updated = row_count;
  select coalesce(sum(sold_qty_total), 0), coalesce(sum(repeat_buyer_count), 0)
    into v_total, v_repeat
    from products;
  return query select v_updated, v_total, v_repeat;
end;
$$;

-- 지금 한 번 돌린다
select * from refresh_product_sales_stats();

-- ============================================================
-- 결과 확인 — 배지 기준선 점검용
-- (다) 재구매가 많은 상품 상위 15개
select product_name, repeat_buyer_count as "재구매고객수", sold_qty_total as "누적판매", sold_qty_30d as "최근30일"
from products
where repeat_buyer_count > 0
order by repeat_buyer_count desc
limit 15;

-- (라) 기준선별 상품 수 — 「🔁 N명 재구매」와 「📈 최근 30일」이 몇 개에 붙는지
select
  count(*)                                          as "전체상품",
  count(*) filter (where repeat_buyer_count >= 2)   as "재구매2명이상",
  count(*) filter (where repeat_buyer_count >= 3)   as "재구매3명이상",
  count(*) filter (where repeat_buyer_count >= 5)   as "재구매5명이상",
  count(*) filter (where sold_qty_30d >= 5)         as "최근30일5개이상",
  count(*) filter (where sold_qty_30d >= 10)        as "최근30일10개이상"
from products;
