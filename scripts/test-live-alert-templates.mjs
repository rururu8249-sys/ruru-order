// [2026-11-02] 방송 알림 템플릿 고르기 — 순수 규칙
import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
const load = createUiLoader({});
const T = load('lib/liveAlertTemplates.ts');
const ENV = 'KA01TP_OLD_ENV_123';
const cfg = T.parseLiveAlertTemplates(JSON.stringify({ list: [{ id: 'KA01TP_NEW_222', name: '방송시작 알림2' }, { id: 'bad id!', name: 'x' }, { id: 'KA01TP_NEW_222', name: '중복' }], defaultId: 'KA01TP_NEW_222' }));
assert.deepEqual(cfg.list, [{ id: 'KA01TP_NEW_222', name: '방송시작 알림2' }], '망가진 줄·중복 버림');
const all = T.allLiveAlertTemplates(cfg, ENV);
assert.deepEqual(all.map((t) => t.name), ['방송시작 알림 (기존)', '방송시작 알림2'], '기존(Vercel) 맨 앞');
assert.equal(T.defaultLiveAlertTemplateId(cfg, ENV), 'KA01TP_NEW_222', '저장한 기본값');
assert.equal(T.resolveLiveAlertTemplateId(cfg, ENV, ''), 'KA01TP_NEW_222', '안 고르면 기본값');
assert.equal(T.resolveLiveAlertTemplateId(cfg, ENV, ENV), ENV, '기존 템플릿 고를 수 있음');
assert.equal(T.resolveLiveAlertTemplateId(cfg, ENV, 'KA01TP_ATTACK'), null, '목록에 없는 ID 는 안 보냄');
const empty = T.parseLiveAlertTemplates(null);
assert.equal(T.resolveLiveAlertTemplateId(empty, ENV, ''), ENV, '설정 없으면 예전처럼 Vercel 템플릿');
assert.equal(T.resolveLiveAlertTemplateId(empty, '', ''), null, '아무것도 없으면 안 보냄');
assert.equal(T.defaultLiveAlertTemplateId(T.parseLiveAlertTemplates({ list: [], defaultId: 'KA01TP_GONE_1' }), ENV), ENV, '지운 기본값이면 기존으로');
console.log('test-live-alert-templates: ok');
