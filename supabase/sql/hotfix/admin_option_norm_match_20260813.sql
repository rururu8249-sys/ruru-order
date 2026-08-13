-- [근본수정 2026-08-13] 관리자 상품추가/수정 RPC — 옵션 합성형("세부상품 / 없음") 정규화 매칭
-- 증상: 등록상품 추가 실패 "옵션 재고를 찾을 수 없습니다. 상품 616, 옵션 딥티크 종이방향제7종1세트(랜덤향) / 없음 /"
-- 원인: 상품 JSON(3단 옵션 등록 형식)은 색상을 "세부상품 / 색상" 합성형으로 저장하고,
--       실재고 테이블(product_inventory_variants)·주문행은 "없음" 꼬리를 뗀 정규형을 저장(고객 경로가 정규화).
--       관리자 RPC만 원문 그대로 exact 비교라 합성형 상품(26건)에서 추가/수정 실패.
-- 왜 데이터 정리가 아닌가: 상품등록 UI가 다음 저장 때 다시 합성형으로 쓴다. 비교 규칙 정규화가 근본 수정.
-- 안전: 라이브 함수 원문을 서버에서 읽어 조회 WHERE 3곳 + 시드 INSERT 색상 2곳 + 0원 단가 가드 1곳만 치환.
--       패턴 매치수가 정확히 1이 아니면 예외 → 전체 롤백(아무것도 안 바뀜).

create or replace function public.ruru_norm_option(p text)
returns text language sql immutable as $norm$
  select case
    when btrim(coalesce(p, '')) in ('', '없음') then ''
    else regexp_replace(btrim(coalesce(p, '')), '\s*/\s*없음\s*$', '')
  end
$norm$;

do $do$
declare
  v_def text;
  v_cnt int;
  pat_add_seed constant text := $p$trim\(coalesce\(vr\.value->>'color',\s*''\)\)$p$;
  rep_add_seed constant text := $p$regexp_replace(trim(coalesce(vr.value->>'color','')), '\\s*/\\s*없음\\s*$', '')$p$;
  pat_add_price constant text := $p$if\s+v_unit\s*<=\s*0\s+then\s+raise exception '단가는 1원 이상이어야 합니다\.'; end if;$p$;
  rep_add_price constant text := $p$if v_unit < 0 then raise exception '단가는 0원 이상이어야 합니다.'; end if;$p$;
  pat_add_look constant text := $p$where\s+product_id\s*=\s*p_product_id\s+and\s+color\s*=\s*v_color\s+and\s+size\s*=\s*v_size\s+for\s+update;$p$;
  rep_add_look constant text := $p$where product_id = p_product_id and public.ruru_norm_option(color) = public.ruru_norm_option(v_color) and public.ruru_norm_option(size) = public.ruru_norm_option(v_size) order by (color = v_color and size = v_size) desc, id asc limit 1 for update;$p$;
  pat_upd_seed constant text := $p$trim\(coalesce\(variant_row\.value->>'color',\s*''\)\)$p$;
  rep_upd_seed constant text := $p$regexp_replace(trim(coalesce(variant_row.value->>'color', '')), '\\s*/\\s*없음\\s*$', '')$p$;
  pat_upd_old constant text := $p$where\s+product_id\s*=\s*v_old_product_id\s+and\s+color\s*=\s*v_old_color\s+and\s+size\s*=\s*v_old_size\s+for\s+update;$p$;
  rep_upd_old constant text := $p$where product_id = v_old_product_id and public.ruru_norm_option(color) = public.ruru_norm_option(v_old_color) and public.ruru_norm_option(size) = public.ruru_norm_option(v_old_size) order by (color = v_old_color and size = v_old_size) desc, id asc limit 1 for update;$p$;
  pat_upd_new constant text := $p$where\s+product_id\s*=\s*v_old_product_id\s+and\s+color\s*=\s*v_new_color\s+and\s+size\s*=\s*v_new_size\s+for\s+update;$p$;
  rep_upd_new constant text := $p$where product_id = v_old_product_id and public.ruru_norm_option(color) = public.ruru_norm_option(v_new_color) and public.ruru_norm_option(size) = public.ruru_norm_option(v_new_size) order by (color = v_new_color and size = v_new_size) desc, id asc limit 1 for update;$p$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_add_order_item';
  if v_def is null then raise exception 'admin_add_order_item 함수 없음'; end if;

  v_cnt := regexp_count(v_def, pat_add_look);
  if v_cnt <> 1 then
    raise exception 'ADD 조회 패턴 매치 %건(1이어야) — 원문: %', v_cnt,
      substr(v_def, greatest(1, position('product_inventory_variants' in v_def) - 80), 700);
  end if;
  v_cnt := regexp_count(v_def, pat_add_seed);
  if v_cnt <> 1 then raise exception 'ADD 시드 패턴 매치 %건(1이어야)', v_cnt; end if;
  v_cnt := regexp_count(v_def, pat_add_price);
  if v_cnt <> 1 then raise exception 'ADD 단가가드 패턴 매치 %건(1이어야)', v_cnt; end if;

  v_def := regexp_replace(v_def, pat_add_look, rep_add_look);
  v_def := regexp_replace(v_def, pat_add_seed, rep_add_seed);
  v_def := regexp_replace(v_def, pat_add_price, rep_add_price);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_update_inventory_linked_order_item';
  if v_def is null then raise exception 'admin_update_inventory_linked_order_item 함수 없음'; end if;

  v_cnt := regexp_count(v_def, pat_upd_old);
  if v_cnt <> 1 then raise exception 'UPD 기존조회 패턴 매치 %건(1이어야)', v_cnt; end if;
  v_cnt := regexp_count(v_def, pat_upd_new);
  if v_cnt <> 1 then raise exception 'UPD 새조회 패턴 매치 %건(1이어야)', v_cnt; end if;
  v_cnt := regexp_count(v_def, pat_upd_seed);
  if v_cnt <> 1 then raise exception 'UPD 시드 패턴 매치 %건(1이어야)', v_cnt; end if;

  v_def := regexp_replace(v_def, pat_upd_old, rep_upd_old);
  v_def := regexp_replace(v_def, pat_upd_new, rep_upd_new);
  v_def := regexp_replace(v_def, pat_upd_seed, rep_upd_seed);
  execute v_def;
end
$do$;

-- 검증(읽기 전용): 정규화 결과 + 616 옵션이 이제 매칭되는지 (재고행 id가 나와야 성공)
select public.ruru_norm_option('딥티크 종이방향제7종1세트(랜덤향) / 없음') as 정규화_색상,
  (select v.id from product_inventory_variants v
    where v.product_id = 616
      and public.ruru_norm_option(v.color) = public.ruru_norm_option('딥티크 종이방향제7종1세트(랜덤향) / 없음')
      and public.ruru_norm_option(v.size) = public.ruru_norm_option('없음')) as 매칭된_재고행id;
