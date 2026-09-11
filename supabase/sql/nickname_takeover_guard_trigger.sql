-- ============================================================
-- [2026-09-11] 닉네임 «가로채기» DB 차단 트리거
--
--   왜 필요한가 — 문이 3개인데 1개만 잠겨 있었다 (실측)
--     ① 손님 화면 «닉네임 관문»        → 검사 있음 ✅ (2026-09-09 신설)
--     ② 서버 customer-login-sync       → 검사 «없음» ❌  (insert 475~497줄, update 343줄)
--     ③ 손님 브라우저 saveCustomer     → 검사 «없음» ❌  (anon 키로 customers 직접 씀, page.tsx:4517)
--   → 화면을 안 거치는 ②③ 으로 들어가면 남의 닉네임이 그대로 저장됐다.
--   실측 사고: customers 1771(김진의·지니키키) / 2871(09-11 08:55 신규·지니키키) — 같은 이름 2줄.
--
--   이 트리거가 마지막 자물쇠다 — 어느 문으로 들어와도 DB 앞에서 걸린다.
--
--   ★ 판정 규칙은 손님 화면과 «똑같다» (lib/nicknameConflict.ts)
--     내 카톡ID로 된 줄이거나 내 번호로 된 줄이면 → «내 이름» → 통과
--     둘 다 아닌 줄이 있으면 → «남의 이름» → 막는다
--
--   ⚠ 막는 방법: 예외를 «던지지 않는다». 닉네임만 조용히 비운다.
--     예외를 던지면 방송 중 주문 저장이 통째로 실패한다(= 방송 사고). 그건 더 나쁘다.
--     비워두면 손님 화면의 관문이 다시 떠서 갈림길(계정 연결 / 다른 이름)로 안내한다.
--
--   ⚠ service_role(서버 API·관리자)은 봐준다.
--     서버 API 는 자기 검사를 따로 갖고, 사장님은 관리자 화면에서 의도적으로 고칠 수 있어야 한다.
--     막아야 할 건 «손님 브라우저(anon)» 로 들어오는 가로채기다.
--
--   ⚠ 돈·주문·입금·정산·포인트 무접촉. youtube_nickname 칸 하나만 본다.
--   ⚠ 이미 있는 중복 19건은 건드리지 않는다(새로 들어오거나 «바뀔» 때만 검사).
--
--   ★ 운영 DB 실행 완료 + 검수 완료 (2026-09-11, anon 역할로 rollback 시험)
--       ① 남의 이름 가로채기 → 비워짐 ✅
--       ② 아무도 안 쓰는 이름 → 유지 ✅
--       ③ 내 카톡이 그 이름 주인 → 유지 ✅   ← 첫 판에서 여기가 실패해 규칙을 정정했다
-- ============================================================

create or replace function public.ruru_guard_nickname_takeover()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_mine   int := 0;
  v_others int := 0;
  v_new_nick text;
  v_new_kakao text;
  v_new_phone text;
begin
  v_new_nick := coalesce(trim(new.youtube_nickname), '');
  if v_new_nick = '' then return new; end if;

  -- 서버 API·관리자(service_role)는 자기 검사를 갖고 있다 — 통과
  if coalesce(current_setting('request.jwt.claim.role', true), current_user) = 'service_role' then
    return new;
  end if;

  -- 값이 실제로 «새로 들어오거나 바뀔» 때만 본다 (기존 중복 보호)
  if tg_op = 'UPDATE' and coalesce(trim(old.youtube_nickname), '') = v_new_nick then
    return new;
  end if;

  v_new_kakao := coalesce(nullif(trim(new.kakao_id), ''), '');
  v_new_phone := regexp_replace(coalesce(new.customer_phone, ''), '[^0-9]', '', 'g');

  -- ① 내가 이미 이 이름의 «주인»인가 — 줄 전체에서 «먼저» 본다
  --   (2026-09-11: 처음엔 줄마다 따로 판정했다가 ③번 시험에서 실패했다.
  --    사장님이 실기기에서 겪은 것과 «똑같은» 실수 — 화면 규칙과 맞춘다)
  select count(*) into v_mine
  from customers c
  where c.youtube_nickname = v_new_nick
    and c.id is distinct from new.id
    and (
      (v_new_kakao <> '' and coalesce(nullif(trim(c.kakao_id), ''), '') = v_new_kakao)
      or
      (v_new_phone <> '' and regexp_replace(coalesce(c.customer_phone, ''), '[^0-9]', '', 'g') = v_new_phone)
    );
  if v_mine > 0 then return new; end if;

  -- ② 주인이 아닐 때만 «남»이 있는지 본다
  select count(*) into v_others
  from customers c
  where c.youtube_nickname = v_new_nick
    and c.id is distinct from new.id;

  if v_others > 0 then
    new.youtube_nickname := '';   -- 조용히 비운다(예외 금지 — 방송 중 주문 저장 보호)
  end if;

  return new;
end;
$fn$;

drop trigger if exists ruru_guard_nickname_takeover_trg on public.customers;
create trigger ruru_guard_nickname_takeover_trg
  before insert or update of youtube_nickname on public.customers
  for each row execute function public.ruru_guard_nickname_takeover();

-- 확인
select
  (select count(*) from pg_trigger
    where tgname = 'ruru_guard_nickname_takeover_trg' and not tgisinternal) as "트리거생김",
  (select count(*) from (
     select youtube_nickname from customers
     where coalesce(trim(youtube_nickname),'') <> ''
     group by youtube_nickname having count(*) >= 2) t) as "기존중복_그대로";
