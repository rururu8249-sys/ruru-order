import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window={addEventListener(){},removeEventListener(){}};
const tasks=[
 {id:1,title:'고객이슈',status:'open'},
 {id:2,title:'고객이슈',status:'deleted'},
 {id:3,title:'고객이슈',status:'open',completed_at:'2026-10-10'},
 {id:4,title:'고객이슈',status:'resolved'},
 {id:5,title:'다른 관리작업',status:'open'},
 {id:6,title:'메모',task_type:'customer_issue',status:'open'},
];
globalThis.fetch=async()=>({json:async()=>({ok:true,tasks})});
const Panel=createUiLoader()('components/admin-live/LiveIssueRailPanel.tsx').default;
let count=-1,tree;
await act(async()=>{tree=Renderer.create(React.createElement(Panel,{variant:'banner',onCountChange:n=>count=n}));});
try {assert.equal(count,2,'issue badge excludes deleted, completed and unrelated admin tasks like the actual list');}
finally {await act(async()=>tree.unmount());}
console.log('PASS customer issue banner count matches live issue filtering');
