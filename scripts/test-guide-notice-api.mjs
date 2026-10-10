import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('app/api/customer-site-alerts/route.ts','utf8');
const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const readBox=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='readBox').getText(ast);
const js=ts.transpileModule(readBox,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const read=Function('NextResponse','matchTarget','BOX_PAGE',`${js};return readBox;`)({json:v=>v},q=>q,20);
for(const marker of [undefined,'17','none','']) {
  const settings=[{key:'notice_text',value:'보존할 상시 안내'},...(marker===undefined?[]:[{key:'shop_guide_notice_id',value:marker}])];
  const sb={from(table){let selected=settings;const q={select(){return this;},eq(k,v){if(table==='settings')selected=selected.filter(r=>r[k]===v);return this;},in(k,vs){if(table==='settings')selected=selected.filter(r=>vs.includes(r[k]));return this;},gt(){return this;},order(){return this;},range(){return this;},limit(){return this;},then(a,b){return Promise.resolve({data:table==='settings'?selected:[],error:null}).then(a,b);}};return q;}};
  const result=await read(sb,'fixture-session','');
  assert.equal(result.shopGuide,marker===undefined?'보존할 상시 안내':'','migrated guide must not reappear even if public article is hidden/deleted');
}
console.log('PASS guide API legacy fallback only before migration, no revival after marker');
