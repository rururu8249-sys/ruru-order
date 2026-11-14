-- [2026-11-15 08:06 사장님] 테스트 결제 알림 문구: 「카드결제 확인! 감사합니다」→「카드결제완료 감사합니다」, 「입금 확인! 감사합니다」→「입금완료 감사합니다」
-- 글을 만드는 함수(drain_payments)와 글을 검사하는 함수(payment_notice_valid) 두 곳을 같은 문구로. 그 밖 본문 무변경.
do $$ declare f text; def text; begin
 foreach f in array array['public.live_automation_drain_payments(uuid,bigint)','public.live_automation_payment_notice_valid(uuid,uuid,uuid,uuid,text,text)'] loop
  def:=pg_get_functiondef(f::regprocedure);
  if position('님 카드결제완료 감사합니다' in def)>0 then continue; end if;
  if position('님 카드결제 확인! 감사합니다' in def)=0 or position('님 입금 확인! 감사합니다' in def)=0 then raise exception 'PAYMENT_TEXT_DRIFT %',f; end if;
  def:=replace(replace(def,'님 카드결제 확인! 감사합니다','님 카드결제완료 감사합니다'),'님 입금 확인! 감사합니다','님 입금완료 감사합니다');
  execute def;
 end loop;
end $$;
select position('카드결제완료 감사합니다' in pg_get_functiondef('public.live_automation_drain_payments(uuid,bigint)'::regprocedure))>0 as drain_ok,
       position('입금완료 감사합니다' in pg_get_functiondef('public.live_automation_payment_notice_valid(uuid,uuid,uuid,uuid,text,text)'::regprocedure))>0 as valid_ok;
