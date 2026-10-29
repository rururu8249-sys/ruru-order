-- [2026-10-29 사장님 「문제 있으면 고쳐, 추천 방법으로」] 7월 무통장 주문 3건 — final_amount 에 쓴 포인트가 안 빠져 있던 옛 흔적 바로잡기
-- 근거(실측): 입금액 = 총액 − 포인트 (블랙선영 입금 70,600 = 83,000−12,400 / 홈집사 157,000 = 162,000−5,000 / Borahae_Ju 포인트 24,000 전액·입금 0),
--             포인트 이력에 그 포인트 차감(adjust −12,400 / −5,000 / −24,000) 있음 → 손님은 포인트 뺀 금액만 냈음. 정산에 포인트만큼 더 잡혀 있던 것.
-- 바꾸는 칸: final_amount 하나. 총액·포인트·상태·입금·포인트 잔액 무접촉. 이 줄들은 «줄 포인트 ≤ 줄 총액»이라 포인트 이관 트리거 안 돎.
-- 제외: 에이치_더블 7/10 카드 주문(2501) — 카드로 실제 얼마 결제됐는지 기록이 없어(170,130 인지 167,130 인지) 그대로 둠.
create table if not exists public.ruru_final_fix_backup_20261029 as
  select id, final_amount, now() as backed_up_at from public.orders where id in (2399, 2449, 2701, 2702);
alter table public.ruru_final_fix_backup_20261029 enable row level security;

update public.orders set final_amount = 70600 where id = 2399 and final_amount = 83000 and point_used_amount = 12400;
update public.orders set final_amount = 78000 where id = 2449 and final_amount = 83000 and point_used_amount = 5000;
update public.orders set final_amount = 0     where id = 2701 and final_amount = 14000 and point_used_amount = 14000;
update public.orders set final_amount = 0     where id = 2702 and final_amount = 10000 and point_used_amount = 10000;

-- 되돌리기: update public.orders o set final_amount = b.final_amount from public.ruru_final_fix_backup_20261029 b where o.id = b.id;
