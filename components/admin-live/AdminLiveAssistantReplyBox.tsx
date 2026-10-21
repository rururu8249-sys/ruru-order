"use client";

// [2026-10-22 AI 비서 4단계] 응대 문구 — 손님 말 붙여넣기(또는 카톡 캡처 사진) → 요약 + 답장 2~3안 [복사].
//   응대 방침은 아래 접힌 칸에서 고쳐 「방침 저장」(서버 전용 저장). 보내기는 사장님이 복사해서 직접.
//   DESIGN-ADMIN: 주버튼 1개(「문구 만들기」) · 보조 36 · 이모지 없음 · 설명 한 줄.

import { useEffect, useRef, useState } from "react";

type Draft = { label: string; text: string };
type ReplyResult = { summary: string; category: string; drafts: Draft[] };

/** 사진을 긴 변 1280px JPEG 로 줄여 base64 로 (Google 로 보내는 양 줄이기) */
async function shrinkImage(file: File): Promise<{ mimeType: string; data: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("사진을 열 수 없어요."));
      el.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { mimeType: "image/jpeg", data: dataUrl.split(",")[1] || "", preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AdminLiveAssistantReplyBox() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ mimeType: string; data: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReplyResult | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
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

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    try { setImage(await shrinkImage(file)); } catch (e) { setError(e instanceof Error ? e.message : "사진을 열 수 없어요."); }
  }

  async function make() {
    if (busy || (!text.trim() && !image)) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin-live/assistant-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, image: image ? { mimeType: image.mimeType, data: image.data } : undefined }),
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

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        aria-label="손님이 보낸 말"
        placeholder="손님이 보낸 카톡·댓글을 붙여넣어 주세요"
        className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[16px] text-ink outline-none placeholder:text-ink-mute focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink md:text-[14px]"
      />

      {image ? (
        <div className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.preview} alt="고른 사진" className="h-20 w-20 rounded-lg border border-line object-cover" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[12px] text-warn-tx">사진도 Google 로 보내져요. 전화·주소가 보이면 가린 사진으로 골라 주세요.</p>
            <button type="button" onClick={() => setImage(null)} className="h-9 rounded-lg px-2 text-[13px] font-semibold text-ink-soft hover:bg-surface-2">사진 빼기</button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-surface-2">
            사진 고르기
          </button>
        </div>
        <button type="button" onClick={() => void make()} disabled={busy || (!text.trim() && !image)}
          className="h-10 shrink-0 rounded-lg bg-ink px-4 text-[14px] font-bold text-white transition disabled:opacity-40">
          {busy ? "만드는 중" : "문구 만들기"}
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
