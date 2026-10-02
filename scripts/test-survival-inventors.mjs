import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Character}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
// Missing cycle mapping would silently leave these people sliding in their idle pose.
for(const [index,name] of [[45,'창작 발명가 1'],[46,'창작 발명가 2'],[47,'창작 발명가 3'],[48,'창작 발명가 4'],[49,'창작 발명가 5'],[50,'창작 발명가 6'],[51,'창작 발명가 7'],[52,'창작 발명가 8']]){
 const idle=Character({index,total:52}).props.children.props;
 assert.equal(idle['aria-label'],name);
 const frames=Array.from({length:8},(_,i)=>Character({index,total:52,moving:true,pose:'run',elapsedMs:i*80}).props.children.props);
 assert.equal(new Set(frames.map(f=>f.style.backgroundPosition)).size,8,'running must advance all eight crop frames');
 for(const frame of frames){assert.equal(frame['aria-label'],name);assert(frame.style.backgroundImage.includes(index<48?'survival-inventors-a-run-cycle-v1.png':'survival-inventors-b-run-cycle-v1.png'));assert(!/NaN|Infinity|undefined/.test(JSON.stringify(frame.style)));}
 assert.equal(Character({index,total:52,moving:true,pose:'run',elapsedMs:640}).props.children.props.style.backgroundPosition,frames[0].style.backgroundPosition);
 assert.equal(Character({index,total:52,moving:true,pose:'duck',elapsedMs:240}).props.children.props.style.backgroundImage,idle.style.backgroundImage);
}
console.log('PASS inventor run frames, preserved idle identities, loop and duck');
