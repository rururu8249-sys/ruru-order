// Read-only verification: no customer records or credentials are printed.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {buildOrderLookupOrFilter,customerOrderLookupSinceIso} from '../lib/customerOrderLookup.ts';
// Use only the publishable client credentials already served to customers.
const base='https://ruru-order.vercel.app';
const html=await(await fetch(base+'/order')).text();
let key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
for (const match of html.matchAll(/src="([^"]+\.js[^"]*)"/g)) {
  const js=await(await fetch(new URL(match[1],base))).text();
  for(const token of js.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]) {
    const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
    if(payload.role==='anon' && payload.ref==='rpmpqudiscpasivrwuyz') key=token;
  }
}
assert(key,'set NEXT_PUBLIC_SUPABASE_ANON_KEY to the project publishable key');
const sb=createClient('https://rpmpqudiscpasivrwuyz.supabase.co',key);
const {data:sample,error}=await sb.from('orders').select('customer_phone,kakao_id').eq('id',5266).single();
assert.ifError(error);
const filter=buildOrderLookupOrFilter(sample.kakao_id,sample.customer_phone);
const {data:rows,error:queryError}=await sb.from('orders').select('id,kakao_id').gte('created_at',customerOrderLookupSinceIso()).or(filter).order('created_at',{ascending:false}).limit(200);
assert.ifError(queryError);
assert(rows.some(r=>r.id===5300),'reported BB-58 card order must be visible');
assert(rows.some(r=>r.id===5266),'existing bank-transfer order must stay visible');
assert(rows.every(r=>!r.kakao_id || r.kakao_id===sample.kakao_id),'other Kakao accounts must stay excluded');
console.log(`PASS live public-client query: reported card order restored, bank-transfer retained, ${rows.length} rows, no foreign Kakao ID`);
