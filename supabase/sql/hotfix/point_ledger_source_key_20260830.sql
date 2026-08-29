-- [2026-08-30] 이벤트 포인트 중복지급 근본 차단
--
-- 무슨 사고였나 (실측)
--   2026-08-29 16:58 서바이벌 이벤트에서 「쩡이」에게 2,000P 가 두 번 나갔다.
--     쩡이        지급 16:58:39.98 → 잠금 16:59:24.90  (44.9초)  ❌
--     개구쟁쟁이   지급 16:58:41.93 → 잠금 16:58:42.63  (0.7초)  ✓
--     몽상가8277  지급 16:58:43.88 → 잠금 16:58:44.52  (0.6초)  ✓
--   당첨자 줄은 쩡이도 하나뿐이었다(명단 중복 아님).
--   첫 지급 뒤 '지급완료' 잠금(is_reward_done) 마킹이 실패했고,
--   잠기지 않은 44초 사이에 화면이 다시 돌아 또 지급됐다.
--   2026-07-05 쥬쥬엉니 2,000P 와 같은 원인. 그때 넣은 '3회 재시도'로는 못 막았다.
--
-- 왜 못 막았나
--   중복 방지가 화면(클라이언트)에 있었다 —
--     ① 세션 메모리: 새로고침하면 사라진다
--     ② is_reward_done: 돈이 나간 "뒤"에 거는 잠금
--   돈이 먼저 나가고 잠금이 나중이라, 그 사이가 뚫리면 무조건 중복이다.
--
-- 이 스크립트가 하는 일
--   포인트 원장에 source_key 를 추가하고 유니크를 건다.
--   같은 당첨자 줄(event_winner:<winnerId>)로는 DB 가 두 번째 저장을 거부한다.
--   → 화면이 몇 번을 부르든 돈은 한 번만 나간다.
--
-- 안전
--   · ADD COLUMN only. 기존 컬럼/데이터/제약 무변경
--   · 기존 이력은 전부 source_key = NULL 이고, 인덱스가 NULL 을 제외하므로 영향 없음
--   · 주문 자동적립 · 주문서 포인트 사용 · 잔액 계산식은 이 스크립트와 무관
--   · 여러 번 실행해도 안전 (if not exists)

alter table public.customer_point_ledger
  add column if not exists source_key text;

comment on column public.customer_point_ledger.source_key is
'중복지급 차단 키. 같은 출처(예: event_winner:<당첨자행id>)로는 한 번만 적립된다. 비어 있으면(NULL) 제한 없음 — 수동지급/자동적립은 기존과 동일.';

-- NULL 은 제외한 부분 유니크 인덱스 → 기존 이력과 일반 지급에는 영향이 없다
create unique index if not exists customer_point_ledger_source_key_uidx
  on public.customer_point_ledger (source_key)
  where source_key is not null;

-- 확인용 (읽기 전용)
select
  column_name as 칸이름,
  data_type   as 자료형,
  is_nullable as 널허용
from information_schema.columns
where table_schema = 'public'
  and table_name = 'customer_point_ledger'
  and column_name = 'source_key';
