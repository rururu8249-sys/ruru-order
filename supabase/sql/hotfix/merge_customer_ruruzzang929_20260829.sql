-- ############################################################################
-- ⛔ 실행 금지 (2026-08-29 정정) — 아래 본문의 전제가 틀렸습니다. 기록용으로만 남깁니다.
--
-- 실제 DB 확인 결과 (SQL 조회로 확인, 추정 아님)
--   · customers 에 루루짱929 행은 "1개"뿐이었다 (id 1819).  2계정이 아니었다.
--   · 주문 3건 모두 이미 같은 kakao_id 5006208833 을 갖고 있었다.
--   · 손님이 주문내역을 못 본 진짜 원인:
--       주문서 「주문내역」 탭이 customer_phone 하나로만 조회했는데,
--       8/28 주문은 배송지 번호 01028495209 로 들어가 있고
--       회원 저장 번호는 01033995209 라서 걸리지 않았다.
--       (방송 종료 여부·쇼핑몰 모드와는 무관 — 조회문에 broadcast 조건 자체가 없다)
--
-- 실제로 한 조치
--   1) customers id 1819 를 사장님 지정 메인값(01028495209 / 민연숙)으로 통일 — 사장님이 직접 실행
--   2) 주문 3073 의 customer_phone 을 01028495209 로 통일 — 사장님이 직접 실행
--      → 3건 모두 01028495209 / kakao_id 5006208833, 금액·상태 변동 없음(283,550 / 73,000 / 78,110)
--   3) 근본 수정(코드):
--      · lib/customerOrderLookup.ts  : 조회를 kakao_id OR 전화번호로 (buildOrderLookupOrFilter)
--      · lib/customerIdentity.ts     : 관리자 고객목록을 카카오ID⊕전화번호로 "합치기만" 하는 식별자
--      · app/api/customer-login-sync/route.ts : 로그인 시 알려진 모든 번호로 옛 주문 소급 연결
-- ############################################################################

-- ============================================================================
-- [2026-08-29] 루루짱929 고객 2계정 → 1명으로 통합
--
-- 상황 (관리자 화면 확인값)
--   A(메인·유지)  루루짱929 · 민연숙 · 010-2849-5209 · 누적 2건 356,550원 · 포인트 2,995원
--                 2026.08.29 00:44 BB(버버리)-80 트렌치코트 283,550원 카드결제완료
--                 2026.07.25 00:04 롱샴 69,000 네이비/미디움 73,000원 자동입금확인
--   B(통합대상)   루루짱929 · 하이든 · 010-3399-5209 · 누적 1건 78,110원 · 포인트 0원
--                 2026.07.24 23:56 롱샴 69,000 네이비/미디움 78,110원 주문서취소
--                 카카오 「쑥」 · 최초 로그인 2026.07.24 23:50 · 최근 로그인 2026.08.29 08:11
--                 등록 배송지는 이미 「민연숙 010-2849-5209」가 기본으로 들어 있음
--
-- 손님이 본인 주문내역을 못 보던 이유 (코드 확인 결과, 추정 아님)
--   ① 조회 기간이 최근 7일이었다 → 7월 주문이 화면에서 사라짐
--      (이건 코드로 이미 수정함: lib/customerOrderLookup.ts, 180일로)
--   ② 손님이 실제로 로그인해 쓰는 계정은 B(하이든)인데 주문 2건은 A(민연숙)에 붙어 있다.
--      주문내역 조회는 kakao_id 우선이라, B로 로그인하면 A의 주문이 안 잡힌다.
--      → 그래서 A의 주문에 B의 kakao_id 를 찍어 주어야 손님 화면에 보인다.
--   ③ 관리자 고객목록은 전화번호로만 묶는다(buildCustomerKey) → 번호가 달라 2명으로 보였다.
--      → 취소 주문의 전화번호를 A 번호로 맞추면 1명으로 합쳐진다.
--
-- 안전 원칙
--   · 금액·결제상태·입금(deposits)·정산·포인트는 건드리지 않는다.
--   · 주문을 지우거나 새로 만들지 않는다. 식별값만 통일한다.
--   · 모든 UPDATE 에 안전핀(WHERE 조건)을 넣어, 이미 처리됐거나 대상이 다르면 0건이 되게 한다.
--   · 값을 하드코딩하지 않고 서브쿼리로 실제 DB 값을 읽어 쓴다.
--
-- 실행 방법
--   Supabase SQL Editor 에서 [0] 먼저 실행 → 결과를 확인/공유 → [1][2] 실행 → [3] 검증
--   ⚠ [0] 결과를 먼저 보고 진행하십시오. 특히 kakao_id 두 값이 예상과 같은지 확인이 필요합니다.
-- ============================================================================


-- ── [0] 실행 전 현황 확인 (읽기 전용) ──────────────────────────────────────
-- 0-1. 회원 프로필 2행
select id, youtube_nickname, customer_name, customer_phone, kakao_id,
       zipcode, address, detail_address, created_at
from customers
where customer_phone in ('01028495209', '01033995209')
   or youtube_nickname = '루루짱929'
order by created_at;

-- 0-2. 관련 주문 전체 (금액/상태/식별값)
select id, created_at, customer_name, customer_phone, phone, kakao_id, youtube_nickname,
       product_name, total_price, order_status, payment_status, order_group_id
from orders
where customer_phone in ('01028495209', '01033995209')
   or youtube_nickname = '루루짱929'
order by created_at;

-- 0-3. 포인트 원장 (0건이면 이관할 것 없음)
--      ※ 테이블명이 다르면 이 줄만 건너뛰십시오.
select * from point_ledger
where customer_phone in ('01028495209', '01033995209')
order by created_at;


-- ── [1] A(민연숙) 주문에 B(하이든)의 kakao_id 를 찍는다 ────────────────────
--   목적: 손님이 실제로 쓰는 카카오 계정(B)으로 로그인했을 때 A의 주문이 보이게 한다.
--   안전핀: B의 kakao_id 가 실제로 존재할 때만 동작. A 주문의 금액·상태는 손대지 않는다.
update orders o
set kakao_id = b.kakao_id
from (
  select kakao_id
  from customers
  where customer_phone = '01033995209'
    and kakao_id is not null
  limit 1
) b
where o.customer_phone = '01028495209'
  and (o.kakao_id is null or o.kakao_id <> b.kakao_id);
-- 실행 결과가 0건이면: A 주문에 이미 같은 kakao_id 가 있거나, B에 kakao_id 가 없다는 뜻.
-- 그 경우 [0-1] 결과를 확인한 뒤 다시 판단하십시오.


-- ── [2] B의 취소 주문 전화번호를 A 번호로 통일 (관리자 목록 1명으로 합치기) ─
--   이름·주소·금액·상태는 그대로 둔다. 전화번호만 맞춘다.
--   안전핀: 취소된 주문만, 그리고 아직 B 번호일 때만.
update orders
set customer_phone = '01028495209',
    phone          = '01028495209'
where customer_phone = '01033995209'
  and order_status = '주문서취소';

-- ※ B 번호로 된 "취소가 아닌" 주문이 [0-2]에 있으면 이 SQL은 그 건을 건드리지 않습니다.
--   그런 주문이 있다면 아래를 따로 검토 후 실행하십시오(기본은 실행하지 마십시오).
-- update orders set customer_phone='01028495209', phone='01028495209'
-- where customer_phone='01033995209' and order_status <> '주문서취소';

-- ※ customers 두 행은 그대로 둡니다.
--   B행의 번호를 A와 같게 바꾸면 customer_phone 중복으로 충돌할 수 있고,
--   B행은 손님이 지금 로그인해 쓰는 프로필이라 살아 있어야 합니다.
--   (관리자 고객목록은 orders 기준으로 묶이므로 [2]만으로 1명이 됩니다)


-- ── [3] 실행 후 검증 ───────────────────────────────────────────────────────
-- 3-1. 주문 3건이 모두 같은 전화번호 + 같은 kakao_id 여야 한다
select id, created_at, customer_name, customer_phone, kakao_id, product_name,
       total_price, order_status, payment_status
from orders
where customer_phone = '01028495209'
   or youtube_nickname = '루루짱929'
order by created_at;

-- 3-2. 금액이 그대로인지 (통합 전 356,550 + 78,110 = 434,660)
select count(*) as 주문건수, sum(total_price) as 합계금액
from orders
where customer_phone = '01028495209';

-- 3-3. 아직 B 번호로 남은 주문이 없어야 한다 (0건이면 정상)
select count(*) as 남은_B번호_주문 from orders where customer_phone = '01033995209';
