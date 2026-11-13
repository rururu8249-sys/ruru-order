-- A broadcast reserves actual, disjoint images instead of repeated 5,000-slot aliases.
alter table public.live_chat_public_profiles add column avatar_version integer not null default 1;
alter table public.live_chat_public_profiles alter column avatar_version set default 2;
alter table public.live_chat_messages add column public_avatar_version integer not null default 1;
create table public.live_chat_avatar_pool (avatar_id integer primary key check(avatar_id between 0 and 4999),asset_key text not null unique);
alter table public.live_chat_avatar_pool enable row level security;
revoke all on public.live_chat_avatar_pool from public,anon,authenticated;
grant all on public.live_chat_avatar_pool to service_role;
insert into public.live_chat_avatar_pool(avatar_id,asset_key) values (0,'/chat-avatars/5f2637f65d58e68b.jpg'),(1,'/chat-avatars/5e4247941ac54185.jpg'),(2,'/chat-avatars/139294ea92dbfc85.jpg'),(3,'/chat-avatars/f762913277de3563.jpg'),(4,'/chat-avatars/f87d7976eb067f59.jpg'),(5,'/chat-avatars/f5d6b3534a0d92b1.jpg'),(6,'/chat-avatars/db6e3baf291f3c87.jpg'),(7,'/chat-avatars/6e26a16ec4f7e1f0.jpg'),(8,'/chat-avatars/53b079b6d8b59c00.jpg'),(9,'/chat-avatars/c421f8a589be31e5.jpg'),(10,'/chat-avatars/e1eed631ea9b335d.jpg'),(11,'/chat-avatars/0dd0bc72196bb1eb.jpg'),(12,'/chat-avatars/dfa7c043ffd64f23.jpg'),(13,'/chat-avatars/9a0d2fe7b0500924.jpg'),(14,'/chat-avatars/6f1210fb840568f4.jpg'),(15,'/chat-avatars/07d571e51a1d8dc0.jpg'),(16,'/chat-avatars/fa8484b91194e3f0.jpg'),(17,'/chat-avatars/d3e751ca581a47fb.jpg'),(18,'/chat-avatars/58f6d609ce9423e6.jpg'),(19,'/chat-avatars/be59c65391d7fc2a.jpg'),(20,'/chat-avatars/20cc785101ccb6ed.jpg'),(21,'/chat-avatars/85d1f37c6121c583.jpg'),(22,'/chat-avatars/853c09223bc6543a.jpg'),(23,'/chat-avatars/7fac1e5f4b3c05a1.jpg'),(24,'/chat-avatars/5e605873f8a89a4b.jpg'),(25,'/chat-avatars/34c428f01b3bb788.jpg'),(26,'/chat-avatars/8f8ea8c6d84da963.jpg'),(27,'/chat-avatars/d997bbb0e0184476.jpg'),(28,'/chat-avatars/026512982b114a2e.jpg'),(29,'/chat-avatars/85a7fd31231edaac.jpg'),(30,'/chat-avatars/2277812461ad12ac.jpg'),(31,'/chat-avatars/9aee6a96f271bf2d.jpg'),(32,'/chat-avatars/20ac1ad2f695dc62.jpg'),(33,'/chat-avatars/55815dd7a7e7a94e.jpg'),(34,'/chat-avatars/83068df699dbbeab.jpg'),(35,'/chat-avatars/b191f6d0271d2a51.jpg'),(36,'/chat-avatars/8354ba0d6c054169.jpg'),(37,'/chat-avatars/b3fb6e82c9700a94.jpg'),(38,'/chat-avatars/18b3a70f2e0af670.jpg'),(39,'/chat-avatars/12ef2252c60ea999.png'),(40,'/chat-avatars/e0d0ba87c485c915.jpg'),(41,'/chat-avatars/0701c442a25111d1.jpg'),(42,'/chat-avatars/297d49e094a4c894.jpg'),(43,'/chat-avatars/95d3cb68f0b7e5cb.jpg'),(44,'/chat-avatars/87eef00ff18f4d56.jpg'),(45,'/chat-avatars/485a98ddaefe6a8c.jpg'),(46,'/chat-avatars/5f78a320d526ab5b.jpg'),(47,'/chat-avatars/00d8016d26da536a.jpg'),(48,'/chat-avatars/14ba98a8d92fb073.jpg'),(49,'/chat-avatars/3434b603aeecb8bc.jpg'),(50,'/chat-avatars/c6caae0553c2aab9.jpg'),(51,'/chat-avatars/6c3839612e2baa92.jpg'),(52,'/chat-avatars/4f499f56bd23d5a4.jpg'),(53,'/chat-avatars/83ed83b93351796e.jpg'),(54,'/chat-avatars/51693d512d3ca65e.jpg'),(55,'/chat-avatars/590c561745237d52.jpg'),(56,'/chat-avatars/8cfeed60ea5e0745.jpg'),(57,'/chat-avatars/f4eab75714422a85.jpg'),(58,'/chat-avatars/63935e1c74563985.jpg'),(59,'/chat-avatars/1cadfedcb70f8acd.jpg'),(60,'/chat-avatars/2210cce6f0550444.jpg'),(61,'/chat-avatars/a1402c5aa5f6ce51.png'),(62,'/chat-avatars/ee2c6d88071bc416.jpg'),(63,'/chat-avatars/475ee10dd0dc1d09.jpg'),(64,'/chat-avatars/c90bed42f45c38b5.jpg'),(65,'/chat-avatars/5d2a9c9be5e3e5ea.jpg'),(66,'/chat-avatars/9440d381e18d4e64.jpg'),(67,'/chat-avatars/e5bf991196580d47.jpg'),(68,'/chat-avatars/c1c4146feac198bd.jpg'),(69,'/chat-avatars/ad4f1ccb0bf52ab3.jpg'),(70,'/chat-avatars/69b850da4c0ec42c.jpg'),(71,'/chat-avatars/8b0506ccabe3669f.jpg'),(72,'/chat-avatars/1524a25a714f88c9.jpg'),(73,'/chat-avatars/e2c780bee72b2cdc.jpg'),(74,'/chat-avatars/f6a97fd7c4058ae4.jpg'),(75,'/chat-avatars/c536fe30915032ca.jpg'),(76,'/chat-avatars/d776ba2aa24ec636.jpg'),(77,'/chat-avatars/b4bee65539acbe63.jpg'),(78,'/chat-avatars/430cd4b5b1614828.jpg'),(79,'/chat-avatars/3ce0325664dbfd2f.jpg'),(80,'/chat-avatars/b6d9c3677d5e9433.jpg'),(81,'/chat-avatars/6201300840bfbf3e.jpg'),(82,'/chat-avatars/4516cda37345f62c.jpg'),(83,'/chat-avatars/45e4b1d272f9b491.jpg'),(84,'/chat-avatars/0993ac0d413c1190.jpg'),(85,'/chat-avatars/cb2a38297b4a9fd6.jpg'),(86,'/chat-avatars/7dce6639e559e753.jpg'),(87,'/chat-avatars/1fe7e93c032bfe38.jpg'),(88,'/chat-avatars/5c54e237d48f270e.jpg'),(89,'/chat-avatars/50038b5d4bc85eaa.jpg'),(90,'/chat-avatars/05b54abc72902f84.jpg'),(91,'/chat-avatars/93c26f7fc94aedd1.jpg'),(92,'/chat-avatars/558b3afe7bf0560a.jpg'),(93,'/chat-avatars/b90e768863413bae.jpg'),(94,'/chat-avatars/c9d148674f19b0d4.jpg'),(95,'/chat-avatars/1494b1350052338c.jpg'),(96,'/chat-avatars/c13171f7b617dd73.jpg'),(97,'/chat-avatars/178792f5d83268a7.jpg'),(98,'/chat-avatars/70a3bfe5ab956ec3.png'),(99,'/chat-avatars/ed0b985a9d386055.jpg'),(100,'/chat-avatars/2992b5eef63e4f45.jpg'),(101,'/chat-avatars/c25cb1698235074e.jpg'),(102,'/chat-avatars/50f9443bc809b092.jpg'),(103,'/chat-avatars/0b3b2f0e3289e1bf.jpg'),(104,'/chat-avatars/0e95e25c66501a9a.jpg'),(105,'/chat-avatars/2c7ccb2a8fe99422.jpg'),(106,'/chat-avatars/6fc90ea544063260.jpg'),(107,'/chat-avatars/3f61757943993d35.jpg'),(108,'/chat-avatars/6c837ab5533e1c8c.jpg'),(109,'/chat-avatars/431385c19b6dfeff.jpg'),(110,'/chat-avatars/21b50cc0ee04ba03.jpg'),(111,'/chat-avatars/e217ea342a2692f2.jpg'),(112,'/chat-avatars/8311197a88958820.jpg'),(113,'/chat-avatars/7cc5c2df13559d03.jpg'),(114,'/chat-avatars/ad0d8fcdba2b9c53.jpg'),(115,'/chat-avatars/283710167973535f.jpg'),(116,'/chat-avatars/1a07b28de9136bc0.jpg'),(117,'/chat-avatars/a603721f4312ff14.jpg'),(118,'/chat-avatars/2b9e384b1a6100bf.jpg'),(119,'/chat-avatars/1ce16cd1146610d6.jpg'),(120,'/chat-avatars/0cb107e1e9116a28.jpg'),(121,'/chat-avatars/8394361c7eb382df.png'),(122,'/chat-avatars/36ce3a3c658c541b.jpg'),(123,'/chat-avatars/d72ea634b8189c6a.jpg'),(124,'/chat-avatars/a66a25102b688d1b.jpg'),(125,'/chat-avatars/e2afefa8506135c9.jpg'),(126,'/chat-avatars/537345385675b3d4.jpg'),(127,'/chat-avatars/f40e01f2369b5d96.jpg'),(128,'/chat-avatars/e0a0f6c2e0673c6e.jpg'),(129,'/chat-avatars/1dfa29dcecbb0c48.jpg'),(130,'/chat-avatars/f3bd73ba19ed59d2.jpg'),(131,'/chat-avatars/0020b3456ac1f3b8.jpg'),(132,'/chat-avatars/00249b3b1a48a332.jpg'),(133,'/chat-avatars/bb5c3445341a5820.jpg'),(134,'/chat-avatars/9c96c5857f1f5620.jpg'),(135,'/chat-avatars/f2b120b5493a97a6.jpg'),(136,'/chat-avatars/60cd4c040f2786d4.jpg'),(137,'/chat-avatars/d65d1a25c420fada.jpg'),(138,'/chat-avatars/bc55348f0801e118.jpg'),(139,'/chat-avatars/fc17b23f34cb4192.jpg'),(140,'/chat-avatars/6aa639fd6f717d69.jpg'),(141,'/chat-avatars/36b3d934b57816db.jpg'),(142,'/chat-avatars/bc0bf3f8c677cfc6.jpg'),(143,'/chat-avatars/b0bc198e48b6a77b.jpg'),(144,'/chat-avatars/134746b47a8b972e.jpg'),(145,'/chat-avatars/7e7653969e0e0097.jpg'),(146,'/chat-avatars/342513f09119beff.jpg'),(147,'/chat-avatars/a53d985ae5ab0845.jpg'),(148,'/chat-avatars/2fcd9e8f6f8d7dd7.jpg'),(149,'/chat-avatars/432301283afa69cd.jpg'),(150,'/chat-avatars/31a4251a2b4b5d1c.jpg'),(151,'/chat-avatars/a0191bdd8c6b27c0.jpg'),(152,'/chat-avatars/ca09fed4eb7651a6.png'),(153,'/chat-avatars/fa50e074aab238ad.jpg'),(154,'/chat-avatars/e286771c282628cf.jpg'),(155,'/chat-avatars/58711db757d1b0ae.jpg'),(156,'/chat-avatars/c6f84c6158841301.jpg'),(157,'/chat-avatars/ced3563834946692.jpg'),(158,'/chat-avatars/30bb0bba4959f296.jpg'),(159,'/chat-avatars/122316de46628752.jpg'),(160,'/chat-avatars/52eb49b6129ac5a2.jpg'),(161,'/chat-avatars/9c701ff63e2b2d56.jpg'),(162,'/chat-avatars/059664b78efbcefe.jpg'),(163,'/chat-avatars/64d1b4de2d30a570.jpg'),(164,'/chat-avatars/fff150954f6276ad.jpg'),(165,'/chat-avatars/4120ada39c0e5db5.jpg'),(166,'/chat-avatars/fa0916dcb7ffabd7.jpg'),(167,'/chat-avatars/637cb3c32fe117a3.jpg'),(168,'/chat-avatars/397d956e94b4518b.jpg'),(169,'/chat-avatars/5e414279a4b52d0a.png'),(170,'/chat-avatars/5572293dfd207e10.jpg'),(171,'/chat-avatars/182236d8ff37e15e.jpg'),(172,'/chat-avatars/6608cd4c3816c94c.png'),(173,'/chat-avatars/12398fe27b1d8e8f.jpg'),(174,'/chat-avatars/6e7d2696028a46d7.jpg'),(175,'/chat-avatars/6a211a13c404097b.jpg'),(176,'/chat-avatars/3a170cedbe34e72a.jpg'),(177,'/chat-avatars/d39a7a1e5a8fe082.jpg'),(178,'/chat-avatars/391270f91d1c2db3.jpg'),(179,'/chat-avatars/3139adee11330c10.jpg'),(180,'/chat-avatars/a6e3aa1a950c57cc.jpg'),(181,'/chat-avatars/006340aef53948cd.jpg'),(182,'/chat-avatars/cb41ff61f1df38ac.jpg'),(183,'/chat-avatars/2a158d6d95f13f2d.jpg'),(184,'/chat-avatars/76148cad94f50fa8.jpg'),(185,'/chat-avatars/72c88abe426e55ee.jpg'),(186,'/chat-avatars/a3f45d60bb94e4d3.jpg'),(187,'/chat-avatars/a5c5712a9f299a20.jpg'),(188,'/chat-avatars/e48bb51b17d96e82.jpg'),(189,'/chat-avatars/783be7218d028281.jpg'),(190,'/chat-avatars/13cc08ad2d04d8fc.jpg'),(191,'/chat-avatars/90f30b94ec499397.png'),(192,'/chat-avatars/2d7f458bba32fdbb.jpg'),(193,'/chat-avatars/f191ea9d7094987a.jpg'),(194,'/chat-avatars/4e08e85c086fcd44.jpg'),(195,'/chat-avatars/1580ac98486edf7c.jpg'),(196,'/chat-avatars/ce85fffc70eb2239.jpg'),(197,'/chat-avatars/93307fc9364873dd.jpg'),(198,'/chat-avatars/4b91a43b00ab8a4a.jpg'),(199,'/chat-avatars/b2bea3720833d0a5.jpg'),(200,'/chat-avatars/2c7af3539ef357cd.jpg'),(201,'/chat-avatars/983b1faa20521592.jpg'),(202,'/chat-avatars/cac633f06cc8833b.jpg'),(203,'/chat-avatars/b2bd4916df7ff17a.jpg'),(204,'/chat-avatars/72aa8da9f483a0c6.jpg'),(205,'/chat-avatars/1404c740cf73c004.jpg'),(206,'/chat-avatars/0ba1025de4a6cf60.jpg'),(207,'/chat-avatars/9fbc0efb32635cfe.jpg'),(208,'/chat-avatars/85932b849f9ca853.jpg'),(209,'/chat-avatars/c97c4022a6473253.jpg');
create unique index live_chat_unique_broadcast_photo on public.live_chat_public_profiles(broadcast_id,avatar_id) where avatar_version=2;
create or replace function public.live_chat_next_unique_avatar(p_broadcast uuid) returns integer
language plpgsql set search_path=pg_catalog,public as $$
declare n integer;begin
 perform pg_advisory_xact_lock(hashtextextended('chat-avatar:'||p_broadcast::text,0));
 select a.avatar_id into n from public.live_chat_avatar_pool a where not exists(select 1 from public.live_chat_public_profiles p where p.broadcast_id=p_broadcast and p.avatar_version=2 and p.avatar_id=a.avatar_id) order by random() limit 1;
 if n is null then
  -- Never recycle another person's photo on exhaustion. The client renders a named text fallback.
  select x into n from generate_series(0,4999) x where not exists(select 1 from public.live_chat_public_profiles p where p.broadcast_id=p_broadcast and p.avatar_version=2 and p.avatar_id=x) and not exists(select 1 from public.live_chat_avatar_pool a where a.avatar_id=x) order by x limit 1;
 end if;
 if n is null then raise exception 'AVATAR_RESERVATIONS_FULL';end if;
 return n;
end $$;
create or replace function public.live_chat_reserve_avatar(p_broadcast uuid,p_identity text) returns public.live_chat_public_profiles
language plpgsql set search_path=pg_catalog,public as $$
declare p public.live_chat_public_profiles;begin
 if p_identity is null or p_identity='' or length(p_identity)>128 then raise exception 'INVALID_IDENTITY';end if;
 -- All writers, including first messages and independent generated sessions, share this lock.
 perform pg_advisory_xact_lock(hashtextextended('chat-avatar:'||p_broadcast::text,0));
 select * into p from public.live_chat_public_profiles where broadcast_id=p_broadcast and identity_key=p_identity;
 if found then return p;end if;
 insert into public.live_chat_public_profiles(broadcast_id,identity_key,avatar_id,avatar_version)
 values(p_broadcast,p_identity,public.live_chat_next_unique_avatar(p_broadcast),2) returning * into p;
 return p;
end $$;
create or replace function public.live_chat_assign_avatar() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare p public.live_chat_public_profiles;begin
 if new.badge='bot' then new.public_avatar_id:=0;new.public_avatar_version:=2;new.public_avatar_key:=null;return new;end if;
 p:=public.live_chat_reserve_avatar(new.broadcast_id,coalesce(new.automation_actor_id::text,nullif(new.kakao_id,''),'nickname:'||new.nickname));
 new.public_avatar_id:=p.avatar_id;new.public_avatar_key:=p.id;new.public_avatar_version:=p.avatar_version;return new;
end $$;
create or replace function public.live_chat_rotate_avatar(p_broadcast uuid,p_identity text,p_entry uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare p public.live_chat_public_profiles;begin
 perform 1 from public.broadcasts where id=p_broadcast and status='ON' for share;
 if not found then raise exception 'BROADCAST_ENDED';end if;
 if p_identity is null or length(p_identity)>64 or p_entry is null then raise exception 'INVALID_IDENTITY';end if;
 p:=public.live_chat_reserve_avatar(p_broadcast,p_identity);
 -- Re-entry no longer frees or rerolls a photo before this broadcast ends.
 return jsonb_build_object('key',p.id,'avatar',p.avatar_id,'version',p.avatar_version);
end $$;
create or replace function public.ruru_live_chat_event() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 begin
  perform realtime.send(jsonb_build_object(
   'type',TG_OP,'id',NEW.id,'broadcast_id',NEW.broadcast_id,'nickname',NEW.nickname,
   'body',case when NEW.hidden_at is null then NEW.body else '' end,'created_at',NEW.created_at,
   'hidden',NEW.hidden_at is not null,'badge',NEW.badge,
   'avatar_url',case when NEW.public_avatar_version=2 then 'public2:' else 'public:' end||NEW.public_avatar_id::text||case when NEW.public_avatar_key is null then '' else ':'||NEW.public_avatar_key::text end,
   'bot_ref',NEW.bot_ref,'pinned',NEW.pinned_at is not null and NEW.hidden_at is null
  ),'chat','ruru-live',false);
 exception when others then null;end;
 return null;
end $$;
-- Repair only ongoing broadcasts. Archived broadcasts preserve their original v1 catalog.
do $$declare r record; n integer;begin
 for r in select p.id,p.broadcast_id from public.live_chat_public_profiles p join public.broadcasts b on b.id=p.broadcast_id where b.status='ON' order by p.broadcast_id,p.id loop
  n:=public.live_chat_next_unique_avatar(r.broadcast_id);
  update public.live_chat_public_profiles set avatar_id=n,avatar_version=2,updated_at=clock_timestamp() where id=r.id;
 end loop;
 update public.live_chat_messages m set public_avatar_id=p.avatar_id,public_avatar_version=p.avatar_version from public.live_chat_public_profiles p where m.public_avatar_key=p.id and p.avatar_version=2;
end $$;
revoke all on function public.live_chat_next_unique_avatar(uuid),public.live_chat_reserve_avatar(uuid,text),public.live_chat_assign_avatar(),public.live_chat_rotate_avatar(uuid,text,uuid),public.ruru_live_chat_event() from public,anon,authenticated;
grant execute on function public.live_chat_rotate_avatar(uuid,text,uuid),public.live_chat_reserve_avatar(uuid,text),public.live_chat_next_unique_avatar(uuid) to service_role;
-- Refresh public profile maps; opaque keys only, never actual account identities or photos.
do $$declare b record;begin
 for b in select id from public.broadcasts where status='ON' loop
  perform realtime.send(jsonb_build_object('table','live_chat_avatars:'||b.id::text,'type','UPDATE'),'catalog','ruru-live',false);
 end loop;
end $$;
