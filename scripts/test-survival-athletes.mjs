import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Character}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
// A missing row mapping leaves a sports participant sliding with one static crop.
for(const [index,name] of [[53,'창작 운동선수 1'],[54,'창작 운동선수 2'],[55,'창작 운동선수 3'],[56,'창작 운동선수 4'],[57,'창작 운동선수 5'],[58,'창작 운동선수 6'],[59,'창작 운동선수 7'],[60,'창작 운동선수 8']]){
 const idle=Character({index,total:65}).props.children.props;
 assert.equal(idle['aria-label'],name);
 const frames=Array.from({length:8},(_,i)=>Character({index,total:65,moving:true,pose:'run',elapsedMs:i*80}).props.children.props);
 assert.equal(new Set(frames.map(f=>f.style.backgroundPosition)).size,8,'locomotion must advance eight crops for '+name);
 for(const frame of frames){assert.equal(frame['aria-label'],name);assert(frame.style.backgroundImage.includes('survival-athletes-run-cycle-v1.png'));assert(!/NaN|Infinity|undefined/.test(JSON.stringify(frame.style)));}
 assert.equal(Character({index,total:65,moving:true,pose:'run',elapsedMs:640}).props.children.props.style.backgroundPosition,frames[0].style.backgroundPosition);
 assert.equal(Character({index,total:65,moving:true,pose:'duck',elapsedMs:240}).props.children.props.style.backgroundImage,idle.style.backgroundImage);
 for(const elapsedMs of [-1,NaN,Infinity])assert.equal(Character({index,total:65,moving:true,pose:'run',elapsedMs}).props.children.props.style.backgroundPosition,frames[0].style.backgroundPosition);
}
console.log('PASS athlete/cyclist frame advancement, identity, idle/duck preservation, loop and malformed time');
