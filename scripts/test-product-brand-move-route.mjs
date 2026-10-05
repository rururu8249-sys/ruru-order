import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
import fs from 'node:fs';
assert.ok(fs.existsSync('app/api/admin-live/product-brand-move/route.ts'),'move route must exist');
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';
let session=null,calls=[],error=null;
const {POST,GET}=createUiLoader({
  '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>session},
  '@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{link:null,replayed:false},error};}})},
})('app/api/admin-live/product-brand-move/route.ts');
const body={action:'move',sourceId:'2',parentId:'1',detailName:'NEW',requestId:'request-1',expectedSourceVersion:'a'.repeat(32),expectedParentVersion:'b'.repeat(32)};
const call=async payload=>POST({json:async()=>payload});
assert.equal(typeof GET,'function','authenticated preview snapshot endpoint must exist');
const preview=()=>GET({url:'https://example.test/api/admin-live/product-brand-move?sourceId=2&parentId=1'});
assert.equal((await preview()).status,401);
assert.equal((await call(body)).status,401); assert.equal(calls.length,0);
session={sub:'admin'};
const previewResponse=await preview();
assert.equal(previewResponse.status,200);
assert.equal(previewResponse.headers.get('Cache-Control'),'no-store');
assert.deepEqual(calls.pop(),{name:'product_brand_move_snapshot',args:{p_source_id:'2',p_parent_id:'1'}});
assert.equal((await call({...body,sourceId:'2 OR 1=1'})).status,400);
assert.equal((await call({...body,detailName:''})).status,400);
assert.equal(calls.length,0,'validation must run before database');
assert.equal((await call(body)).status,200);
assert.deepEqual(calls[0],{name:'product_brand_move',args:{p_action:'move',p_source_id:'2',p_parent_id:'1',p_detail_name:'NEW',p_request_id:'request-1',p_source_version:'a'.repeat(32),p_parent_version:'b'.repeat(32)}});
error={code:'40001',message:'Conflict: product changed'};assert.equal((await call(body)).status,409);
error={code:'23505',message:'Duplicate'};assert.equal((await call(body)).status,409);
error={code:'22023',message:'Invalid brand'};assert.equal((await call(body)).status,400);
const {POST:catalogPost}=createUiLoader({
  '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>session},
  '@supabase/supabase-js':{createClient:()=>({from:()=>{const query={update:()=>query,eq:()=>query,then:resolve=>Promise.resolve({data:null,error:{code:'23503',message:'linked source foreign key'}}).then(resolve)};return query;}})},
})('app/api/admin-live/catalog-write/route.ts');
assert.equal((await catalogPost({json:async()=>({table:'products',op:'update',values:{product_note:'{}'},filters:[{type:'eq',col:'id',val:1}]})})).status,409,'catalog must surface protected linked writes as conflicts');
console.log('brand move route: PASS');
let editCalls=[],editError=null;
const editRoute=createUiLoader({
  '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>session},
  '@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{editCalls.push({name,args});return {data:{id:2,product:{id:2,stock:5},version:'a'.repeat(32)},error:editError};}})},
})('app/api/admin-live/catalog-write/route.ts');
session=null;
assert.equal((await editRoute.GET({url:'https://example.test?productId=2'})).status,401);
session={sub:'admin'};
assert.equal((await editRoute.GET({url:'https://example.test?productId=2'})).status,200);
const editBody={table:'products',op:'update',values:{stock:5},filters:[{type:'eq',col:'id',val:'2'}],expectedVersion:'a'.repeat(32),single:true};
assert.equal((await editRoute.POST({json:async()=>editBody})).status,200);
assert.deepEqual(editCalls.pop(),{name:'product_catalog_update',args:{p_id:'2',p_version:'a'.repeat(32),p_values:{stock:5}}});
editError={code:'40001',message:'SQL private detail'};
const conflict=await editRoute.POST({json:async()=>editBody});
assert.equal(conflict.status,409);
assert.equal(JSON.stringify(await conflict.json()).includes('SQL private detail'),false);
console.log('PASS authenticated versioned editor snapshot and atomic conflict response');
