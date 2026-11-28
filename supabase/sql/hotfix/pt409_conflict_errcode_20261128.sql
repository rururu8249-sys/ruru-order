-- [2026-11-28] 클로드가 SQL Editor 에서 실행 완료.
-- 원인: product_catalog_update·product_brand_move 가 «바뀜 충돌»을 errcode 40001(serialization_failure)로 냈는데,
--   PostgREST 가 40001 을 «잠깐 실패»로 보고 끝없이 다시 실행함(Supabase 문서: high-cpu-and-infinite-transaction-retries).
--   실측: 초당 약 1,000번 되돌림(rollback)·Postgres 로그에 'Conflict: product changed' 1초마다, 11/17 이후 DB 시간의 약 26%.
-- 수정: 같은 충돌을 errcode PT409(HTTP 409)로. 함수 본문의 errcode 한 글자만 바꿈.
-- 실행 후 실측: 15초 동안 rollback 0.
do $$ declare r record; d text; begin
for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('product_brand_move','product_catalog_update') and prosrc like '%40001%' loop
  d := replace(pg_get_functiondef(r.oid), 'errcode=''40001''', 'errcode=''PT409''');
  if d like '%40001%' then raise exception 'unexpected 40001 form left'; end if;
  execute d;
end loop; end $$;
