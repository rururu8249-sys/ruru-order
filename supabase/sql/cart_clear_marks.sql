-- [㉛ 2026-10-17] 장바구니 「비움 기록」 — 관리자 비우기·제출·만료 후 옛 장바구니가 되살아나지 않게 하는 서버 기준.
--   표시용 선점(cart_reservations)만 다루는 보조 테이블. 주문·재고·금액·입금·포인트 무관.
--   새 테이블만 만든다(기존 테이블·함수 무변경). 서버(service_role) 전용 — RLS 켜고 정책 없음.
--
--   규칙: 손님 화면은 상품을 담을 때 그때 받은 「현재 seq」를 상품에 붙인다.
--         이 손님(세션키 / kakao_id 우선·없으면 전화)에게 그 seq 보다 큰 비움 기록이 있으면 그 줄은 거절된다.
--         product_id 가 비어 있으면 장바구니 전체, 채워져 있으면 그 상품·옵션(color/size, 「없음」→'')만.
--
--   실행 순서: ① 이 파일 전체 실행 → ② 아래 확인 SELECT 결과가 0행/정상인지 확인 → ③ 「SQL 완료」 알림 → 배포.

create table if not exists public.cart_clear_marks (
  seq            bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  reason         text not null check (reason in ('admin_clear', 'admin_clear_all', 'submitted', 'expired')),
  session_key    text,
  kakao_id       text,
  customer_phone text,
  product_id     text,
  color          text,
  size           text
);

create index if not exists cart_clear_marks_session_idx on public.cart_clear_marks (session_key, seq) where session_key is not null;
create index if not exists cart_clear_marks_kakao_idx   on public.cart_clear_marks (kakao_id, seq) where kakao_id is not null;
create index if not exists cart_clear_marks_phone_idx   on public.cart_clear_marks (customer_phone, seq) where customer_phone is not null;

alter table public.cart_clear_marks enable row level security;
revoke all on public.cart_clear_marks from anon, authenticated;

comment on table public.cart_clear_marks is
'[㉛] 장바구니 비움 기록(관리자 비우기·제출·만료). seq 보다 먼저 담긴 장바구니 줄은 동기화 때 거절. 표시용 선점 전용 — 주문/재고/돈 무관. service_role 전용.';

-- 확인(실행 후):
-- select count(*) as rows, max(seq) as max_seq from public.cart_clear_marks;          -- 0행, max_seq null 이면 정상
-- select relrowsecurity from pg_class where oid = 'public.cart_clear_marks'::regclass; -- true 면 정상
