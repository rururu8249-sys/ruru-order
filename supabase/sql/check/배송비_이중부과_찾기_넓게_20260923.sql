-- ═══════════════════════════════════════════════════════════════════════
--  같은 날 같은 집에 배송비가 «두 번» 붙은 주문 전부 — 조회 전용 (2026-09-23)
--  ※ 이 파일은 «넓은 버전»입니다. 주소 표기 차이 건만 보시려면
--    배송비_이중부과_찾기_20260923.sql 을 쓰세요.
--
--  왜 만들었나
--    2026-09-22 아지라엘 님 사고: 같은 집인데 「경기」/「경기도」 한 글자 차이로
--    다른 주소가 되어 배송비 4,000원이 또 붙었다.
--    코드는 고쳤지만(커밋 4a6b3c3) «이미 붙은» 배송비는 자동으로 안 빠진다.
--    → 같은 이유로 더 물린 분이 또 있는지 찾는다.
--
--  ⚠ 읽기만 한다. INSERT/UPDATE/DELETE 없음. 돈을 건드리지 않는다.
--  ⚠ 결과는 «후보»다. 확정이 아니다:
--      · 합배송 설정이 꺼져 있던 시간대 주문은 각각 받는 게 «정상»이다
--      · 업체배송(combine_shipping = 'N')은 따로 배송비를 받는 게 정상이다
--    그래서 마지막에 상태를 같이 뽑아 드린다. 보시고 판단해 주세요.
--
--  쓰는 법: Supabase → SQL Editor → 아래 [1]을 붙여넣고 Run.
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- [1] 최근 90일 — 주소 표기 차이로 배송비가 두 번 붙었을 «후보»
-- ─────────────────────────────────────────────────────────────
with rows_ok as (
  -- 취소/환불/삭제 제외한 살아있는 주문 줄
  select
    o.order_group_id,
    o.id,
    o.order_lookup_code,
    o.created_at,
    btrim(coalesce(o.kakao_id, ''))                              as kakao_id,
    regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') as phone_digits,
    coalesce(o.youtube_nickname, '')                             as nickname,
    coalesce(o.customer_name, '')                                as customer_name,
    coalesce(o.zipcode, '')                                      as zipcode,
    coalesce(o.address, '')                                      as address,
    coalesce(o.detail_address, '')                               as detail_address,
    coalesce(o.broadcast_name, '')                               as broadcast_name,
    coalesce(o.adjusted_shipping_fee, o.shipping_fee, 0)         as ship_fee
  from orders o
  where o.is_deleted is distinct from true
    and o.created_at >= now() - interval '90 days'
    and coalesce(o.order_manage_status, '') !~ '취소|환불|cancel|refund'
    and coalesce(o.order_group_id, '') <> ''
),

-- 주문서(그룹) 한 건으로 묶는다. 배송비는 그룹 안에서 합산.
grp as (
  select
    order_group_id,
    min(created_at)                                  as ordered_at,
    max(order_lookup_code)                           as order_no,
    max(kakao_id)                                    as kakao_id,
    max(phone_digits)                                as phone_digits,
    max(nickname)                                    as nickname,
    max(customer_name)                               as customer_name,
    max(zipcode)                                     as zipcode,
    max(address)                                     as address,
    max(detail_address)                              as detail_address,
    max(broadcast_name)                              as broadcast_name,
    sum(ship_fee)                                    as shipping_paid
  from rows_ok
  group by order_group_id
  having sum(ship_fee) > 0          -- 배송비를 «낸» 주문서만 (0원은 이미 합배송된 것)
),

-- 주소 다듬기 — lib/shippingAddressKey.ts 와 같은 규칙
--   ① 괄호 안(법정동·단지명) 제거  ② 붙임표 통일  ③ 공백 한 칸으로
cleaned as (
  select
    g.*,
    btrim(regexp_replace(
      translate(regexp_replace(g.address, '\([^)]*\)', ' ', 'g'), '‐‑‒–—―', '------'),
      '\s+', ' ', 'g')) as addr_clean,
    btrim(regexp_replace(
      translate(g.detail_address, '‐‑‒–—―', '------'),
      '\s+', ' ', 'g')) as detail_clean
  from grp g
),

-- 시도 이름 표준화표 — lib/shippingAddressKey.ts 의 SIDO_CANON 과 같은 목록
sido(raw, canon) as (
  values
    ('서울특별시','서울'),('서울시','서울'),('서울','서울'),
    ('부산광역시','부산'),('부산시','부산'),('부산','부산'),
    ('대구광역시','대구'),('대구시','대구'),('대구','대구'),
    ('인천광역시','인천'),('인천시','인천'),('인천','인천'),
    ('광주광역시','광주'),('광주시','광주'),('광주','광주'),
    ('대전광역시','대전'),('대전시','대전'),('대전','대전'),
    ('울산광역시','울산'),('울산시','울산'),('울산','울산'),
    ('세종특별자치시','세종'),('세종시','세종'),('세종','세종'),
    ('경기도','경기'),('경기','경기'),
    ('강원특별자치도','강원'),('강원도','강원'),('강원','강원'),
    ('충청북도','충북'),('충북','충북'),
    ('충청남도','충남'),('충남','충남'),
    ('전북특별자치도','전북'),('전라북도','전북'),('전북','전북'),
    ('전라남도','전남'),('전남','전남'),
    ('경상북도','경북'),('경북','경북'),
    ('경상남도','경남'),('경남','경남'),
    ('제주특별자치도','제주'),('제주도','제주'),('제주','제주')
),

keyed as (
  select
    c.*,
    -- 새 규칙 키: 시도 표준화 + 띄어쓰기 전부 제거 + 소문자. 우편번호는 «일부러» 안 쓴다.
    lower(regexp_replace(
      coalesce(
        (select s.canon from sido s where s.raw = split_part(c.addr_clean, ' ', 1)),
        split_part(c.addr_clean, ' ', 1)
      )
      || case when position(' ' in c.addr_clean) > 0
              then substr(c.addr_clean, position(' ' in c.addr_clean))
              else '' end
      || '|' || c.detail_clean
    , '\s', '', 'g')) as new_key,

    -- 옛 규칙 키: 우편번호 포함 + 글자 그대로(띄어쓰기 유지)
    c.zipcode || '|' || c.addr_clean || '|' || c.detail_clean as old_key,

    -- 손님 한 명 = 카카오ID 우선, 없으면 전화번호
    coalesce(nullif(c.kakao_id, ''), c.phone_digits) as who,

    -- 합배송은 «그날 방송» 단위라 날짜로 묶는다
    c.ordered_at::date as ordered_on
  from cleaned c
)

select
  k.who                                        as "손님키(카카오ID 또는 전화)",
  max(k.nickname)                              as "닉네임",
  max(k.customer_name)                         as "이름",
  k.ordered_on                                 as "날짜",
  max(k.broadcast_name)                        as "방송",
  count(*)                                     as "배송비 낸 주문서 수",
  sum(k.shipping_paid)                         as "받은 배송비 합계",
  count(distinct k.old_key)                    as "옛 기준 주소 가짓수",
  string_agg(k.order_no,      ' / ' order by k.ordered_at) as "주문번호들",
  string_agg(k.zipcode || ' ' || k.address || ' ' || k.detail_clean,
             E'\n' order by k.ordered_at)      as "주소들(글자 그대로)"
from keyed k
group by k.who, k.new_key, k.ordered_on
having count(*) >= 2                 -- 같은 날 같은 집에 배송비를 2번 이상 냈고
   -- and count(distinct k.old_key) >= 2  -- 옛 기준으로는 «다른 주소»로 보였던 건
order by min(k.ordered_at) desc;


-- ─────────────────────────────────────────────────────────────
-- [1-B] 더 넓게 — 같은 날 같은 집인데 배송비를 2번 이상 낸 «모든» 경우
--       (주소 글자가 똑같은데도 두 번 낸 건 = 합배송이 꺼져 있던 시간대일 수 있다.
--        [1]은 «주소 표기 차이» 건만 뽑고, 이건 그것까지 포함해 전부 뽑는다.)
--       [1]과 같은 with 블록이 필요하므로, 위 [1]에서 맨 끝 having 두 줄만
--       아래처럼 바꿔서 다시 Run 하시면 됩니다:
--
--         having count(*) >= 2
--         -- and count(distinct k.old_key) >= 2      ← 이 줄만 주석 처리
--
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- [2] 위에서 나온 주문번호를 하나씩 확인 — 주문번호를 바꿔 넣으세요
-- ─────────────────────────────────────────────────────────────
-- select
--   order_lookup_code            as "주문번호",
--   created_at                   as "주문시각",
--   youtube_nickname             as "닉네임",
--   customer_name                as "이름",
--   zipcode, address, detail_address,
--   product_name, color, size, qty,
--   shipping_fee                 as "배송비",
--   adjusted_shipping_fee        as "수정배송비",
--   combine_shipping             as "합배송(N=업체배송)",
--   order_manage_status          as "주문상태",
--   broadcast_name               as "방송"
-- from orders
-- where order_lookup_code in ('RURU-MUCRI4MZ')
--   and is_deleted is distinct from true
-- order by created_at, id;


-- ─────────────────────────────────────────────────────────────
-- [3] 아지라엘 님 건 — 이미 아는 사고. 배송비 0원으로 고쳤는지 확인용
-- ─────────────────────────────────────────────────────────────
-- select order_lookup_code, created_at, address, detail_address,
--        shipping_fee, adjusted_shipping_fee, order_manage_status
-- from orders
-- where order_lookup_code = 'RURU-MUCRI4MZ'
--   and is_deleted is distinct from true;
