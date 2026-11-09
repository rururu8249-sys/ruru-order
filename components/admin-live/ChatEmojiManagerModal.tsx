"use client";
// components/admin-live/ChatEmojiManagerModal.tsx
// [2026-11-10 06:26 사장님] 사이트 채팅 이모티콘 관리 창 — 방송 관리 창 › 사이트 채팅 › 「채팅 이모티콘 · 관리」.
//   ① 이모티콘 올리기(여러 장 한 번에 — 브라우저가 128×128 로 줄여 1MB 훨씬 아래로) · 이름 · 켬/끔 · 순서 · 지우기
//   ② 쓸 수 있는 손님 — 누적 구매 금액 이상(기본 100만원) / 모든 손님 / 직접 넣은 손님만 / 끔
//      + 직접 넣기·막기(손님 찾아서) · 최고 관리자(사장님 지정 번호)·관리자 시험 계정은 늘 됨
//   저장 = /api/admin-live/live-chat-emoji. 주문·돈 무접촉.
import { useCallback, useEffect, useRef, useState } from "react";
import { showAdminConfirm } from "@/lib/adminConfirm";
import { showAdminToast } from "@/lib/adminToast";
import { ChatBodyView, emojiMapOf } from "@/components/customer/ChatBodyView";
import {
  EMOJI_MAX_BYTES,
  EMOJI_MAX_ITEMS,
  EMOJI_PIXELS,
  emojiAccessText,
  isEmojiName,
  type ChatEmoji,
  type ChatEmojiAccess,
  type ChatEmojiPeriod,
  type ChatEmojiSetting,
} from "@/lib/liveChatEmoji";

type Person = { key: string; phone: string; nickname: string; name: string; total: number | null; canUse: boolean; always: boolean; allowed: boolean; denied: boolean };
type State = { setting: ChatEmojiSetting; allow: Person[]; deny: Person[]; owners: Person[]; results: Person[] };

const API = "/api/admin-live/live-chat-emoji";
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 사진 → 채팅 이모티콘 그림.
 *  [06:57 사장님 「글씨가 안 보여, 너무 작아」] ①네 귀퉁이가 흰 바탕이면 바탕만 투명하게(스티커 흰 테두리는 남음)
 *  ②둘레 빈 여백을 잘라 그림이 칸을 꽉 채우게 ③긴 쪽 EMOJI_PIXELS(256) — 가로로 긴 글씨 스티커는 가로로 긴 그대로(최대 3:1).
 *  WEBP 가 되면 WEBP, 아니면 PNG. */
async function shrinkImage(file: File): Promise<Blob> {
  const src: CanvasImageSource & { width: number; height: number } = await (async () => {
    if (typeof createImageBitmap === "function") {
      try { return await createImageBitmap(file); } catch { /* 아래 방법으로 */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  })();
  // 너무 큰 원본은 먼저 긴 쪽 1024 로(계산 빠르게)
  const pre = Math.min(1, 1024 / Math.max(src.width, src.height));
  const W = Math.max(1, Math.round(src.width * pre));
  const H = Math.max(1, Math.round(src.height * pre));
  if (!W || !H) throw new Error("사진을 못 읽었어요.");
  const work = document.createElement("canvas");
  work.width = W;
  work.height = H;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  if (!wctx) throw new Error("사진을 못 줄였어요.");
  wctx.imageSmoothingQuality = "high";
  wctx.drawImage(src, 0, 0, W, H);
  const img = wctx.getImageData(0, 0, W, H);
  const d = img.data;
  // ① 귀퉁이 넷이 모두 거의 흰색(불투명)이면 — 둘레에서 이어진 흰 바탕만 투명하게
  const isWhite = (i: number) => d[i + 3] > 200 && d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240;
  const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + W - 1) * 4];
  if (corners.every(isWhite)) {
    const seen = new Uint8Array(W * H);
    const stack: number[] = [];
    for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
    for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop()!;
      if (seen[p]) continue;
      seen[p] = 1;
      if (!isWhite(p * 4)) continue;
      d[p * 4 + 3] = 0;
      const x = p % W;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (p >= W) stack.push(p - W);
      if (p < W * (H - 1)) stack.push(p + W);
    }
    wctx.putImageData(img, 0, 0);
  }
  // ② 빈 여백 자르기(거의 투명한 곳)
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  let cw = x1 - x0 + 1;
  let chh = y1 - y0 + 1;
  // ③ 너무 가늘고 긴 그림은 3:1 까지만(넘치면 투명 여백으로 채움)
  let outW = cw, outH = chh;
  if (outW > outH * 3) outH = Math.ceil(outW / 3);
  if (outH > outW * 3) outW = Math.ceil(outH / 3);
  const scale = Math.min(1, EMOJI_PIXELS / Math.max(outW, outH));
  const fw = Math.max(1, Math.round(outW * scale));
  const fh = Math.max(1, Math.round(outH * scale));
  // 반씩 줄여 가며(한 번에 줄이면 테두리가 깨짐)
  const dw = Math.max(1, Math.round((x1 - x0 + 1) * scale));
  const dh = Math.max(1, Math.round((y1 - y0 + 1) * scale));
  let cur: CanvasImageSource = work;
  let sx = x0, sy = y0;
  while (cw / 2 > dw && chh / 2 > dh) {
    const c = document.createElement("canvas");
    c.width = Math.round(cw / 2);
    c.height = Math.round(chh / 2);
    const x = c.getContext("2d");
    if (!x) break;
    x.imageSmoothingQuality = "high";
    x.drawImage(cur, sx, sy, cw, chh, 0, 0, c.width, c.height);
    cur = c; sx = 0; sy = 0; cw = c.width; chh = c.height;
  }
  const out = document.createElement("canvas");
  out.width = fw;
  out.height = fh;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("사진을 못 줄였어요.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, sx, sy, cw, chh, Math.round((fw - dw) / 2), Math.round((fh - dh) / 2), dw, dh);
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((res) => out.toBlob(res, type, q));
  let blob = await toBlob("image/webp", 0.92);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/png");
  if (!blob) throw new Error("사진을 못 줄였어요.");
  if (blob.size > EMOJI_MAX_BYTES) throw new Error("줄여도 1MB 가 넘어요.");
  return blob;
}

/** 파일 이름 → 이모티콘 이름 후보(한글이 있을 때만, 아니면 서버가 「이모티콘N」) */
function nameFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return /[가-힣]/.test(base) ? base.replace(/[^0-9A-Za-z_가-힣ㄱ-ㅎㅏ-ㅣ]/g, "").slice(0, 10) : "";
}

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" className="inline-flex flex-wrap rounded-lg bg-surface-2 p-1">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => value !== v && onChange(v)}
          className={`h-8 rounded-lg px-3 text-[13px] font-bold transition disabled:opacity-50 ${value === v ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-mute hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-ink" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function PersonLine({ p }: { p: Person }) {
  return (
    <span className="min-w-0">
      <span className="text-[13px] font-bold text-ink">{p.nickname || "(닉네임 없음)"}</span>
      {p.name ? <span className="ml-1 text-[13px] text-ink-soft">{p.name}</span> : null}
      <span className="ml-1 text-[12px] text-ink-mute">{p.phone}</span>
    </span>
  );
}

export default function ChatEmojiManagerModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: (s: ChatEmojiSetting) => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [amountText, setAmountText] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const apply = useCallback((next: Partial<State> & { setting?: ChatEmojiSetting }) => {
    setSt((prev) => (prev ? { ...prev, ...next } : (next as State)));
    if (next.setting) {
      setNames(Object.fromEntries(next.setting.items.map((e) => [e.id, e.name])));
      setAmountText(next.setting.minAmount.toLocaleString("ko-KR"));
      onChanged?.(next.setting);
      window.dispatchEvent(new Event("ruru-chat-emoji-changed"));
    }
  }, [onChanged]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(API, { cache: "no-store" }).then((res) => res.json());
      if (!r?.ok) { setLoadError(r?.message || "못 불러왔어요."); return; }
      setLoadError("");
      apply({ setting: r.setting, allow: r.allow, deny: r.deny, owners: r.owners, results: [] });
    } catch {
      setLoadError("못 불러왔어요.");
    }
  }, [apply]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const post = async (body: Record<string, unknown>, okText?: string) => {
    setBusy(true);
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((res) => res.json());
      if (!r?.ok) { showAdminToast(r?.message || "저장 못 했어요.", "error"); return null; }
      if (okText) showAdminToast(okText, "success");
      return r;
    } catch {
      showAdminToast("저장 못 했어요.", "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveItems = async (items: ChatEmoji[], okText?: string) => {
    const r = await post({ action: "save", items: items.map((e) => ({ id: e.id, name: e.name, on: e.on })) }, okText);
    if (r) apply({ setting: r.setting });
    else void load();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length || !st) return;
    const list = Array.from(files).slice(0, Math.max(0, EMOJI_MAX_ITEMS - st.setting.items.length));
    if (!list.length) { showAdminToast(`이모티콘은 ${EMOJI_MAX_ITEMS}개까지예요.`, "error"); return; }
    setUploading({ done: 0, total: list.length });
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      try {
        const blob = await shrinkImage(f);
        const fd = new FormData();
        fd.append("file", new File([blob], `emoji.${blob.type === "image/webp" ? "webp" : "png"}`, { type: blob.type }));
        fd.append("name", nameFromFile(f.name));
        const r = await fetch(API, { method: "POST", body: fd }).then((res) => res.json());
        if (!r?.ok) throw new Error(r?.message || "못 올렸어요.");
        apply({ setting: r.setting });
        ok += 1;
      } catch (e) {
        showAdminToast(`${f.name}: ${e instanceof Error ? e.message : "못 올렸어요."}`, "error");
      }
      setUploading({ done: i + 1, total: list.length });
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    if (ok) showAdminToast(`이모티콘 ${ok}개를 올렸어요. 이름을 바꾸려면 이름 칸을 눌러 고치세요.`, "success");
  };

  const commitName = (e: ChatEmoji) => {
    if (!st) return;
    const v = (names[e.id] ?? e.name).trim();
    if (v === e.name) return;
    if (!isEmojiName(v)) { showAdminToast("이름은 한글·영어·숫자 1~10글자예요.", "error"); setNames((n) => ({ ...n, [e.id]: e.name })); return; }
    if (st.setting.items.some((x) => x.id !== e.id && x.name === v)) { showAdminToast("같은 이름이 이미 있어요.", "error"); setNames((n) => ({ ...n, [e.id]: e.name })); return; }
    void saveItems(st.setting.items.map((x) => (x.id === e.id ? { ...x, name: v } : x)), "이름을 바꿨어요.");
  };

  const move = (idx: number, dir: -1 | 1) => {
    if (!st) return;
    const items = [...st.setting.items];
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    setSt({ ...st, setting: { ...st.setting, items } });
    void saveItems(items);
  };

  const remove = async (e: ChatEmoji) => {
    const ok = await showAdminConfirm(`이모티콘 「${e.name}」을 지워요. 이미 보낸 채팅 글에는 「:${e.name}:」 글자로 보여요.`, { title: "이모티콘 지우기", confirmText: "지우기", cancelText: "그만두기", tone: "danger" });
    if (!ok) return;
    const r = await post({ action: "delete", id: e.id }, "지웠어요.");
    if (r) apply({ setting: r.setting });
  };

  const saveRule = async (patch: { access?: ChatEmojiAccess; minAmount?: number; period?: ChatEmojiPeriod }, okText: string) => {
    const r = await post({ action: "save", ...patch }, okText);
    if (r) { apply({ setting: r.setting }); void load(); }
  };

  const search = async () => {
    const term = q.trim();
    if (!term) { setSt((p) => (p ? { ...p, results: [] } : p)); return; }
    setSearching(true);
    try {
      const r = await fetch(`${API}?q=${encodeURIComponent(term)}`, { cache: "no-store" }).then((res) => res.json());
      if (r?.ok) setSt((p) => (p ? { ...p, results: r.results } : p));
      else showAdminToast(r?.message || "못 찾았어요.", "error");
    } finally {
      setSearching(false);
    }
  };

  const setList = async (p: Person, list: "allow" | "deny", add: boolean) => {
    const r = await post({ action: "list", list, key: p.key, add }, add ? (list === "allow" ? `${p.nickname || p.phone}님을 넣었어요.` : `${p.nickname || p.phone}님을 막았어요.`) : "뺐어요.");
    if (r) {
      setSt((prev) => (prev ? { ...prev, allow: r.allow, deny: r.deny, owners: r.owners } : prev));
      if (q.trim()) void search();
    }
  };

  if (!open) return null;
  const s = st?.setting;
  const amountNum = Number(amountText.replace(/[^0-9]/g, "")) || 0;
  const sample = s?.items.find((e) => e.on);

  return (
    <div role="dialog" aria-modal="true" aria-label="채팅 이모티콘" className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[20px] font-bold text-ink">채팅 이모티콘</h2>
            <p className="mt-0.5 text-[13px] text-ink-mute">손님 채팅 입력칸 오른쪽 웃는 얼굴 → 골라서 보내요</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-line px-3 text-[13px] font-bold text-ink hover:bg-surface-2">닫기</button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {loadError ? <div className="text-[13px] text-danger-tx">{loadError}</div> : null}
          {!s ? (!loadError ? <div className="text-[13px] text-ink-mute">불러오는 중…</div> : null) : (
            <>
              {/* 손님 화면에서 보이는 크기 */}
              <div className="rounded-lg bg-[#111111] px-4 py-3 text-[16px] leading-[1.45] text-white">
                <div className="mb-1 text-[12px] text-white/60">손님 화면에 보이는 크기 — 글자와 섞으면 글자 2배 높이, 이모티콘만 보내면 더 크게</div>
                {sample ? (
                  <>
                    <div><span className="font-extrabold text-[#FFD43B]">루루실장</span> <span className="text-[#FFD43B]"><ChatBodyView body={`오늘도 와 주셔서 감사해요 \uE000${sample.id}:${sample.name}\uE001`} emojis={emojiMapOf(s.items)} /></span></div>
                    <div className="mt-1"><span className="mr-2 align-top font-extrabold text-[#FFD43B]">루루실장</span><ChatBodyView body={`\uE000${sample.id}:${sample.name}\uE001`} emojis={emojiMapOf(s.items)} /></div>
                  </>
                ) : <span className="ml-1 text-white/50">(이모티콘을 올리면 여기 보여요)</span>}
              </div>

              {/* ① 이모티콘 */}
              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[16px] font-bold text-ink">이모티콘 <span className="text-ink-mute">{s.items.length}/{EMOJI_MAX_ITEMS}</span></h3>
                  <div className="flex items-center gap-2">
                    {uploading ? <span className="text-[13px] text-ink-mute">올리는 중 {uploading.done}/{uploading.total}</span> : null}
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
                    <button type="button" disabled={Boolean(uploading) || busy} onClick={() => fileRef.current?.click()} className="h-9 rounded-lg bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-40">+ 이모티콘 추가</button>
                  </div>
                </div>
                <p className="mb-3 text-[12px] text-ink-mute">여러 장 한 번에 · 흰 바탕은 투명하게, 둘레 빈 여백은 잘라서 그림이 꽉 차게 · 긴 쪽 {EMOJI_PIXELS}px 로 줄여 저장(한 장 수십 KB)</p>
                {s.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line p-6 text-center text-[13px] text-ink-mute">아직 이모티콘이 없어요. 「+ 이모티콘 추가」로 사진을 올려 주세요.</div>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {s.items.map((e, i) => (
                      <li key={e.id} className={`flex items-center gap-3 px-3 py-2 ${e.on ? "" : "opacity-50"}`}>
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={e.url} alt="" className="h-11 w-11 object-contain" />
                        </span>
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">이름</span>
                          <span className="flex items-center gap-1 text-[13px] text-ink-mute">:
                            <input value={names[e.id] ?? e.name} onChange={(ev) => setNames((n) => ({ ...n, [e.id]: ev.target.value.slice(0, 10) }))} onBlur={() => commitName(e)} onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                              aria-label={`이모티콘 이름 ${e.name}`} className="h-9 w-32 rounded-lg border border-line bg-surface px-2 text-[14px] font-bold text-ink outline-none focus:border-ink" />:
                          </span>
                        </label>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label="위로" className="h-9 w-9 rounded-lg border border-line text-[13px] font-bold text-ink disabled:opacity-30">↑</button>
                          <button type="button" onClick={() => move(i, 1)} disabled={i === s.items.length - 1 || busy} aria-label="아래로" className="h-9 w-9 rounded-lg border border-line text-[13px] font-bold text-ink disabled:opacity-30">↓</button>
                        </div>
                        <Switch on={e.on} disabled={busy} label={`${e.name} 켜기`} onChange={(v) => void saveItems(s.items.map((x) => (x.id === e.id ? { ...x, on: v } : x)), v ? "켰어요." : "껐어요.")} />
                        <button type="button" onClick={() => void remove(e)} disabled={busy} className="h-9 px-2 text-[13px] font-bold text-danger-tx disabled:opacity-40">지우기</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* ② 쓸 수 있는 손님 */}
              <section>
                <h3 className="mb-1 text-[16px] font-bold text-ink">쓸 수 있는 손님</h3>
                <p className="mb-3 text-[13px] text-ink-mute">지금: <b className="text-ink">{emojiAccessText(s)}</b> · 쓸 수 있는 손님만 입력칸에 웃는 얼굴이 보여요</p>
                <Segmented<ChatEmojiAccess>
                  value={s.access}
                  disabled={busy}
                  options={[["amount", "누적 구매 금액"], ["all", "모든 손님"], ["list", "직접 넣은 손님만"], ["off", "최고 관리자만"]] as const}
                  onChange={(v) => void saveRule({ access: v }, "저장했어요.")}
                />
                {s.access === "amount" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input value={amountText} inputMode="numeric" onChange={(e) => { const n = Number(e.target.value.replace(/[^0-9]/g, "")); setAmountText(n ? n.toLocaleString("ko-KR") : ""); }}
                      aria-label="누적 구매 금액" className="h-9 w-36 rounded-lg border border-line bg-surface px-3 text-right text-[14px] font-bold text-ink outline-none focus:border-ink" />
                    <span className="text-[13px] font-bold text-ink">원 이상</span>
                    <Segmented<ChatEmojiPeriod> value={s.period} disabled={busy} options={[["all", "전체 기간"], ["1y", "최근 1년"]] as const} onChange={(v) => void saveRule({ period: v }, "저장했어요.")} />
                    {amountNum !== s.minAmount ? <button type="button" disabled={busy} onClick={() => void saveRule({ minAmount: amountNum }, `${won(amountNum)} 이상으로 저장했어요.`)} className="h-9 rounded-lg bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-40">저장</button> : null}
                  </div>
                ) : null}
                <p className="mt-2 text-[12px] text-ink-mute">누적 구매 = 결제 끝난 주문만(입금확인·카드결제완료·출고) · 취소·테스트 빼고 · 카카오 계정 기준. 바꾼 규칙은 손님 화면에 3분 안에 반영돼요.</p>

                <div className="mt-4 rounded-lg bg-surface-2 p-3">
                  <div className="mb-2 text-[13px] font-bold text-ink">언제나 쓸 수 있음</div>
                  <div className="flex flex-wrap gap-2">
                    {(st?.owners || []).map((p) => (
                      <span key={p.key} className="inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-[13px] text-ink"><PersonLine p={p} /></span>
                    ))}
                    <span className="inline-flex h-8 items-center px-1 text-[12px] text-ink-mute">+ 왕관 표시 관리자 · 관리자 시험 계정</span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-[13px] font-bold text-ink">직접 넣은 손님 <span className="text-ink-mute">{st?.allow.length ?? 0}명 · 금액이 안 돼도 씀</span></div>
                  <div className="flex flex-wrap gap-2">
                    {(st?.allow || []).length === 0 ? <span className="text-[13px] text-ink-mute">없음</span> : null}
                    {(st?.allow || []).map((p) => (
                      <span key={p.key} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-[13px]">
                        <PersonLine p={p} />
                        <button type="button" onClick={() => void setList(p, "allow", false)} aria-label={`${p.nickname} 빼기`} className="ml-1 h-6 w-6 rounded-full text-ink-mute hover:bg-surface-2 hover:text-ink">✕</button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-2 text-[13px] font-bold text-ink">막은 손님 <span className="text-ink-mute">{st?.deny.length ?? 0}명 · 금액이 넘어도 못 씀</span></div>
                  <div className="flex flex-wrap gap-2">
                    {(st?.deny || []).length === 0 ? <span className="text-[13px] text-ink-mute">없음</span> : null}
                    {(st?.deny || []).map((p) => (
                      <span key={p.key} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-[13px]">
                        <PersonLine p={p} />
                        <button type="button" onClick={() => void setList(p, "deny", false)} aria-label={`${p.nickname} 막기 풀기`} className="ml-1 h-6 w-6 rounded-full text-ink-mute hover:bg-surface-2 hover:text-ink">✕</button>
                      </span>
                    ))}
                  </div>
                </div>

                <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="손님 찾기 — 닉네임·이름·전화 뒤 4자리" aria-label="손님 찾기" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-ink" />
                  <button type="submit" disabled={searching} className="h-9 rounded-lg border border-line px-4 text-[13px] font-bold text-ink hover:bg-surface-2 disabled:opacity-40">{searching ? "찾는 중" : "찾기"}</button>
                </form>
                {(st?.results || []).length > 0 ? (
                  <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                    {(st?.results || []).map((p) => (
                      <li key={p.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <PersonLine p={p} />
                          <span className="block text-[12px] text-ink-mute">누적 구매 {p.total == null ? "확인 못 함" : won(p.total)}{s.period === "1y" ? " (최근 1년)" : ""}</span>
                        </span>
                        <span className={`inline-flex h-6 items-center rounded-full px-2 text-[12px] font-bold ${p.canUse ? "bg-ok-bg text-ok-tx" : "bg-surface-2 text-ink-mute"}`}>{p.always ? "언제나 씀" : p.canUse ? "쓸 수 있음" : "못 씀"}</span>
                        {p.always ? null : (
                          <>
                            <button type="button" disabled={busy} onClick={() => void setList(p, "allow", !p.allowed)} className={`h-8 rounded-lg px-3 text-[13px] font-bold disabled:opacity-40 ${p.allowed ? "border border-line text-ink" : "bg-ink text-white"}`}>{p.allowed ? "넣기 취소" : "넣기"}</button>
                            <button type="button" disabled={busy} onClick={() => void setList(p, "deny", !p.denied)} className="h-8 rounded-lg px-2 text-[13px] font-bold text-danger-tx disabled:opacity-40">{p.denied ? "막기 풀기" : "막기"}</button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
