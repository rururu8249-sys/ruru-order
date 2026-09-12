"use client";

// components/admin-live/BroadcastScreenSettingsTab.tsx
// [2026-09-12] 설정 › 📺 방송 화면 — 프리즘(브라우저 소스)에 얹는 위젯 «주소·크기»를 한자리에.
// [2026-09-13 사장님] «뭔 말인지 하나도 모르겠다» → 개발자 말(?toast=0, 체크박스, 옵션) 전부 제거.
//   화면에 남긴 것: 위젯 2개 = 주소 2개 + 복사 + 미리보기 + 크기. 그리고 프리즘에 넣는 순서 한 줄.
//   상품 카드의 주문/입금 말풍선은 위젯 코드에서 기본 OFF 로 바꿨다(알림 위젯이 그 역할) → 주소 옵션이 필요 없어짐.
//
//   저장 없음. DB·settings 무접촉. 방송마다 바뀌는 📌 공지는 «방송의 속성»이라 방송 콘솔에서(여기선 한 줄로만 안내).
//   ⚠ 돈·주문·입금·정산 로직 없음. 읽기 전용 안내 화면.
//
//   권장 크기 근거(실제 위젯 코드) — [2026-09-13] «프리즘 네모 크기 = 위젯 크기» (두 위젯 공통, 비율 고정으로 확대/축소):
//     · 상품 카드: 카드 고정 비율 200×387. 세로 방송(1080×1920)에서 화면 폭 26% = 280 → 280 × 542
//       (사장님이 «잘 나온다»고 한 09-13 실방송 캡처 실측: 카드 폭 ≈ 화면 폭 26%)
//     · 주문·입금 알림: OrderFeedWidgetClient BOX_W 660 × BOX_H 280 이 1배 (WIDGET_W 640 + 여백, 3줄 ≈ 240)

import { useEffect, useState } from "react";
import { showAdminToast } from "@/lib/adminToast";

type Props = {
  /** 「🎉 이벤트」 화면 열기 — 이벤트 오버레이 주소는 이벤트마다 달라 거기서 복사 */
  onOpenEvent?: () => void;
};

const cardClass = "rounded-2xl border border-line bg-surface p-5";
const urlBoxClass = "min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-mono text-[13px] font-bold text-ink";
const smallBtn = "h-10 shrink-0 rounded-xl px-4 text-sm font-black transition";

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    showAdminToast(`「${label}」 주소를 복사했습니다. 프리즘 브라우저 소스의 URL 칸에 붙여넣으세요.`, "success");
  } catch {
    showAdminToast("복사 실패 — 주소를 드래그해서 직접 복사해주세요.", "warning");
  }
}

function WidgetCard({
  icon, title, what, url, previewUrl, w, h, where, extra,
}: {
  icon: string; title: string; what: string; url: string; previewUrl: string; w: number; h: number; where: string; extra?: React.ReactNode;
}) {
  return (
    <div className={cardClass}>
      <div className="text-base font-black text-ink">{icon} {title}</div>
      <div className="mt-1 text-[13px] font-bold leading-6 text-ink-soft">{what}</div>

      <div className="mt-4 flex items-center gap-2">
        <div className={urlBoxClass} title={url}>{url || "…"}</div>
        <button
          type="button"
          onClick={() => void copyToClipboard(url, title)}
          disabled={!url}
          className={`${smallBtn} bg-rose-deep text-white hover:opacity-90 disabled:bg-line disabled:text-ink-mute`}
        >
          주소 복사
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

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold text-ink-soft">
        <span className="rounded-lg bg-surface-2 px-2.5 py-1 font-black text-ink">프리즘 크기 · 폭 {w} × 높이 {h}</span>
        <span className="text-ink-mute">{where}</span>
      </div>
      {extra}
    </div>
  );
}

export default function BroadcastScreenSettingsTab({ onOpenEvent }: Props) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    try { setOrigin(window.location.origin); } catch { setOrigin(""); }
  }, []);

  const productUrl = origin ? `${origin}/product-widget` : "";
  const feedUrl = origin ? `${origin}/order-feed-widget` : "";

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className="text-base font-black text-ink">📺 방송 화면에 띄우는 위젯</h2>
        <p className="mt-1 text-[13px] font-bold leading-6 text-ink-soft">
          위젯은 <b className="text-ink">2개</b>이고 각각 주소가 하나씩 있습니다. 프리즘에서 <b className="text-ink">소스 추가 › 브라우저 소스</b>를 누르고
          주소를 붙여넣은 뒤, 폭·높이를 아래 숫자로 적으면 끝입니다. 배경은 저절로 투명하게 나오고, 위치는 프리즘 화면에서 끌어서 정합니다.
          <b className="text-ink">네모 크기가 곧 위젯 크기</b>입니다 — 네모를 키우면 그 비율로 커지고, 줄이면 작아집니다. 여기서 저장할 것은 없습니다.
        </p>
      </div>

      <WidgetCard
        icon="🛍"
        title="상품 카드"
        what="지금 파는 상품의 사진·이름·색상/사이즈·남은 개수·가격이 카드로 뜹니다. 방송 중에만 보이고, 켜고 끄는 건 방송 컨트롤타워의 「📺 상품 카드 ON/OFF」 버튼입니다."
        url={productUrl}
        previewUrl={origin ? `${origin}/product-widget?preview=1` : ""}
        w={280}
        h={542}
        where="세로 방송(1080×1920) 기준 · 화면 폭의 약 1/4. 보통 오른쪽 위에 둡니다."
      />

      <WidgetCard
        icon="💬"
        title="주문·입금 알림"
        what="손님이 주문하거나 입금(카드결제)하면 「OO님 주문 감사합니다」가 유튜브 채팅처럼 뜹니다. 3줄까지, 10초 뒤 사라집니다. 금액·옵션·개수는 안 나옵니다."
        url={feedUrl}
        previewUrl={origin ? `${origin}/order-feed-widget?preview=1` : ""}
        w={660}
        h={280}
        where="세로 방송(1080×1920) 기준. 채팅창 바로 위에 두면 채팅처럼 보입니다."
        extra={
          <div className="mt-3 rounded-xl border border-rose-line bg-rose-soft/40 px-3 py-2.5 text-[13px] font-bold leading-6 text-ink-soft">
            📌 알림 맨 위에 <b className="text-ink">공지 한 줄</b>을 붙일 수 있습니다. 방송마다 내용이 달라서(예: 「오늘 9시 마감」)
            방송을 시작한 뒤 <b className="text-ink">방송 컨트롤타워 › 제목·URL 수정 ▼ › 📌 방송 화면 공지</b>에 쓰면 바로 뜨고, 방송이 끝나면 자동으로 지워집니다.
          </div>
        }
      />

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-black text-ink">🎉 이벤트 (룰렛 · 서바이벌 · 레이스 · 뽑기)</div>
            <div className="mt-1 text-[13px] font-bold leading-6 text-ink-soft">
              이벤트 화면 주소는 이벤트마다 달라서 <b className="text-ink">이벤트 화면의 「방송용 위젯주소 › 복사」</b>에서 가져옵니다.
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
