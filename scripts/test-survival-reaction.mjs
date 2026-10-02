import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const Reaction=load('components/event-shared/SurvivalReaction.tsx').default;
for(const type of ['lightning','wave','wind','hail','meteor']){
 const html=renderToStaticMarkup(Reaction({type,index:2,total:8,x:50,y:50}));
 assert(!html.includes('data-survival-pose="rest"'),`${type}: struck Dooly must not use smiling/V-sign idle artwork`);
 assert(html.includes('survival-known-run-v1.png'),`${type}: preserve recognizable identity using alarmed action artwork`);
 if(type==='wind')assert(html.includes('data-reaction-vortex'),'a struck actor needs a visible local funnel even when the camera crops the ambient tornado');
}
console.log('PASS all five reactions avoid idle smiling artwork, including Dooly');
