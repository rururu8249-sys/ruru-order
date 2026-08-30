-- supabase/sql/hotfix/customer_site_alerts_note_20260830.sql
-- [2026-08-30] 쪽지 기능 보강 — 중복 발송 차단 + 회수
--
-- 왜 필요한가
--   ① 중복: 사장님이 「쪽지 보내기」를 두 번 누르면 손님에게 팝업이 두 번 떴다.
--      담긴현황 알림에는 2분 방어가 있는데 쪽지에는 아무 방어가 없었다.
--      (포인트 중복지급 때와 같은 사고 형태 — 화면 잠금만으로는 못 막는다)
--   ② 회수: 엉뚱한 손님에게 「입금 안 하셨어요」가 가면 돈 문제로 오해한다.
--      지금은 되돌릴 방법이 없다.
--
-- ⚠️ ADD COLUMN 만 한다. 기존 칸·데이터·인덱스는 건드리지 않는다.
--    주문·입금·정산·배송·포인트·Bankda 표와는 무관하다.

-- ① 같은 쪽지를 두 번 넣지 못하게 하는 열쇠값
alter table public.customer_site_alerts
  add column if not exists source_key text;

-- 값이 있는 줄만 유니크 — 옛 줄(NULL)은 영향 없음.
-- 서버가 사전 조회로 한 번 막고, 동시에 두 번 눌린 경우는 이 인덱스가 최종적으로 막는다.
create unique index if not exists customer_site_alerts_source_key_uidx
  on public.customer_site_alerts (source_key)
  where source_key is not null;

-- ② 회수한 시각 (누가 회수했는지는 sent_by 와 별개로 남긴다)
alter table public.customer_site_alerts
  add column if not exists revoked_at timestamptz;

alter table public.customer_site_alerts
  add column if not exists revoked_by text;

-- 「보낸 쪽지」 목록을 최신순으로 빨리 뽑기 위한 인덱스
create index if not exists idx_customer_site_alerts_kind_created
  on public.customer_site_alerts (kind, created_at desc);
