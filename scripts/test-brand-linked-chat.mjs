import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const brand={id:1,product_name:'브랜드',price:100,product_note:{combo_mode:true,brand_group:{enabled:true,detail_options:{OLD:{sizes:['M']}}}},color_options:['OLD'],size_options:[]};
const source={id:2,product_name:'원본',price:200,color_options:['베이지'],size_options:['S']};
let failed=false;
const sb={from:table=>{
  let ids=[];
  const q={select:()=>q,neq:()=>q,order:()=>q,limit:()=>q,eq:()=>q,or:()=>q,range:()=>q,in:(_field,values)=>{ids=values;return q;},then:resolve=>Promise.resolve({data:table==='broadcasts'?[{id:10,status:'ON'}]:table==='broadcast_products'?[{product_id:1,products:brand}]:table==='product_brand_links'?[{source_id:2,parent_id:1,detail_name:'NEW',original_name:'원본',moved_at:'2026-10-05'}]:[brand,source].filter(row=>ids.includes(String(row.id))),error:failed&&table==='product_brand_links'?{message:'failure'}:null}).then(resolve)};
  return q;
}};
const {loadParseProducts}=createUiLoader({'@/lib/youtube':{readSetting:async()=>null},'@/lib/youtubeChatRead':{SETTING_TEST_LIVE_URL:'test'}})('lib/chatOrderProducts.ts');
const result=await loadParseProducts(sb);
assert.deepEqual(result.products.map(p=>[p.id,p.name,p.variants]),[['1','브랜드',['OLD']],['2','NEW',[]]]);
assert.deepEqual(result.products[1].colors,['베이지']);
assert.deepEqual(result.products[1].sizes,[],'single character option behavior must remain unchanged');
failed=true;
await assert.rejects(()=>loadParseProducts(sb),'relation failure must not silently return wrong inventory identities');
console.log('PASS actual chat loader preserves legacy variants and linked source identity; fails closed');
