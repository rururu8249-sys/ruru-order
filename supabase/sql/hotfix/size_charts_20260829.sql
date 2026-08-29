-- ============================================================================
-- [2026-08-29] 사이즈 실측표 데이터 주입 — product_note.size_charts
--
-- 근거: 벤더 엑셀(.xlsx) 안에 임베디드된 상품 사진에 찍혀 있는 실측표를 그대로 옮긴 값.
--       추정·계산으로 만든 숫자는 하나도 없습니다.
--       BB-76은 벤더 표가 어긋나 있어(사이즈 칸 4개 · 숫자 5개) 의도적으로 제외했습니다.
--
-- 안전 원칙
--   · 세부상품명을 하드코딩하지 않습니다. DB의 color_options 에서 코드로 찾아 씁니다.
--   · 기존 product_note 의 다른 값은 건드리지 않습니다(size_charts 키만 추가/갱신).
--   · 금액·재고·주문·입금·정산·배송과 무관한 표시 전용 데이터입니다.
--   · 화면 코드가 어긋난 표를 자동으로 버리므로(lib/sizeChart.ts), 잘못 들어가도 손님에게 안 보입니다.
--
-- 실행 순서: [0] 타입 확인 -> [1] 미리보기(읽기 전용) -> [2] 주입 -> [3] 검증
-- ============================================================================

-- ── [0] product_note 컬럼 타입 확인 (읽기 전용) ────────────────────────────
select column_name, data_type
from information_schema.columns
where table_name = 'products' and column_name = 'product_note';
--  data_type 이 'text' 이면 [2]-A, 'jsonb' 이면 [2]-B 를 실행하세요.

-- ── [1] 어떤 세부상품에 붙을지 미리 확인 (읽기 전용) ───────────────────────
with chart(code, chart) as (values
  ('BB(버버리)-65',  '{"unit":"cm","sizes":["4","6","8","10","12"],"rows":[{"label":"어깨너비","values":[38,39,40,41,42]},{"label":"가슴둘레","values":[90,94,98,102,106]},{"label":"소매길이","values":[57,58,59,60,61]},{"label":"옷길이","values":[73,74,75,76,77]},{"label":"허리둘레","values":[84,88,92,96,100]}]}'::jsonb),
  ('BB(버버리)-69',  '{"unit":"cm","sizes":["4","6","8","10","12"],"rows":[{"label":"뒤 총장(목 아래부터)","values":[107,109,111,113,113]},{"label":"가슴둘레(겨드랑이 아래)","values":[92,96,100,104,108]},{"label":"허리둘레(가장 가는 곳)","values":[94,98,102,106,110]},{"label":"어깨~소매끝","values":[67.5,68.5,69.5,70.5,71]}]}'::jsonb),
  ('BB(버버리)-82',  '{"unit":"cm","sizes":["4","6","8","10"],"rows":[{"label":"가슴둘레","values":[100,104,108,112]},{"label":"소매길이","values":[69,70,71,72]},{"label":"옷길이","values":[52,53,54,55]},{"label":"허리둘레","values":[102,106,110,114]}]}'::jsonb),
  ('BB(버버리)-84M', '{"unit":"cm","sizes":["S","M","L","XL"],"note":"판매처 안내: 남성 175cm·74kg은 M 권장","rows":[{"label":"어깨너비","values":[50,51,52,53]},{"label":"가슴둘레","values":[116,120,124,128]},{"label":"옷길이","values":[68,69.5,71,72.5]}]}'::jsonb),
  ('BB(버버리)-408', '{"unit":"cm","sizes":["S","M","L","XL"],"rows":[{"label":"어깨너비","values":[41,42,43,45]},{"label":"가슴둘레","values":[98,102,106,110]},{"label":"소매길이","values":[62,64,65,67]},{"label":"옷길이","values":[67,69,70,72]}]}'::jsonb),
  ('BB(버버리)-409', '{"unit":"cm","sizes":["S","M","L","XL"],"rows":[{"label":"어깨너비","values":[41,42,43,45]},{"label":"가슴둘레","values":[98,102,106,110]},{"label":"소매길이","values":[62,64,65,67]},{"label":"옷길이","values":[67,69,70,72]}]}'::jsonb),
  ('BB(버버리)-410', '{"unit":"cm","sizes":["S","M","L","XL"],"rows":[{"label":"어깨너비","values":[41,42,43,45]},{"label":"가슴둘레","values":[98,102,106,110]},{"label":"소매길이","values":[62,64,65,67]},{"label":"옷길이","values":[67,69,70,72]}]}'::jsonb),
  ('MC(몽클레어)-204','{"unit":"cm","sizes":["S","M","L","XL"],"rows":[{"label":"어깨너비","values":[40,41,42,43]},{"label":"소매길이","values":[61,62,63,64]},{"label":"가슴둘레","values":[94,98,102,106]},{"label":"옷길이","values":[61,62,63,64]}]}'::jsonb),
  ('MC(몽클레어)-205','{"unit":"cm","sizes":["S","M","L","XL"],"rows":[{"label":"어깨너비","values":[40,41,42,43]},{"label":"소매길이","values":[61,62,63,64]},{"label":"가슴둘레","values":[94,98,102,106]},{"label":"옷길이","values":[61,62,63,64]}]}'::jsonb),
  ('MC(몽클레어)-206','{"unit":"cm","sizes":["S","M","L","XL"],"rows":[{"label":"어깨너비","values":[40,41,42,43]},{"label":"소매길이","values":[61,62,63,64]},{"label":"가슴둘레","values":[94,98,102,106]},{"label":"옷길이","values":[61,62,63,64]}]}'::jsonb),
  ('MC(몽클레어)-208','{"unit":"cm","sizes":["0","1","2","3"],"rows":[{"label":"어깨너비","values":[39,40,41,42]},{"label":"소매길이","values":[59,60,61,62]},{"label":"가슴둘레","values":[96,100,104,108]},{"label":"옷길이","values":[59,60,61,62]}]}'::jsonb),
  ('MC(몽클레어)-209','{"unit":"cm","sizes":["0","1","2","3"],"rows":[{"label":"어깨너비","values":[39,40,41,42]},{"label":"소매길이","values":[59,60,61,62]},{"label":"가슴둘레","values":[96,100,104,108]},{"label":"옷길이","values":[59,60,61,62]}]}'::jsonb),
  ('MC(몽클레어)-210','{"unit":"cm","sizes":["0","1","2","3"],"rows":[{"label":"어깨너비","values":[39,40,41,42]},{"label":"소매길이","values":[59,60,61,62]},{"label":"가슴둘레","values":[96,100,104,108]},{"label":"옷길이","values":[59,60,61,62]}]}'::jsonb),
  ('MC(몽클레어)-211','{"unit":"cm","sizes":["0","1","2","3"],"rows":[{"label":"어깨너비","values":[39,40,41,42]},{"label":"소매길이","values":[59,60,61,62]},{"label":"가슴둘레","values":[96,100,104,108]},{"label":"옷길이","values":[59,60,61,62]}]}'::jsonb)
)
select p.id, p.product_name, c.code, m.name as 붙을_세부상품명
from products p
cross join lateral jsonb_array_elements_text(coalesce(p.product_note::jsonb -> 'color_options', '[]'::jsonb)) as m(name)
join chart c on m.name like c.code || ' %' or m.name = c.code
order by p.product_name, c.code;
--  기대 14행. 다르면 코드 표기가 다른 것이니 결과를 확인하고 진행하세요.

-- ── [2]-A product_note 가 text 인 경우 (위 [1] 확인 후 주석 해제) ──────────
/*
with chart(code, chart) as (values
  -- ↑ [1] 의 values 블록을 그대로 복사해서 붙여넣기
)
update products p
set product_note = (
  p.product_note::jsonb
  || jsonb_build_object('size_charts',
       coalesce(p.product_note::jsonb -> 'size_charts', '{}'::jsonb) || sub.add)
)::text
from (
  select p2.id, jsonb_object_agg(m.name, c.chart) as add
  from products p2
  cross join lateral jsonb_array_elements_text(coalesce(p2.product_note::jsonb -> 'color_options', '[]'::jsonb)) as m(name)
  join chart c on m.name like c.code || ' %' or m.name = c.code
  group by p2.id
) sub
where p.id = sub.id;
*/

-- ── [2]-B product_note 가 jsonb 인 경우: 위와 같고 마지막 ::text 만 제거 ───

-- ── [3] 검증 (읽기 전용) ───────────────────────────────────────────────────
select p.product_name,
       jsonb_object_keys(p.product_note::jsonb -> 'size_charts') as 실측표_등록된_세부상품
from products p
where p.product_note::jsonb ? 'size_charts'
order by 1, 2;

-- 금액이 하나도 안 바뀌었는지 확인 (실측표는 표시 전용이므로 반드시 그대로여야 함)
select id, product_name, price from products where product_name in ('버버리','몽클레어') order by product_name;
