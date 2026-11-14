-- [2026-11-15] 관리자 「+ 등록상품」으로 넣은 브랜드 묶음 줄 3개를 손님 주문과 같은 모양으로(표시용 칸만)
--   예전: 상품명=버버리 / 색상=「BB-60 / 없음」  →  상품명=BB-60 / 색상=없음
--   금액·상태·재고 칸 무접촉. 세 줄 모두 picked_at 비어 있어 「다시 챙기기」 안 뜸(확인됨).
--   되돌리기: 맨 아래 주석.
create table if not exists ruru_brand_row_shape_backup_20261115 as
  select id, product_name, color, now() as saved_at from orders where id in (4025, 4002, 6889);
alter table ruru_brand_row_shape_backup_20261115 enable row level security;

update orders
   set product_name = split_part(color, ' / ', 1), color = '없음'
 where id in (4025, 4002, 6889)
   and color like '% / 없음'
   and product_name in ('미우미우', '버버리');

select o.id, o.product_name, o.color, o.size, b.product_name as old_name, b.color as old_color
  from orders o join ruru_brand_row_shape_backup_20261115 b on b.id = o.id;

-- 되돌리기:
-- update orders o set product_name = b.product_name, color = b.color from ruru_brand_row_shape_backup_20261115 b where b.id = o.id;
