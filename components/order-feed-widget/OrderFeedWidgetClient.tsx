"use client";

// components/order-feed-widget/OrderFeedWidgetClient.tsx
// [2026-09-12] 방송 화면용 «주문·입금 피드» 위젯 (PRISM/OBS 브라우저 소스) — 시안: 유튜브 채팅 말풍선처럼 쌓이는 알림
//
//   왜 만드나 (사장님 09-12)
//     봇이 유튜브 채팅에 글을 올리면 유튜브 API 쿼터를 쓴다(글 1개 = 50, 하루 60건 상한 — lib/chatOrderPipeline.ts).
//     이 위젯은 «영상 안에 그리는» 것이라 유튜브 API를 아예 안 쓴다 → 쿼터 0, 건수 제한 없음.
//     시청자 채팅창(앱이 그리는 부분)에 올라가는 게 아니므로 답글·다시보기 채팅에는 안 남는다 — 사장님 확인함.
//
//   실측 근거 (베베픽 세로 방송 캡처 900×2000, 2026-09-12)
//     · 앱 채팅 글자 ≈ 34px(= 화면 폭의 3.8%), 아바타 40px, 줄 간격 ≈ 60px, 흰 글자 + 그림자
//     · 앱 채팅이 차지하는 영역 = 아래 약 35% / 상단 채널바 = 위 약 9%
//     · 베베픽은 카톡 로고를 왼쪽 위(세로 15~20%), 채팅 강조 상자를 오른쪽 위(세로 20~31%)에 둔다
//     → 이 위젯 기본 크기: 폭 640px(세로 1080 방송에서 59%, 가로 1920 방송에서 33%), 닉네임 30px(세로 방송 폭의 2.8%)
//       = 앱 채팅보다 조금 작아서 «화면을 해치지 않으면서» 읽힌다. 배치는 사장님이 PRISM 에서 정한다.
//
//   무엇을 보여주나 (옵션·수량·금액은 안 띄움 — 남들이 보는 화면. 사이즈=몸 정보, 금액=돈 정보. lib/feedText.ts)
//     🛒 주문   「닉네임」님 주문 감사합니다 · 상품명(꼬리표·코드 뗀 20자) (여러 상품이면 「외 N종」)
//     💰 입금   「닉네임」님 입금 감사합니다
//     💳 카드   「닉네임」님 카드결제 감사합니다
//     · 전체 최대 3줄(📌 공지 포함) — 공지가 있으면 알림 2줄, 없으면 3줄. 아래에서 위로 쌓임(최신이 아래), 10초 뒤 사라짐.
//       (사장님 09-12: 「공지 포함해서 3줄, 4줄은 너무 많다」. 새 건이 오면 가장 오래된 줄이 먼저 빠진다)
//     · 줄 앞 작은 「주문/입금/카드」 표시 — 진짜 채팅으로 착각하지 않게(«댓글 왜 안 보여요» 혼란 방지).
//     · 📌 고정 공지 한 줄 (broadcasts.feed_pin_text · «이번 방송»의 속성) — 관리자 방송 콘솔 「제목·URL 수정」에서 쓰고 비우면 사라짐.
//       방송이 끝나면 같이 끝나고 다음 방송은 빈칸에서 시작(지난 방송 공지가 새어나가지 않음).
//       방송 ON 동안 맨 위에 계속 떠 있다(«입금자명은 닉네임으로» 같은 상시 안내용).
//
//   ⚠ 읽기 전용. orders 를 실시간 구독(INSERT/UPDATE)해서 «표시»만 한다. 돈·입금·상태 판정 로직은 상품 위젯과 같은 문자열 기준.
//   ⚠ 방송 OFF(활성 방송 없음)면 아무것도 안 그린다.   ?preview=1 이면 견본 3줄을 띄워 크기·위치 맞추기용.
//   ⚠ /product-widget 의 주문/입금 말풍선은 09-13 부터 기본 OFF(이 위젯이 그 역할). 예전처럼 켜려면 상품 위젯 주소에 ?toast=1.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getActiveBroadcast, loadAdminLiveBroadcasts } from "@/components/admin-live/liveBroadcastController";
import { feedOrderLines, feedOrderParts, feedProductLabel, feedProductPages, feedRowFitsOneLine, feedPinFitsOneLine, feedPinFontSize, feedPinLayout, estimateTextWidth, FEED_PAGE_MS, FEED_ROW_AVAIL_W, FEED_ROW_SIZES, FEED_DETAIL_LINES_PER_PAGE, type FeedLine, type FeedOrderItem, type FeedProduct } from "@/lib/feedText";
import { formatOrderOptionText } from "@/lib/orderOptionText";

type AnyRow = Record<string, any>;
type FeedKind = "order" | "deposit" | "card" | "notice";
// notice = 📢 상품 안내(「📢 채팅」 버튼). 다른 줄과 «같은 줄 목록»에 들어가야 3줄 한도에서 같이 밀려난다(사장님 09-13).
// lines[0].left = 주문내역 «표시 문구»(폭 계산용) · products = 그 조각들(상품명/옵션/수량을 «다른 모양»으로 그리려고)
type FeedItem = { id: string; kind: FeedKind; nick: string; lines: FeedLine[]; products?: FeedProduct[]; at: number; text?: string };

const SHOW_MS = 10000;      // 알림 한 줄이 떠 있는 시간 (사장님 09-12: 10초)
const NOTICE_MS = 30000;    // 📢 상품 안내가 떠 있는 시간 — 사장님 09-13 「이건 노출 시간 좀 길게」 → 알림의 3배
// [2026-09-16 사장님] 「상품이 많으면 자리를 더 쓰고, 대신 화면에 뜨는 개수를 줄여라. 주문내용은 다 보이게」
//   → «줄 수»가 아니라 «높이»로 관리한다(줄마다 높이가 달라서 줄 수로 세면 틀린다).
//   실측 렌더(디자인 px): 📌공지/📢안내 1줄 77 · 2줄 120 / 알림 한 줄 75 · 주문내역 한 줄 늘 때마다 +44
//   예산 292px = 방송화면의 약 10%. 아래 조합이 전부 예산 안에 들어간다.
//     공지1줄 + 상품 많은 주문 1건(4줄) = 77 + 207 + 8 = 292   ← 「공지 포함 2개만」
//     공지2줄 + 주문 2건(각 1줄)        = 120 + 150 + 16 = 286
//     공지1줄 + 주문 3건(각 1줄)        = 77 + 225 + 24 = 326 → 넘으므로 오래된 1건이 빠진다
// [2026-09-17 사장님] 「너무 화면을 잡아먹는다. 주문내역 많은 게 뜰 때는 공지 포함 2개만」
//   글자 28 통일 후 실측: 공지 1줄 77 · 알림 한 줄 62 · 주문내역 한 줄마다 +35
//   230 이면 — 공지 + 상품 많은 주문(3줄 = 132) = 221 → «2개만».  공지 + 짧은 주문 2건(62×2) = 221 → 3개.
// [2026-09-20 사장님] 「주문상품이 짤리는데 줄바꿈해서 3줄로」 — 상품 줄 한도를 2 → 3 으로 올렸다
//   (lib/feedText.ts 의 FEED_DETAIL_LINES_PER_PAGE). 그러면 알림 한 건의 최대 높이가
//   62 + 35×2 = 132 → 62 + 35×3 = 167 로 커진다.
//   예산을 230 그대로 두면 「📌공지(77) + 3줄 주문(167) + 간격(8) = 252 > 230」 이라
//   상품 많은 주문이 «아예 안 뜬다». 그래서 255 로 같이 올린다.
//     공지 + 3줄 주문            = 77 + 167 + 8  = 252 ≤ 255  → 뜬다
//     공지 + 짧은 주문 2건        = 77 + 62×2 + 16 = 217 ≤ 255  → 3개 다 뜬다
//     공지 + 짧은 주문 3건        = 77 + 62×3 + 24 = 287 > 255  → 오래된 1건이 빠진다(기존과 같은 동작)
//   BOX_H(300) 안이라 글자 크기·위젯 박스는 안 바뀐다.
const BUDGET_H = 255;
const H_PAD_NOTICE = 34, H_LINE_NOTICE = 43;   // 📌공지·📢안내
const H_ALERT_ONE = 62, H_DETAIL_LINE = 35;    // 알림 한 줄(28px+여백) / 주문내역 한 줄 추가분 — [09-17] 글자 28 통일 후 실측
const KEEP_ITEMS = 6;                          // 메모리에 들고 있는 알림 수(그릴 때 예산으로 자른다)
const WIDGET_W = 860;       // 기본 폭(px) — [09-13 사장님 「가로 좀 늘려줘 길이가 아쉽네」] 640 → 860 (한 줄에 34% 더 들어감)
// [2026-09-13] «프리즘 네모 크기 = 위젯 크기» — 권장 네모 880×320 이 1배. 네모를 키우면 글자도 그 비율로 커지고, 줄이면 작아진다(비율 고정).
const BOX_W = 880, BOX_H = 300;   // 폭 860 + 여백 20 / 높이 = 4줄(공지2+알림2)이 꽉 차는 높이(실측 290)
// [2026-09-16 사장님 «크기만 늘리면 뭐함 — 폰트도 키워야지»]
//   이 BOX_H 가 글자 크기를 정한다. 네모 안에 880×BOX_H 를 꽉 채워 넣기 때문에,
//   BOX_H 가 실제 내용보다 크면 그 차이만큼 «빈 공간»이 되고 글자는 그만큼 작게 들어간다.
//   [실측 · 사장님 방송 캡쳐 648×1440] 유튜브 채팅 글자 21px / 위젯 닉네임 17px / 위젯 상품줄은 측정도 안 될 만큼 작음.
//   «채팅보다 작은 글씨»라 안 읽혔다. 위젯 알약은 가로 x39~615 = 화면 폭의 88% — 가로는 이미 꽉 찼다.
//   → 한 줄에 욱여넣는 한 글자는 못 키운다. «2줄로 나눠» 한 줄당 글자 수를 줄이고 그만큼 글자를 키운다.
//   비어 있던 세로(내용 171 / 기준 320 = 절반을 버리고 있었다)를 그 글자로 채우므로 화면 점유는 그대로다.
//   ⚠ 공지·안내는 «최대 2줄»로 잘라 높이가 예측 가능하게 고정한다(아래 WebkitLineClamp).
// [2026-09-13 사장님 «반투명 제대로 + 가독성»] «유리»처럼: 배경은 옅게(공지 45% · 알림 42%)·흐림 없음 → 방송 화면이 그대로 비친다.
//   읽히는 건 배경이 아니라 «글자 테두리»가 맡는다(검정 1.5px 8방향 + 아래 그림자). 공지 30px(유튜브 채팅과 비슷).
//   실측: 인형 선반 배경 + 폰 크기(1080→390) + JPEG 45 압축 흉내에서도 읽힘. (직전 72%+blur 는 배경이 안 비쳐 «불투명»으로 보였음 — 폐기)
const TEXT_SHADOW =
  "0 0 2px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95), 1.5px 1.5px 0 rgba(0,0,0,0.85), -1.5px -1.5px 0 rgba(0,0,0,0.85), 1.5px -1.5px 0 rgba(0,0,0,0.85), -1.5px 1.5px 0 rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.6)";

// 📢 안내(notice)는 이 표를 쓰지 않는다(닉네임·감사 문구가 없는 줄) → Exclude 로 빼둔다.
const KIND_META: Record<Exclude<FeedKind, "notice">, { icon: string; tag: string; verb: string; verbSolo: string; accent: string }> = {
  // [2026-09-17] 인사말을 「주문 감사합니다」에서 「주문」으로 줄였다. 이유는 «자리 계산»이다.
  //   한 줄에 쓸 수 있는 폭 814px 중 — 닉네임 약 200 · 상품(옵션·수량 포함) 약 330 은 «정보»라 못 줄인다.
  //   「주문 감사합니다」는 그 글자 크기(채팅과 같은 37px)에서 331px, 한 줄의 41% 를 먹는다.
  //   셋을 다 넣으면 861 > 814 라 «무조건» 두 줄이 된다. 정보가 아닌 인사말을 줄이는 게 맞다.
  //   ⚠ 상품이 없는 입금·카드 줄은 자리가 남으므로 인사말을 그대로 둔다(verbSolo).
  // [2026-09-17 최종] 인사말은 「주문 감사합니다」 그대로. 상품 줄을 작은 글씨로 내려 자리를 만들었다.
  order:   { icon: "🛒", tag: "주문", verb: "주문 감사합니다",   verbSolo: "주문 감사합니다",   accent: "#22c55e" },   // 초록 = 상품 위젯 주문성공과 같은 톤
  deposit: { icon: "💰", tag: "입금", verb: "입금 감사합니다",   verbSolo: "입금 감사합니다",   accent: "#60a5fa" },   // 파랑 = 입금/카드
  card:    { icon: "💳", tag: "카드", verb: "카드결제 감사합니다", verbSolo: "카드결제 감사합니다", accent: "#60a5fa" },
};


// [2026-09-13 사장님] 알림 줄 등장 = «커튼이 젖혀지듯» 왼쪽→오른쪽 열림 + 빛 한 줄이 따라감 + 「주문 감사합니다」 톡 튀며 등장 + 강조색 잔광.
//   📌 공지 줄은 상시라 애니메이션 없음. 전부 GPU 속성(clip-path·transform·opacity·box-shadow)이라 PRISM 부담 없음.
//   글로우 색: CEF 구버전을 생각해 color-mix 대신 rgba 문자열을 직접 만든다.
function glowOf(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

// [2026-09-13 사장님] 닉네임 첫 글자 동그라미(아바타) 없앰 — 이름이 바로 첫 글자부터 보이게.
const EXIT_MS = 500;        // 사라질 때 커튼이 닫히는 시간(왼쪽→오른쪽) — 등장과 대칭. 알림은 «1회성»: 등장 1번, 퇴장 1번, 반복 없음.

const nickOf = (row: AnyRow) => String(row?.youtube_nickname || row?.nickname || row?.customer_name || "손님").trim();
const productOf = (row: AnyRow) => String(row?.product_name || row?.name || "").trim();
const statusOf = (row: AnyRow) => String(row?.admin_order_status_v2 || row?.order_manage_status || row?.deposit_status || "").trim();
const groupOf = (row: AnyRow) => String(row?.order_group_id || row?.id || "");

// [2026-09-21] ?preview=1 로 «실제 주문 모양»을 확인할 수 있게 상품 조각을 넣어둔다.
//   예전 미리보기는 products 가 없어 항상 한 줄짜리라, 상품 여러 개일 때의 줄바꿈·폭을
//   실제 방송 없이는 확인할 수 없었다(사장님 캡쳐 재현이 안 됐던 이유).
const PREVIEW_ROWS: FeedItem[] = [
  { id: "p2", kind: "notice",  nick: "", lines: [], at: 0, text: "노다001신더 99,000원 사이즈 235·240·260~275·285 남은 13" },
  { id: "p3", kind: "card",    nick: "루루짱929", lines: [], at: 0 },
  // ⚠ «맨 뒤 = 최신». 높이 예산은 최신부터 담으므로(아래 371행대) 확인 대상인 주문 줄을 맨 뒤에 둔다.
  //   예전엔 맨 앞에 있어서 예산에 밀려 미리보기에 아예 안 떴다 — 그래서 확인이 안 됐다.
  { id: "p1", kind: "order",   nick: "공기뼈", lines: [{ left: "폴로 스트라이프 니트 외 1종", right: "합계 78,000원" }],
    products: [
      { name: "폴로 스트라이프 니트", opt: "레드/S", qty: 1 },
      { name: "폴로 스트라이프 니트", opt: "아이보리/S", qty: 1 },
    ], at: 0 },
];

// [2026-09-17 사장님] 「한 줄 한 줄 하지 말고 옆으로 길게, 단 구분 잘 되게. 글자는 전부 채팅과 같은 크기로」
//   · 글자 크기는 상품명·옵션·수량 전부 같다(37). 구분은 «색»으로 한다 — 흰색 / 연한색 / 흰색.
//   · 상품과 상품 사이는 «강조색 막대」로 끊는다. 쉼표·가운뎃점은 옵션 안에도 나와서 헷갈렸다.
//   · 옵션은 「블랙/L」로 짧게. 수량이 항상 「N개」라 «개»가 붙은 쪽이 수량이라 안 헷갈린다.
function ProductRun({ products, accent, page, pageCount }: { products: FeedProduct[]; accent: string; page: number; pageCount: number }) {
  return (
    <>
      {products.map((p, i) => (
        // 상품 하나는 «통째로» 줄을 바꾼다 — 「알로가방 / 1개」처럼 이름과 수량이 갈라지지 않게
        <span key={i} style={{ display: "inline", whiteSpace: "nowrap" }}>
          {i > 0 ? (
            <span style={{ color: accent, fontWeight: 900, padding: "0 10px", textShadow: "none", whiteSpace: "normal" }}>|</span>
          ) : null}
          <span style={{ fontWeight: 800, color: "#fff" }}>{p.name}</span>
          {p.opt ? <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>{` ${p.opt}`}</span> : null}
          <span style={{ fontWeight: 800, color: "#fff" }}>{` ${p.qty}개`}</span>
        </span>
      ))}
      {pageCount > 1 ? (
        <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.6)", paddingLeft: "12px" }}>{`(${page + 1}/${pageCount})`}</span>
      ) : null}
    </>
  );
}

// [2026-09-17 사장님] 「주문 감사합니다 할 때 폭죽 터지는 느낌」 — 상품 위젯에 있던 폭죽을 그대로 옮겨왔다.
//   주문 줄이 «등장할 때 1회»만 터진다. 입금·카드·안내엔 안 터진다(주문이 몰릴 때 정신없지 않게).
//   알약이 overflow:hidden 이라 알약 «밖»(감싸는 칸)에서 터뜨린다. 전부 GPU 속성이라 PRISM 부담 없음.
const CONFETTI_MS = 1700;
const CONFETTI_PIECES = [
  { tx: "104px", ty: "-38px", r: "-232deg", color: "#7B2D43", size: 11, round: true, dur: 1.49 },
  { tx: "71px", ty: "-34px", r: "-348deg", color: "#FFD9E0", size: 10, round: false, dur: 1.45 },
  { tx: "115px", ty: "-69px", r: "-101deg", color: "#F5C24B", size: 8, round: false, dur: 1.15 },
  { tx: "98px", ty: "-74px", r: "-397deg", color: "#22c55e", size: 9, round: true, dur: 1.15 },
  { tx: "92px", ty: "-84px", r: "-419deg", color: "#ffffff", size: 12, round: false, dur: 1.17 },
  { tx: "66px", ty: "-73px", r: "-414deg", color: "#6FC3E8", size: 12, round: false, dur: 1.45 },
  { tx: "45px", ty: "-61px", r: "-88deg", color: "#7B2D43", size: 8, round: true, dur: 1.43 },
  { tx: "45px", ty: "-75px", r: "53deg", color: "#FFD9E0", size: 11, round: false, dur: 1.19 },
  { tx: "36px", ty: "-77px", r: "91deg", color: "#F5C24B", size: 12, round: false, dur: 1.59 },
  { tx: "31px", ty: "-88px", r: "-329deg", color: "#22c55e", size: 12, round: true, dur: 1.44 },
  { tx: "23px", ty: "-91px", r: "222deg", color: "#ffffff", size: 8, round: false, dur: 1.43 },
  { tx: "11px", ty: "-77px", r: "-418deg", color: "#6FC3E8", size: 12, round: false, dur: 1.22 },
  { tx: "7px", ty: "-138px", r: "335deg", color: "#7B2D43", size: 10, round: true, dur: 1.38 },
  { tx: "-6px", ty: "-128px", r: "200deg", color: "#FFD9E0", size: 10, round: false, dur: 1.25 },
  { tx: "-14px", ty: "-92px", r: "-41deg", color: "#F5C24B", size: 8, round: false, dur: 1.44 },
  { tx: "-33px", ty: "-133px", r: "473deg", color: "#22c55e", size: 10, round: true, dur: 1.54 },
  { tx: "-36px", ty: "-100px", r: "-391deg", color: "#ffffff", size: 8, round: false, dur: 1.41 },
  { tx: "-39px", ty: "-82px", r: "160deg", color: "#6FC3E8", size: 9, round: false, dur: 1.66 },
  { tx: "-63px", ty: "-106px", r: "-460deg", color: "#7B2D43", size: 13, round: true, dur: 1.15 },
  { tx: "-84px", ty: "-113px", r: "102deg", color: "#FFD9E0", size: 10, round: false, dur: 1.52 },
  { tx: "-98px", ty: "-108px", r: "477deg", color: "#F5C24B", size: 12, round: false, dur: 1.58 },
  { tx: "-58px", ty: "-53px", r: "-349deg", color: "#22c55e", size: 10, round: true, dur: 1.38 },
  { tx: "-62px", ty: "-47px", r: "-416deg", color: "#ffffff", size: 13, round: false, dur: 1.52 },
  { tx: "-122px", ty: "-74px", r: "372deg", color: "#6FC3E8", size: 10, round: false, dur: 1.53 },
  { tx: "-103px", ty: "-49px", r: "-494deg", color: "#7B2D43", size: 11, round: true, dur: 1.31 },
  { tx: "-139px", ty: "-51px", r: "-301deg", color: "#FFD9E0", size: 11, round: false, dur: 1.14 },
];

function Confetti() {
  return (
    <div aria-hidden style={{ position: "absolute", left: "48px", top: "52%", width: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
      {CONFETTI_PIECES.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute", width: `${p.size}px`, height: `${p.size}px`,
            borderRadius: p.round ? "50%" : "2px", background: p.color,
            ["--tx" as string]: p.tx, ["--ty" as string]: p.ty, ["--r" as string]: p.r,
            animation: `ruruConfetti ${p.dur}s ease-out forwards`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export default function OrderFeedWidgetClient() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const itemsRef = useRef<FeedItem[]>([]);   // 수명 계산에서 «지금 떠 있는 다른 알림»을 보려고(붐빔 판정)
  itemsRef.current = items;
  const [live, setLive] = useState(false);          // 활성 방송 있음
  const [previewMode, setPreviewMode] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const [pinText, setPinText] = useState("");
  const seenRef = useRef<Set<string>>(new Set());
  // 같은 주문(order_group_id)의 상품 여러 줄이 INSERT 로 따로 오므로 0.6초 모아서 한 줄로
  const pendingOrdersRef = useRef<Map<string, { nick: string; items: FeedOrderItem[]; timer: number | null }>>(new Map());

  // 배경 투명 (크로마키)
  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  // ?preview=1
  useEffect(() => {
    try { setPreviewMode(new URLSearchParams(window.location.search).get("preview") === "1"); } catch { setPreviewMode(false); }
  }, []);

  // 브라우저 소스 네모에 맞춰 통째로 확대/축소(비율 유지) — 권장 660×280 이면 1배
  useEffect(() => {
    const calc = () => {
      const s = Math.min(window.innerWidth / BOX_W, window.innerHeight / BOX_H);
      setFitScale(Number.isFinite(s) && s > 0 ? Math.min(3, s) : 1);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // 방송 ON/OFF + 📌 고정 공지 — 활성 방송 행 하나에서 같이 읽는다 (20초 폴링 + broadcasts 실시간)
  //   관리자가 📌 를 저장하면 broadcasts UPDATE → 즉시 다시 읽어 바로 반영. 방송 OFF 면 공지도 같이 사라짐.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const list = await loadAdminLiveBroadcasts();
        if (!alive) return;
        const active = getActiveBroadcast(list);
        setLive(Boolean(active));
        setPinText(String(active?.feed_pin_text ?? "").trim());
        // [2026-09-13] 📢 상품 안내 — 「📢 채팅」 버튼이 쓴 한 줄. 다른 알림과 «같은 줄 목록»에 넣는다.
        //   → 30초가 안 지났어도 새 주문·입금이 와서 3줄이 넘으면 오래된 이 줄부터 밀려난다(사장님 09-13).
        const noticeText = String(active?.feed_notice_text ?? "").trim();
        const noticeAt = active?.feed_notice_at ? new Date(String(active.feed_notice_at)).getTime() : 0;
        if (noticeText && noticeAt > 0 && Date.now() - noticeAt < NOTICE_MS) {
          const key = `notice:${noticeAt}`;
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            pushItem({ id: key, kind: "notice", nick: "", lines: [], at: noticeAt, text: noticeText });
          }
        }
      } catch { /* 조회 실패 시 상태 유지 */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), 20000);
    const ch = supabase
      .channel("ruru-order-feed-broadcasts")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "broadcasts" }, () => void check())
      .subscribe();
    return () => { alive = false; window.clearInterval(timer); supabase.removeChannel(ch); };
  }, []);

  // 줄마다 떠 있는 시간 — 📢 안내는 30초. 주문 알림은 «읽을 양»에 맞춰 유도리 있게.
  //   [2026-09-17] 상품이 많아 «장»이 여러 개면 그 장들을 다 볼 시간을 준다(장당 3.5초).
  // [2026-09-17 사장님] 「화면을 너무 잡아먹을 땐 빠르게 없애야」 — 새 알림이 뒤에 붙으면
  //   앞 알림은 «인식만 되게» 잠깐(4초) 더 보이고 사라진다. 혼자 떠 있을 땐 원래 시간대로.
  const CROWD_GRACE_MS = 4000;
  const crowdedLife = (item: FeedItem, base: number) => {
    if (item.kind === "notice") return base;
    const newer = itemsRef.current.find((x) => x.kind !== "notice" && x.id !== item.id && x.at > item.at);
    if (!newer) return base;
    return Math.min(base, newer.at - item.at + CROWD_GRACE_MS);
  };
  const lifeOf = (item: FeedItem) => crowdedLife(item, baseLifeOf(item));
  const baseLifeOf = (item: FeedItem) => {
    if (item.kind === "notice") return NOTICE_MS;
    const pages = feedProductPages(item.products || []);
    if (pages.length <= 1) return SHOW_MS;
    return Math.max(SHOW_MS, pages.length * FEED_PAGE_MS + 1500);
  };

  const pushItem = (item: FeedItem) => {
    setItems((prev) => [...prev.filter((x) => x.id !== item.id), item].slice(-KEEP_ITEMS));   // 넉넉히 들고, 그릴 때 «높이 예산»으로 자른다
  };

  // 10초 지난 줄은 0.5초 동안 커튼 닫히듯 사라진 뒤 제거 (0.1초마다 확인 — 줄이 최대 3개라 부담 없음)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      setItems((prev) => (prev.some((x) => n - x.at > lifeOf(x) + EXIT_MS) ? prev.filter((x) => n - x.at <= lifeOf(x) + EXIT_MS) : prev));
    }, 100);
    return () => window.clearInterval(t);
  }, []);

  // 실시간: 주문(INSERT) / 입금확인·카드결제완료(UPDATE) — 상품 위젯(ProductWidgetClient)과 같은 판정 문자열
  useEffect(() => {
    const flushOrder = (key: string) => {
      const p = pendingOrdersRef.current.get(key);
      if (!p) return;
      pendingOrdersRef.current.delete(key);
      pushItem({ id: `ins:${key}`, kind: "order", nick: p.nick, lines: feedOrderLines(p.items, formatOrderOptionText), products: feedOrderParts(p.items, formatOrderOptionText), at: Date.now() });
    };

    const channel = supabase
      .channel("ruru-order-feed-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyRow;
        if (row?.is_test_order === true || row?.is_deleted === true) return;
        const key = groupOf(row);
        const seenKey = `ins:${key}`;
        // [2026-09-13 사장님] 옵션·수량·금액도 같이 — orders 는 상품 한 줄이 한 행(color · size · qty · product_price=단가)
        const itemOf = (r: AnyRow): FeedOrderItem => ({ name: productOf(r), color: r?.color, size: r?.size, qty: r?.qty, price: r?.product_price });
        if (seenRef.current.has(seenKey)) {
          // 같은 주문의 다른 상품 줄 — 모으기만
          const p = pendingOrdersRef.current.get(key);
          if (p) { p.items.push(itemOf(row)); }
          return;
        }
        seenRef.current.add(seenKey);
        const entry = { nick: nickOf(row), items: [itemOf(row)], timer: null as number | null };
        entry.timer = window.setTimeout(() => flushOrder(key), 600);
        pendingOrdersRef.current.set(key, entry);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row = (payload.new || {}) as AnyRow;
        const oldRow = (payload.old || {}) as AnyRow;
        if (row?.is_test_order === true) return;
        const status = statusOf(row);
        const oldStatus = statusOf(oldRow);
        const key = groupOf(row);
        if (/입금확인/.test(status) && !/입금확인/.test(oldStatus)) {
          const k = `dep:${key}`;
          if (!seenRef.current.has(k)) { seenRef.current.add(k); pushItem({ id: k, kind: "deposit", nick: nickOf(row), lines: [], at: Date.now() }); }
        }
        if (status === "카드결제완료" && oldStatus !== "카드결제완료") {
          const k = `card:${key}`;
          if (!seenRef.current.has(k)) { seenRef.current.add(k); pushItem({ id: k, kind: "card", nick: nickOf(row), lines: [], at: Date.now() }); }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      for (const p of pendingOrdersRef.current.values()) if (p.timer) window.clearTimeout(p.timer);
      pendingOrdersRef.current.clear();
    };
  }, []);

  const showPin = (live || previewMode) && (pinText || (previewMode && !pinText));
  const pinShown = pinText || "공지: 입금자명은 닉네임으로 보내주세요";
  const source = previewMode && items.length === 0 ? PREVIEW_ROWS : (live || previewMode ? items : []);
  // [2026-09-16] «글자 줄» 예산으로 자른다. 주문 한 건 = 인사말 1줄 + 상품 최대 2줄, 📢 안내 = 2줄, 📌 공지 = 2줄.
  //   최신(맨 아래)부터 담고 예산이 차면 오래된 건 안 그린다 → 기준 높이를 넘지 않는다.
  // 이 줄이 화면에서 차지하는 «높이»(디자인 px)
  const heightOf = (it: FeedItem) => {
    if (it.kind === "notice") return H_PAD_NOTICE + H_LINE_NOTICE * (feedPinFitsOneLine(it.text || "") ? 1 : 2);
    const m = KIND_META[it.kind as Exclude<FeedKind, "notice">];
    const pages = feedProductPages(it.products || []);
    if (pages.length === 0) return H_ALERT_ONE;
    const run = pages[0].map(feedProductLabel).join("  |  ");
    if (pages.length === 1 && feedRowFitsOneLine(it.nick, `${m.icon} ${m.verb}`, run)) return H_ALERT_ONE;
    // 상품 줄(28px)이 1줄이면 +35, 2줄이면 +70. 장이 여러 개면 «가장 큰 장» 기준(높이가 흔들리지 않게).
    const maxLines = Math.max(...pages.map((pg) => Math.min(FEED_DETAIL_LINES_PER_PAGE, Math.ceil(estimateTextWidth(pg.map(feedProductLabel).join("  |  "), FEED_ROW_SIZES.detail) / FEED_ROW_AVAIL_W))));
    return H_ALERT_ONE + 35 * Math.max(1, maxLines);
  };
  // 📌 공지가 먼저 자리를 잡고, 남는 높이만큼 «최신 알림부터» 담는다.
  let budget = BUDGET_H - (showPin ? H_PAD_NOTICE + H_LINE_NOTICE * (feedPinFitsOneLine(pinShown) ? 1 : 2) + 4 : 0);
  const picked: FeedItem[] = [];
  for (let i = source.length - 1; i >= 0; i -= 1) {
    const cost = heightOf(source[i]) + (picked.length > 0 || showPin ? 8 : 0);
    if (budget - cost < 0) break;
    budget -= cost;
    picked.unshift(source[i]);
  }
  // 예산이 빠듯해 하나도 못 담는 경우엔 «최신 한 건»은 무조건 보여준다(알림이 통째로 안 뜨는 일 방지)
  const visible = picked.length === 0 && source.length > 0 ? [source[source.length - 1]] : picked;
  if (visible.length === 0 && !showPin) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "transparent", pointerEvents: "none", fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', Arial, sans-serif" }}>
      {/* 왼쪽 아래 기준. 맨 아래 📌 공지(고정) ← 그 위로 알림(최신이 공지 바로 위, 오래된 게 위로) — PRISM 네모 위치·크기는 사장님이 정한다 */}
      <div
        style={{
          position: "absolute", left: "8px", bottom: "8px", width: `${WIDGET_W}px`,
          // [2026-09-16 사장님 «정보량은 적은데 가로만 길다»] 줄마다 «글자 길이만큼»만 차지하고, 길면 위젯 폭에서 멈춘다.
          display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-start", gap: "8px",
          transform: fitScale !== 1 ? `scale(${fitScale})` : undefined, transformOrigin: "bottom left",
        }}
      >
        {visible.map((item) => {
          const leaving = !previewMode && now - item.at > lifeOf(item);   // 수명 지남 → 커튼 닫히며 퇴장(0.5초)
          // 📢 상품 안내 — [2026-09-13 사장님] 「📢 채팅」 버튼 문구. 30초짜리지만 3줄이 넘으면 새 주문·입금에 밀려난다.
          //   방송 화면에 «지금 이 상품»을 알리는 줄이라 주문 알림(초록·파랑)과 구분되게 노랑 테두리.
          if (item.kind === "notice") {
            return (
              <div
                key={item.id}
                style={{
                  maxWidth: `${WIDGET_W}px`, boxSizing: "border-box",                  // [09-16] 폭 자동 — 글자만큼만 (09-21: 퍼센트 → 픽셀)
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "17px 20px 17px 16px",                                        // [09-16] 좌우 여백을 줄여 글자를 1px이라도 크게(공지는 길다)
                  borderRadius: "999px",
                  background: "rgba(24, 20, 12, 0.45)",                                  // 흐림 없음 — 뒤가 그대로 비침
                  boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                  border: "1.5px solid rgba(253, 224, 71, 0.7)",
                  color: "#fff", textShadow: TEXT_SHADOW,
                  // [09-16] 길면 글자를 줄여서라도 한 줄에 맞춘다(최소 27px). 그보다 길면 그때만 2줄.
                  // [2026-09-20 사장님] 「긴 알림은 좌우 여백 살짝 띄우고 노는 공간 살려서, 폰트도 좀 키우고」
                  //   → 글자 크기·줄 수·폭을 lib/feedText.ts 의 feedPinLayout 한 곳에서 정한다.
                  fontSize: `${feedPinLayout(item.text || "").fontSize}px`, fontWeight: 900, lineHeight: 1.25, wordBreak: "keep-all",
                  animation: leaving
                    ? `ruruCurtainOut ${EXIT_MS}ms ease-in forwards`
                    : "ruruCurtain 0.65s cubic-bezier(0.16,1,0.3,1) both",
                }}
              >
                <span style={{ flexShrink: 0, fontSize: "26px", textShadow: "none" }}>📢</span>
                {/* 2줄이 될 때는 «절반쯤»에서 줄을 바꿔 두 줄 길이를 맞춘다 → 알약이 화면 끝까지 안 늘어나고 좌우에 여백이 남는다 */}
                <span style={{ minWidth: 0, maxWidth: `${feedPinLayout(item.text || "").maxWidth}px`, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.text}</span>
              </div>
            );
          }
          const meta = KIND_META[item.kind as Exclude<FeedKind, "notice">];
          const allParts = item.products || [];
          // [2026-09-17 사장님] 「너무 길고 복잡하면 출력하고 빠르게 또 이어서 보여주고?」
          //   → 상품이 많으면 «한 줄에 들어가는 만큼»씩 장을 넘겨가며 전부 보여준다.
          //     화면 높이는 항상 그대로(최대 2줄)고, 주문내역은 하나도 안 버린다.
          const pages = feedProductPages(allParts);
          const pageIdx = pages.length > 1
            ? Math.min(pages.length - 1, Math.floor(Math.max(0, now - item.at) / FEED_PAGE_MS))
            : 0;
          const shownParts = pages[pageIdx] || [];
          const runText = shownParts.map(feedProductLabel).join("  |  ");
          const oneLine = pages.length <= 1 && feedRowFitsOneLine(item.nick, `${meta.icon} ${meta.verb}`, runText);
          // 폭죽: 주문 줄이고, 막 등장했을 때(1.7초 안) 1회. 그 뒤엔 DOM 에서 빠진다.
          const burst = item.kind === "order" && now - item.at < CONFETTI_MS;
          return (
            <div key={item.id} style={{ position: "relative", maxWidth: `${WIDGET_W}px` }}>
            {burst ? <Confetti /> : null}
            <div
              style={{
                // [2026-09-21 사장님 캡쳐] 방송화면에서 주문 알림이 위젯 폭을 «넘어가» 오른쪽이 잘렸다.
                //   폭 제한이 maxWidth:"100%" 였는데, 부모가 절대위치+transform 인 실제 화면에서는
                //   그 퍼센트가 기대대로 안 걸렸다(내 테스트 페이지에서는 걸렸다 — 그래서 재현이 안 됐다).
                //   → 퍼센트에 기대지 말고 «픽셀»로 못박는다. 값은 위젯 폭 그대로라 디자인 변화 없음.
                maxWidth: `${WIDGET_W}px`, boxSizing: "border-box",                    // [09-16 사장님] 폭은 «글자 길이만큼». 길면 위젯 폭에서 멈춘다
                position: "relative", overflow: "hidden",                            // 빛 줄이 말풍선 밖으로 안 나가게
                display: "flex", alignItems: "center", gap: "12px",
                padding: "14px 22px 16px 24px",                                      // [09-16] 2층 구조라 여백은 최소로 — 남는 높이는 전부 «글자»에
                borderRadius: "999px",
                background: "rgba(14, 12, 18, 0.42)",                                 // 흐림 없음 — 뒤가 그대로 비침
                boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                borderLeft: `5px solid ${meta.accent}`,
                // 등장: 커튼 열림(0.65초) → 강조색 잔광(0.4초 뒤, 1초).  퇴장: 커튼 닫힘(0.5초). 둘 다 1회.
                animation: leaving
                  ? `ruruCurtainOut ${EXIT_MS}ms ease-in forwards`
                  : "ruruCurtain 0.65s cubic-bezier(0.16,1,0.3,1) both, ruruGlow 1s ease-out 0.4s",
                ["--ruru-glow" as string]: glowOf(meta.accent, 0.6),
                textShadow: TEXT_SHADOW,
                color: "#fff",
              } as React.CSSProperties}
            >
              {/* 빛 한 줄 — 커튼 가장자리를 따라 왼쪽→오른쪽으로 지나감 */}
              <span
                aria-hidden
                style={{
                  position: "absolute", top: 0, bottom: 0, left: 0, width: "38%", pointerEvents: "none",
                  background: "linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 40%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0.28) 60%, rgba(255,255,255,0) 100%)",
                  transform: "translateX(-120%) skewX(-12deg)",
                  animation: "ruruShine 0.8s cubic-bezier(0.16,1,0.3,1) 0.05s both",
                }}
              />
              {/* [2026-09-16 사장님 «바람잡이»] 손님들이 «저런 걸 사는구나» 보게 하는 줄이다.
                  → 금액은 빼고 «상품 이름»을 보여준다. 금액이 빠진 만큼 자리가 남아 대부분 한 줄로 끝난다(화면을 덜 가린다).
                  들어가면 한 줄, 안 들어가면 2줄(1층 누가·인사말 / 2층 주문내역). 3줄은 만들지 않는다.
                  글자 크기는 «유튜브 채팅과 같게» 맞췄다(실측: 채팅 글자 21px = 이 위젯 37px). */}
              <span style={{ minWidth: 0, maxWidth: `${FEED_ROW_AVAIL_W}px`, flex: "1 1 auto", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: "11px", lineHeight: 1.12 }}>
                  {/* 닉네임 = 손님이 자기 이름을 찾는 곳. 안 자른다(아주 긴 것만 60% 선에서 …) */}
                  <span style={{ flexShrink: 0, maxWidth: "60%", fontSize: `${FEED_ROW_SIZES.nick}px`, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.nick}<span style={{ fontSize: `${FEED_ROW_SIZES.nim}px`, fontWeight: 800 }}>님</span>
                  </span>
                  <span
                    style={{
                      flexShrink: 0, fontSize: `${FEED_ROW_SIZES.verb}px`, fontWeight: 800, color: meta.accent, whiteSpace: "nowrap",
                      transformOrigin: "left center",
                      animation: "ruruVerbPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.35s both",
                    }}
                  >
                    {meta.icon} {allParts.length > 0 ? meta.verb : meta.verbSolo}
                  </span>
                  {oneLine && allParts[0] ? (
                    <>
                      <span style={{ flexShrink: 0, fontSize: "24px", opacity: 0.45 }}>·</span>
                      <span style={{ flexShrink: 1, minWidth: 0, fontSize: `${FEED_ROW_SIZES.detail}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <ProductRun products={shownParts} accent={meta.accent} page={pageIdx} pageCount={pages.length} />
                      </span>
                    </>
                  ) : null}
                </span>
                {!oneLine && allParts.length > 0 ? (
                  <span style={{
                    // 폭을 픽셀로 못박아 «반드시» 여기서 줄이 바뀌게 한다(폭 계산 FEED_ROW_AVAIL_W 와 같은 값).
                    // overflowWrap:anywhere 는 마지막 안전장치 — 상품 이름 하나가 한 줄보다 길어도 밖으로 안 넘친다.
                    minWidth: 0, maxWidth: `${FEED_ROW_AVAIL_W}px`, fontSize: `${FEED_ROW_SIZES.detail}px`, lineHeight: 1.25, marginTop: "2px",
                    display: "-webkit-box", WebkitLineClamp: FEED_DETAIL_LINES_PER_PAGE, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "keep-all", overflowWrap: "anywhere",
                  }}>
                    <ProductRun products={shownParts} accent={meta.accent} page={pageIdx} pageCount={pages.length} />
                  </span>
                ) : null}
              </span>

            </div>
            </div>
          );
        })}
        {/* 📌 고정 공지 — [2026-09-13 사장님 «위치가 지맘대로 바뀌었다 돌아온다»] 알림이 오면 공지가 위로 밀렸다가 내려오던 것.
            → 공지를 «맨 아래 고정». 알림은 공지 «위»로 쌓이고(최신이 공지 바로 위), 사라져도 공지는 그 자리. 방송 ON 동안 상시. */}
        {showPin ? (
          <div
            style={{
              maxWidth: `${WIDGET_W}px`, boxSizing: "border-box",            // [09-16] 폭 자동 — 글자만큼만 (09-21: 퍼센트 → 픽셀)
              display: "flex", alignItems: "center", gap: "10px",
              padding: "17px 20px 17px 16px", marginTop: "4px",               // [09-16] 좌우 여백을 줄여 글자를 1px이라도 크게(공지는 길다)
              borderRadius: "999px",
              background: "rgba(123, 45, 67, 0.45)",                                  // 흐림 없음 — 뒤가 그대로 비침
              boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
              border: "1.5px solid rgba(255,217,224,0.6)",
              color: "#fff", textShadow: TEXT_SHADOW,
              // [2026-09-16 사장님 「이 정도는 한 줄로 다 뜨게」] 길면 글자를 줄여 한 줄에 맞춘다(최소 27px)
              // [2026-09-20] 📢 안내와 같은 기준 — feedPinLayout 이 한 줄/2줄·글자·폭을 정한다
              fontSize: `${feedPinLayout(pinShown).fontSize}px`, fontWeight: 900, lineHeight: 1.25, wordBreak: "keep-all",
            }}
          >
            <span style={{ flexShrink: 0, fontSize: "26px", textShadow: "none" }}>📌</span>
            <span style={{ minWidth: 0, maxWidth: `${feedPinLayout(pinShown).maxWidth}px`, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{pinShown}</span>
          </div>
        ) : null}
      </div>
      <style>{`
        @keyframes ruruConfetti { 0% { transform: translate(0, 0) rotate(0deg); opacity: 1; } 100% { transform: translate(var(--tx), var(--ty)) rotate(var(--r)); opacity: 0; } }
        @keyframes ruruCurtain { from { clip-path: inset(0 100% 0 0 round 999px); transform: translateX(-10px); opacity: 0.7; } to { clip-path: inset(0 0 0 0 round 999px); transform: translateX(0); opacity: 1; } }
        @keyframes ruruCurtainOut { from { clip-path: inset(0 0 0 0 round 999px); opacity: 1; } to { clip-path: inset(0 0 0 100% round 999px); opacity: 0; } }
        @keyframes ruruShine   { from { transform: translateX(-120%) skewX(-12deg); } to { transform: translateX(330%) skewX(-12deg); } }
        @keyframes ruruGlow    { 0% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 0 var(--ruru-glow); } 35% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 26px 3px var(--ruru-glow); } 100% { box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 0 rgba(0,0,0,0); } }
        @keyframes ruruVerbPop { from { opacity: 0; transform: scale(1.5); } 60% { opacity: 1; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
