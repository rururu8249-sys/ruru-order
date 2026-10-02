// URLs verified against the rendered official character pages. User confirms usage rights.
import {mkdir,writeFile,access} from 'node:fs/promises';
const folder='public/event-art/official-v1';await mkdir(folder,{recursive:true});
const ids=['01','02','03','04','05','06','10','11','13','12','09','07','08','15','14','16','17','22','23','21','18','24','25','26'];
const assets=ids.map(id=>({url:`https://www.tv-asahi.co.jp/shinchan/character/img/${id}.png`,path:`${folder}/shinchan-${id}.png`}));
assets.push({url:'https://www.sanrio.co.jp/wp-content/uploads/2022/06/mv-hellokitty.png',path:`${folder}/hello-kitty.png`});
for(const id of ['01','02','03','04','05','06'])assets.push({url:`https://www.doolymuseum.or.kr/html/images/sub0104_${id}.png`,path:`${folder}/dooly-${id}.png`});
for(const a of assets){try{await access(a.path);continue;}catch{}
 const r=await fetch(a.url);if(!r.ok)throw Error(`Asset download failed ${r.status}: ${a.url}`);
 const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Not PNG: '+a.url);
 await writeFile(a.path,bytes,{flag:'wx'});
}
console.log('Verified/downloaded 31 official PNG assets; no existing asset overwritten');
