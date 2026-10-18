"use client";

// components/customer/CustomerAccessBlockGuard.tsx
// 목적: 차단 고객이 저장된 카카오/고객 전화번호로 고객 화면에 진입하지 못하도록 공통 차단 화면 표시
// 주의: 주문/입금/배송/정산/금액 로직 변경 없음. 고객 화면 접근 표시만 제어.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import ShopContactLink from "@/components/customer/ShopContactLink";
import { contactGuideSentence } from "@/lib/shopInfo";
import { useShopInfo } from "@/lib/useShopInfo";
import { useCustomerStageRestyle } from "@/lib/useCustomerUiStage";

type BlockState = {
  checking: boolean;
  blocked: boolean;
  phone: string;
  message: string;
};

const INITIAL_STATE: BlockState = {
  checking: false,
  blocked: false,
  phone: "",
  message: "",
};

const CUSTOMER_ROUTES = new Set(["/", "/home", "/order", "/myorder", "/group-buy", "/notice"]);
// [2026-09-08] 문의 방식은 설정 › 상점 정보를 따른다(NEXT_PUBLIC_KAKAO_CHANNEL_URL 은 lib/shopInfo 기본값으로 이동)

function digitsOnly(value: unknown) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function readStoredCustomerPhone() {
  if (typeof window === "undefined") return "";

  const directPhone = digitsOnly(window.localStorage.getItem("ruru_customer_phone"));
  if (directPhone) return directPhone;

  try {
    const sessionText = window.localStorage.getItem("ruru_customer_session");
    const session = sessionText ? JSON.parse(sessionText) : null;
    return digitsOnly(session?.customer_phone);
  } catch {
    return "";
  }
}

function clearCustomerLoginStorage() {
  if (typeof window === "undefined") return;

  [
    "ruru_customer_session",
    "ruru_customer_phone",
    "ruru_youtube_nickname",
    "ruru_customer_name",
    "ruru_customer_zipcode",
    "ruru_customer_address",
    "ruru_customer_detail_address",
    "ruru_kakao_id",
    "ruru_kakao_nickname",
    "ruru_customer_session_version",
    "ruru_youtube_nickname_confirm_version",
  ].forEach((key) => window.localStorage.removeItem(key));
}

function shouldGuardPath(pathname: string | null) {
  const path = pathname || "/";

  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/api")) return false;
  if (path.startsWith("/auth/kakao")) return false;

  return CUSTOMER_ROUTES.has(path);
}

export default function CustomerAccessBlockGuard() {
  // [㉜ 5단계] ?preview=s5 에서만 새 모양(로즈→흑백·13px 미만→13px·그림자 정리). 꺼지면 원래 스타일 그대로.
  const { on: v5, s: s5, c: c5 } = useCustomerStageRestyle("s5", { keepShadow: true });
  const shopInfo = useShopInfo();
  const pathname = usePathname();
  const shouldGuard = useMemo(() => shouldGuardPath(pathname), [pathname]);
  const [state, setState] = useState<BlockState>(INITIAL_STATE);

  useEffect(() => {
    if (!shouldGuard) {
      setState(INITIAL_STATE);
      return;
    }

    const phone = readStoredCustomerPhone();

    if (phone.length < 9 || phone.length > 11) {
      setState(INITIAL_STATE);
      return;
    }

    let alive = true;

    setState({
      checking: true,
      blocked: false,
      phone,
      message: "고객정보 확인 중입니다.",
    });

    const checkBlocked = async () => {
      try {
        const response = await fetch(`/api/customer-block-check?phone=${encodeURIComponent(phone)}`, {
          cache: "no-store",
        });

        const payload = await response.json().catch(() => null);

        if (!alive) return;

        if (!response.ok || !payload?.ok) {
          setState(INITIAL_STATE);
          return;
        }

        setState({
          checking: false,
          blocked: Boolean(payload.blocked),
          phone,
          message: String(payload.message || ""),
        });
      } catch {
        if (!alive) return;
        setState(INITIAL_STATE);
      }
    };

    void checkBlocked();

    return () => {
      alive = false;
    };
  }, [shouldGuard, pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (state.checking || state.blocked) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }

    return undefined;
  }, [state.checking, state.blocked]);

  if (!shouldGuard) return null;

  if (state.checking) {
    return null;
  }

  if (!state.blocked) return null;

  return (
    <div className={c5("fixed inset-0 z-[9999] overflow-y-auto bg-black px-4 py-5 text-white")}>
      <div className={c5("flex min-h-dvh items-center justify-center")}>
        <section className={c5("max-h-[calc(100dvh-40px)] w-full max-w-[390px] overflow-y-auto rounded-[26px] border border-red-300/70 bg-neutral-950 p-5 shadow-2xl")}>
          <div className={c5("text-center")}>
            <div className={c5("text-[10px] font-black uppercase tracking-[0.38em] text-red-300")}>Access Restricted</div>
            <h1 className={c5("mt-3 text-[30px] font-black leading-[1.08] tracking-[-0.06em] text-white")}>
              접속이 제한되어
              <br />
              있습니다.
            </h1>
            <p className={c5("mt-4 text-[14px] font-bold leading-6 text-neutral-300")}>
              현재 주문서 작성 및 고객 화면 이용이 제한된 상태입니다.
              <br />
              문의는 카톡채널로 부탁드립니다.
            </p>
          </div>

          <div className={c5("mt-5 rounded-[22px] bg-red-50 px-4 py-5 text-slate-950")}>
            <div className={c5("flex items-start gap-3")}>
              <div className={c5("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-2xl text-white")}>
                {v5 ? <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg> : "🚫"}
              </div>
              <div className={c5("min-w-0")}>
                <div className={c5("text-[10px] font-black uppercase tracking-[0.28em] text-red-500")}>Order Limited</div>
                <h2 className={c5("mt-1 text-[22px] font-black leading-[1.25] tracking-[-0.05em] text-slate-950")}>
                  현재 주문서 작성이 제한되어 있습니다.
                </h2>
                <p className={c5("mt-3 text-[14px] font-black leading-6 text-red-700")}>
                  운영 확인 후 안내드리겠습니다.
                  <br />
                  {contactGuideSentence(shopInfo)}
                </p>
              </div>
            </div>

            <ShopContactLink
              labelForm="long"
              className={c5("mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 text-[15px] font-black text-white shadow-lg")}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              clearCustomerLoginStorage();
              window.location.href = "/";
            }}
            className={c5("mt-4 h-12 w-full rounded-2xl bg-white text-[15px] font-black text-slate-950 shadow-lg")}
          >
            로그인 정보 지우고 처음으로
          </button>

          <p className={c5("mt-4 text-center text-[11px] font-bold leading-5 text-neutral-500")}>
            주문 및 고객 화면 이용 관련 문의는 카톡채널로 부탁드립니다.
          </p>
        </section>
      </div>
    </div>
  );
}
