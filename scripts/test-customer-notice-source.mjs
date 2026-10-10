import assert from 'node:assert/strict';
import {resolveCustomerNotice} from '../lib/customerNoticeSource.ts';

// Catches copying legacy title/bar over the selected public notice, or leaking hidden content.
const rows = [
  {key:'popup_notice_title',value:'기존 제목'},
  {key:'popup_notice_text',value:'기존 본문'},
  {key:'popup_notice_bar',value:'기존 요약'},
];
const selected = [...rows,{key:'popup_notice_id',value:'17'}];
assert.deepEqual(await resolveCustomerNotice(rows,()=>{throw Error('must not read');}),
  {title:'기존 제목',text:'기존 본문',bar:'기존 요약',linked:false,available:true});
assert.deepEqual(await resolveCustomerNotice(selected,async id=>{
  assert.equal(id,17); return {id:17,title:'배송 안내',content:'10월 15일 출고\n변경된 본문',is_visible:true};
}),{title:'배송 안내',text:'10월 15일 출고\n변경된 본문',bar:'배송 안내',linked:true,available:true});
for(const record of [null,{id:17,title:'비공개',content:'비공개 본문',is_visible:false},{id:18,title:'다른 글',content:'다른 본문',is_visible:true}]) {
  assert.deepEqual(await resolveCustomerNotice(selected,async()=>record),
    {title:'',text:'',bar:'',linked:true,available:false});
}
assert.equal((await resolveCustomerNotice(selected,async()=>{throw Error('network');})).available,false);
for(const value of ['abc','-1','1.5','0','9007199254740992']) {
  assert.equal((await resolveCustomerNotice([...rows,{key:'popup_notice_id',value}],()=>{throw Error('invalid id');})).available,false);
}
assert.equal((await resolveCustomerNotice([...selected,{key:'unused',value:'x'}],async()=>({id:17,title:'수정 제목',content:'수정 본문',is_visible:true}))).bar,'수정 제목');
assert.equal((await resolveCustomerNotice([...rows,{key:'popup_notice_id',value:''}],async()=>null)).text,'기존 본문');
console.log('PASS linked public notice owns title/body; legacy preserved; invalid/private/missing/failing reads hidden');
