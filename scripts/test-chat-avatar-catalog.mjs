import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
const c=JSON.parse(readFileSync('public/chat-avatars/catalog-v1.json'));
assert.equal(c.slots.length,5000);assert.equal(c.notifications.length,30);assert.equal(new Set(c.notifications).size,30);
for(const i of [...c.slots,...c.notifications])assert.ok(Number.isInteger(i)&&c.images[i]);
for(const x of c.images){assert.ok(x.url.startsWith('/chat-avatars/'));assert.ok(existsSync('public'+x.url));assert.ok(x.source?.startsWith('https://'));assert.ok(!x.url.includes('atlas'));}
for(const cat of ['wonyoung','bts','shinchan','hangyodon','kitty','ghibli','dooly','popular-celebrity','flowers','nature'])assert.ok(c.slots.some(i=>c.images[i].category===cat),cat+' is assigned to real slots');
console.log('PASS',c.images.length,'local source images, 5000 assignment slots, required faces/logos/characters and 30 distinct notification photos');
