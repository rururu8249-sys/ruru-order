// lib/customerToast.ts
// 목적: 고객 화면의 단순 안내를 브라우저 alert 대신 화면 안 토스트로 표시
// 주의: UI 전용. 주문 저장, 입금확인, 금액, 배송, 정산 로직 없음.

type CustomerToastType = "info" | "success" | "warning" | "error";

const TYPE_STYLE: Record<CustomerToastType, { border: string; bg: string; color: string; icon: string }> = {
  info: {
    border: "#bfdbfe",
    bg: "#eff6ff",
    color: "#1e40af",
    icon: "ℹ️",
  },
  success: {
    border: "#bbf7d0",
    bg: "#f0fdf4",
    color: "#166534",
    icon: "✅",
  },
  warning: {
    border: "#fde68a",
    bg: "#fffbeb",
    color: "#92400e",
    icon: "⚠️",
  },
  error: {
    border: "#fecaca",
    bg: "#fef2f2",
    color: "#991b1b",
    icon: "🚫",
  },
};

export function showCustomerToast(message: unknown, type: CustomerToastType = "info") {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const text = String(message ?? "").trim();
  if (!text) return;

  const style = TYPE_STYLE[type] || TYPE_STYLE.info;

  let container = document.getElementById("ruru-customer-toast-root");

  if (!container) {
    container = document.createElement("div");
    container.id = "ruru-customer-toast-root";
    container.style.position = "fixed";
    container.style.left = "50%";
    container.style.bottom = "24px";
    container.style.transform = "translateX(-50%)";
    container.style.zIndex = "9999";
    container.style.display = "grid";
    container.style.gap = "10px";
    container.style.width = "calc(100% - 32px)";
    container.style.maxWidth = "420px";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.style.display = "flex";
  toast.style.alignItems = "flex-start";
  toast.style.gap = "10px";
  toast.style.border = `1px solid ${style.border}`;
  toast.style.background = style.bg;
  toast.style.color = style.color;
  toast.style.borderRadius = "20px";
  toast.style.padding = "14px 16px";
  toast.style.boxShadow = "0 18px 45px rgba(15, 23, 42, 0.18)";
  toast.style.fontSize = "14px";
  toast.style.fontWeight = "900";
  toast.style.lineHeight = "1.55";
  toast.style.whiteSpace = "pre-line";
  toast.style.wordBreak = "break-all";

  const icon = document.createElement("div");
  icon.textContent = style.icon;
  icon.style.flexShrink = "0";
  icon.style.fontSize = "18px";

  const body = document.createElement("div");
  body.textContent = text;
  body.style.minWidth = "0";
  body.style.flex = "1";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "닫기";
  close.style.marginLeft = "8px";
  close.style.flexShrink = "0";
  close.style.border = "0";
  close.style.borderRadius = "12px";
  close.style.background = "rgba(255,255,255,0.8)";
  close.style.color = "#475569";
  close.style.padding = "5px 9px";
  close.style.fontSize = "12px";
  close.style.fontWeight = "900";
  close.style.cursor = "pointer";

  const removeToast = () => {
    toast.remove();
    if (container && container.childElementCount === 0) {
      container.remove();
    }
  };

  close.addEventListener("click", removeToast);

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(close);
  container.appendChild(toast);

  window.setTimeout(removeToast, 4200);
}
