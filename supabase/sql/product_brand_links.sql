-- Source product rows remain unchanged; links are presentation metadata only.
create table if not exists public.product_brand_links (
  source_id bigint primary key references public.products(id) on delete restrict,
  parent_id bigint not null references public.products(id) on delete restrict,
  detail_name text not null check (length(btrim(detail_name)) between 1 and 200),
  original_name text not null,
  moved_at timestamptz not null default clock_timestamp(),
  check (source_id <> parent_id),
  unique (parent_id, detail_name)
);
create table if not exists public.product_brand_move_audit (
  request_id text primary key,
  request_payload jsonb not null,
  source_id bigint not null,
  parent_id bigint not null,
  action text not null check (action in ('move','undo')),
  original_name text not null,
  detail_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  result jsonb not null
);
alter table public.product_brand_links enable row level security;
alter table public.product_brand_move_audit enable row level security;
revoke all on public.product_brand_links, public.product_brand_move_audit from public, anon, authenticated;
grant select, insert, update, delete on public.product_brand_links, public.product_brand_move_audit to service_role;

create or replace function public.product_brand_version(p_id bigint)
returns text language sql stable security invoker set search_path = '' as $$
  select md5(jsonb_build_object(
    'product',to_jsonb(p),
    'links',coalesce((select jsonb_agg(to_jsonb(l) order by l.source_id) from public.product_brand_links l where l.source_id=p.id or l.parent_id=p.id),'[]'::jsonb)
  )::text) from public.products p where p.id=p_id;
$$;

create or replace function public.product_brand_detail_code(p_name text)
returns text language sql immutable security invoker set search_path = '' as $$
  select upper(coalesce(m[1]||'-'||m[2],split_part(btrim(p_name),' ',1)))
  from (select regexp_match(btrim(p_name),'^([A-Za-z]+)(?:\([^)]*\))?-([0-9]+[A-Za-z]*)') as m) x;
$$;

create or replace function public.product_brand_move(
  p_action text, p_source_id bigint, p_parent_id bigint, p_detail_name text,
  p_request_id text, p_source_version text, p_parent_version text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.products%rowtype; v_parent public.products%rowtype;
  v_link public.product_brand_links%rowtype; v_audit public.product_brand_move_audit%rowtype;
  v_payload jsonb; v_result jsonb; v_name text; v_code text; v_note jsonb;
begin
  if p_action not in ('move','undo') or p_action is null or p_source_id is null or p_parent_id is null
     or p_source_id=p_parent_id or coalesce(length(p_request_id),0) not between 1 and 200 then
    raise exception 'Invalid move request' using errcode='22023';
  end if;
  v_payload := jsonb_build_array(p_action,p_source_id::text,p_parent_id::text,p_detail_name,p_source_version,p_parent_version);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brand-move:'||p_request_id));
  select * into v_audit from public.product_brand_move_audit where request_id=p_request_id;
  if found then
    if v_audit.request_payload <> v_payload then raise exception 'Conflict: request reused' using errcode='40001'; end if;
    return v_audit.result || jsonb_build_object('replayed',true);
  end if;
  -- Lock rows in a consistent order, including the parent that serializes siblings.
  perform id from public.products where id in (p_source_id,p_parent_id) order by id for update;
  select * into v_source from public.products where id=p_source_id;
  if not found then raise exception 'Missing source' using errcode='22023'; end if;
  select * into v_parent from public.products where id=p_parent_id;
  if not found then raise exception 'Missing parent' using errcode='22023'; end if;
  if public.product_brand_version(p_source_id) is distinct from p_source_version
     or public.product_brand_version(p_parent_id) is distinct from p_parent_version then
    raise exception 'Conflict: product changed' using errcode='40001';
  end if;
  v_note := coalesce(nullif(v_parent.product_note,'')::jsonb,'{}'::jsonb);
  if v_note #>> '{brand_group,enabled}' is distinct from 'true'
     or coalesce(nullif(v_source.product_note,'')::jsonb,'{}'::jsonb) #>> '{brand_group,enabled}' = 'true' then
    raise exception 'Invalid brand/source' using errcode='22023';
  end if;
  if p_action='move' then
    if exists(select 1 from public.product_brand_links where source_id=p_source_id) then
      raise exception 'Already moved' using errcode='23505';
    end if;
    v_name := btrim(p_detail_name);
    if coalesce(length(v_name),0) not between 1 and 200 then raise exception 'Invalid detail name' using errcode='22023'; end if;
    v_code := public.product_brand_detail_code(v_name);
    if exists (
      select 1 from (
        select detail_name as name from public.product_brand_links where parent_id=p_parent_id
        union select jsonb_object_keys(coalesce(v_note #> '{brand_group,detail_options}','{}'::jsonb))
        union select jsonb_array_elements_text(coalesce(v_note->'combo_detail_values','[]'::jsonb))
      ) names where btrim(name)=v_name or public.product_brand_detail_code(name)=v_code
    ) then raise exception 'Duplicate detail name/code' using errcode='23505'; end if;
    insert into public.product_brand_links(source_id,parent_id,detail_name,original_name)
      values(p_source_id,p_parent_id,v_name,v_source.product_name) returning * into v_link;
    v_result := jsonb_build_object('link',jsonb_build_object('sourceId',v_link.source_id::text,'parentId',v_link.parent_id::text,'detailName',v_link.detail_name,'originalName',v_link.original_name,'movedAt',v_link.moved_at),'replayed',false);
  else
    delete from public.product_brand_links where source_id=p_source_id and parent_id=p_parent_id returning * into v_link;
    if not found then raise exception 'Conflict: link missing' using errcode='40001'; end if;
    v_name := v_link.detail_name;
    v_result := jsonb_build_object('link',null,'replayed',false);
  end if;
  insert into public.product_brand_move_audit(request_id,request_payload,source_id,parent_id,action,original_name,detail_name,result)
    values(p_request_id,v_payload,p_source_id,p_parent_id,p_action,v_link.original_name,v_name,v_result);
  return v_result;
end;
$$;
revoke all on function public.product_brand_version(bigint) from public, anon, authenticated;
revoke all on function public.product_brand_move(text,bigint,bigint,text,text,text,text) from public, anon, authenticated;
grant execute on function public.product_brand_version(bigint) to service_role;
grant execute on function public.product_brand_move(text,bigint,bigint,text,text,text,text) to service_role;
revoke all on function public.product_brand_detail_code(text) from public, anon, authenticated;
grant execute on function public.product_brand_detail_code(text) to service_role;

-- Guard at the database boundary, including catalog-write upserts and other writers.
create or replace function public.product_brand_guard_parent_note()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_note jsonb;
begin
  if not exists(select 1 from public.product_brand_links where parent_id=new.id) then return new; end if;
  v_note := coalesce(nullif(new.product_note,'')::jsonb,'{}'::jsonb);
  if v_note #>> '{brand_group,enabled}' is distinct from 'true' then
    raise exception 'Linked detail parent cannot become standalone' using errcode='23505';
  end if;
  if exists (
    select 1 from public.product_brand_links l
    join jsonb_object_keys(coalesce(v_note #> '{brand_group,detail_options}','{}'::jsonb)) n(name)
      on n.name=l.detail_name
    where l.parent_id=new.id
  ) then raise exception 'Linked detail cannot be overwritten by parent' using errcode='23505'; end if;
  return new;
end;
$$;
drop trigger if exists product_brand_guard_parent_note_trg on public.products;
create trigger product_brand_guard_parent_note_trg before update of product_note on public.products
  for each row execute function public.product_brand_guard_parent_note();
revoke all on function public.product_brand_guard_parent_note() from public, anon, authenticated;
grant execute on function public.product_brand_guard_parent_note() to service_role;
