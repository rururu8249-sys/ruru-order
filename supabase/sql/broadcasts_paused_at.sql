-- [2026-11-09 사장님 「방송 대기중 기능 — 껐다 켰다 귀찮다」]
-- 방송은 ON 그대로(상품·장바구니·주문·위젯·알림 전부 그대로) 두고, 손님 화면·관리자 카드만 「잠시 쉬는 중」으로 보이게 하는 칸.
-- NULL = 방송 중, 시각 = 잠시 쉬는 중. 방송 시작·종료 때 코드가 NULL 로 비운다. ADD COLUMN only.
alter table public.broadcasts add column if not exists paused_at timestamptz;
