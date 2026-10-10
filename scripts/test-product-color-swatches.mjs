import assert from 'node:assert/strict';
import fs from 'node:fs';
assert.ok(fs.existsSync('lib/productColorSwatches.ts'), 'saved color swatches require a validated shared contract');
const {normalizeSwatchMap, retainColorSwatches, readProductColorSwatches, sampleColorPixel} = await import('../lib/productColorSwatches.ts');

// Reject executable/invalid CSS while retaining exact option identifiers.
assert.deepEqual(normalizeSwatchMap({' 베이지 ': '#abc', '소라': '#89aBCD', '블랙/화이트': null, bad: 'url(x)', short:'#12', number:7}), {' 베이지 ': '#AABBCC', '소라':'#89ABCD', '블랙/화이트':null});
for (const raw of [null, undefined, 7, [], 'not JSON']) assert.deepEqual(normalizeSwatchMap(raw), {});
assert.deepEqual(normalizeSwatchMap(Object.assign(Object.create({inherited:'#ffffff'}), {own:'#000000'})), {own:'#000000'});
assert.deepEqual(normalizeSwatchMap(JSON.parse('{"__proto__":"#000000","constructor":"#ffffff","블랙":"#000000"}')), {'블랙':'#000000'});
assert.deepEqual(retainColorSwatches({M:'#ff0000', '블랙':'#000000', '없음':'#ffffff', '무늬':null}, ['블랙','없음','무늬']), {'블랙':'#000000','무늬':null});
const note = {color_swatches:{'베이지':'#AABBCC'},detail_color_swatches:{'A-1':{'베이지':'#112233'},'A-2':{'베이지':null}}};
assert.deepEqual(readProductColorSwatches(note), {'베이지':'#AABBCC'});
assert.deepEqual(readProductColorSwatches(JSON.stringify(note),'A-1'), {'베이지':'#112233'});
assert.deepEqual(readProductColorSwatches(note,'A-2'), {'베이지':null});
assert.deepEqual(readProductColorSwatches(note,'A-3'), {'베이지':'#AABBCC'});
assert.deepEqual(readProductColorSwatches('{bad'), {});
assert.deepEqual(readProductColorSwatches({}), {});
// Normalized coordinates must sample the same point regardless of CSS preview size.
const pixels = new Uint8ClampedArray([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,0]);
assert.equal(sampleColorPixel(pixels,2,2,0,0),'#FF0000');
assert.equal(sampleColorPixel(pixels,2,2,.999,0),'#00FF00');
assert.equal(sampleColorPixel(pixels,2,2,.25,.75),'#0000FF');
assert.equal(sampleColorPixel(pixels,2,2,.75,.75),null);
for (const [x,y] of [[-1,0],[1,0],[0,1],[NaN,0]]) assert.equal(sampleColorPixel(pixels,2,2,x,y),null);
assert.equal(sampleColorPixel(pixels,0,2,0,0),null);
assert.equal(sampleColorPixel(pixels,10,10,0,0),null);
console.log('PASS saved swatch validation, exact identifiers, scoped detail maps, sample coordinates/transparency');
