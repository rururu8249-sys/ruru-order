-- [읽기 전용] 꼼데 가디건 「차콜 핑크셔츠」가 어디 남아 있는지 — 데이터 안 바뀜

-- ① 상품 표: 옵션 칸마다 «셔츠» 가 들어 있는지
select p.id, p.status,
  p.color_options::text                                  as 색상칸,
  (p.product_note::text like '%셔츠%')                    as 상품메모에_셔츠,
  (select string_agg(v->>'color' || '/' || (v->>'size') || '=' || (v->>'stock'), ', ')
     from jsonb_array_elements(case when jsonb_typeof(p.product_note::jsonb->'stock_variants')='array'
                                    then p.product_note::jsonb->'stock_variants' else '[]'::jsonb end) v
    where v->>'color' like '%셔츠%')                      as 메모속_셔츠재고줄
from public.products p
where p.product_name like '%꼼데 가디건%';

-- ② 재고 표에 남은 셔츠 줄
select v.product_id, v.color, v.size, v.stock, v.updated_at at time zone 'Asia/Seoul' as 바뀐시각
from public.product_inventory_variants v
join public.products p on p.id = v.product_id
where p.product_name like '%꼼데 가디건%' and v.color like '%셔츠%';

-- ③ 어제부터 셔츠로 들어온 주문(누가·언제)
select to_char(o.created_at at time zone 'Asia/Seoul','MM-DD HH24:MI') as 주문시각,
  o.youtube_nickname as 닉네임, o.order_lookup_code as 주문번호, o.id as 줄번호,
  o.color, o.size, o.qty, o.admin_order_status_v2 as 상태
from public.orders o
join public.products p on p.id = o.product_id
where p.product_name like '%꼼데 가디건%' and o.color like '%셔츠%'
  and o.created_at >= timestamptz '2026-10-26 00:00:00+09'
order by o.created_at;

-- ④ 셔츠 이름으로 재고가 움직인 기록(어떤 작업이 셔츠 줄을 다시 만들었는지)
select to_char(l.created_at at time zone 'Asia/Seoul','MM-DD HH24:MI:SS') as 시각,
  l.reason, l.memo, l.color, l.size, l.change_qty, l.before_stock, l.after_stock, l.order_id
from public.inventory_ledger l
join public.products p on p.id = l.product_id
where p.product_name like '%꼼데 가디건%' and l.color like '%셔츠%'
  and l.created_at >= timestamptz '2026-10-26 00:00:00+09'
order by l.created_at;
