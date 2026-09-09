-- ============================================================
-- [2026-09-09] 용서린(한지후) 고객 2줄 → 1줄 병합
--
--   손님이 «카톡 계정»을 바꾸면서 회원이 갈라졌다(닉네임 중복 검사 구멍 — 같은 날 별도 수정):
--     id 91   01071437473  한지후    용서린  kakao_id 없음        주소O  주문6줄  포인트3,450
--     id 2855 01086247473  (이름없음) 용서린  kakao_id 5079103151  주소X  주문0    포인트0
--
--   방향: 옛 줄(91)을 «살리고» 카톡ID를 그쪽으로 옮긴다.
--     이유 — 포인트 ledger 6줄·balances 1줄이 전부 customer_id = 91 로 묶여 있어 이동이 최소다.
--   최종: 한 줄 = 01086247473 · 한지후 · 주소O · 주문6줄 · 포인트3,450 · kakao_id 5079103151
--
--   ★ 순서가 핵심 (트리거 ruru_sync_identity_on_phone_change 본문 실측 기준)
--     그 트리거는 customers.customer_phone 이 바뀔 때 돌면서
--       · customer_point_ledger  → 새 번호 + customer_id 갱신
--       · customer_point_balances→ 새 번호로 이관(새 번호 행이 있으면 합산 후 옛 행 삭제)
--       · customer_phone_blocks  → 새 번호
--       · orders.kakao_id        → «new.kakao_id 가 이미 채워져 있을 때만» 옛 번호 주문에 도장
--     ⚠ 주문의 «전화번호»는 트리거가 안 바꾼다 → [5][6] 에서 직접 바꾼다.
--     ⚠ 그래서 kakao_id 를 [2]에서 «먼저» 넣고, [4]에서 번호를 바꿔야 도장이 찍힌다.
--
--   ⚠ 실행 전 반드시 확인 SQL(아래 [0])이 예상대로 나오는지 볼 것.
--     admin_tasks / orders.customer_id 에 2855 참조가 있으면 [3] 삭제가 막히거나 데이터가 끊긴다.
--   실행: Supabase SQL Editor 에 전체 붙여넣기 → Run
-- ============================================================

-- [0] 실행 전 상태 (customers 2줄이어야 정상)
select id, customer_phone, customer_name, youtube_nickname, kakao_id, zipcode, detail_address
from customers where id in (91, 2855) order by id;

-- [1] 백업 — 되돌릴 수 있게 두 줄을 그대로 떠 둔다
create table if not exists customers_backup_20260909_yongseorin as
select * from customers where id in (91, 2855);

-- [2] 옛 줄(91)에 «카톡ID»만 먼저 심는다  ← 번호는 아직 그대로라 트리거는 안 돈다
update customers
set kakao_id = '5079103151'
where id = 91
  and customer_phone = '01071437473'    -- 안전핀: 이미 바뀌었으면 0건
  and kakao_id is null;                 -- 안전핀: 이미 카톡ID가 있으면 건드리지 않음

-- [3] 새 줄(2855) 삭제 — 번호 자리를 비운다 (백업은 [1]에 있음)
delete from customers
where id = 2855
  and customer_phone = '01086247473'    -- 안전핀
  and kakao_id = '5079103151';          -- 안전핀

-- [4] 옛 줄(91)의 번호를 손님이 «지금 쓰는» 번호로
--     → 여기서 트리거가 돈다: 포인트 이력·잔액 이동 + 옛 주문 6줄에 kakao_id 도장
update customers
set customer_phone = '01086247473'
where id = 91
  and customer_phone = '01071437473';   -- 안전핀

-- [5] 주문 6줄의 전화번호 통일 (트리거가 안 해주는 부분)
--     ⚠ 반드시 [4] «뒤»에 실행. [4] 전에 하면 트리거가 옛 번호 주문을 못 찾아 도장이 안 찍힌다.
update orders
set customer_phone = '01086247473', phone = '01086247473'
where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = '01071437473';

-- [6] 받는분 번호는 «주문자와 같았던» 주문만 따라 바꾼다 (선물 주문 보호 — 기존 API와 동일 규칙)
update orders
set recipient_phone = '01086247473'
where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = '01086247473'
  and regexp_replace(coalesce(recipient_phone, ''), '[^0-9]', '', 'g') = '01071437473';

-- ============================================================
-- [7] 실행 후 검증 — 아래 4개가 전부 맞아야 성공
-- ============================================================

-- ① 회원: 91 한 줄만, 번호 01086247473, kakao_id 5079103151, 한지후, 주소 있음
select id, customer_phone, customer_name, youtube_nickname, kakao_id, zipcode, detail_address
from customers where id in (91, 2855) or youtube_nickname = '용서린';

-- ② 주문: 6줄 모두 01086247473 + kakao_id 5079103151
select id, created_at, customer_phone, kakao_id, product_name, order_manage_status
from orders
where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') in ('01071437473','01086247473')
order by created_at;

-- ③ 포인트 잔액: 1줄, 01086247473, customer_id 91, current_points 3450
select customer_phone, customer_id, current_points, admin_memo from customer_point_balances
where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') in ('01071437473','01086247473');

-- ④ 포인트 이력: 새 번호로 6줄
select count(*) as ledger_rows_new, sum(amount) as sum_amount from customer_point_ledger
where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = '01086247473';
-- → ledger_rows_new = 6, sum_amount = 3450
