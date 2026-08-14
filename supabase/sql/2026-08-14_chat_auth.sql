-- [2026-08-14] 채팅 주문봇 5단계: 채팅 계정 연결(인증코드 → 채널ID)
-- ADD COLUMN + CREATE TABLE only. youtube_nickname(입금매칭 키) 무접촉.
alter table customers add column if not exists youtube_channel_id text;
alter table customers add column if not exists youtube_handle text;
alter table customers add column if not exists handle_verified_at timestamptz;
create index if not exists idx_customers_youtube_channel_id on customers (youtube_channel_id);

create table if not exists chat_auth_codes (
  id                 bigserial primary key,
  code               text not null,
  customer_phone     text not null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  used_at            timestamptz,
  matched_channel_id text
);
create index if not exists idx_chat_auth_codes_code on chat_auth_codes (code);
alter table chat_auth_codes enable row level security;
