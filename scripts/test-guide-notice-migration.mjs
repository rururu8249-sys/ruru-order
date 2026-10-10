import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await fs.readFile('supabase/sql/consolidate_shop_guide_notice.sql','utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
for(const content of ['  원래 안내\n두 번째 줄  ','','   ','\n\t','\u00a0\u3000\ufeff']) {
  const db=new PGlite();
  try {
    await db.exec("create table settings(key text primary key,value text); create table notices(id bigserial primary key,title text not null,content text not null,category text default '공지',is_pinned boolean default false,is_visible boolean default true,sort_order integer default 0,created_at timestamptz default now(),updated_at timestamptz default now());");
    await db.query('insert into settings values($1,$2)',['notice_text',content]);
    await db.exec("insert into notices(title,content) values('쇼핑 전 꼭 확인','다른 본문')");
    await db.exec(sql);
    const marker=(await db.query("select value from settings where key='shop_guide_notice_id'")).rows[0];
    assert.ok(marker,'migration must record completion');
    assert.equal((await db.query("select value from settings where key='notice_text'")).rows[0].value,content,'preserve exact backup');
    const count=content.trim()?2:1;
    assert.equal((await db.query('select count(*)::int n from notices')).rows[0].n,count);
    if(content.trim()) {
      const row=(await db.query('select * from notices where id=$1',[marker.value])).rows[0];
      assert.equal(row.content,content);assert.equal(row.is_visible,true);assert.equal(row.is_pinned,true);
      await db.query('update notices set is_visible=false where id=$1',[marker.value]);
      await db.exec(sql);
      assert.equal((await db.query('select is_visible from notices where id=$1',[marker.value])).rows[0].is_visible,false);
      await db.query('delete from notices where id=$1',[marker.value]);
      await db.exec(sql);
      assert.equal((await db.query('select count(*)::int n from notices')).rows[0].n,1,'rerun must not revive deleted guide');
    } else {await db.exec(sql);assert.equal(marker.value,'none');}
  } finally {await db.close();}
}
console.log('PASS guide migration: exact backup, same-title separation, empty input, idempotency, hidden/deleted preservation');
