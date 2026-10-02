import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// Click-only span roles and nested buttons must fail. Native sibling buttons
// make the browser's Enter/Space activation available without custom key logic.
const Sidebar=createUiLoader({'./AdminLiveSidebarPresence':{default:()=>null},'./AdminLiveLogoutButton':{default:()=>null},'./AdminLiveCardPayPopup':{openPayster(){}},'@/lib/useShopInfo':{useShopInfo:()=>({contactType:'channel',contactValue:'https://example.com',adminChatUrl:'',paysterUrl:''})}})('components/admin-live/AdminLiveSidebar.tsx').default;
let tree,selected=[],closed=0,menus=[];
await act(async()=>{tree=Renderer.create(React.createElement(Sidebar,{activeMenu:'orders',onMenuChange:key=>menus.push(key),theme:'light',onToggleTheme(){},exceptionBadges:{needMatch:2,cardUnpaid:3},onExceptionBadgeClick:kind=>selected.push(kind),onCloseNav:()=>closed++}));});
for(const [label,kind] of [['매칭필요 2 ›','match'],['카드미결제 3 ›','card']]){
 const node=tree.root.findAllByType('button').find(n=>n.children.join('')===label);
 assert(node,'exception badge must be a native keyboard-accessible button: '+label);
 assert.equal(node.props.type,'button');
 let parent=node.parent;while(parent){assert.notEqual(parent.type,'button','interactive badges cannot nest inside nav buttons');parent=parent.parent;}
 await act(async()=>node.props.onClick());assert.equal(selected.at(-1),kind);
}
assert.deepEqual(menus,[],'badge must not also activate the parent navigation');assert.equal(closed,2);
await act(async()=>tree.unmount());
console.log('PASS native independent badge buttons preserve exception filters');
