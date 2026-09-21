-- 2026-09-21 고객이슈 «수정하면 전화번호가 삭제됨» 사고 복구
--
-- 무슨 일이 있었나
--   고객이슈 [수정]은 본문을 «메모»로 통째로 덮어썼다. 본문에만 있던
--   전화번호·닉네임·이름 줄이 그때 지워졌다. (코드는 237c7a9 다음 커밋에서 고쳤다)
--
-- 이 SQL 이 하는 일
--   본문에 「주문번호: RURU-…」는 남아 있으므로, 그 주문번호로 orders 에서
--   전화번호를 찾아 본문 «맨 앞»에 「전화번호: 010…」 한 줄을 되살린다.
--
-- 안전
--   · admin_tasks.body «만» 바꾼다. 주문·입금·정산·재고·포인트 무접촉
--   · 이미 전화번호 줄이 있는 이슈는 건드리지 않는다
--   · 주문번호를 못 찾거나 orders 에 번호가 없으면 건너뛴다
--   · 1번(미리보기)을 먼저 돌려 «무엇이 바뀔지» 눈으로 확인한 뒤 2번을 실행할 것

-- ── 1) 미리보기 — 무엇이 복구되는지 먼저 본다 (아무것도 바꾸지 않음) ──
select
  t.id,
  t.title,
  substring(t.body from '주문번호: ([A-Za-z0-9-]+)') as 주문번호,
  o.customer_phone                                   as 되살릴_전화번호,
  t.body                                             as 지금_본문
from admin_tasks t
join lateral (
  select o2.customer_phone
  from orders o2
  where o2.order_lookup_code = substring(t.body from '주문번호: ([A-Za-z0-9-]+)')
    and coalesce(o2.customer_phone, '') <> ''
  limit 1
) o on true
where t.body not like '%전화번호:%'
  and t.body like '%주문번호:%'
order by t.id desc;

-- ── 2) 실제 복구 — 위 목록이 맞으면 이 블록만 실행 ──
-- update admin_tasks t
-- set body = '전화번호: ' || o.customer_phone || E'\n' || t.body
-- from lateral (
--   select o2.customer_phone
--   from orders o2
--   where o2.order_lookup_code = substring(t.body from '주문번호: ([A-Za-z0-9-]+)')
--     and coalesce(o2.customer_phone, '') <> ''
--   limit 1
-- ) o
-- where t.body not like '%전화번호:%'
--   and t.body like '%주문번호:%';
