-- ============================================================================
-- [2026-08-29] 사이즈 실측표 주입 — products.product_note.size_charts
--
-- 근거: 벤더 엑셀(.xlsx) 안에 임베디드된 상품 사진에 찍혀 있는 실측표를 그대로 옮긴 값.
--       추정·계산으로 만든 숫자는 하나도 없습니다.
--       BB-76 제외: 벤더 표가 어긋남(사이즈 칸 4개인데 숫자 5개) → 어느 값이 어느 사이즈인지 확정 불가.
--       BB-82 제외: 숨김 상품이라 color_options 에 없음(손님에게 안 보이므로 불필요).
--
-- 실측 확인된 DB 구조 (2026-08-29)
--   products.product_note  = text  (JSON 문자열)
--   products.color_options = jsonb (노출 세부상품명 배열)
--
-- 안전 원칙
--   · 세부상품명 하드코딩 없음 — color_options 에서 코드로 찾아 씁니다.
--   · product_note 의 기존 값은 그대로 두고 size_charts 키만 추가/갱신합니다.
--   · 금액·재고·주문·입금·정산·배송과 무관한 표시 전용 데이터입니다.
--   · 화면 코드가 어긋난 표를 자동으로 버리므로(lib/sizeChart.ts), 잘못 들어가도 손님에게 안 보입니다.
--
-- 대상 13건: 버버리 BB-65 · 69 · 84M · 408 · 409 · 410 / 몽클레어 MC-204 · 205 · 206 · 208 · 209 · 210 · 211
-- ============================================================================


-- ── [1] 붙을 세부상품 미리 확인 (읽기 전용, 아무것도 안 바뀝니다) ──────────
select p.id, p.product_name, m.name as 붙을_세부상품명
from products p
cross join lateral jsonb_array_elements_text(coalesce(p.color_options,'[]'::jsonb)) as m(name)
where m.name like 'BB(%)-65 %' or m.name like 'BB(%)-69 %' or m.name like 'BB(%)-84M %'
   or m.name like 'BB(%)-408 %' or m.name like 'BB(%)-409 %' or m.name like 'BB(%)-410 %'
   or m.name like 'MC(%)-204 %' or m.name like 'MC(%)-205 %' or m.name like 'MC(%)-206 %'
   or m.name like 'MC(%)-208 %' or m.name like 'MC(%)-209 %' or m.name like 'MC(%)-210 %'
   or m.name like 'MC(%)-211 %'
order by 2, 3;
--  기대 13행 (2026-08-29 실측으로 확인됨)


-- ── [2] 주입 ───────────────────────────────────────────────────────────────
-- 6개 UPDATE 를 한 번에 실행하면 됩니다.

-- 2-1. BB-408 / 409 / 410  (같은 표)
update products p
set product_note = (p.product_note::jsonb || jsonb_build_object('size_charts',
  coalesce(p.product_note::jsonb->'size_charts','{}'::jsonb) || sub.add))::text
from (
  select p2.id, jsonb_object_agg(m.name, '{"unit":"cm","sizes":["S","M","L","XL"],"rows":[{"label":"어깨너비","values":[41,42,43,45]},{"label":"가슴둘레","values":[98,102,106,110]},{"label":"소매길이","values":[62,64,65,67]},{"label":"옷길이","values":[67,69,70,72]}]}'::jsonb) as add
  from products p2
  cross join lateral jsonb_array_elements_text(coalesce(p2.color_options,'[]'::jsonb)) as m(name)
  where m.name like 'BB(%)-408 %' or m.name like 'BB(%)-409 %' or m.name like 'BB(%)-410 %'
  group by p2.id
) sub where p.id = sub.id;

-- 2-2. MC-204 / 205 / 206  (같은 표)
update products p
set product_note = (p.product_note::jsonb || jsonb_build_object('size_charts',
  coalesce(p.product_note::jsonb->'size_charts','{}'::jsonb) || sub.add))::text
from (
  select p2.id, jsonb_object_agg(m.name, '{"unit":"cm","sizes":["S","M","L","XL"],"rows":[{"label":"어깨너비","values":[40,41,42,43]},{"label":"소매길이","values":[61,62,63,64]},{"label":"가슴둘레","values":[94,98,102,106]},{"label":"옷길이","values":[61,62,63,64]}]}'::jsonb) as add
  from products p2
  cross join lateral jsonb_array_elements_text(coalesce(p2.color_options,'[]'::jsonb)) as m(name)
  where m.name like 'MC(%)-204 %' or m.name like 'MC(%)-205 %' or m.name like 'MC(%)-206 %'
  group by p2.id
) sub where p.id = sub.id;

-- 2-3. MC-208 / 209 / 210 / 211  (같은 표, 사이즈 0·1·2·3)
update products p
set product_note = (p.product_note::jsonb || jsonb_build_object('size_charts',
  coalesce(p.product_note::jsonb->'size_charts','{}'::jsonb) || sub.add))::text
from (
  select p2.id, jsonb_object_agg(m.name, '{"unit":"cm","sizes":["0","1","2","3"],"rows":[{"label":"어깨너비","values":[39,40,41,42]},{"label":"소매길이","values":[59,60,61,62]},{"label":"가슴둘레","values":[96,100,104,108]},{"label":"옷길이","values":[59,60,61,62]}]}'::jsonb) as add
  from products p2
  cross join lateral jsonb_array_elements_text(coalesce(p2.color_options,'[]'::jsonb)) as m(name)
  where m.name like 'MC(%)-208 %' or m.name like 'MC(%)-209 %' or m.name like 'MC(%)-210 %' or m.name like 'MC(%)-211 %'
  group by p2.id
) sub where p.id = sub.id;

-- 2-4. BB-65
update products p
set product_note = (p.product_note::jsonb || jsonb_build_object('size_charts',
  coalesce(p.product_note::jsonb->'size_charts','{}'::jsonb) || sub.add))::text
from (
  select p2.id, jsonb_object_agg(m.name, '{"unit":"cm","sizes":["4","6","8","10","12"],"rows":[{"label":"어깨너비","values":[38,39,40,41,42]},{"label":"가슴둘레","values":[90,94,98,102,106]},{"label":"소매길이","values":[57,58,59,60,61]},{"label":"옷길이","values":[73,74,75,76,77]},{"label":"허리둘레","values":[84,88,92,96,100]}]}'::jsonb) as add
  from products p2
  cross join lateral jsonb_array_elements_text(coalesce(p2.color_options,'[]'::jsonb)) as m(name)
  where m.name like 'BB(%)-65 %'
  group by p2.id
) sub where p.id = sub.id;

-- 2-5. BB-69
update products p
set product_note = (p.product_note::jsonb || jsonb_build_object('size_charts',
  coalesce(p.product_note::jsonb->'size_charts','{}'::jsonb) || sub.add))::text
from (
  select p2.id, jsonb_object_agg(m.name, '{"unit":"cm","sizes":["4","6","8","10","12"],"rows":[{"label":"뒤 총장(목 아래부터)","values":[107,109,111,113,113]},{"label":"가슴둘레(겨드랑이 아래)","values":[92,96,100,104,108]},{"label":"허리둘레(가장 가는 곳)","values":[94,98,102,106,110]},{"label":"어깨~소매끝","values":[67.5,68.5,69.5,70.5,71]}]}'::jsonb) as add
  from products p2
  cross join lateral jsonb_array_elements_text(coalesce(p2.color_options,'[]'::jsonb)) as m(name)
  where m.name like 'BB(%)-69 %'
  group by p2.id
) sub where p.id = sub.id;

-- 2-6. BB-84M
update products p
set product_note = (p.product_note::jsonb || jsonb_build_object('size_charts',
  coalesce(p.product_note::jsonb->'size_charts','{}'::jsonb) || sub.add))::text
from (
  select p2.id, jsonb_object_agg(m.name, '{"unit":"cm","sizes":["S","M","L","XL"],"note":"판매처 안내: 남성 175cm·74kg은 M 권장","rows":[{"label":"어깨너비","values":[50,51,52,53]},{"label":"가슴둘레","values":[116,120,124,128]},{"label":"옷길이","values":[68,69.5,71,72.5]}]}'::jsonb) as add
  from products p2
  cross join lateral jsonb_array_elements_text(coalesce(p2.color_options,'[]'::jsonb)) as m(name)
  where m.name like 'BB(%)-84M %'
  group by p2.id
) sub where p.id = sub.id;


-- ── [3] 검증 (읽기 전용) ───────────────────────────────────────────────────
select p.product_name, jsonb_object_keys(p.product_note::jsonb->'size_charts') as 실측표_등록됨
from products p
where p.product_note::jsonb ? 'size_charts'
order by 1, 2;
--  기대 13행

-- 금액 불변 확인 (실측표는 표시 전용이므로 반드시 그대로여야 함)
select id, product_name, price from products where id in (673, 682) order by product_name;
--  기대: 버버리 129000 / 몽클레어 (기존값 그대로)
