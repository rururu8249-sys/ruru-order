"use client";
// components/admin-live/SubscribeFreeShipSettingsCard.tsx
// [2026-11-01 사장님] 설정 › 결제·배송 › 「구독 인증 무료배송」 — 자체 저장(settings subscribe_free_ship_v1 한 칸).
//   켜기 · 시작/끝 시각 · 무료로 할 배송 갈래(여러 개) · 제주/산간 추가금도 무료 · 채널 이름 · 예시 사진 · 인증 목록(캡처 보기·취소·통과).
//   배송비 계산은 여기서 안 한다(손님 화면·서버가 lib/subscribeFreeShip 로).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import {
  DEFAULT_SUBSCRIBE_EXAMPLE,
  SUBSCRIBE_FREE_SHIP_KEY,
  SUBSCRIBE_GROUP_LABEL,
  defaultSubscribeWindow,
  isSubscribeFreeShipActive,
  parseSubscribeFreeShip,
  type SubscribeFreeShipConfig,
} from "@/lib/subscribeFreeShip";
import type { ShippingGroup } from "@/lib/shippingGroups";

const GROUPS: ShippingGroup[] = ["normal", "vendor", "vendor2", "overseas"];

type Row = {
  id: number;
  kakao_id: string;
  customer_phone: string;
  youtube_nickname: string | null;
  status: string;
  reason: string | null;
  ai_note: string | null;
  created_at: string;
  imageUrl: string;
  orderCount?: number;
};
type ListFilter = "all" | "verified" | "rejected" | "canceled";

// ISO → <input type="datetime-local"> 값(이 브라우저 시간 기준)
const toLocalInput = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};
const shortTime = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function SubscribeFreeShipSettingsCard() {
  const [cfg, setCfg] = useState<SubscribeFreeShipConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [listError, setListError] = useState("");
  const [zoom, setZoom] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [listSearch, setListSearch] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("settings").select("key,value").eq("key", SUBSCRIBE_FREE_SHIP_KEY).maybeSingle();
      const parsed = parseSubscribeFreeShip(data?.value ?? null);
      if (!parsed.startAt || !parsed.endAt) Object.assign(parsed, defaultSubscribeWindow());
      setCfg(parsed);
    })();
  }, []);

  const loadRows = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-live/subscribe-verify", { cache: "no-store" });
      const json = await res.json();
      setRows(Array.isArray(json?.rows) ? json.rows : []);
      setListError(json?.ok ? "" : String(json?.message || "목록을 못 불러왔어요"));
    } catch {
      setRows([]);
      setListError("목록을 못 불러왔어요");
    }
  }, []);
  useEffect(() => { void loadRows(); }, [loadRows]);

  if (!cfg) return <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-mute">구독 인증 무료배송 불러오는 중…</div>;

  const set = (patch: Partial<SubscribeFreeShipConfig>) => setCfg({ ...cfg, ...patch });
  const toggleGroup = (g: ShippingGroup) =>
    set({ groups: cfg.groups.includes(g) ? cfg.groups.filter((x) => x !== g) : GROUPS.filter((x) => x === g || cfg.groups.includes(x)) });
  const active = isSubscribeFreeShipActive(cfg);

  const save = async () => {
    if (cfg.enabled) {
      if (cfg.groups.length === 0) return showAdminToast("무료로 할 배송을 하나 이상 골라 주세요", "error");
      if (!(Date.parse(cfg.endAt) > Date.parse(cfg.startAt))) return showAdminToast("끝 시각이 시작 시각보다 뒤여야 해요", "error");
    }
    setSaving(true);
    const { error } = await supabase.from("settings").upsert([{ key: SUBSCRIBE_FREE_SHIP_KEY, value: JSON.stringify(cfg) }], { onConflict: "key" });
    setSaving(false);
    if (error) return showAdminToast("저장 실패\n\n" + error.message, "error");
    showAdminToast("구독 인증 무료배송 저장했어요", "success");
  };

  const uploadExample = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "detail");
      const res = await fetch("/api/admin-live/product-images/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!json?.ok || !json.url) throw new Error(json?.message || "업로드 실패");
      set({ exampleUrl: json.url });
    } catch (e) {
      showAdminToast(e instanceof Error ? e.message : "업로드 실패", "error");
    } finally {
      setUploading(false);
    }
  };

  const act = async (id: number, action: "cancel" | "approve") => {
    if (action === "cancel" && !window.confirm("이 손님 구독 인증을 취소할까요? 다음 주문부터 배송비가 붙어요.")) return;
    const res = await fetch("/api/admin-live/subscribe-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const json = await res.json().catch(() => null);
    if (!json?.ok) return showAdminToast(json?.message || "저장 실패", "error");
    void loadRows();
  };

  const statusLabel = (s: string) => (s === "verified" ? "통과" : s === "canceled" ? "취소함" : "불합격");

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">구독 인증 무료배송</h2>
          <p className="mt-1 text-xs text-ink-mute">손님이 「채널 이름 + 구독중」 캡처를 올리면 AI 가 확인해 고른 배송비를 0원으로 · 켠 시간에만</p>
        </div>
        <button
          type="button"
          onClick={() => set({ enabled: !cfg.enabled })}
          aria-pressed={cfg.enabled}
          className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold ${cfg.enabled ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft"}`}
        >
          {cfg.enabled ? "켜짐" : "꺼짐"}
        </button>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">시작</span>
            <input type="datetime-local" value={toLocalInput(cfg.startAt)} onChange={(e) => set({ startAt: fromLocalInput(e.target.value) })} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">끝</span>
            <input type="datetime-local" value={toLocalInput(cfg.endAt)} onChange={(e) => set({ endAt: fromLocalInput(e.target.value) })} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => set(defaultSubscribeWindow())} className="h-8 rounded-full border border-line px-3 text-xs font-semibold text-ink-soft">지금부터 오늘 밤까지</button>
          <span className={`text-xs font-semibold ${active ? "text-ok-tx" : "text-ink-mute"}`}>
            {active ? "지금 손님 화면에 보이는 중" : cfg.enabled ? "시간 밖이라 지금은 안 보여요" : "꺼져 있어요"}
          </span>
        </div>

        <div>
          <span className="mb-1 block text-[13px] font-semibold text-ink">무료로 할 배송 (여러 개 고르기)</span>
          <div className="flex flex-wrap gap-2">
            {GROUPS.map((g) => {
              const on = cfg.groups.includes(g);
              return (
                <button key={g} type="button" aria-pressed={on} onClick={() => toggleGroup(g)} className={`h-9 rounded-full px-4 text-sm font-semibold ${on ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft"}`}>
                  {SUBSCRIBE_GROUP_LABEL[g]}
                </button>
              );
            })}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={cfg.waiveRemote} onChange={(e) => set({ waiveRemote: e.target.checked })} className="h-4 w-4" style={{ accentColor: "#111111" }} />
            제주·산간 추가금도 무료 <span className="text-xs text-ink-mute">(끄면 추가금은 받아요)</span>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-ink">캡처에 보여야 하는 채널 이름 <span className="font-normal text-ink-mute">· 여러 채널이면 쉼표로 (예: 나야루루, 루루동이#3)</span></span>
          <input value={cfg.channelName} onChange={(e) => set({ channelName: e.target.value })} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm" />
        </label>

        <div>
          <span className="mb-1 block text-[13px] font-semibold text-ink">손님에게 보여 줄 예시 사진</span>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cfg.exampleUrl} alt="예시" className="h-20 w-20 rounded-xl border border-line object-cover object-top" />
            <div className="flex flex-col gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-soft">
                {uploading ? "올리는 중…" : "사진 바꾸기"}
                <input type="file" accept="image/*" hidden onChange={(e) => void uploadExample(e.target.files?.[0])} />
              </label>
              {cfg.exampleUrl !== DEFAULT_SUBSCRIBE_EXAMPLE ? (
                <button type="button" onClick={() => set({ exampleUrl: DEFAULT_SUBSCRIBE_EXAMPLE })} className="text-left text-xs text-ink-mute underline">기본 사진으로</button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" disabled={saving} onClick={() => void save()} className="h-10 rounded-full bg-ink px-6 text-sm font-bold text-white disabled:opacity-50">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-ink">인증 기록</span>
          <button type="button" onClick={() => void loadRows()} className="h-8 rounded-full border border-line px-3 text-xs font-semibold text-ink-soft">새로고침</button>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {(["all", "verified", "rejected", "canceled"] as ListFilter[]).map((f) => {
            const n = (rows || []).filter((r) => f === "all" || r.status === f).length;
            const label = f === "all" ? "전체" : statusLabel(f);
            return (
              <button key={f} type="button" aria-pressed={listFilter === f} onClick={() => setListFilter(f)} className={`h-8 rounded-full px-3 text-xs font-semibold ${listFilter === f ? "bg-ink text-white" : "border border-line text-ink-soft"}`}>
                {label} {n}
              </button>
            );
          })}
          <input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="닉네임·전화 뒷자리" className="h-8 min-w-[140px] flex-1 rounded-full border border-line bg-surface px-3 text-xs" />
        </div>
        {listError ? <div className="mb-2 text-xs text-warn-tx">{listError}</div> : null}
        {rows && rows.length === 0 && !listError ? <div className="text-xs text-ink-mute">아직 인증 기록이 없어요</div> : null}
        <div className="grid gap-2">
          {(rows || []).filter((r) => (listFilter === "all" || r.status === listFilter) && (!listSearch.trim() || `${r.youtube_nickname || ""} ${r.customer_phone}`.toLowerCase().includes(listSearch.trim().toLowerCase()))).map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
              {r.imageUrl ? (
                <button type="button" onClick={() => setZoom(r.imageUrl)} className="shrink-0" aria-label="캡처 크게 보기">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.imageUrl} alt="" className="h-14 w-14 rounded-xl border border-line object-cover object-top" />
                </button>
              ) : <div className="h-14 w-14 shrink-0 rounded-xl bg-surface-2" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-ink">{r.youtube_nickname || "-"}</span>
                  <span className="text-xs text-ink-mute">{r.customer_phone}</span>
                  <span className={`rounded-full px-2 text-xs font-semibold ${r.status === "verified" ? "bg-ok-bg text-ok-tx" : "bg-surface-2 text-ink-mute"}`}>{statusLabel(r.status)}</span>
                  <span className="text-xs text-ink-mute">{shortTime(r.created_at)}</span>
                  {r.orderCount ? <span className="text-xs font-semibold text-ink-soft">구독 무배 주문 {r.orderCount}건</span> : null}
                </div>
                <div className="truncate text-xs text-ink-mute">{r.reason || r.ai_note || ""}</div>
              </div>
              {r.status === "verified" ? (
                <button type="button" onClick={() => void act(r.id, "cancel")} className="h-8 shrink-0 rounded-full border border-line px-3 text-xs font-semibold text-danger">인증 취소</button>
              ) : (
                <button type="button" onClick={() => void act(r.id, "approve")} className="h-8 shrink-0 rounded-full border border-line px-3 text-xs font-semibold text-ink-soft">통과시키기</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {zoom ? (
        <div role="dialog" onClick={() => setZoom("")} className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="손님 캡처" className="max-h-[90vh] max-w-full rounded-xl" />
        </div>
      ) : null}
    </div>
  );
}
