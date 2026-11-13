"use client";
// [2026-11-13] 자동 테스트 주문 — 사이드바 방송 카드 안 한 덩어리(사장님 「심플하게, 실무에서 쓰기 쉽게」).
//   스위치 하나: 켜면 끌 때까지 방송 중 5~10분마다. 관리자 화면이 열려 있으면 화면 테스트(손님 화면 버튼을 직접 누름),
//   닫혀 있으면 서버가 같은 일정으로 대신. 「지금 테스트」 = 바로 한 번(화면 테스트). 테스트 주문 삭제 = 자동 테스트 주문서만.
import { useCallback, useEffect, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import type { AutoTestState } from "@/lib/autoTestOrder";
import { SCREEN_TEST_EVENT } from "./ScreenTestHost";

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-ink" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const hm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function AutoTestOrderSettings() {
  const [state, setState] = useState<AutoTestState | null>(null);
  const [orders, setOrders] = useState(0);
  const [busy, setBusy] = useState<"" | "toggle" | "run" | "delete">("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin-live/auto-test-order", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) { setState(j.state); setOrders(Number(j.testOrders) || 0); }
    } catch { /* 다음에 다시 */ }
  }, []);
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(t); }, [load]);
  useEffect(() => {
    const onDone = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.action !== "done") return;
      setBusy((b) => (b === "run" ? "" : b));
      if (d.message) showAdminToast(String(d.message), /확인 —|건너뜀/.test(String(d.message)) ? "success" : "error");
      void load();
    };
    window.addEventListener(SCREEN_TEST_EVENT, onDone);
    return () => window.removeEventListener(SCREEN_TEST_EVENT, onDone);
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/admin-live/auto-test-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.message || "실패");
    return j;
  };
  const toggle = async (on: boolean, kind: "order" | "chat" = "order") => {
    setBusy("toggle");
    try { const j = await post({ action: kind === "chat" ? "toggle-chat" : "toggle", enabled: on }); setState(j.state); } catch (e) { showAdminToast(e instanceof Error ? e.message : "실패", "error"); } finally { setBusy(""); }
  };
  const runNow = () => {
    setBusy("run");
    window.dispatchEvent(new CustomEvent(SCREEN_TEST_EVENT, { detail: { action: "run" } }));
  };
  const removeAll = async () => {
    if (!(await showAdminConfirm(`자동 테스트 주문서 ${orders}건을 영구 삭제할까요?\n되돌릴 수 없어요. 일반 주문은 지워지지 않아요.`, { title: "테스트 주문 삭제", confirmText: "영구 삭제" }))) return;
    setBusy("delete");
    try {
      const j = await post({ action: "delete" });
      showAdminToast(`테스트 주문서 ${j.groups}건을 지웠어요${j.skipped?.length ? ` · ${j.skipped.length}건은 건너뜀` : ""}`, "success");
      window.dispatchEvent(new CustomEvent("ruru-admin-orders-refresh"));
      void load();
    } catch (e) { showAdminToast(e instanceof Error ? e.message : "실패", "error"); } finally { setBusy(""); }
  };

  const on = state?.enabled === true;
  const last = state?.last;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">자동 테스트 주문</div>
          <div className="text-[12px] text-ink-mute">
            {!on && !state?.chatEnabled ? "꺼짐" : !on ? "꺼짐 · 채팅만 돌아요" : state?.lockUntil && state.lockUntil > Date.now() ? "테스트 중" : state?.nextRunAt ? `켜짐 · 다음 ${hm(state.nextRunAt)}쯤` : "켜짐"}
          </div>
        </div>
        <Switch on={on} disabled={!state || busy === "toggle"} onChange={(v) => void toggle(v)} label="자동 테스트 주문" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">자동 테스트 채팅</div>
          <div className="text-[12px] text-ink-mute">{state?.chatEnabled ? "켜짐 · 주문 앞뒤로 한 줄씩" : "꺼짐"}</div>
        </div>
        <Switch on={state?.chatEnabled === true} disabled={!state || busy === "toggle"} onChange={(v) => void toggle(v, "chat")} label="자동 테스트 채팅" />
      </div>
      {last ? (
        <div className={`mt-1 truncate text-[12px] ${last.ok ? "text-ink-soft" : "text-danger-tx"}`} title={last.message}>
          {hm(last.at)} {last.ok ? "성공" : "실패"} · {last.message.replace(/^\[화면\] /, "")}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={busy !== ""} onClick={runNow}
          className="h-9 flex-1 rounded-lg border border-line bg-surface text-[13px] font-bold text-ink transition hover:bg-surface-2 disabled:opacity-50">
          {busy === "run" ? "테스트 중…" : "지금 테스트"}
        </button>
        {orders > 0 ? (
          <button type="button" disabled={busy !== ""} onClick={() => void removeAll()}
            className="h-9 shrink-0 px-1 text-[12px] font-bold text-danger-tx disabled:opacity-50">
            {busy === "delete" ? "지우는 중…" : `테스트 주문 ${orders}건 삭제`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
