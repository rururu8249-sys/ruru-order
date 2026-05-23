create table if not exists public.visitor_presence (
  id bigserial primary key,
  visitor_key text not null unique,
  nickname text,
  page_type text not null default 'page',
  path text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visitor_presence_last_seen_idx
  on public.visitor_presence (last_seen_at desc);

create index if not exists visitor_presence_page_type_idx
  on public.visitor_presence (page_type);

alter table public.visitor_presence enable row level security;

drop policy if exists "visitor_presence_insert_update" on public.visitor_presence;
drop policy if exists "visitor_presence_read" on public.visitor_presence;

create policy "visitor_presence_insert_update"
on public.visitor_presence
for all
using (true)
with check (true);

create policy "visitor_presence_read"
on public.visitor_presence
for select
using (true);
