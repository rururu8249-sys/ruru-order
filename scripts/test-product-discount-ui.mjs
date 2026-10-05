import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { createUiLoader } from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const load = createUiLoader();
const Label = load('components/order/ProductDiscountLabel.tsx').default;
const Editor = load('components/admin-live/quick-product/DiscountDisplayEditor.tsx').default;
let view;
await act(async () => { view = Renderer.create(React.createElement(Label, {note:{}, actualPrice:129000})); });
assert.equal(view.toJSON(), null);
await act(async () => { view.update(React.createElement(Label, {note:{discount_display:{enabled:true,original_price:219000}},actualPrice:129000})); });
assert.deepEqual(view.root.findByType('del').children, ['219,000', '원']);
assert.equal(JSON.stringify(view.toJSON()).includes('41'), true);
function Form() {
  const [value, setValue] = React.useState({enabled:false,original_price:0});
  return React.createElement(Editor, {value,onChange:setValue,actualPrice:129000});
}
await act(async () => { view.update(React.createElement(Form)); });
assert.equal(view.root.findByProps({type:'checkbox'}).props.checked, false);
await act(async () => { view.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}); });
assert.equal(view.root.findByProps({type:'checkbox'}).props.checked, true);
await act(async () => { view.root.findByProps({'aria-label':'원래 판매가'}).props.onChange({target:{value:'219,000'}}); });
assert.equal(view.root.findByProps({'aria-label':'원래 판매가'}).props.value, 219000);
assert.equal(JSON.stringify(view.toJSON()).includes('큰 금액'), false);
await act(async () => { view.root.findByProps({type:'checkbox'}).props.onChange({target:{checked:false}}); });
assert.equal(view.root.findAllByProps({'aria-label':'원래 판매가'}).length, 0);
await act(async () => { view.unmount(); });
console.log('product discount UI: PASS');
