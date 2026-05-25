export type AdminConfirmTone = "danger" | "warning" | "info";

export type AdminConfirmRequest = {
  id: string;
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: AdminConfirmTone;
  resolve: (ok: boolean) => void;
};

export const ADMIN_CONFIRM_EVENT = "ruru-admin-confirm-request";

function makeConfirmId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `confirm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function showAdminConfirm(
  message: string,
  options: {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    tone?: AdminConfirmTone;
  } = {}
): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const request: AdminConfirmRequest = {
      id: makeConfirmId(),
      message,
      title: options.title,
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      tone: options.tone,
      resolve,
    };

    window.dispatchEvent(new CustomEvent<AdminConfirmRequest>(ADMIN_CONFIRM_EVENT, { detail: request }));
  });
}
