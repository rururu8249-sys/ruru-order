-- [2026-11-09] 「지금 접속」 실시간 보기 — 손님 신호에 카카오 계정·지금 하는 일 칸 추가 (ADD COLUMN only)
--   kakao_id    : 손님 카카오 계정(고객 식별 키) → 장바구니·오늘 주문을 정확히 연결
--   activity    : 지금 하는 일 종류(browse/option/cart/sheet/submitted/lookup)
--   activity_label / activity_at : 상품명 등 라벨·시각
-- 실행 전에도 접속 신호는 끊기지 않는다(칸 없으면 그 값만 빼고 저장).
alter table public.visitor_presence add column if not exists kakao_id text;
alter table public.visitor_presence add column if not exists activity text;
alter table public.visitor_presence add column if not exists activity_label text;
alter table public.visitor_presence add column if not exists activity_at timestamptz;
create index if not exists visitor_presence_kakao_id_idx on public.visitor_presence (kakao_id);
