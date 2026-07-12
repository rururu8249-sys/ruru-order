-- [2026-07-12] 방송별 "위젯 상품카드 ON/OFF" 플래그
--   방송 중 위젯의 상품카드만 숨기고 싶을 때 사용(카드만 숨김·위젯 투명, 배너는 PRISM 소스라 무관).
--   ADD COLUMN only. NULL/미설정 = true(ON) 취급 → 기존 방송 전부 자동으로 ON, 회귀 없음.
--   이 컬럼만 갱신하며 방송 상태·정산·주문·돈 로직과 무관.
--
--   ⚠️ Supabase SQL Editor에서 직접 실행해야 적용됨(커밋만으로는 미적용).
--   미실행 시: 위젯은 컬럼이 없으면 undefined→ON 취급이라 정상 표시(무크래시),
--             단 관리자 "🖼 위젯 상품 ON/OFF" 토글은 저장 실패(컬럼 없음)로 반영 안 됨.

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS widget_card_enabled boolean NOT NULL DEFAULT true;
