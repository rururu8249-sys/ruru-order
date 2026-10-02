import {readFileSync} from 'node:fs';
import {sql} from './event-custom-gift-db-fixture.mjs';
export async function preparePointFixture(){
 await sql(readFileSync('supabase/sql/customer_points.sql','utf8'));
 await sql(`alter table customer_point_ledger add column if not exists source_key text;
 alter table customer_point_ledger add column if not exists customer_id bigint;
 alter table customer_point_balances add column if not exists customer_id bigint;
 create table if not exists customers(id bigint primary key,customer_phone text);
 insert into customers values(987,'01012345678') on conflict(id) do nothing;
 create unique index if not exists customer_point_ledger_source_key_uidx on customer_point_ledger(source_key) where source_key is not null;
 grant all on customer_point_balances,customer_point_ledger to service_role;`);
 // This function/trigger section was compared with the operating pg_trigger output.
 const identity=readFileSync('supabase/sql/point_identity_sync_trigger.sql','utf8');
 await sql(identity.slice(identity.indexOf('create or replace function public.ruru_fill_point_customer_id()'),identity.indexOf('-- 3) 검증')));
 await sql(readFileSync('supabase/migrations/20261002032503_admin_points_atomic.sql','utf8'));
}
