import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {createUiLoader} from './admin-ui-test-loader.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = new EventTarget();
const path = 'components/customer/CustomerPressButton.tsx';
assert.ok(fs.existsSync(path), 'customer buttons need cancellable press feedback');
const Button = createUiLoader()(path).default;
let calls = 0, tree;
const props = {onClick: () => calls++, children: '담기'};
await act(async () => { tree = Renderer.create(React.createElement(Button, props)); });
const button = () => tree.root.findByType('button');
const pressed = () => button().props['data-pressing'];
const event = {button: 0, isPrimary: true, defaultPrevented: false};
for (const type of ['mouse', 'touch', 'pen']) {
  await act(async () => button().props.onPointerDown({...event, pointerType: type}));
  assert.equal(pressed(), true, `${type} press must have immediate feedback`);
  assert.equal(calls, 0, 'pressing must not add a product before a click');
  await act(async () => button().props.onPointerCancel(event));
  assert.equal(pressed(), false, 'scroll/cancel must clear feedback');
}
for (const end of ['onPointerUp', 'onPointerLeave', 'onBlur']) {
  await act(async () => button().props.onPointerDown(event));
  await act(async () => button().props[end](event));
  assert.equal(pressed(), false, `${end} must clear feedback`);
}
await act(async () => button().props.onPointerDown({...event, button: 2}));
assert.equal(pressed(), false, 'right click is not activation');
for (const key of [' ', 'Enter']) {
  await act(async () => button().props.onKeyDown({key, defaultPrevented: false}));
  assert.equal(pressed(), true);
  await act(async () => button().props.onKeyUp({key}));
  assert.equal(pressed(), false);
}
assert.equal(calls, 0, 'keyboard feedback must not synthesize extra clicks');
await act(async () => button().props.onKeyDown({key: ' ', defaultPrevented: false}));
await act(async () => window.dispatchEvent(new Event('blur')));
assert.equal(pressed(), false, 'switching apps while holding a key must clear feedback');
await act(async () => button().props.onPointerDown(event));
await act(async () => tree.update(React.createElement(Button, {...props, disabled: true})));
await act(async () => tree.update(React.createElement(Button, props)));
assert.equal(pressed(), false, 're-enabling a button must not revive an old press');
await act(async () => button().props.onClick({}));
assert.equal(calls, 1, 'normal click must reach existing action exactly once');
await act(async () => tree.update(React.createElement(Button, {...props, disabled: true})));
await act(async () => button().props.onPointerDown(event));
assert.equal(pressed(), false, 'sold out button must not show activation');
await act(async () => tree.update(React.createElement(Button, {...props, 'aria-disabled': true})));
await act(async () => button().props.onPointerDown(event));
assert.equal(pressed(), false, 'incomplete selection must not look ready');
await act(async () => button().props.onClick({}));
assert.equal(calls, 2, 'aria-disabled validation click remains available to show missing options');
await act(async () => tree.unmount());
console.log('PASS mouse/touch/pen/keyboard feedback, cancel cleanup, unchanged click action');
