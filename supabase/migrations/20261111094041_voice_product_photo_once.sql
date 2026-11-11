-- Intentionally keyed to product/variant, NEVER to broadcast or date.
create table public.voice_product_photos (
 product_id bigint not null references public.products(id),
 detail_name text not null default '' check(char_length(detail_name)<=300),
 request_id uuid not null,
 status text not null check(status in ('capturing','saved','failed')),
 image_url text,
 updated_at timestamptz not null default now(),
 primary key(product_id,detail_name)
);
alter table public.voice_product_photos enable row level security;
revoke all on public.voice_product_photos from public,anon,authenticated;
grant select,insert,update on public.voice_product_photos to service_role;

create function public.voice_photo_claim(p_product bigint,p_detail text,p_request uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.voice_product_photos;
begin
 if p_request is null or p_detail is null then raise exception 'invalid_capture'; end if;
 insert into public.voice_product_photos(product_id,detail_name,request_id,status)
   values(p_product,p_detail,p_request,'capturing') on conflict do nothing returning * into r;
 if found then return 'capture'; end if;
 select * into r from public.voice_product_photos where product_id=p_product and detail_name=p_detail for update;
 if r.status='saved' then return 'exists'; end if;
 -- A timeout cannot prove an upload stopped. Never automatically take over an
 -- in-flight capture. Recovery must first confirm its owner terminated, then fail it.
 if r.status='capturing' then return 'busy'; end if;
 update public.voice_product_photos set request_id=p_request,status='capturing',updated_at=now() where product_id=p_product and detail_name=p_detail;
 return 'capture';
end $$;

create function public.voice_photo_finish(p_product bigint,p_detail text,p_request uuid,p_url text,p_expected_note text,p_expected_images jsonb,p_note text,p_images jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.voice_product_photos; n integer;
begin
 if p_url is null or char_length(p_url) not between 1 and 2048 or jsonb_typeof(p_images) is distinct from 'array' then raise exception 'invalid_capture'; end if;
 select * into r from public.voice_product_photos where product_id=p_product and detail_name=p_detail for update;
 if not found or r.request_id is distinct from p_request then return 'superseded'; end if;
 if r.status='saved' then return case when r.image_url=p_url then 'saved' else 'superseded' end; end if;
 if r.status<>'capturing' then return 'superseded'; end if;
 -- CAS protects edits made between reading the gallery and appending the photo.
 -- Cover columns are never modified. Product update + permanent marker commit atomically.
 update public.products set product_note=p_note,detail_image_urls=p_images
   where id=p_product and product_note is not distinct from p_expected_note and detail_image_urls is not distinct from p_expected_images;
 get diagnostics n=row_count;
 if n=0 then return 'conflict'; end if;
 update public.voice_product_photos set status='saved',image_url=p_url,updated_at=now() where product_id=p_product and detail_name=p_detail;
 return 'saved';
end $$;

create function public.voice_photo_fail(p_product bigint,p_detail text,p_request uuid)
returns void language sql security invoker set search_path='' as $$
 update public.voice_product_photos set status='failed',updated_at=now()
 where product_id=p_product and detail_name=p_detail and request_id=p_request and status='capturing';
$$;
revoke all on function public.voice_photo_claim(bigint,text,uuid),public.voice_photo_finish(bigint,text,uuid,text,text,jsonb,text,jsonb),public.voice_photo_fail(bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.voice_photo_claim(bigint,text,uuid),public.voice_photo_finish(bigint,text,uuid,text,text,jsonb,text,jsonb),public.voice_photo_fail(bigint,text,uuid) to service_role;
