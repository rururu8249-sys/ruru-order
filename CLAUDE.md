@AGENTS.md

# CLAUDE.md — 루루동이 프로젝트 지침

## ★ 세션 시작 시 필수
이 파일을 먼저 읽고 "## 진행상황"과 "## 남은 작업"을 확인할 것.
세션6까지 완료된 줄 알지 말고, 아래 진행상황의 최신 날짜·항목을 기준으로 이어갈 것.

## ★ 작업 완료 시 필수 (과거에 갇히지 않게)
git push로 작업을 배포할 때마다, 반드시 이 파일의 "## 진행상황" 맨 위에
한 줄을 추가하고(날짜+완료내용), 끝난 항목은 "## 남은 작업"에서 제거할 것.
이 갱신을 빼먹으면 다음 세션이 과거 상태로 시작되므로 절대 빠뜨리지 말 것.

## ★ 작업 중 끼어든 요청 처리 (삼천포 방지)
작업 도중 사장님이 다른 질문·요청을 하면:
1. 먼저 "지금 진행 중이던 작업"을 기억에 붙들 것 (절대 잊지 말 것).
2. 끼어든 요청이 급하면(버그·운영지장·즉답필요) → 그것부터 해결하고, 끝나면 "원래 OO 작업으로 돌아갑니다" 하고 복귀.
3. 끼어든 요청이 안 급하면(나중에 해도 됨) → "## 남은 작업"에 한 줄 추가만 하고, 현재 작업 계속 진행.
4. 단순 질문(코드수정 아님)이면 → 답만 하고 바로 원래 작업으로 복귀.
5. 매 응답 끝에 진행 중 작업이 있으면 "현재 작업: OO" 한 줄로 상기시킬 것.

## ★ 현재 진행 중 작업 (있으면 여기 기록, 끝나면 지움)
(없음)

## 진행상황 (최신이 맨 위 · push할 때마다 갱신)
- 2026-06-06 세션13(상품 시안 P1·P3): 상품관리 팝업(AdminLiveProductManagePopup) 시안② 인라인 1:1 교체(.ruru-product-sian 스코프 globals.css, 560px 고정) + 순환/고정 모드 토글(순환=broadcast_products insert 기존, 고정=products.is_pinned update 기존고정해제후 선택고정). 지금띄운상품 패널(LiveBroadcastPanels): 고정상품 있으면 1개, 없고 순환 있으면 broadcast_products 목록 나열, 둘다없으면 안내(activeBroadcastId prop 추가, 상품변경 이벤트 갱신). 돈/배송 로직 무변경. ※P2 잔여=QuickProductFastForm(③ 새상품등록, 1244줄) 시안 인라인 이식 — 저장로직 보존 위해 별도 정밀 패스 필요
- 2026-06-06 세션12-2(중복당첨 토글 연동): event-roulette API의 중복당첨 방지(applyNoDuplicateWinnerRule, 666 "이미 모든 참여자 당첨" 에러)를 excludeDailyDup으로 게이트 — false면 중복체크 건너뜀(handleParticipants searchParams + createEvent body 둘 다, 기본 true). 패널이 "당일 중복당첨 금지" 토글값을 create_event 3곳 + 참가자GET에 전송. 돈/포인트/추첨 로직 무변경
- 2026-06-06 세션12(이벤트 4건): 당첨자 카드=overlay result-card 디자인 정밀화 / 룰렛 회전 30바퀴 / 인형뽑기 탭=canvas 숨기고 🕹️인형UI 표시(버그수정) / 당첨 확정 시 giftType=point+금액 있으면 **포인트 자동지급**(운영모드만, orders 최신주문 customer_phone로 닉네임→전화 매핑, 기존 /api/admin-live/customer-points API 재사용, 테스트모드는 미지급). 모달 680px 고정 유지. 추첨 로직 보존
- 2026-06-06 세션11-3(이벤트 시안 인라인 그대로 이식): screens.event의 HTML/CSS를 Tailwind 변환 없이 인라인 style + 시안 클래스(.btn/.note/.nick/.tog/.row/.badge/.wheel 등)로 이식. globals.css에 시안 :root 변수(--rose/--rose-bg/--rose-bd/--green/--blue 등) + 클래스를 `.ruru-event-sian` 스코프로 추가(전역충돌 방지). 룰렛은 canvas 실제스핀 유지(화살표 휠 안으로 삽입). 추첨/포인트/API/상태 로직 보존, 핸들러만 연결. + UI작업 필수원칙/룰렛기준 섹션 CLAUDE.md 추가
- 2026-06-06 세션11-2(이벤트 시안⑨ 1:1 + 실제 canvas 룰렛): 패널 본문을 시안⑨ 단일컬럼으로 재구성(상단 룰렛+돌리기 | 참가자3버튼[👥주문서전체/💵입금완료/✎수동]+당일중복금지·가중치 토글 / 당첨고정 rose박스 칩 / 제목+당첨선물50:50 / 위젯주소 / 이벤트목록 기간필터+달력). 시안색상(rose-deep/rose-soft/rose-line/#f7f5f1). conic div → **실제 canvas 룰렛**(requestAnimationFrame, 당첨확정 시 8~14바퀴·4~6초·easeOutCubic로 당첨칸 정지, 화살표 상단삽입, 가운데 당첨자 오버레이). 추첨/포인트/API/상태 로직 100% 보존. ※가중치·당일중복 토글·입금완료필터는 여전히 서버연동 P2/P3
- 2026-06-06 세션11(이벤트 패널 UI 시안 완전교체): AdminLiveEventRoulettePanel 렌더 JSX 전체를 시안 2단 레이아웃으로 교체(헤더 ◆이벤트+룰렛/인형뽑기탭+모드+초기화+✕ / 좌: conic-gradient 룰렛휠+화살표+가운데 당첨자오버레이+돌리기+위젯주소복사+이벤트목록[기간필터 오늘·주·월·날짜+달력, dateTimeFull 년월일(요일)시간] / 우: 참가자3버튼[활성방송기준·OFF비활성]+목록토글+채팅@파싱 / 당첨고정칩 / 당일중복금지·가중치(누적금액40%+당일60%) 토글 / 당첨선물 50:50). 룰렛=conic-gradient div(canvas 대신, 동일 모양·안정적). 기존 추첨/포인트/API/상태 로직 100% 보존, 렌더만 교체. 미사용 함수 일부 잔존(로직 보존 원칙). ※가중치·당일중복 토글은 UI 상태만(서버 추첨공식 연동은 P3), 입금완료 서버필터는 P2
- 2026-06-06 세션10(이벤트 P1-B): 참가자 3버튼(주문서전체/입금완료/수동) · 불러오기 기준=현재 활성방송(activeBroadcastId prop, Dashboard 전달) · 방송OFF시 전체/입금완료 버튼 비활성+안내 · 목록 토글(기본숨김) · 채팅붙여넣기 @파싱(중복제거) · 당첨고정 칩클릭(select 이중목록 제거)+"👑 당첨고정:닉" 한줄 · 당첨선물 드롭다운(포인트/직접)50:50+포인트 쉼표포맷 · 돌리기 시 currentEvent=null로 이전당첨자 제거. 추첨/포인트/돈 로직 무변경. ※입금완료 서버필터(paidOnly)는 P2 연동 대기
- 2026-06-06 세션10(이벤트 P1-A): 사이드바 "◆ 이벤트" 메뉴 추가(adminLiveMenu event 키) + AdminLiveEventRoulettePanel을 Dashboard에 항상마운트(controlled props renderTrigger/controlledOpen/onRequestClose, activeMenu=event일때 표시, 닫아도 상태유지) + 초기화 버튼(참가자+당첨고정+currentEvent 리셋). 추첨/포인트/주문 로직 무변경. ※기존 LiveHeader/LiveOrderTable의 "🎁 이벤트" 버튼 인스턴스는 잔존(별도 state) — 후속 정리 검토. ※P1 잔여=참가자3버튼/채팅@파싱/당첨고정칩/당첨선물 드롭다운(P1-B)
- 2026-06-06 세션9-2: 카드결제 복사창 좌우분할 개선 — 💳카드결제 버튼 클릭 시 복사창+페이스터 동시열림(openPaysterRightHalf를 LiveOrderTable 클릭 제스처에서 호출→팝업차단 회피), 페이스터=화면 오른쪽절반(left=½/width=½/height=전체), 복사창 모달=화면 왼쪽절반 고정(fixed inset-y-0 left-0 md:w-1/2)
- 2026-06-06 세션9: 카드결제 복사창 신규(AdminLiveCardPayPopup, 시안⑫). LiveOrderTable card_unpaid 입금셀에 "💳 카드결제" 버튼→팝업. 복사4칸(상품명 외N건요약/결제금액 cardPaymentTotalAmount우선 없으면 totalAmount 숫자만/닉네임 매칭기준/전화 하이픈제거) 각 클립보드복사. 페이스터 window.open(PC≥1024 우측반분할, 복사창 유지). "카드결제완료 처리"=DetailDrawer handleCardPaymentStatusChange와 동일 update(orders admin_order_status_v2/order_manage_status="카드결제완료", order.items id 기준)→loadOrders, 신규 결제write 없음
- 2026-06-06 세션8-2: 팝업 제목 시안 통일(Dashboard 정산통계→정산·입금확인→입금내역, admin-v2 ManualPaymentMatchDrawer 수동입금매칭→입금매칭). 제목 텍스트만, 돈/입금/정산 로직 무변경. ※admin-v2는 사장님 명시 허용으로 제목만 변경(구버전 AdminV2Client도 같이 바뀜, 미사용)
- 2026-06-06 세션8: 상품관리 팝업 신규(AdminLiveProductManagePopup, 사이드바 "상품" 메뉴→fixed모달, 시안②기준 탭[방송상품/공구·상시판매/전체창고]+상품명검색+올림날짜(created_at)+2열카드 다중선택+페이지네이션, "+새상품등록"→기존 ruru-open-quick-product-panel 이벤트로 ③폼, "순환담기"→broadcast_products insert(중복제외, 활성방송필요)). 방송/돈 로직 무변경. 가정: 공구·상시탭=product_type group_buy(상시판매 별도타입 없음), 올림날짜=created_at. 기존 AdminLiveProductListPanel은 미사용으로 잔존
- 2026-06-06 세션7-3: 시안 라벨 통일(사이드바 메뉴명 방송→주문·입금/정산통계→정산/고객관리→고객·이슈/카톡상담→카톡채널, 메인 송장출력·물건챙기기·검색placeholder 시안문구, 팝업제목 주문상세→✎주문서수정/포인트관리→🪙포인트/CUSTOMER DETAIL→👤회원상세) + 방송모드 토글 추가(AdminLiveSidebar, LiveHeader title/url을 Dashboard로 끌어올려 공유, URL있을때만 ON가능, ON→startBroadcast OFF→endBroadcast, start/end 로직 무변경)
- 2026-06-06 세션7-2: 용어 표시라벨 2차 통일(AdminLiveDashboard/AdminLiveOrdersPanel/adminLiveOrderExcelExport에서 "입금매칭 필요"→"매칭필요", "카드 미결제"→"카드미결제", 표시만·영어 status코드 무변경, 엑셀 상태칸 텍스트도 반영). CustomersPanel/SettlementPanel은 정규식(분류 로직)이라 표시통일 대상 아님
- 2026-06-06 세션7: 용어 표준 확정(입금대기/입금확인/매칭필요/카드미결제/카드결제완료, 입금내역/입금매칭) · 표시 라벨 통일 1차(LiveOrderTable/LiveOrderDetailDrawer/LiveStatsCards에서 "입금매칭 필요"→"매칭필요", "카드 미결제"→"카드미결제", 영어 status 코드·분류 정규식은 무변경)
- 2026-06-06 세션6: 방송패널 3분할(영상+채팅+지금띄운상품 flex 1:3:1.2, 높이360, 영상9:16) / 지금띄운상품=고정1개(사진+상품명+금액+옵션+다른상품띄우기) / 등록상품리스트패널 제거 / 주문서 10칸(주문일·닉네임·이름·주문내용·수량·상품금액·택배비·총금액·입금·출고, 주문일=createdAt YYYY.MM.DD/(요일)HH:mm 두줄, 입금=배지+paidAt, 주문내용 font-black) / 헤더+셀 전부 가운데정렬(text-center) 통일
- 2026-06-05 세션4~5: 주문서 그리드 개선, 실시간 필터, 매출요약 6항목, 방송패널 3분할 진입
- 2026-06-05 세션3: 고객관리 모달 완성(회원목록/고객이슈), 메인화면 재설계 진입, 매출요약6항목 배포, DB 확인(배송처·출고 데이터 비어있음)
- 2026-06-04 세션1~2: 딥로즈 색상 전면적용(파랑제거), 주문테이블 카드형, 사이드바→팝업모달 구조 전환

## 남은 작업 (우선순위 순 · 끝나면 지우고 진행상황에 기록)
[admin-live 관리자]
1. 화면 전체 용어·버튼·라벨·문구 시안 기준 전수 통일 (입금상태뿐 아니라 전 화면 일괄, 일부만 고치지 말 것) — 입금상태·메뉴·주요 팝업제목(정산·입금내역·입금매칭 포함) 통일 완료. 잔여 세부 라벨은 화면별 점검 시 추가
2. 이벤트 — P1(메뉴/모달/상태유지/초기화/참가자3버튼/활성방송기준/당첨고정칩/당첨선물/돌리기) 완료. ✅완료: 시안⑨ 인라인 1:1 이식, canvas 실제스핀(30바퀴/4~6초/당첨칸정지/가운데 당첨오버레이/화살표), 인형뽑기 탭 전환, 당첨 포인트 자동지급(P5, 운영모드만), 중복당첨 토글 연동(excludeDailyDup). 잔여: P2(입금완료 서버필터·winners 기간필터 서버연동), P3(가중치 추첨공식 서버 — 토글UI만 있음) — 각 페이즈 ⚠️정의 받고 진행
3. 수동매칭 설정 팝업 메뉴
4. (사장님 추가 예정 — 그 외 작업 생각나는 대로 여기 누적)
   ※ 후속: 상품관리 팝업 — 상시판매 별도 type 도입 / 올림날짜 전용 필드 / 기존 AdminLiveProductListPanel 정리 여부

[고객 주문 페이지]
- 고객 페이지 (별도 작업 영역 — 세부항목 추후 정리)

※ 위 목록은 완전하지 않을 수 있음. 사장님이 새 작업 말하면 즉시 여기 추가할 것.

## 필수 확인 절차
코드 수정 전 반드시:
1. 관련 파일 nl -ba로 실제 라인 확인
2. 돈/입금/정산/배송 로직 포함 여부 확인
3. 변경 범위 최소화

## 금지 사항
- 추정으로 돈/입금/정산/배송/주문상태/포인트/Bankda 로직 수정 금지
- grep 결과만 보고 수정 금지
- order_items 테이블 신규 write 금지 (deprecated)
- localStorage에 운영 데이터 저장 금지
- admin / admin-v2 폴더, DB schema·RLS 건드리지 말 것

## 빌드 및 검수
npm run build (반드시 "✅ BANKDA 안전가드 통과" 메시지 확인)
grep -r "TODO\|FIXME\|console.log" components/ app/
git status

## 기술 함정
- 맥 sed s///1은 줄마다 첫 매칭이라 여러 줄 다 바뀜 → 여러 줄 치환은 python 스크립트 사용
- 긴 체인(sed+build+commit+push 한 줄)은 중간에 멎음 → 단계 분리

## DB 규칙
- 스키마 변경: ADD COLUMN only
- canonical 테이블: orders (flat)
- 입금 추적: deposits 테이블


## UI 작업 필수 원칙 (완전 리뉴얼 프로젝트)

## 핵심 원칙 (절대 준수)
- 이 프로젝트는 기존 UI/UX를 전부 무시하고 시안 기준으로 완전히 새로 만드는 리뉴얼 작업
- 기존 코드 위에 얹거나 수정하는 방식 금지. 반드시 시안 기준으로 새로 설계
- UI 작업 시 시안 파일 /Users/ruru/Downloads/시안모음.html 에서 해당 화면 screens.XXX 코드 직접 읽고 HTML 구조/인라인스타일/클래스 1:1 JSX 변환
- Tailwind 임의 변환 금지. 시안 인라인 style 그대로 사용
- 시안에 없는 구조/색상/레이아웃 임의 추가 금지
- 시안과 다르게 만들면 작업 실패. 다시 만들 것

- 이 프로젝트는 기존 코드를 수정하는 게 아니라 시안 기준으로 완전히 새로 만드는 리뉴얼 작업
- UI 작업 시 기존 코드 위에 얹지 말 것. 반드시 시안 파일을 직접 읽고 1:1로 구현
- 시안 파일 경로: /Users/ruru/Downloads/시안모음.html
- UI 작업 전 반드시: cat /Users/ruru/Downloads/시안모음.html 에서 해당 화면 screens.XXX 코드 읽고 구조/색상/비율 파악 후 구현
- 색상 변수: --rose:#7B2D43 --rose-bg:#F5E6EB --rose-bd:#D9C5CC --green:#0F6E56 --blue:#185FA5
- 시안과 다르게 만들면 작업 실패. 추상적 명령어로 임의 해석 금지

## 룰렛/이벤트 작업 기준
- 룰렛은 반드시 canvas + 실제 스핀 애니메이션 (conic-gradient div는 회전 안 됨)
- 화살표(▼)는 룰렛 안으로 50% 삽입 (너무 위에 떠있으면 안 됨)
- 당첨자 표시는 룰렛 가운데 오버레이
- 회전: 30바퀴, 4~6초, ease-out (당첨칸 정지)
- 방송용 위젯 배경은 반드시 transparent (OBS 크로마키용)

## 확정된 설계 기준
- 관리자 화면: 사이드바 클릭 = 페이지 전환 아님. 방송화면+채팅+주문서 항상 뒤에 유지, 각 기능은 fixed 팝업 모달로 오버레이
- 입금상태 용어: 입금대기/입금확인/매칭필요/카드미결제/카드결제완료
- 출고 용어: 출고대기/택배출고
- 결제수단: 무통장/카드
- 화면명: 입금내역/입금매칭
- 시안 파일: /Users/ruru/Downloads/시안모음.html

## 스택
Next.js / Supabase / Vercel
관리자: /admin-live 경로 (/admin 은 구버전, 미사용)
프로젝트 경로: /Users/ruru/Desktop/ruru-order-app
