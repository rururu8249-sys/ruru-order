-- 2026-11-01 구독 인증 무료배송 — 손님이 올린 「구독중」 캡처 인증 기록(새 표 · 기존 표 무접촉)
-- RLS 켜고 정책 없음 = 손님 브라우저(anon)는 못 읽고 못 씀. 서버(service_role)만.
create table if not exists public.subscribe_verifications (
  id bigserial primary key,
  kakao_id text not null,
  customer_phone text,
  youtube_nickname text,
  channel_name text,
  status text not null default 'verified',      -- verified(통과) / rejected(불합격) / canceled(사장님이 취소)
  reason text,                                   -- 불합격 이유(손님에게 보여 준 글)
  ai_note text,                                  -- AI 가 읽은 내용(채널 이름·버튼 글자)
  image_path text,                               -- 비공개 저장소 subscribe-proofs 안 경로
  image_hash text,                               -- 같은 사진을 다른 손님이 쓰는 것 막기
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);
create index if not exists subscribe_verifications_kakao_idx on public.subscribe_verifications (kakao_id, status);
create index if not exists subscribe_verifications_hash_idx on public.subscribe_verifications (image_hash);
create index if not exists subscribe_verifications_created_idx on public.subscribe_verifications (created_at desc);
alter table public.subscribe_verifications enable row level security;

-- 확인: select count(*) from public.subscribe_verifications;
