import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
import fs from 'node:fs';
assert.ok(fs.existsSync('app/api/admin-live/product-brand-move/route.ts'),'move route must exist');
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';
let session=null,calls=[],error=null;
const {POST}=createUiLoader({
  '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>session},
  '@supabase/supabase-js':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{link:null,replayed:false},error};}})},
})('app/api/admin-live/product-brand-move/route.ts');
const body={action:'move',sourceId:'2',parentId:'1',detailName:'NEW',requestId:'request-1',expectedSourceVersion:'a'.repeat(32),expectedParentVersion:'b'.repeat(32)};
const call=async payload=>POST({json:async()=>payload});
assert.equal((await call(body)).status,401); assert.equal(calls.length,0);
session={sub:'admin'};
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
