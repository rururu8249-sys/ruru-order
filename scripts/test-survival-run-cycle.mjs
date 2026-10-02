import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const Character=createUiLoader()('components/event-shared/SurvivalCharacter.tsx').default;
const render=(elapsedMs,index=0)=>Character({index,total:3,moving:true,pose:'run',elapsedMs}).props.children;
const first=render(0),next=render(80);
// Wrong asset/row, dropped shared clock, or square sizing would regress these six identities.
for(const[index,name,file,row,rows,columns]of[
 [39,'창작 도시 주민 3','survival-city-b-run-cycle-v1.png',0,[0,339,632,941],[0,211,426,629,835,1048,1254,1457,1672]],
 [40,'창작 도시 주민 4','survival-city-b-run-cycle-v1.png',1,[0,339,632,941],[0,211,426,629,835,1048,1254,1457,1672]],
 [41,'창작 도시 주민 5','survival-city-b-run-cycle-v1.png',2,[0,339,632,941],[0,211,426,629,835,1048,1254,1457,1672]],
 [42,'창작 도시 주민 6','survival-city-c-run-cycle-v1.png',0,[0,330,630,941],[0,209,420,625,835,1050,1259,1464,1672]],
 [43,'창작 도시 주민 7','survival-city-c-run-cycle-v1.png',1,[0,330,630,941],[0,209,420,625,835,1050,1259,1464,1672]],
 [44,'창작 도시 주민 8','survival-city-c-run-cycle-v1.png',2,[0,330,630,941],[0,209,420,625,835,1050,1259,1464,1672]],
]){
 const height=rows[row+1]-rows[row];
 for(let frame=0;frame<8;frame++){
  const sprite=render(frame*80,index),width=columns[frame+1]-columns[frame];
  assert.equal(sprite.props['aria-label'],name);
  assert.equal(sprite.props.style.backgroundImage,`url("/event-art/${file}")`);
  assert.equal(sprite.props.style.aspectRatio,width/height);
  assert.equal(sprite.props.style.backgroundPosition,`${columns[frame]*100/(1672-width)}% ${rows[row]*100/(941-height)}%`);
  assert.equal(sprite.props.style.backgroundSize,`${1672*100/width}% ${941*100/height}%`);
 }
 assert.equal(render(640,index).props.style.backgroundPosition,render(0,index).props.style.backgroundPosition);
 assert.equal(render(NaN,index).props.style.backgroundPosition,render(0,index).props.style.backgroundPosition);
 const rest=Character({index,total:100,moving:false,pose:'rest',elapsedMs:80}).props.children;
 assert.equal(rest.props.style.backgroundImage,render(0,index).props.style.backgroundImage,'idle uses same wardrobe as motion');
}
for(const[index,name,row]of[[37,'창작 도시 주민 1',0],[38,'창작 도시 주민 2',1]]){
 const a=render(0,index),b=render(80,index);
 assert.equal(a.props['aria-label'],name);
 assert(a.props.style.backgroundImage.includes('survival-city-run-cycle-v1.png'));
 assert.equal(a.props.style.aspectRatio,250/384);
 const columns=[0,250,512,768,1024,1280,1536,1792,2048];
 for(let frame=0;frame<8;frame++){
  const width=columns[frame+1]-columns[frame],sprite=render(frame*80,index);
  assert.equal(sprite.props.style.aspectRatio,width/384);
  assert.equal(sprite.props.style.backgroundPosition,`${columns[frame]*100/(2048-width)}% ${row*100}%`);
 }
 assert.equal(a.props.style.backgroundPosition,`0% ${row*100}%`);
 assert.notEqual(a.props.style.backgroundPosition,b.props.style.backgroundPosition);
 assert.equal(render(640,index).props.style.backgroundPosition,a.props.style.backgroundPosition);
}
for(const[index,name,row]of[[35,'창작 꼬마 모험가 7',0],[36,'창작 꼬마 모험가 8',1]]){
 const a=render(0,index),b=render(80,index);
 assert.equal(a.props['aria-label'],name);
 assert(a.props.style.backgroundImage.includes('survival-explorers-run-cycle-v1.png'));
 assert.equal(Number(a.props.style.aspectRatio),1983/8/(793/2),'preserve explorer frame proportions rather than squashing into a square');
 assert.equal(a.props.style.backgroundPosition,`0% ${row*100}%`);
 assert.notEqual(a.props.style.backgroundPosition,b.props.style.backgroundPosition);
 assert.equal(render(640,index).props.style.backgroundPosition,a.props.style.backgroundPosition);
}
assert.equal(first.props.style.backgroundImage,'url("/event-art/shinchan-run-cycle-v1.webp")','use real run frames, not a single running portrait');
assert.notEqual(first.props.style.backgroundPosition,next.props.style.backgroundPosition,'legs alternate as event time advances');
assert.equal(render(640).props.style.backgroundPosition,first.props.style.backgroundPosition,'8 frames loop without an extra idle frame');
assert.equal(render(-1).props.style.backgroundPosition,first.props.style.backgroundPosition);
assert.equal(render(NaN).props.style.backgroundPosition,first.props.style.backgroundPosition);
assert.equal(render(80,1).props['aria-label'],'키티','other identities stay unchanged');
for(const [index,name,row] of [[1,'키티',0],[2,'둘리',1],[3,'흰둥이',2],[4,'철수',3],[5,'유리',4],[7,'맹구',5]]){
 const a=render(0,index),b=render(80,index);
 assert.equal(a.props['aria-label'],name);
 assert(a.props.style.backgroundImage.includes('survival-leads-run-cycle-v2.png'));
 const edges=[0,175,371,525,717,897,1086],height=edges[row+1]-edges[row];
 assert.equal(a.props.style.backgroundPosition,`0% ${edges[row]*100/(1086-height)}%`);
 assert.notEqual(a.props.style.backgroundPosition,b.props.style.backgroundPosition);
 assert.equal(render(640,index).props.style.backgroundPosition,a.props.style.backgroundPosition);
 const columns=[0,187,364,545,718,893,1078,1251,1448];
 for(let frame=0;frame<8;frame++){
  const width=columns[frame+1]-columns[frame];
  assert.equal(render(frame*80,index).props.style.backgroundPosition,`${columns[frame]*100/(1448-width)}% ${edges[row]*100/(1086-height)}%`);
 }
}
for(const [index,name,row] of [[6,'훈이',0],[8,'봉미선',1],[9,'신형만',2]]){
 const a=render(0,index),b=render(80,index);
 assert.equal(a.props['aria-label'],name);
 assert(a.props.style.backgroundImage.includes('survival-family-run-cycle-v1.png'));
 assert.equal(a.props.style.backgroundPosition,`0% ${row*50}%`);
 assert.notEqual(a.props.style.backgroundPosition,b.props.style.backgroundPosition);
 assert.equal(render(640,index).props.style.backgroundPosition,a.props.style.backgroundPosition);
}
for(const [index,name,row] of [[11,'또치',0],[12,'희동이',1],[13,'고길동',2]]){
 const a=render(0,index),b=render(80,index);
 assert.equal(a.props['aria-label'],name);
 assert(a.props.style.backgroundImage.includes('survival-dooly-run-cycle-v1.png'));
 assert.notEqual(a.props.style.backgroundPosition,b.props.style.backgroundPosition);
 const edges=[0,231,468,768],height=edges[row+1]-edges[row];
 assert.equal(a.props.style.backgroundPosition,`0% ${edges[row]*100/(768-height)}%`);
 assert.equal(render(640,index).props.style.backgroundPosition,a.props.style.backgroundPosition);
}
for(const [index,name,row] of [[10,'짱아',0],[14,'도우너',1],[15,'마이콜',2]]){
 const a=render(0,index),b=render(80,index);
 assert.equal(a.props['aria-label'],name);
 assert(a.props.style.backgroundImage.includes('survival-last-leads-run-cycle-v1.png'));
 assert.notEqual(a.props.style.backgroundPosition,b.props.style.backgroundPosition);
 const edges=[0,228,485,768],height=edges[row+1]-edges[row];
 assert.equal(a.props.style.backgroundPosition,`0% ${edges[row]*100/(768-height)}%`);
 assert.equal(render(640,index).props.style.backgroundPosition,a.props.style.backgroundPosition);
}
assert.equal(Character({index:0,total:3,winner:true,moving:false,pose:'rest',elapsedMs:80}).props.children.props['aria-label'],'짱구');
console.log('PASS real 8-frame run cycle, shared age, finite inputs, loop, unchanged identity');
const Reaction=createUiLoader()('components/event-shared/SurvivalReaction.tsx').default;
const reaction=Reaction({type:'wave',index:1,total:3,x:50,y:50,ageMs:240});
const body=[reaction.props.children].flat().find(c=>c?.props?.['data-reaction-body']!==undefined);
const findCharacter=n=>Array.isArray(n)?n.map(findCharacter).find(Boolean):n&&typeof n==='object'?(typeof n.type==='function'&&n.props.index===1?n:findCharacter(n.props.children)):undefined;
const character=findCharacter(body.props.children);
assert.equal(character.props.elapsedMs,240,'reaction character must not freeze at frame zero');
