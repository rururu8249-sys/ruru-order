import assert from 'node:assert/strict';
import fs from 'node:fs';
assert.ok(fs.existsSync('lib/adminColorNames.ts'), 'admin color names must resolve through the researched dictionary');
const {suggestColorName, koreanColorAliases} = await import('../lib/adminColorNames.ts');
for (const [name, expected] of [['모카','#9D7651'],['오트밀','#C9C1B1'],['소라','#9FB9E2'],['블랙','#000000'],['Ivory','#FFFFF0'],[' sky-blue ','#9FB9E2'],['그레이','#808080'],['gray','#808080'],['네이비','#000080']]) {
  assert.equal(await suggestColorName(name), expected, name);
}
for (const name of ['모르는색123','블랙/화이트','체크','멜란지','M','없음','']) assert.equal(await suggestColorName(name),null,name);
for (const alias of Object.keys(koreanColorAliases)) assert.ok(await suggestColorName(alias),`unresolved alias ${alias}`);
console.log(`PASS English dictionary, ${Object.keys(koreanColorAliases).length} Korean aliases, unknown/pattern names remain unassigned`);
