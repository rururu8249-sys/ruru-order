import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Character,survivalCharacter,SURVIVAL_CHARACTER_COUNT}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
// Missing row mapping leaves a standing avatar sliding instead of advancing a gait.
for(let index=69;index<77;index++){
 const name=`창작 일하는 이웃 ${index-68}`;
 const idle=Character({index,total:81}).props.children.props;
 assert.equal(idle['aria-label'],name);
 const frames=Array.from({length:8},(_,i)=>Character({index,total:81,moving:true,pose:'run',elapsedMs:i*80}).props.children.props);
 assert.equal(new Set(frames.map(f=>f.style.backgroundPosition)).size,8,name);
 for(const frame of frames){assert(frame.style.backgroundImage.includes('survival-workers-run-cycle-v1.png'));assert.equal(frame['aria-label'],name);assert(!/NaN|Infinity|undefined/.test(JSON.stringify(frame.style)));}
 assert.equal(Character({index,total:81,moving:true,pose:'run',elapsedMs:640}).props.children.props.style.backgroundPosition,frames[0].style.backgroundPosition);
 assert.equal(Character({index,total:81,moving:true,pose:'duck'}).props.children.props.style.backgroundImage,idle.style.backgroundImage);
}
// Roster overflow must recycle identities without missing assets or malformed styles.
assert.equal(SURVIVAL_CHARACTER_COUNT,77);
for(let index=0;index<1000;index++){
 assert.deepEqual(survivalCharacter(index),survivalCharacter(index%77));
 const art=Character({index,total:1000,moving:true,pose:'run',elapsedMs:240}).props.children.props;
 assert(art.style.backgroundImage);assert(!/NaN|Infinity|undefined/.test(JSON.stringify(art.style)));
}
console.log('PASS eight worker gait crops, identity, idle, loop and 1000-person identity recycling');
