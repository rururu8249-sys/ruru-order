"use client";

// [2026-07-13 사장님 지침] 담김 현황 팝업 — 장바구니에 담기만 하고 아직 주문서 제출 안 한 선점 목록.
//   - 세션(장바구니) 단위 그룹: 전화번호(있으면) + 상품/옵션/수량 + 만료까지 남은 시간.
//   - [선점 해제]: 그 장바구니의 예약만 삭제(표시용) → 다른 고객 화면 남은 수량 즉시 복구.
//   ⚠️ 읽기/예약삭제 전용 — 진짜 재고·주문·돈 로직 무접촉. API는 관리자 인증 필수.

import { useEffect, useMemo, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";

type Props = { onClose: () => void };

type Hold = {
  sessionKey: string;
  phone: string;
  nickname: string;
  name: string;
  productName: string;
  color: string;
  size: string;
  qty: number;
  expiresAt: string;
  createdAt: string;
};

type Group = { sessionKey: string; phone: string; nickname: string; name: string; items: Hold[]; totalQty: number; minExpires: number };

const phoneFmt = (p: string) => {
  const d = String(p || "").replace(/[^0-9]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
};

const remainText = (expiresMs: number, nowMs: number) => {
  const m = Math.max(0, Math.round((expiresMs - nowMs) / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)}일 ${Math.floor((m % 1440) / 60)}시간 남음`;
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분 남음`;
  return `${m}분 남음`;
};

export default function LiveCartHoldsModal({ onClose }: Props) {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin-live/cart-holds", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        showAdminToast("담김 현황 불러오기 실패\n\n" + (json?.error?.message || `요청 실패(${res.status})`), "error");
        return;
      }
      setHolds(Array.isArray(json.holds) ? json.holds : []);
      setNow(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const t = window.setInterval(() => setNow(Date.now()), 30000); // 남은 시간 표시만 갱신
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const h of holds) {
      const exp = new Date(h.expiresAt).getTime();
      if (!Number.isFinite(exp) || exp <= now) continue; // 화면에서도 만료분 제외
      const g = map.get(h.sessionKey) || { sessionKey: h.sessionKey, phone: h.phone, nickname: h.nickname, name: h.name, items: [], totalQty: 0, minExpires: Infinity };
      g.items.push(h);
      g.totalQty += h.qty;
      g.minExpires = Math.min(g.minExpires, exp);
      if (!g.phone && h.phone) g.phone = h.phone;
      if (!g.nickname && h.nickname) g.nickname = h.nickname;
      if (!g.name && h.name) g.name = h.name;
      map.set(h.sessionKey, g);
    }
    return Array.from(map.values()).sort((a, b) => a.minExpires - b.minExpires);
  }, [holds, now]);

  const totalQty = groups.reduce((s, g) => s + g.totalQty, 0);

  // 헤더 표기: 닉네임(이름)이 있으면 크게, 전화번호는 보조. 주문 이력 없으면 전화번호만.
  const groupLabel = (g: Group) => {
    const nick = [g.nickname, g.name && g.nickname !== g.name ? `(${g.name})` : ""].filter(Boolean).join(" ");
    return nick || (g.phone ? phoneFmt(g.phone) : "번호 미입력 고객");
  };

  const clearSession = async (g: Group) => {
    const who = groupLabel(g);
    if (!(await showAdminConfirm(`${who}의 담김 ${g.totalQty}개 선점을 해제할까요?\n\n다른 고객 화면의 남은 수량이 즉시 복구됩니다. (실제 재고·주문에는 영향 없음)`))) return;
    setClearing(g.sessionKey);
    try {
      const res = await fetch("/api/admin-live/cart-holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "clear", sessionKey: g.sessionKey }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        showAdminToast("선점 해제 실패\n\n" + (json?.error?.message || `요청 실패(${res.status})`), "error");
        return;
      }
      showAdminToast("선점을 해제했습니다.");
      await load();
    } finally {
      setClearing("");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="text-[15px] font-black text-ink">🛒 담김 현황 <span className="text-ink-mute">(주문서 제출 전 선점)</span></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-ink-soft hover:bg-surface-2 disabled:opacity-50">
              {loading ? "불러오는중" : "새로고침"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[15px] font-black text-ink-mute hover:text-ink">✕</button>
          </div>
        </div>

        <div className="border-b border-line bg-surface-2 px-5 py-2 text-xs font-black text-ink-soft">
          장바구니 {groups.length}개 · 담긴 수량 {totalQty}개 — 시간이 지나면 자동 해제되고, 여기서 바로 해제할 수도 있습니다.
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && holds.length === 0 ? (
            <div className="py-10 text-center text-xs font-black text-ink-mute">불러오는 중...</div>
          ) : groups.length === 0 ? (
            <div className="py-10 text-center text-xs font-black text-ink-mute">지금 담기만 하고 제출 안 한 고객이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.sessionKey} className="overflow-hidden rounded-2xl border border-line">
                  <div className="flex items-center gap-2 bg-surface-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-black text-ink">
                      {g.nickname || g.name ? (
                        <>
                          👤 {groupLabel(g)}
                          {g.phone ? <span className="ml-1.5 text-[11px] font-bold text-ink-mute">📱 {phoneFmt(g.phone)}</span> : null}
                        </>
                      ) : g.phone ? (
                        `📱 ${phoneFmt(g.phone)}`
                      ) : (
                        "번호 미입력 고객"
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] font-black text-rose-deep">{remainText(g.minExpires, now)}</span>
                    <button
                      type="button"
                      disabled={clearing === g.sessionKey}
                      onClick={() => void clearSession(g)}
                      className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-ink-soft hover:bg-danger-bg hover:text-danger-tx disabled:opacity-50"
                    >
                      {clearing === g.sessionKey ? "해제중" : "선점 해제"}
                    </button>
                  </div>
                  <div className="divide-y divide-line">
                    {g.items.map((it, i) => {
                      const opt = [it.color, it.size].filter(Boolean).join("/");
                      return (
                        <div key={i} className="flex items-center gap-3 px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                            {it.productName}
                            {opt ? <span className="text-ink-mute"> ({opt})</span> : null}
                          </span>
                          <span className="shrink-0 text-[13px] font-black text-ink">{it.qty}개</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
