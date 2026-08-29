"use client";

// [2026-08-29 사장님 요청] "실시간 접속중인 사람도 확인하고 싶다" + "왼쪽 사이드바에서 보이면 좋겠다"
//
// 안전
//   · 읽기 전용. /api/admin-live/presence GET 만 호출한다.
//   · 주문 / 입금 / 정산 / 배송 / 재고 데이터는 건드리지 않는다.
//   · 표가 없거나 오류가 나도 조용히 숨긴다(관리자 화면을 막지 않는다).

import { useEffect, useRef, useState } from "react";

type Visitor = {
  id: string;
  nickname: string;
  pageType: string;
  pageLabel: string;
  lastSeenAt: string;
};

type Payload = {
  ok?: boolean;
  available?: boolean;
  total?: number;
  byType?: { orderForm: number; orderLookup: number; admin: number; others: number };
  visitors?: Visitor[];
};

const POLL_MS = 20000;

function maskNickname(value: string) {
  const text = String(value || "").trim();
  if (!text) return "손님";
  const chars = Array.from(text);
  if (chars.length <= 1) return `${chars[0]}*`;
  if (chars.length <= 3) return `${chars[0]}**`;
  return `${chars.slice(0, 2).join("")}**`;
}

export default function AdminLiveSidebarPresence() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const load = async () => {
      if (stoppedRef.current) return;
      try {
        const res = await fetch("/api/admin-live/presence", { method: "GET", cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as Payload | null;
        if (!stoppedRef.current && payload?.ok) setData(payload);
      } catch {
        // 접속자 표시는 보조 기능이라 실패해도 무시한다.
      }
    };

    void load();
    const timer = window.setInterval(load, POLL_MS);

    return () => {
      stoppedRef.current = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!data || data.available === false) return null;

  const total = data.total ?? 0;
  const by = data.byType ?? { orderForm: 0, orderLookup: 0, admin: 0, others: 0 };
  const visitors = data.visitors ?? [];

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        title="지금 사이트에 들어와 있는 사람 (최근 2분 안에 신호가 온 접속)"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={total > 0 ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" : ""} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${total > 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black tracking-[0.18em] text-ink-mute">LIVE</span>
          <span className="block text-sm font-black text-ink">지금 접속 {total}명</span>
        </span>
        <span className="shrink-0 text-[10px] font-black text-ink-mute">{open ? "▲" : "▼"}</span>
      </button>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          { label: "주문서", value: by.orderForm },
          { label: "조회", value: by.orderLookup },
          { label: "기타", value: by.others },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-surface-2 px-1.5 py-1.5 text-center">
            <div className="text-[9px] font-black text-ink-mute">{item.label}</div>
            <div className="text-[13px] font-black text-ink">{item.value}</div>
          </div>
        ))}
      </div>

      {open ? (
        visitors.length === 0 ? (
          <div className="mt-2 rounded-xl bg-surface-2 px-2 py-3 text-center text-[11px] font-bold text-ink-mute">
            지금 접속중인 사람이 없습니다.
          </div>
        ) : (
          <ul className="mt-2 max-h-[220px] space-y-1 overflow-y-auto">
            {visitors.map((visitor) => (
              <li key={visitor.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-black text-ink">{maskNickname(visitor.nickname)}</span>
                <span className="shrink-0 text-[9.5px] font-black text-ink-mute">{visitor.pageLabel}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
