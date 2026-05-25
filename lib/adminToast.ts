// lib/adminToast.ts
// 목적: 관리자 화면의 단순 alert를 브라우저 팝업 대신 화면 안 토스트로 표시
// 주의: UI 전용. 주문금액, 입금, 배송, 정산, 상태변경 로직 없음.

type AdminToastType = "info" | "success" | "warning" | "error";

const TYPE_STYLE: Record<AdminToastType, { border: string; bg: string; color: string; icon: string }> = {
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

function resolveType(message: string, type?: AdminToastType): AdminToastType {
  if (type) return type;

  if (
    message.includes("완료") ||
    message.includes("저장했습니다") ||
    message.includes("복사했습니다") ||
    message.includes("등록했습니다")
  ) {
    return "success";
  }

  if (
    message.includes("실패") ||
    message.includes("오류") ||
    message.includes("없습니다") ||
    message.includes("확인해주세요")
  ) {
    return "error";
  }

  if (
    message.includes("입력") ||
    message.includes("선택") ||
    message.includes("먼저")
  ) {
    return "warning";
  }

  return "info";
}

export function showAdminToast(message: unknown, type?: AdminToastType) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const text = String(message ?? "").trim();

  if (!text) return;

  const toastType = resolveType(text, type);
  const style = TYPE_STYLE[toastType];

  let container = document.getElementById("ruru-admin-toast-root");

  if (!container) {
    container = document.createElement("div");
    container.id = "ruru-admin-toast-root";
    container.style.position = "fixed";
    container.style.right = "24px";
    container.style.bottom = "24px";
    container.style.zIndex = "9999";
    container.style.display = "grid";
    container.style.gap = "10px";
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
  toast.style.borderRadius = "18px";
  toast.style.padding = "14px 16px";
  toast.style.boxShadow = "0 18px 45px rgba(15, 23, 42, 0.18)";
  toast.style.fontSize = "14px";
  toast.style.fontWeight = "800";
  toast.style.lineHeight = "1.55";
  toast.style.whiteSpace = "pre-line";
  toast.style.wordBreak = "keep-all";

  const icon = document.createElement("div");
  icon.textContent = style.icon;
  icon.style.flexShrink = "0";
  icon.style.fontSize = "18px";

  const body = document.createElement("div");
  body.textContent = text;
  body.style.minWidth = "0";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "닫기";
  close.style.marginLeft = "8px";
  close.style.flexShrink = "0";
  close.style.border = "0";
  close.style.borderRadius = "12px";
  close.style.background = "rgba(255,255,255,0.75)";
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

  window.setTimeout(removeToast, 3600);
}
