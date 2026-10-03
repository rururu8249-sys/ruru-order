import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load=createUiLoader();
const Reaction=load('components/event-shared/SurvivalReaction.tsx').default;
for(const type of ['lightning','wave','wind','hail','meteor']){
 const html=renderToStaticMarkup(Reaction({type,index:2,total:8,x:50,y:50}));
 assert(!html.includes('data-survival-character'),`${type}: an eliminated reaction must not look like an additional surviving character`);
 assert(html.includes(`data-hazard-contact="${type}"`),`${type}: keep a visible impact effect after removing the duplicate character body`);
 if(type==='wind')assert(html.includes('data-reaction-vortex'),'a struck actor needs a visible local funnel even when the camera crops the ambient tornado');
 const early=renderToStaticMarkup(Reaction({type,index:2,total:8,x:50,y:50,ageMs:120,speech:'으악!!'}));
 const late=renderToStaticMarkup(Reaction({type,index:2,total:8,x:50,y:50,ageMs:350,speech:'으악!!'}));
 assert(early.includes('data-survival-speech="impact"'),'brief impact shout must be visible');
 assert(!late.includes('data-survival-speech="impact"'),'no text may fly or fade along with eliminated character');
 if(type==='meteor')assert(late.includes('data-meteor-impact-debris'),'meteor needs a victim-local debris blast, not just passing fire');
}
console.log('PASS all five reactions avoid idle smiling artwork, including Dooly');
