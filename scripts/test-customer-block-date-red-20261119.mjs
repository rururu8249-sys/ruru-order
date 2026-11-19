import assert from 'node:assert/strict';
import {buildBlockReason} from '../lib/customerBlockReason.ts';
// This MUST FAIL on the old main: incident date isn't persisted.
assert.match(buildBlockReason({type:'deal_break',dealDate:'2026-11-18',items:['테스트 가디건 ×1 49,000원']}),/거파 날짜: 2026-11-18/,'기존 코드에서 거파 발생일이 저장되지 않음');
