-- ============================================================================
-- ⛔ 사용 중지(실행 금지) — 2026-09-26
--   교환·환불을 «고객이슈 안»에서 처리하도록 통합하면서 «일괄 이전»은 폐기했다.
--   장부 줄은 이제 고객이슈에서 「환불 처리」를 처음 누를 때 admin_task_id 로 자동 생성된다.
--   → 이 파일은 실행하지 말 것. (기록 보존용으로만 남김)
-- ============================================================================
-- 교환·환불 장부 이전(migration) — 2026-09-26 (1단계) [폐기]
-- ============================================================================
-- ▶ 선행: refund_ledger.sql 을 먼저 실행해서 테이블이 있어야 함.
-- ▶ 돈 무접촉: admin_tasks 를 «읽기»만 하고 refund_ledger 에 insert. 포인트/주문/정산 안 건드림.
-- ▶ 재실행 안전: admin_task_id UNIQUE + ON CONFLICT DO NOTHING → 여러 번 돌려도 중복 안 생김.
-- ▶ amount_base 는 0 으로 이전한다 — 기존에 환불 «금액»을 저장한 적이 없어(orders.return_amount 미사용)
--   실제 환불액은 사장님이 처리 창에서 입력. 상품 스냅샷·구분·단계·사유는 그대로 옮긴다.
-- ============================================================================

-- ── 1) 자동 이전: source='order_return_flow' 인 고객이슈 → 장부 줄 ──
insert into public.refund_ledger
  (admin_task_id, kind, stage, reason, product_snapshot, nickname, customer_name, amount_base, amount_final, method)
select
  t.id::text                                                   as admin_task_id,
  case when lower(coalesce(t.task_type,'')) = 'exchange' then '교환' else '반품' end as kind,
  case
    when lower(coalesce(t.status,'')) = 'done'    then '완료'
    when lower(coalesce(t.status,'')) = 'deleted' then '거절·취소'
    else '접수'
  end                                                          as stage,
  -- reason 은 고객이슈 «메모 본문»만 (자동날짜/이슈유형/닉네임 등 머리말 제거 — lib/issueBodyMeta.splitIssueBody 와 같은 규칙)
  left(coalesce((
    select string_agg(m, E'\n') from (
      select regexp_replace(btrim(l), '^(내용|메모)\s*:\s*', '') as m
      from unnest(regexp_split_to_array(replace(coalesce(t.body, t.title, ''), E'\r\n', E'\n'), E'\n')) as l
      where btrim(l) <> ''
        and btrim(l) !~ '^(자동날짜|이슈유형|닉네임|이름|전화번호|고객ID|수정날짜|주문내용|주문번호|대상상품):'
    ) s
    where m <> ''
  ), ''), 2000)                                                as reason,
  coalesce(t.raw_payload -> 'items', '[]'::jsonb)              as product_snapshot,
  t.customer_nickname                                          as nickname,
  t.customer_name                                              as customer_name,
  0                                                            as amount_base,
  0                                                            as amount_final,
  '없음'                                                        as method
from public.admin_tasks t
where coalesce(t.source, '') = 'order_return_flow'
  -- [2026-09-26] general 은 제외 — 교환/반품만 장부로. (general 5건이 「반품」으로 잘못 들어갔던 것 방지)
  and lower(coalesce(t.task_type, '')) in ('exchange', 'refund')
on conflict (admin_task_id) do nothing;

-- 이전 결과 확인
-- select stage, count(*) from public.refund_ledger group by stage order by stage;


-- ── 2) 손입력 건(자동 이전 안 함) — «사람이 봐야 할» 목록만 뽑기 (읽기 전용) ──
--   source 가 없고(자동 반품 흐름 아님) task_type 이 교환/반품/환불 계열인 고객이슈.
--   금액·계좌가 자유 텍스트라 자동 이전이 위험 → 이 목록을 보고 필요한 것만 화면에서 「+ 접수」로 옮긴다.
-- select id, created_at, task_type, status, customer_nickname, customer_name, left(coalesce(body,title,''), 80) as preview
-- from public.admin_tasks
-- where coalesce(source,'') <> 'order_return_flow'
--   and (
--     lower(coalesce(task_type,'')) in ('exchange','refund','return')
--     or title ilike '%교환%' or title ilike '%반품%' or title ilike '%환불%'
--   )
-- order by created_at desc;


-- ── 3) 계좌 만료 가림(선택 · done_at + 30일 지난 건의 전체 계좌번호 NULL) ──
--   서버 라우트가 조회 시에도 지연 마스킹하지만, 저장값 자체를 지우려면 이걸 주기적으로 실행.
-- update public.refund_ledger
--   set account_number = null
--   where done_at is not null
--     and done_at < now() - interval '30 days'
--     and account_number is not null;
