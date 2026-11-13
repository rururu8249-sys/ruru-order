-- [2026-11-13 사장님] 자동 테스트 닉네임 중 «기존 닉네임 + 숫자»만 다른 비슷한 닉네임(양말한짝수배 → 양말한짝수배53)을
--   «아직 안 쓴(unused)» 후보 목록에서만 지운다. 이미 쓰인 테스트 계정·채팅 기록·주문·다른 표는 건드리지 않는다.

-- ① 미리보기 (지워질 후보)
select p.nickname, p.category
from public.live_automation_nickname_pool p
where p.status = 'unused'
  and p.nickname ~ '[0-9]+$'
  and length(regexp_replace(regexp_replace(p.nickname, '[0-9]+$', ''), '\s+', '', 'g')) >= 2
  and exists (
    select 1 from (
      select nickname as n from public.live_automation_nickname_pool
      union all select nickname from public.live_automation_actors
      union all select youtube_nickname from public.customers
    ) o
    where o.n is not null
      and lower(regexp_replace(o.n, '\s+', '', 'g')) = lower(regexp_replace(regexp_replace(p.nickname, '[0-9]+$', ''), '\s+', '', 'g'))
  )
order by p.nickname;

-- ② 지우기 (①과 같은 조건)
delete from public.live_automation_nickname_pool p
where p.status = 'unused'
  and p.nickname ~ '[0-9]+$'
  and length(regexp_replace(regexp_replace(p.nickname, '[0-9]+$', ''), '\s+', '', 'g')) >= 2
  and exists (
    select 1 from (
      select nickname as n from public.live_automation_nickname_pool
      union all select nickname from public.live_automation_actors
      union all select youtube_nickname from public.customers
    ) o
    where o.n is not null
      and lower(regexp_replace(o.n, '\s+', '', 'g')) = lower(regexp_replace(regexp_replace(p.nickname, '[0-9]+$', ''), '\s+', '', 'g'))
  );
