-- [2026-09-12] 방송별 «📌 고정 공지» — 주문·입금 피드 위젯(/order-feed-widget) 맨 위 한 줄
--   설계 근거: 고정 공지는 «이번 방송»의 속성이다 (유튜브 고정 메시지도 스트림마다 하나).
--   settings(전역)에 두면 지난 방송의 「9시 마감」이 다음 방송 시작하자마자 화면에 그대로 뜬다 → 방송별 컬럼.
--   기존 방송별 위젯 옵션(widget_card_enabled · widget_pin_*)과 같은 자리, 같은 저장 경로(/api/admin-live/catalog-write).
--
--   ADD COLUMN only. NULL/빈 문자열 = 공지 없음(위젯에 안 뜸). 기존 방송 전부 NULL → 회귀 없음.
--   이 컬럼만 갱신하며 방송 상태·정산·주문·입금·돈 로직과 무관.
--
--   ⚠️ Supabase SQL Editor에서 직접 실행해야 적용됨(커밋만으로는 미적용).
--   미실행 시: 위젯은 컬럼이 없으면 undefined → 공지 없음으로 그려 무크래시,
--             단 관리자 「📌 위젯 고정 공지」 저장은 실패(컬럼 없음)로 반영 안 됨.

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS feed_pin_text text;

COMMENT ON COLUMN broadcasts.feed_pin_text IS '방송별 📌 고정 공지(주문·입금 피드 위젯 맨 위 한 줄, 60자). NULL/빈값=없음';
