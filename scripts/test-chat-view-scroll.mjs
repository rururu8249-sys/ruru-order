import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';

const effects=[], layouts=[], listeners=new Map(), frames=new Map();
let id=0, reduced=false, following=true, resize, disconnected=false;
const box={scrollHeight:1200,clientHeight:400,_top:0,
 get scrollTop(){return this._top;},set scrollTop(n){this._top=Math.min(Math.max(0,n),this.scrollHeight-this.clientHeight);},
 addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);}};
const content={};let refCount=0;
globalThis.window={matchMedia:()=>({get matches(){return reduced;}})};
globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
globalThis.cancelAnimationFrame=i=>frames.delete(i);
globalThis.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}disconnect(){disconnected=true;}};
globalThis.WheelEvent=class{constructor(deltaY){this.deltaY=deltaY;}};
const react={useRef:value=>({current:++refCount===1?box:refCount===2?content:value}),useState:value=>[value,v=>{following=v;}],useEffect:fn=>effects.push(fn),useLayoutEffect:fn=>layouts.push(fn)};
const {useChatAutoScroll}=createUiLoader({react})('lib/useChatAutoScroll.ts');
const api=useChatAutoScroll([1],'layout',true);
const cleanup=effects[0]();layouts[0]();assert.equal(box.scrollTop,800);listeners.get('keydown')({key:'End'});assert.equal(following,true,'End at bottom must not stop following');
const finish=()=>{for(let n=0;frames.size&&n<100;n++){const work=[...frames.values()];frames.clear();work.forEach(fn=>fn());}assert.equal(frames.size,0,'Animation must settle');};
box.scrollHeight+=200;resize();assert.equal(box.scrollTop,800,'Smooth movement must not jump immediately');listeners.get('pointerdown')({type:'pointerdown'});listeners.get('pointerup')();finish();assert.equal(box.scrollTop,1000,'Tap without scrolling must resume the interrupted animation');
listeners.get('wheel')(new WheelEvent(-200));box.scrollTop-=200;listeners.get('scroll')();assert.equal(following,false);
box.scrollHeight+=100;resize();finish();assert.equal(box.scrollTop,800,'Reading older messages must be respected');
api.followLatest();finish();assert.equal(box.scrollTop,1100);assert.equal(following,true);
listeners.get('wheel')(new WheelEvent(100));box.scrollHeight+=100;resize();finish();assert.equal(box.scrollTop,1200,'Wheel at bottom must not disable following');
listeners.get('wheel')(new WheelEvent(-10));box.scrollTop-=10;listeners.get('scroll')();assert.equal(following,false,'Small deliberate upward scroll must pause too');
listeners.get('wheel')(new WheelEvent(10));box.scrollTop+=10;listeners.get('scroll')();assert.equal(following,true,'Manual return to bottom resumes following');
listeners.get('touchstart')({type:'touchstart'});assert.equal(listeners.has('pointercancel'),false,'Touch pan handoff must not resume early');box.scrollTop-=80;listeners.get('scroll')();listeners.get('touchend')();assert.equal(following,false,'Touch pan must remain paused after pointer handoff');api.followLatest();finish();
reduced=true;box.scrollHeight+=300;resize();assert.equal(box.scrollTop,1500,'Reduced-motion follows instantly');
cleanup();assert.equal(disconnected,true);assert.equal(listeners.size,0);assert.equal(frames.size,0);
console.log('PASS chat-view auto-scroll: late layout, smooth settling, manual read, resume, wheel boundary, reduced motion, cleanup');
