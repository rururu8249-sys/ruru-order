-- 2026-11-15 자동 실행을 멈춰도(테스트 주문 삭제 전 필수) 채팅 글·알림을 숨기지 않게.
-- live_automation_control 안의 "채팅 숨김" 한 문장만 빼고 나머지 그대로 다시 만듦.
-- 원문은 ruru_fn_backup_20261115 에 보관.
create table if not exists public.ruru_fn_backup_20261115(name text primary key, def text, saved_at timestamptz default now());
alter table public.ruru_fn_backup_20261115 enable row level security;
do $$
declare d text; n text; c int;
begin
  d := pg_get_functiondef('public.live_automation_control(uuid,text,boolean,bigint)'::regprocedure);
  insert into public.ruru_fn_backup_20261115(name,def) values('live_automation_control',d) on conflict(name) do nothing;
  n := regexp_replace(d, 'update\s+public\.live_chat_messages\s+set\s+hidden_at=clock_timestamp\(\),hidden_by=''automation-ended''[^;]*;', '', 'g');
  c := (length(d)-length(replace(d,'automation-ended','')))/length('automation-ended');
  if c <> 1 or position('automation-ended' in n) > 0 then raise exception 'unexpected function body (count %)', c; end if;
  execute n;
end $$;
-- 이미 숨겨진 글 복구(백업 후)
create table if not exists public.ruru_chat_unhide_backup_20261115 as select id, hidden_at, hidden_by from public.live_chat_messages where hidden_by='automation-ended';
alter table public.ruru_chat_unhide_backup_20261115 enable row level security;
update public.live_chat_messages set hidden_at=null, hidden_by=null where hidden_by='automation-ended';
-- 되돌리기: select def from public.ruru_fn_backup_20261115 → 실행
