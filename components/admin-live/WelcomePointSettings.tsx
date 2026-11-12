"use client";
// [2026-11-12] 방송 시청 선물 포인트 설정 — 방송 관리 창 › 방송 보며 주문 아래.
//   처음 오신 선물(결제한 적 없는 손님) / 다시 오신 선물(N일 넘게 안 산 손님) 켬·끔·금액, 몇 초 보면, 하루 최대 인원.
//   저장 = /api/admin-live/welcome-point(관리자만, 비공개 저장소). 지급 자체는 손님 화면 → 서버가 조건 확인 후 기존 포인트 지급 RPC.
import { useEffect, useState } from "react";
import WelcomeRecipientList from "@/components/admin-live/WelcomeRecipientList";
import { WELCOME_LIMITS, WELCOME_POINT_DEFAULT, type WelcomePointConfig } from "@/lib/welcomePoint";

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-ink" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function NumField({ label, value, unit, min, max, onChange }: { label: string; value: number; unit: string; min: number; max: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-soft">
      <span className="shrink-0">{label}</span>
      <input inputMode="numeric" value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => { const n = Math.min(max, Math.max(min, Math.floor(Number(text) || 0))); setText(String(n)); onChange(n); }}
        className="h-9 w-20 rounded-lg border border-line bg-white px-2 text-right text-[14px] font-bold text-ink tabular-nums" />
      <span className="shrink-0">{unit}</span>
    </label>
  );
}

export default function WelcomePointSettings() {
  const [cfg, setCfg] = useState<WelcomePointConfig>(WELCOME_POINT_DEFAULT);
  const [saved, setSaved] = useState<WelcomePointConfig>(WELCOME_POINT_DEFAULT);
  const [today, setToday] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [msg, setMsg] = useState("");
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    fetch("/api/admin-live/welcome-point", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) throw new Error(j?.message || "읽기 실패");
        setCfg(j.config); setSaved(j.config); setToday(typeof j.today === "number" ? j.today : null); setState("ready");
      })
      .catch((e) => { setState("error"); setMsg(e instanceof Error ? e.message : "읽기 실패"); });
  }, []);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const save = async () => {
    setState("saving"); setMsg("");
    try {
      const r = await fetch("/api/admin-live/welcome-point", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: cfg }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.message || "저장 실패");
      setCfg(j.config); setSaved(j.config); setMsg("저장했어요. 손님 화면은 새로고침하면 바뀌어요.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setState("ready");
    }
  };

  const busy = state !== "ready";
  return (
    <div className="grid gap-2 rounded-lg bg-surface-2 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-bold text-ink">방송 시청 선물 포인트</span>
        {today != null ? <span className="text-[12px] text-ink-mute">오늘 {today}명 받음</span> : null}
      </div>
      {state === "error" ? <div className="text-[12px] text-danger">{msg}</div> : null}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">처음 오신 선물</div>
          <div className="text-[12px] text-ink-mute">결제한 적 없는 손님 · 한 분께 한 번</div>
        </div>
        <Switch on={cfg.first.on} disabled={busy} label="처음 오신 선물" onChange={(v) => setCfg({ ...cfg, first: { ...cfg.first, on: v } })} />
      </div>
      {cfg.first.on ? <NumField label="금액" value={cfg.first.amount} unit="P" min={0} max={WELCOME_LIMITS.amountMax} onChange={(n) => setCfg({ ...cfg, first: { ...cfg.first, amount: n } })} /> : null}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">다시 오신 선물</div>
          <div className="text-[12px] text-ink-mute">마지막 결제 뒤 {cfg.back.days}일 넘게 안 산 손님</div>
        </div>
        <Switch on={cfg.back.on} disabled={busy} label="다시 오신 선물" onChange={(v) => setCfg({ ...cfg, back: { ...cfg.back, on: v } })} />
      </div>
      {cfg.back.on ? (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <NumField label="금액" value={cfg.back.amount} unit="P" min={0} max={WELCOME_LIMITS.amountMax} onChange={(n) => setCfg({ ...cfg, back: { ...cfg.back, amount: n } })} />
          <NumField label="기간" value={cfg.back.days} unit="일" min={WELCOME_LIMITS.daysMin} max={WELCOME_LIMITS.daysMax} onChange={(n) => setCfg({ ...cfg, back: { ...cfg.back, days: n } })} />
        </div>
      ) : null}
      {cfg.first.on || cfg.back.on ? (
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-2">
          <NumField label="방송 보기" value={cfg.watchSec} unit="초(그립 30)" min={0} max={WELCOME_LIMITS.watchMax} onChange={(n) => setCfg({ ...cfg, watchSec: n })} />
          <NumField label="안전장치 · 하루 전체 최대" value={cfg.dailyCap} unit="명" min={1} max={WELCOME_LIMITS.capMax} onChange={(n) => setCfg({ ...cfg, dailyCap: n })} />
        </div>
      ) : null}
      {dirty || msg ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-[12px] text-ink-mute">{msg}</span>
          {dirty ? <button type="button" onClick={() => void save()} disabled={busy} className="h-9 shrink-0 rounded-lg bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50">{state === "saving" ? "저장 중…" : "저장"}</button> : null}
        </div>
      ) : null}
      <button type="button" onClick={() => setShowList((v) => !v)} aria-expanded={showList}
        className="h-9 justify-self-start text-[13px] font-bold text-ink underline underline-offset-2">
        {showList ? "선물 받은 사람 닫기" : "선물 받은 사람 · 그중 주문한 사람 보기"}
      </button>
      {showList ? <WelcomeRecipientList /> : null}
    </div>
  );
}
