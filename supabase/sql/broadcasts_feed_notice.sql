-- [2026-09-13] 방송별 «📢 상품 안내» — 상품관리 「📢 채팅」 버튼을 누르면 주문·입금 알림 위젯에 한 줄로 뜬다.
--   사장님 요청: 「채팅 버튼 = 복사도 되면서 위젯에도 자동 표시. 대신 노출 시간은 공지·주문알림보다 길게」
--   feed_pin_text(📌 고정 공지)와 같은 자리·같은 성격: «이번 방송»의 속성 → 방송 끝나면 같이 끝난다.
--   feed_notice_at 은 «언제 눌렀나» — 위젯이 이 시각 기준 30초만 띄우고 스스로 내린다(지우는 쓰기 없음).
--
--   ADD COLUMN only. NULL = 안내 없음. 기존 방송 전부 NULL → 회귀 없음.
--   이 두 컬럼만 갱신하며 방송 상태·정산·주문·입금·재고·채팅 현재상품 로직과 무관(표시 전용).
--
--   ⚠️ Supabase SQL Editor에서 직접 실행해야 적용됨(커밋만으로는 미적용).
--   미실행 시: 위젯은 컬럼이 없으면 undefined → 안내 없음으로 그려 무크래시,
--             「📢 채팅」 버튼의 기존 동작(현재상품 지정 + 클립보드 복사)도 그대로. 위젯 표시만 안 됨.

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS feed_notice_text text,
  ADD COLUMN IF NOT EXISTS feed_notice_at timestamptz;

COMMENT ON COLUMN broadcasts.feed_notice_text IS '방송별 📢 상품 안내(주문·입금 알림 위젯 한 줄). 「📢 채팅」 버튼이 씀. NULL=없음';
COMMENT ON COLUMN broadcasts.feed_notice_at IS '📢 상품 안내를 띄운 시각. 위젯이 이 시각 +30초까지만 표시';
