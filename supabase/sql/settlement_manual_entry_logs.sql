-- 루루동이 정산통계 수동 입력 수정이력 로그 테이블
-- Supabase SQL Editor에서 이 파일 내용을 1회 실행하세요.

create table if not exists public.settlement_manual_entry_logs (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.settlement_manual_entries(id) on delete set null,
  action text not null check (action in ('create', 'update', 'delete')),
  before_value jsonb,
  after_value jsonb,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists settlement_manual_entry_logs_entry_id_idx
  on public.settlement_manual_entry_logs (entry_id);

create index if not exists settlement_manual_entry_logs_created_at_idx
  on public.settlement_manual_entry_logs (created_at desc);

alter table public.settlement_manual_entry_logs enable row level security;

drop policy if exists "settlement_manual_entry_logs_read" on public.settlement_manual_entry_logs;
drop policy if exists "settlement_manual_entry_logs_insert" on public.settlement_manual_entry_logs;

create policy "settlement_manual_entry_logs_read"
on public.settlement_manual_entry_logs
for select
to anon, authenticated
using (true);

create policy "settlement_manual_entry_logs_insert"
on public.settlement_manual_entry_logs
for insert
to anon, authenticated
with check (true);
