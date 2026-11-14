-- [2026-11-15 사장님 「가입 회원에게 방송 화면 조작 권한을 편하게」] 방송 화면 권한 표.
--   주인 = 카카오 계정(kakao_id) — 전화번호가 바뀌어도 권한이 따라감(고객 식별 원칙).
--   서버(service_role)만 읽고 씀. 손님(anon/authenticated) 접근 없음. 돈·주문·입금 무관.
create table if not exists public.live_member_roles (
  kakao_id text primary key,
  perms text[] not null default '{}',
  badge text null check (badge is null or badge in ('crown','crown_pink')),
  nickname text null,
  updated_at timestamptz not null default now(),
  updated_by text null
);
alter table public.live_member_roles enable row level security;
revoke all on table public.live_member_roles from anon, authenticated;

-- 지금 권한 그대로 옮겨 넣기(이미 있으면 안 바꿈)
insert into public.live_member_roles (kakao_id, perms, badge, nickname, updated_by) values
  ('4774935609', array['owner','host','moderate','test','persona'], 'crown_pink', '루루동이', 'seed'),
  ('4980919533', array['moderate','test','persona'], null, '김현아', 'seed'),
  ('4792360996', array['moderate'], null, '보라해쥬', 'seed'),
  ('4787237482', array['moderate'], null, '에이치더블', 'seed'),
  ('4793412626', array['moderate'], null, '동쓰', 'seed'),
  ('4911686715', array['moderate'], null, '개구쟁이', 'seed')
on conflict (kakao_id) do nothing;
