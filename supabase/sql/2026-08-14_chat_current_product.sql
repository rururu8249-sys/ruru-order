-- [2026-08-14] 「지금 이거」 — 채팅 주문에서 상품을 말하지 않은 주문(저요/ㅈㅇ)을 붙일 대상.
--   ⚠️ 위젯 고정(products.is_pinned)과 완전히 별개. 위젯 표시 로직 무접촉.
--   변경 "이력"으로 남긴다 → 채팅 메시지의 publishedAt 시각으로 되감아 정확히 매칭하기 위함.
create table if not exists chat_current_product (
  id           bigserial primary key,
  product_id   text,
  product_name text,
  cleared      boolean     not null default false,
  set_at       timestamptz not null default now()
);
create index if not exists idx_chat_current_set_at on chat_current_product (set_at desc);
alter table chat_current_product enable row level security;
