import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Character,survivalCharacter,SURVIVAL_CHARACTER_COUNT}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
// Any idle-only identity leaking into the active pool must fail this test.
assert.equal(SURVIVAL_CHARACTER_COUNT,77);
assert.equal(new Set(Array.from({length:77},(_,i)=>survivalCharacter(i).name)).size,77);
const known=['짱구','키티','둘리','흰둥이','철수','유리','훈이','맹구','봉미선','신형만','짱아','또치','희동이','고길동','도우너','마이콜','쿠로미','마이멜로디','폼폼푸린','시나모롤','포차코','한교동','케로케로케로피','구데타마','배드바츠마루','턱시도샘','코기뮹','딩구리데이즈','키키','라라','페어리루 립','페어리루 해바라기','어그레츠코','꿈속의 뮤','꺼먹살이'];
assert.deepEqual(Array.from({length:35},(_,i)=>survivalCharacter(i).name),known);
assert(Array.from({length:42},(_,i)=>survivalCharacter(i+35).name).every(n=>n.startsWith('창작 ')));
for(let index=0;index<1000;index++){
 const props={index,total:1000,moving:true,pose:'run'};
 const first=Character({...props,elapsedMs:0}).props.children.props;
 const next=Character({...props,elapsedMs:80}).props.children.props;
 assert.notEqual(first.style.backgroundPosition,next.style.backgroundPosition,'static identity must not be assigned: '+first['aria-label']);
 assert.equal(first['aria-label'],survivalCharacter(index%77).name);
 assert(!/NaN|Infinity|undefined/.test(JSON.stringify(first.style)));
}
console.log('PASS 77 unique animated identities and 1000 participant cyclic assignment');
