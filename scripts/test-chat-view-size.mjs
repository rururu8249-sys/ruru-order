import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {CHAT_FONT_SIZES,CHAT_YT_SCALES,CHAT_FONT_KEY,CHAT_YT_SCALE_KEY,readChatViewSizeIndex}=createUiLoader({})('lib/chatViewSize.ts');
const storage=values=>({getItem:key=>values[key]??null});
for(const [kind,values,oldKey] of [['site',CHAT_FONT_SIZES,'ruru_chat_view_size'],['yt',CHAT_YT_SCALES,'ruru_chat_view_yt_size']]){
 for(let i=0;i<values.length-2;i++) assert.equal(readChatViewSizeIndex(storage({[oldKey]:String(i)}),kind,true),i+2,'saved size must survive added smaller choices');
}
assert.equal(CHAT_FONT_SIZES[readChatViewSizeIndex(storage({}),'site',true)],16);
assert.equal(CHAT_YT_SCALES[readChatViewSizeIndex(storage({}),'yt',true)],1);
assert.equal(CHAT_FONT_SIZES[readChatViewSizeIndex(storage({}),'site',false)],20);
assert.equal(CHAT_YT_SCALES[readChatViewSizeIndex(storage({}),'yt',false)],1.5);
for(const size of CHAT_FONT_SIZES)assert.equal(CHAT_FONT_SIZES[readChatViewSizeIndex(storage({[CHAT_FONT_KEY]:String(size),ruru_chat_view_size:'6'}),'site',false)],size);
for(const scale of CHAT_YT_SCALES)assert.equal(CHAT_YT_SCALES[readChatViewSizeIndex(storage({[CHAT_YT_SCALE_KEY]:String(scale),ruru_chat_view_yt_size:'5'}),'yt',false)],scale);
for(const value of ['garbage','-1','99','1.1'])assert.equal(CHAT_FONT_SIZES[readChatViewSizeIndex(storage({ruru_chat_view_size:value}),'site',true)],16);
assert.equal(CHAT_FONT_SIZES[readChatViewSizeIndex({getItem(){throw Error('blocked');}},'site',true)],16);
console.log('PASS size bounds, old preference migration, new preference priority, compact defaults, invalid/blocked storage');
