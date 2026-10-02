import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const {default:Character}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
// Missing artist row mappings would keep an instrument-playing idle pose while sliding.
for(const [index,name] of [[61,'창작 예술가 1'],[62,'창작 예술가 2'],[63,'창작 예술가 3'],[64,'창작 예술가 4'],[65,'창작 예술가 5'],[66,'창작 예술가 6'],[67,'창작 예술가 7'],[68,'창작 예술가 8']]){
 const idle=Character({index,total:73}).props.children.props;
 assert.equal(idle['aria-label'],name);
 const frames=Array.from({length:8},(_,i)=>Character({index,total:73,moving:true,pose:'run',elapsedMs:i*80}).props.children.props);
 assert.equal(new Set(frames.map(f=>f.style.backgroundPosition)).size,8,'running must advance eight crops for '+name);
 for(const frame of frames){assert.equal(frame['aria-label'],name);assert(frame.style.backgroundImage.includes('survival-artists-run-cycle-v1.png'));assert(!/NaN|Infinity|undefined/.test(JSON.stringify(frame.style)));}
 assert.equal(Character({index,total:73,moving:true,pose:'run',elapsedMs:640}).props.children.props.style.backgroundPosition,frames[0].style.backgroundPosition);
 assert.equal(Character({index,total:73,moving:true,pose:'duck',elapsedMs:240}).props.children.props.style.backgroundImage,idle.style.backgroundImage);
 for(const elapsedMs of [-1,NaN,Infinity])assert.equal(Character({index,total:73,moving:true,pose:'run',elapsedMs}).props.children.props.style.backgroundPosition,frames[0].style.backgroundPosition);
}
console.log('PASS artist locomotion crops, preserved identity, idle/duck, loop, malformed time');
