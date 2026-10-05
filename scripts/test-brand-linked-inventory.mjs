import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildBrandOrderCatalog,resolveBrandOrderSelection} from '../lib/productBrandOrder.ts';
import {resolveBroadcastBrandProducts} from '../lib/productBrandLinks.ts';
import {aggregateSalesItems} from '../lib/salesHistory.ts';
import {resolveOrderItemPhoto} from '../lib/orderItemPhoto.ts';
import {createUiLoader} from './admin-ui-test-loader.mjs';

const db=new PGlite();
try {
  await db.exec(await fs.readFile('scripts/fixtures/brand-move-inventory-snapshot.sql','utf8'));
  await db.exec(await fs.readFile('scripts/fixtures/brand-move-bank-wrapper-snapshot.sql','utf8'));
  await db.query('insert into settings(id,key,value) values(1,$1,$2)', ['shop_bank_config_v1',JSON.stringify({version:1,accounts:[{id:'primary',enabled:true,bankName:'격리은행',bankAccount:'000000000000',bankHolder:'격리검수'}],routing:{mode:'all',allAccountId:'primary'}})]);
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(await fs.readFile('supabase/sql/product_brand_links.sql','utf8'));
  const brand={id:1,product_name:'브랜드',price:129000,stock:0,product_note:JSON.stringify({brand_group:{enabled:true,detail_options:{OLD:{sizes:['M']}}}})};
  const source={id:2,product_name:'임시 상품',price:39000,stock:7,image_url:'actual.jpg',color_options:['베이지'],size_options:['S'],product_note:JSON.stringify({stock_management_enabled:true,stock_variants:[{color:'베이지',size:'S',stock:7}]})};
  for(const row of [brand,source]) await db.query('insert into products(id,product_name,price,stock,product_note,image_url,color_options,size_options) values($1,$2,$3,$4,$5,$6,$7,$8)',[row.id,row.product_name,row.price,row.stock,row.product_note,row.image_url??null,row.color_options??[],row.size_options??[]]);
  await db.query('insert into orders(product_id,product_name,qty,product_price,final_amount,order_group_id) values(2,$1,1,39000,39000,$2)',['임시 상품','historical']);
  const history=async()=> (await db.query("select * from orders where order_group_id='historical'")).rows;
  const before=await history();
  const beforeSales=aggregateSalesItems(before);
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://isolated.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-fixture-key';
  const {GET,POST}=createUiLoader({
    '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>({sub:'isolated-admin'})},
    '@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{
      try {
        const result=name==='product_brand_move_snapshot'
          ? await db.query('select public.product_brand_move_snapshot($1,$2) as result',[args.p_source_id,args.p_parent_id])
          : await db.query('select public.product_brand_move($1,$2,$3,$4,$5,$6,$7) as result',[args.p_action,args.p_source_id,args.p_parent_id,args.p_detail_name,args.p_request_id,args.p_source_version,args.p_parent_version]);
        return {data:result.rows[0].result,error:null};
      }catch(error){return {data:null,error};}
    }})},
  })('app/api/admin-live/product-brand-move/route.ts');
  const snapshot=async()=>{const response=await GET({url:'https://isolated.example/api/admin-live/product-brand-move?sourceId=2&parentId=1'});assert.equal(response.status,200);return response.json();};
  const move=async(action,request)=>{
    const current=await snapshot();
    const response=await POST({json:async()=>({action,sourceId:'2',parentId:'1',detailName:action==='move'?'NEW':null,requestId:request,expectedSourceVersion:current.sourceVersion,expectedParentVersion:current.parentVersion})});
    assert.equal(response.status,200);return response.json();
  };
  const link=(await move('move','inventory-move')).link;
  const beforeSubmitSnapshot=await snapshot();
  const projected=resolveBroadcastBrandProducts([brand,source],[link],['1','2']);
  assert.equal(projected.filter(row=>row.id===2).length,1);
  const roots=buildBrandOrderCatalog([brand,source],[link],['1','2']);
  const selected=resolveBrandOrderSelection(roots[0],'NEW');
  const rows=[{product_id:selected.id,product_name:selected.product_name,color:'베이지',size:'S',qty:2,product_price:selected.price,total_price:78000,final_amount:78000,order_group_id:'new-order'}];
  const submit=async payload=>(await db.query('select public.submit_customer_order_with_bank_routing($1,0,$2,$3,$4,$5,$6) as result',[JSON.stringify(payload),'01000000000','격리검수','격리검수','isolated-session','999999999'])).rows[0].result;
  assert.equal((await submit(rows)).ok,true);
  const assigned=(await db.query("select payment_bank_account_id,kakao_id,product_id,product_name from orders where order_group_id='new-order'")).rows[0];
  assert.equal(assigned.payment_bank_account_id,'primary');assert.equal(assigned.kakao_id,'999999999');
  assert.equal(String(assigned.product_id),'2');assert.equal(assigned.product_name,'NEW');
  const remaining=async()=>JSON.parse((await db.query('select product_note from products where id=2')).rows[0].product_note).stock_variants[0].stock;
  assert.equal(await remaining(),5,'deduct 2 exactly once from original 7');
  assert.equal((await submit(rows)).duplicate,true,'same order group retry is idempotent');
  assert.equal(await remaining(),5,'retry cannot double-deduct');
  assert.equal((await db.query("select count(*)::int as n from orders where order_group_id='new-order'")).rows[0].n,1);
  assert.equal((await db.query('select product_note from products where id=1')).rows[0].product_note,brand.product_note,'parent stock remains untouched');
  await assert.rejects(()=>submit([{...rows[0],qty:6,order_group_id:'insufficient'}]),/재고가 부족/);
  assert.equal((await db.query("select count(*)::int as n from orders where order_group_id='insufficient'")).rows[0].n,0,'stock shortage rolls back order insertion');
  assert.equal(await remaining(),5);
  const stale=await POST({json:async()=>({action:'undo',sourceId:'2',parentId:'1',requestId:'stale-after-sale',expectedSourceVersion:beforeSubmitSnapshot.sourceVersion,expectedParentVersion:beforeSubmitSnapshot.parentVersion})});
  assert.equal(stale.status,409,'sale changes source version; stale undo must not overwrite it');
  assert.equal((await db.query('select count(*)::int as n from product_brand_links')).rows[0].n,1);
  assert.deepEqual(await history(),before,'move/submit cannot rewrite previous orders');
  assert.deepEqual(aggregateSalesItems(await history()),beforeSales,'historical sales totals/options remain unchanged');
  assert.equal(resolveOrderItemPhoto(source,{productName:'임시 상품',color:'베이지'}).url,'actual.jpg');
  await db.query('update products set product_description=$1 where id=2',['저장한 상세설명\n줄바꿈']);
  await move('undo','inventory-undo');
  assert.equal((await db.query('select product_description from products where id=2')).rows[0].product_description,'저장한 상세설명\n줄바꿈');
  assert.equal(await remaining(),5,'undo cannot restore already sold inventory');
  assert.deepEqual(await history(),before);
  console.log('PASS real move route + deployed bank/stock RPC snapshots: exact source order, deduction once, duplicate, shortage rollback, stale conflict, history and edited-source undo');
} finally {await db.close();}
