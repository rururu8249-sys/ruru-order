-- ============================================================
-- [2026-09-11] 갈라진 계정 «자동 감지» 트리거
--
--   사장님 결정 (2026-09-11)
--     손님한테는 아무것도 묻지 않는다. 이름이 겹치면 숫자 붙여 통과시킨다(A2204).
--     «누구인지»는 시스템이 주소로 알아내서 사장님께 알리고, 사장님이 버튼 하나로 합친다.
--
--   왜 «상세주소까지» 같을 때만 보나 (2026-09-11 실측, customers 2,631명)
--     이름만 같음              226쌍  → 동명이인 천지, 못 씀
--     기본주소만 같음           33쌍  → 가족 섞임
--     ★ 상세주소까지 완전 같음   5쌍  → 이걸 기준으로 한다
--     이름+주소 둘 다 같음       0쌍  → 너무 좁아 단독 기준으로는 못 씀 (같으면 «이름 같음» 배지만 추가)
--
--   왜 트리거인가
--     주소가 채워지는 문이 둘이다 — ① 로그인 동기화(카카오 배송지) ② 손님이 주문서에 직접 입력(anon 직접 쓰기).
--     닉네임 사고에서 «문 하나만 잠근» 실수를 반복하지 않으려고, DB 앞에서 한 번에 본다.
--
--   ⚠ 이 트리거는 «알리기만» 한다. 합치는 건 사장님이 [합치기]를 눌러야 한다(ruru_merge_customer_link_request).
--      돈·포인트·주문은 여기서 1원도 안 움직인다. customer_link_requests 에 한 줄 넣는 게 전부다.
--   ⚠ 감지가 실패해도 회원 저장을 막지 않는다 (exception → 그냥 통과).
-- ============================================================

alter table public.customer_link_requests add column if not exists source text not null default 'customer';   -- customer | auto
alter table public.customer_link_requests add column if not exists match_reasons text[] not null default '{}';
alter table public.customer_link_requests add column if not exists new_customer_id bigint;

create or replace function public.ruru_norm_text(p text)
returns text language sql immutable as $$
  select replace(lower(coalesce(p, '')), ' ', '');
$$;

create or replace function public.ruru_detect_split_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_kakao  text;
  v_phone  text;
  v_addr   text;
  v_addr2  text;
  v_name   text;
  v_old    customers%rowtype;
  v_old_ph text;
  v_orders int := 0;
  v_points int := 0;
  v_reasons text[];
begin
  -- [합치기]가 도는 중(ruru_merge_customer_link_request 가 세운 깃발)이면 쉰다 — 합치는 줄로 헛요청 방지
  if coalesce(current_setting('ruru.merging', true), '') = '1' then return new; end if;

  -- 이어붙일 카톡이 없으면 볼 게 없다
  v_kakao := coalesce(nullif(trim(new.kakao_id), ''), '');
  if v_kakao = '' then return new; end if;

  v_addr  := ruru_norm_text(new.address);
  v_addr2 := ruru_norm_text(new.detail_address);
  if v_addr = '' or v_addr2 = '' then return new; end if;   -- 상세주소까지 있어야 본다

  v_name  := ruru_norm_text(new.customer_name);
  v_phone := regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g');

  -- UPDATE 인데 주소·이름·카톡이 그대로면 볼 이유가 없다
  if tg_op = 'UPDATE'
     and ruru_norm_text(old.address) = v_addr
     and ruru_norm_text(old.detail_address) = v_addr2
     and ruru_norm_text(old.customer_name) = v_name
     and coalesce(nullif(trim(old.kakao_id), ''), '') = v_kakao then
    return new;
  end if;

  -- 상세주소까지 같은 «다른 카톡·다른 번호» 줄. 이름이 같은 줄을 먼저, 그다음 오래된 줄
  select c.* into v_old
  from customers c
  where ruru_norm_text(c.address) = v_addr
    and ruru_norm_text(c.detail_address) = v_addr2
    and c.id <> new.id
    and coalesce(nullif(trim(c.kakao_id), ''), '') <> v_kakao
    and regexp_replace(coalesce(c.customer_phone, ''), '[^0-9]', '', 'g') <> v_phone
  order by (ruru_norm_text(c.customer_name) = v_name) desc, c.created_at asc nulls last, c.id asc
  limit 1;
  if not found then return new; end if;

  -- 옛 줄에 가져올 게(주문·포인트) 없으면 알릴 이유가 없다
  v_old_ph := regexp_replace(coalesce(v_old.customer_phone, ''), '[^0-9]', '', 'g');
  select count(*) into v_orders from orders
   where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old_ph and is_deleted is not true;
  select coalesce(sum(current_points), 0) into v_points from customer_point_balances
   where regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g') = v_old_ph;
  if v_orders = 0 and v_points = 0 then return new; end if;

  v_reasons := array['상세주소 같음'];
  if v_name <> '' and ruru_norm_text(v_old.customer_name) = v_name then
    v_reasons := array_append(v_reasons, '이름 같음');   -- ⚠ «text[] || '문자'» 는 PG가 배열 리터럴로 읽어 22P02 터짐(진단으로 잡음)
  end if;

  -- 같은 쌍이 이미 대기 중이면 또 넣지 않는다
  if exists (
    select 1 from customer_link_requests
     where status = 'pending' and new_kakao_id = v_kakao and target_customer_id = v_old.id
  ) then
    return new;
  end if;

  insert into customer_link_requests (
    nickname, claimed_phone,
    target_customer_id, target_customer_phone, target_customer_name,
    new_kakao_id, new_kakao_nickname, new_customer_phone, new_customer_id,
    temp_nickname, status, source, match_reasons
  ) values (
    coalesce(new.youtube_nickname, ''), v_phone,
    v_old.id, v_old.customer_phone, v_old.customer_name,
    v_kakao, new.kakao_nickname, v_phone, new.id,
    coalesce(new.youtube_nickname, ''), 'pending', 'auto', v_reasons
  );

  return new;
exception when others then
  return new;   -- 감지가 실패해도 회원 저장은 막지 않는다
end;
$fn$;

drop trigger if exists ruru_detect_split_account_trg on public.customers;
create trigger ruru_detect_split_account_trg
  after insert or update of address, detail_address, customer_name, kakao_id on public.customers
  for each row execute function public.ruru_detect_split_account();

-- 확인
select
  (select count(*) from pg_trigger where tgname = 'ruru_detect_split_account_trg' and not tgisinternal) as "트리거생김",
  (select count(*) from information_schema.columns
     where table_name = 'customer_link_requests' and column_name in ('source','match_reasons','new_customer_id')) as "새칸3개";
