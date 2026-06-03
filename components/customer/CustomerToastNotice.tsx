"use client";

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

export default function CustomerToastNotice({ open, type = "info", message, onClose }: Props) {
  if (!open || !message) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-[200] w-[calc(100%-32px)] max-w-[520px] -translate-x-1/2">
      <section className={`rounded-[22px] border-2 p-4 shadow-2xl ring-4 ring-black/5 backdrop-blur ${NOTICE_STYLE[type]}`}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 text-2xl">{NOTICE_ICON[type]}</div>

          <div className="min-w-0 flex-1 whitespace-pre-line break-keep text-[16px] font-black leading-relaxed">
            {message}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl bg-white/70 px-3 py-2 text-[13px] font-black text-slate-600 active:scale-[0.98]"
          >
            닫기
          </button>
        </div>
      </section>
    </div>
  );
}
