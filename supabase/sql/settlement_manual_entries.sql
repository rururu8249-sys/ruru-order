-- 루루동이 정산통계 수동 매출/지출 입력 테이블
-- Supabase SQL Editor에서 이 파일 내용을 1회 실행하세요.

create table if not exists public.settlement_manual_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('income', 'expense')),
  title text not null,
  amount numeric(14,0) not null check (amount >= 0),
  memo text,
  entry_date date not null,
  broadcast_key text,
  broadcast_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists settlement_manual_entries_entry_date_idx
  on public.settlement_manual_entries (entry_date desc);

create index if not exists settlement_manual_entries_broadcast_key_idx
  on public.settlement_manual_entries (broadcast_key);

create index if not exists settlement_manual_entries_active_idx
  on public.settlement_manual_entries (is_active);

create or replace function public.set_settlement_manual_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists settlement_manual_entries_updated_at
  on public.settlement_manual_entries;

create trigger settlement_manual_entries_updated_at
before update on public.settlement_manual_entries
for each row
execute function public.set_settlement_manual_entries_updated_at();

alter table public.settlement_manual_entries enable row level security;

drop policy if exists "settlement_manual_entries_read" on public.settlement_manual_entries;
drop policy if exists "settlement_manual_entries_insert" on public.settlement_manual_entries;
drop policy if exists "settlement_manual_entries_update" on public.settlement_manual_entries;

create policy "settlement_manual_entries_read"
on public.settlement_manual_entries
for select
to anon, authenticated
using (true);

create policy "settlement_manual_entries_insert"
on public.settlement_manual_entries
for insert
to anon, authenticated
with check (true);

create policy "settlement_manual_entries_update"
on public.settlement_manual_entries
for update
to anon, authenticated
using (true)
with check (true);
