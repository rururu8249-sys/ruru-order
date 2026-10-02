import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const api=createUiLoader()('components/event-shared/SurvivalDisaster.tsx');
assert.equal(typeof api.SurvivalWarning,'function','visible, progressing hazard foreshadowing is missing');
for(const type of ['lightning','wave','wind','hail','meteor']){
 const early=api.SurvivalWarning({warning:{type,progress:.1}}),late=api.SurvivalWarning({warning:{type,progress:.8}});
 assert.equal(early.props.style.pointerEvents,'none');
 const a=renderToStaticMarkup(early),b=renderToStaticMarkup(late);
 assert(a.includes('data-warning-weather'),'warning needs a visible approaching weather layer, not only a floating emoji');
 assert.notEqual(a,b,'approaching danger must visibly progress before impact');
 assert(!a.includes('polyline'),'warning must not aim a bolt at a future victim');
}
const Character=createUiLoader()('components/event-shared/SurvivalCharacter.tsx').default;
const look=Character({index:0,total:3,moving:true,pose:'look'}),duck=Character({index:0,total:3,moving:true,pose:'duck'});
assert.notEqual(look.props.children.props.style.transform,duck.props.children.props.style.transform,'duck pose must be visible, not only a data attribute');
console.log('PASS five progressing visual warnings, no future-victim targeting, visible character poses, nonblocking controls');
