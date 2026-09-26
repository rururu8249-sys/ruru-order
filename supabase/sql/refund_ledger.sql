-- ============================================================================
-- 교환·환불 장부 테이블 — 2026-09-26 (1단계)
-- ============================================================================
-- ▶ 목적: 교환/반품/재발송 건을 단계별로 관리하는 «장부». 기록 전용.
-- ▶ 돈 무접촉: 이 테이블은 포인트/정산/입금/재고 어떤 계산에도 쓰이지 않는다.
--   실제 이체는 은행앱, 포인트 지급/회수는 기존 경로(order-return·customer-points)만.
-- ▶ 승인: 신규 테이블 = ADD COLUMN only 예외(기존 테이블 무접촉). 전례 cart_reservations·youtube_integration.
-- ▶ 적용: Supabase SQL Editor에서 이 파일을 실행. (기존 테이블 ALTER 없음)
-- ▶ 보안: RLS on + 정책 없음 = anon(브라우저) 전면 차단. service_role(서버 라우트)만 접근.
-- ============================================================================

create table if not exists public.refund_ledger (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- 고객이슈 1건 = 장부 1줄 (UNIQUE 라 이전/생성 재실행해도 중복 안 생김). 손접수 건은 null.
  admin_task_id text unique,

  -- 주문·고객 식별(표시·연결용)
  order_group_id   text,
  order_lookup_code text,
  customer_phone   text,
  kakao_id         text,
  nickname         text,
  customer_name    text,

  -- 구분·사유·상품
  kind             text not null default '반품',        -- 교환 / 반품 / 재발송
  reason           text,
  product_snapshot jsonb not null default '[]'::jsonb,   -- [{productId,productName,color,size,qty}]

  -- 단계·다음 할 일
  stage            text not null default '접수',          -- 접수 / 회수 대기 / 도착·검수 / 처리 필요 / 완료 / 거절·취소
  next_action      text,

  -- 금액(서버가 amount_base + adjustments 합으로 amount_final 재계산해서 저장)
  amount_base      integer not null default 0,
  adjustments      jsonb not null default '[]'::jsonb,    -- [{label, amount}] (차감은 음수)
  amount_final     integer not null default 0,

  -- 처리 방법·환불 계좌
  method           text not null default '없음',          -- 계좌이체 / 포인트 / 교환재발송 / 없음
  exchange_option  text,                                  -- 교환 시 바꿀 옵션 메모
  reship_tracking  text,                                  -- 재발송 송장
  bank             text,
  account_number   text,                                  -- 숫자만 저장. done_at+30일 후 별도 SQL/지연마스킹으로 NULL
  account_holder   text,

  transferred_at   timestamptz,                           -- 「이체했어요」 체크 시각
  done_at          timestamptz,                           -- 환불완료 저장 시각
  memo             text
);

comment on table public.refund_ledger is
  '교환·환불 장부(기록 전용). 돈/포인트/정산 계산에 사용하지 않음. service_role 전용(RLS 정책 없음).';
comment on column public.refund_ledger.admin_task_id is
  '연결된 고객이슈(admin_tasks.id). UNIQUE — 고객이슈 1건 = 장부 1줄, 이전/생성 재실행 중복 방지.';
comment on column public.refund_ledger.amount_final is
  '서버가 amount_base + adjustments 합(음수 차감 반영, 0 하한)으로 재계산해 저장. 클라 값 신뢰 금지.';
comment on column public.refund_ledger.account_number is
  '숫자만. 목록/엑셀엔 뒷4자리만 노출. done_at+30일 후 NULL 처리(은행·예금주는 유지).';

-- updated_at 자동 갱신
create or replace function public.set_refund_ledger_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_refund_ledger_updated_at on public.refund_ledger;
create trigger trg_refund_ledger_updated_at
  before update on public.refund_ledger
  for each row execute function public.set_refund_ledger_updated_at();

-- 인덱스
create index if not exists idx_refund_ledger_stage on public.refund_ledger (stage);
create index if not exists idx_refund_ledger_created_at on public.refund_ledger (created_at desc);
create index if not exists idx_refund_ledger_order_group on public.refund_ledger (order_group_id);

-- RLS: 켜기만 하고 정책은 만들지 않는다 → anon(브라우저) 전면 차단. service_role 은 RLS 우회.
alter table public.refund_ledger enable row level security;
