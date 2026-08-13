-- [2026-08-14] 채팅 주문봇 0~1단계: 읽기 대기열 + 쿼터 실측
-- CREATE TABLE only. 기존 테이블 무변경.
create table if not exists chat_orders (
  id           bigserial primary key,
  message_id   text unique not null,
  live_chat_id text,
  channel_id   text,
  display_name text,
  raw_message  text,
  published_at timestamptz,
  parse_status text not null default 'raw',
  created_at   timestamptz not null default now()
);
create index if not exists idx_chat_orders_id_desc on chat_orders (id desc);
create index if not exists idx_chat_orders_channel on chat_orders (channel_id);
alter table chat_orders enable row level security;

create table if not exists youtube_api_usage (
  id     bigserial primary key,
  day    date not null,
  method text not null,
  calls  integer not null default 0,
  unique (day, method)
);
alter table youtube_api_usage enable row level security;
