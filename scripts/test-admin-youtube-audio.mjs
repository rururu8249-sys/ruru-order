import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// Removing the ready-time mute must leave the external player audible, and fail.
// Only the external YouTube/network boundaries are doubled; render the real panel.
const players=[];
globalThis.window={location:{hostname:'localhost',origin:'http://localhost:3000'},addEventListener(){},removeEventListener(){},YT:{Player:class {
 constructor(node,options){this.options=options;this.muted=false;this.volume=100;players.push(this);}
 mute(){this.muted=true;} unMute(){this.muted=false;} setVolume(v){this.volume=v;}
 destroy(){this.destroyed=true;} getIframe(){return {setAttribute(){}};}
}}};
globalThis.document={createElement:()=>({})};
globalThis.fetch=async()=>({ok:true,json:async()=>({ok:true,tasks:[]})});
const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})};
let scriptProps;
const Panel=createUiLoader({'@/lib/supabase':{supabase:db},'next/script':{default:props=>{scriptProps=props;return null;}}})('components/admin-live/LiveBroadcastPanels.tsx').default;
const host={appendChild(){},replaceChildren(){}};
let tree;
await act(async()=>{tree=Renderer.create(React.createElement(Panel,{videoRatio:'vertical',youtubeUrl:'https://youtu.be/abcdefghijk',hideProducts:true}),{createNodeMock:()=>host});});
assert.equal(players.length,1,'actual video must initialize the YouTube ready-event controller');
assert.equal(tree.root.findByProps({title:'소리 켜기'}).props.disabled,true,'controls remain unavailable before mute is applied');
await act(async()=>players[0].options.events.onReady({target:players[0]}));
assert.equal(players[0].muted,true,'initial ready must actually mute the player');
assert.equal(tree.root.findByProps({title:'소리 켜기'}).props.disabled,false);
players[0].muted=false; // YouTube's mobile first-play gesture can unmute internally.
await act(async()=>players[0].options.events.onStateChange?.({target:players[0],data:1}));
assert.equal(players[0].muted,true,'first PLAYING must reapply the site mute preference');
await act(async()=>tree.root.findByProps({title:'소리 켜기'}).props.onClick());
assert.equal(players[0].muted,false,'explicit unmute enables sound');
await act(async()=>players[0].options.events.onStateChange?.({target:players[0],data:1}));
assert.equal(players[0].muted,false,'resume must respect explicitly enabled sound');
await act(async()=>tree.root.findByProps({title:'볼륨 100%'}).props.onChange({target:{value:'0'}}));
assert.equal(players[0].muted,true);assert.equal(players[0].volume,0);
await act(async()=>tree.root.findByProps({title:'소리 켜기'}).props.onClick());
assert.equal(players[0].muted,false);assert.equal(players[0].volume,100,'unmuting zero volume restores audible volume');
await act(async()=>tree.root.findByProps({title:'볼륨 100%'}).props.onChange({target:{value:'35'}}));
assert.equal(players[0].muted,false);assert.equal(players[0].volume,35);
await act(async()=>tree.update(React.createElement(Panel,{videoRatio:'vertical',youtubeUrl:'https://youtu.be/lmnopqrstuv',hideProducts:true})));
assert.equal(players[0].destroyed,true,'video replacement releases old player');
assert.equal(players.length,2);
await act(async()=>players[1].options.events.onReady({target:players[1]}));
assert.equal(players[1].muted,true,'new video must start muted again');
await act(async()=>tree.unmount());assert.equal(players[1].destroyed,true);
console.log('PASS real broadcast video ready/mute/volume/replacement/cleanup; no production writes');

await act(async()=>{tree=Renderer.create(React.createElement(Panel,{videoRatio:'vertical',youtubeUrl:'https://youtu.be/abcdefghijk',hideProducts:true}),{createNodeMock:()=>host});});
const oldChat=tree.root.findByProps({title:'YouTube live chat'});
const reconnect=tree.root.findAllByType('button').find(node=>node.props['aria-label']==='YouTube 채팅 다시 연결');
assert(reconnect,'external iframe failure needs a usable reconnect action');
await act(async()=>reconnect.props.onClick());
assert.notEqual(tree.root.findByProps({title:'YouTube live chat'}),oldChat,'reconnect remounts the failed iframe');
const external=tree.root.findAllByType('a').find(node=>node.props['aria-label']==='YouTube 채팅 별도 창으로 열기');
assert.equal(external.props.href,'https://www.youtube.com/live_chat?v=abcdefghijk&is_popout=1');
assert.equal(external.props.rel,'noopener noreferrer');
await act(async()=>tree.unmount());
console.log('PASS external chat reconnect and safe popout fallback');

const sdk=window.YT;
window.YT=undefined;
const beforeCold=players.length;
await act(async()=>{tree=Renderer.create(React.createElement(Panel,{videoRatio:'vertical',youtubeUrl:'https://youtu.be/abcdefghijk',hideProducts:true}),{createNodeMock:()=>host});});
assert.equal(players.length,beforeCold,'cold SDK does not mount prematurely');
const staleApiReady=window.onYouTubeIframeAPIReady;
await act(async()=>scriptProps.onError());
const retryButton=tree.root.findAllByType('button').find(node=>node.children.join('')==='다시 연결');
assert(retryButton,'SDK failure exposes recovery');
await act(async()=>retryButton.props.onClick());
assert.match(scriptProps.src,/retry=1/,'retry reloads the external SDK');
window.YT=sdk;
await act(async()=>staleApiReady());
assert.equal(players.length,beforeCold,'stale SDK callback cannot mount an abandoned player');
await act(async()=>window.onYouTubeIframeAPIReady());
assert.equal(players.length,beforeCold+1);
const coldPlayer=players.at(-1);
await act(async()=>coldPlayer.options.events.onReady({target:coldPlayer}));
assert.equal(coldPlayer.muted,true,'cold SDK starts muted after retry');
await act(async()=>tree.update(React.createElement(Panel,{videoRatio:'vertical',youtubeUrl:'https://youtu.be/lmnopqrstuv',hideProducts:true})));
const replacementPlayer=players.at(-1);
await act(async()=>coldPlayer.options.events.onReady({target:coldPlayer}));
assert.equal(tree.root.findByProps({title:'소리 켜기'}).props.disabled,true,'stale ready cannot enable replacement controls');
await act(async()=>replacementPlayer.options.events.onReady({target:replacementPlayer}));
assert.equal(replacementPlayer.muted,true);
await act(async()=>tree.unmount());
console.log('PASS cold SDK/error/retry/stale callback lifecycle');
