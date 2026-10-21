-- orders_cost_snapshot_trigger_20261021.sql
-- [a2-3 원가] 주문 줄이 만들어질 때 그 상품의 「원가(창고 입금가)」를 orders.cost_price_snapshot 에 1개 단가로 복사한다.
--   원가는 products.product_note(JSON) 안의 cost_price 에 저장된다(상품 등록 폼 「원가」 칸). 컬럼 추가 없음.
--   브랜드 묶음(부모 상품 + 세부상품):
--     ① 세부상품이 «연결된 다른 상품»(product_brand_links)이면 그 원래 상품의 product_note.cost_price
--     ② 옛 방식 세부상품(부모 product_note.details)이면 부모 product_note.cost_by_detail[세부상품명]
--   정산 화면은 결제완료 주문의 Σ qty × cost_price_snapshot 을 「상품 원가(자동)」로 보여준다.
--
-- 안전:
--   - orders ADD COLUMN only(정수·null 허용). 트리거는 BEFORE INSERT 에서 NEW.cost_price_snapshot 만 채운다.
--   - 트리거 본문은 어떤 오류도 삼키고 NEW 를 그대로 반환 → 주문 제출(RPC)·관리자 주문상품 추가를 절대 막지 않는다.
--   - 돈·입금·정산 계산 컬럼(total_price·final_amount 등)·재고·포인트는 한 글자도 안 건드린다.
--   - 원가를 나중에 바꿔도 과거 주문의 스냅샷은 그대로(정산 불변). 이 SQL 실행 전 주문은 스냅샷이 null → 정산에서 「원가 없는 주문 N건 제외」로만 표시.
--
-- 실행 순서(Supabase SQL Editor): STAGE 1 → STAGE 2 → STAGE 3 확인 SELECT. 빌드/배포 무관(앱은 이미 읽기만 한다).
-- ⚠ temp table·begin/rollback 쓰지 않음(SQL Editor 함정).
-- ============================================================================

-- ============ STAGE 1: 컬럼 ============
alter table public.orders add column if not exists cost_price_snapshot integer;
comment on column public.orders.cost_price_snapshot is '[a2-3] 주문 시점 상품 원가(1개 단가, 창고 입금가). products.product_note.cost_price 복사. null=원가 미입력/트리거 전 주문';

-- ============ STAGE 2: 트리거 ============
create or replace function public.ruru_fill_order_cost_snapshot()
returns trigger
language plpgsql
as $$
declare
  v_note jsonb;
  v_cost integer;
  v_source_id bigint;
  v_source_note jsonb;
begin
  begin
    if NEW.cost_price_snapshot is not null then
      return NEW; -- 호출 쪽이 직접 넣은 값은 존중
    end if;
    if NEW.product_id is null then
      return NEW; -- 직접입력 상품: 원가 없음
    end if;

    select public.ruru_try_parse_jsonb(p.product_note::text) into v_note
    from public.products p where p.id = NEW.product_id;

    -- ① 단품 원가
    if v_note is not null and (v_note->>'cost_price') ~ '^[0-9]+$' then
      v_cost := (v_note->>'cost_price')::integer;
    end if;

    -- ② 브랜드 묶음: 연결된 세부상품(원래 상품)의 원가
    if v_cost is null and NEW.product_name is not null then
      select l.source_id into v_source_id
      from public.product_brand_links l
      where l.parent_id = NEW.product_id and l.detail_name = NEW.product_name
      limit 1;
      if v_source_id is not null then
        select public.ruru_try_parse_jsonb(p.product_note::text) into v_source_note
        from public.products p where p.id = v_source_id;
        if v_source_note is not null and (v_source_note->>'cost_price') ~ '^[0-9]+$' then
          v_cost := (v_source_note->>'cost_price')::integer;
        end if;
      end if;
    end if;

    -- ③ 브랜드 묶음: 옛 방식 세부상품별 원가(cost_by_detail)
    if v_cost is null and v_note is not null and NEW.product_name is not null
       and jsonb_typeof(v_note->'cost_by_detail') = 'object'
       and (v_note->'cost_by_detail'->>NEW.product_name) ~ '^[0-9]+$' then
      v_cost := (v_note->'cost_by_detail'->>NEW.product_name)::integer;
    end if;

    if v_cost is not null and v_cost > 0 then
      NEW.cost_price_snapshot := v_cost;
    end if;
  exception when others then
    raise warning 'ruru_fill_order_cost_snapshot skipped: %', sqlerrm;
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_fill_order_cost_snapshot on public.orders;
create trigger trg_fill_order_cost_snapshot
before insert on public.orders
for each row execute function public.ruru_fill_order_cost_snapshot();

-- ============ STAGE 3: 확인(읽기) ============
-- 컬럼·트리거가 생겼는지
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='orders' and column_name='cost_price_snapshot';
select tgname, tgenabled from pg_trigger where tgname='trg_fill_order_cost_snapshot';
-- 원가 넣은 상품 수(0이면 폼에서 「원가」를 넣어야 스냅샷이 채워진다)
select count(*) as cost_products
  from public.products p
 where (public.ruru_try_parse_jsonb(p.product_note::text)->>'cost_price') ~ '^[0-9]+$';
