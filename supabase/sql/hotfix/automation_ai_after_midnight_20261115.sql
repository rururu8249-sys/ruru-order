-- 2026-11-15 사장님 03:47 「민여사 불렀는데 왜 대답 안 해」
-- 원인: AI 말할 자격('ai')이 «오늘(한국 날짜) 담기·주문»만 봐서, 자정이 지나면 어제 주문한 가상 손님이 전부 자격을 잃어 방 전체가 조용해짐(00:28 뒤 판단 0번).
-- 수정: 이 방송(캠페인)에서 주문한 적 있거나(archived), 지금 방송을 보고 있는(watching) 가상 손님도 말할 수 있게. 주문·돈 무접촉.
do $$declare def text;begin
 select pg_get_functiondef('public.live_automation_eligibility(uuid)'::regprocedure) into def;
 if position('''ai'',cart or submitted>0 or archived>0 or watching' in def)>0 then return; end if;
 def:=replace(def,'''ai'',cart or submitted>0,','''ai'',cart or submitted>0 or archived>0 or watching,');
 if position('''ai'',cart or submitted>0 or archived>0 or watching' in def)=0 then raise exception 'AI_ELIGIBILITY_PATCH_DRIFT';end if;
 execute def;
end $$;
select position('or archived>0 or watching' in pg_get_functiondef('public.live_automation_eligibility(uuid)'::regprocedure))>0 as applied;
