-- 2026-11-27 단톤 플리스 가디건(상품 828) 주문서 사이즈 표기 고치기
-- 상품은 11/27 00:21 에 S(44)/M(46)/L(48) → S(34)/M(36)/L(38) 로 바뀜(사장님).
-- 그 전에 들어온 주문 33줄(손님 30명대)은 아직 S(44)/M(46)/L(48) 로 남아 있음 → 같은 물건, 글자만 바꿈.
-- 돈(금액·입금·포인트) 칸은 안 건드림. 이미 챙긴 28줄은 사이즈 글자가 바뀌면
-- «다시 챙기기» 표시가 자동으로 붙기 때문에(orders_manage_repick_attention) 챙김 상태를 백업 값으로 되돌림.

-- 1) 백업
create table if not exists ruru_size_fix_backup_20261127 as
select id, size, memo, picked_at, repick_required_at, repick_before, repick_resolved_at, final_amount, total_price
from orders
where product_id = 828 and size ~ '\((44|46|48)\)';
alter table ruru_size_fix_backup_20261127 enable row level security;

-- 2) 사이즈 글자 + 주문 메모의 같은 글자만 바꿈 → 챙김 상태 원래대로
do $$ begin
  update orders o
     set size = replace(replace(replace(o.size, 'S(44)', 'S(34)'), 'M(46)', 'M(36)'), 'L(48)', 'L(38)'),
         memo = replace(replace(replace(o.memo, 'S(44)', 'S(34)'), 'M(46)', 'M(36)'), 'L(48)', 'L(38)')
   where o.id in (select id from ruru_size_fix_backup_20261127);

  update orders o
     set picked_at = b.picked_at,
         repick_required_at = b.repick_required_at,
         repick_before = b.repick_before,
         repick_resolved_at = b.repick_resolved_at
    from ruru_size_fix_backup_20261127 b
   where o.id = b.id;
end $$;

-- 3) 확인 (33줄 · 금액 같음 · 챙김 같음 · 다시 챙기기 없음)
select count(*) as rows,
       count(*) filter (where o.size ~ '\((34|36|38)\)') as fixed,
       count(*) filter (where o.final_amount is distinct from b.final_amount or o.total_price is distinct from b.total_price) as money_changed,
       count(*) filter (where o.picked_at is distinct from b.picked_at) as picked_changed,
       count(*) filter (where o.repick_required_at is not null) as repick_flag
from orders o join ruru_size_fix_backup_20261127 b on b.id = o.id;

-- 되돌리기:
-- update orders o set size=b.size, memo=b.memo from ruru_size_fix_backup_20261127 b where o.id=b.id;
-- update orders o set picked_at=b.picked_at, repick_required_at=b.repick_required_at, repick_before=b.repick_before, repick_resolved_at=b.repick_resolved_at from ruru_size_fix_backup_20261127 b where o.id=b.id;
