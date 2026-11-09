-- supabase/sql/live_chat_badge_pin.sql
-- [2026-11-10] 사이트 채팅 — 닉네임 뒤 표시(badge) + 고정 댓글(pinned_at).
--   live_chat_messages 에 칸 2개만 더함(ADD COLUMN). 다른 표 무접촉.
--   소식(Broadcast) 함수에 badge·pinned 를 더 실어 보내고, 고정·고정 해제 때도 소식이 가게 트리거 칸에 pinned_at 추가.
--   badge: 'crown'(금색 왕관) / 'crown_pink'(분홍 왕관) / 'mod'(R 동그라미) / null

alter table public.live_chat_messages add column if not exists badge text;
alter table public.live_chat_messages add column if not exists pinned_at timestamptz;
-- [2026-11-10 04:1x] 닉네임 앞 카카오 프로필 사진(글 쓸 때 회원 표에서 복사)
alter table public.live_chat_messages add column if not exists avatar_url text;
create index if not exists live_chat_messages_pin_idx on public.live_chat_messages (broadcast_id, pinned_at desc) where pinned_at is not null;

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
        'hidden', NEW.hidden_at is not null,
        'badge', NEW.badge,
        'avatar_url', NEW.avatar_url,
        'pinned', NEW.pinned_at is not null and NEW.hidden_at is null
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
after insert or update of hidden_at, pinned_at on public.live_chat_messages
for each row execute function public.ruru_live_chat_event();

-- 되돌리기: live_chat.sql 의 함수·트리거를 다시 실행(칸 2개는 남겨도 무해).
