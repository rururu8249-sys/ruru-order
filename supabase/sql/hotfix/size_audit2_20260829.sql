-- [2026-08-29] 2차 확인 — 읽기 전용 (SELECT 만)
-- ① 대조 범위가 얼마나 되는지  ② 사장님이 지목하신 코드가 실제로 어떻게 등록돼 있는지
--    ③ 색상이 어떻게 들어가 있는지 를 한 번에 본다.

with excel(code, excel_sizes) as (
  values
    ('BB-404M', 'M,L,XL,2XL'),
    ('BB-405M', 'M,L,XL,2XL'),
    ('BB-406M', '48,50,52,54'),
    ('BB-80', '4,6,8,10,12'),
    ('BB-65', '4,6,8,10,12'),
    ('BB-39', '4,6,8,10,12'),
    ('MC-101M', '1,2,3,4,5'),
    ('MC-207', '0,1,2,3'),
    ('CH-2', '36,38,40'),
    ('DR-1', '36,38,40'),
    ('BB-84M', 'S/44,M/46,L/48,XL/50,XXL/52'),
    ('ZEG-1M', '48,50,52,54,56'),
    ('BB-42', 'S,M,L,XL,2XL'),
    ('BB-58', 'S,M,L,XL,XXL'),
    ('AC-1M', '46,48,50,52')
),
db as (
  select
    p.id as product_id,
    p.product_name as brand,
    d.key as detail_name,
    split_part(trim(regexp_replace(d.key, '\(.*?\)', '', 'g')), ' ', 1) as code,
    coalesce((select string_agg(s, ',' order by ord)
              from jsonb_array_elements_text(d.value->'sizes') with ordinality t(s, ord)
              where nullif(trim(s),'') is not null and trim(s) <> '없음'), '') as db_sizes,
    coalesce((select string_agg(s, ' | ' order by ord)
              from jsonb_array_elements_text(d.value->'colors') with ordinality t(s, ord)
              where nullif(trim(s),'') is not null), '') as db_colors
  from public.products p
  cross join lateral jsonb_each((p.product_note::jsonb)->'brand_group'->'detail_options') d
  where p.product_note is not null and p.product_note <> ''
    and jsonb_typeof((p.product_note::jsonb)->'brand_group'->'detail_options') = 'object'
)
-- [1] 전체 세부상품이 몇 개인지
select '① 등록된 세부상품 총 개수' as 구분, count(*)::text as 값, '' as 엑셀, '' as 등록, '' as 색상 from db
union all
-- [2] 지목하신 코드들 실제 상태
select '② ' || e.code, 
       case when d2.code is null then '등록 안 됨' when d2.db_sizes = e.excel_sizes then '같음' else '★다름★' end,
       e.excel_sizes,
       coalesce(d2.db_sizes,'-'),
       coalesce(nullif(d2.db_colors,''),'(색상 없음)')
from excel e left join db d2 on d2.code = e.code
union all
-- [3] 색상 칸에 브랜드명·성별·중국어가 들어간 것이 몇 개인지
select '③ 색상칸에 한글색상(중국어) 형태가 아닌 값이 있는 세부상품', count(*)::text, '', '', ''
from db
where db_colors <> ''
  and exists (
    select 1 from regexp_split_to_table(db_colors, ' \| ') v
    where v !~ '^[가-힣A-Za-z ]+\s*[\(（].+[\)）]$'
  )
order by 1;
