"use client";

import { showAdminToast } from "@/lib/adminToast";
import { useEffect, useMemo, useRef, useState } from "react";
import LiveOpsOrderCopyModal, {
  ORDER_COPY_DONE_STORAGE_KEY,
  liveOpsOrderCopyKey,
  loadLiveOpsCopiedOrderKeys,
} from "./LiveOpsOrderCopyModal";

type RecentOrder = {
  id: string;
  groupId: string;
  createdAt: string;
  nickname: string;
  maskedNickname?: string | null;
  itemSummary?: string | null;
  amount: number;
  isAutoPaid: boolean;
  paidAt: string | null;
};

type ActiveVisitor = {
  id: string;
  visitorKey: string;
  nickname: string;
  pageType: string;
  pageLabel: string;
  lastSeenAt: string;
};

type OpsStatusPayload = {
  ok: boolean;
  recentOrders?: RecentOrder[];
  autoPaidOrders?: RecentOrder[];
  activeVisitors?: ActiveVisitor[];
  presenceAvailable?: boolean;
};

type Notice = {
  id: string;
  type: "order" | "auto_paid";
  title: string;
  body: string;
  createdAt: string;
};

const AUTO_PAID_COPY_DONE_STORAGE_KEY = "ruru_admin_live_ops_auto_paid_copy_done_ids_v1";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function loadStringSet(storageKey: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.map((item) => String(item)));
  } catch {
    return new Set<string>();
  }
}

function saveStringSet(storageKey: string, keys: Set<string>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(keys).slice(-500)));
  } catch {
    // 브라우저 저장 실패는 알림 복사 기능 자체를 막지 않습니다.
  }
}

function loadLiveOpsCopiedAutoPaidKeys() {
  return loadStringSet(AUTO_PAID_COPY_DONE_STORAGE_KEY);
}

function saveLiveOpsCopiedAutoPaidKeys(keys: Set<string>) {
  saveStringSet(AUTO_PAID_COPY_DONE_STORAGE_KEY, keys);
}

function saveLiveOpsCopiedOrderKeys(keys: Set<string>) {
  saveStringSet(ORDER_COPY_DONE_STORAGE_KEY, keys);
}

function liveOpsAutoPaidCopyKey(order: RecentOrder) {
  return clean(`${order.id || order.groupId || order.nickname}-${order.amount}-${order.paidAt || order.createdAt || ""}`);
}

function maskNicknameForPayment(value: unknown) {
  const text = clean(value);
  if (!text) return "고객";
  const chars = Array.from(text);

  if (chars.length <= 1) return "*";
  if (chars.length === 2) return `${chars[0]}*`;

  return `${chars[0]}${"*".repeat(Math.max(1, chars.length - 2))}${chars[chars.length - 1]}`;
}

function buildRecentOrderCopyText(orders: RecentOrder[]) {
  const body = orders
    .slice(0, 2)
    .map((order) => `${clean(order.nickname) || clean(order.maskedNickname) || "고객"}님 / ${clean(order.itemSummary) || "상품명확인"} / ${money(order.amount)}`)
    .join(" ｜ ");

  return `📦 새 주문서 접수완료 ｜ ${body} ｜ 주문내역과 금액 확인 후 결제 부탁드립니다 :)`;
}

function buildAutoPaidCopyText(orders: RecentOrder[]) {
  const body = orders
    .slice(0, 3)
    .map((order) => `${maskNicknameForPayment(order.maskedNickname || order.nickname)}님 ${money(order.amount)}`)
    .join(" ｜ ");

  return `💰 입금확인 ｜ ${body} ｜ 입금 감사합니다 :)`;
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function timeAgo(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "방금 전";

  const diff = Math.max(0, Date.now() - time);
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "방금 전";
  if (sec < 60) return `${sec}초 전`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;

  const hour = Math.floor(min / 60);
  return `${hour}시간 전`;
}

function playTone(type: "order" | "auto_paid") {
  if (typeof window === "undefined") return;

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = type === "order" ? 720 : 980;
  gain.gain.value = 0.09;

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + 0.24);

  oscillator.onended = () => {
    void context.close();
  };
}

export default function LiveOpsStatusBox() {
  const [soundOn, setSoundOn] = useState(true);
  const [openVisitors, setOpenVisitors] = useState(false);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [autoPaidOrders, setAutoPaidOrders] = useState<RecentOrder[]>([]);
  const [orderCopyModalOpen, setOrderCopyModalOpen] = useState(false);

  const handleCopiedOrderNotices = (copiedKeys: string[]) => {
    const copiedKeySet = new Set(copiedKeys);

    setRecentOrders((current) =>
      current.filter((order) => !copiedKeySet.has(liveOpsOrderCopyKey(order)))
    );

    setNotices((current) =>
      current.filter((notice) => {
        if (notice.title !== "새 주문서 제출") return true;
        const noticeId = String(notice.id || "");
        return !copiedKeys.some((key) => noticeId.includes(String(key)));
      })
    );
  };

  const handleCopyRecentOrderNotices = async () => {
    const targets = recentOrders.slice(0, 2);

    if (!targets.length) {
      showAdminToast("복사할 새 주문서 알림이 없습니다.");
      return;
    }

    const copiedKeys = targets.map(liveOpsOrderCopyKey).filter(Boolean);
    const copiedKeySet = new Set(copiedKeys);

    try {
      await copyToClipboard(buildRecentOrderCopyText(targets));

      const nextDoneKeys = loadLiveOpsCopiedOrderKeys();
      copiedKeys.forEach((key) => nextDoneKeys.add(key));
      saveLiveOpsCopiedOrderKeys(nextDoneKeys);

      handleCopiedOrderNotices(copiedKeys);
      showAdminToast(`새 주문서 ${targets.length}건 복사완료`, "success");
    } catch {
      showAdminToast("새 주문서 자동복사에 실패했습니다. 다시 시도해주세요.", "error");
      return;
    }

    setRecentOrders((current) =>
      current.filter((order) => !copiedKeySet.has(liveOpsOrderCopyKey(order)))
    );
  };

  const handleCopyAutoPaidNotices = async () => {
    const targets = autoPaidOrders.slice(0, 3);

    if (!targets.length) {
      showAdminToast("복사할 입금확인 알림이 없습니다.");
      return;
    }

    const copiedKeys = targets.map(liveOpsAutoPaidCopyKey).filter(Boolean);
    const copiedIdSet = new Set(targets.map((order) => String(order.id || "")));

    try {
      await copyToClipboard(buildAutoPaidCopyText(targets));

      const nextDoneKeys = loadLiveOpsCopiedAutoPaidKeys();
      copiedKeys.forEach((key) => nextDoneKeys.add(key));
      saveLiveOpsCopiedAutoPaidKeys(nextDoneKeys);

      setAutoPaidOrders((current) =>
        current.filter((order) => !copiedKeys.includes(liveOpsAutoPaidCopyKey(order)))
      );

      setNotices((current) =>
        current.filter((notice) => {
          if (notice.type !== "auto_paid") return true;
          const noticeOrderId = String(notice.id || "").replace(/^auto-/, "");
          return !copiedIdSet.has(noticeOrderId);
        })
      );

      showAdminToast(`입금확인 ${targets.length}건 복사완료`, "success");
    } catch {
      showAdminToast("입금확인 자동복사에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };

  const [activeVisitors, setActiveVisitors] = useState<ActiveVisitor[]>([]);
  const [presenceAvailable, setPresenceAvailable] = useState(true);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);

  const initializedRef = useRef(false);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const knownAutoPaidIdsRef = useRef<Set<string>>(new Set());

  const activeVisitorsByType = useMemo(() => {
    const result = {
      orderForm: 0,
      orderLookup: 0,
      admin: 0,
      others: 0,
    };

    activeVisitors.forEach((visitor) => {
      if (visitor.pageType === "order_form") result.orderForm += 1;
      else if (visitor.pageType === "order_lookup") result.orderLookup += 1;
      else if (visitor.pageType === "admin") result.admin += 1;
      else result.others += 1;
    });

    return result;
  }, [activeVisitors]);

  const fetchStatus = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin-live/ops-status", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as OpsStatusPayload | null;
      if (!response.ok || !payload?.ok) return;

      const copiedOrderNoticeKeys = loadLiveOpsCopiedOrderKeys();
      const copiedAutoPaidNoticeKeys = loadLiveOpsCopiedAutoPaidKeys();
      const nextOrders = (payload.recentOrders || []).filter(
        (order: RecentOrder) => !copiedOrderNoticeKeys.has(liveOpsOrderCopyKey(order))
      );
      const nextAutoPaid = (payload.autoPaidOrders || []).filter(
        (order: RecentOrder) => !copiedAutoPaidNoticeKeys.has(liveOpsAutoPaidCopyKey(order))
      );
      const nextVisitors = payload.activeVisitors || [];

      if (!initializedRef.current) {
        knownOrderIdsRef.current = new Set(nextOrders.map((order) => order.id));
        knownAutoPaidIdsRef.current = new Set(nextAutoPaid.map((order) => order.id));
        initializedRef.current = true;
      } else {
        const newOrderNotices = nextOrders
          .filter((order) => !knownOrderIdsRef.current.has(order.id))
          .slice(0, 5)
          .map((order) => ({
            id: `order-${order.id}`,
            type: "order" as const,
            title: "새 주문서 제출",
            body: `${order.maskedNickname || order.nickname} · ${order.itemSummary || "상품명확인"} · ${money(order.amount)}`,
            createdAt: order.createdAt,
          }));

        const newAutoPaidNotices = nextAutoPaid
          .filter((order) => !knownAutoPaidIdsRef.current.has(order.id))
          .slice(0, 5)
          .map((order) => ({
            id: `auto-${order.id}`,
            type: "auto_paid" as const,
            title: "입금확인",
            body: `${maskNicknameForPayment(order.maskedNickname || order.nickname)}님 · ${money(order.amount)}`,
            createdAt: order.paidAt || order.createdAt,
          }));

        const mergedNew = [...newOrderNotices, ...newAutoPaidNotices];

        if (mergedNew.length > 0) {
          setNotices((prev) => [...mergedNew, ...prev].slice(0, 5));

          if (soundOn) {
            const hasOrder = newOrderNotices.length > 0;
            const hasPaid = newAutoPaidNotices.length > 0;
            if (hasOrder || hasPaid) playTone(hasOrder ? "order" : "auto_paid");
          }
        }

        nextOrders.forEach((order) => knownOrderIdsRef.current.add(order.id));
        nextAutoPaid.forEach((order) => knownAutoPaidIdsRef.current.add(order.id));
      }

      setRecentOrders(nextOrders);
      setAutoPaidOrders(nextAutoPaid);
      setActiveVisitors(nextVisitors);
      setPresenceAvailable(payload.presenceAvailable !== false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();

    const timer = window.setInterval(() => {
      void fetchStatus();
    }, 30000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn]);

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <LiveOpsOrderCopyModal
        open={orderCopyModalOpen}
        orders={recentOrders}
        onClose={() => setOrderCopyModalOpen(false)}
        onCopied={handleCopiedOrderNotices}
      />
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-black text-slate-900">실시간 운영상황</div>
        <button
          type="button"
          onClick={() => setSoundOn((value) => !value)}
          className={[
            "rounded-full px-2 py-1 text-[10px] font-black",
            soundOn ? "bg-rose-deep text-white" : "bg-slate-200 text-slate-500",
          ].join(" ")}
        >
          {soundOn ? "🔔 ON" : "🔕 OFF"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <MiniStat label="새 주문서" value={recentOrders.length} />
        <MiniStat label="입금확인" value={autoPaidOrders.length} />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1.5">
        <button
          type="button"
          onClick={handleCopyRecentOrderNotices}
          disabled={!recentOrders.length}
          className="flex w-full items-center justify-between rounded-xl border border-rose-line bg-white px-3 py-2 text-left hover:bg-rose-soft disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="text-[11px] font-black text-rose-deep">📦 새 주문서 복사</span>
          <span className="text-[11px] font-black text-rose-deep">{Math.min(2, recentOrders.length)}건</span>
        </button>

        <button
          type="button"
          onClick={handleCopyAutoPaidNotices}
          disabled={!autoPaidOrders.length}
          className="flex w-full items-center justify-between rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="text-[11px] font-black text-emerald-800">💰 입금확인 복사</span>
          <span className="text-[11px] font-black text-emerald-600">{Math.min(3, autoPaidOrders.length)}건</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpenVisitors((value) => !value)}
        className="mt-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:bg-rose-soft"
      >
        <span className="text-xs font-black text-slate-700">👀 접속중</span>
        <span className="text-sm font-black text-rose-deep">{activeVisitors.length}명</span>
      </button>

      <div className="mt-2 space-y-1.5">
        {notices.length === 0 ? (
          <div className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-400">
            새 알림 대기중
          </div>
        ) : (
          notices.slice(0, 3).map((notice) => (
            <button
              key={notice.id}
              type="button"
              onClick={notice.title === "새 주문서 제출" ? () => setOrderCopyModalOpen(true) : undefined}
              className={[
                "w-full rounded-xl bg-white px-3 py-2 text-left",
                notice.title === "새 주문서 제출" ? "cursor-pointer hover:bg-rose-soft active:scale-[0.99]" : "cursor-default",
              ].join(" ")}
            >
              <div className="text-[11px] font-black text-slate-800">
                {notice.type === "order" ? "🧾 " : "✅ "}
                {notice.title}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-bold text-slate-500">{notice.body}</div>
            </button>
          ))
        )}
      </div>

      {loading && (
        <div className="mt-2 text-center text-[10px] font-bold text-slate-400">갱신중...</div>
      )}

      {openVisitors && (
        <div className="absolute left-full top-0 z-[80] ml-3 w-[300px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-black text-slate-950">현재 접속중</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-400">
                전체 {activeVisitors.length}명
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenVisitors(false)}
              className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100"
            >
              ×
            </button>
          </div>

          <div className="mb-2 grid grid-cols-3 gap-1">
            <MiniStat label="주문서" value={activeVisitorsByType.orderForm} compact />
            <MiniStat label="조회" value={activeVisitorsByType.orderLookup} compact />
            <MiniStat label="관리자" value={activeVisitorsByType.admin} compact />
          </div>

          {!presenceAvailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold leading-5 text-amber-700">
              접속중 표시용 테이블이 아직 연결되지 않았습니다.
              <br />
              supabase/admin_live_presence.sql을 실행하면 표시됩니다.
            </div>
          ) : activeVisitors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[11px] font-bold text-slate-400">
              현재 접속중인 방문자가 없습니다.
            </div>
          ) : (
            <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
              {activeVisitors.map((visitor) => (
                <div key={visitor.id || visitor.visitorKey} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="truncate text-xs font-black text-slate-800">{visitor.nickname || "비회원 방문자"}</div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-bold text-slate-500">{visitor.pageLabel}</span>
                    <span className="shrink-0 text-[10px] font-bold text-slate-400">{timeAgo(visitor.lastSeenAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, compact = false }: { label: string; value: number; compact?: boolean }) {
  return (
    <div className={["rounded-xl bg-white text-center", compact ? "px-2 py-1.5" : "px-2 py-2"].join(" ")}>
      <div className="text-[10px] font-black text-slate-400">{label}</div>
      <div className={["font-black text-slate-900", compact ? "text-sm" : "text-lg"].join(" ")}>
        {value.toLocaleString("ko-KR")}
      </div>
    </div>
  );
}
