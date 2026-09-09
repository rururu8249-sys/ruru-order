-- ============================================================
-- [2026-09-09] 떠나려는 손님 «포인트 쪽지» 154건 다시 띄우기
--   ★ 운영 DB 실행 완료 — 다시_띄운_건수 = 154
--
--   무슨 일이었나
--     2026-09-05~09 「💌 포인트를 넣어드렸어요」 쪽지를 155건 보냈다.
--     그런데 보내는 쪽(AdminLiveLoyaltyReport)이 «표시 기간»을 안 줘서 기본 12시간이 붙었고,
--     받는 사람은 «45일 넘게 안 온 손님»이라 12시간 안에 들어올 리가 없었다.
--     → 포인트(돈)는 나갔는데 손님은 받은 줄도 모른 채 알림이 사라졌다.
--
--   이 SQL 이 하는 일
--     만료일을 10년 뒤로 밀고 화면표시(is_active)를 켠다. 손님이 «보고 닫을 때까지» 뜬다.
--     ⚠ 돈은 1원도 움직이지 않는다. 포인트는 보낼 때 이미 지급됐다(재지급 아님).
--
--   안전핀 (하나라도 어긋나면 그 줄은 건드리지 않는다)
--     kind='admin_note'  ·  seen_at is null(안 읽음)
--     dismissed_at is null(안 닫음)  ·  revoked_at is null(회수 안 함)
--
--   실행 후 실측
--     포인트쪽지 전체 155 / 이제 팝업 뜸 154 / 이미 읽어서 안 건드린 것 1 / 백업 154줄
--
--   되돌리기
--     update customer_site_alerts a
--     set expires_at = b.expires_at, is_active = b.is_active
--     from customer_site_alerts_backup_20260909_point b where a.id = b.id;
-- ============================================================

-- [1] 되돌릴 수 있게 백업 (id + 옛 만료일 + 옛 표시상태)
create table if not exists customer_site_alerts_backup_20260909_point as
select id, expires_at, is_active from customer_site_alerts
where kind = 'admin_note' and title like '%포인트를 넣어%'
  and seen_at is null and dismissed_at is null and revoked_at is null;

-- [2] 만료를 10년 뒤로 + 화면표시 켜기
with fixed as (
  update customer_site_alerts
  set is_active = true, expires_at = now() + interval '10 years'
  where kind = 'admin_note' and title like '%포인트를 넣어%'
    and seen_at is null and dismissed_at is null and revoked_at is null
  returning id
)
select count(*) as "다시_띄운_건수" from fixed;

-- [3] 검수 — 손님 팝업 조건 그대로 (customer-site-alerts/route.ts:148~150)
select
  count(*) as "포인트쪽지_전체",
  count(*) filter (where is_active = true and dismissed_at is null and expires_at > now()) as "이제_팝업뜸",
  count(*) filter (where seen_at is not null) as "이미읽음_건드리지않음"
from customer_site_alerts
where kind = 'admin_note' and title like '%포인트를 넣어%';
