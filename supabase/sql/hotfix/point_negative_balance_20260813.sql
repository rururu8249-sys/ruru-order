-- [2026-08-13 사장님 요청] 반품(환불) 포인트 회수 — 잔액 부족 시 마이너스 잔액 허용.
-- 기존: current_points >= 0, balance_after >= 0 체크 제약 → 회수할 잔액이 없으면 회수가 아예 실패.
-- 지시: "회수할 포인트가 없다 그럼 마이너스 표시" → 제약을 완화한다.
-- 영향 분석:
--   - 포인트 '사용'은 사용 전 잔액 검증을 거치므로, 마이너스 잔액 고객은 잔액이 양수가 될 때까지 사용 불가(정상).
--   - 지급/적립 로직은 잔액에 더하기만 하므로 무영향.
alter table public.customer_point_balances
  drop constraint if exists customer_point_balances_current_points_check;
alter table public.customer_point_ledger
  drop constraint if exists customer_point_ledger_balance_after_check;

-- 검증: 남은 체크 제약 목록 (위 두 개가 없어야 정상)
select conname
from pg_constraint
where conrelid in ('public.customer_point_balances'::regclass, 'public.customer_point_ledger'::regclass)
  and contype = 'c'
order by conname;
