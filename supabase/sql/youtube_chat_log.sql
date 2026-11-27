-- supabase/sql/youtube_chat_log.sql
-- [2026-11-27] 유튜브 채팅 기록(사장님: «채팅으로 주문했다»고 하는 손님 대화 돌려보기).
--   1분 기록기(cron live-metrics)가 읽은 유튜브 라이브 채팅을 그대로 저장. 새 표만 만듦(기존 표 무접촉).
--   손님(anon·authenticated)은 못 읽음 — 서버(service_role) 전용, 관리자 화면은 서버 주소로만 읽음.
create table if not exists public.youtube_chat_log (
  id bigserial primary key,
  message_id text not null unique,
  broadcast_id uuid,
  live_chat_id text,
  channel_id text,
  author_name text not null default '',
  is_owner boolean not null default false,
  is_bot boolean not null default false,
  message text not null default '',
  order_like boolean not null default false,
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists youtube_chat_log_bc_time on public.youtube_chat_log (broadcast_id, published_at);
create index if not exists youtube_chat_log_author on public.youtube_chat_log (lower(author_name));
create index if not exists youtube_chat_log_channel on public.youtube_chat_log (channel_id);
alter table public.youtube_chat_log enable row level security;
revoke all on table public.youtube_chat_log from anon, authenticated;
revoke all on sequence public.youtube_chat_log_id_seq from anon, authenticated;
