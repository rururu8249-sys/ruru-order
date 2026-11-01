"use client";
// components/customer/PromoPopup.tsx
// 2026-11-01 — 손님 화면 접속 때 «안내 팝업»(처음 쓰임: 유튜브 채널 변경 안내).
// 내용·버튼·켜기/끄기·끝나는 날 = 설정 › 손님 공지 「안내 팝업」(settings promo_popup_v1, lib/promoPopup).
// · 버튼 누르면 그 주소로 이동(유튜브·밴드는 앱으로, lib/openLinkInApp) + 24시간 안 뜸.
// · 「24시간 동안 열지 않기」 → 24시간 안 뜸. 「닫기」 → 이번 접속에서만 닫힘.
// · 사장님이 내용을 바꿔 저장하면(version 바뀜) 24시간 기록과 상관없이 다시 뜸.
// 브라우저 저장소는 «이 손님이 이미 봤는지» 편의용만. 돈/주문/입금/배송 로직 무관.

import { useEffect, useState } from "react";
import PromoPopupCard from "@/components/customer/PromoPopupCard";
import { openLinkInApp } from "@/lib/openLinkInApp";
import { isPromoHidden, isPromoPopupLive, promoHideRecord, type PromoPopupConfig } from "@/lib/promoPopup";

const HIDE_KEY = "ruru_promo_popup_hide";
const SESSION_KEY = "ruru_promo_popup_closed";

export default function PromoPopup({ cfg, blocked }: { cfg: PromoPopupConfig | null; blocked: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!cfg || !isPromoPopupLive(cfg, Date.now())) {
      setOpen(false);
      return;
    }
    let show = false;
    try {
      show = !isPromoHidden(localStorage.getItem(HIDE_KEY), cfg.version, Date.now()) && sessionStorage.getItem(SESSION_KEY) !== cfg.version;
    } catch {
      show = false; // 저장소를 못 쓰면 매번 뜨는 것보다 안 띄우는 게 낫다
    }
    setOpen(show);
  }, [cfg]);

  if (!cfg || !open || blocked) return null;

  const hide24 = () => {
    try { localStorage.setItem(HIDE_KEY, promoHideRecord(cfg.version, Date.now())); } catch { /* 무시 */ }
    setOpen(false);
  };
  const closeForNow = () => {
    try { sessionStorage.setItem(SESSION_KEY, cfg.version); } catch { /* 무시 */ }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={cfg.title || "안내"}
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}
    >
      <PromoPopupCard
        cfg={cfg}
        onButton={(i) => {
          const url = cfg.buttons[i]?.url;
          hide24();
          if (url) openLinkInApp(url);
        }}
        onClose={closeForNow}
        onHide24={hide24}
      />
    </div>
  );
}
