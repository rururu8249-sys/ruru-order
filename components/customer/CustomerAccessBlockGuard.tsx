"use client";

// components/customer/CustomerAccessBlockGuard.tsx
// 목적: 차단 고객이 저장된 카카오/고객 전화번호로 고객 화면에 진입하지 못하도록 공통 차단 화면 표시
// 주의: 주문/입금/배송/정산/금액 로직 변경 없음. 고객 화면 접근 표시만 제어.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

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
const KAKAO_CHANNEL_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || "https://pf.kakao.com/_RMxaqX";

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
  const pathname = usePathname();
  const shouldGuard = useMemo(() => shouldGuardPath(pathname), [pathname]);
  const [state, setState] = useState<BlockState>(INITIAL_STATE);

  useEffect(() => {
    if (!shouldGuard) {
      setState(INITIAL_STATE);
      return;
    }

    const phone = readStoredCustomerPhone();

    if (phone.length < 10 || phone.length > 11) {
      setState(INITIAL_STATE);
      return;
    }

    let alive = true;

    setState({
      checking: true,
      blocked: false,
      phone,
      message: "고객정보 확인중입니다.",
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
    return (
      <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black px-4 py-5 text-white">
        <div className="flex min-h-dvh items-center justify-center">
          <section className="w-full max-w-[360px] rounded-[24px] border border-yellow-400/70 bg-neutral-950 px-5 py-6 text-center shadow-2xl">
            <div className="text-[11px] font-black tracking-[0.32em] text-yellow-300">RURU CHECK</div>
            <h1 className="mt-3 text-[24px] font-black tracking-[-0.05em] text-white">루루동이 확인중</h1>
            <p className="mt-3 text-[13px] font-bold leading-6 text-neutral-300">
              고객정보와 접속 가능 상태를 확인하고 있습니다.
            </p>
          </section>
        </div>
      </div>
    );
  }

  if (!state.blocked) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black px-4 py-5 text-white">
      <div className="flex min-h-dvh items-center justify-center">
        <section className="max-h-[calc(100dvh-40px)] w-full max-w-[390px] overflow-y-auto rounded-[26px] border border-red-300/70 bg-neutral-950 p-5 shadow-2xl">
          <div className="text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.38em] text-red-300">Access Restricted</div>
            <h1 className="mt-3 text-[30px] font-black leading-[1.08] tracking-[-0.06em] text-white">
              접속이 제한되어
              <br />
              있습니다.
            </h1>
            <p className="mt-4 text-[14px] font-bold leading-6 text-neutral-300">
              현재 주문서 작성 및 고객 화면 이용이 제한된 상태입니다.
              <br />
              문의는 카톡채널로 부탁드립니다.
            </p>
          </div>

          <div className="mt-5 rounded-[22px] bg-red-50 px-4 py-5 text-slate-950">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-2xl text-white">
                🚫
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-red-500">Order Limited</div>
                <h2 className="mt-1 text-[22px] font-black leading-[1.25] tracking-[-0.05em] text-slate-950">
                  현재 주문서 작성이 제한되어 있습니다.
                </h2>
                <p className="mt-3 text-[14px] font-black leading-6 text-red-700">
                  운영 확인 후 안내드리겠습니다.
                  <br />
                  문의는 카톡채널로 부탁드립니다.
                </p>
              </div>
            </div>

            <a
              href={KAKAO_CHANNEL_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 text-[15px] font-black text-white shadow-lg"
            >
              카톡채널 문의하기
            </a>
          </div>

          <button
            type="button"
            onClick={() => {
              clearCustomerLoginStorage();
              window.location.href = "/";
            }}
            className="mt-4 h-12 w-full rounded-2xl bg-white text-[15px] font-black text-slate-950 shadow-lg"
          >
            로그인 정보 지우고 처음으로
          </button>

          <p className="mt-4 text-center text-[11px] font-bold leading-5 text-neutral-500">
            주문 및 고객 화면 이용 관련 문의는 카톡채널로 부탁드립니다.
          </p>
        </section>
      </div>
    </div>
  );
}
