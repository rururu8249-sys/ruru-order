-- Read-only YouTube viewer cache. Tokens remain in the existing OAuth integration.
create table if not exists public.chat_view_youtube_cache (
 broadcast_id uuid primary key references public.broadcasts(id) on delete cascade,
 state jsonb not null default '{}'::jsonb,
 version bigint not null default 0,
 lease_until timestamptz not null default 'epoch',
 next_poll_at timestamptz not null default 'epoch',
 updated_at timestamptz not null default now()
);
alter table public.chat_view_youtube_cache enable row level security;
revoke all on public.chat_view_youtube_cache from public, anon, authenticated;
grant select, insert, update, delete on public.chat_view_youtube_cache to service_role;
