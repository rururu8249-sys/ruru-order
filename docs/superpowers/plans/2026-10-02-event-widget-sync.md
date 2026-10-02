# Event Widget Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 이벤트 작업 화면과 OBS 위젯에서 같은 판의 같은 연출을 보여 주고 시작/재시작 버튼을 항상 사용할 수 있게 한다.

**Architecture:** 공개 위젯 응답에 공통 시간표를 추가하고 각 화면은 서버 기준 경과 시간의 장면을 계산한다. 기존 위젯 주소와 디자인 자산을 유지하며 관리자에는 동일 위젯을 읽기 전용·무음으로 표시한다. 당첨 결정과 포인트 처리의 책임은 표시 컴포넌트와 분리하여 보존한다.

**Tech Stack:** Next.js 16.2.6, React, TypeScript, 기존 Supabase, Node assert 및 react-test-renderer 테스트, CUA 브라우저 검수. 신규 패키지 없음.

**Spec:** `docs/superpowers/specs/2026-10-02-event-widget-sync-design.md` (승인: 2026-10-02 ‘이어가’).

## Global Constraints

- 기존 서바이벌·달리기·룰렛·인형뽑기·미션을 대상으로 합니다.
- 당첨자 결정, 당첨 확률, 참가자 기준, 포인트 금액 및 지급 정책은 바꾸지 않습니다.
- 운영 데이터에서 실제 추첨/포인트 지급을 실행하여 검수하지 않습니다.
- 관리자 미리보기는 기본 무음입니다. OBS의 기존 음향 설정은 유지합니다.
- 기존 OBS 주소는 유지합니다. 관리자 미리보기는 현재 사이트 origin을 사용합니다.
- 정상 연결 검수 목표는 두 화면의 시간차 500ms 이하이며, 실제 결과를 측정해 기록합니다.
- OBS 읽기 전용 화면/관리자 미리보기는 추첨·지급 API를 호출할 수 없습니다.
- 고객 주문 페이지에 새 이벤트 공개, 개인정보 추가 노출, 새로운 DB 컬럼, 인증/금전 API 변경은 이번 계획에 포함하지 않습니다.
- product code 작성 전에 저장소 AGENTS.md에 따라 설치된 Next.js 관련 문서를 읽습니다. 작업은 기존 linked worktree에서 순차 진행하고 scratch/를 보존합니다.

## Review Focus

1. 지급 실패 뒤 재접속·두 관리자 동시 실행: 기존 지급 키가 바뀌거나 누락돼 중복 지급되면 안 됨 — Task 1.
2. 잘못된 시각·빈 참가자·이전 응답 도착: 가짜 장면/당첨을 만들지 않고 현재 판만 표시 — Tasks 2, 3.
3. 기기 시간 변경·백그라운드/절전 후 복귀: 프레임 누적이 아닌 현재 서버 시각으로 복구 — Tasks 3, 4.
4. 같은 닉네임 표시·200명·다수 당첨자: 서버 순서와 명단을 유지하고 임의 탈락/재당첨 없음 — Task 4.
5. 긴 닉네임·좁은 창·위젯 실패: 시작/테스트 버튼이 가려지지 않고 과거 결과를 새 결과처럼 보이지 않음 — Tasks 5, 6.

## File Structure / Interfaces

- `lib/eventPlayback.ts`: 공개 표시 전용 계약, 불변 판 키, 시드와 서버 시간 보정. DB·추첨 함수에 의존하지 않음.
- `lib/eventSurvivalScene.ts`, `lib/eventRaceScene.ts`: 기존 SVG 표현이 소비할 결정론적 장면 샘플러. 렌더링/네트워크/금전 처리 없음.
- `lib/eventClawScene.ts`: 기존 인형뽑기 위치 함수 및 길이 계산을 추출. 자산 목록 유지.
- `components/event-shared/useEventPlayback.ts`: 읽기 전용 조회, 취소/최신 응답 판별, 화면 복귀, RAF와 동기화 상태.
- 기존 네 종류 overlay API: 기존 payload에 `server_now`, `playback`만 추가; 기존 필드 유지.
- 기존 위젯 페이지/컴포넌트: 장면 및 시간 샘플러 사용. OBS 경로 유지.
- `components/admin-live/AdminEventWidgetPreview.tsx`: 이벤트 종류→현재 origin 위젯 URL, 무음 iframe, 복구/준비 상태.
- 기존 `AdminLiveEventRoulettePanel.tsx`: 자체 표시 대신 위젯 프리뷰 배치. 기존 지급 흐름은 Task 1의 계약으로 유지.

공통 공개 타입:
```ts
type EventKind = 'survival' | 'race' | 'roulette' | 'claw';
type Playback = { version: 1; key: string; kind: EventKind; seed: number;
  startedAtMs: number; durationMs: number };
type PlaybackPhase = { phase: 'waiting' | 'running' | 'done'; elapsedMs: number };
// id/status/spin_started_at/spin_duration_ms + nickname-only participants/winners
type PlaybackInput = { id: string; kind: EventKind; status: string;
  startedAt: string | null; durationMs: number | null;
  participants: string[]; winners: string[] };
```

### Task 1: 지급·표시 분리 전 안전 계약

**Files:** Modify `components/admin-live/AdminLiveEventRoulettePanel.tsx`; Create `scripts/test-event-reward-display-boundary.mjs`; Read `app/api/admin-live/customer-points/route.ts`, `supabase/sql/hotfix/point_ledger_source_key_20260830.sql`.

**Interfaces:** 기존 `grantPointToWinner(nickname,amount,reason,eventId,orderIds)` 및 `grantPointToSurvivors(winners,amount,reason)` 호출/키 유지. 위젯에서 지급 callback을 받는 새 인터페이스를 만들지 않음.

- [ ] Step 1 — 실제 관리자 컴포넌트와 로컬 네트워크 fixture로 실패 테스트 작성. 단일 당첨의 `event_winner:<winnerId>` 키, 테스트 모드 지급 0회, 선물 custom 지급 0회, 다수 당첨의 기존 winner별 키, 메타데이터 갱신 후 지급 0회 증가를 단언. 미리보기 iframe의 load/remount는 지급 횟수에 영향 없음.
- [ ] Step 2 — 신규 테스트 실행. 표시/지급 책임이 결합돼 실패하는 지점을 기록하고, 이미 통과하는 기존 행동은 보호 테스트로 유지.
- [ ] Step 3 — 기존 결과 effect에서 canvas 그리기/각도 변경만 분리. 기존 지급 완료 스케줄(단일 이벤트의 4~6초 지연)과 조건/캡처/잠금/재시도/다수 당첨 흐름 유지. 위젯 표시 완료 메시지로 지급하지 않음. 단일 지급 effect가 서바이벌/달리기 지급을 중복 호출하는지 fixture로 검사하고 실제 결함이면 표시 교체 전 차단.
- [ ] Step 4 — `node --import ./scripts/_ts-resolve.mjs scripts/test-event-reward-display-boundary.mjs` 및 기존 `test-point-source-key.mjs`, `test-admin-event-result-layout.mjs` 통과 확인. 운영 DB unique index 존재는 접근 가능한 읽기 전용 카탈로그 확인으로 검증; 확인 불가능하면 ‘확인 안 됨’ 기록하고 전체 금전 안전 보장 금지. 금전 API 변경이 필요하면 이 계획을 확장하지 않고 별도 결함으로 보고.
- [ ] Step 5 — 이 작업 파일만 `git add` 및 `git commit -m 'refactor(event): separate display from existing reward completion'`.

### Task 2: 공통 시간표·공개 계약

**Files:** Create `lib/eventPlayback.ts`, `lib/eventClawScene.ts`, `scripts/test-event-playback.mjs`, `scripts/test-event-overlay-contract.mjs`; Modify 네 종류 `app/api/event-*/overlay/route.ts`, `app/api/admin-live/event-roulette/route.ts`, `components/event-claw/EventClawOverlayClient.tsx`.

**Interfaces:** `makePlayback(input: PlaybackInput): Playback | null`, `samplePlayback(playback: Playback, serverNowMs: number): PlaybackPhase`, `eventSeed(key: string): number`, `calculateEventDurationMs(kind, participants: string[], winners: string[], seed: number): number`; claw `sampleClawMotion(elapsedMs,seed,hasResult,nowMs)` 및 `clawDurationMs(seed)`는 기존 순수 계산을 추출.

- [ ] Step 1 — 실패 테스트: 같은 입력 key/seed 일치; 제목/안내/updated_at 변경에도 key 동일; 시작 시각 변경은 다른 key; 잘못된 날짜/ID/길이는 null; 시작 전 elapsed=0/waiting; 종료 후 elapsed=duration/done. 공개 응답은 전화/주문 ID/응모 가중치 포함 금지. 기존 토큰의 400/403/404와 no-store 보존.
- [ ] Step 2 — 두 신규 테스트 실행하여 아직 없는 계약 때문에 실패 확인.
- [ ] Step 3 — version=1 시간표 구현. key는 JSON.stringify([kind,id,startedAt,1]); seed는 결정론적 32비트 문자열 해시. 룰렛 길이는 기존 위젯 9,200ms, 인형뽑기는 기존 miss/catch 공식; 서바이벌/달리기는 Task 4 시간표 길이 사용. 서버의 기존 결과 저장에서 `spin_duration_ms`만 해당 종류의 실제 연출 길이로 정합화. 시작 시각·당첨 선택은 기존 서버값 유지. 기존 duration이 새 종류별 공식과 맞지 않는 이전 판은 playback=null로 반환하고 결과만 표시. 새 DB 필드 없이 응답에 version 제공.
- [ ] Step 4 — overlay SELECT에 불변 `id` 추가. 최신 판 선택은 `created_at DESC, id DESC`로 고정해 예전 판의 메모 수정으로 선택이 뒤집히지 않게 함. 기존 토큰 의미와 상태 필터 유지. 네 API 응답의 `server_now`는 응답 직전 Date.now(); 기존 필드 유지. fixture로 UPDATE/INSERT가 발생하지 않는지 단언. 신규 테스트 및 기존 이벤트 응모권 테스트 통과 확인.
- [ ] Step 5 — Task 2 파일만 커밋. DB 마이그레이션/패키지 추가 없음 확인.

### Task 3: 읽기 전용 동기화 생명주기

**Files:** Create `components/event-shared/useEventPlayback.ts`, `scripts/test-event-playback-client.mjs`; Modify `lib/eventPlayback.ts`.

**Interfaces:** `estimateServerAnchor(serverNowMs, sentMonoMs, receivedMonoMs): {serverMs:number; monoMs:number; uncertaintyMs:number}`; `readServerTime(anchor, monoMs): number`; `useEventPlayback({url:string}): {payload:unknown; phase:PlaybackPhase|null; sync:'loading'|'ready'|'checking'|'error'; serverNowMs:number; retry:()=>void}`.

- [ ] Step 1 — fake fetch/monotonic clock 테스트: 두 기기의 Date.now 10분 차이가 결과에 영향 없음; 200ms RTT 시간보정 uncertainty=100ms; 1,200ms RTT는 checking; 오래된 판 응답/해제된 요청 무시; 숨김/복귀 시 즉시 조회; 미리보기 모든 요청 GET; 404는 빈 대기, 실패는 error; unmount 후 상태 갱신/RAF/조회 없음.
- [ ] Step 2 — 신규 테스트 실패 확인.
- [ ] Step 3 — 응답 시각을 RTT 절반으로 보정한 anchor와 performance.now()로 서버 시간 계산. 시작 전 판 발견 지연을 줄이도록 표시 중 250ms, 빈/완료 2,500ms 조회. 요청 중복 금지, AbortController cleanup, 요청 sequence 검사; 탭 복귀 시 anchor 새로 받기 전 checking 표시. uncertainty>500ms 또는 마지막 성공 조회가 5초 이상 오래됐으면 ‘동기화 확인 중’. 서버 시각을 새 판 시작 시각으로 추정하지 않음.
- [ ] Step 4 — 테스트 통과 및 음소거/SDK 생명주기 회귀 테스트 통과.
- [ ] Step 5 — Task 3 파일만 커밋.

### Task 4: 같은 시간에 같은 장면을 그리는 위젯

**Files:** Create `lib/eventSurvivalScene.ts`, `lib/eventRaceScene.ts`, `scripts/test-event-scenes.mjs`, `scripts/test-event-widget-readonly.mjs`; Modify 기존 survival/race/mission live pages, roulette/claw overlay clients, `lib/mission.ts`, `app/api/event-mission/overlay/route.ts`, `lib/eventPlayback.ts`.

**Interfaces:** `buildSurvivalScene(input:PlaybackInput,seed:number): SurvivalScene`, `sampleSurvivalScene(scene,elapsedMs): SurvivalFrame`; `buildRaceScene(input,seed): RaceScene`, `sampleRaceScene(scene,elapsedMs): RaceFrame`. Frame은 기존 SVG가 요구하는 인물 위치/상태/효과/당첨순서를 담는 readonly DTO. 상세 DTO는 각 기존 렌더러 필드를 그대로 이름 유지하여 추출.

- [ ] Step 1 — 같은 seed/t=3,000의 장면 deepEqual; 30/60/120fps 누적 호출 후 같은 t 장면 일치; 200명/1명/다수 당첨 및 빈 명단; 서버 winners 외 인물은 우승 불가; 같은 닉네임이 있어도 참가자 index로 표시 정체성 유지; 늦은 접속 t=duration은 done. 위젯에서 POST/지급/추첨 호출 없음. 제목 수정 뒤 처음부터 재생 없음.
- [ ] Step 2 — 신규 테스트 실패 확인.
- [ ] Step 3 — 서바이벌은 기존 탈락 수·재난·간격 공식과 SVG 자산을 유지해 seeded 일정표를 사전 계산; 당첨자는 탈락 후보에서 제외. 달리기는 기존 속도/충돌 로직을 50ms 고정 simulation step으로 계산해 checkpoint를 만들고 arbitrary elapsed는 해당 step+보간으로 샘플링. 프레임 횟수로 난수 소모하지 않음. 기존 카운트다운/최종 유지 시간 포함 전체 duration 반환. 종류별 길이 공식은 Task 2 helper와 하나의 출처로 합치고 UI별 상수 중복 금지.
- [ ] Step 4 — roulette WAAPI를 서버 elapsed에 seek; claw 기존 위치 함수를 서버 elapsed로 샘플. 최초 조회 결과 무조건 건너뛰기 제거: 진행 중이면 seek, 완료면 정적 결과. sound=0이면 AudioContext/효과음 호출 0회; OBS 기본 음향 보존. 현재 시간을 건너뛰어 과거 효과음을 한꺼번에 재생하지 않음.
- [ ] Step 5 — 미션 API는 기존 실제 mission_started_at을 공개 상태 시작 시각으로 반환하고 서버 시각 보정으로 4초 문구 교대 동기화. 현재 데이터에는 목표 달성 시각이 없어 추정하지 않음: 새로 연결할 때마다 8초 축하를 반복하는 대신 두 화면 모두 같은 **정적 달성 화면**을 표시. 목표/집계/보상/ON-OFF 의미는 보존; 공개 API는 여전히 읽기 전용.
- [ ] Step 6 — 신규 및 기존 전체 이벤트 테스트 통과; Math.random은 실제 연출 경로에서 없어야 함(독립 데모/오디오 노이즈 합성은 별도 구분). 기존 자산과 참여 명단이 유지되는 장면 snapshot 검토. Task 4 파일만 커밋.

### Task 5: 관리자에 같은 위젯 표시

**Files:** Create `components/admin-live/AdminEventWidgetPreview.tsx`, `scripts/test-admin-event-widget-preview.mjs`; Modify `AdminLiveEventRoulettePanel.tsx`, `scripts/test-admin-event-result-layout.mjs`.

**Interfaces:** `AdminEventWidgetPreview({kind: EventKind|'mission', eventId?:string}): ReactNode`; 경로 map은 survival/race/mission `/event-<kind>/live`, roulette `/event-roulette/live`, claw `/event-claw/overlay`. 기존 종류별 token 유지, 관리자 query `sound=0`; viewport 크기만 조절하고 연출 기준 좌표계 유지.

- [ ] Step 1 — 모든 종류에 현재 origin URL, sound=0, readonly iframe 단언; 프리뷰 reconnect는 iframe key만 변경, 운영 API 요청 0회; 긴 결과가 버튼의 absolute/fixed 조상에 포함되지 않음; 시작/테스트 버튼은 iframe 바깥에 있음.
- [ ] Step 2 — 신규 테스트 실패 확인.
- [ ] Step 3 — 기존 좌측 placeholder/canvas를 공통 프리뷰로 교체하고 중복된 아래 프리뷰 제거. 시작/테스트 버튼은 상시 접근 가능한 독립 행, 결과 요약은 그 아래. Task 1의 지급 완료 effect와 기존 source 키/조건 유지. 프리뷰 포인터/로드 완료가 지급을 트리거하지 않음.
- [ ] Step 4 — 신규 테스트, Task 1 지급 경계, 기존 이벤트 결과 레이아웃 테스트 통과. Task 5 파일만 커밋.

### Task 6: 끝까지 검수 후 배포

**Files:** Create local fixture helper `scripts/event-widget-sync-fixtures.mjs`; Update user deliverable `outputs/event-widget-sync-verification.md` in projectless task workspace. 임시 브라우저 검수 route는 배포 전 삭제.

- [ ] Step 1 — 로컬 fixture 데이터로 관리자와 OBS 경로를 두 별도 화면에서 실행. 개발 서버가 production DB/운영 추첨/금전 API에 접근하지 않도록 경계를 대체; 실제 네트워크에 그런 요청이 있으면 검수 중단.
- [ ] Step 2 — 다섯 종류의 시작/결과, 재접속, 늦은 연결, 장면 frame/rank/key 비교. 정상 네트워크에서 공통 server time 기준 차이 ≤500ms 측정; 지연 1,200ms fixture는 checking 표시와 회복 확인. 360px/1280px 레이아웃, 긴 닉네임 및 200명 검수. 스크린샷 저장.
- [ ] Step 3 — 모든 `scripts/test-*.mjs` 실행, `npm run guard`, `npx tsc --noEmit`, `npm run build` 성공 확인. 임시 route 및 검수용 외부 boundary 대체가 실제 앱에 남지 않았는지 diff 확인.
- [ ] Step 4 — requesting-code-review skill로 독립 코드 검토. 금전 처리 변경 없음, 공통 시간표, 공개 개인정보, 오래된 응답, 리소스 cleanup 집중. 중요 결함이 있으면 수정 후 해당 테스트와 전체 검사 재실행.
- [ ] Step 5 — 실행 기록 및 되돌리기 대상 커밋 정리. 기존 Git Vercel 배포 사용. 운영에서는 화면/읽기 전용 위젯만 확인하고 추첨/지급 금지. 배포 성공 상태와 운영 오류 확인 후 완료 보고; 외부 YouTube 오류는 별도 남은 제한으로 기록.

## Self-Review / Handoff

- 설계 요구사항 매핑: 화면/버튼 Task 5, 공통 시간표/이전 판 Task 2, 장애/복귀 Task 3, 다섯 종류 Task 4, 금전 경계 Task 1, 검수/배포 Task 6.
- 미션 달성 시각은 저장돼 있지 않으므로 추정하지 않고 정적 달성 표시로 정리했습니다. 신규 DB/지급 API 구조 변경은 제외했습니다.
- 계획 자체는 구현 완료를 뜻하지 않습니다. 권장 실행 방법은 **이 대화에서 제가 순서대로 직접 구현하고 마지막에 독립 검토**입니다. 밀접한 시간표/위젯 인터페이스를 한 작업자가 통일하고, 운영 포인트 회귀는 별도 검토합니다.
- 계획 검토·승인 후 `superpowers:executing-plans`로 Task 1부터 실행합니다.

## 확인한 공식 자료

- [Performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now): 단조 시계와 시스템 시계 차이, 절전 후 재보정 필요.
- [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame): 프레임률/백그라운드 정지에 의존하지 않는 시간 샘플링.
- [Supabase 변경 내역](https://supabase.com/changelog): 확인 시점 2026-10-02. 이번 계획은 기존 SELECT 및 기존 필드만 사용하며 신규 제품/SDK 이전을 포함하지 않음.
