const model = await import('../lib/productDetailModel.ts');
function assert(cond, msg){ if(!cond) throw new Error(msg); }
assert(typeof model.buildDesignGroupChatText === 'function', 'buildDesignGroupChatText helper missing');
const same = {
  id:'design-33', title:'BB-401M·BB-402M·BB-403M 남성용 패딩 아우터', members:[
    {detailName:'BB(버버리)-401M 남성용 패딩 아우터 · 블랙',code:'BB-401M',price:239000,colors:['블랙'],sizes:['S','M','L']},
    {detailName:'BB(버버리)-402M 남성용 패딩 아우터 · 브라운',code:'BB-402M',price:239000,colors:['브라운'],sizes:['S','M','L']},
    {detailName:'BB(버버리)-403M 남성용 패딩 아우터 · 그레이',code:'BB-403M',price:239000,colors:['그레이'],sizes:['S','M','L']},
  ]
};
const sameText = model.buildDesignGroupChatText(same);
assert(sameText.includes('✅ 현재상품 ✅'), 'current product marker');
assert(!sameText.includes('같은디자인'), 'old group marker removed');
assert(sameText.includes('남성용 패딩 아우터'), 'common product name');
assert(sameText.includes('BB-401M 블랙'), 'code/color 1');
assert(sameText.includes('BB-402M 브라운'), 'code/color 2');
assert(sameText.includes('BB-403M 그레이'), 'code/color 3');
assert(sameText.includes('공통 사이즈 S,M,L'), 'common size shown once');
assert(sameText.match(/사이즈/g)?.length === 1, 'common size not repeated per color');
assert(sameText.includes('각 239,000원'), 'same price compressed');
assert(!sameText.includes('없음'), 'meaningless color omitted');
assert(sameText.length <= 200, 'youtube-safe compact group copy');
const diff = {id:'d',title:'테스트 아우터',members:[
  {detailName:'AA-1 아우터 · 화이트',code:'AA-1',price:100000,colors:['화이트'],sizes:['S','M','L']},
  {detailName:'AA-2 아우터 · 블랙',code:'AA-2',price:120000,colors:['블랙'],sizes:['M','L']},
]};
const diffText=model.buildDesignGroupChatText(diff);
assert(diffText.includes('AA-1 화이트'), 'different price 1 code/color');
assert(diffText.includes('AA-2 블랙'), 'different price 2 code/color');
assert(diffText.includes('사이즈 S,M,L'), 'different size 1 shown');
assert(diffText.includes('사이즈 M,L'), 'different size 2 shown');
assert(!diffText.includes('공통 사이즈'), 'different sizes are not mislabeled as common');
assert(diffText.includes('100,000원'), 'different price 1 exact');
assert(diffText.includes('120,000원'), 'different price 2 exact');
console.log('design group chat tests passed');
