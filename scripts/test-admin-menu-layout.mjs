import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const load=createUiLoader();
const menu=load('components/admin-live/adminLiveMenu.ts');
assert.equal(menu.ADMIN_LIVE_ALL_MENU_KEYS.length,14);
assert.equal(menu.isAdminLiveMenuKey('sales'),true,'sales deep link must survive URL validation');
assert.equal(menu.getAdminLiveScreenTitle('sales'),'주문·입금 › 판매기록');
assert.deepEqual(menu.ADMIN_LIVE_SUB_TABS.orders.map(tab=>tab.key),['orders','payments','sales','settlement','event']);
assert.equal(menu.ADMIN_LIVE_TOP_MENUS.length,5);
const routes=Object.values(menu.ADMIN_LIVE_SUB_TABS).flat().map(tab=>tab.key).sort();
assert.deepEqual(routes,[...menu.ADMIN_LIVE_ALL_MENU_KEYS].sort());
const Sidebar=createUiLoader({'./AdminLiveSidebarPresence':{default:()=>null},'./AdminLiveLogoutButton':{default:()=>null},'./AdminLiveCardPayPopup':{openPayster(){}},'@/lib/useShopInfo':{useShopInfo:()=>({contactType:'channel',contactValue:'https://example.com',adminChatUrl:'',paysterUrl:''})}})('components/admin-live/AdminLiveSidebar.tsx').default;
let selected,tree;
await act(async()=>{tree=Renderer.create(React.createElement(Sidebar,{activeMenu:'orders',onMenuChange:key=>selected=key,theme:'light',onToggleTheme(){},exceptionBadges:{needMatch:1,cardUnpaid:1}}));});
const text=JSON.stringify(tree.toJSON());
for(const item of menu.ADMIN_LIVE_TOP_MENUS){
 assert(!text.includes(item.desc),'sidebar repeated description consumes list space: '+item.key);
 const navButton=tree.root.findAllByType('button').find(node=>node.findAllByType('span').some(span=>span.children.includes(item.label)));
 await act(async()=>navButton.props.onClick());assert.equal(selected,item.defaultKey);
}
await act(async()=>tree.unmount());
const SettingsNav=load('components/admin-live/AdminLiveSettingsNav.tsx').default;
await act(async()=>{tree=Renderer.create(React.createElement(SettingsNav,{activeTab:'shop',onSelect:value=>selected=value}));});
const mobileSelect=tree.root.findByProps({'aria-label':'설정 항목 선택'});
assert.equal(mobileSelect.type,'select');
assert.equal(tree.root.findAllByType('option').length,16,'all destinations remain available on small screens');
await act(async()=>mobileSelect.props.onChange({target:{value:'합배송'}}));
assert.deepEqual(selected,{tab:'combine'});
await act(async()=>tree.unmount());
const Tabs=load('components/admin-live/AdminLiveEventTabs.tsx').default;
await act(async()=>{tree=Renderer.create(React.createElement(Tabs,{active:'survival',onSelect:key=>selected=key}));});
assert.equal(tree.root.findAllByType('button').length,5);
for(const node of tree.root.findAllByType('button')){assert.equal(node.props.type,'button');await act(async()=>node.props.onClick());assert(selected);}
assert.equal(tree.root.findAllByProps({'aria-pressed':true}).length,1);
await act(async()=>tree.unmount());
// Coverage guard for the large owner panels. Browser checks validate the actual screens.
for(const [file,keys] of [['AdminLiveCustomersPanel.tsx',['members','issues','loyalty','link']],['AdminLiveNoticePanel.tsx',['customer','list','send','sent']],['AdminLiveProductManagePopup.tsx',['broadcast','shop','products','history']]]){
 const source=fs.readFileSync('components/admin-live/'+file,'utf8');
 for(const key of keys)assert(source.includes('"'+key+'"'),file+' lost '+key);
}
console.log('PASS preserved admin destinations, compact sidebar, native event buttons and owner-tab coverage');
