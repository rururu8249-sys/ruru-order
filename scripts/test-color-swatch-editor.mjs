import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
assert.ok(fs.existsSync('components/admin-live/quick-product/ColorSwatchEditor.tsx'),'admin needs editable saved color swatches');
// The test loader transpiles dynamic import to require; retain the real ESM dataset at that boundary.
const Editor=createUiLoader({'color-name-list':await import('color-name-list')})('components/admin-live/quick-product/ColorSwatchEditor.tsx').default;
let value={'블랙':'#123456','화이트':null};
let tree;
function Harness(){const [v,setV]=React.useState(value);return React.createElement(Editor,{labels:['블랙','화이트','모카','미지색'],value:v,onChange:n=>{value=n;setV(n);}});}
await act(async()=>{tree=Renderer.create(React.createElement(Harness));});
const byLabel=label=>tree.root.find(n=>n.props['aria-label']===label);
await act(async()=>{await byLabel('색상 이름으로 표시색 채우기').props.onClick();});
assert.equal(value['블랙'],'#123456','manual correction must not be replaced');
assert.equal(value['화이트'],null,'explicit no-swatch must not be restored');
assert.equal(value['모카'],'#9D7651');
assert.equal(Object.hasOwn(value,'미지색'),false,'unknown name must not get an invented color');
await act(async()=>byLabel('모카 표시색').props.onChange({target:{value:'#ff0000'}}));
assert.equal(value['모카'],'#FF0000');
await act(async()=>byLabel('모카 색상표시 안 함').props.onClick());
assert.equal(value['모카'],null);
await act(async()=>tree.unmount());
console.log('PASS actual editor name fill, manual precedence, suppression, unknown handling');
