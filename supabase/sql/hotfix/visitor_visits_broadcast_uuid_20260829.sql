-- [2026-08-29] 접속 기록 「방송별」이 항상 비어 있던 문제 수정
--
-- 원인
--   broadcasts.id 는 UUID 다.
--   (근거: supabase/sql/broadcast_end_reports.sql
--          broadcast_id uuid not null references public.broadcasts(id))
--   그런데 어제 만든 public.visitor_visits.broadcast_id 를 bigint 로 잡았고,
--   코드에서도 Number(id) 로 숫자 변환해 UUID 가 NaN → null 이 됐다.
--   → 방송 중에 들어온 손님도 방송 번호 없이 저장돼
--     "방송별 기록 없음", "방송중 0 / 쇼핑몰 N" 으로만 보였다.
--
-- 이 스크립트가 하는 일
--   visitor_visits.broadcast_id 의 자료형을 bigint → uuid 로 바꾼다.
--
-- 안전
--   · 이 칸은 지금까지 단 한 건도 값이 들어간 적이 없다(전부 NULL).
--     그래서 아래에서 먼저 세어 보고, 값이 하나라도 있으면 스스로 중단한다.
--   · 다른 표 / 다른 칸 / 주문 · 입금 · 정산 · 배송 데이터는 건드리지 않는다.
--   · 인덱스는 자료형 변경과 함께 자동으로 다시 만들어진다.

do $$
declare
  filled_rows int;
begin
  select count(*) into filled_rows
  from public.visitor_visits
  where broadcast_id is not null;

  if filled_rows > 0 then
    raise exception
      '중단합니다 — broadcast_id 에 값이 들어있는 행이 %건 있습니다. 사장님께 먼저 알리세요.',
      filled_rows;
  end if;

  alter table public.visitor_visits
    alter column broadcast_id type uuid using null::uuid;

  raise notice '완료 — visitor_visits.broadcast_id 가 uuid 로 바뀌었습니다.';
end $$;

-- 확인용 (읽기 전용)
select
  column_name  as 칸이름,
  data_type    as 자료형
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'visitor_visits'
  and column_name  = 'broadcast_id';
