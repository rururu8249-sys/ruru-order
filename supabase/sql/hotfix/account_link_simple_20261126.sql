-- ============================================================
-- [2026-11-26] 계정 잇기 단순화 (사장님 «주소로 짐작하지 말 것 · simple is best»)
--
--  ① 주소로 «같은 사람 같아요» 자동으로 올리던 트리거 끔
--     → 같은 집 가족(엄마·딸, 부부)이 잘못 올라오던 원인. 감지만 하던 트리거라 돈 무접촉.
--  ② 자동으로 올라와 있던 대기 요청은 «아님»으로 정리 (요청 줄 상태만 — 회원·포인트·주문 무접촉)
--  ③ 합치기 함수: 새 카톡 계정에 «포인트만» 있으면 멈추지 않고 합친다
--     (새 카톡으로 들어오면 처음 오신 선물 포인트를 받아 늘 멈췄음).
--     포인트는 기존 번호변경 트리거가 «합산»한다(덮어쓰기 아님). 새 계정에 «주문»이 있으면 지금처럼 멈춤.
--     미리보기에 새 계정 포인트(new_points)도 같이 돌려준다.
--     새 계정 줄을 지울 때 포인트 표의 customer_id 도 남길 계정으로 바꿔 준다.
--  함수는 운영 원문(pg_get_functiondef)에서 해당 문장만 바꾼다. 문장을 못 찾으면 통째로 멈춤(아무것도 안 바뀜).
-- ============================================================

-- ① 자동 감지 끄기
drop trigger if exists ruru_detect_split_account_trg on public.customers;

-- ② 자동 감지 대기 요청 정리
update public.customer_link_requests
   set status = 'rejected', handled_at = now(), updated_at = now(), handled_by = 'auto-off-20261126',
       admin_memo = trim(admin_memo || ' 주소 자동감지 폐지로 정리(2026-11-26)')
 where status = 'pending' and coalesce(source, 'customer') = 'auto';

-- ③ 합치기 함수 수정
do $$
declare
  d text;
  a text := 'if v_new_orders > 0 or v_new_points > 0 then';
  b text := '''old_orders'', v_old_orders, ''old_points'', v_old_points,';
  c text := 'delete from customers where id = v_new.id;';
begin
  d := pg_get_functiondef('public.ruru_merge_customer_link_request(uuid,boolean)'::regprocedure);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception '문장 a 를 정확히 1번 찾지 못함'; end if;
  if (length(d) - length(replace(d, b, ''))) / length(b) <> 1 then raise exception '문장 b 를 정확히 1번 찾지 못함'; end if;
  if (length(d) - length(replace(d, c, ''))) / length(c) <> 1 then raise exception '문장 c 를 정확히 1번 찾지 못함'; end if;
  d := replace(d, a, 'if v_new_orders > 0 then');
  d := replace(d, b, b || ' ''new_points'', v_new_points,');
  d := replace(d, c, c || E'\n    update customer_point_ledger set customer_id = v_old.id where customer_id = v_new.id;\n    update customer_point_balances set customer_id = v_old.id where customer_id = v_new.id;');
  execute d;
end $$;

revoke all on function public.ruru_merge_customer_link_request(uuid, boolean) from public, anon, authenticated;

-- 확인
select
  (select count(*) from pg_trigger where tgname = 'ruru_detect_split_account_trg') as "자동감지트리거(0이면끔)",
  (select count(*) from customer_link_requests where status = 'pending') as "남은대기",
  (select position('if v_new_orders > 0 then' in pg_get_functiondef('public.ruru_merge_customer_link_request(uuid,boolean)'::regprocedure)) > 0) as "함수수정됨";
