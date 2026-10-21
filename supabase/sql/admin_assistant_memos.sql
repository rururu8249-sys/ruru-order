-- ============================================================================
-- AI 비서 메모함 테이블 — 2026-10-22 (AI-3)
-- ============================================================================
-- ▶ 목적: 사장님이 비서 창에 막 적은 메모(원문)와, 그걸 정리한 줄(할 일·손님·상품·기억할 것)을 저장.
-- ▶ 돈 무접촉: 주문·입금·정산·포인트·재고 어떤 계산에도 쓰지 않는다. 다른 테이블 ALTER 없음.
-- ▶ 승인: 신규 테이블 = ADD COLUMN only 예외(기존 테이블 무접촉). 전례 refund_ledger·cart_clear_marks.
-- ▶ 보안: RLS on + 정책 없음 = 브라우저(anon) 전면 차단. 서버 라우트(service_role)만 읽기·쓰기.
-- ▶ 적용: Supabase SQL Editor 에서 이 파일 실행(여러 번 실행해도 안전).
-- ============================================================================

create table if not exists public.admin_assistant_memos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- raw = 사장님이 적은 원문 그대로 / todo·customer·product·note = 정리된 한 줄
  kind        text not null default 'raw',
  -- 정리된 줄이면 원문 메모 id (원문은 지우지 않는다)
  parent_id   uuid references public.admin_assistant_memos(id) on delete cascade,

  body        text not null,
  due_date    date,          -- 할 일 날짜(한국 날짜)
  who         text,          -- 손님 이름·닉네임(글자 그대로 — 식별 키 아님)
  product     text,          -- 상품 이름(글자 그대로)

  status      text not null default 'open',   -- open / done / deleted
  done_at     timestamptz,
  organized_by text           -- ai / rule (어떻게 정리됐는지)
);

create index if not exists admin_assistant_memos_status_idx on public.admin_assistant_memos (status, created_at desc);
create index if not exists admin_assistant_memos_parent_idx on public.admin_assistant_memos (parent_id);

alter table public.admin_assistant_memos enable row level security;
-- 정책 없음(일부러): anon/authenticated 는 읽기·쓰기 불가, service_role 만 가능.

-- 확인용
select 'admin_assistant_memos' as table_name,
       (select relrowsecurity from pg_class where oid = 'public.admin_assistant_memos'::regclass) as rls_on,
       (select count(*) from public.admin_assistant_memos) as rows;
