-- Only a server-validated automation INSERT shares the customer order toast.
-- Preserve the existing payload and permissions; fail on production definition drift.
do $$ declare original text; source text; begin
 select pg_get_functiondef('public.ruru_live_order_event()'::regprocedure) into original;
 if md5(original)<>'2d06b73465ca986c9459fc395dcdab0d' then raise exception 'ORDER_EVENT_DEFINITION_CHANGED'; end if;
 source:=replace(original,'''is_test_order'', n->''is_test_order'',',
 '''is_test_order'', n->''is_test_order'',
          ''automation_verified'', TG_OP=''INSERT'' and public.live_automation_verified_order(n->>''order_group_id''),');
 if source=original then raise exception 'ORDER_EVENT_PATCH_FAILED'; end if;
 execute source;
end $$;
