import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Character,survivalCharacter}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
// Appending cast must not displace existing players, and running must keep identity.
assert.equal(survivalCharacter(0).name,'짱구');
assert.equal(survivalCharacter(1).name,'키티');
assert.equal(survivalCharacter(2).name,'둘리');
for(const [index,name] of [[16,'쿠로미'],[17,'마이멜로디'],[18,'폼폼푸린'],[19,'시나모롤'],[20,'포차코'],[21,'한교동'],[22,'케로케로케로피'],[23,'구데타마'],[24,'배드바츠마루'],[25,'턱시도샘'],[26,'코기뮹'],[27,'딩구리데이즈'],[28,'키키'],[29,'라라'],[30,'페어리루 립'],[31,'페어리루 해바라기'],[32,'어그레츠코'],[33,'꿈속의 뮤'],[34,'꺼먹살이']]){
 const idle=Character({index,total:108}).props.children;
 assert.equal(idle.props['aria-label'],name,'requested Sanrio identity missing');
 const frames=Array.from({length:8},(_,i)=>Character({index,total:108,moving:true,pose:'run',elapsedMs:i*80}).props.children);
 assert.equal(new Set(frames.map(f=>f.props.style.backgroundPosition)).size,8,'must have eight distinct run frames');
 for(const f of frames){assert.equal(f.props['aria-label'],name);assert(f.props.style.backgroundImage.includes(index<19?'survival-sanrio-a-run-cycle-v1.png':index<22?'survival-sanrio-b-run-cycle-v1.png':index<28?'survival-sanrio-c-run-cycle-v1.png':'survival-featured-d-run-cycle-v1.png'));}
 assert.equal(Character({index,total:108,moving:true,pose:'run',elapsedMs:640}).props.children.props.style.backgroundPosition,frames[0].props.style.backgroundPosition);
}
console.log('PASS appended Sanrio identities, eight-frame run, idle identity, unchanged leads');
