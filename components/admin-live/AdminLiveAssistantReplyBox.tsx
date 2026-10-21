"use client";

// [2026-10-22 AI 비서 4단계] 응대 문구 — 손님 말 붙여넣기 + 캡처 사진(최대 10장: 「+」·끌어다 놓기·Ctrl+V) → 요약 + 답장 2~3안 [복사].
//   사진 속 개인정보는 보내기 전에 «브라우저 안에서» 글자를 읽어(tesseract.js, 무료) 전화·계좌·주소를 검게 가린다(lib/imagePrivacyMask).
//   원본 사진은 사장님 컴퓨터 밖으로 안 나간다. 이름·닉네임은 못 가리니 화면에 안내.
//   응대 방침은 아래 접힌 칸에서 고쳐 「방침 저장」. 보내기는 사장님이 복사해서 직접.
//   DESIGN-ADMIN: 주버튼 1개(「문구 만들기」) · 보조 36 · 이모지 없음 · 설명 한 줄.

import { useEffect, useRef, useState, type DragEvent, type ClipboardEvent } from "react";
import { mergeAdjacentNumberWords, pickMaskBoxes, type OcrWord } from "@/lib/imagePrivacyMask";

type Draft = { label: string; text: string };
type ReplyResult = { summary: string; category: string; drafts: Draft[] };
type Img = { key: string; name: string; mimeType: string; data: string; preview: string; masked: number; status: "ocr" | "ready" | "nomask" };

const MAX_IMAGES = 10;
const MAX_EDGE = 1280;

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("사진을 열 수 없어요."));
      el.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// 글자 인식기는 한 번만 만들어 재사용(한국어+영어 모델은 처음 한 번 내려받고 브라우저가 기억)
let ocrWorkerPromise: Promise<import("tesseract.js").Worker> | null = null;
async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker(["kor", "eng"]);
    })();
  }
  return ocrWorkerPromise;
}

/** 사진 → 줄이고 → 글자 읽고 → 개인정보 상자 검게 → base64 */
async function prepareImage(file: File, onStage: (s: Img["status"]) => void): Promise<Omit<Img, "key" | "name">> {
  const canvas = toCanvas(await loadImage(file));
  let masked = 0;
  let status: Img["status"] = "ready";
  try {
    onStage("ocr");
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const words: OcrWord[] = [];
    let lineNo = 0;
    for (const block of data.blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) {
      lineNo += 1;
      for (const w of line.words || []) {
        if (!w.text?.trim()) continue;
        words.push({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, line: lineNo });
      }
    }
    const boxes = pickMaskBoxes(mergeAdjacentNumberWords(words));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#111111";
      for (const b of boxes) ctx.fillRect(b.x0 - 3, b.y0 - 3, b.x1 - b.x0 + 6, b.y1 - b.y0 + 6);
    }
    masked = boxes.length;
  } catch {
    status = "nomask"; // 글자 인식이 안 되면 가리지 못했다고 표시(보내기 전에 사장님이 판단)
  }
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mimeType: "image/jpeg", data: dataUrl.split(",")[1] || "", preview: dataUrl, masked, status };
}

export default function AdminLiveAssistantReplyBox() {
  const [text, setText] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReplyResult | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [policyOpen, setPolicyOpen] = useState(false);
  const [policy, setPolicy] = useState("");
  const [defaultPolicy, setDefaultPolicy] = useState("");
  const [policySaved, setPolicySaved] = useState("");
  const [policyNote, setPolicyNote] = useState("");

  useEffect(() => {
    void fetch("/api/admin-live/assistant-reply", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) { setPolicy(d.policy); setPolicySaved(d.policy); setDefaultPolicy(d.defaultPolicy); } })
      .catch(() => {});
  }, []);

  async function addFiles(files: FileList | File[] | null | undefined) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setError("");
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { setError(`사진은 한 번에 ${MAX_IMAGES}장까지예요.`); return; }
    const picked = list.slice(0, room);
    if (list.length > room) setError(`사진은 한 번에 ${MAX_IMAGES}장까지예요. 앞 ${room}장만 넣었어요.`);
    for (const file of picked) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setImages((prev) => [...prev, { key, name: file.name, mimeType: "", data: "", preview: "", masked: 0, status: "ocr" }]);
      try {
        const done = await prepareImage(file, () => {});
        setImages((prev) => prev.map((im) => (im.key === key ? { ...im, ...done } : im)));
      } catch (e) {
        setImages((prev) => prev.filter((im) => im.key !== key));
        setError(e instanceof Error ? e.message : "사진을 열 수 없어요.");
      }
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    void addFiles(e.dataTransfer.files);
  }
  function onPaste(e: ClipboardEvent<HTMLElement>) {
    const files = Array.from(e.clipboardData?.items || []).filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean) as File[];
    if (files.length > 0) { e.preventDefault(); void addFiles(files); }
  }

  const ready = images.filter((im) => im.data);
  const preparing = images.some((im) => !im.data);

  async function make() {
    if (busy || preparing || (!text.trim() && ready.length === 0)) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin-live/assistant-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, images: ready.map((im) => ({ mimeType: im.mimeType, data: im.data })) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { setError(data?.message || "문구를 못 만들었어요. 잠시 뒤 다시 눌러 주세요."); return; }
      setResult({ summary: data.summary, category: data.category, drafts: data.drafts || [] });
    } catch {
      setError("연결이 끊겼어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(i: number, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(i); setTimeout(() => setCopied(null), 1500); } catch { setError("복사하지 못했어요. 글자를 길게 눌러 복사해 주세요."); }
  }

  async function savePolicy() {
    setPolicyNote("");
    const res = await fetch("/api/admin-live/assistant-reply", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res || !res.ok || !data?.ok) { setPolicyNote(data?.message || "저장하지 못했어요."); return; }
    setPolicySaved(policy);
    setPolicyNote("저장했어요.");
  }

  const totalMasked = ready.reduce((s, im) => s + im.masked, 0);
  const unmaskable = ready.filter((im) => im.status === "nomask").length;

  return (
    <div className="space-y-3" onPaste={onPaste}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        aria-label="손님이 보낸 말"
        placeholder="손님이 보낸 카톡·댓글을 붙여넣어 주세요. 캡처 사진은 아래 「+」나 끌어다 놓기, Ctrl+V 로도 넣을 수 있어요."
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[16px] text-ink outline-none placeholder:text-ink-mute focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink md:text-[14px]"
      />

      {/* 사진 칸: 「+」 + 끌어다 놓기 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border p-2 transition ${dragOver ? "border-ink bg-surface-2" : "border-dashed border-line bg-surface"}`}
        aria-label="사진 넣는 곳"
      >
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex flex-wrap gap-2">
          {images.map((im, idx) => (
            <div key={im.key} className="relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface-2">
              {im.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={im.preview} alt={`사진 ${idx + 1}`} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[12px] text-ink-mute">글자 읽는 중</span>
              )}
              {im.data ? (
                <span className={`absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[11px] font-semibold ${im.status === "nomask" ? "bg-warn-bg text-warn-tx" : "bg-ink/80 text-white"}`}>
                  {im.status === "nomask" ? "못 가림" : `${im.masked}곳 가림`}
                </span>
              ) : null}
              <button type="button" aria-label={`사진 ${idx + 1} 빼기`} onClick={() => setImages((prev) => prev.filter((x) => x.key !== im.key))}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-[12px] font-bold text-white">✕</button>
            </div>
          ))}
          {images.length < MAX_IMAGES ? (
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="사진 추가"
              className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition hover:bg-surface-2">
              <span className="text-[22px] leading-none">+</span>
              <span className="mt-1 text-[11px] font-semibold">{images.length}/{MAX_IMAGES}</span>
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[12px] text-ink-mute">
          {ready.length > 0
            ? `전화·계좌·주소 ${totalMasked}곳을 검게 가렸어요. 이름·닉네임은 못 가려요.${unmaskable ? ` ${unmaskable}장은 글자를 못 읽어 못 가렸어요.` : ""}`
            : "사진 속 전화·계좌·주소는 보내기 전에 여기서 자동으로 가려요(처음 한 번은 글자 인식 파일을 내려받아요)."}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => void make()} disabled={busy || preparing || (!text.trim() && ready.length === 0)}
          className="h-10 shrink-0 rounded-lg bg-ink px-4 text-[14px] font-bold text-white transition disabled:opacity-40">
          {busy ? "만드는 중" : preparing ? "사진 준비 중" : "문구 만들기"}
        </button>
      </div>

      {error ? <p className="text-[13px] font-semibold text-danger-tx">{error}</p> : null}

      {result ? (
        <section className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="inline-flex h-6 shrink-0 items-center rounded-lg bg-surface-2 px-2 text-[12px] font-semibold text-ink-soft">{result.category}</span>
            <p className="text-[14px] font-semibold text-ink">{result.summary}</p>
          </div>
          {result.drafts.map((d, i) => (
            <article key={i} className="space-y-2 rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[13px] font-bold text-ink-soft">{d.label}</h4>
                <button type="button" onClick={() => void copy(i, d.text)}
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-surface-2">
                  {copied === i ? "복사됨" : "복사"}
                </button>
              </div>
              <p className="whitespace-pre-wrap break-words text-[14px] text-ink">{d.text}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="border-t border-line pt-3">
        <button type="button" onClick={() => setPolicyOpen((v) => !v)} className="h-9 rounded-lg px-1 text-[13px] font-semibold text-ink-soft hover:text-ink">
          응대 방침 · {policyOpen ? "닫기" : "열기"}
        </button>
        {policyOpen ? (
          <div className="mt-2 space-y-2">
            <p className="text-[12px] text-ink-mute">말투·교환반품 규칙·금지 표현. 문구를 만들 때 이대로 지켜요.</p>
            <textarea
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              rows={12}
              aria-label="응대 방침"
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[16px] leading-relaxed text-ink outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink md:text-[13px]"
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void savePolicy()} disabled={!policy.trim() || policy === policySaved}
                className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-40">
                방침 저장
              </button>
              {defaultPolicy && policy !== defaultPolicy ? (
                <button type="button" onClick={() => setPolicy(defaultPolicy)} className="h-9 rounded-lg px-2 text-[13px] font-semibold text-ink-mute hover:bg-surface-2">
                  기본으로
                </button>
              ) : null}
              {policyNote ? <span className="text-[13px] text-ink-soft">{policyNote}</span> : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
