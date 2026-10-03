import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUiLoader} from './admin-ui-test-loader.mjs';

const {EventClockStyles}=createUiLoader()('components/event-shared/EventClockStyles.tsx');

const visible=renderToStaticMarkup(EventClockStyles({elapsedMs:0,sync:'checking'}));
assert(visible.includes('동기화 확인 중'),'status remains available for administrator previews');

const broadcast=renderToStaticMarkup(EventClockStyles({elapsedMs:0,sync:'checking',showStatus:false}));
assert(!broadcast.includes('동기화 확인 중'),'broadcast overlays must not leak a clipped synchronization label');

console.log('PASS event clock status can be hidden from broadcast overlays');
