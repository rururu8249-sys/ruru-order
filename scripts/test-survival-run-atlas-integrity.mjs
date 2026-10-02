import assert from 'node:assert/strict';
import sharp from 'sharp';
const atlases=[
 ['survival-workers-run-cycle-v1.png',[0,171,322,478,641,802,960,1098,1254],[0,166,324,479,632,784,939,1092,1254]],
 ['survival-artists-run-cycle-v1.png',[0,174,330,486,645,798,958,1099,1254],[0,161,320,477,633,785,941,1097,1254]],
 ['survival-athletes-run-cycle-v1.png',[0,172,332,491,652,811,964,1102,1254],[0,162,316,471,627,788,941,1098,1254]],
 ['survival-inventors-b-run-cycle-v1.png',[0,220,420,620,811,992],[0,202,403,599,795,993,1197,1388,1585]],
 ['survival-inventors-a-run-cycle-v1.png',[0,264,513,768],[0,271,525,773,1031,1294,1550,1794,2048]],
 ['survival-sanrio-a-run-cycle-v1.png',[0,260,515,768],[0,268,524,772,1033,1289,1539,1794,2048]],
 ['survival-sanrio-b-run-cycle-v1.png',[0,245,502,768],[0,255,507,763,1017,1265,1517,1774,2048]],
 ['survival-sanrio-c-run-cycle-v1.png',[0,194,357,547,734,884,1086],[0,187,368,552,737,922,1107,1284,1448]],
 ['survival-featured-d-run-cycle-v1.png',[0,177,347,501,677,846,1016,1174],[0,184,353,520,682,847,1008,1167,1340]],
 ['survival-leads-run-cycle-v2.png',[0,175,371,525,717,897,1086],[0,187,364,545,718,893,1078,1251,1448]],
 ['survival-family-run-cycle-v1.png',[0,256,512,768]],
 ['survival-dooly-run-cycle-v1.png',[0,231,468,768]],
 ['survival-last-leads-run-cycle-v1.png',[0,228,485,768]],
 ['survival-explorers-run-cycle-v1.png',[0,396,793],[0,247,495,743,991,1239,1487,1735,1983]],
 ['survival-city-run-cycle-v1.png',[0,384,768],[0,250,512,768,1024,1280,1536,1792,2048]],
 ['survival-city-b-run-cycle-v1.png',[0,339,632,941],[0,211,426,629,835,1048,1254,1457,1672]],
 ['survival-city-c-run-cycle-v1.png',[0,330,630,941],[0,209,420,625,835,1050,1259,1464,1672]],
];
for(const[file,rows,columns]of atlases){
 const{data,info}=await sharp('public/event-art/'+file).raw().toBuffer({resolveWithObject:true});
 assert.equal(info.channels,4,'must preserve alpha');
 assert.equal(rows.at(-1),info.height);
 for(const y of rows.slice(1,-1)){
  for(let x=0;x<info.width;x++)assert(data[(y*info.width+x)*4+3]<=100,file+' must not cut a visible body at row '+y);
 }
 if(columns){
  assert.equal(columns.at(-1),info.width);
  for(const x of columns.slice(1,-1))for(let y=0;y<info.height;y++)assert(data[(y*info.width+x)*4+3]<=100,file+' must not cut a visible body at column '+x);
 }
}
console.log('PASS transparent measured atlas separators, full rows, clean lead-frame boundaries');
