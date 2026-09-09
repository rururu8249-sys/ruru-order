-- ============================================================
-- [2026-09-09] customer_link_requests — «계정 연결 요청» 접수함 (1단계)
--   ★ 2026-09-09 운영 DB 에 실행 완료 (테이블있나=1 · 칸개수=16 · 요청건수=0)
--
--   왜 만드나 (용서린 사고)
--     손님이 카톡 계정을 바꾸면 우리 눈엔 «남»이 된다.
--     예전 닉네임을 다시 쓰려 하면 중복 검사에 막히는데, 지금까지는 막다른 안내뿐이라
--     손님이 갇혔다 → 사장님이 카톡으로 일일이 설명하고 손으로 병합했다.
--
--   이 테이블이 하는 일 (딱 «접수»까지만)
--     손님: "이 닉네임, 예전에 제가 쓰던 거예요. 예전 번호는 010-…예요"
--       → 서버가 (닉네임 + 그 번호) 로 실제 회원이 있는지 확인한 뒤 여기에 한 줄 남긴다.
--     사장님: 관리자 «고객·이슈 → 계정 연결 요청» 탭에서 목록으로 본다.
--
--   ⚠ 돈·포인트·주문·입금·정산·배송 무접촉. 이 테이블은 아무 것도 «옮기지» 않는다.
--      실제 병합은 2단계(사장님 [합치기] 버튼).
--
--   보안: RLS 켜고 정책을 «만들지 않는다» → anon 키(손님 브라우저)로는 접근 불가.
--         읽기·쓰기는 전부 서버(service_role) API 를 통해서만.
-- ============================================================

create table if not exists public.customer_link_requests (
  id uuid primary key default gen_random_uuid(),

  nickname text not null,                 -- 손님이 쓰려던(=충돌난) 닉네임
  claimed_phone text not null,            -- "예전에 이 번호로 주문했어요" (숫자만)

  target_customer_id bigint,              -- 서버가 찾아낸 기존 회원 (확인 성공 시에만)
  target_customer_phone text,
  target_customer_name text,

  new_kakao_id text,                      -- 요청을 보낸 «새 카톡» 쪽
  new_kakao_nickname text,
  new_customer_phone text,

  temp_nickname text,                     -- 확인되는 동안 쓰라고 내준 임시 닉네임 (예: 용서린7473)

  status text not null default 'pending', -- pending(대기) | done(합침) | rejected(아님)

  admin_memo text not null default '',
  handled_by text,
  handled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_link_requests_status_idx
  on public.customer_link_requests (status, created_at desc);
create index if not exists customer_link_requests_nickname_idx
  on public.customer_link_requests (nickname);
create index if not exists customer_link_requests_claimed_phone_idx
  on public.customer_link_requests (claimed_phone);

alter table public.customer_link_requests enable row level security;
-- 정책 없음 = anon 키로 접근 불가 (서버 service_role 전용)

-- 확인
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'customer_link_requests') as "테이블있나",
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_link_requests') as "칸개수",
  (select count(*) from public.customer_link_requests) as "요청건수";
