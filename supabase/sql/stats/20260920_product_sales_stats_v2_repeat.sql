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
-- 판매 순위 백분위(0=1등 ~ 1=꼴찌). 판매가 0인 상품은 null → 순위 배지 대상 아님.
alter table products add column if not exists sales_rank_pct numeric;

-- 1단계에서 만든 같은 이름 함수는 «돌려주는 칸 수»가 달라서 create or replace 가 안 된다.
--   (ERROR 42P13: cannot change return type of existing function)
--   함수만 지우는 것이라 데이터는 하나도 안 없어진다. 바로 아래에서 다시 만든다.
drop function if exists refresh_product_sales_stats();

create or replace function refresh_product_sales_stats()
returns table (updated_products integer, sum_qty bigint, sum_repeat bigint, ranked integer)
language plpgsql
set search_path = public
as $$
declare
  v_updated integer;
  v_total   bigint;
  v_repeat  bigint;
  v_ranked  integer;
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

  -- 판매 순위 백분위 — «제일 많이 팔린 상품»을 자동으로 가려내기 위한 값.
  --   판매가 1개 이상인 상품끼리만 줄을 세운다(0개짜리가 순위를 흐리지 않게).
  --   0 = 가장 많이 팔린 상품, 1 = 그 중 가장 적게 팔린 상품.
  update products p
     set sales_rank_pct = r.pct
    from (
      select id,
             percent_rank() over (order by sold_qty_total desc) as pct
      from products
      where sold_qty_total >= 1
    ) r
   where p.id = r.id;
  get diagnostics v_ranked = row_count;

  update products set sales_rank_pct = null where sold_qty_total < 1 and sales_rank_pct is not null;

  select coalesce(sum(sold_qty_total), 0), coalesce(sum(repeat_buyer_count), 0)
    into v_total, v_repeat
    from products;
  return query select v_updated, v_total, v_repeat, v_ranked;
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

-- (라) 기준선별 상품 수 — 자동 배지가 각각 몇 개 상품에 붙는지
select
  count(*)                                            as "전체상품",
  count(*) filter (where repeat_buyer_count >= 2)     as "🔁재구매2명이상",
  count(*) filter (where sold_qty_30d >= 5)           as "📈최근30일5개이상",
  count(*) filter (where sales_rank_pct <= 0.10)      as "HOT자동_판매상위10%",
  count(*) filter (where sales_rank_pct <= 0.03)      as "루루픽자동_판매상위3%"
from products;

-- (마) 「제일 많이 팔린 상품」 자동 배지가 실제로 어디에 붙는지 눈으로 확인
select product_name,
       sold_qty_total as "누적판매",
       round(sales_rank_pct * 100, 1) as "상위%",
       case when sales_rank_pct <= 0.03 then '💖루루픽 + HOT'
            when sales_rank_pct <= 0.10 then 'HOT'
            else '' end as "자동으로 붙는 배지"
from products
where sales_rank_pct <= 0.10
order by sold_qty_total desc
limit 40;
