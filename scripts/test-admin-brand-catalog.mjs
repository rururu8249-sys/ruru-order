import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const path='app/api/admin-live/product-brand-catalog/route.ts';
assert.ok(fs.existsSync(path),'administrator catalog must read hidden linked originals through authenticated server');
let session=null,calls=0,fail=false;
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='private';
const {GET}=createUiLoader({
  '@/lib/admin-auth':{verifyAdminSessionFromRequest:async()=>session},
  '@supabase/supabase-js':{createClient:()=>({from:()=>{
    calls++;
    const q={select:()=>q,order:()=>q,range:()=>q,then:resolve=>Promise.resolve({data:[{source_id:2,parent_id:1,detail_name:'NEW',original_name:'원본',moved_at:'2026-10-05'}],error:fail?{message:'private error'}:null}).then(resolve)};return q;
  }})},
})(path);
assert.equal((await GET({})).status,401);assert.equal(calls,0);
session={sub:'admin'};
const response=await GET({});
assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
assert.deepEqual((await response.json()).links,[{sourceId:'2',parentId:'1',detailName:'NEW',originalName:'원본',movedAt:'2026-10-05'}]);
fail=true;
const error=await GET({});assert.equal(error.status,503);assert.ok(!JSON.stringify(await error.json()).includes('private error'));
console.log('PASS authenticated administrator relation read and sanitized failure');
