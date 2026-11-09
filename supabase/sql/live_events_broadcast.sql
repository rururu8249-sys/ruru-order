-- supabase/sql/live_events_broadcast.sql
-- [2026-11-09] DB CPU 줄이기 ①단계 — «표가 바뀌면 알려 줘(Postgres Changes)» 대신 «소식 한 번 보내기(Broadcast)».
--   Supabase 실측: CPU 의 61.8% 가 realtime.list_changes(Postgres Changes 폴링). 공식 문서도 Broadcast 권장.
--   이 파일은 «소식 보내기» 트리거만 추가한다. 주문·상품·방송 데이터는 읽기만 하고 아무것도 안 바꾼다.
--   소식 보내기가 실패해도(EXCEPTION 삼킴) 주문 저장·입금확인·재고 차감은 절대 막히지 않는다.
--   소식 내용(주문): 주문번호·주문서 번호·방송·닉네임·상품명·옵션·수량·상태·테스트/삭제 여부만.
--     전화·주소·이름·결제금액·카카오 계정은 넣지 않는다(공개 방송방이라 — 닉네임·상품명은 원래 방송 화면에 나가던 값).
--   주제(topic) 'ruru-live' · 공개(private=false) · 이벤트 'order' / 'catalog'.
--   되돌리기: 맨 아래 주석.

create or replace function public.ruru_live_order_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n jsonb;
  o jsonb;
begin
  begin
    n := to_jsonb(NEW);
    o := case when TG_OP = 'UPDATE' then to_jsonb(OLD) else '{}'::jsonb end;
    perform realtime.send(
      jsonb_build_object(
        'type', TG_OP,
        'new', jsonb_build_object(
          'id', n->'id',
          'order_group_id', n->'order_group_id',
          'broadcast_id', n->'broadcast_id',
          'youtube_nickname', n->'youtube_nickname',
          'product_name', n->'product_name',
          'color', n->'color',
          'size', n->'size',
          'qty', n->'qty',
          'admin_order_status_v2', n->'admin_order_status_v2',
          'order_manage_status', n->'order_manage_status',
          'deposit_status', n->'deposit_status',
          'is_test_order', n->'is_test_order',
          'payment_method', n->'payment_method',
          'is_deleted', n->'is_deleted'
        ),
        'old', jsonb_build_object(
          'id', o->'id',
          'admin_order_status_v2', o->'admin_order_status_v2',
          'order_manage_status', o->'order_manage_status',
          'deposit_status', o->'deposit_status'
        )
      ),
      'order',
      'ruru-live',
      false
    );
  exception when others then
    -- 소식이 안 가도 주문 쪽은 그대로 진행(화면은 20초 다시 읽기로 따라잡음)
    null;
  end;
  return null;
end;
$$;

create or replace function public.ruru_live_catalog_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('table', TG_TABLE_NAME, 'type', TG_OP),
      'catalog',
      'ruru-live',
      false
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists trg_ruru_live_order_event on public.orders;
create trigger trg_ruru_live_order_event
  after insert or update on public.orders
  for each row execute function public.ruru_live_order_event();

-- 상품·방송 상품·방송: 문장 하나에 소식 하나(줄마다 아님) — 재고 차감처럼 여러 줄이 바뀌어도 한 번
drop trigger if exists trg_ruru_live_catalog_event on public.products;
create trigger trg_ruru_live_catalog_event
  after insert or update or delete on public.products
  for each statement execute function public.ruru_live_catalog_event();

drop trigger if exists trg_ruru_live_catalog_event on public.broadcast_products;
create trigger trg_ruru_live_catalog_event
  after insert or update or delete on public.broadcast_products
  for each statement execute function public.ruru_live_catalog_event();

drop trigger if exists trg_ruru_live_catalog_event on public.broadcasts;
create trigger trg_ruru_live_catalog_event
  after insert or update or delete on public.broadcasts
  for each statement execute function public.ruru_live_catalog_event();

-- 되돌리기 (필요할 때만):
-- drop trigger if exists trg_ruru_live_order_event on public.orders;
-- drop trigger if exists trg_ruru_live_catalog_event on public.products;
-- drop trigger if exists trg_ruru_live_catalog_event on public.broadcast_products;
-- drop trigger if exists trg_ruru_live_catalog_event on public.broadcasts;
-- drop function if exists public.ruru_live_order_event();
-- drop function if exists public.ruru_live_catalog_event();
