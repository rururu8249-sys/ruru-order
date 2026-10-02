import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const{default:C}=createUiLoader()('components/event-shared/SurvivalCharacter.tsx');
// Switching to an unrelated idle illustration changes Hiroshi/Tetsuo/Heedong's clothing.
for(let index=0;index<77;index++){
 const base=C({index,total:77,moving:true,pose:'run',elapsedMs:0}).props.children.props;
 for(const props of [{moving:false,pose:'rest'},{moving:true,pose:'look'},{moving:true,pose:'duck'},{winner:true,pose:'rest'}]){
  const still=C({index,total:77,...props,elapsedMs:240}).props.children.props;
  assert.equal(still.style.backgroundImage,base.style.backgroundImage,base['aria-label']+' must keep the same costume sheet');
  assert.equal(still.style.backgroundPosition,base.style.backgroundPosition,'non-running pose must freeze a valid frame');
 }
}
console.log('PASS all 77 identities keep outfit sheet through ready/look/run/duck/result');
