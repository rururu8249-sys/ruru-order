-- supabase/sql/live_chat.sql
-- [2026-11-10] 「방송 보며 주문」 ③단계 — 사이트 채팅(유튜브 채팅과 따로).
--   새 표 2개만 만든다(기존 표 무접촉). 둘 다 RLS 켜고 정책 없음 = 손님 브라우저는 못 읽고 못 씀.
--   읽기·쓰기는 서버 주소(/api/live-chat · /api/admin-live/live-chat, service_role)만.
--   새 글·지운 글은 트리거가 «소식(Broadcast)»으로 보낸다 — 주제 'ruru-live' · 이벤트 'chat'.
--     소식 내용: 글 번호·방송·닉네임·내용·시각·지워짐 여부만(카카오 계정·전화·이름 없음 — 닉네임·내용은 원래 공개 채팅).
--   소식이 실패해도 글 저장은 막지 않는다(EXCEPTION 삼킴).
--   되돌리기: 맨 아래 주석.

create table if not exists public.live_chat_messages (
  id bigserial primary key,
  broadcast_id uuid not null,
  kakao_id text not null,
  customer_id bigint,          -- customers.id(숫자)
  nickname text not null,
  body text not null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by text
);
create index if not exists live_chat_messages_bc_idx on public.live_chat_messages (broadcast_id, id desc);
create index if not exists live_chat_messages_kakao_idx on public.live_chat_messages (kakao_id, id desc);
alter table public.live_chat_messages enable row level security;

create table if not exists public.live_chat_bans (
  id bigserial primary key,
  kakao_id text not null,
  nickname text,
  until_at timestamptz,          -- null = 해제할 때까지(차단)
  reason text,
  created_at timestamptz not null default now(),
  lifted_at timestamptz          -- 풀어 준 시각
);
create index if not exists live_chat_bans_kakao_idx on public.live_chat_bans (kakao_id, id desc);
alter table public.live_chat_bans enable row level security;

create or replace function public.ruru_live_chat_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'type', TG_OP,
        'id', NEW.id,
        'broadcast_id', NEW.broadcast_id,
        'nickname', NEW.nickname,
        'body', case when NEW.hidden_at is null then NEW.body else '' end,
        'created_at', NEW.created_at,
        'hidden', NEW.hidden_at is not null
      ),
      'chat',
      'ruru-live',
      false
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists trg_ruru_live_chat_event on public.live_chat_messages;
create trigger trg_ruru_live_chat_event
after insert or update of hidden_at on public.live_chat_messages
for each row execute function public.ruru_live_chat_event();

-- 되돌리기:
-- drop trigger if exists trg_ruru_live_chat_event on public.live_chat_messages;
-- drop function if exists public.ruru_live_chat_event();
-- drop table if exists public.live_chat_bans;
-- drop table if exists public.live_chat_messages;
