import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';

// Removing the entry's mount boundary must fail: URL/storage-dependent first
// renders cannot replace the server's initial HTML during hydration.
// Render the actual page and dashboard, without network or component doubles.
// renderToString does not run effects, so no API/financial actions are executed.
const Page=createUiLoader()('app/admin-live/page.tsx').default;
const previousWindow=globalThis.window;
try {
  delete globalThis.window;
  const serverHtml=renderToString(React.createElement(Page));
  for(const [panel,rail] of [['settings','0'],['payments','0'],['orders','1'],['broadcast','1']]) {
    globalThis.window={
      location:{search:'?panel='+panel},
      localStorage:{getItem:key=>key==='ruru_admin_rail_open'?rail:null},
      sessionStorage:{getItem:()=>null},
    };
    const firstClientHtml=renderToString(React.createElement(Page));
    assert(firstClientHtml===serverHtml,'initial HTML differs for panel='+panel+', rail='+rail);
  }
  assert(serverHtml.includes('role="status"'),'initial entry announces loading until browser state is available');
} finally {
  if(previousWindow===undefined)delete globalThis.window;
  else globalThis.window=previousWindow;
}
console.log('PASS real admin page first-render parity for URL panels and persisted rail state; no effects/writes');
