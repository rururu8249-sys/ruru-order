import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {CHAT_FONT_SIZES,CHAT_YT_SCALES,CHAT_FONT_KEY,CHAT_YT_SCALE_KEY,readChatViewSizeIndex}=createUiLoader({})('lib/chatViewSize.ts');
const storage=values=>({getItem:key=>values[key]??null});
const read=(values,kind,compact=false)=>(kind==='site'?CHAT_FONT_SIZES:CHAT_YT_SCALES)[readChatViewSizeIndex(storage(values),kind,compact)];
assert.equal(CHAT_FONT_SIZES[1],12.2,'Site font must change by 1% of the 20px base');
assert.equal(CHAT_YT_SCALES[1],0.81,'YouTube must change by 1 percentage point');
for(const [kind,oldValues,oldKey] of [['site',[16,18,20,23,26,30,34],'ruru_chat_view_size'],['yt',[1,1.15,1.3,1.5,1.75,2],'ruru_chat_view_yt_size']]){
 for(let i=0;i<oldValues.length;i++)assert.equal(read({[oldKey]:String(i)},kind,true),oldValues[i],'legacy indices preserve the same visual size');
}
assert.equal(read({},'site',true),16);assert.equal(read({},'yt',true),1);
assert.equal(read({},'site'),20);assert.equal(read({},'yt'),1.5);
for(const size of CHAT_FONT_SIZES)assert.equal(read({[CHAT_FONT_KEY]:String(size),ruru_chat_view_size:'6'},'site'),size);
for(const scale of CHAT_YT_SCALES)assert.equal(read({[CHAT_YT_SCALE_KEY]:String(scale),ruru_chat_view_yt_size:'5'},'yt'),scale);
for(const value of ['garbage','-1','99','1.1'])assert.equal(read({ruru_chat_view_size:value},'site',true),16);
for(const value of ['','NaN','Infinity','0','35'])assert.equal(read({[CHAT_FONT_KEY]:value},'site',true),16);
assert.equal(CHAT_FONT_SIZES[readChatViewSizeIndex({getItem(){throw Error('blocked');}},'site',true)],16);
assert.equal(CHAT_FONT_SIZES.at(-1),34);assert.equal(CHAT_YT_SCALES.at(-1),2);
console.log('PASS 1% steps, bounds, all saved sizes, legacy migration, defaults and invalid storage');
