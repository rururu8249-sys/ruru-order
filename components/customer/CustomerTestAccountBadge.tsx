"use client";

import { useEffect, useState } from "react";

type BadgeState = {
  loading: boolean;
  visible: boolean;
  label: string;
};

function readCustomerPhoneFromStorage() {
  if (typeof window === "undefined") return "";

  return String(window.localStorage.getItem("ruru_customer_phone") || "").replace(/[^0-9]/g, "");
}

export default function CustomerTestAccountBadge() {
  const [state, setState] = useState<BadgeState>({
    loading: true,
    visible: false,
    label: "",
  });

  useEffect(() => {
    let alive = true;

    const checkAccount = async () => {
      const phone = readCustomerPhoneFromStorage();

      if (phone.length < 10) {
        if (alive) {
          setState({
            loading: false,
            visible: false,
            label: "",
          });
        }
        return;
      }

      try {
        const response = await fetch(`/api/customer-test-account?phone=${encodeURIComponent(phone)}`, {
          method: "GET",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => null);

        if (!alive) return;

        setState({
          loading: false,
          visible: Boolean(payload?.ok && payload?.isOperatorTestAccount),
          label: String(payload?.displayLabel || "관리자").trim() || "관리자",
        });
      } catch {
        if (!alive) return;

        setState({
          loading: false,
          visible: false,
          label: "",
        });
      }
    };

    void checkAccount();

    const interval = window.setInterval(() => {
      void checkAccount();
    }, 5000);

    const onFocus = () => {
      void checkAccount();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (state.loading || !state.visible) return null;

  return (
    <div className="inline-flex shrink-0 items-center justify-end gap-1 text-right text-[15px] font-black leading-tight text-slate-950 whitespace-nowrap">
      💼 {state.label}
    </div>
  );
}
