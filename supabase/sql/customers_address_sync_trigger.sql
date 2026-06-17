-- customers_address_sync_trigger.sql
-- 목적(주소 일원화 Phase 4):
--   customers 의 주소 진실원천을 shipping_addresses(JSON)로 단일화하고,
--   flat 컬럼(address/detail_address/zipcode)을 항상 "기본배송지"로 자동 동기화한다.
--   어떤 코드 경로(주문제출 saveCustomer / 배송지시트 saveShippingAddresses / login-sync)가
--   써도 DB 트리거가 둘을 강제로 일치시키므로 다시는 어긋나지 않는다. (앱 코드 무변경)
--
-- 안전:
--   - 트리거는 BEFORE INSERT/UPDATE 에서 NEW 의 "주소 필드만" 만진다. 돈/입금/정산/배송상태/포인트/phone 무관.
--   - 트리거 본문은 어떤 오류도 삼켜 NEW 를 그대로 반환 → customers 쓰기(=주문제출 등)를 절대 막지 않음.
--   - 실제 배송(송장/엑셀)은 orders 스냅샷을 쓰므로 이 변경과 무관(영향 없음).
--   - shipping_addresses 는 jsonb, 항목은 camelCase: {name, phone, address, detailAddress, zipcode, isDefault}.
--
-- 실행 순서: STAGE 0 백업 → STAGE 1 트리거 생성 → STAGE 2 기존행 정리(트리거 발火) → STAGE 3 검증
-- (전부 DB 작업. 빌드/배포 불필요.)
-- ============================================================================


-- ============ STAGE 0: 백업 (1회) ============
create table if not exists customers_backup_20260616_p4 as select * from customers;


-- ============ STAGE 1: 동기화 트리거 ============
create or replace function ruru_sync_customer_address()
returns trigger
language plpgsql
as $$
declare
  v_arr jsonb;
  v_def jsonb;
begin
  -- shipping_addresses(jsonb) 안전 파싱
  begin
    v_arr := NEW.shipping_addresses;
  exception when others then
    v_arr := null;
  end;

  if v_arr is not null and jsonb_typeof(v_arr) = 'array' and jsonb_array_length(v_arr) > 0 then
    -- 기본배송지(isDefault=true) 없으면 첫 항목
    select e into v_def
    from jsonb_array_elements(v_arr) e
    where coalesce((e->>'isDefault')::boolean, false) = true
    limit 1;
    if v_def is null then
      v_def := v_arr->0;
    end if;

    -- flat = 기본배송지 (주소가 빈 항목이면 flat 을 날리지 않도록 값이 있을 때만)
    if coalesce(btrim(v_def->>'address'), '') <> '' then
      NEW.address := v_def->>'address';
      NEW.detail_address := coalesce(v_def->>'detailAddress', '');
      NEW.zipcode := coalesce(v_def->>'zipcode', '');
    end if;

  elsif coalesce(btrim(NEW.address), '') <> '' then
    -- JSON 없고 flat 만 있으면 flat 으로 JSON seed (기본배송지 1건)
    NEW.shipping_addresses := jsonb_build_array(jsonb_build_object(
      'name', coalesce(NEW.customer_name, ''),
      'phone', case
                 when NEW.customer_phone ~ '^[0-9]{11}$'
                   then regexp_replace(NEW.customer_phone, '(\d{3})(\d{4})(\d{4})', '\1-\2-\3')
                 else coalesce(NEW.customer_phone, '')
               end,
      'address', NEW.address,
      'detailAddress', coalesce(NEW.detail_address, ''),
      'zipcode', coalesce(NEW.zipcode, ''),
      'isDefault', true
    ));
  end if;

  return NEW;

exception when others then
  -- 어떤 경우에도 customers 쓰기(주문제출 등)를 막지 않는다.
  return NEW;
end;
$$;

drop trigger if exists trg_sync_customer_address on customers;
create trigger trg_sync_customer_address
  before insert or update on customers
  for each row execute function ruru_sync_customer_address();


-- ============ STAGE 2: 기존 678행 정리 (트리거 발火로 일괄 동기화) ============
-- address 를 자기자신으로 set → BEFORE UPDATE 트리거가 행마다 실행되어
--   JSON 있으면 flat=기본배송지로 정렬, flat만 있으면 JSON seed.
update customers set address = address;


-- ============ STAGE 3: 검증 (읽기전용) ============
-- ① 주소있는데 JSON 없는 행 = 0 이어야 함
-- ② flat 과 JSON 기본배송지 주소 불일치 = 0 이어야 함
select
  count(*) as 총,
  count(*) filter (where jsonb_typeof(shipping_addresses)='array' and jsonb_array_length(shipping_addresses)>0) as json있음,
  count(*) filter (
    where btrim(coalesce(address,''))<>''
      and not (jsonb_typeof(shipping_addresses)='array' and jsonb_array_length(shipping_addresses)>0)
  ) as 주소있는데JSON없음_0이어야,
  (
    select count(*) from customers c
    cross join lateral (
      select coalesce(
        (select e->>'address' from jsonb_array_elements(c.shipping_addresses) e
           where coalesce((e->>'isDefault')::boolean,false) limit 1),
        (c.shipping_addresses->0->>'address')
      ) as def_addr
    ) d
    where jsonb_typeof(c.shipping_addresses)='array' and jsonb_array_length(c.shipping_addresses)>0
      and coalesce(btrim(c.address),'') <> coalesce(btrim(d.def_addr),'')
  ) as flat와JSON기본_불일치_0이어야
from customers;
