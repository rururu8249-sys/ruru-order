-- ============================================================
-- 포인트 고아 복구 — 전화번호 변경으로 옛 번호에 남은 포인트를 현재 번호로 이관
-- 위치: supabase/sql/point_phone_migration_20260709.sql
-- 작성: 2026-07-09
--
-- [배경]
--   customer_point_balances / customer_point_ledger 가 customer_phone 문자열로만
--   고객과 연결돼 있어(FK 없음), 고객이 번호를 바꾸면 포인트가 옛 번호에 고아로 남는다.
--   ※ 근본 해결(customers.id 기준 이전)은 별도 진행. 이 파일은 확인된 피해 2건의 복구용.
--
-- [대상 — 2026-07-09 확인 완료]
--   ① 문수    (customers.id=993, kakao_id=4954163733)
--        01058794497 → 01089904497   (1,395P, 닉네임 엘레강스)
--   ② 김정임  (customers.id=761, kakao_id=4946339204)
--        01034200786 → 01034300786   (295P, 닉네임 김민y/김민양)
--
-- [동일인 확인 근거]
--   - 옛 번호 주문의 created_at 과 현재 고객 row 의 last_order_at 이 1~2초 내 일치
--     (saveCustomer 가 주문 시 last_order_at 을 찍고, 번호변경 시 같은 row 의 phone 만 갱신)
--   - 닉네임/이름 일치, 새 번호로는 주문 0건(=주문 후에 번호를 바꿈)
--
-- [안전성]
--   * 트랜잭션(DO 블록) — 중간 실패 시 전부 롤백
--   * 멱등 — 이미 이관됐으면 아무 일도 안 함(재실행 안전)
--   * 새 번호에 이미 잔액이 있으면 삭제가 아니라 합산
--   * 이력(ledger)은 삭제하지 않고 번호만 갱신 → 기록 보존
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- [1단계] 실행 전 확인 (읽기 전용 — 먼저 이것만 돌려서 결과 보기)
-- ────────────────────────────────────────────────────────────
-- 잔액 현황
select 'balance' as kind, customer_phone, current_points, youtube_nickname, customer_name
  from public.customer_point_balances
 where customer_phone in ('01058794497','01089904497','01034200786','01034300786')
 order by customer_phone;

-- 이력 건수
select 'ledger' as kind, customer_phone, count(*) as rows
  from public.customer_point_ledger
 where customer_phone in ('01058794497','01089904497','01034200786','01034300786')
 group by customer_phone
 order by customer_phone;


-- ────────────────────────────────────────────────────────────
-- [2단계] 실제 이관 (위 결과 확인 후 실행)
-- ────────────────────────────────────────────────────────────
do $$
declare
  v_pairs text[][] := array[
    array['01058794497','01089904497'],  -- 문수 (엘레강스)
    array['01034200786','01034300786']   -- 김정임 (김민y)
  ];
  v_old text;
  v_new text;
  i int;
  v_old_bal public.customer_point_balances%rowtype;
  v_new_exists boolean;
  v_ledger_moved int;
begin
  for i in 1..array_length(v_pairs, 1) loop
    v_old := v_pairs[i][1];
    v_new := v_pairs[i][2];

    -- (a) 이력 이관 — 기록은 지우지 않고 번호만 갱신
    update public.customer_point_ledger
       set customer_phone = v_new
     where customer_phone = v_old;
    get diagnostics v_ledger_moved = row_count;

    -- (b) 옛 번호 잔액 확인
    select * into v_old_bal
      from public.customer_point_balances
     where customer_phone = v_old;

    if not found then
      raise notice '[skip] % → % : 옛 번호 잔액 없음(이미 이관됨). 이력 %건만 확인.', v_old, v_new, v_ledger_moved;
      continue;
    end if;

    select exists(
      select 1 from public.customer_point_balances where customer_phone = v_new
    ) into v_new_exists;

    if v_new_exists then
      -- (c-1) 새 번호에 이미 잔액 row 가 있으면 → 합산 후 옛 row 삭제
      update public.customer_point_balances b
         set current_points         = b.current_points         + v_old_bal.current_points,
             total_granted_points   = b.total_granted_points   + v_old_bal.total_granted_points,
             total_used_points      = b.total_used_points      + v_old_bal.total_used_points,
             total_canceled_points  = b.total_canceled_points  + v_old_bal.total_canceled_points,
             total_adjusted_points  = b.total_adjusted_points  + v_old_bal.total_adjusted_points,
             updated_at             = now(),
             admin_memo             = coalesce(b.admin_memo, '')
                                      || ' [' || v_old || ' 잔액 ' || v_old_bal.current_points || 'P 합산 이관 2026-07-09]'
       where b.customer_phone = v_new;

      delete from public.customer_point_balances where customer_phone = v_old;

      raise notice '[merge] % → % : %P 합산, 이력 %건 이관', v_old, v_new, v_old_bal.current_points, v_ledger_moved;
    else
      -- (c-2) 새 번호에 잔액 row 가 없으면 → 옛 row 의 번호만 갈아끼움
      update public.customer_point_balances
         set customer_phone = v_new,
             updated_at     = now(),
             admin_memo     = coalesce(admin_memo, '')
                              || ' [' || v_old || ' 에서 번호변경 이관 2026-07-09]'
       where customer_phone = v_old;

      raise notice '[move] % → % : %P 이관, 이력 %건 이관', v_old, v_new, v_old_bal.current_points, v_ledger_moved;
    end if;
  end loop;
end $$;


-- ────────────────────────────────────────────────────────────
-- [3단계] 실행 후 검증 (읽기 전용)
--   기대: 옛 번호는 0줄, 새 번호에 1,395P / 295P 가 있어야 함
-- ────────────────────────────────────────────────────────────
select customer_phone, current_points, youtube_nickname, customer_name, admin_memo, updated_at
  from public.customer_point_balances
 where customer_phone in ('01058794497','01089904497','01034200786','01034300786')
 order by customer_phone;

-- 고아가 더 남았는지 전체 재점검 (0줄이면 깨끗)
select b.customer_phone, b.current_points, b.youtube_nickname, b.customer_name
  from public.customer_point_balances b
  left join public.customers c on c.customer_phone = b.customer_phone
 where c.id is null
   and b.current_points > 0
 order by b.current_points desc;
