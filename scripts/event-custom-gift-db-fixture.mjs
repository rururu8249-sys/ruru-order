import {execFile, execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync, readdirSync} from 'node:fs';
const url=process.env.EVENT_GIFT_TEST_DATABASE_URL || 'postgresql://gift_test@127.0.0.1:55439/postgres';
const target=new URL(url);
if(!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='55439'||target.username!=='gift_test'||target.pathname!=='/postgres') throw new Error('Only the dedicated gift_test PostgreSQL cluster on port 55439 is allowed');
const psql=process.env.GIFT_TEST_PSQL || '/opt/homebrew/opt/postgresql@17/bin/psql';
export async function sql(query){
 const {stdout}=await promisify(execFile)(psql,[url,'-X','-q','-v','ON_ERROR_STOP=1','-At','-c',query]);
 return stdout.trim();
}
export function reset(){
 execFileSync(psql,[url,'-X','-v','ON_ERROR_STOP=1','-c','drop schema public cascade; create schema public;'],{stdio:'pipe'});
 const schema=readFileSync(new URL('./event-custom-gift-schema-fixture.sql',import.meta.url),'utf8').replace(/create role (\w+)( bypassrls)?;/g,(_,role,options='')=>`do $$begin create role ${role}${options}; exception when duplicate_object then null; end$$;`);
 execFileSync(psql,[url,'-X','-v','ON_ERROR_STOP=1','-c',schema],{stdio:'pipe'});
 const name=readdirSync('supabase/migrations').find(x=>x.endsWith('_event_custom_gift_atomic.sql'));
 execFileSync(psql,[url,'-X','-v','ON_ERROR_STOP=1','-f','supabase/migrations/'+name],{stdio:'pipe'});
 const snapshotSource=readdirSync('supabase/migrations').find(x=>x.endsWith('_event_custom_gift_snapshot_orders.sql'));
 if(snapshotSource)execFileSync(psql,[url,'-X','-v','ON_ERROR_STOP=1','-f','supabase/migrations/'+snapshotSource],{stdio:'pipe'});
 execFileSync(psql,[url,'-X','-v','ON_ERROR_STOP=1','-f','supabase/migrations/20261003000100_event_playback_duration.sql'],{stdio:'pipe'});
}
export const B='11111111-1111-4111-8111-111111111111', E='22222222-2222-4222-8222-222222222222', W='33333333-3333-4333-8333-333333333333';
export async function seed(){
 await sql(`insert into event_roulette_events(id,overlay_token,broadcast_id,custom_gift_name,participant_snapshot) values('${E}','roulette_test','${B}','선물 A','[{"nickname":"A","orderIds":["1"]}]');
 insert into event_roulette_winners(id,event_id,nickname,winner_order_ids) values('${W}','${E}','A','["1"]');
 insert into orders(id,created_at,broadcast_id,customer_id,customer_phone,youtube_nickname,order_group_id,order_lookup_code,product_name,qty,product_price,total_price,final_amount,address,admin_order_status_v2,picked_at,payment_bank_account)
 values(1,'2030-01-01','${B}',1,'01012345678','A','g1','c1','original',2,100,200,200,'address','카드결제완료',now(),'bank'),
 (2,'2030-01-02','${B}',1,'01012345678','A','g2','c2','latest',1,300,300,300,'latest-address','카드결제완료',now(),'bank2'),
 (3,'2030-01-03','${B}',1,'01012345678','A','g3','c3','canceled',1,400,400,400,'x','주문서취소',null,'x');
 select setval(pg_get_serial_sequence('orders','id'),100);`);
}
export async function register(w=W){return JSON.parse(await sql(`set role service_role; select admin_register_event_custom_gift('${w}');`));}
