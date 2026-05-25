create table if not exists public.customer_phone_blocks (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  is_blocked boolean not null default true,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_phone_blocks_phone_idx
  on public.customer_phone_blocks (phone);

create index if not exists customer_phone_blocks_is_blocked_idx
  on public.customer_phone_blocks (is_blocked);
