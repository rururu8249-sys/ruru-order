import assert from 'node:assert/strict';
import {regionFromVercelHeaders} from '../lib/visitRegion.ts';
assert.equal(regionFromVercelHeaders(new Headers({'x-vercel-ip-country':'KR','x-vercel-ip-city':'Seoul'})),'서울');
assert.equal(regionFromVercelHeaders(new Headers({'x-vercel-ip-country':'KR','x-vercel-ip-city':'%EC%84%9C%EC%9A%B8'})),'서울');
assert.equal(regionFromVercelHeaders(new Headers({'x-vercel-ip-country':'KR','x-vercel-ip-country-region':'41'})),'경기');
assert.equal(regionFromVercelHeaders(new Headers({'x-vercel-ip-country':'US','x-vercel-ip-city':'San Francisco'})),'미국 · San Francisco');
assert.equal(regionFromVercelHeaders(new Headers()),'','unknown region must not be invented');
assert.equal(regionFromVercelHeaders(null),'');
console.log('PASS Vercel region: decoded/translated, absent headers remain unknown, no third-party IP lookup');
