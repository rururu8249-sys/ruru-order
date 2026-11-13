import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
for(const name of ['manual-payment-match','manual-payment-confirm-without-deposit']){
 let writes=0;
 const order={id:1,order_group_id:'group',kakao_id:'990000000077',operator_test_phone:'0200000077',is_test_order:true,exclude_from_payment_match:true,final_amount:100};
 const db={from(table){const q={select(){return q},neq(){return q},in(){return q},eq(){return q},update(){writes++;return q},insert(){writes++;return q},then(resolve){return Promise.resolve({data:table==='orders'?[order]:[{id:2,amount:100}],error:null}).then(resolve)}};return q}};
 const load=createUiLoader({'@supabase/supabase-js':{createClient:()=>db}});
 const route=load(`app/api/admin-v2/${name}/route.ts`);
 const response=await route.POST(new Request('https://shop.test/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderIds:[1],orderGroupId:'group',depositIds:[2],expectedAmount:100})}));
 assert.equal(response.status,409,name+' excludes generated orders before any financial write');
 assert.equal(writes,0);
}
console.log('PASS generated orders cannot consume deposits or be marked paid by manual payment routes');
