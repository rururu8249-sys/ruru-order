"use client";

// components/admin-live/BroadcastScreenSettingsTab.tsx
// [2026-09-12] 설정 › 📺 방송 화면 — 프리즘(브라우저 소스)에 얹는 위젯 «주소·크기·옵션»을 한자리에.
//
//   왜: 위젯 주소 복사가 상품관리 팝업·방송패널·이벤트 화면에 흩어져 있고, 새 「주문·입금 알림」 위젯은
//       주소를 얻을 곳이 아예 없었다. Streamlabs 처럼 «위젯마다 카드 하나 = 맨 위에 주소, 아래에 옵션» 으로 모은다.
//   저장 없음: 옵션은 주소에 붙는 값(?toast=0)이라 프리즘에 한 번 붙여넣으면 끝. DB·settings 무접촉.
//     · 방송마다 바뀌는 것(📌 고정 공지, 상품 카드 ON/OFF)은 여기가 아니라 방송 콘솔에서(방송의 속성이라서).
//   ⚠ 돈·주문·입금·정산 로직 없음. 읽기 전용 안내 화면.
//
//   권장 크기 근거(실제 위젯 코드):
//     · 상품 카드: ProductWidgetClient CARD_W 200 · CARD_H 387(사진 3:4 최대 267 + 띠 120) · MARGIN 24 → 224 × 412
//     · 주문·입금 알림: OrderFeedWidgetClient WIDGET_W 640 + 왼쪽 8 · 한 줄 ≈ 80px × 3 + 간격 → 660 × 280
//     둘 다 창이 더 작으면 비율대로 축소(transform: scale)되어 잘리지 않는다.

import { useEffect, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";

type Props = {
  /** 「🎉 이벤트」 화면 열기 — 이벤트 오버레이 주소는 이벤트마다 달라 거기서 복사 */
  onOpenEvent?: () => void;
};

const cardClass = "rounded-2xl border border-line bg-surface p-5";
const urlBoxClass = "min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-[12px] font-bold text-ink";
const smallBtn = "h-9 shrink-0 rounded-xl px-3 text-xs font-black transition";

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    showAdminToast(`${label} 주소를 복사했습니다. 프리즘 브라우저 소스에 붙여넣으세요.`, "success");
  } catch {
    showAdminToast("복사 실패 — 주소를 드래그해서 직접 복사해주세요.", "warning");
  }
}

function UrlRow({ url, label, previewUrl }: { url: string; label: string; previewUrl: string }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <div className={urlBoxClass} title={url}>{url || "…"}</div>
      <button
        type="button"
        onClick={() => void copyToClipboard(url, label)}
        disabled={!url}
        className={`${smallBtn} bg-rose-deep text-white hover:opacity-90 disabled:bg-line disabled:text-ink-mute`}
      >
        복사
      </button>
      <a
        href={previewUrl || "#"}
        target="_blank"
        rel="noreferrer"
        className={`${smallBtn} flex items-center border border-line bg-surface text-ink-soft hover:bg-surface-2`}
        title="새 창에서 견본을 띄웁니다 (방송이 없어도 모양 확인용)"
      >
        미리보기 ↗
      </a>
    </div>
  );
}

function SizeLine({ w, h, note }: { w: number; h: number; note: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold text-ink-soft">
      <span className="rounded-lg bg-surface-2 px-2 py-1 font-black text-ink">권장 크기 · 폭 {w} × 높이 {h}</span>
      <span className="text-ink-mute">{note}</span>
    </div>
  );
}

export default function BroadcastScreenSettingsTab({ onOpenEvent }: Props) {
  const [origin, setOrigin] = useState("");
  const [toastOff, setToastOff] = useState(true);   // 두 위젯을 같이 쓰는 게 기본 → 상품 카드 말풍선은 끄는 쪽이 기본

  useEffect(() => {
    try { setOrigin(window.location.origin); } catch { setOrigin(""); }
  }, []);

  const productUrl = origin ? `${origin}/product-widget${toastOff ? "?toast=0" : ""}` : "";
  const productPreview = origin ? `${origin}/product-widget?preview=1${toastOff ? "&toast=0" : ""}` : "";
  const feedUrl = origin ? `${origin}/order-feed-widget` : "";
  const feedPreview = origin ? `${origin}/order-feed-widget?preview=1` : "";

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className="text-base font-black text-ink">📺 방송 화면 (프리즘 브라우저 소스)</h2>
        <p className="mt-1 text-xs font-bold leading-5 text-ink-mute">
          방송 화면 위에 얹는 위젯의 <b className="text-ink-soft">주소·크기</b>입니다. 저장할 것은 없고, 주소를 프리즘에 한 번 붙여넣으면 끝입니다.
          방송마다 바뀌는 것(📌 고정 공지 · 상품 카드 ON/OFF)은 <b className="text-ink-soft">방송 콘솔</b>에서 합니다.
        </p>
        <ol className="mt-3 grid gap-2 text-[12px] font-bold leading-5 text-ink-soft sm:grid-cols-2">
          <li className="rounded-xl bg-surface-2 px-3 py-2"><b className="text-ink">①</b> 프리즘 › <b className="text-ink">소스 추가</b> › <b className="text-ink">브라우저 소스</b></li>
          <li className="rounded-xl bg-surface-2 px-3 py-2"><b className="text-ink">②</b> 아래 주소를 <b className="text-ink">복사 → URL 칸에 붙여넣기</b></li>
          <li className="rounded-xl bg-surface-2 px-3 py-2"><b className="text-ink">③</b> 폭·높이를 <b className="text-ink">권장 크기</b>로 (더 작게 잡으면 비율대로 축소)</li>
          <li className="rounded-xl bg-surface-2 px-3 py-2"><b className="text-ink">④</b> 배경은 자동으로 투명 · 위치는 화면에서 끌어서</li>
        </ol>
      </div>

      {/* ── 1. 상품 카드 ── */}
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-ink">🛍 상품 카드</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
              지금 진열 중인 상품의 사진·상품명·색상/사이즈·남은 수량·금액. 고정 상품이 있으면 그 상품, 없으면 진열 순서대로 돌아갑니다.
              <b className="text-ink-soft"> 방송 중에만</b> 뜹니다.
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-[11px] font-black text-ink-soft">방송 콘솔 「📺 상품 카드 ON/OFF」</span>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-3">
          <input
            id="broadcast-screen-toast-off"
            type="checkbox"
            checked={toastOff}
            onChange={(e) => setToastOff(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-rose-deep"
          />
          <span className="text-[12px] font-bold leading-5 text-ink-soft">
            <b className="text-ink">주문·입금 말풍선 끄기</b> <span className="font-mono text-[11px] text-ink-mute">?toast=0</span>
            <br />
            아래 「주문·입금 알림」 위젯을 같이 쓰면 같은 알림이 두 번 뜨니 끄는 게 좋습니다. 체크를 바꾸면 주소가 바뀌니 <b className="text-ink">다시 복사해서 프리즘에 넣어주세요.</b>
          </span>
        </label>

        <UrlRow url={productUrl} label="상품 카드" previewUrl={productPreview} />
        <SizeLine w={224} h={412} note="사진 3:4 + 아래 글자 띠. 세로·가로 방송 모두 오른쪽 위에 두는 게 일반적입니다." />
      </div>

      {/* ── 2. 주문·입금 알림 ── */}
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-black text-ink">💬 주문·입금 알림</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
              주문 완료 · 입금 확인 · 카드결제를 유튜브 채팅처럼 띄웁니다. 최근 3줄, 10초 뒤 사라짐.
              <b className="text-ink-soft"> 금액·옵션·수량은 안 나가고</b> 닉네임 + 상품명만. 유튜브 API를 안 써서 채팅봇 한도와 무관합니다.
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-[11px] font-black text-ink-soft">방송 콘솔 「제목·URL 수정 ▼」 › 📌 고정 공지</span>
        </div>
        <div className="mt-3 rounded-xl border border-rose-line bg-rose-soft/40 px-3 py-2 text-[12px] font-bold leading-5 text-ink-soft">
          📌 <b className="text-ink">고정 공지</b>는 이번 방송 동안 맨 위에 붙는 한 줄(60자)입니다. 방송 콘솔에서 쓰고, 방송이 끝나면 같이 사라집니다.
          공지가 있으면 알림 2줄 + 공지 1줄 = 3줄.
        </div>
        <UrlRow url={feedUrl} label="주문·입금 알림" previewUrl={feedPreview} />
        <SizeLine w={660} h={280} note="왼쪽 아래 기준으로 쌓입니다. 채팅창 바로 위에 두면 채팅처럼 자연스럽습니다." />
      </div>

      {/* ── 3. 이벤트 오버레이 ── */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-ink">🎉 이벤트 오버레이 (룰렛 · 서바이벌 · 레이스 · 뽑기)</div>
            <div className="mt-1 text-xs font-bold leading-5 text-ink-mute">
              이벤트마다 주소가 달라서 <b className="text-ink-soft">「🎉 이벤트」 화면의 「방송용 위젯주소 › 복사」</b>에서 가져옵니다.
            </div>
          </div>
          {onOpenEvent ? (
            <button type="button" onClick={onOpenEvent} className={`${smallBtn} border border-line bg-surface text-ink-soft hover:bg-surface-2`}>
              이벤트 열기 ›
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
