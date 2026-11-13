"use client";
// [2026-11-13] 자동 테스트 주문 — 방송 관리 창 › 기타. 켬/끔 · 지금 테스트 · 자동 테스트 주문 전부 영구 삭제 · 마지막 결과 한 줄.
//   실제 실행은 서버(1분 cron)가 함 — 이 창을 닫아도 계속. 저장·실행 = /api/admin-live/auto-test-order(관리자만).
import { useCallback, useEffect, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import type { AutoTestState } from "@/lib/autoTestOrder";
import { SCREEN_TEST_EVENT, SCREEN_TEST_ON_KEY } from "./ScreenTestHost";

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-ink" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const hm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function AutoTestOrderSettings({ onChanged }: { onChanged?: () => void }) {
  const [state, setState] = useState<AutoTestState | null>(null);
  const [rows, setRows] = useState(0);
  const [busy, setBusy] = useState<"" | "toggle" | "run" | "delete">("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin-live/auto-test-order", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) { setState(j.state); setRows(Number(j.testRows) || 0); }
    } catch { /* 다음에 다시 */ }
  }, []);
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(t); }, [load]);

  // 화면 테스트(이 기기) — 켬/끔은 이 브라우저에만 저장, 실행은 관리자 화면 전체에 붙은 ScreenTestHost 가 함
  const [screenOn, setScreenOn] = useState(false);
  const [screenBusy, setScreenBusy] = useState(false);
  useEffect(() => { try { setScreenOn(localStorage.getItem(SCREEN_TEST_ON_KEY) === "1"); } catch { /* 무시 */ } }, []);
  useEffect(() => {
    const onDone = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.action !== "done") return;
      setScreenBusy(false);
      if (d.message) showAdminToast(String(d.message), /확인 —|건너뜀/.test(String(d.message)) ? "success" : "error");
      onChanged?.();
      void load();
    };
    window.addEventListener(SCREEN_TEST_EVENT, onDone);
    return () => window.removeEventListener(SCREEN_TEST_EVENT, onDone);
  }, [load, onChanged]);
  const toggleScreen = (on: boolean) => {
    setScreenOn(on);
    try { if (on) localStorage.setItem(SCREEN_TEST_ON_KEY, "1"); else localStorage.removeItem(SCREEN_TEST_ON_KEY); } catch { /* 무시 */ }
    window.dispatchEvent(new CustomEvent(SCREEN_TEST_EVENT, { detail: { action: "toggle" } }));
  };
  const runScreen = () => {
    setScreenBusy(true);
    window.dispatchEvent(new CustomEvent(SCREEN_TEST_EVENT, { detail: { action: "run" } }));
  };

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/admin-live/auto-test-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.message || "실패");
    return j;
  };

  const toggle = async (on: boolean) => {
    setBusy("toggle");
    try { const j = await post({ action: "toggle", enabled: on }); setState(j.state); } catch (e) { showAdminToast(e instanceof Error ? e.message : "실패", "error"); } finally { setBusy(""); }
  };
  const runNow = async () => {
    setBusy("run");
    try {
      const j = await post({ action: "run" });
      setState(j.state);
      showAdminToast(j.last?.message || "끝났어요", j.last?.ok ? "success" : "error");
      onChanged?.();
      void load();
    } catch (e) { showAdminToast(e instanceof Error ? e.message : "실패", "error"); } finally { setBusy(""); }
  };
  const removeAll = async () => {
    if (!(await showAdminConfirm("자동 테스트로 만든 주문서를 전부 영구 삭제할까요?\n되돌릴 수 없어요. 일반 주문은 지워지지 않아요.", { title: "테스트 주문 전체 삭제", confirmText: "영구 삭제" }))) return;
    setBusy("delete");
    try {
      const j = await post({ action: "delete" });
      showAdminToast(`테스트 주문서 ${j.groups}건을 지웠어요${j.skipped?.length ? ` · ${j.skipped.length}건은 건너뜀` : ""}`, "success");
      onChanged?.();
      void load();
    } catch (e) { showAdminToast(e instanceof Error ? e.message : "실패", "error"); } finally { setBusy(""); }
  };

  const last = state?.last;
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-ink">자동 테스트 주문 (서버)</div>
          <div className="text-[12px] text-ink-mute">
            {state?.enabled
              ? state.nextRunAt ? `켜짐 · 다음 ${hm(state.nextRunAt)}쯤 (5~10분마다)` : "켜짐 · 방송을 켜면 시작해요"
              : "방송 중 5~10분마다 테스트 계정으로 주문서를 제출해요"}
          </div>
        </div>
        <Switch on={state?.enabled === true} disabled={!state || busy !== ""} onChange={(v) => void toggle(v)} label="자동 테스트 주문" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-ink">화면 테스트 (이 기기)</div>
          <div className="text-[12px] text-ink-mute">이 관리자 화면이 손님 주문 화면을 띄워 버튼을 직접 눌러요 · 켜 두면 5~10분마다(이 창이 열려 있는 동안)</div>
        </div>
        <Switch on={screenOn} onChange={toggleScreen} label="화면 테스트" />
      </div>
      {last ? (
        <div className={`mt-2 text-[12px] ${last.ok ? "text-ink-soft" : "text-danger"}`}>마지막 {hm(last.at)} · {last.message}</div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy !== ""} onClick={() => void runNow()}
          className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-bold text-ink hover:bg-surface-2 disabled:opacity-40">
          {busy === "run" ? "테스트 중…" : "지금 서버 테스트"}
        </button>
        <button type="button" disabled={busy !== "" || screenBusy} onClick={runScreen}
          className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-bold text-ink hover:bg-surface-2 disabled:opacity-40">
          {screenBusy ? "화면 테스트 중…" : "지금 화면 테스트"}
        </button>
        <button type="button" disabled={busy !== "" || rows === 0} onClick={() => void removeAll()}
          className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-bold text-danger hover:bg-surface-2 disabled:opacity-40">
          {busy === "delete" ? "지우는 중…" : `테스트 주문 전체 삭제${rows ? ` (${rows}줄)` : ""}`}
        </button>
      </div>
    </div>
  );
}
