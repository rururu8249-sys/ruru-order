-- ============================================================================
-- 교환·환불 장부 reason 보정 — 2026-09-26
-- ============================================================================
-- ▶ 배경: 이전(migrate) 초판이 고객이슈 body 를 통째로 reason 에 넣어서
--   「자동날짜: … / 이슈유형: … / 닉네임: …」 머리말이 그대로 들어갔다.
--   이걸 «메모 본문»만 남기게 고친다. (lib/issueBodyMeta.splitIssueBody 와 같은 규칙)
-- ▶ 돈/포인트/차단 로직 무관 — refund_ledger.reason «텍스트»만 정리.
-- ▶ 규칙: 머리말 줄(자동날짜/이슈유형/닉네임/이름/전화번호/고객ID/수정날짜/주문내용/주문번호/대상상품:)을
--   버리고, 남은 줄에서 「내용:」「메모:」 접두어를 떼고 개행으로 합친다.
-- ▶ 순서: ① 아래 «미리보기 SELECT» 로 before/after 눈으로 확인 → ② «UPDATE» 실행.
-- ============================================================================

-- ── ① 미리보기 (실행해도 아무것도 안 바뀜) — 머리말이 남아 있는 줄만 보여준다 ──
select
  id,
  left(reason, 120)                                            as before_reason,
  left(coalesce((
    select string_agg(m, E'\n') from (
      select regexp_replace(btrim(l), '^(내용|메모)\s*:\s*', '') as m
      from unnest(regexp_split_to_array(replace(coalesce(reason, ''), E'\r\n', E'\n'), E'\n')) as l
      where btrim(l) <> ''
        and btrim(l) !~ '^(자동날짜|이슈유형|닉네임|이름|전화번호|고객ID|수정날짜|주문내용|주문번호|대상상품):'
    ) s
    where m <> ''
  ), ''), 120)                                                 as after_reason
from public.refund_ledger
where reason ~ '^(자동날짜|이슈유형|닉네임|이름|전화번호|고객ID|수정날짜|주문내용|주문번호|대상상품):'
   or reason ~ E'\n(자동날짜|이슈유형|닉네임|이름|전화번호|고객ID|수정날짜|주문내용|주문번호|대상상품):'
order by created_at desc;


-- ── ② UPDATE (미리보기 확인 후 실행) ──
-- update public.refund_ledger r
--   set reason = left(coalesce((
--       select string_agg(m, E'\n') from (
--         select regexp_replace(btrim(l), '^(내용|메모)\s*:\s*', '') as m
--         from unnest(regexp_split_to_array(replace(coalesce(r.reason, ''), E'\r\n', E'\n'), E'\n')) as l
--         where btrim(l) <> ''
--           and btrim(l) !~ '^(자동날짜|이슈유형|닉네임|이름|전화번호|고객ID|수정날짜|주문내용|주문번호|대상상품):'
--       ) s
--       where m <> ''
--     ), ''), 2000)
--   where r.reason ~ '^(자동날짜|이슈유형|닉네임|이름|전화번호|고객ID|수정날짜|주문내용|주문번호|대상상품):'
--      or r.reason ~ E'\n(자동날짜|이슈유형|닉네임|이름|전화번호|고객ID|수정날짜|주문내용|주문번호|대상상품):';
