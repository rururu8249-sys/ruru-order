-- [2026-08-14] 채팅 주문봇 4단계: 손님 배너 "담음" 표시 컬럼
-- ADD COLUMN only. 표시 전용 — 대기열 소진/재고/주문/돈 로직 무접촉.
alter table chat_orders add column if not exists claimed_at timestamptz;
alter table chat_orders add column if not exists claimed_by text;
