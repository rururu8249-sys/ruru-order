import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the real page loader. Delayed I/O is the only replacement.
const text=fs.readFileSync('app/order/page.tsx','utf8');
const ast=ts.createSourceFile('page.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let node;
const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='loadBroadcast')node=n.initializer;ts.forEachChild(n,visit);};
visit(ast);
let productLoader;
const findProductLoader=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='loadBroadcastProducts')productLoader=n.initializer;ts.forEachChild(n,findProductLoader);};
findProductLoader(ast);
// Run the real first DB query: products are hydrated by the catalog, not twice.
const queryStatement=productLoader.body.statements[0].getText(ast);
const queryJs=ts.transpileModule('async function query(){'+queryStatement+';return data;}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let projection='';
const queryDouble={select:value=>{projection=value;return queryDouble;},eq:async()=>({data:[{product_id:7,sort_order:1,products:{id:7}}],error:null})};
await new Function('supabase','broadcastId',queryJs+';return query();')({from:table=>{assert.equal(table,'broadcast_products');return queryDouble;}},7);
assert.equal(projection,'product_id, sort_order, products(id)','broadcast membership read must not download full catalog product fields twice');
assert.match(productLoader.getText(ast), /setBroadcastProducts\(nextProducts\);\s*setProductListState\("ready"\)/, 'successful polling must recover readiness');
assert.match(text, /if \(broadcastLoaded && productListState === "ready" && !isBroadcastOn && !shopOpen\)/, 'closed-shop notice must not mask loading or retry');
const js=ts.transpileModule('const load='+node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture({live=true,broadcastError=false,productOk=true,catalogOk=true}={}){
  const events=[];const catalog=deferred();const products=deferred();
  const context={
    supabase:{from:table=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>table==='broadcasts'?{data:live?{id:7,status:'ON'}:null,error:broadcastError?{message:'offline'}:null}:{data:{value:''},error:null}};return q;}},
    console:{log:()=>{}},
    loadGroupBuyQuickProductsFromCatalog:async()=>{events.push('catalog-start');await catalog.promise;events.push('catalog-end');return catalogOk;},
    loadBroadcastProducts:async id=>{assert.equal(id,7);events.push('products-start');await products.promise;events.push('products-end');return productOk;},
    setShopOpen:()=>{},setNextLiveText:()=>{},setBroadcast:v=>events.push(v?'live':'off'),setBroadcastProducts:()=>{},
    setBroadcastLoaded:v=>events.push('broadcast-loaded:'+v),setProductListState:v=>events.push(v),
  };
  const load=new Function(...Object.keys(context),js+';return load;')(...Object.values(context));
  return {load,events,catalog,products};
}
const live=fixture();const pending=live.load();await tick();
assert.ok(live.events.includes('products-start'),'live products must start without waiting for full catalog');
assert.ok(!live.events.includes('ready'),'empty pre-load grid must not be declared ready');
live.products.resolve();await pending;
assert.ok(live.events.includes('ready'),'live list becomes ready after its products finish');
assert.ok(!live.events.includes('catalog-end'),'full catalog cannot delay live readiness');
live.catalog.resolve();await tick();
const shop=fixture({live:false});const shopPending=shop.load();await tick();
assert.ok(!shop.events.includes('ready'),'OFF shop must wait for its own catalog');
assert.ok(!shop.events.includes('products-start'),'OFF shop must not request live items');
shop.catalog.resolve();await shopPending;assert.ok(shop.events.includes('ready'));
const failed=fixture({productOk:false});const failedPending=failed.load();await tick();failed.products.resolve();await failedPending;
assert.ok(failed.events.includes('error'));assert.ok(!failed.events.includes('ready'),'failed product lookup is not an empty valid catalog');failed.catalog.resolve();
const offline=fixture({broadcastError:true});await offline.load();
assert.ok(offline.events.includes('error'));assert.ok(!offline.events.includes('catalog-start'),'broadcast lookup failure cannot expose OFF catalog');
const badShop=fixture({live:false,catalogOk:false});const badShopPending=badShop.load();badShop.catalog.resolve();await badShopPending;assert.ok(badShop.events.includes('error'));
console.log('PASS real customer loader: live-first, OFF catalog wait, no premature empty state, fail-closed errors');
