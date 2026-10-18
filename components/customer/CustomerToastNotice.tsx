"use client";
import { useCustomerStageRestyle } from "@/lib/useCustomerUiStage";

// components/customer/CustomerToastNotice.tsx
// 목적: 고객 화면에서 브라우저 alert 대신 화면 안 안내 표시
// 주의: UI 전용. 주문 저장, 금액, 배송비, 입금, 정산 로직 없음.

type NoticeType = "info" | "success" | "warning" | "error";

type Props = {
  open: boolean;
  type?: NoticeType;
  message: string;
  onClose: () => void;
};

const NOTICE_STYLE: Record<NoticeType, string> = {
  info: "border-coral-100 bg-coral-50 text-coral-800",
  success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  warning: "border-amber-100 bg-amber-50 text-amber-800",
  error: "border-red-100 bg-red-50 text-red-800",
};

const NOTICE_ICON: Record<NoticeType, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "🚫",
};

// [㉜ 5단계] 새 모양 아이콘 — 장식 이모지 대신 얇은 선(DESIGN §9-2). 색은 의미 색만(성공 초록·오류 빨강·그 외 검정).
function ToastIconV2({ type }: { type: NoticeType }) {
  const color = type === "success" ? "#007D48" : type === "error" ? "#D30005" : "#111111";
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      {type === "success" ? <path d="M8 12.5l2.7 2.7L16 9.8" /> : type === "info" ? <path d="M12 11v5M12 8h.01" /> : <path d="M12 7.5v5.5M12 16h.01" />}
    </svg>
  );
}

export default function CustomerToastNotice({ open, type = "info", message, onClose }: Props) {
  // [㉜ 5단계] ?preview=s5 에서만 새 모양(로즈→흑백·13px 미만→13px·그림자 정리). 꺼지면 원래 스타일 그대로.
  const { on: v5, s: s5, c: c5 } = useCustomerStageRestyle("s5", { keepShadow: true });
  if (!open || !message) return null;

  return (
    <div className={c5("fixed bottom-5 left-1/2 z-[200] w-[calc(100%-32px)] max-w-[520px] -translate-x-1/2")}>
      <section className={c5(`rounded-[22px] border-2 p-4 shadow-2xl ring-4 ring-black/5 backdrop-blur ${NOTICE_STYLE[type]}`)}>
        <div className={c5("flex items-start gap-3")}>
          <div className={c5("shrink-0 text-2xl")}>{v5 ? <ToastIconV2 type={type} /> : NOTICE_ICON[type]}</div>

          <div className={c5("min-w-0 flex-1 whitespace-pre-line break-keep text-[16px] font-black leading-relaxed")}>
            {message}
          </div>

          <button
            type="button"
            onClick={onClose}
            className={c5("shrink-0 rounded-xl bg-white/70 px-3 py-2 text-[13px] font-black text-slate-600 active:scale-[0.98]")}
          >
            닫기
          </button>
        </div>
      </section>
    </div>
  );
}
