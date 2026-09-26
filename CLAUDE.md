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
- 2026-09-26 **[고객이슈] 처리창 최종 단순화**(AdminLiveRefundLedgerPanel + 신규 lib/parseBankAccount·표시/기록만·돈 파일 diff 0·amount_final 서버 재계산 유지): 6줄 구성(헤더→상품→차감→환불금액→방법·계좌→상태·메모)·**직접입력 폐지**(매칭 실패 건만 상품금액 입력, 성공 건은 상품목록에서 체크·수량, 재오픈 시 product_snapshot 선택 복원 — «기존 저장건이 무조건 직접입력으로 열리던» 원인 제거)·저장값≠주문금액이면 노란 안내+[주문 금액으로 맞추기](덮어쓰기 전엔 저장값 유지)·상품 1개면 체크박스 없음·배송비 0원 줄 숨김·포인트 사용 안내(자동차감 없음)·**차감칸 1개**(사유 칩 단순변심/반품배송비, 기존 다중 조정줄은 읽기+삭제 보존)·**계좌 붙여넣기 자동인식**(lib/parseBankAccount: 은행 별칭·계좌 10~16자리 전화 제외·예금주, 요약+수정 펼침·인식실패 칸 노란테두리·원문 저장 안 함·마스킹 유지)·방법은 계좌이체 기본+회색 링크 전환·**상태 2칩**(반품 대기=회수 대기/반품 도착=도착·검수, 미클릭 시 기존 stage 유지)·다음할일 입력 삭제(기존 값 회색 읽기전용)·교환창은 상품카드+옵션/송장 한 번만+「재고 없으면 환불로 바꾸기」 링크. 라벨13·입력16·버튼14·입력44·하단48. 신규 test-parse-bank-account 40건. 검수 guard 5·test 57파일·build·tsc 0.
- 2026-09-26 **[고객이슈] 2차 다듬기 — 버튼 글자(교환/환불·장부있으면 단계)·금액줄(상품명 아래 줄합계·주문번호·×N중복 제거)·「자동」 배지 표시 제거(source=order_return_flow, 로직 유지)·메모 진한 회색·필터 금액 주문번호 있는 모든 줄로 확대·중복 환불 경고(같은 주문 다른 기록)·수정폼 영어문구/빨강 제거**(AdminLiveCustomerIssueRail·RefundProcessModal·refund-ledger 라우트 orderCode 조회·표시만·돈 파일 diff 0). ※처리창 레이아웃(조정 버튼·배송비·회수토글·교환박스)은 최종 단순화 커밋에서 재작성. 검수 guard 5·test 56/56·build·tsc 0.
- 2026-09-26 **[고객이슈] 「환불 처리」 실무형 전면 개편 + 필터 칩 4개**(AdminLiveCustomerIssueRail·AdminLiveRefundLedgerPanel·lib/refundLedger·lib/issueFilter·신규 order-lines 라우트·표시/기록만·주문/입금/정산/포인트/Bankda 파일 diff 0): **0단계 확인** — `adjusted_product_price`=줄합계 확정, 정식 계산 `lib/submitRowPrice.submitRowLineTotal` 재사용(order-return:45의 ×qty는 잠재버그라 미사용). 매칭=주문번호(order_lookup_code)+raw_payload.items/pickIssueProductRows. refund_ledger CHECK 없음·exchange_option/reship_tracking 존재·DB 변경 0. 진상/구매는 다른 로직 연결 0(전수 grep). **① 목록**: 교환/반품/환불 줄에 「단가 × 수량」(주문줄 «주문번호로 한 번에» 조회, 매칭 실패 「-」), 💳 요약 13px. **필터 칩 4개**(전체·교환·반품·환불·기타) — 진상·구매·기타·칩없음은 전부 「기타」(`lib/issueFilter`, 저장값 불변). **등록 셀렉터**도 교환·반품·환불·기타(진상/구매 제거, ISSUE_TYPE_OPTIONS는 기존데이터 인식용 유지). **② 처리 창**: 헤더(닉네임·이름·주문번호·메모 첫 줄 클릭펼침) → **「돌려받을 상품」 목록**(체크·사진·단가×수량=줄금액, 대상 자동체크, 수량 −/+ 일부선택, 배송비 기본해제 별도줄, 포인트 사용 노란 안내·자동차감 없음, 매칭 실패 시 직접 입력, 「직접 수정」 토글, 선택 줄 product_snapshot 저장) → 금액 조정(+차감·+추가 버튼·빠른칩·차감은 음수 저장) → 최종 환불액 22px+계산식 → 방법(반품·환불=계좌이체/포인트/환불없음, 교환=교환재발송/계좌이체/없음, 은행 select 20+) → 물건 회수 토글(회수 필요→회수 대기·돈만→처리 필요) → 단계 칩+메모 → 하단 고정 [저장]/[이체했어요·환불완료 or 재발송 완료]. 금액입력 text+inputMode+콤마+포커스 전체선택. 라벨13·입력16·버튼14·입력44·하단48. amount_final 서버 재계산 유지. **신규 라우트 `/api/admin-live/order-lines`**(service_role·이중401·codes 묶음·submitRowLineTotal 재사용·계좌 무관). 검수 guard 5개·테스트 56/56(신규 refund-amount 14·issue-filter-chips 29)·build·tsc 0·돈 파일 diff 0.
- 2026-09-26 **[교환·환불] 처리 창(RefundProcessModal) 실무형 개편**(AdminLiveRefundLedgerPanel + lib/refundLedger 헬퍼·표시/입력만·저장 로직(amount_final 서버 재계산) 무변경): ①머리글 「반품 처리」/「교환 처리」 + 닉네임·이름/상품(옵션)×수량/주문번호(고객이슈 값), 중복 제목 제거, 닫기 aria-label="닫기". ②금액: 상품금액 기본=이슈 amount_base(없으면 0), **type=number 폐기 → text+inputMode=numeric·쉼표표시(69,000)·저장 숫자·포커스 전체선택**(0 이어붙기 버그 방지). 조정 줄은 **[차감|추가] 버튼 + 양수 입력**(폰 키패드에 − 없음) → 저장 시 차감=음수로 변환(기존 adjustments 형식 유지, `adjRowsToStored`/`storedToAdjRows`). 빠른 칩 「반품 배송비·왕복 배송비·단순변심 차감·직접 입력」. 문구 「+ 차감·추가 금액」. 최종 환불액 18px 굵게 + 계산식(69,000 − 4,000 − 10,000). ③계좌: 은행 **select**(국민·신한·농협…23개), 예금주 기본=이름, 계좌번호 숫자만. ④교환이면 금액 대신 「바꿀 옵션」·「재발송 송장번호」(exchange_option/reship_tracking, 컬럼 존재 확인), 완료 버튼 「재발송 완료로 저장」. ⑤포인트 안내 「포인트는 이 창에서 지급되지 않아요. 회원 상세 › 포인트 지급으로 먼저 지급한 뒤 완료로 저장하세요.」(내부 용어 제거). ⑥글씨 라벨13·입력16(iOS 확대 방지·guard는 15 불가라 16)·버튼14, 입력칸 h-11(44px)·저장버튼 h-12(48px). ⑦고객이슈 💳 요약 13px 「단계 · 금액원 · 방법」. 신규 헬퍼 테스트(부호변환·쉼표·교환) 포함 refund 테스트 54건. 검수 guard 5개·테스트 54/54·build·tsc 0.
- 2026-09-26 **[교환·환불] 별도 탭 폐기 → 고객이슈 안에서 처리로 통합**(AdminLiveCustomerIssueRail + CustomersPanel + refund-ledger 라우트·표시/기록만·돈/포인트/주문/차단 로직 무접촉·refund_ledger RLS·인증·뒷4자리 유지): ①고객 메뉴 「교환·환불」 탭·「장부에서 보기」 버튼·refund 이벤트 리스너 삭제(AdminLiveRefundLedgerPanel 목록 화면 미사용, **처리 창 RefundProcessModal만 export해 재사용**). ②고객이슈 표에서 **교환/반품/환불(task_type exchange·return·refund)** 줄에만 — 특이사항 아래 「💳 진행단계·최종환불액·방법」(refund_ledger 값 있을 때만) + 처리 칸에 **「환불 처리」** 버튼(시안 ③ 처리 창). 처음 누르면 `admin_task_id`로 장부 행 생성(UNIQUE), 상품/주문번호/고객/사유는 이슈에서, amount_base 기본 0(수정 가능). **현재 페이지 교환·환불 줄 요약은 `?taskIds=`로 한 번에 묶어 조회**(줄마다 개별 조회 금지). ③선택 작업 바에 **「이체 목록 복사」**(계좌이체·금액 있는 선택 건, 이때만 서버서 전체 계좌 → 은행 계좌 예금주 금액)·**「엑셀」**(계좌 뒷4만) 추가. 기존 해결완료·삭제·되돌리기·포인트 반환·자동 건 일괄삭제 제외 **무변경**. ④`refund_ledger_migrate.sql`에 ⛔실행 금지 헤더(일괄 이전 폐기 — 장부는 「환불 처리」 첫 클릭 시 생성). 라우트 GET에 `taskIds` 묶음 조회 추가(뒷4자리만·최대 60). 검수 guard 5개·테스트 54/54·build(41p)·tsc 0.
- 2026-09-26 **[교환·환불 장부] 이전 보정 — general 제외 + reason 머리말 제거**(SQL 2개 + AdminLiveRefundLedgerPanel 표시 방어·돈/포인트/차단 로직 무변경): ①`refund_ledger_migrate.sql` — 이전 대상을 `source='order_return_flow' AND task_type IN ('exchange','refund')`로 좁힘(general 제외 — general 5건이 「반품」으로 잘못 들어갔던 것 방지), kind=exchange→교환·refund→반품. ②reason 을 고객이슈 **메모 본문만** 넣도록 수정 — `lib/issueBodyMeta.splitIssueBody`와 같은 규칙을 SQL로 복제(머리말 자동날짜/이슈유형/닉네임/이름/전화번호/고객ID/수정날짜/주문내용/주문번호/대상상품: 줄 제거 + 내용:/메모: 접두어 제거, 줄바꿈 유지). ③**신규 `refund_ledger_fix_reason.sql`** — 이미 들어간 29건 reason 을 본문만 남기게: ①before/after 미리보기 SELECT → ②UPDATE(주석). ④장부 화면(사유 칸 title)·엑셀도 `splitIssueBody().memo`로 머리말 방어(`reasonBody` 헬퍼) — DB 값 무접촉. 검수 guard 5개·테스트 54/54·build·tsc 0. ⚠️**실행 순서**: ①`refund_ledger.sql`(테이블·기실행) → ②`refund_ledger_fix_reason.sql` ①미리보기 SELECT로 before/after 확인 → 주석 ②UPDATE 실행(기존 29건 정리) → ③이후 이전 재실행 시 `refund_ledger_migrate.sql`(general 제외·본문만·ON CONFLICT DO NOTHING이라 안전). ※차단 파서(직전 290fc11)로 4번 항목은 이미 해결됨.
- 2026-09-26 **[버그] 차단사유 파서(parseBlockReason)가 label·품목을 못 나누던 것 수정**(lib/customerBlockReason.ts 파서만·저장형식·차단로직 무변경): 증상 — `[거래파기(거파)]\n· 폴로…` 가 label 빈값+전부 memo(상세 배지 「차단」만, 목록에 대괄호째 노출). **원인(실측)**: 옛 파서가 ①첫 줄이 `^\[..\]$`(대괄호 «단독» 줄)일 때만 유형 인식 → 개행이 사라져 «한 줄»로 저장됐거나 라벨 뒤 전각공백/리터럴 `\n`이면 매칭 실패 → 통째 memo, ②품목 접두어를 정확히 `"· "`(U+00B7+공백)로만 봐서 공백없음·전각 가운뎃점(・)·• 등은 memo로. **수정**: 정규화(CRLF·리터럴 \n→개행, 전각공백·NBSP→공백) + 유형은 맨 앞 `[..]`를 «한 줄 뒤에 품목이 붙어도» 인식(단 아는 유형이거나 뒤가 끝/개행/불릿일 때만 — 메모의 우연한 대괄호 오인 방지) + 품목은 불릿 계열(`· • ∙ ‧ ・`)로 «시작»하는 줄에서 맨 앞 불릿만 떼고 나머지는 **한 품목**(⚠ 줄 안 가운뎃점으로 안 쪼갬 — 「알로 뮬 2컬러 · 블랙/230」처럼 상품명에 · 가 들어감·guard-option-split 기준). 품목은 줄바꿈으로만 분리. 회귀 0(옛 자유텍스트·문장 중간 가운뎃점·미지 대괄호는 그대로 memo). 신규 test-block-reason-parse.mjs 68건(9변형 + 회귀) + 기존 test-customer-block-reason 통과. 검수 guard 5개·테스트 54/54·build·tsc 0.
- 2026-09-26 **[고객] 차단 내용 표시 보강 — 목록 두 줄·상세 차단정보 상자**(AdminLiveCustomersPanel·표시 전용·차단/해제 로직·customer-block 라우트·DB 무접촉): ①회원 목록(PC 표·폰 카드) 차단 상태 칸을 **두 줄**로 — 1줄=빨간 배지 「차단·거파label」(parseBlockReason.label)+차단일(MM.DD, 없으면 미표시), 2줄=품목 요약(첫 품목 「외 N개」)/메모 첫 줄(13px 회색·말줄임), hover=유형+품목 전부+메모+차단일시 전체(`blockTitle`). ②회원 상세 창 헤더 아래에 **「차단 정보」 상자**(차단 회원만·연한 빨강)=유형 배지+품목 개수+오른쪽 차단일시 + 기존 `BlockedCardBody` 재사용(거파 품목·메모) + 「사유 수정」(기존 AdminLiveCustomerBlockReasonModal을 `setBlockModalTarget`으로 열어 기존 재차단=사유 수정)·「차단해제」(기존 onBlockAction) 버튼 연결. 새 차단/해제 로직 안 만듦. **차단일 없으면 「날짜 기록 없음」 대신 표시 안 함.** ③**[조사] 차단일 저장처**: 앱의 모든 차단(회원 목록·주문상세 둘 다 `requestAdminCustomerBlock`→`/api/admin-live/customer-block`)이 `customers`(is_blocked·block_reason, **시각 컬럼 없음**)와 `customer_phone_blocks`(phone=숫자만·**updated_at**) 양쪽에 씀 → **차단일 유일 출처=customer_phone_blocks.updated_at/created_at**(`blockedAtByPhone`가 이걸 읽음). **customers에 차단 시각 컬럼이 없어 폴백 불가**. 몽실(이란영 010-2831-2123) 날짜 안 나오는 건 그 전화의 `customer_phone_blocks` 행이 없거나(이 시스템/테이블 이전 차단, 당시 upsert 실패 등) → **실데이터는 사장님이 SQL로 확인**: `select * from customer_phone_blocks where phone='01028312123'; select id,is_blocked,block_reason from customers where customer_phone in ('01028312123','010-2831-2123');`. 없으면 날짜는 어디에도 없음(추정으로 안 만듦, 표시만 생략). 검수 guard 5개·테스트 53/53·build(41p)·tsc 0.
- 2026-09-26 **[고객] 교환·환불 장부 1단계 신설**(신규: lib/refundLedger.ts · supabase/sql/refund_ledger(.sql·_migrate.sql) · app/api/admin-live/refund-ledger/route.ts · components/admin-live/AdminLiveRefundLedgerPanel.tsx + AdminLiveCustomersPanel/Dashboard/CustomerIssueRail 배선. **돈·포인트·주문 라우트/RPC 무접촉 — 장부는 기록만, 포인트 안 움직임**): 설계보고서 후보 B 승인. **신규 테이블 `refund_ledger`**(ADD COLUMN only 예외·기존 테이블 무접촉·RLS on 정책없음=anon 차단·service_role 전용·admin_task_id UNIQUE로 고객이슈 1건=장부 1줄). **서버 라우트**(verifyAdminSession+미들웨어 이중 401): GET목록=계좌 **뒷4자리만**+단계별 건수+기간/구분/검색, GET단건=전체 계좌(단 done_at+30일 지나면 지연 마스킹), POST/PATCH=**amount_final 서버 재계산**(base+조정줄, 음수 0하한·클라값 불신)·계좌 숫자만. **화면**(고객 메뉴 「교환·환불」 탭): 단계 탭(접수/회수 대기/도착·검수/처리 필요/완료/거절·취소)+건수, 검색·구분·기간, 표(체크·접수일·고객·상품/주문번호·구분/사유·진행/다음할일·처리결과·계좌 뒷4), 선택 시 환불합계·계좌이체/포인트 건수·**이체 목록 복사**(이때만 서버서 전체계좌)·**엑셀(CSV, 계좌 뒷4만)**·+접수. **처리 창**: 단계·금액줄 추가/삭제+최종액 합산(표시는 클라·저장은 서버 재계산)·방법(계좌이체/포인트/교환재발송/없음)·계좌이체면 은행/계좌/예금주+이체정보복사·메모·저장·「이체했어요·환불완료」(transferred_at·done_at만 기록). **포인트 방법=지급 안내 문구만**(3단계에서 연결). **이전**: source="order_return_flow" 고객이슈 → 장부(open→접수/done→완료/deleted→거절·취소, task_type→구분, raw_payload.items→상품, amount_base=0 — 원래 금액 미수집), UNIQUE로 재실행 안전. 손입력 건은 자동이전 안 함(주석 SELECT로 목록만). 고객이슈 탭 교환·반품 줄에 **「장부에서 보기」 링크만** 추가(기존 삭제·되돌리기·포인트 반환 무변경). 검수 guard 5개·테스트 **53/53**(신규 refund-ledger 36건: amount_final·계좌마스킹·이전매핑·재실행키)·build(41p·라우트 등록)·tsc 0·401 이중보호. ⚠️**사장님 실행 순서**: ①Supabase SQL Editor에서 `refund_ledger.sql`(테이블) → ②배포(build+push) → ③원하면 `refund_ledger_migrate.sql`의 1) INSERT(자동 이전). ※B 3단계=포인트 지급 연결, 계좌 photo·상품사진은 후속.
- 2026-09-26 (보고서 정정) docs/교환환불_장부_설계보고.md 3) — 「포인트 환불=order-return 호출」은 오류(그건 «회수»=차감, 장부는 «지급»=반대 방향). 1단계는 장부에서 포인트 안 움직임(기록만).
- 2026-09-26 **[고객] 회원 목록 표 시안 반영 A — 공용 grid·칸 재배치·전체선택 머리글·차단 absolute 막대·전화번호 차단 버튼**(AdminLiveCustomersPanel + AdminLiveCustomerIssueRail·표시 전용·돈/입금/포인트 판정 무접촉): ①머리글·모든 줄이 **공용 상수 `MEMBER_GRID` 하나** 사용(칸 어긋남 0), 숫자칸(누적주문·누적결제·포인트)·처리 머리글=값 오른쪽 정렬. ②칸 순서·폭 `[체크44·사진44·닉네임/이름 1fr·연락처/로그인 176·상태 1.3fr·누적주문 84·누적결제 116·마지막주문 136·포인트 88·처리 132]`. 닉네임/이름 두 줄, 연락처 아래 「로그인 MM.DD HH:mm」(최근 로그인 별도 칸 없앰), 마지막 주문 두 줄 날짜·없으면 「-」. 정렬 = 최근 주문순·최근 로그인순·누적 결제순·포인트순. ③「이 페이지 전체선택」 별도 줄 삭제 → **머리글 첫 칸 체크박스**, 선택 시에만 작업 바(N명 선택·선택 해제·일괄 포인트 지급, 고객이슈 작업 바 모양). ④「전화번호 직접 차단」 접이식 삭제 → **요약줄 오른쪽 「⛔ 전화번호 차단」 버튼**(토글로 기존 입력창). 요약(전체·정상·차단·관리필요) 제목 옆 한 줄. ⑤차단 회원 빨간 띠를 **border-left → absolute 막대**(칸 폭 불변), 상태 칸에 「차단·사유·날짜」+hover 전체. ⑥**고객이슈 표도 공용 상수 `ISSUE_GRID` 하나**로 통일(머리글=값 정렬 점검). ⑦좁은 화면 카드 유지. 검수 guard 5개·테스트 52/52·build(BANKDA 가드 2개)·tsc 0 통과. ※B(교환·환불 장부)는 조사·설계만 하고 사장님 확인 전 코드 작성 안 함.
- 2026-09-25 **[고객] 회원 목록 표 정비 — 매칭필요→미입금 통일 · 누적 결제(결제완료만) · 칸 재배치 · 최근로그인 · 차단띠 버그**(AdminLiveCustomersPanel + customer-list-extra 라우트·표시만·돈/입금/포인트 «판정» 로직 무접촉): ①**[라벨 통일]** 목록 상태를 상세와 맞춤 — `isManualNeeded`(manual_match_needed만) 별도 「매칭필요」 배지 폐기 → `unpaidCount`(isUnpaid, manual 포함) 기준 **「미입금 N건」**(상세가 그 주문을 「미입금」으로 보이는 것과 통일). isPaid/isUnpaid/isManualNeeded 함수 자체는 무변경, 표시 대상만 교체. ②**[금액 기준]** `totalAmount`(모든 주문 orderAmount 합=66,000류)와 상세 결제완료(33,000)가 달랐음 → **`paidAmount`(isPaid 주문만 합산) 신설**, 칸 이름 「누적 결제」, 정렬 「누적 결제순」도 paidAmount. 집계는 합산 대상만 결제완료로 좁힘(판정식 무변경). ③**[칸 순서]** `☐·사진·닉네임/이름·전화번호·상태(1fr)·최근주문·최근로그인·주문·누적결제·포인트·처리`, 머리글·줄 같은 grid 템플릿, 숫자칸 오른쪽정렬. ④**[날짜]** 상대시간(「6시간 전」) 폐지 → 고객이슈 표와 같은 두 줄(`2026.09.25(금)`/`06:48`), 주문 없으면 「-」. ⑤**[최근 로그인]** last_login_at은 기존 select·요약·정렬에 이미 있어 새 쿼리 없이 칸만 추가, 정렬 라벨 「최근 로그인순」. ⑥**[알림OFF]** 아이콘만 → 「🔕 알림OFF」 글자 배지, 여러 배지 줄바꿈 허용. ⑦**[차단 띠 버그]** 차단 줄만 칸이 왼쪽으로 밀리던 것 → border-left-4 → **inset box-shadow**(칸 폭 불변). ⑧**[포커스]** 닉네임 버튼 파란 포커스 → focus-visible 로즈. ⑨**[보안]** customer-list-extra는 middleware(`/api/admin-live/:path*`→미인증 401)+라우트 verifyAdminSessionFromRequest 이중보호 확인, 전화 상한 60→**50**. 검수 guard 5개·테스트 52/52·build(BANKDA 가드 2개)·tsc 0 통과. ※상태 「미입금 N건」이 상세 미입금과 일치하는지·누적 결제 = 상세 누적은 배포 후 실화면 대조 권장.
- 2026-09-25 **[고객] 회원 목록 — 최근주문 버그수정 · 포인트/이슈 RLS 원인 해결 · PC 표 전환 · 포커스 로즈**(AdminLiveCustomersPanel + 신규 라우트 1개·표시 전용·돈 무접촉): ①**[버그]** 누적 0건 회원이 「13시간 전」으로 뜬 원인 = `latestOrderAt`이 주문 기반이 아니라 프로필 회원은 `last_order_at||created_at`(가입일) 폴백 → 목록은 **orderCount>0일 때만** 상대시간, 0건은 「-」(`memberRowInfo`에서 처리). ②**[포인트/이슈 안 보임 원인]** `customer_point_balances`·`admin_tasks`는 **RLS 활성+anon 정책 없음** → 패널의 브라우저 supabase로는 0행(조용히 빈 값). 상세는 서버(service_role)라 보였던 것. **신규 `app/api/admin-live/customer-list-extra/route.ts`**(verifyAdminSession + service_role, phones→{points,openIssues}, 저장형식 대비 숫자만+하이픈 둘 다 조회, 최대 60개)로 옮겨 상세와 동일 값. ③**PC 표 전환** — xl 이상 고객이슈 탭과 같은 표(`☐·사진·닉네임/이름·최근주문·주문·누적금액·포인트·상태·전화번호·처리`, 숫자 오른쪽정렬, 줄 py-2.5, 차단=왼쪽 빨간띠+상태칸 사유요약 hover 전체), xl 미만은 카드 유지. `memberRowInfo` 헬퍼로 표·카드 공유. ④**포커스** — 검색·셀렉트 파란 테두리 → `focus-visible:ring-rose-deep`. guard:ui 글씨 스케일 위반(10px) → 11px로. 검수 guard 5개·테스트 52/52·build(BANKDA 가드 2개, 신규 라우트 등록)·tsc 0 통과. ※실동작(포인트가 상세와 일치)은 배포 후 실화면 확인 필요.
- 2026-09-25 **[고객] 회원 목록 화면 개편 — 필터 한 줄 · 카카오 사진 · 정보칸 · 상태배지 · 차단 표시**(AdminLiveCustomersPanel 1파일·읽기/표시 전용·돈/포인트 로직 무접촉): ①**필터 한 줄** — 2열 그리드 → `[검색(flex-1)·고객상태▾·정렬▾·주문있는고객만·초기화]` flex-wrap(좁으면 줄바꿈). 초기화는 기본값(검색""·상태 all·정렬 latest·주문있는고객만 off)과 다를 때만 표시. ②**카카오 프로필 사진** — `customers.kakao_profile_image`(=profile_image_url 640px) 있으면 동그라미 글자 대신 썸네일, 클릭 시 640px 확대 오버레이(`photoZoom`). **저장 컬럼은 이 하나뿐**(thumbnail_image_url·is_default_image 미저장·미캡처 확인) → 사장님 결정 「지금 데이터로만」: 기본사진은 URL 휴리스틱 `isRealKakaoPhoto`(default_profile 등 포함 시 사진없음 취급). ③**정보칸 추가** — 최근주문 상대시간(`relativeTimeKo`) · 누적 N건·금액 · 포인트 잔액 · 전화. ④**상태 배지(해당할 때만)** — 미해결이슈 N·매칭필요·🔕알림OFF(카카오미연동 기존 유지). 매칭필요=요약의 manualNeededCount(메모리 파생), 알림OFF=live_alert_optin===false(기존 조회에 포함). ⑤**차단** — 왼쪽 빨간 띠(border-l danger)+행 danger 배경, 닉네임 아래에 `🚫 사유요약(blockReasonSummary, 한 줄 truncate)·차단일`, 마우스 올리면 title로 전체 사유(parseBlockReason 조립). 차단 사유 저장=customer_phone_blocks.reason→customers.block_reason→최근 override, 차단일=blockedAtByPhone. ⑥**성능(Nano)** — 포인트 잔액·미해결이슈는 «현재 페이지 20명»만 묶어서 각 1쿼리(`customer_point_balances.in`·`admin_tasks.eq(status,open).in`), pagePhoneKey 바뀔 때만 실행, 실패해도 목록 정상(배지만 생략), 전화 저장형식 대비 숫자만+하이픈 둘 다로 조회. 검수 guard 5개·테스트 52/52·build(BANKDA 가드 2개)·tsc 0 통과.
- 2026-09-25 **[관리자] 방송 목록 필터 — 선택된 방송·ON 방송은 항상 맨 위 고정**(AdminLiveProductManagePopup 1파일·표시 전용·돈/로직 무접촉): 기간 필터 기본이 최근 30일이라 오래된 방송을 선택 중이면 목록에서 사라지던 것 → `bcListView`에서 `bcSelId`(선택)·status ON 방송을 기간/검색 필터와 무관하게 bcList 순서 그대로 맨 위에 고정, 나머지는 필터 통과분만(중복 없음, Set 제외). deps에 bcSelId 추가. 검수 guard 5개·테스트 52/52·build·tsc 0 통과.
- 2026-09-25 **[관리자] 방송 목록 각 줄 「숨기기」 빨간 글씨 → 회색 + hover 시에만 표시**(AdminLiveProductManagePopup 1파일·스타일만·돈/로직 무접촉): 상품관리 › 방송 상품 탭 왼쪽 방송 목록의 `숨기기`가 빨강(danger)이라 늘 눈에 띄던 것 → 회색(ink-mute)으로 낮추고 마우스 올렸을 때만 보이게. 행 버튼에 `group`, span에 `text-ink-mute hover:text-ink-soft opacity-0 group-hover:opacity-100`(터치=isNarrow에선 hover가 없어 항상 표시). handleHideBroadcast·ON 방송 가드는 그대로. 검수 guard 5개·테스트 52/52·build·tsc 0 통과.
- 2026-09-25 **[고객이슈] 「고객이슈」 탭 안에서는 상단 미해결 알림 노란 띠 숨김**(AdminLiveCustomersPanel+AdminLiveDashboard 2파일·표시 로직·돈 무접촉): 고객·이슈 메뉴 상단 `📮 미해결 고객이슈 N건 · 바로 처리 →` 노란 띠(LiveIssueRailPanel variant="banner")가 아래 「고객이슈」 탭과 같은 내용을 두 번 보여주던 것 → 현재 탭이 issues면 띠 숨김. AdminLiveCustomersPanel에 `onTabChange` prop 신설(custTab 변경 시 보고), 대시보드가 `customersActiveTab` 추적해 `!== "issues"`일 때만 배너 렌더. LiveIssueRailPanel 자체는 무변경. 검수 guard 5개·테스트 52/52·build·tsc 0 통과.
- 2026-09-25 **[고객이슈] 탭·체크박스 파란 포커스 테두리 → 키보드일 때만 로즈색(:focus-visible)**(AdminLiveCustomerIssueRail 1파일·스타일만·돈/로직 무접촉): 브라우저 기본 파란 outline이 마우스 클릭에도 떠서 거슬리던 것 → 탭 4개(미해결/전체/해결/삭제함)·체크박스 2곳(머리줄 전체선택·각 줄)에 `outline-none focus-visible:ring-2 focus-visible:ring-rose-deep`. 마우스 클릭 시엔 안 보이고 키보드 이동(Tab) 때만 로즈 링. `ring-rose-deep`는 이미 등록·사용 중인 토큰. 검수 guard 5개·테스트 52/52·build·tsc 0 통과.
- 2026-09-25 **[고객이슈] 「이 탭 N건 전체 선택」 + 「전체 비우기」 버튼 제거**(AdminLiveCustomerIssueRail 1파일·표시/선택 로직·돈 무접촉): 머리줄 전체선택으로 «현재 페이지»가 다 켜지면 작업 바에 `이 탭 N건 전체 선택`(필터 결과 전체=`visibleTasks`) 링크 표시 → 클릭 시 필터 결과 전체 선택. `filteredIds`·`canSelectWholeTab`(allOnPageSelected && selectedIds.size<filteredIds.length)·`selectWholeTab` 파생값. 삭제함 탭의 `🗑 전체 비우기` 버튼과 `purgeAllDeleted`(purgeAll:true 서버호출) 제거 → 삭제함은 머리줄 전체선택 → 이 탭 전체 선택 → 일괄 영구삭제(bulkPurge, isDeleted만 대상)로 대체. **자동 반품 건 일괄삭제 제외 규칙(bulkDelete) 그대로 유지**(포인트 반환 걸린 건은 한 건씩). 검수 guard 5개·테스트 52/52·build·tsc 0 통과.
- 2026-09-25 **[관리자] 상품관리 › 방송 상품 탭 방송 목록 필터 = 기간 프리셋 + 이름 검색**(AdminLiveProductManagePopup 1파일·표시 전용·읽기 전용(broadcasts SELECT만)·돈/주문/재고/방송write 무접촉): 같은 날 넣었던 월 드롭다운(54f56ce)을 사장님 요청으로 교체 — 헤더 아래 ①방송 이름 검색칸 ②기간 프리셋 칩 `[최근 30일(기본)·최근 3개월·전체·기간 선택]` ③「기간 선택」 시 `<input type=date>` 시작~종료(started_at 기준). `bcDateFilter`·`bcCustomFrom/To`·`bcSearch` state + `bcListView` useMemo(기간 하한/상한 + 이름 부분일치). **BroadcastCalendarPicker는 단일 방송 선택기라 기간 범위엔 재사용 불가 → 안 건드림**(주문서 필터 그대로). **렌더만 `bcListView` 기준, 원본 `bcList`·나머지 참조 3곳(선택 방송 제목·모바일 접힘 라벨·선택복사 대상 드롭다운)은 그대로** → 선택·복사·저장 로직 영향 0. 기본이 최근 30일이라 오래된 방송은 「전체」/「기간 선택」으로. 인라인 값은 guard:ui 4px 격자·스케일 준수. 검수 guard 5개·테스트 52/52·build(BANKDA 가드 2개+Compiled OK+39페이지)·tsc 0 통과.
- 2026-09-25 고객이슈 일괄처리 4건 완료(8b2a2e9) — opacity 흐림 제거/📦상품명·💬이슈 두줄/지우기→삭제·삭제함/체크박스 일괄(자동 반품건 일괄삭제 제외)
- 📁 2026-08-31 이전 진행상황은 docs/진행상황_아카이브.md 로 이관(내용 그대로 보존).

## 남은 작업 (우선순위 순 · 끝나면 지우고 진행상황에 기록)
- **주문서 리뉴얼 v12 구현 (방송 후)**: ①로고+헤더 ②영상패널 삭제+배너/스트립 ③하단탭5+제출바+시트 ④보기토글+칩규칙+버튼문구+유튜브 앱 딥링크. 기준: 작업기록/2026-08-12_주문서_리뉴얼_확정시안_v12.md + docs/주문서_리뉴얼_확정시안_v12.html. 관리자 설정에 「다음 방송 일시」 칸 신설 포함.
[admin-live 관리자]
1. 화면 전체 용어·버튼·라벨·문구 시안 기준 전수 통일 (입금상태뿐 아니라 전 화면 일괄, 일부만 고치지 말 것) — 입금상태·메뉴·주요 팝업제목(정산·입금내역·입금매칭 포함) 통일 완료. 잔여 세부 라벨은 화면별 점검 시 추가
2. 이벤트 — P1 완료. ✅완료: 시안⑨ 인라인, canvas 실제스핀, 인형뽑기 탭, 당첨 포인트 자동지급(운영모드만), 중복당첨 토글(excludeDailyDup), **입금완료 서버필터(paidOnly)**, 당첨자목록 종류뱃지. 잔여: P2-나머지(winners 기간필터 서버연동), P3(가중치 추첨공식 서버 — 토글UI만). ✅당첨 자동지급 중복가드(5a235d5): grantedEventIdsRef 세션가드 + is_reward_done 영구게이트(지급성공 시 mark_reward_done true) — 재실행/재로드 재지급 차단, 지급↔지급완료 배지도 자동 연동됨
3. 수동매칭 설정 팝업 메뉴
4. ⚠️ 포인트 일괄지급(시안⑩) 신규 구축 — 현재 빈 placeholder. 명단추가→한번에 지급(grant API 반복)+기간별 기록. 새 지급로직이라 spec 받고 진행
5. (사장님 추가 예정 — 그 외 작업 생각나는 대로 여기 누적)
   ※ 후속: 상품관리 팝업 — 상시판매 별도 type 도입 / 올림날짜 전용 필드 / 기존 AdminLiveProductListPanel 정리 여부

[포인트 자동적립] — 코드(설정 UI·주문서 멘트·트리거 SQL·소급 SQL)는 완료. 운영 적용/검증 남음:
- ⚠️ Supabase에서 order_point_auto_earn_rpc.sql 실행(미적용이면 자동적립 안 됨) + 설정에서 자동적립 ON + 적립률 저장
- 소급적립(order_point_backfill_today.sql) 오늘건 1.5% 실행 여부는 사장님 판단(1단계 미리보기 후)
- 시안 ⑪ 적립규칙 잔여: "90일 미사용 소멸" / "환불·취소 시 자동 회수" 토글 — 이번엔 ON/OFF+적립률만 구현. 필요 시 추가 설계
- 포인트 사용 주문은 현재 적립 제외(정책). 포함 원하면 트리거/소급 SQL의 point_used_amount 조건 제거

[카드결제 팝업] — ⚠️ 페이스터 iframe 임베드 차단(X-Frame-Options) 시 우측 빈화면 → window.open 방식 복귀 필요(실기기 검증 후 결정)

[고객 주문 페이지] — 시안: /Users/ruru/Downloads/files/루루동이_손님페이지_위젯_통합본.txt (텍스트 사양, 딥로즈 #7B2D43 인라인). app/order/page.tsx 섹션별 증분:
- ✅ P1 상단바+☰메뉴 (세션14)
- ✅ P2 주문방법 접기/펼치기 (추가형 howToOpen)
- ✅ P3 영상 — 방송 ON+유튜브URL일 때만 16:9 임베드+접기 (videoOpen/videoEmbedSrc)
- ✅ P10 방송 위젯 신규 라우트 /product-widget (OBS, 고정/순환/주문토스트/투명배경, 읽기전용)
- ✅ P4 상품목록 — 딥로즈 검색+2열격자+페이지네이션, 카드(방송중배지=is_pinned/품절 SOLD OUT), 직접입력 fallback (quickGroupBuyProducts/selectQuickGroupBuyProduct 재사용)
- ✅ P5 옵션 선택 시트 — 딥로즈, 색상/사이즈(선택·입력형)+수량+선택금액+필수 빨강경고 (registeredOption* 재사용)
- ✅ P6 담기 confetti 토스트 — addRegisteredProductToOrderItems 후 '🎉 주문서에 담았어요!'+주문서보기/계속담기
- ✅ P7 주문서 결제부 딥로즈 — OrderPriceSummaryBox 인라인 재작성(금액내역+보유포인트/사용입력/전액사용/사용차감/🪙적립예정), 결제방법(무통장·카드+率)+카드안내+제출바+장바구니 코랄→딥로즈. 금액/포인트/제출 로직 100% 무변경(렌더만). ※적립률 코드에 없어 '적립 예정' 숫자 미표기(일반안내) — 률 정하면 숫자 반영
- ✅ P8 제출 후 계좌안내 — CustomerPaymentGuideBottomSheet coral→rose-deep/soft/line 딥로즈(입금자명·계좌복사·닉네임복사·금액 무변경)
- ✅ P9 주문조회 배지 — 입금확인 초록/택배출고 파랑/입금대기 노랑/그외 회색, 활성탭 등 딥로즈 통일
- ★ 고객 order page P1~P10 전체 시안 1:1 완료(딥로즈 #7B2D43). 돈/입금/주문제출/포인트 로직 전부 무변경
- 진입(카톡로그인/유튜브닉네임 유니크) 화면도 시안 반영 대상

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
- **LiveOrderTable.tsx는 임의로 전체 교체 금지. 기존 필터/로직(상태칩·정렬·페이지·검색·onSelectOrder 등) 유지하며 최소 수정만.** (닉네임 클릭→onSelectOrder→주문상세 드로어 연결은 이미 동작 중)

## 빌드 및 검수
npm run build (반드시 "✅ BANKDA 안전가드 통과" 메시지 확인)
grep -r "TODO\|FIXME\|console.log" components/ app/
git status

## 기술 함정
- 맥 sed s///1은 줄마다 첫 매칭이라 여러 줄 다 바뀜 → 여러 줄 치환은 python 스크립트 사용
- 긴 체인(sed+build+commit+push 한 줄)은 중간에 멎음 → 단계 분리

## ★★ 고객 식별 원칙 (2026-07-09 사장님 확정 — 절대 어기지 말 것)
- **고객의 정체성 = 카카오 계정이다.** (`customers.id` uuid PK / `customers.kakao_id`)
- **전화번호·주소·이름·닉네임은 전부 "바뀔 수 있는 정보"다. 절대 식별 키로 쓰지 말 것.**
- 고객이 번호를 바꾸든 주소를 바꾸든 **같은 사람**이다. 포인트·주문·이력이 전부 따라와야 한다.
- ❌ 앞으로 어떤 세션에서도 "고객 식별은 customer_phone 기준" 이라고 말하거나 그렇게 설계하지 말 것.
  (과거 진행상황 기록에 그런 문장이 남아 있으나 **폐기된 기준**이다.)
- ⚠️ 코드 실태: `customer_point_balances` / `customer_point_ledger` 의 **읽기·쓰기가 아직 `customer_phone` 기준**이다.
  (RPC·트리거·API 전부) → 번호를 바꾸면 여전히 새 고아 행이 생긴다. **STEP 3에서 전환 예정.**
- ✅ 2026-07-09 완료: 고아 포인트 복구(문수 1,395P `01058794497`→`01089904497` / 김정임 295P `01034200786`→`01034300786`,
  `supabase/sql/point_phone_migration_20260709.sql`) + **`customer_id` 컬럼 추가·백필 완료**
  (`supabase/sql/point_customer_id_step1.sql` 실행됨 — 잔액 441/441, 이력 930/930 연결, 미연결 0).
  단 **코드는 아직 customer_id를 읽지 않는다**(동작 변화 0). 기반만 마련된 상태.
- 신규 코드에서 포인트/회원 관련 조회·쓰기는 **customer_id 우선**, phone은 폴백/연락처로만.
- ✅ 2026-07-09 **근본수정 완료**: ①`customer-login-sync`가 **kakao_id로 고객을 먼저 찾음**(전화번호는 폴백)
  → 번호 바꿔도 같은 사람, 중복 고객 row 생성 안 함. 번호가 바뀌면 `customers.customer_phone`을 갱신(unique 충돌 시 스킵).
  ②**DB 트리거 `trg_sync_identity_on_phone_change`**(`supabase/sql/point_identity_sync_trigger.sql`, 2026-07-09 실행 완료)
  — 번호 변경 시 `customer_point_balances`(있으면 합산)·`customer_point_ledger`·`customer_phone_blocks`가 자동으로 따라감.
  트리거는 exception을 삼키고 warning만 남김 → customers 저장(주문 제출) 절대 안 막음(주소 트리거와 동일 방침).
  ③`trg_fill_point_customer_id_*` — 신규 포인트 행에 customer_id 자동 채움. **돈 계산·지급 RPC/API 무변경. 시뮬 17/17 PASS.**
  → **차단 우회도 함께 해결**(차단 행이 새 번호로 따라감).
- ✅ 2026-07-09 **남은 2건도 해결**:
  ①**1인당 구매제한 우회 차단** — `assertPurchaseLimit`(submit route)이 `kakao_id` 기준 누적으로 전환
  (`kakao_id.eq.X` OR `and(kakao_id.is.null, customer_phone.eq.현재번호)`). kakao_id 없으면 기존 전화번호 폴백(회귀 0).
  ②**주문취소 실패 위험 제거** — `cancel_order_and_restore_points` 3단 폴백으로 교체
  (`supabase/sql/order_point_cancel_restore_fix_20260709.sql`): ①주문 번호로 잔액 찾기 → ②없으면 주문의 kakao_id로
  고객 **현재 번호**를 찾아 재시도 → ③그래도 없으면 잔액 row를 생성해 복구. **`raise exception` 제거**(번호 자체가 없는 주문만 예외).
  ledger/balance 모두 "실제 잔액이 있는 번호"에 기록 → 고아 재발 0. **복구 금액식·중복복구 차단·정산/입금 계산 무변경.**
  ③트리거 `trg_sync_identity_on_phone_change`에 (d) 추가 — 번호 변경 시 **옛 주문에 kakao_id 스탬프**(주문의 번호·금액·상태는 불변).
  검수 tsc 0 + **시뮬 16/16 PASS**(우회 차단·회귀 0·취소 항상 성공·중복복구 방지).
  ⚠️ Supabase에 `order_point_cancel_restore_fix_20260709.sql` + 갱신된 `point_identity_sync_trigger.sql` 실행 필요.
- ※ 입금 자동매칭은 `orders.youtube_nickname`(주문 시점 스냅샷)+금액 기준이라 **고객이 닉네임을 바꿔도 과거 주문 매칭은 안 깨진다**(2026-07-09 확인).
- ✅ 2026-07-09 **로그인 안전망 + 중복 kakao_id 정리**: ①login-sync 번호 갱신이 unique 충돌하면 **번호만 빼고 재저장**
  (로그인 500 실패 방지 — kakao-first 전환으로 새로 생긴 실패 경로를 막음). 빈 번호 row도 이때 채움.
  ②같은 kakao_id 중복 고객 2쌍(750/752 최송아, 721/1129 송기영) 정리 — 포인트0·주문0·참조0 확인 후 삭제,
  백업 `customers_backup_20260709_kakao_dedup`. 중복 kakao_id 현재 **0건**. (login은 created_at 최신 row를 선택 = 진짜 row)

## DB 규칙
- 스키마 변경: ADD COLUMN only
- canonical 테이블: orders (flat)
- 입금 추적: deposits 테이블
- 포인트 주인: `customers.id` (카카오 계정). `customer_phone`은 연락처일 뿐 식별자가 아님.

## DB 변경사항 — Supabase SQL Editor에서 직접 실행해야 적용됨 (커밋만으로는 미적용)
포인트 관련 테이블: customer_point_balances(잔액), customer_point_ledger(이력, change_type grant/use/cancel/adjust/expire), customer_point_gifts는 ledger의 customer_visible+seen으로 표시.
적립 금액 컬럼은 orders.final_amount(=total_price=adjusted_total_price, 택배비 제외 상품금액은 adjusted_product_price?? product_price × qty).
- **supabase/sql/order_point_auto_earn_rpc.sql** — 자동적립 트리거. orders ADD COLUMN point_earned_at/point_earned_amount + 트리거 trg_accrue_order_points(입금확인·카드결제완료 전환 시 settings.point_earn_rate%로 적립, 1주문1회, 포인트사용/테스트/정산제외 제외, customer_seen_at=now라 선물팝업 미표시). **아직 미적용이면 자동적립 안 됨.**
- **supabase/sql/order_point_backfill_today.sql** — 오늘(KST) 이미 결제완료된 건 소급적립(고정 1.5%=15/1000). 1단계 미리보기 SELECT → 확인 → 2단계 DO 실행. point_earned_at 가드로 트리거와 중복 안 됨.
- 기존: customer_order_submit_with_points_rpc.sql(주문저장+포인트차감 RPC, 적립 없음), customer_points.sql, order_point_usage_columns.sql 등
- ⚠️ 자동적립을 쓰려면: ① 위 트리거 SQL 적용 + ② 관리자 설정에서 "자동적립 ON" + 적립률(예 1.5) 저장 (둘 다 필요)


## UI 작업 필수 원칙 (완전 리뉴얼 프로젝트)

## 핵심 원칙 (절대 준수)
- 이 프로젝트는 기존 UI/UX를 전부 무시하고 시안 기준으로 완전히 새로 만드는 리뉴얼 작업
- 기존 코드 위에 얹거나 수정하는 방식 금지. 반드시 시안 기준으로 새로 설계
- UI 작업 시 시안 파일 /Users/ruru/Downloads/시안모음.html 에서 해당 화면 screens.XXX 코드 직접 읽고 HTML 구조/인라인스타일/클래스 1:1 JSX 변환
- Tailwind 임의 변환 금지. 시안 인라인 style 그대로 사용
- 시안에 없는 구조/색상/레이아웃 임의 추가 금지
- 시안과 다르게 만들면 작업 실패. 다시 만들 것
- 시안 작업 시 용어/단어는 시안 기준이 아닌 현재 시스템에서 사용 중인 통일된 용어를 따른다. 시안의 단어가 현재 시스템 용어와 다를 경우 현재 시스템 용어 우선.

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
- 상품관리 › 방송 상품 탭 방송 목록 필터 = 기간 프리셋 `[최근 30일(기본)·최근 3개월·전체·기간 선택]` + 방송 이름 검색칸(월 드롭다운 아님). 기간 범위엔 BroadcastCalendarPicker(단일 방송 선택기) 재사용 금지 — date input 2칸 사용. 선택된 방송·ON 방송은 필터와 무관하게 항상 맨 위.
- 고객 › 회원 목록: 필터 한 줄 `[검색·고객상태·정렬·주문있는고객만·초기화(바뀌었을 때만)]`, 입력칸·닉네임 버튼 포커스는 로즈 focus-visible(파란 테두리 금지). 요약(전체·정상·차단·관리필요)은 제목 옆 한 줄 + 오른쪽 「⛔ 전화번호 차단」 버튼(누르면 입력창 토글, 접이식 줄 폐지). **PC(xl 이상)=고객이슈 탭과 같은 표**, 머리글·모든 줄이 **공용 상수 `MEMBER_GRID` 하나**를 그대로 씀(칸 어긋남 0). 최종 칸 순서·폭 `[체크44·사진44·닉네임/이름 1fr·연락처/로그인 176·상태 1.3fr(가장 넓게)·누적주문 84·누적결제 116·마지막주문 136·포인트 88·처리 132]`, 숫자칸(누적주문·누적결제·포인트)·처리 머리글·값 **둘 다 오른쪽 정렬** / **좁은 화면=카드 유지**. 닉네임/이름=닉네임 굵게+아래 이름 회색 두 줄, 연락처/로그인=전화 + 아래 「로그인 MM.DD HH:mm」 회색, 마지막 주문=두 줄 날짜(`2026.09.25(금)`/`06:48`, 주문 없으면 「-」). 「최근 로그인」 별도 칸은 없음(연락처 아래에). 정렬 = 최근 주문순·최근 로그인순·누적 결제순·포인트순(+ 기타). **누적 결제=결제완료(isPaid)만 합산**(paidAmount, 판정 무변경). 상태=**미입금 N건**(unpaidCount, manual 포함 → 상세와 통일)·이슈N·🔕알림OFF(글자 배지·줄바꿈)·카카오미연동, 차단회원은 상태칸에 「차단·사유·날짜」+hover 전체. **전체선택은 표 머리글 첫 칸 체크박스**(별도 줄 폐지), 선택 시에만 작업 바(N명 선택·선택 해제·일괄 포인트 지급, 고객이슈 작업 바와 같은 모양). **차단 빨간 띠는 absolute 막대**(border-left 금지 — 칸 폭 영향 없게). 사진=kakao_profile_image 썸네일·클릭 640px(기본사진 URL은 사진없음). 포인트/이슈는 서버 라우트 `/api/admin-live/customer-list-extra`(service_role·이중보호·전화 최대 50개)로 현재 20명 batch. **고객이슈 표도 같은 규칙**(머리글=값 정렬, 공용 상수 `ISSUE_GRID` 하나).
- 고객 › 회원 목록/상세 차단 표시: 목록 상태칸은 두 줄(1줄 「차단·유형」 배지+차단일MM.DD, 2줄 품목요약/메모·hover 전체), 상세는 헤더 아래 「차단 정보」 상자(BlockedCardBody 재사용+사유수정·차단해제). **차단일 유일 출처=customer_phone_blocks.updated_at**(customers엔 차단 시각 컬럼 없음). 없으면 날짜 미표시(「날짜 기록 없음」 안 씀).
- **교환·환불은 「고객이슈」 안에서 처리한다 — 별도 탭 없음**(2026-09-26 통합). 고객이슈 표의 교환/반품/환불(task_type exchange·return·refund) 줄에만 「환불 처리」 버튼(RefundProcessModal 재사용)·장부 요약(💳 단계·환불액·방법) + 선택 작업 바에 이체 목록 복사·엑셀. 첫 처리 시 admin_task_id 로 refund_ledger 행 생성. refund_ledger_migrate.sql(일괄 이전)은 실행 금지.
- 고객 › 교환·환불 장부(`refund_ledger` 테이블·신규): 기록 전용, **돈·포인트 무접촉**(장부에서 포인트 안 움직임 — 3단계에서 연결). 계좌번호는 **목록/엑셀엔 뒷4자리만**, 전체 번호는 처리 창/이체목록복사 때만 서버서 받고 done_at+30일 후 가림. amount_final은 **서버가 base+조정줄로 재계산**(클라값 불신). 단계=접수/회수 대기/도착·검수/처리 필요/완료/거절·취소, 구분=교환/반품/재발송, 방법=계좌이체/포인트/교환재발송/없음. 고객이슈 1건=장부 1줄(admin_task_id UNIQUE). 라우트 `/api/admin-live/refund-ledger`는 service_role+이중 401.
- 시안 파일: /Users/ruru/Downloads/시안모음.html

## 스택
Next.js / Supabase / Vercel
관리자: /admin-live 경로 (/admin 은 구버전, 미사용)
프로젝트 경로: /Users/ruru/Desktop/ruru-order-app

## 2026-06-10 관리자 UI 정리 (실시간주문 중심 통합)
- 테스트 주문 배지: 화면에서 숨김(testOrderBadge 항상 null). is_test_order 데이터/필터/정산제외 로직은 무변경. (8c436e3)
- 주문 날짜 연도/월 필터 추가: 날짜 드롭다운에 "연·월 선택" + 연도(올해~3년전)/월(1~12) 드롭다운. LiveOrderFilters에 filterYear/filterMonth 추가, matchesDate에 yearmonth 판정. 기존 필터(all/today/yesterday/7days/month/custom) 무변경. (커밋)
- 중복 새로고침 버튼 제거: 탭바 ↻ 삭제, 주문테이블 툴바 ↻(onRefresh)만 유지. 둘 다 loadOrders 호출하던 중복. (커밋)
- 주문 관리 탭/팝업 제거: 실시간 주문서와 기능 완전 중복(둘 다 LiveOrderTable). 실시간 주문서에서 "방송: 전체보기"로 전체 주문 조회 가능(filteredOrders의 broadcast==="all"이면 true). 탭 3개로 축소(실시간주문/입금내역/입금매칭). AdminLiveOrdersPanel.tsx 파일은 보존(삭제 안 함). (f358d28)

### 관리자 화면 원칙 (업계 표준 reconciliation/UX 검색 반영)
- 메뉴/패널은 적을수록 좋고 중복 제거가 표준. 주문은 상태탭+날짜필터 하나로 관리(별도 주문관리 페이지 불필요).
- 실시간 주문서 = 전체 주문 관리 겸용. "방송: 전체보기"가 전체 조회.

### 남은 작업 후보
- 실시간 주문서 "전체보기"에서 과거 전체 주문(1000건 초과)이 다 보이는지 검증 필요 — loadOrders도 행수 캡 영향 가능성. 안 보이면 페이지네이션 적용.
- 포인트 일괄지급 UI, 관리자 고객정보 직접수정, 정산 메뉴.

## 2026-06-10 주문 조회 범위 + 첫화면 기본값 (해결 완료)
- [해결됨] loadOrders의 .limit(500) 제약 해소: "전체보기" 또는 "연·월 선택" 필터일 때만 .range 페이지네이션으로 전체 주문 로드(needsFullLoad 분기). 평소(현재방송/오늘/7일/특정방송)는 500건 유지(방송 중 성능). filters.broadcast/date 변경 시 재조회 useEffect 추가(마운트 중복은 ref로 스킵). (933347d)
- 첫 접속 기본 필터: 방송 중이면 현재 방송 주문(broadcast="current"), 아니면 전체(라이브 표준). 1회성 초기화(didInitBroadcastFilter ref), 사용자가 바꾼 필터는 안 덮어씀. (커밋)

### 다음에 할 후보
- 알림 소리(새 주문 들어오면 소리) — 라이브 표준, 미구현. realtime orders INSERT 감지해서 소리 재생.
- 포인트 일괄지급 UI, 관리자 고객정보 직접수정, 정산 메뉴.
